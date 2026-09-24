// ============================================================
// stadtpocketAssistantTools.test.js — StadtPocket City Assistant,
// Phase 2B.1b (StadtPocket tools) + Phase 2B.2 (search_city_places).
// Exercises the REAL stadtpocketPublicService.js business/offer logic
// (via a mocked Prisma, same require.cache convention as
// tests/stadtpocketPublic.test.js) to genuinely prove "reuse, don't
// duplicate" -- these tests fail if the tools layer ever stops calling
// the real service. stadtpocketEventsService is mocked wholesale
// (its own fetchCityEvents() talks to a real external feed with no
// injectable fetchImpl reaching this layer) so no real network call is
// ever made -- same "mock the whole dependency module" convention as
// tests/stadtpocketResearchRoutes.test.js. stadtpocketDiscoveryService
// is mocked the SAME way, but only at its network boundary
// (callGooglePlacesTextSearch) -- its real toCandidate/DEFAULT_COUNTRY/
// PROVIDER_STATUS exports are kept and reused, so these tests genuinely
// prove the tools layer calls the REAL raw-Google-object parser, not a
// duplicate one, while still making zero real HTTP calls.
//
// No real Anthropic, Google Places, or Firecrawl call is possible from
// this file -- the only network-shaped function
// (callGooglePlacesTextSearch) is replaced with a fake before
// stadtpocketAssistantTools.js is ever required.
//
// Run: node tests/stadtpocketAssistantTools.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const eventsServicePath = resolve('src', 'services', 'stadtpocketEventsService.js');
const discoveryServicePath = resolve('src', 'services', 'stadtpocketDiscoveryService.js');

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

// Only the network boundary is faked -- toCandidate/DEFAULT_COUNTRY/
// PROVIDER_STATUS are the REAL exports (prismaClient is already mocked
// above, so this real require is safe: nothing in it touches prisma
// except resolveCityName, which the Assistant tools layer never calls).
const realDiscoveryService = require('../src/services/stadtpocketDiscoveryService');
let placesResult = { status: realDiscoveryService.PROVIDER_STATUS.OK, places: [] };
let capturedPlacesCall = null;
require.cache[discoveryServicePath] = {
  id: discoveryServicePath, filename: discoveryServicePath, loaded: true,
  exports: {
    ...realDiscoveryService,
    callGooglePlacesTextSearch: async (query, quantity) => {
      capturedPlacesCall = { query, quantity };
      return placesResult;
    },
  },
};

const {
  TOOL_DEFINITIONS,
  executeTool,
  MAX_BUSINESS_RESULTS,
  MAX_OFFER_RESULTS,
  MAX_EVENT_RESULTS,
  MAX_PLACE_RESULTS,
} = require('../src/services/stadtpocketAssistantTools');

function place(id, name, address, lat, lng, types, website) {
  return {
    id,
    displayName: { text: name },
    formattedAddress: address,
    location: lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : undefined,
    types: types || undefined,
    websiteUri: website || undefined,
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. exactly four tools are defined, matching the approved names', () => {
  assert.deepEqual(
    TOOL_DEFINITIONS.map((t) => t.name).sort(),
    ['search_city_places', 'search_stadtpocket_businesses', 'search_stadtpocket_events', 'search_stadtpocket_offers']
  );
});

test('1b. search_city_places requires a query, and exposes no other model-controlled parameter', () => {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === 'search_city_places');
  assert.deepEqual(Object.keys(tool.input_schema.properties), ['query']);
  assert.deepEqual(tool.input_schema.required, ['query']);
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

// ── search_city_places (Phase 2B.2 -- reused stadtpocketDiscoveryService.callGooglePlacesTextSearch/toCandidate) ──
function resetPlaces() {
  placesResult = { status: realDiscoveryService.PROVIDER_STATUS.OK, places: [] };
  capturedPlacesCall = null;
}

test('21. a real place is returned tagged origin: external, partnerStatus: none', async () => {
  resetPlaces();
  placesResult.places = [place('ChIJ001', 'Trattoria da Marco', 'Hafengasse 3, 89073 Ulm', 48.4, 9.99, ['italian_restaurant', 'restaurant'], 'https://trattoria-da-marco.example')];
  const outcome = await executeTool('search_city_places', 'ulm', { query: 'italienisches Restaurant' });
  assert.equal(outcome.results.length, 1);
  const r = outcome.results[0];
  assert.equal(r.type, 'place');
  assert.equal(r.origin, 'external');
  assert.equal(r.partnerStatus, 'none');
  assert.equal(r.id, 'ChIJ001');
  assert.equal(r.name, 'Trattoria da Marco');
  assert.equal(r.subLabel, 'italian_restaurant');
  assert.equal(r.address, 'Hafengasse 3, 89073 Ulm');
  assert.equal(r.latitude, 48.4);
  assert.equal(r.longitude, 9.99);
  assert.equal(r.url, 'https://trattoria-da-marco.example');
});

test('22. the trusted server-resolved city NAME (not the model, not just the slug) reaches Google as "<query> in <city>, Germany"', async () => {
  resetPlaces();
  await executeTool('search_city_places', 'ulm', { query: 'Friseur' });
  assert.equal(capturedPlacesCall.query, 'Friseur in Ulm, Germany');
});

test('23. the natural-language query argument is passed through to the discovery service unmodified', async () => {
  resetPlaces();
  await executeTool('search_city_places', 'ulm', { query: 'coffee' });
  assert.ok(capturedPlacesCall.query.startsWith('coffee in '));
});

test('24. Google is asked for exactly MAX_PLACE_RESULTS, never more', async () => {
  resetPlaces();
  await executeTool('search_city_places', 'ulm', { query: 'Optiker' });
  assert.equal(capturedPlacesCall.quantity, MAX_PLACE_RESULTS);
});

test('25. a model-supplied city/citySlug smuggled into tool args is ignored -- the trusted server city is still used', async () => {
  resetPlaces();
  await executeTool('search_city_places', 'ulm', { query: 'Schuhe', citySlug: 'berlin', city: 'Berlin' });
  assert.ok(capturedPlacesCall.query.includes('Ulm'), `expected the trusted city (Ulm) in the query, got: ${capturedPlacesCall.query}`);
  assert.ok(!capturedPlacesCall.query.includes('Berlin'));
});

test('26. missing optional fields (no address/coordinates/website) are never fabricated', async () => {
  resetPlaces();
  placesResult.places = [{ id: 'ChIJ002', displayName: { text: 'Blumenladen Ulm' } }];
  const outcome = await executeTool('search_city_places', 'ulm', { query: 'Blumenladen' });
  const r = outcome.results[0];
  assert.equal(r.name, 'Blumenladen Ulm');
  assert.equal(r.address, undefined);
  assert.equal(r.latitude, undefined);
  assert.equal(r.longitude, undefined);
  assert.equal(r.url, undefined);
  assert.equal(r.subLabel, undefined); // no category and no address -- never a fabricated placeholder
});

test('27. source is exactly Google Places, only when there are results', async () => {
  resetPlaces();
  placesResult.places = [place('ChIJ003', 'Optiker Seedorf', 'Neue Straße 1, Ulm', 48.4, 9.99, ['optician'])];
  const outcome = await executeTool('search_city_places', 'ulm', { query: 'Optiker' });
  assert.deepEqual(outcome.sources, [{ type: 'external', label: 'Google Places' }]);
});

test('28. zero real results is an honest empty outcome, no source, no error', async () => {
  resetPlaces();
  const outcome = await executeTool('search_city_places', 'ulm', { query: 'Ufologie-Museum' });
  assert.deepEqual(outcome.results, []);
  assert.deepEqual(outcome.sources, []);
  assert.equal(outcome.error, undefined);
});

test('29. results are capped at MAX_PLACE_RESULTS even if the provider returns more', async () => {
  resetPlaces();
  placesResult.places = Array.from({ length: MAX_PLACE_RESULTS + 5 }, (_, i) => place(`ChIJ${i}`, `Place ${i}`, 'Ulm', 48.4, 9.99, ['store']));
  const outcome = await executeTool('search_city_places', 'ulm', { query: 'Geschäft' });
  assert.equal(outcome.results.length, MAX_PLACE_RESULTS);
});

test('30. a provider failure (UNAVAILABLE -- timeout/rejected/malformed) resolves to an honest empty result, never a crash', async () => {
  resetPlaces();
  placesResult = { status: realDiscoveryService.PROVIDER_STATUS.UNAVAILABLE, places: [] };
  const outcome = await executeTool('search_city_places', 'ulm', { query: 'Fitnessstudio' });
  assert.deepEqual(outcome.results, []);
  assert.deepEqual(outcome.sources, []);
  assert.ok(outcome.error);
});

test('31. a missing GOOGLE_PLACES_API_KEY (NOT_CONFIGURED) resolves to an honest empty result, never a crash', async () => {
  resetPlaces();
  placesResult = { status: realDiscoveryService.PROVIDER_STATUS.NOT_CONFIGURED, places: [] };
  const outcome = await executeTool('search_city_places', 'ulm', { query: 'Fitnessstudio' });
  assert.deepEqual(outcome.results, []);
  assert.ok(outcome.error);
});

test('32. a malformed provider record (no displayName/name) is dropped, never crashes, never a placeholder name', async () => {
  resetPlaces();
  placesResult.places = [{ id: 'ChIJ004' /* no displayName at all */ }, place('ChIJ005', 'Real Place', 'Ulm', 48.4, 9.99, ['store'])];
  const outcome = await executeTool('search_city_places', 'ulm', { query: 'Geschäft' });
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].name, 'Real Place');
});

test('33. a missing/empty query never calls Google at all -- cost control, never a garbage search', async () => {
  resetPlaces();
  const outcome = await executeTool('search_city_places', 'ulm', {});
  assert.equal(capturedPlacesCall, null);
  assert.deepEqual(outcome.results, []);
});

test('34. a non-string query never calls Google, never crashes', async () => {
  resetPlaces();
  const outcome = await executeTool('search_city_places', 'ulm', { query: 12345 });
  assert.equal(capturedPlacesCall, null);
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
