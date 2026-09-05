// ============================================================
// stadtpocketManagerWrite.test.js — mocked-Prisma/Clerk tests for the
// Secure Draft -> Preview -> Publish write path (Phase 6C), extended
// Phase 6D for "a city holds zero, one, or many StadtPocket businesses."
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the same pattern as
// tests/locationManagerAuth.test.js and tests/stadtpocketPublic.test.js.
// Prisma and @clerk/backend are mocked by pre-seeding require.cache
// before the middleware/routes are required, so no real DB or network
// call is ever made, and no real Clerk token is ever needed.
//
// $transaction is mocked with real rollback semantics (snapshot before
// the callback, restore on throw) specifically so the atomicity tests
// (K1/K2 below) are testing real transactional behavior, not just that
// the code happens to call the right Prisma methods in order.
//
// Run: node tests/stadtpocketManagerWrite.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');

// ── Fixture data (mutable, reset per test) ──────────────────────
const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const NET1 = 'net_stadtpocket';
const STAIB_LL_ID = 'll_staib_ulm';

let networkMemberRows = [];
let locationRows = [
  { id: ULM, networkId: NET1, name: 'Ulm', slug: 'ulm', type: 'city', status: 'active' },
  { id: STUTTGART, networkId: NET1, name: 'Stuttgart', slug: 'stuttgart', type: 'city', status: 'active' },
];
let listingRows = [];
let listingLocationRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }

function resetFixtures() {
  networkMemberRows = [
    { userId: 'ulm_manager', role: 'location_manager', locationId: ULM, networkId: NET1 },
    { userId: 'stuttgart_manager', role: 'location_manager', locationId: STUTTGART, networkId: NET1 },
  ];
  locationRows = [
    { id: ULM, networkId: NET1, name: 'Ulm', slug: 'ulm', type: 'city', status: 'active' },
    { id: STUTTGART, networkId: NET1, name: 'Stuttgart', slug: 'stuttgart', type: 'city', status: 'active' },
  ];
  listingRows = [
    {
      id: 'listing_staib', slug: 'baeckerei-staib', name: 'Bäckerei Staib', category: 'Essen & Trinken',
      subCategory: 'Bäckerei', tags: ['Bäckerei'], shortDescription: 'Filiale in der Platzgasse.', longDescription: null,
      businessId: null, createdBy: 'ulm_manager', draftData: null,
      createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    },
  ];
  listingLocationRows = [
    {
      id: STAIB_LL_ID, listingId: 'listing_staib', locationId: ULM,
      address: 'Platzgasse 2-4, 89073 Ulm', latitude: 48.3993425, longitude: 9.9911963,
      phone: '0731 8800911', website: 'https://www.baeckerei-staib.de/', hours: null,
      publicationStatus: 'published', publishedAt: new Date(2026, 0, 1),
      businessLocationId: null, draftData: null,
      createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    },
  ];
  idSeq = 100;
  tokenValid = true;
  currentUserId = 'ulm_manager';
  currentRole = 'staff'; // Clerk publicMetadata.role for the admin-bypass check
  transactionShouldFailAt = null;
}

function cloneRows(rows) { return rows.map((r) => ({ ...r })); }

// ── Mock Prisma ──────────────────────────────────────────────────
let transactionShouldFailAt = null; // 'listingUpdate' | 'locationUpdate' | null -- test-injected failure point

function attachListing(ll) {
  const listing = listingRows.find((l) => l.id === ll.listingId);
  return { ...ll, listing };
}

const mockPrisma = {
  networkMember: {
    findMany: async ({ where }) => networkMemberRows.filter((r) => r.userId === where.userId),
  },
  location: {
    findMany: async ({ where }) => {
      const ids = where.networkId.in;
      return locationRows.filter((l) => ids.includes(l.networkId)).map((l) => ({ id: l.id }));
    },
    findUnique: async ({ where }) => locationRows.find((l) => l.slug === where.slug) || null,
  },
  stadtPocketListing: {
    findUnique: async ({ where }) => {
      if (where.id) return listingRows.find((l) => l.id === where.id) || null;
      if (where.slug) return listingRows.find((l) => l.slug === where.slug) || null;
      return null;
    },
    create: async ({ data }) => {
      const row = { id: nextId('listing'), subCategory: null, tags: [], longDescription: null, draftData: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      listingRows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      if (transactionShouldFailAt === 'listingUpdate') {
        throw new Error('simulated database failure during listing update');
      }
      const row = listingRows.find((l) => l.id === where.id);
      if (!row) throw new Error('listing not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  },
  stadtPocketListingLocation: {
    findMany: async ({ where, include }) => {
      let rows = listingLocationRows;
      if (where && where.locationId) rows = rows.filter((ll) => ll.locationId === where.locationId);
      if (where && where.publicationStatus) rows = rows.filter((ll) => ll.publicationStatus === where.publicationStatus);
      if (where && where.listing && where.listing.slug) {
        rows = rows.filter((ll) => {
          const listing = listingRows.find((l) => l.id === ll.listingId);
          return listing && listing.slug === where.listing.slug;
        });
      }
      return include && include.listing ? rows.map(attachListing) : rows;
    },
    findFirst: async ({ where, include }) => {
      const row = listingLocationRows.find((ll) => ll.locationId === where.locationId);
      if (!row) return null;
      return include && include.listing ? attachListing(row) : row;
    },
    findUnique: async ({ where, include }) => {
      const row = listingLocationRows.find((ll) => ll.id === where.id);
      if (!row) return null;
      return include && include.listing ? attachListing(row) : row;
    },
    create: async ({ data }) => {
      const row = {
        id: nextId('ll'), latitude: null, longitude: null, phone: null, website: null, hours: null,
        businessLocationId: null, draftData: null, publishedAt: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      listingLocationRows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      if (transactionShouldFailAt === 'locationUpdate') {
        throw new Error('simulated database failure during location update');
      }
      const row = listingLocationRows.find((ll) => ll.id === where.id);
      if (!row) throw new Error('listing location not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  },
  // Array form (used by saveDraft) and interactive callback form (used
  // by initializeDraft/publishListingLocation) both supported. The
  // callback form snapshots the two mutable fixture arrays beforehand
  // and restores them verbatim if the callback throws -- real rollback
  // semantics for the atomicity tests, not just call-order mimicry.
  $transaction: async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const listingSnapshot = cloneRows(listingRows);
    const listingLocationSnapshot = cloneRows(listingLocationRows);
    try {
      return await arg(mockPrisma);
    } catch (err) {
      listingRows.length = 0;
      listingRows.push(...listingSnapshot);
      listingLocationRows.length = 0;
      listingLocationRows.push(...listingLocationSnapshot);
      throw err;
    }
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// ── Clerk mock ────────────────────────────────────────────────────
let tokenValid = true;
let currentUserId = 'ulm_manager';
let currentRole = 'staff';

require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => {
      if (!tokenValid) throw new Error('simulated invalid/expired token');
      return { sub: currentUserId };
    },
    createClerkClient: () => ({
      users: {
        getUser: async (id) => ({ id, publicMetadata: { role: currentRole } }),
      },
    }),
  },
};

const { requireStadtpocketWriteScope } = require('../src/middleware/stadtpocketManagerAuth');
const routes = require('../src/routes/managerStadtpocketListingRoutes');
const publicService = require('../src/services/stadtpocketPublicService');
const managerService = require('../src/services/stadtpocketManagerService');

// ── Test helpers ──────────────────────────────────────────────────
function fakeReq({ auth = true, params = {}, body = {} } = {}) {
  return {
    headers: auth ? { authorization: 'Bearer test-token' } : {},
    params,
    body,
    method: 'GET',
    originalUrl: '/manager/stadtpocket/listings',
  };
}

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function callRoute(handler, req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireStadtpocketWriteScope(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res;
  await handler(req, res);
  return res;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── A. Unauthenticated write -> rejected ───────────────────────────
test('A. unauthenticated save-draft -> 401', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ auth: false, params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { name: 'x' } }));
  assert.equal(res.statusCode, 401);
});

test('A. invalid/expired token -> 401', async () => {
  resetFixtures();
  tokenValid = false;
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { name: 'x' } }));
  assert.equal(res.statusCode, 401);
});

// ── B. Unrelated City Manager -> rejected ──────────────────────────
test('B. Stuttgart manager cannot read Ulm listing', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleGetEditableState, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, 403);
});

test('B. Stuttgart manager cannot save draft for Ulm listing', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { phone: '0000' } }));
  assert.equal(res.statusCode, 403);
  const row = listingLocationRows.find((r) => r.id === STAIB_LL_ID);
  assert.equal(row.draftData, null); // nothing written
});

test('B. Stuttgart manager cannot publish Ulm listing', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handlePublish, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, 403);
});

test('B. Stuttgart manager cannot list Ulm businesses', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleListListings, fakeReq({ params: { locationId: ULM } }));
  assert.equal(res.statusCode, 403);
});

// ── C. Correct City Manager -> allowed ─────────────────────────────
test('C. Ulm manager can read the Ulm listing', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleGetEditableState, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, undefined); // 200 default (json() never set a status)
  assert.equal(res.body.listing.name, 'Bäckerei Staib');
});

test('C. Ulm manager can save a draft edit', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { phone: '0731 1234567' } }));
  assert.equal(res.body.listing.phone, '0731 1234567');
});

// ── D. Manager cannot cross city scope (network_admin over-broadening check) ──
test('D. location_manager scope never includes an unrelated city even via network expansion path', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager'; // has ONLY Stuttgart
  const res = await callRoute(routes.handleGetEditableState, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, 403);
});

// ── E. Invalid listing/location -> rejected ────────────────────────
test('E. unknown locationId (not in scope) -> 403, not 404 (scope checked first)', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleGetEditableState, fakeReq({ params: { locationId: 'loc_nonexistent', listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, 403);
});

test('E. in-scope location with no listing yet -> 404', async () => {
  resetFixtures();
  listingLocationRows = listingLocationRows.filter((r) => r.locationId !== ULM);
  const res = await callRoute(routes.handleGetEditableState, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, 404);
});

test('E. listingLocationId that belongs to a DIFFERENT city than claimed -> 404, not leaked', async () => {
  resetFixtures();
  // Give Ulm's manager scope over Stuttgart too, so the 403 path can't
  // mask this -- proves the city/business pairing itself is re-checked,
  // not just "is this user allowed in this city at all."
  networkMemberRows.push({ userId: 'ulm_manager', role: 'location_manager', locationId: STUTTGART, networkId: NET1 });
  const res = await callRoute(routes.handleGetEditableState, fakeReq({ params: { locationId: STUTTGART, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, 404);
});

// ── F. Save draft does NOT alter public response ───────────────────
test('F. save draft leaves the public API response unchanged', async () => {
  resetFixtures();
  const before = await publicService.getCityBusiness('ulm', 'baeckerei-staib');
  await callRoute(routes.handleSaveDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    body: { name: 'DRAFT NAME SHOULD NOT LEAK', phone: '0000000000', shortDescription: 'draft desc' },
  }));
  const after = await publicService.getCityBusiness('ulm', 'baeckerei-staib');
  assert.deepEqual(after, before);
  assert.equal(after.name, 'Bäckerei Staib'); // still the live/published name
});

// ── G. Preview shows draft ──────────────────────────────────────────
test('G. preview reflects the saved draft, not the live published values', async () => {
  resetFixtures();
  await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { name: 'Neuer Name GmbH' } }));
  const res = await callRoute(routes.handlePreviewDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.body.preview.name, 'Neuer Name GmbH');
});

// ── H. Publish updates public response ─────────────────────────────
test('H. publish makes the new content visible through the public API', async () => {
  resetFixtures();
  await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { name: 'Neuer Name GmbH', phone: '0731 9999999' } }));
  const res = await callRoute(routes.handlePublish, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.body.published.publicationStatus, 'published');
  const detail = await publicService.getCityBusiness('ulm', 'baeckerei-staib');
  assert.equal(detail.name, 'Neuer Name GmbH');
  assert.equal(detail.locations[0].phone, '0731 9999999');
});

// ── I. Unpublished/draft listing stays excluded from public API ─────
test('I. a brand-new draft listing (never published) is invisible to the public API', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  await callRoute(routes.handleInitializeDraft, fakeReq({
    params: { locationId: STUTTGART },
    body: { name: 'Neues Geschäft', category: 'Shopping', shortDescription: 'Kurzbeschreibung', address: 'Königstraße 1, Stuttgart' },
  }));
  const list = await publicService.listCityBusinesses('stuttgart');
  assert.deepEqual(list.businesses, []); // still draft -- publicationStatus defaults to 'draft'
});

test('I. pausing a published listing removes it from the public API', async () => {
  resetFixtures();
  await callRoute(routes.handlePause, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  const detail = await publicService.getCityBusiness('ulm', 'baeckerei-staib');
  assert.equal(detail, null);
});

// ── J. No fabricated fields appear ───────────────────────────────────
test('J. editable state never fabricates deals/loyalty/updates/email fields', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleGetEditableState, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  const keys = Object.keys(res.body.listing);
  for (const forbidden of ['deals', 'loyalty', 'updates', 'email', 'rating', 'reviews', 'logoUrl', 'coverImage']) {
    assert.equal(keys.includes(forbidden), false, `unexpected fabricated field: ${forbidden}`);
  }
});

test('J. clearing an optional field to null is honored, not silently ignored', async () => {
  resetFixtures();
  await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { phone: null } }));
  const res = await callRoute(routes.handlePreviewDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.body.preview.phone, null);
});

// ── K. Malformed hours/coordinates rejected ─────────────────────────
test('K. malformed hours (bad day) rejected', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleSaveDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { hours: [{ day: 'Notaday', closed: true }] },
  }));
  assert.equal(res.statusCode, 400);
});

test('K. malformed hours (bad time format) rejected', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleSaveDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { hours: [{ day: 'Mo', intervals: [{ open: '9:00', close: '17:00' }] }] },
  }));
  assert.equal(res.statusCode, 400);
});

test('K. split-shift hours are accepted (contract must not be simplified to one range)', async () => {
  resetFixtures();
  const hours = [{ day: 'Mo', intervals: [{ open: '09:30', close: '14:00' }, { open: '17:00', close: '23:00' }] }];
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { hours } }));
  assert.deepEqual(res.body.listing.hours, hours);
});

test('K. out-of-range latitude rejected', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleSaveDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { latitude: 999, longitude: 9.99 },
  }));
  assert.equal(res.statusCode, 400);
});

test('K. latitude without longitude rejected', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { latitude: 48.4 } }));
  assert.equal(res.statusCode, 400);
});

test('K. invalid website URL rejected', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { website: 'not a url' } }));
  assert.equal(res.statusCode, 400);
});

test('K. unexpected field in draft payload rejected', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { deals: [{ title: 'fake' }] } }));
  assert.equal(res.statusCode, 400);
});

// ── L. Existing Phase 6B public API behavior remains intact ────────
test('L. existing Phase 6B public list/detail behavior untouched', async () => {
  resetFixtures();
  const list = await publicService.listCityBusinesses('ulm');
  assert.equal(list.businesses.length, 1);
  assert.equal(list.businesses[0].slug, 'baeckerei-staib');
  const detail = await publicService.getCityBusiness('ulm', 'baeckerei-staib');
  assert.equal(detail.locations.length, 1);
  assert.equal(detail.locations[0].address, 'Platzgasse 2-4, 89073 Ulm');
});

// ── Global Admin access ──────────────────────────────────────────
test('Global Admin can write to a listing outside their own manager scope', async () => {
  resetFixtures();
  currentUserId = 'platform_admin_1'; // no NetworkMember row at all
  currentRole = 'admin';
  const res = await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { phone: '0731 5555555' } }));
  assert.equal(res.body.listing.phone, '0731 5555555');
});

test('Global Admin can publish across cities', async () => {
  resetFixtures();
  currentUserId = 'platform_admin_1';
  currentRole = 'admin';
  const res = await callRoute(routes.handlePublish, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.body.published.publicationStatus, 'published');
});

test('Global Admin can list any city, including one with zero businesses', async () => {
  resetFixtures();
  currentUserId = 'platform_admin_1';
  currentRole = 'admin';
  const res = await callRoute(routes.handleListListings, fakeReq({ params: { locationId: STUTTGART } }));
  assert.equal(res.statusCode, undefined);
  assert.deepEqual(res.body.listings, []);
});

// ── Publish completeness validation ──────────────────────────────
test('publish fails if a required field would be empty (draft cleared it to null is impossible for required fields, but guard against a corrupt live row)', async () => {
  resetFixtures();
  // Simulate a corrupt/blank live address that somehow reached this
  // state -- publish must still refuse, never publish an empty
  // required field just because it's already sitting in the live column.
  const row = listingLocationRows.find((r) => r.id === STAIB_LL_ID);
  row.address = '';
  const res = await callRoute(routes.handlePublish, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, 400);
});

// ── K1/K2. Publish atomicity ──────────────────────────────────────
test('K1. failed publish (location update throws) leaves BOTH listing and location completely unchanged', async () => {
  resetFixtures();
  await callRoute(routes.handleSaveDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    body: { name: 'Should Never Be Published', phone: '0731 0000000' },
  }));
  const beforeListing = { ...listingRows.find((l) => l.id === 'listing_staib') };
  const beforeLocation = { ...listingLocationRows.find((r) => r.id === STAIB_LL_ID) };

  transactionShouldFailAt = 'locationUpdate'; // fails AFTER the listing update already ran inside the same transaction
  await assert.rejects(() => managerService.publishForLocation(ULM, STAIB_LL_ID, { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' }));
  transactionShouldFailAt = null;

  const afterListing = listingRows.find((l) => l.id === 'listing_staib');
  const afterLocation = listingLocationRows.find((r) => r.id === STAIB_LL_ID);
  assert.deepEqual(afterListing, beforeListing);
  assert.deepEqual(afterLocation, beforeLocation);
  assert.equal(afterListing.name, 'Bäckerei Staib'); // NOT "Should Never Be Published"
  assert.equal(afterLocation.publicationStatus, 'published'); // unchanged, still whatever it was
});

test('K2. failed publish never changes the public API response', async () => {
  resetFixtures();
  await callRoute(routes.handleSaveDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    body: { name: 'Should Never Be Published', address: 'Fake Street 1, Ulm' },
  }));
  const before = await publicService.getCityBusiness('ulm', 'baeckerei-staib');

  transactionShouldFailAt = 'locationUpdate';
  await assert.rejects(() => managerService.publishForLocation(ULM, STAIB_LL_ID, { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' }));
  transactionShouldFailAt = null;

  const after = await publicService.getCityBusiness('ulm', 'baeckerei-staib');
  assert.deepEqual(after, before);
  assert.equal(after.name, 'Bäckerei Staib');
});

test('K3. failed publish when the FIRST write (listing update) throws leaves everything unchanged too', async () => {
  resetFixtures();
  await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { name: 'Also Should Never Publish' } }));
  const beforeListing = { ...listingRows.find((l) => l.id === 'listing_staib') };

  transactionShouldFailAt = 'listingUpdate';
  await assert.rejects(() => managerService.publishForLocation(ULM, STAIB_LL_ID, { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' }));
  transactionShouldFailAt = null;

  const afterListing = listingRows.find((l) => l.id === 'listing_staib');
  assert.deepEqual(afterListing, beforeListing);
});

test('successful publish IS reflected (control case, proves the mock transaction does not always roll back)', async () => {
  resetFixtures();
  await callRoute(routes.handleSaveDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { name: 'Real Publish Works' } }));
  await managerService.publishForLocation(ULM, STAIB_LL_ID, { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' });
  const after = await publicService.getCityBusiness('ulm', 'baeckerei-staib');
  assert.equal(after.name, 'Real Publish Works');
});

// ── M. City -> many businesses (Phase 6D) ──────────────────────────
test('M. a city with zero listings lists as an empty array, not an error', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleListListings, fakeReq({ params: { locationId: STUTTGART } }));
  assert.equal(res.statusCode, undefined);
  assert.deepEqual(res.body.listings, []);
});

test('M. a city with exactly one listing lists that one business', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleListListings, fakeReq({ params: { locationId: ULM } }));
  assert.equal(res.body.listings.length, 1);
  assert.equal(res.body.listings[0].name, 'Bäckerei Staib');
  assert.equal(res.body.listings[0].listingLocationId, STAIB_LL_ID);
});

test('M. creating a second business in a city that already has one does NOT 409', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleInitializeDraft, fakeReq({
    params: { locationId: ULM },
    body: { name: 'Cafe Zweite Geschichte', category: 'Essen & Trinken', shortDescription: 'Ein zweites Ulmer Geschäft.', address: 'Münsterplatz 1, Ulm' },
  }));
  assert.equal(res.statusCode, 201);
  assert.notEqual(res.body.listing.listingLocationId, STAIB_LL_ID);
});

test('M. a city with many listings lists all of them', async () => {
  resetFixtures();
  await callRoute(routes.handleInitializeDraft, fakeReq({
    params: { locationId: ULM },
    body: { name: 'Cafe Zweite Geschichte', category: 'Essen & Trinken', shortDescription: 'Ein zweites Ulmer Geschäft.', address: 'Münsterplatz 1, Ulm' },
  }));
  await callRoute(routes.handleInitializeDraft, fakeReq({
    params: { locationId: ULM },
    body: { name: 'Dritter Laden', category: 'Shopping', shortDescription: 'Ein dritter Ulmer Laden.', address: 'Hafenbad 5, Ulm' },
  }));
  const res = await callRoute(routes.handleListListings, fakeReq({ params: { locationId: ULM } }));
  assert.equal(res.body.listings.length, 3);
  const names = res.body.listings.map((l) => l.name).sort();
  assert.deepEqual(names, ['Bäckerei Staib', 'Cafe Zweite Geschichte', 'Dritter Laden']);
});

test('M. two businesses with the same name in one city both get created, with distinct slugs (duplicate protection via slug uniqueness, not a city-level block)', async () => {
  resetFixtures();
  const body = { name: 'Neues Geschaeft Ulm', category: 'Shopping', shortDescription: 'Erste Filiale.', address: 'Beispielweg 1, Ulm' };
  const first = await callRoute(routes.handleInitializeDraft, fakeReq({ params: { locationId: ULM }, body }));
  const second = await callRoute(routes.handleInitializeDraft, fakeReq({
    params: { locationId: ULM },
    body: { ...body, address: 'Beispielweg 2, Ulm' },
  }));
  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 201); // NOT a 409 -- same name is not treated as a forbidden duplicate
  const firstListing = listingRows.find((l) => l.id === first.body.listing.listingId);
  const secondListing = listingRows.find((l) => l.id === second.body.listing.listingId);
  assert.equal(firstListing.slug, 'neues-geschaeft-ulm');
  assert.notEqual(secondListing.slug, firstListing.slug); // DB-level slug uniqueness still enforced
  assert.equal(secondListing.slug.startsWith('neues-geschaeft-ulm'), true);
});

test('M. editing one business in a city does not affect a sibling business in the same city', async () => {
  resetFixtures();
  const created = await callRoute(routes.handleInitializeDraft, fakeReq({
    params: { locationId: ULM },
    body: { name: 'Cafe Zweite Geschichte', category: 'Essen & Trinken', shortDescription: 'Ein zweites Ulmer Geschäft.', address: 'Münsterplatz 1, Ulm' },
  }));
  const secondLLId = created.body.listing.listingLocationId;

  await callRoute(routes.handleSaveDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: secondLLId },
    body: { phone: '0731 4444444' },
  }));

  const staibPreview = await callRoute(routes.handlePreviewDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(staibPreview.body.preview.phone, '0731 8800911'); // Staib's original phone, untouched

  const secondPreview = await callRoute(routes.handlePreviewDraft, fakeReq({ params: { locationId: ULM, listingLocationId: secondLLId } }));
  assert.equal(secondPreview.body.preview.phone, '0731 4444444');
});

test('M. publishing one business in a city does not publish a sibling draft business in the same city', async () => {
  resetFixtures();
  const created = await callRoute(routes.handleInitializeDraft, fakeReq({
    params: { locationId: ULM },
    body: { name: 'Cafe Zweite Geschichte', category: 'Essen & Trinken', shortDescription: 'Ein zweites Ulmer Geschäft.', address: 'Münsterplatz 1, Ulm' },
  }));
  const secondLLId = created.body.listing.listingLocationId;
  assert.equal(created.body.listing.publicationStatus, 'draft');

  await callRoute(routes.handlePublish, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));

  const secondRow = listingLocationRows.find((r) => r.id === secondLLId);
  assert.equal(secondRow.publicationStatus, 'draft'); // untouched by Staib's publish

  const secondList = await publicService.getCityBusiness('ulm', 'cafe-zweite-geschichte');
  assert.equal(secondList, null); // still not public
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
