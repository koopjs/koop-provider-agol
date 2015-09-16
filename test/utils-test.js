/* global it, describe */
var Utils = require('../lib/utils.js')

describe('Utils', function () {
  describe('when creating a cache key', function () {
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
})
