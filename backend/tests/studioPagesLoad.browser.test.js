// ============================================================
// studioPagesLoad.browser.test.js — Landing Page Studio V3, Phase A in a
// real browser: the signed-in owner's own pages open in the Studio.
//
// The real Studio files against the real Studio page routes and Deals
// routes on a read-only in-memory database (helpers/studioPagesServer.js);
// the Clerk session is a stand-in token (the browser tests' pattern).
// Checked: page selector with only the owner's pages; the newest page or
// ?slug=… opens; a legacy page shows its own content, a saved draft its
// draft with the owner's real deals; switching pages asks first when there
// are edits; another owner's page, no pages, signed out and a failing API
// each get their own state (the sample page stays, nothing else is shown);
// the editors keep working; the database is never written to.
//
// Run: node tests/studioPagesLoad.browser.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
let browser, srv;

async function open({ token = 'tok_anna', query = '', dialog = 'accept' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((tok) => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', 'de'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); localStorage.removeItem('qraivy.studio.panels'); } catch (e) {}
    // a stand-in Clerk whose session the test can end or switch (__setSession), like a real sign-out / account change
    var listeners = [];
    var session = function (t) { return t === null ? null : { id: 'sess_' + t, getToken: function () { return Promise.resolve(t); } }; };
    if (tok !== null) window.Clerk = { session: session(tok), addListener: function (fn) { listeners.push(fn); } };
    window.__setSession = function (t) { window.Clerk.session = session(t); listeners.forEach(function (fn) { fn({ session: window.Clerk.session }); }); };
  }, token);
  const log = { errors: [], dialogs: [], external: [] };
  page.on('pageerror', (e) => log.errors.push(e.message));
  page.on('dialog', (d) => { log.dialogs.push(d.message()); if (dialog === 'accept') d.accept(); else d.dismiss(); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (/^https?:$/.test(u.protocol) && u.origin !== srv.origin) { log.external.push(r.url()); return r.abort(); }
    return r.continue();
  });
  const before = S.apiLog.length;
  await page.goto(srv.origin + '/studio.html' + query, { waitUntil: 'networkidle0' });
  return { page, log, api: () => S.apiLog.slice(before).map((c) => c.method + ' ' + c.path) };
}
async function until(fn, what, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
const bar = (page) => page.evaluate(() => {
  const b = document.getElementById('st-pagebar'), s = document.getElementById('st-page-select');
  return { hidden: b.hidden, state: document.getElementById('st-page-status').getAttribute('data-state'), status: document.getElementById('st-page-status').textContent, title: document.getElementById('st-page-status').title,
    options: [...s.options].map((o) => o.value + '|' + o.textContent), selected: s.value, selectHidden: s.hidden,
    retry: !document.getElementById('st-page-retry').hidden, signin: !document.getElementById('st-page-signin').hidden, dashboard: !document.getElementById('st-page-dashboard').hidden,
    url: location.search, outline: [...document.querySelectorAll('#st-outline [data-id]')].map((n) => n.getAttribute('data-id')) };
});
const srcdoc = (page) => page.$eval('#st-canvas iframe[data-device="desktop"]', (f) => f.srcdoc);
const stateIs = (page, s) => until(async () => (await bar(page)).state === s, 'page state ' + s);

test('the owner opens the Studio: only their pages in the selector, the newest opens (legacy page converted in memory), ?slug is set', async () => {
  const { page, log, api } = await open();
  await stateIs(page, 'loaded');
  const b = await bar(page);
  assert.equal(b.hidden, false);
  assert.deepEqual(b.options, ['anna-cafe|Anna Café', 'anna-shop|Anna Shop', 'anna-draft|Anna Entwurf (nicht live)']);
  assert.equal(b.selected, 'anna-cafe');
  assert.equal(b.url, '?slug=anna-cafe');
  assert.equal(b.status, 'Aktuelle Seite', 'short in the bar');
  assert.equal(b.title, 'Ihre aktuelle Seite „Anna Café“, im Studio geöffnet. „Entwurf speichern“ sichert Ihre Änderungen; Ihre Live-Seite ändert sich nicht.', 'the full sentence as its title');
  assert.deepEqual(b.outline, ['s_hero', 's_buttons', 's_website'], 'the page’s own sections');
  const html = await srcdoc(page);
  assert.ok(html.includes('Willkommen im Anna Café') && html.includes('Frühstück &amp; Kuchen') && html.includes('Tisch reservieren'));
  assert.ok(!html.includes('Bäckerei') && !/Musterbäckerei|Tradition trifft Genuss/.test(html), 'the sample page is gone');
  for (const s of ['BEN', 'OWNERLESS', 'Ulm City']) assert.ok(!html.includes(s));
  const calls = api();
  assert.deepEqual(calls.filter((c) => c.includes('/studio/')), ['GET /studio/pages', 'GET /studio/pages/anna-cafe/design']);
  assert.ok(calls.every((c) => c.startsWith('GET ')), 'GET only: ' + calls.join(', '));
  assert.ok(await page.$eval('#st-save-btn', (n) => n.disabled) && await page.$eval('#st-publish-btn', (n) => n.disabled), 'freshly opened: nothing to save yet, Publish disabled (Save Draft itself: studioPagesSave.browser.test.js)');
  assert.deepEqual(log.errors, []);
  assert.deepEqual(log.external, []);
  await page.close();
});

test('?slug=anna-shop opens the saved draft; its Deals / Offers section shows the owner’s real deal for that page', async () => {
  const { page, log } = await open({ query: '?slug=anna-shop' });
  await stateIs(page, 'loaded');
  const b = await bar(page);
  assert.equal(b.selected, 'anna-shop');
  assert.equal(b.status, 'Studio-Entwurf');
  assert.match(b.title, /Ihr gespeicherter Studio-Entwurf von „Anna Shop“/);
  assert.deepEqual(b.outline, ['s_hero01', 's_deals01']);
  await until(async () => (await srcdoc(page)).includes('Shop-Angebot'), 'the real deal in the preview');
  const html = await srcdoc(page);
  assert.ok(html.includes('Anna Shop Entwurf') && html.includes('v3-deals-live') && html.includes('-15%'));
  assert.ok(!html.includes('LEGACY SHOP TITLE') && !html.includes('BEN DEAL') && !html.includes('Beispielangebot'));
  await page.click('#st-tab-sections');
  await page.click('#st-outline [data-id="s_deals01"]');
  await page.click('[data-insp="content"]');
  assert.equal(await page.$eval('#st-fields [data-path="deals"] select', (n) => n.value), 'anna-shop', 'the Deals source follows the open page');
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('the editors keep working on the owner’s page; switching pages with edits asks first (Cancel keeps the page, OK opens the other)', async () => {
  const { page, log } = await open({ query: '?slug=anna-cafe', dialog: 'dismiss' });
  await stateIs(page, 'loaded');
  await page.click('#st-tab-sections');
  await page.click('#st-outline [data-id="s_hero"]');
  await page.click('[data-insp="content"]');
  const f = '#st-fields [data-path="data.headline"] input';
  await page.click(f);
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.type('Neu bei Anna');
  await until(async () => (await srcdoc(page)).includes('Neu bei Anna'), 'the edit in the preview');
  await page.select('#st-page-select', 'anna-shop');
  await sleep(300);
  assert.equal(log.dialogs.length, 1);
  assert.match(log.dialogs[0], /Andere Seite öffnen\?/);
  let b = await bar(page);
  assert.equal(b.selected, 'anna-cafe', 'Cancel: still Anna Café, the edit kept');
  assert.ok((await srcdoc(page)).includes('Neu bei Anna'));
  await page.close();
  const o = await open({ query: '?slug=anna-cafe', dialog: 'accept' });
  await stateIs(o.page, 'loaded');
  await o.page.click('#st-tab-sections');
  await o.page.click('#st-outline [data-id="s_hero"]');
  await o.page.click('[data-insp="content"]');
  await o.page.click(f);
  await o.page.keyboard.type('!');
  await o.page.select('#st-page-select', 'anna-shop');
  await until(async () => (await bar(o.page)).selected === 'anna-shop' && (await bar(o.page)).state === 'loaded', 'Anna Shop open');
  b = await bar(o.page);
  assert.equal(b.url, '?slug=anna-shop');
  assert.equal(await o.page.$eval('#st-undo-btn', (n) => n.disabled), true, 'a fresh start: no Undo into the other page');
  await o.page.close();
});

test('another owner: an address of Anna’s page is "not one of your pages" — never requested, nothing of hers shown, the sample page stays', async () => {
  const { page, api } = await open({ token: 'tok_ben', query: '?slug=anna-cafe' });
  await stateIs(page, 'notfound');
  const b = await bar(page);
  assert.equal(b.status, 'Nicht Ihre Seite');
  assert.equal(b.title, 'Diese Seite gehört nicht zu Ihren Seiten.');
  assert.deepEqual(b.options, ['ben-bikes|Ben Bikes']);
  assert.ok(!api().some((c) => c.includes('anna-cafe')), 'the design of another owner’s page is not even asked for');
  const html = await srcdoc(page);
  assert.ok(!html.includes('Anna') && html.includes('Musterbäckerei'), 'the sample page stays');
  await page.close();
});

test('no pages yet: an empty state with a way to the dashboard; nothing is created; the sample page stays', async () => {
  const { page, api } = await open({ token: 'tok_carl' });
  await stateIs(page, 'empty');
  const b = await bar(page);
  assert.equal(b.status, 'Noch keine Landingpage');
  assert.match(b.title, /Sie haben noch keine Landingpage/);
  assert.equal(b.dashboard, true);
  assert.equal(b.selectHidden, true);
  assert.deepEqual(api().filter((c) => c.includes('/studio/')), ['GET /studio/pages']);
  assert.ok((await srcdoc(page)).includes('Musterbäckerei'));
  await page.close();
});

test('signed out: "sign in" state, no Studio request at all; a failing API: error state with Try again, which then opens the page', async () => {
  let o = await open({ token: null });
  await stateIs(o.page, 'signin');
  assert.equal((await bar(o.page)).status, 'Bitte anmelden');
  assert.match((await bar(o.page)).title, /Melden Sie sich an/);
  assert.deepEqual(o.api().filter((c) => c.includes('/studio/')), []);
  await o.page.close();
  S.opts.failList = true;
  try {
    o = await open();
    await stateIs(o.page, 'error');
    const b = await bar(o.page);
    assert.equal(b.retry, true);
    assert.equal(b.status, 'Seiten nicht geladen');
    assert.match(b.title, /Ihre Seiten konnten nicht geladen werden/);
    assert.ok((await srcdoc(o.page)).includes('Musterbäckerei'), 'a failure keeps the sample page; nothing else is shown');
  } finally { S.opts.failList = false; }
  await o.page.click('#st-page-retry');
  await stateIs(o.page, 'loaded');
  assert.equal((await bar(o.page)).selected, 'anna-cafe');
  await o.page.close();
});

const DEMO_OUTLINE = ['s_hero01', 's_quick01', 's_deals01', 's_loyal01', 's_prod01', 's_text01', 's_gal01', 's_hours01', 's_contact1', 's_social01'];
const ANNA_STRINGS = ['Anna', 'Willkommen im Anna', 'Shop-Angebot', 'Tisch reservieren'];
async function noAnna(page, label) {
  const html = await srcdoc(page);
  for (const s of ANNA_STRINGS) assert.ok(!html.includes(s), label + ': preview still shows ' + s);
  const b = await bar(page);
  assert.ok(!b.options.some((o) => o.startsWith('anna-')), label + ': selector still lists Anna’s pages');
  assert.deepEqual(b.outline, DEMO_OUTLINE, label + ': the sample page in the editor');
  assert.ok(html.includes('Musterbäckerei'), label + ': the sample page in the preview');
}

test('check 1 — empty account: empty state, dashboard link, no selector, the sample page, no page created', async () => {
  const { page, api } = await open({ token: 'tok_carl' });
  await stateIs(page, 'empty');
  const b = await bar(page);
  assert.equal(b.dashboard, true);
  assert.equal(await page.$eval('#st-page-dashboard', (n) => n.getAttribute('href')), 'dashboard.html?section=sqr');
  assert.equal(b.selectHidden, true);
  assert.equal(b.retry || b.signin, false);
  assert.deepEqual(b.outline, DEMO_OUTLINE);
  assert.deepEqual(api().filter((c) => c.includes('/studio/')), ['GET /studio/pages']);
  assert.deepEqual(S.writes, []);
  await page.close();
});

test('check 2 — unauthorized page: another owner’s and an ownerless page’s ?slug fall back to the sample page, nothing selected, never requested', async () => {
  for (const [tok, slug] of [['tok_ben', 'anna-cafe'], ['tok_anna', 'ulm-city'], ['tok_anna', 'ben-bikes']]) {
    const { page, api } = await open({ token: tok, query: '?slug=' + slug });
    await stateIs(page, 'notfound');
    const b = await bar(page);
    assert.equal(b.selected, '', slug + ': nothing chosen in the selector');
    assert.deepEqual(b.outline, DEMO_OUTLINE, slug);
    assert.ok(!api().some((c) => c.includes('/' + slug + '/')), slug + ': its design is never requested');
    const html = await srcdoc(page);
    for (const s of ['OWNERLESS', 'BEN BIKES SECRET', 'Willkommen im Anna']) assert.ok(!html.includes(s), slug + ' shows ' + s);
    await page.close();
  }
});

test('check 3 — sign-out and account changes clear the customer’s content (editor, preview, selector, deals); no "unsaved changes" prompt for another account', async () => {
  const { page, log } = await open({ query: '?slug=anna-shop' });
  await stateIs(page, 'loaded');
  await until(async () => (await srcdoc(page)).includes('Shop-Angebot'), 'Anna’s deal shown');
  // an edit, so a page switch would normally ask first
  await page.click('#st-tab-sections'); await page.click('#st-outline [data-id="s_hero01"]'); await page.click('[data-insp="content"]');
  await page.click('#st-fields [data-path="data.headline"] input'); await page.keyboard.type(' X');
  await page.evaluate(() => window.__setSession(null));
  await stateIs(page, 'signin');
  await noAnna(page, 'signed out');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true, 'no Undo back into Anna’s page');
  await page.evaluate(() => window.__setSession('tok_carl'));
  await stateIs(page, 'empty');
  await noAnna(page, 'account without pages');
  await page.evaluate(() => window.__setSession('tok_ben'));
  await stateIs(page, 'loaded');
  const b = await bar(page);
  assert.deepEqual([b.selected, b.options], ['ben-bikes', ['ben-bikes|Ben Bikes']]);
  await noAnnaPreviewOnly(page);
  assert.deepEqual(log.dialogs, [], 'no prompt about another account’s unsaved page');
  assert.deepEqual(log.errors, []);
  await page.close();
});
async function noAnnaPreviewOnly(page) { const html = await srcdoc(page); for (const s of ANNA_STRINGS) assert.ok(!html.includes(s), 'Ben sees ' + s); }

test('check 4 — page switching keeps each page’s deals separate: anna-shop shows its deal, anna-cafe none, back again; the Deals source follows', async () => {
  const { page, log } = await open({ query: '?slug=anna-shop' });
  await stateIs(page, 'loaded');
  await until(async () => (await srcdoc(page)).includes('Shop-Angebot'), 'anna-shop deal');
  await page.select('#st-page-select', 'anna-cafe');
  await until(async () => (await bar(page)).selected === 'anna-cafe' && (await bar(page)).state === 'loaded', 'anna-cafe open');
  assert.ok(!(await srcdoc(page)).includes('Shop-Angebot'), 'anna-shop’s deal does not follow to anna-cafe');
  await page.select('#st-page-select', 'anna-shop');
  await until(async () => (await bar(page)).selected === 'anna-shop' && (await srcdoc(page)).includes('Shop-Angebot'), 'back on anna-shop with its deal');
  await page.click('#st-tab-sections'); await page.click('#st-outline [data-id="s_deals01"]'); await page.click('[data-insp="content"]');
  assert.equal(await page.$eval('#st-fields [data-path="deals"] select', (n) => n.value), 'anna-shop');
  assert.ok(!(await srcdoc(page)).includes('BEN DEAL'));
  assert.deepEqual(log.errors, []);
  await page.close();
  // and the shell never shows another page's deals for the open page (the Deals data falls back to another page for an unknown slug)
  const shell = fs.readFileSync(require('path').join(__dirname, '..', '..', 'frontend', 'public', 'js', 'studio', 'studio-shell.js'), 'utf8');
  assert.ok(shell.includes("return view.page === slug ? view : { state: 'none', pages: view.pages, page: slug, items: [], withheld: 0 };"));
});

test('check 5 — the page bar text fits: short labels when a page is open (full sentence as title), messages at most two lines, at 1440 / 1280 / 1024 / 390 px', async () => {
  const fits = (page) => page.$eval('#st-page-status', (n) => ({ text: n.textContent, title: n.title, clipped: n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1, lines: Math.round(n.clientHeight / parseFloat(getComputedStyle(n).lineHeight)) }));
  const cases = [['tok_anna', '?slug=anna-cafe', 'loaded'], ['tok_anna', '?slug=anna-shop', 'loaded'], ['tok_carl', '', 'empty'], ['tok_ben', '?slug=anna-cafe', 'notfound'], [null, '', 'signin']];
  const out = [];
  for (const width of [1440, 1280, 1024, 390]) {
    for (const [tok, q, st] of cases) {
      const { page } = await open({ token: tok, query: q });
      await page.setViewport({ width, height: 900 });
      await stateIs(page, st);
      await sleep(150);
      const f = await fits(page);
      out.push(width + ' ' + st + ' ' + JSON.stringify(f.text) + (f.clipped ? ' CLIPPED' : '') + ' lines=' + f.lines);
      assert.equal(f.clipped, false, width + 'px ' + st + ': text cut off: ' + f.text);
      assert.ok(f.lines <= 2, width + 'px ' + st + ': more than two lines');
      assert.ok(f.title.length >= f.text.length, 'the full text is the title');
      if (width === 1280 && tok === 'tok_anna' && q === '?slug=anna-shop') await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'studio-pagebar-1280.png'), clip: { x: 0, y: 0, width: 1280, height: 90 } });
      await page.close();
    }
  }
  console.log('      ' + out.join('\n      '));
});

test('the database was never written to (all of the above)', () => {
  assert.deepEqual(S.writes, []);
});

(async () => {
  if (!puppeteer || !CHROME) { console.log('studioPagesLoad: SKIPPED (no puppeteer-core or Chrome)'); return; }
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioPagesLoad');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  await browser.close();
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
