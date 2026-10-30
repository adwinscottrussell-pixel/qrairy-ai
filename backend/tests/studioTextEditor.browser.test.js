// ============================================================
// studioTextEditor.browser.test.js — Landing Page Studio V3, Phase 2A-3G:
// editing the Text section in a real browser (LOCAL ONLY: needs Chrome and
// puppeteer-core; prints SKIP and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. Checked: the demo's "Über uns"
// section; selection; Content / Style / Settings; heading and body (line
// breaks) with counters; Plain (never an image), Image left and Image right
// (image beside the text on desktop, stacked on mobile, placeholder in the
// preview without an image); an existing image shown, removable, never
// changed; Image on top listed only when stored; background / alignment /
// spacing; readable on all four backgrounds; link name, Show on page,
// Section ID; Undo / Redo; German; escaping; Tablet / Mobile and both frames
// at 1920; phones preview only; no network; Save Draft / Publish disabled.
// Run: node tests/studioTextEditor.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioTextEditor.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

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
const T = 's_text01';
// a 1×1 PNG answered locally for the test image (no request leaves the machine)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/backstube.jpg';

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
  // Phase C.1: the preview starts phone-first; these checks use the desktop frame (picked as an owner would, then loaded)
  if (await page.evaluate(() => { const b = document.querySelector('button[data-device="desktop"]'); if (!b || !b.offsetParent || b.getAttribute('aria-checked') === 'true') return false; b.click(); return true; })) {
    const h = await page.$('#st-canvas iframe[data-device="desktop"]'); const f = h && await h.contentFrame();
    if (f) await f.waitForSelector('[data-v3-id]', { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  return { page, net, errors };
}
// open the Studio with the Text section selected
async function openText(width = 1440, height = 900, opts) {
  const o = await open(width, height, opts);
  if (width >= 1200) { await o.page.click('#st-tab-sections'); await o.page.click('#st-outline [data-id="' + T + '"]'); }
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
const BODY = fp('data.body', 'textarea');
const tab = (page, name) => page.click('[data-insp="' + name + '"]');
const errorOf = (page, p) => page.$eval('#st-fields [data-path="' + p + '"] .st-err', (n) => (n.hidden ? '' : n.textContent));
const section = async (page, device) => { const h = await srcdoc(page, device); const i = h.indexOf('data-v3-id="' + T + '"'); return i < 0 ? '' : h.slice(h.lastIndexOf('<section', i), h.indexOf('</section>', i)); };
const sectionHas = (page, s, device) => until(async () => (await section(page, device)).includes(s), 'section shows ' + s);
const shownHints = (page) => page.$$eval('#st-fields [data-path="data.image"] .st-hint', (n) => n.filter((x) => !x.hidden).map((x) => x.getAttribute('data-hint')));
const setImage = (page, v) => page.evaluate((id, img) => window.QraivyStudio.editor.set(id, ['data', 'image'], img), T, v);
// the rendered layout in a preview frame: image or placeholder, its place, the columns
async function layoutIn(page, device, variant) {
  const fr = await until(async () => { const f = await frame(page, device); return (await f.$('[data-v3-id="' + T + '"].v3-v-' + variant).catch(() => null)) ? f : null; }, device + ' ' + variant);
  return fr.$eval('[data-v3-id="' + T + '"]', (n) => {
    const grid = n.querySelector('.v3-text-grid'), fig = n.querySelector('.v3-text-fig'), body = n.querySelector('.v3-text-body');
    const b = body.getBoundingClientRect(), f = fig && fig.getBoundingClientRect();
    return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, fig: !!fig, img: !!n.querySelector('.v3-text-fig img'), ph: !!n.querySelector('.v3-img-ph'),
      place: !f ? 'none' : f.right <= b.left + 2 ? 'left' : f.left >= b.right - 2 ? 'right' : f.bottom <= b.top + 2 ? 'above' : 'below' };
  });
}
function onlyLocal(net) { return [...new Set(net)].filter((h) => h !== new URL(base).host && !FONT_HOSTS.includes(h)); }

test('the demo has a Plain "Über uns" Text section; selected from the Sections list and the preview; Content / Style / Settings', async () => {
  const { page, errors } = await open(1440, 900);
  assert.ok((await page.$$eval('#st-outline [data-id]', (n) => n.map((x) => x.getAttribute('data-id')))).includes(T), 'listed in Sections');
  await clickInPreview(page, '[data-v3-id="' + T + '"] .v3-h2');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Text Section', 'selected from the preview');
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  const paths = () => page.$$eval('#st-fields > [data-path]', (n) => n.map((x) => x.getAttribute('data-path')));
  assert.deepEqual(await paths(), ['data.heading', 'data.body', 'data.image', 'data.imageAlt']);
  assert.deepEqual(await page.$$eval('#st-fields > [data-path] > span:first-child', (n) => n.map((x) => x.textContent.replace(/\d+ \/ \d+$/, '').trim())), ['Heading', 'Text', 'Image', 'Image description']);
  assert.equal(await page.$eval(fp('data.heading'), (n) => n.value), 'Über uns');
  assert.match(await page.$eval(BODY, (n) => n.value), /^Seit drei Generationen[\s\S]*\nJeden Morgen/);
  assert.equal(await page.$eval(BODY, (n) => n.rows), 6);
  assert.deepEqual(await page.$$eval('#st-fields [data-path="data.image"] button', (n) => n.map((b) => b.textContent + ':' + b.disabled)), ['Change Image:true', 'Remove:true'], 'upload deferred; nothing to remove');
  assert.deepEqual(await shownHints(page), [], 'Plain without an image: no hint');
  await tab(page, 'style');
  assert.deepEqual(await paths(), ['variant', 'style.background', 'style.align', 'style.spacing']);
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.value + ':' + x.text)), ['plain:Plain: text only', 'image-left:Image left', 'image-right:Image right']);
  assert.equal(await page.$eval(fp('variant', 'select'), (n) => n.value), 'plain');
  await tab(page, 'settings');
  assert.deepEqual(await paths(), ['anchor', 'hidden', 'id']);
  assert.equal(await page.$eval(fp('anchor'), (n) => n.value), 'ueber-uns');
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), T);
  assert.deepEqual(errors, []);
  await page.close();
});

test('heading and body reach the preview with counters; line breaks become <br>; too long shows the error and keeps the last valid preview', async () => {
  const { page } = await openText();
  await typeInto(page, fp('data.heading'), 'Unsere Backstube');
  await sectionHas(page, '<h2 class="v3-h2">Unsere Backstube</h2>');
  assert.equal(await page.$eval('#st-fields [data-path="data.heading"] .st-count', (n) => n.textContent), '16 / 120');
  await page.click(BODY);
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.type('Erste Zeile');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Zweite Zeile');
  await sectionHas(page, '<p class="v3-body">Erste Zeile<br>Zweite Zeile</p>');
  assert.equal(await page.$eval('#st-fields [data-path="data.body"] .st-count', (n) => n.textContent), '24 / 2000');
  await typeInto(page, fp('data.heading'), 'x'.repeat(121));
  await until(async () => /at most 120/.test(await errorOf(page, 'data.heading')), 'too long');
  assert.equal(await page.$eval('#st-stale', (n) => !n.hidden), true);
  assert.ok((await section(page)).includes('<h2 class="v3-h2">Unsere Backstube</h2>'), 'the last valid heading stays');
  await page.close();
});

test('three layouts without an image: Plain text only; Image left / right beside the text on desktop with a placeholder, stacked on mobile; the hint', async () => {
  const { page } = await openText(1920, 1080);
  await tab(page, 'style');
  let l = await layoutIn(page, 'desktop', 'plain');
  assert.deepEqual([l.fig, l.ph, l.columns], [false, false, 1], 'Plain: no image, no placeholder, one column');
  for (const [v, place] of [['image-left', 'left'], ['image-right', 'right']]) {
    await page.select(fp('variant', 'select'), v);
    l = await layoutIn(page, 'desktop', v);
    assert.deepEqual([l.ph, l.img, l.columns, l.place], [true, false, 2, place], v + ' desktop ' + JSON.stringify(l));
    const m = await layoutIn(page, 'mobile', v);
    assert.deepEqual([m.columns, m.place], [1, v === 'image-left' ? 'above' : 'below'], v + ' mobile: stacked');
    await tab(page, 'content');
    assert.deepEqual(await shownHints(page), ['text_image_later'], v + ': upload comes later');
    await tab(page, 'style');
  }
  await page.close();
});

test('an existing image: Plain never shows it (and says so); Image left / right show it in place; Remove + Undo; never changed here', async () => {
  const { page, net } = await openText(1920, 1080, { images: true });
  await setImage(page, IMG);
  let l = await layoutIn(page, 'desktop', 'plain');
  assert.deepEqual([l.fig, l.img, l.ph], [false, false, false], 'Plain: no image');
  assert.ok(!(await section(page)).includes(IMG), 'the image address is not in the Plain section');
  assert.deepEqual(await shownHints(page), ['plain_image']);
  assert.match(await page.$eval('#st-fields [data-hint="plain_image"]', (n) => n.textContent), /The Plain layout shows no image/);
  assert.equal(await page.$eval('#st-fields [data-path="data.image"] .st-field__thumb img', (n) => n.getAttribute('src')), IMG, 'the inspector shows the stored image');
  await tab(page, 'style');
  for (const [v, place] of [['image-left', 'left'], ['image-right', 'right']]) {
    await page.select(fp('variant', 'select'), v);
    l = await layoutIn(page, 'desktop', v);
    assert.deepEqual([l.img, l.ph, l.place], [true, false, place], v + ' ' + JSON.stringify(l));
    assert.ok((await section(page)).includes('<img src="' + IMG + '"'), v + ': the image');
    const m = await layoutIn(page, 'mobile', v);
    assert.deepEqual([m.img, m.columns], [true, 1], v + ' mobile');
  }
  await tab(page, 'content');
  assert.deepEqual(await shownHints(page), []);
  assert.equal(await page.$eval('#st-fields [data-path="data.image"] button[disabled]', (n) => n.textContent), 'Change Image', 'no upload');
  await page.click('#st-fields [data-action="remove-image"]');
  await until(async () => !(await section(page)).includes(IMG), 'removed');
  assert.ok((await section(page)).includes('v3-img-ph'), 'the placeholder again');
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await sectionHas(page, '<img src="' + IMG + '"');
  assert.ok(onlyLocal(net).every((h) => h === 'res.cloudinary.com'), 'only the intercepted test image');
  await page.close();
});

test('Image on top stays valid: listed (and selected) only for a section that already uses it', async () => {
  const { page } = await openText();
  await page.evaluate((id) => window.QraivyStudio.editor.set(id, ['variant'], 'image-top'), T);
  await tab(page, 'style');
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.value)), ['plain', 'image-left', 'image-right', 'image-top']);
  assert.equal(await page.$eval(fp('variant', 'select'), (n) => n.value + ':' + n.options[n.selectedIndex].text), 'image-top:Image on top');
  await sectionHas(page, 'v3-v-image-top');
  await page.close();
});

test('Style: background, alignment and spacing reach the preview', async () => {
  const { page } = await openText();
  await tab(page, 'style');
  for (const [bg, al, sp] of [['alt', 'center', 'compact'], ['dark', 'left', 'roomy'], ['brand', 'center', 'normal'], ['default', 'left', 'normal']]) {
    await page.select(fp('style.background', 'select'), bg);
    await page.select(fp('style.align', 'select'), al);
    await page.select(fp('style.spacing', 'select'), sp);
    await sectionHas(page, 'class="v3-s v3-text v3-v-plain v3-bg-' + bg + ' v3-al-' + al + ' v3-sp-' + sp + '"');
  }
  const fr = await frame(page);
  await page.select(fp('style.align', 'select'), 'center');
  await until(async () => (await fr.$eval('[data-v3-id="' + T + '"] .v3-h2', (n) => getComputedStyle(n).textAlign).catch(() => '')) === 'center', 'centred heading');
  await page.close();
});

const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lumOf = (c) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const x = lumOf(rgb(a)), y = lumOf(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
test('readable on Default, Alternate, Dark and Brand, desktop and mobile: heading and body on the section', async () => {
  const { page } = await openText();
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'image-left');
  for (const dev of ['desktop', 'mobile']) {
    if (dev === 'mobile') await page.click('button[data-device="mobile"]');
    for (const bg of ['default', 'alt', 'dark', 'brand']) {
      await page.select(fp('style.background', 'select'), bg);
      const fr = await until(async () => { const f = await frame(page, dev); return (await f.$('[data-v3-id="' + T + '"].v3-bg-' + bg).catch(() => null)) ? f : null; }, dev + ' ' + bg);
      const c = await fr.$eval('[data-v3-id="' + T + '"]', (n) => {
        let sec = getComputedStyle(n).backgroundColor;
        if (/rgba\(0, 0, 0, 0\)/.test(sec)) sec = getComputedStyle(document.body).backgroundColor;
        return { sec, h: getComputedStyle(n.querySelector('.v3-h2')).color, p: getComputedStyle(n.querySelector('.v3-body')).color };
      });
      const min = bg === 'brand' ? 3 : 4.5;
      assert.ok(ratio(c.h, c.sec) >= min && ratio(c.p, c.sec) >= min, dev + ' ' + bg + ': ' + JSON.stringify(c));
    }
  }
  await page.close();
});

test('Settings: link name (links follow it), Show on page, read-only Section ID', async () => {
  const { page } = await openText();
  await tab(page, 'settings');
  await typeInto(page, fp('anchor'), 'backstube');
  await page.keyboard.press('Enter');
  await until(async () => (await srcdoc(page)).includes('<section id="backstube"'), 'renamed');
  await page.click(fp('hidden'));
  await until(async () => !(await srcdoc(page)).includes('data-v3-id="' + T + '"'), 'hidden');
  await page.click(fp('hidden'));
  await until(async () => (await srcdoc(page)).includes('data-v3-id="' + T + '"'), 'shown');
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), T);
  await page.close();
});

test('Undo / Redo across Text edits, buttons and keyboard; typing is one step', async () => {
  const { page } = await openText();
  await typeInto(page, fp('data.heading'), 'Neu');
  await page.evaluate(() => document.activeElement.blur());
  await sectionHas(page, '<h2 class="v3-h2">Neu</h2>');
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'image-right');
  await sectionHas(page, 'v3-v-image-right');
  await page.select(fp('style.background', 'select'), 'dark');
  await sectionHas(page, 'v3-bg-dark');
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await sectionHas(page, 'v3-bg-default');
  await page.click('#st-undo-btn');
  await sectionHas(page, 'v3-v-plain');
  await keys(page, ['Control'], 'z');
  await sectionHas(page, '<h2 class="v3-h2">Über uns</h2>');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true, 'the typing was one step');
  await keys(page, ['Control', 'Shift'], 'z');
  await sectionHas(page, '<h2 class="v3-h2">Neu</h2>');
  await page.click('#st-redo-btn');
  await sectionHas(page, 'v3-v-image-right');
  await keys(page, ['Control'], 'y');
  await sectionHas(page, 'v3-bg-dark');
  assert.equal(await page.$eval('#st-redo-btn', (n) => n.disabled), true);
  await page.close();
});

test('German: labels, layout names, hints', async () => {
  const { page, errors } = await openText(1440, 900, { lang: 'de', images: true });
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Textabschnitt');
  assert.deepEqual(await page.$$eval('#st-fields > [data-path] > span:first-child', (n) => n.map((x) => x.textContent.replace(/\d+ \/ \d+$/, '').trim())), ['Überschrift', 'Text', 'Bild', 'Bildbeschreibung']);
  await setImage(page, IMG);
  await until(async () => (await shownHints(page)).join() === 'plain_image', 'hint');
  assert.match(await page.$eval('#st-fields [data-hint="plain_image"]', (n) => n.textContent), /Das Layout Schlicht zeigt kein Bild/);
  await tab(page, 'style');
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.text)), ['Schlicht: nur Text', 'Bild links', 'Bild rechts']);
  assert.deepEqual(errors, []);
  await page.close();
});

test('hostile text stays text: escaped in the preview, nothing injected, no dialogs', async () => {
  const { page, errors } = await openText();
  await typeInto(page, fp('data.heading'), '<img src=x onerror=alert(1)>');
  await typeInto(page, BODY, '"><svg onload=alert(2)><b>x</b>');
  await sectionHas(page, '&lt;img src=x onerror=alert(1)&gt;');
  await sectionHas(page, '&quot;&gt;&lt;svg onload=alert(2)&gt;&lt;b&gt;x&lt;/b&gt;');
  await sleep(400);
  const fr = await frame(page);
  assert.deepEqual(await fr.evaluate((id) => ({ imgs: document.querySelectorAll('[data-v3-id="' + id + '"] img').length, svg: document.querySelectorAll('svg[onload]').length, b: document.querySelectorAll('.v3-body b').length }), T), { imgs: 0, svg: 0, b: 0 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('Light and Dark: the Text editor uses the Studio tokens; no overflow', async () => {
  for (const theme of ['light', 'dark']) {
    const { page, errors, net } = await openText(1440, 900, { theme });
    const s = await page.evaluate(() => {
      const f = document.getElementById('st-fields');
      const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
      const over = [...f.querySelectorAll('.st-field')].filter((n) => n.scrollWidth > n.clientWidth + 1).length;
      return { input: css('#st-fields [data-path="data.heading"] input', 'backgroundColor'), area: css('#st-fields [data-path="data.body"] textarea', 'backgroundColor'), over, panel: f.scrollWidth - f.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const heroInput = await (async () => { await page.click('#st-outline [data-id="s_hero01"]'); return page.$eval('#st-fields [data-path="data.headline"] input', (n) => getComputedStyle(n).backgroundColor); })();
    assert.deepEqual([s.input, s.area], [heroInput, heroInput], theme + ': same field colours as the Hero editor');
    assert.deepEqual([s.over, s.panel, s.page], [0, 0, 0], theme + ': no overflow');
    assert.deepEqual(errors, []);
    assert.deepEqual(onlyLocal(net), []);
    await page.close();
  }
});

test('devices: Tablet and Mobile show the edit; both frames update side by side at 1920', async () => {
  const { page } = await openText();
  await typeInto(page, fp('data.heading'), 'Überall');
  for (const d of ['tablet', 'mobile', 'desktop']) {
    await page.click('button[data-device="' + d + '"]');
    await sectionHas(page, '<h2 class="v3-h2">Überall</h2>', d);
  }
  await page.close();
  const wide = await openText(1920, 1080);
  assert.deepEqual(await wide.page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['desktop', 'mobile']);
  await typeInto(wide.page, fp('data.heading'), 'Beide');
  await sectionHas(wide.page, '<h2 class="v3-h2">Beide</h2>', 'desktop');
  await sectionHas(wide.page, '<h2 class="v3-h2">Beide</h2>', 'mobile');
  await wide.page.close();
});

test('tablet width (1024): the edit drawer edits the Text section; no overflow', async () => {
  const { page, errors } = await open(1024, 768);
  await clickInPreview(page, '[data-v3-id="' + T + '"] .v3-h2');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Text Section', 'selected');
  // the edit panel is a drawer below 1200 px: open it when it is not on screen
  const onScreen = () => page.$eval('#st-right', (n) => { const r = n.getBoundingClientRect(), cs = getComputedStyle(n); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.left < innerWidth - 10 && r.right > 10; });
  if (!(await onScreen())) await page.click('#st-open-right');
  await until(onScreen, 'edit drawer open');
  await sleep(300);
  await typeInto(page, fp('data.heading'), 'Tablet');
  await sectionHas(page, '<h2 class="v3-h2">Tablet</h2>');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('phones: preview only; a click on the Text section edits nothing', async () => {
  const { page, errors } = await open(390, 844);
  assert.equal(await page.$eval('#st-right', (n) => getComputedStyle(n).display), 'none');
  await clickInPreview(page, '[data-v3-id="' + T + '"] .v3-h2', 'mobile');
  await sleep(300);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'selection unchanged');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('after editing: no network beyond this server and Google Fonts; Save Draft and Publish disabled; the seven editors editable', async () => {
  const { page, net, errors } = await openText();
  await typeInto(page, fp('data.heading'), 'Netz');
  await sleep(400);
  assert.deepEqual(onlyLocal(net), []);
  assert.deepEqual(await page.$$eval('#st-save-btn, #st-publish-btn', (n) => n.map((b) => b.disabled)), [true, true]);
  for (const id of ['s_hero01', 's_quick01', 's_social01', 's_contact1', 's_hours01', 's_prod01', T]) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true', id + ' editable');
  }
  // (Deals / Offers is editable since D2: studioDealsPreview.browser.test.js)
  for (const id of ['s_loyal01']) {
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
