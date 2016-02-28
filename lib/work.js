var ImportService = require('./import-service.js')
var Utils = require('./utils')
var highland = require('highland')

/**
 * @class
 * Base class for all jobs
 *
 * @param {object} options - object for passing in a cache, logger and redis connect info
 */
function Work (options) {
  var self = this
  this.cache = options.cache
  this.files = options.files
  this.log = options.log
  this.jobs = {
    importService: {
      plugins: [require('./queue-lock.js').queueLock],
      perform: function (job, callback) {
        self.importService(job, callback)
      }
    }
  }
  if (options.connection) {
    this.connection = options.connection
  }
}

/*
 * This job makes the request to the feature service and inserts the Features
 *
 * @param {object} job - job to be passed through to the import service class
 * @param {function} callback - callback for when the job completes
 */
Work.prototype.importService = function (job, callback) {
  var self = this
  // don't modify job, it gets used internally by node-resque
  var options = {
    item: job.item,
    layer: job.layer,
    log: this.log,
    cache: this.cache,
    server: job.server
  }
  self.first = true
  var filePath = Utils.createFilePath('full', {item: job.item, layer: job.layer})
  var upload = self.files.createWriteStream(filePath + '/' + job.tableName + '.geojson')
  upload.write('{"type":"FeatureCollection","features":[')
  var importService = new ImportService(options)
  importService
  .on('error', function (error) {
    importService._fail(error)
    upload.end()
    callback(error)
  })
  .on('features', function (data) {
    var featureString = JSON.stringify(data.features).slice(1, -1)
    var part = self.first ? featureString : ',' + featureString
    self.first = false
    upload.write(part)
  })
  .on('done', function () {
    upload.write(']}')
    // end of stream marker
    upload.write(highland.nil)
    callback()
  })
  .run()
}

module.exports = Work
