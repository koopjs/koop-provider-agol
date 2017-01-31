var pkg = require('./package.json')

var provider = {
  plugin_name: 'agol',
  hosts: true,
  Controller: require('./controllers'),
  routes: require('./routes.js'),
  Model: require('./models/agol.js'),
  status: {
    version: pkg.version
  },
  type: 'provider'
}

module.exports = provider
