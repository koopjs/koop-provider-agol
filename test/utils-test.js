/* global it, describe */
var Utils = require('../models/utils.js')

describe('Utils', function () {
  describe('when creating a cache key', function () {
    var params = {
      item: 'item',
      layer: 0
    }
    var reference_query = {
      foo: 1,
      bar: 1
    }
    var test_query = {
      bar: 1,
      foo: 1
    }
    var expected_key = Utils.createCacheKey(params, reference_query)

    it('should create the same cache key when query params are out of order', function (done) {
      var test_key = Utils.createCacheKey(params, test_query)
      test_key.should.equal(expected_key)
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
