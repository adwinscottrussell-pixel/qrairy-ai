// ============================================================
// onboardingStudioHandoff.browser.test.js — Landing Page Studio V3, D2.3a:
// the onboarding -> Studio handoff, end to end in headless Chrome against the
// REAL routes (helpers/studioPagesServer.js: POST /studio/drafts, GET / PUT
// /studio/pages/:slug/design on an in-memory database, the real owner and
// revision checks). LOCAL ONLY: needs Chrome and puppeteer-core (prints SKIP
// and passes when missing).
//
// The pages are the Studio-files-only upload (staging/studio-preview-export.js)
// on the Studio V3 staging address; its API address is answered by the local
// helper server. Checked:
// - Save Draft -> Open in Studio: the Studio opens that slug at revision 1
//   (Custom Sections with their ids in order, the template's theme); nothing
//   is created; a Studio save is revision 2 with the origin untouched; back:
//   the return screen; a later visit (reload) opens revision 2;
// - two tabs: the Studio saves, then the onboarding's Save changes gets 409 and
//   the Studio's version stays; an expired session (401) changes nothing;
// - a malformed ?slug, another account's slug and signed out: no customer
//   content, nothing sent for it.
// Screenshots: set OB_SHOTS=<folder>.
// Run: node tests/onboardingStudioHandoff.browser.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  onboardingStudioHandoff.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const V3 = require('../src/lpV3/core');
const { buildUpload } = require('../staging/studio-preview-export');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const UPLOAD = buildUpload({
  list: (dir) => fs.readdirSync(path.join(PUB, dir), { recursive: true }).map((f) => dir + String(f).replace(/\\/g, '/')).filter((f) => fs.statSync(path.join(PUB, f)).isFile()),
  read: (name) => fs.readFileSync(path.join(PUB, name)),
});
const HOST = 'qraivy-studio-v3-staging.vercel.app', APIHOST = 'studio-v3-api-production.up.railway.app';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };
const SHOTS = process.env.OB_SHOTS || '';
const DESKTOP = { width: 1440, height: 900 };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, srv;
const pageErrors = [];

// a tab signed in with `token` (the stand-in Clerk; the helper server maps tokens to accounts: tok_carl, tok_ben, ...);
// window.__setToken(t) changes what the session hands out (an expired session: a token the server refuses)
async function open(file, { token = 'tok_carl', lang = 'en', viewport = DESKTOP } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((tok, l) => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', l); localStorage.setItem('qraivy.studio.theme', 'light'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {}
    let current = tok;
    try { current = sessionStorage.getItem('__tok') || tok; } catch (e) {}
    window.__setToken = (t) => { current = t; try { sessionStorage.setItem('__tok', t); } catch (e) {} };
    const listeners = [];
    if (tok === null) { window.Clerk = { loaded: true, load: async () => {}, user: null, session: null, addListener: (fn) => listeners.push(fn), openSignIn: () => {}, signOut: async () => {} }; return; }
    const user = { id: 'user_' + tok.slice(4), primaryEmailAddress: { verification: { status: 'verified' } }, reload: async () => {} };
    window.Clerk = { loaded: true, load: async () => {}, user, session: { id: 'sess_' + tok, getToken: async () => current }, addListener: (fn) => listeners.push(fn), openSignIn: () => {}, openSignUp: () => {}, signOut: async () => {} };
  }, token, lang);
  const log = { errors: [], blocked: [], dialogs: [] };
  page.on('pageerror', (e) => { log.errors.push(e.message); pageErrors.push(e.message); });
  page.on('dialog', (d) => { log.dialogs.push(d.message()); d.dismiss(); });
  await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:') return r.continue();
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (u.host === HOST) {
      const n = decodeURIComponent(u.pathname).replace(/^\//, '');
      return UPLOAD.has(n) ? r.respond({ status: 200, contentType: TYPES[path.extname(n)] || 'application/octet-stream', body: UPLOAD.get(n) }) : r.respond({ status: 404, body: '' });
    }
    if (u.host === APIHOST) {
      const cors = { 'access-control-allow-origin': 'https://' + HOST, 'access-control-allow-headers': 'authorization,accept,content-type', 'access-control-allow-methods': 'GET,POST,PUT' };
      if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors, body: '' });
      const h = { Authorization: r.headers().authorization || '' };
      if (r.postData()) h['Content-Type'] = 'application/json';
      const res = await fetch(srv.origin + u.pathname, { method: r.method(), headers: h, body: r.postData() || undefined });
      return r.respond({ status: res.status, contentType: 'application/json', headers: cors, body: await res.text() }).catch(() => {});
    }
    log.blocked.push(r.method() + ' ' + u.host + u.pathname);
    return r.abort();
  });
  const before = S.apiLog.length;
  await page.goto('https://' + HOST + '/' + file, { waitUntil: 'networkidle0' });
  await sleep(300);
  return { page, log, api: () => S.apiLog.slice(before).map((c) => c.method + ' ' + c.path) };
}
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
async function shot(page, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); } }
const studioState = (page) => page.evaluate(() => {
  const ed = window.QraivyStudio && window.QraivyStudio.editor;
  const d = ed ? ed.draft() : null;
  return { status: document.getElementById('st-page-status').getAttribute('data-state'), selected: document.getElementById('st-page-select').value, url: location.pathname + location.search,
    ids: d ? d.pages[0].sections.map((s) => s.id) : [], brand: d ? d.theme.palette.brand : null, headline: d ? (d.pages[0].sections[0].data || {}).headline : null,
    sample: !document.getElementById('st-sample').hidden, saveState: document.getElementById('st-save-status').getAttribute('data-state') };
});
// the onboarding up to a saved draft: name, template, Custom Sections, Step 5, Save Draft
async function onboardToSaved(page, { name = 'Café Sonne', template = 'restaurant', customs = 2 } = {}) {
  await page.click('[data-option="scratch"]'); await page.click('#ob-next'); await sleep(150);
  await page.type('#ob-name', name);
  await page.click('#ob-add-link');
  const k = await page.$$eval('#ob-links .ob-link-row', (ns) => ns.map((n) => n.dataset.row));
  await page.type('#ob-link-url-' + k[0], 'instagram.com/cafesonne');
  await page.click('#ob-next'); await sleep(300);
  await page.click('.ob-tpl[data-template="' + template + '"]'); await page.click('#ob-next'); await sleep(300);
  for (let i = 0; i < customs; i++) { await page.click('#ob-more [data-type="custom"] [data-act="add"]'); await sleep(150); }
  const cs = await page.$$eval('#ob-chosen > li', (ns) => ns.map((x) => x.dataset.type).filter((t) => t.startsWith('custom:')));
  if (cs.length > 1) { await page.click('#ob-chosen [data-type="' + cs[1] + '"] [data-act="up"]'); await sleep(150); }
  const order = await page.$$eval('#ob-chosen > li', (ns) => ns.map((x) => x.dataset.type));
  await page.click('#ob-next'); await sleep(400);
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 8000 });
  return order;
}
// the Studio: type into the Hero headline, then Save Draft
async function studioEditAndSave(page, extra) {
  await page.bringToFront();
  if (!(await page.$('#st-fields [data-path="data.headline"] input'))) {
    await page.click('#st-tab-sections');
    const first = await page.$eval('#st-outline [data-id]', (n) => n.getAttribute('data-id'));
    await page.click('#st-outline [data-id="' + first + '"]');
    await page.click('[data-insp="content"]');
  }
  await page.click('#st-fields [data-path="data.headline"] input');
  await page.keyboard.press('End');
  await page.keyboard.type(extra);
  await until(() => page.$eval('#st-save-btn', (b) => !b.disabled), 'Save Draft enabled');
  await page.click('#st-save-btn');
  await until(async () => (await studioState(page)).saveState === 'saved', 'Studio saved');
}
const rowOf = (slug) => S.db.pages.find((p) => p.slug === slug);
const designOf = (slug) => S.db.pageDesigns.find((d) => d.landingPageId === rowOf(slug).id);
// ONE browser Back from the Studio: the preview updates add no history entries (studio-preview.js reload())
async function goBackToOnboarding(page) {
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 40 && !page.url().includes('/studio-onboarding.html'); i++) await sleep(50);
  assert.ok(page.url().includes('/studio-onboarding.html'), 'one Back: on the onboarding again (' + page.url() + ')');
  await page.waitForFunction(() => !document.getElementById('ob-done').hidden || !document.getElementById('ob-wizard').hidden, { timeout: 5000 });
}

test('Save Draft -> Open in Studio: the Studio opens THAT draft at revision 1 (Custom Sections and theme as saved, nothing created); a Studio save is revision 2 on the same draft, origin untouched; back: the return screen; a later visit opens revision 2', async () => {
  S.resetDrafts();
  const pagesBefore = S.db.pages.length;
  const { page, api, log } = await open('studio-onboarding.html');
  const order = await onboardToSaved(page);
  const slug = (await page.evaluate(() => { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k.startsWith('qraivy.onboarding.v1:')) return JSON.parse(sessionStorage.getItem(k)).draft.slug; } return null; }));
  assert.ok(rowOf(slug) && rowOf(slug).userId === S.CARL && rowOf(slug).status === 'draft', 'the draft exists, Carl\'s, unpublished');
  assert.equal(S.db.pages.length, pagesBefore + 1);
  const origin = S.copy(designOf(slug).origin);
  const savedDesign = S.copy(designOf(slug).draft);
  await shot(page, '01-onboarding-saved-open-in-studio.png');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-finish')]);
  assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, '/studio.html?slug=' + slug);
  const st = await until(async () => { const s = await studioState(page); return s.status === 'loaded' ? s : null; }, 'the Studio loaded the draft');
  assert.equal(st.selected, slug, 'the page selector shows the draft');
  assert.deepEqual(st.ids, savedDesign.pages[0].sections.map((s) => s.id), 'the saved sections, in order');
  assert.deepEqual(st.ids.filter((id) => id.startsWith('s_c')), order.filter((t) => t.startsWith('custom:')).map((t) => 's_c' + t.slice(7)), 'Custom Sections with their ids');
  assert.equal(st.brand, savedDesign.theme.palette.brand, 'the template styling');
  await shot(page, '02-studio-opened-draft-rev1.png');
  // only reads so far: one POST (the onboarding's), the Studio's list and load
  assert.deepEqual(api().filter((x) => !/^GET /.test(x)), ['POST /studio/drafts'], 'nothing else created or changed');
  assert.ok(api().includes('GET /studio/pages/' + slug + '/design'));
  // edit in the Studio and save: the same draft, revision 2
  await studioEditAndSave(page, ' – neu');
  assert.deepEqual([designOf(slug).draftRevision, S.db.pages.length], [2, pagesBefore + 1], 'revision 2, no other page');
  assert.equal(designOf(slug).draft.pages[0].sections[0].data.headline, 'Café Sonne – neu');
  assert.deepEqual(designOf(slug).origin, origin, 'the origin untouched by the Studio save');
  assert.deepEqual(api().filter((x) => !/^GET /.test(x)), ['POST /studio/drafts', 'PUT /studio/pages/' + slug + '/design']);
  await shot(page, '03-studio-saved-rev2.png');
  // back: the onboarding's return screen (never the steps, never a second draft)
  await goBackToOnboarding(page);
  assert.equal(await page.$eval('#ob-done', (n) => !n.hidden), true, 'return screen');
  await shot(page, '04-onboarding-return-screen.png');
  // a later visit: studio.html?slug= opens revision 2
  const later = await open('studio.html?slug=' + encodeURIComponent(slug));
  const st2 = await until(async () => { const s = await studioState(later.page); return s.status === 'loaded' ? s : null; }, 'reopened');
  assert.equal(st2.headline, 'Café Sonne – neu', 'the latest saved version');
  assert.deepEqual(later.api().filter((x) => !/^GET /.test(x)), [], 'reopening sends no write');
  assert.deepEqual([log.errors, log.blocked, later.log.errors, later.log.blocked], [[], [], [], []]);
  assert.equal(S.db.pages.filter((p) => p.userId === S.CARL && p.status === 'draft').length, 1, 'one draft only');
  await later.page.close();
  await page.close();
});

test('history: the Studio\'s preview updates (typing, a section selected, the device switched, a save) add no browser-history entry; the preview still shows the latest edit; ONE browser Back returns to the onboarding', async () => {
  S.resetDrafts();
  const { page, log } = await open('studio-onboarding.html');
  await onboardToSaved(page, { name: 'Café Mond', template: 'bakery', customs: 1 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-finish')]);
  await until(async () => (await studioState(page)).status === 'loaded', 'Studio loaded');
  await sleep(800);
  const atLoad = await page.evaluate(() => history.length);
  // several preview updates: typing (each pause reloads the preview), a save, another section, the device buttons
  for (const t of [' A', ' B', ' C']) {
    await studioEditAndSave(page, t);
    await sleep(700);
  }
  const ids = (await studioState(page)).ids;
  await page.click('#st-outline [data-id="' + ids[2] + '"]'); await sleep(300);
  for (const d of ['desktop', 'mobile']) {
    const b = await page.$('button[data-device="' + d + '"]');
    if (b && await b.evaluate((n) => !!n.offsetParent)) { await b.click(); await sleep(500); }
  }
  assert.equal(await page.evaluate(() => history.length), atLoad, 'no history entry added by the preview');
  // the preview frame(s) hold the latest page: the newest headline, the sandbox unchanged, one frame per device
  const frames = await page.$$eval('#st-canvas iframe', (fs) => fs.map((f) => ({ sandbox: f.getAttribute('sandbox'), device: f.getAttribute('data-device'), latest: f.srcdoc.includes('Café Mond A B C') })));
  assert.ok(frames.length >= 1 && frames.every((f) => f.sandbox === 'allow-scripts' && f.latest), JSON.stringify(frames));
  assert.equal(new Set(frames.map((f) => f.device)).size, frames.length, 'one frame per device (no left-over copies)');
  assert.equal(designOf(rowOf(S.db.pages.find((p) => p.userId === S.CARL && p.status === 'draft').slug).slug).draftRevision, 4, 'three saves on the same draft');
  // one Back: the onboarding's return screen
  await goBackToOnboarding(page);
  assert.equal(await page.$eval('#ob-done', (n) => !n.hidden), true);
  assert.deepEqual([log.errors, log.blocked], [[], []]);
  await page.close();
});

test('two tabs: the Studio saves a newer version; the onboarding\'s Save changes gets 409 and overwrites nothing; an expired session (401) changes nothing either', async () => {
  S.resetDrafts();
  const a = await open('studio-onboarding.html');
  await onboardToSaved(a.page, { name: 'Salon Sonne', template: 'beauty', customs: 1 });
  const slug = rowOf(S.db.pages.find((p) => p.userId === S.CARL && p.status === 'draft').slug).slug;
  // tab B: the Studio on the same draft, saves revision 2
  const b = await open('studio.html?slug=' + slug);
  await until(async () => (await studioState(b.page)).status === 'loaded', 'tab B loaded');
  await studioEditAndSave(b.page, ' Studio');
  const studioVersion = S.copy(designOf(slug).draft);
  assert.equal(designOf(slug).draftRevision, 2);
  // tab A: a change after saving, an expired session first
  await a.page.bringToFront();
  await a.page.click('#ob-back'); await sleep(200);
  await a.page.click('#ob-chosen [data-type="contact"] [data-act="up"]'); await sleep(150);
  await a.page.click('#ob-next'); await sleep(400);
  const mark = S.apiLog.length;   // from here: tab A's attempts only
  await a.page.evaluate(() => window.__setToken('tok_expired'));
  await a.page.click('#ob-finish');
  await a.page.waitForFunction(() => document.getElementById('ob-save-note').getAttribute('data-tone') === 'error', { timeout: 8000 });
  assert.equal(await a.page.$eval('#ob-save-note', (n) => n.textContent), 'Your sign-in has expired. Please sign in again – your answers are kept.');
  assert.deepEqual([designOf(slug).draftRevision, designOf(slug).draft], [2, studioVersion], 'nothing changed (401)');
  // signed in again: Save changes with the kept revision 1 -> 409
  await a.page.evaluate(() => window.__setToken('tok_carl'));
  await a.page.click('#ob-finish');
  await a.page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 8000 });
  assert.equal(await a.page.$eval('#ob-save-note', (n) => n.textContent), 'Your draft was changed in the Studio after you saved it here, so nothing was overwritten. Open the Studio to continue with your latest saved draft.');
  assert.deepEqual([designOf(slug).draftRevision, designOf(slug).draft], [2, studioVersion], 'the Studio\'s version kept');
  const puts = S.apiLog.slice(mark).map((c) => c.method + ' ' + c.path).filter((x) => x.startsWith('PUT '));
  assert.deepEqual(puts, ['PUT /studio/pages/' + slug + '/design', 'PUT /studio/pages/' + slug + '/design'], 'the refused (401) and the conflicting (409) attempts only');
  await shot(a.page, '05-onboarding-conflict-409.png');
  // Open in Studio (asks: the changes are left behind) -> the Studio shows its own newer version
  await a.page.click('#ob-finish'); await sleep(200);
  assert.equal(await a.page.$eval('#ob-leave', (d) => d.open), true);
  await shot(a.page, '06-onboarding-leave-question-conflict.png');
  await Promise.all([a.page.waitForNavigation({ waitUntil: 'networkidle0' }), a.page.click('#ob-leave-go')]);
  const st = await until(async () => { const s = await studioState(a.page); return s.status === 'loaded' ? s : null; }, 'Studio');
  assert.equal(st.headline, 'Salon Sonne Studio', 'the newer Studio version');
  assert.equal(S.db.pages.filter((p) => p.userId === S.CARL && p.status === 'draft').length, 1, 'never a second draft');
  await a.page.close(); await b.page.close();
});

test('a malformed ?slug, another account\'s slug and signed out: the Studio shows no customer content and loads nothing for it', async () => {
  S.resetDrafts();
  const a = await open('studio-onboarding.html');
  await onboardToSaved(a.page, { name: 'Carl Geheim', template: 'services', customs: 0 });
  const slug = S.db.pages.find((p) => p.userId === S.CARL && p.status === 'draft').slug;
  await a.page.close();
  // malformed
  for (const bad of ['../x', '%2e%2e%2fx', 'a/b', '<x>']) {
    const m = await open('studio.html?slug=' + bad);
    await until(async () => ['loaded', 'notfound', 'empty', 'error', 'signin'].includes((await studioState(m.page)).status), 'settled');
    // the malformed value is never requested (studio-shell.js requestedSlug: the slug rule); the Studio then opens
    // the owner's most recently changed page as before (Carl's own draft) and writes nothing
    const loads = m.api().filter((x) => x.startsWith('GET /studio/pages/') && x.endsWith('/design'));
    assert.ok(loads.every((x) => x === 'GET /studio/pages/' + slug + '/design'), bad + ': only the owner\'s own page loaded ' + loads.join(', '));
    assert.ok(!m.api().some((x) => /^(PUT|POST|DELETE) /.test(x)), bad + ': nothing written');
    await m.page.close();
  }
  // Ben opens Carl's draft: refused by the server (403), the sample page, no Carl content anywhere
  const ben = await open('studio.html?slug=' + slug, { token: 'tok_ben' });
  await until(async () => ['loaded', 'notfound', 'forbidden'].includes((await studioState(ben.page)).status), 'Ben settled');
  const sb = await studioState(ben.page);
  assert.ok(sb.status !== 'loaded' || sb.selected !== slug, 'not opened for Ben: ' + JSON.stringify(sb));
  assert.equal(sb.sample, true, 'the sample page');
  assert.ok(!(await ben.page.evaluate(() => document.body.innerText + [...document.querySelectorAll('iframe')].map((f) => f.srcdoc).join(''))).includes('Carl Geheim'), 'no Carl content');
  assert.ok(!ben.api().some((x) => /^(PUT|POST|DELETE) /.test(x)));
  await ben.page.close();
  // signed out: no request with a token, the sign-in state
  const out = await open('studio.html?slug=' + slug, { token: null });
  await sleep(800);
  assert.ok(!(await out.page.evaluate(() => document.body.innerText)).includes('Carl Geheim'));
  assert.ok(!out.api().some((x) => x.includes('/design')), 'no draft loaded signed out');
  await out.page.close();
  assert.equal(designOf(slug).draftRevision, 1, 'untouched');
});

(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';   // the template photos' account (production's); the helper sets test-cloud
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('onboardingStudioHandoff.browser');
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
