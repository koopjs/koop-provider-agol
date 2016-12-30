/* @flow */
'use strict'
var Cache = require('./cache')
var FeatureQueue = require('./feature-queue')
var CSVQueue = require('./csv-queue')
var Portal = require('./portal')
var Dataset = require('./dataset')
var Utils = require('../lib/utils')
var async = require('async')
var SpatialReference = require('spatialreference')
var Exporter = require('./exporter')
var AGOL = function (koop) {
  /**
   * inherits from the base model
   */
  var agol = {}
  var config = koop.config
  // set field indexing off by default
  var indexFields
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

  agol.dataset = new Dataset({
    cache: koop.cache,
    log: koop.log
  })

  agol.exporter = new Exporter({
    cache: koop.cache,
    log: koop.log,
    queue: koop.queue
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
    var hosts = { devext: 'https://devext.arcgis.com', qaext: 'https://qaext.arcgis.com', arcgis: 'https://www.arcgis.com' }
    // try to use one of the defaults
    if (id === '_env') id = config.agol.env
    var host = hosts[id]
    if (host) return callback(null, {host: host})
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

  agol.updateIfExpired = function (info, options, callback) {
    // don't try to update things while they are processing
    if (info.status === 'Processing') return callback(null, info)
    agol.cache.checkExpiration(info, options.layer, function (err, expired) {
      if (err || !expired) return callback(err)
      agol.updateResource(info, options, function (err, status) {
        callback(err, status)
      })
    })
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
  * @param {function} callback - the callback for when all is done
  */
  agol.updateResource = function (info, options, callback) {
    agol.log.debug(options)
    // this will only work if data is not being stored in the database
    if (info.type === 'Feature Service') {
      agol.updateItemInfo(options, function (err) {
        if (err) return callback(err)
        agol.cache.updateFeatureService(options, callback)
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
   * Wraps copy enqueing
   *
   * @param {object} options - directions for what to export
   * @return {object} new export job
   */
  agol.enqueueCopy = function (options) {
    return koop.queue.enqueue('copyFile', options)
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

// TODO (low priority) these two functions are now duplicated in Exporter

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

  return agol
}

module.exports = AGOL
