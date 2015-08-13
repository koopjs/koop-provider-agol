# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## [1.1.2] - 2015-08-13
### Fixed
* No longer throwing an exception on good page requests

## [1.1.1] - 2015-08-13
### Fixed
* Use the correct version of Featureservice.js

## [1.1.0] - YANKED
### Added
* Using [JavaScript Standard Style](https://github.com/feross/standard)
* Dependency on a new node module: [featureservice](https://github.com/chelm/featureservice)
* New option to set the number of sockets per process

### Changed
* Refactored `models/agol.js` to extract shared code for paging feature service data.
* Refactored `workers/request-worker.js` to extract shared code for paging feature service data.
* Refactored `controller/index.js` to redude some of the complexity
* Refactored `controller/index.js` to centralize logic for host lookup and cache-keying
* Only check for expiration if we actually have a something in the cache
* Changed syntax for omitting things that shouldn't be in cache key

### Fixed
* GeoJSON saved to S3 is reused
* CSVs are only requested when they are expired

### Removed
* removed the all code for talking to Feature Services from both the model and the request worker. This helps reduce the deplucation of logic and code for paging over service features.
* CSV no longer checks for limit enforcement since there is a size limit of 5mb and feature service code limits requests to 1k

## [1.0.0] - 2015-07-09
### Changed
* Turned off auto-projections, instead passing outSR to file exports to handle projections on demand via query string.
* using console.time and console.timeEnd to debug request and insert times in the workers

### Added
* Using yargs to parse command line options in the workers, added the dep to the package.json.

## [0.4.1] - 2015-07-09
### Fixed
* Fixed a bug with the try/catch on failed gzip responses
* Fixed an issues where serviceInfo was null and the fields array was attempting to be read

### Changed
* Made retry of failed requests be 3 instead of 2

### Added
* added a backoff for re-requests of failed feature pages


## [0.4.0] - 2015-07-02
### Added
* a getItemMetadata to the model that will request item metadata and attach it to item json.
* passing metadata to koops file exporters
* tests for getItemMetadata

### Changed
* updated calls to file export methods to have less inputs. This is in anticipation of a larger controller and model refactor that is going to happen soon.

### Changed
* updated calls to file export methods to have less inputs. This is in anticipation of a larger controller and model refactor that is going to happen soon.

## [0.3.2] - 2015-06-29
### Fixed
* Fixed a bug with trying to access the maxRecordCount on service metadata when its undefined.
* Wrapping a json.parse in a try/catch to prevent parsing crashes on bad responses

### Added
* Killing all pending requests on a worker if the job fails

## [0.3.1] - 2015-06-24
## Changed
* removing \$ from any file name as it gives the export code problems on the command line.

## [0.3.0] - 2015-06-22
### Fixed
* A bug with workers where json containing NaN in response JSON was choking the json parsing. Now they get replaced with `null`.

### Added
* Wrapped workers functions in a domain to try to force clean exits on any unhandled errors
* Added a new route for accessing geohashes from `.../item/FeatureServer/0/geohash`.

## [0.2.12] - 2015-06-11
### Fixed
* A bug with requesting geohash the first time a dataset is seen, now responding with 202

## [0.2.11] - 2015-06-06
### Added
* Needed to add a couple headers to the geohash response when caches are expired.
* Added a project ROADMAP.md to lay out what's coming
* added .travis.yml finally
* geohash model and controller tests
* added a jsdocs to each method in the model

### Changed
* renamed "Expired" to "X-Expired" in an attempt to flag it as a custom header.

## [0.2.10] - 2015-06-05
## Changed
* Approprately sending back the geohash on empty caches when a geohash exists

## [0.2.9] - 2015-06-05
## Changed
* Sending an "Expired" header down with geohash json when the server is creating a new one

## [0.2.8] - 2015-06-04
### Changed
* Changed the way decaching works. Now we serve geohash until a new file is ready. Once a geohash is created users should always see it.
* Support for treating geohash requests with where clauses

## [0.2.7] - 2015-05-22
### Changed
* Saving all fields as arrays of fields names on dataset metadata

## [0.2.6] - 2015-05-21
### Changed
* Saving CSV headers in the metadata to support order fields in featureservices

## [0.2.5] - 2015-05-20
### Changed
* found an issue with logic around exporting data when there are no features in the DB yet. Added better logic.

## [0.2.4] - 2015-05-19
### Changed
* Protecting against CSV data duplication by preventing inserts that fail to create tables from inserting data.

## [0.2.3] - 2015-05-14
### Changed
* Forcing CSV data to remove each directory individually

## [0.2.2] - 2015-05-13
### Changed
* Fixed worker requests for gzip responses causing strange asterisks in responses
* Sending resultOffest and resultRecordCount to featureservices as limit/offset

## [0.2.1] - 2015-05-07
### Changed
* Changed the way geohashes are requested and processed by removing the paging and returning 202 while still processing
* Geohash routes now request the data to be cached if its not already
* Geohash requests now check the expiration of the data in the cache

### Added
* the agol model now has an `isExpired` method to easily check if the data in the cache are expired

## [0.2.0] - 2015-04-28
### Added
* support for requesting geohash aggregations

## [0.1.69] - 2015-04-14
### Changed
* fixed a callback issue with request workers where some requests error out and call task callbacks twice

---

## Pre clean changelog changes:

## 2014-11-16
  * switching the order in which title and name are respected, title first
  * support for object ids in csv data

## 2014-11-13
  * more name sanitization
  * tests passing and file names get more sanitization

## 2014-11-12
  * failing page requests were not calling callback

## 2014-11-11
  * returning generating
  * addingconfig
  * fixed csv name issue with csv in the name, still need better names

## 2014-11-10
  * model tests passing
  * fixing typo

## 2014-11-07
  * debugging double ogr2ogr calls and fixing ready url_only calls

## 2014-11-06
  * making sure that file from url_only are created the same as non url_only
  * making url only respect json endpoint and format query params

## 2014-11-05
  * removing parens from filenames
  * removing content-disposition for now
  * adding change log updaes
  * adding content-disposition to file exports
  * adding change log to repo
  * forcing file names to use layer names instead of generated hash keys

## 2014-11-04
  * making koop-agol report its version

## 2014-10-30
  * fixing itemjson info name
  * fixing missing var filePath

## 2014-10-28
  * respecting json file types from s3

## 2014-10-27
  * removing forced expiration

## 2014-10-21
  * grr no status available
  * better version output
  * version 0.1.4
  * working out a new caching validation
  * shoring up the cache checking for hosted services

## 2014-10-15
  * making tiles work again
  * readding exists check
  * cleaner logs for paging
  * making sure paths are consistent
  * always return count
  * fixing names of downloads

## 2014-10-14
  * removing node.extend
  * handle errors for new service tables
  * adding status to provider

## 2014-10-13
  * adding back route tests
  * tests pasing

## 2014-10-12
  * new version of koop-server all working

## 2014-10-09
  * move fs lookup to the model
  * remove all fs calls from controller
  * support for crazy stats json with wrong field names

## 2014-10-07
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

## 2014-09-25
  * Merge pull request [#21](https://github.com/Esri/koop-agol/issues/21) from Esri/image-service-tiles
    making image service serve tiles
  * making image service serve tiles
  * Merge pull request [#20](https://github.com/Esri/koop-agol/issues/20) from Esri/expired-caches
    fixing expired cache logic
  * fixing expired cache logic

## 2014-09-23
  * fixing large csv download of data from fresh cache
  * Merge pull request [#19](https://github.com/Esri/koop-agol/issues/19) from Esri/large-csv-downloads
    large csv data needed to return with too big for downloads...
  * set the featureservice limit to 1billion so the cache respects large data in services
  * test passing; large csv data needed to return with too big for downloads to work

## 2014-09-22
  * rolling back skiplimit
  * sending back count always
  * adds 413 errors to large csvs
  * Merge pull request [#18](https://github.com/Esri/koop-agol/issues/18) from Esri/csv-queue
    using a queue to controll concurrent csv requests on fresh caches
  * using a queue to controll concurrent csv requests on fresh caches
  * force a cache removall on csv to handle dup inserts
  * checking for updates to CSV data

## 2014-09-21
  * fixing tests
  * bulk insert the csv data
  * support for bypassing the 10k row limit in queries

## 2014-09-18
  * respect generating flag if present

## 2014-09-17
  * Merge pull request [#17](https://github.com/Esri/koop-agol/issues/17) from Esri/featureservice-post
    adding POST support to feature service requests

## 2014-09-16
  * adding POST support to feature service requests

## 2014-09-15
  * Merge branch 'multi-layer-tiles'
  * fixing new empty table geoms
  * Merge pull request [#15](https://github.com/Esri/koop-agol/issues/15) from Esri/multi-layer-tiles
    Multi layer tiles

## 2014-09-14
  * fixing insert issue with new geom column
  * tile logic for collecting all the metadata for layers in a service

## 2014-09-11
  * fix for https bug

## 2014-09-10
  * Merge pull request [#14](https://github.com/Esri/koop-agol/issues/14) from Esri/getcount-fix
    Getcount fix
  * add get count options
  * working on aggregate data json

## 2014-09-01
  * Merge pull request [#13](https://github.com/Esri/koop-agol/issues/13) from Esri/202-file-export
    refactor the controller to check for files before returning 202

## 2014-08-30
  * refactor the controller to check for files before returning 202

## 2014-08-28
  * setting the user-agent for all gets

## 2014-08-27
  * using Date.now is faster and cleaner
  * Merge pull request [#12](https://github.com/Esri/koop-agol/issues/12) from Esri/tmp-exports
    Tmp exports

## 2014-08-26
  * support for expired data

## 2014-08-25
  * working on tests

[1.1.2]: https://github.com/koopjs/koop-agol/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/koopjs/koop-agol/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/koopjs/koop-agol/compare/v1.0.0...v1.1.0
[1.0.1]: https://github.com/koopjs/koop-agol/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/koopjs/koop-agol/compare/v0.4.1...v1.0.0
[0.4.1]: https://github.com/koopjs/koop-agol/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/koopjs/koop-agol/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/koopjs/koop-agol/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/koopjs/koop-agol/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/koopjs/koop-agol/compare/v0.2.12...v0.3.0
[0.2.12]: https://github.com/koopjs/koop-agol/compare/v0.2.11...v0.2.12
[0.2.11]: https://github.com/koopjs/koop-agol/compare/v0.2.10...v0.2.11
[0.2.10]: https://github.com/koopjs/koop-agol/compare/v0.2.9...v0.2.10
[0.2.9]: https://github.com/koopjs/koop-agol/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/koopjs/koop-agol/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/koopjs/koop-agol/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/koopjs/koop-agol/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/koopjs/koop-agol/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/koopjs/koop-agol/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/koopjs/koop-agol/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/koopjs/koop-agol/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/koopjs/koop-agol/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/koopjs/koop-agol/releases/tag/v0.2.0
