var request = require('request'),
  async = require('async');

var AGOL = function(){

  // how to long to persist the cache of data 
  // after which data will be dropped and re-fetched
  this.cacheLife = (24*60*60*1000);  

  // adds a service to the Cache.db
  // needs a host, generates an id 
  this.register = function( id, host, callback ){
    var type = 'agol:services';
    //var id = (new Date()).getTime();
    Cache.db.services.count( type, function(error, count){
      id = id || count++;
      Cache.db.services.register( type, {'id': id, 'host': host},  function( err, success ){
        callback( err, id );
      });
    });
  };

  this.remove = function( id, callback ){
    Cache.db.services.remove( 'agol:services', parseInt(id) || id,  callback);
  }; 

  // get service by id, no id == return all
  this.find = function( id, callback ){
    Cache.db.services.get( 'agol:services', parseInt(id) || id, callback);
  };

  this.agol_path = '/sharing/rest/content/items/';

  // got the service and get the item
  this.dropItem = function( host, itemId, options, callback ){
    Cache.remove('agol', itemId, options, function(err, res){
      callback(err, res);
    });
  };

  // got the service and get the item
  this.getItem = function( host, itemId, options, callback ){
    var url = host + this.agol_path + itemId+'?f=json';
    request.get(url, function(err, data ){
      if (err) {
        callback(err, null);
      } else {
        try {
          var json = JSON.parse( data.body );
          if (json.error){
            callback( json.error.message, null );  
          } else{
            callback( null, json );
          }
        } catch (e){
          callback( 'Problem accessing the request host', null );
        }
      }
    });
  };

  // got the service and get the item
  this.getItemData = function( host, itemId, hash, options, callback ){
    var self = this;
    this.getItem(host, itemId, options, function( err, itemJson ){
      
      if ( err ){
        callback(err, null);
      } else {
        // put host in option so our cacheCheck has ref to it 
        options.host = host;

        var qKey = ['agol', itemId, (options.layer || 0)].join(':');

        Cache.getInfo( qKey, function(err, info){

          var is_expired = info ? ( new Date().getTime() >= info.expires_at ) : false;

          // check for infon on last edit date 
          // set is_expired to false if it hasnt changed
          if ( info && info.retrieved_at && info.info && info.info.editingInfo && info.info.editingInfo.lastEditDate ){
            if ( info.retrieved_at > info.info.editingInfo.lastEditDate ){
              is_expired = false;
            }
          }

          if ( is_expired ) {
            Cache.remove('agol', itemId, options, function(err, res){
              if ( itemJson.type == 'CSV' ){  
                self.getCSV( host + self.agol_path, itemId, itemJson, options, callback );
              } else if ( itemJson.type == 'Feature Collection' ){
                self.getFeatureCollection( host + self.agol_path, itemId, itemJson, options, callback );
              } else if ( itemJson.type == 'Feature Service' || itemJson.type == 'Map Service' ) {
                self.getFeatureService( itemId, itemJson, hash, options, callback );
              } else {
                callback('Requested Item must be a Feature Collection', null);
              }
            });
          } else {
            if ( itemJson.type == 'CSV' ){  
              self.getCSV( host + self.agol_path, itemId, itemJson, options, callback );
            } else if ( itemJson.type == 'Feature Collection' ){
              self.getFeatureCollection( host + self.agol_path, itemId, itemJson, options, callback );
            } else if ( itemJson.type == 'Feature Service' || itemJson.type == 'Map Service' ) {
              self.getFeatureService( itemId, itemJson, hash, options, callback );
            } else {
              callback('Requested Item must be a Feature Collection', null);
            }
          }
        });

      }
    });
  };

  this.getCSV = function(base_url, id, itemJson, options, callback){
    Cache.get( 'agol', id, options, function(err, entry ){
      if ( err ){
        var url = base_url + '/' + id + '/data?f=json';
        request.get(url, function(err, data ){
          if (err) {
            callback(err, null);
          } else {
            var csv = data.body.split(/\n/);
            GeoJSON.fromCSV( csv, function(err, geojson){
              Cache.insert( 'agol', id, geojson, (options.layer || 0), function( err, success){
                if ( success ) {
                  itemJson.data = [geojson];
                  callback( null, itemJson );
                } else {
                  callback( err, null );
                }
              });
            });
          }
        });
      } else {
        itemJson.data = entry;
        callback( null, itemJson );
      }
    });
  };

  this.getFeatureCollection = function(base_url, id, itemJson, options, callback){
    Cache.get( 'agol', id, options, function(err, entry ){
      if ( err ){
        var url = base_url + '/' + id + '/data?f=json'; 
        request.get(url, function(err, data ){
          if (err) {
            callback(err, null);
          } else {
            var json = JSON.parse( data.body ).featureCollection.layers[0].featureSet;
            GeoJSON.fromEsri( json, function(err, geojson){
              Cache.insert( 'agol', id, geojson, (options.layer || 0), function( err, success){
                if ( success ) {
                  itemJson.data = [geojson];
                  callback( null, itemJson );
                } else {
                  callback( err, null );
                }
              });
            });
          }
        });
      } else {
        itemJson.data = entry;
        callback( null, itemJson );
      }
    });
  };

  this.getFeatureService = function( id, itemJson, hash, options, callback){
    var self = this;
    if ( !itemJson.url ){
      callback( 'Missing url parameter for Feature Service Item', null );
    } else {

      Cache.get( 'agol', id, options, function(err, entry ){
        if ( err ){
          // no data in the cache; request new data 
          self.makeFeatureServiceRequest( id, itemJson, hash, options, callback );
 
        } else if ( entry && entry[0] && entry[0].status == 'processing' ){
          itemJson.data = [{features:[]}];
          itemJson.koop_status = 'processing';
          callback(null, itemJson);
        } else {
          itemJson.data = entry;
          callback( null, itemJson );
        }            
      });
    }
  };


  this.makeFeatureServiceRequest = function( id, itemJson, hash, options, callback ){
    var self = this;

    // check the last char on the url
    // protects us from urls registered with layers already in the url 
    if ( parseInt(itemJson.url.charAt( itemJson.url.length-1 )) >= 0 ){
      itemJson.url = itemJson.url.substring(0, itemJson.url.length - 2);
    }

    // get the ids only
    var idUrl = itemJson.url + '/' + (options.layer || 0) + '/query?where=1=1&returnIdsOnly=true&returnCountOnly=true&f=json';

    if (options.geometry){
      idUrl += '&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
    }
    //console.log('ID URL', idUrl);

    // get the id count of the service 
    request.get(idUrl, function(err, serviceIds ){
      // determine if its greater then 1000 
      try {
        var idJson = JSON.parse(serviceIds.body);
        if (idJson.error){
          callback( idJson.error.message + ': ' + idUrl, null );
        } else {
          console.log('COUNT', idJson.count, idJson.objectIds.length);
          var count = idJson.count || idJson.objectIds.length;

          // WHEN COUNT IS 0 - No Features 
          if (count == 0){

            // return empty geojson
            itemJson.data = [{type: 'FeatureCollection', features: []}];
            callback( null, itemJson );

          // Count is low 
          } else if ( count < 1000 ){
            self.singlePageFeatureService( id, itemJson, options, callback );
          // We HAVE to page 
          } else if ( count >= 1000 ){
            self.pageFeatureService( id, itemJson, count, hash, options, callback );
          } else {
            callback( 'Unable to count features, make sure the layer you requested exists', null );
          }
        }
      } catch (e) {
        callback( 'Unknown layer, make sure the layer you requested exists', null );
      }
    });
  };



  // make a request to a single page feature service 
  this.singlePageFeatureService = function( id, itemJson, options, callback ){
    var self = this;
    // get the featureservice info 
    this.getFeatureServiceLayerInfo(itemJson.url, ( options.layer || 0 ), function(err, serviceInfo){

      // we can the data in one shot
      var url = itemJson.url + '/' + (options.layer || 0) + '/query?outSR=4326&where=1=1&f=json&outFields=*';
      if (options.geometry){
        url += '&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
      }
      // get the features 
      request.get(url, function(err, data ){
        if (err) {
          callback(err, null);
        } else {
          try {
            var json = {features: JSON.parse( data.body ).features};
            // convert to GeoJSON 
            GeoJSON.fromEsri( json, function(err, geojson){

              geojson.name = itemJson.name;
              geojson.updated_at = itemJson.modified;
              geojson.expires_at = new Date().getTime() + self.cacheLife;
              geojson.info = serviceInfo;
              geojson.retrieved_at = new Date().getTime(); 

              // save the data 
              //console.log(JSON.stringify(geojson))
              Cache.insert( 'agol', id, geojson, (options.layer || 0), function( err, success){
                if ( success ) {
                  Cache.get( 'agol', id, options, function(err, entry ){
                    itemJson.data = entry;
                    callback( null, itemJson );
                  });
                } else {
                  callback( err, null );
                }
              });
            });
          } catch (e){
            callback( 'Unable to parse Feature Service response', null );
          }
        }
      });
    });
  };




  // handles pagin over the feature service 
  this.pageFeatureService = function( id, itemJson, count, hash, options, callback ){
    var self = this;    

    var _page = function( count, pageRequests, id, itemJson, layerId){
      self.requestQueue( count, pageRequests, id, itemJson, layerId, function(err,data){
        console.log('done');
        Tasker.taskQueue.push( {
          dir: id + '_' + layerId,
          hash: hash,
          key: ['agol', id].join(":"),
          options: options
        }, function(){});
      });
    };

    // get the featureservice info 
    this.getFeatureServiceLayerInfo(itemJson.url, ( options.layer || 0 ), function(err, serviceInfo){
      // sanitize any single quotes in the service description
      if (serviceInfo ) {
        if ( serviceInfo.description ) {
          serviceInfo.description = serviceInfo.description.replace(/'/g, '');
        }
        if ( serviceInfo.definitionExpression ){
          serviceInfo.definitionExpression = serviceInfo.definitionExpression.replace(/'/g, '');
        }
      }

      // creates the empty table
      Cache.remove('agol', id, {layer: (options.layer || 0)}, function(){

        var expiration = new Date().getTime() + self.cacheLife;

        var info = {
          status: 'processing',
          updated_at: itemJson.modified,
          expires_at: expiration,
          retrieved_at: new Date().getTime(), 
          name: itemJson.name,
          info: serviceInfo,
          features:[]
        };

        if ( options.format ){
          info.format = options.format;
        }

        
        Cache.insert( 'agol', id, info, ( options.layer || 0 ), function( err, success ){

          // return in a processing state, but continue on
          itemJson.data = [{ features:[] }];
          itemJson.koop_status = 'processing';
          itemJson.cache_save = false;
          itemJson.expires_at = expiration;
          callback(null, itemJson);

          var maxCount = parseInt(serviceInfo.maxRecordCount) || 1000,
            pageRequests;

          // build legit offset based page requests 
          if ( serviceInfo.advancedQueryCapabilities && serviceInfo.advancedQueryCapabilities.supportsPagination ){

            var nPages = Math.ceil(count / maxCount);
            pageRequests = self.buildOffsetPages( nPages, itemJson.url, maxCount, options );
            _page( count, pageRequests, id, itemJson, (options.layer || 0));

          } else if ( serviceInfo.supportsStatistics ) {
            // build where clause based pages 
            var statsUrl = self.buildStatsUrl( itemJson.url, ( options.layer || 0 ), serviceInfo.objectIdField );
            request.get( statsUrl, function( err, res ){
              var statsJson = JSON.parse(res.body);

              if ( statsJson.error ){
                // default to sequential objectID paging
                pageRequests = self.buildObjectIDPages(
                  itemJson.url,
                  0,
                  count,
                  maxCount,
                  options
                );
                _page( count, pageRequests, id, itemJson, (options.layer || 0));
              } else {
                  pageRequests = self.buildObjectIDPages(
                    itemJson.url,
                    statsJson.features[0].attributes.min,
                    statsJson.features[0].attributes.max,
                    maxCount,
                    options
                  );
                  _page( count, pageRequests, id, itemJson, (options.layer || 0));
              }
            });

          } else {
            if ( count < 50000 ){
              self.getFeatureServiceLayerIds(itemJson.url, (options.layer || 0), function(err, ids){
                pageRequests = self.buildIDPages(
                  itemJson.url,
                  ids,
                  250,
                  options
                );
                _page( count, pageRequests, id, itemJson, (options.layer || 0));
              });
            } else { 
            // default to sequential objectID paging
            pageRequests = self.buildObjectIDPages(
                itemJson.url,
                0,
                count,
                maxCount,
                options
            );
            _page( count, pageRequests, id, itemJson, (options.layer || 0));
            }
          }

        });
      });
    });

  };



  //build resultOffset based page requests 
  this.buildOffsetPages = function( pages, url, max, options ){
    var reqs = [], 
      resultOffset;
    for (var i=0; i < pages; i++){

      resultOffset = i*max; 
      var pageUrl = url + '/' + (options.layer || 0) + '/query?outSR=4326&f=json&outFields=*&where=1=1';
      pageUrl += '&resultOffset='+resultOffset;
      pageUrl += '&resultRecordCount='+max;

      if ( options.geometry ){
        pageUrl += '&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify( options.geometry );
      }
      reqs.push({req: pageUrl});
    }

    return reqs;
  };



  //build object id query based page requests 
  this.buildObjectIDPages = function( url, min, max, maxCount, options ){
    var reqs = [], 
      pageMax;

    var pages = ( max == maxCount ) ? max : Math.ceil(max / maxCount);

    for (i=1; i < pages+1; i++){
      pageMax = i*maxCount;
      where = 'objectId<=' + pageMax + '+AND+' + 'objectId>=' + ((pageMax-maxCount)+1);
      pageUrl = url + '/' + (options.layer || 0) + '/query?outSR=4326&where='+where+'&f=json&outFields=*';
      if ( options.geometry ){
        pageUrl += '&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
      }
      reqs.push({req: pageUrl});
    }

    return reqs;
  };

   //build object id query based page requests 
  this.buildIDPages = function( url, ids, maxCount, options ){
    var reqs = [],
      pageMax;

    var pages = (ids.length / maxCount);

    for (i=0; i < pages+1; i++){
      var pageIds = ids.splice(0, maxCount);
      if (pageIds.length){
        where = 'objectId in (' + pageIds.join(',') + ')';
        pageUrl = url + '/' + (options.layer || 0) + '/query?outSR=4326&where='+where+'&f=json&outFields=*';
        if ( options.geometry ){
          pageUrl += '&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
        }
        reqs.push({req: pageUrl});
      }
    }

    return reqs;
  };


  // make requests for feature pages 
  // execute done when we have all features 
  this.requestQueue = function(max, reqs, id, itemJson, layerId, done){
    var reqCount = 0;
    // setup the place to collect all the features
    itemJson.data = [ {features: []} ];
  
    // aggregate responses into one json and call done we have all of them 
    var _collect = function(json, cb){
      if ( json.error ){
        done( json.error.details[0], null);
      } else {

        reqCount++;

        // insert a partial
        GeoJSON.fromEsri( json, function(err, geojson){
          // concat the features so we return the full json
          itemJson.data[0].features = itemJson.data[0].features.concat( geojson.features );
          Cache.insertPartial( 'agol', id, geojson, layerId, function( err, success){
            cb();
            if (reqCount == reqs.length){
              // pass back the full array of features
              done(null, itemJson);
            }
          });
        });

      }
    };

    var i = 0
    // concurrent queue for feature pages 
    var q = async.queue(function (task, callback) {
      // make a request for a page 
      //console.log('get', task.req, i++);
      request.get(task.req, function(err, data){
        try {
          var json = JSON.parse(data.body.replace(/NaN/g, 'null'));
          _collect(json, callback);
        } catch(e){
          console.log('failed to parse json', task.req, e);
        }
      });
    }, 4);

    // add all the page urls to the queue 
    q.push(reqs, function(err){ if (err) console.log(err); });

  };

  // Gets the feature service info 
  this.getFeatureServiceLayerInfo = function( url, layer, callback ){
    request.get( url +'/'+ layer + '?f=json', function( err, res ){
      var json = JSON.parse( res.body );
      callback( err, json );
    });
  };

  // Gets the feature service object ids for pagination
  this.getFeatureServiceLayerIds = function( url, layer, callback ){
    request.get( url +'/'+ layer + '/query?where=1=1&returnIdsOnly=true&f=json', function( err, res ){
      var json = JSON.parse( res.body );
      callback( err, json.objectIds );
    });
  };

  // builds a url for querying the min/max values of the object id 
  this.buildStatsUrl = function( url, layer, field ){
    var json = [{"statisticType":"min","onStatisticField":field,"outStatisticFieldName":"min"},
      {"statisticType":"max","onStatisticField":field,"outStatisticFieldName":"max"}];
    return url+'/'+layer+'/query?f=json&outStatistics='+JSON.stringify(json);
  };


  // checks the age of the cache, if its older than 24 hours purges all known data 
  /*this.checkCache = function(id, data, options, callback){
    var self = this;
    var qKey = ['agol', id, (options.layer || 0)].join(':');

    Cache.getInfo( qKey, function(err, info){

      var is_expired = ( new Date().getTime() >= info.expires_at );
      console.log('is expired?', is_expired, new Date(), info.expires_at);

      if ( is_expired ) { 
        // get new data 
        Cache.remove('agol', id, options, function(err, res){
          self.getItemData( options.host, id, options, function(err, itemJson){
            callback(err, itemJson);
          });
        });
        
      } else {
        callback(err, is_expired);
      }
    });
  };*/

};
  

module.exports = new AGOL();
  
