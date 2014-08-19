exports.name = 'agol';
exports.pattern = '/:id/:item';
exports.controller = require('./controller');
exports.routes = require('./routes');
exports.model = require('./models/agol.js');
