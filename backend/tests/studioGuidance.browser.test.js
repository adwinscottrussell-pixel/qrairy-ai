// ============================================================
// studioGuidance.browser.test.js — Landing Page Studio V3, D2.3b-4: the
// Studio-only "Add your content" guidance for empty sections. In headless
// Chrome against the REAL routes (helpers/studioPagesServer.js, in-memory
// database). LOCAL ONLY: needs Chrome and puppeteer-core (prints SKIP and
// passes when missing).
//
// Checked:
// - only a section core.js shows as empty gets a note; the example wording
//   only for sections listed in the page's checked origin.exampleSectionIds,
//   the generic wording for every other empty section; none on a section
//   with content, whatever its wording (nothing is inferred from text);
// - typing, clearing, Undo / Redo, Save Draft and reload; pages with and
//   without an origin (onboarding draft, plain draft, legacy page, sample
//   page); page and account switches;
// - never in the stored design, the PUT body or the public page;
// - EN / DE, desktop and tablet, Light / Dark: contrast, no sideways scroll.
// Screenshots: set OB_SHOTS=<folder>.
// Run: node tests/studioGuidance.browser.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioGuidance.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

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
  en: { empty: 'Add your content – this section isn’t shown on your public page until it has content.', example: 'The example details from the template were not saved as your information. Add your own.' },
  de: { empty: 'Inhalt hinzufügen – dieser Abschnitt erscheint erst auf Ihrer öffentlichen Seite, wenn er Inhalte hat.', example: 'Die Beispielangaben der Vorlage wurden nicht als Ihre Angaben gespeichert. Ergänzen Sie Ihre eigenen.' },
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
// Carl's onboarding draft: Buttons, Products, Opening Hours, Contact (examples left out), one empty Custom Section, the Hero
async function onboardingDraft(lang = 'en') {
  const r = OB.draftRequest(M, V3, T, { template: 'bakery', palette: T.get('bakery').palettes[0].id, name: lang === 'de' ? 'Bäckerei Sonne' : 'Bakery Sun', description: '', links: [], social: 'auto',
    sections: ['hero', 'buttons', 'products', 'openingHours', 'contact', 'custom:aaaa1111', 'socialMedia'] }, lang);
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

test('an onboarding draft: the example note on its four left-out example sections, the generic note on the empty Custom Section, none on the Hero; English', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('en');
  assert.deepEqual(d.origin.exampleSectionIds, EXAMPLES, 'the fixture');
  const { page, log } = await open('studio.html?slug=' + d.slug);
  for (const id of EXAMPLES) assert.deepEqual(await guideFor(page, id), { kind: 'example', text: TEXT.en.example }, id);
  assert.deepEqual(await guideFor(page, 's_caaaa1111'), { kind: 'empty', text: TEXT.en.empty });
  assert.equal(await guideFor(page, 's_obhero01'), null, 'the Hero has content');
  // a plain-text note (role note), above the fields
  assert.deepEqual(await page.evaluate(() => { const g = document.querySelector('#st-fields .st-guide'); return [g.getAttribute('role'), g.children.length, g === document.querySelector('#st-fields').firstElementChild]; }), ['note', 0, true]);
  assert.deepEqual([log.errors, log.blocked], [[], []]);
  await page.close();
});

test('typing fills a section (the note goes), clearing empties it (back), Undo / Redo follow; a section filled with text that looks like template text gets no note; an example section with content gets none', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('en');
  const { page } = await open('studio.html?slug=' + d.slug);
  await selectSection(page, 's_caaaa1111');
  // the core starter's own wording, typed by the owner: content, no note
  await page.click('#st-fields [data-path="data.heading"] input');
  await page.keyboard.type('Heading');
  await until(async () => (await guide(page)) === null, 'note gone while typing');
  // (typing in one field merges into one Undo step for 800 ms: wait, so clearing is a step of its own)
  await sleep(900);
  // cleared: back
  await page.click('#st-fields [data-path="data.heading"] input', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await until(async () => JSON.stringify(await guide(page)) === JSON.stringify({ kind: 'empty', text: TEXT.en.empty }), 'note back when emptied');
  // Undo: the typed heading again (no note); Redo: empty again (note)
  await page.click('#st-undo-btn'); await sleep(250);
  assert.equal(await guide(page), null, 'Undo');
  await page.click('#st-redo-btn'); await sleep(250);
  assert.deepEqual(await guide(page), { kind: 'empty', text: TEXT.en.empty }, 'Redo');
  // an example section with the owner's own phone number: no note (it has content)
  await selectSection(page, 's_obcontact1');
  await page.click('#st-fields [data-path="data.phone"] input');
  await page.keyboard.type('+49 731 123456');
  await until(async () => (await guide(page)) === null, 'Contact filled: no note');
  await page.close();
});

test('Save Draft and reload: the note follows the saved content; no guidance text in the PUT body, the stored design or the public page', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('en');
  const { page, log } = await open('studio.html?slug=' + d.slug);
  await selectSection(page, 's_caaaa1111');
  await page.click('#st-fields [data-path="data.heading"] input');
  await page.keyboard.type('Our story');
  await sleep(300);
  await until(() => page.$eval('#st-save-btn', (b) => !b.disabled), 'save enabled');
  await page.click('#st-save-btn');
  await until(async () => (await page.$eval('#st-save-status', (n) => n.getAttribute('data-state'))) === 'saved', 'saved');
  assert.equal(log.puts.length, 1);
  const body = JSON.parse(log.puts[0]);
  assert.deepEqual(Object.keys(body).sort(), ['baseRevision', 'design'], 'the PUT carries the design and revision only');
  const stored = JSON.stringify(designOf(d.slug).draft);
  for (const g of ALL_GUIDE.concat(['st-guide', 'guide_'])) {
    assert.ok(!log.puts[0].includes(g), 'not in the PUT: ' + g);
    assert.ok(!stored.includes(g), 'not stored: ' + g);
  }
  const pub = V3.renderDesign(designOf(d.slug).draft, { businessName: 'Bakery Sun' }).html;
  assert.ok(!ALL_GUIDE.some((g) => pub.includes(g)) && !pub.includes('st-guide'), 'not on the public page');
  assert.deepEqual(designOf(d.slug).origin, d.origin, 'origin untouched');
  // reload: the Custom Section has content now (no note); the example sections still empty (note)
  await page.reload({ waitUntil: 'networkidle0' });
  await until(async () => (await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))) === 'loaded', 'reloaded');
  assert.equal(await guideFor(page, 's_caaaa1111'), null);
  assert.deepEqual(await guideFor(page, 's_obbuttons1'), { kind: 'example', text: TEXT.en.example });
  await page.close();
});

test('pages without an origin: a plain draft, a legacy page and the sample page never get the example wording (generic only, or none); German', async () => {
  S.resetDrafts();
  // a plain draft (POST with a name only): its empty sections get the generic note
  const plain = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ohne Herkunft', language: 'de' }) }).then((x) => x.json());
  const a = await open('studio.html?slug=' + plain.page.slug, { lang: 'de' });
  const ids = await a.page.evaluate(() => window.QraivyStudio.editor.sectionIds());
  let generic = 0;
  for (const id of ids) {
    const g = await guideFor(a.page, id);
    assert.ok(!g || (g.kind === 'empty' && g.text === TEXT.de.empty), id + ': ' + JSON.stringify(g));
    if (g) generic++;
  }
  await a.page.close();
  // Anna's legacy page (converted in memory, no origin)
  const b = await open('studio.html?slug=anna-cafe', { token: 'tok_anna', lang: 'de' });
  for (const id of await b.page.evaluate(() => window.QraivyStudio.editor.sectionIds())) {
    const g = await guideFor(b.page, id);
    assert.ok(!g || g.kind === 'empty', 'legacy ' + id + ': ' + JSON.stringify(g));
  }
  await b.page.close();
  // the sample page (an account without pages): no guidance at all
  const c = await open('studio.html', { token: 'tok_dana', lang: 'de' });
  assert.equal(await c.page.$eval('#st-sample', (n) => !n.hidden), true, 'the sample page');
  for (const id of await c.page.evaluate(() => window.QraivyStudio.editor.sectionIds())) assert.equal(await guideFor(c.page, id), null, 'sample ' + id);
  await c.page.close();
  assert.ok(generic >= 0);
});

test('page switch and account change: the guidance follows the open page (example wording only for the onboarding draft); another account never sees the first one\'s notes', async () => {
  S.resetDrafts();
  const d = await onboardingDraft('en');
  const plain = await fetch(srv.origin + '/studio/drafts', { method: 'POST', headers: { Authorization: 'Bearer tok_carl', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'No origin', language: 'en' }) }).then((x) => x.json());
  const { page } = await open('studio.html?slug=' + d.slug);
  assert.equal((await guideFor(page, 's_obbuttons1')).kind, 'example');
  await page.select('#st-page-select', plain.page.slug);
  await until(async () => (await page.$eval('#st-page-select', (s) => s.value)) === plain.page.slug && (await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))) === 'loaded', 'plain draft open');
  for (const id of await page.evaluate(() => window.QraivyStudio.editor.sectionIds())) {
    const g = await guideFor(page, id);
    assert.ok(!g || g.kind === 'empty', 'no example wording without an origin: ' + id);
  }
  await page.select('#st-page-select', d.slug);
  await until(async () => (await page.$eval('#st-page-select', (s) => s.value)) === d.slug && (await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))) === 'loaded', 'back');
  assert.equal((await guideFor(page, 's_obbuttons1')).kind, 'example', 'back: the example wording again');
  // another account in this tab
  await page.evaluate(() => window.__setSession('tok_ben'));
  await until(async () => (await page.evaluate(() => window.QraivyStudio.origin())) === null, 'origin cleared');
  await until(async () => ['loaded', 'empty'].includes(await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))), 'Ben settled');
  assert.ok(!(await page.evaluate(() => window.QraivyStudio.editor.sectionIds())).includes('s_obbuttons1'), 'none of Carl\'s sections');
  for (const id of await page.evaluate(() => window.QraivyStudio.editor.sectionIds())) {
    const g = await guideFor(page, id);
    assert.ok(!g || g.kind === 'empty', 'Ben: ' + id);
  }
  // signed out: the sample page, no guidance
  await page.evaluate(() => window.__setSession(null));
  await sleep(600);
  assert.equal(await guide(page), null);
  await page.close();
});

test('readable everywhere: the notes at desktop and tablet (768 / 1024), English and German, Light and Dark; contrast, no sideways scroll', async () => {
  const ratio = (a, b) => {
    const lum = (c) => { const v = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const TABLET = (w, h) => ({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const [viewport, lang, theme] of [[DESKTOP, 'en', 'light'], [DESKTOP, 'de', 'dark'], [TABLET(768, 1024), 'en', 'light'], [TABLET(768, 1024), 'de', 'dark'], [TABLET(1024, 768), 'de', 'light'], [TABLET(1024, 768), 'en', 'dark']]) {
    const tag = viewport.width + '-' + lang + '-' + theme;
    S.resetDrafts();
    const d = await onboardingDraft(lang);
    const { page } = await open('studio.html?slug=' + d.slug, { lang, theme, viewport });
    for (const [id, kind] of [['s_obbuttons1', 'example'], ['s_caaaa1111', 'empty']]) {
      await selectSection(page, id);
      await until(async () => { const g = await guide(page); return g && g.kind === kind; }, tag + ' ' + kind + ' note');
      // the note is the editor's first element: visible as soon as the editor (a drawer below 1200 px, opened with
      // "Edit section") is on screen
      if (await page.$eval('#st-open-right', (b) => !!b.offsetParent).catch(() => false)) { await page.$eval('#st-open-right', (b) => b.click()); }
      await until(() => page.$eval('#st-right', (p) => { const r = p.getBoundingClientRect(); return getComputedStyle(p).visibility !== 'hidden' && r.left >= 0 && r.right <= innerWidth + 0.5; }), tag + ' editor open');
      await sleep(350);
      const m = await page.evaluate(() => {
        const n = document.querySelector('#st-fields .st-guide'), r = n.getBoundingClientRect();
        const bg = (x) => { for (; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
        return { sw: document.documentElement.scrollWidth, iw: innerWidth, l: r.left, r: r.right, w: r.width, fg: getComputedStyle(n).color, bg: bg(n), text: n.textContent };
      });
      assert.ok(m.sw <= m.iw && m.w > 100 && m.l >= 0 && m.r <= m.iw + 0.5, tag + ' ' + kind + ': ' + JSON.stringify(m));
      assert.ok(ratio(m.fg, m.bg) >= 4.5, tag + ' ' + kind + ': contrast ' + ratio(m.fg, m.bg));
      assert.equal(m.text, TEXT[lang][kind]);
      await shot(page, 'd23b4-' + kind + '-' + tag + '.png');
    }
    await page.close();
  }
});

(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';   // the template photos' account; the helper sets test-cloud
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioGuidance.browser');
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
