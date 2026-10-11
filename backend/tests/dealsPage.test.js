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
test('carries the canonical Admin sidebar, with no item marked active', () => {
  const canonical = sidebar(read('dashboard.html')).replace(/class="sb-item active"/g, 'class="sb-item"');
  assert.equal(sidebar(page), canonical);
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

test('no other Admin page was changed to link here yet', () => {
  for (const f of ['dashboard.html', 'analytics.html', 'wallet-pass-studio.html', 'loyalty-setup.html', 'designer-saved.html', 'js/admin-shell.js']) {
    assert.ok(!read(f).includes('deals.html'), f + ' links to deals.html');
  }
});

// ── Preview-only guarantees ────────────────────────────────────
test('talks to no backend and stores no deal data', () => {
  for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'QRAIVY_API_BASE', 'api-base.js', 'api.qraivy.com', 'sessionStorage', 'indexedDB', 'cloudinary']) {
    assert.ok(!page.includes(banned), 'found ' + banned);
  }
  const stored = [...page.matchAll(/localStorage\.setItem\('([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(stored, ['qraivy_lang', 'sb-collapsed']);
});

test('is labelled as a preview: banner, per-card tag and both final actions', () => {
  assert.match(page, /class="deal-preview-banner" role="note"/);
  const t = dictionary();
  for (const lang of ['en', 'de']) {
    assert.match(t[lang].s4_save, /\((preview|Vorschau)\)$/i);
    assert.match(t[lang].s4_publish, /\((preview|Vorschau)\)$/i);
    assert.ok(t[lang].dl_banner_text && t[lang].dl_local && t[lang].s4_note && t[lang].s2_note);
  }
  assert.match(page, /qds-badge--warning">' \+ esc\(t\('dl_local'\)\)/);
});

test('starts empty: no sample deals are baked into the page', () => {
  assert.match(page, /var deals = \[\];/);
  assert.match(page, /<div class="deal-list" id="deal-list" hidden><\/div>/);
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

test('catalog: 18 images in six categories of three, bilingual', () => {
  const c = catalog();
  assert.equal(c.images.length, 18);
  assert.deepEqual(c.categories.map((k) => k.id), ['bakery-cafe', 'restaurant', 'fashion-retail', 'beauty-wellness', 'fitness-sport', 'general-local']);
  for (const k of c.categories) {
    assert.equal(c.images.filter((i) => i.category === k.id).length, 3, k.id);
    assert.ok(k.label.en && k.label.de, k.id + ' label');
  }
  assert.equal(new Set(c.images.map((i) => i.id)).size, 18, 'ids are unique');
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

test('catalog: origin is recorded per image, and every starter image is marked AI-generated', () => {
  const c = catalog();
  assert.equal(c.aiLabel, 'AI · KI-generiert');
  for (const i of c.images) {
    assert.equal(i.origin.type, 'ai_generated', i.id);
    assert.ok(i.origin.sourceMaster && /^[0-9a-f]{64}$/.test(i.origin.sha256), i.id);
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
