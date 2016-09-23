var Utils = require('../lib/utils.js')
var esriToGeojson = require('esri-to-geojson').fromEsri
var async = require('async')
var CACHE_LIFE = 24 * 60 * 60 * 1000
var path = require('path')
function Cache (options) {
  this._cache = options.cache
  this.files = options.files
  this.log = options.log
  this.featureQueue = options.featureQueue
  this.csvQueue = options.csvQueue
  this.indexFields = options.indexFields
  // max csv file size
  this.maxSize = 5000000
}

/**
 * Wraps Cache.getInfo
 *
 * @param {string} key - a table name in the db
 * @param {function} callback - the callback for when all is gone
 */
Cache.prototype.getInfo = function (key, callback) {
  this._cache.getInfo(key, callback)
}

/**
 * Wraps Cache.updateInfo
 *
 * @param {string} key - a table name in the db
 * @param {object} info - the info to store in the table
 * @param {function} callback  - calls back with err or nothing
 */
Cache.prototype.updateInfo = function (key, info, callback) {
  this._cache.updateInfo(key, info, callback)
}

/**
 * Get the count of the features in the cache
 *
 * @param {string} key - a table name in the db
 * @param {object} options - optional params from req.query (the querystring)
 * @param {function} callback - the callback for when all is gone
 */
Cache.prototype.getCount = function (key, options, callback) {
  this._cache.getCount(key, options, callback)
}

/**
 * Add indexes to a table
 *
 * @param {string} key - the table key in the db
 * @param {object} options - which indexes to add
 * @param {function} callback - calls back after the indexes are added
 */
Cache.prototype.addIndexes = function (key, options, callback) {
  this._cache.addIndexes(key, options, callback)
}

/**
 * Sets a resource in a failed state
 *
 * @param {string} key - a table in the db
 * @param {object} error - an error payload to save in the db
 * @param {function} callback - calls back with an error or nothing
 */
Cache.prototype.setFail = function (key, error, callback) {
  // if (!error) return callback(new Error('cannot set a failure without error info'))
  var self = this
  self._cache.getInfo(key, function (err, info) {
    if (err) return callback(err)
    info = info || {}
    // only set fail if this is not in s3 already
    if (info.status !== 'Cached') info.status = 'Failed'
    info.failedLastImport = true
    info.retrieved = Date.now()
    error.body = error.body || {}
    info.error = {
      timestamp: error.timestamp,
      message: error.msg || error.message,
      request: error.url,
      response: error.body.message,
      code: error.code || error.body.code || 500
    }
    self._cache.updateInfo(key, info, function (err) {
      if (err) return callback(err)
      self.log.info(key + ' set as failed in the DB')
    })
  })
}

/**
 * Create a new table and info and optionally insert rows
 *
 * @param {string} item - a table name in the db
 * @param {number} layer - the layer number of the data
 * @param {object} geojson - data to insert into a new table
 * @param {function} callback - the callback for when the data is inserted
 */
Cache.prototype.insert = function (item, layer, geojson, callback) {
  this._cache.insert('agol', item, geojson, layer, callback)
}

/**
 * Insert rows into an existing table
 *
 * @param {string} item - a table name in the db
 * @param {number} layer - the layer number of the data
 * @param {object} geojson - data to insert into an existing table
 * @param {function} callback - the callback for when the data is inserted
 */
Cache.prototype.insertPartial = function (item, layer, geojson, callback) {
  this._cache.insertPartial('agol', item, geojson, layer, callback)
}

/**
 * Get data from the cache
 *
 * @param {string} item - a table name in the db
 * @param {number} layer - the layer number of the data
 * @param {object} query - query params to apply to the data
 * @param {function} callback - calls back with an error or data
 */
Cache.prototype.get = function (item, layer, query, callback) {
  if (typeof query === 'undefined') query = {}
  query.layer = layer || 0
  this._cache.get('agol', item, query, callback)
}

/**
 * Inserts a never-before-seen feature service into the db
 *
 * @param {object} options - options for which feature service to get
 * @param {function} callback - the calls back with an error or status: processing
 */
Cache.prototype.insertFeatureService = function (options, callback) {
  var self = this
  var table = self._prepareInsert(options)
  self.insert(options.item, options.layer, table, function (err) {
    if (err) return callback(err)
    enqueue(self.featureQueue, options)
    callback(null, table)
  })
}

/**
 * Updates an existing feature service
 *
 * @param {object} options - options for which feature service to get
 * @param {function} callback - the calls back with an error or status: processing
 */
Cache.prototype.updateFeatureService = function (options, callback) {
  var self = this
  var key = 'agol:' + options.item + ':' + options.layer
  self.log.debug('Updating feature service', options)
  self.getInfo(key, function (err, info) {
    if (err) return callback(err)
    // Don't reenquee if the job is already started
    if ((Date.now() - info.importEnqueued) < (12 * 60 * 60 * 1000)) return callback(null, info)
    info.status = 'Expired'
    info.importEnqueued = Date.now()
    self.updateInfo(key, info, function (err) {
      if (err) return callback(err)
      enqueue(self.featureQueue, {
        item: options.item,
        layer: options.layer,
        url: info.url,
        id: options.id
      })
      callback(null, info)
    })
  })
}

function enqueue (queue, options) {
  queue.enqueue('agol', 'importService', [{
    server: options.url || options.itemInfo.url,
    item: options.item,
    layer: options.layer,
    hostId: options.id,
    expires: options.expiration || (Date.now() + CACHE_LIFE)
  }])
}

/**
 * Prepares a table object for insertion into the db by calling out to the service and layer
 *
 * @param {object} options - information used to structure the table
 * @param {function} callback - calls back with an error or the table to insert
 * @private
 */
Cache.prototype._prepareInsert = function (options) {
  var table = {
    status: 'Processing',
    retrieved_at: Date.now(),
    features: [],
    host: {
      id: options.hostId
    },
    // include more in this array when PG-Cache can handle it
    info: {
      itemTitle: options.itemInfo.title,
      version: 3,
      url: options.itemInfo.url,
      type: 'Feature Service',
      metadata: options.itemInfo.metadata,
      itemModified: options.itemInfo.modified,
      _indexFields: false,
      _indexGeometry: false,
      _indexGeohash: false
    }
  }
  return table
}

/**
 * Gets CSV item data from the server or cache, always returns with an error or data
 *
 * @param {object} options - options for which data to get
 * @param {function} callback - calls back with an error or data
 */
Cache.prototype.csv = function (options, callback) {
  var self = this
  var task = {}
  var itemInfo = options.itemInfo
  itemInfo.description = itemInfo.description && itemInfo.description.replace(/\0/g, '')
  itemInfo.name = itemInfo.name && itemInfo.name.replace(/\0/g, '')
  var id = itemInfo.id
  var hostId = options.hostId

  this.get(options.item, options.layer, options.query, function (err, entry) {
    if (err) {
      self.log.debug(err)
      if (err.message !== 'Resource not found') {
        err.code = 500
        return callback(err)
      }
    }
    if (entry && entry[0]) return callback(null, null, entry[0])
    if (itemInfo.size > self.maxSize) return callback({ code: 413, error: 'The requested CSV exceeds the allowable size of ' + self.maxSize + ' bytes' }, null)
    task.url = options.host + Utils.agol_path + id + '/data'
    task.itemInfo = itemInfo
    task.id = id
    task.hostId = hostId
    task.options = options
    task.expires_at = options.expiration || (Date.now() + self.cacheLife)
    task.indexFields = self.indexFields
    self.csvQueue.push(task, callback)
    self.log.info('Request for a new CSV: ' + task.url)
  })
}

/**
 * Get a feature collection from the server and inserts it
 * FeatureCollection are simply JSON features requested in one just (not services)
 *
 * @param {object} params - the set of parameters needed to get the feature collection
 * @param {function} callback - calls back with an error, or info and data
 */
Cache.prototype.featureCollection = function (params, callback) {
  var self = this
  var item = params.item
  var itemInfo = params.itemInfo
  var hostId = params.id

  // for large datasets enforce koop's large data limit
  var options = options || {}
  options.enforce_limit = true

  self._cache.get('agol', item, options, function (err, entry) {
    if (!err) {
      itemInfo.data = entry
      return callback(null, itemInfo)
    }

    var url = params.host + Utils.agol_path + '/' + item + '/data?f=json'
    Utils.req(url, function (err, data) {
      if (err) return callback(err, null)

      var json = JSON.parse(data.body).featureCollection.layers[0].featureSet

      var geojson
      try {
        geojson = esriToGeojson(json)
      } catch (e) {
        return callback(e)
      }

      geojson.name = itemInfo.title
      geojson.updated_at = itemInfo.modified
      geojson.host = {id: hostId}
      geojson.info = {
        type: 'Feature Collection',
        version: 3,
        url: url
      }
      self.insert(item, params.layer, geojson, function (err, success) {
        if (success) {
          itemInfo.data = [geojson]
          return callback(null, itemInfo, geojson)
        }
        callback(err)
      })
    })
  })
}

/**
 * Method to remove all the data in each export dir
 *
 * @param {string} dir - The base dir to remove all files
 * @param {function} callback - The callback.
 * @private
 */
Cache.prototype._removeExportDirs = function (dir, callback) {
  var self = this
  var dirs = ['files/', 'tiles/']
  async.each(dirs, function (base, callback) {
    self.files.rmdirp(path.join(base, dir), function (err) {
      callback(err)
    })
  }, function (err) {
    callback(err)
  })
}

/**
 * Drops the item from the cache
 * will remove all exported files as well,
 * but will only remove "latest" files if forceDelete is set
 * @param {string} itemid - id of the item
 * @param {integer} layer - the layer of data
 * @param {object} options - optional params from req.query (the querystring)
 * @param {function} callback - the callback for when all is gone
 */
Cache.prototype.drop = function (item, layer, options, callback) {
  var self = this
  if (typeof options === 'function') callback = options
  layer = layer || 0
  var dir = [ item, layer ].join('_')
  self._cache.remove('agol', item, {layer: layer}, function (err, res) {
    if (err) return callback(err)
    self._removeExportDirs(dir, function (err, success) {
      if (!options || !options.forceDelete) return callback(err, true)
      self.files.rmdirp('latest/files/' + dir, function (err, res) {
        callback(err)
      })
    })
  })
}

/**
 * Checks to see if an item is expired or not
 *
 * @param {object} info - metadata from the service
 * @param {number} layerId - the number of the layer in the request
 * @param {function} callback - callback to call when the requests are done
 */
Cache.prototype.checkExpiration = function (info, layer, callback) {
  if (info.type === 'CSV') return this._csvExpiration(info, layer, callback)

  if (!info.lastEditDate) return this._featureExpiration(info, layer, callback)

  this._hostedFeatureExpiration(info, layer, callback)
}

/**
 * Checks to see if a csv is expired or not
 *
 * @param {object} info - metadata from the service
 * @param {number} layerId - the number of the layer in the request
 * @param {function} callback - callback to call when the requests are done
 * @private
 */
Cache.prototype._csvExpiration = function (info, layer, callback) {
  var expired = info.modified_at > info.retrieved_at
  callback(null, expired, info)
}

/**
 * Checks to see if a feature service is expired or not
 *
 * @param {object} info - metadata from the service
 * @param {number} layerId - the number of the layer in the request
 * @param {function} callback - callback to call when the requests are done
 * @private
 */
Cache.prototype._featureExpiration = function (info, layer, callback) {
  var expired = Date.now() > info.expires_at
  callback(null, expired, info)
}

/**
 * Checks to see if a hosted feature service is expired or not
 *
 * @param {object} info - metadata from the service
 * @param {number} layerId - the number of the layer in the request
 * @param {function} callback - callback to call when the requests are done
 * @private
 */
Cache.prototype._hostedFeatureExpiration = function (info, layer, callback) {
  // if we have lastEditDate on the service we need to check for expiration every time this data is requested
  var self = this
  var start = Date.now()
  Utils.getLayerInfo(info.url, layer, function (err, layerInfo) {
    self.log.debug('Checking hosted feature service expiration took:', (Date.now() - start) / 1000, 'seconds')
    if (err) return callback(err)
    if (!layerInfo.editingInfo) return callback(null, true, info)
    var expired = layerInfo.editingInfo.lastEditDate > info.lastEditDate
    callback(null, expired, info)
  })
}

module.exports = Cache
