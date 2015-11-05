var _ = require('lodash')
var crypto = require('crypto')
var FeatureService = require('featureservice')
var formatSR = require('format-spatial-ref')
var request = require('request')

var Utils = {}

/**
 * Centralized request method that forces URI encoding
 * all ajax requests should use this so it can be tested
 * @param {string} url - The url for the request.
 * @param {function} callback - The callback.
 */
Utils.req = function (url, callback) {
  // force hosted service requests to use ssl
  url = Utils.forceHttps(url)
  request({
    url: encodeURI(decodeURI(url)),
    forever: true,
    timeout: 30 * 1000,
    headers: { 'User-Agent': 'esri-koop' }
  }, callback)
}

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
  var sorted_query = {}
  var cacheParams = _.omit(query, ['url_only', 'format', 'callback'])

  _(cacheParams).keys().sort().each(function (key) {
    sorted_query[key] = query[key]
  })

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

// TODO: Get rid of this whole logic block, it's a huge hack and prone to error
function getLayer (candidate) {
  var parts
  var layer
  if (candidate.match(/FeatureServer/)) {
    parts = candidate.split('/')
    layer = parts[0] === 'FeatureServer' ? parts[1] : parts[0]
  } else if (candidate.match(/\.csv|\.kml|\.zip|\.geojson|\.json|\.shp|\.png/)) {
    parts = candidate.split('.')
    layer = parts[0]
  }

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
    message: error.message,
    code: error.body.code || error.code || 500,
    request: error.url,
    response: error.body.message,
    timestamp: error.timestamp || new Date()
  }
}

/**
 * Creates a clean and normalized name to be used in things like files on disk
 *
 * @params {string} type - the type of the providers ("agol")
 * @params {object} params - an object with an item id and layer number
 *
 * @returns {string} key
 * @private
 */
Utils.createName = function (item, service, layerId) {
  var layerIndex = parseInt(layerId, 0)
  service.layers = service.layers || []
  service.tables = service.tables || []
  var datasets = service.layers.concat(service.tables)
  var url_parts = item.url.split('/')
  var singleLayerItem = url_parts[url_parts.length - 1].match(/\d+/) || datasets.length < 2
  var layerName
  // safety for the case when the layer id is not listed
  // *should* never happen
  try {
    layerName = _.find(datasets, function (layer) { return parseInt(layer.id, 0) === layerIndex }).name
  } catch (e) {
    layerName = item.title
  }
  var name = singleLayerItem ? item.title : layerName
  return Utils.cleanseName(name)
}

/**
 * Strip out any characters that cause trouble on the file system
 *
 * @param {string} name - a file name
 * @returns {string} a name stripped of illegal characters
 */
Utils.cleanseName = function (name) {
  // replace "/", ",", "&", "|", "(", ")"
  return name.replace(/\/|,|&|\||\(|\)|\>|\<|\+|\-/g, '').replace(/\s/g, '_')
}

/**
 * Create key used to query a table in the cache
 *
 * @params {string} type - the type of the providers ("agol")
 * @params {object} params - an object with an item id and layer number
 *
 * @returns {string} key
 * @private
 */
Utils.createTableKey = function (params) {
  return ['agol', params.item, (params.layer || 0)].join(':')
}

/**
 * Wrap FeatureService constructor so it's easier to test
 * @param {string} url - A feature or map service url
 * @param {object} options - Options for initializing the feature service
 * @returns {object} FeatureService - a new feature service object
 */
Utils.initFeatureService = function (url, options) {
  if (!options) options = {}
  return new FeatureService(this.forceHttps(url), options)
}

/**
 * Removes the layer from the end of a url
 * @param {string} url - the url to strip the layer from
 * @param {string} length - length of the layer value to string
*/
Utils.stripLayerOffUrl = function (url, len) {
  return url.substring(0, url.length - ((len || 2) + 1))
}

/**
 * Set file download headers for data exports
 * adds the content-disposition and content-type bases on the file format
 *
 * @params {object} response object
 * @params {string} name - the name of the file
 * @params {string} format - the exported file format
 * @returns {object} response
 */
Utils.setHeaders = function (res, name, format) {
  res.setHeader('Content-disposition', 'attachment; filename=' + (encodeURIComponent(name)))
  var formats = {
    json: 'application/json',
    geojson: 'application/json',
    kml: 'application/vnd.google-earth.kml+xml',
    csv: 'text/csv',
    zip: 'application/octet-stream'
  }
  return res.contentType(formats[format])
}

/**
 * Creates a clean file path for files exports
 *
 * @params {string} type - the type of the providers ("agol")
 * @params {object} params - an object with an item id and layer number
 *
 * @returns {string} key
 * @private
 */
Utils.createFilePath = function (key, params) {
  var dir = params.item + '_' + (params.layer || 0)
  return ['files', dir, key].join('/')
}

/**
 * Removes blacklisted spatial references
 *
 * @param {object} input - original outSr from the request
 * @return {object} sr object that has been scrubbed for the blacklist
 */
Utils.scrubSR = function (input) {
  var parsed = formatSR(input)
  return parsed && parsed.wkid && [3785, 3857, 4326, 102100].indexOf(parsed.wkid) !== -1 ? null : parsed
}

/**
 * Sets defaults for feature service requests
 *
 * @param {object} params - request parameters
 * @param {object} query - query string from the request
 * @return {object} query with defaults appropriately set
 */
Utils.setServiceDefaults = function (params, query) {
  query = query || {}
  query.layer = params.layer || 0
  query.limit = query.limit || query.resultRecordCount || 1000
  query.offset = query.resultOffset || null
  return query
}

/**
 * Creates a hash encapsulating the unique parameters of a task
 *
 * @param {object} task - a job to be performed
 * @return {string} a hash representing the task
 */
Utils.createTaskHash = function (task) {
  var date = new Date()
  var lockObj = _.omit(task, 'store')
  return crypto.createHash('md5').update(date.getDate() + date.getMonth() + JSON.stringify(lockObj)).digest('hex')
}

/**
 * Replaces a url received from S3 with something that can be used
 *
 * @param {object} req - the incoming request object
 * @returns {string} the url to send back to the client
 */
Utils.replaceUrl = function (req) {
  var format = req.params.format
  var origUrl = req.originalUrl.split('?')
  origUrl[0] = origUrl[0].replace(/json/, format)
  var newUrl = req.protocol + '://' + req.get('host') + origUrl[0] + '?'
  newUrl += origUrl[1]
    .replace(/url_only=true&|url_only=true|/, '')
    .replace('format=' + format, '')
    .replace('&format=' + format, '')
  return newUrl
}

/**
 * Gets the feature service info
 *
 * @param {string} url - the url for the service
 * @param {number} layer - the id of the service layer
 * @param {function} callback - called when the service info comes back
 */
Utils.getLayerInfo = function (url, layer, callback) {
  // TODO just pass a URL, layers get parsed down in featureservice
  var service = Utils.initFeatureService(url, {layer: layer})
  service.layerInfo(function (err, info) {
    callback(err, info)
  })
}

/**
 * Creates a set of options to send back to the cache
 *
 * @param {object} req - the incoming request object
 * @returns {object} options to send to the cache
 */
Utils.createCacheOptions = function (req) {
  return {
    layer: req.params.layer || 0,
    host: req.portal,
    id: req.params.id,
    item: req.params.item,
    key: req.optionKey
  }
}

/**
 * Creates all the options needed to make an export
 *
 * @param {object} req - the incoming request object
 * @param {string} table - the table to get data from
 * @returns {object} options for the export function
 */
Utils.createExportOptions = function (req, table) {
  return {
    dir: req.params.item + '_' + (req.params.layer || 0),
    path: Utils.createFilePath(req.optionKey, req.params),
    query: req.query,
    key: req.optionKey,
    format: req.params.format,
    fileName: table.name + '.' + req.params.format,
    item: req.params.item,
    layer: req.params.layer || 0,
    type: 'agol',
    name: table.name,
    metadata: table.metadata,
    fields: table.fields,
    where: req.query.where,
    outSr: Utils.scrubSR(req.query.outSR),
    geometry: req.query.geometry,
    filtered: (req.query.where || req.query.geometry)
  }
}

/**
 * Creates all the options needed to store a geohash
 *
 * @param {object} req - the incoming request object
 * @returns {object} the options needed to create a geohash
 */
Utils.createGeohashOptions = function (req) {
  return {
    filePath: Utils.createFilePath(req.optionKey, req.params),
    fileName: req.optionKey + '.geohash.json',
    query: req.query,
    key: Utils.createTableKey(req.params)
  }
}

/**
 * Figures out whether a status is generating or not
 *
 * @param {object} info - info retrieved from the cache
 * @param {string} key - the option key for the particular requset
 * @param {string} format - the requested file format
 * @returns {boolean} true if generating false if not
 */
Utils.isGenerating = function (info, key, format) {
  // a file is generating if DB paging is in progress or it doesn't exist but the format has been set to true
  info.generating = info.generating || {}
  return info.generating[key] && (info.generating[key].progress !== '100%' || info.generating[key][format])
}

/**
 * Logic to generate the correct processing time
 *
 * @param {object} info - info retrieved from the cache
 * @param {string} key - the option key for this request
 * @returns {string} a string representing minutes or seconds of processing time
 */
Utils.processingTime = function (info, key) {
  var start
  var time
  if (info.generating && info.generating[key]) {
    start = info.generating[key].start
  } else {
    start = info.retrieved_at
  }
  var seconds = Math.round((Date.now() - start), -2) / 1000 || 0
  if (seconds > 60) {
    time = seconds / 60 + ' minutes'
  } else {
    time = seconds + ' seconds'
  }
  return time
}

/**
 * Mapping between Esri geomTypes and GeoJSON types
 */
Utils.geomTypes = {
  'esriGeometryPolygon': 'Polygon',
  'esriGeometryPoint': 'Point',
  'esriGeometryPolyLine': 'LineString'
}

/**
 * The path to get items from a portal
 */
Utils.agol_path = '/sharing/rest/content/items/'

module.exports = Utils
