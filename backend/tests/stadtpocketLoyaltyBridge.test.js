// ============================================================
// stadtpocketLoyaltyBridge.test.js — mocked-Prisma tests for Stempelkarte
// Phase 2: connecting/disconnecting an EXISTING QRAIVY loyalty program
// (LandingPage + StampSettings) to a StadtPocketListingLocation via
// loyaltyLandingPageId.
//
// Tests the service layer (stadtpocketLoyaltyBridgeService.js) directly
// with hand-constructed `scope` objects (the same shape
// middleware/stadtpocketManagerAuth.js already produces and
// stadtpocketManagerService.js's own exported functions already
// consume) -- no Clerk mocking needed, since authorization-consuming
// logic is already separated from token verification in this codebase.
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the same pattern as
// tests/stadtpocketPublic.test.js and tests/stadtpocketManagerWrite.test.js.
//
// Run: node tests/stadtpocketLoyaltyBridge.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');

const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';

let listingLocationRows = [];
let landingPageRows = [];
let stampSettingsRows = [];
let businessLocationRows = [];
let seq = 0;

function resetFixtures() {
  listingLocationRows = [];
  landingPageRows = [];
  stampSettingsRows = [];
  businessLocationRows = [];
  seq = 0;
}

// Staib's own StadtPocketListingLocation -- unclaimed by default
// (businessLocationId: null), matching the real, currently-verified
// state of every StadtPocket listing today (see this phase's own audit).
function addListingLocation({ id = 'll_staib', locationId = ULM, businessLocationId = null, loyaltyLandingPageId = null } = {}) {
  listingLocationRows.push({ id, locationId, businessLocationId, loyaltyLandingPageId });
  return listingLocationRows[listingLocationRows.length - 1];
}

function addBusinessLocation({ id, businessId }) {
  businessLocationRows.push({ id, businessId });
}

function addLandingPage({ id, slug, businessName = 'Test Business', businessId = null }) {
  landingPageRows.push({ id, slug, businessName, businessId, userId: 'some_owner', websiteUrl: null, useCase: null });
}

function addStampSettings({ slug, goal = 10, rewardName = 'Free item', enabled = true }) {
  stampSettingsRows.push({ id: `ss_${++seq}`, slug, goal, rewardName, enabled, color: '#ff5a1f' });
}

const mockPrisma = {
  stadtPocketListingLocation: {
    findUnique: async ({ where }) => listingLocationRows.find((ll) => ll.id === where.id) || null,
    update: async ({ where, data }) => {
      const ll = listingLocationRows.find((r) => r.id === where.id);
      if (!ll) throw new Error('row not found');
      Object.assign(ll, data);
      return { ...ll };
    },
  },
  landingPage: {
    findUnique: async ({ where }) => landingPageRows.find((lp) => lp.id === where.id) || null,
    findMany: async ({ where, take }) => {
      let rows = landingPageRows;
      if (where && where.businessId) rows = rows.filter((lp) => lp.businessId === where.businessId);
      if (where && where.slug && where.slug.contains != null) {
        const q = where.slug.contains;
        rows = rows.filter((lp) => lp.slug.includes(q));
      }
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => ({ ...r }));
    },
  },
  stampSettings: {
    findUnique: async ({ where }) => stampSettingsRows.find((s) => s.slug === where.slug) || null,
    findMany: async ({ where }) => {
      let rows = stampSettingsRows;
      if (where.slug && where.slug.in) rows = rows.filter((s) => where.slug.in.includes(s.slug));
      if (where.enabled != null) rows = rows.filter((s) => s.enabled === where.enabled);
      return rows.map((r) => ({ ...r }));
    },
  },
  businessLocation: {
    findUnique: async ({ where }) => businessLocationRows.find((bl) => bl.id === where.id) || null,
  },
  // Deliberately NOT defined -- this Admin flow must never read or write
  // customer-specific data.
  loyaltyCustomer: undefined,
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const {
  listEligiblePrograms,
  getBridgeState,
  connectProgram,
  disconnectProgram,
} = require('../src/services/stadtpocketLoyaltyBridgeService');
const { StadtpocketManagerError } = require('../src/services/stadtpocketManagerService');

const GLOBAL_ADMIN = { userId: 'admin1', isGlobalAdmin: true };
const ulmManager = (extraLocationIds = []) => ({ userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM, ...extraLocationIds] });
const stuttgartManager = { userId: 'stuttgart_manager', isGlobalAdmin: false, locationIds: [STUTTGART] };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function expectError(fn, matchStatus) {
  try {
    await fn();
  } catch (err) {
    if (matchStatus != null) assert.equal(err.status, matchStatus);
    return err;
  }
  throw new Error('expected an error, none was thrown');
}

// ── 1/8. Authorized listing + eligible listing ──────────────────

test('Global Admin can list eligible programs by slug search', async () => {
  resetFixtures();
  addListingLocation();
  addLandingPage({ id: 'lp1', slug: 'baeckerei-staib-loyalty', businessName: 'Bäckerei Staib' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty', goal: 10, rewardName: 'Gratis Kaffee' });
  const programs = await listEligiblePrograms(ULM, 'll_staib', GLOBAL_ADMIN, { q: 'staib' });
  assert.equal(programs.length, 1);
  assert.deepEqual(programs[0], {
    landingPageId: 'lp1', slug: 'baeckerei-staib-loyalty', businessName: 'Bäckerei Staib',
    requiredStamps: 10, rewardTitle: 'Gratis Kaffee',
  });
});

test('out-of-scope City Manager cannot even list -- Forbidden before any eligibility question', async () => {
  resetFixtures();
  addListingLocation();
  await expectError(() => listEligiblePrograms(ULM, 'll_staib', stuttgartManager, {}), 403);
});

// ── 2/3. Connect + bridge persists ───────────────────────────────

test('valid program can be connected, and the bridge persists loyaltyLandingPageId', async () => {
  resetFixtures();
  const ll = addListingLocation();
  addLandingPage({ id: 'lp1', slug: 'baeckerei-staib-loyalty', businessName: 'Bäckerei Staib' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty', goal: 10, rewardName: 'Gratis Kaffee' });
  const result = await connectProgram(ULM, 'll_staib', GLOBAL_ADMIN, 'lp1');
  assert.deepEqual(result, {
    landingPageId: 'lp1', slug: 'baeckerei-staib-loyalty', businessName: 'Bäckerei Staib',
    requiredStamps: 10, rewardTitle: 'Gratis Kaffee',
  });
  assert.equal(ll.loyaltyLandingPageId, 'lp1'); // persisted, not just returned
  const state = await getBridgeState(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.equal(state.connected, true);
  assert.equal(state.program.landingPageId, 'lp1');
});

// ── 4. Disconnect ─────────────────────────────────────────────

test('disconnecting sets loyaltyLandingPageId back to null', async () => {
  resetFixtures();
  const ll = addListingLocation({ loyaltyLandingPageId: 'lp1' });
  addLandingPage({ id: 'lp1', slug: 'baeckerei-staib-loyalty' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty' });
  const before = await getBridgeState(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.equal(before.connected, true);
  const result = await disconnectProgram(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.deepEqual(result, { connected: false });
  assert.equal(ll.loyaltyLandingPageId, null);
  const after = await getBridgeState(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.equal(after.connected, false);
});

// ── 5. Unrelated business's LandingPage cannot be connected ─────

test('a scoped City Manager cannot connect a LandingPage belonging to an unrelated, unclaimed-here business', async () => {
  resetFixtures();
  addListingLocation(); // unclaimed: businessLocationId null
  addLandingPage({ id: 'lp_other', slug: 'other-business-loyalty', businessId: 'biz_other', businessName: 'Some Other Business' });
  addStampSettings({ slug: 'other-business-loyalty' });
  const err = await expectError(() => connectProgram(ULM, 'll_staib', ulmManager(), 'lp_other'), 403);
  assert.match(err.message, /does not belong to this business/i);
});

test('a scoped City Manager CAN connect a LandingPage whose businessId matches the listing\'s own claimed business', async () => {
  resetFixtures();
  addBusinessLocation({ id: 'bl_staib', businessId: 'biz_staib' });
  const ll = addListingLocation({ businessLocationId: 'bl_staib' });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty', businessId: 'biz_staib', businessName: 'Bäckerei Staib' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty' });
  await connectProgram(ULM, 'll_staib', ulmManager(), 'lp_staib');
  assert.equal(ll.loyaltyLandingPageId, 'lp_staib');
});

// ── 6. Nonexistent LandingPage rejected ──────────────────────────

test('a nonexistent landingPageId is rejected', async () => {
  resetFixtures();
  addListingLocation();
  await expectError(() => connectProgram(ULM, 'll_staib', GLOBAL_ADMIN, 'lp_does_not_exist'), 404);
});

// ── 7. LandingPage without a valid StampSettings program rejected ──

test('a LandingPage with no StampSettings row at all is rejected', async () => {
  resetFixtures();
  addListingLocation();
  addLandingPage({ id: 'lp1', slug: 'no-program-here' });
  // no addStampSettings() call
  await expectError(() => connectProgram(ULM, 'll_staib', GLOBAL_ADMIN, 'lp1'), 400);
});

test('a LandingPage whose StampSettings.enabled is false is rejected', async () => {
  resetFixtures();
  addListingLocation();
  addLandingPage({ id: 'lp1', slug: 'disabled-program' });
  addStampSettings({ slug: 'disabled-program', enabled: false });
  await expectError(() => connectProgram(ULM, 'll_staib', GLOBAL_ADMIN, 'lp1'), 400);
});

test('a disabled program never appears in the eligible list either', async () => {
  resetFixtures();
  addListingLocation();
  addLandingPage({ id: 'lp1', slug: 'disabled-program' });
  addStampSettings({ slug: 'disabled-program', enabled: false });
  const programs = await listEligiblePrograms(ULM, 'll_staib', GLOBAL_ADMIN, {});
  assert.deepEqual(programs, []);
});

// ── 8. Out-of-scope ListingLocation rejected ─────────────────────

test('a City Manager outside this location\'s scope cannot connect, disconnect, or read state', async () => {
  resetFixtures();
  addListingLocation();
  addLandingPage({ id: 'lp1', slug: 'baeckerei-staib-loyalty' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty' });
  await expectError(() => connectProgram(ULM, 'll_staib', stuttgartManager, 'lp1'), 403);
  await expectError(() => disconnectProgram(ULM, 'll_staib', stuttgartManager), 403);
  await expectError(() => getBridgeState(ULM, 'll_staib', stuttgartManager), 403);
});

test('a caller-supplied listingLocationId that does not belong to the given city is rejected (404, not leaked)', async () => {
  resetFixtures();
  addListingLocation({ id: 'll_staib', locationId: ULM });
  await expectError(() => getBridgeState(STUTTGART, 'll_staib', GLOBAL_ADMIN), 404);
});

// ── Honest no-loyalty states ──────────────────────────────────

test('no bridge set -- getBridgeState reports connected: false, no fabricated program', async () => {
  resetFixtures();
  addListingLocation();
  const state = await getBridgeState(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.deepEqual(state, { connected: false });
});

test('unclaimed listing (businessLocationId null) -- City Manager sees zero eligible programs, never an error', async () => {
  resetFixtures();
  addListingLocation();
  addLandingPage({ id: 'lp1', slug: 'someone-elses-program', businessId: 'biz_x' });
  addStampSettings({ slug: 'someone-elses-program' });
  const programs = await listEligiblePrograms(ULM, 'll_staib', ulmManager(), {});
  assert.deepEqual(programs, []);
});

// ── Security: never exposes customer-specific or internal fields ──

test('program summaries never include customer-specific or internal fields', async () => {
  resetFixtures();
  addListingLocation();
  addLandingPage({ id: 'lp1', slug: 'baeckerei-staib-loyalty', businessName: 'Bäckerei Staib' });
  addStampSettings({ slug: 'baeckerei-staib-loyalty' });
  const [program] = await listEligiblePrograms(ULM, 'll_staib', GLOBAL_ADMIN, {});
  assert.deepEqual(Object.keys(program).sort(), ['businessName', 'landingPageId', 'requiredStamps', 'rewardTitle', 'slug'].sort());
  for (const forbidden of [
    'customerId', 'cid', 'currentStamps', 'totalStamps', 'rewardsEarned', 'rewardReady',
    'hasWallet', 'stampCount', 'userId', 'websiteUrl', 'useCase', 'color', 'id',
  ]) {
    assert.equal(forbidden in program, false, `program summary must not expose "${forbidden}"`);
  }
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
