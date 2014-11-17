var request = require('request'),
  csv = require('csv'),
  BaseModel = require('koop-server/lib/BaseModel.js'),
  async = require('async');

var AGOL = function( koop ){

  var agol = {};
  agol.__proto__ = BaseModel( koop );


  // how to long to persist the cache of data 
  // after which data will be dropped and re-fetched
  agol.cacheLife = (24*60*60*1000);  

  // adds a service to the Cache.db
  // needs a host, generates an id 
  agol.register = function( id, host, callback ){
    var type = 'agol:services';
    koop.Cache.db.serviceCount( type, function(error, count){
      id = id || count++;
      koop.Cache.db.serviceRegister( type, {'id': id, 'host': host},  function( err, success ){
        callback( err, id );
      });
    });
  };

  // removes the registered host from the list of hosts
  agol.remove = function( id, callback ){
    koop.Cache.db.serviceRemove( 'agol:services', parseInt(id) || id,  callback);
  }; 


  // get service by id, no id == return all
  agol.find = function( id, callback ){
    koop.Cache.db.serviceGet( 'agol:services', parseInt(id) || id, function(err, res){
      if (err){
        callback('No service table found for that id. Try POSTing {"id":"arcgis", "host":"http://www.arcgis.com"} to /agol', null);
      } else {
        callback(null, res);
      }
    });
  };

  // Centralized request method 
  // all ajax requests should use this so it can be tested 
  agol.req = function(url, callback){
    request({
        url: url, 
        headers: { 'User-Agent': 'esri-koop' }
      }, callback);
  };

  // base path to use for every host 
  agol.agol_path = '/sharing/rest/content/items/';

  // drops the item from the cache
  agol.dropItem = function( host, itemId, options, callback ){
    var dir = [ itemId, (options.layer || 0) ].join('_');
    koop.Cache.remove('agol', itemId, options, function(err, res){
      koop.files.removeDir( 'files/' + dir, function(err, res){
        koop.files.removeDir( 'tiles/'+ dir, function(err, res){
          koop.files.removeDir( 'thumbs/'+ dir, function(err, res){
            callback(err, true);
          });
        });
      });
    });
  };

  // got the service and get the item
  agol.getItem = function( host, itemId, options, callback ){
    var url = host + this.agol_path + itemId+'?f=json';
    this.req(url, function(err, data ){
      if (err) {
        callback(err, null);
      } else {
        try {
          var json = JSON.parse( data.body );
          if (json.error){
            callback( json.error.message, null );  
          } else {
            callback( null, json );
          }
        } catch (e){
          callback( 'Problem accessing the request host', null );
        }
      }
    });
  };

  agol.getCount = function( key, options, callback){
    koop.Cache.getCount( key, options, callback );
  };

  // wraps Cache.getInfo to make testing possible w/o the cache
  agol.getInfo = function(key, callback){
    koop.Cache.getInfo( key, callback);
  };

  // got the service and get the item
  agol.getItemData = function( host, itemId, hash, options, callback ){
    var self = this;
    this.getItem(host, itemId, options, function( err, itemJson ){
      
      if ( err ){
        callback(err, null);
      } else {
        // put host in option so our cacheCheck has ref to it 
        options.host = host;

        var qKey = ['agol', itemId, (options.layer || 0)].join(':');

        self.getInfo( qKey, function(err, info){

          var is_expired = info ? ( Date.now() >= info.expires_at ) : false;

          // in order to correctly expire hosted services we need to ping the server
          self.getFeatureServiceLayerInfo( itemJson.url, (options.layer || 0), function(err, serviceInfo){
            
            // check for infon on last edit date 
            // set is_expired to false if it hasnt changed
            if ( info && info.retrieved_at && serviceInfo && serviceInfo.editingInfo ) {
              if ( serviceInfo.editingInfo && !serviceInfo.editingInfo.lastEditDate ){
                is_expired = false;
              } else if ( info.retrieved_at > serviceInfo.editingInfo.lastEditDate ){
                is_expired = false;
              } else {
                is_expired = true;
              }
            }
            if ( is_expired ) {
              koop.Cache.remove('agol', itemId, options, function(err, res){
                self.getData(itemJson, host, itemId, hash, options, callback);
              });
            } else {
              self.getData(itemJson, host, itemId, hash, options, callback);
            }
          });

        });

      }
    });
  };

  agol.getServiceLayerData = function( host, itemId, hash, options, callback ){
    var self = this;
    var reqCount = 0, nlayers, serviceInfo, serviceUrl;
    var qKey = ['agol', itemId, 'all'].join(':');

    var _collect = function(layerInfo, cb){
      serviceInfo.layerInfo.push(layerInfo);
      serviceInfo.geometryType = 'esriGeometryPoint';
      if ( reqCount++ == nlayers){
        koop.Cache.insert( 'agol', itemId, { 
          features: [], 
          info: serviceInfo }, 
          'all', 
          function( err, success){
            if ( success ) {
              callback(null, serviceInfo);
            } else {
              callback( err, null );
            }
          }
        );
      }
      cb();
    };

    var q = async.queue(function(task, cb){
      request.get(task.url +'/'+ task.layer.id + '?f=json', function(err, res){
        lyrInfo = JSON.parse(res.body);
        _collect(lyrInfo, cb);
      });
    },4);

    koop.Cache.getInfo( qKey, function(err, info){
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

  agol.getData = function(itemJson, host, itemId, hash, options, callback){
    if ( itemJson.type == 'CSV' ){
      agol.getCSV( host + agol.agol_path, itemId, itemJson, options, callback );
    } else if ( itemJson.type == 'Feature Collection' ){
      agol.getFeatureCollection( host + agol.agol_path, itemId, itemJson, options, callback );
    } else if ( itemJson.type == 'Feature Service' || itemJson.type == 'Map Service' ) {
      agol.getFeatureService( itemId, itemJson, hash, options, callback );
    } else {
      callback('item must be a Feature Collection, Feature Service, or CSV', itemJson);
    }
  };

  // this queue is used to control the flow of the csv inserts 
  // if we get many requests for a new CSV they insert multiple times
  // here we handle removing the data cache before we insert
  agol.csvQueue = async.queue(function(task, cb){
    request.get(task.url, function(err, data ){
      if (err) {
        task.callback(err, null);
      } else {
        csv.parse( data.body, function(err, csv_data){
          koop.GeoJSON.fromCSV( csv_data, function(err, geojson){
            // store metadata with the data
            var json = {};
            json.name = task.itemJson.name || task.itemJson.title;
            json.updated_at = task.itemJson.modified;
            json.expires_at = task.expires_at;
            json.retrieved_at = Date.now();
            json.info = { name: task.itemJson.name };
            json.features = [];

            var dir = [ task.id, (task.options.layer || 0) ].join('_');

            koop.Cache.remove('agol', task.id, task.options, function(err, res){
              koop.files.removeDir( 'files/' + dir, function(err, res){
                koop.files.removeDir( 'tiles/'+ dir, function(err, res){
                  koop.files.removeDir( 'thumbs/'+ dir, function(err, res){
                    koop.Cache.insert( 'agol', task.id, json, (task.options.layer || 0), function( err, success){
                      koop.Cache.insertPartial( 'agol', task.id, geojson, (task.options.layer || 0), function( err, success){
                        if ( success ) {
                          task.itemJson.data = [geojson];
                          task.callback( null, task.itemJson );
                        } else {
                          task.callback( err, null );
                        }
                        cb();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      }
    });
  },1);

  agol.getCSV = function(base_url, id, itemJson, options, callback){
    var self = this, task = {};
    var qKey = ['agol', id, (options.layer || 0)].join(':');

    var maxSize = 5000000;

    koop.Cache.getInfo( qKey, function(err, info){
      koop.Cache.get( 'agol', id, options, function(err, entry ){
        if ( err || (info && info.retrieved_at < itemJson.modified)){
          if ( itemJson.size < maxSize ) {
            // replace .csv in name 
            itemJson.name = itemJson.name.replace('.csv','');
          
            task.url = base_url + '/' + id + '/data?f=json';
            task.itemJson = itemJson;
            task.id = id;
            task.options = options;
            task.expires_at = Date.now() + self.cacheLife;
            task.callback = callback;
            self.csvQueue.push(task, function(){});
          } else {
            callback({ code: 413, error: 'The requested CSV exceeds the allowable size of ' + maxSize + ' bytes' }, null );
          }
        } else {
          if ( entry && entry[0] && entry[0].exceeds_limit){
            itemJson.data = entry;
            itemJson.koop_status = 'too big';
            callback(null, itemJson);
          } else {
            itemJson.data = entry;
            callback( null, itemJson );
          }
        }
      });
    });
  };

  agol.getFeatureCollection = function(base_url, id, itemJson, options, callback){
    koop.Cache.get( 'agol', id, options, function(err, entry ){
      if ( err ){
        var url = base_url + '/' + id + '/data?f=json'; 
        request.get(url, function(err, data ){
          if (err) {
            callback(err, null);
          } else {
            var json = JSON.parse( data.body ).featureCollection.layers[0].featureSet;
            koop.GeoJSON.fromEsri( [], json, function(err, geojson){
              koop.Cache.insert( 'agol', id, geojson, (options.layer || 0), function( err, success){
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

  agol.getFeatureService = function( id, itemJson, hash, options, callback){
    var self = this;
    if ( !itemJson.url ){
      callback( 'Missing url parameter for Feature Service Item', null );
    } else {

      koop.Cache.get( 'agol', id, options, function(err, entry ){
        if ( err ){
          // no data in the cache; request new data 
          self.makeFeatureServiceRequest( id, itemJson, hash, options, callback );
        } else if ( entry && entry[0] && entry[0].status == 'processing' ){
          itemJson.data = [{
            features:[],
            name: ( itemJson.info ) ? itemJson.info.name : itemJson.name,
            geomType: self.geomTypes[itemJson.geometryType],
            info: itemJson.info
          }];
          itemJson.koop_status = 'processing';
          callback(null, itemJson);
        } else if ( entry && entry[0] && entry[0].exceeds_limit ){
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
  agol.stripLayerOffUrl = function(url){
    return url.substring(0, url.length - 2);
  };


  // makes a request to the feature service 
  // checks the count and determines if koop should make one or many requests  
  agol.makeFeatureServiceRequest = function( id, itemJson, hash, options, callback ){
    var self = this;

    // check the last char on the url
    // protects us from urls registered with layers already in the url 
    if ( parseInt(itemJson.url.charAt( itemJson.url.length-1 )) >= 0 ){
      itemJson.url = self.stripLayerOffUrl( itemJson.url );
    }


    // get the ids only
    var idUrl = itemJson.url + '/' + ( options.layer || 0 ) + '/query?where=1=1&returnIdsOnly=true&returnCountOnly=true&f=json';

    //if (options.geometry){
      //idUrl += '&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
    //}

    // get the id count of the service 
    agol.req(idUrl, function(err, data ){
      // determine if its greater then 1000
      try {
        var idJson = JSON.parse( data.body );
        if (idJson.error){
          callback( idJson.error.message + ': ' + idUrl, null );
        } else {
          var count = idJson.count;
          if (!count && idJson.objectIds && idJson.objectIds.length ){
            count = idJson.objectIds.length;
          }

          agol.log('debug', JSON.stringify({method:'makeFeatureServiceRequest', id:id, 'count': count}));

          // WHEN COUNT IS 0 - No Features 
          if (count === 0){

            // return empty geojson
            itemJson.data = [{type: 'FeatureCollection', features: []}];
            callback( null, itemJson );

          // Count is low 
          } else if ( count < 1000 ){
            agol.singlePageFeatureService( id, itemJson, options, callback );
          // We HAVE to page 
          } else if ( count >= 1000 ){
            agol.pageFeatureService( id, itemJson, count, hash, options, callback );
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
  agol.singlePageFeatureService = function( id, itemJson, options, callback ){
    var self = this;
    // get the featureservice info 
    this.getFeatureServiceLayerInfo(itemJson.url, ( options.layer || 0 ), function(err, serviceInfo){
      if ( err ){
        callback(err, null);
      } else {

        // we can the data in one shot
        var url = itemJson.url + '/' + (options.layer || 0) + '/query?outSR=4326&where=1=1&f=json&outFields=*';
        //if (options.geometry){
        //  url += '&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=' + JSON.stringify(options.geometry);
        //} else {
          url += '&geometry=&returnGeometry=true';
        //}

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
              koop.GeoJSON.fromEsri( serviceInfo.fields, json, function(err, geojson){
                
                geojson.name = itemJson.name || itemJson.title;
                geojson.updated_at = itemJson.modified;
                geojson.expires_at = Date.now() + self.cacheLife;
                geojson.info = serviceInfo;
                geojson.retrieved_at = Date.now(); 

                // save the data 
                koop.Cache.insert( 'agol', id, geojson, (options.layer || 0), function( err, success){
                  if ( success ) {
                    itemJson.data = [geojson];
                    callback( null, itemJson );
                  } else {
                    callback( err, null );
                  }
                });
              });
            } catch (e){
              koop.log.info( 'Error parsing response '+id+' '+e+' - '+url);
              callback( 'Unable to parse Feature Service response', null );
            }
          }
        });
      }
    });
  };


  agol._page = function( count, pageRequests, id, itemJson, layerId, options, hash){
    agol.requestQueue( count, pageRequests, id, itemJson, layerId, options, function(err,data){
      koop.exporter.taskQueue.push( {
        id: id,
        type: 'agol',
        hash: hash,
        options: options,
        geomType: options.geomType
      }, function(){});
    });
  };


  // handles pagin over the feature service 
  agol.pageFeatureService = function( id, itemJson, count, hash, options, callback ){
    var self = this;    
    var geomType;

    // get the featureservice info 
    agol.getFeatureServiceLayerInfo(itemJson.url, ( options.layer || 0 ), function(err, serviceInfo){
      // set the name in options
      if ( (itemJson.name || itemJson.title) && !options.name ){
        options.name = serviceInfo.name || itemJson.name || itemJson.title;
        options.name = options.name.replace(/\/|,|&/g, '').replace(/ /g, '_').replace(/\(|\)/g, '');
      }

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
          
      options.objectIdField = agol.getObjectIDField(serviceInfo);

      // creates the empty table
      koop.Cache.remove('agol', id, {layer: (options.layer || 0)}, function(){

        var expiration = Date.now() + self.cacheLife;

        var info = {
          status: 'processing',
          updated_at: itemJson.modified,
          expires_at: expiration,
          retrieved_at: Date.now(), 
          name: serviceInfo.name,
          geomType: self.geomTypes[itemJson.geometryType],
          info: serviceInfo,
          features:[]
        };

        if ( options.format ){
          info.format = options.format;
        }

        koop.Cache.insert( 'agol', id, info, ( options.layer || 0 ), function( err, success ){

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
            pageRequests = agol.buildOffsetPages( nPages, itemJson.url, maxCount, options );
            self._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);

          } else if ( serviceInfo.supportsStatistics ) {
            // build where clause based pages 
            var statsUrl = agol.buildStatsUrl( itemJson.url, ( options.layer || 0 ), serviceInfo.objectIdField || options.objectIdField );
          
            agol.req( statsUrl, function( err, res ){
              var statsJson = JSON.parse( res.body );
              koop.log.info( 'statsUrl %s %s', id, statsUrl );
              console.log(statsJson);

              if ( statsJson.error ){
                // default to sequential objectID paging
                pageRequests = agol.buildObjectIDPages(
                  itemJson.url,
                  0,
                  count,
                  maxCount,
                  options
                );
                agol._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
              } else {
                  var names;
                  if ( statsJson && statsJson.fieldAliases ) { 
                    names = Object.keys(statsJson.fieldAliases);
                  }
                  pageRequests = agol.buildObjectIDPages(
                    itemJson.url,
                    statsJson.features[0].attributes.min_oid || statsJson.features[0].attributes.MIN_OID ||statsJson.features[0].attributes[names[0]],
                    statsJson.features[0].attributes.max_oid || statsJson.features[0].attributes.MAX_OID || statsJson.features[0].attributes[names[1]],
                    maxCount,
                    options
                  );
                  agol._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
              }
            });

          } else {
            if ( count < 50000 ){
              agol.getFeatureServiceLayerIds(itemJson.url, (options.layer || 0), function(err, ids){
                pageRequests = agol.buildIDPages(
                  itemJson.url,
                  ids,
                  250,
                  options
                );
                agol._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
              });
            } else { 
            // default to sequential objectID paging
            pageRequests = agol.buildObjectIDPages(
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


  agol.geomTypes = {
    'esriGeometryPolygon':'Polygon',
    'esriGeometryPoint':'Point',
    'esriGeometryPolyLine':'LineString'
  };


  //build resultOffset based page requests 
  agol.buildOffsetPages = function( pages, url, max, options ){
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
  agol.buildObjectIDPages = function( url, min, max, maxCount, options ){
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
  agol.buildIDPages = function( url, ids, maxCount, options ){
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
  agol.requestQueue = function(max, reqs, id, itemJson, layerId, options, done){
    var reqCount = 0;
    // setup the place to collect all the features
    itemJson.data = [ {features: []} ];
  
    // aggregate responses into one json and call done we have all of them 
    var _collect = function(json, cb){
      if ( json.error ){
        done( json.error.details[0], null);
      } else {
        // insert a partial
        koop.GeoJSON.fromEsri( options.fields || [], json, function(err, geojson){
          // concat the features so we return the full json
          //itemJson.data[0].features = itemJson.data[0].features.concat( geojson.features );
          koop.Cache.insertPartial( 'agol', id, geojson, layerId, function( err, success){
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
    var logErrorCB = function(err){ if (err) console.log(err); }; 

    // concurrent queue for feature pages
    var q = async.queue(function (task, callback) {
      // make a request for a page 
      agol.log('info', id + ' get page '+ (i++));
      request.get(task.req, function(err, data, response){
        try {
          // so sometimes server returns these crazy asterisks in the coords
          // I do a regex to replace them in both the case that I've found them
          data.body = data.body.replace(/\*+/g,'null');
          data.body = data.body.replace(/\.null/g, '')
          var json = JSON.parse(data.body.replace(/OwnerPLY\./g,'').replace(/NaN/g, 'null'));
          _collect(json, callback);
        } catch(e){
          agol.log('info','Requesting page '+ task.req +' '+ err);
          if ( task.retry && task.retry < 3 ){
            task.retry++;
            q.push(task, logErrorCB);
            callback();
          } else if (task.retry && task.retry == 3 ){ 
            _collect( { error: { details: ['failed to parse json after 3 requests'] } }, callback);
            agol.log('error', 'failed to parse json '+ task.req +' '+ err);
          } else {
            task.retry = 1;
            q.push(task, logErrorCB);
            callback();
          }
        }
      });
    // If service is hosted send concurrent 16 requests; else 4 
    }, ( itemJson && itemJson.url && itemJson.url.split('//')[1].match(/^service/) ) ? 16 : 4);

    agol.log('info', id + ' # of requests:' + reqs.length);
    // add all the page urls to the queue 
    q.push(reqs, logErrorCB);

  };

  // Gets the feature service info 
  agol.getFeatureServiceLayerInfo = function( url, layer, callback ){
    request.get( url +'/'+ layer + '?f=json', function( err, res ){
      try {
        var json = JSON.parse( res.body );
        json.url = url;
        callback( err, json );
      } catch (e) {
        callback( 'failed to parse service info', null );
      }
    });
  };

  // Gets the feature service object ids for pagination
  agol.getFeatureServiceLayerIds = function( url, layer, callback ){
    request.get( url +'/'+ layer + '/query?where=1=1&returnIdsOnly=true&f=json', function( err, res ){
      var json = JSON.parse( res.body );
      callback( err, json.objectIds );
    });
  };

  // builds a url for querying the min/max values of the object id 
  agol.buildStatsUrl = function( url, layer, field ){
    var json = [{"statisticType":"min","onStatisticField":field,"outStatisticFieldName":"min_oid"},
      {"statisticType":"max","onStatisticField":field,"outStatisticFieldName":"max_oid"}];
    return url+'/'+layer+'/query?f=json&outFields=&outStatistics='+JSON.stringify(json);
  };

  // find and return the OID field from the list of fields
  agol.getObjectIDField = function(info){
    var field;
    info.fields.forEach(function(f,i){
      if (f.type == 'esriFieldTypeOID'){
        field = f.name;
      }
    });
    return field;
  };

  return agol;

};
  

module.exports = AGOL;
