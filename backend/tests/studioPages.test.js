// ============================================================
// studioPages.test.js — Landing Page Studio V3: the owner's own pages for
// the Studio (Phase A: GET /studio/pages, GET /studio/pages/:slug/design;
// Phase B: PUT /studio/pages/:slug/design, Save Draft).
//
// The real routes and requireAuth on a read-only in-memory database
// (helpers/studioPagesServer.js). Checked: sign-in required; only the
// signed-in owner's pages (LandingPage.userId); ownerless pages never listed
// and 404; another owner's page 403; a legacy page is converted in memory and
// the LandingPage row is not changed; a saved draft is returned as it is;
// zero writes of any kind; private, no-store answers.
// Save Draft: owner only; the whole design validated on the server (size
// limit too); the revision is a compare-and-swap (stale or simultaneous
// saves get 409, nothing is overwritten); only the PageDesign row is
// written: the LandingPage (live page) is unchanged, no PageDesignVersion,
// no User, plan, trial or billing write.
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
const { requireVerifiedEmail } = require('../src/lpV3/draftPolicy');
const { createStudioDraft } = require('../src/lpV3/studioDraftsController');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let srv;
async function get(p, token, init) {
  const headers = Object.assign(token ? { Authorization: 'Bearer ' + token } : {}, init && init.body ? { 'Content-Type': 'application/json' } : {});
  const r = await fetch(srv.origin + p, Object.assign({}, init, { headers }));
  let body = null;
  try { body = await r.json(); } catch (e) { body = null; }
  return { status: r.status, body, cache: r.headers.get('cache-control') };
}
const pagesBefore = S.copy(S.db.pages);
const designsBefore = S.copy(S.db.pageDesigns);

test('every route runs requireAuth first, then the controller (writes: the verified-email check in between); mounted at /studio in the server entry point', () => {
  const routes = studioRoutes.stack.filter((l) => l.route).map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods), handlers: l.route.stack.map((s) => s.handle) }));
  assert.deepEqual(routes.map((r) => r.path + ' ' + r.methods.join(',')), ['/pages get', '/pages/:slug/design get', '/pages/:slug/design put', '/drafts post'], 'two GETs, the PUT (Save Draft) and the POST (create a draft, Phase D1)');
  assert.deepEqual(routes[0].handlers, [requireAuth, C.listStudioPages]);
  assert.deepEqual(routes[1].handlers, [requireAuth, C.getStudioPageDesign]);
  // Phase D1: creating and changing a draft need a verified email address
  assert.deepEqual(routes[2].handlers, [requireAuth, requireVerifiedEmail, C.saveStudioPageDesign]);
  assert.deepEqual(routes[3].handlers, [requireAuth, requireVerifiedEmail, createStudioDraft]);
  // nothing else in between (no plan or trial check)
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

test('GETs: zero writes, no create, update, upsert or delete on any table across every request above; rows unchanged', async () => {
  for (let i = 0; i < 5; i++) { await get('/studio/pages', 'tok_anna'); await get('/studio/pages/anna-cafe/design', 'tok_anna'); await get('/studio/pages/anna-shop/design', 'tok_anna'); }
  assert.deepEqual(S.writes, []);
  assert.equal(JSON.stringify(S.db.pages), JSON.stringify(pagesBefore));
  assert.equal(JSON.stringify(S.db.pageDesigns), JSON.stringify(designsBefore));
  assert.ok(S.reads.every((r) => /\.(findUnique|findMany|findFirst|count)$/.test(r)), 'reads only');
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'lpV3', 'studioPagesController.js'), 'utf8');
  // the only write calls: Save Draft's two, both on prisma.pageDesign
  const calls = src.match(/[\w.$]+\.(create|createMany|update|updateMany|upsert|delete|deleteMany|\$executeRaw\w*|\$queryRaw\w*|\$transaction)\s*\(/g) || [];
  assert.deepEqual(calls.map((c) => c.replace(/\s*\($/, '')), ['prisma.pageDesign.create', 'prisma.pageDesign.updateMany']);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').toLowerCase();
  for (const word of ['landingPage.update', 'pageDesignVersion', 'publishedVersionId', 'stripe', 'trial', 'tiersystem', 'plans', 'subscription', 'dealaccess']) assert.ok(!code.includes(word.toLowerCase()), 'the controller code never names ' + word);
});

// ── Phase B: Save Draft ──
const put = (slug, token, body, raw) => get('/studio/pages/' + slug + '/design', token, { method: 'PUT', body: raw !== undefined ? raw : JSON.stringify(body) });
const designOf = (headline) => ({ schemaVersion: 1, settings: { language: 'de' }, pages: [{ id: 'start', title: 'Start', sections: [{ id: 's_hero01', type: 'hero', variant: 'simple', data: { headline } }] }] });
const cafe = () => S.db.pageDesigns.find((d) => d.landingPageId === 'lp_anna_cafe');
const shop = () => S.db.pageDesigns.find((d) => d.landingPageId === 'lp_anna_shop');

test('save: signed out or forged token 401 before anything is read; another owner 403; ownerless / unknown 404; malformed 400; nothing written', async () => {
  S.resetDesigns();
  const before = S.reads.length;
  assert.equal((await put('anna-cafe', null, { design: designOf('x'), baseRevision: null })).status, 401);
  assert.equal((await put('anna-cafe', 'tok_forged', { design: designOf('x'), baseRevision: null })).status, 401);
  assert.equal(S.reads.length, before, 'no database read before the sign-in is verified');
  const cases = [['ben-bikes', 'tok_anna', 403], ['anna-cafe', 'tok_ben', 403], ['anna-shop', 'tok_carl', 403], ['ulm-city', 'tok_anna', 404], ['no-such-page', 'tok_anna', 404], [encodeURIComponent('bad slug!'), 'tok_anna', 400], ['-x', 'tok_anna', 400]];
  for (const [slug, tok, status] of cases) {
    const r = await put(slug, tok, { design: designOf('HIJACK'), baseRevision: null });
    assert.equal(r.status, status, slug + ' as ' + tok);
    assert.equal(r.cache, 'private, no-store');
    for (const leak of ['BEN BIKES SECRET', 'OWNERLESS CITY', 'design', 'revision']) assert.ok(!JSON.stringify(r.body).includes(leak), slug + ' leaks ' + leak);
  }
  for (const [body, raw] of [[null, 'not json'], [null, '[]'], [{ baseRevision: null }], [{ design: designOf('x') }], [{ design: designOf('x'), baseRevision: 0 }], [{ design: designOf('x'), baseRevision: '4' }], [{ design: designOf('x'), baseRevision: 1.5 }], [{ design: designOf('x'), baseRevision: -1 }]]) {
    const r = await put('anna-cafe', 'tok_anna', body, raw);
    assert.equal(r.status, 400, JSON.stringify(body) + ' ' + raw);
  }
  assert.deepEqual(S.designWrites, [], 'nothing written');
  assert.deepEqual(S.writes, []);
});

test('save: invalid, hostile and oversized designs are refused (422) and nothing is written', async () => {
  S.resetDesigns();
  const big = designOf('x'); big.pages[0].sections[0].data.subheadline = 'y'.repeat(V3.LIMITS.designChars);
  const many = designOf('x'); many.pages[0].sections = Array.from({ length: V3.LIMITS.sections + 1 }, (_, i) => ({ id: 's_h' + String(i).padStart(4, '0'), type: 'hero', variant: 'simple', data: { headline: 'h' } }));
  const bad = [
    [{ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_x0001', type: 'hero', data: { headline: 'x', evil: '<script>alert(1)</script>' } }] }] }, null],
    [{ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_x0001', type: 'hero', data: { headline: 'x', primary: { text: 'Go', target: 'javascript:alert(1)' } } }] }] }, null],
    [{ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_d0001', type: 'dealsOffers', data: { title: 'A', offerText: '-10%', dealId: 'd_ben' } }] }] }, null],
    [{ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_x0001', type: 'unknownType', data: {} }] }] }, null],
    ['a string', null], [[], null], [big, 'too_large'], [many, 'too_many'],
    // Phase C: one Hero, one Deals / Offers, one Loyalty per page, enforced by the server too
    ...['hero', 'dealsOffers', 'loyalty'].map((type) => [{ schemaVersion: 1, pages: [{ id: 'start', sections: [Object.assign({ id: 's_one00001' }, V3.starter(type, 'de')), Object.assign({ id: 's_two00002' }, V3.starter(type, 'de'))] }] }, 'too_many_of_type']),
  ];
  for (const [design, code] of bad) {
    const r = await put('anna-cafe', 'tok_anna', { design, baseRevision: null });
    assert.equal(r.status, 422, JSON.stringify(design).slice(0, 80));
    assert.equal(r.body.error, 'design_invalid');
    assert.ok(Array.isArray(r.body.errors) && r.body.errors.length > 0 && r.body.errors.length <= V3.LIMITS.errors);
    if (code) assert.ok(r.body.errors.some((e) => e.code === code), code + ': ' + JSON.stringify(r.body.errors).slice(0, 200));
    assert.ok(!JSON.stringify(r.body).includes('<script>'));
  }
  assert.deepEqual(S.designWrites, []);
  assert.equal(cafe(), undefined);
});

test('save: the owner saves a legacy page for the first time (revision 1), reopens it as the draft; the live page row is unchanged', async () => {
  S.resetDesigns();
  const pagesNow = JSON.stringify(S.db.pages);
  const first = await get('/studio/pages/anna-cafe/design', 'tok_anna');
  const d = first.body.design;
  d.pages[0].sections[0].data.headline = 'Neu im Studio gespeichert';
  const r = await put('anna-cafe', 'tok_anna', { design: d, baseRevision: first.body.revision });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.cache, 'private, no-store');
  assert.equal(r.body.revision, 1);
  assert.ok(!isNaN(Date.parse(r.body.savedAt)));
  assert.ok(V3.validateDesign(r.body.design, { cloudName: 'test-cloud' }).ok);
  assert.equal(cafe().draftRevision, 1);
  assert.equal(cafe().updatedByUserId, S.ANNA);
  assert.equal(cafe().publishedVersionId, null);
  const again = await get('/studio/pages/anna-cafe/design', 'tok_anna');
  assert.equal(again.body.source, 'draft');
  assert.equal(again.body.revision, 1);
  assert.equal(again.body.savedAt, r.body.savedAt);
  assert.equal(again.body.design.pages[0].sections[0].data.headline, 'Neu im Studio gespeichert');
  assert.equal(JSON.stringify(S.db.pages), pagesNow, 'LandingPage rows (sections, renderer, status, updatedAt) unchanged');
  assert.equal(S.db.pages.find((p) => p.slug === 'anna-cafe').renderer, 'legacy');
  const list = await get('/studio/pages', 'tok_anna');
  assert.equal(list.body.pages.find((p) => p.slug === 'anna-cafe').hasDraft, true);
  assert.deepEqual(S.designWrites, [{ op: 'create', landingPageId: 'lp_anna_cafe' }]);
  assert.deepEqual(S.writes, [], 'no other write: no LandingPage, PageDesignVersion, User, plan, trial or billing table');
});

test('save: later saves move the revision on one at a time; a stale revision gets 409 with the current revision, never the content; nothing overwritten', async () => {
  S.resetDesigns();
  const r5 = await put('anna-shop', 'tok_anna', { design: designOf('Fassung 5'), baseRevision: 4 });
  assert.equal(r5.status, 200);
  assert.equal(r5.body.revision, 5);
  const r6 = await put('anna-shop', 'tok_anna', { design: designOf('Fassung 6'), baseRevision: 5 });
  assert.equal(r6.body.revision, 6);
  // the other tab still on revision 4 / 5
  for (const base of [4, 5, 99]) {
    const stale = await put('anna-shop', 'tok_anna', { design: designOf('ALTER TAB ' + base), baseRevision: base });
    assert.equal(stale.status, 409, 'base ' + base);
    assert.equal(stale.body.error, 'revision_conflict');
    assert.equal(stale.body.currentRevision, 6);
    assert.ok(!JSON.stringify(stale.body).includes('Fassung'), 'the stored content is not sent');
  }
  // a tab that opened the page before any draft existed
  const fresh = await put('anna-shop', 'tok_anna', { design: designOf('ALTER TAB null'), baseRevision: null });
  assert.equal(fresh.status, 409);
  assert.equal(fresh.body.currentRevision, 6);
  assert.equal(shop().draftRevision, 6);
  assert.equal(shop().draft.pages[0].sections[0].data.headline, 'Fassung 6');
  assert.deepEqual(S.writes, []);
});

test('save: simultaneous saves on the same revision — exactly one wins, the others get 409 (first save and later saves)', async () => {
  S.resetDesigns();
  S.opts.saveDelayMs = 30;
  try {
    const firsts = await Promise.all(['A', 'B', 'C'].map((x) => put('anna-cafe', 'tok_anna', { design: designOf('Tab ' + x), baseRevision: null })));
    assert.deepEqual(firsts.map((r) => r.status).sort(), [200, 409, 409]);
    const winner = firsts.find((r) => r.status === 200);
    assert.equal(winner.body.revision, 1);
    assert.equal(cafe().draftRevision, 1);
    assert.equal(cafe().draft.pages[0].sections[0].data.headline, winner.body.design.pages[0].sections[0].data.headline);
    const laters = await Promise.all(['D', 'E'].map((x) => put('anna-cafe', 'tok_anna', { design: designOf('Tab ' + x), baseRevision: 1 })));
    assert.deepEqual(laters.map((r) => r.status).sort(), [200, 409]);
    const w2 = laters.find((r) => r.status === 200);
    assert.equal(cafe().draftRevision, 2);
    assert.equal(cafe().draft.pages[0].sections[0].data.headline, w2.body.design.pages[0].sections[0].data.headline);
    assert.equal(laters.find((r) => r.status === 409).body.currentRevision, 2);
  } finally { S.opts.saveDelayMs = 0; }
});

test('save: a database failure answers 500 and changes nothing; before the Studio migration 503 drafts_unavailable', async () => {
  S.resetDesigns();
  S.opts.failSave = true;
  try {
    const r = await put('anna-shop', 'tok_anna', { design: designOf('x'), baseRevision: 4 });
    assert.equal(r.status, 500);
    assert.equal(shop().draftRevision, 4);
  } finally { S.opts.failSave = false; }
  S.opts.designTableMissing = true;
  try {
    const r = await put('anna-cafe', 'tok_anna', { design: designOf('x'), baseRevision: null });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'drafts_unavailable');
  } finally { S.opts.designTableMissing = false; }
});

test('save: the stored draft is the server-validated design, so it always reopens; deal content can never be stored', async () => {
  S.resetDesigns();
  const d = designOf('Mit Angeboten');
  d.pages[0].sections.push({ id: 's_deals01', type: 'dealsOffers', variant: 'cards', data: { title: 'Angebote', maxItems: 3 } });
  const r = await put('anna-cafe', 'tok_anna', { design: d, baseRevision: null });
  assert.equal(r.status, 200);
  assert.deepEqual(cafe().draft, r.body.design);
  const stored = cafe().draft.pages[0].sections[1].data;
  assert.equal(stored.title, 'Angebote');
  for (const k of ['offerText', 'dealId', 'items', 'endsAt']) assert.ok(!(k in stored), 'display settings only: ' + k);
  const back = await get('/studio/pages/anna-cafe/design', 'tok_anna');
  assert.equal(back.status, 200);
  assert.equal(back.body.design.pages[0].sections[1].type, 'dealsOffers');
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
