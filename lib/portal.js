var util = require('util')
var Utils = require('./utils.js')

/**
 * @class
 * Constructor for the portal object
 *
 * @param {object} options - for now just includes a passed in logger
 */
function Portal (options) {
  this.log = options.log
}

/**
 * Gets item data from a portal instance
 *
 * @param {string} host - the host is needed to tell what dataset to remove
 * @param {string} itemid - id of the item
 * @param {function} callback - the callback for when all is done
 */
Portal.prototype.getItem = function (host, itemId, callback) {
  var self = this
  var error
  var url = host + Utils.agol_path + itemId + '?f=json'

  Utils.req(url, function (err, data) {
    if (err) {
      self.log.debug(url, err, data)
      error = new Error('Failure while trying to communicate with the host portal')
      error.timestamp = new Date()
      error.url = url
      data = data || {}
      error.code = data.statusCode || 502
      self.log.error(util.inspect(error))
      return callback(error)
    }
    var json
    try {
      json = JSON.parse(data.body)
    } catch (e) {
      // TODO detect when parsing failed because the response is some kind of HTML
      // could be 404 could be 500
      error = new Error('Could not parse the item response')
      error.timestamp = new Date()
      error.url = url
      error.code = 500
      self.log.error(util.inspect(error))
      return callback(error)
    }
    if (json.error) {
      error = new Error('Failed while trying to get item information')
      error.timestamp = new Date()
      error.body = json.error
      error.code = 502
      error.url = url
      self.log.error(util.inspect(error))
      return callback(error)
    }
    if (!json.url) {
      error = new Error('Item has no url')
      error.code = 502
      error.url = url
      self.log.error(error.message, {url: url})
      return callback(error)
    }
    if (json.typeKeywords && json.typeKeywords.indexOf('Metadata') !== -1) {
      self._getItemMetadata(host, itemId, json, callback)
    } else {
      callback(null, json)
    }
  })
}

/**
* Get an item's metadata
* requests the metadata and attachs it to an object before calling the callback
*
* @param {string} host - the agol deploy to get data from
* @param {string} item - the agol item id
* @param {object} json - an item's json data to attach metadata to
* @param {function} callback - the callback for when all is done
* @private
*/
Portal.prototype._getItemMetadata = function (host, item, json, callback) {
  var self = this
  var url = [host, Utils.agol_path, item, '/info/metadata/metadata.xml?format=default'].join('')
  Utils.req(url, function (err, data) {
    if (err) {
      self.log.error(util.inspect(err))
      return callback(err)
    }
    json.metadata = data.body
    callback(null, json)
  })
}

module.exports = Portal
