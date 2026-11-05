// ============================================================
// studioDemoImages.browser.test.js — Landing Page Studio V3, Phase T1a:
// the starter templates' photos in a real browser (LOCAL ONLY: needs Chrome
// and puppeteer-core; prints SKIP and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. The page loads core.js,
// onboarding-templates.js and studio-demo-images.js and, as the onboarding
// will, prepares one template's photos from the local files (the real
// canvas loader), renders the template with core.js and shows it in a frame
// sandboxed with "allow-scripts" only. Checked for each of the six
// templates at 390 px: only that template's photos are loaded, each once;
// in the frame every photo is inline (no request from the frame except the
// fonts), with the AI label, in its own proportions (4:3 -> 800 x 600,
// 4:5 -> 800 x 1000) and shown undistorted; before loading, placeholders of
// the same proportions. The demo's prepare() still makes its three 800 x 600
// copies.
// Run: node tests/studioDemoImages.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioDemoImages.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(PUB, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const FONT = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let browser, base;

async function open() {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const requests = [], errors = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (/^https?:/.test(u)) requests.push({ url: u, frame: r.frame() === page.mainFrame() ? 'page' : 'frame' });
    if (FONT.test(u)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (u.startsWith(base) || u.startsWith('data:') || u === 'about:blank') return r.continue();
    r.abort();
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/robots.txt');
  for (const s of ['js/lpV3/core.js', 'js/studio/onboarding-templates.js', 'js/studio/studio-demo-images.js']) await page.addScriptTag({ url: base + '/' + s });
  return { page, requests, errors };
}
// prepare a template's photos with the real loader (or none), render it, show it in a sandboxed frame
async function show(page, id, { prepare = true, lang = 'en' } = {}) {
  await page.evaluate(async (id, prepare, lang) => {
    const D = window.QraivyStudioDemoImages, T = window.QraivyOnboardingTemplates, V3 = window.QraivyV3;
    if (prepare) await new Promise((resolve) => { if (!D.prepareImages(D.templateUrls(T.get(id).images), resolve)) resolve(); });
    const html = D.localizeHtml(V3.renderDesign(T.sample(V3, id, { lang }).design, { businessName: 'x' }, { preview: true }).html);
    document.body.innerHTML = '';
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.style.cssText = 'width:390px;height:2400px;border:0';
    await new Promise((resolve) => { f.onload = resolve; f.srcdoc = html; document.body.appendChild(f); });
  }, id, prepare, lang);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  // lazy photos below the test page's own viewport: loaded now (they are inline, nothing is requested)
  await frame.evaluate(() => document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; }));
  await frame.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), { timeout: 10000 });
  return frame;
}
const photosIn = (frame) => frame.evaluate(() => [...document.images].map((i) => {
  const r = i.getBoundingClientRect(), prev = i.previousElementSibling;
  return { src: i.getAttribute('src').slice(0, 30), nw: i.naturalWidth, nh: i.naturalHeight, w: r.width, h: r.height, fit: getComputedStyle(i).objectFit,
    hero: !!i.closest('.v3-hero'), split: !!i.closest('.v3-v-split'), label: !!(prev && prev.classList.contains('st-ai')), placeholder: i.hasAttribute('data-st-placeholder') };
}));

T.TEMPLATE_IDS.forEach((id) => {
  test(id + ': only its photos are loaded (once, from the local files); in the sandboxed frame inline, labelled, in their own proportions and undistorted; nothing requested from the frame', async () => {
    const { page, requests, errors } = await open();
    const frame = await show(page, id);
    const expected = T.get(id).images.map((sid) => (/^QRAIVY-/.test(sid) ? '/images/studio/starter/' : '/images/deals/starter/') + sid + '.jpg').sort();
    const loaded = requests.filter((r) => /\/images\//.test(r.url)).map((r) => r.url.replace(base, ''));
    assert.deepEqual(loaded.slice().sort(), expected, 'only this template\'s photos, each once');
    assert.ok(requests.filter((r) => r.frame === 'frame').every((r) => FONT.test(r.url)), 'the frame requests nothing but the fonts: ' + JSON.stringify(requests.filter((r) => r.frame === 'frame')));
    const photos = await photosIn(frame);
    assert.ok(photos.length >= 1, id + ' has photos');
    for (const p of photos) {
      assert.ok(p.src.startsWith('data:image/jpeg;base64,') && !p.placeholder, id + ': inline photo');
      assert.ok(p.label, id + ': with the AI label');
      const portrait = /QRAIVY-/.test(T.get(id).images.join());
      if (p.hero && portrait) assert.deepEqual([p.nw, p.nh], [800, 1000], id + ': the 4:5 hero at 800 x 1000');
      else assert.deepEqual([p.nw, p.nh], [800, 600], id + ': a 4:3 photo at 800 x 600');
      // shown undistorted: the box keeps the photo's proportions, or object-fit: cover crops instead of stretching
      if (p.fit !== 'cover') assert.ok(Math.abs(p.w / p.h - p.nw / p.nh) < 0.01, id + ': not stretched ' + JSON.stringify(p));
    }
    if (['creator', 'services'].includes(id)) {
      const hero = photos.find((p) => p.hero);
      assert.ok(hero.split && Math.abs(hero.w / hero.h - 0.8) < 0.01, id + ': the split hero shows the whole 4:5 portrait ' + JSON.stringify(hero));
    }
    assert.deepEqual(errors, []);
    await page.close();
  });
});

test('before loading: each photo is a placeholder of its own proportions (the 4:5 heroes 800 x 1000), no label, no request', async () => {
  const { page, requests } = await open();
  for (const id of ['services', 'beauty']) {
    const frame = await show(page, id, { prepare: false });
    const photos = await photosIn(frame);
    assert.ok(photos.length && photos.every((p) => p.placeholder && !p.label && p.src.startsWith('data:image/svg+xml,')), id);
    for (const p of photos) assert.deepEqual([p.nw, p.nh], p.hero && id === 'services' ? [800, 1000] : [800, 600], id + ' placeholder proportions');
  }
  assert.deepEqual(requests.filter((r) => /\/images\//.test(r.url)), [], 'no photo loaded');
  await page.close();
});

test('the demo\'s prepare() is unchanged: its three bakery photos, 800 x 600, labelled; then a template that shares them loads nothing again', async () => {
  const { page, requests } = await open();
  await page.evaluate(() => new Promise((resolve) => window.QraivyStudioDemoImages.prepare(resolve)));
  assert.deepEqual(requests.filter((r) => /\/images\//.test(r.url)).map((r) => r.url.replace(base, '')).sort(),
    ['/images/deals/starter/bakery-bread-01.jpg', '/images/deals/starter/bakery-coffee-01.jpg', '/images/deals/starter/bakery-croissants-01.jpg']);
  const frame = await show(page, 'bakery');
  assert.equal(requests.filter((r) => /\/images\//.test(r.url)).length, 3, 'the Bakery template reuses the three');
  const photos = await photosIn(frame);
  assert.ok(photos.every((p) => p.label && p.nw === 800 && p.nh === 600));
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
