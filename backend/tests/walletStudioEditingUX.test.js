// ============================================================
// walletStudioEditingUX.test.js — Wallet Pass Studio inline Business
// Wallet Card editing. Proves the edit action never routes through
// the Loyalty setup flow or the Smart QR editor, that Loyalty on/off
// is shown as a genuinely separate optional action, that the
// Business Wallet heading never calls it a loyalty card, that
// StadtPocket city stays read-only, that saving reuses the exact
// canonical LandingPage/sections fields and the existing POST /lp
// endpoint — no new data model, no new endpoint — and that Category /
// descriptor (sections.hero.badge) is never written by this editor,
// only ever displayed read-only (that field belongs to the Smart Page
// Hero "Badge Text", owned by the Smart QR editor).
//
// Same approach as the other walletStudio*.test.js files: extracts
// the page's own inline <script> IIFE and runs it in a Node `vm`
// context with a minimal fake DOM, splicing a test-only exposure
// line into the IN-MEMORY copy only. `fetch` is mocked per-test — no
// real network call, no test framework dependency.
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
  "\n  window.__wpsTest = { render: render, wpsT: wpsT, openEditPanel: openEditPanel, closeEditPanel: closeEditPanel, saveWalletCard: saveWalletCard, uploadLogoImage: uploadLogoImage, removeLogoImage: removeLogoImage, setPrograms: function(arr){ PROGRAMS = arr; }, setPages: function(obj){ PAGES = obj; }, setCurrentSlug: function(s){ CURRENT_SLUG = s; } };\n})();"
);

// ── Minimal fake DOM ─────────────────────────────────────────

function makeElement() {
  return {
    style: {},
    _text: '', _html: '', _value: '', _src: '', disabled: false, href: undefined,
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    get value() { return this._value; }, set value(v) { this._value = String(v); },
    get src() { return this._src; }, set src(v) { this._src = String(v); },
    files: null,
    _listeners: {},
    addEventListener(evt, fn) { this._listeners[evt] = fn; },
    appendChild() {},
    removeAttribute() { this._src = ''; },
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

class FakeFormData {
  constructor() { this.entries = {}; }
  append(k, v) { this.entries[k] = v; }
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
  fetch: (url, opts) => { fetchCalls.push({ url: String(url), opts }); return fetchImpl(url, opts); },
  FormData: FakeFormData,
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
function fullPageResponse(sections) {
  return { ok: true, status: 200, json: async () => ({ businessName: 'Rick Ross Marketing', brandColor: '#ff5a1f', template: null, sections: JSON.stringify(sections) }) };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. Business Wallet edit action is a <button>, never a link, and never references loyalty-setup.html or smart-qr-detail.html', () => {
  // Structural proof from the actual markup: the edit-wallet-card control
  // must be a <button> (cannot navigate anywhere by itself), and nothing in
  // its vicinity in the source points at loyalty-setup.html or the Smart QR
  // editor.
  const btnMatch = html.match(/<button[^>]*id="wps-edit-wallet-card"[^>]*>/);
  assert.ok(btnMatch, 'wps-edit-wallet-card must exist');
  assert.ok(!/href/i.test(btnMatch[0]), 'must not be a navigable link');
  const panelMatch = html.match(/<div id="wps-edit-panel"[\s\S]*?<div class="wps-themes">/);
  assert.ok(panelMatch);
  assert.ok(!panelMatch[0].includes('loyalty-setup.html'));
  assert.ok(!panelMatch[0].includes('smart-qr-detail.html'), 'Business Wallet editing must never route into the Smart QR editor');
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

test('9. saveWalletCard() reuses the canonical fields and the existing POST /lp endpoint only, and never touches sections.hero (Category/Badge)', async () => {
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

  await wps.saveWalletCard();

  const saveCall = fetchCalls.find(c => c.url.endsWith('/lp') && c.opts && c.opts.method === 'POST');
  assert.ok(saveCall, 'expected a POST to /lp');
  const body = JSON.parse(saveCall.opts.body);
  assert.equal(body.slug, 'sp-off');
  assert.equal(body.businessName, 'New Name');       // LandingPage.businessName
  assert.equal(body.brandColor, '#112233');           // LandingPage.brandColor
  assert.equal(body.sections.theme.accentColor, '#112233'); // sections.theme.accentColor
  // Category/descriptor (sections.hero.badge) must survive completely
  // untouched — Wallet Pass Studio never edits Smart Page Hero content.
  assert.equal(body.sections.hero.badge, 'Old Category');
  assert.equal(body.sections.hero.title, 'Welcome to Rick Ross Marketing');
  // Other untouched canonical fields must survive the full read-modify-write.
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
  await wps.saveWalletCard();
  for (const call of fetchCalls) {
    assert.ok(call.url.includes('/api/lp/') || call.url.endsWith('/lp'), 'unexpected endpoint: ' + call.url);
    assert.ok(!/loyalty/i.test(call.url), 'must never call a loyalty endpoint: ' + call.url);
  }
});

test('11. no duplicate branding model: saveWalletCard() only ever writes businessName/brandColor/theme.accentColor, never a new field', () => {
  const fnMatch = html.match(/async function saveWalletCard\(\)\{[\s\S]*?\n  \}/);
  assert.ok(fnMatch);
  const body = fnMatch[0];
  assert.ok(body.includes('businessName'));
  assert.ok(body.includes('brandColor'));
  assert.ok(body.includes('updatedSections.theme'));
  // Category is display-only now — saveWalletCard() must never reference
  // updatedSections.hero or read a wce-category input.
  assert.ok(!body.includes('updatedSections.hero'), 'saveWalletCard() must never write sections.hero (Category/Badge Text)');
  assert.ok(!body.includes('wce-category'), 'saveWalletCard() must not read a Category input — the field was removed');
  assert.ok(!/walletBranding|WalletBrand|new.{0,10}[Mm]odel/i.test(body));
});

test('12. Category/descriptor has no editable input anywhere in the markup (display-only, sourced from sections.hero.badge)', () => {
  assert.ok(!html.includes('id="wce-category"'));
  assert.ok(!/wce_category_label/.test(html), 'Category edit-label translation key must be gone');
  // The read-only preview label key (wps_category_label) legitimately remains.
  assert.ok(html.includes('wps_category_label'), 'the read-only Category preview label must still exist');
});

test('13. Category display is unaffected by removing the edit control: the preview still reads sections.hero.badge', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: 'Family Bakery' } });
  await wps.render('sp-off');
  assert.equal(getElementById('apw-category').textContent, 'Family Bakery');
  assert.equal(getElementById('gow-category').textContent, 'Family Bakery');
});

// ── Inline Business Logo editing (reuses the existing POST /lp/upload-logo/:slug endpoint) ──

test('14. Logo upload uses the existing POST /lp/upload-logo/:slug endpoint with field name "logo", and persists via sections.logo.url + top-level logoUrl', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: 'Family Bakery', walletHeroUrl: '' } });
  wps.setCurrentSlug('sp-off');
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/lp/')) return fullPageResponse({ theme: { accentColor: '#ff5a1f' }, hero: { badge: 'Family Bakery' }, walletHero: { url: 'https://res.cloudinary.com/hero.png' } });
    if (u.includes('/upload-logo/')) return { ok: true, status: 200, json: async () => ({ url: 'https://res.cloudinary.com/logo.png' }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await wps.uploadLogoImage({ name: 'logo.png' });

  const uploadCall = fetchCalls.find(c => c.url.includes('/lp/upload-logo/sp-off'));
  assert.ok(uploadCall, 'expected a call to /lp/upload-logo/sp-off');
  assert.equal(uploadCall.opts.method, 'POST');
  assert.ok('logo' in uploadCall.opts.body.entries);

  const saveCall = fetchCalls.find(c => c.url.endsWith('/lp') && c.opts.method === 'POST');
  assert.ok(saveCall, 'expected a follow-up save to /lp');
  const body = JSON.parse(saveCall.opts.body);
  assert.equal(body.sections.logo.url, 'https://res.cloudinary.com/logo.png');
  assert.equal(body.logoUrl, 'https://res.cloudinary.com/logo.png'); // legacy page.logoUrl column kept in sync
  // Untouched canonical fields must survive the full read-modify-write.
  assert.equal(body.sections.hero.badge, 'Family Bakery');
  assert.equal(body.sections.walletHero.url, 'https://res.cloudinary.com/hero.png');
});

test('15. Logo remove clears only the canonical logo value and preserves unrelated sections', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: 'https://res.cloudinary.com/logo.png', brandColor: '#ff5a1f', tagline: 'Family Bakery', walletHeroUrl: '' } });
  wps.setCurrentSlug('sp-off');
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/lp/')) {
      return fullPageResponse({
        theme: { accentColor: '#ff5a1f' },
        hero: { title: 'Welcome to Rick Ross Marketing', badge: 'Family Bakery' },
        logo: { url: 'https://res.cloudinary.com/logo.png' },
        businessInfo: { address: '123 Main St' },
      });
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await wps.removeLogoImage();
  const saveCall = fetchCalls.find(c => c.url.endsWith('/lp') && c.opts.method === 'POST');
  assert.ok(saveCall);
  const body = JSON.parse(saveCall.opts.body);
  assert.equal(body.sections.logo, undefined); // logo cleared
  assert.equal(body.logoUrl, ''); // legacy column cleared too
  // Everything else survives the full read-modify-write.
  assert.equal(body.sections.hero.title, 'Welcome to Rick Ross Marketing');
  assert.equal(body.sections.hero.badge, 'Family Bakery');
  assert.equal(body.sections.businessInfo.address, '123 Main St');
});

test('16. Logo editor shows the existing logo when present, empty state when absent, never a broken preview', () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: 'https://res.cloudinary.com/logo.png', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: '' } });
  wps.setCurrentSlug('sp-off');
  wps.openEditPanel();
  assert.equal(getElementById('wce-logo-preview').style.display, 'block');
  assert.equal(getElementById('wce-logo-preview').src, 'https://res.cloudinary.com/logo.png');
  assert.equal(getElementById('wce-logo-empty').style.display, 'none');
  assert.equal(getElementById('wce-logo-remove').style.display, '');

  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: '' } });
  wps.openEditPanel();
  assert.equal(getElementById('wce-logo-preview').style.display, 'none');
  assert.equal(getElementById('wce-logo-empty').style.display, 'block');
  assert.equal(getElementById('wce-logo-remove').style.display, 'none');
});

test('17. Logo upload/remove never targets any endpoint other than /api/lp/:slug, /lp, and /lp/upload-logo/:slug', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: '' } });
  wps.setCurrentSlug('sp-off');
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/lp/')) return fullPageResponse({ theme: { accentColor: '#ff5a1f' } });
    if (u.includes('/upload-logo/')) return { ok: true, status: 200, json: async () => ({ url: 'https://res.cloudinary.com/logo.png' }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await wps.uploadLogoImage({ name: 'logo.png' });
  for (const call of fetchCalls) {
    assert.ok(
      call.url.includes('/api/lp/') || call.url.endsWith('/lp') || call.url.includes('/lp/upload-logo/'),
      'unexpected endpoint: ' + call.url
    );
    assert.ok(!/loyalty/i.test(call.url));
  }
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
