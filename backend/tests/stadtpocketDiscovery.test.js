// ============================================================
// stadtpocketDiscovery.test.js — Phase 1H.2 (AI Business Discovery).
// Mocked-Prisma/Clerk, injectable-fetch tests for
// stadtpocketDiscoveryService.js and managerStadtpocketDiscoveryRoutes.js.
// No real network call, no real Google Places request, no real DB call
// -- same require.cache pre-seeding pattern as
// tests/stadtpocketManagerWrite.test.js.
//
// Run: node tests/stadtpocketDiscovery.test.js
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
let locationRows = [];
let listingLocationRows = []; // for checkForDuplicateListing's own read

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
    {
      id: 'll_staib', locationId: ULM, address: 'Platzgasse 2-4, 89073 Ulm', phone: '0731 8800911', website: 'https://www.baeckerei-staib.de/',
      publicationStatus: 'published',
      listing: { id: 'listing_staib', name: 'Bäckerei Staib', slug: 'baeckerei-staib' },
    },
    {
      id: 'll_draft_gym', locationId: ULM, address: 'Teststraße 5, Ulm', phone: null, website: null,
      publicationStatus: 'draft',
      listing: { id: 'listing_draft_gym', name: 'FitZone Ulm Draft', slug: 'fitzone-ulm-draft' },
    },
  ];
  tokenValid = true;
  currentUserId = 'ulm_manager';
  currentRole = 'staff';
  // A fake, obviously-non-functional key -- every test in this file
  // uses an injected fetchImpl (or overrides global.fetch), so this
  // value is NEVER sent anywhere real; it exists only so
  // callGooglePlacesTextSearch's "is a credential configured at all"
  // check passes, letting tests exercise the actual request/response
  // handling instead of short-circuiting to NOT_CONFIGURED. Test 17
  // explicitly deletes it to test the real not-configured path.
  process.env.GOOGLE_PLACES_API_KEY = 'test-fake-key-not-real';
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
    findUnique: async ({ where }) => {
      const row = locationRows.find((l) => l.id === where.id);
      return row ? { name: row.name } : null;
    },
  },
  stadtPocketListingLocation: {
    findMany: async ({ where }) => listingLocationRows.filter((r) => r.locationId === where.locationId).map((r) => ({ ...r, listing: { ...r.listing } })),
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

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
      users: { getUser: async (id) => ({ id, publicMetadata: { role: currentRole } }) },
    }),
  },
};

const { requireStadtpocketWriteScope } = require('../src/middleware/stadtpocketManagerAuth');
const routes = require('../src/routes/managerStadtpocketDiscoveryRoutes');
const discoveryService = require('../src/services/stadtpocketDiscoveryService');
const {
  discoverBusinesses,
  StadtpocketDiscoveryError,
  PROVIDER_STATUS,
  validateCategory,
  validateQuantity,
  toCandidate,
  normalizeForDedupe,
  extractAddressComponent,
} = discoveryService;

// ── Fake Google Places (New) Text Search responses ──────────────────
function place(id, name, address, lat, lng, types, extraAddressComponents = []) {
  return {
    id,
    displayName: { text: name, languageCode: 'de' },
    formattedAddress: address,
    location: { latitude: lat, longitude: lng },
    types: types || ['gym'],
    addressComponents: [
      { longText: 'Ulm', shortText: 'Ulm', types: ['locality'] },
      { longText: '89073', shortText: '89073', types: ['postal_code'] },
      ...extraAddressComponents,
    ],
  };
}

const TEN_ULM_FITNESS_PLACES = [
  place('ChIJ001', 'FitZone Ulm', 'Bahnhofstr. 1, 89073 Ulm', 48.40, 9.99, ['gym']),
  place('ChIJ002', 'McFIT Ulm Mitte', 'Neue Str. 12, 89073 Ulm', 48.41, 9.98, ['gym']),
  place('ChIJ003', 'McFIT Ulm West', 'Blaubeurer Str. 44, 89073 Ulm', 48.39, 9.95, ['gym']),
  place('ChIJ004', 'CrossFit Ulm', 'Olgastr. 3, 89073 Ulm', 48.398, 9.991, ['gym']),
  place('ChIJ005', 'Yoga Studio Ulm', 'Hirschstr. 8, 89073 Ulm', 48.397, 9.993, ['yoga_studio']),
  place('ChIJ006', 'Boxclub Ulm', 'Frauenstr. 20, 89073 Ulm', 48.396, 9.994, ['gym']),
  place('ChIJ007', 'Pilates Ulm', 'Karlstr. 9, 89073 Ulm', 48.395, 9.992, ['gym']),
  place('ChIJ008', 'Fitness First Ulm', 'Münsterplatz 4, 89073 Ulm', 48.399, 9.99, ['gym']),
  place('ChIJ009', 'Kraftwerk Gym', 'Wengengasse 2, 89073 Ulm', 48.394, 9.989, ['gym']),
  place('ChIJ010', 'Ulmer Sportstudio', 'Zeughausgasse 5, 89073 Ulm', 48.393, 9.988, ['gym']),
];

function fetchImplReturning(places, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    json: async () => ({ places }),
  });
}

function fetchImplThrowing() {
  return async () => { throw new Error('simulated network failure'); };
}

// ── Test helpers (route layer) ──────────────────────────────────────
function fakeReq({ auth = true, params = {}, body = {} } = {}) {
  return {
    headers: auth ? { authorization: 'Bearer test-token' } : {},
    params,
    body,
    method: 'POST',
    originalUrl: '/manager/stadtpocket/listings/:locationId/discover',
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
// ── 1. Happy path: Ulm + Fitness + 10 -> normalized candidates ──────
test('1. Ulm + Fitness + 10 produces normalized candidates from a mocked provider response', async () => {
  resetFixtures();
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    quantity: 10,
    fetchImpl: fetchImplReturning(TEN_ULM_FITNESS_PLACES),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.candidates.length, 10);
  const first = result.candidates[0];
  assert.equal(first.name, 'FitZone Ulm');
  assert.equal(first.source, 'google-places');
  assert.equal(first.sourceId, 'ChIJ001');
  assert.equal(first.website, null);
  assert.equal(first.city, 'Ulm');
  assert.equal(first.postalCode, '89073');
  assert.deepEqual(first.coordinates, { latitude: 48.40, longitude: 9.99 });
  assert.equal(first.category, 'gym');
});

// ── 2. quantity defaults ─────────────────────────────────────────────
test('2. quantity defaults to 10 when omitted', () => {
  assert.equal(validateQuantity(undefined), 10);
  assert.equal(validateQuantity(null), 10);
});

// ── 3/4. quantity bounds ─────────────────────────────────────────────
test('3. quantity > 20 rejected', () => {
  assert.throws(() => validateQuantity(21), StadtpocketDiscoveryError);
});
test('4. quantity < 1 rejected', () => {
  assert.throws(() => validateQuantity(0), StadtpocketDiscoveryError);
});
test('4b. non-integer quantity rejected', () => {
  assert.throws(() => validateQuantity(3.5), StadtpocketDiscoveryError);
});

// ── 5. empty category rejected ───────────────────────────────────────
test('5. empty category rejected', () => {
  assert.throws(() => validateCategory(''), StadtpocketDiscoveryError);
  assert.throws(() => validateCategory('   '), StadtpocketDiscoveryError);
  assert.throws(() => validateCategory(undefined), StadtpocketDiscoveryError);
});

// ── 6. provider sourceId preserved ───────────────────────────────────
test('6. provider sourceId is preserved exactly on the candidate', () => {
  const c = toCandidate(place('ChIJ999', 'Test Gym', 'Teststr. 1, Ulm', 48.4, 9.99, ['gym']));
  assert.equal(c.sourceId, 'ChIJ999');
});

// ── 7. duplicate provider results removed (same sourceId) ───────────
test('7. duplicate provider results (identical sourceId) are removed', async () => {
  resetFixtures();
  const places = [
    place('ChIJ001', 'FitZone Ulm', 'Bahnhofstr. 1, 89073 Ulm', 48.40, 9.99, ['gym']),
    place('ChIJ001', 'FitZone Ulm', 'Bahnhofstr. 1, 89073 Ulm', 48.40, 9.99, ['gym']), // exact repeat
  ];
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning(places),
  });
  assert.equal(result.candidates.length, 1);
});

// ── 8. normalized name/address duplicate removed ────────────────────
test('8. normalized name/address duplicate (different sourceId) is removed', async () => {
  resetFixtures();
  const places = [
    place('ChIJ100', 'FitZone   Ulm', 'Bahnhofstr. 1, 89073 Ulm', 48.40, 9.99, ['gym']),
    place('ChIJ101', 'fitzone ulm', 'bahnhofstr. 1, 89073 ulm', 48.40, 9.99, ['gym']),
  ];
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning(places),
  });
  assert.equal(result.candidates.length, 1);
});

test('8b. two legitimate same-brand locations at DIFFERENT addresses both survive (no chain consolidation)', async () => {
  resetFixtures();
  const places = [
    place('ChIJ002', 'McFIT Ulm Mitte', 'Neue Str. 12, 89073 Ulm', 48.41, 9.98, ['gym']),
    place('ChIJ003', 'McFIT Ulm West', 'Blaubeurer Str. 44, 89073 Ulm', 48.39, 9.95, ['gym']),
  ];
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning(places),
  });
  assert.equal(result.candidates.length, 2);
});

// ── 9. duplicate service called for candidates ───────────────────────
test('9. the existing duplicate service is actually invoked per candidate', async () => {
  resetFixtures();
  const places = [place('ChIJ001', 'FitZone Ulm', 'Bahnhofstr. 1, 89073 Ulm', 48.40, 9.99, ['gym'])];
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning(places),
  });
  assert.notEqual(result.candidates[0].duplicateStatus, null);
});

// ── 10. NEW status returned correctly ────────────────────────────────
test('10. a genuinely new business gets duplicateStatus NEW', async () => {
  resetFixtures();
  const places = [place('ChIJ777', 'Nagelneues Fitnessstudio', 'Irgendwo 1, Ulm', 48.4, 9.99, ['gym'])];
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning(places),
  });
  assert.equal(result.candidates[0].duplicateStatus, 'NEW');
});

// ── 11. existing draft detected ──────────────────────────────────────
test('11. a discovered candidate matching an existing DRAFT is flagged ALREADY_DRAFT', async () => {
  resetFixtures();
  const places = [place('ChIJ555', 'FitZone Ulm Draft', 'Teststraße 5, Ulm', 48.4, 9.99, ['gym'])];
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning(places),
  });
  assert.equal(result.candidates[0].duplicateStatus, 'ALREADY_DRAFT');
});

// ── 12. existing published listing detected ──────────────────────────
test('12. a discovered candidate matching an existing PUBLISHED listing is flagged ALREADY_PUBLISHED', async () => {
  resetFixtures();
  const places = [place('ChIJ556', 'Bäckerei Staib', 'Platzgasse 2-4, 89073 Ulm', 48.4, 9.99, ['bakery'])];
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning(places),
  });
  assert.equal(result.candidates[0].duplicateStatus, 'ALREADY_PUBLISHED');
});

// ── 13. wrong-city manager rejected (route layer) ────────────────────
test('13. Stuttgart manager cannot run an Ulm discovery request', async () => {
  resetFixtures();
  currentUserId = 'stuttgart_manager';
  const res = await callRoute(routes.handleDiscover, fakeReq({ params: { locationId: ULM }, body: { category: 'Fitness', quantity: 10 } }));
  assert.equal(res.statusCode, 403);
});

// ── 14. unauthenticated request rejected ──────────────────────────────
test('14. unauthenticated discovery request -> 401', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleDiscover, fakeReq({ auth: false, params: { locationId: ULM }, body: { category: 'Fitness' } }));
  assert.equal(res.statusCode, 401);
});

// ── 15. Global Admin permitted ────────────────────────────────────────
test('15. Global Admin can run a discovery request for any city', async () => {
  resetFixtures();
  currentUserId = 'platform_admin_1';
  currentRole = 'admin';
  const originalFetch = global.fetch;
  global.fetch = fetchImplReturning([place('ChIJ001', 'FitZone Ulm', 'Bahnhofstr. 1, Ulm', 48.4, 9.99, ['gym'])]);
  try {
    const res = await callRoute(routes.handleDiscover, fakeReq({ params: { locationId: ULM }, body: { category: 'Fitness', quantity: 5 } }));
    assert.equal(res.statusCode, undefined);
    assert.equal(res.body.status, 'ok');
  } finally {
    global.fetch = originalFetch;
  }
});

// ── 16. provider unavailable handled safely ───────────────────────────
test('16. provider network failure returns provider-unavailable, no throw', async () => {
  resetFixtures();
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplThrowing(),
  });
  assert.equal(result.status, PROVIDER_STATUS.UNAVAILABLE);
  assert.deepEqual(result.candidates, []);
});

test('16b. provider non-ok HTTP response returns provider-unavailable', async () => {
  resetFixtures();
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning([], { ok: false, status: 500 }),
  });
  assert.equal(result.status, PROVIDER_STATUS.UNAVAILABLE);
});

// ── 17. provider not configured handled safely ────────────────────────
test('17. missing GOOGLE_PLACES_API_KEY returns provider-not-configured, no throw, no fetch attempted', async () => {
  resetFixtures();
  const originalKey = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  let fetchCalled = false;
  try {
    const result = await discoverBusinesses({
      locationId: ULM,
      scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
      category: 'Fitness',
      fetchImpl: async () => { fetchCalled = true; return { ok: true, json: async () => ({ places: [] }) }; },
    });
    assert.equal(result.status, PROVIDER_STATUS.NOT_CONFIGURED);
    assert.deepEqual(result.candidates, []);
    assert.equal(fetchCalled, false);
  } finally {
    if (originalKey !== undefined) process.env.GOOGLE_PLACES_API_KEY = originalKey;
  }
});

// ── 18. empty provider result returns [] rather than fake data ────────
test('18. zero results from the provider returns an honest empty candidate list', async () => {
  resetFixtures();
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning([]),
  });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.candidates, []);
});

// ── 19. no database writes occur during discovery ──────────────────────
test('19. discovery performs no database writes (mock exposes no write method for it to call)', async () => {
  resetFixtures();
  // mockPrisma above defines ONLY findMany/findUnique across every
  // model it exposes -- no create/update/delete exists at all, so any
  // attempted write would throw "is not a function," not silently
  // succeed. This test simply proves a full discovery run completes
  // without ever reaching for one.
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: fetchImplReturning(TEN_ULM_FITNESS_PLACES),
  });
  assert.equal(result.status, 'ok');
});

// ── 20/21/22. no Phase 1G research / Anthropic / Firecrawl call ───────
test('20/21/22. discovery never requires or touches the Phase 1G research/Anthropic/Firecrawl modules', () => {
  // stadtpocketDiscoveryService.js's own require graph -- proven
  // statically, not just by absence of a mock: it depends on
  // stadtpocketManagerService.js (authorizeLocationAccess) and
  // stadtpocketDuplicateService.js (checkForDuplicateListing) only.
  const servicePath = resolve('src', 'services', 'stadtpocketDiscoveryService.js');
  const src = require('fs').readFileSync(servicePath, 'utf8');
  // Only actual require(...) calls count -- this file's own header
  // comment explains the discovery-vs-research distinction in prose and
  // legitimately mentions "Firecrawl"/"Anthropic" by name while doing
  // so, which must not itself trip this check.
  const requireLines = src.split('\n').filter((line) => /require\(/.test(line));
  const requiredText = requireLines.join('\n');
  assert.equal(/stadtpocketResearchService/.test(requiredText), false);
  assert.equal(/stadtpocketWebResearchService/.test(requiredText), false);
  assert.equal(/stadtpocketAiExtractionService/.test(requiredText), false);
  assert.equal(/@anthropic-ai\/sdk/.test(requiredText), false);
  assert.equal(/firecrawl/i.test(requiredText), false);
});

// ── City scoping never trusts frontend input ───────────────────────────
test('city name always comes from the server-resolved Location row, never from the request body', async () => {
  resetFixtures();
  let capturedBody = null;
  const result = await discoverBusinesses({
    locationId: ULM,
    scope: { isGlobalAdmin: false, locationIds: [ULM], userId: 'ulm_manager' },
    category: 'Fitness',
    fetchImpl: async (url, opts) => { capturedBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ places: [] }) }; },
  });
  assert.equal(result.status, 'ok');
  assert.equal(capturedBody.textQuery, 'Fitness in Ulm, Germany');
});

test('unresolvable locationId -> 404, not a silently broken query', async () => {
  resetFixtures();
  currentUserId = 'platform_admin_1';
  currentRole = 'admin';
  await assert.rejects(
    () => discoverBusinesses({
      locationId: 'loc_does_not_exist',
      scope: { isGlobalAdmin: true, userId: 'platform_admin_1' },
      category: 'Fitness',
      fetchImpl: fetchImplReturning([]),
    }),
    (err) => err instanceof StadtpocketDiscoveryError && err.status === 404
  );
});

// ── FieldMask / SKU tier sanity (Step 4) ────────────────────────────────
test('FieldMask requests only Pro-tier fields, never websiteUri/nationalPhoneNumber (Enterprise SKU)', () => {
  assert.equal(discoveryService.FIELD_MASK.includes('websiteUri'), false);
  assert.equal(discoveryService.FIELD_MASK.includes('nationalPhoneNumber'), false);
  assert.equal(discoveryService.FIELD_MASK.includes('places.displayName'), true);
  assert.equal(discoveryService.FIELD_MASK.includes('places.formattedAddress'), true);
});

// ── extractAddressComponent ─────────────────────────────────────────────
test('extractAddressComponent returns null when the type is absent', () => {
  assert.equal(extractAddressComponent([{ longText: 'x', types: ['route'] }], 'postal_code'), null);
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
