// ============================================================
// studioHoursEditor.browser.test.js — Landing Page Studio V3, Phase 2A-3E:
// editing the Opening Hours section in a real browser (LOCAL ONLY: needs
// Chrome and puppeteer-core; prints SKIP and passes when they are missing).
//
// frontend/public is served on 127.0.0.1. Checked: selection; Content /
// Style / Settings, with no Layout and no Alignment; title and note; the
// seven day rows with Open / Closed / Not shown; time ranges (add, remove,
// at most 3); time validation (format, closing after opening) with the last
// valid preview; errors of a Closed day's kept times; background and
// spacing; readable Closed rows and note on all four backgrounds, desktop
// and mobile (the Dark / Brand renderer fix); link name, Show on page,
// Section ID; Undo / Redo; German; the empty section; escaping; Light /
// Dark; Tablet / Mobile and both frames at 1920; phones preview only; no
// network; Save Draft / Publish disabled; the other types read-only.
// Run: node tests/studioHoursEditor.browser.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) { console.log('SKIP  studioHoursEditor.browser.test.js: Chrome or puppeteer-core not available (local-only test)'); process.exit(0); }

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(PUB, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, base;
const H = 's_hours01';
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

async function open(width, height, { theme = 'light', lang = 'en' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((t, l) => { try { localStorage.setItem('qraivy.studio.theme', t); localStorage.setItem('qraivy_lang', l); localStorage.removeItem('qraivy.studio.panels'); localStorage.setItem('qraivy.studio.templates', 'collapsed'); } catch (e) {} }, theme, lang);
  const net = [], errors = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) net.push(u.host); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(base + '/studio.html', { waitUntil: 'networkidle0' });
  // Phase C.1: the preview starts phone-first; these checks use the desktop frame (picked as an owner would, then loaded)
  if (await page.evaluate(() => { const b = document.querySelector('button[data-device="desktop"]'); if (!b || !b.offsetParent || b.getAttribute('aria-checked') === 'true') return false; b.click(); return true; })) {
    const h = await page.$('#st-canvas iframe[data-device="desktop"]'); const f = h && await h.contentFrame();
    if (f) await f.waitForSelector('[data-v3-id]', { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  return { page, net, errors };
}
// open the Studio with the Opening Hours section selected
async function openHours(width = 1440, height = 900, opts) {
  const o = await open(width, height, opts);
  if (width >= 1200) { await o.page.click('#st-tab-sections'); await o.page.click('#st-outline [data-id="' + H + '"]'); }
  return o;
}
const srcdoc = (page, device = null) => page.$eval('#st-canvas iframe' + (device ? '[data-device="' + device + '"]' : ''), (f) => f.srcdoc);
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(50); }
}
async function frame(page, device = 'desktop') { return (await page.$('#st-canvas iframe[data-device="' + device + '"]')).contentFrame(); }
async function clickInPreview(page, selector, device = 'desktop') {
  const fr = await frame(page, device);
  const r = await fr.$eval(selector, (n) => { scrollTo({ top: Math.max(0, n.getBoundingClientRect().top + scrollY - 100), behavior: 'instant' }); const b = n.getBoundingClientRect(); return { x: b.left + Math.min(40, b.width / 2), y: b.top + Math.min(20, b.height / 2) }; });
  const f = await page.$eval('#st-canvas iframe[data-device="' + device + '"]', (n) => { const b = n.getBoundingClientRect(); return { left: b.left, top: b.top, scale: b.width / n.offsetWidth }; });
  await sleep(150);
  await page.mouse.click(f.left + r.x * f.scale, f.top + r.y * f.scale);
}
async function typeInto(page, sel, text) {
  await page.click(sel);
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  if (text === '') await page.keyboard.press('Backspace'); else await page.keyboard.type(text);
}
async function keys(page, mods, key) { for (const m of mods) await page.keyboard.down(m); await page.keyboard.press(key); for (const m of mods.slice().reverse()) await page.keyboard.up(m); }
const fp = (p, tag = 'input') => '#st-fields [data-path="' + p + '"] ' + tag;
const day = (d) => '#st-fields .st-day[data-day="' + d + '"]';
const status = (d) => day(d) + ' select';
const tab = (page, name) => page.click('[data-insp="' + name + '"]');
const stale = (page) => page.$eval('#st-stale', (n) => !n.hidden);
// the time field of day index i, range j ('open' / 'close'), and its error lines
const time = (i, j, f) => fp('data.days[' + i + '].ranges[' + j + '].' + f);
const timeError = (page, i, j, f, which = 0) => page.$eval(time(i, j, f), (n, w) => { const e = document.getElementById(n.getAttribute('aria-describedby').split(' ')[w]); return e.hidden ? '' : e.textContent; }, which);
const errorOf = (page, p) => page.$eval('#st-fields [data-path="' + p + '"] .st-err', (n) => (n.hidden ? '' : n.textContent));
// the Opening Hours section of the preview
const section = async (page, device) => { const h = await srcdoc(page, device); const i = h.indexOf('data-v3-id="' + H + '"'); return i < 0 ? '' : h.slice(h.lastIndexOf('<section', i), h.indexOf('</section>', i)); };
const row = (name, hours, closed) => '<tr' + (closed ? ' class="v3-closed"' : '') + '><th scope="row">' + name + '</th><td>' + hours + '</td></tr>';
const sectionHas = (page, s, device) => until(async () => (await section(page, device)).includes(s), 'section shows ' + s);
const sectionLacks = (page, s) => until(async () => !(await section(page)).includes(s), 'section no longer shows ' + s);
const draft = (page) => page.evaluate((id) => JSON.parse(JSON.stringify(window.QraivyStudio.editor.section(id).data)), H);
const states = (page) => page.$$eval('#st-fields .st-day', (n) => n.map((x) => x.getAttribute('data-day') + ':' + x.querySelector('select').value));
const idx = async (page, d) => (await draft(page)).days.findIndex((x) => x.day === d);
function onlyLocal(net) { return [...new Set(net)].filter((h) => h !== new URL(base).host && !FONT_HOSTS.includes(h)); }

test('selection from the Sections list and the preview; Content / Style / Settings; seven day rows; no Layout, no Alignment', async () => {
  const { page, errors } = await open(1440, 900);
  await clickInPreview(page, '[data-v3-id="' + H + '"] .v3-h2');
  await until(async () => (await page.$eval('#st-kind', (n) => n.textContent)) === 'Opening Hours', 'selected from the preview');
  assert.equal(await page.$eval('#st-outline [aria-current="true"]', (n) => n.getAttribute('data-id')), H);
  assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true');
  const paths = () => page.$$eval('#st-fields > [data-path]', (n) => n.map((x) => x.getAttribute('data-path')));
  assert.deepEqual(await paths(), ['data.title', 'data.days', 'data.note']);
  assert.deepEqual(await page.$$eval('#st-fields .st-day .st-day__name', (n) => n.map((x) => x.textContent)), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  assert.deepEqual(await states(page), ['mon:open', 'tue:open', 'wed:open', 'thu:open', 'fri:open', 'sat:open', 'sun:closed']);
  assert.deepEqual(await page.$$eval(status('mon') + ' option', (n) => n.map((x) => x.value + ':' + x.text)), ['open:Open', 'closed:Closed', 'hidden:Not shown']);
  assert.deepEqual(await page.$$eval(day('mon') + ' .st-time', (n) => n.map((x) => x.value)), ['06:30', '18:00']);
  assert.deepEqual(await page.$$eval(day('sat') + ' .st-time', (n) => n.map((x) => x.value)), ['07:00', '13:00']);
  assert.equal(await page.$$eval(day('sun') + ' .st-time', (n) => n.length), 0, 'a Closed day shows no times');
  assert.match(await page.$eval('#st-fields .st-days .st-hint', (n) => n.textContent), /HH:MM/);
  await tab(page, 'style');
  assert.deepEqual(await paths(), ['style.background', 'style.spacing'], 'no Layout and no Alignment');
  await tab(page, 'settings');
  assert.deepEqual(await paths(), ['anchor', 'hidden', 'id']);
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), H);
  assert.deepEqual(errors, []);
  await page.close();
});

test('title and note (multi-line) reach the preview, with counters and limits', async () => {
  const { page } = await openHours();
  await typeInto(page, fp('data.title'), 'Wann wir da sind');
  await sectionHas(page, '<h2 class="v3-h2">Wann wir da sind</h2>');
  assert.equal(await page.$eval('#st-fields [data-path="data.title"] .st-count', (n) => n.textContent), '16 / 80');
  await page.click(fp('data.note', 'textarea'));
  await page.keyboard.type('An Feiertagen geschlossen.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Betriebsferien im August.');
  await sectionHas(page, '<p class="v3-note">An Feiertagen geschlossen.<br>Betriebsferien im August.</p>');
  await typeInto(page, fp('data.note', 'textarea'), 'x'.repeat(301));
  await until(async () => (await errorOf(page, 'data.note')) === 'Too long: at most 300 characters.', 'note too long');
  assert.equal(await stale(page), true);
  await page.close();
});

test('status: Closed keeps the times (Open brings them back); Not shown removes the day; Closed brings it back; one Undo step each', async () => {
  const { page } = await openHours();
  await page.select(status('mon'), 'closed');
  await sectionHas(page, row('Montag', 'Geschlossen', true));
  assert.equal(await page.$$eval(day('mon') + ' .st-time', (n) => n.length), 0);
  assert.equal(await page.evaluate(() => document.activeElement.closest('.st-day') && document.activeElement.closest('.st-day').getAttribute('data-day')), 'mon', 'focus stays on the day');
  const mon = await idx(page, 'mon');
  assert.deepEqual((await draft(page)).days[mon], { day: 'mon', ranges: [{ open: '06:30', close: '18:00' }], closed: true }, 'the times are kept');
  await page.select(status('mon'), 'open');
  await sectionHas(page, row('Montag', '06:30–18:00'));
  assert.deepEqual(await page.$$eval(day('mon') + ' .st-time', (n) => n.map((x) => x.value)), ['06:30', '18:00'], 'times back');
  await page.select(status('sat'), 'hidden');
  await sectionLacks(page, 'Samstag');
  assert.equal(await idx(page, 'sat'), -1, 'not in the list');
  assert.equal(await page.$eval(day('sat'), (n) => n.getAttribute('data-state')), 'hidden');
  await page.select(status('sat'), 'closed');
  await sectionHas(page, row('Samstag', 'Geschlossen', true));
  await page.click('#st-undo-btn');
  await sectionLacks(page, 'Samstag');
  await page.click('#st-undo-btn');
  await sectionHas(page, row('Samstag', '07:00–13:00'));
  assert.deepEqual(await states(page), ['mon:open', 'tue:open', 'wed:open', 'thu:open', 'fri:open', 'sat:open', 'sun:closed']);
  await page.close();
});

test('opening a Closed day: an empty time range waits for its times (inline errors, last valid preview); typing them shows it', async () => {
  const { page } = await openHours();
  await page.select(status('sun'), 'open');
  const sun = await idx(page, 'sun');
  await until(async () => (await timeError(page, sun, 0, 'open')) === 'Enter a time.', 'opens: required');
  assert.equal(await timeError(page, sun, 0, 'close'), 'Enter a time.');
  assert.equal(await stale(page), true);
  await sleep(250);
  assert.ok((await section(page)).includes(row('Sonntag', 'Geschlossen', true)), 'the preview keeps the last valid version');
  await typeInto(page, time(sun, 0, 'open'), '10:00');
  await typeInto(page, time(sun, 0, 'close'), '14:00');
  await sectionHas(page, row('Sonntag', '10:00–14:00'));
  assert.equal(await stale(page), false);
  assert.equal(await page.$eval(day('sun') + ' [data-action="remove-range"]', (n) => n.disabled), true, 'the only range cannot be removed (use Closed)');
  await page.close();
});

test('time ranges: add up to 3, remove, the preview joins them', async () => {
  const { page } = await openHours();
  const mon = await idx(page, 'mon');
  await page.click(day('mon') + ' [data-action="add-range"]');
  await until(async () => (await page.$$eval(day('mon') + ' .st-range', (n) => n.length)) === 2, 'two ranges');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-path]').getAttribute('data-path')), 'data.days[' + mon + '].ranges[1].open', 'focus on the new opening time');
  await page.keyboard.type('19:00');
  await typeInto(page, time(mon, 1, 'close'), '22:00');
  await sectionHas(page, row('Montag', '06:30–18:00, 19:00–22:00'));
  await page.click(day('mon') + ' [data-action="add-range"]');
  await until(async () => (await page.$$eval(day('mon') + ' .st-range', (n) => n.length)) === 3, 'three ranges');
  assert.equal(await page.$eval(day('mon') + ' [data-action="add-range"]', (n) => n.disabled + '|' + n.title), 'true|Up to 3 time ranges per day.');
  await (await page.$$(day('mon') + ' [data-action="remove-range"]'))[2].click(); // the third, still empty
  await until(async () => (await page.$$eval(day('mon') + ' .st-range', (n) => n.length)) === 2, 'back to two');
  assert.deepEqual(await page.$$eval(day('mon') + ' .st-time', (n) => n.map((x) => x.value)), ['06:30', '18:00', '19:00', '22:00']);
  const removes = await page.$$(day('mon') + ' [data-action="remove-range"]');
  await removes[0].click();
  await sectionHas(page, row('Montag', '19:00–22:00'));
  await page.click('#st-undo-btn');
  await sectionHas(page, row('Montag', '06:30–18:00, 19:00–22:00'));
  await page.close();
});

test('time validation: format, closing after opening, 24:00; the last valid preview; a Closed day reports errors in its kept times', async () => {
  const { page } = await openHours();
  const tue = await idx(page, 'tue');
  await typeInto(page, time(tue, 0, 'open'), '8.30');
  await until(async () => (await timeError(page, tue, 0, 'open')) === 'Use a time like 08:30 (00:00 to 24:00).', 'format');
  assert.equal(await stale(page), true);
  await sleep(250);
  assert.ok((await section(page)).includes(row('Dienstag', '06:30–18:00')), 'last valid hours');
  await typeInto(page, time(tue, 0, 'open'), '19:00');
  await until(async () => (await timeError(page, tue, 0, 'close', 1)) === 'The closing time must be after the opening time.', 'closes before opening');
  await typeInto(page, time(tue, 0, 'close'), '24:00');
  await sectionHas(page, row('Dienstag', '19:00–24:00'));
  assert.equal(await stale(page), false);
  // a Closed day keeps its times; if they are invalid the row says so
  await typeInto(page, time(tue, 0, 'open'), '25:00');
  await until(async () => (await timeError(page, tue, 0, 'open')) !== '', 'invalid again');
  await page.select(status('tue'), 'closed');
  await until(async () => (await page.$eval(day('tue') + ' .st-err', (n) => (n.hidden ? '' : n.textContent))) === '1 error', 'Closed row shows the hidden error');
  assert.equal(await stale(page), true);
  await page.close();
});

test('Style: background and spacing', async () => {
  const { page } = await openHours();
  await tab(page, 'style');
  assert.equal(await page.$eval(fp('style.background', 'select'), (n) => n.value), 'alt', 'the demo uses Alternate');
  for (const [bg, sp] of [['default', 'compact'], ['dark', 'roomy'], ['brand', 'normal'], ['alt', 'normal']]) {
    await page.select(fp('style.background', 'select'), bg);
    await page.select(fp('style.spacing', 'select'), sp);
    await until(async () => (await srcdoc(page)).includes('class="v3-s v3-openingHours v3-v-table v3-bg-' + bg + ' v3-al-left v3-sp-' + sp), bg + ' ' + sp);
  }
  await page.close();
});

// The Dark / Brand renderer fix: Closed rows and the note were muted grey on
// a dark or orange section. Computed colours, desktop and mobile.
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
const lumOf = (c) => { const v = c.slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const blend = (fg, bg, alpha) => fg.slice(0, 3).map((v, k) => v * alpha + bg[k] * (1 - alpha));
test('readable on Default, Alternate, Dark and Brand, desktop and mobile: day names, hours, Closed rows, the note', async () => {
  const { page } = await openHours();
  await typeInto(page, fp('data.note', 'textarea'), 'An Feiertagen geschlossen.');
  await page.evaluate(() => document.activeElement.blur());
  await tab(page, 'style');
  for (const dev of ['desktop', 'mobile']) {
    if (dev === 'mobile') await page.click('button[data-device="mobile"]');
    for (const bg of ['default', 'alt', 'dark', 'brand']) {
      await page.select(fp('style.background', 'select'), bg);
      const fr = await until(async () => { const f = await frame(page, dev); return (await f.$('[data-v3-id="' + H + '"].v3-bg-' + bg + ' .v3-note').catch(() => null)) ? f : null; }, dev + ' ' + bg);
      const c = await fr.$eval('[data-v3-id="' + H + '"]', (n) => {
        const cs = (q) => getComputedStyle(n.querySelector(q));
        let bgc = getComputedStyle(n).backgroundColor;
        if (/rgba\(0, 0, 0, 0\)/.test(bgc)) bgc = getComputedStyle(document.body).backgroundColor;
        return { bg: bgc, th: cs('.v3-hours th').color, td: cs('.v3-hours tr:not(.v3-closed) td').color, closed: cs('.v3-closed td').color, closedOp: cs('.v3-closed td').opacity, note: cs('.v3-note').color, noteOp: cs('.v3-note').opacity };
      });
      const B = rgb(c.bg), min = bg === 'brand' ? 3 : 4.5;
      for (const [what, col, op] of [['day name', c.th, '1'], ['hours', c.td, '1'], ['Closed row', c.closed, c.closedOp], ['note', c.note, c.noteOp]]) {
        const eff = blend(rgb(col), B, Number(op));
        assert.ok(ratio(eff, B) >= min, dev + ' ' + bg + ' ' + what + ': ' + col + ' (opacity ' + op + ') on ' + c.bg + ' = ' + ratio(eff, B).toFixed(2) + ':1');
      }
      if (bg === 'default' || bg === 'alt') assert.equal(c.closed, 'rgb(85, 85, 85)', dev + ' ' + bg + ': Closed rows keep the muted grey');
      if (bg === 'dark') assert.deepEqual([c.closed, c.closedOp], ['rgb(255, 255, 255)', '0.85']);
      if (bg === 'brand') assert.deepEqual([c.closed, c.closedOp], ['rgb(255, 255, 255)', '1']);
    }
  }
  await page.close();
});

test('Settings: link name (links follow it), Show on page, read-only Section ID', async () => {
  const { page } = await openHours();
  await tab(page, 'settings');
  await typeInto(page, fp('anchor'), 'zeiten');
  await page.keyboard.press('Enter');
  await until(async () => (await srcdoc(page)).includes('id="zeiten"'), 'renamed');
  await page.click(fp('hidden'));
  await until(async () => !(await srcdoc(page)).includes('data-v3-id="' + H + '"'), 'hidden');
  assert.equal(await page.$eval('#st-outline [data-id="' + H + '"]', (n) => n.classList.contains('is-hidden')), true);
  await page.click(fp('hidden'));
  await until(async () => (await srcdoc(page)).includes('data-v3-id="' + H + '"'), 'shown');
  assert.equal(await page.$eval(fp('id'), (n) => n.readOnly && n.value), H);
  await page.close();
});

test('Undo / Redo across Opening Hours edits, buttons and keyboard; typing a time is one step', async () => {
  const { page } = await openHours();
  const wed = await idx(page, 'wed');
  await typeInto(page, time(wed, 0, 'close'), '19:30');
  await page.evaluate(() => document.activeElement.blur());
  await sectionHas(page, row('Mittwoch', '06:30–19:30'));
  await page.select(status('thu'), 'closed');
  await sectionHas(page, row('Donnerstag', 'Geschlossen', true));
  await page.evaluate(() => document.activeElement.blur());
  await keys(page, ['Control'], 'z');
  await sectionHas(page, row('Donnerstag', '06:30–18:00'));
  await keys(page, ['Control'], 'z');
  await sectionHas(page, row('Mittwoch', '06:30–18:00'));
  await keys(page, ['Control', 'Shift'], 'z');
  await sectionHas(page, row('Mittwoch', '06:30–19:30'));
  await page.click('#st-redo-btn');
  await sectionHas(page, row('Donnerstag', 'Geschlossen', true));
  assert.equal(await page.$eval('#st-redo-btn', (n) => n.disabled), true);
  await page.close();
});

test('German: day names, status, buttons, hint and errors', async () => {
  const { page, errors } = await openHours(1440, 900, { lang: 'de' });
  assert.deepEqual(await page.$$eval('#st-fields .st-day .st-day__name', (n) => n.map((x) => x.textContent)), ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']);
  assert.deepEqual(await page.$$eval(status('mon') + ' option', (n) => n.map((x) => x.text)), ['Geöffnet', 'Geschlossen', 'Nicht anzeigen']);
  assert.equal(await page.$eval(day('mon') + ' [data-action="add-range"]', (n) => n.textContent), 'Zeitraum hinzufügen');
  assert.equal(await page.$eval('#st-fields .st-days .st-group', (n) => n.textContent), 'Tage');
  const mon = await idx(page, 'mon');
  await typeInto(page, time(mon, 0, 'open'), '6');
  await until(async () => (await timeError(page, mon, 0, 'open')) === 'Nutze eine Uhrzeit wie 08:30 (00:00 bis 24:00).', 'format');
  await typeInto(page, time(mon, 0, 'open'), '20:00');
  await until(async () => (await timeError(page, mon, 0, 'close', 1)) === 'Die Schließzeit muss nach der Öffnungszeit liegen.', 'range');
  assert.deepEqual(errors, []);
  await page.close();
});

test('an empty section: no days and no note -> the empty-section note (the title is not shown)', async () => {
  const { page } = await openHours();
  for (const d of DAYS) await page.select(status(d), 'hidden');
  await until(async () => /v3-ph-section/.test(await section(page)), 'empty note');
  assert.ok(!(await section(page)).includes('<h2'), 'no title');
  assert.equal(await stale(page), false);
  await page.select(status('fri'), 'closed');
  await sectionHas(page, row('Freitag', 'Geschlossen', true));
  await page.close();
});

test('hostile text stays text: escaped in the preview, nothing injected, no dialogs', async () => {
  const { page, errors } = await openHours();
  await typeInto(page, fp('data.title'), '<img src=x onerror=alert(1)>');
  await typeInto(page, fp('data.note', 'textarea'), '"><svg onload=alert(2)>');
  const mon = await idx(page, 'mon');
  await typeInto(page, time(mon, 0, 'open'), '<b>');
  await sectionHas(page, '&lt;img src=x onerror=alert(1)&gt;');
  await sectionHas(page, '&quot;&gt;&lt;svg onload=alert(2)&gt;');
  await until(async () => (await timeError(page, mon, 0, 'open')) !== '', 'refused time');
  await sleep(400);
  const fr = await frame(page);
  assert.deepEqual(await fr.evaluate(() => ({ imgs: document.querySelectorAll('main img:not(.v3-gal-item img)').length, hero: [...document.querySelectorAll('main img:not(.v3-gal-item img)')].map((i) => i.className + (/^data:image\/(jpeg;base64,|svg\+xml,)/.test(i.getAttribute('src')) ? ' (demo photo)' : ' (OTHER SOURCE)')).join(), handlers: [...document.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length, svg: document.querySelectorAll('svg[onload]').length, scripts: document.scripts.length })), { imgs: 1, hero: 'v3-hero-img (demo photo)', handlers: 0, svg: 0, scripts: 1 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('Light and Dark: the day rows use the Studio tokens; no overflow', async () => {
  for (const theme of ['light', 'dark']) {
    const { page, errors, net } = await openHours(1440, 900, { theme });
    const s = await page.evaluate(() => {
      const f = document.getElementById('st-fields');
      const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
      const over = [...f.querySelectorAll('.st-day, .st-range')].filter((n) => n.scrollWidth > n.clientWidth + 1).length;
      return { row: css('#st-fields .st-day', 'backgroundColor'), input: css('#st-fields .st-time', 'backgroundColor'), select: css('#st-fields .st-day select', 'backgroundColor'),
        over, panel: f.scrollWidth - f.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const bg = theme === 'dark' ? 'rgb(23, 23, 25)' : 'rgb(255, 255, 255)';
    assert.deepEqual([s.row, s.input, s.select], [bg, bg, bg], theme);
    assert.deepEqual([s.over, s.panel, s.page], [0, 0, 0], theme + ': no overflow');
    assert.deepEqual(errors, []);
    assert.deepEqual(onlyLocal(net), []);
    await page.close();
  }
});

test('devices: Tablet and Mobile show the edit; both frames update side by side at 1920', async () => {
  const { page } = await openHours();
  await typeInto(page, fp('data.title'), 'Überall');
  for (const d of ['tablet', 'mobile', 'desktop']) {
    await page.click('button[data-device="' + d + '"]');
    await sectionHas(page, '<h2 class="v3-h2">Überall</h2>', d);
  }
  await page.close();
  const wide = await openHours(1920, 1080);
  assert.deepEqual(await wide.page.$$eval('#st-canvas iframe', (n) => n.map((f) => f.getAttribute('data-device'))), ['desktop', 'mobile']);
  await wide.page.select(status('fri'), 'closed');
  await sectionHas(wide.page, row('Freitag', 'Geschlossen', true), 'desktop');
  await sectionHas(wide.page, row('Freitag', 'Geschlossen', true), 'mobile');
  await wide.page.close();
});

test('phones: preview only; a click on the Opening Hours section edits nothing', async () => {
  const { page, errors } = await open(390, 844);
  assert.equal(await page.$eval('#st-right', (n) => getComputedStyle(n).display), 'none');
  await clickInPreview(page, '[data-v3-id="' + H + '"] .v3-h2', 'mobile');
  await sleep(300);
  assert.equal(await page.$eval('#st-kind', (n) => n.textContent), 'Hero', 'selection unchanged');
  assert.equal(await page.$eval('#st-undo-btn', (n) => n.disabled), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('after editing: no network beyond this server and Google Fonts; Save Draft and Publish disabled; only Hero, Buttons, Social Media, Contact and Opening Hours editable', async () => {
  const { page, net, errors } = await openHours();
  await page.select(status('sun'), 'hidden');
  await page.select(status('mon'), 'closed');
  await sleep(400);
  assert.deepEqual(onlyLocal(net), []);
  assert.deepEqual(await page.$$eval('#st-save-btn, #st-publish-btn', (n) => n.map((b) => b.disabled)), [true, true]);
  for (const id of ['s_hero01', 's_quick01', 's_social01', 's_contact1', H, 's_prod01']) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'true', id + ' editable');
  }
  // (Deals / Offers is editable since D2: studioDealsPreview.browser.test.js)
  for (const id of ['s_loyal01']) {
    await page.click('#st-outline [data-id="' + id + '"]');
    assert.equal(await page.$eval('#st-fields', (n) => n.getAttribute('data-editable')), 'false', id);
    for (const t of ['content', 'style', 'settings']) {
      await tab(page, t);
      const c = await page.$$eval('#st-fields input, #st-fields textarea, #st-fields select, #st-fields button', (n) => n.map((x) => x.disabled));
      assert.ok(c.length && c.every(Boolean), id + ' ' + t + ': read-only');
    }
    await tab(page, 'content');
  }
  assert.deepEqual(errors, []);
  await page.close();
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  await browser.close(); server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
