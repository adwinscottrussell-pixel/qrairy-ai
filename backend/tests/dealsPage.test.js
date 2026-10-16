// ============================================================
// dealsPage.test.js — Deals Admin page, Phase B1 visual foundation
// (frontend/public/deals.html + deals-page.css).
//
// Static checks only, same no-framework convention as
// tests/adminNavShell.test.js: the page sits on the canonical Admin
// shell and QDS, is fully bilingual, mirrors dealService.js's offer
// types, and -- being a preview -- talks to no backend at all.
//
// Run: node tests/dealsPage.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

function sidebar(src) {
  const s = src.indexOf('<div id="sidebar">');
  const e = src.indexOf('\n</div>', s);
  assert.ok(s !== -1 && e !== -1, 'sidebar block not found');
  return src.slice(s, e + 7);
}

// Read from source rather than require()d, so this static test needs no
// Prisma client (dealService.js pulls in utils/prismaClient at load).
function backendOfferTypes() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'dealService.js'), 'utf8');
  const m = src.match(/const OFFER_TYPES = \[([^\]]+)\];/);
  assert.ok(m, 'OFFER_TYPES not found in dealService.js');
  return m[1].split(',').map((x) => x.trim().replace(/'/g, ''));
}

const page = read('deals.html');
const css = read('deals-page.css');

// The page's dictionary, evaluated in isolation (it is a plain object literal).
function dictionary() {
  const start = page.indexOf('var _t = {');
  const end = page.indexOf('\n  };', start);
  assert.ok(start !== -1 && end !== -1, '_t dictionary not found');
  return vm.runInNewContext('(' + page.slice(start + 'var _t = '.length, end + 4) + ')');
}

// Shell labels (nav_*, role_owner, …) are owned by js/admin-shell.js.
function shellKeys() {
  const ctx = { window: {}, document: { readyState: 'loading', addEventListener() {}, querySelectorAll() { return []; }, getElementById() { return null; }, documentElement: {} }, localStorage: { getItem() { return null; }, setItem() {} } };
  vm.runInNewContext(read('js/admin-shell.js'), ctx);
  return (key) => ctx.window.QraivyShell.t(key) !== undefined;
}

// ── Admin shell ────────────────────────────────────────────────
test('carries the canonical Admin sidebar, with its own Deals item marked active', () => {
  const plain = (b) => b.replace(/class="sb-item active"/g, 'class="sb-item"');
  assert.equal(plain(sidebar(page)), plain(sidebar(read('dashboard.html'))));
  const active = sidebar(page).match(/<a [^>]*class="sb-item active"[^>]*>/g) || [];
  assert.deepEqual(active, ['<a href="deals.html" class="sb-item active" id="sb-deals">']);
});

test('loads the shared shell, QDS and its own stylesheet, in that order', () => {
  const links = [...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ['dashboard-shell.css', 'qds/qds.css', 'deals-page.css']);
  const lang = page.indexOf('src="js/qraivy-lang.js"');
  const shell = page.indexOf('src="js/admin-shell.js"');
  assert.ok(lang !== -1 && shell > lang, 'qraivy-lang.js must load before admin-shell.js');
});

test('mobile menu button and overlay follow the sidebar', () => {
  const after = page.slice(page.indexOf('\n</div>', page.indexOf('<div id="sidebar">')));
  assert.match(after, /^\n<\/div>\s*<button id="mob-btn">[^<]*<\/button>\s*<div class="sb-overlay" id="sb-overlay"><\/div>/);
});

test('every Admin page links here only through the sidebar tab Deals & Promotions', () => {
  for (const f of ['dashboard.html', 'analytics.html', 'wallet-pass-studio.html', 'loyalty-setup.html', 'designer-saved.html', 'smart-qr-detail.html']) {
    const src = read(f);
    assert.equal((src.match(/deals\.html/g) || []).length, 1, f + ': one link to deals.html');
    assert.ok(sidebar(src).includes('<a href="deals.html" class="sb-item" id="sb-deals">'), f + ': in the sidebar');
  }
  assert.ok(!read('js/admin-shell.js').includes('deals.html'), 'the shell itself does not link anywhere');
});

// ── Preview-only guarantees ────────────────────────────────────
test('talks only to the Deals API, as the signed-in owner', () => {
  // its own default-deny routing (js/deals-routing.js; see dealsPreviewSafety.test.js)
  assert.ok(page.includes('<script src="js/deals-routing.js"></script>'), 'uses the Deals routing');
  assert.match(page, /var API_BASE = String\(ROUTING\.api \|\| ''\)\.replace\(/);
  // One request helper; every call goes through it with the Clerk token.
  assert.equal((page.match(/\bfetch\(/g) || []).length, 1, 'exactly one fetch call site');
  assert.match(page, /res = await fetch\(API_BASE \+ path, opts\);/);
  assert.match(page, /headers: \{ Authorization: 'Bearer ' \+ token \}/);
  const calls = [...page.matchAll(/api\('(GET|POST|PUT|DELETE)', ('[^']*')/g)].map((m) => m[1] + ' ' + m[2]);
  // GET '/deals/pages' and GET '/deals/' (placements): the page picker (dealPagePicker.test.js)
  // GET '/deals/access': the account's Deals access for the notices (Phase 3B.7)
  assert.deepEqual([...new Set(calls)].sort(), ["DELETE '/deals/'", "GET '/deals'", "GET '/deals/'", "GET '/deals/access'", "GET '/deals/pages'", "POST '/deals'", "POST '/deals/'", "PUT '/deals/'"]);
  for (const suffix of ["'/draft'", "'/publish'", "'/archive'", "'/image'"]) assert.ok(page.includes('encodeURIComponent(' ) && page.includes(suffix), suffix);
  for (const banned of ['XMLHttpRequest', 'sendBeacon', 'WebSocket', 'cloudinary']) assert.ok(!page.includes(banned), 'found ' + banned);
});

test('keeps no deal data in browser storage and never shows an unsaved upload as saved', () => {
  for (const banned of ['sessionStorage', 'indexedDB', 'FileReader', 'createObjectURL', 'dataUrl']) assert.ok(!page.includes(banned), 'found ' + banned);
  const stored = [...page.matchAll(/localStorage\.setItem\('([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(stored, ['qraivy_lang', 'sb-collapsed']);
  // The image becomes the deal's image only from the server's answer.
  assert.match(page, /var res = await api\('POST', '\/deals\/' \+ encodeURIComponent\(draft\.id\) \+ '\/image', form\);\s+draft\.image = imageFromServer\(res\.deal\.image\);/);
});

test('waits for the signed-in session before the first request', () => {
  assert.match(page, /window\.QraivyDeals = \{ start: loadDeals \};/);
  const init = page.slice(page.indexOf('async function initDeals()'));
  assert.ok(init.indexOf("if (!window.Clerk.user) { window.location.href = 'login.html'; return; }") < init.indexOf('window.QraivyDeals.start();'));
  assert.equal((page.match(/QraivyDeals\.start\(\)/g) || []).length, 1);
  // the access status too: only after the sign-in check, once
  assert.ok(init.indexOf("if (!window.Clerk.user) { window.location.href = 'login.html'; return; }") < init.indexOf('window.QraivyDeals.loadAccess();'));
  assert.equal((page.match(/QraivyDeals\.loadAccess\(\)/g) || []).length, 1);
});

test('one action at a time: a running request blocks duplicates and shows a loading state', () => {
  assert.match(page, /async function runBusy\(btn, fn\) \{\s+if \(busy\) return undefined;\s+busy = true; setButtonBusy\(btn, true\);/);
  assert.match(page, /btn\.classList\.add\('qds-btn--loading'\); btn\.setAttribute\('aria-busy', 'true'\); btn\.disabled = true;/);
  for (const guard of ['async function goTo(n, btn) {\n    if (busy) return;', 'async function commit(status, btn) {\n    if (busy) return;', 'if (!file || busy) return;']) {
    assert.ok(page.includes(guard), guard);
  }
});

test('shows loading, empty, error and saved states', () => {
  for (const id of ['deal-loading', 'deal-load-error', 'deal-retry-btn', 'deal-empty', 'deal-alert', 'deal-upload-status', 'deal-published-note']) {
    assert.ok(page.includes('id="' + id + '"'), id);
  }
  assert.match(page, /id="deal-alert" role="alert" hidden/);
  const t = dictionary();
  for (const lang of ['en', 'de']) {
    for (const k of ['dl_loading', 'dl_load_error_title', 'dl_retry', 'e_network', 'e_server', 'e_save_detail', 'e_gone', 'e_img_storage', 'e_img_upload', 's2_uploading', 'toast_draft', 'toast_published', 'toast_archived', 'toast_deleted', 'dl_unpublished', 'db_published_note']) {
      assert.ok(t[lang][k], lang + '.' + k);
    }
  }
});

test('says where and when a published deal appears, never more (no outdated "not shown yet" banner)', () => {
  assert.doesNotMatch(page, /class="deal-preview-banner" role="note"/, 'the old "not shown to customers yet" banner is gone');
  assert.doesNotMatch(page, /dl_banner_/);
  const t = dictionary();
  for (const lang of ['en', 'de']) assert.doesNotMatch(Object.values(t[lang]).join(' | '), /not shown to your customers yet|noch nicht angezeigt|still being built|noch in Arbeit/i, lang);
  assert.equal(t.en.s4_note, 'Once published, this deal appears on the landing pages you select below – from its start until its end date. A landing page shows up to three current deals.');
  assert.equal(t.de.s4_note, 'Nach dem Veröffentlichen erscheint dieser Deal auf den unten ausgewählten Landingpages – von seinem Start bis zu seinem Enddatum. Eine Landingpage zeigt bis zu drei aktuelle Deals.');
  assert.ok(page.includes('data-i18n="s4_note">' + t.en.s4_note + '</p>'), 'the markup fallback is the English text');
  for (const lang of ['en', 'de']) {
    const all = Object.values(t[lang]).join(' | ');
    assert.ok(!/is (now )?live|now visible|customers can (now )?see|ist (jetzt )?live|jetzt sichtbar|Kunden sehen (ihn|den Deal) jetzt/i.test(all), lang + ' claims visibility');
    assert.ok(!/preview only|nur vorschau|\((preview|vorschau)\)/i.test(all), lang + ' still calls the page a preview');
  }
  assert.ok(!/href="[^"]*\/(deal|d)\//.test(page), 'no link to a public deal page');
});

test('the list is whatever the server returned: no sample deals are baked into the page', () => {
  assert.match(page, /var deals = \[\];/);
  assert.match(page, /deals = \(data\.deals \|\| \[\]\)\.map\(fromServer\);/);
  assert.match(page, /<div class="deal-list" id="deal-list" hidden><\/div>/);
});

test('hidden list states are really hidden (loading skeleton, list, empty, error never overlap)', () => {
  // .deal-list sets display:grid, which would beat the hidden attribute.
  assert.ok(css.includes('.deal-list[hidden] { display: none; }'));
  assert.ok(page.includes("$('deal-loading').hidden = loadState !== 'loading';"));
  assert.ok(page.includes("list.hidden = loadState !== 'ready' || deals.length === 0;"));
});

test('status badges come from the server: draft, published, scheduled, expired, archived', () => {
  assert.match(page, /function displayStatus\(d\) \{ return d\.displayStatus \|\| d\.status \|\| 'draft'; \}/);
  assert.match(page, /var STATUS_BADGE = \{ draft: 'neutral', published: 'success', archived: 'neutral-dim', expired: 'warning', scheduled: 'info' \};/);
});

// ── Bilingual ──────────────────────────────────────────────────
test('English and German dictionaries have exactly the same keys', () => {
  const t = dictionary();
  assert.deepEqual(Object.keys(t.de).sort(), Object.keys(t.en).sort());
  for (const lang of ['en', 'de']) {
    for (const [k, v] of Object.entries(t[lang])) assert.ok(typeof v === 'string' && v.trim(), lang + '.' + k + ' is empty');
  }
});

test('every data-i18n key in the markup is translated', () => {
  const t = dictionary();
  const inShell = shellKeys();
  const keys = new Set([...page.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size > 60, 'expected the page to be translated throughout');
  for (const k of keys) assert.ok(k in t.en || inShell(k), 'untranslated key: ' + k);
});

test('every t() key used by the script exists', () => {
  const t = dictionary();
  const literal = [...page.matchAll(/\bt\('([a-zA-Z0-9_]+)'\s*[,)]/g)].map((m) => m[1]);
  assert.ok(literal.length > 40);
  for (const k of literal) assert.ok(k in t.en, 'missing key: ' + k);
  // Keys built from a prefix + id.
  const OFFER_TYPES = backendOfferTypes();
  for (const type of OFFER_TYPES) assert.ok(('type_' + type) in t.en && ('type_' + type + '_ex') in t.en, 'type_' + type);
  for (const s of ['draft', 'published', 'archived', 'expired', 'scheduled']) assert.ok(('st_' + s) in t.en, 'st_' + s);
  for (const p of ['sum', 'pv_valid']) for (const s of ['none', 'from', 'until', 'range']) assert.ok((p + '_' + s) in t.en, p + '_' + s);
  for (const f of ['percentOff', 'buyQty', 'freeQty', 'price', 'currency', 'freeItem', 'minPurchase', 'fromLabel', 'toLabel']) assert.ok(('f_' + f) in t.en, 'f_' + f);
  for (const id of [...page.matchAll(/\{ id: '([a-z]+)', css:/g)].map((m) => m[1])) assert.ok(('bg_' + id) in t.en, 'bg_' + id);
});

// ── Four steps, six types (mirrors dealService.js) ─────────────
test('offers exactly the six deal types the backend accepts', () => {
  const OFFER_TYPES = backendOfferTypes();
  const tiles = [...page.matchAll(/name="deal-type" value="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tiles, OFFER_TYPES);
  const inScript = page.match(/var OFFER_TYPES = \[([^\]]+)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(inScript, OFFER_TYPES);
});

test('type-specific fields use the backend field names; custom has none', () => {
  const block = page.slice(page.indexOf('var TYPE_FIELDS = {'), page.indexOf('// Neutral, QRAIVY-made backgrounds'));
  const keysOf = (type) => [...block.slice(block.indexOf(type + ':')).split('\n    ' )[0].matchAll(/key: '([a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.match(block, /percentage_discount: \[\{ key: 'percentOff', kind: 'number', required: true, min: 1, max: 100/);
  assert.match(block, /key: 'buyQty', kind: 'number', required: true, min: 1/);
  assert.match(block, /key: 'freeQty', kind: 'number', required: true, min: 1/);
  assert.match(block, /key: 'price', kind: 'number', required: true, min: 0\.01/);
  assert.match(block, /free_bonus: \[\{ key: 'freeItem', kind: 'text' \}, \{ key: 'minPurchase', kind: 'text' \}\]/);
  assert.match(block, /upgrade: \[\{ key: 'fromLabel', kind: 'text' \}, \{ key: 'toLabel', kind: 'text' \}\]/);
  assert.match(block, /custom: \[\]/);
  assert.ok(keysOf('percentage_discount').length >= 1);
});

test('has the four steps in order, each with a panel', () => {
  const steps = [...page.matchAll(/class="deal-step" type="button" data-step="(\d)">.*?data-i18n="(db_step\d)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(steps, [['1', 'db_step1'], ['2', 'db_step2'], ['3', 'db_step3'], ['4', 'db_step4']]);
  const t = dictionary();
  assert.deepEqual([t.en.db_step1, t.en.db_step2, t.en.db_step3, t.en.db_step4], ['Content', 'Image', 'Schedule', 'Review']);
  assert.deepEqual([t.de.db_step1, t.de.db_step2, t.de.db_step3, t.de.db_step4], ['Inhalt', 'Bild', 'Zeitraum', 'Überprüfen']);
  assert.deepEqual([...page.matchAll(/deal-panel" data-panel="(\d)"/g)].map((m) => m[1]), ['1', '2', '3', '4']);
});

test('image step accepts the same formats and size as the planned upload, and has no AI generation', () => {
  assert.match(page, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(page, /var IMAGE_MAX_BYTES = 5 \* 1024 \* 1024;/);
  // Existing AI-generated starter images may be chosen; nothing here creates new ones.
  assert.ok(!/Mit KI erstellen|Create with AI|Generate (with AI|image)|qds-btn--ai/i.test(page));
});

test('offers three image sources: starter images, own upload, plain background', () => {
  const tabs = [...page.matchAll(/role="tab" id="tab-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ['starter', 'upload', 'background']);
  for (const pane of tabs) assert.ok(page.includes('id="pane-' + pane + '" role="tabpanel"'), 'pane-' + pane);
  assert.equal((page.match(/\{ id: '[a-z]+', css: 'linear-gradient/g) || []).length, 8, 'the eight plain backgrounds are kept');
  assert.match(page, /id="deal-image-file" type="file"/);
});

// ── Starter images + AI label ──────────────────────────────────
function catalog() {
  const ctx = { window: {} };
  vm.runInNewContext(read('js/deal-starter-images.js'), ctx);
  // Round-tripped so the arrays belong to this realm (deepEqual compares prototypes).
  return JSON.parse(JSON.stringify(ctx.window.QRAIVY_DEAL_STARTER_IMAGES));
}
function jpegSize(buf) {
  assert.ok(buf[0] === 0xff && buf[1] === 0xd8, 'not a JPEG');
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return buf.readUInt16BE(i + 7) + 'x' + buf.readUInt16BE(i + 5);
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker');
}

test('the page loads the starter catalog', () => {
  assert.ok(page.includes('<script src="js/deal-starter-images.js"></script>'));
});

// The first 18 images as approved and committed in Phase B1 (d508e2e).
// Pinned here, independently of the catalog, so neither a file nor its
// catalog entry can change unnoticed when later images are added.
const ORIGINAL_18 = {
  'bakery-croissants-01': '7450b0d7bca77efbf0108a288ac07f2c5a092a4544a0f3c0e517288881f4f69f',
  'bakery-bread-01': '580b626cf390ad11215a331ff598902e8d44ec52adb7bcbdca081f520edb0094',
  'bakery-coffee-01': '3e451a238d7700c50502f37a296b37ceda9fa4038eeda3a699ddc77e7cb4fe49',
  'restaurant-meal-01': '4bdee6d3a24c0e47fb106da9f2c9e79d5111b5003028c79feb1c5c2b66461a85',
  'restaurant-table-01': '62e89f021be54767319c63db6c8cc6964728e387045a5816fe88a34536d16680',
  'restaurant-fresh-01': 'a1082831a81189018077a075362f07e7bc1397a9f655b144fa2c2558073432f6',
  'fashion-boutique-01': 'c645f5fa9221352ccc43c7e561f290c59472965e064005725631a619f4419a4a',
  'fashion-rack-01': '80fe716ed8cb17dfd6b5a25ef6f817c8355900c651746361fd7b79f1f5f328e2',
  'fashion-lifestyle-01': '4da1734d4d9bb2c9c71eada8ed52b1dbfcce2e3fd626e160eef17a1409894596',
  'beauty-spa-01': 'c9a00c4473e59ed50e637d03ab477ad57530ac19c663dbc4e41130ced7539b2d',
  'beauty-skincare-01': '6244eba8a5d2c51a441f3d8b2613b35838f24e0b1abbf3ff5341ed9dca8dd6ed',
  'beauty-salon-01': 'dfe6780b47d2f1d021a7412bd279f792f0ad43f80fc747c11c97ad5977c3f3a0',
  'fitness-gym-01': '08623143e781f133e25467ed1e17768bc64b013747818cb688c7d667515ce477',
  'fitness-training-01': '58a4af2380d209e35c96238f47e6ff66af6cf98f18fb3eeb0f478cd491606525',
  'fitness-active-01': '30952cf74270781e992afdb9b387c5edfc014051ca1644d354379453310d9627',
  'general-optician-01': '187f9bd64a22651674d1effe4f7938d7f07782f57ee37655c3268cc8fcb34661',
  'general-foodtruck-01': 'c784577b7d89ca36d31c917d612e3f7cff59e09daec716650d5b9a0c81a553f4',
  'general-flower-01': '81ea581b41c91792887cfb18b3d587cbe9d0a352a8d79477df6ecf15afc324c7',
};

test('catalog: 22 images in seven categories, bilingual', () => {
  const c = catalog();
  assert.equal(c.images.length, 22);
  assert.deepEqual(c.categories.map((k) => k.id), ['bakery-cafe', 'restaurant', 'fashion-retail', 'beauty-wellness', 'fitness-sport', 'general-local', 'travel-tourism']);
  for (const k of c.categories) {
    assert.equal(c.images.filter((i) => i.category === k.id).length, k.id === 'travel-tourism' ? 4 : 3, k.id);
    assert.ok(k.label.en && k.label.de, k.id + ' label');
  }
  const travel = c.categories[6];
  assert.deepEqual([travel.label.en, travel.label.de], ['Travel & Tourism', 'Reisen & Tourismus']);
  assert.deepEqual(c.images.filter((i) => i.category === 'travel-tourism').map((i) => i.id),
    ['travel-greece-01', 'travel-maldives-01', 'travel-france-01', 'travel-turkey-01']);
  assert.equal(new Set(c.images.map((i) => i.id)).size, 22, 'ids are unique');
  for (const i of c.images) assert.ok(i.label.en && i.label.de && i.file === i.id + '.jpg', i.id);
});

test('catalog: every file is the unaltered approved original, 1200x900 (4:3) JPEG', () => {
  const crypto = require('crypto');
  const c = catalog();
  const dir = path.join(PUB, c.basePath);
  assert.deepEqual(fs.readdirSync(dir).sort(), c.images.map((i) => i.file).sort(), 'folder holds exactly the catalog files');
  for (const i of c.images) {
    const buf = fs.readFileSync(path.join(dir, i.file));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), i.origin.sha256, i.file + ' was modified');
    assert.equal(jpegSize(buf), '1200x900', i.file);
    assert.equal(i.width + 'x' + i.height, '1200x900');
  }
});

test('catalog: the first 18 images and their entries are unchanged', () => {
  const crypto = require('crypto');
  const c = catalog();
  assert.deepEqual(c.images.slice(0, 18).map((i) => i.id), Object.keys(ORIGINAL_18), 'same 18, same order');
  for (const i of c.images.slice(0, 18)) {
    assert.equal(i.origin.sha256, ORIGINAL_18[i.id], i.id + ' catalog checksum');
    const buf = fs.readFileSync(path.join(PUB, c.basePath, i.file));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), ORIGINAL_18[i.id], i.file + ' file');
  }
});

test('catalog: origin is recorded per image, and every starter image is marked AI-generated', () => {
  const c = catalog();
  assert.equal(c.aiLabel, 'AI · KI-generiert');
  for (const i of c.images) {
    assert.equal(i.origin.type, 'ai_generated', i.id);
    assert.ok((i.origin.sourceMaster || i.origin.sourceFile) && /^[0-9a-f]{64}$/.test(i.origin.sha256), i.id);
  }
});

test('the two withheld travel pictures are in neither the catalog, the folder nor the server list', () => {
  const c = catalog();
  const serverList = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'dealImages.js'), 'utf8');
  const files = fs.readdirSync(path.join(PUB, c.basePath));
  for (const name of ['dubai', 'thailand']) {
    assert.ok(!c.images.some((i) => i.id.includes(name) || i.file.includes(name)), name + ' in catalog');
    assert.ok(!files.some((f) => f.includes(name)), name + ' file in starter folder');
    assert.ok(!new RegExp("id: '[^']*" + name).test(serverList), name + ' in server list');
  }
  assert.equal(files.length, 22);
});

test('catalog: travel images state what is known about their origin and leave the rest explicitly unknown', () => {
  const c = catalog();
  for (const i of c.images.filter((x) => x.category === 'travel-tourism')) {
    assert.equal(i.origin.sourcePackage, 'qraivy_travel_images.zip', i.id);
    assert.equal(i.origin.receivedOn, '2026-10-11', i.id);
    assert.ok(i.origin.sourceFile.endsWith('.jpg'), i.id);
    // Not recorded by the source: present as null, never guessed.
    assert.ok('generator' in i.origin && i.origin.generator === null, i.id + ' generator');
    assert.ok('generatedOn' in i.origin && i.origin.generatedOn === null, i.id + ' generatedOn');
  }
});

test('the AI label is shown on thumbnails, the selected image, the live preview and deal cards', () => {
  // Fixed wording in both languages; only the screen-reader text is translated.
  const label = '<span aria-hidden="true">AI · KI-generiert</span><span class="deal-sr-only" data-i18n="ai_label_sr">';
  assert.ok(page.includes('id="deal-image-thumb"><span class="deal-ai-label" id="deal-image-ai" hidden>' + label), 'selected image');
  assert.ok(page.includes('<span class="deal-ai-label" id="deal-pv-ai" hidden>' + label), 'live preview');
  assert.match(page, /\(i\.origin && i\.origin\.type === 'ai_generated' \? aiLabelHtml\(\) : ''\)/, 'gallery thumbnails');
  assert.match(page, /\(isAiImage\(d\.image\) \? aiLabelHtml\(\) : ''\)/, 'deal cards');
  assert.match(page, /\$\('deal-pv-ai'\)\.hidden = !isAiImage\(d\.image\);/);
  assert.match(page, /\$\('deal-image-ai'\)\.hidden = !isAiImage\(img\);/);
  // Decided from the catalog's origin, never from a file name.
  assert.match(page, /return !!\(st && st\.origin && st\.origin\.type === 'ai_generated'\);/);
  const t = dictionary();
  assert.equal(t.en.ai_label_sr, 'AI-generated image');
  assert.equal(t.de.ai_label_sr, 'KI-generiertes Bild');
  assert.match(css, /\.deal-ai-label \{[^}]*position: absolute;[^}]*pointer-events: none;/);
});

test('a chosen starter image keeps its catalog id, so its origin stays known', () => {
  assert.match(page, /draft\.image = \{ source: 'starter', id: btn\.getAttribute\('data-starter'\) \};/);
});

// ── Schedule ───────────────────────────────────────────────────
test('dates and times are separate inputs; no combined datetime-local field', () => {
  assert.ok(!page.includes('datetime-local" '), 'datetime-local input still present');
  const inputs = [...page.matchAll(/id="deal-(start|end)(Date|Time)" type="(date|time)"/g)].map((m) => m[1] + m[2] + ':' + m[3]);
  assert.deepEqual(inputs, ['startDate:date', 'startTime:time', 'endDate:date', 'endTime:time']);
  for (const k of ['startDate', 'startTime', 'endDate', 'endTime']) assert.ok(page.includes('id="err-' + k + '"'), 'err-' + k);
});

test('a half-typed date is reported, never silently read as "no date"', () => {
  assert.match(page, /partial\[k\] = !el\.value && !!\(el\.validity && el\.validity\.badInput\);/);
  const t = dictionary();
  for (const lang of ['en', 'de']) assert.ok(t[lang].e_date_incomplete && t[lang].e_time_needs_date && t[lang].e_end_before && t[lang].e_end_past);
});

// ── Prices ─────────────────────────────────────────────────────
// fmtMoney() is run for real (it is self-contained apart from locale()).
function moneyFormatter(lang) {
  const start = page.indexOf('  function fmtMoney(n, currency) {');
  const end = page.indexOf('  // Two offer lines are "the same suggestion"');
  assert.ok(start !== -1 && end > start, 'fmtMoney not found');
  return vm.runInNewContext('(function () { function locale() { return ' + JSON.stringify(lang === 'de' ? 'de-DE' : 'en-GB') + '; }\n' + page.slice(start, end) + '\nreturn fmtMoney; })()', { Intl });
}

test('prices have a space between currency symbol and amount, in English and German', () => {
  const en = moneyFormatter('en'), de = moneyFormatter('de');
  assert.equal(en(1500, 'USD'), 'US$ 1,500.00');
  assert.equal(en(5.9, 'EUR'), '€ 5.90');
  assert.equal(en(499, 'GBP'), '£ 499.00');
  assert.equal(en(1500, 'CHF'), 'CHF 1,500.00');
  assert.equal(de(1500, 'USD'), '1.500,00 $');
  assert.equal(de(5.9, 'EUR'), '5,90 €');
  assert.equal(de(499, 'GBP'), '499,00 £');
  assert.equal(de(1500, 'CHF'), '1.500,00 CHF');
  assert.equal(en(5.9), '€ 5.90', 'EUR when no currency is given');
});

test('price formatting never changes the amount or the currency, and uses ordinary spaces only', () => {
  for (const lang of ['en', 'de']) {
    const f = moneyFormatter(lang);
    for (const currency of ['EUR', 'USD', 'GBP', 'CHF']) {
      for (const amount of [0.01, 5.9, 499, 1500, 1234567.89]) {
        const text = f(amount, currency);
        const plain = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency }).format(amount);
        assert.equal(text.replace(/\s/g, ''), plain.replace(/\s/g, ''), lang + ' ' + currency + ' ' + amount + ': only spacing may differ');
        assert.ok(!/[\u00A0\u202F]/.test(text) && !/ {2}/.test(text) && text === text.trim(), JSON.stringify(text));
        assert.equal((text.match(/ /g) || []).length, 1, 'exactly one space: ' + JSON.stringify(text));
      }
    }
  }
});

test('the same offer line is used on cards, in the live preview and in the review', () => {
  assert.ok(page.includes("'<div class=\"deal-card__offer\">' + esc(offerLine(d)) + '</div>' +"), 'cards');
  assert.ok(page.includes("$('deal-pv-offer').textContent = offerLine(d) || t('pv_ph_offer');"), 'live preview');
  assert.ok(page.includes("['rv_offer', d.offerText.trim() ? esc(offerLine(d)) : none, 1],"), 'review');
  // The price chip and the review's details line come from the same formatter.
  assert.equal((page.match(/fmtMoney\(/g) || []).length, 4, 'one definition + suggestion, chip, details');
  // What is sent to the server is the form's text and the numeric price, never a reformatted number.
  assert.ok(page.includes("if (raw !== '') details[f.key] = f.kind === 'number' ? num(raw) : raw;"));
});

// ── Design system ──────────────────────────────────────────────
test('deals-page.css is built on QDS tokens: no hex colors, no new font, .deal- classes only', () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(body), 'raw hex color in deals-page.css');
  assert.ok((body.match(/var\(--qds-/g) || []).length > 150, 'expected QDS tokens throughout');
  assert.ok(!/var\(--(?!qds-)/.test(body), 'non-QDS custom property used');
  const fonts = [...body.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((f) => !f.startsWith('var(--qds-'));
  assert.deepEqual([...new Set(fonts)], ["'Space Grotesk', sans-serif"]);
  const selectors = body.split('}').map((r) => r.split('{')[0].trim()).filter((s) => s && !s.startsWith('@'));
  for (const group of selectors) for (const sel of group.split(',')) assert.ok(sel.trim().startsWith('.deal-'), 'selector outside .deal-: ' + sel.trim());
});

test('uses QDS components rather than restyling them', () => {
  for (const cls of ['qds-page-wrap', 'qds-page-header', 'qds-page-title', 'qds-btn qds-btn--primary', 'qds-surface qds-surface--default', 'qds-field', 'qds-input__control', 'qds-textarea__control', 'qds-select__control', 'qds-radio qds-radio--tile', 'qds-badge', 'qds-empty-state']) {
    assert.ok(page.includes(cls), 'missing ' + cls);
  }
  assert.ok(!/<style[\s>]/.test(page), 'no inline <style> block');
});

test('carries nothing from StadtPocket', () => {
  for (const src of [page, css]) assert.ok(!/stadtpocket|stadt pocket|helloulm|angebote-starter|--coral/i.test(src));
});

console.log('\n' + passed + ' passed');
