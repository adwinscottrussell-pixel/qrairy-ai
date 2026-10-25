// ============================================================
// studioGalleryNavBrowsers.browser.test.js — Landing Page Studio V3, 2A-3H:
// the Gallery controller (js/lpV3/gallery-nav.js) behaves the same in Edge,
// Firefox and WebKit (Safari's engine) as in Chrome
// (studioGalleryCarousel.browser.test.js has the details). LOCAL ONLY:
// each browser runs when it is installed, otherwise SKIP for that browser.
//   Edge, Firefox: through puppeteer-core (Firefox over WebDriver BiDi).
//   WebKit: through playwright-core, a local test tool (not a project
//   dependency): require('playwright-core') or the path in PLAYWRIGHT_CORE,
//   with its WebKit build installed (npx playwright-core install webkit).
// Per browser, phone (390) and desktop (1280): the buttons appear once the
// controller runs; previous disabled at the start; next goes photo by photo
// with snapping exactly to the end (disabled there), previous back to the
// start; the keyboard scrolls the strip and the states follow; swiping to
// the end disables next; two carousels are independent; without the
// controller no buttons, the edge fade and the hint; white buttons on the
// brand colour; reduced motion jumps (Edge, WebKit).
// Real iPhone Safari acceptance is still needed.
// Run: node tests/studioGalleryNavBrowsers.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

let puppeteer = null, playwright = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
try { playwright = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'); } catch (e) { playwright = null; }
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/microsoft-edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find((p) => fs.existsSync(p));
const FIREFOX = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Mozilla Firefox', 'firefox.exe'), 'C:/Program Files/Mozilla Firefox/firefox.exe', '/usr/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'].filter((p) => p && fs.existsSync(p));

const V3 = require('../src/lpV3/core');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const BASE = require('./fixtures/lpV3/localBusiness.json');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' };
let pages = {};
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (pages[url]) { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(pages[url]); }
  const p = path.join(PUB, decodeURIComponent(url));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let base;

// the page as core.js renders it (photos from the local server), the controller added unless nav: false
function gallery(id, n) { return { id, type: 'gallery', variant: 'carousel', data: { title: 'Fotos', images: Array.from({ length: n }, (x, i) => ({ image: 'https://res.cloudinary.com/demo/image/upload/v1/' + id + i + '.jpg', alt: 'Foto ' + (i + 1), caption: 'Bild ' + (i + 1) })) } }; }
function pageHtml({ bg, nav = true, two = false } = {}) {
  const d = JSON.parse(JSON.stringify(BASE));
  const g = gallery('s_gal09', 4);
  if (bg) g.style = { background: bg };
  d.pages[0].sections.splice(1, 0, g);
  if (two) d.pages[0].sections.splice(2, 0, gallery('s_gal10', 6));
  const r = V3.renderDesign(d, { businessName: 'Musterbäckerei' });
  assert.ok(r.ok && !/<script/i.test(r.html));
  const html = r.html.split(/https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/v1\/[a-z0-9_]+\.jpg/).join('/images/deals/starter/bakery-bread-01.jpg')
    .split(/<link[^>]*fonts\.googleapis[^>]*>/).join('');
  return nav ? html.replace('</body></html>', '<script src="/js/lpV3/gallery-nav.js"></script></body></html>') : html;
}

// one interface over puppeteer (Edge, Firefox) and playwright (WebKit)
const BROWSERS = [
  { name: 'Edge', ok: !!(puppeteer && EDGE), reduce: true,
    launch: () => puppeteer.launch({ executablePath: EDGE, headless: 'new' }),
    open: async (b, w, o) => { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); if (o.reduce) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); return { page: p, close: () => p.close() }; } },
  { name: 'Firefox', ok: !!(puppeteer && FIREFOX.length), reduce: false,
    launch: async () => { for (const exe of FIREFOX) { try { return await puppeteer.launch({ browser: 'firefox', executablePath: exe, headless: true }); } catch (e) { /* next */ } } return null; },
    open: async (b, w) => { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); return { page: p, close: () => p.close() }; } },
  { name: 'WebKit', ok: !!playwright, reduce: true,
    launch: async () => { try { return await playwright.webkit.launch(); } catch (e) { return null; } },
    open: async (b, w, o) => { const c = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: o.reduce ? 'reduce' : 'no-preference' }); const p = await c.newPage(); return { page: p, close: () => c.close() }; } },
];

async function load(B, b, w, html, o = {}) {
  pages = { '/page.html': html };
  const t = await B.open(b, w, o);
  await t.page.goto(base + '/page.html', { waitUntil: 'load' });
  await t.page.evaluate(() => document.getElementById('s_gal09').scrollIntoView());
  await sleep(300);
  return t;
}
const state = (page, id = 's_gal09') => page.evaluate((sid) => {
  const sec = document.getElementById(sid), s = sec.querySelector('.v3-gal-carousel'), wrap = sec.querySelector('.v3-gal-wrap');
  const b = (n) => ({ shown: getComputedStyle(n).display !== 'none', disabled: n.disabled, bg: getComputedStyle(n).backgroundColor, color: getComputedStyle(n).color, top: n.getBoundingClientRect().top, mid: n.getBoundingClientRect().top + 28 });
  const img = s.querySelector('img').getBoundingClientRect(), last = s.lastElementChild.getBoundingClientRect(), r = s.getBoundingClientRect();
  return { x: Math.round(s.scrollLeft), max: s.scrollWidth - s.clientWidth, step: s.children[1].getBoundingClientRect().left - s.children[0].getBoundingClientRect().left,
    bottom: r.bottom, right: r.right, lastRight: last.right, photoMid: img.top + img.height / 2, nav: wrap.getAttribute('data-nav'),
    prev: b(sec.querySelector('.v3-gal-prev')), next: b(sec.querySelector('.v3-gal-next')), fade: getComputedStyle(wrap, '::after').content, hint: sec.querySelector('.v3-gal-hint').innerText.trim() };
}, id);
async function settle(page, id) { let last = -1; for (let i = 0; i < 40; i++) { const v = (await state(page, id)).x; if (v === last) return v; last = v; await sleep(80); } return last; }
const press = (page, which, id = 's_gal09') => page.evaluate(([w, sid]) => document.getElementById(sid).querySelector('.v3-gal-' + w).click(), [which, id]);

async function scenario(B, b) {
  for (const w of [390, 1280]) {
    const L = B.name + ' ' + w + 'px';
    const { page, close } = await load(B, b, w, pageHtml());
    let s = await state(page);
    assert.deepEqual([s.nav, s.prev.shown, s.next.shown, s.prev.disabled, s.next.disabled, s.fade], ['on', true, true, true, false, 'none'], L + ': shown by the controller, previous disabled');
    assert.deepEqual([s.next.bg, s.next.color], ['rgb(255, 90, 31)', 'rgb(255, 255, 255)'], L + ': orange');
    if (w < 768) assert.ok(Math.abs(s.next.top - (s.bottom + 8)) < 1.5, L + ': under the photos');
    else assert.ok(Math.abs(s.next.mid - s.photoMid) < 2, L + ': centred on the photos');
    const stops = [];
    for (let i = 0; i < 5; i++) { await press(page, 'next'); stops.push(await settle(page)); }
    for (const v of stops) assert.ok(v === s.max || Math.abs(v / s.step - Math.round(v / s.step)) < 0.02, L + ': snapped ' + v);
    s = await state(page);
    assert.deepEqual([s.x, s.prev.disabled, s.next.disabled, s.lastRight <= s.right + 0.5], [s.max, false, true, true], L + ': exactly at the end, next disabled, last photo shown');
    for (let i = 0; i < 5; i++) { await press(page, 'prev'); await settle(page); }
    s = await state(page);
    assert.deepEqual([s.x, s.prev.disabled, s.next.disabled], [0, true, false], L + ': back at the start');
    // keyboard on the strip; the states follow
    await page.focus('#s_gal09-photos');
    await page.keyboard.press('ArrowRight');
    assert.ok((await settle(page)) > 0, L + ': ArrowRight scrolls');
    assert.equal((await state(page)).prev.disabled, false, L + ': states follow the keyboard');
    // swiping to the end (scrolling the strip directly)
    await page.evaluate(() => { const st = document.getElementById('s_gal09-photos'); st.scrollTo({ left: st.scrollWidth, behavior: 'auto' }); });
    await settle(page);
    assert.equal((await state(page)).next.disabled, true, L + ': swiped to the end, next disabled');
    await close();
  }
  // two carousels: independent
  {
    const { page, close } = await load(B, b, 1280, pageHtml({ two: true }));
    await press(page, 'next', 's_gal10');
    await settle(page, 's_gal10');
    const a = await state(page, 's_gal09'), c = await state(page, 's_gal10');
    assert.deepEqual([c.x > 0, a.x, a.prev.disabled], [true, 0, true], B.name + ': two carousels independent');
    await close();
  }
  // without the controller: no buttons, the edge fade, the hint
  {
    const { page, close } = await load(B, b, 390, pageHtml({ nav: false }));
    const s = await state(page);
    assert.deepEqual([s.prev.shown, s.next.shown, s.nav, s.fade, s.hint], [false, false, null, '""', 'Weitere Bilder · Wischen'], B.name + ': without the controller');
    await close();
  }
  // brand colour: white buttons, orange chevrons
  {
    const { page, close } = await load(B, b, 390, pageHtml({ bg: 'brand' }));
    const s = await state(page);
    assert.deepEqual([s.next.bg, s.next.color], ['rgb(255, 255, 255)', 'rgb(255, 90, 31)'], B.name + ': brand colour');
    await close();
  }
  // reduced motion: there at once
  if (B.reduce) {
    const { page, close } = await load(B, b, 1280, pageHtml(), { reduce: true });
    const early = await page.evaluate(async () => { document.querySelector('.v3-gal-next').click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(document.getElementById('s_gal09-photos').scrollLeft); });
    assert.equal(early, await settle(page), B.name + ': reduced motion jumps');
    await close();
  }
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  let passed = 0, failed = 0, ran = 0;
  for (const B of BROWSERS) {
    const name = B.name + ': the controller works the same (phone + desktop, snapping, ends, keyboard, swipe, two carousels, no-script fallback, brand colour, reduced motion)';
    const b = B.ok ? await B.launch() : null;
    if (!b) { console.log('SKIP  ' + B.name + ': not available on this machine'); continue; }
    ran++;
    try { await scenario(B, b); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
    await b.close();
  }
  server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ran + ' browsers run)');
  process.exit(failed ? 1 : 0);
})();
