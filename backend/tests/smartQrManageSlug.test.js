// ============================================================
// smartQrManageSlug.test.js — Smart QR Manage page owns its QR
//
// smart-qr-detail.html?slug=X must show and encode X only. A demo claim
// left in localStorage (qraivy_active_claim / qraivy_pending_demo) used to
// hydrate every Manage page, so Global lux Travel's Manage page displayed
// and downloaded another page's QR. Static + vm checks on frontend/public.
//
// Same no-framework convention as the other backend tests.
//
// Run: node tests/smartQrManageSlug.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const src = fs.readFileSync(path.join(PUB, 'smart-qr-detail.html'), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

// The QR overview panel's destination function (canvas + download).
function loadGetUrl(search, editorState, sqdHostedUrl) {
  const m = src.match(/function getUrl\(\) \{[\s\S]*?\n    \}/);
  assert.ok(m, 'getUrl() not found');
  const ctx = { URLSearchParams, window: { location: { search, href: 'https://admin.example/smart-qr-detail.html' + search }, QRAIVY_EDITOR_STATE: editorState, _sqd_hostedUrl: sqdHostedUrl } };
  vm.createContext(ctx);
  vm.runInContext(m[0] + '\nthis.getUrl = getUrl;', ctx);
  return ctx.getUrl;
}

test('QR canvas/download destination is the ?slug= page even with stale editor state', () => {
  const stale = { hostedUrl: 'https://qraivy.com/lp/love-your-brothers-abc', slug: 'love-your-brothers-abc' };
  const getUrl = loadGetUrl('?slug=global-lux-travel-eef&manage=true', stale, 'https://qraivy.com/lp/love-your-brothers-abc');
  assert.equal(getUrl(), 'https://qraivy.com/lp/global-lux-travel-eef');
});

test('two pages never share a QR destination', () => {
  const a = loadGetUrl('?slug=page-a-aaa', { hostedUrl: 'https://qraivy.com/lp/page-b-bbb' })();
  const b = loadGetUrl('?slug=page-b-bbb', { hostedUrl: 'https://qraivy.com/lp/page-a-aaa' })();
  assert.equal(a, 'https://qraivy.com/lp/page-a-aaa');
  assert.equal(b, 'https://qraivy.com/lp/page-b-bbb');
  assert.notEqual(a, b);
});

test('a stored demo claim only hydrates the page it belongs to', () => {
  const s = src.indexOf('// ── Load Smart QR data');
  const block = src.slice(s, src.indexOf('// ── Populate hero', s));
  assert.ok(/stored && \(!slug \|\| stored\.slug === slug\)/.test(block), 'claim must be matched to ?slug=');
  assert.ok(!/pending = JSON\.parse\(localStorage\.getItem\('qraivy_active_claim'/.test(block), 'claim must not be assigned unconditionally');
});

test('page record is read from the JSON API, not the HTML /lp/:slug page', () => {
  const s = src.indexOf('// ── Load Smart QR data');
  const block = src.slice(s, src.indexOf('// ── Populate hero', s));
  assert.ok(block.includes("/api/lp/${encodeURIComponent(slug)}"), 'uses /api/lp/:slug');
  assert.ok(!block.includes('fetch(`https://www.qraivy.com/lp/${slug}`'), 'HTML route is not JSON');
  assert.ok(/data && data\.slug === slug/.test(block), 'response must be for the requested slug');
});

test('hero QR destination is derived from the page slug', () => {
  assert.ok(src.includes('const hostedUrl = pending.slug ? `https://qraivy.com/lp/${pending.slug}` : pending.hostedUrl;'));
});

console.log(passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
