/* global describe, it, before, after, beforeEach, afterEach*/

var should = require('should')
var Cache = require('../../models/cache.js')
var CSVQueue = require('../../models/csv-queue')
var FeatureQueue = require('../../models/feature-queue')
var Utils = require('../../lib/utils')
var sinon = require('sinon')
var nock = require('nock')
var fs = require('fs')
var path = require('path')
var LocalFs = require('koop-localfs')

var koopLib = require('koop/lib')
var koopCache = new koopLib.DataCache()
var koopFiles = new LocalFs({rootDir: path.join(__dirname, 'data')})

koopCache.db = koopLib.LocalDB
koopCache.db = koopLib.LocalDB
var Logger = require('koop-logger')
var log = new Logger({})

var csvQueue = new CSVQueue({
  cache: koopCache,
  log: log,
  files: koopFiles
})

var qOpts = {
  connection: null,
  log: log,
  cache: new Cache({cache: koopCache, log: log}),
  agol_path: Utils.agol_path,
  files: koopFiles
}

var featureQueue = FeatureQueue.create(qOpts)

var cache = new Cache({
  cache: koopCache,
  log: log,
  featureQueue: featureQueue,
  csvQueue: csvQueue,
  files: koopFiles,
  exporter: {},
  indexFields: false
})

describe('caching feature services', function () {
  var serviceFixture = require('../fixtures/serviceInfo.json')
  var layerFixture = require('../fixtures/layerInfo.json')
  var pageFixture = require('../fixtures/page.json')
  var countFixture = require('../fixtures/featureCount.json')
  var options = {
    itemInfo: {
      title: 'Title',
      url: 'https://services3.arcgis.com/FeatureServer/0'
    },
    item: 'item',
    layer: 0,
    expiration: new Date('2015')
  }

  var fixture = nock('https://services3.arcgis.com')
  fixture.get('/FeatureServer?f=json')
    .reply(200, serviceFixture)
  fixture.get('/FeatureServer/0?f=json')
    .reply(200, layerFixture)
  fixture.get('/FeatureServer/0/query?where=1=1&returnGeometry=true&outFields=*&outSR=4326&f=json')
    .reply(200, pageFixture)
  fixture.get('/FeatureServer/0/query?where=1=1&returnCountOnly=true&f=json')
    .reply(200, countFixture)

  nock('http://koop.dev')
  .post('/agol/test/bulk/export')
  .reply(200)

  before(function (done) {
    cache.insertFeatureService(options, function (err, info) {
      should.not.exist(err)
      info.status.should.equal('Processing')
    })
    setTimeout(function () {
      done()
    }, 100)
  })

  it('should insert all the rows into the db', function (done) {
    cache.get('item', 0, {}, function (err, data) {
      should.not.exist(err)
      data[0].features.length.should.equal(98)
      done()
    })
  })

  it('the table should have the correct info elements', function (done) {
    cache.getInfo('agol:item:0', function (err, info) {
      should.not.exist(err)
      info.type.should.equal('Feature Service')
      info.status.should.equal('Cached')
      info.version.should.equal(3)
      info._indexFields.should.equal(false)
      info.url.should.equal('https://services3.arcgis.com/FeatureServer/0')
      done()
    })
  })
})

describe('updating feature services', function () {
  var options = {
    item: 'foo',
    layer: 1,
    id: 'arcgis'
  }
  beforeEach(function (done) {
    sinon.stub(featureQueue, 'enqueue', function (queue, options) {
      return
    })

    sinon.stub(koopCache, 'updateInfo', function (key, info, callback) {
      callback(null)
    })

    done()
  })

  afterEach(function (done) {
    featureQueue.enqueue.restore()
    koopCache.updateInfo.restore()
    koopCache.getInfo.restore()
    done()
  })

  it('should enqueue a job if there is no information about the last import', function (done) {
    sinon.stub(koopCache, 'getInfo', function (key, callback) {
      callback(null, {
        itemTitle: 'foo',
        url: 'http://foo.com'
      })
    })

    cache.updateFeatureService(options, function (err, info) {
      should.not.exist(err)
      featureQueue.enqueue.called.should.equal(true)
      should.exist(info.importEnqueued)
      done()
    })
  })

  it('should enqueue a job if the last import was more than 12 hours ago', function (done) {
    sinon.stub(koopCache, 'getInfo', function (key, callback) {
      callback(null, {
        itemTitle: 'foo',
        url: 'http://foo.com',
        importEnqueued: Date.now() - (13 * 60 * 60 * 1000)
      })
    })

    cache.updateFeatureService(options, function (err, info) {
      should.not.exist(err)
      featureQueue.enqueue.called.should.equal(true)
      should.exist(info.importEnqueued)
      var timeElapsed = Date.now() - info.importEnqueued
      timeElapsed.should.be.below(1000)
      done()
    })
  })

  it('should not enqueue a job if the last import was less than 12 hours ago', function (done) {
    var lastImport = Date.now() + (13 * 60 * 60 * 1000)
    sinon.stub(koopCache, 'getInfo', function (key, callback) {
      callback(null, {
        itemTitle: 'foo',
        url: 'http://foo.com',
        importEnqueued: lastImport
      })
    })

    cache.updateFeatureService(options, function (err, info) {
      should.not.exist(err)
      featureQueue.enqueue.called.should.equal(false)
      should.exist(info.importEnqueued)
      info.importEnqueued.should.equal(lastImport)
      done()
    })
  })
})

describe('caching csvs', function () {
  var options = {
    itemInfo: require('../fixtures/csvItem.json'),
    item: 'itemCSV',
    layer: 0,
    expiration: new Date('2015').getTime(),
    host: 'http://www.arcgis.com',
    hostId: 'arcgis'
  }
  var csvData = fs.readFileSync(path.resolve('test/fixtures/csvData.csv'))
  var fixture = nock('http://www.arcgis.com')
  fixture.get('/sharing/rest/content/items/itemCSV/data')
    .reply(200, csvData)

  it('should return with data immediately', function (done) {
    cache.csv(options, function (err, status, geojson) {
      should.not.exist(err)
      geojson.features.length.should.equal(5000)
      done()
    })
  })

  it('should have inserted the data into the cache', function (done) {
    cache.csv(options, function (err, status, geojson) {
      should.not.exist(err)
      geojson.features.length.should.equal(5000)
      done()
    })
  })

  it('should have set info in the cache', function (done) {
    cache.getInfo('agol:itemCSV:0', function (err, info) {
      should.not.exist(err)
      info.type.should.equal('CSV')
      info._indexFields.should.equal(false)
      info.version.should.equal(3)
      done()
    })
  })

  it('should not pass errors through', function (done) {
    sinon.stub(cache, 'get', function (item, layer, options, callback) {
      callback(new Error('Syntax error'))
    })

    cache.csv(options, function (err, status, geojson) {
      should.exist(err)
      err.message.should.equal('Syntax error')
      cache.get.restore()
      done()
    })
  })
})

describe('checking expiration', function () {
  describe('for csvs', function () {
    var options = {
      host: 'http://portal.com',
      item: '1ef'
    }
    it('should call back with expired when a csv is expired', function (done) {
      var info = {
        retrieved_at: 1434991535000 - 1,
        url: 'foo',
        type: 'CSV',
        version: 3
      }

      nock('http://portal.com')
      .get('/sharing/rest/content/items/1ef?f=json')
      .reply(200, require('../fixtures/csvItem.json'))

      cache.checkExpiration(info, options, function (err, expired, info) {
        should.not.exist(err)
        expired.should.equal(true)
        should.exist(info)
        done()
      })
    })

    it('should call back with not expired when a csv is not expired', function (done) {
      var info = {
        retrieved_at: 1434991535000 + 1,
        url: 'foo',
        type: 'CSV',
        version: 3
      }

      nock('http://portal.com')
      .get('/sharing/rest/content/items/1ef?f=json')
      .reply(200, require('../fixtures/csvItem.json'))

      cache.checkExpiration(info, options, function (err, expired, info) {
        should.not.exist(err)
        expired.should.equal(false)
        should.exist(info)
        done()
      })
    })
  })

  it('should call back with expired when a non-hosted feature service was retrieved more than 24 hours ago', function (done) {
    var info = {
      url: 'http://expired.com/FeatureServer/0',
      expires_at: Date.now() - (24 * 60 * 60 * 1000 + 100),
      version: 3
    }

    cache.checkExpiration(info, 0, function (err, expired, info) {
      should.not.exist(err)
      expired.should.equal(true)
      should.exist(info)
      done()
    })
  })

  it('should call back with not expired when a non-hosted feature service was less than 24 hours ago', function (done) {
    var info = {
      url: 'http://expired.com/FeatureServer/0',
      expires_at: Date.now() + 100,
      version: 3
    }

    cache.checkExpiration(info, 0, function (err, expired, info) {
      should.not.exist(err)
      expired.should.equal(false)
      should.exist(info)
      done()
    })
  })

  it('should call back with expired when a hosted feature service is expired', function (done) {
    var info = {
      url: 'http://expired.com/FeatureServer/0',
      lastEditDate: Date.now() - 100,
      version: 3
    }

    var fixture = nock('http://expired.com')
    fixture.get('/FeatureServer/0?f=json')
      .reply(200, JSON.stringify({editingInfo: {lastEditDate: Date.now()}}))

    cache.checkExpiration(info, 0, function (err, expired, info) {
      should.not.exist(err)
      expired.should.equal(true)
      should.exist(info)
      done()
    })
  })

  it('should call back with expired when editing info is added for the first time', function (done) {
    var info = {
      url: 'https://services2.arcgis.com/FeatureServer/0',
      lastEditDate: undefined,
      version: 3,
      foo: 'bar'
    }

    var fixture = nock('https://services2.arcgis.com')
    fixture.get('/FeatureServer/0?f=json')
      .reply(200, JSON.stringify({editingInfo: {lastEditDate: Date.now()}}))

    cache.checkExpiration(info, 0, function (err, expired, newInfo) {
      should.not.exist(err)
      expired.should.equal(true)
      should.exist(newInfo)
      done()
    })
  })

  it('should call back with not expired when a hosted feature service is not expired', function (done) {
    var info = {
      url: 'http://expired3.com/FeatureServer/0',
      lastEditDate: new Date('2015').getTime(),
      version: 3
    }

    var fixture = nock('http://expired3.com')
    fixture.get('/FeatureServer/0?f=json')
      .reply(200, JSON.stringify({editingInfo: {lastEditDate: new Date('2015').getTime()}}))

    cache.checkExpiration(info, 0, function (err, expired, info) {
      should.not.exist(err)
      expired.should.equal(false)
      should.exist(info)
      done()
    })
  })
})

describe('when setting a dataset as failed', function () {
  before(function (done) {
    sinon.stub(cache._cache, 'getInfo', function (key, callback) {
      callback(null, {})
    })

    sinon.stub(cache._cache, 'updateInfo', function (key, info, callback) {
      callback(info)
    })
    done()
  })

  after(function (done) {
    cache._cache.getInfo.restore()
    cache._cache.updateInfo.restore()
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

    cache.setFail(key, error, function (info) {
      info.status.should.equal('Failed')
      info.error.should.exist
      info.error.timestamp.should.equal('time')
      info.error.code.should.equal(999)
      info.error.request.should.equal('http://www.error.com')
      info.error.response.should.equal('Failed to perform query operation')
      info.error.message.should.equal('Failed while paging data')
      done()
    })
  })
})
