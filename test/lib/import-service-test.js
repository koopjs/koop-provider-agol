/* global describe, it, beforeEach, afterEach */
var nock = require('nock')
var sinon = require('sinon')
var should = require('should')  // eslint-disable-line
var path = require('path')
var ImportService = require('../../lib/import-service.js')
var Logger = require('koop-logger')
var log = new Logger({})
var LocalFs = require('koop-localfs')

var importService
var fakeCache = {
  insertPartial: function () {},
  getInfo: function () {},
  updateInfo: function () {},
  setFail: function () {}
}
describe('importing a feature service into the cache', function () {
  beforeEach(function (done) {
    importService = new ImportService({
      item: 'item',
      layer: 0,
      server: 'https://services3.arcgis.com/layer/FeatureServer',
      pages: [{req: 'https://services3.arcgis.com/layer/FeatureServer/0/query?where=1=1'}],
      key: 'agol:item:0',
      log: log,
      cache: fakeCache,
      itemTitle: 'foobar',
      files: new LocalFs({rootDir: path.join(__dirname, 'data')})
    })

    // speed up the backoff so the test runs faster and does not time out
    importService.featureService.options.backoff = 1

    sinon.stub(importService.cache, 'getInfo', function (key, callback) {
      callback(null, {
        itemTitle: 'foobar',
        url: 'https://services3.arcgis.com/layer/FeatureServer/0'
      })
    })

    sinon.stub(importService.cache, 'updateInfo', function (key, info, callback) {
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
    var fixture = nock('https://services3.arcgis.com')
    fixture.get('/layer/FeatureServer/0/query?where=1=1&returnGeometry=true&outFields=*&outSR=4326&f=json')
      .reply(200, require('../fixtures/smallPage.json'))

    fixture.get('/layer/FeatureServer/0/query?where=1=1&returnCountOnly=true&f=json')
      .reply(200, require('../fixtures/featureCount.json'))

    fixture.get('/layer/FeatureServer/0?f=json')
      .reply(200, require('../fixtures/layerInfo.json'))

    fixture.get('/layer/FeatureServer?f=json')
      .reply(200, require('../fixtures/serviceInfo.json'))

    sinon.stub(importService.cache, 'insertPartial', function (item, layer, geojson, callback) {
      callback(null)
    })

    importService.on('done', function (result) {
      var updatedInfo = result.info
      updatedInfo.status.should.equal('Cached')
      updatedInfo.sha1.should.equal('c538d5eeb6f8365e6300e3d42700253a3fe9d9bd')
      result.updated.should.equal(true)
      importService.cache.insertPartial.restore()
      done()
    })

    importService.run()
  })

  it('should call setFail when the job fails while getting features', function (done) {
    var fixture = nock('https://services3.arcgis.com')
    fixture.get('/layer/FeatureServer/0/query?where=1=1&returnCountOnly=true&f=json')
      .reply(200, require('../fixtures/featureCount.json'))

    fixture.get('/layer/FeatureServer/0?f=json')
      .reply(200, require('../fixtures/layerInfo.json'))

    fixture.get('/layer/FeatureServer/0/query?where=1=1')
      .times(4)
      .reply(500, {error: {}})

    importService.on('fail', function (error) {
      importService._fail(error)
      importService.cache.setFail.called.should.equal(true)
      done()
    })

    importService.run()
  })

  it('should call setFail when the job fails because there are no features', function (done) {
    var fixture = nock('https://services3.arcgis.com')
    fixture.get('/layer/FeatureServer/0/query?where=1=1&returnCountOnly=true&f=json')
      .reply(200, require('../fixtures/featureCount.json'))

    fixture.get('/layer/FeatureServer/0?f=json')
      .reply(200, require('../fixtures/layerInfo.json'))

    fixture.get('/layer/FeatureServer/0/query?where=1=1')
      .reply(200, require('../fixtures/emptyPage.json'))

    importService.on('fail', function (error) {
      importService._fail(error)
      importService.cache.setFail.called.should.equal(true)
      done()
    })

    importService.run()
  })

  it('should not call setFail when the job fails during a db insert', function (done) {
    var fixture = nock('https://services3.arcgis.com')

    fixture.get('/layer/FeatureServer?f=json')
      .reply(200, require('../fixtures/serviceInfo.json'))

    fixture.get('/layer/FeatureServer/0/query?where=1=1&returnCountOnly=true&f=json')
      .reply(200, require('../fixtures/featureCount.json'))

    fixture.get('/layer/FeatureServer/0?f=json')
      .reply(200, require('../fixtures/layerInfo.json'))

    fixture.get('/layer/FeatureServer/0/query?where=1=1&returnGeometry=true&outFields=*&outSR=4326&f=json')
      .reply(200, require('../fixtures/smallPage.json'))

    sinon.stub(importService.cache, 'insertPartial', function (item, layer, geojson, callback) {
      callback(new Error(''))
    })

    importService.on('error', function (error) {
      importService._fail(error)
      importService.cache.setFail.called.should.equal(false)
      importService.cache.insertPartial.restore()
      done()
    })

    importService.run()
  })
})
