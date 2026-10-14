// ============================================================
// dealRoutes.test.js — QRAIVY Deals API, Phase C1
// (routes/dealRoutes.js -> controllers/dealController.js ->
//  services/dealService.js).
//
// Each test drives a route exactly as Express would: the route's own
// handler chain is taken from the router stack and run in order, so
// requireAuth is really executed (with @clerk/backend mocked) and a
// request without a valid token really never reaches the controller.
//
// No test framework dependency, same convention as tests/tierRoutes.test.js.
// Prisma, @clerk/backend and the Cloudinary upload are mocked by
// pre-seeding require.cache, so no real DB, Clerk or storage call is made.
//
// Run: node tests/dealRoutes.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const uploadServicePath = resolve('src', 'services', 'dealImageUploadService.js');
const clerkBackendPath = require.resolve('@clerk/backend');

// ── Fixtures ─────────────────────────────────────────────────────
const ANNA = 'user_anna';
const BEN = 'user_ben';
const TOKENS = { tok_anna: ANNA, tok_ben: BEN };

let dealRows = [];
let idSeq = 0;
let uploads = [];
let storageConfigured = true;
let storageFails = false;

function reset() { dealRows = []; idSeq = 100; uploads = []; storageConfigured = true; storageFails = false; }
function cloneRows(rows) { return rows.map((r) => ({ ...r })); }

const mockPrisma = {
  deal: {
    findUnique: async ({ where }) => { const r = dealRows.find((d) => d.id === where.id); return r ? { ...r } : null; },
    findMany: async ({ where }) => {
      let rows = dealRows.filter((d) => d.ownerUserId === where.ownerUserId);
      if (where.status) rows = rows.filter((d) => d.status === where.status);
      return cloneRows(rows).reverse();
    },
    create: async ({ data }) => {
      idSeq += 1;
      const row = { id: 'deal_' + idSeq, description: null, offerType: null, offerDetails: null, image: null, startsAt: null, endsAt: null, publishedAt: null, draftData: null, businessId: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      dealRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = dealRows.find((d) => d.id === where.id);
      if (!row) throw new Error('deal not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    delete: async ({ where }) => {
      const i = dealRows.findIndex((d) => d.id === where.id);
      if (i === -1) throw new Error('deal not found in mock');
      return dealRows.splice(i, 1)[0];
    },
  },
  business: { findUnique: async () => null },
  businessMember: { findUnique: async () => null },
  $transaction: async (arg) => {
    const snapshot = cloneRows(dealRows);
    try { return await arg(mockPrisma); } catch (e) { dealRows = snapshot; throw e; }
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };
require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: { verifyToken: async (token) => { if (!TOKENS[token]) throw new Error('invalid token'); return { sub: TOKENS[token] }; } },
};
require.cache[uploadServicePath] = {
  id: uploadServicePath, filename: uploadServicePath, loaded: true,
  exports: {
    isDealImageStorageConfigured: () => storageConfigured,
    uploadDealImage: async (buffer, dealId) => {
      if (storageFails) throw new Error('storage down');
      uploads.push({ dealId, bytes: buffer.length });
      const publicId = `qraivy-deals/deal-${dealId}-${uploads.length}`;
      return { publicId, displayUrl: `https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1/${publicId}.jpg`, displayWidth: 1200, displayHeight: 900,
        masterUrl: `https://res.cloudinary.com/test-cloud/image/upload/v1/${publicId}.jpg`, masterWidth: 4032, masterHeight: 3024 };
    },
  },
};
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
// requireAuth logs every rejected token; keep the test output readable.
const realError = console.error;
console.error = (...a) => { if (!String(a[0]).startsWith('[auth]') && !String(a[0]).startsWith('[DealAPI]')) realError(...a); };

const router = require('../src/routes/dealRoutes');

// ── Route runner ─────────────────────────────────────────────────
function fakeRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
// Runs the route's real handler chain. `skipUploadParser` steps over the
// multer wrapper (it needs a real multipart stream) and uses req.file as
// given -- every other handler in the chain still runs.
async function call(method, routePath, { token, params = {}, query = {}, body, file, skipUploadParser = false } = {}) {
  const layer = router.stack.find((l) => l.route && l.route.path === routePath && l.route.methods[method]);
  assert.ok(layer, `route ${method.toUpperCase()} ${routePath} not found`);
  const req = { headers: token ? { authorization: 'Bearer ' + token } : {}, params, query, body, file };
  const res = fakeRes();
  const handlers = layer.route.stack.map((s) => s.handle);
  for (let i = 0; i < handlers.length; i++) {
    if (skipUploadParser && i === 1) continue;
    let nextCalled = false;
    await handlers[i](req, res, () => { nextCalled = true; });
    if (!nextCalled) break;
  }
  return res;
}
const asAnna = (o = {}) => ({ token: 'tok_anna', ...o });
const asBen = (o = {}) => ({ token: 'tok_ben', ...o });
async function create(who = asAnna, body = { title: 'Free Coffee Friday', offerText: 'Buy one, get one free', offerType: 'two_for_one' }) {
  const res = await call('post', '/', who({ body }));
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  return res.body.deal;
}

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();
const FAR_FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();
const PAST = new Date(Date.now() - 864e5).toISOString();

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── A. Surface and authentication ──────────────────────────────
test('A. exposes exactly the eight owner endpoints, each behind requireAuth first', () => {
  const { requireAuth } = require('../src/middleware/auth');
  const routes = router.stack.filter((l) => l.route).map((l) => Object.keys(l.route.methods)[0].toUpperCase() + ' ' + l.route.path);
  assert.deepEqual(routes, ['GET /', 'POST /', 'GET /:id', 'PUT /:id/draft', 'POST /:id/publish', 'POST /:id/archive', 'DELETE /:id', 'POST /:id/image']);
  for (const l of router.stack.filter((x) => x.route)) assert.equal(l.route.stack[0].handle, requireAuth, l.route.path);
});

test('A. every endpoint answers 401 without a valid token, and does nothing', async () => {
  reset();
  const deal = await create();
  const attempts = [
    ['get', '/', {}], ['post', '/', { body: { title: 't', offerText: 'o' } }], ['get', '/:id', { params: { id: deal.dealId } }],
    ['put', '/:id/draft', { params: { id: deal.dealId }, body: { title: 'x' } }], ['post', '/:id/publish', { params: { id: deal.dealId } }],
    ['post', '/:id/archive', { params: { id: deal.dealId } }], ['delete', '/:id', { params: { id: deal.dealId } }],
    ['post', '/:id/image', { params: { id: deal.dealId }, file: { buffer: Buffer.from('x') } }],
  ];
  for (const [m, p, o] of attempts) {
    for (const token of [undefined, 'tok_forged']) {
      const res = await call(m, p, { ...o, token });
      assert.equal(res.statusCode, 401, `${m} ${p} token=${token}`);
    }
  }
  assert.equal(dealRows.length, 1);
  assert.equal(dealRows[0].title, 'Free Coffee Friday');
  assert.equal(dealRows[0].status, 'draft');
  assert.equal(uploads.length, 0);
});

test('A. the owner is always the verified token, never anything in the request', async () => {
  reset();
  const res = await call('post', '/', asAnna({ body: { title: 't', offerText: 'o', ownerUserId: BEN } }));
  assert.equal(res.statusCode, 400);
  const deal = await create();
  assert.equal(dealRows[0].ownerUserId, ANNA);
  assert.equal(dealRows[0].createdBy, ANNA);
  assert.equal('ownerUserId' in deal, false, 'the owner id is not echoed to the client');
});

// ── B. Create / read / list ────────────────────────────────────
test('B. create makes a draft and returns it; get returns the same deal', async () => {
  reset();
  const deal = await create();
  assert.equal(deal.status, 'draft');
  assert.equal(deal.displayStatus, 'draft');
  assert.equal(deal.offerType, 'two_for_one');
  const got = await call('get', '/:id', asAnna({ params: { id: deal.dealId } }));
  assert.equal(got.statusCode, 200);
  assert.equal(got.body.deal.dealId, deal.dealId);
  assert.equal(got.body.deal.title, 'Free Coffee Friday');
});

test('B. create rejects missing and invalid input with 400 and a message', async () => {
  reset();
  for (const body of [{}, { title: 'only title' }, { title: 't', offerText: 'o', offerType: 'bogus' }, { title: 't', offerText: 'o', startsAt: FAR_FUTURE, endsAt: FUTURE }, { title: 'x'.repeat(81), offerText: 'o' }, undefined]) {
    const res = await call('post', '/', asAnna({ body }));
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.ok(res.body.error, 'has a message');
  }
  assert.equal(dealRows.length, 0);
});

test('B. list returns only the caller\'s deals, newest first, optionally by status', async () => {
  reset();
  const a1 = await create();
  const a2 = await create(asAnna, { title: 'Second', offerText: 'o' });
  await create(asBen, { title: 'Ben deal', offerText: 'o' });
  await call('post', '/:id/publish', asAnna({ params: { id: a1.dealId } }));

  const all = await call('get', '/', asAnna());
  assert.deepEqual(all.body.deals.map((d) => d.dealId), [a2.dealId, a1.dealId]);
  const ben = await call('get', '/', asBen());
  assert.deepEqual(ben.body.deals.map((d) => d.title), ['Ben deal']);
  const published = await call('get', '/', asAnna({ query: { status: 'published' } }));
  assert.deepEqual(published.body.deals.map((d) => d.dealId), [a1.dealId]);
  assert.equal((await call('get', '/', asAnna({ query: { status: 'live' } }))).statusCode, 400);
});

// ── C. Ownership isolation ─────────────────────────────────────
test('C. another account cannot read, edit, publish, archive, delete or upload to a deal -- always 404', async () => {
  reset();
  const deal = await create();
  const id = { params: { id: deal.dealId } };
  const attempts = [
    ['get', '/:id', id], ['put', '/:id/draft', { ...id, body: { title: 'hijacked' } }], ['post', '/:id/publish', id],
    ['post', '/:id/archive', id], ['delete', '/:id', id], ['post', '/:id/image', { ...id, file: { buffer: Buffer.from('x') }, skipUploadParser: true }],
  ];
  for (const [m, p, o] of attempts) {
    const res = await call(m, p, asBen(o));
    assert.equal(res.statusCode, 404, `${m} ${p}`);
    assert.deepEqual(res.body, { error: 'Deal not found.' });
  }
  assert.equal(dealRows[0].title, 'Free Coffee Friday');
  assert.equal(dealRows[0].status, 'draft');
  assert.equal(dealRows[0].draftData, null);
  assert.equal(uploads.length, 0, 'nothing was sent to storage for someone else\'s deal');
});

test('C. an unknown deal id is 404 on every endpoint', async () => {
  reset();
  for (const [m, p] of [['get', '/:id'], ['put', '/:id/draft'], ['post', '/:id/publish'], ['post', '/:id/archive'], ['delete', '/:id']]) {
    assert.equal((await call(m, p, asAnna({ params: { id: 'deal_missing' }, body: { title: 'x' } }))).statusCode, 404, `${m} ${p}`);
  }
});

// ── D. Save, edit, publish, archive ────────────────────────────
test('D. save-draft stores edits; the six deal types each validate their own details', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  const ok = [
    [{ offerType: 'percentage_discount', offerDetails: { percentOff: 20 } }, { percentOff: 20 }],
    [{ offerType: 'two_for_one', offerDetails: { buyQty: 2, freeQty: 1 } }, { buyQty: 2, freeQty: 1 }],
    [{ offerType: 'fixed_price', offerDetails: { price: 5.9 } }, { price: 5.9, currency: 'EUR' }],
    [{ offerType: 'free_bonus', offerDetails: { freeItem: '1 coffee' } }, { freeItem: '1 coffee', minPurchase: null }],
    [{ offerType: 'upgrade', offerDetails: { toLabel: 'Premium' } }, { fromLabel: null, toLabel: 'Premium' }],
    [{ offerType: 'custom', offerDetails: null }, null],
  ];
  for (const [body, expected] of ok) {
    const res = await call('put', '/:id/draft', asAnna({ params: id, body }));
    assert.equal(res.statusCode, 200, JSON.stringify(body) + ' ' + JSON.stringify(res.body));
    assert.deepEqual(res.body.deal.offerDetails, expected);
    assert.equal(res.body.deal.offerType, body.offerType);
  }
  const bad = [
    { offerType: 'percentage_discount', offerDetails: { percentOff: 150 } }, { offerType: 'percentage_discount', offerDetails: {} },
    { offerType: 'two_for_one', offerDetails: { buyQty: 1 } }, { offerType: 'fixed_price', offerDetails: { price: 0 } },
    { offerType: 'custom', offerDetails: { anything: 1 } }, { offerType: 'upgrade', offerDetails: { percentOff: 5 } }, { status: 'published' },
  ];
  for (const body of bad) {
    const res = await call('put', '/:id/draft', asAnna({ params: id, body }));
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(dealRows[0].status, 'draft');
});

test('D. scheduling: valid dates are kept, end before start and unparseable dates are rejected', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  const ok = await call('put', '/:id/draft', asAnna({ params: id, body: { startsAt: FUTURE, endsAt: FAR_FUTURE } }));
  assert.equal(ok.statusCode, 200);
  assert.equal(new Date(ok.body.deal.endsAt).toISOString(), FAR_FUTURE);
  for (const body of [{ startsAt: FAR_FUTURE, endsAt: FUTURE }, { endsAt: 'next tuesday' }, { startsAt: 12345 }, { endsAt: FUTURE, startsAt: FUTURE }]) {
    assert.equal((await call('put', '/:id/draft', asAnna({ params: id, body }))).statusCode, 400, JSON.stringify(body));
  }
  const cleared = await call('put', '/:id/draft', asAnna({ params: id, body: { startsAt: null, endsAt: null } }));
  assert.equal(cleared.body.deal.startsAt, null);
  assert.equal(cleared.body.deal.endsAt, null);
});

test('D. publish promotes the draft; a past end date cannot be published but stays a draft', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  await call('put', '/:id/draft', asAnna({ params: id, body: { title: 'Published title', image: { source: 'starter', starterId: 'bakery-coffee-01' } } }));
  const res = await call('post', '/:id/publish', asAnna({ params: id }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deal.status, 'published');
  assert.equal(res.body.deal.displayStatus, 'published');
  assert.equal(res.body.deal.hasUnpublishedChanges, false);
  assert.equal(dealRows[0].title, 'Published title');
  assert.deepEqual(dealRows[0].image, { source: 'starter', starterId: 'bakery-coffee-01', aiGenerated: true });

  const old = await create(asAnna, { title: 'Old', offerText: 'o', endsAt: PAST });
  const refused = await call('post', '/:id/publish', asAnna({ params: { id: old.dealId } }));
  assert.equal(refused.statusCode, 400);
  assert.match(refused.body.error, /in the past/);
  assert.equal(dealRows.find((d) => d.id === old.dealId).status, 'draft');
});

test('D. a published deal can be reopened and edited without changing what is live until published again', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  await call('post', '/:id/publish', asAnna({ params: id }));
  const edit = await call('put', '/:id/draft', asAnna({ params: id, body: { title: 'Edited' } }));
  assert.equal(edit.body.deal.title, 'Edited');
  assert.equal(edit.body.deal.status, 'published');
  assert.equal(edit.body.deal.hasUnpublishedChanges, true);
  assert.equal(dealRows[0].title, 'Free Coffee Friday', 'live title unchanged');
  await call('post', '/:id/publish', asAnna({ params: id }));
  assert.equal(dealRows[0].title, 'Edited');
});

test('D. scheduled and expired are reported from the dates', async () => {
  reset();
  const later = await create(asAnna, { title: 'Later', offerText: 'o', startsAt: FUTURE, endsAt: FAR_FUTURE });
  assert.equal((await call('post', '/:id/publish', asAnna({ params: { id: later.dealId } }))).body.deal.displayStatus, 'scheduled');
  dealRows[0].startsAt = new Date(Date.now() - 2 * 864e5); dealRows[0].endsAt = new Date(Date.now() - 864e5);
  const list = await call('get', '/', asAnna());
  assert.equal(list.body.deals[0].displayStatus, 'expired');
  assert.equal(list.body.deals[0].status, 'published');
});

test('D. archive is terminal: no further edits or publishing; delete removes the deal', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  const archived = await call('post', '/:id/archive', asAnna({ params: id }));
  assert.equal(archived.body.deal.status, 'archived');
  assert.equal(archived.body.deal.displayStatus, 'archived');
  assert.equal((await call('post', '/:id/archive', asAnna({ params: id }))).statusCode, 400);
  assert.equal((await call('put', '/:id/draft', asAnna({ params: id, body: { title: 'x' } }))).statusCode, 400);
  assert.equal((await call('post', '/:id/publish', asAnna({ params: id }))).statusCode, 400);
  const del = await call('delete', '/:id', asAnna({ params: id }));
  assert.deepEqual(del.body, { deleted: true, dealId: deal.dealId });
  assert.equal(dealRows.length, 0);
});

// ── E. Images ──────────────────────────────────────────────────
test('E. upload stores the picture and attaches it to the draft, not to the published deal', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  await call('post', '/:id/publish', asAnna({ params: id }));
  const res = await call('post', '/:id/image', asAnna({ params: id, file: { buffer: Buffer.alloc(2048) }, skipUploadParser: true }));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(uploads, [{ dealId: deal.dealId, bytes: 2048 }]);
  assert.equal(res.body.deal.image.source, 'uploaded');
  // the 4:3 picture every screen shows, now a delivery URL of the stored master
  assert.match(res.body.deal.image.url, /^https:\/\/res\.cloudinary\.com\/test-cloud\/image\/upload\/c_fill,g_auto,h_900,w_1200\/v1\/qraivy-deals\/deal-/);
  assert.equal(res.body.deal.image.width, 1200);
  assert.equal(res.body.deal.image.height, 900);
  assert.deepEqual(res.body.deal.image.master, { url: `https://res.cloudinary.com/test-cloud/image/upload/v1/${res.body.deal.image.publicId}.jpg`, width: 4032, height: 3024 });
  assert.equal(res.body.deal.hasUnpublishedChanges, true);
  assert.equal(dealRows[0].image, null, 'the published deal still has no image');
});

test('E. upload without a file is 400; unavailable or failing storage is reported, never faked', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  assert.equal((await call('post', '/:id/image', asAnna({ params: id, skipUploadParser: true }))).statusCode, 400);
  storageConfigured = false;
  const off = await call('post', '/:id/image', asAnna({ params: id, file: { buffer: Buffer.from('x') }, skipUploadParser: true }));
  assert.equal(off.statusCode, 503);
  storageConfigured = true; storageFails = true;
  const down = await call('post', '/:id/image', asAnna({ params: id, file: { buffer: Buffer.from('x') }, skipUploadParser: true }));
  assert.equal(down.statusCode, 502);
  assert.equal(dealRows[0].draftData, null, 'no image was recorded');
});

test('E. only the server\'s own image kinds are accepted through save-draft', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  const starter = await call('put', '/:id/draft', asAnna({ params: id, body: { image: { source: 'starter', starterId: 'travel-greece-01', aiGenerated: false } } }));
  assert.deepEqual(starter.body.deal.image, { source: 'starter', starterId: 'travel-greece-01', aiGenerated: true });
  const bg = await call('put', '/:id/draft', asAnna({ params: id, body: { image: { source: 'background', backgroundId: 'night' } } }));
  assert.deepEqual(bg.body.deal.image, { source: 'background', backgroundId: 'night' });
  for (const image of [{ source: 'uploaded', url: 'data:image/png;base64,AAAA', publicId: 'x' }, { url: 'https://evil.example.com/a.jpg', publicId: 'a' }, { source: 'starter', starterId: 'nope' }, { source: 'background', backgroundId: 'nope' }, { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/qraivy-logos/x.png', publicId: 'qraivy-logos/x' }]) {
    assert.equal((await call('put', '/:id/draft', asAnna({ params: id, body: { image } }))).statusCode, 400, JSON.stringify(image));
  }
  assert.equal((await call('put', '/:id/draft', asAnna({ params: id, body: { image: null } }))).body.deal.image, null);
});

// ── F. Errors and wiring ───────────────────────────────────────
test('F. an unexpected failure is a 500 without internal detail', async () => {
  reset();
  const original = mockPrisma.deal.findMany;
  mockPrisma.deal.findMany = async () => { throw new Error('connection refused to db-internal-host:5432'); };
  try {
    const res = await call('get', '/', asAnna());
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Failed to load deals.' });
  } finally { mockPrisma.deal.findMany = original; }
});

test('F. the app mounts the router at /deals, and nothing public is exposed', () => {
  const index = fs.readFileSync(resolve('src', 'index.js'), 'utf8');
  assert.match(index, /const dealRoutes = require\('\.\/routes\/dealRoutes'\);/);
  assert.match(index, /app\.use\('\/deals', dealRoutes\);/);
  const routes = fs.readFileSync(resolve('src', 'routes', 'dealRoutes.js'), 'utf8');
  assert.equal((routes.match(/^router\.(get|post|put|delete)\(/gm) || []).length, 8);
  assert.equal((routes.match(/^router\.(get|post|put|delete)\('[^']*', requireAuth,/gm) || []).length, 8, 'every route line names requireAuth first');
});

test('F. the server\'s image lists mirror the frontend catalog and backgrounds', () => {
  const { DEAL_STARTER_IMAGES, DEAL_BACKGROUNDS, DEAL_IMAGE_FOLDER } = require('../src/data/dealImages');
  const pub = path.join(__dirname, '..', '..', 'frontend', 'public');
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(pub, 'js', 'deal-starter-images.js'), 'utf8'), ctx);
  const catalog = JSON.parse(JSON.stringify(ctx.window.QRAIVY_DEAL_STARTER_IMAGES.images));
  assert.deepEqual(DEAL_STARTER_IMAGES, catalog.map((i) => ({ id: i.id, origin: i.origin.type })));
  const page = fs.readFileSync(path.join(pub, 'deals.html'), 'utf8');
  assert.deepEqual(DEAL_BACKGROUNDS, [...page.matchAll(/\{ id: '([a-z]+)', css: 'linear-gradient/g)].map((m) => m[1]));
  assert.equal(DEAL_IMAGE_FOLDER, 'qraivy-deals');
  const upload = fs.readFileSync(resolve('src', 'services', 'dealImageUploadService.js'), 'utf8');
  assert.match(upload, /folder: ACTIVE_DEAL_IMAGE_FOLDER/); // production: DEAL_IMAGE_FOLDER (dealsPreviewSafety.test.js)
  assert.match(upload, /overwrite: false/);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${err.message}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
