var should = require('should'),
  config = require('config'),
  koopserver = require('koop-server')(config);

global.config = config;

before(function (done) {
  global.agol = require('../models/agol.js');
  done();
});

describe('AGOL Model', function(){

    afterEach(function(done){
      done();
    });

    describe('model methods', function() {
      before(function(done ){
        Cache.db = PostGIS.connect( config.db.postgis.conn );
        done();
      });

      afterEach(function(done){
          done();
      });
    
      it('should build offset based request pages', function(done){
        var url = 'http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer';
        var max = 1000;
        var pages = 4;
        var options = {layer:1};
        var reqs = agol.buildOffsetPages( pages, url, max, options);
        reqs.length.should.equal( 4 );
        reqs[0].req.should.equal( url+'/1/query?outSR=4326&f=json&outFields=*&where=1=1&resultOffset=0&resultRecordCount=1000' );
        reqs[1].req.should.equal( url+'/1/query?outSR=4326&f=json&outFields=*&where=1=1&resultOffset=1000&resultRecordCount=1000' );
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
          geomType: 'Polygon',
          features:[]
        };
        var reqs = agol.buildOffsetPages( pages, url, max, options );
        Cache.remove('agol', id, options, function(){
          Cache.insert( 'agol', id, info, 1, function( err, success ){
            agol.requestQueue( max, reqs, id, {}, 1, function(err, data){
              data.data[0].features.length.should.equal(3143);
              done();
            });
          });
        });
      });

      it('should build a correct stats url', function(done){
        var url = 'http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer';
        var statUrl = agol.buildStatsUrl( url, 1, 'OBJECTID');
        statUrl.should.equal('http://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/US_Geographies/FeatureServer/1/query?f=json&outStatistics=[{"statisticType":"min","onStatisticField":"OBJECTID","outStatisticFieldName":"min"},{"statisticType":"max","onStatisticField":"OBJECTID","outStatisticFieldName":"max"}]');
        done();
      });

    });

});

