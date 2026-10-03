// ============================================================
// qrDashboardPlanInfo.test.js — GET /dashboard planInfo from the
// canonical plan model (display only).
//
//  - planInfo values for every plan ID, trial state and key
//    subscription statuses come from config/plans.js:
//    enterprise = internal Business, annual = base plan, unknown = Free,
//    expired trial / canceled = Free, past_due keeps paid.
//  - null = unlimited; canCreate/canCreateAI never compare against null.
//  - Legacy planInfo keys kept; only basePlan/isInternal added.
//  - The rest of the /dashboard payload (cards, customer summary and
//    growth) is unaffected by the plan.
//
// Mocked Prisma, Clerk and customer services; no network or DB.
// Same no-framework convention as the other backend tests.
//
// Run: node tests/qrDashboardPlanInfo.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
function seed(modPath, exports) {
  require.cache[modPath] = { id: modPath, filename: modPath, loaded: true, exports };
}

const DAY = 24 * 60 * 60 * 1000;

// ── Seed data ───────────────────────────────────────────────
let userRow = null;      // the User row upsertUser returns (with qrs)
let qrRows = [];
let lpRows = [];

const mockPrisma = {
  user: {
    findUnique: async () => (userRow ? { email: 'owner@example.invalid' } : null),
    upsert: async () => ({ ...userRow }),
  },
  qR: {
    findMany: async () => qrRows,
    count: async ({ where }) => qrRows.filter(r => (!where.businessName || !!r.businessName)).length,
  },
  landingPage: { findMany: async () => lpRows },
  subscriber: { groupBy: async () => [{ slug: 'cafe', _count: { id: 4 } }] },
};

seed(resolve('src', 'utils', 'prismaClient.js'), mockPrisma);
seed(require.resolve('@clerk/backend'), {
  verifyToken: async (token) => ({ sub: token }),
  createClerkClient: () => ({}),
});
seed(resolve('src', 'utils', 'clerkEmailSync.js'), { fetchPrimaryEmail: async () => null });
seed(resolve('src', 'services', 'customerQueryService.js'), {
  getCustomerCountsBySlug: async () => new Map([['cafe', 7]]),
  getCustomerGrowthSeries: async () => [{ date: '2026-10-01', count: 2 }],
  getCustomerSummary: async () => ({ totalCustomers: 7 }),
});

const { handleDashboard } = require(resolve('src', 'controllers', 'qrController.js'));

function fakeRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
async function dashboardFor(user, { qrs = [], aiQrs = 0 } = {}) {
  userRow = { id: 'user_1', phone: null, qrs, ...user };
  qrRows = [
    ...qrs.map((q, i) => ({ id: 'q' + i, userId: 'user_1', originalUrl: 'https://example.invalid', scans: [], subscribers: [], createdAt: new Date(2026, 0, i + 1) })),
    ...Array.from({ length: aiQrs }, (_, i) => ({ id: 'a' + i, userId: 'user_1', businessName: 'Biz ' + i, originalUrl: 'https://example.invalid', scans: [{}], subscribers: [], createdAt: new Date(2026, 1, i + 1) })),
  ];
  lpRows = [{ id: 'lp1', slug: 'cafe', businessName: 'Cafe', websiteUrl: 'https://cafe.invalid', scanCount: 12, createdAt: new Date(2026, 2, 1) }];
  const res = fakeRes();
  await handleDashboard({ headers: { authorization: 'Bearer user_1' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return res.body;
}

const LEGACY_KEYS = ['plan', 'qrCount', 'limit', 'aiQrCount', 'aiLimit', 'canCreate', 'canCreateAI', 'canUseDynamic', 'hasPhone'];
const ADDED_KEYS = ['basePlan', 'isInternal'];

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// [label, user, plan, basePlan, isInternal, aiLimit, canUseDynamic]
const CASES = [
  ['free',             { plan: 'free' },                                                'free',            'free',     false, 0,    false],
  ['active trial',     { plan: 'trial', trialExpiresAt: new Date(Date.now() + 3 * DAY) }, 'trial',           'trial',    false, 1,    false],
  ['expired trial',    { plan: 'trial', trialExpiresAt: new Date(Date.now() - DAY) },   'free',            'free',     false, 0,    false],
  ['starter',          { plan: 'starter', subscriptionStatus: 'active' },               'starter',         'starter',  false, 10,   false],
  ['starter_annual',   { plan: 'starter_annual', subscriptionStatus: 'active' },        'starter_annual',  'starter',  false, 10,   false],
  ['pro',              { plan: 'pro', subscriptionStatus: 'active' },                   'pro',             'pro',      false, null, true],
  ['pro_annual',       { plan: 'pro_annual', subscriptionStatus: 'active' },            'pro_annual',      'pro',      false, null, true],
  ['business',         { plan: 'business', subscriptionStatus: 'active' },              'business',        'business', false, null, true],
  ['business_annual',  { plan: 'business_annual', subscriptionStatus: 'active' },       'business_annual', 'business', false, null, true],
  ['enterprise',       { plan: 'enterprise', subscriptionStatus: null },                'enterprise',      'business', true,  null, true],
  ['unknown plan',     { plan: 'gold_lifetime' },                                       'free',            'free',     false, 0,    false],
  ['past_due pro',     { plan: 'pro', subscriptionStatus: 'past_due' },                 'pro',             'pro',      false, null, true],
  ['canceled business',{ plan: 'business', subscriptionStatus: 'canceled' },            'free',            'free',     false, 0,    false],
];

for (const [label, user, plan, basePlan, isInternal, aiLimit, canUseDynamic] of CASES) {
  test(`planInfo ${label}: plan=${plan}, base=${basePlan}, aiLimit=${aiLimit}`, async () => {
    const { planInfo } = await dashboardFor(user, { qrs: [{}, {}, {}], aiQrs: 2 });
    assert.deepEqual(Object.keys(planInfo).sort(), [...LEGACY_KEYS, ...ADDED_KEYS].sort());
    assert.equal(planInfo.plan, plan);
    assert.equal(planInfo.basePlan, basePlan);
    assert.equal(planInfo.isInternal, isInternal);
    assert.equal(planInfo.limit, null, 'basic QR unlimited on every plan');
    assert.equal(planInfo.canCreate, true);
    assert.equal(planInfo.aiLimit, aiLimit);
    assert.equal(planInfo.canUseDynamic, canUseDynamic);
    assert.equal(planInfo.qrCount, 3);
    assert.equal(planInfo.aiQrCount, 2);
    assert.equal(planInfo.canCreateAI, aiLimit === null ? true : 2 < aiLimit);
    assert.equal(planInfo.hasPhone, false);
  });
}

test('unlimited (null) Smart QR limit never reads as "limit reached", even at high counts', async () => {
  for (const plan of ['pro', 'business_annual', 'enterprise']) {
    const { planInfo } = await dashboardFor({ plan, subscriptionStatus: plan === 'enterprise' ? null : 'active' }, { aiQrs: 40 });
    assert.equal(planInfo.aiLimit, null, plan);
    assert.equal(planInfo.canCreateAI, true, plan);
  }
});

test('finite limits: Starter at 10 Smart QR → canCreateAI false; Free at 0 → false', async () => {
  assert.equal((await dashboardFor({ plan: 'starter', subscriptionStatus: 'active' }, { aiQrs: 10 })).planInfo.canCreateAI, false);
  assert.equal((await dashboardFor({ plan: 'starter', subscriptionStatus: 'active' }, { aiQrs: 9 })).planInfo.canCreateAI, true);
  assert.equal((await dashboardFor({ plan: 'free' }, { aiQrs: 0 })).planInfo.canCreateAI, false);
});

test('Starter basic QR no longer capped at 10 in the display', async () => {
  const { planInfo } = await dashboardFor({ plan: 'starter', subscriptionStatus: 'active' }, { qrs: Array.from({ length: 12 }, () => ({})) });
  assert.equal(planInfo.limit, null);
  assert.equal(planInfo.canCreate, true);
});

test('hasPhone reflects the user record', async () => {
  assert.equal((await dashboardFor({ plan: 'free', phone: '+490000' })).planInfo.hasPhone, true);
});

test('non-plan payload is identical across plans (cards, customerSummary, customerGrowth)', async () => {
  const strip = (b) => ({ dashboard: b.dashboard, customerSummary: b.customerSummary, customerGrowth: b.customerGrowth });
  const free = strip(await dashboardFor({ plan: 'free' }, { qrs: [{}], aiQrs: 1 }));
  for (const user of [{ plan: 'enterprise' }, { plan: 'pro_annual', subscriptionStatus: 'active' }, { plan: 'trial', trialExpiresAt: new Date(Date.now() - DAY) }]) {
    assert.deepEqual(strip(await dashboardFor(user, { qrs: [{}], aiQrs: 1 })), free, user.plan);
  }
  assert.deepEqual(Object.keys(await dashboardFor({ plan: 'free' })).sort(), ['customerGrowth', 'customerSummary', 'dashboard', 'planInfo']);
  const lp = free.dashboard.find(c => c.source === 'lp');
  assert.equal(lp.totalVisits, 12);
  assert.equal(lp.totalSubscribers, 4);
  assert.equal(lp.totalCustomers, 7);
  assert.deepEqual(free.customerSummary, { totalCustomers: 7 });
});

test('anonymous request: unchanged { dashboard: [] }', async () => {
  const res = fakeRes();
  await handleDashboard({ headers: {} }, res);
  assert.deepEqual(res.body, { dashboard: [] });
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
