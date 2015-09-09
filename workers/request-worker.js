/* global gc */
var kue = require('kue')
var koop = require('koop/lib')
var FeatureService = require('featureservice')
var pgcache = require('koop-pgcache')
var config = require('config')
var http = require('http')
var https = require('https')
var util = require('util')

// set global number of sockets if in the config
// node version > 0.12 sets max sockets to infinity
if (config.sockets) {
  http.globalAgent.maxSockets = Math.floor(config.sockets / 2)
  https.globalAgent.maxSockets = Math.floor(config.sockets / 2)
}

// Init Koop with things it needs like a log and Cache
koop.log = new koop.Logger(config)
koop.Cache = new koop.DataCache(koop)

// registers a DB modules
koop.Cache.db = pgcache.connect(config.db.conn, koop)

// Create the job queue for this worker process
// connects to the redis same redis
var jobs = kue.createQueue({
  prefix: config.redis.prefix,
  redis: {
    port: config.redis.port,
    host: config.redis.host
  }
})

process.once('SIGINT', function (sig) {
  jobs.active(function (err, ids) {
    if (err) {
      koop.log.error(util.inspect(err))
    }
    if (ids.length) {
      ids.forEach(function (id) {
        kue.Job.get(id, function (err, job) {
          if (err) {
            koop.log.error(util.inspect(err))
          }
          job.inactive()
          jobs.active(function (err, activeIds) {
            if (err) {
              koop.log.error(util.inspect(err))
            }
            if (!activeIds.length) {
              jobs.shutdown(function () {
                process.exit(0)
              }, 5000)
            }
          })
        })
      })
    } else {
      jobs.shutdown(function () {
        process.exit(0)
      }, 5000)
    }
  })
})

jobs.process('agol', function (job, done) {
  makeRequest(job, function (err) {
    // we need to stringify because this error is travelling across redis
    if (err) {
      // set the error message on another property, or else we'll lose it when we stringify
      err.msg = err.message
      job.set('koopError', JSON.stringify(err))
      return done(err)
    }
    done()
  })
})

setInterval(function () {
  if (typeof gc === 'function') {
    gc()
  }
}, 5000)

// makes the request to the feature service and inserts the Features
function makeRequest (job, callback) {
  var domain = require('domain').create()

  domain.on('error', function (err) {
    callback(err)
  })

  domain.run(function () {
    koop.log.info('starting job ' + job.id + ': ' + job.data.itemId + '_' + job.data.layerId)
    var completed = 0
    var len = job.data.pages.length
    var featureService = new FeatureService(job.data.serviceUrl, {})

    // aggregate responses into one json and call done we have all of them
    // start the requests
    featureService.pageQueue.push(job.data.pages, function (error, json) {
      if (error || !json) {
        featureService.pageQueue.kill()
        throw error
      }

      // transform the data into geojson
      koop.GeoJSON.fromEsri(job.data.fields || [], json, function (err, geojson) {
        if (err) return callback(err)
        koop.Cache.insertPartial('agol', job.data.itemId, geojson, job.data.layerId, function (err) {
          if (err) {
            featureService.pageQueue.kill()
            throw err
          }
          completed++
          koop.log.info(completed + ' pages of ' + len + ' completed. ' + job.id + ': ' + job.data.itemId + '_' + job.data.layerId)
          job.progress(completed, len)

          if (completed === len) {
            var key = ['agol', job.data.itemId, job.data.layerId].join(':')
            koop.Cache.getInfo(key, function (err, info) {
              if (err) throw err
              if (info && info.status) delete info.status

              // if we've made it this far it's a success so return done with no argument
              koop.Cache.updateInfo(key, info, function () {
                return callback()
              })
            })
          }
        })
      })
    })
  })

}
