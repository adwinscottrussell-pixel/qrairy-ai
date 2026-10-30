// ============================================================
// studioContactEditor.browser.test.js — Landing Page Studio V3, Phase
// 2A-3D: editing the Contact section in a real browser (LOCAL ONLY: needs
// Chrome and puppeteer-core; prints SKIP and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. Checked: selection (Sections
// list and preview); Content / Style / Settings, with no Layout and no
// Alignment; the title and its limit; the five address fields; phone, email
// and map link with valid and invalid values and the last valid preview;
// the "(0)" phone warning; the Directions switch and button; background and
// spacing; link name, Show on page, Section ID; Undo / Redo; German texts;
// the empty Contact; escaping; Light / Dark; Tablet / Mobile and both frames
// at 1920; phones preview only; no network; Save Draft / Publish disabled;
// the other types read-only.
// Run: node tests/studioContactEditor.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioContactEditor.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

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
const C = 's_contact1';

async function open(width, height, { theme = 'light', lang = 'en' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((t, l) => { try { localStorage.setItem('qraivy.studio.theme', t); localStorage.setItem('qraivy_lang', l); localStorage.removeItem('qraivy.studio.panels'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} }, theme, lang);
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
// open the Studio with the Contact section selected
async function openContact(width = 1440, height = 900, opts) {
  const o = await open(width, height, opts);
  if (width >= 1200) { await o.page.click('#st-tab-sections'); await o.page.click('#st-outline [data-id="' + C + '"]'); }
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
const errorOf = (page, p) => page.$eval('#st-fields [data-path="' + p + '"] .st-err', (n) => (n.hidden ? '' : n.textContent));
const warnShown = (page) => page.$eval('#st-fields [data-path="data.phone"] .st-warn', (n) => (n.hidden ? '' : n.textContent));
const tab = (page, name) => page.click('[data-insp="' + name + '"]');
const stale = (page) => page.$eval('#st-stale', (n) => !n.hidden);
// the Contact section of the preview
const section = async (page, device) => { const h = await srcdoc(page, device); const i = h.indexOf('data-v3-id="' + C + '"'); return i < 0 ? '' : h.slice(h.lastIndexOf('<section', i), h.indexOf('</section>', i)); };
const BTN = '<a class="v3-btn v3-btn-outline"';
const draft = (page) => page.evaluate((id) => JSON.parse(JSON.stringify(window.QraivyStudio.editor.section(id).data)), C);
function onlyLocal(net) { return [...new Set(net)].filter((h) => h !== new URL(base).host && !FONT_HOSTS.includes(h)); }
const CONTENT = ['data.title', 'data.address.line1', 'data.address.line2', 'data.address.postalCode', 'data.address.city', 'data.address.country', 'data.phone', 'data.email', 'data.mapsUrl', 'data.showMapLink'];

test('selection from the Sections list and the preview; Content / Style / Settings; no Layout, no Alignment', async () => {
  const { page, errors } = await open(1440, 900);
  await clickInPreview(page, '[data-v3-id="' + C + '"] .v3-h2');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Contact', 'selected from the preview');
  assert.equal(await page.$eval('#st-outline [aria-current="true"]', (n) => n.getAttribute('data-id')), C);
  const fr = await frame(page);
  await until(() => fr.$eval('[data-v3-id="' + C + '"]', (n) => n.classList.contains('st-sel')), 'marked in the preview');
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  assert.match(await page.$eval('#st-note', (n) => n.textContent), /^Changes are saved when you click “Save Draft.” Your published page remains unchanged.$/);
  const paths = () => page.$$eval('#st-fields > [data-path]', (n) => n.map((x) => x.getAttribute('data-path')));
  assert.deepEqual(await paths(), CONTENT);
  assert.deepEqual(await page.$$eval('#st-fields > .st-group', (n) => n.map((x) => x.textContent)), ['Address', 'Directions']);
  assert.deepEqual(await page.$$eval('#st-fields > [data-path] label', (n) => n.map((x) => x.textContent)),
    ['Title', 'Street and number', 'Address line 2', 'Postal code', 'City', 'Country', 'Phone', 'Email', 'Map link', 'Show directions button']);
  assert.deepEqual(await page.$$eval(CONTENT.slice(0, 6).map((p) => fp(p)).join(','), (n) => n.map((x) => x.value)), ['Kontakt', 'Musterstraße 1', '', '89073', 'Ulm', '']);
  assert.deepEqual(await page.$$eval('#st-fields [data-path="data.phone"] input, #st-fields [data-path="data.email"] input, #st-fields [data-path="data.mapsUrl"] input', (n) => n.map((x) => x.type + ':' + x.value)),
    ['tel:+49 731 000 00', 'email:hallo@example.com', 'url:']);
  assert.equal(await page.$eval(fp('data.showMapLink'), (n) => n.checked && n.getAttribute('role')), 'switch');
  await tab(page, 'style');
  assert.deepEqual(await paths(), ['style.background', 'style.spacing'], 'no Layout and no Alignment');
  assert.equal(await page.$('#st-fields [data-path="variant"], #st-fields [data-path="style.align"]'), null);
  await tab(page, 'settings');
  assert.deepEqual(await paths(), ['anchor', 'hidden', 'id']);
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), C);
  assert.equal(await page.$eval(fp('anchor'), (n) => n.value), 'kontakt');
  assert.deepEqual(errors, []);
  await page.close();
});

test('title: reaches the preview, counter, 80-character limit with the last valid preview', async () => {
  const { page } = await openContact();
  await typeInto(page, fp('data.title'), 'So finden Sie uns');
  await previewHas(page, '<h2 class="v3-h2">So finden Sie uns</h2>');
  assert.equal(await page.$eval('#st-fields [data-path="data.title"] .st-count', (n) => n.textContent), '17 / 80');
  await typeInto(page, fp('data.title'), 'x'.repeat(80));
  await previewHas(page, '<h2 class="v3-h2">' + 'x'.repeat(80) + '</h2>');
  await page.keyboard.type('y');
  await until(async () => (await errorOf(page, 'data.title')) === 'Too long: at most 80 characters.', 'too long');
  assert.equal(await stale(page), true);
  assert.equal(await page.$eval('#st-fields [data-path="data.title"] .st-count', (n) => n.textContent + '|' + n.classList.contains('is-over')), '81 / 80|true');
  await sleep(250);
  assert.ok((await section(page)).includes('<h2 class="v3-h2">' + 'x'.repeat(80) + '</h2>'), 'the last valid title stays');
  await page.close();
});

test('the five address fields reach the preview; limits from describe()', async () => {
  const { page } = await openContact();
  await typeInto(page, fp('data.address.line1'), 'Bahnhofstraße 5');
  await typeInto(page, fp('data.address.line2'), 'Hinterhaus');
  await typeInto(page, fp('data.address.postalCode'), '89231');
  await typeInto(page, fp('data.address.city'), 'Neu-Ulm');
  await typeInto(page, fp('data.address.country'), 'Deutschland');
  await previewHas(page, 'Bahnhofstraße 5<br>Hinterhaus<br>89231 Neu-Ulm<br>Deutschland</address>');
  assert.deepEqual(await page.$$eval(CONTENT.slice(1, 6).map((p) => '#st-fields [data-path="' + p + '"] .st-count').join(','), (n) => n.map((x) => x.textContent)),
    ['15 / 100', '10 / 100', '5 / 12', '7 / 60', '11 / 60']);
  assert.deepEqual((await draft(page)).address, { line1: 'Bahnhofstraße 5', line2: 'Hinterhaus', postalCode: '89231', city: 'Neu-Ulm', country: 'Deutschland' });
  await typeInto(page, fp('data.address.postalCode'), '1234567890123');
  await until(async () => (await errorOf(page, 'data.address.postalCode')) === 'Too long: at most 12 characters.', 'postal code too long');
  assert.equal(await stale(page), true);
  await sleep(250);
  assert.ok((await section(page)).includes('123456789012 Neu-Ulm'), 'the last valid version (12 characters, typed one by one) stays');
  await page.close();
});

test('phone: valid -> tel: link; invalid -> inline error and the last valid preview', async () => {
  const { page } = await openContact();
  assert.equal(await page.$eval(fp('data.phone'), (n) => n.placeholder), '+49 731 123456');
  assert.equal(await page.$eval('#st-fields [data-path="data.phone"] .st-hint', (n) => n.textContent), 'International format, e.g. +49 731 123456.');
  await typeInto(page, fp('data.phone'), 'abc');
  await until(async () => (await errorOf(page, 'data.phone')) === 'Enter a phone number, e.g. +49 731 123456.', 'phone error');
  assert.equal(await stale(page), true);
  assert.equal(await page.$eval(fp('data.phone'), (n) => n.getAttribute('aria-invalid')), 'true');
  await sleep(250);
  assert.ok((await section(page)).includes('<a href="tel:+4973100000">'), 'the last valid number stays');
  await typeInto(page, fp('data.phone'), '+49 (731) 999-1');
  await previewHas(page, '<a href="tel:+497319991"><span class="v3-sr">Telefon: </span>+49 (731) 999-1</a>');
  assert.equal(await errorOf(page, 'data.phone'), '');
  assert.equal(await stale(page), false);
  assert.equal((await draft(page)).phone, '+49 (731) 999-1', 'stored as typed');
  await page.close();
});

test('the "(0)" warning: shown for +49 (0)…, gone without it; the number is stored and rendered unchanged', async () => {
  const { page } = await openContact();
  assert.equal(await warnShown(page), '');
  await typeInto(page, fp('data.phone'), '+49 (0)731 123456');
  await until(async () => /Leave out the \(0\) after the country code/.test(await warnShown(page)), 'warning');
  assert.equal(await errorOf(page, 'data.phone'), '', 'a warning, not an error');
  assert.equal(await stale(page), false);
  await previewHas(page, '<a href="tel:+490731123456">', 'desktop');
  assert.equal((await draft(page)).phone, '+49 (0)731 123456');
  await typeInto(page, fp('data.phone'), '+49 731 123456');
  await until(async () => (await warnShown(page)) === '', 'warning gone');
  await typeInto(page, fp('data.phone'), '0049 (0) 731 12');
  await until(async () => (await warnShown(page)) !== '', 'warning for 0049 too');
  await typeInto(page, fp('data.phone'), '+49 (0)abc');
  await until(async () => (await errorOf(page, 'data.phone')) !== '', 'error');
  assert.equal(await warnShown(page), '', 'only the error while the number is invalid');
  await page.close();
});

test('email: valid -> mailto: link; invalid -> inline error and the last valid preview', async () => {
  const { page } = await openContact();
  assert.equal(await page.$eval(fp('data.email'), (n) => n.placeholder), 'name@example.com');
  await typeInto(page, fp('data.email'), 'hallo@');
  await until(async () => (await errorOf(page, 'data.email')) === 'Enter an email address, e.g. name@example.com.', 'email error');
  assert.equal(await stale(page), true);
  await sleep(250);
  assert.ok((await section(page)).includes('<a href="mailto:hallo@example.com">'), 'the last valid email stays');
  await typeInto(page, fp('data.email'), 'info@baeckerei-ulm.de');
  await previewHas(page, '<a href="mailto:info@baeckerei-ulm.de">');
  assert.equal(await stale(page), false);
  await page.close();
});

test('map link: invalid -> error, no button; valid -> the Directions button; the switch hides and shows it', async () => {
  const { page } = await openContact();
  assert.equal(await page.$eval(fp('data.mapsUrl'), (n) => n.placeholder), 'https://maps.app.goo.gl/…');
  assert.match(await page.$eval('#st-fields [data-path="data.mapsUrl"] .st-hint', (n) => n.textContent), /Google Maps, Apple Maps or OpenStreetMap/);
  assert.equal(await page.$eval('#st-fields [data-path="data.showMapLink"] .st-hint', (n) => n.textContent), 'The button appears only when a valid map link is entered.');
  assert.ok(!(await section(page)).includes(BTN), 'the demo has no map link: no button');
  for (const bad of ['https://evil.example/map', 'https://www.google.com/search?q=ulm', 'maps.app.goo.gl/abc']) {
    await typeInto(page, fp('data.mapsUrl'), bad);
    await until(async () => (await errorOf(page, 'data.mapsUrl')) === 'Use a link from Google Maps, Apple Maps or OpenStreetMap.', 'maps error ' + bad);
    assert.equal(await stale(page), true);
  }
  await sleep(250);
  assert.ok(!(await section(page)).includes(BTN), 'still no button');
  await typeInto(page, fp('data.mapsUrl'), 'https://maps.app.goo.gl/abc123');
  await previewHas(page, BTN + ' href="https://maps.app.goo.gl/abc123" target="_blank" rel="noopener noreferrer">');
  assert.ok((await section(page)).includes('<span>Route planen</span>'), 'the page-language text');
  assert.equal(await stale(page), false);
  await page.click(fp('data.showMapLink'));
  await until(async () => !(await section(page)).includes(BTN), 'switch off: no button');
  assert.equal((await draft(page)).showMapLink, false);
  assert.equal(await page.$eval(fp('data.showMapLink'), (n) => n.getAttribute('aria-checked')), 'false');
  await page.click(fp('data.showMapLink'));
  await until(async () => (await section(page)).includes(BTN), 'switch on: back');
  await page.click(fp('data.showMapLink'));
  await until(async () => !(await section(page)).includes(BTN), 'off again');
  await page.click('#st-undo-btn');
  await until(async () => (await section(page)).includes(BTN), 'Undo turns it back on');
  assert.equal(await page.$eval(fp('data.showMapLink'), (n) => n.checked), true);
  await page.close();
});

test('Style: background and spacing', async () => {
  const { page } = await openContact();
  await tab(page, 'style');
  assert.deepEqual(await page.$$eval(fp('style.background', 'select') + ' option', (n) => n.map((x) => x.text)), ['Default', 'Alternate', 'Brand colour', 'Dark']);
  assert.deepEqual(await page.$$eval(fp('style.spacing', 'select') + ' option', (n) => n.map((x) => x.text)), ['Normal', 'Compact', 'Roomy']);
  for (const [bg, sp] of [['alt', 'compact'], ['brand', 'roomy'], ['dark', 'normal'], ['default', 'normal']]) {
    await page.select(fp('style.background', 'select'), bg);
    await page.select(fp('style.spacing', 'select'), sp);
    await previewHas(page, 'class="v3-s v3-contact v3-v-card v3-bg-' + bg + ' v3-al-left v3-sp-' + sp + '"');
  }
  await page.close();
});

// Brand-background fix after the 2A-3D visual review: the icons were orange
// on orange. Computed colours on all four backgrounds, in the Studio preview
// (desktop and mobile).
test('Contact icons on Default, Alternate, Dark (brand orange) and Brand (white), desktop and mobile; text and Directions unchanged', async () => {
  const { page } = await openContact();
  await typeInto(page, fp('data.mapsUrl'), 'https://maps.app.goo.gl/abc');
  await page.evaluate(() => document.activeElement.blur());
  await tab(page, 'style');
  const want = { default: 'rgb(255, 90, 31)', alt: 'rgb(255, 90, 31)', dark: 'rgb(255, 90, 31)', brand: 'rgb(255, 255, 255)' };
  const text = { default: 'rgb(10, 10, 10)', alt: 'rgb(10, 10, 10)', dark: 'rgb(255, 255, 255)', brand: 'rgb(255, 255, 255)' };
  for (const dev of ['desktop', 'mobile']) {
    if (dev === 'mobile') await page.click('button[data-device="mobile"]');
    for (const bg of ['default', 'alt', 'dark', 'brand']) {
      await page.select(fp('style.background', 'select'), bg);
      await previewHas(page, 'v3-contact v3-v-card v3-bg-' + bg, dev);
      const fr = await frame(page, dev);
      const c = await until(() => fr.$eval('[data-v3-id="' + C + '"].v3-bg-' + bg, (n) => ({
        icons: [...n.querySelectorAll('.v3-ct-row .v3-ic')].map((i) => getComputedStyle(i).color), section: getComputedStyle(n).backgroundColor,
        text: getComputedStyle(n.querySelector('address')).color, btn: getComputedStyle(n.querySelector('.v3-btn-outline')).color, btnIcon: getComputedStyle(n.querySelector('.v3-btn-outline .v3-ic')).color })).catch(() => null), dev + ' ' + bg);
      assert.deepEqual(c.icons, [want[bg], want[bg], want[bg]], dev + ' ' + bg + ': location, phone, email icons');
      assert.notEqual(c.icons[0], c.section, dev + ' ' + bg + ': icons differ from the section colour');
      assert.equal(c.text, text[bg], dev + ' ' + bg + ': text colour unchanged');
      assert.equal(c.btn, text[bg], dev + ' ' + bg + ': Directions button colour unchanged');
      assert.equal(c.btnIcon, text[bg], dev + ' ' + bg + ': Directions icon unchanged');
    }
  }
  await page.close();
});

test('Settings: link name (links follow it), Show on page, read-only Section ID', async () => {
  const { page } = await openContact();
  await tab(page, 'settings');
  await typeInto(page, fp('anchor'), 'So finden');
  assert.match(await errorOf(page, 'anchor'), /lowercase letters/);
  await typeInto(page, fp('anchor'), 'so-finden-sie-uns');
  await page.keyboard.press('Enter');
  await previewHas(page, 'id="so-finden-sie-uns"');
  await previewHas(page, 'href="#so-finden-sie-uns"');
  assert.ok(!(await srcdoc(page)).includes('href="#kontakt"'), 'every link followed the new name');
  await page.click(fp('hidden'));
  await previewLacks(page, 'data-v3-id="' + C + '"');
  assert.equal(await page.$eval('#st-outline [data-id="' + C + '"]', (n) => n.classList.contains('is-hidden')), true);
  await page.click(fp('hidden'));
  await previewHas(page, 'data-v3-id="' + C + '"');
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), C);
  await page.close();
});

test('Undo / Redo across Contact edits, buttons and keyboard; typing is one step', async () => {
  const { page } = await openContact();
  await typeInto(page, fp('data.address.city'), 'Neu-Ulm');
  await page.evaluate(() => document.activeElement.blur());
  await previewHas(page, '89073 Neu-Ulm');
  await typeInto(page, fp('data.phone'), '+49 731 555');
  await page.evaluate(() => document.activeElement.blur());
  await previewHas(page, 'tel:+49731555');
  await tab(page, 'style');
  await page.select(fp('style.background', 'select'), 'alt');
  await previewHas(page, 'v3-contact v3-v-card v3-bg-alt');
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await previewHas(page, 'v3-contact v3-v-card v3-bg-default');
  await keys(page, ['Control'], 'z');
  await previewHas(page, 'tel:+4973100000"');
  await keys(page, ['Control'], 'z');
  await previewHas(page, '89073 Ulm<');
  await keys(page, ['Control', 'Shift'], 'z');
  await previewHas(page, '89073 Neu-Ulm');
  await page.click('#st-redo-btn');
  await previewHas(page, 'tel:+49731555');
  await keys(page, ['Control'], 'y');
  await previewHas(page, 'v3-contact v3-v-card v3-bg-alt');
  assert.equal(await page.$eval('#st-redo-btn', (n) => n.disabled), true);
  await page.close();
});

test('German: labels, groups, hints, warning and errors', async () => {
  const { page, errors } = await openContact(1440, 900, { lang: 'de' });
  assert.deepEqual(await page.$$eval('#st-fields > .st-group', (n) => n.map((x) => x.textContent)), ['Adresse', 'Route']);
  assert.deepEqual(await page.$$eval('#st-fields > [data-path] label', (n) => n.map((x) => x.textContent)),
    ['Titel', 'Straße und Hausnummer', 'Adresszusatz', 'Postleitzahl', 'Ort', 'Land', 'Telefon', 'E-Mail', 'Karten-Link', 'Routen-Button anzeigen']);
  assert.equal(await page.$eval('#st-fields [data-path="data.showMapLink"] .st-hint', (n) => n.textContent), 'Der Button erscheint nur, wenn ein gültiger Karten-Link eingetragen ist.');
  await typeInto(page, fp('data.phone'), '+49 (0)731 1');
  await until(async () => /Lass die \(0\) nach der Ländervorwahl weg/.test(await warnShown(page)), 'warning');
  await typeInto(page, fp('data.email'), 'x');
  await until(async () => (await errorOf(page, 'data.email')) === 'Gib eine E-Mail-Adresse ein, z. B. name@beispiel.de.', 'email');
  await typeInto(page, fp('data.mapsUrl'), 'https://example.com');
  await until(async () => (await errorOf(page, 'data.mapsUrl')) === 'Nutze einen Link von Google Maps, Apple Maps oder OpenStreetMap.', 'maps');
  await tab(page, 'style');
  assert.deepEqual(await page.$$eval('#st-fields > [data-path] label', (n) => n.map((x) => x.textContent)), ['Hintergrund', 'Abstand']);
  assert.deepEqual(errors, []);
  await page.close();
});

test('an empty Contact: the preview shows the empty-section note (without the title); filling one field brings it back', async () => {
  const { page } = await openContact();
  for (const p of ['data.address.line1', 'data.address.postalCode', 'data.address.city', 'data.phone', 'data.email']) await typeInto(page, fp(p), '');
  await until(async () => /v3-ph-section/.test(await section(page)), 'empty note');
  assert.ok(!(await section(page)).includes('<h2'), 'the title is not shown');
  assert.equal(await stale(page), false, 'empty is valid');
  await typeInto(page, fp('data.address.city'), 'Ulm');
  await until(async () => (await section(page)).includes('<h2 class="v3-h2">Kontakt</h2>') && (await section(page)).includes('Ulm</address>'), 'back');
  await page.close();
});

test('hostile text stays text: escaped in the preview, nothing injected, no dialogs', async () => {
  const { page, errors } = await openContact();
  await typeInto(page, fp('data.title'), '<img src=x onerror=alert(1)>');
  await typeInto(page, fp('data.address.line1'), '"><svg onload=alert(2)>');
  await typeInto(page, fp('data.email'), 'a"><script>@x.de');
  await previewHas(page, '&lt;img src=x onerror=alert(1)&gt;');
  await previewHas(page, '&quot;&gt;&lt;svg onload=alert(2)&gt;');
  await until(async () => (await errorOf(page, 'data.email')) !== '', 'refused email');
  await sleep(400);
  const fr = await frame(page);
  assert.deepEqual(await fr.evaluate(() => ({ imgs: document.querySelectorAll('main img:not(.v3-gal-item img)').length, hero: [...document.querySelectorAll('main img:not(.v3-gal-item img)')].map((i) => i.className + (/^data:image\/(jpeg;base64,|svg\+xml,)/.test(i.getAttribute('src')) ? ' (demo photo)' : ' (OTHER SOURCE)')).join(), handlers: [...document.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length, svg: document.querySelectorAll('svg[onload]').length, scripts: document.scripts.length })), { imgs: 1, hero: 'v3-hero-img (demo photo)', handlers: 0, svg: 0, scripts: 1 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('Light and Dark: the Contact editor uses the Studio tokens; the warning is readable; no overflow', async () => {
  for (const theme of ['light', 'dark']) {
    const { page, errors, net } = await openContact(1440, 900, { theme });
    await typeInto(page, fp('data.phone'), '+49 (0)731 1');
    await until(async () => (await warnShown(page)) !== '', 'warning');
    const s = await page.evaluate(() => {
      const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
      const f = document.getElementById('st-fields');
      return { input: css('#st-fields [data-path="data.phone"] input', 'backgroundColor'), warn: css('#st-fields .st-warn', 'color'), warnBorder: css('#st-fields .st-warn', 'borderLeftColor'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, panel: f.scrollWidth - f.clientWidth };
    });
    assert.equal(s.input, theme === 'dark' ? 'rgb(23, 23, 25)' : 'rgb(255, 255, 255)', theme + ' inputs');
    assert.equal(s.warnBorder, 'rgb(255, 90, 31)', theme + ' warning marker');
    assert.notEqual(s.warn, s.input, theme + ' warning text visible');
    assert.equal(s.overflow, 0);
    assert.equal(s.panel, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(onlyLocal(net), []);
    await page.close();
  }
});

test('devices: Tablet and Mobile show the edit; both frames update side by side at 1920', async () => {
  const { page } = await openContact();
  await typeInto(page, fp('data.address.city'), 'Überall');
  for (const d of ['tablet', 'mobile', 'desktop']) {
    await page.click('button[data-device="' + d + '"]');
    await previewHas(page, '89073 Überall', d);
  }
  await page.close();
  const wide = await openContact(1920, 1080);
  assert.deepEqual(await wide.page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['desktop', 'mobile']);
  await typeInto(wide.page, fp('data.mapsUrl'), 'https://maps.apple.com/?q=Ulm');
  await previewHas(wide.page, 'href="https://maps.apple.com/?q=Ulm"', 'desktop');
  await previewHas(wide.page, 'href="https://maps.apple.com/?q=Ulm"', 'mobile');
  await wide.page.close();
});

test('phones: preview only; a click on the Contact section edits nothing', async () => {
  const { page, errors } = await open(390, 844);
  assert.equal(await page.$eval('#st-right', (n) => getComputedStyle(n).display), 'none');
  await clickInPreview(page, '[data-v3-id="' + C + '"] .v3-h2', 'mobile');
  await sleep(300);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'selection unchanged');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('after editing: no network beyond this server and Google Fonts; Save Draft and Publish disabled; only Hero, Buttons, Social Media and Contact editable', async () => {
  const { page, net, errors } = await openContact();
  await typeInto(page, fp('data.phone'), '+49 731 1');
  await typeInto(page, fp('data.mapsUrl'), 'https://maps.app.goo.gl/x');
  await sleep(400);
  assert.deepEqual(onlyLocal(net), []);
  assert.deepEqual(await page.$$eval('#st-save-btn, #st-publish-btn', (n) => n.map((b) => b.disabled)), [true, true]);
  for (const id of ['s_hero01', 's_quick01', 's_social01', C, 's_hours01', 's_prod01']) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true', id + ' editable');
  }
  // (Deals / Offers is editable since D2: studioDealsPreview.browser.test.js)
  for (const id of ['s_loyal01']) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'false', id);
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
