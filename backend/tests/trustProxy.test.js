// ============================================================
// trustProxy.test.js — Railway/express-rate-limit trust-proxy
// configuration (see src/index.js's own header comment on
// `app.set('trust proxy', 1)`).
//
// Boots small, real (not mocked) Express + express-rate-limit app
// instances on ephemeral local ports and sends real HTTP requests with
// a spoofed X-Forwarded-For header (simulating Railway's own edge hop)
// -- proves both halves of the bug directly against the real library
// versions actually deployed, rather than asserting against express-
// rate-limit's internals:
//   1. req.ip correctly resolves the client IP from X-Forwarded-For
//      only when 'trust proxy' is configured (the actual functional
//      fix -- this is what was silently broken: every caller behind
//      Railway collapsed into the SAME rate-limit key).
//   2. the ERR_ERL_UNEXPECTED_X_FORWARDED_FOR console warning the
//      founder saw in Railway logs is gone once configured correctly,
//      and (for contrast) genuinely reproducible with the old default.
//
// Run: node tests/trustProxy.test.js
// ============================================================
const assert = require('assert/strict');
const http = require('http');
const express = require('express');
const rateLimit = require('express-rate-limit');

function get(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/probe', method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    });
    req.on('error', reject);
    req.end();
  });
}

function withServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const SPOOFED_CLIENT_IP = '203.0.113.42'; // TEST-NET-3, RFC 5737 -- never a real routable address

// ── 1. req.ip ignores X-Forwarded-For when trust proxy is unset (the old, broken default) ──
test('1. with trust proxy unset (Express default), req.ip is the raw socket address, NOT the forwarded client IP', async () => {
  const app = express();
  app.get('/probe', (req, res) => res.json({ ip: req.ip }));
  const server = await withServer(app);
  try {
    const { body } = await get(server.address().port, { 'X-Forwarded-For': SPOOFED_CLIENT_IP });
    assert.notEqual(body.ip, SPOOFED_CLIENT_IP);
  } finally {
    await closeServer(server);
  }
});

// ── 2. req.ip correctly resolves the forwarded client IP once trust proxy is set to 1 ──
test('2. with app.set(\'trust proxy\', 1) (this app\'s fix), req.ip resolves the ONE-hop-forwarded client IP correctly', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/probe', (req, res) => res.json({ ip: req.ip }));
  const server = await withServer(app);
  try {
    const { body } = await get(server.address().port, { 'X-Forwarded-For': SPOOFED_CLIENT_IP });
    assert.equal(body.ip, SPOOFED_CLIENT_IP);
  } finally {
    await closeServer(server);
  }
});

// ── 3. the exact founder-reported console warning is reproducible with the OLD default ──
test('3. ERR_ERL_UNEXPECTED_X_FORWARDED_FOR is logged when trust proxy is unset and X-Forwarded-For is present (reproduces the reported log line)', async () => {
  const app = express();
  app.use(rateLimit({ windowMs: 60000, max: 1000, standardHeaders: true, legacyHeaders: false }));
  app.get('/probe', (req, res) => res.json({ ok: true }));
  const server = await withServer(app);
  const originalError = console.error;
  let loggedCodes = [];
  console.error = (err) => { loggedCodes.push(err && err.code); };
  try {
    await get(server.address().port, { 'X-Forwarded-For': SPOOFED_CLIENT_IP });
    assert.ok(loggedCodes.includes('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR'), `expected ERR_ERL_UNEXPECTED_X_FORWARDED_FOR, got: ${loggedCodes.join(', ') || '(nothing logged)'}`);
  } finally {
    console.error = originalError;
    await closeServer(server);
  }
});

// ── 4. the warning is GONE once trust proxy is correctly set to 1 (the actual fix, verified against the real library) ──
test('4. no ERR_ERL_UNEXPECTED_X_FORWARDED_FOR (or ERR_ERL_PERMISSIVE_TRUST_PROXY) is logged once trust proxy is set to 1', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(rateLimit({ windowMs: 60000, max: 1000, standardHeaders: true, legacyHeaders: false }));
  app.get('/probe', (req, res) => res.json({ ok: true }));
  const server = await withServer(app);
  const originalError = console.error;
  let loggedCodes = [];
  console.error = (err) => { loggedCodes.push(err && err.code); };
  try {
    const { status } = await get(server.address().port, { 'X-Forwarded-For': SPOOFED_CLIENT_IP });
    assert.equal(status, 200);
    assert.equal(loggedCodes.includes('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR'), false);
    assert.equal(loggedCodes.includes('ERR_ERL_PERMISSIVE_TRUST_PROXY'), false);
  } finally {
    console.error = originalError;
    await closeServer(server);
  }
});

// ── 5. trust proxy: true (the unsafe blanket option) is confirmed to trip the LIBRARY'S OWN opposite warning ──
// Documents exactly why `1` (not `true`) was chosen -- both extremes are
// flagged by express-rate-limit itself; only the narrow, exact-hop-count
// value avoids both.
test('5. trust proxy: true is flagged by express-rate-limit itself (ERR_ERL_PERMISSIVE_TRUST_PROXY) -- confirms why "true" was rejected in favor of "1"', async () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(rateLimit({ windowMs: 60000, max: 1000, standardHeaders: true, legacyHeaders: false }));
  app.get('/probe', (req, res) => res.json({ ok: true }));
  const server = await withServer(app);
  const originalError = console.error;
  let loggedCodes = [];
  console.error = (err) => { loggedCodes.push(err && err.code); };
  try {
    await get(server.address().port, {});
    assert.ok(loggedCodes.includes('ERR_ERL_PERMISSIVE_TRUST_PROXY'), `expected ERR_ERL_PERMISSIVE_TRUST_PROXY, got: ${loggedCodes.join(', ') || '(nothing logged)'}`);
  } finally {
    console.error = originalError;
    await closeServer(server);
  }
});

// ── 6. src/index.js actually contains the fix (source-level sanity, since index.js itself needs a real DB/env to boot) ──
test('6. src/index.js sets trust proxy to the narrow value 1, before any route/middleware registration', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(src, /app\.set\('trust proxy', 1\)/);
  const setIdx = src.indexOf("app.set('trust proxy', 1)");
  const firstRateLimitUse = src.indexOf('app.use(rateLimit(');
  assert.ok(setIdx > -1 && firstRateLimitUse > setIdx, 'trust proxy must be set before the rate limiter is mounted');
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
