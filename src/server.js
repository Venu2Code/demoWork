'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { calculate, CalculatorError, OPERATIONS } = require('./calculator');
const { evaluate } = require('./expression');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 10 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'",
};

function sendJson(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extra,
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] || '';
    if (!type.toLowerCase().startsWith('application/json')) {
      return reject(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
    }
    let size = 0;
    const chunks = [];
    let tooLarge = false;
    req.on('data', (c) => {
      size += c.length;
      if (tooLarge) return; // discard the rest so the client can read our 413
      if (size > MAX_BODY) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object'));
      }
    });
    req.on('error', reject);
  });
}

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function handleApi(req, res, pathname) {
  const routes = {
    '/api/health': { method: 'GET', run: () => ({ status: 'ok' }) },
    '/api/operations': { method: 'GET', run: () => ({ operations: OPERATIONS }) },
    '/api/calculate': {
      method: 'POST',
      run: (b) => ({ result: calculate(b.operation, b.a, b.b) }),
    },
    '/api/evaluate': {
      method: 'POST',
      run: (b) => ({ result: evaluate(b.expression) }),
    },
  };
  const route = routes[pathname];
  if (!route) throw new HttpError(404, 'NOT_FOUND', 'Unknown API endpoint');
  if (req.method !== route.method) {
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', `Use ${route.method}`);
  }
  const body = route.method === 'POST' ? await readJson(req) : {};
  sendJson(res, 200, route.run(body));
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET');
  }
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Malformed URL');
  }
  if (rel.includes('\0')) throw new HttpError(400, 'BAD_REQUEST', 'Malformed URL');
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    throw new HttpError(403, 'FORBIDDEN', 'Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      ...SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
      else serveStatic(req, res, pathname);
    } catch (err) {
      if (err instanceof CalculatorError) {
        return sendJson(res, 400, { error: { code: err.code, message: err.message } });
      }
      if (err instanceof HttpError) {
        const extra = err.status === 413 ? { Connection: 'close' } : {};
        return sendJson(res, err.status, { error: { code: err.code, message: err.message } }, extra);
      }
      console.error(err);
      sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Internal server error' } });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`Calculator running at http://localhost:${port}`));
}

module.exports = { createServer };
