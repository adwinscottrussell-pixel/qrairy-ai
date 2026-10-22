// ============================================================
// studioEditor.browser.test.js — Landing Page Studio V3, Phase 2A-3A:
// editing the Hero in a real browser (LOCAL ONLY: needs Chrome and
// puppeteer-core; prints SKIP and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. Checked: selection (Sections
// list, inspector, preview, click in the preview); every Hero control;
// edits reaching the live preview; validation errors inline while the
// preview keeps the last valid page; buttons following the renderer's
// rules; link names moving the links with them; Show on page; escaping of
// hostile text; Undo / Redo (buttons, keys, native undo in text fields);
// Light / Dark; Desktop / Tablet / Mobile and both frames at 1920; phones
// preview only; the other nine types still read-only; no network beyond
// this server and Google Fonts; Save Draft and Publish disabled.
// Run: node tests/studioEditor.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioEditor.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(PUB, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// A valid Cloudinary address for the image tests; answered here, never fetched.
const IMAGE = 'https://res.cloudinary.com/demo/image/upload/v1/studio-test/hero.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, base;

// opts.image: the demo Hero gets a background image (Overlay layout)
async function open(width, height, { theme = 'light', image = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('qraivy.studio.theme', t); localStorage.setItem('qraivy_lang', 'en'); localStorage.removeItem('qraivy.studio.panels'); } catch (e) {} }, theme);
  const net = [], errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol)) net.push(u.host);
    if (u.host === 'res.cloudinary.com') return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (image && u.pathname.endsWith('/js/studio/studio-demo.js')) {
      const src = fs.readFileSync(path.join(PUB, 'js', 'studio', 'studio-demo.js'), 'utf8')
        .replace("{ id: 's_hero01', type: 'hero', variant: 'split', data: {", "{ id: 's_hero01', type: 'hero', variant: 'overlay', data: { backgroundImage: '" + IMAGE + "', imageAlt: 'Theke',");
      return r.respond({ status: 200, contentType: 'text/javascript', body: src });
    }
    return r.continue();
  });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  return { page, net, errors };
}
const srcdoc = (page, device = null) => page.$eval('#st-canvas iframe' + (device ? '[data-device="' + device + '"]' : ''), (f) => f.srcdoc);
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
const previewHas = (page, s, device) => until(async () => (await srcdoc(page, device)).includes(s), 'preview shows ' + s);
async function frame(page, device = 'desktop') {
  const h = await page.$('#st-canvas iframe[data-device="' + device + '"]');
  return h.contentFrame();
}
// A real mouse click on an element inside a preview frame. The frames are
// scaled with a CSS transform, which puppeteer's ElementHandle.click does
// not account for, so the screen point is computed here.
async function clickInPreview(page, selector, device = 'desktop') {
  const fr = await frame(page, device);
  const r = await fr.$eval(selector, (n) => { scrollTo({ top: Math.max(0, n.getBoundingClientRect().top + scrollY - 100), behavior: 'instant' }); const b = n.getBoundingClientRect(); return { x: b.left + Math.min(40, b.width / 2), y: b.top + Math.min(30, b.height / 2) }; });
  const f = await page.$eval('#st-canvas iframe[data-device="' + device + '"]', (n) => { const b = n.getBoundingClientRect(); return { left: b.left, top: b.top, scale: b.width / n.offsetWidth }; });
  await sleep(150);
  await page.mouse.click(f.left + r.x * f.scale, f.top + r.y * f.scale);
}
// replace a field's text the way a person does: select all, type
async function typeInto(page, sel, text) {
  await page.click(sel);
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  if (text === '') await page.keyboard.press('Backspace'); else await page.keyboard.type(text);
}
const field = (p, tag = 'input') => '#st-fields [data-path="' + p + '"] ' + tag;
const errorOf = (page, p) => page.$eval('#st-fields [data-path="' + p + '"] .st-err', (n) => (n.hidden ? '' : n.textContent));
const tab = (page, name) => page.click('[data-insp="' + name + '"]');
async function blur(page) { await page.evaluate(() => document.activeElement && document.activeElement.blur()); }
const heroBtns = (html) => (html.match(/<a class="v3-btn v3-btn-(primary|outline)"[^>]*>/g) || []);
function onlyLocal(net) { return [...new Set(net)].filter((h) => h !== new URL(base).host && !FONT_HOSTS.includes(h)); }

test('selection: the Hero starts selected in the Sections list, inspector and preview; the other types stay read-only', async () => {
  const { page, errors } = await open(1440, 900);
  await page.click('#st-tab-sections');
  assert.equal(await page.$eval('#st-outline [aria-current="true"]', (n) => n.getAttribute('data-id')), 's_hero01');
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero');
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  const fr = await frame(page);
  await until(() => fr.$eval('[data-v3-id="s_hero01"]', (n) => n.classList.contains('st-sel')), 'Hero marked in the preview');
  for (const id of ['s_quick01', 's_deals01', 's_loyal01', 's_prod01', 's_hours01', 's_contact1', 's_social01']) {
    await page.click('#st-outline [data-id="' + id + '"]');
    for (const t of ['content', 'style', 'settings']) {
      await tab(page, t);
      const c = await page.$$eval('#st-fields input, #st-fields textarea, #st-fields select, #st-fields button', (n) => n.map((x) => x.disabled));
      assert.ok(c.length && c.every(Boolean), id + ' ' + t + ': every control disabled');
    }
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'false');
    assert.match(await page.$eval('#st-note', (n) => n.textContent), /later step/);
    await tab(page, 'content');
  }
  const f2 = await frame(page);
  await until(() => f2.$eval('[data-v3-id="s_social01"]', (n) => n.classList.contains('st-sel')), 'selection follows in the preview');
  assert.deepEqual(errors, []);
  await page.close();
});

test('click-to-select in the preview: another section, then the Hero again; links do not navigate', async () => {
  const { page, errors } = await open(1440, 900);
  await clickInPreview(page, '[data-v3-id="s_contact1"]');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Contact', 'Contact selected');
  assert.equal(await page.$eval('#st-tab-sections', (n) => n.getAttribute('aria-selected')), 'true', 'the Sections list opens to show it');
  assert.equal(await page.$eval('#st-outline [aria-current="true"]', (n) => n.getAttribute('data-id')), 's_contact1');
  const fr = await frame(page);
  await until(() => fr.$eval('[data-v3-id="s_contact1"]', (n) => n.classList.contains('st-sel')), 'marked in the preview');
  const before = await fr.evaluate(() => location.href + '|' + location.hash);
  await clickInPreview(page, '[data-v3-id="s_hero01"] .v3-btn-primary');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Hero', 'Hero selected by clicking its button');
  assert.equal(await fr.evaluate(() => location.href + '|' + location.hash), before, 'the link did not navigate');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Hero controls: Content, Style and Settings as approved', async () => {
  const { page } = await open(1440, 900);
  const paths = async () => page.$$eval('#st-fields [data-path]', (n) => n.map((x) => x.getAttribute('data-path')));
  assert.deepEqual(await paths(), ['data.eyebrow', 'data.headline', 'data.subheadline', 'data.backgroundImage', 'data.imageAlt', 'data.primary.text', 'data.primary.color',
    'data.primary.target', 'data.secondary.text', 'data.secondary.target']
    .flatMap((p) => p === 'data.primary.target' ? [p, 'data.primary.icon'] : p === 'data.secondary.target' ? [p, 'data.secondary.icon'] : [p]));
  assert.equal(await page.$eval(field('data.headline') + '', (n) => n.getAttribute('aria-required')), 'true');
  assert.equal(await page.$eval('#st-fields [data-path="data.subheadline"] textarea', (n) => n.tagName), 'TEXTAREA');
  assert.deepEqual(await page.$$eval('#st-fields .st-count', (n) => n.map((x) => x.textContent.split(' / ')[1])), ['60', '120', '300', '120', '40', '40']);
  assert.equal(await page.$eval('#st-fields [data-path="data.backgroundImage"] button[disabled]', (n) => n.textContent), 'Change Image');
  await tab(page, 'style');
  assert.deepEqual(await paths(), ['variant', 'style.align', 'data.overlay']);
  await tab(page, 'settings');
  assert.deepEqual(await paths(), ['anchor', 'hidden', 'id']);
  assert.equal(await page.$eval(field('id'), (n) => n.readOnly && n.value), 's_hero01');
  await page.close();
});

test('Content edits reach the live preview: headline, badge, subheadline (line breaks kept)', async () => {
  const { page } = await open(1440, 900);
  await typeInto(page, field('data.headline'), 'Frisch aus dem Ofen');
  await previewHas(page, '<h1 class="v3-h1">Frisch aus dem Ofen</h1>');
  assert.equal(await page.$eval('#st-fields [data-path="data.headline"] .st-count', (n) => n.textContent), '19 / 120');
  await typeInto(page, field('data.eyebrow'), 'Seit 1890');
  await previewHas(page, '<p class="v3-eyebrow">Seit 1890</p>');
  await typeInto(page, field('data.subheadline', 'textarea'), 'Zeile eins');
  await page.keyboard.press('Enter'); await page.keyboard.type('Zeile zwei');
  await previewHas(page, '<p class="v3-lead">Zeile eins<br>Zeile zwei</p>');
  await typeInto(page, field('data.eyebrow'), '');
  await until(async () => !(await srcdoc(page)).includes('<p class="v3-eyebrow">'), 'an empty badge is not shown');
  // the Sections list follows the headline
  await page.click('#st-tab-sections');
  assert.match(await page.$eval('#st-outline [data-id="s_hero01"] small', (n) => n.textContent), /Frisch aus dem Ofen/);
  await page.close();
});

test('the preview stays where it was scrolled when an edit re-renders it', async () => {
  const { page } = await open(1440, 900);
  let fr = await frame(page);
  await fr.evaluate(() => scrollTo({ top: 1500, behavior: 'instant' }));
  await sleep(400); // the frame reports its position
  await typeInto(page, field('data.headline'), 'Weiter unten');
  await previewHas(page, '>Weiter unten</h1>');
  fr = await frame(page);
  await until(async () => (await fr.evaluate(() => document.querySelector('h1') && document.querySelector('h1').textContent)) === 'Weiter unten', 'reloaded');
  await until(async () => Math.abs((await fr.evaluate(() => scrollY)) - 1500) < 2, 'back at 1500 px, at once');
  await page.close();
});

test('validation: inline errors, the preview keeps the last valid page, limits match the counter', async () => {
  const { page, errors } = await open(1440, 900);
  await typeInto(page, field('data.headline'), 'Gut');
  await previewHas(page, '>Gut</h1>');
  await typeInto(page, field('data.headline'), '');
  await until(async () => (await errorOf(page, 'data.headline')) === 'Required.', 'required');
  assert.equal(await page.$eval(field('data.headline'), (n) => n.getAttribute('aria-invalid')), 'true');
  await sleep(400);
  assert.ok((await srcdoc(page)).includes('>Gut</h1>'), 'the preview keeps the last valid headline');
  await typeInto(page, field('data.headline'), 'x'.repeat(121));
  await until(async () => /at most 120/.test(await errorOf(page, 'data.headline')), 'too long');
  assert.equal(await page.$eval('#st-fields [data-path="data.headline"] .st-count', (n) => n.textContent + n.className), '121 / 120st-count is-over');
  await page.keyboard.press('Backspace');
  await until(async () => (await errorOf(page, 'data.headline')) === '', 'exactly 120 is fine');
  await previewHas(page, 'x'.repeat(120) + '</h1>');
  assert.deepEqual(errors, []);
  await page.close();
});

test('hostile text stays text: escaped in the preview, nothing injected, no dialogs', async () => {
  const { page, errors } = await open(1440, 900);
  const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  await typeInto(page, field('data.headline'), evil);
  await typeInto(page, field('data.subheadline', 'textarea'), '"><svg onload=alert(3)>');
  await previewHas(page, '&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
  await sleep(500);
  const fr = await frame(page);
  const inside = await fr.evaluate(() => ({ imgs: document.querySelectorAll('main img').length, svgOnload: document.querySelectorAll('svg[onload]').length,
    scripts: document.scripts.length, h1: document.querySelector('h1').textContent }));
  assert.deepEqual(inside, { imgs: 0, svgOnload: 0, scripts: 1, h1: evil }, 'one script: the Studio\'s own');
  assert.deepEqual(errors, [], 'no alert ran');
  await page.close();
});

test('buttons follow the renderer: shown only with text and link; link choices; colour; icons', async () => {
  const { page } = await open(1440, 900);
  assert.equal(heroBtns(await srcdoc(page)).length, 2);
  // primary: no link -> not shown, hint appears
  await page.select(field('data.primary.target', 'select'), '');
  await until(async () => heroBtns(await srcdoc(page)).length === 1, 'primary hidden without a link');
  assert.equal(await page.$eval('#st-fields [data-hint="primary"]', (n) => n.hidden), false);
  // a section of this page
  await page.select(field('data.primary.target', 'select'), '/produkte');
  await previewHas(page, 'class="v3-btn v3-btn-primary" href="#produkte"');
  assert.equal(await page.$eval('#st-fields [data-hint="primary"]', (n) => n.hidden), true);
  // a web address; then an invalid one keeps the last valid link
  await page.select(field('data.primary.target', 'select'), '__custom');
  await page.keyboard.type('https://example.com/menu');
  await previewHas(page, 'href="https://example.com/menu" target="_blank" rel="noopener noreferrer"');
  await typeInto(page, '#st-fields [data-path="data.primary.target"] input', 'javascript:alert(1)');
  await until(async () => /https:\/\/, mailto: or tel:/.test(await errorOf(page, 'data.primary.target')), 'invalid link error');
  await sleep(300);
  assert.ok((await srcdoc(page)).includes('href="https://example.com/menu"') && !(await srcdoc(page)).includes('javascript:'));
  await typeInto(page, '#st-fields [data-path="data.primary.target"] input', 'tel:+4973100000');
  await previewHas(page, 'href="tel:+4973100000"');
  // icon and colour
  await page.select(field('data.primary.icon', 'select'), 'star');
  await until(async () => /v3-btn-primary[^>]*>[^]*?<svg/.test(await srcdoc(page)), 'icon');
  await page.$eval('#st-fields [data-path="data.primary.color"] input', (n) => { n.value = '#123456'; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); });
  await previewHas(page, 'style="background:#123456"');
  await page.click('#st-fields [data-path="data.primary.color"] .st-linkbtn');
  await until(async () => !(await srcdoc(page)).includes('background:#123456'), 'colour back to the default');
  // secondary: no text -> not shown
  await typeInto(page, field('data.secondary.text'), '');
  await until(async () => !(await srcdoc(page)).includes('<a class="v3-btn v3-btn-outline"'), 'secondary hidden without text');
  assert.equal(await page.$eval('#st-fields [data-hint="secondary"]', (n) => n.hidden), false);
  await page.close();
});

test('Style: layout and alignment; image darkening only for Overlay with an image', async () => {
  const { page } = await open(1440, 900);
  await tab(page, 'style');
  assert.equal(await page.$eval(field('data.overlay'), (n) => n.disabled), true, 'no image in the demo: not applicable');
  assert.equal(await page.$eval('#st-fields [data-path="data.overlay"] .st-hint', (n) => n.hidden), false);
  await page.select(field('variant', 'select'), 'simple');
  await previewHas(page, 'class="v3-s v3-hero v3-v-simple');
  await page.select(field('style.align', 'select'), 'center');
  await previewHas(page, 'v3-v-simple v3-al-center');
  await page.close();

  const img = await open(1440, 900, { image: true });
  const p = img.page;
  await tab(p, 'style');
  assert.equal(await p.$eval(field('data.overlay'), (n) => n.disabled + ':' + n.value), 'false:45');
  await previewHas(p, 'class="v3-hero-shade" style="opacity:0.45"');
  await typeInto(p, field('data.overlay'), '70');
  await previewHas(p, 'style="opacity:0.7"');
  // one change (typing "9" first would be a valid 9 %)
  await p.$eval(field('data.overlay'), (n) => { n.focus(); n.value = '95'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await until(async () => /from 0 to 80/.test(await errorOf(p, 'data.overlay')), 'out of range');
  await sleep(300);
  assert.ok((await srcdoc(p)).includes('opacity:0.7'), 'the preview keeps the last valid value');
  await typeInto(p, field('data.overlay'), '80');
  await previewHas(p, 'style="opacity:0.8"');
  await p.select(field('variant', 'select'), 'split');
  await until(() => p.$eval(field('data.overlay'), (n) => n.disabled), 'not for Split');
  assert.deepEqual(onlyLocal(img.net).filter((h) => h !== 'res.cloudinary.com'), []);
  await p.close();
});

test('Content: the existing background image is shown and can be removed (no upload, no pasted address)', async () => {
  const { page } = await open(1440, 900, { image: true });
  assert.equal(await page.$eval('#st-fields [data-path="data.backgroundImage"] img', (n) => n.getAttribute('src')), 'https://res.cloudinary.com/demo/image/upload/v1/studio-test/hero.png');
  assert.equal(await page.$$eval('#st-fields [data-path="data.backgroundImage"] input', (n) => n.length), 0, 'no field to paste an image address');
  await previewHas(page, 'class="v3-hero-img"');
  await page.click('#st-fields [data-action="remove-image"]');
  await until(async () => !(await srcdoc(page)).includes('class="v3-hero-img"'), 'image removed from the preview');
  assert.equal(await page.$eval('#st-fields [data-action="remove-image"]', (n) => n.disabled), true);
  assert.equal(await page.$eval('#st-fields [data-path="data.backgroundImage"] .st-field__thumb img', () => true).catch(() => false), false);
  await page.click('#st-undo-btn');
  await previewHas(page, 'class="v3-hero-img"');
  await page.close();
});

test('Settings: link name renames, moves the links with it, refuses unusable names; Show on page', async () => {
  const { page } = await open(1440, 900);
  // point the secondary button at the Hero itself, then rename the Hero
  await page.select(field('data.secondary.target', 'select'), '/s_hero01');
  await previewHas(page, 'v3-btn-outline" href="#s_hero01"');
  await tab(page, 'settings');
  await typeInto(page, field('anchor'), 'Kontakt');
  await until(async () => /lowercase/.test(await errorOf(page, 'anchor')), 'format error');
  await typeInto(page, field('anchor'), 'kontakt');
  await until(async () => /already uses/.test(await errorOf(page, 'anchor')), 'duplicate error');
  await page.keyboard.press('Enter');
  assert.ok((await srcdoc(page)).includes('id="s_hero01"'), 'refused: nothing changed');
  await typeInto(page, field('anchor'), 'willkommen');
  await page.keyboard.press('Enter');
  await previewHas(page, 'id="willkommen"');
  await previewHas(page, 'v3-btn-outline" href="#willkommen"');
  await tab(page, 'content');
  assert.equal(await page.$eval(field('data.secondary.target', 'select'), (n) => n.value), '/willkommen', 'the link moved with the name');
  // Show on page
  await tab(page, 'settings');
  await page.click(field('hidden'));
  await until(async () => !(await srcdoc(page)).includes('data-v3-id="s_hero01"'), 'hidden from the page');
  await page.click('#st-tab-sections');
  assert.equal(await page.$eval('#st-outline [data-id="s_hero01"]', (n) => n.classList.contains('is-hidden')), true);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'still selected and editable');
  await page.click(field('hidden'));
  await previewHas(page, 'data-v3-id="s_hero01"');
  await page.close();
});

test('Undo / Redo: buttons, keyboard, one step per typing burst; text fields keep the browser\'s own undo', async () => {
  const { page } = await open(1440, 900);
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  await typeInto(page, field('data.headline'), 'Eins');
  await blur(page);
  await previewHas(page, '>Eins</h1>');
  await tab(page, 'style');
  await page.select(field('variant', 'select'), 'simple');
  await previewHas(page, 'v3-v-simple');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), false);
  await page.click('#st-undo-btn');
  await until(async () => (await srcdoc(page)).includes('v3-v-split'), 'layout undone');
  assert.equal(await page.$eval(field('variant', 'select'), (n) => n.value), 'split', 'the inspector follows');
  await blur(page);
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await previewHas(page, '>Tradition trifft Genuss</h1>');
  await until(async () => (await page.$eval('#st-live', (n) => n.textContent)) === 'Undone', 'announced');
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('z'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await previewHas(page, '>Eins</h1>');
  await page.keyboard.down('Control'); await page.keyboard.press('y'); await page.keyboard.up('Control');
  await previewHas(page, 'v3-v-simple');
  await page.click('#st-redo-btn').catch(() => {});
  assert.equal(await page.$eval('#st-redo-btn', (n) => n.disabled), true, 'nothing more to redo');
  // in a text field Ctrl+Z is the browser's text undo, not the Studio's
  await tab(page, 'content');
  await page.click(field('data.eyebrow'));
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  assert.equal(await page.$eval(field('data.eyebrow'), (n) => n.value), 'Frisch · Regional · Mit Herz');
  await sleep(300);
  assert.ok((await srcdoc(page)).includes('v3-v-simple'), 'the Studio did not undo the layout');
  await page.close();
});

test('devices: Desktop / Tablet / Mobile show the edit; both frames update side by side at 1920', async () => {
  const { page } = await open(1440, 900);
  await typeInto(page, field('data.headline'), 'Geräte');
  for (const d of ['tablet', 'mobile', 'desktop']) {
    await page.click('button[data-device="' + d + '"]');
    await previewHas(page, '>Geräte</h1>', d);
  }
  await page.close();
  const wide = await open(1920, 1080);
  assert.deepEqual(await wide.page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['desktop', 'mobile']);
  await typeInto(wide.page, field('data.headline'), 'Beide');
  await previewHas(wide.page, '>Beide</h1>', 'desktop');
  await previewHas(wide.page, '>Beide</h1>', 'mobile');
  const fr = await frame(wide.page, 'mobile');
  await until(() => fr.$eval('[data-v3-id="s_hero01"]', (n) => n.classList.contains('st-sel')), 'selection marked in the phone frame too');
  await wide.page.close();
});

test('Light and Dark: the editor works in both, without overflow; the preview is the same', async () => {
  const html = {};
  for (const theme of ['light', 'dark']) {
    const { page, errors, net } = await open(1440, 900, { theme });
    assert.equal(await page.$eval('html', (n) => n.getAttribute('data-studio-theme')), theme);
    await typeInto(page, field('data.headline'), 'Thema');
    await previewHas(page, '>Thema</h1>');
    html[theme] = await srcdoc(page);
    const bg = await page.$eval(field('data.headline'), (n) => getComputedStyle(n).backgroundColor);
    assert.equal(bg, theme === 'dark' ? 'rgb(23, 23, 25)' : 'rgb(255, 255, 255)', theme + ': inputs use the Studio surface');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(onlyLocal(net), []);
    await page.close();
  }
  assert.equal(html.light, html.dark, 'the landing page keeps its own colours');
});

test('phones: preview only (no inspector, a click in the preview edits nothing)', async () => {
  const { page, errors } = await open(390, 844);
  assert.deepEqual(await page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['mobile']);
  assert.equal(await page.$eval('#st-right', (n) => getComputedStyle(n).display), 'none');
  await clickInPreview(page, '[data-v3-id="s_contact1"]', 'mobile');
  await sleep(300);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'selection unchanged');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('after editing: no network beyond this server and Google Fonts; Save Draft and Publish still disabled', async () => {
  const { page, net, errors } = await open(1440, 900);
  await typeInto(page, field('data.headline'), 'Kein Netz');
  await page.select(field('data.primary.target', 'select'), '/kontakt');
  await page.click('#st-undo-btn');
  await page.click('#st-preview-btn');
  assert.equal(await page.$eval('#st-full-frame', (n) => n.getAttribute('sandbox') + '|' + n.srcdoc.includes('<script')), '|false', 'full size: no permissions, no Studio script');
  await page.click('#st-full-close');
  await sleep(500);
  assert.deepEqual(onlyLocal(net), []);
  assert.deepEqual(await page.$$eval('#st-save-btn, #st-publish-btn', (n) => n.map((b) => b.disabled)), [true, true]);
  assert.equal(await page.$eval('#st-mode', (n) => n.textContent), 'Local preview · not saved');
  assert.deepEqual(errors, []);
  await page.close();
});

test('on a production address the Studio does not start (no editor, no frames, no requests)', async () => {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  const hosts = [];
  page.on('request', (r) => {
    const u = new URL(r.url()); hosts.push(u.host);
    if (u.host === 'www.qraivy.com') {
      const p = path.join(PUB, decodeURIComponent(u.pathname));
      return fs.existsSync(p) && !fs.statSync(p).isDirectory() ? r.respond({ status: 200, contentType: TYPES[path.extname(p)] || 'text/plain', body: fs.readFileSync(p) }) : r.respond({ status: 404, body: '' });
    }
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    return r.abort();
  });
  await page.goto('https://www.qraivy.com/studio.html', { waitUntil: 'networkidle0' });
  const s = await page.evaluate(() => ({ unavailable: !document.getElementById('st-unavailable').hidden, frames: document.querySelectorAll('#st-canvas iframe').length,
    fields: document.querySelectorAll('#st-fields *').length, editor: !!window.QraivyStudio }));
  assert.deepEqual(s, { unavailable: true, frames: 0, fields: 0, editor: false });
  assert.deepEqual([...new Set(hosts)].filter((h) => h !== 'www.qraivy.com' && !FONT_HOSTS.includes(h)), []);
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
