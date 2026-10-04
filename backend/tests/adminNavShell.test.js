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
  test(page + ': loads qraivy-lang.js before admin-shell.js', () => {
    const a = src.indexOf('src="js/qraivy-lang.js"'), b = src.indexOf('src="js/admin-shell.js"');
    assert.ok(a !== -1 && b !== -1 && a < b);
  });
}

test('canonical menu: groups, items and destinations', () => {
  const items = [...canonical.matchAll(/data-i18n="(nav_[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(items, ['nav_main', 'nav_dashboard', 'nav_analytics', 'nav_smartpages', 'nav_sqrpages', 'nav_createnew',
    'nav_engage', 'nav_campaigns', 'nav_customers', 'nav_loyalty', 'nav_configure', 'nav_wallet', 'nav_account', 'nav_billing', 'nav_settings', 'nav_signout']);
  const hrefs = [...canonical.matchAll(/<a href="([^"]*)" class="sb-item/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['dashboard.html', 'analytics.html', 'dashboard.html', 'dashboard.html?launch=onboarding',
    'dashboard.html?section=campaigns', 'dashboard.html?section=customers', 'dashboard.html?section=loyalty',
    'wallet-pass-studio.html', 'dashboard.html?section=billing', '#']);
  assert.ok(canonical.includes('id="sb-username"') && canonical.includes('id="lang-toggle"') && canonical.includes('id="sb-signout"'));
});

test('admin-shell.js: EN and DE cover the same keys, incl. every sidebar key', () => {
  const sandbox = { window: {}, document: { readyState: 'loading', addEventListener() {} } };
  vm.runInNewContext(read('js/admin-shell.js'), sandbox);
  const shell = sandbox.window.QraivyShell;
  const keys = [...canonical.matchAll(/data-i18n="([a-z_]+)"/g)].map((m) => m[1]);
  for (const lang of ['en', 'de']) {
    sandbox.window.QRAIVY_LANGUAGE = lang;
    for (const k of keys.concat(['lang_current', 'lang_switch', 'settings_soon'])) assert.ok(shell.t(k), lang + ' missing ' + k);
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
