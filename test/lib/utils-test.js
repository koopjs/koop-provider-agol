/* global it, describe */
/* @ flow */
var Utils = require('../../lib/utils.js')
var should = require('should') // eslint-disable-line

describe('Utils', function () {
  describe('creating a cache key', function () {
    var params = {
      item: 'item',
      layer: 0,
      format: 'zip'
    }
    var params2 = {
      item: 'item',
      layer: 1,
      format: 'csv'
    }
    var params3 = {
      item: 'item',
      0: 'FeatureServer/0'
    }
    var params4 = {
      item: 'item',
      0: '1.csv'
    }
    var params5 = {
      item: 'item',
      layer: 0,
      format: 'csv'
    }
    var params6 = {
      item: 'item',
      layer: 0,
      format: 'kml'
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

    var test_query4 = {
      outSR: {
        latestWkid: 2927,
        wkid: 2927
      }
    }

    var expected_key = Utils.createCacheKey(params, reference_query)

    it('should create the same cache key when query params are out of order', function (done) {
      var test_key = Utils.createCacheKey(params, test_query)
      test_key.should.equal(expected_key)
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

    it('should create a difference cache key when there is different outSR', function (done) {
      var key1 = Utils.createCacheKey(params, reference_query)
      var key2 = Utils.createCacheKey(params, test_query4)
      key1.should.not.equal(key2)
      done()
    })

    it('should ignore the outSR parameter when the format requested is not a shapefile', function (done) {
      var key1 = Utils.createCacheKey(params5, test_query4)
      var key2 = Utils.createCacheKey(params6, test_query4)
      key1.should.equal(key2)
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
      var status = Utils.determineExportStatus(req, info)
      status.should.equal('start')
      done()
    })
  })

  describe('creating export options', function () {
    it('should have all the expected properties for a table that is on the lastest version', function (done) {
      var req = {
        params: {
          item: '1ef',
          layer: '1',
          format: 'zip'
        },
        query: {
          where: 'trees like fire',
          geometry: '"geometry"',
          outSR: 'outSR'
        },
        optionKey: 'full'
      }
      var table = {
        name: 'download',
        metadata: 'metadata',
        version: 3,
        info: { fields: [] }
      }
      var eOpts = Utils.createExportOptions(req, table)
      eOpts.table.should.equal('agol:1ef:1')
      eOpts.source.should.equal('files/1ef_1/full/1ef_1.geojson')
      eOpts.output.should.equal('files/1ef_1/full/1ef_1.zip')
      eOpts.key.should.equal('full')
      eOpts.name.should.equal('download')
      eOpts.format.should.equal('zip')
      eOpts.fields.length.should.equal(0)
      eOpts.metadata.should.equal('metadata')
      eOpts.where.should.equal('trees like fire')
      eOpts.outSR.should.equal('outSR')
      eOpts.geometry.should.equal('geometry')
      eOpts.maxRetries.should.equal(3)
      done()
    })

    it('should have all the expected properties for a table that is not on the latest version', function (done) {
      var req = {
        params: {
          item: '1ef',
          layer: '1',
          format: 'zip'
        },
        query: {
        },
        optionKey: 'full'
      }
      var table = {
        name: 'download',
        metadata: 'metadata',
        version: '2.0'
      }
      var eOpts = Utils.createExportOptions(req, table)
      eOpts.table.should.equal('agol:1ef:1')
      eOpts.source.should.equal('files/1ef_1/full/download.geojson')
      eOpts.output.should.equal('files/1ef_1/6f6cace075907b472bfe309f5abfc344/download.zip')
      eOpts.key.should.equal('full')
      eOpts.name.should.equal('download')
      eOpts.format.should.equal('zip')
      eOpts.metadata.should.equal('metadata')
      done()
    })

    it('should create the correct source and output when the layer on a job is 0', function (done) {
      var req = {
        optionKey: 'full',
        query: {},
        params: {}
      }
      var table = {
        name: 'download',
        metadata: 'metadata',
        version: 3
      }
      var job = {
        item: '1ef',
        layer: 0
      }
      var format = 'zip'
      var eOpts = Utils.createExportOptions(req, table, job, format)
      eOpts.source.should.equal('files/1ef_0/full/1ef_0.geojson')
      eOpts.output.should.equal('files/1ef_0/full/1ef_0.zip')
      done()
    })

    it('should parse a geometry string into an envelope', function (done) {
      var req = {
        params: {
          item: '1ef',
          layer: '1',
          format: 'zip'
        },
        query: {
          where: 'date >= date \'2015\'',
          geometry: '-90,-180,90,180'
        },
        optionKey: 'full'
      }
      var table = {
        name: 'download',
        metadata: 'metadata',
        version: 3
      }
      var eOpts = Utils.createExportOptions(req, table)
      eOpts.geometry.xmin.should.equal(-90)
      eOpts.geometry.ymin.should.equal(-180)
      eOpts.geometry.xmax.should.equal(90)
      eOpts.geometry.ymax.should.equal(180)
      done()
    })

    it('should coerce dates in the where clause to ISO strings', function (done) {
      var date = new Date('2015')
      var req = {
        params: {
          item: '1ef',
          layer: '1',
          format: 'zip'
        },
        query: {
          where: 'date >= date \'2015\''
        },
        optionKey: 'full'
      }
      var table = {
        name: 'download',
        metadata: 'metadata',
        version: 3
      }
      var eOpts = Utils.createExportOptions(req, table)
      eOpts.where.should.equal(`date >= '${date.toISOString()}'`)
      done()
    })

    it('should coerce multiple dates in the where clause to ISO strings', function (done) {
      var date = new Date('2015')
      var req = {
        params: {
          item: '1ef',
          layer: '1',
          format: 'zip'
        },
        query: {
          where: 'date >= date \'2015\' AND date2 < date \'2015\''
        },
        optionKey: 'full'
      }
      var table = {
        name: 'download',
        metadata: 'metadata',
        version: 3
      }
      var eOpts = Utils.createExportOptions(req, table)
      eOpts.where.should.equal(`date >= '${date.toISOString()}' AND date2 < '${date.toISOString()}'`)
      done()
    })

    it('should coerce multiple dates in the where clause to ISO strings', function (done) {
      var date1 = new Date('2012-03-14 00:00:00').toISOString()
      var date2 = new Date('2012-03-17 23:59:59').toISOString()
      var req = {
        params: {
          item: '1ef',
          layer: '1',
          format: 'zip'
        },
        query: {
          where: `Date1 >= date '2012-03-14 00:00:00' AND Date1 <= date '2012-03-17 23:59:59' AND foo like crime`
        },
        optionKey: 'full'
      }
      var table = {
        name: 'download',
        metadata: 'metadata',
        version: 3
      }
      var eOpts = Utils.createExportOptions(req, table)
      eOpts.where.should.equal(`Date1 >= '${date1}' AND Date1 <= '${date2}' AND foo like crime`)
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

  describe('setting defaults for a feature service request', function () {
    it('should coerce a web mercator wkt into a wkid object', function (done) {
      var params = {
        layer: 0
      }
      var query = {
        geometry: {
          spatialReference: {
            wkt: 'PROJCS["WGS_1984_Web_Mercator",GEOGCS["GCS_WGS_1984_Major_Auxiliary_Sphere",DATUM["D_WGS_1984_Major_Auxiliary_Sphere",SPHEROID["WGS_1984_Major_Auxiliary_Sphere",6378137.0,0.0]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",${Central_Meridian}],PARAMETER["Standard_Parallel_1",0.0],UNIT["Meter",1.0]]'
          }
        }
      }
      var fsOpts = Utils.setServiceDefaults(params, query)
      fsOpts.geometry.spatialReference.latestWkid.should.equal(3857)
      done()
    })
  })
})
