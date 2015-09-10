var _ = require('lodash')
var crypto = require('crypto')

var Utils = {}

/**
 * Force a url to use https vs http
 * @param {string} url - The url for the request
 * returns {string} url
 */
Utils.forceHttps = function (url) {
  if (url && url.split('//').length > 1) {
    url = url.split('//')[1].match(/^service/) ? url.replace('http:', 'https:') : url
  }
  return url
}

/**
 * Creates a unique key based on request params and the querystring
 * @param {object} params - Request params
 * @param {object} query - Request query
 * returns {string} key
 */
Utils.createCacheKey = function (params, query) {
  // sort the req.query before we hash so we are consistent
  // there is a potential memory issue with using _(obj).omit(array)
  var sorted_query = _.keys(_.omit(query, ['url_only', 'format', 'callback'])).sort()

  // this is called from a greedy route so we need to parse the layer id off the captured param
  var layer
  if (params[0]) {
    layer = getLayer(params[0])
  } else {
    layer = params.layer
  }

  var toHash = params.item + '_' + (layer || 0) + JSON.stringify(sorted_query)

  return crypto.createHash('md5').update(toHash).digest('hex')
}

function getLayer (candidate) {
  var parts = candidate.split('/')
  var layer = parts[0] === 'FeatureServer' ? parts[1] : parts[0]
  return layer
}

/**
 * Builds a failure message to the client
 * @param {object} req - the incoming request
 * @param {object} res - the outgoing response
 * @param {object} error - an error object from some attempt to get data
 */
Utils.failureMsg = function (error) {
  // todo change the outgoing format to something flat that makes sense
  // be defensive about errors that don't have a body
  error.body = error.body || {}
  return {
    error: {
      message: error.message,
      code: error.body.code || error.code || 500,
      request: error.url,
      response: error.body.message,
      timestamp: error.timestamp || new Date()
    }
  }
}

module.exports = Utils
