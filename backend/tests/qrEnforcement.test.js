// ============================================================
// qrEnforcement.test.js — legacy /qr entitlement enforcement over the
// canonical plan model (handleCreateQR, handleUpdateDestination).
//
//  - Basic QR: unlimited on every plan (old Starter cap of 10 removed).
//  - Legacy AI QR (businessName): availability and limit from the
//    canonical Smart QR entitlement, counted on its own QR.businessName
//    records only; null = unlimited (fixes the old `count >= null` 403).
//  - Dynamic QR create + destination editing: canonical dynamicQr.
//  - Effective plan: trial expiry and subscription-status policy apply;
//    annual = base plan; enterprise = Business; unknown = Free.
//  - Status codes / response keys unchanged; blocked requests write nothing.
//
// Mocked Prisma, Clerk and outbound fetch; no network or DB.
// Same no-framework convention as the other backend tests.
//
// Run: node tests/qrEnforcement.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
function seed(modPath, exports) {
  require.cache[modPath] = { id: modPath, filename: modPath, loaded: true, exports };
}

const DAY = 24 * 60 * 60 * 1000;

// ── Mock state ──────────────────────────────────────────────
let userRow = null;         // returned by upsertUser (with qrs)
let legacyAiCount = 0;      // prisma.qR.count for businessName records
let qrById = {};            // for handleUpdateDestination
let writes = [];
let countCalls = [];

const mockPrisma = {
  user: {
    findUnique: async () => ({ email: 'owner@example.invalid' }),
    upsert: async () => ({ ...userRow }),
  },
  qR: {
    count: async (args) => { countCalls.push(args); return legacyAiCount; },
    create: async ({ data }) => { writes.push({ op: 'create', data }); return { id: 'qr_new', ...data }; },
    update: async ({ where, data }) => { writes.push({ op: 'update', where, data }); return { ...qrById[where.id], ...data }; },
    findUnique: async ({ where }) => (qrById[where.id] ? { ...qrById[where.id] } : null),
  },
};

seed(resolve('src', 'utils', 'prismaClient.js'), mockPrisma);
seed(require.resolve('@clerk/backend'), { verifyToken: async (token) => ({ sub: token }), createClerkClient: () => ({}) });
seed(resolve('src', 'utils', 'clerkEmailSync.js'), { fetchPrimaryEmail: async () => null });
seed(resolve('src', 'services', 'customerQueryService.js'), {
  getCustomerCountsBySlug: async () => new Map(), getCustomerGrowthSeries: async () => [], getCustomerSummary: async () => null,
});
// Background site scrape after an AI QR create must never reach the network.
global.fetch = async () => ({ json: async () => ({ success: false }) });

const { handleCreateQR, handleUpdateDestination } = require(resolve('src', 'controllers', 'qrController.js'));

function fakeRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function reset(user, { qrCount = 0, aiCount = 0 } = {}) {
  userRow = user ? { id: 'user_1', phone: null, qrs: Array.from({ length: qrCount }, (_, i) => ({ id: 'q' + i })), ...user } : null;
  legacyAiCount = aiCount;
  qrById = {};
  writes = [];
  countCalls = [];
}
async function create(user, body, counts) {
  reset(user, counts);
  const res = fakeRes();
  await handleCreateQR({ headers: user ? { authorization: 'Bearer user_1' } : {}, body: { url: 'https://example.invalid', ...body } }, res);
  return res;
}
async function updateDest(user, { qr = { id: 'qr1', userId: 'user_1', isDynamic: true, destinationUrl: 'https://old.invalid' }, auth = true } = {}) {
  reset(user);
  if (qr) qrById[qr.id] = qr;
  const res = fakeRes();
  await handleUpdateDestination({ params: { id: 'qr1' }, headers: auth ? { authorization: 'Bearer user_1' } : {}, body: { destinationUrl: 'https://new.invalid' } }, res);
  return res;
}

const ACTIVE = (plan) => ({ plan, subscriptionStatus: 'active' });
const FUTURE = () => new Date(Date.now() + 3 * DAY);
const PAST = () => new Date(Date.now() - DAY);

// [label, user, effective plan string, legacy AI limit (null = unlimited), dynamic]
const MATRIX = [
  ['free',               { plan: 'free' },                                  'free',            0,    false],
  ['trial (active)',     { plan: 'trial', trialExpiresAt: FUTURE() },       'trial',           1,    false],
  ['trial (expired)',    { plan: 'trial', trialExpiresAt: PAST() },         'free',            0,    false],
  ['starter',            ACTIVE('starter'),                                 'starter',         10,   false],
  ['starter_annual',     ACTIVE('starter_annual'),                          'starter_annual',  10,   false],
  ['pro',                ACTIVE('pro'),                                     'pro',             null, true],
  ['pro_annual',         ACTIVE('pro_annual'),                              'pro_annual',      null, true],
  ['business',           ACTIVE('business'),                                'business',        null, true],
  ['business_annual',    ACTIVE('business_annual'),                         'business_annual', null, true],
  ['enterprise',         { plan: 'enterprise', subscriptionStatus: null },  'enterprise',      null, true],
  ['unknown',            { plan: 'gold_lifetime' },                         'free',            0,    false],
  ['pro past_due',       { plan: 'pro', subscriptionStatus: 'past_due' },   'pro',             null, true],
  ['starter past_due',   { plan: 'starter', subscriptionStatus: 'past_due' },'starter',        10,   false],
  ['pro null status',    { plan: 'pro', subscriptionStatus: null },         'pro',             null, true],
  ['business "" status', { plan: 'business', subscriptionStatus: '' },      'business',        null, true],
  ...['canceled', 'cancelled', 'unpaid', 'incomplete_expired'].flatMap(s => [
    [`pro ${s}`,       { plan: 'pro', subscriptionStatus: s },          'free', 0, false],
    [`starter ${s}`,   { plan: 'starter', subscriptionStatus: s },      'free', 0, false],
    [`business_annual ${s}`, { plan: 'business_annual', subscriptionStatus: s }, 'free', 0, false],
  ]),
];

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Basic QR ────────────────────────────────────────────────
for (const [label, user] of MATRIX) {
  test(`basic QR ${label}: allowed at counts 0, 12 (above old Starter cap) and 50`, async () => {
    for (const qrCount of [0, 12, 50]) {
      const res = await create(user, {}, { qrCount });
      assert.equal(res.statusCode, 201, `${label} @${qrCount}: ${JSON.stringify(res.body)}`);
      assert.deepEqual(Object.keys(res.body), ['id', 'redirectUrl', 'isDynamic']);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].data.userId, 'user_1');
      assert.equal(writes[0].data.businessName, null);
      assert.equal(countCalls.length, 0, 'no AI count for a basic QR');
    }
  });
}

test('basic QR anonymous: still created without an owner', async () => {
  const res = await create(null, {});
  assert.equal(res.statusCode, 201);
  assert.equal(writes[0].data.userId, null);
});

test('invalid URL still 400 before any plan work', async () => {
  reset(ACTIVE('pro'));
  const res = fakeRes();
  await handleCreateQR({ headers: { authorization: 'Bearer user_1' }, body: { url: 'ftp://x' } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'A valid URL is required.' });
  assert.equal(writes.length, 0);
});

// ── Legacy AI QR ────────────────────────────────────────────
for (const [label, user, plan, limit] of MATRIX) {
  if (limit === 0) {
    test(`legacy AI QR ${label}: blocked (effective ${plan})`, async () => {
      const res = await create(user, { businessName: 'Cafe' }, { aiCount: 0 });
      assert.equal(res.statusCode, 403);
      assert.deepEqual(Object.keys(res.body).sort(), ['error', 'plan', 'upgrade', 'upgradeFeature']);
      assert.equal(res.body.upgradeFeature, 'ai_landing_page');
      assert.equal(res.body.plan, plan);
      assert.equal(res.body.upgrade, true);
      assert.equal(writes.length, 0);
    });
  } else if (limit === null) {
    test(`legacy AI QR ${label}: unlimited at counts 0, 10 and 500 (null bug fixed)`, async () => {
      for (const aiCount of [0, 10, 500]) {
        const res = await create(user, { businessName: 'Cafe' }, { aiCount });
        assert.equal(res.statusCode, 201, `${label} @${aiCount}: ${JSON.stringify(res.body)}`);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].data.businessName, 'Cafe');
      }
    });
  } else {
    test(`legacy AI QR ${label}: limit ${limit} — count ${limit - 1} allowed, count ${limit} blocked`, async () => {
      for (let aiCount = 0; aiCount < limit; aiCount++) {
        const ok = await create(user, { businessName: 'Cafe' }, { aiCount });
        assert.equal(ok.statusCode, 201, `${label} @${aiCount}`);
      }
      const blocked = await create(user, { businessName: 'Cafe' }, { aiCount: limit });
      assert.equal(blocked.statusCode, 403);
      assert.deepEqual(Object.keys(blocked.body).sort(), ['error', 'plan', 'upgrade', 'upgradeFeature']);
      assert.equal(blocked.body.upgradeFeature, 'ai_landing_page_limit');
      assert.equal(blocked.body.plan, plan);
      assert.match(blocked.body.error, new RegExp(`used all ${limit} AI landing pages`));
      assert.equal(writes.length, 0);
      const over = await create(user, { businessName: 'Cafe' }, { aiCount: limit + 1 });
      assert.equal(over.statusCode, 403);
    });
  }
}

test('legacy AI QR Starter: 10th succeeds (count 9), 11th blocked (count 10)', async () => {
  assert.equal((await create(ACTIVE('starter'), { businessName: 'Cafe' }, { aiCount: 9 })).statusCode, 201);
  const res = await create(ACTIVE('starter'), { businessName: 'Cafe' }, { aiCount: 10 });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "You've used all 10 AI landing pages on your Starter plan. Upgrade to Pro for unlimited.");
});

test('legacy AI QR trial limit message names the Trial plan', async () => {
  const res = await create({ plan: 'trial', trialExpiresAt: FUTURE() }, { businessName: 'Cafe' }, { aiCount: 1 });
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /on your Trial plan/);
});

test('legacy AI count queries QR.businessName records only (not landing pages)', async () => {
  await create(ACTIVE('starter'), { businessName: 'Cafe' }, { aiCount: 3 });
  assert.deepEqual(countCalls, [{ where: { userId: 'user_1', businessName: { not: null } } }]);
  countCalls = [];
  await create(ACTIVE('pro'), { businessName: 'Cafe' }, { aiCount: 3 });
  assert.equal(countCalls.length, 0, 'unlimited plans need no count');
});

test('legacy AI QR anonymous: blocked as Free', async () => {
  const res = await create(null, { businessName: 'Cafe' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.plan, 'free');
  assert.equal(writes.length, 0);
});

// ── Dynamic QR create ───────────────────────────────────────
for (const [label, user, plan, , dynamic] of MATRIX) {
  test(`dynamic QR create ${label}: ${dynamic ? 'allowed' : 'blocked'}`, async () => {
    const res = await create(user, { isDynamic: true });
    if (dynamic) {
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.isDynamic, true);
      assert.equal(writes[0].data.isDynamic, true);
      assert.equal(writes[0].data.destinationUrl, 'https://example.invalid');
    } else {
      assert.equal(res.statusCode, 403);
      assert.deepEqual(Object.keys(res.body).sort(), ['error', 'plan', 'upgrade', 'upgradeFeature']);
      assert.equal(res.body.upgradeFeature, 'dynamic_qr');
      assert.equal(res.body.plan, plan);
      assert.equal(writes.length, 0);
    }
  });
}

// ── Dynamic destination update ──────────────────────────────
for (const [label, user, , , dynamic] of MATRIX) {
  test(`dynamic destination update ${label}: ${dynamic ? 'allowed' : 'blocked'}`, async () => {
    const res = await updateDest(user);
    if (dynamic) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { success: true, destinationUrl: 'https://new.invalid' });
      assert.equal(writes.length, 1);
    } else {
      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.body, {
        error: 'Dynamic QR destination editing requires a Pro plan.', upgrade: true, upgradeFeature: 'dynamic_qr',
      });
      assert.equal(writes.length, 0);
    }
  });
}

test('destination update: plan check runs before the QR lookup (Free + missing QR → 403, not 404)', async () => {
  const res = await updateDest({ plan: 'free' }, { qr: null });
  assert.equal(res.statusCode, 403);
});

test('destination update: 401 / 404 / not-owner 403 / not-dynamic 400 unchanged', async () => {
  assert.equal((await updateDest(ACTIVE('pro'), { auth: false })).statusCode, 401);
  assert.equal((await updateDest(ACTIVE('pro'), { qr: null })).statusCode, 404);
  const notOwner = await updateDest(ACTIVE('pro'), { qr: { id: 'qr1', userId: 'someone_else', isDynamic: true } });
  assert.deepEqual([notOwner.statusCode, notOwner.body], [403, { error: 'Not your QR code.' }]);
  const notDynamic = await updateDest(ACTIVE('pro'), { qr: { id: 'qr1', userId: 'user_1', isDynamic: false } });
  assert.deepEqual([notDynamic.statusCode, notDynamic.body], [400, { error: 'This QR code is not dynamic.' }]);
  assert.equal(writes.length, 0);
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
