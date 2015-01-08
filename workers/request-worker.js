var kue = require('kue'),
  cluster = require('cluster'),
  koop = require('koop/lib'),
  request = require('request'),
  http = require('http'),
  https = require('https'),
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

// Start the Cache DB with the conn string from config
// the workers connect to the same DB as their corresponding koop
if ( config && config.db ) {
  if ( config.db.postgis ) {
    koop.Cache.db = koop.PostGIS.connect( config.db.postgis.conn );
  } else if ( config && config.db.sqlite ) {
    koop.Cache.db = koop.SQLite.connect( config.db.sqlite );
  }
  koop.Cache.db.log = koop.log;
} else if (config && !config.db){
  process.exit();
}


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
  console.log( 'starting job', job.id );
  var id = job.data.id,
    layerId = job.data.layerId,
    len = job.data.pages.length,
    completed = 0;

  var requestFeatures = function(task, cb){
    var url = task.req;
    try { 
      var request = ((url.substr(0,5) == 'https') ? protocols.https : protocols.http ).get(url, function(response) {
        var data = '';
        response.on('data', function (chunk) {
          data += chunk;
        });

        response.on('error', function(err){
           catchErrors(task, err, url, cb);
        });

        response.on('end', function () {

          try {
            // so sometimes server returns these crazy asterisks in the coords
            // I do a regex to replace them in both the case that I've found them
            data = data.replace(/\*+/g,'null');
            data = data.replace(/\.null/g, '');
            var json = JSON.parse(data.replace(/NaN/g, 'null'));

            if ( json.error ){

              catchErrors(task, JSON.stringify(json.error), url, cb);

            } else {
              // insert a partial
              koop.GeoJSON.fromEsri( job.data.fields || [], json, function(err, geojson){
                koop.Cache.insertPartial( 'agol', id, geojson, layerId, function( err, success){
                  if (err) {
                    catchErrors(task, err, url, cb);
                  }
                  completed++;
                  console.log(completed, len);
                  job.progress( completed, len );
                  
                  // clean up our big vars            
                  json = null;
                  geojson = null;
                  response = null;
                  data = null;

                  if ( completed == len ) {
                    var key = [ 'agol', id, layerId ].join(':');
                    koop.Cache.getInfo(key, function(err, info){
                      delete info.status;
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
            catchErrors(task, e, url, cb);
          }
        });
      });

      request.on('error', function(err){
         console.log('caught error', err, task);
         done('url returned an econnreset, not trying again');
      });
    } catch(e){
      console.log('error requesting page', e);
      catchErrors(task, e, url, cb);
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
      requestQ.push( task, noOp );
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
      requestQ.push(task, noOp);
      return callback();
    }
  };


  // Add each request to the internal queue 
  job.data.pages.forEach(function(task, i){
    requestQ.push( task, noOp);
    return;
  });

}

