// ============================================================
// stadtpocketCustomerLoyalty.test.js — StadtPocket Working Model:
// customer-facing loyalty progress (READ ONLY).
//
// Mocked-Prisma tests for stadtpocketCustomerLoyaltyService.js, the
// find-only resolveCustomerIdForDeviceToken() in
// stadtpocketPassService.js, and the POST .../loyalty/me route handler.
// Same pattern as tests/stadtpocketPassFoundation.test.js: no test
// framework, Node's assert/strict + a tiny inline runner,
// require.cache override of src/utils/prismaClient.js.
//
// The mock is a Proxy that records EVERY Prisma call (model + method),
// so "never mutates" is asserted against the full call log rather than
// only against the methods this file happens to stub.
//
// Run: node tests/stadtpocketCustomerLoyalty.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');

const PLATFORM = 'stadtpocket_platform';
const TOKEN_A = `spd_${'a'.repeat(48)}`;
const TOKEN_B = `spd_${'b'.repeat(48)}`;
const TOKEN_UNKNOWN = `spd_${'c'.repeat(48)}`;
const SERIAL_A = `sp_${'d'.repeat(48)}`;
const CUSTOMER_A = 'cust_internal_a';
const CUSTOMER_B = 'cust_internal_b';

const WRITE_METHODS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

let calls = [];

const fixtures = {
  identities: [
    { id: 'ci_1', ownerUserId: PLATFORM, type: 'stadtpocket_device', value: TOKEN_A, customerId: CUSTOMER_A },
    { id: 'ci_2', ownerUserId: PLATFORM, type: 'stadtpocket_pass_serial', value: SERIAL_A, customerId: CUSTOMER_A },
    { id: 'ci_3', ownerUserId: PLATFORM, type: 'stadtpocket_device', value: TOKEN_B, customerId: CUSTOMER_B },
    // Same token value under a DIFFERENT tenant -- must never resolve.
    { id: 'ci_4', ownerUserId: 'some_business_owner', type: 'stadtpocket_device', value: TOKEN_UNKNOWN, customerId: 'cust_other_tenant' },
  ],
  locations: [
    { id: 'loc_ulm', slug: 'ulm', type: 'city' },
    { id: 'loc_region', slug: 'region', type: 'region' },
  ],
  listingLocations: [
    { id: 'll_staib', locationId: 'loc_ulm', publicationStatus: 'published', createdAt: new Date(1), listing: { id: 'lst_staib', slug: 'baeckerei-staib', name: 'Bäckerei Staib' }, loyaltyLandingPageId: 'lp_staib', loyaltyLandingPage: { id: 'lp_staib', slug: 'staib-lp' } },
    { id: 'll_brettle', locationId: 'loc_ulm', publicationStatus: 'published', createdAt: new Date(2), listing: { id: 'lst_brettle', slug: 'brettle', name: 'Brettle' }, loyaltyLandingPageId: 'lp_brettle', loyaltyLandingPage: { id: 'lp_brettle', slug: 'brettle-lp' } },
    { id: 'll_none', locationId: 'loc_ulm', publicationStatus: 'published', createdAt: new Date(3), listing: { id: 'lst_none', slug: 'no-loyalty', name: 'No Loyalty' }, loyaltyLandingPageId: null, loyaltyLandingPage: null },
    { id: 'll_disabled', locationId: 'loc_ulm', publicationStatus: 'published', createdAt: new Date(4), listing: { id: 'lst_dis', slug: 'paused-loyalty', name: 'Paused' }, loyaltyLandingPageId: 'lp_dis', loyaltyLandingPage: { id: 'lp_dis', slug: 'disabled-lp' } },
    { id: 'll_draft', locationId: 'loc_ulm', publicationStatus: 'draft', createdAt: new Date(5), listing: { id: 'lst_draft', slug: 'draft-biz', name: 'Draft' }, loyaltyLandingPageId: 'lp_staib', loyaltyLandingPage: { id: 'lp_staib', slug: 'staib-lp' } },
  ],
  stampSettings: [
    { id: 'ss_1', slug: 'staib-lp', goal: 8, rewardName: 'Free Coffee', enabled: true },
    { id: 'ss_2', slug: 'brettle-lp', goal: 10, rewardName: 'Brezel', enabled: true },
    { id: 'ss_3', slug: 'disabled-lp', goal: 5, rewardName: 'Nope', enabled: false },
  ],
  loyaltyCustomers: [
    { id: 'lc_secret_1', slug: 'staib-lp', customerId: CUSTOMER_A, stampCount: 1, totalStamps: 1, rewardReady: false, rewardsEarned: 0, lastStampAt: new Date() },
    { id: 'lc_secret_2', slug: 'brettle-lp', customerId: CUSTOMER_A, stampCount: 3, totalStamps: 3, rewardReady: false, rewardsEarned: 0, lastStampAt: new Date() },
    { id: 'lc_secret_3', slug: 'staib-lp', customerId: CUSTOMER_B, stampCount: 5, totalStamps: 5, rewardReady: false, rewardsEarned: 0, lastStampAt: new Date() },
  ],
};

const readers = {
  customerIdentity: {
    findUnique: ({ where }) => {
      const k = where.ownerUserId_type_value;
      if (!k) return null;
      return fixtures.identities.find((r) => r.ownerUserId === k.ownerUserId && r.type === k.type && r.value === k.value) || null;
    },
  },
  location: {
    findUnique: ({ where }) => fixtures.locations.find((l) => l.slug === where.slug) || null,
  },
  stadtPocketListingLocation: {
    findMany: ({ where }) => fixtures.listingLocations
      .filter((ll) => ll.locationId === where.locationId && ll.publicationStatus === where.publicationStatus && ll.listing.slug === where.listing.slug)
      .sort((a, b) => a.createdAt - b.createdAt),
  },
  stampSettings: {
    findMany: ({ where }) => fixtures.stampSettings.filter((s) => where.slug.in.includes(s.slug) && s.enabled === where.enabled),
  },
  loyaltyCustomer: {
    findUnique: ({ where }) => {
      const k = where.slug_customerId;
      return fixtures.loyaltyCustomers.find((r) => r.slug === k.slug && r.customerId === k.customerId) || null;
    },
  },
};

const mockPrisma = new Proxy({}, {
  get(_, model) {
    if (typeof model !== 'string') return undefined;
    if (model.startsWith('$')) {
      return (...args) => { calls.push({ model, method: model, args }); return Promise.resolve(null); };
    }
    return new Proxy({}, {
      get(__, method) {
        return async (args) => {
          calls.push({ model, method, args });
          const impl = readers[model] && readers[model][method];
          const result = impl ? impl(args) : null;
          return result && typeof result === 'object' ? JSON.parse(JSON.stringify(result)) : result;
        };
      },
    });
  },
});

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const { resolveCustomerIdForDeviceToken } = require('../src/services/stadtpocketPassService');
const { getCustomerLoyaltyForBusiness, CustomerLoyaltyError } = require('../src/services/stadtpocketCustomerLoyaltyService');
const passRoutes = require('../src/routes/stadtpocketPassRoutes');
const { handleGetCustomerLoyalty } = passRoutes;

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function callRoute({ citySlug = 'ulm', listingSlug = 'baeckerei-staib', body = {}, query = {} } = {}) {
  const res = fakeRes();
  await handleGetCustomerLoyalty({ params: { citySlug, listingSlug }, body, query }, res);
  return res;
}

function writeCalls() {
  return calls.filter((c) => WRITE_METHODS.has(c.method) || c.model.startsWith('$'));
}

function assertNoSensitiveValues(payload) {
  const text = JSON.stringify(payload);
  for (const secret of [CUSTOMER_A, CUSTOMER_B, TOKEN_A, TOKEN_B, SERIAL_A, 'lc_secret', 'ci_', 'lp_staib', 'll_staib', 'lst_staib', 'ss_1']) {
    assert.ok(!text.includes(secret), `response leaked ${secret}`);
  }
  for (const key of ['customerId', 'id', 'passId', 'serialNumber', 'deviceToken', 'landingPageId', 'slug']) {
    assert.ok(!new RegExp(`"${key}"\\s*:`).test(text), `response contains key ${key}`);
  }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn: async () => { calls = []; await fn(); } }); }

// ── find-only resolver ────────────────────────────────────────

test('resolveCustomerIdForDeviceToken: valid token resolves its canonical customer', async () => {
  assert.equal(await resolveCustomerIdForDeviceToken(TOKEN_A), CUSTOMER_A);
  assert.deepEqual(writeCalls(), []);
});

test('resolveCustomerIdForDeviceToken: malformed token returns null with NO database access', async () => {
  for (const bad of [null, undefined, '', 'abc', `spd_${'z'.repeat(48)}`, SERIAL_A, `${TOKEN_A}x`, 42, {}]) {
    assert.equal(await resolveCustomerIdForDeviceToken(bad), null);
  }
  assert.equal(calls.length, 0);
});

test('resolveCustomerIdForDeviceToken: unknown / other-tenant token returns null, creates and touches nothing', async () => {
  assert.equal(await resolveCustomerIdForDeviceToken(TOKEN_UNKNOWN), null);
  assert.deepEqual(writeCalls(), []);
  assert.ok(calls.every((c) => c.model === 'customerIdentity' && c.method === 'findUnique'));
});

// ── authoritative reads ───────────────────────────────────────

test('real-shaped Staib row returns authoritative 1 / 8 Free Coffee', async () => {
  const res = await callRoute({ body: { deviceToken: TOKEN_A } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    loyalty: { businessName: 'Bäckerei Staib', stampCount: 1, requiredStamps: 8, rewardName: 'Free Coffee', member: true },
  });
});

test('enabled program + no LoyaltyCustomer row returns 0 / member:false (honest, not fabricated)', async () => {
  fixtures.identities.push({ id: 'ci_new', ownerUserId: PLATFORM, type: 'stadtpocket_device', value: `spd_${'e'.repeat(48)}`, customerId: 'cust_fresh' });
  try {
    const res = await callRoute({ body: { deviceToken: `spd_${'e'.repeat(48)}` } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      loyalty: { businessName: 'Bäckerei Staib', stampCount: 0, requiredStamps: 8, rewardName: 'Free Coffee', member: false },
    });
    assert.deepEqual(writeCalls(), [], 'must not create a membership row on read');
  } finally {
    fixtures.identities.pop();
  }
});

test('changing the business slug only reads the SAME customer\'s row for that business', async () => {
  const brettle = await callRoute({ listingSlug: 'brettle', body: { deviceToken: TOKEN_A } });
  assert.deepEqual(brettle.body.loyalty, { businessName: 'Brettle', stampCount: 3, requiredStamps: 10, rewardName: 'Brezel', member: true });
  const lookups = calls.filter((c) => c.model === 'loyaltyCustomer');
  assert.equal(lookups.length, 1);
  assert.deepEqual(lookups[0].args.where, { slug_customerId: { slug: 'brettle-lp', customerId: CUSTOMER_A } });

  // Customer B at Staib sees B's own 5, never A's 1 -- and vice versa.
  const b = await callRoute({ body: { deviceToken: TOKEN_B } });
  assert.equal(b.body.loyalty.stampCount, 5);
  const a = await callRoute({ body: { deviceToken: TOKEN_A } });
  assert.equal(a.body.loyalty.stampCount, 1);
});

test('no loyalty program configured returns loyalty: null without reading LoyaltyCustomer', async () => {
  const res = await callRoute({ listingSlug: 'no-loyalty', body: { deviceToken: TOKEN_A } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { loyalty: null });
  assert.ok(!calls.some((c) => c.model === 'loyaltyCustomer'));
});

test('disabled program returns loyalty: null', async () => {
  const res = await callRoute({ listingSlug: 'paused-loyalty', body: { deviceToken: TOKEN_A } });
  assert.deepEqual(res.body, { loyalty: null });
  assert.ok(!calls.some((c) => c.model === 'loyaltyCustomer'));
});

test('unpublished listing / unknown listing / non-city location return 404', async () => {
  for (const args of [
    { listingSlug: 'draft-biz' },
    { listingSlug: 'does-not-exist' },
    { citySlug: 'region' },
    { citySlug: 'nowhere' },
  ]) {
    const res = await callRoute({ ...args, body: { deviceToken: TOKEN_A } });
    assert.equal(res.statusCode, 404, JSON.stringify(args));
    assert.deepEqual(res.body, { error: 'Business not found.' });
  }
  assert.ok(!calls.some((c) => c.model === 'loyaltyCustomer'));
});

// ── rejection ─────────────────────────────────────────────────

test('malformed token is rejected 401 with a generic message', async () => {
  for (const body of [{}, { deviceToken: '' }, { deviceToken: 'nope' }, { deviceToken: 123 }, { deviceToken: SERIAL_A }]) {
    const res = await callRoute({ body });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Unknown pass.' });
  }
  assert.ok(!calls.some((c) => c.model === 'loyaltyCustomer'));
});

test('unknown (well-formed) token is rejected 401 with the SAME generic message', async () => {
  const res = await callRoute({ body: { deviceToken: TOKEN_UNKNOWN } });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unknown pass.' });
});

test('Pass serial is never accepted as a credential', async () => {
  const res = await callRoute({ body: { passSerialNumber: SERIAL_A } });
  assert.equal(res.statusCode, 401);
});

// ── no creation, no mutation ──────────────────────────────────

test('no Customer / CustomerIdentity / Pass is created and nothing is mutated, across every path', async () => {
  await callRoute({ body: { deviceToken: TOKEN_A } });
  await callRoute({ listingSlug: 'brettle', body: { deviceToken: TOKEN_A } });
  await callRoute({ listingSlug: 'no-loyalty', body: { deviceToken: TOKEN_A } });
  await callRoute({ listingSlug: 'draft-biz', body: { deviceToken: TOKEN_A } });
  await callRoute({ body: { deviceToken: TOKEN_UNKNOWN } });
  await callRoute({ body: { deviceToken: 'garbage' } });
  await callRoute({ body: {} });
  assert.deepEqual(writeCalls(), []);
  assert.ok(!calls.some((c) => ['customer', 'pass', 'stampEntry'].includes(c.model)), 'must never touch Customer/Pass/StampEntry');
  const loyaltyMethods = new Set(calls.filter((c) => c.model === 'loyaltyCustomer').map((c) => c.method));
  assert.deepEqual([...loyaltyMethods], ['findUnique']);
  const identityMethods = new Set(calls.filter((c) => c.model === 'customerIdentity').map((c) => c.method));
  assert.deepEqual([...identityMethods], ['findUnique']);
});

test('reading twice returns the same value (no side effects, no increment)', async () => {
  const first = await callRoute({ body: { deviceToken: TOKEN_A } });
  const second = await callRoute({ body: { deviceToken: TOKEN_A } });
  assert.deepEqual(first.body, second.body);
  assert.equal(fixtures.loyaltyCustomers[0].stampCount, 1);
});

// ── no leaks ──────────────────────────────────────────────────

test('responses never contain Customer.id, Pass id, serialNumber, deviceToken, or internal row ids', async () => {
  for (const args of [
    { body: { deviceToken: TOKEN_A } },
    { listingSlug: 'brettle', body: { deviceToken: TOKEN_A } },
    { listingSlug: 'no-loyalty', body: { deviceToken: TOKEN_A } },
    { body: { deviceToken: TOKEN_UNKNOWN } },
    { listingSlug: 'draft-biz', body: { deviceToken: TOKEN_A } },
  ]) {
    const res = await callRoute(args);
    assertNoSensitiveValues(res.body);
  }
  const res = await callRoute({ body: { deviceToken: TOKEN_A } });
  assert.deepEqual(Object.keys(res.body.loyalty).sort(), ['businessName', 'member', 'requiredStamps', 'rewardName', 'stampCount']);
});

test('unexpected error returns a generic 500 without leaking detail', async () => {
  const original = readers.loyaltyCustomer.findUnique;
  readers.loyaltyCustomer.findUnique = () => { throw new Error(`db exploded for ${CUSTOMER_A}`); };
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await callRoute({ body: { deviceToken: TOKEN_A } });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error.' });
  } finally {
    readers.loyaltyCustomer.findUnique = original;
    console.error = originalError;
  }
});

// ── credential transport ──────────────────────────────────────

test('token is only read from the POST body: a query-string token is ignored', async () => {
  const res = await callRoute({ body: {}, query: { deviceToken: TOKEN_A } });
  assert.equal(res.statusCode, 401);
});

test('route is registered as POST only, with no token in the path', async () => {
  const layer = passRoutes.stack.find((l) => l.route && l.route.path === '/cities/:citySlug/businesses/:listingSlug/loyalty/me');
  assert.ok(layer, 'route registered');
  assert.deepEqual(Object.keys(layer.route.methods), ['post']);
  assert.ok(!/token/i.test(layer.route.path));
  assert.ok(layer.route.stack.length >= 2, 'rate limiter precedes the handler');
});

test('service throws CustomerLoyaltyError (not a generic Error) for rejections', async () => {
  await assert.rejects(() => getCustomerLoyaltyForBusiness('ulm', 'baeckerei-staib', 'bad'), (err) => err instanceof CustomerLoyaltyError && err.status === 401);
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
