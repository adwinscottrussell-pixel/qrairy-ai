// ============================================================
// studioPagesSave.browser.test.js — Landing Page Studio V3, Phase B in a
// real browser: Save Draft and reopen.
//
// The real Studio files against the real Studio page routes and Deals
// routes (helpers/studioPagesServer.js: in memory; only PageDesign may be
// written); the Clerk session is a stand-in token (the browser tests'
// pattern). Checked: Save Draft is enabled only on the owner's page with
// unsaved, valid changes; the save states; Ctrl / Cmd + S; a reload reopens
// the saved draft; Undo still works after saving; two tabs: the later save
// gets the conflict choice and nothing is overwritten; a failed save keeps
// the changes; leaving, switching pages and signing out ask first; a
// session end or account change clears the customer's page and deals at
// once; the saved Deals section shows the real deals after reopening;
// Publish stays disabled; the live page (LandingPage) is never written.
//
// Run: node tests/studioPagesSave.browser.test.js
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
const PAGES_AT_START = JSON.stringify(S.db.pages);

async function open({ token = 'tok_anna', query = '?slug=anna-cafe', dialog = 'accept' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((tok) => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', 'de'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); localStorage.removeItem('qraivy.studio.panels'); } catch (e) {}
    var listeners = [];
    var session = function (t) { return t === null ? null : { id: 'sess_' + t, getToken: function () { return Promise.resolve(t); } }; };
    window.__signOuts = 0;
    // signOut never finishes here, so the page stays to be checked (the real one then goes to login.html)
    if (tok !== null) window.Clerk = { session: session(tok), addListener: function (fn) { listeners.push(fn); }, signOut: function () { window.__signOuts++; return new Promise(function () {}); } };
    window.__setSession = function (t) { window.Clerk.session = session(t); listeners.forEach(function (fn) { fn({ session: window.Clerk.session }); }); };
  }, token);
  const log = { errors: [], dialogs: [], external: [] };
  page.on('pageerror', (e) => log.errors.push(e.message));
  page.on('dialog', (d) => { log.dialogs.push(d.type() + ': ' + d.message()); if (dialog === 'accept') d.accept(); else d.dismiss(); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (/^https?:$/.test(u.protocol) && u.origin !== srv.origin) { log.external.push(r.url()); return r.abort(); }
    return r.continue();
  });
  const before = S.apiLog.length;
  await page.goto(srv.origin + '/studio.html' + query, { waitUntil: 'networkidle0' });
  // Phase C.1: the preview starts phone-first; these checks use the desktop frame (picked as an owner would, then loaded)
  if (await page.evaluate(() => { const b = document.querySelector('button[data-device="desktop"]'); if (!b || !b.offsetParent || b.getAttribute('aria-checked') === 'true') return false; b.click(); return true; })) {
    const h = await page.$('#st-canvas iframe[data-device="desktop"]'); const f = h && await h.contentFrame();
    if (f) await f.waitForSelector('[data-v3-id]', { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  await until(async () => ['loaded', 'signin', 'empty', 'notfound', 'error'].includes(await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))), 'page bar settled');
  return { page, log, api: () => S.apiLog.slice(before).map((c) => c.method + ' ' + c.path) };
}
async function until(fn, what, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
const ui = (page) => page.evaluate(() => {
  const st = document.getElementById('st-save-status'), btn = document.getElementById('st-save-btn');
  return { save: !btn.disabled, ariaDisabled: btn.getAttribute('aria-disabled'), saveTitle: btn.title, state: st.hidden ? '' : st.getAttribute('data-state'), status: st.hidden ? '' : st.textContent, statusTitle: st.title,
    conflict: !document.getElementById('st-conflict').hidden, publish: !document.getElementById('st-publish-btn').disabled, mode: !document.getElementById('st-sample').hidden,
    page: document.getElementById('st-page-status').getAttribute('data-state'), source: document.getElementById('st-page-status').textContent, selected: document.getElementById('st-page-select').value,
    headline: (window.QraivyStudio.editor.draft().pages[0].sections[0].data || {}).headline, undo: !document.getElementById('st-undo-btn').disabled };
});
const srcdoc = (page) => page.$eval('#st-canvas iframe[data-device="desktop"]', (f) => f.srcdoc);
// type into the first section's headline (the page's Hero)
async function editHeadline(page, text, { replace = false } = {}) {
  await page.bringToFront();
  if (!(await page.$('#st-fields [data-path="data.headline"] input'))) {
    await page.click('#st-tab-sections');
    const first = await page.$eval('#st-outline [data-id]', (n) => n.getAttribute('data-id'));
    await page.click('#st-outline [data-id="' + first + '"]');
    await page.click('[data-insp="content"]');
  }
  const f = '#st-fields [data-path="data.headline"] input';
  await page.click(f);
  if (replace) { await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); } else await page.keyboard.press('End');
  await page.keyboard.type(text);
}
const saves = (api) => api().filter((c) => c.startsWith('PUT '));
const stored = (id) => S.db.pageDesigns.find((d) => d.landingPageId === id);

test('Save Draft: disabled until there is an unsaved change; the states Unsaved → Saving → Saved; one PUT; Undo still works; Publish stays disabled', async () => {
  S.resetDesigns();
  const { page, log, api } = await open();
  let u = await ui(page);
  assert.equal(u.page, 'loaded');
  assert.deepEqual([u.save, u.ariaDisabled, u.state, u.publish, u.mode], [false, 'true', '', false, false], 'freshly opened legacy page: nothing to save, no "Beispielseite" label');
  assert.match(u.saveTitle, /Ihre Live-Seite ändert sich nicht/);
  await editHeadline(page, 'Gespeichert im Studio', { replace: true });
  u = await until(async () => { const x = await ui(page); return x.save && x; }, 'Save enabled');
  assert.deepEqual([u.state, u.status, u.ariaDisabled], ['unsaved', 'Nicht gespeichert', 'false']);
  S.opts.saveDelayMs = 300;
  try {
    await page.click('#st-save-btn');
    u = await until(async () => { const x = await ui(page); return x.state === 'saving' && x; }, 'saving');
    assert.equal(u.status, 'Wird gespeichert …');
    assert.equal(u.save, false, 'no second save while one runs');
  } finally { S.opts.saveDelayMs = 0; }
  u = await until(async () => { const x = await ui(page); return x.state === 'saved' && x; }, 'saved');
  assert.deepEqual([u.status, u.save, u.source, u.publish], ['Gespeichert', false, 'Studio-Entwurf', false]);
  assert.match(u.statusTitle, /^Entwurf gespeichert um \d\d:\d\d\. Ihre Live-Seite ist unverändert\.$/);
  assert.deepEqual(saves(api), ['PUT /studio/pages/anna-cafe/design']);
  assert.equal(stored('lp_anna_cafe').draftRevision, 1);
  assert.equal(stored('lp_anna_cafe').draft.pages[0].sections[0].data.headline, 'Gespeichert im Studio');
  // Undo after saving: back to the opened version, which is now an unsaved change
  assert.equal(u.undo, true);
  await page.click('#st-undo-btn');
  u = await ui(page);
  assert.deepEqual([u.headline, u.state, u.save], ['Willkommen im Anna Café', 'unsaved', true]);
  await page.click('#st-redo-btn');
  u = await ui(page);
  assert.deepEqual([u.headline, u.state, u.save], ['Gespeichert im Studio', 'saved', false], 'Redo back to the saved version: clean');
  assert.deepEqual(log.errors, []);
  assert.deepEqual(log.external, []);
  await page.close();
});

test('reopen: a reload opens the saved draft (not the live page); the next save builds on its revision', async () => {
  const { page, api } = await open();
  let u = await ui(page);
  assert.deepEqual([u.page, u.source, u.headline, u.state], ['loaded', 'Studio-Entwurf', 'Gespeichert im Studio', 'saved']);
  assert.ok((await srcdoc(page)).includes('Gespeichert im Studio'));
  await editHeadline(page, ' 2');
  await page.click('#st-save-btn');
  await until(async () => (await ui(page)).state === 'saved', 'saved again');
  assert.equal(stored('lp_anna_cafe').draftRevision, 2);
  assert.deepEqual(saves(api), ['PUT /studio/pages/anna-cafe/design']);
  await page.close();
});

test('Ctrl + S and Cmd + S save (also while typing in a field); with nothing to save they send nothing and never open the browser’s save dialog', async () => {
  S.resetDesigns();
  const { page, api } = await open();
  await page.keyboard.down('Control'); await page.keyboard.press('s'); await page.keyboard.up('Control');
  await sleep(200);
  assert.deepEqual(saves(api), [], 'clean: nothing sent');
  await editHeadline(page, ' Strg', { replace: false });
  await page.keyboard.down('Control'); await page.keyboard.press('s'); await page.keyboard.up('Control');
  await until(async () => (await ui(page)).state === 'saved', 'saved with Ctrl+S');
  await page.keyboard.type(' Cmd');
  await page.keyboard.down('Meta'); await page.keyboard.press('s'); await page.keyboard.up('Meta');
  await until(async () => (await ui(page)).state === 'saved' && stored('lp_anna_cafe').draftRevision === 2, 'saved with Cmd+S');
  assert.match(stored('lp_anna_cafe').draft.pages[0].sections[0].data.headline, /Strg Cmd$/);
  assert.equal(saves(api).length, 2);
  // the key is taken by the Studio (no "Save page as")
  const prevented = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; });
  assert.equal(prevented, true);
  await page.close();
});

test('an invalid field: Save Draft stays disabled with the reason; fixing it enables it again', async () => {
  S.resetDesigns();
  const { page, api } = await open();
  await editHeadline(page, 'x');
  await page.evaluate(() => { const ed = window.QraivyStudio.editor; ed.set(ed.sectionIds()[0], ['data', 'headline'], 'x'.repeat(5000)); });
  let u = await ui(page);
  assert.deepEqual([u.save, u.state], [false, 'unsaved']);
  assert.equal(u.saveTitle, 'Korrigieren Sie das markierte Feld, um zu speichern.');
  await page.keyboard.down('Control'); await page.keyboard.press('s'); await page.keyboard.up('Control');
  await sleep(200);
  assert.deepEqual(saves(api), [], 'Ctrl+S sends nothing either');
  await page.evaluate(() => { const ed = window.QraivyStudio.editor; ed.set(ed.sectionIds()[0], ['data', 'headline'], 'Wieder gültig'); });
  u = await ui(page);
  assert.equal(u.save, true);
  await page.close();
});

test('two tabs: the later save gets "Conflict detected" — nothing overwritten; Keep editing keeps the changes (and the protection); Load saved version shows the other tab’s draft', async () => {
  S.resetDesigns();
  const a = await open({ query: '?slug=anna-shop' });
  const b = await open({ query: '?slug=anna-shop' });
  await editHeadline(b.page, ' von Tab B');
  await b.page.click('#st-save-btn');
  await until(async () => (await ui(b.page)).state === 'saved', 'tab B saved');
  assert.equal(stored('lp_anna_shop').draftRevision, 5);
  await editHeadline(a.page, ' von Tab A');
  await a.page.bringToFront(); await a.page.click('#st-save-btn');
  let u = await until(async () => { const x = await ui(a.page); return x.state === 'conflict' && x; }, 'tab A conflict');
  assert.deepEqual([u.status, u.conflict, u.headline], ['Konflikt erkannt', true, 'Anna Shop Entwurf von Tab A'], 'tab A keeps its changes');
  assert.match(await a.page.$eval('#st-conflict', (n) => n.textContent), /in einem anderen Tab oder auf einem anderen Gerät gespeichert\. Es wurde nichts überschrieben\./);
  assert.equal(stored('lp_anna_shop').draft.pages[0].sections[0].data.headline, 'Anna Shop Entwurf von Tab B', 'tab B’s draft is untouched');
  assert.equal(stored('lp_anna_shop').draftRevision, 5);
  // Keep editing: the box goes, the changes stay; saving again is still refused
  await a.page.bringToFront(); await a.page.click('#st-conflict-keep');
  u = await ui(a.page);
  assert.deepEqual([u.conflict, u.state, u.headline, u.save], [false, 'unsaved', 'Anna Shop Entwurf von Tab A', true]);
  await a.page.bringToFront(); await a.page.click('#st-save-btn');
  await until(async () => (await ui(a.page)).state === 'conflict', 'refused again');
  assert.equal(stored('lp_anna_shop').draft.pages[0].sections[0].data.headline, 'Anna Shop Entwurf von Tab B');
  // Load saved version (asks first: there are unsaved changes; accepted)
  await a.page.bringToFront(); await a.page.click('#st-conflict-load');
  u = await until(async () => { const x = await ui(a.page); return x.headline === 'Anna Shop Entwurf von Tab B' && x.page === 'loaded' && x; }, 'saved version loaded');
  assert.deepEqual([u.conflict, u.state, u.save], [false, 'saved', false]);
  assert.ok(a.log.dialogs.some((d) => /^confirm: Gespeicherte Fassung laden\?/.test(d)));
  // and from there tab A saves normally (revision 5 → 6)
  await editHeadline(a.page, ' + A');
  await a.page.bringToFront(); await a.page.click('#st-save-btn');
  await until(async () => (await ui(a.page)).state === 'saved', 'tab A saved on the new revision');
  assert.equal(stored('lp_anna_shop').draftRevision, 6);
  await a.page.close(); await b.page.close();
});

test('Load saved version, cancelled: the changes and the conflict choice stay', async () => {
  S.resetDesigns();
  const a = await open({ query: '?slug=anna-shop', dialog: 'dismiss' });
  const b = await open({ query: '?slug=anna-shop' });
  await editHeadline(b.page, ' B'); await b.page.click('#st-save-btn');
  await until(async () => (await ui(b.page)).state === 'saved', 'B saved');
  await editHeadline(a.page, ' A'); await a.page.bringToFront(); await a.page.click('#st-save-btn');
  await until(async () => (await ui(a.page)).state === 'conflict', 'A conflict');
  await a.page.bringToFront(); await a.page.click('#st-conflict-load');
  await sleep(200);
  const u = await ui(a.page);
  assert.deepEqual([u.conflict, u.headline], [true, 'Anna Shop Entwurf A']);
  await a.page.close(); await b.page.close();
});

test('a failed save: "Save failed", every change kept, Save Draft stays available; the retry saves', async () => {
  S.resetDesigns();
  const { page } = await open();
  await editHeadline(page, ' Fehlversuch');
  S.opts.failSave = true;
  try {
    await page.click('#st-save-btn');
    const u = await until(async () => { const x = await ui(page); return x.state === 'failed' && x; }, 'failed');
    assert.deepEqual([u.status, u.save, u.headline], ['Speichern fehlgeschlagen', true, 'Willkommen im Anna Café Fehlversuch']);
    assert.match(u.statusTitle, /Ihre Änderungen bleiben hier erhalten/);
    assert.equal(stored('lp_anna_cafe'), undefined, 'nothing stored');
  } finally { S.opts.failSave = false; }
  await page.click('#st-save-btn');
  await until(async () => (await ui(page)).state === 'saved', 'retry saved');
  assert.equal(stored('lp_anna_cafe').draft.pages[0].sections[0].data.headline, 'Willkommen im Anna Café Fehlversuch');
  await page.close();
});

test('leaving with unsaved changes asks first (browser prompt); after saving it does not', async () => {
  S.resetDesigns();
  let o = await open();
  await editHeadline(o.page, ' ungespeichert');
  await o.page.close({ runBeforeUnload: true });
  await until(async () => o.log.dialogs.some((d) => d.startsWith('beforeunload')), 'leave prompt');
  o = await open();
  await editHeadline(o.page, ' gespeichert');
  await o.page.click('#st-save-btn');
  await until(async () => (await ui(o.page)).state === 'saved', 'saved');
  const n = o.log.dialogs.length;
  await o.page.close({ runBeforeUnload: true });
  await sleep(300);
  assert.equal(o.log.dialogs.length, n, 'no prompt once saved');
});

test('switching pages: asks only while there are unsaved changes (not after saving, even with Undo history)', async () => {
  S.resetDesigns();
  const { page, log } = await open({ dialog: 'dismiss' });
  await editHeadline(page, ' A');
  await page.select('#st-page-select', 'anna-shop');
  await sleep(300);
  assert.equal(log.dialogs.length, 1);
  assert.match(log.dialogs[0], /^confirm: Andere Seite öffnen\?/);
  assert.equal((await ui(page)).selected, 'anna-cafe');
  await page.click('#st-save-btn');
  await until(async () => (await ui(page)).state === 'saved', 'saved');
  assert.equal((await ui(page)).undo, true);
  await page.select('#st-page-select', 'anna-shop');
  await until(async () => { const x = await ui(page); return x.selected === 'anna-shop' && x.page === 'loaded'; }, 'anna-shop open');
  assert.equal(log.dialogs.length, 1, 'no question after saving');
  await page.close();
});

test('Sign Out with unsaved changes asks first: Cancel keeps everything (no sign-out); OK clears the customer’s page at once, then signs out', async () => {
  S.resetDesigns();
  let o = await open({ query: '?slug=anna-shop', dialog: 'dismiss' });
  await until(async () => (await srcdoc(o.page)).includes('Shop-Angebot'), 'deal shown');
  await editHeadline(o.page, ' ungespeichert');
  await o.page.evaluate(() => document.getElementById('sb-signout').click());
  await sleep(200);
  assert.ok(o.log.dialogs.some((d) => /^confirm: Abmelden\?/.test(d)));
  assert.equal(await o.page.evaluate(() => window.__signOuts), 0, 'Cancel: not signed out');
  assert.equal((await ui(o.page)).headline, 'Anna Shop Entwurf ungespeichert');
  await o.page.close();
  o = await open({ query: '?slug=anna-shop', dialog: 'accept' });
  await editHeadline(o.page, ' ungespeichert');
  const after = await o.page.evaluate(() => { document.getElementById('sb-signout').click(); return { outs: window.__signOuts, headline: window.QraivyStudio.editor.draft().pages[0].sections[0].data.headline }; });
  assert.equal(after.outs, 1);
  assert.notEqual(after.headline, 'Anna Shop Entwurf ungespeichert', 'cleared before the sign-out');
  await until(async () => !(await srcdoc(o.page)).includes('Anna'), 'preview cleared');
  const html = await srcdoc(o.page);
  assert.ok(html.includes('Musterbäckerei') && !html.includes('Shop-Angebot'));
  assert.equal(await o.page.$eval('#st-page-select', (n) => n.options.length), 0, 'the selector no longer lists the customer’s pages');
  await o.page.close();
  // nothing to save: no question
  o = await open({ query: '?slug=anna-shop' });
  await o.page.evaluate(() => document.getElementById('sb-signout').click());
  assert.equal(o.log.dialogs.length, 0);
  assert.equal(await o.page.evaluate(() => window.__signOuts), 1);
  await o.page.close();
});

test('session expiry and account change: the customer’s page, unsaved changes and deals leave the Studio at once; a save answer arriving later is ignored', async () => {
  S.resetDesigns();
  const { page, log } = await open({ query: '?slug=anna-shop' });
  await until(async () => (await srcdoc(page)).includes('Shop-Angebot'), 'deal shown');
  await editHeadline(page, ' privat');
  // the session ends: synchronously, before anything is loaded again
  const now = await page.evaluate(() => {
    window.__setSession(null);
    const ed = window.QraivyStudio.editor;
    return { headline: ed.draft().pages[0].sections[0].data.headline, dirty: ed.dirty(), options: document.getElementById('st-page-select').options.length, save: !document.getElementById('st-save-btn').disabled };
  });
  assert.notEqual(now.headline, 'Anna Shop Entwurf privat');
  assert.deepEqual([now.dirty, now.options, now.save], [false, 0, false]);
  await until(async () => (await ui(page)).page === 'signin', 'sign-in state');
  let html = await srcdoc(page);
  assert.ok(!html.includes('Anna') && !html.includes('Shop-Angebot'), 'no customer content or deal');
  assert.ok(log.dialogs.length === 0, 'no prompt (another account must never see it)');
  await page.close();

  // another account while a save is on its way: Anna's save completes for Anna, Ben never sees her page
  S.resetDesigns();
  const o = await open({ query: '?slug=anna-shop' });
  await editHeadline(o.page, ' unterwegs');
  S.opts.saveDelayMs = 500;
  try {
    await o.page.click('#st-save-btn');
    await o.page.evaluate(() => window.__setSession('tok_ben'));
    const u = await ui(o.page);
    assert.notEqual(u.headline, 'Anna Shop Entwurf unterwegs');
    assert.equal(u.state, '', 'no save state for Ben');
    await until(async () => { const x = await ui(o.page); return x.selected === 'ben-bikes' && x.page === 'loaded'; }, 'Ben’s page');
    await sleep(700);
  } finally { S.opts.saveDelayMs = 0; }
  const u = await ui(o.page);
  assert.deepEqual([u.selected, u.state, u.save], ['ben-bikes', '', false], 'the late answer changed nothing for Ben');
  html = await srcdoc(o.page);
  for (const s of ['Anna', 'Shop-Angebot', 'unterwegs']) assert.ok(!html.includes(s), 'Ben sees ' + s);
  assert.equal(stored('lp_anna_shop').updatedByUserId, S.ANNA, 'the save was Anna’s own, on her page');
  assert.equal(S.db.pageDesigns.filter((d) => d.updatedByUserId === S.BEN).length, 0);
  await o.page.close();
});

test('a saved Deals / Offers section reopens with the owner’s real deals; another account’s deal never appears', async () => {
  S.resetDesigns();
  const { page } = await open({ query: '?slug=anna-shop' });
  await editHeadline(page, ' mit Angeboten');
  await page.click('#st-save-btn');
  await until(async () => (await ui(page)).state === 'saved', 'saved');
  await page.close();
  const o = await open({ query: '?slug=anna-shop' });
  await until(async () => (await srcdoc(o.page)).includes('Shop-Angebot'), 'the real deal after reopening');
  const html = await srcdoc(o.page);
  assert.ok(html.includes('Anna Shop Entwurf mit Angeboten') && html.includes('v3-deals-live') && !html.includes('BEN DEAL'));
  const d = stored('lp_anna_shop').draft.pages[0].sections.find((x) => x.type === 'dealsOffers');
  assert.ok(!JSON.stringify(d).includes('Shop-Angebot') && !JSON.stringify(d).includes('-15%'), 'deal content is never stored in the design');
  await o.page.close();
});

test('nothing to save without an owner page: the sample page (signed out, another account’s ?slug, no pages) never sends a save', async () => {
  for (const [tok, q] of [[null, ''], ['tok_ben', '?slug=anna-cafe'], ['tok_carl', '']]) {
    const { page, api } = await open({ token: tok, query: q });
    await page.evaluate(() => { const ed = window.QraivyStudio.editor; ed.set(ed.sectionIds()[0], ['data', 'headline'], 'Demo geändert'); });
    const u = await ui(page);
    assert.deepEqual([u.save, u.state, u.mode], [false, '', true], q + ': Save Draft disabled, labelled "Beispielseite"');
    assert.equal(u.saveTitle, 'Öffnen Sie eine Ihrer Seiten, um einen Entwurf zu speichern.');
    await page.keyboard.down('Control'); await page.keyboard.press('s'); await page.keyboard.up('Control');
    await sleep(150);
    assert.deepEqual(saves(api), []);
    await page.close();
  }
});

test('the live pages are never written: LandingPage rows unchanged, no PageDesignVersion, nothing but PageDesign create / updateMany; Publish never enabled', () => {
  assert.equal(JSON.stringify(S.db.pages), PAGES_AT_START, 'sections, renderer, status, updatedAt unchanged');
  assert.deepEqual(S.writes, [], 'no other write (LandingPage, PageDesignVersion, User, deals, billing)');
  assert.ok(S.db.pageDesigns.every((d) => d.publishedVersionId === null));
  const shell = fs.readFileSync(require('path').join(__dirname, '..', '..', 'frontend', 'public', 'js', 'studio', 'studio-shell.js'), 'utf8');
  assert.ok(!/st-publish-btn/.test(shell));
});

(async () => {
  if (!puppeteer || !CHROME) { console.log('studioPagesSave: SKIPPED (no puppeteer-core or Chrome)'); return; }
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioPagesSave');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  await browser.close();
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
