// ============================================================
// stadtpocketPublic.test.js — mocked-Prisma tests for the Independent
// StadtPocket Listing Foundation's public read endpoints (GET
// /public/stadtpocket/cities/:citySlug/businesses[/:listingSlug]),
// including the multi-storefront public API semantics correction:
//   - list: ONE card per listing per city, never one per storefront
//   - detail: ALL published storefronts for that listing in that city,
//     nested under locations[] -- never one arbitrarily picked
//
// No test framework dependency: uses Node's built-in `assert` and a tiny
// inline runner, following the same pattern as
// tests/cityBusinessOnboarding.test.js and tests/managerBusinessMembership.test.js.
//
// Run: node tests/stadtpocketPublic.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');

// ── Fixture data (mutable, reset per test) ──────────────────────
const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';

const ulmLocation = { id: ULM, name: 'Ulm', slug: 'ulm', type: 'city', status: 'active' };
const stuttgartLocation = { id: STUTTGART, name: 'Stuttgart', slug: 'stuttgart', type: 'city', status: 'active' };

let locationRows = [];
let listingRows = [];
let listingLocationRows = [];
let seq = 0;

function resetFixtures() {
  locationRows = [ulmLocation, stuttgartLocation];
  listingRows = [];
  listingLocationRows = [];
  seq = 0;
}

// Convenience fixture builder: one listing with N storefronts (default:
// one, in Ulm, published, fully populated with the real Bäckerei Staib
// data). Pass `storefronts: [{...}, {...}]` for multi-storefront fixtures.
function addListing({
  listingId = 'listing_staib',
  slug = 'baeckerei-staib',
  name = 'Bäckerei Staib',
  businessId = null,
  listing = {},
  storefronts = [{}],
} = {}) {
  seq += 1;
  listingRows.push({
    id: listingId,
    slug,
    name,
    category: 'Essen & Trinken',
    subCategory: 'Bäckerei',
    tags: [],
    shortDescription: 'Filiale der Ulmer Bäckereikette Staib in der Platzgasse.',
    longDescription: null,
    businessId,
    createdBy: 'admin1',
    createdAt: new Date(2026, 0, seq),
    ...listing,
  });

  const field = (sf, key, def) => (key in sf ? sf[key] : def);

  storefronts.forEach((sf) => {
    seq += 1;
    listingLocationRows.push({
      id: field(sf, 'id', `ll_${listingId}_${seq}`),
      listingId,
      locationId: field(sf, 'locationId', ULM),
      address: field(sf, 'address', 'Platzgasse 2–4, 89073 Ulm'),
      latitude: field(sf, 'latitude', 48.3993425),
      longitude: field(sf, 'longitude', 9.9911963),
      phone: field(sf, 'phone', '0731 8800911'),
      website: field(sf, 'website', 'https://www.baeckerei-staib.de/'),
      hours: field(sf, 'hours', null),
      publicationStatus: field(sf, 'publicationStatus', 'published'),
      businessLocationId: field(sf, 'businessLocationId', null),
      sourceProvider: field(sf, 'sourceProvider', null),
      sourceUrl: field(sf, 'sourceUrl', null),
      sourceType: field(sf, 'sourceType', null),
      verifiedAt: field(sf, 'verifiedAt', null),
      verifiedBy: field(sf, 'verifiedBy', null),
      createdAt: field(sf, 'createdAt', new Date(2026, 0, seq)),
    });
  });
}

// ── Mock Prisma client ──────────────────────────────────────────
const mockPrisma = {
  location: {
    findUnique: async ({ where }) => locationRows.find((l) => l.slug === where.slug) || null,
  },
  stadtPocketListingLocation: {
    findMany: async ({ where, orderBy }) => {
      let rows = listingLocationRows;
      if (where.locationId) rows = rows.filter((ll) => ll.locationId === where.locationId);
      if (where.publicationStatus) rows = rows.filter((ll) => ll.publicationStatus === where.publicationStatus);
      if (where.listing && where.listing.slug) {
        rows = rows.filter((ll) => {
          const l = listingRows.find((lr) => lr.id === ll.listingId);
          return l && l.slug === where.listing.slug;
        });
      }
      let result = rows.map((ll) => ({
        ...ll,
        listing: listingRows.find((l) => l.id === ll.listingId) || null,
      }));
      if (orderBy && orderBy.createdAt === 'asc') {
        result = [...result].sort((a, b) => a.createdAt - b.createdAt);
      }
      return result;
    },
  },
  // Deliberately NOT defined -- this public surface must never write, and
  // must never read Business/BusinessLocation for a visibility decision.
  business: undefined,
  businessLocation: undefined,
  stadtPocketListing: undefined,
  cityBusinessInvite: undefined,
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const stadtpocketPublicRoutes = require('../src/routes/stadtpocketPublicRoutes');
const { handleListCityBusinesses, handleGetCityBusiness } = stadtpocketPublicRoutes;

// ── Test helpers ──────────────────────────────────────────────
function fakeReq({ params = {} } = {}) {
  return { params };
}

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function call(handler, req) {
  const res = fakeRes();
  await handler(req, res);
  return res;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function listUlm() { return call(handleListCityBusinesses, fakeReq({ params: { citySlug: 'ulm' } })); }
async function detailUlm(slug) { return call(handleGetCityBusiness, fakeReq({ params: { citySlug: 'ulm', listingSlug: slug } })); }
async function detailStuttgart(slug) { return call(handleGetCityBusiness, fakeReq({ params: { citySlug: 'stuttgart', listingSlug: slug } })); }

// ── 1. One published storefront ─────────────────────────────

test('1. one published storefront: appears once in city list', async () => {
  resetFixtures();
  addListing();
  const res = await listUlm();
  assert.equal(res.body.businesses.length, 1);
  assert.equal(res.body.businesses[0].slug, 'baeckerei-staib');
});

test('1. one published storefront: detail returns exactly one location', async () => {
  resetFixtures();
  addListing();
  const res = await detailUlm('baeckerei-staib');
  assert.equal(res.body.locations.length, 1);
  assert.equal(res.body.locations[0].address, 'Platzgasse 2–4, 89073 Ulm');
});

// ── 2. Two published storefronts, same city ─────────────────

test('2. two published storefronts in the same city: appears ONCE in city list', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [
      { id: 'll_muensterplatz', address: 'Münsterplatz 10, Ulm' },
      { id: 'll_bahnhofstrasse', address: 'Bahnhofstraße 22, Ulm' },
    ],
  });
  const res = await listUlm();
  assert.equal(res.body.businesses.length, 1);
  assert.equal(res.body.businesses[0].slug, 'example-brand');
});

test('2. two published storefronts in the same city: detail returns BOTH locations', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [
      { id: 'll_muensterplatz', address: 'Münsterplatz 10, Ulm' },
      { id: 'll_bahnhofstrasse', address: 'Bahnhofstraße 22, Ulm' },
    ],
  });
  const res = await detailUlm('example-brand');
  assert.equal(res.body.locations.length, 2);
  const addresses = res.body.locations.map((l) => l.address).sort();
  assert.deepEqual(addresses, ['Bahnhofstraße 22, Ulm', 'Münsterplatz 10, Ulm']);
});

test('list card never carries a picked storefront address/phone/hours field', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [{ address: 'Münsterplatz 10, Ulm' }, { address: 'Bahnhofstraße 22, Ulm' }],
  });
  const res = await listUlm();
  const card = res.body.businesses[0];
  for (const forbidden of ['address', 'phone', 'website', 'hours', 'coordinates', 'locations']) {
    assert.equal(forbidden in card, false, `list card must not expose "${forbidden}"`);
  }
});

// ── 3. Published + draft storefronts on the same listing ────

test('3. one published + one draft storefront on the same listing: detail returns only the published one', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [
      { id: 'll_published', address: 'Münsterplatz 10, Ulm', publicationStatus: 'published' },
      { id: 'll_draft', address: 'Draft Street 1, Ulm', publicationStatus: 'draft' },
    ],
  });
  const res = await detailUlm('example-brand');
  assert.equal(res.body.locations.length, 1);
  assert.equal(res.body.locations[0].address, 'Münsterplatz 10, Ulm');
});

test('3. one published + one draft storefront: draft storefront never affects the city list either', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [
      { id: 'll_published', publicationStatus: 'published' },
      { id: 'll_draft', publicationStatus: 'draft' },
    ],
  });
  const res = await listUlm();
  assert.equal(res.body.businesses.length, 1);
});

// ── 4. Same listing, published in two different cities ──────

test('4. published Ulm storefront + published Stuttgart storefront: Ulm detail returns only Ulm', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [{ id: 'll_ulm', locationId: ULM, address: 'Münsterplatz 10, Ulm' }],
  });
  listingLocationRows.push({
    id: 'll_stuttgart', listingId: 'listing_brand', locationId: STUTTGART,
    address: 'Königstraße 1, Stuttgart', latitude: null, longitude: null, phone: null, website: null, hours: null,
    publicationStatus: 'published', businessLocationId: null,
    sourceProvider: null, sourceUrl: null, sourceType: null, verifiedAt: null, verifiedBy: null,
    createdAt: new Date(2026, 0, 99),
  });

  const ulmRes = await detailUlm('example-brand');
  assert.equal(ulmRes.body.locations.length, 1);
  assert.equal(ulmRes.body.locations[0].address, 'Münsterplatz 10, Ulm');
});

test('4. published Ulm storefront + published Stuttgart storefront: Stuttgart detail returns only Stuttgart', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [{ id: 'll_ulm', locationId: ULM, address: 'Münsterplatz 10, Ulm' }],
  });
  listingLocationRows.push({
    id: 'll_stuttgart', listingId: 'listing_brand', locationId: STUTTGART,
    address: 'Königstraße 1, Stuttgart', latitude: null, longitude: null, phone: null, website: null, hours: null,
    publicationStatus: 'published', businessLocationId: null,
    sourceProvider: null, sourceUrl: null, sourceType: null, verifiedAt: null, verifiedBy: null,
    createdAt: new Date(2026, 0, 99),
  });

  const stuttgartRes = await detailStuttgart('example-brand');
  assert.equal(stuttgartRes.body.locations.length, 1);
  assert.equal(stuttgartRes.body.locations[0].address, 'Königstraße 1, Stuttgart');
});

test('4. same listing in two cities: each city list shows it once, independently', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [{ id: 'll_ulm', locationId: ULM }],
  });
  listingLocationRows.push({
    id: 'll_stuttgart', listingId: 'listing_brand', locationId: STUTTGART,
    address: 'Königstraße 1, Stuttgart', latitude: null, longitude: null, phone: null, website: null, hours: null,
    publicationStatus: 'published', businessLocationId: null,
    sourceProvider: null, sourceUrl: null, sourceType: null, verifiedAt: null, verifiedBy: null,
    createdAt: new Date(2026, 0, 99),
  });
  const ulmList = await listUlm();
  const stuttgartList = await call(handleListCityBusinesses, fakeReq({ params: { citySlug: 'stuttgart' } }));
  assert.equal(ulmList.body.businesses.length, 1);
  assert.equal(stuttgartList.body.businesses.length, 1);
});

// ── 5. Only paused/draft/archived storefronts in the city ───

test('5. only a paused storefront in the city: absent from city list', async () => {
  resetFixtures();
  addListing({ storefronts: [{ publicationStatus: 'paused' }] });
  const res = await listUlm();
  assert.deepEqual(res.body.businesses, []);
});

test('5. only a paused storefront in the city: detail not publicly available (404)', async () => {
  resetFixtures();
  addListing({ storefronts: [{ publicationStatus: 'paused' }] });
  const res = await detailUlm('baeckerei-staib');
  assert.equal(res.statusCode, 404);
});

test('5. only a draft storefront in the city: absent from list and detail 404', async () => {
  resetFixtures();
  addListing({ storefronts: [{ publicationStatus: 'draft' }] });
  const listRes = await listUlm();
  const detailRes = await detailUlm('baeckerei-staib');
  assert.deepEqual(listRes.body.businesses, []);
  assert.equal(detailRes.statusCode, 404);
});

test('5. only an archived storefront in the city: absent from list and detail 404', async () => {
  resetFixtures();
  addListing({ storefronts: [{ publicationStatus: 'archived' }] });
  const listRes = await listUlm();
  const detailRes = await detailUlm('baeckerei-staib');
  assert.deepEqual(listRes.body.businesses, []);
  assert.equal(detailRes.statusCode, 404);
});

// ── 6/7. Unclaimed vs. claimed/connected behave identically ─

test('6. published unclaimed listing (businessId null): list + detail behave normally', async () => {
  resetFixtures();
  addListing({ businessId: null, storefronts: [{ businessLocationId: null }] });
  const listRes = await listUlm();
  const detailRes = await detailUlm('baeckerei-staib');
  assert.equal(listRes.body.businesses.length, 1);
  assert.equal(detailRes.body.locations.length, 1);
});

test('7. published claimed/connected listing (businessId set): identical response shape to unclaimed', async () => {
  resetFixtures();
  addListing({ businessId: null, storefronts: [{ businessLocationId: null }] });
  const unclaimedDetail = await detailUlm('baeckerei-staib');

  resetFixtures();
  addListing({ businessId: 'biz_real_123', storefronts: [{ businessLocationId: 'bl_real_456' }] });
  const claimedDetail = await detailUlm('baeckerei-staib');

  assert.deepEqual(unclaimedDetail.body, claimedDetail.body);
});

test('slug remains stable across claim state, one storefront and multiple storefronts', async () => {
  resetFixtures();
  addListing({ businessId: null });
  const unclaimedOneStorefront = await detailUlm('baeckerei-staib');

  resetFixtures();
  addListing({
    businessId: 'biz_real_123',
    storefronts: [{ businessLocationId: 'bl_1' }, { id: 'll_second', address: 'Second Street 2, Ulm', businessLocationId: 'bl_2' }],
  });
  const claimedTwoStorefronts = await detailUlm('baeckerei-staib');

  assert.equal(unclaimedOneStorefront.body.slug, 'baeckerei-staib');
  assert.equal(claimedTwoStorefronts.body.slug, 'baeckerei-staib');
});

// ── 8. Internal/provenance/ownership never leak ──────────────

test('8. list card never exposes internal ids, provenance, or Business/ownership fields', async () => {
  resetFixtures();
  addListing({
    businessId: 'biz_real_123',
    listing: { createdBy: 'admin1', sourceProvider: 'official-website', sourceUrl: 'https://example.com', sourceType: 'official', verifiedAt: new Date(), verifiedBy: 'admin1' },
    storefronts: [{ businessLocationId: 'bl_real_456', sourceProvider: 'google-listing', verifiedAt: new Date(), verifiedBy: 'admin1' }],
  });
  const res = await listUlm();
  const row = res.body.businesses[0];
  for (const forbidden of ['id', 'businessId', 'businessLocationId', 'createdBy', 'verifiedBy', 'sourceProvider', 'sourceUrl', 'sourceType', 'verifiedAt', 'publicationStatus', 'listingId', 'locationId']) {
    assert.equal(forbidden in row, false, `list card must not expose "${forbidden}"`);
  }
});

test('8. detail response (top-level and nested locations[]) never exposes internal ids, provenance, or Business/ownership fields', async () => {
  resetFixtures();
  addListing({
    businessId: 'biz_real_123',
    listing: { createdBy: 'admin1', sourceProvider: 'official-website', sourceUrl: 'https://example.com', sourceType: 'official', verifiedAt: new Date(), verifiedBy: 'admin1' },
    storefronts: [{ businessLocationId: 'bl_real_456', sourceProvider: 'google-listing', sourceUrl: 'https://maps.example', sourceType: 'directory', verifiedAt: new Date(), verifiedBy: 'admin1' }],
  });
  const res = await detailUlm('baeckerei-staib');
  const forbiddenTopLevel = ['id', 'businessId', 'createdBy', 'verifiedBy', 'sourceProvider', 'sourceUrl', 'sourceType', 'verifiedAt'];
  for (const forbidden of forbiddenTopLevel) {
    assert.equal(forbidden in res.body, false, `detail top level must not expose "${forbidden}"`);
  }
  const forbiddenLocation = ['id', 'listingId', 'locationId', 'businessLocationId', 'publicationStatus', 'sourceProvider', 'sourceUrl', 'sourceType', 'verifiedAt', 'verifiedBy'];
  for (const forbidden of forbiddenLocation) {
    assert.equal(forbidden in res.body.locations[0], false, `detail location item must not expose "${forbidden}"`);
  }
});

// ── 9. Missing optional data omitted honestly ────────────────

test('9. list: subCategory omitted (not null) when absent', async () => {
  resetFixtures();
  addListing({ listing: { subCategory: null } });
  const res = await listUlm();
  assert.equal('subCategory' in res.body.businesses[0], false);
});

test('9. detail: per-storefront missing coordinates/phone/website/hours all omitted, independently per storefront', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brand', slug: 'example-brand', name: 'Example Brand',
    storefronts: [
      { id: 'll_full', address: 'Münsterplatz 10, Ulm' },
      { id: 'll_minimal', address: 'Bahnhofstraße 22, Ulm', latitude: null, longitude: null, phone: null, website: null, hours: null },
    ],
  });
  const res = await detailUlm('example-brand');
  const full = res.body.locations.find((l) => l.address === 'Münsterplatz 10, Ulm');
  const minimal = res.body.locations.find((l) => l.address === 'Bahnhofstraße 22, Ulm');
  assert.ok(full.coordinates && full.phone && full.website);
  for (const f of ['coordinates', 'phone', 'website', 'hours']) {
    assert.equal(f in minimal, false, `minimal storefront must omit "${f}"`);
  }
});

test('9. detail: split-shift + closed-day hours round-trip correctly inside a location entry', async () => {
  resetFixtures();
  addListing({
    listingId: 'listing_brettle', slug: 'cafe-brettle', name: 'Brettle',
    listing: { subCategory: 'Café · Frühstück' },
    storefronts: [{
      hours: [
        { day: 'Mo', closed: true },
        { day: 'Sa', intervals: [{ open: '09:30', close: '14:00' }, { open: '17:00', close: '23:00' }] },
      ],
    }],
  });
  const res = await detailUlm('cafe-brettle');
  assert.deepEqual(res.body.locations[0].hours, [
    { day: 'Mo', closed: true },
    { day: 'Sa', intervals: [{ open: '09:30', close: '14:00' }, { open: '17:00', close: '23:00' }] },
  ]);
});

// ── Baseline / edge cases (retained from prior slice) ────────

test('unknown city slug -> list 404', async () => {
  resetFixtures();
  const res = await call(handleListCityBusinesses, fakeReq({ params: { citySlug: 'nowhere' } }));
  assert.equal(res.statusCode, 404);
});

test('unknown city slug -> detail 404', async () => {
  resetFixtures();
  const res = await call(handleGetCityBusiness, fakeReq({ params: { citySlug: 'nowhere', listingSlug: 'baeckerei-staib' } }));
  assert.equal(res.statusCode, 404);
});

test('known city with zero published listings -> empty array, not 404', async () => {
  resetFixtures();
  const res = await listUlm();
  assert.deepEqual(res.body.businesses, []);
  assert.deepEqual(res.body.city, { slug: 'ulm', name: 'Ulm' });
});

test('known city, unknown listing slug -> detail 404', async () => {
  resetFixtures();
  addListing();
  const res = await detailUlm('nope');
  assert.equal(res.statusCode, 404);
});

test('detail response matches the exact expected shape for a single published, unclaimed storefront', async () => {
  resetFixtures();
  addListing({ businessId: null, storefronts: [{ businessLocationId: null }] });
  const res = await detailUlm('baeckerei-staib');
  assert.deepEqual(res.body, {
    slug: 'baeckerei-staib',
    name: 'Bäckerei Staib',
    category: 'Essen & Trinken',
    subCategory: 'Bäckerei',
    shortDescription: 'Filiale der Ulmer Bäckereikette Staib in der Platzgasse.',
    locations: [
      {
        address: 'Platzgasse 2–4, 89073 Ulm',
        coordinates: { lat: 48.3993425, lng: 9.9911963 },
        phone: '0731 8800911',
        website: 'https://www.baeckerei-staib.de/',
      },
    ],
  });
});

test('never includes a deals field anywhere', async () => {
  resetFixtures();
  addListing();
  const listRes = await listUlm();
  const detailRes = await detailUlm('baeckerei-staib');
  assert.equal('deals' in listRes.body.businesses[0], false);
  assert.equal('deals' in detailRes.body, false);
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
