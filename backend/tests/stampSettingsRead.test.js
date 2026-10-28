// ============================================================
// stampSettingsRead.test.js — Security fix S1: GET /lp/stamp/settings/:slug.
//
// Before: public (no sign-in), and every read created (if needed) and
// returned the day's stamp code plus its stamp URL. That code stamps AND
// redeems, so anyone who knew a page's slug could stamp and redeem rewards.
// Now: the page's signed-in owner only (same rule as the POST writer), the
// response carries no code or code-bearing URL, and a read writes nothing.
// The owner's Loyalty tab (smart-qr-detail.html) keeps working: it already
// sends its sign-in, reads only settings / counts, and takes the NFC URL from
// the owner-only /lp/nfc-token.
//
// Run: node tests/stampSettingsRead.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const h = require('./helpers/phase0Harness');
const { requireAuth } = require(h.resolve('src', 'middleware', 'auth.js'));
const lpRoutes = require(h.resolve('src', 'routes', 'lpRoutes.js'));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

function setup() {
  h.reset();
  h.page('shop', { userId: 'user_owner' });
  h.page('platform-shop', { userId: null });
  h.T('stampSettings').push({ id: 'ss-1', slug: 'shop', goal: 3, rewardName: 'Free Coffee', enabled: true, color: '#ff5a1f' });
  h.T('stampToken').push({ id: 'st-1', slug: 'shop', token: TOKEN, expiresAt: new Date(Date.now() + 3600e3), createdAt: new Date() });
  h.T('pass').push({ id: 'p-1', serialNumber: 'sqr-shop', stampCount: 2, rewardReady: false });
  h.T('stampEntry').push({ id: 'e-1', slug: 'shop', passId: 'p-1' }, { id: 'e-2', slug: 'shop', passId: 'p-1' });
}
async function read(slug, userId) {
  const r = h.res();
  await h.quiet(() => h.lp.handleGetStampSettings(h.req({ params: { slug }, userId }), r));
  return r;
}
const rows = () => Object.fromEntries(Object.entries(h.db.tables).map(([k, v]) => [k, v.length]));
function noSecret(body) {
  const s = JSON.stringify(body);
  assert.ok(!s.includes(TOKEN), 'no stamp code');
  assert.ok(!/\/(stamp|redeem)\//.test(s), 'no stamp or redeem URL');
  for (const k of ['token', 'stampUrl', 'redeemUrl', 'nfcUrl', 'nfcToken']) assert.equal(k in body, false, k);
}

test('the route runs requireAuth before the handler', () => {
  const layer = lpRoutes.stack.find((l) => l.route && l.route.path === '/lp/stamp/settings/:slug' && l.route.methods.get);
  assert.ok(layer, 'route registered');
  const handlers = layer.route.stack.map((s) => s.handle);
  assert.equal(handlers[0], requireAuth, 'requireAuth first');
  assert.equal(handlers[handlers.length - 1], h.lp.handleGetStampSettings);
});

test('signed out: requireAuth answers 401 before the handler; the handler also refuses (401), nothing read or written', async () => {
  setup();
  const r = h.res();
  let reached = false;
  await h.quiet(() => requireAuth(h.req({ params: { slug: 'shop' } }), r, () => { reached = true; }));
  assert.equal(r.statusCode, 401);
  assert.equal(reached, false);
  const r2 = await read('shop', undefined);
  assert.equal(r2.statusCode, 401);
  assert.equal(r2.body.settings, undefined);
  noSecret(r2.body);
  assert.deepEqual(h.db.writes, []);
});

test('the owner reads the settings and counts; the response has no code or code URL', async () => {
  setup();
  const r = await read('shop', 'user_owner');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['rewardReady', 'settings', 'stampCount', 'totalStamps']);
  assert.equal(r.body.settings.goal, 3);
  assert.equal(r.body.settings.rewardName, 'Free Coffee');
  assert.equal(r.body.settings.enabled, true);
  assert.equal(r.body.stampCount, 2);
  assert.equal(r.body.rewardReady, false);
  assert.equal(r.body.totalStamps, 2);
  noSecret(r.body);
});

test('another account: 403, nothing about the program in the answer', async () => {
  setup();
  const r = await read('shop', 'user_other');
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.settings, undefined);
  noSecret(r.body);
});

test('unknown page: 404; platform-managed page (no owner): 403 for any account', async () => {
  setup();
  assert.equal((await read('no-such-page', 'user_owner')).statusCode, 404);
  for (const u of ['user_owner', 'user_other']) assert.equal((await read('platform-shop', u)).statusCode, 403);
});

test('a read writes nothing: no stamp code is created, even when the page has none yet', async () => {
  setup();
  h.db.tables.stampToken = [];
  const before = rows();
  const r = await read('shop', 'user_owner');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(h.db.writes, []);
  assert.deepEqual(rows(), before);
  assert.equal(h.T('stampToken').length, 0, 'no StampToken row');
});

test('repeated reads by every kind of caller stay write-free', async () => {
  setup();
  const before = rows();
  for (let i = 0; i < 5; i++) {
    await read('shop', 'user_owner');
    await read('shop', 'user_other');
    await read('shop', undefined);
    await read('no-such-page', 'user_owner');
  }
  assert.deepEqual(h.db.writes, []);
  assert.deepEqual(rows(), before);
});

test('settings not set up yet: the owner gets settings null and zero counts', async () => {
  h.reset();
  h.page('fresh', { userId: 'user_owner' });
  const r = await read('fresh', 'user_owner');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { settings: null, stampCount: 0, rewardReady: false, totalStamps: 0 });
  assert.deepEqual(h.db.writes, []);
});

// ── the owner's Loyalty tab (smart-qr-detail.html) with the new contract ──
const html = fs.readFileSync(h.resolve('..', 'frontend', 'public', 'smart-qr-detail.html'), 'utf8');
const loadAt = html.indexOf('function loadLoyaltyTab()');
const loadSrc = html.slice(loadAt, html.indexOf('window.toggleLoyalty', loadAt));
function runTab(settingsAnswer) {
  const calls = [], els = {};
  const el = (id) => (els[id] = els[id] || { id, value: '', textContent: '', innerHTML: '', style: {} });
  const answer = (b) => Promise.resolve({ json: () => Promise.resolve(b) });
  const ctx = {
    window: { _sqd_slug: 'shop', location: { search: '' } },
    localStorage: { getItem: (k) => (k === 'sqd_token' ? 'clerk-session' : null) },
    document: { getElementById: el },
    console: { error() {} },
    fetch: (url, opts) => {
      calls.push({ url, opts });
      if (url.includes('/lp/stamp/settings/')) return answer(settingsAnswer);
      if (url.includes('/lp/nfc-token/')) return answer({ token: 'nfc-code', stampUrl: 'https://www.qraivy.com/stamp/shop/nfc-code', nfcUrl: 'https://www.qraivy.com/stamp/shop/nfc-code' });
      return answer({});
    },
    encodeURIComponent,
  };
  vm.runInNewContext(loadSrc + '\nloadLoyaltyTab();', ctx);
  return new Promise((r) => setTimeout(r, 20)).then(() => ({ calls, els }));
}

test('owner UI: the Loyalty tab sends its sign-in and fills every field from the new answer; the NFC URL comes from /lp/nfc-token', async () => {
  assert.ok(loadSrc.length > 200, 'loadLoyaltyTab found');
  const { calls, els } = await runTab({ settings: { goal: 3, rewardName: 'Free Coffee', enabled: true }, stampCount: 2, rewardReady: false, totalStamps: 7 });
  assert.equal(calls[0].url, 'https://www.qraivy.com/lp/stamp/settings/shop');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer clerk-session');
  assert.equal(els['loyalty-goal'].value, 3);
  assert.equal(els['loyalty-reward-name'].value, 'Free Coffee');
  assert.equal(els['loyalty-enable-toggle'].textContent, 'On');
  assert.equal(els['loyalty-total-stamps'].textContent, 7);
  assert.equal(els['loyalty-current-stamps'].textContent, '2/3');
  assert.equal(els['loyalty-reward-status'].textContent, 'Not yet');
  assert.equal(calls[1].url, 'https://www.qraivy.com/lp/nfc-token/shop');
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer clerk-session');
  assert.equal(els['loyalty-stamp-url'].textContent, 'https://www.qraivy.com/stamp/shop/nfc-code');
});

test('owner UI: reads no code from the settings answer, and a refused answer (401/403) breaks nothing', async () => {
  assert.ok(!/d\.(token|stampUrl)\b/.test(loadSrc), 'the tab never used the settings code');
  const { els } = await runTab({ error: 'Forbidden' });
  assert.equal(els['loyalty-goal'], undefined, 'settings fields untouched');
  assert.equal(els['loyalty-total-stamps'].textContent, 0);
});

h.run('stampSettingsRead', tests);
