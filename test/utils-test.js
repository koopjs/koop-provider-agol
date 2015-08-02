/* global it, describe */
var Utils = require('../models/utils.js')

describe('Utils', function () {
  describe('when creating a cache key', function () {
    var params = {
      item: 'item',
      layer: 0
    }
    var query1 = {
      foo: 1,
      bar: 1
    }
    var query2 = {
      bar: 1,
      foo: 1
    }
    var key1 = Utils.createCacheKey(params, query1)
    it('should create the same cache key when query params are out of order', function (done) {
      var key2 = Utils.createCacheKey(params, query2)
      key1.should.equal(key2)
      done()
    })
    it('should create the same cache key on requests with omitted params', function (done) {
      query2.url_only = true
      query2.format = 'zip'
      query2.callback = {}
      var key2 = Utils.createCacheKey(params, query2)
      key1.should.equal(key2)
      delete query2.url_only
      delete query2.callback
      delete query2.format
      done()
    })
  })
})
