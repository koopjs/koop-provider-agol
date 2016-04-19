var Utils = require('./utils.js')
var csvToGeojson = require('esri-to-geojson').fromCSV
var Csv = require('csv')

/**
 * @Class
 * Constructor for the CSVRequest object
 *
 * @param {object} cache - an object with koop cache methods
 * @param {object} task - describes the csv data to get
 */
function CSVRequest (cache, task) {
  this.cache = cache
  this.task = task
}

/**
 * Submits a request for a csv
 *
 * @param {function} callback - calls back with an error or data
 */
CSVRequest.prototype.submit = function (callback) {
  var self = this
  self._get(function (err, data) {
    if (err) return callback(err)
    self._parse(data, function (err, csv) {
      if (err) return callback(err)
      self._convert(csv, function (err, geojson) {
        if (err) return callback(err)
        self._store(geojson, callback)
      })
    })
  })
}

/**
 * Gets the csv from the remote host
 *
 * @param {function} callback - calls back with an error or raw csv data
 */
CSVRequest.prototype._get = function (callback) {
  Utils.req(this.task.url, function (err, data) {
    if (err) {
      var error = new Error('Unable to retreive csv data')
      error.code = 400
      return callback(error)
    }
    callback(null, data)
  })
}

/**
 * Parses raw csv data
 *
 * @param {function} callback - calls back with an error or parsed csv data
 */
CSVRequest.prototype._parse = function (data, callback) {
  Csv.parse(data.body, function (err, csv) {
    if (err) {
      var error = new Error('Unable to parse the csv')
      error.code = 400
      return callback(error)
    }
    callback(null, csv)
  })
}

/**
 * Converts csv data into geojson
 *
 * @param {function} callback - calls back with an error or geojson
 */
CSVRequest.prototype._convert = function (csv, callback) {
  var geojson
  try {
    geojson = csvToGeojson(csv)
  } catch (e) {
    var error = new Error('Error converting csv to geojson')
    error.code = 500
    return callback(error)
  }
  callback(null, geojson)
}

/**
 * Stores geojson in the cache
 *
 * @param {function} callback - calls back with an error or geojson in the third parameter
 */
CSVRequest.prototype._store = function (geojson, callback) {
  var task = this.task
  // store is set to false because the task was locked
  // so we don't need to add to the DB but we still want to return geojson
  if (!task.store) return callback(null, null, geojson)
  if (!geojson.features || !geojson.features[0]) geojson.features[0] = {}
  // store metadata with the data
  var table = {
    status: 'Cached',
    name: Utils.cleanseName(task.itemInfo.title.replace('.csv', '')),
    updated_at: task.itemInfo.modified,
    expires_at: task.expires_at,
    retrieved_at: Date.now(),
    info: {
      type: 'CSV',
      version: 3,
      _indexFields: task.indexFields
    },
    host: {
      id: task.hostId
    },
    features: geojson.features
  }
  if (geojson.features && geojson.features[0]) {
    var properties = geojson.features[0].properties || {}
    table.info.fields = Object.keys(properties)
  }
  this.cache.insert('agol', task.id, table, 0, function (err, success) {
    if (err) return callback(err)
    // geojson is the third parameter because this is initially called from a function that may receive
    // a status object in the second parameter
    var info = {
      status: 'Cached',
      retrieved_at: Date.now(),
      count: geojson.features.length
    }
    callback(null, info, geojson)
  })
}

module.exports = CSVRequest
