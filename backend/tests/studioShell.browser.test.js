// ============================================================
// studioShell.browser.test.js — Landing Page Studio V3, Phase 2A-2, in a
// real browser (LOCAL ONLY: needs Chrome and puppeteer-core; prints SKIP
// and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. Checked:
// - layout at 1920 / 1440 / 1280 / 1024 / 820 / 390 px: no horizontal page
//   overflow, panels beside the preview from 1200 px, drawers below, desktop
//   and phone side by side at 1920, no page errors;
// - no network except this server and Google Fonts (no API at all);
// - Save Draft and Publish stay disabled;
// - Light / Dark / System appearance, remembered, never changes the page
//   preview; device toggle; drawers; template strip;
// - on a production address the Studio does not start and sends nothing.
// Run: node tests/studioShell.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioShell.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function fileFor(urlPath) {
  const p = path.join(PUB, decodeURIComponent(urlPath.split('?')[0]));
  return p.startsWith(PUB) && fs.existsSync(p) && !fs.statSync(p).isDirectory() ? p : null;
}
const server = http.createServer((req, res) => {
  const p = fileFor(req.url);
  if (!p) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let browser, base;

async function open(width, height, { theme = 'light', templates = null, media = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  if (media) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: media }]);
  await page.evaluateOnNewDocument((t, tp) => { try { localStorage.setItem('qraivy.studio.theme', t); localStorage.setItem('qraivy_lang', 'en'); if (tp) localStorage.setItem('qraivy.studio.templates', tp); } catch (e) {} }, theme, templates);
  const net = [], errors = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) net.push(u.host); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  return { page, net, errors };
}
const layout = (page) => page.evaluate(() => {
  const shown = (id) => { const n = document.getElementById(id); const cs = getComputedStyle(n); const r = n.getBoundingClientRect(); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.right > 0 && r.left < innerWidth; };
  return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, left: shown('st-left'), right: shown('st-right'),
    frames: [...document.querySelectorAll('#st-canvas .st-frame')].map((f) => f.getAttribute('data-device')),
    publish: document.getElementById('st-publish-btn').disabled, save: document.getElementById('st-save-btn').disabled,
    theme: document.documentElement.getAttribute('data-studio-theme') };
});

test('layout at six widths: no overflow, panels or drawers, previews, disabled actions, no errors, no API', async () => {
  const expect = { 1920: [true, ['desktop', 'mobile']], 1440: [true, ['desktop']], 1280: [true, ['desktop']], 1024: [false, ['desktop']], 820: [false, ['desktop']], 390: [false, ['mobile']] };
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [820, 1180], [390, 844]]) {
    for (const theme of ['light', 'dark']) {
      const { page, net, errors } = await open(w, h, { theme });
      const l = await layout(page);
      assert.equal(l.overflow, 0, w + ' horizontal overflow');
      assert.equal(l.left, expect[w][0], w + ' left panel');
      assert.equal(l.right, expect[w][0], w + ' right panel');
      assert.deepEqual(l.frames, expect[w][1], w + ' previews');
      assert.ok(l.publish && l.save, w + ' Publish and Save Draft disabled');
      assert.equal(l.theme, theme);
      assert.deepEqual(errors, [], w + ' page errors');
      const hosts = [...new Set(net)].filter((x) => x !== new URL(base).host && !FONT_HOSTS.includes(x));
      assert.deepEqual(hosts, [], w + ' requests outside this server and Google Fonts');
      await page.close();
    }
  }
});

test('appearance: Dark and System, remembered; the page preview is the same in every mode', async () => {
  const { page } = await open(1440, 900);
  const previewOf = () => page.$eval('#st-canvas iframe', (f) => f.srcdoc);
  const before = await previewOf();
  await page.click('[data-theme-pref="dark"]');
  assert.equal(await page.$eval('html', (n) => n.getAttribute('data-studio-theme')), 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('qraivy.studio.theme')), 'dark');
  assert.equal(await previewOf(), before, 'the landing page keeps its own theme');
  await page.close();
  const sys = await open(1440, 900, { theme: 'system', media: 'dark' });
  assert.equal(await sys.page.$eval('html', (n) => n.getAttribute('data-studio-theme')), 'dark', 'System follows the device');
  await sys.page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(await sys.page.$eval('html', (n) => n.getAttribute('data-studio-theme')), 'light', 'and changes with it');
  await sys.page.close();
});

test('device toggle; preview frames sandboxed with scripts only (2A-3A), the full-size preview with nothing', async () => {
  const { page } = await open(1440, 900);
  await page.click('button[data-device="mobile"]');
  assert.deepEqual((await layout(page)).frames, ['mobile']);
  await page.click('button[data-device="tablet"]');
  assert.deepEqual((await layout(page)).frames, ['tablet']);
  assert.deepEqual(await page.$$eval('iframe', (fs) => fs.map((f) => f.getAttribute('sandbox'))), ['allow-scripts', '']);
  await page.close();
});

test('drawers below 1200 px: one at a time, Escape and the scrim close them', async () => {
  const { page } = await open(1024, 768);
  await page.click('#st-open-left');
  await new Promise((r) => setTimeout(r, 300));
  let l = await layout(page);
  assert.ok(l.left && !l.right);
  // the scrim covers everything behind the drawer: a click there closes it
  await page.mouse.click(600, 400);
  await new Promise((r) => setTimeout(r, 300));
  l = await layout(page);
  assert.ok(!l.left && !l.right, 'the scrim closes the drawer');
  await page.click('#st-open-right');
  await new Promise((r) => setTimeout(r, 300));
  l = await layout(page);
  assert.ok(!l.left && l.right, 'one at a time');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  l = await layout(page);
  assert.ok(!l.left && !l.right);
  assert.equal(l.overflow, 0);
  await page.close();
});

test('template strip: open on a large desktop, collapsible, remembered; collapsed by default on tablets', async () => {
  const { page } = await open(1920, 1080);
  assert.equal(await page.$eval('#st-templates-toggle', (b) => b.getAttribute('aria-expanded')), 'true');
  assert.equal(await page.$$eval('#st-templates-list .st-tpl', (x) => x.length), 5);
  await page.click('#st-templates-toggle');
  assert.equal(await page.$eval('#st-templates-list', (x) => x.hidden), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('qraivy.studio.templates')), 'collapsed');
  await page.close();
  const tab = await open(820, 1180);
  assert.equal(await tab.page.$eval('#st-templates-toggle', (b) => b.getAttribute('aria-expanded')), 'false');
  await tab.page.close();
});

test('desktop panels hide independently, are remembered, and the preview takes the space', async () => {
  const { page } = await open(1440, 900);
  const frameW = () => page.$eval('#st-canvas .st-frame', (f) => f.getBoundingClientRect().width);
  const w0 = await frameW();
  await page.click('#st-collapse-left');
  let l = await layout(page);
  assert.ok(!l.left && l.right, 'left hidden, right stays');
  const w1 = await frameW();
  assert.ok(w1 > w0, 'preview grows (' + w0 + ' -> ' + w1 + ')');
  await page.click('#st-collapse-right');
  l = await layout(page);
  assert.ok(!l.left && !l.right && l.overflow === 0);
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('qraivy.studio.panels'))), { left: false, right: false });
  await page.reload({ waitUntil: 'networkidle0' });
  l = await layout(page);
  assert.ok(!l.left && !l.right, 'remembered after reload');
  await page.click('#st-open-right');
  l = await layout(page);
  assert.ok(!l.left && l.right, 'brought back one at a time');
  await page.close();
});

test('phones: one page scroll (no box scrolling inside another), preview first, no panels', async () => {
  const { page } = await open(390, 844);
  const s = await page.evaluate(() => ({
    pageScrolls: document.scrollingElement.scrollHeight > innerHeight,
    canvasOverflow: getComputedStyle(document.getElementById('st-canvas')).overflowY,
    workOverflow: getComputedStyle(document.getElementById('st-work')).overflowY,
    panels: ['st-left', 'st-right'].map((id) => getComputedStyle(document.getElementById(id)).display),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(s.pageScrolls, true, 'the page itself scrolls');
  assert.equal(s.canvasOverflow, 'visible');
  assert.equal(s.workOverflow, 'visible');
  assert.deepEqual(s.panels, ['none', 'none']);
  assert.equal(s.overflowX, 0);
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  assert.ok(await page.$eval('#st-templates-toggle', (b) => { const r = b.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), 'the template strip is reachable by scrolling');
  await page.close();
});

test('local mode: the sidebar account reads "Local preview / Not signed in" (no "Loading…")', async () => {
  const { page } = await open(1440, 900);
  const acc = await page.evaluate(() => ({ name: document.getElementById('sb-username').textContent, role: document.querySelector('#sidebar .sb-user-role').textContent, avatar: document.getElementById('sb-avatar').textContent }));
  assert.deepEqual(acc, { name: 'Local preview', role: 'Not signed in', avatar: 'Q' });
  await page.close();
});

test('on a production address the Studio does not start and sends no request', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setRequestInterception(true);
  const net = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    net.push(u.host);
    if (u.host === 'www.qraivy.com') { const p = fileFor(u.pathname); return p ? r.respond({ status: 200, contentType: TYPES[path.extname(p)], body: fs.readFileSync(p) }) : r.respond({ status: 404, body: '' }); }
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    return r.abort();
  });
  await page.goto('https://www.qraivy.com/studio.html', { waitUntil: 'networkidle0' });
  const s = await page.evaluate(() => ({ unavailable: !document.getElementById('st-unavailable').hidden, top: getComputedStyle(document.getElementById('st-top')).display,
    frames: document.querySelectorAll('#st-canvas iframe').length, text: document.querySelector('#st-unavailable h1').textContent }));
  assert.ok(s.unavailable && s.top === 'none' && s.frames === 0, JSON.stringify(s));
  assert.match(s.text, /isn't available here yet/);
  assert.deepEqual([...new Set(net)].filter((h) => h !== 'www.qraivy.com' && !FONT_HOSTS.includes(h)), [], 'no other request (nothing reached the real site: answered locally)');
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
