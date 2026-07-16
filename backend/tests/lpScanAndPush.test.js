// ============================================================
// lpScanAndPush.test.js — focused tests for two production
// bug fixes in lpController.js:
//
//   1. Smart Landing Page scan tracking (handleServeLP now
//      increments LandingPage.scanCount for real, non-preview
//      visits).
//   2. Push delivery reporting (handleSendPush now returns an
//      accurate per-channel wallet/email/webPush/total
//      breakdown, alongside preserved legacy fields).
//
// No test framework dependency: uses Node's built-in `assert`
// and a tiny inline runner, following the same pattern as
// tests/supportActionService.test.js and tests/attentionService.test.js.
// Prisma (and the lazily-required push-channel services) are
// mocked by pre-seeding require.cache before lpController.js and
// its dependencies are required, so no real DB or network call is
// ever made.
//
// Run: node tests/lpScanAndPush.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath   = resolve('src', 'utils', 'prismaClient.js');
const apnsServicePath    = resolve('src', 'services', 'apnsService.js');
const emailServicePath   = resolve('src', 'services', 'emailService.js');
const webPushServicePath = resolve('src', 'services', 'webPushService.js');

// ── Mock Prisma ──────────────────────────────────────────────

let scanCountUpdateCalls = [];
let landingPages = {}; // slug -> page row

const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug } }) {
      return landingPages[slug] || null;
    },
    async update(args) {
      if (args.data && args.data.scanCount) scanCountUpdateCalls.push(args);
      const slug = args.where.slug;
      landingPages[slug] = Object.assign({}, landingPages[slug]);
      return landingPages[slug];
    },
  },
  passDevice: { async findMany() { return mockPrisma._devices || []; } },
  pass: { async updateMany() { return { count: 0 }; } },
  pushCampaign: { async create() { return {}; } },
  subscriber: { async findMany() { return mockPrisma._emailSubs || []; } },
  webPushSubscription: { async findMany() { return mockPrisma._webSubs || []; } },
  stampSettings: { async findUnique() { return null; } },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// ── Mock the lazily-required push-channel services ──────────
require.cache[apnsServicePath] = {
  id: apnsServicePath, filename: apnsServicePath, loaded: true,
  exports: { pushUpdateToDevices: async (devices) => mockPrisma._walletResult || { success: 0, failed: 0 } },
};
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: {
    sendCampaignEmail: async (subs) => mockPrisma._emailResult || { success: 0, failed: 0 },
    sendWelcomeEmail: async () => ({ success: 0, failed: 0 }),
  },
};
require.cache[webPushServicePath] = {
  id: webPushServicePath, filename: webPushServicePath, loaded: true,
  exports: { sendWebPush: async () => (mockPrisma._webPushResults ? mockPrisma._webPushResults.shift() : { ok: true }) },
};

const { handleServeLP, handleSendPush } = require('../src/controllers/lpController');
const { trackScan } = require('../src/utils/scanTracker');

function resetMocks() {
  scanCountUpdateCalls = [];
  landingPages = {};
  mockPrisma._devices = [];
  mockPrisma._emailSubs = [];
  mockPrisma._webSubs = [];
  mockPrisma._walletResult = { success: 0, failed: 0 };
  mockPrisma._emailResult = { success: 0, failed: 0 };
  mockPrisma._webPushResults = [];
}

function makePage(slug, overrides = {}) {
  const page = Object.assign({
    id: 'lp_' + slug,
    slug,
    businessName: 'Test Business',
    websiteUrl: 'https://example.com',
    useCase: 'local_business',
    brandColor: '#000064',
    logoUrl: null,
    userId: 'user_test',
    qrType: 'ai',
    template: 'premium',
    status: 'live',
    scanCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    sections: JSON.stringify({
      language: 'en',
      hero: { aiTitle: 'Hello', aiSubtitle: 'World' },
      featured: [],
      businessInfo: {},
      actionLinks: [],
      voice: { language: 'en', voiceKey: 'sarah', customText: '' },
      buttons: [],
      theme: { accentColor: '#000064', background: 'dark' },
    }),
  }, overrides);
  landingPages[slug] = page;
  return page;
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
  // Flush the fire-and-forget setImmediate scan-count increment.
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. Smart Landing Page scan recording ────────────────────

test('handleServeLP: a real visit to a live page increments scanCount exactly once', async () => {
  resetMocks();
  makePage('scan-test-1');
  const req = { params: { slug: 'scan-test-1' }, query: {} };
  const res = fakeRes();

  await handleServeLP(req, res);
  await flush();

  assert.equal(scanCountUpdateCalls.length, 1);
  assert.deepEqual(scanCountUpdateCalls[0].where, { slug: 'scan-test-1' });
  assert.deepEqual(scanCountUpdateCalls[0].data, { scanCount: { increment: 1 } });
});

// ── 2. Duplicate / unwanted-count protection ────────────────

test('handleServeLP: ?preview=1 does not increment scanCount', async () => {
  resetMocks();
  makePage('scan-test-preview');
  const req = { params: { slug: 'scan-test-preview' }, query: { preview: '1' } };
  const res = fakeRes();

  await handleServeLP(req, res);
  await flush();

  assert.equal(scanCountUpdateCalls.length, 0);
});

test('handleServeLP: ?t= cache-bust does not increment scanCount', async () => {
  resetMocks();
  makePage('scan-test-t');
  const req = { params: { slug: 'scan-test-t' }, query: { t: '12345' } };
  const res = fakeRes();

  await handleServeLP(req, res);
  await flush();

  assert.equal(scanCountUpdateCalls.length, 0);
});

test('handleServeLP: draft page returns 404 and does not increment scanCount', async () => {
  resetMocks();
  makePage('scan-test-draft', { status: 'draft' });
  const req = { params: { slug: 'scan-test-draft' }, query: {} };
  const res = fakeRes();

  await handleServeLP(req, res);
  await flush();

  assert.equal(res.statusCode, 404);
  assert.equal(scanCountUpdateCalls.length, 0);
});

test('handleServeLP: missing page returns 404 and does not increment scanCount', async () => {
  resetMocks();
  const req = { params: { slug: 'does-not-exist' }, query: {} };
  const res = fakeRes();

  await handleServeLP(req, res);
  await flush();

  assert.equal(res.statusCode, 404);
  assert.equal(scanCountUpdateCalls.length, 0);
});

test('handleServeLP: two separate real visits increment scanCount twice, once each', async () => {
  resetMocks();
  makePage('scan-test-twice');
  const res1 = fakeRes();
  const res2 = fakeRes();

  await handleServeLP({ params: { slug: 'scan-test-twice' }, query: {} }, res1);
  await flush();
  await handleServeLP({ params: { slug: 'scan-test-twice' }, query: {} }, res2);
  await flush();

  assert.equal(scanCountUpdateCalls.length, 2);
});

// ── 3. Push response structure ───────────────────────────────

test('handleSendPush: response includes wallet/email/webPush per-channel reporting with correct math', async () => {
  resetMocks();
  mockPrisma._devices = [{ pushToken: 'tok1' }, { pushToken: 'tok2' }];
  mockPrisma._walletResult = { success: 1, failed: 1 };
  mockPrisma._emailSubs = [{ id: 's1', email: 'a@example.com' }, { id: 's2', email: 'b@example.com' }];
  mockPrisma._emailResult = { success: 2, failed: 0 };
  mockPrisma._webSubs = [{ endpoint: 'e1', p256dh: 'p1', auth: 'a1' }, { endpoint: 'e2', p256dh: 'p2', auth: 'a2' }, { endpoint: 'e3', p256dh: 'p3', auth: 'a3' }];
  mockPrisma._webPushResults = [{ ok: true }, { ok: true }, { ok: false }];
  makePage('push-test-1');

  const req = { params: { slug: 'push-test-1' }, body: { title: 'Hi', message: 'There' } };
  const res = fakeRes();
  await handleSendPush(req, res);

  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.wallet, { attempted: 2, sent: 1, failed: 1 });
  assert.deepEqual(res.body.email, { attempted: 2, sent: 2, failed: 0 });
  assert.deepEqual(res.body.webPush, { attempted: 3, sent: 2, failed: 1 });
});

test('handleSendPush: total === wallet.attempted (legacy wallet-only meaning preserved, remains numeric)', async () => {
  resetMocks();
  mockPrisma._devices = [{ pushToken: 'tok1' }, { pushToken: 'tok2' }];
  mockPrisma._walletResult = { success: 1, failed: 1 };
  makePage('push-test-total-numeric');

  const req = { params: { slug: 'push-test-total-numeric' }, body: { title: 'Hi', message: 'There' } };
  const res = fakeRes();
  await handleSendPush(req, res);

  assert.equal(typeof res.body.total, 'number');
  assert.equal(res.body.total, 2);
  assert.equal(res.body.total, res.body.wallet.attempted);
});

test('handleSendPush: deliveryTotal is the combined object across all three channels', async () => {
  resetMocks();
  mockPrisma._devices = [{ pushToken: 'tok1' }, { pushToken: 'tok2' }];
  mockPrisma._walletResult = { success: 1, failed: 1 };
  mockPrisma._emailSubs = [{ id: 's1', email: 'a@example.com' }, { id: 's2', email: 'b@example.com' }];
  mockPrisma._emailResult = { success: 2, failed: 0 };
  mockPrisma._webSubs = [{ endpoint: 'e1', p256dh: 'p1', auth: 'a1' }, { endpoint: 'e2', p256dh: 'p2', auth: 'a2' }, { endpoint: 'e3', p256dh: 'p3', auth: 'a3' }];
  mockPrisma._webPushResults = [{ ok: true }, { ok: true }, { ok: false }];
  makePage('push-test-deliverytotal');

  const req = { params: { slug: 'push-test-deliverytotal' }, body: { title: 'Hi', message: 'There' } };
  const res = fakeRes();
  await handleSendPush(req, res);

  assert.equal(typeof res.body.deliveryTotal, 'object');
  assert.deepEqual(res.body.deliveryTotal, { attempted: 7, sent: 5, failed: 2 });
  // deliveryTotal.attempted equals the sum of all channel attempts
  assert.equal(res.body.deliveryTotal.attempted, res.body.wallet.attempted + res.body.email.attempted + res.body.webPush.attempted);
  // deliveryTotal.sent equals the sum of all channel successes
  assert.equal(res.body.deliveryTotal.sent, res.body.wallet.sent + res.body.email.sent + res.body.webPush.sent);
  // deliveryTotal.failed equals the sum of all channel failures
  assert.equal(res.body.deliveryTotal.failed, res.body.wallet.failed + res.body.email.failed + res.body.webPush.failed);
  // total is unrelated to deliveryTotal — legacy wallet-only number, not the combined total
  assert.notEqual(res.body.total, res.body.deliveryTotal.attempted);
});

test('handleSendPush: a channel with zero recipients reports {attempted:0, sent:0, failed:0}; total: 0; deliveryTotal all zero', async () => {
  resetMocks();
  makePage('push-test-empty');
  const req = { params: { slug: 'push-test-empty' }, body: { title: 'Hi', message: 'There' } };
  const res = fakeRes();

  await handleSendPush(req, res);

  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.wallet, { attempted: 0, sent: 0, failed: 0 });
  assert.deepEqual(res.body.email, { attempted: 0, sent: 0, failed: 0 });
  assert.deepEqual(res.body.webPush, { attempted: 0, sent: 0, failed: 0 });
  assert.equal(res.body.total, 0);
  assert.deepEqual(res.body.deliveryTotal, { attempted: 0, sent: 0, failed: 0 });
});

// ── 4. Backward compatibility ────────────────────────────────

test('handleSendPush: legacy sent/failed/emailSent/emailFailed fields are numerically unchanged (wallet-only, email-only)', async () => {
  resetMocks();
  mockPrisma._devices = [{ pushToken: 'tok1' }];
  mockPrisma._walletResult = { success: 1, failed: 0 };
  mockPrisma._emailSubs = [{ id: 's1', email: 'a@example.com' }];
  mockPrisma._emailResult = { success: 1, failed: 0 };
  mockPrisma._webSubs = [{ endpoint: 'e1', p256dh: 'p1', auth: 'a1' }];
  mockPrisma._webPushResults = [{ ok: true }];
  makePage('push-test-legacy');

  const req = { params: { slug: 'push-test-legacy' }, body: { title: 'Hi', message: 'There' } };
  const res = fakeRes();
  await handleSendPush(req, res);

  // Legacy fields: exactly what this endpoint returned before this change —
  // wallet-only for sent/failed/total, unrelated to the email/webPush channels.
  assert.equal(res.body.sent, 1);
  assert.equal(res.body.failed, 0);
  assert.equal(typeof res.body.total, 'number');
  assert.equal(res.body.total, 1);
  assert.equal(res.body.emailSent, 1);
  assert.equal(res.body.emailFailed, 0);
  // And they match wallet's own numbers exactly, proving no behavior drift.
  assert.equal(res.body.sent, res.body.wallet.sent);
  assert.equal(res.body.failed, res.body.wallet.failed);
  assert.equal(res.body.total, res.body.wallet.attempted);
});

test('handleSendPush: missing title/message still returns 400, unaffected by the response reshaping', async () => {
  resetMocks();
  makePage('push-test-400');
  const req = { params: { slug: 'push-test-400' }, body: {} };
  const res = fakeRes();

  await handleSendPush(req, res);

  assert.equal(res.statusCode, 400);
});

// ── 5. Existing QR redirect tracking remains unchanged ───────

test('trackScan (QR redirect system) still creates a Scan row via qrId — untouched by this change', async () => {
  resetMocks();
  const scanCreateCalls = [];
  mockPrisma.scan = { async create(args) { scanCreateCalls.push(args); return { id: 'scan_1', ...args.data }; } };
  mockPrisma.qR = { async update() { return {}; } };

  const fakeReq = { headers: { 'user-agent': 'test-agent' } };
  await trackScan('qr_123', fakeReq);

  assert.equal(scanCreateCalls.length, 1);
  assert.equal(scanCreateCalls[0].data.qrId, 'qr_123');
  assert.equal(scanCreateCalls[0].data.userAgent, 'test-agent');
  // Confirms this system is unrelated to LandingPage.scanCount — no
  // landingPage.update call is triggered by trackScan at all.
  assert.equal(scanCountUpdateCalls.length, 0);
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
