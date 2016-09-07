var _ = require('lodash')
var async = require('async')

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
      agol.log.debug(JSON.stringify({route: req.method + ' queue workers', params: req.params, query: req.query}))
      agol.featureQueue.allWorkingOn(function (err, workers) {
        if (err) return res.status(500).send(err)
        switch (req.method) {
          case 'DELETE':
            var deleted = []
            async.each(Object.keys(workers), function (worker, done) {
              if (worker.match(req.params.pattern)) {
                deleted.push(worker)
                agol.featureQueue.forceCleanWorker(worker, function (err) {
                  done(err)
                })
              } else {
                done()
              }
            }, function (err) {
              if (err) return res.status(500).json({error: err.message})
              res.status(200).json({
                workers: deleted,
                delete: true
              })
            })
            break
          case 'GET':
            res.status(200).json(workers)
            break
          default:
            res.status(400).json({error: 'Unsupported method'})
        }
      })
    },

    /**
     * Gets the status of the workers and running jobs
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    worker: function (req, res) {
      switch (req.method) {
        case 'DELETE':
          agol.log.debug(JSON.stringify({route: 'worker', params: req.params, query: req.query}))
          if (!agol.featureQueue) return res.status(400).json({error: 'Feature queue is not enabled'})
          agol.featureQueue.forceCleanWorker(req.params.pattern, function (err) {
            if (err) return res.status(500).send(err)
            res.status(200).json({
              worker: req.params.worker,
              deleted: true
            })
          })
          break
        default:
          res.status(400).json({error: 'Unsupported method'})
      }
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
    },

    /**
     * Clears old workers from the queue
     *
     * @param {object} req - the incoming request object
     * @param {object} res - the outgoing response object
     */
    cleanWorkers: function (req, res) {
      agol.log.debug(JSON.stringify({route: 'clearFailedJobs', params: req.params, query: req.query}))
      if (!agol.featureQueue) return res.status(400).json({error: 'Feature queue is not enabled'})
      agol.dropAndRemoveFailed(function (err) {
        if (err) return res.status(500).json({error: err.message})
        res.status(200).json({cleanWorkers: true})
      })
    }
  }

  return function (req, res) {
    if (!agol.featureQueue) return res.status(400).json({error: 'Feature queue is not enabled'})
    var action = actions[req.params.action]
    if (!action) return res.status(400).json({error: 'Unsupported action'})
    action(req, res)
  }
}
