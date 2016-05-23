var Utils = require('../lib/utils.js')
module.exports = function (agol, controller) {
  var actions = {
    /**
     * Get the expiration date for a resource
     *
     * @param {object} req - the incoming request
     * @param {object} res - the outgoing response
     */
    GET: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'getExpiration', params: req.params, query: req.query}))
      var table = Utils.createTableKey(req.params)
      agol.getExpiration(table, function (err, expiration) {
        if (err) return res.status(404).json({error: err.message})
        res.status(200).json({expires_at: new Date(expiration)})
      })
    },
    /**
     * Set the expiration date for a resource
     *
     * @param {object} req - the incoming request
     * @param {object} res - the outgoing response
     */
    PUT: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'setExpiration', params: req.params, query: req.query}))
      var table = Utils.createTableKey(req.params)
      agol.setExpiration(table, req.body.expires_at, function (err, timestamp) {
        if (!err) return res.status(200).json({expires_at: new Date(timestamp).toISOString()})
        if (err.message === 'Resource not found') {
          var options = Utils.createCacheOptions(req)
          options.expiration = timestamp
          agol.cacheResource(options, function (err, json) {
            if (err) return res.status(500).json(err)
            res.status(201).json({status: 'Processing', expires_at: new Date(timestamp).toISOString()})
          })
        } else {
          res.status(400).json({error: err.message})
        }
      })
    }
  }
  return function (req, res) {
    var action = actions[req.method]
    if (!action) return res.status(400).json({error: 'Unsupported action'})
    action(req, res)
  }
}
