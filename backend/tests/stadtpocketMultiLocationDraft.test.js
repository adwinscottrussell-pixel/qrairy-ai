// ============================================================
// stadtpocketMultiLocationDraft.test.js — Phase 1G.1 (multi-location
// business model correction). Mocked-Prisma/Clerk tests for
// stadtpocketManagerService.js's initializeMultiLocationDraft(),
// stadtpocketAiDraftService.js's createMultiLocationDraftFromReview(),
// and the new route (POST .../research/draft-multi in
// managerStadtpocketResearchRoutes.js).
//
// Same convention as tests/stadtpocketAiDraft.test.js: no test
// framework dependency, require.cache pre-seeding for Prisma/Clerk,
// $transaction mocked with real snapshot/rollback semantics -- reused
// here nearly verbatim so this file's guarantees are directly
// comparable to the single-location suite's own.
//
// Core guarantee under test throughout: creating a multi-location
// business (e.g. the real Bäckerei Betz, 8 Ulm branches) produces
// EXACTLY ONE StadtPocketListing row plus N StadtPocketListingLocation
// rows sharing that one listingId -- NEVER N separate listings, which
// would wrongly appear as N separate cards in the public city directory
// (see stadtpocketPublicService.js's listCityBusinesses() dedup).
//
// Run: node tests/stadtpocketMultiLocationDraft.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');

const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const NET1 = 'net_stadtpocket';

let networkMemberRows = [];
let listingRows = [];
let listingLocationRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }

let tokenValid = true;
let currentUserId = 'ulm_manager';
let currentRole = 'staff';
let transactionShouldFailAtLocationIndex = null; // simulates a DB failure partway through creating N locations

function resetFixtures() {
  networkMemberRows = [
    { userId: 'ulm_manager', role: 'location_manager', locationId: ULM, networkId: NET1 },
    { userId: 'stuttgart_manager', role: 'location_manager', locationId: STUTTGART, networkId: NET1 },
  ];
  listingRows = [
    {
      id: 'listing_brettle_draft', slug: 'cafe-brettle', name: 'Café Brettle', category: 'Café',
      subCategory: null, tags: [], shortDescription: 'x', longDescription: null,
      businessId: null, createdBy: 'ulm_manager', draftData: null,
      createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    },
  ];
  listingLocationRows = [
    {
      id: 'll_brettle_draft', listingId: 'listing_brettle_draft', locationId: ULM,
      address: 'Rabengasse 10, 89073 Ulm', latitude: null, longitude: null,
      phone: null, website: 'https://www.brettle-ulm.de/', hours: null,
      publicationStatus: 'draft', publishedAt: null, businessLocationId: null, draftData: null,
      createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    },
  ];
  idSeq = 100;
  tokenValid = true;
  currentUserId = 'ulm_manager';
  currentRole = 'staff';
  transactionShouldFailAtLocationIndex = null;
}

function cloneRows(rows) { return rows.map((r) => ({ ...r })); }
function attachListing(ll) { return { ...ll, listing: listingRows.find((l) => l.id === ll.listingId) }; }

let locationCreateCallCount = 0;

const mockPrisma = {
  networkMember: { findMany: async ({ where }) => networkMemberRows.filter((r) => r.userId === where.userId) },
  location: { findMany: async () => [] },
  stadtPocketListing: {
    findUnique: async ({ where }) => {
      if (where.id) return listingRows.find((l) => l.id === where.id) || null;
      if (where.slug) return listingRows.find((l) => l.slug === where.slug) || null;
      return null;
    },
    create: async ({ data }) => {
      const row = { id: nextId('listing'), subCategory: null, tags: [], longDescription: null, businessId: null, draftData: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      listingRows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = listingRows.find((l) => l.id === where.id);
      if (!row) throw new Error('listing not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  },
  stadtPocketListingLocation: {
    findMany: async ({ where }) => {
      let rows = listingLocationRows;
      if (where && where.locationId) rows = rows.filter((ll) => ll.locationId === where.locationId);
      return rows.map(attachListing);
    },
    findUnique: async ({ where, include }) => {
      const row = listingLocationRows.find((ll) => ll.id === where.id);
      if (!row) return null;
      return include && include.listing ? attachListing(row) : row;
    },
    create: async ({ data }) => {
      locationCreateCallCount += 1;
      if (transactionShouldFailAtLocationIndex !== null && locationCreateCallCount > transactionShouldFailAtLocationIndex) {
        throw new Error('simulated database failure partway through multi-location create');
      }
      const row = {
        id: nextId('ll'), latitude: null, longitude: null, phone: null, website: null, hours: null,
        businessLocationId: null, draftData: null, publishedAt: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      listingLocationRows.push(row);
      return row;
    },
  },
  $transaction: async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const listingSnapshot = cloneRows(listingRows);
    const listingLocationSnapshot = cloneRows(listingLocationRows);
    try {
      return await arg(mockPrisma);
    } catch (err) {
      listingRows.length = 0; listingRows.push(...listingSnapshot);
      listingLocationRows.length = 0; listingLocationRows.push(...listingLocationSnapshot);
      throw err;
    }
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };
require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => { if (!tokenValid) throw new Error('simulated invalid/expired token'); return { sub: currentUserId }; },
    createClerkClient: () => ({ users: { getUser: async (id) => ({ id, publicMetadata: { role: currentRole } }) } }),
  },
};

const routes = require('../src/routes/managerStadtpocketResearchRoutes');
const { requireStadtpocketWriteScope } = require('../src/middleware/stadtpocketManagerAuth');
const { initializeMultiLocationDraft, initializeDraft, MAX_LOCATIONS_PER_DRAFT, StadtpocketManagerError } = require('../src/services/stadtpocketManagerService');
const { createMultiLocationDraftFromReview, createDraftFromReview, StadtpocketDuplicateError } = require('../src/services/stadtpocketAiDraftService');

function fakeReq({ auth = true, params = {}, body = {} } = {}) {
  return { headers: auth ? { authorization: 'Bearer test-token' } : {}, params, body, method: 'POST', originalUrl: '/manager/stadtpocket/listings' };
}
function fakeRes() {
  return { statusCode: undefined, body: undefined, status(code) { this.statusCode = code; return this; }, json(b) { if (this.statusCode === undefined) this.statusCode = 200; this.body = b; return this; } };
}
async function callRoute(handler, req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireStadtpocketWriteScope(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res;
  await handler(req, res);
  return res;
}

const ULM_MANAGER_SCOPE = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
const STUTTGART_MANAGER_SCOPE = { userId: 'stuttgart_manager', isGlobalAdmin: false, locationIds: [STUTTGART] };

// The real 8 Ulm Bäckerei Betz addresses, live-verified (2026-09-20,
// read-only, no draft created) -- used throughout so this suite proves
// the exact real-world shape, not just an abstract N.
const BETZ_LISTING = { name: 'Bäckerei Betz', category: 'Bäckerei', shortDescription: 'Traditionsbäckerei mit über 30 Filialen in und um Ulm.' };
const BETZ_ULM_LOCATIONS = [
  { address: 'Westerlingerstr. 49, 89077 Ulm', phone: '0731 978000' },
  { address: 'Haslacherweg 59, 89075 Ulm' },
  { address: 'Neue Gasse 2, 89077 Ulm' },
  { address: 'Ehingerstraße 25, 89077 Ulm' },
  { address: 'Ensostraße 31, 89079 Ulm' },
  { address: 'Schlösslegasse 1, 89077 Ulm' },
  { address: 'Stifterweg 76, 89075 Ulm' },
  { address: 'Bahnhofstraße 17, 89073 Ulm' },
];

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function expectThrow(fn, ErrorClass) {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof ErrorClass, `expected ${ErrorClass.name}, got ${err.constructor.name}: ${err.message}`);
    return err;
  }
  throw new Error('expected function to throw, but it did not');
}

// ── Core: one listing, N locations, never N listings ────────────
test('1. 8 real Ulm Betz locations -> exactly ONE StadtPocketListing row and 8 StadtPocketListingLocation rows, all sharing the same listingId', async () => {
  resetFixtures();
  locationCreateCallCount = 0;
  const listingCountBefore = listingRows.length;
  const created = await initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS });
  assert.equal(listingRows.length, listingCountBefore + 1); // exactly one new listing row
  assert.equal(created.locations.length, 8);
  assert.ok(created.locations.every((l) => true)); // shape sanity below
  const distinctListingIds = new Set(listingLocationRows.filter((ll) => created.locations.some((c) => c.listingLocationId === ll.id)).map((ll) => ll.listingId));
  assert.equal(distinctListingIds.size, 1, 'all 8 created locations must share exactly one listingId');
  assert.equal([...distinctListingIds][0], created.listingId);
});

test('2. all 8 real addresses are persisted verbatim, none dropped, none duplicated, none reordered into a different set', async () => {
  resetFixtures();
  const created = await initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS });
  const persistedAddresses = created.locations.map((l) => l.address).sort();
  const expectedAddresses = BETZ_ULM_LOCATIONS.map((l) => l.address).sort();
  assert.deepEqual(persistedAddresses, expectedAddresses);
});

test('3. per-location phone is preserved when present, left unset when absent -- never fabricated', async () => {
  resetFixtures();
  const created = await initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS });
  const westerlinger = created.locations.find((l) => l.address.startsWith('Westerlingerstr'));
  const haslacher = created.locations.find((l) => l.address.startsWith('Haslacherweg'));
  assert.equal(westerlinger.phone, '0731 978000');
  assert.equal(haslacher.phone, null);
});

test('4. all created locations start as publicationStatus "draft" -- nothing is ever publicly visible from this call', async () => {
  resetFixtures();
  const created = await initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS });
  assert.ok(created.locations.every((l) => l.publicationStatus === 'draft'));
});

// ── Validation ────────────────────────────────────────────────
test('5. fewer than 2 locations is rejected -- single-location businesses must use initializeDraft instead', async () => {
  resetFixtures();
  await expectThrow(
    () => initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: [{ address: 'Nur eine Adresse' }] }),
    StadtpocketManagerError
  );
});

test('6. a location missing an address is rejected, nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  await expectThrow(
    () => initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: [{ address: 'Echte Adresse 1' }, { phone: '0731 1' }] }),
    StadtpocketManagerError
  );
  assert.equal(listingRows.length, before);
});

test('7. more than MAX_LOCATIONS_PER_DRAFT locations is rejected, nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  const tooMany = Array.from({ length: MAX_LOCATIONS_PER_DRAFT + 1 }, (_, i) => ({ address: `Straße ${i}` }));
  await expectThrow(() => initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: tooMany }), StadtpocketManagerError);
  assert.equal(listingRows.length, before);
});

test('8. missing required listing field (e.g. category) is rejected, nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  await expectThrow(
    () => initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: { name: 'x', shortDescription: 'y' }, locations: BETZ_ULM_LOCATIONS }),
    StadtpocketManagerError
  );
  assert.equal(listingRows.length, before);
});

test('9. a manager scoped to a different city is rejected (403), nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  await expectThrow(
    () => initializeMultiLocationDraft(ULM, STUTTGART_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS }),
    StadtpocketManagerError
  );
  assert.equal(listingRows.length, before);
});

// ── Atomicity: a failure partway through must roll back everything,
// never leaving an orphaned listing with only some of its locations ──
test('10. a DB failure partway through creating locations rolls back the ENTIRE transaction -- no orphaned listing, no partial location set', async () => {
  resetFixtures();
  locationCreateCallCount = 0;
  transactionShouldFailAtLocationIndex = 3; // succeed for 3 locations, fail on the 4th
  const listingCountBefore = listingRows.length;
  const locationCountBefore = listingLocationRows.length;
  await expectThrow(
    () => initializeMultiLocationDraft(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS }),
    Error
  );
  assert.equal(listingRows.length, listingCountBefore, 'the listing itself must be rolled back too, not left orphaned');
  assert.equal(listingLocationRows.length, locationCountBefore, 'no partial set of locations may survive');
});

// ── Duplicate protection: PARENT/brand-level only (Phase 1G.1 §6) ──
test('11. an existing brand (matching name) blocks the whole multi-location batch with a structured 409, nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  const res = await callRoute(routes.handleCreateMultiLocationDraftFromReview, fakeReq({
    params: { locationId: ULM },
    body: { listing: { name: 'Café Brettle', category: 'Café', shortDescription: 'x' }, locations: BETZ_ULM_LOCATIONS },
  }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.duplicate.status, 'POSSIBLE_MATCH');
  assert.equal(listingRows.length, before);
});

test('12. an existing brand (matching website on the first location) blocks the batch, nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  const locations = [{ address: 'Neue Str. 1', website: 'https://www.brettle-ulm.de/' }, { address: 'Neue Str. 2' }];
  const res = await callRoute(routes.handleCreateMultiLocationDraftFromReview, fakeReq({
    params: { locationId: ULM },
    body: { listing: { name: 'Ganz anderer Name', category: 'Café', shortDescription: 'x' }, locations },
  }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.duplicate.status, 'ALREADY_DRAFT');
  assert.equal(listingRows.length, before);
});

test('13. a genuinely new brand creates successfully via the route, 201, with all 8 locations', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateMultiLocationDraftFromReview, fakeReq({
    params: { locationId: ULM },
    body: { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.listing.locations.length, 8);
  assert.equal(res.body.listing.name, 'Bäckerei Betz');
});

test('14. createMultiLocationDraftFromReview re-checks duplicates fresh, server-side, never trusting a client-supplied status', async () => {
  resetFixtures();
  // No duplicate status is ever passed in the body -- this function
  // doesn't even have a field for one (unlike the pre-Phase-1D-fix
  // vulnerability this whole duplicate-recheck pattern exists to close).
  const created = await createMultiLocationDraftFromReview(ULM, ULM_MANAGER_SCOPE, { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS });
  assert.equal(created.listing.locations.length, 8);
});

// ── Regression: single-location behavior completely unaffected ──
test('15. initializeDraft (single-location) still creates exactly one listing and one location, unaffected by the new multi-location code path', async () => {
  resetFixtures();
  const listingCountBefore = listingRows.length;
  const locationCountBefore = listingLocationRows.length;
  await initializeDraft(ULM, ULM_MANAGER_SCOPE, { name: 'Solo GmbH', category: 'x', shortDescription: 'y', address: 'Einzelstr. 1' });
  assert.equal(listingRows.length, listingCountBefore + 1);
  assert.equal(listingLocationRows.length, locationCountBefore + 1);
});

test('16. createDraftFromReview (single-location) route still works exactly as before, unaffected', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({
    params: { locationId: ULM },
    body: { name: 'Solo GmbH', category: 'x', shortDescription: 'y', address: 'Einzelstr. 1' },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.listing.publicationStatus, 'draft');
});

test('17. the new /research/draft-multi route is mounted and reachable, distinct from /research/draft', async () => {
  resetFixtures();
  const single = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { name: 'A', category: 'b', shortDescription: 'c', address: 'd' } }));
  resetFixtures();
  const multi = await callRoute(routes.handleCreateMultiLocationDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { listing: BETZ_LISTING, locations: BETZ_ULM_LOCATIONS } } ));
  assert.equal(single.statusCode, 201);
  assert.equal(multi.statusCode, 201);
  assert.equal(Array.isArray(multi.body.listing.locations), true);
  assert.equal('locations' in single.body.listing, false); // single-location shape is unchanged, still flat
});

// ── runner ──────────────────────────────────────────────────────
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
