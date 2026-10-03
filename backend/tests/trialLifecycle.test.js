// ============================================================
// trialLifecycle.test.js — one 14-day application trial per account
//
// POST /tier/trial + tierSystem.startTrial:
//  - never trialled (trialExpiresAt null) → trial starts, 14 days
//  - active trial → "Trial active", expiry never reset/extended
//  - expired / consumed trial (trialExpiresAt set) → 409
//    trial_already_used, nothing written, repeatable calls stay refused
//  - recognised paid plans and internal enterprise → "Already premium",
//    never modified (any status, with or without a trial marker)
//  - unknown plan values are never overwritten; a trial marker still
//    blocks a second trial
//  - expiry resolves to Free via the canonical model without rewriting
//    User.plan
//
// Mocked Prisma; the route handler is taken from the Express router stack
// (after requireAuth). Same no-framework convention as the other tests.
//
// Run: node tests/trialLifecycle.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

delete process.env.TRIAL_DURATION_MS;

const srcDir = path.join(__dirname, '..', 'src');
const prismaClientPath = require.resolve(path.join(srcDir, 'utils', 'prismaClient.js'));

let users = {};
let writes = [];
// Mirrors Prisma updateMany semantics for the where clause startTrial uses.
function matches(u, where) {
  if (where.plan && where.plan.notIn && where.plan.notIn.includes(u.plan)) return false;
  if ('trialExpiresAt' in where && where.trialExpiresAt === null && u.trialExpiresAt != null) return false;
  return true;
}
const mockPrisma = {
  user: {
    async findUnique({ where }) { return users[where.id] ? { ...users[where.id] } : null; },
    async updateMany({ where, data }) {
      const u = users[where.id];
      if (!u || !matches(u, where)) return { count: 0 };
      writes.push({ id: where.id, data });
      Object.assign(u, data);
      return { count: 1 };
    },
  },
  qR: { async count() { return 0; } },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const router = require(path.join(srcDir, 'routes', 'tierRoutes.js'));
const { startTrial, buildPlanInfo, resolveEffectivePlan } = require(path.join(srcDir, 'utils', 'tierSystem.js'));

const layer = router.stack.find(l => l.route && l.route.path === '/trial' && l.route.methods.post);
const trialHandler = layer.route.stack[layer.route.stack.length - 1].handle;

function fakeRes() {
  return { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
async function postTrial(userId = 'u') {
  const res = fakeRes();
  await trialHandler({ userId, body: {}, params: {} }, res);
  return res;
}

const DAY = 24 * 60 * 60 * 1000;
const tests = [];
function test(name, fn) { tests.push({ name, fn: async () => { users = {}; writes = []; await fn(); } }); }

// ── Never trialled ──────────────────────────────────────────
test('never-trialled Free → trial starts; trialExpiresAt = now + 14 days', async () => {
  users.u = { id: 'u', plan: 'free', trialExpiresAt: null };
  const before = Date.now();
  const res = await postTrial();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body), ['ok', 'message', 'planInfo', 'trialDurationMs']);
  assert.equal(res.body.message, 'Trial started');
  assert.equal(res.body.trialDurationMs, 14 * DAY);
  assert.equal(users.u.plan, 'trial');
  const ms = new Date(users.u.trialExpiresAt).getTime() - before;
  assert.ok(Math.abs(ms - 14 * DAY) < 2000, `duration ${ms}`);
  assert.equal(writes.length, 1);
  assert.equal(res.body.planInfo.isTrial, true);
});

test('trial plan with no expiry recorded (never actually started) → trial starts once', async () => {
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: null };
  assert.equal((await postTrial()).body.message, 'Trial started');
  assert.ok(users.u.trialExpiresAt);
});

// ── Active trial ────────────────────────────────────────────
test('active trial → "Trial active"; does not restart; expiry not extended', async () => {
  const exp = new Date(Date.now() + 5 * DAY);
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: exp };
  for (let i = 0; i < 3; i++) {
    const res = await postTrial();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.body), ['ok', 'message', 'planInfo']);
    assert.equal(res.body.message, 'Trial active');
  }
  assert.equal(writes.length, 0);
  assert.equal(users.u.trialExpiresAt, exp);
});

// ── Expired / consumed trial ────────────────────────────────
test('expired trial → 409 trial_already_used; plan and trialExpiresAt unchanged', async () => {
  const exp = new Date(Date.now() - DAY);
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: exp };
  const res = await postTrial();
  assert.equal(res.statusCode, 409);
  assert.deepEqual(Object.keys(res.body), ['ok', 'code', 'message', 'error', 'planInfo']);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'trial_already_used');
  assert.equal(res.body.message, 'Trial already used');
  assert.match(res.body.error, /already been used/);
  assert.equal(res.body.planInfo.plan, 'free');
  assert.equal(res.body.planInfo.isTrialExpired, true);
  assert.equal(users.u.plan, 'trial');
  assert.equal(users.u.trialExpiresAt, exp);
  assert.equal(writes.length, 0);
});

test('repeated POST /tier/trial after expiry never restarts', async () => {
  const exp = new Date(Date.now() - 30 * DAY);
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: exp };
  for (let i = 0; i < 5; i++) assert.equal((await postTrial()).statusCode, 409);
  assert.equal(writes.length, 0);
  assert.equal(users.u.trialExpiresAt, exp);
});

test('Free account with a previous trial marker (e.g. downgraded) → 409, no second trial', async () => {
  const exp = new Date(Date.now() - 60 * DAY);
  users.u = { id: 'u', plan: 'free', trialExpiresAt: exp };
  const res = await postTrial();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'trial_already_used');
  assert.equal(users.u.plan, 'free');
  assert.equal(writes.length, 0);
});

// ── Paid / internal protection ──────────────────────────────
const PAID = ['starter', 'starter_annual', 'pro', 'pro_annual', 'business', 'business_annual', 'enterprise'];
for (const plan of PAID) {
  for (const subscriptionStatus of ['active', 'past_due', null, '']) {
    test(`${plan} (${subscriptionStatus === null ? 'null' : JSON.stringify(subscriptionStatus)} status) → "Already premium", unchanged`, async () => {
      users.u = { id: 'u', plan, subscriptionStatus, trialExpiresAt: null };
      const res = await postTrial();
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.message, 'Already premium');
      assert.equal(users.u.plan, plan);
      assert.equal(users.u.trialExpiresAt, null);
      assert.equal(writes.length, 0);
    });
  }
}

test('enterprise is reported as internal Business and never trialled', async () => {
  users.u = { id: 'u', plan: 'enterprise', subscriptionStatus: null, trialExpiresAt: null };
  const res = await postTrial();
  assert.equal(res.body.planInfo.basePlan, 'business');
  assert.equal(res.body.planInfo.isInternal, true);
  assert.equal(writes.length, 0);
});

test('canceled paid account with a previous trial marker cannot obtain another trial', async () => {
  for (const plan of ['pro', 'starter_annual', 'business']) {
    users.u = { id: 'u', plan, subscriptionStatus: 'canceled', trialExpiresAt: new Date(Date.now() - 90 * DAY) };
    const res = await postTrial();
    assert.notEqual(res.body.message, 'Trial started', plan);
    assert.equal(users.u.plan, plan);
  }
  assert.equal(writes.length, 0);
});

// ── Unknown plan values ─────────────────────────────────────
test('unknown plan with a previous trial marker → 409 trial_already_used', async () => {
  const exp = new Date(Date.now() - DAY);
  users.u = { id: 'u', plan: 'gold_lifetime', trialExpiresAt: exp };
  const res = await postTrial();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'trial_already_used');
  assert.equal(users.u.plan, 'gold_lifetime');
  assert.equal(writes.length, 0);
});

test('unknown plan without trial history → 409 trial_not_available; raw value never overwritten', async () => {
  users.u = { id: 'u', plan: 'gold_lifetime', trialExpiresAt: null };
  const res = await postTrial();
  assert.equal(res.statusCode, 409);
  assert.deepEqual(Object.keys(res.body), ['ok', 'code', 'message', 'error', 'planInfo']);
  assert.equal(res.body.code, 'trial_not_available');
  assert.equal(res.body.planInfo.plan, 'free', 'still Free entitlements (no bypass)');
  assert.equal(res.body.planInfo.isKnownPlan, false);
  assert.equal(users.u.plan, 'gold_lifetime');
  assert.equal(writes.length, 0);
});

// ── startTrial guard (defence in depth, atomic) ─────────────
test('startTrial never writes when a trial marker exists, even if called directly', async () => {
  const exp = new Date(Date.now() - DAY);
  users.u = { id: 'u', plan: 'free', trialExpiresAt: exp };
  const result = await startTrial('u');
  assert.equal(result.plan, 'free');
  assert.equal(result.trialExpiresAt, exp);
  assert.equal(writes.length, 0);
});

test('startTrial conditional write includes trialExpiresAt: null and the paid-plan exclusion', async () => {
  const calls = [];
  const orig = mockPrisma.user.updateMany;
  mockPrisma.user.updateMany = async (args) => { calls.push(args); return orig(args); };
  try {
    users.u = { id: 'u', plan: 'free', trialExpiresAt: null };
    await startTrial('u');
  } finally { mockPrisma.user.updateMany = orig; }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.trialExpiresAt, null);
  assert.ok(calls[0].where.plan.notIn.includes('enterprise'));
  assert.ok(calls[0].where.plan.notIn.includes('business_annual'));
});

// ── Expiry ──────────────────────────────────────────────────
test('trial expiration resolves the effective plan to Free without rewriting User.plan', async () => {
  const user = { id: 'u', plan: 'trial', trialExpiresAt: new Date(Date.now() - 1000) };
  assert.equal(resolveEffectivePlan(user), 'free');
  const info = buildPlanInfo(user);
  assert.equal(info.isFree, true);
  assert.equal(info.isTrialExpired, true);
  assert.equal(info.rawPlan, 'trial');
  assert.equal(user.plan, 'trial');
  users.u = user;
  await postTrial();
  assert.equal(users.u.plan, 'trial', 'plan not rewritten by a trial request either');
});

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
