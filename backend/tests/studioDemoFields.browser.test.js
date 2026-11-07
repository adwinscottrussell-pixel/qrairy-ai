// ============================================================
// studioDemoFields.browser.test.js — Landing Page Studio V3, E3: the
// template example content of an onboarding draft marked in the Studio. In
// headless Chrome against the REAL routes (helpers/studioPagesServer.js,
// in-memory database). LOCAL ONLY: needs Chrome and puppeteer-core (prints
// SKIP and passes when missing).
//
// Checked:
// - all six templates, English and German: the section list badges, the
//   preview tags and the editor chips name exactly the values
//   studio-demo-fields.js finds; the customer's values never; AI labels kept;
// - editing removes only the replaced value's chip; Undo / Redo; Save and
//   reopen; no mark is ever saved, sent or rendered by core.js;
// - drafts saved before E2, plain drafts, legacy pages, the sample page, an
//   unknown template, another account: no wrong mark, no error;
// - the full preview; desktop, tablet and phone, EN / DE, Light / Dark.
// Screenshots: set OB_SHOTS=<folder>.
// Run: node tests/studioDemoFields.browser.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioDemoFields.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

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
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, srv;
const pageErrors = [];
const TEXT = {
  en: { empty: 'Add your content – this section isn’t shown on your public page until it has content.', example: 'Your template showed example content here. Add your own information.', demo: 'This section contains example content. Replace it with your own information.' },
  de: { empty: 'Inhalt hinzufügen – dieser Abschnitt erscheint erst auf Ihrer öffentlichen Seite, wenn er Inhalte hat.', example: 'Ihre Vorlage hat hier Beispielinhalte gezeigt. Ergänzen Sie Ihre eigenen Angaben.', demo: 'Dieser Bereich enthält Beispielinhalte. Ersetzen Sie diese durch Ihre eigenen Angaben.' },
};
const ALL_GUIDE = Object.values(TEXT).flatMap((x) => Object.values(x));

async function open(file, { token = 'tok_carl', lang = 'en', theme = 'light', viewport = DESKTOP } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((tok, l, th) => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', l); localStorage.setItem('qraivy.studio.theme', th); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {}
    let current = tok;
    const listeners = [];
    const mk = (t) => ({ user: t ? { id: 'user_' + t.slice(4), primaryEmailAddress: { verification: { status: 'verified' } }, reload: async () => {} } : null, session: t ? { id: 'sess_' + t, getToken: async () => current } : null });
    const first = mk(tok);
    window.Clerk = { loaded: true, load: async () => {}, user: first.user, session: first.session, addListener: (fn) => listeners.push(fn), openSignIn: () => {}, signOut: async () => {} };
    // another account (a token) or signed out (null) in this tab, announced as Clerk does
    window.__setSession = (t) => { current = t; const n = mk(t); window.Clerk.user = n.user; window.Clerk.session = n.session; listeners.forEach((fn) => fn({ session: n.session, user: n.user })); };
  }, token, lang, theme);
  const log = { errors: [], blocked: [], puts: [] };
  page.on('pageerror', (e) => { log.errors.push(e.message); pageErrors.push(e.message); });
  page.on('dialog', (d) => d.dismiss());
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
      if (r.method() === 'PUT') log.puts.push(r.postData() || '');
      const h = { Authorization: r.headers().authorization || '' };
      if (r.postData()) h['Content-Type'] = 'application/json';
      const res = await fetch(srv.origin + u.pathname, { method: r.method(), headers: h, body: r.postData() || undefined });
      return r.respond({ status: res.status, contentType: 'application/json', headers: cors, body: await res.text() }).catch(() => {});
    }
    log.blocked.push(r.method() + ' ' + u.host + u.pathname);
    return r.abort();
  });
  await page.goto('https://' + HOST + '/' + file, { waitUntil: 'networkidle0' });
  await until(async () => ['loaded', 'empty', 'notfound', 'error', 'signin'].includes(await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))), 'page bar settled');
  await sleep(200);
  return { page, log };
}
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
async function shot(page, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); } }
// Carl's onboarding draft: Buttons, Products, Opening Hours, Contact, one empty Custom Section, the Hero.
// Default: as drafts saved BEFORE E2 hold it (examples left out: the design is pageFor().draft, T.starter), the
// compatibility case for every existing draft. e2: true: as Save Draft sends it now (the preview's example content).
async function onboardingDraft(lang = 'en', { e2 = false } = {}) {
  const a = { template: 'bakery', palette: T.get('bakery').palettes[0].id, name: lang === 'de' ? 'Bäckerei Sonne' : 'Bakery Sun', description: '', links: [], social: 'auto',
    sections: ['hero', 'buttons', 'products', 'openingHours', 'contact', 'custom:aaaa1111', 'socialMedia'] };
  const r = OB.draftRequest(M, V3, T, a, lang);
  if (!e2) r.design = M.pageFor(V3, T, a, lang).draft;
  const res = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ requestId: require('crypto').randomUUID() }, r)) }).then((x) => x.json());
  return { slug: res.page.slug, origin: r.origin };
}
const rowOf = (slug) => S.db.pages.find((p) => p.slug === slug);
const designOf = (slug) => S.db.pageDesigns.find((d) => d.landingPageId === rowOf(slug).id);
async function showSections(page) {
  const shown = await page.$eval('#st-pane-sections', (n) => { const p = document.getElementById('st-left'), r = p.getBoundingClientRect(); return !n.hidden && !!n.offsetParent && getComputedStyle(p).visibility !== 'hidden' && r.left >= 0; }).catch(() => false);
  if (!shown) {
    if (await page.$eval('#st-open-left', (b) => !!b.offsetParent).catch(() => false)) { await page.$eval('#st-open-left', (b) => b.click()); await sleep(400); }
    await page.$eval('#st-tab-sections', (b) => b.click()); await sleep(200);
  }
}
// select a section from the Sections list; the editor's guidance note: null (none) or { kind, text }
async function selectSection(page, id) { await showSections(page); await page.$eval('#st-outline .st-outline__item[data-id="' + id + '"]', (b) => b.click()); await sleep(200); }
const guide = (page) => page.evaluate(() => { const g = document.querySelector('#st-fields .st-guide'); return g && !g.hidden ? { kind: g.getAttribute('data-kind'), text: g.textContent } : null; });
const guideFor = async (page, id) => { await selectSection(page, id); return guide(page); };
const EXAMPLES = ['s_obbuttons1', 's_obproducts1', 's_obhours01', 's_obcontact1'];

const F = require('../../frontend/public/js/studio/studio-demo-fields.js');
const LABEL = { en: 'Example', de: 'Beispiel' };
const DEMO_NOTE = { en: 'This section contains example content. Replace it with your own information.', de: 'Dieser Bereich enthält Beispielinhalte. Ersetzen Sie diese durch Ihre eigenen Angaben.' };
// an onboarding draft as saved now (E2): every section type, a Custom Section, the customer's description and link
async function e2Draft(tpl, lang, extra) {
  const a = Object.assign({ template: tpl, palette: T.get(tpl).palettes[0].id, name: lang === 'de' ? 'Werkstatt Lindenhof' : 'Lindenhof Studio', description: lang === 'de' ? 'Unsere eigenen Worte.' : 'Our own words.',
    links: [{ platform: 'instagram', url: 'instagram.com/lindenhof' }], social: 'auto', sections: M.SECTION_TYPES.concat(['custom:aaaa1111']) }, extra || {});
  const r = OB.draftRequest(M, V3, T, a, lang);
  const res = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ requestId: require('crypto').randomUUID() }, r)) }).then((x) => x.json());
  return { slug: res.page.slug, origin: r.origin, design: r.design, answers: a };
}
const badges = (page) => page.$$eval('#st-outline .st-outline__item', (ns) => ns.filter((n) => n.querySelector('.st-ex-badge')).map((n) => n.getAttribute('data-id')));
const badgeTexts = (page) => page.$$eval('#st-outline .st-ex-badge', (ns) => [...new Set(ns.map((n) => n.textContent))]);
const canvasHtml = (page) => page.$eval('#st-canvas iframe', (f) => f.srcdoc);
const taggedIds = (html) => [...html.matchAll(/<section data-st-ex="1" [^>]*data-v3-id="([^"]+)"/g)].map((m) => m[1]);
// the inspector's chips: field chips by their field's path, row chips by list and row
const chips = (page) => page.evaluate(() => [...document.querySelectorAll('#st-fields .st-ex-chip')].map((c) => {
  const row = c.closest('.st-item__toggle');
  if (row) return c.closest('[data-path]').getAttribute('data-path') + '[' + row.closest('.st-item').getAttribute('data-index') + ']';
  return c.closest('[data-path]').getAttribute('data-path');
}));
const expectedChips = (paths) => paths.filter((p) => !/\.target$/.test(p));
async function waitBadges(page, want, what) { return until(async () => JSON.stringify(await badges(page)) === JSON.stringify(want) ? true : null, what + ' ' + JSON.stringify(want)); }
async function openContent(page) { if (await page.$('[data-insp="content"]')) await page.$eval('[data-insp="content"]', (b) => b.click()); await sleep(120); }

test('E3 all six templates, English and German: the section list badges, the preview tags and the editor chips name exactly the template example values (Hero, products); the customer\'s name, description and link never; AI labels kept; the example note', async () => {
  for (const tpl of T.TEMPLATE_IDS) {
    for (const lang of ['en', 'de']) {
      S.resetDrafts();
      const d = await e2Draft(tpl, lang);
      const want = F.exampleMap(d.design, d.origin, T, V3), ids = d.design.pages[0].sections.map((s) => s.id).filter((id) => want[id]);
      const tag = tpl + ' ' + lang;
      const { page, log } = await open('studio.html?slug=' + d.slug, { lang });
      await showSections(page);
      await waitBadges(page, ids, tag + ': badges');
      assert.deepEqual(await badgeTexts(page), [LABEL[lang]], tag + ': badge text');
      assert.ok(!ids.includes('s_obsocial1') && !ids.includes('s_caaaa1111'), tag + ': the customer\'s links and the empty Custom Section unmarked');
      const html = await until(async () => { const h = await canvasHtml(page); return taggedIds(h).length ? h : null; }, tag + ': preview tags');
      assert.deepEqual(taggedIds(html), ids, tag + ': the preview tags the same sections');
      assert.equal((html.match(/<span class="st-ex-tag">/g) || []).length, ids.length);
      assert.ok(html.includes('[data-st-ex] a{pointer-events:none'), tag + ': example links do nothing in the preview');
      if (/images\/|res\.cloudinary/.test(JSON.stringify(d.design))) await until(async () => (await canvasHtml(page)).includes('class="st-ai"') || null, tag + ': the AI labels stay');
      // the Hero: every example field chipped, never the headline (the customer's name) or the sub-headline (their description)
      await selectSection(page, 's_obhero01'); await openContent(page);
      await until(async () => JSON.stringify((await chips(page)).sort()) === JSON.stringify(expectedChips(want.s_obhero01).sort()) || null, tag + ': Hero chips ' + JSON.stringify(expectedChips(want.s_obhero01)));
      assert.ok(!(await chips(page)).some((p) => /headline/.test(p)), tag + ': name and description unmarked');
      assert.deepEqual(await guide(page), { kind: 'demo', text: DEMO_NOTE[lang] }, tag + ': the example note');
      // Products: one chip per example row (rows closed)
      await selectSection(page, 's_obproducts1'); await openContent(page);
      const rows = [...new Set(want.s_obproducts1.map((p) => /^data\.items\[(\d+)\]/.exec(p)[1]))].map((i) => 'data.items[' + i + ']');
      await until(async () => JSON.stringify(await chips(page)) === JSON.stringify(rows) || null, tag + ': product row chips ' + JSON.stringify(rows));
      // Social Media: the customer's link, nothing marked, no note
      await selectSection(page, 's_obsocial1'); await openContent(page);
      assert.deepEqual([await chips(page), await guide(page)], [[], null], tag + ': Social Media');
      assert.deepEqual([log.errors, log.blocked], [[], []], tag);
      await page.close();
    }
  }
});

test('E3 editing: replacing one example value removes only its chip; the row and section stay marked while other examples remain; a fully replaced section loses badge, tag and note; Save and reopen keep the detection; nothing of the marks is saved', async () => {
  S.resetDrafts();
  const d = await e2Draft('restaurant', 'en');
  const { page, log } = await open('studio.html?slug=' + d.slug);
  await showSections(page);
  const all = d.design.pages[0].sections.map((s) => s.id), want = F.exampleMap(d.design, d.origin, T, V3);
  await waitBadges(page, all.filter((id) => want[id]), 'start');
  // a product's price
  await selectSection(page, 's_obproducts1'); await openContent(page);
  await page.click('#st-fields .st-item[data-index="0"] .st-item__toggle');
  await until(() => page.$('#st-fields [data-path="data.items[0].price"] input'), 'row open');
  let c = await chips(page);
  assert.ok(['data.items[0].name', 'data.items[0].description', 'data.items[0].price', 'data.items[0]'].every((p) => c.includes(p)), 'open row: its field chips ' + JSON.stringify(c));
  await shot(page, 'e3-inspector-product-chips-before.png');
  await page.click('#st-fields [data-path="data.items[0].price"] input', { clickCount: 3 });
  await page.keyboard.type('€13.00');
  await until(async () => !(await chips(page)).includes('data.items[0].price') || null, 'the price chip goes');
  c = await chips(page);
  assert.ok(c.includes('data.items[0].name') && c.includes('data.items[0].description') && c.includes('data.items[0]') && c.includes('data.items[1]'), 'the other chips stay ' + JSON.stringify(c));
  assert.ok((await badges(page)).includes('s_obproducts1'), 'the section badge stays');
  await shot(page, 'e3-inspector-product-chips-after.png');
  // Contact: all four example values replaced
  await selectSection(page, 's_obcontact1'); await openContent(page);
  await until(async () => (await chips(page)).length === 4 || null, 'contact chips');
  for (const [p, v] of [['data.address.line1', 'Hauptstraße 5'], ['data.address.postalCode', '89073'], ['data.address.city', 'Ulm'], ['data.email', 'info@lindenhof.de']]) {
    await page.click('#st-fields [data-path="' + p + '"] input', { clickCount: 3 });
    await page.keyboard.type(v);
    await sleep(900);   // one Undo step each
  }
  await until(async () => (await chips(page)).length === 0 || null, 'no contact chips');
  await until(async () => !(await badges(page)).includes('s_obcontact1') || null, 'contact badge gone');
  assert.equal(await guide(page), null, 'no note: the section is the customer\'s');
  await until(async () => !taggedIds(await canvasHtml(page)).includes('s_obcontact1') || null, 'contact preview tag gone');
  // Undo brings the example (and its mark) back; Redo removes it again
  await page.click('#st-undo-btn');
  await until(async () => (await chips(page)).includes('data.email') || null, 'Undo: the example email and its chip back');
  await page.click('#st-redo-btn');
  await until(async () => !(await chips(page)).includes('data.email') || null, 'Redo: gone again');
  const before = await badges(page);
  // Save, then a later visit: the same detection from the saved content
  await until(() => page.$eval('#st-save-btn', (b) => !b.disabled), 'Save enabled');
  await page.click('#st-save-btn');
  await until(async () => (await page.$eval('#st-save-status', (n) => n.getAttribute('data-state'))) === 'saved' || null, 'saved');
  assert.equal(designOf(d.slug).draftRevision, 2);
  const stored = JSON.stringify(designOf(d.slug).draft);
  assert.ok(!/st-ex|data-st-ex|Example<|Beispiel</.test(stored) && !log.puts.some((b) => /st-ex|data-st-ex/.test(b)), 'no mark is saved or sent');
  assert.deepEqual(S.copy(designOf(d.slug).origin), d.origin, 'the origin untouched');
  await page.close();
  const again = await open('studio.html?slug=' + d.slug);
  await showSections(again.page);
  await waitBadges(again.page, before, 'reopened: the same badges');
  await selectSection(again.page, 's_obproducts1'); await openContent(again.page);
  await again.page.click('#st-fields .st-item[data-index="0"] .st-item__toggle');
  await until(async () => { const x = await chips(again.page); return x.includes('data.items[0].name') && !x.includes('data.items[0].price') ? true : null; }, 'reopened: the edited price stays unmarked');
  assert.deepEqual([log.errors, again.log.errors], [[], []]);
  await again.page.close();
});

test('E3 compatible and safe: a draft saved before E2 (only its starter texts and photos marked; the left-out note on its empty sections), a plain draft, a legacy page, the sample page and an unknown template: no wrong mark, no error; another account sees none of it', async () => {
  S.resetDrafts();
  // before E2: the same answers, the design without the example-only parts
  const a = { template: 'bakery', palette: 'honey', name: 'Bakery Sun', description: '', links: [], social: 'auto', sections: ['hero', 'buttons', 'products', 'openingHours', 'contact', 'text'] };
  const r = OB.draftRequest(M, V3, T, a, 'en');
  r.design = M.pageFor(V3, T, a, 'en').draft;
  const old = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ requestId: require('crypto').randomUUID() }, r)) }).then((x) => x.json());
  const want = F.exampleMap(r.design, r.origin, T, V3);
  assert.deepEqual(Object.keys(want).sort(), ['s_obhero01', 's_obtext01'], 'the fixture');
  let p = await open('studio.html?slug=' + old.page.slug);
  await showSections(p.page);
  await waitBadges(p.page, ['s_obhero01', 's_obtext01'], 'old draft');
  assert.equal((await guideFor(p.page, 's_obproducts1')).kind, 'example', 'its empty example section: the left-out note');
  assert.equal((await guideFor(p.page, 's_obhero01')).kind, 'demo');
  await p.page.close();
  // an unknown template in the stored origin
  const d = await e2Draft('retail', 'en');
  designOf(d.slug).origin = Object.assign({}, designOf(d.slug).origin, { template: 'no-such-template' });
  p = await open('studio.html?slug=' + d.slug);
  await showSections(p.page);
  await sleep(300);
  assert.deepEqual([await badges(p.page), taggedIds(await canvasHtml(p.page))], [[], []], 'unknown template: nothing marked');
  assert.notEqual((await guideFor(p.page, 's_obproducts1')) && (await guideFor(p.page, 's_obproducts1')).kind, 'demo');
  assert.deepEqual(p.log.errors, []);
  await p.page.close();
  // a plain draft (no origin), Anna's legacy page, the sample page
  const plain = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ohne Herkunft', language: 'de' }) }).then((x) => x.json());
  for (const [file, opts, what] of [['studio.html?slug=' + plain.page.slug, { lang: 'de' }, 'plain draft'], ['studio.html?slug=anna-cafe', { token: 'tok_anna' }, 'legacy page'], ['studio.html', { token: 'tok_dana' }, 'sample page']]) {
    const q = await open(file, opts);
    await showSections(q.page);
    await sleep(300);
    assert.deepEqual([await badges(q.page), taggedIds(await canvasHtml(q.page))], [[], []], what + ': nothing marked');
    assert.deepEqual(q.log.errors, [], what);
    await q.page.close();
  }
  // another account opening Carl's draft: nothing of it (owner-checked load), no marks
  const e = await open('studio.html?slug=' + d.slug, { token: 'tok_anna' });
  assert.deepEqual(await badges(e.page), [], 'another account');
  assert.ok(!(await canvasHtml(e.page)).includes('Lindenhof'), 'none of Carl\'s content');
  await e.page.close();
});

test('E3 the full preview: the same example tags, example links do nothing; the customer\'s page itself unchanged (core.js renders it as before)', async () => {
  S.resetDrafts();
  const d = await e2Draft('beauty', 'de');
  const { page } = await open('studio.html?slug=' + d.slug, { lang: 'de' });
  const want = Object.keys(F.exampleMap(d.design, d.origin, T, V3));
  await until(async () => taggedIds(await canvasHtml(page)).length || null, 'canvas tags');
  await page.click('#st-preview-btn');
  const full = await until(() => page.$eval('#st-full-frame', (f) => (f.srcdoc.length > 1000 ? f.srcdoc : null)), 'full preview');
  assert.deepEqual(taggedIds(full).sort(), want.sort());
  assert.ok(full.includes('<span class="st-ex-tag">Beispiel</span>') && full.includes('[data-st-ex] a{pointer-events:none'));
  // the tag stays under core.js's sticky header (z-index 5) when a section scrolls beneath it, above the Hero photo and text (z-index 1)
  assert.ok(/\.st-ex-tag\{[^}]*z-index:4;/.test(full) && /header\{position:sticky;top:0;z-index:5;/.test(full), 'tag below the sticky header');
  assert.equal(await page.$eval('#st-full-frame', (f) => f.getAttribute('sandbox')), '', 'the full preview runs nothing');
  // the public render of the same design (core.js) has no mark at all
  const pub = V3.renderDesign(designOf(d.slug).draft, { businessName: 'x' }, {}).html;
  assert.ok(!/st-ex|data-st-ex|Beispiel<\/span>/.test(pub), 'core.js output carries no mark');
  await shot(page, 'e3-full-preview-de.png');
  await page.close();
});

test('E3 readable everywhere: badges, chips, preview tags and the note at desktop 1440, tablet 1024 / 768 and phone 390, English and German, Light and Dark; contrast, no sideways scroll', async () => {
  const ratio = (a, b) => {
    const lum = (c) => { const v = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const DEV = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const look = (page, sel) => page.evaluate((s) => {
    const n = document.querySelector(s); if (!n) return null;
    // the painted background: semi-transparent layers blended over what is beneath them, as the browser paints them
    const bg = (x) => {
      const layers = [];
      for (; x; x = x.parentElement) {
        const m = (getComputedStyle(x).backgroundColor.match(/[\d.]+/g) || []).map(Number);
        const a = m.length === 4 ? m[3] : m.length ? 1 : 0;
        if (a > 0) { layers.push([m[0], m[1], m[2], a]); if (a === 1) break; }
      }
      let c = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; c = [r * a + c[0] * (1 - a), g * a + c[1] * (1 - a), b * a + c[2] * (1 - a)]; }
      return 'rgb(' + c.map(Math.round).join(', ') + ')';
    };
    const r = n.getBoundingClientRect();
    return { fg: getComputedStyle(n).color, bg: bg(n), w: r.width, text: n.textContent, sw: document.documentElement.scrollWidth, iw: innerWidth };
  }, sel);
  for (const [viewport, lang, theme] of [[DESKTOP, 'en', 'light'], [DESKTOP, 'de', 'dark'], [DEV(1024, 768), 'en', 'dark'], [DEV(768, 1024), 'de', 'light'], [DEV(390, 844), 'en', 'light'], [DEV(390, 844), 'de', 'dark']]) {
    const tag = viewport.width + '-' + lang + '-' + theme;
    S.resetDrafts();
    const d = await e2Draft('restaurant', lang);
    const { page, log } = await open('studio.html?slug=' + d.slug, { lang, theme, viewport });
    const html = await until(async () => { const h = await canvasHtml(page); return taggedIds(h).length ? h : null; }, tag + ' preview tags');
    assert.ok(html.includes('<span class="st-ex-tag">' + LABEL[lang] + '</span>'), tag + ': preview tag');
    if (viewport.width >= 768) {
      await showSections(page);
      await until(async () => (await badges(page)).length || null, tag + ' badges');
      const b = await look(page, '#st-outline .st-ex-badge');
      assert.ok(b.text === LABEL[lang] && ratio(b.fg, b.bg) >= 4.5, tag + ': badge ' + JSON.stringify(b) + ' ' + ratio(b.fg, b.bg));
      await shot(page, 'e3-sections-' + tag + '.png');
      await selectSection(page, 's_obhero01');
      if (await page.$eval('#st-open-right', (x) => !!x.offsetParent).catch(() => false)) await page.$eval('#st-open-right', (x) => x.click());
      await until(() => page.$eval('#st-right', (p) => { const r = p.getBoundingClientRect(); return getComputedStyle(p).visibility !== 'hidden' && r.left >= 0 && r.right <= innerWidth + 0.5; }), tag + ' editor open');
      await openContent(page);
      await sleep(350);
      const g = await look(page, '#st-fields .st-guide[data-kind="demo"]'), c = await look(page, '#st-fields .st-ex-chip');
      assert.ok(g && g.text === DEMO_NOTE[lang] && ratio(g.fg, g.bg) >= 4.5, tag + ': note ' + JSON.stringify(g) + ' ' + (g && ratio(g.fg, g.bg)));
      assert.ok(c && c.text === LABEL[lang] && ratio(c.fg, c.bg) >= 4.5, tag + ': chip ' + JSON.stringify(c) + ' ' + (c && ratio(c.fg, c.bg)));
      await shot(page, 'e3-editor-' + tag + '.png');
    } else await shot(page, 'e3-phone-' + tag + '.png');
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw[0] <= sw[1], tag + ': no sideways scroll ' + sw);
    assert.deepEqual(log.errors, [], tag);
    await page.close();
  }
});

(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';   // the template photos' account; the helper sets test-cloud
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioDemoFields.browser');
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

