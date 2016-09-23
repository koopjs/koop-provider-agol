/* global describe it */
var dsQuery = require('../../lib/dataset-query')

describe('Generating SQL for datasets queries', function () {
  it('should generate the correct sql statement for all params', function (done) {
    var query = {
      url: 'foo',
      name: 'bar',
      itemTitle: 'baz',
      failedLastImport: true,
      sort: 'retrieved',
      importStatus: 'Cached',
      limit: 1
    }

    var sql = dsQuery.buildSearchSql(query)
    var expected = 'SELECT id, info FROM koopinfo WHERE '
    expected += "info->>'url' ilike '%foo%' "
    expected += "AND info->>'name' ilike '%bar%' "
    expected += "AND info->>'itemTitle' ilike '%baz%' "
    expected += "AND info->>'failedLastImport' ilike 'true' "
    expected += "AND info->>'status' ilike 'Cached' "
    expected += "ORDER BY info->>'retrieved_at' "
    expected += 'LIMIT 1;'
    sql.should.equal(expected)
    done()
  })

  it('should generate the correct sql with one fuzzy type and one category type', function (done) {
    var query = {
      url: 'foo',
      failedLastImport: true,
      limit: 1
    }

    var sql = dsQuery.buildSearchSql(query)
    var expected = 'SELECT id, info FROM koopinfo WHERE '
    expected += "info->>'url' ilike '%foo%' "
    expected += "AND info->>'failedLastImport' ilike 'true' "
    expected += "ORDER BY info->>'retrieved_at' "
    expected += 'LIMIT 1;'
    sql.should.equal(expected)
    done()
  })

  it('should generate the correct sql with only a fuzzy type', function (done) {
    var query = {
      url: 'foo',
      limit: 1
    }

    var sql = dsQuery.buildSearchSql(query)
    var expected = 'SELECT id, info FROM koopinfo WHERE '
    expected += "info->>'url' ilike '%foo%' "
    expected += "ORDER BY info->>'retrieved_at' "
    expected += 'LIMIT 1;'
    sql.should.equal(expected)
    done()
  })

  it('should generate the correct sql with no fuzzy types or category types', function (done) {
    var query = {
      limit: 1
    }

    var sql = dsQuery.buildSearchSql(query)
    var expected = 'SELECT id, info FROM koopinfo '
    expected += "ORDER BY info->>'retrieved_at' "
    expected += 'LIMIT 1;'
    sql.should.equal(expected)
    done()
  })
})
