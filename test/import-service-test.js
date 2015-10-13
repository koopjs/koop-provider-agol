/* global describe, it, beforeEach, afterEach */
var nock = require('nock')
var fs = require('fs')
var sinon = require('sinon')
var should = require('should')  // eslint-disable-line
var path = require('path')
var ImportService = require('../lib/import-service.js')
var koopLib = require('koop/lib')
var log = new koopLib.Logger({})

var importService
var fakeCache = {
  insertPartial: function () {},
  getInfo: function () {},
  updateInfo: function () {},
  setFail: function () {}
}
var updatedInfo
describe('importing a feature service into the cache', function () {
  beforeEach(function (done) {
    importService = new ImportService({
      item: 'item',
      layer: 0,
      service: 'http://featureserver.com/layer/FeatureServer',
      pages: [{req: 'http://featureserver.com/layer/FeatureServer/0/query?where=1=1'}],
      key: 'agol:item:0',
      log: log,
      cache: fakeCache
    })

    // speed up the backoff so the test runs faster and does not time out
    importService.featureService.options.backoff = 1

    sinon.stub(importService.cache, 'getInfo', function (key, callback) {
      callback(null, {})
    })

    sinon.stub(importService.cache, 'updateInfo', function (key, info, callback) {
      updatedInfo = info
      callback(null)
    })

    sinon.stub(importService.cache, 'setFail', function (key, error, callback) {
      callback(null)
    })

    done()
  })

  afterEach(function (done) {
    importService.cache.getInfo.restore()
    importService.cache.updateInfo.restore()
    importService.cache.setFail.restore()
    done()
  })

  it('should update the info doc with status: Cached when the job is complete', function (done) {
    var fixture = nock('http://featureserver.com')
    fixture.get('/layer/FeatureServer/0/query?where=1=1')
      .reply(200, JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/smallPage.json'))))

    sinon.stub(importService.cache, 'insertPartial', function (item, layer, geojson, callback) {
      callback(null)
    })

    importService.on('done', function () {
      importService.cache.insertPartial.called.should.equal(true)
      importService.cache.setFail.called.should.equal(false)
      importService.cache.getInfo.called.should.equal(true)
      importService.cache.updateInfo.called.should.equal(true)
      importService.cache.updateInfo.calledWith(importService.key)
      updatedInfo.status.should.equal('Cached')
      importService.cache.insertPartial.restore()
      done()
    })

    importService.run()
  })

  it('should call setFail when the job fails while getting features', function (done) {
    var fixture = nock('http://featureserver.com')
    fixture.get('/layer/FeatureServer/0/query?where=1=1')
      .times(4)
      .reply(500, {error: {}})

    importService.on('error', function (error) {
      importService._fail(error, function () {
        importService.cache.setFail.called.should.equal(true)
        done()
      })
    })

    importService.run()
  })

  it('should not call setFail when the job fails during a db insert', function (done) {
    var fixture = nock('http://featureserver.com')
    fixture.get('/layer/FeatureServer/0/query?where=1=1')
      .reply(200, JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/smallPage.json'))))

    sinon.stub(importService.cache, 'insertPartial', function (item, layer, geojson, callback) {
      callback(new Error(''))
    })

    importService.on('error', function (error) {
      importService._fail(error, function () {
        importService.cache.setFail.called.should.equal(false)
        importService.cache.insertPartial.restore()
        done()
      })
    })

    importService.run()
  })
})
