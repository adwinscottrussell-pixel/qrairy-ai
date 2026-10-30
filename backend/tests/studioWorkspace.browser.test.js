// ============================================================
// studioWorkspace.browser.test.js — Landing Page Studio V3, Phase C.1 in a
// real browser: the builder workspace polish.
//
// The real Studio against the real Studio page and Deals routes
// (helpers/studioPagesServer.js, in memory); the Clerk session is a
// stand-in token. Checked: "Back to Dashboard" (dashboard.html); the top bar
// order; the QRAIVY sidebar as its icon rail on the Studio page only, never
// stored (other Admin pages keep their own setting); the phone-first preview
// (readable), side by side from 1600 px, a picked device stays; an opened
// page starts on its Sections list with "+ Abschnitt hinzufügen"; Publish
// disabled with "Bald verfügbar" and a note in the "⋯" menu (with the theme);
// "Beispielseite" on the demo only; accessible names, contrast of the new
// colours, visible keyboard focus, reduced motion.
//
// Run: node tests/studioWorkspace.browser.test.js
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

async function open({ token = 'tok_anna', query = '?slug=anna-shop', width = 1440, height = 900, stored = undefined, lang = 'de', path = '/studio.html', theme = 'light' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((tok, sto, lg, th) => {
    if (window.top !== window) return;
    try {
      localStorage.setItem('qraivy_lang', lg); localStorage.removeItem('qraivy.studio.panels'); localStorage.setItem('qraivy.studio.theme', th);
      if (sto === null) localStorage.removeItem('sb-collapsed'); else if (sto !== undefined) localStorage.setItem('sb-collapsed', sto);
    } catch (e) {}
    if (tok) window.Clerk = { session: { id: 'sess_' + tok, getToken: function () { return Promise.resolve(tok); } }, addListener: function () {} };
  }, token, stored === undefined ? undefined : stored, lang, theme);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (/^https?:$/.test(u.protocol) && u.origin !== srv.origin) return r.abort();
    return r.continue();
  });
  await page.goto(srv.origin + path + query, { waitUntil: 'networkidle0' });
  if (path === '/studio.html') await page.waitForFunction(() => { const s = document.getElementById('st-page-status'); return !s.closest('[hidden]') ? s.getAttribute('data-state') && s.getAttribute('data-state') !== 'loading' : true; }, { timeout: 8000 });
  await sleep(400);
  return { page, errors };
}
const frames = (page) => page.$$eval('#st-canvas .st-frame', (fs) => fs.map((f) => ({ device: f.getAttribute('data-device'), scale: Number((/scale\(([0-9.]+)\)/.exec(f.firstChild.style.transform) || [])[1]) })));
// WCAG contrast of an element's text against its own background
const contrast = (page, sel) => page.$eval(sel, (n) => {
  const rgb = (c) => { const m = c.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
  const lum = (c) => { const v = rgb(c).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  // the background as seen: translucent layers composited over what is behind them
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
  const layers = [];
  for (let e = n; e; e = e.parentElement) { const p = parse(getComputedStyle(e).backgroundColor); if (p.a > 0) { layers.push(p); if (p.a >= 1) break; } }
  let base = [255, 255, 255];
  for (let i = layers.length - 1; i >= 0; i--) base = base.map((v, k) => layers[i].c[k] * layers[i].a + v * (1 - layers[i].a));
  const bg = 'rgb(' + base.map(Math.round).join(', ') + ')';
  const a = lum(getComputedStyle(n).color), b = lum(bg);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
});

test('top bar: Back to Dashboard (dashboard.html) | page and status | Undo, Redo, Preview, Save Draft, Publish, ⋯ — no subtitle, no "not saved" badge', async () => {
  const { page, errors } = await open();
  const bar = await page.evaluate(() => {
    const top = document.getElementById('st-top');
    const visible = (n) => { const r = n.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(n).visibility !== 'hidden'; };
    const order = ['st-back', 'st-page-select', 'st-page-status', 'st-undo-btn', 'st-redo-btn', 'st-preview-btn', 'st-save-btn', 'st-publish-btn', 'st-more-btn'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: Math.round(r.left), shown: visible(document.getElementById(id)) }; });
    return { order, back: { href: document.getElementById('st-back').getAttribute('href'), text: document.getElementById('st-back').textContent.trim() },
      sub: !!top.querySelector('.st-sub'), mode: visible(document.getElementById('st-mode')), h1: document.querySelector('#st-top h1').textContent, h1Shown: visible(document.querySelector('#st-top h1')) };
  });
  assert.deepEqual(bar.back, { href: 'dashboard.html', text: 'Zum Dashboard' });
  assert.ok(bar.order.every((o) => o.shown), JSON.stringify(bar.order));
  for (let i = 1; i < bar.order.length; i++) assert.ok(bar.order[i].x > bar.order[i - 1].x, 'left to right: ' + bar.order[i - 1].id + ' before ' + bar.order[i].id);
  assert.equal(bar.sub, false, 'no subtitle');
  assert.equal(bar.mode, false, 'no "not saved" badge');
  assert.deepEqual([bar.h1, bar.h1Shown], ['Landing Page Studio', false], 'the page title stays for screen readers only');
  assert.deepEqual(errors, []);
  await page.close();
});

test('sidebar: the icon rail on the Studio page, never stored; its toggle works here without storing; other Admin pages keep their setting', async () => {
  for (const stored of [null, 'false', 'true']) {
    const { page } = await open({ stored });
    assert.equal(await page.$eval('#sidebar', (n) => n.classList.contains('collapsed')), true, 'collapsed with stored ' + stored);
    await page.click('#sb-toggle'); await sleep(350);
    assert.equal(await page.$eval('#sidebar', (n) => n.classList.contains('collapsed')), false, 'the toggle opens it');
    await page.click('#sb-toggle'); await sleep(350);
    assert.equal(await page.$eval('#sidebar', (n) => n.classList.contains('collapsed')), true, 'and closes it again');
    // crossing admin-shell's breakpoints does not bring the stored setting back here
    await page.setViewport({ width: 1050, height: 900 }); await sleep(150);
    await page.setViewport({ width: 1440, height: 900 }); await sleep(150);
    assert.equal(await page.$eval('#sidebar', (n) => n.classList.contains('collapsed')), true, 'still the rail after the window crossed 1099 px');
    assert.equal(await page.evaluate(() => localStorage.getItem('sb-collapsed')), stored, 'sb-collapsed untouched (' + stored + ')');
    await page.close();
  }
  // another Admin page with the shared sidebar (academy.html) still follows its stored setting
  const a = await open({ path: '/academy.html', query: '', stored: 'false' });
  assert.equal(await a.page.$eval('#sidebar', (n) => n.classList.contains('collapsed')), false, 'academy: expanded as stored');
  await a.page.close();
});

test('phone-first preview: the phone at 1440 / 1280 (readable, at least 0.75), the desktop at 1024 (drawers), both from 1600 px; a picked device stays', async () => {
  const want = { 1440: ['mobile'], 1280: ['mobile'], 1024: ['desktop'], 1680: ['desktop', 'mobile'], 1920: ['desktop', 'mobile'] };
  for (const w of [1440, 1280, 1024, 1680, 1920]) {
    const { page } = await open({ width: w });
    const f = await frames(page);
    assert.deepEqual(f.map((x) => x.device), want[w], w + 'px');
    const phone = f.find((x) => x.device === 'mobile');
    if (phone) assert.ok(phone.scale >= 0.75, w + 'px phone scale ' + phone.scale);
    assert.equal(await page.$eval('button[data-device="' + want[w][0] + '"]', (b) => b.getAttribute('aria-checked')), 'true', w + ': the device buttons say which');
    await page.close();
  }
  const { page } = await open({ width: 1440 });
  await page.click('button[data-device="desktop"]');
  assert.deepEqual((await frames(page)).map((x) => x.device), ['desktop']);
  await page.setViewport({ width: 1300, height: 900 }); await sleep(300);
  assert.deepEqual((await frames(page)).map((x) => x.device), ['desktop'], 'the owner’s choice stays when the window changes');
  await page.close();
  const p = await open({ width: 390, height: 844 });
  assert.deepEqual((await frames(p.page)).map((x) => x.device), ['mobile'], 'phones: preview only, the phone');
  await p.page.close();
});

test('Sections: an opened page starts on its Sections list; "+ Abschnitt hinzufügen" opens the library and focuses the first available type; no drag handles', async () => {
  const { page } = await open();
  assert.equal(await page.$eval('#st-tab-sections', (n) => n.getAttribute('aria-selected')), 'true');
  assert.equal(await page.$eval('#st-add-section', (n) => n.textContent.trim()), 'Abschnitt hinzufügen');
  assert.equal(await page.$$eval('#st-outline .st-outline__grip', (n) => n.length), 0, 'no drag handle (no drag and drop)');
  await page.click('#st-add-section');
  assert.equal(await page.$eval('#st-tab-add', (n) => n.getAttribute('aria-selected')), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-type')), 'gallery', 'the first type that can be added (Hero is already on the page)');
  // the selected row: orange border and tint
  await page.click('#st-tab-sections');
  const sel = await page.$eval('#st-outline .st-outline__item[aria-current="true"]', (n) => ({ border: getComputedStyle(n).borderColor, bg: getComputedStyle(n).backgroundColor }));
  assert.equal(sel.border, 'rgb(255, 90, 31)');
  assert.notEqual(sel.bg, 'rgb(255, 255, 255)');
  await page.close();
  // the demo (no page of the owner) keeps starting on the library
  const d = await open({ token: null, query: '' });
  assert.equal(await d.page.$eval('#st-tab-add', (n) => n.getAttribute('aria-selected')), 'true');
  await d.page.close();
});

test('Publish: disabled, a lock and "Bald verfügbar" visible, described for screen readers; the "⋯" menu explains it and holds the theme; Escape returns focus', async () => {
  const { page } = await open();
  const pub = await page.$eval('#st-publish-btn', (b) => ({ disabled: b.disabled, aria: b.getAttribute('aria-disabled'), soon: document.getElementById(b.getAttribute('aria-describedby')).textContent, lock: !!b.querySelector('use[href="#st-lock"]'), text: b.querySelector('[data-st="publish"]').textContent }));
  assert.deepEqual(pub, { disabled: true, aria: 'true', soon: 'Bald verfügbar', lock: true, text: 'Veröffentlichen' });
  assert.ok(await contrast(page, '#st-publish-soon') >= 4.5, 'readable');
  await page.click('#st-more-btn');
  const menu = await page.evaluate(() => ({ open: !document.getElementById('st-more-menu').hidden, expanded: document.getElementById('st-more-btn').getAttribute('aria-expanded'),
    note: document.querySelector('#st-more-menu [data-st="publish_note"]').textContent, themes: [...document.querySelectorAll('#st-more-menu [data-theme-pref]')].map((b) => b.textContent.trim()), focus: document.activeElement.getAttribute('data-theme-pref') }));
  assert.deepEqual(menu, { open: true, expanded: 'true', note: 'Veröffentlichen folgt in einem späteren Schritt. Bis dahin bleibt Ihre veröffentlichte Seite genau so, wie sie ist.', themes: ['Hell', 'Dunkel', 'System'], focus: 'light' });
  assert.ok(await contrast(page, '#st-more-menu .st-menu__info') >= 4.5, 'the blue note is readable');
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('st-more-menu').hidden, document.activeElement.id]), [true, 'st-more-btn']);
  await page.close();
});

test('"Beispielseite" on the demo only; English labels; the new colours readable in light and dark', async () => {
  let o = await open({ token: null, query: '' });
  assert.equal(await o.page.$eval('#st-sample', (n) => !n.hidden && n.textContent), 'Beispielseite');
  assert.ok(await contrast(o.page, '#st-sample') >= 4.5);
  await o.page.close();
  o = await open();
  assert.equal(await o.page.$eval('#st-sample', (n) => n.hidden), true, 'not on the owner’s page');
  await o.page.close();
  for (const theme of ['light', 'dark']) {
    o = await open({ lang: 'en', theme });
    assert.equal(await o.page.$eval('#st-back', (n) => n.textContent.trim()), 'Back to Dashboard');
    assert.equal(await o.page.$eval('#st-publish-soon', (n) => n.textContent), 'Coming soon');
    // the blue editor note and the green "Add button" (Buttons section)
    assert.ok(await contrast(o.page, '#st-note') >= 4.5, theme + ' note');
    await o.page.click('#st-tab-sections');
    await o.page.evaluate(() => { const ed = window.QraivyStudio.editor; ed.addSection('buttons', null, 'en'); });
    await o.page.click('#st-outline .st-outline__item[data-id="' + await o.page.evaluate(() => window.QraivyStudio.editor.selected()) + '"]');
    await o.page.click('[data-insp="content"]');
    assert.equal(await o.page.$eval('#st-fields .st-items__add', (n) => n.classList.contains('st-items__add--link')), true, 'adding a link: green');
    assert.ok(await contrast(o.page, '#st-fields .st-items__add') >= 4.5, theme + ' green add button');
    await o.page.close();
  }
});

test('accessibility: every control in the top bar and the Sections panel has a name; keyboard focus is visible; reduced motion turns transitions off', async () => {
  const { page } = await open();
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('#st-top a, #st-top button, #st-top select, #st-left button')].filter((n) => n.offsetParent !== null || n.closest('#st-more-menu'))
    .filter((n) => !((n.getAttribute('aria-label') || '').trim() || (n.textContent || '').trim() || (n.id && document.querySelector('label[for="' + n.id + '"]')))).map((n) => n.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, []);
  await page.focus('#st-back');
  await page.keyboard.press('Tab'); await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'st-back');
  const ring = await page.$eval('#st-back', (n) => getComputedStyle(n).outlineStyle + ' ' + getComputedStyle(n).outlineWidth);
  assert.equal(ring, 'solid 2px', 'visible focus ring');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const tr = await page.evaluate(() => ['#st-back', '#st-add-section'].map((s) => getComputedStyle(document.querySelector(s)).transitionDuration));
  assert.ok(tr.every((d) => parseFloat(d) < 0.01), JSON.stringify(tr));
  await page.close();
});

test('no horizontal overflow at 1440, 1280, 1024 and 390; phones stay preview-only; Undo and Redo hidden on phones (nothing to edit)', async () => {
  for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
    const { page, errors } = await open({ width: w, height: h });
    const l = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - document.documentElement.clientWidth, undo: getComputedStyle(document.getElementById('st-undo-btn')).display, left: getComputedStyle(document.getElementById('st-left')).display }));
    assert.equal(l.x, 0, w + ' overflow');
    if (w === 390) assert.deepEqual([l.undo, l.left], ['none', 'none']);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

// ── Phase C.2: the realistic phone ──
const phoneGeo = (page) => page.evaluate(() => {
  const f = document.querySelector('#st-canvas .st-frame--mobile');
  const ifr = f.querySelector('iframe'), bar = f.querySelector('.st-phone__status'), home = f.querySelector('.st-phone__home'), island = f.querySelector('.st-phone__island');
  const r = (n) => n.getBoundingClientRect();
  const fr = r(ifr), br = r(bar), hr = r(home), ir = r(island);
  const cx = fr.left + fr.width / 2, cy = fr.top + fr.height / 2;
  const deco = [...f.querySelectorAll('.st-phone__status, .st-phone__home, .st-phone__btn')];
  return { w: ifr.getAttribute('width'), h: ifr.getAttribute('height'), above: br.bottom <= fr.top + 0.5, below: hr.top >= fr.bottom - 0.5, islandInBar: ir.top >= br.top && ir.bottom <= br.bottom,
    hit: document.elementFromPoint(cx, cy) === ifr, hitTop: document.elementFromPoint(cx, fr.top + 3) === ifr, hitBottom: document.elementFromPoint(cx, fr.bottom - 3) === ifr,
    decoHidden: deco.every((n) => n.getAttribute('aria-hidden') === 'true'), decoNoPointer: deco.every((n) => getComputedStyle(n).pointerEvents === 'none'),
    time: bar.textContent.trim(), icons: bar.querySelectorAll('svg').length, inside: r(f).right <= innerWidth && r(f).left >= 0, frameW: Math.round(r(f).width) };
});
test('C.2 phone: a realistic device (status bar with Dynamic Island, signal, Wi-Fi, battery; home indicator; side buttons) around the unchanged 390 x 844 page; nothing covers or intercepts the page', async () => {
  const { page, errors } = await open();
  const g = await phoneGeo(page);
  assert.deepEqual([g.w, g.h], ['390', '844'], 'the page keeps its phone size (the rendered page is unchanged)');
  assert.ok(g.above && g.below, 'status bar above the page, home indicator below it: never on top of the content');
  assert.ok(g.islandInBar, 'the Dynamic Island sits in the status bar');
  assert.ok(g.hit && g.hitTop && g.hitBottom, 'clicks anywhere on the page reach the page');
  assert.ok(g.decoHidden && g.decoNoPointer, 'decoration only: hidden from screen readers, no pointer events');
  assert.deepEqual([g.time, g.icons], ['9:41', 3]);
  assert.equal(await page.$$eval('#st-canvas .st-frame--mobile .st-phone__btn', (n) => n.length), 4);
  assert.ok(g.inside, 'the device stays inside the window');
  assert.deepEqual(errors, []);
  await page.close();
});

test('C.2 phone: scrolling inside the phone (no scrollbar), selecting a section by clicking it in the phone, live updates while typing', async () => {
  const { page } = await open();
  const h = await page.$('#st-canvas .st-frame--mobile iframe');
  const fr = await h.contentFrame();
  const sb = await fr.evaluate(() => ({ scrollbar: innerWidth - document.documentElement.clientWidth, scrolls: document.documentElement.scrollHeight > innerHeight }));
  assert.equal(sb.scrollbar, 0, 'no scrollbar takes room inside the phone');
  // the page scrolls with the mouse wheel inside the phone
  const box = await h.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel({ deltaY: 400 });
  await sleep(500);
  if (sb.scrolls) assert.ok(await fr.evaluate(() => scrollY) > 0, 'scrolled inside the phone');
  await fr.evaluate(() => scrollTo(0, 0));
  await sleep(200);
  // click the Deals section inside the phone: it becomes the selected section
  const target = await fr.$('[data-v3-id="s_deals01"]');
  await target.click();
  await sleep(300);
  assert.equal(await page.evaluate(() => window.QraivyStudio.editor.selected()), 's_deals01', 'selected from the phone');
  // live update: typing into the Hero headline reaches the phone
  await page.click('#st-outline .st-outline__item[data-id="s_hero01"]');
  await page.click('[data-insp="content"]');
  await page.click('#st-fields [data-path="data.headline"] input');
  await page.keyboard.press('End');
  await page.keyboard.type(' live');
  const live = async () => (await (await (await page.$('#st-canvas .st-frame--mobile iframe')).contentFrame()).$eval('h1', (n) => n.textContent)).includes('live');
  const end = Date.now() + 5000; let ok = false;
  while (!ok && Date.now() < end) { ok = await live().catch(() => false); if (!ok) await sleep(100); }
  assert.ok(ok, 'the edit shows in the phone');
  await page.close();
});

test('C.2 phone: device switching keeps working (desktop, tablet, phone); readable at 1440 and 1280, side by side from 1600, preview-only on phones, no overflow', async () => {
  const { page } = await open();
  for (const d of ['desktop', 'tablet', 'mobile']) {
    await page.click('button[data-device="' + d + '"]');
    await sleep(200);
    assert.deepEqual((await frames(page)).map((x) => x.device), [d]);
    assert.equal(await page.$$eval('#st-canvas .st-phone__status', (n) => n.length), d === 'mobile' ? 1 : 0, d + ': the phone decoration only on the phone');
  }
  await page.close();
  for (const [w, h] of [[1440, 900], [1280, 900], [1680, 1000], [390, 844]]) {
    const o = await open({ width: w, height: h });
    const f = await frames(o.page), phone = f.find((x) => x.device === 'mobile');
    assert.ok(phone, w + ': a phone');
    if (w !== 390) assert.ok(phone.scale >= 0.7, w + 'px: phone scale ' + phone.scale);
    const g = await phoneGeo(o.page);
    assert.ok(g.inside && g.above && g.below, w + ': inside the window, page uncovered');
    assert.equal(await o.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, w + ': no horizontal overflow');
    await o.page.close();
  }
});

(async () => {
  if (!puppeteer || !CHROME) { console.log('studioWorkspace: SKIPPED (no puppeteer-core or Chrome)'); return; }
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioWorkspace.browser');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  await browser.close();
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
