// ============================================================
// stadtpocketAssistantRoutes.test.js — StadtPocket City Assistant,
// Phase 2B.1a. Mocked-service tests for stadtpocketAssistantRoutes.js,
// following the same require.cache injection + fakeReq/fakeRes pattern
// as tests/stadtpocketResearchRoutes.test.js. No real DB/Anthropic
// call is ever made (stadtpocketAssistantService.js itself is
// replaced in require.cache before the route module is required).
//
// Run: node tests/stadtpocketAssistantRoutes.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const servicePath = resolve('src', 'services', 'stadtpocketAssistantService.js');

class FakeAssistantError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

let nextOutcome = { kind: 'ok', value: { text: 'Hallo!', results: [], sources: [] } };

require.cache[servicePath] = {
  id: servicePath, filename: servicePath, loaded: true,
  exports: {
    AssistantError: FakeAssistantError,
    answerAssistantQuestion: async () => {
      if (nextOutcome.kind === 'ok') return nextOutcome.value;
      if (nextOutcome.kind === 'assistant-error') throw new FakeAssistantError(nextOutcome.message, nextOutcome.status);
      throw new Error(nextOutcome.message || 'unexpected internal failure with a sensitive stack detail');
    },
  },
};

const { handleAssistant, assistantRateLimiter } = require('../src/routes/stadtpocketAssistantRoutes');

function fakeReq({ params = { citySlug: 'ulm' }, body = { question: 'Hallo' }, ip = '10.10.10.10' } = {}) {
  return { params, body, ip, headers: {}, app: { get: () => 1 }, method: 'POST', originalUrl: '/public/stadtpocket/cities/ulm/assistant' };
}
function fakeRes() {
  return {
    statusCode: undefined, body: undefined, headersSent: false, writableEnded: false, _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    append() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.writableEnded = true; return this; },
    send(body) { this.body = body; this.writableEnded = true; return this; },
    once() {},
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. a successful answer returns 200 with the structured response, unchanged', async () => {
  nextOutcome = { kind: 'ok', value: { text: 'Hallo aus Ulm!', results: [], sources: [] } };
  const res = fakeRes();
  await handleAssistant(fakeReq(), res);
  assert.equal(res.statusCode, undefined); // res.json() never explicitly sets 200 -- default
  assert.deepEqual(res.body, { text: 'Hallo aus Ulm!', results: [], sources: [] });
});

test('2. an unknown city (service throws a 404 AssistantError) maps to HTTP 404', async () => {
  nextOutcome = { kind: 'assistant-error', message: 'City not found.', status: 404 };
  const res = fakeRes();
  await handleAssistant(fakeReq({ params: { citySlug: 'nowhere' } }), res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'City not found.' });
});

test('3. a validation failure (service throws a 400 AssistantError) maps to HTTP 400', async () => {
  nextOutcome = { kind: 'assistant-error', message: 'question is required.', status: 400 };
  const res = fakeRes();
  await handleAssistant(fakeReq({ body: {} }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'question is required.' });
});

test('4. an unexpected internal error maps to a generic 500 with no leaked detail', async () => {
  nextOutcome = { kind: 'internal', message: 'ECONNREFUSED at prismaClient.js:42 password=hunter2' };
  const res = fakeRes();
  await handleAssistant(fakeReq(), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error.' });
  assert.ok(!JSON.stringify(res.body).includes('hunter2'));
  assert.ok(!JSON.stringify(res.body).includes('prismaClient.js'));
});

test('5. the 500 response body never contains a stack trace', async () => {
  nextOutcome = { kind: 'internal', message: 'boom' };
  const res = fakeRes();
  await handleAssistant(fakeReq(), res);
  assert.ok(!('stack' in res.body));
});

// ── rate limiting ─────────────────────────────────────────────────
// Calls the exported middleware directly (no real Express app/server),
// same IP on every call, and observes whether it lets the request
// through (calls next()) or blocks it (writes a response itself) --
// the only externally-observable behavior that matters here.
function runLimiter(req) {
  return new Promise((res_) => {
    const res = fakeRes();
    res.send = () => { res_({ blocked: true, statusCode: res.statusCode }); return res; };
    res.json = () => { res_({ blocked: true, statusCode: res.statusCode }); return res; };
    assistantRateLimiter(req, res, () => res_({ blocked: false }));
  });
}

test('6. the same IP is allowed through for the first 20 requests, then blocked on the 21st (max: 20)', async () => {
  const req = fakeReq({ ip: '203.0.113.5' });
  let allowed = 0;
  let blockedAt = null;
  for (let i = 1; i <= 21; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await runLimiter(req);
    if (outcome.blocked) {
      blockedAt = i;
      break;
    }
    allowed += 1;
  }
  assert.equal(allowed, 20, `expected exactly 20 allowed requests before blocking, got ${allowed}`);
  assert.equal(blockedAt, 21, `expected the 21st request to be blocked, blocking happened at ${blockedAt}`);
});

test('7. a different IP is unaffected by another IP already being rate-limited', async () => {
  const exhausted = fakeReq({ ip: '203.0.113.9' });
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await runLimiter(exhausted);
  }
  const exhaustedOutcome = await runLimiter(exhausted);
  assert.equal(exhaustedOutcome.blocked, true);

  const freshIp = fakeReq({ ip: '203.0.113.10' });
  const freshOutcome = await runLimiter(freshIp);
  assert.equal(freshOutcome.blocked, false);
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
