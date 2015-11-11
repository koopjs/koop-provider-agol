var Cache = require('../lib/cache')
var FeatureQueue = require('../lib/feature-queue')
var CSVQueue = require('../lib/csv-queue')
var Portal = require('../lib/portal')
var Utils = require('../lib/utils')
var async = require('async')

var AGOL = function (koop) {
  /**
   * inherits from the base model
   */
  var agol = new koop.BaseModel(koop)
  var config = koop.config
  // set field indexing off by default
  var indexFields
  config.agol
  if (config.agol && config.agol.indexFields) indexFields = true
  else indexFields = false
  config.agol = config.agol || {}
  agol.log = koop.log

  if (config.agol.request_workers) {
    var qOpts = {
      redis: {
        host: config.agol.request_workers.redis.host,
        port: config.agol.request_workers.redis.port,
        prefix: config.agol.request_workers.redis.prefix
      },
      log: agol.log,
      cache: new Cache({cache: koop.Cache, log: koop.log}),
      agol_path: Utils.agol_path
    }
    agol.featureQueue = FeatureQueue.create(qOpts)

    /**
     * Drops the resource from any failed jobs and removes the job from the queue
     *
     * @param {function} callback - calls back with an error or the failed jobs
     */
    agol.dropAndRemoveFailed = function (callback) {
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
            if (err) {
              agol.log.error('Error while trying to remove failed job', params.item, params.layer, err)
              report.failed.push(job)
              return callback()
            }
            if (!job.payload || !job.payload.args) return callback()
            var params = job.payload.args[0]
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
    // every 30 minutes clear out resources where the job failed
    // currently we don't fail any jobs on purpose so this *should* only happen
    // if the process crashes
    setInterval(agol.dropAndRemoveFailed, 30 * 60 * 1000)
  }

  agol.csvQueue = new CSVQueue({
    cache: koop.Cache,
    log: koop.log,
    files: agol.files
  })

  agol.cache = new Cache({
    cache: koop.Cache,
    files: agol.files,
    exporter: koop.Exporter,
    log: koop.log,
    featureQueue: agol.featureQueue,
    csvQueue: agol.csvQueue,
    indexFields: indexFields
  })

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
    koop.Cache.serviceRegister(type, {'id': id, 'host': host}, callback)
  }

  /**
   * Get a service by id
   * if no id given then return all services
   *
   * @param {string} id - the id used to reference this host in the db
   * @param {function} callback - The callback.
   */
  agol.find = function (id, callback) {
    koop.Cache.db.serviceGet('agol:services', parseInt(id, 0) || id, function (err, res) {
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
    koop.Cache.db.serviceRemove('agol:services', parseInt(id, 0) || id, callback)
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
      // needed for backwards compatibility with koop < 2.0
      if (info && !info.version) return updateInfoSchema(info)
      if (info && info.status) {
        if (info.status === 'Processing') return callback(null, info)
        if (info.type !== 'Feature Service') return getPortalInfo(info)
        return agol.cache.checkExpiration(info, options.layer, expirationCallback)
      }
      // default case for missing info
      callback(null, {status: 'Unavailable'})
    })

    function updateInfoSchema (info) {
      info = info || {}
      if (!info.status) info.status = 'Cached'
      info.version = '2.0'
      agol.portal.getItem(options.host, options.item, function (err, itemInfo) {
        if (err || !itemInfo) return callback(err || new Error('Item info was blank'))
        info.type = itemInfo.type
        info.url = itemInfo.url
        if (itemInfo.type !== 'CSV' && itemInfo.type !== 'Feature Collection') {
          var service = Utils.initFeatureService(itemInfo.url, {layer: options.layer})
          service.info(function (err, serviceInfo) {
            if (err || !serviceInfo) return callback(err || new Error('Service info was blank'))
            if (serviceInfo.editingInfo && serviceInfo.editingInfo.lastEditDate) info.lastEditDate = info.retrieved_at
            info.name = Utils.createName(itemInfo, serviceInfo, options.layer)
            agol.cache.updateInfo(options.key, info, function (err) {
              if (err) return callback(err)
              agol.getInfo(options, callback)
            })
          })
        } else {
          info.name = Utils.cleanseName(itemInfo.title)
          agol.cache.updateInfo(options.key, info, function (err) {
            if (err) return callback(err)
            agol.getInfo(options, callback)
          })
        }
      })
    }

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
   * Exports a dataset to a file
   *
   * @param {object} options - file export parameters
   * @param {function} callback - calls back with an error or status and whether a new job was created
   */
  agol.generateExport = function (options, callback) {
    // these pertain to where/how the file should be written
    var fileOpts = {
      type: 'agol',
      format: options.format,
      id: options.item,
      key: options.key
    }

    // these are used to select the right data from the DB
    var dataOpts = {
      large: true,
      where: options.where,
      geometry: options.geometry,
      fields: options.fields,
      layer: options.layer,
      name: options.name,
      outSr: options.outSr,
      filtered: options.filtered,
      metadata: options.metadata
    }

    agol.exportFile(fileOpts, dataOpts, function (err, status, jobCreated) {
      callback(err, status, jobCreated)
    })
  }

  /**
   * Builds a geohash and returns it async if there are filters or saves to the
   * the db and returns processing
   *
   * @param {object} info - the item/layers info doc
   * @param {object} options - describes the item and filters to apply
   * @param {function} callback - calls back with an error, info or the geohash
   * @private
   */
  agol.buildGeohash = function (info, options, callback) {
    var filtered = (options.query.where || options.query.geometry)
    info.geohashStatus = 'Processing'
    agol.cache.updateInfo(options.key, info, function (err, success) {
      if (err) return callback(err)
      // trigger the callback right away so we can return 202 until it done
      // if we dont have a where filter then we return with processing
      if (!filtered) callback()
      getAndSaveGeohash(function (err, agg) {
        if (err) return done(err)
        agol.cache.getInfo(options.key, function (err, info) {
          if (err) return done(err)
          delete info.geohashStatus
          agol.cache.updateInfo(options.key, info, function (err, success) {
            if (err) return done(err)
            // if we DO have a where filter then we can return the agg right away
            if (options.query.where || options.query.geometry) done(null, agg)
          })
        })
      })
    })

    function getAndSaveGeohash (callback) {
      agol.getGeoHash(options.key, options.query, function (err, agg) {
        if (err) return callback(err)
        agol.saveFile(options.filePath, options.fileName, JSON.stringify(agg), function (err) {
          callback(err, agg)
        })
      })
    }

    // callback is already called in the case where we have a non-filtered request
    // so this will only fire if the request is filtered
    function done (err, agg) {
      if (filtered) {
        if (err) return callback(err)
        callback(null, agg)
      }
    }
  }

  /**
   * Get the expiration date of a resource from the info doc in the db
   *
   * @params {string} key - the table key for the resource
   * @params {function} callback - calls back with an error or the expiration date
   */
  agol.getExpiration = function (key, callback) {
    agol.getInfo(key, function (err, info) {
      if (err || !info) return callback(err || new Error('Resource not found'))
      callback(null, info.expires_at)
    })
  }

  /**
   * Sets the expiration date of a resource on the info doc in the db
   * @params {string} key - the table key for the resource
   * @params {string/integer} - A UTC string or a Unix Timestamp
   * @params {function} callback - calls back with an error or nothing
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
   * @params {integer/string} expiration - A UNIX timestamp or a UTC String
   * @returns {integer} - a UNIX timestamp representing the parsed and validated expiration date
   * @private
   */
  agol._validateExpiration = function (expiration) {
    expiration = new Date(expiration)
    if (expiration.toString() === 'Invalid Date') throw new Error('Invalid input')
    if (expiration < new Date()) throw new Error('Expiration cannot be in the past')

    return expiration.getTime()
  }

  return agol
}

module.exports = AGOL
