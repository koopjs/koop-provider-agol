var pjson = require('./package.json');
var fs = require('fs');

exports.name = 'agol';
exports.pattern = '/:id/:item';
exports.controller = require('./controller');
exports.routes = require('./routes');
exports.model = require('./models/agol.js');
exports.status = { sha: fs.readFileSync( __dirname + '/.git/refs/heads/master' ).toString(), version: pjson.version};

