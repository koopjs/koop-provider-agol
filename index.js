var pkg = require('./package.json')

var provider = {
  name: 'agol',
  hosts: true,
  controller: require('./controller'),
  routes: require('./routes'),
  model: require('./models/agol.js'),
  status: {
    version: pkg.version
  }
}

module.exports = provider
