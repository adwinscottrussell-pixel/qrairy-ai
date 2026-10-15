// ============================================================
// dealStarterImages.test.js — QRAIVY Deals: starter images on the
// public Deal cards come from our Cloudinary account
// (backend/src/services/dealCards.js).
//
// The catalog is uploaded once per Cloudinary account as
// qraivy-deal-starters/<catalog id>. Before this, the card used the page's
// own site (pageOrigin + /images/deals/starter/...), which on deals-preview
// is behind Vercel's login, so starter pictures stayed blank.
//
// Run: node tests/dealStarterImages.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const cards = require('../src/services/dealCards');
const { DEAL_STARTER_IMAGES } = require('../src/data/dealImages');

const STAGING_CLOUD = 'nantofwm';
const TRANSFORM = 'c_fill,g_auto,h_900,w_1200,f_auto,q_auto';
const IMG = 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1/qraivy-deals-staging/deal-abc-1.jpg';
const SAND = cards.BACKGROUND_CSS.sand, EMBER = cards.BACKGROUND_CSS.ember;
const expected = (cloud, id) => `https://res.cloudinary.com/${cloud}/image/upload/${TRANSFORM}/qraivy-deal-starters/${id}.jpg`;

// Each check runs with exactly the cloud name it names; the original value is put back.
function withCloud(value, fn) {
  const before = process.env.CLOUDINARY_CLOUD_NAME;
  if (value === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = value;
  const restore = () => { if (before === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = before; };
  let out;
  try { out = fn(); } catch (e) { restore(); throw e; }
  if (out && typeof out.then === 'function') return out.finally(restore);
  restore();
  return out;
}
const card = (image, lang = 'de') => cards.renderDealCards([{ title: 'T', offerText: 'O', image }], { lang, pageOrigin: 'https://deals-preview.qraivy.com' });
const imgSrc = (html) => { const m = /<img src="([^"]*)"/.exec(html); return m ? m[1] : null; };

const queue = [];
function test(name, fn) { queue.push([name, fn]); }

// ── V. Valid starter images ─────────────────────────────────────
test('V. every catalog starter becomes our Cloudinary 1200x900 image with automatic format and quality', () => withCloud(STAGING_CLOUD, () => {
  assert.equal(DEAL_STARTER_IMAGES.length, 22);
  for (const s of DEAL_STARTER_IMAGES) {
    const html = card({ source: 'starter', starterId: s.id });
    assert.equal(imgSrc(html), expected(STAGING_CLOUD, s.id), s.id);
    assert.ok(fs.existsSync(path.join(ROOT, 'frontend/public/images/deals/starter', s.id + '.jpg')), 'uploaded from the shipped catalog file: ' + s.id);
  }
}));

test('V. AI-generated starters keep the "AI · KI-generiert" label (DE and EN)', () => withCloud(STAGING_CLOUD, () => {
  assert.ok(DEAL_STARTER_IMAGES.every((s) => s.origin === 'ai_generated'), 'the whole catalog is AI-generated');
  assert.ok(card({ source: 'starter', starterId: 'bakery-coffee-01' }, 'de').includes('<span class="qd-sr">KI-generiertes Bild</span>'));
  assert.ok(card({ source: 'starter', starterId: 'bakery-coffee-01' }, 'en').includes('<span class="qd-sr">AI-generated image</span>'));
}));

test('V. a saved starter deal needs no change: the card is built from the catalog id at render time', async () => {
  // exactly what the QRAIVY Testdeal stores
  const saved = { title: 'QRAIVY Testdeal – 2 für 1', offerText: 'Zwei Kaffees zum Preis von einem', description: null, endsAt: null, image: { source: 'starter', starterId: 'bakery-coffee-01', aiGenerated: true } };
  const service = { activeDealsForPage: async () => [saved] };
  const html = await withCloud(STAGING_CLOUD, () => cards.injectActiveDeals('<body><footer></footer></body>', { slug: 'starter-render-' + Date.now() },
    { env: { DEALS_ON_LANDING_PAGES: '1' }, service, pageOrigin: 'https://deals-preview.qraivy.com' }));
  assert.equal(imgSrc(html), expected(STAGING_CLOUD, 'bakery-coffee-01'));
  assert.ok(!html.includes('deals-preview.qraivy.com'), 'never the login-protected preview site');
  assert.ok(!html.includes('/images/deals/starter/'), 'not the old address');
});

// ── I. Invalid starter ids ──────────────────────────────────────
test('I. anything that is not a catalog id shows the colour, never an <img>', () => withCloud(STAGING_CLOUD, () => {
  const bad = ['', 'unknown-01', '../bakery-coffee-01', 'bakery-coffee-01/../../x', 'BAKERY-COFFEE-01', 'bakery-coffee-01.jpg', 'bakery-coffee-01?x=1',
    'bakery-coffee-01#a', ' bakery-coffee-01', 'https://evil.example.com/a.jpg', 'qraivy-deal-starters/bakery-coffee-01', null, 42, {}, ['bakery-coffee-01']];
  for (const starterId of bad) {
    const html = card({ source: 'starter', starterId });
    assert.ok(!html.includes('<img'), JSON.stringify(starterId));
    assert.ok(html.includes('<div class="qd-media" style="background:' + EMBER + '"></div>'), 'colour fallback: ' + JSON.stringify(starterId));
    assert.ok(!html.includes('AI · KI-generiert'), 'no AI label without a picture: ' + JSON.stringify(starterId));
  }
}));

// ── A. The configured account ───────────────────────────────────
test('A. the cloud name is the configured one: staging nantofwm on deals-preview, another account elsewhere', () => {
  withCloud(STAGING_CLOUD, () => assert.ok(imgSrc(card({ source: 'starter', starterId: 'beauty-spa-01' })).startsWith('https://res.cloudinary.com/nantofwm/image/upload/')));
  withCloud('dwqc6n7rn', () => assert.ok(imgSrc(card({ source: 'starter', starterId: 'beauty-spa-01' })).startsWith('https://res.cloudinary.com/dwqc6n7rn/image/upload/')));
  withCloud('  nantofwm  ', () => assert.equal(imgSrc(card({ source: 'starter', starterId: 'beauty-spa-01' })), expected(STAGING_CLOUD, 'beauty-spa-01'), 'surrounding spaces ignored'));
  withCloud(STAGING_CLOUD, () => {
    const src = imgSrc(card({ source: 'starter', starterId: 'beauty-spa-01' }));
    const u = new URL(src);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.host, 'res.cloudinary.com');
    assert.ok(u.pathname.includes('/qraivy-deal-starters/'), 'the starter folder, outside the cleanup job\'s <folder>/deal-* scope');
  });
});

// ── M. Missing or invalid configuration ─────────────────────────
test('M. without a usable CLOUDINARY_CLOUD_NAME starters show the colour, and the server says why once', () => {
  const warnings = [];
  const warn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  try {
    for (const value of [undefined, '', '   ', 'bad cloud', 'a/b', '../evil', 'x"onerror="y', 'nantofwm.evil.com', '-leading', 'x'.repeat(65)]) {
      withCloud(value, () => {
        const html = card({ source: 'starter', starterId: 'bakery-coffee-01' });
        assert.ok(!html.includes('<img'), JSON.stringify(value));
        assert.ok(html.includes('<div class="qd-media" style="background:' + EMBER + '"></div>'), JSON.stringify(value));
      });
    }
  } finally { console.warn = warn; }
  assert.equal(warnings.length, 1, 'logged once per process, not per page view');
  assert.ok(warnings.every((w) => w.includes('CLOUDINARY_CLOUD_NAME') && !/api_?secret|api_?key/i.test(w)));
});

test('M. missing configuration does not affect uploaded pictures or colours', () => withCloud(undefined, () => {
  assert.equal(imgSrc(card({ source: 'uploaded', url: IMG })), IMG);
  assert.ok(card({ source: 'background', backgroundId: 'ocean' }).includes(cards.BACKGROUND_CSS.ocean));
}));

// ── U. Uploaded and background pictures unchanged ───────────────
test('U. uploaded pictures: same address, same <img>, no AI label, same refusals', () => withCloud(STAGING_CLOUD, () => {
  const html = card({ source: 'uploaded', url: IMG, aiGenerated: true });
  assert.ok(html.includes('<img src="' + IMG + '" alt="" width="1200" height="900" loading="lazy" decoding="async">'));
  assert.ok(!html.includes('AI · KI-generiert'), 'an upload is never labelled AI by the card');
  for (const bad of ['https://evil.example.com/image/upload/v1/a.jpg', 'http://res.cloudinary.com/test-cloud/image/upload/v1/a.jpg', 'javascript:alert(1)']) {
    assert.ok(!card({ source: 'uploaded', url: bad }).includes('<img'), bad);
  }
}));

test('U. background colours and an empty picture are unchanged', () => withCloud(STAGING_CLOUD, () => {
  assert.ok(card({ source: 'background', backgroundId: 'plum' }).includes('<div class="qd-media" style="background:' + cards.BACKGROUND_CSS.plum + '"></div>'));
  assert.ok(card(null).includes('<div class="qd-media" style="background:' + EMBER + '"></div>'));
}));

// ── F. A picture that fails to load ─────────────────────────────
test('F. every picture has a soft colour behind it; the <img> stays, so a failed load still shows in the browser tools', () => withCloud(STAGING_CLOUD, () => {
  for (const image of [{ source: 'starter', starterId: 'travel-greece-01' }, { source: 'uploaded', url: IMG }]) {
    const html = card(image);
    assert.ok(html.includes('<div class="qd-media" style="background:' + SAND + '"><img src="'), image.source);
    assert.ok(!/onerror|display:\s*none/i.test(html.slice(html.indexOf('<div class="qd-media"'), html.indexOf('<div class="qd-body"'))), 'nothing hides or swaps the image');
  }
  assert.notEqual(SAND, '#fff');
}));

(async () => {
  let passed = 0, failed = 0;
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log('PASS  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
