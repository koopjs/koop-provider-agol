var fs = require('fs')
var Sm = require('sphericalmercator')
var merc = new Sm({size: 256})
module.exports = function (agol, controller) {
  return function (req, res) {
    agol.log.debug(JSON.stringify({route: 'tiles', params: req.params, query: req.query}))
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
      agol.cache.get(req.params.item, req.params.layer, req.query, function (error, itemJson) {
        if (error) {
          if (error.message === 'Resource not found') return controller.getResource(req, res)
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
}
