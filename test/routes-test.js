var should = require('should'),
  request = require('supertest'),
  config = require('config'),
  koop = require('koop-server')(config);

before(function (done) {
    //Cache.db = PostGIS.connect( config.db.postgis.conn );
    controller = require('../controller/index.js')( koop );
    try { koop.register(require("../index.js")); } catch(e){ console.log(e); }
    done();
});

describe('FeatureService Proxy Provider', function(){

     before(function(done){
      request(koop)
          .post('/agol/register')
          .set('Content-Type', 'application/json')
          .send({
            'host': 'http://arcgis.com',
            'id': 'tester'
          })
          .end(function(err, res){
            res.should.have.status(200);
            done();
      });
    });

    after(function(done){
      request(koop)
          .del('/agol/tester')
          .end(function(err, res){
            res.should.have.status(200);
            done();
      });
    });


    describe('/agol routes', function() {
      it('register should return 500 when POSTing w/o a host', function(done) {
        request(koop)
          .post('/agol/register')
          .set('Content-Type', 'application/json')
          .send({
            'id': 'tester2'
          })
          .end(function(err, res){
            res.should.have.status(500);
            done();
        });
      });

      it('register should return 200 when GETing all registered providers', function(done) {
        request(koop)
          .get('/agol')
          .end(function(err, res){
            res.should.have.status(200);
            done();
        });
      });

      it('should return 200 when GETing a registered provider', function(done) {
        request(koop)
          .get('/agol/tester')
          .end(function(err, res){
            res.should.have.status(200);
            done();
        });
      });

      it('should register and return 200 when accessing an item', function(done) {
          request(koop)
            .get('/agol/arcgis/af2d2aefeec745408e085da855c738f8')
            .end(function(err, res){
              res.should.have.status(200);
              done();
          });
      });

      it('should return 200 when accessing item data', function(done) {
          request(koop)
            .get('/agol/arcgis/af2d2aefeec745408e085da855c738f8/data')
            .end(function(err, res){
              res.should.have.status(200);
              done();
          });
      });

      it('should return 200 when accessing item as a featureservice', function(done) {
         request(koop)
            .get('/agol/arcgis/af2d2aefeec745408e085da855c738f8/FeatureServer')
            .end(function(err, res){
              res.should.have.status(200);
              done();
          });
      });

      it('should return 200 when accessing item as a featureservice layer', function(done) {
        request(koop)
            .get('/agol/arcgis/af2d2aefeec745408e085da855c738f8/FeatureServer/0/query')
            .end(function(err, res){
              res.should.have.status(200);
              done();
          });
      });

      it('should return 200 when accessing item as a featureservice query', function(done) {
        request(koop)
            .get('/agol/arcgis/af2d2aefeec745408e085da855c738f8/FeatureServer/0/query')
            .end(function(err, res){
              res.should.have.status(200);
              done();
          });
      });

     /* it('should return 200 when accessing item as a featureservice thumbnail', function(done) {
        request(koop)
            .get('/agol/arcgis/9f44b197ff9444559c46cb2994dd618d/FeatureServer/thumbnail')
            .end(function(err, res){
              res.should.have.status(200);
              done();
          });
      });*/

      it('should return 500 when accessing a deleted item', function(done) {
          request(koop)
            .get('/agol/arcgis/00017f5a4b854fb0b4e1a47888ca3dd6')
            .end(function(err, res){
              res.should.have.status(500);
              done();
          });
      });
  
      it('should return 500 when exporting an empty layer', function(done) {
          request(koop)
            .get('/agol/arcgis/000429f808ba404bb6b67e192170a5d7/data.csv')
            .end(function(err, res){
              res.should.have.status(400);
              done();
          });
      });

      it('should return 500 when a missing/unknown feature service layer', function(done) {
          request(koop)
            .get('/agol/arcgis/000915053fad47cfa0a2dca9d3d4e76a/100')
            .end(function(err, res){
              res.should.have.status(500);
              done();
          }); 
      });

      /*it('should return 200 when a when accessing a feature service w/more than 1000', function(done) {
          request(koop)
            .get('/agol/arcgis/5eb31a7a8a594396965d9965465321c9/1')
            .end(function(err, res){
              res.should.have.status(200);
              done();
          });
      });*/

/*      it('should return 404 when a when accessing a map service that doesnt exist', function(done) {
          request(koop)
            .get('/agol/arcgis/cc983c00c2614615bddf88a8e5337ac0/1')
            .end(function(err, res){
              res.should.have.status(500);
              done();
          });
      });
      it('should return 200 when a when accessing a map service item with a layer id in the url already', function(done) {
          request(koop)
            .get('/agol/arcgis/cc983c00c2614615bddf88a8e5337ac0/0')
            .end(function(err, res){
              res.should.have.status(200);
              done();
          });
      }); 
*/
    });

});
