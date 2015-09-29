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
      perform: function (pages, callback) {
        self.importService(pages, callback)
      }
    }
  }
  if (options.redis) {
    this.connection = {
      package: 'ioredis',
      host: options.redis.host,
      port: options.redis.port,
      database: options.redis.database || 0,
      namespace: options.redis.prefix
    }
  }
}

/*
 * This job makes the request to the feature service and inserts the Features
 *
 * @param {object} options - options to be passed through to the import service class
 * @param {function} callback - callback for when the job completes
 */
Work.prototype.importService = function (options, callback) {
  options.log = this.log
  options.cache = this.cache
  var importService = new ImportService(options)
  importService.on('error', function (error) {
    importService.failed++
    // this guard prevents the callback from being triggered multiple times
    if (importService.failed === 1) {
      // business logic after fail
      importService._fail(error, function () {
        // clear the job from the queue
        callback()
      })
    }
    return
  })
  importService.on('done', function () {
    callback()
  })
  importService.run()
}

module.exports = Work
