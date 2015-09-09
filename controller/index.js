var https = require('https')
var Sm = require('sphericalmercator')
var merc = new Sm({size: 256})
var fs = require('fs')
var Utils = require('../lib/utils.js')

var Controller = function (agol, BaseController) {
  /**
   * The primary controller onto which all methods are attached
   * @module Controller
   */
  var controller = BaseController()

  /**
  * Manages shared logic for any request that needs a host or key
  *
  * @param {object} req - the incoming request object
  * @param {object} res - the outgoing response object
  * @param {function} next - calls the next route handler
  */
  // TODO remove this and just call it from different functions
  controller.setHostKey = function (req, res, next) {
    agol.log.debug(JSON.stringify({
      route: 'setHostKey',
      params: req.params,
      query: req.query
    }))

    if (!req.params.id) return next()
    req.optionKey = Utils.createCacheKey(req.params, req.query)
    agol.find(req.params.id, function (err, data) {
      if (err) return res.status(404).send(err)
      req.portal = data.host
      next()
    })
  }

  /**
   * Registers a host with the given id
   * this inserts a record into the db for an ArcGIS instances ie: id -> hostname :: arcgis -> arcgis.com
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.register = function (req, res) {
    if (!req.body.host) {
      return res.status(400).send('Must provide a host to register')
    }

    agol.register(req.body.id, req.body.host, function (err, id) {
      if (err) {
        return res.status(400).send(err)
      }
      res.json({ 'serviceId': id })
    })
  }

  /**
   * handles a DELETE to remove a registered host from the DB
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.del = function (req, res) {
    if (!req.params.id) {
      return res.status(400).send('Must specify a service id')
    }

    agol.remove(req.params.id, function (err, data) {
      if (err) {
        return res.status(400).send(err)
      }
      res.json(data)
    })
  }

  // returns a list of the registered hosts and thier ids
  /**
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.list = function (req, res) {
    agol.find(null, function (err, data) {
      if (err) {
        return res.status(500).send(err)
      }
      res.json(data)
    })
  }

  /**
   * looks up a host based on a given id
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.find = function (req, res) {
    res.status(200).json(req.portal)
  }

  /**
   * get the item metadata from the host
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.findItem = function (req, res) {
    if (req.params.format) {
      return this.findItemData(req, res)
    }
    // Get the item
    agol.getItem(req.portal, req.params.item, req.query, function (error, itemJson) {
      if (error) {
        return res.status(404).send(error)
      }
      res.json(itemJson)
    })
  }

  /**
   * Drops the cache for an item
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.dropItem = function (req, res) {
    // if we have a layer then append it to the query params
    if (req.params.layer) {
      req.query.layer = req.params.layer
    }
    // Get the item
    agol.dropItem(req.portal, req.params.item, req.query, function (error, itemJson) {
      if (error) {
        return res.status(error.code || 400).send(error)
      }
      res.json(itemJson)
    })
  }

  /**
   * Gets the actual json data from the model
   *
   * @param {object} params - required params used to fetch data
   * @param {object} options - optional query string based params
   * @param {function} callback
   */
  controller._getItemData = function (req, res, callback) {
    agol.log.debug(JSON.stringify({
      route: '_getItemData',
      params: req.params,
      query: req.query
    }))

    var params = req.params
    var options = req.query
    var id = params.id
    var item = params.item

    // Get the item
    if (!parseInt(options.layer, 10)) {
      options.layer = 0
    }

    agol.getItemData(req.portal, id, item, req.optionKey, options, function (error, itemJson) {
      if (error) return callback(error)
      var itemExists = typeof itemJson !== 'undefined' && itemJson !== null
      var isProcessing = itemExists && itemJson.koop_status === 'processing'
      var isFailed = itemExists && itemJson.koop_status === 'Failed'
      var silent = typeof req.params.silent !== 'undefined'

      if ((isProcessing || isFailed) && !silent) {
        return controller._returnStatus(req, res, itemJson, callback)
      }
      callback(null, itemJson)
    })
  }

  /**
   * Finds the item's data
   * this method is crux of the controller. It handles the logic for returning data in several forms:
   *   - status processing return 202
   *   - status is processing but a file exists
   *   - a file exists for the data
   *   - a new file needs to be created
   *   - no format given, just returns json
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.findItemData = function (req, res) {
    agol.log.debug(JSON.stringify({
      route: 'findItemData',
      params: req.params,
      query: req.query
    }))

    req.tableKey = controller._createTableKey('agol', req.params)

    // returns data in the data
    agol.getInfo(req.tableKey, function (err, info) {
      if (err) agol.log.info(err.message)
      if (info && info.status && info.status === 'Failed') {
        // TODO logic so that things don't stay failed for more than x amount of time
        return controller._returnStatus(req, res, info)
      }

      // parse the spatial ref if we have one,
      // if its whitelisted remove it from the query object
      if (req.query.outSR) {
        var sr = agol.parseSpatialReference(req.query.outSR)
        if (sr && sr.wkid && [3785, 3857, 4326, 102100].indexOf(sr.wkid) !== -1) {
          delete req.query.outSR
        }
      }

      req.params.key = req.optionKey

      // determine if this request is for a filtered dataset
      req.query.isFiltered = (req.query.where || req.query.geometry)

      // if the status is processing we either return with a file or a 202
      if (info && info.status === 'processing') {
        if (req.params.format) {
          return controller._returnStatusFile(req, res, info)
        }
        return controller._returnStatus(req, res, info)
      }

      // check format for exporting data
      if (req.params.format) return controller.download(req, res, info)

      // if we have a layer then append it to the query params
      if (req.params.layer) {
        req.query.layer = req.params.layer
      }
      // get the esri json data for the service
      controller._getItemData(req, res, function (err, itemJson) {
        // when silent is sent as a param undefined
        if (typeof req.params.silent === 'undefined') {
          if (err) {
            agol.setFail(req.tableKey, err, function (e) {
              agol.log.error(e.message)
            })
            // if we cannot get the item assume it was a bad request
            return res.status(502).json(err)
          }

          // TODO remove hard coded maxRecCount
          if (itemJson && itemJson.data && itemJson.data[0].features.length > 1000) {
            itemJson.data[0].features = itemJson.data[0].features.splice(0, 1000)
          }
          return res.status(200).json(itemJson)
        }
      })
    })
  }

  /**
   * Handles the process for downloads
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   * @param {object} info - information about a arcgis online item
   */
  controller.download = function (req, res, info) {
    agol.log.debug(JSON.stringify({
      route: 'download',
      params: req.params,
      query: req.query
    }))

    var dir = req.params.item + '_' + (req.params.layer || 0)
    var path
    // file params for building an export file
    var fileParams = {
      req: req,
      res: res,
      dir: dir,
      key: req.optionKey,
      format: req.params.format,
      id: req.params.item,
      type: 'agol'
    }

    // force an override on the format param if given a format in the query
    if (req.query.format) {
      req.params.format = req.query.format
    }

    // redirect to thumbnail for png access
    if (req.params.format === 'png') {
      return controller.thumbnail(req, res)
    }

    // create the file path
    path = controller._createFilePath(req.optionKey, req.params)
    // the file name for the export
    fileParams.fileName = controller._createName(info, req.optionKey, req.params.format)

    // does the data export already exist?
    agol.files.exists(path, fileParams.fileName, function (exists, path) {
      // save the item layer
      req.query.layer = (!parseInt(req.params.layer, 0)) ? 0 : req.params.layer

      agol.getItem(req.portal, req.params.item, req.query, function (err, itemJson) {
        // if we cannot get the item assume it was a bad request. no need to set anything in the DB
        if (err) return controller._returnStatus(req, res, info, err)

        if (exists) {
          agol.isExpired(info, req.query.layer, function (err, isExpired) {
            // if we got an error on this, we don't want to set anything in the DB because we've seen this file before
            // the problem may only be temporary
            if (err) return controller._returnStatus(req, res, info, err)
            if (!isExpired) return controller._returnFile(req, res, path, fileParams.fileName)

            // if it's expired, then remove the data and request a new file
            agol.dropItem(req.portal, req.params.item, req.query, function () {
              req.query.format = req.params.format
              controller._getItemData(req, res, function (err, itemJson) {
                // if this fails, we should set a failure in the DB and return a failure to the client
                // the failure below happened while actually trying to get data, that's why we set it in the DB
                if (err) {
                  agol.setFail(req.tableKey, err, function (e) {
                    if (e) agol.log.error(e.message)
                  })
                  return controller._returnStatus(req, res, info, err)
                }
                fileParams.itemJson = itemJson
                fileParams.data = (itemJson && itemJson.data && itemJson.data[0]) ? itemJson.data[0] : null
                // var used to request new files if needed.
                controller._requestNewFile(fileParams)
              })
            })
          })
        } else {
          req.query.format = req.params.format
          controller._getItemData(req, res, function (err, itemJson) {
            if (err) {
              agol.setFail(req.tableKey, err, function (error) {
                if (error) agol.log.error(error.message)
              })
              return controller._returnStatus(req, res, info, err)
            }
            fileParams.err = err
            fileParams.itemJson = itemJson
            fileParams.data = (itemJson && itemJson.data && itemJson.data[0]) ? itemJson.data[0] : null
            controller._requestNewFile(fileParams)
          })
        }
      })
    })
  }

  /**
   * Get the expiration date for a resource
   * @param {object} req - the incoming request
   * @param {object} res - the outgoing response
   */
  controller.getExpiration = function (req, res) {
    var table = controller._createTableKey('agol', req.params)
    agol.getExpiration(table, function (err, expiration) {
      if (err) return res.status(404).json({error: err.message})
      res.status(200).json({expires_at: new Date(expiration)})
    })
  }

  /**
   * Set the expiration date for a resource
   * @params {object} req - the incoming request
   * @params {object} res - the outgoing response
   */
  controller.setExpiration = function (req, res) {
    var table = controller._createTableKey('agol', req.params)
    agol.setExpiration(table, req.body.expires_at, function (err, timestamp) {
      if (err) {
        if (err.message === 'Resource not found') {
          var options = {
            layer: req.params.layer,
            // todo this needs to pass through the same validation
            expiration: timestamp
          }
          agol.getItemData(req.portal, req.params.id, req.params.item, req.optionsKey, options, function (err, json) {
            if (err) return res.status(500).send(err)
            // we need to convert the date from unix time only for the response
            return res.status(201).json({
              status: 'processing',
              expires_at: new Date(timestamp).toISOString()
            })
          })
        } else {
          // This will trigger if the expiration doesn't validate
          return res.status(400).send({error: err.message})
        }
      } else {
        res.status(200).json({expires_at: new Date(timestamp).toISOString()})
      }
    })
  }

  /**
   * Create key used to query a table in the cache
   *
   * @params {string} type - the type of the providers ("agol")
   * @params {object} params - an object with an item id and layer number
   *
   * @returns {string} key
   * @private
   */
  controller._createTableKey = function (type, params) {
    return [type, params.item, (params.layer || 0)].join(':')
  }

  /**
   * Stub a route redirect to make testing private functions easier
   */
  controller.testRoute = function (req, res) {
    controller.testMethod(req, res)
  }

  /**
   * Stub a method for test route than can be easily wrapped
   */
  controller.testMethod = function (req, res) {
    res.status(418).send('Nothing to see here.')
  }

  /**
   * Respond to a request for file downloads when a dataset is still "processing"
   * if the file exists send it, else return processing 202
   *
   * @params {object} type - the type of the providers ("agol")
   * @params {object} params - an object with an item id and layer number
   * @params {object} info - item metadata from the cache
   * @private
   */
  controller._returnStatusFile = function (req, res, info) {
    // create the file path
    var path = controller._createFilePath(req.params.key, req.params)
    // get the name of the data; else use the key (md5 hash)
    var fileName = controller._createName(info, req.params.key, req.params.format)
    // TODO why are we checking if the file exists again?
    agol.files.exists(path, fileName, function (exists, path) {
      if (exists) {
        return controller._returnFile(req, res, path, fileName)
      }
      controller._returnStatus(req, res, info)
    })
    return
  }

  /**
   * Respond to a requests with a "processing" response
   *
   * @params {object} type - the type of the providers ("agol")
   * @params {object} params - an object with an item id and layer number
   * @params {object} info - item metadata from the cache
   * @private
   */
  controller._returnStatus = function (req, res, info, error) {
    var table = controller._createTableKey('agol', req.params)
    if (typeof req.params.silent === 'undefined') {
      agol.getCount(table, {}, function (err, count) {
        if (err) {
          agol.log('error', 'Failed to get count of rows in the DB' + ' ' + err)
          // don't let db messages leak out
        }

        // if we failed to get info from AGOL the info object will be null so initialize it
        if (!info) info = {retrieved_at: Date.now(), status: 'Failed'}

        // if we have a passed in error or the info doc says error then this request is errored and we should send a 502 with status failed
        var errored = (error && error.message) || (info.generating && info.generating.error)
        var code = errored ? 502 : 202
        var status = errored ? 'Failed' : (info.status || 'Processing')

        // TODO: we need some logic around reporting long processing times
        var processingTime = (Date.now() - info.retrieved_at) / 1000 || 0

        // set up a shell of the response
        var response = {
          status: status,
          processing_time: processingTime,
          count: count
        }

        // tack on info from the DB if it's available
        if (info.generating) response.generating = info.generating

        // tack on information from a passed in error if it's available
        if (error && error.message) response.generating = Utils.failureMsg(error)
        res.status(code).json(response)
      })
    }
  }

  /**
   * Creates a clean and normalized name to be used in things like files on disk
   *
   * @params {string} type - the type of the providers ("agol")
   * @params {object} params - an object with an item id and layer number
   *
   * @returns {string} key
   * @private
   */
  controller._createName = function (info, key, format) {
    var name = (info && info.info) ? info.name || info.info.name || info.info.title : key
    name = (name.length > 150) ? name.substr(0, 150) : name

    var fileName = name + '.' + format
    fileName = fileName.replace(/\/|,|&|\|/g, '').replace(/ /g, '_').replace(/\(|\)/g, '')

    return fileName
  }

  /**
   * Creates a clean file path for files exports
   *
   * @params {string} type - the type of the providers ("agol")
   * @params {object} params - an object with an item id and layer number
   *
   * @returns {string} key
   * @private
   */
  controller._createFilePath = function (key, params) {
    var dir = params.item + '_' + (params.layer || 0)
    return ['files', dir, key].join('/')
  }

  /**
   * Create key used to query a table in the cache
   *
   * @params {string} type - the type of the providers ("agol")
   * @params {object} params - an object with an item id and layer number
   *
   * @returns {string} key
   * @private
   */
  controller._requestNewFile = function (params) {
    agol.log.debug(JSON.stringify({
      route: '_requestNewFile',
      params: params.req.params,
      query: params.req.query
    }))

    var res = params.res
    var itemJson = params.itemJson

    if (params.err) {
      return res.status(params.err.code || 400).send(params.err.error || params.err)
    }

    // flatten the data from an array to sep objects/arrays
    var itemData
    var itemFeatures
    if (itemJson && itemJson.data && itemJson.data[0]) {
      itemData = itemJson.data[0]
    }

    if (itemData && itemData.features) {
      itemFeatures = itemData.features
    }

    if (!itemFeatures || !itemFeatures.length) {
      return res.status(404).send('No features exist for the requested FeatureService layer')
    }

    // this logic sure does suck...
    var name = (itemJson && itemJson.data && itemJson.data[0] && (itemJson.data[0].name || (itemJson.data[0].info && itemJson.data[0].info.name))) ? itemJson.data[0].name || itemJson.data[0].info.name : itemJson.name || itemJson.title
    // cleanze the name
    name = name.replace(/\/|,|&\|/g, '').replace(/ /g, '_').replace(/\(|\)|\$/g, '')
    name = (name.length > 150) ? name.substr(0, 150) : name
    params.name = name

    if ((itemJson.koop_status && itemJson.koop_status === 'too big') || agol.forceExportWorker) {
      return controller._exportLarge(params)
    }

    if (itemJson && itemJson.data && itemJson.data[0]) {
      return controller._exportToFormat(params)
    }

    return res.status(400).send('Could not create export, missing data')
  }

  /**
   * Exports a large dataset
   * calls the exportLarge method on the agol model
   * @param {objects} params - file export parameters
   */
  controller._exportLarge = function (params) {
    agol.log.debug(JSON.stringify({
      route: '_requestNewFile',
      params: params.req.params,
      query: params.req.query
    }))

    var req = params.req
    var res = params.res
    var itemJson = params.itemJson
    req.query.name = params.name

    // set the geometry type so the exporter can do its thing for csv points (add x,y)
    if (itemJson.data && itemJson.data && itemJson.data.info && itemJson.data.info.geometryType) {
      req.query.geomType = itemJson.data[0].info.geometryType
    }

    // force export of large data
    req.query.large = true

    agol.exportFile(params, req.query, function (err, result) {
      if (err) {
        return res.status(err.code || 400).send(err)
      }

      return controller._returnStatus(req, res, itemJson)
    })
  }

  /**
   * Exports "non-large" data to a file format
   * @param {objects} params - file export parameters
   */
  controller._exportToFormat = function (params) {
    var req = params.req
    var res = params.res

    var format = req.params.format
    var options = {
      isFiltered: req.query.isFiltered,
      name: params.name,
      outSR: req.query.outSR
    }

    if (params.itemJson.metadata) {
      options.metadata = params.itemJson.metadata
    }

    agol.exportFile(params, options, function (err, result) {
      if (err) {
        return res.status(err.code || 400).send(err)
      }

      if (req.query.url_only) {
        var origUrl = req.originalUrl.split('?')
        origUrl[0] = origUrl[0].replace(/json/, format)
        var newUrl = req.protocol + '://' + req.get('host') + origUrl[0] + '?'
        newUrl += origUrl[1]
          .replace(/url_only=true&|url_only=true|/, '')
          .replace('format=' + format, '')
          .replace('&format=' + format, '')

        return res.json({url: newUrl})
      }

      res = controller._setHeaders(res, params.name, format)
      if (result.substr(0, 4) === 'http') {
        // Proxy to s3 urls allows us to not show the URL
        return https.get(result, function (proxyRes) {
          proxyRes.pipe(res)
        })
      } else {
        res.sendFile(result)
      }
    })
  }

  /**
   * Returns a file as either a URL or an actual file download
   *
   * @params {object} request object
   * @params {object} response object
   * @params {string} path - the path the file
   * @params {string} name - the name of the file
   * @private
   */
  controller._returnFile = function (req, res, path, name) {
    agol.log.debug(JSON.stringify({
      route: '_returnFile',
      params: req.params,
      query: req.query,
      path: path,
      name: name
    }))

    var format = req.params.format
    if (req.query.url_only) {
      var origUrl = req.originalUrl.split('?')
      origUrl[0] = origUrl[0].replace(/json/, format)
      var newUrl = req.protocol + '://' + req.get('host') + origUrl[0] + '?'
      newUrl += origUrl[1]
        .replace(/url_only=true&|url_only=true|/, '')
        .replace('format=' + format, '')
        .replace('&format=' + format, '')

      return res.json({url: newUrl})
    }

    // forces browsers to download
    res = controller._setHeaders(res, name, format)

    if (path.substr(0, 4) === 'http') {
      // Proxy to s3 urls allows us to not show the URL
      return https.get(path, function (proxyRes) {
        proxyRes.pipe(res)
      })
    }

    return res.sendFile(path)
  }

  /**
   * Set file download headers for data exports
   * adds the content-disposition and content-type bases on the file format
   *
   * @params {object} response object
   * @params {string} name - the name of the file
   * @params {string} format - the exported file format
   * @returns {object} response
   */
  controller._setHeaders = function (res, name, format) {
    res.setHeader('Content-disposition', 'attachment; filename=' + (encodeURIComponent(name)))
    var formats = {
      json: 'application/json',
      geojson: 'application/json',
      kml: 'application/vnd.google-earth.kml+xml',
      csv: 'text/csv',
      zip: 'application/octet-stream'
    }
    return res.contentType(formats[format])
  }

  /**
   * Handles all requests for FeatureServices
   */
  controller.featureserver = function (req, res) {
    agol.log.debug(JSON.stringify({
      route: 'featureserver',
      params: req.params,
      query: req.query
    }))

    // check for geohash route and redirect
    if (req.params.method && req.params.method === 'geohash') return controller.getGeohash(req, res)

    // hang on to this callback in case it's a JSONP request
    var callback = req.query.callback

    // support POST requests; map body vals to the query
    // (then all same as GET)
    for (var k in req.body) {
      if (req.body[k]) {
        req.query[k] = req.body[k]
      }
    }

    if (!req.params.layer) {
      req.query.layer = 0
    }

    // set a really high limit so large datasets can be turned into feature services
    req.query.limit = req.query.limit || req.query.resultRecordCount || 1000000000
    req.query.offset = req.query.resultOffset || null
    agol.getItemData(req.portal, req.params.id, req.params.item, req.optionKey, req.query, function (error, itemJson) {
      if (error) {
        return res.status(error.code || 500).send(error.error || error)
      }

      // pass to the shared logic for FeatureService routing
      delete req.query.geometry
      delete req.query.where
      controller.processFeatureServer(req, res, null, itemJson.data, callback)
    })
  }

  /**
   * Handles request for thubmnails
   */
  controller.thumbnail = function (req, res) {
    var dir
    var layer

    layer = (req.params.layer || 0)

    // check the image first and return if exists
    dir = '/thumbs'
    req.query.width = parseInt(req.query.width, 0) || 150
    req.query.height = parseInt(req.query.height, 0) || 150
    req.query.f_base = dir + '/' + req.params.item + '_' + layer + '/' + req.params.item + '::' + req.query.width + '::' + req.query.height
    var png = req.query.f_base + '.png'

    agol.files.exists(null, png, function (exists) {
      if (exists) {
        return res.sendFile(png)
      }

      // if we have a layer then pass it along
      if (req.params.layer) {
        req.query.layer = req.params.layer
      }

      // Get the item
      agol.getItemData(req.portal, req.params.id, req.params.item, req.optionKey, req.query, function (error, itemJson) {
        if (error) {
          return res.status(500).send(error)
        }
        if (itemJson.extent && itemJson.extent.length) {
          req.query.extent = {
            xmin: itemJson.extent[0][0],
            ymin: itemJson.extent[0][1],
            xmax: itemJson.extent[1][0],
            ymax: itemJson.extent[1][1]
          }
        }

        // generate a thumbnail
        delete itemJson.data[0].info
        agol.generateThumbnail(itemJson.data[0], req.params.item + '_' + req.params.layer, req.query, function (err, file) {
          if (err) {
            return res.status(500).send(err)
          }

          // send back image
          res.sendFile(file)
        })
      })
    })
  }

  /**
   * renders the preview map view
   */
  controller.preview = function (req, res) {
    agol.log('info', 'Render preview ' + JSON.stringify(req.params))
    res.render(__dirname + '/../views/demo', { locals: { host: req.params.id, item: req.params.item } })
  }

  /**
   * Tile request handler, responds to z/x/y tile requests
   *
   */
  controller.tiles = function (req, res) {
    var callback = req.query.callback
    var key
    var layer = req.params.layer || 0

    // if no format given default to png
    if (!req.params.format) {
      req.params.format = 'png'
    }

    // Get the tile and send the response to the client
    var _send = function (err, data) {
      if (err) {
        return res.status(500).send(err)
      }
      req.params.name = (data && data[0]) ? data[0].name : null
      req.params.key = req.params.item + '_' + layer
      agol.tileGet(req.params, (data && data[0]) ? data[0] : {}, function (err, tile) {
        if (err) {
          return res.status(err.code || 500).send(err.message || 'Unknown error while creating the tile')
        }

        if (req.params.format === 'pbf') {
          res.setHeader('content-encoding', 'deflate')
        }

        if (req.params.format === 'png' || req.params.format === 'pbf') {
          return res.sendFile(tile)
        }

        if (callback) {
          return res.send(callback + '(' + fs.readFileSync(JSON.parse(tile)) + ')')
        }
        return res.json(JSON.parse(fs.readFileSync(tile)))
      })
    }

    // build the geometry from z,x,y
    var bounds = merc.bbox(req.params.x, req.params.y, req.params.z, false, '4326')
    req.query.geometry = {
      xmin: bounds[0],
      ymin: bounds[1],
      xmax: bounds[2],
      ymax: bounds[3],
      spatialReference: { wkid: 4326 }
    }

    var _sendImmediate = function (file) {
      if (req.params.format === 'pbf') {
        res.setHeader('content-encoding', 'deflate')
      }

      if (req.params.format === 'png' || req.params.format === 'pbf') {
        return res.sendFile(file)
      }

      if (callback) {
        return res.send(callback + '(' + JSON.parse(fs.readFileSync(file)) + ')')
      }

      return res.json(JSON.parse(fs.readFileSync(file)))
    }

    key = [req.params.item, layer].join('_')
    var file = agol.files.localDir + '/tiles/'
    file += key + '/' + req.params.format
    file += '/' + req.params.z + '/' + req.params.x + '/' + req.params.y + '.' + req.params.format

    var jsonFile = file.replace(/png|pbf|utf/g, 'json')

    // if the json file alreadty exists, dont hit the db, just send the data
    if (fs.existsSync(jsonFile) && !fs.existsSync(file)) {
      _send(null, fs.readFileSync(jsonFile))
    } else if (!fs.existsSync(file)) {
      // if we have a layer then pass it along
      if (req.params.layer) {
        req.query.layer = req.params.layer
      }

      var factor = 0.1
      req.query.simplify = ((Math.abs(req.query.geometry.xmin - req.query.geometry.xmax)) / 256) * factor

      // make sure we ignore the query limit of 2k
      req.query.enforce_limit = false

      // Get the item
      agol.getItemData(req.portal, req.params.id, req.params.item, req.optionKey, req.query, function (error, itemJson) {
        if (error) {
          if (itemJson && itemJson.type === 'Image Service' && req.params.format === 'png') {
            agol.getImageServiceTile(req.params, function (err, newFile) {
              if (err) {
                return res.status(500).send(err)
              }
              _sendImmediate(newFile)
            })
          } else {
            res.status(error.code || 500).send(error)
          }
        } else {
          _send(error, itemJson.data)
        }
      })
    } else {
      _sendImmediate(file)
    }
  }

  /**
   * Forced a drop of the cache for an item and DELETEs all known files
   * used for responding to DELETE calls.
   */
  controller.deleteItemData = function (req, res) {
    req.query.forceDelete = true
    controller.dropItem(req, res)
  }

  /**
   * Request handler for returning the counts of currently queued workers
   *
   */
  controller.getQueueCounts = function (req, res) {
    agol.getQueueCounts(function (err, response) {
      if (err) {
        return res.status(500).send(err)
      }
      res.json(response)
    })
  }

  /**
  * Get the geohash for an item/layer
  *
  *
  */
  controller.getGeohash = function (req, res) {
    agol.log.debug(JSON.stringify({
      route: 'getGeohash',
      params: req.params,
      query: req.query
    }))

    // used for asking if we have the data already
    var tableKey = controller._createTableKey('agol', req.params)

    // Determine if we have the file first
    // -------------------------------------
    var key = req.params.item + '_' + req.params.layer
    var filePath = ['latest', 'files', key].join('/')
    var fileName = req.optionKey + '.geohash.json'

    // does it exist?
    agol.files.exists(filePath, fileName, function (exists, path, fileInfo) {
      agol.getInfo(tableKey, function (err, info) {
        if (err || !info) {
          return controller.findItemData(req, res)
        } else if (info && (info.status === 'processing' || info.geohashStatus === 'processing')) {
          // if we have a file send it, else return processing
          if (exists) {
            // send back the geohash, but send fileInfo to set the expired header
            return controller.returnGeohash(req, res, path, fileInfo)
          }
          return res.status(202).json({ status: 'processing' })

        } else {
          // need to know if the data are expired or not
          var isExpired = (info.retrieved_at && fileInfo && fileInfo.LastModified) ?
            (new Date(info.retrieved_at) > new Date(fileInfo.LastModified)) :
            false

          if (!exists) {
            // doesnt exist; must create the new aggregation file
            req.params.silent = false
            controller.createGeohash(req, res, filePath, fileName)
          } else if (exists && !isExpired) {
            controller.returnGeohash(req, res, path)
          } else {
            // a file exists and its NOT expired...
            controller.returnGeohash(req, res, path, fileInfo) // returns the file
            // make we dont try to send a request response again (set silent: true)
            req.params.silent = true
            controller.createGeohash(req, res, filePath, fileName) // creates a new geohash.
          }
        }
      })
    })
  }

  controller.returnGeohash = function (req, res, path, info) {
    res.contentType('application/json')
    if (info && info.LastModified) {
      res.set('X-Expired', info.LastModified)
      res.set('Access-Control-Allow-Headers', 'X-Expired')
      res.set('Access-Control-Expose-Headers', 'X-Expired')
    }
    if (path.substr(0, 4) === 'http') {
      // Proxy to s3 urls allows us to not show the URL
      https.get(path, function (proxyRes) {
        proxyRes.pipe(res)
      })
    } else {
      res.sendFile(path)
    }
  }

  controller.createGeohash = function (req, res, filePath, fileName) {
    agol.buildGeohash(req.params, filePath, fileName, req.query, function (err, agg) {
      if (err) {
        return res.status(500).send(err)
      }
      if (!req.params.silent) {
        if (!agg) {
          return res.status(202).json({ status: 'processing' })
        } else {
          return res.json(agg)
        }
      }
    })
  }

  return controller

}

module.exports = Controller
