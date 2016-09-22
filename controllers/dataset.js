module.exports = function (agol, controller) {
  var actions = {
    /**
     * returns a list of the registered hosts and their ids
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    GET: function (req, res) {
      if (req.params.dataset) getDataset(req, res)
      else getDatasets(req, res)
    },
    /**
     * Put a specific dataset on the queue
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    POST: function (req, res) {
      if (req.params.method === 'import') enqueue(agol.bulkImport, req, res)
      else if (req.params.action === 'export') enqueue(agol.bulkExport, req, res)
      else return res.status(400).json({error: 'Unsupported method'})
    },
    /**
     * Deletes a dataset from the cache
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    DELETE: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'dataset:delete', params: req.params, query: req.query}))
      var ids = decomposeId(req.params.dataset)
      agol.dropResource(ids.item, ids.layer, {}, function (err) {
        if (err) return res.status(500).send({error: err.message})
        res.status(200).json({status: 'Deleted'})
      })
    }
  }

  function enqueue (enqueueAction, req, res) {
    agol.log.debug(JSON.stringify({route: 'queue:' + req.params.action, params: req.params, query: req.query}))
    var formats
    if (req.query.formats) {
      formats = req.query.formats.split(',')
    }
    var ids = decomposeId(req.params.dataset)
    var options = [{
      item: ids.item,
      layer: ids.layer,
      formats: formats || ['csv', 'kml', 'zip', 'geohash']
    }]
    enqueueAction(req, options, function (err, info) {
      if (err) return res.status(500).json({error: err.message})
      res.status(200).json(info)
    })
  }

  function getDataset (req, res) {
    agol.dataset.findRecord(req.params, function (err, dataset) {
      if (err) return res.status(404).json({error: err.message})
      res.status(200).json({dataset: dataset})
    })
  }

  function getDatasets (req, res) {
    agol.dataset.findRecords(req.query, function (err, datasets) {
      if (err) return res.status(500).json({error: err.message})
      res.status(200).json({datasets: datasets})
    })
  }

  return function (req, res) {
    var action = actions[req.method]
    if (!action) return res.status(400).json({error: 'Unsupported action'})
    action(req, res)
  }
}

function decomposeId (dataset) {
  var parts = dataset.split('_')
  return {
    item: parts[0],
    layer: parts[1] || 0
  }
}
