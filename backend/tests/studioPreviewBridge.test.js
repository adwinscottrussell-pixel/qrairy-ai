// ============================================================
// studioPreviewBridge.test.js — Landing Page Studio V3, Phase 2A-3A: the
// preview frame and its message bridge (frontend/public/js/studio/
// studio-preview.js).
// - preview frames: sandbox="allow-scripts" only, never allow-same-origin
//   (or popups, forms, top navigation); the full-size preview: no
//   permissions at all;
// - the scripts in a preview frame are FRAME_SCRIPT (fixed text, added by
//   the Studio, never part of a public page) and, only on a page with a
//   Gallery carousel, the trusted first-party controller gallery-nav.js
//   (its own code, refused if it could break out of its element; it reads
//   no owner text, makes no requests, sends no messages); owner text stays
//   escaped and can never add or trigger a script;
// - the Studio accepts exactly { type: 'select', id } and
//   { type: 'scroll', y } from its own frames; nothing else.
// Run: node tests/studioPreviewBridge.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const V3 = require('../src/lpV3/core');
const PV = require('../../frontend/public/js/studio/studio-preview.js');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
// LF line endings (a git checkout on Windows may give CRLF)
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const design = (data) => ({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_hero01', type: 'hero', data: Object.assign({ headline: 'H' }, data) }] }] });

test('sandbox: preview frames allow scripts only; nothing in the Studio grants same-origin, popups, forms or navigation', () => {
  assert.equal(PV.SANDBOX, 'allow-scripts');
  const src = read('js/studio/studio-preview.js');
  assert.equal((src.match(/setAttribute\('sandbox'/g) || []).length, 1);
  assert.ok(src.includes("ifr.setAttribute('sandbox', SANDBOX);"));
  for (const f of ['studio.html'].concat(fs.readdirSync(path.join(PUB, 'js', 'studio')).map((x) => 'js/studio/' + x))) {
    const code = f.endsWith('.js') ? read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '') : read(f); // code, not the comments explaining the rule
    assert.ok(!/allow-same-origin|allow-popups|allow-forms|allow-top-navigation|allow-modals|allow-downloads/.test(code), f);
  }
  assert.match(read('studio.html'), /<iframe class="st-full__frame" id="st-full-frame" sandbox="" title="Preview" referrerpolicy="no-referrer"><\/iframe>/);
});

test('FRAME_SCRIPT is fixed text with no owner data; it is the only script in the preview', () => {
  const hostile = '</script><script>alert(1)</script><img src=x onerror=alert(2)>"\'';
  const a = V3.renderDesign(design({ eyebrow: '<img src=x onerror=alert(2)>', subheadline: hostile }), { businessName: hostile }, { preview: true });
  const b = V3.renderDesign(design({}), { businessName: 'X' }, { preview: true });
  assert.ok(a.ok && b.ok);
  const pa = PV.previewHtml(a.html), pb = PV.previewHtml(b.html);
  assert.equal(pa, a.html.replace('</body></html>', PV.FRAME_SCRIPT + '</body></html>'));
  assert.equal((pa.match(/<script/gi) || []).length, 1, 'one script: the Studio\'s');
  assert.equal((pb.match(/<script/gi) || []).length, 1);
  assert.ok(pa.includes('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;'), 'owner text escaped');
  assert.ok(!/<img src=x/i.test(pa) && !/\sonerror=/i.test(pa.replace(/&lt;[^]*?&gt;/g, '')));
  assert.ok(!/s_hero01|alert|Musterb/.test(PV.FRAME_SCRIPT), 'no design data in the script');
  // the public page never gets it
  const pub = V3.renderDesign(design({}), { businessName: 'X' });
  assert.ok(!pub.html.includes('<script') && !pub.html.includes('data-v3-id'));
  assert.equal(PV.previewHtml('<p>not a page</p>'), '');
  assert.equal(PV.previewHtml(null), '');
});

// 2A-3H: the Gallery's previous / next buttons (rendered hidden by core.js)
// are run by the trusted controller js/lpV3/gallery-nav.js
test('the Gallery controller: one implementation; what the frames run is its own text, byte for byte; only on a carousel page; refused if it could break out', () => {
  const crypto = require('crypto');
  const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const FILE = path.join(PUB, 'js', 'lpV3', 'gallery-nav.js');
  const file = fs.readFileSync(FILE, 'utf8'); // the authoritative implementation, as on disk
  const NAV = require('../../frontend/public/js/lpV3/gallery-nav.js');
  // source integrity: toString() of the fixed function is an exact slice of the file (once), plus the fixed call
  const fn = NAV.init.toString();
  assert.ok(fn.startsWith('function galleryNav(doc, win) {') && fn.endsWith('}'), 'the controller function itself');
  assert.equal(file.split(fn).length, 2, 'its text appears in the file exactly once, byte for byte');
  assert.equal(NAV.source, '(' + fn + ')(document, window);', 'source = that text + the fixed call, nothing else');
  assert.equal(sha(NAV.source.slice(1, -'(document, window);'.length - 1)), sha(file.slice(file.indexOf(fn), file.indexOf(fn) + fn.length)), 'same bytes as the file');
  // toString() only on this one fixed function; no eval / Function constructor here or in the Studio
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.deepEqual(code(file).match(/toString\(/g), ['toString('], 'one toString() call');
  assert.ok(code(file).includes("source: '(' + galleryNav.toString() + ')(document, window);'"), '... on galleryNav only');
  const studioFiles = ['studio.html'].concat(fs.readdirSync(path.join(PUB, 'js', 'studio')).map((x) => 'js/studio/' + x));
  for (const t of [file].concat(studioFiles.map(read))) assert.ok(!/\beval\s*\(|new\s+Function|\bFunction\s*\(/.test(code(t)), 'no eval, no Function constructor');
  for (const x of studioFiles) assert.ok(!/toString\s*\(/.test(code(read(x))), x + ': no toString() in the Studio (it only passes the verified source on)');
  // not duplicated: the controller's code exists only in gallery-nav.js
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const holders = walk(path.join(PUB, 'js')).concat(walk(path.join(__dirname, '..', 'src'))).filter((p) => /\.js$/.test(p) && /function galleryNav|setAttribute\('data-nav', 'on'\)|\.v3-gal-prev'\), next = wrap/.test(fs.readFileSync(p, 'utf8')));
  assert.deepEqual(holders.map((p) => path.relative(PUB, p).split(path.sep).join('/')), ['js/lpV3/gallery-nav.js'], 'one implementation');
  // what it does: structure only, no HTML strings, no network, no messages, no storage, no navigation
  const body = code(fn);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|fetch\(|XMLHttpRequest|WebSocket|postMessage|localStorage|sessionStorage|cookie|location|open\(/.test(body));
  assert.ok(/'\.v3-gal-wrap'/.test(body) && /'\.v3-gal-carousel'/.test(body) && !/getAttribute\('aria-label'\)|textContent|innerText/.test(body), 'reads fixed class names, never owner text');
  assert.ok(!/<\/script|<script|<!--/i.test(NAV.source), 'cannot close or comment out its element');
  // the frames: FRAME_SCRIPT, then exactly that source; only on a carousel page; refused text changes nothing
  const page = (variant, title) => V3.renderDesign({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_gal01', type: 'gallery', variant, data: { title,
    images: ['a', 'b', 'c'].map((n) => ({ image: 'https://res.cloudinary.com/demo/image/upload/v1/' + n + '.jpg', alt: n })) } }] }] }, { businessName: 'X' }, { preview: true }).html;
  const carousel = page('carousel', 'Fotos'), grid = page('grid', '<div class="v3-gal-wrap"></script><script>alert(1)</script>');
  assert.ok(!/<script/i.test(carousel) && !/<script/i.test(grid), 'core.js renders no script');
  const framed = PV.previewHtml(carousel, NAV.source);
  assert.equal(framed, carousel.replace('</body></html>', PV.FRAME_SCRIPT + '<script>' + NAV.source + '</script></body></html>'));
  assert.equal(sha(framed.slice(framed.lastIndexOf('<script>') + 8, framed.lastIndexOf('</script>'))), sha(NAV.source), 'the frame runs exactly the verified source');
  assert.equal(PV.previewHtml(grid, NAV.source), PV.previewHtml(grid), 'no carousel: no controller (owner text that looks like the marker is escaped)');
  for (const bad of ['x</script><script>alert(1)', 'a<!--', '<script>', 42, null, '', 'x'.repeat(20000)]) assert.equal(PV.previewHtml(carousel, bad), PV.previewHtml(carousel), 'refused: ' + String(bad).slice(0, 20));
  assert.equal(PV.previewHtml(carousel), carousel.replace('</body></html>', PV.FRAME_SCRIPT + '</body></html>'), 'without the controller: as before');
  // wiring: studio.html loads the file; the shell hands its source to the preview once; every frame (re)load includes it; no network
  const pv = read('js/studio/studio-preview.js'), shell = read('js/studio/studio-shell.js');
  assert.ok(read('studio.html').includes('<script src="js/lpV3/gallery-nav.js"></script>'));
  assert.ok(shell.includes('if (window.QraivyGalleryNav) preview.setNavScript(window.QraivyGalleryNav.source);') && !/\bfetch\s*\(/.test(shell));
  assert.ok(pv.includes('function setNavScript(text) {') && pv.includes('if (!navTag(text) || text === state.nav) return;'), 'only acceptable text is kept');
  assert.equal((pv.match(/previewHtml\(state\.html, state\.nav\)|previewHtml\(html, state\.nav\)/g) || []).length, 3, 'every (re)load of a frame includes it');
  assert.ok(!/gallery-nav/.test(PV.FRAME_SCRIPT), 'the frames load no file');
  assert.ok(shell.includes("$('st-full-frame').srcdoc = pageHtml();"), 'the full-size preview stays the plain page: no script');
});

test('FRAME_SCRIPT only reports selections and scrolling, and only listens to its parent', () => {
  const s = PV.FRAME_SCRIPT;
  const posts = s.match(/parent\.postMessage\(\{type:"(\w+)"/g).map((x) => x.match(/"(\w+)"$/)[1]);
  assert.deepEqual(posts, ['select', 'scroll']);
  assert.ok(s.includes('if(e.source!==parent)return;'));
  assert.ok(s.includes('if(n.closest("a"))e.preventDefault();'), 'links do not navigate in the preview');
  for (const re of [/innerHTML/, /eval\(/, /Function\(/, /document\.write/, /location/, /fetch/, /XMLHttpRequest/, /localStorage/, /cookie/]) assert.ok(!re.test(s), String(re));
});

test('the message bridge accepts exactly the two known messages', () => {
  assert.deepEqual(PV.acceptMessage({ type: 'select', id: 's_hero01' }), { type: 'select', id: 's_hero01' });
  assert.deepEqual(PV.acceptMessage({ type: 'scroll', y: 0 }), { type: 'scroll', y: 0 });
  assert.deepEqual(PV.acceptMessage({ y: 420, type: 'scroll' }), { type: 'scroll', y: 420 });
  const refused = [
    null, undefined, 'select', 42, [], ['select', 's_hero01'],
    { type: 'select' }, { type: 'select', id: '' }, { type: 'select', id: 'hero' }, { type: 'select', id: 's_HERO01' }, { type: 'select', id: 's_ab' },
    { type: 'select', id: 's_hero01"><script>' }, { type: 'select', id: 's_hero01', extra: 1 }, { type: 'select', id: 1 },
    { type: 'scroll', y: -1 }, { type: 'scroll', y: 1.5 }, { type: 'scroll', y: NaN }, { type: 'scroll', y: Infinity }, { type: 'scroll', y: 1e9 }, { type: 'scroll', y: '10' },
    { type: 'scroll', y: 1, id: 's_hero01' }, { type: 'init', id: 's_hero01' }, { type: 'edit', path: 'data.headline', value: 'x' }, { type: 'navigate', url: 'https://example.com' },
    Object.create({ type: 'select', id: 's_hero01' }), Object.assign(Object.create(null), { type: 'select', id: 's_hero01' }),
  ];
  for (const m of refused) assert.equal(PV.acceptMessage(m), null, JSON.stringify(m));
});

test('the Studio side checks the sender: only its current preview frames', () => {
  const src = read('js/studio/studio-preview.js');
  assert.ok(src.includes('var ifr = frames().filter(function (f) { return f.contentWindow === e.source; })[0];\n      if (!ifr) return;\n      var m = acceptMessage(e.data);\n      if (!m) return;'));
  assert.equal((src.match(/addEventListener\('message'/g) || []).length, 1);
  // and the shell selects only sections that exist (store.select refuses others)
  assert.ok(read('js/studio/studio-shell.js').includes("onSelect: function (id) { if (!preview.phoneOnly() && id !== editor.selected()) select(id, 'preview'); }"));
  assert.ok(read('js/studio/studio-shell.js').includes('if (!editor.select(id)) return;'));
});

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
