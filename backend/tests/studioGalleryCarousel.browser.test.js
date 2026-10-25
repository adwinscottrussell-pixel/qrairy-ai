// ============================================================
// studioGalleryCarousel.browser.test.js — Landing Page Studio V3, 2A-3H:
// Gallery carousel navigation without script, in a real browser (LOCAL ONLY:
// needs Chrome and puppeteer-core; prints SKIP and passes when missing).
//
// Pages are rendered by the shared core.js (the published page and the
// Studio preview use the same markup and CSS). Checked in Chrome, which has
// ::scroll-button(): two real arrow buttons named in the page language
// (German / English), over the photo edges (centred on the photos, not the
// captions), scrolling the strip with snapping, the start / end arrow
// disabled; keyboard (arrow keys on the focused strip, Tab + Enter on the
// arrows); sideways scrolling still works; the swipe hint shows everywhere;
// Grid has none of it; desktop / tablet / mobile widths; the page has no
// script. The unsupported-browser fallback (Safari, Firefox) is simulated
// by making the @supports test fail: then no button at all, the edge fade
// and the swipe hint; and checked in a real Firefox when one is installed.
// Finally the Studio preview: the arrows work there too, AI labels and
// captions stay.
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

// a published page with one gallery, rendered by core.js
function pageHtml({ lang = 'de', variant = 'carousel', count = 4, unsupported = false, bg } = {}) {
  const d = JSON.parse(JSON.stringify(BASE));
  d.settings.language = lang;
  d.pages[0].sections.splice(1, 0, { id: 's_gal09', type: 'gallery', variant, style: bg ? { background: bg } : undefined, data: { title: 'Fotos', images: Array.from({ length: count }, (x, i) => ({ image: IMG('p' + i), alt: 'Foto ' + (i + 1), caption: 'Bild ' + (i + 1) })) } });
  const r = V3.renderDesign(d, { businessName: 'Musterbäckerei' });
  assert.ok(r.ok, JSON.stringify(r.errors));
  // simulated Safari / Firefox: the @supports test fails, so the fallback applies
  return unsupported ? r.html.split('selector(::scroll-button(right))').join('selector(::no-such-pseudo(right))') : r.html;
}
async function openPage(html, width, height = 900) {
  pages = { '/page.html': html };
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.setRequestInterception(true);
  const net = [], errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) net.push(u.host);
    if (u.host === 'res.cloudinary.com') return r.respond({ status: 200, contentType: 'image/jpeg', body: PHOTO });
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    return r.continue();
  });
  await page.goto(base + '/page.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.querySelector('#s_gal09').scrollIntoView());
  await sleep(300);
  return { page, net, errors };
}
const strip = (page) => page.evaluate(() => {
  const s = document.querySelector('.v3-gal-carousel'), r = s.getBoundingClientRect(), img = s.querySelector('img').getBoundingClientRect(), cap = s.querySelector('figcaption').getBoundingClientRect();
  const hint = document.querySelector('.v3-gal-hint');
  return { left: r.left, right: r.right, top: r.top, scrollLeft: Math.round(s.scrollLeft), max: s.scrollWidth - s.clientWidth, photoMid: img.top + img.height / 2, photoBottom: img.bottom, captionTop: cap.top,
    itemWidth: s.querySelector('.v3-gal-item').getBoundingClientRect().width, hint: hint ? getComputedStyle(hint).display : 'absent', hintText: hint ? hint.textContent : '',
    fade: getComputedStyle(document.querySelector('.v3-gal-wrap'), '::after').content };
});
async function arrows(page) {
  const ax = await page.accessibility.snapshot({ interestingOnly: true });
  const out = [];
  (function walk(n) { if (!n) return; if (n.role === 'button' && /Bild|image/.test(n.name || '')) out.push({ name: n.name, disabled: !!n.disabled }); (n.children || []).forEach(walk); })(ax);
  return out;
}
// where the arrows are drawn: 56 px circles 10 px inside the strip edges, centred on the photos
const rightArrow = (s) => ({ x: s.right - 10 - 28, y: s.photoMid });
const leftArrow = (s) => ({ x: s.left + 10 + 28, y: s.photoMid });
// is an arrow painted at (x, y) right now, without hovering? Compares that
// spot with the same page where the arrows are removed (content: none).
async function painted(page, at) {
  await page.mouse.move(2, 2);
  // captureBeyondViewport: false, or the page's own scrollbar vanishes during
  // the capture and the layout (and the photo) shifts under the probe
  const shot = async () => { const y = await page.evaluate(() => scrollY); return page.screenshot({ clip: { x: at.x - 20, y: y + at.y - 20, width: 40, height: 40 }, encoding: 'base64', captureBeyondViewport: false }); };
  const withArrow = await shot();
  const tag = await page.addStyleTag({ content: '.v3-gal-carousel::scroll-button(*){content:none!important}' });
  await sleep(150);
  const without = await shot();
  await tag.evaluate((n) => n.remove());
  await sleep(150);
  return withArrow !== without;
}
async function settle(page) { let last = -1; for (let i = 0; i < 30; i++) { const v = (await strip(page)).scrollLeft; if (v === last) return v; last = v; await sleep(80); } return last; }

test('Chrome: two real arrow buttons, named in German, the left one disabled at the start; over the photo edges, centred on the photos (desktop, tablet, mobile)', async () => {
  for (const w of [1280, 820, 390]) {
    const { page, errors } = await openPage(pageHtml(), w);
    assert.deepEqual(await arrows(page), [{ name: 'Vorheriges Bild', disabled: true }, { name: 'Nächstes Bild', disabled: false }], w + 'px');
    const s = await strip(page);
    assert.ok(s.photoMid < s.photoBottom && s.photoMid < s.captionTop, w + 'px: centred on the photo, above the caption');
    assert.equal(s.hint, 'block', w + 'px: the swipe hint shows with the arrows too');
    assert.equal(s.hintText, '← Weitere Bilder: wischen oder scrollen →');
    assert.equal(s.fade, 'none', w + 'px: no edge fade either');
    // both arrows are painted without hovering: the enabled right one and the dimmed (disabled) left one
    assert.ok(await painted(page, rightArrow(s)), w + 'px: the right arrow is visible without hovering');
    assert.ok(await painted(page, leftArrow(s)), w + 'px: the disabled left arrow stays subtly visible');
    // the arrow (56 px) stays above the caption
    assert.ok(s.photoMid + 28 < s.captionTop, w + 'px: away from the caption');
    // the right arrow is where it is drawn: a click there scrolls
    await page.mouse.click(rightArrow(s).x, rightArrow(s).y);
    assert.ok((await settle(page)) > 0, w + 'px: the right arrow scrolls');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('clicks scroll with snapping to a photo; at the end the right arrow is disabled, the left one enabled; left goes back', async () => {
  const { page } = await openPage(pageHtml(), 390);
  const s = await strip(page);
  const snaps = [];
  for (let i = 0; i < 6; i++) { await page.mouse.click(rightArrow(s).x, rightArrow(s).y); snaps.push(await settle(page)); }
  const last = snaps[snaps.length - 1];
  assert.equal(last, s.max, 'reaches the end');
  // every stop is a photo start (snapping), or the very end
  const step = s.itemWidth + 12;
  for (const v of snaps) assert.ok(v === s.max || Math.abs(v / step - Math.round(v / step)) < 0.02, 'snapped: ' + v);
  assert.deepEqual(await arrows(page), [{ name: 'Vorheriges Bild', disabled: false }, { name: 'Nächstes Bild', disabled: true }]);
  await page.mouse.click(leftArrow(s).x, leftArrow(s).y);
  assert.ok((await settle(page)) < s.max, 'the left arrow scrolls back');
  // a click on the photo away from the edges does not scroll
  const before = await settle(page);
  await page.mouse.click((s.left + s.right) / 2, s.photoMid);
  assert.equal(await settle(page), before);
  await page.close();
});

// desktop widths with a classic page scrollbar put the strip on a half pixel;
// with fractional photo widths snapping stopped 1 px short of the end there
test('desktop end state: the right arrow is disabled at the very end, the last photo fully shown; back to the start', async () => {
  for (const w of [1024, 1280]) {
    const { page } = await openPage(pageHtml(), w);
    const s = await strip(page);
    let v = 0;
    for (let i = 0; i < 5; i++) { await page.mouse.click(rightArrow(s).x, rightArrow(s).y); v = await settle(page); }
    assert.equal(v, s.max, w + 'px: reaches the end');
    assert.deepEqual(await arrows(page), [{ name: 'Vorheriges Bild', disabled: false }, { name: 'Nächstes Bild', disabled: true }], w + 'px');
    assert.ok(await page.$eval('.v3-gal-carousel', (n) => n.lastElementChild.getBoundingClientRect().right <= n.getBoundingClientRect().right), w + 'px: the last photo fully shown');
    for (let i = 0; i < 5; i++) { await page.mouse.click(leftArrow(s).x, leftArrow(s).y); v = await settle(page); }
    assert.equal(v, 0, w + 'px: back at the start');
    assert.deepEqual(await arrows(page), [{ name: 'Vorheriges Bild', disabled: true }, { name: 'Nächstes Bild', disabled: false }], w + 'px');
    await page.close();
  }
});

test('keyboard: the strip is focusable and named; arrow keys scroll it; Tab reaches the arrows and Enter presses them', async () => {
  const { page } = await openPage(pageHtml(), 1280);
  assert.deepEqual(await page.$eval('.v3-gal-carousel', (n) => [n.tabIndex, n.getAttribute('role'), n.getAttribute('aria-label')]), [0, 'region', 'Fotos']);
  await page.focus('.v3-gal-carousel');
  await page.keyboard.press('ArrowRight');
  const afterKey = await settle(page);
  assert.ok(afterKey > 0, 'ArrowRight scrolls');
  await page.keyboard.press('ArrowLeft');
  assert.ok((await settle(page)) < afterKey, 'ArrowLeft scrolls back');
  assert.equal(await page.$eval('.v3-gal-carousel', (n) => getComputedStyle(n, ':focus-visible') && n.matches(':focus-visible')), true, 'a visible focus ring');
  // the arrows sit right before the strip in the tab order: Shift+Tab from
  // the strip lands on the enabled one (the left one is disabled at the
  // start). A focused ::scroll-button() reports its strip as activeElement.
  await page.evaluate(() => { document.querySelector('.v3-gal-carousel').scrollLeft = 0; });
  await settle(page);
  await page.focus('.v3-gal-carousel');
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  assert.ok(await page.evaluate(() => document.activeElement === document.querySelector('.v3-gal-carousel')), 'focus on the arrow (reported on its strip)');
  await page.keyboard.press('Enter');
  assert.ok((await settle(page)) > 0, 'an arrow is reachable with the keyboard and pressed with Enter');
  // now the left arrow is enabled too: one more Shift+Tab reaches it, Enter scrolls back
  const moved = await settle(page);
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  await page.keyboard.press('Enter');
  assert.ok((await settle(page)) < moved, 'the left arrow is reachable and pressed with Enter too');
  await page.close();
});

test('English labels; no visible scrollbar, sideways scrolling (wheel / trackpad) still works with the arrows present', async () => {
  const { page } = await openPage(pageHtml({ lang: 'en' }), 820);
  assert.deepEqual(await arrows(page), [{ name: 'Previous image', disabled: true }, { name: 'Next image', disabled: false }]);
  assert.deepEqual(await page.$eval('.v3-gal-carousel', (n) => [n.offsetHeight - n.clientHeight, getComputedStyle(n).scrollbarWidth, getComputedStyle(n).overflowX]), [0, 'none', 'auto'], 'scrollbar hidden, the strip still scrolls');
  const s = await strip(page);
  await page.mouse.move((s.left + s.right) / 2, s.photoMid);
  await page.mouse.wheel({ deltaX: 300 });
  assert.ok((await settle(page)) > 0, 'native sideways scrolling');
  await page.close();
});

// WCAG contrast of the hint text against what is behind it (its own chip or the section)
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

test('Grid: no arrows, no hint, no focusable strip; one photo: no hint', async () => {
  const { page } = await openPage(pageHtml({ variant: 'grid' }), 1280);
  assert.deepEqual(await arrows(page), []);
  assert.deepEqual(await page.evaluate(() => [!!document.querySelector('.v3-gal-carousel'), !!document.querySelector('.v3-gal-hint'), document.querySelectorAll('#s_gal09 [tabindex]').length]), [false, false, 0]);
  await page.close();
  const one = await openPage(pageHtml({ count: 1 }), 390);
  assert.equal(await one.page.evaluate(() => !!document.querySelector('.v3-gal-hint')), false);
  await one.page.close();
});

test('unsupported browser (simulated: the @supports test fails): no button at all, the edge fade and the swipe hint; sideways scrolling works', async () => {
  for (const [w, lang, text] of [[390, 'de', '← Weitere Bilder: wischen oder scrollen →'], [1280, 'en', '← More photos: swipe or scroll →']]) {
    const { page } = await openPage(pageHtml({ lang, unsupported: true }), w);
    assert.deepEqual(await arrows(page), [], w + 'px: no arrow buttons');
    const s = await strip(page);
    assert.equal(s.hint, 'block', w + 'px: the hint shows');
    assert.equal(s.hintText, text);
    assert.equal(s.fade, '""', w + 'px: the edge fade');
    assert.ok(await page.$eval('.v3-gal-hint', (n) => n.getAttribute('aria-hidden') === 'true' && n.tagName === 'P' && !n.closest('button, a')), 'the hint is plain text, not a control');
    // a click where an arrow would be does nothing
    await page.mouse.click(rightArrow(s).x, rightArrow(s).y);
    assert.equal(await settle(page), 0, w + 'px: nothing clickable at the edge');
    await page.mouse.move((s.left + s.right) / 2, s.photoMid);
    await page.mouse.wheel({ deltaX: 300 });
    assert.ok((await settle(page)) > 0, w + 'px: scrolling still works');
    assert.equal(await page.$eval('.v3-gal-carousel', (n) => n.offsetHeight - n.clientHeight), 0, w + 'px: no visible scrollbar here either; the hint explains');
    await page.close();
  }
});

// a real Firefox (no ::scroll-button), when one is installed
const FIREFOX = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Mozilla Firefox', 'firefox.exe'), 'C:/Program Files/Mozilla Firefox/firefox.exe', '/usr/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'].filter((p) => p && fs.existsSync(p));
test('Firefox (real, no ::scroll-button): no arrows; the hint shows; keyboard scrolls with snapping; no visible scrollbar', async () => {
  let ff = null;
  for (const exe of FIREFOX) { try { ff = await puppeteer.launch({ browser: 'firefox', executablePath: exe, headless: true }); break; } catch (e) { ff = null; } }
  if (!ff) { console.log('      (SKIP: no Firefox could be started)'); return; }
  try {
    for (const [w, lang, text] of [[390, 'de', '← Weitere Bilder: wischen oder scrollen →'], [1280, 'en', '← More photos: swipe or scroll →']]) {
      // photos from the local server (no request interception needed)
      pages = { '/page.html': pageHtml({ lang }).split('https://res.cloudinary.com/demo/image/upload/v1/').join('/images/deals/starter/bakery-bread-01.jpg?') };
      const page = await ff.newPage();
      await page.setViewport({ width: w, height: 900 });
      await page.goto(base + '/page.html', { waitUntil: 'load' });
      await page.evaluate(() => document.querySelector('#s_gal09').scrollIntoView());
      await sleep(300);
      const info = await page.evaluate(() => {
        const s = document.querySelector('.v3-gal-carousel'), h = document.querySelector('.v3-gal-hint');
        return { buttons: CSS.supports('selector(::scroll-button(right))'), hint: getComputedStyle(h).display, hintText: h.textContent, hintH: h.getBoundingClientRect().height,
          bar: getComputedStyle(s).scrollbarWidth, barPx: s.offsetHeight - s.clientHeight, fade: getComputedStyle(document.querySelector('.v3-gal-wrap'), '::after').content };
      });
      assert.deepEqual([info.buttons, info.hint, info.hintText, info.bar, info.barPx, info.fade], [false, 'block', text, 'none', 0, '""'], w + 'px: no arrows, the hint, hidden scrollbar, edge fade');
      assert.ok(info.hintH > 0, w + 'px: the hint takes space under the photos');
      const step = await page.evaluate(() => { const it = document.querySelectorAll('.v3-gal-item'); return it[1].getBoundingClientRect().left - it[0].getBoundingClientRect().left; });
      const max = await page.evaluate(() => { const s = document.querySelector('.v3-gal-carousel'); return s.scrollWidth - s.clientWidth; });
      const at = async () => { let last = -1, v; for (let i = 0; i < 30; i++) { await sleep(100); v = await page.evaluate(() => document.querySelector('.v3-gal-carousel').scrollLeft); if (v === last) break; last = v; } return v; };
      await page.focus('.v3-gal-carousel');
      await page.keyboard.press('ArrowRight');
      const k = await at();
      assert.ok(k > 0, w + 'px: ArrowRight scrolls');
      assert.ok(Math.abs(k - max) < 1 || Math.abs(k / step - Math.round(k / step)) < 0.02, w + 'px: snapped to a photo: ' + k);
      await page.keyboard.press('ArrowLeft');
      assert.ok((await at()) < k, w + 'px: ArrowLeft scrolls back');
      await page.close();
    }
  } finally { await ff.close(); }
});

test('the published page has no script; no request beyond the page, its photos and fonts', async () => {
  const html = pageHtml();
  assert.ok(!/<script/i.test(html));
  const { page, net, errors } = await openPage(html, 390);
  assert.deepEqual(errors, []);
  assert.ok(net.every((h) => h === new URL(base).host || h === 'res.cloudinary.com' || /^fonts\./.test(h)), [...new Set(net)].join(','));
  await page.close();
});

test('the Studio preview: in Carousel the arrows work in the desktop, tablet and mobile frames; AI labels and captions stay', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('qraivy_lang', 'en'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.QraivyStudio.editor.set('s_gal01', ['variant'], 'carousel'));
  for (const dev of ['desktop', 'tablet', 'mobile']) {
    if (dev !== 'desktop') await page.click('button[data-device="' + dev + '"]');
    await sleep(600);
    const ifr = await page.$('#st-canvas iframe[data-device="' + dev + '"]');
    const fr = await ifr.contentFrame();
    await fr.waitForFunction(() => !!document.querySelector('.v3-gal-carousel'), { timeout: 5000 });
    await fr.evaluate(() => document.querySelector('[data-v3-id="s_gal01"]').scrollIntoView());
    // the photos are lazy: the first ones load once the strip is in view
    await fr.waitForFunction(() => [...document.querySelectorAll('.v3-gal-carousel img')].slice(0, 1).every((i) => i.complete && i.naturalWidth > 0 && /^data:image\/jpeg/.test(i.getAttribute('src'))), { timeout: 5000 });
    await sleep(300);
    const g = await fr.evaluate(() => {
      const s = document.querySelector('.v3-gal-carousel'), r = s.getBoundingClientRect(), img = s.querySelector('img').getBoundingClientRect();
      return { right: r.right, mid: img.top + img.height / 2, scrollLeft: s.scrollLeft, max: s.scrollWidth - s.clientWidth,
        labels: s.querySelectorAll('.st-ai').length, captions: s.querySelectorAll('figcaption').length, hint: getComputedStyle(document.querySelector('.v3-gal-hint')).display };
    });
    assert.deepEqual([g.labels, g.captions, g.hint], [3, 3, 'block'], dev + ': labels, captions, the swipe hint');
    if (g.max <= 0) continue; // nothing to scroll at this width
    const f = await ifr.evaluate((n) => { const b = n.getBoundingClientRect(); return { left: b.left, top: b.top, scale: b.width / n.offsetWidth }; });
    await page.mouse.click(f.left + (g.right - 38) * f.scale, f.top + g.mid * f.scale);
    await sleep(900);
    assert.ok((await fr.evaluate(() => document.querySelector('.v3-gal-carousel').scrollLeft)) > 0, dev + ': the right arrow scrolls in the preview');
  }
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
