module.exports = function (agol, controller) {
  var actions = {
    import: agol.bulkImport,
    export: agol.bulkExport
  }
  return function (req, res) {
    var action = actions[req.params.action]
    if (!action) return res.status(400).json({error: 'Unsupported action'})
    var jobs = req.body
    var error = checkForError(jobs)
    if (error) return res.status(400).json(error)
    action(req, jobs, function (err, status) {
      if (err) res.status(500).send({ error: err.message })
      else res.status(200).json(status)
    })
  }
}

function checkForError (jobs) {
  if (!jobs || !jobs.length) {
    return {
      error: 'Invalid input',
      hint: 'Jobs array was either missing or empty'
    }
  }
  if (typeof jobs !== 'object') {
    return {
      error: 'Invalid input',
      hint: 'Ensure your input was a valid json array, and that you have set content-type to application/json'
    }
  }
}
