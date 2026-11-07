// ============================================================
// onboardingSaveDraft.test.js — Landing Page Studio V3 onboarding D2.2: Save Draft.
//
// onboarding-drafts.js (the onboarding's only request): exactly
// POST <api>/studio/drafts with the session token, never anything else; every
// server answer mapped (saved only on 201 / 200 with a well-formed answer);
// no token, no API address or a bad body: nothing sent. onboarding-shell.js's
// pure parts: draftRequest (the template page as a draft may hold it, no
// example-only data, Custom Sections with their ids, the origin), the content
// fingerprint and the kept Save Draft state (restoreDraft). End to end with the
// REAL D2.1 route (helpers/studioPagesServer.js): the onboarding's request
// creates the draft (201), a retry with the same requestId returns it (200),
// GET shows it unchanged; no User, plan or trial change; another account 403.
// Browser behaviour: studioOnboarding.browser.test.js (D2.2 tests).
//
// Run: node tests/onboardingSaveDraft.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const V3 = require('../src/lpV3/core');
const { countSmartPages } = require('../src/utils/tierSystem');
const D = require('../../frontend/public/js/studio/onboarding-drafts.js');
const OB = require('../../frontend/public/js/studio/onboarding-shell.js');
const M = require('../../frontend/public/js/studio/onboarding-model.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API = 'https://studio-v3-api-production.up.railway.app';
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const answers = (template, lang, extra) => Object.assign({ template, palette: T.get(template).palettes[1].id, name: lang === 'de' ? 'Café Sonne' : 'Cafe Sonne', description: 'Fresh.',
  links: [{ platform: 'instagram', url: 'instagram.com/cafesonne' }], social: 'auto', sections: ['hero', 'custom:aaaa1111', 'buttons', 'products', 'custom:bbbb2222', 'contact', 'socialMedia'] }, extra || {});
// a fake fetch: records the calls, answers with { status, body } or throws
function fakeFetch(answer) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const a = typeof answer === 'function' ? answer(calls.length) : answer;
    if (a instanceof Error) throw a;
    return { status: a.status, ok: a.status >= 200 && a.status < 300, json: async () => { if (a.raw) throw new Error('not json'); return a.body; } };
  };
  f.calls = calls;
  return f;
}
const session = (token = 'tok_x') => () => ({ getToken: async () => token });
const body = () => ({ name: 'Cafe Sonne', language: 'en', kind: 'business', requestId: D.requestId(), design: { schemaVersion: 1, pages: [] }, origin: { source: 'onboarding' } });

test('the client sends exactly one request: POST <api>/studio/drafts, JSON, the Bearer token, no cookies, no cache; the body as given', async () => {
  const f = fakeFetch({ status: 201, body: { created: true, page: { slug: 'cafe-sonne-abc123', name: 'Cafe Sonne' }, revision: 1 } });
  const c = D.createDraftClient({ api: API, session: session(), fetch: f });
  assert.equal(c.available(), true);
  const b = body();
  const r = await c.create(b);
  assert.deepEqual(r, { slug: 'cafe-sonne-abc123', name: 'Cafe Sonne', revision: 1, created: true });
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, API + '/studio/drafts');
  assert.deepEqual([init.method, init.headers.Authorization, init.headers['Content-Type'], init.credentials, init.cache, init.redirect], ['POST', 'Bearer tok_x', 'application/json', 'omit', 'no-store', 'error']);
  assert.deepEqual(f.calls[0].body, b);
  // a replay answer (200, created false) is a success too
  const f2 = fakeFetch({ status: 200, body: { created: false, page: { slug: 'cafe-sonne-abc123' }, revision: 2 } });
  assert.deepEqual(await D.createDraftClient({ api: API, session: session(), fetch: f2 }).create(body()), { slug: 'cafe-sonne-abc123', name: '', revision: 2, created: false });
});

test('every answer mapped; saved only on 201 / 200 with a slug and revision', async () => {
  const cases = [
    [{ status: 401, body: { error: 'Unauthorized.' } }, 'signin'],
    [{ status: 403, body: { error: 'email_unverified' } }, 'unverified'],
    [{ status: 403, body: { error: 'Not allowed.' } }, 'forbidden'],
    [{ status: 409, body: { error: 'draft_limit', limit: 3, active: 3 } }, 'limit', { limit: 3, active: 3 }],
    [{ status: 409, body: { error: 'request_id_conflict' } }, 'conflict'],
    [{ status: 409, body: { error: 'request_id_used' } }, 'conflict'],
    [{ status: 429, body: { error: 'draft_rate_limit', retryAfterSeconds: 120 } }, 'rate', { retryAfterSeconds: 120 }],
    [{ status: 400, body: { error: 'invalid_body', field: 'name' } }, 'invalid'],
    [{ status: 422, body: { error: 'design_invalid', errors: [] } }, 'invalid'],
    [{ status: 500, body: { error: 'x' } }, 'unavailable'],
    [{ status: 503, body: { error: 'drafts_unavailable' } }, 'unavailable'],
    [{ status: 201, body: { created: true, page: { slug: '../evil' }, revision: 1 } }, 'unavailable'],
    [{ status: 201, body: { created: true, page: { slug: 'ok-slug' }, revision: 0 } }, 'unavailable'],
    [{ status: 201, raw: true }, 'unavailable'],
    [{ status: 302, body: {} }, 'unavailable'],
    [new TypeError('Failed to fetch'), 'network'],
  ];
  for (const [answer, state, info] of cases) {
    const c = D.createDraftClient({ api: API, session: session(), fetch: fakeFetch(answer) });
    const e = await c.create(body()).then(() => null, (x) => x);
    assert.ok(e instanceof D.Failure, JSON.stringify(answer));
    assert.equal(e.state, state, JSON.stringify(answer));
    if (info) assert.deepEqual(e.info, info);
  }
});

test('nothing is sent without a token, without a valid API address, or with a body that is not a draft request', async () => {
  const f = fakeFetch({ status: 201, body: {} });
  for (const s of [() => null, () => ({}), session(''), session(null)]) {
    const e = await D.createDraftClient({ api: API, session: s, fetch: f }).create(body()).then(() => null, (x) => x);
    assert.equal(e.state, 'signin');
  }
  for (const api of ['', 'http://evil.example', 'https://api.example.com/path', 'javascript:alert(1)', null]) {
    const c = D.createDraftClient({ api, session: session(), fetch: f });
    assert.equal(c.available(), false, String(api));
    assert.equal((await c.create(body()).then(() => null, (x) => x)).state, 'unavailable');
  }
  const c = D.createDraftClient({ api: API, session: session(), fetch: f });
  for (const b of [null, [], Object.assign(body(), { requestId: 'abc' }), Object.assign(body(), { requestId: undefined }), Object.assign(body(), { design: null })]) {
    assert.equal((await c.create(b).then(() => null, (x) => x)).state, 'invalid');
  }
  assert.equal(f.calls.length, 0, 'never sent');
});

test('requestId: a version 4 UUID, from randomUUID or (without it) getRandomValues; different each time', () => {
  const a = D.requestId(), b = D.requestId();
  assert.match(a, UUID4); assert.notEqual(a, b);
  const fallback = D.requestId({ getRandomValues: (arr) => require('crypto').getRandomValues(arr) });
  assert.match(fallback, UUID4);
});

test('onboarding-drafts.js is the only file that sends: one fetch, the one path, POST only; no storage; the token never kept', () => {
  const src = fs.readFileSync(path.join(PUB, 'js/studio/onboarding-drafts.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.equal((code.match(/doFetch\(/g) || []).length, 1, 'one request call');
  assert.ok(code.includes("var PATH = '/studio/drafts';") && code.includes("method: 'POST'"));
  assert.ok(!/localStorage|sessionStorage|document\.cookie|indexedDB|setItem|XMLHttpRequest|sendBeacon|WebSocket|eval\(|innerHTML/.test(code));
  assert.ok(!/\/tier|\/trial|\/stripe|\/billing|\/publish|\/lp\b|PUT|DELETE/.test(code), 'no other endpoint or method');
  const shell = fs.readFileSync(path.join(PUB, 'js/studio/onboarding-shell.js'), 'utf8');
  assert.ok(!/\bfetch\b|getToken|XMLHttpRequest/.test(shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')), 'the shell sends nothing itself');
});

test('draftRequest: the template page as a draft may hold it (no example-only data), Custom Sections with their ids in order, the customer\'s name and link, the origin; null while the page is not complete', () => {
  for (const tpl of ['restaurant', 'bakery', 'beauty', 'retail', 'creator', 'services']) {
    for (const lang of ['en', 'de']) {
      const a = answers(tpl, lang);
      const r = OB.draftRequest(M, V3, T, a, lang);
      const tag = tpl + ' ' + lang;
      assert.ok(r, tag);
      assert.deepEqual(Object.keys(r).sort(), ['design', 'kind', 'language', 'name', 'origin']);
      assert.deepEqual([r.name, r.language, r.kind], [a.name, lang, tpl === 'creator' ? 'creator' : 'business'], tag);
      assert.deepEqual(r.design, M.pageFor(V3, T, a, lang).draft, tag + ': exactly pageFor().draft');
      assert.ok(V3.validateDesign(r.design, { cloudName: 'dwqc6n7rn' }).ok, tag);
      const ids = r.design.pages[0].sections.map((s) => s.id);
      assert.deepEqual(ids.filter((id) => id.startsWith('s_c')), ['s_caaaa1111', 's_cbbbb2222'], tag + ': Custom Sections in order');
      assert.ok(ids.indexOf('s_caaaa1111') < ids.indexOf('s_cbbbb2222'));
      const json = JSON.stringify(r.design);
      assert.ok(!/Sample Street|Musterstra|Beispielstra|example\.com|hello@|hallo@|\+49|€/.test(json), tag + ': no example data');
      for (const s of r.design.pages[0].sections) {
        if (s.type === 'products' || s.type === 'buttons') assert.equal((s.data.items || []).length, 0, tag + ' ' + s.type);
        if (s.type === 'socialMedia') assert.deepEqual(s.data.links, [{ platform: 'instagram', url: 'https://instagram.com/cafesonne' }], tag + ': only the customer\'s link');
      }
      assert.deepEqual([r.origin.source, r.origin.template, r.origin.palette, r.origin.language], ['onboarding', tpl, a.palette, lang]);
      assert.ok(r.origin.exampleSectionIds.every((id) => ids.includes(id)), tag);
    }
  }
  assert.equal(OB.draftRequest(M, V3, T, answers('bakery', 'en', { name: '' }), 'en'), null, 'no name');
  assert.equal(OB.draftRequest(M, V3, T, answers('bakery', 'en', { template: null }), 'en'), null, 'no template');
  assert.equal(OB.draftRequest(M, V3, T, answers('bakery', 'en', { name: 'x'.repeat(81) }), 'en'), null, 'invalid name');
});

test('fingerprint: same content same value, any change another; restoreDraft accepts only the two well-formed states', () => {
  const a = OB.draftRequest(M, V3, T, answers('bakery', 'en'), 'en');
  const b = OB.draftRequest(M, V3, T, answers('bakery', 'en', { sections: ['hero', 'custom:bbbb2222', 'buttons', 'products', 'custom:aaaa1111', 'contact', 'socialMedia'] }), 'en');
  const fa = OB.fingerprint(JSON.stringify(a));
  assert.match(fa, /^[0-9a-f]{8}-[0-9]+$/);
  assert.equal(OB.fingerprint(JSON.stringify(a)), fa);
  assert.notEqual(OB.fingerprint(JSON.stringify(b)), fa, 'another order, another fingerprint');
  const id = D.requestId();
  assert.deepEqual(OB.restoreDraft({ status: 'pending', requestId: id, fp: fa, extra: 1 }), { status: 'pending', requestId: id, fp: fa });
  const saved = { status: 'saved', requestId: id, fp: fa, slug: 'cafe-sonne-abc123', revision: 1, savedAt: '2026-11-07T10:00:00.000Z' };
  assert.deepEqual(OB.restoreDraft(Object.assign({ token: 'x' }, saved)), saved, 'unknown fields dropped');
  for (const bad of [null, 'x', {}, { status: 'saved', requestId: id, fp: fa }, Object.assign({}, saved, { slug: '../x' }), Object.assign({}, saved, { revision: 0 }), Object.assign({}, saved, { savedAt: 'never' }),
    Object.assign({}, saved, { requestId: 'abc' }), Object.assign({}, saved, { fp: 'zz' }), Object.assign({}, saved, { status: 'published' })]) {
    assert.equal(OB.restoreDraft(bad), null, JSON.stringify(bad));
  }
});

test('end to end with the real D2.1 route: the onboarding request creates the draft (201) exactly as built; a retry with the same requestId returns it (200); GET shows it; no User, plan, trial or public page; another account 403', async () => {
  S.resetDrafts();
  process.env.CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';   // the template photos' account (production's); the helper sets test-cloud
  const srv = await S.start();
  try {
    const usersBefore = S.copy(S.db.users), pagesBefore = await countSmartPages(S.CARL);
    const r = OB.draftRequest(M, V3, T, answers('restaurant', 'en'), 'en');
    const req = Object.assign({ requestId: D.requestId() }, r);
    const client = D.createDraftClient({ api: srv.origin, session: session('tok_carl'), fetch: fetch });
    const first = await client.create(req);
    assert.equal(first.created, true);
    assert.equal(first.revision, 1);
    const again = await client.create(req);
    assert.deepEqual([again.created, again.slug, again.revision], [false, first.slug, 1], 'idempotent');
    const g = await fetch(srv.origin + '/studio/pages/' + first.slug + '/design', { headers: { Authorization: 'Bearer tok_carl' } }).then((x) => x.json());
    assert.deepEqual(g.design, V3.validateDesign(r.design, { cloudName: 'dwqc6n7rn' }).design, 'stored as built');
    assert.deepEqual(g.design.pages[0].sections.map((s) => s.id).filter((id) => id.startsWith('s_c')), ['s_caaaa1111', 's_cbbbb2222']);
    const row = S.db.pages.find((p) => p.slug === first.slug);
    assert.deepEqual([row.userId, row.status], [S.CARL, 'draft']);
    assert.deepEqual(S.db.pageDesigns.find((d) => d.landingPageId === row.id).origin, r.origin, 'origin stored');
    assert.deepEqual(S.db.users, usersBefore, 'no User, plan or trial change');
    assert.equal(await countSmartPages(S.CARL), pagesBefore, 'not a Smart Page');
    const ben = await fetch(srv.origin + '/studio/pages/' + first.slug + '/design', { headers: { Authorization: 'Bearer tok_ben' } });
    assert.equal(ben.status, 403);
    const dana = await D.createDraftClient({ api: srv.origin, session: session('tok_dana'), fetch: fetch }).create(Object.assign({}, req, { requestId: D.requestId() })).then(() => null, (e) => e);
    assert.equal(dana.state, 'unverified', 'unverified email: refused by the server');
    process.env.CLOUDINARY_CLOUD_NAME = 'qraivy-staging-none';
    const staging = await client.create(Object.assign({}, req, { requestId: D.requestId() })).then(() => null, (e) => e);
    assert.equal(staging.state, 'invalid', 'with staging\'s current cloud name the photos are refused (blocker B1)');
  } finally {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    S.resetDrafts();
    await srv.close();
  }
});

// ── D2.3a: Save changes (update) through the Studio's own save (studio-pages-data.js) ──
const P = require('../../frontend/public/js/studio/studio-pages-data.js');
const design1 = () => ({ schemaVersion: 1, pages: [] });

test('D2.3a update: exactly one PUT <api>/studio/pages/<slug>/design with { design, baseRevision } only (no origin, name or requestId), the Bearer token, no cookies, no cache; the new revision on 200', async () => {
  const f = fakeFetch({ status: 200, body: { revision: 2, savedAt: '2026-11-07T10:00:00.000Z', design: {} } });
  const c = D.createDraftClient({ api: API, session: session(), fetch: f, pages: P });
  assert.equal(c.canUpdate(), true);
  const r = await c.update('cafe-sonne-abc123', design1(), 1);
  assert.deepEqual(r, { slug: 'cafe-sonne-abc123', revision: 2, savedAt: '2026-11-07T10:00:00.000Z' });
  assert.equal(f.calls.length, 1);
  const { url, init, body: sent } = f.calls[0];
  assert.equal(url, API + '/studio/pages/cafe-sonne-abc123/design');
  assert.deepEqual([init.method, init.headers.Authorization, init.headers['Content-Type'], init.credentials, init.cache, init.redirect], ['PUT', 'Bearer tok_x', 'application/json', 'omit', 'no-store', 'error']);
  assert.deepEqual(Object.keys(sent).sort(), ['baseRevision', 'design'], 'the design and the kept revision only: never the origin');
  assert.deepEqual(sent, { design: design1(), baseRevision: 1 });
});

test('D2.3a update: every answer mapped (409 conflict with the current revision, 401, 403, 404, 422, 500, no answer); a revision that did not move on is not a success', async () => {
  const cases = [
    [{ status: 409, body: { error: 'revision_conflict', currentRevision: 3 } }, 'conflict'],
    [{ status: 401, body: {} }, 'signin'], [{ status: 403, body: { error: 'forbidden' } }, 'forbidden'], [{ status: 403, body: { error: 'email_unverified' } }, 'forbidden'],
    [{ status: 404, body: { error: 'not_found' } }, 'notfound'], [{ status: 422, body: { error: 'design_invalid', errors: [] } }, 'invalid'],
    [{ status: 500, body: {} }, 'unavailable'], [new Error('offline'), 'unavailable'], [{ status: 200, body: { revision: 1 } }, 'unavailable'], [{ status: 200, body: {} }, 'unavailable'],
  ];
  for (const [answer, state] of cases) {
    const e = await D.createDraftClient({ api: API, session: session(), fetch: fakeFetch(answer), pages: P }).update('cafe-sonne-abc123', design1(), 1).then(() => null, (x) => x);
    assert.ok(e instanceof D.Failure, JSON.stringify(answer) + ': rejected');
    assert.equal(e.state, state, JSON.stringify(answer));
    if (state === 'conflict') assert.deepEqual(e.info, { currentRevision: 3 });
  }
});

test('D2.3a update: nothing is sent without a token, an API address, the Studio save file, a well-formed slug, a design or a revision (never a create with a blank revision)', async () => {
  const none = async (c, args, state) => { const e = await c.update(...args).then(() => null, (x) => x); assert.equal(e && e.state, state, JSON.stringify(args)); };
  const f = fakeFetch({ status: 200, body: { revision: 2 } });
  const c = D.createDraftClient({ api: API, session: session(), fetch: f, pages: P });
  for (const args of [['../x', design1(), 1], ['a/b', design1(), 1], ['', design1(), 1], [null, design1(), 1], ['ok-slug', null, 1], ['ok-slug', [], 1], ['ok-slug', design1(), null], ['ok-slug', design1(), 0], ['ok-slug', design1(), 1.5], ['ok-slug', design1(), '1']]) await none(c, args, 'invalid');
  await none(D.createDraftClient({ api: '', session: session(), fetch: f, pages: P }), ['ok-slug', design1(), 1], 'unavailable');
  await none(D.createDraftClient({ api: API, session: session(), fetch: f }), ['ok-slug', design1(), 1], 'unavailable');
  assert.equal(f.calls.length, 0, 'nothing sent');
  const nt = fakeFetch({ status: 200, body: { revision: 2 } });
  await none(D.createDraftClient({ api: API, session: () => null, fetch: nt, pages: P }), ['ok-slug', design1(), 1], 'signin');
  await none(D.createDraftClient({ api: API, session: session(''), fetch: nt, pages: P }), ['ok-slug', design1(), 1], 'signin');
  assert.equal(nt.calls.length, 0, 'no token: nothing sent');
  // the slug is encoded into the path by studio-pages-data.js; a slug with characters outside the rule never reaches it
  const src = fs.readFileSync(path.join(PUB, 'js/studio/onboarding-drafts.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(src.includes('pagesData.save(slug, design, baseRevision)') && !/origin/.test(src.slice(src.indexOf('function update('))), 'update: the Studio save, the design only');
});

test('D2.3a end to end with the real routes: onboarding creates (revision 1), the Studio GET opens it (no new page), Save changes updates it (2) with the origin untouched; a stale revision is 409 and overwrites nothing; another account 403; an unknown slug 404', async () => {
  S.resetDrafts();
  process.env.CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';
  const srv = await S.start();
  try {
    const r = OB.draftRequest(M, V3, T, answers('beauty', 'de'), 'de');
    const c = D.createDraftClient({ api: srv.origin, session: session('tok_carl'), fetch: fetch, pages: P });
    const made = await c.create(Object.assign({ requestId: D.requestId() }, r));
    const pagesAfterCreate = S.db.pages.length;
    const row = S.db.pages.find((p) => p.slug === made.slug);
    const pd = () => S.db.pageDesigns.find((d) => d.landingPageId === row.id);
    // the Studio's own load (studio-pages-data.js load(), as studio.html?slug= does)
    const studio = P.createPagesData({ api: srv.origin, fetch: fetch, getToken: async () => 'tok_carl' });
    const opened = await studio.load(made.slug);
    assert.deepEqual([opened.state, opened.source, opened.revision, opened.page.slug, opened.page.live], ['loaded', 'draft', 1, made.slug, false]);
    assert.deepEqual(opened.design.pages[0].sections.map((s) => s.id).filter((id) => id.startsWith('s_c')), ['s_caaaa1111', 's_cbbbb2222'], 'Custom Sections with their ids, in order');
    assert.deepEqual(opened.design.theme, V3.validateDesign(r.design, { cloudName: 'dwqc6n7rn' }).design.theme, 'the template styling');
    // Save changes from the onboarding: a changed page, the kept revision
    const changed = OB.draftRequest(M, V3, T, answers('beauty', 'de', { description: 'Neu und frisch.' }), 'de');
    const up = await c.update(made.slug, changed.design, 1);
    assert.equal(up.revision, 2);
    assert.equal(S.db.pages.length, pagesAfterCreate, 'no other page created');
    assert.deepEqual(pd().origin, r.origin, 'the origin untouched by the update');
    assert.deepEqual(pd().draft, V3.validateDesign(changed.design, { cloudName: 'dwqc6n7rn' }).design);
    // the Studio saves a newer version (3); the onboarding still holds 2: refused, nothing overwritten
    const studioSave = await studio.save(made.slug, opened.design, 2);
    assert.deepEqual([studioSave.state, studioSave.revision], ['saved', 3]);
    const newest = S.copy(pd().draft);
    const stale = await c.update(made.slug, changed.design, 2).then(() => null, (e) => e);
    assert.deepEqual([stale.state, stale.info.currentRevision], ['conflict', 3]);
    assert.deepEqual([pd().draftRevision, pd().draft], [3, newest], 'the Studio\'s version kept');
    // another account, an unknown slug, signed out
    const ben = await D.createDraftClient({ api: srv.origin, session: session('tok_ben'), fetch: fetch, pages: P }).update(made.slug, changed.design, 3).then(() => null, (e) => e);
    assert.equal(ben.state, 'forbidden');
    const gone = await c.update('no-such-draft-x1', changed.design, 1).then(() => null, (e) => e);
    assert.equal(gone.state, 'notfound');
    const out = await D.createDraftClient({ api: srv.origin, session: session('tok_nobody'), fetch: fetch, pages: P }).update(made.slug, changed.design, 3).then(() => null, (e) => e);
    assert.equal(out.state, 'signin');
    assert.deepEqual([pd().draftRevision, pd().draft, pd().origin], [3, newest, r.origin], 'nothing changed by the refused requests');
    assert.equal(S.db.pages.length, pagesAfterCreate);
  } finally {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    S.resetDrafts();
    await srv.close();
  }
});

(async () => {
  let passed = 0, failed = 0;
  console.log('onboardingSaveDraft');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e && e.message).split('\n').slice(0, 12).join('\n       ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
