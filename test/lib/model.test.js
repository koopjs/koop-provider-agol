/* eslint-env mocha */
const chai = require('chai')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const expect = chai.expect

describe('Koop AGOL provider - model', () => {
  describe('Error handling', () => {
    it('returns error when host param', (done) => {
      const Model = require('../../lib/model')
      const model = new Model()

      model.getData({ params: {} }, (err, geojson) => {
        expect(err).to.have.property('message', 'ValidationError: "host" is required')
        done()
      })
    })

    it('returns error when valid host param', (done) => {
      const Model = require('../../lib/model')
      const model = new Model()

      model.getData({ params: { host: 'foodbar' } }, (err, geojson) => {
        expect(err).to.have.property('message', 'ValidationError: "host" must be one of [devext, qaext, arcgis, _env]')
        done()
      })
    })

    it('returns error when id param', (done) => {
      const Model = require('../../lib/model')
      const model = new Model()

      model.getData({ params: { host: 'devext' } }, (err, geojson) => {
        expect(err).to.have.property('message', 'ValidationError: "id" is required')
        done()
      })
    })

    it('returns error when valid id param', (done) => {
      const Model = require('../../lib/model')
      const model = new Model()

      model.getData({ params: { host: 'devext', id: 'foodbar' } }, (err, geojson) => {
        expect(err).to.have.property('message', 'ValidationError: "id" must be a valid GUID')
        done()
      })
    })

    it('returns error when itemId not found in Portal', (done) => {
      const getItemSpy = sinon.spy(async () => {
        return Promise.reject(new Error('CONT_0001: Item does not exist or is inaccessible.'))
      })
      const Model = proxyquire('../../lib/model', {
        '@esri/arcgis-rest-portal': {
          getItem: getItemSpy
        }
      })
      const model = new Model()
      model.getData({ params: { host: 'devext', id: 'abcdef0123456789abcdef0123456789' } }, (err, geojson) => {
        expect(getItemSpy.calledOnce).to.equal(true)
        expect(err).to.have.property('message', 'CONT_0001: Item does not exist or is inaccessible.')
        done()
      })
      sinon.restore()
    })

    it('returns error when item is not CSV type', (done) => {
      const getItemSpy = sinon.spy(async () => {
        return Promise.resolve({ type: 'Feature Service' })
      })
      const Model = proxyquire('../../lib/model', {
        '@esri/arcgis-rest-portal': {
          getItem: getItemSpy
        }
      })
      const model = new Model()
      model.getData({ params: { host: 'qaext', id: 'abcdef0123456789abcdef0123456789' } }, (err, geojson) => {
        expect(getItemSpy.calledOnce).to.equal(true)
        expect(err).to.have.property('message', 'Bad request. abcdef0123456789abcdef0123456789 is type "Feature Service" which is not supported.')
        done()
      })
      sinon.restore()
    })

    it('returns error when item is not CSV type', (done) => {
      const getItemSpy = sinon.spy(async () => {
        return Promise.resolve({ type: 'Feature Service' })
      })
      const Model = proxyquire('../../lib/model', {
        '@esri/arcgis-rest-portal': {
          getItem: getItemSpy
        }
      })
      const model = new Model()
      model.getData({ params: { host: 'qaext', id: 'abcdef0123456789abcdef0123456789' } }, (err, geojson) => {
        expect(getItemSpy.calledOnce).to.equal(true)
        expect(err).to.have.property('message', 'Bad request. abcdef0123456789abcdef0123456789 is type "Feature Service" which is not supported.')
        done()
      })
      sinon.restore()
    })

    it('returns error when item is more than maximum size', (done) => {
      const getItemSpy = sinon.spy(async () => {
        return Promise.resolve({ type: 'CSV', size: 5000001 })
      })
      const Model = proxyquire('../../lib/model', {
        '@esri/arcgis-rest-portal': {
          getItem: getItemSpy
        }
      })
      const model = new Model()
      model.getData({ params: { host: 'qaext', id: '9899c1989c80499487995d52ebf1fb78' } }, (err, geojson) => {
        expect(getItemSpy.calledOnce).to.equal(true)
        expect(err).to.have.property('message', 'The requested CSV exceeds the allowable size of 5000000 bytes')
        done()
      })
      sinon.restore()
    })

    it('returns error when failure to fetch data', (done) => {
      const getItemSpy = sinon.spy(async () => {
        return Promise.resolve({ type: 'CSV', size: 1000 })
      })

      const getItemDataSpy = sinon.spy(async () => {
        return Promise.reject(new Error('5xx'))
      })

      const Model = proxyquire('../../lib/model', {
        '@esri/arcgis-rest-portal': {
          getItem: getItemSpy,
          getItemData: getItemDataSpy
        }
      })
      const model = new Model()
      model.getData({ params: { host: 'qaext', id: '9899c1989c80499487995d52ebf1fb78' } }, (err, geojson) => {
        expect(getItemSpy.calledOnce).to.equal(true)
        expect(getItemDataSpy.calledOnce).to.equal(true)
        expect(err).to.have.property('message', '5xx')
        done()
      })
      sinon.restore()
    })

    it('returns error when failure to fetch data', (done) => {
      const getItemSpy = sinon.spy(async () => {
        return Promise.resolve({ type: 'CSV', size: 1000 })
      })

      const getItemDataSpy = sinon.spy(async () => {
        return Promise.resolve({ ok: false, status: 500, statusText: '5xx' })
      })

      const Model = proxyquire('../../lib/model', {
        '@esri/arcgis-rest-portal': {
          getItem: getItemSpy,
          getItemData: getItemDataSpy
        }
      })
      const model = new Model()
      model.getData({ params: { host: 'qaext', id: '9899c1989c80499487995d52ebf1fb78' } }, (err, geojson) => {
        expect(getItemSpy.calledOnce).to.equal(true)
        expect(getItemDataSpy.calledOnce).to.equal(true)
        expect(err).to.have.property('message', '5xx')
        done()
      })
      sinon.restore()
    })
  })

  it('Returns expected geojson', (done) => {
    const getItemSpy = sinon.spy(async () => {
      return Promise.resolve({ type: 'CSV', size: 1000, title: 'Test item' })
    })

    const getItemDataSpy = sinon.spy(async () => {
      return Promise.resolve({
        ok: true,
        text: async () => {
          return Promise.resolve('X,Y,FID,rownum,latitude,longitude,quant_val,expected_c,FID_1\n-88,40,1,1,40,-88,1002,red,1\n-87.9,40.0,2,2,40,-87.9,1003,red,2\n')
        }
      })
    })

    const Model = proxyquire('../../lib/model', {
      '@esri/arcgis-rest-portal': {
        getItem: getItemSpy,
        getItemData: getItemDataSpy
      }
    })
    const model = new Model()
    model.getData({ params: { host: 'qaext', id: '9899c1989c80499487995d52ebf1fb78' } }, (err, geojson) => {
      expect(err).to.equal(null)
      expect(getItemSpy.calledOnce).to.equal(true)
      expect(getItemSpy.firstCall.args).to.deep.equal([
        '9899c1989c80499487995d52ebf1fb78',
        { portal: 'https://qaext.arcgis.com/sharing/rest' }
      ])
      expect(getItemDataSpy.calledOnce).to.equal(true)
      expect(getItemDataSpy.firstCall.args).to.deep.equal([
        '9899c1989c80499487995d52ebf1fb78',
        {
          portal: 'https://qaext.arcgis.com/sharing/rest',
          rawResponse: true
        }])
      console.log(JSON.stringify(geojson))
      expect(geojson).to.deep.equal({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 0,
            properties: {
              X: -88,
              Y: 40,
              FID: 1,
              rownum: 1,
              latitude: 40,
              longitude: -88,
              quant_val: 1002,
              expected_c: 'red',
              FID_1: 1,
              OBJECTID: 0
            },
            geometry: {
              type: 'Point',
              coordinates: [
                -88,
                40
              ]
            }
          },
          {
            type: 'Feature',
            id: 1,
            properties: {
              X: -87.9,
              Y: 40,
              FID: 2,
              rownum: 2,
              latitude: 40,
              longitude: -87.9,
              quant_val: 1003,
              expected_c: 'red',
              FID_1: 2,
              OBJECTID: 1
            },
            geometry: {
              type: 'Point',
              coordinates: [
                -87.9,
                40
              ]
            }
          }
        ],
        metadata: {
          name: 'Test item'
        }
      })
      done()
    })
    sinon.restore()
  })
})
