// ============================================================
// attentionService.test.js — mocked-Prisma tests for the
// Mission Control MC-1 shared health/attention source of truth.
//
// No test framework dependency: uses Node's built-in `assert`
// and a tiny inline runner, following the same pattern as
// tests/supportActionService.test.js. Prisma is mocked by
// pre-seeding require.cache for '../src/utils/prismaClient'
// before the service/controller modules are required, so no
// real DB connection is ever made.
//
// Consistency note: GET /admin/health and GET /ops/attention
// both call attentionService.getHealthChecks() — there is no
// second, independent implementation of the checks to drift
// out of sync with. These tests exercise that one function
// directly, which is what guarantees the two routes agree.
//
// Run: node tests/attentionService.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

const prismaClientPath = require.resolve(path.join(__dirname, '..', 'src', 'utils', 'prismaClient.js'));

function makeUserModel(shouldFail) {
  return {
    async count() {
      if (shouldFail) throw new Error('simulated DB failure: connection reset by peer at 10.0.4.12:5432');
      return 42;
    },
  };
}

const mockPrisma = { user: makeUserModel(false) };

require.cache[prismaClientPath] = {
  id: prismaClientPath,
  filename: prismaClientPath,
  loaded: true,
  exports: mockPrisma,
};

// Baseline: all three config-presence env vars "configured" for the
// whole suite, so tests that aren't specifically about config-key
// detection (sections 4 and 5) get a consistent, fully-healthy
// baseline instead of leaking real ambient env state.
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
process.env.STRIPE_SECRET_KEY = 'sk_test_stripe';
process.env.CLERK_SECRET_KEY = 'sk_test_clerk';

const attentionService = require('../src/services/attentionService');
const { handleGetAttention } = require('../src/controllers/opsAttentionController');

function setDbHealthy(healthy) {
  mockPrisma.user = makeUserModel(!healthy);
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

// ── 1. getHealthChecks — the shared source of truth ────────────

test('getHealthChecks: DB reachable -> api/db/frontend true, config keys reflect env', async () => {
  setDbHealthy(true);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  process.env.CLERK_SECRET_KEY = 'sk_test_x';

  const checks = await attentionService.getHealthChecks();

  assert.equal(checks.api, true);
  assert.equal(checks.db, true);
  assert.equal(checks.frontend, true);
  assert.equal(checks.anthropic, false);
  assert.equal(checks.stripe, false);
  assert.equal(checks.clerk, true);

  // Restore the suite's fully-configured baseline for later tests.
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_stripe';
  process.env.CLERK_SECRET_KEY = 'sk_test_clerk';
});

test('getHealthChecks: DB unreachable -> exact fallback shape preserved', async () => {
  setDbHealthy(false);

  const checks = await attentionService.getHealthChecks();

  assert.deepEqual(checks, {
    api: true, db: false, anthropic: false,
    stripe: false, clerk: false, frontend: true,
  });

  setDbHealthy(true);
});

// ── 2. deriveFindings — read-only, no correlation ───────────────

test('deriveFindings: all checks true -> no findings', () => {
  const checks = { api: true, db: true, frontend: true, anthropic: true, stripe: true, clerk: true };
  assert.deepEqual(attentionService.deriveFindings(checks), []);
});

test('deriveFindings: db false -> one critical finding with evidence and scope', () => {
  const checks = { api: true, db: false, frontend: true, anthropic: true, stripe: true, clerk: true };
  const findings = attentionService.deriveFindings(checks);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].subsystem, 'Database (PostgreSQL)');
  assert.equal(findings[0].severity, 'critical');
  assert.equal(findings[0].scope, 'platform');
  assert.match(findings[0].evidence, /unreachable/);
  assert.ok(findings[0].explanation.length > 0);
});

test('deriveFindings: config check false -> warning severity, "not configured" evidence', () => {
  const checks = { api: true, db: true, frontend: true, anthropic: false, stripe: true, clerk: true };
  const findings = attentionService.deriveFindings(checks);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].subsystem, 'Anthropic AI');
  assert.equal(findings[0].severity, 'warning');
  assert.match(findings[0].evidence, /not configured/);
});

test('deriveFindings: missing/malformed key never reads as healthy', () => {
  // A check object missing keys entirely (e.g. a future bug upstream)
  // must never be silently treated as "true" for those subsystems.
  const findings = attentionService.deriveFindings({});
  assert.equal(findings.length, 6);
  for (const f of findings) {
    assert.match(f.evidence, /did not return a valid result/);
  }
});

test('deriveFindings: multiple failures each produce a distinct finding', () => {
  const checks = { api: true, db: false, frontend: true, anthropic: false, stripe: true, clerk: false };
  const findings = attentionService.deriveFindings(checks);
  const subsystems = findings.map(f => f.subsystem).sort();
  assert.deepEqual(subsystems, ['Anthropic AI', 'Clerk', 'Database (PostgreSQL)'].sort());
});

// ── 3. buildExecutiveBrief — evidence-derived verdict only ──────

test('buildExecutiveBrief: no findings -> healthy verdict, outcome-focused copy, no check count exposed', () => {
  const checks = { api: true, db: true, frontend: true, anthropic: true, stripe: true, clerk: true };
  const brief = attentionService.buildExecutiveBrief(checks, []);
  assert.equal(brief.verdict, 'healthy');
  assert.equal(brief.message, 'Platform operating normally. No founder attention required.');
  assert.doesNotMatch(brief.message, /\d/); // no implementation detail (e.g. check count) in the healthy message
});

test('buildExecutiveBrief: one critical finding -> critical verdict, singular copy', () => {
  const checks = { api: true, db: false, frontend: true, anthropic: true, stripe: true, clerk: true };
  const findings = attentionService.deriveFindings(checks);
  const brief = attentionService.buildExecutiveBrief(checks, findings);
  assert.equal(brief.verdict, 'critical');
  assert.equal(brief.message, 'Platform critical. 1 critical finding requires immediate attention.');
});

test('buildExecutiveBrief: multiple critical findings -> critical verdict, plural copy', () => {
  const checks = { api: true, db: false, frontend: false, anthropic: true, stripe: true, clerk: true };
  const findings = attentionService.deriveFindings(checks);
  const brief = attentionService.buildExecutiveBrief(checks, findings);
  assert.equal(brief.verdict, 'critical');
  assert.equal(brief.message, 'Platform critical. 2 critical findings require immediate attention.');
});

test('buildExecutiveBrief: only warning-severity findings -> degraded verdict, plural copy', () => {
  const checks = { api: true, db: true, frontend: true, anthropic: false, stripe: false, clerk: true };
  const findings = attentionService.deriveFindings(checks);
  const brief = attentionService.buildExecutiveBrief(checks, findings);
  assert.equal(brief.verdict, 'degraded');
  assert.equal(brief.message, 'Platform degraded. 2 findings require your attention.');
});

test('buildExecutiveBrief: single warning finding -> degraded verdict, singular copy', () => {
  const checks = { api: true, db: true, frontend: true, anthropic: false, stripe: true, clerk: true };
  const findings = attentionService.deriveFindings(checks);
  const brief = attentionService.buildExecutiveBrief(checks, findings);
  assert.equal(brief.verdict, 'degraded');
  assert.equal(brief.message, 'Platform degraded. 1 finding requires your attention.');
});

test('buildExecutiveBrief: checks unavailable -> honest "unavailable" verdict, not "healthy"', () => {
  const brief = attentionService.buildExecutiveBrief(null, []);
  assert.equal(brief.verdict, 'unavailable');
  assert.match(brief.message, /could not be fully verified/);
});

// ── 4. getAttentionSnapshot — end-to-end through the shared service ──

test('getAttentionSnapshot: healthy DB -> no findings, healthy verdict', async () => {
  setDbHealthy(true);
  const snapshot = await attentionService.getAttentionSnapshot();
  assert.deepEqual(snapshot.findings, []);
  assert.equal(snapshot.executiveBrief.verdict, 'healthy');
});

test('getAttentionSnapshot: unhealthy DB -> real finding, critical verdict, never falsely healthy', async () => {
  setDbHealthy(false);
  const snapshot = await attentionService.getAttentionSnapshot();
  assert.equal(snapshot.checks.db, false);
  assert.ok(snapshot.findings.some(f => f.subsystem === 'Database (PostgreSQL)'));
  assert.notEqual(snapshot.executiveBrief.verdict, 'healthy');
  setDbHealthy(true);
});

// ── 5. Controller — GET /ops/attention response shape ───────────

test('Controller: healthy snapshot -> 200 with executiveBrief and empty findings', async () => {
  setDbHealthy(true);
  const res = fakeRes();
  await handleGetAttention({}, res);
  assert.equal(res.statusCode, undefined); // res.json() without explicit status = 200 default
  assert.equal(res.body.executiveBrief.verdict, 'healthy');
  assert.deepEqual(res.body.findings, []);
});

test('Controller: degraded snapshot -> 200 with real findings, not a 500', async () => {
  setDbHealthy(false);
  const res = fakeRes();
  await handleGetAttention({}, res);
  assert.equal(res.statusCode, undefined);
  assert.ok(res.body.findings.length > 0);
  assert.notEqual(res.body.executiveBrief.verdict, 'healthy');
  setDbHealthy(true);
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
