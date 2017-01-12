var async = require('async')
var CSVRequest = require('./csv-request.js')
var Utils = require('../lib/utils.js')
var path = require('path')

/**
 * @class
 *
 * A queue used to control the flow of the csv inserts
 * if we get many requests for a new CSV they insert multiple times
 * here we handle removing the data cache before we insert
 */
function CSVQueue (options) {
  this.cache = options.cache
  this.log = options.log
  this._queue = async.queue(this._getCSV.bind(this), 10)
  this.files = options.files
  this.lockDir = 'koop_agol_csv'
  this.locks = {}
}

/**
 * Pushes a new csv request on to the queue
 *
 * @param {object} task - describes the task to be completed
 * @param {function} callback - passed through to the underlying csv request
 */
CSVQueue.prototype.push = function (task, callback) {
  var self = this
  self._checkLock(task, function (err, locked) {
    if (err) return callback(err)
    if (!locked && !task.passthru) {
      task.store = true
      self._lockTask(task, function () {
        self._queue.push(task, callback)
      })
    } else {
      // if the task is locked we still want to return data
      // but we want to avoid duplicate rows in the DB
      task.store = false
      self._queue.push(task, callback)
    }
  })
}

/**
 * Checks whether a task is locked by looking for a lock file on the local or s3 filesytem
 *
 * @param {object} task - the set of params that describe the task
 * @param {function} callback - calls back with an error or the lock status
 * @private
 */
CSVQueue.prototype._checkLock = function (task, callback) {
  var taskHash = Utils.createTaskHash(task)
  var self = this
  this.files.stat(path.join(this.lockDir, taskHash), function (err, stat) {
    if (self.locks[taskHash]) return callback(null, true)
    if (err) return callback(null, false)
    else callback(null, true)
  })
}

/**
 * Creates a lock file preventing this task from being duplicated
 *
 * @param {object} task - the set of params that describe the task
 * @param {function} callback - calls back with an error or the lock status
 * @private
 */
CSVQueue.prototype._lockTask = function (task, callback) {
  var self = this
  var taskHash = Utils.createTaskHash(task)
  this.locks[taskHash] = true
  self.files.writeFile(path.join(this.lockDir, taskHash), '{"locked": true}', function (err) {
    if (err) self.log.error('Unable to lock task', err, task)
    callback()
  })
}

/**
 * Removes the lock file so this task can be completed again if requested
 *
 * @param {object} task - the set of params that describe the task
 * @private
 */
CSVQueue.prototype._unlockTask = function (task) {
  var self = this
  var taskHash = Utils.createTaskHash(task)
  delete this.locks[taskHash]
  self.files.unlink(path.join(this.lockDir, taskHash), function (err) {
    if (err) self.log.error('Unable to unlock task', err, task)
  })
}

/**
 * Instantiates and submits the actual request for the CSV
 *
 * @param {object} task - the set of params that describe the task
 * @param {function} callback - calls back with an error info or data
 * @private
 */
CSVQueue.prototype._getCSV = function (task, callback) {
  var self = this
  var request = new CSVRequest(this.cache, task)
  request.submit(function (err, info, data) {
    self._unlockTask(task)
    callback(err, info, data)
  })
}

module.exports = CSVQueue
