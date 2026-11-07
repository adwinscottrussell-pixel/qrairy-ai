// ============================================================
// studioOriginRead.test.js — Landing Page Studio V3, D2.3b-1: the saved
// onboarding origin (PageDesign.origin) returned READ ONLY to the owner's
// Studio.
//
// With the REAL routes on the in-memory database (helpers/studioPagesServer.js):
// - GET /studio/pages/:slug/design returns the stored origin (checked again
//   with readOrigin's rules) next to the unchanged fields; null for a legacy
//   page, a draft without an origin and any malformed stored value (the page
//   still loads, 200);
// - another account (403), an unknown page (404) and no sign-in (401) get no
//   origin;
// - PUT cannot change the origin, also when the body carries one; the revision
//   and conflict behaviour stay as they are.
// Unit: storedOrigin (server) and studio-pages-data.js origin() / load().
//
// Run: node tests/studioOriginRead.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const V3 = require('../src/lpV3/core');
const { storedOrigin } = require('../src/lpV3/studioPagesController');
const P = require('../../frontend/public/js/studio/studio-pages-data.js');
const OB = require('../../frontend/public/js/studio/onboarding-shell.js');
const M = require('../../frontend/public/js/studio/onboarding-model.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');
const D = require('../../frontend/public/js/studio/onboarding-drafts.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const GOOD = { source: 'onboarding', template: 'bakery', palette: 'warm', language: 'de', exampleSectionIds: ['s_obbuttons1', 's_obcontact1'] };
const answers = (template, lang) => ({ template, palette: T.get(template).palettes[0].id, name: 'Café Sonne', description: 'Frisch.', links: [{ platform: 'instagram', url: 'instagram.com/cafesonne' }],
  social: 'auto', sections: ['hero', 'custom:aaaa1111', 'buttons', 'products', 'custom:bbbb2222', 'contact', 'socialMedia'] });
let srv;
const api = (p, { token = 'tok_carl', method = 'GET', body } = {}) => fetch(srv.origin + p, { method, headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
async function onboardingDraft(template = 'bakery', lang = 'de') {
  const r = OB.draftRequest(M, V3, T, answers(template, lang), lang);
  const made = await D.createDraftClient({ api: srv.origin, session: () => ({ getToken: async () => 'tok_carl' }), fetch }).create(Object.assign({ requestId: D.requestId() }, r));
  return { req: r, slug: made.slug, row: () => S.db.pageDesigns.find((d) => d.landingPageId === S.db.pages.find((p) => p.slug === made.slug).id) };
}

test('storedOrigin: the stored value checked with readOrigin\'s rules; anything else null (never throws)', () => {
  assert.deepEqual(storedOrigin(GOOD), GOOD);
  assert.deepEqual(storedOrigin({ source: 'onboarding' }), { source: 'onboarding' });
  assert.deepEqual(storedOrigin({ source: 'onboarding', template: null, language: null }), { source: 'onboarding' });
  const bad = [null, undefined, 'onboarding', 42, [], [GOOD], {}, { source: 'import' }, Object.assign({}, GOOD, { extra: 1 }), Object.assign({}, GOOD, { language: 'fr' }),
    Object.assign({}, GOOD, { language: 5 }), Object.assign({}, GOOD, { template: 'Bad Template' }), Object.assign({}, GOOD, { template: '<b>x</b>' }), Object.assign({}, GOOD, { palette: 7 }),
    Object.assign({}, GOOD, { exampleSectionIds: 's_obbuttons1' }), Object.assign({}, GOOD, { exampleSectionIds: ['<img src=x>'] }), Object.assign({}, GOOD, { exampleSectionIds: ['s_aaaa1', 's_aaaa1'] }),
    Object.assign({}, GOOD, { exampleSectionIds: Array.from({ length: 41 }, (x, i) => 's_x' + String(i).padStart(4, '0')) })];
  for (const v of bad) assert.equal(storedOrigin(v), null, JSON.stringify(v));
  // a getter that throws: still null
  assert.equal(storedOrigin(Object.defineProperty({ source: 'onboarding' }, 'template', { enumerable: true, get() { throw new Error('x'); } })), null);
});

test('GET: an onboarding draft returns its origin exactly as stored, next to the unchanged fields', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('bakery', 'de');
  const g = await api('/studio/pages/' + d.slug + '/design');
  assert.equal(g.status, 200);
  assert.deepEqual(Object.keys(g.body).sort(), ['design', 'origin', 'page', 'revision', 'savedAt', 'source', 'warnings']);
  assert.deepEqual(g.body.origin, d.req.origin, 'the stored origin');
  assert.deepEqual(g.body.origin, d.row().origin);
  assert.deepEqual([g.body.source, g.body.revision, g.body.warnings, g.body.page.slug, g.body.page.live], ['draft', 1, [], d.slug, false]);
  assert.deepEqual(g.body.design, V3.validateDesign(d.req.design, { cloudName: 'dwqc6n7rn' }).design);
});

test('GET: a legacy page and a draft without an origin return origin: null', async () => {
  const legacy = await api('/studio/pages/anna-cafe/design', { token: 'tok_anna' });
  assert.deepEqual([legacy.status, legacy.body.source, legacy.body.origin], [200, 'legacy_import', null]);
  const plain = await api('/studio/pages/anna-shop/design', { token: 'tok_anna' });
  assert.deepEqual([plain.status, plain.body.source, plain.body.revision, plain.body.origin], [200, 'draft', 4, null], 'a Studio draft saved before D2.1: no origin');
  // a draft created without an origin (POST /studio/drafts with a name only)
  const made = await api('/studio/drafts', { method: 'POST', body: { name: 'Ohne Herkunft' } });
  assert.equal(made.status, 201);
  const g = await api('/studio/pages/' + made.body.page.slug + '/design');
  assert.deepEqual([g.status, g.body.origin], [200, null]);
});

test('GET: a malformed stored origin is null; the page still loads (200, the same design and revision)', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('restaurant', 'en');
  const before = await api('/studio/pages/' + d.slug + '/design');
  for (const v of ['oops', 7, [], { source: 'other' }, Object.assign({}, d.req.origin, { injected: '<script>alert(1)</script>' }), Object.assign({}, d.req.origin, { template: '<img src=x onerror=alert(1)>' }), Object.assign({}, d.req.origin, { exampleSectionIds: [{}] })]) {
    d.row().origin = v;
    const g = await api('/studio/pages/' + d.slug + '/design');
    assert.equal(g.status, 200, JSON.stringify(v));
    assert.equal(g.body.origin, null, JSON.stringify(v));
    assert.deepEqual([g.body.design, g.body.revision, g.body.source], [before.body.design, before.body.revision, 'draft']);
    assert.ok(!JSON.stringify(g.body).includes('<script>') && !JSON.stringify(g.body).includes('onerror'), 'nothing of the bad value returned');
  }
});

test('GET: another account (403), an unknown page (404), no or a bad sign-in (401): no origin in the answer', async () => {
  S.resetDrafts();
  const d = await onboardingDraft();
  for (const [token, slug, status] of [['tok_ben', d.slug, 403], ['tok_carl', 'no-such-page-x1', 404], ['tok_nobody', d.slug, 401], ['', d.slug, 401]]) {
    const g = await api('/studio/pages/' + slug + '/design', { token });
    assert.equal(g.status, status, token + ' ' + slug);
    assert.ok(!g.body || !('origin' in g.body) && !JSON.stringify(g.body).includes('onboarding'), token + ': ' + JSON.stringify(g.body));
  }
});

test('PUT cannot change the origin (also when the body carries one); revisions and 409 conflicts unchanged', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('beauty', 'en');
  const original = S.copy(d.row().origin);
  const g = await api('/studio/pages/' + d.slug + '/design');
  const forged = { source: 'onboarding', template: 'creator', palette: 'x', language: 'en', exampleSectionIds: [] };
  const p1 = await api('/studio/pages/' + d.slug + '/design', { method: 'PUT', body: { design: g.body.design, baseRevision: 1, origin: forged } });
  assert.deepEqual([p1.status, p1.body.revision, 'origin' in p1.body], [200, 2, false]);
  assert.deepEqual(d.row().origin, original, 'stored origin unchanged');
  const p2 = await api('/studio/pages/' + d.slug + '/design', { method: 'PUT', body: { design: g.body.design, baseRevision: 2, origin: null } });
  assert.deepEqual([p2.status, p2.body.revision], [200, 3]);
  assert.deepEqual(d.row().origin, original, 'origin: null in the body does not clear it');
  // a stale revision: 409 as before, nothing changed
  const stale = await api('/studio/pages/' + d.slug + '/design', { method: 'PUT', body: { design: g.body.design, baseRevision: 1, origin: forged } });
  assert.deepEqual([stale.status, stale.body.error, stale.body.currentRevision, 'origin' in stale.body], [409, 'revision_conflict', 3, false]);
  assert.deepEqual([d.row().draftRevision, d.row().origin], [3, original]);
  // GET still returns the original origin, at revision 3
  const after = await api('/studio/pages/' + d.slug + '/design');
  assert.deepEqual([after.body.revision, after.body.origin], [3, original]);
  // another account cannot write either
  const ben = await api('/studio/pages/' + d.slug + '/design', { token: 'tok_ben', method: 'PUT', body: { design: g.body.design, baseRevision: 3, origin: forged } });
  assert.equal(ben.status, 403);
  assert.deepEqual(d.row().origin, original);
});

test('studio-pages-data.js: origin() keeps only the known fields in their known forms; load() returns it for a draft, null for a legacy import', async () => {
  assert.deepEqual(P.origin(GOOD), GOOD);
  assert.deepEqual(P.origin(Object.assign({}, GOOD, { extra: '<b>', template: '<img>', palette: 3, language: 'fr', exampleSectionIds: ['s_obbuttons1', 'x', 's_obbuttons1', 7] })), { source: 'onboarding', exampleSectionIds: ['s_obbuttons1'] });
  for (const v of [null, undefined, 'x', [], {}, { source: 'import' }]) assert.equal(P.origin(v), null, JSON.stringify(v));
  assert.equal(P.origin(Object.assign({}, GOOD, { exampleSectionIds: Array.from({ length: 41 }, () => 's_obbuttons1') })).exampleSectionIds, undefined, 'too many ids: none');
  const reply = (body) => async () => ({ status: 200, ok: true, json: async () => body });
  const page = { slug: 'cafe-sonne-abc123', name: 'Café Sonne', live: false, kind: 'business', hasDraft: true };
  const data = (body) => P.createPagesData({ api: 'https://studio-v3-api-production.up.railway.app', getToken: async () => 'tok', fetch: reply(body) });
  const d1 = await data({ page, source: 'draft', revision: 2, savedAt: '2026-11-07T10:00:00.000Z', design: { pages: [] }, warnings: [], origin: Object.assign({}, GOOD, { extra: 1 }) }).load('cafe-sonne-abc123');
  assert.deepEqual([d1.state, d1.revision, d1.origin], ['loaded', 2, GOOD]);
  const d2 = await data({ page, source: 'legacy_import', revision: null, savedAt: null, design: { pages: [] }, warnings: [], origin: GOOD }).load('cafe-sonne-abc123');
  assert.equal(d2.origin, null, 'a legacy import never has an origin');
  const d3 = await data({ page, source: 'draft', revision: 1, savedAt: null, design: { pages: [] }, warnings: [] }).load('cafe-sonne-abc123');
  assert.equal(d3.origin, null, 'an older server without the field: null');
});

test('the Studio keeps the origin as data only: never written into the page as HTML, never sent back', () => {
  const PUB = path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'studio');
  const shell = fs.readFileSync(path.join(PUB, 'studio-shell.js'), 'utf8');
  const uses = shell.split('\n').filter((l) => /\borigin\b/.test(l) && !/^\s*\/\//.test(l));
  assert.ok(uses.length >= 4 && uses.every((l) => !/innerHTML|insertAdjacentHTML|outerHTML|document\.write|srcdoc|save\(/.test(l)), uses.join('\n'));
  assert.ok(shell.includes('pageView.origin = r.origin || null;') && (shell.match(/pageView\.origin = null;/g) || []).length >= 3, 'kept on load; cleared when the page goes, on a new load, on sign-out / account change');
  const data = fs.readFileSync(path.join(PUB, 'studio-pages-data.js'), 'utf8');
  assert.ok(data.includes('{ design: design, baseRevision: base }'), 'PUT sends the design and revision only');
});

(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';   // the template photos' account; the helper sets test-cloud
  srv = await S.start();
  let passed = 0, failed = 0;
  console.log('studioOriginRead');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e && e.message).split('\n').slice(0, 12).join('\n       ')); }
  }
  S.resetDrafts();
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
