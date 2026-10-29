// ============================================================
// studioPagesData.test.js — Landing Page Studio V3, Phase A, browser side:
// js/studio/studio-pages-data.js (the owner's pages, read only) and the
// store's load(design) (open another page in the editor).
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

test('only two GET requests are possible: the list and one page’s design (any other path refused before a request)', async () => {
  assert.equal(PD.LIST, '/studio/pages');
  assert.equal(PD.designPath('anna-cafe'), '/studio/pages/anna-cafe/design');
  assert.ok(PD.allowed('/studio/pages') && PD.allowed('/studio/pages/anna-cafe/design'));
  for (const p of ['/studio/pages/anna-cafe', '/studio/pages/a%2Fb/design', '/deals', '/studio/pages/../x/design', '/studio/pages/-x/design', '/lp/anna-cafe']) assert.equal(PD.allowed(p), false, p);
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'studio', 'studio-pages-data.js'), 'utf8');
  assert.equal((src.match(/doFetch\(/g) || []).length, 1, 'one request site');
  assert.ok(src.includes("var init = { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' };"));
  assert.ok(!/'(POST|PUT|PATCH|DELETE)'|\bbody\s*:|localStorage|sessionStorage|document\.cookie|XMLHttpRequest|WebSocket|sendBeacon/.test(src));
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
