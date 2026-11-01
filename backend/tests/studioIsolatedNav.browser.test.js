// ============================================================
// studioIsolatedNav.browser.test.js — the Studio V3 staging address
// (studio-routing.js isolated) serves the Studio files only: the Studio
// removes its links to the other Admin pages there, so nothing leads to a
// 404 (LOCAL ONLY: needs Chrome and puppeteer-core; prints SKIP and passes
// when they are missing).
//
// The page is served from exactly the Studio-files-only upload
// (backend/staging/studio-preview-export.js, built here from the working
// tree) on intercepted addresses; the API is answered locally, a stand-in
// Clerk session makes the Studio ask for the owner's pages. Checked:
// - https://qraivy-studio-v3-staging.vercel.app, an owner with no page:
//   "No landing page yet" without "Go to dashboard", no Back to Dashboard,
//   no sidebar link, no Deal Builder link; every link left on the page is
//   in the upload; Sign Out signs out and stays on the Studio (no
//   login.html); German too;
// - the other addresses keep every link exactly as before: the connected
//   preview studio-preview.qraivy.com ("Go to dashboard" for an owner with
//   no page, the Deal Builder link) and the demo preview.
// Run: node tests/studioIsolatedNav.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioIsolatedNav.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const { buildUpload } = require('../staging/studio-preview-export');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const UPLOAD = buildUpload({
  list: (dir) => fs.readdirSync(path.join(PUB, dir), { recursive: true }).map((f) => dir + String(f).replace(/\\/g, '/')).filter((f) => fs.statSync(path.join(PUB, f)).isFile()),
  read: (name) => fs.readFileSync(path.join(PUB, name)),
});
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };
const V3 = 'qraivy-studio-v3-staging.vercel.app';
const V3_API = 'studio-v3-api-production.up.railway.app';
const CONNECTED = 'studio-preview.qraivy.com';
const CONNECTED_API = 'qraivy-deals-api-deals-preview.up.railway.app';
const DEMO = 'qraivy-studio-staging.vercel.app';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// studio.html: the Admin sidebar's page links
const SIDEBAR_LINKS = (UPLOAD.get('studio.html').toString().match(/<a [^>]*class="sb-item/g) || []).length;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;

// The Studio on `host` (the upload; 404 for anything not in it), the API
// answered locally: no pages for this owner, deals not signed in.
async function openAt(host, { lang = 'en' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((l) => {
    try { localStorage.setItem('qraivy_lang', l); localStorage.setItem('qraivy.studio.theme', 'light'); localStorage.removeItem('qraivy.studio.panels'); } catch (e) {}
    window.__signedOut = 0;
    window.Clerk = { loaded: true, load: async () => {}, session: { id: 'sess_x', getToken: async () => 'tok_owner' }, addListener: () => {}, openSignIn: () => {},
      signOut: async () => { window.__signedOut++; } };
  }, lang);
  await page.setRequestInterception(true);
  const missing = [], docs = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:') return r.continue();
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) docs.push(u.host + u.pathname);
    if (u.host === host) {
      const name = decodeURIComponent(u.pathname).replace(/^\//, '');
      if (!UPLOAD.has(name)) { missing.push(name); return r.respond({ status: 404, body: '' }); }
      return r.respond({ status: 200, contentType: TYPES[path.extname(name)] || 'application/octet-stream', body: UPLOAD.get(name) });
    }
    if (u.host === V3_API || u.host === CONNECTED_API) {
      const cors = { 'access-control-allow-origin': 'https://' + host, 'access-control-allow-headers': 'authorization,accept,content-type', 'access-control-allow-methods': 'GET,POST,PUT' };
      if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors, body: '' });
      if (u.pathname === '/studio/pages') return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: '{"pages":[]}' });
      return r.respond({ status: 401, contentType: 'application/json', headers: cors, body: '{"error":"Unauthorized."}' });
    }
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    return r.abort();
  });
  await page.goto('https://' + host + '/studio.html', { waitUntil: 'networkidle0' });
  await sleep(600);
  return { page, missing, docs };
}
// every link on the page (visible or not) and the page bar
const links = (page) => page.evaluate(() => ({
  hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
  sidebar: document.querySelectorAll('#sidebar a.sb-item').length,
  back: !!document.getElementById('st-back'),
  dashboard: !!document.getElementById('st-page-dashboard') && !document.getElementById('st-page-dashboard').hidden,
  status: document.getElementById('st-page-status').textContent,
  title: document.getElementById('st-page-status').title,
  signout: !!document.getElementById('sb-signout'),
}));
async function dealsLink(page) {
  await page.evaluate(() => document.querySelector('.st-outline__item[data-id="s_deals01"]').click());
  await sleep(300);
  return page.evaluate(() => { const a = document.querySelector('#st-fields .st-deals__open'); return a ? a.getAttribute('href') : null; });
}
// a link stays on the page only when its target is in the upload (or on the page itself)
const inUpload = (href) => href.startsWith('#') || UPLOAD.has(href.split(/[?#]/)[0]);

test('Studio V3 staging, owner with no page: no link to a missing page, no "Go to dashboard"', async () => {
  const { page, missing } = await openAt(V3);
  const l = await links(page);
  assert.equal(l.status, 'No landing page yet');
  assert.match(l.title, /no dashboard/, 'the empty-state text does not send the owner to the dashboard');
  assert.equal(l.dashboard, false, '"Go to dashboard" is not shown');
  assert.equal(l.back, false, 'no Back to Dashboard');
  assert.equal(l.sidebar, 0, 'no sidebar link to another Admin page');
  assert.equal(l.signout, true, 'Sign Out stays');
  assert.deepEqual(l.hrefs.filter((h) => !inUpload(h)), [], 'every link left on the page is in the upload');
  assert.equal(await dealsLink(page), null, 'no Deal Builder link (none in that environment)');
  assert.deepEqual(missing, [], 'the Studio asked for nothing outside the upload');
  await page.close();
});

test('Studio V3 staging in German: the same, with the German text', async () => {
  const { page } = await openAt(V3, { lang: 'de' });
  const l = await links(page);
  assert.equal(l.status, 'Noch keine Landingpage');
  assert.match(l.title, /kein Dashboard/);
  assert.equal(l.dashboard, false);
  assert.deepEqual(l.hrefs.filter((h) => !inUpload(h)), []);
  await page.close();
});

test('Studio V3 staging: Sign Out signs out and stays on the Studio (no login.html)', async () => {
  const { page, docs, missing } = await openAt(V3);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#sb-signout')]);
  assert.equal(new URL(page.url()).host + new URL(page.url()).pathname, V3 + '/studio.html');
  assert.ok(!docs.some((d) => /login\.html/.test(d)), 'never login.html');
  assert.ok(!missing.includes('login.html'));
  await page.close();
});

test('the other addresses keep every link: the connected preview and the demo preview', async () => {
  const c = await openAt(CONNECTED);
  const lc = await links(c.page);
  assert.equal(lc.status, 'No landing page yet');
  assert.equal(lc.dashboard, true, 'connected preview: "Go to dashboard" as before');
  assert.match(lc.title, /Create one in the dashboard/);
  assert.equal(lc.back, true);
  assert.equal(lc.sidebar, SIDEBAR_LINKS);
  assert.equal(await dealsLink(c.page), 'https://deals-preview.qraivy.com/deals.html', 'its Deal Builder link as before');
  await c.page.close();
  const d = await openAt(DEMO);
  const ld = await links(d.page);
  assert.equal(ld.back, true);
  assert.equal(ld.sidebar, SIDEBAR_LINKS);
  assert.ok(ld.hrefs.includes('dashboard.html') && ld.hrefs.includes('dashboard.html?section=sqr'), 'demo preview: dashboard links as before');
  await d.page.close();
});

(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioIsolatedNav.browser');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
