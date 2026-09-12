// Thin re-export: the actual calculator maths lives in public/calculators.js
// now, so the exact same code that runs on the server (for a no-JS fallback
// render) is what's shipped to the browser and cached by the service worker
// for offline use. Keep this file as the require() path so nothing else in
// the server code has to change.
module.exports = require('../public/calculators.js');
