// ============================================================
// walletStudioBusinessPreview.test.js — Phase 3C.6A: proves
// loyaltyAdminController.js's buildProgram() exposes the same
// canonical Business-Wallet-Card-vs-Loyalty-Card signal the real
// Apple/Google pass generators use (resolveStadtPocketContext +
// StampSettings.enabled), for the admin Wallet Pass Studio to
// preview correctly instead of always showing a fake loyalty card.
//
// No test framework dependency: uses Node's built-in `assert` and
// a tiny inline runner, following the same pattern as
// tests/stadtPocketBusinessWallet.test.js. Two separate Prisma
// surfaces are mocked, matching what the real code actually uses:
//   - '../src/utils/prismaClient.js' (a shared singleton) for
//     resolveStadtPocketContext's business/businessLocation reads.
//   - '@prisma/client's PrismaClient class for
//     loyaltyAdminController.js's OWN `new PrismaClient()` instance
//     (pre-existing pattern in that file, unrelated to this phase).
// No real DB connection is ever made.
//
// Run: node tests/walletStudioBusinessPreview.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaUtilPath = resolve('src', 'utils', 'prismaClient.js');
const prismaPkgPath = require.resolve('@prisma/client');

// ── Fixtures for resolveStadtPocketContext (via utils/prismaClient.js) ──

const businesses = {
  'biz-ulm': { id: 'biz-ulm', name: 'Ulm Business', primaryOwnerUserId: 'user-1', status: 'active' },
};
const businessLocations = {
  'biz-ulm': { id: 'bl-1', businessId: 'biz-ulm', locationId: 'loc-ulm', location: { id: 'loc-ulm', name: 'Ulm' } },
};

const utilPrismaMock = {
  business: { async findUnique({ where: { id } }) { return businesses[id] || null; } },
  businessLocation: { async findFirst({ where: { businessId } }) { return businessLocations[businessId] || null; } },
};
require.cache[prismaUtilPath] = { id: prismaUtilPath, filename: prismaUtilPath, loaded: true, exports: utilPrismaMock };

// ── Fixtures for loyaltyAdminController.js's own `new PrismaClient()` ───

const stampSettingsStore = {}; // slug -> { enabled, goal, rewardName }

class FakePrismaClient {
  constructor() {
    this.stampSettings = { async findUnique({ where: { slug } }) { return stampSettingsStore[slug] || null; } };
    this.pass = { async findUnique() { return null; } }; // no pre-existing stamps needed for these tests
    this.stampEntry = { async count() { return 0; } };
    this.rewardEvent = { async count() { return 0; } };
    this.stampToken = {
      async findFirst() { return { token: 'faketoken', expiresAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000) }; },
      async create() { return {}; },
    };
    this.landingPage = { async findMany() { return []; } }; // listPrograms not exercised directly here
  }
}
require.cache[prismaPkgPath] = { id: prismaPkgPath, filename: prismaPkgPath, loaded: true, exports: { PrismaClient: FakePrismaClient } };

const { buildProgram } = require('../src/controllers/loyaltyAdminController');

function makeLandingPage(overrides = {}) {
  return Object.assign({
    id: 'lp-id',
    slug: 'test-slug',
    businessName: 'Test Business',
    businessId: null,
    sections: JSON.stringify({ theme: { accentColor: '#112233' } }),
    createdAt: new Date(),
    updatedAt: new Date(),
  }, overrides);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('StadtPocket + loyalty OFF (no StampSettings row) -> isBusinessWalletCard true, loyaltyEnabled false', async () => {
  const program = await buildProgram(makeLandingPage({ slug: 'sp-off', businessId: 'biz-ulm' }));
  assert.equal(program.isStadtPocketLinked, true);
  assert.equal(program.loyaltyEnabled, false);
  assert.equal(program.isBusinessWalletCard, true);
});

test('StadtPocket + loyalty ON -> isBusinessWalletCard false', async () => {
  stampSettingsStore['sp-on'] = { enabled: true, goal: 10, rewardName: 'Free item' };
  const program = await buildProgram(makeLandingPage({ slug: 'sp-on', businessId: 'biz-ulm' }));
  assert.equal(program.isStadtPocketLinked, true);
  assert.equal(program.loyaltyEnabled, true);
  assert.equal(program.isBusinessWalletCard, false);
});

test('Non-StadtPocket (no businessId), loyalty off -> isBusinessWalletCard false', async () => {
  const program = await buildProgram(makeLandingPage({ slug: 'non-sp-off', businessId: null }));
  assert.equal(program.isStadtPocketLinked, false);
  assert.equal(program.isBusinessWalletCard, false);
});

test('Non-StadtPocket, loyalty on -> isBusinessWalletCard false (existing behavior)', async () => {
  stampSettingsStore['non-sp-on'] = { enabled: true, goal: 8, rewardName: 'Coffee' };
  const program = await buildProgram(makeLandingPage({ slug: 'non-sp-on', businessId: null }));
  assert.equal(program.isStadtPocketLinked, false);
  assert.equal(program.isBusinessWalletCard, false);
});

test('city comes from the canonical StadtPocket context, not fabricated', async () => {
  const program = await buildProgram(makeLandingPage({ slug: 'sp-city-check', businessId: 'biz-ulm' }));
  assert.equal(program.city, 'Ulm');
});

test('missing BusinessLocation -> city is null, never fabricated, still StadtPocket-linked', async () => {
  businesses['biz-no-loc'] = { id: 'biz-no-loc', name: 'No Location Biz', primaryOwnerUserId: 'user-2', status: 'active' };
  const program = await buildProgram(makeLandingPage({ slug: 'sp-no-loc', businessId: 'biz-no-loc' }));
  assert.equal(program.isStadtPocketLinked, true);
  assert.equal(program.city, null);
  assert.equal(program.isBusinessWalletCard, true);
});

test('businessId is echoed back exactly, never invented', async () => {
  const program = await buildProgram(makeLandingPage({ slug: 'sp-id-check', businessId: 'biz-ulm' }));
  assert.equal(program.businessId, 'biz-ulm');
});

test('no schema-dependent fields added: response shape is plain reads off existing LandingPage/StampSettings/Business/BusinessLocation', async () => {
  const program = await buildProgram(makeLandingPage({ slug: 'sp-shape-check', businessId: 'biz-ulm' }));
  // Every new field is derived, not stored — proven by these all being
  // present without any new prisma model/table having been queried above
  // (the mocks only implement business/businessLocation/stampSettings/pass/
  // stampEntry/rewardEvent/stampToken/landingPage — all pre-existing models).
  assert.ok('isStadtPocketLinked' in program);
  assert.ok('isBusinessWalletCard' in program);
  assert.ok('loyaltyEnabled' in program);
  assert.ok('city' in program);
  assert.ok('businessId' in program);
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
