// ============================================================
// studioHeroMobile.browser.test.js — Hero mobile spacing, badge size and the
// Studio phone preview (owner-approved after the Studio V3 staging visual
// review, 2026-10-31):
// - split Hero on phones: 20px between the buttons and the stacked image;
//   from 768px the side-by-side grid is unchanged (gap 40px, no extra margin);
//   overlay and simple Heroes have no stacked image and are unchanged;
// - the badge is 12px; headline, description and buttons keep their sizes;
// - the phone preview is scaled by width only (full size where it fits; the
//   canvas scrolls vertically), side by side at least 0.9 where the width
//   allows; no horizontal overflow; the inspector stays usable.
// Run: node tests/studioHeroMobile.browser.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const V3 = require('../src/lpV3/core');
const BASE = require('./fixtures/lpV3/localBusiness.json');
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAEklEQVR4nGNgGAWjYBSMAggAAAQQAAFVN1rQAAAAAElFTkSuQmCC', 'base64');
let browser, srv;

// the reference page with its Hero in the given variant (with badge, image and both buttons)
function heroHtml(variant) {
  const d = JSON.parse(JSON.stringify(BASE));
  const hero = d.pages[0].sections.find((s) => s.type === 'hero');
  hero.variant = variant;
  const r = V3.renderDesign(d, { businessName: 'Musterbäckerei' });
  assert.ok(r.ok, variant);
  return r.html;
}
async function heroAt(variant, width) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.resourceType() === 'image' ? r.respond({ status: 200, contentType: 'image/png', body: PNG }) : r.url().startsWith('http') ? r.abort() : r.continue()));
  await page.setContent(heroHtml(variant), { waitUntil: 'networkidle0' });
  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector('.v3-hero ' + s);
    const px = (e, p) => (e ? getComputedStyle(e)[p] : null);
    const btns = q('.v3-btns'), media = q('.v3-hero-media'), inner = q('.v3-hero-in') || document.querySelector('.v3-hero-in');
    return {
      badge: px(q('.v3-eyebrow'), 'fontSize'), h1: px(q('.v3-h1'), 'fontSize'), lead: px(q('.v3-lead'), 'fontSize'), btn: px(q('.v3-btn'), 'fontSize'),
      media: !!media, mediaMarginTop: px(media, 'marginTop'), display: px(inner, 'display'), gridGap: px(inner, 'columnGap'),
      gap: btns && media ? Math.round(media.getBoundingClientRect().top - btns.getBoundingClientRect().bottom) : null,
      beside: btns && media ? media.getBoundingClientRect().left >= btns.getBoundingClientRect().right - 1 : null,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  await page.close();
  return m;
}

test('split Hero on phones: 20px between the buttons and the image; side by side from 768px unchanged', async () => {
  for (const w of [360, 390, 430, 767]) {
    const m = await heroAt('split', w);
    assert.equal(m.display, 'block', w + ': stacked');
    assert.equal(m.mediaMarginTop, '20px', w);
    assert.equal(m.gap, 20, w + 'px: buttons -> image');
    assert.equal(m.overflow, 0, w + ': no horizontal overflow');
  }
  for (const w of [768, 1280, 1440]) {
    const m = await heroAt('split', w);
    assert.equal(m.display, 'grid', w + ': side by side');
    assert.equal(m.gridGap, '40px', w + ': the grid gap is unchanged');
    assert.equal(m.mediaMarginTop, '0px', w + ': no extra margin on desktop');
    assert.equal(m.beside, true, w + ': the image beside the text');
  }
});

test('overlay and simple Heroes: no stacked image, nothing added', async () => {
  for (const v of ['overlay', 'simple']) for (const w of [390, 1280]) {
    const m = await heroAt(v, w);
    assert.equal(m.media, false, v + ' ' + w + ': no .v3-hero-media');
    assert.equal(m.overflow, 0);
  }
  const css = heroHtml('overlay');
  assert.equal(css.split('.v3-hero-media{margin-top').length, 3, 'the two new rules name only .v3-hero.v3-v-split .v3-hero-media');
  assert.ok(css.includes('.v3-hero.v3-v-split .v3-hero-media{margin-top:20px}') && css.includes('.v3-hero.v3-v-split .v3-hero-media{margin-top:0}'));
});

test('typography: the badge 12px; headline, description and buttons unchanged', async () => {
  for (const v of ['split', 'overlay', 'simple']) {
    const phone = await heroAt(v, 390), desk = await heroAt(v, 1280);
    assert.deepEqual([phone.badge, phone.h1, phone.lead, phone.btn], ['12px', '32px', '17px', '15px'], v + ' phone');
    assert.deepEqual([desk.badge, desk.h1, desk.lead, desk.btn], ['12px', '64px', '17px', '15px'], v + ' desktop');
  }
});

async function studio(width, height, device) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument(() => {
    if (window.top !== window) return;
    try { localStorage.setItem('qraivy_lang', 'de'); localStorage.removeItem('qraivy.studio.panels'); } catch (e) {}
    window.Clerk = { session: { id: 'sess_tok_anna', getToken: function () { return Promise.resolve('tok_anna'); } }, addListener: function () {} };
  });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (FONT_HOSTS.includes(u.host)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (/^https?:$/.test(u.protocol) && u.origin !== srv.origin) return r.abort();
    return r.continue();
  });
  await page.goto(srv.origin + '/studio.html?slug=anna-shop', { waitUntil: 'networkidle0' });
  await sleep(500);
  if (device) { await page.click('button[data-device="' + device + '"]'); await sleep(400); }
  const g = await page.evaluate(() => {
    const c = document.getElementById('st-canvas');
    const frames = [...c.querySelectorAll('.st-frame')].map((f) => ({ device: f.getAttribute('data-device'), scale: Number((/scale\(([0-9.]+)\)/.exec(f.firstChild.style.transform) || [])[1]) }));
    const insp = document.getElementById('st-right');
    const usable = () => { const b = insp.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(200, b.height / 2)); return b.width > 0 && b.left >= 0 && b.right <= innerWidth + 0.5 && !!hit && insp.contains(hit); };
    const before = usable();
    c.scrollTop = c.scrollHeight;
    const after = usable();
    const phone = c.querySelector('.st-frame--mobile iframe');
    const bottomVisible = phone ? phone.getBoundingClientRect().bottom <= c.getBoundingClientRect().bottom + 1 : null;
    c.scrollTop = 0;
    return { frames, scrolls: c.scrollHeight > c.clientHeight + 1, canvasH: c.scrollWidth - c.clientWidth, pageH: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageV: document.documentElement.scrollHeight - document.documentElement.clientHeight, inspector: before && after, bottomVisible };
  });
  await page.close();
  return g;
}

test('phone preview at 1920x1080, 1440x900, 1366x768, 1280x720: full size, the canvas scrolls, no overflow, inspector usable', async () => {
  for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768], [1280, 720]]) {
    const g = await studio(w, h, 'mobile');
    assert.deepEqual(g.frames.map((f) => f.device), ['mobile'], w + 'x' + h);
    assert.equal(g.frames[0].scale, 1, w + 'x' + h + ': the phone at full size (width-based)');
    assert.equal(g.scrolls, true, w + 'x' + h + ': the taller phone scrolls in the canvas');
    assert.equal(g.bottomVisible, true, w + 'x' + h + ': the bottom of the phone is reachable by scrolling');
    assert.deepEqual([g.canvasH, g.pageH, g.pageV], [0, 0, 0], w + 'x' + h + ': no horizontal overflow, the page itself does not scroll');
    assert.equal(g.inspector, true, w + 'x' + h + ': the inspector stays visible and usable, also with the canvas scrolled');
  }
});

test('side by side (1920x1080, 1680x1000): the phone at least 0.9, the desktop beside it; desktop-only preview unchanged', async () => {
  for (const [w, h] of [[1920, 1080], [1680, 1000]]) {
    const g = await studio(w, h);
    assert.deepEqual(g.frames.map((f) => f.device), ['desktop', 'mobile'], w + ': side by side');
    const phone = g.frames.find((f) => f.device === 'mobile');
    assert.ok(phone.scale >= 0.9 && phone.scale <= 1, w + ': phone scale ' + phone.scale);
    assert.deepEqual([g.canvasH, g.pageH], [0, 0], w + ': no horizontal overflow');
    assert.equal(g.inspector, true);
  }
  const d = await studio(1440, 900, 'desktop');
  assert.deepEqual(d.frames.map((f) => f.device), ['desktop']);
  assert.ok(d.frames[0].scale > 0 && d.frames[0].scale < 1, 'the desktop is scaled to the canvas width as before');
  assert.equal(d.scrolls, false, 'a single desktop frame still fills the canvas without scrolling');
});

(async () => {
  if (!puppeteer || !CHROME) { console.log('studioHeroMobile: SKIPPED (no puppeteer-core or Chrome)'); return; }
  srv = await S.start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  console.log('studioHeroMobile.browser');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  await browser.close();
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
