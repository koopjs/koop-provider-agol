var ImportService = require('./import-service.js')
var request = require('request')
var config = require('config')
var jobs = {}

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
  if (options.connection) this.connection = options.connection
  this.exportQueue = options.exportQueue
}

/*
 * This job makes the request to the feature service and inserts the Features
 *
 * @param {object} job - job to be passed through to the import service class
 * @param {function} callback - callback for when the job completes
 */
Work.prototype.importService = function (job, callback) {
  // don't modify job, it gets used internally by node-resque
  var self = this
  var options = {
    item: job.item,
    layer: job.layer,
    log: this.log,
    cache: this.cache,
    server: job.server,
    itemTitle: job.itemTitle,
    files: this.files,
    expires: job.expires
  }

  var importService = new ImportService(options)
  jobs[importService.initiated] = importService
  importService
  .on('error', function (error) {
    delete jobs[importService.initiated]
    if (error.message !== 'SIGTERM') importService._fail(error)
    callback(error)
  })
  .on('done', function (updated) {
    delete jobs[importService.initiated]
    if (updated && config.api) enqueueExports(job, self.log)
    callback()
  })
  .run()
}

process.once('SIGTERM', function () {
  Object.keys(jobs).forEach(function (job) {
    jobs[job].abort(new Error('SIGTERM'))
  })
})

function enqueueExports (job, log) {
  request({
    url: [config.api, '/agol/', job.hostId, '/bulk/export'].join(''),
    method: 'post',
    body: JSON.stringify([job]),
    headers: {
      'content-type': 'application/json'
    }
  })
  .on('error', function (error) { log.error(error) })
}

module.exports = Work
