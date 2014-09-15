var request = require('request'),
  csv = require('csv'),
  async = require('async');

var AGOL = function(){

  // how to long to persist the cache of data 
  // after which data will be dropped and re-fetched
  this.cacheLife = (24*60*60*1000);  

  // adds a service to the Cache.db
  // needs a host, generates an id 
  this.register = function( id, host, callback ){
    var type = 'agol:services';
    Cache.db.services.count( type, function(error, count){
      id = id || count++;
      Cache.db.services.register( type, {'id': id, 'host': host},  function( err, success ){
        callback( err, id );
      });
    });
  };

  // removes the registered host from the list of hosts
  this.remove = function( id, callback ){
    Cache.db.services.remove( 'agol:services', parseInt(id) || id,  callback);
  }; 


  // get service by id, no id == return all
  this.find = function( id, callback ){
    Cache.db.services.get( 'agol:services', parseInt(id) || id, callback);
  };

  // Centralized request method 
  // all ajax requests should use this so it can be tested 
  this.req = function(url, callback){
    request({
        url: url, 
        headers: { 'User-Agent': 'esri-koop' }
      }, callback);
  };

  // base path to use for every host 
  this.agol_path = '/sharing/rest/content/items/';

  // drops the item from the cache
  this.dropItem = function( host, itemId, options, callback ){
    Cache.removeAll('agol', itemId, options, function(err, res){
      callback(err, res);
    });
  };

  // got the service and get the item
  this.getItem = function( host, itemId, options, callback ){
    var url = host + this.agol_path + itemId+'?f=json';
    this.req(url, function(err, data ){
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

          var is_expired = info ? ( Date.now() >= info.expires_at ) : false;

          // check for infon on last edit date 
          // set is_expired to false if it hasnt changed
          if ( info && info.retrieved_at && info.info && info.info.editingInfo ) { 
            if ( !info.info.editingInfo.lastEditDate || ( info.retrieved_at > info.info.editingInfo.lastEditDate )){
              is_expired = false;
            }
          }

          if ( is_expired ) {
            Cache.remove('agol', itemId, options, function(err, res){
              self.getData(itemJson, host, itemId, hash, options, callback);
            });
          } else {
            self.getData(itemJson, host, itemId, hash, options, callback);
          }
        });

      }
    });
  };

  this.getServiceLayerData = function( host, itemId, hash, options, callback ){
    var self = this;
    var reqCount = 0, nlayers, serviceInfo, serviceUrl;
    var qKey = ['agol', itemId, 'all'].join(':');

    var _collect = function(layerInfo, cb){
      serviceInfo.layerInfo.push(layerInfo);
      if ( reqCount++ == nlayers){
        Cache.insert( 'agol', itemId, { features: [], info: serviceInfo }, 'all', function( err, success){
          if ( success ) {
            callback(null, serviceInfo);
          } else {
            callback( err, null );
          }
        });
      }
      cb();
    };

    var q = async.queue(function(task, cb){
      request.get(task.url +'/'+ task.layer.id + '?f=json', function(err, res){
        lyrInfo = JSON.parse(res.body);
        _collect(lyrInfo, cb);
      });
    },4);

    Cache.getInfo( qKey, function(err, info){
      // if we have it send that back
      if (!err && info){
        callback(null, info.info);
      } else {
        self.getItem(host, itemId, options, function( err, itemJson ){
          // collect all layers info
          self.req( itemJson.url + '?f=json', function( err, data ){
            serviceInfo = JSON.parse( data.body );
            serviceInfo.layerInfo = [];
            nlayers = serviceInfo.layers.length - 1;

            serviceInfo.layers.forEach(function(layer, i){
              q.push({ layer: layer, url: itemJson.url }, function(){});
            });
          });
        });
      }

    });
  };

  this.getData = function(itemJson, host, itemId, hash, options, callback){
    if ( itemJson.type == 'CSV' ){
      this.getCSV( host + this.agol_path, itemId, itemJson, options, callback );
    } else if ( itemJson.type == 'Feature Collection' ){
      this.getFeatureCollection( host + this.agol_path, itemId, itemJson, options, callback );
    } else if ( itemJson.type == 'Feature Service' || itemJson.type == 'Map Service' ) {
      this.getFeatureService( itemId, itemJson, hash, options, callback );
    } else {
      callback('Requested Item must be a Feature Collection', null);
    }
  };

  this.getCSV = function(base_url, id, itemJson, options, callback){
    var self = this;
    Cache.get( 'agol', id, options, function(err, entry ){
      if ( err ){
        var url = base_url + '/' + id + '/data?f=json';
        self.req(url, function(err, data ){
          if (err) {
            callback(err, null);
          } else {
            csv.parse( data.body, function(err, csv_data){
              GeoJSON.fromCSV( csv_data, function(err, geojson){
                 // store metadata with the data 
                 geojson.name = itemJson.name || itemJson.title;
                 geojson.updated_at = itemJson.modified;
                 geojson.expires_at = Date.now() + self.cacheLife;
                 geojson.retrieved_at = Date.now();
                 geojson.info = {name:itemJson.name};

                 Cache.insert( 'agol', id, geojson, (options.layer || 0), function( err, success){
                  if ( success ) {
                    itemJson.data = [geojson];
                    callback( null, itemJson );
                  } else {
                    callback( err, null );
                  }
                });
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
            GeoJSON.fromEsri( [], json, function(err, geojson){
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
          itemJson.data = [{
            features:[],
            name: itemJson.name,
            geomType: self.geomTypes[itemJson.geometryType],
            info: itemJson.info
          }];
          itemJson.koop_status = 'processing';
          callback(null, itemJson);
        } else if ( entry && entry[0] && entry[0].status == 'too big'){
          itemJson.data = entry;
          itemJson.koop_status = 'too big';
          callback(null, itemJson);
        } else {
          itemJson.data = entry;
          callback( null, itemJson );
        }            
      });
    }
  };

  // removes the layer from the end of a url 
  this.stripLayerOffUrl = function(url){
    return url.substring(0, url.length - 2);
  };


  // makes a request to the feature service 
  // checks the count and determines if koop should make one or many requests  
  this.makeFeatureServiceRequest = function( id, itemJson, hash, options, callback ){
    var self = this;

    // check the last char on the url
    // protects us from urls registered with layers already in the url 
    if ( parseInt(itemJson.url.charAt( itemJson.url.length-1 )) >= 0 ){
      itemJson.url = self.stripLayerOffUrl( itemJson.url );
    }


    // get the ids only
    var idUrl = itemJson.url + '/' + (options.layer || 0) + '/query?where=1=1&returnIdsOnly=true&returnCountOnly=true&f=json';

    if (options.geometry){
      idUrl += '&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
    }


    // get the id count of the service 
    this.req(idUrl, function(err, data ){
      // determine if its greater then 1000
      try {
        var idJson = JSON.parse(data.body);
        if (idJson.error){
          callback( idJson.error.message + ': ' + idUrl, null );
        } else {
          var count = idJson.count;
          if (!count && idJson.objectIds && idJson.objectIds.length ){
            count = idJson.objectIds.length;
          }

          console.log('Count', count);

          // WHEN COUNT IS 0 - No Features 
          if (count === 0){

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
      if ( err ){
        callback(err, null);
      } else {

        // we can the data in one shot
        var url = itemJson.url + '/' + (options.layer || 0) + '/query?outSR=4326&where=1=1&f=json&outFields=*';
        if (options.geometry){
          url += '&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
        } else {
          url += '&geometry=&returnGeometry=true';
        }
        // get the features
        self.req(url, function(err, data ){
          if (err) {
            callback(err, null);
          } else {
            try {
              // have to replace asterrisks for bad coord values from agol
              data.body = data.body.replace(/\*+/g,'null');
              data.body = data.body.replace(/\.null/g, '')
              var json = {features: JSON.parse( data.body ).features};
              // convert to GeoJSON 
              GeoJSON.fromEsri( serviceInfo.fields, json, function(err, geojson){

                console.log('GeoJSon', geojson.features.length);
          
                geojson.name = itemJson.name || itemJson.title;
                geojson.updated_at = itemJson.modified;
                geojson.expires_at = Date.now() + self.cacheLife;
                geojson.info = serviceInfo;
                geojson.retrieved_at = Date.now(); 

                // save the data 
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
              console.log(e, url);
              callback( 'Unable to parse Feature Service response', null );
            }
          }
        });
      }
    });
  };


  this._page = function( count, pageRequests, id, itemJson, layerId, options, hash){
    this.requestQueue( count, pageRequests, id, itemJson, layerId, options, function(err,data){
      Tasker.taskQueue.push( {
        id: id,
        type: 'agol',
        hash: hash,
        options: options,
        geomType: options.geomType
      }, function(){});
    });
  };


  // handles pagin over the feature service 
  this.pageFeatureService = function( id, itemJson, count, hash, options, callback ){
    var self = this;    
    var geomType;

    // set the name in options
    if ( itemJson.name || itemJson.title && !options.name ){
      options.name = itemJson.name || itemJson.title;
    }

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
        // set the geom type 
        options.geomType = serviceInfo.geometryType; 
        options.fields = serviceInfo.fields;    
      }
          
      options.objectIdField = self.getObjectIDField(serviceInfo);

      // creates the empty table
      Cache.remove('agol', id, {layer: (options.layer || 0)}, function(){

        var expiration = Date.now() + self.cacheLife;

        var info = {
          status: 'processing',
          updated_at: itemJson.modified,
          expires_at: expiration,
          retrieved_at: Date.now(), 
          name: itemJson.name,
          geomType: self.geomTypes[itemJson.geometryType],
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

          var maxCount = 1000, //parseInt(serviceInfo.maxRecordCount) || 1000,
            pageRequests;
          

          // build legit offset based page requests 
          if ( serviceInfo.advancedQueryCapabilities && serviceInfo.advancedQueryCapabilities.supportsPagination ){
            var nPages = Math.ceil(count / maxCount);
            pageRequests = self.buildOffsetPages( nPages, itemJson.url, maxCount, options );
            self._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);

          } else if ( serviceInfo.supportsStatistics ) {
            // build where clause based pages 
            var statsUrl = self.buildStatsUrl( itemJson.url, ( options.layer || 0 ), serviceInfo.objectIdField || options.objectIdField );
          
            self.req( statsUrl, function( err, res ){
              var statsJson = JSON.parse(res.body);
              console.log(statsUrl, statsJson);

              if ( statsJson.error ){
                // default to sequential objectID paging
                pageRequests = self.buildObjectIDPages(
                  itemJson.url,
                  0,
                  count,
                  maxCount,
                  options
                );
                self._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
              } else {
                  pageRequests = self.buildObjectIDPages(
                    itemJson.url,
                    statsJson.features[0].attributes.min_oid || statsJson.features[0].attributes.MIN_OID,
                    statsJson.features[0].attributes.max_oid || statsJson.features[0].attributes.MAX_OID,
                    maxCount,
                    options
                  );
                  self._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
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
                self._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
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
            self._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
            }
          }
          callback(null, itemJson);

        });
      });
    });

  };


  this.geomTypes = {
    'esriGeometryPolygon':'Polygon',
    'esriGeometryPoint':'Point',
    'esriGeometryPolyLine':'LineString'
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
        pageUrl += '&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify( options.geometry );
      } else {
        pageUrl += '&geometry=&returnGeometry=true';
      }
      reqs.push({req: pageUrl});
    }

    return reqs;
  };



  //build object id query based page requests 
  this.buildObjectIDPages = function( url, min, max, maxCount, options ){
    var reqs = [], 
      pageMax, pageMin;

    var objId = options.objectIdField || 'objectId';

    var pages = ( max == maxCount ) ? max : Math.ceil((max-min) / maxCount);

    for (i=0; i < pages; i++){
      pageMax = min + (maxCount*(i+1))-1;
      pageMin = min + (maxCount*i);
      where = objId+'<=' + pageMax + '+AND+' + objId+'>=' + pageMin;
      pageUrl = url + '/' + (options.layer || 0) + '/query?outSR=4326&where='+where+'&f=json&outFields=*';
      if ( options.geometry ){
        pageUrl += '&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
      } else {
        pageUrl += '&geometry=&returnGeometry=true';
      }
      reqs.push({req: pageUrl});
    }

    return reqs;
  };

   //build object id query based page requests 
  this.buildIDPages = function( url, ids, maxCount, options ){
    var reqs = [],
      pageMax;
    
    var objId = options.objectIdField || 'objectId';

    var pages = (ids.length / maxCount);

    for (i=0; i < pages+1; i++){
      var pageIds = ids.splice(0, maxCount);
      if (pageIds.length){
        where = objId+' in (' + pageIds.join(',') + ')';
        pageUrl = url + '/' + (options.layer || 0) + '/query?outSR=4326&where='+where+'&f=json&outFields=*';
        if ( options.geometry ){
          pageUrl += '&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
        } else {
          pageUrl += '&geometry=&returnGeometry=true';
        }
        reqs.push({req: pageUrl});
      }
    }

    return reqs;
  };


  // make requests for feature pages 
  // execute done when we have all features 
  this.requestQueue = function(max, reqs, id, itemJson, layerId, options, done){
    var reqCount = 0;
    // setup the place to collect all the features
    itemJson.data = [ {features: []} ];
  
    // aggregate responses into one json and call done we have all of them 
    var _collect = function(json, cb){
      if ( json.error ){
        done( json.error.details[0], null);
      } else {
        // insert a partial
        GeoJSON.fromEsri( options.fields || [], json, function(err, geojson){
          // concat the features so we return the full json
          //itemJson.data[0].features = itemJson.data[0].features.concat( geojson.features );
          Cache.insertPartial( 'agol', id, geojson, layerId, function( err, success){
            cb();
            if (reqCount++ == reqs.length-1){
              // pass back the full array of features
              done(null, itemJson);
            }
          });
        });

      }
    };

    var i = 0;
    // concurrent queue for feature pages 
    var q = async.queue(function (task, callback) {
      // make a request for a page 
      console.log('get', i++, task.req);
      request.get(task.req, function(err, data, response){
        try {
          // so sometimes server returns these crazy asterisks in the coords
          // I do a regex to replace them in both the case that I've found them
          data.body = data.body.replace(/\*+/g,'null');
          data.body = data.body.replace(/\.null/g, '')
          var json = JSON.parse(data.body.replace(/OwnerPLY\./g,'').replace(/NaN/g, 'null'));
          _collect(json, callback);
        } catch(e){
          // TODO use a centralized logger for all logs
          console.log('\tRequesting page', task.req, err);
          if ( task.retry && task.retry < 3 ){
            task.retry++;
            q.push(task, function(err){ if (err) console.log(err); });
          } else if (task.retry && task.retry == 3 ){ 
            _collect( { error: { details: ['failed to parse json after 3 requests'] } }, callback);
            console.log('failed to parse json', task.req, e, err);
          } else {
            task.retry = 1;
            q.push(task, function(err){ if (err) console.log(err); });
          }
        }
      });
    // If service is hosted send concurrent 16 requests; else 4 
    }, ( itemJson && itemJson.url && itemJson.url.split('//')[1].match(/^service/) ) ? 16 : 4);

    // add all the page urls to the queue 
    q.push(reqs, function(err){ if (err) console.log(err); });

  };

  // Gets the feature service info 
  this.getFeatureServiceLayerInfo = function( url, layer, callback ){
    request.get( url +'/'+ layer + '?f=json', function( err, res ){
      try {
        var json = JSON.parse( res.body );
        callback( err, json );
      } catch (e) {
        callback( 'failed to parse service info', null );
      }
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
    var json = [{"statisticType":"min","onStatisticField":field,"outStatisticFieldName":"min_oid"},
      {"statisticType":"max","onStatisticField":field,"outStatisticFieldName":"max_oid"}];
    return url+'/'+layer+'/query?f=json&outFields=&outStatistics='+JSON.stringify(json);
  };

  // find and return the OID field from the list of fields
  this.getObjectIDField = function(info){
    var field;
    info.fields.forEach(function(f,i){
      if (f.type == 'esriFieldTypeOID'){
        field = f.name;
      }
    });
    return field;
  };


};
  

module.exports = new AGOL();
  
