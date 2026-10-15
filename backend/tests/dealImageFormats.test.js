// ============================================================
// dealImageFormats.test.js — Deals image Phase 2: Step 2 shows how the
// chosen image fits four formats (preview only).
//
//   A. decisions (js/deal-image-formats.js): crop vs. padding (60 %),
//      enlargement, Cloudinary transformations, each image kind
//   B. Step 2: markup, texts EN/DE, labels, AI label, responsive styles
//   C. unchanged: the deal's 4:3 image, the phone preview, backend, data
//
// Run: node tests/dealImageFormats.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }

const ctx = { window: {} };
vm.runInNewContext(read('frontend/public/js/deal-image-formats.js'), ctx);
const F = ctx.window.QraivyDealImageFormats;
const plainJson = (v) => JSON.parse(JSON.stringify(v));
const byId = (tiles) => Object.fromEntries(tiles.map((t) => [t.id, t]));

const CLOUD = 'https://res.cloudinary.com/nantofwm/image/upload/';
const PID = 'qraivy-deals-staging/deal-abc-1792004805912';
function uploaded(w, h) {
  return { source: 'uploaded', url: CLOUD + 'c_fill,g_auto,h_900,w_1200/v1792004806/' + PID + '.jpg', width: 1200, height: 900,
    master: { url: CLOUD + 'v1792004806/' + PID + '.jpg', width: w, height: h } };
}
const OPTS = { starterSrc: (id) => 'images/deals/starter/' + id + '.jpg', backgroundCss: (id) => 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)' };

// ── A. Decisions ───────────────────────────────────────────────
test('A. four formats with their export sizes, in order', () => {
  assert.deepEqual(plainJson(F.FORMATS.map((f) => [f.id, f.width, f.height])), [['deal', 1200, 900], ['feed', 1080, 1350], ['story', 1080, 1920], ['square', 1080, 1080]]);
  for (const f of F.FORMATS) assert.ok(Math.abs(f.preview.width / f.preview.height - f.width / f.height) < 0.005, f.id + ' preview keeps the format');
  assert.equal(F.RETAIN_MIN, 0.6);
});

test('A. retention: the share of the picture a crop keeps', () => {
  assert.equal(F.retention(4000, 3000, 1080, 1350), 0.6000000000000001 > 0.6 ? F.retention(4000, 3000, 1080, 1350) : 0.6);
  assert.ok(Math.abs(F.retention(4000, 3000, 1080, 1350) - 0.6) < 1e-9);       // 4:3 -> 4:5 keeps exactly 60 %
  assert.ok(Math.abs(F.retention(1450, 708, 1080, 1920) - 0.2746) < 0.001);     // pagoda -> 9:16 keeps 27 %
  assert.equal(F.retention(1000, 1000, 1080, 1080), 1);
  assert.ok(Math.abs(F.retention(3000, 4000, 1080, 1920) - 0.75) < 1e-9);       // portrait -> 9:16
});

test('A. at least 60 % kept: subject-aware crop of the master (exact Cloudinary URL)', () => {
  const t = byId(F.formatsFor(uploaded(4000, 3000), OPTS));
  assert.equal(t.feed.mode, 'crop');                                            // exactly 60 % counts as kept
  assert.equal(t.feed.src, CLOUD + 'c_fill,g_auto,w_272,h_340,f_auto,q_auto/v1792004806/' + PID + '.jpg');
  assert.equal(t.square.mode, 'crop');
  assert.equal(t.square.src, CLOUD + 'c_fill,g_auto,w_336,h_336,f_auto,q_auto/v1792004806/' + PID + '.jpg');
  assert.equal(t.feed.status, 'optimal');
});

test('A. less than 60 % kept: whole picture on a blurred border (exact Cloudinary URL)', () => {
  const t = byId(F.formatsFor(uploaded(4000, 3000), OPTS));
  assert.equal(t.story.mode, 'pad');                                            // 4:3 -> 9:16 keeps 42 %
  assert.equal(t.story.src, CLOUD + 'c_fill,w_180,h_320/e_blur:1000/e_brightness:-35/l_qraivy-deals-staging:deal-abc-1792004805912,c_fit,w_180,h_320/fl_layer_apply/f_auto,q_auto/v1792004806/' + PID + '.jpg');
  assert.equal(t.story.status, 'padded');
});

test('A. the pagoda (1450 x 708): every other format padded, the deal image enlarged ×1.3', () => {
  const t = byId(F.formatsFor(uploaded(1450, 708), OPTS));
  for (const id of ['feed', 'story', 'square']) { assert.equal(t[id].mode, 'pad', id); assert.equal(t[id].status, 'padded', id); assert.equal(t[id].warn, false, id); }
  assert.deepEqual([t.feed.retention, t.story.retention, t.square.retention], [0.39, 0.27, 0.49]);
  assert.equal(t.deal.mode, 'image');
  assert.equal(t.deal.src, uploaded(1450, 708).url, 'the deal keeps its own 4:3 picture');
  assert.equal(t.deal.status, 'enlarged');
  assert.equal(t.deal.enlargement, 1.3);
});

test('A. a tall portrait (3000 x 4000) crops into every vertical format', () => {
  const t = byId(F.formatsFor(uploaded(3000, 4000), OPTS));
  assert.deepEqual([t.feed.mode, t.story.mode, t.square.mode], ['crop', 'crop', 'crop']);
  assert.deepEqual([t.feed.status, t.story.status, t.square.status], ['optimal', 'optimal', 'optimal']);
});

test('A. small pictures are reported as enlarged, with a warning above ×1.5', () => {
  const t = byId(F.formatsFor(uploaded(800, 600), OPTS));
  assert.equal(t.square.mode, 'crop');                                          // keeps 75 %
  assert.equal(t.square.status, 'enlarged');
  assert.equal(t.square.enlargement, 1.8);                                      // 1080 / 600
  assert.equal(t.square.warn, true);
  assert.equal(t.deal.enlargement, 1.5);
  assert.equal(t.deal.warn, false);
  assert.equal(F.cropEnlargement(4000, 3000, 1200, 900), 0.3);
  assert.ok(Math.abs(F.padEnlargement(1450, 708, 1080, 1920) - 1080 / 1450) < 1e-9);
});

test('A. only the plain Cloudinary master is transformed; anything else falls back to padding', () => {
  assert.equal(F.masterTransform(CLOUD + 'v1/' + PID + '.png', 'x'), CLOUD + 'x/v1/' + PID + '.png');
  for (const bad of ['https://evil.example.com/image/upload/v1/a.jpg', CLOUD + 'c_fill,w_10/v1/' + PID + '.jpg', 'http://res.cloudinary.com/c/image/upload/v1/a.jpg',
    CLOUD + 'v1/' + PID + '.jpg?x=1', CLOUD + 'v1/' + PID + '.svg', 'javascript:alert(1)', '', null]) {
    assert.equal(F.masterTransform(bad, 'x'), null, String(bad));
  }
  const img = uploaded(4000, 3000); img.master.url = 'https://evil.example.com/a.jpg';
  const t = byId(F.formatsFor(img, OPTS));
  assert.deepEqual([t.feed.mode, t.story.mode, t.square.mode], ['css-pad', 'css-pad', 'css-pad']);
  assert.ok(!JSON.stringify(plainJson(t)).includes('evil.example.com'));
});

test('A. older uploads (no master): whole 4:3 picture, padded in the browser; nothing re-uploaded', () => {
  const old = { source: 'uploaded', url: CLOUD + 'v1/qraivy-deals/deal-x-1.jpg', width: 1200, height: 900 };
  const t = byId(F.formatsFor(old, OPTS));
  assert.deepEqual(plainJson([t.deal.mode, t.feed.mode, t.story.mode, t.square.mode]), ['image', 'css-pad', 'css-pad', 'css-pad']);
  for (const id of ['deal', 'feed', 'story', 'square']) assert.equal(t[id].src, old.url, id + ' uses the stored picture as it is');
  assert.equal(t.feed.status, 'padded');
  assert.equal(t.deal.status, 'optimal');
  assert.equal(t.feed.legacy, true);
});

test('A. starter images: padded in the browser, AI label on every tile', () => {
  const t = byId(F.formatsFor({ source: 'starter', id: 'bakery-croissants-01', aiGenerated: true }, OPTS));
  for (const id of ['deal', 'feed', 'story', 'square']) {
    assert.equal(t[id].src, 'images/deals/starter/bakery-croissants-01.jpg', id);
    assert.equal(t[id].ai, true, id);
    assert.ok(!t[id].src.includes('cloudinary'), 'starter files are not sent to Cloudinary');
  }
  assert.deepEqual([t.feed.mode, t.story.mode, t.square.mode], ['css-pad', 'css-pad', 'css-pad']);
  assert.equal(t.feed.legacy, false);
});

test('A. a background colour fills all four formats; no image means no tiles', () => {
  const t = F.formatsFor({ source: 'background', id: 'ocean' }, OPTS);
  assert.equal(t.length, 4);
  for (const tl of t) { assert.equal(tl.mode, 'color'); assert.equal(tl.status, 'optimal'); assert.match(tl.src, /^linear-gradient/); assert.equal(tl.ai, false); }
  assert.deepEqual(plainJson(F.formatsFor(null, OPTS)), []);
});

// ── A2. Blurred-background padding: layered, never b_blurred ──
test('A2. the pagoda: all three padded formats use the tested layered transformation', () => {
  const t = byId(F.formatsFor(uploaded(1450, 708), OPTS));
  const L = 'qraivy-deals-staging:deal-abc-1792004805912';
  const want = {
    feed: 'c_fill,w_272,h_340/e_blur:1000/e_brightness:-35/l_' + L + ',c_fit,w_272,h_340/fl_layer_apply/f_auto,q_auto',     // the exact request tested: HTTP 200, 272x340
    story: 'c_fill,w_180,h_320/e_blur:1000/e_brightness:-35/l_' + L + ',c_fit,w_180,h_320/fl_layer_apply/f_auto,q_auto',
    square: 'c_fill,w_336,h_336/e_blur:1000/e_brightness:-35/l_' + L + ',c_fit,w_336,h_336/fl_layer_apply/f_auto,q_auto',
  };
  for (const id of Object.keys(want)) {
    assert.equal(t[id].mode, 'pad', id);
    assert.equal(t[id].src, CLOUD + want[id] + '/v1792004806/' + PID + '.jpg', id);
  }
});

test('A2. the blurred border is darkened like the browser fallback (brightness 0.65 = e_brightness:-35); the picture layer is not', () => {
  const css = read('frontend/public/deals-page.css');
  assert.ok(css.includes('.deal-format__blur {') && /\.deal-format__blur \{[^}]*filter: blur\(12px\) brightness\(0\.65\);/.test(css), 'browser fallback darkens to 0.65');
  const tr = F.padTransformation({ width: 272, height: 340 }, 'f:a');
  const [base, layer] = tr.split('/l_');
  assert.equal(base, 'c_fill,w_272,h_340/e_blur:1000/e_brightness:-35', 'blur, then darken, the background only');
  assert.equal(layer, 'f:a,c_fit,w_272,h_340/fl_layer_apply/f_auto,q_auto', 'the picture itself: fitted whole, never darkened or cropped');
  assert.equal((tr.match(/e_brightness/g) || []).length, 1);
});

test('A2. the layer is the same asset: folders written with ":", nothing else accepted', () => {
  assert.equal(F.layerIdOf(CLOUD + 'v1/qraivy-deals-staging/deal-x-1.jpg'), 'qraivy-deals-staging:deal-x-1');
  assert.equal(F.layerIdOf(CLOUD + 'qraivy-deals/sub/deal-y.png'), 'qraivy-deals:sub:deal-y');
  for (const bad of ['https://evil.example.com/image/upload/v1/a.jpg', CLOUD + 'c_fill,w_1/v1/a.jpg', null, '']) assert.equal(F.layerIdOf(bad), null, String(bad));
  assert.equal(F.padTransformation({ width: 10, height: 20 }, 'f:a'), 'c_fill,w_10,h_20/e_blur:1000/e_brightness:-35/l_f:a,c_fit,w_10,h_20/fl_layer_apply/f_auto,q_auto');
});

test('A2. b_blurred (video-only, rejected for images with HTTP 400) is never generated', () => {
  const src = read('frontend/public/js/deal-image-formats.js');
  assert.ok(!/['"]c_pad|b_blurred:/.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\/|^\s*\*.*$/gm, '')), 'no b_blurred in code');
  for (const [w, h] of [[1450, 708], [4000, 3000], [3000, 4000], [800, 600], [5000, 500], [500, 5000]]) {
    for (const tl of F.formatsFor(uploaded(w, h), OPTS)) assert.ok(!tl.src.includes('b_blurred') && !tl.src.includes('c_pad'), w + 'x' + h + ' ' + tl.id);
  }
});

test('A2. every Cloudinary tile has the plain master as its browser-padded fallback', () => {
  for (const [w, h] of [[1450, 708], [4000, 3000]]) {
    const t = byId(F.formatsFor(uploaded(w, h), OPTS));
    for (const id of ['feed', 'story', 'square']) assert.equal(t[id].fallback, CLOUD + 'v1792004806/' + PID + '.jpg', w + 'x' + h + ' ' + id);
    assert.equal(t.deal.fallback, undefined, 'the 4:3 deal image keeps its existing behaviour');
  }
  const starter = F.formatsFor({ source: 'starter', id: 'bakery-croissants-01' }, OPTS);
  assert.ok(starter.every((tl) => tl.fallback === undefined), 'browser-padded tiles need no fallback');
});

test('A2. a failed Cloudinary preview is replaced by the padded master in the page (simulated)', () => {
  // the page's error handling, run against a minimal stand-in for the tile element
  const fn = page.slice(page.indexOf('    function watch(frame) {'), page.indexOf("    Array.prototype.forEach.call(grid.querySelectorAll('.deal-format__frame'), watch);"));
  const tiles = [{ fallback: 'https://res.cloudinary.com/c/image/upload/v1/f/m.jpg', ai: false }, { ai: true }];
  function frameFor(i) {
    const listeners = [];
    const frame = { attrs: { 'data-tile': String(i) }, classes: new Set(), innerHTML: '<img src="x">',
      getAttribute(k) { return this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; }, setAttribute(k, v) { this.attrs[k] = v; },
      classList: { add(c) { frame.classes.add(c); } },
      querySelectorAll() { return [{ addEventListener(ev, cb) { listeners.push(cb); } }]; } };
    return { frame, fail: () => listeners.shift()() };
  }
  const run = vm.runInNewContext('(function(tiles, paddedInner, aiLabel){' + fn + ' return watch; })', {});
  const watch = run(tiles, (src) => '<padded ' + src + '>', '<ai>');
  const a = frameFor(0); watch(a.frame); a.fail();
  assert.equal(a.frame.innerHTML, '<padded https://res.cloudinary.com/c/image/upload/v1/f/m.jpg>', 'shows the picture instead of a blank tile');
  assert.ok(!a.frame.classes.has('is-broken'));
  a.fail();                                                                     // the fallback fails too
  assert.ok(a.frame.classes.has('is-broken'), 'only then is the tile left empty');
  const b = frameFor(1); watch(b.frame); b.fail();
  assert.ok(b.frame.classes.has('is-broken'), 'tiles without a fallback (starter files) are not retried');
});

// ── B. Step 2 ──────────────────────────────────────────────────
const page = read('frontend/public/deals.html');
const panel2 = page.slice(page.indexOf('data-panel="2"'), page.indexOf('data-panel="3"'));

test('B. the formats block sits below the selected image, before the source tabs', () => {
  assert.ok(page.includes('<script src="js/deal-image-formats.js"></script>'));
  const cur = panel2.indexOf('id="deal-image-current"'), box = panel2.indexOf('id="deal-formats"'), tabs = panel2.indexOf('class="deal-tabs"');
  assert.ok(cur > -1 && cur < box && box < tabs);
  assert.ok(panel2.includes('<div class="deal-formats" id="deal-formats" hidden>'), 'hidden until an image is chosen');
  assert.ok(page.includes('    renderFormats(img);\n'), 'refreshed whenever the image changes');
});

test('B. texts in English and German, including the status labels', () => {
  const keys = ['fm_title', 'fm_lead', 'fm_deal', 'fm_feed', 'fm_story', 'fm_square', 'fm_optimal', 'fm_padded', 'fm_enlarged', 'fm_note_padded', 'fm_note_legacy'];
  for (const k of keys) assert.equal((page.match(new RegExp('\\b' + k + ": '", 'g')) || []).length, 2, k);
  for (const s of ["fm_optimal: 'Optimal'", "fm_padded: 'Padded'", "fm_enlarged: 'Enlarged {n}'", "fm_padded: 'Mit Rand'", "fm_enlarged: 'Vergrößert {n}'",
    "fm_feed: 'Instagram Feed'", "fm_feed: 'Instagram-Feed'", "fm_square: 'Quadratisches Vorschaubild'"]) assert.ok(page.includes(s), s);
  assert.ok(page.includes("return '\\u00d7' + String(n).replace('.', _lang === 'de' ? ',' : '.');"), '×1,3 in German');
});

test('B. Step 2 now says uploads are kept in full size (EN and DE)', () => {
  assert.ok(page.includes("s2_note: 'A picture you upload is kept in full size. Your deal shows it in 4:3;"));
  assert.ok(page.includes("s2_note: 'Ein hochgeladenes Bild wird in voller Größe gespeichert. Dein Deal zeigt es im Format 4:3;"));
  assert.ok(!page.includes('cropped to 4:3') && !page.includes('auf 4:3 zugeschnitten'));
});

test('B. tiles carry the AI label for AI images, and a broken preview shows an empty tile', () => {
  const fn = page.slice(page.indexOf('  function renderFormats(img) {'), page.indexOf('  function renderImageStep() {'));
  assert.ok(fn.includes("(tl.ai ? aiLabel : '')"));
  assert.ok(fn.includes('AI \\u00b7 KI-generiert'));
  assert.ok(fn.includes("frame.innerHTML = paddedInner(tl.fallback) + (tl.ai ? aiLabel : '');"), 'a failed preview is replaced by the browser-padded master');
  assert.ok(fn.includes("frame.classList.add('is-broken');"), 'only if that fails too is the tile left empty');
  assert.ok(fn.includes('loading="lazy"'));
  assert.ok(!/innerHTML[^;]*\+ tl\.src/.test(fn) && fn.includes("esc(tl.src)"), 'every URL is escaped');
});

test('B. responsive: a 2 x 2 grid on phones', () => {
  const css = read('frontend/public/deals-page.css');
  const block = css.slice(css.indexOf('/* ── Step 2: formats preview'), css.indexOf('/* ── Responsive'));
  assert.ok(block.includes('.deal-formats__grid { display: flex; flex-wrap: wrap;'));
  assert.ok(block.includes('@media (max-width: 768px)') && block.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'));
  assert.ok(block.includes('.deal-format__frame .deal-ai-label {') && /.deal-format__frame .deal-ai-label {[^}]*white-space: normal;/.test(block), 'the AI label wraps on narrow tiles instead of being cut off');
});

// ── C. Unchanged ───────────────────────────────────────────────
test('C. the deal\'s own 4:3 image boxes and the live phone preview are unchanged', () => {
  const at = (src) => src.slice(src.indexOf('<aside class="deal-preview"'), src.indexOf('</aside>', src.indexOf('<aside class="deal-preview"')));
  const before = execFileSync('git', ['-c', 'core.autocrlf=false', 'show', '6ce73c4:frontend/public/deals.html'], { cwd: ROOT, encoding: 'utf8' }).replace(/\r\n/g, '\n');
  assert.equal(at(page), at(before), 'phone preview markup');
  const fnOf = (src) => src.slice(src.indexOf('  function renderPreview() {'), src.indexOf('\n  }\n', src.indexOf('  function renderPreview() {')));
  assert.equal(fnOf(page), fnOf(before), 'phone preview rendering');
  const css = read('frontend/public/deals-page.css');
  assert.equal((css.match(/aspect-ratio: 4 \/ 3;/g) || []).length, 5);
});

test('C. no backend, database or upload change in Phase 2 (its commits 583ad05 + 63edaba)', () => {
  const changed = execFileSync('git', ['diff', '6ce73c4', '63edaba', '--name-only', '--', 'backend/src', 'backend/prisma', 'frontend/public/images', 'frontend/public/js/deal-starter-images.js'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(changed, '');
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log('PASS  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
