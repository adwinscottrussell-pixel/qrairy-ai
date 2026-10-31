// ============================================================
// lpPublishDraftGuard.test.js — Studio V3 Phase D1: an unpublished Studio
// draft never becomes live through the legacy POST /lp (handlePublishLP).
//
//   - the owner gets 409 studio_draft; nothing is written (no upsert, no
//     update, the row and its status are unchanged)
//   - anonymous 401 and another account 403 exactly as before (the
//     ownership gate runs first), also nothing written
//   - unchanged: the owner updating a live page, an anonymous new page
//     (smart-demo.html), a signed-in new page
//   - drafts do not count towards the published-page limit (countSmartPages)
//
// Run: node tests/lpPublishDraftGuard.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
let pages, writes, counts;
const OWNER = 'user_owner', OTHER = 'user_other';
function reset() {
  pages = {
    'my-draft': { id: 'lp_d', slug: 'my-draft', userId: OWNER, businessName: 'Entwurf', status: 'draft', renderer: 'legacy', sections: null, businessId: null },
    'my-live': { id: 'lp_l', slug: 'my-live', userId: OWNER, businessName: 'Live', status: 'live', renderer: 'legacy', sections: '{}', businessId: null },
  };
  writes = []; counts = [];
}
reset();
const matches = (row, where) => Object.keys(where).every((k) => (where[k] && typeof where[k] === 'object' && 'not' in where[k] ? row[k] !== where[k].not : row[k] === where[k]));
const RESERVATION = ['subscriber', 'webPushSubscription', 'webPushPageSubscription', 'pass', 'loyaltyCustomer', 'stampEntry', 'rewardEvent', 'stampSettings', 'stampToken', 'pushCampaign', 'customer', 'customerIdentity', 'dealPlacement', 'supportAction'];
const mockPrisma = Object.assign(Object.fromEntries(RESERVATION.map((m) => [m, { async findFirst() { return null; } }])), {
  landingPage: {
    async findUnique({ where: { slug } }) { return pages[slug] ? Object.assign({}, pages[slug]) : null; },
    async findFirst() { return null; },
    async count({ where }) { counts.push(where); return Object.values(pages).filter((p) => matches(p, where)).length; },
    async upsert(args) { writes.push('upsert:' + args.where.slug); const isNew = !pages[args.where.slug]; pages[args.where.slug] = Object.assign({ id: 'lp-' + args.where.slug, slug: args.where.slug }, isNew ? args.create : Object.assign({}, pages[args.where.slug], args.update)); return pages[args.where.slug]; },
    async update({ where: { slug }, data }) { writes.push('update:' + slug); pages[slug] = Object.assign({}, pages[slug], data); return pages[slug]; },
  },
  // the owner's plan: Starter, 10 published pages
  user: { async findUnique({ where: { id } }) { return { id, plan: 'starter', subscriptionStatus: 'active' }; } },
  business: { async findUnique() { return null; } },
  businessLocation: { async findFirst() { return null; } },
  async $transaction(fn) { return fn(mockPrisma); },
});
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { loaded: true, exports: mockPrisma };
require.cache[resolve('src', 'utils', 'pageCache.js')] = { loaded: true, exports: { pageCache: { delByPrefix() {}, get() { return null; }, set() {} } } };
require.cache[resolve('src', 'services', 'emailService.js')] = { loaded: true, exports: { sendWelcomeEmail: async () => ({}) } };
require.cache[resolve('src', 'services', 'customerIdentityService.js')] = { loaded: true, exports: { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} } };
require.cache[resolve('src', 'controllers', 'qrController.js')] = { loaded: true, exports: { getUserFromToken: async (h) => (h && h.startsWith('Bearer ') ? h.slice(7) : null) } };
process.on('unhandledRejection', () => {});

const { handlePublishLP } = require('../src/controllers/lpController');
const { countSmartPages } = require('../src/utils/tierSystem');

const fakeRes = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader() {}, set() { return this; } });
async function publish(slug, user, extra) {
  const res = fakeRes();
  await handlePublishLP({ body: Object.assign({ slug, businessName: 'Neuer Name', sections: { hero: { title: 'Live gemacht' } } }, extra || {}), headers: user ? { authorization: 'Bearer ' + user } : {} }, res);
  return res;
}
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the owner cannot write or publish a Studio draft through POST /lp: 409 studio_draft, nothing written, still a draft', async () => {
  reset();
  const before = JSON.stringify(pages['my-draft']);
  for (const extra of [{}, { status: 'live' }, { userId: OWNER }, { businessId: 'biz_1' }]) {
    const r = await publish('my-draft', OWNER, extra);
    assert.equal(r.statusCode, 409, JSON.stringify(extra));
    assert.equal(r.body.error, 'studio_draft');
  }
  assert.deepEqual(writes, []);
  assert.equal(JSON.stringify(pages['my-draft']), before);
});

test('anonymous 401 and another account 403, as before: the ownership gate still runs first; nothing written', async () => {
  reset();
  assert.equal((await publish('my-draft', null)).statusCode, 401);
  assert.equal((await publish('my-draft', OTHER)).statusCode, 403);
  assert.equal((await publish('my-draft', OTHER, { userId: OWNER })).statusCode, 403, 'a body userId is never identity');
  assert.deepEqual(writes, []);
  assert.equal(pages['my-draft'].status, 'draft');
});

test('unchanged: the owner updates a live page; anonymous and signed-in new pages are created live as before', async () => {
  reset();
  const own = await publish('my-live', OWNER);
  assert.equal(own.statusCode, 200, JSON.stringify(own.body));
  assert.equal(pages['my-live'].status, 'live');
  const anon = await publish('demo-page-x1y', null);
  assert.equal(anon.statusCode, 200, JSON.stringify(anon.body));
  assert.equal(pages['demo-page-x1y'].status, 'live');
  assert.equal(pages['demo-page-x1y'].userId, null);
  const mine = await publish('owner-new-page', OWNER);
  assert.equal(mine.statusCode, 200, JSON.stringify(mine.body));
  assert.equal(pages['owner-new-page'].userId, OWNER);
  assert.deepEqual(writes.filter((w) => w.startsWith('upsert:')), ['upsert:my-live', 'upsert:demo-page-x1y', 'upsert:owner-new-page']);
});

test('drafts do not count towards published pages: countSmartPages excludes status draft', async () => {
  reset();
  for (let i = 0; i < 3; i++) pages['d' + i] = { id: 'd' + i, slug: 'd' + i, userId: OWNER, status: 'draft' };
  assert.equal(await countSmartPages(OWNER), 1, 'only the live page');
  assert.deepEqual(counts.pop(), { userId: OWNER, status: { not: 'draft' } });
  assert.equal(await countSmartPages(OTHER), 0);
});

test('POST /lp plan limit: a Starter account (10 pages) with 9 live pages and 3 drafts can still publish its 10th page, not an 11th', async () => {
  reset();
  for (let i = 0; i < 8; i++) pages['live' + i] = { id: 'l' + i, slug: 'live' + i, userId: OWNER, status: 'live' };
  for (let i = 0; i < 3; i++) pages['draft' + i] = { id: 'd' + i, slug: 'draft' + i, userId: OWNER, status: 'draft' };
  const tenth = await publish('tenth-page', OWNER);
  assert.equal(tenth.statusCode, 200, JSON.stringify(tenth.body));
  const eleventh = await publish('eleventh-page', OWNER);
  assert.notEqual(eleventh.statusCode, 200, 'the limit still applies to published pages');
  assert.ok(!pages['eleventh-page']);
});

test('the guard sits right after the ownership gate, before the address checks, StadtPocket, plan limit and every write', () => {
  const src = fs.readFileSync(resolve('src', 'controllers', 'lpController.js'), 'utf8').split('\r\n').join('\n');
  const fn = src.slice(src.indexOf('async function handlePublishLP('), src.indexOf('\n}\n', src.indexOf('async function handlePublishLP(')));
  const at = (s) => { const i = fn.indexOf(s); assert.ok(i > 0, s); return i; };
  const guard = at("if (existing.status === 'draft') {");
  assert.ok(guard > at('if (existing.userId !== userId) {'));
  for (const later of ['await retainedDataFor(slug)', 'countSmartPages(userId)', 'landingPage.upsert(']) assert.ok(guard < at(later), later);
});

(async () => {
  let passed = 0, failed = 0;
  console.log('lpPublishDraftGuard');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + String(e && e.message).split('\n').slice(0, 10).join('\n       ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
