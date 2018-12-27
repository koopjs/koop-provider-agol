var Exporter = module.exports = function (options) {
  this.cache = options.cache
  this.log = options.log
  this.queue = options.queue
  try {
    this.spatialReference = new SpatialReference({db: this.cache.db, logger: this.log})
  } catch (e) {
    this.spatialReference = new SpatialReference({})
  }
}

var async = require('async')
var Utils = require('../lib/utils')
var SpatialReference = require('spatialreference')
var formatSpatialRef = require('format-spatial-ref')

/**
 * Wraps export enqueing
 *
 * @param {object} options - directions for what to export
 * @return {object} new export job
 */
Exporter.prototype.enqueue = function (options) {
  return this.queue.enqueue('exportFile', options)
}

/**
 * Exports a dataset to a file
 *
 * @param {object} options - file export parameters
 * @param {function} callback - calls back with an error or status and whether a new job was created
 */
Exporter.prototype.generate = function (options, callback) {
  var self = this
  self.getWkt(options.outSR, function (err, wkt) {
    if (err) return callback(err)
    options.srs = wkt
    var job = self.enqueue(options)

    job
      .once('start', function () { if (!job.locked) self.updateJob('start', options) })
      .once('progress', function () { if (!job.locked) self.updateJob('progress', options) })
      .once('finish', function () {
        job.locked = true
        job.removeAllListeners()
        // Hack to make sure this fires after other progress updates have been saved
        setTimeout(function () {
          self.updateJob('finish', options)
        }, 1000)
      })
      .once('fail', function (status) {
        job.locked = true
        job.removeAllListeners()
        var error = status.errorReport && status.errorReport.message
        self.updateJob('Error: ' + error, options)
      })
    self.updateJob('queued', options, callback)
  })
}

/**
 * Enqueues a set of export jobs
 * @param {object} req - the incoming request object
 * @param {array} jobs - the set of jobs to enqueue
 * @param {function} callback - calls back with information about the enqueued jobs
 */
Exporter.prototype.bulk = function (req, jobs, callback) {
  var self = this
  var errors = []
  async.each(jobs, xport, function () {
    finishBulk(jobs, errors, callback)
  })

  function xport (job, next) {
    self.cache.getInfo('agol' + ':' + job.item + ':' + job.layer, function (err, info) {
      if (err) {
        errors.push(formatJobError(job, err))
        return next()
      }
      var formats = job.formats || ['kml', 'csv', 'zip', 'geohash']
      async.each(formats, function (format, done) {
        req.optionKey = Utils.createCacheKey(job, {
          where: job.where,
          outSR: job.outSr,
          geometry: job.geometry
        })
        var options = Utils.createExportOptions(req, info, job, format)
        self.generate(options, function (err) {
          if (err) errors.push(formatJobError(job, err))
          done()
        })
      }, function () { next() })
    })
  }
}

Exporter.prototype.updateJob = function (status, options, callback) {
  var self = this
  self.log.info('Export Job', status, options)
  self.cache.getInfo(options.table, function (err, info) {
    if (err) {
      if (callback) callback(err, info)
      return self.log.error(err)
    }
    info.generating = info.generating || {}
    var generating = info.generating[options.key] = info.generating[options.key] || {}
    if (status === 'finish') {
      info.generated = info.generated || {}
      info.generated[options.key] = info.generated[options.key] || {}
      info.generated[options.key][options.format] = info.retrieved_at
      delete info.generating[options.key][options.format]
    } else {
      generating[options.format] = status
    }
    self.cache.updateInfo(options.table, info, function (err) {
      if (err) self.log.error(err)
      if (callback) callback(err, info)
    })
  })
}

/**
 * Gets projection information for a shapefile export
 * @param {object} options - contains info on spatial reference, wkid and wkt
 * @param {function} callback - calls back with an error or wkt
 */
Exporter.prototype.getWkt = function (outSr, callback) {
  var wkt
  if (!outSr) return callback()
  // if there is a passed in WKT just use that
  if (outSr.wkt) {
    wkt = outSr.wkt.replace(/lambert_conformal_conic(?!_)/i, 'Lambert_Conformal_Conic_2SP')
    return callback(null, wkt)
  }
  var spatialRef = formatSpatialRef(outSr)
  // latest WKID is the more modern value
  var wkid = spatialRef.latestWkid || spatialRef.wkid
  this.spatialReference.wkidToWkt(wkid, callback)
}

function formatJobError (job, error) {
  return {
    item: job.item,
    layer: job.layer,
    message: error.message,
    url: error.url,
    response: error.body
  }
}

function finishBulk (jobs, errors, callback) {
  var response = {
    meta: {
      total: jobs.length,
      succeeded: jobs.length - errors.length,
      failed: errors.length
    },
    failed: errors
  }
  callback(null, response)
}
