const { promisify } = require('util')
const { parse } = require('csv')
const csvToGeojson = require('esri-to-geojson').fromCSV
const Joi = require('@hapi/joi')
require('isomorphic-fetch')
require('isomorphic-form-data')
const { getItem, getItemData } = require('@esri/arcgis-rest-portal')
const { koopProviderAgol: { host, maxCsvSize } } = require('config')

const csvParse = promisify(parse)
const MAX_CSV_SIZE = maxCsvSize || 5000000

const AGOL_HOSTS = {
  devext: 'https://devext.arcgis.com/sharing/rest',
  qaext: 'https://qaext.arcgis.com/sharing/rest',
  arcgis: 'https://www.arcgis.com/sharing/rest',
  _env: host
}

const paramsSchema = Joi.object({
  host: Joi.string().valid(...Object.keys(AGOL_HOSTS)).required(),
  id: Joi.string().guid().required()
}).required().unknown()

function Model (koop) {}

Model.prototype.getData = async function (req, callback) {
  const { params } = req
  const { error } = paramsSchema.validate(params)
  if (error) return callback(new Error(error))
  const { host: hostKey, id: itemId } = params
  const portal = AGOL_HOSTS[hostKey]

  try {
    const item = await getItem(itemId, { portal })
    const { type, size } = item

    if (type !== 'CSV') throw new StatusError(`Bad request. ${itemId} is type "${type}" which is not supported.`, 400)

    if (size > MAX_CSV_SIZE) {
      throw new StatusError(`The requested CSV exceeds the allowable size of ${MAX_CSV_SIZE} bytes`, 413)
    }

    const response = await getItemData(itemId, { portal, rawResponse: true })
    const { ok, status, statusText } = response
    if (!ok) {
      throw new StatusError(statusText, status)
    }

    const csvText = await response.text()
    const csvData = await csvParse(csvText)
    const geojson = csvToGeojson(csvData)
    geojson.metadata = { name: item.title }
    return callback(null, geojson)
  } catch (error) {
    callback(error)
  }
}

class StatusError extends Error {
  constructor (message, statusCode = 500) {
    super(message)
    this.code = statusCode
    Error.captureStackTrace(this, StatusError)
  }
}

module.exports = Model
