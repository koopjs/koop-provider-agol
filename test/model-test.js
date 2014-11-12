var should = require('should'),
  sinon = require('sinon'),
  config = require('config'),
  fs = require('fs');
  koop = require('koop-server/lib');

var itemJson = require('./fixtures/itemJson.js');
var largeCSV = fs.readFileSync('./test/fixtures/largeCSV.csv').toString();

before(function(done){
  // setup koop
  config.data_dir = __dirname + '/output/';
  koop.config = config;
  koop.log = new koop.Logger({});

  koop.Cache = new koop.DataCache( koop ); 
  koop.Cache.db = koop.PostGIS.connect( config.db.postgis.conn );
  koop.Cache.db.log = koop.log;

  //koop.Cache.data_dir = config.data_dir;
  //koop.Tiles.data_dir = config.data_dir;
  //koop.Thumbnail.data_dir = config.data_dir;
  // Need the exporter to have access to the cache so we pass it Koop
  koop.exporter = new koop.Exporter( koop );
  koop.files = new koop.Files( koop );
  agol = new require('../models/agol.js')( koop );
  done();
});

describe('AGOL Model', function(){

    describe('get / remove items', function() {
      before(function(done ){
        sinon.stub(koop.Cache, 'remove', function(host, itemid, opts, callback){
          callback();
        });

        sinon.stub(agol, 'req', function(url, callback){
          callback(null, '');
        });
        done();
      });

      after(function(done){
        koop.Cache.remove.restore();
        agol.req.restore();
        done();
      });

      //beforeEach(function(done){
      //  done();
      //});

      it('should call cache db remove on dropItem', function(done){
        agol.dropItem('host', 'itemid1', {}, function(){
          koop.Cache.remove.called.should.equal(true);
          done();
        });
      });

      it('should attempt to request the item from the host', function(done){
        agol.getItem('host', 'itemid1', {}, function(){
          agol.req.called.should.equal(true);
          done();
        });
      });
    });
   
    describe('when getting a an expired feature service item', function() {

      before(function(done ){
        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItem', function(host, itemId, options, callback){
          callback(null, itemJson);
        });
    
        sinon.stub(agol, 'getData', function(type, host, itemId, hash, options, callback){
          callback(null, itemJson);
        });

        sinon.stub(koop.Cache, 'getInfo', function(key, callback){
          // force an expiration
          itemInfo.expires_at = new Date().getTime() - 60000;
          callback(null, itemInfo);
        });

        sinon.stub(koop.Cache, 'remove', function(host, itemid, opts, callback){
          callback();
        });

        done();
      });

      after(function(done){
        koop.Cache.getInfo.restore();
        agol.getItem.restore();
        agol.getData.restore();
        koop.Cache.remove.restore();
        done();
      });

      it('should remove the data from the cache before getting data', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          koop.Cache.getInfo.called.should.equal(true);
          agol.getItem.called.should.equal(true);
          koop.Cache.remove.called.should.equal(true);
          agol.getData.called.should.equal(true);
          done();
        });
      });
    });


    describe('when getting a feature service item', function() {

      before(function(done ){
        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItem', function(host, itemId, options, callback){
          callback(null, itemJson);
        });

        sinon.stub(agol, 'getData', function(type, host, itemId, hash, options, callback){
          callback(null, itemJson);
        });

        sinon.stub(koop.Cache, 'getInfo', function(key, callback){
          itemInfo.expires_at = new Date().getTime() + 60000;
          callback(null, itemInfo);
        });

        sinon.stub(koop.Cache, 'remove', function(host, itemid, opts, callback){
          callback();
        });

        done();
      });

      after(function(done){
        koop.Cache.getInfo.restore();
        agol.getItem.restore();
        agol.getData.restore();
        koop.Cache.remove.restore();
        done();
      });

      it('should not remove the data from the cache before getting data', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          koop.Cache.getInfo.called.should.equal(true);
          agol.getItem.called.should.equal(true);
          koop.Cache.remove.called.should.equal(false);
          agol.getData.called.should.equal(true);
          done();
        });
      });
    });


    describe('when getting a feature service item', function() {

      before(function(done ){
        var itemInfo = require('./fixtures/itemInfo.js');

        sinon.stub(agol, 'getItem', function(host, itemId, options, callback){
          callback(null, itemJson);
        });

        sinon.stub(agol, 'getFeatureService', function( itemId, itemJson, hash, options, callback ){
          callback(null, itemInfo);
        });

        sinon.stub(koop.Cache, 'getInfo', function(key, callback){
          itemInfo.expires_at = new Date().getTime() + 60000;
          callback(null, itemInfo);
        });

        done();
      });

      after(function(done){
        koop.Cache.getInfo.restore();
        agol.getItem.restore();
        agol.getFeatureService.restore();
        done();
      });

      it('should remove the data from the cache before getting data', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          koop.Cache.getInfo.called.should.equal(true);
          agol.getItem.called.should.equal(true);
          agol.getFeatureService.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling getFeatureService w/o a url', function() {

      before(function(done ){

        sinon.stub(koop.Cache, 'get', function(type, id, options, callback){
          callback(null, []);
        });

        done();
      });

      after(function(done){
        koop.Cache.get.restore();
        done();
      });

      it('should call Cache.get', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          koop.Cache.get.called.should.equal(false);
          done();
        });
      });
    });

    describe('when calling getFeatureService wtih a url', function() {

      before(function(done ){

        sinon.stub(koop.Cache, 'get', function(type, id, options, callback){
          callback(null, []);
        });

        done();
      });

      after(function(done){
        koop.Cache.get.restore();
        done();
      });

      it('should call Cache.get', function(done){
        agol.getFeatureService('itemid', {url: 'dummyurl'}, 'dummyhash', {}, function(){
          koop.Cache.get.called.should.equal(true);
          done();
        });
      });
    });


    describe('when calling getFeatureService wtih in a processing state', function() {
      before(function(done ){
        sinon.stub(koop.Cache, 'get', function(type, id, options, callback){
          callback(null, [{status: 'processing'}]);
        });

        done();
      });

      after(function(done){
        koop.Cache.get.restore();
        done();
      });

      it('should call Cache.get and reply with processing state', function(done){
        agol.getFeatureService('itemid', {url: 'dummyurl'}, 'dummyhash', {}, function(err, json){
          should.exist(json.koop_status);
          json.koop_status.should.equal('processing');
          should.exist(json.data);
          koop.Cache.get.called.should.equal(true);
          done();
        });
      });
    }); 
   
    describe('when calling getFeatureService wtih too much data', function() {
      before(function(done ){
        sinon.stub(koop.Cache, 'get', function(type, id, options, callback){
          callback(null, [{status: 'too big'}]);
        });

        done();
      });

      after(function(done){
        koop.Cache.get.restore();
        done();
      });

      it('should call Cache.get can return with "too big"', function(done){
        agol.getFeatureService('itemid', {url: 'dummyurl'}, 'dummyhash', {}, function(err, json){
          should.exist(json.data[0].status);
          should.exist(json.data);
          koop.Cache.get.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling getFeatureService with no data in the cache', function() {
      before(function(done ){
        sinon.stub(koop.Cache, 'get', function(type, id, options, callback){
          callback(true, [{}]);
        });

        sinon.stub(agol, 'makeFeatureServiceRequest', function( id, itemJson, hash, options, callback ){
          callback(null, []);
        });

        done();
      });

      after(function(done){
        koop.Cache.get.restore();
        agol.makeFeatureServiceRequest.restore();
        done();
      });

      it('should call Cache.get', function(done){
        agol.getFeatureService('itemid', {url: 'dummyurl'}, 'dummyhash', {}, function(err, json){
          koop.Cache.get.called.should.equal(true);
          agol.makeFeatureServiceRequest.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling makeFeatureServiceRequest with 0 features', function() {
      before(function(done ){
        sinon.stub(agol, 'req', function( url, callback ){
          callback(null, {body: '{"count":0}' });
        });
        done();
      });

      after(function(done){
        agol.req.restore();
        done();
      });

      it('should call Cache.get', function(done){
        agol.makeFeatureServiceRequest('itemid', itemJson, 'dummyhash', {}, function(err, json){
          should.exist(err);
          //json.data[0].features.length.should.equal(0);
          done();
        });
      });
    });


    describe('when calling makeFeatureServiceRequest with less than 1000 features', function() {
      before(function(done ){
        sinon.stub(agol, 'req', function( url, callback ){
          callback(null, {body: '{"count":100}' });
        });
        sinon.stub(agol, 'singlePageFeatureService', function( id, itemJson, options, callback ){
          callback(null, {});
        });
        done();
      });

      after(function(done){
        agol.req.restore();
        agol.singlePageFeatureService.restore();
        done();
      });

      it('should call singlePageFeatureService', function(done){
        agol.makeFeatureServiceRequest('itemid', itemJson, 'dummyhash', {}, function(err, json){
          agol.singlePageFeatureService.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling makeFeatureServiceRequest with less than 1000 features', function() {
      before(function(done ){
        sinon.stub(agol, 'req', function( url, callback ){
          callback(null, {body: '{"count":1001}' });
        });
        sinon.stub(agol, 'pageFeatureService', function( id, itemJson, options, callback ){
          callback(null, {});
        });
        done();
      });

      after(function(done){
        agol.req.restore();
        agol.pageFeatureService.restore();
        done();
      });

      it('should call pageFeatureService', function(done){
        agol.makeFeatureServiceRequest('itemid', itemJson, 'dummyhash', {}, function(err, json){
          agol.pageFeatureService.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling singlePageFeatureService', function() {
      before(function(done ){
        var serviceInfo = require('./fixtures/serviceInfo.js');
        var features = require('./fixtures/esriJson.js');
        sinon.stub(agol, 'req', function( url, callback ){
          callback(null, {body: JSON.stringify(features) });
        });
        sinon.stub(agol, 'getFeatureServiceLayerInfo', function( url, layer, callback ){
          callback(null, serviceInfo);
        });
        sinon.stub(koop.Cache, 'insert', function( type, id, geojson, layer, callback ){
          callback(null, true);
        });
        sinon.stub(koop.Cache, 'get', function( type, id, geojson, layer, callback ){
          callback(null, []);
        });
        done();
      });

      after(function(done){
        koop.Cache.get.restore();
        koop.Cache.insert.restore();
        agol.req.restore();
        agol.getFeatureServiceLayerInfo.restore();
        done();
      });

      it('should call Cache.insert', function(done){
        agol.singlePageFeatureService('itemid', itemJson, {}, function(err, json){
          agol.getFeatureServiceLayerInfo.called.should.equal(true);
          koop.Cache.insert.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling pageFeatureService', function() {
      before(function( done ){
        var serviceInfo = require('./fixtures/serviceInfo.js');
        var features = require('./fixtures/esriJson.js');

        sinon.stub(agol, 'buildOffsetPages');

        sinon.stub(agol, '_page', function(count, pageRequests, id, itemJson, layerId){
          
        });
        sinon.stub(agol, 'getFeatureServiceLayerInfo', function( url, layer, callback ){
          serviceInfo.advancedQueryCapabilities = {supportsPagination:true};
          callback(null, serviceInfo);
        });
        sinon.stub(koop.Cache, 'insert', function( type, id, geojson, layer, callback ){
          callback(null, true);
        });
        sinon.stub(koop.Cache, 'remove', function( type, id, layer, callback ){
          callback(null, true);
        });
        done();
      });

      after(function(done){
        koop.Cache.insert.restore();
        koop.Cache.remove.restore();
        agol.buildOffsetPages.restore();
        agol._page.restore();
        agol.getFeatureServiceLayerInfo.restore();
        done();
      });

      it('should call _page', function(done){ 
        agol.pageFeatureService('itemid', itemJson, 1001, 'dummyhash', {}, function(err, json){
          agol.getFeatureServiceLayerInfo.called.should.equal(true);
          koop.Cache.insert.called.should.equal(true);
          agol.buildOffsetPages.called.should.equal(true);
          agol._page.called.should.equal(true);
          done();
        });
      });
    });


    describe('when calling pageFeatureService w/o statistics', function() {
      before(function( done ){
        var serviceInfo = require('./fixtures/serviceInfo.js');
        var features = require('./fixtures/esriJson.js');

        sinon.stub(agol, 'buildIDPages');

        sinon.stub(agol, '_page', function(count, pageRequests, id, itemJson, layerId){

        });
        sinon.stub(agol, 'getFeatureServiceLayerInfo', function( url, layer, callback ){
          serviceInfo.advancedQueryCapabilities = {supportsPagination:false};
          serviceInfo.supportsStatistics = false;
          callback(null, serviceInfo);
        });

        sinon.stub(agol, 'getFeatureServiceLayerIds', function( url, layer, callback ){
          callback(null, [1,2,3]);
        });
        sinon.stub(koop.Cache, 'insert', function( type, id, geojson, layer, callback ){
          callback(null, true);
        });
        sinon.stub(koop.Cache, 'remove', function( type, id, layer, callback ){
          callback(null, true);
        });
        done();
      });

      after(function(done){
        koop.Cache.insert.restore();
        koop.Cache.remove.restore();
        agol.buildIDPages.restore();
        agol._page.restore();
        agol.getFeatureServiceLayerInfo.restore();
        done();
      });

      it('should call _page and buildIDPages', function(done){
        agol.pageFeatureService('itemid', itemJson, 1001, 'dummyhash', {}, function(err, json){
          agol.getFeatureServiceLayerInfo.called.should.equal(true);
          koop.Cache.insert.called.should.equal(true);
          agol.buildIDPages.called.should.equal(true);
          agol._page.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling pageFeatureService w/statistics', function() {
      before(function( done ){
        var serviceInfo = require('./fixtures/serviceInfo.js');
        var features = require('./fixtures/esriJson.js');

        sinon.stub(agol, 'buildObjectIDPages');

        sinon.stub(agol, '_page', function(count, pageRequests, id, itemJson, layerId){

        });

        sinon.stub(agol, 'req', function(url, callback){
          callback(null, {body: JSON.stringify({features: [{attributes: {min_oid:1, max_oid: 1001}}]})});
        });
        sinon.stub(agol, 'getFeatureServiceLayerInfo', function( url, layer, callback ){
          serviceInfo.advancedQueryCapabilities = {supportsPagination:false};
          serviceInfo.supportsStatistics = true;
          callback(null, serviceInfo);
        });
        sinon.stub(koop.Cache, 'insert', function( type, id, geojson, layer, callback ){
          callback(null, true);
        });
        sinon.stub(koop.Cache, 'remove', function( type, id, layer, callback ){
          callback(null, true);
        });
        done();
      });

      after(function(done){
        koop.Cache.insert.restore();
        koop.Cache.remove.restore();
        agol.buildObjectIDPages.restore();
        agol._page.restore();
        agol.req.restore();
        agol.getFeatureServiceLayerInfo.restore();
        done();
      });

      it('should call _page', function(done){
        agol.pageFeatureService('itemid', itemJson, 1001, 'dummyhash', {}, function(err, json){
          agol.getFeatureServiceLayerInfo.called.should.equal(true);
          koop.Cache.insert.called.should.equal(true);
          agol.buildObjectIDPages.called.should.equal(true);
          agol._page.called.should.equal(true);
          done();
        });
      });
    });
     

    describe('when building pages for requests', function() {
    
      it('should build offset based request pages', function(done){
        var url = 'http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer';
        var max = 1000;
        var pages = 4;
        var options = {layer:1};
        var reqs = agol.buildOffsetPages( pages, url, max, options);
        reqs.length.should.equal( 4 );
        reqs[0].req.should.equal( url+'/1/query?outSR=4326&f=json&outFields=*&where=1=1&resultOffset=0&resultRecordCount=1000&geometry=&returnGeometry=true' );
        reqs[1].req.should.equal( url+'/1/query?outSR=4326&f=json&outFields=*&where=1=1&resultOffset=1000&resultRecordCount=1000&geometry=&returnGeometry=true' );
        done();
      });

      it('should build where clause based request pages', function(done){
        var url = 'http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer';
        var maxCount = 1000;
        var min = 1;
        var max = 3143;
        var options = {layer:1};
        var reqs = agol.buildObjectIDPages( url, min, max, maxCount, options);
        reqs.length.should.equal( 4 );
        reqs[0].req.should.equal( url + '/1/query?outSR=4326&where=objectId<=1000+AND+objectId>=1&f=json&outFields=*&geometry=&returnGeometry=true' );
        reqs[1].req.should.equal( url + '/1/query?outSR=4326&where=objectId<=2000+AND+objectId>=1001&f=json&outFields=*&geometry=&returnGeometry=true' );
        done();
      });

      it('should request all features for an array of pages', function(done){
        var url = 'http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer';
        var max = 1000;
        var pages = 4;
        var options = {layer:1};
        var id = '123test';  
        var info = {
          updated_at: null,
          name: 'Test Dataset',
          geomType: 'Polygon',
          geometryType: 'esriGeometryPolygon',
          features:[]
        };
        var reqs = agol.buildOffsetPages( pages, url, max, options );
        koop.Cache.remove('agol', id, options, function(){
          koop.Cache.insert( 'agol', id, info, 1, function( err, success ){
            agol.requestQueue( max, reqs, id, {}, 1, {}, function(err, data){
              koop.Cache.get('agol', id, options, function(err, entry){
                entry[0].features.length.should.equal(3143);
                done();
              });
            });
          });
        });
      });

      it('should build a correct stats url', function(done){
        var url = 'http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer';
        var statUrl = agol.buildStatsUrl( url, 1, 'OBJECTID');
        statUrl.should.equal('http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer/1/query?f=json&outFields=&outStatistics=[{"statisticType":"min","onStatisticField":"OBJECTID","outStatisticFieldName":"min_oid"},{"statisticType":"max","onStatisticField":"OBJECTID","outStatisticFieldName":"max_oid"}]');
        done();
      });

    });

    describe('when getting a csv item', function() {

      before(function(done ){
        var itemInfo = require('./fixtures/itemInfo.js');
        itemInfo.type = 'CSV';
        sinon.stub(agol, 'getItem', function(host, itemId, options, callback){
          itemJson.type = 'CSV';
          callback(null, itemJson);
        });
        sinon.stub(agol, 'getCSV', function( base_url, id, itemJson, options, callback ){
          callback(null, itemInfo);
        });
        sinon.stub(koop.Cache, 'getInfo', function(key, callback){
          itemInfo.expires_at = new Date().getTime() + 60000;
          callback(null, itemInfo);
        });
        done();
      });

      after(function(done){
        koop.Cache.getInfo.restore();
        agol.getItem.restore();
        agol.getCSV.restore();
        done();
      });

      it('should call getCSV', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          koop.Cache.getInfo.called.should.equal(true);
          agol.getItem.called.should.equal(true);
          agol.getCSV.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling getCSV', function() {

      before(function(done ){
        sinon.stub(agol, 'req', function( base_url, callback ){
          callback(null, {body: '"id","lat","lon"\n"1","40.1","-105.5"'});
        });
        sinon.stub(koop.Cache, 'get', function(type, id, options, callback){
          callback('Error', null);
        });
        sinon.stub(koop.Cache, 'insert', function(type, id, data, options, callback){
          callback(null, true);
        });
        sinon.stub(koop.Cache, 'insertPartial', function(type, id, data, options, callback){
          callback(null, true);
        });
         sinon.stub(koop.GeoJSON, 'fromCSV', function( data, callback){
          callback(null, {});
        });
        done();
      });

      after(function(done){
        koop.Cache.get.restore();
        koop.Cache.insert.restore();
        koop.Cache.insertPartial.restore();
        agol.req.restore();
        koop.GeoJSON.fromCSV.restore();
        done();
      });

      it('should call cache.get and cache.insert, and should return GeoJSON', function(done){
        agol.getCSV('base-url', 'itemid1', {}, {}, function(err, data){
          //koop.Cache.get.called.should.equal(true);
          //agol.req.called.should.equal(true);
          //Cache.insert.called.should.equal(true);
          //Cache.insertPartial.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling getCSV with large data', function() {

      before(function(done ){
        sinon.stub(agol, 'req', function( base_url, callback ){
          callback(null, {body: largeCSV});
        });
        sinon.stub(koop.Cache, 'get', function(type, id, options, callback){
          callback(null, {info:{status: 'too big'}});
        });
        done();
      });

      after(function(done){
        koop.Cache.get.restore();
        agol.req.restore();
        done();
      });

      
      it('should call cache.get and cache.insert, and should return GeoJSON', function(done){
        agol.getCSV('base-url', 'itemid1', {}, {}, function(err, entry){
          entry.data.info.status.should.equal('too big');
          koop.Cache.get.called.should.equal(true);
          //agol.req.called.should.equal(true);
          //koop.Cache.insert.called.should.equal(true);
          done();
        });
      });
    });


});

