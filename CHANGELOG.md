2014-11-16
==========

  * switching the order in which title and name are respected, title first
  * support for object ids in csv data

2014-11-13
==========

  * more name sanitization
  * tests passing and file names get more sanitization

2014-11-12
==========

  * failing page requests were not calling callback

2014-11-11
==========

  * returning generating
  * addingconfig
  * fixed csv name issue with csv in the name, still need better names

2014-11-10
==========

  * model tests passing
  * fixing typo

2014-11-07
==========

  * debugging double ogr2ogr calls and fixing ready url_only calls

2014-11-06
==========

  * making sure that file from url_only are created the same as non url_only
  * making url only respect json endpoint and format query params

2014-11-05
==========

  * removing parens from filenames
  * removing content-disposition for now
  * adding change log updaes
  * adding content-disposition to file exports
  * adding change log to repo
  * forcing file names to use layer names instead of generated hash keys

2014-11-04
==========

  * making koop-agol report its version

2014-10-30
==========

  * fixing itemjson info name
  * fixing missing var filePath

2014-10-28
==========

  * respecting json file types from s3

2014-10-27
==========

  * removing forced expiration

2014-10-21
==========

  * grr no status available
  * better version output
  * version 0.1.4
  * working out a new caching validation
  * shoring up the cache checking for hosted services

2014-10-15
==========

  * making tiles work again
  * readding exists check
  * cleaner logs for paging
  * making sure paths are consistent
  * always return count
  * fixing names of downloads

2014-10-14
==========

  * removing node.extend
  * handle errors for new service tables
  * adding status to provider

2014-10-13
==========

  * adding back route tests
  * tests pasing

2014-10-12
==========

  * new version of koop-server all working

2014-10-09
==========

  * move fs lookup to the model
  * remove all fs calls from controller
  * support for crazy stats json with wrong field names

2014-10-07
==========

  * text passing
  * fixed base controller inherit pattern
  * new pattern
  * adding log ability
  * refactored routes go one
  * working on deglobal fixes
  * all working
  * models/agol.js
  * tests passing
  * better pattern
  * refactor model access
  * controller tests pass
  * got a clean pattern
  * agol is looking pretty good
  * working on the right pattern
  * remove simplify code

2014-09-25
==========

  * Merge pull request [#21](https://github.com/Esri/koop-agol/issues/21) from Esri/image-service-tiles
    making image service serve tiles
  * making image service serve tiles
  * Merge pull request [#20](https://github.com/Esri/koop-agol/issues/20) from Esri/expired-caches
    fixing expired cache logic
  * fixing expired cache logic

2014-09-23
==========

  * fixing large csv download of data from fresh cache
  * Merge pull request [#19](https://github.com/Esri/koop-agol/issues/19) from Esri/large-csv-downloads
    large csv data needed to return with too big for downloads...
  * set the featureservice limit to 1billion so the cache respects large data in services
  * test passing; large csv data needed to return with too big for downloads to work

2014-09-22
==========

  * rolling back skiplimit
  * sending back count always
  * adds 413 errors to large csvs
  * Merge pull request [#18](https://github.com/Esri/koop-agol/issues/18) from Esri/csv-queue
    using a queue to controll concurrent csv requests on fresh caches
  * using a queue to controll concurrent csv requests on fresh caches
  * force a cache removall on csv to handle dup inserts
  * checking for updates to CSV data

2014-09-21
==========

  * fixing tests
  * bulk insert the csv data
  * support for bypassing the 10k row limit in queries

2014-09-18
==========

  * respect generating flag if present

2014-09-17
==========

  * Merge pull request [#17](https://github.com/Esri/koop-agol/issues/17) from Esri/featureservice-post
    adding POST support to feature service requests

2014-09-16
==========

  * adding POST support to feature service requests

2014-09-15
==========

  * Merge branch 'multi-layer-tiles'
  * fixing new empty table geoms
  * Merge pull request [#15](https://github.com/Esri/koop-agol/issues/15) from Esri/multi-layer-tiles
    Multi layer tiles

2014-09-14
==========

  * fixing insert issue with new geom column
  * tile logic for collecting all the metadata for layers in a service

2014-09-11
==========

  * fix for https bug

2014-09-10
==========

  * Merge pull request [#14](https://github.com/Esri/koop-agol/issues/14) from Esri/getcount-fix
    Getcount fix
  * add get count options
  * working on aggregate data json

2014-09-01
==========

  * Merge pull request [#13](https://github.com/Esri/koop-agol/issues/13) from Esri/202-file-export
    refactor the controller to check for files before returning 202

2014-08-30
==========

  * refactor the controller to check for files before returning 202

2014-08-28
==========

  * setting the user-agent for all gets

2014-08-27
==========

  * using Date.now is faster and cleaner
  * Merge pull request [#12](https://github.com/Esri/koop-agol/issues/12) from Esri/tmp-exports
    Tmp exports

2014-08-26
==========

  * support for expired data

2014-08-25
==========

  * working on tests
