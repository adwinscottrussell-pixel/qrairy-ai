// ============================================================
// stadtpocketAiDraft.test.js — Phase 1D follow-up (close the
// duplicate-creation gap). Mocked-Prisma/Clerk tests for
// stadtpocketAiDraftService.js + its route
// (POST .../listings/:locationId/research/draft in
// managerStadtpocketResearchRoutes.js).
//
// Same convention as tests/stadtpocketManagerWrite.test.js /
// tests/stadtpocketOfferRoutes.test.js: no test framework dependency,
// require.cache pre-seeding for Prisma/Clerk, $transaction mocked with
// real snapshot/rollback semantics.
//
// Run: node tests/stadtpocketAiDraft.test.js
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
let transactionShouldFailAt = null; // 'listingLocationCreate' -- simulates saveDraft failing after initializeDraft succeeded

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
    {
      id: 'listing_staib', slug: 'baeckerei-staib', name: 'Bäckerei Staib', category: 'Essen & Trinken',
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
    {
      id: 'll_staib', listingId: 'listing_staib', locationId: ULM,
      address: 'Platzgasse 2-4, 89073 Ulm', latitude: 48.4, longitude: 9.99,
      phone: '0731 8800911', website: 'https://www.baeckerei-staib.de/', hours: null,
      publicationStatus: 'published', publishedAt: new Date(2026, 0, 1), businessLocationId: null, draftData: null,
      createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    },
  ];
  idSeq = 100;
  tokenValid = true;
  currentUserId = 'ulm_manager';
  currentRole = 'staff';
  transactionShouldFailAt = null;
}

function cloneRows(rows) { return rows.map((r) => ({ ...r })); }
function attachListing(ll) { return { ...ll, listing: listingRows.find((l) => l.id === ll.listingId) }; }

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
      if (transactionShouldFailAt === 'listingLocationCreate') {
        throw new Error('simulated database failure during listing-location create');
      }
      const row = {
        id: nextId('ll'), latitude: null, longitude: null, phone: null, website: null, hours: null,
        businessLocationId: null, draftData: null, publishedAt: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      listingLocationRows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      if (transactionShouldFailAt === 'listingLocationUpdate') {
        throw new Error('simulated database failure during listing-location update (saveDraft)');
      }
      const row = listingLocationRows.find((ll) => ll.id === where.id);
      if (!row) throw new Error('listing location not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
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
const { createDraftFromReview, splitRequiredAndOptional, StadtpocketDuplicateError } = require('../src/services/stadtpocketAiDraftService');

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

const BRETTLE_REVIEWED = { name: 'Café Neuling', category: 'Café', shortDescription: 'Ganz neu', address: 'Irgendwo 1, 89073 Ulm' };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── splitRequiredAndOptional (pure) ─────────────────────────────
test('1. splitRequiredAndOptional separates exactly the 4 required keys from everything else', () => {
  const { required, optional } = splitRequiredAndOptional({ name: 'a', category: 'b', shortDescription: 'c', address: 'd', phone: 'e', website: 'f' });
  assert.deepEqual(required, { name: 'a', category: 'b', shortDescription: 'c', address: 'd' });
  assert.deepEqual(optional, { phone: 'e', website: 'f' });
});

// ── NEW -> creates ───────────────────────────────────────────────
test('2. NEW candidate creates successfully via the route, 201', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: BRETTLE_REVIEWED }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.listing.name, 'Café Neuling');
  assert.equal(res.body.listing.publicationStatus, 'draft');
});

test('3. a real Prisma row is created for a NEW candidate', async () => {
  resetFixtures();
  const before = listingRows.length;
  await createDraftFromReview(ULM, { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] }, BRETTLE_REVIEWED);
  assert.equal(listingRows.length, before + 1);
});

// ── POSSIBLE_MATCH / ALREADY_DRAFT / ALREADY_PUBLISHED -> blocked ──
test('4. POSSIBLE_MATCH (name-only match) is blocked server-side with a structured 409, nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { name: 'Café Brettle', category: 'Café', shortDescription: 'x', address: 'Ganz andere Adresse 99' } }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.duplicate.status, 'POSSIBLE_MATCH');
  assert.equal(listingRows.length, before);
});

test('5. ALREADY_DRAFT (matching website) is blocked server-side, nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { name: 'Irgendein Name', category: 'Café', shortDescription: 'x', address: 'y', website: 'https://www.brettle-ulm.de/' } }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.duplicate.status, 'ALREADY_DRAFT');
  assert.equal(listingRows.length, before);
});

test('6. ALREADY_PUBLISHED (matching website+phone) is blocked server-side, nothing created', async () => {
  resetFixtures();
  const before = listingRows.length;
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { name: 'Irgendein Name', category: 'x', shortDescription: 'x', address: 'y', website: 'https://www.baeckerei-staib.de/', phone: '0731 8800911' } }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.duplicate.status, 'ALREADY_PUBLISHED');
  assert.equal(listingRows.length, before);
});

// ── stale client status cannot bypass server detection ──────────
test('7. a client-claimed duplicateStatus:"NEW" field is never read and cannot bypass the real server check', async () => {
  resetFixtures();
  const before = listingRows.length;
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({
    params: { locationId: ULM },
    body: { name: 'x', category: 'x', shortDescription: 'x', address: 'y', website: 'https://www.baeckerei-staib.de/', duplicateStatus: 'NEW', duplicate: { status: 'NEW' } },
  }));
  // Real duplicate exists (website match) -- must still block regardless
  // of what the client claims in extra fields.
  assert.equal(res.statusCode, 409);
  assert.equal(listingRows.length, before);
});

test('8. a fresh /research NEW result from BEFORE another manager created the real duplicate is correctly rejected at creation time (the actual stale-status scenario)', async () => {
  resetFixtures();
  // Simulates: research ran and said NEW; in the gap before the Admin
  // clicked create, someone else created the real duplicate. The
  // create-draft call must re-check fresh, not trust the old research
  // result (which this endpoint never even receives).
  listingRows.push({ id: 'listing_late', slug: 'spaet-erstellt', name: 'Spät Erstellt', category: 'x', subCategory: null, tags: [], shortDescription: 'x', longDescription: null, businessId: null, createdBy: 'someone_else', draftData: null, createdAt: new Date(), updatedAt: new Date() });
  listingLocationRows.push({ id: 'll_late', listingId: 'listing_late', locationId: ULM, address: 'y', latitude: null, longitude: null, phone: null, website: 'https://www.spaeterstellt.de/', hours: null, publicationStatus: 'draft', publishedAt: null, businessLocationId: null, draftData: null, createdAt: new Date(), updatedAt: new Date() });
  const before = listingRows.length;
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { name: 'x', category: 'x', shortDescription: 'x', address: 'y', website: 'https://www.spaeterstellt.de/' } }));
  assert.equal(res.statusCode, 409);
  assert.equal(listingRows.length, before);
});

// ── strongest available reviewed fields participate ──────────────
test('9. phone alone (no website match) is enough to detect ALREADY_PUBLISHED', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { name: 'x', category: 'x', shortDescription: 'x', address: 'y', phone: '0731 8800911' } }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.duplicate.status, 'ALREADY_PUBLISHED');
});

test('10. address alone (no website/phone match) is enough to detect a duplicate', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { name: 'x', category: 'x', shortDescription: 'x', address: 'Platzgasse 2-4, 89073 Ulm' } }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.duplicate.status, 'ALREADY_PUBLISHED');
});

// ── authorization ──────────────────────────────────────────────
test('11. unauthenticated request -> 401, nothing created', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ auth: false, params: { locationId: ULM }, body: BRETTLE_REVIEWED }));
  assert.equal(res.statusCode, 401);
});

test('12. a manager cannot escape their authorized city -- 403, nothing created even with a genuinely new business', async () => {
  resetFixtures();
  const before = listingRows.length;
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: STUTTGART }, body: BRETTLE_REVIEWED }));
  assert.equal(res.statusCode, 403);
  assert.equal(listingRows.length, before);
});

test('13. Global Admin bypasses city-scope lookup entirely, can still create', async () => {
  resetFixtures();
  currentUserId = 'someone_not_a_manager';
  currentRole = 'admin';
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: STUTTGART }, body: BRETTLE_REVIEWED }));
  assert.equal(res.statusCode, 201);
});

// ── partial-write safety ──────────────────────────────────────────
test('14. enrichment failure after successful creation: draft still exists, exactly once, error reported, no retry', async () => {
  resetFixtures();
  const before = listingRows.length;
  transactionShouldFailAt = 'listingLocationUpdate';
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: { ...BRETTLE_REVIEWED, phone: '0731 999999' } }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.enrichmentFailed, true);
  assert.equal(listingRows.length, before + 1); // exactly one new listing, never retried/duplicated
});

test('15. required-field-only creation (no optional fields at all) never calls saveDraft, succeeds cleanly', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: BRETTLE_REVIEWED }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.enrichmentFailed, false);
});

// ── integrity: no publish, no owner, no fake features ─────────────
test('16. the created listing is never published -- publicationStatus stays draft, publishedAt stays null', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: BRETTLE_REVIEWED }));
  assert.equal(res.body.listing.publicationStatus, 'draft');
  assert.equal(res.body.listing.publishedAt, null);
});

test('17. no owner is ever created -- businessId stays null on the new listing', async () => {
  resetFixtures();
  await createDraftFromReview(ULM, { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] }, BRETTLE_REVIEWED);
  const created = listingRows[listingRows.length - 1];
  assert.equal(created.businessId, null);
});

test('18. this flow never touches any offer/loyalty/update table -- the mock exposes none, so any attempt would throw', async () => {
  resetFixtures();
  assert.equal(mockPrisma.stadtPocketOffer, undefined);
  assert.equal(mockPrisma.landingPage, undefined);
  assert.equal(mockPrisma.business, undefined);
  const res = await callRoute(routes.handleCreateDraftFromReview, fakeReq({ params: { locationId: ULM }, body: BRETTLE_REVIEWED }));
  assert.equal(res.statusCode, 201); // reaching 201 without a "not a function" throw is the proof
});

// ── manual-flow untouched (files, not just behavior) ─────────────
test('19. the manual initializeDraft path still performs NO duplicate check of its own (unchanged) -- a duplicate-triggering manual create still succeeds exactly as before', async () => {
  resetFixtures();
  const manager = require('../src/services/stadtpocketManagerService');
  const scope = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
  // Same name as the existing published Bäckerei Staib -- the OLD
  // manual route has always allowed this (see its own header comment:
  // "duplicate protection... enforced by generateUniqueSlug's DB-level
  // slug collision handling, not a city-level guard"). Confirms this
  // task did not alter that file's behavior at all.
  const result = await manager.initializeDraft(ULM, scope, { name: 'Bäckerei Staib', category: 'x', shortDescription: 'x', address: 'x' });
  assert.ok(result.listingLocationId);
  assert.notEqual(result.slug, 'baeckerei-staib'); // still gets a distinguishing slug suffix, not blocked
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
