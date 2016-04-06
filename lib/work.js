var ImportService = require('./import-service.js')
var request = require('request')
var config = require('config')
var async = require('async')
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
    files: this.files,
    expires: job.expires
  }

  var key = 'agol:' + job.item + ':' + job.layer

  var importService = new ImportService(options)
  jobs[importService.initiated] = importService
  importService
  .on('error', function (error) {
    delete jobs[importService.initiated]
    if (error.message !== 'SIGTERM') importService._fail(error)
    callback(error)
  })
  .on('progress', function (count) {
    self.cache.getInfo(key, function (err, info) {
      if (err && err.message === 'Resource not found') return importService._fail('error', new Error('Info doc is not in the database'))
      else if (err) return self.log.error(err)
      info.importCount = count
      self.updateQueue.push({key: key, info: info, cache: self.cache, progress: true, done: self.done}, function (err) {
        if (err) self.log.error(err)
      })
    })
  })
  .on('done', function (result) {
    self.done = true
    delete jobs[importService.initiated]
    self.updateQueue.push({key: key, info: result.info, cache: self.cache}, function (err) {
      if (err) return callback(err)
      if (result.updated && config.api) enqueueExports(job, self.log)
      callback()
    })
  })
  .run()
}

Work.prototype.updateQueue = async.queue(function (payload, callback) {
  // Hack to ensure that progress reporting does not overwrite a done call
  if (payload.done && payload.progress) return callback()
  payload.cache.updateInfo(payload.key, payload.info, callback)
}, 1)

process.once('SIGTERM', function () {
  Object.keys(jobs).forEach(function (job) {
    jobs[job].abort(new Error('SIGTERM'))
  })
})

function enqueueExports (job, log) {
  log.debug('Enqueing exports', job)
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
