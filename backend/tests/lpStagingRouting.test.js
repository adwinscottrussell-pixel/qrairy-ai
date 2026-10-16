// ============================================================
// lpStagingRouting.test.js — production and staging API routing stay
// separate.
//
// Frontend: js/staging-config.js + js/lp-routing.js are executed for
// real against a stand-in browser window, on a production host, on a
// configured staging host, and on a staging host that is misconfigured.
// Backend: config/publicOrigins.js, the customer page renderer and the
// CORS origin policy are loaded for real under production and staging
// settings.
//
// Every hostname used for "staging" below is an example made up for the
// test (*.example); none is written anywhere in the product code.
//
// No test framework dependency, same convention as the other tests.
// Run: node tests/lpStagingRouting.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'src');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const ROUTING_JS = read(PUB, 'js', 'lp-routing.js');
const CONFIG_JS = read(PUB, 'js', 'staging-config.js');
const EDITOR_PAGE = read(PUB, 'smart-qr-detail.html');
const SMART_EDITOR = read(PUB, 'smart-editor.js');
const GREETING_EDITOR = read(PUB, 'js', 'voice-greeting-editor.js');

const STAGING_SITE = 'voice-preview.example';
const STAGING_API = 'https://voice-api.example';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── A stand-in browser window ───────────────────────────────────
function browser({ hostname, config, useCommittedConfig = false }) {
  const sent = [], xhr = [], listeners = {}, appended = [], sw = { registered: [], unregistered: 0 };
  const realRegister = function (script) { sw.registered.push(script); return Promise.resolve({}); };
  const serviceWorker = { register: realRegister, getRegistrations: () => Promise.resolve([{ unregister() { sw.unregistered += 1; } }]) };
  const realFetch = function (url, init) { sent.push({ url: typeof url === 'string' ? url : url.url, init }); return Promise.resolve({ ok: true }); };
  function XHR() {}
  XHR.prototype.open = function (method, url) { xhr.push({ method, url }); };
  const window = {
    location: { hostname, href: 'https://' + hostname + '/smart-qr-detail.html?slug=test-page', origin: 'https://' + hostname },
    fetch: realFetch, XMLHttpRequest: XHR, console: { error() {}, info() {} },
    navigator: { serviceWorker },
  };
  const document = {
    body: { appendChild: (el) => appended.push(el) },
    createElement: () => ({ style: {}, setAttribute() {} }),
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
  };
  const ctx = { window, document, URL, Promise, TypeError, Error, Array, String };
  if (useCommittedConfig) vm.runInNewContext(CONFIG_JS, ctx); else if (config !== undefined) window.QRAIVY_STAGING_CONFIG = config;
  vm.runInNewContext(ROUTING_JS, ctx);
  return { window, routing: window.QRAIVY_ROUTING, sent, xhr, listeners, appended, realFetch, XHR, sw, realRegister, serviceWorker,
    click(href) { const a = { href, closest: () => a }; let prevented = false; if (listeners.click) listeners.click({ target: a, preventDefault() { prevented = true; }, stopPropagation() {} }); return { href: a.href, prevented }; } };
}
const staging = (config) => browser({ hostname: STAGING_SITE, config: Object.assign({ hosts: [STAGING_SITE], api: STAGING_API }, config) });

// Every production address the editor uses
const PRODUCTION_REQUESTS = [
  'https://api.qraivy.com/api/lp/test-page', 'https://api.qraivy.com/lp', 'https://api.qraivy.com/lp/test-page', 'https://api.qraivy.com/qr/abc', 'https://api.qraivy.com/dashboard',
  'https://api.qraivy.com/lp/voice/preview/test-page', 'https://api.qraivy.com/lp/test-page?preview=1&t=1',
  'https://www.qraivy.com/lp/test-page', 'https://www.qraivy.com/lp/push/test-page/count', 'https://www.qraivy.com/lp/push/test-page', 'https://www.qraivy.com/lp/stamp/settings/test-page', 'https://www.qraivy.com/lp/nfc-token/test-page',
  'https://qraivy.com/lp/test-page', 'https://pages.qraivy.com/lp/test-page', 'https://qrairy-ai-production.up.railway.app/lp/test-page',
];
// The websites where the editor uses the production API, today and after this change.
const PRODUCTION_SITES = ['www.qraivy.com', 'qraivy.com', 'preview.qraivy.com', 'admin-preview.qraivy.com'];
const NOT_API = ['https://clerk.qraivy.com/v1/client', 'https://res.cloudinary.com/x/video/upload/v1/qraivy-voices/a.mp3', 'https://fonts.googleapis.com/css2', 'https://www.qraivy.com/pricing.html', 'https://qraivy.com/icon-192.png', 'https://api.qrserver.com/v1/create-qr-code/'];

// ── A. Production is unchanged ─────────────────────────────────
// The one staging connection this branch is configured for.
const COMMITTED_STAGING_SITE = 'voice-preview.qraivy.com';
const COMMITTED_STAGING_API = 'https://qraivy-voice-api-voice-staging.up.railway.app';

test('A. the committed configuration connects exactly one staging host to one staging API; production and unknown hosts are unaffected', () => {
  const b = browser({ hostname: 'www.qraivy.com', useCommittedConfig: true });
  assert.deepEqual(JSON.parse(JSON.stringify(b.window.QRAIVY_STAGING_CONFIG)), { hosts: [COMMITTED_STAGING_SITE], api: COMMITTED_STAGING_API });
  // every production site: production routing, the browser's own fetch, addresses untouched
  for (const hostname of PRODUCTION_SITES) {
    const p = browser({ hostname, useCommittedConfig: true });
    assert.equal(p.routing.mode, 'production', hostname);
    assert.equal(p.routing.api, 'https://api.qraivy.com', hostname);
    assert.equal(p.window.fetch, p.realFetch, hostname);
    for (const u of PRODUCTION_REQUESTS) assert.equal(p.routing.url(u), u, hostname + ' ' + u);
  }
  // the staging host: every production API address goes to the staging API, nowhere else
  const s = browser({ hostname: COMMITTED_STAGING_SITE, useCommittedConfig: true });
  assert.equal(s.routing.mode, 'staging');
  assert.equal(s.routing.api, COMMITTED_STAGING_API);
  for (const u of PRODUCTION_REQUESTS) assert.ok(s.routing.url(u).indexOf(COMMITTED_STAGING_API + '/') === 0, u + ' -> ' + s.routing.url(u));
  // any other host stays blocked: nothing falls back to production
  for (const hostname of ['qraivy-voice-staging.vercel.app', 'localhost', 'plan-preview.qraivy.com', 'some-other-preview.qraivy.com', 'voice-preview.qraivy.com.evil.example', 'xvoice-preview.qraivy.com']) {
    const u = browser({ hostname, useCommittedConfig: true });
    assert.equal(u.routing.mode, 'unknown-host', hostname);
    assert.equal(u.routing.api, '', hostname);
    for (const req of PRODUCTION_REQUESTS) assert.equal(u.routing.url(req), 'about:blank#qraivy-api-blocked', hostname + ' ' + req);
  }
});

test('A. no staging hostname is written in the product code; the configuration file holds the one connection and nothing else', () => {
  const allowed = 'qrairy-ai-production.up.railway.app';
  for (const [name, src] of [['lp-routing.js', ROUTING_JS], ['publicOrigins.js', read(SRC, 'config', 'publicOrigins.js')]]) {
    const hosts = (src.split(allowed).join('').match(/[a-z0-9-]+\.(up\.railway\.app|vercel\.app)/gi) || []);
    assert.deepEqual(hosts, [], name);
    assert.ok(!/staging[a-z0-9-]*\.qraivy\.com|voice[a-z0-9-]*\.qraivy\.com/i.test(src), name);
  }
  // staging-config.js is the single place a staging address may appear
  const window = {};
  vm.runInNewContext(CONFIG_JS, { window });
  const cfg = JSON.parse(JSON.stringify(window.QRAIVY_STAGING_CONFIG));
  assert.deepEqual(Object.keys(cfg).sort(), ['api', 'hosts']);
  assert.deepEqual(cfg.hosts, [COMMITTED_STAGING_SITE]);
  assert.equal(cfg.api, COMMITTED_STAGING_API);
  const production = PRODUCTION_SITES.concat(['api.qraivy.com', 'pages.qraivy.com', allowed]);
  assert.ok(production.indexOf(cfg.hosts[0]) === -1 && production.indexOf(new URL(cfg.api).hostname) === -1);
  const code = CONFIG_JS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual((code.match(/[a-z0-9-]+(\.[a-z0-9-]+)*\.(up\.railway\.app|vercel\.app|qraivy\.com)/gi) || []).sort(), [COMMITTED_STAGING_SITE, new URL(COMMITTED_STAGING_API).hostname].sort());
});

test('A. on every production host nothing is touched: same fetch, same addresses', () => {
  for (const hostname of PRODUCTION_SITES) {
    for (const config of [undefined, { hosts: [], api: '' }, { hosts: [STAGING_SITE], api: STAGING_API }, null, 'junk', { hosts: 'not-a-list', api: 5 }]) {
      const b = browser({ hostname, config });
      assert.deepEqual([b.routing.mode, b.routing.api], ['production', 'https://api.qraivy.com'], hostname);
      assert.equal(b.window.fetch, b.realFetch, 'fetch is the browser\'s own');
      assert.equal(b.window.XMLHttpRequest.prototype.open, b.XHR.prototype.open);
      assert.equal(b.listeners.click, undefined, 'no click handling is installed');
      assert.equal(b.serviceWorker.register, b.realRegister, 'service-worker registration is the browser\'s own');
      for (const u of PRODUCTION_REQUESTS.concat(NOT_API)) assert.equal(b.routing.url(u), u);
      assert.equal(b.appended.length, 0);
    }
  }
});

test('A. a staging configuration that names a production host is ignored, so production keeps working', () => {
  for (const host of ['www.qraivy.com', 'qraivy.com']) {
    const b = browser({ hostname: host, config: { hosts: [host, STAGING_SITE], api: STAGING_API } });
    assert.equal(b.routing.mode, 'production');
    assert.equal(b.routing.url('https://api.qraivy.com/lp'), 'https://api.qraivy.com/lp');
    // and the listed staging site is not treated as staging either: the whole configuration is void, so it is blocked
    assert.equal(browser({ hostname: STAGING_SITE, config: { hosts: [host, STAGING_SITE], api: STAGING_API } }).routing.mode, 'unknown-host');
  }
});

// ── B. Staging goes to the staging API only ────────────────────
test('B. on the configured staging host every production API request goes to the staging API', async () => {
  const b = staging();
  assert.deepEqual([b.routing.mode, b.routing.api, b.routing.error], ['staging', STAGING_API, '']);
  for (const u of PRODUCTION_REQUESTS) {
    const p = new URL(u);
    assert.equal(b.routing.url(u), STAGING_API + p.pathname + p.search, u);
    await b.window.fetch(u, { method: 'POST' });
  }
  assert.equal(b.sent.length, PRODUCTION_REQUESTS.length);
  for (const s of b.sent) assert.ok(s.url.startsWith(STAGING_API + '/'), s.url);
  assert.ok(!b.sent.some((s) => /qraivy\.com|qrairy-ai-production/.test(s.url)), 'nothing reached a production host');
  assert.deepEqual(b.sent[0].init, { method: 'POST' }, 'method, headers and body are passed on unchanged');
});

test('B. the paths the website forwards to production (vercel.json) are rerouted too, even when requested on the staging site itself', async () => {
  const b = staging();
  for (const p of ['/lp/test-page', '/lp/push/test-page/count', '/stamp/test-page/tok', '/wallet/x', '/manifest/test-page', '/api/lp/test-page']) {
    await b.window.fetch(p);
    await b.window.fetch('https://' + STAGING_SITE + p);
  }
  assert.ok(b.sent.length === 12 && b.sent.every((s) => s.url.startsWith(STAGING_API + '/')), JSON.stringify(b.sent.map((s) => s.url)));
  // the rewrite list in vercel.json is what this guards against
  const rewrites = JSON.parse(read(__dirname, '..', '..', 'vercel.json')).rewrites.map((r) => r.source.replace('/:path*', ''));
  for (const source of rewrites.filter((s) => s !== '/sw.js')) assert.ok(b.routing.isProductionApi(source + '/x'), source);
});

test('B. everything that is not the API is left alone on staging: sign-in, audio files, fonts, the site\'s own files', async () => {
  const b = staging();
  for (const u of NOT_API.concat(['/js/voice-greetings.js', 'smart-editor.js', 'https://' + STAGING_SITE + '/dashboard.html', STAGING_API + '/lp/test-page'])) {
    assert.equal(b.routing.url(u), u);
    await b.window.fetch(u);
  }
  assert.deepEqual(b.sent.map((s) => s.url), NOT_API.concat(['/js/voice-greetings.js', 'smart-editor.js', 'https://' + STAGING_SITE + '/dashboard.html', STAGING_API + '/lp/test-page']));
});

test('B. XMLHttpRequest and links to a page are rerouted as well', () => {
  const b = staging();
  const x = new b.window.XMLHttpRequest();
  x.open('GET', 'https://api.qraivy.com/api/lp/test-page', true);
  x.open('GET', 'https://res.cloudinary.com/a.mp3');
  assert.deepEqual(b.xhr, [{ method: 'GET', url: STAGING_API + '/api/lp/test-page' }, { method: 'GET', url: 'https://res.cloudinary.com/a.mp3' }]);
  assert.deepEqual(b.click('https://qraivy.com/lp/test-page'), { href: STAGING_API + '/lp/test-page', prevented: false });
  assert.deepEqual(b.click('https://www.qraivy.com/pricing.html'), { href: 'https://www.qraivy.com/pricing.html', prevented: false });
});

test('B. the sign-in token is passed on exactly as the page sent it, and only to the staging API', async () => {
  const b = staging();
  const init = { method: 'POST', headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' }, body: '{"x":1}' };
  await b.window.fetch('https://api.qraivy.com/lp/voice/preview/test-page', init);
  assert.equal(b.sent[0].url, STAGING_API + '/lp/voice/preview/test-page');
  assert.equal(b.sent[0].init, init);
  assert.ok(!/Authorization|Bearer|token|Clerk/i.test(ROUTING_JS.replace(/\/\*[\s\S]*?\*\//, '')), 'the routing script itself never reads or handles credentials');
});

// ── C. Staging never falls back to production ──────────────────
test('C. a staging host without a valid staging API blocks every API request; none goes to production', async () => {
  for (const [api, why] of [['', /No staging API/], [undefined, /No staging API/], ['http://voice-api.example', /https/], ['not a url', /https/], ['https://api.qraivy.com', /production/], ['https://www.qraivy.com', /production/], ['https://qrairy-ai-production.up.railway.app', /production/], ['https://' + STAGING_SITE, /itself/]]) {
    const b = staging({ api });
    assert.equal(b.routing.mode, 'staging-error', String(api));
    assert.equal(b.routing.api, '');
    assert.match(b.routing.error, why);
    for (const u of PRODUCTION_REQUESTS.concat(['/lp/test-page'])) {
      await assert.rejects(b.window.fetch(u), /Blocked: this preview is not connected to a staging API/);
      assert.equal(b.routing.url(u), 'about:blank#qraivy-api-blocked');
    }
    assert.throws(() => new b.window.XMLHttpRequest().open('GET', 'https://api.qraivy.com/lp'), /Blocked/);
    assert.deepEqual(b.click('https://qraivy.com/lp/test-page'), { href: 'https://qraivy.com/lp/test-page', prevented: true });
    assert.equal(b.sent.length, 0, 'not one request left the page');
    assert.equal(b.xhr.length, 0);
    assert.equal(b.appended.length, 1, 'and the page says so, once');
    assert.match(b.appended[0].textContent, /Requests are blocked; nothing is sent to production/);
  }
});

test('C. the staging API is used exactly as configured, never guessed or derived', () => {
  assert.equal(staging({ api: 'https://voice-api.example/' }).routing.api, STAGING_API);
  assert.equal(staging({ api: 'https://voice-api.example/some/path?x=1' }).routing.api, STAGING_API, 'only the origin is used');
  assert.equal(staging({ hosts: ['VOICE-PREVIEW.EXAMPLE'] }).routing.mode, 'staging', 'hostnames compare case-insensitively');
  // a host that is not listed is not staging, whatever it looks like -- and it is not production either
  for (const hostname of ['other-preview.example', 'voice-preview.example.evil.test', 'xvoice-preview.example']) assert.equal(browser({ hostname, config: { hosts: [STAGING_SITE], api: STAGING_API } }).routing.mode, 'unknown-host');
});

// ── C2. Unknown hostnames are previews, and previews are blocked ─
// Made-up examples of the kinds of hostname a preview can have.
const UNKNOWN_HOSTS = [
  'qrairy-ai-git-preview-lp-voice-social-team.vercel.app', 'qrairy-ai-9x8y7z-team.vercel.app', 'qrairy-ai.vercel.app',
  'brand-new-preview.qraivy.com', 'voice.qraivy.com', 'plan-preview.qraivy.com', 'staging.qraivy.com',
  'localhost', '127.0.0.1', 'my-laptop.local', 'something.up.railway.app', 'example.org',
  'www.qraivy.com.evil.test', 'qraivy.com.evil.test', 'xqraivy.com', 'wwwqraivy.com',
];

test('C2. a hostname that is not a production site never gets production routing, with no list of previews needed', async () => {
  for (const hostname of UNKNOWN_HOSTS) {
    for (const config of [undefined, { hosts: [], api: '' }, { hosts: [STAGING_SITE], api: STAGING_API }, null, 'junk']) {
      const b = browser({ hostname, config });
      assert.deepEqual([b.routing.mode, b.routing.api], ['unknown-host', ''], hostname);
      assert.match(b.routing.error, /is not a production site and is not connected to a staging API/);
      for (const u of PRODUCTION_REQUESTS.concat(['/lp/test-page', '/sw.js'])) {
        await assert.rejects(b.window.fetch(u), /Blocked/, hostname + ' ' + u);
        assert.equal(b.routing.url(u), 'about:blank#qraivy-api-blocked');
      }
      assert.throws(() => new b.window.XMLHttpRequest().open('POST', 'https://api.qraivy.com/lp'), /Blocked/);
      assert.equal(b.click('https://qraivy.com/lp/test-page').prevented, true);
      assert.equal(b.sent.length + b.xhr.length, 0, hostname + ': nothing was sent');
      assert.equal(b.appended.length, 1);
      assert.match(b.appended[0].textContent, /not connected to a staging API\. Requests are blocked; nothing is sent to production/);
    }
  }
});

test('C2. the committed configuration on a preview hostname: blocked, not production', () => {
  const b = browser({ hostname: 'qrairy-ai-git-some-branch-team.vercel.app', useCommittedConfig: true });
  assert.equal(b.routing.mode, 'unknown-host');
  // and with the configuration file missing altogether
  assert.equal(browser({ hostname: 'qrairy-ai-git-some-branch-team.vercel.app' }).routing.mode, 'unknown-host');
});

test('C2. a preview hostname becomes usable only by being connected to a staging API', async () => {
  const hostname = 'qrairy-ai-git-preview-lp-voice-social-team.vercel.app';
  const b = browser({ hostname, config: { hosts: [hostname], api: STAGING_API } });
  assert.deepEqual([b.routing.mode, b.routing.api], ['staging', STAGING_API]);
  await b.window.fetch('https://api.qraivy.com/lp');
  assert.deepEqual(b.sent.map((x) => x.url), [STAGING_API + '/lp']);
});

test('C2. the production sites are exactly the websites the production API accepts (minus the API itself and Plan Preview)', () => {
  const { STATIC_ALLOWED_ORIGINS } = require(path.join(SRC, 'utils', 'corsOriginPolicy.js'));
  const expected = STATIC_ALLOWED_ORIGINS.filter((o) => o !== 'https://api.qraivy.com' && o !== 'https://plan-preview.qraivy.com').map((o) => o.replace('https://', '')).sort();
  const actual = JSON.parse(JSON.stringify(browser({ hostname: 'www.qraivy.com' }).routing.PRODUCTION_SITES)).sort();
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual, PRODUCTION_SITES.slice().sort());
  // Plan Preview never runs this page at all: its own guard, first thing in the page, is untouched
  assert.ok(EDITOR_PAGE.includes("if(location.hostname==='plan-preview.qraivy.com'){location.replace('/dashboard.html?planPreviewBlocked=1');"));
});

// ── C3. Service workers ────────────────────────────────────────
test('C3. production: service workers are not touched in any way', async () => {
  for (const hostname of PRODUCTION_SITES) {
    const b = browser({ hostname, useCommittedConfig: true });
    assert.equal(b.serviceWorker.register, b.realRegister);
    await b.serviceWorker.register('/sw.js');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual([b.sw.registered, b.sw.unregistered], [['/sw.js'], 0]);
  }
});

test('C3. staging and blocked previews: the site registers no service worker and removes any left from an earlier visit', async () => {
  for (const b of [staging(), staging({ api: '' }), browser({ hostname: 'qrairy-ai-git-x-team.vercel.app' })]) {
    await new Promise((r) => setImmediate(r));
    assert.equal(b.sw.unregistered, 1, b.routing.mode + ': the existing registration is removed');
    for (const script of ['/sw.js', 'sw.js', 'https://api.qraivy.com/sw.js', 'https://www.qraivy.com/sw.js']) await assert.rejects(b.serviceWorker.register(script), /no service worker is registered on a preview site/);
    assert.deepEqual(b.sw.registered, [], b.routing.mode + ': nothing was registered');
  }
});

test('C3. /sw.js on the website is one of the paths forwarded to production, and the switch knows it', async () => {
  const rewrites = JSON.parse(read(__dirname, '..', '..', 'vercel.json')).rewrites;
  assert.ok(rewrites.some((r) => r.source === '/sw.js' && r.destination === 'https://api.qraivy.com/sw.js'));
  const b = staging();
  await b.window.fetch('/sw.js');
  assert.deepEqual(b.sent.map((x) => x.url), [STAGING_API + '/sw.js']);
  await assert.rejects(staging({ api: '' }).window.fetch('/sw.js'), /Blocked/);
});

test('C3. no editor file registers a service worker; the customer page registers only its own origin\'s, and that worker contains no address', () => {
  for (const [name, src] of [['smart-qr-detail.html', EDITOR_PAGE], ['smart-editor.js', SMART_EDITOR], ['voice-greeting-editor.js', GREETING_EDITOR]]) assert.ok(!/serviceWorker\.register/.test(src), name);
  const controller = read(SRC, 'controllers', 'lpController.js');
  const served = controller.slice(controller.indexOf('function renderPremiumLP('));
  const registrations = served.slice(0, served.indexOf('\nasync function ')).match(/serviceWorker\.register\([^)]*\)/g) || [];
  assert.ok(registrations.length >= 1);
  for (const r of registrations) assert.equal(r, "serviceWorker.register('/sw.js')", 'relative: the origin the page was served from');
  const worker = read(SRC, '..', 'public', 'sw.js');
  assert.ok(!/https?:\/\//.test(worker), 'the worker script names no host');
  assert.match(worker, /fetch\(e\.request\)/, 'it passes requests through unchanged');
});

// ── D. The editor is actually wired to it ──────────────────────
test('D. the editor page decides its routing before anything else loads, and blocks all requests if that script is missing', () => {
  const head = EDITOR_PAGE.slice(0, EDITOR_PAGE.indexOf('<meta charset="UTF-8"/>'));
  const cfg = head.indexOf('<script src="js/staging-config.js"></script>'), routing = head.indexOf('<script src="js/lp-routing.js"></script>'), guard = head.indexOf("if(!window.QRAIVY_ROUTING){window.fetch=function(){return Promise.reject(");
  assert.ok(cfg !== -1 && routing > cfg && guard > routing);
  const firstOther = EDITOR_PAGE.indexOf('<script src="js/landing-section-registry.js"></script>');
  assert.ok(firstOther > guard, 'before every other script of the page');
  assert.ok(head.includes("location.hostname==='plan-preview.qraivy.com'"), 'the existing Plan Preview guard is still first and untouched');
  // the guard, executed: without the routing object, fetch rejects
  const w = { fetch: () => Promise.resolve('sent') };
  vm.runInNewContext(head.slice(guard, head.indexOf('</script>', guard)), { window: w, Promise, TypeError });
  return assert.rejects(w.fetch('https://api.qraivy.com/lp'), /routing did not load/);
});

test('D. every API request the editor makes is one the switch recognises', () => {
  const b = staging();
  let found = 0;
  for (const [name, src] of [['smart-qr-detail.html', EDITOR_PAGE], ['smart-editor.js', SMART_EDITOR], ['voice-greeting-editor.js', GREETING_EDITOR]]) {
    const literals = src.match(/https:\/\/(?:api|www|pages)\.qraivy\.com(?:\/[a-z][a-z/-]*)?/g) || [];
    for (const lit of literals) {
      // marketing/site links (no API path) are not API requests
      if (/^https:\/\/www\.qraivy\.com(\/)?$/.test(lit) || /^https:\/\/www\.qraivy\.com\/(?!lp|stamp|wallet|manifest|api)/.test(lit)) continue;
      found += 1;
      const probe = /\/(lp|api|qr|dashboard|stamp)/.test(lit.replace('https://', '').replace(/^[^/]+/, '')) ? lit + (lit.endsWith('/') ? 'x' : '') : lit + '/lp';
      assert.ok(b.routing.isProductionApi(probe), name + ': ' + lit);
      assert.ok(b.routing.url(probe).startsWith(STAGING_API + '/'), name + ': ' + lit);
    }
  }
  // 18 since the Smart QR detail screen stopped loading the public page for its stats
  // (tests/smartQrDetailVisits.test.js): two requests fewer, one /api/lp read instead.
  assert.ok(found >= 18, 'found ' + found + ' production API addresses in the editor');
});

test('D. the phone preview addresses (not fetch) pass through the switch in all three places', () => {
  assert.ok(EDITOR_PAGE.includes("iframeEl.src = window.QRAIVY_ROUTING.url(_iframeSlug ? ('https://api.qraivy.com/lp/' + _iframeSlug + '?preview=1&t=' + Date.now())"));
  assert.ok(SMART_EDITOR.includes("var _newSrc=window.QRAIVY_ROUTING.url('https://api.qraivy.com/lp/'+encodeURIComponent(SE.slug)+'?preview=1&t='+Date.now());"));
  assert.ok(GREETING_EDITOR.includes("iframe.src = window.QRAIVY_ROUTING.url(API + '/lp/' + encodeURIComponent(slug) + '?preview=1&t=' + Date.now());"));
  // no other place sets a frame to a production address directly
  for (const [name, src] of [['smart-qr-detail.html', EDITOR_PAGE], ['smart-editor.js', SMART_EDITOR], ['voice-greeting-editor.js', GREETING_EDITOR]]) {
    const direct = (src.match(/\.src\s*=\s*['"`]https:\/\/(api|www)\.qraivy\.com/g) || []);
    assert.deepEqual(direct, [], name);
  }
  // strict on purpose: no "|| production" fallback next to the switch
  assert.ok(!/QRAIVY_ROUTING\s*(\|\||\?)/.test(EDITOR_PAGE + SMART_EDITOR + GREETING_EDITOR));
});

test('D. the phone preview in staging shows the staging page; in production the production page', () => {
  const editorUrl = 'https://api.qraivy.com/lp/test-page?preview=1&t=123';
  assert.equal(staging().routing.url(editorUrl), STAGING_API + '/lp/test-page?preview=1&t=123');
  assert.equal(browser({ hostname: 'www.qraivy.com', useCommittedConfig: true }).routing.url(editorUrl), editorUrl);
  assert.equal(staging({ api: '' }).routing.url(editorUrl), 'about:blank#qraivy-api-blocked');
  assert.equal(browser({ hostname: 'qrairy-ai-git-x-team.vercel.app' }).routing.url(editorUrl), 'about:blank#qraivy-api-blocked');
});

// ── E. Backend: the addresses inside a rendered customer page ──
const publicOriginsPath = require.resolve(path.join(SRC, 'config', 'publicOrigins.js'));
const { resolvePublicOrigins } = require(publicOriginsPath);

test('E. production: the defaults are the addresses production has always used, with or without unrelated settings', () => {
  for (const env of [{}, { APP_ENV: '' }, { APP_ENV: 'production' }, { NODE_ENV: 'production' }, { APP_ENV: 'Production ' }]) {
    assert.deepEqual(resolvePublicOrigins(env), { staging: false, apiOrigin: 'https://api.qraivy.com', pageOrigin: 'https://www.qraivy.com' });
  }
});

test('E. staging must be told both addresses; it refuses to start otherwise and never uses production ones', () => {
  const ok = resolvePublicOrigins({ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: STAGING_API, LP_PUBLIC_PAGE_ORIGIN: STAGING_API + '/' });
  assert.deepEqual(ok, { staging: true, apiOrigin: STAGING_API, pageOrigin: STAGING_API });
  for (const [env, why] of [
    [{ APP_ENV: 'staging' }, /requires LP_PUBLIC_API_ORIGIN and LP_PUBLIC_PAGE_ORIGIN/],
    [{ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: STAGING_API }, /requires/],
    [{ APP_ENV: 'staging', LP_PUBLIC_PAGE_ORIGIN: STAGING_API }, /requires/],
    [{ APP_ENV: 'STAGING', LP_PUBLIC_API_ORIGIN: 'https://api.qraivy.com', LP_PUBLIC_PAGE_ORIGIN: STAGING_API }, /LP_PUBLIC_API_ORIGIN points to production/],
    [{ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: STAGING_API, LP_PUBLIC_PAGE_ORIGIN: 'https://www.qraivy.com' }, /LP_PUBLIC_PAGE_ORIGIN points to production/],
    [{ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: STAGING_API, LP_PUBLIC_PAGE_ORIGIN: 'https://qraivy.com' }, /production/],
    [{ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: 'https://qrairy-ai-production.up.railway.app', LP_PUBLIC_PAGE_ORIGIN: STAGING_API }, /production/],
    [{ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: 'http://voice-api.example', LP_PUBLIC_PAGE_ORIGIN: STAGING_API }, /https/],
    [{ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: STAGING_API + '/lp', LP_PUBLIC_PAGE_ORIGIN: STAGING_API }, /origin only/],
    [{ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: 'nonsense', LP_PUBLIC_PAGE_ORIGIN: STAGING_API }, /not a valid address/],
  ]) assert.throws(() => resolvePublicOrigins(env), why, JSON.stringify(env));
});

// Loads the real controller under the given settings and renders one page.
const seedCache = (file, exports) => { const f = require.resolve(file); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
const PAGE = { id: 'lp1', slug: 'test-page', businessName: 'Casa Lumi', websiteUrl: 'https://example.com', useCase: 'restaurant', brandColor: '#c2410c', logoUrl: null, userId: 'u', template: 'premium', status: 'live', scanCount: 0, createdAt: new Date(1700000000000), updatedAt: new Date(1700000000000),
  sections: JSON.stringify({ language: 'en', hero: { title: 'Casa Lumi' }, voice: { audioUrl: 'https://res.cloudinary.com/test/a.mp3' }, buttons: [] }) };
seedCache(path.join(SRC, 'utils', 'prismaClient.js'), { landingPage: { findUnique: async () => Object.assign({}, PAGE), update: async () => ({}) }, stampSettings: { findUnique: async () => null } });
for (const f of ['apnsService.js', 'emailService.js', 'webPushService.js']) seedCache(path.join(SRC, 'services', f), { pushUpdateToDevices: async () => ({}), sendWelcomeEmail: async () => ({}), sendCampaignEmail: async () => ({}), sendWebPush: async () => ({}) });
const ENV_KEYS = ['APP_ENV', 'LP_PUBLIC_API_ORIGIN', 'LP_PUBLIC_PAGE_ORIGIN'];
async function renderWith(env, controllerFile = path.join(SRC, 'controllers', 'lpController.js')) {
  const saved = {}; for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  const controllerPath = require.resolve(controllerFile);
  delete require.cache[publicOriginsPath]; delete require.cache[controllerPath];
  try {
    const { handleServeLP } = require(controllerPath);
    let body = '';
    await handleServeLP({ params: { slug: 'test-page' }, query: { preview: '1' }, headers: {} }, { setHeader() {}, status() { return this; }, send(b) { body = b; } });
    return body;
  } finally {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    delete require.cache[publicOriginsPath]; delete require.cache[controllerPath];
  }
}

test('E. production: the rendered customer page is byte-for-byte what it was before this change', async () => {
  const headFile = path.join(SRC, 'controllers', '__lpController.before-routing.tmp.js');
  fs.writeFileSync(headFile, execFileSync('git', ['show', '10ab8d5:backend/src/controllers/lpController.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  let before;
  try { before = await renderWith({}, headFile); } finally { fs.unlinkSync(headFile); }
  const now = await renderWith({});
  assert.ok(before.length > 20000 && before.includes('id="chat-input"'));
  assert.equal(now, before);
  for (const expected of ["var API  = 'https://api.qraivy.com';", "window.location.href = 'https://api.qraivy.com/lp/wallet/google/' + SLUG", "fetch('https://www.qraivy.com/lp/webpush/vapid-key/'+_s)", "fetch('https://www.qraivy.com/lp/webpush/subscribe/'+_s,"]) assert.ok(now.includes(expected), expected);
  assert.ok(!now.includes('${'), 'no unfilled placeholder');
});

test('E. staging: the rendered customer page calls only the staging addresses — assistant, push, wallet link', async () => {
  const page = 'https://voice-pages.example';
  const html = await renderWith({ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: STAGING_API, LP_PUBLIC_PAGE_ORIGIN: page });
  for (const expected of [`var API  = '${STAGING_API}';`, `window.location.href = '${STAGING_API}/lp/wallet/google/' + SLUG`, `fetch('${page}/lp/webpush/vapid-key/'+_s)`, `fetch('${page}/lp/webpush/subscribe/'+_s,`]) assert.ok(html.includes(expected), expected);
  assert.equal((html.match(/api\.qraivy\.com/g) || []).length, 0, 'no production API address anywhere in the page');
  assert.equal((html.match(/www\.qraivy\.com/g) || []).length, 0, 'no production page address anywhere in the page');
  assert.ok(html.includes("fetch(API + '/lp/chat'"), 'the assistant posts to that API');
  assert.ok(!html.includes('${'));
  // the "Built with QRAIVY" marketing links are not API calls and stay
  assert.ok(html.includes('href="https://qraivy.com"'));
});

test('E. a staging server without its addresses does not start', async () => {
  await assert.rejects(renderWith({ APP_ENV: 'staging' }), /does not fall back to production addresses/);
  await assert.rejects(renderWith({ APP_ENV: 'staging', LP_PUBLIC_API_ORIGIN: 'https://api.qraivy.com', LP_PUBLIC_PAGE_ORIGIN: 'https://www.qraivy.com' }), /points to production/);
});

test('E. the origin settings carry no credentials and the module reads only its three settings', () => {
  const src = read(SRC, 'config', 'publicOrigins.js');
  const names = [...new Set((src.match(/env\.([A-Z_]+)/g) || []).map((m) => m.slice(4)))].sort();
  assert.deepEqual(names, ['APP_ENV', 'LP_PUBLIC_API_ORIGIN', 'LP_PUBLIC_PAGE_ORIGIN']);
  assert.ok(!/SECRET|KEY|TOKEN|PASSWORD/.test(src));
});

// ── F. Backend: which websites may call the API ────────────────
const corsPath = require.resolve(path.join(SRC, 'utils', 'corsOriginPolicy.js'));
function corsWith(extra) {
  const saved = process.env.EXTRA_ALLOWED_ORIGINS, savedSuffix = process.env.VERCEL_PREVIEW_HOST_SUFFIX;
  if (extra === undefined) delete process.env.EXTRA_ALLOWED_ORIGINS; else process.env.EXTRA_ALLOWED_ORIGINS = extra;
  delete process.env.VERCEL_PREVIEW_HOST_SUFFIX;
  delete require.cache[corsPath];
  try { return require(corsPath); } finally {
    if (saved === undefined) delete process.env.EXTRA_ALLOWED_ORIGINS; else process.env.EXTRA_ALLOWED_ORIGINS = saved;
    if (savedSuffix !== undefined) process.env.VERCEL_PREVIEW_HOST_SUFFIX = savedSuffix;
    delete require.cache[corsPath];
  }
}

test('F. production: the allowed websites are exactly the ones allowed before', () => {
  const cors = corsWith(undefined);
  assert.deepEqual(cors.STATIC_ALLOWED_ORIGINS, ['https://www.qraivy.com', 'https://qraivy.com', 'https://api.qraivy.com', 'https://preview.qraivy.com', 'https://admin-preview.qraivy.com', 'https://plan-preview.qraivy.com']);
  assert.deepEqual(cors.EXTRA_ALLOWED_ORIGINS, []);
  assert.equal(cors.isAllowedOrigin('https://' + STAGING_SITE), false, 'a staging website is not allowed on production');
  assert.equal(cors.isAllowedOrigin('https://www.qraivy.com'), true);
});

test('F. staging: its own preview website can be allowed by a setting, exactly and only that website', () => {
  const cors = corsWith('https://' + STAGING_SITE + ' , https://second.example');
  assert.deepEqual(cors.EXTRA_ALLOWED_ORIGINS, ['https://' + STAGING_SITE, 'https://second.example']);
  assert.equal(cors.isAllowedOrigin('https://' + STAGING_SITE), true);
  for (const no of ['http://' + STAGING_SITE, 'https://x.' + STAGING_SITE, 'https://' + STAGING_SITE + '.evil.test', 'https://evil.test']) assert.equal(cors.isAllowedOrigin(no), false, no);
  // malformed entries are dropped, never widened into a pattern
  assert.deepEqual(corsWith('*, https://*.example, http://plain.example, https://ok.example/path, https://ok.example, ,').EXTRA_ALLOWED_ORIGINS, ['https://ok.example']);
});

// ── G. Scope ───────────────────────────────────────────────────
test('G. the change is limited to routing: sign-in, the database schema, the design system and the forwarding rules are untouched', () => {
  const git = (...a) => execFileSync('git', a, { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  // (vercel.json: its forwarding rules are compared with production's in lpStagingFrontend.test.js)
  assert.equal(git('diff', '10ab8d5', '--stat', '--', 'frontend/public/js/api-base.js', 'frontend/public/qds', 'backend/src/middleware/adminMiddleware.js', 'backend/railway.toml', 'backend/src/data', ':(exclude)backend/src/data/dealImages.js').trim(), '');
  // QRAIVY Deals (recovered from preview/qraivy-deals-foundation): the Deal and DealPlacement
  // schema with its migration, and the Deals-only files below, are allowed to differ -- they
  // are pinned to the reviewed Deals commit 3319cc8 instead and tested in deal*.test.js.
  // (backend/src/data/dealImages.js later gained the staging image folder: dealsPreviewSafety.test.js)
  assert.equal(git('diff', '3319cc8', '--stat', '--', 'backend/prisma').trim(), '');
  // auth.js: the routing step's own commit left it alone. Its one later change (which
  // function verifies a token) is pinned line by line in lpStagingClerkAuth.test.js.
  assert.equal(git('diff', '10ab8d5', 'fa2c67c', '--stat', '--', 'backend/src/middleware/auth.js').trim(), '');
  assert.ok(EDITOR_PAGE.includes('data-clerk-publishable-key="pk_live_'), 'the sign-in key of the page is as it was');
});

test('G. what staging does not cover is written down: QR codes, stamp, loyalty, wallet, push', () => {
  const scope = CONFIG_JS.slice(CONFIG_JS.indexOf('STAGING TEST SCOPE'));
  for (const word of [/NOT in scope/, /QR codes/, /Stamp, loyalty card and reward pages/, /Apple and Google Wallet/, /Push notifications/]) assert.match(scope, word);
  assert.match(ROUTING_JS, /QR codes, stamp, loyalty and wallet flows are NOT part of it/);
  assert.match(read(SRC, 'config', 'publicOrigins.js'), /OUTSIDE the staging test scope/);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  const realError = console.error, realLog = console.log;
  for (const { name, fn } of tests) {
    console.error = () => {}; console.log = () => {};
    try { await fn(); pass++; realLog(`PASS  ${name}`); }
    catch (err) { fail++; realLog(`FAIL  ${name}`); realLog(`      ${String(err.message).split('\n').slice(0, 8).join('\n      ')}`); }
    finally { console.error = realError; console.log = realLog; }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
