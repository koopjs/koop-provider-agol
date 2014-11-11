var kue = require('kue'),
  cluster = require('cluster'),
  agol = require('../index'),
  koop = require('koop-server/lib'),
  request = require('request'),
  config = require('config'),
  jobs = kue.createQueue();

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
    port: 6379,
    host: '127.0.0.1'
  }
});

var clusterWorkerSize = 4; //require('os').cpus().length;

if (cluster.isMaster) {
  kue.app.listen(process.env.PORT || 3000);
  for (var i = 0; i < clusterWorkerSize; i++) {
    cluster.fork();
  }
} else {
  jobs.process('agol', 2, function(job, done){
    console.log(job.data);
    makeRequest(job.data.req, job.data.id, job.data.layerId, done);
  });
}


function makeRequest(url, id, layerId, done){
  request.get(url, function(err, data, response){
    try {
      // so sometimes server returns these crazy asterisks in the coords
      // I do a regex to replace them in both the case that I've found them
      data.body = data.body.replace(/\*+/g,'null');
      data.body = data.body.replace(/\.null/g, '');
      var json = JSON.parse(data.body.replace(/OwnerPLY\./g,'').replace(/NaN/g, 'null'));
      if ( json.error ){
        done( json.error.details[0] );
      } else {
        // insert a partial
        koop.GeoJSON.fromEsri( [], json, function(err, geojson){
          koop.Cache.insertPartial( 'agol', id, geojson, layerId, function( err, success){
            var key = [ 'agol', id, layerId ].join(':');
            koop.Cache.getInfo(key, function(err, info){
              info.request_jobs.processed++;
              console.log(info.request_jobs);
              if (info.request_jobs.processed == info.request_jobs.total){
                delete info.status;
              }
              koop.Cache.updateInfo(key, info, function(err, info){
                done();
              });
            });
          });
        });
      }
    } catch(e){
      //agol.log('info','Requesting page '+ task.req +' '+ err);
      console.log(e);
      done('Failed to request page ' + url);
    }
  });

}

process.once( 'SIGTERM', function ( sig ) {
  queue.shutdown(function(err) {
    console.log( 'Koop Kue is shut down.', err||'' );
    process.exit( 0 );
  }, 5000 );
});
