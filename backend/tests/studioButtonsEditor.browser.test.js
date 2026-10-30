// ============================================================
// studioButtonsEditor.browser.test.js — Landing Page Studio V3, Phase
// 2A-3B: editing the Buttons section in a real browser (LOCAL ONLY: needs
// Chrome and puppeteer-core; prints SKIP and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. Checked: selection (Sections
// list and preview); Content / Style / Settings; title and subtitle; adding
// (empty target, inline state, the 12-button limit); removing and Undo;
// reordering with buttons and Alt+arrows; one row open at a time; label,
// subtitle and icon; all six action types with valid and invalid targets;
// WhatsApp numbers; a type change with an incompatible target; internal
// links and link-name rename; layouts, background, alignment, spacing;
// Show on page; escaping; Undo / Redo; the "last valid version" notice;
// Light / Dark; Tablet / Mobile and both frames at 1920; phones preview
// only; no network; Save Draft / Publish disabled; the other types
// read-only. (The Hero has its own test: studioEditor.browser.test.js.)
// Run: node tests/studioButtonsEditor.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioButtonsEditor.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(PUB, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, base;
const Q = 's_quick01';

async function open(width, height, { theme = 'light' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('qraivy.studio.theme', t); localStorage.setItem('qraivy_lang', 'en'); localStorage.removeItem('qraivy.studio.panels'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} }, theme);
  const net = [], errors = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) net.push(u.host); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  // Phase C.1: the preview starts phone-first; these checks use the desktop frame (picked as an owner would, then loaded)
  if (await page.evaluate(() => { const b = document.querySelector('button[data-device="desktop"]'); if (!b || !b.offsetParent || b.getAttribute('aria-checked') === 'true') return false; b.click(); return true; })) {
    const h = await page.$('#st-canvas iframe[data-device="desktop"]'); const f = h && await h.contentFrame();
    if (f) await f.waitForSelector('[data-v3-id]', { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  return { page, net, errors };
}
// open the Studio with the Buttons section selected
async function openButtons(width = 1440, height = 900, opts) {
  const o = await open(width, height, opts);
  if (width >= 1200) { await o.page.click('#st-tab-sections'); await o.page.click('#st-outline [data-id="' + Q + '"]'); }
  return o;
}
const srcdoc = (page, device = null) => page.$eval('#st-canvas iframe' + (device ? '[data-device="' + device + '"]' : ''), (f) => f.srcdoc);
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
const previewHas = (page, s, device) => until(async () => (await srcdoc(page, device)).includes(s), 'preview shows ' + s);
const previewLacks = (page, s) => until(async () => !(await srcdoc(page)).includes(s), 'preview no longer shows ' + s);
async function frame(page, device = 'desktop') { return (await page.$('#st-canvas iframe[data-device="' + device + '"]')).contentFrame(); }
// a real click inside a CSS-scaled preview frame (see studioEditor.browser.test.js)
async function clickInPreview(page, selector, device = 'desktop') {
  const fr = await frame(page, device);
  const r = await fr.$eval(selector, (n) => { scrollTo({ top: Math.max(0, n.getBoundingClientRect().top + scrollY - 100), behavior: 'instant' }); const b = n.getBoundingClientRect(); return { x: b.left + Math.min(40, b.width / 2), y: b.top + Math.min(20, b.height / 2) }; });
  const f = await page.$eval('#st-canvas iframe[data-device="' + device + '"]', (n) => { const b = n.getBoundingClientRect(); return { left: b.left, top: b.top, scale: b.width / n.offsetWidth }; });
  await sleep(150);
  await page.mouse.click(f.left + r.x * f.scale, f.top + r.y * f.scale);
}
async function typeInto(page, sel, text) {
  await page.click(sel);
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  if (text === '') await page.keyboard.press('Backspace'); else await page.keyboard.type(text);
}
async function keys(page, mods, key) { for (const m of mods) await page.keyboard.down(m); await page.keyboard.press(key); for (const m of mods.slice().reverse()) await page.keyboard.up(m); }
const fp = (p, tag = 'input') => '#st-fields [data-path="' + p + '"] ' + tag;
const it = (i, k, tag = 'input') => fp('data.items[' + i + '].' + k, tag);
const row = (i) => '#st-fields .st-item[data-index="' + i + '"]';
const errorOf = (page, p) => page.$eval('#st-fields [data-path="' + p + '"] .st-err', (n) => (n.hidden ? '' : n.textContent));
const tab = (page, name) => page.click('[data-insp="' + name + '"]');
async function openRow(page, i) { if (!(await page.$(row(i) + '.is-open'))) await page.click(row(i) + ' .st-item__toggle'); }
const cardLabels = (html) => [...html.matchAll(/<a class="v3-card-link"[^>]*>[^]*?<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
const stale = (page) => page.$eval('#st-stale', (n) => !n.hidden);
function onlyLocal(net) { return [...new Set(net)].filter((h) => h !== new URL(base).host && !FONT_HOSTS.includes(h)); }

test('selection from the Sections list and the preview; Content / Style / Settings; rows', async () => {
  const { page, errors } = await open(1440, 900);
  await clickInPreview(page, '[data-v3-id="' + Q + '"] .v3-card-link');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Buttons', 'selected from the preview');
  assert.equal(await page.$eval('#st-outline [aria-current="true"]', (n) => n.getAttribute('data-id')), Q);
  const fr = await frame(page);
  await until(() => fr.$eval('[data-v3-id="' + Q + '"]', (n) => n.classList.contains('st-sel')), 'marked in the preview');
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  assert.match(await page.$eval('#st-note', (n) => n.textContent), /^Changes are saved when you click “Save Draft.” Your published page remains unchanged.$/);
  const paths = () => page.$$eval('#st-fields > [data-path]', (n) => n.map((x) => x.getAttribute('data-path')));
  assert.deepEqual(await paths(), ['data.title', 'data.subtitle', 'data.items']);
  assert.deepEqual(await page.$$eval('#st-fields .st-item__name', (n) => n.map((x) => x.textContent)), ['Stempelkarte', 'Angebote', 'Unsere Produkte', 'Kontakt']);
  assert.equal(await page.$eval('#st-fields .st-items__count', (n) => n.textContent), '(4 / 12)');
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 0, 'rows start closed');
  await tab(page, 'style');
  assert.deepEqual(await paths(), ['variant', 'style.background', 'style.align', 'style.spacing']);
  await tab(page, 'settings');
  assert.deepEqual(await paths(), ['anchor', 'hidden', 'id']);
  assert.equal(await page.$eval(fp('id'), (n) => n.value), Q);
  // and back from the list
  await page.click('#st-outline [data-id="s_hero01"]');
  await page.click('#st-outline [data-id="' + Q + '"]');
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Buttons');
  assert.deepEqual(errors, []);
  await page.close();
});

test('title and subtitle reach the preview', async () => {
  const { page } = await openButtons();
  await typeInto(page, fp('data.title'), 'Schnell erreicht');
  await previewHas(page, '<h2 class="v3-h2">Schnell erreicht</h2>');
  await typeInto(page, fp('data.subtitle'), 'Alles mit einem Tipp');
  await previewHas(page, '<p class="v3-sub">Alles mit einem Tipp</p>');
  assert.equal(await page.$eval('#st-fields [data-path="data.title"] .st-count', (n) => n.textContent), '16 / 80');
  await page.close();
});

test('add: "New button", target empty with its inline state; the notice; one Undo step', async () => {
  const { page, errors } = await openButtons();
  await page.click('#st-fields [data-action="add-item"]');
  await until(async () => (await page.$$eval('#st-fields .st-item', (n) => n.length)) === 5, 'five rows');
  assert.deepEqual(await page.$$eval('#st-fields .st-item.is-open', (n) => n.map((x) => x.getAttribute('data-index'))), ['4'], 'the new row is open');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-path]').getAttribute('data-path')), 'data.items[4].label', 'focus on its label');
  assert.equal(await page.$eval(it(4, 'label'), (n) => n.value), 'New button');
  assert.equal(await page.$eval(it(4, 'kind', 'select'), (n) => n.value), 'link');
  assert.equal(await page.$eval(it(4, 'target', 'select'), (n) => n.value + '|' + n.options[n.selectedIndex].text), '|Choose a destination…');
  assert.equal(await errorOf(page, 'data.items[4].target'), 'Choose where this button leads.');
  assert.equal(await page.$eval(row(4), (n) => n.classList.contains('has-error') && n.querySelector('.st-item__err').textContent), '1 error');
  assert.equal(await stale(page), true, 'the notice says the preview shows the last valid version');
  assert.match(await page.$eval('#st-stale', (n) => n.textContent), /Preview shows the last valid version\. Fix the highlighted field\./);
  assert.equal(cardLabels(await srcdoc(page)).length, 4, 'the incomplete button is not in the preview');
  await page.select(it(4, 'target', 'select'), '/kontakt');
  await until(async () => !(await stale(page)), 'notice gone once valid');
  await until(async () => cardLabels(await srcdoc(page)).length === 5, 'now in the preview');
  await page.click('#st-undo-btn'); // the destination: incomplete again, so the
  // preview keeps the last valid version (5 buttons) and says so
  await until(async () => (await page.$eval(it(4, 'target', 'select'), (n) => n.value)) === '', 'target empty again');
  assert.equal(await stale(page), true);
  assert.equal(cardLabels(await srcdoc(page)).length, 5);
  await page.click('#st-undo-btn'); // the add, as one step
  await until(async () => (await page.$$eval('#st-fields .st-item', (n) => n.length)) === 4, 'add undone in one step');
  assert.equal(await stale(page), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('at most 12 buttons: Add is disabled and says so', async () => {
  const { page } = await openButtons();
  for (let n = 4; n < 12; n++) await page.click('#st-fields [data-action="add-item"]');
  await until(async () => (await page.$$eval('#st-fields .st-item', (n) => n.length)) === 12, 'twelve rows');
  assert.equal(await page.$eval('#st-fields [data-action="add-item"]', (n) => n.disabled), true);
  assert.equal(await page.$eval('#st-fields [data-hint="max"]', (n) => !n.hidden && n.textContent), 'Up to 12 buttons.');
  assert.equal(await page.$eval('#st-fields .st-items__count', (n) => n.textContent), '(12 / 12)');
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 1, 'still one row open');
  await page.close();
});

test('remove + Undo; removing every button leaves the empty-section note', async () => {
  const { page } = await openButtons();
  await page.click(row(1) + ' [data-action="remove-item"]');
  await until(async () => !cardLabels(await srcdoc(page)).includes('Angebote'), 'removed from the preview');
  assert.deepEqual(await page.$$eval('#st-fields .st-item__name', (n) => n.map((x) => x.textContent)), ['Stempelkarte', 'Unsere Produkte', 'Kontakt']);
  await until(async () => /Button removed\. Undo is available\./.test(await page.$eval('#st-live', (n) => n.textContent)), 'announced');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.st-item') && document.activeElement.closest('.st-item').getAttribute('data-index')), '1', 'focus on the next row');
  await page.click('#st-undo-btn');
  await until(async () => cardLabels(await srcdoc(page)).join() === 'Stempelkarte,Angebote,Unsere Produkte,Kontakt', 'back, in place');
  for (let k = 0; k < 4; k++) await page.click(row(0) + ' [data-action="remove-item"]');
  await until(async () => (await srcdoc(page)).includes('data-v3-id="' + Q + '"') && (await srcdoc(page)).match(new RegExp('data-v3-id="' + Q + '"[^>]*v3-ph-section')), 'empty-section note');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-action')), 'add-item', 'focus on Add');
  await page.close();
});

test('reorder: Move up / Move down and Alt+arrows; the preview follows; Undo', async () => {
  const { page } = await openButtons();
  assert.equal(await page.$eval(row(0) + ' [data-action="move-up"]', (n) => n.disabled), true);
  assert.equal(await page.$eval(row(3) + ' [data-action="move-down"]', (n) => n.disabled), true);
  await page.click(row(0) + ' [data-action="move-down"]');
  await until(async () => cardLabels(await srcdoc(page)).join() === 'Angebote,Stempelkarte,Unsere Produkte,Kontakt', 'moved down');
  await page.focus(row(3) + ' .st-item__toggle');
  await keys(page, ['Alt'], 'ArrowUp');
  await until(async () => cardLabels(await srcdoc(page)).join() === 'Angebote,Stempelkarte,Kontakt,Unsere Produkte', 'Alt+ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.st-item').getAttribute('data-index')), '2', 'focus follows the moved row');
  await keys(page, ['Alt'], 'ArrowUp');
  await keys(page, ['Alt'], 'ArrowUp');
  await until(async () => cardLabels(await srcdoc(page)).join() === 'Kontakt,Angebote,Stempelkarte,Unsere Produkte', 'to the top');
  await keys(page, ['Alt'], 'ArrowDown');
  await until(async () => cardLabels(await srcdoc(page)).join() === 'Angebote,Kontakt,Stempelkarte,Unsere Produkte', 'Alt+ArrowDown');
  await page.click('#st-undo-btn');
  await until(async () => cardLabels(await srcdoc(page)).join() === 'Kontakt,Angebote,Stempelkarte,Unsere Produkte', 'undo one move');
  await page.close();
});

test('one row open at a time', async () => {
  const { page } = await openButtons();
  await openRow(page, 1);
  assert.deepEqual(await page.$$eval('#st-fields .st-item.is-open', (n) => n.map((x) => x.getAttribute('data-index'))), ['1']);
  await page.click(row(2) + ' .st-item__toggle');
  assert.deepEqual(await page.$$eval('#st-fields .st-item.is-open', (n) => n.map((x) => x.getAttribute('data-index'))), ['2']);
  assert.equal(await page.$eval(row(2) + ' .st-item__toggle', (n) => n.getAttribute('aria-expanded')), 'true');
  assert.equal(await page.$eval(row(1) + ' .st-item__toggle', (n) => n.getAttribute('aria-expanded')), 'false');
  await page.click(row(2) + ' .st-item__toggle');
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 0, 'and can be closed');
  await page.close();
});

test('label, subtitle (with the layout hint) and icon ("Default for this type")', async () => {
  const { page } = await openButtons();
  await openRow(page, 0);
  await typeInto(page, it(0, 'label'), 'Treuekarte');
  await until(async () => cardLabels(await srcdoc(page))[0] === 'Treuekarte', 'label');
  assert.equal(await page.$eval(row(0) + ' .st-item__name', (n) => n.textContent), 'Treuekarte', 'the row follows');
  await typeInto(page, it(0, 'subtitle'), 'Jeder 10. Kaffee gratis');
  await previewHas(page, '<small>Jeder 10. Kaffee gratis</small>');
  assert.equal(await page.$eval('#st-fields [data-hint="subtitle_layouts"]', (n) => n.hidden), true, 'Cards: no hint');
  const iconSel = it(0, 'icon', 'select');
  assert.equal(await page.$eval(iconSel, (n) => n.options[0].value + '|' + n.options[0].text), 'none|Default for this type');
  const before = (await srcdoc(page)).match(/<a class="v3-card-link"[^]*?<\/a>/)[0];
  await page.select(iconSel, 'star');
  await until(async () => (await srcdoc(page)).match(/<a class="v3-card-link"[^]*?<\/a>/)[0] !== before, 'icon changed');
  // "Default for this type" = the type's own icon (for a Link: the arrow)
  const card = async () => (await srcdoc(page)).match(/<a class="v3-card-link"[^]*?<\/a>/)[0];
  await page.select(iconSel, 'arrow');
  await until(async () => (await card()) !== before, 'arrow');
  const arrow = await card();
  await page.select(iconSel, 'none');
  await sleep(300);
  assert.equal(await card(), arrow, 'Default for a Link is its arrow icon');
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'buttons');
  await tab(page, 'content');
  await openRow(page, 0);
  assert.equal(await page.$eval('#st-fields [data-hint="subtitle_layouts"]', (n) => !n.hidden && n.textContent), 'Subtitles appear in the Cards and List layouts.');
  await page.close();
});

test('all six action types: invalid target -> inline error and the last valid preview; valid -> the link', async () => {
  const { page } = await openButtons();
  await openRow(page, 0);
  const cases = [
    // (the demo's contact section also links mailto:hallo@example.com: match the button card)
    ['website', 'example.com', 'Enter a web address starting with https://.', 'https://example.com/shop', '<a class="v3-card-link" href="https://example.com/shop" target="_blank" rel="noopener noreferrer">'],
    ['whatsapp', '+49 12', 'Enter the WhatsApp number in international format, e.g. +49 151 2345678.', '+49 151 2345678', '<a class="v3-card-link" href="https://wa.me/491512345678"'],
    ['call', 'abc', 'Enter a phone number, e.g. +49 731 123456.', '+49 (731) 12-34', '<a class="v3-card-link" href="tel:+497311234">'],
    ['email', 'nope', 'Enter an email address, e.g. name@example.com.', 'hallo@example.com', '<a class="v3-card-link" href="mailto:hallo@example.com">'],
    ['directions', 'https://example.com/map', 'Use a link from Google Maps, Apple Maps or OpenStreetMap.', 'https://maps.app.goo.gl/abc123', '<a class="v3-card-link" href="https://maps.app.goo.gl/abc123"'],
  ];
  const firstCard = async () => (await srcdoc(page)).match(/<a class="v3-card-link"[^>]*>/)[0];
  for (const [kind, bad, msg, good, href] of cases) {
    const lastValid = await firstCard();
    await page.select(it(0, 'kind', 'select'), kind);
    assert.equal(await page.$eval('#st-fields [data-path="data.items[0].target"]', (n) => n.getAttribute('data-kind')), kind, kind + ': its own target field');
    await typeInto(page, it(0, 'target'), bad);
    await until(async () => (await errorOf(page, 'data.items[0].target')) === msg, kind + ' error');
    assert.equal(await stale(page), true);
    await sleep(250);
    assert.equal(await firstCard(), lastValid, kind + ': the button keeps its last valid link');
    await typeInto(page, it(0, 'target'), good);
    await previewHas(page, href);
    assert.equal(await errorOf(page, 'data.items[0].target'), '');
    assert.equal(await stale(page), false);
  }
  // Link: the section chooser and typed links
  await page.select(it(0, 'kind', 'select'), 'link');
  // the Maps address is also a valid https link: kept, in the "typed address" field, no error
  await until(async () => (await page.$eval(it(0, 'target', 'select'), (n) => n.value)) === '__custom', 'typed-address mode');
  assert.equal(await page.$eval('#st-fields [data-path="data.items[0].target"] input', (n) => n.value), 'https://maps.app.goo.gl/abc123');
  assert.equal(await errorOf(page, 'data.items[0].target'), '');
  await typeInto(page, '#st-fields [data-path="data.items[0].target"] input', 'javascript:alert(1)');
  await until(async () => /https:\/\/, mailto: or tel:/.test(await errorOf(page, 'data.items[0].target')), 'link error');
  await page.select(it(0, 'target', 'select'), '/produkte');
  await previewHas(page, '<a class="v3-card-link" href="#produkte">');
  await page.close();
});

test('WhatsApp: the owner types a number; it is stored as the wa.me link and shown back as a number', async () => {
  const { page } = await openButtons();
  await openRow(page, 2);
  await page.select(it(2, 'kind', 'select'), 'whatsapp');
  assert.equal(await page.$eval('#st-fields [data-path="data.items[2].target"] label', (n) => n.textContent), 'WhatsApp number');
  assert.match(await page.$eval('#st-fields [data-path="data.items[2].target"] .st-hint', (n) => n.textContent), /International format/);
  await typeInto(page, it(2, 'target'), '0049 151 234 56 78');
  await previewHas(page, 'href="https://wa.me/491512345678"');
  assert.equal(await page.evaluate(() => window.QraivyStudio.editor.section('s_quick01').data.items[2].target), 'https://wa.me/491512345678');
  await page.evaluate(() => document.activeElement.blur());
  await page.click(row(2) + ' .st-item__toggle'); await page.click(row(2) + ' .st-item__toggle'); // close and reopen
  assert.equal(await page.$eval(it(2, 'target'), (n) => n.value), '+491512345678');
  await page.close();
});

test('a type change keeps the target and reports when it no longer fits; Undo brings both back', async () => {
  const { page } = await openButtons();
  await openRow(page, 0);
  await page.select(it(0, 'kind', 'select'), 'call');
  await until(async () => (await errorOf(page, 'data.items[0].target')) === 'Enter a phone number, e.g. +49 731 123456.', 'incompatible');
  assert.equal(await page.$eval(it(0, 'target'), (n) => n.value), '/stempelkarte', 'kept, not converted');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-path]').getAttribute('data-path')), 'data.items[0].kind', 'focus stays on the type');
  assert.equal(await stale(page), true);
  await page.click('#st-undo-btn');
  await until(async () => (await page.$eval(it(0, 'kind', 'select'), (n) => n.value)) === 'link', 'type back');
  assert.equal(await page.$eval(it(0, 'target', 'select'), (n) => n.value), '/stempelkarte');
  assert.equal(await stale(page), false);
  await page.close();
});

test('internal links and link-name rename: links to the Buttons section move with it', async () => {
  const { page } = await openButtons();
  await page.click('#st-outline [data-id="s_hero01"]');
  await page.select(fp('data.primary.target', 'select'), '/' + Q);
  await previewHas(page, 'v3-btn-primary" href="#' + Q + '"');
  await page.click('#st-outline [data-id="' + Q + '"]');
  await tab(page, 'settings');
  await typeInto(page, fp('anchor'), 'schnellzugriff');
  await page.keyboard.press('Enter');
  await previewHas(page, 'id="schnellzugriff"');
  await previewHas(page, 'v3-btn-primary" href="#schnellzugriff"');
  // the Buttons' own links: a section chosen in a row
  await tab(page, 'content');
  await openRow(page, 1);
  const options = await page.$$eval(it(1, 'target', 'select') + ' option', (n) => n.map((x) => x.value));
  assert.ok(options.includes('/schnellzugriff') && options.includes('/kontakt') && options.includes('/'), options.join());
  await page.close();
});

test('Style: Buttons / Cards / List, background, alignment, spacing', async () => {
  const { page } = await openButtons();
  await tab(page, 'style');
  for (const v of ['buttons', 'list', 'cards']) {
    await page.select(fp('variant', 'select'), v);
    await previewHas(page, '<div class="v3-items v3-items-' + v + '">');
  }
  assert.ok((await srcdoc(page)).includes('<a class="v3-card-link"'));
  await page.select(fp('style.background', 'select'), 'dark');
  await page.select(fp('style.align', 'select'), 'center');
  await page.select(fp('style.spacing', 'select'), 'roomy');
  await previewHas(page, 'class="v3-s v3-buttons v3-v-cards v3-bg-dark v3-al-center v3-sp-roomy"');
  assert.deepEqual(await page.$$eval(fp('style.background', 'select') + ' option', (n) => n.map((x) => x.text)), ['Default', 'Alternate', 'Brand colour', 'Dark']);
  await page.close();
});

test('Show on page: hidden from the page, still selectable and editable', async () => {
  const { page } = await openButtons();
  await tab(page, 'settings');
  await page.click(fp('hidden'));
  await previewLacks(page, 'data-v3-id="' + Q + '"');
  assert.equal(await page.$eval('#st-outline [data-id="' + Q + '"]', (n) => n.classList.contains('is-hidden')), true);
  await tab(page, 'content');
  await typeInto(page, fp('data.title'), 'Versteckt');
  await page.click('#st-fields [data-insp]').catch(() => {});
  await tab(page, 'settings');
  await page.click(fp('hidden'));
  await previewHas(page, '<h2 class="v3-h2">Versteckt</h2>');
  await page.close();
});

test('hostile text stays text: escaped in the preview, nothing injected, no dialogs', async () => {
  const { page, errors } = await openButtons();
  const evil = '<img src=x onerror=alert(1)>';
  await typeInto(page, fp('data.title'), evil);
  await openRow(page, 0);
  await typeInto(page, it(0, 'label'), '"><svg onload=alert(2)>');
  await previewHas(page, '&lt;img src=x onerror=alert(1)&gt;');
  await previewHas(page, '&quot;&gt;&lt;svg onload=alert(2)&gt;');
  await sleep(400);
  const fr = await frame(page);
  assert.deepEqual(await fr.evaluate(() => ({ imgs: document.querySelectorAll('main img:not(.v3-gal-item img)').length, hero: [...document.querySelectorAll('main img:not(.v3-gal-item img)')].map((i) => i.className + (/^data:image\/(jpeg;base64,|svg\+xml,)/.test(i.getAttribute('src')) ? ' (demo photo)' : ' (OTHER SOURCE)')).join(), handlers: [...document.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length, svgOnload: document.querySelectorAll('svg[onload]').length, scripts: document.scripts.length })),
    { imgs: 1, hero: 'v3-hero-img (demo photo)', handlers: 0, svgOnload: 0, scripts: 1 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('Undo / Redo across Buttons edits, buttons and keyboard', async () => {
  const { page } = await openButtons();
  await typeInto(page, fp('data.title'), 'Eins');
  await page.evaluate(() => document.activeElement.blur());
  await page.click(row(0) + ' [data-action="move-down"]');
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'list');
  await previewHas(page, 'v3-items-list');
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await previewHas(page, 'v3-items-cards');
  await keys(page, ['Control'], 'z');
  await until(async () => cardLabels(await srcdoc(page))[0] === 'Stempelkarte', 'move undone');
  await keys(page, ['Control'], 'z');
  await previewLacks(page, '<h2 class="v3-h2">Eins</h2>');
  await keys(page, ['Control', 'Shift'], 'z');
  await previewHas(page, '<h2 class="v3-h2">Eins</h2>');
  await page.click('#st-redo-btn');
  await until(async () => cardLabels(await srcdoc(page))[0] === 'Angebote', 'move redone');
  await keys(page, ['Control'], 'y');
  await previewHas(page, 'v3-items-list');
  assert.equal(await page.$eval('#st-redo-btn', (n) => n.disabled), true);
  await page.close();
});

test('Light and Dark: the Buttons editor is styled by the Studio tokens, without overflow', async () => {
  for (const theme of ['light', 'dark']) {
    const { page, errors, net } = await openButtons(1440, 900, { theme });
    await openRow(page, 0);
    const s = await page.evaluate(() => {
      const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
      return { input: css('#st-fields .st-item__body input', 'backgroundColor'), row: css('#st-fields .st-item', 'backgroundColor'), open: css('#st-fields .st-item.is-open', 'borderTopColor'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(s.input, theme === 'dark' ? 'rgb(23, 23, 25)' : 'rgb(255, 255, 255)', theme + ' inputs');
    assert.equal(s.row, theme === 'dark' ? 'rgb(23, 23, 25)' : 'rgb(255, 255, 255)', theme + ' rows');
    assert.equal(s.open, 'rgb(255, 90, 31)', theme + ': the open row in QRAIVY orange');
    assert.equal(s.overflow, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(onlyLocal(net), []);
    await page.close();
  }
});

test('devices: Tablet and Mobile show the edit; both frames update side by side at 1920', async () => {
  const { page } = await openButtons();
  await openRow(page, 0);
  await typeInto(page, it(0, 'label'), 'Überall');
  for (const d of ['tablet', 'mobile', 'desktop']) {
    await page.click('button[data-device="' + d + '"]');
    await previewHas(page, '<strong>Überall</strong>', d);
  }
  await page.close();
  const wide = await openButtons(1920, 1080);
  assert.deepEqual(await wide.page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['desktop', 'mobile']);
  await openRow(wide.page, 1);
  await typeInto(wide.page, it(1, 'label'), 'Beide');
  await previewHas(wide.page, '<strong>Beide</strong>', 'desktop');
  await previewHas(wide.page, '<strong>Beide</strong>', 'mobile');
  await wide.page.close();
});

test('phones: preview only; a click on the Buttons section edits nothing', async () => {
  const { page, errors } = await open(390, 844);
  assert.equal(await page.$eval('#st-right', (n) => getComputedStyle(n).display), 'none');
  await clickInPreview(page, '[data-v3-id="' + Q + '"] .v3-card-link', 'mobile');
  await sleep(300);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'selection unchanged');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('after editing: no network beyond this server and Google Fonts; Save Draft and Publish disabled; the other types read-only', async () => {
  const { page, net, errors } = await openButtons();
  await page.click('#st-fields [data-action="add-item"]');
  await page.select(it(4, 'kind', 'select'), 'website');
  await typeInto(page, it(4, 'target'), 'https://example.com');
  await page.click(row(0) + ' [data-action="remove-item"]');
  await sleep(400);
  assert.deepEqual(onlyLocal(net), []);
  assert.deepEqual(await page.$$eval('#st-save-btn, #st-publish-btn', (n) => n.map((b) => b.disabled)), [true, true]);
  // (Deals / Offers is editable since D2: studioDealsPreview.browser.test.js)
  for (const id of ['s_loyal01']) {
    await page.click('#st-outline [data-id="' + id + '"]');
    for (const t of ['content', 'style', 'settings']) {
      await tab(page, t);
      const c = await page.$$eval('#st-fields input, #st-fields textarea, #st-fields select, #st-fields button', (n) => n.map((x) => x.disabled));
      assert.ok(c.length && c.every(Boolean), id + ' ' + t + ': read-only');
    }
    await tab(page, 'content');
  }
  assert.deepEqual(errors, []);
  await page.close();
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  await browser.close(); server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
