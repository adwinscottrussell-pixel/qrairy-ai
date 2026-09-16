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
let offerRows = [];
let landingPageRows = [];
let stampSettingsRows = [];
let seq = 0;

function resetFixtures() {
  locationRows = [ulmLocation, stuttgartLocation];
  listingRows = [];
  listingLocationRows = [];
  offerRows = [];
  landingPageRows = [];
  stampSettingsRows = [];
  seq = 0;
}

// LandingPage fixture builder -- only the fields this service ever reads
// (id, slug). A storefront bridges to one of these via
// storefronts[].loyaltyLandingPageId (see addListing).
function addLandingPage({ id, slug }) {
  landingPageRows.push({ id, slug });
}

// StampSettings fixture builder -- defaults to a real, currently-enabled
// program matching this file's other real-data conventions.
function addStampSettings({ slug, goal = 10, rewardName = 'Free item', enabled = true }) {
  stampSettingsRows.push({ slug, goal, rewardName, enabled });
}

// Offer fixture builder -- defaults to a real, currently-valid published
// offer (matches the real Bäckerei Staib test offer used for the
// Phase 6E-2 end-to-end verification: "2 für 1", 12.09.2026–14.09.2026).
function addOffer({
  listingLocationId,
  status = 'published',
  title = 'testing',
  description = 'this is a test',
  offerText = '2 für 1',
  offerType = 'two_for_one',
  offerDetails = null,
  image = { url: 'https://res.cloudinary.com/demo/image/upload/bakery.jpg', width: 800, height: 600 },
  startsAt = new Date('2026-09-12T00:00:00.000Z'),
  endsAt = new Date('2026-09-14T23:59:59.000Z'),
} = {}) {
  seq += 1;
  offerRows.push({
    id: `offer_${seq}`,
    listingLocationId,
    status,
    title,
    description,
    offerText,
    offerType,
    offerDetails,
    image,
    startsAt,
    endsAt,
    createdBy: 'user_admin',
    createdAt: new Date(2026, 0, seq),
  });
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
      loyaltyLandingPageId: field(sf, 'loyaltyLandingPageId', null),
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
        loyaltyLandingPage: landingPageRows.find((lp) => lp.id === ll.loyaltyLandingPageId) || null,
      }));
      if (orderBy && orderBy.createdAt === 'asc') {
        result = [...result].sort((a, b) => a.createdAt - b.createdAt);
      }
      return result;
    },
  },
  stadtPocketOffer: {
    findMany: async ({ where }) => {
      let rows = offerRows;
      if (where.listingLocationId && where.listingLocationId.in) {
        const ids = where.listingLocationId.in;
        rows = rows.filter((o) => ids.includes(o.listingLocationId));
      }
      if (where.status) rows = rows.filter((o) => o.status === where.status);
      return rows.map((o) => ({ ...o }));
    },
  },
  stampSettings: {
    findMany: async ({ where }) => {
      let rows = stampSettingsRows;
      if (where.slug && where.slug.in) {
        const slugs = where.slug.in;
        rows = rows.filter((s) => slugs.includes(s.slug));
      }
      if (where.enabled != null) rows = rows.filter((s) => s.enabled === where.enabled);
      return rows.map((s) => ({ ...s }));
    },
  },
  // Deliberately NOT defined -- this public surface must never write, and
  // must never read Business/BusinessLocation for a visibility decision,
  // nor ever read LoyaltyCustomer (customer-specific data) at all -- if
  // the service code ever attempted to, these tests would crash with a
  // "Cannot read property of undefined" instead of silently succeeding.
  business: undefined,
  businessLocation: undefined,
  stadtPocketListing: undefined,
  cityBusinessInvite: undefined,
  loyaltyCustomer: undefined,
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

// ── Offers (Phase 6E-2 — connect published Deal Builder offers to the
// consumer Angebote screen) ─────────────────────────────────────────

// addOffer()'s own startsAt/endsAt defaults are fixed calendar dates
// (2026-09-12 to 2026-09-14) documenting the real Bäckerei Staib test
// offer used for the Phase 6E-2 end-to-end verification -- kept as-is
// for that record. Any test that actually needs "currently valid right
// now" uses this relative-to-now override instead, so it can never go
// stale the way a second hardcoded calendar date eventually would.
const FAR_FUTURE_ENDS_AT = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

test('a published, currently-valid offer is visible on its storefront, with the exact fields the real Deal Builder test offer used', async () => {
  resetFixtures();
  addListing();
  addOffer({ listingLocationId: listingLocationRows[0].id, endsAt: FAR_FUTURE_ENDS_AT });
  const res = await detailUlm('baeckerei-staib');
  const offer = res.body.locations[0].offers[0];
  assert.equal(typeof offer.id, 'string');
  assert.deepEqual({ ...offer, id: 'offer_1' }, {
    id: 'offer_1',
    title: 'testing',
    offerText: '2 für 1',
    description: 'this is a test',
    offerType: 'two_for_one',
    image: { url: 'https://res.cloudinary.com/demo/image/upload/bakery.jpg', width: 800, height: 600 },
    startsAt: new Date('2026-09-12T00:00:00.000Z'),
    endsAt: FAR_FUTURE_ENDS_AT,
  });
});

test('a draft offer is never visible', async () => {
  resetFixtures();
  addListing();
  addOffer({ listingLocationId: listingLocationRows[0].id, status: 'draft' });
  const res = await detailUlm('baeckerei-staib');
  assert.equal('offers' in res.body.locations[0], false);
});

test('an archived offer is never visible', async () => {
  resetFixtures();
  addListing();
  addOffer({ listingLocationId: listingLocationRows[0].id, status: 'archived' });
  const res = await detailUlm('baeckerei-staib');
  assert.equal('offers' in res.body.locations[0], false);
});

test('an expired published offer (endsAt in the past) is never visible', async () => {
  resetFixtures();
  addListing();
  addOffer({ listingLocationId: listingLocationRows[0].id, endsAt: new Date('2020-01-01T00:00:00.000Z') });
  const res = await detailUlm('baeckerei-staib');
  assert.equal('offers' in res.body.locations[0], false);
});

test('an offer with no endsAt (never expires) remains visible', async () => {
  resetFixtures();
  addListing();
  addOffer({ listingLocationId: listingLocationRows[0].id, endsAt: null });
  const res = await detailUlm('baeckerei-staib');
  assert.equal(res.body.locations[0].offers.length, 1);
});

test('zero offers omits the offers field entirely -- never an empty array, matching every other optional field in this file', async () => {
  resetFixtures();
  addListing();
  const res = await detailUlm('baeckerei-staib');
  assert.equal('offers' in res.body.locations[0], false);
});

test('business scoping: an offer on a DIFFERENT business\'s storefront never appears on this business', async () => {
  resetFixtures();
  addListing({ listingId: 'listing_staib', slug: 'baeckerei-staib' });
  addListing({ listingId: 'listing_other', slug: 'other-shop', name: 'Other Shop' });
  addOffer({ listingLocationId: listingLocationRows[1].id, endsAt: FAR_FUTURE_ENDS_AT }); // the OTHER shop's storefront
  const staibRes = await detailUlm('baeckerei-staib');
  const otherRes = await detailUlm('other-shop');
  assert.equal('offers' in staibRes.body.locations[0], false, 'Staib must not see the other business\'s offer');
  assert.equal(otherRes.body.locations[0].offers.length, 1, 'the other business must see its own offer');
});

test('multi-storefront scoping: an offer on one storefront never appears on a sibling storefront of the SAME listing', async () => {
  resetFixtures();
  addListing({ storefronts: [{ id: 'll_ulm_a' }, { id: 'll_ulm_b', address: 'Zweite Filiale' }] });
  addOffer({ listingLocationId: 'll_ulm_a', endsAt: FAR_FUTURE_ENDS_AT });
  const res = await detailUlm('baeckerei-staib');
  const [locA, locB] = res.body.locations;
  assert.equal(locA.offers.length, 1);
  assert.equal('offers' in locB, false);
});

test('never includes internal offer fields (listingLocationId, status, draftData, createdBy)', async () => {
  resetFixtures();
  addListing();
  addOffer({ listingLocationId: listingLocationRows[0].id, endsAt: FAR_FUTURE_ENDS_AT });
  const res = await detailUlm('baeckerei-staib');
  const offer = res.body.locations[0].offers[0];
  assert.equal('listingLocationId' in offer, false);
  assert.equal('status' in offer, false);
  assert.equal('draftData' in offer, false);
  assert.equal('createdBy' in offer, false);
});

// ── Loyalty (Stempelkarte Phase 1 — business-level loyalty bridge,
// 2026-09-16) ─────────────────────────────────────────────────
//
// Business-level configuration only. LoyaltyCustomer (customer-specific
// progress/identity) is never queried by this service at all -- see
// mockPrisma.loyaltyCustomer: undefined above, which would crash any
// test here if the implementation ever tried.

test('linked storefront with an enabled loyalty program returns enabled/requiredStamps/rewardTitle', async () => {
  resetFixtures();
  addListing({ storefronts: [{ loyaltyLandingPageId: 'lp_staib' }] });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty', goal: 10, rewardName: 'Gratis Kaffee', enabled: true });
  const res = await detailUlm('baeckerei-staib');
  assert.deepEqual(res.body.locations[0].loyalty, {
    enabled: true,
    requiredStamps: 10,
    rewardTitle: 'Gratis Kaffee',
  });
});

test('no loyaltyLandingPageId set -- honest no-loyalty state, field omitted entirely', async () => {
  resetFixtures();
  addListing(); // default storefront: loyaltyLandingPageId null
  const res = await detailUlm('baeckerei-staib');
  assert.equal('loyalty' in res.body.locations[0], false);
});

test('linked LandingPage with no StampSettings row at all -- honest no-loyalty state', async () => {
  resetFixtures();
  addListing({ storefronts: [{ loyaltyLandingPageId: 'lp_staib' }] });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty' });
  // deliberately no addStampSettings() call
  const res = await detailUlm('baeckerei-staib');
  assert.equal('loyalty' in res.body.locations[0], false);
});

test('linked LandingPage with StampSettings.enabled === false -- never appears as an active program', async () => {
  resetFixtures();
  addListing({ storefronts: [{ loyaltyLandingPageId: 'lp_staib' }] });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty', enabled: false });
  const res = await detailUlm('baeckerei-staib');
  assert.equal('loyalty' in res.body.locations[0], false);
});

test('never includes customer-specific or internal loyalty fields -- loyalty object is exactly {enabled, requiredStamps, rewardTitle}', async () => {
  resetFixtures();
  addListing({ storefronts: [{ loyaltyLandingPageId: 'lp_staib' }] });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty', goal: 8, rewardName: 'Freies Brot', enabled: true });
  const res = await detailUlm('baeckerei-staib');
  const loyalty = res.body.locations[0].loyalty;
  assert.deepEqual(Object.keys(loyalty).sort(), ['enabled', 'requiredStamps', 'rewardTitle']);
  for (const forbidden of [
    'customerId', 'cid', 'currentStamps', 'totalStamps', 'rewardsEarned',
    'rewardReady', 'hasWallet', 'stampCount', 'lastStampAt',
    'loyaltyLandingPageId', 'slug', 'id', 'color',
  ]) {
    assert.equal(forbidden in loyalty, false, `loyalty object must not expose "${forbidden}"`);
  }
  // Also never at the top level of the location or the detail response.
  for (const forbidden of ['customerId', 'cid', 'currentStamps', 'loyaltyLandingPageId']) {
    assert.equal(forbidden in res.body.locations[0], false, `location must not expose "${forbidden}"`);
    assert.equal(forbidden in res.body, false, `detail response must not expose "${forbidden}"`);
  }
});

test('loyalty and offers coexist correctly on the same storefront -- neither interferes with the other (existing Angebote behavior unchanged)', async () => {
  resetFixtures();
  addListing({ storefronts: [{ loyaltyLandingPageId: 'lp_staib' }] });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty', goal: 10, rewardName: 'Gratis Kaffee', enabled: true });
  addOffer({ listingLocationId: listingLocationRows[0].id, endsAt: FAR_FUTURE_ENDS_AT });
  const res = await detailUlm('baeckerei-staib');
  const loc = res.body.locations[0];
  assert.deepEqual(loc.loyalty, { enabled: true, requiredStamps: 10, rewardTitle: 'Gratis Kaffee' });
  assert.equal(loc.offers.length, 1);
  assert.equal(loc.offers[0].title, 'testing');
});

test('multi-storefront: loyalty bridge on one storefront never appears on a sibling storefront of the SAME listing', async () => {
  resetFixtures();
  addListing({ storefronts: [{ id: 'll_ulm_a', loyaltyLandingPageId: 'lp_staib' }, { id: 'll_ulm_b', address: 'Zweite Filiale' }] });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty', enabled: true });
  const res = await detailUlm('baeckerei-staib');
  const [locA, locB] = res.body.locations;
  assert.ok(locA.loyalty);
  assert.equal('loyalty' in locB, false);
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
