// ============================================================
// studioCustomSections.browser.test.js — Landing Page Studio V3, D2.3b-3:
// Custom Sections in the full Studio. In headless Chrome against the REAL
// routes (helpers/studioPagesServer.js, in-memory database). LOCAL ONLY: needs
// Chrome and puppeteer-core (prints SKIP and passes when missing).
//
// Checked:
// - the Text type is "Custom Section" / "Eigener Abschnitt" in the Studio
//   (library, outline, inspector, announcements); the core type stays "text"
//   and the public page carries no Studio label;
// - repeated sections are numbered by the current order (display only): an
//   onboarding draft's three Custom Sections; after add, duplicate, move,
//   remove, Undo / Redo the numbers follow and every id stays;
// - "Add Custom Section": below the selected section, selected, its editor
//   open; Save Draft and a reload keep ids, order and content;
// - "Empty – add content" only for a section the preview shows as empty;
// - at 40 sections the shortcut is unavailable with its reason;
// - 320 / 390 / desktop, EN / DE, Light / Dark: no sideways scroll, 44 px.
// Screenshots: set OB_SHOTS=<folder>.
// Run: node tests/studioCustomSections.browser.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioCustomSections.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const V3 = require('../src/lpV3/core');
const OB = require('../../frontend/public/js/studio/onboarding-shell.js');
const M = require('../../frontend/public/js/studio/onboarding-model.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');
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
const PHONE = (w) => ({ width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, srv;
const pageErrors = [];

async function open(file, { token = 'tok_carl', lang = 'en', theme = 'light', viewport = DESKTOP, dialog = 'dismiss' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((tok, l, th) => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', l); localStorage.setItem('qraivy.studio.theme', th); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {}
    const user = { id: 'user_' + tok.slice(4), primaryEmailAddress: { verification: { status: 'verified' } }, reload: async () => {} };
    window.Clerk = { loaded: true, load: async () => {}, user, session: { id: 'sess_' + tok, getToken: async () => tok }, addListener: () => {}, openSignIn: () => {}, signOut: async () => {} };
  }, token, lang, theme);
  const log = { errors: [], blocked: [] };
  page.on('pageerror', (e) => { log.errors.push(e.message); pageErrors.push(e.message); });
  // the Studio asks before removing a section with content (window.confirm): answered as the test says
  page.on('dialog', (d) => (dialog === 'accept' ? d.accept() : d.dismiss()));
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
  await page.goto('https://' + HOST + '/' + file, { waitUntil: 'networkidle0' });
  await until(async () => ['loaded', 'empty', 'notfound', 'error'].includes(await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))), 'page bar settled');
  await sleep(200);
  return { page, log };
}
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
async function shot(page, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); } }
// an onboarding draft of Carl's with exactly three Custom Sections (the only Text sections on the page)
async function onboardingDraft(lang = 'en') {
  const r = OB.draftRequest(M, V3, T, { template: 'bakery', palette: T.get('bakery').palettes[0].id, name: lang === 'de' ? 'Bäckerei Sonne' : 'Bakery Sun', description: '', links: [], social: 'auto',
    sections: ['hero', 'custom:aaaa1111', 'buttons', 'custom:bbbb2222', 'contact', 'custom:cccc3333'] }, lang);
  const res = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ requestId: require('crypto').randomUUID() }, r)) }).then((x) => x.json());
  return { slug: res.page.slug, design: r.design };
}
const rowOf = (slug) => S.db.pages.find((p) => p.slug === slug);
const designOf = (slug) => S.db.pageDesigns.find((d) => d.landingPageId === rowOf(slug).id);
// the outline as the owner sees it: name, summary, id, empty mark
const outline = (page) => page.$$eval('#st-outline .st-outline__item', (ns) => ns.map((n) => ({ id: n.getAttribute('data-id'), name: n.querySelector('strong').textContent, summary: n.querySelector('small').textContent, empty: n.querySelector('small').classList.contains('is-empty') })));
const ids = (page) => page.evaluate(() => window.QraivyStudio.editor.sectionIds());
const customNames = async (page) => (await outline(page)).filter((r) => /^(Custom Section|Eigener Abschnitt)/.test(r.name)).map((r) => r.name);
async function showSections(page) {
  // shown: the pane not hidden and its panel on screen (below 1200 px the panel is a drawer, off screen until opened)
  if (!(await page.$eval('#st-pane-sections', (n) => { const p = document.getElementById('st-left'), r = p.getBoundingClientRect(); return !n.hidden && !!n.offsetParent && getComputedStyle(p).visibility !== 'hidden' && r.left >= 0; }).catch(() => false))) {
    if (await page.$eval('#st-open-left', (b) => !!b.offsetParent).catch(() => false)) { await page.$eval('#st-open-left', (b) => b.click()); await sleep(400); }
    await page.$eval('#st-tab-sections', (b) => b.click()); await sleep(200);
  }
}
// a row's actions show on the selected row: select it, then the action
async function act(page, id, kind) {
  await showSections(page);
  await page.click('#st-outline .st-outline__item[data-id="' + id + '"]'); await sleep(150);
  await showSections(page);
  await page.click('#st-outline [data-sec="' + id + '"][data-act="' + kind + '"]'); await sleep(200);
}

test('three onboarding Custom Sections numbered 1-3 (empty); the shortcut adds below the selected one, selected, editor open; duplicate, move, remove and Undo / Redo renumber, ids stay; Save Draft and reload keep everything; the public page carries no Studio label', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('en');
  const { page, log } = await open('studio.html?slug=' + d.slug);
  await showSections(page);
  const start = await ids(page);
  assert.deepEqual(start.filter((x) => x.startsWith('s_c')), ['s_caaaa1111', 's_cbbbb2222', 's_ccccc3333']);
  let o = await outline(page);
  const cs = o.filter((r) => r.id.startsWith('s_c'));
  assert.deepEqual(cs.map((r) => r.name), ['Custom Section 1', 'Custom Section 2', 'Custom Section 3']);
  assert.ok(cs.every((r) => r.summary === 'Empty – add content' && r.empty), 'empty Custom Sections: ' + JSON.stringify(cs));
  assert.ok(o.filter((r) => !r.id.startsWith('s_c')).every((r) => !/\d$/.test(r.name)), 'single types not numbered: ' + o.map((r) => r.name).join(', '));
  // the inspector heading: the numbered name
  await page.click('#st-outline .st-outline__item[data-id="s_cbbbb2222"]'); await sleep(200);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Custom Section 2');
  // the shortcut: below the selected one, selected, its editor open, a new id; Custom Section 2 -> 3
  await page.click('#st-outline .st-outline__item[data-id="s_caaaa1111"]'); await sleep(150);
  await showSections(page);
  assert.equal(await page.$eval('#st-add-custom', (b) => [b.textContent.trim(), b.getAttribute('aria-disabled')].join('|')), 'Add Custom Section|false');
  await page.click('#st-add-custom'); await sleep(300);
  const afterAdd = await ids(page);
  const added = afterAdd.find((x) => !start.includes(x));
  assert.match(added, /^s_[a-z0-9]{8}$/, 'a new id of the Studio\'s own kind');
  assert.equal(afterAdd.indexOf(added), afterAdd.indexOf('s_caaaa1111') + 1, 'right below the selected section');
  assert.deepEqual(afterAdd.filter((x) => x !== added), start, 'every other id and the order unchanged');
  assert.equal(await page.evaluate(() => window.QraivyStudio.editor.selected()), added, 'selected');
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Custom Section 2', 'its editor open, numbered by position');
  assert.ok(await page.$('#st-fields [data-path="data.heading"] input'), 'the Custom Section fields');
  await until(async () => (await page.$eval('#st-live', (n) => n.textContent)) === 'Custom Section 2 added.', 'announced');
  await showSections(page);
  o = await outline(page);
  assert.deepEqual(await customNames(page), ['Custom Section 1', 'Custom Section 2', 'Custom Section 3', 'Custom Section 4']);
  const newRow = o.find((r) => r.id === added);
  assert.deepEqual([newRow.summary, newRow.empty], ['Heading', false], 'the starter text is content, not "empty"');
  assert.equal(o.find((r) => r.id === 's_cbbbb2222').name, 'Custom Section 3', 'the next one renumbered');
  // duplicate the last one: 5 numbered, the copy below with a new id
  await act(page, 's_ccccc3333', 'duplicate');
  const afterDup = await ids(page);
  const copy = afterDup.find((x) => !afterAdd.includes(x));
  assert.equal(afterDup.indexOf(copy), afterDup.indexOf('s_ccccc3333') + 1);
  assert.deepEqual(await customNames(page), ['Custom Section 1', 'Custom Section 2', 'Custom Section 3', 'Custom Section 4', 'Custom Section 5']);
  // move Custom Section 3 (s_cbbbb2222) up twice: numbers follow the order, ids stay
  await act(page, 's_cbbbb2222', 'up'); await act(page, 's_cbbbb2222', 'up');
  o = await outline(page);
  const orderNow = o.filter((r) => /^Custom Section/.test(r.name)).map((r) => r.id);
  assert.deepEqual(o.filter((r) => /^Custom Section/.test(r.name)).map((r) => r.name), ['Custom Section 1', 'Custom Section 2', 'Custom Section 3', 'Custom Section 4', 'Custom Section 5']);
  assert.equal(o.find((r) => r.id === 's_cbbbb2222').name, 'Custom Section ' + (orderNow.indexOf('s_cbbbb2222') + 1));
  // remove the added one; Undo brings it back with its id; Redo removes it again
  await act(page, added, 'remove');
  assert.ok(!(await ids(page)).includes(added));
  assert.equal((await customNames(page)).length, 4);
  await page.click('#st-undo-btn'); await sleep(250);
  assert.ok((await ids(page)).includes(added), 'Undo: back with the same id');
  assert.equal((await customNames(page)).length, 5);
  await page.click('#st-redo-btn'); await sleep(250);
  assert.ok(!(await ids(page)).includes(added), 'Redo');
  // type into the copy: its summary is the heading; Save Draft; reload: ids, order, content and names as saved
  await page.click('#st-outline .st-outline__item[data-id="' + copy + '"]'); await sleep(150);
  await page.click('#st-fields [data-path="data.heading"] input', { clickCount: 3 });
  await page.keyboard.type('Our story');
  await sleep(400);
  await showSections(page);
  assert.equal((await outline(page)).find((r) => r.id === copy).summary, 'Our story');
  const beforeSave = await page.evaluate(() => window.QraivyStudio.editor.draft());
  await until(() => page.$eval('#st-save-btn', (b) => !b.disabled), 'save enabled');
  await page.click('#st-save-btn');
  await until(async () => (await page.$eval('#st-save-status', (n) => n.getAttribute('data-state'))) === 'saved', 'saved');
  const stored = designOf(d.slug).draft;
  assert.deepEqual(stored.pages[0].sections.map((s) => s.id), beforeSave.pages[0].sections.map((s) => s.id), 'saved ids and order');
  assert.ok(stored.pages[0].sections.every((s) => s.type !== 'custom'), 'no new section type: Custom Sections are stored as "text"');
  assert.deepEqual(stored.pages[0].sections.filter((s) => s.type === 'text').length, 4);
  const namesSaved = await outline(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await until(async () => (await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))) === 'loaded', 'reloaded');
  await showSections(page);
  assert.deepEqual(await outline(page), namesSaved, 'after a reload: the same names, summaries and ids');
  // the public page: no Studio label, empty Custom Sections left out
  const pub = V3.renderDesign(stored, { businessName: 'Bakery Sun' }).html;
  assert.ok(!/Custom Section|Eigener Abschnitt|Empty – add content/.test(pub), 'no Studio label on the public page');
  assert.ok(pub.includes('Our story'));
  assert.ok(!pub.includes('data-v3-id="s_caaaa1111"') && !pub.includes('id="s_caaaa1111"'), 'an empty Custom Section is not on the public page');
  assert.deepEqual([log.errors, log.blocked], [[], []]);
  await page.close();
});

test('German: "Eigener Abschnitt 1-3", "Leer – Inhalt hinzufügen", the shortcut, the library entry, the inspector heading and the announcement', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('de');
  const { page } = await open('studio.html?slug=' + d.slug, { lang: 'de' });
  await showSections(page);
  const cs = (await outline(page)).filter((r) => r.id.startsWith('s_c'));
  assert.deepEqual(cs.map((r) => [r.name, r.summary]), [['Eigener Abschnitt 1', 'Leer – Inhalt hinzufügen'], ['Eigener Abschnitt 2', 'Leer – Inhalt hinzufügen'], ['Eigener Abschnitt 3', 'Leer – Inhalt hinzufügen']]);
  assert.equal(await page.$eval('#st-add-custom', (b) => b.textContent.trim()), 'Eigenen Abschnitt hinzufügen');
  await page.click('#st-outline .st-outline__item[data-id="s_ccccc3333"]'); await sleep(150);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Eigener Abschnitt 3');
  await showSections(page);
  await page.click('#st-add-custom'); await sleep(300);
  await until(async () => (await page.$eval('#st-live', (n) => n.textContent)) === '„Eigener Abschnitt 4“ hinzugefügt.', 'announced in German');
  await page.click('#st-tab-add'); await sleep(200);
  const lib = await page.$eval('#st-lib [data-type="text"]', (b) => [b.querySelector('strong').textContent, b.querySelector('small').textContent]);
  assert.deepEqual(lib, ['Eigener Abschnitt', 'Ihre eigene Überschrift und Ihr eigener Text · beliebig oft']);
  await page.close();
});

test('"Empty" only when the preview shows the section as empty: typing a heading fills it, clearing heading and text empties it again; placeholder text is content', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('en');
  const { page } = await open('studio.html?slug=' + d.slug);
  await page.click('#st-outline .st-outline__item[data-id="s_caaaa1111"]'); await sleep(150);
  await page.click('#st-fields [data-path="data.body"] textarea');
  await page.keyboard.type('Only a text, no heading.');
  await sleep(400);
  await showSections(page);
  let row = (await outline(page)).find((r) => r.id === 's_caaaa1111');
  assert.deepEqual([row.summary, row.empty], ['', false], 'a body without a heading: not empty (the preview shows it), no heading to show');
  await page.click('#st-outline .st-outline__item[data-id="s_caaaa1111"]'); await sleep(150);
  await page.click('#st-fields [data-path="data.body"] textarea', { clickCount: 3 });
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
  await sleep(400);
  await showSections(page);
  row = (await outline(page)).find((r) => r.id === 's_caaaa1111');
  assert.deepEqual([row.summary, row.empty], ['Empty – add content', true], 'empty again');
  // the core rule itself: the same ids the core preview draws as empty
  const html = await page.evaluate(() => { const V = window.QraivyV3; return V.renderDesign(window.QraivyStudio.editor.lastValid(), { businessName: 'x' }, { preview: true }).html; });
  const coreEmpty = [...html.matchAll(/<section [^>]*data-v3-id="([^"]+)"[^>]*class="[^"]*\bv3-ph-section\b/g)].map((m) => m[1]).sort();
  const shown = (await outline(page)).filter((r) => r.empty).map((r) => r.id).sort();
  assert.deepEqual(shown, coreEmpty, 'the outline agrees with the preview');
  await page.close();
});

test('at 40 sections: Add Custom Section unavailable with its reason (focusable, described), clicking adds nothing; the library says the same; below 40 again: available', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('en');
  // fill the draft up to 40 sections (Custom Sections), saved through the real PUT
  const full = JSON.parse(JSON.stringify(designOf(d.slug).draft));
  const secs = full.pages[0].sections;
  for (let i = 0; secs.length < 40; i++) secs.push({ id: 's_fill' + String(i).padStart(4, '0'), type: 'text', variant: 'plain', data: { heading: 'Part ' + i, body: '' } });
  const put = await fetch(srv.origin + '/studio/pages/' + d.slug + '/design', { method: 'PUT', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify({ design: full, baseRevision: 1 }) });
  assert.equal(put.status, 200);
  const { page } = await open('studio.html?slug=' + d.slug, { dialog: 'accept' });
  await showSections(page);
  assert.equal((await ids(page)).length, 40);
  const b = await page.$eval('#st-add-custom', (n) => ({ dis: n.getAttribute('aria-disabled'), title: n.title, why: document.getElementById('st-add-custom-why').textContent, whyShown: !document.getElementById('st-add-custom-why').hidden, desc: n.getAttribute('aria-describedby'), focusable: n.tabIndex >= 0 && !n.disabled }));
  assert.deepEqual(b, { dis: 'true', title: 'Maximum of 40 sections reached', why: 'Maximum of 40 sections reached', whyShown: true, desc: 'st-add-custom-why', focusable: true });
  await page.click('#st-add-custom'); await sleep(300);
  assert.equal((await ids(page)).length, 40, 'nothing added');
  await until(async () => (await page.$eval('#st-live', (n) => n.textContent)) === 'Maximum of 40 sections reached', 'the reason announced');
  await page.click('#st-tab-add'); await sleep(200);
  assert.equal(await page.$eval('#st-lib [data-type="text"]', (n) => [n.getAttribute('aria-disabled'), n.querySelector('.st-lib__badge').textContent].join('|')), 'true|Maximum of 40 sections reached');
  // one removed: available again
  await act(page, 's_fill0000', 'remove');
  assert.equal((await ids(page)).length, 39, 'one removed');
  assert.equal(await page.$eval('#st-add-custom', (n) => [n.getAttribute('aria-disabled'), document.getElementById('st-add-custom-why').hidden].join('|')), 'false|true');
  await page.close();
});

test('phones (320 / 390): the Studio stays preview-only as designed (no panels below 768 px): no sideways scroll, no shortcut shown, no script error', async () => {
  for (const [viewport, lang, theme] of [[PHONE(390), 'en', 'light'], [PHONE(320), 'de', 'dark'], [PHONE(390), 'de', 'dark'], [PHONE(320), 'en', 'light']]) {
    const tag = viewport.width + '-' + lang + '-' + theme;
    S.resetDrafts();
    const d = await onboardingDraft(lang);
    const { page, log } = await open('studio.html?slug=' + d.slug, { lang, theme, viewport });
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, panel: getComputedStyle(document.getElementById('st-left')).display, shortcut: document.getElementById('st-add-custom').getBoundingClientRect().height }));
    assert.deepEqual([m.sw <= m.iw, m.panel, m.shortcut], [true, 'none', 0], tag + ': ' + JSON.stringify(m));
    assert.deepEqual(log.errors, []);
    await shot(page, 'd23b3-phone-preview-' + tag + '.png');
    await page.close();
  }
});

test('readable everywhere the Sections panel exists: drawers at 768 / 1024 and desktop, English and German, Light and Dark: numbered Custom Sections and the shortcut; no sideways scroll; 44 px; contrast', async () => {
  const ratio = (a, b) => {
    const lum = (c) => { const v = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const TABLET = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const [viewport, lang, theme] of [[TABLET(768, 1024), 'en', 'light'], [TABLET(768, 1024), 'de', 'dark'], [TABLET(1024, 768), 'de', 'light'], [TABLET(1024, 768), 'en', 'dark'], [DESKTOP, 'en', 'light'], [DESKTOP, 'de', 'dark']]) {
    const tag = viewport.width + '-' + lang + '-' + theme;
    S.resetDrafts();
    const d = await onboardingDraft(lang);
    const { page } = await open('studio.html?slug=' + d.slug, { lang, theme, viewport });
    await showSections(page);
    await page.$eval('#st-add-custom', (n) => n.scrollIntoView({ block: 'center' }));
    await sleep(200);
    const m = await page.evaluate(() => {
      const bg = (n) => { for (let x = n; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
      const box = (sel) => { const n = document.querySelector(sel), r = n.getBoundingClientRect(); return { h: r.height, l: r.left, r: r.right, fg: getComputedStyle(n).color, bg: bg(n) }; };
      const small = document.querySelector('#st-outline small.is-empty');
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, custom: box('#st-add-custom'), add: box('#st-add-section'), empty: small ? { fg: getComputedStyle(small).color, bg: bg(small) } : null };
    });
    assert.ok(m.sw <= m.iw, tag + ': sideways scroll ' + m.sw + '/' + m.iw);
    for (const k of ['custom', 'add']) assert.ok(m[k].h >= 44 && m[k].l >= 0 && m[k].r <= m.iw + 0.5, tag + ' ' + k + ': ' + JSON.stringify(m[k]));
    assert.ok(ratio(m.custom.fg, m.custom.bg) >= 4.5, tag + ': shortcut contrast ' + ratio(m.custom.fg, m.custom.bg));
    assert.ok(m.empty && ratio(m.empty.fg, m.empty.bg) >= 4.5, tag + ': empty summary contrast');
    await shot(page, 'd23b3-sections-' + tag + '.png');
    await page.close();
  }
});

(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';   // the template photos' account; the helper sets test-cloud
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioCustomSections.browser');
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
