/* global before, after, beforeEach, afterEach, it, describe */

var should = require('should')
var sinon = require('sinon')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var koop = require('koop/lib')

var config = {}
// setup koop
config.data_dir = __dirname + '/output/'
config.agol = {env: 'arcgis'}
koop.config = config
var Logger = require('koop-logger')
koop.log = new Logger({logfile: './test.log'})

koop.cache = new koop.DataCache(koop)
koop.cache.db = koop.LocalDB
koop.cache.db.log = koop.log

var LocalFs = require('koop-localfs')
var path = require('path')
koop.fs = new LocalFs({rootDir: path.join(__dirname, 'data')})

var agol = require('../models/agol.js')(koop)

describe('AGOL Model', function () {
  describe('getting the host portal', function () {
    it('should use the portal from the configured env value', function (done) {
      agol.find('_env', function (err, data) {
        should.not.exist(err)
        data.host.should.equal('https://www.arcgis.com')
        done()
      })
    })
  })

  describe('remove items', function () {
    before(function (done) {
      sinon.stub(koop.cache, 'remove', function (host, itemid, opts, callback) {
        callback()
      })

      done()
    })

    after(function (done) {
      koop.cache.remove.restore()
      done()
    })

    // beforeEach(function(done){
    //  done()
    // })

    it('should call cache db remove on dropItem', function (done) {
      agol.dropResource('item', 'layer', {}, function () {
        koop.cache.remove.called.should.equal(true)
        done()
      })
    })
  })

  describe('when setting the expiration date on a resource', function () {
    describe('that does not exist', function () {
      it('should call back with an error', function (done) {
        sinon.stub(agol.cache, 'getInfo', function (key, callback) {
          callback(new Error('Resource not found'))
        })

        agol.setExpiration('testkey', new Date('2099'), function (err) {
          should.exist(err)
          err.message.should.equal('Resource not found')
          agol.cache.getInfo.restore()
          done()
        })
      })
    })

    describe('that does exist', function () {
      before(function (done) {
        sinon.stub(agol.cache, 'getInfo', function (key, callback) {
          callback(null, {})
        })
        sinon.stub(agol.cache, 'updateInfo', function (key, info, callback) {
          callback(null)
        })
        done()
      })

      after(function (done) {
        agol.cache.getInfo.restore()
        agol.cache.updateInfo.restore()
        done()
      })

      it('should update the info doc when the input is a unix timestamp', function (done) {
        agol.setExpiration('testkey', new Date('2099').getTime(), function (err) {
          should.not.exist(err)
          done()
        })
      })

      it('should update the info doc when the input is a UTC String', function (done) {
        agol.setExpiration('testkey', new Date('2099').toString(), function (err) {
          should.not.exist(err)
          done()
        })
      })

      it('should call back with an error when the input cannot be parsed into a date', function (done) {
        agol.setExpiration('testkey', 'foo', function (err) {
          should.exist(err)
          err.message.should.equal('Invalid input')
          done()
        })
      })

      it('should callback with an error when the expiration date is in the past', function (done) {
        agol.setExpiration('testkey', '2011', function (err) {
          should.exist(err)
          err.message.should.equal('Expiration cannot be in the past')
          done()
        })
      })
    })
  })

  describe('when getting the expiration date on a resource', function () {
    afterEach(function (done) {
      agol.cache.getInfo.restore()
      done()
    })
    it('should call back with an error when the resource does not exist', function (done) {
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        callback(new Error('Resource not found'))
      })

      agol.getExpiration('testkey', function (err, expiration) {
        should.exist(err)
        err.message.should.equal('Resource not found')
        done()
      })
    })

    it('should call back with a Unix timestamp from the db when the resource exists', function (done) {
      var time = new Date().getTime()
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        var info = {expires_at: time}
        callback(null, info)
      })

      agol.getExpiration('testkey', function (err, expiration) {
        should.not.exist(err)
        expiration.should.equal(time)
        done()
      })
    })
  })

  describe('Generating exports', function () {
    function FakeJob () {}
    util.inherits(FakeJob, EventEmitter)

    beforeEach(function (done) {
      var fakeJob = new FakeJob()
      sinon.stub(agol, 'enqueueExport', function (options) {
        return fakeJob
      })

      sinon.stub(agol, 'enqueueCopy', function (options) {
        return fakeJob
      })

      sinon.stub(agol, 'updateJob', function (a, b, callback) {
        fakeJob.emit('finish')
        if (callback) callback(null)
      })

      done()
    })

    afterEach(function (done) {
      agol.enqueueExport.restore()
      agol.enqueueCopy.restore()
      agol.updateJob.restore()
      done()
    })

    it('Should create a copyLatest job on finish when there are no query paramters', function (done) {
      agol.generateExport({filePath: 'foo', where: 'foo'}, function () {
        agol.enqueueCopy.called.should.equal(false)
        done()
      })
    })
  })
})
