// ============================================================
// searchService.test.js — mocked-Prisma tests for Universal
// Operations Search backend corrections (SP2.2).
//
// No test framework dependency: uses Node's built-in `assert`
// and a tiny inline runner. Prisma is mocked by pre-seeding
// require.cache for '../src/utils/prismaClient' before the
// service/controller modules are required, so no real DB
// connection is ever made.
//
// Run: node tests/searchService.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

const prismaClientPath = require.resolve(path.join(__dirname, '..', 'src', 'utils', 'prismaClient.js'));

function makeModel(rows = [], total = rows.length) {
  const model = {
    lastArgs: undefined,
    findMany: async (args) => { model.lastArgs = args; return rows; },
    count: async () => total,
  };
  return model;
}

const mockPrisma = {
  user: makeModel(),
  landingPage: makeModel(),
  qR: makeModel(),
  subscriber: makeModel(),
  pass: makeModel(),
};

require.cache[prismaClientPath] = {
  id: prismaClientPath,
  filename: prismaClientPath,
  loaded: true,
  exports: mockPrisma,
};

const searchService = require('../src/services/searchService');
const { handleSearch } = require('../src/controllers/opsSearchController');

function resetMocks() {
  mockPrisma.user = makeModel();
  mockPrisma.landingPage = makeModel();
  mockPrisma.qR = makeModel();
  mockPrisma.subscriber = makeModel();
  mockPrisma.pass = makeModel();
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. Landing Page exact-ID lookup + ranking ─────────────────

test('LandingPage: exact internal ID ranks above exact slug, prefix, contains', async () => {
  resetMocks();
  const rows = [
    { id: 'row-b-id', slug: 'acme', businessName: 'Something Else B', status: 'live', scanCount: 0, updatedAt: '2026-01-02' },
    { id: 'row-d-id', slug: 'some-slug-d', businessName: 'Downtown Acme Boutique', status: 'live', scanCount: 0, updatedAt: '2026-01-04' },
    { id: 'acme', slug: 'acme-hq', businessName: 'Acme HQ Internal', status: 'live', scanCount: 0, updatedAt: '2026-01-01' },
    { id: 'row-c-id', slug: 'some-slug-c', businessName: 'Acme Roasters', status: 'live', scanCount: 0, updatedAt: '2026-01-03' },
  ];
  mockPrisma.landingPage = makeModel(rows, rows.length);

  const { results } = await searchService.search('acme', 10);
  const slugs = results.landingPages.items.map(i => i.slug);
  assert.deepEqual(slugs, ['acme-hq', 'acme', 'some-slug-c', 'some-slug-d'],
    'expected order: exact id, exact slug, prefix, contains');
});

test('LandingPage: exact ID query with no slug/name overlap still resolves', async () => {
  resetMocks();
  const rows = [
    { id: 'lp_9f3a2b', slug: 'unrelated-slug', businessName: 'Totally Unrelated', status: 'live', scanCount: 0, updatedAt: '2026-01-01' },
  ];
  mockPrisma.landingPage = makeModel(rows, rows.length);

  const { results } = await searchService.search('lp_9f3a2b', 10);
  assert.equal(results.landingPages.items.length, 1);
  assert.equal(results.landingPages.items[0].slug, 'unrelated-slug');
});

// ── 2. Minimum query behavior ──────────────────────────────────

test('Query length: empty query -> 400', async () => {
  const req = { query: { q: '' } };
  const res = fakeRes();
  await handleSearch(req, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
});

test('Query length: 1-character query restricts LandingPage to exact id/slug only (no contains clauses)', async () => {
  resetMocks();
  mockPrisma.landingPage = makeModel([], 0);
  await searchService.search('a', 10);
  const where = mockPrisma.landingPage.lastArgs.where;
  assert.equal(where.OR.length, 2, 'only { id: q } and { slug: q } should be present for a 1-char query');
  for (const clause of where.OR) {
    assert.ok('id' in clause || 'slug' in clause);
    assert.equal(typeof Object.values(clause)[0], 'string', 'exact clauses only, no contains objects');
  }
});

test('Query length: 2-character query enables general substring search', async () => {
  resetMocks();
  mockPrisma.landingPage = makeModel([], 0);
  await searchService.search('ac', 10);
  const where = mockPrisma.landingPage.lastArgs.where;
  assert.equal(where.OR.length, 4, 'id, slug exact, businessName contains, slug contains');
  const hasContains = where.OR.some(c => c.businessName && c.businessName.contains === 'ac');
  assert.ok(hasContains, 'expected businessName contains clause at length 2');
});

test('Query length: classifyQuery marks length-1 as not fuzzy-eligible, length-2 as eligible', () => {
  assert.equal(searchService.classifyQuery('a').fuzzyEligible, false);
  assert.equal(searchService.classifyQuery('ac').fuzzyEligible, true);
});

// ── 3. Failure isolation ───────────────────────────────────────

test('Failure isolation: one resolver failure returns partial results, endpoint stays 200', async () => {
  resetMocks();
  mockPrisma.user.findMany = async () => { throw new Error('connection reset by peer at 10.0.4.12:5432'); };
  mockPrisma.landingPage = makeModel(
    [{ id: 'lp1', slug: 'acme', businessName: 'Acme', status: 'live', scanCount: 1, updatedAt: '2026-01-01' }],
    1
  );

  const req = { query: { q: 'acme' } };
  const res = fakeRes();
  await handleSearch(req, res);

  assert.equal(res.statusCode, 200, 'endpoint must stay 200 when other groups succeed');
  assert.deepEqual(res.body.results.users, { items: [], total: 0, hasMore: false, error: 'unavailable' });
  assert.equal(res.body.results.landingPages.items.length, 1, 'successful group must still return data');

  const serialized = JSON.stringify(res.body);
  assert.ok(!/connection reset|5432|prisma|Prisma|at .*:\d+/.test(serialized),
    'response must not leak error message, stack, or DB details');
});

// ── 4. Masking ──────────────────────────────────────────────────

test('Masking: user email/phone and pass serial are masked in search results', async () => {
  resetMocks();
  mockPrisma.user = makeModel(
    [{ id: 'u1', email: 'jane@acmecoffee.com', phone: '5551234567', plan: 'pro', createdAt: '2026-01-01', _count: { qrs: 2 } }],
    1
  );
  mockPrisma.pass = makeModel(
    [{ id: 'p1', serialNumber: 'sqr-acme-downtown-a1b2', slug: 'acme', stampCount: 3, stampGoal: 10, rewardReady: false, lastStampAt: '2026-01-01' }],
    1
  );

  const { results } = await searchService.search('acme', 10);
  assert.ok(!results.users.items[0].email.includes('jane@acmecoffee.com'));
  assert.match(results.users.items[0].email, /^j\*+@acmecoffee\.com$/);
  assert.ok(!results.users.items[0].phone.includes('5551234567'));
  assert.match(results.users.items[0].phone, /^\*{3}-\*{3}-4567$/);
  assert.ok(!results.walletPasses.items[0].serialNumber.includes('sqr-acme-downtown-a1b2'));
  assert.match(results.walletPasses.items[0].serialNumber, /^sqr-acme-\*{3}-a1b2$/);
});

// ── 5. Grouped limits ────────────────────────────────────────────

test('Grouped limits: group truncates to limit and reports hasMore', async () => {
  resetMocks();
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: `qr-${i}`, businessName: 'Acme', originalUrl: 'https://acme.test', isDynamic: true,
    createdAt: `2026-01-0${i + 1}`, _count: { scans: 0 },
  }));
  mockPrisma.qR = makeModel(rows, 5);

  const { results } = await searchService.search('acme', 2);
  assert.equal(results.qrCodes.items.length, 2);
  assert.equal(results.qrCodes.total, 5);
  assert.equal(results.qrCodes.hasMore, true);
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
