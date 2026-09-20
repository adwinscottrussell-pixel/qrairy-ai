// ============================================================
// stadtpocketResearchRoutes.test.js — Phase 1B (AI Business
// Onboarding). Mocked-Prisma/Clerk/provider tests for
// managerStadtpocketResearchRoutes.js, following the exact pattern
// established by tests/stadtpocketOfferRoutes.test.js -- no real DB/
// Clerk/network call is ever made.
//
// Run: node tests/stadtpocketResearchRoutes.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');
const webResearchPath = resolve('src', 'services', 'stadtpocketWebResearchService.js');
const aiExtractionPath = resolve('src', 'services', 'stadtpocketAiExtractionService.js');

const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const NET1 = 'net_stadtpocket';

let networkMemberRows = [];
let listingLocationRows = [];
let tokenValid = true;
let currentUserId = 'ulm_manager';
let currentRole = 'staff';
let webResult;
let aiResult;

function resetFixtures() {
  networkMemberRows = [
    { userId: 'ulm_manager', role: 'location_manager', locationId: ULM, networkId: NET1 },
    { userId: 'rate_limit_test_manager', role: 'location_manager', locationId: ULM, networkId: NET1 },
  ];
  listingLocationRows = [];
  tokenValid = true;
  currentUserId = 'ulm_manager';
  currentRole = 'staff';
  webResult = { status: 'ok', content: 'x', sourceUrl: 'https://www.brettle-ulm.de/', truncated: false };
  aiResult = { status: 'ok', fields: { name: { value: 'Café Brettle', confidence: 'high' } } };
}
resetFixtures();

const mockPrisma = {
  networkMember: { findMany: async ({ where }) => networkMemberRows.filter((r) => r.userId === where.userId) },
  location: { findMany: async () => [], findUnique: async () => ({ name: 'Ulm' }) },
  stadtPocketListingLocation: {
    findMany: async ({ where }) => listingLocationRows.filter((r) => r.locationId === where.locationId).map((r) => ({ ...r, listing: { ...r.listing } })),
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
    createClerkClient: () => ({ users: { getUser: async (id) => ({ id, publicMetadata: { role: currentRole } }) } }),
  },
};

require.cache[webResearchPath] = {
  id: webResearchPath, filename: webResearchPath, loaded: true,
  exports: {
    STATUS: { OK: 'ok', INVALID_URL: 'invalid-url', UNSUPPORTED_PROTOCOL: 'unsupported-protocol', PRIVATE_TARGET: 'private-target', DNS_FAILURE: 'dns-failure', PROVIDER_UNAVAILABLE: 'provider-unavailable', UNREACHABLE: 'unreachable', EMPTY: 'empty' },
    fetchBusinessWebsiteResearch: async () => webResult,
  },
};
require.cache[aiExtractionPath] = {
  id: aiExtractionPath, filename: aiExtractionPath, loaded: true,
  exports: {
    STATUS: { OK: 'ok', PROVIDER_UNAVAILABLE: 'provider-unavailable', UNAVAILABLE: 'unavailable', MALFORMED_OUTPUT: 'malformed-output' },
    extractBusinessFields: async () => aiResult,
  },
};

const routes = require('../src/routes/managerStadtpocketResearchRoutes');
const { requireStadtpocketWriteScope } = require('../src/middleware/stadtpocketManagerAuth');

function fakeReq({ auth = true, params = {}, body = {}, ip = '10.10.10.10' } = {}) {
  return { headers: auth ? { authorization: 'Bearer test-token' } : {}, params, body, ip, method: 'POST', originalUrl: '/manager/stadtpocket/listings' };
}
function fakeRes() {
  return {
    statusCode: undefined, body: undefined, headers: {},
    status(code) { this.statusCode = code; return this; },
    // Real Express res.json()/res.send() default to 200 when .status()
    // wasn't called first -- matched here since handleResearch's success
    // path (like several existing handlers elsewhere in this repo) relies
    // on that default rather than calling .status(200) explicitly.
    json(body) { if (this.statusCode === undefined) this.statusCode = 200; this.body = body; return this; },
    send(body) { if (this.statusCode === undefined) this.statusCode = 200; this.body = body; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
  };
}

// Same convention as tests/stadtpocketOfferRoutes.test.js's callRoute --
// auth then the handler directly. The dedicated rate limiter is a real
// piece of Express middleware tested on its own below (test 8), not
// threaded through every functional test here, exactly like this
// repo's existing route tests never exercise index.js's app-wide
// rate limiter either.
async function callRoute(handler, req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireStadtpocketWriteScope(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res;
  await handler(req, res);
  return res;
}

// Exercises routes.researchRateLimiter directly and in isolation --
// confirmed in manual testing that awaiting the middleware call itself
// resolves once it has either called next() or ended the response.
async function callLimiterOnly(req) {
  const res = fakeRes();
  let nextCalled = false;
  await routes.researchRateLimiter(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. unauthenticated request -> 401, no research attempted', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleResearch, fakeReq({ auth: false, params: { locationId: ULM }, body: { businessName: 'x' } }));
  assert.equal(res.statusCode, 401);
});

test('2. Ulm manager researching an Ulm business -> 200, candidate returned', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleResearch, fakeReq({ params: { locationId: ULM }, body: { businessName: 'Café Brettle', websiteUrl: 'https://www.brettle-ulm.de/' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.candidate.researchStatus, 'ok');
  assert.equal(res.body.candidate.requestedBy, 'ulm_manager');
});

test('3. a manager with no scope over Stuttgart is rejected (403) researching a Stuttgart business', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleResearch, fakeReq({ params: { locationId: STUTTGART }, body: { businessName: 'x' } }));
  assert.equal(res.statusCode, 403);
});

test('4. Global Admin (publicMetadata.role=admin) bypasses manager-scope lookup entirely', async () => {
  resetFixtures();
  currentUserId = 'someone_not_a_manager';
  currentRole = 'admin';
  const res = await callRoute(routes.handleResearch, fakeReq({ params: { locationId: STUTTGART }, body: { businessName: 'x', websiteUrl: 'https://x.de' } }));
  assert.equal(res.statusCode, 200);
});

test('5. malformed request body (neither name nor URL) -> 400', async () => {
  resetFixtures();
  const res = await callRoute(routes.handleResearch, fakeReq({ params: { locationId: ULM }, body: {} }));
  assert.equal(res.statusCode, 400);
});

test('6. a website flagged as a private/internal target surfaces as a 200 with an honest researchStatus, not an unhandled error', async () => {
  resetFixtures();
  webResult = { status: 'private-target' };
  const res = await callRoute(routes.handleResearch, fakeReq({ params: { locationId: ULM }, body: { websiteUrl: 'http://169.254.169.254/' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.candidate.researchStatus, 'website-rejected');
});

test('7. research provider unavailable -> 200 with an honest researchStatus, business not blocked from being reported on', async () => {
  resetFixtures();
  aiResult = { status: 'provider-unavailable', fields: {} };
  const res = await callRoute(routes.handleResearch, fakeReq({ params: { locationId: ULM }, body: { websiteUrl: 'https://www.brettle-ulm.de/' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.candidate.researchStatus, 'provider-unavailable');
});

test('8. the dedicated research rate limiter blocks a manager after its bounded max, independent of the app-wide limiter', async () => {
  resetFixtures();
  // Exercises routes.researchRateLimiter directly and in isolation, with
  // a dedicated req.stadtpocketScope.userId of its own -- not shared
  // with any other test's rate-limit bucket, so this count is exact.
  const results = [];
  for (let i = 0; i < 11; i++) {
    const req = fakeReq({ params: { locationId: ULM }, body: {} });
    req.stadtpocketScope = { userId: 'rate_limit_test_manager', isGlobalAdmin: false, locationIds: [ULM] };
    const { res } = await callLimiterOnly(req);
    results.push(res.statusCode);
  }
  assert.deepEqual(results.slice(0, 10), Array(10).fill(undefined), 'the first 10 calls should pass through untouched (status only set by a later handler, which this test never calls)');
  assert.equal(results[10], 429, 'the 11th research call in the window should be rate-limited (max is 10)');
});

test('9. no offer/loyalty/update/business row is ever created by a research call -- mockPrisma exposes no such write method', async () => {
  resetFixtures();
  assert.equal(mockPrisma.stadtPocketOffer, undefined);
  assert.equal(mockPrisma.stadtPocketListing, undefined);
  assert.equal(mockPrisma.business, undefined);
  const res = await callRoute(routes.handleResearch, fakeReq({ params: { locationId: ULM }, body: { businessName: 'x', websiteUrl: 'https://www.brettle-ulm.de/' } }));
  assert.equal(res.statusCode, 200); // reaching 200 without a thrown "not a function" error is the proof
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
