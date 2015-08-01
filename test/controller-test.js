/* global before, after, it, describe, should */
var should = require('should') // eslint-disable-line
var sinon = require('sinon')
var request = require('supertest')
var fs = require('fs')
var kooplib = require('koop/lib')

var koop = require('koop')({})

var Provider = require('../index.js')
var agol = Provider.model(kooplib)
var controller = Provider.controller(agol, kooplib.BaseController)
koop._bindRoutes(Provider.routes, controller)

describe('AGOL Controller', function () {
  describe('add / get / remove hosts', function () {
    before(function (done) {
      sinon.stub(agol, 'register', function (id, host, callback) {
        callback(null, 'test')
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, [])
      })
      sinon.stub(agol, 'remove', function (id, callback) {
        callback(null, {})
      })
      done()
    })

    after(function (done) {
      agol.register.restore()
      agol.find.restore()
      agol.remove.restore()
      done()
    })

    it('should call register and fail', function (done) {
      request(koop)
        .post('/agol')
        .set('Content-Type', 'application/json')
        .send({
          'id': 'tester'
        })
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(400)
          agol.register.called.should.equal(false)
          done()
        })
    })

    it('when passing in a host and id ', function (done) {
      request(koop)
        .post('/agol')
        .set('Content-Type', 'application/json')
        .send({
          'id': 'tester',
          'host': 'http://dummy.host.com'
        })
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.register.called.should.equal(true)
          done()
        })
    })

    it('when listing hosts at /agol', function (done) {
      request(koop)
        .get('/agol')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.find.called.should.equal(true)
          done()
        })
    })

    it('when getting a host at /agol/id ', function (done) {
      request(koop)
        .get('/agol/test')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.find.called.should.equal(true)
          done()
        })
    })

    it('when removing a host at /agol/id ', function (done) {
      request(koop)
        .del('/agol/test')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.remove.called.should.equal(true)
          done()
        })
    })
  })

  describe('finding item metadata', function () {
    before(function (done) {
      sinon.stub(agol, 'getItem', function (host, item, options, callback) {
        callback(null, {})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })
      done()
    })

    after(function (done) {
      agol.getItem.restore()
      agol.find.restore()
      done()
    })

    it('should call find and getItem', function (done) {
      request(koop)
        .get('/agol/test/itemid')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.find.called.should.equal(true)
          agol.getItem.called.should.equal(true)
          done()
        })
    })
  })
  describe('dropping item metadata', function () {
    before(function (done) {
      sinon.stub(agol, 'dropItem', function (host, item, options, callback) {
        callback(null, {})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })
      done()
    })

    after(function (done) {
      agol.dropItem.restore()
      agol.find.restore()
      done()
    })

    it('should call find and dropItem', function (done) {
      request(koop)
        .get('/agol/test/itemid/0/drop')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.find.called.should.equal(true)
          agol.dropItem.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting item feature data in a processing state', function () {
    before(function (done) {
      sinon.stub(agol, 'getItemData', function (host, id, item, key, options, callback) {
        callback(null, {})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, {status: 'processing'})
      })

      sinon.stub(agol, 'getCount', function (key, options, callback) {
        callback(null, 10000)
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.getInfo.restore()
      agol.getCount.restore()
      agol.find.restore()
      done()
    })

    it('should call Cache.getInfo and return 202', function (done) {
      request(koop)
        .get('/agol/test/itemid/0')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(202)
          agol.getInfo.called.should.equal(true)
          agol.getCount.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting item feature data w/o a format', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())

      sinon.stub(agol, 'getItemData', function (host, hostId, item, key, options, callback) {
        callback(null, {name: '', data: [{name: '', features: []}]})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, itemInfo)
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.getInfo.restore()
      agol.find.restore()
      done()
    })

    it('should call agol.getInfo and return 200', function (done) {
      request(koop)
        .get('/agol/test/itemid/0')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.getItemData.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting geohash json', function () {
    before(function (done) {
      sinon.stub(agol.files, 'exists', function (path, name, callback) {
        callback(false)
      })

      sinon.stub(agol, 'buildGeohash', function (params, filePath, fileName, options) {
        return true
      })

      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())
      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, itemInfo)
      })

      sinon.stub(controller, 'createGeohash', function (req, res, filePath, fileName) {
        agol.buildGeohash({}, filePath, fileName, {})
        res.send(true)
      })
      done()
    })

    after(function (done) {
      agol.buildGeohash.restore()
      agol.getInfo.restore()
      agol.files.exists.restore()
      controller.createGeohash.restore()
      done()
    })

    it('should call agol.buildGeohash', function (done) {
      request(koop)
        .get('/agol/test/itemid/0/geohash')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.buildGeohash.called.should.equal(true)
          controller.createGeohash.called.should.equal(true)
          done()
        })
    })

  })

  describe('getting geohash json', function () {
    before(function (done) {
      sinon.stub(agol.files, 'exists', function (path, name, callback) {
        callback(false)
      })

      sinon.stub(agol, 'getInfo', function (key, callback) {
        // send no INFO to force the method to
        callback(null, null)
      })

      // stub this but dont respond since the geohash method will respond sooner
      sinon.stub(controller, 'findItemData', function (req, res) { })

      done()
    })

    after(function (done) {
      agol.getInfo.restore()
      agol.files.exists.restore()
      controller.findItemData.restore()
      done()
    })

    it('should call controller.findItemData when the cache is empty (populate the cache)', function (done) {
      request(koop)
        .get('/agol/test/itemid/1/geohash')
        .end(function (err, res) {
          should.not.exist(err)
          agol.getInfo.called.should.equal(true)
          controller.findItemData.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting item feature data w/a format', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())

      sinon.stub(agol, 'getItemData', function (host, hostId, item, key, options, callback) {
        callback(null, { data: [{info: {name: 'dummy'}, features: [{}]}]})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      sinon.stub(agol, 'getItem', function (host, id, options, callback) {
        callback(null, itemInfo)
      })

      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, itemInfo)
      })
      sinon.stub(controller, '_getItemData', function (params, query, callback) {
        callback(null, {})
      })

      sinon.stub(controller, '_requestNewFile', function (params) {
        params.res.status(200).send('newfile')
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.getInfo.restore()
      agol.find.restore()
      controller._getItemData.restore()
      controller._requestNewFile.restore()
      done()
    })

    it('should call agol.exportFile and return 200', function (done) {
      request(koop)
        .get('/agol/test/itemid/0.csv')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.getInfo.called.should.equal(true)
          controller._getItemData.called.should.equal(true)
          done()
        })
    })
  })

  // Exporter.exportLarge
  describe('getting large feature data w/a format', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())

      sinon.stub(agol, 'exportFile', function (params, opts, callback) {
        callback(null, '/aFakeLargeFile')
      })

      sinon.stub(agol, 'getItemData', function (host, hostId, item, key, options, callback) {
        callback(null, { koop_status: 'too big', name: 'test', info: {}, data: [{ info: {name: 'dummy'}, features: [{}]}]})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, itemInfo)
      })

      sinon.stub(agol, 'getCount', function (key, options, callback) {
        callback(null, 100)
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.getInfo.restore()
      agol.find.restore()
      agol.getCount.restore()
      agol.exportFile.restore()
      done()
    })

    it('should call Exporter.exportFile an return 202', function (done) {
      request(koop)
        .get('/agol/test/itemid/0.csv')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(202)
          agol.getInfo.called.should.equal(true)
          agol.exportFile.called.should.equal(true)
          agol.getItemData.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting an existing thumbnail', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())

      sinon.stub(agol, 'getItemData', function (host, hostId, item, key, options, callback) {
        callback(null, { koop_status: 'too big', data: [{info: 'dummy', features: [{}]}]})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, itemInfo)
      })

      sinon.stub(agol, 'generateThumbnail', function (data, key, opts, callback) {
        callback(null, '/aFakeThumbnail')
      })

      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.getInfo.restore()
      agol.find.restore()
      agol.generateThumbnail.restore()
      done()
    })

    it('should call Thumbnail generate and return 200', function (done) {
      request(koop)
        .get('/agol/test/itemid/Thumbnail/0')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(404)
          agol.find.called.should.equal(true)
          agol.generateThumbnail.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting a png tile should return 404 for test', function () {
    before(function (done) {
      var itemInfo = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json').toString())

      sinon.stub(agol, 'getItemData', function (host, hostId, item, key, options, callback) {
        callback(null, { name: '', koop_status: 'too big', data: [{name: '', info: 'dummy', features: [{}]}]})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, itemInfo)
      })

      sinon.stub(agol, 'tileGet', function (params, data, callback) {
        callback(null, '/aFakeTile')
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.getInfo.restore()
      agol.find.restore()
      agol.tileGet.restore()
      done()
    })

    it('should call Tiles helper and return 200', function (done) {
      request(koop)
        .get('/agol/test/itemid/0/tiles/5/5/12.png')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(404)
          agol.find.called.should.equal(true)
          agol.getItemData.called.should.equal(true)
          done()
        })
    })
  })

  // fake req / res objects
  var req = {
    params: {
      id: 'hostid',
      item: 'itemid',
      key: 'cachekey'
    },
    query: {
      options: {}
    }
  }

  var res = {}

  describe('when calling controller._getItemData', function () {
    before(function (done) {
      var itemJson = JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemJson.json').toString())
      sinon.stub(agol, 'getItemData', function (host, hostId, item, key, options, callback) {
        callback(null, itemJson)
      })
      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.find.restore()
      done()
    })

    it('should call agol.getItemData and return itemJson', function (done) {
      controller._getItemData(req, res, function (err, json) {
        should.not.exist(err)
        should.exist(json)
        agol.getItemData.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling controller._getItemData with a processing dataset', function () {
    before(function (done) {
      sinon.stub(agol, 'getItemData', function (host, hostId, item, key, options, callback) {
        callback(null, { name: '', koop_status: 'processing', data: [{name: '', info: 'dummy', features: [{}]}]})
      })
      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })
      sinon.stub(controller, '_returnProcessing', function (req, res, json, callback) {
        callback(null, json)
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.find.restore()
      controller._returnProcessing.restore()
      done()
    })

    it('should call controller._returnProcessing', function (done) {
      controller._getItemData(req, res, function (err, json) {
        should.not.exist(err)
        should.exist(json)
        controller._returnProcessing.called.should.equal(true)
        done()
      })
    })
  })

  describe('when calling controller._getItemData w/o data in the cache', function () {
    before(function (done) {
      sinon.stub(agol, 'getItemData', function (host, hostId, item, key, options, callback) {
        callback()
      })
      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.find.restore()
      done()
    })

    it('should call agol.getItemData and return null', function (done) {
      controller._getItemData(req, res, function (err, json) {
        should.not.exist(err)
        should.not.exist(json)
        agol.getItemData.called.should.equal(true)
        done()
      })
    })
  })

  describe('when creating a cache key', function () {
    var params = {
      item: 'item',
      layer: 0
    }
    var query1 = {
      foo: 1,
      bar: 1
    }
    var query2 = {
      bar: 1,
      foo: 1
    }
    var key1 = controller._createCacheKey(params, query1)
    it('should create the same cache key when query params are out of order', function (done) {
      var key2 = controller._createCacheKey(params, query2)
      key1.should.equal(key2)
      done()
    })
    it('should create the same cache key on url only requests', function (done) {
      query2.url_only = true
      var key2 = controller._createCacheKey(params, query2)
      key1.should.equal(key2)
      delete query2.url_only
      done()
    })
    it('should create the same cache key on format requests', function (done) {
      query2.format = 'zip'
      var key2 = controller._createCacheKey(params, query2)
      key1.should.equal(key2)
      delete query2.format
      done()
    })
  })

})
