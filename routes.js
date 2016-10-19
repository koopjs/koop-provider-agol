module.exports = {
  // hosts controller
  'post /agol': 'hosts',
  'get /agol': 'hosts',
  'get /agol/:id': 'hosts',
  'delete /agol/:id': 'hosts',

  // queue controller
  'get /agol/queue/:action': 'queue',
  'get /agol/queue/worker/:action': 'queue',
  'get /agol/queue/workers/:action': 'queue',
  'delete /agol/queue/:action/:pattern': 'queue',

  // these routes fire so there is a host and option key
  'get /agol/:id/datasets/*': 'setHost',
  'post /agol/:id/datasets/*': 'setHost',
  'get /agol/:id/:item/*': 'setHost',
  'put /agol/:id/:item/*': 'setHost',
  'post /agol/:id/:item/*': 'setHost',
  'post /agol/:id/bulk': 'setHost',

  // bulk controller
  'post /agol/:id/bulk/:action': 'bulk',

  // datasets controller
  'get /agol/:id/datasets': 'dataset',
  'get /agol/:id/datasets/:dataset.:format': 'dataset',
  'get /agol/:id/datasets/:dataset': 'dataset',
  'post /agol/:id/datasets/:dataset/:method': 'dataset',
  'delete /agol/:id/datasets/:dataset': 'dataset',

  // index controller
  'get /agol/:id/:item': 'getInfo',

  // this method needs to come before layer/format
  'get /agol/:id/:item/FeatureServer': 'featureserver',
  // end method that needs to be before layer/format
  'get /agol/:id/:item/:layer/geohash': 'getGeohash',

  // getResource controller
  'get /agol/:id/:item.:format': 'getResource',
  'get /agol/:id/:item/:layer.:format': 'getResource',

  // legacy controller
  'get /agol/:id/:item/:layer': 'getInfo',
  'get /agol/:id/:item/:layer/drop': 'drop',
  'delete /agol/:id/:item/:layer': 'drop',

  // tiles controller
  'get /agol/:id/:item/:layer/tiles/:z/:x/:y.:format': 'tiles',
  'get /agol/:id/:item/:layer/tiles/:z/:x/:y': 'tiles',

  // featureserver controller
  'get /agol/:id/:item/FeatureServer/geohash': 'getGeohash',
  'get /agol/:id/:item/FeatureServer/:layer': 'featureserver',
  'get /agol/:id/:item/FeatureServer/:layer/geohash': 'getGeohash',
  'get /agol/:id/:item/FeatureServer/:layer/:method': 'featureserver',
  'post /agol/:id/:item/FeatureServer/:layer/:method': 'featureserver',

  // expiration controller
  'get /agol/:id/:item/:layer/expiration': 'expiration',
  'put /agol/:id/:item/:layer/expiration': 'expiration',
  'post /agol/:id/:item/:layer/expiration': 'expiration'
}
