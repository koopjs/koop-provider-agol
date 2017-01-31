module.exports = [
  {
    path: '/agol',
    methods: ['post', 'get'],
    handler: 'hosts'
  },
  {
    path: '/agol/:id',
    methods: ['get', 'delete'],
    handler: 'hosts'
  },
  {
    path: '/agol/queue/:action',
    methods: ['get'],
    handler: 'queue'
  },
  {
    path: '/agol/queue/worker/:action',
    methods: ['get'],
    handler: 'queue'
  },
  {
    path: '/agol/queue/workers/:action',
    methods: ['get'],
    handler: 'queue'
  },
  {
    path: '/agol/queue/:action/:pattern',
    methods: ['delete'],
    handler: 'queue'
  },
  {
    path: '/agol/:id/datasets/*',
    methods: ['get', 'post'],
    handler: 'setHost'
  },
  {
    path: '/agol/:id/:item/*',
    methods: ['get', 'put', 'post'],
    handler: 'setHost'
  },
  {
    path: '/agol/:id/bulk',
    methods: ['post'],
    handler: 'setHost'
  },
  {
    path: '/agol/:id/bulk/:action',
    methods: ['post'],
    handler: 'bulk'
  },
  {
    path: '/agol/:id/datasets',
    methods: ['get'],
    handler: 'dataset'
  },
  {
    path: '/agol/:id/datasets/:dataset.:format',
    methods: ['get'],
    handler: 'dataset'
  },
  {
    path: '/agol/:id/datasets/:dataset',
    methods: ['get'],
    handler: 'dataset'
  },
  {
    path: '/agol/:id/datasets/:dataset/:method',
    methods: ['post', 'delete'],
    handler: 'dataset'
  },
  {
    path: '/agol/:id/:item',
    methods: ['get'],
    handler: 'getInfo'
  },
  {
    path: '/agol/:id/:item/:layer/geohash',
    methods: ['get'],
    handler: 'getGeohash'
  },
  {
    path: '/agol/:id/:item.:format',
    methods: ['get'],
    handler: 'getResource'
  },
  {
    path: '/agol/:id/:item/:layer.:format',
    methods: ['get'],
    handler: 'getResource'
  },
  {
    path: '/agol/:id/:item/:layer',
    methods: ['get'],
    handler: 'getInfo'
  },
  {
    path: '/agol/:id/:item/:layer/drop',
    methods: ['get', 'delete'],
    handler: 'drop'
  },
  {
    path: '/agol/:id/:item/:layer/tiles/:z/:x/:y.:format',
    methods: ['get'],
    handler: 'tiles'
  },
  {
    path: '/agol/:id/:item/:layer/tiles/:z/:x/:y',
    methods: ['get'],
    handler: 'tiles'
  },
  {
    path: '/agol/:id/:item/:layer/expiration',
    methods: ['get', 'put', 'post'],
    handler: 'expiration'
  }
]
