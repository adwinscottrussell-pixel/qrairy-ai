// ============================================================
// studioPreviewAuth.browser.test.js — Landing Page Studio V3: the demo
// photos behind a sign-in, in a real browser (LOCAL ONLY: needs Chrome and
// puppeteer-core; prints SKIP and passes when they are missing).
//
// Reproduces the private preview (Vercel Authentication): every file is
// served only with a sign-in cookie (SameSite=Lax, like a login cookie), and
// the Studio's preview frames are sandboxed, so their own requests go out as
// cross-site WITHOUT that cookie. The live bug of 2026-10-24: the Gallery
// photos were file paths inside the frame, came back as the login redirect
// and showed as broken images (descriptions and labels overlapping).
// Checked: the photos are loaded by the Studio page (with the cookie) and
// shown in the frame inline, on desktop, tablet and mobile; the frame itself
// requests no photo; descriptions are not shown as text and nothing
// overlaps; if the photos cannot be loaded, a neutral placeholder shows
// instead (no broken image, no label, no error).
// Run: node tests/studioPreviewAuth.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioPreviewAuth.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const G = 's_gal01';
let log = [], refusePhotos = false;
// the sign-in gate: no cookie, no file (a redirect, as Vercel answers)
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/login') {
    res.writeHead(302, { 'Set-Cookie': 'signin=1; Path=/; HttpOnly; SameSite=Lax', Location: '/studio.html' });
    return res.end();
  }
  const signed = /(?:^|;\s*)signin=1/.test(req.headers.cookie || '');
  log.push({ url, signed, site: req.headers['sec-fetch-site'] || '' });
  if (!signed || (refusePhotos && /\/images\/deals\/starter\//.test(url))) { res.writeHead(302, { Location: '/login-required' }); return res.end(); }
  const p = path.join(PUB, decodeURIComponent(url));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, base;
async function until(fn, what, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(80); }
}
async function signIn(width = 1440, height = 900) {
  log = [];
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('qraivy_lang', 'en'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + '/login', { waitUntil: 'networkidle0' });
  // Phase C.1: the preview starts phone-first; these checks use the desktop frame (picked as an owner would, then loaded)
  if (await page.evaluate(() => { const b = document.querySelector('button[data-device="desktop"]'); if (!b || !b.offsetParent || b.getAttribute('aria-checked') === 'true') return false; b.click(); return true; })) {
    const h = await page.$('#st-canvas iframe[data-device="desktop"]'); const f = h && await h.contentFrame();
    if (f) await f.waitForSelector('[data-v3-id]', { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  return { page, errors };
}
async function frame(page, device = 'desktop') { return (await page.$('#st-canvas iframe[data-device="' + device + '"]')).contentFrame(); }
// the Gallery as drawn in a preview frame, scrolled into view
async function gallery(page, device) {
  const fr = await frame(page, device);
  await fr.evaluate((id) => document.querySelector('[data-v3-id="' + id + '"]').scrollIntoView(), G);
  await sleep(300);
  return fr.$eval('[data-v3-id="' + G + '"]', (n) => [...n.querySelectorAll('.v3-gal-item')].map((f) => {
    const img = f.querySelector('img'), cap = f.querySelector('figcaption'), badge = f.querySelector('.st-ai');
    const ib = img.getBoundingClientRect(), cb = cap && cap.getBoundingClientRect(), bb = badge && badge.getBoundingClientRect();
    return { inline: /^data:image\/jpeg;base64,/.test(img.getAttribute('src')), placeholder: img.getAttribute('data-st-placeholder') === '1' && /^data:image\/svg\+xml,/.test(img.getAttribute('src')),
      loaded: img.complete && img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight, boxRatio: Math.round(ib.width / ib.height * 100) / 100,
      captionBelow: !cb || cb.top >= ib.bottom - 0.5, badgeInside: !bb || (bb.top >= ib.top && bb.bottom <= ib.bottom && bb.left >= ib.left && bb.right <= ib.right), badge: badge ? badge.textContent : null };
  }));
}
const photoRequests = () => log.filter((l) => /\/images\/deals\/starter\//.test(l.url));

test('signed in (SameSite=Lax cookie): the three photos load inside the preview on desktop, tablet and mobile; descriptions not shown as text; nothing overlaps', async () => {
  const { page, errors } = await signIn(1440, 900);
  await until(async () => (await gallery(page, 'desktop')).every((g) => g.inline && g.loaded), 'inline photos on desktop');
  for (const dev of ['desktop', 'tablet', 'mobile']) {
    if (dev !== 'desktop') { await page.click('button[data-device="' + dev + '"]'); await sleep(400); }
    const g = await until(async () => { const x = await gallery(page, dev); return x.every((i) => i.inline && i.loaded) ? x : null; }, dev);
    assert.equal(g.length, 3, dev);
    for (const i of g) {
      assert.deepEqual([i.w, i.h], [800, 600], dev + ': 800 x 600 inline photo');
      assert.equal(i.boxRatio, 1.33, dev + ': the photo fills its 4:3 box (no alt text instead)');
      assert.ok(i.captionBelow && i.badgeInside, dev + ': caption below, label inside the photo: ' + JSON.stringify(i));
      assert.equal(i.badge, 'AI · KI-generiert');
    }
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('the photos are requested only by the Studio page, with the cookie; the sandboxed frame requests none; every Studio file was served signed in', async () => {
  const { page } = await signIn(1440, 900);
  await until(async () => (await gallery(page, 'desktop')).every((g) => g.inline && g.loaded), 'inline photos');
  const photos = photoRequests();
  assert.ok(photos.length >= 3, 'the Studio page loads each photo');
  assert.ok(photos.every((l) => l.signed && l.site === 'same-origin'), 'only same-origin, signed in: ' + JSON.stringify(photos));
  assert.equal(log.filter((l) => !l.signed).length, 0, 'nothing reached the gate without the cookie: ' + JSON.stringify(log.filter((l) => !l.signed)));
  const html = await page.$eval('#st-canvas iframe[data-device="desktop"]', (f) => f.srcdoc);
  assert.ok(!/images\/deals\/starter|res\.cloudinary\.com/.test(html), 'the frame HTML has no photo address at all');
  await page.close();
});

test('the inspector thumbnails (Studio page) show the photos too', async () => {
  const { page } = await signIn(1440, 900);
  await page.click('#st-tab-sections');
  await page.click('#st-outline [data-id="' + G + '"]');
  await page.click('#st-fields .st-item[data-index="0"] .st-item__toggle');
  await until(() => page.$eval('#st-fields [data-path="data.images[0].image"] .st-field__thumb img', (i) => i.complete && i.naturalWidth > 0), 'thumbnail');
  await page.close();
});

test('if the photos cannot be loaded: a neutral placeholder in the frame, no broken image, no label, no error', async () => {
  refusePhotos = true;
  try {
    const { page, errors } = await signIn(1440, 900);
    await sleep(1500);
    const g = await gallery(page, 'desktop');
    assert.equal(g.length, 3);
    for (const i of g) {
      assert.ok(i.placeholder && !i.inline, 'placeholder: ' + JSON.stringify(i));
      assert.ok(i.loaded, 'the placeholder draws (no broken image)');
      assert.equal(i.boxRatio, 1.33);
      assert.equal(i.badge, null, 'no AI label on a placeholder');
      assert.ok(i.captionBelow);
    }
    assert.deepEqual(errors, [], 'no page error');
    await page.close();
  } finally { refusePhotos = false; }
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://localhost:' + server.address().port;
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
