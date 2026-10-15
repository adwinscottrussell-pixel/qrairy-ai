// ============================================================
// dealVisibility.test.js — QRAIVY Deals public visibility follows the page
// owner's Deals access on EVERY request (Phase 3B.6, strict cache safety).
// Drives the real lpController.handleServeLP + dealCards + dealService +
// dealAccess on a stand-in database (no network, no real database).
//
//   C. the warm card cache is never used as authorization
//   H. Cache-Control for every page that can show deals: private, no-store
//   A. access matrix through the real page (plans, trial, pilot, renewal)
//   F. lookup failure: fail closed, page still served
//   P. existing published-deal and landing-page-link behaviour
//
// Run: node tests/dealVisibility.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

// ── stand-in database ──────────────────────────────────────────
let deals = [], placements = [], pages = {}, users = {}, stamp = null;
let counts = { placementQueries: 0, userLookups: 0, scans: 0 }, userLookupFails = false;
const clone = (r) => (r ? JSON.parse(JSON.stringify(r)) : null);
const mockPrisma = {
  deal: {
    findUnique: async ({ where }) => clone(deals.find((d) => d.id === where.id)),
    findMany: async () => [],
    update: async ({ where, data }) => { const r = deals.find((d) => d.id === where.id); Object.assign(r, data); return clone(r); },
  },
  dealPlacement: {
    findMany: async ({ where = {}, take } = {}) => {
      counts.placementQueries += 1;
      return placements.filter((p) => Object.keys(where).every((k) => p[k] === where[k])).slice(0, take || 50).map(clone);
    },
  },
  landingPage: {
    findUnique: async ({ where }) => clone(pages[where.slug]),
    update: async ({ data }) => { if (data && data.scanCount) counts.scans += 1; return {}; },
  },
  user: { findUnique: async ({ where }) => { counts.userLookups += 1; if (userLookupFails) throw new Error('db down'); return clone(users[where.id]); } },
  stampSettings: { findUnique: async () => clone(stamp) },
  business: { findUnique: async () => null },
  businessMember: { findUnique: async () => null },
  $transaction: async (fn) => fn(mockPrisma),
};
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { id: 'p', filename: 'p', loaded: true, exports: mockPrisma };
for (const svc of ['apnsService', 'emailService', 'webPushService']) {
  const p = resolve('src', 'services', svc + '.js');
  require.cache[p] = { id: p, filename: p, loaded: true, exports: {} };
}
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
delete process.env.APP_ENV;
const realError = console.error;
const errors = [];
console.error = (...a) => { if (/^\[(deals|auth|LP)\]/.test(String(a[0]))) errors.push(String(a[0])); else realError(...a); };
require('../src/services/voiceService').synthesizeAndUploadVoice = async () => { throw new Error('no recordings in tests'); };

const { pageCache } = require('../src/utils/pageCache');
const cards = require('../src/services/dealCards');
const service = require('../src/services/dealService');
const { handleServeLP } = require('../src/controllers/lpController');

const OWNER = 'user_owner', OTHER = 'user_other';
const HOUR = 3600 * 1000;
function setEnv({ flag = true, rollout = { DEALS_PILOT_USER_IDS: OWNER } } = {}) {
  delete process.env.DEALS_ENABLED; delete process.env.DEALS_PILOT_USER_IDS;
  Object.assign(process.env, rollout);
  if (flag) process.env.DEALS_ON_LANDING_PAGES = '1'; else delete process.env.DEALS_ON_LANDING_PAGES;
}
function reset(env) {
  deals = []; placements = []; users = {}; stamp = null; userLookupFails = false; errors.length = 0;
  counts = { placementQueries: 0, userLookups: 0, scans: 0 };
  pages = {
    cafe: { id: 'lp1', slug: 'cafe', businessName: 'Café Test', userId: OWNER, status: 'live', sections: JSON.stringify({ language: 'de' }), websiteUrl: 'https://example.com' },
    plain: { id: 'lp2', slug: 'plain', businessName: 'No Deals', userId: OTHER, status: 'live', sections: '{}', websiteUrl: 'https://example.com' },
    ownerless: { id: 'lp3', slug: 'ownerless', businessName: 'Ownerless', userId: null, status: 'live', sections: '{}', websiteUrl: 'https://example.com' },
  };
  pageCache.delByPrefix('deals:'); pageCache.delByPrefix('lp:'); pageCache.delByPrefix('stamp:'); pageCache.delByPrefix('sp:');
  setEnv(env);
}
let seq = 0;
function addDeal(fields = {}, slug = 'cafe') {
  seq += 1;
  const d = { id: 'deal_' + seq, ownerUserId: OWNER, createdBy: OWNER, businessId: null, status: 'published', title: 'Kaffee-Deal ' + seq, offerText: '2 for 1',
    description: null, offerType: null, offerDetails: null, image: null, startsAt: null, endsAt: null, publishedAt: new Date(), draftData: null, ...fields };
  deals.push(d);
  placements.push({ id: 'pl_' + seq, dealId: d.id, channel: 'landing_page', targetRef: slug, status: 'published', publishedAt: new Date(Date.now() + seq) });
  return d;
}
async function serve(slug = 'cafe', query = {}) {
  const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; } };
  await handleServeLP({ params: { slug }, query, headers: {} }, res);
  return res;
}
const hasCards = (res) => res.body.includes('<section class="qd-deals"');
const stored = () => JSON.stringify({ deals, placements });
const NO_STORE = 'private, no-store';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── C. The warm card cache is never authorization ───────────────
test('C. cards cached while the owner had access are NOT shown on the next request after access ends', async () => {
  reset();
  addDeal({ title: 'Cached Kaffee' });
  const first = await serve();
  assert.ok(hasCards(first), 'shown while a pilot');
  assert.ok(pageCache.get('deals:cafe') && pageCache.get('deals:cafe').length === 1, 'card list is now in the 30 s cache');
  setEnv({ rollout: {} });                       // access ends (rollout removed)
  const second = await serve();
  assert.equal(hasCards(second), false, 'next request: no cards');
  assert.ok(pageCache.get('deals:cafe') && pageCache.get('deals:cafe').length === 1, 'the cache is still warm -- it simply was not used');
  assert.equal(second.headers['cache-control'], NO_STORE);
});

test('C. the same with a subscription that is cancelled between two requests', async () => {
  reset({ rollout: { DEALS_ENABLED: 'true' } });
  users[OWNER] = { plan: 'pro', subscriptionStatus: 'active' };
  addDeal({ title: 'Pro deal' });
  assert.ok(hasCards(await serve()));
  users[OWNER].subscriptionStatus = 'canceled';
  assert.equal(hasCards(await serve()), false);
});

test('C. renewal: the very next request shows the same card again, nothing stored changed', async () => {
  reset({ rollout: { DEALS_ENABLED: 'true' } });
  users[OWNER] = { plan: 'starter', subscriptionStatus: 'canceled' };
  const d = addDeal({ title: 'Back again' });
  const before = stored();
  assert.equal(hasCards(await serve()), false);
  users[OWNER].subscriptionStatus = 'active';
  const res = await serve();
  assert.ok(hasCards(res)); assert.ok(res.body.includes('Back again'));
  assert.equal(stored(), before); assert.equal(deals[0].id, d.id); assert.equal(deals[0].status, 'published');
});

test('C. the access check runs on every request: one User lookup per request, also on cache hits', async () => {
  reset();
  addDeal();
  for (let i = 0; i < 3; i++) await serve();
  // 3 = one per request (outside the cache) + 1 inside activeDealsForPage on the single cache miss (defence in depth)
  assert.equal(counts.userLookups, 3 + 1);
  assert.equal(counts.placementQueries, 1, 'the card list itself still comes from its cache');
});

// ── H. Cache-Control ────────────────────────────────────────────
test('H. a page that can show deals is private, no-store -- with cards, without access, and with placements but no displayable card', async () => {
  reset();
  addDeal();
  assert.equal((await serve()).headers['cache-control'], NO_STORE, 'cards shown');
  setEnv({ rollout: {} });
  assert.equal((await serve()).headers['cache-control'], NO_STORE, 'access lost');
  reset();
  addDeal({ startsAt: new Date(Date.now() + 24 * HOUR) });            // placement published, deal not started yet
  const r = await serve();
  assert.equal(hasCards(r), false); assert.equal(r.headers['cache-control'], NO_STORE, 'placement but no card');
  reset();
  assert.equal((await serve('plain')).headers['cache-control'], NO_STORE, 'owned page without placements: still eligible');
});

test('H. normal visits (not preview) get private, no-store too; preview and ?t= stay uncacheable', async () => {
  reset();
  addDeal();
  assert.equal((await serve('cafe', {})).headers['cache-control'], NO_STORE);
  assert.equal((await serve('cafe', { preview: '1' })).headers['cache-control'], NO_STORE);
  assert.equal((await serve('cafe', { t: '123' })).headers['cache-control'], NO_STORE);
});

test('H. pages that cannot show deals keep their caching: cards switched off, or a page without an owner', async () => {
  reset({ flag: false });
  addDeal();
  const off = await serve();
  assert.equal(off.headers['cache-control'], 'public, max-age=60'); assert.equal(hasCards(off), false);
  assert.equal(counts.userLookups, 0, 'no lookup when the cards are off'); assert.equal(counts.placementQueries, 0);
  assert.equal((await serve('cafe', { preview: '1' })).headers['cache-control'], 'no-store, no-cache, must-revalidate', 'preview unchanged');
  reset();
  const ownerless = await serve('ownerless');
  assert.equal(ownerless.headers['cache-control'], 'public, max-age=60'); assert.equal(counts.userLookups, 0);
});

test('H. with the cards switched off the page is byte-identical to the page with cards on but no access', async () => {
  reset({ flag: false });
  addDeal();
  const off = (await serve('cafe', { preview: '1' })).body;
  setEnv({ rollout: {} });
  const noAccess = (await serve('cafe', { preview: '1' })).body;
  assert.equal(noAccess, off);
});

// ── A. Access matrix through the real page ──────────────────────
test('A. general rollout: Free / no row / expired trial / cancelled show nothing; trial, Starter, Pro, Business, annual, past_due show the card', async () => {
  const cases = [[undefined, false], [{ plan: 'free' }, false], [{ plan: 'trial', trialExpiresAt: new Date(Date.now() - HOUR) }, false],
    [{ plan: 'pro', subscriptionStatus: 'unpaid' }, false], [{ plan: 'business', subscriptionStatus: 'incomplete_expired' }, false],
    [{ plan: 'trial', trialExpiresAt: new Date(Date.now() + 24 * HOUR) }, true], [{ plan: 'starter' }, true], [{ plan: 'pro' }, true],
    [{ plan: 'business' }, true], [{ plan: 'pro_annual' }, true], [{ plan: 'starter', subscriptionStatus: 'past_due' }, true], [{ plan: 'enterprise' }, true]];
  for (const [row, visible] of cases) {
    reset({ rollout: { DEALS_ENABLED: 'true' } });
    if (row) users[OWNER] = row;
    addDeal();
    const res = await serve();
    assert.equal(hasCards(res), visible, JSON.stringify(row));
    assert.equal(res.headers['cache-control'], NO_STORE, JSON.stringify(row));
  }
});

test('A. pilots: a listed pilot on Free shows the card; an unlisted Pro owner without general rollout does not', async () => {
  reset({ rollout: { DEALS_PILOT_USER_IDS: OWNER } });
  users[OWNER] = { plan: 'free' };
  addDeal();
  assert.ok(hasCards(await serve()));
  setEnv({ rollout: { DEALS_PILOT_USER_IDS: OTHER } });
  users[OWNER] = { plan: 'pro' };
  assert.equal(hasCards(await serve()), false);
});

test('A. stored deals and placements never change because of access', async () => {
  reset({ rollout: { DEALS_ENABLED: 'true' } });
  users[OWNER] = { plan: 'trial', trialExpiresAt: new Date(Date.now() - HOUR) };
  addDeal(); addDeal();
  const before = stored();
  await serve(); await serve('cafe', {});
  assert.equal(stored(), before);
});

// ── F. Lookup failure ───────────────────────────────────────────
test('F. access lookup fails: no cards, page still served (200) with its content, private no-store, scan still counted, error logged', async () => {
  reset();
  addDeal({ title: 'Must not leak' });
  await serve();                                  // warm the card cache while access is fine
  await new Promise((r) => setImmediate(r)); counts.scans = 0;   // scan writes queued by earlier requests
  userLookupFails = true;
  const res = await serve('cafe', {});            // a normal visit
  assert.equal(res.statusCode, 200);
  assert.equal(hasCards(res), false); assert.ok(!res.body.includes('Must not leak'));
  assert.ok(res.body.includes('Café Test'), 'the page itself is served');
  assert.equal(res.headers['cache-control'], NO_STORE);
  await new Promise((r) => setImmediate(r));
  assert.equal(counts.scans, 1, 'the visit is still counted');
  assert.ok(errors.some((e) => e.startsWith('[deals] access check failed')));
});

// ── P. Existing published-deal and landing-page-link behaviour ──
test('P. with access the card section looks as before (marker, section, and the Deals anchor when present)', async () => {
  reset();
  addDeal({ title: 'Anchor test' });
  const res = await serve();
  assert.ok(res.body.includes('<!-- QRAIVY Deals -->\n<section class="qd-deals"'));
  assert.ok(res.body.indexOf('qd-deals') < res.body.indexOf('<footer'), 'before the footer');
  if (cards.DEALS_ANCHOR) assert.ok(res.body.includes(`id="${cards.DEALS_ANCHOR}"`), 'landing-page link anchor kept');
});

test('P. archiving a deal or its placement still removes the card at once; the page stays private, no-store', async () => {
  reset();
  const d = addDeal({ title: 'Will be archived' });
  assert.ok(hasCards(await serve()));
  await service.archiveDeal(OWNER, d.id);
  const res = await serve();
  assert.equal(hasCards(res), false); assert.equal(res.headers['cache-control'], NO_STORE);
});

test('P. the first-visit welcome redirect still works on a page with deals, with the same no-store header', async () => {
  reset();
  stamp = { slug: 'cafe', enabled: true };
  addDeal();
  const res = await serve('cafe', {});
  assert.ok(res.body.includes('/lp/welcome/'), 'welcome script injected');
  assert.ok(hasCards(res));
  assert.equal(res.headers['cache-control'], NO_STORE);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
