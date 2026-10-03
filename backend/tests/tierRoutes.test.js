// ============================================================
// tierRoutes.test.js — POST /tier/trial over the canonical plan model
//
//  - Every recognised paid plan (starter, pro, business, their annual
//    variants and the internal 'enterprise' alias) answers
//    "Already premium" and is never rewritten to trial.
//  - Free and unknown plans start the application trial; an active trial
//    answers "Trial active"; an expired trial restarts (unchanged).
//  - Response keys per branch are unchanged.
//  - /tier/plan and /tier/check keep their response shape.
//
// Handlers are taken from the Express router stack (after requireAuth),
// with mocked Prisma. Same no-framework convention as the other tests.
//
// Run: node tests/tierRoutes.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

delete process.env.TRIAL_DURATION_MS;

const srcDir = path.join(__dirname, '..', 'src');
const prismaClientPath = require.resolve(path.join(srcDir, 'utils', 'prismaClient.js'));

let users = {};
let writes = [];
const mockPrisma = {
  user: {
    async findUnique({ where }) { return users[where.id] ? { ...users[where.id] } : null; },
    async updateMany({ where, data }) {
      const u = users[where.id];
      if (!u || (where.plan && where.plan.notIn && where.plan.notIn.includes(u.plan))) return { count: 0 };
      writes.push({ id: where.id, data });
      Object.assign(u, data);
      return { count: 1 };
    },
  },
  qR: { async count() { return 0; } },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const router = require(path.join(srcDir, 'routes', 'tierRoutes.js'));

function handler(method, routePath) {
  const layer = router.stack.find(l => l.route && l.route.path === routePath && l.route.methods[method]);
  if (!layer) throw new Error(`route ${method} ${routePath} not found`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle; // final handler, after requireAuth
}
const trialHandler = handler('post', '/trial');
const planHandler = handler('get', '/plan');
const checkHandler = handler('post', '/check');

function fakeRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
async function call(h, userId, body = {}) {
  const res = fakeRes();
  await h({ userId, body, params: {} }, res);
  return res;
}

const DAY = 24 * 60 * 60 * 1000;
const tests = [];
function test(name, fn) { tests.push({ name, fn: async () => { users = {}; writes = []; await fn(); } }); }

const PAID = ['starter', 'starter_annual', 'pro', 'pro_annual', 'business', 'business_annual', 'enterprise'];

for (const plan of PAID) {
  test(`/tier/trial ${plan}: "Already premium", plan not changed`, async () => {
    users.u = { id: 'u', plan, trialExpiresAt: null, subscriptionStatus: plan === 'enterprise' ? null : 'active' };
    const res = await call(trialHandler, 'u');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.body), ['ok', 'message', 'planInfo']);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.message, 'Already premium');
    assert.equal(res.body.planInfo.plan, plan);
    assert.equal(res.body.planInfo.isPremium, true);
    assert.equal(users.u.plan, plan);
    assert.equal(users.u.trialExpiresAt, null);
    assert.equal(writes.length, 0);
  });
}

test('/tier/trial enterprise is reported as internal Business', async () => {
  users.u = { id: 'u', plan: 'enterprise', subscriptionStatus: null };
  const res = await call(trialHandler, 'u');
  assert.equal(res.body.planInfo.basePlan, 'business');
  assert.equal(res.body.planInfo.isInternal, true);
});

test('/tier/trial free: trial started for 14 days', async () => {
  users.u = { id: 'u', plan: 'free', trialExpiresAt: null };
  const before = Date.now();
  const res = await call(trialHandler, 'u');
  assert.deepEqual(Object.keys(res.body), ['ok', 'message', 'planInfo', 'trialDurationMs']);
  assert.equal(res.body.message, 'Trial started');
  assert.equal(res.body.trialDurationMs, 14 * DAY);
  assert.equal(res.body.planInfo.plan, 'trial');
  assert.equal(users.u.plan, 'trial');
  const ms = new Date(users.u.trialExpiresAt).getTime() - before;
  assert.ok(Math.abs(ms - 14 * DAY) < 2000, `duration ${ms}`);
});

test('/tier/trial active trial: "Trial active", nothing written', async () => {
  const exp = new Date(Date.now() + 3 * DAY);
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: exp };
  const res = await call(trialHandler, 'u');
  assert.deepEqual(Object.keys(res.body), ['ok', 'message', 'planInfo']);
  assert.equal(res.body.message, 'Trial active');
  assert.equal(res.body.planInfo.isTrial, true);
  assert.equal(writes.length, 0);
  assert.equal(users.u.trialExpiresAt, exp);
});

test('/tier/trial expired trial: restarts (pre-existing behaviour kept)', async () => {
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: new Date(Date.now() - DAY) };
  const res = await call(trialHandler, 'u');
  assert.equal(res.body.message, 'Trial started');
  assert.equal(writes.length, 1);
});

test('/tier/trial unknown plan: treated as not paid → trial started', async () => {
  users.u = { id: 'u', plan: 'gold_lifetime', trialExpiresAt: null };
  const res = await call(trialHandler, 'u');
  assert.equal(res.body.message, 'Trial started');
  assert.equal(users.u.plan, 'trial');
});

test('/tier/trial case/whitespace variants of paid plans are still paid', async () => {
  users.u = { id: 'u', plan: 'Business', trialExpiresAt: null };
  const res = await call(trialHandler, 'u');
  assert.equal(res.body.message, 'Already premium');
  assert.equal(users.u.plan, 'Business');
});

test('/tier/trial missing user → 404', async () => {
  const res = await call(trialHandler, 'nobody');
  assert.equal(res.statusCode, 404);
});

test('/tier/plan and /tier/check keep their response shape', async () => {
  users.u = { id: 'u', plan: 'pro', subscriptionStatus: 'active' };
  const plan = await call(planHandler, 'u');
  assert.deepEqual(Object.keys(plan.body), ['planInfo']);
  assert.equal(plan.body.planInfo.plan, 'pro');
  const check = await call(checkHandler, 'u', { capability: 'canUseDynamic' });
  assert.deepEqual(check.body, { allowed: true, plan: 'pro', upgradeRequired: false, upgradeUrl: '/upgrade.html' });
  users.f = { id: 'f', plan: 'free' };
  const denied = await call(checkHandler, 'f', { capability: 'canUseDynamic' });
  assert.deepEqual(denied.body, { allowed: false, plan: 'free', upgradeRequired: true, upgradeUrl: '/upgrade.html' });
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
