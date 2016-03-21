var _ = require('lodash')
var crypto = require('crypto')
var FeatureService = require('featureservice')
var formatSR = require('format-spatial-ref')
var request = require('request')
var path = require('path')

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
 * @return {string} url
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
 * @return {string} key
 */
Utils.createCacheKey = function (params, query) {
  // sort the req.query before we hash so we are consistent
  // there is a potential memory issue with using _(obj).omit(array)
  var sorted_query = {}
  var cacheParams = _.pick(query, ['where', 'geometry', 'outSR'])

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
  if (emptyQuery(query)) return 'full_' + layer || 0
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

function emptyQuery (query) {
  var noQuery = !query.where || query.where === '1=1'
  var noGeometry = !query.geometry || query.geometry === {}
  var noSr = !query.outSr || query.outSr === {}
  if (noQuery && noGeometry && noSr) return true
  else return false
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
  error = error || {}
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
 * @param {string} type - the type of the providers ("agol")
 * @param {object} params - an object with an item id and layer number
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
 * @param {string} type - the type of the providers ("agol")
 * @param {object} params - an object with an item id and layer number
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
 * @param {object} response object
 * @param {string} name - the name of the file
 * @param {string} format - the exported file format
 * @return {object} response
 */
Utils.setHeaders = function (res, options) {
  res.setHeader('Content-disposition', 'attachment; filename=' + (encodeURIComponent(options.name)))
  res.setHeader('Last-Modified', new Date(options.modified))
  var formats = {
    json: 'application/json',
    geojson: 'application/json',
    kml: 'application/vnd.google-earth.kml+xml',
    csv: 'text/csv',
    zip: 'application/octet-stream'
  }
  return res.contentType(formats[options.format])
}

/**
 * Creates a clean file path for files exports
 *
 * @param {string} type - the type of the providers ("agol")
 * @param {object} params - an object with an item id and layer number
 *
 * @returns {string} key
 * @private
 */
Utils.createFilePath = function (key, params) {
  var dir = params.item + '_' + (params.layer || 0)
  return path.join('files', dir, key)
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
  return JSON.stringify((date.getDate() + date.getMonth() + task.id))
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
 * @param {object} job - contains an item and a layer
 * @returns {object} options to send to the cache
 */
Utils.createCacheOptions = function (req, job) {
  job = job || {}
  var key = job ? 'full_' + job.layer : req.optionKey
  var formats = req.params.format ? [req.params.format] : job.formats
  return {
    layer: job.layer || req.params.layer || 0,
    host: req.portal,
    id: req.params.id,
    item: job.item || req.params.item,
    key: key,
    formats: formats,
    overwrite: job.overwrite
  }
}

/**
 * Creates all the options needed to make an export
 *
 * @param {object} req - the incoming request object
 * @param {string} table - the table to get data from
 * @return {object} options for the export function
 */
Utils.createExportOptions = function (req, table, job, format) {
  return {
    table: Utils.createTableKey(job || req.params),
    filePath: Utils.createFilePath(req.optionKey, job || req.params),
    key: (job && job.optionKey) || req.optionKey,
    format: format || req.params.format,
    fileName: table.name + '.' + (format || req.params.format),
    name: table.name,
    metadata: table.metadata,
    where: (job && job.where) || req.query.where,
    outSr: Utils.scrubSR((job && job.where) || req.query.outSR),
    geometry: (job && job.geometry) || req.query.geometry
  }
}

/**
 * Creates all the options needed to store a geohash
 *
 * @param {object} req - the incoming request object
 * @return {object} the options needed to create a geohash
 */
Utils.createGeohashOptions = function (req) {
  var key = req.params.item + '_' + req.params.layer
  return {
    filePath: ['latest', 'files', key].join('/'),
    fileName: req.optionKey + '.geohash.json',
    query: req.query,
    key: Utils.createTableKey(req.params)
  }
}

/**
 * Logic to generate the correct processing time
 *
 * @param {object} info - info retrieved from the cache
 * @param {string} key - the option key for this request
 * @return {string} a string representing minutes or seconds of processing time
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
 * Logic to determine whether a particular format and key is generating
 *
 * @param {object} req - the incoming request object
 * @param {object} info - the table's info doc
 * @return {string/bool} the status of the export job
 */
Utils.determineStatus = function (req, info) {
  var generating = info.generating || {}
  var genKey = generating[req.optionKey] || {}
  var status = genKey[req.params.format]
  return status
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
