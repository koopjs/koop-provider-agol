/* global describe, it, before, after */

var CSVRequest = require('../lib/csv-request.js')
var sinon = require('sinon')
var nock = require('nock')
var cache = require('koop/lib').DataCache()
var should = require('should')
var fs = require('fs')
var koop = {
  GeoJSON: {
    fromCSV: function () {}
  }
}

var csvRequest = new CSVRequest(cache, {
  store: true,
  url: 'http://www.arcgis.com/csv',
  itemInfo: JSON.parse(fs.readFileSync(__dirname + '/fixtures/itemInfo.json'))
})

describe('when calling getCSV', function () {
  before(function (done) {
    sinon.stub(cache, 'get', function (type, id, options, callback) {
      callback('Error', null)
    })
    sinon.stub(cache, 'insert', function (type, id, data, options, callback) {
      callback(null, true)
    })
    sinon.stub(cache, 'insertPartial', function (type, id, data, options, callback) {
      callback(null, true)
    })
    sinon.stub(koop.GeoJSON, 'fromCSV', function (data, callback) {
      callback(null, {})
    })
    done()
  })

  after(function (done) {
    cache.get.restore()
    cache.insert.restore()
    cache.insertPartial.restore()
    koop.GeoJSON.fromCSV.restore()
    done()
  })

  it('should call cache.get and cache.insert, and should return GeoJSON', function (done) {
    var fixture = nock('http://www.arcgis.com')
    fixture.get('/csv')
      .reply(200, '"id","lat","lon"\n"1","40.1","-105.5"')
    csvRequest.submit(function (err, status, data) {
      should.not.exist(err)
      data.features.length.should.equal(1)
      cache.get.called.should.equal(false)
      cache.insert.called.should.equal(true)
      cache.insertPartial.called.should.equal(false)
      done()
    })
  })
})
