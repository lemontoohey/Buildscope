// Tiny request/response helpers — hand-rolled instead of pulling in Express,
// so the whole app runs on Node's built-ins with zero npm installs.

function readRawBody(req, { limitBytes = 25 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readRawBody(req);
  if (buf.length === 0) return {};
  return JSON.parse(buf.toString('utf8'));
}

async function readFormBody(req) {
  const buf = await readRawBody(req);
  const params = new URLSearchParams(buf.toString('utf8'));
  const result = {};
  for (const [key, value] of params.entries()) result[key] = value;
  return result;
}

function sendHtml(res, html, statusCode = 200) {
  res.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendJson(res, obj, statusCode = 200) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function notFound(res) {
  sendHtml(res, '<h1>404 — not found</h1><p><a href="/">Back to dashboard</a></p>', 404);
}

module.exports = { readRawBody, readJsonBody, readFormBody, sendHtml, sendJson, redirect, notFound };
