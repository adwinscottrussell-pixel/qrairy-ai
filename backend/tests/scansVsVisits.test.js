// ============================================================
// scansVsVisits.test.js — focused tests for the Scans vs Visits
// terminology/read-model correction.
//
// Confirms:
//   1. QR-backed dashboard items expose real totalScans.
//   2. LandingPage-backed items expose totalVisits.
//   3. LandingPage visits are not included in totalScans.
//   4. Dashboard totals calculate QR scans and visits separately.
//   5. A mixed QR + LandingPage account does not combine unlike
//      metrics on a single card.
//   6. Search results label LandingPage.scanCount as visits.
//   7. Existing QR redirect tracking (trackScan) remains unchanged.
//   8. Existing LandingPage visit counting (handleServeLP) remains
//      unchanged.
//
// No test framework dependency: uses Node's built-in `assert` and
// a tiny inline runner, following the same pattern as
// tests/lpScanAndPush.test.js and tests/searchService.test.js.
// Prisma (and @clerk/backend) are mocked by pre-seeding
// require.cache before the controllers/services are required, so
// no real DB or network call is ever made.
//
// Run: node tests/scansVsVisits.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath   = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath   = require.resolve('@clerk/backend');
const apnsServicePath    = resolve('src', 'services', 'apnsService.js');
const emailServicePath   = resolve('src', 'services', 'emailService.js');
const webPushServicePath = resolve('src', 'services', 'webPushService.js');

// ── Seed data (mutable, reset per test) ──────────────────────
let qrRows = [];
let lpRows = [];
let landingPagesBySlug = {}; // slug -> row, for lpController's findUnique/update flow
let scanCountUpdateCalls = [];
let scanCreateCalls = [];

function makeModel(rows = [], total = rows.length) {
  return {
    findMany: async () => rows,
    count: async () => total,
  };
}

const mockPrisma = {
  qR: {
    findMany: async (args) => {
      const uid = args && args.where && args.where.userId;
      return qrRows.filter(r => !uid || r.userId === uid);
    },
    count: async (args) => {
      const w = (args && args.where) || {};
      return qrRows.filter(r =>
        (!w.userId || r.userId === w.userId) &&
        (!w.businessName || !!r.businessName)
      ).length;
    },
  },
  landingPage: {
    findMany: async (args) => {
      const uid = args && args.where && args.where.userId;
      return lpRows.filter(r => !uid || r.userId === uid);
    },
    count: async () => lpRows.length,
    findUnique: async ({ where: { slug } }) => landingPagesBySlug[slug] || null,
    update: async (args) => {
      if (args.data && args.data.scanCount) scanCountUpdateCalls.push(args);
      const slug = args.where.slug;
      landingPagesBySlug[slug] = Object.assign({}, landingPagesBySlug[slug]);
      return landingPagesBySlug[slug];
    },
  },
  subscriber: Object.assign(makeModel([], 0), {
    groupBy: async () => [],
  }),
  user: {
    upsert: async ({ where }) => ({ id: where.id, plan: 'free', qrs: qrRows.filter(r => r.userId === where.id) }),
    findMany: async () => [],
    count: async () => 0,
  },
  pass: Object.assign(makeModel([], 0), {
    updateMany: async () => ({ count: 0 }),
  }),
  // Only exercised by handleServeLP's render/loyalty paths, unrelated to
  // the scan/visit correction — stubbed for parity with lpScanAndPush.test.js.
  passDevice: { findMany: async () => [] },
  pushCampaign: { create: async () => ({}) },
  webPushSubscription: { findMany: async () => [] },
  stampSettings: { findUnique: async () => null },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };
require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: { verifyToken: async () => ({ sub: 'user_test' }) },
};
// lpController.js requires these at module load time (not lazily) — stub
// them so requiring it never needs real API keys or network access.
require.cache[apnsServicePath] = {
  id: apnsServicePath, filename: apnsServicePath, loaded: true,
  exports: { pushUpdateToDevices: async () => ({ success: 0, failed: 0 }) },
};
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: { sendCampaignEmail: async () => ({ success: 0, failed: 0 }), sendWelcomeEmail: async () => ({ success: 0, failed: 0 }) },
};
require.cache[webPushServicePath] = {
  id: webPushServicePath, filename: webPushServicePath, loaded: true,
  exports: { sendWebPush: async () => ({ ok: true }) },
};

const { handleDashboard } = require('../src/controllers/qrController');
const { handleServeLP } = require('../src/controllers/lpController');
const { trackScan } = require('../src/utils/scanTracker');
const searchService = require('../src/services/searchService');

function resetMocks() {
  qrRows = [];
  lpRows = [];
  landingPagesBySlug = {};
  scanCountUpdateCalls = [];
  scanCreateCalls = [];
}

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
  };
}

async function flush() {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

function makeLpPage(slug, overrides = {}) {
  const page = Object.assign({
    id: 'lp_' + slug, slug, businessName: 'Test Business', websiteUrl: 'https://example.com',
    useCase: 'local_business', brandColor: '#000064', logoUrl: null, userId: 'user_test',
    qrType: 'ai', template: 'premium', status: 'live', scanCount: 0,
    createdAt: new Date(), updatedAt: new Date(),
    sections: JSON.stringify({
      language: 'en', hero: { aiTitle: 'Hi', aiSubtitle: 'World' }, featured: [],
      businessInfo: {}, actionLinks: [], voice: { language: 'en', voiceKey: 'sarah', customText: '' },
      buttons: [], theme: { accentColor: '#000064', background: 'dark' },
    }),
  }, overrides);
  landingPagesBySlug[slug] = page;
  return page;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const AUTH_REQ = { headers: { authorization: 'Bearer test-token' } };

// ── 1. QR-backed dashboard items expose real totalScans ──────

test('handleDashboard: QR-backed item exposes real totalScans from the Scan relation', async () => {
  resetMocks();
  qrRows.push({
    id: 'qr_1', userId: 'user_test', originalUrl: 'https://example.com', businessName: null,
    isDynamic: false, destinationUrl: null, createdAt: new Date(),
    scans: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], subscribers: [],
  });

  const res = fakeRes();
  await handleDashboard(AUTH_REQ, res);

  const card = res.body.dashboard.find(c => c.id === 'qr_1');
  assert.equal(card.source, 'qr');
  assert.equal(card.totalScans, 3);
});

// ── 2. LandingPage-backed items expose totalVisits ────────────

test('handleDashboard: LandingPage-backed item exposes LandingPage.scanCount as totalVisits', async () => {
  resetMocks();
  lpRows.push({
    id: 'lp_1', userId: 'user_test', slug: 'my-page', businessName: 'My Page',
    websiteUrl: 'https://example.com', scanCount: 7, createdAt: new Date(),
  });

  const res = fakeRes();
  await handleDashboard(AUTH_REQ, res);

  const card = res.body.dashboard.find(c => c.slug === 'my-page');
  assert.equal(card.source, 'lp');
  assert.equal(card.totalVisits, 7);
});

// ── 3. LandingPage visits are not included in totalScans ──────

test('handleDashboard: LandingPage visits never appear under totalScans', async () => {
  resetMocks();
  qrRows.push({
    id: 'qr_2', userId: 'user_test', originalUrl: 'https://example.com', businessName: null,
    isDynamic: false, destinationUrl: null, createdAt: new Date(),
    scans: [{ id: 's1' }, { id: 's2' }], subscribers: [],
  });
  lpRows.push({
    id: 'lp_2', userId: 'user_test', slug: 'other-page', businessName: 'Other Page',
    websiteUrl: 'https://example.com', scanCount: 9, createdAt: new Date(),
  });

  const res = fakeRes();
  await handleDashboard(AUTH_REQ, res);

  const totalScansAcrossAllCards = res.body.dashboard.reduce((s, c) => s + (c.totalScans || 0), 0);
  assert.equal(totalScansAcrossAllCards, 2, 'the LP visits (9) must not leak into any totalScans field');

  const lpCard = res.body.dashboard.find(c => c.slug === 'other-page');
  assert.equal(lpCard.totalScans, undefined, 'LP cards must not expose totalScans at all');
});

// ── 4. Dashboard totals calculate QR scans and visits separately ──

test('handleDashboard: QR scan total and LP visit total can be computed independently and correctly', async () => {
  resetMocks();
  qrRows.push(
    { id: 'qr_3', userId: 'user_test', originalUrl: 'https://a.com', businessName: null, isDynamic: false, destinationUrl: null, createdAt: new Date(), scans: [{ id: 's1' }], subscribers: [] },
    { id: 'qr_4', userId: 'user_test', originalUrl: 'https://b.com', businessName: null, isDynamic: false, destinationUrl: null, createdAt: new Date(), scans: [{ id: 's1' }, { id: 's2' }], subscribers: [] }
  );
  lpRows.push(
    { id: 'lp_3', userId: 'user_test', slug: 'page-a', businessName: 'Page A', websiteUrl: 'https://a.com', scanCount: 5, createdAt: new Date() },
    { id: 'lp_4', userId: 'user_test', slug: 'page-b', businessName: 'Page B', websiteUrl: 'https://b.com', scanCount: 4, createdAt: new Date() }
  );

  const res = fakeRes();
  await handleDashboard(AUTH_REQ, res);

  const qrTotal = res.body.dashboard.filter(c => c.source === 'qr').reduce((s, c) => s + (c.totalScans || 0), 0);
  const visitTotal = res.body.dashboard.filter(c => c.source === 'lp').reduce((s, c) => s + (c.totalVisits || 0), 0);
  assert.equal(qrTotal, 3);
  assert.equal(visitTotal, 9);
});

// ── 5. A mixed QR + LandingPage account does not combine unlike metrics ──

test('handleDashboard: mixed account — no card carries both totalScans and totalVisits', async () => {
  resetMocks();
  qrRows.push({ id: 'qr_5', userId: 'user_test', originalUrl: 'https://c.com', businessName: null, isDynamic: false, destinationUrl: null, createdAt: new Date(), scans: [{ id: 's1' }], subscribers: [] });
  lpRows.push({ id: 'lp_5', userId: 'user_test', slug: 'page-c', businessName: 'Page C', websiteUrl: 'https://c.com', scanCount: 6, createdAt: new Date() });

  const res = fakeRes();
  await handleDashboard(AUTH_REQ, res);

  for (const card of res.body.dashboard) {
    if (card.source === 'qr') {
      assert.equal(card.totalVisits, undefined, 'QR cards must not expose totalVisits');
      assert.equal(typeof card.totalScans, 'number');
    } else if (card.source === 'lp') {
      assert.equal(card.totalScans, undefined, 'LP cards must not expose totalScans');
      assert.equal(typeof card.totalVisits, 'number');
    }
  }
});

// ── 6. Search results label LandingPage.scanCount as visits ──

test('searchService.search: Landing Page results expose visitCount, not scanCount', async () => {
  resetMocks();
  lpRows.push({
    id: 'lp_search_1', slug: 'searchable-acme', businessName: 'Acme Search Co',
    status: 'live', scanCount: 42, updatedAt: new Date(), userId: 'user_test',
  });

  const { results } = await searchService.search('searchable-acme', 10);
  const item = results.landingPages.items.find(i => i.slug === 'searchable-acme');

  assert.ok(item, 'expected the seeded landing page to be found');
  assert.equal(item.visitCount, 42);
  assert.equal(item.scanCount, undefined, 'search results must not expose the raw scanCount field name');
  // "businesses" is the same LandingPage-backed resolver surfaced twice.
  assert.equal(results.businesses.items.find(i => i.slug === 'searchable-acme').visitCount, 42);
});

// ── 7. Existing QR redirect tracking remains unchanged ────────

test('trackScan (QR redirect system) still creates a Scan row via qrId — untouched by this correction', async () => {
  resetMocks();
  mockPrisma.scan = { create: async (args) => { scanCreateCalls.push(args); return { id: 'scan_1', ...args.data }; } };
  mockPrisma.qR.update = async () => ({});

  await trackScan('qr_untouched', { headers: { 'user-agent': 'test-agent' } });

  assert.equal(scanCreateCalls.length, 1);
  assert.equal(scanCreateCalls[0].data.qrId, 'qr_untouched');
  assert.equal(scanCountUpdateCalls.length, 0, 'QR scans must never touch LandingPage.scanCount');
});

// ── 8. Existing LandingPage visit counting remains unchanged ──

test('handleServeLP: a real visit still increments LandingPage.scanCount exactly once — untouched by this correction', async () => {
  resetMocks();
  makeLpPage('visit-untouched');
  const req = { params: { slug: 'visit-untouched' }, query: {} };
  const res = fakeRes();

  await handleServeLP(req, res);
  await flush();

  assert.equal(scanCountUpdateCalls.length, 1);
  assert.deepEqual(scanCountUpdateCalls[0].where, { slug: 'visit-untouched' });
  assert.deepEqual(scanCountUpdateCalls[0].data, { scanCount: { increment: 1 } });
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
