// ============================================================
// walletStudioAuthHardening.test.js — Phase 3C.6A.1: proves the
// ACTUAL inline fetchPrograms()/init() logic from
// frontend/public/wallet-pass-studio.html never renders the
// "no programs" empty state for an auth failure, a server/network
// failure, distinguishes those from a genuine empty account, and
// that the empty-state copy no longer implies loyalty is required.
//
// Same approach as walletStudioPreviewRender.test.js: extracts the
// page's own inline <script> IIFE and runs it in a Node `vm`
// context with a minimal fake DOM, splicing in a test-only
// exposure line on the IN-MEMORY copy only (never written back to
// the file). `fetch` is mocked per-test via a reconfigurable
// sandbox function — no real network call, no test framework
// dependency (plain assert + tiny inline runner, matching every
// other test in this directory).
//
// Run: node tests/walletStudioAuthHardening.test.js
// ============================================================
const assert = require('assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'wallet-pass-studio.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = html.match(/\(function\(\)\{\s*'use strict';\s*var API = 'https:\/\/api\.qraivy\.com';[\s\S]*?\n\}\)\(\);/);
if (!scriptMatch) throw new Error('Could not locate the Wallet Pass Studio main script in the HTML file — page structure may have changed.');
let script = scriptMatch[0];

script = script.replace(
  /\n\}\)\(\);$/,
  "\n  window.__wpsTest = { render: render, wpsT: wpsT, init: init, fetchPrograms: fetchPrograms, setPrograms: function(arr){ PROGRAMS = arr; }, setPages: function(obj){ PAGES = obj; } };\n})();"
);

// ── Minimal fake DOM ─────────────────────────────────────────

function makeElement() {
  return {
    style: {},
    _text: '', _html: '',
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    href: '', value: '',
    _listeners: {},
    addEventListener(evt, fn) { this._listeners[evt] = fn; },
    appendChild() {},
    querySelectorAll() { return []; },
  };
}

const elements = new Map();
function getElementById(id) {
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
}
function resetElements() { elements.clear(); }

let fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ programs: [] }) });

const sandbox = {
  window: {},
  document: {
    getElementById,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => makeElement(),
  },
  localStorage: { _store: {}, getItem(k) { return this._store[k] || null; }, setItem(k, v) { this._store[k] = v; } },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  fetch: (...args) => fetchImpl(...args),
  URLSearchParams: URLSearchParams,
  console,
};
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.addEventListener = () => {};
sandbox.window.location = { search: '' };
vm.createContext(sandbox);
new vm.Script(script, { filename: 'wallet-pass-studio-inline.js' }).runInContext(sandbox);

const wps = sandbox.window.__wpsTest;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('fetchPrograms(): 401 returns status "auth", never a bare empty array', async () => {
  fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized.' }) });
  const result = await wps.fetchPrograms();
  assert.equal(result.status, 'auth');
  assert.equal(result.programs.length, 0);
});

test('fetchPrograms(): 500 returns status "error"', async () => {
  fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({ error: 'Internal error' }) });
  const result = await wps.fetchPrograms();
  assert.equal(result.status, 'error');
});

test('fetchPrograms(): network exception returns status "error", does not throw', async () => {
  fetchImpl = async () => { throw new Error('network down'); };
  const result = await wps.fetchPrograms();
  assert.equal(result.status, 'error');
});

test('fetchPrograms(): successful 200 with empty programs returns status "ok"', async () => {
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ programs: [] }) });
  const result = await wps.fetchPrograms();
  assert.equal(result.status, 'ok');
  assert.equal(result.programs.length, 0);
});

test('init(): 401 shows the auth-error state, not the empty-program state', async () => {
  resetElements();
  fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized.' }) });
  await wps.init();
  assert.equal(getElementById('wps-auth-error').style.display, 'block');
  assert.notEqual(getElementById('wps-empty').style.display, 'block');
  assert.notEqual(getElementById('wps-api-error').style.display, 'block');
});

test('init(): 500 shows the api-error state, not the empty-program state', async () => {
  resetElements();
  fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({ error: 'Internal error' }) });
  await wps.init();
  assert.equal(getElementById('wps-api-error').style.display, 'block');
  assert.notEqual(getElementById('wps-empty').style.display, 'block');
  assert.notEqual(getElementById('wps-auth-error').style.display, 'block');
});

test('init(): network failure shows the api-error state, not the empty-program state', async () => {
  resetElements();
  fetchImpl = async () => { throw new Error('network down'); };
  await wps.init();
  assert.equal(getElementById('wps-api-error').style.display, 'block');
  assert.notEqual(getElementById('wps-empty').style.display, 'block');
});

test('init(): genuinely empty successful response shows the true empty state', async () => {
  resetElements();
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ programs: [] }) });
  await wps.init();
  assert.equal(getElementById('wps-empty').style.display, 'block');
  assert.notEqual(getElementById('wps-auth-error').style.display, 'block');
  assert.notEqual(getElementById('wps-api-error').style.display, 'block');
});

test('empty-state copy does not say "Set one up" and does not require loyalty', () => {
  const emptyText = wps.wpsT('wps_empty');
  const emptyLink = wps.wpsT('wps_empty_link');
  assert.ok(!/set one up/i.test(emptyText + ' ' + emptyLink));
  assert.ok(!/loyalty/i.test(emptyText + ' ' + emptyLink));
  // Scoped to the true-empty-account block specifically — Phase 3C.6B
  // legitimately adds a loyalty-setup.html link elsewhere in the page (the
  // explicit, optional "Enable Loyalty" action), so this must not assert
  // that string's absence from the whole file, only from this block.
  const emptyBlockMatch = html.match(/<div id="wps-empty"[\s\S]*?<\/div>/);
  assert.ok(emptyBlockMatch, 'wps-empty block must exist');
  assert.ok(!/loyalty-setup\.html/i.test(emptyBlockMatch[0]));
});

test('auth-error copy uses the existing sign-in flow, not a new one', () => {
  assert.ok(html.includes('href="login.html"'));
  assert.ok(/session could not be verified/i.test(wps.wpsT('wps_auth_error')));
});

test('Business Wallet preview branch is intact after the hardening change', async () => {
  resetElements();
  wps.setPrograms([{ slug: 'sp-off', businessName: 'Rick Ross Marketing', isBusinessWalletCard: true, isStadtPocketLinked: true, loyaltyEnabled: false, city: 'Ulm', color: '#ff5a1f' }]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: 'Family Bakery' } });
  await wps.render('sp-off');
  assert.equal(getElementById('apw-loyalty-block').style.display, 'none');
  assert.equal(getElementById('apw-business-block').style.display, '');
  assert.equal(getElementById('apw-kind').innerHTML, wps.wpsT('wps_card_kind_business'));
  assert.equal(getElementById('apw-city').textContent, 'StadtPocket · Ulm');
});

test('Loyalty preview branch is intact after the hardening change', async () => {
  resetElements();
  wps.setPrograms([{ slug: 'sp-on', businessName: 'Rick Ross Marketing', isBusinessWalletCard: false, isStadtPocketLinked: true, loyaltyEnabled: true, city: 'Ulm', color: '#ff5a1f', rewardText: 'Free Coffee', stampGoal: 8 }]);
  wps.setPages({ 'sp-on': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' } });
  await wps.render('sp-on');
  assert.equal(getElementById('apw-loyalty-block').style.display, '');
  assert.equal(getElementById('apw-business-block').style.display, 'none');
  assert.equal(getElementById('apw-kind').innerHTML, wps.wpsT('wps_card_kind'));
  assert.equal(getElementById('apw-reward').textContent, 'Free Coffee');
});

// ── runner ────────────────────────────────────────────────────

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
