// ============================================================
// lpStagingFrontend.test.js — frontend isolation of the Voice staging
// hostname (voice-preview.qraivy.com).
//
// The isolation is enforced by Vercel, not by page scripts: vercel.json
// carries redirects that apply ONLY to that hostname and are evaluated
// before static files and before the rewrites that forward /lp, /stamp,
// /wallet and /manifest to the production API.
//
// This file checks the rules against a MODEL of Vercel's documented
// routing order (redirects -> static files -> rewrites; `has` host
// conditions; path-to-regexp sources). The model is not Vercel: the same
// cases must be confirmed once against the first real preview deployment
// (see the report / backend/staging notes). What the model does prove is
// that the rules say what we intend, for every file the site ships, and
// that nothing changes for any other hostname.
//
// No test framework dependency. Run: node tests/lpStagingFrontend.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'frontend', 'public');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const VOICE_HOST = 'voice-preview.qraivy.com';
const CONFIG = JSON.parse(read(ROOT, 'vercel.json'));
const CONFIG_BEFORE = JSON.parse(git('show', 'a642477:vercel.json'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── A model of Vercel's routing for a static site ───────────────
function sourceRegex(source) {
  // "/lp/:path*" style: the named wildcard matches zero or more segments
  if (/:\w+\*/.test(source)) return new RegExp('^' + source.replace(/\/:\w+\*/, '(?:/(.*))?') + '$');
  return new RegExp('^' + source + '$');           // regex group style, e.g. "/((?!a|b).*)"
}
const hostMatches = (rule, host) => !rule.has || rule.has.every((h) => h.type === 'host' && new RegExp('^' + h.value + '$').test(host));
const fileExists = (pathname) => { const f = path.join(PUB, pathname === '/' ? 'index.html' : pathname); try { return f.startsWith(PUB) && fs.statSync(f).isFile(); } catch (e) { return false; } };
function route(config, host, pathname) {
  for (const r of config.redirects || []) if (hostMatches(r, host) && sourceRegex(r.source).test(pathname)) return { kind: 'redirect', to: r.destination };
  if (fileExists(pathname)) return { kind: 'file' };
  for (const r of config.rewrites || []) if (hostMatches(r, host) && sourceRegex(r.source).test(pathname)) return { kind: 'rewrite', to: r.destination.split('/').slice(0, 3).join('/') };
  return { kind: 'notfound' };
}
const headersFor = (config, host, pathname) => (config.headers || []).filter((r) => hostMatches(r, host) && sourceRegex(r.source).test(pathname)).flatMap((r) => r.headers.map((h) => h.key + ': ' + h.value));

// every file the site ships, as request paths
function walk(dir, base = '') { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base + '/' + e.name) : [base + '/' + e.name])); }
const ALL_FILES = walk(PUB);
const PAGES = ALL_FILES.filter((f) => f.endsWith('.html'));
const FORWARDED = ['/lp/some-page', '/lp', '/lp/some-page/extra', '/lp/push/some-page/count', '/lp/voice/preview/some-page', '/stamp/some-page/tok', '/stamp', '/wallet/pass', '/wallet', '/manifest/some-page', '/manifest', '/sw.js'];
const OTHER_HOSTS = ['www.qraivy.com', 'qraivy.com', 'preview.qraivy.com', 'admin-preview.qraivy.com', 'plan-preview.qraivy.com',
  'qrairy-ai-git-preview-lp-voice-social-team.vercel.app', 'qrairy-ai-9x8y7z-team.vercel.app', 'qrairy-ai.vercel.app', 'localhost'];
const EDITOR_PAGE = read(PUB, 'smart-qr-detail.html');
const LOGIN_PAGE = read(PUB, 'login.html');
const localAssets = (html) => [...new Set([...html.matchAll(/(?:src|href)="([^"#?$']+)[^"]*"/g)].map((m) => m[1]).filter((u) => !/^(https?:|\/\/|mailto:|data:|javascript:)/.test(u) && /\.(js|css|png|ico|svg|jpg|webp|json|woff2?)$/.test(u)))].map((u) => '/' + u.replace(/^\//, ''));

// ── A. The configuration itself ────────────────────────────────
test('A. both copies of vercel.json are identical, valid, and keep every existing rule', () => {
  assert.deepEqual(JSON.parse(read(PUB, 'vercel.json')), CONFIG);
  assert.equal(CONFIG.outputDirectory, CONFIG_BEFORE.outputDirectory);
  assert.deepEqual(CONFIG.rewrites, CONFIG_BEFORE.rewrites, 'the production rewrites are exactly as they were');
  assert.deepEqual(Object.keys(CONFIG).sort(), ['headers', 'outputDirectory', 'redirects', 'rewrites']);
  assert.equal(CONFIG_BEFORE.redirects, undefined);
  assert.equal(CONFIG_BEFORE.headers, undefined);
});

test('A. every new rule applies to the Voice staging hostname only', () => {
  const added = [...CONFIG.redirects, ...CONFIG.headers];
  assert.equal(added.length, 4);
  for (const rule of added) {
    assert.deepEqual(rule.has, [{ type: 'host', value: 'voice-preview\\.qraivy\\.com' }], JSON.stringify(rule.source));
    assert.ok(!rule.missing);
  }
  for (const r of CONFIG.redirects) assert.deepEqual([r.destination, r.permanent], ['/staging-blocked.html', false], 'a temporary redirect to a page on the same host');
  // the hostname condition matches that host and nothing that merely resembles it
  // the allowlist is exactly what the editor and sign-in pages load, plus the notice page and the browser's favicon request
  assert.equal(CONFIG.redirects[2].source, '/((?!smart-qr-detail\\.html|login\\.html|staging-blocked\\.html|smart-editor\\.js|dashboard-shell\\.css|js/|favicon|robots\\.txt).*)');
  for (const no of ['voice-preview.qraivy.com.evil.test', 'xvoice-preview.qraivy.com', 'voice-previewxqraivy.com', 'voice-preview.qraivyxcom', 'preview.qraivy.com', 'www.qraivy.com', 'voice-preview.qraivy.com.', 'a.voice-preview.qraivy.com']) assert.equal(hostMatches(CONFIG.redirects[0], no), false, no);
  assert.equal(hostMatches(CONFIG.redirects[0], VOICE_HOST), true);
});

// ── B. On the Voice staging host: what is blocked ──────────────
test('B. every page except the Voice editor and sign-in is redirected to the blocked notice', () => {
  const allowedPages = ['/smart-qr-detail.html', '/login.html', '/staging-blocked.html'];
  assert.ok(PAGES.length >= 27);
  for (const page of PAGES) {
    const r = route(CONFIG, VOICE_HOST, page);
    if (allowedPages.includes(page)) assert.deepEqual(r, { kind: 'file' }, page);
    else assert.deepEqual(r, { kind: 'redirect', to: '/staging-blocked.html' }, page);
  }
  // named explicitly: the areas that must be off
  for (const page of ['/dashboard.html', '/analytics.html', '/admin.html', '/admin-login.html', '/qr-manage.html', '/qr-free.html', '/qr-free-dashboard.html', '/qr-panel.html', '/stamp-scanner.html', '/loyalty-setup.html', '/wallet-pass-studio.html', '/editor.html', '/designer-saved.html', '/upgrade.html', '/pricing.html', '/index.html', '/claim-business.html', '/smart-demo.html', '/lp-preview.html', '/visit.html', '/support.html']) {
    assert.ok(PAGES.includes(page), page + ' exists');
    assert.equal(route(CONFIG, VOICE_HOST, page).kind, 'redirect', page);
  }
  assert.equal(route(CONFIG, VOICE_HOST, '/').kind, 'redirect', 'the home page too');
});

test('B. nothing on the Voice staging host is ever forwarded to the production API', () => {
  for (const p of FORWARDED) {
    assert.equal(route(CONFIG_BEFORE, 'www.qraivy.com', p).kind, p === '/sw.js' ? 'file' : 'rewrite', 'baseline ' + p);
    assert.deepEqual(route(CONFIG, VOICE_HOST, p), { kind: 'redirect', to: '/staging-blocked.html' }, p);
  }
  // the invariant, over every file the site ships and a large set of made-up paths
  const prefixes = ['', '/js', '/css', '/img', '/images', '/qds', '/favicon', '/favicon.ico', '/smart-qr-detail.html', '/login.html', '/staging-blocked.html', '/smart-editor.js', '/dashboard-shell.css', '/robots.txt', '/apple-touch-icon.png'];
  const tails = ['', '/', '/lp/x', '/../lp/x', '/..', '/../../stamp/x/y', '/lp', '/wallet/x', '/manifest/x', '/sw.js', 'x', '/x/../../lp/y', '%2F..%2Flp%2Fx', '/./lp/x', '//lp/x', '\\lp\\x', '?/lp/x', '#/lp/x', '/LP/x'];
  const made = prefixes.flatMap((a) => tails.map((b) => a + b)).concat(FORWARDED.flatMap((f) => [f, f + '/', f.toUpperCase(), '/x' + f, f + '/../x']));
  let rewrites = 0;
  for (const p of ALL_FILES.concat(made)) if (route(CONFIG, VOICE_HOST, p).kind === 'rewrite') { rewrites += 1; assert.fail('forwarded to production: ' + p); }
  assert.equal(rewrites, 0);
  assert.ok(ALL_FILES.length >= 150 && made.length >= 300, ALL_FILES.length + ' files, ' + made.length + ' made-up paths');
});

test('B. an allowed folder cannot be used to climb to another page or to a forwarded path', () => {
  for (const p of ['/js/../dashboard.html', '/js/x/../../analytics.html', '/js/../../admin.html', '/js/../lp/some-page', '/js/../../stamp/a/b', '/images/..', '/smart-qr-detail.html/../dashboard.html', '/login.html/../wallet/x', '/favicon/../manifest/x', '/js/x/../../sw.js', '/..', '/a/../b']) {
    assert.deepEqual(route(CONFIG, VOICE_HOST, p), { kind: 'redirect', to: '/staging-blocked.html' }, p);
  }
  // close relatives of allowed names are not the allowed things
  // folders the editor does not use are not served at all, and no page below the root is
  for (const p of ALL_FILES.filter((f) => /^\/(css|img|images|qds|qr)\//.test(f))) assert.equal(route(CONFIG, VOICE_HOST, p).kind, 'redirect', p);
  for (const p of ['/qds/playground.html', '/qr/free.html', '/js/anything.html', '/js/sub/page.html', '/favicon/x.html']) assert.equal(route(CONFIG, VOICE_HOST, p).kind, 'redirect', p);
  for (const p of ['/js', '/css', '/qds', '/jsx/x.js', '/JS/lp-routing.js', '/Smart-QR-Detail.html', '/LOGIN.html', '/dashboard-shell.cssx/../x', '/smart-editor', '/smart-qr-detail', '/login']) assert.equal(route(CONFIG, VOICE_HOST, p).kind, 'redirect', p);
  // a name that only starts like an allowed one leads nowhere: no file, and no production rule
  for (const p of ['/login.html.bak', '/smart-qr-detail.html-old', '/favicon-does-not-exist.png', '/robots.txt.old', '/js/does-not-exist.js']) assert.deepEqual(route(CONFIG, VOICE_HOST, p), { kind: 'notfound' }, p);
  // everything actually served on the Voice staging host, in full
  const served = ALL_FILES.filter((f) => route(CONFIG, VOICE_HOST, f).kind === 'file');
  assert.deepEqual(served.filter((f) => !f.startsWith('/js/')).sort(), ['/dashboard-shell.css', '/favicon-16x16.png', '/favicon-32x32.png', '/favicon.ico', '/favicon.png', '/login.html', '/robots.txt', '/smart-editor.js', '/smart-qr-detail.html', '/staging-blocked.html']);
  assert.ok(served.filter((f) => f.startsWith('/js/')).every((f) => f.endsWith('.js')), 'from js/ only scripts');
});

test('B. root-level scripts and data of other pages are blocked; only what the editor needs is served', () => {
  for (const p of ['/app.js', '/onboarding.js', '/sidebar.js', '/sidebar.css', '/styles.css', '/billing.css', '/analytics-page.css', '/manage-page.css', '/onboarding.css', '/manifest.json', '/sitemap.xml', '/sw.js', '/vercel.json']) {
    if (fileExists(p)) assert.equal(route(CONFIG, VOICE_HOST, p).kind, 'redirect', p);
  }
  for (const p of ALL_FILES.filter((f) => f.startsWith('/qr/'))) assert.equal(route(CONFIG, VOICE_HOST, p).kind, 'redirect', p);
});

// ── C. On the Voice staging host: what still works ─────────────
test('C. the Voice editor, the sign-in page and every local asset they reference are served', () => {
  const needed = ['/smart-qr-detail.html', '/login.html', ...localAssets(EDITOR_PAGE), ...localAssets(LOGIN_PAGE)];
  for (const must of ['/js/staging-config.js', '/js/lp-routing.js', '/js/voice-greetings.js', '/js/voice-greeting-editor.js', '/smart-editor.js', '/dashboard-shell.css', '/js/session.js', '/js/landing-page-renderer.js', '/js/landing-section-registry.js', '/js/smart-block-editor.js']) assert.ok(needed.includes(must), must + ' is referenced by the editor page');
  for (const p of needed) assert.deepEqual(route(CONFIG, VOICE_HOST, p), { kind: 'file' }, p);
  // with a query string the path is the same path
  assert.deepEqual(route(CONFIG, VOICE_HOST, '/smart-qr-detail.html'), { kind: 'file' });
});

test('C. the blocked notice is reachable (no redirect loop), static, and contacts nothing', () => {
  assert.deepEqual(route(CONFIG, VOICE_HOST, '/staging-blocked.html'), { kind: 'file' });
  const page = read(PUB, 'staging-blocked.html');
  assert.ok(!/<script|<link|<img|<iframe|<form|https?:\/\/|fetch\(|src=/i.test(page), 'no script, no outside resource, no request of any kind');
  assert.match(page, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(page, /Nothing was sent to the live QRAIVY service\./);
});

test('C. the Voice staging host is marked not to be indexed or cached; no other host gets those headers', () => {
  for (const p of ['/smart-qr-detail.html', '/js/lp-routing.js', '/dashboard.html', '/']) assert.deepEqual(headersFor(CONFIG, VOICE_HOST, p), ['X-Robots-Tag: noindex, nofollow', 'Cache-Control: no-store'], p);
  for (const host of OTHER_HOSTS) assert.deepEqual(headersFor(CONFIG, host, '/dashboard.html'), [], host);
});

// ── D. Every other hostname is exactly as before ───────────────
test('D. production and every existing or future preview hostname: routing is identical to before, for every file and every forwarded path', () => {
  const paths = ALL_FILES.concat(FORWARDED, ['/', '/js/../dashboard.html', '/does-not-exist', '/lp/x/y/z', '/staging-blocked.html']);
  let compared = 0;
  for (const host of OTHER_HOSTS) {
    for (const p of paths) {
      // the one new file is the only difference a non-staging host can see: it exists now
      const before = p === '/staging-blocked.html' ? { kind: 'file' } : route(CONFIG_BEFORE, host, p);
      assert.deepEqual(route(CONFIG, host, p), before, host + ' ' + p);
      compared += 1;
    }
    assert.equal(route(CONFIG, host, '/dashboard.html').kind, 'file', host);
    assert.deepEqual(route(CONFIG, host, '/lp/some-page'), { kind: 'rewrite', to: 'https://api.qraivy.com' }, host + ': still forwarded, as before');
  }
  assert.ok(compared > 1200, String(compared));
});

// ── E. Not by page scripts alone ───────────────────────────────
test('E. three independent layers stand between the Voice staging host and the production API', () => {
  // 1. Vercel (server): pages and forwarded paths are redirected -- sections B and C.
  // 2. The production API (server) does not accept that website as an origin.
  const { STATIC_ALLOWED_ORIGINS, isAllowedOrigin } = require(path.join(__dirname, '..', 'src', 'utils', 'corsOriginPolicy.js'));
  assert.ok(!STATIC_ALLOWED_ORIGINS.includes('https://' + VOICE_HOST));
  assert.equal(isAllowedOrigin('https://' + VOICE_HOST), false, 'production refuses browser requests from the Voice staging site');
  // 3. The editor's own switch (client): default deny.
  const routing = (hostname, config) => { const window = { location: { hostname, href: 'https://' + hostname + '/smart-qr-detail.html' }, fetch() {}, console: { info() {}, error() {} }, QRAIVY_STAGING_CONFIG: config };
    vm.runInNewContext(read(PUB, 'js', 'lp-routing.js'), { window, document: { body: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {} }), addEventListener() {} }, URL, Promise, TypeError, Error, Array, String }); return window.QRAIVY_ROUTING; };
  assert.equal(routing(VOICE_HOST, { hosts: [], api: '' }).mode, 'unknown-host', 'with nothing configured the editor on that host is blocked');
  assert.equal(routing(VOICE_HOST, { hosts: [VOICE_HOST], api: '' }).mode, 'staging-error');
  const ok = routing(VOICE_HOST, { hosts: [VOICE_HOST], api: 'https://voice-api.example' });
  assert.deepEqual([ok.mode, ok.url('https://api.qraivy.com/lp/x')], ['staging', 'https://voice-api.example/lp/x']);
});

test('E. unknown Vercel preview hostnames: the editor is blocked there by its own switch; the server-side rules do not cover them', () => {
  const routing = (hostname) => { const window = { location: { hostname, href: 'https://' + hostname + '/smart-qr-detail.html' }, fetch() {}, console: { info() {}, error() {} } };
    vm.runInNewContext(read(PUB, 'js', 'staging-config.js'), { window });
    vm.runInNewContext(read(PUB, 'js', 'lp-routing.js'), { window, document: { body: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {} }), addEventListener() {} }, URL, Promise, TypeError, Error, Array, String }); return window.QRAIVY_ROUTING; };
  for (const host of ['qrairy-ai-git-preview-lp-voice-social-team.vercel.app', 'qrairy-ai-9x8y7z-team.vercel.app']) {
    assert.equal(routing(host).mode, 'unknown-host', host);
    assert.equal(routing(host).url('https://api.qraivy.com/lp'), 'about:blank#qraivy-api-blocked');
    // KNOWN LIMITATION, stated on purpose: vercel.json has no rule for *.vercel.app hosts,
    // so on such a hostname other pages are served and /lp is forwarded exactly as on any
    // preview today. Closing that needs a Vercel project setting (Deployment Protection).
    assert.equal(route(CONFIG, host, '/dashboard.html').kind, 'file');
    assert.equal(route(CONFIG, host, '/lp/some-page').kind, 'rewrite');
  }
});

// ── F. Configuration stays consistent ──────────────────────────
test('F. a hostname can only be listed as staging if Vercel isolates it', () => {
  const window = {};
  vm.runInNewContext(read(PUB, 'js', 'staging-config.js'), { window });
  const hosts = JSON.parse(JSON.stringify(window.QRAIVY_STAGING_CONFIG.hosts));
  for (const h of hosts) assert.ok(hostMatches(CONFIG.redirects[0], h), h + ' is listed in staging-config.js but has no isolation rule in vercel.json');
  // the rule this test enforces, shown failing for a host that has no isolation rule
  assert.equal(hostMatches(CONFIG.redirects[0], 'some-other-preview.qraivy.com'), false);
  assert.equal(hostMatches(CONFIG.redirects[0], VOICE_HOST), true);
});

test('F. after sign-in a staging host stays on itself; production and other hosts behave as before', () => {
  // the decision, taken from the page as written
  const m = LOGIN_PAGE.match(/const _stagingHosts = [\s\S]*?const _base = [^\n]*\n/);
  assert.ok(m, 'the sign-in page computes its return address');
  const baseFor = (hostname, config) => vm.runInNewContext('(function(){' + m[0] + 'return _base;})()', { window: { location: { hostname, origin: 'https://' + hostname }, QRAIVY_STAGING_CONFIG: config }, Array });
  for (const host of ['www.qraivy.com', 'qraivy.com', 'preview.qraivy.com', 'admin-preview.qraivy.com', 'qrairy-ai-9x8y7z-team.vercel.app']) {
    for (const config of [undefined, { hosts: [], api: '' }, { hosts: [VOICE_HOST], api: 'https://voice-api.example' }, 'junk', { hosts: 'nope' }]) assert.equal(baseFor(host, config), 'https://www.qraivy.com/', host);
  }
  assert.equal(baseFor('plan-preview.qraivy.com', undefined), 'https://plan-preview.qraivy.com/');
  assert.equal(baseFor(VOICE_HOST, { hosts: [VOICE_HOST], api: 'https://voice-api.example' }), 'https://' + VOICE_HOST + '/', 'the session is not carried over to the production site');
  assert.ok(LOGIN_PAGE.indexOf('<script src="js/staging-config.js"></script>') !== -1 && LOGIN_PAGE.indexOf('<script src="js/staging-config.js"></script>') < LOGIN_PAGE.indexOf('async function initClerk()'));
  // the sign-in page calls no QRAIVY API itself
  assert.ok(!/api\.qraivy\.com/.test(LOGIN_PAGE));
});

test('F. frontend isolation changed no editor code, no backend code, no schema and no design-system file', () => {
  // Compared with the commit before this step. Stated as "these stayed the
  // same" rather than "only these changed", so it keeps holding as the
  // branch moves on (js/staging-config.js is expected to receive its two
  // values later and is not part of this comparison).
  const scripts = fs.readdirSync(path.join(PUB, 'js')).filter((f) => f !== 'staging-config.js').map((f) => 'frontend/public/js/' + f);
  assert.equal(git('diff', 'a642477', '--stat', '--', ...scripts, 'frontend/public/smart-qr-detail.html', 'frontend/public/dashboard-shell.css', 'frontend/public/qds', 'backend/prisma', 'backend/railway.toml').trim(), '');
  // smart-editor.js: unchanged by this step's own commit. It was changed later, on purpose,
  // by the publish-safety fix (one save per click, no publishing before the page has loaded;
  // see lpEditorPublishSafety.test.js).
  assert.equal(git('diff', 'a642477', '9572bed', '--stat', '--', 'frontend/public/smart-editor.js').trim(), '');
  // Backend code: this step's own commit changed none. (Later steps do change it:
  // staging sign-in verification, see lpStagingClerkAuth.test.js.)
  assert.equal(git('diff', 'a642477', '9572bed', '--stat', '--', 'backend/src').trim(), '');
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${String(err.message).split('\n').slice(0, 8).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
