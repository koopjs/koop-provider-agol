// Clean shutdown logic
var jobs = {}
process.once('SIGTERM', function () {
  Object.keys(jobs).forEach(function (job) {
    jobs[job].abort(new Error('SIGTERM'))
  })
})

var ImportService = require('./import-service.js')
var config = require('config')
var async = require('async')
var Exporter = require('../models/exporter')

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
  this.waitedForFile = 0
  this.exporter = new Exporter({
    cache: this.cache,
    log: this.log,
    queue: options.queue
  })
  this.jobs = {
    importService: {
      // plugins: [require('./queue-lock.js').queueLock],
      perform: function (job, callback) {
        self.job = job
        self.importService(job, callback)
      }
    }
  }
  if (options.connection) this.connection = options.connection
  if (options.connection) this.connection.pkg = 'redis'
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
  // handle controlled failures differently from exceptions
  .on('fail', function (error) {
    importService.removeAllListeners()
    delete jobs[importService.initiated]
    importService._fail(error)
    callback()
  })
  .on('error', function (error) {
    importService.removeAllListeners()
    delete jobs[importService.initiated]
    if (error.message !== 'SIGTERM') importService._fail(error)
    callback(error)
  })
  .on('progress', function (count) {
    self.cache.getInfo(key, function (err, info) {
      if (err && err.message === 'Resource not found') {
        importService.removeAllListeners()
        var error = new Error('Info doc is not in the database during import job')
        importService._fail('error', error)
        return callback(error)
      } else if (err) {
        return self.log.error(err)
      }
      info.importCount = count
      self.updateQueue.push({key: key, info: info, cache: self.cache, progress: true, done: self.done}, function (err) {
        if (err) self.log.error(err)
      })
    })
  })
  .on('done', function (result) {
    importService.removeAllListeners()
    self.done = true
    delete jobs[importService.initiated]
    self.updateQueue.push({key: key, info: result.info, cache: self.cache}, function (err) {
      if (err) return callback(err)
      if (result.updated && config.api) self.enqueueExports(result)
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

// Have to wait for the correct file to be present
Work.prototype.enqueueExports = function (options) {
  var self = this
  self.log.debug('Checking if file is ready before enqueing exports', options.file)
  fileReady(self.files, options.file, options.start, function (err) {
    if (err) {
      setTimeout(function () {
        self.log.debug('File not ready, waiting before enqueing exports', options.file)
        if (self.waitedForFile > 20) return self.log.error('File not available, not enqueing exports', options.file)
        self.enqueueExports(options)
        self.waitedForFile++
      }, 3000)
    } else {
      self.exporter.bulk({}, [{
        item: options.item,
        layer: options.layer,
        formats: ['kml', 'csv', 'geohash', 'zip']
      }], function (err) {
        if (err) self.log.error(err)
      })
    }
  })
}

function fileReady (fs, filePath, start, callback) {
  fs.stat(filePath, function (err, stat) {
    if (err) callback(err, false)
    else if (startTime(stat) < new Date(start)) callback(err, false)
    else callback(null, true)
  })
}

function startTime (stat) {
  return new Date(stat.Metadata.upload_start || stat.mtime)
}

module.exports = Work
