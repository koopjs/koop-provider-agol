var Utils = require('./utils.js')
var esriToGeojson = require('koop/lib').GeoJSON.fromEsri
var FeatureRequest = require('./feature-request.js')
var async = require('async')

function Cache (options) {
  this._cache = options.cache
  this.files = options.files
  this.log = options.log
  this.cacheLife = options.cacheLife || 24 * 60 * 60 * 1000
  this.featureQueue = options.featureQueue
  this.csvQueue = options.csvQueue
  this.exporter = options.exporter
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
    info.status = 'Failed'
    info.retrieved_at = Date.now()
    error.body = error.body || {}
    // TODO next breaking change version: change the structure of the error
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
 * Makes a request to the feature service
 *
 * @param {object} options - options for which feature service to get
 * @param {function} callback - the calls back with an error or status: processing
 */
Cache.prototype.insertFeatureService = function (options, callback) {
  var self = this
  var fR = new FeatureRequest(options.itemInfo.url, {
    item: options.item,
    layer: options.layer,
    log: self.log,
    queue: self.featureQueue,
    cache: self
  })

  self._prepareInsert(options, function (err, table) {
    if (err) return callback(err)
    self.insert(options.item, options.layer, table, function (err) {
      if (err) return callback(err)
      fR.submit(callback)
    })
  })
}

/**
 * Prepares a table object for insertion into the db by calling out to the service and layer
 *
 * @param {object} options - information used to structure the table
 * @param {function} callback - calls back with an error or the table to insert
 * @private
 */
Cache.prototype._prepareInsert = function (options, callback) {
  var self = this
  var service = Utils.initFeatureService(options.itemInfo.url, {layer: options.layer, log: self.log})

  service.info(function (err, serviceInfo) {
    if (err) return callback(err)
    service.layerInfo(function (err, layerInfo) {
      if (err) return callback(err)
      var table = {
        name: Utils.createName(options.itemInfo, serviceInfo, options.layer),
        status: 'Processing',
        updated_at: options.itemInfo.modified,
        expires_at: options.expiration || (Date.now() + self.cacheLife),
        retrieved_at: Date.now(),
        geomType: Utils.geomTypes[layerInfo.geometryType],
        features: [],
        host: {
          id: options.hostId
        },
        // include more in this array when PG-Cache can handle it
        info: {
          version: '2.0',
          fields: layerInfo.fields.map(function (f) { return f.name }),
          url: options.itemInfo.url,
          type: 'Feature Service',
          metadata: options.itemInfo.metadata,
          _indexFields: self.indexFields
        }
      }
      if (layerInfo.editingInfo) table.info.lastEditDate = layerInfo.editingInfo.lastEditDate
      callback(null, table)
    })
  })
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
  var id = itemInfo.id
  var hostId = options.hostId

  this.get(options.item, options.layer, options.query, function (err, entry) {
    if (err) self.log.debug(err.message)
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
      esriToGeojson([], json, function (err, geojson) {
        if (err) return callback(err)
        geojson.name = itemInfo.title
        geojson.updated_at = itemInfo.modified
        geojson.host = {id: hostId}
        geojson.info = {
          type: 'Feature Collection',
          version: '2.0',
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
    self.files.removeDir(base + dir, function (err) {
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
  layer = layer || 0
  if (self.exporter.export_q) return self._enqueueDrop(item, layer, options, callback)
  var dir = [ item, layer ].join('_')
  self._cache.remove('agol', item, {layer: layer}, function (err, res) {
    if (err) return callback(err)
    self._removeExportDirs(dir, callback)
  })
}

/**
 * Creates a drop job on the export queue
 *
 * @param {string} item - the item to drop
 * @param {number} layer - the layer to drop
 * @param {object} options - whether or not to drop the latest data
 * @param {funciton} callback - calls back with an error or nothing
 * @private
 */
Cache.prototype._enqueueDrop = function (item, layer, options, callback) {
  var self = this
  var jobData = {
    itemId: item,
    layerId: layer,
    remove: true
  }

  var table = item + ':' + layer

  // add the job to the distributed worker pool
  self.exporter.export_q.create('exports', jobData).save(function (err) {
    if (err) return callback(err)
    self.log.info('added a remove job to the export_q: ' + table)
    var dir = [ item, layer ].join('_')
    var dropOptions = {layer: layer}
    self._cache.remove('agol', item, dropOptions, function (err, res) {
      if (err) return callback(err)
      self._removeExportDirs(dir, function (err, success) {
        if (!options || !options.forceDelete) return callback(err, true)
        self.files.removeDir('latest/files/' + dir, function (err, res) {
          callback(err)
        })
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
  // info.modified_at is only present on csv items
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
  Utils.getLayerInfo(info.url, layer, function (err, layerInfo) {
    if (err) return callback(err)
    if (!layerInfo.editingInfo) return callback(null, true, info)
    var expired = layerInfo.editingInfo.lastEditDate > info.lastEditDate
    callback(null, expired, info)
  })
}

module.exports = Cache
