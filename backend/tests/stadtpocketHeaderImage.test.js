// ============================================================
// stadtpocketHeaderImage.test.js — mocked-Prisma/Clerk/Cloudinary tests
// for Phase 6D.2: StadtPocket business header/hero image upload.
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the exact same pattern as
// stadtpocketManagerWrite.test.js (which this reuses the mock shape
// from). Prisma, @clerk/backend, and cloudinary are all mocked by
// pre-seeding require.cache before the routes/services are required, so
// no real DB, network, or Cloudinary call is ever made.
//
// Run: node tests/stadtpocketHeaderImage.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');
const cloudinaryPath = require.resolve('cloudinary');

// Real Cloudinary cloud name is never needed for a mocked upload -- this
// is only used so isTrustedStadtPocketHeaderImage's own URL-shape check
// (stadtPocketHeaderImageService.js) has something real to compare
// against, matching exactly what the mocked upload below returns.
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';

// ── Fixture data (mutable, reset per test) ──────────────────────
const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const NET1 = 'net_stadtpocket';
const STAIB_LL_ID = 'll_staib_ulm';
const STAIB_LISTING_ID = 'listing_staib';

let networkMemberRows = [];
let locationRows = [];
let listingRows = [];
let listingLocationRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }

let tokenValid = true;
let currentUserId = 'ulm_manager';
let currentRole = 'staff';

// ── Cloudinary mock ─────────────────────────────────────────────
// Records every upload call's options (so tests can assert overwrite:
// false, a fresh public_id each time) and simulates a real Cloudinary
// upload response shape. cloudinaryUploadShouldFail lets one test
// exercise the failure path without a real network error.
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
  listingRows = [
    {
      id: STAIB_LISTING_ID, slug: 'baeckerei-staib', name: 'Bäckerei Staib', category: 'Essen & Trinken',
      subCategory: 'Bäckerei', tags: ['Bäckerei'], shortDescription: 'Filiale in der Platzgasse.', longDescription: null,
      headerImage: null, businessId: null, createdBy: 'ulm_manager', draftData: null,
      createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    },
  ];
  listingLocationRows = [
    {
      id: STAIB_LL_ID, listingId: STAIB_LISTING_ID, locationId: ULM,
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
  currentRole = 'staff';
  cloudinaryUploadCalls = [];
  cloudinaryUploadShouldFail = false;
}

function cloneRows(rows) { return rows.map((r) => ({ ...r })); }

function attachListing(ll) {
  const listing = listingRows.find((l) => l.id === ll.listingId);
  return { ...ll, listing };
}

let transactionShouldFailAt = null;

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
    update: async ({ where, data }) => {
      if (transactionShouldFailAt === 'listingUpdate') throw new Error('simulated database failure during listing update');
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
      return include && include.listing ? rows.map(attachListing) : rows;
    },
    findUnique: async ({ where, include }) => {
      const row = listingLocationRows.find((ll) => ll.id === where.id);
      if (!row) return null;
      return include && include.listing ? attachListing(row) : row;
    },
    update: async ({ where, data }) => {
      if (transactionShouldFailAt === 'locationUpdate') throw new Error('simulated database failure during location update');
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
      listingRows.length = 0;
      listingRows.push(...listingSnapshot);
      listingLocationRows.length = 0;
      listingLocationRows.push(...listingLocationSnapshot);
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
                width: 1600,
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
const routes = require('../src/routes/managerStadtpocketListingRoutes');
const managerService = require('../src/services/stadtpocketManagerService');
const { isTrustedStadtPocketHeaderImage } = require('../src/services/stadtPocketHeaderImageService');

// ── Test helpers ──────────────────────────────────────────────────
function fakeReq({ auth = true, params = {}, body = {}, file = null } = {}) {
  return {
    headers: auth ? { authorization: 'Bearer test-token' } : {},
    params,
    body,
    file,
    method: 'POST',
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

const FAKE_IMAGE_BUFFER = Buffer.from('fake-png-bytes');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── AUTHORIZATION ────────────────────────────────────────────────

test('1. Global Admin can upload a header image', async () => {
  resetFixtures();
  currentRole = 'admin';
  const res = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  assert.equal(res.statusCode, undefined); // 200 default (bare res.json())
  assert.ok(res.body.headerImage.url.includes('test-cloud'));
  assert.equal(res.body.headerImage.width, 1600);
  assert.equal(cloudinaryUploadCalls.length, 1);
});

test('2. Authorized City Manager can upload for their assigned city', async () => {
  resetFixtures();
  currentUserId = 'ulm_manager';
  const res = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  assert.equal(res.statusCode, undefined);
  assert.ok(res.body.headerImage.url);
});

test('3. City Manager cannot upload for another city', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  assert.equal(res.statusCode, 403);
  assert.equal(cloudinaryUploadCalls.length, 0, 'no upload must be attempted for an out-of-scope caller');
});

test('4. Ordinary authenticated user (no membership, not admin) is rejected', async () => {
  resetFixtures();
  currentUserId = 'random_user';
  currentRole = 'staff';
  networkMemberRows = [];
  const res = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  assert.equal(res.statusCode, 403);
  assert.equal(cloudinaryUploadCalls.length, 0);
});

test('5. Unauthenticated user is rejected', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    auth: false,
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  assert.equal(res.statusCode, 401);
  assert.equal(cloudinaryUploadCalls.length, 0);
});

// ── FILE VALIDATION ────────────────────────────────────────────────
// multer's own limits.fileSize enforcement (a real, already-trusted,
// stream-level mechanism) is not independently re-simulated here --
// see the Phase 6D.2 report for why. What IS directly tested is the
// exact rejection rule this route configures multer with.

test('6. Invalid file type is rejected by the configured file filter', () => {
  let cbError = null;
  let cbAccepted = null;
  routes.headerImageFileFilter({}, { mimetype: 'image/svg+xml' }, (err, accepted) => {
    cbError = err; cbAccepted = accepted;
  });
  assert.ok(cbError instanceof Error);
  assert.equal(cbAccepted, undefined);
});

test('6b. Every currently allowed type is accepted by the same filter', () => {
  for (const mimetype of routes.HEADER_IMAGE_ALLOWED_MIMETYPES) {
    let accepted = false;
    routes.headerImageFileFilter({}, { mimetype }, (err, ok) => { accepted = ok; });
    assert.equal(accepted, true, `${mimetype} should be accepted`);
  }
  assert.deepEqual(routes.HEADER_IMAGE_ALLOWED_MIMETYPES, ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  assert.ok(!routes.HEADER_IMAGE_ALLOWED_MIMETYPES.includes('image/svg+xml'), 'SVG must never be allowed');
});

test('7. Upload size limit matches the existing 5MB infrastructure convention (not invented)', () => {
  assert.equal(routes.HEADER_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
});

// ── DRAFT / PUBLISH BEHAVIOR ─────────────────────────────────────

test('8. Upload + save modifies draft state only, never the live column directly', async () => {
  resetFixtures();
  const uploadRes = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  const scope = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
  const saved = await managerService.saveDraft(ULM, STAIB_LL_ID, scope, { headerImage: uploadRes.body.headerImage });

  assert.equal(saved.headerImage.url, uploadRes.body.headerImage.url, 'editable state reflects the new draft image');
  const rawListing = listingRows.find((l) => l.id === STAIB_LISTING_ID);
  assert.equal(rawListing.headerImage, null, 'the LIVE column must remain untouched by a draft save');
  assert.ok(rawListing.draftData.headerImage.url, 'the new image lives in draftData');
});

test('9. Existing published image remains unchanged after a new draft upload', async () => {
  resetFixtures();
  const publishedImage = { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/stadtpocket-headers/old.jpg', publicId: 'stadtpocket-headers/old', width: 1600, height: 900 };
  listingRows.find((l) => l.id === STAIB_LISTING_ID).headerImage = publishedImage;

  const uploadRes = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  const scope = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
  await managerService.saveDraft(ULM, STAIB_LL_ID, scope, { headerImage: uploadRes.body.headerImage });

  const rawListing = listingRows.find((l) => l.id === STAIB_LISTING_ID);
  assert.deepEqual(rawListing.headerImage, publishedImage, 'the published image must be byte-for-byte unchanged');
  assert.notEqual(rawListing.draftData.headerImage.url, publishedImage.url, 'the draft image is a genuinely different asset');
});

test('10. Preview / editable-state returns the draft header image, not the published one', async () => {
  resetFixtures();
  const publishedImage = { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/stadtpocket-headers/old.jpg', publicId: 'stadtpocket-headers/old', width: 1600, height: 900 };
  listingRows.find((l) => l.id === STAIB_LISTING_ID).headerImage = publishedImage;

  const uploadRes = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  const scope = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
  await managerService.saveDraft(ULM, STAIB_LL_ID, scope, { headerImage: uploadRes.body.headerImage });

  const preview = await managerService.previewDraft(ULM, STAIB_LL_ID, scope);
  assert.equal(preview.headerImage.url, uploadRes.body.headerImage.url);
  assert.notEqual(preview.headerImage.url, publishedImage.url);
});

test('11. Publish promotes the draft header image onto the live column', async () => {
  resetFixtures();
  const uploadRes = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  const scope = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
  await managerService.saveDraft(ULM, STAIB_LL_ID, scope, { headerImage: uploadRes.body.headerImage });

  await managerService.publishForLocation(ULM, STAIB_LL_ID, scope);

  const rawListing = listingRows.find((l) => l.id === STAIB_LISTING_ID);
  assert.equal(rawListing.headerImage.url, uploadRes.body.headerImage.url, 'the live column now holds the promoted image');
});

test('12. Replacement never destroys or overwrites the currently published asset', async () => {
  resetFixtures();
  const publishedImage = { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/stadtpocket-headers/old.jpg', publicId: 'stadtpocket-headers/old', width: 1600, height: 900 };
  listingRows.find((l) => l.id === STAIB_LISTING_ID).headerImage = publishedImage;

  await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));

  assert.equal(cloudinaryUploadCalls.length, 1);
  assert.equal(cloudinaryUploadCalls[0].overwrite, false, 'every upload must use overwrite:false');
  assert.notEqual(cloudinaryUploadCalls[0].public_id, 'old', 'a brand-new public_id, never reusing the published asset\'s id');
  // The mocked cloudinary module intentionally has no uploader.destroy
  // function at all -- if any code path tried to call one, this test
  // (and every other test in this file) would throw, structurally
  // proving no deletion code exists yet.
});

// ── SECURITY ──────────────────────────────────────────────────────

test('13. headerImage cannot be injected via saveDraft with an arbitrary external URL', async () => {
  resetFixtures();
  const scope = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
  await assert.rejects(
    () => managerService.saveDraft(ULM, STAIB_LL_ID, scope, {
      headerImage: { url: 'https://evil.example.com/fake-business-photo.jpg', publicId: 'whatever' },
    }),
    /not a recognized StadtPocket-uploaded image/
  );
  const rawListing = listingRows.find((l) => l.id === STAIB_LISTING_ID);
  assert.equal(rawListing.draftData, null, 'the rejected value must never reach draftData');
});

test('13b. isTrustedStadtPocketHeaderImage rejects a mismatched url/publicId pair', () => {
  assert.equal(
    isTrustedStadtPocketHeaderImage('https://res.cloudinary.com/test-cloud/image/upload/v1/stadtpocket-headers/real.jpg', 'stadtpocket-headers/different-id'),
    false
  );
});

test('14. Upload response contains no secrets', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  const serialized = JSON.stringify(res.body).toLowerCase();
  assert.ok(!serialized.includes('test-secret'));
  assert.ok(!serialized.includes('api_secret'));
  assert.ok(!serialized.includes('api_key'));
  assert.deepEqual(Object.keys(res.body.headerImage).sort(), ['height', 'publicId', 'url', 'width']);
});

// ── REGRESSION ────────────────────────────────────────────────────

test('15. Existing non-image fields still save/publish correctly alongside a header image', async () => {
  resetFixtures();
  const uploadRes = await callRoute(routes.handleUploadHeaderImage, fakeReq({
    params: { locationId: ULM, listingLocationId: STAIB_LL_ID },
    file: { buffer: FAKE_IMAGE_BUFFER, mimetype: 'image/png' },
  }));
  const scope = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
  await managerService.saveDraft(ULM, STAIB_LL_ID, scope, { headerImage: uploadRes.body.headerImage });
  const saved = await managerService.saveDraft(ULM, STAIB_LL_ID, scope, { shortDescription: 'Neue Kurzbeschreibung.' });

  assert.equal(saved.shortDescription, 'Neue Kurzbeschreibung.');
  assert.equal(saved.headerImage.url, uploadRes.body.headerImage.url, 'the earlier header-image save is not clobbered by an unrelated field save');

  const published = await managerService.publishForLocation(ULM, STAIB_LL_ID, scope);
  assert.ok(published.publishedAt);
  const rawListing = listingRows.find((l) => l.id === STAIB_LISTING_ID);
  assert.equal(rawListing.shortDescription, 'Neue Kurzbeschreibung.');
  assert.equal(rawListing.headerImage.url, uploadRes.body.headerImage.url);
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
