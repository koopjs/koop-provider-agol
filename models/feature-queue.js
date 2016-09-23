var Resque = require('node-resque').queue
var Work = require('../lib/work.js')

module.exports = {
  create: function (options) {
    var log = options.log
    var work = new Work(options)
    if (!options.connection) {
      return {
        enqueue: function (foo, bar, job) {
          doLocal(work, job)
        },
        removeFailed: function () {},
        failed: function () {},
        length: function () {},
        allWorkingOn: function () {}
      }
    }
    var connection = work.connection
    connection.pkg = 'redis'
    var queue = new Resque({connection: connection}, work.jobs)

    process.on('SIGINT', function () {
      queue.end(function () {
        process.exit()
      })
    })

    process.on('SIGTERM', function () {
      queue.end(function () {
        process.exit()
      })
    })

    queue.connect(function () {
      setInterval(function () {
        log.info('Clearing old workers from the queue')
        var day = 24 * 60 * 60 * 1000
        queue.cleanOldWorkers(day, function (err) {
          if (err) log.error(err)
        })
      }, 60 * 60 * 1000)
    })

    return queue
  }
}

function doLocal (work, job) {
  work.importService(job[0], function (err) {
    if (err) console.log(err)
  })
}
