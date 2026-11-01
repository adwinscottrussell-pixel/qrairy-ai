// ============================================================
// studioOnboarding.browser.test.js — Landing Page Studio V3 onboarding,
// Phases O0 and O1 (the wizard frame, Step 1, Step 2), in headless Chrome (LOCAL ONLY:
// needs Chrome and puppeteer-core; prints SKIP and passes when missing).
//
// The pages are served from exactly the Studio-files-only upload
// (backend/staging/studio-preview-export.js, built here from the working
// tree) on intercepted addresses. Nothing reaches the network: requests to
// any API are answered locally AND recorded (the onboarding must send
// none); a stand-in Clerk gives the sign-in states. Checked:
// - https://qraivy-studio-v3-staging.vercel.app: signed out (Sign in /
//   Create account), email not verified (notice, no wizard), verified (the
//   wizard); Step 1: Instagram and Website disabled, Start from Scratch ->
//   Step 2; Step 2 (O1): the form, its checks and errors, links, the live
//   preview, the logo "Coming soon", progress kept per user across a reload
//   and cleared on sign-out; Steps 3-4 placeholders; Back / Next; "Step n
//   of 4"; English and German; desktop and phone (no sideways scroll);
// - every other address (production, the other Studio previews, the
//   per-deployment address): the notice only, no sign-in loaded, no request;
// - no API request at all, no draft, no billing;
// - the Studio's "Create your first page" on the isolated address only.
// Screenshots: set OB_SHOTS=<folder>.
// Run: node tests/studioOnboarding.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioOnboarding.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const { buildUpload } = require('../staging/studio-preview-export');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const UPLOAD = buildUpload({
  list: (dir) => fs.readdirSync(path.join(PUB, dir), { recursive: true }).map((f) => dir + String(f).replace(/\\/g, '/')).filter((f) => fs.statSync(path.join(PUB, f)).isFile()),
  read: (name) => fs.readFileSync(path.join(PUB, name)),
});
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };
const V3 = 'qraivy-studio-v3-staging.vercel.app';
const API_HOSTS = ['studio-v3-api-production.up.railway.app', 'qraivy-deals-api-deals-preview.up.railway.app', 'api.qraivy.com'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const SHOTS = process.env.OB_SHOTS || '';
const DESKTOP = { width: 1440, height: 900 }, PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
const pageErrors = [];   // any script error on any page fails the run

// The page on `host`. clerk: 'none' | 'signedout' | 'unverified' | 'verified'
async function open(host, file, { clerk = 'verified', lang = 'en', viewport = DESKTOP, pages = '{"pages":[]}' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((l, mode) => {
    try { localStorage.setItem('qraivy_lang', l); localStorage.setItem('qraivy.studio.theme', 'light'); } catch (e) {}
    window.__calls = [];
    if (mode === 'none') return;
    const listeners = [];
    const status = mode === 'verified' ? 'verified' : 'unverified';
    // the user id: user_test_A unless the test set another one for this tab (a second account)
    let uid = 'user_test_A';
    try { uid = sessionStorage.getItem('__test_uid') || uid; } catch (e) {}
    const user = mode === 'signedout' ? null : { id: uid, primaryEmailAddress: { verification: { status } },
      reload: async () => { window.__calls.push('reload'); if (window.__verifyOnReload) user.primaryEmailAddress.verification.status = 'verified'; } };
    window.Clerk = { loaded: true, load: async () => { window.__calls.push('load'); }, user, session: user ? { id: 'sess_x', getToken: async () => { window.__calls.push('getToken'); return 'tok'; } } : null,
      addListener: (fn) => listeners.push(fn), openSignIn: () => window.__calls.push('openSignIn'), openSignUp: () => window.__calls.push('openSignUp'),
      openUserProfile: () => window.__calls.push('openUserProfile'), signOut: async () => { window.__calls.push('signOut'); window.Clerk.user = null; window.Clerk.session = null; } };
  }, lang, clerk);
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  await page.setRequestInterception(true);
  const api = [], external = [], missing = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:') return r.continue();
    if (u.host === host) {
      const name = decodeURIComponent(u.pathname).replace(/^\//, '') || 'studio.html';
      if (!UPLOAD.has(name)) { missing.push(name); return r.respond({ status: 404, body: '' }); }
      return r.respond({ status: 200, contentType: TYPES[path.extname(name)] || 'application/octet-stream', body: UPLOAD.get(name) });
    }
    if (API_HOSTS.includes(u.host)) {
      api.push(r.method() + ' ' + u.host + u.pathname);
      const cors = { 'access-control-allow-origin': 'https://' + host, 'access-control-allow-headers': 'authorization,accept,content-type', 'access-control-allow-methods': 'GET,POST,PUT' };
      if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors, body: '' });
      if (u.pathname === '/studio/pages') return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: pages });
      return r.respond({ status: 401, contentType: 'application/json', headers: cors, body: '{"error":"Unauthorized."}' });
    }
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    external.push(u.host + u.pathname);
    return r.abort();
  });
  await page.goto('https://' + host + '/' + file, { waitUntil: 'networkidle0' });
  await sleep(300);
  return { page, api, external, missing };
}
const visible = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); if (!n) return false; const r = n.getBoundingClientRect(); return !n.closest('[hidden]') && r.width > 0 && r.height > 0; }, sel);
const text = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? n.textContent.trim() : null; }, sel);
const calls = (page) => page.evaluate(() => window.__calls.slice());
// the header logo: loaded from the upload, square as the file (1254 x 1254), fully inside the header
const logo = (page) => page.$eval('.ob-brand__logo', (n) => { const r = n.getBoundingClientRect(), h = document.querySelector('.ob-top').getBoundingClientRect(); return { loaded: n.complete && n.naturalWidth === 1254 && n.naturalHeight === 1254, w: r.width, h: r.height, inside: r.top >= h.top && r.bottom <= h.bottom && r.left >= 0, alt: n.alt }; });
// fullPage: false for the Studio (a full-page capture resizes the window across the sidebar breakpoints)
async function shot(page, name, fullPage = true) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage }); } }
const onboarding = (opts) => open(V3, 'studio-onboarding.html', opts);

test('signed out: Sign in and Create account (Clerk\'s own), no wizard, no request', async () => {
  const { page, api, external, missing } = await onboarding({ clerk: 'signedout' });
  assert.equal(await visible(page, '#ob-gate'), true);
  assert.equal(await visible(page, '#ob-wizard'), false);
  assert.equal(await text(page, '#ob-gate-title'), 'Create your landing page');
  assert.match(await text(page, '#ob-gate-info-text'), /14-day trial only starts when you choose to publish/);
  assert.equal(await visible(page, '#ob-signin'), true);
  assert.equal(await visible(page, '#ob-signup'), true);
  await page.click('#ob-signup');
  await page.click('#ob-signin');
  assert.deepEqual((await calls(page)).filter((c) => c !== 'load'), ['openSignUp', 'openSignIn']);
  assert.deepEqual(api, []); assert.deepEqual(external, []); assert.deepEqual(missing, []);
  await shot(page, 'onboarding-signed-out-desktop-en.png');
  await page.close();
});

test('email not verified (German): the notice, no wizard; "I have verified it" checks again and then opens the wizard', async () => {
  const { page, api } = await onboarding({ clerk: 'unverified', lang: 'de' });
  assert.equal(await visible(page, '#ob-wizard'), false, 'no page building without a verified email');
  assert.equal(await text(page, '#ob-gate-title'), 'Bitte bestätigen Sie Ihre E-Mail-Adresse');
  assert.equal(await visible(page, '#ob-verify'), true);
  await page.click('#ob-verify');
  await page.click('#ob-recheck'); await sleep(100);
  assert.equal(await visible(page, '#ob-wizard'), false, 'still not verified');
  await page.evaluate(() => { window.__verifyOnReload = true; });
  await page.click('#ob-recheck'); await sleep(100);
  assert.equal(await visible(page, '#ob-wizard'), true, 'verified now: the wizard');
  assert.equal(await text(page, '#ob-progress-count'), 'Schritt 1 von 4');
  assert.deepEqual((await calls(page)).filter((c) => c !== 'load'), ['openUserProfile', 'reload', 'reload']);
  assert.deepEqual(api, []);
  await page.close();
});

test('desktop, English: Step 1 of 4; Instagram and Website disabled; Start from Scratch -> Step 2; Next needs the name; placeholders; Back / Next', async () => {
  const { page, api, external, missing } = await onboarding();
  assert.equal(await visible(page, '#ob-wizard'), true);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 1 of 4');
  assert.equal(await page.$eval('.ob-steps__item[data-step="0"]', (n) => n.getAttribute('aria-current')), 'step');
  assert.equal(await visible(page, '.ob-steps'), true, 'the four step labels on desktop');
  const opts = await page.$$eval('.ob-option', (ns) => ns.map((n) => ({ id: n.dataset.option, disabled: n.disabled, badge: n.querySelector('.ob-badge').textContent, title: n.querySelector('.ob-option__title').textContent, text: n.querySelector('.ob-option__text').textContent })));
  assert.deepEqual(opts, [
    { id: 'instagram', disabled: true, badge: 'Coming soon', title: 'Instagram', text: 'Start with your Instagram profile.' },
    { id: 'website', disabled: true, badge: 'Coming soon', title: 'Existing Website', text: 'Bring your existing website into QRAIVY.' },
    { id: 'scratch', disabled: false, badge: 'Available', title: 'Start from Scratch', text: 'Build your landing page your way.' },
  ]);
  const tops = await page.$$eval('.ob-card', (ns) => ns.map((n) => Math.round(n.getBoundingClientRect().top)));
  assert.ok(tops[0] === tops[1] && tops[1] === tops[2], 'three cards side by side on desktop');
  const lg = await logo(page);
  assert.ok(lg.loaded && lg.inside && lg.alt === 'QRAIVY' && lg.h === 44 && Math.abs(lg.w - lg.h) < 0.5, 'desktop logo: ' + JSON.stringify(lg));
  assert.equal(await page.$eval('#ob-next', (n) => n.disabled), true, 'Next needs a choice');
  assert.equal(await visible(page, '#ob-back'), false, 'no Back on Step 1');
  await shot(page, 'onboarding-step1-desktop-en.png');
  // the disabled cards cannot be chosen (clicked through the DOM too)
  await page.evaluate(() => { document.querySelector('[data-option="instagram"]').click(); document.querySelector('[data-option="website"]').click(); });
  assert.deepEqual(await page.$$eval('.ob-option', (ns) => ns.map((n) => n.getAttribute('aria-checked'))), ['false', 'false', 'false']);
  assert.equal(await page.$eval('#ob-next', (n) => n.disabled), true);
  await page.click('[data-option="scratch"]');
  assert.deepEqual(await page.$$eval('.ob-option', (ns) => ns.map((n) => n.getAttribute('aria-checked'))), ['false', 'false', 'true']);
  assert.equal(await page.$eval('#ob-next', (n) => n.disabled), false);
  await shot(page, 'onboarding-step1-selected-desktop-en.png');
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 4');
  assert.equal(await visible(page, '#ob-step-1'), true);
  assert.equal(await visible(page, '#ob-step-0'), false);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.textContent), 'Business information', 'focus on the step heading');
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 4', 'no name: no Next');
  await page.type('#ob-name', 'Café Sonne');
  await page.click('#ob-next'); assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 4');
  await page.click('#ob-next'); assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 4');
  assert.equal(await visible(page, '#ob-next'), false);
  assert.equal(await page.$eval('#ob-finish', (n) => n.disabled), true, 'no draft is created');
  assert.match(await text(page, '#ob-step-3'), /No draft is created yet/);
  await page.click('#ob-back'); await page.click('#ob-back'); await page.click('#ob-back');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 1 of 4');
  assert.equal(await page.$eval('[data-option="scratch"]', (n) => n.getAttribute('aria-checked')), 'true', 'Back keeps the choice');
  assert.deepEqual(api, [], 'no API request (no draft, no save, no billing)');
  assert.deepEqual(external, []); assert.deepEqual(missing, []);
  assert.ok(!(await calls(page)).includes('getToken'), 'no session token is even asked for');
  await page.close();
});

test('phone, German: one column, no sideways scroll, Back / Next reachable; language switch EN <-> DE', async () => {
  const { page, api } = await onboarding({ lang: 'de', viewport: PHONE });
  assert.equal(await text(page, '#ob-progress-count'), 'Schritt 1 von 4');
  assert.equal(await text(page, '#ob-start-title'), 'Wie möchten Sie starten?');
  assert.deepEqual(await page.$$eval('.ob-option .ob-badge', (ns) => ns.map((n) => n.textContent)), ['Demnächst', 'Demnächst', 'Verfügbar']);
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.ob-card')].map((n) => n.getBoundingClientRect());
    return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, stacked: cards[0].bottom <= cards[1].top && cards[1].bottom <= cards[2].top, wide: cards.every((r) => r.width > 300) };
  });
  assert.ok(layout.sw <= layout.iw, 'no sideways scroll: ' + JSON.stringify(layout));
  assert.ok(layout.stacked && layout.wide, 'cards stacked, full width');
  const lg = await logo(page);
  assert.ok(lg.loaded && lg.inside && lg.h === 40 && Math.abs(lg.w - lg.h) < 0.5, 'phone logo: ' + JSON.stringify(lg));
  assert.equal(await visible(page, '.ob-steps'), false, 'phone: the compact progress (count and bar)');
  await shot(page, 'onboarding-step1-phone-de.png');
  await page.click('[data-option="scratch"]');
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Schritt 2 von 4');
  await page.click('.ob-lang__btn[data-lang="en"]');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 4');
  assert.equal(await page.evaluate(() => localStorage.getItem('qraivy_lang')), 'en', 'the shared language setting');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  await page.click('#ob-back');
  await page.click('[data-option="scratch"]');
  await shot(page, 'onboarding-step1-phone-en.png');
  assert.deepEqual(api, []);
  await page.close();
});

test('O0.1 previews: real QRAIVY pages in sandboxed phone frames; AI label on the photos; a click on the phone selects the card', async () => {
  const { page, api, external, missing } = await onboarding();
  await page.waitForFunction(() => [...document.querySelectorAll('.ob-phone__frame[data-preview]')].every((f) => f.srcdoc.length > 1000), { timeout: 5000 });
  // the photos become inline images with the AI label once loaded
  await page.waitForFunction(() => document.querySelector('[data-preview="instagram"]').srcdoc.includes('AI · KI-generiert'), { timeout: 8000 });
  const fr = await page.$$eval('.ob-phone__frame[data-preview]', (ns) => ns.map((f) => ({ id: f.dataset.preview, sandbox: f.getAttribute('sandbox'), tab: f.tabIndex, hidden: !!f.closest('[aria-hidden="true"]'), inButton: !!f.closest('button'),
    musterbaeckerei: f.srcdoc.includes('Musterbäckerei'), ai: (f.srcdoc.match(/AI · KI-generiert/g) || []).length, imgs: (f.srcdoc.match(/<img\b/g) || []).length,
    remote: /src="https?:/.test(f.srcdoc), script: /<script/i.test(f.srcdoc), scratch: f.srcdoc.includes('Your business'), w: Math.round(f.getBoundingClientRect().width) })));
  for (const f of fr) {
    assert.equal(f.sandbox, '', f.id + ': sandboxed with no permissions');
    assert.ok(f.tab === -1 && f.hidden && !f.inButton, f.id + ': decoration only');
    assert.ok(!f.remote && !f.script, f.id + ': no remote image, no script');
  }
  const by = Object.fromEntries(fr.map((f) => [f.id, f]));
  assert.ok(by.instagram.musterbaeckerei && by.website.musterbaeckerei, 'the examples are the Studio demo');
  assert.equal(by.instagram.ai, by.instagram.imgs, 'every photo in the Instagram example carries the AI label');
  assert.equal(by.website.ai, by.website.imgs, 'and in the Website example');
  assert.ok(by.scratch.scratch && by.scratch.imgs === 0, 'Start from Scratch: the starter page, no photo');
  assert.ok(Math.abs(fr[0].w - 132) <= 1, 'desktop phone screen 132 px wide: ' + fr[0].w);
  // a click on the phone (the card's picture) selects the card; on a Coming soon card nothing happens
  const at = async (id) => { const b = await page.$eval('[data-card="' + id + '"] .ob-phone', (n) => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await page.mouse.click(b.x, b.y); };
  await at('instagram');
  assert.deepEqual(await page.$$eval('.ob-option', (ns) => ns.map((n) => n.getAttribute('aria-checked'))), ['false', 'false', 'false']);
  await at('scratch');
  assert.deepEqual(await page.$$eval('.ob-option', (ns) => ns.map((n) => n.getAttribute('aria-checked'))), ['false', 'false', 'true']);
  // keyboard: the three frames are never focused; Tab reaches Start from Scratch
  const focusable = await page.$$eval('#ob-options [tabindex], #ob-options button, #ob-options iframe', (ns) => ns.filter((n) => n.tabIndex >= 0 && !n.disabled).map((n) => n.dataset.option || n.tagName));
  assert.deepEqual(focusable, ['scratch']);
  // German: the scratch page follows the language
  await page.click('.ob-lang__btn[data-lang="de"]');
  await page.waitForFunction(() => document.querySelector('[data-preview="scratch"]').srcdoc.includes('Ihr Unternehmen'), { timeout: 3000 });
  assert.deepEqual(await page.$$eval('.ob-card__example', (ns) => ns.map((n) => n.textContent)), ['Beispiel', 'Beispiel']);
  assert.deepEqual(api, [], 'no API request'); assert.deepEqual(external, [], 'nothing from elsewhere (photos are local, inline)'); assert.deepEqual(missing, []);
  await page.close();
});

// ── Step 2 (O1): business information ──
// to Step 2 (Start from Scratch, Next)
async function toStep2(page) { await page.click('[data-option="scratch"]'); await page.click('#ob-next'); }
const live = (page) => page.$eval('#ob-live-frame', (f) => f.srcdoc);
const waitLive = (page, s) => page.waitForFunction((x) => document.getElementById('ob-live-frame').srcdoc.includes(x), { timeout: 3000 }, s);
const field = (page, id) => page.$eval('#' + id, (n) => ({ invalid: n.getAttribute('aria-invalid'), error: (document.getElementById(n.getAttribute('aria-describedby').split(' ').find((x) => /-error(-|$)/.test(x))) || {}).textContent || '', focused: document.activeElement === n }));
const rowKeys = (page) => page.$$eval('#ob-links .ob-link-row', (ns) => ns.map((n) => n.dataset.row));
// a screenshot of the whole page with every frame painted: the viewport as tall as the page (a full-page capture leaves sandboxed frames below the fold blank)
async function tallShot(page, name, viewport) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewport(Object.assign({}, viewport, { height: Math.max(viewport.height, h) }));
  await sleep(250);
  await page.screenshot({ path: path.join(SHOTS, name) });
  await page.setViewport(viewport);
}

test('Step 2, desktop, English: the form left, the live phone right; name required with an error and focus; description; logo disabled "Coming soon"; no request', async () => {
  const { page, api, external, missing } = await onboarding();
  await toStep2(page);
  // layout: two columns, the phone beside the form and staying in view
  const lay = await page.evaluate(() => {
    const f = document.querySelector('.ob-fields').getBoundingClientRect(), l = document.querySelector('.ob-live').getBoundingClientRect();
    return { side: l.left >= f.right, top: Math.abs(l.top - f.top) < 4, sticky: getComputedStyle(document.querySelector('.ob-live')).position, phone: Math.round(document.getElementById('ob-live-frame').getBoundingClientRect().width), sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
  assert.ok(lay.side && lay.top && lay.sticky === 'sticky' && lay.sw <= lay.iw, 'two columns: ' + JSON.stringify(lay));
  assert.ok(Math.abs(lay.phone - 242) <= 1, 'desktop live phone 242 px wide: ' + lay.phone);
  // labels and texts
  assert.equal(await text(page, 'label[for="ob-name"]'), 'Business name required');
  assert.equal(await text(page, 'label[for="ob-description"]'), 'Short description optional');
  assert.equal(await page.$eval('#ob-name', (n) => n.placeholder), 'e.g. Café Sonnenschein');
  assert.equal(await text(page, '#ob-name-count'), '0 / 80');
  assert.equal(await text(page, '#ob-description-count'), '0 / 300');
  assert.equal(await text(page, '.ob-live__label'), 'Live preview');
  // the logo: disabled, "Coming soon", a blue note; no file input
  const logo = await page.$eval('#ob-logo', (n) => ({ disabled: n.disabled, badge: n.closest('.ob-field').querySelector('.ob-badge').textContent, note: document.getElementById('ob-logo-note').textContent }));
  assert.deepEqual(logo, { disabled: true, badge: 'Coming soon', note: 'Logo upload is coming soon. You can add images later in the Studio.' });
  assert.equal(await page.$$eval('input[type="file"]', (ns) => ns.length), 0);
  // the empty preview: the starter page with the placeholder name
  await waitLive(page, 'Your business');
  await tallShot(page, 'onboarding-step2-desktop-en-empty.png', DESKTOP);
  // Next without a name: an error on the field, focus moves there, still Step 2
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 4');
  assert.deepEqual(await field(page, 'ob-name'), { invalid: 'true', error: 'Please enter your business name.', focused: true });
  // typing fixes it; the preview follows (escaped by core.js; the frame stays sandboxed, no script)
  await page.type('#ob-name', 'Café <Sonne>');
  assert.deepEqual(await field(page, 'ob-name'), { invalid: null, error: '', focused: true });
  assert.equal(await text(page, '#ob-name-count'), '12 / 80');
  await waitLive(page, 'Café &lt;Sonne&gt;');
  await page.type('#ob-description', 'Fresh coffee and homemade cakes in the heart of the old town.');
  await waitLive(page, 'homemade cakes');
  const fr = await page.$eval('#ob-live-frame', (f) => ({ sandbox: f.getAttribute('sandbox'), tab: f.tabIndex, hidden: !!f.closest('[aria-hidden="true"]'), script: /<script/i.test(f.srcdoc), raw: f.srcdoc.includes('<Sonne>') }));
  assert.deepEqual(fr, { sandbox: '', tab: -1, hidden: true, script: false, raw: false });
  // too long: an error at once, the counter red, the preview keeps the last valid name
  await page.$eval('#ob-name', (n) => { n.value = 'N'.repeat(81); n.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal((await field(page, 'ob-name')).error, 'The business name can have at most 80 characters.');
  assert.equal(await page.$eval('#ob-name-count', (n) => n.dataset.over), 'true');
  assert.equal(await text(page, '#ob-name-count-sr'), '1 characters too many');
  await sleep(300);
  assert.ok((await live(page)).includes('Café &lt;Sonne&gt;'), 'the preview keeps the last valid name');
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 4', 'too long: no Next');
  await page.$eval('#ob-name', (n) => { n.value = ''; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.type('#ob-name', 'Café Sonnenschein');
  assert.equal(await text(page, '#ob-name-count-sr'), '', 'quiet while far from the limit');
  await tallShot(page, 'onboarding-step2-desktop-en-filled.png', DESKTOP);
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 4');
  await page.click('#ob-back');
  assert.equal(await page.$eval('#ob-name', (n) => n.value), 'Café Sonnenschein', 'Back keeps the answers');
  assert.deepEqual(api, [], 'no API request'); assert.deepEqual(external, []); assert.deepEqual(missing, []);
  assert.ok(!(await calls(page)).includes('getToken'), 'no session token');
  await page.close();
});

test('Step 2 links: the green "+ Add link"; all eight platforms; https:// added; unsafe and wrong-platform addresses refused with an error; Remove; at most 8', async () => {
  const { page, api } = await onboarding();
  await toStep2(page);
  await page.type('#ob-name', 'Café Sonne');
  const add = await page.$eval('#ob-add-link', (n) => ({ bg: getComputedStyle(n).backgroundColor, color: getComputedStyle(n).color, text: n.textContent.trim() }));
  assert.ok(add.text === '+Add link' && add.color === 'rgb(21, 128, 61)', 'green Add link: ' + JSON.stringify(add));
  await page.click('#ob-add-link');
  let keys = await rowKeys(page);
  assert.equal(keys.length, 1);
  assert.equal(await page.evaluate(() => document.activeElement.tagName + ' ' + document.activeElement.value), 'SELECT instagram', 'focus on the new row\'s platform');
  assert.deepEqual(await page.$$eval('#ob-links select option', (ns) => ns.map((n) => n.value)), ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'pinterest', 'whatsapp']);
  assert.equal(await text(page, 'label[for="ob-link-platform-' + keys[0] + '"]'), 'Platform, link 1');
  assert.equal(await page.$eval('#ob-link-url-' + keys[0], (n) => n.placeholder), 'instagram.com/yourbusiness');
  await page.type('#ob-link-url-' + keys[0], 'instagram.com/cafesonne');
  await waitLive(page, 'https://instagram.com/cafesonne');
  // a bad address: the error after leaving the field; Next blocked with focus on it
  await page.click('#ob-add-link');
  keys = await rowKeys(page);
  await page.select('#ob-link-platform-' + keys[1], 'tiktok');
  await page.type('#ob-link-url-' + keys[1], 'javascript:alert(1)');
  await page.focus('#ob-name');
  assert.deepEqual(await field(page, 'ob-link-url-' + keys[1]), { invalid: 'true', error: 'Enter a TikTok address, for example tiktok.com/@yourbusiness', focused: false });
  await sleep(300);
  assert.ok(!(await live(page)).includes('javascript'), 'never in the page');
  await tallShot(page, 'onboarding-step2-desktop-en-errors.png', DESKTOP);
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 4');
  assert.equal((await field(page, 'ob-link-url-' + keys[1])).focused, true, 'focus on the bad link');
  // another platform's address is refused too; the right one is accepted
  await page.$eval('#ob-link-url-' + keys[1], (n) => { n.value = 'instagram.com/x'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.match((await field(page, 'ob-link-url-' + keys[1])).error, /TikTok/);
  await page.$eval('#ob-link-url-' + keys[1], (n) => { n.value = 'https://www.tiktok.com/@cafesonne'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal((await field(page, 'ob-link-url-' + keys[1])).error, '');
  await waitLive(page, 'tiktok.com/@cafesonne');
  // Remove: focus moves to the row that took its place / before it
  await page.click('#ob-links .ob-link-row[data-row="' + keys[0] + '"] .ob-remove');
  assert.deepEqual(await rowKeys(page), [keys[1]]);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-link-platform-' + keys[1]);
  assert.equal(await page.$eval('#ob-links .ob-remove', (n) => n.getAttribute('aria-label')), 'Remove link 1', 'renumbered');
  // up to 8: then "+ Add link" is disabled with a note; empty rows are ignored by Next
  for (let i = 0; i < 7; i++) await page.click('#ob-add-link');
  assert.equal((await rowKeys(page)).length, 8);
  assert.equal(await page.$eval('#ob-add-link', (n) => n.disabled), true);
  assert.equal(await visible(page, '#ob-links-full'), true);
  assert.deepEqual(await page.$$eval('#ob-links select', (ns) => ns.map((n) => n.value)), ['tiktok', 'instagram', 'facebook', 'youtube', 'linkedin', 'x', 'pinterest', 'whatsapp'], 'each new row starts with an unused platform');
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 4', 'empty rows ignored');
  assert.deepEqual(api, []);
  await page.close();
});

test('Step 2, phone, German: one column (form, preview, Back / Next), no sideways scroll; German texts and errors; language switch keeps the answers', async () => {
  const { page, api } = await onboarding({ lang: 'de', viewport: PHONE });
  await toStep2(page);
  await waitLive(page, 'Ihr Unternehmen');
  const lay = await page.evaluate(() => {
    const f = document.querySelector('.ob-fields').getBoundingClientRect(), l = document.querySelector('.ob-live').getBoundingClientRect(), n = document.querySelector('.ob-nav').getBoundingClientRect();
    return { order: f.bottom <= l.top && l.bottom <= n.top, phone: Math.round(document.getElementById('ob-live-frame').getBoundingClientRect().width), sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
  assert.ok(lay.order && lay.sw <= lay.iw, 'one column: ' + JSON.stringify(lay));
  assert.ok(Math.abs(lay.phone - 195) <= 1, 'compact phone 195 px wide: ' + lay.phone);
  assert.equal(await text(page, 'label[for="ob-name"]'), 'Unternehmensname Pflichtfeld');
  assert.equal(await text(page, '#ob-add-link'), '+Link hinzufügen');
  assert.equal(await text(page, '.ob-live__label'), 'Live-Vorschau');
  await tallShot(page, 'onboarding-step2-phone-de-empty.png', PHONE);
  await page.click('#ob-next');
  assert.equal((await field(page, 'ob-name')).error, 'Bitte geben Sie Ihren Unternehmensnamen ein.');
  await tallShot(page, 'onboarding-step2-phone-de-errors.png', PHONE);
  await page.type('#ob-name', 'Bäckerei Sonnenschein');
  await page.type('#ob-description', 'Frisches Brot und Kuchen aus eigener Backstube.');
  await page.click('#ob-add-link');
  const k = (await rowKeys(page))[0];
  await page.type('#ob-link-url-' + k, 'instagram.com/baeckerei');
  await page.click('#ob-add-link');
  const k2 = (await rowKeys(page))[1];
  await page.type('#ob-link-url-' + k2, 'facebook.com/baeckerei');
  await waitLive(page, 'facebook.com/baeckerei');
  assert.ok((await live(page)).includes('Folgen Sie uns'), 'the Social Media section in German');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.ok(sw, 'no sideways scroll with link rows');
  await tallShot(page, 'onboarding-step2-phone-de-filled.png', PHONE);
  // switch to English: the answers stay, the texts and the page follow
  await page.click('.ob-lang__btn[data-lang="en"]');
  assert.equal(await page.$eval('#ob-name', (n) => n.value), 'Bäckerei Sonnenschein');
  assert.equal(await (await rowKeys(page)).length, 2);
  assert.equal(await text(page, 'label[for="ob-name"]'), 'Business name required');
  await waitLive(page, 'Follow us');
  await tallShot(page, 'onboarding-step2-phone-en-filled.png', PHONE);
  assert.deepEqual(api, []);
  await page.close();
});

test('the progress and the four step labels keep one width and place on Steps 1-4 (Step 2 only widens its card); desktop and phone', async () => {
  for (const viewport of [DESKTOP, { width: 1024, height: 800 }, PHONE]) {
    const { page } = await onboarding({ viewport });
    const seen = [];
    for (let step = 0; step < 4; step++) {
      seen.push(await page.evaluate(() => {
        const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width)]; };
        return { progress: r('.ob-progress'), bar: r('.ob-progress__bar'), labels: r('.ob-steps'), card: r('#ob-wizard .ob-card-panel') };
      }));
      if (step === 0) await page.click('[data-option="scratch"]');
      if (step === 1) await page.type('#ob-name', 'Café Sonne');
      if (step < 3) await page.click('#ob-next');
    }
    for (const s of seen) assert.deepEqual([s.progress, s.bar, s.labels], [seen[0].progress, seen[0].bar, seen[0].labels], viewport.width + ': ' + JSON.stringify(seen));
    if (viewport.width >= 960) assert.ok(seen[1].card[1] > seen[0].card[1], 'Step 2 keeps its wider two-column card');
    else assert.deepEqual(seen[1].card, seen[0].card, 'phone: one width');
    await page.close();
  }
});

test('Step 2, desktop, German: texts, link error and the page in German', async () => {
  const { page, api } = await onboarding({ lang: 'de' });
  await toStep2(page);
  assert.equal(await text(page, '#ob-business-title'), 'Unternehmensdaten');
  assert.equal(await text(page, '#ob-logo'), 'Logo hochladen');
  await page.type('#ob-name', 'Bäckerei Sonnenschein');
  await page.type('#ob-description', 'Frisches Brot und Kuchen aus eigener Backstube.');
  await page.click('#ob-add-link');
  await page.type('#ob-link-url-' + (await rowKeys(page))[0], 'instagram.com/baeckerei');
  await page.click('#ob-add-link');
  const k = (await rowKeys(page))[1];
  await page.type('#ob-link-url-' + k, 'http://facebook.com/baeckerei');
  await page.focus('#ob-name');
  assert.equal((await field(page, 'ob-link-url-' + k)).error, 'Geben Sie eine Facebook-Adresse ein, zum Beispiel facebook.com/yourbusiness');
  await waitLive(page, 'Folgen Sie uns');
  await tallShot(page, 'onboarding-step2-desktop-de-errors.png', DESKTOP);
  await page.$eval('#ob-link-url-' + k, (n) => { n.value = 'facebook.com/baeckerei'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await waitLive(page, 'facebook.com/baeckerei');
  await tallShot(page, 'onboarding-step2-desktop-de-filled.png', DESKTOP);
  assert.deepEqual(api, []);
  await page.close();
});

test('Step 2 progress: kept across a reload for the same user; another user sees none; sign-out clears it; only the step and answers are stored', async () => {
  const { page, api } = await onboarding();
  await toStep2(page);
  await page.type('#ob-name', 'Café Sonne');
  await page.type('#ob-description', 'Kaffee');
  await page.click('#ob-add-link');
  await page.type('#ob-link-url-' + (await rowKeys(page))[0], 'instagram.com/sonne');
  const stored = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('qraivy.onboarding')).map((k) => [k, JSON.parse(sessionStorage.getItem(k))]));
  assert.equal(stored.length, 1);
  assert.match(stored[0][0], /^qraivy\.onboarding\.v1:[0-9a-f]{8}$/, 'a per-user key, not the id');
  assert.deepEqual(stored[0][1], { step: 1, choice: 'scratch', answers: { name: 'Café Sonne', description: 'Kaffee', links: [{ platform: 'instagram', url: 'instagram.com/sonne' }] } });
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => /onboarding/.test(k) || /Sonne/.test(localStorage.getItem(k)))), [], 'nothing in localStorage');
  // reload: the same user is back on Step 2 with the answers
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 4');
  assert.equal(await page.$eval('#ob-name', (n) => n.value), 'Café Sonne');
  assert.equal(await page.$eval('#ob-description', (n) => n.value), 'Kaffee');
  assert.equal(await page.$eval('#ob-links input', (n) => n.value), 'instagram.com/sonne');
  await waitLive(page, 'Café Sonne');
  // another account in this tab: none of the first one's answers
  await page.evaluate(() => sessionStorage.setItem('__test_uid', 'user_test_B'));
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 1 of 4', 'another user starts at Step 1');
  await toStep2(page);
  assert.equal(await page.$eval('#ob-name', (n) => n.value), '', 'another user: empty');
  assert.equal((await rowKeys(page)).length, 0);
  await page.type('#ob-name', 'B');
  // sign-out: every kept progress in this tab is gone, the answers too
  await page.click('#ob-signout'); await sleep(100);
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('qraivy.onboarding'))), []);
  assert.equal(await page.$eval('#ob-name', (n) => n.value), '');
  assert.deepEqual(api, []);
  await page.close();
});

// The header (approved design): solid black, white Sign out and Back to Studio, EN/DE with the chosen language
// a white pill; one header for all four steps and the sign-in screens; readable contrast; a visible focus ring.
async function header(page) {
  return page.evaluate(() => {
    const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const top = cs('.ob-top').backgroundColor, track = cs('.ob-lang').backgroundColor;
    const on = document.querySelector('.ob-lang__btn[aria-pressed="true"]'), off = document.querySelector('.ob-lang__btn[aria-pressed="false"]');
    const exit = document.getElementById('ob-exit'), out = document.getElementById('ob-signout');
    const r = document.querySelector('.ob-top').getBoundingClientRect();
    return { top, count: document.querySelectorAll('header').length, exitColor: getComputedStyle(exit).color, outColor: getComputedStyle(out).color, outShown: !out.hidden,
      onBg: getComputedStyle(on).backgroundColor, onColor: getComputedStyle(on).color, onRatio: ratio(getComputedStyle(on).color, getComputedStyle(on).backgroundColor),
      offRatio: ratio(getComputedStyle(off).color, track), linkRatio: ratio(getComputedStyle(exit).color, top), logo: document.querySelector('.ob-brand__logo').getBoundingClientRect().left < 60,
      h: Math.round(r.height), sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
}
test('header: solid black, white links, EN/DE readable with the chosen language clear; the same on every step and the sign-in screen; desktop and phone; focus ring', async () => {
  for (const viewport of [DESKTOP, PHONE]) {
    const { page, api } = await onboarding({ viewport });
    const seen = [];
    for (let step = 0; step < 4; step++) {
      const h = await header(page);
      assert.equal(h.top, 'rgb(0, 0, 0)', 'black header, step ' + (step + 1));
      assert.ok(h.exitColor === 'rgb(255, 255, 255)' && h.outColor === 'rgb(255, 255, 255)' && h.outShown, 'white Sign out and Back to Studio: ' + JSON.stringify(h));
      assert.ok(h.onBg === 'rgb(255, 255, 255)' && h.onColor === 'rgb(0, 0, 0)', 'the chosen language: white pill, black text');
      assert.ok(h.onRatio >= 7 && h.offRatio >= 4.5 && h.linkRatio >= 7, 'contrast: ' + JSON.stringify(h));
      assert.ok(h.logo && h.count === 1 && h.sw <= h.iw, 'logo left, one header, no sideways scroll');
      seen.push(h.h);
      if (step === 0) await page.click('[data-option="scratch"]');
      if (step === 1) await page.type('#ob-name', 'Café Sonne');
      if (step < 3) await page.click('#ob-next');
    }
    assert.ok(seen.every((x) => x === seen[0]), 'the same header height on all four steps: ' + seen);
    // keyboard: the focus ring on the black header is white and visible
    await page.focus('.ob-lang__btn[data-lang="de"]');
    await page.keyboard.press('Tab'); await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    const ring = await page.evaluate(() => { const a = document.activeElement, c = getComputedStyle(a); return { lang: a.dataset.lang, style: c.outlineStyle, color: c.outlineColor, width: c.outlineWidth }; });
    assert.ok(ring.lang === 'de' && ring.style === 'solid' && ring.color === 'rgb(255, 255, 255)' && ring.width === '3px', 'white focus ring: ' + JSON.stringify(ring));
    await page.keyboard.press('Enter');
    assert.equal(await text(page, '#ob-progress-count'), 'Schritt 4 von 4', 'the language switch still works by keyboard');
    assert.deepEqual(api, []);
    await page.close();
  }
  // the sign-in screen has the same header
  const g = await onboarding({ clerk: 'signedout', viewport: PHONE });
  const gh = await header(g.page);
  assert.ok(gh.top === 'rgb(0, 0, 0)' && gh.exitColor === 'rgb(255, 255, 255)' && !gh.outShown, 'signed out: black header, Back to Studio white, no Sign out');
  await g.page.close();
});

test('every other address: the notice only; no sign-in loaded, no request, no link', async () => {
  for (const host of ['www.qraivy.com', 'studio-preview.qraivy.com', 'qraivy-studio-staging.vercel.app', 'qraivy-studio-v3-staging-8p5n97clr.vercel.app', 'evil-qraivy-studio-v3-staging.vercel.app']) {
    for (const clerk of ['none', 'verified']) {
      const { page, api, external } = await open(host, 'studio-onboarding.html', { clerk });
      assert.equal(await visible(page, '#ob-unavailable'), true, host);
      assert.equal(await visible(page, '#ob-gate'), false, host);
      assert.equal(await visible(page, '#ob-wizard'), false, host);
      assert.deepEqual(await page.$$eval('a[href]', (ns) => ns.filter((n) => !n.closest('[hidden]') && n.offsetParent).map((n) => n.href)), [], host + ': no visible link');
      assert.deepEqual(api, [], host);
      assert.deepEqual(external, [], host + ': nothing loaded from elsewhere (no Clerk)');
      assert.deepEqual(await calls(page), [], host + ': the sign-in is never used');
      if (host === 'www.qraivy.com' && clerk === 'none') await shot(page, 'onboarding-unavailable-production.png');
      await page.close();
    }
  }
});

test('the Studio: "Create your first page" in the empty state on the isolated address only; it opens the onboarding', async () => {
  const v = await open(V3, 'studio.html');
  assert.equal(await visible(v.page, '#st-page-onboard'), true);
  assert.equal(await v.page.$eval('#st-page-onboard', (n) => n.getAttribute('href')), 'studio-onboarding.html');
  assert.equal(await text(v.page, '#st-page-onboard'), 'Create your first page');
  await shot(v.page, 'studio-empty-state-onboarding-link.png', false);
  await Promise.all([v.page.waitForNavigation({ waitUntil: 'networkidle0' }), v.page.click('#st-page-onboard')]);
  assert.equal(new URL(v.page.url()).pathname, '/studio-onboarding.html');
  assert.deepEqual(v.missing, []);
  await v.page.close();
  // with a page of the owner: no entry point
  const own = await open(V3, 'studio.html', { pages: '{"pages":[{"slug":"own-page-abc123","name":"Own","status":"draft","live":false,"kind":"business","hasDraft":true}]}' });
  assert.equal(await visible(own.page, '#st-page-onboard'), false, 'not when the owner has a page');
  await own.page.close();
  for (const host of ['studio-preview.qraivy.com', 'qraivy-studio-staging.vercel.app', 'www.qraivy.com']) {
    const o = await open(host, 'studio.html');
    assert.equal(await o.page.$('#st-page-onboard'), null, host + ': no entry point');
    await o.page.close();
  }
});

(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioOnboarding.browser');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (pageErrors.length) { failed++; console.error('  FAIL script errors on the pages: ' + [...new Set(pageErrors)].join(' | ')); }
  if (failed) process.exitCode = 1;
})();
