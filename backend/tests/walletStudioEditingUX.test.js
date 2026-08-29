// ============================================================
// walletStudioEditingUX.test.js — Phase 3C.6B: proves the Wallet
// Pass Studio's Business Wallet Card editing action never routes
// through the Loyalty setup flow, that Loyalty on/off is shown as
// a genuinely separate optional action, that the Business Wallet
// heading never calls it a loyalty card, that StadtPocket city
// stays read-only, and that saving reuses the exact canonical
// LandingPage/sections fields and the existing POST /lp endpoint —
// no new data model, no new endpoint.
//
// Same approach as walletStudioPreviewRender.test.js /
// walletStudioAuthHardening.test.js: extracts the page's own inline
// <script> IIFE and runs it in a Node `vm` context with a minimal
// fake DOM, splicing a test-only exposure line into the IN-MEMORY
// copy only (never written back to the file). `fetch` is mocked
// per-test — no real network call, no test framework dependency.
//
// Run: node tests/walletStudioEditingUX.test.js
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
  "\n  window.__wpsTest = { render: render, wpsT: wpsT, openEditPanel: openEditPanel, closeEditPanel: closeEditPanel, saveWalletCard: saveWalletCard, setPrograms: function(arr){ PROGRAMS = arr; }, setPages: function(obj){ PAGES = obj; }, setCurrentSlug: function(s){ CURRENT_SLUG = s; } };\n})();"
);

// ── Minimal fake DOM ─────────────────────────────────────────

function makeElement() {
  return {
    style: {},
    _text: '', _html: '', _value: '', disabled: false, href: undefined,
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    get value() { return this._value; }, set value(v) { this._value = String(v); },
    _listeners: {},
    addEventListener(evt, fn) { this._listeners[evt] = fn; },
    appendChild() {},
    removeAttribute() {},
    querySelectorAll() { return []; },
  };
}

const elements = new Map();
function getElementById(id) {
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
}

let fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
const fetchCalls = [];

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
  fetch: (url, opts) => { fetchCalls.push({ url: String(url), opts }); return fetchImpl(url, opts); },
  URLSearchParams: URLSearchParams,
  console,
};
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.addEventListener = () => {};
sandbox.window.location = { search: '' };
sandbox.window.Clerk = { session: { getToken: async () => 'fake-token' } };
vm.createContext(sandbox);
new vm.Script(script, { filename: 'wallet-pass-studio-inline.js' }).runInContext(sandbox);

const wps = sandbox.window.__wpsTest;

function bizProgram(overrides) {
  return Object.assign({
    slug: 'sp-off', businessName: 'Rick Ross Marketing', isBusinessWalletCard: true,
    isStadtPocketLinked: true, loyaltyEnabled: false, city: 'Ulm', color: '#ff5a1f',
  }, overrides);
}
function loyaltyProgram(overrides) {
  return Object.assign({
    slug: 'sp-on', businessName: 'Rick Ross Marketing', isBusinessWalletCard: false,
    isStadtPocketLinked: true, loyaltyEnabled: true, city: 'Ulm', color: '#ff5a1f',
    rewardText: 'Free Coffee', stampGoal: 8,
  }, overrides);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. Business Wallet edit action is a <button>, never a link, and never references loyalty-setup.html', () => {
  // Structural proof from the actual markup: the edit-wallet-card control
  // must be a <button> (cannot navigate anywhere by itself), and nothing in
  // its vicinity in the source points at loyalty-setup.html.
  const btnMatch = html.match(/<button[^>]*id="wps-edit-wallet-card"[^>]*>/);
  assert.ok(btnMatch, 'wps-edit-wallet-card must exist');
  assert.ok(!/href/i.test(btnMatch[0]), 'must not be a navigable link');
  const panelMatch = html.match(/<div id="wps-edit-panel"[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(panelMatch);
  assert.ok(!panelMatch[0].includes('loyalty-setup.html'));
});

test('2. openEditPanel() opens the panel without touching window.location', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: 'Family Bakery' } });
  wps.setCurrentSlug('sp-off');
  const locationBefore = JSON.stringify(sandbox.window.location);
  wps.openEditPanel();
  assert.equal(getElementById('wps-edit-panel').style.display, 'block');
  assert.equal(JSON.stringify(sandbox.window.location), locationBefore);
});

test('3. Loyalty OFF shows "Enable Loyalty (Optional)", linking to loyalty-setup.html only as an explicit optional action', async () => {
  wps.setPrograms([bizProgram({ loyaltyEnabled: false })]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' } });
  await wps.render('sp-off');
  assert.equal(getElementById('wps-loyalty-action-label').textContent, wps.wpsT('wps_enable_loyalty'));
  assert.ok(getElementById('wps-loyalty-action').href.includes('loyalty-setup.html'));
});

test('4. Loyalty ON shows "Edit Loyalty Settings"', async () => {
  wps.setPrograms([loyaltyProgram({ loyaltyEnabled: true })]);
  wps.setPages({ 'sp-on': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' } });
  await wps.render('sp-on');
  assert.equal(getElementById('wps-loyalty-action-label').textContent, wps.wpsT('wps_edit_loyalty'));
});

test('5. Business Wallet heading/subheading never calls it a loyalty card', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' } });
  await wps.render('sp-off');
  const sub = getElementById('wps-sub').textContent;
  assert.ok(!/loyalty/i.test(sub), 'subheading must not mention loyalty for a Business Wallet Card: ' + sub);
});

test('6. Loyalty mode subheading is unchanged (still describes a loyalty card)', async () => {
  wps.setPrograms([loyaltyProgram()]);
  wps.setPages({ 'sp-on': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' } });
  await wps.render('sp-on');
  assert.equal(getElementById('wps-sub').textContent, wps.wpsT('wps_sub'));
});

test('7. StadtPocket city has no editable input anywhere in the markup', () => {
  assert.ok(!html.includes('id="wce-city"'));
  assert.ok(!/input[^>]*city/i.test(html));
});

test('8. Edit Wallet Card is hidden for Loyalty mode; Edit Brand Settings is hidden for Business Wallet mode', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' } });
  await wps.render('sp-off');
  assert.equal(getElementById('wps-edit-wallet-card').style.display, '');
  assert.equal(getElementById('wps-edit-brand').style.display, 'none');

  wps.setPrograms([loyaltyProgram()]);
  wps.setPages({ 'sp-on': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' } });
  await wps.render('sp-on');
  assert.equal(getElementById('wps-edit-wallet-card').style.display, 'none');
  assert.equal(getElementById('wps-edit-brand').style.display, '');
});

test('9. saveWalletCard() reuses the canonical fields and the existing POST /lp endpoint only', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: 'Old Category' } });
  wps.setCurrentSlug('sp-off');
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/lp/')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          businessName: 'Rick Ross Marketing', template: null,
          sections: JSON.stringify({ theme: { accentColor: '#ff5a1f' }, hero: { title: 'Welcome to Rick Ross Marketing', badge: 'Old Category' }, logo: { url: 'https://res.cloudinary.com/x.png' }, walletHero: { url: 'https://res.cloudinary.com/y.png' } }),
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ id: 'lp-id' }) };
  };
  getElementById('wce-name').value = 'New Name';
  getElementById('wce-color').value = '#112233';
  getElementById('wce-category').value = 'New Category';

  await wps.saveWalletCard();

  const saveCall = fetchCalls.find(c => c.url.endsWith('/lp') && c.opts && c.opts.method === 'POST');
  assert.ok(saveCall, 'expected a POST to /lp');
  const body = JSON.parse(saveCall.opts.body);
  assert.equal(body.slug, 'sp-off');
  assert.equal(body.businessName, 'New Name');       // LandingPage.businessName
  assert.equal(body.brandColor, '#112233');           // LandingPage.brandColor
  assert.equal(body.sections.theme.accentColor, '#112233'); // sections.theme.accentColor
  assert.equal(body.sections.hero.badge, 'New Category');   // sections.hero.badge
  // Untouched canonical fields must survive the full read-modify-write.
  assert.equal(body.sections.hero.title, 'Welcome to Rick Ross Marketing');
  assert.equal(body.sections.logo.url, 'https://res.cloudinary.com/x.png');
  assert.equal(body.sections.walletHero.url, 'https://res.cloudinary.com/y.png');
});

test('10. saveWalletCard() never targets any endpoint other than /api/lp/:slug (read) and /lp (write)', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '' } });
  wps.setCurrentSlug('sp-off');
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/lp/')) return { ok: true, status: 200, json: async () => ({ businessName: 'X', template: null, sections: JSON.stringify({}) }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  getElementById('wce-name').value = 'X';
  getElementById('wce-color').value = '#ff5a1f';
  getElementById('wce-category').value = '';
  await wps.saveWalletCard();
  for (const call of fetchCalls) {
    assert.ok(call.url.includes('/api/lp/') || call.url.endsWith('/lp'), 'unexpected endpoint: ' + call.url);
    assert.ok(!/loyalty/i.test(call.url), 'must never call a loyalty endpoint: ' + call.url);
  }
});

test('11. no duplicate branding model: the page source references only existing canonical fields', () => {
  // businessName / brandColor / sections.hero.badge / sections.theme.accentColor
  // are the only fields written by saveWalletCard's body — grepping the
  // function body for any other top-level persisted field would indicate a
  // new, undocumented data path.
  const fnMatch = html.match(/async function saveWalletCard\(\)\{[\s\S]*?\n  \}/);
  assert.ok(fnMatch);
  const body = fnMatch[0];
  assert.ok(body.includes('businessName'));
  assert.ok(body.includes('brandColor'));
  assert.ok(body.includes('updatedSections.hero'));
  assert.ok(body.includes('updatedSections.theme'));
  assert.ok(!/walletBranding|WalletBrand|new.{0,10}[Mm]odel/i.test(body));
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
