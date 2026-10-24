// ============================================================
// studioDemoImages.test.js — Landing Page Studio V3, Phase 2A-3H: the
// demo Gallery's starter photos (frontend/public/js/studio/studio-demo-images.js).
// - the demo stores the real addresses of the three approved starter images
//   in QRAIVY's Cloudinary account; they pass the unchanged schema, also
//   with the own-account check;
// - only the Studio's displayed HTML swaps exactly these addresses for the
//   byte-identical local copies, each with the "AI · KI-generiert" label;
//   every other image is untouched;
// - nothing leaks: the design, the store's draft and the public render keep
//   the Cloudinary addresses; core.js knows nothing of the local copies;
// - the local copies are the catalogue's starter images (same checksums).
// Run: node tests/studioDemoImages.test.js
// ============================================================
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const V3 = require('../src/lpV3/core');
const DEMO_IMAGES = require('../../frontend/public/js/studio/studio-demo-images.js');
const STORE = require('../../frontend/public/js/studio/studio-store.js');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function demo() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'studio', 'studio-demo.js'), 'utf8'), ctx);
  return JSON.parse(JSON.stringify(ctx.window.QRAIVY_STUDIO_DEMO));
}
const IDS = ['bakery-croissants-01', 'bakery-bread-01', 'bakery-coffee-01'];
const urlOf = (id) => 'https://res.cloudinary.com/dwqc6n7rn/image/upload/c_fill,g_auto,h_900,w_1200,f_auto,q_auto/qraivy-deal-starters/' + id + '.jpg';

test('three approved bakery starter images, at the address the Deals cards use for this account', () => {
  assert.deepEqual(DEMO_IMAGES.STARTERS, IDS);
  for (const id of IDS) assert.equal(DEMO_IMAGES.cloudinaryUrl(id), urlOf(id));
  // the same address builder as dealCards.js (folder and transformation)
  const cards = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'dealCards.js'), 'utf8');
  assert.ok(cards.includes("const STARTER_FOLDER = 'qraivy-deal-starters';") && cards.includes("const STARTER_TRANSFORM = 'c_fill,g_auto,h_900,w_1200,f_auto,q_auto';"));
});

test('the local copies are the catalogue starter images (AI-generated, same checksums)', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'deal-starter-images.js'), 'utf8'), ctx);
  const cat = ctx.window.QRAIVY_DEAL_STARTER_IMAGES.images;
  for (const id of IDS) {
    const e = cat.find((x) => x.id === id);
    assert.ok(e, id + ' in the catalogue');
    assert.equal(e.origin.type, 'ai_generated', id);
    const local = DEMO_IMAGES.localSrc(urlOf(id));
    assert.equal(local, 'images/deals/starter/' + id + '.jpg');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, local))).digest('hex');
    assert.equal(sha, e.origin.sha256, id + ' byte-identical to the approved original');
  }
});

test('the demo design is valid with the schema as it is, also with the own-account check; no local path in it', () => {
  const d = demo().design;
  assert.ok(V3.validateDesign(JSON.parse(JSON.stringify(d))).ok);
  assert.ok(V3.validateDesign(JSON.parse(JSON.stringify(d)), { cloudName: 'dwqc6n7rn' }).ok);
  assert.ok(!/images\/deals\/starter/.test(JSON.stringify(d)), 'the design stores only the Cloudinary addresses');
  const gal = d.pages[0].sections.find((s) => s.type === 'gallery');
  assert.deepEqual(gal.data.images.map((i) => i.image), IDS.map(urlOf));
  assert.ok(gal.data.images.every((i) => i.alt && i.caption), 'every demo image is described and captioned');
});

test('localizeHtml: exactly these addresses become the local copies, each with the AI label; nothing else changes', () => {
  const html = '<html><head><title>x</title></head><body>' +
    IDS.map((id) => '<figure class="v3-gal-item"><img src="' + urlOf(id) + '" alt="a" loading="lazy"></figure>').join('') +
    '<img class="v3-hero-img" src="' + urlOf('bakery-bread-01') + '" alt="h">' +
    '<img src="https://res.cloudinary.com/other/image/upload/x.jpg" alt="o"><img src="' + urlOf('bakery-bread-01').replace('dwqc6n7rn', 'someone') + '" alt="p"></body></html>';
  const out = DEMO_IMAGES.localizeHtml(html);
  for (const id of IDS) assert.ok(out.includes('<span class="st-ai">AI · KI-generiert</span><img src="images/deals/starter/' + id + '.jpg" alt="a"'), id);
  assert.ok(out.includes('<span class="st-ai">AI · KI-generiert</span><img class="v3-hero-img" src="images/deals/starter/bakery-bread-01.jpg"'), 'also with other attributes first');
  assert.ok(out.includes('<img src="https://res.cloudinary.com/other/image/upload/x.jpg" alt="o">'), 'another image stays as it is');
  assert.ok(out.includes('/someone/'), 'another account stays as it is');
  assert.equal((out.match(/class="st-ai"/g) || []).length, 4);
  assert.equal((out.match(/<style>\.st-ai/g) || []).length, 1, 'the label style once, in the head');
  const plain = '<html><head></head><body><img src="https://res.cloudinary.com/x/image/upload/a.jpg"></body></html>';
  assert.equal(DEMO_IMAGES.localizeHtml(plain), plain, 'no starter image: unchanged');
  assert.equal(DEMO_IMAGES.displaySrc('https://res.cloudinary.com/x/image/upload/a.jpg'), 'https://res.cloudinary.com/x/image/upload/a.jpg');
});

test('no leak: the public render and the store draft keep the Cloudinary addresses; core.js never mentions the local copies', () => {
  const d = demo().design;
  const pub = V3.renderDesign(JSON.parse(JSON.stringify(d)), { businessName: 'Musterbäckerei' }).html;
  for (const id of IDS) assert.ok(pub.includes('src="' + urlOf(id) + '"'), id);
  assert.ok(!/images\/deals\/starter|st-ai|KI-generiert/.test(pub), 'nothing from the Studio in the public page');
  const store = STORE.createStore({ design: d, validate: V3.validateDesign });
  store.set('s_gal01', ['data', 'images', 0, 'caption'], 'Neu');
  store.moveItem('s_gal01', ['data', 'images'], 0, 2);
  assert.ok(!/images\/deals\/starter/.test(JSON.stringify(store.draft())));
  for (const f of ['backend/src/lpV3/core.js', 'frontend/public/js/lpV3/core.js']) {
    assert.ok(!/deals\/starter|qraivy-deal-starters|dwqc6n7rn/.test(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8')), f);
  }
  // the swap lives only in the Studio files
  const shell = fs.readFileSync(path.join(PUB, 'js', 'studio', 'studio-shell.js'), 'utf8');
  assert.ok(shell.includes('DEMO_IMAGES.localizeHtml(r.html)'), 'the Studio applies it to what it displays');
});

test('the Studio preview (shell) shows the local copies: the page HTML it builds has no Cloudinary request', () => {
  const d = demo().design;
  const preview = V3.renderDesign(JSON.parse(JSON.stringify(d)), { businessName: 'Musterbäckerei' }, { preview: true }).html;
  const shown = DEMO_IMAGES.localizeHtml(preview);
  assert.ok(!/res\.cloudinary\.com/.test(shown));
  assert.equal((shown.match(/class="st-ai"/g) || []).length, 3);
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
}
console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
process.exit(failed ? 1 : 0);
