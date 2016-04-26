module.exports = function (agol, controller) {
  var actions = {
    /**
     * returns a list of the registered hosts and their ids
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    GET: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'list', params: req.params, query: req.query}))
      agol.find(req.params.id, function (err, data) {
        if (err) return res.status(500).send(err)
        res.json(data)
      })
    },
    /**
     * Registers a host with the given id
     * this inserts a record into the db for an ArcGIS instances ie: id -> hostname :: arcgis -> arcgis.com
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    POST: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'register', params: req.params, query: req.query}))
      if (!req.body.host) return res.status(400).send('Must provide a host to register')

      agol.register(req.body.id, req.body.host, function (err, id) {
        if (err) return res.status(400).send(err)
        res.json({ 'serviceId': id })
      })
    },
    /**
     * handles a DELETE to remove a registered host from the DB
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    DELETE: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'del', params: req.params, query: req.query}))
      if (!req.params.id) return res.status(400).send('Must specify a service id')

      agol.remove(req.params.id, function (err, data) {
        if (err) return res.status(400).send(err)
        res.json(data)
      })
    }
  }
  return function (req, res) {
    var action = actions[req.method]
    if (!action) return res.status(400).json({error: 'Unsupported action'})
    action(req, res)
  }
}
