// ============================================================
// studioDemoImages.test.js — Landing Page Studio V3, Phase 2A-3H: the
// demo Gallery's starter photos (frontend/public/js/studio/studio-demo-images.js).
// - the demo stores the real addresses of the three approved starter images
//   in QRAIVY's Cloudinary account; they pass the unchanged schema, also
//   with the own-account check;
// - only the Studio's displayed HTML swaps exactly these addresses: the
//   preview frames get inline photos prepared from the byte-identical local
//   copies by the Studio page (the frames are sandboxed, so a file path
//   would miss the private preview's sign-in cookie; live bug 2026-10-24),
//   each with the "AI · KI-generiert" label, and a neutral placeholder until
//   then or on failure; every other image is untouched;
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

// a fresh copy of the module (prepare() runs once per page)
function fresh() {
  const f = require.resolve('../../frontend/public/js/studio/studio-demo-images.js');
  delete require.cache[f];
  return require(f);
}
const JPEG = (n) => 'data:image/jpeg;base64,' + Buffer.from('photo-' + n).toString('base64');
const SAMPLE = '<html><head><title>x</title></head><body>' +
  IDS.map((id) => '<figure class="v3-gal-item"><img src="' + urlOf(id) + '" alt="a" loading="lazy"></figure>').join('') +
  '<img class="v3-hero-img" src="' + urlOf('bakery-bread-01') + '" alt="h">' +
  '<img src="https://res.cloudinary.com/other/image/upload/x.jpg" alt="o"><img src="' + urlOf('bakery-bread-01').replace('dwqc6n7rn', 'someone') + '" alt="p"></body></html>';

test('frame HTML before the photos are ready: a neutral placeholder (inline SVG), no label, no photo address at all; other images untouched', () => {
  const D = fresh();
  const out = D.localizeHtml(SAMPLE);
  assert.equal((out.match(/src="data:image\/svg\+xml,[^"]*" data-st-placeholder="1"/g) || []).length, 4);
  assert.ok(!/images\/deals\/starter|dwqc6n7rn|class="st-ai"/.test(out), 'no file path, no starter address, no label');
  assert.ok(out.includes('<img src="https://res.cloudinary.com/other/image/upload/x.jpg" alt="o">'), 'another image stays as it is');
  assert.ok(out.includes('/someone/'), 'another account stays as it is');
  assert.ok(!D.PLACEHOLDER.includes('"'), 'the placeholder needs no quoting inside src=""');
  const plain = '<html><head></head><body><img src="https://res.cloudinary.com/x/image/upload/a.jpg"></body></html>';
  assert.equal(D.localizeHtml(plain), plain, 'no starter image: unchanged');
  assert.equal(D.displaySrc('https://res.cloudinary.com/x/image/upload/a.jpg'), 'https://res.cloudinary.com/x/image/upload/a.jpg');
});

test('prepare(): each photo loaded from its local copy; once ready, the frame gets the inline photo with the AI label; onReady once', () => {
  const D = fresh();
  const asked = [];
  let ready = 0;
  D.prepare(() => { ready++; }, (src, done) => { asked.push(src); done(JPEG(asked.length)); });
  D.prepare(() => { ready++; }, () => { throw new Error('prepared twice'); });
  assert.deepEqual(asked, IDS.map((id) => 'images/deals/starter/' + id + '.jpg'), 'the local copies, loaded by the Studio page');
  assert.equal(ready, 1);
  assert.deepEqual(D.status(), { started: true, ready: 3, failed: 0 });
  const out = D.localizeHtml(SAMPLE);
  IDS.forEach((id, i) => assert.ok(out.includes('<span class="st-ai">AI · KI-generiert</span><img src="' + JPEG(i + 1) + '" alt="a"'), id));
  assert.ok(out.includes('<span class="st-ai">AI · KI-generiert</span><img class="v3-hero-img" src="' + JPEG(2) + '"'), 'also with other attributes first');
  assert.equal((out.match(/class="st-ai"/g) || []).length, 4);
  assert.equal((out.match(/<style>\.st-ai/g) || []).length, 1, 'the label style once, in the head');
  assert.ok(!/images\/deals\/starter|dwqc6n7rn/.test(out));
});

test('prepare(): a photo that cannot be loaded, or anything but an image data URL, keeps its placeholder; none ready -> no onReady; no details exposed', () => {
  const D = fresh();
  let ready = 0, n = 0;
  const bad = [null, 'javascript:alert(1)', 'data:text/html;base64,PGI+'];
  D.prepare(() => { ready++; }, (src, done) => done(bad[n++]));
  assert.equal(ready, 0, 'nothing to show: no re-render');
  assert.deepEqual(D.status(), { started: true, ready: 0, failed: 3 });
  const out = D.localizeHtml(SAMPLE);
  assert.equal((out.match(/data-st-placeholder="1"/g) || []).length, 4);
  assert.ok(!/javascript:|text\/html|class="st-ai"/.test(out));
  // one of three fails: the other two show, the failed one keeps the placeholder
  const D2 = fresh();
  let r2 = 0, k = 0;
  D2.prepare(() => { r2++; }, (src, done) => { k++; done(k === 2 ? null : JPEG(k)); });
  assert.equal(r2, 1);
  const o2 = D2.localizeHtml(SAMPLE);
  assert.equal((o2.match(/class="st-ai"/g) || []).length, 2, 'croissants and coffee (the bread twice would be 3)');
  assert.ok(o2.includes(JPEG(1)) && o2.includes(JPEG(3)) && /data-st-placeholder="1"/.test(o2));
  // the browser loader never logs or throws details
  const src = fs.readFileSync(path.join(PUB, 'js', 'studio', 'studio-demo-images.js'), 'utf8');
  assert.ok(!/console\.|fetch\(|XMLHttpRequest/.test(src), 'no logging, no fetch');
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

test('the Studio preview (shell): the page HTML it builds has no Cloudinary address and no file path; the shell prepares the photos and re-renders once', () => {
  const D = fresh();
  let k = 0;
  D.prepare(() => {}, (src, done) => done(JPEG(++k)));
  const d = demo().design;
  const preview = V3.renderDesign(JSON.parse(JSON.stringify(d)), { businessName: 'Musterbäckerei' }, { preview: true }).html;
  const shown = D.localizeHtml(preview);
  assert.ok(!/res\.cloudinary\.com|images\/deals\/starter/.test(shown));
  assert.equal((shown.match(/class="st-ai"/g) || []).length, 3);
  const shell = fs.readFileSync(path.join(PUB, 'js', 'studio', 'studio-shell.js'), 'utf8');
  assert.ok(shell.includes('if (DEMO_IMAGES.prepare) DEMO_IMAGES.prepare(function () { preview.setHtml(pageHtml(), 0); });'));
  // the preview frames stay sandboxed with scripts only (never same origin)
  const prev = fs.readFileSync(path.join(PUB, 'js', 'studio', 'studio-preview.js'), 'utf8');
  assert.ok(/var SANDBOX = 'allow-scripts';/.test(prev), 'sandbox unchanged');
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
}
console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
process.exit(failed ? 1 : 0);
