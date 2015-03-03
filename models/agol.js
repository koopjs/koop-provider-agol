var request = require('request'),
  kue = require('kue'),
  csv = require('csv'),
  crypto = require('crypto'),
  async = require('async');

var AGOL = function( koop ){

  var agol = {};
  agol.__proto__ = koop.BaseModel( koop );

  // create a request Q if configured to page large data sets  
  if (koop.config.agol && koop.config.agol.request_workers){
    agol.worker_q = kue.createQueue({
      prefix: koop.config.agol.request_workers.redis.prefix || 'q',
      disableSearch: true,
      redis: {
        port: koop.config.agol.request_workers.redis.port || 6379,
        host: koop.config.agol.request_workers.redis.host || '127.0.0.1'
      }
    });

    // remove completed jobs from the queue 
    agol.worker_q.on('job complete', function(id) {
      kue.Job.get( id, function( err, job ) {
         if (err) return;
         job.remove(function( err ){
            if (err) {
              agol.log('debug', 'could not remove completed job #' + job.id);
            } 
            agol.log('debug', 'removed completed job #' + job.id + ' - ' + id);
         });
      });  
    });

    // track and log job progress, just handy to have
    agol.worker_q.on('job progress', function(id, progress){
      agol.log('debug', 'progress ' + id + ' - ' + progress + '%');
    });

  }

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
        url: encodeURI( decodeURI(url) ), 
        headers: { 'User-Agent': 'esri-koop' }
      }, callback);
  };

  // base path to use for every host 
  agol.agol_path = '/sharing/rest/content/items/';

  // drops the item from the cache
  agol.dropItem = function( host, itemId, options, callback ){
    var layerId = (options.layer || 0);

    if ( koop.exporter.export_q ){
      var jobData = {
        itemId: itemId,
        layerId: layerId,
        remove: true
      };

      // add the job to the distributed worker pool 
      var job = koop.exporter.export_q.create( 'exports', jobData ).save( function(err){
          agol.log('debug', 'added a remove job to the export_q' + job.id );
          var dir = [ itemId, layerId ].join('_');
          koop.Cache.remove('agol', itemId, options, function(err, res){
            koop.files.removeDir( 'files/' + dir, function(err, res){
              koop.files.removeDir( 'tiles/'+ dir, function(err, res){
                koop.files.removeDir( 'thumbs/'+ dir, function(err, res){
                  callback(err, true);
                });
              });
            });
          });
      });
      
    } else {

      var dir = [ itemId, layerId ].join('_');
      koop.Cache.remove('agol', itemId, options, function(err, res){
        koop.files.removeDir( 'files/' + dir, function(err, res){
          koop.files.removeDir( 'tiles/'+ dir, function(err, res){
            koop.files.removeDir( 'thumbs/'+ dir, function(err, res){
              callback(err, true);
            });
          });
        });
      });

    }
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
  agol.getItemData = function( host, hostId, itemId, hash, options, callback ){
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

          // check the last char on the url
          // protects us from urls registered with layers already in the url
          if (itemJson && itemJson.url){
            var url_parts = itemJson.url.split('/');
            if ( parseInt(url_parts[ url_parts.length-1 ]) >= 0 ){
              var lyrId = url_parts[ url_parts.length-1 ];
              itemJson.url = self.stripLayerOffUrl( itemJson.url, (''+lyrId).split('').length );
            }
          }

          self.getFeatureServiceLayerInfo( itemJson.url, (options.layer || 0), function(err, serviceInfo){
            
            // check for infon on last edit date 
            // set is_expired to false if it hasnt changed
            if ( info && info.retrieved_at && serviceInfo && serviceInfo.editingInfo){
              if (!serviceInfo.editingInfo.lastEditDate && (info.retrieved_at > itemJson.modified)) {
                is_expired = false;  
              } else if ( info.retrieved_at < serviceInfo.editingInfo.lastEditDate ){
                is_expired = true;        
              } else {
                // if the retrieved at date is greater than the lastEditDate then the data are still good
                is_expired = false;
              }
            }
         
            if ( is_expired ) {
              koop.Cache.remove('agol', itemId, options, function(err, res){
                self.getData(itemJson, host, hostId, itemId, hash, options, callback);
              });
            } else {
              self.getData(itemJson, host, hostId, itemId, hash, options, callback);
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
      agol.req( task.url +'/'+ task.layer.id + '?f=json', function(err, res){
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

  agol.getData = function(itemJson, host, hostId, itemId, hash, options, callback){
    if ( itemJson.type == 'CSV' ){
      agol.getCSV( host + agol.agol_path, hostId, itemId, itemJson, options, callback );
    } else if ( itemJson.type == 'Feature Collection' ){
      agol.getFeatureCollection( host + agol.agol_path, hostId, itemId, itemJson, options, callback );
    } else if ( itemJson.type == 'Feature Service' || itemJson.type == 'Map Service' ) {
      agol.getFeatureService( hostId, itemId, itemJson, hash, options, callback );
    } else {
      callback('item must be a Feature Collection, Feature Service, or CSV', itemJson);
    }
  };

  // this queue is used to control the flow of the csv inserts 
  // if we get many requests for a new CSV they insert multiple times
  // here we handle removing the data cache before we insert
  agol.csvQueue = async.queue(function(task, cb){
    agol.req(task.url, function(err, data ){
      if (err) {
        task.callback(err, null);
      } else {
        csv.parse( data.body, function(err, csv_data){
          if (err){
            task.callback({ code: 400, error: 'Trouble parsing the CSV data'}, null);
            return cb();
          }
          koop.GeoJSON.fromCSV( csv_data, function(err, geojson){
            // store metadata with the data
            var json = {};
            json.name = task.itemJson.title || task.itemJson.name;
            json.updated_at = task.itemJson.modified;
            json.expires_at = task.expires_at;
            json.retrieved_at = Date.now();
            json.info = { name: json.name };
            json.host = {
              id: task.hostId
            };
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

  agol.getCSV = function(base_url, hostId, id, itemJson, options, callback){
    var self = this, task = {};
    var qKey = ['agol', id, (options.layer || 0)].join(':');

    var maxSize = 5000000;

    // for large datasets enforce koop's large data limit 
    options.enforce_limit = true;

    koop.Cache.getInfo( qKey, function(err, info){
      koop.Cache.get( 'agol', id, options, function(err, entry ){
        if ( err || (info && info.retrieved_at < itemJson.modified)){
          if ( itemJson.size < maxSize ) {
            // replace .csv in name 
            itemJson.name = itemJson.name.replace('.csv','');
          
            task.url = base_url + '/' + id + '/data?f=json';
            task.itemJson = itemJson;
            task.id = id;
            task.hostId = hostId;
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

  agol.getFeatureCollection = function(base_url, hostId, id, itemJson, options, callback){
    // for large datasets enforce koop's large data limit 
    options.enforce_limit = true;

    koop.Cache.get( 'agol', id, options, function(err, entry ){
      if ( err ){
        var url = base_url + '/' + id + '/data?f=json'; 
        agol.req(url, function(err, data ){
          if (err) {
            callback(err, null);
          } else {
            var json = JSON.parse( data.body ).featureCollection.layers[0].featureSet;
            koop.GeoJSON.fromEsri( [], json, function(err, geojson){
              geojson.name = itemJson.name || itemJson.title;
              geojson.updated_at = itemJson.modified;
              geojson.host = {
                id: hostId
              };
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

  agol.getFeatureService = function( hostId, id, itemJson, hash, options, callback){
    var self = this;
    if ( !itemJson.url ){
      callback( 'Missing url parameter for Feature Service Item', null );
    } else {
      // for large datasets enforce koop's large data limit 
      if (options.enforce_limit !== false){
        options.enforce_limit = true;
      }
      koop.Cache.get( 'agol', id, options, function(err, entry ){
        if ( err ){
          // no data in the cache; request new data 
          self.makeFeatureServiceRequest( hostId, id, itemJson, hash, options, callback );
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
  agol.stripLayerOffUrl = function(url, len){
    return url.substring(0, url.length - ((len || 2)+1));
  };


  // makes a request to the feature service 
  // checks the count and determines if koop should make one or many requests  
  agol.makeFeatureServiceRequest = function( hostId, id, itemJson, hash, options, callback ){
    var self = this;

    // check the last char on the url
    // protects us from urls registered with layers already in the url
    var url_parts = itemJson.url.split('/');
    if ( parseInt(url_parts[ url_parts.length-1 ]) >= 0 ){
      var lyrId = url_parts[ url_parts.length-1 ];
      itemJson.url = self.stripLayerOffUrl( itemJson.url, (''+lyrId).split('').length );
    }

    // get the ids only
    var countUrl = itemJson.url + '/' + (options.layer||0) 
    countUrl += '/query?where=1=1&returnIdsOnly=true&returnCountOnly=true&f=json';

    // get the id count of the service 
    agol.req( countUrl, function(err, data ){
      // determine if its greater then 1000
      try {
        var idJson = JSON.parse( data.body );
        if (idJson.error){
          callback( idJson.error.message + ': ' + countUrl, null );
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
            agol.singlePageFeatureService( hostId, id, itemJson, options, callback );
          // We HAVE to page 
          } else if ( count >= 1000 ){
            agol.pageFeatureService( hostId, id, itemJson, count, hash, options, callback );
          } else {
            callback( 'Unable to count features, make sure the layer you requested exists', null );
          }
        }
      } catch (e) {
        console.log(e, countUrl);
        callback( 'Unknown layer, make sure the layer you requested exists', null );
      }
    });
  };


  // make a request to a single page feature service 
  agol.singlePageFeatureService = function( hostId, id, itemJson, options, callback ){
    var self = this;

    // for large datasets enforce koop's large data limit 
    options.enforce_limit = true;

    // get the featureservice info 
    this.getFeatureServiceLayerInfo( itemJson.url, ( options.layer || 0 ), function(err, serviceInfo){
      if ( err ){
        callback(err, null);
      } else {

        // protect koop from back serviceInfo.urls 
        serviceInfo.url = itemJson.url;

        // we can the data in one shot
        var url = itemJson.url + '/' + (options.layer || 0) + '/query?outSR=4326&where=1=1&f=json&outFields=*';
        url += '&geometry=&returnGeometry=true&geometryPrecision=6';

        // get the features
        self.req(url, function(err, data ){
          if (err) {
            callback(err, null);
          } else {
            try {
              // have to replace asterrisks for bad coord values from agol
              data.body = data.body.replace(/\*+/g,'null');
              data.body = data.body.replace(/\.null/g, '');
              var json = {features: JSON.parse( data.body ).features};
              // convert to GeoJSON 
              koop.GeoJSON.fromEsri( serviceInfo.fields, json, function(err, geojson){
                geojson.name = (serviceInfo.name || serviceInfo.title || itemJson.name || itemJson.title)
                  .replace(/\/|,|&|\|/g, '')
                  .replace(/ /g, '_')
                  .replace(/\(|\)/g, '');
                geojson.name = (geojson.name.length > 150) ? geojson.name.substr(0, 150) : geojson.name; 
                geojson.updated_at = itemJson.modified;
                geojson.expires_at = Date.now() + self.cacheLife;
                geojson.info = serviceInfo;
                geojson.retrieved_at = Date.now(); 
                geojson.host = {
                  id: hostId
                };

                // save the data 
                koop.Cache.insert( 'agol', id, geojson, (options.layer || 0), function( err, success){
                  if ( success ) {
                    if (options.where || options.geometry){
                      koop.Cache.get( 'agol', id, options, function(err, entry){
                        itemJson.data = entry;
                        callback( null, itemJson );
                      });                  
                    } else {
                      itemJson.data = [geojson];
                      callback( null, itemJson );
                    }
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

  agol._throttleQ = async.queue(function(key, cb){
    setTimeout(function(){
      koop.Cache.getInfo(key, function(err, info){
        if (!info) {
          info = {};
        }
        if ( !info.locked ){
          info.locked = true;
          koop.Cache.updateInfo(key, info, function(err, success){
            cb( false );
          }); 
        } else {
          cb( info.locked );
        }
      });
    }, Math.floor((Math.random() * 750) + 200) );
  },1);

  agol._page = function( count, pageRequests, id, itemJson, layerId, options, hash){
    // add to a separate queue that we can use to add jobs one at a time
    // this prevents the case when we get 2 requests at the same time
    agol._throttleQ.push( [ 'agol', id, layerId].join(':'), function( locked ){
      if ( !locked ){
        agol.requestQueue( count, pageRequests, id, itemJson, layerId, options, function(err,data){
          koop.exporter.taskQueue.push( {
            id: id,
            type: 'agol',
            hash: hash,
            options: options,
            geomType: options.geomType
          }, function(){});
        });
      }
    });
  };


  // handles pagin over the feature service 
  agol.pageFeatureService = function( hostId, id, itemJson, count, hash, options, callback ){
    var self = this;
    var geomType;

    // check the last char on the url
    // protects us from urls registered with layers already in the url
    var url_parts = itemJson.url.split('/');
    if ( parseInt(url_parts[ url_parts.length-1 ]) >= 0 ){
      var lyrId = url_parts[ url_parts.length-1 ];
      itemJson.url = self.stripLayerOffUrl( itemJson.url, (''+lyrId).split('').length );
    }

    // get the featureservice info 
    agol.getFeatureServiceLayerInfo(itemJson.url, ( options.layer || 0 ), function(err, serviceInfo){
      
      // set the name in options
      if ( (itemJson.name || itemJson.title) && !options.name ){
        options.name = itemJson.name || itemJson.title;
        options.name = options.name.replace(/\/|,|&|\|/g, '').replace(/ /g, '_').replace(/\(|\)/g, '');
      }

      // sanitize any single quotes in the service description
      if (serviceInfo ) {
        if ( serviceInfo.description ) {
          serviceInfo.description = serviceInfo.description.replace(/'/g, '');
        }
        if ( serviceInfo.definitionExpression ){
          serviceInfo.definitionExpression = serviceInfo.definitionExpression.replace(/'/g, '');
        }
        if ( serviceInfo.name ){
          options.name = serviceInfo.name;
        } else if ( serviceInfo.title ) {
          options.name = serviceInfo.title;
        }
        options.name = options.name.replace(/\/|,|&|\|/g, '').replace(/ /g, '_').replace(/\(|\)/g, '');

        // set the geom type 
        options.geomType = serviceInfo.geometryType;
        options.fields = serviceInfo.fields;
        options.objectIdField = agol.getObjectIDField(serviceInfo);
      }
      
      // fix long names; truncate to 150 chars
      options.name = (options.name.length > 150) ? options.name.substr(0, 150): options.name;
         
      var layerId = (options.layer || 0);
      var key = [ 'agol', id, layerId].join(':');

      koop.Cache.getInfo(key, function(err, info){

        if (!info){
          // creates the empty table
          // WHY ARE WE REMOVING THE TABLE FIRST
          koop.Cache.remove('agol', id, {layer: layerId}, function(err){

            var expiration = Date.now() + self.cacheLife;

            var info = {
              status: 'processing',
              updated_at: itemJson.modified,
              expires_at: expiration,
              retrieved_at: Date.now(), 
              name: options.name,
              geomType: self.geomTypes[itemJson.geometryType],
              info: serviceInfo || {},
              features:[],
              host: {
                id: hostId
              }
            };

            koop.Cache.insert( 'agol', id, info, ( options.layer || 0 ), function( err, success ){

              // return in a processing state, but continue on
              itemJson.data = [{ features:[] }];
              itemJson.koop_status = 'processing';
              itemJson.cache_save = false;
              itemJson.expires_at = expiration;

              var maxCount = 1000, //parseInt(serviceInfo.maxRecordCount) || 1000,
                pageRequests;

              // build legit offset based page requests 
              if ( serviceInfo && serviceInfo.advancedQueryCapabilities && serviceInfo.advancedQueryCapabilities.supportsPagination ){
                var nPages = Math.ceil(count / maxCount);
                pageRequests = agol.buildOffsetPages( nPages, itemJson.url, maxCount, options );
                self._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);

              } else if ( serviceInfo && serviceInfo.supportsStatistics ) {
                // build where clause based pages 
                var statsUrl = agol.buildStatsUrl( itemJson.url, ( options.layer || 0 ), serviceInfo.objectIdField || options.objectIdField );
                var idUrl = itemJson.url + '/' + ( options.layer || 0 ) + '/query?where=1=1&returnIdsOnly=true&f=json';
                agol.req( statsUrl, function( err, res ){
                  try {
                    var statsJson = JSON.parse( res.body );
                    koop.log.info( 'statsUrl %s %s', id, statsUrl );
                    if ( statsJson.error ){
                      try{
                        //DMF: if stats fail, try to grab all the object IDs
                        agol.req( idUrl , function( err, res ){
                            var idJson = JSON.parse( res.body );
                            koop.log.info( 'oidURL %s %s', id, idUrl );
                            var minID, maxID;
                            if ( idJson.error ){
                              //DMF: if grabbing objectIDs fails fall back to guessing based on 0 and count
                              minID = 0;
                              maxID = count;
                            } else{
                              idJson.objectIds.sort(function(a, b){return a-b;});
                              minID = idJson.objectIds[0];
                              maxID = idJson.objectIds[idJson.objectIds.length - 1];
                            }
                            pageRequests = agol.buildObjectIDPages(itemJson.url, minID, maxID, maxCount, options);
                            agol._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);        
                        }
                      );} catch (e){
                        agol.log('error', 'Error parsing ObjectIds '+id+' '+e+' - '+idUrl);
                      }  
                    } else {
                        var names;
                        if ( statsJson && statsJson.fieldAliases ) {
                          names = Object.keys(statsJson.fieldAliases);
                        }
                        pageRequests = agol.buildObjectIDPages(
                          itemJson.url,
                          statsJson.features[0].attributes.min_oid || statsJson.features[0].attributes.MIN_OID || statsJson.features[0].attributes[names[0]],
                          statsJson.features[0].attributes.max_oid || statsJson.features[0].attributes.MAX_OID || statsJson.features[0].attributes[names[1]],
                          maxCount,
                          options
                        );
                        agol._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
                    }
                  } catch (e){
                    agol.log('error', 'Error parsing stats '+id+' '+e+' - '+statsUrl);
                  }
                });

              } else {
                if ( count < 50000 ){
                  agol.getFeatureServiceLayerIds(itemJson.url, (options.layer || 0), function(err, ids){
                    try {
                      pageRequests = agol.buildIDPages(
                        itemJson.url,
                        ids,
                        250,
                        options
                      );
                      agol._page( count, pageRequests, id, itemJson, (options.layer || 0), options, hash);
                    } catch(e){
                      agol.log('error', 'error building ID request to page dataset '+id+' error:'+ err);
                    }
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
        } else {
          callback(null, itemJson);
        }
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
      pageUrl += '&geometry=&returnGeometry=true&geometryPrecision=6';
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
      //there is a bug in server where queries fail if the max value queried is higher than the actual max
      //so if this is the last page, then set the max to be the maxOID
      if ( i == pages - 1 ){
        pageMax = max;
      }
      else {
        pageMax = min + (maxCount*(i+1))-1;
      }
      pageMin = min + (maxCount*i);
      where = objId+'<=' + pageMax + '+AND+' + objId+'>=' + pageMin;
      pageUrl = url + '/' + (options.layer || 0) + '/query?outSR=4326&where='+where+'&f=json&outFields=*';
      pageUrl += '&geometry=&returnGeometry=true&geometryPrecision=6';
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
        pageUrl += '&geometry=&returnGeometry=true&geometryPrecision=6';
        reqs.push({req: pageUrl});
      }
    }

    return reqs;
  };

  // make requests for feature pages 
  // execute done when we have all features 
  agol.requestQueue = function(max, reqs, id, itemJson, layerId, options, done){
    var self = this;
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

    var concurrency = ( itemJson && itemJson.url && itemJson.url.split('//')[1].match(/^service/) ) ? 16 : 4;

    var i = 0;
    var logErrorCB = function(err){ if (err) console.log(err); }; 

    // concurrent queue for feature pages
    var q = async.queue(function (task, callback) {
      // make a request for a page 
      agol.log('info', id + ' get page '+ (i++) + ' : ' +task.req);
      agol.req( task.req, function(err, data, response){
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
    }, concurrency);

    agol.log('info', id + ' # of requests:' + reqs.length);

    if ( koop.config.agol && koop.config.agol.request_workers ){
      // before we queue up jobs we need to setup some tracking 
      // we get the db info, add the number of jobs to it
      // when all jobs are done the status:'processed' needs to be removed 

      // data that we want to pass to the workers 
      // send ids, page urls, and the server concurrency (16 for hosted, else 4)
      var jobData = {
        id: id,
        layerId: layerId,
        pages: reqs,
        concurrency: concurrency, 
        fields: options.fields || []
      };
      
      // info key - used to look item info in the cache 
      var key = [ 'agol', id, layerId ].join(':');

      // add the job to the distributed worker pool
      var job = agol.worker_q.create( 'agol', jobData ).save( function(err){
        agol.log('debug', 'added page requests to job-queue ' + job.id );
      });

      // track failed jobs and flag them 
      job.on('failed', function(jobErr){
          var _remove = function(job){
            job.remove(function( err ){
              if (err) {
                agol.log('debug', 'could not remove failed job #' + job.id +' Error: '+ err);
                return;
              }
              agol.log('debug', 'removed failed request job #' + job.id + ' - ' + id);
            });
          };

          koop.Cache.getInfo(key, function(err, info){
            if (info){
              agol.log('error', 'Request worker job failed ' + jobErr );
              kue.Job.get( job.id, function( err, job ) {
                var errJson;
                try {
                  errJson = JSON.parse(job._error);
                  info.paging_failed = { error: errJson };
                } catch(e){
                  console.log('Could not parse error json', e);
                  errJson = {response:job._error};
                }
                info.paging_failed = { error: errJson };
                info.generating = {
                  error: {
                    code: errJson.code,
                    request: errJson.request,
                    response: errJson.response,
                    message: 'Failed to cache the data'
                  }
                };
                koop.Cache.updateInfo(key, info, function(err, success){
                  if (err) return;
                  _remove( job );
                });
              });
            } else {
              _remove( job );
            }
          });
      });

    } else {
      // add all the page urls to the queue 
      q.push(reqs, logErrorCB);
    }

  };

  // Gets the feature service info 
  agol.getFeatureServiceLayerInfo = function( url, layer, callback ){
    url = url +'/'+ layer + '?f=json'
    agol.req( url, function( err, res ){
      try {
        var json = JSON.parse( res.body );
        json.url = url;
        callback( err, json );
      } catch (e) {
        //console.log('failed to get URL, no big deal, most likely this can be ignored', url, e, err);
        callback( 'failed to parse service info', null );
      }
    });
  };

  // Gets the feature service object ids for pagination
  agol.getFeatureServiceLayerIds = function( url, layer, callback ){
    agol.req( url +'/'+ layer + '/query?where=1=1&returnIdsOnly=true&f=json', function( err, res ){
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
