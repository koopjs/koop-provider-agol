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
  // build the file key as an MD5 hash that's a join on the paams and look for the file
  var toHash = params.item + '_' + (params.layer || 0) + JSON.stringify(sorted_query)

  return crypto.createHash('md5').update(toHash).digest('hex')
}

module.exports = Utils
