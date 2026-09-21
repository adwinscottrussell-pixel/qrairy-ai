// ============================================================
// stadtpocketImageDiscovery.test.js — Phase 1H.4.3 (Business Hero
// Image Selection in AI Review). Mocked-Prisma/Clerk/Cloudinary,
// injectable-fetch tests for stadtpocketImageDiscoveryService.js and
// its two new routes on managerStadtpocketListingRoutes.js. No real
// network call, no real Firecrawl/Cloudinary call, no real Google
// Places/Anthropic call anywhere in this file -- Phase 1G's own
// research pipeline is never touched or required here.
//
// Run: node tests/stadtpocketImageDiscovery.test.js
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
process.env.FIRECRAWL_API_KEY = 'test-firecrawl-key';

const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const NET1 = 'net_stadtpocket';
const KIESER_LL_ID = 'll_kieser_ulm';
const KIESER_LISTING_ID = 'listing_kieser';

let networkMemberRows = [];
let locationRows = [];
let listingRows = [];
let listingLocationRows = [];

let tokenValid = true;
let currentUserId = 'ulm_manager';
let currentRole = 'staff';

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
      id: KIESER_LISTING_ID, slug: 'kieser-ulm', name: 'Kieser Ulm', category: 'Fitness',
      subCategory: null, tags: [], shortDescription: 'Fitnessstudio.', longDescription: null,
      headerImage: null, businessId: null, createdBy: 'ulm_manager', draftData: null,
      createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    },
  ];
  listingLocationRows = [
    {
      id: KIESER_LL_ID, listingId: KIESER_LISTING_ID, locationId: ULM,
      address: 'Syrlinstraße 35, 89073 Ulm', latitude: 48.39, longitude: 9.99,
      phone: null, website: 'https://www.kieser.com/de-de/studios/ulm/', hours: null,
      publicationStatus: 'draft', publishedAt: null,
      businessLocationId: null, draftData: null,
      createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    },
  ];
  tokenValid = true;
  currentUserId = 'ulm_manager';
  currentRole = 'staff';
  cloudinaryUploadCalls = [];
  cloudinaryUploadShouldFail = false;
}

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
  },
  stadtPocketListingLocation: {
    findUnique: async ({ where, include }) => {
      const row = listingLocationRows.find((ll) => ll.id === where.id);
      if (!row) return null;
      return include && include.listing ? attachListing(row) : row;
    },
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
const {
  discoverWebsiteImageCandidates,
  copyWebsiteImageToCloudinary,
  StadtpocketImageError,
  DISCOVERY_STATUS,
  MAX_CANDIDATES,
  extractRawImageUrls,
  resolveAndFilterImageUrl,
} = require('../src/services/stadtpocketImageDiscoveryService');

function fakeReq({ auth = true, params = {}, body = {} } = {}) {
  return {
    headers: auth ? { authorization: 'Bearer test-token' } : {},
    params,
    body,
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

const KIESER_URL = 'https://www.kieser.com/de-de/studios/ulm/';

function fetchImplForPage(markdown, { ok = true, status = 200 } = {}) {
  return async () => ({ ok, status, json: async () => ({ data: { markdown } }) });
}
function fetchImplThrowing() {
  return async () => { throw new Error('simulated network failure'); };
}
function fetchImplForImage({ ok = true, contentType = 'image/jpeg', bytes = 2048 } = {}) {
  return async () => ({
    ok,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── discoverWebsiteImageCandidates: parsing/filtering/dedup/cap ────
test('1. markdown images (![alt](url)) are extracted as candidates', async () => {
  resetFixtures();
  const md = `# Kieser Ulm\n![Studio hero](${KIESER_URL}img/hero-studio.jpg)\nSome text.`;
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplForPage(md) });
  assert.equal(result.status, 'ok');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, `${KIESER_URL}img/hero-studio.jpg`);
  assert.equal(result.candidates[0].sourceUrl, KIESER_URL);
});

test('2. raw <img src="..."> is also extracted (Firecrawl markdown-conversion fallback)', async () => {
  resetFixtures();
  const md = `<div><img src="${KIESER_URL}img/gym-floor.png" alt="Gym floor"></div>`;
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplForPage(md) });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, `${KIESER_URL}img/gym-floor.png`);
});

test('3. relative image URLs resolve against the page they were found on', async () => {
  resetFixtures();
  const md = `![Studio](/assets/studio-ulm.webp)`;
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplForPage(md) });
  assert.equal(result.candidates[0].url, 'https://www.kieser.com/assets/studio-ulm.webp');
});

test('4. favicons/sprites/tracking pixels/dimension-suffixed thumbnails are excluded (reuses looksLikeUselessImageCandidate)', async () => {
  resetFixtures();
  const md = [
    `![](${KIESER_URL}favicon.png)`,
    `![](${KIESER_URL}img/sprite.png)`,
    `![](${KIESER_URL}img/pixel.png)`,
    `![](${KIESER_URL}img/thumb-180x180.jpg)`,
    `![real](${KIESER_URL}img/studio-hero.jpg)`,
  ].join('\n');
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplForPage(md) });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, `${KIESER_URL}img/studio-hero.jpg`);
});

test('5. SVG images are never surfaced as a hero-image candidate', async () => {
  resetFixtures();
  const md = `![icon](${KIESER_URL}img/logo.svg)`;
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplForPage(md) });
  assert.equal(result.candidates.length, 0);
});

test('6. duplicate URLs are deduped', async () => {
  resetFixtures();
  const md = `![a](${KIESER_URL}img/hero.jpg)\n![b](${KIESER_URL}img/hero.jpg)`;
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplForPage(md) });
  assert.equal(result.candidates.length, 1);
});

test('7. capped to MAX_CANDIDATES even if the page has more real images', async () => {
  resetFixtures();
  const md = Array.from({ length: 20 }, (_, i) => `![img${i}](${KIESER_URL}img/photo-${i}.jpg)`).join('\n');
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplForPage(md) });
  assert.equal(result.candidates.length, MAX_CANDIDATES);
  assert.ok(MAX_CANDIDATES >= 3 && MAX_CANDIDATES <= 6, 'must stay within the specified small-gallery range');
});

test('8. a page with zero real images returns an honest empty result, never fabricated', async () => {
  resetFixtures();
  const md = `![](${KIESER_URL}favicon.ico)\nNo real photos here.`;
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplForPage(md) });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.candidates, []);
});

test('9. an invalid/unsafe website URL is rejected before any fetch, never candidates', async () => {
  resetFixtures();
  const result = await discoverWebsiteImageCandidates('http://127.0.0.1:8080/', { fetchImpl: fetchImplForPage('![](x.jpg)') });
  assert.notEqual(result.status, 'ok');
  assert.deepEqual(result.candidates, []);
});

test('10. Firecrawl/provider failure returns a controlled status, never candidates', async () => {
  resetFixtures();
  const result = await discoverWebsiteImageCandidates(KIESER_URL, { fetchImpl: fetchImplThrowing() });
  assert.notEqual(result.status, 'ok');
  assert.deepEqual(result.candidates, []);
});

// ── copyWebsiteImageToCloudinary ────────────────────────────────────
test('11. a valid selected image URL is fetched and uploaded via the EXISTING Cloudinary upload path', async () => {
  resetFixtures();
  const imageUrl = `${KIESER_URL}img/hero-studio.jpg`;
  const result = await copyWebsiteImageToCloudinary(imageUrl, KIESER_LISTING_ID, { fetchImpl: fetchImplForImage() });
  assert.equal(cloudinaryUploadCalls.length, 1);
  assert.equal(cloudinaryUploadCalls[0].folder, 'stadtpocket-headers');
  assert.ok(result.url.startsWith('https://res.cloudinary.com/test-cloud/'));
  assert.equal(result.width, 1600);
  assert.equal(result.height, 900);
});

test('12. an unsafe/private-target URL is rejected before any fetch or Cloudinary call', async () => {
  resetFixtures();
  await assert.rejects(
    () => copyWebsiteImageToCloudinary('http://127.0.0.1/x.jpg', KIESER_LISTING_ID, { fetchImpl: fetchImplForImage() }),
    (err) => err instanceof StadtpocketImageError && err.status === 400
  );
  assert.equal(cloudinaryUploadCalls.length, 0);
});

test('13. a non-image content-type is rejected, never uploaded', async () => {
  resetFixtures();
  await assert.rejects(
    () => copyWebsiteImageToCloudinary(`${KIESER_URL}img/x.jpg`, KIESER_LISTING_ID, { fetchImpl: fetchImplForImage({ contentType: 'text/html' }) }),
    StadtpocketImageError
  );
  assert.equal(cloudinaryUploadCalls.length, 0);
});

test('14. an oversized image is rejected before upload', async () => {
  resetFixtures();
  await assert.rejects(
    () => copyWebsiteImageToCloudinary(`${KIESER_URL}img/huge.jpg`, KIESER_LISTING_ID, { fetchImpl: fetchImplForImage({ bytes: 10 * 1024 * 1024 }) }),
    StadtpocketImageError
  );
  assert.equal(cloudinaryUploadCalls.length, 0);
});

test('15. a network failure fetching the image is a controlled error, not a crash', async () => {
  resetFixtures();
  await assert.rejects(() => copyWebsiteImageToCloudinary(`${KIESER_URL}img/x.jpg`, KIESER_LISTING_ID, { fetchImpl: fetchImplThrowing() }), StadtpocketImageError);
});

test('16. a Cloudinary upload failure is a controlled error, not a crash', async () => {
  resetFixtures();
  cloudinaryUploadShouldFail = true;
  await assert.rejects(() => copyWebsiteImageToCloudinary(`${KIESER_URL}img/x.jpg`, KIESER_LISTING_ID, { fetchImpl: fetchImplForImage() }), StadtpocketImageError);
});

// ── route: discover (city-scoped, no listingLocationId needed) ─────
test('17. unauthenticated discovery request -> 401', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleDiscoverImageCandidates, fakeReq({ auth: false, params: { locationId: ULM }, body: { websiteUrl: KIESER_URL } }));
  assert.equal(res.statusCode, 401);
});

test('18. Stuttgart manager cannot discover images for an Ulm business website', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleDiscoverImageCandidates, fakeReq({ params: { locationId: ULM }, body: { websiteUrl: KIESER_URL } }));
  assert.equal(res.statusCode, 403);
});

test('19. missing websiteUrl -> 400', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleDiscoverImageCandidates, fakeReq({ params: { locationId: ULM }, body: {} }));
  assert.equal(res.statusCode, 400);
});

test('20. authorized Ulm manager can discover candidates for a real request', async () => {
  resetFixtures();
  const originalFetch = global.fetch;
  global.fetch = fetchImplForPage(`![](${KIESER_URL}img/studio.jpg)`);
  try {
    const res = await callRoute(routes.handleDiscoverImageCandidates, fakeReq({ params: { locationId: ULM }, body: { websiteUrl: KIESER_URL } }));
    assert.equal(res.statusCode, undefined);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.candidates.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

// ── route: copy-selected-image (listing-scoped, mirrors header-image upload auth) ──
test('21. unauthenticated copy request -> 401', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCopyWebsiteImage, fakeReq({ auth: false, params: { locationId: ULM, listingLocationId: KIESER_LL_ID }, body: { url: `${KIESER_URL}img/x.jpg` } }));
  assert.equal(res.statusCode, 401);
});

test('22. Stuttgart manager cannot copy an image into an Ulm business', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleCopyWebsiteImage, fakeReq({ params: { locationId: ULM, listingLocationId: KIESER_LL_ID }, body: { url: `${KIESER_URL}img/x.jpg` } }));
  assert.equal(res.statusCode, 403);
  assert.equal(cloudinaryUploadCalls.length, 0);
});

test('23. nonexistent listingLocationId -> 404', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCopyWebsiteImage, fakeReq({ params: { locationId: ULM, listingLocationId: 'll_does_not_exist' }, body: { url: `${KIESER_URL}img/x.jpg` } }));
  assert.equal(res.statusCode, 404);
});

test('24. missing url -> 400', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleCopyWebsiteImage, fakeReq({ params: { locationId: ULM, listingLocationId: KIESER_LL_ID }, body: {} }));
  assert.equal(res.statusCode, 400);
});

test('25. authorized Ulm manager can copy a selected candidate into the correct listing', async () => {
  resetFixtures();
  const originalFetch = global.fetch;
  global.fetch = fetchImplForImage();
  try {
    const res = await callRoute(routes.handleCopyWebsiteImage, fakeReq({ params: { locationId: ULM, listingLocationId: KIESER_LL_ID }, body: { url: `${KIESER_URL}img/hero.jpg` } }));
    assert.equal(res.statusCode, undefined);
    assert.ok(res.body.headerImage.url.startsWith('https://res.cloudinary.com/'));
    assert.equal(cloudinaryUploadCalls[0].public_id.startsWith(`${KIESER_LISTING_ID}-`), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('26. this route never writes to the draft/live listing itself -- upload-only, same posture as the existing header-image upload route', async () => {
  resetFixtures();
  const originalFetch = global.fetch;
  global.fetch = fetchImplForImage();
  try {
    await callRoute(routes.handleCopyWebsiteImage, fakeReq({ params: { locationId: ULM, listingLocationId: KIESER_LL_ID }, body: { url: `${KIESER_URL}img/hero.jpg` } }));
    const listing = listingRows.find((l) => l.id === KIESER_LISTING_ID);
    assert.equal(listing.headerImage, null); // untouched -- frontend must PUT .../draft separately, exactly like manual upload
  } finally {
    global.fetch = originalFetch;
  }
});

// ── pure helpers ─────────────────────────────────────────────────────
test('extractRawImageUrls finds both markdown and raw <img> syntax in one pass', () => {
  const content = `![a](https://x.test/a.jpg) and <img src="https://x.test/b.png">`;
  assert.deepEqual(extractRawImageUrls(content), ['https://x.test/a.jpg', 'https://x.test/b.png']);
});
test('resolveAndFilterImageUrl rejects non-http(s) and non-raster paths, but resolves a valid relative raster path', () => {
  assert.equal(resolveAndFilterImageUrl('javascript:alert(1)', KIESER_URL), null);
  assert.equal(resolveAndFilterImageUrl('/img/icon.svg', KIESER_URL), null);
  assert.equal(resolveAndFilterImageUrl('/img/real.jpg', KIESER_URL), new URL('/img/real.jpg', KIESER_URL).toString());
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
