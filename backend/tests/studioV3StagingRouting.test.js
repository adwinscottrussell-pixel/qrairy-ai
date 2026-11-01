// ============================================================
// studioV3StagingRouting.test.js — Phase D0 Step 4B: the Studio V3 staging
// address in js/studio/studio-routing.js.
//
// https://qraivy-studio-v3-staging.vercel.app (Vercel project
// qraivy-studio-v3-staging, behind Vercel Authentication) is a connected
// preview with:
// - the isolated Studio V3 staging API (Railway project
//   qraivy-studio-v3-staging), never a production or other staging API;
// - the public key of the separate Clerk DEVELOPMENT application (pk_test,
//   a *.clerk.accounts.dev instance), never production Clerk;
// - no Deal Builder (that environment has none).
// Exact name and https only; look-alikes, per-deployment and team addresses
// and every other host get nothing (default deny), so no other address can
// receive the staging API or key. The existing addresses are unchanged.
// Run: node tests/studioV3StagingRouting.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');
const SRC = read('js/studio/studio-routing.js');
const AUTH = require('../../frontend/public/js/studio/studio-auth.js');
const PAGES = require('../../frontend/public/js/studio/studio-pages-data.js');
const { PRODUCTION_HOSTS } = require('../src/config/publicOrigins');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const HOST = 'qraivy-studio-v3-staging.vercel.app';
const API = 'https://studio-v3-api-production.up.railway.app';
const BLOCKED = { mode: 'unavailable', api: '', blocked: true };

function load(location) {
  const ctx = { window: { location: location || { hostname: 'x', protocol: 'https:' } } };
  vm.runInNewContext(SRC, ctx);
  return ctx.window;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const W = load();
const resolve = (h, p) => plain(W.QraivyStudioRouting.resolve(h, p));
const STAGING = resolve(HOST, 'https:');
// the publishable key's own content: base64 of "<frontend api host>$"
const keyHost = (k) => Buffer.from(String(k).replace(/^pk_(live|test)_/, ''), 'base64').toString('utf8').replace(/\$$/, '');

test('the staging address: preview mode with the staging API and the development key, no Deal Builder', () => {
  assert.deepEqual(Object.keys(STAGING).sort(), ['api', 'blocked', 'clerk', 'isolated', 'mode']);
  // isolated: the Studio files only there; studio-shell.js hides the links to the other Admin pages
  assert.equal(STAGING.isolated, true);
  assert.equal(resolve('studio-preview.qraivy.com', 'https:').isolated, undefined, 'the other connected preview keeps its links');
  assert.equal(STAGING.mode, 'preview');
  assert.equal(STAGING.blocked, false);
  assert.equal(STAGING.api, API);
  assert.equal(STAGING.builder, undefined, 'no Deal Builder in that environment');
  assert.deepEqual(resolve('QRAIVY-STUDIO-V3-STAGING.vercel.app', 'https:'), STAGING, 'host names are case-insensitive');
});

test('the key is a Clerk DEVELOPMENT key (pk_test, *.clerk.accounts.dev), never production Clerk', () => {
  assert.match(STAGING.clerk, /^pk_test_[A-Za-z0-9]+$/);
  const host = keyHost(STAGING.clerk);
  assert.match(host, /^[a-z0-9-]+\.clerk\.accounts\.dev$/, 'a development instance');
  assert.ok(!/qraivy/i.test(host), 'not the QRAIVY production Clerk host');
  const prod = resolve('studio-preview.qraivy.com', 'https:').clerk;
  assert.notEqual(STAGING.clerk, prod, 'not the production key');
  assert.ok(!read('deals.html').includes(STAGING.clerk), 'not the key production pages use');
});

test('the API is the isolated Railway staging API, never production or another staging API', () => {
  const u = new URL(STAGING.api);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.origin, STAGING.api, 'an origin only, no path');
  assert.ok(u.hostname.endsWith('.up.railway.app'));
  assert.ok(!PRODUCTION_HOSTS.includes(u.hostname), 'not a production host');
  assert.ok(!/(^|\.)qraivy\.com$/.test(u.hostname));
  assert.notEqual(u.hostname, 'qrairy-ai-production.up.railway.app');
  assert.notEqual(STAGING.api, resolve('studio-preview.qraivy.com', 'https:').api, 'not the Deals preview API');
  assert.ok(!SRC.includes('api.qraivy.com') && !SRC.includes('clerk.qraivy.com'), 'the routing file names neither production endpoint');
});

test('https and the exact name only: look-alikes, per-deployment and team addresses get nothing', () => {
  for (const p of ['http:', 'file:', '', undefined]) assert.deepEqual(resolve(HOST, p), BLOCKED, 'needs https: ' + p);
  for (const h of [HOST + '.evil.example', 'evil-' + HOST, 'x.' + HOST, HOST + '.', HOST + ':443', ' ' + HOST,
    'qraivy-studio-v3-staging-k3j9x2a1b.vercel.app', 'qraivy-studio-v3-staging-adwinscottrussell-5957s-projects.vercel.app',
    'qraivy-studio-v3-staging-git-preview-lp-adwinscottrussell-5957s-projects.vercel.app',
    'qraivy-studio-v3.vercel.app', 'qraivy-studio-v3-staging.vercel.com', 'studio-v3-api-production.up.railway.app']) {
    assert.deepEqual(resolve(h, 'https:'), BLOCKED, h);
  }
});

test('no other address receives the staging API or the development key', () => {
  const hosts = ['www.qraivy.com', 'qraivy.com', 'api.qraivy.com', 'preview.qraivy.com', 'deals-preview.qraivy.com', 'voice-preview.qraivy.com',
    'plan-preview.qraivy.com', 'admin-preview.qraivy.com', 'studio-preview.qraivy.com', 'studio.qraivy.com', 'qrairy-ai.vercel.app',
    'qraivy-ai-git-preview-l-3d55c7-adwinscottrussell-5957s-projects.vercel.app', 'qraivy-deals-staging.vercel.app', 'qraivy-voice-staging.vercel.app',
    'qraivy-studio-staging.vercel.app', 'localhost', '127.0.0.1', '[::1]', '', undefined, 'evil.example'];
  for (const h of hosts) for (const p of ['https:', 'http:', 'file:']) {
    const r = resolve(h, p);
    assert.notEqual(r.api, API, h + ' ' + p);
    assert.notEqual(r.clerk, STAGING.clerk, h + ' ' + p);
  }
  // the routing file uses the staging API and the development key exactly once (this entry)
  assert.equal(SRC.split(API).length, 2);
  assert.equal(SRC.split(STAGING.clerk).length, 2);
  assert.equal((SRC.match(/pk_test_[A-Za-z0-9]+/g) || []).length, 1, 'one development key');
  assert.deepEqual(plain(W.QraivyStudioRouting.CONNECTED_HOSTS), ['studio-preview.qraivy.com', HOST]);
});

test('existing addresses are unchanged', () => {
  for (const h of ['localhost', '127.0.0.1', '[::1]']) assert.deepEqual(resolve(h, 'http:'), { mode: 'local', api: '', blocked: false });
  assert.deepEqual(resolve('', 'file:'), { mode: 'local', api: '', blocked: false });
  assert.deepEqual(resolve('qraivy-studio-staging.vercel.app', 'https:'), { mode: 'preview', api: '', blocked: false });
  assert.deepEqual(plain(W.QraivyStudioRouting.PREVIEW_HOSTS), ['qraivy-studio-staging.vercel.app']);
  const sp = resolve('studio-preview.qraivy.com', 'https:');
  assert.equal(sp.api, 'https://qraivy-deals-api-deals-preview.up.railway.app');
  assert.equal(sp.builder, 'https://deals-preview.qraivy.com/deals.html');
  assert.match(sp.clerk, /^pk_live_/);
  for (const h of ['www.qraivy.com', 'qraivy.com', 'api.qraivy.com']) assert.deepEqual(resolve(h, 'https:'), BLOCKED, h);
  const prodPage = load({ hostname: 'www.qraivy.com', protocol: 'https:' });
  assert.deepEqual(plain(prodPage.QRAIVY_STUDIO_ROUTING), BLOCKED, 'production: the Studio does not start');
});

test('on the staging page: the routing it starts with, and studio-auth.js loads only the Clerk bundle with the development key', () => {
  const page = load({ hostname: HOST, protocol: 'https:' });
  assert.deepEqual(plain(page.QRAIVY_STUDIO_ROUTING), STAGING);
  delete globalThis.Clerk;
  const added = [];
  const doc = { head: { appendChild: (s) => added.push(s) }, createElement: (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) };
  AUTH.createAuth({ routing: STAGING, document: doc }).ready();
  assert.equal(added.length, 1);
  assert.equal(added[0].src, 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js');
  assert.equal(added[0].attrs['data-clerk-publishable-key'], STAGING.clerk);
  // an address that is not connected loads nothing
  const none = [];
  AUTH.createAuth({ routing: resolve('evil-' + HOST, 'https:'), document: { head: { appendChild: (s) => none.push(s) }, createElement: () => ({ setAttribute() {} }) } }).ready();
  assert.equal(none.length, 0);
});

test('the Studio pages module sends its requests only to the staging API, with the token, no cookies', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ pages: [] }) }; };
  const data = PAGES.createPagesData({ api: STAGING.api, getToken: () => 'tok', fetch });
  await data.list();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, API + '/studio/pages');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.credentials, 'omit');
});

(async () => {
  let passed = 0, failed = 0;
  console.log('studioV3StagingRouting');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
