// ============================================================
// lpStagingGate.test.js — the staging-only security gate.
//
// Proves two things:
//   - a staging server (APP_ENV=staging) fails closed: it does not start
//     when misconfigured, answers only the handful of routes it exists
//     for, only to allowlisted accounts, records audio only within a
//     ceiling kept in its database, and stores it only in its own folder
//   - production is unchanged: none of this is loaded, mounted or
//     consulted when APP_ENV is not "staging"
//
// What is real: config/stagingPolicy.js, middleware/stagingGate.js,
// services/stagingVoiceBudget.js, the auth middleware, the route table,
// the voice services and preview endpoint, and src/index.js itself,
// which is started as a separate process in production, staging and
// misconfigured-staging settings. What is replaced: the database
// (in-memory) and the two outside services at their network edge.
// Every id and hostname below is made up for the test.
//
// No test framework dependency. Run: node tests/lpStagingGate.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const https = require('https');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const SRC = path.join(__dirname, '..', 'src');
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const resolveSrc = (...p) => require.resolve(path.join(SRC, ...p));

const ALICE = 'user_2aliceTESTaccount0001', BOB = 'user_2bobTESTaccount00002', MALLORY = 'user_2malloryREALcustomer9';
const STAGING_ENV = {
  APP_ENV: 'staging',
  LP_PUBLIC_API_ORIGIN: 'https://voice-api.example', LP_PUBLIC_PAGE_ORIGIN: 'https://voice-api.example',
  STAGING_ALLOWED_USER_IDS: `${ALICE}, ${BOB}`,
  STAGING_VOICE_RECORDING_CEILING: '25',
  VOICE_AUDIO_FOLDER: 'qraivy-voices-staging',
  CLOUDINARY_CLOUD_NAME: 'staging-cloud-example',
  // Sign-in is verified with a public key; a staging server holds no Clerk secret
  // (covered in lpStagingClerkAuth.test.js). The empty value removes boot()'s placeholder.
  CLERK_SECRET_KEY: '',
  CLERK_JWT_KEY: require('crypto').generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).publicKey,
  STAGING_CLERK_ISSUER: 'https://clerk.voice-staging.example',
  STAGING_CLERK_AUTHORIZED_PARTIES: 'https://voice-preview.voice-staging.example',
};

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const { loadStagingPolicy, FORBIDDEN_SETTINGS, PRODUCTION_STORAGE_FOLDERS } = require(resolveSrc('config', 'stagingPolicy.js'));
const { createStagingGate, matchRoute, ALLOWED_ROUTES } = require(resolveSrc('middleware', 'stagingGate.js'));
const { takeUnit, reserveRecording, StagingCeilingError } = require(resolveSrc('services', 'stagingVoiceBudget.js'));
const { requireAuth } = require(resolveSrc('middleware', 'auth.js'));

// ── A. Staging settings ────────────────────────────────────────
test('A. production: no policy, nothing validated, whatever else is set', () => {
  for (const env of [{}, { APP_ENV: 'production' }, { NODE_ENV: 'production' }, { APP_ENV: '' },
    { STAGING_ALLOWED_USER_IDS: 'garbage', STAGING_VOICE_RECORDING_CEILING: '-5', VOICE_AUDIO_FOLDER: 'qraivy-voices', RESEND_API_KEY: 'x', STRIPE_SECRET_KEY: 'y' }]) {
    assert.equal(loadStagingPolicy(env), null, JSON.stringify(env));
  }
  const prod = require(resolveSrc('config', 'stagingPolicy.js'));
  assert.deepEqual([prod.isStaging, prod.policy, prod.voiceAudioFolder], [false, null, 'qraivy-voices']);
});

test('A. staging with every setting right is accepted', () => {
  const p = loadStagingPolicy(STAGING_ENV);
  assert.deepEqual(JSON.parse(JSON.stringify(p)), { allowedUserIds: [ALICE, BOB], recordingCeiling: 25, voiceAudioFolder: 'qraivy-voices-staging', dealImageFolder: null,
    clerk: { jwtKey: STAGING_ENV.CLERK_JWT_KEY.trim(), issuer: 'https://clerk.voice-staging.example', authorizedParties: ['https://voice-preview.voice-staging.example'] } });
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.allowedUserIds));
});

test('A. staging refuses to start when the account allowlist is missing or malformed', () => {
  for (const value of [undefined, '', '  ', ',,', 'alice@example.com', 'user_', `${ALICE},not-an-id`, '*', 'user_*']) {
    assert.throws(() => loadStagingPolicy(Object.assign({}, STAGING_ENV, { STAGING_ALLOWED_USER_IDS: value })), /STAGING_ALLOWED_USER_IDS/, String(value));
  }
});

test('A. staging refuses to start without a sane recording ceiling', () => {
  for (const value of [undefined, '', '0', '-1', '501', '1e3', '25.5', 'unlimited', ' ']) {
    assert.throws(() => loadStagingPolicy(Object.assign({}, STAGING_ENV, { STAGING_VOICE_RECORDING_CEILING: value })), /STAGING_VOICE_RECORDING_CEILING/, String(value));
  }
  assert.equal(loadStagingPolicy(Object.assign({}, STAGING_ENV, { STAGING_VOICE_RECORDING_CEILING: '1' })).recordingCeiling, 1);
  assert.equal(loadStagingPolicy(Object.assign({}, STAGING_ENV, { STAGING_VOICE_RECORDING_CEILING: '500' })).recordingCeiling, 500);
});

test('A. staging audio can never be configured into a production storage folder', () => {
  assert.deepEqual(PRODUCTION_STORAGE_FOLDERS.slice().sort(), ['qraivy-deals', 'qraivy-logos', 'qraivy-voices', 'qraivy-wallet-strips']);
  for (const value of [undefined, '', ...PRODUCTION_STORAGE_FOLDERS, 'voices', 'qraivy-voices-test', 'qraivy-voices/staging', '../qraivy-voices', 'Staging', 'qraivy voices staging', 'notstaging', 'stagingish']) {
    assert.throws(() => loadStagingPolicy(Object.assign({}, STAGING_ENV, { VOICE_AUDIO_FOLDER: value })), /VOICE_AUDIO_FOLDER/, String(value));
  }
  for (const ok of ['qraivy-voices-staging', 'staging-voices', 'qraivy-staging-voices-2']) assert.equal(loadStagingPolicy(Object.assign({}, STAGING_ENV, { VOICE_AUDIO_FOLDER: ok })).voiceAudioFolder, ok);
  assert.throws(() => loadStagingPolicy(Object.assign({}, STAGING_ENV, { CLOUDINARY_CLOUD_NAME: '' })), /CLOUDINARY_CLOUD_NAME/);
});

test('A. staging refuses to start if it has been given any means to contact customers or take money', () => {
  for (const name of ['RESEND_API_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'APNS_KEY_P8_BASE64', 'APPLE_PASS_CERT_PEM', 'GOOGLE_WALLET_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) assert.ok(FORBIDDEN_SETTINGS.includes(name), name);
  for (const name of FORBIDDEN_SETTINGS) {
    let message = '';
    try { loadStagingPolicy(Object.assign({}, STAGING_ENV, { [name]: 'SECRET-VALUE-12345' })); } catch (e) { message = e.message; }
    assert.match(message, /must not exist on a staging server/, name);
    assert.ok(message.includes(name) && !message.includes('SECRET-VALUE-12345'), 'the message names the setting, never its value');
  }
  // every outbound service in the backend is covered by at least one forbidden setting
  for (const [file, setting] of [['emailService.js', 'RESEND_API_KEY'], ['webPushService.js', 'VAPID_PRIVATE_KEY'], ['apnsService.js', 'APNS_KEY_P8_BASE64'], ['googleWalletService.js', 'GOOGLE_WALLET_KEY']]) {
    assert.ok(read(SRC, 'services', file).includes('process.env.' + setting), file + ' needs ' + setting);
  }
});

test('A. all problems are reported together, and the message contains no setting value', () => {
  let message = '';
  try { loadStagingPolicy({ APP_ENV: 'staging', STAGING_ALLOWED_USER_IDS: 'secret-looking-value', VOICE_AUDIO_FOLDER: 'qraivy-voices', STRIPE_SECRET_KEY: 'sk_live_DO_NOT_PRINT' }); } catch (e) { message = e.message; }
  for (const part of [/Staging server refused to start/, /STAGING_ALLOWED_USER_IDS/, /STAGING_VOICE_RECORDING_CEILING/, /VOICE_AUDIO_FOLDER/, /CLOUDINARY_CLOUD_NAME/, /STRIPE_SECRET_KEY/]) assert.match(message, part);
  assert.ok(!message.includes('sk_live_DO_NOT_PRINT') && !message.includes('secret-looking-value'));
});

// ── B. The gate: default deny ──────────────────────────────────
const mkRes = () => ({ statusCode: 200, body: undefined, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });
const pages = { 'alice-page': { userId: ALICE }, 'bob-page': { userId: BOB }, 'ownerless': { userId: null } };
function gateWith({ authAs, ownerLookup } = {}) {
  const calls = { auth: 0, owner: 0 };
  // stands in for requireAuth: a "verified" token is the user id itself
  const authenticate = (req, res, next) => { calls.auth += 1; const h = req.headers.authorization || ''; if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized.' }); req.userId = authAs !== undefined ? authAs : h.slice(7); return next(); };
  const findPageOwner = ownerLookup || (async (slug) => { calls.owner += 1; return pages[slug] || null; });
  return { gate: createStagingGate({ allowedUserIds: [ALICE, BOB], authenticate, findPageOwner }), calls };
}
async function through(gate, method, url, user) {
  const res = mkRes(); let passed = false;
  await gate({ method, path: url.split('?')[0], headers: user ? { authorization: 'Bearer ' + user } : {} }, res, () => { passed = true; });
  await new Promise((r) => setImmediate(r));
  return { passed, status: res.statusCode, code: res.body && res.body.code };
}

test('B. exactly six kinds of request are allowed, and only two of them without sign-in beyond page playback', () => {
  // ...plus the owner Deals routes, all "user" (dealsPreviewSafety.test.js)
  assert.deepEqual(ALLOWED_ROUTES.slice(0, 6).map((r) => `${r.method} ${r.access}`), ['GET public', 'GET public', 'GET public', 'GET owner', 'POST user', 'POST user']);
  assert.ok(ALLOWED_ROUTES.slice(6).every((r) => r.access === 'user' && r.path.source.startsWith('^\\/deals')), 'everything after the six is a signed-in Deals route');
  const allowed = [['GET', '/health'], ['GET', '/sw.js'], ['GET', '/lp/casa-lumi-ab1'], ['HEAD', '/lp/casa-lumi-ab1'], ['GET', '/api/lp/casa-lumi-ab1'], ['POST', '/lp'], ['POST', '/lp/voice/preview/casa-lumi-ab1']];
  for (const [m, p] of allowed) assert.ok(matchRoute(m, p), m + ' ' + p);
});

test('B. everything else is refused before any route code or sign-in check runs', async () => {
  const { gate, calls } = gateWith();
  const denied = [
    // admin, ops, managers, api keys, payments
    ['GET', '/admin/users'], ['POST', '/admin/users/x/plan'], ['GET', '/ops/health'], ['GET', '/manager/x'], ['POST', '/api/keys'], ['POST', '/stripe/webhook'], ['POST', '/stripe/checkout'],
    // wallet, passes
    ['GET', '/lp/wallet/apple/s'], ['GET', '/lp/wallet/google/s'], ['GET', '/lp/wallet-hero/s'], ['GET', '/wallet/x'], ['POST', '/pass/v1/devices/a/registrations/b/c'],
    // stamp, loyalty, rewards, staff
    ['GET', '/stamp/s/tok'], ['POST', '/stamp/s/tok/confirm'], ['POST', '/stamp/s/customer'], ['GET', '/redeem/s/tok'], ['POST', '/redeem/s/tok/confirm'], ['GET', '/lp/card/s'], ['GET', '/lp/nfc-token/s'], ['GET', '/lp/stamp/token/s'], ['POST', '/lp/stamp/settings/s'], ['GET', '/lp/stamp/settings/s'], ['GET', '/lp/welcome/s'], ['GET', '/loyalty/x'], ['GET', '/tier/x'], ['POST', '/lp/staff-pin/s'], ['POST', '/lp/staff-pin/s/verify'], ['GET', '/lp/staff-pin/s/status'],
    // customer communication and customer data
    ['POST', '/lp/push/s'], ['GET', '/lp/push/s/count'], ['GET', '/lp/push/s/history'], ['POST', '/lp/webpush/subscribe/s'], ['GET', '/lp/webpush/vapid-key/s'], ['POST', '/lp/subscribe/s'], ['GET', '/lp/subscribers/s'], ['GET', '/customers/x'],
    // uploads, assistant, QR codes, dashboards, everything about other pages
    ['POST', '/lp/upload-logo/s'], ['POST', '/lp/upload-strip/s'], ['POST', '/lp/chat'], ['GET', '/qr/x'], ['POST', '/qr'], ['DELETE', '/qr/x'], ['GET', '/dashboard'], ['GET', '/api/lp'], ['GET', '/manifest/s'], ['GET', '/analytics/x'], ['POST', '/ai/x'], ['GET', '/user/me'], ['POST', '/businesses/x'], ['GET', '/public/plans'], ['GET', '/public/stadtpocket/x'], ['PATCH', '/deals'],
    // allowed paths with the wrong method
    ['DELETE', '/lp/casa-lumi-ab1'], ['PUT', '/lp'], ['PATCH', '/lp'], ['POST', '/lp/casa-lumi-ab1'], ['POST', '/api/lp/casa-lumi-ab1'], ['GET', '/lp/voice/preview/casa-lumi-ab1'], ['POST', '/health'], ['DELETE', '/api/lp/casa-lumi-ab1'],
    // look-alikes
    ['GET', '/lp'], ['GET', '/lp/'], ['GET', '/lp/a/b'], ['GET', '/lp/casa-lumi-ab1/'], ['GET', '/LP/casa-lumi-ab1'], ['GET', '/lp/..'], ['GET', '/lp/%2e%2e'], ['GET', '/api/lp/a/b'], ['POST', '/lp/voice/preview/a/b'], ['POST', '/lp/voice/preview/'], ['GET', '/healthz'], ['GET', '/sw.js.map'], ['GET', '/'], ['GET', ''],
  ];
  for (const [m, p] of denied) {
    const r = await through(gate, m, p, ALICE);
    assert.deepEqual([r.passed, r.status, r.code], [false, 404, 'staging_scope'], m + ' ' + p);
  }
  assert.deepEqual(calls, { auth: 0, owner: 0 }, 'a refused request costs no sign-in check and no database read');
});

test('B. for every HTTP method Node knows, each allowed path answers only to its one intended method', async () => {
  const { gate } = gateWith();
  const intended = { '/health': ['GET', 'HEAD'], '/sw.js': ['GET', 'HEAD'], '/lp/alice-page': ['GET', 'HEAD'], '/api/lp/alice-page': ['GET', 'HEAD'], '/lp': ['POST'], '/lp/voice/preview/alice-page': ['POST'] };
  const methods = require('http').METHODS;
  assert.ok(methods.length >= 30 && ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT', 'PROPFIND', 'QUERY'].every((m) => methods.includes(m) || m === 'QUERY'));
  for (const [p, ok] of Object.entries(intended)) {
    for (const m of methods) {
      for (const spelled of [m, m.toLowerCase()]) {
        const r = await through(gate, spelled, p, ALICE);
        assert.equal(r.passed, ok.includes(m), spelled + ' ' + p);
        if (!ok.includes(m)) assert.deepEqual([r.status, r.code], [404, 'staging_scope'], spelled + ' ' + p);
      }
    }
  }
});

test('B. alternate spellings of an allowed path are refused: the gate is stricter than the router, never looser', async () => {
  const { gate } = gateWith();
  // Express matches routes case-insensitively and ignores a trailing slash; the gate does neither.
  const variants = ['/LP/alice-page', '/Lp/alice-page', '/lp/alice-page/', '//lp/alice-page', '/lp//alice-page', '/./lp/alice-page', '/lp/./alice-page', '/lp/alice-page/.', '/x/../lp/alice-page', '/lp/alice-page%2F', '/lp/alice-page%00', '/lp/alice%20page', '/lp/alice-page;x=1', '/lp/alice-page#x', '/lp/alice-page\\', '/lp\\alice-page', '/lp/alice-page.json', '/lp/alice page', '/lp/' + 'a'.repeat(121),
    '/API/lp/alice-page', '/api/LP/alice-page', '/api/lp/alice-page/', '/api//lp/alice-page', '/api/lp/alice-page/..', '/Health', '/health/', '/SW.js', '/sw.js/'];
  for (const p of variants) for (const m of ['GET', 'HEAD', 'POST']) assert.equal((await through(gate, m, p, ALICE)).passed, false, m + ' ' + p);
  for (const p of ['/LP', '/lp/', '//lp', '/lp/voice/preview/alice-page/', '/lp/voice/PREVIEW/alice-page', '/lp/voice/preview/alice-page/x', '/lp/voice//preview/alice-page']) assert.equal((await through(gate, 'POST', p, ALICE)).passed, false, 'POST ' + p);
  // the gate decides on the path alone; a query string cannot change the decision
  assert.equal((await through(gate, 'GET', '/admin/users?path=/health', ALICE)).passed, false);
  assert.ok(read(SRC, 'middleware', 'stagingGate.js').includes('matchRoute(req.method, req.path)'), 'the undecoded path, without the query string');
});

test('B. no router mounted ahead of the landing page router can answer an allowed path with different code', () => {
  const index = read(SRC, 'index.js');
  // routers mounted at "/" or "/api" before lpRoutes: none declares a route the gate would let through
  for (const [file, prefix] of [['qrRoutes.js', ''], ['apiKeyRoutes.js', '/api']]) {
    const src = read(SRC, 'routes', file);
    const declared = [...src.matchAll(/router\.(get|post|put|patch|delete|all)\('([^']+)'/g)].map((m) => [m[1].toUpperCase(), prefix + m[2].replace(/:(\w+)/g, 'x')]);
    assert.ok(declared.length >= 6, file);
    for (const [m, p] of declared) assert.equal(matchRoute(m === 'ALL' ? 'GET' : m, p), null, file + ': ' + m + ' ' + p);
    assert.ok(!/router\.use\(/.test(src), file + ' has no catch-all handler');
  }
  assert.ok(index.indexOf("app.use('/',         qrRoutes);") < index.indexOf("app.use('/', lpRoutes);"));
  assert.ok(!/method-override|X-HTTP-Method/i.test(index), 'the method cannot be overridden by a header');
});

test('B. every route the landing page router really has is refused, except the four staging needs', () => {
  const seed = (file, exports) => { const f = require.resolve(file); if (!require.cache[f]) require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
  seed(path.join(SRC, 'utils', 'prismaClient.js'), {});
  const router = require(resolveSrc('routes', 'lpRoutes.js'));
  const real = router.stack.filter((l) => l.route).flatMap((l) => Object.keys(l.route.methods).map((m) => [m.toUpperCase(), l.route.path]));
  assert.ok(real.length >= 34);
  const allowedHere = real.filter(([m, p]) => matchRoute(m, p.replace(/:(\w+)/g, 'x')));
  assert.deepEqual(allowedHere.map(([m, p]) => m + ' ' + p).sort(), ['GET /api/lp/:slug', 'GET /lp/:slug', 'POST /lp', 'POST /lp/voice/preview/:slug']);
});

// ── C. The gate: who gets through ──────────────────────────────
test('C. public routes need no sign-in and trigger no account or ownership check', async () => {
  const { gate, calls } = gateWith();
  for (const [m, p] of [['GET', '/health'], ['GET', '/sw.js'], ['GET', '/lp/alice-page'], ['HEAD', '/lp/alice-page'], ['GET', '/lp/alice-page?preview=1&t=5']]) {
    assert.deepEqual(await through(gate, m, p, null), { passed: true, status: 200, code: undefined }, m + ' ' + p);
  }
  assert.deepEqual(calls, { auth: 0, owner: 0 });
});

test('C. signed-in routes: no token is 401, a real but unlisted account is 403, a listed account passes', async () => {
  const { gate } = gateWith();
  for (const [m, p] of [['POST', '/lp'], ['POST', '/lp/voice/preview/alice-page'], ['GET', '/api/lp/alice-page']]) {
    assert.deepEqual(await through(gate, m, p, null), { passed: false, status: 401, code: undefined }, 'no token ' + p);
    assert.deepEqual(await through(gate, m, p, MALLORY), { passed: false, status: 403, code: 'staging_account' }, 'unlisted ' + p);
    assert.deepEqual(await through(gate, m, p, ALICE), { passed: true, status: 200, code: undefined }, 'listed ' + p);
  }
});

test('C. the gate uses production\'s own token verification: a missing or forged token never reaches a route', async () => {
  const realError = console.error; console.error = () => {};
  try {
    const gate = createStagingGate({ allowedUserIds: [ALICE], findPageOwner: async () => null });   // authenticate = the real requireAuth
    for (const headers of [{}, { authorization: 'Basic x' }, { authorization: 'Bearer ' + ALICE }, { authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyXzJhbGljZSJ9.' }]) {
      const res = mkRes(); let passed = false;
      await gate({ method: 'POST', path: '/lp', headers }, res, () => { passed = true; });
      await new Promise((r) => setTimeout(r, 30));
      assert.deepEqual([passed, res.statusCode], [false, 401], JSON.stringify(headers));
    }
  } finally { console.error = realError; }
  assert.equal(require(resolveSrc('middleware', 'stagingGate.js')).createStagingGate.length, 1);
  assert.ok(read(SRC, 'middleware', 'stagingGate.js').includes('authenticate = requireAuth'), 'requireAuth is the default, not an option someone must remember');
});

test('C. loading a page in the editor is owner-only on staging, although production serves it without sign-in', async () => {
  const { gate } = gateWith();
  assert.deepEqual(await through(gate, 'GET', '/api/lp/alice-page', ALICE), { passed: true, status: 200, code: undefined });
  assert.deepEqual(await through(gate, 'GET', '/api/lp/alice-page', BOB), { passed: false, status: 403, code: 'staging_owner' }, 'another test account cannot read it');
  assert.deepEqual(await through(gate, 'GET', '/api/lp/ownerless', ALICE), { passed: false, status: 403, code: 'staging_owner' });
  assert.equal((await through(gate, 'GET', '/api/lp/does-not-exist', ALICE)).passed, true, 'a missing page goes on to the route, which answers 404');
  assert.match(read(SRC, 'routes', 'lpRoutes.js'), /router\.get\('\/api\/lp\/:slug', handleGetLP\);/, 'production: unchanged, no sign-in on this route');
});

test('C. if the gate cannot check ownership it refuses; it never lets the request through unchecked', async () => {
  const realError = console.error; console.error = () => {};
  try {
    const { gate } = gateWith({ ownerLookup: async () => { throw new Error('database unreachable'); } });
    assert.deepEqual(await through(gate, 'GET', '/api/lp/alice-page', ALICE), { passed: false, status: 503, code: 'staging_unverified' });
  } finally { console.error = realError; }
  assert.throws(() => createStagingGate({ allowedUserIds: [], findPageOwner: async () => null }), /at least one allowed user id/);
  assert.throws(() => createStagingGate({ allowedUserIds: [ALICE] }), /findPageOwner/);
});

test('C. the routes behind the gate keep their own checks: nothing owner-only became public', () => {
  const routes = read(SRC, 'routes', 'lpRoutes.js');
  assert.match(routes, /router\.post\('\/lp\/voice\/preview\/:slug', requireAuth, handleVoicePreview\);/);
  const preview = read(SRC, 'controllers', 'lpVoiceController.js');
  assert.match(preview, /if \(!page\.userId \|\| page\.userId !== userId\) return res\.status\(403\)/);
  const publish = read(SRC, 'controllers', 'lpController.js');
  assert.match(publish, /Authentication is required to update an existing page\./);
  // the three public staging routes are public in production as well
  for (const line of ["router.get('/lp/:slug', handleServeLP);"]) assert.ok(routes.includes(line), line);
  assert.ok(read(SRC, 'index.js').includes("app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }));"));
  assert.ok(ALLOWED_ROUTES.filter((r) => r.access === 'public').every((r) => r.method === 'GET'), 'no public route can change anything');
});

// ── D. The real server, started three ways ─────────────────────
function boot(env, { waitMs = 20000 } = {}) {
  return new Promise((resolveBoot) => {
    const port = 21000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, [path.join(SRC, 'index.js')], {
      cwd: path.join(__dirname, '..'),
      env: Object.assign({ PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_PATH: process.env.NODE_PATH || '', PORT: String(port),
        // an address nothing listens on: this server can reach no database at all
        DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:1/none', CLERK_SECRET_KEY: 'sk_test_placeholder_not_a_real_key' }, env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', done = false;
    const finish = (result) => { if (done) return; done = true; clearTimeout(timer); resolveBoot(Object.assign({ out, port, child, stop: () => new Promise((r) => { if (child.exitCode !== null) return r(); child.once('exit', r); child.kill(); }) }, result)); };
    const timer = setTimeout(() => finish({ started: false, timedOut: true }), waitMs);
    const onData = (d) => { out += d; if (/running on port/.test(out)) finish({ started: true }); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('exit', (code) => finish({ started: false, exitCode: code }));
  });
}
const call = async (port, method, p, headers) => { const r = await fetch('http://127.0.0.1:' + port + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: method === 'GET' || method === 'HEAD' ? undefined : '{}' }); let body = null; try { body = await r.json(); } catch (e) {} return { status: r.status, code: body && body.code }; };

test('D. production server: starts as always, no gate; its routes answer as routes', async () => {
  const s = await boot({});
  try {
    assert.equal(s.started, true, s.out.slice(-400));
    assert.ok(!/\[staging\]/.test(s.out), 'nothing about staging is logged or loaded');
    assert.equal((await call(s.port, 'GET', '/health')).status, 200);
    // routes that staging refuses are reached here (whatever they answer, it is not the gate)
    for (const [m, p] of [['GET', '/lp/push/some-page/count'], ['POST', '/lp/subscribe/some-page'], ['GET', '/admin/users'], ['GET', '/lp/stamp/settings/some-page'], ['POST', '/lp/chat'], ['GET', '/public/plans']]) {
      const r = await call(s.port, m, p);
      assert.notEqual(r.code, 'staging_scope', m + ' ' + p);
    }
    assert.equal((await call(s.port, 'POST', '/lp/voice/preview/some-page')).status, 401);
  } finally { await s.stop(); }
});

test('D. staging server: starts with the gate, answers health, refuses everything out of scope', async () => {
  const s = await boot(STAGING_ENV);
  try {
    assert.equal(s.started, true, s.out.slice(-600));
    assert.match(s.out, /\[staging\] gate active: 2 allowed account\(s\), recording ceiling 25/);
    assert.ok(!s.out.includes(ALICE), 'account ids are not written to the log');
    assert.deepEqual(await call(s.port, 'GET', '/health'), { status: 200, code: undefined });
    for (const [m, p] of [['GET', '/admin/users'], ['POST', '/stripe/webhook'], ['GET', '/lp/wallet/apple/some-page'], ['GET', '/stamp/some-page/tok'], ['POST', '/stamp/some-page/customer'], ['GET', '/lp/card/some-page'], ['POST', '/lp/push/some-page'], ['GET', '/lp/push/some-page/count'], ['POST', '/lp/subscribe/some-page'], ['GET', '/lp/subscribers/some-page'], ['POST', '/lp/webpush/subscribe/some-page'], ['POST', '/lp/chat'], ['POST', '/lp/upload-logo/some-page'], ['GET', '/api/lp'], ['GET', '/dashboard'], ['DELETE', '/lp/some-page'], ['GET', '/public/plans'], ['GET', '/loyalty/anything']]) {
      assert.deepEqual(await call(s.port, m, p), { status: 404, code: 'staging_scope' }, m + ' ' + p);
    }
    // the running server: alternate spellings and other methods of allowed paths are refused too
    for (const [m, p] of [['GET', '/LP/some-page'], ['GET', '/lp/some-page/'], ['GET', '//lp/some-page'], ['GET', '/API/lp/some-page'], ['GET', '/api/lp/some-page/'], ['GET', '/health/'], ['GET', '/HEALTH'], ['POST', '/lp/'], ['POST', '/LP'], ['PUT', '/lp'], ['PATCH', '/lp'], ['DELETE', '/lp'], ['POST', '/health'], ['PUT', '/lp/voice/preview/some-page'], ['POST', '/lp/voice/preview/some-page/']]) {
      assert.deepEqual(await call(s.port, m, p), { status: 404, code: 'staging_scope' }, m + ' ' + p);
    }
    // in scope, but only with a valid sign-in
    for (const [m, p] of [['POST', '/lp'], ['POST', '/lp/voice/preview/some-page'], ['GET', '/api/lp/some-page']]) {
      assert.equal((await call(s.port, m, p)).status, 401, m + ' ' + p);
      assert.equal((await call(s.port, m, p, { Authorization: 'Bearer ' + ALICE })).status, 401, 'a user id is not a token: ' + p);
    }
  } finally { await s.stop(); }
});

test('D. a misconfigured staging server does not start at all', async () => {
  const bad = [
    [{ STAGING_ALLOWED_USER_IDS: '' }, /STAGING_ALLOWED_USER_IDS is required/],
    [{ STAGING_VOICE_RECORDING_CEILING: '' }, /STAGING_VOICE_RECORDING_CEILING is required/],
    [{ VOICE_AUDIO_FOLDER: 'qraivy-voices' }, /VOICE_AUDIO_FOLDER is a production folder/],
    [{ RESEND_API_KEY: 're_placeholder' }, /must not exist on a staging server[^\n]*RESEND_API_KEY/],
    [{ LP_PUBLIC_API_ORIGIN: 'https://api.qraivy.com' }, /points to production/],
    [{ LP_PUBLIC_API_ORIGIN: '', LP_PUBLIC_PAGE_ORIGIN: '' }, /does not fall back to production addresses/],
  ];
  const results = await Promise.all(bad.map(([override]) => boot(Object.assign({}, STAGING_ENV, override), { waitMs: 15000 })));
  for (let i = 0; i < bad.length; i++) {
    const s = results[i];
    try {
      assert.equal(s.started, false, JSON.stringify(bad[i][0]));
      assert.ok(s.exitCode !== 0 && s.exitCode !== undefined, 'the process exits with an error');
      assert.match(s.out, bad[i][1]);
      assert.ok(!/running on port/.test(s.out));
      await assert.rejects(fetch('http://127.0.0.1:' + s.port + '/health'), 'nothing is listening');
    } finally { await s.stop(); }
  }
});

test('D. the gate is mounted only for staging, after the origin check and before every route', () => {
  const index = read(SRC, 'index.js');
  const cors = index.indexOf('app.use(cors({'), gate = index.indexOf('if (stagingPolicy.isStaging) {'), mount = index.indexOf('app.use(createStagingGate({'), health = index.indexOf("app.get('/health'"), firstRouter = index.indexOf("app.use('/',         qrRoutes);");
  assert.ok(cors !== -1 && gate > cors && mount > gate && health > mount && firstRouter > health);
  assert.equal(index.split('createStagingGate').length - 1, 2, 'required and mounted once, inside the staging branch');
  assert.ok(index.indexOf('}', mount) < health, 'the staging branch closes before the first route');
});

// ── E. The staging-wide recording ceiling ──────────────────────
// A stand-in for the one-row counter table, with the same semantics as
// the two SQL statements the service sends.
function counterDb({ used = 0, table = true, row = true } = {}) {
  const db = { used, table, row, queries: 0, breakNext: null,
    async $queryRaw(strings, ...values) {
      db.queries += 1;
      const sql = strings.join('?');
      if (db.breakNext) { const b = db.breakNext; db.breakNext = null; if (b === 'throw') throw new Error('connection lost'); return b; }
      if (!db.table) throw new Error('relation "StagingVoiceUsage" does not exist');
      if (/^UPDATE "StagingVoiceUsage"/.test(sql)) { if (!db.row || db.used >= values[0]) return []; db.used += 1; return [{ used: db.used }]; }
      if (/^SELECT "used" FROM "StagingVoiceUsage"/.test(sql)) return db.row ? [{ used: db.used }] : [];
      throw new Error('unexpected query: ' + sql);
    } };
  return db;
}

test('E. production: no ceiling, and the database is not even touched', async () => {
  const untouchable = { $queryRaw() { throw new Error('production must not query the staging counter'); } };
  assert.equal(await reserveRecording({ policy: null, prisma: untouchable }), null);
  assert.equal(await reserveRecording(), null, 'the module as loaded in this (production) process');
});

test('E. staging: each recording takes one unit; at the ceiling no more are allowed', async () => {
  const db = counterDb();
  for (let i = 1; i <= 3; i++) assert.deepEqual(await takeUnit(db, 3), { used: i, ceiling: 3 });
  await assert.rejects(takeUnit(db, 3), (e) => e instanceof StagingCeilingError && e.code === 'STAGING_CEILING' && e.reason === 'reached' && /ceiling reached \(3\)/.test(e.message));
  assert.equal(db.used, 3, 'a refused request does not move the counter');
});

test('E. the count survives restarts and deploys: a fresh process continues where the database left off', async () => {
  const db = counterDb({ used: 24 });
  const budgetPath = resolveSrc('services', 'stagingVoiceBudget.js');
  delete require.cache[budgetPath];
  const fresh = require(budgetPath);                              // a "new deployment": no memory of earlier calls
  const policy = { recordingCeiling: 25 };
  const realLog = console.log; console.log = () => {};
  try {
    assert.deepEqual(await fresh.reserveRecording({ policy, prisma: db }), { used: 25, ceiling: 25 });
    await assert.rejects(fresh.reserveRecording({ policy, prisma: db }), /ceiling reached/);
  } finally { console.log = realLog; }
  assert.ok(!/let |new Map|new Set/.test(read(SRC, 'services', 'stagingVoiceBudget.js').replace(/\/\*[\s\S]*?\*\//, '').replace(/let rows;|let check;/g, '')), 'no in-memory counter exists');
});

test('E. requests arriving together cannot take more units than the ceiling', async () => {
  const db = counterDb({ used: 20 });
  const results = await Promise.allSettled(Array.from({ length: 40 }, () => takeUnit(db, 25)));
  assert.deepEqual([results.filter((r) => r.status === 'fulfilled').length, results.filter((r) => r.status === 'rejected').length, db.used], [5, 35, 25]);
  // the check and the increment are one statement
  const sql = read(SRC, 'services', 'stagingVoiceBudget.js');
  assert.match(sql, /UPDATE "StagingVoiceUsage" SET "used" = "used" \+ 1, "updatedAt" = NOW\(\) WHERE "id" = 1 AND "used" < \$\{ceiling\} RETURNING "used"/);
});

test('E. fail closed: if the counter cannot be verified, nothing is recorded', async () => {
  for (const [name, db] of [
    ['table missing', counterDb({ table: false })],
    ['counter row missing', counterDb({ row: false })],
    ['database unreachable', Object.assign(counterDb(), { breakNext: 'throw' })],
    ['nonsense answer', Object.assign(counterDb(), { breakNext: [{ used: 'not-a-number' }] })],
    ['two rows', Object.assign(counterDb(), { breakNext: [{ used: 1 }, { used: 1 }] })],
    ['not a list', Object.assign(counterDb(), { breakNext: 'ok' })],
  ]) {
    const before = db.used;
    await assert.rejects(takeUnit(db, 25), (e) => e.code === 'STAGING_CEILING' && e.reason === 'unverified' && /could not be verified; no recording was made/.test(e.message), name);
    assert.equal(db.used, before, name);
  }
  // the second query failing is fail closed as well
  const db = counterDb({ used: 25 });
  let n = 0; const real = db.$queryRaw.bind(db);
  db.$queryRaw = (s, ...v) => { n += 1; if (n === 2) throw new Error('lost'); return real(s, ...v); };
  await assert.rejects(takeUnit(db, 25), (e) => e.reason === 'unverified');
});

test('E. the counter table is created by hand, once; the server never creates, resets or drops it', () => {
  const service = read(SRC, 'services', 'stagingVoiceBudget.js').replace(/\/\*[\s\S]*?\*\//, '');
  assert.ok(!/CREATE|DROP|TRUNCATE|DELETE|INSERT|SET "used" = 0/i.test(service));
  const sql = read(__dirname, '..', 'staging', 'init-voice-usage.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "StagingVoiceUsage"/);
  assert.match(sql, /INSERT INTO "StagingVoiceUsage" \("id", "used"\) VALUES \(1, 0\)\s+ON CONFLICT \("id"\) DO NOTHING;/, 'running it again never resets the count');
  assert.ok(!/\b(DROP|TRUNCATE|DELETE|UPDATE|ALTER)\s/i.test(sql.replace(/--.*$/gm, '')));
  assert.match(sql, /STAGING DATABASES ONLY\. Never run against production\./);
  assert.ok(!read(__dirname, '..', 'prisma', 'schema.prisma').includes('StagingVoiceUsage'), 'not part of the Prisma schema, so no production migration can ever create it');
});

// ── F. The ceiling and the folder, in the real voice services ──
// Loads the real voice modules under the given settings, with the
// database and both outside services replaced.
const tts = { calls: [], uploads: [] };
https.request = function (options, cb) {
  const req = new EventEmitter(); let body = '';
  req.write = (c) => { body += c; };
  req.end = () => { tts.calls.push(JSON.parse(body).text); setImmediate(() => { const res = new EventEmitter(); res.statusCode = 200; cb(res); res.emit('data', Buffer.from('MP3')); res.emit('end'); }); };
  return req;
};
const cloudinary = require('cloudinary').v2;
cloudinary.uploader.upload_stream = (opts, cb) => ({ end() { tts.uploads.push({ folder: opts.folder, public_id: opts.public_id }); setImmediate(() => cb(null, { secure_url: `https://res.cloudinary.com/test/video/upload/v1/${opts.folder}/${opts.public_id}.mp3` })); } });
process.env.ELEVENLABS_API_KEY = 'test-key';

const VOICE_MODULES = [['config', 'stagingPolicy.js'], ['config', 'publicOrigins.js'], ['services', 'stagingVoiceBudget.js'], ['services', 'voiceService.js'], ['services', 'lpVoiceService.js'], ['services', 'lpSectionsPatch.js'], ['services', 'voicePreviewLimiter.js'], ['controllers', 'lpVoiceController.js']];
function loadVoice(env, db) {
  const keys = Object.keys(STAGING_ENV), saved = {};
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  for (const m of VOICE_MODULES) delete require.cache[resolveSrc(...m)];
  const prismaPath = resolveSrc('utils', 'prismaClient.js');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
  try {
    return { preview: require(resolveSrc('controllers', 'lpVoiceController.js')).handleVoicePreview, voice: require(resolveSrc('services', 'lpVoiceService.js')), folder: require(resolveSrc('config', 'stagingPolicy.js')).voiceAudioFolder };
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
function voiceDb(counter) {
  let clock = 1700000000000; const rows = {};
  const db = Object.assign(counter || {}, {
    rows,
    put(slug, sections = {}) { rows[slug] = { id: 'lp-' + slug, slug, businessName: 'Casa Lumi', useCase: 'restaurant', userId: ALICE, sections: JSON.stringify(sections), updatedAt: new Date(clock += 1000) }; },
    landingPage: {
      async findUnique({ where: { slug } }) { return rows[slug] ? Object.assign({}, rows[slug]) : null; },
      async updateMany({ where, data }) { const r = rows[where.slug]; if (!r || (where.updatedAt && r.updatedAt.getTime() !== where.updatedAt.getTime())) return { count: 0 }; Object.assign(r, data, { updatedAt: new Date(clock += 1000) }); return { count: 1 }; },
    },
  });
  if (!counter) db.$queryRaw = () => { throw new Error('the staging counter must not be queried in production'); };
  return db;
}
async function previewCall(handler, slug, text) {
  const res = mkRes();
  await handler({ params: { slug }, body: { language: 'en', text, generate: true }, userId: ALICE, headers: {} }, res);
  return res;
}
const quietly = async (fn) => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };

test('F. production: audio goes to the production folder as always, and no staging counter is consulted', async () => {
  tts.calls = []; tts.uploads = [];
  const db = voiceDb(); db.put('prod-page');
  const m = loadVoice({}, db);
  assert.equal(m.folder, 'qraivy-voices');
  const res = await quietly(() => previewCall(m.preview, 'prod-page', 'Hello from production settings.'));
  assert.deepEqual([res.statusCode, res.body.status], [200, 'ready']);
  assert.equal(tts.uploads[0].folder, 'qraivy-voices');
  assert.match(res.body.audioUrl, /\/qraivy-voices\/voice-prod-page-[0-9a-f]{32}\.mp3$/);
});

test('F. staging: audio goes to the staging folder only, and every recording takes a unit from the database counter', async () => {
  tts.calls = []; tts.uploads = [];
  const db = voiceDb(counterDb()); db.put('stage-page');
  const m = loadVoice(STAGING_ENV, db);
  assert.equal(m.folder, 'qraivy-voices-staging');
  const a = await quietly(() => previewCall(m.preview, 'stage-page', 'First staging recording.'));
  const b = await quietly(() => previewCall(m.preview, 'stage-page', 'Second staging recording.'));
  assert.deepEqual([a.statusCode, b.statusCode, db.used, tts.calls.length], [200, 200, 2, 2]);
  assert.deepEqual([...new Set(tts.uploads.map((u) => u.folder))], ['qraivy-voices-staging']);
  assert.ok(!tts.uploads.some((u) => PRODUCTION_STORAGE_FOLDERS.includes(u.folder)));
  // reuse costs no unit
  await quietly(() => previewCall(m.preview, 'stage-page', 'First staging recording.'));
  assert.deepEqual([db.used, tts.calls.length], [2, 2]);
});

test('F. staging at the ceiling: the preview is refused with a clear answer and no text-to-speech call is made', async () => {
  tts.calls = []; tts.uploads = [];
  const db = voiceDb(counterDb({ used: 25 })); db.put('full-page');
  const m = loadVoice(STAGING_ENV, db);
  const res = await quietly(() => previewCall(m.preview, 'full-page', 'One too many.'));
  assert.deepEqual([res.statusCode, res.body.code, tts.calls.length, tts.uploads.length, db.used], [429, 'staging_ceiling', 0, 0, 25]);
  assert.equal(JSON.parse(db.rows['full-page'].sections).voice, undefined, 'nothing was stored');
});

test('F. staging with an unverifiable counter: refused the same way, nothing recorded', async () => {
  for (const counter of [counterDb({ table: false }), counterDb({ row: false })]) {
    tts.calls = [];
    const db = voiceDb(counter); db.put('nocount-page');
    const m = loadVoice(STAGING_ENV, db);
    const res = await quietly(() => previewCall(m.preview, 'nocount-page', 'Counter is gone.'));
    assert.deepEqual([res.statusCode, res.body.code, tts.calls.length], [429, 'staging_ceiling', 0]);
  }
});

test('F. Publish is under the same ceiling: at the ceiling it records nothing and the page keeps what it had', async () => {
  tts.calls = [];
  const db = voiceDb(counterDb({ used: 25 }));
  db.put('pub-page', { language: 'en', voice: { language: 'en', customGreeting: { en: 'Published words that need audio.' }, audioUrl: 'https://res.cloudinary.com/test/old.mp3', audioFor: 'old' } });
  const m = loadVoice(STAGING_ENV, db);
  const result = await quietly(() => m.voice.ensureVoiceAudio('pub-page'));
  assert.deepEqual([result.generated, result.reason, tts.calls.length], [false, 'error', 0]);
  assert.equal(JSON.parse(db.rows['pub-page'].sections).voice.audioUrl, 'https://res.cloudinary.com/test/old.mp3');
  // with room, Publish records and takes exactly one unit
  const db2 = voiceDb(counterDb({ used: 3 }));
  db2.put('pub-page-2', { language: 'en', voice: { language: 'en' } });
  const m2 = loadVoice(STAGING_ENV, db2);
  await quietly(() => m2.voice.ensureVoiceAudio('pub-page-2'));
  assert.deepEqual([tts.calls.length, db2.used], [1, 4]);
});

test('F. two requests for the same greeting at once still make one recording and take one unit', async () => {
  tts.calls = [];
  const db = voiceDb(counterDb()); db.put('twin-page');
  const m = loadVoice(STAGING_ENV, db);
  const [a, b] = await quietly(() => Promise.all([previewCall(m.preview, 'twin-page', 'Double click.'), previewCall(m.preview, 'twin-page', 'Double click.')]));
  assert.deepEqual([a.statusCode, b.statusCode, tts.calls.length, db.used], [200, 200, 1, 1]);
  assert.equal(a.body.audioUrl, b.body.audioUrl);
});

// ── G. The editor on staging ───────────────────────────────────
test('G. on staging the editor reads the page with the owner\'s sign-in; in production that request is exactly as before', async () => {
  function run(hostname, config) {
    const els = {}, fetches = [];
    const mk = (id) => (els[id] = { id, value: '', textContent: '', style: {}, attrs: {}, listeners: {}, addEventListener(ev, fn) { this.listeners[ev] = fn; }, setAttribute(k, v) { this.attrs[k] = v; } });
    for (const id of ['se-voice-greeting', 'se-voice-greeting-count', 'se-voice-greeting-status', 'se-voice-greeting-reset', 'se-voice-audio-status', 'sqd-iframe']) mk(id);
    const state = { slug: 'casa-lumi-ab1', voice: { enabled: true, language: 'en', customText: '', customGreeting: {} }, _db: { useCase: 'restaurant', businessName: 'Casa Lumi' } };
    const window = { SmartEditor: { state }, QRAIVY_STAGING_CONFIG: config, Clerk: { session: { getToken: () => Promise.resolve('tok-owner') } },
      location: { hostname, href: 'https://' + hostname + '/smart-qr-detail.html' }, console: { info() {}, error() {} },
      fetch: (url, init) => { fetches.push({ url, init }); return new Promise(() => {}); } };
    const ctx = { window, document: { getElementById: (id) => els[id] || null, addEventListener() {}, body: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {} }) },
      setTimeout: () => 0, Date, JSON, encodeURIComponent, Promise, URL, TypeError, Error, Array, String };
    ctx.fetch = (url, init) => window.fetch(url, init);
    for (const f of ['lp-routing.js', 'voice-greetings.js', 'voice-greeting-editor.js']) vm.runInNewContext(read(PUB, 'js', f), ctx);
    window.QRAIVY_VOICE_GREETING.afterSave({ ok: true, voice: { enabled: true, pending: true, audioFor: 'x' } }, { skipReload: true });
    return { fetches, mode: window.QRAIVY_ROUTING.mode };
  }
  const prod = run('www.qraivy.com', { hosts: [], api: '' });
  assert.equal(prod.mode, 'production');
  assert.equal(prod.fetches.length, 1, 'sent at once, as before');
  assert.match(prod.fetches[0].url, /^https:\/\/api\.qraivy\.com\/api\/lp\/casa-lumi-ab1\?t=\d+$/);
  assert.equal(prod.fetches[0].init, undefined, 'no headers added in production');

  const stg = run('voice-preview.example', { hosts: ['voice-preview.example'], api: 'https://voice-api.example' });
  assert.equal(stg.mode, 'staging');
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  assert.equal(stg.fetches.length, 1);
  assert.match(stg.fetches[0].url, /^https:\/\/voice-api\.example\/api\/lp\/casa-lumi-ab1\?t=\d+$/);
  assert.deepEqual(JSON.parse(JSON.stringify(stg.fetches[0].init)), { headers: { Authorization: 'Bearer tok-owner' } });
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${String(err.message).split('\n').slice(0, 10).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
