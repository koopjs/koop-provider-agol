var pkg = require('./package.json')

var provider = {
  plugin_name: 'agol',
  hosts: true,
  controller: require('./controllers'),
  routes: require('./routes.js'),
  model: require('./models/agol.js'),
  status: {
    version: pkg.version
  },
  type: 'provider'
}

module.exports = provider
