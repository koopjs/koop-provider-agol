/* @flow */
'use strict'
var Cache = require('../lib/cache')
var FeatureQueue = require('../lib/feature-queue')
var CSVQueue = require('../lib/csv-queue')
var Portal = require('../lib/portal')
var Utils = require('../lib/utils')
var async = require('async')
var SpatialReference = require('spatialreference')
var formatSpatialRef = require('format-spatial-ref')

var AGOL = function (koop) {
  /**
   * inherits from the base model
   */
  var agol = {}
  var config = koop.config
  // set field indexing off by default
  var indexFields
  config.agol
  if (config.agol && config.agol.indexFields) indexFields = true
  else indexFields = false
  config.agol = config.agol || {}
  agol.log = koop.log

  var connection = config.queue && config.queue.connection
  var qOpts = {
    connection: connection,
    log: agol.log,
    cache: new Cache({cache: koop.cache, log: koop.log}),
    agol_path: Utils.agol_path
  }
  var day = 24 * 60 * 60 * 1000
  setInterval(agol.dropAndRemoveFailed, day)

  agol.featureQueue = FeatureQueue.create(qOpts)

  agol.csvQueue = new CSVQueue({
    cache: koop.cache,
    log: koop.log,
    files: koop.fs
  })

  agol.cache = new Cache({
    cache: koop.cache,
    files: koop.fs,
    log: koop.log,
    featureQueue: agol.featureQueue,
    csvQueue: agol.csvQueue,
    indexFields: indexFields
  })

  agol.files = koop.fs

  agol.spatialReference = new SpatialReference({db: agol.cache.db, logger: agol.log})

  agol.portal = new Portal({log: koop.log})

  if (config.export_workers && config.export_workers.force) agol.forceExportWorker = true

  /**
   * Adds a service to the Cache
   * needs a host, generates an id
   *
   * @param {string} id - the id used to reference this host in the db
   * @param {string} host - host to request items from
   * @param {function} callback - The callback.
   */
  agol.register = function (id, host, callback) {
    var type = 'agol:services'
    koop.cache.serviceRegister(type, {'id': id, 'host': host}, callback)
  }

  /**
   * Get a service by id
   * if no id given then return all services
   *
   * @param {string} id - the id used to reference this host in the db
   * @param {function} callback - The callback.
   */
  agol.find = function (id, callback) {
    koop.cache.db.serviceGet('agol:services', parseInt(id, 0) || id, function (err, res) {
      if (err) return callback('No service table found for that id. Try POSTing {"id":"arcgis", "host":"http://www.arcgis.com"} to /agol', null)
      callback(null, res)
    })
  }

  /**
   * Removes a service from the cache
   *
   * @param {string} id - the id used to reference this host in the db
   * @param {function} callback - The callback.
   */
  agol.remove = function (id, callback) {
    koop.cache.db.serviceRemove('agol:services', parseInt(id, 0) || id, callback)
  }

  /**
   * Gets the resource's cache/expiration status
   *
   * @param {string} key - The resource's identifier
   * @param {function} callback - calls back with an error or the cache status and item info
   */
  agol.getInfo = function (options, callback) {
    agol.cache.getInfo(options.key, function (err, info) {
      if (err && err.message !== 'Resource not found') return callback(err)
      if (info && info.status) {
        if (info.type !== 'Feature Service') return getPortalInfo(info)
        callback(null, info)
        agol.cache.checkExpiration(info, options.layer, function (err, expired) {
          if (err) return agol.log.error(err)
          if (!expired) return
          agol.updateResource(info, options, function (err, status) {
            if (err) agol.log.error(err)
            else agol.log.debug(status)
          })
        })
      } else {
        // default case for missing info
        callback(null, {status: 'Unavailable'})
      }
    })

    function getPortalInfo (info) {
      agol.portal.getItem(options.host, options.item, function (err, item) {
        if (err) return callback(err)
        info.modified_at = item.modified
        agol.cache.checkExpiration(info, options.layer, expirationCallback)
      })
    }

    function expirationCallback (err, expired, info) {
      if (err) return callback(err)
      info = info || {}
      info.status = expired ? 'Expired' : info.status
      callback(null, info)
    }
  }

  /**
  * Caches a resource in the DB
  *
  * @param {object} options - options describing the resource to be cached
  * @param {function} callback - the callback for when all is gone
  */
  agol.cacheResource = function (options, callback) {
    agol.log.debug(options)
    agol.portal.getItem(options.host, options.item, function (err, item) {
      if (err) return callback(err)
      options.itemInfo = item
      // all the null parameters below are for options
      switch (item.type) {
        case 'CSV':
          return agol.cache.csv(options, callback)
        case 'Feature Collection':
          return agol.cache.featureCollection(options, callback)
        case 'Feature Service':
          return agol.cache.insertFeatureService(options, callback)
        case 'Map Service':
          return agol.cache.insertFeatureService(options, callback)
        default:
          agol.log.error(item)
          return callback(new Error('Item must be a Feature Collection, Feature Service, or CSV'))
      }
    })
  }

  /**
  * Updates a resource that has already been cached
  *
  * @param {object} options - options describing the resource to be cached
  * @param {function} callback - the callback for when all is gone
  */
  agol.updateResource = function (info, options, callback) {
    agol.log.debug(options)
    // this will only work if data is not being stored in the database
    if (info.type === 'Feature Service') {
      agol.cache.updateFeatureService(options, callback)
      agol.updateItemInfo(options, function (err) {
        if (err) agol.log.error(err)
      })
    } else {
      agol.dropResource(info.item, info.layer, null, function (err) {
        if (err) return callback(err)
        agol.cacheResource(options, callback)
      })
    }
  }

  /**
  * Updates the info doc of a resource with AGOL properties
  *
  * @param {object} options - options describing the info doc to be updated
  * @param {function} callback - the callback for when all is done
  */
  agol.updateItemInfo = function (options, callback) {
    agol.portal.getItem(options.host, options.item, function (err, item) {
      if (err) return callback(err)
      var infoKey = 'agol:' + options.item + ':' + options.layer
      agol.cache.getInfo(infoKey, function (err, info) {
        if (err) return callback(err)
        // In import-service we will automatically create export jobs under 2 conditions
        // 1. The item has changed (including metadata)
        // 2. The actual data has changed
        if (info.metadata !== item.metadata) info.itemDirty = true
        info.itemTitle = item.title
        info.metadata = item.metadata
        info.itemModified = item.modified
        agol.cache.updateInfo(infoKey, info, function (err) {
          callback(err)
        })
      })
    })
  }

  /**
   * Wraps dropping from the cache
   *
   * @param {string} item - the item to drop
   * @param {number} layer - the layer to drop
   * @param {object} options - whether to drop the latest directory or not
   * @param {function} callback - calls back with an error or whether the data was dropped
   */
  agol.dropResource = function (item, layer, options, callback) {
    agol.cache.drop(item, layer, options, callback)
  }

  /**
   * Wraps export enqueing
   *
   * @param {object} options - directions for what to export
   * @return {object} new export job
   */
  agol.enqueueExport = function (options) {
    return koop.queue.enqueue('exportFile', options)
  }

  /**
   * Wraps copy enqueing
   *
   * @param {object} options - directions for what to export
   * @return {object} new export job
   */
  agol.enqueueCopy = function (options) {
    return koop.queue.enqueue('copyFile', options)
  }

  /**
   * Exports a dataset to a file
   *
   * @param {object} options - file export parameters
   * @param {function} callback - calls back with an error or status and whether a new job was created
   */
  agol.generateExport = function (options, callback) {
    getWkt(options.outSR, function (err, wkt) {
      if (err) return callback(err)
      options.srs = wkt
      agol.enqueueExport(options)
      .once('start', function () { agol.updateJob('start', options) })
      .once('progress', function () { agol.updateJob('progress', options) })
      .once('finish', function () {
        // Hack to make sure this fires after other progress updates have been saved
        setTimeout(function () {
          agol.updateJob('finish', options)
        }, 1000)
      })
      .once('fail', function () { agol.updateJob('fail', options) })
      agol.updateJob('queued', options, callback)
    })
  }

  agol.updateJob = function (status, options, callback) {
    agol.log.info('Export Job', status, options)
    agol.cache.getInfo(options.table, function (err, info) {
      if (err) {
        if (callback) callback(err, info)
        return agol.log.error(err)
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
      agol.cache.updateInfo(options.table, info, function (err) {
        if (err) agol.log.error(err)
        if (callback) callback(err, info)
      })
    })
  }

  /**
   * Gets projection information for a shapefile export
   * @param {object} options - contains info on spatial reference, wkid and wkt
   * @param {function} callback - calls back with an error or wkt
   * @private
   */
  function getWkt (outSr, callback) {
    var wkt
    // if there is a passed in WKT just use that
    if (!outSr) return callback()
    if (outSr.wkt) {
      wkt = outSr.wkt.replace(/lambert_conformal_conic(?!_)/i, 'Lambert_Conformal_Conic_2SP')
      return callback(null, wkt)
    }
    var spatialRef = formatSpatialRef(outSr)
    // latest WKID is the more modern value
    var wkid = spatialRef.latestWkid || spatialRef.wkid
    agol.spatialReference.wkidToWkt(wkid, callback)
  }

  /**
   * Get the expiration date of a resource from the info doc in the db
   *
   * @param {string} key - the table key for the resource
   * @param {function} callback - calls back with an error or the expiration date
   */
  agol.getExpiration = function (key, callback) {
    agol.cache.getInfo(key, function (err, info) {
      if (err || !info) return callback(err || new Error('Resource not found'))
      callback(null, info.expires_at)
    })
  }

  /**
   * Sets the expiration date of a resource on the info doc in the db
   * @param {string} key - the table key for the resource
   * @param {string/integer} - A UTC string or a Unix Timestamp
   * @param {function} callback - calls back with an error or nothing
   */
  agol.setExpiration = function (key, expiration, callback) {
    // validate the expiration first because we cannot update or create a new resource if it fails
    try {
      expiration = agol._validateExpiration(expiration)
    } catch (e) {
      agol.log.error('Invalid expiration input: ' + expiration + ' ' + e.message)
      return callback(e)
    }
    agol.cache.getInfo(key, function (err, info) {
      // send the expiration back with this error because we will need it set on the new resource
      if (err) return callback(err, expiration)

      info.expires_at = expiration
      // finally update the info doc with our well-formed and validated expiration
      agol.cache.updateInfo(key, info, function (err) {
        if (err) return callback(err)
        agol.log.info('Set expiration: ' + key + ', ' + expiration)
        callback(null, expiration)
      })
    })
  }

  /**
   * Validates an incoming expiration date
   * @param {integer/string} expiration - A UNIX timestamp or a UTC String
   * @returns {integer} - a UNIX timestamp representing the parsed and validated expiration date
   * @private
   */
  agol._validateExpiration = function (expiration) {
    expiration = new Date(expiration)
    if (expiration.toString() === 'Invalid Date') throw new Error('Invalid input')
    if (expiration < new Date()) throw new Error('Expiration cannot be in the past')

    return expiration.getTime()
  }

  /**
   * Enqueues a set of import jobs
   * @param {object} req - the incoming request object
   * @param {array} jobs - the set of jobs to enqueue
   * @param {function} callback - calls back with information about the enqueued jobs
   */
  agol.bulkImport = function (req, jobs, callback) {
    var errors = []
    async.eachLimit(jobs, 10, cache, function () {
      finishBulk(jobs, errors, callback)
    })

    function cache (job, next) {
      var options = Utils.createCacheOptions(req, job)
      agol.cacheResource(options, function (err) {
        if (err) errors.push(formatJobError(job, err))
        next()
      })
    }
  }

  /**
   * Enqueues a set of export jobs
   * @param {object} req - the incoming request object
   * @param {array} jobs - the set of jobs to enqueue
   * @param {function} callback - calls back with information about the enqueued jobs
   */
  agol.bulkExport = function (req, jobs, callback) {
    var errors = []
    async.each(jobs, xport, function () {
      finishBulk(jobs, errors, callback)
    })

    function xport (job, next) {
      agol.cache.getInfo('agol' + ':' + job.item + ':' + job.layer, function (err, info) {
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
          agol.generateExport(options, function (err) {
            if (err) errors.push(formatJobError(job, err))
            done()
          })
        }, function () { next() })
      })
    }
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

  /**
   * Drops the resource from any failed jobs and removes the job from the queue
   *
   * @param {function} callback - calls back with an error or the failed jobs
   */
  agol.dropAndRemoveFailed = function (callback) {
    if (!agol.featureQueue) return callback(new Error('Feature Queue not enabled'))
    agol.log.info('Dropping resources and removing jobs from failures')
    var report = {
      successful: [],
      failed: []
    }
    agol.featureQueue.failed(0, 9999999, function (err, failed) {
      if (err) {
        agol.log.error('Error while trying to fetch failed jobs', err)
        return finish(err)
      }
      async.each(failed, function (job, callback) {
        agol.featureQueue.removeFailed(job, function (err) {
          if (!job.payload || !job.payload.args) return callback()
          var params = job.payload.args[0]
          if (err) {
            agol.log.error('Error while trying to remove failed job', params.item, params.layer, err)
            report.failed.push(job)
            return callback()
          }
          agol.cache.drop(params.item, params.layer, {}, function (err) {
            if (err) {
              agol.log.error('Error while trying to drop failed resource', params.item, params.layer, err)
              report.failed.push(job)
              return callback()
            }
            report.successful.push(job)
            callback()
          })
        })
      }, finish)
    })

    function finish (err) {
      if (callback) callback(err, report)
    }
  }
  // currently we don't fail any jobs on purpose so this *should* only happen
  // if the process crashes

  return agol
}

module.exports = AGOL
