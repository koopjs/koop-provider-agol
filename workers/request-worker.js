var kue = require('kue'),
  cluster = require('cluster'),
  koop = require('koop/lib'),
  pgcache = require('koop-pgcache'),
  request = require('request'),
  http = require('http'),
  https = require('https'),
  zlib = require('zlib'),
  url = require('url'),
  async = require('async'),
  argv = require('yargs').argv,
  config = require('config');

// store these here so we can easily use refs to them based on protocol types
var protocols = {
  http: http, 
  https: https
};

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
}, 5000);


// makes the request to the feature service and inserts the Features
function makeRequest(job, done){
  var domain = require('domain').create();

  domain.on('error', function(err){
    requestQ.kill();
    done(err);
  });

  domain.run(function(){
    console.log( 'starting job', job.id);
    var id = job.data.id,
      layerId = job.data.layerId,
      len = job.data.pages.length,
      completed = 0;

    var killJob = function (msg, uri, error, code) {
      console.log('Killing job', id + '/' + layerId, msg);
      requestQ.kill();
      done(JSON.stringify({
        message: msg,
        request: uri,
        response: error,
        code: code || 500
      })); 
    };
        
    var requestFeatures = function (task, cb) {
      var uri = encodeURI( decodeURI(task.req) );
      try { 

        var url_parts = url.parse( uri );
        var opts = {
          method: 'GET',
          port: (url_parts.protocol === 'https:') ? 443 : url_parts.port || 80,
          hostname: url_parts.hostname,
          path: url_parts.path,
          headers: { 
            'User-Agent': 'esri-koop', 
            'Accept-Encoding': 'gzip, deflate' 
          }
        };
        var reqStart = Date.now();
        // make an http or https request based on the protocol
        var req = ((url_parts.protocol === 'https:') ? protocols.https : protocols.http ).request(opts, function(response) {
          var data = [];
          response.on('data', function (chunk) {
            data.push(chunk);
          });

          response.on('error', function(err){
             catchErrors(task, err, uri, cb);
          });

          response.on('end', function () {
            if (argv.debug) console.log('Request took:', (Date.now() - reqStart) / 1000);
            try {
              var json;

              var buffer = Buffer.concat(data);
              var encoding = response.headers['content-encoding'];

              if (encoding === 'gzip') {
                var buff = zlib.gunzip(buffer, function (e, result) {
                  try {
                    json = JSON.parse(result.toString().replace(/NaN/g, 'null'));
                    processJSON(json, task, uri, job, cb);
                  } catch (e) {
                    catchErrors(task, e, uri, cb);
                  }
                });
              } else if (encoding === 'deflate') {
                try {
                  json = JSON.parse(zlib.inflateSync(buffer).toString());
                  processJSON(json, task, uri, job, cb);
                } catch (e) {
                  catchErrors(task, e, uri, cb);
                }
              } else {
                json = JSON.parse(buffer.toString().replace(/NaN/g, 'null'));
                processJSON(json, task, uri, job, cb);
              }
            } catch(e){
              catchErrors(task, e, uri, cb);
            }
          });
        });

        // we need this error catch to handle ECONNRESET
        req.on('error', function(err){
          catchErrors(task, err, uri, cb);
        });

        req.end();
      } catch(e){
        catchErrors(task, e, uri, cb);
      } 
    };

    var processJSON = function(json, task, uri, job, cb){
      
      if ( json.error ){
        catchErrors(task, JSON.stringify(json.error), uri, cb);
      } else {
        // insert a partial
        var start = Date.now();
        koop.GeoJSON.fromEsri( job.data.fields || [], json, function(err, geojson){
          if (argv.debug) console.log('Geojson from Esri took:', (Date.now() - start) / 1000);
          start = Date.now(); 
          koop.Cache.insertPartial( 'agol', id, geojson, layerId, function( err, success){
            if (argv.debug) console.log('Geojson Insert took:', (Date.now() - start) / 1000);
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
                  return done(err);
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
      if (task.retry && task.retry === 3 ){
        koop.log.error( 'failed to parse json, not trying again '+ task.req +' '+ e);
        try {
          var jsonErr = JSON.parse(e);
          killJob('Failed to request a page of features', url, jsonErr.message, jsonErr.code);
        } catch (parseErr) {
          killJob('Failed to request a page of features', url, parseErr);
        }
        return;
      } else {
        if (!task.retry){
          task.retry = 1;
        } else {
          task.retry++;
        }
        koop.log.info('Re-requesting page '+ task.req +' '+ e + ' - ' + task.retry );
        // the timeout simulated a backoff by delaying adding it back to the queue
        setTimeout(function () {
          requestQ.push( task, function(err){ if (err) { koop.log.error(err); } });
        }, task.retry * 1000);
        try {
          return callback();
        } catch (e) {
          koop.log.error( 'failed to call a callback in catch errors '+ task.req +' '+ e);
        }
      }
    };


    // Add each request to the internal queue 
    job.data.pages.forEach(function(task, i){
      requestQ.push( task, noOp);
      return;
    });

  });
}

