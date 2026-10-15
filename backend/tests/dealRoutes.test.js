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

let placementRows = [];
let pageRows = [];
let userRows = {};
let userLookups = 0;
let userLookupFails = false;
let advisoryLocks = 0;
// Deals access: Anna and Ben are pilot accounts for every test except the
// G section, which sets the rollout variables itself (withRollout).
const PILOTS = { DEALS_PILOT_USER_IDS: `${ANNA},${BEN}` };
function setRollout(vars) {
  delete process.env.DEALS_ENABLED; delete process.env.DEALS_PILOT_USER_IDS;
  Object.assign(process.env, vars);
}
function reset() {
  setRollout(PILOTS); userRows = {}; userLookups = 0; userLookupFails = false;
  dealRows = []; idSeq = 100; uploads = []; storageConfigured = true; storageFails = false;
  placementRows = [];
  pageRows = [{ slug: 'anna-cafe', userId: ANNA, businessName: 'Anna Café', status: 'live', updatedAt: new Date(2) },
    { slug: 'anna-draft', userId: ANNA, businessName: 'Anna Draft', status: 'draft', updatedAt: new Date(1) },
    { slug: 'ben-bikes', userId: BEN, businessName: 'Ben Bikes', status: 'live', updatedAt: new Date(3) }];
}
function cloneRows(rows) { return rows.map((r) => ({ ...r })); }
// Prisma-style where: plain equality, or { not: v } per field.
const matches = (row, where) => Object.keys(where).every((k) => {
  const c = where[k];
  if (c && typeof c === 'object' && 'not' in c) return row[k] !== c.not;
  if (c && typeof c === 'object' && 'in' in c) return c.in.includes(row[k]);
  return row[k] === c;
});

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
    count: async ({ where }) => dealRows.filter((d) => matches(d, where)).length,
    updateMany: async ({ where, data }) => { const rows = dealRows.filter((d) => matches(d, where)); rows.forEach((r) => Object.assign(r, data, { updatedAt: new Date() })); return { count: rows.length }; },
    delete: async ({ where }) => {
      const i = dealRows.findIndex((d) => d.id === where.id);
      if (i === -1) throw new Error('deal not found in mock');
      return dealRows.splice(i, 1)[0];
    },
  },
  dealPlacement: {
    findUnique: async ({ where }) => {
      const k = where.dealId_channel_targetRef;
      const r = where.id ? placementRows.find((p) => p.id === where.id) : placementRows.find((p) => p.dealId === k.dealId && p.channel === k.channel && p.targetRef === k.targetRef);
      return r ? { ...r } : null;
    },
    findMany: async ({ where = {} } = {}) => cloneRows(placementRows.filter((p) => Object.keys(where).every((k) => p[k] === where[k]))),
    create: async ({ data }) => { idSeq += 1; const r = { id: 'pl_' + idSeq, publishedAt: null, createdAt: new Date(), ...data }; placementRows.push(r); return { ...r }; },
    update: async ({ where, data }) => { const r = placementRows.find((p) => p.id === where.id); Object.assign(r, data); return { ...r }; },
    updateMany: async ({ where, data }) => { const rows = placementRows.filter((p) => matches(p, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
  },
  landingPage: {
    findUnique: async ({ where }) => { const r = pageRows.find((p) => p.slug === where.slug); return r ? { ...r } : null; },
    findMany: async ({ where, select }) => pageRows.filter((p) => p.userId === where.userId).map((p) => Object.fromEntries(Object.keys(select).map((k) => [k, p[k]]))),
  },
  // Deals access (services/dealAccess.js) reads the User row; none by default = Free.
  user: { findUnique: async ({ where }) => { userLookups += 1; if (userLookupFails) throw new Error('db down'); return userRows[where.id] ? { ...userRows[where.id] } : null; } },
  business: { findUnique: async () => null },
  businessMember: { findUnique: async () => null },
  $executeRaw: async () => { advisoryLocks += 1; return 1; },   // pg_advisory_xact_lock in the create transaction
  $transaction: async (arg) => {
    const snapshot = cloneRows(dealRows), placements = cloneRows(placementRows);
    try { return await arg(mockPrisma); } catch (e) { dealRows = snapshot; placementRows = placements; throw e; }
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

setRollout(PILOTS);
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
    if (skipUploadParser && i === handlers.length - 2) continue;   // the multer wrapper sits right before the controller
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
test('A. exposes exactly the owner endpoints (deals, image, placements, own pages), each behind requireAuth first', () => {
  const { requireAuth } = require('../src/middleware/auth');
  const routes = router.stack.filter((l) => l.route).map((l) => Object.keys(l.route.methods)[0].toUpperCase() + ' ' + l.route.path);
  assert.deepEqual(routes, ['GET /', 'GET /pages', 'POST /', 'GET /:id', 'PUT /:id/draft', 'POST /:id/publish', 'POST /:id/archive', 'DELETE /:id',
    'GET /:id/placements', 'POST /:id/placements', 'POST /:id/placements/:placementId/publish', 'POST /:id/placements/:placementId/archive', 'POST /:id/image']);
  assert.ok(routes.indexOf('GET /pages') < routes.indexOf('GET /:id'), '"pages" is never read as a deal id');
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

// ── P. Placements (Phase 3.1) ───────────────────────────────────
test('P. placement endpoints and the page list need a sign-in and change nothing without one', async () => {
  reset();
  const deal = await create();
  for (const [m, p, o] of [['get', '/pages', {}], ['get', '/:id/placements', { params: { id: deal.dealId } }],
    ['post', '/:id/placements', { params: { id: deal.dealId }, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }],
    ['post', '/:id/placements/:placementId/publish', { params: { id: deal.dealId, placementId: 'x' } }],
    ['post', '/:id/placements/:placementId/archive', { params: { id: deal.dealId, placementId: 'x' } }]]) {
    assert.equal((await call(m, p, o)).statusCode, 401, m + ' ' + p);
    assert.equal((await call(m, p, { ...o, token: 'tok_nobody' })).statusCode, 401, m + ' ' + p + ' (invalid token)');
  }
  assert.equal(placementRows.length, 0);
});

test('P. GET /deals/pages lists only the signed-in owner\'s pages', async () => {
  reset();
  const res = await call('get', '/pages', asAnna());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.pages, [{ slug: 'anna-cafe', name: 'Anna Café', live: true }, { slug: 'anna-draft', name: 'Anna Draft', live: false }]);
  assert.deepEqual((await call('get', '/pages', asBen())).body.pages.map((p) => p.slug), ['ben-bikes']);
});

test('P. add, list, publish (with the deal) and archive a placement over HTTP', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  const add = await call('post', '/:id/placements', asAnna({ params: id, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }));
  assert.equal(add.statusCode, 201, JSON.stringify(add.body));
  assert.equal(add.body.placement.status, 'draft');
  assert.equal((await call('post', '/:id/placements', asAnna({ params: id, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }))).statusCode, 409, 'duplicate');
  const pub = await call('post', '/:id/publish', asAnna({ params: id, body: { includePlacements: true } }));
  assert.equal(pub.statusCode, 200, JSON.stringify(pub.body));
  assert.equal(placementRows[0].status, 'published');
  const list = await call('get', '/:id/placements', asAnna({ params: id }));
  assert.deepEqual(list.body.placements.map((p) => [p.targetRef, p.status]), [['anna-cafe', 'published']]);
  const arch = await call('post', '/:id/placements/:placementId/archive', asAnna({ params: { id: deal.dealId, placementId: add.body.placement.placementId } }));
  assert.equal(arch.body.placement.status, 'archived');
});

test('P. publishing without the option leaves placements as drafts (unchanged behaviour)', async () => {
  reset();
  const deal = await create();
  await call('post', '/:id/placements', asAnna({ params: { id: deal.dealId }, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }));
  assert.equal((await call('post', '/:id/publish', asAnna({ params: { id: deal.dealId } }))).statusCode, 200);
  assert.equal(placementRows[0].status, 'draft');
  const pid = placementRows[0].id;
  const one = await call('post', '/:id/placements/:placementId/publish', asAnna({ params: { id: deal.dealId, placementId: pid } }));
  assert.equal(one.body.placement.status, 'published', 'and can be published on its own afterwards');
});

test('P. re-adding a removed page over HTTP: 200, the same placement, as a draft; repeats are 409', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  const add = await call('post', '/:id/placements', asAnna({ params: id, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }));
  await call('post', '/:id/placements/:placementId/archive', asAnna({ params: { id: deal.dealId, placementId: add.body.placement.placementId } }));
  const back = await call('post', '/:id/placements', asAnna({ params: id, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }));
  assert.equal(back.statusCode, 200, 'restored, not created');
  assert.equal(back.body.placement.placementId, add.body.placement.placementId);
  assert.equal(back.body.placement.status, 'draft');
  assert.equal(placementRows.length, 1);
  assert.equal((await call('post', '/:id/placements', asAnna({ params: id, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }))).statusCode, 409);
  assert.equal((await call('post', '/:id/placements', asBen({ params: id, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }))).statusCode, 404, 'not Ben\'s deal');
  const list = await call('get', '/:id/placements', asAnna({ params: id }));
  assert.deepEqual(list.body.placements.map((p) => [p.targetRef, p.status]), [['anna-cafe', 'draft']], 'reopening shows the restored state');
});

test('P. nobody can place a deal on someone else\'s page, or touch someone else\'s deal', async () => {
  reset();
  const deal = await create();
  const id = { id: deal.dealId };
  assert.equal((await call('post', '/:id/placements', asAnna({ params: id, body: { channel: 'landing_page', targetRef: 'ben-bikes' } }))).statusCode, 404);
  assert.equal((await call('post', '/:id/placements', asAnna({ params: id, body: { channel: 'landing_page', targetRef: 'nope' } }))).statusCode, 404);
  assert.equal((await call('post', '/:id/placements', asBen({ params: id, body: { channel: 'landing_page', targetRef: 'ben-bikes' } }))).statusCode, 404, 'Ben cannot use Anna\'s deal');
  assert.equal((await call('get', '/:id/placements', asBen({ params: id }))).statusCode, 404);
  for (const body of [{ channel: 'email', targetRef: 'anna-cafe' }, { channel: 'landing_page' }, { channel: 'landing_page', targetRef: 'anna-cafe', status: 'published' }]) {
    assert.equal((await call('post', '/:id/placements', asAnna({ params: id, body }))).statusCode, 400, JSON.stringify(body));
  }
  assert.equal(placementRows.length, 0);
  assert.equal((await call('post', '/:id/publish', asAnna({ params: id, body: { includePlacements: 'yes' } }))).statusCode, 400);
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

// ── G. Access control (services/dealAccess.js on the routes) ───
// Gated: create, upload, publish, add/restore placement, publish placement.
// Owner-only (no access needed): list, pages, load, save draft, archive,
// delete, list placements, remove placement.
const GATED = ['POST /', 'POST /:id/publish', 'POST /:id/placements', 'POST /:id/placements/:placementId/publish', 'POST /:id/image'];
const OWNER_ONLY = ['GET /', 'GET /pages', 'GET /:id', 'PUT /:id/draft', 'POST /:id/archive', 'DELETE /:id', 'GET /:id/placements', 'POST /:id/placements/:placementId/archive'];
const routeKey = (l) => Object.keys(l.route.methods)[0].toUpperCase() + ' ' + l.route.path;
const snapshot = () => JSON.stringify({ d: dealRows, p: placementRows, u: uploads.length });
const T = Date.now();
const DAY = 864e5;

// A published deal on anna-cafe (with its placement) plus a draft deal with a draft placement, made while Anna is a pilot.
async function annaSetup() {
  const pub = await create();
  const pl = await call('post', '/:id/placements', asAnna({ params: { id: pub.dealId }, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }));
  assert.equal((await call('post', '/:id/publish', asAnna({ params: { id: pub.dealId }, body: { includePlacements: true } }))).statusCode, 200);
  const draft = await create();
  return { pub, pid: pl.body.placement.placementId, draft };
}
// Every gated action, attempted by `who` on Anna's deals; returns the status codes.
async function tryGated(who, { pub, pid, draft }) {
  return {
    create: (await call('post', '/', who({ body: { title: 'New', offerText: 'New offer' } }))).statusCode,
    publish: (await call('post', '/:id/publish', who({ params: { id: draft.dealId }, body: {} }))).statusCode,
    republish: (await call('post', '/:id/publish', who({ params: { id: pub.dealId }, body: { includePlacements: true } }))).statusCode,
    addPlacement: (await call('post', '/:id/placements', who({ params: { id: draft.dealId }, body: { channel: 'landing_page', targetRef: 'anna-cafe' } }))).statusCode,
    publishPlacement: (await call('post', '/:id/placements/:placementId/publish', who({ params: { id: pub.dealId, placementId: pid } }))).statusCode,
    upload: (await call('post', '/:id/image', who({ params: { id: draft.dealId }, file: { buffer: Buffer.from('x') }, skipUploadParser: true }))).statusCode,
  };
}
const all = (codes, status) => Object.values(codes).every((c) => c === status);

test('G. exactly the five creating/publishing/placing/upload routes carry the access check, right after requireAuth', () => {
  const { requireAuth } = require('../src/middleware/auth');
  const gated = [], ownerOnly = [];
  for (const l of router.stack.filter((x) => x.route)) {
    const names = l.route.stack.map((s) => s.handle);
    assert.equal(names[0], requireAuth, routeKey(l) + ': requireAuth first');
    // owner-only: requireAuth + handler; gated: + the access check (the upload also has its multer wrapper)
    const hasGate = l.route.stack.length === (routeKey(l) === 'POST /:id/image' ? 4 : 3);
    (hasGate ? gated : ownerOnly).push(routeKey(l));
  }
  assert.deepEqual(gated.sort(), GATED.slice().sort());
  assert.deepEqual(ownerOnly.sort(), OWNER_ONLY.slice().sort());
  const src = fs.readFileSync(resolve('src', 'routes', 'dealRoutes.js'), 'utf8');
  assert.equal((src.match(/requireAuth, dealAccess,/g) || []).length, 5);
  assert.match(src, /'\/:id\/image', requireAuth, dealAccess, \(req, res, next\) => \{\s*dealImageUpload/, 'the access check runs before multer reads the upload');
});

test('G. rollout off (no variables): every gated action is 403 deals_not_available and changes nothing -- even on Pro', async () => {
  reset();
  const s = await annaSetup();
  setRollout({}); userRows[ANNA] = { plan: 'pro' };
  const before = snapshot();
  const codes = await tryGated(asAnna, s);
  assert.ok(all(codes, 403), JSON.stringify(codes));
  const body = (await call('post', '/', asAnna({ body: { title: 'x', offerText: 'y' } }))).body;
  assert.deepEqual(body, { error: 'deals_not_available', message: 'Deals are not available for this account yet.' });
  assert.equal(snapshot(), before, 'no deal, placement or upload changed');
});

test('G. rollout off: the owner can still view, edit drafts, archive, delete and remove placements', async () => {
  reset();
  const s = await annaSetup();
  setRollout({});
  assert.equal((await call('get', '/', asAnna())).statusCode, 200);
  assert.equal((await call('get', '/pages', asAnna())).statusCode, 200);
  assert.equal((await call('get', '/:id', asAnna({ params: { id: s.pub.dealId } }))).statusCode, 200);
  assert.equal((await call('get', '/:id/placements', asAnna({ params: { id: s.pub.dealId } }))).statusCode, 200);
  const edit = await call('put', '/:id/draft', asAnna({ params: { id: s.draft.dealId }, body: { title: 'Edited while closed' } }));
  assert.equal(edit.statusCode, 200); assert.equal(edit.body.deal.title, 'Edited while closed');
  const pendingEdit = await call('put', '/:id/draft', asAnna({ params: { id: s.pub.dealId }, body: { description: 'pending' } }));
  assert.equal(pendingEdit.statusCode, 200); assert.equal(dealRows.find((d) => d.id === s.pub.dealId).status, 'published', 'edits stay pending; nothing is republished');
  assert.equal((await call('post', '/:id/placements/:placementId/archive', asAnna({ params: { id: s.pub.dealId, placementId: s.pid } }))).statusCode, 200);
  assert.equal((await call('post', '/:id/archive', asAnna({ params: { id: s.pub.dealId } }))).statusCode, 200);
  assert.equal((await call('delete', '/:id', asAnna({ params: { id: s.draft.dealId } }))).statusCode, 200);
  assert.equal(dealRows.length, 1);
});

test('G. DEALS_ENABLED=true: the plan decides -- Free (no User row) and Free plan get 402 plan_required, nothing changes', async () => {
  reset();
  const s = await annaSetup();
  setRollout({ DEALS_ENABLED: 'true' });
  for (const row of [undefined, { plan: 'free' }, { plan: 'gold' }]) {
    if (row) userRows[ANNA] = row; else delete userRows[ANNA];
    const before = snapshot();
    const codes = await tryGated(asAnna, s);
    assert.ok(all(codes, 402), JSON.stringify(codes));
    assert.equal(snapshot(), before);
  }
  const body = (await call('post', '/', asAnna({ body: { title: 'x', offerText: 'y' } }))).body;
  assert.equal(body.error, 'plan_required'); assert.equal(body.requiredPlan, 'starter'); assert.equal(body.upgrade, true);
});

test('G. DEALS_ENABLED=true: Starter, active Trial, annual and enterprise plans may create, publish, place and upload', async () => {
  for (const row of [{ plan: 'starter' }, { plan: 'trial', trialExpiresAt: new Date(T + DAY) }, { plan: 'pro_annual' }, { plan: 'business', subscriptionStatus: 'past_due' }, { plan: 'enterprise' }]) {
    reset();
    const s = await annaSetup();
    setRollout({ DEALS_ENABLED: 'true' }); userRows[ANNA] = row;
    const codes = await tryGated(asAnna, s);
    // annaSetup already made 2 active deals: Trial (limit 1) is full, every other plan here has room
    assert.equal(codes.create, row.plan === 'trial' ? 402 : 201, JSON.stringify(row));
    assert.equal(codes.addPlacement, 201, JSON.stringify(row));   // a new placement is "created"
    for (const k of ['publish', 'republish', 'publishPlacement', 'upload']) assert.equal(codes[k], 200, row.plan + ' ' + k + ' ' + JSON.stringify(codes));
  }
});

test('G. an expired trial or a cancelled / unpaid subscription loses publishing, keeps owner actions', async () => {
  for (const row of [{ plan: 'trial', trialExpiresAt: new Date(T - DAY) }, { plan: 'pro', subscriptionStatus: 'canceled' }, { plan: 'starter_annual', subscriptionStatus: 'unpaid' }, { plan: 'business', subscriptionStatus: 'incomplete_expired' }]) {
    reset();
    const s = await annaSetup();
    setRollout({ DEALS_ENABLED: 'true' }); userRows[ANNA] = row;
    const before = snapshot();
    const codes = await tryGated(asAnna, s);
    assert.ok(all(codes, 402), JSON.stringify(row) + ' ' + JSON.stringify(codes));
    assert.equal(snapshot(), before);
    assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: s.draft.dealId }, body: { title: 'still editable' } }))).statusCode, 200);
    assert.equal((await call('post', '/:id/archive', asAnna({ params: { id: s.pub.dealId } }))).statusCode, 200);
  }
});

test('G. pilot list only: listed accounts get access on any plan; an unlisted account is 403', async () => {
  reset();
  const s = await annaSetup();
  setRollout({ DEALS_PILOT_USER_IDS: ANNA }); userRows[ANNA] = { plan: 'free' };
  const codes = await tryGated(asAnna, s);
  assert.equal(codes.create, 201); assert.equal(codes.upload, 200); assert.equal(codes.publishPlacement, 200);
  const ben = await call('post', '/', asBen({ body: { title: 'x', offerText: 'y' } }));
  assert.equal(ben.statusCode, 403); assert.equal(ben.body.error, 'deals_not_available');
  for (const junk of ['*', 'all', ' , ', 'user_', 'USER_anna']) {
    setRollout({ DEALS_PILOT_USER_IDS: junk });
    assert.equal((await call('post', '/', asAnna({ body: { title: 'x', offerText: 'y' } }))).statusCode, 403, junk);
  }
  for (const v of ['TRUE', '1', 'yes', ' true']) {
    setRollout({ DEALS_ENABLED: v }); userRows[ANNA] = { plan: 'pro' };
    assert.equal((await call('post', '/', asAnna({ body: { title: 'x', offerText: 'y' } }))).statusCode, 403, 'DEALS_ENABLED=' + JSON.stringify(v));
  }
});

test('G. ownership still applies with access: another account gets 404 on Anna\'s deals and changes nothing', async () => {
  reset();
  const s = await annaSetup();
  setRollout({ DEALS_ENABLED: 'true' }); userRows[BEN] = { plan: 'pro' };
  const before = snapshot();
  const codes = await tryGated(asBen, s);
  delete codes.create;   // creating is Ben's own deal
  assert.ok(all(codes, 404), JSON.stringify(codes));
  assert.equal(dealRows.filter((d) => d.ownerUserId === ANNA).map((d) => d.status).join(), JSON.parse(before).d.map((d) => d.status).join());
  assert.equal(uploads.length, JSON.parse(before).u);
  for (const [m, p] of [['put', '/:id/draft'], ['post', '/:id/archive'], ['delete', '/:id'], ['get', '/:id']]) {
    assert.equal((await call(m, p, asBen({ params: { id: s.pub.dealId }, body: { title: 'x' } }))).statusCode, 404, m + ' ' + p);
  }
});

test('G. without access another account is refused before ownership is even looked at (403, no deal lookup)', async () => {
  reset();
  const s = await annaSetup();
  setRollout({});
  let dealReads = 0;
  const orig = mockPrisma.deal.findUnique;
  mockPrisma.deal.findUnique = async (q) => { dealReads += 1; return orig(q); };
  try {
    assert.equal((await call('post', '/:id/publish', asBen({ params: { id: s.pub.dealId }, body: {} }))).statusCode, 403);
    assert.equal(dealReads, 0);
  } finally { mockPrisma.deal.findUnique = orig; }
});

test('G. no token: 401 before the access check (no User lookup)', async () => {
  reset();
  setRollout({ DEALS_ENABLED: 'true' });
  const before = userLookups;
  for (const key of GATED) {
    const [m, p] = key.split(' ');
    assert.equal((await call(m.toLowerCase(), p, { params: { id: 'x', placementId: 'y' }, body: {} })).statusCode, 401, key);
  }
  assert.equal(userLookups, before);
});

test('G. a failing access lookup is a 500 without detail and never lets the request through', async () => {
  reset();
  const s = await annaSetup();
  userLookupFails = true;
  const before = snapshot();
  const res = await call('post', '/', asAnna({ body: { title: 'x', offerText: 'y' } }));
  assert.equal(res.statusCode, 500); assert.deepEqual(res.body, { error: 'Failed to check Deals access.' });
  const codes = await tryGated(asAnna, s);
  assert.ok(all(codes, 500), JSON.stringify(codes));
  assert.equal(snapshot(), before);
});

test('G. draft saves cannot attach an uploaded picture: only the upload can; the deal\'s own picture may be kept', async () => {
  reset();
  const a = await create();
  const b = await create();
  const up = await call('post', '/:id/image', asAnna({ params: { id: a.dealId }, file: { buffer: Buffer.from('x') }, skipUploadParser: true }));
  assert.equal(up.statusCode, 200);
  const own = up.body.deal.image;
  // keeping the deal's own upload (the Deal Builder sends it back on every save)
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: a.dealId }, body: { image: own, title: 'kept' } }))).statusCode, 200);
  // a different, perfectly valid-looking upload of the same account: refused
  const forged = { ...own, publicId: own.publicId.replace(/-\d+$/, '-999'), url: own.url.replace(/-\d+\.jpg$/, '-999.jpg') };
  forged.master = { ...own.master, url: own.master.url.replace(/-\d+\.jpg$/, '-999.jpg') };
  const r1 = await call('put', '/:id/draft', asAnna({ params: { id: a.dealId }, body: { image: forged } }));
  assert.equal(r1.statusCode, 400); assert.match(r1.body.error, /only be added with the image upload/);
  // copying deal A's upload into deal B: refused
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: b.dealId }, body: { image: own } }))).statusCode, 400);
  // after publishing A, its live upload can be kept or restored in the draft
  assert.equal((await call('post', '/:id/publish', asAnna({ params: { id: a.dealId }, body: {} }))).statusCode, 200);
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: a.dealId }, body: { image: { source: 'background', backgroundId: 'night' } } }))).statusCode, 200);
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: a.dealId }, body: { image: own } }))).statusCode, 200);
  // starter / background / none stay free choices
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: b.dealId }, body: { image: { source: 'starter', starterId: 'travel-greece-01' } } }))).statusCode, 200);
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: b.dealId }, body: { image: null } }))).statusCode, 200);
  assert.equal(uploads.length, 1);
});

test('G. after losing access the draft rule still holds: own picture kept, nothing new attached', async () => {
  reset();
  const a = await create();
  const own = (await call('post', '/:id/image', asAnna({ params: { id: a.dealId }, file: { buffer: Buffer.from('x') }, skipUploadParser: true }))).body.deal.image;
  setRollout({});
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: a.dealId }, body: { image: own, title: 'edited' } }))).statusCode, 200);
  const forged = { ...own, publicId: own.publicId + 'x', url: own.url.replace('.jpg', 'x.jpg') };
  delete forged.master;
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: a.dealId }, body: { image: forged } }))).statusCode, 400);
  assert.equal((await call('post', '/:id/image', asAnna({ params: { id: a.dealId }, file: { buffer: Buffer.from('x') }, skipUploadParser: true }))).statusCode, 403);
  assert.equal(uploads.length, 1);
});

test('G. refused uploads never reach the parser or storage (403 before multer)', async () => {
  reset();
  const a = await create();
  setRollout({});
  // the real multer wrapper is NOT skipped here: the access check must answer first
  const res = await call('post', '/:id/image', asAnna({ params: { id: a.dealId } }));
  assert.equal(res.statusCode, 403);
  assert.equal(uploads.length, 0);
});

// ── L. Deal limits over HTTP (Phase 3B.3) ──────────────────────
const newBody = (i) => ({ body: { title: 'Deal ' + i, offerText: 'Offer ' + i } });
// Creates until refused (at most `max` tries); returns how many were created and the refusal.
async function fill(who, max = 12) {
  let made = 0, refusal = null;
  for (let i = 0; i < max; i++) {
    const r = await call('post', '/', who(newBody(i)));
    if (r.statusCode === 201) { made++; continue; }
    refusal = r; break;
  }
  return { made, refusal };
}
const activeTrial = { plan: 'trial', trialExpiresAt: new Date(T + DAY) };

test('L. general rollout: Free 0, active Trial 1, Starter 3, Pro / Business unlimited; annual plans and enterprise inherit', async () => {
  const cases = [[{ plan: 'free' }, 0], [activeTrial, 1], [{ plan: 'starter' }, 3], [{ plan: 'starter_annual' }, 3],
    [{ plan: 'pro' }, null], [{ plan: 'pro_annual' }, null], [{ plan: 'business' }, null], [{ plan: 'business_annual' }, null], [{ plan: 'enterprise' }, null]];
  for (const [row, limit] of cases) {
    reset(); setRollout({ DEALS_ENABLED: 'true' }); userRows[ANNA] = row;
    const { made, refusal } = await fill(asAnna);
    if (limit === null) { assert.equal(made, 12, row.plan + ' unlimited'); assert.equal(refusal, null); continue; }
    assert.equal(made, limit, row.plan);
    assert.equal(refusal.statusCode, 402, row.plan);
    if (limit === 0) { assert.equal(refusal.body.error, 'plan_required', 'Free has no Deals at all'); continue; }
    assert.deepEqual(Object.keys(refusal.body).sort(), ['current', 'error', 'limit', 'message', 'upgrade']);
    assert.equal(refusal.body.error, 'plan_limit'); assert.equal(refusal.body.limit, limit); assert.equal(refusal.body.current, limit); assert.equal(refusal.body.upgrade, true);
    assert.equal(dealRows.length, limit, 'nothing created beyond the limit');
  }
});

test('L. pilots: Free / Trial / expired trial / Starter get 10; Pro / Business pilots stay unlimited', async () => {
  for (const row of [undefined, { plan: 'free' }, activeTrial, { plan: 'trial', trialExpiresAt: new Date(T - DAY) }, { plan: 'starter' }]) {
    reset(); setRollout({ DEALS_PILOT_USER_IDS: ANNA }); if (row) userRows[ANNA] = row;
    const { made, refusal } = await fill(asAnna, 14);
    assert.equal(made, 10, JSON.stringify(row)); assert.equal(refusal.body.error, 'plan_limit'); assert.equal(refusal.body.limit, 10);
  }
  for (const row of [{ plan: 'pro' }, { plan: 'business_annual' }, { plan: 'enterprise' }]) {
    reset(); setRollout({ DEALS_PILOT_USER_IDS: ANNA }); userRows[ANNA] = row;
    assert.equal((await fill(asAnna, 14)).made, 14, row.plan);
  }
});

test('L. archiving frees a slot, publishing does not; another account\'s deals never count', async () => {
  reset(); setRollout({ DEALS_ENABLED: 'true' }); userRows[ANNA] = { plan: 'starter' }; userRows[BEN] = { plan: 'pro' };
  for (let i = 0; i < 5; i++) assert.equal((await call('post', '/', asBen(newBody(i)))).statusCode, 201);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await call('post', '/', asAnna(newBody(i)))).body.deal.dealId);
  assert.equal((await call('post', '/:id/publish', asAnna({ params: { id: ids[0] }, body: {} }))).statusCode, 200);
  assert.equal((await call('post', '/', asAnna(newBody(9)))).body.current, 3, 'published still counts');
  assert.equal((await call('post', '/:id/archive', asAnna({ params: { id: ids[0] } }))).statusCode, 200);
  assert.equal((await call('post', '/', asAnna(newBody(10)))).statusCode, 201, 'archived freed a slot');
  assert.equal((await call('post', '/', asAnna(newBody(11)))).statusCode, 402);
  assert.equal(dealRows.filter((d) => d.ownerUserId === ANNA && d.status === 'archived').length, 1, 'archived deal kept');
});

test('L. over the limit nothing changes and existing deals stay fully usable (publish, archive, delete)', async () => {
  reset(); setRollout({ DEALS_ENABLED: 'true' }); userRows[ANNA] = activeTrial;
  const only = (await call('post', '/', asAnna(newBody(0)))).body.deal;
  const before = snapshot();
  assert.equal((await call('post', '/', asAnna(newBody(1)))).statusCode, 402);
  assert.equal(snapshot(), before);
  assert.equal((await call('post', '/:id/publish', asAnna({ params: { id: only.dealId }, body: {} }))).statusCode, 200);
  assert.equal((await call('put', '/:id/draft', asAnna({ params: { id: only.dealId }, body: { title: 'edited' } }))).statusCode, 200);
  assert.equal((await call('delete', '/:id', asAnna({ params: { id: only.dealId } }))).statusCode, 200);
  assert.equal((await call('post', '/', asAnna(newBody(2)))).statusCode, 201, 'deleting freed the slot');
});

test('L. the limit comes from the access decision only, never from the request', async () => {
  reset(); setRollout({ DEALS_ENABLED: 'true' }); userRows[ANNA] = activeTrial;
  assert.equal((await call('post', '/', asAnna(newBody(0)))).statusCode, 201);
  const sneaky = await call('post', '/', asAnna({ body: { title: 'x', offerText: 'y', limit: null }, query: { limit: '100' } }));
  assert.ok([400, 402].includes(sneaky.statusCode), String(sneaky.statusCode));
  assert.equal(dealRows.length, 1);
});

test('L. limited creates take the per-account lock; unlimited ones do not', async () => {
  reset(); setRollout({ DEALS_ENABLED: 'true' }); userRows[ANNA] = { plan: 'starter' }; userRows[BEN] = { plan: 'pro' };
  advisoryLocks = 0;
  await call('post', '/', asAnna(newBody(0)));
  assert.equal(advisoryLocks, 1);
  await call('post', '/', asBen(newBody(0)));
  assert.equal(advisoryLocks, 1, 'Pro: no lock needed');
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
  assert.equal((routes.match(/^router\.(get|post|put|delete)\(/gm) || []).length, 13);
  assert.equal((routes.match(/^router\.(get|post|put|delete)\('[^']*', requireAuth,/gm) || []).length, 13, 'every route line names requireAuth first');
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
