// ============================================================
// stripeBilling.test.js — Phase 2F: Stripe billing correctness.
//
//  - Price ID ↔ plan mapping (monthly + annual) via config/plans.js;
//    annual subscription updates are no longer dropped.
//  - customer.subscription.updated always records the status; the plan
//    changes only for a known price (unknown price never assigns a plan).
//  - Status handling stays compatible with the canonical plan model
//    (past_due keeps paid; canceled/cancelled/unpaid/incomplete_expired
//    → effective Free).
//  - Checkout: purchasable plans only (enterprise never), no annual→monthly
//    fallback, one subscription per account, internal accounts blocked.
//  - Portal unchanged. /stripe/status canonical + additive fields.
//  - Lazy Stripe init: the controller loads without STRIPE_SECRET_KEY.
//
// Prisma and the `stripe` package are mocked via require.cache; no
// network, Stripe or DB. Fake price IDs only.
//
// Run: node tests/stripeBilling.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const seed = (p, exports) => { require.cache[p] = { id: p, filename: p, loaded: true, exports }; };

const PRICES = {
  STRIPE_PRICE_STARTER: 'price_test_starter_m',
  STRIPE_PRICE_PRO: 'price_test_pro_m',
  STRIPE_PRICE_BUSINESS: 'price_test_business_m',
  STRIPE_PRICE_STARTER_ANNUAL: 'price_test_starter_y',
  STRIPE_PRICE_PRO_ANNUAL: 'price_test_pro_y',
  STRIPE_PRICE_BUSINESS_ANNUAL: 'price_test_business_y',
};
const ENV_KEYS = [...Object.keys(PRICES), 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'FRONTEND_URL'];
for (const k of ENV_KEYS) delete process.env[k];

// ── Mocks ────────────────────────────────────────────────────
let users = {};
const calls = { constructed: 0, customers: [], sessions: [], portals: [], retrieves: [] };
let retrieveImpl = null;

const mockPrisma = {
  user: {
    async findUnique({ where: { id } }) { return users[id] ? { ...users[id] } : null; },
    async findMany({ where: { stripeCustomerId } }) {
      return Object.values(users).filter((u) => u.stripeCustomerId === stripeCustomerId)
        .map((u) => ({ id: u.id, plan: u.plan, stripeSubscriptionId: u.stripeSubscriptionId }));
    },
    async update({ where: { id }, data }) { users[id] = { ...users[id], ...data }; return users[id]; },
    async updateMany({ where: { stripeCustomerId }, data }) {
      let count = 0;
      for (const u of Object.values(users)) if (u.stripeCustomerId === stripeCustomerId) { Object.assign(u, data); count++; }
      return { count };
    },
  },
};
seed(resolve('src', 'utils', 'prismaClient.js'), mockPrisma);

function StripeMock() {
  calls.constructed++;
  return {
    customers: { async create(args) { calls.customers.push(args); return { id: 'cus_new' }; } },
    checkout: { sessions: { async create(args) { calls.sessions.push(args); return { id: 'cs_1', url: 'https://checkout.example.invalid/cs_1' }; } } },
    billingPortal: { sessions: { async create(args) { calls.portals.push(args); return { url: 'https://portal.example.invalid/p' }; } } },
    subscriptions: { async retrieve(id) { calls.retrieves.push(id); return retrieveImpl(id); } },
    webhooks: { constructEvent(body, sig) { if (sig !== 'good') throw new Error('bad signature'); return JSON.parse(body); } },
  };
}
seed(require.resolve('stripe'), StripeMock);

const ctrl = require('../src/controllers/stripeController');
const plans = require('../src/config/plans');

function fakeRes() {
  return { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
}
async function call(handler, req) { const res = fakeRes(); await handler(req, res); return res; }
const checkout = (userId, plan) => call(ctrl.handleCreateCheckout, { userId, body: { plan } });
const status = (userId) => call(ctrl.handleSubscriptionStatus, { userId });
const portal = (userId) => call(ctrl.handleCustomerPortal, { userId });
const webhook = (event, sig = 'good') => call(ctrl.handleWebhook, { headers: { 'stripe-signature': sig }, body: JSON.stringify(event) });
const subUpdated = (customer, priceId, st = 'active') => ({
  type: 'customer.subscription.updated',
  data: { object: { id: 'sub_1', customer, status: st, items: { data: [{ price: { id: priceId } }] } } },
});

function configure() {
  Object.assign(process.env, PRICES, { STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake', FRONTEND_URL: 'https://app.example.invalid' });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn: async () => {
    users = {}; calls.customers = []; calls.sessions = []; calls.portals = []; calls.retrieves = [];
    retrieveImpl = () => ({ cancel_at_period_end: false, current_period_end: 1767225600, items: { data: [{ price: { recurring: { interval: 'month' } } }] } });
    await fn();
  } });
}

// ── 15. Lazy init (runs first, before any env is configured) ─
test('lazy Stripe init: controller loaded and /stripe/status works without STRIPE_SECRET_KEY', async () => {
  assert.equal(calls.constructed, 0, 'Stripe client not constructed at module load');
  users.u = { id: 'u', plan: 'pro', subscriptionStatus: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' };
  const res = await status('u');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.stripeConfigured, false);
  assert.equal(res.body.portalAvailable, false);
  assert.equal(res.body.subscription, null);
  assert.equal(calls.constructed, 0);
});

test('lazy Stripe init: checkout without Stripe config fails cleanly (no crash)', async () => {
  users.u = { id: 'u', plan: 'free' };
  const res = await checkout('u', 'starter');
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Plan price not configured.' });
});

// ── 1–6. Mapping, both directions ────────────────────────────
const MAP = [
  ['starter', 'price_test_starter_m'], ['starter_annual', 'price_test_starter_y'],
  ['pro', 'price_test_pro_m'], ['pro_annual', 'price_test_pro_y'],
  ['business', 'price_test_business_m'], ['business_annual', 'price_test_business_y'],
];
for (const [planId, priceId] of MAP) {
  test(`mapping ${planId} ⇄ ${priceId}; base plan = ${plans.normalizePlan(planId).base}`, async () => {
    configure();
    assert.equal(plans.stripePriceIdForPlan(planId), priceId);
    assert.equal(plans.planIdForStripePrice(priceId), planId);
    // checkout sends that exact price
    users.u = { id: 'u', plan: 'free', email: 'x@example.invalid' };
    const res = await checkout('u', planId);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(calls.sessions[0].line_items, [{ price: priceId, quantity: 1 }]);
    assert.deepEqual(calls.sessions[0].metadata, { userId: 'u', plan: planId });
    // webhook maps it back
    users.w = { id: 'w', plan: 'free', stripeCustomerId: 'cus_w' };
    assert.equal((await webhook(subUpdated('cus_w', priceId))).statusCode, 200);
    assert.equal(users.w.plan, planId);
    assert.equal(plans.resolveEffectivePlan(users.w).effectiveBase, plans.normalizePlan(planId).base);
  });
}

// ── 7. Annual updates no longer dropped ──────────────────────
test('annual subscription.updated: plan switch and status change are recorded', async () => {
  configure();
  users.a = { id: 'a', plan: 'starter_annual', subscriptionStatus: 'active', stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_1' };
  await webhook(subUpdated('cus_a', 'price_test_pro_y', 'active'));
  assert.equal(users.a.plan, 'pro_annual');
  await webhook(subUpdated('cus_a', 'price_test_pro_y', 'past_due'));
  assert.equal(users.a.subscriptionStatus, 'past_due');
  await webhook(subUpdated('cus_a', 'price_test_pro_y', 'active'));
  assert.equal(users.a.subscriptionStatus, 'active', 'recovery from past_due recorded');
});

// ── 8. past_due ──────────────────────────────────────────────
test('past_due (invoice.payment_failed or subscription.updated) keeps the stored paid plan → paid entitlement', async () => {
  configure();
  users.p = { id: 'p', plan: 'business_annual', subscriptionStatus: 'active', stripeCustomerId: 'cus_p', stripeSubscriptionId: 'sub_1' };
  await webhook({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_p' } } });
  assert.deepEqual([users.p.plan, users.p.subscriptionStatus], ['business_annual', 'past_due']);
  assert.equal(plans.resolveEffectivePlan(users.p).effectiveBase, 'business');
  await webhook(subUpdated('cus_p', 'price_test_business_y', 'past_due'));
  assert.equal(plans.resolveEffectivePlan(users.p).effectiveBase, 'business');
  assert.equal((await status('p')).body.basePlan, 'business');
});

// ── 9. Revoking statuses ─────────────────────────────────────
for (const st of ['canceled', 'cancelled', 'unpaid', 'incomplete_expired']) {
  test(`${st}: recorded; effective entitlement Free; status endpoint reports free`, async () => {
    configure();
    users.c = { id: 'c', plan: 'pro', subscriptionStatus: 'active', stripeCustomerId: 'cus_c', stripeSubscriptionId: 'sub_1' };
    await webhook(subUpdated('cus_c', 'price_test_pro_m', st));
    assert.equal(users.c.subscriptionStatus, st);
    assert.equal(plans.resolveEffectivePlan(users.c).effectiveBase, 'free');
    const s = (await status('c')).body;
    assert.deepEqual([s.basePlan, s.aiLimit, s.canCreateAI, s.canUseDynamic], ['free', 0, false, false]);
    // a revoked subscription does not block a new checkout
    assert.equal((await checkout('c', 'starter')).statusCode, 200);
  });
}

test('subscription.deleted: unchanged — plan free, subscription cleared, status cancelled', async () => {
  configure();
  users.d = { id: 'd', plan: 'pro_annual', subscriptionStatus: 'active', stripeCustomerId: 'cus_d', stripeSubscriptionId: 'sub_1' };
  await webhook({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_d' } } });
  assert.deepEqual([users.d.plan, users.d.stripeSubscriptionId, users.d.subscriptionStatus], ['free', null, 'cancelled']);
});

// ── 10. Enterprise ───────────────────────────────────────────
test('enterprise is not purchasable: checkout plan "enterprise" → 400, no Stripe call', async () => {
  configure();
  users.u = { id: 'u', plan: 'free' };
  for (const p of ['enterprise', 'trial', 'free', 'gold', undefined]) {
    const res = await checkout('u', p);
    assert.equal(res.statusCode, 400, String(p));
    assert.deepEqual(res.body, { error: 'Invalid plan.' });
  }
  assert.equal(calls.sessions.length, 0);
});

test('internal enterprise account cannot start a checkout (409 internal_account); stored plan untouched', async () => {
  configure();
  users.e = { id: 'e', plan: 'enterprise', subscriptionStatus: null };
  const res = await checkout('e', 'business');
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'internal_account');
  assert.equal(calls.customers.length + calls.sessions.length, 0);
  assert.equal(users.e.plan, 'enterprise');
  const s = (await status('e')).body;
  assert.deepEqual([s.plan, s.basePlan, s.isInternal, s.aiLimit, s.canUseDynamic], ['enterprise', 'business', true, null, true]);
});

// ── F7. Internal plans protected from subscription.updated ───
test('F7: internal enterprise + known paid price → plan and entitlement unchanged; subscription ID synced', async () => {
  configure();
  for (const raw of ['enterprise', 'Enterprise ']) {
    users.e = { id: 'e', plan: raw, subscriptionStatus: null, stripeCustomerId: 'cus_e', stripeSubscriptionId: null };
    const res = await webhook(subUpdated('cus_e', 'price_test_starter_m', 'active'));
    assert.equal(res.statusCode, 200);
    assert.equal(users.e.plan, raw, 'internal plan preserved');
    assert.equal(users.e.stripeSubscriptionId, 'sub_1', 'subscription ID synchronized');
    assert.equal(users.e.subscriptionStatus, null, 'Stripe status not stored on internal accounts');
    assert.equal(plans.resolveEffectivePlan(users.e).effectiveBase, 'business');
  }
});

test('F7: revoking Stripe status never downgrades an internal account', async () => {
  configure();
  for (const st of ['canceled', 'cancelled', 'unpaid', 'incomplete_expired']) {
    users.e = { id: 'e', plan: 'enterprise', subscriptionStatus: null, stripeCustomerId: 'cus_e' };
    await webhook(subUpdated('cus_e', 'price_test_business_y', st));
    assert.deepEqual([users.e.plan, users.e.subscriptionStatus], ['enterprise', null], st);
    const s = (await status('e')).body;
    assert.deepEqual([s.basePlan, s.isInternal, s.aiLimit], ['business', true, null], st);
  }
});

test('F7: unknown price on an internal account → plan unchanged (F2 protection kept)', async () => {
  configure();
  users.e = { id: 'e', plan: 'enterprise', stripeCustomerId: 'cus_e' };
  await webhook(subUpdated('cus_e', 'price_unknown', 'active'));
  assert.equal(users.e.plan, 'enterprise');
  assert.equal(users.e.stripeSubscriptionId, 'sub_1');
});

test('F7: shared customer — internal row preserved, normal row updated as before', async () => {
  configure();
  users.e = { id: 'e', plan: 'enterprise', subscriptionStatus: null, stripeCustomerId: 'cus_x' };
  users.n = { id: 'n', plan: 'starter', subscriptionStatus: 'active', stripeCustomerId: 'cus_x' };
  await webhook(subUpdated('cus_x', 'price_test_pro_y', 'past_due'));
  assert.deepEqual([users.e.plan, users.e.subscriptionStatus, users.e.stripeSubscriptionId], ['enterprise', null, 'sub_1']);
  assert.deepEqual([users.n.plan, users.n.subscriptionStatus, users.n.stripeSubscriptionId], ['pro_annual', 'past_due', 'sub_1']);
});

test('F7: non-internal subscription.updated unchanged (monthly + annual, plan + status + ID)', async () => {
  configure();
  users.m = { id: 'm', plan: 'free', stripeCustomerId: 'cus_m' };
  await webhook(subUpdated('cus_m', 'price_test_business_m', 'active'));
  assert.deepEqual([users.m.plan, users.m.subscriptionStatus, users.m.stripeSubscriptionId], ['business', 'active', 'sub_1']);
  await webhook(subUpdated('cus_m', 'price_test_business_y', 'trialing'));
  assert.deepEqual([users.m.plan, users.m.subscriptionStatus], ['business_annual', 'trialing']);
  assert.equal((await webhook(subUpdated('cus_nobody', 'price_test_pro_m'))).statusCode, 200, 'no matching user → no-op');
});

// ── F8. Internal plans protected from subscription.deleted ───
const subDeleted = (customer, id = 'sub_1') => ({ type: 'customer.subscription.deleted', data: { object: { id, customer } } });

test('F8: internal + subscription.deleted → not Free; plan/status kept; entitlement intact (resolve + /stripe/status)', async () => {
  configure();
  for (const raw of ['enterprise', 'Enterprise', '  ENTERPRISE ']) {
    users.e = { id: 'e', plan: raw, subscriptionStatus: null, stripeCustomerId: 'cus_e', stripeSubscriptionId: 'sub_1' };
    assert.equal((await webhook(subDeleted('cus_e'))).statusCode, 200);
    assert.equal(users.e.plan, raw, `${JSON.stringify(raw)} preserved`);
    assert.equal(users.e.subscriptionStatus, null, 'no cancelled status written');
    assert.equal(users.e.stripeSubscriptionId, null, 'reference to the deleted subscription cleared');
    assert.equal(plans.resolveEffectivePlan(users.e).effectiveBase, 'business');
    const s = (await status('e')).body;
    assert.deepEqual([s.basePlan, s.isInternal, s.aiLimit, s.canUseDynamic, s.hasSubscription], ['business', true, null, true, false]);
  }
});

test('F8: internal account keeps a different subscription ID when another subscription is deleted', async () => {
  configure();
  users.e = { id: 'e', plan: 'enterprise', subscriptionStatus: 'active', stripeCustomerId: 'cus_e', stripeSubscriptionId: 'sub_other' };
  await webhook(subDeleted('cus_e', 'sub_1'));
  assert.deepEqual([users.e.plan, users.e.subscriptionStatus, users.e.stripeSubscriptionId], ['enterprise', 'active', 'sub_other']);
});

test('F8: normal paid accounts — deletion still downgrades to free / cancelled / ID cleared', async () => {
  configure();
  for (const p of ['starter', 'pro_annual', 'business']) {
    users.n = { id: 'n', plan: p, subscriptionStatus: 'active', stripeCustomerId: 'cus_n', stripeSubscriptionId: 'sub_1' };
    await webhook(subDeleted('cus_n'));
    assert.deepEqual([users.n.plan, users.n.stripeSubscriptionId, users.n.subscriptionStatus], ['free', null, 'cancelled'], p);
    assert.equal(plans.resolveEffectivePlan(users.n).effectiveBase, 'free');
  }
});

test('F8: shared customer — internal row preserved, normal row downgraded', async () => {
  configure();
  users.e = { id: 'e', plan: 'enterprise', subscriptionStatus: null, stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_1' };
  users.n = { id: 'n', plan: 'pro', subscriptionStatus: 'active', stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_1' };
  await webhook(subDeleted('cus_x'));
  assert.deepEqual([users.e.plan, users.e.subscriptionStatus], ['enterprise', null]);
  assert.deepEqual([users.n.plan, users.n.subscriptionStatus], ['free', 'cancelled']);
  assert.equal((await webhook(subDeleted('cus_nobody'))).statusCode, 200, 'no matching user → no-op');
});

// ── F9. Internal plans protected from checkout.session.completed ─
const sessionCompleted = (userId, plan) => ({ type: 'checkout.session.completed', data: { object: { metadata: { userId, plan }, customer: 'cus_9', subscription: 'sub_9' } } });

test('F9: internal + checkout.session.completed → plan/status kept, Stripe IDs stored, entitlement intact', async () => {
  configure();
  for (const raw of ['enterprise', 'Enterprise', '  ENTERPRISE ']) {
    for (const bought of ['business', 'starter_annual']) {
      users.e = { id: 'e', plan: raw, subscriptionStatus: null };
      assert.equal((await webhook(sessionCompleted('e', bought))).statusCode, 200);
      assert.deepEqual([users.e.plan, users.e.subscriptionStatus], [raw, null], `${JSON.stringify(raw)} / ${bought}`);
      assert.deepEqual([users.e.stripeCustomerId, users.e.stripeSubscriptionId], ['cus_9', 'sub_9']);
      assert.equal(plans.resolveEffectivePlan(users.e).effectiveBase, 'business');
      const s = (await status('e')).body;
      assert.deepEqual([s.plan, s.basePlan, s.isInternal, s.aiLimit], [raw, 'business', true, null]);
    }
  }
});

test('F9: after protected checkout, later updated/deleted events still cannot change the internal plan', async () => {
  configure();
  users.e = { id: 'e', plan: 'enterprise', subscriptionStatus: null };
  await webhook(sessionCompleted('e', 'pro'));
  await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_9', customer: 'cus_9', status: 'canceled', items: { data: [{ price: { id: 'price_test_pro_m' } }] } } } });
  await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_9', customer: 'cus_9' } } });
  assert.deepEqual([users.e.plan, users.e.subscriptionStatus, users.e.stripeSubscriptionId], ['enterprise', null, null]);
  assert.equal(plans.resolveEffectivePlan(users.e).effectiveBase, 'business');
});

test('F9: normal accounts — checkout.session.completed unchanged (free, trial, missing-row behaviour)', async () => {
  configure();
  for (const start of [{ plan: 'free' }, { plan: 'trial', trialExpiresAt: new Date(Date.now() + 864e5) }, { plan: 'pro', subscriptionStatus: 'canceled' }]) {
    users.u = { id: 'u', ...start };
    await webhook(sessionCompleted('u', 'pro_annual'));
    assert.deepEqual([users.u.plan, users.u.subscriptionStatus, users.u.stripeCustomerId, users.u.stripeSubscriptionId], ['pro_annual', 'active', 'cus_9', 'sub_9'], start.plan);
  }
});

// ── 11. Unknown price ────────────────────────────────────────
test('unknown price ID: no plan assigned; status still recorded', async () => {
  configure();
  assert.equal(plans.planIdForStripePrice('price_unknown'), null);
  users.f = { id: 'f', plan: 'free', stripeCustomerId: 'cus_f' };
  await webhook(subUpdated('cus_f', 'price_unknown', 'active'));
  assert.equal(users.f.plan, 'free', 'no paid plan from an unknown price');
  assert.equal(users.f.subscriptionStatus, 'active');
  assert.equal(plans.resolveEffectivePlan(users.f).effectiveBase, 'free');
  users.s = { id: 's', plan: 'starter', stripeCustomerId: 'cus_s' };
  await webhook(subUpdated('cus_s', undefined, 'active'));
  assert.equal(users.s.plan, 'starter', 'missing price leaves the plan unchanged');
});

// ── 12/13. Checkout ──────────────────────────────────────────
test('checkout monthly: creates customer once, stores it, returns {url, sessionId}; URLs unchanged', async () => {
  configure();
  users.u = { id: 'u', plan: 'free', email: 'x@example.invalid' };
  const res = await checkout('u', 'pro');
  assert.deepEqual(res.body, { url: 'https://checkout.example.invalid/cs_1', sessionId: 'cs_1' });
  assert.equal(users.u.stripeCustomerId, 'cus_new');
  const s = calls.sessions[0];
  assert.equal(s.mode, 'subscription');
  assert.equal(s.customer, 'cus_new');
  assert.equal(s.success_url, 'https://app.example.invalid/dashboard.html?upgrade=success&plan=pro');
  assert.equal(s.cancel_url, 'https://app.example.invalid/pricing.html?upgrade=cancelled');
  assert.deepEqual(s.subscription_data, { metadata: { userId: 'u', plan: 'pro' } });
  assert.equal(s.trial_period_days, undefined, 'no Stripe trial');
});

test('checkout annual: existing customer reused; annual price sent', async () => {
  configure();
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: new Date(Date.now() + 864e5), stripeCustomerId: 'cus_old' };
  const res = await checkout('u', 'business_annual');
  assert.equal(res.statusCode, 200);
  assert.equal(calls.customers.length, 0);
  assert.equal(calls.sessions[0].customer, 'cus_old');
  assert.deepEqual(calls.sessions[0].line_items, [{ price: 'price_test_business_y', quantity: 1 }]);
});

test('checkout annual with annual price unset → 400, never falls back to the monthly price', async () => {
  configure();
  delete process.env.STRIPE_PRICE_PRO_ANNUAL;
  users.u = { id: 'u', plan: 'free' };
  const res = await checkout('u', 'pro_annual');
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Plan price not configured.' });
  assert.equal(calls.sessions.length, 0);
  assert.equal((await checkout('u', 'pro')).statusCode, 200, 'monthly unaffected');
});

test('checkout with an existing live subscription → 409 subscription_exists (active, past_due, null status)', async () => {
  configure();
  for (const st of ['active', 'past_due', 'trialing', null]) {
    users.u = { id: 'u', plan: 'starter', subscriptionStatus: st, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' };
    const res = await checkout('u', 'pro');
    assert.equal(res.statusCode, 409, String(st));
    assert.equal(res.body.error, 'subscription_exists');
  }
  assert.equal(calls.sessions.length, 0);
});

test('checkout.session.completed: unchanged — stores plan, customer, subscription, status active', async () => {
  configure();
  users.u = { id: 'u', plan: 'free' };
  await webhook({ type: 'checkout.session.completed', data: { object: { metadata: { userId: 'u', plan: 'starter_annual' }, customer: 'cus_9', subscription: 'sub_9' } } });
  assert.deepEqual([users.u.plan, users.u.stripeCustomerId, users.u.stripeSubscriptionId, users.u.subscriptionStatus], ['starter_annual', 'cus_9', 'sub_9', 'active']);
});

test('webhook: bad signature → 400, no DB writes', async () => {
  configure();
  users.w = { id: 'w', plan: 'free', stripeCustomerId: 'cus_w' };
  const res = await webhook(subUpdated('cus_w', 'price_test_pro_m'), 'bad');
  assert.equal(res.statusCode, 400);
  assert.equal(users.w.plan, 'free');
});

// ── 14. Portal ───────────────────────────────────────────────
test('portal: unchanged — 400 without customer; {url} with return_url dashboard', async () => {
  configure();
  users.n = { id: 'n', plan: 'free' };
  const none = await portal('n');
  assert.equal(none.statusCode, 400);
  assert.deepEqual(none.body, { error: 'No active subscription found.' });
  users.y = { id: 'y', plan: 'pro', stripeCustomerId: 'cus_y' };
  const ok = await portal('y');
  assert.deepEqual(ok.body, { url: 'https://portal.example.invalid/p' });
  assert.deepEqual(calls.portals[0], { customer: 'cus_y', return_url: 'https://app.example.invalid/dashboard.html' });
});

// ── /stripe/status shape ─────────────────────────────────────
const LEGACY_STATUS_KEYS = ['plan', 'basePlan', 'aiLimit', 'canCreateAI', 'canUseDynamic', 'stripeCustomerId', 'stripeSubscriptionId', 'subscriptionStatus'];
const ADDED_STATUS_KEYS = ['isAnnual', 'isInternal', 'isTrial', 'trialExpiresAt', 'hasStripeCustomer', 'hasSubscription', 'stripeConfigured', 'portalAvailable', 'subscription'];

test('status: legacy keys kept, additive keys added; annual paid subscriber with live period details', async () => {
  configure();
  users.a = { id: 'a', plan: 'pro_annual', subscriptionStatus: 'active', stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a' };
  retrieveImpl = () => ({ cancel_at_period_end: true, items: { data: [{ current_period_end: 1767225600, price: { recurring: { interval: 'year' } } }] } });
  const s = (await status('a')).body;
  assert.deepEqual(Object.keys(s).sort(), [...LEGACY_STATUS_KEYS, ...ADDED_STATUS_KEYS].sort());
  assert.deepEqual([s.plan, s.basePlan, s.aiLimit, s.canUseDynamic, s.isAnnual, s.isInternal, s.isTrial], ['pro_annual', 'pro', null, true, true, false, false]);
  assert.deepEqual([s.hasStripeCustomer, s.hasSubscription, s.stripeConfigured, s.portalAvailable], [true, true, true, true]);
  assert.deepEqual(s.subscription, { currentPeriodEnd: '2026-01-01T00:00:00.000Z', cancelAtPeriodEnd: true, interval: 'year' });
  assert.deepEqual(calls.retrieves, ['sub_a']);
});

test('status: trial (active/expired), free, unknown plan — canonical values; no Stripe lookup without subscription', async () => {
  configure();
  const exp = new Date(Date.now() + 5 * 864e5);
  users.t = { id: 't', plan: 'trial', trialExpiresAt: exp };
  let s = (await status('t')).body;
  assert.deepEqual([s.basePlan, s.isTrial, s.aiLimit, s.canCreateAI, s.subscription, s.portalAvailable], ['trial', true, 1, true, null, false]);
  assert.equal(new Date(s.trialExpiresAt).getTime(), exp.getTime());
  users.t.trialExpiresAt = new Date(Date.now() - 864e5);
  s = (await status('t')).body;
  assert.deepEqual([s.basePlan, s.isTrial, s.aiLimit], ['free', false, 0]);
  users.g = { id: 'g', plan: 'gold_lifetime' };
  s = (await status('g')).body;
  assert.deepEqual([s.plan, s.basePlan, s.aiLimit], ['gold_lifetime', 'free', 0]);
  s = (await status('missing')).body;
  assert.deepEqual([s.plan, s.basePlan, s.hasStripeCustomer], ['free', 'free', false]);
  assert.equal(calls.retrieves.length, 0);
});

test('status: Stripe lookup error → subscription null, still 200', async () => {
  configure();
  users.a = { id: 'a', plan: 'starter', subscriptionStatus: 'active', stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a' };
  retrieveImpl = () => { throw new Error('stripe down'); };
  const res = await status('a');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subscription, null);
  assert.equal(res.body.basePlan, 'starter');
});

(async () => {
  let pass = 0, fail = 0;
  const origErr = console.error, origLog = console.log;
  for (const { name, fn } of tests) {
    console.error = () => {}; console.log = () => {};
    let err = null;
    try { await fn(); } catch (e) { err = e; }
    console.error = origErr; console.log = origLog;
    if (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${err.message}`); }
    else { pass++; console.log(`PASS  ${name}`); }
  }
  for (const k of ENV_KEYS) delete process.env[k];
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
