/* global describe, it, before, after*/

var should = require('should')
var Cache = require('../lib/cache.js')
var CSVQueue = require('../lib/csv-queue')
var sinon = require('sinon')
var nock = require('nock')
var fs = require('fs')
var path = require('path')

var koopLib = require('koop/lib')
var koopCache = new koopLib.DataCache()
var koopFiles = new koopLib.Files({
  config: {
    data_dir: './test/data'
  }
})
koopCache.db = koopLib.LocalDB
koopCache.db = koopLib.LocalDB
var log = new koopLib.Logger({})

var csvQueue = new CSVQueue({
  cache: koopCache,
  log: log,
  files: koopFiles
})

var cache = new Cache({
  cache: koopCache,
  log: log,
  featureQueue: null,
  csvQueue: csvQueue,
  files: {},
  exporter: {},
  indexFields: false
})

describe('caching feature services', function () {
  var serviceFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/serviceInfo.json')))
  var layerFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/layerInfo.json')))
  var pageFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/page.json')))
  var countFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/featureCount.json')))
  var options = {
    itemInfo: {
      title: 'Title',
      url: 'http://www.featureservice.com/FeatureServer/0'
    },
    item: 'item',
    layer: 0,
    expiration: new Date('2015')
  }

  var fixture = nock('http://www.featureservice.com')
  fixture.get('/FeatureServer?f=json')
    .reply(200, serviceFixture)
  fixture.get('/FeatureServer/0?f=json')
    .times(2)
    .reply(200, layerFixture)
  fixture.get('/FeatureServer/0/query?outSR=4326&f=json&outFields=*&where=1=1&resultOffset=0&resultRecordCount=1000&geometry=&returnGeometry=true&geometryPrecision=')
    .reply(200, pageFixture)
  fixture.get('/FeatureServer/0/query?where=1=1&returnCountOnly=true&f=json')
    .reply(200, countFixture)

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
      info.version.should.equal('2.0')
      info._indexFields.should.equal(false)
      info.url.should.equal('http://www.featureservice.com/FeatureServer/0')
      done()
    })
  })
})

describe('caching csvs', function () {
  var options = {
    itemInfo: JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/csvItem.json'))),
    item: 'itemCSV',
    layer: 0,
    expiration: new Date('2015').getTime(),
    host: 'http://www.arcgis.com',
    hostId: 'arcgis'
  }

  var csvData = fs.readFileSync(path.join(__dirname, '/fixtures/csvData.csv'))
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
      info.version.should.equal('2.0')
      done()
    })
  })
})

describe('checking expiration', function () {
  it('should call back with expired when a csv is expired', function (done) {
    var info = {
      modified_at: Date.now(),
      retrieved_at: Date.now() - 100,
      url: 'foo',
      type: 'CSV'
    }

    cache.checkExpiration(info, 0, function (err, expired, info) {
      should.not.exist(err)
      expired.should.equal(true)
      should.exist(info)
      done()
    })
  })

  it('should call back with not expired when a csv is not expired', function (done) {
    var info = {
      modified_at: Date.now(),
      retrieved_at: Date.now() + 100,
      url: 'foo',
      type: 'CSV'
    }

    cache.checkExpiration(info, 0, function (err, expired, info) {
      should.not.exist(err)
      expired.should.equal(false)
      should.exist(info)
      done()
    })
  })

  it('should call back with expired when a non-hosted feature service was retrieved more than 24 hours ago', function (done) {
    var info = {
      url: 'http://expired.com/FeatureServer/0',
      expires_at: Date.now() - (24 * 60 * 60 * 1000 + 100)
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
      expires_at: Date.now() + 100
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
      lastEditDate: Date.now() - 100
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

  it('should call back with not expired when a hosted feature service is not expired', function (done) {
    var info = {
      url: 'http://expired.com/FeatureServer/0',
      last_edit_date: new Date('2015').getTime()
    }

    var fixture = nock('http://expired.com')
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
