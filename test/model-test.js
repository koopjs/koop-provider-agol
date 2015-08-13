/* global before, after, it, describe */

var should = require('should')
var sinon = require('sinon')
var fs = require('fs')
var koop = require('koop/lib')

var config = {}

var itemJson = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemJson.json').toString())

// setup koop
config.data_dir = __dirname + '/output/'
koop.config = config
koop.log = new koop.Logger({logfile: './'})

koop.Cache = new koop.DataCache(koop)
koop.Cache.db = koop.LocalDB
koop.Cache.db.log = koop.log

koop.files = new koop.Files(koop)

var agol = require('../models/agol.js')(koop)

describe('AGOL Model', function () {
  describe('get / remove items', function () {
    before(function (done) {
      sinon.stub(koop.Cache, 'remove', function (host, itemid, opts, callback) {
        callback()
      })

      sinon.stub(agol, 'req', function (url, callback) {
        callback(null, '')
      })
      done()
    })

    after(function (done) {
      koop.Cache.remove.restore()
      agol.req.restore()
      done()
    })

    // beforeEach(function(done){
    //  done()
    // })

    it('should call cache db remove on dropItem', function (done) {
      agol.dropItem('host', 'itemid1', {}, function () {
        koop.Cache.remove.called.should.equal(true)
        done()
      })
    })

    it('should attempt to request the item from the host', function (done) {
      agol.getItem('host', 'itemid1', {}, function () {
        agol.req.called.should.equal(true)
        done()
      })
    })
  })

  describe('when getting an item with metadata', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())
      sinon.stub(agol, 'req', function (url, callback) {
        callback(null, {body: JSON.stringify(itemInfo.info)})
      })

      sinon.stub(agol, 'getItemMetadata', function (host, itemId, json, callback) {
        json.metadata = true
        callback(null, json)
      })
      done()
    })

    after(function (done) {
      agol.getItemMetadata.restore()
      agol.req.restore()
      done()
    })

    it('should call getItemMetadata to json', function (done) {
      agol.getItem('host1', 'item1', {getMetadata: true}, function (err, json) {
        should.not.exist(err)
        json.metadata.should.equal(true)
        done()
      })
    })

  })

  describe('when getting a an expired feature service item', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())

      sinon.stub(agol, 'getItem', function (host, itemId, options, callback) {
        callback(null, itemJson)
      })

      sinon.stub(agol, 'getData', function (params, options, callback) {
        callback(null, itemJson)
      })

      sinon.stub(koop.Cache, 'getInfo', function (key, callback) {
        // force an expiration
        itemInfo.expires_at = new Date().getTime() - 60000
        callback(null, itemInfo)
      })

      sinon.stub(koop.Cache, 'remove', function (host, itemid, opts, callback) {
        callback()
      })

      done()
    })

    after(function (done) {
      koop.Cache.getInfo.restore()
      agol.getItem.restore()
      agol.getData.restore()
      koop.Cache.remove.restore()
      done()
    })

    it('should remove the data from the cache before getting data', function (done) {
      agol.getItemData('host', 'hostId', 'itemid1', 'dummyhash', {}, function () {
        koop.Cache.getInfo.called.should.equal(true)
        agol.getItem.called.should.equal(true)
        koop.Cache.remove.called.should.equal(true)
        agol.getData.called.should.equal(true)
        done()
      })
    })
  })

  describe('when getting a feature service item', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())

      sinon.stub(agol, 'getItem', function (host, itemId, options, callback) {
        callback(null, itemJson)
      })

      sinon.stub(agol, 'getData', function (params, options, callback) {
        callback(null, itemJson)
      })

      sinon.stub(koop.Cache, 'getInfo', function (key, callback) {
        itemInfo.expires_at = new Date().getTime() + 60000
        callback(null, itemInfo)
      })

      sinon.stub(koop.Cache, 'remove', function (host, itemid, opts, callback) {
        callback()
      })

      done()
    })

    after(function (done) {
      koop.Cache.getInfo.restore()
      agol.getItem.restore()
      agol.getData.restore()
      koop.Cache.remove.restore()
      done()
    })

    it('should not remove the data from the cache before getting data', function (done) {
      agol.getItemData('host', 'hostId', 'itemid1', 'dummyhash', {}, function () {
        koop.Cache.getInfo.called.should.equal(true)
        agol.getItem.called.should.equal(true)
        koop.Cache.remove.called.should.equal(false)
        agol.getData.called.should.equal(true)
        done()
      })
    })
  })

  describe('when getting a feature service item', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())

      sinon.stub(agol, 'getItem', function (host, itemId, options, callback) {
        callback(null, itemJson)
      })

      sinon.stub(agol, 'getFeatureService', function (params, options, callback) {
        callback(null, itemInfo)
      })

      sinon.stub(koop.Cache, 'getInfo', function (key, callback) {
        itemInfo.expires_at = new Date().getTime() + 60000
        callback(null, itemInfo)
      })

      done()
    })

    after(function (done) {
      koop.Cache.getInfo.restore()
      agol.getItem.restore()
      agol.getFeatureService.restore()
      done()
    })

    it('should remove the data from the cache before getting data', function (done) {
      agol.getItemData('host', 'hostid', 'itemid1', 'dummyhash', {}, function () {
        koop.Cache.getInfo.called.should.equal(true)
        agol.getItem.called.should.equal(true)
        koop.Cache.getInfo.called.should.equal(true)
        agol.getFeatureService.called.should.equal(true)
        done()
      })
    })
  })

  describe('when getting an item that is secured', function () {
    before(function (done) {
      sinon.stub(agol, 'req', function (url, callback) {
        var data = {}
        var error = {
          error: {
            code: 403,
            messageCode: 'GWM_0003',
            message: 'You do not have permissions to access this resource or perform this operation.',
            details: []
          }
        }
        data.body = JSON.stringify(error)
        callback(null, data)
      })
      done()
    })

    after(function (done) {
      agol.req.restore()
      done()
    })

    it('should callback with the error expected up the chain', function (done) {
      agol.getItem('host', 'id', {}, function (err, item) {
        should.exist(err)
        err.message.should.equal('Failed while trying to get item information')
        err.response.should.equal('You do not have permissions to access this resource or perform this operation.')
        err.code.should.equal(403)
        done()
      })
    })
  })

  describe('when calling getFeatureService w/o a url', function () {
    before(function (done) {
      sinon.stub(koop.Cache, 'get', function (type, id, options, callback) {
        callback(null, [])
      })

      sinon.stub(agol, '_page', function (params, options, callback) {
        callback(null, true)
      })

      sinon.stub(agol, 'req', function (url, callback) {
        callback(null, {})
      })

      done()
    })

    after(function (done) {
      koop.Cache.get.restore()
      agol._page.restore()
      agol.req.restore()
      done()
    })

    it('should not call Cache.get', function (done) {
      agol.getItemData('http://foo.bar', 'hostId', 'itemid1', 'dummyhash', {}, function () {
        koop.Cache.get.called.should.equal(false)
        done()
      })
    })
  })

  describe('when calling getFeatureService wtih a url', function () {
    before(function (done) {
      sinon.stub(koop.Cache, 'get', function (type, id, options, callback) {
        callback(null, [])
      })

      done()
    })

    after(function (done) {
      koop.Cache.get.restore()
      done()
    })

    it('should call Cache.get', function (done) {
      agol.getFeatureService({itemJson: { url: 'dummyurl' }}, {}, function () {
        koop.Cache.get.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling getFeatureService wtih in a processing state', function () {
    before(function (done) {
      sinon.stub(koop.Cache, 'get', function (type, id, options, callback) {
        callback(null, [{status: 'processing'}])
      })

      done()
    })

    after(function (done) {
      koop.Cache.get.restore()
      done()
    })

    it('should call Cache.get and reply with processing state', function (done) {
      agol.getFeatureService({itemJson: { url: 'dummyurl' }}, {}, function (err, json) {
        should.not.exist(err)
        should.exist(json.koop_status)
        json.koop_status.should.equal('processing')
        should.exist(json.data)
        koop.Cache.get.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling getFeatureService wtih too much data', function () {
    before(function (done) {
      sinon.stub(koop.Cache, 'get', function (type, id, options, callback) {
        callback(null, [{status: 'too big'}])
      })

      done()
    })

    after(function (done) {
      koop.Cache.get.restore()
      done()
    })

    it('should call Cache.get can return with "too big"', function (done) {
      agol.getFeatureService({itemJson: { url: 'dummyurl' }}, {}, function (err, json) {
        should.not.exist(err)
        should.exist(json.data[0].status)
        should.exist(json.data)
        koop.Cache.get.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling getFeatureService with no data in the cache', function () {
    before(function (done) {
      sinon.stub(koop.Cache, 'get', function (type, id, options, callback) {
        callback(true, [{}])
      })

      sinon.stub(agol, 'featureServiceRequest', function (params, options, callback) {
        callback(null, [])
      })

      done()
    })

    after(function (done) {
      koop.Cache.get.restore()
      agol.featureServiceRequest.restore()
      done()
    })

    it('should call Cache.get', function (done) {
      agol.getFeatureService({itemJson: { url: 'dummyurl' }}, {}, function (err, json) {
        should.not.exist(err)
        koop.Cache.get.called.should.equal(true)
        agol.featureServiceRequest.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling featureServiceRequest with more than 1000 features', function () {
    before(function (done) {
      sinon.stub(agol, 'req', function (url, callback) {
        callback(null, {body: '{"count":1001}' })
      })
      sinon.stub(agol, '_page', function (params, options, callback) {
        callback(null, {})
      })
      done()
    })

    after(function (done) {
      agol.req.restore()
      agol._page.restore()
      done()
    })

    it('should call pageFeatureService', function (done) {
      agol.featureServiceRequest({itemJson: {url: 'http://'}}, {name: 'fake'}, function (err, json) {
        should.not.exist(err)
        agol._page.called.should.equal(true)
        done()
      })
    })
  })

  describe('when when trying to build a page job', function () {
    before(function (done) {
      sinon.stub(agol, '_initFeatureService', function (url, options) {
        var service = {}
        service.pages = function (callback) {
          var error = new Error('Unable to get the layer metadata')
          error.timestamp = 'timeoclock'
          error.url = 'http://error.com'
          error.body = {
            message: 'Token Required',
            code: 499,
            details: []
          }
          callback(error)
        }
        return service
      })
      done()
    })

    after(function (done) {
      agol._initFeatureService.restore()
      done()
    })

    it('should callback with the error expected up the chain', function (done) {
      var params = {
        itemJson: {
          url: 'http://www.foobar.com'
        }
      }
      var options = {}
      var expected = new Error('Unable to get the layer metadata')
      expected.code = 500
      agol._page(params, options, function (err, pages) {
        should.exist(err)
        err.message.should.equal('Unable to get the layer metadata')
        err.timestamp.should.equal('timeoclock')
        err.code.should.equal(499)
        err.request.should.equal('http://error.com')
        err.response.should.equal('Token Required')
        done()
      })
    })
  })

  describe('when setting a dataset as failed', function () {
    before(function (done) {
      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, {})
      })

      sinon.stub(agol, 'updateInfo', function (key, info, callback) {
        callback(info)
      })
      done()
    })

    after(function (done) {
      agol.getInfo.restore()
      agol.updateInfo.restore()
      done()
    })

    it('should update the info doc with the correct failure structure', function (done) {
      var key = 'datakey'
      var error = new Error('Failed while paging data')
      error.url = 'http://www.error.com'
      error.timestamp = 'time'
      error.body = {
        message: 'Failed to perform query operation',
        code: 999,
        details: []
      }

      agol.setFail(key, error, function (info) {
        info.status.should.equal('processing')
        info.generating.error.should.exist
        info.generating.error.timestamp.should.equal('time')
        info.generating.error.code.should.equal(999)
        info.generating.error.request.should.equal('http://www.error.com')
        info.generating.error.response.should.equal('Failed to perform query operation')
        info.generating.error.message.should.equal('Failed while paging data')
        done()
      })
    })
  })

  describe('when getting a csv item', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/csvItem.json'))
      sinon.stub(agol, 'getItem', function (host, itemId, options, callback) {
        itemJson.type = 'CSV'
        callback(null, itemJson)
      })
      sinon.stub(agol, 'getCSV', function (base_url, params, options, callback) {
        callback(null, itemInfo)
      })
      sinon.stub(koop.Cache, 'getInfo', function (key, callback) {
        itemInfo.expires_at = new Date().getTime() + 60000
        callback(null, itemInfo)
      })
      done()
    })

    after(function (done) {
      koop.Cache.getInfo.restore()
      agol.getItem.restore()
      agol.getCSV.restore()
      done()
    })

    it('should call getCSV', function (done) {
      agol.getItemData('host', 'hostId', 'itemid1', 'dummyhash', {}, function () {
        koop.Cache.getInfo.called.should.equal(true)
        agol.getItem.called.should.equal(true)
        agol.getCSV.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling getCSV', function () {
    before(function (done) {
      sinon.stub(agol, 'req', function (base_url, callback) {
        callback(null, {body: '"id","lat","lon"\n"1","40.1","-105.5"'})
      })
      sinon.stub(koop.Cache, 'get', function (type, id, options, callback) {
        callback('Error', null)
      })
      sinon.stub(koop.Cache, 'insert', function (type, id, data, options, callback) {
        callback(null, true)
      })
      sinon.stub(koop.Cache, 'insertPartial', function (type, id, data, options, callback) {
        callback(null, true)
      })
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())
      sinon.stub(koop.Cache, 'getInfo', function (key, callback) {
        callback(null, itemInfo)
      })
      sinon.stub(koop.GeoJSON, 'fromCSV', function (data, callback) {
        callback(null, {})
      })
      done()
    })

    after(function (done) {
      koop.Cache.get.restore()
      koop.Cache.insert.restore()
      koop.Cache.getInfo.restore()
      koop.Cache.insertPartial.restore()
      agol.req.restore()
      koop.GeoJSON.fromCSV.restore()
      done()
    })

    it('should call cache.get and cache.insert, and should return GeoJSON', function (done) {
      agol.getCSV('base-url', {itemJson: {name: 'testname', size: 1}}, {}, function (err, data) {
        should.not.exist(err)
        koop.Cache.get.called.should.equal(true)
        agol.req.called.should.equal(true)
        koop.Cache.insert.called.should.equal(true)
        koop.Cache.insertPartial.called.should.equal(true)
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
        callback(null)
      })
      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, {})
      })
      sinon.stub(koop.Cache, 'updateInfo', function (key, info, callback) {
        callback(null, true)
      })
      done()
    })

    after(function (done) {
      koop.Cache.updateInfo.restore()
      agol.getInfo.restore()
      agol.saveFile.restore()
      agol.getGeoHash.restore()
      done()
    })

    // all we test here is the flow of the code, the logic
    // we make sure each method is called, but dont really test the methods here
    it('should not call saveFile when getting a geohash w/out a where clause', function (done) {
      agol.buildGeohash({}, '/geohash-dir/', 'geohash.json', {}, function (err, geohash) {
        should.not.exist(err)
        agol.getInfo.called.should.equal(true)
        agol.getGeoHash.called.should.equal(false)
        agol.saveFile.called.should.equal(false)
        koop.Cache.updateInfo.called.should.equal(true)
        done()
      })
    })

    it('should call saveFile when getting a geohash w/where clause', function (done) {
      agol.buildGeohash({}, '/geohash-dir/', 'geohash.json', {where: '1=1'}, function (err, geohash) {
        should.not.exist(err)
        agol.getInfo.called.should.equal(true)
        agol.getGeoHash.called.should.equal(true)
        agol.saveFile.called.should.equal(true)
        koop.Cache.updateInfo.called.should.equal(true)
        done()
      })
    })

  })

})
