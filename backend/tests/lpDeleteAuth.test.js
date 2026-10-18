// ============================================================
// lpDeleteAuth.test.js — Phase 5.5C.4A security fixes for DELETE /lp/:slug
//
// 1. Authorization. Before: handleDeleteLP refused only when the page HAD an
//    owner other than the caller, so any signed-in account could delete a page
//    without an owner. Now: the owner may delete their page; a page without an
//    owner only a platform admin (Clerk publicMetadata.role 'admin', the
//    requireAdmin rule); everything else gets 403 and nothing changes.
// 2. Address takeover. Before: once a deleted page's data was gone its slug
//    was free, and anyone (even without signing in) could create a page there
//    and receive the visitors of its printed QR codes, NFC tags and Wallet
//    links. Now: every deletion is recorded (SupportAction) in the same
//    transaction, and that record keeps the slug reserved for good.
// What a deletion removes is unchanged: the page and its stamp tokens only.
// Mocked Prisma and Clerk.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
const lf = (s) => s.split('\r\n').join('\n');

// ── data ──
let pages, tables, calls, transactions;
const OTHER = ['subscriber', 'webPushSubscription', 'webPushPageSubscription', 'pass', 'passDevice', 'passRegistration', 'loyaltyCustomer', 'stampEntry',
  'rewardEvent', 'stampSettings', 'pushCampaign', 'customer', 'customerIdentity', 'dealPlacement', 'deal', 'business', 'businessLocation', 'user'];
function reset() {
  pages = {
    'owned-page': { id: 'lp-owned', slug: 'owned-page', userId: 'user_owner', businessId: null },
    'ownerless-page': { id: 'lp-free', slug: 'ownerless-page', userId: null, businessId: null },
    'business-page': { id: 'lp-biz', slug: 'business-page', userId: 'user_owner', businessId: 'biz_1' },
  };
  tables = { stampToken: [{ id: 't1', slug: 'owned-page' }, { id: 't2', slug: 'ownerless-page' }, { id: 't3', slug: 'other-page' }], supportAction: [] };
  // data every other table holds for the pages: must never be touched by a deletion
  for (const m of OTHER) tables[m] = [{ id: m + '-1', slug: 'owned-page' }, { id: m + '-2', slug: 'ownerless-page' }];
  calls = []; transactions = 0;
}
reset();
const match = (row, where) => Object.keys(where).every((k) => row[k] === where[k]);
// every model method is recorded; only the ones handleDeleteLP may use do anything
function model(name) {
  return new Proxy({}, { get(_, method) {
    return (args) => {
      calls.push(name + '.' + method);
      if (name === 'landingPage' && method === 'findUnique') return Promise.resolve(pages[args.where.slug] || null);
      if (name === 'landingPage' && method === 'delete') return { apply() { if (!pages[args.where.slug]) throw new Error('not found'); delete pages[args.where.slug]; } };
      if (name === 'stampToken' && method === 'deleteMany') return { apply() { tables.stampToken = tables.stampToken.filter((r) => !match(r, args.where)); } };
      if (name === 'supportAction' && method === 'create') return { apply() { tables.supportAction.push(Object.assign({ id: 'sa' + (tables.supportAction.length + 1) }, args.data)); } };
      if (method === 'findFirst') return Promise.resolve((tables[name] || []).find((r) => match(r, args.where)) || null);
      return Promise.reject(new Error('unexpected ' + name + '.' + method));
    };
  } });
}
const mockPrisma = new Proxy({
  // all or nothing, like Prisma's array transaction
  async $transaction(ops) { transactions++; const snap = JSON.stringify([pages, tables]); try { ops.forEach((o) => o.apply()); } catch (e) { [pages, tables] = JSON.parse(snap); throw e; } return []; },
}, { get(t, k) { return k in t ? t[k] : model(k); } });

// Clerk: only for the platform-admin check (the real adminMiddleware runs)
let clerkUsers, clerkLookups;
require.cache[require.resolve('@clerk/backend')] = { loaded: true, exports: {
  verifyToken: async () => { throw new Error('not used'); },
  createClerkClient: () => ({ users: { async getUser(id) { clerkLookups.push(id); if (clerkUsers[id] instanceof Error) throw clerkUsers[id]; if (!clerkUsers[id]) throw new Error('not found'); return clerkUsers[id]; } } }),
} };
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { loaded: true, exports: mockPrisma };
require.cache[resolve('src', 'utils', 'pageCache.js')] = { loaded: true, exports: { pageCache: { delByPrefix() {}, get() { return null; }, set() {} } } };
require.cache[resolve('src', 'services', 'emailService.js')] = { loaded: true, exports: { sendWelcomeEmail: async () => ({}) } };
require.cache[resolve('src', 'services', 'customerIdentityService.js')] = { loaded: true, exports: { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} } };
// a verified token is "Bearer <clerk user id>"; anything else is not verified
require.cache[resolve('src', 'controllers', 'qrController.js')] = { loaded: true, exports: { getUserFromToken: async (h) => (h && h.startsWith('Bearer user_') ? h.slice(7) : null) } };

const { handleDeleteLP, handlePublishLP } = require('../src/controllers/lpController');
const { isPlatformAdmin } = require('../src/services/platformAdmin');

function resetClerk() {
  clerkLookups = [];
  clerkUsers = {
    user_admin: { id: 'user_admin', publicMetadata: { role: 'admin' } },
    user_owner: { id: 'user_owner', publicMetadata: {} },
    user_other: { id: 'user_other', publicMetadata: { role: 'manager' } },
    user_broken: new Error('Clerk unavailable'),
  };
}
resetClerk();
const fakeRes = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader() {} });
let warnings = [];
const origWarn = console.warn;
async function del(slug, auth) {
  const res = fakeRes();
  console.warn = (...a) => warnings.push(a.join(' '));
  try { await handleDeleteLP({ params: { slug }, headers: auth ? { authorization: auth } : {}, method: 'DELETE', originalUrl: '/lp/' + slug, ip: '127.0.0.1' }, res); }
  finally { console.warn = origWarn; }
  return res;
}
async function publish(slug, user) {
  const res = fakeRes();
  await handlePublishLP({ body: { slug, businessName: 'New Business', sections: {} }, headers: user ? { authorization: 'Bearer ' + user } : {} }, res);
  return res;
}
const snapshot = () => JSON.stringify([pages, tables]);
const deletedMarker = (slug) => tables.supportAction.find((r) => r.actionType === 'landing_page_deleted' && r.targetType === 'LandingPageSlug' && r.targetId === slug);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the owner can delete their own page: page and its stamp tokens go, the deletion is recorded, nothing else is touched', async () => {
  reset(); resetClerk();
  const r = await del('owned-page', 'Bearer user_owner');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true, success: true });
  assert.equal(pages['owned-page'], undefined);
  assert.deepEqual(tables.stampToken.map((t) => t.id), ['t2', 't3']);
  for (const m of OTHER) assert.equal(tables[m].length, 2, m + ' untouched');
  const marker = deletedMarker('owned-page');
  assert.ok(marker, 'deletion recorded');
  assert.equal(marker.actorId, 'user_owner');
  assert.equal(marker.actorType, 'human');
  assert.deepEqual(marker.metadata, { pageId: 'lp-owned', ownerless: false });
  assert.equal(transactions, 1, 'one transaction');
  assert.deepEqual(calls, ['landingPage.findUnique', 'stampToken.deleteMany', 'landingPage.delete', 'supportAction.create']);
  assert.deepEqual(clerkLookups, [], 'no admin lookup for the owner');
  // a page linked to a business is deleted the same way, by its owner
  calls = [];
  assert.equal((await del('business-page', 'Bearer user_owner')).statusCode, 200);
  assert.equal(pages['business-page'], undefined);
  assert.deepEqual(calls, ['landingPage.findUnique', 'stampToken.deleteMany', 'landingPage.delete', 'supportAction.create'], 'no Business or StadtPocket table is touched');
});

test('another account cannot delete the page, not even a platform admin: 403 and nothing changes', async () => {
  for (const user of ['user_other', 'user_admin']) {
    reset(); resetClerk(); warnings = [];
    const before = snapshot();
    const r = await del('owned-page', 'Bearer ' + user);
    assert.equal(r.statusCode, 403, user);
    assert.deepEqual(r.body, { error: 'Forbidden' });
    assert.equal(snapshot(), before, user + ': nothing changed');
    assert.equal(transactions, 0);
    assert.ok(warnings.some((w) => w.includes('LP_DELETE_DENIED') && w.includes('owned-page')), 'denial logged');
  }
});

test('a signed-in account cannot delete a page without an owner (the hole): 403, nothing changes', async () => {
  for (const user of ['user_other', 'user_owner', 'user_unknown', 'user_broken']) {
    reset(); resetClerk();
    const before = snapshot();
    const r = await del('ownerless-page', 'Bearer ' + user);
    assert.equal(r.statusCode, 403, user);
    assert.equal(snapshot(), before, user);
    assert.equal(transactions, 0);
  }
});

test('a platform admin (Clerk role "admin", as requireAdmin) can delete a page without an owner', async () => {
  reset(); resetClerk();
  const r = await del('ownerless-page', 'Bearer user_admin');
  assert.equal(r.statusCode, 200);
  assert.equal(pages['ownerless-page'], undefined);
  assert.deepEqual(clerkLookups, ['user_admin'], 'role read from Clerk server-side');
  assert.deepEqual(deletedMarker('ownerless-page').metadata, { pageId: 'lp-free', ownerless: true });
  assert.equal(deletedMarker('ownerless-page').actorId, 'user_admin');
});

test('requests without a verified sign-in are rejected with 401 before anything is read', async () => {
  for (const auth of [null, '', 'Bearer ', 'Bearer forged-token', 'Basic user_owner', 'user_owner']) {
    reset(); resetClerk();
    const before = snapshot();
    const r = await del('owned-page', auth);
    assert.equal(r.statusCode, 401, String(auth));
    assert.equal(snapshot(), before);
    assert.deepEqual(calls, [], 'no database access');
  }
});

test('a page that does not exist gives 404 and changes nothing', async () => {
  reset(); resetClerk();
  const before = snapshot();
  assert.equal((await del('missing-page', 'Bearer user_owner')).statusCode, 404);
  assert.equal(snapshot(), before);
});

test('isPlatformAdmin follows requireAdmin exactly and denies on any doubt', async () => {
  resetClerk();
  assert.equal(await isPlatformAdmin('user_admin'), true);
  for (const id of ['user_owner', 'user_other', 'user_broken', 'user_unknown', '', null, undefined, 42]) assert.equal(await isPlatformAdmin(id), false, String(id));
  clerkUsers.user_weird = { id: 'user_weird', publicMetadata: { role: 'Admin' } };
  clerkUsers.user_none = { id: 'user_none' };
  assert.equal(await isPlatformAdmin('user_weird'), false);
  assert.equal(await isPlatformAdmin('user_none'), false);
  const mw = lf(fs.readFileSync(resolve('src', 'middleware', 'adminMiddleware.js'), 'utf8'));
  assert.ok(mw.includes("if (meta.role !== 'admin') {"), 'requireAdmin uses the same rule');
  const svc = lf(fs.readFileSync(resolve('src', 'services', 'platformAdmin.js'), 'utf8'));
  assert.ok(svc.includes(".role === 'admin';"));
  assert.equal(execFileSync('git', ['diff', '4ed4287', '--name-only', '--', 'backend/src/middleware'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim(), '', 'sign-in middleware unchanged');
});

test('after deletion the address cannot be taken over: anyone (also signed out, also the old owner) gets 409', async () => {
  reset(); resetClerk();
  for (const m of OTHER) tables[m] = []; // the page held no other data: before the fix its slug was free right away
  assert.equal((await del('owned-page', 'Bearer user_owner')).statusCode, 200);
  const { retainedDataFor } = require('../src/services/slugReservation');
  assert.deepEqual(await retainedDataFor('owned-page'), ['deleted page']);
  for (const user of ['user_other', null, 'user_owner', 'user_admin']) {
    const r = await publish('owned-page', user);
    assert.equal(r.statusCode, 409, String(user));
    assert.equal(r.body.error, 'slug_unavailable');
    assert.equal(pages['owned-page'], undefined, 'no page created');
  }
  assert.deepEqual(await retainedDataFor('never-used-x1'), [], 'other addresses stay free');
});

test('if recording the deletion fails, nothing is deleted (one transaction)', async () => {
  reset(); resetClerk();
  const before = snapshot();
  const orig = mockPrisma.$transaction;
  mockPrisma.$transaction = async (ops) => { transactions++; const snap = JSON.stringify([pages, tables]); try { ops.forEach((o, i) => { if (i === 2) throw new Error('write failed'); o.apply(); }); } catch (e) { [pages, tables] = JSON.parse(snap); throw e; } };
  try {
    const r = await del('owned-page', 'Bearer user_owner');
    assert.equal(r.statusCode, 500);
    assert.equal(snapshot(), before, 'page and stamp tokens still there');
  } finally { mockPrisma.$transaction = orig; }
});

test('the handler deletes only the page and its stamp tokens; the route and other delete paths are unchanged', () => {
  const src = lf(fs.readFileSync(resolve('src', 'controllers', 'lpController.js'), 'utf8'));
  const fn = src.slice(src.indexOf('async function handleDeleteLP('), src.indexOf('\n}\n', src.indexOf('async function handleDeleteLP(')));
  const writes = fn.match(/prisma\.\w+\.(delete|deleteMany|update|updateMany|upsert|create|createMany)\(/g);
  assert.deepEqual(writes, ['prisma.stampToken.deleteMany(', 'prisma.landingPage.delete(', 'prisma.supportAction.create(']);
  assert.ok(fn.indexOf('if (!userId) return res.status(401)') < fn.indexOf('landingPage.findUnique('), '401 before any read');
  assert.ok(fn.indexOf('if (!allowed) {') < fn.indexOf('pageCache.delByPrefix('), 'authorization before any change');
  const routes = lf(fs.readFileSync(resolve('src', 'routes', 'lpRoutes.js'), 'utf8'));
  assert.ok(routes.includes("router.delete('/lp/:slug', handleDeleteLP);"));
  assert.equal((src.match(/landingPage\.delete\(/g) || []).length, 1, 'the only page deletion');
});

test('no schema, migration, Wallet, push, loyalty, StadtPocket, billing or frontend file changed', () => {
  const changed = execFileSync('git', ['diff', '4ed4287', '--name-only', '--', 'backend/prisma', 'frontend', 'backend/src/services/passService.js', 'backend/src/services/googleWalletService.js',
    'backend/src/services/apnsService.js', 'backend/src/controllers/walletController.js', 'backend/src/services/webPushPages.js', 'backend/src/services/webPushService.js',
    'backend/src/controllers/loyaltyAdminController.js', 'backend/src/services/stadtPocketContext.js', 'backend/src/routes/stadtpocketPublicRoutes.js',
    'backend/src/routes/managerStadtpocketListingRoutes.js', 'backend/src/routes/stripeRoutes.js', 'backend/src/services/customerIdentityService.js',
    ...require('./helpers/academyFiles').ACADEMY_EXCLUDES, ...require('./helpers/phase0Files').PHASE0_EXCLUDES], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim();
  assert.equal(changed, '');
});

(async () => {
  let passed = 0, failed = 0;
  console.log('lpDeleteAuth');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
