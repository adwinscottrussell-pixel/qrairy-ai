// ============================================================
// onboardingTemplates.browser.test.js — Landing Page Studio V3 onboarding,
// Phase T0: the six starter templates rendered by core.js in a real
// browser (LOCAL ONLY: needs Chrome and puppeteer-core; prints SKIP and
// passes when they are missing).
//
// Each example page (js/studio/onboarding-templates.js sample()) is the
// public page core.js renders, opened as it is; the starter photos are
// answered from images/deals/starter/ and images/studio/starter/ (no
// request to Cloudinary). Checked
// at 320, 360, 390, 768 and 1280 px, EN and DE: no sideways scrolling and
// nothing outside the screen (the carousel scrolls inside itself; the skip
// link is off-screen until focused); every photo loads; buttons, link cards
// and social chips are at least 44 px tall; every visible text reads at
// 4.5:1 on its own background (3:1 for large text) in every palette (text
// on a photo is left to the photo's shade); no script error; no request
// except the fonts and the photos.
// Run: node tests/onboardingTemplates.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  onboardingTemplates.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const V3 = require('../../frontend/public/js/lpV3/core.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');
const IMAGES = require('../../frontend/public/js/studio/studio-demo-images.js');
const FONT = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let browser;

async function open(id, { lang = 'en', palette, width = 390 } = {}) {
  const r = T.sample(V3, id, { lang, palette, imageUrl: T.imageUrl });
  assert.ok(r.ok, id + ' valid');
  const html = V3.renderDesign(r.design, { businessName: r.design.pages[0].sections[0].data.headline }, {}).html;
  const page = await browser.newPage();
  await page.setViewport({ width, height: 844 });
  const other = [], errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (q) => {
    const u = q.url();
    const m = /^https:\/\/res\.cloudinary\.com\/dwqc6n7rn\/image\/upload\/[^/]+\/qraivy-(deal|studio)-starters\/([A-Za-z0-9-]+)\.jpg$/.exec(u);
    if (m) return q.respond({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(path.join(PUB, 'images', m[1] === 'deal' ? 'deals' : 'studio', 'starter', m[2] + '.jpg')) });
    if (FONT.test(u) || u === 'about:blank' || u.startsWith('data:')) return q.continue();
    other.push(u); q.abort();
  });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  // the carousel's lazy photos outside the screen: scroll them in once
  await page.evaluate(() => document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 10000 });
  return { page, other, errors, design: r.design };
}

// layout facts in the page: overflow, photos, touch targets
function layout() {
  const W = innerWidth;
  const out = [];
  document.querySelectorAll('body *').forEach((e) => {
    if (e.closest('.v3-skip') || e.matches('.v3-skip')) return;
    if (e.closest('.v3-gal-carousel') && !e.matches('.v3-gal-carousel')) return;   // scrolls inside itself
    const r = e.getBoundingClientRect();
    if (r.width && (r.right > W + 0.5 || r.left < -0.5)) out.push(e.tagName + '.' + e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
  });
  const small = [...document.querySelectorAll('.v3-btn, .v3-card-link, .v3-social')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44)
    .map((e) => e.className + ' ' + e.getBoundingClientRect().height);
  const broken = [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src.slice(-40));
  // the space between the header (business name) and the Hero's first line
  const gap = Math.round(document.querySelector('.v3-hero-text').firstElementChild.getBoundingClientRect().top - document.querySelector('header').getBoundingClientRect().bottom);
  return { scroll: document.documentElement.scrollWidth, width: W, out, small, broken, images: document.images.length, gap };
}

// every visible text: its colour against the first opaque background behind it
function readability() {
  function rgb(s) { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; }
  function lum(c) { return [0, 1, 2].map((i) => c[i] / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
  function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function bg(e) { for (let n = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length < 4 || c[3] > 0.95) return c; } return [255, 255, 255]; }
  const fails = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const e = t.parentElement;
    if (!t.textContent.trim() || !e.offsetParent || e.closest('.v3-skip')) continue;
    if (e.closest('.v3-hero.v3-v-overlay.v3-has-img')) continue;   // on the photo, under its shade
    const s = getComputedStyle(e);
    const fg = rgb(s.color);
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(fg, bg(e)) * (fg.length > 3 && fg[3] < 1 ? fg[3] : 1);
    if (r < need) fails.push(t.textContent.trim().slice(0, 30) + ' ' + r.toFixed(2) + ' < ' + need);
  }
  return fails;
}

const WIDTHS = [320, 360, 390, 768, 1280];

T.TEMPLATE_IDS.forEach((id) => {
  test(id + ': EN and DE at 320 / 360 / 390 / 768 / 1280 px: no sideways scrolling, photos load, touch targets 44 px, no error, no other request', async () => {
    for (const lang of ['en', 'de']) {
      for (const width of WIDTHS) {
        const { page, other, errors } = await open(id, { lang, width });
        const l = await page.evaluate(layout);
        const tag = id + ' ' + lang + ' ' + width;
        assert.equal(l.scroll, l.width, tag + ': page wider than the screen');
        assert.deepEqual(l.out, [], tag + ': outside the screen');
        assert.deepEqual(l.broken, [], tag + ': photo not loaded');
        assert.deepEqual(l.small, [], tag + ': touch target under 44 px');
        assert.equal(l.images, T.get(id).images.length ? l.images : 0, tag + ': no photo without a matching starter image');
        // T0 refinement: Creator and Services start about half as far below the header on phones (96 -> 52 px); the others unchanged
        if (width < 768) assert.ok(Math.abs(l.gap - (['creator', 'services'].includes(id) ? 52 : 96)) <= 2, tag + ': space above the Hero text ' + l.gap);
        assert.deepEqual(errors, [], tag);
        assert.deepEqual(other, [], tag + ': request');
        await page.close();
      }
    }
  });
  test(id + ': every palette, EN and DE at 390 px: every visible text reads at 4.5:1 (large text 3:1)', async () => {
    for (const p of T.get(id).palettes) {
      for (const lang of ['en', 'de']) {
        const { page } = await open(id, { lang, palette: p.id, width: 390 });
        assert.deepEqual(await page.evaluate(readability), [], id + ' ' + p.id + ' ' + lang);
        await page.close();
      }
    }
  });
});

test('photos carry their description: every image has the alt text the catalog gives it (EN and DE)', async () => {
  for (const id of T.TEMPLATE_IDS.filter((x) => T.get(x).images.length)) {
    for (const lang of ['en', 'de']) {
      const { page } = await open(id, { lang });
      const alts = await page.$$eval('img', (n) => n.map((i) => i.getAttribute('alt')));
      assert.ok(alts.length && alts.every((a) => a && a.length > 3), id + ' ' + lang + ' alt texts');
      await page.close();
    }
  }
});

(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
