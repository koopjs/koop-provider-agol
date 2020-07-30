/* eslint-env mocha */

const chai = require('chai')
const expect = chai.expect

describe('Koop provider', function () {
  it('should export required properties and functions', () => {
    const provider = require('../index')

    expect(provider.type).to.equal('provider')
    expect(provider.name).to.equal('agol')
    expect(provider.version).to.equal('4.0.0')
    expect(provider.Model).to.be.a('function')
  })
})
