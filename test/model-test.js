/* global before, after, it, describe */

var should = require('should')
var sinon = require('sinon')
// var fs = require('fs')
var koop = require('koop/lib')

var config = {}
// setup koop
config.data_dir = __dirname + '/output/'
koop.config = config
koop.log = new koop.Logger({logfile: './test.log'})

koop.Cache = new koop.DataCache(koop)
koop.Cache.db = koop.LocalDB
koop.Cache.db.log = koop.log

koop.files = new koop.Files(koop)

var agol = require('../models/agol.js')(koop)

describe('AGOL Model', function () {
  describe('getting info', function () {
    it('should return status: unavailable when the resource is not cached', function (done) {
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        callback(new Error('Resource not found'))
      })

      agol.getInfo({key: 'test'}, function (err, info) {
        should.not.exist(err)
        info.status.should.equal('Unavailable')
        agol.cache.getInfo.restore()
        done()
      })
    })

    it('should return status: Expired when the resource is expired', function (done) {
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        callback(null, {status: 'Cached', type: 'Feature Service', version: '2.0'})
      })

      sinon.stub(agol.cache, 'checkExpiration', function (info, layer, callback) {
        callback(null, true, {})
      })

      agol.getInfo({key: 'test'}, function (err, info) {
        should.not.exist(err)
        info.status.should.equal('Expired')
        agol.cache.getInfo.restore()
        agol.cache.checkExpiration.restore()
        done()
      })
    })

    it('should return with status: Cached when the resource is not expired', function (done) {
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        callback(null, {status: 'Cached', type: 'Feature Service', version: '2.0'})
      })

      sinon.stub(agol.cache, 'checkExpiration', function (info, layer, callback) {
        callback(null, false, {status: 'Cached', type: 'Feature Service', version: '2.0'})
      })

      agol.getInfo({key: 'test'}, function (err, info) {
        console.log(err, info)
        should.not.exist(err)
        info.status.should.equal('Cached')
        agol.cache.getInfo.restore()
        agol.cache.checkExpiration.restore()
        done()
      })
    })

    it('should return with status: Processing when a feature service resource is processing', function (done) {
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        callback(null, {status: 'Processing', version: '2.0', type: 'Feature Service'})
      })

      agol.getInfo({key: 'test'}, function (err, info) {
        should.not.exist(err)
        info.status.should.equal('Processing')
        agol.cache.getInfo.restore()
        done()
      })
    })

    it('should return with status: Expired with a csv item has been modified', function (done) {
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        callback(null, {status: 'Cached', retrieved_at: Date.now(), version: '2.0', type: 'CSV', url: 'foo'})
      })

      sinon.stub(agol.portal, 'getItem', function (host, item, callback) {
        callback(null, {modified: Date.now() + 1000})
      })

      agol.getInfo({key: 'test'}, function (err, info) {
        should.not.exist(err)
        info.status.should.equal('Expired')
        agol.cache.getInfo.restore()
        agol.portal.getItem.restore()
        done()
      })
    })
  })

  describe('remove items', function () {
    before(function (done) {
      sinon.stub(koop.Cache, 'remove', function (host, itemid, opts, callback) {
        callback()
      })

      done()
    })

    after(function (done) {
      koop.Cache.remove.restore()
      done()
    })

    // beforeEach(function(done){
    //  done()
    // })

    it('should call cache db remove on dropItem', function (done) {
      agol.dropResource('item', 'layer', {}, function () {
        koop.Cache.remove.called.should.equal(true)
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
    it('should call back with an error when the resource does not exist', function (done) {
      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(new Error('Resource not found'))
      })

      agol.getExpiration('testkey', function (err, expiration) {
        should.exist(err)
        err.message.should.equal('Resource not found')
        agol.getInfo.restore()
        done()
      })
    })

    it('should call back with a Unix timestamp from the db when the resource exists', function (done) {
      var time = new Date().getTime()
      sinon.stub(agol, 'getInfo', function (key, callback) {
        var info = {expires_at: time}
        callback(null, info)
      })

      agol.getExpiration('testkey', function (err, expiration) {
        should.not.exist(err)
        expiration.should.equal(time)
        agol.getInfo.restore()
        done()
      })
    })
  })

  describe('when building a geohash', function () {
    before(function (done) {
      sinon.stub(agol, 'getGeoHash', function (key, options, callback) {
        callback(null, {geohash: 100})
      })
      sinon.stub(agol, 'saveFile', function (path, name, agg, callback) {
        callback(null, agg)
      })
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        callback(null, {geohashStatus: 'Processing'})
      })
      sinon.stub(koop.Cache, 'updateInfo', function (key, info, callback) {
        callback(null, true)
      })
      done()
    })

    after(function (done) {
      koop.Cache.updateInfo.restore()
      agol.cache.getInfo.restore()
      agol.saveFile.restore()
      agol.getGeoHash.restore()
      done()
    })

    var hashOpts = {
      key: 'testkey',
      filePath: '/geohash-dir',
      fileName: '/geohash.json',
      query: {}
    }

    var info = {}

    // all we test here is the flow of the code, the logic
    // we make sure each method is called, but dont really test the methods here
    it('should back before saveFile is called when there is no where clause', function (done) {
      agol.buildGeohash(info, hashOpts, function (err, geohash) {
        should.not.exist(err)
        agol.cache.getInfo.called.should.equal(false)
        agol.getGeoHash.called.should.equal(false)
        agol.saveFile.called.should.equal(false)
        koop.Cache.updateInfo.called.should.equal(true)
        done()
      })
    })

    it('should call saveFile before calling back when getting a geohash w/where clause', function (done) {
      hashOpts.query = {where: '1=1'}
      agol.buildGeohash(info, hashOpts, function (err, geohash) {
        should.not.exist(err)
        geohash.geohash.should.equal(100)
        agol.cache.getInfo.called.should.equal(true)
        agol.getGeoHash.called.should.equal(true)
        agol.saveFile.called.should.equal(true)
        koop.Cache.updateInfo.called.should.equal(true)
        done()
      })
    })
  })
})
