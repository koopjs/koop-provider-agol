/* global gc */
var config = require('config')
var http = require('http')
var https = require('https')
var MultiWorker = require('node-resque').multiWorker
var Work = require('./lib/work.js')
var koop = require('koop')(config)
var Cache = require('./lib/cache.js')
var pgCache = require('koop-pgcache')
var fs = require('koop-s3fs')
var stringify = require('json-stringify-safe')
var _ = require('lodash')

koop.register(pgCache)
koop.register(fs)

// set global number of sockets if in the config
// node version > 0.12 sets max sockets to infinity
http.globalAgent.maxSockets = Infinity
https.globalAgent.maxSockets = Infinity

var cacheOpts = {
  log: koop.log,
  cache: koop.cache
}
var cache = new Cache(cacheOpts)

var workOpts = {
  connection: config.queue.connection,
  cache: cache,
  log: koop.log,
  files: koop.fs
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
  koop.log.info('worker[' + workerId + '] working job ' + queue + ' ' + logJob(job))
})
multiWorker.on('reEnqueue', function (workerId, queue, job, plugin) {
  koop.log.info('worker[' + workerId + '] reEnqueue job (' + plugin + ') ' + queue + ' ' + logJob(job))
})
multiWorker.on('success', function (workerId, queue, job, result) {
  koop.log.info('worker[' + workerId + '] job success ' + queue + ' ' + logJob(job) + ' >> ' + result)
})
multiWorker.on('failure', function (workerId, queue, job, failure) {
  koop.log.error('worker[' + workerId + '] job failure ' + queue + ' ' + logJob(job) + ' >> ' + failure)
})
multiWorker.on('error', function (workerId, queue, job, error) {
  koop.log.error('worker[' + workerId + '] error ' + queue + ' ' + logJob(job) + ' >> ' + error)
})

function logJob (job) {
  var logStatement = _.cloneDeep(job) || {}
  // if the job is in a really bad state, it may have no args
  logStatement.args = logStatement.args || [{}]
  var toOmit = ['log', 'pages', 'cache']
  logStatement.args = _.omit(logStatement.args[0], toOmit)
  return stringify(logStatement)
}

process.on('SIGTERM', function () {
  multiWorker.workers.forEach(function (worker) {
    worker.end()
  })
  multiWorker.stop(function () {
    process.exit()
  })
})

setInterval(function () {
  if (typeof gc === 'function') {
    gc()
  }
}, 5000)
