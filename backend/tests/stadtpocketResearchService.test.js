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

function resetFixtures() {
  listingLocationRows = [];
  webResult = { status: 'ok', content: 'scraped content', sourceUrl: 'https://www.brettle-ulm.de/', truncated: false };
  aiResult = { status: 'ok', fields: { name: { value: 'Café Brettle', confidence: 'high' }, phone: { value: '0731 000000', confidence: 'high' } } };
}
resetFixtures();

const mockPrisma = {
  stadtPocketListingLocation: {
    findMany: async ({ where }) => listingLocationRows.filter((r) => r.locationId === where.locationId).map((r) => ({ ...r, listing: { ...r.listing } })),
  },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

require.cache[webResearchPath] = {
  id: webResearchPath, filename: webResearchPath, loaded: true,
  exports: {
    STATUS: { OK: 'ok', INVALID_URL: 'invalid-url', UNSUPPORTED_PROTOCOL: 'unsupported-protocol', PRIVATE_TARGET: 'private-target', DNS_FAILURE: 'dns-failure', PROVIDER_UNAVAILABLE: 'provider-unavailable', UNREACHABLE: 'unreachable', EMPTY: 'empty' },
    fetchBusinessWebsiteContent: async () => webResult,
  },
};
require.cache[aiExtractionPath] = {
  id: aiExtractionPath, filename: aiExtractionPath, loaded: true,
  exports: {
    STATUS: { OK: 'ok', PROVIDER_UNAVAILABLE: 'provider-unavailable', UNAVAILABLE: 'unavailable', MALFORMED_OUTPUT: 'malformed-output' },
    extractBusinessFields: async () => aiResult,
  },
};

const { researchBusiness, StadtpocketResearchError, StadtpocketManagerError, RESEARCH_STATUS } = require('../src/services/stadtpocketResearchService');

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
  const original = require.cache[webResearchPath].exports.fetchBusinessWebsiteContent;
  require.cache[webResearchPath].exports.fetchBusinessWebsiteContent = async () => { webCalled = true; return webResult; };
  await expectThrow(() => researchBusiness(ULM, STUTTGART_MANAGER_SCOPE, { businessName: 'x' }), StadtpocketManagerError, 403);
  require.cache[webResearchPath].exports.fetchBusinessWebsiteContent = original;
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
