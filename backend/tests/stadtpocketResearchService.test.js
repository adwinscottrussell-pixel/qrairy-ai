// ============================================================
// stadtpocketResearchService.test.js — Phase 1B (AI Business
// Onboarding). Orchestration-level tests for researchBusiness(): the
// pipeline stage-by-stage, with the web/AI provider modules and Prisma
// mocked via require.cache pre-seeding (same convention as
// tests/stadtpocketOfferRoutes.test.js) so no real network/DB call is
// ever made.
//
// Run: node tests/stadtpocketResearchService.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const webResearchPath = resolve('src', 'services', 'stadtpocketWebResearchService.js');
const aiExtractionPath = resolve('src', 'services', 'stadtpocketAiExtractionService.js');

const ULM = 'loc_ulm';
const NET1 = 'net_stadtpocket';

let listingLocationRows = [];
let webResult;
let aiResult;
let cityName; // Phase 1G -- backs mockPrisma.location.findUnique
// Phase 1E follow-up: rather than reassigning the exported FUNCTION
// (which stadtpocketResearchService.js already destructured once at
// its own require() time, so a later reassignment on the exports
// object would never be seen by it), these flags are read by the
// mock's own closure -- the SAME mock function reference the module
// under test already holds, just changing what it does.
let webShouldHang = false;
let aiShouldHang = false;
// Phase 1G.3 -- set the moment the `signal` given to the hanging mock
// actually fires 'abort', or stays null if it never does.
let extractionAbortedAt = null;

function resetFixtures() {
  listingLocationRows = [];
  webResult = { status: 'ok', content: 'scraped content', sourceUrl: 'https://www.brettle-ulm.de/', truncated: false, pageUrls: ['https://www.brettle-ulm.de/'] };
  aiResult = { status: 'ok', fields: { name: { value: 'Café Brettle', confidence: 'high' }, phone: { value: '0731 000000', confidence: 'high' } } };
  webShouldHang = false;
  aiShouldHang = false;
  extractionAbortedAt = null;
  cityName = 'Ulm';
}
resetFixtures();

const mockPrisma = {
  stadtPocketListingLocation: {
    findMany: async ({ where }) => listingLocationRows.filter((r) => r.locationId === where.locationId).map((r) => ({ ...r, listing: { ...r.listing } })),
  },
  location: {
    findUnique: async () => (cityName ? { name: cityName } : null),
  },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

require.cache[webResearchPath] = {
  id: webResearchPath, filename: webResearchPath, loaded: true,
  exports: {
    STATUS: { OK: 'ok', INVALID_URL: 'invalid-url', UNSUPPORTED_PROTOCOL: 'unsupported-protocol', PRIVATE_TARGET: 'private-target', DNS_FAILURE: 'dns-failure', PROVIDER_UNAVAILABLE: 'provider-unavailable', UNREACHABLE: 'unreachable', EMPTY: 'empty' },
    fetchBusinessWebsiteResearch: () => (webShouldHang ? new Promise(() => {}) : Promise.resolve(webResult)),
  },
};
let lastExtractionArgs = null;
require.cache[aiExtractionPath] = {
  id: aiExtractionPath, filename: aiExtractionPath, loaded: true,
  exports: {
    STATUS: { OK: 'ok', PROVIDER_UNAVAILABLE: 'provider-unavailable', UNAVAILABLE: 'unavailable', MALFORMED_OUTPUT: 'malformed-output' },
    extractBusinessFields: (args) => {
      lastExtractionArgs = args;
      if (!aiShouldHang) return Promise.resolve(aiResult);
      // Hanging mode never resolves on its own, but -- exactly like the
      // REAL extractBusinessFields resolving safely once its signal is
      // aborted -- reacts to the passed signal instead of hanging
      // forever once it is actually cancelled.
      return new Promise((resolve) => {
        if (args && args.signal) {
          args.signal.addEventListener('abort', () => {
            extractionAbortedAt = Date.now();
            resolve({ status: 'unavailable', fields: {} });
          });
        }
      });
    },
  },
};

const { researchBusiness, StadtpocketResearchError, StadtpocketManagerError, RESEARCH_STATUS, splitLocationCandidates, normalizeCityName } = require('../src/services/stadtpocketResearchService');

const GLOBAL_ADMIN_SCOPE = { userId: 'admin_1', isGlobalAdmin: true };
const ULM_MANAGER_SCOPE = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
const STUTTGART_MANAGER_SCOPE = { userId: 'stuttgart_manager', isGlobalAdmin: false, locationIds: ['loc_stuttgart'] };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function expectThrow(fn, ErrorClass, status) {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof ErrorClass, `expected ${ErrorClass.name}, got ${err.constructor.name}: ${err.message}`);
    if (status !== undefined) assert.equal(err.status, status);
    return err;
  }
  throw new Error('expected function to throw, but it did not');
}

// ── SUCCESS ────────────────────────────────────────────────────
test('1. website URL + name, full success -> ok, evidenced fields, requestedBy from scope not body', async () => {
  resetFixtures();
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Café Brettle', websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.OK);
  assert.equal(candidate.requestedBy, 'ulm_manager');
  assert.equal(candidate.fields.name.value, 'Café Brettle');
  assert.equal(candidate.fields.name.source, 'official business website');
  assert.equal(candidate.fields.name.sourceUrl, 'https://www.brettle-ulm.de/');
});

test('2. name + city only (no URL) -> no-source, no scraping/extraction attempted, still runs duplicate check', async () => {
  resetFixtures();
  let extractionCalled = false;
  const aiPath = aiExtractionPath;
  const original = require.cache[aiPath].exports.extractBusinessFields;
  require.cache[aiPath].exports.extractBusinessFields = async () => { extractionCalled = true; return aiResult; };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Café Brettle' });
  require.cache[aiPath].exports.extractBusinessFields = original;
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.NO_SOURCE);
  assert.deepEqual(candidate.fields, {});
  assert.equal(extractionCalled, false);
  assert.ok(candidate.duplicate); // duplicate check still ran
});

test('3. partial research (extraction succeeds but returns zero usable fields) -> partial', async () => {
  resetFixtures();
  aiResult = { status: 'ok', fields: {} };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.PARTIAL);
});

test('4. duplicate NEW is surfaced end-to-end for a genuinely new business', async () => {
  resetFixtures();
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Brand New Co', websiteUrl: 'https://brandnew.example.com' });
  assert.equal(candidate.duplicate.status, 'NEW');
});

test('5. existing duplicate (already a draft in this city) is surfaced end-to-end', async () => {
  resetFixtures();
  listingLocationRows = [{ id: 'll_brettle', locationId: ULM, website: 'https://www.brettle-ulm.de/', phone: null, address: null, publicationStatus: 'draft', listing: { id: 'listing_brettle', name: 'Café Brettle', slug: 'cafe-brettle' } }];
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.duplicate.status, 'ALREADY_DRAFT');
});

test('6. headerImageCandidateUrl is reshaped into a distinct headerImageCandidate, never merged into "fields"', async () => {
  resetFixtures();
  aiResult = { status: 'ok', fields: { headerImageCandidateUrl: { value: 'https://www.brettle-ulm.de/hero.jpg', confidence: 'medium', source: 'x', sourceUrl: 'x' } } };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.fields.headerImageCandidateUrl, undefined);
  assert.equal(candidate.headerImageCandidate.value.url, 'https://www.brettle-ulm.de/hero.jpg');
});

// ── SECURITY ───────────────────────────────────────────────────
test('7. a manager scoped to a different city is rejected (403) before any research happens', async () => {
  resetFixtures();
  let webCalled = false;
  const original = require.cache[webResearchPath].exports.fetchBusinessWebsiteResearch;
  require.cache[webResearchPath].exports.fetchBusinessWebsiteResearch = async () => { webCalled = true; return webResult; };
  await expectThrow(() => researchBusiness(ULM, STUTTGART_MANAGER_SCOPE, { businessName: 'x' }), StadtpocketManagerError, 403);
  require.cache[webResearchPath].exports.fetchBusinessWebsiteResearch = original;
  assert.equal(webCalled, false);
});

test('8. Global Admin bypasses city scoping entirely', async () => {
  resetFixtures();
  const candidate = await researchBusiness(ULM, GLOBAL_ADMIN_SCOPE, { businessName: 'x', websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.OK);
});

test('9. an unexpected request field is rejected (400), matching initializeDraft-style strictness', async () => {
  resetFixtures();
  await expectThrow(() => researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'x', requestedBy: 'someone-else' }), StadtpocketResearchError, 400);
});

test('10. neither businessName nor websiteUrl -> 400, never silently proceeds', async () => {
  resetFixtures();
  await expectThrow(() => researchBusiness(ULM, ULM_MANAGER_SCOPE, {}), StadtpocketResearchError, 400);
});

// ── PROVIDER ───────────────────────────────────────────────────
test('11. website rejected as a private/internal target -> website-rejected, never sent to extraction', async () => {
  resetFixtures();
  webResult = { status: 'private-target' };
  let extractionCalled = false;
  const original = require.cache[aiExtractionPath].exports.extractBusinessFields;
  require.cache[aiExtractionPath].exports.extractBusinessFields = async () => { extractionCalled = true; return aiResult; };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'http://169.254.169.254/' });
  require.cache[aiExtractionPath].exports.extractBusinessFields = original;
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.WEBSITE_REJECTED);
  assert.equal(extractionCalled, false);
});

test('12. website unreachable -> website-unreachable, fields empty, duplicate check still runs', async () => {
  resetFixtures();
  webResult = { status: 'unreachable' };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'x', websiteUrl: 'https://down.example.com' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.WEBSITE_UNREACHABLE);
  assert.deepEqual(candidate.fields, {});
  assert.ok(candidate.duplicate);
});

test('13. Firecrawl provider unavailable (no key) -> provider-unavailable', async () => {
  resetFixtures();
  webResult = { status: 'provider-unavailable' };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://x.de' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.PROVIDER_UNAVAILABLE);
});

test('14. Anthropic malformed output -> malformed-output, never throws, never fabricated fields', async () => {
  resetFixtures();
  aiResult = { status: 'malformed-output', fields: {} };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.MALFORMED_OUTPUT);
  assert.deepEqual(candidate.fields, {});
});

// ── INTEGRITY ──────────────────────────────────────────────────
test('15. this function never touches any write-capable Prisma method -- the mock exposes none', async () => {
  resetFixtures();
  assert.equal(mockPrisma.stadtPocketListing, undefined);
  assert.equal(mockPrisma.stadtPocketListingLocation.create, undefined);
  assert.equal(mockPrisma.stadtPocketListingLocation.update, undefined);
  await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'x', websiteUrl: 'https://www.brettle-ulm.de/' });
  // reaching here without a thrown "not a function" error is the proof --
  // no offer/loyalty/update/business/owner table exists on mockPrisma at
  // all, so any accidental write attempt anywhere in the pipeline would
  // have thrown.
});

test('16. missing extracted fields stay absent in the candidate -- never filled with a placeholder', async () => {
  resetFixtures();
  aiResult = { status: 'ok', fields: { name: { value: 'Only Name', confidence: 'high', source: 'x', sourceUrl: 'x' } } };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(Object.keys(candidate.fields).length, 1);
  assert.equal(candidate.fields.address, undefined);
  assert.equal(candidate.headerImageCandidate, null);
});

// ── BULK READINESS ─────────────────────────────────────────────
test('17. researchBusiness is callable independently, back-to-back, for two different candidates with no shared state leaking between calls', async () => {
  resetFixtures();
  aiResult = { status: 'ok', fields: { name: { value: 'Candidate One', confidence: 'high' } } };
  const first = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Candidate One', websiteUrl: 'https://one.example.com' });
  aiResult = { status: 'ok', fields: { name: { value: 'Candidate Two', confidence: 'high' } } };
  const second = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Candidate Two', websiteUrl: 'https://two.example.com' });
  assert.equal(first.fields.name.value, 'Candidate One');
  assert.equal(second.fields.name.value, 'Candidate Two');
});

test('18. one candidate\'s research failure does not affect a subsequent, independent candidate call (per-candidate isolation)', async () => {
  resetFixtures();
  webResult = { status: 'unreachable' };
  const failed = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Fails', websiteUrl: 'https://down.example.com' });
  assert.equal(failed.researchStatus, RESEARCH_STATUS.WEBSITE_UNREACHABLE);

  webResult = { status: 'ok', content: 'x', sourceUrl: 'https://ok.example.com', truncated: false };
  aiResult = { status: 'ok', fields: { name: { value: 'Succeeds', confidence: 'high' } } };
  const succeeded = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Succeeds', websiteUrl: 'https://ok.example.com' });
  assert.equal(succeeded.researchStatus, RESEARCH_STATUS.OK);
  assert.equal(succeeded.fields.name.value, 'Succeeds');
});

// ── Phase 1E follow-up: overall research deadline ────────────────
test('19. a web-fetch that never resolves still returns a structured failure once the (short, test-injected) deadline elapses', async () => {
  resetFixtures();
  webShouldHang = true;
  const start = Date.now();
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://slow.example.com' }, { deadlineMs: 30 });
  const elapsed = Date.now() - start;
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.PROVIDER_UNAVAILABLE);
  assert.deepEqual(candidate.fields, {});
  assert.ok(elapsed < 2000, `expected the deadline to cut this off quickly, took ${elapsed}ms`);
});

test('20. an AI extraction that never resolves also returns a structured failure once the deadline elapses (web fetch succeeded first)', async () => {
  resetFixtures();
  aiShouldHang = true;
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' }, { deadlineMs: 30 });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.PROVIDER_UNAVAILABLE);
  assert.deepEqual(candidate.fields, {});
});

test('21. the duplicate check still runs and is still accurate even when the provider portion hits the deadline', async () => {
  resetFixtures();
  // Website match (a strong identity field) against an existing DRAFT
  // row -- correctly ALREADY_DRAFT per stadtpocketDuplicateService.js's
  // existing, separately-tested rules (a name-only match would only
  // ever be POSSIBLE_MATCH, not asserted here since that distinction
  // is already covered by stadtpocketDuplicateService.test.js).
  listingLocationRows = [{ id: 'll_x', locationId: ULM, website: 'https://slow.example.com', phone: null, address: null, publicationStatus: 'draft', listing: { id: 'listing_x', name: 'Bereits Vorhanden', slug: 'bereits-vorhanden' } }];
  webShouldHang = true;
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Ganz Anderer Name', websiteUrl: 'https://slow.example.com' }, { deadlineMs: 30 });
  assert.equal(candidate.duplicate.status, 'ALREADY_DRAFT');
});

test('22. a deadline timeout never creates a draft or touches any write-capable Prisma method -- the mock exposes none', async () => {
  resetFixtures();
  assert.equal(mockPrisma.stadtPocketListing, undefined);
  assert.equal(mockPrisma.stadtPocketListingLocation.create, undefined);
  webShouldHang = true;
  await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://slow.example.com' }, { deadlineMs: 30 });
  // reaching here without a thrown "not a function" error is the proof
});

test('23. a normal, fast research call is completely unaffected by the deadline machinery (default deadline never fires)', async () => {
  resetFixtures();
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.OK);
});

// ── PHASE 1G.3 — real cancellation on deadline expiry ────────────
// Real Bäckerei Betz staging failure: the deadline previously only
// stopped researchBusiness()'s own wait, leaving the real Anthropic
// call running orphaned for ~16.5s after the Admin had already
// received provider-unavailable. These tests prove the fix at the
// orchestration level: a real AbortController is created, its signal
// reaches extractBusinessFields, and deadline expiry actually aborts
// it -- using the mock's own abort-reactive hanging behavior (see
// aiExtractionPath's mock above) as proof, not merely that
// researchBusiness() itself returns in time (already covered by
// test 20).
test('24a. extractBusinessFields always receives a signal (an AbortSignal) when a website is researched, even on a normal fast completion', async () => {
  resetFixtures();
  lastExtractionArgs = null;
  await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.ok(lastExtractionArgs.signal, 'expected a signal to be passed');
  assert.equal(typeof lastExtractionArgs.signal.addEventListener, 'function', 'expected an AbortSignal-shaped object');
});

test('24b. a successful extraction that finishes before the deadline is never aborted', async () => {
  resetFixtures();
  await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(lastExtractionArgs.signal.aborted, false);
  assert.equal(extractionAbortedAt, null, 'the extraction mock must never have seen an abort for a fast, successful call');
});

test('24c. deadline expiry actually calls AbortController.abort() -- the signal reaching extractBusinessFields fires, proven by the mock reacting to it (not merely researchBusiness() timing out on its own)', async () => {
  resetFixtures();
  aiShouldHang = true;
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' }, { deadlineMs: 30 });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.PROVIDER_UNAVAILABLE);
  assert.ok(extractionAbortedAt !== null, 'expected the signal passed to extractBusinessFields to have actually fired abort');
  assert.ok(lastExtractionArgs.signal.aborted, 'the signal object itself must report aborted:true');
});

test('24d. the (now-cancelled) provider request resolves into the existing safe UNAVAILABLE shape rather than hanging forever or rejecting -- no orphaned promise, no unhandled rejection', async () => {
  resetFixtures();
  aiShouldHang = true;
  // Await all the way through -- if the mock's hanging promise never
  // settled (i.e. cancellation never reached it), this test would hang
  // and time out the whole suite, which is itself a meaningful proof.
  await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' }, { deadlineMs: 30 });
  assert.ok(extractionAbortedAt !== null);
});

test('24e. the AbortController is never fired on a candidate that never has a website at all (no-source path) -- abort() only ever applies to a genuinely in-flight provider call', async () => {
  resetFixtures();
  lastExtractionArgs = null;
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { businessName: 'Nur ein Name' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.NO_SOURCE);
  assert.equal(lastExtractionArgs, null, 'extraction is never even attempted without a website, so there is nothing to abort');
});

test('24f. two independent back-to-back requests each get their OWN AbortController -- a deadline/abort on one never affects the other', async () => {
  resetFixtures();
  aiShouldHang = true;
  await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://slow.example.com' }, { deadlineMs: 30 });
  const firstAbortedAt = extractionAbortedAt;
  assert.ok(firstAbortedAt !== null);

  resetFixtures(); // fresh signal/state for the second, normal-speed call
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.OK);
  assert.equal(lastExtractionArgs.signal.aborted, false, 'the second, independent request\'s own signal must never be pre-aborted by the first request\'s cancellation');
});

// ── PHASE 1G — multi-location detection ─────────────────────────
test('24. two or more CITY-RELEVANT location entries -> multipleLocationsDetected true, candidates returned, top-level address left absent', async () => {
  resetFixtures();
  aiResult = {
    status: 'ok',
    fields: {
      name: { value: 'Bäckerei Betz', confidence: 'high' },
      locations: {
        value: [
          { address: 'Westerlingerstr. 49, 89073 Ulm', city: 'Ulm', phone: '0731 111', sourceUrl: 'https://betz.de/filialen/' },
          { address: 'Haslacherweg 59, 89075 Ulm', city: 'Ulm', sourceUrl: 'https://betz.de/filialen/' },
        ],
        confidence: 'high',
      },
    },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  assert.equal(candidate.multipleLocationsDetected, true);
  assert.equal(candidate.locations.length, 2);
  assert.equal(candidate.locations[0].address, 'Westerlingerstr. 49, 89073 Ulm');
  assert.equal(candidate.fields.address, undefined);
  assert.equal('locations' in candidate.fields, false); // never leaked into the generic field list
});

// ── PHASE 1G CORRECTION — complete multi-location discovery ─────
// Real Bäckerei Betz (2026-09-20, read-only inspection): 30 branches
// across 16 towns, 8 of them in Ulm. These tests prove none of that is
// silently reduced to 2, 5, or "the first N" anywhere in this pipeline.
test('24b. all 8 real Ulm branches survive -- nothing here reduces a location list bigger than 5 down to 5', async () => {
  resetFixtures();
  const ulmStreets = ['Westerlingerstraße 49', 'Haslacherweg 59', 'Neue Gasse 2', 'Ehingerstraße 25', 'Ensostraße 31', 'Schlösslegasse 1', 'Stifterweg 76', 'Bahnhofstraße 17'];
  aiResult = {
    status: 'ok',
    fields: {
      name: { value: 'Bäckerei Betz', confidence: 'high' },
      locations: { value: ulmStreets.map((street) => ({ address: `${street}, Ulm`, city: 'Ulm', sourceUrl: 'https://betz.de/filialen/' })), confidence: 'high' },
    },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  assert.equal(candidate.totalLocationsDiscovered, 8);
  assert.equal(candidate.multipleLocationsDetected, true);
  assert.equal(candidate.locations.length, 8);
  assert.deepEqual(candidate.locations.map((l) => l.address), ulmStreets.map((s) => `${s}, Ulm`));
});

test('24c. the real 30-branch/16-town Betz shape: totalLocationsDiscovered reflects ALL of them, but "locations" (the Admin picker) contains only the 8 in Ulm -- city filtering happens AFTER complete discovery, never before', async () => {
  resetFixtures();
  const otherTowns = ['Achstetten', 'Bellenberg', 'Blaustein', 'Burlafingen', 'Dietenheim', 'Erbach', 'Heidenheim', 'Illerkirchberg', 'Langenau', 'Leipheim', 'Nersingen', 'Pfuhl', 'Pfuhl', 'Senden', 'Senden', 'Thalfingen', 'Thalfingen'];
  const neuUlm = ['Neu-Ulm', 'Neu-Ulm', 'Neu-Ulm', 'Neu-Ulm', 'Neu-Ulm'];
  const ulm = ['Ulm', 'Ulm', 'Ulm', 'Ulm', 'Ulm', 'Ulm', 'Ulm', 'Ulm'];
  const all = [...otherTowns, ...neuUlm, ...ulm]; // interleave-free is fine -- order must not matter, see next test
  aiResult = {
    status: 'ok',
    fields: {
      name: { value: 'Bäckerei Betz', confidence: 'high' },
      locations: { value: all.map((city, i) => ({ address: `Straße ${i}, ${city}`, city, sourceUrl: 'https://betz.de/filialen/' })), confidence: 'high' },
    },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  assert.equal(candidate.totalLocationsDiscovered, 30);
  assert.equal(candidate.multipleLocationsDetected, true);
  assert.equal(candidate.locations.length, 8);
  assert.ok(candidate.locations.every((l) => l.city === 'Ulm'));
});

test('24d. "Ulm" never matches "Neu-Ulm" -- a Neu-Ulm branch is excluded even though the authorized city is Ulm', async () => {
  resetFixtures();
  aiResult = {
    status: 'ok',
    fields: {
      locations: {
        value: [
          { address: 'Westerlingerstr. 49, Ulm', city: 'Ulm' },
          { address: 'Carl-Zeiss-Str. 1, Neu-Ulm', city: 'Neu-Ulm' },
          { address: 'Industriestraße 2, Neu-Ulm', city: 'Neu-Ulm' },
        ],
        confidence: 'high',
      },
    },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  // Exactly one Ulm match among 3 discovered -> folds into the normal
  // single-location fields (not a picker), and it must be the Ulm one.
  assert.equal(candidate.totalLocationsDiscovered, 3);
  assert.equal(candidate.multipleLocationsDetected, false);
  assert.equal(candidate.fields.address.value, 'Westerlingerstr. 49, Ulm');
});

test('24e. locations scattered non-contiguously all survive -- never just "the first N" city-relevant matches', async () => {
  resetFixtures();
  const cities = ['Ulm', 'Senden', 'Ulm', 'Pfuhl', 'Ulm', 'Neu-Ulm', 'Ulm']; // Ulm at indices 0,2,4,6 -- not contiguous
  aiResult = {
    status: 'ok',
    fields: { locations: { value: cities.map((city, i) => ({ address: `Straße ${i}, ${city}`, city })), confidence: 'high' } },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  assert.equal(candidate.locations.length, 4);
  assert.deepEqual(candidate.locations.map((l) => l.address).sort(), ['Straße 0, Ulm', 'Straße 2, Ulm', 'Straße 4, Ulm', 'Straße 6, Ulm']);
});

test('24f. zero Ulm-matching locations among several discovered -> noMatchingCityLocation true, no silent fallback to a nearby city (e.g. Neu-Ulm)', async () => {
  resetFixtures();
  aiResult = {
    status: 'ok',
    fields: {
      locations: {
        value: [
          { address: 'Carl-Zeiss-Str. 1, Neu-Ulm', city: 'Neu-Ulm' },
          { address: 'Industriestraße 2, Neu-Ulm', city: 'Neu-Ulm' },
        ],
        confidence: 'high',
      },
    },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  assert.equal(candidate.totalLocationsDiscovered, 2);
  assert.equal(candidate.multipleLocationsDetected, false);
  assert.equal(candidate.locations, null);
  assert.equal(candidate.noMatchingCityLocation, true);
  assert.equal(candidate.fields.address, undefined); // never silently uses the Neu-Ulm address
});

test('24g. an unresolvable authorized city (DB lookup failed) with 2+ discovered locations is also reported as noMatchingCityLocation, never a guess', async () => {
  resetFixtures();
  cityName = null; // resolveCityName() returns null
  aiResult = {
    status: 'ok',
    fields: { locations: { value: [{ address: 'A', city: 'Ulm' }, { address: 'B', city: 'Neu-Ulm' }], confidence: 'high' } },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  assert.equal(candidate.noMatchingCityLocation, true);
  assert.equal(candidate.locations, null);
});

test('24h. locationsTruncated passes through from the extraction layer to the final candidate, visibly, when present', async () => {
  resetFixtures();
  aiResult = {
    status: 'ok',
    fields: {
      locations: { value: [{ address: 'A', city: 'Ulm' }, { address: 'B', city: 'Ulm' }], confidence: 'high' },
      locationsTruncated: { value: true, confidence: 'high' },
    },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  assert.equal(candidate.locationsTruncated, true);
});

test('24i. locationsTruncated is false by default when the extraction layer never sent it', async () => {
  resetFixtures();
  aiResult = { status: 'ok', fields: { locations: { value: [{ address: 'A', city: 'Ulm' }, { address: 'B', city: 'Ulm' }], confidence: 'high' } } };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://betz.de/' });
  assert.equal(candidate.locationsTruncated, false);
});

test('24j. normalizeCityName: exact match only, case-insensitive, tolerates a stray leading postal code -- "Ulm" is never "Neu-Ulm"', () => {
  assert.equal(normalizeCityName('Ulm'), normalizeCityName('ulm'));
  assert.equal(normalizeCityName('  Ulm  '), normalizeCityName('Ulm'));
  assert.equal(normalizeCityName('89073 Ulm'), normalizeCityName('Ulm'));
  assert.notEqual(normalizeCityName('Neu-Ulm'), normalizeCityName('Ulm'));
  assert.notEqual(normalizeCityName('Ulm'), normalizeCityName('Neu-Ulm'));
});

test('25. exactly one location entry is folded into the normal top-level fields, multipleLocationsDetected stays false', async () => {
  resetFixtures();
  aiResult = {
    status: 'ok',
    fields: {
      name: { value: 'Café Solo', confidence: 'high' },
      locations: { value: [{ address: 'Einzelstr. 1, Ulm', phone: '0731 222' }], confidence: 'high' },
    },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://solo.example.com/' });
  assert.equal(candidate.multipleLocationsDetected, false);
  assert.equal(candidate.locations, null);
  assert.equal(candidate.fields.address.value, 'Einzelstr. 1, Ulm');
  assert.equal(candidate.fields.phone.value, '0731 222');
});

test('26. a normal single-location business with no "locations" key at all is completely unaffected (regression)', async () => {
  resetFixtures();
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.multipleLocationsDetected, false);
  assert.equal(candidate.locations, null);
});

test('27. an existing top-level address is never overwritten by a single "locations" entry', async () => {
  resetFixtures();
  aiResult = {
    status: 'ok',
    fields: {
      address: { value: 'Bereits Bekannte Str. 5', confidence: 'high' },
      locations: { value: [{ address: 'Andere Str. 9' }], confidence: 'high' },
    },
  };
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://x.example.com/' });
  assert.equal(candidate.fields.address.value, 'Bereits Bekannte Str. 5');
});

test('28. the manager\'s city name is looked up and passed to extractBusinessFields as cityContext', async () => {
  resetFixtures();
  cityName = 'Ulm';
  lastExtractionArgs = null;
  await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(lastExtractionArgs.cityContext, 'Ulm');
});

test('29. a city-name lookup failure never fails the research request -- cityContext is simply null', async () => {
  resetFixtures();
  cityName = null;
  lastExtractionArgs = null;
  const candidate = await researchBusiness(ULM, ULM_MANAGER_SCOPE, { websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(candidate.researchStatus, RESEARCH_STATUS.OK);
  assert.equal(lastExtractionArgs.cityContext, null);
});

test('30. splitLocationCandidates is a pure, backwards-compatible no-op when no "locations" key is present', () => {
  const fields = { name: { value: 'x', confidence: 'high', source: 's', sourceUrl: 'u' } };
  const result = splitLocationCandidates(fields, 'https://x.de/');
  assert.deepEqual(result.fields, fields);
  assert.equal(result.multipleLocationsDetected, false);
  assert.equal(result.locations, null);
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
