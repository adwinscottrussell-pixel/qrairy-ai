// ============================================================
// studioDealsPreview.browser.test.js — Landing Page Studio V3, Phase D2:
// the owner's real Deals in the Studio preview, end to end (Chrome).
//
// The Studio talks to the REAL Deals routes (tests/helpers/studioDealsServer.js:
// dealRoutes -> dealController -> dealService on an in-memory database, with
// requireAuth). Only for this test, studio-routing.js is answered with an
// API address (no real Studio address has one in this phase) and the page
// gets a stand-in Clerk session. Checked:
// - exactly GET /deals/access, /deals/pages, /deals, from the Studio page
//   with the session token; nothing from the preview frames; nothing written;
// - only the deals the page shows customers right now; another account's
//   deal (even one placed on this page), drafts, archived, expired and
//   scheduled deals and unpublished edits never appear; owner text escaped;
//   the AI label on the starter image;
// - the inspector: the source block (state, the owner's pages, the deals
//   shown, the Deal Builder link), choosing a page sends nothing, the display
//   settings (title, number of cards) reach the preview;
// - every state distinct: sample (no API), loading, sign in, disabled,
//   error (server, network) with Try again; a failure never shows samples;
// - the full-size preview: the same deals, no script.
// Run: node tests/studioDealsPreview.browser.test.js (local only: needs Chrome)
// ============================================================
const S = require('./helpers/studioDealsServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
if (!CHROME || !puppeteer) { console.log('SKIP  studioDealsPreview.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const D = 's_deals01';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NEVER = ['UNPUBLISHED', 'DRAFT DEAL', 'ARCHIVED DEAL', 'EXPIRED DEAL', 'SCHEDULED DEAL', 'BEN BIKES DEAL', 'BEN ON ANNA PAGE', 'Ben sneak', 'Ben -10%', 'Live title'];
let browser, srv;

// open the Studio. api: answer studio-routing.js with the test server as the
// API (default) or keep the real file (false); token: the stand-in Clerk
// session's token, or null for no Clerk; respond(path): an override for an API request
async function open({ api = true, token = 'tok_anna', lang = 'de', width = 1440, height = 900, respond = null, wait = 'networkidle0' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((l, tok) => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', l); localStorage.setItem('qraivy.studio.templates', 'collapsed'); localStorage.removeItem('qraivy.studio.panels'); } catch (e) {}
    if (tok !== null) window.Clerk = { session: { getToken: function () { return Promise.resolve(tok); } } };
  }, lang, token);
  await page.setRequestInterception(true);
  const log = { api: [], images: [], external: [], errors: [] };
  page.on('pageerror', (e) => log.errors.push(e.message));
  page.on('dialog', (d) => { log.errors.push('dialog: ' + d.message()); d.dismiss(); });
  page.on('request', async (r) => {
    const u = new URL(r.url());
    const main = r.frame() === page.mainFrame();
    if (u.origin === srv.origin && u.pathname === '/js/studio/studio-routing.js' && api) {
      return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.QraivyStudioRouting = { resolve: function () { return null; }, PREVIEW_HOSTS: [] };' +
        'window.QRAIVY_STUDIO_ROUTING = { mode: "local", api: ' + JSON.stringify(srv.origin) + ', blocked: false };' });
    }
    if (u.origin === srv.origin && (u.pathname === '/deals' || u.pathname.startsWith('/deals/'))) {
      log.api.push({ method: r.method(), path: u.pathname + u.search, auth: r.headers().authorization || '', main, body: r.postData() || '' });
      const o = respond ? await respond(u.pathname) : null;
      if (o === 'abort') return r.abort('failed');
      if (o) return r.respond({ status: o.status, contentType: 'application/json', body: JSON.stringify(o.body || {}) });
      return r.continue();
    }
    if (u.host === 'res.cloudinary.com') { log.images.push({ url: r.url(), main }); return r.respond({ status: 200, contentType: 'image/png', body: PNG }); }
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (/^https?:$/.test(u.protocol) && u.origin !== srv.origin) { log.external.push(r.url()); return r.abort(); }
    return r.continue();
  });
  await page.goto(srv.origin + '/studio.html', { waitUntil: wait });
  return { page, log };
}
async function until(fn, what, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
const srcdoc = (page, device = 'desktop') => page.$eval('#st-canvas iframe[data-device="' + device + '"]', (f) => f.srcdoc);
async function section(page, device) {
  const h = await srcdoc(page, device);
  const i = h.indexOf('data-v3-id="' + D + '"');
  return i < 0 ? '' : h.slice(h.lastIndexOf('<section', i), h.indexOf('</section>', i));
}
const sectionHas = (page, s) => until(async () => (await section(page)).includes(s), 'the Deals section shows ' + s);
async function frame(page, device = 'desktop') { return (await page.$('#st-canvas iframe[data-device="' + device + '"]')).contentFrame(); }
// what the Deals section shows in a frame, read from the DOM
async function shown(page) {
  const fr = await frame(page);
  return fr.$eval('[data-v3-id="' + D + '"]', (n) => ({
    cls: n.className,
    titles: [...n.querySelectorAll('.v3-prod-name')].map((x) => x.textContent),
    offers: [...n.querySelectorAll('.v3-prod-price')].map((x) => x.textContent),
    descs: [...n.querySelectorAll('.v3-prod-desc')].map((x) => x.innerHTML),
    ai: [...n.querySelectorAll('.v3-ai')].map((x) => x.closest('.v3-deal') === n.querySelector('.v3-deal') ? 'first' : 'other'),
    imgs: [...n.querySelectorAll('img')].map((i) => i.getAttribute('src')),
    tiles: n.querySelectorAll('.v3-deal-noimg').length,
    samples: n.querySelectorAll('.v3-sample-card').length,
    badge: (n.querySelector('.v3-sample-badge') || {}).textContent || '',
    note: [...n.querySelectorAll('.v3-note, .v3-ph-note')].map((x) => x.textContent.trim()),
    injected: n.querySelectorAll('img[src="x"], b, script').length,
  }));
}
async function selectDeals(page) {
  await page.click('#st-tab-sections');
  await page.click('#st-outline [data-id="' + D + '"]');
  await page.click('[data-insp="content"]');
}
const source = (page) => page.$eval('#st-fields [data-path="deals"]', (n) => ({
  state: n.querySelector('.st-deals__status').getAttribute('data-state'), status: n.querySelector('.st-deals__status').textContent,
  pages: [...n.querySelectorAll('select option')].map((o) => o.value + '|' + o.textContent), pageHidden: n.querySelector('[data-path="deals.page"]').hidden,
  selected: n.querySelector('select').value, list: [...n.querySelectorAll('.st-deals__list li')].map((l) => l.textContent),
  withheld: n.querySelector('.st-deals__withheld').hidden ? '' : n.querySelector('.st-deals__withheld').textContent,
  retry: !n.querySelector('.st-deals__actions button').hidden,
  link: (({ href, target, rel }) => ({ href, target, rel }))({ href: n.querySelector('.st-deals__open').getAttribute('href'), target: n.querySelector('.st-deals__open').getAttribute('target'), rel: n.querySelector('.st-deals__open').getAttribute('rel') }),
}));
const API3 = ['GET /deals/access', 'GET /deals/pages', 'GET /deals'];
const calls = (log) => log.api.map((c) => c.method + ' ' + c.path);

test('signed in: exactly the three GET requests from the Studio page (token, no body); nothing from the frames; nothing written', async () => {
  const before = S.apiLog.length;
  const { page, log } = await open();
  await sectionHas(page, 'v3-deals-live');
  assert.deepEqual(calls(log), API3);
  for (const c of log.api) assert.deepEqual([c.auth, c.main, c.body], ['Bearer tok_anna', true, ''], c.path);
  assert.deepEqual(S.apiLog.slice(before).map((c) => c.method + ' ' + c.path + ' ' + c.auth), API3.map((x) => x + ' Bearer tok_anna'), 'what the server received');
  assert.deepEqual(S.writes, [], 'the database was never written to');
  assert.ok(log.images.length >= 2 && log.images.every((i) => !i.main), 'deal pictures load in the frames (Cloudinary only)');
  assert.deepEqual(log.external, []);
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('tenant isolation and eligibility: only the deals this page shows right now; never another account\'s, drafts, archived, expired, scheduled or unpublished edits', async () => {
  const { page, log } = await open();
  await sectionHas(page, 'v3-deals-live');
  for (const device of ['desktop']) {
    const s = await shown(page, device);
    assert.deepEqual(s.titles, ['<img src=x onerror=alert(1)>Frühstück', 'Kaffee & Kuchen'], 'Anna\'s two running deals, newest first, as text');
    assert.deepEqual(s.offers, ['2 für 1', '-20%']);
    assert.equal(s.injected, 0, 'owner text is never markup');
    assert.equal(s.descs[0], 'Jeden Montag<br>&lt;b&gt;fett&lt;/b&gt;');
    assert.deepEqual(s.ai, ['first'], 'the AI label on the starter image only');
    assert.deepEqual(s.imgs, ['https://res.cloudinary.com/dwqc6n7rn/image/upload/c_fill,g_auto,h_600,w_800,f_auto,q_auto/qraivy-deal-starters/bakery-bread-01.jpg', S.CLD_UPLOAD]);
    assert.equal(s.samples, 0);
    assert.equal(s.badge, 'Ihre Angebote');
    assert.ok(s.note.some((n) => n === 'Angebote mit unveröffentlichten Änderungen: 1. Ihre Live-Fassung kann hier nicht gezeigt werden.'), 'the deal with unpublished edits: counted, not shown');
  }
  const all = (await srcdoc(page)) + (await srcdoc(page, 'desktop')) + (await page.$eval('body', (b) => b.innerText));
  for (const w of NEVER) assert.ok(!all.includes(w), 'never shown: ' + w);
  assert.ok(!all.includes(S.CLD_UPLOAD.replace('c_fill,g_auto,h_900,w_1200/', '')), 'not the stored original');
  assert.ok(!/d_anna_|d_ben_|user_anna|user_ben/.test(all), 'no ids');
  // Ben signed in: only his page and deal, nothing of Anna's
  const ben = await open({ token: 'tok_ben' });
  await sectionHas(ben.page, 'v3-deals-live');
  assert.deepEqual((await shown(ben.page)).titles, ['BEN BIKES DEAL']);
  await selectDeals(ben.page);
  assert.deepEqual((await source(ben.page)).pages, ['ben-bikes|Ben Bikes']);
  const benAll = (await srcdoc(ben.page)) + (await ben.page.$eval('body', (b) => b.innerText));
  for (const w of ['Frühstück', 'Kaffee & Kuchen', 'Shop deal', 'Anna']) assert.ok(!benAll.includes(w), 'Ben never sees ' + w);
  assert.deepEqual(log.errors.concat(ben.log.errors), []);
  await page.close(); await ben.page.close();
});

test('the inspector: Deals / Offers editable; the source block; another page from the same answers (no request); title and number of cards reach the preview', async () => {
  const { page, log } = await open();
  await sectionHas(page, 'v3-deals-live');
  await selectDeals(page);
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  let src = await source(page);
  assert.equal(src.state, 'live');
  assert.equal(src.status, 'Deine echten Angebote: die, die diese Seite Kunden gerade zeigt.');
  assert.deepEqual(src.pages, ['anna-cafe|Anna Café', 'anna-shop|Anna Shop', 'anna-draft|Anna Entwurf (nicht live)'], 'only the signed-in account\'s pages');
  assert.equal(src.selected, 'anna-cafe');
  assert.deepEqual(src.list, ['<img src=x onerror=alert(1)>Frühstück', 'Kaffee & Kuchen']);
  assert.match(src.withheld, /unveröffentlichten Änderungen: 1\./);
  assert.deepEqual(src.link, { href: 'deals.html', target: '_blank', rel: 'noopener noreferrer' }, 'deals are edited in the Deal Builder');
  assert.equal(src.retry, false);
  assert.equal(await page.$$eval('#st-fields [data-path="deals"] input, #st-fields [data-path="deals"] textarea', (n) => n.length), 0, 'nothing of a deal can be edited here');
  // another page: its deals, from the answers already loaded
  const n = log.api.length;
  await page.select('#st-fields [data-path="deals.page"] select', 'anna-shop');
  await sectionHas(page, 'Shop deal');
  let s = await shown(page);
  assert.deepEqual([s.titles, s.tiles, s.imgs], [['Shop deal'], 1, []], 'a background deal: a plain tile, no picture');
  src = await source(page);
  assert.deepEqual([src.selected, src.list, src.withheld], ['anna-shop', ['Shop deal'], '']);
  await page.select('#st-fields [data-path="deals.page"] select', 'anna-draft');
  await sectionHas(page, 'v3-deals-none');
  assert.ok((await shown(page)).note.includes('Ihre Seite zeigt gerade keine Angebote.'));
  assert.equal((await source(page)).status, 'Diese Seite zeigt gerade keine Angebote.');
  assert.equal(log.api.length, n, 'choosing a page sent nothing');
  // display settings
  await page.select('#st-fields [data-path="deals.page"] select', 'anna-cafe');
  await sectionHas(page, 'Kaffee &amp; Kuchen');
  await page.select('#st-fields [data-path="data.maxItems"] select', '1');
  await until(async () => (await shown(page)).titles.length === 1, 'one card');
  assert.deepEqual(await page.$$eval('#st-fields [data-path="data.maxItems"] option', (o) => o.map((x) => x.value)), ['1', '2', '3']);
  await page.click('#st-fields [data-path="data.title"] input', { clickCount: 3 });
  await page.keyboard.type('Unsere Aktionen');
  await sectionHas(page, '<h2 class="v3-h2">Unsere Aktionen</h2>');
  // Undo restores the display settings; the deals stay the owner's
  await page.click('#st-undo-btn');
  await page.click('#st-undo-btn');
  await until(async () => (await shown(page)).titles.length === 2, 'two cards again');
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('every state is distinct, and a failure never shows samples', async () => {
  const noSamples = async (page, text, state) => {
    await sectionHas(page, 'v3-deals-' + state);
    const s = await shown(page);
    assert.equal(s.samples, 0, state + ': no sample cards');
    assert.equal(s.titles.length, 0, state + ': no cards');
    assert.ok(!/Beispiel/.test(s.badge), state + ': no sample badge');
    assert.ok(s.note.includes(text), state + ': ' + s.note.join(' | '));
  };
  // no session: nothing is sent
  let o = await open({ token: null });
  await noSamples(o.page, 'Melden Sie sich an, um Ihre Angebote hier zu sehen.', 'signin');
  assert.deepEqual(o.log.api, []);
  await selectDeals(o.page);
  assert.deepEqual([(await source(o.page)).state, (await source(o.page)).pageHidden], ['signin', true]);
  await o.page.close();
  // a token the server refuses (401)
  o = await open({ token: 'tok_forged' });
  await noSamples(o.page, 'Melden Sie sich an, um Ihre Angebote hier zu sehen.', 'signin');
  assert.deepEqual(calls(o.log), ['GET /deals/access']);
  await o.page.close();
  // Deals not available for the account (not in the rollout)
  const pilots = process.env.DEALS_PILOT_USER_IDS;
  process.env.DEALS_PILOT_USER_IDS = 'user_someone_else';
  try {
    o = await open();
    await noSamples(o.page, 'Angebote sind für dieses Konto nicht verfügbar.', 'disabled');
    assert.deepEqual(calls(o.log), ['GET /deals/access'], 'nothing else is asked for');
    await o.page.close();
  } finally { process.env.DEALS_PILOT_USER_IDS = pilots; }
  // a server error, then Try again
  let fail = true;
  o = await open({ respond: async (p) => (fail && p === '/deals/pages' ? { status: 500, body: { error: 'x' } } : null) });
  await noSamples(o.page, 'Ihre Angebote konnten nicht geladen werden. Es werden keine Beispiele gezeigt.', 'error');
  await selectDeals(o.page);
  let src = await source(o.page);
  assert.deepEqual([src.state, src.retry, src.status], ['error', true, 'Deine Angebote konnten nicht geladen werden. Es werden keine Beispiele gezeigt.']);
  fail = false;
  await o.page.click('#st-fields [data-path="deals"] .st-deals__actions button');
  await sectionHas(o.page, 'v3-deals-live');
  assert.equal((await source(o.page)).retry, false);
  assert.deepEqual(calls(o.log), ['GET /deals/access', 'GET /deals/pages', 'GET /deals/access', 'GET /deals/pages', 'GET /deals']);
  await o.page.close();
  // the network fails
  o = await open({ respond: async (p) => (p === '/deals' ? 'abort' : null) });
  await noSamples(o.page, 'Ihre Angebote konnten nicht geladen werden. Es werden keine Beispiele gezeigt.', 'error');
  await o.page.close();
  // loading: shown while the answer is on its way, never samples
  let release;
  const gate = new Promise((r) => { release = r; });
  o = await open({ respond: async (p) => { if (p === '/deals/access') await gate; return null; }, wait: 'load' });
  await noSamples(o.page, 'Ihre Angebote werden geladen …', 'loading');
  release();
  await sectionHas(o.page, 'v3-deals-live');
  await o.page.close();
});

test('no API address (every real Studio address in this phase): labelled samples that say so, and no request at all', async () => {
  const { page, log } = await open({ api: false });
  await sectionHas(page, 'v3-sample');
  const s = await shown(page);
  assert.deepEqual([s.samples, s.badge], [3, 'Beispiel']);
  assert.ok(s.note.includes('Beispielangebote: Ihre echten Angebote können auf dieser Adresse noch nicht geladen werden.'));
  await selectDeals(page);
  const src = await source(page);
  assert.deepEqual([src.state, src.status, src.pageHidden, src.retry], ['sample', 'Beispielangebote. Deine echten Angebote können auf dieser Adresse noch nicht geladen werden.', true, false]);
  await sleep(300);
  assert.deepEqual(log.api, [], 'not one request, although a session exists');
  assert.ok(!log.images.some((i) => /qraivy-deal-starters\/(?!bakery-(croissants|bread|coffee)-01)/.test(i.url)));
  await page.close();
});

test('the full-size preview: the same deals, no script; the Studio in English (the page keeps its own language)', async () => {
  const { page } = await open();
  await sectionHas(page, 'v3-deals-live');
  await page.click('#st-preview-btn');
  const full = await page.$eval('#st-full-frame', (f) => ({ html: f.srcdoc, sandbox: f.getAttribute('sandbox') }));
  assert.equal(full.sandbox, '');
  assert.ok(!/<script/i.test(full.html), 'no script at all');
  assert.ok(full.html.includes('&lt;img src=x onerror=alert(1)&gt;Frühstück') && full.html.includes('Kaffee &amp; Kuchen'));
  for (const w of NEVER) assert.ok(!full.html.includes(w), w);
  await page.close();
  const en = await open({ lang: 'en' });
  await sectionHas(en.page, 'v3-deals-live');
  const s = await shown(en.page);
  assert.equal(s.badge, 'Ihre Angebote', 'the page text follows the page language (German demo), not the Studio language');
  await selectDeals(en.page);
  assert.equal((await source(en.page)).status, 'Your real deals: those this page shows customers right now.');
  await en.page.close();
});

(async () => {
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  await browser.close(); await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
