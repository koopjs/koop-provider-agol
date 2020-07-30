const provider = {
  type: 'provider',
  name: 'agol',
  version: '4.0.0',
  hosts: true,
  disableIdParam: false,
  Model: require('./lib/model')
}

module.exports = provider
