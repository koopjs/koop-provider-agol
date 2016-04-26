module.exports = function (agol, controller) {
  /**
   * Drops the cache for an item
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  return function (req, res) {
    if (req.method === 'DELETE') req.query.forceDelete = true
    agol.log.debug(JSON.stringify({route: 'dropResource', params: req.params, query: req.query}))
    agol.dropResource(req.params.item, req.params.layer || 0, req.query, function (error, itemJson) {
      if (error) return res.status(error.code || 400).send(error)
      res.status(200).json(itemJson)
    })
  }
}
