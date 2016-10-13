var esriToGeojson = require('esri-to-geojson').fromEsri
var EventEmitter = require('events').EventEmitter
var Utils = require('./utils.js')
var util = require('util')
var _ = require('highland')
var path = require('path')
var crypto = require('crypto')
var config = require('config')

/**
 * @class
 * Constructor for the Import Service class
 * Import service takes in all the features from a remote service
 *
 * @param {object} options - helpers and parameters for the import job
 */
function ImportService (options) {
  var self = this
  self.initiated = Date.now()
  self.item = options.item
  self.layer = options.layer
  self.log = options.log
  self.server = options.server
  self.key = 'agol:' + self.item + ':' + self.layer
  self.cache = options.cache
  self.failed = false
  self.files = options.files
  self.writeToDb = config.db.store
  self.expires = options.expires
  self.count = 0
  self.start = Date.now()
  self.featureService = Utils.initFeatureService(options.server, { layer: self.layer })
  self.featureService.pageQueue.drain = function () {
    if (!self.failed) self._completeJob()
  }
}

util.inherits(ImportService, EventEmitter)

/**
 * Kicks of a job that imports a service's features into the cache
 */
ImportService.prototype.run = function () {
  var self = this
  self.featureService.info(function (err, fsInfo) {
    if (err) return self.emit('fail', err)
    self.fsInfo = fsInfo
    self.featureService.pages(function (err, pages) {
      if (err) return self.emit('fail', err)
      if (pages.length < 1) return self.emit('fail', new Error('Service has nothing to page over'))
      self.pageCount = pages.length
      self._prepareFc()
      var layerInfo = self.featureService.layerInfo() || {}
      self.fields = layerInfo.fields
      // the binding below is necessary because _handlePage is called from inside the queue object
      self.featureService.pageQueue.push(pages, self._handlePage.bind(self))
    })
  })
}

/**
 * Abort the current job and send it to the failed queue
 */
ImportService.prototype.abort = function (error) {
  var self = this
  self.emit('error', error)
  self.featureService.pageQueue.kill()
  if (self.upload) self.upload.abort()
  // turn the page handler into a noop so no more CPU is used
  self._handlePage = function () {}
  if (self.writeToDb) {
    self.cache.drop(self.item, self.layer, null, function (err) {
      if (err) self.log.error(err)
    })
  }
}

ImportService.prototype._prepareFc = function () {
  var self = this
  var filePath = Utils.createFilePath('full', {item: self.item, layer: self.layer})
  var uploadPath = path.join(filePath, self.item + '_' + self.layer + '.geojson')
  var upload = self.upload = self.files.createWriteStream(uploadPath, {ContentType: 'application/json'})
  self.upload.write('{"type":"FeatureCollection","features":[')
  self.featureCollection = _()
  self.featureCollection
  .fork()
  .intersperse(',')
  .on('data', function (data) { upload.write(data) })
  // if we don't call write directly
  // when we call featureCollection.end()
  // it will try to write to upload after we have ended it on our own terms

  self.sha = crypto.createHash('sha1')
  self.featureCollection
  .fork()
  .each(function (chunk) {
    try {
      self.sha.update(chunk)
    } catch (e) {
      self.log.error(e)
    }
  })
}

/**
 * Handles a page as it returns from the feature service queue
 *
 * @param {object} error - an error returned from the page job
 * @param {object} json - a page of json returned from the service
 * @private
 */
ImportService.prototype._handlePage = function (error, json) {
  var self = this
  if (error || !json) return self.emit('fail', error || new Error('Error retreiving features'))
  self.pageCount--
  if (!json.features || !json.features.length || !json.features.length > 0) return
  self.count += json.features.length
  self.emit('progress', self.count)
  var geojson
  try {
    geojson = esriToGeojson(json, self.fields)
  } catch (e) {
    return self.emit('error', new Error('Error translating features to geojson'))
  }
  var featureString = JSON.stringify(geojson.features).slice(1, -1)
  self.featureCollection.write(featureString)
  if (self.writeToDb) self._insertIntoDb(geojson)
  self.log.debug({table: self.key, pagesRemaining: self.pageCount})
}

ImportService.prototype._insertIntoDb = function (geojson) {
  var self = this
  self.cache.insertPartial(self.item, self.layer, geojson, function (err) {
    if (err) {
      var error = new Error('Error inserting rows into the db')
      error.type = 'db'
      self.emit('error', error)
    }
  })
}

/**
 * Sets a dataset to failed and ends the paging
 *
 * @param {object} error - the error that caused the paging job to fail
 * @param {function} callback - executes passed in callback
 * @private
 */
ImportService.prototype._fail = function (error) {
  var self = this
  self.failed = true
  self.featureService.pageQueue.kill()
  if (self.upload) self.upload.abort()
  // if the job failure occured while trying to insert into the database it was probably because the data was dropped
  // so we don't set anything to the db
  if (error.type === 'db') return
  self.cache.setFail(self.key, error, function (err) {
    if (err) self.log.error(err)
  })
}

/**
 * Updates a dataset to status: Cached
 *
 * @private
 */
ImportService.prototype._completeJob = function () {
  var self = this
  var layerInfo = self.featureService.layerInfo()
  // we have to write this directly onto the end because of a bug
  // I think it involved short and fat datasets
  // really should have left better notes for myself
  self.upload.end(']}')
  self.featureCollection.end()
  self.upload.on('finish', function () {
    self.cache.getInfo(self.key, function (err, info) {
      if (err) return self.emit('error', err)
      info.status = 'Cached'
      info.version = 3
      // use item_title if itemTitle isn't there to maintain backwards compatibility
      info.name = Utils.createName({ title: info.itemTitle || info.item_title, url: self.server }, self.fsInfo, self.layer)
      info.fields = layerInfo.fields
      info.geomType = Utils.geomTypes[layerInfo.geomType]
      if (layerInfo.editingInfo) info.lastEditDate = layerInfo.editingInfo.lastEditDate
      // TODO V4 change to retrieved/expired
      info.expires_at = self.expires
      info.failedLastImport = false
      info.lastImportTime = (Date.now() - self.start) / 1000
      info.lastImportCompleted = Date.now()
      info.recordCount = self.count

      var hash = self.sha.digest('hex')
      var updated = (info.sha1 !== hash) || info.itemDirty
      info.sha1 = hash
      if (updated) info.retrieved_at = self.start

      delete info.itemDirty
      delete info.importCount
      delete info.importEnqueued
      self.emit('done', {updated: updated, info: info})
    })
  })
}

module.exports = ImportService
