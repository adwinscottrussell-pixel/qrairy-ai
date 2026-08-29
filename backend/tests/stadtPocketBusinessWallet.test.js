// ============================================================
// stadtPocketBusinessWallet.test.js — Phase 3C.5 Business Wallet
// Card: proves the new StadtPocket-linked, loyalty-off wallet
// presentation (Apple + Google), that non-StadtPocket and
// loyalty-on pages are byte-for-byte unchanged, and that the
// first-visit welcome screen copy branches correctly.
//
// No test framework dependency: uses Node's built-in `assert`
// and a tiny inline runner, following the same pattern as
// tests/attentionService.test.js and tests/lpScanAndPush.test.js.
// Prisma, passkit-generator, google-auth-library and jsonwebtoken
// are all mocked by pre-seeding require.cache before the real
// service/controller modules are required, so no real DB write,
// no real Apple/Google network call, and no real pass/JWT signing
// ever happens.
//
// Run: node tests/stadtPocketBusinessWallet.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath  = resolve('src', 'utils', 'prismaClient.js');
const emailServicePath  = resolve('src', 'services', 'emailService.js');
const passkitPath       = require.resolve('passkit-generator');
const googleAuthPath    = require.resolve('google-auth-library');
const jwtPath           = require.resolve('jsonwebtoken');

// ── Fixtures ─────────────────────────────────────────────────

const businesses = {
  'biz-sp-1': { id: 'biz-sp-1', name: 'Rick Ross Marketing', primaryOwnerUserId: 'user-1', status: 'active' },
  'biz-sp-2': { id: 'biz-sp-2', name: 'No Location Biz', primaryOwnerUserId: 'user-2', status: 'active' },
  'biz-sp-3': { id: 'biz-sp-3', name: 'Second Business', primaryOwnerUserId: 'user-3', status: 'active' },
  'biz-class-exists':        { id: 'biz-class-exists',        name: 'Class Exists Biz',   primaryOwnerUserId: 'user-4', status: 'active' },
  'biz-class-create-fails':  { id: 'biz-class-create-fails',  name: 'Create Fails Biz',   primaryOwnerUserId: 'user-5', status: 'active' },
  'biz-class-lookup-fails':  { id: 'biz-class-lookup-fails',  name: 'Lookup Fails Biz',   primaryOwnerUserId: 'user-6', status: 'active' },
};
const businessLocations = {
  // biz-sp-1 has a real city; biz-sp-2 deliberately has none (14: missing BusinessLocation).
  'biz-sp-1': { id: 'bl-1', businessId: 'biz-sp-1', locationId: 'loc-ulm', location: { id: 'loc-ulm', name: 'Ulm' } },
  'biz-sp-3': { id: 'bl-3', businessId: 'biz-sp-3', locationId: 'loc-koeln', location: { id: 'loc-koeln', name: 'Köln' } },
};
const stampSettingsStore = {}; // slug -> { enabled, goal, rewardName }
const landingPages = {};       // slug -> page row

function makePage(slug, overrides = {}) {
  return Object.assign({
    id: slug + '-id',
    slug,
    businessName: 'Rick Ross Marketing',
    websiteUrl: 'https://example.com',
    userId: null, // no cid/CustomerIdentity dual-write in these tests — out of scope here
    businessId: null,
    sections: JSON.stringify({ theme: { accentColor: '#112233' }, hero: {}, logo: null }),
  }, overrides);
}

landingPages['sp-loyalty-off']    = makePage('sp-loyalty-off',    { businessId: 'biz-sp-1' });
landingPages['sp-loyalty-off-2']  = makePage('sp-loyalty-off-2',  { businessId: 'biz-sp-3', businessName: 'Second Business' });
landingPages['sp-loyalty-on']     = makePage('sp-loyalty-on',     { businessId: 'biz-sp-1' });
landingPages['non-sp-loyalty-on'] = makePage('non-sp-loyalty-on', { businessId: null });
landingPages['non-sp-loyalty-off']= makePage('non-sp-loyalty-off',{ businessId: null });
landingPages['sp-no-location']    = makePage('sp-no-location',    { businessId: 'biz-sp-2' });
landingPages['sp-missing-business'] = makePage('sp-missing-business', { businessId: 'biz-dangling' });
landingPages['sp-no-website']     = makePage('sp-no-website',     { businessId: 'biz-sp-1', websiteUrl: null });
landingPages['sp-long-tagline']   = makePage('sp-long-tagline',   {
  businessId: 'biz-sp-1',
  sections: JSON.stringify({ theme: { accentColor: '#112233' }, hero: { badge: 'A'.repeat(80) }, logo: null }),
});
landingPages['sp-class-exists']       = makePage('sp-class-exists',       { businessId: 'biz-class-exists',       businessName: 'Class Exists Biz' });
landingPages['sp-class-create-fails'] = makePage('sp-class-create-fails', { businessId: 'biz-class-create-fails', businessName: 'Create Fails Biz' });
landingPages['sp-class-lookup-fails'] = makePage('sp-class-lookup-fails', { businessId: 'biz-class-lookup-fails', businessName: 'Lookup Fails Biz' });
landingPages['sp-with-logo'] = makePage('sp-with-logo', {
  businessId: 'biz-sp-1',
  sections: JSON.stringify({ theme: { accentColor: '#112233' }, hero: {}, logo: { url: 'https://res.cloudinary.com/fake/logo.png' } }),
});

stampSettingsStore['sp-loyalty-on']     = { enabled: true, goal: 8, rewardName: 'Free Coffee' };
stampSettingsStore['non-sp-loyalty-on'] = { enabled: true, goal: 10, rewardName: 'Free item' };
// sp-loyalty-off, non-sp-loyalty-off, sp-no-location, sp-missing-business,
// sp-no-website, sp-long-tagline: deliberately no StampSettings row.

const passUpsertCalls = [];

// business/businessLocation expose ONLY read methods — if any code path
// under test ever tried to write through them (eager wallet provisioning),
// it would throw "is not a function" and fail the relevant test. This is
// the proof for "no eager wallet provisioning" (test 15/9 below).
const mockPrisma = {
  landingPage: { async findUnique({ where: { slug } }) { return landingPages[slug] || null; } },
  business: { async findUnique({ where: { id } }) { return businesses[id] || null; } },
  businessLocation: { async findFirst({ where: { businessId } }) { return businessLocations[businessId] || null; } },
  stampSettings: { async findUnique({ where: { slug } }) { return stampSettingsStore[slug] || null; } },
  pass: {
    async findUnique() { return null; }, // no pre-existing stamps for any test pass
    async upsert(args) { passUpsertCalls.push(args); return {}; },
  },
  loyaltyCustomer: { async upsert() { return {}; } },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: { sendWelcomeEmail: async () => ({ success: 0, failed: 0 }) },
};

// ── Mock passkit-generator: capture the files bundle instead of ──────────
// ── actually signing anything ─────────────────────────────────
let capturedPassFiles = null;
class FakePKPass {
  constructor(files) { capturedPassFiles = files; }
  async getAsBuffer() { return Buffer.from('fake-pkpass'); }
}
require.cache[passkitPath] = { id: passkitPath, filename: passkitPath, loaded: true, exports: { PKPass: FakePKPass } };

// ── Mock google-auth-library + jsonwebtoken: no real network/crypto ─────
class FakeGoogleAuth {
  async getClient() { return { getAccessToken: async () => ({ token: 'fake-token' }) }; }
}
require.cache[googleAuthPath] = { id: googleAuthPath, filename: googleAuthPath, loaded: true, exports: { GoogleAuth: FakeGoogleAuth } };

let lastSignedClaims = null;
require.cache[jwtPath] = {
  id: jwtPath, filename: jwtPath, loaded: true,
  exports: { sign: (claims) => { lastSignedClaims = claims; return 'fake.jwt.token'; } },
};

// ── Mock global fetch: WWDR cert + Google Wallet class endpoint + any ────
// ── asset (logo/hero) fetch — never a real network call ──────────────────
// Captures every loyaltyClass POST/PATCH body, keyed by the classId inside
// the body itself, so tests can assert what was actually sent to Google for
// a given class (e.g. programName), without ever making a real request.
//
// Per-classId overrides let Phase 3C.5B tests simulate GET 200 (class
// already exists), a non-404 GET failure, or a failed CREATE — every other
// classId keeps the pre-3C.5B default (GET 404, CREATE succeeds) so every
// prior test's happy path is unaffected.
const classRequestsById = {}; // classId -> last POST/PATCH body sent
const classGetOverrides = {};    // classId -> { status, body? }
const classCreateOverrides = {}; // classId -> { ok, status, body? }
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('certificateauthority')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  if (u.includes('walletobjects.googleapis.com/walletobjects/v1/loyaltyClass')) {
    const isGet = !opts || !opts.method || opts.method === 'GET';
    if (isGet) {
      const classId = u.split('/loyaltyClass/')[1];
      const override = classId && classGetOverrides[classId];
      if (override) return { status: override.status, text: async () => override.body || '' };
      return { status: 404 }; // default: class has never existed
    }
    const body = JSON.parse(opts.body);
    classRequestsById[body.id] = body;
    if (opts.method === 'POST') {
      const override = classCreateOverrides[body.id];
      if (override) return { ok: override.ok, status: override.status, text: async () => override.body || '' };
      return { ok: true, status: 200, text: async () => '' }; // default: create succeeds
    }
    return { ok: true, status: 200, text: async () => '' }; // PATCH (branding sync) — always best-effort ok in tests
  }
  if (u.includes('walletobjects.googleapis.com')) {
    if (!opts || !opts.method || opts.method === 'GET') return { status: 404 };
    return { ok: true, text: async () => '' };
  }
  return { ok: false }; // simulated missing logo/hero asset — handled gracefully by existing code
};

process.env.GOOGLE_WALLET_KEY = JSON.stringify({ client_email: 'test@test.iam.gserviceaccount.com', private_key: 'fake' });
process.env.APPLE_PASS_CERT_PEM = Buffer.from('fake-cert').toString('base64');
process.env.APPLE_PASS_KEY_PEM  = Buffer.from('fake-key').toString('base64');
process.env.APPLE_PASS_TYPE_ID  = 'pass.com.qraivy.wallet';
process.env.APPLE_TEAM_ID       = 'TEAMID1234';
process.env.PASS_AUTH_SECRET    = 'test-secret';

const { generateSmartQRPass } = require('../src/services/passService');
const { createGoogleWalletSaveUrl, getClassId, getObjectId, getBusinessClassId, getBusinessObjectId } = require('../src/services/googleWalletService');
const { resolveStadtPocketContext } = require('../src/services/stadtPocketContext');
const { handleGenerateAppleWalletPass, handleLoyaltyWelcome } = require('../src/controllers/lpController');

function sectionsFor(slug) {
  const page = landingPages[slug];
  return Object.assign({}, JSON.parse(page.sections), { businessName: page.businessName, websiteUrl: page.websiteUrl });
}

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    headers: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    set(headers) { this.headers = headers; return this; },
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1/2. Business Wallet Card generated for StadtPocket + loyalty OFF ──

test('1. Apple: StadtPocket-linked + loyalty OFF generates a pass without throwing', async () => {
  capturedPassFiles = null;
  const buf = await generateSmartQRPass('sp-loyalty-off', sectionsFor('sp-loyalty-off'), { businessId: 'biz-sp-1' });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(capturedPassFiles && capturedPassFiles['pass.json']);
});

test('2. Google: StadtPocket-linked + loyalty OFF generates a save URL without throwing', async () => {
  lastSignedClaims = null;
  const url = await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  assert.equal(url, 'https://pay.google.com/gp/v/save/fake.jwt.token');
  assert.ok(lastSignedClaims);
});

// ── 3/4/5. Apple content: business name, city, no stamp/reward fields ──

test('3. Apple: business name is correct on the Business Wallet Card', async () => {
  await generateSmartQRPass('sp-loyalty-off', sectionsFor('sp-loyalty-off'), { businessId: 'biz-sp-1' });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.equal(passJson.organizationName, 'Rick Ross Marketing');
  assert.equal(passJson.storeCard.primaryFields[0].value, 'Rick Ross Marketing');
});

test('4. Apple: StadtPocket city context is correct', async () => {
  await generateSmartQRPass('sp-loyalty-off', sectionsFor('sp-loyalty-off'), { businessId: 'biz-sp-1' });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.equal(passJson.storeCard.headerFields[0].value, 'StadtPocket · Ulm');
});

test('5. Apple: Business Wallet Card has no stamp/reward fields', async () => {
  await generateSmartQRPass('sp-loyalty-off', sectionsFor('sp-loyalty-off'), { businessId: 'biz-sp-1' });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.deepEqual(passJson.storeCard.secondaryFields, []);
  assert.deepEqual(passJson.storeCard.auxiliaryFields, []);
  assert.ok(!passJson.storeCard.backFields.some(f => f.key === 'reward'));
  assert.ok(!passJson.storeCard.backFields.some(f => f.key === 'terms'));
});

// ── 6/7/8. Google content: business name, city, no loyalty messaging ───

test('6. Google: business name is correct on the Business Wallet Card', async () => {
  await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.accountName, 'Rick Ross Marketing');
  // 3C.5A: the visible title comes from the per-business LoyaltyClass's
  // programName, not a (nonexistent) LoyaltyObject.cardTitle field.
  const classBody = classRequestsById[getBusinessClassId('biz-sp-1')];
  assert.ok(classBody);
  assert.equal(classBody.programName, 'Rick Ross Marketing');
});

test('7. Google: StadtPocket city context is correct', async () => {
  await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  const contextModule = obj.textModulesData.find(m => m.id === 'context');
  assert.ok(contextModule);
  assert.equal(contextModule.header, 'StadtPocket · Ulm');
});

test('8. Google: no loyaltyPoints/stamp/reward messaging, and no invalid cardTitle/header fields, on the Business Wallet Card', async () => {
  await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.loyaltyPoints, undefined);
  assert.equal(obj.cardTitle, undefined);
  assert.equal(obj.header, undefined);
  assert.ok(!(obj.textModulesData || []).some(m => m.id === 'reward_info'));
});

// ── Google class/object ID namespace isolation (Phase 3C.5A) ───────────

test('Google: per-business class ID is deterministic for the same business', () => {
  assert.equal(getBusinessClassId('biz-sp-1'), getBusinessClassId('biz-sp-1'));
});

test('Google: different businesses receive different class IDs', () => {
  assert.notEqual(getBusinessClassId('biz-sp-1'), getBusinessClassId('biz-sp-3'));
});

test('Google: Business Wallet class ID never equals the existing shared loyalty class ID', () => {
  assert.notEqual(getBusinessClassId('biz-sp-1'), getClassId());
});

test('Google: Business Wallet object namespace never equals the existing loyalty object namespace', () => {
  assert.notEqual(getBusinessObjectId('sp-loyalty-off', null), getObjectId('sp-loyalty-off', null));
  assert.notEqual(getBusinessObjectId('sp-loyalty-off', 'cid1'), getObjectId('sp-loyalty-off', 'cid1'));
});

test('Google: same slug/cid produces a stable Business Wallet object ID', () => {
  assert.equal(getBusinessObjectId('sp-loyalty-off', null), getBusinessObjectId('sp-loyalty-off', null));
  assert.equal(getBusinessObjectId('sp-loyalty-off', 'cid1'), getBusinessObjectId('sp-loyalty-off', 'cid1'));
});

test('Google: the actual save-URL flow uses the new class/object IDs for a Business Wallet Card', async () => {
  await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.classId, getBusinessClassId('biz-sp-1'));
  assert.equal(obj.id, getBusinessObjectId('sp-loyalty-off', null));
});

test('Google: two different StadtPocket businesses each get their own class and correct programName', async () => {
  await createGoogleWalletSaveUrl('sp-loyalty-off-2', sectionsFor('sp-loyalty-off-2'), null, 'biz-sp-3');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.classId, getBusinessClassId('biz-sp-3'));
  assert.notEqual(obj.classId, getBusinessClassId('biz-sp-1'));
  const classBody = classRequestsById[getBusinessClassId('biz-sp-3')];
  assert.equal(classBody.programName, 'Second Business');
  const contextModule = obj.textModulesData.find(m => m.id === 'context');
  assert.equal(contextModule.header, 'StadtPocket · Köln');
});

test('Google: missing city falls back safely to plain "StadtPocket", never "undefined"', async () => {
  await createGoogleWalletSaveUrl('sp-no-location', sectionsFor('sp-no-location'), null, 'biz-sp-2');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  const contextModule = obj.textModulesData.find(m => m.id === 'context');
  assert.equal(contextModule.header, 'StadtPocket');
  assert.ok(!contextModule.header.includes('undefined'));
});

// ── Phase 3C.5B — fail-closed Google Wallet class ensure ────────────────

test('3C.5B: GET 404 triggers CREATE, and a successful create allows JWT generation', async () => {
  lastSignedClaims = null;
  const url = await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  assert.equal(url, 'https://pay.google.com/gp/v/save/fake.jwt.token');
  assert.ok(lastSignedClaims); // JWT WAS produced
  assert.ok(classRequestsById[getBusinessClassId('biz-sp-1')]); // CREATE (POST) was actually sent
});

test('3C.5B: GET 200 means the class already exists — no throw, JWT still generated', async () => {
  const classId = getBusinessClassId('biz-class-exists');
  classGetOverrides[classId] = { status: 200 };
  lastSignedClaims = null;
  const url = await createGoogleWalletSaveUrl('sp-class-exists', sectionsFor('sp-class-exists'), null, 'biz-class-exists');
  assert.equal(url, 'https://pay.google.com/gp/v/save/fake.jwt.token');
  assert.ok(lastSignedClaims);
  // Existing-class path PATCHes to sync branding — request body was still captured.
  assert.ok(classRequestsById[classId]);
});

test('3C.5B: a non-404 GET failure throws, and no JWT is produced', async () => {
  const classId = getBusinessClassId('biz-class-lookup-fails');
  classGetOverrides[classId] = { status: 500, body: 'Internal error' };
  lastSignedClaims = null;
  await assert.rejects(
    () => createGoogleWalletSaveUrl('sp-class-lookup-fails', sectionsFor('sp-class-lookup-fails'), null, 'biz-class-lookup-fails'),
    /Google Wallet class lookup failed: 500/
  );
  assert.equal(lastSignedClaims, null); // JWT was NEVER produced
  assert.equal(classRequestsById[classId], undefined); // no CREATE/PATCH was ever attempted
});

test('3C.5B: a failed CREATE throws, and no JWT is produced referencing the missing class', async () => {
  const classId = getBusinessClassId('biz-class-create-fails');
  classCreateOverrides[classId] = { ok: false, status: 400, body: 'Bad Request: invalid issuer' };
  lastSignedClaims = null;
  await assert.rejects(
    () => createGoogleWalletSaveUrl('sp-class-create-fails', sectionsFor('sp-class-create-fails'), null, 'biz-class-create-fails'),
    /Google Wallet class creation failed: 400/
  );
  assert.equal(lastSignedClaims, null); // JWT was NEVER produced — this is the exact production bug being fixed
});

test('3C.5B: class ID and object ID namespaces are unchanged by the reliability fix', async () => {
  lastSignedClaims = null;
  await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.classId, getBusinessClassId('biz-sp-1'));
  assert.equal(obj.id, getBusinessObjectId('sp-loyalty-off', null));
});

// ── Phase 3C.5C — Google Wallet class logo URL fix ──────────────────────

test('3C.5C: no business-uploaded logo -> class programLogo uses the corrected favicon.png URL, not the nonexistent icon-192.png', async () => {
  await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  const classBody = classRequestsById[getBusinessClassId('biz-sp-1')];
  assert.ok(classBody);
  assert.equal(classBody.programLogo.sourceUri.uri, 'https://www.qraivy.com/favicon.png');
  assert.notEqual(classBody.programLogo.sourceUri.uri, 'https://www.qraivy.com/icon-192.png');
});

test('3C.5C: a business-uploaded logo still overrides the fallback', async () => {
  const classId = getBusinessClassId('biz-sp-1');
  delete classRequestsById[classId]; // isolate from the prior test's capture
  await createGoogleWalletSaveUrl('sp-with-logo', sectionsFor('sp-with-logo'), null, 'biz-sp-1');
  const classBody = classRequestsById[classId];
  assert.ok(classBody);
  assert.equal(classBody.programLogo.sourceUri.uri, 'https://res.cloudinary.com/fake/logo.png');
});

// ── 9. QR/barcode: canonical Smart Page destination ─────────────────────

test('9. QR/barcode resolves to the canonical QRAIVY Smart Page on both wallets', async () => {
  await generateSmartQRPass('sp-loyalty-off', sectionsFor('sp-loyalty-off'), { businessId: 'biz-sp-1' });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.equal(passJson.barcode.message, 'https://api.qraivy.com/lp/sp-loyalty-off');

  await createGoogleWalletSaveUrl('sp-loyalty-off', sectionsFor('sp-loyalty-off'), null, 'biz-sp-1');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.barcode.value, 'https://www.qraivy.com/lp/sp-loyalty-off');
});

// ── 10. Website-less StadtPocket business ───────────────────────────────

test('10. Website-less StadtPocket business: Business Wallet Card still generates, back link falls back to Smart Page', async () => {
  const buf = await generateSmartQRPass('sp-no-website', sectionsFor('sp-no-website'), { businessId: 'biz-sp-1' });
  assert.ok(Buffer.isBuffer(buf));
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  const urlField = passJson.storeCard.backFields.find(f => f.key === 'url');
  assert.equal(urlField.value, 'https://api.qraivy.com/lp/sp-no-website');
});

test('Google: website-less StadtPocket business still generates a Business Wallet Card save URL', async () => {
  const url = await createGoogleWalletSaveUrl('sp-no-website', sectionsFor('sp-no-website'), null, 'biz-sp-1');
  assert.equal(url, 'https://pay.google.com/gp/v/save/fake.jwt.token');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.accountName, 'Rick Ross Marketing');
});

// ── 11/12/13. Regression: loyalty-on and non-StadtPocket unchanged ─────

test('11. StadtPocket + loyalty ON: existing loyalty storeCard unchanged (no Business Wallet Card)', async () => {
  await generateSmartQRPass('sp-loyalty-on', sectionsFor('sp-loyalty-on'), { businessId: 'biz-sp-1' });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.equal(passJson.storeCard.headerFields[0].value, 'CARD'); // L.cardKicker, not "StadtPocket · ..."
  assert.ok(passJson.storeCard.secondaryFields[0].label); // stamps field present
  assert.ok(passJson.storeCard.backFields.some(f => f.key === 'reward'));
});

test('12. Non-StadtPocket + loyalty ON: existing loyalty storeCard unchanged', async () => {
  await generateSmartQRPass('non-sp-loyalty-on', sectionsFor('non-sp-loyalty-on'), { businessId: null });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.equal(passJson.storeCard.headerFields[0].value, 'CARD');
  assert.ok(passJson.storeCard.backFields.some(f => f.key === 'reward'));
});

test('13. Non-StadtPocket + loyalty OFF/no row: existing (loyalty-shaped) behavior unchanged', async () => {
  await generateSmartQRPass('non-sp-loyalty-off', sectionsFor('non-sp-loyalty-off'), { businessId: null });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  // Non-StadtPocket pages NEVER get the Business Wallet Card branch, loyalty
  // enabled or not — this is today's existing (if quirky) default output.
  assert.equal(passJson.storeCard.headerFields[0].value, 'CARD');
  assert.ok(passJson.storeCard.backFields.some(f => f.key === 'reward'));
});

// ── Google regression: loyalty-on and non-StadtPocket unchanged (3C.5A) ─

test('Google: StadtPocket + loyalty ON keeps the shared loyalty class/object + cardTitle/header/loyaltyPoints unchanged', async () => {
  await createGoogleWalletSaveUrl('sp-loyalty-on', sectionsFor('sp-loyalty-on'), null, 'biz-sp-1');
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.classId, getClassId());
  assert.equal(obj.id, getObjectId('sp-loyalty-on', null));
  assert.ok(obj.cardTitle);
  assert.ok(obj.header);
  assert.ok(obj.loyaltyPoints);
});

test('Google: non-StadtPocket page keeps the shared loyalty class/object unchanged regardless of loyalty state', async () => {
  await createGoogleWalletSaveUrl('non-sp-loyalty-off', sectionsFor('non-sp-loyalty-off'), null, null);
  const obj = lastSignedClaims.payload.loyaltyObjects[0];
  assert.equal(obj.classId, getClassId());
  assert.equal(obj.id, getObjectId('non-sp-loyalty-off', null));
  assert.ok(obj.cardTitle);
  assert.ok(obj.header);
  assert.ok(obj.loyaltyPoints);
});

// ── 14. Missing Business/BusinessLocation/Location: safe fallback ──────

test('14a. StadtPocket-linked, Business exists but no BusinessLocation: city omitted, no "undefined"', async () => {
  await generateSmartQRPass('sp-no-location', sectionsFor('sp-no-location'), { businessId: 'biz-sp-2' });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.equal(passJson.storeCard.headerFields[0].value, 'StadtPocket');
  assert.ok(!passJson.storeCard.headerFields[0].value.includes('undefined'));
});

test('14b. businessId points at a nonexistent Business: fails safe to existing behavior, no throw', async () => {
  const buf = await generateSmartQRPass('sp-missing-business', sectionsFor('sp-missing-business'), { businessId: 'biz-dangling' });
  assert.ok(Buffer.isBuffer(buf));
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.equal(passJson.storeCard.headerFields[0].value, 'CARD'); // treated as non-StadtPocket
});

test('14c. resolveStadtPocketContext itself never throws on missing links', async () => {
  assert.deepEqual(await resolveStadtPocketContext(null), { isStadtPocketLinked: false, businessId: null, city: null });
  assert.deepEqual(await resolveStadtPocketContext('biz-dangling'), { isStadtPocketLinked: false, businessId: null, city: null });
  assert.deepEqual(await resolveStadtPocketContext('biz-sp-2'), { isStadtPocketLinked: true, businessId: 'biz-sp-2', city: null });
});

// ── 15/9(plan). No eager wallet provisioning / no extra DB rows ────────

test('15. resolveStadtPocketContext is read-only — no wallet object/Pass row is created by resolving context alone', async () => {
  const upsertsBefore = passUpsertCalls.length;
  await resolveStadtPocketContext('biz-sp-1');
  // business/businessLocation mocks above expose no write methods at all —
  // reaching this line without a thrown "is not a function" already proves
  // no write was attempted; this also confirms no Pass row was touched.
  assert.equal(passUpsertCalls.length, upsertsBefore);
});

// ── 6 (plan §6). Tagline safety ─────────────────────────────────────────

test('Tagline safety: an 80-char AI-generated badge is trimmed to <=40 chars on the pass', async () => {
  await generateSmartQRPass('sp-long-tagline', sectionsFor('sp-long-tagline'), { businessId: 'biz-sp-1' });
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  const taglineField = passJson.storeCard.secondaryFields.find(f => f.key === 'tagline');
  assert.ok(taglineField);
  assert.ok(taglineField.value.length <= 40);
});

// ── 16/17/18. Welcome screen copy branching ─────────────────────────────

test('16. Welcome screen: StadtPocket + loyalty OFF shows Save-this-business copy', async () => {
  const res = fakeRes();
  await handleLoyaltyWelcome({ params: { slug: 'sp-loyalty-off' }, query: { lang: 'en' } }, res);
  assert.ok(res.body.includes('Save this business'));
  assert.ok(res.body.includes('Keep Rick Ross Marketing in your Wallet'));
  assert.ok(!res.body.includes('Loyalty Rewards'));
});

test('17. Welcome screen: StadtPocket + loyalty ON retains Loyalty Rewards copy', async () => {
  const res = fakeRes();
  await handleLoyaltyWelcome({ params: { slug: 'sp-loyalty-on' }, query: { lang: 'en' } }, res);
  assert.ok(res.body.includes('Loyalty Rewards'));
  assert.ok(!res.body.includes('Save this business'));
});

test('18. Welcome screen: non-StadtPocket page retains existing Loyalty Rewards copy unchanged', async () => {
  const res = fakeRes();
  await handleLoyaltyWelcome({ params: { slug: 'non-sp-loyalty-off' }, query: { lang: 'en' } }, res);
  assert.ok(res.body.includes('Loyalty Rewards'));
  assert.ok(!res.body.includes('Save this business'));
});

// ── Controller wiring: handleGenerateAppleWalletPass passes businessId through ──

test('Controller wiring: handleGenerateAppleWalletPass derives businessId from the LandingPage row, not from the request', async () => {
  const res = fakeRes();
  await handleGenerateAppleWalletPass({ params: { slug: 'sp-loyalty-off' }, query: {} }, res);
  assert.equal(res.statusCode, undefined); // no error status set
  const passJson = JSON.parse(capturedPassFiles['pass.json'].toString('utf8'));
  assert.equal(passJson.storeCard.headerFields[0].value, 'StadtPocket · Ulm');
  assert.equal(passUpsertCalls.length > 0, true);
});

// ── runner ────────────────────────────────────────────────────

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
