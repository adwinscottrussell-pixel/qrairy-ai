// ============================================================
// studioGalleryEditor.browser.test.js — Landing Page Studio V3, Phase
// 2A-3H: editing the Gallery section in a real browser (LOCAL ONLY: needs
// Chrome and puppeteer-core; prints SKIP and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. Checked: the demo's three starter
// photos, shown from the Studio's own files with the AI label and no
// request to Cloudinary; selection; Content / Style / Settings; Add image
// disabled with its reason; title, descriptions and captions with counters
// and the last valid preview; removing and Undo; reordering with buttons and
// Alt+arrows; one row open; Grid (4 / 3 / 2 columns on desktop / tablet /
// mobile) and Carousel (scrolls sideways); background / alignment /
// spacing; captions readable on all four backgrounds; link name, Show on
// page, Section ID; Undo / Redo; German; escaping; Light / Dark; devices and
// both frames at 1920; the tablet drawer; phones preview only; an emptied
// gallery; no network; Save Draft / Publish disabled.
// Run: node tests/studioGalleryEditor.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioGalleryEditor.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
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
const G = 's_gal01';
const IDS = ['bakery-croissants-01', 'bakery-bread-01', 'bakery-coffee-01'];
const CLD = (id) => 'https://res.cloudinary.com/dwqc6n7rn/image/upload/c_fill,g_auto,h_900,w_1200,f_auto,q_auto/qraivy-deal-starters/' + id + '.jpg';
const LOCAL = (id) => 'images/deals/starter/' + id + '.jpg';

async function open(width, height, { theme = 'light', lang = 'en' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((t, l) => { try { localStorage.setItem('qraivy.studio.theme', t); localStorage.setItem('qraivy_lang', l); localStorage.removeItem('qraivy.studio.panels'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} }, theme, lang);
  const net = [], urls = [], errors = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) { net.push(u.host); urls.push(r.url()); } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  return { page, net, urls, errors };
}
// open the Studio with the Gallery section selected
async function openGallery(width = 1440, height = 900, opts) {
  const o = await open(width, height, opts);
  if (width >= 1200) { await o.page.click('#st-tab-sections'); await o.page.click('#st-outline [data-id="' + G + '"]'); }
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
const it = (i, k, tag = 'input') => fp('data.images[' + i + '].' + k, tag);
const row = (i) => '#st-fields .st-item[data-index="' + i + '"]';
async function openRow(page, i) { if (!(await page.$(row(i) + '.is-open'))) await page.click(row(i) + ' .st-item__toggle'); }
const errorOf = (page, p) => page.$eval('#st-fields [data-path="' + p + '"] .st-err', (n) => (n.hidden ? '' : n.textContent));
const tab = (page, name) => page.click('[data-insp="' + name + '"]');
const section = async (page, device) => { const h = await srcdoc(page, device); const i = h.indexOf('data-v3-id="' + G + '"'); return i < 0 ? '' : h.slice(h.lastIndexOf('<section', i), h.indexOf('</section>', i)); };
const sectionHas = (page, s, device) => until(async () => (await section(page, device)).includes(s), 'section shows ' + s);
const captions = async (page) => [...(await section(page)).matchAll(/<figcaption>([^<]*)<\/figcaption>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const rows = (page) => page.$$eval('#st-fields .st-item', (n) => n.map((x) => x.querySelector('.st-item__name').textContent));
function onlyLocal(net) { return [...new Set(net)].filter((h) => h !== new URL(base).host && !FONT_HOSTS.includes(h)); }
// the rendered gallery in a preview frame
async function galleryIn(page, device, variant) {
  const fr = await until(async () => { const f = await frame(page, device); return (await f.$('[data-v3-id="' + G + '"] .v3-gal-' + variant).catch(() => null)) ? f : null; }, device + ' ' + variant);
  return fr.$eval('[data-v3-id="' + G + '"]', (n) => {
    const gal = n.querySelector('.v3-gal'), cs = getComputedStyle(gal), item = n.querySelector('.v3-gal-item');
    return { display: cs.display, columns: cs.display === 'grid' ? cs.gridTemplateColumns.split(' ').length : 0, overflowX: cs.overflowX,
      scrolls: gal.scrollWidth > gal.clientWidth + 1, itemShare: Math.round(item.getBoundingClientRect().width / gal.clientWidth * 100),
      imgs: [...n.querySelectorAll('.v3-gal-item img')].map((i) => ({ inline: /^data:image\/jpeg;base64,/.test(i.getAttribute('src')), alt: i.getAttribute('alt'), loaded: i.complete && i.naturalWidth > 0 })),
      badges: [...n.querySelectorAll('.st-ai')].map((b) => ({ text: b.textContent, shown: b.getBoundingClientRect().width > 0 && getComputedStyle(b).position === 'absolute' })) };
  });
}

test('the demo Gallery: three starter photos loaded from the Studio\'s own files by the Studio page, shown inline in the preview with the AI label; no request to Cloudinary', async () => {
  const { page, net, urls, errors } = await open(1440, 900);
  const fr = await frame(page);
  await fr.evaluate((id) => document.querySelector('[data-v3-id="' + id + '"]').scrollIntoView(), G);
  await until(async () => (await galleryIn(page, 'desktop', 'grid')).imgs.every((i) => i.loaded && i.inline), 'inline photos loaded');
  const g = await galleryIn(page, 'desktop', 'grid');
  assert.equal(g.imgs.length, 3);
  assert.ok(!(await srcdoc(page)).includes('images/deals/starter/'), 'the frame HTML has no file path (it would miss a sign-in cookie)');
  assert.deepEqual(g.badges, IDS.map(() => ({ text: 'AI · KI-generiert', shown: true })));
  assert.ok(!urls.some((u) => /res\.cloudinary\.com/.test(u)), 'no Cloudinary request');
  assert.deepEqual(onlyLocal(net), []);
  for (const id of IDS) assert.ok(urls.includes(base + '/' + LOCAL(id)), id + ' from this server');
  assert.deepEqual(errors, []);
  await page.close();
});

test('selected from the Sections list and the preview; Content / Style / Settings; rows; Add image disabled with its reason; the photo shown, not changed', async () => {
  const { page, errors } = await open(1440, 900);
  await clickInPreview(page, '[data-v3-id="' + G + '"] .v3-h2');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Gallery', 'selected from the preview');
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  const paths = () => page.$$eval('#st-fields > [data-path]', (n) => n.map((x) => x.getAttribute('data-path')));
  assert.deepEqual(await paths(), ['data.title', 'data.images']);
  assert.equal(await page.$eval('#st-fields .st-items__head', (n) => n.textContent), 'Images (3 / 24)');
  assert.deepEqual(await rows(page), ['Croissants & Plunder', 'Unsere Brote', 'Kaffee & Kuchen']);
  const add = await page.$eval('#st-fields [data-action="add-item"]', (n) => ({ text: n.textContent, disabled: n.disabled, title: n.title }));
  assert.deepEqual(add, { text: 'Add image', disabled: true, title: 'Adding images arrives with image upload in a later step.' });
  assert.equal(await page.$eval('#st-fields [data-hint="add_later"]', (n) => !n.hidden && n.textContent), 'Adding images arrives with image upload in a later step.');
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 0, 'rows start closed');
  await openRow(page, 0);
  assert.deepEqual(await page.$$eval(row(0) + ' .st-item__body > [data-path]', (n) => n.map((x) => x.getAttribute('data-path'))), ['data.images[0].image', 'data.images[0].alt', 'data.images[0].caption']);
  assert.deepEqual(await page.$$eval(row(0) + ' .st-item__body > [data-path] > span:first-child, ' + row(0) + ' .st-item__body > [data-path] label', (n) => [...new Set(n.map((x) => x.textContent.replace(/\d+ \/ \d+$/, '').trim()))]), ['Image', 'Image description', 'Caption']);
  const thumb = await page.$eval(fp('data.images[0].image', '.st-field__thumb'), (n) => ({ src: n.querySelector('img').getAttribute('src'), stored: n.querySelector('img').getAttribute('data-src'), ai: (n.querySelector('.st-thumb-ai') || {}).textContent }));
  assert.deepEqual(thumb, { src: LOCAL(IDS[0]), stored: CLD(IDS[0]), ai: 'AI · KI-generiert' });
  assert.equal(await page.$('#st-fields [data-path="data.images[0].image"] button, #st-fields [data-path="data.images[0].image"] input'), null, 'no way to change the photo here');
  assert.match(await page.$eval(fp('data.images[0].image', '.st-hint'), (n) => n.textContent), /Replacing an image arrives with image upload/);
  assert.match(await page.$eval(fp('data.images[0].alt', '.st-hint'), (n) => n.textContent), /screen readers skip/);
  assert.deepEqual(await page.$$eval(it(0, 'alt') + ',' + it(0, 'caption'), (n) => n.map((x) => x.value)), ['Croissants und Plundergebäck auf einem Holzbrett', 'Croissants & Plunder']);
  await tab(page, 'style');
  assert.deepEqual(await paths(), ['variant', 'style.background', 'style.align', 'style.spacing']);
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.value + ':' + x.text)), ['grid:Grid', 'carousel:Carousel']);
  await tab(page, 'settings');
  assert.deepEqual(await paths(), ['anchor', 'hidden', 'id']);
  assert.equal(await page.$eval(fp('anchor'), (n) => n.value), 'galerie');
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), G);
  assert.deepEqual(errors, []);
  await page.close();
});

test('title, description and caption reach the preview with counters; too long shows the error and keeps the last valid preview', async () => {
  const { page } = await openGallery();
  await typeInto(page, fp('data.title'), 'Frisch aus dem Ofen');
  await sectionHas(page, '<h2 class="v3-h2">Frisch aus dem Ofen</h2>');
  assert.equal(await page.$eval('#st-fields [data-path="data.title"] .st-count', (n) => n.textContent), '19 / 80');
  await openRow(page, 1);
  await typeInto(page, it(1, 'alt'), 'Drei Brote');
  await sectionHas(page, 'alt="Drei Brote"');
  await typeInto(page, it(1, 'caption'), 'Sauerteigbrot');
  await sectionHas(page, '<figcaption>Sauerteigbrot</figcaption>');
  assert.equal(await page.$eval('#st-fields [data-path="data.images[1].caption"] .st-count', (n) => n.textContent), '13 / 120');
  assert.deepEqual(await rows(page), ['Croissants & Plunder', 'Sauerteigbrot', 'Kaffee & Kuchen'], 'the row follows the caption');
  await typeInto(page, it(1, 'caption'), 'x'.repeat(121));
  await until(async () => /at most 120/.test(await errorOf(page, 'data.images[1].caption')), 'too long');
  assert.equal(await page.$eval('#st-stale', (n) => !n.hidden), true);
  assert.ok((await captions(page)).includes('Sauerteigbrot'), 'the last valid caption stays');
  assert.equal(await page.$eval(row(1), (n) => n.classList.contains('has-error')), true);
  await page.close();
});

test('remove + Undo; reorder with Move up / down and Alt+arrows; one row open at a time; the photos follow', async () => {
  const { page } = await openGallery();
  await page.click(row(1) + ' [data-action="remove-item"]');
  await until(async () => (await captions(page)).join() === 'Croissants & Plunder,Kaffee & Kuchen', 'removed');
  assert.equal(await page.$eval('#st-fields .st-items__head', (n) => n.textContent), 'Images (2 / 24)');
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await until(async () => (await captions(page)).length === 3, 'restored');
  await page.click(row(0) + ' [data-action="move-down"]');
  await until(async () => (await captions(page))[0] === 'Unsere Brote', 'moved down');
  await page.focus(row(2) + ' .st-item__toggle');
  await keys(page, ['Alt'], 'ArrowUp');
  await until(async () => (await captions(page)).join() === 'Unsere Brote,Kaffee & Kuchen,Croissants & Plunder', 'Alt+ArrowUp');
  const g = await galleryIn(page, 'desktop', 'grid');
  assert.deepEqual(g.imgs.map((i) => i.alt.split(' ')[0]), ['Frisch', 'Cappuccino', 'Croissants'], 'the photos move with their captions');
  await openRow(page, 0);
  await openRow(page, 2);
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 1);
  assert.equal(await page.$eval(row(0) + ' [data-action="move-up"]', (n) => n.disabled), true);
  await page.close();
});

test('Grid: 4 / 3 / 2 columns on desktop / tablet / mobile; Carousel: one row that scrolls sideways (80 % per photo on mobile); the photos and labels in both', async () => {
  const { page } = await openGallery();
  for (const [dev, cols] of [['desktop', 4], ['tablet', 3], ['mobile', 2]]) {
    if (dev !== 'desktop') await page.click('button[data-device="' + dev + '"]');
    const g = await galleryIn(page, dev, 'grid');
    assert.deepEqual([g.display, g.columns, g.imgs.length, g.badges.length], ['grid', cols, 3, 3], dev);
  }
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'carousel');
  const m = await galleryIn(page, 'mobile', 'carousel');
  assert.deepEqual([m.display, m.overflowX, m.scrolls], ['flex', 'auto', true], 'mobile carousel scrolls');
  assert.ok(m.itemShare >= 75 && m.itemShare <= 85, 'about 80 % per photo: ' + m.itemShare);
  await page.click('button[data-device="desktop"]');
  const d = await galleryIn(page, 'desktop', 'carousel');
  assert.deepEqual([d.display, d.scrolls, d.imgs.length, d.badges.length], ['flex', true, 3, 3]);
  assert.ok(d.itemShare >= 35 && d.itemShare <= 45, 'about 40 % per photo: ' + d.itemShare);
  await page.close();
});

test('Style: layout, background, alignment and spacing reach the preview', async () => {
  const { page } = await openGallery();
  await tab(page, 'style');
  for (const [v, bg, al, sp] of [['carousel', 'alt', 'center', 'compact'], ['grid', 'dark', 'left', 'roomy'], ['carousel', 'brand', 'center', 'normal'], ['grid', 'default', 'left', 'normal']]) {
    await page.select(fp('variant', 'select'), v);
    await page.select(fp('style.background', 'select'), bg);
    await page.select(fp('style.align', 'select'), al);
    await page.select(fp('style.spacing', 'select'), sp);
    await sectionHas(page, 'class="v3-s v3-gallery v3-v-' + v + ' v3-bg-' + bg + ' v3-al-' + al + ' v3-sp-' + sp + '"');
    await sectionHas(page, '<div class="v3-gal v3-gal-' + v + '"');
  }
  await page.close();
});

const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
const lumOf = (c) => { const v = c.slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
// the caption colour as drawn: its colour at its opacity over the section
const blend = (fg, opacity, bgc) => { const f = rgb(fg), b = rgb(bgc); return 'rgb(' + [0, 1, 2].map((i) => Math.round(f[i] * opacity + b[i] * (1 - opacity))).join(', ') + ')'; };
const ratio = (a, b) => { const x = lumOf(rgb(a)), y = lumOf(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
test('readable on Default, Alternate, Dark and Brand, desktop and mobile: the title and the captions on the section', async () => {
  const { page } = await openGallery();
  await tab(page, 'style');
  for (const dev of ['desktop', 'mobile']) {
    if (dev === 'mobile') await page.click('button[data-device="mobile"]');
    for (const bg of ['default', 'alt', 'dark', 'brand']) {
      await page.select(fp('style.background', 'select'), bg);
      const fr = await until(async () => { const f = await frame(page, dev); return (await f.$('[data-v3-id="' + G + '"].v3-bg-' + bg).catch(() => null)) ? f : null; }, dev + ' ' + bg);
      const c = await fr.$eval('[data-v3-id="' + G + '"]', (n) => {
        let sec = getComputedStyle(n).backgroundColor;
        if (/rgba\(0, 0, 0, 0\)/.test(sec)) sec = getComputedStyle(document.body).backgroundColor;
        const cap = getComputedStyle(n.querySelector('figcaption'));
        return { sec, h: getComputedStyle(n.querySelector('.v3-h2')).color, cap: cap.color, op: Number(cap.opacity) };
      });
      const min = bg === 'brand' ? 3 : 4.5;
      assert.ok(ratio(c.h, c.sec) >= min, dev + ' ' + bg + ' title: ' + JSON.stringify(c));
      assert.ok(ratio(blend(c.cap, c.op, c.sec), c.sec) >= min, dev + ' ' + bg + ' caption: ' + JSON.stringify(c));
    }
  }
  await page.close();
});

test('Settings: link name, Show on page, read-only Section ID', async () => {
  const { page } = await openGallery();
  await tab(page, 'settings');
  await typeInto(page, fp('anchor'), 'fotos');
  await page.keyboard.press('Enter');
  await until(async () => (await srcdoc(page)).includes('<section id="fotos"'), 'renamed');
  await page.click(fp('hidden'));
  await until(async () => !(await srcdoc(page)).includes('data-v3-id="' + G + '"'), 'hidden');
  await page.click(fp('hidden'));
  await until(async () => (await srcdoc(page)).includes('data-v3-id="' + G + '"'), 'shown');
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), G);
  await page.close();
});

test('Undo / Redo across Gallery edits, buttons and keyboard; typing is one step', async () => {
  const { page } = await openGallery();
  await openRow(page, 0);
  await typeInto(page, it(0, 'caption'), 'Neu');
  await page.evaluate(() => document.activeElement.blur());
  await sectionHas(page, '<figcaption>Neu</figcaption>');
  await page.click(row(0) + ' [data-action="move-down"]');
  await until(async () => (await captions(page))[1] === 'Neu', 'moved');
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'carousel');
  await sectionHas(page, 'v3-gal-carousel');
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await sectionHas(page, 'v3-gal-grid');
  await page.click('#st-undo-btn');
  await until(async () => (await captions(page))[0] === 'Neu', 'move undone');
  await keys(page, ['Control'], 'z');
  await sectionHas(page, '<figcaption>Croissants &amp; Plunder</figcaption>');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true, 'the typing was one step');
  await keys(page, ['Control', 'Shift'], 'z');
  await sectionHas(page, '<figcaption>Neu</figcaption>');
  await page.click('#st-redo-btn');
  await until(async () => (await captions(page))[1] === 'Neu', 'move redone');
  await keys(page, ['Control'], 'y');
  await sectionHas(page, 'v3-gal-carousel');
  assert.equal(await page.$eval('#st-redo-btn', (n) => n.disabled), true);
  await page.close();
});

test('German: heading, labels, hints, the disabled Add, layout names', async () => {
  const { page, errors } = await openGallery(1440, 900, { lang: 'de' });
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Galerie');
  assert.equal(await page.$eval('#st-fields .st-items__head', (n) => n.textContent), 'Bilder (3 / 24)');
  assert.equal(await page.$eval('#st-fields [data-action="add-item"]', (n) => n.textContent + '|' + n.disabled), 'Bild hinzufügen|true');
  assert.match(await page.$eval('#st-fields [data-hint="add_later"]', (n) => n.textContent), /Bilder hinzufügen folgt mit dem Bilder-Upload/);
  await openRow(page, 0);
  assert.equal(await page.$eval('#st-fields [data-path="data.images[0].alt"] label', (n) => n.textContent), 'Bildbeschreibung');
  assert.equal(await page.$eval('#st-fields [data-path="data.images[0].caption"] label', (n) => n.textContent), 'Bildunterschrift');
  await tab(page, 'style');
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.text)), ['Raster', 'Karussell']);
  assert.deepEqual(errors, []);
  await page.close();
});

test('hostile text stays text: escaped in the preview, nothing injected, no dialogs', async () => {
  const { page, errors } = await openGallery();
  await typeInto(page, fp('data.title'), '<img src=x onerror=alert(1)>');
  await openRow(page, 0);
  await typeInto(page, it(0, 'alt'), '" onerror="alert(2)');
  await typeInto(page, it(0, 'caption'), '<b>fett</b>');
  await sectionHas(page, '&lt;img src=x onerror=alert(1)&gt;');
  await sectionHas(page, 'alt="&quot; onerror=&quot;alert(2)"');
  await sectionHas(page, '<figcaption>&lt;b&gt;fett&lt;/b&gt;</figcaption>');
  await sleep(400);
  const fr = await frame(page);
  assert.deepEqual(await fr.evaluate((id) => ({ imgs: document.querySelectorAll('[data-v3-id="' + id + '"] img').length, onerr: document.querySelectorAll('[onerror]').length, b: document.querySelectorAll('figcaption b').length }), G), { imgs: 3, onerr: 0, b: 0 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('Light and Dark: the Gallery editor uses the Studio tokens; no overflow', async () => {
  for (const theme of ['light', 'dark']) {
    const { page, errors, net } = await openGallery(1440, 900, { theme });
    await openRow(page, 0);
    const s = await page.evaluate(() => {
      const f = document.getElementById('st-fields');
      const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
      const over = [...f.querySelectorAll('.st-field, .st-item__head')].filter((n) => n.scrollWidth > n.clientWidth + 1).length;
      return { row: css('#st-fields .st-item', 'backgroundColor'), input: css('#st-fields .st-item__body input', 'backgroundColor'), open: css('#st-fields .st-item.is-open', 'borderTopColor'), over, panel: f.scrollWidth - f.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const bg = theme === 'dark' ? 'rgb(23, 23, 25)' : 'rgb(255, 255, 255)';
    assert.deepEqual([s.row, s.input, s.open], [bg, bg, 'rgb(255, 90, 31)'], theme + ': as the Products list');
    assert.deepEqual([s.over, s.panel, s.page], [0, 0, 0], theme + ': no overflow');
    assert.deepEqual(errors, []);
    assert.deepEqual(onlyLocal(net), []);
    await page.close();
  }
});

test('devices: Tablet and Mobile show the edit; both frames update side by side at 1920', async () => {
  const { page } = await openGallery();
  await typeInto(page, fp('data.title'), 'Überall');
  for (const d of ['tablet', 'mobile', 'desktop']) {
    await page.click('button[data-device="' + d + '"]');
    await sectionHas(page, '<h2 class="v3-h2">Überall</h2>', d);
  }
  await page.close();
  const wide = await openGallery(1920, 1080);
  assert.deepEqual(await wide.page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['desktop', 'mobile']);
  await openRow(wide.page, 2);
  await typeInto(wide.page, it(2, 'caption'), 'Beide');
  await sectionHas(wide.page, '<figcaption>Beide</figcaption>', 'desktop');
  await sectionHas(wide.page, '<figcaption>Beide</figcaption>', 'mobile');
  await wide.page.close();
});

test('tablet width (1024): the edit drawer edits the Gallery; no overflow', async () => {
  const { page, errors } = await open(1024, 768);
  await clickInPreview(page, '[data-v3-id="' + G + '"] .v3-h2');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Gallery', 'selected');
  const onScreen = () => page.$eval('#st-right', (n) => { const r = n.getBoundingClientRect(), cs = getComputedStyle(n); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.left < innerWidth - 10 && r.right > 10; });
  if (!(await onScreen())) await page.click('#st-open-right');
  await until(onScreen, 'edit drawer open');
  await sleep(300);
  await openRow(page, 0);
  await typeInto(page, it(0, 'caption'), 'Tablet');
  await sectionHas(page, '<figcaption>Tablet</figcaption>');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('phones: preview only; a click on the Gallery edits nothing; the photos and labels show', async () => {
  const { page, errors } = await open(390, 844);
  assert.equal(await page.$eval('#st-right', (n) => getComputedStyle(n).display), 'none');
  await clickInPreview(page, '[data-v3-id="' + G + '"] .v3-h2', 'mobile');
  await sleep(300);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'selection unchanged');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  const g = await galleryIn(page, 'mobile', 'grid');
  assert.deepEqual([g.columns, g.imgs.length, g.badges.length], [2, 3, 3]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('an emptied gallery: the preview note, Add still disabled, Undo brings the photos back', async () => {
  const { page } = await openGallery();
  for (let i = 2; i >= 0; i--) { await page.click(row(i) + ' [data-action="remove-item"]'); await sleep(80); }
  await until(async () => (await section(page)).includes('v3-ph-section'), 'empty note');
  assert.equal(await page.$eval('#st-fields .st-items__head', (n) => n.textContent), 'Images (0 / 24)');
  assert.equal(await page.$eval('#st-fields [data-action="add-item"]', (n) => n.disabled), true);
  assert.equal(await page.$eval('#st-stale', (n) => n.hidden), true, 'an empty gallery is valid');
  await page.evaluate(() => document.activeElement.blur());
  for (let i = 0; i < 3; i++) await keys(page, ['Control'], 'z');
  await until(async () => (await captions(page)).length === 3, 'restored');
  await page.close();
});

test('after editing: no network beyond this server and Google Fonts; Save Draft and Publish disabled; the eight editors editable', async () => {
  const { page, net, urls, errors } = await openGallery();
  await openRow(page, 0);
  await typeInto(page, it(0, 'caption'), 'Netz');
  await page.click(row(1) + ' [data-action="remove-item"]');
  await sleep(400);
  assert.deepEqual(onlyLocal(net), []);
  assert.ok(!urls.some((u) => /res\.cloudinary\.com/.test(u)));
  assert.deepEqual(await page.$$eval('#st-save-btn, #st-publish-btn', (n) => n.map((b) => b.disabled)), [true, true]);
  for (const id of ['s_hero01', 's_quick01', 's_social01', 's_contact1', 's_hours01', 's_prod01', 's_text01', G]) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true', id + ' editable');
  }
  for (const id of ['s_deals01', 's_loyal01']) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'false', id);
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
