// ============================================================
// scannerAccess.test.js — stamp scanner access (frontend, after Phase 0).
//
// Before: stamp-scanner.html showed the camera button and manual entry to
// anyone when the business had no staff PIN (and, without ?slug=, until
// Clerk redirected). The server already refused the stamp code, so nothing
// could be stamped, but the scanner looked usable.
// Now: the page asks the server for the business's stamp code first (owner
// sign-in and/or the session's staff PIN) and shows the scanner only when it
// gets one, and only for that business. Otherwise: the PIN screen when the
// business has a staff PIN, else a sign-in screen. A later 401/403/429 locks
// the scanner again with a message.
//
// The page's real script runs in a sandbox with a small stand-in DOM; its
// requests go to the REAL lpController handlers (in-memory database,
// tests/helpers/phase0Harness.js), so the server rules are the real ones.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const h = require('./helpers/phase0Harness');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'stamp-scanner.html'), 'utf8').replace(/\r\n/g, '\n');
const START = "<script>\n(function(){\n  'use strict';";
const MAIN = HTML.slice(HTML.indexOf(START) + '<script>'.length, HTML.indexOf('})();\n</script>', HTML.indexOf(START)) + '})();'.length);
const SCREENS = ['access-check', 'access-denied', 'pin-gate', 'scanner-wrap'];

// ── the server: the real handlers ──
function setup() {
  h.reset();
  // shop: has a staff PIN; cafe: no PIN; bakery: PIN, another owner
  h.page('shop', { userId: 'user_owner', sections: { staffPin: h.staffPin.hashPin('4321') } });
  h.page('cafe', { userId: 'user_owner', sections: {} });
  h.page('bakery', { userId: 'user_other', sections: { staffPin: h.staffPin.hashPin('8765') } });
  for (const slug of ['shop', 'cafe', 'bakery']) h.T('stampSettings').push({ slug, goal: 8, rewardName: 'Free Coffee', enabled: true });
}
const ROUTES = [
  ['GET', /^\/lp\/stamp\/token\/([^/?]+)$/, 'handleGetStampToken'],
  ['GET', /^\/lp\/staff-pin\/([^/?]+)\/status$/, 'handleGetStaffPinStatus'],
  ['POST', /^\/lp\/staff-pin\/([^/?]+)\/verify$/, 'handleVerifyStaffPin'],
  ['POST', /^\/stamp\/([^/?]+)\/([^/?]+)\/confirm$/, 'handleStampConfirm'],
];
function server(calls) {
  return async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    const headers = {};
    for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v;
    calls.push({ method, path: u.pathname, headers });
    let status = 404, body = { error: 'not found' };
    if (u.pathname === '/loyalty/programs') {
      const userId = (headers.authorization || '').startsWith('Bearer user_') ? headers.authorization.slice(7) : null;
      status = userId ? 200 : 401;
      body = userId ? { programs: h.T('landingPage').filter((p) => p.userId === userId).map((p) => ({ slug: p.slug, businessName: p.slug })) } : { error: 'Unauthorized' };
    } else {
      for (const [m, re, handler] of ROUTES) {
        const hit = method === m && u.pathname.match(re);
        if (!hit) continue;
        const params = handler === 'handleStampConfirm' ? { slug: decodeURIComponent(hit[1]), token: hit[2] } : { slug: decodeURIComponent(hit[1]) };
        const r = h.res();
        await h.quiet(() => h.lp[handler](h.req({ method, params, headers, body: opts.body ? JSON.parse(opts.body) : {}, originalUrl: u.pathname }), r));
        status = r.statusCode; body = r.body;
      }
    }
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

// ── the page: real script, stand-in DOM ──
function element(id) {
  const el = { id, style: {}, textContent: '', href: '', className: '', options: [], onchange: null, classList: { toggle() {} } };
  const hidden = new RegExp('id="' + id + '"[^>]*style="display:none"').test(HTML);
  el.style.display = hidden ? 'none' : '';
  let inner = '';
  let value = '';
  Object.defineProperty(el, 'innerHTML', { get: () => inner, set: (v) => { inner = v; if (id === 'slug-select') { el.options = []; const m = /<option value="([^"]*)"/.exec(v); value = m ? m[1] : ''; } } });
  Object.defineProperty(el, 'value', { get: () => value, set: (v) => { value = v; } });
  el.appendChild = (o) => { el.options.push(o); if (el.options.length === 1) value = o.value; };
  return el;
}
async function openScanner({ search = '', auth = null, pins = {} } = {}) {
  const els = {};
  const calls = [];
  const store = {};
  for (const [slug, pin] of Object.entries(pins)) store['staff_pin_' + slug] = pin;
  const signedIn = { current: auth };
  const window = {
    Clerk: {
      load: async () => {},
      get user() { return signedIn.current ? { id: signedIn.current } : null; },
      get session() { return signedIn.current ? { getToken: async () => signedIn.current } : null; },
    },
  };
  const ctx = {
    window,
    document: {
      readyState: 'complete',
      getElementById: (id) => (els[id] = els[id] || element(id)),
      createElement: () => ({ value: '', textContent: '' }),
      querySelectorAll: () => [],
      addEventListener() {},
    },
    location: { search, hostname: 'www.qraivy.com', origin: 'https://www.qraivy.com' },
    URLSearchParams, URL, Promise, JSON, Date, Error,
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    fetch: server(calls),
    setTimeout: (fn, ms) => (ms >= 10000 ? 0 : setTimeout(fn, ms)),
    navigator: { mediaDevices: { getUserMedia: async () => { calls.push({ camera: true }); throw new Error('no camera in tests'); } } },
    cancelAnimationFrame() {}, requestAnimationFrame() {},
  };
  ctx.window.location = ctx.location;
  vm.runInNewContext(MAIN, ctx);
  await settle();
  const page = {
    els, calls, store, window, signedIn,
    visible: () => SCREENS.filter((s) => els[s] && els[s].style.display !== 'none'),
    text: (id) => (els[id] ? els[id].textContent : ''),
    async pin(digits) { for (const d of digits) window.pinKey(d); await settle(); },
    async manual(url) { await window.stampFromUrl(url); await settle(); },
    stamps: () => calls.filter((c) => c.path && c.path.endsWith('/confirm')),
  };
  return page;
}
async function settle() { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); }
const pass = (slug, cid = 'cust-0001') => 'https://api.qraivy.com/lp/' + slug + '?cid=' + cid;

// ── nothing usable before the server said yes ──
test('markup: only "Checking access" is visible before the script runs; scanner, PIN and sign-in screens start hidden', () => {
  assert.ok(/<div id="access-check" class="access-panel">/.test(HTML));
  for (const id of ['access-denied', 'pin-gate', 'scanner-wrap']) assert.ok(new RegExp('id="' + id + '"[^>]*style="display:none"').test(HTML), id + ' hidden');
  assert.ok(!HTML.includes("window.location.href = 'index.html'"), 'no redirect race: the sign-in screen replaces it');
});

test('signed-in owner: scanner opens without the staff PIN (business with and without a PIN)', async () => {
  for (const slug of ['shop', 'cafe']) {
    setup();
    const p = await openScanner({ search: '?slug=' + slug, auth: 'user_owner' });
    assert.deepEqual(p.visible(), ['scanner-wrap'], slug);
    const ask = p.calls.find((c) => c.path === '/lp/stamp/token/' + slug);
    assert.equal(ask.headers.authorization, 'Bearer user_owner');
    assert.equal(ask.headers['x-staff-pin'], undefined, 'no PIN needed');
    await p.manual(pass(slug));
    assert.match(p.els['result-box'].innerHTML, /Stamp added!/, slug + ' stamps');
    assert.equal(p.stamps().length, 1);
  }
});

test('owner without ?slug=: their programs, the first one authorized; signed out -> sign-in screen (no redirect)', async () => {
  setup();
  let p = await openScanner({ auth: 'user_owner' });
  assert.deepEqual(p.visible(), ['scanner-wrap']);
  assert.deepEqual(p.els['slug-select'].options.map((o) => o.value), ['shop', 'cafe']);
  p = await openScanner();
  assert.deepEqual(p.visible(), ['access-denied']);
  assert.equal(p.text('access-title'), 'Sign in required');
  assert.equal(p.els['access-signin'].href, 'login.html?redirect=' + encodeURIComponent('stamp-scanner.html'));
  assert.equal(p.calls.filter((c) => c.path).length, 0, 'nothing asked of the server');
});

test('staff, correct PIN: PIN screen first, then the scanner; the PIN goes with every code request', async () => {
  setup();
  const p = await openScanner({ search: '?slug=shop' });
  assert.deepEqual(p.visible(), ['pin-gate']);
  await p.pin('4321');
  assert.deepEqual(p.visible(), ['scanner-wrap']);
  assert.equal(p.store.staff_pin_shop, '4321', 'kept for this browser session');
  await p.manual(pass('shop'));
  assert.match(p.els['result-box'].innerHTML, /Stamp added!/);
  const asks = p.calls.filter((c) => c.path === '/lp/stamp/token/shop');
  assert.equal(asks[0].headers['x-staff-pin'], undefined, 'first check: no PIN yet -> refused');
  assert.ok(asks.length >= 3 && asks.slice(1).every((c) => c.headers['x-staff-pin'] === '4321'), 'after the PIN: unlock check + stamp');
});

test('staff, wrong PIN: the scanner stays locked, nothing is stored, nothing stamped', async () => {
  setup();
  const p = await openScanner({ search: '?slug=shop' });
  await p.pin('1111');
  assert.deepEqual(p.visible(), ['pin-gate']);
  assert.equal(p.text('pin-err'), 'Incorrect PIN. Try again.');
  assert.equal(p.store.staff_pin_shop, undefined);
  await p.manual(pass('shop'));
  await p.window.startScanner();
  assert.equal(p.stamps().length, 0);
  assert.ok(!p.calls.some((c) => c.camera), 'camera not started');
  assert.match(p.els['result-box'].innerHTML, /Scanner locked/);
});

test('staff, too many wrong PINs: the server limit stays in force and the PIN screen says so', async () => {
  setup();
  const p = await openScanner({ search: '?slug=shop' });
  for (let i = 0; i < 10; i++) await p.pin('1111');
  await p.pin('4321');
  assert.deepEqual(p.visible(), ['pin-gate'], 'even the right PIN waits while locked');
  assert.match(p.text('pin-err'), /Too many incorrect PINs/);
});

test('signed-out visitor, business without a PIN: sign-in screen, no scanner controls', async () => {
  setup();
  const p = await openScanner({ search: '?slug=cafe' });
  assert.deepEqual(p.visible(), ['access-denied']);
  assert.equal(p.text('access-title'), 'Sign in required');
  assert.match(p.text('access-msg'), /no staff PIN yet/);
  assert.equal(p.els['access-signin'].href, 'login.html?redirect=' + encodeURIComponent('stamp-scanner.html?slug=cafe'));
  await p.manual(pass('cafe'));
  assert.equal(p.stamps().length, 0);
});

test('signed-out visitor, business with a PIN: the PIN screen (with an owner sign-in link)', async () => {
  setup();
  const p = await openScanner({ search: '?slug=shop' });
  assert.deepEqual(p.visible(), ['pin-gate']);
  assert.equal(p.text('pin-err'), '');
  assert.equal(p.els['pin-signin'].href, 'login.html?redirect=' + encodeURIComponent('stamp-scanner.html?slug=shop'));
});

test('cross-business: another account, or a PIN for another business, does not unlock it', async () => {
  setup();
  // signed in, not the owner, no PIN on cafe -> sign-in screen telling them why
  let p = await openScanner({ search: '?slug=cafe', auth: 'user_other' });
  assert.deepEqual(p.visible(), ['access-denied']);
  assert.match(p.text('access-msg'), /not the owner of this business/);
  // owner of shop/cafe opening bakery (PIN set) -> PIN screen, not the scanner
  p = await openScanner({ search: '?slug=bakery', auth: 'user_owner' });
  assert.deepEqual(p.visible(), ['pin-gate']);
  assert.match(p.text('pin-err'), /not the owner/);
  // the shop PIN (kept for shop) is not sent for bakery; shop's PIN typed for bakery fails
  p = await openScanner({ search: '?slug=bakery', pins: { shop: '4321' } });
  assert.deepEqual(p.visible(), ['pin-gate']);
  assert.ok(p.calls.filter((c) => c.path === '/lp/stamp/token/bakery').every((c) => !c.headers['x-staff-pin']));
  await p.pin('4321');
  assert.deepEqual(p.visible(), ['pin-gate']);
});

test('cross-business: an unlocked scanner refuses a pass of another business (camera and manual)', async () => {
  setup();
  const p = await openScanner({ search: '?slug=shop', auth: 'user_owner' });
  await p.manual(pass('bakery'));
  assert.match(p.els['result-box'].innerHTML, /belongs to another business/);
  assert.equal(p.stamps().length, 0);
  assert.ok(MAIN.includes("if(barcodeSlug && barcodeSlug !== slug){ setOtherBusiness(); return; }"), 'camera path checks the same');
  // the owner switching business in the list re-checks access for the new one
  const q = await openScanner({ auth: 'user_owner' });
  q.els['slug-select'].value = 'cafe';
  q.els['slug-select'].onchange();
  await settle();
  assert.deepEqual(q.visible(), ['scanner-wrap']);
  assert.ok(q.calls.some((c) => c.path === '/lp/stamp/token/cafe'));
});

test('session expires while open: the next stamp locks the scanner with a clear message', async () => {
  setup();
  let p = await openScanner({ search: '?slug=cafe', auth: 'user_owner' });
  p.signedIn.current = null;   // signed out in another tab / token expired
  await p.manual(pass('cafe'));
  assert.equal(p.stamps().length, 0);
  assert.deepEqual(p.visible(), ['access-denied']);
  assert.match(p.text('access-msg'), /session has expired/);
  // staff: the owner changed the PIN -> the saved one is dropped, PIN screen
  p = await openScanner({ search: '?slug=shop', pins: { shop: '4321' } });
  assert.deepEqual(p.visible(), ['scanner-wrap']);
  h.T('landingPage').find((x) => x.slug === 'shop').sections = JSON.stringify({ staffPin: h.staffPin.hashPin('9999') });
  await p.manual(pass('shop'));
  assert.deepEqual(p.visible(), ['pin-gate']);
  assert.match(p.text('pin-err'), /session has expired/);
  assert.equal(p.store.staff_pin_shop, undefined);
  assert.equal(p.stamps().length, 0);
});

test('unknown business and network failure: clear screens, nothing usable', async () => {
  setup();
  let p = await openScanner({ search: '?slug=no-such-shop', auth: 'user_owner' });
  assert.deepEqual(p.visible(), ['access-denied']);
  assert.equal(p.text('access-title'), 'Program not found');
  setup();
  p = await openScanner({ search: '?slug=shop' });
  assert.deepEqual(p.visible(), ['pin-gate']);
  const ctxFetchFails = await openScannerOffline('?slug=cafe');
  assert.deepEqual(ctxFetchFails.visible(), ['access-denied']);
  assert.equal(ctxFetchFails.text('access-title'), 'Connection problem');
});

test('?slug= is shown as text, never as markup', async () => {
  setup();
  const p = await openScanner({ search: '?slug=' + encodeURIComponent('"><img src=x onerror=alert(1)>') });
  assert.equal(p.els['slug-select'].innerHTML, '');
  assert.equal(p.els['slug-select'].options[0].textContent, '"><img src=x onerror=alert(1)>');
});

// Staging isolation follow-up: the scanner's staging API choice and the
// staging-only gate entries for it (scannerStagingIsolation.test.js).
test('server rules unchanged: this change touches only the scanner page, the staging-only gate (and their tests)', () => {
  const { execFileSync } = require('child_process');
  const ROOT = path.join(__dirname, '..', '..');
  const changed = execFileSync('git', ['diff', 'ae2861e', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    .concat(execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)).sort();
  assert.deepEqual(changed, ['backend/src/middleware/stagingGate.js', 'backend/tests/dealsPreviewSafety.test.js', 'backend/tests/helpers/phase0Files.js', 'backend/tests/lpDeleteAuth.test.js', 'backend/tests/lpStagingGate.test.js', 'backend/tests/pushCampaignAuth.test.js', 'backend/tests/scannerAccess.test.js', 'backend/tests/scannerStagingIsolation.test.js', 'backend/tests/stampCodeAuth.test.js', 'frontend/public/stamp-scanner.html']);
});

// helpers used above
async function openScannerOffline(search) {
  const p = await openScannerWith(search, async () => { throw new Error('offline'); });
  return p;
}
async function openScannerWith(search, fetchImpl) {
  const els = {};
  const ctx = {
    window: { Clerk: { load: async () => {}, user: null, session: null } },
    document: { readyState: 'complete', getElementById: (id) => (els[id] = els[id] || element(id)), createElement: () => ({}), querySelectorAll: () => [], addEventListener() {} },
    location: { search, hostname: 'www.qraivy.com', origin: 'https://www.qraivy.com' }, URLSearchParams, URL, Promise, JSON, Date, Error,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: fetchImpl, setTimeout: () => 0, navigator: {}, cancelAnimationFrame() {}, requestAnimationFrame() {},
  };
  ctx.window.location = ctx.location;
  vm.runInNewContext(MAIN, ctx);
  await settle();
  return { visible: () => SCREENS.filter((s) => els[s] && els[s].style.display !== 'none'), text: (id) => (els[id] ? els[id].textContent : '') };
}

h.run('scannerAccess', tests);
