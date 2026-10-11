'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../src/server');

let server;
let base;

test.before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

const post = (path, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

// Raw request so the client does not normalise the path (fetch would collapse ../).
const raw = (path, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request(base + '/', { method, path }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });

test('GET /api/health and /api/operations', async () => {
  const h = await fetch(base + '/api/health');
  assert.equal(h.status, 200);
  assert.deepEqual(await h.json(), { status: 'ok' });
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  const o = await (await fetch(base + '/api/operations')).json();
  assert.deepEqual(o.operations.sort(), ['add', 'divide', 'modulo', 'multiply', 'power', 'sqrt', 'subtract']);
});

test('POST /api/calculate for every operation', async () => {
  const cases = [
    ['add', 0.1, 0.2, 0.3], ['subtract', 1, 3, -2], ['multiply', -2, 4, -8],
    ['divide', 9, 3, 3], ['modulo', 10, 4, 2], ['power', 2, 5, 32], ['sqrt', 49, undefined, 7],
  ];
  for (const [operation, a, b, expected] of cases) {
    const r = await post('/api/calculate', { operation, a, b });
    assert.equal(r.status, 200, operation);
    assert.equal((await r.json()).result, expected, operation);
  }
  const r = await post('/api/calculate', { operation: 'add', a: '1.5', b: '2' });
  assert.equal((await r.json()).result, 3.5, 'numeric strings accepted');
});

test('POST /api/calculate error cases', async () => {
  const cases = [
    [{ operation: 'divide', a: 1, b: 0 }, 'DIVISION_BY_ZERO'],
    [{ operation: 'modulo', a: 1, b: 0 }, 'DIVISION_BY_ZERO'],
    [{ operation: 'sqrt', a: -1 }, 'UNDEFINED'],
    [{ operation: 'power', a: 10, b: 1000 }, 'OVERFLOW'],
    [{ operation: 'add', a: 'x', b: 1 }, 'INVALID_OPERAND'],
    [{ operation: 'add', a: 1 }, 'INVALID_OPERAND'],
    [{ operation: 'bogus', a: 1, b: 1 }, 'UNKNOWN_OPERATION'],
    [{}, 'UNKNOWN_OPERATION'],
  ];
  for (const [body, code] of cases) {
    const r = await post('/api/calculate', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal((await r.json()).error.code, code, JSON.stringify(body));
  }
});

test('POST /api/evaluate', async () => {
  let r = await post('/api/evaluate', { expression: '2+3*(4-1)' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).result, 11);

  r = await post('/api/evaluate', { expression: '1/0' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'DIVISION_BY_ZERO');

  r = await post('/api/evaluate', { expression: '2++' });
  assert.equal((await r.json()).error.code, 'SYNTAX_ERROR');

  r = await post('/api/evaluate', {});
  assert.equal(r.status, 400);
});

test('request validation', async () => {
  let r = await post('/api/evaluate', '{not json');
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'INVALID_JSON');

  for (const body of ['null', '[1]', '"str"', '5']) {
    r = await post('/api/evaluate', body);
    assert.equal(r.status, 400, body);
  }

  r = await post('/api/evaluate', '{"expression":"1"}', { 'Content-Type': 'text/plain' });
  assert.equal(r.status, 415);

  r = await post('/api/evaluate', JSON.stringify({ expression: '1', pad: 'x'.repeat(20000) }));
  assert.equal(r.status, 413);

  r = await fetch(base + '/api/calculate');
  assert.equal(r.status, 405);
  r = await post('/api/health', {});
  assert.equal(r.status, 405);
  r = await fetch(base + '/api/nope');
  assert.equal(r.status, 404);
});

test('static files', async () => {
  let r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(await r.text(), /<title>Calculator<\/title>/);

  r = await fetch(base + '/app.js');
  assert.match(r.headers.get('content-type'), /javascript/);
  r = await fetch(base + '/style.css');
  assert.match(r.headers.get('content-type'), /css/);

  r = await raw('/', 'HEAD');
  assert.equal(r.status, 200);
  assert.equal(r.body, '');

  r = await fetch(base + '/missing.html');
  assert.equal(r.status, 404);
  r = await fetch(base + '/', { method: 'POST' });
  assert.equal(r.status, 405);
});

test('path traversal and malformed URLs are rejected', async () => {
  for (const p of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/src/server.js', '/../../etc/passwd']) {
    const r = await raw(p);
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!r.body.includes('"name": "calculator-app"'), p);
  }
  assert.equal((await raw('/%E0%A4%A')).status, 400);
  assert.equal((await raw('/a%00b')).status, 400);
});
