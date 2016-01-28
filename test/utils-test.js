/* global it, describe */
/* @ flow */
var Utils = require('../lib/utils.js')
var should = require('should') // eslint-disable-line

describe('Utils', function () {
  describe('creating a cache key', function () {
    var params = {
      item: 'item',
      layer: 0
    }
    var params2 = {
      item: 'item',
      layer: 1
    }
    var params3 = {
      item: 'item',
      0: 'FeatureServer/0'
    }
    var params4 = {
      item: 'item',
      0: '1.csv'
    }
    var reference_query = {
      foo: 1,
      bar: 1
    }
    var test_query = {
      bar: 1,
      foo: 1
    }
    var test_query2 = {
      foo: 1,
      bar: 2,
      where: 'where clause1'
    }
    var test_query3 = {
      foo: 1,
      bar: 2,
      where: 'where clause2'
    }
    var expected_key = Utils.createCacheKey(params, reference_query)

    it('should create the same cache key when query params are out of order', function (done) {
      var test_key = Utils.createCacheKey(params, test_query)
      test_key.should.equal(expected_key)
      done()
    })

    it('should create different cache keys for different layers', function (done) {
      var key1 = Utils.createCacheKey(params, reference_query)
      var key2 = Utils.createCacheKey(params2, reference_query)
      key1.should.not.equal(key2)
      done()
    })

    it('should not include the featureserver method in cache keys', function (done) {
      var key1 = Utils.createCacheKey(params, reference_query)
      var key2 = Utils.createCacheKey(params3, reference_query)
      key1.should.equal(key2)
      done()
    })

    it('should create the same cache key when formats are included in the request', function (done) {
      var key1 = Utils.createCacheKey(params2, reference_query)
      var key2 = Utils.createCacheKey(params4, reference_query)
      key1.should.equal(key2)
      done()
    })

    it('should create a difference cache key when there is different where clauses', function (done) {
      var key1 = Utils.createCacheKey(params, test_query2)
      var key2 = Utils.createCacheKey(params, test_query3)
      key1.should.not.equal(key2)
      done()
    })

    it('should create the same cache key on requests with omitted params', function (done) {
      test_query.url_only = true
      test_query.format = 'zip'
      test_query.callback = {}
      var test_key = Utils.createCacheKey(params, test_query)
      test_key.should.equal(expected_key)
      delete test_query.url_only
      delete test_query.callback
      delete test_query.format
      done()
    })
  })

  describe('creating a name for a resource', function () {
    it('should use the item title when the service has only one layer', function (done) {
      var item = {
        title: 'Item_title',
        url: 'https://services1.arcgis.com/foo/ArcGIS/rest/services/bar/FeatureServer'
      }
      var service = {
        layers: [{
          id: 0,
          name: 'Layer_title'
        }],
        tables: []
      }
      var layerId = 0

      Utils.createName(item, service, layerId).should.equal('Item_title')
      done()
    })

    it('should use the layer name when a service has many layers and has no zero index', function (done) {
      var item = {
        title: 'Item_title',
        url: 'https://services1.arcgis.com/foo/ArcGIS/rest/services/bar/FeatureServer'
      }
      var service = {
        layers: [
          {
            id: 1,
            name: 'Layer_title1'
          },
          {
            id: 2,
            name: 'Layer_title2'
          }
        ],
        tables: []
      }
      var layerId = 1

      Utils.createName(item, service, layerId).should.equal('Layer_title1')
      done()
    })

    it('should use the layer name when the item has many layers', function (done) {
      var item = {
        title: 'Basic Emergency Services',
        url: 'https://services1.arcgis.com/foo/ArcGIS/rest/services/bar/MapServer'
      }
      var service = {
        layers: [
          {
            id: 0,
            name: 'Assisted Living Facilities'
          },
          {
            id: 1,
            name: 'Basic Care Facilities'
          },
          {
            id: 2,
            name: 'Hospitals'
          }
        ],
        tables: []
      }
      Utils.createName(item, service, '0').should.equal('Assisted_Living_Facilities')
      done()
    })

    it('should use the table name for a table when the item has many layers', function (done) {
      var item = {
        title: 'Basic Emergency Services',
        url: 'https://services1.arcgis.com/foo/ArcGIS/rest/services/bar/MapServer'
      }
      var service = {
        layers: [
          {
            id: 0,
            name: 'Assisted Living Facilities'
          },
          {
            id: 1,
            name: 'Basic Care Facilities'
          },
          {
            id: 2,
            name: 'Hospitals'
          }
        ],
        tables: [
          {
            id: 6,
            name: 'Table'
          }
        ]
      }
      Utils.createName(item, service, 6).should.equal('Table')
      done()
    })

    it('should use the item title when only a single layer is registered', function (done) {
      var item = {
        title: 'Item_title',
        url: 'https://services1.arcgis.com/foo/ArcGIS/rest/services/bar/FeatureServer/1'
      }
      var service = {
        layers: [
          {
            id: 0,
            name: 'Layer_title0'
          },
          {
            id: 1,
            name: 'Layer_title1'
          }
        ],
        tables: []
      }
      var layerId = 1

      Utils.createName(item, service, layerId).should.equal('Item_title')
      done()
    })

    it('should remove characters that will trip up the filesystem', function (done) {
      var item = {
        title: 'Item title/,&|()<>',
        url: 'https://services1.arcgis.com/foo/ArcGIS/rest/services/bar/FeatureServer'
      }
      var service = {
        layers: [{
          id: 0,
          name: 'Layer_title'
        }],
        tables: []
      }
      var layerId = 0

      Utils.createName(item, service, layerId).should.equal('Item_title')
      done()
    })

    it('should not remove foreign characters', function (done) {
      var item = {
        title: '汉语漢語日本語עבריםñéèę',
        url: 'https://services1.arcgis.com/foo/ArcGIS/rest/services/bar/FeatureServer'
      }
      var service = {
        layers: [{
          id: 0,
          name: 'Layer_title'
        }],
        tables: []
      }
      var layerId = 0
      Utils.createName(item, service, layerId).should.equal('汉语漢語日本語עבריםñéèę')
      done()
    })
  })

  describe('determining file status', function () {
    it('should return true if the status is start', function (done) {
      var req = {
        params: {
          format: 'zip'
        },
        optionKey: 'foo'
      }
      var info = {
        generating: {
          foo: {
            zip: 'start'
          }
        }
      }
      var status = Utils.determineStatus(req, info)
      status.should.equal('start')
      done()
    })
  })

  describe('generating a failure message', function () {
    it('should generate a message with no error body passed in', function (done) {
      var error = new Error()
      should.exist(Utils.failureMsg(error))
      done()
    })

    it('should generate a message with nothing passed in', function (done) {
      should.exist(Utils.failureMsg())
      done()
    })

    it('should generate a message with nothing passed in', function (done) {
      should.exist(Utils.failureMsg({}))
      done()
    })
  })
})
