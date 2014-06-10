var should = require('should'),
  sinon = require('sinon'),
  config = require('config'),
  koopserver = require('koop-server')(config);

var itemJson = require('./fixtures/itemJson.js');

global.config = config;

before(function(done){
  
  global.agol = require('../models/agol.js');
  Cache.db = PostGIS.connect( config.db.postgis.conn );
  done();
});

describe('AGOL Model', function(){

    describe('get / remove items', function() {
      before(function(done ){
        sinon.stub(Cache, 'remove', function(host, itemid, opts, callback){
          callback();
        });

        sinon.stub(agol, 'req', function(url, callback){
          callback(null, '');
        });
        done();
      });

      after(function(done){
        Cache.remove.restore();
        agol.req.restore();
        done();
      });

      //beforeEach(function(done){
      //  done();
      //});

      it('should call cache db remove on dropItem', function(done){
        agol.dropItem('host', 'itemid1', {}, function(){
          Cache.remove.called.should.equal(true);
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

        sinon.stub(Cache, 'getInfo', function(key, callback){
          // force an expiration
          itemInfo.expires_at = new Date().getTime() - 60000;
          callback(null, itemInfo);
        });

        sinon.stub(Cache, 'remove', function(host, itemid, opts, callback){
          callback();
        });

        done();
      });

      after(function(done){
        Cache.getInfo.restore();
        agol.getItem.restore();
        agol.getData.restore();
        Cache.remove.restore();
        done();
      });

      it('should remove the data from the cache before getting data', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          Cache.getInfo.called.should.equal(true);
          agol.getItem.called.should.equal(true);
          Cache.remove.called.should.equal(true);
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

        sinon.stub(Cache, 'getInfo', function(key, callback){
          itemInfo.expires_at = new Date().getTime() + 60000;
          callback(null, itemInfo);
        });

        sinon.stub(Cache, 'remove', function(host, itemid, opts, callback){
          callback();
        });

        done();
      });

      after(function(done){
        Cache.getInfo.restore();
        agol.getItem.restore();
        agol.getData.restore();
        Cache.remove.restore();
        done();
      });

      it('should not remove the data from the cache before getting data', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          Cache.getInfo.called.should.equal(true);
          agol.getItem.called.should.equal(true);
          Cache.remove.called.should.equal(false);
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

        sinon.stub(Cache, 'getInfo', function(key, callback){
          itemInfo.expires_at = new Date().getTime() + 60000;
          callback(null, itemInfo);
        });

        done();
      });

      after(function(done){
        Cache.getInfo.restore();
        agol.getItem.restore();
        agol.getFeatureService.restore();
        done();
      });

      it('should remove the data from the cache before getting data', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          Cache.getInfo.called.should.equal(true);
          agol.getItem.called.should.equal(true);
          agol.getFeatureService.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling getFeatureService w/o a url', function() {

      before(function(done ){

        sinon.stub(Cache, 'get', function(type, id, options, callback){
          callback(null, []);
        });

        done();
      });

      after(function(done){
        Cache.get.restore();
        done();
      });

      it('should call Cache.get', function(done){
        agol.getItemData('host', 'itemid1', 'dummyhash', {}, function(){
          Cache.get.called.should.equal(false);
          done();
        });
      });
    });

    describe('when calling getFeatureService wtih a url', function() {

      before(function(done ){

        sinon.stub(Cache, 'get', function(type, id, options, callback){
          callback(null, []);
        });

        done();
      });

      after(function(done){
        Cache.get.restore();
        done();
      });

      it('should call Cache.get', function(done){
        agol.getFeatureService('itemid', {url: 'dummyurl'}, 'dummyhash', {}, function(){
          Cache.get.called.should.equal(true);
          done();
        });
      });
    });


    describe('when calling getFeatureService wtih in a processing state', function() {
      before(function(done ){
        sinon.stub(Cache, 'get', function(type, id, options, callback){
          callback(null, [{status: 'processing'}]);
        });

        done();
      });

      after(function(done){
        Cache.get.restore();
        done();
      });

      it('should call Cache.get and reply with processing state', function(done){
        agol.getFeatureService('itemid', {url: 'dummyurl'}, 'dummyhash', {}, function(err, json){
          should.exist(json.koop_status);
          json.koop_status.should.equal('processing');
          should.exist(json.data);
          Cache.get.called.should.equal(true);
          done();
        });
      });
    }); 
   
    describe('when calling getFeatureService wtih too much data', function() {
      before(function(done ){
        sinon.stub(Cache, 'get', function(type, id, options, callback){
          callback(null, [{status: 'too big'}]);
        });

        done();
      });

      after(function(done){
        Cache.get.restore();
        done();
      });

      it('should call Cache.get can return with "too big"', function(done){
        agol.getFeatureService('itemid', {url: 'dummyurl'}, 'dummyhash', {}, function(err, json){
          should.exist(json.koop_status);
          json.koop_status.should.equal('too big');
          should.exist(json.data);
          Cache.get.called.should.equal(true);
          done();
        });
      });
    });

    describe('when calling getFeatureService with no data in the cache', function() {
      before(function(done ){
        sinon.stub(Cache, 'get', function(type, id, options, callback){
          callback(true, [{}]);
        });

        sinon.stub(agol, 'makeFeatureServiceRequest', function( id, itemJson, hash, options, callback ){
          callback(null, []);
        });

        done();
      });

      after(function(done){
        Cache.get.restore();
        agol.makeFeatureServiceRequest.restore();
        done();
      });

      it('should call Cache.get', function(done){
        agol.getFeatureService('itemid', {url: 'dummyurl'}, 'dummyhash', {}, function(err, json){
          Cache.get.called.should.equal(true);
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
          json.data[0].features.length.should.equal(0);
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
        sinon.stub(Cache, 'insert', function( type, id, geojson, layer, callback ){
          callback(null, true);
        });
        sinon.stub(Cache, 'get', function( type, id, geojson, layer, callback ){
          callback(null, []);
        });
        done();
      });

      after(function(done){
        Cache.get.restore();
        Cache.insert.restore();
        agol.req.restore();
        agol.getFeatureServiceLayerInfo.restore();
        done();
      });

      it('should call Cache.insert', function(done){
        agol.singlePageFeatureService('itemid', itemJson, {}, function(err, json){
          agol.getFeatureServiceLayerInfo.called.should.equal(true);
          Cache.insert.called.should.equal(true);
          Cache.get.called.should.equal(true);
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
        sinon.stub(Cache, 'insert', function( type, id, geojson, layer, callback ){
          callback(null, true);
        });
        sinon.stub(Cache, 'remove', function( type, id, layer, callback ){
          callback(null, true);
        });
        done();
      });

      after(function(done){
        Cache.insert.restore();
        Cache.remove.restore();
        agol.buildOffsetPages.restore();
        agol._page.restore();
        agol.getFeatureServiceLayerInfo.restore();
        done();
      });

      it('should call _page', function(done){ 
        agol.pageFeatureService('itemid', itemJson, 1001, 'dummyhash', {}, function(err, json){
          agol.getFeatureServiceLayerInfo.called.should.equal(true);
          Cache.insert.called.should.equal(true);
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
        sinon.stub(Cache, 'insert', function( type, id, geojson, layer, callback ){
          callback(null, true);
        });
        sinon.stub(Cache, 'remove', function( type, id, layer, callback ){
          callback(null, true);
        });
        done();
      });

      after(function(done){
        Cache.insert.restore();
        Cache.remove.restore();
        agol.buildIDPages.restore();
        agol._page.restore();
        agol.getFeatureServiceLayerInfo.restore();
        done();
      });

      it('should call _page and buildIDPages', function(done){
        agol.pageFeatureService('itemid', itemJson, 1001, 'dummyhash', {}, function(err, json){
          agol.getFeatureServiceLayerInfo.called.should.equal(true);
          Cache.insert.called.should.equal(true);
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
          callback(null, {body: JSON.stringify({features: [{attributes: {min:0, max: 1001}}]})});
        });
        sinon.stub(agol, 'getFeatureServiceLayerInfo', function( url, layer, callback ){
          serviceInfo.advancedQueryCapabilities = {supportsPagination:false};
          serviceInfo.supportsStatistics = true;
          callback(null, serviceInfo);
        });
        sinon.stub(Cache, 'insert', function( type, id, geojson, layer, callback ){
          callback(null, true);
        });
        sinon.stub(Cache, 'remove', function( type, id, layer, callback ){
          callback(null, true);
        });
        done();
      });

      after(function(done){
        Cache.insert.restore();
        Cache.remove.restore();
        agol.buildObjectIDPages.restore();
        agol._page.restore();
        agol.req.restore();
        agol.getFeatureServiceLayerInfo.restore();
        done();
      });

      it('should call _page', function(done){
        agol.pageFeatureService('itemid', itemJson, 1001, 'dummyhash', {}, function(err, json){
          agol.getFeatureServiceLayerInfo.called.should.equal(true);
          Cache.insert.called.should.equal(true);
          agol.buildObjectIDPages.called.should.equal(true);
          agol._page.called.should.equal(true);
          done();
        });
      });
    });
     

    describe('when building pages for requests', function() {
    
      /*it('should build offset based request pages', function(done){
        var url = 'http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer';
        var max = 1000;
        var pages = 4;
        var options = {layer:1};
        var reqs = agol.buildOffsetPages( pages, url, max, options);
        reqs.length.should.equal( 4 );
        reqs[0].req.should.equal( url+'/1/query?outSR=4326&f=json&outFields=*&where=1=1&resultOffset=0&resultRecordCount=1000' );
        reqs[1].req.should.equal( url+'/1/query?outSR=4326&f=json&outFields=*&where=1=1&resultOffset=1000&resultRecordCount=1000' );
        done();
      });*/

      /*it('should build where clause based request pages', function(done){
        var url = 'http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer';
        var maxCount = 1000;
        var min = 1;
        var max = 3143;
        var options = {layer:1};
        var reqs = agol.buildObjectIDPages( url, min, max, maxCount, options);
        reqs.length.should.equal( 4 );
        reqs[0].req.should.equal( url + '/1/query?outSR=4326&where=objectId<=1000+AND+objectId>=1&f=json&outFields=*' );
        reqs[1].req.should.equal( url + '/1/query?outSR=4326&where=objectId<=2000+AND+objectId>=1001&f=json&outFields=*' );
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
          geomType: 'MultiPolygon',
          features:[]
        };
        var reqs = agol.buildOffsetPages( pages, url, max, options );
        Cache.remove('agol', id, options, function(){
          Cache.insert( 'agol', id, info, 1, function( err, success ){
            agol.requestQueue( max, reqs, id, {}, 1, function(err, data){
              Cache.get('agol', id, options, function(err, entry){
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
        statUrl.should.equal('http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer/1/query?f=json&outStatistics=[{"statisticType":"min","onStatisticField":"OBJECTID","outStatisticFieldName":"min"},{"statisticType":"max","onStatisticField":"OBJECTID","outStatisticFieldName":"max"}]');
        done();
      });*/

    });

});

