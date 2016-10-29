var Utils = require('../lib/utils.js')
var config = require('config')
// confusing statement, but min ttl defaults to 0
var FILE_MIN_TTL = parseInt((config.agol && config.agol.file_min_ttl) || 0, 10)
module.exports = function (agol, controller) {
  function failedResource (info) {
    return info && info.status && info.status === 'Failed'
  }

  /**
   * Handles requests for data when the resource is cached
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   * @param {object} info - information about a arcgis online item
   * @private
   */
  function handleCached (req, res, info) {
    agol.log.debug(JSON.stringify({route: 'handleCached', params: req.params, query: req.query}))
    var options = Utils.createExportOptions(req, info)
    var start = Date.now()
    agol.files.stat(options.output, function (err, fileInfo) {
      agol.log.debug('Checking for file took:', (Date.now() - start) / 1000, 'seconds')
      if (err) handleFileNotExists(req, res, info)
      else handleFileExists(req, res, info, fileInfo, options)
    })
    var table = Utils.createTableKey(req.params)
    var updateOpts = { host: req.portal, key: table, item: req.params.item, layer: req.params.layer || 0 }
    agol.updateIfExpired(info, updateOpts, function (err) {
      if (err) agol.log.error(err)
    })
  }

  function handleFileExists (req, res, dataInfo, fileInfo) {
    var options = Utils.createExportOptions(req, dataInfo)
    var outdated = fileOutdated(dataInfo, fileInfo)
    if (!outdated || isFullGeojson(req)) return returnFile(req, res, options.output, dataInfo, fileInfo)
    // if we are not storing data in the db we should never be writing new full geojson exports
    var exportStatus = Utils.determineExportStatus(req, dataInfo)
    if (!exportStatus && dataInfo.version === 3.0) agol.exporter.generate(options, function (err, status) { if (err) agol.log.error(err) })

    // always serve filtered data from the same cache as the full export
    var isFiltered = req.query.where || req.query.geometry
    if (dataInfo.status === 'Cached' && isFiltered) return returnStatus(req, res, dataInfo)
    else returnFile(req, res, options.output, dataInfo, fileInfo)
  }

  function handleFileNotExists (req, res, info) {
    // if a job is already running or we don't actually have the data in the cache yet
    // hand off to returnStatus for a 202 response
    var exportStatus = Utils.determineExportStatus(req, info)
    var error
    if (exportStatus === 'fail' || /error/i.test(exportStatus)) {
      error = new Error(exportStatus)
    }
    if (error) error.code = 500
    if (exportStatus || info.status === 'Processing') return returnStatus(req, res, info, error)
    var options = Utils.createExportOptions(req, info)
    // only enqueue a job if it's not already queued or running
    agol.exporter.generate(options, function (err, status, created) {
      returnStatus(req, res, status, err)
    })
  }

  function determineFileVintage (dataInfo, fileInfo) {
    fileInfo = fileInfo || {}
    fileInfo.Metadata = fileInfo.Metadata || {}
    var fileVintage = fileInfo.Metadata.retrieved_at || fileInfo.mtime || dataInfo.retrieved_at
    return new Date(fileVintage)
  }

  function fileOutdated (dataInfo, fileInfo) {
    var fileVintage = Date.parse(determineFileVintage(dataInfo, fileInfo))
    var dataVintage = dataInfo.retrieved_at
    // Is the file we exported older than the last time we retrieved data from the underlying resource?
    // temporary fix because some geojson on S3 has a slightly earlier date than the retrieved_at
    return (fileVintage + FILE_MIN_TTL) < dataVintage
  }

  function isFullGeojson (req) {
    return req.params.format === 'geojson' && req.optionKey === 'full' && config.db && !config.db.store
  }

  /**
   * Handles the case when something other than 200 needs to be returned
   *
   * @param {object} req - the incoming request
   * @param {object} res - the outgoing response
   * @param {object} info - item's info doc
   * @param {object} error - an error from trying to fetch data
   * @private
   */
  function returnStatus (req, res, info, error) {
    agol.log.debug(JSON.stringify({route: 'returnStatus', params: req.params, query: req.query}))
    if (req.params.silent) return
    info = info || {}
    var processingTime = Utils.processingTime(info, req.optionKey)
    var response = {processingTime: processingTime, status: 'Processing'}
    // we shouldnt try to get count from the database if the table doesn't exist yet
    if (error) {
      if (error.message.match(/not found/i)) return res.status(202).json(response)
      response.error = Utils.failureMsg(error)
      response.status = 'Failed'
      return res.status(error.code || 502).json(response)
    }
    var code
    response.count = info.generating ? info.recordCount : info.importCount
    info.generating = info.generating || {}
    response.generating = info.generating[req.optionKey] || {}
    if (info.error && info.error.message) {
      response.error = info.error
      code = 502
    } else if (response.generating[req.params.format] === 'fail') {
      response.error = 'Export job failed'
      code = 500
    }

    if (response.error) response.status = 'Failed'

    res.status(code || 202).json(response)
  }

  /**
   * Respond to a requests with a "processing" response
   *
   * @param {object} req - the incoming request
   * @param {object} res - the outgoing response
   * @param {object} info - item's info doc
   * @private
   */
  function handleUnavailable (req, res, info) {
    agol.log.debug(JSON.stringify({route: 'handleUnavailable', params: req.params, query: req.query}))
    var options = Utils.createCacheOptions(req)
    agol.cacheResource(options, function (err, status) {
      returnStatus(req, res, status, err)
    })
  }

  /**
   * Handle datasets that have a 'failed status'
   *
   * @param {object} req - the incoming request
   * @param {object} res - the outgoing response
   * @param {object} info - item's info doc
   * @private
   */
  function handleFailed (req, res, info) {
    agol.log.debug(JSON.stringify({route: 'handleFailed', params: req.params, query: req.query}))
    if (Date.now() - info.retrieved_at > (30 * 60 * 1000)) {
      agol.dropResource(req.params.item, req.params.layer, null, function (err) {
        if (err) agol.log.error('Unable to drop failed resource: ' + req.params.item + '_' + req.params.layer)
        agol.log.info('Successfully reset failed resource: ' + req.params.item + '_' + req.params.layer)
        controller.getResource(req, res)
      })
    } else {
      returnStatus(req, res, info)
    }
  }

  /**
   * Returns a file as either a URL or an actual file download
   *
   * @param {object} request object
   * @param {object} response object
   * @param {string} path - the path the file
   * @param {string} name - the name of the file
   * @private
   */
  function returnFile (req, res, filePath, dataInfo, fileInfo) {
    agol.log.debug(JSON.stringify({route: 'returnFile', params: req.params, query: req.query, filePath: filePath}))

    if (req.query.url_only) return res.json({url: Utils.replaceUrl(req)})
    var fileVintage = determineFileVintage(dataInfo, fileInfo)
    res = Utils.setHeaders(res, {
      name: dataInfo.name,
      format: req.params.format,
      modified: fileVintage,
      expired: fileOutdated(dataInfo, fileInfo) || dataInfo.status === 'Expired'
    })
    var acceptsGzip = new RegExp(/gzip/i).test(req.headers['accept-encoding'])
    if (canRedirect(acceptsGzip, fileInfo, req.params.format, req.params.stream)) redirect(res, filePath)
    else stream(res, filePath, acceptsGzip)
  }

  function canRedirect (acceptsGzip, fileInfo, format, stream) {
    // NGINX is enabled
    return config.nginx &&
    // The file is stored on S3
    config.filesystem.s3 &&
    // With the proper content encoding header
    new RegExp(/gzip/i).test(fileInfo.ContentEncoding) &&
    // And the proper content type header
    fileInfo.ContentType === Utils.contentTypes[format] &&
    // The client accepts gzip or gunzip is enabled on NGINX
    (acceptsGzip || config.nginx.gunzip) &&
    // manual stream switch
    !stream
  }

  function redirect (res, filePath) {
    agol.log.debug('redirecting to s3', filePath)
    res.setHeader('X-Accel-Redirect', '/koop-redirect/' + config.filesystem.s3.bucket + '/' + filePath)
    res.status(200).send()
  }

  function stream (res, filePath, acceptsGzip) {
    agol.log.debug('streaming through app server', filePath)
    var options = {}
    if (acceptsGzip && config.filesystem.s3) {
      options.gunzip = false
      res.setHeader('Content-Encoding', 'gzip')
    }
    agol.files.createReadStream(filePath, options)
    .on('error', function (e) { agol.log.error(e) })
    .pipe(res)
    .on('error', function (e) { agol.log.error(e) })
  }

  /**
   * Gets a resource from the cache
   *   - status processing return 202
   *   - a file exists for the data
   *   - a new file needs to be created
   *
   * @param {object} req - the incoming request object
   * @param {object} res - the outgoing response object
   */
  return function (req, res) {
    agol.log.debug(JSON.stringify({route: 'getResource', params: req.params, query: req.query}))
    req.optionKey = Utils.createCacheKey(req.params, req.query)
    var table = Utils.createTableKey(req.params)
    agol.cache.getInfo(table, function (err, info) {
      if (err) return handleUnavailable(req, res, info, err)
      else if (failedResource(info)) handleFailed(req, res, info)
      else return handleCached(req, res, info)
    })
  }
}
