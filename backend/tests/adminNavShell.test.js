// ============================================================
// adminNavShell.test.js — canonical logged-in Admin shell (frontend)
//
// Static checks on frontend/public: every Admin page carries the same
// sidebar block as dashboard.html (only the active item differs), loads
// js/qraivy-lang.js + js/admin-shell.js, and no Admin upgrade action points
// at the legacy upgrade.html / pricing.html pages.
//
// Same no-framework convention as the other backend tests.
//
// Run: node tests/adminNavShell.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

function sidebar(src) {
  const s = src.indexOf('<div id="sidebar">');
  const e = src.indexOf('\n</div>', s);
  assert.ok(s !== -1 && e !== -1, 'sidebar block not found');
  return src.slice(s, e + 7);
}
const ACTIVE = {
  'dashboard.html': 'href="dashboard.html"',
  'analytics.html': 'href="analytics.html"',
  'wallet-pass-studio.html': 'id="sb-wallet"',
  'loyalty-setup.html': 'id="sb-loyalty"',
  'designer-saved.html': null,
  'smart-qr-detail.html': 'id="sb-smart-pages"',
  'academy.html': 'id="sb-academy"',
};
const canonical = sidebar(read('dashboard.html')).replace(/class="sb-item active"/g, 'class="sb-item"');

console.log('adminNavShell');

for (const [page, active] of Object.entries(ACTIVE)) {
  const src = read(page);
  const block = sidebar(src);
  test(page + ': sidebar identical to the canonical dashboard block', () => {
    assert.equal(block.replace(/class="sb-item active"/g, 'class="sb-item"'), canonical);
  });
  test(page + ': active item', () => {
    const m = block.match(/<a [^>]*class="sb-item active"[^>]*>/g) || [];
    if (!active) assert.equal(m.length, 0);
    else { assert.equal(m.length, 1); assert.ok(m[0].includes(active), m[0]); }
  });
  if (page !== 'designer-saved.html') test(page + ': mobile menu button follows the sidebar', () => {
    assert.ok(src.slice(src.indexOf(block) + block.length).trimStart().startsWith('<button id="mob-btn">'));
  });
  test(page + ': loads qraivy-lang.js before admin-shell.js', () => {
    const a = src.indexOf('src="js/qraivy-lang.js"'), b = src.indexOf('src="js/admin-shell.js"');
    assert.ok(a !== -1 && b !== -1 && a < b);
  });
}

test('canonical menu: six tabs, their items and destinations', () => {
  const items = [...canonical.matchAll(/data-i18n="(nav_[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(items, ['nav_main', 'nav_dashboard', 'nav_analytics', 'nav_academy', 'nav_smartpages', 'nav_sqrpages', 'nav_createnew',
    'nav_dealspromo', 'nav_deals',
    'nav_engage', 'nav_campaigns', 'nav_customers', 'nav_loyalty', 'nav_configure', 'nav_wallet', 'nav_account', 'nav_billing', 'nav_settings', 'nav_signout']);
  const tabs = [...canonical.matchAll(/<div class="sb-tab" data-tab="([a-z]+)">/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ['main', 'smartpages', 'deals', 'engage', 'configure', 'account']);
  const hrefs = [...canonical.matchAll(/<a href="([^"]*)" class="sb-item/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['dashboard.html', 'analytics.html', 'academy.html', 'dashboard.html?section=sqr', 'dashboard.html?launch=onboarding',
    'deals.html',
    'dashboard.html?section=campaigns', 'dashboard.html?section=customers', 'dashboard.html?section=loyalty',
    'wallet-pass-studio.html', 'dashboard.html?section=billing', 'dashboard.html?section=settings']);
  // every item sits inside its tab's submenu
  for (const name of tabs) {
    const t = canonical.slice(canonical.indexOf('data-tab="' + name + '"'));
    const btn = t.match(/<button type="button" class="sb-tab-btn" aria-expanded="false" aria-controls="sb-sub-([a-z]+)">/);
    assert.ok(btn && btn[1] === name, name + ': tab button controls its submenu');
    assert.ok(t.includes('<div class="sb-sub" id="sb-sub-' + name + '">'), name + ': submenu');
  }
  // the ids the pages' own scripts use are all still there, once
  for (const id of ['sb-smart-pages', 'sqr-count-badge', 'sb-create-sqr', 'sb-campaigns', 'sb-customers', 'sb-loyalty', 'sb-wallet', 'sb-billing', 'sb-settings', 'sb-toggle', 'sb-deals', 'sb-academy']) {
    assert.equal((canonical.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  }
  assert.ok(canonical.includes('id="sb-username"') && canonical.includes('id="lang-toggle"') && canonical.includes('id="sb-signout"'));
  assert.ok(canonical.includes('data-i18n="role_owner">Business Owner<'), 'Business Owner footer');
});

test('canonical menu: Deals & Promotions for every owner, with its orange icon; access stays with the Deals page', () => {
  const deals = canonical.slice(canonical.indexOf('data-tab="deals"'), canonical.indexOf('data-tab="engage"'));
  assert.ok(deals.includes('class="sb-tab-icon sb-tab-icon--deals"'));
  assert.equal((canonical.match(/sb-tab-icon--deals/g) || []).length, 1, 'only the Deals icon is orange');
  assert.ok(/#sidebar \.sb-tab-icon--deals \{ stroke: var\(--sbx-orange\); \}/.test(read('dashboard-shell.css')));
  // no plan or pilot check in the menu: deals.html asks GET /deals/access itself
  assert.ok(!/data-plan|\shidden[\s>=]|display:none|dealAccess|deals\/access/.test(deals));
  assert.ok(!/deals\/access|dealAccess|DEALS_/.test(read('js/admin-shell.js')));
});

test('header: the QRAIVY app icon and an upright QR/AIVY wordmark; icons and PWA files untouched', () => {
  assert.ok(canonical.includes('<div class="sb-logo-icon" aria-hidden="true">Q</div>'));
  assert.ok(canonical.includes('<div class="sb-logo-text"><span class="sb-wm-qr">QR</span><span class="sb-wm-aivy">AIVY</span></div>'));
  for (const f of ['dashboard-shell.css', 'sidebar.css']) {
    const css = read(f);
    assert.ok(css.includes("#sidebar .sb-logo-icon::after { content: ''; position: absolute; inset: 0; background: url('apple-touch-icon.png')"), f + ': app icon');
    assert.ok(/#sidebar \.sb-wm-qr \{ color: var\(--sbx-orange\); \}/.test(css) && /--sbx-orange: #FF5B2A;/.test(css), f + ': QR orange');
    assert.ok(/#sidebar \.sb-wm-aivy \{ color: #fff; \}/.test(css), f + ': AIVY white');
    assert.ok(/#sidebar \.sb-logo-text \{[^}]*font-style: normal;/.test(css), f + ': upright');
  }
  assert.ok(!/\.sb-logo-text span \{[^}]*italic/.test(read('dashboard-shell.css')), 'no italic wordmark left');
  assert.ok(/--dashboard-accent: #ff5a1f;/.test(read('dashboard-shell.css')), 'the site accent is unchanged');
  const changed = require('child_process').execFileSync('git', ['diff', '4679924', '--name-only', '--', 'frontend/public/favicon.ico', 'frontend/public/favicon.png',
    'frontend/public/favicon-16x16.png', 'frontend/public/favicon-32x32.png', 'frontend/public/apple-touch-icon.png', 'frontend/public/manifest.json', 'frontend/public/sw.js'],
  { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  assert.equal(changed, '');
});

test('the six-tab styles are one block, the same in dashboard-shell.css and sidebar.css (designer-saved)', () => {
  const block = (f) => { const s = read(f); const a = s.indexOf('/* ── Admin sidebar: six tabs'); const b = s.indexOf('/* ── end of the six-tab block'); assert.ok(a !== -1 && b > a, f); return s.slice(a, b); };
  assert.equal(block('sidebar.css'), block('dashboard-shell.css'));
  assert.ok(read('designer-saved.html').includes('href="sidebar.css'));
});

test('admin-shell.js: EN and DE cover the same keys, incl. every sidebar key', () => {
  const sandbox = { window: {}, document: { readyState: 'loading', addEventListener() {} } };
  vm.runInNewContext(read('js/admin-shell.js'), sandbox);
  const shell = sandbox.window.QraivyShell;
  const keys = [...canonical.matchAll(/data-i18n="([a-z_]+)"/g)].map((m) => m[1]);
  for (const lang of ['en', 'de']) {
    sandbox.window.QRAIVY_LANGUAGE = lang;
    for (const k of keys.concat(['lang_current', 'lang_switch'])) assert.ok(shell.t(k), lang + ' missing ' + k);
  }
  sandbox.window.QRAIVY_LANGUAGE = 'de';
  assert.equal(shell.t('nav_loyalty'), 'Treue');
  assert.equal(shell.t('lang_current'), 'Deutsch');
  sandbox.window.QRAIVY_LANGUAGE = 'en';
  assert.equal(shell.t('lang_current'), 'English');
});

test('dashboard Loyalty strings exist in EN and DE', () => {
  const src = read('dashboard.html');
  for (const k of ['loy_not_setup', 'loy_not_configured', 'loy_empty', 'loy_setup_cta', 'loy_reward_after', 'loy_stamps_n', 'loy_progress', 'loy_pin_label', 'loy_set_pin', 'loy_saved']) {
    assert.equal((src.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k);
  }
  assert.ok(!/"Loyalty not configured"|>not set up</.test(src), 'hard-coded English Loyalty state remains');
});

test('Settings: every label is a shell key defined in EN and DE; Sign Out reuses the sidebar', () => {
  const src = read('dashboard.html');
  const sec = src.slice(src.indexOf('<div id="section-settings"'), src.indexOf('<!-- Bottom Nav'));
  const shellSrc = read('js/admin-shell.js');
  const keys = [...new Set([...sec.matchAll(/data-i18n="([a-z_]+)"/g)].map((m) => m[1]))];
  assert.ok(keys.includes('settings_sub') && keys.includes('settings_prefs'));
  for (const k of keys) assert.equal((shellSrc.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k);
  assert.ok(sec.includes('id="mob-lang-label"') && sec.includes('id="mob-lang-btn"'));
  assert.ok(!/handleSignOut/.test(src), 'undefined handleSignOut() still referenced');
});

test('mobile shell: no floating + button, no iOS zoom fields, page locked under the drawer', () => {
  for (const page of Object.keys(ACTIVE)) assert.ok(!/id="fab-main"/.test(read(page)), page + ' still renders the floating + button');
  const css = read('dashboard-shell.css');
  const mob = css.slice(css.indexOf('#sidebar.mob-open ~ #mob-btn'));
  assert.ok(/@media \(max-width: 768px\) and \(pointer: coarse\) \{\s*input, select, textarea \{ font-size: 16px !important; \}/.test(css), 'mobile fields must be 16px (iOS zoom)');
  assert.ok(/html, body \{ overflow-x: hidden; \}/.test(mob));
  assert.ok(/MutationObserver\(sync\)/.test(read('js/admin-shell.js')), 'drawer scroll lock missing');
  assert.ok(/\.cust-drawer \{ visibility: hidden;/.test(read('dashboard.html')), 'closed Customers drawer must be hidden on mobile');
});

const SHELL_PAGES_WITH_OWN_CODE = ['dashboard.html', 'analytics.html', 'wallet-pass-studio.html', 'loyalty-setup.html', 'designer-saved.html'];

test('smart-qr-detail.html: uses the shared shell, no second navigation and no copied sidebar code', () => {
  const src = read('smart-qr-detail.html');
  assert.ok(!/data-shell=|data-active-nav=/.test(src), 'the unused customer-shell attributes are gone');
  assert.ok(!/shell-customer\.js|shell-admin\.js|src="sidebar\.js"|sidebar\.css/.test(src), 'no second navigation system');
  assert.ok(src.indexOf('src="js/admin-shell.js"') < src.indexOf('<body'), 'the shell is loaded in <head>');
  assert.equal((src.match(/QraivyShell\.bindSidebar\(\)/g) || []).length, 1, 'bound once');
  const after = src.slice(src.indexOf('<button id="mob-btn">'));
  assert.ok(after.startsWith('<button id="mob-btn">&#x2630;</button>\n<div class="sb-overlay" id="sb-overlay"></div>\n<script>if (window.QraivyShell && window.QraivyShell.bindSidebar) window.QraivyShell.bindSidebar();</script>\n'), 'bound right after the markup, before the first paint');
  const order = ['<div id="main-content">', 'id="sqd-topbar"', 'id="sqd-manage-panel"', 'id="sqd-editor-layout-wrap"'].map((x) => after.indexOf(x));
  assert.ok(order.every((n, i) => n !== -1 && (i === 0 || n > order[i - 1])), 'top bar, QR workspace and editor sit in the content area');
  assert.ok(!/getElementById\('sb-toggle'\)|getElementById\('sb-signout'\)|'sb-collapsed'/.test(src), 'no copy of the collapse / account / sign-out code');
  assert.ok(src.includes('    if (window.QraivyShell) window.QraivyShell.apply(lang);\n  }\n\n  window.toggleLang'), 'the page language switch hands sidebar labels to the shell');
  assert.equal((src.match(/<div id="cs-toast"/g) || []).length, 1, 'the page keeps its own single toast');
  assert.ok(!SHELL_PAGES_WITH_OWN_CODE.some((p) => read(p).includes('bindSidebar')), 'pages with their own sidebar code do not also call bindSidebar (that would toggle twice)');
});

test('smart-qr-detail.html: the top bar follows the sidebar; one Dashboard link per width', () => {
  const src = read('smart-qr-detail.html');
  const at = src.indexOf('<style id="sqd-admin-shell">');
  const css = src.slice(at, src.indexOf('</style>', at));
  assert.ok(css.includes('#sqd-topbar { left: var(--sidebar-width) !important; transition: left .22s; }'));
  assert.ok(css.includes('body.sb-collapsed #sqd-topbar { left: var(--sidebar-collapsed-width) !important; }'));
  assert.ok(/#sqd-topbar > div:first-child > a\[href="dashboard\.html"\],\n#sqd-topbar > div:first-child > a\[href="dashboard\.html"\] \+ div \{ display: none !important; \}/.test(css), 'the sidebar carries the Dashboard link on desktop');
  const phone = css.slice(css.indexOf('@media (max-width: 768px)'));
  assert.ok(phone.includes('#sqd-topbar, body.sb-collapsed #sqd-topbar { left: 0 !important; padding-left: 64px !important; }'), 'full width on phones, room for the menu button');
  assert.ok(phone.includes('#sqd-topbar > div:first-child > a[href="dashboard.html"] { display: flex !important; }'), 'on phones the top bar keeps its Dashboard link');
  assert.ok(phone.includes('#main-content { padding-top: 0 !important; padding-bottom: 0 !important; }'), 'the page has its own top bar and no bottom nav');
  assert.ok(phone.includes('#mob-btn { top: 5px; z-index: 220; }'), 'the menu button sits in the top bar, above it');
  // The page lifts the sidebar above its top bar on desktop only. On phones the shared
  // stylesheet's stacking must win -- drawer above its dimming overlay -- or every tap on a
  // drawer link lands on the overlay and only closes the drawer.
  assert.ok(css.includes('@media (min-width: 769px) { #sidebar { z-index: 210; } }'), 'desktop-only sidebar lift');
  const sidebarZ = css.match(/#sidebar \{ z-index: \d+; \}/g) || [];
  assert.equal(sidebarZ.length, 1, 'the sidebar stacking rule exists once, inside the desktop media query');
  assert.ok(!phone.includes('#sidebar'), 'the phone rules leave the drawer to dashboard-shell.css');
  const shellCss = read('dashboard-shell.css');
  const num = (re) => Number((re.exec(shellCss) || [])[1]);
  const drawerZ = num(/#sidebar \{ z-index: (\d+); \}/), overlayZ = num(/\.sb-overlay \{ z-index: (\d+); \}/);
  assert.ok(drawerZ > overlayZ, 'shared phone rules: drawer (' + drawerZ + ') above its overlay (' + overlayZ + ')');
  assert.ok(overlayZ > 220 && 220 > 200, 'overlay above the menu button (220), which is above the top bar (200)');
  // the top-bar link this hides is the page's only plain "dashboard.html" link in the bar
  const bar = src.slice(src.indexOf('<div id="sqd-topbar"'), src.indexOf('<!-- MANAGE OVERVIEW PANEL -->'));
  assert.equal((bar.match(/href="dashboard\.html"/g) || []).length, 1);
});

test('smart-qr-detail.html: every QR and editor control is still there, once', () => {
  const src = read('smart-qr-detail.html');
  for (const id of ['ov-qr-canvas', 'ov-qr-canvas-wrap', 'ov-qr-fg', 'ov-qr-fg-hex', 'ov-qr-bg', 'ov-qr-bg-hex', 'ov-qr-size-btns', 'ov-qr-preset-btns', 'ov-qr-margin', 'ov-qr-margin-val', 'ov-qr-download', 'ov-qr-view-live',
    'sqd-ov-delete-btn', 'sqd-ov-scans', 'sqd-ov-subs', 'sqd-ov-cvr', 'sqd-ov-url', 'sqd-ov-name', 'ov-tab-qr', 'ov-tab-lp', 'ov-tab-analytics', 'ov-panel-qr', 'ov-panel-lp', 'ov-panel-analytics',
    'sqd-iframe', 'sqd-publish-btn-2', 'sqd-view-btn', 'sqd-download-btn', 'sqd-qr-img', 'sqd-tabs', 'sqd-tab-content', 'sqd-save-global-status']) {
    assert.equal((src.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  }
});

// js/admin-shell.js bindSidebar(), run against a stand-in page.
function shellEnv({ width = 1440, stored = null, clerk } = {}) {
  const store = new Map(); if (stored !== null) store.set('sb-collapsed', stored);
  const classes = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); return on; } }; };
  const el = (id) => ({ id, attrs: {}, classList: classes(), listeners: {}, textContent: '', style: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, click() { (this.listeners.click || []).forEach((f) => f({ preventDefault() {} })); } });
  const ids = {}; for (const id of ['sidebar', 'sb-toggle', 'sb-signout', 'sb-username', 'sb-avatar', 'mob-btn', 'sb-overlay']) ids[id] = el(id);
  const env = { width, store, ids, queries: [], location: { href: 'https://www.qraivy.com/smart-qr-detail.html' } };
  const mm = (q) => { const o = { media: q, listeners: [], get matches() { return env.width <= Number(/max-width: (\d+)px/.exec(q)[1]); }, addEventListener(t, f) { o.listeners.push(f); } }; env.queries.push(o); return o; };
  const body = { classList: classes(), style: {} };
  const window = { matchMedia: mm, location: env.location, Clerk: clerk, QRAIVY_LANGUAGE: 'en' };
  const document = { readyState: 'complete', body, documentElement: {}, getElementById: (id) => ids[id] || null, querySelectorAll: () => [], addEventListener() {} };
  vm.runInNewContext(read('js/admin-shell.js'), { window, document, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, Promise, setTimeout: (f) => f() });
  return Object.assign(env, { shell: window.QraivyShell, body, collapsed: () => [ids.sidebar.classList.contains('collapsed'), body.classList.contains('sb-collapsed')], resize(w) { env.width = w; env.queries.forEach((q) => q.listeners.forEach((f) => f())); } });
}

test('admin-shell.js bindSidebar: starts collapsed in narrower windows only when the owner has not chosen', () => {
  const at = (width, stored) => { const e = shellEnv({ width, stored }); e.shell.bindSidebar(); return e.collapsed(); };
  assert.deepEqual(at(1440, null), [false, false], 'wide: expanded');
  assert.deepEqual(at(1100, null), [false, false], 'from 1100 px: expanded');
  assert.deepEqual(at(1099, null), [true, true], 'below 1100 px: collapsed');
  assert.deepEqual(at(820, null), [true, true]);
  assert.deepEqual(at(1024, 'false'), [false, false], 'an owner who expanded it keeps it expanded');
  assert.deepEqual(at(1440, 'true'), [true, true], 'an owner who collapsed it keeps it collapsed');
  for (const stored of [null, 'true', 'false']) assert.deepEqual(at(390, stored), [false, false], 'the phone drawer always opens full width (' + stored + ')');
});

test('admin-shell.js bindSidebar: follows the window while nothing is chosen; the toggle choice is remembered', () => {
  const e = shellEnv({ width: 1440 });
  assert.equal(e.shell.bindSidebar(), true);
  e.resize(1024); assert.deepEqual(e.collapsed(), [true, true]);
  e.resize(1440); assert.deepEqual(e.collapsed(), [false, false]);
  e.ids['sb-toggle'].click(); assert.deepEqual([e.collapsed(), e.store.get('sb-collapsed')], [[true, true], 'true']);
  e.resize(1600); assert.deepEqual(e.collapsed(), [true, true], 'the choice wins over the window');
  e.resize(390); assert.deepEqual(e.collapsed(), [false, false], 'phone: drawer full width');
  e.resize(1600); assert.deepEqual(e.collapsed(), [true, true], 'back to the choice');
  e.ids['sb-toggle'].click(); assert.deepEqual([e.collapsed(), e.store.get('sb-collapsed')], [[false, false], 'false']);
  assert.equal(e.shell.bindSidebar(), false, 'a second call does nothing');
  assert.equal(e.ids['sb-toggle'].listeners.click.length, 1, 'one toggle handler');
  assert.equal(e.ids['sb-signout'].listeners.click.length, 1, 'one sign-out handler');
});

test('admin-shell.js bindSidebar: account name and sign-out', () => { (async () => {
  let signedOut = 0;
  const e = shellEnv({ clerk: { load: () => Promise.resolve(), user: { firstName: 'Ada', primaryEmailAddress: { emailAddress: 'ada@example.com' } }, signOut: () => { signedOut += 1; return Promise.resolve(); } } });
  e.shell.bindSidebar();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([e.ids['sb-username'].textContent, e.ids['sb-avatar'].textContent], ['Ada', 'A']);
  e.ids['sb-signout'].click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([signedOut, e.location.href], [1, 'login.html']);
  // no first name: the email address, as on the dashboard
  const f = shellEnv({ clerk: { load: () => Promise.resolve(), user: { emailAddresses: [{ emailAddress: 'bo@example.com' }] } } });
  f.shell.bindSidebar(); await new Promise((r) => setImmediate(r));
  assert.deepEqual([f.ids['sb-username'].textContent, f.ids['sb-avatar'].textContent], ['bo@example.com', 'B']);
  // without Clerk, sign-out still leaves the page
  const g = shellEnv({}); g.shell.bindSidebar(); g.ids['sb-signout'].click();
  assert.equal(g.location.href, 'login.html');
  })().catch((err) => { console.error('  FAIL admin-shell.js bindSidebar: account name and sign-out\n       ' + err.message); process.exitCode = 1; });
});

// js/admin-shell.js bindTabs(), run against stand-in tabs.
function tabsEnv({ width = 1440, collapsed = false, active = 'deals' } = {}) {
  const classes = (init) => { const s = new Set(init || []); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); return on; } }; };
  const attrs = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; } });
  const tabs = {};
  for (const name of ['main', 'smartpages', 'deals', 'engage', 'configure', 'account']) {
    const item = { classList: classes(name === active ? ['sb-item', 'active'] : ['sb-item']) };
    const btn = Object.assign(attrs(), { listeners: [], addEventListener(t, f) { this.listeners.push(f); }, click() { this.listeners.forEach((f) => f({})); } });
    tabs[name] = { name, item, btn, classList: classes(['sb-tab']), querySelector: (sel) => (sel === '.sb-tab-btn' ? btn : sel === '.sb-item.active' ? (item.classList.contains('active') ? item : null) : null) };
  }
  let toggles = 0;
  const sidebar = Object.assign(attrs(), { classList: classes(collapsed ? ['collapsed'] : []), querySelectorAll: (sel) => (sel === '.sb-tab' ? Object.values(tabs) : []) });
  const toggle = { click() { toggles += 1; sidebar.classList.toggle('collapsed'); } };
  const ids = { sidebar, 'sb-toggle': toggle };
  const window = { matchMedia: (q) => ({ matches: width <= Number(/max-width: (\d+)px/.exec(q)[1]), addEventListener() {} }), QRAIVY_LANGUAGE: 'en' };
  const document = { readyState: 'loading', body: { classList: classes(), style: {} }, documentElement: {}, getElementById: (id) => ids[id] || null, querySelectorAll: () => [], addEventListener() {} };
  vm.runInNewContext(read('js/admin-shell.js'), { window, document, localStorage: { getItem: () => null, setItem() {} } });
  const open = () => Object.values(tabs).filter((t) => t.btn.getAttribute('aria-expanded') === 'true').map((t) => t.name);
  return { shell: window.QraivyShell, tabs, sidebar, open, toggles: () => toggles };
}

test('admin-shell.js bindTabs: all tabs closed except the one holding the current page; clicking opens and closes', () => {
  const e = tabsEnv({ active: 'deals' });           // bound at load: the sidebar is already in the page
  assert.equal(e.sidebar.getAttribute('data-tabs-bound'), '1');
  assert.deepEqual(e.open(), ['deals']);
  assert.ok(e.tabs.deals.classList.contains('current') && !e.tabs.main.classList.contains('current'));
  e.tabs.engage.btn.click(); assert.deepEqual(e.open(), ['deals', 'engage'], 'a click opens a tab');
  e.tabs.engage.btn.click(); assert.deepEqual(e.open(), ['deals'], 'a second click closes it');
  e.tabs.deals.btn.click(); assert.deepEqual(e.open(), [], 'the current tab can be closed too');
  e.tabs.deals.btn.click(); assert.deepEqual(e.open(), ['deals']);
  assert.equal(e.shell.bindTabs(), false, 'a second call does nothing');
  assert.equal(e.tabs.main.btn.listeners.length, 1, 'one handler per tab');
  const none = tabsEnv({ active: null });             // designer-saved: no current page in the menu
  assert.deepEqual(none.open(), []);
});

test('admin-shell.js bindTabs: when the page marks another item active, its tab opens (dashboard sections)', () => {
  const e = tabsEnv({ active: 'main' });
  e.tabs.main.item.classList.remove('active'); e.tabs.engage.item.classList.add('active');
  e.tabs.configure.btn.click();                       // any sync; in browsers a MutationObserver does this at once
  assert.deepEqual(e.open(), ['engage', 'configure']);
  assert.ok(e.tabs.engage.classList.contains('current') && !e.tabs.main.classList.contains('current'));
  assert.ok(/new MutationObserver\(function \(records\)[\s\S]*?attributeFilter: \['class'\], subtree: true/.test(read('js/admin-shell.js')));
});

test('admin-shell.js bindTabs: on the narrow rail a tab opens the sidebar through its own toggle; the phone drawer never collapses', () => {
  const e = tabsEnv({ collapsed: true, active: 'main' });
  e.tabs.engage.btn.click();
  assert.equal(e.toggles(), 1, 'the page\'s own toggle (keeps its remembered state)');
  assert.ok(!e.sidebar.classList.contains('collapsed'));
  assert.deepEqual(e.open(), ['main', 'engage'], 'and the clicked tab is open');
  const p = tabsEnv({ width: 390, collapsed: true, active: 'main' });
  p.tabs.engage.btn.click(); assert.equal(p.toggles(), 0);
  assert.deepEqual(p.open(), ['main', 'engage']);
});

test('the collapse toggle is bound exactly once on every Admin page (analytics bound it twice: a click did nothing)', () => {
  for (const page of Object.keys(ACTIVE).concat('deals.html')) {
    const src = read(page);
    const own = (src.match(/getElementById\(['"]sb-toggle['"]\)/g) || []).length;
    const shell = (src.match(/QraivyShell\.bindSidebar\(\)/g) || []).length;
    assert.equal(own + shell, 1, page + ': ' + own + ' own binding(s), ' + shell + ' shell binding(s)');
  }
});

test('sidebar palette: the approved QRAIVY black-and-orange values, in both stylesheets', () => {
  for (const f of ['dashboard-shell.css', 'sidebar.css']) {
    const css = read(f);
    for (const v of ['--sbx-orange: #FF5B2A;', '--sbx-bg: #101012;', '--sbx-tab: #171719;', '--sbx-selected: #101012;', '--sbx-text: #FFFFFF;', '--sbx-text-2: #A1A1AA;', '--sbx-muted: #71717A;']) assert.ok(css.includes(v), f + ': ' + v);
    assert.ok(css.includes('#sidebar .sb-sub { display: none; padding: 0 6px 6px; background: var(--sbx-bg);'), f + ': submenu background');
    assert.ok(/#sidebar \.sb-sub \.sb-item \{[^}]*color: var\(--sbx-text-2\)/.test(css), f + ': secondary item text');
    assert.ok(css.includes('#sidebar .sb-tab:has(.sb-item.active) { border-color: var(--sbx-orange); }'), f + ': current tab outline in QRAIVY orange');
    const block = css.slice(css.indexOf('/* ── Admin sidebar: six tabs'), css.indexOf('/* ── end of the six-tab block'));
    assert.ok(!/rgba\(255,\s*91,\s*42/.test(block), f + ': no translucent (brown-looking) orange left');
  }
});

test('selected item: near-black background with an orange accent, no orange fill', () => {
  for (const f of ['dashboard-shell.css', 'sidebar.css']) {
    const css = read(f);
    assert.ok(/--sbx-selected: #101012;/.test(css), f);
    const rule = css.match(/#sidebar \.sb-sub \.sb-item\.active \{[^}]*\}/)[0];
    assert.ok(rule.includes('background: var(--sbx-selected)') && rule.includes('color: #fff') && rule.includes('inset 3px 0 0 var(--sbx-orange)'), f + ': ' + rule);
    assert.ok(!/rgba\(255,\s*91,\s*42,\s*0\.1\d\)/.test(css.slice(css.indexOf('/* ── Admin sidebar: six tabs'))), f + ': no orange-tinted fill left');
  }
});

test('the tab holding the current page is open on first paint, before any script (:has), and closed tabs hide their items', () => {
  const css = read('dashboard-shell.css');
  assert.ok(css.includes('#sidebar .sb-sub { display: none; padding: 0 6px 6px; background: var(--sbx-bg); border-radius: 0 0 11px 11px; }'));
  assert.ok(css.includes('#sidebar .sb-tab:has(.sb-item.active):not(.shut) > .sb-sub { display: block; }'));
  assert.ok(css.includes('#sidebar.collapsed .sb-sub { display: none !important; }'));
  assert.ok(/#sidebar \.sb-sub \.sb-item\.active \{[^}]*var\(--sbx-orange\)/.test(css), 'orange active highlight');
});

test('analytics: chart cards can shrink with the grid column (Chart.js fixed canvas width)', () => {
  const css = read('analytics-page.css');
  assert.ok(/\.qds-grid--split > \* \{ min-width: 0; \}/.test(css));
  assert.ok(/\.chart-wrap canvas \{ max-width: 100%; \}/.test(css));
});

test('no Admin upgrade action points at upgrade.html / pricing.html', () => {
  const files = ['dashboard.html', 'analytics.html', 'wallet-pass-studio.html', 'loyalty-setup.html', 'designer-saved.html',
    'smart-qr-detail.html', 'qr-free-dashboard.html', 'onboarding.js', 'js/shell-customer.js', 'js/billing.js', 'js/home-pricing.js'];
  for (const f of files) {
    assert.ok(!/(href=|location\.href\s*=\s*|href:\s*)["']\/?(upgrade|pricing)\.html/.test(read(f)), f);
  }
  assert.ok(!/href: 'pricing\.html'/.test(read('sidebar.js')), 'sidebar.js Billing link');
  assert.ok(read('js/session.js').includes("upgrade:'/dashboard.html?section=billing'"), 'session.js ROUTES.app.upgrade');
});

console.log(passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
