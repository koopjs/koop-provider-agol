var kue = require('kue'),
  cluster = require('cluster'),
  koop = require('koop-server/lib'),
  request = require('request'),
  async = require('async'),
  config = require('config');

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

// Start 4 worker processes
// TODO this should be configurable
/*var clusterWorkerSize = 4;

if (cluster.isMaster) {
  for (var i = 0; i < clusterWorkerSize; i++) {
    cluster.fork();
  }
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
} else {*/

  jobs.process('agol', function(job, done){
    makeRequest(job, done);
  });

//}

// makes the request to the feature service and inserts the Features
function makeRequest(job, done){
  console.log( 'starting job', job.id );
  var id = job.data.id,
    layerId = job.data.layerId,
    len = job.data.pages.length,
    completed = 0;

  var requestQ = async.queue(function(task, cb){
    var url = task.req;

    request.get( url, function( err, data, response ){
      try {
        // so sometimes server returns these crazy asterisks in the coords
        // I do a regex to replace them in both the case that I've found them
        data.body = data.body.replace(/\*+/g,'null');
        data.body = data.body.replace(/\.null/g, '');
        var json = JSON.parse(data.body.replace(/NaN/g, 'null'));
        if ( json.error ){
          done( json.error.details[0] );
        } else {
          // insert a partial
          koop.GeoJSON.fromEsri( [], json, function(err, geojson){
            koop.Cache.insertPartial( 'agol', id, geojson, layerId, function( err, success){
              if (err) {
                catchErrors(task, e, url, cb);
              }
              completed++;
              job.progress( completed, len );
              if ( completed == len ) {
                var key = [ 'agol', id, layerId ].join(':');
                koop.Cache.getInfo(key, function(err, info){
                  delete info.status;
                  koop.Cache.updateInfo(key, info, function(err, info){
                    done();
                    cb();
                  });
                });
              }
              else {
                cb();
              }
            });
          });
        }
      } catch(e){
        catchErrors(task, e, url, cb);
      }
    });
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
    } else if (task.retry && task.retry == 3 ){
      koop.log.error( 'failed to parse json, not trying again '+ task.req +' '+ e);
      done('Failed to request a page of features' + url);
    } else {
      task.retry = 1;
      koop.log.info('Re-requesting page '+ task.req +' '+ e);
      requestQ.push(task, noOp);
    }
    return callback();
  };


  // Add each request to the internal queue 
  job.data.pages.forEach(function(task, i){
    task.num = i;
    requestQ.push( task, noOp);
  });
  

}

