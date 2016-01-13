var Work = require('./work.js')
var Utils = require('./utils.js')
var util = require('util')

/**
 * @class
 *
 * Constructor for the FeatureRequest object, exposes one function that submits a request for esri features
 * @param {string} service - the url of a feature service
 * @param {object} options - includes helpers and other options to init the service
 */
function FeatureRequest (service, options) {
  this.log = options.log
  this.db = options.db
  this.queue = options.queue
  this.cache = options.cache
  this.item = options.item
  this.layer = options.layer
  this.fields = options.fields || []
  this.key = ['agol', options.item, options.layer].join(':')
  this.featureService = Utils.initFeatureService(service, {
    log: this.log,
    layer: this.layer,
    geomType: options.geomType
  })
  // Mapping between Esri geomTypes and GeoJSON types
  this.geomTypes = {
    'esriGeometryPolygon': 'Polygon',
    'esriGeometryPoint': 'Point',
    'esriGeometryPolyLine': 'LineString'
  }
}

/**
 * Get the pages needed to extract all features and places the request on the queue
 *
 * @param {function} callback - calls back with an error or an indication that the job was accepted
 */
FeatureRequest.prototype.submit = function (callback) {
  var self = this
  self.featureService.pages(function (error, pages) {
    if (error) {
      self.log.error(util.inspect(error))
      self.cache.setFail(self.key, error, function (err) {
        if (err) self.log.error(err)
        callback(error)
      })
    } else {
      callback(null, {status: 'Processing'})
      self._enqueue(pages)
    }
  })
}

/**
 * Actually enqueues the job or sets it up for async local processing
 *
 * @param {array} pages - all the http pages needed for extracting features
 * @private
 */
FeatureRequest.prototype._enqueue = function (pages) {
  var job = {
    service: this.featureService.url,
    item: this.item,
    layer: this.layer,
    pages: pages,
    fields: this.fields,
    key: this.key
  }
  if (this.queue) {
    this.queue.enqueue('agol', 'importService', [job])
  } else {
    this._doLocal(job)
  }
}

/**
 * Handles the job locally if there is no queue
 *
 * @param {object} job - options needed to get all the features
 * @private
 */
FeatureRequest.prototype._doLocal = function (job) {
  var work = new Work({log: this.log, cache: this.cache})

  work.importService(job, function (err) {
    if (err) this.log.error(err)
  })
}

module.exports = FeatureRequest
