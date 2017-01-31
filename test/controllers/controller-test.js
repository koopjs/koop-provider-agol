/* global before, beforeEach, after, afterEach, it, describe */
var should = require('should') // eslint-disable-line
var sinon = require('sinon')
var request = require('supertest')
var Koop = require('koop')
var koop = new Koop({logfile: './test.log'})
var LocalFs = require('koop-localfs')
koop.register(LocalFs)
var fs = require('fs')
var pathModule = require('path')

var Provider = require('../../index.js')
koop.register(Provider)

describe('AGOL Controller', function () {
  describe('add / get / remove hosts', function () {
    before(function (done) {
      sinon.stub(koop.controllers.agol.model, 'register', function (id, host, callback) {
        callback(null, 'test')
      })

      sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
        callback(null, [])
      })
      sinon.stub(koop.controllers.agol.model, 'remove', function (id, callback) {
        callback(null, {})
      })
      done()
    })

    after(function (done) {
      koop.controllers.agol.model.register.restore()
      koop.controllers.agol.model.find.restore()
      koop.controllers.agol.model.remove.restore()
      done()
    })

    it('should call register and fail', function (done) {
      request(koop.server)
        .post('/agol')
        .set('Content-Type', 'application/json')
        .send({
          'id': 'tester'
        })
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(400)
          koop.controllers.agol.model.register.called.should.equal(false)
          done()
        })
    })

    it('when passing in a host and id ', function (done) {
      request(koop.server)
        .post('/agol')
        .set('Content-Type', 'application/json')
        .send({
          'id': 'tester',
          'host': 'http://dummy.host.com'
        })
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          koop.controllers.agol.model.register.called.should.equal(true)
          done()
        })
    })

    it('when listing hosts at /agol', function (done) {
      request(koop.server)
        .get('/agol')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          koop.controllers.agol.model.find.called.should.equal(true)
          done()
        })
    })

    it('when getting a host at /agol/id ', function (done) {
      request(koop.server)
        .get('/agol/test')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          koop.controllers.agol.model.find.called.should.equal(true)
          done()
        })
    })

    it('when removing a host at /agol/id ', function (done) {
      request(koop.server)
        .del('/agol/test')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          koop.controllers.agol.model.remove.called.should.equal(true)
          done()
        })
    })
  })

  describe('finding item metadata', function () {
    before(function (done) {
      sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (key, callback) {
        callback(null, {})
      })

      done()
    })

    after(function (done) {
      koop.controllers.agol.model.cache.getInfo.restore()
      done()
    })

    it('should call find and getItem', function (done) {
      request(koop.server)
        .get('/agol/test/itemid')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
          done()
        })
    })
  })

  describe("getting a resource's expiration", function () {
    before(function (done) {
      sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
        callback(null, 'http://www.host.com')
      })
      done()
    })

    after(function (done) {
      koop.controllers.agol.model.find.restore()
      done()
    })

    it('should return 404 when the resource does not exist', function (done) {
      sinon.stub(koop.controllers.agol.model, 'getExpiration', function (key, callback) {
        callback(new Error('Resource not found'))
      })

      request(koop.server)
        .get('/agol/test/itemid/0/expiration')
        .expect(404, {error: 'Resource not found'})
        .end(function (err, res) {
          koop.controllers.agol.model.getExpiration.restore()
          should.not.exist(err)
          done()
        })
    })

    it('should respond with a UTC String when the resource exists', function (done) {
      var expires = '2099'
      sinon.stub(koop.controllers.agol.model, 'getExpiration', function (key, callback) {
        callback(null, expires)
      })

      request(koop.server)
        .get('/agol/test/itemid/0/expiration')
        .expect(200, {expires_at: new Date('2099').toISOString()})
        .end(function (err, res) {
          koop.controllers.agol.model.getExpiration.restore()
          should.not.exist(err)
          done()
        })
    })
  })

  describe("setting a resource's expiration", function () {
    before(function (done) {
      sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
        callback(null, 'http://www.host.com')
      })
      done()
    })

    after(function (done) {
      koop.controllers.agol.model.find.restore()
      done()
    })

    it('should return 400 when the inputs are malformed', function (done) {
      sinon.stub(koop.controllers.agol.model, 'setExpiration', function (key, expiration, callback) {
        callback(new Error('Invalid input'))
      })

      request(koop.server)
        .put('/agol/test/itemid/0/expiration')
        .send({expires_at: 'foo'})
        .expect(400, {error: 'Invalid input'})
        .end(function (err, res) {
          koop.controllers.agol.model.setExpiration.restore()
          should.not.exist(err)
          done()
        })
    })

    it('should return 200 when the inputs are well formed and the resource exists in the cache', function (done) {
      var date = new Date()
      sinon.stub(koop.controllers.agol.model, 'setExpiration', function (key, expiration, callback) {
        callback(null, date)
      })

      request(koop.server)
        .put('/agol/test/itemid/0/expiration')
        .send({expires_at: date.toISOString()})
        .expect(200, {expires_at: date.toISOString()})
        .end(function (err, res) {
          koop.controllers.agol.model.setExpiration.restore()
          should.not.exist(err)
          done()
        })
    })

    it('should return 201 and kick off a request for the remote resource if the resource is not found in the cache', function (done) {
      var date = new Date()
      sinon.stub(koop.controllers.agol.model, 'setExpiration', function (key, expiration, callback) {
        callback(new Error('Resource not found'), date.getTime())
      })

      sinon.stub(koop.controllers.agol.model, 'cacheResource', function (options, callback) {
        callback(null, {})
      })

      request(koop.server)
        .put('/agol/test/itemid/0/expiration')
        .send({expires_at: date.toISOString()})
        .expect(201, {status: 'Processing', expires_at: date.toISOString()})
        .end(function (err, res) {
          koop.controllers.agol.model.setExpiration.restore()
          should.not.exist(err)
          res.should.have.status(201)
          koop.controllers.agol.model.cacheResource.called.should.equal(true)
          koop.controllers.agol.model.cacheResource.restore()
          done()
        })
    })
  })
  describe('dropping item metadata', function () {
    before(function (done) {
      sinon.stub(koop.controllers.agol.model, 'dropResource', function (item, layer, options, callback) {
        callback(null, {})
      })

      sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })
      done()
    })

    after(function (done) {
      koop.controllers.agol.model.dropResource.restore()
      koop.controllers.agol.model.find.restore()
      done()
    })

    it('should call find and dropItem', function (done) {
      request(koop.server)
        .get('/agol/test/itemid/0/drop')
        .end(function (err, res) {
          should.not.exist(err)
          res.should.have.status(200)
          koop.controllers.agol.model.find.called.should.equal(true)
          koop.controllers.agol.model.dropResource.called.should.equal(true)
          done()
        })
    })
  })

  describe('getting an item that is in a failed state', function () {
    beforeEach(function (done) {
      sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
        callback(null, {id: 'test', host: 'http://dummy.host.com'})
      })

      done()
    })

    afterEach(function (done) {
      koop.controllers.agol.model.find.restore()
      done()
    })

    it('should return a 502 if failure was less than 30 minutes ago', function (done) {
      sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (key, callback) {
        callback(null, {
          status: 'Failed',
          retrieved_at: Date.now() - (15 * 60 * 1000),
          error: {
            message: 'Fail whaletastic'
          }
        })
      })

      request(koop.server)
        .get('/agol/test/itemId/3.zip')
        .expect(502)
        .end(function (err, res) {
          koop.controllers.agol.model.cache.getInfo.restore()
          should.not.exist(err)
          done()
        })
    })
  })

  describe('Requesting a download', function () {
    describe('when the format is not generating', function () {
      before(function (done) {
        sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
          callback(null, { id: 'test', host: 'http://dummy.host.com' })
        })

        sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (key, callback) {
          callback(null, {
            status: 'Cached',
            name: 'Export',
            info: {
              fields: []
            }
          })
        })

        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(new Error('ENOENT'))
        })

        sinon.stub(koop.controllers.agol.model.exporter, 'generate', function (options, callback) {
          callback(null, {status: 'Cached', generating: {}})
        })
        done()
      })

      after(function (done) {
        koop.controllers.agol.model.files.stat.restore()
        koop.controllers.agol.model.cache.getInfo.restore()
        koop.controllers.agol.model.find.restore()
        koop.controllers.agol.model.exporter.generate.restore()
        done()
      })

      it('should call agol.exportFile and return 202', function (done) {
        request(koop.server)
          .get('/agol/test/itemid/0.csv')
          .expect(202)
          .end(function (err, res) {
            should.not.exist(err)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(true)
            done()
          })
      })
    })

    describe('when generating is in progress', function () {
      before(function (done) {
        sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
          callback(null, { id: 'test', host: 'http://dummy.host.com' })
        })

        sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (key, callback) {
          callback(null, {
            status: 'Cached',
            name: 'Export',
            info: {
              fields: []
            },
            generating: {
              full: {
                csv: 'progress'
              }
            }
          })
        })

        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(new Error('ENOENT'))
        })

        sinon.stub(koop.controllers.agol.model.exporter, 'generate', function (options, callback) {
          callback(null, {status: 'Cached', generating: {}})
        })
        done()
      })

      after(function (done) {
        koop.controllers.agol.model.files.stat.restore()
        koop.controllers.agol.model.cache.getInfo.restore()
        koop.controllers.agol.model.find.restore()
        koop.controllers.agol.model.exporter.generate.restore()
        done()
      })

      it('should call agol.exportFile and return 202', function (done) {
        request(koop.server)
          .get('/agol/test/itemid/0.csv')
          .expect(202)
          .end(function (err, res) {
            should.not.exist(err)
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(false)
            done()
          })
      })
    })

    describe('when generation has failed', function () {
      before(function (done) {
        sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
          callback(null, { id: 'test', host: 'http://dummy.host.com' })
        })

        sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (key, callback) {
          callback(null, {
            status: 'Cached',
            name: 'Export',
            info: {
              fields: []
            },
            generating: {
              full: {
                csv: 'fail'
              }
            }
          })
        })

        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(new Error('ENOENT'))
        })

        sinon.stub(koop.controllers.agol.model.exporter, 'generate', function (options, callback) {
          callback(null, {status: 'Cached', generating: {}})
        })
        done()
      })

      after(function (done) {
        koop.controllers.agol.model.files.stat.restore()
        koop.controllers.agol.model.cache.getInfo.restore()
        koop.controllers.agol.model.find.restore()
        koop.controllers.agol.model.exporter.generate.restore()
        done()
      })

      it('should not try to enqueue a new job and should respond with a 500', function (done) {
        request(koop.server)
          .get('/agol/test/itemid/0.csv')
          .expect(500)
          .end(function (err, res) {
            should.not.exist(err)
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(false)
            done()
          })
      })
    })

    describe('when the resource has expired', function () {
      var date = Date.now()
      var info = {
        status: 'Expired',
        name: 'Export',
        version: 3,
        retrieved_at: date,
        info: {
          fields: []
        },
        generating: {
          full: {
            kml: 'fail',
            zip: 'progress'
          }
        }
      }
      beforeEach(function (done) {
        sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
          callback(null, { id: 'test', host: 'http://dummy.host.com' })
        })

        sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (key, callback) {
          callback(null, info)
        })

        sinon.stub(koop.controllers.agol.model.exporter.cache, 'getInfo', function (key, callback) {
          callback(null, info)
        })

        sinon.stub(koop.controllers.agol.model.exporter, 'generate', function (options, callback) {
          callback(null, {status: 'Cached', generating: {}})
        })

        sinon.stub(koop.controllers.agol.model, 'updateResource', function (info, options, callback) {
          callback(null)
        })

        sinon.stub(koop.controllers.agol.model.files, 'createReadStream', function (path) {
          var fixture = pathModule.resolve('test/fixtures/csvData.csv')
          return fs.createReadStream(fixture)
        })

        done()
      })

      afterEach(function (done) {
        koop.controllers.agol.model.find.restore()
        koop.controllers.agol.model.cache.getInfo.restore()
        koop.controllers.agol.model.exporter.cache.getInfo.restore()
        koop.controllers.agol.model.exporter.generate.restore()
        koop.controllers.agol.model.updateResource.restore()
        koop.controllers.agol.model.files.createReadStream.restore()
        koop.controllers.agol.model.files.stat.restore()
        done()
      })

      it('should generate export and return a file if it exists but it\'s out of date', function (done) {
        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(null, {
            Metadata: {
              retrieved_at: new Date(1000)
            }
          })
        })

        request(koop.server)
          .get('/agol/test/itemid/0.geojson')
          .expect(200)
          .end(function (err, res) {
            should.not.exist(err)
            var lastMod = new Date(res.headers['last-modified']).getTime()
            lastMod.should.equal(1000)
            should.exist(res.headers['x-expired'])
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.updateResource.called.should.equal(false)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(true)
            koop.controllers.agol.model.files.createReadStream.called.should.equal(true)
            done()
          })
      })

      it('should call generate export and return a file if it exists but it\'s out of date and there is no retrieved_at date', function (done) {
        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(null, {mtime: new Date(1000)})
        })

        request(koop.server)
          .get('/agol/test/itemid/0.geojson')
          .expect(200)
          .end(function (err, res) {
            should.not.exist(err)
            var lastMod = new Date(res.headers['last-modified']).getTime()
            lastMod.should.equal(1000)
            should.exist(res.headers['x-expired'])
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.updateResource.called.should.equal(false)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(true)
            koop.controllers.agol.model.files.createReadStream.called.should.equal(true)
            done()
          })
      })

      it('should call generate export and return a file if the filtered version is out of date and not currently generating', function (done) {
        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(null, {
            Metadata: {
              retrieved_at: new Date(1000)
            }
          })
        })

        request(koop.server)
          .get('/agol/test/itemid/0.geojson?where=trees%20like%20foo')
          .expect(200)
          .end(function (err, res) {
            should.not.exist(err)
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.updateResource.called.should.equal(false)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(true)
            koop.controllers.agol.model.files.createReadStream.called.should.equal(true)
            done()
          })
      })

      it('should call generate export and not return a file if the filtered version is out of date and not currently generating', function (done) {
        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(null, {
            Metadata: {
              retrieved_at: new Date(1000)
            }
          })
        })

        info.status = 'Cached'

        request(koop.server)
          .get('/agol/test/itemid/0.geojson?where=trees%20like%20foo')
          .expect(202)
          .end(function (err, res) {
            info.status = 'Expired'
            should.not.exist(err)
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.updateResource.called.should.equal(false)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(true)
            koop.controllers.agol.model.files.createReadStream.called.should.equal(false)
            done()
          })
      })

      it('should call generate export and return a file if it exists', function (done) {
        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(null, {})
        })

        request(koop.server)
          .get('/agol/test/itemid/0.csv')
          .expect(200)
          .end(function (err, res) {
            should.not.exist(err)
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.updateResource.called.should.equal(false)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(true)
            koop.controllers.agol.model.files.createReadStream.called.should.equal(true)
            done()
          })
      })

      it('should try to generate a file if it does not exist', function (done) {
        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(new Error('ENOENT'))
        })

        request(koop.server)
          .get('/agol/test/itemid/0.csv')
          .expect(202)
          .end(function (err, res) {
            should.not.exist(err)
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.updateResource.called.should.equal(false)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(true)
            koop.controllers.agol.model.files.createReadStream.called.should.equal(false)
            done()
          })
      })

      it('should return a 500 if that particular download has failed', function (done) {
        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(new Error('ENOENT'))
        })

        request(koop.server)
          .get('/agol/test/itemid/0.kml')
          .expect(500)
          .end(function (err, res) {
            should.not.exist(err)
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.updateResource.called.should.equal(false)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(false)
            koop.controllers.agol.model.files.createReadStream.called.should.equal(false)
            done()
          })
      })

      it('should return a 202 if that particular download is in progress', function (done) {
        sinon.stub(koop.controllers.agol.model.files, 'stat', function (path, callback) {
          callback(new Error('ENOENT'))
        })

        request(koop.server)
          .get('/agol/test/itemid/0.zip')
          .expect(202)
          .end(function (err, res) {
            should.not.exist(err)
            koop.controllers.agol.model.files.stat.called.should.equal(true)
            koop.controllers.agol.model.updateResource.called.should.equal(false)
            koop.controllers.agol.model.cache.getInfo.called.should.equal(true)
            koop.controllers.agol.model.exporter.generate.called.should.equal(false)
            koop.controllers.agol.model.files.createReadStream.called.should.equal(false)
            done()
          })
      })
    })
  })

  describe('getting a png tile should return 404 for test', function () {
    before(function (done) {
      koop.controllers.agol.model.tileGet = function () {}

      sinon.stub(koop.controllers.agol.model.cache, 'get', function (item, layer, options, callback) {
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

      sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
        callback(null, { id: 'test', host: 'http://dummy.host.com' })
      })

      sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (key, callback) {
        callback(null, {status: 'Cached'})
      })

      sinon.stub(koop.controllers.agol.model, 'tileGet', function (params, data, callback) {
        callback(null, '/aFakeTile')
      })
      done()
    })

    after(function (done) {
      delete koop.controllers.agol.model.tileGet
      koop.controllers.agol.model.cache.get.restore()
      koop.controllers.agol.model.cache.getInfo.restore()
      koop.controllers.agol.model.find.restore()
      done()
    })

    it('should call Tiles helper and return 200', function (done) {
      request(koop.server)
        .get('/agol/test/itemid/0/tiles/5/5/12.png')
        .expect(404)
        .end(function (err, res) {
          should.not.exist(err)
          koop.controllers.agol.model.find.called.should.equal(true)
          koop.controllers.agol.model.cache.get.called.should.equal(true)
          done()
        })
    })
  })

  describe('when returning status to the client', function () {
    before(function (done) {
      sinon.stub(koop.controllers.agol.model.cache, 'getCount', function (key, options, callback) {
        callback(null, 100)
      })
      done()
    })

    after(function (done) {
      koop.controllers.agol.model.cache.getCount.restore()
      done()
    })

    it('should return 202 when the resource is processing', function (done) {
      sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (options, callback) {
        var info = {
          status: 'Processing',
          retrieved_at: Date.now()
        }
        callback(null, info)
      })

      request(koop.server)
        .get('/agol/arcgis/foo/0.csv')
        .expect(202)
        .end(function (err, res) {
          koop.controllers.agol.model.cache.getInfo.restore()
          should.not.exist(err)
          done()
        })
    })

    it('should return 502 when an error is passed in', function (done) {
      sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (options, callback) {
        callback(new Error('Resource not found'))
      })

      sinon.stub(koop.controllers.agol.model, 'cacheResource', function (options, callback) {
        var error = new Error('Failed to get layer metadata')
        error.url = 'http://www.failure.com'
        error.body = {
          code: 500,
          message: 'Failed to perform query',
          details: []
        }
        callback(error)
      })

      request(koop.server)
        .get('/agol/arcgis/foo/0.csv')
        .expect(502)
        .end(function (err, res) {
          res.body.status.should.equal('Failed')
          should.exist(res.body.error)
          res.body.error.code.should.equal(500)
          res.body.error.response.should.equal('Failed to perform query')
          res.body.error.request.should.equal('http://www.failure.com')
          koop.controllers.agol.model.cache.getInfo.restore()
          koop.controllers.agol.model.cacheResource.restore()
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
      sinon.stub(koop.controllers.agol.model, 'find', function (id, callback) {
        callback(null, { id: 'test', host: 'http://dummy.host.com' })
      })

      sinon.stub(koop.controllers.agol.model, 'cacheResource', function (options, callback) {
        callback(cacheError)
      })

      sinon.stub(koop.controllers.agol.model.cache, 'getInfo', function (id, callback) {
        callback(infoError, { name: 'Test_Download', metadata: 'foobar' })
      })

      sinon.stub(koop.controllers.agol.model.exporter.cache, 'getInfo', function (id, callback) {
        callback(infoError, { name: 'Test_Download', metadata: 'foobar' })
      })

      sinon.stub(koop.controllers.agol.model.exporter, 'generate', function (options, callback) {
        callback(null)
      })

      done()
    })

    afterEach(function (done) {
      koop.controllers.agol.model.find.restore()
      koop.controllers.agol.model.cacheResource.restore()
      koop.controllers.agol.model.cache.getInfo.restore()
      koop.controllers.agol.model.exporter.cache.getInfo.restore()
      koop.controllers.agol.model.exporter.generate.restore()
      done()
    })

    it('should return the correct count of successfully enqueued import jobs', function (done) {
      cacheError = null

      request(koop.server)
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

      request(koop.server)
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

      request(koop.server)
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

      request(koop.server)
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
