// ============================================================
// walletStudioPreviewRender.test.js — Phase 3C.6A: exercises the
// ACTUAL inline render() logic from
// frontend/public/wallet-pass-studio.html (not a reimplementation
// of it) to prove the Business Wallet Card branch never renders
// fake loyalty reward/stamp data, and the Loyalty branch is
// unchanged.
//
// This page has no existing browser test harness and this repo has
// no headless-browser dependency installed. Smallest reasonable
// approach: extract the page's own inline <script> IIFE and run it
// in a Node `vm` context with a minimal fake DOM (plain objects
// recording textContent/innerHTML/style — no real rendering), then
// call the page's own `render()` function directly. A small
// test-only exposure line is spliced into the IN-MEMORY copy of the
// script only (never written back to the file) so the test can
// reach `render`/`PROGRAMS`/`PAGES`, which are otherwise private to
// the page's closure. No test framework dependency: uses Node's
// built-in `assert` and a tiny inline runner, matching every other
// test in this directory.
//
// Run: node tests/walletStudioPreviewRender.test.js
// ============================================================
const assert = require('assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'wallet-pass-studio.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract the main IIFE — uniquely identified by its 'use strict' + API url
// fingerprint, since the page has other <script> blocks (Clerk SDK, sidebar).
const scriptMatch = html.match(/\(function\(\)\{\s*'use strict';\s*var API = 'https:\/\/api\.qraivy\.com';[\s\S]*?\n\}\)\(\);/);
if (!scriptMatch) throw new Error('Could not locate the Wallet Pass Studio main script in the HTML file — page structure may have changed.');
let script = scriptMatch[0];

// Splice a test-only exposure hook into the IN-MEMORY copy only, immediately
// before the closing `})();` — gives the test access to the closure's
// render()/fetchPage()/wpsT() and a setter for PROGRAMS/PAGES (both `var`
// bindings reassigned internally, so they must be set via a function that
// shares the closure, not poked from outside).
script = script.replace(
  /\n\}\)\(\);$/,
  "\n  window.__wpsTest = { render: render, wpsT: wpsT, setPrograms: function(arr){ PROGRAMS = arr; }, setPages: function(obj){ PAGES = obj; } };\n})();"
);

// ── Minimal fake DOM ─────────────────────────────────────────

function makeElement() {
  return {
    style: {},
    _text: '', _html: '',
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    href: '', value: '',
    addEventListener() {},
    appendChild() {},
    querySelectorAll() { return []; },
  };
}

const elements = new Map();
function getElementById(id) {
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
}

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
  console,
};
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);
new vm.Script(script, { filename: 'wallet-pass-studio-inline.js' }).runInContext(sandbox);

const wps = sandbox.window.__wpsTest;

// ── Fixtures ─────────────────────────────────────────────────

const PROGRAMS = [
  { slug: 'sp-off', businessName: 'Rick Ross Marketing', isBusinessWalletCard: true, isStadtPocketLinked: true, loyaltyEnabled: false, city: 'Ulm', color: '#ff5a1f', rewardText: null, stampGoal: null },
  { slug: 'sp-on', businessName: 'Rick Ross Marketing', isBusinessWalletCard: false, isStadtPocketLinked: true, loyaltyEnabled: true, city: 'Ulm', color: '#ff5a1f', rewardText: 'Free Coffee', stampGoal: 8 },
  { slug: 'non-sp', businessName: 'Old Loyalty Biz', isBusinessWalletCard: false, isStadtPocketLinked: false, loyaltyEnabled: false, color: '#00aaff', rewardText: null, stampGoal: null },
  { slug: 'sp-no-city', businessName: 'No City Biz', isBusinessWalletCard: true, isStadtPocketLinked: true, loyaltyEnabled: false, city: null, color: '#333333', rewardText: null, stampGoal: null },
];
const PAGES = {
  'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: 'Family Bakery' },
  'sp-on': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' },
  'non-sp': { logoUrl: '', brandColor: '#00aaff', tagline: '' },
  'sp-no-city': { logoUrl: '', brandColor: '#333333', tagline: '' },
};

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('Business Wallet mode (StadtPocket + loyalty OFF): no reward, no stamps, no "LOYALTY CARD"', async () => {
  wps.setPrograms(PROGRAMS);
  wps.setPages(PAGES);
  await wps.render('sp-off');

  assert.equal(getElementById('apw-loyalty-block').style.display, 'none');
  assert.equal(getElementById('apw-business-block').style.display, '');
  assert.notEqual(getElementById('apw-kind').innerHTML, wps.wpsT('wps_card_kind')); // not "LOYALTY CARD"
  assert.equal(getElementById('apw-kind').innerHTML, wps.wpsT('wps_card_kind_business'));

  assert.equal(getElementById('gow-loyalty-block').style.display, 'none');
  assert.equal(getElementById('gow-business-block').style.display, '');
});

test('Business Wallet mode: shows business name, category, and StadtPocket · city', async () => {
  wps.setPrograms(PROGRAMS);
  wps.setPages(PAGES);
  await wps.render('sp-off');

  assert.equal(getElementById('apw-biz').textContent, 'Rick Ross Marketing');
  assert.equal(getElementById('apw-category').textContent, 'Family Bakery');
  assert.equal(getElementById('apw-city').textContent, 'StadtPocket · Ulm');

  assert.equal(getElementById('gow-biz').textContent, 'Rick Ross Marketing');
  assert.equal(getElementById('gow-category').textContent, 'Family Bakery');
  assert.equal(getElementById('gow-city').textContent, 'StadtPocket · Ulm');
});

test('Business Wallet mode with no city falls back to plain "StadtPocket", never fabricates one', async () => {
  wps.setPrograms(PROGRAMS);
  wps.setPages(PAGES);
  await wps.render('sp-no-city');

  assert.equal(getElementById('apw-city').textContent, 'StadtPocket');
  assert.equal(getElementById('gow-city').textContent, 'StadtPocket');
});

test('Business Wallet mode never falls back to fake loyalty data ("Free item" / stamp goal 10)', async () => {
  wps.setPrograms(PROGRAMS);
  wps.setPages(PAGES);
  await wps.render('sp-off');

  // The loyalty-specific elements are hidden and, since the business branch
  // never touches them, must retain whatever they had before (nothing set
  // in this run) rather than a fabricated reward/stamp string.
  assert.notEqual(getElementById('apw-reward').textContent, wps.wpsT('wps_default_reward'));
  assert.notEqual(getElementById('apw-progress').textContent, '4 of 10 stamps');
});

test('Loyalty mode (StadtPocket + loyalty ON): reward/stamps render, business block hidden', async () => {
  wps.setPrograms(PROGRAMS);
  wps.setPages(PAGES);
  await wps.render('sp-on');

  assert.equal(getElementById('apw-loyalty-block').style.display, '');
  assert.equal(getElementById('apw-business-block').style.display, 'none');
  assert.equal(getElementById('apw-kind').innerHTML, wps.wpsT('wps_card_kind')); // "LOYALTY CARD" preserved
  assert.equal(getElementById('apw-reward').textContent, 'Free Coffee');
  assert.equal(getElementById('apw-progress').textContent, '4 of 8 stamps');

  assert.equal(getElementById('gow-loyalty-block').style.display, '');
  assert.equal(getElementById('gow-business-block').style.display, 'none');
  assert.equal(getElementById('gow-reward').textContent, 'Free Coffee');
});

test('Non-StadtPocket page: unchanged loyalty-shaped preview regardless of isBusinessWalletCard being false', async () => {
  wps.setPrograms(PROGRAMS);
  wps.setPages(PAGES);
  await wps.render('non-sp');

  assert.equal(getElementById('apw-loyalty-block').style.display, '');
  assert.equal(getElementById('apw-business-block').style.display, 'none');
  assert.equal(getElementById('apw-kind').innerHTML, wps.wpsT('wps_card_kind'));
  // No StampSettings on this fixture -> falls back to the existing (pre-3C.6A)
  // default reward/goal — unchanged behavior for non-StadtPocket pages.
  assert.equal(getElementById('apw-reward').textContent, wps.wpsT('wps_default_reward'));
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
