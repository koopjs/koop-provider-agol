/**
 * Force a url to use https vs http
 * @param {string} url - The url for the request
 * returns {string} url
 */
exports.forceHttps = function (url) {
  if (url && url.split('//').length > 1) {
    url = url.split('//')[1].match(/^service/) ? url.replace('http:', 'https:') : url
  }
  return url
}
