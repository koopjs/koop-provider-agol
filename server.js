const config = require('config')
const Koop = require('koop')
const koop = new Koop()
const agol = require('./')

koop.register(agol)

const port = config.port || 8085
koop.server.listen(port, () => console.log(`Koop listening on port ${port}!`))
