// ============================================================
// plans.test.js — canonical plan model (backend/src/config/plans.js)
//
// Pure unit tests: no Prisma, no Stripe, no network. Covers plan
// normalisation (public, annual, internal 'enterprise', trial, unknown),
// the canonical entitlement table, subscription-status policy, trial
// duration, null-as-unlimited limit helpers and Stripe price mapping.
//
// Same no-framework convention as the other backend tests.
//
// Run: node tests/plans.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

const plans = require(path.join(__dirname, '..', 'src', 'config', 'plans.js'));
const {
  ENTITLEMENTS, DISPLAY_PRICES_EUR, PURCHASABLE_PLAN_IDS, STRIPE_PRICE_ENV_VARS,
  DEFAULT_TRIAL_DURATION_MS,
  normalizePlan, isRecognizedPaidPlan, resolveEffectivePlan, getEntitlements, getPlanEntitlements,
  hasCapacity, remainingCapacity, getTrialDurationMs,
  isPurchasable, stripePriceEnvVar, stripePriceIdForPlan, buildStripePriceToPlanMap, planIdForStripePrice,
} = plans;

const NOW = new Date('2026-10-03T12:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');
const FUTURE = new Date('2026-10-10T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

// Synthetic, non-secret placeholder Price IDs.
const FULL_ENV = {
  STRIPE_PRICE_STARTER: 'price_test_starter_m',
  STRIPE_PRICE_PRO: 'price_test_pro_m',
  STRIPE_PRICE_BUSINESS: 'price_test_business_m',
  STRIPE_PRICE_STARTER_ANNUAL: 'price_test_starter_y',
  STRIPE_PRICE_PRO_ANNUAL: 'price_test_pro_y',
  STRIPE_PRICE_BUSINESS_ANNUAL: 'price_test_business_y',
};

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Canonical entitlement table ─────────────────────────────
test('entitlements: basic QR unlimited (null) on every plan', () => {
  for (const base of ['free', 'trial', 'starter', 'pro', 'business']) {
    assert.equal(ENTITLEMENTS[base].basicQrLimit, null, base);
  }
});

test('entitlements: Smart QR pages Free 0 / Starter 10 / Pro and Business unlimited', () => {
  assert.equal(ENTITLEMENTS.free.smartPageLimit, 0);
  assert.equal(ENTITLEMENTS.starter.smartPageLimit, 10);
  assert.equal(ENTITLEMENTS.pro.smartPageLimit, null);
  assert.equal(ENTITLEMENTS.business.smartPageLimit, null);
});

test('entitlements: dynamic QR, push, wallet, campaigns, AI voice match the approved table', () => {
  const expect = {
    free:     { dynamicQr: false, push: false, walletPasses: false, campaigns: false, aiVoice: false },
    starter:  { dynamicQr: false, push: true,  walletPasses: false, campaigns: false, aiVoice: false },
    pro:      { dynamicQr: true,  push: true,  walletPasses: false, campaigns: true,  aiVoice: true },
    business: { dynamicQr: true,  push: true,  walletPasses: true,  campaigns: true,  aiVoice: true },
  };
  for (const [base, flags] of Object.entries(expect)) {
    for (const [k, v] of Object.entries(flags)) assert.equal(ENTITLEMENTS[base][k], v, `${base}.${k}`);
  }
  assert.equal(ENTITLEMENTS.business.walletPassLimit, null, 'Business wallet passes unlimited');
  for (const base of ['free', 'starter', 'pro']) assert.equal(ENTITLEMENTS[base].walletPassLimit, 0, base);
});

test('entitlements: trial preserves current tierSystem trial caps (1 Smart QR page, analytics, no paid features)', () => {
  const t = ENTITLEMENTS.trial;
  assert.equal(t.smartPageLimit, 1);
  assert.equal(t.analytics, true);
  assert.equal(t.smartDashboard, true);
  for (const k of ['dynamicQr', 'push', 'walletPasses', 'campaigns', 'aiVoice', 'aiChat']) assert.equal(t[k], false, k);
});

test('entitlements: every plan defines exactly the same keys', () => {
  const keys = Object.keys(ENTITLEMENTS.free).sort();
  for (const base of Object.keys(ENTITLEMENTS)) assert.deepEqual(Object.keys(ENTITLEMENTS[base]).sort(), keys, base);
});

test('entitlements and display prices are frozen', () => {
  assert.ok(Object.isFrozen(ENTITLEMENTS));
  assert.ok(Object.isFrozen(ENTITLEMENTS.pro));
  assert.ok(Object.isFrozen(DISPLAY_PRICES_EUR.business));
  assert.throws(() => { 'use strict'; ENTITLEMENTS.free.smartPageLimit = 99; });
});

test('display prices: €0 / €9 / €29 / €49, annual €7 / €23 / €39 per month', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(DISPLAY_PRICES_EUR).map(([k, v]) => [k, [v.monthly, v.annualMonthly]])),
    { free: [0, 0], starter: [9, 7], pro: [29, 23], business: [49, 39] },
  );
});

// ── Normalisation ───────────────────────────────────────────
test('normalizePlan: public base plans', () => {
  for (const id of ['free', 'starter', 'pro', 'business']) {
    const p = normalizePlan(id);
    assert.deepEqual({ ...p }, { raw: id, id, base: id, isAnnual: false, isInternal: false, isTrial: false, known: true });
  }
});

test('normalizePlan: annual variants keep raw/id and resolve to the base plan', () => {
  for (const [id, base] of [['starter_annual', 'starter'], ['pro_annual', 'pro'], ['business_annual', 'business']]) {
    const p = normalizePlan(id);
    assert.equal(p.raw, id);
    assert.equal(p.id, id);
    assert.equal(p.base, base);
    assert.equal(p.isAnnual, true);
    assert.equal(p.isInternal, false);
    assert.equal(p.known, true);
    assert.equal(getEntitlements({ plan: id }, NOW), ENTITLEMENTS[base], `${id} entitlements`);
  }
});

test('normalizePlan: enterprise is a known internal alias of Business', () => {
  const p = normalizePlan('enterprise');
  assert.equal(p.raw, 'enterprise');
  assert.equal(p.id, 'enterprise');
  assert.equal(p.base, 'business');
  assert.equal(p.isInternal, true);
  assert.equal(p.isAnnual, false);
  assert.equal(p.known, true);
});

test('enterprise: Business entitlements with empty subscriptionStatus', () => {
  const e = getEntitlements({ plan: 'enterprise', subscriptionStatus: null }, NOW);
  assert.equal(e, ENTITLEMENTS.business);
  assert.equal(e.smartPageLimit, null, 'unlimited Smart QR pages');
  assert.equal(e.dynamicQr, true);
  assert.equal(e.walletPasses, true);
  assert.equal(hasCapacity(e.smartPageLimit, 9), true, 'an account with 9 pages can still create');
});

test('enterprise: not purchasable, no Stripe price mapping', () => {
  assert.equal(isPurchasable('enterprise'), false);
  assert.equal(stripePriceEnvVar('enterprise'), null);
  assert.equal(stripePriceIdForPlan('enterprise', { ...FULL_ENV, STRIPE_PRICE_ENTERPRISE: 'price_x' }), null);
  assert.ok(![...buildStripePriceToPlanMap(FULL_ENV).values()].includes('enterprise'));
});

test('real Business stays distinguishable from internal enterprise', () => {
  assert.equal(normalizePlan('business').isInternal, false);
  assert.equal(normalizePlan('business_annual').isInternal, false);
  assert.equal(normalizePlan('enterprise').isInternal, true);
  assert.equal(resolveEffectivePlan({ plan: 'enterprise' }, NOW).plan.isInternal, true);
});

test('normalizePlan: unknown value stays identifiable and gets Free entitlements', () => {
  const p = normalizePlan('platinum_unlimited');
  assert.equal(p.known, false);
  assert.equal(p.id, 'platinum_unlimited');
  assert.equal(p.base, 'free');
  assert.equal(p.isInternal, false);
  const r = resolveEffectivePlan({ plan: 'platinum_unlimited', subscriptionStatus: 'active' }, NOW);
  assert.equal(r.effectiveBase, 'free');
  assert.equal(r.reason, 'unknown_plan');
  assert.equal(getEntitlements({ plan: 'platinum_unlimited', subscriptionStatus: 'active' }, NOW), ENTITLEMENTS.free);
  assert.equal(isRecognizedPaidPlan('platinum_unlimited'), false);
});

test('normalizePlan: empty/null/undefined/non-string → free; case and whitespace tolerated', () => {
  for (const v of [null, undefined, '', '   ', 42, {}]) {
    const p = normalizePlan(v);
    assert.equal(p.id, 'free');
    assert.equal(p.base, 'free');
    assert.equal(p.known, true);
  }
  assert.equal(normalizePlan(' Pro_Annual ').base, 'pro');
  assert.equal(normalizePlan('ENTERPRISE').isInternal, true);
});

test('normalizePlan: trial', () => {
  const p = normalizePlan('trial');
  assert.equal(p.base, 'trial');
  assert.equal(p.isTrial, true);
  assert.equal(p.known, true);
});

test('isRecognizedPaidPlan: all paid IDs incl. annual and enterprise; not free/trial/unknown', () => {
  for (const id of ['starter', 'pro', 'business', 'starter_annual', 'pro_annual', 'business_annual', 'enterprise']) {
    assert.equal(isRecognizedPaidPlan(id), true, id);
  }
  for (const id of ['free', 'trial', 'nonsense', null]) assert.equal(isRecognizedPaidPlan(id), false, String(id));
});

// ── Subscription-status policy ──────────────────────────────
test('status: active / trialing / past_due / null keep paid entitlements (all paid IDs)', () => {
  const paid = ['starter', 'pro', 'business', 'starter_annual', 'pro_annual', 'business_annual', 'enterprise'];
  for (const plan of paid) {
    const base = normalizePlan(plan).base;
    for (const subscriptionStatus of ['active', 'trialing', 'past_due', null, '']) {
      const r = resolveEffectivePlan({ plan, subscriptionStatus }, NOW);
      assert.equal(r.effectiveBase, base, `${plan}/${subscriptionStatus}`);
      assert.equal(r.reason, 'plan');
    }
  }
});

test('status: canceled / cancelled / unpaid / incomplete_expired revert paid plans to Free', () => {
  for (const plan of ['starter', 'pro_annual', 'business', 'business_annual']) {
    for (const subscriptionStatus of ['canceled', 'cancelled', 'CANCELED', 'unpaid', 'incomplete_expired']) {
      const r = resolveEffectivePlan({ plan, subscriptionStatus }, NOW);
      assert.equal(r.effectiveBase, 'free', `${plan}/${subscriptionStatus}`);
      assert.equal(getEntitlements({ plan, subscriptionStatus }, NOW), ENTITLEMENTS.free);
    }
  }
  assert.equal(resolveEffectivePlan({ plan: 'pro', subscriptionStatus: 'cancelled' }, NOW).reason, 'subscription_canceled');
  assert.equal(resolveEffectivePlan({ plan: 'pro', subscriptionStatus: 'unpaid' }, NOW).reason, 'subscription_unpaid');
});

test('status: free plan is unaffected by any status', () => {
  for (const s of ['active', 'canceled', 'past_due', null]) {
    assert.equal(resolveEffectivePlan({ plan: 'free', subscriptionStatus: s }, NOW).effectiveBase, 'free');
  }
});

test('status: raw plan value is preserved even when entitlements revert', () => {
  const r = resolveEffectivePlan({ plan: 'business_annual', subscriptionStatus: 'canceled' }, NOW);
  assert.equal(r.plan.raw, 'business_annual');
  assert.equal(r.plan.base, 'business');
  assert.equal(r.effectiveBase, 'free');
});

// ── Trial ───────────────────────────────────────────────────
test('trial: active trial → trial entitlements; expired → Free; no expiry → trial (current behaviour)', () => {
  const active = resolveEffectivePlan({ plan: 'trial', trialExpiresAt: FUTURE }, NOW);
  assert.equal(active.effectiveBase, 'trial');
  assert.equal(active.isTrialExpired, false);
  const expired = resolveEffectivePlan({ plan: 'trial', trialExpiresAt: PAST }, NOW);
  assert.equal(expired.effectiveBase, 'free');
  assert.equal(expired.isTrialExpired, true);
  assert.equal(expired.reason, 'trial_expired');
  assert.equal(getEntitlements({ plan: 'trial', trialExpiresAt: PAST }, NOW), ENTITLEMENTS.free);
  assert.equal(resolveEffectivePlan({ plan: 'trial', trialExpiresAt: null }, NOW).effectiveBase, 'trial');
  assert.equal(resolveEffectivePlan({ plan: 'trial', trialExpiresAt: NOW }, NOW).effectiveBase, 'free', 'expiry instant counts as expired');
  assert.equal(resolveEffectivePlan({ plan: 'trial', trialExpiresAt: FUTURE.toISOString() }, NOW).effectiveBase, 'trial', 'ISO string accepted');
});

test('trial duration: canonical 14 days; TRIAL_DURATION_MS positive-integer override; invalid → default', () => {
  assert.equal(DEFAULT_TRIAL_DURATION_MS, 14 * DAY);
  assert.equal(getTrialDurationMs({}), 14 * DAY);
  assert.equal(getTrialDurationMs({ TRIAL_DURATION_MS: '' }), 14 * DAY);
  assert.equal(getTrialDurationMs({ TRIAL_DURATION_MS: '3600000' }), 3600000);
  for (const bad of ['0', '-5', 'abc', '1.5', '  ']) assert.equal(getTrialDurationMs({ TRIAL_DURATION_MS: bad }), 14 * DAY, bad);
});

// ── Limit helpers ───────────────────────────────────────────
test('hasCapacity: null = unlimited for any count (regression: count >= null)', () => {
  for (const n of [0, 1, 10, 1000000]) assert.equal(hasCapacity(null, n), true, String(n));
  // The pre-existing qrController bug: `count >= null` is `count >= 0` → always "limit reached".
  assert.equal(0 >= null, true, 'documents the JS coercion this helper avoids');
});

test('hasCapacity: finite limits incl. 0', () => {
  assert.equal(hasCapacity(0, 0), false, 'Free Smart QR = 0 blocks the first page');
  assert.equal(hasCapacity(10, 9), true);
  assert.equal(hasCapacity(10, 10), false);
  assert.equal(hasCapacity(10, 11), false);
  assert.equal(hasCapacity(1, 0), true);
});

test('remainingCapacity: null for unlimited, never negative', () => {
  assert.equal(remainingCapacity(null, 500), null);
  assert.equal(remainingCapacity(10, 3), 7);
  assert.equal(remainingCapacity(10, 12), 0);
  assert.equal(remainingCapacity(0, 0), 0);
});

test('limit helpers reject undefined/invalid limits and counts instead of guessing', () => {
  for (const bad of [undefined, -1, 1.5, '10', Infinity, NaN]) {
    assert.throws(() => hasCapacity(bad, 0), TypeError, `limit ${String(bad)}`);
  }
  for (const bad of [undefined, null, -1, 2.5, '3']) {
    assert.throws(() => hasCapacity(10, bad), TypeError, `count ${String(bad)}`);
  }
});

test('Smart QR capacity end-to-end per plan', () => {
  const can = (plan, count, extra = {}) => hasCapacity(getEntitlements({ plan, ...extra }, NOW).smartPageLimit, count);
  assert.equal(can('free', 0), false);
  assert.equal(can('starter', 9), true);
  assert.equal(can('starter_annual', 10), false);
  assert.equal(can('pro', 250), true);
  assert.equal(can('pro_annual', 250), true);
  assert.equal(can('business', 250), true);
  assert.equal(can('enterprise', 250), true);
  assert.equal(can('trial', 0, { trialExpiresAt: FUTURE }), true);
  assert.equal(can('trial', 1, { trialExpiresAt: FUTURE }), false);
  assert.equal(can('pro', 5, { subscriptionStatus: 'canceled' }), false);
});

test('getPlanEntitlements: unknown base → Free', () => {
  assert.equal(getPlanEntitlements('nope'), ENTITLEMENTS.free);
  assert.equal(getPlanEntitlements('business'), ENTITLEMENTS.business);
});

// ── Stripe mapping ──────────────────────────────────────────
test('stripe: exactly six purchasable plans with the expected env var names', () => {
  assert.deepEqual([...PURCHASABLE_PLAN_IDS].sort(), ['business', 'business_annual', 'pro', 'pro_annual', 'starter', 'starter_annual']);
  assert.deepEqual({ ...STRIPE_PRICE_ENV_VARS }, {
    starter: 'STRIPE_PRICE_STARTER', pro: 'STRIPE_PRICE_PRO', business: 'STRIPE_PRICE_BUSINESS',
    starter_annual: 'STRIPE_PRICE_STARTER_ANNUAL', pro_annual: 'STRIPE_PRICE_PRO_ANNUAL', business_annual: 'STRIPE_PRICE_BUSINESS_ANNUAL',
  });
  for (const id of ['free', 'trial', 'enterprise', 'nonsense', null]) {
    assert.equal(isPurchasable(id), false, String(id));
    assert.equal(stripePriceEnvVar(id), null, String(id));
  }
});

test('stripe: plan → price and price → plan for all six monthly/annual variants', () => {
  for (const planId of PURCHASABLE_PLAN_IDS) {
    const priceId = stripePriceIdForPlan(planId, FULL_ENV);
    assert.equal(priceId, FULL_ENV[STRIPE_PRICE_ENV_VARS[planId]], planId);
    assert.equal(planIdForStripePrice(priceId, FULL_ENV), planId, `${planId} reverse`);
  }
  assert.equal(buildStripePriceToPlanMap(FULL_ENV).size, 6);
});

test('stripe: unset/empty env vars never create an "undefined" key and are not silently replaced', () => {
  const env = { STRIPE_PRICE_STARTER: 'price_test_starter_m', STRIPE_PRICE_PRO: '', STRIPE_PRICE_BUSINESS: '   ' };
  const map = buildStripePriceToPlanMap(env);
  assert.deepEqual([...map.entries()], [['price_test_starter_m', 'starter']]);
  assert.equal(map.has('undefined'), false);
  assert.equal(map.has(undefined), false);
  assert.equal(planIdForStripePrice('undefined', env), null);
  assert.equal(stripePriceIdForPlan('pro', env), null);
  assert.equal(stripePriceIdForPlan('starter_annual', env), null, 'no annual → monthly fallback');
  assert.equal(buildStripePriceToPlanMap({}).size, 0);
});

test('stripe: unknown/empty price → null; duplicate price prefers the monthly plan', () => {
  assert.equal(planIdForStripePrice('price_unknown', FULL_ENV), null);
  assert.equal(planIdForStripePrice('', FULL_ENV), null);
  assert.equal(planIdForStripePrice(null, FULL_ENV), null);
  const dup = { ...FULL_ENV, STRIPE_PRICE_PRO_ANNUAL: FULL_ENV.STRIPE_PRICE_PRO };
  assert.equal(planIdForStripePrice(FULL_ENV.STRIPE_PRICE_PRO, dup), 'pro');
});

test('stripe helpers default to process.env without throwing', () => {
  assert.doesNotThrow(() => buildStripePriceToPlanMap());
  assert.doesNotThrow(() => stripePriceIdForPlan('starter'));
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
