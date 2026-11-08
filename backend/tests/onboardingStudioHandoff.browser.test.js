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
async function open(file, { token = 'tok_carl', lang = 'en', viewport = DESKTOP, theme = 'light' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((tok, l, th) => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', l); localStorage.setItem('qraivy.studio.theme', th); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {}
    let current = tok;
    try { current = sessionStorage.getItem('__tok') || tok; } catch (e) {}
    window.__setToken = (t) => { current = t; try { sessionStorage.setItem('__tok', t); } catch (e) {} };
    const listeners = [];
    if (tok === null) { window.Clerk = { loaded: true, load: async () => {}, user: null, session: null, addListener: (fn) => listeners.push(fn), openSignIn: () => {}, signOut: async () => {} }; return; }
    const user = { id: 'user_' + tok.slice(4), primaryEmailAddress: { verification: { status: 'verified' } }, reload: async () => {} };
    window.Clerk = { loaded: true, load: async () => {}, user, session: { id: 'sess_' + tok, getToken: async () => current }, addListener: (fn) => listeners.push(fn), openSignIn: () => {}, openSignUp: () => {}, signOut: async () => {} };
    // D2.3b-1: another account (a token) or signed out (null) in this tab, announced as Clerk does
    window.__setSession = (t) => {
      current = t;
      window.Clerk.user = t ? { id: 'user_' + t.slice(4), primaryEmailAddress: { verification: { status: 'verified' } }, reload: async () => {} } : null;
      window.Clerk.session = t ? { id: 'sess_' + t, getToken: async () => current } : null;
      listeners.forEach((fn) => fn({ session: window.Clerk.session, user: window.Clerk.user }));
    };
  }, token, lang, theme);
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
      const cors = { 'access-control-allow-origin': 'https://' + HOST, 'access-control-allow-headers': 'authorization,accept,content-type', 'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE' };   // the cors package's defaults, as the real server (src/index.js)
      if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors, body: '' });
      const h = { Authorization: r.headers().authorization || '' };
      if (r.postData()) h['Content-Type'] = 'application/json';
      const res = await fetch(srv.origin + u.pathname + u.search, { method: r.method(), headers: h, body: r.postData() || undefined });
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

test('E2: the saved draft holds the preview\'s example content (Bakery: buttons, products, hours, contact; no phone, no example profile; Custom Section empty); the Studio opens it as saved, shows it and edits it: a product renamed and saved is revision 2, every other example kept', async () => {
  S.resetDrafts();
  const { page, api, log } = await open('studio-onboarding.html');
  const order = await onboardToSaved(page, { template: 'bakery', customs: 1 });
  const slug = (await page.evaluate(() => { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k.startsWith('qraivy.onboarding.v1:')) return JSON.parse(sessionStorage.getItem(k)).draft.slug; } return null; }));
  const saved = S.copy(designOf(slug).draft);
  const secs = saved.pages[0].sections, by = (t) => secs.find((s) => s.type === t);
  assert.deepEqual(secs.map((s) => s.type), order.map((t) => (t.startsWith('custom:') ? 'text' : t)), 'exactly the chosen sections, in order');
  assert.equal(by('hero').data.headline, 'Café Sonne', 'the customer\'s name');
  assert.ok(by('buttons').data.items.length >= 3 && by('products').data.items.length >= 3 && by('openingHours').data.days.length === 7, 'example buttons, products, hours');
  assert.ok(/^(hello|hallo)@example\.com$/.test(by('contact').data.email) && by('contact').data.address.city, 'the example contact');
  assert.ok(!by('contact').data.phone && !/tel:|wa\.me|mailto:/.test(JSON.stringify(saved)), 'no phone number, no contact link');
  assert.deepEqual(by('socialMedia').data.links, [{ platform: 'instagram', url: 'https://instagram.com/cafesonne' }], 'only the customer\'s link');
  const custom = secs.find((s) => s.id.startsWith('s_c'));
  assert.deepEqual([custom.data.heading, custom.data.body], ['', ''], 'the Custom Section empty');
  assert.equal(designOf(slug).draftRevision, 1);
  // into the Studio: the same content, shown in the preview, editable
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-finish')]);
  await until(async () => (await studioState(page)).status === 'loaded', 'the Studio loaded the draft');
  assert.deepEqual(await page.evaluate(() => window.QraivyStudio.editor.draft()), saved, 'the Studio holds the draft exactly as saved');
  const first = by('products').data.items[0].name, second = by('products').data.items[1].name;
  const frame = await until(() => page.$eval('#st-canvas iframe', (f) => (f.srcdoc.includes('data-v3-id="s_obproducts1"') ? f.srcdoc : null)), 'the preview');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  assert.ok(frame.includes(esc(first)) && frame.includes(esc(by('contact').data.address.line1)), 'the example product and address in the Studio preview');
  await page.click('#st-tab-sections');
  await page.click('#st-outline [data-id="s_obproducts1"]');
  await page.click('[data-insp="content"]');
  const sel = '#st-fields [data-path="data.items[0].name"] input';
  await until(() => page.$('#st-fields .st-item[data-index="0"] .st-item__toggle'), 'the product rows');
  assert.equal(await page.$eval('#st-fields .st-item[data-index="0"] .st-item__name', (n) => n.textContent), first, 'the example product listed');
  if (!(await page.$('#st-fields .st-item[data-index="0"].is-open'))) await page.click('#st-fields .st-item[data-index="0"] .st-item__toggle');
  await until(() => page.$(sel), 'the first product\'s name field');
  assert.equal(await page.$eval(sel, (n) => n.value), first, 'the example product, editable');
  await shot(page, 'e2-studio-example-products.png');
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.type('Sourdough loaf');
  await until(() => page.$eval('#st-save-btn', (b) => !b.disabled), 'Save Draft enabled');
  await page.click('#st-save-btn');
  await until(async () => (await studioState(page)).saveState === 'saved', 'Studio saved');
  const now = designOf(slug).draft, items = now.pages[0].sections.find((s) => s.type === 'products').data.items;
  assert.equal(designOf(slug).draftRevision, 2, 'revision 2');
  assert.deepEqual([items[0].name, items[1].name], ['Sourdough loaf', second], 'the customer\'s edit wins; the other examples kept');
  const rest = S.copy(now); rest.pages[0].sections.find((s) => s.type === 'products').data.items[0].name = first;
  assert.deepEqual(rest, saved, 'nothing else changed');
  assert.deepEqual(api().filter((x) => !/^GET /.test(x)), ['POST /studio/drafts', 'PUT /studio/pages/' + slug + '/design']);
  assert.deepEqual([log.errors, log.blocked], [[], []]);
  await page.close();
});

// the onboarding up to Step 5, nothing saved
async function onboardToStep5(page, { name = 'Café Limit', template = 'bakery' } = {}) {
  await page.click('[data-option="scratch"]'); await page.click('#ob-next'); await sleep(150);
  await page.type('#ob-name', name);
  await page.click('#ob-next'); await sleep(300);
  await page.click('.ob-tpl[data-template="' + template + '"]'); await page.click('#ob-next'); await sleep(300);
  await page.click('#ob-more [data-type="gallery"] [data-act="add"]').catch(() => {}); await sleep(150);
  await page.click('#ob-next'); await sleep(400);
}
const keptAnswers = (page) => page.evaluate(() => { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k.startsWith('qraivy.onboarding.v1:')) return JSON.parse(sessionStorage.getItem(k)).answers; } return null; });
const finishUi = (page) => page.evaluate(() => { const b = document.getElementById('ob-finish'), r = document.getElementById('ob-manage-row');
  return { mode: b.getAttribute('data-mode'), disabled: b.disabled, limit: b.getAttribute('data-limit'), manage: !r.hidden, note: document.getElementById('ob-save-note').textContent }; });

test('draft limit with the real route: 0, 1 and 2 unpublished drafts -> Save Draft saves; 3 -> Save Draft disabled after the server\'s answer, nothing more sent, Manage drafts opens the Studio\'s page list; the answers kept; back with a free slot: Save Draft saves', async () => {
  const LIMIT_EN = 'You already have 3 unpublished drafts, the current maximum. Your answers are kept in this browser tab.';
  const plain = (n) => fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Old draft ' + n, language: 'en' }) }).then((x) => x.json());
  const carlDrafts = () => S.db.pages.filter((p) => p.userId === S.CARL && p.status === 'draft');
  for (const n of [0, 1, 2]) {
    S.resetDrafts();
    for (let i = 0; i < n; i++) await plain(i);
    assert.equal(carlDrafts().length, n, 'fixture ' + n);
    const { page, api } = await open('studio-onboarding.html');
    await onboardToStep5(page);
    const s = await finishUi(page);
    assert.deepEqual([s.mode, s.disabled, s.manage], ['save', false, false], n + ' drafts: Save Draft available');
    await page.click('#ob-finish');
    await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 8000 });
    assert.equal(carlDrafts().length, n + 1, n + ' drafts: saved');
    assert.deepEqual([(await finishUi(page)).manage, api().filter((x) => x === 'POST /studio/drafts').length], [false, 1]);
    await page.close();
  }
  // 3: the server answers draft_limit
  S.resetDrafts();
  for (let i = 0; i < 3; i++) await plain(i);
  const { page, api, log } = await open('studio-onboarding.html');
  await onboardToStep5(page);
  const answers = await keptAnswers(page);
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-limit') === 'true', { timeout: 8000 });
  let s = await finishUi(page);
  assert.deepEqual([s.mode, s.disabled, s.manage, s.note], ['save', true, true, LIMIT_EN], '3 drafts: disabled, Manage drafts');
  assert.equal(carlDrafts().length, 3, 'nothing created');
  await page.$eval('#ob-finish', (b) => b.click()); await sleep(300);
  assert.equal(api().filter((x) => x === 'POST /studio/drafts').length, 1, 'at the limit nothing more is sent');
  assert.deepEqual(await keptAnswers(page), answers, 'the answers kept exactly');
  await shot(page, 'limit-01-onboarding-limit.png');
  // Manage drafts: the Studio, its page list with the three drafts (nothing created or changed)
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-manage')]);
  assert.equal(new URL(page.url()).pathname, '/studio.html');
  await until(async () => (await page.$$eval('#st-page-select option', (o) => o.length)) >= 3 || null, 'the page list');
  const listed = await page.$$eval('#st-page-select option', (o) => o.map((x) => x.value));
  for (const p of carlDrafts()) assert.ok(listed.includes(p.slug), 'listed: ' + p.slug);
  await shot(page, 'limit-02-studio-page-list.png');
  // a draft removed elsewhere (no delete in the Studio yet), then back: the answers and Step 5, Save Draft offered again
  S.db.pages.splice(S.db.pages.indexOf(carlDrafts()[0]), 1);
  await goBackToOnboarding(page);
  await until(async () => (await page.$eval('#ob-progress-count', (n) => n.textContent)) === 'Step 5 of 5' || null, 'back on Step 5');
  assert.deepEqual(await keptAnswers(page), answers, 'the answers kept after Manage drafts and Back');
  s = await finishUi(page);
  assert.deepEqual([s.mode, s.disabled, s.manage], ['save', false, false], 'back in the tab: Save Draft available again');
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 8000 });
  assert.equal(carlDrafts().length, 3, 'saved into the free slot');
  assert.deepEqual(log.errors, []);
  await page.close();
});

// ── Delete draft (Studio): the owner's own unpublished draft, asked first ──
const plainDraft = (n, token = 'tok_carl') => fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Old draft ' + n, language: 'en' }) }).then((x) => x.json());
const draftsOf = (who) => S.db.pages.filter((p) => p.userId === who && p.status === 'draft');
const deleteUi = (page) => page.evaluate(() => {
  const b = document.getElementById('st-delete-draft'), d = document.getElementById('st-delete');
  return { item: !b.hidden, enabled: !b.disabled, open: d.open, title: document.getElementById('st-delete-title').textContent, text: document.getElementById('st-delete-text').textContent,
    name: document.getElementById('st-delete-name').textContent, cancel: document.getElementById('st-delete-cancel').textContent, confirm: document.getElementById('st-delete-confirm').textContent,
    err: document.getElementById('st-delete-err').hidden ? '' : document.getElementById('st-delete-err').textContent, focus: document.activeElement && document.activeElement.id };
});
async function openDeleteDialog(page) {
  await page.click('#st-more-btn');
  await until(() => page.$eval('#st-more-menu', (m) => !m.hidden), 'menu open');
  await page.click('#st-delete-draft');
  await until(async () => (await deleteUi(page)).open || null, 'the dialog');
}
const listed = (page) => page.$$eval('#st-page-select option', (o) => o.map((x) => x.value));

test('Delete draft: shown for the owner\'s open unpublished draft only; asks first (title, text, Cancel focused); Cancel, Escape and a click beside the box delete nothing; Delete draft removes exactly that draft (3 -> 2), the list updates at once, the other drafts and other accounts untouched', async () => {
  S.resetDrafts();
  const made = [];
  for (let i = 0; i < 3; i++) made.push((await plainDraft(i)).page.slug);
  const bens = (await plainDraft('ben', 'tok_ben')).page.slug;
  const keep = JSON.stringify([...draftsOf(S.CARL).filter((p) => p.slug !== made[0]), ...draftsOf(S.BEN)]);
  const { page, api, log } = await open('studio.html?slug=' + made[0]);
  await until(async () => (await studioState(page)).status === 'loaded' || null, 'the draft open');
  let ui = await deleteUi(page);
  assert.deepEqual([ui.item, ui.enabled, ui.open], [true, true, false], 'the menu item, nothing asked yet');
  // Cancel
  await openDeleteDialog(page);
  ui = await deleteUi(page);
  assert.deepEqual([ui.title, ui.text, ui.name, ui.cancel, ui.confirm, ui.focus], ['Delete this draft?', 'This draft will be permanently deleted. This action cannot be undone.', '“Old draft 0”', 'Cancel', 'Delete draft', 'st-delete-cancel']);
  const look = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('st-delete-confirm')), p = getComputedStyle(document.getElementById('st-save-btn')); return { bg: c.backgroundColor, color: c.color, saveBg: p.backgroundColor }; });
  assert.notEqual(look.bg, look.saveBg, 'the destructive button looks unlike the normal actions');
  assert.equal(look.bg, 'rgb(185, 28, 28)', 'red');
  await shot(page, 'delete-01-dialog-en.png');
  await page.click('#st-delete-cancel');
  ui = await deleteUi(page);
  assert.deepEqual([ui.open, ui.focus], [false, 'st-more-btn'], 'Cancel: closed, focus back on the menu button');
  // Escape
  await openDeleteDialog(page);
  await page.keyboard.press('Escape');
  await until(async () => !(await deleteUi(page)).open || null, 'Escape closes');
  // a click beside the box (the backdrop)
  await openDeleteDialog(page);
  await page.mouse.click(5, 5);
  await until(async () => !(await deleteUi(page)).open || null, 'a click beside the box closes');
  assert.equal(api().filter((x) => x.startsWith('DELETE')).length, 0, 'nothing sent while cancelling');
  assert.equal(draftsOf(S.CARL).length, 3, 'nothing deleted');
  // Delete draft
  await openDeleteDialog(page);
  await page.click('#st-delete-confirm');
  await until(async () => !(await deleteUi(page)).open || null, 'closed after deleting');
  assert.deepEqual(api().filter((x) => x.startsWith('DELETE')), ['DELETE /studio/pages/' + made[0]], 'one DELETE, that draft');
  assert.equal(draftsOf(S.CARL).length, 2, '3 -> 2');
  assert.equal(S.db.pages.find((p) => p.slug === made[0]), undefined, 'gone');
  assert.equal(JSON.stringify([...draftsOf(S.CARL), ...draftsOf(S.BEN)]), keep, 'the other drafts and Ben\'s untouched');
  await until(async () => (await studioState(page)).status === 'loaded' || null, 'the next draft opened');
  const now = await listed(page);
  assert.ok(!now.includes(made[0]) && now.includes(made[1]) && now.includes(made[2]) && !now.includes(bens), 'the list without it: ' + JSON.stringify(now));
  assert.notEqual((await studioState(page)).selected, made[0], 'another draft is open');
  await shot(page, 'delete-02-after-en.png');
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('Delete draft never for a live page; a draft saved since in another tab is not deleted (the server says so, nothing changed); the last draft leads to the empty state', async () => {
  S.resetDrafts();
  // Anna's live page: no Delete draft; her unpublished draft: offered
  let p = await open('studio.html?slug=anna-cafe', { token: 'tok_anna' });
  await until(async () => (await studioState(p.page)).status === 'loaded' || null, 'live page open');
  assert.deepEqual([(await deleteUi(p.page)).item], [false], 'a live page: never offered');
  await p.page.close();
  // a stale revision: another tab saved meanwhile
  const slug = (await plainDraft('only')).page.slug;
  p = await open('studio.html?slug=' + slug);
  await until(async () => (await studioState(p.page)).status === 'loaded' || null, 'draft open');
  const d = S.db.pageDesigns.find((x) => x.landingPageId === S.db.pages.find((y) => y.slug === slug).id);
  d.draftRevision = 2;
  await openDeleteDialog(p.page);
  await p.page.click('#st-delete-confirm');
  await until(async () => (await deleteUi(p.page)).err || null, 'the refusal shown');
  let ui = await deleteUi(p.page);
  assert.deepEqual([ui.open, ui.err, ui.focus], [true, 'This draft was changed in another tab or window. Nothing was deleted. Reload it and try again.', 'st-delete-cancel']);
  assert.equal(await p.page.$eval('#st-delete-confirm', (b) => b.disabled), true, 'not offered again for that version');
  assert.ok(S.db.pages.find((y) => y.slug === slug), 'nothing deleted');
  await p.page.click('#st-delete-cancel');
  await p.page.close();
  // reopened (revision 2): deletes; the last draft -> the empty state, no customer page in the editor
  d.draftRevision = 2;
  p = await open('studio.html?slug=' + slug);
  await until(async () => (await studioState(p.page)).status === 'loaded' || null, 'reopened');
  await openDeleteDialog(p.page);
  await p.page.click('#st-delete-confirm');
  await until(async () => (await studioState(p.page)).status === 'empty' || null, 'the empty state');
  assert.deepEqual([(await studioState(p.page)).sample, (await deleteUi(p.page)).item, draftsOf(S.CARL).length], [true, false, 0]);
  assert.deepEqual(p.log.errors, []);
  await p.page.close();
});

test('Delete draft, German and Dark: the texts in formal German, readable, the destructive button red; at 390 px the dialog fits', async () => {
  S.resetDrafts();
  const slug = (await plainDraft('de')).page.slug;
  for (const [viewport, theme] of [[DESKTOP, 'dark'], [{ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'light']]) {
    const { page } = await open('studio.html?slug=' + slug, { lang: 'de', theme, viewport });
    await until(async () => (await studioState(page)).status === 'loaded' || null, 'loaded');
    await openDeleteDialog(page);
    const ui = await deleteUi(page);
    assert.equal(ui.name, '„Old draft de“', 'German quotation marks');
    assert.deepEqual([ui.title, ui.text, ui.cancel, ui.confirm], ['Diesen Entwurf löschen?', 'Dieser Entwurf wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.', 'Abbrechen', 'Entwurf löschen']);
    const m = await page.evaluate(() => {
      const box = (id) => document.getElementById(id).getBoundingClientRect(), r = box('st-delete'), ca = box('st-delete-cancel'), co = box('st-delete-confirm'), c = getComputedStyle(document.getElementById('st-delete-confirm'));
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, bg: c.backgroundColor, color: c.color,
        cancel: [Math.round(ca.top), Math.round(ca.bottom), Math.round(ca.height)], confirm: [Math.round(co.top), Math.round(co.bottom), Math.round(co.height)] };
    });
    assert.ok(m.l >= 0 && m.r <= m.iw && m.t >= 0 && m.b <= m.ih && m.sw <= m.iw, viewport.width + ' fits ' + JSON.stringify(m));
    assert.ok(Math.abs((m.l + m.r) / 2 - m.iw / 2) < 2, viewport.width + ' centred ' + JSON.stringify(m));
    assert.ok(m.cancel[0] >= 0 && m.cancel[1] <= m.ih && m.confirm[1] <= m.ih, viewport.width + ' both buttons on screen ' + JSON.stringify(m));
    if (viewport.width <= 480) assert.ok(m.cancel[1] <= m.confirm[0] && m.cancel[2] >= 44 && m.confirm[2] >= 44, 'phones: Cancel above, 44 px tall ' + JSON.stringify(m));
    assert.equal(m.color, 'rgb(255, 255, 255)');
    assert.ok(['rgb(185, 28, 28)', 'rgb(220, 38, 38)'].includes(m.bg), 'red ' + m.bg);
    await shot(page, 'delete-03-dialog-de-' + viewport.width + '-' + theme + '.png');
    await page.click('#st-delete-cancel');
    await page.close();
  }
  assert.equal(draftsOf(S.CARL).length, 1, 'only cancelled: nothing deleted');
});

test('the whole way: onboarding at the 3-draft limit -> Manage drafts -> the Studio -> Delete draft -> back: the answers kept, Save Draft saves into the freed slot', async () => {
  S.resetDrafts();
  for (let i = 0; i < 3; i++) await plainDraft(i);
  const { page, api } = await open('studio-onboarding.html');
  await onboardToStep5(page);
  const answers = await keptAnswers(page);
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-limit') === 'true', { timeout: 8000 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-manage')]);
  await until(async () => (await studioState(page)).status === 'loaded' || null, 'the Studio with a draft open');
  await openDeleteDialog(page);
  await page.click('#st-delete-confirm');
  await until(async () => draftsOf(S.CARL).length === 2 || null, 'deleted');
  await goBackToOnboarding(page);
  await until(async () => (await page.$eval('#ob-progress-count', (n) => n.textContent)) === 'Step 5 of 5' || null, 'Step 5');
  assert.deepEqual(await keptAnswers(page), answers, 'the answers kept');
  assert.deepEqual([(await finishUi(page)).disabled, (await finishUi(page)).manage], [false, false], 'Save Draft offered again');
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 8000 });
  assert.equal(draftsOf(S.CARL).length, 3, 'saved into the freed slot');
  assert.equal(api().filter((x) => x.startsWith('DELETE')).length, 1);
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

test('D2.3b-1 origin in the Studio: kept for the opened onboarding draft (as stored, read only); null for another page; cleared on page switch, account change and sign-out; never shown as HTML', async () => {
  S.resetDrafts();
  const { page, log } = await open('studio-onboarding.html');
  await onboardToSaved(page, { name: 'Café Herkunft', template: 'creator', customs: 2 });
  const slug = S.db.pages.find((p) => p.userId === S.CARL && p.status === 'draft').slug;
  const stored = S.copy(designOf(slug).origin);
  // a second draft of Carl's without an origin (created directly, no onboarding)
  const plain = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ohne Herkunft' }) }).then((r) => r.json());
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-finish')]);
  await until(async () => (await studioState(page)).status === 'loaded', 'Studio loaded');
  const originNow = () => page.evaluate(() => window.QraivyStudio.origin());
  assert.deepEqual(await originNow(), stored, 'the stored origin, kept for the open page');
  assert.equal(stored.source, 'onboarding');
  // never rendered: no origin value appears in the Studio's text or HTML
  const html = await page.evaluate(() => document.body.innerHTML);
  assert.ok(!html.includes('exampleSectionIds') && !html.includes('"source"'), 'not rendered');
  // the page selector: the plain draft -> null; back -> the origin again
  await page.select('#st-page-select', plain.page.slug);
  await until(async () => { const s = await studioState(page); return s.status === 'loaded' && s.selected === plain.page.slug; }, 'plain draft open');
  assert.equal(await originNow(), null, 'another page: no origin');
  await page.select('#st-page-select', slug);
  await until(async () => { const s = await studioState(page); return s.status === 'loaded' && s.selected === slug; }, 'back');
  assert.deepEqual(await originNow(), stored);
  // a save keeps it, and keeps it stored
  await studioEditAndSave(page, ' X');
  assert.deepEqual([await originNow(), designOf(slug).origin], [stored, stored], 'unchanged by the Studio save');
  // another account in this tab: cleared at once
  await page.evaluate(() => window.__setSession('tok_ben'));
  await until(async () => (await page.evaluate(() => window.QraivyStudio.origin())) === null, 'cleared on account change');
  await until(async () => { const s = await studioState(page); return s.status === 'loaded' || s.status === 'empty'; }, 'Ben settled');
  assert.ok(!(await page.evaluate(() => document.body.innerText)).includes('Café Herkunft'), 'none of Carl\'s page for Ben');
  assert.equal(await originNow(), null, 'Ben\'s own page has no origin');
  // signed out
  await page.evaluate(() => window.__setSession(null));
  await sleep(500);
  assert.equal(await originNow(), null, 'signed out: none');
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('D2.3b-2 colour field: a button without its own colour shows the OPEN page\'s brand (Bakery, Creator; page switch; design reload); an explicit colour stays; Default clears it; Undo / Redo follow', async () => {
  S.resetDrafts();
  const OB = require('../../frontend/public/js/studio/onboarding-shell.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  const make = async (template, name) => {
    const r = OB.draftRequest(M, V3, T, { template, palette: T.get(template).palettes[0].id, name, description: '', links: [], social: 'auto', sections: null }, 'en');
    const res = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ requestId: require('crypto').randomUUID() }, r)) }).then((x) => x.json());
    return { slug: res.page.slug, brand: r.design.theme.palette.brand.toLowerCase() };
  };
  const bakery = await make('bakery', 'Bakery Sun');
  const creator = await make('creator', 'Creator Sun');
  assert.notEqual(bakery.brand, creator.brand, 'two different template brands');
  const demoBrand = V3.DEFAULT_PALETTE.brand.toLowerCase();
  assert.ok(bakery.brand !== demoBrand && creator.brand !== demoBrand);
  const { page, log } = await open('studio.html?slug=' + bakery.slug);
  await until(async () => (await studioState(page)).status === 'loaded', 'bakery loaded');
  const SEL = '#st-fields .st-color[data-path="data.primary.color"]';
  // the Hero's primary button colour (the first section, Content)
  const heroColour = async () => {
    if (!(await page.$(SEL))) {
      await page.click('#st-tab-sections');
      const first = await page.$eval('#st-outline [data-id]', (n) => n.getAttribute('data-id'));
      await page.click('#st-outline [data-id="' + first + '"]');
      await page.click('[data-insp="content"]');
      await page.waitForSelector(SEL, { timeout: 4000 });
    }
    return page.$eval(SEL, (w) => ({ shown: w.querySelector('input[type="color"]').value.toLowerCase(), defaultShown: !w.querySelector('button').hidden,
      stored: ((window.QraivyStudio.editor.draft().pages[0].sections[0].data || {}).primary || {}).color || null }));
  };
  assert.deepEqual(await heroColour(), { shown: bakery.brand, defaultShown: false, stored: null }, 'Bakery: its own brand, not the demo\'s');
  // an explicit colour
  await page.$eval(SEL + ' input[type="color"]', (i) => { i.value = '#123456'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(150);
  assert.deepEqual(await heroColour(), { shown: '#123456', defaultShown: true, stored: '#123456' }, 'the override shown and stored');
  // Undo: back to no colour (the brand); Redo: the override again
  await page.click('#st-undo-btn'); await sleep(200);
  assert.deepEqual(await heroColour(), { shown: bakery.brand, defaultShown: false, stored: null }, 'Undo');
  await page.click('#st-redo-btn'); await sleep(200);
  assert.deepEqual(await heroColour(), { shown: '#123456', defaultShown: true, stored: '#123456' }, 'Redo');
  // Default clears the override
  await page.click(SEL + ' button'); await sleep(200);
  assert.deepEqual(await heroColour(), { shown: bakery.brand, defaultShown: false, stored: null }, 'Default');
  // switch pages (nothing unsaved: Default restored the loaded page; save if the editor still counts it changed)
  if (await page.$eval('#st-save-btn', (b) => !b.disabled)) { await page.click('#st-save-btn'); await until(async () => (await studioState(page)).saveState === 'saved', 'saved'); }
  await page.select('#st-page-select', creator.slug);
  await until(async () => { const s = await studioState(page); return s.status === 'loaded' && s.selected === creator.slug; }, 'creator open');
  assert.deepEqual(await heroColour(), { shown: creator.brand, defaultShown: false, stored: null }, 'Creator: its own brand');
  await page.select('#st-page-select', bakery.slug);
  await until(async () => { const s = await studioState(page); return s.status === 'loaded' && s.selected === bakery.slug; }, 'bakery again');
  assert.equal((await heroColour()).shown, bakery.brand, 'back to Bakery');
  // a design reload with another brand (as a theme change would): followed at once
  await page.evaluate(() => { const d = window.QraivyStudio.editor.draft(); d.theme.palette.brand = '#0a7f3f'; window.QraivyStudio.editor.load(d); });
  await sleep(200);
  assert.equal((await heroColour()).shown, '#0a7f3f', 'the current theme, not a remembered one');
  // nothing about origins or the stored drafts changed by looking at colours
  assert.equal(designOf(creator.slug).draftRevision, 1);
  assert.deepEqual(log.errors, []);
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
