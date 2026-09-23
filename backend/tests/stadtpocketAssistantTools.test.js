// ============================================================
// stadtpocketAssistantTools.test.js — StadtPocket City Assistant,
// Phase 2B.1b. Exercises the REAL stadtpocketPublicService.js business/
// offer logic (via a mocked Prisma, same require.cache convention as
// tests/stadtpocketPublic.test.js) to genuinely prove "reuse, don't
// duplicate" -- these tests fail if the tools layer ever stops calling
// the real service. stadtpocketEventsService is mocked wholesale
// (its own fetchCityEvents() talks to a real external feed with no
// injectable fetchImpl reaching this layer) so no real network call is
// ever made -- same "mock the whole dependency module" convention as
// tests/stadtpocketResearchRoutes.test.js.
//
// No real Anthropic, Google Places, or Firecrawl call is possible from
// this file -- none of those are referenced anywhere in
// stadtpocketAssistantTools.js or stadtpocketPublicService.js.
//
// Run: node tests/stadtpocketAssistantTools.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const eventsServicePath = resolve('src', 'services', 'stadtpocketEventsService.js');

const ULM = { id: 'loc_ulm', name: 'Ulm', slug: 'ulm', type: 'city', status: 'active' };

let listingRows = [];
let listingLocationRows = [];
let offerRows = [];
let seq = 0;

function addListing({ slug, name, category, subCategory }) {
  const id = `listing_${seq += 1}`;
  listingRows.push({ id, slug, name, category, subCategory: subCategory || null, headerImage: null });
  return id;
}
function addLocation({ listingId, address = 'Teststraße 1, 89073 Ulm' }) {
  const id = `loc_${seq += 1}`;
  listingLocationRows.push({ id, listingId, locationId: ULM.id, publicationStatus: 'published', address, hours: null, latitude: null, longitude: null, phone: null, website: null, loyaltyLandingPage: null });
  return id;
}
function addOffer({ listingLocationId, title, offerText, status = 'published', endsAt = null }) {
  offerRows.push({ id: `offer_${seq += 1}`, listingLocationId, title, offerText, status, endsAt, startsAt: null, description: null, offerType: null, offerDetails: null, image: null });
}

function resetFixtures() {
  listingRows = [];
  listingLocationRows = [];
  offerRows = [];
  seq = 0;
}

const mockPrisma = {
  location: { findUnique: async ({ where }) => (where.slug === ULM.slug ? ULM : null) },
  stadtPocketListingLocation: {
    findMany: async ({ where, include }) => {
      let rows = listingLocationRows.filter((r) => r.locationId === where.locationId && r.publicationStatus === (where.publicationStatus || r.publicationStatus));
      if (where.listing && where.listing.slug) {
        rows = rows.filter((r) => {
          const listing = listingRows.find((l) => l.id === r.listingId);
          return listing && listing.slug === where.listing.slug;
        });
      }
      return rows.map((r) => ({ ...r, listing: include && include.listing ? listingRows.find((l) => l.id === r.listingId) : undefined }));
    },
  },
  stadtPocketOffer: {
    findMany: async ({ where }) => offerRows.filter((o) => where.listingLocationId.in.includes(o.listingLocationId) && o.status === where.status),
  },
  stadtPocketUpdate: { findMany: async () => [] },
  stampSettings: { findMany: async () => [] },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

let eventsResult = { city: 'ulm', events: [] };
let eventsShouldThrow = false;
require.cache[eventsServicePath] = {
  id: eventsServicePath, filename: eventsServicePath, loaded: true,
  exports: {
    fetchCityEvents: async () => {
      if (eventsShouldThrow) throw new Error('simulated feed outage');
      return eventsResult;
    },
  },
};

const {
  TOOL_DEFINITIONS,
  executeTool,
  MAX_BUSINESS_RESULTS,
  MAX_OFFER_RESULTS,
  MAX_EVENT_RESULTS,
} = require('../src/services/stadtpocketAssistantTools');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. exactly three tools are defined, matching the approved names', () => {
  assert.deepEqual(
    TOOL_DEFINITIONS.map((t) => t.name).sort(),
    ['search_stadtpocket_businesses', 'search_stadtpocket_events', 'search_stadtpocket_offers']
  );
});

test('2. no tool definition exposes a city/citySlug argument', () => {
  for (const tool of TOOL_DEFINITIONS) {
    assert.ok(!('city' in tool.input_schema.properties), `${tool.name} must not accept a city argument`);
    assert.ok(!('citySlug' in tool.input_schema.properties), `${tool.name} must not accept a citySlug argument`);
  }
});

// ── search_stadtpocket_businesses (real stadtpocketPublicService.listCityBusinesses) ──
test('3. returns real businesses tagged origin: stadtpocket, partnerStatus: partner', async () => {
  resetFixtures();
  const id = addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken', subCategory: 'Café' });
  addLocation({ listingId: id });
  const outcome = await executeTool('search_stadtpocket_businesses', 'ulm', {});
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].origin, 'stadtpocket');
  assert.equal(outcome.results[0].partnerStatus, 'partner');
  assert.equal(outcome.results[0].slug, 'cafe-brettle');
  assert.equal(outcome.sources[0].label, 'StadtPocket');
});

test('4. query argument filters by business name', async () => {
  resetFixtures();
  addLocation({ listingId: addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken' }) });
  addLocation({ listingId: addListing({ slug: 'topfit-ulm', name: 'TopFit Ulm', category: 'Fitnessstudio' }) });
  const outcome = await executeTool('search_stadtpocket_businesses', 'ulm', { query: 'brettle' });
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].slug, 'cafe-brettle');
});

test('5. category argument matches category or subCategory', async () => {
  resetFixtures();
  addLocation({ listingId: addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken', subCategory: 'Café · Frühstück' }) });
  addLocation({ listingId: addListing({ slug: 'topfit-ulm', name: 'TopFit Ulm', category: 'Fitnessstudio' }) });
  const outcome = await executeTool('search_stadtpocket_businesses', 'ulm', { category: 'café' });
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].slug, 'cafe-brettle');
});

test('6. a non-matching filter returns an honest empty result, never a fabricated match', async () => {
  resetFixtures();
  addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken' });
  const outcome = await executeTool('search_stadtpocket_businesses', 'ulm', { query: 'Trattoria da Marco' });
  assert.deepEqual(outcome.results, []);
});

test('7. business results are capped at MAX_BUSINESS_RESULTS', async () => {
  resetFixtures();
  for (let i = 0; i < MAX_BUSINESS_RESULTS + 5; i += 1) {
    addLocation({ listingId: addListing({ slug: `biz-${i}`, name: `Business ${i}`, category: 'Einzelhandel' }) });
  }
  const outcome = await executeTool('search_stadtpocket_businesses', 'ulm', {});
  assert.equal(outcome.results.length, MAX_BUSINESS_RESULTS);
});

test('8. a malformed (non-string) query argument is treated as no filter, never crashes', async () => {
  resetFixtures();
  addLocation({ listingId: addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken' }) });
  const outcome = await executeTool('search_stadtpocket_businesses', 'ulm', { query: 12345 });
  assert.equal(outcome.results.length, 1);
});

// ── search_stadtpocket_offers (real listCityBusinesses + getCityBusiness aggregation) ──
test('9. finds a real published offer and tags it correctly', async () => {
  resetFixtures();
  const listingId = addListing({ slug: 'baeckerei-staib', name: 'Bäckerei Staib', category: 'Essen & Trinken' });
  const locId = addLocation({ listingId });
  addOffer({ listingLocationId: locId, title: '2 für 1', offerText: '2 für 1 auf Brötchen' });
  const outcome = await executeTool('search_stadtpocket_offers', 'ulm', {});
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].type, 'offer');
  assert.equal(outcome.results[0].origin, 'stadtpocket');
  assert.equal(outcome.results[0].partnerStatus, 'partner');
  assert.equal(outcome.results[0].name, 'Bäckerei Staib');
  assert.equal(outcome.results[0].subLabel, '2 für 1 auf Brötchen');
});

test('10. "Does Bäckerei Staib have an offer?" -- businessName filters to one business', async () => {
  resetFixtures();
  const staibId = addListing({ slug: 'baeckerei-staib', name: 'Bäckerei Staib', category: 'Essen & Trinken' });
  const staibLoc = addLocation({ listingId: staibId });
  addOffer({ listingLocationId: staibLoc, title: 'Angebot', offerText: '2 für 1' });
  const brettleId = addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken' });
  const brettleLoc = addLocation({ listingId: brettleId });
  addOffer({ listingLocationId: brettleLoc, title: 'Anderes Angebot', offerText: 'Gratis Kaffee' });

  const outcome = await executeTool('search_stadtpocket_offers', 'ulm', { businessName: 'Staib' });
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].name, 'Bäckerei Staib');
});

test('11. a business with no offers honestly returns nothing for it -- never invents one', async () => {
  resetFixtures();
  const id = addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken' });
  addLocation({ listingId: id });
  const outcome = await executeTool('search_stadtpocket_offers', 'ulm', { businessName: 'Brettle' });
  assert.deepEqual(outcome.results, []);
});

test('12. an expired offer is never returned (reuses the real published+non-expired public contract)', async () => {
  resetFixtures();
  const id = addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken' });
  const locId = addLocation({ listingId: id });
  addOffer({ listingLocationId: locId, title: 'Abgelaufen', offerText: 'x', endsAt: new Date('2000-01-01').toISOString() });
  const outcome = await executeTool('search_stadtpocket_offers', 'ulm', {});
  assert.deepEqual(outcome.results, []);
});

test('13. offer results are capped at MAX_OFFER_RESULTS', async () => {
  resetFixtures();
  for (let i = 0; i < MAX_OFFER_RESULTS + 4; i += 1) {
    const id = addListing({ slug: `biz-${i}`, name: `Business ${i}`, category: 'Essen & Trinken' });
    const locId = addLocation({ listingId: id });
    addOffer({ listingLocationId: locId, title: 'Deal', offerText: `Deal ${i}` });
  }
  const outcome = await executeTool('search_stadtpocket_offers', 'ulm', {});
  assert.equal(outcome.results.length, MAX_OFFER_RESULTS);
});

// ── search_stadtpocket_events (mocked stadtpocketEventsService) ──
test('14. returns real events tagged correctly', async () => {
  eventsShouldThrow = false;
  eventsResult = { city: 'ulm', events: [{ id: '1', title: 'Stadtfest', startDate: '2026-10-01', venue: 'Marktplatz', url: 'https://veranstaltungen.ulm.de/1' }] };
  const outcome = await executeTool('search_stadtpocket_events', 'ulm', {});
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].type, 'event');
  assert.equal(outcome.results[0].origin, 'stadtpocket');
  assert.equal(outcome.results[0].partnerStatus, 'partner');
  assert.equal(outcome.results[0].url, 'https://veranstaltungen.ulm.de/1');
});

test('15. an event with no real url is still returned, but url stays absent -- never fabricated', async () => {
  eventsShouldThrow = false;
  eventsResult = { city: 'ulm', events: [{ id: '2', title: 'Flohmarkt', startDate: '2026-10-05', venue: 'Zentrum' }] };
  const outcome = await executeTool('search_stadtpocket_events', 'ulm', {});
  assert.equal(outcome.results[0].url, undefined);
});

test('16. event results are capped at MAX_EVENT_RESULTS', async () => {
  eventsShouldThrow = false;
  eventsResult = { city: 'ulm', events: Array.from({ length: MAX_EVENT_RESULTS + 3 }, (_, i) => ({ id: String(i), title: `Event ${i}`, startDate: '2026-10-10' })) };
  const outcome = await executeTool('search_stadtpocket_events', 'ulm', {});
  assert.equal(outcome.results.length, MAX_EVENT_RESULTS);
});

test('17. a real feed failure (fetchCityEvents throws) resolves to an honest empty result, never a crash', async () => {
  eventsShouldThrow = true;
  const outcome = await executeTool('search_stadtpocket_events', 'ulm', {});
  assert.deepEqual(outcome.results, []);
  assert.ok(outcome.error);
  eventsShouldThrow = false;
});

// ── executeTool safety ─────────────────────────────────────────────
test('18. an unknown tool name resolves to an honest error outcome, never throws', async () => {
  const outcome = await executeTool('search_the_entire_internet', 'ulm', {});
  assert.deepEqual(outcome.results, []);
  assert.ok(outcome.error);
});

test('19. non-object args (e.g. a string) never crash a tool -- treated as empty args', async () => {
  resetFixtures();
  addLocation({ listingId: addListing({ slug: 'cafe-brettle', name: 'Café Brettle', category: 'Essen & Trinken' }) });
  const outcome = await executeTool('search_stadtpocket_businesses', 'ulm', 'not an object');
  assert.equal(outcome.results.length, 1); // no filter applied -- behaves exactly like {}
});

test('20. null args never crash a tool', async () => {
  eventsShouldThrow = false;
  eventsResult = { city: 'ulm', events: [] };
  const outcome = await executeTool('search_stadtpocket_events', 'ulm', null);
  assert.deepEqual(outcome.results, []);
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
