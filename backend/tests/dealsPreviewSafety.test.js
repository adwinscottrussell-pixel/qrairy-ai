// ============================================================
// dealsPreviewSafety.test.js — the three safeguards that let QRAIVY Deals
// run on an isolated staging backend (deals-preview) without touching
// production:
//
//   A. staging gate: exactly the owner Deals routes are allowed, as
//      "user" (signed in AND on the allowlist); everything else under
//      /deals is still refused; the original routes are unchanged.
//   B. image folder: production keeps qraivy-deals; staging uses only its
//      own DEAL_IMAGE_FOLDER, refuses uploads without one, and does not
//      start with an unsafe one.
//   C. Deal Builder routing: production API only on qraivy.com, the Deals
//      preview API only on deals-preview.qraivy.com, no request anywhere
//      else (Vercel previews); no other page's routing changed.
//
// Run: node tests/dealsPreviewSafety.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend');
const PUB = path.join(ROOT, 'frontend', 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }

// ── A. Staging gate ─────────────────────────────────────────────
const { ALLOWED_ROUTES, matchRoute, createStagingGate } = require('../src/middleware/stagingGate');
const ALICE = 'user_aliceAAAAAAAA', MALLORY = 'user_malloryMMMMMM';

// Phase 5.5B adds one public, read-only route: the welcome screen. It is set
// aside here so the guarantees about the original routes stay exactly as they were.
const WELCOME_ROUTE = 'GET public ^\\/lp\\/welcome\\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}$';
const BASE_ROUTES = ALLOWED_ROUTES.filter((r) => `${r.method} ${r.access} ${r.path.source}` !== WELCOME_ROUTE);

test('A. the original six staging routes are exactly as before', () => {
  assert.equal(ALLOWED_ROUTES.length - BASE_ROUTES.length, 1, 'exactly one welcome-screen route on top');
  assert.deepEqual(BASE_ROUTES.slice(0, 6).map((r) => `${r.method} ${r.access} ${r.path.source}`), [
    'GET public ^\\/health$',
    'GET public ^\\/sw\\.js$',
    'GET public ^\\/lp\\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}$',
    'GET owner ^\\/api\\/lp\\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}$',
    'POST user ^\\/lp$',
    'POST user ^\\/lp\\/voice\\/preview\\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}$',
  ]);
});

test('A. exactly the owner Deals routes are added, all "user" (sign-in + allowlist)', () => {
  const deals = BASE_ROUTES.slice(6);
  assert.equal(BASE_ROUTES.length, 18);
  assert.deepEqual(deals.map((r) => r.method + ' ' + r.access), ['GET user', 'POST user', 'GET user', 'GET user', 'PUT user', 'POST user', 'POST user', 'DELETE user', 'POST user', 'GET user', 'POST user', 'POST user']);
  const allowed = [['GET', '/deals'], ['POST', '/deals'], ['GET', '/deals/pages'], ['GET', '/deals/cmabc123'], ['PUT', '/deals/cmabc123/draft'],
    ['POST', '/deals/cmabc123/publish'], ['POST', '/deals/cmabc123/archive'], ['DELETE', '/deals/cmabc123'], ['POST', '/deals/cmabc123/image'],
    ['GET', '/deals/cmabc123/placements'], ['POST', '/deals/cmabc123/placements'], ['POST', '/deals/cmabc123/placements/pl1/publish'], ['POST', '/deals/cmabc123/placements/pl1/archive']];
  for (const [m, p] of allowed) { const r = matchRoute(m, p); assert.ok(r && r.access === 'user', m + ' ' + p); }
  // the gate matches every route of routes/dealRoutes.js, and only those
  const routes = read('backend/src/routes/dealRoutes.js');
  const declared = [...routes.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)].map((x) => x[1].toUpperCase() + ' ' + x[2]);
  assert.deepEqual(declared.sort(), ['DELETE /:id', 'GET /', 'GET /pages', 'GET /access', 'GET /:id', 'POST /', 'POST /:id/archive', 'POST /:id/image', 'POST /:id/publish', 'PUT /:id/draft',
    'GET /:id/placements', 'POST /:id/placements', 'POST /:id/placements/:placementId/publish', 'POST /:id/placements/:placementId/archive'].sort());
});

test('A. anything else under /deals is still refused', () => {
  const denied = [['PATCH', '/deals/x'], ['DELETE', '/deals/x/placements'], ['GET', '/deals/x/placements/p1'], ['POST', '/deals/x/placements/p1/delete'], ['GET', '/deals/x/draft'], ['PUT', '/deals/pages'],
    ['DELETE', '/deals'], ['PUT', '/deals'], ['GET', '/deals/x/y'], ['GET', '/deals/' + 'a'.repeat(65)], ['GET', '/deals/a.b'],
    ['GET', '/dealsx'], ['GET', '/api/deals'], ['GET', '/deals/'], ['POST', '/deals/x/image/extra']];
  for (const [m, p] of denied) assert.equal(matchRoute(m, p), null, m + ' ' + p);
});

const mkRes = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });
async function through(method, url, user) {
  const authenticate = (req, res, next) => { const h = req.headers.authorization || ''; if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized.' }); req.userId = h.slice(7); return next(); };
  const gate = createStagingGate({ allowedUserIds: [ALICE], authenticate, findPageOwner: async () => null });
  const res = mkRes(); let passed = false;
  await gate({ method, path: url, headers: user ? { authorization: 'Bearer ' + user } : {} }, res, () => { passed = true; });
  await new Promise((r) => setImmediate(r));
  return { passed, status: res.statusCode, code: res.body && res.body.code };
}

test('A. a Deals request needs a sign-in, then an allowlisted account', async () => {
  for (const [m, p] of [['GET', '/deals'], ['POST', '/deals/cm1/publish'], ['POST', '/deals/cm1/image'], ['DELETE', '/deals/cm1']]) {
    assert.deepEqual(await through(m, p, null), { passed: false, status: 401, code: undefined }, 'signed out: ' + m + ' ' + p);
    assert.deepEqual(await through(m, p, MALLORY), { passed: false, status: 403, code: 'staging_account' }, 'not allowlisted: ' + m + ' ' + p);
    assert.equal((await through(m, p, ALICE)).passed, true, 'allowlisted: ' + m + ' ' + p);
  }
  for (const [m, p] of [['GET', '/deals/pages'], ['POST', '/deals/cm1/placements'], ['POST', '/deals/cm1/placements/pl1/publish']]) {
    assert.equal((await through(m, p, null)).status, 401, 'signed out: ' + m + ' ' + p);
    assert.equal((await through(m, p, MALLORY)).code, 'staging_account', 'not allowlisted: ' + m + ' ' + p);
    assert.equal((await through(m, p, ALICE)).passed, true, 'allowlisted: ' + m + ' ' + p);
  }
  assert.deepEqual(await through('GET', '/deals/cm1/placements/pl1', ALICE), { passed: false, status: 404, code: 'staging_scope' });
});

test('A. the route itself still checks ownership: every deal is looked up by its owner', () => {
  const svc = read('backend/src/services/dealService.js');
  assert.match(svc, /async function findDealOrThrow\(ownerUserId, dealId[^)]*\)/);
  const ctl = read('backend/src/controllers/dealController.js');
  for (const fn of ['getDealState', 'saveDealDraft', 'publishDeal', 'archiveDeal', 'deleteDeal']) assert.ok(ctl.includes('dealService.' + fn + '(req.userId'), fn + ' is called with the signed-in account');
});

// ── B. Image folder ─────────────────────────────────────────────
const { loadStagingPolicy, PRODUCTION_STORAGE_FOLDERS } = require('../src/config/stagingPolicy');
const { DEAL_IMAGE_FOLDER, dealImageFolderFor } = require('../src/data/dealImages');
const PEM = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
const STAGING = {
  APP_ENV: 'staging', STAGING_ALLOWED_USER_IDS: ALICE, STAGING_VOICE_RECORDING_CEILING: '1', VOICE_AUDIO_FOLDER: 'qraivy-voices-deals-staging',
  CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's', CLERK_JWT_KEY: PEM,
  STAGING_CLERK_ISSUER: 'https://clerk.qraivy.com', STAGING_CLERK_AUTHORIZED_PARTIES: 'https://deals-preview.qraivy.com',
};

test('B. production: no policy, deal images stay in qraivy-deals', () => {
  assert.equal(loadStagingPolicy({}), null);
  assert.equal(loadStagingPolicy({ DEAL_IMAGE_FOLDER: 'anything' }), null, 'the setting means nothing in production');
  assert.equal(DEAL_IMAGE_FOLDER, 'qraivy-deals');
  assert.equal(dealImageFolderFor(null), 'qraivy-deals');
  assert.ok(PRODUCTION_STORAGE_FOLDERS.includes('qraivy-deals'));
});

test('B. staging with its own folder uses that folder', () => {
  const p = loadStagingPolicy({ ...STAGING, DEAL_IMAGE_FOLDER: 'qraivy-deals-staging' });
  assert.equal(p.dealImageFolder, 'qraivy-deals-staging');
  assert.equal(dealImageFolderFor(p), 'qraivy-deals-staging');
});

test('B. staging without the setting starts, but has no deal image folder (never production\'s)', () => {
  const p = loadStagingPolicy(STAGING);
  assert.equal(p.dealImageFolder, null);
  assert.equal(dealImageFolderFor(p), null);
});

test('B. staging with an unsafe folder does not start', () => {
  const bad = {
    'qraivy-deals': /production folder/, 'qraivy-voices': /production folder/, 'qraivy-logos': /production folder/,
    'qraivy-deals-test': /must contain the word "staging"/, 'Qraivy-Deals-Staging': /lowercase/, 'deals/staging': /lowercase/,
    'qraivy-voices-deals-staging': /must differ from VOICE_AUDIO_FOLDER/,
  };
  for (const [folder, why] of Object.entries(bad)) {
    assert.throws(() => loadStagingPolicy({ ...STAGING, DEAL_IMAGE_FOLDER: folder }), (e) => /refused to start/.test(e.message) && why.test(e.message) && !e.message.includes(PEM.slice(30, 60)), folder);
  }
});

// The services read the folder once, at load, from the real environment: run them in a child process.
function serverView(env) {
  const script = `
    const up = require('./src/services/dealImageUploadService');
    const svc = require('./src/services/dealService');
    const { ACTIVE_DEAL_IMAGE_FOLDER } = require('./src/data/dealImages');
    const u = (f) => ['https://res.cloudinary.com/demo/image/upload/v1/' + f + '/a.jpg', f + '/a'];
    console.log(JSON.stringify({ folder: ACTIVE_DEAL_IMAGE_FOLDER, storage: up.isDealImageStorageConfigured(),
      trustsProd: svc.isTrustedDealImage(...u('qraivy-deals')), trustsStaging: svc.isTrustedDealImage(...u('qraivy-deals-staging')) }));`;
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(APP_ENV|STAGING_|DEAL_IMAGE_FOLDER|VOICE_AUDIO_FOLDER|CLERK_|CLOUDINARY_|DATABASE_URL)/.test(k)));
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: BACKEND, env: { ...clean, DATABASE_URL: 'postgresql://u:p@localhost:5432/none', ...env }, encoding: 'utf8' }).trim().split('\n').pop());
}

test('B. production server: uploads go to and are trusted from qraivy-deals only', () => {
  assert.deepEqual(serverView({ CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }),
    { folder: 'qraivy-deals', storage: true, trustsProd: true, trustsStaging: false });
});

test('B. staging server with DEAL_IMAGE_FOLDER: uploads go to and are trusted from that folder only', () => {
  assert.deepEqual(serverView({ ...STAGING, DEAL_IMAGE_FOLDER: 'qraivy-deals-staging' }),
    { folder: 'qraivy-deals-staging', storage: true, trustsProd: false, trustsStaging: true });
});

test('B. staging server without DEAL_IMAGE_FOLDER: no upload storage, no uploaded image trusted', () => {
  assert.deepEqual(serverView(STAGING), { folder: null, storage: false, trustsProd: false, trustsStaging: false });
  const ctl = read('backend/src/controllers/dealController.js');
  assert.match(ctl, /if \(!isDealImageStorageConfigured\(\)\) \{\n\s+return res\.status\(503\)/, 'the upload route answers 503 without storage');
});

test('B. a staging server with an unsafe folder refuses to load at all', () => {
  assert.throws(() => serverView({ ...STAGING, DEAL_IMAGE_FOLDER: 'qraivy-deals' }), /production folder/);
});

// ── C. Deal Builder routing ─────────────────────────────────────
function routingFor(hostname, origin, localApi) {
  const ctx = { window: { location: { hostname, origin: origin || 'https://' + hostname } }, URL };
  if (localApi !== undefined) ctx.window.QRAIVY_DEALS_LOCAL_API = localApi;
  vm.runInNewContext(read('frontend/public/js/deals-routing.js'), ctx);
  return { routing: ctx.window.QRAIVY_DEALS_ROUTING, lib: ctx.window.QraivyDealsRouting };
}
const PRODUCTION_HOSTS = ['api.qraivy.com', 'www.qraivy.com', 'qraivy.com', 'pages.qraivy.com', 'qrairy-ai-production.up.railway.app'];

test('C. production sites use the production API, exactly as before', () => {
  for (const h of ['www.qraivy.com', 'qraivy.com', 'WWW.QRAIVY.COM']) {
    assert.deepEqual({ ...routingFor(h).routing }, { mode: 'production', api: 'https://api.qraivy.com', blocked: false }, h);
  }
});

test('C. deals-preview.qraivy.com uses only the isolated Deals API, never production', () => {
  const { routing, lib } = routingFor('deals-preview.qraivy.com');
  assert.equal(routing.mode, 'deals-preview');
  assert.equal(routing.blocked, false);
  const u = new URL(routing.api);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.origin, routing.api, 'an origin, no path');
  assert.ok(!PRODUCTION_HOSTS.includes(u.hostname), 'not a production host');
  assert.equal(routing.api, lib.DEALS_PREVIEW_API);
  assert.equal(lib.DEALS_PREVIEW_HOST, 'deals-preview.qraivy.com');
});

test('C. every other host is blocked: no API at all', () => {
  for (const h of ['qraivy-ai-git-preview-q-abc123-adwinscottrussell-5957s-projects.vercel.app', 'qraivy-xyz.vercel.app', 'preview.qraivy.com',
    'admin-preview.qraivy.com', 'plan-preview.qraivy.com', 'voice-preview.qraivy.com', 'deals-preview.qraivy.com.evil.com', 'evil.com', '']) {
    assert.deepEqual({ ...routingFor(h).routing }, { mode: 'unknown-host', api: '', blocked: true }, h || '(empty)');
  }
});

test('C. customer pages are linked where customers see them -- never the admin site, never production from a preview', () => {
  const at = (h, o, l) => { const ctx = { window: { location: { hostname: h, origin: o || 'https://' + h } }, URL }; if (l !== undefined) ctx.window.QRAIVY_DEALS_LOCAL_API = l; vm.runInNewContext(read('frontend/public/js/deals-routing.js'), ctx); return ctx.window.QRAIVY_DEALS_PAGE_ORIGIN; };
  for (const h of ['www.qraivy.com', 'qraivy.com']) assert.equal(at(h), 'https://www.qraivy.com', h);
  const preview = at('deals-preview.qraivy.com');
  assert.equal(preview, 'https://qraivy-deals-api-deals-preview.up.railway.app', 'the isolated API serves the preview pages');
  assert.ok(!PRODUCTION_HOSTS.includes(new URL(preview).hostname) && new URL(preview).hostname !== 'deals-preview.qraivy.com', 'not production, not the admin site (its /lp goes to production)');
  assert.equal(at('localhost', 'http://localhost:5178', 'http://localhost:5190'), 'http://localhost:5190');
  for (const h of ['preview.qraivy.com', 'qraivy-xyz.vercel.app', 'evil.com', '']) assert.equal(at(h), '', h || '(empty)');
  assert.equal(at('localhost', 'http://localhost:5178', 'https://api.qraivy.com'), '', 'blocked local: no links');
});

test('C. a local test server is used only when it is on this machine', () => {
  assert.deepEqual({ ...routingFor('127.0.0.1', 'http://127.0.0.1:5190').routing }, { mode: 'local', api: 'http://127.0.0.1:5190', blocked: false });
  assert.deepEqual({ ...routingFor('localhost', 'http://localhost:5178', 'http://localhost:5190/').routing }, { mode: 'local', api: 'http://localhost:5190', blocked: false });
  assert.deepEqual({ ...routingFor('localhost', 'http://localhost:5178', 'https://api.qraivy.com').routing }, { mode: 'local', api: '', blocked: true });
});

test('C. the Deal Builder takes its API only from this routing, and sends nothing when blocked', () => {
  const page = read('frontend/public/deals.html');
  assert.ok(page.includes('<script src="js/deals-routing.js"></script>'));
  assert.ok(!page.includes('js/api-base.js'), 'no longer uses the shared resolver (which falls back to production)');
  assert.ok(!page.includes('QRAIVY_API_BASE'));
  assert.equal((page.match(/\bfetch\(/g) || []).length, 1, 'exactly one fetch call site');
  const api = page.slice(page.indexOf('async function api('), page.indexOf('res = await fetch(API_BASE + path, opts);'));
  assert.ok(api.includes('if (ROUTING.blocked || !API_BASE) throw new ApiError(-1);'), 'the blocked check comes before the request');
  assert.match(page, /var ROUTING = window\.QRAIVY_DEALS_ROUTING \|\| \{ blocked: true, api: '' \};/, 'no routing = blocked');
  assert.ok(page.includes("if (err.status === -1) return t('e_routing');"));
  assert.equal((page.match(/e_routing: '/g) || []).length, 2, 'EN and DE message');
  assert.ok(page.includes("routingNotice();"));
});

test('C. the Deal Builder routing, run with the page: a blocked host never calls fetch', async () => {
  const page = read('frontend/public/deals.html');
  const start = page.indexOf('  var ROUTING = window.QRAIVY_DEALS_ROUTING');
  const end = page.indexOf('  // The server\'s own message is shown only');
  let fetched = 0;
  const ctx = { window: { QRAIVY_DEALS_ROUTING: { mode: 'unknown-host', api: '', blocked: true }, Clerk: { session: { getToken: async () => 't' } }, location: {} }, fetch: async () => { fetched++; return { status: 200, ok: true, json: async () => ({}) }; }, FormData: function () {} };
  const run = vm.runInNewContext('(function(){' + page.slice(start, end) + '\nreturn { api: api, ApiError: ApiError };})()', ctx);
  await assert.rejects(run.api('GET', '/deals'), (e) => e instanceof run.ApiError && e.status === -1);
  assert.equal(fetched, 0);
  ctx.window.QRAIVY_DEALS_ROUTING = { mode: 'deals-preview', api: 'https://qraivy-deals-api-deals-preview.up.railway.app', blocked: false };
  const ok = vm.runInNewContext('(function(){' + page.slice(start, end) + '\nreturn { api: api };})()', ctx);
  await ok.api('GET', '/deals');
  assert.equal(fetched, 1);
});

test('C. no other page\'s routing changed: api-base.js, lp-routing.js and staging-config.js are production\'s', () => {
  const changed = execFileSync('git', ['diff', '4ac9e84', '--name-only', '--', 'frontend/public/js/api-base.js', 'frontend/public/js/lp-routing.js', 'frontend/public/js/staging-config.js',
    'frontend/public/smart-editor.js', 'frontend/public/index.html',
    'backend/src/utils/corsOriginPolicy.js', 'backend/src/middleware/auth.js', 'backend/src/utils/clerkVerify.js', 'backend/src/config/publicOrigins.js'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(changed, '');
  // js/voice-greeting-editor.js: production's, apart from Phase 0 (S4) sending the sign-in with the
  // page record request (tests/helpers/phase0Revert.js undoes exactly that).
  assert.equal(require('./helpers/phase0Revert').revertVoiceEditor0(read('frontend/public/js/voice-greeting-editor.js')),
    execFileSync('git', ['show', '4ac9e84:frontend/public/js/voice-greeting-editor.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replace(/\r\n/g, '\n'));
  // dashboard.html: the Admin sidebar's logo and menu (Phase 5.5A, tests/adminNavShell.test.js)
  // are the only change since then; everything else is byte for byte production's.
  const withoutMenu = (s) => { s = s.replace(/\r\n/g, '\n'); const a = s.indexOf('<div id="sidebar">'), b = s.indexOf('  </nav>', a); assert.ok(a !== -1 && b > a); return s.slice(0, a) + s.slice(b); };
  assert.equal(withoutMenu(read('frontend/public/dashboard.html')), withoutMenu(execFileSync('git', ['show', '4ac9e84:frontend/public/dashboard.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })));
  for (const p of ['dashboard.html', 'index.html']) assert.ok(read('frontend/public/' + p).includes('<script src="js/api-base.js"></script>'), p + ' still uses api-base.js');
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log('PASS  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
