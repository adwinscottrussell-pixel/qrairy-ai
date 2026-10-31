// ============================================================
// publicDraftGuard.test.js — Studio V3 Phase D1: drafts are private.
//
// Every route of the landing page router (src/routes/lpRoutes.js) that works
// with a page's slug is, without exception, one of:
//   - signed in (requireAuth, owner checks in the handler),
//   - guarded by publicDraftGuard (a draft answers 404 before the handler), or
//   - on a short, explained list (handlers that refuse drafts themselves,
//     read no page, or check the account themselves).
// A new public slug route without the guard fails this test.
//
// Over HTTP, with the real router: a draft's slug answers 404 on every
// guarded route and the handler is never reached (no other database access);
// the status is read from the database on every request (no cache); a failed
// lookup refuses (503); a live or unknown page passes the guard untouched.
//
// Run: node tests/publicDraftGuard.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const http = require('http');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
const pages = {
  'studio-draft': { id: 'lp_d', slug: 'studio-draft', status: 'draft', userId: 'user_owner', businessName: 'DRAFT SECRET NAME', sections: JSON.stringify({ hero: { title: 'DRAFT SECRET' } }) },
  'live-page': { id: 'lp_l', slug: 'live-page', status: 'live', userId: 'user_owner', businessName: 'Live', sections: '{}' },
};
const calls = [];
let failLookup = false;
// the guard's lookup is landingPage.findUnique with select { status }; anything else is a handler
const handlerAccess = () => calls.filter((c) => c !== 'guard');
const mockPrisma = new Proxy({
  landingPage: new Proxy({
    async findUnique(args) {
      const guard = args && args.select && Object.keys(args.select).join() === 'status';
      calls.push(guard ? 'guard' : 'landingPage.findUnique');
      if (guard && failLookup) throw new Error('database unavailable');
      const p = pages[args.where.slug];
      return p ? (guard ? { status: p.status } : Object.assign({}, p)) : null;
    },
  }, { get: (t, k) => (k in t ? t[k] : async () => { calls.push('landingPage.' + String(k)); return null; }) }),
}, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? new Proxy({}, { get: (x, m) => async () => { calls.push(k + '.' + String(m)); return null; } }) : undefined) });
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { loaded: true, exports: mockPrisma };
const prismaPkg = require.resolve('@prisma/client', { paths: [path.join(__dirname, '..', 'src', 'controllers')] });
require.cache[prismaPkg] = { loaded: true, exports: { PrismaClient: function () { return mockPrisma; }, Prisma: {} } };
process.on('unhandledRejection', () => {});
const realError = console.error;
console.error = (...a) => { if (!/^\[(publicDraftGuard|auth)\]/.test(String(a[0]))) realError(...a); };

const express = require('express');
const router = require('../src/routes/lpRoutes');
const { requireAuth } = require('../src/middleware/auth');
const { publicDraftGuard } = require('../src/middleware/publicDraftGuard');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const routes = router.stack.filter((l) => l.route).map((l) => ({
  key: Object.keys(l.route.methods).map((m) => m.toUpperCase()).join(',') + ' ' + l.route.path,
  handlers: l.route.stack.map((s) => s.handle),
}));
const GUARDED = [
  'GET /lp/nfc-token/:slug', 'GET /lp/card/:slug', 'GET /lp/wallet/apple/:slug', 'GET /lp/wallet/google/:slug',
  'GET /stamp/:slug/:token', 'POST /stamp/:slug/:token/confirm', 'GET /redeem/:slug/:token', 'POST /redeem/:slug/:token/confirm',
  'GET /lp/stamp/token/:slug', 'GET /lp/stamp/settings/:slug', 'POST /stamp/:slug/customer', 'GET /lp/welcome/:slug', 'GET /manifest/:slug',
  'POST /lp/chat', 'POST /lp/webpush/subscribe/:slug', 'POST /lp/webpush/unsubscribe/:slug', 'GET /lp/webpush/vapid-key/:slug',
  'POST /lp/subscribe/:slug', 'GET /lp/staff-pin/:slug/status', 'POST /lp/staff-pin/:slug/verify',
];
// not guarded, each for a reason
const EXEMPT = {
  'GET /lp/:slug': 'handleServeLP answers 404 for a draft itself (and never caches one)',
  'GET /lp/wallet-hero/:slug': 'draws a colour banner from the query; reads no page',
  'POST /lp': 'refuses a draft itself (409 studio_draft, lpPublishDraftGuard.test.js)',
  'DELETE /lp/:slug': 'signed in and owner only (handleDeleteLP)',
  'GET /api/lp/:slug': 'signed in, owner or admin only (handleGetLP)',
  'GET /api/lp': 'signed in, the account\'s own pages only (handleListLPs)',
};

test('every slug route is signed in, guarded, or explained; exactly the expected routes are guarded, the guard always first', () => {
  const guarded = [], signedIn = [], other = [];
  for (const r of routes) {
    if (r.handlers.includes(requireAuth)) signedIn.push(r.key);
    else if (r.handlers.some((h) => h.isPublicDraftGuard)) { guarded.push(r.key); assert.ok(r.handlers[0].isPublicDraftGuard, r.key + ': the guard runs first'); }
    else other.push(r.key);
  }
  assert.deepEqual(guarded, GUARDED);
  assert.deepEqual(other.sort(), Object.keys(EXEMPT).sort(), 'every unguarded public route is on the explained list');
  for (const k of signedIn) assert.match(k, /:slug|^POST \/lp\/(upload|voice|push)/, k);
  assert.equal(guarded.length + signedIn.length + other.length, routes.length);
});

let base;
function request(method, p, body) {
  return new Promise((ok, fail) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(base + p, { method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, timeout: 5000 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok({ status: res.statusCode, body: d, type: res.headers['content-type'] || '' }));
    });
    req.on('timeout', () => { req.destroy(); ok({ status: 0, body: 'timeout' }); });
    req.on('error', fail);
    if (data) req.write(data);
    req.end();
  });
}
const pathFor = (key, slug) => key.split(' ')[1].replace(':slug', slug).replace(':token', 'tok123');

test('HTTP: a draft answers 404 on every guarded route, before the handler: no other database access, nothing of the draft shown', async () => {
  for (const key of GUARDED) {
    calls.length = 0;
    const method = key.split(' ')[0];
    const r = key === 'POST /lp/chat' ? await request('POST', '/lp/chat', { slug: 'studio-draft', message: 'hi' }) : await request(method, pathFor(key, 'studio-draft'), method === 'POST' ? {} : null);
    assert.equal(r.status, 404, key);
    assert.deepEqual(JSON.parse(r.body), { error: 'Page not found' }, key);
    assert.deepEqual(calls, ['guard'], key + ': only the status lookup');
    assert.ok(!r.body.includes('SECRET'), key);
  }
});

test('HTTP: the page route itself answers 404 for a draft (its own check); the draft is not shown', async () => {
  calls.length = 0;
  const r = await request('GET', '/lp/studio-draft');
  assert.equal(r.status, 404);
  assert.ok(!r.body.includes('SECRET'));
});

test('HTTP: the status is read from the database on every request (no cache): a page that becomes a draft is private at once', async () => {
  const p = pages['live-page'];
  calls.length = 0;
  p.status = 'draft';
  assert.equal((await request('GET', '/manifest/live-page')).status, 404);
  assert.equal((await request('GET', '/manifest/live-page')).status, 404);
  assert.deepEqual(calls, ['guard', 'guard']);
  p.status = 'live';
});

test('HTTP: if the status cannot be read, the request is refused (503) and the handler is not reached', async () => {
  failLookup = true;
  try {
    for (const key of ['GET /lp/welcome/:slug', 'GET /manifest/:slug', 'POST /lp/subscribe/:slug']) {
      calls.length = 0;
      const r = await request(key.split(' ')[0], pathFor(key, 'live-page'), key.startsWith('POST') ? {} : null);
      assert.equal(r.status, 503, key);
      assert.deepEqual(handlerAccess(), [], key);
    }
  } finally { failLookup = false; }
});

const fakeRes = () => { const r = { touched: false }; for (const m of ['status', 'json', 'send', 'set', 'setHeader', 'end']) r[m] = () => { r.touched = true; return r; }; return r; };
test('a live page, an unknown slug and a request without a slug pass the guard untouched (the route answers as before)', async () => {
  const guard = publicDraftGuard();
  for (const slug of ['live-page', 'no-such-page', undefined, '']) {
    const res = fakeRes();
    let next = 0;
    await guard({ params: { slug } }, res, () => { next++; });
    assert.equal(next, 1, String(slug));
    assert.equal(res.touched, false, String(slug));
  }
  // the chat guard reads the slug from the body; a missing body passes to the route's own 400
  const chat = publicDraftGuard((req) => req.body && req.body.slug);
  let next = 0;
  await chat({ body: undefined }, fakeRes(), () => { next++; });
  await chat({ body: { slug: 42 } }, fakeRes(), () => { next++; });
  assert.equal(next, 2);
});

(async () => {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
  let passed = 0, failed = 0;
  console.log('publicDraftGuard');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + String(e && e.message).split('\n').slice(0, 12).join('\n       ')); }
  }
  server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
