/* global before, beforeEach, after, afterEach, it, describe, should */
var should = require('should') // eslint-disable-line
var sinon = require('sinon')
var request = require('supertest')
var fs = require('fs')
var koop = require('koop')({logfile: './test.log'})
var _ = require('lodash')

var Provider = require('../index.js')
var agol = Provider.model(koop)
var controller = Provider.controller(agol, koop.BaseController)
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

  describe('getting a resource\'s expiration', function () {
    before(function (done) {
      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, 'http://www.host.com')
      })
      done()
    })

    after(function (done) {
      agol.find.restore()
      done()
    })

    it('should return 404 when the resource does not exist', function (done) {
      sinon.stub(agol, 'getExpiration', function (key, callback) {
        callback(new Error('Resource not found'))
      })

      request(koop)
        .get('/agol/test/itemid/0/expiration')
        .expect(404, {error: 'Resource not found'})
        .end(function (err, res) {
          agol.getExpiration.restore()
          should.not.exist(err)
          done()
        })
    })

    it('should respond with a UTC String when the resource exists', function (done) {
      var expires = '2099'
      sinon.stub(agol, 'getExpiration', function (key, callback) {
        callback(null, expires)
      })

      request(koop)
        .get('/agol/test/itemid/0/expiration')
        .expect(200, {expires_at: new Date('2099').toISOString()})
        .end(function (err, res) {
          agol.getExpiration.restore()
          should.not.exist(err)
          done()
        })
    })
  })

  describe('setting a resource\'s expiration', function () {
    before(function (done) {
      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, 'http://www.host.com')
      })
      done()
    })

    after(function (done) {
      agol.find.restore()
      done()
    })

    it('should return 400 when the inputs are malformed', function (done) {
      sinon.stub(agol, 'setExpiration', function (key, expiration, callback) {
        callback(new Error('Invalid input'))
      })

      request(koop)
        .put('/agol/test/itemid/0/expiration')
        .send({expires_at: 'foo'})
        .expect(400, {error: 'Invalid input'})
        .end(function (err, res) {
          agol.setExpiration.restore()
          should.not.exist(err)
          done()
        })
    })

    it('should return 200 when the inputs are well formed and the resource exists in the cache', function (done) {
      var date = new Date()
      sinon.stub(agol, 'setExpiration', function (key, expiration, callback) {
        callback(null, date)
      })

      request(koop)
        .put('/agol/test/itemid/0/expiration')
        .send({expires_at: date.toISOString()})
        .expect(200, {expires_at: date.toISOString()})
        .end(function (err, res) {
          agol.setExpiration.restore()
          should.not.exist(err)
          done()
        })
    })

    it('should return 201 and kick off a request for the remote resource if the resource is not found in the cache', function (done) {
      var date = new Date()
      sinon.stub(agol, 'setExpiration', function (key, expiration, callback) {
        callback(new Error('Resource not found'), date.getTime())
      })

      sinon.stub(agol, 'getItemData', function (host, hostId, itemId, hash, options, callback) {
        callback(null, {})
      })

      request(koop)
        .put('/agol/test/itemid/0/expiration')
        .send({expires_at: date.toISOString()})
        .expect(201, {status: 'processing', expires_at: date.toISOString()})
        .end(function (err, res) {
          agol.setExpiration.restore()
          should.not.exist(err)
          res.should.have.status(201)
          agol.getItemData.called.should.equal(true)
          agol.getItemData.restore()
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

  describe('getting an item that is in a failed state', function () {
    beforeEach(function (done) {
      sinon.stub(controller, '_returnStatus', function (req, res, info) {
        res.status(500).send({})
      })

      sinon.stub(agol, 'dropItem', function (id, item, options, callback) {
        callback(null)
      })

      sinon.stub(controller, 'download', function (req, res, info) {
        res.status(202).send({})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      done()
    })

    afterEach(function (done) {
      controller._returnStatus.restore()
      agol.dropItem.restore()
      controller.download.restore()
      agol.find.restore()
      done()
    })

    it('should call drop item and getItemData if failure was more than 30 minutes ago', function (done) {
      // yes is this a hack, but onSecondCall is not available when you instantiate sinon.stub with an object and method
      var infoFunc = _.clone(agol.getInfo)
      var stub = sinon.stub()
      stub.onFirstCall().callsArgWith(1, null, {
        status: 'Failed',
        retrieved_at: Date.now() - (45 * 60 * 1000)
      })
      stub.onSecondCall().callsArgWith(1, new Error())
      agol.getInfo = stub

      request(koop)
        .get('/agol/test/itemId/3.zip')
        .expect(202)
        .end(function (err, res) {
          should.not.exist(err)
          agol.dropItem.called.should.equal(true)
          controller._returnStatus.called.should.equal(false)
          controller.download.called.should.equal(true)
          agol.getInfo = infoFunc
          done()
        })
    })

    it('should call _returnStatus if failure was less than 30 minutes ago', function (done) {
      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, {
          status: 'Failed',
          retrieved_at: Date.now() - (15 * 60 * 1000)
        })
      })

      request(koop)
        .get('/agol/test/itemId/3.zip')
        .expect(500)
        .end(function (err, res) {
          agol.getInfo.restore()
          should.not.exist(err)
          agol.dropItem.called.should.equal(false)
          controller._returnStatus.called.should.equal(true)
          controller.download.called.should.equal(false)
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

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, 'http://whateva.com')
      })
      done()
    })

    after(function (done) {
      agol.buildGeohash.restore()
      agol.getInfo.restore()
      agol.files.exists.restore()
      agol.find.restore()
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
      sinon.stub(controller, 'findItemData', function (req, res) {
        res.status(202).json({status: 'processing'})
      })

      done()

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {host: 'http://www.arcgis.com'})
      })
    })

    after(function (done) {
      agol.getInfo.restore()
      agol.files.exists.restore()
      agol.find.restore()
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
        callback(null, {
          data: [{
            info: {
              name: 'dummy'
            },
            features: [{}]
          }]
        })
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, { id: 'test', host: 'http://dummy.host.com' })
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
        callback(null, {
          koop_status: 'too big',
          name: 'test',
          info: {},
          data: [{
            info: {
              name: 'dummy'
            },
            features: [{}]
          }]
        })
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, { id: 'test', host: 'http://dummy.host.com' })
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
        callback(null, {
          koop_status: 'too big',
          data: [{
            info: 'dummy',
            features: [{}]
          }]
        })
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
        callback(null, {
          name: '',
          koop_status: 'too big',
          data: [{
            name: '',
            info: 'dummy',
            features: [{}]
          }]
        })
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, { id: 'test', host: 'http://dummy.host.com' })
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
        callback(null, {
          name: '',
          koop_status: 'processing',
          data: [{
            name: '',
            info: 'dummy',
            features: [{}]
          }]
        })
      })
      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, { id: 'test', host: 'http://dummy.host.com' })
      })
      sinon.stub(controller, '_returnStatus', function (req, res, json, callback) {
        callback(null, json)
      })
      done()
    })

    after(function (done) {
      agol.getItemData.restore()
      agol.find.restore()
      controller._returnStatus.restore()
      done()
    })

    it('should call controller._returnStatus', function (done) {
      controller._getItemData(req, res, function (err, json) {
        should.not.exist(err)
        should.exist(json)
        controller._returnStatus.called.should.equal(true)
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

  describe('when returning status to the client', function () {
    before(function (done) {
      sinon.stub(agol, 'getCount', function (key, options, callback) {
        callback(null, 100)
      })
      done()
    })

    after(function (done) {
      agol.getCount.restore()
      done()
    })

    it('should return 202 when the resource is processing', function (done) {
      sinon.stub(controller, 'testMethod', function (req, res) {
        var info = {
          status: 'processing',
          retrieved_at: Date.now()
        }
        controller._returnStatus(req, res, info)
      })

      request(koop)
        .get('/test')
        .expect(202)
        .end(function (err, res) {
          controller.testMethod.restore()
          should.not.exist(err)
          done()
        })

    })

    it('should return 502 when the info doc says the resource has failed', function (done) {
      sinon.stub(controller, 'testMethod', function (req, res) {
        var info = {
          status: 'Failed',
          retrieved_at: Date.now(),
          generating: {
            error: {
              code: 400,
              response: 'Failed to perform query operation',
              url: 'http://www.failure.com',
              message: 'Failed while paging'
            }
          }
        }
        controller._returnStatus(req, res, info)
      })

      request(koop)
        .get('/test')
        .expect(502)
        .end(function (err, res) {
          controller.testMethod.restore()
          should.not.exist(err)
          done()
        })
    })

    it('should return 502 when an error is passed in', function (done) {
      sinon.stub(controller, 'testMethod', function (req, res) {
        var info = {
          status: 'Processing',
          retrieved_at: Date.now()
        }
        var error = new Error('Failed to get layer metadata')
        error.url = 'http://www.failure.com'
        error.body = {
          code: 500,
          message: 'Failed to perform query',
          details: []
        }
        controller._returnStatus(req, res, info, error)
      })

      request(koop)
        .get('/test')
        .expect(502)
        .end(function (err, res) {
          res.body.status.should.equal('Failed')
          should.exist(res.body.generating)
          res.body.generating.error.code.should.equal(500)
          res.body.generating.error.response.should.equal('Failed to perform query')
          res.body.generating.error.request.should.equal('http://www.failure.com')
          controller.testMethod.restore()
          should.not.exist(err)
          done()
        })
    })
  })

})
