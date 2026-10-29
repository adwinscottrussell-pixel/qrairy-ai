// ============================================================
// studioPages.test.js — Landing Page Studio V3, Phase A: the owner's own
// pages for the Studio (GET /studio/pages, GET /studio/pages/:slug/design).
//
// The real routes and requireAuth on a read-only in-memory database
// (helpers/studioPagesServer.js). Checked: sign-in required; only the
// signed-in owner's pages (LandingPage.userId); ownerless pages never listed
// and 404; another owner's page 403; a legacy page is converted in memory and
// the LandingPage row is not changed; a saved draft is returned as it is;
// zero writes of any kind; private, no-store answers.
//
// Run: node tests/studioPages.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const path = require('path');
const V3 = require('../src/lpV3/core');
const { requireAuth } = require('../src/middleware/auth');
const studioRoutes = require('../src/lpV3/studioPagesRoutes');
const C = require('../src/lpV3/studioPagesController');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let srv;
async function get(p, token) {
  const r = await fetch(srv.origin + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  let body = null;
  try { body = await r.json(); } catch (e) { body = null; }
  return { status: r.status, body, cache: r.headers.get('cache-control') };
}
const pagesBefore = S.copy(S.db.pages);
const designsBefore = S.copy(S.db.pageDesigns);

test('both routes run requireAuth first, then the controller; mounted at /studio in the server entry point', () => {
  const routes = studioRoutes.stack.filter((l) => l.route).map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods), handlers: l.route.stack.map((s) => s.handle) }));
  assert.deepEqual(routes.map((r) => r.path + ' ' + r.methods.join(',')), ['/pages get', '/pages/:slug/design get'], 'GET only, two routes');
  assert.equal(routes[0].handlers[0], requireAuth);
  assert.equal(routes[0].handlers[1], C.listStudioPages);
  assert.equal(routes[1].handlers[0], requireAuth);
  assert.equal(routes[1].handlers[1], C.getStudioPageDesign);
  const index = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.ok(index.includes("app.use('/studio', require('./lpV3/studioPagesRoutes'));"));
});

test('signed out or with a forged token: 401 from requireAuth, nothing read', async () => {
  const before = S.reads.length;
  for (const p of ['/studio/pages', '/studio/pages/anna-cafe/design']) {
    assert.equal((await get(p)).status, 401, p);
    assert.equal((await get(p, 'tok_forged')).status, 401, p + ' forged');
  }
  assert.equal(S.reads.length, before, 'no database read before the sign-in is verified');
});

test('the owner lists exactly their own pages (newest first), with display fields only; no ownerless or other page', async () => {
  const r = await get('/studio/pages', 'tok_anna');
  assert.equal(r.status, 200);
  assert.equal(r.cache, 'private, no-store');
  assert.deepEqual(r.body.account, { known: true });
  assert.deepEqual(r.body.pages.map((p) => p.slug), ['anna-cafe', 'anna-shop', 'anna-draft']);
  assert.deepEqual(Object.keys(r.body.pages[0]).sort(), ['hasDraft', 'kind', 'live', 'name', 'renderer', 'slug', 'status', 'updatedAt', 'useCase']);
  assert.deepEqual(r.body.pages.map((p) => [p.name, p.live, p.kind, p.hasDraft]), [['Anna Café', true, 'business', false], ['Anna Shop', true, 'creator', true], ['Anna Entwurf', false, 'business', false]]);
  const all = JSON.stringify(r.body);
  for (const s of ['ben-bikes', 'ulm-city', 'BEN', 'OWNERLESS', 'sections', 'userId', 'lp_anna']) assert.ok(!all.includes(s), 'not in the answer: ' + s);
});

test('another owner sees only theirs; an account without pages gets an empty list (nothing is created)', async () => {
  const ben = await get('/studio/pages', 'tok_ben');
  assert.deepEqual(ben.body.pages.map((p) => p.slug), ['ben-bikes']);
  assert.deepEqual(ben.body.account, { known: false }, 'no User row: still only LandingPage.userId decides');
  const carl = await get('/studio/pages', 'tok_carl');
  assert.equal(carl.status, 200);
  assert.deepEqual(carl.body.pages, []);
});

test('a legacy page opens as a design converted in memory: valid, the page’s own texts, warnings; the row is unchanged', async () => {
  const r = await get('/studio/pages/anna-cafe/design', 'tok_anna');
  assert.equal(r.status, 200);
  assert.equal(r.cache, 'private, no-store');
  assert.equal(r.body.source, 'legacy_import');
  assert.equal(r.body.revision, null);
  assert.deepEqual(r.body.page, { slug: 'anna-cafe', name: 'Anna Café', status: 'live', live: true, useCase: 'restaurant', kind: 'business', renderer: 'legacy' });
  const v = V3.validateDesign(r.body.design, { cloudName: 'test-cloud' });
  assert.ok(v.ok, JSON.stringify(v.errors));
  const hero = r.body.design.pages[0].sections.find((s) => s.type === 'hero');
  assert.equal(hero.data.headline, 'Willkommen im Anna Café');
  assert.equal(hero.data.subheadline, 'Frühstück & Kuchen');
  assert.deepEqual([hero.data.primary.text, hero.data.primary.target], ['Tisch reservieren', 'https://anna-cafe.example/reservieren']);
  assert.equal(r.body.design.theme.palette.brand, '#aa3311');
  assert.ok(Array.isArray(r.body.warnings));
  assert.equal(JSON.stringify(S.db.pages), JSON.stringify(pagesBefore), 'LandingPage rows (sections, renderer, status) unchanged');
});

test('a page with a saved Studio draft opens that draft (with its revision), not the legacy content', async () => {
  const r = await get('/studio/pages/anna-shop/design', 'tok_anna');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'draft');
  assert.equal(r.body.revision, 4);
  assert.equal(r.body.design.pages[0].sections[0].data.headline, 'Anna Shop Entwurf');
  assert.equal(r.body.design.pages[0].sections[1].type, 'dealsOffers');
  assert.ok(!JSON.stringify(r.body).includes('LEGACY SHOP TITLE'));
});

test('refused: another owner’s page 403; ownerless and unknown pages 404; a malformed address 400 — never any page content', async () => {
  const cases = [['/studio/pages/ben-bikes/design', 'tok_anna', 403], ['/studio/pages/anna-cafe/design', 'tok_ben', 403], ['/studio/pages/ulm-city/design', 'tok_anna', 404],
    ['/studio/pages/no-such-page/design', 'tok_anna', 404], ['/studio/pages/' + encodeURIComponent('bad slug!') + '/design', 'tok_anna', 400], ['/studio/pages/-x/design', 'tok_anna', 400]];
  for (const [p, tok, status] of cases) {
    const r = await get(p, tok);
    assert.equal(r.status, status, p + ' as ' + tok);
    const s = JSON.stringify(r.body);
    for (const leak of ['BEN BIKES SECRET', 'OWNERLESS CITY', 'Willkommen im Anna', 'design', 'sections']) assert.ok(!s.includes(leak), p + ' leaks ' + leak);
  }
});

test('before the Studio migration (no PageDesign table): the list still works (no drafts) and pages open from the legacy content', async () => {
  S.opts.designTableMissing = true;
  try {
    const list = await get('/studio/pages', 'tok_anna');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.pages.map((p) => p.hasDraft), [false, false, false]);
    const shop = await get('/studio/pages/anna-shop/design', 'tok_anna');
    assert.equal(shop.status, 200);
    assert.equal(shop.body.source, 'legacy_import');
    assert.equal(shop.body.design.pages[0].sections[0].data.headline, 'LEGACY SHOP TITLE');
  } finally { S.opts.designTableMissing = false; }
});

test('a stored draft that no longer validates is refused (422), never sent to the editor', async () => {
  const saved = S.db.pageDesigns[0].draft;
  S.db.pageDesigns[0].draft = { schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_x', type: 'hero', data: { headline: 'x', evil: '<script>' } }] }] };
  try {
    const r = await get('/studio/pages/anna-shop/design', 'tok_anna');
    assert.equal(r.status, 422);
    assert.equal(r.body.error, 'stored_draft_invalid');
    assert.ok(!JSON.stringify(r.body).includes('<script>'));
  } finally { S.db.pageDesigns[0].draft = saved; }
});

test('zero writes: no create, update, upsert or delete on any table across every request above; rows unchanged', async () => {
  for (let i = 0; i < 5; i++) { await get('/studio/pages', 'tok_anna'); await get('/studio/pages/anna-cafe/design', 'tok_anna'); await get('/studio/pages/anna-shop/design', 'tok_anna'); }
  assert.deepEqual(S.writes, []);
  assert.equal(JSON.stringify(S.db.pages), JSON.stringify(pagesBefore));
  assert.equal(JSON.stringify(S.db.pageDesigns), JSON.stringify(designsBefore));
  assert.ok(S.reads.every((r) => /\.(findUnique|findMany|findFirst|count)$/.test(r)), 'reads only');
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'lpV3', 'studioPagesController.js'), 'utf8');
  assert.ok(!/\.(create|createMany|update|updateMany|upsert|delete|deleteMany|\$executeRaw|\$transaction)\s*\(/.test(src), 'the controller has no write call');
});

test('the Deals routes are untouched and keep working next to the Studio routes', async () => {
  const r = await get('/deals/pages', 'tok_anna');
  assert.equal(r.status, 200);
  const shop = r.body.pages.find((p) => p.slug === 'anna-shop');
  assert.deepEqual(shop.shownDealIds, ['d_shop']);
  assert.equal((await get('/deals/pages')).status, 401);
});

(async () => {
  srv = await S.start();
  let passed = 0, failed = 0;
  console.log('studioPages');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
