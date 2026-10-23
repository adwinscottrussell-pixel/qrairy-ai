// ============================================================
// studioSocialEditor.browser.test.js — Landing Page Studio V3, Phase
// 2A-3C: editing the Social Media section in a real browser (LOCAL ONLY:
// needs Chrome and puppeteer-core; prints SKIP and passes when they are
// missing).
//
// frontend/public is served on 127.0.0.1. Checked: selection (Sections
// list and preview); Content / Style / Settings; the title; adding
// (Instagram, empty address, inline state, the 8-link limit); removing and
// Undo; reordering with buttons and Alt+arrows; one row open at a time; all
// eight platforms with valid and invalid addresses; WhatsApp numbers; a
// platform change with an incompatible address; layouts, background,
// alignment, spacing; link name and Show on page; escaping; Undo / Redo;
// German texts; readable links on every section background (the contrast
// fix after the visual review); Light / Dark; Tablet / Mobile and both frames at 1920;
// phones preview only; no network; Save Draft / Publish disabled; the other
// types read-only. (Hero: studioEditor.browser.test.js; Buttons:
// studioButtonsEditor.browser.test.js.)
// Run: node tests/studioSocialEditor.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioSocialEditor.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

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
const S = 's_social01';

async function open(width, height, { theme = 'light', lang = 'en' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((t, l) => { try { localStorage.setItem('qraivy.studio.theme', t); localStorage.setItem('qraivy_lang', l); localStorage.removeItem('qraivy.studio.panels'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} }, theme, lang);
  const net = [], errors = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) net.push(u.host); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  return { page, net, errors };
}
// open the Studio with the Social Media section selected
async function openSocial(width = 1440, height = 900, opts) {
  const o = await open(width, height, opts);
  if (width >= 1200) { await o.page.click('#st-tab-sections'); await o.page.click('#st-outline [data-id="' + S + '"]'); }
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
const it = (i, k, tag = 'input') => fp('data.links[' + i + '].' + k, tag);
const row = (i) => '#st-fields .st-item[data-index="' + i + '"]';
const errorOf = (page, p) => page.$eval('#st-fields [data-path="' + p + '"] .st-err', (n) => (n.hidden ? '' : n.textContent));
const tab = (page, name) => page.click('[data-insp="' + name + '"]');
async function openRow(page, i) { if (!(await page.$(row(i) + '.is-open'))) await page.click(row(i) + ' .st-item__toggle'); }
// the social links in the preview: "platform|href"
const links = (html) => [...html.matchAll(/<a class="v3-social v3-social-([a-z]+)" href="([^"]*)"/g)].map((m) => m[1] + '|' + m[2]);
const rows = (page) => page.$$eval('#st-fields .st-item', (n) => n.map((x) => x.querySelector('.st-item__name').textContent + ' · ' + x.querySelector('.st-item__kind').textContent));
const stale = (page) => page.$eval('#st-stale', (n) => !n.hidden);
const draft = (page) => page.evaluate((id) => JSON.parse(JSON.stringify(window.QraivyStudio.editor.section(id).data.links)), S);
function onlyLocal(net) { return [...new Set(net)].filter((h) => h !== new URL(base).host && !FONT_HOSTS.includes(h)); }
const DEMO = ['instagram|https://www.instagram.com/example', 'facebook|https://www.facebook.com/example'];

test('selection from the Sections list and the preview; Content / Style / Settings; rows', async () => {
  const { page, errors } = await open(1440, 900);
  await clickInPreview(page, '[data-v3-id="' + S + '"] .v3-h2');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Social Media', 'selected from the preview');
  assert.equal(await page.$eval('#st-outline [aria-current="true"]', (n) => n.getAttribute('data-id')), S);
  const fr = await frame(page);
  await until(() => fr.$eval('[data-v3-id="' + S + '"]', (n) => n.classList.contains('st-sel')), 'marked in the preview');
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  assert.match(await page.$eval('#st-note', (n) => n.textContent), /not saved/);
  const paths = () => page.$$eval('#st-fields > [data-path]', (n) => n.map((x) => x.getAttribute('data-path')));
  assert.deepEqual(await paths(), ['data.title', 'data.links']);
  assert.match(await page.$eval('#st-fields .st-items__head', (n) => n.textContent), /^Social links \(2 \/ 8\)$/);
  assert.deepEqual(await rows(page), ['Instagram · www.instagram.com', 'Facebook · www.facebook.com']);
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 0, 'rows start closed');
  await openRow(page, 0);
  assert.deepEqual(await page.$$eval(row(0) + ' .st-item__body > [data-path]', (n) => n.map((x) => x.getAttribute('data-path'))), ['data.links[0].platform', 'data.links[0].url']);
  assert.deepEqual(await page.$$eval(it(0, 'platform', 'select') + ' option', (n) => n.map((x) => x.value + ':' + x.text)),
    ['instagram:Instagram', 'facebook:Facebook', 'tiktok:TikTok', 'youtube:YouTube', 'linkedin:LinkedIn', 'x:X', 'pinterest:Pinterest', 'whatsapp:WhatsApp']);
  assert.equal(await page.$eval('#st-fields [data-path="data.links[0].url"] label', (n) => n.textContent), 'Profile address');
  await tab(page, 'style');
  assert.deepEqual(await paths(), ['variant', 'style.background', 'style.align', 'style.spacing']);
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.value + ':' + x.text)), ['icons:Icons', 'buttons:Buttons']);
  await tab(page, 'settings');
  assert.deepEqual(await paths(), ['anchor', 'hidden', 'id']);
  assert.equal(await page.$eval(fp('id'), (n) => n.value + '|' + n.readOnly), S + '|true');
  await page.click('#st-outline [data-id="s_hero01"]');
  await page.click('#st-outline [data-id="' + S + '"]');
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Social Media');
  assert.deepEqual(errors, []);
  await page.close();
});

test('the title reaches the preview, with its counter', async () => {
  const { page } = await openSocial();
  await typeInto(page, fp('data.title'), 'Folge uns');
  await previewHas(page, '<h2 class="v3-h2">Folge uns</h2>');
  assert.equal(await page.$eval('#st-fields [data-path="data.title"] .st-count', (n) => n.textContent), '9 / 80');
  await typeInto(page, fp('data.title'), 'x'.repeat(81));
  await until(async () => (await errorOf(page, 'data.title')) === 'Too long: at most 80 characters.', 'too long');
  assert.equal(await stale(page), true);
  await page.close();
});

test('add: Instagram with an empty address, its inline state, the notice; one Undo step', async () => {
  const { page, errors } = await openSocial();
  await page.click('#st-fields [data-action="add-item"]');
  await until(async () => (await page.$$eval('#st-fields .st-item', (n) => n.length)) === 3, 'three rows');
  assert.deepEqual(await page.$$eval('#st-fields .st-item.is-open', (n) => n.map((x) => x.getAttribute('data-index'))), ['2'], 'the new row is open');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-path]').getAttribute('data-path')), 'data.links[2].url', 'focus on its address');
  assert.equal(await page.$eval(it(2, 'platform', 'select'), (n) => n.value), 'instagram');
  assert.equal(await page.$eval(it(2, 'url'), (n) => n.value + '|' + n.placeholder), '|https://www.instagram.com/…');
  assert.equal(await errorOf(page, 'data.links[2].url'), 'Enter the profile address.');
  assert.equal(await page.$eval(row(2), (n) => n.classList.contains('has-error') && n.querySelector('.st-item__err').textContent), '1 error');
  assert.deepEqual((await rows(page))[2], 'Instagram · (no address)');
  assert.equal(await stale(page), true);
  assert.deepEqual(links(await srcdoc(page)), DEMO, 'the incomplete link is not in the preview');
  await page.keyboard.type('https://www.instagram.com/neu');
  await until(async () => !(await stale(page)), 'notice gone once valid');
  await until(async () => links(await srcdoc(page)).length === 3, 'now in the preview');
  assert.equal(await page.$eval(row(2), (n) => n.classList.contains('has-error')), false);
  await page.evaluate(() => document.activeElement.blur());
  await page.click('#st-undo-btn'); // the typing: empty again, so the preview keeps the last valid version
  await until(async () => (await page.$eval(it(2, 'url'), (n) => n.value)) === '', 'address empty again');
  assert.equal(await stale(page), true);
  assert.equal(links(await srcdoc(page)).length, 3);
  await page.click('#st-undo-btn'); // the add, as one step
  await until(async () => (await page.$$eval('#st-fields .st-item', (n) => n.length)) === 2, 'add undone in one step');
  assert.equal(await stale(page), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('at most 8 links: Add is disabled and says so', async () => {
  const { page } = await openSocial();
  for (let n = 2; n < 8; n++) await page.click('#st-fields [data-action="add-item"]');
  await until(async () => (await page.$$eval('#st-fields .st-item', (n) => n.length)) === 8, 'eight rows');
  assert.equal(await page.$eval('#st-fields [data-action="add-item"]', (n) => n.disabled + '|' + n.textContent), 'true|Add link');
  assert.equal(await page.$eval('#st-fields [data-hint="max"]', (n) => !n.hidden && n.textContent), 'Up to 8 links.');
  assert.equal(await page.$eval('#st-fields .st-items__count', (n) => n.textContent), '(8 / 8)');
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 1, 'still one row open');
  assert.equal((await draft(page)).length, 8);
  await page.close();
});

test('remove + Undo; removing every link leaves the empty-section note', async () => {
  const { page } = await openSocial();
  assert.equal(await page.$eval(row(0) + ' [data-action="remove-item"]', (n) => n.getAttribute('aria-label')), 'Remove link');
  await page.click(row(0) + ' [data-action="remove-item"]');
  await until(async () => links(await srcdoc(page)).join() === DEMO[1], 'removed from the preview');
  assert.deepEqual(await rows(page), ['Facebook · www.facebook.com']);
  await until(async () => /Link removed\. Undo is available\./.test(await page.$eval('#st-live', (n) => n.textContent)), 'announced');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.st-item') && document.activeElement.closest('.st-item').getAttribute('data-index')), '0', 'focus on the next row');
  await page.click('#st-undo-btn');
  await until(async () => links(await srcdoc(page)).join() === DEMO.join(), 'back, in place');
  for (let k = 0; k < 2; k++) await page.click(row(0) + ' [data-action="remove-item"]');
  await until(async () => (await srcdoc(page)).match(new RegExp('data-v3-id="' + S + '"[^>]*v3-ph-section')), 'empty-section note');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-action')), 'add-item', 'focus on Add');
  await page.close();
});

test('reorder: Move up / Move down and Alt+arrows; the preview follows; Undo', async () => {
  const { page } = await openSocial();
  await page.click('#st-fields [data-action="add-item"]');
  await page.keyboard.type('https://www.instagram.com/drei');
  await until(async () => links(await srcdoc(page)).length === 3, 'three links');
  await page.evaluate(() => document.activeElement.blur());
  const order = async () => links(await srcdoc(page)).map((x) => x.split('/').pop()).join();
  assert.equal(await page.$eval(row(0) + ' [data-action="move-up"]', (n) => n.disabled), true);
  assert.equal(await page.$eval(row(2) + ' [data-action="move-down"]', (n) => n.disabled), true);
  await page.click(row(0) + ' [data-action="move-down"]');
  await until(async () => (await order()) === 'example,example,drei' && links(await srcdoc(page))[0].startsWith('facebook'), 'moved down');
  await until(async () => /Link moved\./.test(await page.$eval('#st-live', (n) => n.textContent)), 'announced');
  await page.focus(row(2) + ' .st-item__toggle');
  await keys(page, ['Alt'], 'ArrowUp');
  await until(async () => (await order()) === 'example,drei,example', 'Alt+ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.st-item').getAttribute('data-index')), '1', 'focus follows the moved row');
  await keys(page, ['Alt'], 'ArrowUp');
  await until(async () => (await order()) === 'drei,example,example', 'to the top');
  await keys(page, ['Alt'], 'ArrowDown');
  await until(async () => (await order()) === 'example,drei,example', 'Alt+ArrowDown');
  await page.click('#st-undo-btn');
  await until(async () => (await order()) === 'drei,example,example', 'undo one move');
  await page.close();
});

test('one row open at a time', async () => {
  const { page } = await openSocial();
  await openRow(page, 0);
  assert.deepEqual(await page.$$eval('#st-fields .st-item.is-open', (n) => n.map((x) => x.getAttribute('data-index'))), ['0']);
  await page.click(row(1) + ' .st-item__toggle');
  assert.deepEqual(await page.$$eval('#st-fields .st-item.is-open', (n) => n.map((x) => x.getAttribute('data-index'))), ['1']);
  assert.equal(await page.$eval(row(1) + ' .st-item__toggle', (n) => n.getAttribute('aria-expanded')), 'true');
  assert.equal(await page.$eval(row(0) + ' .st-item__toggle', (n) => n.getAttribute('aria-expanded')), 'false');
  await page.click(row(1) + ' .st-item__toggle');
  assert.equal(await page.$$eval('#st-fields .st-item.is-open', (n) => n.length), 0, 'and can be closed');
  await page.close();
});

test('all eight platforms: invalid address -> inline error and the last valid preview; valid -> the link with its letter mark', async () => {
  const { page } = await openSocial();
  await openRow(page, 0);
  const cases = [
    ['instagram', 'Instagram', 'https://www.instagram.com/…', 'instagram.com', 'https://www.instagram.com/meinladen'],
    ['facebook', 'Facebook', 'https://www.facebook.com/…', 'facebook.com or fb.com', 'https://fb.com/meinladen'],
    ['tiktok', 'TikTok', 'https://www.tiktok.com/…', 'tiktok.com', 'https://www.tiktok.com/@meinladen'],
    ['youtube', 'YouTube', 'https://www.youtube.com/…', 'youtube.com or youtu.be', 'https://youtu.be/abc123'],
    ['linkedin', 'LinkedIn', 'https://www.linkedin.com/…', 'linkedin.com', 'https://www.linkedin.com/company/meinladen'],
    ['x', 'X', 'https://x.com/…', 'x.com or twitter.com', 'https://twitter.com/meinladen'],
    ['pinterest', 'Pinterest', 'https://www.pinterest.com/…', 'pinterest.com or pinterest.de', 'https://www.pinterest.de/meinladen'],
  ];
  const first = async () => links(await srcdoc(page))[0];
  for (const [p, label, placeholder, hosts, good] of cases) {
    await page.select(it(0, 'platform', 'select'), p);
    await until(async () => (await page.$eval('#st-fields [data-path="data.links[0].url"]', (n) => n.getAttribute('data-platform'))) === p, p + ': its own address field');
    assert.equal(await page.$eval(it(0, 'url'), (n) => n.type + '|' + n.placeholder), 'url|' + placeholder, p + ' placeholder');
    assert.equal(await page.$eval('#st-fields [data-path="data.links[0].url"] .st-hint', (n) => n.textContent), 'A full address starting with https:// on ' + hosts + '.');
    const msg = label + ' addresses start with https:// on ' + hosts + '.';
    for (const bad of ['https://evil.example/meinladen', good.replace('https://', 'http://'), good.replace('https://', '')]) {
      await typeInto(page, it(0, 'url'), bad);
      await until(async () => (await errorOf(page, 'data.links[0].url')) === msg, p + ' error for ' + bad);
      assert.equal(await stale(page), true);
    }
    const lastValid = await first();
    await sleep(250);
    assert.equal(await first(), lastValid, p + ': the preview keeps the last valid link');
    await typeInto(page, it(0, 'url'), good);
    await previewHas(page, '<a class="v3-social v3-social-' + p + '" href="' + good + '" target="_blank" rel="noopener noreferrer" aria-label="' + label + '"><span class="v3-social-mark" aria-hidden="true">' + label[0] + '</span></a>');
    assert.equal(await errorOf(page, 'data.links[0].url'), '');
    assert.equal(await stale(page), false);
    assert.equal((await rows(page))[0], label + ' · ' + new URL(good).host);
  }
  // WhatsApp: a number
  await page.select(it(0, 'platform', 'select'), 'whatsapp');
  await until(async () => (await page.$eval('#st-fields [data-path="data.links[0].url"]', (n) => n.getAttribute('data-platform'))) === 'whatsapp', 'WhatsApp field');
  assert.equal(await page.$eval(it(0, 'url'), (n) => n.type + '|' + n.placeholder), 'tel|+49 151 2345678');
  assert.equal(await page.$eval('#st-fields [data-path="data.links[0].url"] label', (n) => n.textContent), 'WhatsApp number');
  assert.equal(await errorOf(page, 'data.links[0].url'), 'Enter the WhatsApp number in international format, e.g. +49 151 2345678.', 'the Pinterest address does not fit');
  await typeInto(page, it(0, 'url'), 'abc');
  await until(async () => (await errorOf(page, 'data.links[0].url')) === 'Enter the WhatsApp number in international format, e.g. +49 151 2345678.', 'no digits');
  await typeInto(page, it(0, 'url'), '+49 151 2345678');
  await previewHas(page, '<a class="v3-social v3-social-whatsapp" href="https://wa.me/491512345678" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><span class="v3-social-mark" aria-hidden="true">W</span></a>');
  assert.equal(await errorOf(page, 'data.links[0].url'), '');
  await page.close();
});

test('WhatsApp: the owner types a number; it is stored as the wa.me link and shown back as a number', async () => {
  const { page } = await openSocial();
  await openRow(page, 1);
  await page.select(it(1, 'platform', 'select'), 'whatsapp');
  assert.match(await page.$eval('#st-fields [data-path="data.links[1].url"] .st-hint', (n) => n.textContent), /International format/);
  await typeInto(page, it(1, 'url'), '0049 151 234 56 78');
  await previewHas(page, 'href="https://wa.me/491512345678"');
  assert.equal((await draft(page))[1].url, 'https://wa.me/491512345678');
  await page.evaluate(() => document.activeElement.blur());
  await page.click(row(1) + ' .st-item__toggle'); await page.click(row(1) + ' .st-item__toggle'); // close and reopen
  assert.equal(await page.$eval(it(1, 'url'), (n) => n.value), '+491512345678');
  assert.equal((await rows(page))[1], 'WhatsApp · +491512345678');
  await page.close();
});

test('a platform change keeps the address and reports when it no longer fits; Undo brings both back', async () => {
  const { page } = await openSocial();
  await openRow(page, 0);
  await page.select(it(0, 'platform', 'select'), 'tiktok');
  await until(async () => (await errorOf(page, 'data.links[0].url')) === 'TikTok addresses start with https:// on tiktok.com.', 'incompatible');
  assert.equal(await page.$eval(it(0, 'url'), (n) => n.value), 'https://www.instagram.com/example', 'kept, not converted');
  assert.equal((await draft(page))[0].url, 'https://www.instagram.com/example');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-path]').getAttribute('data-path')), 'data.links[0].platform', 'focus stays on the platform');
  assert.equal(await stale(page), true);
  await sleep(250);
  assert.deepEqual(links(await srcdoc(page)), DEMO, 'the last valid preview');
  assert.equal(await page.$eval(row(0), (n) => n.querySelector('.st-item__err').textContent), '1 error');
  // closed, the row still shows the error
  await page.click(row(0) + ' .st-item__toggle');
  assert.equal(await page.$eval(row(0), (n) => n.classList.contains('has-error') && !n.querySelector('.st-item__err').hidden), true);
  await page.click('#st-undo-btn');
  await until(async () => (await draft(page))[0].platform === 'instagram', 'platform back');
  assert.equal(await stale(page), false);
  assert.equal(await page.$eval(row(0), (n) => n.classList.contains('has-error')), false);
  // a Facebook address on Facebook stays valid; on WhatsApp it is kept and reported
  await openRow(page, 1);
  await page.select(it(1, 'platform', 'select'), 'whatsapp');
  await until(async () => /WhatsApp number/.test(await errorOf(page, 'data.links[1].url')), 'WhatsApp error');
  assert.equal(await page.$eval(it(1, 'url'), (n) => n.value), 'https://www.facebook.com/example');
  await page.close();
});

test('Style: Icons / Buttons layouts, background, alignment (the links are centred), spacing', async () => {
  const { page } = await openSocial();
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'buttons');
  await previewHas(page, '<span class="v3-social-mark" aria-hidden="true">I</span><span>Instagram</span></a>');
  await page.select(fp('variant', 'select'), 'icons');
  await previewLacks(page, '<span>Instagram</span>');
  await page.select(fp('variant', 'select'), 'buttons');
  await page.select(fp('style.background', 'select'), 'dark');
  await page.select(fp('style.align', 'select'), 'center');
  await page.select(fp('style.spacing', 'select'), 'roomy');
  await previewHas(page, 'class="v3-s v3-socialMedia v3-v-buttons v3-bg-dark v3-al-center v3-sp-roomy"');
  const fr = await frame(page);
  await until(() => fr.$eval('[data-v3-id="' + S + '"] .v3-socials', (n) => getComputedStyle(n).justifyContent === 'center'), 'centred in the preview');
  assert.deepEqual(await page.$$eval(fp('style.background', 'select') + ' option', (n) => n.map((x) => x.text)), ['Default', 'Alternate', 'Brand colour', 'Dark']);
  assert.deepEqual(await page.$$eval(fp('style.spacing', 'select') + ' option', (n) => n.map((x) => x.text)), ['Normal', 'Compact', 'Roomy']);
  await page.select(fp('style.align', 'select'), 'left');
  await page.select(fp('style.spacing', 'select'), 'compact');
  await page.select(fp('style.background', 'select'), 'alt');
  await previewHas(page, 'class="v3-s v3-socialMedia v3-v-buttons v3-bg-alt v3-al-left v3-sp-compact"');
  await page.close();
});

test('Settings: link name (with the links that follow it), Show on page, read-only Section ID', async () => {
  const { page } = await openSocial();
  await page.click('#st-outline [data-id="s_hero01"]');
  await page.select(fp('data.primary.target', 'select'), '/' + S);
  await previewHas(page, 'v3-btn-primary" href="#' + S + '"');
  await page.click('#st-outline [data-id="' + S + '"]');
  await tab(page, 'settings');
  await typeInto(page, fp('anchor'), 'Folgen!');
  assert.match(await errorOf(page, 'anchor'), /lowercase letters/);
  await typeInto(page, fp('anchor'), 'folgen');
  await page.keyboard.press('Enter');
  await previewHas(page, 'id="folgen"');
  await previewHas(page, 'v3-btn-primary" href="#folgen"');
  await page.click(fp('hidden'));
  await previewLacks(page, 'data-v3-id="' + S + '"');
  assert.equal(await page.$eval('#st-outline [data-id="' + S + '"]', (n) => n.classList.contains('is-hidden')), true);
  await tab(page, 'content');
  await typeInto(page, fp('data.title'), 'Versteckt');
  await tab(page, 'settings');
  await page.click(fp('hidden'));
  await previewHas(page, '<h2 class="v3-h2">Versteckt</h2>');
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), S);
  await page.close();
});

test('hostile text stays text: escaped in the preview, refused as an address, nothing injected, no dialogs', async () => {
  const { page, errors } = await openSocial();
  const evil = '<img src=x onerror=alert(1)>';
  await typeInto(page, fp('data.title'), evil);
  await previewHas(page, '&lt;img src=x onerror=alert(1)&gt;');
  await openRow(page, 0);
  for (const bad of ['https://www.instagram.com/a"><svg onload=alert(2)>', 'javascript:alert(3)', 'https://www.instagram.com/<b>']) {
    await typeInto(page, it(0, 'url'), bad);
    await until(async () => (await errorOf(page, 'data.links[0].url')) === 'Instagram addresses start with https:// on instagram.com.', 'refused: ' + bad);
  }
  assert.equal(await page.$eval(row(0) + ' .st-item__kind', (n) => n.children.length), 0, 'the row shows text only');
  await sleep(400);
  const html = await srcdoc(page);
  assert.ok(!html.includes('alert(2)') && !html.includes('alert(3)'));
  const fr = await frame(page);
  assert.deepEqual(await fr.evaluate(() => ({ imgs: document.querySelectorAll('main img').length, svg: document.querySelectorAll('svg[onload]').length, scripts: document.scripts.length })),
    { imgs: 0, svg: 0, scripts: 1 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('Undo / Redo across Social Media edits, buttons and keyboard', async () => {
  const { page } = await openSocial();
  await typeInto(page, fp('data.title'), 'Eins');
  await page.evaluate(() => document.activeElement.blur());
  await page.click(row(0) + ' [data-action="move-down"]');
  await tab(page, 'style');
  await page.select(fp('variant', 'select'), 'buttons');
  await previewHas(page, 'v3-v-buttons');
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await previewHas(page, 'v3-v-icons');
  await keys(page, ['Control'], 'z');
  await until(async () => links(await srcdoc(page))[0] === DEMO[0], 'move undone');
  await keys(page, ['Control'], 'z');
  await previewLacks(page, '<h2 class="v3-h2">Eins</h2>');
  await keys(page, ['Control', 'Shift'], 'z');
  await previewHas(page, '<h2 class="v3-h2">Eins</h2>');
  await page.click('#st-redo-btn');
  await until(async () => links(await srcdoc(page))[0] === DEMO[1], 'move redone');
  await keys(page, ['Control'], 'y');
  await previewHas(page, 'v3-v-buttons');
  assert.equal(await page.$eval('#st-redo-btn', (n) => n.disabled), true);
  await page.close();
});

test('German: the Social Media texts and errors', async () => {
  const { page, errors } = await openSocial(1440, 900, { lang: 'de' });
  assert.match(await page.$eval('#st-fields .st-items__head', (n) => n.textContent), /^Social-Links \(2 \/ 8\)$/);
  assert.equal(await page.$eval('#st-fields [data-action="add-item"]', (n) => n.textContent), 'Link hinzufügen');
  await page.click('#st-fields [data-action="add-item"]');
  await until(async () => (await errorOf(page, 'data.links[2].url')) === 'Gib die Profiladresse ein.', 'required');
  assert.equal(await page.$eval('#st-fields [data-path="data.links[2].url"] label', (n) => n.textContent), 'Profiladresse');
  assert.equal(await page.$eval('#st-fields [data-path="data.links[2].url"] .st-hint', (n) => n.textContent), 'Eine vollständige Adresse mit https:// auf instagram.com.');
  await page.select(it(2, 'platform', 'select'), 'x');
  await typeInto(page, it(2, 'url'), 'https://example.com');
  await until(async () => (await errorOf(page, 'data.links[2].url')) === 'X-Adressen beginnen mit https:// auf x.com oder twitter.com.', 'invalid');
  assert.equal((await rows(page))[2], 'X · example.com');
  await tab(page, 'style');
  assert.deepEqual(await page.$$eval(fp('variant', 'select') + ' option', (n) => n.map((x) => x.text)), ['Symbole', 'Buttons']);
  assert.deepEqual(errors, []);
  await page.close();
});

test('Light and Dark: the Social Media editor is styled by the Studio tokens, without overflow', async () => {
  for (const theme of ['light', 'dark']) {
    const { page, errors, net } = await openSocial(1440, 900, { theme });
    await openRow(page, 0);
    const s = await page.evaluate(() => {
      const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
      return { input: css('#st-fields .st-item__body input', 'backgroundColor'), select: css('#st-fields .st-item__body select', 'backgroundColor'), row: css('#st-fields .st-item', 'backgroundColor'),
        open: css('#st-fields .st-item.is-open', 'borderTopColor'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panel: document.querySelector('#st-fields').scrollWidth - document.querySelector('#st-fields').clientWidth };
    });
    const bg = theme === 'dark' ? 'rgb(23, 23, 25)' : 'rgb(255, 255, 255)';
    assert.equal(s.input, bg, theme + ' inputs');
    assert.equal(s.select, bg, theme + ' selects');
    assert.equal(s.row, bg, theme + ' rows');
    assert.equal(s.open, 'rgb(255, 90, 31)', theme + ': the open row in QRAIVY orange');
    assert.equal(s.overflow, 0);
    assert.equal(s.panel, 0, 'nothing wider than the inspector');
    assert.deepEqual(errors, []);
    assert.deepEqual(onlyLocal(net), []);
    await page.close();
  }
});

test('devices: Tablet and Mobile show the edit; both frames update side by side at 1920', async () => {
  const { page } = await openSocial();
  await typeInto(page, fp('data.title'), 'Überall');
  for (const d of ['tablet', 'mobile', 'desktop']) {
    await page.click('button[data-device="' + d + '"]');
    await previewHas(page, '<h2 class="v3-h2">Überall</h2>', d);
  }
  await page.close();
  const wide = await openSocial(1920, 1080);
  assert.deepEqual(await wide.page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['desktop', 'mobile']);
  await openRow(wide.page, 1);
  await typeInto(wide.page, it(1, 'url'), 'https://m.facebook.com/beide');
  await previewHas(wide.page, 'href="https://m.facebook.com/beide"', 'desktop');
  await previewHas(wide.page, 'href="https://m.facebook.com/beide"', 'mobile');
  await wide.page.close();
});

test('phones: preview only; a click on the Social Media section edits nothing', async () => {
  const { page, errors } = await open(390, 844);
  assert.equal(await page.$eval('#st-right', (n) => getComputedStyle(n).display), 'none');
  await clickInPreview(page, '[data-v3-id="' + S + '"] .v3-h2', 'mobile');
  await sleep(300);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'selection unchanged');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  assert.deepEqual(errors, []);
  await page.close();
});

// Contrast fix after the 2A-3C visual review: on Dark and Brand sections the
// links were white text on the light pill. Computed colours, public page.
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lumOf = (c) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const x = lumOf(rgb(a)), y = lumOf(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
test('Social Media links are readable on Default, Alternate, Brand and Dark, in the Icons and Buttons layouts (computed colours)', async () => {
  const V3 = require('../src/lpV3/core');
  const page = await browser.newPage();
  const palettes = { default: {}, demo: require('./fixtures/lpV3/localBusiness.json').theme.palette };
  for (const [pname, palette] of Object.entries(palettes)) {
    for (const background of ['default', 'alt', 'brand', 'dark']) {
      for (const variant of ['icons', 'buttons']) {
        const d = { schemaVersion: 1, theme: { palette }, pages: [{ id: 'start', sections: [{ id: 's_soc01', type: 'socialMedia', variant, style: { background }, data: { title: 'T', links: [{ platform: 'instagram', url: 'https://instagram.com/a' }] } }] }] };
        const r = V3.renderDesign(d, { businessName: 'B' });
        assert.ok(r.ok, JSON.stringify(r.errors));
        await page.setContent(r.html);
        const c = await page.$eval('.v3-social', (n) => {
          const s = getComputedStyle(n), m = getComputedStyle(n.querySelector('.v3-social-mark'));
          const label = n.querySelector('span:not(.v3-social-mark)');
          return { text: s.color, mark: m.color, label: label ? getComputedStyle(label).color : null, pill: s.backgroundColor };
        });
        const what = pname + ' palette, ' + background + ', ' + variant + ': ' + c.text + ' on ' + c.pill;
        assert.ok(ratio(c.text, c.pill) >= 4.5, what + ' (' + ratio(c.text, c.pill).toFixed(2) + ':1)');
        assert.ok(ratio(c.mark, c.pill) >= 4.5, what + ' letter mark');
        if (variant === 'buttons') assert.ok(ratio(c.label, c.pill) >= 4.5, what + ' label');
        assert.ok(!(lumOf(rgb(c.text)) > 0.8 && lumOf(rgb(c.pill)) > 0.8), what + ': light on light');
      }
    }
  }
  await page.close();
  // and in the Studio preview, after choosing Dark and Brand
  const { page: st } = await openSocial();
  await tab(st, 'style');
  await st.select(fp('variant', 'select'), 'buttons');
  for (const bg of ['dark', 'brand']) {
    await st.select(fp('style.background', 'select'), bg);
    await previewHas(st, 'v3-bg-' + bg);
    const fr = await frame(st);
    const c = await until(() => fr.$eval('[data-v3-id="' + S + '"].v3-bg-' + bg + ' .v3-social', (n) => ({ text: getComputedStyle(n).color, pill: getComputedStyle(n).backgroundColor })).catch(() => null), 'styled ' + bg);
    assert.ok(ratio(c.text, c.pill) >= 4.5, 'Studio preview ' + bg + ': ' + c.text + ' on ' + c.pill);
  }
  await st.close();
});

test('after editing: no network beyond this server and Google Fonts; Save Draft and Publish disabled; only Hero, Buttons, Social Media (and since 2A-3D Contact) editable', async () => {
  const { page, net, errors } = await openSocial();
  await page.click('#st-fields [data-action="add-item"]');
  await page.select(it(2, 'platform', 'select'), 'youtube');
  await typeInto(page, it(2, 'url'), 'https://www.youtube.com/@example');
  await page.click(row(0) + ' [data-action="remove-item"]');
  await sleep(400);
  assert.deepEqual(onlyLocal(net), []);
  assert.deepEqual(await page.$$eval('#st-save-btn, #st-publish-btn', (n) => n.map((b) => b.disabled)), [true, true]);
  for (const id of ['s_hero01', 's_quick01', S, 's_contact1']) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true', id + ' editable');
  }
  for (const id of ['s_deals01', 's_loyal01', 's_prod01', 's_hours01']) {
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
