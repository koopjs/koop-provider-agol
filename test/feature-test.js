/*global describe, it, before, after */
var sinon = require('sinon')
var should = require('should')
var FeatureRequest = require('../lib/feature-request.js')
var featureRequest = new FeatureRequest('http://www.foo.com', {
  log: {
    debug: function () {}
  }
})
describe('when when trying to build a page job', function () {
  before(function (done) {
    sinon.stub(featureRequest.featureService, 'pages', function (callback) {
      var error = new Error('Unable to get the layer metadata')
      error.timestamp = 'timeoclock'
      error.url = 'http://error.com'
      error.body = {
        message: 'Token Required',
        code: 499,
        details: []
      }
      callback(error)
    })
    done()
  })

  after(function (done) {
    featureRequest.featureService.pages.restore()
    done()
  })

  it('should callback with the error expected up the chain', function (done) {
    var expected = new Error('Unable to get the layer metadata')
    expected.code = 500
    featureRequest.submit(function (err, pages) {
      should.exist(err)
      err.message.should.equal('Unable to get the layer metadata')
      err.timestamp.should.equal('timeoclock')
      err.body.code.should.equal(499)
      err.url.should.equal('http://error.com')
      err.body.message.should.equal('Token Required')
      done()
    })
  })
})
