// ============================================================
// walletStudioHeroImage.test.js — Phase 3C.6B.1: proves the
// Business Wallet Card hero image editor uses only the existing
// canonical field (sections.walletHero.url) and the existing
// upload endpoint (POST /lp/upload-strip/:slug), that upload/
// remove always go through the same safe full read-modify-write
// save path as the rest of the 3C.6B editor (never dropping logo,
// business name, hero.badge/title, theme, or other sections), that
// both wallet previews show/hide the hero correctly, and that
// Business Wallet Card / Loyalty / non-StadtPocket behavior and
// read-only city are all unaffected.
//
// Same approach as the other walletStudio*.test.js files: extracts
// the page's own inline <script> IIFE and runs it in a Node `vm`
// context with a minimal fake DOM, splicing a test-only exposure
// line into the IN-MEMORY copy only. `fetch` is mocked per-test —
// no real network call, no test framework dependency.
//
// Run: node tests/walletStudioHeroImage.test.js
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
  "\n  window.__wpsTest = { render: render, wpsT: wpsT, openEditPanel: openEditPanel, uploadHeroImage: uploadHeroImage, removeHeroImage: removeHeroImage, setPrograms: function(arr){ PROGRAMS = arr; }, setPages: function(obj){ PAGES = obj; }, setCurrentSlug: function(s){ CURRENT_SLUG = s; } };\n})();"
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
    appendChild() {},
    removeAttribute() { this._src = ''; },
    querySelectorAll() { return []; },
    _listeners: {},
    addEventListener(evt, fn) { this._listeners[evt] = fn; },
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

test('1. Hero uses sections.walletHero.url exclusively (no other field name anywhere in the source)', () => {
  assert.ok(/sec\.walletHero/.test(html), 'expected fetchPage() to read sec.walletHero');
  assert.ok(/full\.sections\.walletHero/.test(html), 'expected saveHeroUrl() to read/write full.sections.walletHero');
  assert.ok(!/walletHeroUrl\s*column|BusinessWalletHero/i.test(html), 'must not introduce a new field/model name');
});

test('2. No new persistence/model is introduced — save always targets the existing POST /lp endpoint', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: '' } });
  wps.setCurrentSlug('sp-off');
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/lp/')) return fullPageResponse({ theme: { accentColor: '#ff5a1f' }, hero: { badge: '' } });
    if (u.includes('/upload-strip/')) return { ok: true, status: 200, json: async () => ({ url: 'https://res.cloudinary.com/hero.png' }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await wps.uploadHeroImage({ name: 'hero.png' });
  for (const call of fetchCalls) {
    assert.ok(
      call.url.includes('/api/lp/') || call.url.endsWith('/lp') || call.url.includes('/lp/upload-strip/'),
      'unexpected endpoint: ' + call.url
    );
  }
  assert.ok(!/BusinessWalletHero|walletHeroUrl\s+column|CREATE TABLE/i.test(html));
});

test('3. Recommended dimension copy includes 1032 × 336 px', () => {
  assert.ok(/1032\s*×\s*336\s*px/.test(wps.wpsT('wce_hero_hint')));
});

test('4. JPG/PNG guidance is displayed', () => {
  assert.ok(/jpg/i.test(wps.wpsT('wce_hero_hint')));
  assert.ok(/png/i.test(wps.wpsT('wce_hero_hint')));
});

test('5. Existing hero is shown in the editor when present', () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: 'https://res.cloudinary.com/existing.png' } });
  wps.setCurrentSlug('sp-off');
  wps.openEditPanel();
  assert.equal(getElementById('wce-hero-preview').style.display, 'block');
  assert.equal(getElementById('wce-hero-preview').src, 'https://res.cloudinary.com/existing.png');
  assert.equal(getElementById('wce-hero-empty').style.display, 'none');
  assert.equal(getElementById('wce-hero-remove').style.display, '');
});

test('5b. Editor shows the empty state when no hero exists, never a broken preview', () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: '' } });
  wps.setCurrentSlug('sp-off');
  wps.openEditPanel();
  assert.equal(getElementById('wce-hero-preview').style.display, 'none');
  assert.equal(getElementById('wce-hero-empty').style.display, 'block');
  assert.equal(getElementById('wce-hero-remove').style.display, 'none');
});

test('6. Apple Business Wallet preview shows the hero image when present', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: 'https://res.cloudinary.com/existing.png' } });
  await wps.render('sp-off');
  assert.equal(getElementById('apw-hero').style.display, 'block');
  assert.equal(getElementById('apw-hero').src, 'https://res.cloudinary.com/existing.png');
});

test('7. Google Business Wallet preview shows the same hero image when present', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: 'https://res.cloudinary.com/existing.png' } });
  await wps.render('sp-off');
  assert.equal(getElementById('gow-hero').style.display, 'block');
  assert.equal(getElementById('gow-hero').src, 'https://res.cloudinary.com/existing.png');
});

test('8. Neither preview shows a broken placeholder when hero is absent', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: '' } });
  await wps.render('sp-off');
  assert.equal(getElementById('apw-hero').style.display, 'none');
  assert.equal(getElementById('apw-hero').src, '');
  assert.equal(getElementById('gow-hero').style.display, 'none');
  assert.equal(getElementById('gow-hero').src, '');
});

test('9. Upload/replace uses the existing POST /lp/upload-strip/:slug endpoint with field name "strip"', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: '' } });
  wps.setCurrentSlug('sp-off');
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/lp/')) return fullPageResponse({ theme: { accentColor: '#ff5a1f' }, hero: {}, logo: { url: 'https://res.cloudinary.com/logo.png' } });
    if (u.includes('/upload-strip/')) return { ok: true, status: 200, json: async () => ({ url: 'https://res.cloudinary.com/hero.png' }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await wps.uploadHeroImage({ name: 'hero.png' });
  const uploadCall = fetchCalls.find(c => c.url.includes('/lp/upload-strip/sp-off'));
  assert.ok(uploadCall, 'expected a call to /lp/upload-strip/sp-off');
  assert.equal(uploadCall.opts.method, 'POST');
  assert.ok('strip' in uploadCall.opts.body.entries);

  const saveCall = fetchCalls.find(c => c.url.endsWith('/lp') && c.opts.method === 'POST');
  assert.ok(saveCall, 'expected a follow-up save to /lp');
  const body = JSON.parse(saveCall.opts.body);
  assert.equal(body.sections.walletHero.url, 'https://res.cloudinary.com/hero.png');
  assert.equal(body.sections.logo.url, 'https://res.cloudinary.com/logo.png'); // untouched
});

test('10. Remove clears only the canonical hero value and preserves unrelated sections', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: 'Family Bakery', walletHeroUrl: 'https://res.cloudinary.com/existing.png' } });
  wps.setCurrentSlug('sp-off');
  fetchCalls.length = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/lp/')) {
      return fullPageResponse({
        theme: { accentColor: '#ff5a1f' },
        hero: { title: 'Welcome to Rick Ross Marketing', badge: 'Family Bakery' },
        logo: { url: 'https://res.cloudinary.com/logo.png' },
        walletHero: { url: 'https://res.cloudinary.com/existing.png' },
        businessInfo: { address: '123 Main St' },
      });
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await wps.removeHeroImage();
  const saveCall = fetchCalls.find(c => c.url.endsWith('/lp') && c.opts.method === 'POST');
  assert.ok(saveCall);
  const body = JSON.parse(saveCall.opts.body);
  assert.equal(body.sections.walletHero, undefined); // hero cleared
  // Everything else survives the full read-modify-write.
  assert.equal(body.sections.hero.title, 'Welcome to Rick Ross Marketing');
  assert.equal(body.sections.hero.badge, 'Family Bakery');
  assert.equal(body.sections.logo.url, 'https://res.cloudinary.com/logo.png');
  assert.equal(body.sections.businessInfo.address, '123 Main St');
});

test('11. Business Wallet mode still works with Loyalty OFF (hero feature does not require it)', async () => {
  wps.setPrograms([bizProgram({ loyaltyEnabled: false })]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: '' } });
  await wps.render('sp-off');
  assert.equal(getElementById('apw-business-block').style.display, '');
  assert.equal(getElementById('apw-loyalty-block').style.display, 'none');
});

test('12. Loyalty behavior remains unchanged (no hero UI leaks into the loyalty preview)', async () => {
  wps.setPrograms([loyaltyProgram()]);
  wps.setPages({ 'sp-on': { logoUrl: '', brandColor: '#ff5a1f', tagline: '', walletHeroUrl: 'https://res.cloudinary.com/existing.png' } });
  await wps.render('sp-on');
  assert.equal(getElementById('apw-loyalty-block').style.display, '');
  assert.equal(getElementById('apw-reward').textContent, 'Free Coffee');
  // The business-only hero <img> stays hidden in loyalty mode.
  assert.equal(getElementById('apw-hero').style.display, 'none');
});

test('13. City remains read-only — no input anywhere, hero editor does not introduce one', () => {
  assert.ok(!html.includes('id="wce-city"'));
  assert.ok(!/<input[^>]*city/i.test(html));
});

test('14. Existing business name/color/category editing remains intact', async () => {
  wps.setPrograms([bizProgram()]);
  wps.setPages({ 'sp-off': { logoUrl: '', brandColor: '#ff5a1f', tagline: 'Family Bakery', walletHeroUrl: '' } });
  wps.setCurrentSlug('sp-off');
  wps.openEditPanel();
  assert.equal(getElementById('wce-name').value, 'Rick Ross Marketing');
  assert.equal(getElementById('wce-color').value, '#ff5a1f');
  assert.equal(getElementById('wce-category').value, 'Family Bakery');
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
