var https = require('https')
var Sm = require('sphericalmercator')
var merc = new Sm({size: 256})
var crypto = require('crypto')
var _ = require('lodash')
var fs = require('fs')

/**
 * Inherit from the koop base controller
 * handles requests for routes
 */
var Controller = function (agol, BaseController) {
  var controller = BaseController()

  /**
   * Registers a host with the given id
   * this inserts a record into the db for an ArcGIS instances ie: id -> hostname :: arcgis -> arcgis.com
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.register = function (req, res) {
    if (!req.body.host) {
      res.status(400).send('Must provide a host to register')
    } else {
      agol.register(req.body.id, req.body.host, function (err, id) {
        if (err) {
          res.status(400).send(err)
        } else {
          res.json({ 'serviceId': id })
        }
      })
    }
  }

  /**
   * handles a DELETE to remove a registered host from the DB
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.del = function (req, res) {
    if (!req.params.id) {
      res.status(400).send('Must specify a service id')

    } else {
      agol.remove(req.params.id, function (err, data) {
        if (err) {
          res.status(400).send(err)
        } else {
          res.json(data)
        }
      })
    }
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
        res.status(500).send(err)
      } else {
        res.json(data)
      }
    })
  }

  // looks up a host based on a given id
  /**
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.find = function (req, res) {
    agol.find(req.params.id, function (err, data) {
      if (err) {
        res.status(err.code || 404).send(err)
      } else {
        res.json(data)
      }
    })
  }

  // get the item metadata from the host
  /**
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.findItem = function (req, res) {
    if (req.params.format) {
      this.findItemData(req, res)
    } else {
      agol.find(req.params.id, function (err, data) {
        if (err) {
          res.status(err.code || 404).send(err)
        } else {
          // Get the item
          agol.getItem(data.host, req.params.item, req.query, function (error, itemJson) {
            if (error) {
              res.status(404).send(error)
            } else {
              res.contentType('text')
              res.json(itemJson)
            }
          })
        }
      })
    }
  }

  // drops the cache for an item
  /**
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.dropItem = function (req, res) {
    // if we have a layer then append it to the query params
    if (req.params.layer) {
      req.query.layer = req.params.layer
    }

    agol.find(req.params.id, function (err, data) {
      if (err) {
        res.status(err.code || 404).send(err)
      } else {
        // Get the item
        agol.dropItem(data.host, req.params.item, req.query, function (error, itemJson) {
          if (error) {
            res.status(error.code || 400).send(error)
          } else {
            res.json(itemJson)
          }
        })
      }
    })
  }

  /**
   * find the items data
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.findItemData = function (req, res) {
    // closure that actually goes out gets the data
    var _get = function (params, options, callback) {
      var id = params.id
      var item = params.item
      var key = params.key

      agol.find(id, function (err, data) {
        if (err) {
          callback(err, null)
        } else {
          // Get the item
          if (!parseInt(options.layer, 0)) {
            options.layer = 0
          }

          agol.getItemData(data.host, id, item, key, options, function (error, itemJson) {
            if (error) {
              callback(error, null)
            // if we have status return right away
            } else if (itemJson.koop_status === 'processing' && typeof req.params.silent === 'undefined') {
              // return w/202
              agol.getCount(controller._createTableKey('agol', req.params), {}, function (err, count) {
                var code = 202
                var response = {
                  status: 'processing',
                  processing_time: (Date.now() - itemJson.retrieved_at) / 1000 || 0,
                  count: count
                }
                if (itemJson.generating) {
                  response.generating = itemJson.generating
                  // we received an error from the server
                  if (itemJson.generating.error || err) {
                    code = 502
                  }
                }
                res.status(code).json(response)
              })
            } else {
              callback(null, itemJson)
            }
          })
        }
      })
    }

    // CHECK the time since our last cache entry
    // if > 24 hours since; clear cache and wipe files
    // else move on
    var tableKey = controller._createTableKey('agol', req.params)
    agol.getInfo(tableKey, function (err, info) {
      if (err) {
        return res.status(500).send(err)
      }

      var dir, key, path, fileName

      // sort the req.query before we hash so we are consistent
      var sorted_query = {}
      _(req.query).keys().sort().each(function (key) {
        if (key !== 'url_only' && key !== 'format') {
          sorted_query[key] = req.query[key]
        }
      })

      // determine if this request is for a filtered dataset
      req.query.isFiltered = (req.query.where || req.query.geometry)

      // build the file key as an MD5 hash that's a join on the paams and look for the file
      var toHash = req.params.item + '_' + (req.params.layer || 0) + JSON.stringify(sorted_query)
      key = crypto.createHash('md5').update(toHash).digest('hex')
      req.params.key = key

      if (info && info.status === 'processing') {
        if (req.params.format) {
          // force an override on the format param if given a format in the query
          if (req.query.format) {
            req.params.format = req.query.format
            delete req.query.format
          }

          // this logic should be wrapped into a Function since its copied from below
          req.params.format = req.params.format.replace('geojson', 'json')
          dir = req.params.item + '_' + (req.params.layer || 0)
          path = ['files', dir, key].join('/')

          // get the name of the data; else use the key (md5 hash)
          fileName = controller.createName(info, key, req.params.format)

          // if we have a layer then append it to the query params
          if (req.params.layer) {
            req.query.layer = req.params.layer
          }

          agol.files.exists(path, fileName, function (exists, path) {
            if (exists) {
              controller.returnFile(req, res, path, fileName)
            } else {
              controller._returnProcessing()
            }
          })
        } else {
          controller._returnProcessing()
        }
      } else {
        // check format for exporting data
        if (req.params.format) {
          // force an override on the format param if given a format in the query
          if (req.query.format) {
            req.params.format = req.query.format
            delete req.query.format
          }

          // redirect to thumbnail for png access
          if (req.params.format === 'png') {
            controller.thumbnail(req, res)
          } else {
            // change geojson to json
            req.params.format = req.params.format.replace('geojson', 'json')
            // use the item as the file dir so we can organize exports by id
            dir = req.params.item + '_' + (req.params.layer || 0)
            path = [ 'files', dir, key ].join('/')

            // the file name for the export
            fileName = controller.createName(info, key, req.params.format)

            // if we have a layer then append it to the query params
            if (req.params.layer) {
              req.query.layer = req.params.layer
            }

            // does the data export already exist?
            agol.files.exists(path, fileName, function (exists, path) {
              // get the item data before we check for
              agol.find(req.params.id, function (err, data) {
                if (err) {
                  return res.status(500).send(err)
                }
                // Get the item
                req.query.layer = (!parseInt(req.params.layer, 0)) ? 0 : req.params.layer

                agol.getItem(data.host, req.params.item, req.query, function (err, itemJson) {
                  if (err) {
                    return res.status(500).send(err)
                  }
                  // agol.getItemData(data.host, req.params.id, req.params.item, key, req.query, function(error, itemJson){
                  if (exists) {
                    // check if the cache is expired
                    var is_expired = info ? (new Date().getTime() >= info.expires_at) : false

                    if (info.info.url) {
                      // clean up the url; remove layer at the end just in case
                      var url = info.info.url.replace('?f=json', '')
                      var url_parts = url.split('/')
                      var len = url_parts.length - 1
                      if (parseInt(url_parts[ len ], 0) >= 0) {
                        var lyrId = url_parts[ len ]
                        url = url.substring(0, url.length - ((('' + lyrId).split('').length || 2) + 1))
                      }

                      agol.getFeatureServiceLayerInfo(url, (req.params.layer || 0), function (err, serviceInfo) {
                        if (err) {
                          return res.status(500).send(err)
                        }
                        // check for info on last edit date (for hosted services dont expired unless changed)
                        // set is_expired to false if it hasnt changed or if its null
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

                        // return it.
                        // if expired -> remove the data and request
                        if (is_expired) {
                          agol.dropItem(data.host, req.params.item, req.query, function () {
                            req.query.format = req.params.format
                            _get(req.params, req.query, function (err, itemJson) {
                              // var used to request new files if needed.
                              var fileParams = {
                                req: req,
                                res: res,
                                dir: dir,
                                key: key,
                                err: err,
                                itemJson: itemJson
                              }
                              controller.requestNewFile(fileParams)
                            })
                          })
                        } else {
                          // else serve it
                          controller.returnFile(req, res, path, fileName)
                        }
                      })

                    } else {
                      // if expired -> remove the data and request
                      if (is_expired) {
                        agol.dropItem('', req.params.item, req.query, function () {
                          req.query.format = req.params.format
                          _get(req.params, req.query, function (err, itemJson) {
                            // var used to request new files if needed.
                            var fileParams = {
                              req: req,
                              res: res,
                              dir: dir,
                              key: key,
                              err: err,
                              itemJson: itemJson
                            }
                            controller.requestNewFile(fileParams)
                          })
                        })
                      } else {
                        // else serve it
                        controller.returnFile(req, res, path, fileName)
                      }
                    }
                  } else {
                    // check the koop status table to see if we have a job running
                    // if we do then return
                    // else proceed
                    req.query.format = req.params.format
                    _get(req.params, req.query, function (err, itemJson) {
                      // var used to request new files if needed.
                      var fileParams = {
                        req: req,
                        res: res,
                        dir: dir,
                        key: key,
                        err: err,
                        itemJson: itemJson
                      }
                      controller.requestNewFile(fileParams)
                    })
                  }
                // })
                })
              })
            })
          }
        } else {
          // if we have a layer then append it to the query params
          if (req.params.layer) {
            req.query.layer = req.params.layer
          }
          // get the esri json data for the service
          _get(req.params, req.query, function (err, itemJson) {
            // when silent is sent as a param undefined
            if (typeof req.params.silent === 'undefined') {
              if (err) {
                if (err.code && err.error) {
                  res.status(err.code).send(err.error)
                } else {
                  res.status(404).send(err)
                }
              } else {
                if (itemJson && itemJson.data && itemJson.data[0].features.length > 1000) {
                  itemJson.data[0].features = itemJson.data[0].features.splice(0, 1000)
                }
                res.send(itemJson)
              }
            }
          })
        }
      }
    })
  }

  controller._createTableKey = function (type, params) {
    return [type, params.item, (params.layer || 0)].join(':')
  }

  controller._returnProcessing = function (req, res, info) {
    var table = controller._createTableKey('agol', req.params)

    if (typeof req.params.silent === 'undefined') {
      agol.getCount(table, {}, function (err, count) {
        if (err) {
          return res.status(500).send(err)
        }
        var code = 202

        // we need some logic around handling long standing processing times
        var processingTime = (Date.now() - info.retrieved_at) / 1000 || 0

        var response = {
          status: 'processing',
          processing_time: processingTime,
          count: count
        }
        if (info.generating) {
          response.generating = info.generating
          // we received an error from the server
          if (info.generating.error) {
            code = 502
          }
        }

        agol.log('debug', JSON.stringify({status: code, item: req.params.item, layer: (req.params.layer || 0)}))
        res.status(code).json(response)
      })
    }
  }

  controller.createName = function (info, key, format) {
    var name = (info && info.info) ? info.name || info.info.name || info.info.title : key
    name = (name.length > 150) ? name.substr(0, 150) : name
    var fileName = name + '.' + format
    fileName = fileName.replace(/\/|,|&|\|/g, '').replace(/ /g, '_').replace(/\(|\)/g, '')
    return fileName
  }

  controller.requestNewFile = function (params) {
    var name
    if (params.err) {
      return res.status(params.err.code || 400).send(params.err.error || params.err)
    }

    var itemJson = params.itemJson
    var req = params.req
    var res = params.res
    var dir = params.dir
    var key = params.key

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
      res.status(404).send('No features exist for the requested FeatureService layer')

    } else {
      // cleanze the name
      name = itemJson.info.name || itemData.info.title || itemJson.name || itemJson.title
      name = name.replace(/\/|,|&\|/g, '').replace(/ /g, '_').replace(/\(|\)|\$/g, '')
      name = (name.length > 150) ? name.substr(0, 150) : name

      if (itemData &&
        itemData.info &&
        itemData.info.extent &&
        itemData.info.extent.spatialReference) {
        var spatialRef = itemData.info.extent.spatialReference

        var wkid = parseInt(spatialRef.latestWkid, 0)
        if (wkid && ([3785, 3857, 4326, 102100].indexOf(wkid) === -1) && !req.query.wkid) {
          req.query.wkid = wkid
        } else if (spatialRef.wkt && !req.query.wkid) {
          req.query.wkt = spatialRef.wkt
        }
      }

      var fileParams = {
        req: req,
        res: res,
        name: name,
        itemJson: itemJson,
        dir: dir,
        key: key
      }

      if ((itemJson.koop_status && itemJson.koop_status === 'too big') || agol.forceExportWorker) {
        controller.exportLarge(fileParams)
      } else if (itemJson && itemJson.data && itemJson.data[0]) {
        // req.params.format, params.dir, params.key, params.itemJson.
        controller.exportToFormat(fileParams)
      } else {
        res.status(400).send('Could not create export, missing data')
      }
    }

  }

  controller.exportLarge = function (params) {
    var req = params.req
    var res = params.res
    var itemJson = params.itemJson

    req.query.name = params.name

    // set the geometry type so the exporter can do its thing for csv points (add x,y)
    if (itemJson.data && itemJson.data && itemJson.data.info && itemJson.data.info.geometryType) {
      req.query.geomType = itemJson.data[0].info.geometryType
    }

    agol.exportLarge(req.params.format, req.params.item, params.key, 'agol', req.query, function (err, result) {
      if (err) {
        return res.status(err.code || 400).send(err)
      }

      if (result && result.status && result.status === 'processing') {
        var tableKey = controller._createTableKey('agol', req.params)
        agol.getCount(tableKey, {}, function (err, count) {
          if (err) {
            return res.status(500).send(err)
          }
          var code = 202

          var response = {
            status: 'processing',
            processing_time: (Date.now() - result.retrieved_at) / 1000 || 0,
            count: count
          }

          if (result.generating) {
            response.generating = result.generating
            // we received an error from the server
            if (result.generating.error) {
              code = 502
            }
          }
          res.status(code).json(response)
        })

      } else if (req.query.url_only) {
        // reuse this code...
        var origUrl = req.originalUrl.split('?')
        origUrl[0] = origUrl[0].replace(/json/, req.params.format)

        var newUrl = req.protocol + '://' + req.get('host') + origUrl[0] + '?' + origUrl[1]
            .replace(/url_only=true&|url_only=true|/, '')
            .replace('format=' + req.params.format, '')
            .replace('&format=' + req.params.format, '')

        res.json({url: newUrl})
      } else {
        if (req.params.format === 'json' || req.params.format === 'geojson') {
          res.contentType('text')
        }
        res.sendfile(result)
      }
    })
  }

  controller.exportToFormat = function (params) {
    var req = params.req
    var res = params.res

    var format = req.params.format

    agol.exportToFormat(format, params.dir, params.key, params.itemJson.data[0],
      { isFiltered: req.query.isFiltered,
        name: params.name,
      wkid: req.query.wkid }, function (err, result) {
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

          res.json({url: newUrl})

        } else {
          res = controller._setHeaders(res, params.name, format)

          if (result.substr(0, 4) === 'http') {
            // Proxy to s3 urls allows us to not show the URL
            https.get(result, function (proxyRes) {
              proxyRes.pipe(res)
            })
          } else {
            res.sendfile(result)
          }
        }
      })
  }

  controller.returnFile = function (req, res, path, name) {
    var format = req.params.format
    if (req.query.url_only) {
      var origUrl = req.originalUrl.split('?')
      origUrl[0] = origUrl[0].replace(/json/, format)
      var newUrl = req.protocol + '://' + req.get('host') + origUrl[0] + '?'
      newUrl += origUrl[1]
        .replace(/url_only=true&|url_only=true|/, '')
        .replace('format=' + format, '')
        .replace('&format=' + format, '')

      res.json({url: newUrl})
    } else {
      // forces browsers to download
      res = controller._setHeaders(res, name, format)
      if (path.substr(0, 4) === 'http') {
        // Proxy to s3 urls allows us to not show the URL
        https.get(path, function (proxyRes) {
          proxyRes.pipe(res)
        })
      } else {
        res.sendfile(path)
      }
    }
  }

  controller._setHeaders = function (res, name, format) {
    res.setHeader('Content-disposition', 'attachment; filename=' + (encodeURIComponent(name) + '.' + format))
    switch (format) {
      case 'json':
      case 'geojson':
        res.contentType('application/json')
        break
      case 'kml':
        res.contentType('application/vnd.google-earth.kml+xml')
        break
      case 'csv':
        res.contentType('text/csv')
        break
      case 'zip':
        res.contentType('application/octet-stream')
        break
    }
    return res
  }

  controller.featureserver = function (req, res) {
    // check for geohash route and redirect
    if (req.params.method && req.params.method === 'geohash') {
      controller.getGeohash(req, res)
      return
    }

    var callback = req.query.callback
    delete req.query.callback

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

    agol.find(req.params.id, function (err, data) {
      if (err) {
        res.status(404).send(err)
      } else {
        // sort the req.query before we hash so we are consistent
        var sorted_query = {}
        _(req.query).keys().sort().each(function (key) {
          if (key !== 'url_only' && key !== 'format') {
            sorted_query[key] = req.query[key]
          }
        })
        // build the file key as an MD5 hash that's a join on the paams and look for the file
        var toHash = req.params.item + '_' + (req.params.layer || 0) + JSON.stringify(sorted_query)
        var key = crypto.createHash('md5').update(toHash).digest('hex')
        // Get the item

        // set a really high limit so large datasets can be turned into feature services
        req.query.limit = req.query.limit || req.query.resultRecordCount || 1000000000
        req.query.offset = req.query.resultOffset || null
        agol.getItemData(data.host, req.params.id, req.params.item, key, req.query, function (error, itemJson) {
          if (error) {
            res.status(error.code || 500).send(error.error || error)
          } else {
            // pass to the shared logic for FeatureService routing
            delete req.query.geometry
            delete req.query.where
            controller.processFeatureServer(req, res, err, itemJson.data, callback)
          }
        })
      }
    })

  }

  controller.thumbnail = function (req, res) {
    var key, dir, layer

    agol.find(req.params.id, function (err, data) {
      if (err) {
        res.status(404).send(err)
      } else {
        layer = (req.params.layer || 0)

        // check the image first and return if exists
        key = ['agol', req.params.id, req.params.item, layer].join(':')
        dir = '/thumbs'
        req.query.width = parseInt(req.query.width, 0) || 150
        req.query.height = parseInt(req.query.height, 0) || 150
        req.query.f_base = dir + '/' + req.params.item + '_' + layer + '/' + req.params.item + '::' + req.query.width + '::' + req.query.height
        var png = req.query.f_base + '.png'

        agol.files.exists(null, png, function (exists) {
          if (exists) {
            res.sendfile(png)
          } else {
            // if we have a layer then pass it along
            if (req.params.layer) {
              req.query.layer = req.params.layer
            }
            // sort the req.query before we hash so we are consistent
            var sorted_query = {}
            _(req.query).keys().sort().each(function (key) {
              if (key !== 'url_only' && key !== 'format') {
                sorted_query[key] = req.query[key]
              }
            })
            // build the file key as an MD5 hash that's a join on the paams and look for the file
            var toHash = req.params.item + '_' + (req.params.layer || 0) + JSON.stringify(sorted_query)
            key = crypto.createHash('md5').update(toHash).digest('hex')

            // Get the item
            agol.getItemData(data.host, req.params.id, req.params.item, key, req.query, function (error, itemJson) {
              if (error) {
                res.status(500).send(error)
              } else {
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
                    res.status(500).send(err)
                  } else {
                    // send back image
                    res.sendfile(file)
                  }
                })

              }
            })
          }
        })
      }
    })

  }

  // renders the preview map view
  controller.preview = function (req, res) {
    agol.log('info', 'Render preview ' + JSON.stringify(req.params))
    res.render(__dirname + '/../views/demo', { locals: { host: req.params.id, item: req.params.item } })
  }

  controller.tiles = function (req, res) {
    var callback = req.query.callback
    delete req.query.callback

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
          res.sendfile(tile)
        } else {
          if (callback) {
            res.send(callback + '(' + fs.readFileSync(JSON.parse(tile)) + ')')
          } else {
            res.json(JSON.parse(fs.readFileSync(tile)))
          }
        }
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
        res.sendfile(file)
      } else {
        if (callback) {
          res.send(callback + '(' + JSON.parse(fs.readFileSync(file)) + ')')
        } else {
          res.json(JSON.parse(fs.readFileSync(file)))
        }
      }
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
      agol.find(req.params.id, function (err, data) {
        if (err) {
          res.status(404).send(err)
        } else {
          // if we have a layer then pass it along
          if (req.params.layer) {
            req.query.layer = req.params.layer
          }

          // sort the req.query before we hash so we are consistent
          var sorted_query = {}
          _(req.query).keys().sort().each(function (key) {
            if (key !== 'url_only' && key !== 'format') {
              sorted_query[key] = req.query[key]
            }
          })
          // build the file key as an MD5 hash that's a join on the paams and look for the file
          var toHash = req.params.item + '_' + (req.params.layer || 0) + JSON.stringify(sorted_query)
          var hash = crypto.createHash('md5').update(toHash).digest('hex')

          var factor = 0.1
          req.query.simplify = ((Math.abs(req.query.geometry.xmin - req.query.geometry.xmax)) / 256) * factor

          // make sure we ignore the query limit of 2k
          req.query.enforce_limit = false

          // Get the item
          agol.getItemData(data.host, req.params.id, req.params.item, hash, req.query, function (error, itemJson) {
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
        }
      })
    } else {
      _sendImmediate(file)
    }
  }

  // logic for handling service level, multi-layer tiles
  controller.servicetiles = function (req, res) {
    var key

    // if no format given default to png
    if (!req.params.format) {
      req.params.format = 'png'
    }

    // build the geometry from z,x,y
    var bounds = merc.bbox(req.params.x, req.params.y, req.params.z)
    req.query.geometry = {
      xmin: bounds[0],
      ymin: bounds[1],
      xmax: bounds[2],
      ymax: bounds[3],
      spatialReference: { wkid: 4326 }
    }

    // Get the tile and send the response to the client
    var _send = function (err, info) {
      if (err) {
        return res.status(500).send(err)
      }
      req.params.key = key
      req.params.type = 'agol'
      agol.getServiceTile(req.params, info, function (err, tile) {
        if (err) {
          res.status(401).send(err)
          return
        }
        res.sendfile(tile)
      })
    }

    // file key tells is a combo key for standardizing look ups in the fs.system
    key = [req.params.item, 'all'].join(':')

    // build the names of the files
    // Note that the layer id would be present in service level tiles
    var file = agol.files.localDir + '/tiles/'
    file += key + '/' + req.params.format
    file += '/' + req.params.z + '/' + req.params.x + '/' + req.params.y + '.' + req.params.format

    // if the json file alreadty exists, dont hit the db, just send the data
    if (fs.existsSync(file)) {
      res.sendfile(file)
    } else {
      agol.find(req.params.id, function (err, data) {
        if (err) {
          res.status(500).send(err)
        } else {
          // sort the req.query before we hash so we are consistent
          var sorted_query = {}
          _(req.query).keys().sort().each(function (key) {
            if (key !== 'url_only' && key !== 'format') {
              sorted_query[key] = req.query[key]
            }
          })
          // Get the item
          agol.getServiceLayerData(data.host, req.params.item, null, req.query, function (error, itemJson) {
            if (error) {
              res.status(500).send(error)
            } else {
              // send the data for the tile to Tiles
              _send(error, itemJson)
            }
          })
        }
      })
    }
  }

  // drops the cache for an item and DELETEs all known files
  controller.deleteItemData = function (req, res) {
    req.query.forceDelete = true
    controller.dropItem(req, res)
  }

  controller.getQueueCounts = function (req, res) {
    agol.getQueueCounts(function (err, response) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.json(response)
      }
    })
  }

  /**
  * Get the geohash for an item/layer
  *
  */
  controller.getGeohash = function (req, res) {
    // used for asking if we have the data already
    var tableKey = controller._createTableKey('agol', req.params)

    // Determine if we have the file first
    // -------------------------------------
    // sort the req.query before we hash so we are consistent
    var sorted_query = {}
    _(req.query).keys().sort().each(function (key) {
      sorted_query[key] = req.query[key]
    })

    // build the file key as an MD5 hash that's a join on the paams and look for the file
    var toHash = req.params.item + '_' + (req.params.layer || 0) + JSON.stringify(sorted_query)
    var fileKey = crypto.createHash('md5').update(toHash).digest('hex')
    var key = req.params.item + '_' + req.params.layer
    var filePath = ['latest', 'files', key].join('/')
    var fileName = fileKey + '.geohash.json'

    // does it exist?
    agol.files.exists(filePath, fileName, function (exists, path, fileInfo) {
      agol.getInfo(tableKey, function (err, info) {
        if (err) {
          return res.status(500).send(err)
        }
        if (!info) {
          // redirect to findItemData if we dont have any data in the cache
          if (exists) {
            // send back the geohash, but send fileInfo to set the expired header
            controller.returnGeohash(req, res, path, fileInfo)
          } else {
            res.status(202).json({ status: 'processing' })
          }
          // re-direct to findItemData since we need to cache the data
          req.params.silent = true
          controller.findItemData(req, res)
        } else if (info && (info.status === 'processing' || info.geohashStatus === 'processing')) {
          // if we have a file send it, else return processing
          if (exists) {
            // send back the geohash, but send fileInfo to set the expired header
            controller.returnGeohash(req, res, path, fileInfo)
          } else {
            return res.status(202).json({ status: 'processing' })
          }
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
      res.sendfile(path)
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
