// ============================================================
// studioGalleryCarousel.browser.test.js — Landing Page Studio V3, 2A-3H:
// Gallery carousel navigation in a real browser (LOCAL ONLY: needs Chrome
// and puppeteer-core; prints SKIP and passes when missing).
//
// Pages are rendered by the shared core.js (script-free: the previous /
// next buttons are plain markup, rendered hidden); the trusted first-party
// controller js/lpV3/gallery-nav.js is added the way the application adds
// it (one fixed <script src> after the page). Checked in Chrome: the buttons
// appear only once the controller runs; named in the page language; over
// the photo edges on tablet / desktop (centred on the photos), in a row
// under the photos on phones with the short hint between them; clicks and
// taps go photo by photo with snapping, exactly to the ends, disabled there;
// keyboard (arrow keys on the strip, Tab / Enter / Space on the buttons,
// focus handed over at the ends); swiping keeps the states right; reduced
// motion jumps instead of gliding; several carousels are independent;
// without JavaScript: no buttons, the edge fade and the hint; white buttons
// on the brand colour; Grid has none of it; the page has no script of its
// own; the Studio preview runs the controller in its sandboxed frames, the
// full-size preview stays script-free. Edge, Firefox and WebKit:
// studioGalleryNavBrowsers.browser.test.js.
// Run: node tests/studioGalleryCarousel.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioGalleryCarousel.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const V3 = require('../src/lpV3/core');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const BASE = require('./fixtures/lpV3/localBusiness.json');
const PHOTO = fs.readFileSync(path.join(PUB, 'images', 'deals', 'starter', 'bakery-bread-01.jpg'));
const IMG = (n) => 'https://res.cloudinary.com/demo/image/upload/v1/' + n + '.jpg';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
// how the application adds the controller (the Studio preview inlines the same code)
const NAV_TAG = '<script src="/js/lpV3/gallery-nav.js"></script>';
let pages = {};
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (pages[url]) { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(pages[url]); }
  const p = path.join(PUB, decodeURIComponent(url));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, base;

// a published page with one (or two) galleries, rendered by core.js; the controller added unless nav: false
function gallery(id, n, title) { return { id, type: 'gallery', variant: 'carousel', data: { title, images: Array.from({ length: n }, (x, i) => ({ image: IMG(id + i), alt: 'Foto ' + (i + 1), caption: 'Bild ' + (i + 1) })) } }; }
function pageHtml({ lang = 'de', variant = 'carousel', count = 4, bg, nav = true, two = false } = {}) {
  const d = JSON.parse(JSON.stringify(BASE));
  d.settings.language = lang;
  const g = gallery('s_gal09', count, 'Fotos');
  g.variant = variant;
  if (bg) g.style = { background: bg };
  d.pages[0].sections.splice(1, 0, g);
  if (two) d.pages[0].sections.splice(2, 0, gallery('s_gal10', 6, 'Mehr Fotos'));
  const r = V3.renderDesign(d, { businessName: 'Musterbäckerei' });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.ok(!/<script/i.test(r.html), 'core.js renders no script');
  return nav ? r.html.replace('</body></html>', NAV_TAG + '</body></html>') : r.html;
}
async function openPage(html, width, { height = 900, touch = false, reduce = false, js = true, id = 's_gal09' } = {}) {
  pages = { '/page.html': html };
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: touch, hasTouch: touch });
  if (reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (!js) await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  const net = [], errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) net.push(u.host + u.pathname);
    if (u.host === 'res.cloudinary.com') return r.respond({ status: 200, contentType: 'image/jpeg', body: PHOTO });
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    return r.continue();
  });
  await page.goto(base + '/page.html', { waitUntil: 'networkidle0' });
  await page.evaluate((i) => document.getElementById(i).scrollIntoView(), id);
  await sleep(300);
  return { page, net, errors };
}
// everything about one carousel: the strip, its photos, the two buttons, the hint
const state = (page, id = 's_gal09') => page.evaluate((sid) => {
  const sec = document.getElementById(sid), wrap = sec.querySelector('.v3-gal-wrap'), s = sec.querySelector('.v3-gal-carousel');
  const r = s.getBoundingClientRect(), img = s.querySelector('img').getBoundingClientRect(), cap = s.querySelector('figcaption').getBoundingClientRect(), last = s.lastElementChild.getBoundingClientRect();
  const btn = (n) => { if (!n) return null; const b = n.getBoundingClientRect(), cs = getComputedStyle(n); return { hidden: n.hidden, shown: cs.display !== 'none', disabled: n.disabled, label: n.getAttribute('aria-label'), controls: n.getAttribute('aria-controls'), type: n.type,
    x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, left: b.left, right: b.right, top: b.top, bg: cs.backgroundColor, color: cs.color, opacity: cs.opacity }; };
  const hint = sec.querySelector('.v3-gal-hint');
  return { vw: innerWidth, id: s.id, left: r.left, right: r.right, top: r.top, bottom: r.bottom, scrollLeft: Math.round(s.scrollLeft), max: s.scrollWidth - s.clientWidth,
    photoMid: img.top + img.height / 2, captionTop: cap.top, lastRight: last.right, itemWidth: s.querySelector('.v3-gal-item').getBoundingClientRect().width,
    nav: wrap.getAttribute('data-nav'), prev: btn(sec.querySelector('.v3-gal-prev')), next: btn(sec.querySelector('.v3-gal-next')),
    hint: hint ? getComputedStyle(hint).display : 'absent', hintText: hint ? hint.innerText.trim() : '', hintBox: hint ? (() => { const h = hint.getBoundingClientRect(); return { top: h.top, mid: h.top + h.height / 2, left: h.left, right: h.right }; })() : null,
    fade: getComputedStyle(wrap, '::after').content };
}, id);
async function settle(page, id = 's_gal09') { let last = -1; for (let i = 0; i < 40; i++) { const v = (await state(page, id)).scrollLeft; if (v === last) return v; last = v; await sleep(80); } return last; }
const snapped = (s, v) => v === s.max || Math.abs(v / (s.itemWidth + 12) - Math.round(v / (s.itemWidth + 12))) < 0.02;
const LONG = '← Weitere Bilder: wischen oder scrollen →', SHORT = 'Weitere Bilder · Wischen';

test('the buttons appear only once the controller runs: named, type="button", pointing at the strip; over the photo edges on desktop / tablet, under the photos on phones', async () => {
  for (const w of [1280, 820, 390]) {
    // without the controller: rendered, but hidden
    const off = await openPage(pageHtml({ nav: false }), w);
    let s = await state(off.page);
    assert.deepEqual([s.prev.hidden, s.prev.shown, s.next.hidden, s.next.shown, s.nav], [true, false, true, false, null], w + 'px: hidden without the controller');
    await off.page.close();
    const { page, errors } = await openPage(pageHtml(), w);
    s = await state(page);
    assert.deepEqual([s.prev.shown, s.next.shown, s.nav], [true, true, 'on'], w + 'px: shown by the controller');
    assert.deepEqual([s.prev.label, s.next.label, s.prev.type, s.prev.controls, s.next.controls], ['Vorheriges Bild', 'Nächstes Bild', 'button', 's_gal09-photos', 's_gal09-photos']);
    assert.deepEqual([s.prev.disabled, s.next.disabled, s.prev.opacity], [true, false, '0.3'], w + 'px: at the start the previous button is disabled (and stays subtly visible)');
    assert.deepEqual([Math.round(s.prev.w), Math.round(s.prev.h)], [56, 56], '56 px');
    assert.deepEqual([s.next.bg, s.next.color], ['rgb(255, 90, 31)', 'rgb(255, 255, 255)'], 'QRAIVY orange, white chevron');
    if (w >= 768) {
      assert.ok(Math.abs(s.next.y - s.photoMid) < 2 && Math.abs(s.prev.y - s.photoMid) < 2, w + 'px: centred on the photos');
      assert.ok(Math.abs(s.next.right - (s.right - 10)) < 1 && Math.abs(s.prev.left - (s.left + 10)) < 1, w + 'px: 10 px inside the photo edges');
      assert.ok(s.next.y + 28 < s.captionTop, w + 'px: above the captions');
      assert.equal(s.hintText, LONG);
    } else {
      assert.ok(Math.abs(s.next.top - (s.bottom + 8)) < 1 && Math.abs(s.next.right - s.right) < 1 && Math.abs(s.prev.left - s.left) < 1, 'phone: in a row under the photos');
      assert.equal(s.hint, 'flex');
      assert.equal(s.hintText, SHORT);
      assert.ok(Math.abs(s.hintBox.mid - s.next.y) < 2, 'phone: the short hint between the buttons');
    }
    assert.equal(s.fade, 'none', w + 'px: no edge fade with working buttons');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('clicks go photo by photo with snapping, exactly to the end (disabled there, last photo fully shown) and back to the start', async () => {
  for (const w of [390, 820, 1024, 1280]) {
    const { page } = await openPage(pageHtml(), w);
    const s = await state(page);
    const stops = [];
    for (let i = 0; i < 5; i++) { await page.mouse.click(s.next.x, s.next.y); stops.push(await settle(page)); }
    for (const v of stops) assert.ok(snapped(s, v), w + 'px: snapped ' + v);
    let e = await state(page);
    assert.equal(e.scrollLeft, e.max, w + 'px: reaches the end');
    assert.deepEqual([e.prev.disabled, e.next.disabled], [false, true], w + 'px: at the end');
    assert.ok(e.lastRight <= e.right + 0.5, w + 'px: the last photo fully shown');
    for (let i = 0; i < 5; i++) { await page.mouse.click(s.prev.x, s.prev.y); await settle(page); }
    e = await state(page);
    assert.deepEqual([e.scrollLeft, e.prev.disabled, e.next.disabled], [0, true, false], w + 'px: back at the start');
    await page.close();
  }
});

test('phones: taps on the bottom row (390 / 412 px); white buttons with orange chevrons on the brand colour, orange on dark; the hint is not a control', async () => {
  for (const [w, bg] of [[390, 'default'], [412, 'brand'], [390, 'dark']]) {
    const { page } = await openPage(pageHtml({ bg }), w, { height: 844, touch: true });
    const s = await state(page);
    assert.deepEqual([s.next.bg, s.next.color], bg === 'brand' ? ['rgb(255, 255, 255)', 'rgb(255, 90, 31)'] : ['rgb(255, 90, 31)', 'rgb(255, 255, 255)'], w + 'px ' + bg);
    const stops = [];
    for (let i = 0; i < 5; i++) { await page.touchscreen.tap(s.next.x, s.next.y); stops.push(await settle(page)); }
    for (const v of stops) assert.ok(snapped(s, v), 'snapped ' + v);
    let e = await state(page);
    assert.deepEqual([e.scrollLeft === e.max, e.prev.disabled, e.next.disabled], [true, false, true], w + 'px ' + bg + ': taps reach the end');
    for (let i = 0; i < 5; i++) { await page.touchscreen.tap(s.prev.x, s.prev.y); await settle(page); }
    e = await state(page);
    assert.deepEqual([e.scrollLeft, e.prev.disabled], [0, true], w + 'px ' + bg + ': back at the start');
    await page.touchscreen.tap((s.hintBox.left + s.hintBox.right) / 2, s.hintBox.mid);
    assert.equal(await settle(page), 0, 'a tap on the hint does nothing');
    await page.close();
  }
});

test('keyboard: arrow keys on the strip; Tab reaches the buttons, Enter / Space press them; at an end the focus moves to the other button', async () => {
  const { page } = await openPage(pageHtml(), 1280);
  assert.deepEqual(await page.$eval('.v3-gal-carousel', (n) => [n.tabIndex, n.getAttribute('role'), n.getAttribute('aria-label')]), [0, 'region', 'Fotos']);
  await page.focus('.v3-gal-carousel');
  await page.keyboard.press('ArrowRight');
  const k = await settle(page);
  assert.ok(k > 0, 'ArrowRight scrolls the strip');
  assert.equal((await state(page)).prev.disabled, false, 'the buttons follow keyboard scrolling');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await settle(page), 0);
  assert.equal((await state(page)).prev.disabled, true);
  // from the strip, Tab skips the disabled previous button and lands on next
  await page.focus('.v3-gal-carousel');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'v3-gal-btn v3-gal-next');
  await page.keyboard.press('Enter');
  assert.ok((await settle(page)) > 0, 'Enter presses it');
  // the next press reaches the end: next becomes disabled, the focus moves to previous
  await page.keyboard.press(' ');
  const s = await settle(page);
  assert.equal(s, (await state(page)).max, 'Space presses it, at the end now');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'v3-gal-btn v3-gal-prev', 'focus handed to the previous button');
  await page.keyboard.press('Enter');
  assert.ok((await settle(page)) < s, 'and it goes back');
  await page.close();
});

test('swiping / wheel scrolling keeps the button states right; the scrollbar stays hidden', async () => {
  const { page } = await openPage(pageHtml({ lang: 'en' }), 820);
  const s = await state(page);
  assert.deepEqual([s.prev.label, s.next.label, s.hintText], ['Previous image', 'Next image', '← More photos: swipe or scroll →']);
  assert.deepEqual(await page.$eval('.v3-gal-carousel', (n) => [n.offsetHeight - n.clientHeight, getComputedStyle(n).scrollbarWidth, getComputedStyle(n).overflowX]), [0, 'none', 'auto']);
  await page.mouse.move((s.left + s.right) / 2, s.photoMid);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaX: 400 }); await settle(page); }
  const e = await state(page);
  assert.deepEqual([e.scrollLeft, e.prev.disabled, e.next.disabled], [e.max, false, true], 'scrolled to the end by wheel: next disabled');
  await page.close();
});

test('reduced motion: a press jumps straight to the photo; otherwise it glides', async () => {
  for (const reduce of [true, false]) {
    const { page } = await openPage(pageHtml(), 1280, { reduce });
    const s = await state(page);
    const early = await page.evaluate(async () => { const n = document.querySelector('.v3-gal-next'), st = document.querySelector('.v3-gal-carousel'); n.click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return st.scrollLeft; });
    const end = await settle(page);
    assert.ok(end > 0 && snapped(s, end));
    if (reduce) assert.equal(Math.round(early), end, 'reduced motion: there at once');
    else assert.ok(early < end, 'no preference: smooth (' + early + ' < ' + end + ')');
    await page.close();
  }
});

test('two carousels on one page work independently', async () => {
  const { page } = await openPage(pageHtml({ two: true }), 1280);
  const a = await state(page, 's_gal09');
  await page.evaluate(() => document.getElementById('s_gal10').scrollIntoView());
  await sleep(200);
  const b = await state(page, 's_gal10');
  assert.deepEqual([a.next.controls, b.next.controls, b.prev.label], ['s_gal09-photos', 's_gal10-photos', 'Vorheriges Bild']);
  await page.mouse.click(b.next.x, b.next.y);
  await settle(page, 's_gal10');
  const a2 = await state(page, 's_gal09'), b2 = await state(page, 's_gal10');
  assert.ok(b2.scrollLeft > 0 && b2.prev.disabled === false, 'the second one moved');
  assert.deepEqual([a2.scrollLeft, a2.prev.disabled, a2.next.disabled], [0, true, false], 'the first one did not');
  await page.close();
});

test('without JavaScript: no buttons, the edge fade and the plain hint; swiping still works', async () => {
  for (const [w, text] of [[390, SHORT], [1280, LONG]]) {
    const { page } = await openPage(pageHtml(), w, { js: false });
    const s = await state(page);
    assert.deepEqual([s.prev.shown, s.next.shown, s.nav, s.fade, s.hint, s.hintText], [false, false, null, '""', 'block', text], w + 'px');
    assert.deepEqual(await page.$eval('.v3-gal-hint', (n) => [n.getAttribute('aria-hidden'), n.tagName, getComputedStyle(n).backgroundColor, getComputedStyle(n).borderRadius]), ['true', 'P', 'rgba(0, 0, 0, 0)', '0px'], 'plain text, no chip');
    await page.mouse.move((s.left + s.right) / 2, s.photoMid);
    await page.mouse.wheel({ deltaX: 300 });
    assert.ok((await settle(page)) > 0, w + 'px: swiping / scrolling works');
    await page.close();
  }
});

// WCAG contrast of the hint text against the section behind it (plain text, no chip)
test('the hint is readable (at least 4.5:1) on light, dark and brand backgrounds, 15 px semi-bold', async () => {
  for (const bg of ['default', 'alt', 'dark', 'brand']) {
    const { page } = await openPage(pageHtml({ bg }), 390);
    const c = await page.evaluate(() => {
      const lum = (col) => { const v = col.match(/[\d.]+/g).slice(0, 3).map((x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const h = document.querySelector('.v3-gal-hint'); let n = h, back = 'rgba(0, 0, 0, 0)';
      while (n && /rgba\(0, 0, 0, 0\)|transparent/.test(back)) { back = getComputedStyle(n).backgroundColor; n = n.parentElement; }
      const a = lum(getComputedStyle(h).color), b = lum(back);
      return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), size: getComputedStyle(h).fontSize, weight: getComputedStyle(h).fontWeight };
    });
    assert.ok(c.ratio >= 4.5, bg + ': contrast ' + c.ratio.toFixed(2));
    assert.deepEqual([c.size, c.weight], ['15px', '600'], bg);
    await page.close();
  }
});

test('Grid: no buttons, no hint, no focusable strip; one photo: no buttons and no hint', async () => {
  const { page } = await openPage(pageHtml({ variant: 'grid' }), 1280);
  assert.deepEqual(await page.evaluate(() => [!!document.querySelector('.v3-gal-carousel'), document.querySelectorAll('.v3-gal-btn').length, !!document.querySelector('.v3-gal-hint'), document.querySelectorAll('#s_gal09 [tabindex]').length]), [false, 0, false, 0]);
  await page.close();
  const one = await openPage(pageHtml({ count: 1 }), 390);
  assert.deepEqual(await one.page.evaluate(() => [document.querySelectorAll('.v3-gal-btn').length, !!document.querySelector('.v3-gal-hint')]), [0, false]);
  await one.page.close();
});

test('the page itself has no script (only the controller the application adds); no request beyond the page, the controller, photos and fonts', async () => {
  const html = pageHtml();
  assert.equal((html.match(/<script/gi) || []).length, 1, 'just the added controller');
  const { page, net, errors } = await openPage(html, 390);
  assert.deepEqual(errors, []);
  const host = new URL(base).host;
  assert.ok(net.every((h) => h === host + '/page.html' || h === host + '/js/lpV3/gallery-nav.js' || h.startsWith('res.cloudinary.com/') || /^fonts\./.test(h)), [...new Set(net)].join(','));
  await page.close();
});

test('the Studio preview: the controller runs in the sandboxed frames (desktop, tablet, mobile), also after every refresh; the frames load nothing; the full-size preview stays script-free', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('qraivy_lang', 'en'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} });
  // who asks for what: the Studio page reads the controller once; the frames request nothing but fonts
  const navReads = [], frameRequests = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/js/lpV3/gallery-nav.js') navReads.push(r.frame() === page.mainFrame() ? 'studio' : 'frame');
    if (r.frame() && r.frame() !== page.mainFrame() && /^https?:$/.test(u.protocol) && !/^fonts\./.test(u.host)) frameRequests.push(u.href);
  });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  // Phase C.1: the preview starts phone-first; these checks use the desktop frame (picked as an owner would, then loaded)
  if (await page.evaluate(() => { const b = document.querySelector('button[data-device="desktop"]'); if (!b || !b.offsetParent || b.getAttribute('aria-checked') === 'true') return false; b.click(); return true; })) {
    const h = await page.$('#st-canvas iframe[data-device="desktop"]'); const f = h && await h.contentFrame();
    if (f) await f.waitForSelector('[data-v3-id]', { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  await page.evaluate(() => window.QraivyStudio.editor.set('s_gal01', ['variant'], 'carousel'));
  // after an edit the frame reloads: the controller is in the new page again and runs
  {
    const ifr = await page.$('#st-canvas iframe[data-device="desktop"]');
    let fr = await ifr.contentFrame();
    await fr.waitForFunction(() => document.querySelector('.v3-gal-wrap') && document.querySelector('.v3-gal-wrap').getAttribute('data-nav') === 'on', { timeout: 5000 });
    await page.evaluate(() => window.QraivyStudio.editor.set('s_gal01', ['data', 'title'], 'Neu geladen'));
    await page.waitForFunction(() => document.querySelector('#st-canvas iframe[data-device="desktop"]').srcdoc.includes('Neu geladen'), { timeout: 5000 });
    fr = await (await page.$('#st-canvas iframe[data-device="desktop"]')).contentFrame();
    await fr.waitForFunction(() => document.querySelector('.v3-gal-carousel') && document.querySelector('.v3-gal-carousel').getAttribute('aria-label') === 'Neu geladen' && document.querySelector('.v3-gal-wrap').getAttribute('data-nav') === 'on', { timeout: 5000 });
  }
  for (const dev of ['desktop', 'tablet', 'mobile']) {
    if (dev !== 'desktop') await page.click('button[data-device="' + dev + '"]');
    await sleep(600);
    const ifr = await page.$('#st-canvas iframe[data-device="' + dev + '"]');
    assert.equal(await ifr.evaluate((n) => n.getAttribute('sandbox')), 'allow-scripts', dev + ': still sandboxed, scripts only');
    assert.equal(await ifr.evaluate((n) => (n.srcdoc.match(/<script/g) || []).length), 2, dev + ': the Studio frame script and the controller');
    const fr = await ifr.contentFrame();
    await fr.waitForFunction(() => document.querySelector('.v3-gal-wrap') && document.querySelector('.v3-gal-wrap').getAttribute('data-nav') === 'on', { timeout: 5000 });
    await fr.evaluate(() => document.querySelector('[data-v3-id="s_gal01"]').scrollIntoView());
    await fr.waitForFunction(() => [...document.querySelectorAll('.v3-gal-carousel img')].slice(0, 1).every((i) => i.complete && i.naturalWidth > 0 && /^data:image\/jpeg/.test(i.getAttribute('src'))), { timeout: 5000 });
    await sleep(300);
    const g = await fr.evaluate(() => {
      const s = document.querySelector('.v3-gal-carousel'), n = document.querySelector('.v3-gal-next').getBoundingClientRect();
      return { x: n.left + n.width / 2, y: n.top + n.height / 2, max: s.scrollWidth - s.clientWidth, labels: s.querySelectorAll('.st-ai').length, captions: s.querySelectorAll('figcaption').length, origin: (() => { try { return parent.document ? 'same' : 'x'; } catch (e) { return 'opaque'; } })() };
    });
    assert.deepEqual([g.labels, g.captions, g.origin], [3, 3, 'opaque'], dev + ': labels, captions; the frame cannot reach the Studio');
    if (g.max <= 0) continue; // nothing to scroll at this width
    const f = await ifr.evaluate((n) => { const b = n.getBoundingClientRect(); return { left: b.left, top: b.top, scale: b.width / n.offsetWidth }; });
    await page.mouse.click(f.left + g.x * f.scale, f.top + g.y * f.scale);
    await sleep(900);
    assert.ok((await fr.evaluate(() => document.querySelector('.v3-gal-carousel').scrollLeft)) > 0, dev + ': the next button scrolls in the preview');
  }
  // full size: the plain page, no permissions, no script; the buttons stay hidden there
  await page.click('button[data-device="desktop"]');
  await page.click('#st-preview-btn');
  await sleep(300);
  const full = await page.$eval('#st-full-frame', (n) => ({ sandbox: n.getAttribute('sandbox'), scripts: (n.srcdoc.match(/<script/gi) || []).length, buttons: (n.srcdoc.match(/<button type="button" class="v3-gal-btn[^"]*"[^>]* hidden>/g) || []).length }));
  assert.deepEqual(full, { sandbox: '', scripts: 0, buttons: 2 }, 'full size: script-free, buttons hidden');
  assert.deepEqual(navReads, ['studio'], 'the controller is read once, by the Studio page');
  assert.deepEqual(frameRequests, [], 'the sandboxed frames load nothing');
  await page.close();
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  // real scrollbars, as in desktop Chrome (puppeteer hides them by default)
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', ignoreDefaultArgs: ['--hide-scrollbars'] });
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  await browser.close(); server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
