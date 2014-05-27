module.exports = {
  'post /agol/register': {
    controller: 'agol',
    action: 'register'
  },

  'get /agol': {
    controller: 'agol',
    action: 'list'
  },

  'get /agol/:id': {
    controller: 'agol',
    action: 'find'
  },
 
  'get /agol/:id/:item.:format': {
    controller: 'agol',
    action: 'findItemData'
  },

  'get /agol/:id/:item/:layer.:format': {
    controller: 'agol',
    action: 'findItemData'
  },

  'get /agol/:id/:item/:layer': {
    controller: 'agol',
    action: 'findItemData'
  },
 
  'get /agol/:id/:item': {
    controller: 'agol',
    action: 'findItem'
  },

  'get /agol/:id/:item/:layer/drop': {
    controller: 'agol',
    action: 'dropItem'
  },

  'get /agol/:id/:item/data/:layer': {
    controller: 'agol',
    action: 'findItemData'
  },

  'get /agol/:id/:item/data': {
    controller: 'agol',
    action: 'findItemData'
  },

  'get /agol/:id/:item/FeatureServer/:layer/:method': {
    controller: 'agol',
    action: 'featureserver'
  },

  'get /agol/:id/:item/FeatureServer/:layer': {
    controller: 'agol',
    action: 'featureserver'
  },

  'get /agol/:id/:item/FeatureServer': {
    controller: 'agol',
    action: 'featureserver'
  },

  'get /agol/:id/:item/thumbnail': {
    controller: 'agol',
    action: 'thumbnail'
  },

  'get /agol/:id/:item/thumbnail/:layer': {
    controller: 'agol',
    action: 'thumbnail'
  },
  
  'delete /agol/:id': {
    controller: 'agol',
    action: 'del'
  },

  
  'get /agol/:id/:item/preview': {
    controller: 'agol',
    action: 'preview'
  },

  'get /agol/:id/:item/:layer/tiles/:z/:x/:y.:format': {
    controller: 'agol',
    action: 'tiles'
  }

};
