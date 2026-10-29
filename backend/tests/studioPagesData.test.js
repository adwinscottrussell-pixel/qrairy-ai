// ============================================================
// studioPagesData.test.js — Landing Page Studio V3, browser side:
// js/studio/studio-pages-data.js (the owner's pages: list and load, Phase A;
// save, Phase B) and the store's load(design) and unsaved-changes tracking.
//
// Run: node tests/studioPagesData.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const PD = require('../../frontend/public/js/studio/studio-pages-data.js');
const STORE = require('../../frontend/public/js/studio/studio-store.js');
const V3 = require('../src/lpV3/core');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const API = 'http://127.0.0.1:5555';
function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const a = answers(url.slice(API.length));
    if (a === 'throw') throw new Error('network');
    return { status: a.status, ok: a.status >= 200 && a.status < 300, json: async () => a.body };
  };
  fn.calls = calls;
  return fn;
}
const page = (slug, extra) => Object.assign({ slug, name: 'N ' + slug, live: true, kind: 'business', hasDraft: false, userId: 'user_x', sections: '{"secret":1}' }, extra);
const design = (headline) => ({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_hero01', type: 'hero', variant: 'simple', data: { headline } }] }] });

test('only three requests are possible: GET the list, GET one page’s design, PUT one page’s design (any other path refused before a request)', async () => {
  assert.equal(PD.LIST, '/studio/pages');
  assert.equal(PD.designPath('anna-cafe'), '/studio/pages/anna-cafe/design');
  assert.ok(PD.allowed('/studio/pages') && PD.allowed('/studio/pages/anna-cafe/design'));
  for (const p of ['/studio/pages/anna-cafe', '/studio/pages/a%2Fb/design', '/deals', '/studio/pages/../x/design', '/studio/pages/-x/design', '/lp/anna-cafe']) assert.equal(PD.allowed(p), false, p);
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'studio', 'studio-pages-data.js'), 'utf8');
  assert.equal((src.match(/doFetch\(/g) || []).length, 1, 'one request site');
  assert.ok(src.includes("var init = { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' };"));
  // the one PUT (Save Draft), never to the list; nothing else
  assert.deepEqual(src.match(/'(GET|POST|PUT|PATCH|DELETE)'/g), ["'GET'", "'PUT'"]);
  assert.ok(src.includes("if (!allowed(path) || (body !== undefined && path === LIST)) return Promise.reject(new Failure('error'));"));
  assert.ok(src.includes("return request(designPath(slug), { design: design, baseRevision: base })"));
  assert.ok(!/localStorage|sessionStorage|document\.cookie|indexedDB|XMLHttpRequest|WebSocket|sendBeacon|publish/i.test(src.replace(/\/\*[\s\S]*?\*\//, '')));
});

test('without an API address, a fetch or a token source nothing is sent', async () => {
  const f = fakeFetch(() => ({ status: 200, body: { pages: [] } }));
  for (const o of [{ api: '', getToken: () => 't', fetch: f }, { api: 'ftp://x', getToken: () => 't', fetch: f }, { api: API, fetch: f }]) {
    const d = PD.createPagesData(o);
    assert.equal(d.connected(), false);
    assert.deepEqual(await d.list(), { state: 'off', pages: [] });
    assert.deepEqual(await d.load('anna-cafe'), { state: 'error' });
  }
  assert.equal(f.calls.length, 0);
});

test('list: the owner’s pages with display fields only; empty; and every failure mapped to a state (never rejects)', async () => {
  const f = fakeFetch(() => ({ status: 200, body: { pages: [page('anna-cafe'), page('bad slug!'), page('anna-shop', { kind: 'creator', live: false, hasDraft: true })] } }));
  const d = PD.createPagesData({ api: API, getToken: async () => 'tok', fetch: f });
  const r = await d.list();
  assert.deepEqual(r, { state: 'ready', pages: [{ slug: 'anna-cafe', name: 'N anna-cafe', live: true, kind: 'business', hasDraft: false }, { slug: 'anna-shop', name: 'N anna-shop', live: false, kind: 'creator', hasDraft: true }] });
  assert.equal(f.calls[0].url, API + '/studio/pages');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(await PD.createPagesData({ api: API, getToken: () => 'tok', fetch: fakeFetch(() => ({ status: 200, body: { pages: [] } })) }).list(), { state: 'empty', pages: [] });
  for (const [ans, state] of [[{ status: 401 }, 'signin'], [{ status: 403 }, 'forbidden'], [{ status: 404 }, 'notfound'], [{ status: 500 }, 'error'], ['throw', 'error'], [{ status: 200, body: { nope: 1 } }, 'error']]) {
    assert.deepEqual(await PD.createPagesData({ api: API, getToken: () => 'tok', fetch: fakeFetch(() => ans) }).list(), { state, pages: [] }, JSON.stringify(ans));
  }
  const noToken = fakeFetch(() => ({ status: 200, body: { pages: [] } }));
  assert.deepEqual(await PD.createPagesData({ api: API, getToken: () => null, fetch: noToken }).list(), { state: 'signin', pages: [] });
  assert.equal(noToken.calls.length, 0, 'no token: no request');
});

test('load: a page’s design (draft or converted legacy page); refusals mapped; a malformed slug sends nothing', async () => {
  const f = fakeFetch(() => ({ status: 200, body: { page: page('anna-cafe'), source: 'legacy_import', design: design('Hallo'), warnings: [{ code: 'voice_welcome_later_phase' }, 'junk'] } }));
  const d = PD.createPagesData({ api: API, getToken: () => 'tok', fetch: f });
  const r = await d.load('anna-cafe');
  assert.equal(r.state, 'loaded');
  assert.equal(r.source, 'legacy_import');
  assert.deepEqual(r.warnings, ['voice_welcome_later_phase']);
  assert.deepEqual(Object.keys(r.page).sort(), ['hasDraft', 'kind', 'live', 'name', 'slug'], 'no owner id or sections reach the Studio');
  assert.equal(f.calls[0].url, API + '/studio/pages/anna-cafe/design');
  for (const [ans, state] of [[{ status: 401 }, 'signin'], [{ status: 403 }, 'forbidden'], [{ status: 404 }, 'notfound'], [{ status: 422 }, 'error'], [{ status: 200, body: { page: page('x'), source: 'other', design: {} } }, 'error']]) {
    assert.deepEqual(await PD.createPagesData({ api: API, getToken: () => 'tok', fetch: fakeFetch(() => ans) }).load('anna-cafe'), { state }, JSON.stringify(ans));
  }
  const bad = fakeFetch(() => ({ status: 200, body: {} }));
  assert.deepEqual(await PD.createPagesData({ api: API, getToken: () => 'tok', fetch: bad }).load('../etc'), { state: 'error' });
  assert.equal(bad.calls.length, 0);
});

test('save: one PUT to the design path with { design, baseRevision } and the session token; answers mapped (saved, conflict, invalid, refusals); never rejects', async () => {
  const f = fakeFetch(() => ({ status: 200, body: { revision: 5, savedAt: '2026-10-29T10:00:00.000Z', design: design('x') } }));
  const d = PD.createPagesData({ api: API, getToken: () => 'tok', fetch: f });
  assert.deepEqual(await d.save('anna-shop', design('Neu'), 4), { state: 'saved', revision: 5, savedAt: '2026-10-29T10:00:00.000Z' });
  const c = f.calls[0];
  assert.equal(c.url, API + '/studio/pages/anna-shop/design');
  assert.equal(c.init.method, 'PUT');
  assert.equal(c.init.headers.Authorization, 'Bearer tok');
  assert.equal(c.init.headers['Content-Type'], 'application/json');
  assert.deepEqual([c.init.credentials, c.init.cache, c.init.redirect], ['omit', 'no-store', 'error']);
  assert.deepEqual(JSON.parse(c.init.body), { design: design('Neu'), baseRevision: 4 });
  await d.save('anna-cafe', design('Erst'), null);
  assert.equal(JSON.parse(f.calls[1].init.body).baseRevision, null, 'the first save: no draft yet');
  const cases = [
    [{ status: 409, body: { error: 'revision_conflict', currentRevision: 7, savedAt: '2026-10-29T11:00:00.000Z' } }, { state: 'conflict', currentRevision: 7, savedAt: '2026-10-29T11:00:00.000Z' }],
    [{ status: 409, body: null }, { state: 'conflict', currentRevision: null, savedAt: null }],
    [{ status: 422, body: { error: 'design_invalid', errors: [{ path: '$.x', code: 'too_large', junk: 1 }, 'bad'] } }, { state: 'invalid', errors: [{ path: '$.x', code: 'too_large' }] }],
    [{ status: 401 }, { state: 'signin' }], [{ status: 403 }, { state: 'forbidden' }], [{ status: 404 }, { state: 'notfound' }],
    [{ status: 500 }, { state: 'error' }], [{ status: 503 }, { state: 'error' }], ['throw', { state: 'error' }], [{ status: 200, body: { revision: 'x' } }, { state: 'error' }],
  ];
  for (const [ans, want] of cases) assert.deepEqual(await PD.createPagesData({ api: API, getToken: () => 'tok', fetch: fakeFetch(() => ans) }).save('anna-shop', design('x'), 4), want, JSON.stringify(ans));
  // nothing sent: no token, bad slug, bad revision, not a design, not connected
  const none = fakeFetch(() => ({ status: 200, body: {} }));
  assert.deepEqual(await PD.createPagesData({ api: API, getToken: () => null, fetch: none }).save('anna-shop', design('x'), 4), { state: 'signin' });
  const dn = PD.createPagesData({ api: API, getToken: () => 'tok', fetch: none });
  for (const args of [['../x', design('x'), 4], ['anna-shop', design('x'), 0], ['anna-shop', design('x'), '4'], ['anna-shop', design('x'), undefined], ['anna-shop', null, 4], ['anna-shop', [], 4]]) assert.equal((await dn.save(...args)).state, 'error', JSON.stringify(args));
  assert.equal((await PD.createPagesData({ api: '', getToken: () => 'tok', fetch: none }).save('anna-shop', design('x'), 4)).state, 'error');
  assert.equal(none.calls.length, 0);
});

test('load: a saved draft comes with its revision and time; a draft without a valid revision is refused; a legacy page has none', async () => {
  const draft = await PD.createPagesData({ api: API, getToken: () => 'tok', fetch: fakeFetch(() => ({ status: 200, body: { page: page('anna-shop'), source: 'draft', revision: 4, savedAt: '2026-10-28T09:00:00.000Z', design: design('D') } })) }).load('anna-shop');
  assert.deepEqual([draft.state, draft.revision, draft.savedAt], ['loaded', 4, '2026-10-28T09:00:00.000Z']);
  const legacy = await PD.createPagesData({ api: API, getToken: () => 'tok', fetch: fakeFetch(() => ({ status: 200, body: { page: page('anna-cafe'), source: 'legacy_import', revision: 9, savedAt: null, design: design('L') } })) }).load('anna-cafe');
  assert.deepEqual([legacy.revision, legacy.savedAt], [null, null]);
  for (const revision of [null, 0, '4', 1.5]) {
    const r = await PD.createPagesData({ api: API, getToken: () => 'tok', fetch: fakeFetch(() => ({ status: 200, body: { page: page('anna-shop'), source: 'draft', revision, design: design('D') } })) }).load('anna-shop');
    assert.deepEqual(r, { state: 'error' }, 'revision ' + revision);
  }
});

test('store: unsaved changes — clean after open / load; dirty after an edit; Undo back to the saved state is clean; markSaved keeps Undo / Redo', () => {
  const s = STORE.createStore({ design: design('Demo'), validate: V3.validateDesign, now: (() => { let t = 0; return () => (t += 10000); })() });
  assert.equal(s.dirty(), false);
  s.set('s_hero01', ['data', 'headline'], 'Eins');
  assert.equal(s.dirty(), true);
  s.undo();
  assert.equal(s.dirty(), false, 'Undo back to the opened state');
  s.redo();
  assert.equal(s.dirty(), true);
  const snap = s.snapshot();
  assert.equal(JSON.parse(snap).pages[0].sections[0].data.headline, 'Eins');
  s.markSaved(snap);
  assert.equal(s.dirty(), false);
  assert.equal(s.canUndo(), true, 'saving keeps the history');
  s.undo();
  assert.equal(s.dirty(), true, 'Undo behind the saved version is a change again');
  s.redo();
  assert.equal(s.dirty(), false);
  // a change made while a save was on its way stays unsaved
  const sending = s.snapshot();
  s.set('s_hero01', ['data', 'headline'], 'Zwei');
  s.markSaved(sending);
  assert.equal(s.dirty(), true);
  // an invalid edit is a change too (it cannot be saved: isValid() false)
  s.set('s_hero01', ['data', 'headline'], 'x'.repeat(5000));
  assert.equal(s.dirty(), true);
  assert.equal(s.isValid(), false);
  s.markSaved(42);
  assert.equal(s.dirty(), true, 'markSaved ignores anything but a snapshot');
  assert.equal(s.load(design('Anderes')), true);
  assert.equal(s.dirty(), false, 'another page opens clean');
});

test('store.load(design): replaces the draft, clears Undo / Redo and the selection; an invalid design is refused and changes nothing', () => {
  const s = STORE.createStore({ design: design('Demo'), validate: V3.validateDesign });
  const events = [];
  s.onChange((k, info) => events.push([k, info.loaded === true]));
  s.select('s_hero01');
  s.set('s_hero01', ['data', 'headline'], 'Demo edited');
  assert.equal(s.canUndo(), true);
  assert.equal(s.load(design('Anna')), true);
  assert.equal(s.draft().pages[0].sections[0].data.headline, 'Anna');
  assert.equal(s.lastValid().pages[0].sections[0].data.headline, 'Anna');
  assert.equal(s.canUndo(), false);
  assert.equal(s.canRedo(), false);
  assert.equal(s.selected(), null);
  assert.deepEqual(events[events.length - 1], ['history', true]);
  assert.equal(s.load({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_x', type: 'nope' }] }] }), false);
  assert.equal(s.draft().pages[0].sections[0].data.headline, 'Anna', 'unchanged after a refused load');
});

(async () => {
  let passed = 0, failed = 0;
  console.log('studioPagesData');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
