/* global describe, it*/
var fs = require('fs')
var nock = require('nock')
var Portal = require('../lib/portal.js')
var Logger = require('koop-logger')
var log = new Logger({})
var should = require('should')

var portal = new Portal({log: log})
describe('when getting an item with metadata', function () {
  var itemInfo = fs.readFileSync(__dirname + '/fixtures/itemWMeta.json')
  var metadata = fs.readFileSync(__dirname + '/fixtures/metadata.xml')

  var fixture = nock('http://www.arcgis.com/')
  fixture.get('/sharing/rest/content/items/97743c604c1d43d088043e25683aca5c?f=json')
    .reply(200, itemInfo)
  fixture.get('/sharing/rest/content/items/97743c604c1d43d088043e25683aca5c/info/metadata/metadata.xml?format=default')
    .reply(200, metadata)

  it('should get metadata if it exists', function (done) {
    portal.getItem('http://www.arcgis.com', '97743c604c1d43d088043e25683aca5c', function (err, json) {
      should.not.exist(err)
      should.exist(json.metadata)
      done()
    })
  })
})
