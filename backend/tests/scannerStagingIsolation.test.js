// ============================================================
// scannerStagingIsolation.test.js — the stamp scanner never reaches
// production from a staging address.
//
// Before: stamp-scanner.html had https://api.qraivy.com hard-coded, so the
// copy on the staging site (deals-preview.qraivy.com) sent PIN checks, stamp
// codes and stamps to production.
// Now: the page picks its API from its own address, default deny:
//   www.qraivy.com, qraivy.com   production API (unchanged)
//   deals-preview.qraivy.com     the staging API only
//   localhost                    a local test server only
//   anything else                no request at all (Vercel deployment
//                                addresses, other preview domains)
// The page's real script runs in a sandbox with a stand-in DOM; every
// request it makes is recorded with its full address.
// No test framework dependency. Run: node tests/scannerStagingIsolation.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const HTML = fs.readFileSync(path.join(PUB, 'stamp-scanner.html'), 'utf8').replace(/\r\n/g, '\n');
const START = "<script>\n(function(){\n  'use strict';";
const MAIN = HTML.slice(HTML.indexOf(START) + '<script>'.length, HTML.indexOf('})();\n</script>', HTML.indexOf(START)) + '})();'.length);
const SCREENS = ['access-check', 'access-denied', 'pin-gate', 'scanner-wrap'];

const PRODUCTION_API = 'https://api.qraivy.com';
const STAGING_API = 'https://qraivy-deals-api-deals-preview.up.railway.app';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── a stand-in server: page "t1" has staff PIN 2468 and owner "user_owner" ──
function server(calls) {
  return async (url, opts = {}) => {
    calls.push(String(url));
    let u;
    try { u = new URL(url); } catch (e) { throw new TypeError('Failed to fetch'); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new TypeError('Failed to fetch');
    const headers = {};
    for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v;
    const owner = headers.authorization === 'Bearer user_owner';
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const p = u.pathname;
    if (p === '/loyalty/programs') return owner ? reply(200, { programs: [{ slug: 't1', businessName: 'Test 1' }] }) : reply(401, { error: 'Unauthorized' });
    if (p === '/lp/staff-pin/t1/status') return reply(200, { configured: true });
    if (p === '/lp/staff-pin/t1/verify') return JSON.parse(opts.body || '{}').pin === '2468' ? reply(200, { ok: true, slug: 't1' }) : reply(401, { error: 'Incorrect PIN.' });
    if (p === '/lp/stamp/token/t1') return owner || headers['x-staff-pin'] === '2468' ? reply(200, { token: 'abcd1234' }) : reply(401, { error: 'Sign in as the owner or enter the staff PIN.' });
    if (p === '/stamp/t1/abcd1234/confirm') return reply(200, { status: 'ok', newCount: 1, goal: 10, rewardName: 'Test reward' });
    return reply(404, { error: 'Page not found.' });
  };
}

// ── the page: real script, stand-in DOM ──
function element(id) {
  const el = { id, style: {}, textContent: '', href: '', className: '', options: [], onchange: null, classList: { toggle() {} } };
  el.style.display = new RegExp('id="' + id + '"[^>]*style="display:none"').test(HTML) ? 'none' : '';
  let inner = '', value = '';
  Object.defineProperty(el, 'innerHTML', { get: () => inner, set: (v) => { inner = v; if (id === 'slug-select') { el.options = []; const m = /<option value="([^"]*)"/.exec(v); value = m ? m[1] : ''; } } });
  Object.defineProperty(el, 'value', { get: () => value, set: (v) => { value = v; } });
  el.appendChild = (o) => { el.options.push(o); if (el.options.length === 1) value = o.value; };
  return el;
}
async function settle() { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); }
async function openAt(hostname, { search = '', auth = null, localApi } = {}) {
  const els = {}, calls = [], store = {};
  const origin = hostname ? (/^(localhost|127\.0\.0\.1)$/.test(hostname) ? 'http://' : 'https://') + hostname + (/^(localhost|127\.0\.0\.1)$/.test(hostname) ? ':5173' : '') : 'null';
  const window = {
    Clerk: { load: async () => {}, user: auth ? { id: auth } : null, session: auth ? { getToken: async () => auth } : null },
    QRAIVY_SCANNER_LOCAL_API: localApi,
  };
  const ctx = {
    window,
    document: { readyState: 'complete', getElementById: (id) => (els[id] = els[id] || element(id)), createElement: () => ({ value: '', textContent: '' }), querySelectorAll: () => [], addEventListener() {} },
    location: { search, hostname, origin },
    URLSearchParams, URL, Promise, JSON, Date, Error, TypeError,
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    fetch: server(calls),
    setTimeout: (fn, ms) => (ms >= 10000 ? 0 : setTimeout(fn, ms)),
    navigator: { mediaDevices: { getUserMedia: async () => { throw new Error('no camera in tests'); } } },
    cancelAnimationFrame() {}, requestAnimationFrame() {},
  };
  ctx.window.location = ctx.location;
  vm.runInNewContext(MAIN, ctx);
  await settle();
  return {
    els, calls, window,
    visible: () => SCREENS.filter((s) => els[s] && els[s].style.display !== 'none'),
    text: (id) => (els[id] ? els[id].textContent : ''),
    async pin(digits) { for (const d of digits) window.pinKey(d); await settle(); },
    async manual(url) { await window.stampFromUrl(url); await settle(); },
    network: () => calls.filter((c) => /^https?:/i.test(c)),
  };
}
const pass = (slug, cid) => 'https://api.qraivy.com/lp/' + slug + '?cid=' + cid;
const origins = (calls) => [...new Set(calls.map((c) => new URL(c).origin))];

// ── the address table ──
test('the API is chosen by the page address, default deny', () => {
  const html = HTML;
  const src = html.slice(html.indexOf('  var BLOCKED_API = '), html.indexOf('  var ROUTING = resolveApi('));
  const ctx = { URL, String }; vm.runInNewContext(src + ';this.resolve = resolveApi;', ctx);
  const at = (host, local) => JSON.parse(JSON.stringify(ctx.resolve(host, local)));
  for (const h of ['www.qraivy.com', 'qraivy.com', 'WWW.QRAIVY.COM']) assert.deepEqual(at(h), { mode: 'production', api: PRODUCTION_API, blocked: false }, h);
  for (const h of ['deals-preview.qraivy.com', 'Deals-Preview.qraivy.com']) assert.deepEqual(at(h), { mode: 'staging', api: STAGING_API, blocked: false }, h);
  assert.deepEqual(at('localhost', 'http://localhost:5178'), { mode: 'local', api: 'http://localhost:5178', blocked: false });
  assert.deepEqual(at('127.0.0.1', 'http://127.0.0.1:8080/x'), { mode: 'local', api: 'http://127.0.0.1:8080', blocked: false });
  for (const local of [PRODUCTION_API, STAGING_API, 'https://evil.example', 'javascript:alert(1)', '', undefined, 'not a url']) {
    assert.deepEqual(at('localhost', local), { mode: 'local', api: 'about:blank#qraivy-api-blocked', blocked: true }, 'localhost never uses ' + local);
  }
  for (const h of ['preview.qraivy.com', 'admin-preview.qraivy.com', 'plan-preview.qraivy.com', 'voice-preview.qraivy.com', 'api.qraivy.com', 'pages.qraivy.com',
    'qraivy-deals-staging-nw0ox9urn-adwinscottrussell-5957s-projects.vercel.app', 'qraivy-ai-git-preview-scanner-auth-ux-adwinscottrussell-5957s-projects.vercel.app',
    'deals-preview.qraivy.com.evil.example', 'evilqraivy.com', 'www.qraivy.com.evil.example', 'evil.example', '', undefined]) {
    assert.deepEqual(at(h), { mode: 'unknown-host', api: 'about:blank#qraivy-api-blocked', blocked: true }, String(h));
  }
});

test('the staging API address is the same one the Deals admin uses on deals-preview', () => {
  const deals = fs.readFileSync(path.join(PUB, 'js', 'deals-routing.js'), 'utf8');
  assert.ok(deals.includes("var DEALS_PREVIEW_API = '" + STAGING_API + "';"));
  assert.ok(deals.includes("var DEALS_PREVIEW_HOST = 'deals-preview.qraivy.com';"));
});

test('every request of the page goes through the chosen API; production appears only in the address table', () => {
  const script = MAIN;
  const fetches = [...script.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(fetches.length >= 5);
  assert.ok(fetches.every((f) => f.startsWith("API+'/")), 'fetch(API + path) only: ' + fetches.join(' | '));
  assert.equal(script.split("'https://api.qraivy.com'").length - 1, 1, 'one production address, inside resolveApi');
  assert.equal(script.split(STAGING_API).length - 1, 1, 'one staging address, inside resolveApi');
  assert.ok(/var API = ROUTING\.api;/.test(script) && !/API\s*=\s*'https/.test(script));
});

// ── the staging site ──
test('staging, staff PIN: status, PIN check, stamp code and stamp all go to the staging API, none to production', async () => {
  const p = await openAt('deals-preview.qraivy.com', { search: '?slug=t1' });
  assert.deepEqual(p.visible(), ['pin-gate']);
  await p.pin('1111');
  assert.deepEqual(p.visible(), ['pin-gate'], 'a wrong PIN keeps it locked');
  await p.pin('2468');
  assert.deepEqual(p.visible(), ['scanner-wrap']);
  await p.manual(pass('t1', 'test-cid-1'));
  assert.match(p.els['result-box'].innerHTML, /Stamp added!/);
  assert.deepEqual(origins(p.calls), [STAGING_API]);
  const paths = p.calls.map((c) => new URL(c).pathname);
  for (const want of ['/lp/stamp/token/t1', '/lp/staff-pin/t1/status', '/lp/staff-pin/t1/verify', '/stamp/t1/abcd1234/confirm']) assert.ok(paths.includes(want), want);
  assert.ok(!p.calls.some((c) => c.includes('api.qraivy.com')));
});

test('staging, owner signed in without ?slug=: program list and stamp code go to the staging API only', async () => {
  const p = await openAt('deals-preview.qraivy.com', { auth: 'user_owner' });
  assert.deepEqual(p.visible(), ['scanner-wrap']);
  assert.deepEqual(p.calls.map((c) => new URL(c).pathname).map((x) => x.replace(/\?.*/, '')), ['/loyalty/programs', '/lp/stamp/token/t1']);
  assert.deepEqual(origins(p.calls), [STAGING_API]);
});

test('staging, signed out: refused stamp code and PIN status go to the staging API only', async () => {
  const p = await openAt('deals-preview.qraivy.com', { search: '?slug=t1' });
  assert.deepEqual(origins(p.calls), [STAGING_API]);
  assert.ok(p.calls.length >= 2);
});

// ── addresses that must not reach any API ──
test('any other address: the scanner says it is not available here and sends no request at all, even when poked', async () => {
  for (const host of ['qraivy-deals-staging-nw0ox9urn-adwinscottrussell-5957s-projects.vercel.app', 'preview.qraivy.com', 'admin-preview.qraivy.com', 'voice-preview.qraivy.com', 'deals-preview.qraivy.com.evil.example', 'evil.example']) {
    for (const opts of [{ search: '?slug=t1' }, {}, { search: '?slug=t1', auth: 'user_owner' }]) {
      const p = await openAt(host, opts);
      assert.deepEqual(p.visible(), ['access-denied'], host);
      assert.equal(p.text('access-title'), 'Scanner not available here', host);
      assert.equal(p.els['access-signin'].style.display, 'none', 'no sign-in offered: ' + host);
      assert.deepEqual(p.calls, [], 'not one request: ' + host);
      // from the console: retry, PIN keys, stamping, camera
      p.window.retryAccess(); await settle();
      await p.pin('2468');
      await p.manual(pass('t1', 'test-cid-1'));
      await p.window.startScanner(); await settle();
      assert.deepEqual(p.network(), [], 'nothing left the page: ' + host + ' ' + JSON.stringify(p.calls));
      assert.ok(p.calls.every((c) => c.startsWith('about:blank#qraivy-api-blocked')), host);
      assert.ok(!p.visible().includes('scanner-wrap'), host);
    }
  }
});

test('localhost uses only the local test server it is given, never production or staging', async () => {
  const p = await openAt('localhost', { search: '?slug=t1', localApi: 'http://localhost:5178' });
  assert.deepEqual(origins(p.calls), ['http://localhost:5178']);
  for (const localApi of [PRODUCTION_API, STAGING_API]) {
    const q = await openAt('localhost', { search: '?slug=t1', localApi });
    assert.deepEqual([q.visible(), q.network()], [['access-denied'], []], localApi);
  }
});

// ── production: unchanged ──
test('production: every request goes to the production API, exactly as before', async () => {
  for (const host of ['www.qraivy.com', 'qraivy.com']) {
    const p = await openAt(host, { search: '?slug=t1' });
    await p.pin('2468');
    await p.manual(pass('t1', 'test-cid-1'));
    assert.deepEqual(p.visible(), ['scanner-wrap'], host);
    assert.deepEqual(origins(p.calls), [PRODUCTION_API], host);
  }
});

// ── runner ──
(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`PASS  ${name}`); }
    catch (err) { failed++; console.log(`FAIL  ${name}`); console.log(`      ${String(err.stack || err.message).split('\n').slice(0, 8).join('\n      ')}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
  process.exit(failed ? 1 : 0);
})();
