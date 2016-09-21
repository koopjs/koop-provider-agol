/* @ flow */
var Tiles = require('./tiles.js')
var Queue = require('./queue.js')
var Dataset = require('./dataset.js')
var Bulk = require('./bulk.js')
var FeatureServer = require('./featureServer.js')
var GetResource = require('./getResource.js')
var Drop = require('./drop.js')
var Hosts = require('./hosts.js')
var Expiration = require('./expiration.js')
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
  controller.setHost = function (req, res, next) {
    agol.log.debug(JSON.stringify({route: 'setHost', params: req.params, query: req.query}))
    req.params.silent = false
    if (!req.params.id) return next()
    agol.find(req.params.id, function (err, data) {
      if (err) return res.status(404).send(err)
      req.portal = data.host
      next()
    })
  }

  /**
   * get the item metadata from the host
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.getInfo = function (req, res) {
    agol.log.debug(JSON.stringify({route: 'getInfo', params: req.params, query: req.query}))
    var table = Utils.createTableKey(req.params)
    agol.cache.getInfo(table, function (err, info) {
      if (err) return res.status(404).json({error: err.message})
      res.status(200).json(info)
    })
  }

  /**
  * Get the geohash for a resource. This route can be removed only with a breaking change
  *
  * @param {object} req - the incoming request
  * @param {object} res - the outgoing response
  */
  controller.getGeohash = function (req, res) {
    req.params.format = 'geohash'
    controller.getResource(req, res)
  }

  /**
   * Renders a preview on a map
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  controller.preview = function (req, res) {
    agol.log.debug(JSON.stringify({route: 'preview', params: req.params, query: req.query}))
    agol.log.info('Render preview ' + JSON.stringify(req.params))
    res.render(__dirname + '/../views/demo', { locals: { host: req.params.id, item: req.params.item } })
  }

  // init sub controllers
  controller.hosts = Hosts(agol, controller)

  controller.getResource = GetResource(agol, controller)

  controller.drop = Drop(agol, controller)

  controller.bulk = Bulk(agol, controller)

  controller.queue = Queue(agol, controller)

  controller.dataset = Dataset(agol, controller)

  controller.featureserver = FeatureServer(agol, controller)

  controller.expiration = Expiration(agol, controller)

  controller.tiles = Tiles(agol, controller)

  return controller
}

module.exports = Controller
