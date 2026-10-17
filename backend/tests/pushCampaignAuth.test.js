// ============================================================
// pushCampaignAuth.test.js — security hotfix: only a page's own account may
// send a push campaign for it (POST /lp/push/:slug) or read its device count
// and campaign history (GET /lp/push/:slug/count|history). Everything else
// answers 404 before any recipient is read or anything is sent.
// Mocked Prisma and send services; every read and send is recorded.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
const pages = {
  'biz-a': { slug: 'biz-a', userId: 'user_a', businessName: 'Business A', businessId: null },
  'biz-b': { slug: 'biz-b', userId: 'user_b', businessName: 'Business B', businessId: null },
  'orphan': { slug: 'orphan', userId: null, businessName: 'No Owner', businessId: null },
};
let calls;
const reset = () => { calls = { reads: [], sends: [], writes: [] }; };
reset();
const mockPrisma = {
  landingPage: { async findUnique({ where: { slug } }) { calls.reads.push('landingPage:' + slug); return pages[slug] ? Object.assign({}, pages[slug]) : null; } },
  passDevice: {
    async findMany({ where }) { calls.reads.push('passDevice:' + where.pass.serialNumber); return [{ pushToken: 'tok-' + where.pass.serialNumber }]; },
    async count({ where }) { calls.reads.push('passDeviceCount:' + where.pass.serialNumber); return 3; },
  },
  pass: { async updateMany({ where }) { calls.writes.push('pass:' + where.serialNumber); return { count: 1 }; } },
  pushCampaign: {
    async create({ data }) { calls.writes.push('campaign:' + data.slug); return Object.assign({ id: 'c1' }, data); },
    async findMany({ where }) { calls.reads.push('campaigns:' + where.slug); return [{ slug: where.slug, title: 'Secret plan of ' + where.slug }]; },
  },
  subscriber: { async findMany({ where }) { calls.reads.push('subscribers:' + where.slug); return [{ id: 's1', email: 'customer@' + where.slug + '.example' }]; } },
  webPushSubscription: { async findMany({ where }) { calls.reads.push('webpush:' + where.slug); return [{ endpoint: 'https://push.example/' + where.slug, p256dh: 'p', auth: 'a' }]; } },
  stampSettings: { async findUnique() { return null; } },
};
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { loaded: true, exports: mockPrisma };
require.cache[resolve('src', 'services', 'apnsService.js')] = { loaded: true, exports: { pushUpdateToDevices: async (d) => { calls.sends.push('apns:' + d.length); return { success: d.length, failed: 0 }; } } };
require.cache[resolve('src', 'services', 'emailService.js')] = { loaded: true, exports: { sendCampaignEmail: async (subs, o) => { calls.sends.push('email:' + o.slug); return { success: subs.length, failed: 0 }; }, sendWelcomeEmail: async () => ({}) } };
require.cache[resolve('src', 'services', 'webPushService.js')] = { loaded: true, exports: { sendWebPush: async (s) => { calls.sends.push('webpush:' + s.endpoint); return { ok: true }; } } };

const { handleSendPush, handlePushCount, handlePushHistory } = require('../src/controllers/lpController');
const { requireAuth } = require('../src/middleware/auth');

const fakeRes = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, set() { return this; }, setHeader() {} });
async function call(handler, { slug, userId, body }) {
  const res = fakeRes();
  await handler({ params: { slug }, userId, body: body || {}, headers: {} }, res);
  return res;
}
const CAMPAIGN = { title: 'Hello', message: 'News from us' };
const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', ...f.split('/')), 'utf8').split('\r\n').join('\n');
const PUB = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', f), 'utf8').split('\r\n').join('\n');
const HEAD = (f) => execFileSync('git', ['show', '884aa8d:' + f], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\r\n').join('\n');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('Business A cannot send to Business B: 404, nothing read, nothing sent, nothing recorded', async () => {
  reset();
  const res = await call(handleSendPush, { slug: 'biz-b', userId: 'user_a', body: CAMPAIGN });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Page not found.' });
  assert.deepEqual(calls.reads, ['landingPage:biz-b'], 'only the ownership lookup');
  assert.deepEqual(calls.sends, []);
  assert.deepEqual(calls.writes, []);
});

test('Business A can send to its own customers: Wallet, email and web push, campaign recorded', async () => {
  reset();
  const res = await call(handleSendPush, { slug: 'biz-a', userId: 'user_a', body: CAMPAIGN });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(calls.sends.sort(), ['apns:1', 'email:biz-a', 'webpush:https://push.example/biz-a']);
  assert.ok(calls.writes.includes('campaign:biz-a'));
  assert.ok(!calls.reads.some((r) => r.includes('biz-b')) && !calls.sends.some((s) => s.includes('biz-b')), 'only A\'s recipients');
});

test('unauthenticated requests are rejected before any handler runs; all three routes require sign-in', async () => {
  const res = fakeRes(); let reached = false;
  await requireAuth({ headers: {} }, res, () => { reached = true; });
  assert.equal(reached, false);
  assert.equal(res.statusCode, 401);
  const routes = SRC('routes/lpRoutes.js');
  for (const r of ["router.post('/lp/push/:slug', requireAuth, handleSendPush);", "router.get('/lp/push/:slug/count', requireAuth, handlePushCount);", "router.get('/lp/push/:slug/history', requireAuth, handlePushHistory);"]) {
    assert.ok(routes.includes(r), r);
  }
  // and the handlers refuse a request that somehow has no user
  reset();
  for (const h of [handleSendPush, handlePushCount, handlePushHistory]) assert.equal((await call(h, { slug: 'biz-a', userId: undefined, body: CAMPAIGN })).statusCode, 404);
  assert.deepEqual(calls.sends, []);
});

test('forged or invalid identifiers cannot bypass the check', async () => {
  reset();
  // claims in the body are ignored: only the signed-in user and the page's stored owner count
  for (const body of [Object.assign({ userId: 'user_b', ownerUserId: 'user_b', businessId: 'biz-b', slug: 'biz-a' }, CAMPAIGN)]) {
    assert.equal((await call(handleSendPush, { slug: 'biz-b', userId: 'user_a', body })).statusCode, 404);
  }
  for (const slug of ['BIZ-B', 'biz-b ', 'biz-b/', '../biz-b', 'unknown-page']) {
    assert.equal((await call(handleSendPush, { slug, userId: 'user_a', body: CAMPAIGN })).statusCode, 404, slug);
  }
  // a page without an owner belongs to no one
  for (const userId of ['user_a', 'user_b', '', 'null']) assert.equal((await call(handleSendPush, { slug: 'orphan', userId, body: CAMPAIGN })).statusCode, 404, 'orphan as ' + userId);
  assert.deepEqual(calls.sends, []);
  assert.deepEqual(calls.writes, []);
});

test('device count and campaign history: the owner only; others see nothing', async () => {
  reset();
  assert.equal((await call(handlePushCount, { slug: 'biz-b', userId: 'user_a' })).statusCode, 404);
  assert.equal((await call(handlePushHistory, { slug: 'biz-b', userId: 'user_a' })).statusCode, 404);
  assert.ok(!calls.reads.some((r) => r.startsWith('passDeviceCount') || r.startsWith('campaigns')), 'no data read for a stranger');
  const count = await call(handlePushCount, { slug: 'biz-b', userId: 'user_b' });
  const hist = await call(handlePushHistory, { slug: 'biz-b', userId: 'user_b' });
  assert.deepEqual([count.statusCode, count.body.count], [200, 3]);
  assert.deepEqual([hist.statusCode, hist.body.campaigns.length], [200, 1]);
});

test('managers: no other account (StadtPocket business members, city managers) gains or loses push rights', () => {
  // Only LandingPage.userId is consulted; manager and StadtPocket code is untouched.
  const ctl = SRC('controllers/lpController.js');
  const helper = ctl.slice(ctl.indexOf('async function findOwnedPushPage('), ctl.indexOf('const pushPageNotFound'));
  assert.ok(helper.includes('page.userId !== userId') && !/businessMember|BusinessMember|manager/i.test(helper));
  const changed = execFileSync('git', ['diff', '884aa8d', '--name-only', '--', 'backend/src/routes/managerRoutes.js', 'backend/src/controllers', 'backend/src/services', 'backend/src/middleware'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  // (loyaltyAdminController: the later subscriber data hotfix, tests/subscriberDataAuth.test.js)
  assert.deepEqual(changed.filter((f) => f !== 'backend/src/controllers/loyaltyAdminController.js'), ['backend/src/controllers/lpController.js'], 'only the push handlers changed');
});

test('internal workflows are unchanged: stamp and reward pushes, the Wallet owner push, the subscribe and key routes', () => {
  const ctl = SRC('controllers/lpController.js'), before = HEAD('backend/src/controllers/lpController.js');
  const fn = (s, name) => s.slice(s.indexOf('async function ' + name + '('), s.indexOf('\n}\n', s.indexOf('async function ' + name + '(')));
  for (const name of ['handleStampConfirm', 'handleRedeemTapConfirm', 'handleWebPushSubscribe', 'handleWebPushVapidKey', 'handleStamp']) assert.equal(fn(ctl, name), fn(before, name), name);
  assert.equal(SRC('controllers/walletController.js'), HEAD('backend/src/controllers/walletController.js'), 'POST /wallet/push/:passId keeps its own owner check');
  assert.ok(SRC('controllers/walletController.js').includes("if (pass.userId !== userId) return res.status(403)"));
});

test('the Admin pages send the sign-in with every push request', () => {
  const sqd = PUB('smart-qr-detail.html');
  assert.ok(sqd.includes('function qraivyPushFetch(url, opts) {') && sqd.includes("h.Authorization = 'Bearer ' + t;"));
  for (const u of ["qraivyPushFetch('https://www.qraivy.com/lp/push/' + slug + '/count')", "qraivyPushFetch('https://www.qraivy.com/lp/push/' + slug + '/history')", "qraivyPushFetch('https://www.qraivy.com/lp/push/' + slug, { method: 'POST',"]) assert.ok(sqd.includes(u), u);
  assert.ok(!/[^h]fetch\('https:\/\/www\.qraivy\.com\/lp\/push\//.test(sqd), 'no push request without the sign-in');
  const dash = PUB('dashboard.html');
  assert.ok(/\/lp\/push\/' \+ _slug, \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json', 'Authorization': 'Bearer ' \+ tok \}/.test(dash));
  assert.ok(/\/lp\/push\/' \+ slug \+ '\/history', \{\s*headers: \{ 'Authorization': 'Bearer ' \+ tok \}/.test(dash));
});

test('qraivyPushFetch sends the Clerk session token and keeps method, body and headers', async () => {
  const sqd = PUB('smart-qr-detail.html');
  const src = sqd.slice(sqd.indexOf('function qraivyPushFetch(url, opts) {'), sqd.indexOf('function loadPushDeviceCount() {'));
  const seen = [];
  const run = (clerk) => { const ctx = { window: { Clerk: clerk }, fetch: (u, o) => { seen.push({ u, o }); return Promise.resolve('ok'); }, Promise, Object }; require('vm').runInNewContext(src + ';this.f = qraivyPushFetch;', ctx); return ctx.f; };
  await run({ session: { getToken: () => Promise.resolve('tok123') } })('https://x/lp/push/a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"t":1}' });
  const plain = (x) => JSON.parse(JSON.stringify(x));   // objects from the vm context
  assert.deepEqual(plain(seen[0]), { u: 'https://x/lp/push/a', o: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok123' }, body: '{"t":1}' } });
  await run(undefined)('https://x/lp/push/a/count');
  assert.deepEqual(plain(seen[1].o.headers), {}, 'signed out: no header (the server answers 401)');
  await run({ session: { getToken: () => Promise.reject(new Error('expired')) } })('https://x/lp/push/a/history');
  assert.deepEqual(plain(seen[2].o.headers), {}, 'a failing token still sends the request (the server answers 401)');
});

(async () => {
  let passed = 0, failed = 0;
  console.log('pushCampaignAuth');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + e.message); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
