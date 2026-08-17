const zlib = require('node:zlib');

function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 8_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

function unauthorized(res) {
  return json(res, 401, { error: 'Sign in is required to access this resource.' });
}

module.exports = { json, readBody, unauthorized };
