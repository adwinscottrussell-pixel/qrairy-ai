// ============================================================
// dealAccess.test.js — QRAIVY Deals plan entitlements and the fail-closed
// rollout / access decision (services/dealAccess.js, Phase 3B.1).
//
//   E. entitlements in config/plans.js (deals, dealLimit)
//   R. rollout: defaults, DEALS_ENABLED, pilot allow-list parsing
//   A. access decision: plans, annual, enterprise, trial expiry,
//      cancelled subscriptions, missing user, pilot limits
//   H. HTTP answers and capacity
//   L. loading the User row (fake client; no database)
//   K. foundation only: nothing is wired into routes yet
//
// Run: node tests/dealAccess.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const plans = require('../src/config/plans');
const access = require('../src/services/dealAccess');
const { ENTITLEMENTS } = plans;
const { evaluateDealAccess: decide, readRollout, rolloutFor, canCreateDeal, denialFor, limitResponse, getDealAccess, PILOT_DEAL_LIMIT } = access;

const NOW = new Date('2026-10-15T12:00:00Z');
const PILOT = 'user_2pilotAbC123';
const OTHER = 'user_2otherXyZ789';
const ON = { DEALS_ENABLED: 'true' };
const OFF = {};
const pilotEnv = (extra = {}) => ({ DEALS_PILOT_USER_IDS: PILOT, ...extra });
const u = (plan, extra = {}) => ({ plan, ...extra });

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── E. Entitlements ─────────────────────────────────────────────
test('E. approved table: Free off/0, Trial 1, Starter 3, Pro and Business unlimited', () => {
  const want = { free: [false, 0], trial: [true, 1], starter: [true, 3], pro: [true, null], business: [true, null] };
  for (const [base, [deals, limit]] of Object.entries(want)) {
    assert.equal(ENTITLEMENTS[base].deals, deals, base + '.deals');
    assert.equal(ENTITLEMENTS[base].dealLimit, limit, base + '.dealLimit');
  }
});
test('E. every plan defines deals and dealLimit; still frozen', () => {
  for (const base of Object.keys(ENTITLEMENTS)) {
    assert.ok('deals' in ENTITLEMENTS[base] && 'dealLimit' in ENTITLEMENTS[base], base);
    assert.ok(Object.isFrozen(ENTITLEMENTS[base]), base);
  }
  assert.throws(() => { 'use strict'; ENTITLEMENTS.free.deals = true; });
});
test('E. annual plans and enterprise inherit their base plan entitlements', () => {
  for (const [id, base] of [['starter_annual', 'starter'], ['pro_annual', 'pro'], ['business_annual', 'business'], ['enterprise', 'business']]) {
    assert.equal(plans.getEntitlements({ plan: id }, NOW), ENTITLEMENTS[base], id);
  }
});
test('E. the public plan catalogue does not expose the new keys (pricing unchanged)', () => {
  for (const p of plans.getPublicPlanCatalogue()) assert.ok(!('deals' in p) && !('dealLimit' in p), p.id);
});

// ── R. Rollout ──────────────────────────────────────────────────
test('R. default (no variables): nobody, whatever the account', () => {
  for (const env of [{}, undefined, null]) {
    assert.equal(rolloutFor(PILOT, env || {}), 'none');
    assert.equal(decide(u('business'), PILOT, { env: env || {}, now: NOW }).allowed, false);
  }
});
test('R. DEALS_ENABLED: only the exact value "true" enables everyone', () => {
  assert.equal(rolloutFor(OTHER, { DEALS_ENABLED: 'true' }), 'general');
  for (const v of ['TRUE', 'True', ' true', 'true ', '1', 'yes', 'on', 'enabled', 'false', '', ' ', 'truee', 'true,true']) {
    assert.equal(rolloutFor(OTHER, { DEALS_ENABLED: v }), 'none', JSON.stringify(v));
  }
  assert.equal(rolloutFor(OTHER, { DEALS_ENABLED: true }), 'none', 'a non-string is not "true"');
});
test('R. pilot list enables exactly the listed accounts and nobody else', () => {
  const env = { DEALS_PILOT_USER_IDS: `${PILOT}, user_2second99` };
  assert.equal(rolloutFor(PILOT, env), 'pilot');
  assert.equal(rolloutFor('user_2second99', env), 'pilot');
  assert.equal(rolloutFor(OTHER, env), 'none');
  assert.equal(rolloutFor(PILOT + 'x', env), 'none', 'no prefix matching');
  assert.equal(rolloutFor(PILOT.slice(0, -1), env), 'none', 'no prefix matching');
});
test('R. malformed pilot entries are ignored and can never match everyone', () => {
  const junk = ['*', 'all', 'ALL', 'user_', 'user_*', 'USER_2abc', 'user-2abc', 'user_2a b', 'user_2abc;x', '"user_2abc"', 'user_2abc​', 'null', 'undefined', 'true'];
  const r = readRollout({ DEALS_PILOT_USER_IDS: junk.join(',') });
  assert.equal(r.pilotIds.size, 0);
  assert.equal(r.ignoredPilotEntries, junk.length);
  for (const id of [PILOT, OTHER, '*', 'user_', 'all']) assert.equal(rolloutFor(id, { DEALS_PILOT_USER_IDS: junk.join(',') }), 'none', id);
  for (const v of ['', ' ', ',', ' , ,, ', '\n']) {
    assert.equal(readRollout({ DEALS_PILOT_USER_IDS: v }).pilotIds.size, 0, JSON.stringify(v));
    assert.equal(rolloutFor(PILOT, { DEALS_PILOT_USER_IDS: v }), 'none');
  }
});
test('R. valid entries survive next to junk; surrounding spaces are trimmed', () => {
  const r = readRollout({ DEALS_PILOT_USER_IDS: ` * ,  ${PILOT}  ,all,` });
  assert.deepEqual([...r.pilotIds], [PILOT]);
  assert.equal(r.ignoredPilotEntries, 2);
});
test('R. the signed-in id must itself be well-formed (no empty / non-string ids)', () => {
  const env = pilotEnv(ON);
  for (const id of [undefined, null, '', 42, {}, ['user_2pilotAbC123']]) assert.equal(rolloutFor(id, pilotEnv()), 'none', String(id));
  assert.equal(rolloutFor(undefined, env), 'general', 'with general rollout the plan still decides');
});
test('R. a listed pilot stays "pilot" when Deals is also on for everyone', () => {
  assert.equal(rolloutFor(PILOT, pilotEnv(ON)), 'pilot');
  assert.equal(rolloutFor(OTHER, pilotEnv(ON)), 'general');
});
test('R. read on every call: changing the variables changes the answer at once', () => {
  const env = {};
  assert.equal(rolloutFor(PILOT, env), 'none');
  env.DEALS_PILOT_USER_IDS = PILOT;
  assert.equal(rolloutFor(PILOT, env), 'pilot');
  delete env.DEALS_PILOT_USER_IDS;
  assert.equal(rolloutFor(PILOT, env), 'none');
});

// ── A. Access decision ──────────────────────────────────────────
test('A. rollout none denies every plan, including Business and enterprise', () => {
  for (const plan of ['free', 'trial', 'starter', 'pro', 'business', 'pro_annual', 'enterprise']) {
    const a = decide(u(plan, { trialExpiresAt: new Date(NOW.getTime() + 86400000) }), OTHER, { env: OFF, now: NOW });
    assert.equal(a.allowed, false, plan);
    assert.equal(a.reason, 'not_rolled_out', plan);
    assert.equal(a.dealLimit, 0, plan);
  }
});
test('A. general rollout: the plan decides, with the approved limits', () => {
  const cases = [['free', false, 0], ['starter', true, 3], ['pro', true, null], ['business', true, null]];
  for (const [plan, allowed, limit] of cases) {
    const a = decide(u(plan), OTHER, { env: ON, now: NOW });
    assert.equal(a.allowed, allowed, plan);
    assert.equal(a.dealLimit, limit, plan);
    assert.equal(a.reason, allowed ? 'plan' : 'plan_required', plan);
    assert.equal(a.rollout, 'general');
  }
});
test('A. annual plans and enterprise behave like their base plan', () => {
  for (const [plan, limit] of [['starter_annual', 3], ['pro_annual', null], ['business_annual', null], ['enterprise', null], ['  Pro_Annual ', null]]) {
    const a = decide(u(plan), OTHER, { env: ON, now: NOW });
    assert.equal(a.allowed, true, plan);
    assert.equal(a.dealLimit, limit, plan);
  }
});
test('A. active trial: Deals with limit 1; expired trial (also exactly now): Free, no Deals', () => {
  const active = decide(u('trial', { trialExpiresAt: new Date(NOW.getTime() + 1000) }), OTHER, { env: ON, now: NOW });
  assert.equal(active.allowed, true); assert.equal(active.dealLimit, 1); assert.equal(active.effectiveBase, 'trial');
  for (const at of [new Date(NOW.getTime() - 1000), NOW]) {
    const expired = decide(u('trial', { trialExpiresAt: at }), OTHER, { env: ON, now: NOW });
    assert.equal(expired.allowed, false); assert.equal(expired.reason, 'plan_required');
    assert.equal(expired.effectiveBase, 'free'); assert.equal(expired.planReason, 'trial_expired');
  }
});
test('A. cancelled / unpaid / incomplete_expired paid plans lose Deals; past_due, trialing and active keep them', () => {
  for (const status of ['canceled', 'cancelled', 'CANCELED', ' unpaid ', 'incomplete_expired']) {
    const a = decide(u('pro', { subscriptionStatus: status }), OTHER, { env: ON, now: NOW });
    assert.equal(a.allowed, false, status); assert.equal(a.effectiveBase, 'free', status);
  }
  for (const status of ['active', 'trialing', 'past_due', null, '']) {
    assert.equal(decide(u('starter', { subscriptionStatus: status }), OTHER, { env: ON, now: NOW }).dealLimit, 3, String(status));
  }
});
test('A. a missing User row or an unknown plan value is Free', () => {
  for (const user of [null, undefined, {}, u(''), u('platinum'), u(null)]) {
    const a = decide(user, OTHER, { env: ON, now: NOW });
    assert.equal(a.allowed, false); assert.equal(a.effectiveBase, 'free');
  }
});
test('A. pilot: Free / Trial / expired trial / Starter / cancelled Pro get Deals with limit 10', () => {
  const users = [u('free'), u('trial', { trialExpiresAt: new Date(NOW.getTime() + 1000) }), u('trial', { trialExpiresAt: new Date(NOW.getTime() - 1000) }),
    u('starter'), u('starter_annual'), u('pro', { subscriptionStatus: 'canceled' }), null];
  for (const user of users) {
    for (const env of [pilotEnv(), pilotEnv(ON)]) {
      const a = decide(user, PILOT, { env, now: NOW });
      assert.equal(a.allowed, true); assert.equal(a.reason, 'pilot'); assert.equal(a.dealLimit, PILOT_DEAL_LIMIT);
    }
  }
  assert.equal(PILOT_DEAL_LIMIT, 10);
});
test('A. pilot on Pro / Business / enterprise stays unlimited', () => {
  for (const plan of ['pro', 'pro_annual', 'business', 'business_annual', 'enterprise']) {
    assert.equal(decide(u(plan), PILOT, { env: pilotEnv(), now: NOW }).dealLimit, null, plan);
  }
});
test('A. plan eligibility is reported separately from rollout', () => {
  const a = decide(u('pro'), OTHER, { env: OFF, now: NOW });
  assert.equal(a.allowed, false); assert.equal(a.planAllows, true); assert.equal(a.rollout, 'none');
  const b = decide(u('free'), PILOT, { env: pilotEnv(), now: NOW });
  assert.equal(b.allowed, true); assert.equal(b.planAllows, false); assert.equal(b.rollout, 'pilot');
});
test('A. the decision object is frozen', () => {
  const a = decide(u('pro'), OTHER, { env: ON, now: NOW });
  assert.ok(Object.isFrozen(a));
  assert.throws(() => { 'use strict'; a.allowed = false; });
});

// ── H. HTTP answers and capacity ────────────────────────────────
test('H. not rolled out: 403 deals_not_available, nothing about plans or settings', () => {
  const d = denialFor(decide(u('business'), OTHER, { env: OFF, now: NOW }));
  assert.equal(d.status, 403);
  assert.deepEqual(Object.keys(d.body).sort(), ['error', 'message']);
  assert.equal(d.body.error, 'deals_not_available');
  assert.equal(denialFor(null).status, 403, 'no decision is a refusal');
});
test('H. plan without Deals: 402 plan_required, upgrade to Starter', () => {
  const d = denialFor(decide(u('free'), OTHER, { env: ON, now: NOW }));
  assert.equal(d.status, 402);
  assert.equal(d.body.error, 'plan_required'); assert.equal(d.body.requiredPlan, 'starter');
  assert.equal(d.body.upgrade, true); assert.equal(d.body.currentPlan, 'free');
});
test('H. allowed: no denial; answers never contain ids or rollout settings', () => {
  assert.equal(denialFor(decide(u('pro'), OTHER, { env: ON, now: NOW })), null);
  const bodies = [denialFor(decide(u('free'), OTHER, { env: ON, now: NOW })).body, denialFor(decide(u('free'), OTHER, { env: OFF, now: NOW })).body,
    limitResponse(decide(u('starter'), OTHER, { env: ON, now: NOW }), 3).body];
  for (const b of bodies) {
    const s = JSON.stringify(b);
    assert.ok(!s.includes('user_') && !s.includes('DEALS_') && !s.includes('pilot'), s);
  }
});
test('H. capacity: Starter 3 means three active deals; unlimited stays open; refused access never has capacity', () => {
  const starter = decide(u('starter'), OTHER, { env: ON, now: NOW });
  assert.equal(canCreateDeal(starter, 0), true); assert.equal(canCreateDeal(starter, 2), true); assert.equal(canCreateDeal(starter, 3), false);
  assert.equal(canCreateDeal(decide(u('pro'), OTHER, { env: ON, now: NOW }), 100000), true);
  assert.equal(canCreateDeal(decide(u('free'), PILOT, { env: pilotEnv(), now: NOW }), 9), true);
  assert.equal(canCreateDeal(decide(u('free'), PILOT, { env: pilotEnv(), now: NOW }), 10), false);
  assert.equal(canCreateDeal(decide(u('pro'), OTHER, { env: OFF, now: NOW }), 0), false);
  assert.equal(canCreateDeal(null, 0), false);
  assert.throws(() => canCreateDeal(starter, -1));
});
test('H. limit answer: 402 plan_limit in the Smart Page shape', () => {
  const r = limitResponse(decide(u('trial', { trialExpiresAt: new Date(NOW.getTime() + 1000) }), OTHER, { env: ON, now: NOW }), 1);
  assert.equal(r.status, 402);
  assert.deepEqual(Object.keys(r.body).sort(), ['current', 'error', 'limit', 'message', 'upgrade']);
  assert.equal(r.body.error, 'plan_limit'); assert.equal(r.body.limit, 1); assert.equal(r.body.current, 1);
  assert.match(r.body.message, /1 active Deal \(/);
});

// ── L. Loading the User row ─────────────────────────────────────
test('L. getDealAccess loads the User by the signed-in id and decides', async () => {
  const seen = [];
  const client = { user: { findUnique: async (q) => { seen.push(q); return u('starter'); } } };
  const a = await getDealAccess(OTHER, { client, env: ON, now: NOW });
  assert.deepEqual(seen, [{ where: { id: OTHER } }]);
  assert.equal(a.allowed, true); assert.equal(a.dealLimit, 3);
});
test('L. missing User row: Free (pilot still allowed)', async () => {
  const client = { user: { findUnique: async () => null } };
  assert.equal((await getDealAccess(OTHER, { client, env: ON, now: NOW })).allowed, false);
  assert.equal((await getDealAccess(PILOT, { client, env: pilotEnv(), now: NOW })).dealLimit, 10);
});
test('L. malformed signed-in id: no lookup at all', async () => {
  let calls = 0;
  const client = { user: { findUnique: async () => { calls += 1; return u('pro'); } } };
  const a = await getDealAccess('not-a-clerk-id', { client, env: ON, now: NOW });
  assert.equal(calls, 0); assert.equal(a.allowed, false);
});
test('L. a database error is thrown, never treated as allowed', async () => {
  const client = { user: { findUnique: async () => { throw new Error('db down'); } } };
  await assert.rejects(getDealAccess(PILOT, { client, env: pilotEnv(ON), now: NOW }), /db down/);
});

// ── K. Foundation only ──────────────────────────────────────────
test('K. wired in exactly once: only routes/dealRoutes.js requires dealAccess', () => {
  const src = path.join(__dirname, '..', 'src');
  const hits = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js') && f.name !== 'dealAccess.js' && /require\([^)]*dealAccess/.test(fs.readFileSync(p, 'utf8'))) hits.push(p);
    }
  })(src);
  assert.deepEqual(hits.map((p) => path.relative(src, p).split(path.sep).join('/')), ['routes/dealRoutes.js']);
});

// ── M. The route guard (requireDealAccess) ──────────────────────
function fakeRes() { return { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } }; }
async function runGuard({ userId, row, env, fails = false }) {
  const client = { user: { findUnique: async () => { if (fails) throw new Error('db down'); return row || null; } } };
  const req = { userId }, res = fakeRes();
  let nextCalled = false;
  const realError = console.error; console.error = () => {};
  try { await access.requireDealAccess({ client, env })(req, res, () => { nextCalled = true; }); } finally { console.error = realError; }
  return { req, res, nextCalled };
}
test('M. guard: allowed -> next(), decision attached to req.dealAccess', async () => {
  const r = await runGuard({ userId: OTHER, row: u('starter'), env: ON });
  assert.equal(r.nextCalled, true); assert.equal(r.req.dealAccess.dealLimit, 3); assert.equal(r.res.body, undefined);
});
test('M. guard: rollout off -> 403, next() never called', async () => {
  const r = await runGuard({ userId: PILOT, row: u('business'), env: OFF });
  assert.equal(r.nextCalled, false); assert.equal(r.res.statusCode, 403); assert.equal(r.res.body.error, 'deals_not_available');
});
test('M. guard: plan without Deals -> 402 plan_required', async () => {
  const r = await runGuard({ userId: OTHER, row: u('free'), env: ON });
  assert.equal(r.nextCalled, false); assert.equal(r.res.statusCode, 402); assert.equal(r.res.body.requiredPlan, 'starter');
});
test('M. guard: lookup error -> 500 without detail, never next()', async () => {
  const r = await runGuard({ userId: PILOT, env: pilotEnv(ON), fails: true });
  assert.equal(r.nextCalled, false); assert.equal(r.res.statusCode, 500);
  assert.deepEqual(r.res.body, { error: 'Failed to check Deals access.' });
});
test('M. guard: reads the live environment when none is given', async () => {
  const saved = { e: process.env.DEALS_ENABLED, p: process.env.DEALS_PILOT_USER_IDS };
  try {
    delete process.env.DEALS_ENABLED; process.env.DEALS_PILOT_USER_IDS = PILOT;
    assert.equal((await runGuard({ userId: PILOT, row: u('free') })).nextCalled, true);
    delete process.env.DEALS_PILOT_USER_IDS;
    assert.equal((await runGuard({ userId: PILOT, row: u('free') })).res.statusCode, 403);
  } finally {
    if (saved.e === undefined) delete process.env.DEALS_ENABLED; else process.env.DEALS_ENABLED = saved.e;
    if (saved.p === undefined) delete process.env.DEALS_PILOT_USER_IDS; else process.env.DEALS_PILOT_USER_IDS = saved.p;
  }
});
test('K. the legacy planGate is not used by dealAccess', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'dealAccess.js'), 'utf8');
  assert.ok(!s.includes('planGate') && !s.includes('config/constants'));
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
