var _ = require('lodash')

var FIELDMAP = [
  {
    original: 'retrieved',
    regex: new RegExp(/^retrieved$/),
    replacement: 'retrieved_at'
  },
  {
    original: 'expires',
    regex: new RegExp(/^expires$/),
    replacement: 'expires_at'
  },
  {
    original: 'importStatus',
    regex: new RegExp(/^importStatus$/),
    replacement: 'status'
  }
]

module.exports.buildSearchSql = function (query) {
  var params = normalizeQueryParams(query)
  var sql = 'SELECT id, info FROM koopinfo'
  sql += buildWhere(params)
  sql += buildSort(params)
  sql += buildLimit(params)
  sql += ';'
  return sql
}

function normalizeQueryParams (query) {
  // TODO handle expires_at and retrieved_at
  var params = _.cloneDeep(query)
  params.status = query.importStatus
  params.sort = normalizeSort(query)
  return _.omit(params, ['importStatus'])
}

function normalizeSort (query) {
  var sort = query.sort && query.sort.trim().length > 0 ? query.sort : 'retrieved_at'

  return FIELDMAP.reduce(function (sort, field) {
    if (sort.match(field.regex)) {
      sort = sort.replace(field.original, field.replacement)
    }
    return sort
  }, sort)
}

function buildWhere (query) {
  var where = ' WHERE'
  var fuzzyTypes = ['url', 'name', 'itemTitle']
  var categoryTypes = ['failedLastImport', 'status']

  // TODO DRY this up
  where = fuzzyTypes.reduce(function (sql, param) {
    if (query[param] && query[param].trim().length > 0) {
      return sql + fuzzyLike(param, query[param]) + ' AND'
    } else {
      return sql
    }
  }, where)

  where = categoryTypes.reduce(function (sql, param) {
    if (query[param] && query[param].toString().trim().length > 0) {
      return sql + stringLike(param, query[param]) + ' AND'
    } else {
      return sql
    }
  }, where)

  // remove trailing AND
  if (where === ' WHERE') return ''
  where = where.slice(0, -4)
  return where
}

function fuzzyLike (field, value) {
  return " info->>'" + field + "' ilike '%" + value + "%'"
}

function stringLike (field, value) {
  return " info->>'" + field + "' ilike '" + value + "'"
}

function buildSort (query) {
  var sort = " ORDER BY info->>'"
  sort += query.sort
  sort += "'"
  return sort
}

function buildLimit (query) {
  if (!query.limit || query.limit.toString().trim().length < 1) {
    return ' LIMIT 100'
  } else if (query.limit > 100) {
    return ' LIMIT 100'
  } else {
    return ' LIMIT ' + Number(query.limit)
  }
}
