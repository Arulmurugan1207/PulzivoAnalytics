'use strict';

/**
 * Cloud Run / production static server for the Pulzivo Analytics Angular SPA.
 * Binds 0.0.0.0 and process.env.PORT (default 8080) so Cloud Run startup probes succeed.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DIST_DIR = path.resolve(
  process.env.DIST_DIR || path.join(__dirname, 'dist', 'simpletrack-prime-ng', 'browser'),
);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.normalize(path.join(DIST_DIR, relative));
  if (!resolved.startsWith(DIST_DIR + path.sep) && resolved !== DIST_DIR) {
    return null;
  }
  return resolved;
}

function sendFile(res, filePath, statusCode) {
  const type = contentType(filePath);
  const cacheControl =
    path.basename(filePath) === 'index.html'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable';

  res.writeHead(statusCode, {
    'Content-Type': type,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(filePath).pipe(res);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  const filePath = safeFilePath(req.url);
  if (!filePath) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end();
        return;
      }
      sendFile(res, filePath, 200);
      return;
    }

    const indexPath = path.join(DIST_DIR, 'index.html');
    fs.stat(indexPath, (indexErr, indexStat) => {
      if (!indexErr && indexStat.isFile()) {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': contentType(indexPath) });
          res.end();
          return;
        }
        sendFile(res, indexPath, 200);
        return;
      }
      sendText(res, 503, 'Service Unavailable');
    });
  });
});

function start(callback) {
  return server.listen(PORT, HOST, () => {
    console.log(`Pulzivo Analytics listening on http://${HOST}:${PORT}`);
    if (typeof callback === 'function') {
      callback();
    }
  });
}

if (require.main === module) {
  start();
}

module.exports = { server, start, PORT, HOST, DIST_DIR };
