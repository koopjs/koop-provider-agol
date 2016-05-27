var Utils = require('../lib/utils.js')
var _ = require('lodash')
module.exports = function (agol, controller) {
  function fetchServiceData (req, res) {
    agol.log.debug(JSON.stringify({route: '_fetchServiceData', params: req.params, query: req.query}))
    // until koop-pgcache supports JSONB we need to fetch all the features from the cache in order to
    // give accurate responses
    req.query.limit = req.query.limit || req.query.resultRecordCount || 1000000000
    var options = {item: req.params.item, layer: req.params.layer || 0, host: req.portal, query: req.query}
    agol.cacheResource(options, function (error, info, data) {
      if (error) return res.status(error.code || 500).json({error: error.message})
      var fsQuery = Utils.setServiceDefaults(req.params, req.query)
      req.query = _.omit(fsQuery, ['geometry', 'where'])
      controller.processFeatureServer(req, res, data)
    })
  }
  /**
   * Handles all requests for FeatureServices
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  return function (req, res) {
    // support POST requests; map body vals to the query
    // (then all same as GET)
    for (var k in req.body) if (req.body[k]) req.query[k] = req.body[k]
    agol.log.debug(JSON.stringify({route: 'featureserver', params: req.params, query: req.query}))
    var table = Utils.createTableKey(req.params)
    agol.cache.getInfo(table, function (err, info) {
      if (err) return res.status(500).json({error: err.message})
      fetchServiceData(agol, controller, req, res)
      var updateOpts = { host: req.portal, key: table, item: req.params.item, layer: req.params.layer || 0 }
      agol.updateIfExpired(info, updateOpts, function (err) {
        if (err) agol.log.error(err)
      })
    })
  }
}
