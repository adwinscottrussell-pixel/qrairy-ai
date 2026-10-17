// ============================================================
// subscriberDataAuth.test.js — security hotfix: a page's subscriber data
// (email list, counts, masked details) is answered only to the page's own
// account. GET /lp/subscribers/:slug was public; /loyalty/subscribers/summary
// and /:slug/detail answered every signed-in account about every page.
// Mocked Prisma; test addresses are made up (example.test), nothing real.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
const pages = {
  'biz-a': { slug: 'biz-a', userId: 'user_a', businessName: 'Business A', name: 'A' },
  'biz-b': { slug: 'biz-b', userId: 'user_b', businessName: 'Business B', name: 'B' },
  'orphan': { slug: 'orphan', userId: null, businessName: 'No Owner', name: 'O' },
};
const subs = [
  { id: 's1', slug: 'biz-a', email: 'anna@a.example.test', gdprConsent: true, createdAt: new Date('2026-10-01') },
  { id: 's2', slug: 'biz-b', email: 'bert@b.example.test', gdprConsent: true, createdAt: new Date('2026-10-02') },
  { id: 's3', slug: 'biz-b', email: 'berta@b.example.test', gdprConsent: true, createdAt: new Date('2026-10-03') },
  { id: 's4', slug: 'orphan', email: 'olga@o.example.test', gdprConsent: true, createdAt: new Date('2026-10-04') },
  { id: 's5', slug: 'gone-page', email: 'gina@g.example.test', gdprConsent: true, createdAt: new Date('2026-10-05') },
];
const webSubs = [{ slug: 'biz-a', endpoint: 'https://push.example.test/a1', createdAt: new Date() }, { slug: 'biz-b', endpoint: 'https://push.example.test/b1', createdAt: new Date() }];
let reads = [];
const inSlug = (where, row) => !where || !where.slug || (typeof where.slug === 'string' ? row.slug === where.slug : where.slug.in.includes(row.slug));
const group = (rows, where) => {
  const m = {}; rows.filter((r) => inSlug(where, r)).forEach((r) => { m[r.slug] = (m[r.slug] || 0) + 1; });
  return Object.keys(m).map((slug) => ({ slug, _count: { id: m[slug] } }));
};
const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug } }) { reads.push('page:' + slug); return pages[slug] ? Object.assign({}, pages[slug]) : null; },
    async findMany({ where } = {}) { reads.push('pages:' + JSON.stringify(where || {})); return Object.values(pages).filter((p) => !where || where.userId === undefined || p.userId === where.userId); },
  },
  subscriber: {
    async findMany({ where }) { reads.push('subscribers:' + where.slug); return subs.filter((s) => s.slug === where.slug); },
    async findFirst({ where }) { return subs.filter((s) => s.slug === where.slug)[0] || null; },
    async groupBy({ where }) { reads.push('subGroups:' + JSON.stringify(where || null)); return group(subs, where); },
  },
  // Phase 5.5C.3: the Admin counts the page's active opt-ins (WebPushPageSubscription)
  webPushPageSubscription: {
    async findMany({ where }) { reads.push('webpush:' + where.slug); return webSubs.filter((s) => s.slug === where.slug).map((s) => ({ createdAt: s.createdAt, subscription: { endpoint: s.endpoint } })); },
    async findFirst({ where }) { return webSubs.filter((s) => s.slug === where.slug)[0] || null; },
    async groupBy({ where }) { reads.push('webGroups:' + JSON.stringify({ slug: where.slug })); return group(webSubs, where); },
  },
  pass: { async findMany() { return []; } },
  passDevice: { async findMany() { return []; }, async count() { return 0; } },
  stampSettings: { async findUnique() { return null; } },
};
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { loaded: true, exports: mockPrisma };
// loyaltyAdminController makes its own client: give it the same mock.
const prismaPkg = require.resolve('@prisma/client', { paths: [path.join(__dirname, '..', 'src', 'controllers')].concat((process.env.NODE_PATH || '').split(path.delimiter)) });
require.cache[prismaPkg] = { loaded: true, exports: { PrismaClient: function () { return mockPrisma; }, Prisma: {} } };

const { handleGetSubscribers } = require('../src/controllers/lpController');
const { getSubscriberSummary, getSubscriberDetail } = require('../src/controllers/loyaltyAdminController');
const { requireAuth } = require('../src/middleware/auth');

const fakeRes = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, set() { return this; }, setHeader() {} });
async function call(handler, { slug, userId, query, body }) {
  const res = fakeRes();
  await handler({ params: { slug }, userId, query: query || {}, body: body || {}, headers: {} }, res);
  return res;
}
const ALL_EMAILS = subs.map((s) => s.email);
const leaked = (res, keep) => ALL_EMAILS.filter((e) => !(keep || []).includes(e) && JSON.stringify(res.body || '').includes(e));
const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', ...f.split('/')), 'utf8').split('\r\n').join('\n');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('GET /lp/subscribers/:slug — anonymous: rejected by requireAuth before the handler; the handler alone also refuses', async () => {
  const res = fakeRes(); let reached = false;
  await requireAuth({ headers: {} }, res, () => { reached = true; });
  assert.equal(reached, false); assert.equal(res.statusCode, 401);
  assert.ok(SRC('routes/lpRoutes.js').includes("router.get('/lp/subscribers/:slug', requireAuth, handleGetSubscribers);"));
  reads = [];
  const r = await call(handleGetSubscribers, { slug: 'biz-a', userId: undefined });
  assert.equal(r.statusCode, 404); assert.deepEqual(leaked(r), []);
  assert.ok(!reads.some((x) => x.startsWith('subscribers')), 'no subscriber read');
});

test('GET /lp/subscribers/:slug — Business A cannot read B (404, no subscriber read); A reads its own', async () => {
  reads = [];
  const r = await call(handleGetSubscribers, { slug: 'biz-b', userId: 'user_a' });
  assert.equal(r.statusCode, 404); assert.deepEqual(r.body, { error: 'Page not found.' });
  assert.deepEqual(reads, ['page:biz-b']); assert.deepEqual(leaked(r), []);
  const own = await call(handleGetSubscribers, { slug: 'biz-a', userId: 'user_a' });
  assert.equal(own.statusCode, 200); assert.equal(own.body.count, 1); assert.equal(own.body.subscribers[0].email, 'anna@a.example.test');
});

test('GET /lp/subscribers/:slug — forged identifiers: query/body claims, odd slugs, ownerless and unknown pages', async () => {
  for (const [slug, userId, extra] of [['biz-b', 'user_a', { query: { userId: 'user_b' }, body: { userId: 'user_b', ownerUserId: 'user_b' } }], ['BIZ-B', 'user_a'], ['biz-b ', 'user_a'], ['../biz-b', 'user_a'], ['orphan', 'user_a'], ['orphan', ''], ['gone-page', 'user_a'], ['biz-b', 'null']]) {
    const r = await call(handleGetSubscribers, Object.assign({ slug, userId }, extra || {}));
    assert.equal(r.statusCode, 404, slug + ' as ' + userId); assert.deepEqual(leaked(r), []);
  }
});

test('summary — only the account\'s own pages: no counts, names or slugs of other businesses', async () => {
  reads = [];
  const r = await call(getSubscriberSummary, { userId: 'user_a' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.pages.map((p) => p.slug), ['biz-a']);
  assert.deepEqual(r.body.totals, { email: 1, webPush: 1, wallet: 0, total: 2 });
  const s = JSON.stringify(r.body);
  for (const other of ['biz-b', 'Business B', 'orphan', 'gone-page']) assert.ok(!s.includes(other), other);
  assert.ok(reads.includes('pages:{"userId":"user_a"}'), 'pages filtered by owner');
  assert.ok(reads.filter((x) => /Groups:/.test(x)).every((x) => x.includes('"in":["biz-a"]')), 'counts only for own slugs');
  const b = await call(getSubscriberSummary, { userId: 'user_b' });
  assert.deepEqual([b.body.pages.map((p) => p.slug), b.body.totals.email], [['biz-b'], 2]);
});

test('summary — no signed-in user: 401, and never an unfiltered page list', async () => {
  for (const userId of [undefined, '', null, 42]) {
    reads = [];
    const r = await call(getSubscriberSummary, { userId });
    assert.equal(r.statusCode, 401, String(userId)); assert.deepEqual(reads, []);
  }
});

test('detail — A cannot read B (404, nothing read); A reads its own masked rows; ownerless and unknown pages: 404', async () => {
  reads = [];
  const r = await call(getSubscriberDetail, { slug: 'biz-b', userId: 'user_a' });
  assert.equal(r.statusCode, 404); assert.deepEqual(reads, ['page:biz-b']);
  for (const [slug, userId] of [['orphan', 'user_a'], ['gone-page', 'user_a'], ['BIZ-A', 'user_a'], ['biz-a', undefined], ['biz-a', '']]) {
    const x = await call(getSubscriberDetail, { slug, userId });
    assert.ok([401, 404].includes(x.statusCode), slug + ' ' + userId); assert.deepEqual(leaked(x), []);
  }
  const own = await call(getSubscriberDetail, { slug: 'biz-a', userId: 'user_a' });
  assert.equal(own.statusCode, 200);
  assert.deepEqual(own.body.rows.map((x) => x.type).sort(), ['email', 'web_push']);
  assert.ok(own.body.rows.some((x) => x.masked === 'an***@a.example.test'), 'owner still sees the masked email');
});

test('the summary selects only fields LandingPage really has (the old select failed and was silently swallowed)', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').split('\r\n').join('\n');
  const model = schema.slice(schema.indexOf('model LandingPage {'), schema.indexOf('\n}', schema.indexOf('model LandingPage {')));
  const fields = new Set(model.split('\n').slice(1).map((l) => l.trim().split(/\s+/)[0]).filter((w) => /^[a-zA-Z]+$/.test(w)));
  const ctl = SRC('controllers/loyaltyAdminController.js');
  const fn = ctl.slice(ctl.indexOf('async function getSubscriberSummary('), ctl.indexOf('\n}\n', ctl.indexOf('async function getSubscriberSummary(')));
  const sel = fn.match(/landingPage\.findMany\(\{ where: \{ userId \}, select: \{ ([^}]*) \} \}\)/);
  assert.ok(sel, 'owner-filtered page query');
  for (const k of sel[1].split(',').map((x) => x.trim().split(':')[0])) assert.ok(fields.has(k), 'LandingPage.' + k);
});

test('all routes require sign-in; errors no longer echo internal messages', () => {
  const loyaltyRoutes = SRC('routes/loyaltyAdminRoutes.js');
  assert.ok(loyaltyRoutes.includes("router.get('/subscribers/summary', requireAuth, getSubscriberSummary);"));
  assert.ok(loyaltyRoutes.includes("router.get('/subscribers/:slug/detail', requireAuth, getSubscriberDetail);"));
  const ctl = SRC('controllers/loyaltyAdminController.js');
  for (const name of ['getSubscriberSummary', 'getSubscriberDetail']) {
    const fn = ctl.slice(ctl.indexOf('async function ' + name + '('), ctl.indexOf('\n}\n', ctl.indexOf('async function ' + name + '(')));
    assert.ok(fn.includes("res.status(500).json({ error: 'Could not load subscribers.' })") && !fn.includes('error: e.message'), name);
  }
  const lp = SRC('controllers/lpController.js');
  const g = lp.slice(lp.indexOf('async function handleGetSubscribers('), lp.indexOf('\n}\n', lp.indexOf('async function handleGetSubscribers(')));
  assert.ok(g.includes("error: 'Could not load subscribers.'") && !g.includes('error: e.message'));
});

test('no other route hands out subscriber rows: every subscriber read is owner-scoped, admin-only or a send/subscribe path', () => {
  const root = path.join(__dirname, '..', 'src');
  const hits = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (/prisma\.subscriber\.(findMany|findFirst|findUnique|groupBy|count)\(/.test(l)) hits.push(path.relative(root, p).split(path.sep).join('/')); }); } })(root);
  // lpController: subscribe (dedupe lookup), the owner-only list, the owner-only campaign send.
  // loyaltyAdminController: the owner-only summary/detail. qrController: dashboard counts for the token's own pages.
  // routes/adminRoutes + services/searchService: requireAdmin (internal QRAIVY admins). analyticsService: { userId }.
  assert.deepEqual(Array.from(new Set(hits)).sort(), ['controllers/loyaltyAdminController.js', 'controllers/lpController.js', 'controllers/qrController.js', 'routes/adminRoutes.js', 'services/analyticsService.js', 'services/searchService.js']);
  assert.ok(SRC('routes/opsRoutes.js').includes("router.get('/search', requireAdmin, handleSearch);"));
  assert.ok(/router\.use\(requireAdmin\)|requireAdmin, async/.test(SRC('routes/adminRoutes.js')));
  assert.ok(SRC('controllers/qrController.js').includes("const where = userId ? { userId } : null;\n    if (!where) return res.json({ dashboard: [] });"));
});

test('the dashboard keeps working: it already signs its subscriber requests', () => {
  const dash = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'dashboard.html'), 'utf8');
  assert.ok(/\/loyalty\/subscribers\/summary', \{\s*headers: \{ 'Authorization': 'Bearer ' \+ tok \}/.test(dash));
  assert.ok(/\/loyalty\/subscribers\/' \+ slug \+ '\/detail', \{\s*headers: \{ 'Authorization': 'Bearer ' \+ tok \}/.test(dash));
  let callers = '';   // git grep exits 1 when nothing matches
  try { callers = execFileSync('git', ['grep', '-l', 'lp/subscribers/', '--', 'frontend'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { if (e.status !== 1) throw e; }
  assert.equal(callers, '', 'no page uses the email list route');
});

test('HTTP: the real router and requireAuth answer 401 to anonymous and bogus tokens on all three routes', async () => {
  const express = require(require.resolve('express', { paths: (process.env.NODE_PATH || '').split(path.delimiter).concat([path.join(__dirname, '..')]) }));
  const app = express();
  app.use('/', require('../src/routes/lpRoutes'));
  app.use('/loyalty', require('../src/routes/loyaltyAdminRoutes'));
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const port = server.address().port;
  const get = (p, h) => new Promise((ok) => http.get({ host: '127.0.0.1', port, path: p, headers: h || {} }, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => ok([res.statusCode, d])); }));
  try {
    for (const p of ['/lp/subscribers/biz-a', '/loyalty/subscribers/summary', '/loyalty/subscribers/biz-a/detail']) {
      for (const h of [{}, { authorization: 'Bearer not.a.jwt' }, { authorization: 'Basic abc' }]) {
        const [code, body] = await get(p, h);
        assert.equal(code, 401, p + ' ' + JSON.stringify(h));
        assert.ok(!ALL_EMAILS.some((e) => body.includes(e)));
      }
    }
  } finally { server.close(); }
});

(async () => {
  let passed = 0, failed = 0;
  console.log('subscriberDataAuth');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + e.message); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
