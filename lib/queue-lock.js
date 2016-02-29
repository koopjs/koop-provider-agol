// adopted from https://github.com/taskrabbit/node-resque/blob/master/lib/plugins/queueLock.js

// If a job with the same name, queue, and args is already in the queue, do not enqueue it again
var queueLock = function (worker, func, queue, job, args, options) {
  var self = this
  self.name = 'queueLock'
  self.worker = worker
  self.queue = queue
  self.func = func
  self.job = job
  self.args = args
  self.options = options

  if (self.worker && self.worker.queueObject) {
    self.queueObject = self.worker.queueObject
  } else {
    self.queueObject = self.worker
  }
}

queueLock.prototype.before_enqueue = function (callback) {
  var self = this
  var key = self.key()
  var now = Math.round(new Date().getTime() / 1000)
  var timeout = now + self.lock_timeout() + 1
  self.queueObject.connection.redis.setnx(key, timeout, function (err, setCallback) {
    if (err) console.log(err)
    if (setCallback === true || setCallback === 1) {
      callback(null, true)
    } else {
      self.queueObject.connection.redis.get(key, function (err, redisTimeout) {
        if (err) console.log(err)
        redisTimeout = parseInt(redisTimeout, 10) // es-lint ignore-line
        if (now <= redisTimeout) {
          callback(null, false)
        } else {
          self.queueObject.connection.redis.set(key, timeout, function (err) {
            callback(err, !err)
          })
        }
      })
    }
  })
}

queueLock.prototype.after_perform = function (callback) {
  var self = this
  var key = self.key()
  self.queueObject.connection.redis.del(key, function (err) {
    if (err) console.log(err)
    callback(null, true)
  })
}

queueLock.prototype.lock_timeout = function () {
  var self = this
  if (self.options.lock_timeout) {
    return self.options.lock_timeout
  } else {
    return 60 // in seconds
  }
}

queueLock.prototype.key = function () {
  var self = this
  if (self.options.key) {
    return typeof self.options.key === 'function' ? self.options.key.apply(this) : self.options.key
  } else {
    return self.queueObject.connection.key('lock', self.func, self.queue, self.args[0].item + '_' + self.args[0].layer)
  }
}

exports.queueLock = queueLock
