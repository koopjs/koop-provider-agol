var pjson = require('./package.json');
var git = require('git-rev-sync');

exports.name = 'agol';
exports.pattern = '/:id/:item';
exports.controller = require('./controller');
exports.routes = require('./routes');
exports.model = require('./models/agol.js');
exports.status = { sha: git.long(), version: pjson.version, lastCommit: git.log()[0] };
