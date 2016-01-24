var ImportService = require('./import-service.js')

/**
 * @class
 * Base class for all jobs
 *
 * @param {object} options - object for passing in a cache, logger and redis connect info
 */
function Work (options) {
  var self = this
  this.cache = options.cache
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
  // don't modify job, it gets used internally by node-resque
  var options = {
    item: job.item,
    layer: job.layer,
    pages: job.pages,
    key: job.key,
    log: this.log,
    cache: this.cache,
    server: job.server,
    fields: job.fields,
    geomType: job.geomType
  }
  var importService = new ImportService(options)
  importService
  .on('error', function (error) {
    importService._fail(error)
    callback(error)
  })
  .on('done', function () {
    callback()
  })
  .run()
}

module.exports = Work
