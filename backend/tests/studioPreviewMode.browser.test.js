// ============================================================
// studioPreviewMode.browser.test.js — Landing Page Studio V3 preview mode,
// in a real browser (LOCAL ONLY: needs Chrome and puppeteer-core; prints
// SKIP and passes when they are missing).
//
// The page is served from exactly the Studio-files-only upload
// (backend/staging/studio-preview-export.js, built here from the working
// tree) on intercepted addresses, nothing else. Checked:
// - https://qraivy-studio-staging.vercel.app: the Studio starts in preview
//   mode ("Preview · not saved", German too), editing works in memory, Save
//   Draft and Publish stay disabled, every file it asks for is in the upload,
//   no request beyond that address and Google Fonts, no page errors; "/"
//   goes to the Studio (the upload's own vercel.json);
// - the public qraivy-ai preview, the per-deployment and team addresses of
//   the Studio project, plain http and look-alike names: the Studio does
//   not start;
// - localhost keeps local mode ("Local preview · not saved").
// Run: node tests/studioPreviewMode.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioPreviewMode.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const { buildUpload, STUDIO_VERCEL } = require('../staging/studio-preview-export');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const UPLOAD = buildUpload({
  list: (dir) => fs.readdirSync(path.join(PUB, dir), { recursive: true }).map((f) => dir + String(f).replace(/\\/g, '/')).filter((f) => fs.statSync(path.join(PUB, f)).isFile()),
  read: (name) => fs.readFileSync(path.join(PUB, name)),
});
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };
const PREVIEW = 'qraivy-studio-staging.vercel.app';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const server = http.createServer((req, res) => {
  const p = path.join(PUB, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let browser, base;

// Serves the upload on any intercepted address (like the Vercel project
// would: the upload's redirect for "/", 404 for everything not uploaded).
async function openAt(url, { lang = 'en', width = 1440, height = 900 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((l) => { try { localStorage.setItem('qraivy_lang', l); localStorage.setItem('qraivy.studio.theme', 'light'); } catch (e) {} }, lang);
  await page.setRequestInterception(true);
  const net = [], missing = [], errors = [];
  const host = new URL(url).host;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol)) net.push(u.host);
    if (u.host === host) {
      const redirect = STUDIO_VERCEL.redirects.find((x) => x.source === u.pathname);
      if (redirect) return r.respond({ status: 302, headers: { location: redirect.destination }, body: '' });
      const name = decodeURIComponent(u.pathname).replace(/^\//, '');
      if (!UPLOAD.has(name)) { missing.push(name); return r.respond({ status: 404, body: '' }); }
      return r.respond({ status: 200, contentType: TYPES[path.extname(name)] || 'application/octet-stream', body: UPLOAD.get(name) });
    }
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    return r.abort();
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  return { page, net, missing, errors };
}
const state = (page) => page.evaluate(() => ({
  unavailable: !document.getElementById('st-unavailable').hidden,
  frames: document.querySelectorAll('#st-canvas iframe').length,
  mode: document.getElementById('st-mode').textContent,
  account: document.getElementById('sb-username').textContent + ' / ' + document.querySelector('#sidebar .sb-user-role').textContent,
  save: document.getElementById('st-save-btn').disabled, publish: document.getElementById('st-publish-btn').disabled,
  path: location.pathname,
}));

test('preview address: the Studio starts in preview mode; only the upload and Google Fonts; nothing missing; no errors', async () => {
  const { page, net, missing, errors } = await openAt('https://' + PREVIEW + '/studio.html');
  const s = await state(page);
  assert.equal(s.unavailable, false);
  assert.ok(s.frames > 0, 'preview frames');
  assert.equal(s.mode, 'Preview · not saved');
  assert.equal(s.account, 'Preview / Not signed in');
  assert.ok(s.save && s.publish, 'Save Draft and Publish disabled');
  assert.equal(await page.evaluate(() => JSON.stringify(window.QRAIVY_STUDIO_ROUTING)), JSON.stringify({ mode: 'preview', api: '', blocked: false }));
  assert.deepEqual(missing, [], 'every file the Studio loads is in the upload');
  assert.deepEqual(errors, []);
  assert.ok(net.every((h) => h === PREVIEW || FONT_HOSTS.includes(h)), 'no other host: ' + [...new Set(net)].join(', '));
  await page.close();
});

test('preview address: "/" opens the Studio (the upload\'s own redirect)', async () => {
  const { page, missing } = await openAt('https://' + PREVIEW + '/');
  const s = await state(page);
  assert.equal(s.path, '/studio.html');
  assert.equal(s.unavailable, false);
  assert.deepEqual(missing, []);
  await page.close();
});

test('preview address in German: "Vorschau · nicht gespeichert"', async () => {
  const { page } = await openAt('https://' + PREVIEW + '/studio.html', { lang: 'de' });
  const s = await state(page);
  assert.equal(s.mode, 'Vorschau · nicht gespeichert');
  assert.equal(s.account, 'Vorschau / Nicht angemeldet');
  await page.close();
});

test('preview address: editing works in memory; still nothing saved, still no other request', async () => {
  const { page, net } = await openAt('https://' + PREVIEW + '/studio.html');
  await page.evaluate(() => window.QraivyStudio.editor.set('s_hero01', ['data', 'headline'], 'Preview edit 123'));
  await page.waitForFunction(() => [...document.querySelectorAll('#st-canvas iframe')].every((f) => (f.srcdoc || '').includes('Preview edit 123')), { timeout: 5000 });
  const s = await state(page);
  assert.ok(s.save && s.publish);
  assert.ok(await page.evaluate(() => !document.getElementById('st-undo-btn').disabled), 'Undo available');
  assert.ok(net.every((h) => h === PREVIEW || FONT_HOSTS.includes(h)));
  await page.close();
});

test('every other address with the same files: the Studio does not start', async () => {
  for (const url of [
    'https://qraivy-ai-git-preview-l-3d55c7-adwinscottrussell-5957s-projects.vercel.app/studio.html',
    'https://qraivy-pb0klf7kc-adwinscottrussell-5957s-projects.vercel.app/studio.html',
    'https://qraivy-studio-staging-lzul4fejl.vercel.app/studio.html',
    'https://qraivy-studio-staging-adwinscottrussell-5957s-projects.vercel.app/studio.html',
    'http://' + PREVIEW + '/studio.html',
    'https://' + PREVIEW + '.evil.example/studio.html',
    'https://www.qraivy.com/studio.html',
  ]) {
    const { page } = await openAt(url);
    const s = await state(page);
    assert.ok(s.unavailable && s.frames === 0, url + ' ' + JSON.stringify(s));
    assert.equal(await page.evaluate(() => window.QRAIVY_STUDIO_ROUTING.mode), 'unavailable', url);
    await page.close();
  }
});

test('localhost keeps local mode ("Local preview · not saved")', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('qraivy_lang', 'en'); } catch (e) {} });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  const s = await state(page);
  assert.equal(s.unavailable, false);
  assert.equal(s.mode, 'Local preview · not saved');
  assert.equal(s.account, 'Local preview / Not signed in');
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
