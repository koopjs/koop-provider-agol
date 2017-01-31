/* global describe, it, before, after */

var CSVRequest = require('../../models/csv-request.js')
var sinon = require('sinon')
var nock = require('nock')
var Koop = require('koop')
var koop = new Koop()
var cache = koop.cache
var should = require('should')
koop.GeoJSON = { fromCSV: function () {} }

describe('when calling getCSV', function () {
  var csvRequest
  before(function (done) {
    csvRequest = new CSVRequest(cache, {
      store: true,
      url: 'http://www.arcgis.com/csv',
      itemInfo: require('../fixtures/itemInfo.json')
    })
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
      callback(null, {
        type: 'FeatureCollection',
        features: []
      })
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

  it('should gracefully handle an empty csv', function (done) {
    var fixture = nock('http://www.arcgis.com')
    fixture.get('/csv')
      .reply(200, '"id","lat","lon"\n')
    csvRequest.submit(function (err, status, data) {
      should.exist(err)
      done()
    })
  })
})
