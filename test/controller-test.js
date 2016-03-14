/* global before, beforeEach, after, afterEach, it, describe */
var should = require('should') // eslint-disable-line
var sinon = require('sinon')
var request = require('supertest')
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
      sinon.stub(agol.cache, 'getInfo', function (key, callback) {
        callback(null, {})
      })

      done()
    })

    after(function (done) {
      agol.cache.getInfo.restore()
      done()
    })

    it('should call find and getItem', function (done) {
      request(koop)
        .get('/agol/test/itemid')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          agol.cache.getInfo.called.should.equal(true)
          done()
        })
    })
  })

  describe("getting a resource's expiration", function () {
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

  describe("setting a resource's expiration", function () {
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

      sinon.stub(agol, 'cacheResource', function (options, callback) {
        callback(null, {})
      })

      request(koop)
        .put('/agol/test/itemid/0/expiration')
        .send({expires_at: date.toISOString()})
        .expect(201, {status: 'Processing', expires_at: date.toISOString()})
        .end(function (err, res) {
          agol.setExpiration.restore()
          should.not.exist(err)
          res.should.have.status(201)
          agol.cacheResource.called.should.equal(true)
          agol.cacheResource.restore()
          done()
        })
    })
  })
  describe('dropping item metadata', function () {
    before(function (done) {
      sinon.stub(agol, 'dropResource', function (item, layer, options, callback) {
        callback(null, {})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })
      done()
    })

    after(function (done) {
      agol.dropResource.restore()
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
          agol.dropResource.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting item feature data in a processing state', function () {
    before(function (done) {
      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      sinon.stub(agol, 'getInfo', function (key, callback) {
        callback(null, {status: 'Processing'})
      })

      sinon.stub(agol.cache, 'getCount', function (key, options, callback) {
        callback(null, 10000)
      })
      done()
    })

    after(function (done) {
      agol.getInfo.restore()
      agol.cache.getCount.restore()
      agol.find.restore()
      done()
    })

    it('should call Cache.getInfo and return 202', function (done) {
      request(koop)
        .get('/agol/test/itemid/0.zip')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(202)
          agol.getInfo.called.should.equal(true)
          agol.cache.getCount.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting an item that is in a failed state', function () {
    beforeEach(function (done) {
      sinon.stub(agol, 'dropResource', function (id, item, options, callback) {
        callback(null)
      })

      sinon.stub(agol, 'cacheResource', function (options, callback) {
        callback(null, {status: 'Processing'})
      })

      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      done()
    })

    afterEach(function (done) {
      controller._returnStatus.restore()
      agol.dropResource.restore()
      agol.cacheResource.restore()
      agol.find.restore()
      done()
    })

    it('should call drop and cacheResource if failure was more than 30 minutes ago', function (done) {
      sinon.stub(controller, '_returnStatus', function (req, res, info) {
        res.status(202).send({})
      })
      // yes is this a hack, but onSecondCall is not available when you instantiate sinon.stub with an object and method
      var infoFunc = _.clone(agol.getInfo)
      var stub = sinon.stub()
      stub.onFirstCall().callsArgWith(1, null, {
        status: 'Failed',
        retrieved_at: Date.now() - (45 * 60 * 1000)
      })
      stub.onSecondCall().callsArgWith(1, null, {
        status: 'Unavailable'
      })
      agol.getInfo = stub

      request(koop)
        .get('/agol/test/itemId/3.zip')
        .expect(202)
        .end(function (err, res) {
          should.not.exist(err)
          agol.dropResource.called.should.equal(true)
          controller._returnStatus.called.should.equal(true)
          agol.cacheResource.called.should.equal(true)
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

      sinon.stub(controller, '_returnStatus', function (req, res, info) {
        res.status(502).send({})
      })

      request(koop)
        .get('/agol/test/itemId/3.zip')
        .expect(502)
        .end(function (err, res) {
          agol.getInfo.restore()
          should.not.exist(err)
          agol.dropResource.called.should.equal(false)
          controller._returnStatus.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting geohash json', function () {
    before(function (done) {
      sinon.stub(agol.files, 'exists', function (path, name, callback) {
        callback(false, null)
      })

      sinon.stub(agol, 'buildGeohash', function (options, info, callback) {
        callback()
      })

      sinon.stub(agol, 'getInfo', function (options, callback) {
        callback(null, {status: 'Cached'})
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
      done()
    })

    it('should call agol.buildGeohash', function (done) {
      request(koop)
        .get('/agol/test/itemid/0/geohash')
        .expect(202)
        .end(function (err, res) {
          should.not.exist(err)
          agol.buildGeohash.called.should.equal(true)
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
        callback(null, {status: 'Unavailable'})
      })

      // stub this but dont respond since the geohash method will respond sooner
      sinon.stub(agol, 'cacheResource', function (options, callback) {
        callback(null, {status: 'Processing'})
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
      agol.cacheResource.restore()
      done()
    })

    it('should call controller.findItemData when the cache is empty (populate the cache)', function (done) {
      request(koop)
        .get('/agol/test/itemid/1/geohash')
        .expect(202)
        .end(function (err, res) {
          should.not.exist(err)
          agol.getInfo.called.should.equal(true)
          agol.cacheResource.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting item feature data w/ a format', function () {
    describe('when the format is not generating', function () {
      before(function (done) {
        sinon.stub(agol, 'find', function (id, callback) {
          callback(null, { id: 'test', host: 'http://dummy.host.com' })
        })

        sinon.stub(agol, 'getInfo', function (key, callback) {
          callback(null, {
            status: 'Cached',
            name: 'Export',
            info: {
              fields: []
            }
          })
        })

        sinon.stub(agol.files, 'exists', function (path, name, callback) {
          callback(false, null)
        })

        sinon.stub(agol, 'generateExport', function (options, callback) {
          callback(null, {status: 'Cached', generating: {}})
        })
        done()
      })

      after(function (done) {
        agol.files.exists.restore()
        agol.getInfo.restore()
        agol.find.restore()
        agol.generateExport.restore()
        done()
      })

      it('should call agol.exportFile and return 202', function (done) {
        request(koop)
          .get('/agol/test/itemid/0.csv')
          .expect(202)
          .end(function (err, res) {
            should.not.exist(err)
            agol.getInfo.called.should.equal(true)
            agol.generateExport.called.should.equal(true)
            done()
          })
      })
    })

    describe('when generating is in progress', function () {
      before(function (done) {
        sinon.stub(agol, 'find', function (id, callback) {
          callback(null, { id: 'test', host: 'http://dummy.host.com' })
        })

        sinon.stub(agol, 'getInfo', function (key, callback) {
          callback(null, {
            status: 'Cached',
            name: 'Export',
            info: {
              fields: []
            },
            generating: {
              'full_0': {
                csv: 'progress'
              }
            }
          })
        })

        sinon.stub(agol.files, 'exists', function (path, name, callback) {
          callback(false, null)
        })

        sinon.stub(agol, 'generateExport', function (options, callback) {
          callback(null, {status: 'Cached', generating: {}})
        })
        done()
      })

      after(function (done) {
        agol.files.exists.restore()
        agol.getInfo.restore()
        agol.find.restore()
        agol.generateExport.restore()
        done()
      })

      it('should call agol.exportFile and return 202', function (done) {
        request(koop)
          .get('/agol/test/itemid/0.csv')
          .expect(202)
          .end(function (err, res) {
            should.not.exist(err)
            agol.files.exists.called.should.equal(true)
            agol.getInfo.called.should.equal(true)
            agol.generateExport.called.should.equal(false)
            done()
          })
      })
    })

    describe('when generation has failed', function () {
      before(function (done) {
        sinon.stub(agol, 'find', function (id, callback) {
          callback(null, { id: 'test', host: 'http://dummy.host.com' })
        })

        sinon.stub(agol, 'getInfo', function (key, callback) {
          callback(null, {
            status: 'Cached',
            name: 'Export',
            info: {
              fields: []
            },
            generating: {
              'full_0': {
                csv: 'fail'
              }
            }
          })
        })

        sinon.stub(agol.files, 'exists', function (path, name, callback) {
          callback(false, null)
        })

        sinon.stub(agol, 'generateExport', function (options, callback) {
          callback(null, {status: 'Cached', generating: {}})
        })
        done()
      })

      after(function (done) {
        agol.files.exists.restore()
        agol.getInfo.restore()
        agol.find.restore()
        agol.generateExport.restore()
        done()
      })

      it('should not try to enqueue a new job and should respond with a 500', function (done) {
        request(koop)
          .get('/agol/test/itemid/0.csv')
          .expect(500)
          .end(function (err, res) {
            should.not.exist(err)
            agol.files.exists.called.should.equal(true)
            agol.getInfo.called.should.equal(true)
            agol.generateExport.called.should.equal(false)
            done()
          })
      })
    })
  })

  describe('getting a png tile should return 404 for test', function () {
    before(function (done) {
      agol.tileGet = function () {}

      sinon.stub(agol.cache, 'get', function (item, layer, options, callback) {
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
        callback(null, {status: 'Cached'})
      })

      sinon.stub(agol, 'tileGet', function (params, data, callback) {
        callback(null, '/aFakeTile')
      })
      done()
    })

    after(function (done) {
      delete agol.tileGet
      agol.cache.get.restore()
      agol.getInfo.restore()
      agol.find.restore()
      done()
    })

    it('should call Tiles helper and return 200', function (done) {
      request(koop)
        .get('/agol/test/itemid/0/tiles/5/5/12.png')
        .expect(404)
        .end(function (err, res) {
          should.not.exist(err)
          agol.find.called.should.equal(true)
          agol.cache.get.called.should.equal(true)
          done()
        })
    })
  })

  describe('when returning status to the client', function () {
    before(function (done) {
      sinon.stub(agol.cache, 'getCount', function (key, options, callback) {
        callback(null, 100)
      })
      done()
    })

    after(function (done) {
      agol.cache.getCount.restore()
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
          error: {
            code: 400,
            response: 'Failed to perform query operation',
            url: 'http://www.failure.com',
            message: 'Failed while paging'
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
          should.exist(res.body.error)
          res.body.error.code.should.equal(500)
          res.body.error.response.should.equal('Failed to perform query')
          res.body.error.request.should.equal('http://www.failure.com')
          controller.testMethod.restore()
          should.not.exist(err)
          done()
        })
    })
  })

  describe('When enqueing jobs in bulk', function () {
    var cacheError
    var infoError
    var jobs = [
      {
        id: 'foo',
        layer: 3,
        formats: ['kml', 'csv', 'zip']
      },
      {
        id: 'bar',
        layer: 4,
        formats: ['kml', 'csv', 'zip']
      }
    ]

    beforeEach(function (done) {
      sinon.stub(agol, 'find', function (id, callback) {
        callback(null, { id: 'test', host: 'http://dummy.host.com' })
      })

      sinon.stub(agol, 'cacheResource', function (options, callback) {
        callback(cacheError)
      })

      sinon.stub(agol.cache, 'getInfo', function (id, callback) {
        callback(infoError, { name: 'Test_Download', metadata: 'foobar' })
      })

      sinon.stub(agol, 'generateExport', function (options, callback) {
        callback(null)
      })

      done()
    })

    afterEach(function (done) {
      agol.find.restore()
      agol.cacheResource.restore()
      agol.cache.getInfo.restore()
      agol.generateExport.restore()
      done()
    })

    it('should return the correct count of successfully enqueued import jobs', function (done) {
      cacheError = null

      request(koop)
        .post('/agol/arcgis/bulk/import')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(jobs))
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          var resp = res.body
          resp.meta.total.should.equal(jobs.length)
          resp.meta.succeeded.should.equal(jobs.length)
          resp.meta.failed.should.equal(0)
          should.exist(resp.failed)
          resp.failed.length.should.equal(0)
          done()
        })
    })

    it('should return the correct count of failed import job enqueues', function (done) {
      cacheError = new Error('Item disabled')
      cacheError.url = 'http://foo.com'
      cacheError.response = 'Item disabled'

      request(koop)
        .post('/agol/arcgis/bulk/import')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(jobs))
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          var resp = res.body
          resp.meta.total.should.equal(jobs.length)
          resp.meta.succeeded.should.equal(0)
          resp.meta.failed.should.equal(jobs.length)
          should.exist(resp.failed)
          resp.failed.length.should.equal(2)
          done()
        })
    })

    it('should return the correct count of successfully enqueued export jobs', function (done) {
      infoError = null

      request(koop)
        .post('/agol/arcgis/bulk/export')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(jobs))
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          var resp = res.body
          resp.meta.total.should.equal(jobs.length)
          resp.meta.succeeded.should.equal(jobs.length)
          resp.meta.failed.should.equal(0)
          should.exist(resp.failed)
          resp.failed.length.should.equal(0)
          done()
        })
    })

    it('should return the correct count of failed export job enqueues', function (done) {
      infoError = new Error('Item not found')

      request(koop)
        .post('/agol/arcgis/bulk/export')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(jobs))
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          var resp = res.body
          resp.meta.total.should.equal(jobs.length)
          resp.meta.succeeded.should.equal(0)
          resp.meta.failed.should.equal(jobs.length)
          should.exist(resp.failed)
          resp.failed.length.should.equal(2)
          done()
        })
    })
  })
})
