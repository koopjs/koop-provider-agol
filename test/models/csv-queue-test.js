/* global describe, it, afterEach, beforeEach*/
var sinon = require('sinon')
var CSVQueue = require('../../models/csv-queue')
var should = require('should')
var Logger = require('koop-logger')
var log = new Logger({})
var files = require('fs')

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
    sinon.stub(csvQueue.files, 'writeFile', function (path, data, callback) {
      callback(null)
    })

    sinon.stub(csvQueue.files, 'unlink', function (path, callback) {
      callback(null)
    })

    done()
  })

  afterEach(function (done) {
    csvQueue.files.writeFile.restore()
    csvQueue.files.unlink.restore()
    done()
  })

  var task = {
    dummy: 0
  }

  it('should set task.store to true if the task is unlocked', function (done) {
    csvQueue.push(task, function (task) {
      task.store.should.equal(true)
      files.writeFile.called.should.equal(true)
      done()
    })
  })

  it('should set task.store to faslse is the task is locked', function (done) {
    sinon.stub(csvQueue, '_checkLock', function (task, callback) {
      callback(null, true)
    })

    csvQueue.push(task, function (task) {
      should.exist(task)
      task.store.should.equal(false)
      files.writeFile.called.should.equal(false)
      csvQueue._checkLock.restore()
      done()
    })
  })
})
