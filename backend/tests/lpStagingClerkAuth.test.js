// ============================================================
// lpStagingClerkAuth.test.js — sign-in verification on staging.
//
// A staging server holds no Clerk secret. It verifies a session token with
// the Clerk instance's PUBLIC key and additionally requires the expected
// issuer and the staging site as authorized party (src/utils/clerkVerify.js,
// src/config/stagingPolicy.js).
//
// What this file proves:
//   - production verification is the same call as before, with the secret key
//   - staging accepts only a correctly signed, unexpired token from the
//     expected Clerk instance, issued for the staging site
//   - the allowlist still decides who may use staging; a valid token alone
//     is not enough
//   - a staging server refuses to start with a Clerk secret, without the
//     public key, or with a private key in its place
//
// Tokens are made here with throwaway keys. The real @clerk/backend library
// verifies them. No network, no Clerk account.
//
// No test framework dependency. Run: node tests/lpStagingClerkAuth.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'src');
const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const resolveSrc = (...p) => require.resolve(path.join(SRC, ...p));

const pair = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const CLERK = pair();      // stands in for the Clerk instance's signing key
const ATTACKER = pair();   // any other key

const ISSUER = 'https://clerk.staging-test.example';
const SITE = 'https://voice-preview.staging-test.example';
const ALICE = 'user_2aliceTESTaccount0001', MALLORY = 'user_2malloryREALcustomer9';
const STAGING_ENV = {
  APP_ENV: 'staging',
  STAGING_ALLOWED_USER_IDS: ALICE,
  STAGING_VOICE_RECORDING_CEILING: '25',
  VOICE_AUDIO_FOLDER: 'qraivy-voices-staging',
  CLOUDINARY_CLOUD_NAME: 'staging-cloud-example',
  CLERK_JWT_KEY: CLERK.publicKey,
  STAGING_CLERK_ISSUER: ISSUER,
  STAGING_CLERK_AUTHORIZED_PARTIES: SITE,
};

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
// A session token shaped like Clerk's. Every part can be overridden or removed (undefined).
function token({ key = CLERK.privateKey, header = {}, claims = {}, sign } = {}) {
  const h = Object.assign({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' }, header);
  const p = Object.assign({ sub: ALICE, iss: ISSUER, azp: SITE, sid: 'sess_test', iat: now() - 5, nbf: now() - 5, exp: now() + 60 }, claims);
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  const body = b64(h) + '.' + b64(p);
  const sig = sign ? sign(body) : crypto.sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
  return body + '.' + sig;
}

// Loads the verification code fresh under a given environment.
const ENV_KEYS = Object.keys(STAGING_ENV).concat(['CLERK_SECRET_KEY']);
function load(env) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  for (const f of [['config', 'stagingPolicy.js'], ['utils', 'clerkVerify.js'], ['middleware', 'auth.js'], ['middleware', 'stagingGate.js'], ['controllers', 'qrController.js']]) delete require.cache[resolveSrc(...f)];
  const restore = () => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
  return { restore };
}
const rejects = async (fn, label) => { let ok = false; try { await fn(); ok = true; } catch (_) {} assert.equal(ok, false, 'must be rejected: ' + label); };
const res = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── A. Production is the same call as before ───────────────────
test('A. production: verification is the unchanged secret-key call, and staging settings are ignored', async () => {
  const clerkPath = require.resolve('@clerk/backend');
  const real = require.cache[clerkPath];
  const calls = [];
  require(clerkPath);
  const original = require.cache[clerkPath].exports;
  require.cache[clerkPath].exports = Object.assign({}, original, { verifyToken: async (t, options) => { calls.push({ t, options }); return { sub: 'user_fromLibrary' }; } });
  for (const env of [{ CLERK_SECRET_KEY: 'sk_test_placeholder' }, { APP_ENV: 'production', CLERK_SECRET_KEY: 'sk_test_placeholder', CLERK_JWT_KEY: CLERK.publicKey, STAGING_CLERK_ISSUER: ISSUER, STAGING_CLERK_AUTHORIZED_PARTIES: SITE }]) {
    const { restore } = load(env);
    try {
      const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
      calls.length = 0;
      const payload = await verifyClerkToken('the.token.value');
      assert.deepEqual(payload, { sub: 'user_fromLibrary' }, 'the library answer is returned untouched');
      assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ t: 'the.token.value', options: { secretKey: 'sk_test_placeholder' } }], 'exactly the options production always passed');
    } finally { restore(); }
  }
  require.cache[clerkPath].exports = original; if (real) require.cache[clerkPath] = real;
  load({}).restore();
});

test('A. production: a token that only the staging public key could accept is NOT accepted', async () => {
  // no secret key reachable and no staging mode: the public-key path must not be taken
  const { restore } = load({ CLERK_JWT_KEY: CLERK.publicKey, STAGING_CLERK_ISSUER: ISSUER, STAGING_CLERK_AUTHORIZED_PARTIES: SITE });
  try {
    const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
    await rejects(() => verifyClerkToken(token()), 'production without a secret key');
  } finally { restore(); }
});

// ── B. Staging: what is accepted ───────────────────────────────
test('B. staging: a correctly signed, current token from the expected instance for the staging site is accepted', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
    const payload = await verifyClerkToken(token());
    assert.equal(payload.sub, ALICE); assert.equal(payload.iss, ISSUER); assert.equal(payload.azp, SITE);
    // the subject comes from the token and nowhere else
    assert.equal((await verifyClerkToken(token({ claims: { sub: MALLORY } }))).sub, MALLORY);
    // several staging origins may be configured
    restore();
    const two = load(Object.assign({}, STAGING_ENV, { STAGING_CLERK_AUTHORIZED_PARTIES: 'https://other.staging-test.example, ' + SITE }));
    try { assert.equal((await require(resolveSrc('utils', 'clerkVerify.js')).verifyClerkToken(token())).sub, ALICE); } finally { two.restore(); }
  } finally { restore(); }
});

// ── C. Staging: what is rejected ───────────────────────────────
test('C. staging: signature. Another key, a tampered body, or no signature is rejected', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
    await rejects(() => verifyClerkToken(token({ key: ATTACKER.privateKey })), 'signed with another key');
    const good = token().split('.');
    const forged = JSON.parse(Buffer.from(good[1], 'base64url').toString()); forged.sub = MALLORY;
    await rejects(() => verifyClerkToken([good[0], b64(forged), good[2]].join('.')), 'payload changed after signing');
    await rejects(() => verifyClerkToken(good[0] + '.' + good[1] + '.'), 'signature removed');
    await rejects(() => verifyClerkToken(good[0] + '.' + good[1] + '.' + b64('not a signature')), 'garbage signature');
    await rejects(() => verifyClerkToken(good[0] + '.' + good[1]), 'two parts only');
  } finally { restore(); }
});

test('C. staging: algorithm. "none" and a shared-secret token made from the public key are rejected', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
    await rejects(() => verifyClerkToken(token({ header: { alg: 'none' }, sign: () => '' })), 'alg none');
    // the classic confusion attack: HMAC with the PUBLIC key as the secret
    for (const alg of ['HS256', 'HS384', 'HS512']) {
      const hash = 'sha' + alg.slice(2);
      await rejects(() => verifyClerkToken(token({ header: { alg }, sign: (body) => crypto.createHmac(hash, CLERK.publicKey).update(body).digest('base64url') })), alg + ' with the public key');
      await rejects(() => verifyClerkToken(token({ header: { alg }, sign: (body) => crypto.createHmac(hash, CLERK.publicKey.trim()).update(body).digest('base64url') })), alg + ' with the trimmed public key');
    }
    await rejects(() => verifyClerkToken(token({ header: { alg: 'ES256' } })), 'unsupported algorithm');
    await rejects(() => verifyClerkToken(token({ header: { typ: 'at+jwt' } })), 'wrong token type');
  } finally { restore(); }
});

test('C. staging: time. Expired, not yet valid, or issued in the future is rejected', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
    await rejects(() => verifyClerkToken(token({ claims: { iat: now() - 3600, nbf: now() - 3600, exp: now() - 60 } })), 'expired a minute ago');
    await rejects(() => verifyClerkToken(token({ claims: { exp: now() - 86400 } })), 'expired yesterday');
    await rejects(() => verifyClerkToken(token({ claims: { nbf: now() + 600 } })), 'not valid yet');
    await rejects(() => verifyClerkToken(token({ claims: { iat: now() + 600 } })), 'issued in the future');
    await rejects(() => verifyClerkToken(token({ claims: { exp: undefined } })), 'no expiry at all');
    await rejects(() => verifyClerkToken(token({ claims: { exp: 'never' } })), 'expiry is not a time');
  } finally { restore(); }
});

test('C. staging: issuer. A token from any other Clerk instance is rejected, even when correctly signed', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
    for (const iss of ['https://clerk.other-app.example', ISSUER + '/', ISSUER + '.evil.example', 'http://clerk.staging-test.example', ISSUER.toUpperCase(), '', undefined, null, 42, [ISSUER]]) {
      await rejects(() => verifyClerkToken(token({ claims: { iss } })), 'issuer ' + JSON.stringify(iss));
    }
  } finally { restore(); }
});

test('C. staging: intended application. A token issued for another site, or for no site, is rejected', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
    for (const azp of ['https://www.qraivy.com', 'https://evil.example', SITE + '/', SITE + '.evil.example', 'http://voice-preview.staging-test.example', '', undefined, null, [SITE]]) {
      await rejects(() => verifyClerkToken(token({ claims: { azp } })), 'authorized party ' + JSON.stringify(azp));
    }
  } finally { restore(); }
});

test('C. staging: subject and shape. No subject, or something that is not a token, is rejected', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { verifyClerkToken } = require(resolveSrc('utils', 'clerkVerify.js'));
    await rejects(() => verifyClerkToken(token({ claims: { sub: undefined } })), 'no subject');
    await rejects(() => verifyClerkToken(token({ claims: { sub: '' } })), 'empty subject');
    for (const junk of ['', 'abc', 'a.b.c', undefined, null, ALICE, 'Bearer ' + token()]) await rejects(() => verifyClerkToken(junk), 'not a token: ' + String(junk).slice(0, 12));
  } finally { restore(); }
});

// ── D. The allowlist still decides ─────────────────────────────
test('D. staging gate with real verification: only a valid token of an allowlisted account passes', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { policy } = require(resolveSrc('config', 'stagingPolicy.js'));
    const { createStagingGate } = require(resolveSrc('middleware', 'stagingGate.js'));
    const gate = createStagingGate({ allowedUserIds: policy.allowedUserIds, findPageOwner: async () => null });
    const run = (authorization) => new Promise((done) => {
      const r = res(); const req = { method: 'POST', path: '/lp', headers: authorization ? { authorization } : {} };
      const finish = () => done({ code: r.code, passed: false, body: r.body });
      const j = r.json; r.json = (b) => { j(b); finish(); return r; };
      gate(req, r, () => done({ code: 200, passed: true, userId: req.userId }));
    });
    assert.deepEqual(await run('Bearer ' + token()), { code: 200, passed: true, userId: ALICE });
    // valid token, account not on the list
    const stranger = await run('Bearer ' + token({ claims: { sub: MALLORY } }));
    assert.equal(stranger.passed, false); assert.equal(stranger.code, 403); assert.equal(stranger.body.code, 'staging_account');
    // allowlisted name inside an invalid token
    for (const [label, t] of [['other key', token({ key: ATTACKER.privateKey })], ['expired', token({ claims: { exp: now() - 60 } })], ['other instance', token({ claims: { iss: 'https://clerk.other-app.example' } })], ['other site', token({ claims: { azp: 'https://www.qraivy.com' } })]]) {
      const r = await run('Bearer ' + t);
      assert.equal(r.passed, false, label); assert.equal(r.code, 401, label);
    }
    assert.equal((await run(null)).code, 401);
    assert.equal((await run('Bearer ')).code, 401);
    assert.equal((await run(ALICE)).code, 401, 'a bare user id is not a sign-in');
  } finally { restore(); }
});

test('D. the page routes behind the gate verify the same way (requireAuth, optionalAuth, getUserFromToken)', async () => {
  const { restore } = load(STAGING_ENV);
  try {
    const { requireAuth, optionalAuth } = require(resolveSrc('middleware', 'auth.js'));
    const callAuth = (fn, authorization) => new Promise((done) => { const r = res(); const req = { headers: authorization ? { authorization } : {} }; const j = r.json; r.json = (b) => { j(b); done({ code: r.code, userId: req.userId }); return r; }; fn(req, r, () => done({ code: 200, next: true, userId: req.userId })); });
    assert.deepEqual(await callAuth(requireAuth, 'Bearer ' + token()), { code: 200, next: true, userId: ALICE });
    assert.equal((await callAuth(requireAuth, 'Bearer ' + token({ key: ATTACKER.privateKey }))).code, 401);
    assert.equal((await callAuth(requireAuth, 'Bearer ' + token({ claims: { exp: now() - 60 } }))).code, 401);
    assert.deepEqual(await callAuth(optionalAuth, 'Bearer ' + token({ key: ATTACKER.privateKey })), { code: 200, next: true, userId: undefined }, 'a bad token is anonymous, never an identity');
    // getUserFromToken is what POST /lp uses to decide who is publishing
    const source = read(SRC, 'controllers', 'qrController.js');
    const body = source.slice(source.indexOf('async function getUserFromToken'), source.indexOf('// Only ever fetches from Clerk'));
    assert.match(body, /await verifyClerkToken\(token\)/);
    assert.match(body, /return payload\.sub \|\| null;/);
    assert.match(body, /catch \(err\) \{[\s\S]*return null;/);
  } finally { restore(); }
});

// ── E. A staging server cannot start with unsafe sign-in settings ──
test('E. staging refuses to start: Clerk secret present, public key missing, private key supplied, bad issuer or site', () => {
  const { loadStagingPolicy } = require(resolveSrc('config', 'stagingPolicy.js'));
  const ok = loadStagingPolicy(STAGING_ENV);
  assert.equal(ok.clerk.issuer, ISSUER); assert.deepEqual(ok.clerk.authorizedParties.slice(), [SITE]);
  assert.match(ok.clerk.jwtKey, /^-----BEGIN PUBLIC KEY-----/);
  assert.ok(Object.isFrozen(ok.clerk) && Object.isFrozen(ok.clerk.authorizedParties));
  // a key pasted with \n instead of line breaks is the same key
  assert.equal(loadStagingPolicy(Object.assign({}, STAGING_ENV, { CLERK_JWT_KEY: CLERK.publicKey.trim().replace(/\n/g, '\\n') })).clerk.jwtKey, ok.clerk.jwtKey);

  const small = crypto.generateKeyPairSync('rsa', { modulusLength: 1024, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const bad = [
    [{ CLERK_SECRET_KEY: 'sk_live_DO_NOT_PRINT_abc123' }, /CLERK_SECRET_KEY must not exist on a staging server/],
    [{ CLERK_JWT_KEY: '' }, /CLERK_JWT_KEY is required/],
    [{ CLERK_JWT_KEY: CLERK.privateKey }, /must be a PUBLIC key/],
    [{ CLERK_JWT_KEY: 'sk_live_DO_NOT_PRINT_abc123' }, /not a valid RSA 2048 public key/],
    [{ CLERK_JWT_KEY: small.publicKey }, /not a valid RSA 2048 public key/],
    [{ CLERK_JWT_KEY: ec.publicKey }, /not a valid RSA 2048 public key/],
    [{ STAGING_CLERK_ISSUER: '' }, /STAGING_CLERK_ISSUER is required/],
    [{ STAGING_CLERK_ISSUER: 'http://clerk.staging-test.example' }, /STAGING_CLERK_ISSUER must be an https origin/],
    [{ STAGING_CLERK_ISSUER: ISSUER + '/path' }, /STAGING_CLERK_ISSUER must be an https origin/],
    [{ STAGING_CLERK_AUTHORIZED_PARTIES: '' }, /STAGING_CLERK_AUTHORIZED_PARTIES is required/],
    [{ STAGING_CLERK_AUTHORIZED_PARTIES: SITE + ', *' }, /may only contain exact https origins/],
    [{ STAGING_CLERK_AUTHORIZED_PARTIES: 'https://*.staging-test.example' }, /may only contain exact https origins/],
    [{ STAGING_CLERK_AUTHORIZED_PARTIES: SITE + '/' }, /may only contain exact https origins/],
  ];
  for (const [override, expected] of bad) {
    let message = '';
    try { loadStagingPolicy(Object.assign({}, STAGING_ENV, override)); } catch (e) { message = e.message; }
    assert.match(message, /Staging server refused to start/, JSON.stringify(Object.keys(override)));
    assert.match(message, expected);
    assert.ok(!/DO_NOT_PRINT|BEGIN (RSA )?PRIVATE|MII[A-Za-z0-9]/.test(message), 'no setting value in the message');
  }
  // production is not validated at all
  for (const env of [{}, { APP_ENV: 'production', CLERK_SECRET_KEY: 'x' }, { CLERK_JWT_KEY: 'garbage', STAGING_CLERK_ISSUER: 'garbage' }]) assert.equal(loadStagingPolicy(env), null);
});

// ── F. Scope of the change ─────────────────────────────────────
test('F. no bypass, no built-in identity, and nothing outside sign-in verification was touched', () => {
  const verify = read(SRC, 'utils', 'clerkVerify.js');
  const code = verify.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/user_[A-Za-z0-9]{6,}/.test(code), 'no user id in the verification code');
  assert.ok(!/skip|bypass|NODE_ENV|test|debug|localhost/i.test(code), 'no switch that turns verification off');
  assert.equal((code.match(/return /g) || []).length, 2, 'two ways out with a payload: production, and staging after every check');
  assert.match(code, /if \(!stagingPolicy\.policy\) \{\s*return verifyToken\(token, \{ secretKey: process\.env\.CLERK_SECRET_KEY \}\);\s*\}/);

  // the two callers changed only in which function they call
  const diff = (file) => execFileSync('git', ['diff', '79c6c86', '--unified=0', '--', file], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((l) => /^[+-][^+-]/.test(l)).map((l) => l.replace(/\s+$/, ''));
  assert.deepEqual(diff('backend/src/middleware/auth.js'), [
    "-const { verifyToken } = require('@clerk/backend');",
    "+const { verifyClerkToken } = require('../utils/clerkVerify');",
    '-    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });',
    '+    const payload = await verifyClerkToken(token);',
    '-      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });',
    '+      const payload = await verifyClerkToken(token);',
  ]);
  assert.deepEqual(diff('backend/src/controllers/qrController.js'), [
    "-const { verifyToken } = require('@clerk/backend');",
    "+const { verifyClerkToken } = require('../utils/clerkVerify');",
    '-    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });',
    '+    const payload = await verifyClerkToken(token);',
  ]);
  // admin, manager and StadtPocket verification are untouched (and unreachable on staging: the gate answers 404 first)
  const changed = execFileSync('git', ['diff', '79c6c86', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const f of changed) assert.ok(f === 'frontend/public/js/staging-config.js' || !/stadtpocket|adminMiddleware|locationManagerAuth|deals|frontend\//i.test(f), 'untouched: ' + f);
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
