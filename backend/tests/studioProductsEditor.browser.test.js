// ============================================================
// studioProductsEditor.browser.test.js — Landing Page Studio V3, Phase
// 2A-3F: editing the Products section in a real browser (LOCAL ONLY: needs
// Chrome and puppeteer-core; prints SKIP and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. Checked: selection; Content /
// Style / Settings, with no Alignment; the title; adding (a named product),
// editing name / description / price / link / button text; the required
// name with the last valid preview; removing and Undo; reordering with
// buttons and Alt+arrows; one row open; the 24-product limit; the image
// shown (not changed); Grid / List; background and spacing; readable on all
// four backgrounds, desktop and mobile; link name, Show on page, Section
// ID; Undo / Redo; German; escaping; Light / Dark; Tablet / Mobile and both
// frames at 1920; phones preview only; no network; Save Draft / Publish
// disabled; the other types read-only.
// Run: node tests/studioProductsEditor.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioProductsEditor.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

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
const P = 's_prod01';
// a 1×1 PNG answered locally for the test image (no request leaves the machine)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/brot.jpg';

async function open(width, height, { theme = 'light', lang = 'en', images = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  if (images) {
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('https://res.cloudinary.com/') ? r.respond({ status: 200, contentType: 'image/png', body: PNG }) : r.continue()));
  }
  await page.evaluateOnNewDocument((t, l) => { try { localStorage.setItem('qraivy.studio.theme', t); localStorage.setItem('qraivy_lang', l); localStorage.removeItem('qraivy.studio.panels'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} }, theme, lang);
  const net = [], errors = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) net.push(u.host); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  return { page, net, errors };
}
// open the Studio with the Products section selected
async function openProducts(width = 1440, height = 900, opts) {
  const o = await open(width, height, opts);
  if (width >= 1200) { await o.page.click('#st-tab-sections'); await o.page.click('#st-outline [data-id="' + P + '"]'); }
  return o;
}
const srcdoc = (page, device = null) => page.$eval('#st-canvas iframe' + (device ? '[data-device="' + device + '"]' : ''), (f) => f.srcdoc);
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
async function frame(page, device = 'desktop') { return (await page.$('#st-canvas iframe[data-device="' + device + '"]')).contentFrame(); }
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
async function openRow(page, i) { if (!(await page.$(row(i) + '.is-open'))) await page.click(row(i) + ' .st-item__toggle'); }
const errorOf = (page, p) => page.$eval('#st-fields [data-path="' + p + '"] .st-err', (n) => (n.hidden ? '' : n.textContent));
const tab = (page, name) => page.click('[data-insp="' + name + '"]');
const stale = (page) => page.$eval('#st-stale', (n) => !n.hidden);
const section = async (page, device) => { const h = await srcdoc(page, device); const i = h.indexOf('data-v3-id="' + P + '"'); return i < 0 ? '' : h.slice(h.lastIndexOf('<section', i), h.indexOf('</section>', i)); };
const sectionHas = (page, s, device) => until(async () => (await section(page, device)).includes(s), 'section shows ' + s);
const names = async (page) => [...(await section(page)).matchAll(/<h3 class="v3-prod-name">([^<]*)<\/h3>/g)].map((m) => m[1]);
const rows = (page) => page.$$eval('#st-fields .st-item', (n) => n.map((x) => x.querySelector('.st-item__name').textContent + (x.querySelector('.st-item__kind').textContent ? ' · ' + x.querySelector('.st-item__kind').textContent : '')));
const BTN = '<a class="v3-btn v3-btn-primary v3-prod-btn"';
function onlyLocal(net) { return [...new Set(net)].filter((h) => h !== new URL(base).host && !FONT_HOSTS.includes(h)); }

test('selection from the Sections list and the preview; Content / Style / Settings; rows; no Alignment', async () => {
  const { page, errors } = await open(1440, 900);
  await clickInPreview(page, '[data-v3-id="' + P + '"] .v3-h2');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Products', 'selected from the preview');
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  const paths = () => page.$$eval('#st-fields > [data-path]', (n) => n.map((x) => x.getAttribute('data-path')));
  assert.deepEqual(await paths(), ['data.title', 'data.items']);
  assert.equal(await page.$eval('#st-fields .st-items__head', (n) => n.textContent), 'Products (3 / 24)');
  assert.deepEqual(await rows(page), ['Bauernbrot · 4,20 €', 'Butter-Croissant · 1,40 €', 'Laugenbrezel · 0,95 €']);
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 0, 'rows start closed');
  await openRow(page, 0);
  assert.deepEqual(await page.$$eval(row(0) + ' .st-item__body > [data-path]', (n) => n.map((x) => x.getAttribute('data-path'))),
    ['data.items[0].name', 'data.items[0].description', 'data.items[0].price', 'data.items[0].image', 'data.items[0].target', 'data.items[0].buttonText']);
  assert.deepEqual(await page.$$eval(row(0) + ' .st-item__body > [data-path] > span:first-child, ' + row(0) + ' .st-item__body > [data-path] label', (n) => [...new Set(n.map((x) => x.textContent.replace(/\d+ \/ \d+$/, '').trim()))]),
    ['Product name', 'Description', 'Price', 'Image', 'Link', 'Button text']);
  assert.deepEqual(await page.$$eval(it(0, 'name') + ',' + it(0, 'description') + ',' + it(0, 'price'), (n) => n.map((x) => x.value)), ['Bauernbrot', 'Sauerteig, 1 kg', '4,20 €']);
  assert.equal(await page.$eval(it(0, 'target', 'select'), (n) => n.value + '|' + n.options[n.selectedIndex].text), '|No link');
  assert.match(await page.$eval('#st-fields [data-path="data.items[0].image"] .st-hint', (n) => n.textContent), /Image upload arrives in a later step/);
  assert.equal(await page.$('#st-fields [data-path="data.items[0].image"] button'), null, 'no image buttons');
  await tab(page, 'style');
  assert.deepEqual(await paths(), ['variant', 'style.background', 'style.spacing'], 'no Alignment');
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.value + ':' + x.text)), ['grid:Grid', 'list:List']);
  await tab(page, 'settings');
  assert.deepEqual(await paths(), ['anchor', 'hidden', 'id']);
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), P);
  assert.deepEqual(errors, []);
  await page.close();
});

test('title reaches the preview, with its counter', async () => {
  const { page } = await openProducts();
  await typeInto(page, fp('data.title'), 'Frisch gebacken');
  await sectionHas(page, '<h2 class="v3-h2">Frisch gebacken</h2>');
  assert.equal(await page.$eval('#st-fields [data-path="data.title"] .st-count', (n) => n.textContent), '15 / 80');
  await page.close();
});

test('add: "New product" (named, so it shows at once), focus on its name; one Undo step', async () => {
  const { page, errors } = await openProducts();
  await page.click('#st-fields [data-action="add-item"]');
  await until(async () => (await page.$$eval('#st-fields .st-item', (n) => n.length)) === 4, 'four rows');
  assert.deepEqual(await page.$$eval('#st-fields .st-item.is-open', (n) => n.map((x) => x.getAttribute('data-index'))), ['3']);
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-path]').getAttribute('data-path')), 'data.items[3].name', 'focus on its name');
  assert.equal(await page.evaluate(() => document.activeElement.selectionEnd - document.activeElement.selectionStart), 'New product'.length, 'selected, so typing replaces it');
  await sectionHas(page, '<h3 class="v3-prod-name">New product</h3>');
  assert.equal(await stale(page), false);
  await page.keyboard.type('Semmel');
  await sectionHas(page, '<h3 class="v3-prod-name">Semmel</h3>');
  await page.evaluate(() => document.activeElement.blur());
  await page.click('#st-undo-btn');
  await sectionHas(page, '<h3 class="v3-prod-name">New product</h3>');
  await page.click('#st-undo-btn');
  await until(async () => (await names(page)).join() === 'Bauernbrot,Butter-Croissant,Laugenbrezel', 'add undone in one step');
  assert.deepEqual(errors, []);
  await page.close();
});

test('edit a product: name, description, price as written, link (section or address) and button text; the button only with a link', async () => {
  const { page } = await openProducts();
  await openRow(page, 1);
  await typeInto(page, it(1, 'name'), 'Butterhörnchen');
  await typeInto(page, it(1, 'description'), 'Mit französischer Butter');
  await typeInto(page, it(1, 'price'), 'ab 1,60 €');
  await sectionHas(page, '<h3 class="v3-prod-name">Butterhörnchen</h3><p class="v3-prod-desc">Mit französischer Butter</p><p class="v3-prod-price">ab 1,60 €</p>');
  assert.ok(!(await section(page)).includes(BTN), 'no link yet: no button');
  assert.match(await page.$eval('#st-fields [data-path="data.items[1].buttonText"] .st-hint', (n) => (n.hidden ? '' : n.textContent)), /appears only when the product has a link/);
  await page.select(it(1, 'target', 'select'), '/kontakt');
  await sectionHas(page, BTN + ' href="#kontakt"><span>Ansehen</span></a>');
  await typeInto(page, it(1, 'buttonText'), 'Vorbestellen');
  await sectionHas(page, BTN + ' href="#kontakt"><span>Vorbestellen</span></a>');
  await page.select(it(1, 'target', 'select'), '__custom');
  await typeInto(page, '#st-fields [data-path="data.items[1].target"] input', 'https://shop.example.com/hoernchen');
  await sectionHas(page, BTN + ' href="https://shop.example.com/hoernchen" target="_blank" rel="noopener noreferrer"><span>Vorbestellen</span></a>');
  assert.deepEqual(await rows(page), ['Bauernbrot · 4,20 €', 'Butterhörnchen · ab 1,60 €', 'Laugenbrezel · 0,95 €']);
  await typeInto(page, '#st-fields [data-path="data.items[1].target"] input', 'javascript:alert(1)');
  await until(async () => /https:\/\/, mailto: or tel:/.test(await errorOf(page, 'data.items[1].target')), 'invalid link');
  assert.equal(await stale(page), true);
  await page.close();
});

test('the name is required: an empty name shows the error, the "(no name)" row and the last valid preview', async () => {
  const { page } = await openProducts();
  await openRow(page, 2);
  await typeInto(page, it(2, 'name'), '');
  await until(async () => (await errorOf(page, 'data.items[2].name')) === 'Required.', 'required');
  assert.equal(await stale(page), true);
  assert.equal((await rows(page))[2], '(no name) · 0,95 €');
  assert.equal(await page.$eval(row(2), (n) => n.classList.contains('has-error') && n.querySelector('.st-item__err').textContent), '1 error');
  await sleep(250);
  assert.ok((await names(page)).includes('Laugenbrezel'), 'the preview keeps the last valid name');
  await page.keyboard.type('Brezel');
  await sectionHas(page, '<h3 class="v3-prod-name">Brezel</h3>');
  assert.equal(await stale(page), false);
  await page.close();
});

test('remove + Undo; reorder with Move up / down and Alt+arrows; one row open at a time', async () => {
  const { page } = await openProducts();
  await page.click(row(1) + ' [data-action="remove-item"]');
  await until(async () => (await names(page)).join() === 'Bauernbrot,Laugenbrezel', 'removed');
  await until(async () => /Product removed\. Undo is available\./.test(await page.$eval('#st-live', (n) => n.textContent)), 'announced');
  await page.click('#st-undo-btn');
  await until(async () => (await names(page)).join() === 'Bauernbrot,Butter-Croissant,Laugenbrezel', 'back');
  await page.click(row(0) + ' [data-action="move-down"]');
  await until(async () => (await names(page)).join() === 'Butter-Croissant,Bauernbrot,Laugenbrezel', 'moved down');
  await page.focus(row(2) + ' .st-item__toggle');
  await keys(page, ['Alt'], 'ArrowUp');
  await until(async () => (await names(page)).join() === 'Butter-Croissant,Laugenbrezel,Bauernbrot', 'Alt+ArrowUp');
  await until(async () => /Product moved\./.test(await page.$eval('#st-live', (n) => n.textContent)), 'announced');
  await openRow(page, 0);
  await page.click(row(1) + ' .st-item__toggle');
  assert.deepEqual(await page.$$eval('#st-fields .st-item.is-open', (n) => n.map((x) => x.getAttribute('data-index'))), ['1']);
  await page.close();
});

test('at most 24 products: Add is disabled and says so', async () => {
  const { page } = await openProducts();
  for (let n = 3; n < 24; n++) await page.click('#st-fields [data-action="add-item"]');
  await until(async () => (await page.$$eval('#st-fields .st-item', (n) => n.length)) === 24, '24 rows');
  assert.equal(await page.$eval('#st-fields [data-action="add-item"]', (n) => n.disabled + '|' + n.textContent), 'true|Add product');
  assert.equal(await page.$eval('#st-fields [data-hint="max"]', (n) => !n.hidden && n.textContent), 'Up to 24 products.');
  assert.equal(await page.$eval('#st-fields .st-items__count', (n) => n.textContent), '(24 / 24)');
  assert.equal(await stale(page), false, 'all named: valid');
  await page.close();
});

test('an existing product image is shown (not changed); the preview and the page use it', async () => {
  const { page, net } = await openProducts(1440, 900, { images: true });
  await page.evaluate((id, img) => window.QraivyStudio.editor.set(id, ['data', 'items', 0, 'image'], img), P, IMG);
  await sectionHas(page, '<img class="v3-prod-img" src="' + IMG + '" alt="Bauernbrot"');
  await openRow(page, 0);
  assert.equal(await page.$eval('#st-fields [data-path="data.items[0].image"] .st-field__thumb img', (n) => n.getAttribute('src')), IMG);
  assert.equal(await page.$eval('#st-fields [data-path="data.items[0].image"] .st-field__thumb', (n) => n.classList.contains('has-img')), true);
  assert.equal(await page.$('#st-fields [data-path="data.items[0].image"] input, #st-fields [data-path="data.items[0].image"] button'), null, 'no way to change it here');
  await openRow(page, 1);
  assert.equal(await page.$eval('#st-fields [data-path="data.items[1].image"] .st-field__thumb', (n) => n.classList.contains('has-img') + '|' + n.title), 'false|No image yet');
  assert.ok(onlyLocal(net).every((h) => h === 'res.cloudinary.com'), 'only the intercepted test image');
  await page.close();
});

test('Style: Grid / List, background and spacing', async () => {
  const { page } = await openProducts();
  await tab(page, 'style');
  for (const v of ['list', 'grid']) {
    await page.select(fp('variant', 'select'), v);
    await sectionHas(page, '<div class="v3-prods v3-prods-' + v + '">');
  }
  for (const [bg, sp] of [['alt', 'compact'], ['dark', 'roomy'], ['brand', 'normal'], ['default', 'normal']]) {
    await page.select(fp('style.background', 'select'), bg);
    await page.select(fp('style.spacing', 'select'), sp);
    await sectionHas(page, 'class="v3-s v3-products v3-v-grid v3-bg-' + bg + ' v3-al-left v3-sp-' + sp + '"');
  }
  await page.close();
});

const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lumOf = (c) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const x = lumOf(rgb(a)), y = lumOf(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
test('readable on Default, Alternate, Dark and Brand, desktop and mobile, in Grid and List: the title on the section, the card texts on the card', async () => {
  const { page } = await openProducts();
  await openRow(page, 0);
  await page.select(it(0, 'target', 'select'), '/kontakt');
  await tab(page, 'style');
  for (const dev of ['desktop', 'mobile']) {
    if (dev === 'mobile') await page.click('button[data-device="mobile"]');
    for (const v of ['grid', 'list']) {
      await page.select(fp('variant', 'select'), v);
      for (const bg of ['default', 'alt', 'dark', 'brand']) {
        await page.select(fp('style.background', 'select'), bg);
        const fr = await until(async () => { const f = await frame(page, dev); return (await f.$('[data-v3-id="' + P + '"].v3-bg-' + bg + ' .v3-prods-' + v + ' .v3-prod-btn').catch(() => null)) ? f : null; }, dev + ' ' + v + ' ' + bg);
        const c = await fr.$eval('[data-v3-id="' + P + '"]', (n) => {
          const cs = (q) => getComputedStyle(n.querySelector(q));
          let sec = getComputedStyle(n).backgroundColor;
          if (/rgba\(0, 0, 0, 0\)/.test(sec)) sec = getComputedStyle(document.body).backgroundColor;
          return { sec, title: cs('.v3-h2').color, card: cs('.v3-prod').backgroundColor, name: cs('.v3-prod-name').color, desc: cs('.v3-prod-desc').color, price: cs('.v3-prod-price').color, btn: cs('.v3-prod-btn').color, btnBg: cs('.v3-prod-btn').backgroundColor };
        });
        const what = dev + ' ' + v + ' ' + bg;
        assert.ok(ratio(c.title, c.sec) >= (bg === 'brand' ? 3 : 4.5), what + ': title ' + c.title + ' on ' + c.sec);
        assert.ok(ratio(c.name, c.card) >= 4.5 && ratio(c.desc, c.card) >= 4.5, what + ': card texts');
        assert.ok(ratio(c.price, c.card) >= 3 && ratio(c.btn, c.btnBg) >= 3, what + ': price and button');
        assert.equal(c.card, 'rgb(255, 255, 255)', what + ': the card keeps its own colours');
      }
    }
  }
  await page.close();
});

test('Settings: link name (links follow it), Show on page, read-only Section ID', async () => {
  const { page } = await openProducts();
  await tab(page, 'settings');
  await typeInto(page, fp('anchor'), 'sortiment');
  await page.keyboard.press('Enter');
  await until(async () => (await srcdoc(page)).includes('id="sortiment"') && (await srcdoc(page)).includes('href="#sortiment"'), 'renamed, links follow');
  await page.click(fp('hidden'));
  await until(async () => !(await srcdoc(page)).includes('data-v3-id="' + P + '"'), 'hidden');
  await page.click(fp('hidden'));
  await until(async () => (await srcdoc(page)).includes('data-v3-id="' + P + '"'), 'shown');
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), P);
  await page.close();
});

test('Undo / Redo across Products edits, buttons and keyboard; typing is one step', async () => {
  const { page } = await openProducts();
  await openRow(page, 0);
  await typeInto(page, it(0, 'price'), '4,50 €');
  await page.evaluate(() => document.activeElement.blur());
  await sectionHas(page, '<p class="v3-prod-price">4,50 €</p>');
  await page.click(row(0) + ' [data-action="move-down"]');
  await until(async () => (await names(page))[0] === 'Butter-Croissant', 'moved');
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'list');
  await sectionHas(page, 'v3-prods-list');
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await sectionHas(page, 'v3-prods-grid');
  await keys(page, ['Control'], 'z');
  await until(async () => (await names(page))[0] === 'Bauernbrot', 'move undone');
  await keys(page, ['Control'], 'z');
  await sectionHas(page, '<p class="v3-prod-price">4,20 €</p>');
  await keys(page, ['Control', 'Shift'], 'z');
  await sectionHas(page, '<p class="v3-prod-price">4,50 €</p>');
  await page.click('#st-redo-btn');
  await until(async () => (await names(page))[0] === 'Butter-Croissant', 'move redone');
  await keys(page, ['Control'], 'y');
  await sectionHas(page, 'v3-prods-list');
  assert.equal(await page.$eval('#st-redo-btn', (n) => n.disabled), true);
  await page.close();
});

test('German: heading, labels, hints, buttons, layout names', async () => {
  const { page, errors } = await openProducts(1440, 900, { lang: 'de' });
  assert.equal(await page.$eval('#st-fields .st-items__head', (n) => n.textContent), 'Produkte (3 / 24)');
  assert.equal(await page.$eval('#st-fields [data-action="add-item"]', (n) => n.textContent), 'Produkt hinzufügen');
  await openRow(page, 0);
  assert.match(await page.$eval('#st-fields [data-path="data.items[0].image"] .st-hint', (n) => n.textContent), /Bilder hochladen folgt/);
  assert.match(await page.$eval('#st-fields [data-path="data.items[0].price"] .st-hint', (n) => n.textContent), /ab 9 €/);
  assert.equal(await page.$eval('#st-fields [data-path="data.items[0].name"] label', (n) => n.textContent), 'Produktname');
  await typeInto(page, it(0, 'name'), '');
  await until(async () => (await errorOf(page, 'data.items[0].name')) === 'Pflichtfeld.', 'required');
  await tab(page, 'style');
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.text)), ['Raster', 'Liste']);
  assert.deepEqual(errors, []);
  await page.close();
});

test('hostile text stays text: escaped in the preview, nothing injected, no dialogs', async () => {
  const { page, errors } = await openProducts();
  await typeInto(page, fp('data.title'), '<img src=x onerror=alert(1)>');
  await openRow(page, 0);
  await typeInto(page, it(0, 'name'), '"><svg onload=alert(2)>');
  await typeInto(page, it(0, 'price'), '<b>9</b>');
  await sectionHas(page, '&lt;img src=x onerror=alert(1)&gt;');
  await sectionHas(page, '&quot;&gt;&lt;svg onload=alert(2)&gt;');
  await sectionHas(page, '&lt;b&gt;9&lt;/b&gt;');
  await sleep(400);
  const fr = await frame(page);
  assert.deepEqual(await fr.evaluate(() => ({ imgs: document.querySelectorAll('main img:not([src^="images/deals/starter/"])').length, svg: document.querySelectorAll('svg[onload]').length, b: document.querySelectorAll('.v3-prod-price b').length, scripts: document.scripts.length })), { imgs: 0, svg: 0, b: 0, scripts: 1 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('Light and Dark: the Products editor uses the Studio tokens; no overflow', async () => {
  for (const theme of ['light', 'dark']) {
    const { page, errors, net } = await openProducts(1440, 900, { theme });
    await openRow(page, 0);
    const s = await page.evaluate(() => {
      const f = document.getElementById('st-fields');
      const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
      const over = [...f.querySelectorAll('.st-field, .st-item__head')].filter((n) => n.scrollWidth > n.clientWidth + 1).length;
      return { row: css('#st-fields .st-item', 'backgroundColor'), input: css('#st-fields .st-item__body input', 'backgroundColor'), open: css('#st-fields .st-item.is-open', 'borderTopColor'), over, panel: f.scrollWidth - f.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const bg = theme === 'dark' ? 'rgb(23, 23, 25)' : 'rgb(255, 255, 255)';
    assert.deepEqual([s.row, s.input, s.open], [bg, bg, 'rgb(255, 90, 31)'], theme);
    assert.deepEqual([s.over, s.panel, s.page], [0, 0, 0], theme + ': no overflow');
    assert.deepEqual(errors, []);
    assert.deepEqual(onlyLocal(net), []);
    await page.close();
  }
});

test('devices: Tablet and Mobile show the edit; both frames update side by side at 1920', async () => {
  const { page } = await openProducts();
  await typeInto(page, fp('data.title'), 'Überall');
  for (const d of ['tablet', 'mobile', 'desktop']) {
    await page.click('button[data-device="' + d + '"]');
    await sectionHas(page, '<h2 class="v3-h2">Überall</h2>', d);
  }
  await page.close();
  const wide = await openProducts(1920, 1080);
  assert.deepEqual(await wide.page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['desktop', 'mobile']);
  await openRow(wide.page, 2);
  await typeInto(wide.page, it(2, 'name'), 'Beide');
  await sectionHas(wide.page, '<h3 class="v3-prod-name">Beide</h3>', 'desktop');
  await sectionHas(wide.page, '<h3 class="v3-prod-name">Beide</h3>', 'mobile');
  await wide.page.close();
});

test('phones: preview only; a click on the Products section edits nothing', async () => {
  const { page, errors } = await open(390, 844);
  assert.equal(await page.$eval('#st-right', (n) => getComputedStyle(n).display), 'none');
  await clickInPreview(page, '[data-v3-id="' + P + '"] .v3-h2', 'mobile');
  await sleep(300);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'selection unchanged');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('after editing: no network beyond this server and Google Fonts; Save Draft and Publish disabled; only the six editors editable', async () => {
  const { page, net, errors } = await openProducts();
  await page.click('#st-fields [data-action="add-item"]');
  await page.click(row(0) + ' [data-action="remove-item"]');
  await sleep(400);
  assert.deepEqual(onlyLocal(net), []);
  assert.deepEqual(await page.$$eval('#st-save-btn, #st-publish-btn', (n) => n.map((b) => b.disabled)), [true, true]);
  for (const id of ['s_hero01', 's_quick01', 's_social01', 's_contact1', 's_hours01', P]) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true', id + ' editable');
  }
  for (const id of ['s_deals01', 's_loyal01']) {
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
