// ============================================================
// smartQrDetailVisits.test.js — the Smart QR detail screen
// (frontend/public/smart-qr-detail.html) shows the right counter and
// never creates a visit itself.
//
//   - A Smart Landing Page card (source 'lp') shows totalVisits, a legacy
//     QR card shows totalScans: the same rule as the dashboard list.
//     /dashboard never sends totalScans for a landing page, so reading it
//     always showed 0.
//   - Opening the screen never requests the public page (GET /lp/:slug),
//     which counts every non-preview load as a visit. The visit count comes
//     with the page record (/api/lp/:slug), which never counts.
//
// The page's own cardMetric() is cut out of the file and run.
// Run: node tests/smartQrDetailVisits.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const page = fs.readFileSync(path.join(ROOT, 'frontend', 'public', 'smart-qr-detail.html'), 'utf8').replace(/\r\n/g, '\n');
const dashboard = fs.readFileSync(path.join(ROOT, 'frontend', 'public', 'dashboard.html'), 'utf8').replace(/\r\n/g, '\n');

function cut(start, end) {
  const s = page.indexOf(start);
  const e = page.indexOf(end, s);
  assert.ok(s !== -1 && e !== -1, 'not found: ' + start);
  return page.slice(s, e);
}
const cardMetric = vm.runInNewContext('(function(){' + cut('  function cardMetric(card) {', '  // The page record as JSON') + '; return cardMetric; })()', {});

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── C. Which counter the tile shows ─────────────────────────────
test('C. a Smart Landing Page card shows its visits; a legacy QR card shows its scans', () => {
  assert.equal(cardMetric({ source: 'lp', totalVisits: 4 }), 4, 'what /dashboard sends for vince-khalilah-adams-3fs');
  assert.equal(cardMetric({ source: 'lp', totalVisits: 4, totalScans: 99 }), 4, 'never scans for a landing page');
  assert.equal(cardMetric({ source: 'qr', totalScans: 7 }), 7);
  assert.equal(cardMetric({ totalScans: 7 }), 7, 'cards without a source are legacy QR codes');
  assert.equal(cardMetric({ source: 'qr', totalScans: 7, totalVisits: 99 }), 7, 'never visits for a QR code');
});

test('C. missing or odd values show 0, never NaN or undefined', () => {
  for (const card of [null, undefined, {}, { source: 'lp' }, { source: 'lp', totalVisits: null }, { source: 'qr' }, { source: 'lp', totalVisits: 'x' }]) {
    assert.equal(cardMetric(card), 0, JSON.stringify(card));
  }
  assert.equal(cardMetric({ source: 'lp', totalVisits: '12' }), 12, 'numeric strings count');
});

test('C. the overview tile uses cardMetric, and the rule matches the dashboard list', () => {
  const ov = cut('  function populateOverview() {', "  // The tile's number, by card type");
  assert.ok(ov.includes('var scans = cardMetric(card);'));
  assert.ok(!ov.includes('card.totalScans'), 'the tile no longer reads totalScans directly');
  // dashboard.html: LandingPage-backed cards (source:'lp') carry totalVisits
  assert.ok(dashboard.includes("isVisits?qr.totalVisits:qr.totalScans"), 'dashboard list: visits for lp, scans otherwise');
});

// ── V. Opening the screen creates no visit ──────────────────────
test('V. the screen never requests the public landing page (GET /lp/:slug)', () => {
  // every fetch of a /lp/ address in the page
  const calls = [...page.matchAll(/fetch\(\s*([^,)]*\/lp\/[^,)]*)/g)].map((m) => m[1]);
  assert.ok(calls.length > 0);
  const publicPage = calls.filter((c) => !/\/api\/lp\/|\/lp\/(push|stamp|nfc-token|voice|staff-pin)\b/.test(c));
  assert.deepEqual(publicPage, [], 'no request to the public page itself: ' + publicPage.join(' | '));
  assert.ok(!page.includes('fetch(`https://www.qraivy.com/lp/${pending.slug}`'), 'the old hidden stats request is gone');
});

test('V. the visit count comes with the page record from /api/lp/:slug', () => {
  assert.ok(page.includes("/api/lp/${encodeURIComponent(slug)}`"), 'the page record is loaded as JSON');
  assert.ok(page.includes('scanCount:    data.scanCount'), 'and its visit count is kept');
  assert.ok(page.includes("var sc=document.getElementById('sqd-settings-scans'); if(sc) sc.textContent = pending.scanCount || '—';"), 'settings show it');
  assert.ok(page.includes("if (pending.scanCount != null) document.getElementById('sqd-scans').textContent = pending.scanCount;"));
  const fb = cut('  function fallbackFromLP(', '  window.QRAIVY_MANAGE = {');
  assert.ok(fb.includes("'/api/lp/' + encodeURIComponent(slug)"), 'the fallback reads the JSON record too');
  assert.ok(!/qraivy\.com\/lp\/' \+ slug\)/.test(fb), 'never the public page');
});

test('V. the QR code itself still points to the public page, so real scans keep counting', () => {
  assert.ok(page.includes("window._sqd_hostedUrl = 'https://qraivy.com/lp/' + slug;"));
  assert.ok(page.includes('const hostedUrl = pending.slug ? `https://qraivy.com/lp/${pending.slug}` : pending.hostedUrl;'));
});

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${err.message}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
