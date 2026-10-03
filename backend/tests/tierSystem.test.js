// ============================================================
// tierSystem.test.js — tierSystem adapter over the canonical plan model
//
//  - Every plan ID (free, trial, starter[_annual], pro[_annual],
//    business[_annual], enterprise, unknown) resolves through
//    config/plans.js: enterprise = Business entitlements (internal),
//    annual = base-plan entitlements, unknown = Free.
//  - Canonical subscription-status policy (past_due keeps paid access;
//    canceled/cancelled/unpaid/incomplete_expired revert to Free).
//  - buildPlanInfo keeps the response shape consumed by frontend
//    js/session.js (only additive keys).
//  - requireCap keeps its contract; startTrial never overwrites a
//    recognised paid plan and uses the canonical 14-day duration.
//
// Mocked-Prisma, no framework, same convention as the other backend tests.
//
// Run: node tests/tierSystem.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

delete process.env.TRIAL_DURATION_MS; // exercise the canonical default

const srcDir = path.join(__dirname, '..', 'src');
const prismaClientPath = require.resolve(path.join(srcDir, 'utils', 'prismaClient.js'));

let users = {};
let calls = [];
const mockPrisma = {
  user: {
    async findUnique({ where }) {
      calls.push({ method: 'findUnique', where });
      return users[where.id] ? { ...users[where.id] } : null;
    },
    async updateMany({ where, data }) {
      calls.push({ method: 'updateMany', where, data });
      const u = users[where.id];
      if (!u) return { count: 0 };
      if (where.plan && where.plan.notIn && where.plan.notIn.includes(u.plan)) return { count: 0 };
      if ('trialExpiresAt' in where && where.trialExpiresAt === null && u.trialExpiresAt != null) return { count: 0 };
      Object.assign(u, data);
      return { count: 1 };
    },
  },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const tier = require(path.join(srcDir, 'utils', 'tierSystem.js'));
const { ENTITLEMENTS } = require(path.join(srcDir, 'config', 'plans.js'));
const { PLAN_CAPS, resolveEffectivePlan, buildPlanInfo, requireCap, startTrial, TRIAL_DURATION_MS, TIERS } = tier;

const DAY = 24 * 60 * 60 * 1000;
const FUTURE = new Date(Date.now() + 3 * DAY);
const PAST = new Date(Date.now() - DAY);

// Keys the pre-migration buildPlanInfo returned (frontend js/session.js reads these).
const LEGACY_KEYS = [
  'plan', 'rawPlan', 'basePlan', 'isAnnual', 'isFree', 'isTrial', 'isTrialExpired', 'isPremium',
  'subscriptionStatus', 'canCreateAI', 'canUseDynamic', 'canAccessSmartDash', 'canUseAnalytics',
  'canUseWallet', 'canUsePush', 'canUseCampaigns', 'aiLimit', 'aiQrCount', 'aiRemaining',
  'dynamicLimit', 'trialExpiresAt', 'trialSecondsRemaining', 'hasPhone',
];
const ADDED_KEYS = ['isInternal', 'isKnownPlan'];

function expectedCaps(base) {
  const e = ENTITLEMENTS[base];
  return {
    canCreateAI: e.smartPageLimit !== 0, canUseDynamic: e.dynamicQr, canAccessSmartDash: e.smartDashboard,
    canUseAnalytics: e.analytics, canUseWallet: e.walletPasses, canUsePush: e.push,
    canUseCampaigns: e.campaigns, aiLimit: e.smartPageLimit, dynamicLimit: e.dynamicQr ? null : 0,
  };
}
const capsOf = (info) => Object.fromEntries(Object.keys(expectedCaps('free')).map(k => [k, info[k]]));

function fakeRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn: async () => { users = {}; calls = []; await fn(); } }); }

// ── Plan IDs ────────────────────────────────────────────────
const PLAN_CASES = [
  // [plan, extra, effectivePlan, basePlan, isAnnual, isInternal, isPremium]
  ['free',            {},                          'free',            'free',     false, false, false],
  ['trial',           { trialExpiresAt: FUTURE },  'trial',           'trial',    false, false, false],
  ['trial',           { trialExpiresAt: PAST },    'free',            'free',     false, false, false],
  ['starter',         {},                          'starter',         'starter',  false, false, true],
  ['starter_annual',  {},                          'starter_annual',  'starter',  true,  false, true],
  ['pro',             {},                          'pro',             'pro',      false, false, true],
  ['pro_annual',      {},                          'pro_annual',      'pro',      true,  false, true],
  ['business',        {},                          'business',        'business', false, false, true],
  ['business_annual', {},                          'business_annual', 'business', true,  false, true],
  ['enterprise',      {},                          'enterprise',      'business', false, true,  true],
  ['gold_lifetime',   {},                          'free',            'free',     false, false, false],
];

for (const [plan, extra, eff, base, isAnnual, isInternal, isPremium] of PLAN_CASES) {
  const label = plan + (extra.trialExpiresAt ? (extra.trialExpiresAt > new Date() ? ' (active)' : ' (expired)') : '');
  test(`plan ${label}: effective=${eff}, base=${base}, entitlements of ${base}`, () => {
    const user = { plan, subscriptionStatus: null, ...extra };
    assert.equal(resolveEffectivePlan(user), eff);
    const info = buildPlanInfo(user, 0);
    assert.equal(info.plan, eff);
    assert.equal(info.rawPlan, plan);
    assert.equal(info.basePlan, base);
    assert.equal(info.isAnnual, isAnnual);
    assert.equal(info.isInternal, isInternal);
    assert.equal(info.isPremium, isPremium);
    assert.equal(info.isFree, eff === 'free');
    assert.equal(info.isTrial, eff === 'trial');
    assert.deepEqual(capsOf(info), expectedCaps(base));
    assert.deepEqual({ ...PLAN_CAPS[eff] }, expectedCaps(base), 'PLAN_CAPS lookup by the returned plan string');
  });
}

test('enterprise: Business entitlements, internal, unlimited Smart QR, dynamic + wallet, never Free', () => {
  const info = buildPlanInfo({ plan: 'enterprise', subscriptionStatus: null }, 9);
  assert.equal(info.plan, 'enterprise');
  assert.equal(info.basePlan, 'business');
  assert.equal(info.isInternal, true);
  assert.equal(info.isKnownPlan, true);
  assert.equal(info.isFree, false);
  assert.equal(info.aiLimit, null);
  assert.equal(info.aiRemaining, null);
  assert.equal(info.canUseDynamic, true);
  assert.equal(info.canUseWallet, true);
  assert.deepEqual(capsOf(info), capsOf(buildPlanInfo({ plan: 'business' })));
});

test('real Business is not internal', () => {
  assert.equal(buildPlanInfo({ plan: 'business', subscriptionStatus: 'active' }).isInternal, false);
  assert.equal(buildPlanInfo({ plan: 'business_annual', subscriptionStatus: 'active' }).isInternal, false);
});

test('annual plans have exactly their base plan capabilities', () => {
  for (const [annual, base] of [['starter_annual', 'starter'], ['pro_annual', 'pro'], ['business_annual', 'business']]) {
    assert.deepEqual({ ...PLAN_CAPS[annual] }, { ...PLAN_CAPS[base] }, annual);
    assert.deepEqual(capsOf(buildPlanInfo({ plan: annual })), capsOf(buildPlanInfo({ plan: base })), annual);
  }
});

test('unknown plan: Free capabilities, raw value kept, flagged unknown', () => {
  const info = buildPlanInfo({ plan: 'gold_lifetime', subscriptionStatus: 'active' });
  assert.equal(info.plan, 'free');
  assert.equal(info.rawPlan, 'gold_lifetime');
  assert.equal(info.isKnownPlan, false);
  assert.equal(info.isPremium, false);
  assert.deepEqual(capsOf(info), expectedCaps('free'));
});

// ── Subscription status ─────────────────────────────────────
test('status active / trialing / past_due / null keep paid capabilities (every paid plan)', () => {
  for (const plan of ['starter', 'starter_annual', 'pro', 'pro_annual', 'business', 'business_annual', 'enterprise']) {
    for (const subscriptionStatus of ['active', 'trialing', 'past_due', null]) {
      const user = { plan, subscriptionStatus, stripeSubscriptionId: 'sub_placeholder' };
      assert.equal(resolveEffectivePlan(user), plan, `${plan}/${subscriptionStatus}`);
      assert.equal(buildPlanInfo(user).isPremium, true, `${plan}/${subscriptionStatus}`);
    }
  }
});

test('status canceled / cancelled / unpaid / incomplete_expired revert to Free (with or without a subscription ID)', () => {
  for (const plan of ['starter', 'pro_annual', 'business', 'business_annual']) {
    for (const subscriptionStatus of ['canceled', 'cancelled', 'unpaid', 'incomplete_expired']) {
      for (const stripeSubscriptionId of ['sub_placeholder', null]) {
        const user = { plan, subscriptionStatus, stripeSubscriptionId };
        assert.equal(resolveEffectivePlan(user), 'free', `${plan}/${subscriptionStatus}/${stripeSubscriptionId}`);
        const info = buildPlanInfo(user);
        assert.equal(info.isFree, true);
        assert.equal(info.rawPlan, plan);
        assert.equal(info.subscriptionStatus, subscriptionStatus);
        assert.deepEqual(capsOf(info), expectedCaps('free'));
      }
    }
  }
});

// ── Trial ───────────────────────────────────────────────────
test('trial: active shows remaining time; expired → Free + isTrialExpired', () => {
  const active = buildPlanInfo({ plan: 'trial', trialExpiresAt: FUTURE }, 0);
  assert.equal(active.isTrial, true);
  assert.equal(active.aiLimit, 1);
  assert.equal(active.aiRemaining, 1);
  assert.ok(active.trialSecondsRemaining > 2 * 24 * 3600);
  assert.equal(active.trialExpiresAt, FUTURE);
  const expired = buildPlanInfo({ plan: 'trial', trialExpiresAt: PAST }, 1);
  assert.equal(expired.plan, 'free');
  assert.equal(expired.isTrialExpired, true);
  assert.equal(expired.trialSecondsRemaining, 0);
  assert.equal(expired.aiRemaining, 0);
});

test('TRIAL_DURATION_MS export is the canonical 14 days when the env var is unset', () => {
  assert.equal(TRIAL_DURATION_MS, 14 * DAY);
});

test('startTrial: free user → trial expiring in 14 days', async () => {
  users.u1 = { id: 'u1', plan: 'free', trialExpiresAt: null };
  const before = Date.now();
  const updated = await startTrial('u1');
  assert.equal(updated.plan, 'trial');
  const ms = new Date(updated.trialExpiresAt).getTime() - before;
  assert.ok(ms >= 14 * DAY - 1000 && ms <= 14 * DAY + 1000, `duration ${ms}`);
});

test('startTrial never overwrites a recognised paid plan (incl. annual, Business, enterprise)', async () => {
  for (const plan of ['starter', 'starter_annual', 'pro', 'pro_annual', 'business', 'business_annual', 'enterprise']) {
    users.u2 = { id: 'u2', plan, trialExpiresAt: null };
    const result = await startTrial('u2');
    assert.equal(result.plan, plan, plan);
    assert.equal(result.trialExpiresAt, null, plan);
  }
  const upd = calls.filter(c => c.method === 'updateMany');
  assert.ok(upd.every(c => c.where.plan.notIn.includes('enterprise') && c.where.plan.notIn.includes('business_annual')));
});

// ── Response shape ──────────────────────────────────────────
test('buildPlanInfo keeps every legacy key; only isInternal/isKnownPlan added', () => {
  for (const user of [{ plan: 'free' }, { plan: 'trial', trialExpiresAt: FUTURE }, { plan: 'pro_annual', subscriptionStatus: 'active' }, { plan: 'enterprise' }]) {
    assert.deepEqual(Object.keys(buildPlanInfo(user, 0)).sort(), [...LEGACY_KEYS, ...ADDED_KEYS].sort());
  }
});

test('buildPlanInfo: aiQrCount echoed; invalid counts do not throw', () => {
  assert.equal(buildPlanInfo({ plan: 'starter' }, 4).aiRemaining, 6);
  assert.equal(buildPlanInfo({ plan: 'starter' }, 4).aiQrCount, 4);
  assert.doesNotThrow(() => buildPlanInfo({ plan: 'starter' }, undefined));
  assert.equal(buildPlanInfo({ plan: 'pro' }, 999).aiRemaining, null);
  assert.equal(buildPlanInfo({ plan: 'free', phone: '+49' }).hasPhone, true);
});

test('exports keep their names; TIERS adds business/annual/enterprise', () => {
  for (const k of ['TIERS', 'PLAN_CAPS', 'TRIAL_DURATION_MS', 'resolveEffectivePlan', 'buildPlanInfo', 'requireCap', 'startTrial']) {
    assert.ok(k in tier, k);
  }
  assert.equal(TIERS.BUSINESS, 'business');
  assert.equal(TIERS.ENTERPRISE, 'enterprise');
  assert.deepEqual(Object.keys(PLAN_CAPS).sort(),
    ['business', 'business_annual', 'enterprise', 'free', 'pro', 'pro_annual', 'starter', 'starter_annual', 'trial']);
});

// ── requireCap ──────────────────────────────────────────────
test('requireCap: 401 without user; 403 when capability missing; next() with plan when allowed', async () => {
  let res = fakeRes();
  await requireCap('canUseDynamic')({ auth: {} }, res, () => assert.fail('next'));
  assert.equal(res.statusCode, 401);

  users.free1 = { id: 'free1', plan: 'free' };
  res = fakeRes();
  await requireCap('canUseDynamic')({ auth: { userId: 'free1' } }, res, () => assert.fail('next'));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.currentPlan, 'free');
  assert.equal(res.body.requiredCap, 'canUseDynamic');

  users.ent = { id: 'ent', plan: 'enterprise' };
  const req = { auth: { userId: 'ent' } };
  let nexted = false;
  await requireCap('canUseDynamic')(req, fakeRes(), () => { nexted = true; });
  assert.equal(nexted, true);
  assert.equal(req.userPlan, 'enterprise');
  assert.equal(req.planCaps.canUseDynamic, true);

  users.exp = { id: 'exp', plan: 'trial', trialExpiresAt: PAST };
  res = fakeRes();
  await requireCap('canCreateAI')({ auth: { userId: 'exp' } }, res, () => assert.fail('next'));
  assert.match(res.body.error, /trial has expired/);
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
