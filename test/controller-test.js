var should = require('should'),
  sinon = require('sinon'),
  request = require('supertest'),
  fs = require('fs'),
  kooplib = require('koop/lib');
  
var koop = require('koop')({}); //JSON.parse(fs.readFileSync(__dirname+'/config/default.json')));

var itemJson = require('./fixtures/itemJson.js');

var agol, controller;

before(function(done){
  var provider = require('../index.js');
  agol = new provider.model( kooplib );
  controller = new provider.controller( agol, kooplib.BaseController );
  koop._bindRoutes( provider.routes, controller ); 
  done();
});

after(function(done){
  done();
});

describe('AGOL Controller', function(){

    describe('add / get / remove hosts', function() {
      before(function(done ){
        sinon.stub(agol, 'register', function(id, host, callback){
          callback(null, 'test');
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, []);
        });
        sinon.stub(agol, 'remove', function(id, callback){
          callback(null, {});
        });
        done();
      });

      after(function(done){
        agol.register.restore();
        agol.find.restore();
        agol.remove.restore();
        done();
      });

      it('should call register and fail', function(done){
         request(koop)
          .post('/agol')
          .set('Content-Type', 'application/json')
          .send({
            'id': 'tester'
          })
          .end(function(err, res){
            res.should.have.status(400);
            agol.register.called.should.equal(false);
            done();
        }); 
      });

      it('when passing in a host and id ', function(done){
        request(koop)
          .post('/agol')
          .set('Content-Type', 'application/json')
          .send({
            'id': 'tester',
            'host': 'http://dummy.host.com'
          })
          .end(function(err, res){
            res.should.have.status(200);
            agol.register.called.should.equal(true);
            done();
        });
      });

      it('when listing hosts at /agol', function(done){
        request(koop)
          .get('/agol')
          .end(function(err, res){
            res.should.have.status(200);
            agol.find.called.should.equal(true);
            done();
        });
      });

      it('when getting a host at /agol/id ', function(done){
        request(koop)
          .get('/agol/test')
          .end(function(err, res){
            res.should.have.status(200);
            agol.find.called.should.equal(true);
            done();
        });
      });

      it('when removing a host at /agol/id ', function(done){
        request(koop)
          .del('/agol/test')
          .end(function(err, res){
            res.should.have.status(200);
            agol.remove.called.should.equal(true);
            done();
        });
      });
    });

   describe('finding item metadata', function() {
      before(function(done ){
        sinon.stub(agol, 'getItem', function(host, item, options, callback){
          callback(null, {});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });
        done();
      });

      after(function(done){
        agol.getItem.restore();
        agol.find.restore();
        done();
      });

      it('should call find and getItem', function(done){
         request(koop)
          .get('/agol/test/itemid')
          .end(function(err, res){
            res.should.have.status(200);
            agol.find.called.should.equal(true);
            agol.getItem.called.should.equal(true);
            done();
        });
      });
    });
    describe('dropping item metadata', function() {
      before(function(done ){
        sinon.stub(agol, 'dropItem', function(host, item, options, callback){
          callback(null, {});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });
        done();
      });

      after(function(done){
        agol.dropItem.restore();
        agol.find.restore();
        done();
      });

      it('should call find and dropItem', function(done){
         request(koop)
          .get('/agol/test/itemid/0/drop')
          .end(function(err, res){
            res.should.have.status(200);
            agol.find.called.should.equal(true);
            agol.dropItem.called.should.equal(true);
            done();
        });
      });
    });


    describe('getting item feature data in a processing state', function() {
      before(function(done ){
        sinon.stub(agol, 'getItemData', function(host, id, item, key, options, callback){
          callback(null, {});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(agol, 'getInfo', function(key, callback){
          callback(null, {status: 'processing'});
        });

        sinon.stub(agol, 'getCount', function(key, options, callback){
          callback(null, 10000);
        });
        done();
      });

      after(function(done){
        agol.getItemData.restore();
        agol.getInfo.restore();
        agol.getCount.restore();
        agol.find.restore();
        done();
      });

      it('should call Cache.getInfo and return 202', function(done){
         request(koop)
          .get('/agol/test/itemid/0')
          .end(function(err, res){
            res.should.have.status(202);
            agol.getInfo.called.should.equal(true);
            agol.getCount.called.should.equal(true);
            done();
        });
      });
    });


    describe('getting item feature data w/o a format', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItemData', function(host, hostId, item, key, options, callback){
          callback(null, {name:'', data:[{name:'', features:[]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(agol, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });
        done();
      });

      after(function(done){
        agol.getItemData.restore();
        agol.getInfo.restore();
        agol.find.restore();
        done();
      });

      it('should call agol.getInfo and return 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0')
          .end(function(err, res){
//            res.should.have.status(200);
            agol.getItemData.called.should.equal(true);
            done();
        });
      });
    });

    describe('getting geohash json', function() {
      before(function(done ){

        sinon.stub(agol.files, 'exists', function(path, name, callback){
          callback(false);
        });

        sinon.stub(agol, 'buildGeohash', function(params, filePath, fileName, options){
          return true;
        });

        var itemInfo = require('./fixtures/itemInfo.js');
        sinon.stub(agol, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });

        sinon.stub(controller, 'createGeohash', function(req, res, filePath, fileName){
          agol.buildGeohash({}, filePath, fileName, {});
          res.send(true);
        });
        done();
      });

      after(function(done ){
        agol.buildGeohash.restore();
        agol.getInfo.restore();
        agol.files.exists.restore();
        controller.createGeohash.restore();
        done();
      });

      it('should call agol.buildGeohash', function(done){
        request(koop)
          .get('/agol/test/itemid/0/geohash')
          .end(function(err, res){
            res.should.have.status(200);
            agol.buildGeohash.called.should.equal(true);
            controller.createGeohash.called.should.equal(true);
            done();
        });
      });

    });
    
    describe('getting geohash json', function() {
      before(function(done ){

        sinon.stub(agol.files, 'exists', function(path, name, callback){
          callback(false);
        });

        var itemInfo = require('./fixtures/itemInfo.js');
        sinon.stub(agol, 'getInfo', function(key, callback){
          // send no INFO to force the method to 
          callback(null, null);
        });

        // just return true
        sinon.stub(controller, 'findItemData', function(req, res){
          res.send(true);
        });
        done();
      });

      after(function (done) {
        agol.getInfo.restore();
        agol.files.exists.restore();
        controller.findItemData.restore();
        done();
      });

      it('should call controller.findItemData when the cache is empty (populate the cache)', function(done){
        request(koop)
          .get('/agol/test/itemid/0/geohash')
          .end(function(err, res){
            agol.getInfo.called.should.equal(true);
            controller.findItemData.called.should.equal(true);
            done();
        });
      });
    });    

    describe('getting item feature data w/a format', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'exportFile', function(params, opts, callback){
          callback(null, 'aFakeFile');
        });

        sinon.stub(agol, 'getItemData', function(host, hostId, item, key, options, callback){
          callback(null, { data:[{info:{name:'dummy'}, features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(agol, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });
        done();
      });

      after(function(done){
        agol.getItemData.restore();
        agol.getInfo.restore();
        agol.find.restore();
        agol.exportFile.restore();
        done();
      });

      it('should call Exporter.exportToFormat and return 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0.csv')
          .end(function(err, res){
            //res.should.have.status(404);
            agol.getInfo.called.should.equal(true);
            agol.exportFile.called.should.equal(true);
            agol.getItemData.called.should.equal(true);
            done();
        });
      });
    });

    //Exporter.exportLarge
    describe('getting large feature data w/a format', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'exportFile', function(params, opts, callback){
          callback(null, 'aFakeLargeFile');
        });

        sinon.stub(agol, 'getItemData', function(host, hostId, item, key, options, callback){
          callback(null, { koop_status: 'too big', data:[{info:{name:'dummy'}, features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(agol, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });
        done();
      });

      after(function(done){
        agol.getItemData.restore();
        agol.getInfo.restore();
        agol.find.restore();
        agol.exportFile.restore();
        done();
      });

      it('should call Exporter.exportFile an dreturn 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0.csv')
          .end(function(err, res){
            res.should.have.status(404);
            agol.getInfo.called.should.equal(true);
            agol.exportFile.called.should.equal(true);
            agol.getItemData.called.should.equal(true);
            done();
        });
      });
    });

    describe('getting an existing thumbnail', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItemData', function(host, hostId, item, key, options, callback){
          callback(null, { koop_status: 'too big', data:[{info:'dummy', features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(agol, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });

        sinon.stub(agol, 'generateThumbnail', function(data, key, opts, callback){
          callback(null, 'aFakeThumbnail');
        }); 

        done();
      });

      after(function(done){
        agol.getItemData.restore();
        agol.getInfo.restore();
        agol.find.restore();
        agol.generateThumbnail.restore();
        done();
      });

      it('should call Thumbnail generate and return 200', function(done){
         request(koop)
          .get('/agol/test/itemid/Thumbnail/0')
          .end(function(err, res){
            res.should.have.status(404);
            agol.find.called.should.equal(true);
            agol.generateThumbnail.called.should.equal(true);
            done();
        });
      });
    });


    describe('getting a png tile should return 404 for test', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItemData', function(host, hostId, item, key, options, callback){
          callback(null, { name:'', koop_status: 'too big', data:[{name:'', info:'dummy', features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(agol, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });

        sinon.stub(agol, 'tileGet', function(params, data, callback){
          callback(null, 'aFakeTile');
        });
        done();
      });

      after(function(done){
        agol.getItemData.restore();
        agol.getInfo.restore();
        agol.find.restore();
        agol.tileGet.restore();
        done();
      });

      it('should call Tiles helper and return 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0/tiles/5/5/12.png')
          .end(function(err, res){
            res.should.have.status(404);
            agol.find.called.should.equal(true);
            agol.getItemData.called.should.equal(true);
            done();
        });
      });
    });

    /*describe('getting a thumbnail from .png', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItemData', function(host, hostId, item, key, options, callback){
          callback(null, { koop_status: 'too big', data:[{info:'dummy', features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(agol, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });

        //sinon.stub(Thumbnail, 'generate', function(data, key, opts, callback){
        //  callback(null, 'somefile');
        //});

        done();
      });

      after(function(done){
        agol.getItemData.restore();
        agol.getInfo.restore();
        agol.find.restore();
        //Thumbnail.generate.restore();
        done();
      });

      it('should call Thumbnail generate and return 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0.png')
          .end(function(err, res){
            agol.find.called.should.equal(true);
            //Thumbnail.generate.called.should.equal(true);
            done();
        });
      });
    });

    describe('when accessing an item as a feature service', function() {
      before(function( done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItemData', function(host, hostId, item, key, options, callback){
          callback(null,  { data:[ { info:'dummy', features:[{properties:{test:1}, geometry:null}] } ] });
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, { id: 'test', host: 'http://dummy.host.com' } );
        });

        sinon.stub(Cache, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });

        done();
      });

      after(function(done){
        agol.getItemData.restore();
        Cache.getInfo.restore();
        agol.find.restore();
        done();
      });

      it('should call Controller._processFeaturer with skipLimit true', function(done){
         request(koop)
          .get('/agol/test/itemid/FeatureServer/0')
          .end(function(err, res){
            should.not.exist(err);
            agol.find.called.should.equal(true);
            agol.getItemData.called.should.equal(true);
            done();
        });
      });
    });
    });*/

});

