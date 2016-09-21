var Utils = require('./utils')

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
  this.cache.getInfo(table, function (err, info) {
    if (err) return callback(err)
    var dataset = info
    dataset.id = idParts[0] + '_' + idParts[1]
    delete dataset.info
    callback(null, dataset)
  })
}

Dataset.prototype.findRecords = function (query, callback) {
  this.log.debug(query)
  var sql = 'SELECT id, info FROM koopinfo'
  sql += buildWhere(query)
  sql += buildSort(query)
  sql += buildLimit(query)
  sql += ';'
  this.cache.db.query(sql, function (err, results) {
    if (err) return callback(err)
    if (results.rows.length < 1) return callback(null, [])

    var datasets = formatDatasets(results.rows)
    callback(null, datasets)
  })
}

function buildWhere (query) {
  var where = ' WHERE'
  var stringTypes = ['failedLastImport', 'status', 'name', 'url']
  stringTypes.forEach(function (param) {
    if (query[param] && query[param].trim().length > 0) {
      where += stringLike(param, query[param]) + ' AND'
    }
  })
  // remove trailing AND
  if (where === ' WHERE') return ''
  where = where.slice(0, -4)
  return where
}

function stringLike (field, value) {
  return " info->>'" + field + "' ilike '%" + value + "%'"
}

function buildSort (query) {
  var sort = " ORDER BY info->>'"
  sort += query.sort && query.sort.trim().length > 0 ? query.sort : 'retrieved_at'
  sort += "'"
  return sort
}

function buildLimit (query) {
  if (!query.limit || query.limit.trim().length < 1) {
    return ' LIMIT 100'
  } else if (query.limit > 100) {
    return ' LIMIT 100'
  } else {
    return ' LIMIT ' + Number(query.limit)
  }
}

function formatDatasets (rows) {
  return rows.map(function (row) {
    var dataset = row.info
    var idParts = row.id.split(':')
    dataset.id = idParts[1] + '_' + idParts[2]
    delete dataset.info
    return dataset
  })
}

module.exports = Dataset
