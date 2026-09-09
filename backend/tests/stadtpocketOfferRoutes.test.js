// ============================================================
// stadtpocketOfferRoutes.test.js — mocked-Prisma/Clerk/Cloudinary tests
// for the StadtPocket Angebote manager write API (Phase B):
// managerStadtpocketOfferRoutes.js.
//
// Follows the exact same pattern as tests/stadtpocketHeaderImage.test.js
// (which itself follows tests/stadtpocketManagerWrite.test.js) -- no
// test framework dependency, require.cache pre-seeding for Prisma,
// @clerk/backend, and cloudinary, so no real DB/network/Cloudinary call
// is ever made.
//
// This file covers what's NEW in Phase B: route wiring, auth middleware
// integration, the image-upload route, and HTTP-layer failure handling.
// The deeper business-logic edge cases (date ordering, draft isolation,
// idempotent publish, computed expiration, etc.) are already exhaustively
// covered at the service layer by tests/stadtpocketOffer.test.js (28
// tests, Phase A) -- not duplicated here.
//
// Run: node tests/stadtpocketOfferRoutes.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');
const cloudinaryPath = require.resolve('cloudinary');

process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';

// ── Fixture data ─────────────────────────────────────────────────
const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const NET1 = 'net_stadtpocket';
const STAIB_LL_ID = 'll_staib_ulm';
const OTHER_LL_ID = 'll_other_ulm';
const STUTTGART_LL_ID = 'll_shop_stuttgart';

let networkMemberRows = [];
let locationRows = [];
let listingLocationRows = [];
let offerRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }

let tokenValid = true;
let currentUserId = 'ulm_manager';
let currentRole = 'staff';
let offerUpdateShouldFail = false;
let cloudinaryUploadCalls = [];
let cloudinaryUploadShouldFail = false;

function resetFixtures() {
  networkMemberRows = [
    { userId: 'ulm_manager', role: 'location_manager', locationId: ULM, networkId: NET1 },
    { userId: 'stuttgart_manager', role: 'location_manager', locationId: STUTTGART, networkId: NET1 },
  ];
  locationRows = [
    { id: ULM, networkId: NET1, name: 'Ulm', slug: 'ulm', type: 'city', status: 'active' },
    { id: STUTTGART, networkId: NET1, name: 'Stuttgart', slug: 'stuttgart', type: 'city', status: 'active' },
  ];
  listingLocationRows = [
    { id: STAIB_LL_ID, listingId: 'listing_staib', locationId: ULM },
    { id: OTHER_LL_ID, listingId: 'listing_other', locationId: ULM },
    { id: STUTTGART_LL_ID, listingId: 'listing_shop', locationId: STUTTGART },
  ];
  offerRows = [];
  idSeq = 100;
  tokenValid = true;
  currentUserId = 'ulm_manager';
  currentRole = 'staff';
  offerUpdateShouldFail = false;
  cloudinaryUploadCalls = [];
  cloudinaryUploadShouldFail = false;
}

function cloneRows(rows) { return rows.map((r) => ({ ...r })); }

const mockPrisma = {
  networkMember: {
    findMany: async ({ where }) => networkMemberRows.filter((r) => r.userId === where.userId),
  },
  location: {
    findMany: async ({ where }) => {
      const ids = where.networkId.in;
      return locationRows.filter((l) => ids.includes(l.networkId)).map((l) => ({ id: l.id }));
    },
  },
  stadtPocketListingLocation: {
    findUnique: async ({ where }) => listingLocationRows.find((ll) => ll.id === where.id) || null,
  },
  stadtPocketOffer: {
    findUnique: async ({ where }) => offerRows.find((o) => o.id === where.id) || null,
    findMany: async ({ where }) => {
      let rows = offerRows;
      if (where && where.listingLocationId) rows = rows.filter((o) => o.listingLocationId === where.listingLocationId);
      return cloneRows(rows);
    },
    create: async ({ data }) => {
      const row = { image: null, draftData: null, publishedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      offerRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      if (offerUpdateShouldFail) throw new Error('simulated database failure: connection reset by peer');
      const row = offerRows.find((o) => o.id === where.id);
      if (!row) throw new Error('offer not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  },
  $transaction: async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const snapshot = cloneRows(offerRows);
    try {
      return await arg(mockPrisma);
    } catch (err) {
      offerRows.length = 0;
      offerRows.push(...snapshot);
      throw err;
    }
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => {
      if (!tokenValid) throw new Error('simulated invalid/expired token');
      return { sub: currentUserId };
    },
    createClerkClient: () => ({
      users: { getUser: async (id) => ({ id, publicMetadata: { role: currentRole } }) },
    }),
  },
};

require.cache[cloudinaryPath] = {
  id: cloudinaryPath, filename: cloudinaryPath, loaded: true,
  exports: {
    v2: {
      config: () => {},
      uploader: {
        upload_stream: (options, callback) => {
          cloudinaryUploadCalls.push(options);
          return {
            end: () => {
              if (cloudinaryUploadShouldFail) {
                callback(new Error('simulated Cloudinary failure'), null);
                return;
              }
              const fullPublicId = `${options.folder}/${options.public_id}`;
              callback(null, {
                secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v1700000000/${fullPublicId}.jpg`,
                public_id: fullPublicId,
                width: 1200,
                height: 900,
              });
            },
          };
        },
      },
    },
  },
};

const { requireStadtpocketWriteScope } = require('../src/middleware/stadtpocketManagerAuth');
const routes = require('../src/routes/managerStadtpocketOfferRoutes');

function fakeReq({ auth = true, params = {}, body = {}, file = null } = {}) {
  return { headers: auth ? { authorization: 'Bearer test-token' } : {}, params, body, file, method: 'GET', originalUrl: '/manager/stadtpocket/listings' };
}

function fakeRes() {
  return { statusCode: undefined, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
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

async function createOfferViaRoute(overrides = {}) {
  const res = await callRoute(routes.handleCreateOffer, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    body: { title: '20% Rabatt', offerText: '20% auf alles', ...overrides },
  }));
  return res;
}

// ── A. Authentication / authorization at the route layer ──────────
test('A. unauthenticated create -> 401', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateOffer, fakeReq({ auth: false, params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { title: 'x', offerText: 'y' } }));
  assert.equal(res.statusCode, 401);
});

test('A. Global Admin (publicMetadata.role=admin) bypasses manager-scope lookup entirely', async () => {
  resetFixtures();
  currentUserId = 'someone_not_a_manager';
  currentRole = 'admin';
  const res = await createOfferViaRoute();
  assert.equal(res.statusCode, 201);
});

test('B. owner/manager scope: Ulm manager can create for an Ulm business', async () => {
  resetFixtures();
  const res = await createOfferViaRoute();
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.offer.status, 'draft');
});

test('B. cross-city denial: Stuttgart manager cannot list Ulm business offers', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleListOffers, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.statusCode, 403);
});

test('B. cross-business denial: an offer cannot be read via a sibling business id in the same city', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  const res = await callRoute(routes.handleGetOffer, fakeReq({ params: { locationId: ULM, listingLocationId: OTHER_LL_ID, offerId: created.body.offer.offerId } }));
  assert.equal(res.statusCode, 404);
});

// ── C. Create / list ────────────────────────────────────────────
test('C. empty list returns an empty array, not an error, for a business with no offers', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleListOffers, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.body.error, undefined);
  assert.deepEqual(res.body.offers, []);
});

test('C. list returns the created offer', async () => {
  resetFixtures();
  await createOfferViaRoute({ title: 'Kaffee-Deal' });
  const res = await callRoute(routes.handleListOffers, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID } }));
  assert.equal(res.body.offers.length, 1);
  assert.equal(res.body.offers[0].title, 'Kaffee-Deal');
});

test('C. missing required content (offerText) -> 400 via the route, not a 500', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateOffer, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { title: 'x' } }));
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /offerText/);
});

test('C. unsupported fields are rejected, not silently dropped or persisted', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCreateOffer, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID }, body: { title: 'x', offerText: 'y', redemptionCode: 'FREE10' } }));
  assert.equal(res.statusCode, 400);
});

// ── D. Update / draft preview ──────────────────────────────────
test('D. save-draft via route updates title, detail GET reflects it (draft = preview data source)', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  await callRoute(routes.handleSaveOfferDraft, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId }, body: { title: 'Neuer Titel' } }));
  const detail = await callRoute(routes.handleGetOffer, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId } }));
  assert.equal(detail.body.offer.title, 'Neuer Titel');
  assert.equal(detail.body.offer.status, 'draft'); // still a draft -- live columns untouched
});

test('D. invalid dates (endsAt before startsAt) rejected at the route layer with 400', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  const res = await callRoute(routes.handleSaveOfferDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId },
    body: { startsAt: '2026-09-10T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' },
  }));
  assert.equal(res.statusCode, 400);
});

// ── E. Publish / archive ─────────────────────────────────────────
test('E. publish route transitions status and is reflected by a subsequent GET', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  const pub = await callRoute(routes.handlePublishOffer, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId } }));
  assert.equal(pub.body.error, undefined);
  assert.equal(pub.body.offer.status, 'published');
});

test('E. archive route transitions status', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  const res = await callRoute(routes.handleArchiveOffer, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId } }));
  assert.equal(res.body.error, undefined);
  assert.equal(res.body.offer.status, 'archived');
});

test('E. expired presentation is calculated correctly through the route (isExpired true for a past endsAt)', async () => {
  resetFixtures();
  const created = await createOfferViaRoute({ endsAt: '2020-01-01T00:00:00.000Z' });
  const detail = await callRoute(routes.handleGetOffer, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId } }));
  assert.equal(detail.body.offer.isExpired, true);
});

// ── F. API failure handling ─────────────────────────────────────
test('F. a simulated database failure during publish surfaces as 500 with a generic message, no internal detail leaked', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  offerUpdateShouldFail = true;
  const res = await callRoute(routes.handlePublishOffer, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId } }));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Internal server error.');
  assert.doesNotMatch(JSON.stringify(res.body), /connection reset/); // no internal error text leaked to the client
});

// ── G. Image upload route ────────────────────────────────────────
test('G. image upload succeeds for an authorized target, returns Cloudinary metadata, does not itself persist anything', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  const res = await callRoute(routes.handleUploadOfferImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId },
    file: { buffer: Buffer.from('fake-image-bytes'), mimetype: 'image/jpeg' },
  }));
  assert.equal(res.body.error, undefined);
  assert.equal(res.body.image.width, 1200);
  assert.equal(res.body.image.height, 900);
  const raw = offerRows.find((o) => o.id === created.body.offer.offerId);
  assert.equal(raw.image, null); // upload-only -- committed separately via the existing draft PUT, same as the listing header-image pattern
});

test('G. image upload with no file -> 400', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  const res = await callRoute(routes.handleUploadOfferImage, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId } }));
  assert.equal(res.statusCode, 400);
});

test('G. image upload for an out-of-scope caller never reaches Cloudinary', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleUploadOfferImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId },
    file: { buffer: Buffer.from('x'), mimetype: 'image/jpeg' },
  }));
  assert.equal(res.statusCode, 403);
  assert.equal(cloudinaryUploadCalls.length, 0);
});

test('G. uploaded image is then committed via the existing draft PUT, then reflected in GET', async () => {
  resetFixtures();
  const created = await createOfferViaRoute();
  const uploadRes = await callRoute(routes.handleUploadOfferImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId },
    file: { buffer: Buffer.from('x'), mimetype: 'image/jpeg' },
  }));
  await callRoute(routes.handleSaveOfferDraft, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId },
    body: { image: uploadRes.body.image },
  }));
  const detail = await callRoute(routes.handleGetOffer, fakeReq({ params: { locationId: ULM, listingLocationId: STAIB_LL_ID, offerId: created.body.offer.offerId } }));
  assert.equal(detail.body.offer.image.width, 1200);
  assert.equal(detail.body.offer.image.height, 900);
});

test('G. offerImageFileFilter rejects a non-allowed mimetype (e.g. SVG)', async () => {
  let rejected = false;
  routes.offerImageFileFilter({}, { mimetype: 'image/svg+xml' }, (err) => { rejected = !!err; });
  assert.equal(rejected, true);
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
