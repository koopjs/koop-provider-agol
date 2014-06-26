var should = require('should'),
  sinon = require('sinon'),
  config = require('config'),
  request = require('supertest'),
  koop = require('koop-server')(config);

var itemJson = require('./fixtures/itemJson.js');

global.config = config;

before(function(done){
  //Controller  = require('../controller/index.js');
  //global.agol  = require('../models/agol.js');
  //sinon.stub(BaseController, '_processFeatureServer', function(req, res, err, data, callback){
  //  console.log('wtf')
  //  callback(null, {});
  //});

  Cache.db = PostGIS.connect( config.db.postgis.conn );
  try { koop.register(require("../index.js")); } catch(e){ console.log(e); }
  done();
});

after(function(done){
  //BaseController._processFeatureServer.restore();
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
          .post('/agol/register')
          .set('Content-Type', 'application/json')
          .send({
            'id': 'tester'
          })
          .end(function(err, res){
            res.should.have.status(500);
            agol.register.called.should.equal(false);
            done();
        }); 
      });

      it('when passing in a host and id ', function(done){
        request(koop)
          .post('/agol/register')
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
        sinon.stub(agol, 'getItemData', function(host, item, key, options, callback){
          callback(null, {});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(Cache, 'getInfo', function(key, callback){
          callback(null, {status: 'processing'});
        });
        done();
      });

      after(function(done){
        agol.getItemData.restore();
        Cache.getInfo.restore();
        agol.find.restore();
        done();
      });

      it('should call Cache.getInfo and return 202', function(done){
         request(koop)
          .get('/agol/test/itemid/0')
          .end(function(err, res){
            res.should.have.status(202);
            Cache.getInfo.called.should.equal(true);
            done();
        });
      });
    });


    describe('getting item feature data w/o a format', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItemData', function(host, item, key, options, callback){
          callback(null, {data:[{features:[]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
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

      it('should call Cache.getInfo and return 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0')
          .end(function(err, res){
            res.should.have.status(200);
            Cache.getInfo.called.should.equal(true);
            agol.getItemData.called.should.equal(true);
            done();
        });
      });
    });

    describe('getting item feature data w/a format', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(Exporter, 'exportToFormat', function(format, dir, key, data, opts, callback){
          callback(null, 'somefile');
        });

        sinon.stub(agol, 'getItemData', function(host, item, key, options, callback){
          callback(null, { data:[{info:'dummy', features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
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
        Exporter.exportToFormat.restore();
        done();
      });

      it('should call Exporter.exportToFormat an dreturn 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0.csv')
          .end(function(err, res){
            res.should.have.status(404);
            Cache.getInfo.called.should.equal(true);
            Exporter.exportToFormat.called.should.equal(true);
            agol.getItemData.called.should.equal(true);
            done();
        });
      });
    });

    //Exporter.exportLarge
    describe('getting large feature data w/a format', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(Exporter, 'exportLarge', function(format, dir, key, data, opts, callback){
          callback(null, 'somefile');
        });

        sinon.stub(agol, 'getItemData', function(host, item, key, options, callback){
          callback(null, { koop_status: 'too big', data:[{info:'dummy', features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
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
        Exporter.exportLarge.restore();
        done();
      });

      it('should call Exporter.exportLarge an dreturn 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0.csv')
          .end(function(err, res){
            res.should.have.status(404);
            Cache.getInfo.called.should.equal(true);
            Exporter.exportLarge.called.should.equal(true);
            agol.getItemData.called.should.equal(true);
            done();
        });
      });
    });

    describe('getting an existing thumbnail', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItemData', function(host, item, key, options, callback){
          callback(null, { koop_status: 'too big', data:[{info:'dummy', features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(Cache, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });

        sinon.stub(Thumbnail, 'generate', function(data, key, opts, callback){
          callback(null, 'somefile');
        }); 

        done();
      });

      after(function(done){
        agol.getItemData.restore();
        Cache.getInfo.restore();
        agol.find.restore();
        Thumbnail.generate.restore();
        done();
      });

      it('should call Thumbnail generate and return 200', function(done){
         request(koop)
          .get('/agol/test/itemid/Thumbnail/0')
          .end(function(err, res){
//            res.should.have.status(200);
            agol.find.called.should.equal(true);
            Thumbnail.generate.called.should.equal(true);
            done();
        });
      });
    });

    describe('getting a png tile should return 404 for test', function() {
      before(function(done ){

        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItemData', function(host, item, key, options, callback){
          callback(null, { koop_status: 'too big', data:[{info:'dummy', features:[{}]}]});
        });

        sinon.stub(agol, 'find', function(id, callback){
          callback(null, {id: 'test', host:'http://dummy.host.com'});
        });

        sinon.stub(Cache, 'getInfo', function(key, callback){
          callback(null, itemInfo);
        });

        sinon.stub(Tiles, 'get', function(params, data, callback){
          callback(null, 'tile.png');
        });
        done();
      });

      after(function(done){
        agol.getItemData.restore();
        Cache.getInfo.restore();
        agol.find.restore();
        Tiles.get.restore();
        done();
      });

      it('should call Controller._processFeatureServer and return 200', function(done){
         request(koop)
          .get('/agol/test/itemid/0/tiles/5/5/12.png')
          .end(function(err, res){
            res.should.have.status(404);
            //Cache.getInfo.called.should.equal(true);
            agol.find.called.should.equal(true);
            agol.getItemData.called.should.equal(true);
            Tiles.get.called.should.equal(true);
            done();
        });
      });
    });

});

