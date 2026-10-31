// ============================================================
// slugReservation.test.js — security fix: a deleted page's address stays
// reserved while customer or business data remains under its slug.
//
// Before: POST /lp created a page on any free slug. A deleted page's slug is
// free, but its subscribers, push subscriptions, Wallet passes, loyalty and
// stamp records, campaigns and deal placements are still stored under it; a
// new page there made its owner the owner of all of that.
// Now: creating a NEW page on such a slug answers 409, for everyone. Existing
// pages, their owners' updates, and genuinely free slugs are unchanged.
// Nothing is deleted or reassigned. Mocked Prisma.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
const lf = (s) => s.split('\r\n').join('\n');

// ── data: one table per model, rows with the fields the check reads ──
let pages, rows, upserts, reads;
const MODELS = ['subscriber', 'webPushSubscription', 'webPushPageSubscription', 'pass', 'loyaltyCustomer', 'stampEntry', 'rewardEvent', 'stampSettings', 'stampToken', 'pushCampaign', 'customer', 'customerIdentity', 'dealPlacement', 'supportAction'];
function reset() {
  pages = {
    'live-page': { id: 'lp1', slug: 'live-page', userId: 'owner_live', businessName: 'Live', sections: '{}', businessId: null },
  };
  rows = Object.fromEntries(MODELS.map((m) => [m, []]));
  upserts = []; reads = [];
}
reset();
function match(row, where) {
  return Object.keys(where).every((k) => {
    const w = where[k];
    if (k === 'OR') return w.some((x) => match(row, x));
    if (w && typeof w === 'object' && 'startsWith' in w) return typeof row[k] === 'string' && row[k].startsWith(w.startsWith);
    return row[k] === w;
  });
}
const model = (name) => ({ async findFirst({ where }) { reads.push(name); return rows[name].find((r) => match(r, where)) || null; } });
const mockPrisma = Object.assign(Object.fromEntries(MODELS.map((m) => [m, model(m)])), {
  landingPage: {
    async findUnique({ where: { slug } }) { return pages[slug] || null; },
    async findFirst() { return null; },
    async count({ where }) { return Object.values(pages).filter((p) => p.userId === where.userId).length; },
    async upsert(args) { upserts.push(args.where.slug); const isNew = !pages[args.where.slug]; pages[args.where.slug] = Object.assign({ id: 'lp-' + args.where.slug, slug: args.where.slug }, isNew ? args.create : Object.assign({}, pages[args.where.slug], args.update)); return pages[args.where.slug]; },
    async update({ where: { slug }, data }) { pages[slug] = Object.assign({}, pages[slug], data); return pages[slug]; },
  },
  user: { async findUnique({ where: { id } }) { return { id, plan: 'business', subscriptionStatus: 'active' }; } },
  business: { async findUnique() { return null; } },
  businessLocation: { async findFirst() { return null; } },
  async $transaction(fn) { return fn(mockPrisma); },
});
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { loaded: true, exports: mockPrisma };
require.cache[resolve('src', 'utils', 'pageCache.js')] = { loaded: true, exports: { pageCache: { delByPrefix() {}, get() { return null; }, set() {} } } };
require.cache[resolve('src', 'services', 'emailService.js')] = { loaded: true, exports: { sendWelcomeEmail: async () => ({}) } };
require.cache[resolve('src', 'services', 'customerIdentityService.js')] = { loaded: true, exports: { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} } };
require.cache[resolve('src', 'controllers', 'qrController.js')] = { loaded: true, exports: { getUserFromToken: async (h) => (h && h.startsWith('Bearer ') ? h.slice(7) : null) } };

const { handlePublishLP } = require('../src/controllers/lpController');
const { retainedDataFor, CHECKED_KINDS } = require('../src/services/slugReservation');

const fakeRes = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader() {} });
async function publish(slug, user, extra) {
  const res = fakeRes();
  await handlePublishLP({ body: Object.assign({ slug, businessName: 'New Business', sections: {} }, extra || {}), headers: user ? { authorization: 'Bearer ' + user } : {} }, res);
  return res;
}
// what a deleted page leaves behind, per table
const LEFTOVER = {
  subscriber: { slug: 'old-page', email: 'customer@example.test' },
  webPushSubscription: { slug: 'old-page' },
  webPushPageSubscription: { slug: 'old-page' },
  pass: { slug: 'old-page', serialNumber: 'sqr-old-page-cid12345' },
  loyaltyCustomer: { slug: 'old-page' },
  stampEntry: { slug: 'old-page' },
  rewardEvent: { slug: 'old-page' },
  stampSettings: { slug: 'old-page' },
  stampToken: { slug: 'old-page' },
  pushCampaign: { slug: 'old-page' },
  customer: { slug: 'old-page' },
  customerIdentity: { slug: 'old-page' },
  dealPlacement: { channel: 'landing_page', targetRef: 'old-page' },
  // Phase 5.5C.4A: the record handleDeleteLP writes for every deletion
  supportAction: { actionType: 'landing_page_deleted', targetType: 'LandingPageSlug', targetId: 'old-page' },
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('another account cannot create a page on a deleted page\'s slug — for every kind of retained data', async () => {
  for (const m of MODELS) {
    reset();
    rows[m].push(Object.assign({ id: m + '1' }, LEFTOVER[m]));
    const r = await publish('old-page', 'user_newcomer');
    assert.equal(r.statusCode, 409, m);
    assert.deepEqual(r.body, { error: 'slug_unavailable', message: 'This page address is not available. Please choose another one.' });
    assert.deepEqual(upserts, [], m + ': no page created');
    assert.equal(pages['old-page'], undefined);
    assert.ok(!JSON.stringify(r.body).includes('@'), 'nothing about the data is revealed');
  }
});

test('anonymous creation is refused the same way; and so is a signed-in account sending a forged owner or business', async () => {
  reset(); rows.subscriber.push({ id: 's1', slug: 'old-page' });
  assert.equal((await publish('old-page', null)).statusCode, 409);
  assert.equal((await publish('old-page', 'user_newcomer', { userId: 'owner_old', ownerUserId: 'owner_old' })).statusCode, 409);
  assert.deepEqual(upserts, []);
});

test('Phase 5.5C.4A: a deleted page\'s address stays reserved after its data is gone, for everyone including its old owner', async () => {
  reset(); rows.supportAction.push(Object.assign({ id: 'sa1' }, LEFTOVER.supportAction));
  assert.deepEqual(await retainedDataFor('old-page'), ['deleted page']);
  for (const user of ['user_newcomer', 'owner_old', null]) assert.equal((await publish('old-page', user)).statusCode, 409, String(user));
  assert.deepEqual(upserts, []);
  // only that slug, and only the deletion record counts
  assert.deepEqual(await retainedDataFor('old-page-2'), []);
  reset(); rows.supportAction.push({ id: 'sa2', actionType: 'landing_page_owner_assigned', targetType: 'LandingPage', targetId: 'old-page' });
  assert.deepEqual(await retainedDataFor('old-page'), []);
});

test('Wallet passes without a slug field are found by serial number (sqr-<slug> and sqr-<slug>-<customer>)', async () => {
  for (const serial of ['sqr-old-page', 'sqr-old-page-3f2a9c1e-77aa']) {
    reset(); rows.pass.push({ id: 'p1', slug: null, serialNumber: serial });
    assert.deepEqual(await retainedDataFor('old-page'), ['wallet passes'], serial);
  }
  reset(); rows.pass.push({ id: 'p1', slug: null, serialNumber: 'sqr-other-page' });
  assert.deepEqual(await retainedDataFor('old-page'), []);
});

test('a free slug (no page, no data) can still be created, signed in or anonymously', async () => {
  reset();
  const signedIn = await publish('brand-new-ab1', 'user_newcomer');
  assert.equal(signedIn.statusCode, 200, JSON.stringify(signedIn.body));
  assert.equal(pages['brand-new-ab1'].userId, 'user_newcomer');
  const anon = await publish('brand-new-cd2', null);
  assert.equal(anon.statusCode, 200);
  assert.deepEqual(upserts, ['brand-new-ab1', 'brand-new-cd2']);
});

test('existing pages are unaffected: the owner keeps updating a page that has customer data; others still get 403', async () => {
  reset();
  for (const m of MODELS) rows[m].push(Object.assign({ id: m + '1' }, LEFTOVER[m], { slug: 'live-page', targetRef: 'live-page', serialNumber: 'sqr-live-page' }));
  reads = [];
  const own = await publish('live-page', 'owner_live', { businessName: 'Live Renamed' });
  assert.equal(own.statusCode, 200);
  assert.deepEqual(reads, [], 'the reservation is only consulted when no page exists');
  assert.equal((await publish('live-page', 'user_newcomer')).statusCode, 403);
});

test('nothing is deleted, moved or changed by a refused attempt', async () => {
  reset();
  for (const m of MODELS) rows[m].push(Object.assign({ id: m + '1' }, LEFTOVER[m]));
  const before = JSON.stringify(rows);
  await publish('old-page', 'user_newcomer');
  assert.equal(JSON.stringify(rows), before);
  const src = lf(fs.readFileSync(resolve('src', 'services', 'slugReservation.js'), 'utf8'));
  assert.ok(!/\.(delete|deleteMany|update|updateMany|upsert|create)\(/.test(src), 'read-only');
  assert.equal((src.match(/select: \{ id: true \}/g) || []).length, 1, 'only ids are read');
});

test('the check covers every model that stores data by page slug', () => {
  const schema = lf(fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8'));
  const slugModels = [];
  schema.split('\nmodel ').slice(1).forEach((block) => {
    const name = block.split(' ')[0];
    if (/\n\s+slug\s+String/.test(block) && !['LandingPage', 'Network', 'Location', 'Business', 'StadtPocketListing'].includes(name)) slugModels.push(name);
  });
  // LandingPage owns the slug; Network/Location/Business/StadtPocketListing are separate address spaces (not page slugs).
  const covered = { Subscriber: 'subscriber', WebPushSubscription: 'webPushSubscription', Pass: 'pass', LoyaltyCustomer: 'loyaltyCustomer', StampEntry: 'stampEntry', RewardEvent: 'rewardEvent',
    StampSettings: 'stampSettings', StampToken: 'stampToken', PushCampaign: 'pushCampaign', Customer: 'customer', CustomerIdentity: 'customerIdentity', WebPushPageSubscription: 'webPushPageSubscription' };
  const src = lf(fs.readFileSync(resolve('src', 'services', 'slugReservation.js'), 'utf8'));
  for (const m of slugModels) assert.ok(covered[m] && src.includes('prisma.' + covered[m] + '.findFirst('), 'slug model checked: ' + m);
  assert.ok(src.includes("prisma.dealPlacement.findFirst(Object.assign({ where: { channel: 'landing_page', targetRef: slug } }"), 'deal placements by page slug');
  assert.equal(CHECKED_KINDS.length, MODELS.length);
});

test('the only page-creating path is guarded, after the ownership gate and before any write', () => {
  const src = lf(fs.readFileSync(resolve('src', 'controllers', 'lpController.js'), 'utf8'));
  const fn = src.slice(src.indexOf('async function handlePublishLP('), src.indexOf('\n}\n', src.indexOf('async function handlePublishLP(')));
  const guard = fn.indexOf("if (!existing && (await retainedDataFor(slug)).length) {");
  assert.ok(guard > fn.indexOf("if (existing.userId !== userId) {") && guard < fn.indexOf('landingPage.upsert('), 'order');
  const root = path.join(__dirname, '..', 'src');
  const creators = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js') && /landingPage\.(create|upsert|createMany)\(/.test(fs.readFileSync(p, 'utf8'))) creators.push(path.relative(root, p).split(path.sep).join('/')); } })(root);
  // ...and Studio V3 drafts (Phase D1): a draft's address is checked the same way before it is taken
  assert.deepEqual(creators, ['controllers/lpController.js', 'lpV3/studioDraftsController.js']);
  const studio = lf(fs.readFileSync(resolve('src', 'lpV3', 'studioDraftsController.js'), 'utf8'));
  assert.ok(studio.includes('if ((await retainedDataFor(slug)).length) continue;'));
  assert.equal(studio.split('landingPage.create(').length - 1, 1);
  assert.equal((src.match(/landingPage\.upsert\(/g) || []).length, 2, 'both upserts are inside handlePublishLP');
  assert.equal((fn.match(/landingPage\.upsert\(/g) || []).length, 2);
});

test('Wallet, loyalty and StadtPocket code is untouched', () => {
  const changed = execFileSync('git', ['diff', '0cd8e45', '--name-only', '--', 'backend/src/services/passService.js', 'backend/src/services/googleWalletService.js', 'backend/src/services/apnsService.js',
    'backend/src/controllers/walletController.js', 'backend/src/controllers/passController.js', 'backend/src/services/stadtPocketContext.js', 'backend/src/routes/stadtpocketPublicRoutes.js',
    'backend/src/routes/managerStadtpocketListingRoutes.js', 'backend/prisma/migrations/20261011120000_add_deal_and_deal_placement', 'frontend/public',
    ...require('./helpers/academyFiles').ACADEMY_EXCLUDES, ...require('./helpers/phase0Files').PHASE0_EXCLUDES, ...require('./helpers/lpV3Files').LPV3_EXCLUDES], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim();   // Academy: tests/academyPage.test.js
  assert.equal(changed, '');
});

(async () => {
  let passed = 0, failed = 0;
  console.log('slugReservation');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
