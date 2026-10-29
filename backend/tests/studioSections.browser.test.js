// ============================================================
// studioSections.browser.test.js — Landing Page Studio V3, Phase C in a
// real browser: adding, moving, duplicating and removing sections.
//
// The real Studio against the real Studio page and Deals routes
// (helpers/studioPagesServer.js: in memory; only PageDesign may be written);
// the Clerk session is a stand-in token. Checked: the Add library (every
// type, the one-per-page limits, Loyalty "Demnächst verfügbar", 40
// sections); a new section is selected with its editor open and shown in
// the preview; Move up / down (buttons and Alt + arrows, announced, focus
// kept); Duplicate (not Hero / Deals / Loyalty); Remove (asks when there is
// content, for the only Hero and for links, which then point to the page
// top; Cancel keeps everything; Undo brings it all back); Save Draft and
// reopen keep the exact order; page switching asks; Deals stay the open
// page's; another account never sees the page; the live page is never
// written; desktop and tablet layouts.
//
// Run: node tests/studioSections.browser.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
const SHOTS = process.env.STUDIO_SHOTS || '';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
let browser, srv;
const PAGES_AT_START = JSON.stringify(S.db.pages);

async function open({ token = 'tok_anna', query = '?slug=anna-cafe', dialog = 'accept', width = 1440 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await page.evaluateOnNewDocument((tok) => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', 'de'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); localStorage.removeItem('qraivy.studio.panels'); } catch (e) {}
    var listeners = [], session = function (t) { return t === null ? null : { id: 'sess_' + t, getToken: function () { return Promise.resolve(t); } }; };
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
  await page.goto(srv.origin + '/studio.html' + query, { waitUntil: 'networkidle0' });
  await until(async () => ['loaded', 'signin', 'empty', 'notfound'].includes(await page.$eval('#st-page-status', (n) => n.getAttribute('data-state'))), 'page bar settled');
  return { page, log };
}
async function until(fn, what, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
const ids = (page) => page.evaluate(() => window.QraivyStudio.editor.sectionIds());
const types = (page) => page.evaluate(() => window.QraivyStudio.editor.draft().pages[0].sections.map((s) => s.type));
const outline = (page) => page.$$eval('#st-outline .st-outline__item', (ns) => ns.map((n) => n.getAttribute('data-id')));
const lib = (page) => page.$$eval('#st-lib .st-lib__item', (ns) => Object.fromEntries(ns.map((n) => [n.getAttribute('data-type'), { disabled: n.getAttribute('aria-disabled') === 'true', badge: (n.querySelector('.st-lib__badge') || {}).textContent || '', title: n.title }])));
const srcdoc = (page) => page.$eval('#st-canvas iframe[data-device="desktop"]', (f) => f.srcdoc);
const live = (page) => until(async () => page.$eval('#st-live', (n) => n.textContent), 'announcement');
const state = (page) => page.evaluate(() => ({ selected: window.QraivyStudio.editor.selected(), valid: window.QraivyStudio.editor.isValid(), dirty: window.QraivyStudio.editor.dirty(),
  save: document.getElementById('st-save-status').hidden ? '' : document.getElementById('st-save-status').getAttribute('data-state'), kind: document.getElementById('st-kind').textContent, undo: !document.getElementById('st-undo-btn').disabled,
  focus: document.activeElement && (document.activeElement.getAttribute('data-id') || (document.activeElement.getAttribute('data-sec') + ':' + document.activeElement.getAttribute('data-act'))) }));
async function addFromLibrary(page, type) {
  await page.click('#st-tab-add');
  const chip = await page.$('#st-chips .st-chip');
  if (chip) await chip.click(); // "All"
  await page.click('#st-lib [data-type="' + type + '"]');
}
const act = (page, id, kind) => page.click('#st-outline [data-sec="' + id + '"][data-act="' + kind + '"]');
const stored = (lpId) => S.db.pageDesigns.find((d) => d.landingPageId === lpId);

test('the Add library: every type listed; Loyalty "Demnächst verfügbar" (disabled, still focusable); types already on the page say so', async () => {
  S.resetDesigns();
  const { page, log } = await open();
  await page.click('#st-tab-add');
  const l = await lib(page);
  assert.deepEqual(Object.keys(l).sort(), ['buttons', 'contact', 'dealsOffers', 'gallery', 'hero', 'loyalty', 'openingHours', 'products', 'socialMedia', 'text']);
  assert.deepEqual(l.loyalty, { disabled: true, badge: 'Demnächst verfügbar', title: 'Demnächst verfügbar' });
  assert.deepEqual([l.hero.disabled, l.hero.badge], [true, 'Bereits auf Ihrer Seite'], 'anna-cafe already has its Hero');
  for (const t of ['dealsOffers', 'gallery', 'products', 'openingHours', 'contact', 'buttons', 'socialMedia', 'text']) assert.deepEqual([t, l[t].disabled, l[t].badge], [t, false, '']);
  assert.match(l.gallery.title, /^Galerie hinzufügen$/);
  // a disabled item does nothing (mouse or keyboard)
  const before = await ids(page);
  await page.click('#st-lib [data-type="loyalty"]');
  await page.focus('#st-lib [data-type="loyalty"]'); await page.keyboard.press('Enter');
  assert.deepEqual(await ids(page), before);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-type')), 'loyalty', 'focusable, so the reason can be read');
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('add: the section appears below the selected one, selected, its editor open, in the preview and announced; the type’s limit follows; unsaved', async () => {
  S.resetDesigns();
  const { page, log } = await open();
  await page.click('#st-tab-sections');
  await page.click('#st-outline .st-outline__item[data-id="s_hero"]');
  await addFromLibrary(page, 'dealsOffers');
  const list = await ids(page);
  assert.equal(list[0], 's_hero');
  const id = list[1];
  assert.match(id, /^s_[a-z0-9]{8}$/);
  const st = await state(page);
  assert.equal(st.selected, id);
  assert.equal(st.kind, 'Angebote', 'the Deals editor is open');
  assert.equal(await page.$eval('#st-tab-sections', (n) => n.getAttribute('aria-selected')), 'true', 'back on the Sections list');
  assert.deepEqual((await outline(page))[1], id);
  assert.equal(st.save, 'unsaved');
  assert.equal(await live(page), '„Angebote“ hinzugefügt.');
  await until(async () => (await srcdoc(page)).includes('data-v3-id="' + id + '"'), 'in the preview');
  assert.ok((await srcdoc(page)).includes('Aktuelle Angebote'), 'German starter title (the page is German)');
  assert.ok(!(await srcdoc(page)).includes('Shop-Angebot'), 'anna-cafe has no deals; anna-shop’s never appear');
  await page.click('#st-tab-add');
  assert.deepEqual([(await lib(page)).dealsOffers.disabled, (await lib(page)).dealsOffers.badge], [true, 'Bereits auf Ihrer Seite']);
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('add every type: remove the only Hero (asks), then add each addable type once; all valid, ids unique, German starter content', async () => {
  S.resetDesigns();
  const { page, log } = await open();
  await page.click('#st-tab-sections');
  await page.click('#st-outline .st-outline__item[data-id="s_hero"]');
  await act(page, 's_hero', 'remove');
  assert.match(log.dialogs[0], /^„Hero“ entfernen\?/);
  assert.match(log.dialogs[0], /Dieser Abschnitt enthält Ihre Inhalte\./);
  assert.match(log.dialogs[0], /Das ist der einzige Hero-Abschnitt Ihrer Seite: Ohne ihn hat Ihre Seite keinen Kopfbereich\./);
  assert.match(log.dialogs[0], /Sie können das rückgängig machen\.$/);
  assert.ok(!(await ids(page)).includes('s_hero'));
  for (const t of ['hero', 'dealsOffers', 'gallery', 'products', 'openingHours', 'contact', 'buttons', 'socialMedia', 'text']) await addFromLibrary(page, t);
  const all = await types(page), list = await ids(page);
  for (const t of ['hero', 'dealsOffers', 'gallery', 'products', 'openingHours', 'contact', 'buttons', 'socialMedia', 'text']) assert.ok(all.includes(t), t);
  assert.equal(new Set(list).size, list.length, 'ids unique');
  assert.equal((await state(page)).valid, true);
  const d = await page.evaluate(() => window.QraivyStudio.editor.draft());
  assert.equal(d.pages[0].sections.find((s) => s.type === 'hero').data.headline, 'Ihre Überschrift');
  await until(async () => { const h = await srcdoc(page); return list.every((id) => h.includes('data-v3-id="' + id + '"')); }, 'every section in the preview');
  const html = await srcdoc(page);
  assert.ok(html.includes('Ihre Überschrift') && html.includes('Ihr Text.') && html.includes('Aktuelle Angebote'), 'starter content shown');
  assert.ok(html.includes('Leerer Abschnitt'), 'a section without entries yet (e.g. Opening Hours) shows the preview placeholder');
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('move: Move up / down buttons and Alt + ↑ / ↓; order changes, content kept, announced with the position, focus stays on the moved section; ends disabled', async () => {
  S.resetDesigns();
  const { page, log } = await open();
  await page.click('#st-tab-sections');
  await page.click('#st-outline .st-outline__item[data-id="s_website"]');
  assert.deepEqual(await ids(page), ['s_hero', 's_buttons', 's_website']);
  assert.equal(await page.$eval('#st-outline [data-sec="s_website"][data-act="down"]', (n) => n.getAttribute('aria-disabled')), 'true', 'last: no Move down');
  await act(page, 's_website', 'up');
  assert.deepEqual(await ids(page), ['s_hero', 's_website', 's_buttons']);
  assert.equal(await live(page), '„Buttons“ an Position 2 von 3 verschoben.');
  assert.equal((await state(page)).focus, 's_website:up', 'focus stays on the moved section’s button');
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowUp'); await page.keyboard.up('Alt');
  assert.deepEqual(await ids(page), ['s_website', 's_hero', 's_buttons']);
  assert.equal((await state(page)).focus, 's_website', 'at the top Move up is disabled: focus goes to the section’s row');
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowUp'); await page.keyboard.up('Alt');
  assert.deepEqual(await ids(page), ['s_website', 's_hero', 's_buttons'], 'nothing above the first');
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Alt');
  assert.deepEqual(await ids(page), ['s_hero', 's_website', 's_buttons']);
  await until(async () => { const h = await srcdoc(page); return h.indexOf('data-v3-id="s_website"') < h.indexOf('data-v3-id="s_buttons"'); }, 'preview order');
  // not while typing in a field
  await page.click('#st-outline .st-outline__item[data-id="s_hero"]');
  await page.click('[data-insp="content"]');
  await page.click('#st-fields [data-path="data.headline"] input');
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Alt');
  assert.deepEqual(await ids(page), ['s_hero', 's_website', 's_buttons'], 'Alt+↓ in a text field moves nothing');
  // in the edit panel Alt + arrows belong to the item editors (Buttons, Products, ...): never a section move
  await page.focus('[data-insp="content"]');
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Alt');
  assert.deepEqual(await ids(page), ['s_hero', 's_website', 's_buttons'], 'Alt+↓ in the edit panel moves no section');
  // Undo / Redo
  await page.click('#st-undo-btn');
  assert.deepEqual(await ids(page), ['s_website', 's_hero', 's_buttons']);
  await page.click('#st-redo-btn');
  assert.deepEqual(await ids(page), ['s_hero', 's_website', 's_buttons']);
  assert.deepEqual(log.errors, []);
  await page.close();
});

test('duplicate: a copy right below with a new id; Hero, Deals / Offers, Loyalty say "only one per page"', async () => {
  S.resetDesigns();
  const { page } = await open();
  await page.click('#st-tab-sections');
  await page.click('#st-outline .st-outline__item[data-id="s_buttons"]');
  await act(page, 's_buttons', 'duplicate');
  const list = await ids(page);
  const copy = list[2];
  assert.equal(list[1], 's_buttons');
  assert.match(copy, /^s_[a-z0-9]{8}$/);
  const d = await page.evaluate(() => window.QraivyStudio.editor.draft().pages[0].sections);
  assert.deepEqual(d[2].data, d[1].data);
  assert.equal((await state(page)).selected, copy);
  assert.equal(await live(page), '„Buttons“ dupliziert.');
  await page.click('#st-outline .st-outline__item[data-id="s_hero"]');
  const dup = await page.$eval('#st-outline [data-sec="s_hero"][data-act="duplicate"]', (n) => ({ off: n.getAttribute('aria-disabled'), title: n.title }));
  assert.deepEqual(dup, { off: 'true', title: 'Nur ein Abschnitt „Hero“ pro Seite' });
  await act(page, 's_hero', 'duplicate');
  assert.equal((await types(page)).filter((t) => t === 'hero').length, 1);
  await page.close();
});

test('remove: Cancel keeps everything; untouched starter content goes without a question; Delete in the list; Undo brings it back', async () => {
  S.resetDesigns();
  let o = await open({ dialog: 'dismiss' });
  await o.page.click('#st-tab-sections');
  await o.page.click('#st-outline .st-outline__item[data-id="s_buttons"]');
  const before = await ids(o.page);
  await act(o.page, 's_buttons', 'remove');
  assert.equal(o.log.dialogs.length, 1);
  assert.match(o.log.dialogs[0], /^„Buttons“ entfernen\?\n\nDieser Abschnitt enthält Ihre Inhalte\./);
  assert.deepEqual(await ids(o.page), before, 'Cancel: nothing removed');
  assert.equal((await state(o.page)).dirty, false);
  await o.page.close();
  o = await open({ dialog: 'accept' });
  await o.page.click('#st-tab-sections');
  await o.page.click('#st-outline .st-outline__item[data-id="s_website"]');
  await addFromLibrary(o.page, 'text');
  const fresh = (await state(o.page)).selected;
  const n = o.log.dialogs.length;
  await act(o.page, fresh, 'remove');
  assert.equal(o.log.dialogs.length, n, 'starter content only: no question');
  assert.ok(!(await ids(o.page)).includes(fresh));
  assert.match(await live(o.page), /^„Textabschnitt“ entfernt\. Mit „Rückgängig“ holen Sie ihn zurück\.$/);
  assert.equal((await state(o.page)).selected, 's_website', 'the neighbour is selected');
  // Delete key in the Sections list
  await o.page.focus('#st-outline .st-outline__item[data-id="s_website"]');
  await o.page.keyboard.press('Delete');
  assert.ok(!(await ids(o.page)).includes('s_website'));
  assert.match(o.log.dialogs[o.log.dialogs.length - 1], /„Buttons“ entfernen\?|„Buttons“/, 'asked (the website row holds content)');
  await o.page.click('#st-undo-btn');
  assert.ok((await ids(o.page)).includes('s_website'));
  // Delete in a text field deletes text, not the section
  await o.page.click('#st-outline .st-outline__item[data-id="s_hero"]');
  await o.page.click('[data-insp="content"]');
  await o.page.click('#st-fields [data-path="data.headline"] input');
  await o.page.keyboard.press('Delete');
  assert.ok((await ids(o.page)).includes('s_hero'));
  await o.page.close();
});

test('links to a removed section: the question says they will point to the page top; one Undo restores section and links', async () => {
  S.resetDesigns();
  const { page, log } = await open({ query: '?slug=anna-shop' });
  // the Hero's button points to the Deals section (#angebote)
  await page.evaluate(() => { const ed = window.QraivyStudio.editor; ed.set('s_hero01', ['data', 'primary'], { text: 'Zu den Angeboten', target: '/angebote' }); });
  await page.click('#st-tab-sections');
  await page.click('#st-outline .st-outline__item[data-id="s_deals01"]');
  const before = await page.evaluate(() => window.QraivyStudio.editor.snapshot());
  await act(page, 's_deals01', 'remove');
  assert.match(log.dialogs[0], /Ein Link auf Ihrer Seite führt zu diesem Abschnitt\. Er wird auf den Seitenanfang zurückgesetzt\./);
  const d = await page.evaluate(() => window.QraivyStudio.editor.draft());
  assert.equal(d.pages[0].sections.length, 1);
  assert.equal(d.pages[0].sections[0].data.primary.target, '/', 'reset to the page top');
  assert.equal((await state(page)).valid, true);
  assert.match(await live(page), /Links dorthin führen jetzt zum Seitenanfang: 1\./);
  await page.click('#st-undo-btn');
  assert.equal(await page.evaluate(() => window.QraivyStudio.editor.snapshot()), before, 'one Undo: section and link back');
  await until(async () => (await srcdoc(page)).includes('Shop-Angebot'), 'the real deal is back in the preview');
  await page.close();
});

test('Save Draft and reopen keep the exact order and the starter content; the live page row is unchanged', async () => {
  S.resetDesigns();
  const { page } = await open();
  await page.click('#st-tab-sections');
  await page.click('#st-outline .st-outline__item[data-id="s_hero"]');
  await addFromLibrary(page, 'gallery');
  await addFromLibrary(page, 'openingHours');
  const g = (await ids(page))[1];
  await page.click('#st-outline .st-outline__item[data-id="' + g + '"]');
  await act(page, g, 'down');
  await page.click('#st-outline .st-outline__item[data-id="s_website"]');
  await act(page, 's_website', 'up');
  const order = await ids(page);
  const draft = await page.evaluate(() => window.QraivyStudio.editor.draft());
  await page.click('#st-save-btn');
  await until(async () => (await state(page)).save === 'saved', 'saved');
  assert.deepEqual(stored('lp_anna_cafe').draft.pages[0].sections.map((s) => s.id), order);
  await page.reload({ waitUntil: 'networkidle0' });
  await until(async () => (await page.$eval('#st-page-status', (n) => n.textContent)) === 'Studio-Entwurf', 'reopened');
  assert.deepEqual(await ids(page), order, 'same order after reopening');
  assert.deepEqual(await outline(page), order);
  const again = await page.evaluate(() => window.QraivyStudio.editor.draft());
  assert.deepEqual(again.pages[0].sections, draft.pages[0].sections.map((s) => Object.assign({ anchor: '', hidden: false, style: { background: 'default', align: 'left', spacing: 'normal' } }, s)).map((s) => again.pages[0].sections.find((x) => x.id === s.id)), 'same sections');
  assert.equal(again.pages[0].sections.find((s) => s.id === g).data.title, 'Galerie', 'starter content persisted');
  assert.equal(JSON.stringify(S.db.pages), PAGES_AT_START, 'LandingPage rows (live pages) unchanged');
  await page.close();
});

test('40 sections: Add and Duplicate are refused with the reason; the page stays valid', async () => {
  S.resetDesigns();
  const { page } = await open();
  await page.evaluate(() => { const ed = window.QraivyStudio.editor; while (ed.canAdd('text') === null) ed.addSection('text', null, 'de'); });
  assert.equal((await ids(page)).length, 40);
  await page.click('#st-tab-add');
  const l = await lib(page);
  assert.deepEqual([l.text.disabled, l.text.badge], [true, 'Höchstens 40 Abschnitte möglich']);
  assert.deepEqual([l.loyalty.badge], ['Demnächst verfügbar']);
  await page.click('#st-lib [data-type="gallery"]');
  assert.equal((await ids(page)).length, 40);
  await page.click('#st-tab-sections');
  await page.click('#st-outline .st-outline__item[data-id="s_buttons"]');
  assert.deepEqual(await page.$eval('#st-outline [data-sec="s_buttons"][data-act="duplicate"]', (n) => [n.getAttribute('aria-disabled'), n.title]), ['true', 'Höchstens 40 Abschnitte möglich']);
  assert.equal((await state(page)).valid, true);
  await page.close();
});

test('page switching with unsaved structural changes asks first; another account never sees the page; deals stay the open page’s', async () => {
  S.resetDesigns();
  const { page, log } = await open({ query: '?slug=anna-shop', dialog: 'dismiss' });
  await until(async () => (await srcdoc(page)).includes('Shop-Angebot'), 'real deal');
  await page.click('#st-tab-sections');
  await page.click('#st-outline .st-outline__item[data-id="s_deals01"]');
  await act(page, 's_deals01', 'up');
  await until(async () => { const h = await srcdoc(page); return h.indexOf('data-v3-id="s_deals01"') < h.indexOf('data-v3-id="s_hero01"') && h.includes('Shop-Angebot'); }, 'moved, the real deal still shown');
  await page.select('#st-page-select', 'anna-cafe');
  await sleep(300);
  assert.match(log.dialogs[0], /^Andere Seite öffnen\?/);
  assert.equal(await page.$eval('#st-page-select', (n) => n.value), 'anna-shop');
  // another account: Anna's structure leaves at once
  await page.evaluate(() => window.__setSession('tok_ben'));
  await until(async () => (await page.$eval('#st-page-select', (n) => n.value)) === 'ben-bikes', 'Ben’s page');
  const html = await srcdoc(page);
  for (const s of ['Anna', 'Shop-Angebot', 's_deals01']) assert.ok(!html.includes(s), 'Ben sees ' + s);
  // and Ben cannot save a structure onto Anna's page
  const r = await page.evaluate(async (origin) => (await fetch(origin + '/studio/pages/anna-shop/design', { method: 'PUT', headers: { Authorization: 'Bearer tok_ben', 'Content-Type': 'application/json' }, body: JSON.stringify({ design: { schemaVersion: 1, pages: [{ id: 'start', sections: [] }] }, baseRevision: 4 }) })).status, srv.origin);
  assert.equal(r, 403);
  assert.equal(stored('lp_anna_shop').draftRevision, 4);
  await page.close();
});

test('desktop and tablet: the selected row’s actions sit below it (never over a row), 32 px / touch 40 px; on a tablet adding opens the edit drawer', async () => {
  for (const width of [1440, 1280, 1024]) {
    S.resetDesigns();
    const { page, log } = await open({ width });
    if (width < 1200) { await page.click('#st-open-left'); await sleep(200); }
    await page.click('#st-tab-sections');
    await page.click('#st-outline .st-outline__item[data-id="s_buttons"]');
    const geo = await page.evaluate(() => {
      const li = document.querySelector('#st-outline .st-outline__item[data-id="s_buttons"]').parentElement;
      const row = li.querySelector('.st-outline__item').getBoundingClientRect(), bar = li.querySelector('.st-outline__actions').getBoundingClientRect();
      const others = [...document.querySelectorAll('#st-outline > li:not(.is-current) .st-outline__actions')].map((n) => getComputedStyle(n).display);
      const btn = li.querySelector('.st-outline__act').getBoundingClientRect();
      return { below: bar.top >= row.bottom - 1, inside: bar.right <= row.right + 1 && bar.left >= row.left - 1, others, btn: Math.round(btn.width), scrollX: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(geo.below, true, width + ': actions below the row');
    assert.equal(geo.inside, true, width);
    assert.ok(geo.others.every((d) => d === 'none'), width + ': other rows show no actions');
    assert.equal(geo.btn, 32);
    assert.equal(geo.scrollX, false);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'phaseC-sections-' + width + '.png') });
    await addFromLibrary(page, 'text');
    if (width < 1200) assert.equal(await page.$eval('#st-right', (n) => n.classList.contains('is-open')), true, 'the edit drawer opens on the new section');
    assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Textabschnitt');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'phaseC-added-' + width + '.png') });
    assert.deepEqual(log.errors, []);
    await page.close();
  }
});

test('the live pages are never written: LandingPage rows unchanged; only PageDesign; Publish never enabled', async () => {
  assert.equal(JSON.stringify(S.db.pages), PAGES_AT_START);
  assert.deepEqual(S.writes, []);
  assert.ok(S.db.pageDesigns.every((d) => d.publishedVersionId === null));
  const { page } = await open();
  await addFromLibrary(page, 'gallery');
  assert.equal(await page.$eval('#st-publish-btn', (n) => n.disabled), true);
  await page.close();
});

(async () => {
  if (!puppeteer || !CHROME) { console.log('studioSections: SKIPPED (no puppeteer-core or Chrome)'); return; }
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioSections.browser');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  await browser.close();
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
