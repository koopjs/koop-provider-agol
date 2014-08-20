var request = require('request'),
  terraformer = require('terraformer'),
  terraformerParser = require('terraformer-arcgis-parser'),
  extend = require('node.extend'),
  sm = require('sphericalmercator'),
  merc = new sm({size:256}),
  crypto = require('crypto'),
  _ = require('lodash'),
  BaseController = require('koop-server/lib/Controller.js'),
  fs = require('fs');

// inherit from base controller
var Controller = function( agol ){

  // Registers a host with the given id 
  // this inserts a record into the db for an ArcGIS instances ie: id -> hostname :: arcgis -> arcgis.com 
  this.register = function(req, res){
    if ( !req.body.host ){
      res.send('Must provide a host to register:', 500); 
    } else { 
      agol.register( req.body.id, req.body.host, function(err, id){
        if (err) {
          res.send( err, 500);
        } else {
          res.json({ 'serviceId': id });
        }
      });
    }
  };


  // handles a DELETE to remove a registered host from the DB
  this.del = function(req, res){
    if ( !req.params.id ){
      res.send( 'Must specify a service id', 500 );
    } else {
      agol.remove(req.params.id, function(err, data){
        if (err) {
          res.send( err, 500);
        } else {
          res.json( data );
        }
      });
    }
  };


  // returns a list of the registered hosts and thier ids
  this.list = function(req, res){
    agol.find(null, function(err, data){
      if (err) {
        res.send( err, 500);
      } else {
        res.json( data );
      }
    });
  };

  // looks up a host based on a given id 
  this.find = function(req, res){
    agol.find(req.params.id, function(err, data){
      if (err) {
        res.send( err, 500);
      } else {
        res.json( data );
      }
    });
  };

  // get the item metadata from the host 
  this.findItem = function(req, res){
    if (req.params.format){
      this.findItemData(req, res);
    } else {
      agol.find(req.params.id, function(err, data){
        if (err) {
          res.send( err, 500);
        } else {
          // Get the item 
          agol.getItem( data.host, req.params.item, req.query, function(error, itemJson){
            if (error) {
              res.send( error, 500);
            } else {
              res.contentType('text'); 
              res.json( itemJson );
            }
          });
        }
      });
    }
  };

  // drops the cache for an item
  this.dropItem = function(req, res){
    // if we have a layer then append it to the query params 
    if ( req.params.layer ) {
      req.query.layer = req.params.layer;
    }

    agol.find(req.params.id, function(err, data){
      if (err) {
        res.send( err, 500);
      } else {
        // Get the item 
        agol.dropItem( data.host, req.params.item, req.query, function(error, itemJson){
          if (error) {
            res.send( error, 500);
          } else {
            res.json( itemJson );
          }
        });
      }
    });
  };

  // gets the items data 
  // this means 
  this.findItemData = function(req, res){
    var self = this;
    // closure that actually goes out gets the data
    var _get = function(id, item, key, options, callback){
       agol.find( id, function( err, data ){
        if (err) {
          callback(err, null);
        } else {
          // Get the item
          if ( !parseInt(options.layer) ){
            options.layer = 0;
          }

          agol.getItemData( data.host, item, key, options, function(error, itemJson){
            if (error) {
              callback( error, null);
            // if we have status return right away
            } else if ( itemJson.koop_status == 'processing'){
              // return w/202 
              var response = {
                status: 'processing',
                count: 0
              }; 
              if ( itemJson.generating ){
                response.generating = itemJson.generating;
              }
              res.json( response, 202);
            } else {
              callback( null, itemJson );
            }
          });
        }
      });  
    };

    // CHECK the time since our last cache entry 
    // if > 24 hours since; clear cache and wipe files 
    // else move on
    var table_key = ['agol', req.params.item, (req.params.layer || 0)].join(':');
    agol.getInfo(table_key, function(err, info){

      if (info && info.status == 'processing'){ 
        // return immediately if processing
        agol.log('info', 'processing still... return 202');
        agol.getCount(table_key, function(err, count){
          res.json( { 
            status: 'processing',
            count: count
          }, 202);
        })
      } else { 

        // check if the cache is expired
        var is_expired = info ? ( new Date().getTime() >= info.expires_at ) : false;

        // check for info on last edit date (for hosted services dont expired unless changed) 
        // set is_expired to false if it hasnt changed or if its null
        if ( info && info.retrieved_at && info.info && info.info.editingInfo ) {             
          if ( !info.info.editingInfo.lastEditDate || ( info.retrieved_at < info.info.editingInfo.lastEditDate )){
            is_expired = false;
          }
        }


        // check format for exporting data
        if ( req.params.format ){

          // redirect to thumbnail for png access
          if (req.params.format == 'png'){
            //self.thumbnail(req, res);
            
            
          } else {

            // change geojson to json
            req.params.format = req.params.format.replace('geojson', 'json');
            // use the item as the file dir so we can organize exports by id
            var dir = req.params.item + '_' + ( req.params.layer || 0 );
            // the file name for the export   
            var fileName = [agol.cacheDir() + 'files', dir, key + '.' + req.params.format].join('/');

            // if we know the name and its a zip request; check for file via name
            if (info && req.params.format == 'zip'){
              var name = info.info.name || info.info.title;
              fileName = [agol.cacheDir() + 'files', dir, key, name + '.' + req.params.format].join('/');
            }
            // if we have a layer then append it to the query params 
            if ( req.params.layer ) {
              req.query.layer = req.params.layer;
            }

            // does the data export already exist? 
            if ( fs.existsSync( fileName ) && !is_expired ){
              // return it.
              Controller.returnFile(req, res, dir, key, fileName);

            // ELSE the data exist but the cache is expired...
            // return the file, but make sure we kick off a new request to re-populate the cache 
            } else if (fs.existsSync( fileName ) && is_expired) {
              if ( req.query.url_only ){
                var origUrl = req.originalUrl.split('?');
                res.json({url: req.protocol +'://'+req.get('host') + origUrl[0] + '?' + origUrl[1].replace(/url_only=true&|url_only=true/,'')});
              } else {
                if (req.params.format == 'json' || req.params.format == 'geojson'){
                  res.contentType('text');
                }
                res.sendfile( fileName );
                agol.find( req.params.id, function( err, data ){
                    if ( !parseInt(req.query.layer) ){
                      req.query.layer = 0;
                    }

                    agol.getItemData( data.host, req.params.item, key, req.query, function(error, itemJson){
                     
                      req.query.ignore_cache = true;
 
                      if (itemJson.koop_status && itemJson.koop_status == 'too big'){
                        // export as a series of small queries/files
                        var table = 'agol:' + req.params.item + ':' + ( req.params.layer || 0 );
                        req.query.name = (itemJson.data[0]) ? itemJson.data[0].info.name || itemJson. data[0].info.title : itemJson.name;
                        // set the geometry type so the exporter can do its thing for csv points (add x,y)
                        req.query.geomType = itemJson.data[0].info.geometryType;
                        Exporter.exportLarge( req.params.format, req.params.item, key, 'agol', req.query, function(err, result){
                          console.log('Done creating large file for', key);
                        });
                      } else {
                        Exporter.exportToFormat( req.params.format, dir, key, itemJson.data[0], {name:itemJson.data[0].info.name || itemJson.data[0].info.title}, function(err, result){
                          console.log('Done creating file for', key);
                        });
                      }
                    });
                });
              }
            } else {
              // check the koop status table to see if we have a job running 
                // if we do then return 
                // else proceed 
              req.query.format = req.params.format;
              _get(req.params.id, req.params.item, key, req.query, function( err, itemJson ){
                if (err){
                  if ( err.code && err.error ){
                    res.send( err.error, err.code );
                  } else {
                    res.send( err, 500);
                  }
                } else if ( !itemJson.data[0].features.length ){
                  agol.log('error', req.url +' No features in data');
                  res.send( 'No features exist for the requested FeatureService layer', 500 );
                } else {
                  if (itemJson.koop_status && itemJson.koop_status == 'too big'){
                    // export as a series of small queries/files
                    var table = 'agol:' + req.params.item + ':' + ( req.params.layer || 0 );

                    req.query.name = (itemJson.data[0]) ? itemJson.data[0].info.name || itemJson.data[0].info.title : itemJson.name; 
                    // set the geometry type so the exporter can do its thing for csv points (add x,y)
                    req.query.geomType = itemJson.data[0].info.geometryType;

                    agol.exportLarge( req.params.format, req.params.item, key, 'agol', req.query, function(err, result){
                      if (result && result.status && result.status == 'processing'){
                        res.json( { status: 'processing', count: 0 }, 202);          
                      } else if ( req.query.url_only ){
                        var origUrl = req.originalUrl.split('?');
                        res.json({url: req.protocol +'://'+req.get('host') + origUrl[0] + '?' + origUrl[1].replace(/url_only=true&|url_only=true/,'')});
                      } else {
                        if (err) {
                          res.send( err, 500 );
                        } else {
                          if (req.params.format == 'json' || req.params.format == 'geojson'){
                            res.contentType('text');
                          }
                          res.sendfile(result);
                        }
                      }
                    });
                  } else {
                    var name = ( itemJson.data[0] && itemJson.data[0].info ) ? itemJson.data[0].info.name || itemJson.data[0].info.title : itemJson.name;
                    agol.exportToFormat( req.params.format, dir, key, itemJson.data[0], { name: name }, function(err, result){
                      if ( req.query.url_only ){
                        var origUrl = req.originalUrl.split('?');
                        res.json({url: req.protocol +'://'+req.get('host') + origUrl[0] + '?' + origUrl[1].replace(/url_only=true&|url_only=true/,'')});
                      } else {
                        if (err) {
                          res.send( err, 500 );
                        } else {
                          if (req.params.format == 'json' || req.params.format == 'geojson'){
                            res.contentType('text');
                          }
                          res.sendfile(result);
                        }
                      }
                    });
                  }
                }
              });
            }
          }
        } else {
          // if we have a layer then append it to the query params 
          if ( req.params.layer ) {
            req.query.layer = req.params.layer;
          }
          // get the esri json data for the service
          _get(req.params.id, req.params.item, key, req.query, function( err, itemJson ){
              if (err) {
                if ( err.code && err.error ){
                  res.send( err.error, err.code );
                } else {
                  res.send( err, 500);
                }
              } else {
                if ( itemJson && itemJson.data && itemJson.data[0].features.length > 1000){
                  itemJson.data[0].features = itemJson.data[0].features.splice(0,1000);
                }
                res.send( itemJson );
              }
          });
        }
      }
    });
  };

  this.returnFile = function( req, res, dir, key, fileName ){
    setTimeout(function () {
      // block the process until the file has a size greater than 5 byts
      // this is a hack for times when the request gets files that are still writing to disk
      if ( !fs.statSync( fileName ).size > 5 ) {
        setTimeout(arguments.callee, 25);
        return;
      }

    if ( req.query.url_only ){
      var origUrl = req.originalUrl.split('?');
      res.json({url: req.protocol +'://'+req.get('host') + origUrl[0] + '?' + origUrl[1].replace(/url_only=true&|url_only=true/,'')});
    } else {
      if (req.params.format == 'json' || req.params.format == 'geojson'){
        res.contentType('text');
      }
      res.sendfile( fileName );
    }
    }, 0);
  };

  this.featureserver = function( req, res ){
    var self = this;
    var callback = req.query.callback;
    delete req.query.callback;

    // support POST requests; map body vals to the query 
    // (then all same as GET)
    for (var k in req.body){
      req.query[k] = req.body[k];
    }

    if (!req.params.layer){
      req.query.layer = 0;
    }

    agol.find(req.params.id, function(err, data){
      if (err) {
        res.send( err, 500);
      } else {
        // sort the req.query before we hash so we are consistent 
        var sorted_query = {};
        _(req.query).keys().sort().each(function (key) {
          if (key != 'url_only'){
            sorted_query[key] = req.query[key];
          }
        });
        // build the file key as an MD5 hash that's a join on the paams and look for the file 
        var toHash = req.params.item + '_' + ( req.params.layer || 0 ) + JSON.stringify( sorted_query );
        var key = crypto.createHash('md5').update(toHash).digest('hex');
        // Get the item 

        // set a really high limit so large datasets can be turned into feature services 
        req.query.limit = 1000000000;
        agol.getItemData( data.host, req.params.item, key, req.query, function(error, itemJson){
          if (error) {
            if (error.code && error.error){
              res.send( error.error, error.code);
            } else {
              res.send( error, 500);
            }
          } else {
            // pass to the shared logic for FeatureService routing
            BaseController._processFeatureServer( req, res, err, itemJson.data, callback);
          }
        });
      }
    });
     
  };


  this.thumbnail = function(req, res){
     agol.find(req.params.id, function(err, data){
      if (err) {
        res.send( err, 500);
      } else {

        // check the image first and return if exists
        var key = ['agol', req.params.id, req.params.item, (req.params.layer || 0)].join(':');
        var dir = agol.cacheDir() + '/thumbs';
        req.query.width = parseInt( req.query.width ) || 150;
        req.query.height = parseInt( req.query.height ) || 150;
        req.query.f_base = dir + '/' + req.params.item + '/'+ req.params.item +'::' + req.query.width + '::' + req.query.height;
        var png = req.query.f_base+'.png';

        //var fileName = .exists(key, req.query); 
        if ( fs.existsSync(png) ){
          res.sendfile( png );
        } else {

          // if we have a layer then pass it along
          if ( req.params.layer ) {
            req.query.layer = req.params.layer;
          }
          // sort the req.query before we hash so we are consistent 
          var sorted_query = {};
          _(req.query).keys().sort().each(function (key) {
            if (key != 'url_only'){
              sorted_query[key] = req.query[key];
            }
          });
          // build the file key as an MD5 hash that's a join on the paams and look for the file 
          var toHash = req.params.item + '_' + ( req.params.layer || 0 ) + JSON.stringify( sorted_query );
          key = crypto.createHash('md5').update(toHash).digest('hex');

          // Get the item 
          agol.getItemData( data.host, req.params.item, key, req.query, function(error, itemJson){
            if (error) {
              res.send( error, 500);
            } else {
                if ( itemJson.extent && itemJson.extent.length ){
                  req.query.extent = {
                    xmin: itemJson.extent[0][0],
                    ymin: itemJson.extent[0][1],
                    xmax: itemJson.extent[1][0],
                    ymax: itemJson.extent[1][1]
                  }; 
                }

                // generate a thumbnail
                delete itemJson.data[0].info;
                agol.generateThumbnail( itemJson.data[0], req.params.item, req.query, function(err, file){
                  if (err){
                    res.send(err, 500);
                  } else {
                    // send back image
                    res.sendfile( file );
                  }
                });
                
            }
          });
        }
      }
    });

  };

  // renders the preview map view
  this.preview = function(req, res){
    agol.log('info', "Render preview " + JSON.stringify( req.params ) );
    res.render(__dirname + '/../views/demo', { locals: { host: req.params.id, item: req.params.item } });
  };

  // handled tile requests 
  // gets a z, x, y and a format 
  this.tiles = function( req, res ){
    var callback = req.query.callback;
    delete req.query.callback;

    var key,
      layer = req.params.layer || 0;

    // if no format given default to png 
    if ( !req.params.format ){
      req.params.format = 'png';
    }

    // Get the tile and send the response to the client
    var _send = function( err, data ){
      req.params.key = req.params.item + ':' + layer;
      agol.tileGet( req.params, data[0], function(err, tile){
        if ( req.params.format == 'png' || req.params.format == 'pbf'){
          res.sendfile( tile );
        } else {
          if ( callback ){
            res.send( callback + '(' + JSON.stringify( JSON.parse( fs.readFileSync( tile ) ) ) + ')' );
          } else {
            res.json( JSON.parse( fs.readFileSync( tile ) ) );
          }
        }
      });
    };

    // build the geometry from z,x,y
    var bounds = merc.bbox( req.params.x, req.params.y, req.params.z );
    req.query.geometry = {
        xmin: bounds[0],
        ymin: bounds[1],
        xmax: bounds[2],
        ymax: bounds[3],
        spatialReference: { wkid: 4326 }
    };

    var _sendImmediate = function( file ){
      console.log(file);
      if ( req.params.format == 'png' || req.params.format == 'pbf'){
        res.sendfile( file );
      } else {
        if ( callback ){
          res.send( callback + '(' + JSON.stringify( JSON.parse( fs.readFileSync( file ) ) ) + ')' );
        } else {
          res.json( JSON.parse( fs.readFileSync( file ) ) );
        }
      }
    }; 

    key = ['agol', req.params.id, req.params.item].join(':');
    var file = agol.cacheDir + 'tiles/';
      file += key + ':' + layer + '/' + req.params.format;
      file += '/' + req.params.z + '/' + req.params.x + '/' + req.params.y + '.' + req.params.format;

    var jsonFile = file.replace(/png|pbf|utf/g, 'json');

    console.log(file)
    // if the json file alreadty exists, dont hit the db, just send the data
    if (fs.existsSync(jsonFile) && !fs.existsSync( file ) ){
      
      _send( null, [JSON.parse(fs.readFileSync( jsonFile ))] );

    } else if ( !fs.existsSync( file ) ) {
      agol.find(req.params.id, function(err, data){
        if (err) {
          res.send( err, 500);
        } else {
          // if we have a layer then pass it along
          if ( req.params.layer ) {
            req.query.layer = req.params.layer;
          }

          // sort the req.query before we hash so we are consistent 
          var sorted_query = {};
          _(req.query).keys().sort().each(function (key) {
            if (key != 'url_only'){
              sorted_query[key] = req.query[key];
            }
          });
          // build the file key as an MD5 hash that's a join on the paams and look for the file 
          var toHash = req.params.item + '_' + ( req.params.layer || 0 ) + JSON.stringify( sorted_query );
          var hash = crypto.createHash('md5').update(toHash).digest('hex');

          var factor = .1;
//          req.query.simplify = ( ( Math.abs( req.query.geometry.xmin - req.query.geometry.xmax ) ) / 256) * factor; 


          // Get the item
          agol.getItemData( data.host, req.params.item, hash, req.query, function(error, itemJson){
            if (error) {
              if ( itemJson && itemJson.type == 'Image Service' && req.params.format == 'png' ){
                Tiles.getImageServiceTile( req.params, function(err, newFile){
                  _sendImmediate( newFile );
                });
              } else {
                res.send( error, 500);
              }
            } else {
              _send(error, itemJson.data);
            }
          });
        }
      });
    } else {
      _sendImmediate(file);
    }
  },

  // logic for handling service level, multi-layer tiles 
  servicetiles: function(req, res){

    if ( !req.params.format){
      req.params.format = 'png';
    }

    // save the callback to append to the response when ready
    var callback = req.query.callback;
    delete req.query.callback;

    var key,
      layer = req.params.layer || 0;

    // if no format given default to png 
    if ( !req.params.format ){
      req.params.format = 'png';
    }

    // build the geometry from z,x,y
    var bounds = merc.bbox( req.params.x, req.params.y, req.params.z );
    req.query.geometry = {
        xmin: bounds[0],
        ymin: bounds[1],
        xmax: bounds[2],
        ymax: bounds[3],
        spatialReference: { wkid: 4326 }
    };

    // Get the tile and send the response to the client
    var _send = function( err, info ){
      req.params.key = key;
      req.params.type = 'agol';
      Tiles.getServiceTile( req.params, info, function(err, tile){
        if ( err ){
          res.send( err, 401 );
          return;
        }
        res.sendfile( tile );
      });
    };

    // file key tells is a combo key for standardizing look ups in the fs.system 
    var key = [req.params.item,'all'].join(':');
    // build the names of the files 
    // Note that the layer id would be present in service level tiles 
    var file = config.data_dir + 'tiles/';
      file += key + '/' + req.params.format;
      file += '/' + req.params.z + '/' + req.params.x + '/' + req.params.y + '.' + req.params.format;

    if ( !fs.existsSync(file)){
      agol.find( req.params.id, function( err, data ){
        if (err) {
          res.send( err, 500);
        } else {

          // sort the req.query before we hash so we are consistent 
          var sorted_query = {};
          _(req.query).keys().sort().each(function (key) {
            if (key != 'url_only'){
              sorted_query[key] = req.query[key];
            }
          });
          //req.query.simplify = true;
          //req.query.zoom = req.params.z;

          // Get the item
          agol.getServiceLayerData( data.host, req.params.item, null, req.query, function(error, itemJson){
            if (error) {
              res.send( error, 500);
            } else {
              // send the data for the tile to Tiles 
              _send(error, itemJson);
            }
          });
        }
      });

    } else {
      res.sendfile( file );
    }

  };

  return this;

};

module.exports = Controller;
