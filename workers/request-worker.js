var kue = require('kue'),
  cluster = require('cluster'),
  agol = require('../index'),
  koop = require('koop-server/lib'),
  request = require('request'),
  reds = require('reds');
  config = require('config');


var search;
function getSearch() {
    if (search) return search;
    reds.createClient = require('redis').createClient;
    return search = reds.createSearch(jobs.client.getKey('search'));
}

koop.log = new koop.Logger( config );
koop.Cache = new koop.DataCache( koop );

// Start the Cache DB with the conn string from config
if ( config && config.db ) {
  if ( config.db.postgis ) {
    koop.Cache.db = koop.PostGIS.connect( config.db.postgis.conn );
  } else if ( config && config.db.sqlite ) {
    koop.Cache.db = koop.SQLite.connect( config.db.sqlite );
  }
  koop.Cache.db.log = koop.log;
} else if (config && !config.db){
  console.log('Exiting since no DB configuration found in config');
  process.exit();
}

jobs = kue.createQueue({
  prefix: 'q',
  redis: {
    port: config.redis.port,
    host: config.redis.host
  }
});

console.log(jobs);

var clusterWorkerSize = 4;

if (cluster.isMaster) {
  kue.app.listen(process.env.PORT || 3000);
  for (var i = 0; i < clusterWorkerSize; i++) {
    cluster.fork();
  }
  process.once( 'SIGINT', function ( sig ) {
    jobs.active(function(err, ids){
      console.log(ids)
      if ( ids.length ){
        ids.forEach( function( id ) {
          kue.Job.get( id, function( err, job ) {
            job.inactive();
            jobs.active(function(err, activeIds){
              if (!activeIds.length){
               jobs.shutdown(function(err) {
                 console.log( 'Koop Kue is shut down.', err||'' );
                 process.exit( 0 );
               }, 5000 );
              }
            });
          });
        });
      } else {
        jobs.shutdown(function(err) {
          console.log( 'Koop Kue is shut down.', err||'' );
          process.exit( 0 );
        }, 5000 );
      }
    });
  });
} else {
  jobs.process('agol', function(job, done){
    makeRequest(job.id, job.data, done);
  });
}


function makeRequest(jobId, data, done){
  console.log( 'starting job', jobId );
  var url = data.req, 
    id = data.id,
    layerId = data.layerId,
    searchKey = data.searchKey;

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
            var key = [ 'agol', id, layerId ].join(':');
            setTimeout(function () {
              // get the status of complete jobs with the same search_key 
              getSearch().query(searchKey).end(function (err, ids) { 
              //jobs.client.keys(searchKey, function(err, d){
              console.log(err,ids);
              //console.log(jobs.client)
              koop.Cache.getInfo(key, function(err, info){
                info.request_jobs.processed += 1;
                info.request_jobs.jobs[jobId] = 'done';
                console.log(info.request_jobs.processed, Object.keys(info.request_jobs.jobs).length, searchKey);
                if (info.request_jobs.processed == info.request_jobs.total){
                  delete info.status;
                }
                koop.Cache.updateInfo(key, info, function(err, info){
                  done();
                });
              });
              });             
            }, Math.floor(Math.random() * 3000));
          });
        });
      }
    } catch(e){
      console.log('failed to get data?', jobId, e );
      done('Failed to request page ' + url);
    }
  });

}

