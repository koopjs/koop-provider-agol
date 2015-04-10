var kue = require('kue'),
  cluster = require('cluster'),
  koop = require('koop/lib'),
  pgcache = require('koop-pgcache'),
  request = require('request'),
  http = require('http'),
  https = require('https'),
  url = require('url'),
  async = require('async'),
  config = require('config');

// store these here so we can easily use refs to them based on protocol types
var protocols = {
  http: http, 
  https: https
};

//require('look').start();

// Init Koop with things it needs like a log and Cache 
koop.log = new koop.Logger( config );
koop.Cache = new koop.DataCache( koop );

// registers a DB modules  
koop.Cache.db = pgcache.connect( config.db.conn, koop );


// Create the job queue for this worker process
// connects to the redis same redis
// TODO think about how we partition dev/QA/prod 
var jobs = kue.createQueue({
  prefix: config.redis.prefix,
  redis: {
    port: config.redis.port,
    host: config.redis.host
  }
});

process.once( 'SIGINT', function ( sig ) {
  jobs.active(function(err, ids){
    if ( ids.length ){
      ids.forEach( function( id ) {
        kue.Job.get( id, function( err, job ) {
          job.inactive();
          jobs.active(function(err, activeIds){
            if (!activeIds.length){
             jobs.shutdown(function(err) {
               process.exit( 0 );
             }, 5000 );
            }
          });
        });
      });
    } else {
      jobs.shutdown(function(err) {
        process.exit( 0 );
      }, 5000 );
    }
  });
});

jobs.process('agol', function(job, done){
  makeRequest(job, done);
});


setInterval(function () {
    if (typeof gc === 'function') {
        gc();
    }
    //console.log('Memory Usage', process.memoryUsage());
}, 5000);


// makes the request to the feature service and inserts the Features
function makeRequest(job, done){
  console.log( 'starting job', job.id);
  var id = job.data.id,
    layerId = job.data.layerId,
    len = job.data.pages.length,
    completed = 0;
      
  var requestFeatures = function(task, cb){
    var uri = encodeURI( decodeURI(task.req) );
    try { 

      var url_parts = url.parse( uri );
      var opts = {
        method: 'GET',
        port: (url_parts.protocol === 'https:') ? 443 : url_parts.port || 80,
        hostname: url_parts.hostname,
        path: url_parts.path,
        headers: { 'User-Agent': 'esri-koop' }
      };

      // make an http or https request based on the protocol
      var req = ((url_parts.protocol === 'https:') ? protocols.https : protocols.http ).request(opts, function(response) {
        var data = '';
        response.on('data', function (chunk) {
          data += chunk;
        });

        response.on('error', function(err){
           catchErrors(task, err, uri, cb);
        });

        response.on('end', function () {
          try {
            // so sometimes server returns these crazy asterisks in the coords
            // I do a regex to replace them in both the case that I've found them
            data = data.replace(/\*+/g,'null');
            data = data.replace(/\.null/g, '');
            var json = JSON.parse(data.replace(/NaN/g, 'null'));

            if ( json.error ){

              catchErrors(task, JSON.stringify(json.error), uri, cb);

            } else {
              // insert a partial
              koop.GeoJSON.fromEsri( job.data.fields || [], json, function(err, geojson){
                koop.Cache.insertPartial( 'agol', id, geojson, layerId, function( err, success){
                  // when we gets errors on insert the whole job needs to stop
                  // most often this error means the cache was dropped
                  if (err) {
                    done(err);
                    requestQ.tasks = [];
                    requestQ.kill();
                  }
                  completed++;
                  console.log(completed, len, id);
                  job.progress( completed, len );
                  
                  // clean up our big vars            
                  json = null;
                  geojson = null;
                  response = null;
                  data = null;

                  if ( completed == len ) {
                    var key = [ 'agol', id, layerId ].join(':');
                    koop.Cache.getInfo(key, function(err, info){
                      if (err){
                        koop.log.error(err);
                        return done();
                      }
                      if ( info && info.status ) { 
                        delete info.status;
                      }
                      koop.Cache.updateInfo(key, info, function(err, info){
                        done();
                        process.nextTick(cb);
                        return;
                      });
                      return;
                    });
                  } else {
                    process.nextTick(cb);
                    return;
                  }

                });
              });
            }
          } catch(e){
            catchErrors(task, e, uri, cb);
          }
        });
      });

      req.on('error', function(err){
        catchErrors(task, err, uri, cb);
      });

      req.end();
    } catch(e){
      catchErrors(task, e, uri, cb);
    } 
  };


  var requestQ = async.queue(function(task, callback){
    requestFeatures(task, callback);
  }, job.data.concurrency);

  // null operation fn to log errors from queue
  var noOp = function(err){ 
    if (err) {
      koop.log.error(err); 
    }
  }; 

  // Catches errors from the Queue and check for a retry < 3 
  // puts back on the queue if < 3 retries
  // errors the entire job if if fails  
  var catchErrors = function( task, e, url, callback){
    if ( task.retry && task.retry < 3 ){
      task.retry++;
      requestQ.push( task, function(err){ if (err) { koop.log.error(err); } });
      return callback();
    } else if (task.retry && task.retry == 3 ){
      koop.log.error( 'failed to parse json, not trying again '+ task.req +' '+ e);
      try {
        var jsonErr = JSON.parse(e);
        done(JSON.stringify({
          message: 'Failed to request a page of features',
          request: url,
          response: jsonErr.message,
          code: jsonErr.code
        }));
      } catch(parseErr){
        done(JSON.stringify({
          message: 'Failed to request a page of features',
          request: url,
          response: e,
          code: null
        }));
      }
      return;
    } else {
      task.retry = 1;
      koop.log.info('Re-requesting page '+ task.req +' '+ e);
      requestQ.push( task, function(err){ if (err) { koop.log.error(err); } });
      return callback();
    }
  };


  // Add each request to the internal queue 
  job.data.pages.forEach(function(task, i){
    requestQ.push( task, noOp);
    return;
  });

}

