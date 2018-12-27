var Utils = require('../lib/utils')
var dsQuery = require('../lib/dataset-query')
var _ = require('lodash')

function Dataset (options) {
  this.cache = options.cache
  this.log = options.log
}

Dataset.prototype.findRecord = function (options, callback) {
  var idParts = options.dataset.split('_')
  var table = Utils.createTableKey({
    item: idParts[0],
    layer: idParts[1] || 0
  })
  this.cache.getInfo(table, function (err, record) {
    if (err) return callback(err)
    var id = idParts[0] + '_' + idParts[1]
    var dataset = formatDataset(record, id)
    callback(null, dataset)
  })
}

Dataset.prototype.findRecords = function (query, callback) {
  var sql = dsQuery.buildSearchSql(query)
  this.cache.db.query(sql, function (err, results) {
    if (err) return callback(err)
    if (results.rows.length < 1) return callback(null, [])

    var datasets = formatDatasets(results.rows)
    callback(null, datasets)
  })
}

function formatDatasets (rows) {
  return rows.map(function (row) {
    var record = row.info
    var idParts = row.id.split(':')
    var id = idParts[1] + '_' + idParts[2]
    return formatDataset(record, id)
  })
}

function formatDataset (record, id) {
  record.id = id
  record.downloads = computeDownloads(record)
  record.retrieved = new Date(record.retrieved_at)
  record.expires = new Date(record.expires_at)
  record.importStatus = record.status
  if (record.lastEditDate) record.lastEditDate = new Date(record.lastEditDate)
  return _.omit(record, [
    'info',
    'generating',
    'generated',
    'retrieved_at',
    'expires_at',
    'host',
    '_indexFields',
    '_indexGeometry',
    '_indexGeohash',
    'status'
  ])
}

function computeDownloads (record) {
  return ['csv', 'kml', 'zip', 'geohash'].map(function (type) {
    if (!record) return
    var generating = record.generating && (record.generating.full || {})
    var generated = record.generated && (record.generated.full || {})

    return {
      type: type,
      // handle processing and queued status
      generatingStatus: generating[type],
      lastGenerated: new Date(generated[type])
    }
  })
}

module.exports = Dataset
