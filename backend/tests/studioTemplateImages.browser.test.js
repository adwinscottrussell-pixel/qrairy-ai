// ============================================================
// studioTemplateImages.browser.test.js — Landing Page Studio V3: a template
// draft's starter photos in the Studio preview (the Hero placeholder bug found
// in the hosted walkthrough). In headless Chrome against the REAL routes
// (helpers/studioPagesServer.js, in-memory database). LOCAL ONLY: needs Chrome
// and puppeteer-core (prints SKIP and passes when missing).
//
// The sandboxed preview frames cannot load the Studio's own files, so the
// Studio page prepares inline copies of the known starter photos
// (studio-demo-images.js). Checked:
// - an onboarding draft of each of the six templates: its Hero shows the inline
//   photo with the AI label (never the grey placeholder); the inspector keeps
//   the local copy; the stored design is unchanged and nothing is saved;
// - switching between drafts of different templates: each shows its own photo;
//   each photo is loaded once per visit; no redraw loop;
// - an image address the Studio does not know stays exactly as it is.
// Screenshots: set OB_SHOTS=<folder>.
// Run: node tests/studioTemplateImages.browser.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioTemplateImages.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const V3 = require('../src/lpV3/core');
const OB = require('../../frontend/public/js/studio/onboarding-shell.js');
const M = require('../../frontend/public/js/studio/onboarding-model.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');
const DEMO_IMAGES = require('../../frontend/public/js/studio/studio-demo-images.js');
const { buildUpload } = require('../staging/studio-preview-export');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const UPLOAD = buildUpload({
  list: (dir) => fs.readdirSync(path.join(PUB, dir), { recursive: true }).map((f) => dir + String(f).replace(/\\/g, '/')).filter((f) => fs.statSync(path.join(PUB, f)).isFile()),
  read: (name) => fs.readFileSync(path.join(PUB, name)),
});
const HOST = 'qraivy-studio-v3-staging.vercel.app', APIHOST = 'studio-v3-api-production.up.railway.app';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };
const SHOTS = process.env.OB_SHOTS || '';
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, srv;
const pageErrors = [];

async function open(file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', 'en'); localStorage.setItem('qraivy.studio.theme', 'light'); } catch (e) {}
    window.Clerk = { loaded: true, load: async () => {}, user: { id: 'user_carl', primaryEmailAddress: { verification: { status: 'verified' } } }, session: { id: 's', getToken: async () => 'tok_carl' }, addListener: () => {}, openSignIn: () => {}, signOut: async () => {} };
    // how often the preview frames are replaced (each preview update replaces them: studio-preview.js reload())
    window.__frameSwaps = 0;
    new MutationObserver((recs) => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeName === 'IFRAME' || (n.querySelector && n.querySelector('iframe'))) window.__frameSwaps++; }).observe(document, { childList: true, subtree: true });
  });
  const log = { errors: [], local: [], puts: [], outside: [] };
  page.on('pageerror', (e) => { log.errors.push(e.message); pageErrors.push(e.message); });
  page.on('dialog', (d) => d.dismiss());
  await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:') return r.continue();
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (u.host === HOST) {
      const n = decodeURIComponent(u.pathname).replace(/^\//, '');
      if (/^images\//.test(n)) log.local.push(n);
      return UPLOAD.has(n) ? r.respond({ status: 200, contentType: TYPES[path.extname(n)] || 'application/octet-stream', body: UPLOAD.get(n) }) : r.respond({ status: 404, body: '' });
    }
    if (u.host === APIHOST) {
      const cors = { 'access-control-allow-origin': 'https://' + HOST, 'access-control-allow-headers': 'authorization,accept,content-type', 'access-control-allow-methods': 'GET,POST,PUT' };
      if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors, body: '' });
      if (r.method() === 'PUT') log.puts.push(u.pathname);
      const h = { Authorization: r.headers().authorization || '' };
      if (r.postData()) h['Content-Type'] = 'application/json';
      const res = await fetch(srv.origin + u.pathname, { method: r.method(), headers: h, body: r.postData() || undefined });
      return r.respond({ status: res.status, contentType: 'application/json', headers: cors, body: await res.text() }).catch(() => {});
    }
    log.outside.push(u.host + u.pathname);
    return r.abort();
  });
  await page.goto('https://' + HOST + '/' + file, { waitUntil: 'networkidle0' });
  await until(async () => (await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))) === 'loaded', 'page loaded');
  return { page, log };
}
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
async function shot(page, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); } }
async function draftOf(tpl) {
  const r = OB.draftRequest(M, V3, T, { template: tpl, palette: T.get(tpl).palettes[0].id, name: 'Template ' + tpl, description: '', links: [], social: 'auto', sections: null }, 'en');
  const res = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ requestId: require('crypto').randomUUID() }, r)) }).then((x) => x.json());
  const hero = r.design.pages[0].sections.find((s) => s.type === 'hero');
  return { slug: res.page.slug, heroUrl: hero.data.backgroundImage };
}
const rowOf = (slug) => S.db.pages.find((p) => p.slug === slug);
const designOf = (slug) => S.db.pageDesigns.find((d) => d.landingPageId === rowOf(slug).id);
// the preview's Hero image: how it is shown, and whether the AI label sits right before it
const heroInPreview = (page) => page.evaluate(() => {
  const f = document.querySelector('#st-canvas iframe');
  const doc = new DOMParser().parseFromString(f.srcdoc, 'text/html');
  const img = doc.querySelector('.v3-hero img, section.v3-hero img');
  if (!img) return { kind: 'none' };
  const src = img.getAttribute('src') || '';
  const prev = img.previousElementSibling;
  return { kind: src.startsWith('data:image/jpeg') ? 'inline' : img.hasAttribute('data-st-placeholder') ? 'placeholder' : 'address', src: src.startsWith('data:') ? src.slice(0, 22) : src, label: !!(prev && prev.classList.contains('st-ai')) };
});

test('each of the six templates: the Hero in the Studio preview is the inline photo with the AI label (never the grey placeholder); inspector keeps the local copy; stored design unchanged, nothing saved', async () => {
  for (const tpl of ['restaurant', 'bakery', 'beauty', 'retail', 'creator', 'services']) {
    S.resetDrafts();
    const d = await draftOf(tpl);
    assert.ok(DEMO_IMAGES.localSrc(d.heroUrl), tpl + ': the template Hero is a known starter photo');
    const before = S.copy(designOf(d.slug));
    const { page, log } = await open('studio.html?slug=' + d.slug);
    const h = await until(async () => { const x = await heroInPreview(page); return x.kind === 'inline' ? x : null; }, tpl + ': inline Hero photo');
    assert.equal(h.label, true, tpl + ': AI label before the photo');
    const thumb = await page.$eval('#st-fields [data-path="data.backgroundImage"] img', (i) => i.getAttribute('src')).catch(() => null);
    assert.equal(thumb, DEMO_IMAGES.localSrc(d.heroUrl), tpl + ': the inspector thumbnail (unchanged)');
    assert.equal((await page.evaluate(() => window.QraivyStudio.editor.draft().pages[0].sections[0].data.backgroundImage)), d.heroUrl, tpl + ': the design keeps the real address');
    assert.equal(JSON.stringify(designOf(d.slug)), JSON.stringify(before), tpl + ': stored design, revision and origin unchanged');
    assert.deepEqual([log.puts, log.errors], [[], []], tpl + ': nothing saved, no script error');
    if (tpl === 'beauty') await shot(page, 'after-beauty-hero.png');
    await page.close();
  }
});

test('switching between drafts of different templates: each shows its own photo; each photo is loaded once per visit; the preview settles (no redraw loop)', async () => {
  S.resetDrafts();
  const beauty = await draftOf('beauty');
  const restaurant = await draftOf('restaurant');
  const { page, log } = await open('studio.html?slug=' + beauty.slug);
  await until(async () => (await heroInPreview(page)).kind === 'inline', 'beauty inline');
  const go = async (slug) => {
    await page.select('#st-page-select', slug);
    await until(async () => (await page.$eval('#st-page-select', (s) => s.value)) === slug && (await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))) === 'loaded', 'open ' + slug);
  };
  await go(restaurant.slug);
  await until(async () => (await heroInPreview(page)).kind === 'inline', 'restaurant inline');
  assert.ok(await page.evaluate((u) => window.QraivyStudio.editor.draft().pages[0].sections[0].data.backgroundImage === u, restaurant.heroUrl), 'restaurant draft open');
  await go(beauty.slug);
  // back: ready at once (already prepared)
  assert.equal((await heroInPreview(page)).kind, 'inline', 'beauty again, without waiting');
  const local = (id) => log.local.filter((n) => n.endsWith('/' + id + '.jpg')).length;
  assert.equal(local('beauty-salon-01'), 1, 'the Beauty photo loaded once');
  assert.equal(local('restaurant-table-01'), 1, 'the Restaurant photo loaded once');
  // settled: no further preview updates without a change
  const swaps = await page.evaluate(() => window.__frameSwaps);
  const html = await page.$eval('#st-canvas iframe', (f) => f.srcdoc);
  await sleep(1500);
  assert.equal(await page.evaluate(() => window.__frameSwaps), swaps, 'no redraw loop');
  assert.equal(await page.$eval('#st-canvas iframe', (f) => f.srcdoc), html);
  assert.deepEqual([log.puts, log.errors], [[], []]);
  await page.close();
});

test('an image address the Studio does not know (a customer\'s own Cloudinary photo) stays exactly as it is: no placeholder, no inline copy, not loaded by the Studio page', async () => {
  S.resetDrafts();
  const d = await draftOf('beauty');
  const own = 'https://res.cloudinary.com/dwqc6n7rn/image/upload/v1700000000/customer/own-photo.jpg';
  const design = S.copy(designOf(d.slug).draft);
  design.pages[0].sections[0].data.backgroundImage = own;
  const put = await fetch(srv.origin + '/studio/pages/' + d.slug + '/design', { method: 'PUT', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify({ design, baseRevision: 1 }) });
  assert.equal(put.status, 200, 'a valid address of the account');
  const { page, log } = await open('studio.html?slug=' + d.slug);
  await sleep(1200);
  const h = await heroInPreview(page);
  assert.deepEqual([h.kind, h.src, h.label], ['address', own, false], 'untouched: ' + JSON.stringify(h));
  assert.ok(!log.local.some((n) => /own-photo/.test(n)), 'the Studio page does not load it');
  assert.equal(designOf(d.slug).draftRevision, 2);
  assert.deepEqual(log.errors, []);
  await page.close();
});

(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';   // the template photos' account; the helper sets test-cloud
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioTemplateImages.browser');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e && e.message).split('\n').slice(0, 12).join('\n       ')); }
  }
  await browser.close();
  S.resetDrafts();
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (pageErrors.length) { failed++; console.error('  FAIL script errors on the pages: ' + [...new Set(pageErrors)].join(' | ')); }
  if (failed) process.exitCode = 1;
})();
