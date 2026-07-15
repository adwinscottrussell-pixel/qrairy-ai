// ============================================================
// supportActionService.test.js — mocked-Prisma tests for the
// SupportAction audit foundation (SP3.1).
//
// No test framework dependency: uses Node's built-in `assert`
// and a tiny inline runner, following the same pattern as
// tests/searchService.test.js. Prisma is mocked by pre-seeding
// require.cache for '../src/utils/prismaClient' before the
// service/controller modules are required, so no real DB
// connection is ever made.
//
// Run: node tests/supportActionService.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

const prismaClientPath = require.resolve(path.join(__dirname, '..', 'src', 'utils', 'prismaClient.js'));

function makeSupportActionModel() {
  let nextId = 1;
  return {
    lastCreateArgs: undefined,
    shouldFail: false,
    async create(args) {
      this.lastCreateArgs = args;
      if (this.shouldFail) throw new Error('simulated DB failure: connection reset by peer at 10.0.4.12:5432');
      return { id: `sa_${nextId++}`, createdAt: new Date('2026-07-14T00:00:00Z'), ...args.data };
    },
  };
}

const mockPrisma = { supportAction: makeSupportActionModel() };

require.cache[prismaClientPath] = {
  id: prismaClientPath,
  filename: prismaClientPath,
  loaded: true,
  exports: mockPrisma,
};

const supportActionService = require('../src/services/supportActionService');
const { handleCreateSupportAction } = require('../src/controllers/opsSupportActionController');

function resetMock() {
  mockPrisma.supportAction = makeSupportActionModel();
}

function fakeReq(body, adminUser = { clerkId: 'admin_test_1' }) {
  return { body, adminUser };
}

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. Date preservation ────────────────────────────────────────

test('validateMetadata: Date instances are accepted, not corrupted', () => {
  const result = supportActionService.validateMetadata({ occurredAt: new Date('2026-07-13T00:00:00Z') });
  assert.equal(result.ok, true);
});

test('End-to-end: a Date in metadata reaches create() intact, not as {}', async () => {
  resetMock();
  const res = fakeRes();
  const when = new Date('2026-07-13T00:00:00Z');
  await handleCreateSupportAction(
    fakeReq({ actorType: 'human', actionType: 'noted_incident', targetType: 'business', targetId: 'biz_1', metadata: { occurredAt: when } }),
    res
  );
  assert.equal(res.statusCode, 201);
  const stored = mockPrisma.supportAction.lastCreateArgs.data.metadata;
  assert.ok(stored.occurredAt instanceof Date, 'Date must remain a Date instance, not {}');
  assert.equal(stored.occurredAt.toISOString(), when.toISOString());
});

// ── 2. Dangerous key rejection (precise matching, no false positives) ──

test('validateMetadata: rejects exact dangerous key names', () => {
  for (const key of ['password', 'accessToken', 'refreshToken', 'apiKey', 'api_key', 'authorization', 'bearer', 'cookie', 'sessionId', 'sessionToken', 'secret', 'clientSecret', 'cardNumber', 'cardNo', 'cvv', 'cvc']) {
    const result = supportActionService.validateMetadata({ [key]: 'x' });
    assert.equal(result.ok, false, `expected "${key}" to be rejected`);
  }
});

test('validateMetadata: does NOT false-positive on legitimate lookalike field names', () => {
  const result = supportActionService.validateMetadata({
    cardinality: 5,
    discardReason: 'duplicate',
    businessCardLabel: 'Acme Inc',
    paymentDueDate: '2026-08-01',
  });
  assert.equal(result.ok, true, 'legitimate fields containing "card"/"payment" as a substring must not be rejected');
});

test('Controller: prohibited metadata key -> 400, and the record is never written', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(
    fakeReq({ actorType: 'human', actionType: 'x', targetType: 'y', metadata: { note: 'ok', password: 'nope' } }),
    res
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /[Pp]rohibited/);
  assert.equal(mockPrisma.supportAction.lastCreateArgs, undefined, 'create() must not be called when metadata is rejected — accept intact or reject, never partial');
});

// ── 3. Prototype pollution ──────────────────────────────────────

test('validateMetadata: rejects __proto__/constructor/prototype keys', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const evil = JSON.parse(`{"${key}": {"polluted": true}, "safe": 1}`);
    const result = supportActionService.validateMetadata(evil);
    assert.equal(result.ok, false, `expected "${key}" to be rejected`);
  }
});

test('validateMetadata: scanning never mutates the input object\'s prototype', () => {
  const evil = JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}');
  supportActionService.validateMetadata(evil);
  assert.equal(Object.getPrototypeOf(evil), Object.prototype, 'prototype chain must be untouched by validation');
});

// ── 4. Circular references ──────────────────────────────────────

test('validateMetadata: circular reference rejected with a clear reason, no RangeError', () => {
  const circ = { a: 1 };
  circ.self = circ;
  const result = supportActionService.validateMetadata(circ);
  assert.equal(result.ok, false);
  assert.match(result.reason, /circular/i);
});

test('validateMetadata: a value repeated in a non-cyclic DAG is NOT flagged as circular', () => {
  const shared = { x: 1 };
  const result = supportActionService.validateMetadata({ a: shared, b: shared });
  assert.equal(result.ok, true, 'the same object referenced twice without a cycle must be allowed');
});

test('Controller: circular metadata -> 400, not an uncaught error / 500', async () => {
  resetMock();
  const res = fakeRes();
  const circ = { a: 1 };
  circ.self = circ;
  await handleCreateSupportAction(fakeReq({ actorType: 'human', actionType: 'x', targetType: 'y', metadata: circ }), res);
  assert.equal(res.statusCode, 400);
});

// ── 5. Metadata size limit ──────────────────────────────────────

test('validateMetadata: oversized metadata is rejected', () => {
  const big = { blob: 'x'.repeat(supportActionService.MAX_METADATA_BYTES * 2) };
  const result = supportActionService.validateMetadata(big);
  assert.equal(result.ok, false);
  assert.match(result.reason, /size/i);
});

test('validateMetadata: metadata within the size limit is accepted', () => {
  const small = { note: 'x'.repeat(100) };
  const result = supportActionService.validateMetadata(small);
  assert.equal(result.ok, true);
});

// ── 6. Identifier length validation ─────────────────────────────

test('Controller: actionType exceeding MAX_IDENTIFIER_LENGTH -> 400', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actorType: 'human', actionType: 'x'.repeat(supportActionService.MAX_IDENTIFIER_LENGTH + 1), targetType: 'y' }), res);
  assert.equal(res.statusCode, 400);
});

test('Controller: targetType exceeding MAX_IDENTIFIER_LENGTH -> 400', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actorType: 'human', actionType: 'x', targetType: 'y'.repeat(supportActionService.MAX_IDENTIFIER_LENGTH + 1) }), res);
  assert.equal(res.statusCode, 400);
});

test('Controller: targetId exceeding MAX_IDENTIFIER_LENGTH -> 400', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actorType: 'human', actionType: 'x', targetType: 'y', targetId: 'z'.repeat(supportActionService.MAX_IDENTIFIER_LENGTH + 1) }), res);
  assert.equal(res.statusCode, 400);
});

// ── 7. Server-derived actorId ────────────────────────────────────

test('Controller: actorId always comes from req.adminUser, never the request body', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(
    fakeReq({ actorId: 'attacker-supplied', actorType: 'human', actionType: 'x', targetType: 'y' }, { clerkId: 'admin_real' }),
    res
  );
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.actorId, 'admin_real');
  assert.equal(mockPrisma.supportAction.lastCreateArgs.data.actorId, 'admin_real');
});

// ── 8. Successful record creation ────────────────────────────────

test('Controller: valid request creates a record and returns 201 with the expected shape', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(
    fakeReq({ actorType: 'ai-suggested', actionType: 'viewed_raw_payload', targetType: 'apiInspectorRecord', targetId: 'rec_1', metadata: { reason: 'debugging wallet issue' } }),
    res
  );
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.actorType, 'ai-suggested');
  assert.equal(res.body.actionType, 'viewed_raw_payload');
  assert.equal(res.body.targetType, 'apiInspectorRecord');
  assert.equal(res.body.targetId, 'rec_1');
  assert.ok(res.body.id);
  assert.ok(res.body.createdAt);
  assert.equal(res.body.metadata, undefined, 'response must not echo metadata back');
});

// ── 9. Service/DB failure path ───────────────────────────────────

test('Controller: DB/service failure -> 500 with a generic message, no internal error leaked', async () => {
  resetMock();
  mockPrisma.supportAction.shouldFail = true;
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actorType: 'human', actionType: 'x', targetType: 'y' }), res);
  assert.equal(res.statusCode, 500);
  assert.ok(res.body.error);
  assert.ok(!/connection reset/.test(res.body.error), 'raw DB error message must not leak to the client');
});

// ── Baseline request validation (required fields, actor type) ───

test('Controller: missing actorType -> 400', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actionType: 'x', targetType: 'y' }), res);
  assert.equal(res.statusCode, 400);
});

test('Controller: invalid actorType -> 400', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actorType: 'robot', actionType: 'x', targetType: 'y' }), res);
  assert.equal(res.statusCode, 400);
});

test('Controller: missing actionType -> 400', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actorType: 'human', targetType: 'y' }), res);
  assert.equal(res.statusCode, 400);
});

test('Controller: missing targetType -> 400', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actorType: 'human', actionType: 'x' }), res);
  assert.equal(res.statusCode, 400);
});

test('Controller: array metadata -> 400', async () => {
  resetMock();
  const res = fakeRes();
  await handleCreateSupportAction(fakeReq({ actorType: 'human', actionType: 'x', targetType: 'y', metadata: [1, 2] }), res);
  assert.equal(res.statusCode, 400);
});

// ── runner ────────────────────────────────────────────────────

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
