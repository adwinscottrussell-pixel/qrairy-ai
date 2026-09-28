// ============================================================
// stadtpocketLoyaltyProgram.test.js — Stempelprogramm: manager-scoped
// read/write of a storefront's EXISTING loyalty program configuration
// (StampSettings: enabled / goal / rewardName) via
// GET/PUT /manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty/program.
//
// Mocked Prisma (Proxy that records EVERY call), no framework -- same
// convention as stadtpocketCustomerLoyalty.test.js. The real services run
// against the fixtures: stadtpocketLoyaltyBridgeService (new
// getProgramConfig/updateProgramConfig), the existing staff lookup
// (stadtpocketStampService.lookupPassForStamping) and the existing
// customer read (stadtpocketCustomerLoyaltyService), so "the customer's
// balance stays 2 and now displays 2 / 10 Gratis Brot" is proven end to
// end at the service layer.
//
// Run: node tests/stadtpocketLoyaltyProgram.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');

const PLATFORM = 'stadtpocket_platform';
const SERIAL = `sp_${'0123456789abcdef'.repeat(3)}`;
const TOKEN = `spd_${'a'.repeat(48)}`;
const CUSTOMER = 'cust_internal_a';

const ULM_MANAGER = { userId: 'user_mgr_ulm', isGlobalAdmin: false, locationIds: ['loc_ulm'] };
const STUTTGART_MANAGER = { userId: 'user_mgr_stg', isGlobalAdmin: false, locationIds: ['loc_stuttgart'] };
const GLOBAL_ADMIN = { userId: 'user_admin', isGlobalAdmin: true };

let db;
let calls;

function freshDb() {
  return {
    locations: [
      { id: 'loc_ulm', slug: 'ulm', type: 'city' },
      { id: 'loc_stuttgart', slug: 'stuttgart', type: 'city' },
    ],
    listingLocations: [
      { id: 'll_staib', locationId: 'loc_ulm', publicationStatus: 'published', createdAt: new Date(1), loyaltyLandingPageId: 'lp_staib', listing: { id: 'lst_staib', slug: 'baeckerei-staib', name: 'Bäckerei Staib' } },
      { id: 'll_owner', locationId: 'loc_ulm', publicationStatus: 'published', createdAt: new Date(2), loyaltyLandingPageId: 'lp_owner', listing: { id: 'lst_owner', slug: 'owner-cafe', name: 'Owner Café' } },
      { id: 'll_none', locationId: 'loc_ulm', publicationStatus: 'published', createdAt: new Date(3), loyaltyLandingPageId: null, listing: { id: 'lst_none', slug: 'ohne-programm', name: 'Ohne Programm' } },
      { id: 'll_stg', locationId: 'loc_stuttgart', publicationStatus: 'published', createdAt: new Date(4), loyaltyLandingPageId: 'lp_stg', listing: { id: 'lst_stg', slug: 'stg-shop', name: 'Stuttgart Shop' } },
    ],
    landingPages: [
      { id: 'lp_staib', slug: 'staib-lp', userId: null, businessName: 'Bäckerei Staib' },
      { id: 'lp_owner', slug: 'owner-lp', userId: 'user_qraivy_owner', businessName: 'Owner Café' },
      { id: 'lp_stg', slug: 'stg-lp', userId: null, businessName: 'Stuttgart Shop' },
    ],
    stampSettings: [
      { id: 'ss_staib', slug: 'staib-lp', goal: 8, rewardName: 'Free Coffee', enabled: true, color: '#ff5a1f' },
      { id: 'ss_owner', slug: 'owner-lp', goal: 5, rewardName: 'Espresso', enabled: true, color: '#ff5a1f' },
      { id: 'ss_stg', slug: 'stg-lp', goal: 6, rewardName: 'Gratis Kuchen', enabled: true, color: '#ff5a1f' },
    ],
    loyaltyCustomers: [
      { id: 'lc_1', slug: 'staib-lp', customerId: CUSTOMER, stampCount: 2, totalStamps: 2, rewardReady: false, rewardsEarned: 0, lastStampAt: new Date('2026-09-27T17:30:00Z') },
    ],
    customerIdentities: [
      { id: 'ci_1', ownerUserId: PLATFORM, type: 'stadtpocket_device', value: TOKEN, customerId: CUSTOMER },
      { id: 'ci_2', ownerUserId: PLATFORM, type: 'stadtpocket_pass_serial', value: SERIAL, customerId: CUSTOMER },
    ],
    passes: [{ id: 'pass_1', serialNumber: SERIAL, slug: null }],
  };
}

function copy(x) { return x === null || x === undefined ? x : JSON.parse(JSON.stringify(x)); }

const readers = {
  location: { findUnique: ({ where }) => db.locations.find((l) => l.slug === where.slug) || null },
  stadtPocketListingLocation: {
    findUnique: ({ where }) => db.listingLocations.find((l) => l.id === where.id) || null,
    findMany: ({ where }) => db.listingLocations
      .filter((ll) => ll.locationId === where.locationId && ll.publicationStatus === where.publicationStatus && ll.listing.slug === where.listing.slug)
      .map((ll) => ({ ...ll, loyaltyLandingPage: db.landingPages.find((lp) => lp.id === ll.loyaltyLandingPageId) || null })),
  },
  landingPage: { findUnique: ({ where }) => db.landingPages.find((lp) => (where.id ? lp.id === where.id : lp.slug === where.slug)) || null },
  stampSettings: {
    findUnique: ({ where }) => db.stampSettings.find((s) => s.slug === where.slug) || null,
    findMany: ({ where }) => db.stampSettings.filter((s) => where.slug.in.includes(s.slug) && s.enabled === where.enabled),
    update: ({ where, data }) => {
      const row = db.stampSettings.find((s) => s.slug === where.slug);
      if (!row) { const e = new Error('not found'); e.code = 'P2025'; throw e; }
      Object.assign(row, data);
      return row;
    },
  },
  loyaltyCustomer: {
    findUnique: ({ where }) => db.loyaltyCustomers.find((r) => r.slug === where.slug_customerId.slug && r.customerId === where.slug_customerId.customerId) || null,
  },
  customerIdentity: {
    findUnique: ({ where }) => {
      const k = where.ownerUserId_type_value;
      return db.customerIdentities.find((r) => r.ownerUserId === k.ownerUserId && r.type === k.type && r.value === k.value) || null;
    },
    findFirst: ({ where }) => db.customerIdentities.find((r) => r.ownerUserId === where.ownerUserId && r.type === where.type && r.value === where.value) || null,
  },
  pass: { findUnique: ({ where }) => db.passes.find((p) => p.serialNumber === where.serialNumber) || null },
};

const mockPrisma = new Proxy({}, {
  get(_, model) {
    if (typeof model !== 'string') return undefined;
    if (model.startsWith('$')) return (...a) => { calls.push({ model, method: model, args: a }); return Promise.resolve(null); };
    return new Proxy({}, {
      get(__, method) {
        return async (args) => {
          calls.push({ model, method, args });
          const impl = readers[model] && readers[model][method];
          if (!impl) return null;
          return copy(impl(args));
        };
      },
    });
  },
});
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const bridge = require('../src/services/stadtpocketLoyaltyBridgeService');
const routes = require('../src/routes/managerStadtpocketListingRoutes');
const { requireStadtpocketWriteScope } = require('../src/middleware/stadtpocketManagerAuth');
const { lookupPassForStamping } = require('../src/services/stadtpocketStampService');
const { getCustomerLoyaltyForBusiness } = require('../src/services/stadtpocketCustomerLoyaltyService');

const WRITE = /^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/;
const writes = () => calls.filter((c) => WRITE.test(c.method));

function fakeRes() {
  return { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
async function get(scope, listingLocationId = 'll_staib', locationId = 'loc_ulm') {
  const res = fakeRes();
  await routes.handleGetProgramConfig({ params: { locationId, listingLocationId }, stadtpocketScope: scope }, res);
  return res;
}
async function put(scope, body, listingLocationId = 'll_staib', locationId = 'loc_ulm') {
  const res = fakeRes();
  await routes.handleUpdateProgramConfig({ params: { locationId, listingLocationId }, stadtpocketScope: scope, body }, res);
  return res;
}
const staibRow = () => db.stampSettings.find((s) => s.slug === 'staib-lp');
const customerRow = () => db.loyaltyCustomers.find((r) => r.customerId === CUSTOMER);

const tests = [];
function test(name, fn) { tests.push({ name, fn: async () => { db = freshDb(); calls = []; await fn(); } }); }

// ── read ──────────────────────────────────────────────────────

test('1. authorized manager reads the authoritative program (no internal ids in the response)', async () => {
  const res = await get(ULM_MANAGER);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    configured: true,
    editable: true,
    program: { enabled: true, requiredStamps: 8, rewardName: 'Free Coffee', businessName: 'Bäckerei Staib' },
  });
  const json = JSON.stringify(res.body);
  for (const leak of ['staib-lp', 'lp_staib', 'ss_staib', 'll_staib', 'user_', CUSTOMER]) assert.ok(!json.includes(leak), leak);
  assert.deepEqual(writes(), []);
});

test('read shows a DISABLED program (enabled:false) instead of hiding it', async () => {
  staibRow().enabled = false;
  const res = await get(ULM_MANAGER);
  assert.equal(res.body.configured, true);
  assert.equal(res.body.program.enabled, false);
});

test('read: storefront without a program -> configured:false; QRAIVY owner program -> editable:false', async () => {
  assert.deepEqual((await get(ULM_MANAGER, 'll_none')).body, { configured: false });
  const owner = await get(ULM_MANAGER, 'll_owner');
  assert.equal(owner.body.configured, true);
  assert.equal(owner.body.editable, false);
});

// ── write ─────────────────────────────────────────────────────

test('2+3. authorized manager updates requiredStamps and rewardName (8 / Free Coffee -> 10 / Gratis Brot)', async () => {
  const res = await put(ULM_MANAGER, { enabled: true, requiredStamps: 10, rewardName: '  Gratis Brot  ' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.program, { enabled: true, requiredStamps: 10, rewardName: 'Gratis Brot', businessName: 'Bäckerei Staib' });
  assert.equal(staibRow().goal, 10);
  assert.equal(staibRow().rewardName, 'Gratis Brot');
  const w = writes();
  assert.equal(w.length, 1);
  assert.equal(`${w[0].model}.${w[0].method}`, 'stampSettings.update');
  assert.deepEqual(w[0].args.where, { slug: 'staib-lp' });
  assert.deepEqual(w[0].args.data, { goal: 10, rewardName: 'Gratis Brot', enabled: true });
});

test('4. authorized manager disables and re-enables the program', async () => {
  let res = await put(ULM_MANAGER, { enabled: false, requiredStamps: 8, rewardName: 'Free Coffee' });
  assert.equal(res.body.program.enabled, false);
  assert.equal(staibRow().enabled, false);
  res = await put(ULM_MANAGER, { enabled: true, requiredStamps: 8, rewardName: 'Free Coffee' });
  assert.equal(res.body.program.enabled, true);
  assert.equal(staibRow().enabled, true);
});

test('the target program is derived server-side: injected slug/landingPageId/ids in the body are ignored', async () => {
  await put(ULM_MANAGER, { enabled: true, requiredStamps: 9, rewardName: 'X', slug: 'owner-lp', landingPageId: 'lp_owner', id: 'ss_owner' });
  assert.equal(db.stampSettings.find((s) => s.slug === 'owner-lp').goal, 5, 'other program untouched');
  assert.equal(staibRow().goal, 9);
});

test('validation: bad requiredStamps / rewardName / enabled -> 400 and nothing written', async () => {
  const bad = [
    { enabled: true, requiredStamps: 1, rewardName: 'A' },
    { enabled: true, requiredStamps: 51, rewardName: 'A' },
    { enabled: true, requiredStamps: 2.5, rewardName: 'A' },
    { enabled: true, requiredStamps: '8', rewardName: 'A' },
    { enabled: true, rewardName: 'A' },
    { enabled: true, requiredStamps: 8, rewardName: '' },
    { enabled: true, requiredStamps: 8, rewardName: '   ' },
    { enabled: true, requiredStamps: 8, rewardName: 'x'.repeat(81) },
    { enabled: 'true', requiredStamps: 8, rewardName: 'A' },
    { requiredStamps: 8, rewardName: 'A' },
  ];
  for (const body of bad) {
    const res = await put(ULM_MANAGER, body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.deepEqual(writes(), []);
  assert.equal(staibRow().goal, 8);
});

test('no program connected -> 404, nothing created; QRAIVY owner program -> 403, not written', async () => {
  const none = await put(ULM_MANAGER, { enabled: true, requiredStamps: 8, rewardName: 'A' }, 'll_none');
  assert.equal(none.statusCode, 404);
  const owner = await put(ULM_MANAGER, { enabled: true, requiredStamps: 8, rewardName: 'A' }, 'll_owner');
  assert.equal(owner.statusCode, 403);
  assert.deepEqual(writes(), []);
  assert.equal(db.stampSettings.length, 3);
});

// ── authorization ─────────────────────────────────────────────

test('5. a manager of another city can neither read nor write this business\'s program', async () => {
  assert.equal((await get(STUTTGART_MANAGER)).statusCode, 403);
  assert.equal((await put(STUTTGART_MANAGER, { enabled: false, requiredStamps: 2, rewardName: 'Hack' })).statusCode, 403);
  // a real storefront id paired with a city it does not belong to
  assert.equal((await get(ULM_MANAGER, 'll_stg', 'loc_ulm')).statusCode, 404);
  assert.equal((await put(ULM_MANAGER, { enabled: false, requiredStamps: 2, rewardName: 'Hack' }, 'll_stg', 'loc_ulm')).statusCode, 404);
  assert.deepEqual(writes(), []);
  assert.equal(staibRow().goal, 8);
});

test('Global Admin may read and write (same grain as every other StadtPocket manager route)', async () => {
  assert.equal((await get(GLOBAL_ADMIN)).statusCode, 200);
  assert.equal((await put(GLOBAL_ADMIN, { enabled: true, requiredStamps: 8, rewardName: 'Free Coffee' })).statusCode, 200);
});

test('6. anonymous caller is rejected before any handler (routes run requireStadtpocketWriteScope first)', async () => {
  for (const method of ['get', 'put']) {
    const layer = routes.stack.find((l) => l.route && l.route.path === '/listings/:locationId/:listingLocationId/loyalty/program' && l.route.methods[method]);
    assert.ok(layer, `${method} registered`);
    assert.equal(layer.route.stack[0].handle, requireStadtpocketWriteScope);
  }
  const res = fakeRes();
  let next = false;
  await requireStadtpocketWriteScope({ headers: {} }, res, () => { next = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(next, false);
  assert.deepEqual(calls, []);
});

// ── customer balances untouched + authoritative reads reflect the change ─

test('7. settings updates never read or write LoyaltyCustomer / StampEntry: the customer stays at 2 stamps', async () => {
  await put(ULM_MANAGER, { enabled: true, requiredStamps: 10, rewardName: 'Gratis Brot' });
  await put(ULM_MANAGER, { enabled: false, requiredStamps: 10, rewardName: 'Gratis Brot' });
  await put(ULM_MANAGER, { enabled: true, requiredStamps: 3, rewardName: 'Gratis Brot' }); // below... then back
  await put(ULM_MANAGER, { enabled: true, requiredStamps: 10, rewardName: 'Gratis Brot' });
  const touched = new Set(calls.map((c) => c.model));
  for (const m of ['loyaltyCustomer', 'stampEntry', 'pass', 'customer', 'customerIdentity']) assert.equal(touched.has(m), false, m);
  assert.deepEqual([...new Set(writes().map((c) => `${c.model}.${c.method}`))], ['stampSettings.update']);
  assert.equal(customerRow().stampCount, 2);
  assert.equal(customerRow().totalStamps, 2);
});

test('11. after 8/Free Coffee -> 10/Gratis Brot, the customer read AND the staff lookup show 2 / 10 Gratis Brot', async () => {
  await put(ULM_MANAGER, { enabled: true, requiredStamps: 10, rewardName: 'Gratis Brot' });
  const customer = await getCustomerLoyaltyForBusiness('ulm', 'baeckerei-staib', TOKEN);
  assert.deepEqual(customer.loyalty, { businessName: 'Bäckerei Staib', stampCount: 2, requiredStamps: 10, rewardName: 'Gratis Brot', member: true });
  const staff = await lookupPassForStamping('loc_ulm', 'll_staib', ULM_MANAGER, SERIAL);
  assert.deepEqual(staff, { found: true, businessName: 'Bäckerei Staib', stampCount: 2, requiredStamps: 10, rewardName: 'Gratis Brot' });
});

test('while disabled: staff lookup is refused and the customer sees no Stempelkarte; re-enabling restores 2 / N', async () => {
  await put(ULM_MANAGER, { enabled: false, requiredStamps: 8, rewardName: 'Free Coffee' });
  await assert.rejects(() => lookupPassForStamping('loc_ulm', 'll_staib', ULM_MANAGER, SERIAL), (e) => e.status === 400);
  assert.deepEqual(await getCustomerLoyaltyForBusiness('ulm', 'baeckerei-staib', TOKEN), { loyalty: null });
  await put(ULM_MANAGER, { enabled: true, requiredStamps: 8, rewardName: 'Free Coffee' });
  const again = await getCustomerLoyaltyForBusiness('ulm', 'baeckerei-staib', TOKEN);
  assert.equal(again.loyalty.stampCount, 2);
  assert.equal(again.loyalty.requiredStamps, 8);
});

test('getBridgeState (used by stamping/lookup) is unchanged: disabled still reads as not connected', async () => {
  staibRow().enabled = false;
  assert.deepEqual(await bridge.getBridgeState('loc_ulm', 'll_staib', ULM_MANAGER), { connected: false });
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
