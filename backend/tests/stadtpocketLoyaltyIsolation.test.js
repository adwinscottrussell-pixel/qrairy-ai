// ============================================================
// stadtpocketLoyaltyIsolation.test.js — cross-business loyalty isolation.
//
// Regression for the staging bug of 2026-09-30: TopFit Ulm's storefront
// was linked (loyaltyLandingPageId) to Bäckerei Staib's loyalty program,
// so TopFit resolved Staib's goal, reward and the customer's Staib balance
// (3 / 8, Free Coffee). The fixtures below reproduce exactly that state:
// two DIFFERENT listings, one canonical customer (one StadtPocket Pass).
//
// Real services run against a recording in-memory Prisma mock:
// stadtpocketLoyaltyBridgeService (connect / eligible / setup / program
// config / disconnect), stadtpocketStampService (staff lookup + stamp),
// stadtpocketCustomerLoyaltyService (customer read) and
// stadtpocketPublicService (public business read).
//
// Run: node tests/stadtpocketLoyaltyIsolation.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');

const PLATFORM = 'stadtpocket_platform';
const SERIAL = `sp_${'0123456789abcdef'.repeat(3)}`;
const TOKEN = `spd_${'a'.repeat(48)}`;
const CUSTOMER = 'cust_internal_a';
const ADMIN = { userId: 'user_admin', isGlobalAdmin: true };
const ULM_MANAGER = { userId: 'user_mgr', isGlobalAdmin: false, locationIds: ['loc_ulm'] };
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);

let db;
let calls;
let seq;

function freshDb({ topfitLinkedToStaib = true } = {}) {
  seq = 0;
  return {
    locations: [{ id: 'loc_ulm', slug: 'ulm', type: 'city', status: 'active' }],
    listingLocations: [
      { id: 'll_staib', locationId: 'loc_ulm', listingId: 'lst_staib', publicationStatus: 'published', createdAt: new Date(1), businessLocationId: null, loyaltyLandingPageId: 'lp_staib', listing: { id: 'lst_staib', slug: 'baeckerei-staib', name: 'Bäckerei Staib' } },
      { id: 'll_topfit', locationId: 'loc_ulm', listingId: 'lst_topfit', publicationStatus: 'published', createdAt: new Date(2), businessLocationId: null, loyaltyLandingPageId: topfitLinkedToStaib ? 'lp_staib' : null, listing: { id: 'lst_topfit', slug: 'topfit-ulm', name: 'TopFit Ulm' } },
    ],
    landingPages: [
      { id: 'lp_staib', slug: 'staib-lp', userId: null, businessId: null, businessName: 'Bäckerei Staib', createdAt: new Date(1) },
      { id: 'lp_owner', slug: 'owner-lp', userId: 'user_qraivy_owner', businessId: null, businessName: 'QRAIVY Owner Café', createdAt: new Date(3) },
    ],
    stampSettings: [
      { slug: 'staib-lp', goal: 8, rewardName: 'Free Coffee', enabled: true },
      { slug: 'owner-lp', goal: 5, rewardName: 'Espresso', enabled: true },
    ],
    loyaltyCustomers: [
      { id: 'lc_1', slug: 'staib-lp', customerId: CUSTOMER, stampCount: 3, totalStamps: 3, rewardReady: false, rewardsEarned: 0, lastStampAt: TWO_HOURS_AGO, createdAt: new Date(1) },
    ],
    stampEntries: [
      { id: 'se_1', slug: 'staib-lp', passId: 'pass_1', source: 'stadtpocket_staff_stamp' },
      { id: 'se_2', slug: 'staib-lp', passId: 'pass_1', source: 'stadtpocket_staff_stamp' },
      { id: 'se_3', slug: 'staib-lp', passId: 'pass_1', source: 'stadtpocket_staff_stamp' },
    ],
    customerIdentities: [
      { id: 'ci_1', ownerUserId: PLATFORM, type: 'stadtpocket_device', value: TOKEN, customerId: CUSTOMER },
      { id: 'ci_2', ownerUserId: PLATFORM, type: 'stadtpocket_pass_serial', value: SERIAL, customerId: CUSTOMER },
    ],
    passes: [{ id: 'pass_1', serialNumber: SERIAL, slug: null }],
  };
}

const copy = (x) => (x === null || x === undefined ? x : JSON.parse(JSON.stringify(x)));
function linkMatch(ll, where) {
  const lp = where.loyaltyLandingPageId;
  if (lp && typeof lp === 'object' && lp.in) { if (!lp.in.includes(ll.loyaltyLandingPageId)) return false; }
  else if (lp !== undefined && ll.loyaltyLandingPageId !== lp) return false;
  const li = where.listingId;
  if (li && typeof li === 'object' && 'not' in li) { if (ll.listingId === li.not) return false; }
  else if (li !== undefined && ll.listingId !== li) return false;
  return true;
}
function inc(v, d) { return d && typeof d === 'object' && 'increment' in d ? v + d.increment : d; }

const impl = {
  location: { findUnique: ({ where }) => db.locations.find((l) => l.slug === where.slug || l.id === where.id) || null },
  stadtPocketListingLocation: {
    findUnique: ({ where }) => db.listingLocations.find((l) => l.id === where.id) || null,
    findFirst: ({ where }) => db.listingLocations.find((l) => linkMatch(l, where)) || null,
    findMany: ({ where }) => {
      if (where && where.listing) {
        return db.listingLocations
          .filter((l) => l.locationId === where.locationId && l.publicationStatus === where.publicationStatus && l.listing.slug === where.listing.slug)
          .map((l) => ({ ...l, loyaltyLandingPage: db.landingPages.find((p) => p.id === l.loyaltyLandingPageId) || null }));
      }
      return db.listingLocations.filter((l) => linkMatch(l, where || {}));
    },
    update: ({ where, data }) => { const r = db.listingLocations.find((l) => l.id === where.id); Object.assign(r, data); return r; },
  },
  landingPage: {
    findUnique: ({ where }) => db.landingPages.find((p) => (where.id ? p.id === where.id : p.slug === where.slug)) || null,
    findFirst: () => null,
    findMany: ({ where }) => db.landingPages.filter((p) => !where || !where.slug || p.slug.includes(where.slug.contains)).sort((a, b) => b.createdAt - a.createdAt),
    create: ({ data }) => { const r = { id: `lp_new_${++seq}`, businessId: null, userId: null, createdAt: new Date(), ...data }; db.landingPages.push(r); return r; },
  },
  stampSettings: {
    findUnique: ({ where }) => db.stampSettings.find((s) => s.slug === where.slug) || null,
    findMany: ({ where }) => db.stampSettings.filter((s) => where.slug.in.includes(s.slug) && (where.enabled === undefined || s.enabled === where.enabled)),
    upsert: ({ where, create, update }) => {
      const r = db.stampSettings.find((s) => s.slug === where.slug);
      if (r) { Object.assign(r, update); return r; }
      db.stampSettings.push({ ...create }); return create;
    },
    update: ({ where, data }) => { const r = db.stampSettings.find((s) => s.slug === where.slug); Object.assign(r, data); return r; },
  },
  loyaltyCustomer: {
    findUnique: ({ where }) => db.loyaltyCustomers.find((r) => r.slug === where.slug_customerId.slug && r.customerId === where.slug_customerId.customerId) || null,
    update: ({ where, data }) => {
      const r = db.loyaltyCustomers.find((x) => x.slug === where.slug_customerId.slug && x.customerId === where.slug_customerId.customerId);
      r.stampCount = inc(r.stampCount, data.stampCount); r.totalStamps = inc(r.totalStamps, data.totalStamps); r.lastStampAt = data.lastStampAt;
      return r;
    },
    create: ({ data }) => { const r = { id: `lc_new_${++seq}`, rewardReady: false, rewardsEarned: 0, createdAt: new Date(), ...data }; db.loyaltyCustomers.push(r); return r; },
  },
  stampEntry: { create: ({ data }) => { const r = { id: `se_new_${++seq}`, ...data }; db.stampEntries.push(r); return r; } },
  customerIdentity: {
    findUnique: ({ where }) => { const k = where.ownerUserId_type_value; return db.customerIdentities.find((r) => r.ownerUserId === k.ownerUserId && r.type === k.type && r.value === k.value) || null; },
    findFirst: ({ where }) => db.customerIdentities.find((r) => r.ownerUserId === where.ownerUserId && r.type === where.type && r.value === where.value) || null,
  },
  pass: { findUnique: ({ where }) => db.passes.find((p) => p.serialNumber === where.serialNumber) || null },
};

const mockPrisma = new Proxy({}, {
  get(_, model) {
    if (typeof model !== 'string') return undefined;
    if (model === '$transaction') return async (fn) => { calls.push({ model, method: '$transaction' }); return fn(mockPrisma); };
    return new Proxy({}, {
      get(__, method) {
        return async (args) => {
          calls.push({ model, method, args });
          const f = impl[model] && impl[model][method];
          if (f) return copy(f(args));
          return method === 'findMany' ? [] : null; // offers/updates etc. for the public read
        };
      },
    });
  },
});
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const bridge = require('../src/services/stadtpocketLoyaltyBridgeService');
const { applyStaffStamp, lookupPassForStamping } = require('../src/services/stadtpocketStampService');
const { getCustomerLoyaltyForBusiness } = require('../src/services/stadtpocketCustomerLoyaltyService');
const publicService = require('../src/services/stadtpocketPublicService');

const WRITE = /^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/;
const writes = () => calls.filter((c) => WRITE.test(c.method)).map((c) => `${c.model}.${c.method}`);
const staibRow = () => db.loyaltyCustomers.find((r) => r.slug === 'staib-lp' && r.customerId === CUSTOMER);
const staibSettings = () => db.stampSettings.find((s) => s.slug === 'staib-lp');
const topfit = () => db.listingLocations.find((l) => l.id === 'll_topfit');
async function expectStatus(fn, status) {
  try { await fn(); } catch (e) { assert.equal(e.status, status, e.message); return e; }
  throw new Error(`expected ${status}, got success`);
}
async function customer(slug) { return (await getCustomerLoyaltyForBusiness('ulm', slug, TOKEN)).loyalty; }

const tests = [];
function test(name, fn, opts) { tests.push({ name, fn: async () => { db = freshDb(opts); calls = []; await fn(); } }); }

// ── 1. the broken staging state is detected and cannot be edited ─

test('broken link (TopFit -> Staib program): both Stempelprogramm views report it as shared and read-only', async () => {
  const t = await bridge.getProgramConfig('loc_ulm', 'll_topfit', ADMIN);
  assert.equal(t.sharedWithOtherBusiness, true);
  assert.equal(t.editable, false);
  const s = await bridge.getProgramConfig('loc_ulm', 'll_staib', ADMIN);
  assert.equal(s.sharedWithOtherBusiness, true, 'Staib is warned too until the foreign link is removed');
});

test('broken link: saving settings on TopFit is refused (409) and cannot change Staib\'s program', async () => {
  await expectStatus(() => bridge.updateProgramConfig('loc_ulm', 'll_topfit', ADMIN, { enabled: true, requiredStamps: 6, rewardName: 'Gratis Kuchen' }), 409);
  assert.deepEqual(staibSettings(), { slug: 'staib-lp', goal: 8, rewardName: 'Free Coffee', enabled: true });
  assert.deepEqual(writes(), []);
});

test('broken link: running the setup wizard on TopFit is refused (409) instead of rewriting Staib\'s program', async () => {
  await expectStatus(() => bridge.createAndConnectProgram('loc_ulm', 'll_topfit', ADMIN, { goal: 6, rewardName: 'Gratis Kuchen' }), 409);
  assert.deepEqual(staibSettings(), { slug: 'staib-lp', goal: 8, rewardName: 'Free Coffee', enabled: true });
  assert.equal(writes().filter((w) => w.startsWith('stampSettings.')).length, 0);
});

// ── 2. the link can no longer be created ───────────────────────

test('prevention: Global Admin is no longer offered another business\'s program as "found"', async () => {
  const programs = await bridge.listEligiblePrograms('loc_ulm', 'll_topfit', ADMIN, {});
  assert.ok(!programs.some((p) => p.landingPageId === 'lp_staib'), 'Staib program must not be offered to TopFit');
  assert.ok(programs.some((p) => p.landingPageId === 'lp_owner'), 'a legitimate unlinked QRAIVY owner program is still offered');
}, { topfitLinkedToStaib: false });

test('prevention: connecting TopFit to Staib\'s program is refused for everyone, Global Admin included', async () => {
  for (const scope of [ADMIN, ULM_MANAGER]) {
    const err = await expectStatus(() => bridge.connectProgram('loc_ulm', 'll_topfit', scope, 'lp_staib'), scope.isGlobalAdmin ? 409 : 403);
    assert.ok(err);
  }
  assert.equal(topfit().loyaltyLandingPageId, null);
}, { topfitLinkedToStaib: false });

test('prevention: a QRAIVY owner program already linked to Staib cannot also be linked to TopFit', async () => {
  db.listingLocations.find((l) => l.id === 'll_staib').loyaltyLandingPageId = 'lp_owner';
  await expectStatus(() => bridge.connectProgram('loc_ulm', 'll_topfit', ADMIN, 'lp_owner'), 409);
  assert.equal(topfit().loyaltyLandingPageId, null);
}, { topfitLinkedToStaib: false });

test('multi-location stays possible: a second storefront of the SAME listing may share its program', async () => {
  db.listingLocations.push({ id: 'll_staib_2', locationId: 'loc_ulm', listingId: 'lst_staib', publicationStatus: 'published', createdAt: new Date(5), businessLocationId: null, loyaltyLandingPageId: null, listing: { id: 'lst_staib', slug: 'baeckerei-staib', name: 'Bäckerei Staib' } });
  await bridge.connectProgram('loc_ulm', 'll_staib_2', ADMIN, 'lp_staib');
  assert.equal(db.listingLocations.find((l) => l.id === 'll_staib_2').loyaltyLandingPageId, 'lp_staib');
  const cfg = await bridge.getProgramConfig('loc_ulm', 'll_staib_2', ADMIN);
  assert.equal(cfg.sharedWithOtherBusiness, false);
  assert.equal(cfg.editable, true);
}, { topfitLinkedToStaib: false });

// ── 3. repair = disconnect TopFit only ─────────────────────────

test('repair: disconnecting TopFit clears ONLY TopFit\'s link; Staib program, balance and stamps untouched', async () => {
  await bridge.disconnectProgram('loc_ulm', 'll_topfit', ADMIN);
  assert.equal(topfit().loyaltyLandingPageId, null);
  assert.equal(db.listingLocations.find((l) => l.id === 'll_staib').loyaltyLandingPageId, 'lp_staib');
  assert.deepEqual(writes(), ['stadtPocketListingLocation.update']);
  assert.equal(calls.find((c) => c.method === 'update').args.where.id, 'll_topfit');
  assert.equal(staibRow().stampCount, 3);
  assert.equal(db.stampEntries.length, 3);
  assert.deepEqual(staibSettings(), { slug: 'staib-lp', goal: 8, rewardName: 'Free Coffee', enabled: true });
  const s = await bridge.getProgramConfig('loc_ulm', 'll_staib', ADMIN);
  assert.equal(s.sharedWithOtherBusiness, false);
  assert.equal(s.editable, true);
});

// ── 4. reads after repair: Staib 3/8 Free Coffee, TopFit nothing of Staib ─

test('customer read: same canonical customer -> Staib 3 / 8 Free Coffee, TopFit no program', async () => {
  assert.deepEqual(await customer('baeckerei-staib'), { businessName: 'Bäckerei Staib', stampCount: 3, requiredStamps: 8, rewardName: 'Free Coffee', member: true });
  assert.equal(await customer('topfit-ulm'), null);
}, { topfitLinkedToStaib: false });

test('public business read: TopFit carries no loyalty at all; Staib keeps 8 / Free Coffee', async () => {
  const t = await publicService.getCityBusiness('ulm', 'topfit-ulm');
  assert.ok(t.locations.every((l) => !l.loyalty));
  const s = await publicService.getCityBusiness('ulm', 'baeckerei-staib');
  assert.deepEqual(s.locations[0].loyalty, { enabled: true, requiredStamps: 8, rewardTitle: 'Free Coffee' });
}, { topfitLinkedToStaib: false });

test('staff lookup: TopFit refuses (no active program) instead of showing Staib\'s 3 / 8', async () => {
  await expectStatus(() => lookupPassForStamping('loc_ulm', 'll_topfit', ADMIN, SERIAL), 400);
  const s = await lookupPassForStamping('loc_ulm', 'll_staib', ADMIN, SERIAL);
  assert.equal(s.stampCount, 3);
  assert.equal(s.rewardName, 'Free Coffee');
}, { topfitLinkedToStaib: false });

// ── 5. with TopFit's own program: stamps and settings never cross ─

test('TopFit sets up its OWN program: a new program is created; Staib\'s settings unchanged', async () => {
  const created = await bridge.createAndConnectProgram('loc_ulm', 'll_topfit', ADMIN, { goal: 6, rewardName: 'Gratis Kuchen' });
  assert.notEqual(created.landingPageId, 'lp_staib');
  assert.notEqual(topfit().loyaltyLandingPageId, 'lp_staib');
  assert.deepEqual(staibSettings(), { slug: 'staib-lp', goal: 8, rewardName: 'Free Coffee', enabled: true });
  assert.deepEqual(await customer('topfit-ulm'), { businessName: 'TopFit Ulm', stampCount: 0, requiredStamps: 6, rewardName: 'Gratis Kuchen', member: false });
  assert.deepEqual(await customer('baeckerei-staib'), { businessName: 'Bäckerei Staib', stampCount: 3, requiredStamps: 8, rewardName: 'Free Coffee', member: true });
}, { topfitLinkedToStaib: false });

test('stamping Business A changes only A; stamping B changes only B (same customer, same Pass)', async () => {
  await bridge.createAndConnectProgram('loc_ulm', 'll_topfit', ADMIN, { goal: 6, rewardName: 'Gratis Kuchen' });
  const a = await applyStaffStamp('loc_ulm', 'll_staib', ADMIN, SERIAL);
  assert.equal(a.stampCount, 4);
  assert.equal((await customer('topfit-ulm')).stampCount, 0, 'TopFit unchanged by a Staib stamp');
  const b = await applyStaffStamp('loc_ulm', 'll_topfit', ADMIN, SERIAL);
  assert.equal(b.stampCount, 1);
  assert.equal((await customer('baeckerei-staib')).stampCount, 4, 'Staib unchanged by a TopFit stamp');
  assert.equal((await customer('topfit-ulm')).stampCount, 1);
  // each business's staff lookup shows only its own balance, goal and reward
  const ls = await lookupPassForStamping('loc_ulm', 'll_staib', ADMIN, SERIAL);
  const lt = await lookupPassForStamping('loc_ulm', 'll_topfit', ADMIN, SERIAL);
  assert.deepEqual([ls.stampCount, ls.requiredStamps, ls.rewardName], [4, 8, 'Free Coffee']);
  assert.deepEqual([lt.stampCount, lt.requiredStamps, lt.rewardName], [1, 6, 'Gratis Kuchen']);
}, { topfitLinkedToStaib: false });

test('editing Business A\'s goal/reward never leaks into Business B', async () => {
  await bridge.createAndConnectProgram('loc_ulm', 'll_topfit', ADMIN, { goal: 6, rewardName: 'Gratis Kuchen' });
  await bridge.updateProgramConfig('loc_ulm', 'll_staib', ADMIN, { enabled: true, requiredStamps: 10, rewardName: 'Gratis Brot' });
  assert.deepEqual([(await customer('baeckerei-staib')).requiredStamps, (await customer('baeckerei-staib')).rewardName], [10, 'Gratis Brot']);
  assert.deepEqual([(await customer('topfit-ulm')).requiredStamps, (await customer('topfit-ulm')).rewardName], [6, 'Gratis Kuchen']);
  assert.equal((await customer('baeckerei-staib')).stampCount, 3, 'Staib balance untouched by a settings edit');
}, { topfitLinkedToStaib: false });

test('one canonical customer / one Pass: balances are separate rows for the SAME customerId; no Customer or Pass created', async () => {
  await bridge.createAndConnectProgram('loc_ulm', 'll_topfit', ADMIN, { goal: 6, rewardName: 'Gratis Kuchen' });
  await applyStaffStamp('loc_ulm', 'll_topfit', ADMIN, SERIAL);
  const rows = db.loyaltyCustomers.filter((r) => r.customerId === CUSTOMER);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((r) => r.slug)).size, 2);
  assert.ok(!calls.some((c) => (c.model === 'customer' || c.model === 'pass' || c.model === 'customerIdentity') && WRITE.test(c.method)));
}, { topfitLinkedToStaib: false });

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
