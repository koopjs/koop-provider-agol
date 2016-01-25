var esriToGeojson = require('koop/lib').GeoJSON.fromEsri
var EventEmitter = require('events').EventEmitter
var Utils = require('./utils.js')
var util = require('util')

/**
 * @class
 * Constructor for the Import Service class
 * Import service takes in all the features from a remote service
 *
 * @param {object} options - helpers and parameters for the import job
 */
function ImportService (options) {
  var self = this
  self.item = options.item
  self.layer = options.layer
  self.pages = options.pages
  self.key = options.key
  self.log = options.log
  self.cache = options.cache
  self.fields = options.fields
  self.failed = false
  self.featureService = Utils.initFeatureService(options.server, {
    layer: options.layer,
    logger: options.log,
    geomType: options.geomType
  })
  self.featureService.pageQueue.drain = function () {
    if (!self.failed) self._completeJob()
  }
}

util.inherits(ImportService, EventEmitter)

/**
 * Kicks of a job that imports a service's features into the cache
 */
ImportService.prototype.run = function () {
  // the binding below is necessary because _handlePage is called from inside the queue object
  this.featureService.pageQueue.push(this.pages, this._handlePage.bind(this))
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
  if (error || !json) return self.emit('error', error || new Error('Error retriving features'))
  if (!json.features || !json.features.length || !json.features.length > 0) return
  esriToGeojson(self.fields, json, function (err, geojson) {
    if (err) return self.emit('error', new Error('Error translating features to geojson'))
    self.cache.insertPartial(self.item, self.layer, geojson, function (err) {
      if (err) {
        var error = new Error('Error inserting rows into the db')
        error.type = 'db'
        self.emit('error', error)
      }
    })
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
  self.cache.getInfo(self.key, function (err, info) {
    // TODO do I want to throw an error here?
    if (err) return self.emit('error', err)
    info.status = 'Cached'
    info.retrieved_at = Date.now()
    self.cache.updateInfo(self.key, info, function () {
      self.emit('done')
      self._addIndexes()
    })
  })
}

/**
 * Adds indexes to the table
 */
ImportService.prototype._addIndexes = function () {
  var self = this
  self.cache.addIndexes(self.key, {geohash: true, geometry: true}, function (err) {
    if (err) return self.log.error(err)
    self.cache.getInfo(self.key, function (err, info) {
      if (err) return self.log.error(err)
      info._indexGeohash = true
      info._indexGeometry = true
      self.cache.updateInfo(self.key, info, function (err) {
        if (err) self.log.error(err)
      })
    })
  })
}

module.exports = ImportService
