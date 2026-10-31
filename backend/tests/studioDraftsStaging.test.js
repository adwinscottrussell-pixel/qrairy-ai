// ============================================================
// studioDraftsStaging.test.js — Studio V3 Phase D1: verified email on a
// staging server (APP_ENV=staging, no Clerk secret).
//
// Real tokens signed with a test RSA key, verified by the real
// @clerk/backend through utils/clerkVerify.js (public key, issuer, azp), then
// requireAuth -> requireVerifiedEmail exactly as on the Studio routes.
// Checked: only a signed token whose email_verified claim is exactly true
// passes; false, missing, "true" (a string) or 1 are refused; a forged or
// tampered claim never passes (the signature covers it); no Clerk API call
// is made on staging; the request body can never supply the flag.
// In production mode (no staging policy) the decision is the live Clerk
// lookup and the token claim is ignored.
//
// Run: node tests/studioDraftsStaging.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'src');
const resolveSrc = (...p) => require.resolve(path.join(SRC, ...p));
const pair = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const CLERK = pair();
const ATTACKER = pair();
const ISSUER = 'https://clerk.staging-test.example';
const SITE = 'https://studio-preview.staging-test.example';
const ALICE = 'user_2aliceTESTaccount0001';
const STAGING_ENV = {
  APP_ENV: 'staging', STAGING_ALLOWED_USER_IDS: ALICE, STAGING_VOICE_RECORDING_CEILING: '25', VOICE_AUDIO_FOLDER: 'qraivy-voices-staging',
  CLOUDINARY_CLOUD_NAME: 'staging-cloud-example', CLERK_JWT_KEY: CLERK.publicKey, STAGING_CLERK_ISSUER: ISSUER, STAGING_CLERK_AUTHORIZED_PARTIES: SITE,
};
const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
function token(claims = {}, key = CLERK.privateKey) {
  const p = Object.assign({ sub: ALICE, iss: ISSUER, azp: SITE, sid: 'sess_test', iat: now() - 5, nbf: now() - 5, exp: now() + 60 }, claims);
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  const body = b64({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' }) + '.' + b64(p);
  return body + '.' + crypto.sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
}

// the Clerk backend API must never be called on staging
const clerkPkg = require.resolve('@clerk/backend');
const realClerk = require('@clerk/backend');
let clerkApiCalls = 0;
const clerkVerified = new Map();
require.cache[clerkPkg] = { id: clerkPkg, filename: clerkPkg, loaded: true, exports: Object.assign({}, realClerk, {
  createClerkClient: () => ({ users: { getUser: async (id) => { clerkApiCalls++; return { id, primaryEmailAddressId: 'e', emailAddresses: [{ id: 'e', verification: { status: clerkVerified.get(id) ? 'verified' : 'unverified' } }] }; } } }),
}) };
const realError = console.error;
console.error = (...a) => { if (!/^\[(auth|clerkEmailSync)\]/.test(String(a[0]))) realError(...a); };

const ENV_KEYS = Object.keys(STAGING_ENV).concat(['CLERK_SECRET_KEY']);
function load(env) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  for (const f of [['config', 'stagingPolicy.js'], ['utils', 'clerkVerify.js'], ['utils', 'clerkEmailSync.js'], ['middleware', 'auth.js'], ['lpV3', 'draftPolicy.js']]) delete require.cache[resolveSrc(...f)];
  const { requireAuth } = require(resolveSrc('middleware', 'auth.js'));
  const { requireVerifiedEmail } = require(resolveSrc('lpV3', 'draftPolicy.js'));
  const restore = () => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
  return { requireAuth, requireVerifiedEmail, restore };
}
// requireAuth -> requireVerifiedEmail -> the route, as in lpV3/studioPagesRoutes.js
async function through(m, tok, body) {
  const req = { headers: tok ? { authorization: 'Bearer ' + tok } : {}, body: body || {} };
  const res = { code: 200, body: null, status(c) { res.code = c; return res; }, json(b) { res.body = b; return res; }, set() { return res; } };
  let reached = false;
  await new Promise((done) => {
    const json = res.json;
    res.json = (b) => { json(b); done(); return res; };
    m.requireAuth(req, res, () => m.requireVerifiedEmail(req, res, () => { reached = true; done(); }));
  });
  return { code: reached ? 200 : res.code, error: res.body && res.body.error, reached };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('staging: only a signed token with email_verified exactly true passes; false, missing, "true", 1 are refused (403 email_unverified)', async () => {
  const m = load(STAGING_ENV);
  try {
    assert.equal((await through(m, token({ email_verified: true }))).reached, true);
    for (const v of [false, undefined, 'true', 1, null, {}]) {
      const r = await through(m, token({ email_verified: v }));
      assert.deepEqual([r.reached, r.code, r.error], [false, 403, 'email_unverified'], JSON.stringify(v));
    }
    assert.equal(clerkApiCalls, 0, 'no Clerk API call on staging');
  } finally { m.restore(); }
});

test('staging: a forged or tampered claim never passes (signature, issuer, site); a body flag is never read', async () => {
  const m = load(STAGING_ENV);
  try {
    // signed by another key
    assert.deepEqual([(await through(m, token({ email_verified: true }, ATTACKER.privateKey))).code], [401]);
    // a real token whose payload was changed to claim verification
    const real = token({ email_verified: false });
    const [h, , s] = real.split('.');
    const forged = h + '.' + b64(Object.assign(JSON.parse(Buffer.from(real.split('.')[1], 'base64url')), { email_verified: true })) + '.' + s;
    assert.equal((await through(m, forged)).code, 401);
    // another Clerk instance or another site
    assert.equal((await through(m, token({ email_verified: true, iss: 'https://clerk.other.example' }))).code, 401);
    assert.equal((await through(m, token({ email_verified: true, azp: 'https://www.qraivy.com' }))).code, 401);
    // expired
    assert.equal((await through(m, token({ email_verified: true, exp: now() - 120, iat: now() - 300, nbf: now() - 300 }))).code, 401);
    // the body cannot help
    const r = await through(m, token({}), { emailVerified: true, email_verified: true });
    assert.deepEqual([r.reached, r.code], [false, 403]);
  } finally { m.restore(); }
});

test('production mode: the live Clerk lookup decides; the token claim is ignored either way; a failed lookup refuses', async () => {
  // production verifies with the secret key; here the token check itself is mocked to return claims
  const realVerify = realClerk.verifyToken;
  require.cache[clerkPkg].exports.verifyToken = async (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'));
  const m = load({ CLERK_SECRET_KEY: 'sk_test_placeholder' });
  try {
    clerkApiCalls = 0;
    clerkVerified.set(ALICE, false);
    assert.equal((await through(m, token({ email_verified: true }))).code, 403, 'a claim in the token is not enough in production');
    clerkVerified.set(ALICE, true);
    assert.equal((await through(m, token({ email_verified: false }))).reached, true, 'Clerk says verified');
    assert.equal(clerkApiCalls, 2, 'one live lookup per request, never cached');
    const getUser = require.cache[clerkPkg].exports.createClerkClient;
    require.cache[clerkPkg].exports.createClerkClient = () => ({ users: { getUser: async () => { throw new Error('Clerk down'); } } });
    delete require.cache[resolveSrc('utils', 'clerkEmailSync.js')];
    const m2 = load({ CLERK_SECRET_KEY: 'sk_test_placeholder' });
    assert.equal((await through(m2, token({ email_verified: true }))).code, 403, 'fail closed');
    require.cache[clerkPkg].exports.createClerkClient = getUser;
  } finally { m.restore(); require.cache[clerkPkg].exports.verifyToken = realVerify; }
});

(async () => {
  let passed = 0, failed = 0;
  console.log('studioDraftsStaging');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + String(e && e.message).split('\n').slice(0, 10).join('\n       ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
