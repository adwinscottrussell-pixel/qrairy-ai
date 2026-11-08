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
// T1b: five steps; Step 3 "Choose your design": six template cards (a radio
// group, none chosen, Next waits), palettes, the live phone with the Step 2
// answers and "Example" tags, only the chosen template's photos, keyboard,
// kept across Back / Next / reload, four-step progress migrated, phones 390 /
// 360 / 320 in EN / DE, Light / Dark.
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
// theme: the Studio appearance preference set before each load ('light' by default; null: leave it as it is)
// drafts (D2.2): (body, n) -> { status, body, delay } | 'hang' (never answered) | 'abort' (no answer): the POST /studio/drafts responder; posts: the bodies sent
// puts (D2.3a): (body, n, slug) -> the same, for PUT /studio/pages/<slug>/design; putsSent: { slug, body, auth }
async function open(host, file, { clerk = 'verified', lang = 'en', viewport = DESKTOP, pages = '{"pages":[]}', theme = 'light', drafts = null, puts = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((l, mode, th) => {
    try { localStorage.setItem('qraivy_lang', l); if (th !== null) localStorage.setItem('qraivy.studio.theme', th); } catch (e) {}
    // the appearance when <body> first appears (it must already be set: no flash)
    new MutationObserver((r, o) => { if (document.body) { window.__themeAtBody = document.documentElement.getAttribute('data-ob-theme'); o.disconnect(); } }).observe(document, { childList: true, subtree: true });
    window.__calls = [];
    // Step 3's live frame: the scroll positions it reports
    window.__frameY = [];
    addEventListener('message', (e) => { if (e.data && e.data.type === 'scroll') window.__frameY.push(e.data.y); });
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
  }, lang, clerk, theme);
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  await page.setRequestInterception(true);
  const api = [], external = [], missing = [], posts = [], putsSent = [];
  page.on('request', async (r) => {
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
      if (drafts && u.pathname === '/studio/drafts' && r.method() === 'POST') {
        let body = null;
        try { body = JSON.parse(r.postData() || 'null'); } catch (e) { body = null; }
        posts.push({ body, auth: r.headers().authorization || '', type: r.headers()['content-type'] || '' });
        const a = await drafts(body, posts.length);
        if (a === 'hang') return undefined;
        if (a === 'abort') return r.abort('failed').catch(() => {});
        if (a.delay) await sleep(a.delay);
        return r.respond({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.body || {}) }).catch(() => {});
      }
      const pm = /^\/studio\/pages\/([^/]+)\/design$/.exec(u.pathname);
      if (puts && pm && r.method() === 'PUT') {
        let body = null;
        try { body = JSON.parse(r.postData() || 'null'); } catch (e) { body = null; }
        putsSent.push({ slug: decodeURIComponent(pm[1]), body, auth: r.headers().authorization || '' });
        const a = await puts(body, putsSent.length, decodeURIComponent(pm[1]));
        if (a === 'hang') return undefined;
        if (a === 'abort') return r.abort('failed').catch(() => {});
        if (a.delay) await sleep(a.delay);
        return r.respond({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.body || {}) }).catch(() => {});
      }
      return r.respond({ status: 401, contentType: 'application/json', headers: cors, body: '{"error":"Unauthorized."}' });
    }
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    external.push(u.host + u.pathname);
    return r.abort();
  });
  await page.goto('https://' + host + '/' + file, { waitUntil: 'networkidle0' });
  await sleep(300);
  return { page, api, external, missing, posts, putsSent };
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
  assert.equal(await text(page, '#ob-progress-count'), 'Schritt 1 von 5');
  assert.deepEqual((await calls(page)).filter((c) => c !== 'load'), ['openUserProfile', 'reload', 'reload']);
  assert.deepEqual(api, []);
  await page.close();
});

test('desktop, English: Step 1 of 4; Instagram and Website disabled; Start from Scratch -> Step 2; Next needs the name; placeholders; Back / Next', async () => {
  const { page, api, external, missing } = await onboarding();
  assert.equal(await visible(page, '#ob-wizard'), true);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 1 of 5');
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
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 5');
  assert.equal(await visible(page, '#ob-step-1'), true);
  assert.equal(await visible(page, '#ob-step-0'), false);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.textContent), 'Business information', 'focus on the step heading');
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 5', 'no name: no Next');
  await page.type('#ob-name', 'Café Sonne');
  await page.click('#ob-next'); assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 5');
  assert.equal(await page.$eval('#ob-next', (n) => n.disabled), true, 'T1b Step 3: Next waits for a design');
  await page.click('.ob-tpl[data-template="bakery"]');
  await page.click('#ob-next'); assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 5');
  await page.click('#ob-next'); assert.equal(await text(page, '#ob-progress-count'), 'Step 5 of 5');
  assert.equal(await visible(page, '#ob-next'), false);
  assert.equal(await page.$eval('#ob-finish', (n) => n.disabled), false, 'D2.2: Save Draft ready (nothing is sent until it is clicked)');
  assert.equal(await text(page, '#ob-save-note'), 'Saves your page privately in your QRAIVY account. Nothing is published.');
  await page.click('#ob-back'); await page.click('#ob-back'); await page.click('#ob-back'); await page.click('#ob-back');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 1 of 5');
  assert.equal(await page.$eval('[data-option="scratch"]', (n) => n.getAttribute('aria-checked')), 'true', 'Back keeps the choice');
  assert.deepEqual(api, [], 'no API request (no draft, no save, no billing)');
  assert.deepEqual(external, []); assert.deepEqual(missing, []);
  assert.ok(!(await calls(page)).includes('getToken'), 'no session token is even asked for');
  await page.close();
});

test('phone, German: one column, no sideways scroll, Back / Next reachable; language switch EN <-> DE', async () => {
  const { page, api } = await onboarding({ lang: 'de', viewport: PHONE });
  assert.equal(await text(page, '#ob-progress-count'), 'Schritt 1 von 5');
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
  assert.equal(await text(page, '#ob-progress-count'), 'Schritt 2 von 5');
  await page.click('.ob-lang__btn[data-lang="en"]');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 5');
  assert.equal(await page.evaluate(() => localStorage.getItem('qraivy_lang')), 'en', 'the shared language setting');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  await page.click('#ob-back');
  await page.click('[data-option="scratch"]');
  await shot(page, 'onboarding-step1-phone-en.png');
  assert.deepEqual(api, []);
  await page.close();
});

test('Step 1 demo pages: three DEMO pages in sandboxed phone frames, DEMO on each picture, AI label on every photo; Coming soon cards disabled; a click on the scratch phone selects it', async () => {
  const { page, api, external, missing } = await onboarding();
  await page.waitForFunction(() => [...document.querySelectorAll('.ob-phone__frame[data-preview]')].every((f) => f.srcdoc.length > 1000), { timeout: 5000 });
  // the photos become inline images with the AI label once loaded
  await page.waitForFunction(() => document.querySelector('[data-preview="instagram"]').srcdoc.includes('AI · KI-generiert'), { timeout: 8000 });
  const fr = await page.$$eval('.ob-phone__frame[data-preview]', (ns) => ns.map((f) => ({ id: f.dataset.preview, sandbox: f.getAttribute('sandbox'), tab: f.tabIndex, hidden: !!f.closest('[aria-hidden="true"]'), inButton: !!f.closest('button'),
    name: ['Mia backt', 'Bäckerei MorgenGold', 'Café Sonnenschein'].find((n) => f.srcdoc.includes(n)) || null, ai: (f.srcdoc.match(/AI · KI-generiert/g) || []).length, imgs: (f.srcdoc.match(/<img\b/g) || []).length,
    remote: /src="https?:/.test(f.srcdoc), script: /<script/i.test(f.srcdoc), w: Math.round(f.getBoundingClientRect().width) })));
  for (const f of fr) {
    assert.equal(f.sandbox, '', f.id + ': sandboxed with no permissions');
    assert.ok(f.tab === -1 && f.hidden && !f.inButton, f.id + ': decoration only');
    assert.ok(!f.remote && !f.script, f.id + ': no remote image, no script');
  }
  const by = Object.fromEntries(fr.map((f) => [f.id, f]));
  assert.deepEqual([by.instagram.name, by.website.name, by.scratch.name], ['Mia backt', 'Bäckerei MorgenGold', 'Café Sonnenschein'], 'the three demo pages');
  assert.ok(by.instagram.imgs === 7 && by.instagram.ai === 7, 'creator storefront (feed + shop): every photo carries the AI label');
  assert.ok(by.website.imgs === 4 && by.website.ai === 4, 'bakery page: every photo carries the AI label');
  assert.ok(by.scratch.imgs === 1 && by.scratch.ai === 1, 'the finished page: its photo hero carries the AI label');
  // DEMO: on each picture (over the phone), readable, never on the button; the import cards still Coming soon and disabled
  const demo = await page.$$eval('.ob-card', (cs) => cs.map((c) => { const d = c.querySelector('.ob-card__demo'), r = d.getBoundingClientRect(), p = c.querySelector('.ob-phone').getBoundingClientRect(), cr = c.getBoundingClientRect(), st = getComputedStyle(d);
    return { card: c.dataset.card, text: d.textContent, onPhone: r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top, inCard: r.left >= cr.left && r.right <= cr.right, inButton: !!d.closest('button'),
      bg: st.backgroundColor, color: st.color, disabled: c.querySelector('.ob-option').disabled, badge: c.querySelector('.ob-badge').textContent }; }));
  assert.deepEqual(demo.map((d) => [d.card, d.text, d.onPhone, d.inCard, d.inButton, d.bg, d.color]), ['instagram', 'website', 'scratch'].map((k) => [k, 'DEMO', true, true, false, 'rgb(10, 10, 10)', 'rgb(255, 255, 255)']));
  assert.deepEqual(demo.map((d) => [d.disabled, d.badge]), [[true, 'Coming soon'], [true, 'Coming soon'], [false, 'Available']]);
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
  // German: the demo pages follow the language; DEMO stays DEMO; the badges are German
  await page.click('.ob-lang__btn[data-lang="de"]');
  await page.waitForFunction(() => document.querySelector('[data-preview="scratch"]').srcdoc.includes('Tisch reservieren') && document.querySelector('[data-preview="website"]').srcdoc.includes('Jeden Morgen ofenfrisch'), { timeout: 3000 });
  assert.deepEqual(await page.$$eval('.ob-card__demo', (ns) => ns.map((n) => n.textContent)), ['DEMO', 'DEMO', 'DEMO']);
  assert.deepEqual(await page.$$eval('.ob-option .ob-badge', (ns) => ns.map((n) => n.textContent)), ['Demnächst', 'Demnächst', 'Verfügbar']);
  // Next with Start from Scratch still leads to Step 2
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Schritt 2 von 5');
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
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 5');
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
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 5', 'too long: no Next');
  await page.$eval('#ob-name', (n) => { n.value = ''; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.type('#ob-name', 'Café Sonnenschein');
  assert.equal(await text(page, '#ob-name-count-sr'), '', 'quiet while far from the limit');
  await tallShot(page, 'onboarding-step2-desktop-en-filled.png', DESKTOP);
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 5', 'valid: on to Step 3 (T1b: Choose your design)');
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
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 5');
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
  assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 5', 'empty rows ignored');
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
    for (let step = 0; step < 5; step++) {
      seen.push(await page.evaluate(() => {
        const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width)]; };
        return { progress: r('.ob-progress'), bar: r('.ob-progress__bar'), labels: r('.ob-steps'), card: r('#ob-wizard .ob-card-panel') };
      }));
      if (step === 0) await page.click('[data-option="scratch"]');
      if (step === 1) await page.type('#ob-name', 'Café Sonne');
      if (step === 2) await page.click('.ob-tpl[data-template="bakery"]');
      if (step < 4) await page.click('#ob-next');
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
  assert.deepEqual(stored[0][1], { v: 2, step: 1, choice: 'scratch', answers: { template: null, palette: null, name: 'Café Sonne', description: 'Kaffee', links: [{ platform: 'instagram', url: 'instagram.com/sonne' }], sections: null, social: 'auto' } });
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => /onboarding/.test(k) || /Sonne/.test(localStorage.getItem(k)))), [], 'nothing in localStorage');
  // reload: the same user is back on Step 2 with the answers
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 5');
  assert.equal(await page.$eval('#ob-name', (n) => n.value), 'Café Sonne');
  assert.equal(await page.$eval('#ob-description', (n) => n.value), 'Kaffee');
  assert.equal(await page.$eval('#ob-links input', (n) => n.value), 'instagram.com/sonne');
  await waitLive(page, 'Café Sonne');
  // another account in this tab: none of the first one's answers
  await page.evaluate(() => sessionStorage.setItem('__test_uid', 'user_test_B'));
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 1 of 5', 'another user starts at Step 1');
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

// ── T1b Step 3: choose your design ──
async function toDesign(page, { name = 'Café Sonne', link = '' } = {}) {
  await toStep2(page);
  await page.type('#ob-name', name);
  if (link) { await page.click('#ob-add-link'); await page.type('#ob-link-url-' + (await rowKeys(page))[0], link); }
  await page.click('#ob-next');
  await sleep(150);
}
const designFrame = (page) => page.$eval('#ob-design-frame', (f) => f.srcdoc);
const checkedIn = (page, sel) => page.$$eval(sel + ' [aria-checked="true"]', (ns) => ns.map((n) => n.dataset.template || n.dataset.palette));
// the image files the page asked for (the card thumbnails and the template photos come from the upload)
function imageLog(page) { const seen = []; page.on('request', (r) => { const u = new URL(r.url()); if (/^\/images\/(deals|studio)\/starter\//.test(u.pathname)) seen.push(u.pathname.slice(1)); }); return seen; }

test('T1b Step 3, desktop, English: six template cards (a radio group), none chosen, Next disabled with a hint; a click chooses one: orange ring and check, its palettes, the live phone with the customer\'s name and links, example sections tagged; no request', async () => {
  const { page, api, external, missing } = await onboarding();
  const images = imageLog(page);
  await toDesign(page, { link: 'instagram.com/cafesonne' });
  assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 5');
  assert.equal(await text(page, '#ob-design-title'), 'Choose your design');
  assert.equal(await page.$eval('.ob-steps__item[data-step="2"]', (n) => n.getAttribute('aria-current')), 'step');
  const cards = await page.$$eval('#ob-tpls[role="radiogroup"] > .ob-tpl[role="radio"]', (ns) => ns.map((n) => ({ id: n.dataset.template, checked: n.getAttribute('aria-checked'), title: n.querySelector('.ob-tpl__title').textContent, tab: n.tabIndex, img: n.querySelector('img').getAttribute('src'), ai: n.querySelector('.ob-tpl__ai').textContent })));
  assert.deepEqual(cards.map((c) => c.id), ['restaurant', 'bakery', 'beauty', 'retail', 'creator', 'services']);
  assert.deepEqual(cards.map((c) => c.title), ['Restaurant', 'Bakery & Café', 'Beauty & Salon', 'Retail & Boutique', 'Creator & Influencer', 'Professional Services']);
  assert.ok(cards.every((c) => c.checked === 'false'), 'no template chosen at first (D1)');
  assert.deepEqual(cards.map((c) => c.tab), [0, -1, -1, -1, -1, -1], 'one tab stop');
  assert.ok(cards.every((c) => /^images\/(deals|studio)\/starter\/[A-Za-z0-9-]+\.jpg$/.test(c.img) && c.ai === 'AI · KI-generiert'), 'a local photo with the AI label on every card');
  assert.equal(await page.$eval('#ob-next', (n) => n.disabled), true, 'Next disabled until a design is chosen');
  assert.equal(await visible(page, '#ob-design-hint'), true);
  assert.equal(await visible(page, '#ob-pals-wrap'), false, 'no palettes yet');
  assert.equal(await visible(page, '#ob-design-empty'), true, 'the phone says what to do');
  assert.equal(await visible(page, '#ob-design-stage'), false);
  // the card photos are all 4:3 thumbnails (cropped, never stretched), including the two portraits
  const media = await page.$$eval('.ob-tpl__media', (ns) => ns.map((n) => { const r = n.getBoundingClientRect(), i = n.querySelector('img'); return [Math.round(r.width / r.height * 100) / 100, getComputedStyle(i).objectFit]; }));
  assert.ok(media.every(([ratio, fit]) => Math.abs(ratio - 4 / 3) < 0.02 && fit === 'cover'), JSON.stringify(media));
  await shot(page, 't1b-step3-desktop-en-empty.png');
  // choose Restaurant
  await page.click('.ob-tpl[data-template="restaurant"]');
  assert.deepEqual(await checkedIn(page, '#ob-tpls'), ['restaurant']);
  await sleep(250);   // after the 0.15 s border transition
  assert.equal(await page.$eval('.ob-tpl[data-template="restaurant"]', (n) => getComputedStyle(n).borderColor), 'rgb(255, 90, 31)', 'the orange selection border');
  assert.equal(await visible(page, '.ob-tpl[data-template="restaurant"] .ob-tpl__check'), true, 'and the check (not colour alone)');
  assert.equal(await page.$eval('#ob-next', (n) => n.disabled), false);
  assert.equal(await visible(page, '#ob-design-hint'), false);
  assert.deepEqual(await page.$$eval('#ob-pals .ob-pal', (ns) => ns.map((n) => n.querySelector('.ob-pal__name').textContent)), ['Bordeaux', 'Olive grove', 'Terracotta', 'Midnight & gold']);
  assert.deepEqual(await checkedIn(page, '#ob-pals'), ['bordeaux'], 'the first palette');
  await page.waitForFunction(() => document.getElementById('ob-design-frame').srcdoc.includes('Café Sonne'), { timeout: 3000 });
  await page.waitForFunction(() => /data:image\/jpeg;base64/.test(document.getElementById('ob-design-frame').srcdoc), { timeout: 5000 });
  let html = await designFrame(page);
  assert.ok(html.includes('https://instagram.com/cafesonne') && !html.includes('href="https://www.instagram.com/"'), 'the customer\'s link, not the example profile');
  assert.ok(html.includes('--v3-brand:#8c1c2b'), 'the Bordeaux palette');
  assert.equal((html.match(/<span class="ob-ex">Example<\/span>/g) || []).length, 4, 'buttons, menu, opening hours, contact tagged');
  assert.ok(/data-v3-id="s_obbuttons1"[^>]*><div class="v3-wrap"><span class="ob-ex">/.test(html));
  assert.ok(!/data-v3-id="s_obhero01"[^>]*><div class="v3-wrap"><span class="ob-ex">/.test(html) && !/data-v3-id="s_obsocial1"[^>]*><div class="v3-wrap"><span class="ob-ex">/.test(html), 'the hero (the customer\'s name) and the customer\'s own links are not tagged');
  assert.ok(!/res\.cloudinary\.com|images\/(deals|studio)\/starter/.test(html), 'inline photos only, no address in the frame');
  assert.equal((html.match(/class="st-ai"/g) || []).length, (html.match(/<img\b[^>]*src="data:image\/jpeg/g) || []).length, 'every photo with the AI label');
  assert.match(await text(page, '#ob-design-status'), /Restaurant selected\./);
  // the legend: what is the customer's, what is an example
  assert.match(await text(page, '.ob-legend__item--yours'), /^Your details from Step 2$/);
  assert.match(await text(page, '.ob-legend__item--example'), /^“Example”: demo, not your real details$/);
  assert.equal(await visible(page, '#ob-design-jump'), false, 'no preview jump on desktop: the phone sits beside the cards');
  // desktop: the phone keeps its size; the column beside the cards ends close under the palettes
  const col = await page.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); return { phone: Math.round(r('#ob-design-stage .ob-phone').width), gap: Math.round(r('#ob-design-live').bottom - r('#ob-pals-wrap').bottom), legend: [...document.querySelectorAll('#ob-step-2 .ob-legend__item')].map((n) => Math.round(n.getBoundingClientRect().height)) }; });
  assert.ok(col.phone === 260 && col.gap <= 120 && col.legend.every((h) => h <= 20), 'phone 260 px, little space under the palettes, one-line legend: ' + JSON.stringify(col));
  // a palette: only the colours change
  await page.click('.ob-pal[data-palette="olive"]');
  assert.deepEqual(await checkedIn(page, '#ob-pals'), ['olive']);
  await page.waitForFunction(() => document.getElementById('ob-design-frame').srcdoc.includes('--v3-brand:#4b6a2e'), { timeout: 3000 });
  assert.match(await text(page, '#ob-design-status'), /Colour palette Olive grove selected\./);
  await shot(page, 't1b-step3-desktop-en-restaurant.png');
  // another template: its first palette; the Step 2 answers and the (untouched) section list kept
  await page.click('.ob-tpl[data-template="services"]');
  assert.deepEqual([await checkedIn(page, '#ob-tpls'), await checkedIn(page, '#ob-pals')], [['services'], ['navy']]);
  await page.waitForFunction(() => document.getElementById('ob-design-frame').srcdoc.includes('Steuern') || document.getElementById('ob-design-frame').srcdoc.includes('Tax · Accounting'), { timeout: 3000 });
  const kept = await page.evaluate(() => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.startsWith('qraivy.onboarding')))));
  assert.deepEqual([kept.v, kept.step, kept.answers.template, kept.answers.palette, kept.answers.name, kept.answers.sections], [2, 2, 'services', 'navy', 'Café Sonne', null]);
  // only the chosen templates' photos were loaded for the phone (plus one thumbnail per card)
  const thumbs = cards.map((c) => c.img);
  const extra = images.filter((p) => !thumbs.includes(p));
  for (const p of ['images/deals/starter/restaurant-fresh-01.jpg', 'images/deals/starter/restaurant-meal-01.jpg']) assert.ok(extra.includes(p), 'the chosen Restaurant\'s photos: ' + p);
  const allowed = ['restaurant-fresh-01', 'restaurant-meal-01', 'bakery-bread-01', 'bakery-coffee-01'].map((id) => 'images/deals/starter/' + id + '.jpg');   // (the bakery ones: Step 1's demo pages)
  assert.deepEqual(extra.filter((p) => !allowed.includes(p)), [], 'nothing of Beauty, Retail or Creator beyond their thumbnails: ' + JSON.stringify(extra));
  assert.equal(new Set(images).size, images.length, 'each photo loaded once');
  assert.deepEqual(api, []); assert.deepEqual(external, []); assert.deepEqual(missing, []);
  await page.close();
});

test('T1b Step 3 keyboard: Tab reaches the cards once, arrow keys / Home / End move and choose, the same for palettes; a visible focus ring; Next by keyboard', async () => {
  const { page } = await onboarding();
  await toDesign(page);
  await page.focus('.ob-tpl[data-template="restaurant"]');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual([await checkedIn(page, '#ob-tpls'), await page.evaluate(() => document.activeElement.dataset.template)], [['bakery'], 'bakery']);
  await page.keyboard.press('End');
  assert.deepEqual(await checkedIn(page, '#ob-tpls'), ['services']);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await checkedIn(page, '#ob-tpls'), ['restaurant'], 'wraps around');
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await checkedIn(page, '#ob-tpls'), ['services']);
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return [c.outlineStyle, c.outlineWidth]; });
  assert.deepEqual(ring, ['solid', '3px'], 'visible focus ring');
  assert.deepEqual(await page.$$eval('.ob-tpl', (ns) => ns.map((n) => n.tabIndex)), [-1, -1, -1, -1, -1, 0], 'the chosen card is the one tab stop');
  // Tab: into the palettes (one stop), arrows choose
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.palette), 'navy');
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await checkedIn(page, '#ob-pals'), ['forest']);
  await page.keyboard.press('Home');
  assert.deepEqual(await checkedIn(page, '#ob-pals'), ['navy']);
  await page.focus('#ob-next'); await page.keyboard.press('Enter'); await sleep(150);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 5');
  await page.close();
});

test('T1b Step 3 progress: template and palette kept across Back / Next and a reload; a new template never touches the customer\'s sections; sign-out clears the choice', async () => {
  const { page } = await onboarding();
  await toDesign(page);
  await page.click('.ob-tpl[data-template="beauty"]'); await page.click('.ob-pal[data-palette="plum"]');
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 5');
  assert.deepEqual([await checkedIn(page, '#ob-tpls'), await checkedIn(page, '#ob-pals')], [['beauty'], ['plum']]);
  await page.waitForFunction(() => document.getElementById('ob-design-frame').srcdoc.includes('--v3-brand:#6b3a7a'), { timeout: 3000 });
  // on to Step 4, change the sections; Back to Step 3, another template; Step 4 still has the customer's list
  await page.click('#ob-next'); await sleep(150);
  await page.click('#ob-more [data-act="add"][aria-label="Add Gallery"]');
  await page.click('#ob-chosen [data-type="buttons"] [data-act="remove"]');
  const mine = await chosen(page);
  await page.click('#ob-back');
  assert.deepEqual([await checkedIn(page, '#ob-tpls'), await checkedIn(page, '#ob-pals')], [['beauty'], ['plum']], 'kept on Back');
  await page.click('.ob-tpl[data-template="retail"]');
  await page.click('#ob-next'); await sleep(150);
  assert.deepEqual(await chosen(page), mine, 'the customer\'s sections are never dropped by a template change');
  // Back to Step 2 and forward again: everything kept
  await page.click('#ob-back'); await page.click('#ob-back');
  assert.equal(await page.$eval('#ob-name', (n) => n.value), 'Café Sonne');
  await page.click('#ob-next');
  assert.deepEqual(await checkedIn(page, '#ob-tpls'), ['retail']);
  await page.click('#ob-signout'); await sleep(100);
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('qraivy.onboarding'))), []);
  await page.close();
});

test('T1b migration: progress kept by the four-step version (on "Choose sections", own section list) opens on the new Step 3 with every answer and section kept; after a design, Step 4 shows the same list', async () => {
  const { page } = await onboarding();
  await toStep2(page);
  // the four-step version's progress for this user: step 2 = Choose sections, no version field
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith('qraivy.onboarding'));
    sessionStorage.setItem(key, JSON.stringify({ step: 2, choice: 'scratch', answers: { name: 'Café Alt', description: 'Seit 1990', links: [], sections: ['hero', 'text', 'contact'], social: 'auto' } }));
  });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 5', 'the new step first: choose a design');
  assert.deepEqual(await checkedIn(page, '#ob-tpls'), []);
  await page.click('.ob-tpl[data-template="creator"]');
  await page.waitForFunction(() => document.getElementById('ob-design-frame').srcdoc.includes('Café Alt') && document.getElementById('ob-design-frame').srcdoc.includes('Seit 1990'), { timeout: 3000 });
  await page.click('#ob-next'); await sleep(150);
  assert.deepEqual(await chosen(page), ['hero', 'text', 'contact'], 'the kept section list');
  await page.close();
});

test('T1b Step 3, phone 390 / 360 / 320, English and German, Light and Dark: cards in two columns (one at 320), palettes and phone below, no sideways scroll, touch targets 44 px, readable', async () => {
  for (const [width, lang, theme] of [[390, 'en', 'light'], [360, 'de', 'dark'], [320, 'de', 'light'], [320, 'en', 'dark']]) {
    const viewport = Object.assign({}, PHONE, { width });
    const { page, api, external } = await onboarding({ viewport, lang, theme });
    await toDesign(page, { name: lang === 'de' ? 'Bäckerei Sonne' : 'Café Sonne' });
    // the preview jump: shown, but disabled until a design is chosen (nothing to see yet); a tap does nothing
    assert.deepEqual(await page.$eval('#ob-design-jump', (n) => [getComputedStyle(n).display !== 'none', n.disabled]), [true, true], width + ' ' + lang + ': jump disabled first');
    await page.evaluate(() => window.scrollTo(0, 0)); await page.click('#ob-design-jump', { force: true }).catch(() => {}); await sleep(300);
    assert.equal(await page.evaluate(() => scrollY), 0, 'a disabled jump does not scroll');
    await page.click('.ob-tpl[data-template="creator"]');
    assert.equal(await page.$eval('#ob-design-jump', (n) => n.disabled), false, 'enabled right after the choice');
    await page.waitForFunction(() => /data:image\/jpeg;base64/.test(document.getElementById('ob-design-frame').srcdoc), { timeout: 5000 });
    const lay = await page.evaluate(() => {
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      const cols = new Set([...document.querySelectorAll('.ob-tpl')].map((n) => Math.round(n.getBoundingClientRect().left))).size;
      const small = [...document.querySelectorAll('#ob-step-2 .ob-tpl, #ob-step-2 .ob-pal, .ob-nav button:not([hidden])')].filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.className);
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, cols, small, order: r('#ob-tpls').bottom <= r('#ob-pals-wrap').top && r('#ob-pals-wrap').bottom <= r('#ob-step-2 .ob-live').top && r('#ob-step-2 .ob-live').bottom <= r('.ob-nav').top };
    });
    const tag = width + ' ' + lang + ' ' + theme;
    assert.ok(lay.sw <= lay.iw, tag + ': no sideways scroll ' + JSON.stringify(lay));
    assert.equal(lay.cols, width >= 340 ? 2 : 1, tag + ': columns');
    assert.deepEqual(lay.small, [], tag + ': touch targets');
    assert.ok(lay.order, tag + ': cards, palettes, phone, Back / Next');
    if (lang === 'de') {
      assert.equal(await text(page, '#ob-design-title'), 'Design wählen');
      assert.equal(await text(page, '.ob-tpl[data-template="services"] .ob-tpl__title'), 'Dienstleistungen');
      assert.ok((await designFrame(page)).includes('<span class="ob-ex">Beispiel</span>'));
      assert.match(await text(page, '.ob-legend__item--example'), /^„Beispiel“: Demo, nicht Ihre Angaben$/);
      assert.equal(await text(page, '.ob-legend__item--yours'), 'Ihre Angaben aus Schritt 2');
    }
    // the preview jump: near the top, above the cards; it scrolls to the one live phone and moves focus there
    assert.equal(await text(page, '#ob-design-jump'), lang === 'de' ? 'Live-Vorschau ansehen' : 'See live preview');
    const jump = await page.evaluate(() => { const b = document.getElementById('ob-design-jump').getBoundingClientRect(); return { above: b.bottom <= document.getElementById('ob-tpls').getBoundingClientRect().top, h: b.height, frames: document.querySelectorAll('#ob-step-2 iframe').length }; });
    assert.ok(jump.above && jump.h >= 44 && jump.frames === 1, tag + ': jump ' + JSON.stringify(jump));
    const jr = await contrast(page, '#ob-design-jump span');
    assert.ok(jr !== null && jr >= 4.5, tag + ': jump contrast ' + jr);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#ob-design-jump');
    await page.waitForFunction(() => Math.abs(document.getElementById('ob-design-live').getBoundingClientRect().top - 12) < 4 || document.documentElement.scrollTop + innerHeight >= document.documentElement.scrollHeight - 2, { timeout: 3000 });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-design-live', tag + ': focus on the preview');
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const sel of ['#ob-design-title','.ob-tpl[data-template="creator"] .ob-tpl__title', '.ob-tpl[data-template="bakery"] .ob-tpl__text', '#ob-pals-title', '.ob-pal__name', '.ob-legend__item--example', '.ob-live__note']) {
      const r = await contrast(page, sel);
      assert.ok(r !== null && r >= 4.5, tag + ': ' + sel + ' contrast ' + r);
    }
    await shot(page, 't1b-step3-phone-' + width + '-' + lang + '-' + theme + '.png');
    assert.deepEqual(api, []); assert.deepEqual(external, []);
    await page.close();
  }
});

// ── Step 3 (O2): choose sections ──
async function toStep3(page, { name = 'Café Sonne', link = '' } = {}) {
  await toStep2(page);
  await page.type('#ob-name', name);
  if (link) { await page.click('#ob-add-link'); await page.type('#ob-link-url-' + (await rowKeys(page))[0], link); }
  await page.click('#ob-next');
  await page.click('.ob-tpl[data-template="bakery"]'); await page.click('#ob-next');   // T1b: Step 3, a design
  await sleep(150);
}
const chosen = (page) => page.$$eval('#ob-chosen > li', (ns) => ns.map((n) => n.dataset.type));
const more = (page) => page.$$eval('#ob-more > li', (ns) => ns.map((n) => n.dataset.type));
const secFrame = (page) => page.$eval('#ob-sections-frame', (f) => f.srcdoc);
const waitSec = (page, id, present = true) => page.waitForFunction((x, p) => document.getElementById('ob-sections-frame').srcdoc.includes('data-v3-id="' + x + '"') === p, { timeout: 3000 }, id, present);
const status = (page) => page.waitForFunction(() => document.getElementById('ob-sections-status').textContent, { timeout: 2000 }).then(() => text(page, '#ob-sections-status'));
const frameIds = async (page) => [...(await secFrame(page)).matchAll(/data-v3-id="(s_[a-z0-9]+)"/g)].map((m) => m[1]);

test('Step 3, desktop, English (T1c.2: the chosen template\'s suggested sections, Bakery): Hero (locked), Buttons, Products, Text, Opening Hours, Contact; "Add more" the rest; live phone with the whole page; two columns; no request', async () => {
  const { page, api, external, missing } = await onboarding();
  await toStep3(page);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 5');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-sections-title', 'focus on the step heading');
  assert.deepEqual(await chosen(page), ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact'], 'Bakery\'s suggested sections (no links: no Social Media)');
  assert.deepEqual(await more(page), ['socialMedia', 'gallery', 'custom'], 'the rest, then the repeatable Custom Section');
  // the Hero: locked (no button), "Always first"; the others: Move up / Move down / Remove with their names
  const items = await page.$$eval('#ob-chosen > li', (ns) => ns.map((n) => ({ type: n.dataset.type, num: n.querySelector('.ob-sec__num').textContent, title: n.querySelector('.ob-sec__title').textContent, tag: n.querySelector('.ob-sec__tag').textContent,
    buttons: [...n.querySelectorAll('button')].map((b) => (b.disabled ? '-' : '') + b.getAttribute('aria-label')) })));
  assert.deepEqual(items[0], { type: 'hero', num: '1', title: 'Hero', tag: 'Always first · from Step 2', buttons: [] });
  assert.deepEqual(items[1].buttons, ['-Move Buttons up', 'Move Buttons down', 'Remove Buttons'], 'the first movable: no Move up');
  assert.deepEqual(items[5].buttons, ['Move Contact up', '-Move Contact down', 'Remove Contact'], 'the last: no Move down');
  assert.deepEqual(items.map((x) => x.tag), ['Always first · from Step 2', 'Example · Edit later in Studio', 'Example · Edit later in Studio', 'Starter content · edit it in the Studio',
    'Example · Edit later in Studio', 'Example · Edit later in Studio'], 'T1c.2: example and starter content marked');
  assert.deepEqual(await page.$$eval('#ob-more [data-act="add"]', (ns) => ns.map((b) => b.getAttribute('aria-label') + '|' + b.textContent + '|' + getComputedStyle(b).color)),
    ['Add Social Media|+Add|rgb(21, 128, 61)', 'Add Gallery|+Add|rgb(21, 128, 61)', 'Add Custom Section|+Add|rgb(21, 128, 61)'], 'green Add buttons');
  assert.equal(await text(page, '#ob-sections-intro-title'), 'Choose what goes on your page', 'E1: the information panel');
  // the live phone: the page with exactly these sections, in order; scripts only, never same-origin; the fixed script once
  await waitSec(page, 's_obcontact1');
  assert.deepEqual(await frameIds(page), ['s_obhero01', 's_obbuttons1', 's_obproducts1', 's_obtext01', 's_obhours01', 's_obcontact1']);
  await page.waitForFunction(() => /data:image\/jpeg;base64/.test(document.getElementById('ob-sections-frame').srcdoc), { timeout: 5000 });
  const fr = await page.$eval('#ob-sections-frame', (f) => ({ sandbox: f.getAttribute('sandbox'), tab: f.tabIndex, hidden: !!f.closest('[aria-hidden="true"]'), scripts: (f.srcdoc.match(/<script>/g) || []).length, name: f.srcdoc.includes('Café Sonne'), ph: (f.srcdoc.match(/Empty section – add content in the editor/g) || []).length,
    examples: (f.srcdoc.match(/<span class="ob-ex">Example<\/span>/g) || []).length, palette: f.srcdoc.includes('--v3-brand:#94500f'), remote: /res\.cloudinary\.com|images\/(deals|studio)\/starter/.test(f.srcdoc) }));
  assert.deepEqual(fr, { sandbox: 'allow-scripts', tab: -1, hidden: true, scripts: 1, name: true, ph: 0, examples: 4, palette: true, remote: false }, 'T1c.2: the Bakery page in its palette, photos inline, buttons / products / hours / contact tagged');
  assert.deepEqual(await page.$$eval('#ob-sections-legend .ob-legend__item', (ns) => ns.map((n) => n.textContent)), ['Your details from Step 2', '“Example”: demo, not your real details']);
  const lay = await page.evaluate(() => { const f = document.querySelector('#ob-step-3 .ob-fields').getBoundingClientRect(), l = document.querySelector('#ob-step-3 .ob-live').getBoundingClientRect();
    return { side: l.left >= f.right, sticky: getComputedStyle(document.querySelector('#ob-step-3 .ob-live')).position, phone: Math.round(document.getElementById('ob-sections-frame').getBoundingClientRect().width), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  assert.ok(lay.side && lay.sticky === 'sticky' && Math.abs(lay.phone - 242) <= 1 && lay.sw <= lay.iw, JSON.stringify(lay));
  // Steps 1, 2 and 4 unchanged: Step 4 is still the placeholder, the Step 1 and 2 frames still without scripts
  await page.click('#ob-next');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 5 of 5');
  assert.equal(await text(page, '#ob-save-note'), 'Saves your page privately in your QRAIVY account. Nothing is published.');
  assert.deepEqual(await page.$$eval('[data-preview], #ob-live-frame', (ns) => ns.map((f) => f.getAttribute('sandbox'))), ['', '', '', '']);
  assert.deepEqual(api, [], 'no API request'); assert.deepEqual(external, []); assert.deepEqual(missing, []);
  assert.ok(!(await calls(page)).includes('getToken'));
  await page.close();
});

test('Step 3: add, remove, Move up / Move down; the Hero stays first; each type once; announcements and focus; the phone follows, keeps its scroll and shows the change', async () => {
  const { page, api } = await onboarding();
  await toStep3(page);
  await waitSec(page, 's_obcontact1');
  // add Gallery: at the end, announced, focus on the next "+ Add"; the phone scrolls to it
  await page.click('#ob-more [data-act="add"][aria-label="Add Gallery"]');
  assert.deepEqual(await chosen(page), ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact', 'gallery']);
  assert.deepEqual(await more(page), ['socialMedia', 'custom'], 'Gallery only once (Custom Section stays offered)');
  assert.equal(await status(page), 'Gallery added, position 7 of 7.');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Add Custom Section', 'focus: the next Add (the repeatable Custom Section)');
  await waitSec(page, 's_obgallery1');
  await page.waitForFunction(() => window.__frameY.length && window.__frameY[window.__frameY.length - 1] > 200, { timeout: 4000 });
  const revealedAt = await page.evaluate(() => window.__frameY[window.__frameY.length - 1]);
  // remove Buttons: no reveal, the scroll position is kept (the frame restores it after the reload)
  await page.click('#ob-chosen [data-type="buttons"] [data-act="remove"]');
  assert.deepEqual(await chosen(page), ['hero', 'products', 'text', 'openingHours', 'contact', 'gallery']);
  assert.equal(await status(page), 'Buttons removed.');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Remove Products', 'focus: the section that took its place');
  await waitSec(page, 's_obbuttons1', false);
  await page.evaluate(() => { window.__frameY = []; });
  await page.waitForFunction(() => window.__frameY.length > 0, { timeout: 4000 });
  const kept = await page.evaluate(() => window.__frameY[0]);
  const maxY = await (await (await page.$('#ob-sections-frame')).contentFrame()).evaluate(() => document.documentElement.scrollHeight - innerHeight);
  assert.ok(kept > 0 && kept === Math.min(revealedAt, maxY), 'scroll kept after the re-render (as far as the shorter page allows): ' + kept + ' (was ' + revealedAt + ', max ' + maxY + ')');
  // Move Gallery up to the top: announced, focus stays on its Move up; the Hero stays first
  await page.click('#ob-chosen [data-type="gallery"] [data-act="up"]');
  assert.equal(await status(page), 'Gallery moved to position 5 of 6.');
  for (let k = 0; k < 3; k++) await page.click('#ob-chosen [data-type="gallery"] [data-act="up"]');
  assert.deepEqual(await chosen(page), ['hero', 'gallery', 'products', 'text', 'openingHours', 'contact']);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Move Gallery down', 'at the top: focus moves to Move down');
  assert.equal(await page.$eval('#ob-chosen [data-type="gallery"] [data-act="up"]', (b) => b.disabled), true, 'cannot pass the Hero');
  await page.evaluate(() => document.querySelector('#ob-chosen [data-type="gallery"] [data-act="up"]').click());
  assert.deepEqual(await chosen(page), ['hero', 'gallery', 'products', 'text', 'openingHours', 'contact'], 'a click on the disabled button does nothing');
  await page.waitForFunction(() => /s_obhero01[\s\S]*s_obgallery1[\s\S]*s_obproducts1/.test(document.getElementById('ob-sections-frame').srcdoc), { timeout: 3000 });
  await page.click('#ob-chosen [data-type="gallery"] [data-act="down"]');
  assert.deepEqual(await chosen(page), ['hero', 'products', 'gallery', 'text', 'openingHours', 'contact']);
  assert.equal(await status(page), 'Gallery moved to position 3 of 6.');
  // all eight: "Add more" is empty with its note; each type once
  for (const n of ['Social Media', 'Buttons']) await page.click('#ob-more [data-act="add"][aria-label="Add ' + n + '"]');
  assert.equal((await chosen(page)).length, 8);
  assert.equal(new Set(await chosen(page)).size, 8);
  assert.equal(await visible(page, '#ob-more-none'), true);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Add Custom Section', 'all eight on the page: focus on the repeatable Custom Section "+ Add"');
  await waitSec(page, 's_obtext01');
  assert.equal((await frameIds(page)).length, 8, 'the phone shows all eight');
  assert.ok(!(await secFrame(page)).includes('Your text'), 'the Text section has no placeholder text');
  assert.ok((await secFrame(page)).includes('Empty section – add content in the editor'), 'Social Media without links: empty (core.js placeholder), no example profile');
  // keyboard: the frame and its page are out of the Tab order; Tab moves through the section buttons
  const f = await (await page.$('#ob-sections-frame')).contentFrame();
  assert.deepEqual(await f.evaluate(() => [...document.querySelectorAll('a,button')].filter((n) => n.tabIndex !== -1).length), 0);
  await page.focus('#ob-chosen [data-type="openingHours"] [data-act="up"]');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Move Opening Hours down');
  await page.keyboard.press('Enter');
  assert.equal((await chosen(page))[5], 'openingHours', 'Enter moves it');
  // touch targets: every section button at least 44 px
  assert.ok((await page.$$eval('#ob-step-3 button', (ns) => ns.map((b) => b.getBoundingClientRect()).filter((r) => r.width && (r.height < 44 || r.width < 44)).length)) === 0, 'buttons at least 44 x 44');
  assert.deepEqual(api, []);
  await page.close();
});

// ── T1c.2: Step 4 with the chosen template ──
async function toTemplateStep4(page, { id, palette, name = 'Café Sonne', description = '', link = '' }) {
  await toStep2(page);
  await page.type('#ob-name', name);
  if (description) await page.type('#ob-description', description);
  if (link) { await page.click('#ob-add-link'); await page.type('#ob-link-url-' + (await rowKeys(page))[0], link); }
  await page.click('#ob-next');
  await page.click('.ob-tpl[data-template="' + id + '"]');
  if (palette) await page.click('.ob-pal[data-palette="' + palette + '"]');
  await page.click('#ob-next'); await sleep(200);
}
const waitPhotos = (page) => page.waitForFunction(() => /data:image\/jpeg;base64/.test(document.getElementById('ob-sections-frame').srcdoc), { timeout: 6000 });

test('T1c.2 Step 4, Restaurant (desktop, English): the template\'s eight sections, its palette from Step 3, the customer\'s name, description and link; Example tags and legend; only Restaurant\'s photos; add / remove / move keep working in the template\'s page', async () => {
  const { page, api, external, missing } = await onboarding();
  const images = imageLog(page);
  await toTemplateStep4(page, { id: 'restaurant', palette: 'midnight', description: 'Pasta & Wein', link: 'instagram.com/cafesonne' });
  assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 5');
  assert.deepEqual(await chosen(page), ['hero', 'buttons', 'products', 'gallery', 'text', 'openingHours', 'contact', 'socialMedia']);
  await waitPhotos(page);
  let html = await secFrame(page);
  assert.ok(html.includes('--v3-brand:#7a5a10'), 'the Midnight & gold palette chosen on Step 3');
  assert.ok(html.includes('Café Sonne') && html.includes('Pasta &amp; Wein') && html.includes('https://instagram.com/cafesonne'), 'Step 2: the customer\'s name, description and link');
  assert.ok(!html.includes('href="https://www.instagram.com/"'), 'no example profile');
  assert.equal((html.match(/<span class="ob-ex">Example<\/span>/g) || []).length, 4, 'buttons, menu, opening hours, contact tagged');
  assert.ok(!/data-v3-id="s_obsocial1"[^>]*><div class="v3-wrap"><span class="ob-ex">/.test(html), 'the customer\'s links not tagged');
  assert.ok(!/res\.cloudinary\.com|images\/(deals|studio)\/starter/.test(html), 'photos inline only');
  assert.equal((html.match(/class="st-ai"/g) || []).length, (html.match(/<img\b[^>]*src="data:image\/jpeg/g) || []).length, 'every photo with the AI label');
  assert.equal(await text(page, '#ob-chosen [data-type="gallery"] .ob-sec__tag'), 'Starter content · edit it in the Studio');
  assert.equal(await text(page, '#ob-chosen [data-type="products"] .ob-sec__tag'), 'Example · Edit later in Studio');
  // remove, move, add: the template's page follows, the scroll reveal still works
  await page.click('#ob-chosen [data-type="gallery"] [data-act="remove"]');
  await waitSec(page, 's_obgallery1', false);
  await page.click('#ob-chosen [data-type="contact"] [data-act="up"]');
  await page.waitForFunction(() => /s_obcontact1[\s\S]*s_obhours01/.test(document.getElementById('ob-sections-frame').srcdoc), { timeout: 3000 });
  await page.click('#ob-more [data-act="add"][aria-label="Add Gallery"]');
  await waitSec(page, 's_obgallery1');
  await page.waitForFunction(() => window.__frameY.length && window.__frameY[window.__frameY.length - 1] > 200, { timeout: 4000 });
  assert.deepEqual(await chosen(page), ['hero', 'buttons', 'products', 'text', 'contact', 'openingHours', 'socialMedia', 'gallery']);
  html = await secFrame(page);
  assert.ok(html.includes('--v3-brand:#7a5a10') && /data:image\/jpeg;base64/.test(html), 'still the template\'s page');
  const thumbs = await page.$$eval('.ob-tpl img', (ns) => ns.map((n) => n.getAttribute('src')));
  const extra = images.filter((p) => !thumbs.includes(p) && !/bakery-(bread|coffee)-01/.test(p));   // (the bakery ones: Step 1's demo pages)
  assert.ok(extra.length && extra.every((p) => p.includes('/restaurant-')), 'only Restaurant\'s photos beyond the card thumbnails: ' + JSON.stringify(extra));
  assert.equal(new Set(images).size, images.length, 'each photo once');
  assert.deepEqual(api, []); assert.deepEqual(external, []); assert.deepEqual(missing, []);
  await shot(page, 't1c2-step4-desktop-en-restaurant.png');
  await page.close();
});

test('T1c.2 Step 4, Creator: six suggested (no links: five, no Social Media); a Gallery added stays as an empty placeholder (no example photos here); Hero-only kept; Back / Next and a reload keep the list and the palette', async () => {
  const { page } = await onboarding();
  await toTemplateStep4(page, { id: 'creator', palette: 'violet' });
  assert.deepEqual(await chosen(page), ['hero', 'buttons', 'products', 'text', 'contact'], 'Creator without links');
  await page.click('#ob-more [data-act="add"][aria-label="Add Gallery"]');
  await waitSec(page, 's_obgallery1');
  assert.equal(await text(page, '#ob-chosen [data-type="gallery"] .ob-sec__tag'), 'Add your content in the Studio');
  assert.equal(((await secFrame(page)).match(/Empty section – add content in the editor/g) || []).length, 1, 'Creator\'s Gallery: the core.js placeholder, not dropped');
  // remove all but the Hero: kept as the customer's list
  for (const type of ['buttons', 'products', 'text', 'contact', 'gallery']) await page.click('#ob-chosen [data-type="' + type + '"] [data-act="remove"]');
  assert.deepEqual(await chosen(page), ['hero']);
  await page.click('#ob-back'); await page.click('#ob-next'); await sleep(150);
  assert.deepEqual(await chosen(page), ['hero'], 'Back / Next: Hero-only kept');
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 5');
  assert.deepEqual(await chosen(page), ['hero'], 'reload: Hero-only kept');
  await page.waitForFunction(() => document.getElementById('ob-sections-frame').srcdoc.includes('--v3-brand:'), { timeout: 3000 });
  const pal = await page.evaluate(() => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.startsWith('qraivy.onboarding')))).answers);
  assert.deepEqual([pal.template, pal.palette, pal.sections], ['creator', 'violet', ['hero']]);
  assert.equal(await page.$eval('#ob-next', (b) => b.disabled), false, 'a Hero-only page can go on');
  await page.close();
});

const INTRO = {
  en: ['Choose what goes on your page', "Select the sections you'd like on your landing page. We'll add example content to help you get started.",
    "Don't worry about the details yet! You'll be able to edit all text, images, products and opening hours in the Studio Builder.", 'You can add or remove sections later.'],
  de: ['Wählen Sie die Bereiche für Ihre Seite', 'Wählen Sie aus, welche Bereiche Ihre Landingpage enthalten soll. Wir fügen Beispielinhalte hinzu, damit Sie direkt starten können.',
    'Um die Details müssen Sie sich jetzt noch nicht kümmern! Texte, Bilder, Produkte und Öffnungszeiten können Sie anschließend im Studio bearbeiten.', 'Sie können später jederzeit Bereiche hinzufügen oder entfernen.'],
};
test('E1: Step 4 information panel: the approved English and German text, blue, directly above the section cards, under the unchanged heading; readable in Light and Dark; desktop 1440 / 1024 and phones 390 / 320 without sideways scroll; the language switch updates it', async () => {
  for (const [viewport, lang, theme] of [[DESKTOP, 'en', 'light'], [DESKTOP, 'de', 'dark'], [{ width: 1024, height: 768 }, 'en', 'dark'], [PHONE, 'de', 'light'], [Object.assign({}, PHONE, { width: 320 }), 'en', 'dark'], [Object.assign({}, PHONE, { width: 320 }), 'de', 'dark']]) {
    const { page, api, external } = await onboarding({ viewport, lang, theme });
    await toTemplateStep4(page, { id: 'bakery', name: lang === 'de' ? 'Bäckerei Sonne' : 'Café Sonne' });
    const tag = viewport.width + ' ' + lang + ' ' + theme;
    const r = await page.evaluate(() => {
      const box = document.getElementById('ob-sections-intro'), q = (s) => document.querySelector(s).getBoundingClientRect(), b = box.getBoundingClientRect(), cs = getComputedStyle(box);
      return { texts: [...box.querySelectorAll('.ob-info__title, p')].map((n) => n.textContent), h1: document.querySelector('#ob-step-3 .ob-h1').textContent,
        first: box.parentElement.firstElementChild === box && box.nextElementSibling.querySelector('#ob-chosen') !== null,
        above: b.top >= q('#ob-step-3 .ob-h1').bottom && b.bottom <= q('#ob-chosen-title').top && b.bottom <= q('#ob-chosen').top,
        bg: cs.backgroundColor, border: cs.borderTopColor, icon: getComputedStyle(box.querySelector('.ob-ic')).color, heading: box.querySelector('h2').id,
        old: !!document.querySelector('[data-ob="sections_info"], [data-ob="sections_text"]'), sw: document.documentElement.scrollWidth, iw: innerWidth, w: Math.round(b.width) };
    });
    assert.deepEqual(r.texts, INTRO[lang], tag + ': the approved text');
    assert.equal(r.h1, lang === 'de' ? 'Seite anpassen' : 'Customize your page', tag + ': the Step 4 heading unchanged');
    assert.ok(r.first && r.above, tag + ': directly above the section cards ' + JSON.stringify(r));
    assert.equal(r.old, false, tag + ': the former lead line and note are gone');
    assert.equal(r.heading, 'ob-sections-intro-title');
    assert.deepEqual([r.bg, r.border, r.icon], theme === 'light' ? ['rgb(239, 246, 255)', 'rgb(191, 219, 254)', 'rgb(29, 78, 216)'] : ['rgba(59, 130, 246, 0.12)', 'rgba(59, 130, 246, 0.38)', 'rgb(96, 165, 250)'], tag + ': the blue information tokens');
    assert.ok(r.sw <= r.iw, tag + ': no sideways scroll ' + r.sw + ' > ' + r.iw);
    for (const sel of ['#ob-sections-intro-title', '[data-ob="sections_intro_text"]', '[data-ob="sections_intro_detail"]', '[data-ob="sections_intro_later"]']) {
      const c = await contrast(page, sel);
      assert.ok(c !== null && c >= 4.5, tag + ': ' + sel + ' contrast ' + c);
    }
    await shot(page, 'e1-step4-intro-' + viewport.width + '-' + lang + '-' + theme + '.png', false);
    assert.deepEqual(api, []); assert.deepEqual(external, []);
    await page.close();
  }
  // switching the language on Step 4 swaps the panel's text at once
  const { page } = await onboarding({ viewport: DESKTOP });
  await toTemplateStep4(page, { id: 'bakery', name: 'Café Sonne' });
  await page.click('.ob-lang__btn[data-lang="de"]');
  assert.deepEqual(await page.$$eval('#ob-sections-intro .ob-info__title, #ob-sections-intro p', (ns) => ns.map((n) => n.textContent)), INTRO.de);
  await page.click('.ob-lang__btn[data-lang="en"]');
  assert.deepEqual(await page.$$eval('#ob-sections-intro .ob-info__title, #ob-sections-intro p', (ns) => ns.map((n) => n.textContent)), INTRO.en);
  await page.close();
});

test('T1c.2 Step 4 phones 390 / 320, English and German, Light and Dark (Restaurant, Creator): one column, the template\'s page, tags and legend readable, no sideways scroll, touch targets', async () => {
  for (const [width, lang, theme, id] of [[390, 'en', 'light', 'restaurant'], [390, 'de', 'dark', 'creator'], [320, 'en', 'dark', 'creator'], [320, 'de', 'light', 'restaurant']]) {
    const viewport = Object.assign({}, PHONE, { width });
    const { page, api, external } = await onboarding({ viewport, lang, theme });
    await toTemplateStep4(page, { id, name: lang === 'de' ? 'Bäckerei Sonne' : 'Café Sonne', link: 'instagram.com/sonne' });
    await waitPhotos(page);
    const tag = width + ' ' + lang + ' ' + theme + ' ' + id;
    const lay = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      // (Restaurant with a link has all eight: "Add more" is then empty and not shown; its heading stays)
      return { order: r('#ob-chosen').bottom <= r('#ob-more-title').top && r('#ob-more-title').bottom <= r('#ob-step-3 .ob-live').top && r('#ob-step-3 .ob-live').bottom <= r('.ob-nav').top, sw: document.documentElement.scrollWidth, iw: innerWidth,
        small: [...document.querySelectorAll('#ob-step-3 button, .ob-nav button:not([hidden])')].filter((b) => b.getBoundingClientRect().width && b.getBoundingClientRect().height < 44).length };
    });
    assert.ok(lay.order && lay.sw <= lay.iw && lay.iw === width && lay.small === 0, tag + ': ' + JSON.stringify(lay));
    assert.ok((await secFrame(page)).includes(lang === 'de' ? '<span class="ob-ex">Beispiel</span>' : '<span class="ob-ex">Example</span>'), tag + ': Example tags');
    for (const sel of ['#ob-chosen [data-type="contact"] .ob-sec__tag--example', '#ob-chosen [data-type="text"] .ob-sec__tag', '#ob-sections-legend .ob-legend__item--example', '#ob-sections-legend .ob-legend__item--yours']) {
      const r = await contrast(page, sel);
      assert.ok(r !== null && r >= 4.5, tag + ': ' + sel + ' contrast ' + r);
    }
    // the header (T1c.2 polish): every control named, a 44 px tall tap area, the Back to Studio arrow at least 30 px wide
    const head = await page.evaluate(() => [...document.querySelectorAll('.ob-top a:not([hidden]), .ob-top button:not([hidden])')].filter((n) => n.offsetParent).map((n) => {
      const r = n.getBoundingClientRect(), x = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = [cy - 21, cy + 21].every((y) => { const e = document.elementFromPoint(x, y); return e && (e === n || n.contains(e)); });
      return { id: n.id || n.dataset.lang || n.dataset.obThemeChoice, w: Math.round(r.width), hit };
    }));
    assert.ok(head.length === 6 && head.every((c) => c.hit), tag + ': 44 px tall taps ' + JSON.stringify(head));
    assert.ok(head.find((c) => c.id === 'ob-exit').w >= 30, tag + ': the arrow wide enough');
    assert.equal(await page.$eval('#ob-exit', (n) => n.textContent.trim()), lang === 'de' ? 'Zurück zum Studio' : 'Back to Studio', tag + ': the accessible name of the arrow (visually hidden label)');
    assert.equal(await page.$eval('#ob-exit .ob-link__label', (n) => getComputedStyle(n).clip !== 'auto' || n.getBoundingClientRect().width <= 1), true);
    await shot(page, 't1c2-step4-phone-' + width + '-' + lang + '-' + theme + '-' + id + '.png');
    assert.deepEqual(api, []); assert.deepEqual(external, []);
    await page.close();
  }
});

test('Step 3 live frame: links and clicks do nothing (no navigation, no request); the page cannot reach the wizard', async () => {
  const { page, api, external } = await onboarding();
  await toStep3(page, { link: 'instagram.com/sonne' });
  await waitSec(page, 's_obsocial1');
  const f = await (await page.$('#ob-sections-frame')).contentFrame();
  const a = await f.waitForSelector('a.v3-social');
  await a.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await sleep(150);
  await a.click();
  await f.evaluate(() => { const a = document.querySelector('a.v3-social'); a.removeAttribute('target'); a.click(); });
  await sleep(300);
  assert.equal(f.url(), 'about:srcdoc', 'the frame did not navigate');
  assert.deepEqual(external, [], 'nothing requested from elsewhere');
  const reach = await f.evaluate(() => { const r = {}; try { r.parent = !!parent.document; } catch (e) { r.parent = 'blocked'; } try { r.storage = !!sessionStorage; } catch (e) { r.storage = 'blocked'; } r.origin = location.origin; return r; });
  assert.deepEqual(reach, { parent: 'blocked', storage: 'blocked', origin: 'null' }, 'opaque origin: no wizard, no storage');
  assert.equal(page.url(), 'https://qraivy-studio-v3-staging.vercel.app/studio-onboarding.html');
  assert.deepEqual(api, []);
  await page.close();
});

test('Step 3 Social Media: included with Step 2 links ("1 link from Step 2"); follows Step 2 while untouched; a deliberate remove or add is kept', async () => {
  const { page } = await onboarding();
  await toStep3(page);
  assert.ok(!(await chosen(page)).includes('socialMedia'), 'no links: not included');
  // back to Step 2 (through Step 3), add a link: Social Media joins at the end
  await page.click('#ob-back'); await page.click('#ob-back');
  await page.click('#ob-add-link');
  await page.type('#ob-link-url-' + (await rowKeys(page))[0], 'instagram.com/sonne');
  await page.click('#ob-next'); await page.click('#ob-next');
  assert.deepEqual(await chosen(page), ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact', 'socialMedia'], 'Bakery\'s place for Social Media');
  assert.equal(await text(page, '#ob-chosen [data-type="socialMedia"] .ob-sec__tag'), '1 link from Step 2');
  await waitSec(page, 's_obsocial1');
  assert.ok((await secFrame(page)).includes('https://instagram.com/sonne'));
  // removed deliberately: stays out after Step 2 gets another link
  await page.click('#ob-chosen [data-type="socialMedia"] [data-act="remove"]');
  await page.click('#ob-back'); await page.click('#ob-back');
  await page.click('#ob-add-link');
  await page.type('#ob-link-url-' + (await rowKeys(page))[1], 'facebook.com/sonne');
  await page.click('#ob-next'); await page.click('#ob-next');
  assert.ok(!(await chosen(page)).includes('socialMedia'), 'the customer\'s remove is kept');
  // added deliberately without links: stays, "No links yet"
  await page.click('#ob-back'); await page.click('#ob-back');
  for (const b of await page.$$('#ob-links .ob-remove')) await page.click('#ob-links .ob-remove');
  await page.click('#ob-next'); await page.click('#ob-next');
  await page.click('#ob-more [data-act="add"][aria-label="Add Social Media"]');
  assert.equal(await text(page, '#ob-chosen [data-type="socialMedia"] .ob-sec__tag'), 'No links yet · add them in Step 2');
  await page.click('#ob-back'); await page.click('#ob-next');
  assert.ok((await chosen(page)).includes('socialMedia'), 'the customer\'s add is kept without links');
  await waitSec(page, 's_obsocial1');
  assert.ok((await secFrame(page)).includes('Empty section – add content in the editor'), 'an empty Social Media: the core.js placeholder');
  await page.close();
});

test('Step 3 progress: the sections come back after a reload (same user); Step 2 answers intact; sign-out clears them', async () => {
  const { page, api } = await onboarding();
  await toStep3(page, { link: 'instagram.com/sonne' });
  const untouched = await page.evaluate(() => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.startsWith('qraivy.onboarding')))));
  assert.equal(untouched.answers.sections, null, 'untouched: nothing stored, the template\'s list follows');
  await page.click('#ob-more [data-act="add"][aria-label="Add Gallery"]');
  await page.click('#ob-chosen [data-type="gallery"] [data-act="up"]');
  await page.click('#ob-chosen [data-type="buttons"] [data-act="remove"]');
  const before = await chosen(page);
  assert.deepEqual(before, ['hero', 'products', 'text', 'openingHours', 'contact', 'gallery', 'socialMedia']);
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.startsWith('qraivy.onboarding')))));
  assert.deepEqual([stored.v, stored.step, stored.answers.template, stored.answers.palette, stored.answers.sections, stored.answers.social], [2, 3, 'bakery', 'honey', ['hero', 'products', 'text', 'openingHours', 'contact', 'gallery', 'socialMedia'], 'auto']);
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 5');
  assert.deepEqual(await chosen(page), before);
  // T1b: Back to Step 3: the chosen design and palette kept; Back again: Step 2 answers intact
  await page.click('#ob-back');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 3 of 5');
  assert.deepEqual(await page.$$eval('.ob-tpl[aria-checked="true"], .ob-pal[aria-checked="true"]', (ns) => ns.map((n) => n.dataset.template || n.dataset.palette)), ['bakery', 'honey']);
  await page.click('#ob-back');
  assert.equal(await page.$eval('#ob-name', (n) => n.value), 'Café Sonne', 'Step 2 answers intact');
  await page.click('#ob-signout'); await sleep(100);
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('qraivy.onboarding'))), []);
  assert.deepEqual(api, []);
  await page.close();
});

test('Step 3, phone, English and German: one column (on your page, add more, phone, Back / Next); no sideways scroll; German texts and announcements', async () => {
  for (const lang of ['en', 'de']) {
    const { page, api } = await onboarding({ lang, viewport: PHONE });
    await toStep3(page, { name: lang === 'de' ? 'Bäckerei Sonne' : 'Café Sonne', link: 'instagram.com/sonne' });
    await waitSec(page, 's_obsocial1');
    const lay = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const a = r('#ob-chosen'), b = r('#ob-more'), c = r('#ob-step-3 .ob-live'), d = r('.ob-nav');
      return { order: a.bottom <= b.top && b.bottom <= c.top && c.bottom <= d.top, sw: document.documentElement.scrollWidth, iw: innerWidth, phone: Math.round(document.getElementById('ob-sections-frame').getBoundingClientRect().width) };
    });
    assert.ok(lay.order && lay.sw <= lay.iw && Math.abs(lay.phone - 195) <= 1, lang + ': ' + JSON.stringify(lay));
    assert.ok((await page.$$eval('#ob-step-3 button', (ns) => ns.map((b) => b.getBoundingClientRect()).filter((r) => r.width && r.height < 44).length)) === 0, 'touch targets');
    if (lang === 'de') {
      assert.equal(await text(page, '#ob-sections-title'), 'Seite anpassen');
      assert.equal(await text(page, '#ob-chosen-title'), 'Auf Ihrer Seite');
      assert.equal(await text(page, '#ob-more-title'), 'Weitere hinzufügen');
      assert.deepEqual(await page.$$eval('#ob-chosen .ob-sec__title', (ns) => ns.map((n) => n.textContent)), ['Hero', 'Buttons', 'Produkte', 'Text', 'Öffnungszeiten', 'Kontakt', 'Social Media']);
      assert.equal(await text(page, '#ob-chosen [data-type="socialMedia"] .ob-sec__tag'), '1 Link aus Schritt 2');
      assert.equal(await text(page, '#ob-chosen [data-type="contact"] .ob-sec__tag'), 'Beispiel · Später im Studio bearbeiten');
      assert.equal(await text(page, '#ob-chosen [data-type="text"] .ob-sec__tag'), 'Startinhalt · im Studio bearbeiten');
      await page.click('#ob-more [data-act="add"][aria-label="Galerie hinzufügen"]');
      assert.equal(await status(page), 'Galerie hinzugefügt, Position 8 von 8.');
      await waitSec(page, 's_obgallery1');
      assert.ok((await secFrame(page)).includes('<span class="ob-ex">Beispiel</span>'), 'German Example tags');
    }
    assert.deepEqual(api, []);
    await page.close();
  }
});

// ── O2.1: the visual theme (Light / Dark, the gradient waves, the Step 1 checklist) ──
const theme = (page) => page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-ob-theme'), pref: document.documentElement.getAttribute('data-ob-theme-pref'),
  stored: localStorage.getItem('qraivy.studio.theme'), pressed: [...document.querySelectorAll('[data-ob-theme-choice]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.obThemeChoice),
  atBody: window.__themeAtBody, header: getComputedStyle(document.querySelector('.ob-top')).backgroundColor, bg: getComputedStyle(document.body).backgroundColor }));
// WCAG contrast of an element's text against its own (or the nearest painted) background
const contrast = (page, sel) => page.evaluate((s) => {
  const n = document.querySelector(s); if (!n) return null;
  const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
  const layers = []; let e = n;
  while (e) { const b = parse(getComputedStyle(e).backgroundColor); if (b.a > 0) layers.push(b); if (b.a === 1) break; e = e.parentElement; }
  let base = [255, 255, 255];
  for (let i = layers.length - 1; i >= 0; i--) base = base.map((x, j) => Math.round(layers[i].c[j] * layers[i].a + x * (1 - layers[i].a)));
  const fg = getComputedStyle(n).color, x = lum(fg), y = lum('rgb(' + base.join(',') + ')');
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
}, sel);

test('O2.1: Light by default; the sun / moon toggle beside EN / DE switches, is the Studio\'s preference, survives steps and reloads, applied before the page is drawn', async () => {
  const { page, api } = await onboarding({ theme: null });
  // no preference at all (this browser's earlier pages set one): cleared, then a fresh load
  await page.evaluate(() => localStorage.removeItem('qraivy.studio.theme'));
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  let t = await theme(page);
  assert.deepEqual([t.theme, t.pref, t.stored, t.pressed, t.atBody], ['light', 'light', null, ['light'], 'light'], 'nothing stored: Light');
  assert.equal(t.header, 'rgb(0, 0, 0)');
  assert.deepEqual(await page.$$eval('.ob-theme__btn', (ns) => ns.map((b) => b.getAttribute('aria-label'))), ['Light mode', 'Dark mode']);
  await page.click('.ob-theme__btn[data-ob-theme-choice="dark"]');
  t = await theme(page);
  assert.deepEqual([t.theme, t.stored, t.pressed, t.header, t.bg], ['dark', 'dark', ['dark'], 'rgb(0, 0, 0)', 'rgb(10, 10, 10)'], 'Dark: QDS background, the header still black');
  // through the steps and a reload: still Dark, set before <body> exists
  await toStep3(page);
  assert.equal((await theme(page)).theme, 'dark');
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  t = await theme(page);
  assert.deepEqual([t.theme, t.atBody, t.pressed], ['dark', 'dark', ['dark']], 'applied before the body: no flash');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 5', 'the answers and the step are not touched by the theme');
  // keyboard: the toggle is reachable and works with Enter; German labels
  await page.focus('.ob-theme__btn[data-ob-theme-choice="light"]');
  await page.keyboard.press('Enter');
  assert.deepEqual([(await theme(page)).theme, (await theme(page)).stored], ['light', 'light']);
  await page.click('.ob-lang__btn[data-lang="de"]');
  assert.deepEqual(await page.$$eval('.ob-theme__btn', (ns) => ns.map((b) => b.getAttribute('aria-label'))), ['Heller Modus', 'Dunkler Modus']);
  assert.equal(await page.$eval('.ob-theme', (n) => n.getAttribute('aria-label')), 'Darstellung');
  // the onboarding progress stores no appearance
  const kept = await page.evaluate(() => sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.startsWith('qraivy.onboarding'))));
  assert.ok(!/theme|dark|light/.test(kept), 'the theme is not part of the answers');
  assert.deepEqual(api, []);
  await page.close();
});

test('O2.1: System (set in the Studio) follows the device; a toggle press sets Light or Dark', async () => {
  const { page } = await onboarding({ theme: 'system' });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await sleep(150);
  let t = await theme(page);
  assert.deepEqual([t.pref, t.theme, t.pressed], ['system', 'dark', ['dark']], 'device dark');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await sleep(150);
  t = await theme(page);
  assert.deepEqual([t.pref, t.theme], ['system', 'light'], 'device light: follows at once');
  await page.click('.ob-theme__btn[data-ob-theme-choice="dark"]');
  t = await theme(page);
  assert.deepEqual([t.pref, t.theme, t.stored], ['dark', 'dark', 'dark'], 'a press: an explicit choice');
  await page.close();
});

test('O2.1: readable contrast in Light and Dark on every step; dark text on orange; the customer\'s pages in the phones identical in both themes', async () => {
  const frames = {};
  for (const th of ['light', 'dark']) {
    const { page, api } = await onboarding({ theme: th });
    const checks = [];
    const at = async (label, sels) => { for (const s of sels) { const r = await contrast(page, s); checks.push([label + ' ' + s, r]); } };
    await page.waitForFunction(() => [...document.querySelectorAll('.ob-phone__frame[data-preview]')].every((f) => f.srcdoc.length > 1000), { timeout: 5000 });
    await page.click('[data-option="scratch"]');
    await at('Step 1', ['#ob-start-title', '[data-ob="start_text"]', '.ob-option[data-option="scratch"] .ob-option__title', '.ob-option[data-option="scratch"] .ob-option__text', '.ob-badge--ready', '.ob-badge--soon', '[data-ob="start_help"]', '#ob-next', '.ob-card__demo']);
    frames.step1 = frames.step1 || [];
    frames.step1.push(await page.$$eval('.ob-phone__frame[data-preview]', (ns) => ns.map((f) => f.srcdoc).join('|')));
    const btn = await page.$eval('#ob-next', (b) => [getComputedStyle(b).backgroundColor, getComputedStyle(b).color]);
    assert.deepEqual(btn, ['rgb(255, 90, 31)', 'rgb(10, 10, 10)'], th + ': orange Next with dark text');
    await page.click('#ob-next');
    await page.type('#ob-name', 'Café Sonne');
    await page.click('#ob-add-link');
    await page.type('#ob-link-url-' + (await rowKeys(page))[0], 'instagram.com/sonne');
    await waitLive(page, 'instagram.com/sonne');
    await at('Step 2', ['label[for="ob-name"]', '#ob-name', '#ob-description-hint', '#ob-add-link', '#ob-logo-note', '.ob-live__label', '.ob-live__note', '#ob-name-count', '.ob-progress__count', '.ob-steps__item[data-step="1"] .ob-steps__label']);
    frames.step2 = frames.step2 || [];
    frames.step2.push(await live(page));
    await page.click('#ob-next');
    await page.click('.ob-tpl[data-template="bakery"]');
    await at('Step 3 design', ['#ob-design-title', '[data-ob="design_text"]', '.ob-tpl[data-template="bakery"] .ob-tpl__title', '.ob-tpl[data-template="bakery"] .ob-tpl__text', '.ob-tpl[data-template="retail"] .ob-tpl__title', '#ob-pals-title', '.ob-pal[aria-checked="true"] .ob-pal__name', '.ob-pal[aria-checked="false"] .ob-pal__name', '.ob-legend__item--yours', '.ob-legend__item--example', '.ob-steps__item[data-step="2"] .ob-steps__label']);
    await page.click('#ob-next');
    await waitSec(page, 's_obsocial1');
    await at('Step 3', ['#ob-chosen-title', '#ob-chosen [data-type="contact"] .ob-sec__title', '#ob-chosen [data-type="contact"] .ob-sec__text', '#ob-chosen [data-type="contact"] .ob-sec__tag', '#ob-chosen [data-type="socialMedia"] .ob-sec__tag', '#ob-chosen [data-type="contact"] .ob-sec__num', '#ob-more [data-act="add"]', '#ob-chosen .ob-remove', '#ob-sections-intro-title', '[data-ob="sections_intro_text"]', '[data-ob="sections_intro_detail"]', '[data-ob="sections_intro_later"]']);
    frames.step3 = frames.step3 || [];
    frames.step3.push(await secFrame(page));
    await page.click('#ob-next');
    await at('Step 4', ['#ob-step-4 .ob-h1', '#ob-step-4 .ob-lead', '#ob-step-4 .ob-info p', '#ob-back']);
    for (const [label, r] of checks) assert.ok(r !== null && r >= 4.5, th + ': ' + label + ' contrast ' + r);
    assert.deepEqual(await page.$$eval('.ob-phone__frame', (ns) => [...new Set(ns.map((f) => getComputedStyle(f).colorScheme))]), ['light'], 'the phone frames stay light');
    assert.deepEqual(api, []);
    await page.close();
  }
  for (const k of ['step1', 'step2', 'step3']) assert.equal(frames[k][0], frames[k][1], k + ': the customer\'s page is the same in Light and Dark');
});

test('O2.1: the gradient waves behind everything (never clickable), fuller on Step 1, calmer on Steps 2-4; the checklist on Step 1 at 1400 px and wider only; no sideways scroll at 1440 / 1024 / 768 / 390 in both themes', async () => {
  const { page } = await onboarding();
  const bg = () => page.evaluate(() => { const b = document.querySelector('.ob-bg'), c = getComputedStyle(b); return { opacity: +c.opacity, pe: c.pointerEvents, z: c.zIndex, pos: c.position, hidden: b.getAttribute('aria-hidden') }; });
  const one = await bg();
  assert.deepEqual([one.pe, one.pos, one.hidden], ['none', 'fixed', 'true']);
  assert.equal(await page.evaluate(() => { const n = document.elementFromPoint(40, 800); return !!(n && n.closest('.ob-bg')); }), false, 'a click on the waves reaches the page, not the decoration');
  // the checklist: Step 1, beside (never over) the card
  const bx = await page.evaluate(() => { const b = document.querySelector('.ob-benefits'), r = b.getBoundingClientRect(), c = document.querySelector('#ob-wizard .ob-card-panel').getBoundingClientRect();
    return { shown: getComputedStyle(b).display !== 'none', right: r.right, left: r.left, card: c.left, items: [...b.querySelectorAll('.ob-benefits__item')].map((n) => n.textContent.trim()) }; });
  assert.ok(bx.shown && bx.right <= bx.card - 16 && bx.left >= 0, 'beside the card: ' + JSON.stringify(bx));
  assert.deepEqual(bx.items, ['No coding required', 'Mobile optimized', 'Easy to update', 'Start for free']);
  await page.click('[data-option="scratch"]'); await page.click('#ob-next');
  const two = await bg();
  assert.deepEqual([one.opacity, two.opacity], [0, 0], 'Light: no waves (plain QDS near-black page)');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(10, 10, 10)', 'Light: the page is QDS near-black');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#ob-wizard .ob-card-panel')).backgroundColor), 'rgb(255, 255, 255)', 'the workspace stays white');
  assert.equal(await page.$eval('.ob-benefits', (b) => getComputedStyle(b).display), 'none', 'no checklist on Step 2');
  await page.close();
  {
    const d = await onboarding({ theme: 'dark' });
    const op = () => d.page.evaluate(() => +getComputedStyle(document.querySelector('.ob-bg')).opacity);
    const d1 = await op(); await d.page.click('[data-option="scratch"]'); await d.page.click('#ob-next'); const d2 = await op();
    assert.ok(d2 < d1 && d2 > 0, 'Dark: calmer on Step 2: ' + d2 + ' < ' + d1);
    await d.page.close();
  }
  for (const th of ['light', 'dark']) {
    for (const viewport of [DESKTOP, { width: 1024, height: 800 }, { width: 768, height: 1024 }, PHONE]) {
      const o = await onboarding({ theme: th, viewport });
      const seen = [];
      for (let step = 0; step < 5; step++) {
        seen.push(await o.page.evaluate((st) => ({ step: st, sw: document.documentElement.scrollWidth, iw: innerWidth, benefits: getComputedStyle(document.querySelector('.ob-benefits')).display !== 'none' }), step));
        if (step === 0) await o.page.click('[data-option="scratch"]');
        if (step === 1) await o.page.type('#ob-name', 'Café Sonne');
        if (step === 2) await o.page.click('.ob-tpl[data-template="bakery"]');
        if (step < 4) await o.page.click('#ob-next');
      }
      assert.ok(seen.every((x) => x.sw <= x.iw), th + ' ' + viewport.width + ': no sideways scroll ' + JSON.stringify(seen));
      assert.ok(seen.every((x) => x.benefits === (x.step === 0 && viewport.width >= 1400)), th + ' ' + viewport.width + ': the checklist on Step 1 at 1400 px and wider only ' + JSON.stringify(seen));
      await o.page.close();
    }
  }
});

test('O2.1 handwritten note: Step 1 right side at 1400 px and wider, EN / DE, Light / Dark; never over the wizard, the checklist or the header; hidden on smaller screens and Steps 2-4', async () => {
  const rect = (r) => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  const apart = (a, b) => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t;
  for (const th of ['light', 'dark']) {
    for (const lang of ['en', 'de']) {
      for (const width of [1400, 1440, 1920]) {
        const { page, api } = await onboarding({ theme: th, lang, viewport: { width, height: 1000 } });
        const m = await page.evaluate(() => {
          const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
          const n = document.querySelector('.ob-note');
          return { shown: getComputedStyle(n).display !== 'none', hidden: n.getAttribute('aria-hidden'), text: n.querySelector('.ob-note__text').textContent, color: getComputedStyle(n.querySelector('.ob-note__text')).color,
            stroke: getComputedStyle(n.querySelector('.ob-note__arrow')).stroke, note: r('.ob-note'), wizard: r('#ob-wizard .ob-card-panel'), progress: r('.ob-progress'), benefits: r('.ob-benefits'), top: r('.ob-top'),
            sw: document.documentElement.scrollWidth, iw: innerWidth };
        });
        const label = th + ' ' + lang + ' ' + width + ': ';
        assert.ok(m.shown && m.hidden === 'true', label + 'shown, decoration');
        assert.equal(m.text, lang === 'de' ? 'Erstellen Sie Ihre digitale Geschäftsseite in wenigen Minuten!' : 'Create your digital business page in minutes!');
        assert.equal(m.color, 'rgb(240, 236, 224)', label + 'QDS light text on the near-black page in both themes');
        assert.equal(m.stroke, 'rgb(255, 90, 31)', label + 'orange underline and arrow');
        const note = rect(m.note);
        for (const k of ['wizard', 'progress', 'benefits', 'top']) assert.ok(apart(note, rect(m[k])), label + 'not over the ' + k + ': ' + JSON.stringify([note, rect(m[k])]));
        assert.ok(note.l > rect(m.wizard).r && note.r <= m.iw, label + 'right of the wizard, inside the window: ' + JSON.stringify(note));
        assert.ok(m.sw <= m.iw, label + 'no sideways scroll');
        // the checklist's lines stay inside its card (long German words included)
        const spill = await page.$$eval('.ob-benefits__item', (ns) => { const c = document.querySelector('.ob-benefits').getBoundingClientRect(); return ns.filter((n) => n.getBoundingClientRect().right > c.right - 1 || n.scrollWidth > n.clientWidth).map((n) => n.textContent); });
        assert.deepEqual(spill, [], label + 'checklist text inside its card');
        if (th === 'light' && lang === 'en' && width === 1440) {
          await page.click('[data-option="scratch"]'); await page.click('#ob-next');
          assert.equal(await page.$eval('.ob-note', (n) => getComputedStyle(n).display), 'none', 'not on Step 2');
        }
        assert.deepEqual(api, []);
        await page.close();
      }
    }
  }
  for (const viewport of [{ width: 1366, height: 800 }, { width: 1280, height: 800 }, { width: 1024, height: 800 }, { width: 768, height: 1024 }, PHONE]) {
    const { page } = await onboarding({ viewport });
    const m = await page.evaluate(() => ({ shown: getComputedStyle(document.querySelector('.ob-note')).display !== 'none', sw: document.documentElement.scrollWidth, iw: innerWidth }));
    assert.ok(!m.shown && m.sw <= m.iw, viewport.width + ': hidden, no sideways scroll');
    await page.close();
  }
});

test('O2.1: reduced motion: no transitions on the page, and the Step 3 phone jumps to a new section without smooth scrolling', async () => {
  const { page } = await onboarding();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.querySelector('.ob-progress__fill')).transitionDuration, getComputedStyle(document.querySelector('.ob-card')).transitionDuration]), ['0s', '0s']);
  await toStep3(page);
  await waitSec(page, 's_obcontact1');
  await page.evaluate(() => { window.__frameY = []; });
  await page.click('#ob-more [data-act="add"][aria-label="Add Gallery"]');
  await page.waitForFunction(() => window.__frameY.length > 0, { timeout: 4000 });
  await sleep(400);
  const ys = await page.evaluate(() => window.__frameY.slice());
  assert.ok(ys[ys.length - 1] > 200 && ys.length <= 2, 'one jump to the new section, not a smooth scroll: ' + ys);
  await page.close();
});

// ── Step 4 (O3A): review ──
const summary = (page) => page.evaluate(() => ({
  name: document.getElementById('ob-sum-name').textContent, description: document.getElementById('ob-sum-description').textContent,
  descEmpty: document.getElementById('ob-sum-description').getAttribute('data-empty'),
  links: [...document.querySelectorAll('#ob-sum-links li')].map((n) => n.textContent), linksText: document.getElementById('ob-sum-links').textContent,
  anchors: document.querySelectorAll('#ob-step-4 .ob-fields a').length,
  sectionsTitle: document.getElementById('ob-sum-sections-title').textContent,
  sections: [...document.querySelectorAll('#ob-sum-sections > li')].map((n) => n.dataset.type),
  tags: [...document.querySelectorAll('#ob-sum-sections .ob-sec__tag')].map((n) => n.textContent),
  status: document.querySelector('[data-ob="draft_status"]').textContent, free: document.querySelector('[data-ob="draft_free"]').textContent,
  save: (() => { const b = document.getElementById('ob-finish'); return { text: b.textContent, disabled: b.disabled, aria: b.getAttribute('aria-disabled'), note: b.getAttribute('aria-describedby'), shown: !b.hidden }; })(),
  note: (() => { const n = document.getElementById('ob-save-note'); return n.hidden ? null : n.textContent; })(),
  next: !document.getElementById('ob-next').hidden, error: document.getElementById('ob-review-error').textContent }));
const reviewFrame = (page) => page.$eval('#ob-review-frame', (f) => f.srcdoc);
async function toStep4(page, { name = 'Café Sonne', description = '', links = [], add = [] } = {}) {
  await page.click('[data-option="scratch"]'); await page.click('#ob-next');
  await page.type('#ob-name', name);
  if (description) await page.type('#ob-description', description);
  for (let i = 0; i < links.length; i++) { await page.click('#ob-add-link'); await page.type('#ob-link-url-' + (await rowKeys(page))[i], links[i]); }
  await page.click('#ob-next'); await sleep(150);
  await page.click('.ob-tpl[data-template="bakery"]'); await page.click('#ob-next'); await sleep(150);   // T1b: Step 3, a design
  const stuck = await page.evaluate(() => [document.getElementById('ob-progress-count').textContent, [...document.querySelectorAll('.ob-error')].map((n) => n.textContent).filter(Boolean)]);
  if (stuck[0] !== 'Step 4 of 5' && stuck[0] !== 'Schritt 4 von 5') throw new Error('not on the sections step: ' + JSON.stringify(stuck));
  for (const n of add) await page.click('#ob-more [data-act="add"][aria-label="Add ' + n + '"]');
  const step3 = await secFrame(page);
  await page.click('#ob-next'); await sleep(200);
  return step3;
}

test('Step 4, desktop, English: the summary of Steps 2 and 3 (as text, in order), the draft status, free / no trial, Save Draft disabled with its note; the phone shows the Step 3 page; no request', async () => {
  const { page, api, external, missing } = await onboarding();
  const step3 = await toStep4(page, { name: 'Café <b>Sonne</b>', description: 'Fresh coffee\nand cake.', links: ['instagram.com/sonne', 'facebook.com/sonne'], add: ['Gallery'] });
  assert.equal(await text(page, '#ob-progress-count'), 'Step 5 of 5');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-review-title', 'focus on the step heading');
  const s = await summary(page);
  assert.equal(s.name, 'Café <b>Sonne</b>', 'the name as text (never markup)');
  assert.equal(s.description, 'Fresh coffee\nand cake.');
  assert.deepEqual(s.links, ['Instagram: https://instagram.com/sonne', 'Facebook: https://facebook.com/sonne']);
  assert.equal(s.anchors, 0, 'links shown as text, nothing to click away');
  assert.equal(s.sectionsTitle, 'Sections (8)');
  assert.deepEqual(s.sections, ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact', 'socialMedia', 'gallery'], 'the Step 4 order (T1c.2: from the template\'s list)');
  assert.ok(s.tags[0] === 'Always first · from Step 2' && s.tags[6] === '2 links from Step 2' && s.tags[7] === 'Starter content · edit it in the Studio' && s.tags[1] === 'Example · Edit later in Studio', JSON.stringify(s.tags));
  assert.equal(s.status, 'Draft preview ready · Not saved');
  assert.match(s.free, /free and doesn't start your 14-day trial/);
  assert.deepEqual(s.save, { text: 'Save Draft', disabled: false, aria: 'false', note: 'ob-save-note', shown: true }, 'D2.2: ready, nothing sent until clicked');
  assert.equal(s.note, 'Saves your page privately in your QRAIVY account. Nothing is published.');
  assert.equal(s.next, false, 'no Next on the last step');
  assert.equal(s.error, '');
  // the phone (T1c.3): the Step 4 page: the same template, palette, sections and order, photos inline, examples tagged; escaped, scripts only
  await page.waitForFunction(() => /data:image\/jpeg;base64/.test(document.getElementById('ob-review-frame').srcdoc) && document.getElementById('ob-review-frame').srcdoc.includes('s_obgallery1'), { timeout: 5000 });
  const ids = (h) => [...h.matchAll(/data-v3-id="(s_[a-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids(await reviewFrame(page)), ids(step3), 'the Step 5 phone: the Step 4 sections');
  assert.equal(await reviewFrame(page), await secFrame(page), 'exactly the Step 4 page');
  assert.ok((await reviewFrame(page)).includes('--v3-brand:#94500f') && ((await reviewFrame(page)).match(/<span class="ob-ex">Example<\/span>/g) || []).length === 4, 'the Bakery palette, buttons / products / hours / contact tagged');
  assert.deepEqual(await page.$$eval('#ob-review-legend .ob-legend__item', (ns) => ns.map((n) => n.textContent)), ['Your details from Step 2', '“Example”: demo, not your real details']);
  assert.equal(await text(page, '#ob-review-example-note'), 'Sections marked “Example” come into your draft with example content, so you can edit them in the Studio. The examples are not your business details: replace them with your own.');
  assert.ok((await reviewFrame(page)).includes('Café &lt;b&gt;Sonne&lt;/b&gt;'));
  assert.equal(await page.$eval('#ob-review-frame', (f) => f.getAttribute('sandbox')), 'allow-scripts');
  // layout: two columns, the phone beside, the progress indicator unchanged
  const lay = await page.evaluate(() => { const f = document.querySelector('#ob-step-4 .ob-fields').getBoundingClientRect(), l = document.querySelector('#ob-step-4 .ob-live').getBoundingClientRect();
    return { side: l.left >= f.right, progress: Math.round(document.querySelector('.ob-progress').getBoundingClientRect().width), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  assert.ok(lay.side && lay.progress === 888 && lay.sw <= lay.iw, JSON.stringify(lay));
  // D2.2: nothing is sent before the click; a click sends exactly the one drafts request. This server refuses it (401):
  // the sign-in message, nothing marked saved, no success text, no billing request
  assert.deepEqual(api, [], 'nothing sent before the click');
  await page.evaluate(() => document.getElementById('ob-finish').click());
  await page.waitForFunction(() => document.getElementById('ob-save-note').getAttribute('data-tone') === 'error', { timeout: 4000 });
  assert.equal(await text(page, '#ob-save-note'), 'Your sign-in has expired. Please sign in again – your answers are kept.');
  const kept = await page.evaluate(() => { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k.startsWith('qraivy.onboarding.v1:')) return JSON.parse(sessionStorage.getItem(k)).draft; } return null; });
  assert.equal(kept.status, 'pending', 'only the requestId is kept, never "saved"');
  assert.ok(!/saved successfully|draft (was|has been) (created|saved)|Draft saved/i.test(await page.evaluate(() => document.body.innerText)), 'no success message');
  assert.deepEqual(api.filter((x) => !x.startsWith('OPTIONS ')), ['POST studio-v3-api-production.up.railway.app/studio/drafts'], 'only the drafts request: no billing, no trial');
  assert.deepEqual(external, []); assert.deepEqual(missing, []);
  assert.equal((await calls(page)).filter((c) => c === 'getToken').length, 1, 'D2.2: the session token asked for once, for the one click');
  await page.close();
});

test('Step 4 Edit: back to Step 2 or Step 3 with every answer kept; changes show on Step 4 and in the phone; focus; reload keeps Step 4; sign-out clears', async () => {
  const { page, api } = await onboarding();
  await toStep4(page, { description: 'Kaffee', links: ['instagram.com/sonne'] });
  // Edit business information -> Step 2, the name focused, everything still there
  await page.click('#ob-edit-business');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 2 of 5');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-name');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('ob-name').value, document.getElementById('ob-description').value, document.querySelector('#ob-links input').value]), ['Café Sonne', 'Kaffee', 'instagram.com/sonne']);
  await page.$eval('#ob-name', (n) => { n.value = 'Café Mond'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#ob-next'); await page.click('#ob-next'); await page.click('#ob-next'); await sleep(200);
  assert.equal((await summary(page)).name, 'Café Mond');
  await page.waitForFunction(() => document.getElementById('ob-review-frame').srcdoc.includes('Café Mond'), { timeout: 3000 });
  // Edit sections -> Step 3, the list heading focused; move Contact up; back on Step 4 in the new order
  await page.click('#ob-edit-sections');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 4 of 5');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-chosen-title');
  await page.click('#ob-chosen [data-type="contact"] [data-act="up"]');
  await page.click('#ob-next'); await sleep(200);
  assert.deepEqual((await summary(page)).sections, ['hero', 'buttons', 'products', 'text', 'contact', 'openingHours', 'socialMedia'], 'T1c.2: moved in the template\'s list');
  await page.waitForFunction(() => /s_obcontact1[\s\S]*s_obhours01/.test(document.getElementById('ob-review-frame').srcdoc), { timeout: 3000 });
  // keyboard: Edit reachable with Tab and Enter
  await page.focus('#ob-edit-business');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-edit-sections');
  // reload: still Step 4 with the answers; sign-out: all gone
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 5 of 5');
  assert.equal((await summary(page)).name, 'Café Mond');
  await page.click('#ob-signout'); await sleep(100);
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('qraivy.onboarding'))), []);
  assert.deepEqual(api, []);
  await page.close();
});

test('Step 4 minimal: only a name -> "No description", "No social media links", the four default sections; German; Dark; phone layout; contrast', async () => {
  for (const [lang, th, viewport] of [['en', 'light', DESKTOP], ['de', 'dark', DESKTOP], ['en', 'light', PHONE], ['de', 'dark', PHONE]]) {
    const { page, api } = await onboarding({ lang, theme: th, viewport });
    await toStep4(page, { name: lang === 'de' ? 'Bäckerei' : 'Bakery' });
    const s = await summary(page);
    const de = lang === 'de';
    assert.deepEqual([s.description, s.descEmpty, s.linksText], de ? ['Keine Beschreibung', 'true', 'Keine Social-Media-Links'] : ['No description', 'true', 'No social media links']);
    assert.deepEqual(s.sections, ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact'], 'T1c.3: the template\'s suggested sections, as on Step 4');
    assert.equal(s.sectionsTitle, de ? 'Abschnitte (6)' : 'Sections (6)');
    if (de) assert.equal(await text(page, '#ob-review-example-note'), 'Mit „Beispiel“ markierte Abschnitte kommen mit Beispielinhalten in Ihren Entwurf, damit Sie sie im Studio bearbeiten können. Die Beispiele sind nicht Ihre Unternehmensangaben: Ersetzen Sie sie durch Ihre eigenen.');
    assert.equal(s.save.text, de ? 'Entwurf speichern' : 'Save Draft');
    assert.ok(!s.save.disabled, 'D2.2: Save Draft ready');
    if (de) {
      assert.equal(s.status, 'Entwurfsvorschau bereit · Nicht gespeichert');
      assert.equal(s.note, 'Speichert Ihre Seite privat in Ihrem QRAIVY-Konto. Es wird nichts veröffentlicht.');
      assert.deepEqual(await page.$$eval('.ob-edit', (ns) => ns.map((b) => b.getAttribute('aria-label') + '|' + b.textContent)), ['Unternehmensdaten bearbeiten|Bearbeiten', 'Abschnitte bearbeiten|Bearbeiten']);
    }
    // the disabled Save Draft: readable (full opacity, its own muted look), still disabled
    assert.deepEqual(await page.$eval('#ob-finish', (b) => [b.disabled, getComputedStyle(b).opacity]), [false, '1'], 'D2.2: Save Draft enabled, full opacity');
    if (viewport.width < 600) await page.click('#ob-sum-toggle');   // phones: the full section list for the contrast checks
    for (const sel of ['#ob-finish', '.ob-draft-badge', '#ob-save-note', '#ob-sum-name', '#ob-sum-description', '.ob-summary__row dt', '.ob-edit', '#ob-step-4 .ob-info p', '#ob-sum-business-title', '#ob-review-example-note', '#ob-review-legend .ob-legend__item--example', '#ob-sum-sections .ob-sec__tag--example']) {
      const r = await contrast(page, sel);
      assert.ok(r >= 4.5, lang + ' ' + th + ' ' + viewport.width + ': ' + sel + ' contrast ' + r);
    }
    // the status badge (T1c.3): neutral (no success green while saving is not available), a plain paragraph (not a control), the agreed text
    const badge = await page.$eval('.ob-draft-badge', (n) => ({ tag: n.tagName, role: n.getAttribute('role'), tab: n.tabIndex, color: getComputedStyle(n).color, border: getComputedStyle(n).borderTopColor, dot: getComputedStyle(n.querySelector('.ob-draft-badge__dot')).backgroundColor, text: n.textContent }));
    const tok = await page.evaluate(() => { const p = document.createElement('p'); document.body.appendChild(p); const g = (v) => { p.style.color = 'var(' + v + ')'; return getComputedStyle(p).color; }; const o = { text: g('--ob-text-2'), border: g('--ob-border-strong'), muted: g('--ob-muted') }; p.remove(); return o; });
    assert.deepEqual(badge, { tag: 'P', role: null, tab: -1, color: tok.text, border: tok.border, dot: tok.muted, text: de ? 'Entwurfsvorschau bereit · Nicht gespeichert' : 'Draft preview ready · Not saved' }, lang + ' ' + th + ': neutral status badge');
    assert.ok(![badge.color, badge.border, badge.dot].some((c) => c === 'rgb(21, 128, 61)' || c === 'rgb(74, 222, 128)'), 'not green');
    const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, small: [...document.querySelectorAll('#ob-step-4 button')].map((b) => b.getBoundingClientRect()).filter((r) => r.width && r.height < 44).length }));
    assert.ok(lay.sw <= lay.iw && lay.small === 0, lang + ' ' + viewport.width + ': ' + JSON.stringify(lay));
    if (viewport === PHONE) {
      const order = await page.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); return r('#ob-sum-toggle').bottom <= r('#ob-step-4 .ob-live').top && r('#ob-step-4 .ob-live').bottom <= r('.ob-nav').top && r('.ob-nav').bottom <= r('#ob-save-note').top; });
      assert.ok(order, 'phone: summary, phone preview, Back / Save Draft, the note');
    }
    assert.deepEqual(api, []);
    await page.close();
  }
});

// ── T1c.3: Step 5 shows the Step 4 page ──
const sumSections = (page) => page.$$eval('#ob-sum-sections > li', (ns) => ns.map((n) => n.dataset.type));
test('T1c.3 Step 5, Restaurant (desktop, English): a customized order and the Step 3 palette carried over exactly; Back to Step 4 and forward keep every edit; a change on Step 4 shows on Step 5; reload keeps Step 5; Save Draft disabled; no request', async () => {
  const { page, api, external, missing } = await onboarding();
  await toTemplateStep4(page, { id: 'restaurant', palette: 'olive', description: 'Pasta & Wein', link: 'instagram.com/cafesonne' });
  await page.click('#ob-chosen [data-type="gallery"] [data-act="remove"]');
  await page.click('#ob-chosen [data-type="contact"] [data-act="up"]');
  await page.click('#ob-chosen [data-type="contact"] [data-act="up"]');
  const mine = await chosen(page);
  assert.deepEqual(mine, ['hero', 'buttons', 'products', 'contact', 'text', 'openingHours', 'socialMedia']);
  await waitPhotos(page);
  const step4 = await secFrame(page);
  await page.click('#ob-next'); await sleep(200);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 5 of 5');
  assert.deepEqual(await sumSections(page), mine, 'the summary in the Step 4 order');
  await page.waitForFunction(() => /data:image\/jpeg;base64/.test(document.getElementById('ob-review-frame').srcdoc), { timeout: 6000 });
  assert.equal(await reviewFrame(page), step4, 'the Step 5 phone: exactly the Step 4 page');
  const html = await reviewFrame(page);
  assert.ok(html.includes('--v3-brand:#4b6a2e') && html.includes('Pasta &amp; Wein') && html.includes('https://instagram.com/cafesonne'), 'the Olive palette and the Step 2 details');
  assert.deepEqual(await page.$$eval('#ob-sum-sections .ob-sec__tag', (ns) => ns.map((n) => n.textContent)),
    ['Always first · from Step 2', 'Example · Edit later in Studio', 'Example · Edit later in Studio', 'Example · Edit later in Studio', 'Starter content · edit it in the Studio', 'Example · Edit later in Studio', '1 link from Step 2'], 'example, starter and the customer\'s own told apart');
  assert.equal(await text(page, '#ob-review-example-note'), 'Sections marked “Example” come into your draft with example content, so you can edit them in the Studio. The examples are not your business details: replace them with your own.');
  // Back to Step 4: the same list; add Gallery back; forward: Step 5 follows
  await page.click('#ob-back'); await sleep(150);
  assert.deepEqual(await chosen(page), mine, 'Back: every edit kept');
  await page.click('#ob-more [data-act="add"][aria-label="Add Gallery"]');
  await page.click('#ob-next'); await sleep(200);
  assert.deepEqual(await sumSections(page), mine.concat('gallery'));
  await page.waitForFunction(() => document.getElementById('ob-review-frame').srcdoc.includes('s_obgallery1'), { timeout: 3000 });
  // Edit sections (the Step 5 button) and back again; a reload stays on Step 5 with the same page
  await page.click('#ob-edit-sections'); await sleep(150);
  assert.deepEqual(await chosen(page), mine.concat('gallery'));
  await page.click('#ob-next'); await sleep(200);
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(400);
  assert.equal(await text(page, '#ob-progress-count'), 'Step 5 of 5');
  assert.deepEqual(await sumSections(page), mine.concat('gallery'), 'reload: Step 5 with the customer\'s order');
  await page.waitForFunction(() => document.getElementById('ob-review-frame').srcdoc.includes('--v3-brand:#4b6a2e'), { timeout: 3000 });
  assert.deepEqual(await page.$eval('#ob-finish', (b) => [b.disabled, b.getAttribute('aria-disabled')]), [false, 'false'], 'D2.2: Save Draft ready (not clicked: nothing sent)');
  assert.deepEqual(api, []); assert.deepEqual(external, []); assert.deepEqual(missing, []);
  await page.close();
});

test('T1c.3 Step 5, Creator: a customized order with an empty Gallery; phones 390 / 320 and desktop, English and German, Light and Dark: the Step 4 page, legend and note readable, no sideways scroll, no script error', async () => {
  for (const [viewport, lang, theme] of [[DESKTOP, 'de', 'dark'], [Object.assign({}, PHONE, { width: 390 }), 'en', 'light'], [Object.assign({}, PHONE, { width: 320 }), 'de', 'dark'], [Object.assign({}, PHONE, { width: 320 }), 'en', 'light']]) {
    const { page, api, external } = await onboarding({ viewport, lang, theme });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await toTemplateStep4(page, { id: 'creator', palette: 'teal', name: lang === 'de' ? 'Studio Sonne' : 'Café Sonne', link: 'instagram.com/studiosonne' });
    const gal = lang === 'de' ? 'Galerie hinzufügen' : 'Add Gallery';
    await page.click('#ob-more [data-act="add"][aria-label="' + gal + '"]');
    await page.click('#ob-chosen [data-type="gallery"] [data-act="up"]');
    await page.click('#ob-chosen [data-type="buttons"] [data-act="remove"]');
    const mine = await chosen(page);
    assert.deepEqual(mine, ['hero', 'socialMedia', 'products', 'text', 'gallery', 'contact']);
    await page.click('#ob-next'); await sleep(250);
    const tag = viewport.width + ' ' + lang + ' ' + theme;
    assert.deepEqual(await sumSections(page), mine, tag);
    await page.waitForFunction(() => /data:image\/jpeg;base64/.test(document.getElementById('ob-review-frame').srcdoc), { timeout: 6000 });
    const html = await reviewFrame(page);
    assert.ok(html.includes('--v3-brand:#0f766e') && html.includes('https://instagram.com/studiosonne') && (html.match(/Empty section – add content in the editor|Leerer Abschnitt – Inhalte im Editor ergänzen/g) || []).length === 1, tag + ': teal, the customer\'s link, the empty Gallery');
    assert.equal(await text(page, '#ob-sum-sections [data-type="gallery"] .ob-sec__tag'), lang === 'de' ? 'Inhalte später im Studio hinzufügen' : 'Add your content in the Studio');
    const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    assert.ok(lay.sw <= lay.iw && lay.iw === viewport.width, tag + ': no sideways scroll, the phone not zoomed out ' + JSON.stringify(lay));
    // the Edit buttons keep their label inside (a long German heading wraps instead of squeezing them)
    const spill = await page.$$eval('.ob-edit', (ns) => ns.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id));
    assert.deepEqual(spill, [], tag + ': Edit labels inside their buttons');
    if (viewport.width < 600) await page.click('#ob-sum-toggle');   // phones: the full list
    for (const sel of ['#ob-review-example-note', '#ob-review-legend .ob-legend__item--yours', '#ob-review-legend .ob-legend__item--example', '#ob-sum-sections .ob-sec__tag--example']) {
      const r = await contrast(page, sel);
      assert.ok(r !== null && r >= 4.5, tag + ': ' + sel + ' contrast ' + r);
    }
    assert.deepEqual(errors, [], tag + ': no script error');
    await shot(page, 't1c3-step5-' + viewport.width + '-' + lang + '-' + theme + '-creator.png');
    assert.deepEqual(api, []); assert.deepEqual(external, []);
    await page.close();
  }
});

test('T1c.3 Step 5 phone summary: the first three sections of the full list (the order chosen, Edit unchanged), "Show all sections (N)" shows the rest (keyboard too), "Show fewer sections" goes back; N = the real count; three or fewer: no button; desktop always the full list; 390 / 320, EN / DE, Light / Dark; no sideways scroll, no script error', async () => {
  for (const [viewport, lang, theme, id] of [[Object.assign({}, PHONE, { width: 390 }), 'en', 'light', 'restaurant'], [Object.assign({}, PHONE, { width: 390 }), 'de', 'dark', 'creator'],
    [Object.assign({}, PHONE, { width: 320 }), 'en', 'dark', 'creator'], [Object.assign({}, PHONE, { width: 320 }), 'de', 'light', 'restaurant'], [DESKTOP, 'de', 'light', 'restaurant']]) {
    const { page, api, external } = await onboarding({ viewport, lang, theme });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await toTemplateStep4(page, { id, name: lang === 'de' ? 'Studio Sonne' : 'Café Sonne', link: 'instagram.com/sonne' });
    await page.click('#ob-chosen [data-type="contact"] [data-act="up"]');   // a customized order
    const mine = await chosen(page);
    await page.click('#ob-next'); await sleep(250);
    const tag = viewport.width + ' ' + lang + ' ' + theme + ' ' + id, de = lang === 'de', N = mine.length;
    assert.ok(N > 3, tag + ': more than three sections to fold (' + N + ')');
    const st = () => page.evaluate(() => { const v = (n) => !!n && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 0;
      const b = document.getElementById('ob-sum-toggle'), items = [...document.querySelectorAll('#ob-sum-sections > li')];
      return { shown: items.filter(v).map((n) => n.getAttribute('data-type')), all: items.map((n) => n.getAttribute('data-type')), compact: !!document.getElementById('ob-sum-compact'),
        toggle: v(b), expanded: b.getAttribute('aria-expanded'), controls: b.getAttribute('aria-controls'), label: b.textContent.trim(), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
    let s = await st();
    assert.equal(s.compact, false, tag + ': no separate compact list');
    assert.deepEqual(s.all, mine, tag + ': the full list in the chosen order');
    assert.deepEqual(await sumSections(page), mine, tag + ': the full list in the chosen order');
    const more = de ? 'Alle Abschnitte anzeigen (' + N + ')' : 'Show all sections (' + N + ')', fewer = de ? 'Weniger Abschnitte anzeigen' : 'Show fewer sections';
    if (viewport === DESKTOP) {
      assert.deepEqual([s.shown, s.toggle], [mine, false], tag + ': desktop unchanged: the full list, no toggle');
    } else {
      assert.deepEqual([s.shown, s.toggle, s.expanded, s.controls, s.label], [mine.slice(0, 3), true, 'false', 'ob-sum-sections', more], tag + ': the first three first');
      await page.click('#ob-sum-toggle');
      s = await st();
      assert.deepEqual([s.shown, s.expanded, s.label], [mine, 'true', fewer], tag + ': opened, the order unchanged');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-sum-toggle', 'focus stays on the button');
      // keyboard: Enter closes, Space opens
      await page.keyboard.press('Enter'); s = await st();
      assert.deepEqual([s.shown, s.expanded, s.label], [mine.slice(0, 3), 'false', more], tag + ': Enter closes');
      await page.keyboard.press('Space'); s = await st();
      assert.deepEqual([s.shown, s.expanded], [mine, 'true'], tag + ': Space opens');
      const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      assert.equal(ring, 'solid', tag + ': visible focus ring');
      for (const sel of ['#ob-sum-toggle', '.ob-draft-badge']) {
        const r = await contrast(page, sel);
        assert.ok(r !== null && r >= 4.5, tag + ': ' + sel + ' contrast ' + r);
      }
      await page.click('#ob-sum-toggle');   // back to the first three
      const order = await page.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); return r('#ob-sum-toggle').bottom <= r('#ob-step-4 .ob-live').top; });
      assert.ok(order, tag + ': the phone preview below the summary');
      assert.ok((await page.$eval('#ob-sum-toggle', (b) => b.getBoundingClientRect().height)) >= 44, tag + ': tappable');
      // the language switch keeps the folded state and the count
      await page.click('[data-lang="' + (de ? 'en' : 'de') + '"]'); await sleep(150); s = await st();
      assert.deepEqual([s.shown, s.label], [mine.slice(0, 3), de ? 'Show all sections (' + N + ')' : 'Alle Abschnitte anzeigen (' + N + ')'], tag + ': language switch');
      await page.click('[data-lang="' + lang + '"]'); await sleep(150); s = await st();
    }
    assert.ok(s.sw <= s.iw && s.iw === viewport.width, tag + ': no sideways scroll ' + JSON.stringify([s.sw, s.iw]));
    // Edit sections (folded on phones) still leads to Step 4 with the same order
    await page.click('#ob-edit-sections'); await sleep(150);
    assert.deepEqual(await chosen(page), mine, tag + ': Edit sections');
    if (viewport !== DESKTOP) {
      // three sections or fewer: nothing to expand, no button, every section shown
      for (let guard = 0; guard < 12 && (await chosen(page)).length > 3; guard++) {
        const dels = await page.$$('#ob-chosen [data-act="remove"]');
        if (!dels.length) break;
        await dels[dels.length - 1].click(); await sleep(80);
      }
      const few = await chosen(page);
      assert.ok(few.length <= 3, tag + ': reduced to ' + few.length);
      await page.click('#ob-next'); await sleep(250); s = await st();
      assert.deepEqual([s.shown, s.toggle], [few, false], tag + ': ' + few.length + ' sections: all shown, no button');
    }
    assert.deepEqual(errors, [], tag + ': no script error');
    assert.deepEqual(api, []); assert.deepEqual(external, []);
    await page.close();
  }
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
    for (let step = 0; step < 5; step++) {
      const h = await header(page);
      assert.equal(h.top, 'rgb(0, 0, 0)', 'black header, step ' + (step + 1));
      assert.ok(h.exitColor === 'rgb(255, 255, 255)' && h.outColor === 'rgb(255, 255, 255)' && h.outShown, 'white Sign out and Back to Studio: ' + JSON.stringify(h));
      assert.ok(h.onBg === 'rgb(255, 255, 255)' && h.onColor === 'rgb(0, 0, 0)', 'the chosen language: white pill, black text');
      assert.ok(h.onRatio >= 7 && h.offRatio >= 4.5 && h.linkRatio >= 7, 'contrast: ' + JSON.stringify(h));
      assert.ok(h.logo && h.count === 1 && h.sw <= h.iw, 'logo left, one header, no sideways scroll');
      seen.push(h.h);
      if (step === 0) await page.click('[data-option="scratch"]');
      if (step === 1) await page.type('#ob-name', 'Café Sonne');
      if (step === 2) await page.click('.ob-tpl[data-template="bakery"]');
      if (step < 4) await page.click('#ob-next');
    }
    assert.ok(seen.every((x) => x === seen[0]), 'the same header height on all five steps: ' + seen);
    // keyboard: the focus ring on the black header is white and visible
    await page.focus('.ob-lang__btn[data-lang="de"]');
    await page.keyboard.press('Tab'); await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    const ring = await page.evaluate(() => { const a = document.activeElement, c = getComputedStyle(a); return { lang: a.dataset.lang, style: c.outlineStyle, color: c.outlineColor, width: c.outlineWidth }; });
    assert.ok(ring.lang === 'de' && ring.style === 'solid' && ring.color === 'rgb(255, 255, 255)' && ring.width === '3px', 'white focus ring: ' + JSON.stringify(ring));
    await page.keyboard.press('Enter');
    assert.equal(await text(page, '#ob-progress-count'), 'Schritt 5 von 5', 'the language switch still works by keyboard');
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

test('Custom Sections (Step 4 / Step 5): "+ Add" Custom Section repeatedly (unique ids), reorder and remove one instance, the phone shows an empty-section note per instance and no invented text, Step 5 lists every one in order; Back / Next, reload and a template switch keep them; keyboard; EN / DE, Light / Dark, desktop / 390 / 320', async () => {
  for (const [viewport, lang, theme, id, other] of [[DESKTOP, 'en', 'light', 'restaurant', 'creator'], [Object.assign({}, PHONE, { width: 390 }), 'de', 'dark', 'bakery', 'beauty'],
    [Object.assign({}, PHONE, { width: 320 }), 'en', 'dark', 'creator', 'services'], [DESKTOP, 'de', 'dark', 'services', 'restaurant']]) {
    const { page, api, external } = await onboarding({ viewport, lang, theme });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const de = lang === 'de', tag = viewport.width + ' ' + lang + ' ' + theme + ' ' + id, NAME = de ? 'Eigener Abschnitt' : 'Custom Section';
    await toTemplateStep4(page, { id, name: de ? 'Bäckerei Sonne' : 'Café Sonne' });
    await waitPhotos(page).catch(() => {});
    const start = await chosen(page);
    const row = () => page.$eval('#ob-more [data-type="custom"]', (li) => ({ title: li.querySelector('.ob-sec__title').textContent, label: li.querySelector('[data-act="add"]').getAttribute('aria-label') }));
    assert.deepEqual(await row(), { title: NAME, label: de ? 'Eigener Abschnitt hinzufügen' : 'Add Custom Section' }, tag + ': offered in "Add more"');
    // three instances; the second by keyboard (Enter on the focused button: focus stays on it)
    await page.click('#ob-more [data-type="custom"] [data-act="add"]'); await sleep(150);
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-type]').dataset.type + '|' + document.activeElement.dataset.act), 'custom|add', tag + ': focus stays on "+ Add" for another');
    await page.keyboard.press('Enter'); await sleep(150);
    await page.click('#ob-more [data-type="custom"] [data-act="add"]'); await sleep(150);
    let list = await chosen(page);
    const cs = list.filter((x) => /^custom:[a-z0-9]{8}$/.test(x));
    assert.equal(cs.length, 3, tag + ': three instances');
    assert.equal(new Set(cs).size, 3, tag + ': unique ids');
    assert.deepEqual(list.slice(0, start.length), start, tag + ': added at the end, the rest unchanged');
    assert.deepEqual(await page.$$eval('#ob-chosen > li', (ns) => ns.filter((n) => n.dataset.type.startsWith('custom:')).map((n) => n.querySelector('.ob-sec__title').textContent + '|' + n.querySelector('.ob-sec__tag').textContent)),
      [1, 2, 3].map((n) => NAME + ' ' + n + '|' + (de ? 'Inhalte später im Studio hinzufügen' : 'Add your content in the Studio')), tag + ': named 1-3, labelled as needing content in the Studio');
    assert.match(await text(page, '#ob-sections-status'), de ? /Eigener Abschnitt 3 hinzugefügt/ : /Custom Section 3 added/, tag + ': announced');
    // the phone: one Text section per instance (its id), core.js's empty note, no invented heading or text
    await page.waitForFunction((ids) => ids.every((i) => document.getElementById('ob-sections-frame').srcdoc.includes('s_c' + i.slice(7))), { timeout: 4000 }, cs);
    const html = await page.$eval('#ob-sections-frame', (f) => f.srcdoc);
    const notes = (html.match(de ? /Leerer Abschnitt – Inhalte im Editor ergänzen/g : /Empty section – add content in the editor/g) || []).length;
    assert.ok(notes >= 3, tag + ': an empty note per Custom Section (' + notes + ')');
    const order = (h) => cs.map((c) => h.indexOf('s_c' + c.slice(7)));
    assert.ok(order(html).every((x, i, a) => x > 0 && (i === 0 || x > a[i - 1])), tag + ': in the list order on the phone');
    // move the third up (before the second), remove the first
    await page.click('#ob-chosen [data-type="' + cs[2] + '"] [data-act="up"]'); await sleep(150);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'up', tag + ': focus on the moved instance');
    await page.click('#ob-chosen [data-type="' + cs[0] + '"] [data-act="remove"]'); await sleep(150);
    list = await chosen(page);
    const want = start.concat([cs[2], cs[1]]);
    assert.deepEqual(list, want, tag + ': reordered and one removed, the others kept');
    // Step 5: every Custom Section, in order, labelled; Save Draft disabled
    await page.click('#ob-next'); await sleep(250);
    if (viewport !== DESKTOP) await page.click('#ob-sum-toggle');
    assert.deepEqual(await sumSections(page), want, tag + ': Step 5 order');
    assert.deepEqual(await page.$$eval('#ob-sum-sections > li', (ns) => ns.filter((n) => n.dataset.type.startsWith('custom:')).map((n) => n.querySelector('.ob-sec__title').textContent)), [NAME + ' 1', NAME + ' 2'], tag + ': Step 5 names');
    assert.equal(await page.$eval('#ob-finish', (b) => b.disabled), false, tag + ': D2.2 Save Draft ready (not clicked here)');
    const rhtml = await reviewFrame(page);
    assert.ok([cs[2], cs[1]].map((c) => rhtml.indexOf('s_c' + c.slice(7))).every((x, i, a) => x > 0 && (i === 0 || x > a[i - 1])), tag + ': Step 5 phone order');
    // Back / Next, reload, template switch
    await page.click('#ob-back'); await sleep(200);
    assert.deepEqual(await chosen(page), want, tag + ': Back keeps them');
    await page.reload({ waitUntil: 'networkidle0' }); await sleep(250);
    assert.deepEqual(await chosen(page), want, tag + ': reload keeps them');
    await page.click('#ob-back'); await sleep(200);
    await page.click('.ob-tpl[data-template="' + other + '"]'); await sleep(200);
    await page.click('#ob-next'); await sleep(250);
    assert.deepEqual(await chosen(page), want, tag + ': ' + id + ' -> ' + other + ' keeps them');
    // layout and contrast
    const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    assert.ok(lay.sw <= lay.iw, tag + ': no sideways scroll ' + JSON.stringify(lay));
    for (const sel of ['#ob-chosen [data-type^="custom:"] .ob-sec__title', '#ob-chosen [data-type^="custom:"] .ob-sec__tag', '#ob-more [data-type="custom"] .ob-sec__text']) {
      const r = await contrast(page, sel);
      assert.ok(r !== null && r >= 4.5, tag + ': ' + sel + ' contrast ' + r);
    }
    await shot(page, 'custom-sections-' + viewport.width + '-' + lang + '-' + theme + '.png');
    assert.deepEqual(errors, [], tag + ': no script error');
    assert.deepEqual(api, []); assert.deepEqual(external, []);
    await page.close();
  }
});

test('Custom Sections: at most ten; then "Custom Section" leaves "Add more"', async () => {
  const { page } = await onboarding();
  await toTemplateStep4(page, { id: 'restaurant' });
  for (let i = 0; i < 10; i++) { await page.click('#ob-more [data-type="custom"] [data-act="add"]'); await sleep(60); }
  assert.equal((await chosen(page)).filter((x) => x.startsWith('custom:')).length, 10);
  assert.equal(await page.$('#ob-more [data-type="custom"]'), null, 'no more offered');
  await page.click('#ob-chosen [data-type^="custom:"] [data-act="remove"]'); await sleep(100);
  assert.ok(await page.$('#ob-more [data-type="custom"]'), 'offered again after a removal');
  await page.close();
});

test('T1c.4 template switch: untouched list follows the new template (no notice); a customised list (Custom Sections included) is kept with a notice; "Use suggested" only on request; one-step Undo restores the exact list; Back / Next and reload; Step 2 kept; keyboard and announcements; EN / DE, Light / Dark, desktop / 390 / 320', async () => {
  for (const [viewport, lang, theme, a, b] of [[DESKTOP, 'en', 'light', 'restaurant', 'creator'], [Object.assign({}, PHONE, { width: 390 }), 'de', 'dark', 'bakery', 'creator'],
    [Object.assign({}, PHONE, { width: 320 }), 'en', 'dark', 'creator', 'services'], [DESKTOP, 'de', 'dark', 'services', 'restaurant']]) {
    const { page, api, external } = await onboarding({ viewport, lang, theme });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const de = lang === 'de', tag = viewport.width + ' ' + lang + ' ' + theme + ' ' + a + '->' + b;
    const NAME = de ? 'Bäckerei Sonne' : 'Café Sonne', DESC = de ? 'Frisches Brot.' : 'Fresh bread.';
    const notice = () => page.evaluate(() => { const n = document.getElementById('ob-switch'); const v = (x) => !!x && !x.hidden && getComputedStyle(x).display !== 'none';
      return { shown: v(n), kind: n.getAttribute('data-kind'), title: document.getElementById('ob-switch-title').textContent, text: document.getElementById('ob-switch-text').textContent,
        use: v(document.getElementById('ob-switch-use')) ? document.getElementById('ob-switch-use').textContent : null, undo: v(document.getElementById('ob-switch-undo')) ? document.getElementById('ob-switch-undo').textContent : null }; });
    const status = () => page.waitForFunction(() => document.getElementById('ob-design-status').textContent.length > 0, { timeout: 2000 }).then(() => text(page, '#ob-design-status'));
    await toTemplateStep4(page, { id: a, name: NAME, description: DESC });
    const sugA = await chosen(page);
    // A. untouched: switching follows the new template, no notice
    await page.click('#ob-back'); await sleep(200);
    await page.click('.ob-tpl[data-template="' + b + '"]'); await sleep(250);
    assert.equal((await notice()).shown, false, tag + ': untouched list: no notice');
    await page.click('#ob-next'); await sleep(250);
    const sugB = await chosen(page);
    assert.deepEqual(sugB, await page.evaluate((id) => window.QraivyOnboardingTemplates.get(id).sections.filter((x) => x !== 'socialMedia'), b), tag + ': follows ' + b + '\'s suggestions (no Step 2 links: no Social Media)');
    assert.notDeepEqual(sugB, sugA, tag + ': a pair with different suggestions');
    // B. customise on Step 4: two Custom Sections, a move, a removal
    await page.click('#ob-back'); await sleep(200);
    await page.click('.ob-tpl[data-template="' + a + '"]'); await sleep(250);
    assert.equal((await notice()).shown, false, tag + ': still untouched: no notice');
    await page.click('#ob-next'); await sleep(250);
    assert.deepEqual(await chosen(page), sugA);
    for (let i = 0; i < 2; i++) { await page.click('#ob-more [data-type="custom"] [data-act="add"]'); await sleep(120); }
    let cs = (await chosen(page)).filter((x) => x.startsWith('custom:'));
    await page.click('#ob-chosen [data-type="' + cs[1] + '"] [data-act="up"]'); await sleep(120);
    const dels = await page.$$('#ob-chosen [data-act="remove"]'); await dels[0].click(); await sleep(120);
    const mine = await chosen(page);
    // switch: kept, notice with the action; nothing replaced
    await page.click('#ob-back'); await sleep(200);
    await page.click('.ob-tpl[data-template="' + b + '"]'); await sleep(250);
    const nameB = await page.evaluate((id) => window.QraivyOnboardingTemplates.list(document.documentElement.lang === 'de' ? 'de' : 'en').filter((x) => x.id === id)[0].label, b);
    let n = await notice();
    assert.deepEqual([n.shown, n.kind, n.title, n.use, n.undo], [true, 'kept', de ? 'Ihre Abschnitte wurden beibehalten' : 'Your sections were kept',
      de ? 'Vorgeschlagene Abschnitte von ' + nameB + ' verwenden' : 'Use ' + nameB + (/s$/.test(nameB) ? '\'' : '\'s') + ' suggested sections', null], tag + ': kept notice (English possessive: Services\')');
    assert.ok(n.text.includes(String(mine.length)) && n.text.includes(de ? 'Ihre 2 eigenen Abschnitte' : 'your 2 Custom Sections'), tag + ': count and the Custom Section note: ' + n.text);
    assert.match(await status(), de ? /Ihre Abschnitte wurden beibehalten/ : /Your sections were kept/, tag + ': announced');
    await page.click('#ob-next'); await sleep(250);
    assert.deepEqual(await chosen(page), mine, tag + ': the customised list kept exactly (Custom Section ids too)');
    await page.click('#ob-back'); await sleep(200);
    assert.equal((await notice()).kind, 'kept', tag + ': Back / Next keep the notice');
    // C. Use suggested by keyboard
    await page.focus('#ob-switch-use'); await page.keyboard.press('Enter'); await sleep(250);
    n = await notice();
    assert.deepEqual([n.kind, n.use, n.undo], ['applied', null, de ? 'Rückgängig' : 'Undo'], tag + ': applied, Undo offered');
    assert.equal(n.title, de ? 'Die vorgeschlagenen Abschnitte von ' + nameB + ' sind auf Ihrer Seite' : nameB + (/s$/.test(nameB) ? '\'' : '\'s') + ' suggested sections are on your page');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-switch-undo', tag + ': focus on Undo');
    assert.equal(await page.$eval('#ob-switch-undo', (x) => x.getAttribute('aria-label')), (de ? 'Rückgängig: Ihre vorherigen ' : 'Undo: restore your previous ') + mine.length + (de ? ' Abschnitte wiederherstellen' : ' sections'));
    assert.match(await status(), de ? /sind jetzt auf Ihrer Seite/ : /are now on your page/, tag + ': announced');
    await page.click('#ob-next'); await sleep(250);
    assert.deepEqual(await chosen(page), sugB, tag + ': ' + b + '\'s suggested list');
    // D. reload keeps the applied state and its Undo
    await page.click('#ob-back'); await sleep(200);
    await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
    n = await notice();
    assert.deepEqual([n.shown, n.kind], [true, 'applied'], tag + ': reload keeps Undo');
    // E. Undo: the exact previous list and order, the same Custom Section ids
    await page.click('#ob-switch-undo'); await sleep(250);
    n = await notice();
    assert.equal(n.kind, 'kept', tag + ': back to the kept notice');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ob-switch-use', tag + ': focus on Use suggested');
    assert.match(await status(), de ? /Ihre vorherigen Abschnitte sind zurück/ : /Your previous sections are back/);
    await page.click('#ob-next'); await sleep(250);
    assert.deepEqual(await chosen(page), mine, tag + ': Undo restored the exact list (ids and order)');
    // F. a Step 4 edit ends the notice (no Undo over newer edits)
    await page.click('#ob-chosen [data-type="' + mine[mine.length - 1] + '"] [data-act="up"]'); await sleep(150);
    await page.click('#ob-back'); await sleep(200);
    assert.equal((await notice()).shown, false, tag + ': after a Step 4 edit: no notice');
    // Step 2 kept throughout
    await page.click('#ob-back'); await sleep(200);
    assert.deepEqual(await page.evaluate(() => [document.getElementById('ob-name').value, document.getElementById('ob-description').value]), [NAME, DESC], tag + ': Step 2 kept');
    // layout, contrast, targets (on the kept notice)
    await page.click('#ob-next'); await sleep(200);
    await page.click('.ob-tpl[data-template="' + a + '"]'); await sleep(250);
    if ((await notice()).shown) {
      const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.getElementById('ob-switch-use').getBoundingClientRect().height }));
      assert.ok(lay.sw <= lay.iw && lay.h >= 44, tag + ': ' + JSON.stringify(lay));
      for (const sel of ['#ob-switch-title', '#ob-switch-text', '#ob-switch-use']) {
        const r = await contrast(page, sel);
        assert.ok(r !== null && r >= 4.5, tag + ': ' + sel + ' contrast ' + r);
      }
    }
    assert.deepEqual(errors, [], tag + ': no script error');
    assert.deepEqual(api, []); assert.deepEqual(external, []);
    await page.close();
  }
});

// ── D2.2: Save Draft ──
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const saved201 = (slug = 'cafe-sonne-abc123', name = 'Café Sonne') => ({ status: 201, body: { created: true, page: { slug, name, status: 'draft', live: false, kind: 'business', renderer: 'legacy' }, revision: 1, design: {} } });
const saveUi = (page) => page.evaluate(() => {
  const b = document.getElementById('ob-finish'), n = document.getElementById('ob-save-note'), badge = document.querySelector('#ob-step-4 .ob-draft-badge');
  return { text: b.textContent, disabled: b.disabled, aria: b.getAttribute('aria-disabled'), busy: b.getAttribute('aria-busy'), note: n.textContent, tone: n.getAttribute('data-tone'),
    badge: badge.textContent, state: badge.getAttribute('data-state'), live: document.getElementById('ob-save-status').textContent, focus: document.activeElement && document.activeElement.id };
});
// a design as the server accepts it (E2: with the template's example content in the chosen sections): no phone number, no
// contact or map link, every link on the page itself or the customer's own social link, no example profile, Custom Sections empty
function checkSentDesign(body, tag) {
  const { readBody } = require('../src/lpV3/studioDraftsController');
  const r = readBody(body);
  assert.ok(!r.error, tag + ': the server accepts the body ' + JSON.stringify(r));
  const v = V3core.validateDesign(body.design, { cloudName: 'dwqc6n7rn' });
  assert.ok(v.ok, tag + ': a valid design ' + JSON.stringify(v.errors && v.errors.slice(0, 3)));
  assert.equal(body.design.settings.language, body.language);
  const secs = body.design.pages[0].sections, anchors = secs.map((s) => s.anchor).filter(Boolean);
  const onPage = (u) => !u || u === '/' || anchors.includes(String(u).slice(1));
  for (const s of secs) {
    const d = s.data || {};
    if (s.type === 'hero') assert.ok([d.primary, d.secondary].every((x) => !x || onPage(x.target)), tag + ': Hero buttons only to the page itself ' + JSON.stringify([d.primary, d.secondary]));
    if (s.type === 'buttons') assert.ok((d.items || []).every((x) => onPage(x.target)), tag + ': example buttons only to the page itself');
    if (s.type === 'products') assert.ok((d.items || []).every((x) => !x.target), tag + ': example products without a link');
    if (s.type === 'contact') assert.ok(!d.phone && !d.mapsUrl && !d.showMapLink && (!d.email || /@example\.com$/.test(d.email)), tag + ': no phone, no map link, only an example.com email ' + JSON.stringify(d));
    if (s.type === 'socialMedia') assert.ok((d.links || []).every((x) => !/^https:\/\/(www\.)?[a-z]+\.com\/$|^https:\/\/x\.com\/$/.test(x.url)), tag + ': no example profile (platform home page)');
    if (/^s_c/.test(s.id)) assert.ok(!d.heading && !d.body, tag + ': Custom Section empty');
  }
  assert.ok(!/tel:|wa\.me|mailto:/.test(JSON.stringify(body.design)), tag + ': no phone, WhatsApp or email link');
  const ids = new Set(secs.map((s) => s.id));
  assert.ok(body.origin.exampleSectionIds.every((id) => ids.has(id)), tag + ': example ids are sections of the design');
}
const V3core = require('../src/lpV3/core.js');

test('D2.2 Save Draft (desktop, English): one request (double click and Enter ignored while saving) with a stable requestId, the template page and origin, Custom Sections in order, E2: the preview\'s example content (no phone, no contact link); saved only after the server confirmed; kept across a reload; a later change is shown as not saved, never sent', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { page, api, external, posts } = await onboarding({ drafts: async () => { await gate; return saved201(); } });
  await toTemplateStep4(page, { id: 'restaurant', name: 'Café Sonne', link: 'instagram.com/cafesonne' });
  for (let i = 0; i < 2; i++) { await page.click('#ob-more [data-type="custom"] [data-act="add"]'); await sleep(120); }
  const cs = (await chosen(page)).filter((x) => x.startsWith('custom:'));
  await page.click('#ob-chosen [data-type="' + cs[1] + '"] [data-act="up"]'); await sleep(120);
  const order = await chosen(page);
  await page.click('#ob-next'); await sleep(300);
  let s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.badge, s.state, s.tone], ['Save Draft', false, 'Draft preview ready · Not saved', 'draft', 'info']);
  assert.deepEqual(api, [], 'nothing sent before the click');
  await page.click('#ob-finish');
  await page.click('#ob-finish').catch(() => {});
  await page.focus('#ob-finish').catch(() => {}); await page.keyboard.press('Enter');
  await sleep(150);
  s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.aria, s.busy, s.note, s.badge], ['Saving…', true, 'true', 'true', 'Saving your draft…', 'Draft preview ready · Not saved'], 'saving: not shown as saved yet');
  assert.equal(posts.length, 1, 'one request');
  const b = posts[0].body;
  assert.match(b.requestId, UUID4);
  assert.deepEqual([b.name, b.language, b.kind, posts[0].auth, posts[0].type.split(';')[0]], ['Café Sonne', 'en', 'business', 'Bearer tok', 'application/json']);
  assert.deepEqual(Object.keys(b).sort(), ['design', 'kind', 'language', 'name', 'origin', 'requestId']);
  assert.deepEqual(Object.keys(b.origin).sort(), ['exampleSectionIds', 'language', 'palette', 'source', 'template']);
  assert.deepEqual([b.origin.source, b.origin.template, b.origin.language], ['onboarding', 'restaurant', 'en']);
  const sentIds = b.design.pages[0].sections.map((x) => x.id);
  assert.deepEqual(sentIds.filter((id) => id.startsWith('s_c')), [cs[1], cs[0]].map((c) => 's_c' + c.slice(7)), 'Custom Sections with their ids, in the chosen order');
  assert.equal(sentIds.length, order.length);
  assert.deepEqual(b.design.pages[0].sections.find((x) => x.type === 'socialMedia').data.links, [{ platform: 'instagram', url: 'https://instagram.com/cafesonne' }], 'the customer\'s own link');
  assert.equal(b.design.pages[0].sections[0].data.headline, 'Café Sonne', 'the customer\'s name');
  checkSentDesign(b, 'en');
  release();
  await page.waitForFunction(() => document.getElementById('ob-finish').textContent === 'Open in Studio', { timeout: 4000 });
  s = await saveUi(page);
  assert.deepEqual([s.disabled, s.badge, s.state, s.tone, s.focus], [false, 'Draft saved · Not published', 'saved', 'success', 'ob-finish'], 'D2.3a: saved; the main button now opens the Studio (focused)');
  assert.equal(s.note, 'Your draft is saved privately in your QRAIVY account. It is not published. Open it in the Studio to keep editing.');
  await page.waitForFunction(() => /Draft saved\. It is private/.test(document.getElementById('ob-save-status').textContent), { timeout: 2000 });
  // reload: still saved (the address and revision kept), nothing sent again
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.badge], ['Open in Studio', false, 'Draft saved · Not published'], 'kept across a reload');
  const kept = await page.evaluate(() => { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k.startsWith('qraivy.onboarding.v1:')) return JSON.parse(sessionStorage.getItem(k)).draft; } return null; });
  assert.deepEqual([kept.status, kept.slug, kept.revision, kept.requestId], ['saved', 'cafe-sonne-abc123', 1, b.requestId]);
  assert.ok(!JSON.stringify(kept).includes('tok'), 'no token kept');
  // a later change: shown, never sent
  await page.click('#ob-back'); await sleep(200);
  await page.click('#ob-chosen [data-type="contact"] [data-act="up"]'); await sleep(150);
  await page.click('#ob-next'); await sleep(300);
  s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.badge, s.state, s.tone], ['Save changes', false, 'Draft saved · Later changes not saved', 'changed', 'warn'], 'D2.3a: offered, not sent');
  assert.match(s.note, /^You changed your page after saving\. These changes are not in your saved draft yet\./);
  assert.equal(posts.length, 1, 'no second draft');
  assert.ok(api.every((x) => / \S+\/studio\/drafts$/.test(x)), 'only the drafts endpoint: ' + api.join(', '));
  assert.ok(!api.some((x) => /trial|tier|stripe|publish|\/lp/.test(x)), 'no trial, plan, billing or publish request');
  assert.deepEqual(external, []);
  await page.close();
});

test('D2.2 failure and retry (phone 390, German, Dark): 503 -> error, nothing marked saved, the button again; the retry sends the SAME requestId; a reload while the request was open, then a retry: still the same requestId; no answer -> the network message', async () => {
  const replies = [{ status: 503, body: { error: 'Temporarily unavailable.' } }, 'hang', saved201('studio-sonne-x1y2z3', 'Studio Sonne')];
  const { page, posts } = await onboarding({ viewport: Object.assign({}, PHONE, { width: 390 }), lang: 'de', theme: 'dark', drafts: async (body, n) => replies[n - 1] || saved201() });
  await toTemplateStep4(page, { id: 'creator', name: 'Studio Sonne' });
  await page.click('#ob-more [data-type="custom"] [data-act="add"]'); await sleep(120);
  await page.click('#ob-next'); await sleep(300);
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-save-note').getAttribute('data-tone') === 'error', { timeout: 4000 });
  let s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.badge, s.state, s.focus], ['Entwurf speichern', false, 'Entwurfsvorschau bereit · Nicht gespeichert', 'draft', 'ob-finish']);
  assert.equal(s.note, 'Das Speichern ist vorübergehend nicht verfügbar. Bitte versuchen Sie es gleich noch einmal – es ging nichts verloren.');
  assert.equal(posts[0].body.kind, 'creator');
  checkSentDesign(posts[0].body, 'de creator');
  // retry: the request stays open; reload meanwhile
  await page.click('#ob-finish'); await sleep(200);
  assert.equal((await saveUi(page)).text, 'Wird gespeichert …');
  assert.equal(posts[1].body.requestId, posts[0].body.requestId, 'retry: the same requestId');
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(600);
  s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.state], ['Entwurf speichern', false, 'draft'], 'after a reload: not saved, ready again');
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').textContent === 'Im Studio öffnen', { timeout: 4000 });
  assert.equal(posts[2].body.requestId, posts[0].body.requestId, 'after the reload: still the same requestId');
  assert.deepEqual(posts[2].body, posts[0].body, 'the same request');
  s = await saveUi(page);
  assert.deepEqual([s.badge, s.state], ['Entwurf gespeichert · Nicht veröffentlicht', 'saved']);
  assert.match(s.note, /^Ihr Entwurf ist privat in Ihrem QRAIVY-Konto gespeichert\./);
  await page.close();
  // no answer at all
  const n = await onboarding({ drafts: async () => 'abort' });
  await toTemplateStep4(n.page, { id: 'bakery', name: 'Café Sonne' });
  await n.page.click('#ob-next'); await sleep(300);
  await n.page.click('#ob-finish');
  await n.page.waitForFunction(() => document.getElementById('ob-save-note').getAttribute('data-tone') === 'error', { timeout: 4000 });
  assert.equal((await saveUi(n.page)).note, 'Saving failed. Please check your connection and try again – nothing was lost.');
  await n.page.close();
});

test('D2.2 server answers, English and German: unverified, other 403, signed out, draft limit (3), rate limit (minutes / hours), invalid page, requestId conflict (a NEW requestId next time); each keeps the answers and is never shown as saved', async () => {
  const cases = [
    [{ status: 403, body: { error: 'email_unverified' } }, 'Please verify your email address before saving. Your answers are kept.', 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Ihre Angaben bleiben erhalten.'],
    [{ status: 403, body: { error: 'Not allowed.' } }, 'This account cannot save drafts here. Your answers are kept in this browser tab.', 'Mit diesem Konto können hier keine Entwürfe gespeichert werden. Ihre Angaben bleiben in diesem Browser-Tab erhalten.'],
    [{ status: 401, body: { error: 'Unauthorized.' } }, 'Your sign-in has expired. Please sign in again – your answers are kept.', 'Ihre Anmeldung ist abgelaufen. Bitte melden Sie sich erneut an – Ihre Angaben bleiben erhalten.'],
    [{ status: 409, body: { error: 'draft_limit', limit: 3, active: 3 } }, '3 drafts reached.\nOpen a draft and choose ⋮ → Delete draft to make room for a new draft.', '3 Entwürfe erreicht.\nÖffnen Sie einen Entwurf und wählen Sie ⋮ → Entwurf löschen, um Platz für einen neuen Entwurf zu schaffen.'],
    [{ status: 429, body: { error: 'draft_rate_limit', limit: 5, retryAfterSeconds: 90 } }, 'You have created several drafts recently. Please try again in about 2 minutes.', 'Sie haben in letzter Zeit mehrere Entwürfe erstellt. Bitte versuchen Sie es in etwa 2 Minuten erneut.'],
    [{ status: 429, body: { error: 'draft_rate_limit', limit: 5, retryAfterSeconds: 5400 } }, 'You have created several drafts recently. Please try again in about 2 hours.', 'Sie haben in letzter Zeit mehrere Entwürfe erstellt. Bitte versuchen Sie es in etwa 2 Stunden erneut.'],
    [{ status: 422, body: { error: 'design_invalid', errors: [] } }, 'Your page could not be saved because some content is not valid. Please check Steps 2 to 4 and try again.', 'Ihre Seite konnte nicht gespeichert werden, weil einige Inhalte ungültig sind. Bitte prüfen Sie die Schritte 2 bis 4 und versuchen Sie es erneut.'],
    [{ status: 409, body: { error: 'request_id_conflict' } }, 'Please try saving again.', 'Bitte versuchen Sie es erneut.'],
  ];
  for (const lang of ['en', 'de']) {
    let i = -1;
    const { page, posts } = await onboarding({ lang, drafts: async () => (cases[i] ? cases[i][0] : saved201()) });
    await toTemplateStep4(page, { id: 'beauty', name: 'Salon Sonne' });
    await page.click('#ob-next'); await sleep(300);
    for (i = 0; i < cases.length; i++) {
      const before = posts.length;
      const want = lang === 'de' ? cases[i][2] : cases[i][1];
      await page.click('#ob-finish');
      for (let k = 0; k < 80 && posts.length === before; k++) await sleep(50);
      assert.equal(posts.length, before + 1, lang + ' ' + i + ': one request per click');
      await page.waitForFunction((w) => document.getElementById('ob-save-note').textContent === w, { timeout: 4000 }, want).catch(() => {});
      const s = await saveUi(page);
      assert.equal(s.note, want, lang + ' ' + JSON.stringify(cases[i][0].body));
      await page.waitForFunction((w) => document.getElementById('ob-save-status').textContent === w, { timeout: 2000 }, want);
      if (cases[i][0].body.error === 'draft_limit') {
        // the draft limit: Save Draft disabled (grey), nothing sent on a click, Manage drafts to the Studio's page list; kept on Back / Next
        const lim = await page.evaluate(() => { const b = document.getElementById('ob-finish'), r = document.getElementById('ob-manage-row'), a = document.getElementById('ob-manage');
          return { limit: b.getAttribute('data-limit'), bg: getComputedStyle(b).backgroundColor, shown: !r.hidden && !!a.offsetParent, href: a.getAttribute('href'), text: a.textContent, focus: document.activeElement && document.activeElement.id }; });
        assert.deepEqual([s.disabled, s.aria, s.state, s.tone], [true, 'true', 'draft', 'error'], lang + ': limit: Save Draft disabled, not saved');
        assert.deepEqual([lim.limit, lim.shown, lim.href, lim.text, lim.focus], ['true', true, 'studio.html', lang === 'de' ? 'Entwürfe verwalten' : 'Manage drafts', 'ob-manage'], lang + ': limit ' + JSON.stringify(lim));
        assert.notEqual(lim.bg, 'rgb(255, 90, 31)', lang + ': not the orange of an available button');
        await page.$eval('#ob-finish', (b) => b.click()); await sleep(300);
        assert.equal(posts.length, before + 1, lang + ': at the limit nothing is sent');
        await page.click('#ob-back'); await sleep(200); await page.click('#ob-next'); await sleep(300);
        const back = await saveUi(page);
        assert.deepEqual([back.disabled, back.note], [true, want], lang + ': Back / Next keep the limit state and the message');
        assert.equal(await page.$eval('#ob-manage-row', (n) => n.hidden), false);
        await page.click('#ob-back'); await sleep(200);
        assert.equal(await page.$eval('#ob-manage-row', (n) => n.hidden), true, lang + ': Manage drafts only on Step 5');
        await page.click('#ob-next'); await sleep(300);
        // back in this tab (e.g. after managing drafts): Save Draft offered again, the server decides on the next click
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await sleep(100);
        assert.deepEqual([(await saveUi(page)).disabled, await page.$eval('#ob-manage-row', (n) => n.hidden)], [false, true], lang + ': available again on return');
        continue;
      }
      assert.deepEqual([s.disabled, s.state, s.tone], [false, 'draft', 'error'], lang + ' ' + i + ': not saved, can try again');
    }
    // the same requestId for every attempt until the conflict; after it a new one
    const ids = posts.map((p) => p.body.requestId);
    assert.equal(new Set(ids).size, 1, lang + ': one requestId for the same content');
    await page.click('#ob-finish'); await sleep(300);
    assert.notEqual(posts[posts.length - 1].body.requestId, ids[0], lang + ': after request_id_conflict a new requestId');
    assert.equal(await text(page, '#ob-progress-count'), lang === 'de' ? 'Schritt 5 von 5' : 'Step 5 of 5', 'still on Step 5');
    await page.close();
  }
});

test('D2.2 Save Draft states readable everywhere: ready, saving, error and saved at 390 / 320 and desktop, English and German, Light and Dark; no sideways scroll; 44 px target; contrast', async () => {
  for (const [viewport, lang, theme] of [[Object.assign({}, PHONE, { width: 390 }), 'en', 'light'], [Object.assign({}, PHONE, { width: 320 }), 'de', 'dark'], [Object.assign({}, PHONE, { width: 320 }), 'en', 'light'], [DESKTOP, 'de', 'dark']]) {
    const tag = viewport.width + ' ' + lang + ' ' + theme;
    let n = 0;
    const { page } = await onboarding({ viewport, lang, theme, drafts: async () => (++n === 1 ? { status: 409, body: { error: 'draft_limit', limit: 3, active: 3 } } : saved201()) });
    await toTemplateStep4(page, { id: 'retail', name: lang === 'de' ? 'Boutique Sonne' : 'Boutique Sun' });
    await page.click('#ob-next'); await sleep(300);
    const check = async (what) => {
      const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.getElementById('ob-finish').getBoundingClientRect().height }));
      assert.ok(lay.sw <= lay.iw && lay.h >= 44, tag + ' ' + what + ': ' + JSON.stringify(lay));
      for (const sel of ['#ob-save-note', '#ob-step-4 .ob-draft-badge']) {
        const r = await contrast(page, sel);
        assert.ok(r !== null && r >= 4.5, tag + ' ' + what + ': ' + sel + ' contrast ' + r);
      }
    };
    await check('ready');
    await page.click('#ob-finish');
    await page.waitForFunction(() => document.getElementById('ob-save-note').getAttribute('data-tone') === 'error', { timeout: 4000 });
    await check('error');
    // the draft limit: Manage drafts in reach (44 px), inside the screen, its text readable; Save Draft disabled
    const man = await page.evaluate(() => { const a = document.getElementById('ob-manage'), r = a.getBoundingClientRect(); return { h: r.height, l: r.left, r: r.right, iw: innerWidth, sw: document.documentElement.scrollWidth, dis: document.getElementById('ob-finish').disabled }; });
    assert.ok(man.dis && man.h >= 44 && man.l >= 0 && man.r <= man.iw + 0.5 && man.sw <= man.iw, tag + ' limit: ' + JSON.stringify(man));
    const mc = await contrast(page, '#ob-manage');
    assert.ok(mc !== null && mc >= 4.5, tag + ' limit: Manage drafts contrast ' + mc);
    await shot(page, 'd22-error-' + viewport.width + '-' + lang + '-' + theme + '.png');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // back in the tab: Save Draft offered again
    await sleep(100);
    await page.click('#ob-finish');
    await page.waitForFunction(() => document.getElementById('ob-save-note').getAttribute('data-tone') === 'success', { timeout: 4000 });
    await check('saved');
    await shot(page, 'd22-saved-' + viewport.width + '-' + lang + '-' + theme + '.png');
    await page.close();
  }
});

// ── D2.3a: the handoff to the Studio ──
const keptDraft = (page) => page.evaluate(() => { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k.startsWith('qraivy.onboarding.v1:')) return JSON.parse(sessionStorage.getItem(k)).draft || null; } return null; });
const leaveUi = (page) => page.evaluate(() => { const d = document.getElementById('ob-leave'); return { open: d.open, text: document.getElementById('ob-leave-text').textContent, focus: document.activeElement && document.activeElement.id }; });
const updated200 = (revision) => ({ status: 200, body: { revision, savedAt: '2026-11-07T10:0' + revision + ':00.000Z', design: {} } });
async function toSaved(page, { id = 'restaurant', name = 'Café Sonne', customs = 0 } = {}) {
  await toTemplateStep4(page, { id, name, link: 'instagram.com/cafesonne' });
  for (let i = 0; i < customs; i++) { await page.click('#ob-more [data-type="custom"] [data-act="add"]'); await sleep(120); }
  await page.click('#ob-next'); await sleep(300);
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 4000 });
}
// a change after saving: Contact one place up (Step 4), back to Step 5
async function changeAfterSave(page) {
  await page.click('#ob-back'); await sleep(200);
  await page.click('#ob-chosen [data-type="contact"] [data-act="up"]'); await sleep(150);
  await page.click('#ob-next'); await sleep(300);
}
// the browser's Back from the Studio (may be served from the page cache: no load event to wait for)
// ONE Back is enough: the Studio's preview updates add no history entries (studio-preview.js reload())
async function goBack(page) {
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 40 && !page.url().endsWith('/studio-onboarding.html'); i++) await sleep(50);
  assert.ok(page.url().endsWith('/studio-onboarding.html'), 'one Back: on the onboarding again (' + page.url() + ')');
  await page.waitForFunction(() => !document.getElementById('ob-done').hidden || !document.getElementById('ob-wizard').hidden, { timeout: 4000 });
  await sleep(200);
}
const STUDIO_URL = (slug) => 'https://' + V3 + '/studio.html?slug=' + slug;

test('D2.3a handoff (desktop, English): saved -> "Open in Studio" opens studio.html?slug=<the saved slug> (nothing created); back: the return screen, also after a reload; its Open in Studio again; Start a new page: Step 1, no kept draft, nothing sent, the next save a NEW requestId', async () => {
  let n = 0;
  const { page, posts, api } = await onboarding({ drafts: async () => (++n === 1 ? saved201('cafe-sonne-abc123') : saved201('salon-neu-def456', 'Salon Neu')) });
  await toSaved(page, { customs: 1 });
  let s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.focus, await visible(page, '#ob-open')], ['Open in Studio', false, 'ob-finish', false]);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-finish')]);
  assert.equal(page.url(), STUDIO_URL('cafe-sonne-abc123'), 'the Studio, at the saved draft');
  assert.equal(posts.length, 1, 'no second draft');
  assert.ok(!api.some((x) => /^POST /.test(x) && !/\/studio\/drafts$/.test(x)) && !api.some((x) => /^(PUT|DELETE) /.test(x)), 'nothing created or changed by the handoff: ' + api.join(', '));
  // back to the onboarding: the return screen, not the steps
  await goBack(page);
  assert.equal(await visible(page, '#ob-done'), true, 'return screen');
  assert.equal(await visible(page, '#ob-wizard'), false);
  assert.equal(await text(page, '#ob-done-text'), '“Café Sonne” is saved privately in your QRAIVY account and is not published. Continue editing it in the Studio, or start a new page.');
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await visible(page, '#ob-done'), true, 'return screen after a reload');
  assert.deepEqual([await text(page, '#ob-done-open'), await text(page, '#ob-done-new')], ['Open in Studio', 'Start a new page']);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-done-open')]);
  assert.equal(page.url(), STUDIO_URL('cafe-sonne-abc123'));
  await goBack(page);
  const before = api.length;
  await page.click('#ob-done-new'); await sleep(300);
  assert.equal(api.length, before, 'Start a new page sends nothing (the saved draft stays on the server)');
  assert.deepEqual([await visible(page, '#ob-step-0'), await visible(page, '#ob-done'), await keptDraft(page)], [true, false, null], 'Step 1, no kept draft state');
  assert.equal(await text(page, '#ob-progress-count'), 'Step 1 of 5');
  // a new page: saved as a new draft with a new requestId
  await toSaved(page, { id: 'beauty', name: 'Salon Neu' });
  assert.equal(posts.length, 2);
  assert.notEqual(posts[1].body.requestId, posts[0].body.requestId, 'a new requestId');
  assert.equal((await keptDraft(page)).slug, 'salon-neu-def456');
  await page.close();
});

test('D2.3a Save changes (phone 390, German, Dark): a change after saving -> one PUT to the saved slug with { design, baseRevision: 1 } only (no origin); saved -> revision 2 kept; the next change -> baseRevision 2; never a second draft', async () => {
  const { page, posts, putsSent } = await onboarding({ viewport: Object.assign({}, PHONE, { width: 390 }), lang: 'de', theme: 'dark', drafts: async () => saved201('studio-sonne-x1y2z3', 'Studio Sonne'), puts: async (b, n) => updated200(n + 1) });
  await toSaved(page, { id: 'creator', name: 'Studio Sonne', customs: 2 });
  const sentIds = posts[0].body.design.pages[0].sections.map((x) => x.id);
  await changeAfterSave(page);
  let s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.badge, s.tone], ['Änderungen speichern', false, 'Entwurf gespeichert · Spätere Änderungen nicht gespeichert', 'warn']);
  assert.equal(s.note, 'Sie haben Ihre Seite nach dem Speichern geändert. Diese Änderungen sind noch nicht in Ihrem gespeicherten Entwurf. Speichern Sie Ihre Änderungen oder öffnen Sie das Studio ohne sie.');
  assert.equal(await visible(page, '#ob-open'), true, 'the second way into the Studio');
  assert.equal(await text(page, '#ob-open'), 'Im Studio öffnen');
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 4000 });
  assert.equal(putsSent.length, 1);
  const p = putsSent[0];
  assert.deepEqual([p.slug, p.auth, Object.keys(p.body).sort(), p.body.baseRevision], ['studio-sonne-x1y2z3', 'Bearer tok', ['baseRevision', 'design'], 1], 'the design and the kept revision only');
  const ids = p.body.design.pages[0].sections.map((x) => x.id);
  assert.deepEqual([...ids].sort(), [...sentIds].sort(), 'the same sections, the same ids (Custom Sections included)');
  assert.ok(ids.indexOf('s_obcontact1') < sentIds.indexOf('s_obcontact1') || ids.join() !== sentIds.join(), 'the new order');
  assert.equal(ids.filter((x) => x.startsWith('s_c')).length, 2);
  checkSentDesign(Object.assign({}, posts[0].body, { design: p.body.design }), 'de update');
  s = await saveUi(page);
  assert.deepEqual([s.text, s.badge, s.state, s.tone, s.focus], ['Im Studio öffnen', 'Entwurf gespeichert · Nicht veröffentlicht', 'saved', 'success', 'ob-finish']);
  assert.equal(s.note, 'Ihre Änderungen sind in Ihrem Entwurf gespeichert. Er ist weiterhin privat und nicht veröffentlicht.');
  assert.equal(await visible(page, '#ob-open'), false);
  assert.deepEqual([(await keptDraft(page)).revision, (await keptDraft(page)).slug], [2, 'studio-sonne-x1y2z3']);
  // another change: built on revision 2
  await page.click('#ob-back'); await sleep(200);
  await page.click('#ob-chosen [data-type="contact"] [data-act="down"]'); await sleep(150);
  await page.click('#ob-next'); await sleep(300);
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 4000 });
  assert.deepEqual([putsSent.length, putsSent[1].body.baseRevision, (await keptDraft(page)).revision], [2, 2, 3]);
  // kept across a reload
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal((await saveUi(page)).text, 'Im Studio öffnen');
  assert.equal(posts.length, 1, 'never a second draft');
  await page.close();
});

test('D2.3a unsaved changes and conflicts (desktop, English): Open in Studio with a change asks first (modal, focus on Stay here; Escape and Stay here keep everything); 409 -> nothing overwritten, never sent again, only Open in Studio (asks with the conflict text); "Open Studio without these changes" goes', async () => {
  const { page, putsSent } = await onboarding({ drafts: async () => saved201(), puts: async () => ({ status: 409, body: { error: 'revision_conflict', currentRevision: 3, savedAt: '2026-11-07T10:00:00.000Z' } }) });
  await toSaved(page);
  await changeAfterSave(page);
  // the secondary button with unsaved changes: the question
  await page.click('#ob-open'); await sleep(150);
  let l = await leaveUi(page);
  assert.deepEqual([l.open, l.focus], [true, 'ob-leave-stay']);
  assert.equal(l.text, 'You changed your page after saving. These changes are not in your saved draft and will not appear in the Studio. To keep them, choose “Stay here” and then “Save changes”.');
  assert.equal(await text(page, '#ob-leave-title'), 'Leave your changes behind?');
  // keyboard: Tab to the second choice, Shift+Tab back; Escape closes, focus back on the button
  await page.keyboard.press('Tab'); assert.equal((await leaveUi(page)).focus, 'ob-leave-go');
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); assert.equal((await leaveUi(page)).focus, 'ob-leave-stay');
  await page.keyboard.press('Escape'); await sleep(150);
  l = await leaveUi(page);
  assert.deepEqual([l.open, l.focus, page.url().endsWith('/studio-onboarding.html')], [false, 'ob-open', true], 'Escape: stays, focus back');
  await page.click('#ob-open'); await sleep(100);
  await page.click('#ob-leave-stay'); await sleep(100);
  assert.deepEqual([(await leaveUi(page)).open, (await saveUi(page)).text], [false, 'Save changes'], 'Stay here: the changes and Save changes stay');
  // Save changes -> 409: nothing overwritten
  await page.click('#ob-finish');
  await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 4000 });
  let s = await saveUi(page);
  assert.deepEqual([s.text, s.disabled, s.badge, s.tone], ['Open in Studio', false, 'Draft saved · Newer version in the Studio', 'warn']);
  assert.equal(s.note, 'Your draft was changed in the Studio after you saved it here, so nothing was overwritten. Open the Studio to continue with your latest saved draft.');
  assert.equal(await visible(page, '#ob-open'), false);
  assert.deepEqual([(await keptDraft(page)).conflict, (await keptDraft(page)).revision], [true, 1], 'the conflict kept; the revision not moved on');
  // kept across a reload; never sent again
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal((await saveUi(page)).badge, 'Draft saved · Newer version in the Studio');
  await page.click('#ob-finish'); await sleep(150);
  l = await leaveUi(page);
  assert.deepEqual([l.open, l.text], [true, 'The changes you made here cannot be saved because your draft was changed in the Studio. They will be left behind. The Studio shows your latest saved draft.']);
  assert.equal(putsSent.length, 1, 'no second update after the conflict');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-leave-go')]);
  assert.equal(page.url(), STUDIO_URL('cafe-sonne-abc123'));
  assert.equal(putsSent.length, 1);
  await page.close();
});

test('D2.3a Save changes refused, English and German: expired session (401), another account / unverified (403), deleted draft (404), invalid (422), unavailable (503), no answer; the changes kept, the revision unchanged, Save changes again', async () => {
  const cases = [
    [{ status: 401, body: { error: 'Unauthorized.' } }, 'Your sign-in has expired. Please sign in again – your answers are kept.', 'Ihre Anmeldung ist abgelaufen. Bitte melden Sie sich erneut an – Ihre Angaben bleiben erhalten.'],
    [{ status: 403, body: { error: 'forbidden' } }, 'This draft cannot be changed with this account. Please check that you are signed in with the account that saved it and that your email address is verified. Your changes are kept in this browser tab.', 'Dieser Entwurf kann mit diesem Konto nicht geändert werden. Bitte prüfen Sie, ob Sie mit dem Konto angemeldet sind, mit dem Sie ihn gespeichert haben, und ob Ihre E-Mail-Adresse bestätigt ist. Ihre Änderungen bleiben in diesem Browser-Tab erhalten.'],
    [{ status: 404, body: { error: 'not_found' } }, 'This draft can no longer be found. Nothing was created or changed. Your changes are kept in this browser tab.', 'Dieser Entwurf ist nicht mehr auffindbar. Es wurde nichts erstellt oder geändert. Ihre Änderungen bleiben in diesem Browser-Tab erhalten.'],
    [{ status: 422, body: { error: 'design_invalid', errors: [] } }, 'Your page could not be saved because some content is not valid. Please check Steps 2 to 4 and try again.', 'Ihre Seite konnte nicht gespeichert werden, weil einige Inhalte ungültig sind. Bitte prüfen Sie die Schritte 2 bis 4 und versuchen Sie es erneut.'],
    [{ status: 503, body: {} }, 'Saving is temporarily unavailable. Please try again in a moment – nothing was lost.', 'Das Speichern ist vorübergehend nicht verfügbar. Bitte versuchen Sie es gleich noch einmal – es ging nichts verloren.'],
    ['abort', 'Saving is temporarily unavailable. Please try again in a moment – nothing was lost.', 'Das Speichern ist vorübergehend nicht verfügbar. Bitte versuchen Sie es gleich noch einmal – es ging nichts verloren.'],
  ];
  for (const lang of ['en', 'de']) {
    let i = 0;
    const { page, posts, putsSent } = await onboarding({ lang, drafts: async () => saved201(), puts: async () => cases[i][0] });
    await toSaved(page, { id: 'bakery', name: 'Bäckerei Sonne' });
    await changeAfterSave(page);
    for (i = 0; i < cases.length; i++) {
      const want = lang === 'de' ? cases[i][2] : cases[i][1];
      await page.click('#ob-finish');
      await page.waitForFunction((w) => document.getElementById('ob-save-note').textContent === w, { timeout: 4000 }, want).catch(() => {});
      const s = await saveUi(page);
      assert.equal(s.note, want, lang + ' ' + JSON.stringify(cases[i][0]));
      assert.deepEqual([s.text, s.disabled, s.tone, s.state], [lang === 'de' ? 'Änderungen speichern' : 'Save changes', false, 'error', 'changed'], lang + ' ' + i);
      assert.equal((await keptDraft(page)).revision, 1, 'the revision unchanged');
      await page.waitForFunction((w) => document.getElementById('ob-save-status').textContent === w, { timeout: 2000 }, want);
    }
    assert.deepEqual([putsSent.length, posts.length], [cases.length, 1], lang + ': one PUT per click, never a new draft');
    assert.ok(putsSent.every((p) => p.body.baseRevision === 1 && !('origin' in p.body)));
    await page.close();
  }
});

test('D2.3a another account in the same tab: its own (empty) progress, never the other account\'s return screen; back to the first account: its return screen', async () => {
  const { page } = await onboarding({ drafts: async () => saved201() });
  await toSaved(page);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-finish')]);
  await goBack(page);
  assert.equal(await visible(page, '#ob-done'), true);
  await page.evaluate(() => sessionStorage.setItem('__test_uid', 'user_test_B'));
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.deepEqual([await visible(page, '#ob-done'), await visible(page, '#ob-step-0')], [false, true], 'B: Step 1, not A\'s draft');
  assert.ok(!(await page.evaluate(() => document.body.innerText)).includes('Café Sonne'));
  await page.evaluate(() => sessionStorage.setItem('__test_uid', 'user_test_A'));
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert.equal(await visible(page, '#ob-done'), true, 'A: the return screen again');
  await page.close();
});

test('D2.3a readable everywhere: Save changes + Open in Studio, the leave question and the return screen at 390 / 320 and desktop, English and German, Light and Dark; no sideways scroll; 44 px targets; contrast', async () => {
  for (const [viewport, lang, theme] of [[Object.assign({}, PHONE, { width: 390 }), 'en', 'light'], [Object.assign({}, PHONE, { width: 320 }), 'de', 'dark'], [Object.assign({}, PHONE, { width: 320 }), 'en', 'light'], [Object.assign({}, PHONE, { width: 390 }), 'de', 'light'], [DESKTOP, 'de', 'dark'], [DESKTOP, 'en', 'light']]) {
    const tag = viewport.width + ' ' + lang + ' ' + theme;
    const { page } = await onboarding({ viewport, lang, theme, drafts: async () => saved201(), puts: async () => updated200(2) });
    await toSaved(page, { id: 'services', name: lang === 'de' ? 'Kanzlei Sonne' : 'Sun Law Office' });
    await changeAfterSave(page);
    const lay = (sels) => page.evaluate((ss) => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, boxes: ss.map((x) => { const r = document.querySelector(x).getBoundingClientRect(); return { x, h: r.height, l: r.left, r: r.right }; }) }), sels);
    const ok = async (what, sels, texts) => {
      const m = await lay(sels);
      assert.ok(m.sw <= m.iw, tag + ' ' + what + ': sideways scroll ' + m.sw + '/' + m.iw);
      for (const b of m.boxes) assert.ok(b.h >= 44 && b.l >= 0 && b.r <= m.iw + 0.5, tag + ' ' + what + ': ' + JSON.stringify(b));
      for (const sel of texts) { const r = await contrast(page, sel); assert.ok(r !== null && r >= 4.5, tag + ' ' + what + ': ' + sel + ' contrast ' + r); }
    };
    await ok('changed', ['#ob-finish', '#ob-open', '#ob-back'], ['#ob-save-note', '#ob-step-4 .ob-draft-badge', '#ob-open']);
    await shot(page, 'd23a-changed-' + viewport.width + '-' + lang + '-' + theme + '.png');
    await page.click('#ob-open'); await sleep(200);
    await ok('leave question', ['#ob-leave-stay', '#ob-leave-go'], ['#ob-leave-text', '#ob-leave-title', '#ob-leave-go']);
    const dlg = await page.$eval('#ob-leave', (d) => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, iw: innerWidth, ih: innerHeight }; });
    assert.ok(dlg.l >= 15 && dlg.r <= dlg.iw - 15 && dlg.t >= 0 && dlg.b <= dlg.ih, tag + ': the dialog inside the screen ' + JSON.stringify(dlg));
    await shot(page, 'd23a-leave-' + viewport.width + '-' + lang + '-' + theme + '.png', false);
    await page.click('#ob-leave-stay'); await sleep(100);
    await page.click('#ob-finish');
    await page.waitForFunction(() => document.getElementById('ob-finish').getAttribute('data-mode') === 'open', { timeout: 4000 });
    await ok('updated', ['#ob-finish'], ['#ob-save-note', '#ob-step-4 .ob-draft-badge']);
    await shot(page, 'd23a-updated-' + viewport.width + '-' + lang + '-' + theme + '.png');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#ob-finish')]);
    await goBack(page);
    await ok('return screen', ['#ob-done-open', '#ob-done-new'], ['#ob-done-text', '#ob-done-title', '#ob-done-new']);
    await shot(page, 'd23a-return-' + viewport.width + '-' + lang + '-' + theme + '.png');
    await page.close();
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
