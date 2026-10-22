// ============================================================
// studioPreviewBridge.test.js — Landing Page Studio V3, Phase 2A-3A: the
// preview frame and its message bridge (frontend/public/js/studio/
// studio-preview.js).
// - preview frames: sandbox="allow-scripts" only, never allow-same-origin
//   (or popups, forms, top navigation); the full-size preview: no
//   permissions at all;
// - the only script in a preview frame is FRAME_SCRIPT: fixed text, added
//   by the Studio, never part of a public page; owner text stays escaped;
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
