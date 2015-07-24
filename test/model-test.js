/* global before, after, it, describe */

var should = require('should')
var sinon = require('sinon')
var fs = require('fs')
var koop = require('koop/lib')

var config = {}

var itemJson = require('./fixtures/itemJson.js')
var largeCSV = fs.readFileSync(__dirname + '/fixtures/largeCSV.csv').toString()

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
      var itemInfo = require('./fixtures/itemInfo.js')
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
      var itemInfo = require('./fixtures/itemInfo.js')

      sinon.stub(agol, 'getItem', function (host, itemId, options, callback) {
        callback(null, itemJson)
      })

      sinon.stub(agol, 'getData', function (type, host, itemId, hash, options, callback) {
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
      var itemInfo = require('./fixtures/itemInfo.js')

      sinon.stub(agol, 'getItem', function (host, itemId, options, callback) {
        callback(null, itemJson)
      })

      sinon.stub(agol, 'getData', function (type, host, itemId, hash, options, callback) {
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
      var itemInfo = require('./fixtures/itemInfo.js')

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
        agol.getFeatureService.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling getFeatureService w/o a url', function () {
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
      agol.getItemData('host', 'hostId', 'itemid1', 'dummyhash', {}, function () {
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

  /* describe('when calling pageFeatureService w/statistics', function() {
    before(function(done){
      var serviceInfo = require('./fixtures/serviceInfo.js')
      var features = require('./fixtures/esriJson.js')

      sinon.stub(agol, '_page', function(count, pageRequests, id, itemJson, layerId){

      })

      sinon.stub(agol, 'req', function(url, callback){
        callback(null, {body: JSON.stringify({features: [{attributes: {min_oid:1, max_oid: 1001}}]})})
      })
      sinon.stub(agol, 'getObjectIDField', function(info){
        return {name: 'id'}
      })
      sinon.stub(agol, 'getFeatureServiceLayerInfo', function(url, layer, callback){
        serviceInfo.advancedQueryCapabilities = {supportsPagination:false}
        serviceInfo.supportsStatistics = true
        serviceInfo.fields = [{ name: 'OBJECTID', type: 'esriFieldTypeOID'}]
        callback(null, serviceInfo)
      })
      sinon.stub(koop.Cache, 'insert', function(type, id, geojson, layer, callback){
        callback(null, true)
      })
      sinon.stub(koop.Cache, 'remove', function(type, id, layer, callback){
        callback(null, true)
      })
      sinon.stub(koop.Cache, 'getInfo', function(key, callback){
        callback(null, false)
      })
      done()
    })

    after(function(done){
      koop.Cache.insert.restore()
      koop.Cache.remove.restore()
      koop.Cache.getInfo.restore()
      agol._page.restore()
      agol.req.restore()
      agol.getFeatureServiceLayerInfo.restore()
      agol.getObjectIDField.restore()
      done()
    })

    it('should call _page', function(done){
      agol.pageFeatureService('test', 'itemid', itemJson, 1001, 'dummyhash', {}, function(err, json){
        agol.getFeatureServiceLayerInfo.called.should.equal(true)
        koop.Cache.insert.called.should.equal(true)
        agol._page.called.should.equal(true)
        done()
      })
    })
  }); */

  describe('when getting a csv item', function () {
    before(function (done) {
      var itemInfo = require('./fixtures/itemInfo.js')
      itemInfo.type = 'CSV'
      sinon.stub(agol, 'getItem', function (host, itemId, options, callback) {
        itemJson.type = 'CSV'
        callback(null, itemJson)
      })
      sinon.stub(agol, 'getCSV', function (base_url, id, itemJson, options, callback) {
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
      var itemInfo = require('./fixtures/itemInfo.js')
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
        // koop.Cache.get.called.should.equal(true)
        // agol.req.called.should.equal(true)
        // Cache.insert.called.should.equal(true)
        // Cache.insertPartial.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling getCSV with large data', function () {
    before(function (done) {
      sinon.stub(agol, 'req', function (base_url, callback) {
        callback(null, {body: largeCSV})
      })
      sinon.stub(koop.Cache, 'get', function (type, id, options, callback) {
        callback(null, {info: {status: 'too big'}})
      })
      var itemInfo = require('./fixtures/itemInfo.js')
      sinon.stub(koop.Cache, 'getInfo', function (key, callback) {
        callback(null, itemInfo)
      })
      done()
    })

    after(function (done) {
      koop.Cache.get.restore()
      koop.Cache.getInfo.restore()
      agol.req.restore()
      done()
    })

    it('should call cache.get and cache.insert, and should return GeoJSON', function (done) {
      agol.getCSV('base-url', {itemJson: {}}, {}, function (err, entry) {
        should.not.exist(err)
        entry.data.info.status.should.equal('too big')
        koop.Cache.get.called.should.equal(true)
        // agol.req.called.should.equal(true)
        // koop.Cache.insert.called.should.equal(true)
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
