var request = require('request')
var kue = require('kue')
var csv = require('csv')
var FeatureService = require('featureservice')
var async = require('async')
var utils = require('./utils')

var AGOL = function (koop) {
  /**
   * inherits from the base model
   */
  var agol = new koop.BaseModel(koop)

  // base path to use for every host
  agol.agol_path = '/sharing/rest/content/items/'

  // how to long to persist the cache of data
  // after which data will be dropped and re-fetched
  // epoch = days * hours * minutes * secs * millisecs
  agol.cacheLife = (24 * 60 * 60 * 1000)

  // Request Worker Config
  // create a request queue if configured to page large data sets to workers
  if (koop.config.agol && koop.config.agol.request_workers) {
    agol.worker_q = kue.createQueue({
      prefix: koop.config.agol.request_workers.redis.prefix || 'q',
      disableSearch: true,
      redis: {
        port: koop.config.agol.request_workers.redis.port || 6379,
        host: koop.config.agol.request_workers.redis.host || '127.0.0.1'
      }
    })

    // remove completed jobs from the queue
    agol.worker_q.on('job complete', function (id) {
      kue.Job.get(id, function (err, job) {
        if (err) return
        job.remove(function (err) {
          if (err) {
            agol.log('debug', 'could not remove completed job #' + job.id)
          }
          agol.log('debug', 'removed completed job #' + job.id + ' - ' + id)
        })
      })
    })

    // track and log job progress, just handy to have
    agol.worker_q.on('job progress', function (id, progress) {
      agol.log('debug', 'progress ' + id + ' - ' + progress + '%')
    })

  }

  // check to see if koop is configured to force workers on all data
  if (koop.config.export_workers && koop.config.export_workers.force) {
    agol.forceExportWorker = true
  }

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

  // removes the registered host from the list of hosts
  /**
   * Adds a service to the Cache
   * needs a host, generates an id
   * @param {string} id - the id used to reference this host in the db
   * @param {string} host - host to request items from
   * @param {function} callback - The callback.
   */
  agol.remove = function (id, callback) {
    koop.Cache.db.serviceRemove('agol:services', parseInt(id, 0) || id, callback)
  }

  /**
   * Get a service by id
   * if no id given then return all services
   * @param {string} id - the id used to reference this host in the db
   * @param {function} callback - The callback.
   */
  agol.find = function (id, callback) {
    koop.Cache.db.serviceGet('agol:services', parseInt(id, 0) || id, function (err, res) {
      if (err) {
        callback('No service table found for that id. Try POSTing {"id":"arcgis", "host":"http://www.arcgis.com"} to /agol', null)
      } else {
        callback(null, res)
      }
    })
  }

  /**
   * Centralized request method that forces URI encoding
   * all ajax requests should use this so it can be tested
   * @param {string} url - The url for the request.
   * @param {function} callback - The callback.
   */
  agol.req = function (url, callback) {
    // force hosted service requests to use ssl
    url = utils.forceHttps(url)
    request({
      url: encodeURI(decodeURI(url)),
      headers: { 'User-Agent': 'esri-koop' }
    }, callback)
  }

  /**
   * Drops the item from the cache
   * will remove all exported files as well,
   * but will only remove "latest" files if forceDelete is set
   * @param {string} host - the host is needed to tell what dataset to remove
   * @param {string} itemid - id of the item
   * @param {object} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
   */
  agol.dropItem = function (host, itemId, options, callback) {
    var layerId = (options.layer || 0)

    if (koop.Exporter.export_q) {
      var jobData = {
        itemId: itemId,
        layerId: layerId,
        remove: true
      }

      // add the job to the distributed worker pool
      var job = koop.Exporter.export_q.create('exports', jobData).save(function (err) {
        if (err) {
          return callback(err)
        }
        agol.log('debug', 'added a remove job to the export_q' + job.id)
        var dir = [ itemId, layerId ].join('_')
        koop.Cache.remove('agol', itemId, options, function (err, res) {
          if (err) {
            return callback(err)
          }
          agol._removeExportDirs(dir, function (err, success) {
            if (options.forceDelete) {
              koop.files.removeDir('latest/files/' + dir, function (err, res) {
                callback(err, true)
              })
            } else {
              callback(err, true)
            }
          })
        })
      })

    } else {
      var dir = [ itemId, layerId ].join('_')
      koop.Cache.remove('agol', itemId, options, function (err, res) {
        if (err) {
          return callback(err)
        }
        agol._removeExportDirs(dir, callback)
      })

    }
  }

  /**
   * Method to remove all the data in each export dir
   * this logic is being used in 4 places
   * @param {string} dir - The base dir to remove all files
   * @param {function} callback - The callback.
   */
  agol._removeExportDirs = function (dir, callback) {
    var dirs = ['files/', 'tiles/', 'thumbs/']

    async.each(dirs, function (base, callback) {
      koop.files.removeDir(base + dir, function (err) {
        callback(err)
      })
    }, function (err) {
      callback(err)
    })
  }

  /**
   * Get the service then get the item
   * @param {string} host - the host is needed to tell what dataset to remove
   * @param {string} itemid - id of the item
   * @param {object} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
   */
  agol.getItem = function (host, itemId, options, callback) {
    var url = host + this.agol_path + itemId + '?f=json'
    this.req(url, function (err, data) {
      if (err) {
        return callback(err, null)
      }
      try {
        var json = JSON.parse(data.body)
        if (json.error) {
          return callback(json.error.message, null)
        }
        if (options.getMetadata && json.typeKeywords && json.typeKeywords.indexOf('Metadata') !== -1) {
          agol.getItemMetadata(host, itemId, json, callback)
        } else {
          callback(null, json)
        }
      } catch (e) {
        callback('Problem accessing the request host', null)
      }
    })
  }

  /**
  * Get an item's metadata
  * requests the metadata and attachs it to an object before calling the callback
  *
  * @param {string} host - the agol deploy to get data from
  * @param {string} item - the agol item id
  * @param {object} json - an item's json data to attach metadata to
  * @param {function} callback - the callback for when all is gone
  */
  agol.getItemMetadata = function (host, item, json, callback) {
    var url = [host, this.agol_path, item, '/info/metadata/metadata.xml?format=default'].join('')
    this.req(url, function (err, data) {
      if (err) {
        return callback(err)
      }
      json.metadata = data.body
      callback(null, json)
    })
  }

  /**
   * Get the count of the features in the cache
   * wrapper around the Cache.getCount method
   * @param {string} key - a table name in the db
   * @param {object} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
   */
  agol.getCount = function (key, options, callback) {
    koop.Cache.getCount(key, options, callback)
  }

  /**
   * Wraps Cache.getInfo to make testing possible w/o the cache
   * @param {string} key - a table name in the db
   * @param {function} callback - the callback for when all is gone
   */
  agol.getInfo = function (key, callback) {
    koop.Cache.getInfo(key, callback)
  }

  /**
  * Get the actual features and metadata from the DB
  * @param {string} host - the host is needed to tell what dataset to remove
  * @param {string} hostId - the id of the host in the DB
  * @param {string} itemid - id of the item
  * @param {string} hash - the sha1 hash of the params and querystring
  * @param {object} options - optional params from req.query (the querystring)
  * @param {function} callback - the callback for when all is gone
  */
  agol.getItemData = function (host, hostId, itemId, hash, options, callback) {
    var self = this
    this.getItem(host, itemId, options, function (err, itemJson) {
      var layerId = options.layer || 0
      if (err) {
        return callback(err, null)
      }

      // put host in option so our cacheCheck has ref to it
      options.host = host

      var qKey = ['agol', itemId, layerId].join(':')

      self.getInfo(qKey, function (err, info) {
        if (err) {
          console.log('Data not found in the cache', info)
        }
        var is_expired = info ? (Date.now() >= info.expires_at) : false

        // check the last char on the url
        // protects us from urls registered with layers already in the url
        if (itemJson && itemJson.url) {
          var layer = itemJson.url.split('/').pop()
          if (parseInt(layer, 0) >= 0) {
            var len = ('' + layer).length
            itemJson.hasLayerURL = true
            itemJson.url = itemJson.url.substring(0, itemJson.url.length - ((len || 2) + 1))
          }
        }

        // Note: we have to check the service metadata to know if the item has changed in AGOL
        self.getFeatureServiceLayerInfo(itemJson.url, (options.layer || 0), function (err, serviceInfo) {
          if (err) {
            return callback(err)
          }
          // TODO centralize this logic
          // check for infon on last edit date
          // set is_expired to false if it hasnt changed
          if (info && info.retrieved_at && serviceInfo && serviceInfo.editingInfo) {
            if (!serviceInfo.editingInfo.lastEditDate && (info.retrieved_at > itemJson.modified)) {
              is_expired = false
            } else if (info.retrieved_at < serviceInfo.editingInfo.lastEditDate) {
              is_expired = true
            } else {
              // if the retrieved at date is greater than the lastEditDate then the data are still good
              is_expired = false
            }
          }

          var params = {
            itemJson: itemJson,
            serviceInfo: serviceInfo,
            host: host,
            hostId: hostId,
            itemId: itemId,
            layerId: layerId,
            hash: hash
          }

          if (!is_expired) {
            return self.getData(params, options, callback)
          }

          koop.Cache.remove('agol', itemId, options, function (err, res) {
            if (err) {
              return callback(err)
            }
            self.getData(params, options, callback)
          })
        })

      })

    })
  }

  /**
   * This is really the main entry point to this model
   * here we route to the correct data type method based on the item type
   * @param {object} itemJson - json metadata from the item in the host
   * @param {string} host - the host is needed to tell what dataset to remove
   * @param {string} itemid - id of the item
   * @param {string} hostId - the id of the host in the DB
   * @param {string} hash - the sha1 hash of the params and querystring
   * @param {option} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
   */
  agol.getData = function (params, options, callback) {
    if (params.itemJson.type === 'CSV') {
      return agol.getCSV(params.host + agol.agol_path, params, options, callback)
    }

    if (params.itemJson.type === 'Feature Collection') {
      return agol.getFeatureCollection(params.host + agol.agol_path, params, options, callback)
    }

    if (params.itemJson.type === 'Feature Service' || params.itemJson.type === 'Map Service') {
      return agol.getFeatureService(params, options, callback)
    }

    return callback('item must be a Feature Collection, Feature Service, or CSV')
  }

  /**
   * A queue used to control the flow of the csv inserts
   * if we get many requests for a new CSV they insert multiple times
   * here we handle removing the data cache before we insert
  */
  agol.csvQueue = async.queue(function (task, cb) {
    agol.req(task.url, function (err, data) {
      if (err) {
        return task.callback(err, null)
      }

      csv.parse(data.body, function (err, csv_data) {
        if (err) {
          task.callback({ code: 400, error: 'Trouble parsing the CSV data'}, null)
          return cb()
        }
        koop.GeoJSON.fromCSV(csv_data, function (err, geojson) {
          if (err) {
            return task.callback(err)
          }
          // store metadata with the data
          var json = {}
          json.name = task.itemJson.name || task.itemJson.title
          json.updated_at = task.itemJson.modified
          json.expires_at = task.expires_at
          json.retrieved_at = Date.now()
          json.info = { name: json.name, fields: csv_data[0]}
          json.host = {
            id: task.hostId
          }
          json.features = []

          var dir = [ task.id, (task.options.layer || 0) ].join('_')
          koop.Cache.remove('agol', task.id, task.options, function (err, res) {
            if (err) return task.callback(err)
            agol._removeExportDirs(dir, function (err, res) {
              if (err) return task.callback(err)
              koop.Cache.insert('agol', task.id, json, (task.options.layer || 0), function (err, success) {
                if (!err && res) {
                  koop.Cache.insertPartial('agol', task.id, geojson, (task.options.layer || 0), function (err, success) {
                    if (success) {
                      task.itemJson.data = [geojson]
                      task.callback(null, task.itemJson)
                    } else {
                      task.callback(err, null)
                    }
                    cb()
                  })
                } else {
                  // the table create failed which is fine, just do nothing
                  task.itemJson.data = [geojson]
                  task.callback(null, task.itemJson)
                  cb()
                }
              })
            })
          })
        })
      })
    })
  }, 1)

  /**
   * Gets CSV item data from the server and inserts it into the Cache
   * @param {string} baseUrl - id of the item
   * @param {string} hostId - the host is needed to tell what dataset to remove
   * @param {string} id - id of the item
   * @param {object} itemJson - json metadata from the item in the host
   * @param {object} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
  */
  agol.getCSV = function (baseUrl, params, options, callback) {
    var self = this
    var task = {}
    var id = params.id
    var itemJson = params.itemJson
    var hostId = params.hostId

    var qKey = ['agol', id, params.layerId].join(':')

    var maxSize = 5000000

    // for large datasets enforce koop's large data limit
    options.enforce_limit = true

    koop.Cache.getInfo(qKey, function (err, info) {
      if (err) return callback(err)
      koop.Cache.get('agol', id, options, function (err, entry) {
        if (err || (info && info.retrieved_at < itemJson.modified)) {
          if (itemJson.size < maxSize) {
            // replace .csv in name
            itemJson.name = itemJson.name.replace('.csv', '')

            task.url = baseUrl + '/' + id + '/data?f=json'
            task.itemJson = itemJson
            task.id = id
            task.hostId = hostId
            task.options = options
            task.expires_at = Date.now() + self.cacheLife
            task.callback = callback
            self.csvQueue.push(task, function () {})
          } else {
            callback({ code: 413, error: 'The requested CSV exceeds the allowable size of ' + maxSize + ' bytes' }, null)
          }
        } else {
          if (entry && entry[0] && entry[0].exceeds_limit) {
            itemJson.data = entry
            itemJson.koop_status = 'too big'
            callback(null, itemJson)
          } else {
            itemJson.data = entry
            callback(null, itemJson)
          }
        }
      })
    })
  }

  /**
   * Get a feature collection from the server and inserts it
   * FeatureCollection are simply JSON features requested in one just (not services)
   * @param {string} baseUrl - id of the item
   * @param {string} hostId - the host is needed to tell what dataset to remove
   * @param {string} id - id of the item
   * @param {object} itemJson - json metadata from the item in the host
   * @param {object} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
  */
  agol.getFeatureCollection = function (baseUrl, params, options, callback) {
    var id = params.itemId
    var itemJson = params.itemJson
    var hostId = params.hostId

    // for large datasets enforce koop's large data limit
    options.enforce_limit = true

    koop.Cache.get('agol', id, options, function (err, entry) {
      if (!err) {
        itemJson.data = entry
        return callback(null, itemJson)
      }

      var url = baseUrl + '/' + id + '/data?f=json'
      agol.req(url, function (err, data) {
        if (err) {
          return callback(err, null)
        }

        var json = JSON.parse(data.body).featureCollection.layers[0].featureSet
        koop.GeoJSON.fromEsri([], json, function (err, geojson) {
          if (err) return callback(err)
          geojson.name = itemJson.name || itemJson.title
          geojson.updated_at = itemJson.modified
          geojson.host = {
            id: hostId
          }
          koop.Cache.insert('agol', id, geojson, params.layerId, function (err, success) {
            if (success) {
              itemJson.data = [geojson]
              callback(null, itemJson)
            } else {
              callback(err, null)
            }
          })
        })
      })

    })
  }

  /**
   * Gets the service metadata first and adds any fields to request for the actual features
   * @param {string} hostId - the host is needed to tell what dataset to remove
   * @param {string} id - id of the item
   * @param {object} itemJson - json metadata from the item in the host
   * @param {string} hash - the sha1 hash of the params and querystring
   * @param {object} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
  */
  agol.getFeatureService = function (params, options, callback) {
    if (!params.itemJson.url) {
      return callback('Missing url parameter for Feature Service Item')
    }

    // for large datasets enforce koop's large data limit
    if (options.enforce_limit !== false) {
      options.enforce_limit = true
    }

    // if our request has a where clause we need to search for Coded Values Domain
    if (options && options.where) {
      // add fields to options
      options.fields = params.serviceInfo && params.serviceInfo.fields
    }

    // get data from cache
    agol.getDataFromCache(params, options, callback)
  }

  /**
   * Determines if the FeatureService is already cached or not
   * @param {string} hostId - the host is needed to tell what dataset to remove
   * @param {string} id - id of the item
   * @param {object} itemJson - json metadata from the item in the host
   * @param {string} hash - the sha1 hash of the params and querystring
   * @param {object} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
  */
  agol.getDataFromCache = function (params, options, callback) {
    var self = this
    var itemJson = params.itemJson

    // search the cache for this data
    koop.Cache.get('agol', params.itemId, options, function (err, entry) {
      if (err) {
        // no data in the cache request new data
        return self.featureServiceRequest(params, options, callback)
      }

      if (entry && entry[0] && entry[0].status === 'processing') {
        itemJson.data = [{
          features: [],
          name: (itemJson.info) ? itemJson.info.name : itemJson.name,
          geomType: self.geomTypes[itemJson.geometryType],
          info: itemJson.info
        }]
        itemJson.koop_status = 'processing'
        return callback(null, itemJson)
      }

      if (entry && entry[0] && entry[0].exceeds_limit) {
        itemJson.data = entry
        itemJson.koop_status = 'too big'
        return callback(null, itemJson)
      }

      itemJson.data = entry
      callback(null, itemJson)

    })
  }

  /**
   * Removes the layer from the end of a url
   * @param {string} url - the url to strip the layer from
   * @param {string} length - length of the layer value to string
  */
  agol.stripLayerOffUrl = function (url, len) {
    return url.substring(0, url.length - ((len || 2) + 1))
  }

  /**
   * Makes a request to the feature service
   * first checks the count and determines if koop should make one or many requests
   * @param {string} hostId - the host is needed to tell what dataset to remove
   * @param {string} id - id of the item
   * @param {object} itemJson - json metadata from the item in the host
   * @param {string} hash - the sha1 hash of the params and querystring
   * @param {object} options - optional params from req.query (the querystring)
   * @param {function} callback - the callback for when all is gone
  */
  agol.featureServiceRequest = function (params, options, callback) {
    var self = this

    var layer = params.itemJson.url.split('/').pop()
    if (parseInt(layer, 0) >= 0) {
      params.itemJson.hasLayerURL = true
    }

    options = agol._normalizeOptions(params, options)

    var info = {
      status: 'processing',
      updated_at: params.itemJson.modified,
      expires_at: Date.now() + self.cacheLife,
      retrieved_at: Date.now(),
      name: options.name,
      geomType: self.geomTypes[params.itemJson.geometryType],
      info: params.serviceInfo || {},
      features: [],
      host: {
        id: params.hostId
      }
    }

    // save the fields as an array of the names
    info.info.fields = (params.serviceInfo) ? params.serviceInfo.fields.map(function (f) { return f.name }) : []

    koop.Cache.insert('agol', params.itemId, info, params.layerId, function (err) {
      if (err) {
        return callback(err)
      }
      // return in a processing state, but continue on
      params.itemJson.data = [{ features: [] }]
      params.itemJson.koop_status = 'processing'
      params.itemJson.cache_save = false
      params.itemJson.expires_at = info.expires_at

      agol._page(params, options, callback)
    })
  }

  agol._normalizeOptions = function (params, options) {
    var itemJson = params.itemJson
    var serviceInfo = params.serviceInfo

    // set the name in options
    if ((itemJson.name || itemJson.title) && !options.name) {
      options.name = itemJson.name || itemJson.title
    }

    // sanitize any single quotes in the service description
    if (serviceInfo) {
      serviceInfo.description = serviceInfo.description && serviceInfo.description.replace(/'/g, '')
      serviceInfo.definitionExpression = serviceInfo.definitionExpression && serviceInfo.definitionExpression.replace(/'/g, '')

      if (serviceInfo.name && !params.itemJson.hasLayerURL) {
        options.name = serviceInfo.name
      } else if (serviceInfo.title) {
        options.name = serviceInfo.title
      }

      // set the geom type
      options.geomType = serviceInfo.geometryType
      options.fields = serviceInfo.fields
      options.objectIdField = agol.getObjectIDField(serviceInfo)
    }

    // sanitize the name...
    options.name = options.name.replace(/\/|,|&|\|/g, '').replace(/ /g, '_').replace(/\(|\)/g, '')
    // fix long names; truncate to 150 chars
    options.name = (options.name.length > 150) ? options.name.substr(0, 150) : options.name

    return options
  }

  /**
   * A queue used to throttle requests
   * we need this to prevent duplicate paging requests that
   * cause features to be inserted twice
   */
  agol._throttleQ = async.queue(function (key, cb) {
    setTimeout(function () {
      koop.Cache.getInfo(key, function (err, info) {
        if (err || !info) {
          info = {}
        }
        if (!info.locked) {
          info.locked = true
          koop.Cache.updateInfo(key, info, function (err, success) {
            cb(err)
          })
        } else {
          cb(info.locked)
        }
      })
    }, Math.floor((Math.random() * 750) + 200))
  }, 1)

  /**
   * Add pages of requests through the throttle Q
   * @param {number} count - the total number of features in the service
   * @param {string} pageRequests - an array of page urls to be requested
   * @param {string} id - id of the item
   * @param {object} itemJson - the item json metadata from the server
   * @param {number} layerId - the numeric id of the layer being requested
   * @param {object} options - optional params from req.query (the querystring)
   * @param {string} hash - the sha1 hash of the params and querystring
  */
  agol._page = function (params, options, callback) {
    params.featureService = new FeatureService(utils.forceHttps(params.itemJson.url), options)
    params.featureService.pages(function (err, pages) {
      if (err) {
        return callback(err)
      }

      if (pages.length > 1) {
        callback(null, params.itemJson)
      }

      // add to a separate queue that we can use to add jobs one at a time
      // this prevents the case when we get 2 requests at the same time
      var key = ['agol', params.itemId, params.layerId].join(':')
      agol._throttleQ.push(key, function (locked) {
        if (!locked) {
          if (koop.config.agol && koop.config.agol.request_workers) {
            return agol.sendToWorkers(pages, params, options)
          }

          agol.requestQueue(pages, params, options, function (error, data) {
            koop.Cache.getInfo(key, function (err, info) {
              if (err || !info) {
                info = {}
              }
              if (error) {
                var errJson
                try {
                  errJson = JSON.parse(error)
                } catch (e) {
                  errJson = {response: error}
                }
                info.paging_failed = {error: errJson}
                info.generating = {
                  error: {
                    code: errJson.code,
                    request: errJson.request,
                    response: errJson.response,
                    message: 'Failed to cache the data'
                  }
                }
              } else {
                // remove status info: means the job is done (is good...)
                delete info.status
              }

              koop.Cache.updateInfo(key, info, function () {
                if (pages.length === 1) {
                  params.itemJson.data = [data]
                  callback(null, params.itemJson)
                }
              })
            })
          })
        }
      })
    })
  }

  /**
   * Mapping between Esri geomTypes and GeoJSON types
   */
  agol.geomTypes = {
    'esriGeometryPolygon': 'Polygon',
    'esriGeometryPoint': 'Point',
    'esriGeometryPolyLine': 'LineString'
  }

  /**
   * Make requests for feature pages
   * execute done when we have all features
   * @param {array} pages - an array of pare URLs to request
   * @param {object} params - service params
   * @param {object} options - optional params for creating pages
   * @param {function} done - callback to call when the requests are done
   */
  agol.requestQueue = function (pages, params, options, done) {
    var reqCount = 0
    // setup the place to collect all the features
    var itemJson = params.itemJson
    itemJson.data = [{ features: [] }]

    // aggregate responses into one json and call done we have all of them
    var collect = function (error, json) {
      if (error) {
        params.featureService.pageQueue.kill()
        return done(error || 'Feature page JSON is undefined')
      }

      if (json) {
        if (json.error) {
          params.featureService.pageQueue.kill()
          return done(json.error.details[0])
        }

        // insert a partial
        koop.GeoJSON.fromEsri(options.fields || [], json, function (err, geojson) {
          if (err) return done(err)
          // concat the features so we return the full json
          koop.Cache.insertPartial('agol', params.itemId, geojson, params.layerId, function (err) {
            if (err) return done(err)
            if (reqCount++ === pages.length - 1) {
              // pass back the full array of features
              done(null, itemJson)
            }
          })
        })
      }
    }

    agol.log('info', params.itemId + ' # of requests:' + pages.length)
    params.featureService.pageQueue.push(pages, collect)
  }

  /**
   * Create a worker job that will handle the requests
   *
   * @param {array} pages - an array of pare URLs to request
   * @param {object} params - service params
   * @param {object} options - optional params for creating pages
   * @param {function} done - callback to call when the requests are done
   */
  agol.sendToWorkers = function (pages, params, options) {
    var jobData = {
      serviceUrl: params.itemJson.url,
      itemId: params.itemId,
      layerId: params.layerId,
      pages: pages,
      fields: options.fields || []
    }

    // info key - used to look item info in the cache
    var key = ['agol', params.itemId, params.layerId].join(':')

    // add the job to the distributed worker pool
    var job = agol.worker_q.create('agol', jobData).save(function (err) {
      agol.log('debug', 'added page requests to job-queue ' + job.id, err)
    })

    var removeJob = function (job) {
      job.remove(function (err) {
        if (err) {
          agol.log('debug', 'could not remove failed job #' + job.id + ' Error: ' + err)
          return
        }
        agol.log('debug', 'removed failed request job #' + job.id + ' - ' + params.itemId)
      })
    }

    // track failed jobs and flag them
    job.on('failed', function (jobErr) {
      agol.log('error', 'Request worker job failed ' + jobErr)

      koop.Cache.getInfo(key, function (err, info) {
        if (err || !info) {
          return removeJob(job)
        }

        kue.Job.get(job.id, function (err, job) {
          if (err) agol.log('error', 'Could not get job from queue ' + err)
          var errJson
          try {
            errJson = JSON.parse(job._error)
            info.paging_failed = {error: errJson}
          } catch (e) {
            errJson = {response: job._error}
          }
          info.paging_failed = {error: errJson}
          info.generating = {
            error: {
              code: errJson.code,
              request: errJson.request,
              response: errJson.response,
              message: 'Failed to cache the data'
            }
          }
          koop.Cache.updateInfo(key, info, function (err, success) {
            if (err) {
              return
            }
            removeJob(job)
          })
        })
      })
    })

  }

  /**
   * Gets the feature service info
   * @param {string} url - the max number of features in the service
   * @param {number} layer - the id of the service layer
   * @param {function} callback - called when the service info comes back
   */
  agol.getFeatureServiceLayerInfo = function (url, layer, callback) {
    url = url + '/' + layer + '?f=json'
    agol.req(url, function (err, res) {
      try {
        var json = JSON.parse(res.body)
        json.url = url
        callback(err, json)
      } catch (e) {
        callback('failed to parse service info')
      }
    })
  }

  /**
   * Find and return the OID field from the list of fields on metadata
   * @param {object} info - metadata from the service
   */
  agol.getObjectIDField = function (info) {
    var field
    info.fields.forEach(function (f, i) {
      if (f.type === 'esriFieldTypeOID') {
        field = f.name
      }
    })
    return field
  }

  /**
   * Returns the count of jobs on each Kue queue
   * @param {function} callback - a function to call when all counts have returns
   */
  agol.getQueueCounts = function (callback) {
    var response = {}
    var error
    var count = 0
    var jobTypes = ['inactiveCount', 'activeCount', 'completeCount', 'failedCount', 'delayedCount']
    // for (var type in jobTypes){
    function getJobCounts (type) {
      koop.collectQStats(agol.worker_q, response, type, function (err, json) {
        count++
        if (err) {
          error = err
        }
        // save the response
        response = json

        // get more if there are more types
        if (jobTypes[count]) {
          getJobCounts(jobTypes[count])
        } else {
          // return the response
          if (error) {
            callback(error)
          } else {
            callback(null, response)
          }
        }
      })
    }
    getJobCounts(jobTypes[count])
  }

  /**
   * Puts the dataset into a state of processes
   * makes async call to create the geohash
   * saves the geohash agg into the file given
   * @param {string} params - request params from the url
   * @param {string} filePath - the path of the file to be saved
   * @param {string} fileName - the name of the file to save, determined by request params
   * @param {object} options - optional params from the url querystring
   * @param {function} callback - callback to call when the requests are done
   */
  agol.buildGeohash = function (params, filePath, fileName, options, callback) {
    var key = [ 'agol', params.item, params.layer ].join(':')

    agol.getInfo(key, function (err, info) {
      if (err) return callback(err)
      // put the dataset into a state of process via update info
      info.geohashStatus = 'processing'
      koop.Cache.updateInfo(key, info, function (err, success) {
        if (err) return callback(err)
        // trigger the callback right away so we can return 202 until it done
        // if we dont have a where filter then we return with processes (async)
        if (!options.where) {
          callback()
        }
        // get the geohash page from the DB
        agol.getGeoHash(key, options, function (err, agg) {
          if (err) return callback(err)
          // save the file
          agol.saveFile(filePath, fileName, JSON.stringify(agg), function (err) {
            if (err) return callback(err)
            // remove status processing
            delete info.geohashStatus
            koop.Cache.updateInfo(key, info, function (err, success) {
              if (err) return callback(err)
              // if we DO have a where filter then we can return the agg right away
              if (options.where) {
                callback(null, agg)
              }
            })
          })
        })
      })
    })
  }

  /**
   * Checks to see if an item is expired or not
   * @param {object} info - metadata from the service
   * @param {number} layerId - the number of the layer in the request
   * @param {function} callback - callback to call when the requests are done
   */
  agol.isExpired = function (info, layerId, callback) {
    var isExpired = info ? (new Date().getTime() >= info.expires_at) : false

    if (info && info.info && info.info.url) {
      // clean up the url; remove layer at the end just in case
      var url = info.info.url.replace('?f=json', '')
      var layer = url.split('/').pop()
      if (parseInt(layer, 0) >= 0) {
        var len = ('' + layer).length
        url = url.substring(0, url.length - ((len || 2) + 1))
      }

      agol.getFeatureServiceLayerInfo(url, layerId, function (err, serviceInfo) {
        if (err) return callback(err)
        // check for info on last edit date (for hosted services dont expired unless changed)
        // set isExpired to false if it hasnt changed or if its null
        if (info && info.retrieved_at && serviceInfo && serviceInfo.editingInfo) {
          if (!serviceInfo.editingInfo.lastEditDate && (info.retrieved_at > info.info.modified)) {
            isExpired = false
          } else if (info.retrieved_at < serviceInfo.editingInfo.lastEditDate) {
            isExpired = true
          } else {
            // if the retrieved at date is greater than the lastEditDate then the data are still good
            isExpired = false
          }
        }
        callback(null, isExpired)
      })
    } else {
      callback(null, isExpired)
    }
  }

  return agol
}

module.exports = AGOL
