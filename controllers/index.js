/* @ flow */
var Tiles = require('./tiles.js')
var Queue = require('./queue.js')
var Dataset = require('./dataset.js')
var Bulk = require('./bulk.js')
var GetResource = require('./getResource.js')
var Drop = require('./drop.js')
var Hosts = require('./hosts.js')
var Expiration = require('./expiration.js')
var Utils = require('../lib/utils.js')

function Controller (agol) {
  // have to set this so the FeatureServer plugin can use it
  this.model = agol
  /**
   * Manages shared logic for any request that needs a host or key
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   * @param {function} next - calls the next route handler
   */
  this.setHost = function (req, res, next) {
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
  this.getInfo = function (req, res) {
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
  this.getGeohash = function (req, res) {
    req.params.format = 'geohash'
    this.getResource(req, res)
  }

  /**
   * Renders a preview on a map
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  this.preview = function (req, res) {
    agol.log.debug(JSON.stringify({route: 'preview', params: req.params, query: req.query}))
    agol.log.info('Render preview ' + JSON.stringify(req.params))
    res.render(__dirname + '/../views/demo', { locals: { host: req.params.id, item: req.params.item } })
  }

  // init sub controllers
  this.hosts = Hosts(agol, this)

  this.getResource = GetResource(agol, this)

  this.drop = Drop(agol, this)

  this.bulk = Bulk(agol, this)

  this.queue = Queue(agol, this)

  this.dataset = Dataset(agol, this)

  this.expiration = Expiration(agol, this)

  this.tiles = Tiles(agol, this)
}

module.exports = Controller
