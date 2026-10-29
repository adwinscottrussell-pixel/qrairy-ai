// ============================================================
// academyPage.test.js — QRAIVY Academy (frontend only)
//
// academy.html + js/academy-catalog.js + js/academy.js + academy.css:
// the tutorial catalog (stable ids, EN/DE, nothing published yet), the
// rendering (clear "Video coming soon" placeholders, a player only for a
// published tutorial with an https video in the viewer's language), the
// page's links, and that nothing outside the Academy and the shared sidebar
// changed. Same no-framework convention as the other backend tests.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'frontend', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');

// catalog + renderer in a sandbox (no DOM needed for the pure render functions)
function load() {
  const window = {};
  const sandbox = { window, localStorage: { setItem() {}, getItem() { return null; } } };
  vm.runInNewContext(read('js/academy-catalog.js'), sandbox);
  vm.runInNewContext(read('js/academy.js'), sandbox);
  // a plain copy: arrays made inside the sandbox are not deep-equal to this realm's
  return { catalog: clone(window.QRAIVY_ACADEMY), ac: window.QraivyAcademy };
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('catalog: the six initial categories, in order, in German and English', () => {
  const { catalog } = load();
  assert.deepEqual(catalog.categories.map((c) => c.title.de), ['Erste Schritte', 'Smart Landing Pages', 'Angebote', 'Benachrichtigungen', 'Apple & Google Wallet', 'Kunden']);
  assert.deepEqual(catalog.categories.map((c) => c.id), ['getting-started', 'smart-landing-pages', 'deals', 'notifications', 'wallet', 'customers']);
  for (const c of catalog.categories) assert.ok(c.title.en, c.id + ' en');
});

test('catalog: the six initial tutorials with stable ids and every future-video field', () => {
  const { catalog } = load();
  assert.deepEqual(catalog.tutorials.map((t) => t.title.de), ['Willkommen bei QRAIVY', 'Deine Smart Landing Page erstellen', 'Angebote erstellen und veröffentlichen',
    'Push-Nachrichten versenden', 'Apple & Google Wallet einrichten', 'Deine Kunden verstehen']);
  assert.deepEqual(catalog.tutorials.map((t) => t.id), ['welcome-to-qraivy', 'create-smart-landing-page', 'create-and-publish-deals',
    'send-push-notifications', 'set-up-apple-google-wallet', 'understand-your-customers']);
  const cats = catalog.categories.map((c) => c.id);
  for (const t of catalog.tutorials) {
    assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, t.id);
    assert.ok(cats.includes(t.category), t.id + ' category');
    for (const l of ['de', 'en']) { assert.ok(t.title[l] && t.description[l], t.id + ' ' + l); }
    assert.deepEqual(t.languages, ['de', 'en']);
    assert.deepEqual(t.video, { de: null, en: null }, t.id + ': no video yet');
    assert.deepEqual(t.thumbnail, { de: null, en: null });
    assert.equal(t.duration, null);
    assert.equal(t.status, 'coming_soon', t.id + ': nothing is published');
  }
  assert.equal(new Set(catalog.tutorials.map((t) => t.id)).size, 6, 'unique ids');
  assert.deepEqual(catalog.tutorials.filter((t) => t.featured).map((t) => t.id), ['welcome-to-qraivy']);
  // every category has one tutorial
  assert.deepEqual(cats.map((c) => catalog.tutorials.filter((t) => t.category === c).length), [1, 1, 1, 1, 1, 1]);
});

test('rendering: clearly marked placeholders, nothing playable or clickable, in German and English', () => {
  const { catalog, ac } = load();
  for (const [lang, soon] of [['de', 'Video kommt bald'], ['en', 'Video coming soon']]) {
    const featured = ac.featuredHtml(catalog, lang);
    const cards = ac.cardsHtml(catalog, lang, 'all');
    assert.equal(cards.count, 6);
    assert.equal((cards.html.match(/<article class="ac-card"/g) || []).length, 6);
    assert.equal((cards.html.match(new RegExp(soon, 'g')) || []).length, 6, lang + ': every card says ' + soon);
    assert.ok(featured.includes(soon) && featured.includes('ac-media--big'));
    for (const html of [featured, cards.html]) {
      assert.ok(!/<video|<iframe|<a\s|href=|onclick|role="button"|tabindex/.test(html), lang + ': nothing to play or click');
    }
  }
  assert.ok(ac.featuredHtml(catalog, 'de').includes('Willkommen bei QRAIVY'));
  assert.ok(ac.featuredHtml(catalog, 'en').includes('Welcome to QRAIVY'));
});

test('rendering: category filters (All + six), one category shows its tutorial', () => {
  const { catalog, ac } = load();
  const f = ac.filtersHtml(catalog, 'de', 'all');
  assert.deepEqual([...f.matchAll(/data-filter="([a-z-]+)"/g)].map((m) => m[1]), ['all', 'getting-started', 'smart-landing-pages', 'deals', 'notifications', 'wallet', 'customers']);
  assert.ok(f.includes('>Alle<') && f.includes('>Kunden<'));
  assert.equal((f.match(/aria-pressed="true"/g) || []).length, 1);
  assert.ok(ac.filtersHtml(catalog, 'en', 'all').includes('>All<'));
  const wallet = ac.cardsHtml(catalog, 'de', 'wallet');
  assert.equal(wallet.count, 1);
  assert.ok(wallet.html.includes('Apple &amp; Google Wallet einrichten'));
  const none = ac.cardsHtml(catalog, 'en', 'missing-category');
  assert.equal(none.count, 0);
  assert.ok(none.html.includes('No tutorials in this category yet.'));
});

test('future videos: only a published tutorial with an https video in the viewer\'s language gets a player', () => {
  const { catalog, ac } = load();
  const t = clone(catalog.tutorials[1]);
  assert.equal(ac.playableUrl(t, 'de'), null, 'coming soon');
  t.status = 'published';
  assert.equal(ac.playableUrl(t, 'de'), null, 'published without a video');
  for (const bad of ['http://cdn.example.com/a.mp4', 'javascript:alert(1)', '//cdn.example.com/a.mp4', 'https://', '']) {
    t.video.de = bad; assert.equal(ac.playableUrl(t, 'de'), null, bad);
  }
  t.video.de = 'https://cdn.example.com/academy/de/create-smart-landing-page.mp4';
  assert.equal(ac.playableUrl(t, 'de'), t.video.de);
  assert.equal(ac.playableUrl(t, 'en'), null, 'no English video yet');
  const c = clone(catalog); c.tutorials[1] = t;
  const de = ac.cardsHtml(c, 'de', 'all').html;
  assert.equal((de.match(/<video class="ac-video" controls/g) || []).length, 1);
  assert.equal((de.match(/Video kommt bald/g) || []).length, 5);
  assert.ok(!/<video/.test(ac.cardsHtml(c, 'en', 'all').html), 'the English viewer still sees the placeholder');
  // catalog text is escaped
  c.tutorials[1].title.de = '<img src=x onerror=alert(1)>';
  assert.ok(!ac.cardsHtml(c, 'de', 'all').html.includes('<img'));
});

test('texts: EN and DE cover the same keys; the approved German headings', () => {
  const { ac } = load();
  assert.deepEqual(Object.keys(ac.T.en).sort(), Object.keys(ac.T.de).sort());
  assert.equal(ac.text('de', 'ac_sub'), 'Video Hilfe & Anleitungen');
  assert.equal(ac.text('de', 'ac_welcome_title'), 'Lerne QRAIVY kennen.');
  assert.equal(ac.text('de', 'ac_soon'), 'Video kommt bald');
  assert.equal(ac.text('fr', 'ac_soon'), 'Video coming soon', 'unknown language falls back to English');
  const page = read('academy.html');
  for (const k of [...page.matchAll(/data-ac="([a-z_]+)"/g)].map((m) => m[1])) assert.ok(ac.T.en[k] && ac.T.de[k], k);
});

test('page: header, welcome, featured 16:9 area, filters, cards and help section, in that order', () => {
  const page = read('academy.html');
  const order = ['<h1 class="ac-title"><span class="ac-title__brand">QRAIVY</span> Academy</h1>', 'data-ac="ac_sub"', 'class="ac-welcome"', 'id="ac-featured"', 'id="ac-filters"', 'id="ac-grid"', 'class="ac-help"']
    .map((x) => page.indexOf(x));
  assert.ok(order.every((n, i) => n !== -1 && (i === 0 || n > order[i - 1])), JSON.stringify(order));
  const css = read('academy.css');
  assert.ok(css.includes('aspect-ratio: 16 / 9;'));
  // the dashboard's black/gray theme (sidebar palette of dashboard-shell.css), not a separate blue one
  for (const v of ['--ac-bg: #101012;', '--ac-surface: #171719;', '--ac-surface-2: #1d1d20;', '--ac-text: #FFFFFF;', '--ac-text-2: #A1A1AA;', '--ac-muted: #71717A;', '--ac-orange: #FF5B2A;', '--ac-green: #22C55E;']) assert.ok(css.includes(v), v);
  const shell = read('dashboard-shell.css');
  for (const v of ['--sbx-bg: #101012;', '--sbx-tab: #171719;', '--sbx-tab-hover: #1d1d20;', '--sbx-text-2: #A1A1AA;', '--sbx-orange: #FF5B2A;']) assert.ok(shell.includes(v), 'same value as the sidebar: ' + v);
  assert.ok(!/#0B1428|#111D36|#16243F|#22314F|#142241|#0A1222|#33476E|navy/i.test(css), 'no navy-blue values left');
  for (const [r, g, b] of [...css.matchAll(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\b/gi)].map((m) => m.slice(1).map((h) => parseInt(h, 16)))) {
    assert.ok(!(b > r + 12 && b > g + 6), 'blue-tinted colour #' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join(''));
  }
  assert.ok(/@media \(max-width: 768px\)/.test(css), 'phone layout');
  const scripts = [...page.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/qraivy-lang.js', 'js/admin-shell.js', 'js/academy-catalog.js', 'js/academy.js']);
  assert.ok(page.includes("if (!window.Clerk.user) { window.location.href = 'login.html'; return; }"), 'signed-in owners only');
  assert.ok(page.includes('onload="initAcademy()"'));
});

test('page: no playable or fake video, no broken links, no video service', () => {
  const page = read('academy.html');
  assert.ok(!/<video|<iframe|youtube|vimeo|synthesia|heygen|wistia/i.test(page), 'static page has no video and no video service');
  for (const f of ['js/academy.js', 'js/academy-catalog.js', 'academy.css']) assert.ok(!/synthesia|heygen|youtube|vimeo|wistia/i.test(read(f)), f);
  const hrefs = [...page.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  for (const h of hrefs) {
    if (/^https:\/\/fonts\.googleapis\.com/.test(h) || h === 'mailto:support@qraivy.com') continue;
    if (h === '#') { continue; }
    const file = h.split(/[?#]/)[0];
    assert.ok(fs.existsSync(path.join(PUB, file)), 'link target exists: ' + h);
  }
  assert.deepEqual(hrefs.filter((h) => h === '#'), ['#'], 'only the shared sidebar Sign Out uses href="#" (handled in script)');
  assert.ok(page.includes('href="support.html"') && read('support.html').includes('support@qraivy.com'));
});

test('scope: only the Academy files, the shared sidebar entry and its label changed', () => {
  const changed = execFileSync('git', ['diff', '12df76d', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    .concat(execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)).sort();
  const PAGES = ['analytics.html', 'dashboard.html', 'deals.html', 'designer-saved.html', 'loyalty-setup.html', 'smart-qr-detail.html', 'wallet-pass-studio.html'];
  // tests: this file, the nav test, and four older "frontend unchanged" guards narrowed via helpers/academyFiles.js
  const allowed = ['backend/tests/academyPage.test.js', 'backend/tests/adminNavShell.test.js', 'backend/tests/helpers/academyFiles.js',
    'backend/tests/lpDeleteAuth.test.js', 'backend/tests/pushPageSubscriptions.test.js', 'backend/tests/slugReservation.test.js', 'backend/tests/lpStagingFrontend.test.js', 'frontend/public/academy.css', 'frontend/public/academy.html',
    'frontend/public/js/academy-catalog.js', 'frontend/public/js/academy.js', 'frontend/public/js/admin-shell.js'].concat(PAGES.map((p) => 'frontend/public/' + p));
  // Phase 0 security release (tests/helpers/phase0Files.js) came after the Academy.
  const { PHASE0_FILES } = require('./helpers/phase0Files');
  // Landing Page Studio V3 Phase 1 (tests/helpers/lpV3Files.js) came after Phase 0.
  const { LPV3_FILES, indexOnlyStudioMount } = require('./helpers/lpV3Files');
  // and Studio V3 Phase A: index.js differs from 12df76d by exactly the Studio pages mount
  const indexOk = indexOnlyStudioMount(ROOT, '12df76d');
  for (const f of changed) assert.ok(allowed.includes(f) || PHASE0_FILES.includes(f) || LPV3_FILES.includes(f) || (f === 'backend/src/index.js' && indexOk), 'unexpected change: ' + f);
  // each Admin page gained exactly the one sidebar line (smart-qr-detail.html: after undoing
  // exactly the Phase 0 edit, tests/helpers/phase0Revert.js)
  const { revertSqd0 } = require('./helpers/phase0Revert');
  for (const p of PAGES) {
    if (p === 'smart-qr-detail.html') {
      const before = execFileSync('git', ['show', '12df76d:frontend/public/' + p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).replace(/\r\n/g, '\n').split('\n');
      const now = revertSqd0(read(p)).split('\n');
      const added = now.filter((l) => l.includes('<a href="academy.html" class="sb-item'));
      assert.equal(added.length, 1, p);
      assert.deepEqual(now.filter((l) => !l.includes('<a href="academy.html" class="sb-item')), before, p + ': only the sidebar line besides Phase 0');
      continue;
    }
    const d = execFileSync('git', ['diff', '12df76d', '--numstat', '--', 'frontend/public/' + p], { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.equal(d.split('\t').slice(0, 2).join(' '), '1 0', p + ': ' + d);
    assert.ok(read(p).includes('<a href="academy.html" class="sb-item'), p);
  }
  const shell = execFileSync('git', ['diff', '12df76d', '--numstat', '--', 'frontend/public/js/admin-shell.js'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(shell.split('\t').slice(0, 2).join(' '), '2 2', 'admin-shell.js: only the two label lines');
});

(async () => {
  let passed = 0, failed = 0;
  console.log('academyPage');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
