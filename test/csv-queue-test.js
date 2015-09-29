/* global describe, it, afterEach, beforeEach*/
var sinon = require('sinon')
var CSVQueue = require('../lib/csv-queue')
var koopLib = require('koop/lib')
var should = require('should')
var log = new koopLib.Logger({})
var files = koopLib.Files({
  config: {
    data_dir: './test/lock'
  }
})

// regular stubbing won't work because the function is locked into the async queue at instantiation time
CSVQueue.prototype._getCSV = function (task, callback) {
  callback(task)
}

var csvQueue = new CSVQueue({
  files: files,
  log: log,
  cache: {}
})

describe('Queueing csv tasks', function () {
  beforeEach(function (done) {
    sinon.stub(csvQueue.files, 'write', function (dir, name, data, callback) {
      callback(null)
    })

    sinon.stub(csvQueue.files, 'remove', function (dir, name, callback) {
      callback(null)
    })

    done()
  })

  afterEach(function (done) {
    csvQueue.files.write.restore()
    csvQueue.files.remove.restore()
    done()
  })

  var task = {
    dummy: 0
  }

  it('should set task.store to true if the task is unlocked', function (done) {
    csvQueue.push(task, function (task) {
      task.store.should.equal(true)
      files.write.called.should.equal(true)
      done()
    })
  })

  it('should set task.store to faslse is the task is locked', function (done) {
    sinon.stub(csvQueue, '_checkLock', function (task, callback) {
      callback(true)
    })

    csvQueue.push(task, function (task) {
      should.exist(task)
      task.store.should.equal(false)
      files.write.called.should.equal(false)
      csvQueue._checkLock.restore()
      done()
    })
  })
})
