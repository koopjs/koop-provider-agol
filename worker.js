/* global gc */
var config = require('config')
var http = require('http')
var https = require('https')
var MultiWorker = require('node-resque').multiWorker
var Work = require('./lib/work.js')
var koop = require('koop')(config)
var Cache = require('./lib/cache.js')
var pgCache = require('koop-pgcache')
var stringify = require('json-stringify-safe')
koop.registerCache(pgCache)

// set global number of sockets if in the config
// node version > 0.12 sets max sockets to infinity
http.globalAgent.maxSockets = Infinity
https.globalAgent.maxSockets = Infinity

var cacheOpts = {
  log: koop.log,
  cache: koop.Cache
}
var cache = new Cache(cacheOpts)

var workOpts = {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    prefix: config.redis.prefix
  },
  cache: cache,
  log: koop.log
}

var work = new Work(workOpts)

var multiWorker = new MultiWorker({
  connection: work.connection,
  queues: ['agol'],
  minTaskProcessors: 10,
  maxTaskProcessors: 100,
  checkTimeout: 1000,
  maxEventLoopDelay: 10,
  toDisconnectProcessors: true
}, work.jobs)

multiWorker.start()

multiWorker.on('start', function (workerId) {
  koop.log.info('worker[' + workerId + '] started')
})
multiWorker.on('end', function (workerId) {
  koop.log.info('worker[' + workerId + '] ended')
})
multiWorker.on('cleaning_worker', function (workerId, worker, pid) {
  koop.log.debug('cleaning old worker ' + worker)
})
multiWorker.on('job', function (workerId, queue, job) {
  koop.log.info('worker[' + workerId + '] working job ' + queue + ' ' + stringify(job))
})
multiWorker.on('reEnqueue', function (workerId, queue, job, plugin) {
  koop.log.info('worker[' + workerId + '] reEnqueue job (' + plugin + ') ' + queue + ' ' + stringify(job))
})
multiWorker.on('success', function (workerId, queue, job, result) {
  koop.log.info('worker[' + workerId + '] job success ' + queue + ' ' + stringify(job) + ' >> ' + result)
})
multiWorker.on('failure', function (workerId, queue, job, failure) {
  koop.log.error('worker[' + workerId + '] job failure ' + queue + ' ' + stringify(job) + ' >> ' + failure)
})
multiWorker.on('error', function (workerId, queue, job, error) {
  koop.log.error('worker[' + workerId + '] error ' + queue + ' ' + stringify(job) + ' >> ' + error)
})

process.on('SIGINT', function () {
  multiWorker.stop(function () {
    process.exit()
  })
})

process.on('SIGTERM', function () {
  multiWorker.stop(function () {
    process.exit()
  })
})

setInterval(function () {
  if (typeof gc === 'function') {
    gc()
  }
}, 5000)
