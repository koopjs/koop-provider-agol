var _ = require('lodash')

module.exports = function (agol, controller) {
  var actions = {
    /**
     * Gets the total number of jobs on the queue
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    length: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'getQueueLength', params: req.params, query: req.query}))
      if (!agol.featureQueue) return res.status(400).json({error: 'Feature queue is not enabled'})
      agol.featureQueue.length('agol', function (err, length) {
        if (err) return res.status(500).send(err)
        var response = {length: length}
        res.status(200).json(response)
      })
    },
    /**
     * Get all the jobs that are currently on the queue
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    working: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'getQueueWorking', params: req.params, query: req.query}))
      if (!agol.featureQueue) return res.status(400).json({error: 'Feature queue is not enabled'})
      agol.featureQueue.allWorkingOn(function (err, workers) {
        if (err) return res.status(500).send(err)
        var working = _.filter(workers, function (w) {
          return typeof w === 'object'
        })
        res.status(200).json(working.length)
      })
    },
    /**
     * Gets the status of the workers and running jobs
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    workers: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'getQueueWorkers', params: req.params, query: req.query}))
      if (!agol.featureQueue) return res.status(400).json({error: 'Feature queue is not enabled'})
      agol.featureQueue.allWorkingOn(function (err, working) {
        if (err) return res.status(500).send(err)
        res.status(200).json(working)
      })
    },
    /**
     * Drops and failed jobs from the cache and queue
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    clearFailed: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'clearFailedJobs', params: req.params, query: req.query}))
      if (!agol.featureQueue) return res.status(400).json({error: 'Feature queue is not enabled'})
      agol.dropAndRemoveFailed(function (err, report) {
        if (err) return res.status(500).json({error: err.message})
        res.status(200).json(report)
      })
    }
  }

  return function (req, res) {
    var action = actions[req.params.action]
    if (!action) return res.status(400).json({error: 'Unsupported action'})
    action(req, res)
  }
}
