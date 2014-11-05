var pjson = require('./package.json');

exports.name = 'agol';
exports.pattern = '/:id/:item';
exports.controller = require('./controller');
exports.routes = require('./routes');
exports.model = require('./models/agol.js');
exports.status = { version: pjson.version};

