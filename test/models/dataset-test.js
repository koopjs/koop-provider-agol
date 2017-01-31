/* global before, after, it, describe */ //eslint-disable-line
var should = require('should')
var sinon = require('sinon')
var infoDoc = require('../fixtures/infoDoc.json')

var Koop = require('koop')
var koop = new Koop()
koop.cache.db.query = function () {}

var Agol = require('../../models/agol.js')
var agol = new Agol(koop)

describe('The dataset model', function () {
  describe('findRecord', function () {
    before(function (done) {
      sinon.stub(agol.dataset.cache, 'getInfo', function (key, callback) {
        callback(null, infoDoc)
      })
      done()
    })

    after(function (done) {
      agol.dataset.cache.getInfo.restore()
      done()
    })

    it('should compute the datasets:downloads array correctly', function (done) {
      agol.dataset.findRecord({dataset: '1ef_2'}, function (err, dataset) {
        should.not.exist(err)
        should.not.exist(dataset.generating)
        should.not.exist(dataset.generated)
        const csv = dataset.downloads[0]
        const kml = dataset.downloads[1]
        const zip = dataset.downloads[2]
        csv.type.should.equal('csv')
        should.not.exist(csv.generatingStatus)
        csv.lastGenerated.toISOString().should.equal(new Date(1474580198027).toISOString())
        kml.type.should.equal('kml')
        kml.generatingStatus.should.equal('queued')
        kml.lastGenerated.toISOString().should.equal(new Date(1474580198027).toISOString())
        zip.type.should.equal('zip')
        zip.lastGenerated.toISOString().should.equal(new Date(1474580198027).toISOString())
        should.not.exist(zip.generatingStatus)
        done()
      })
    })

    it('should compute the datasets:id correctly', function (done) {
      agol.dataset.findRecord({dataset: '1ef_2'}, function (err, dataset) {
        should.not.exist(err)
        dataset.id = '1ef_2'
        done()
      })
    })

    it('should retrieved_at and expires_at to retrieved and expired', function (done) {
      agol.dataset.findRecord({dataset: '1ef_2'}, function (err, dataset) {
        should.not.exist(err)
        dataset.retrieved.toISOString().should.equal(new Date(1463059747870).toISOString())
        dataset.expires.toISOString().should.equal(new Date(1463146145249).toISOString())
        done()
      })
    })

    it('should have the expected rewritten keys', function (done) {
      agol.dataset.findRecord({dataset: '1ef_2'}, function (err, dataset) {
        should.not.exist(err)
        should.exist(dataset.retrieved)
        should.exist(dataset.expires)
        should.exist(dataset.importStatus)
        done()
      })
    })
  }) // end findRecord

  describe('findRecords', function () {
    before(function (done) {
      sinon.stub(agol.dataset.cache.db, 'query', function (key, callback) {
        var rows = [
          {
            id: 'agol:foo:bar',
            info: infoDoc
          }
        ]
        callback(null, {rows: rows})
      })
      done()
    })

    after(function (done) {
      agol.dataset.cache.db.query.restore()
      done()
    })

    it('should serialize records correctly', function (done) {
      agol.dataset.findRecords({}, function (err, datasets) {
        should.not.exist(err)
        datasets[0].id.should.equal('foo_bar')
        should.exist(datasets[0].downloads)
        done()
      })
    })
  })// end findRecords
}) // end dataset model
