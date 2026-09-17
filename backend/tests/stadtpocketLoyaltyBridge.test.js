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
let businessRows = [];
let seq = 0;

function resetFixtures() {
  listingLocationRows = [];
  landingPageRows = [];
  stampSettingsRows = [];
  businessLocationRows = [];
  businessRows = [];
  seq = 0;
}

// Staib's own StadtPocketListingLocation -- unclaimed by default
// (businessLocationId: null), matching the real, currently-verified
// state of every StadtPocket listing today (see this phase's own audit).
// `listing.name` is the public StadtPocket business name -- read by
// checkExistingQraivyLinkage as its search term, exactly like the real
// service does off the real include:{listing:true} relation.
function addListingLocation({ id = 'll_staib', locationId = ULM, businessLocationId = null, loyaltyLandingPageId = null, listingName = 'Bäckerei Staib' } = {}) {
  listingLocationRows.push({ id, locationId, businessLocationId, loyaltyLandingPageId, listing: { name: listingName } });
  return listingLocationRows[listingLocationRows.length - 1];
}

function addBusinessLocation({ id, businessId, locationId = ULM, status = 'active' }) {
  businessLocationRows.push({ id, businessId, locationId, status });
}

function addBusiness({ id, name, slug, status = 'active' }) {
  businessRows.push({ id, name, slug, status });
}

function addLandingPage({ id, slug, businessName = 'Test Business', businessId = null, userId = 'some_owner' }) {
  landingPageRows.push({ id, slug, businessName, businessId, userId, websiteUrl: null, useCase: null });
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
    findUnique: async ({ where }) => landingPageRows.find((lp) => lp.id === where.id || lp.slug === where.slug) || null,
    findFirst: async ({ where }) => landingPageRows.find((lp) => (!where.businessId || lp.businessId === where.businessId)) || null,
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
    create: async ({ data }) => {
      const row = { id: `lp_${++seq}`, businessId: null, userId: null, ...data };
      landingPageRows.push(row);
      return { ...row };
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
    upsert: async ({ where, create, update }) => {
      const existing = stampSettingsRows.find((s) => s.slug === where.slug);
      if (existing) {
        Object.assign(existing, update);
        return { ...existing };
      }
      const row = { id: `ss_${++seq}`, color: '#ff5a1f', ...create };
      stampSettingsRows.push(row);
      return { ...row };
    },
  },
  businessLocation: {
    findUnique: async ({ where }) => businessLocationRows.find((bl) => bl.id === where.id) || null,
    findFirst: async ({ where }) => businessLocationRows.find((bl) =>
      (!where.businessId || bl.businessId === where.businessId) &&
      (!where.locationId || bl.locationId === where.locationId)
    ) || null,
  },
  business: {
    findMany: async ({ where, take }) => {
      let rows = businessRows;
      if (where && where.status && where.status.not) rows = rows.filter((b) => b.status !== where.status.not);
      if (where && where.name && where.name.contains != null) {
        const q = where.name.contains.toLowerCase();
        rows = rows.filter((b) => b.name.toLowerCase().includes(q));
      }
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => ({ ...r }));
    },
  },
  // Deliberately NOT defined -- this Admin flow must never read or write
  // customer-specific data.
  loyaltyCustomer: undefined,
};

// Interactive-transaction shape only -- the real code never calls the
// array form here. Runs the callback against the SAME mock object (no
// real isolation), which is enough to test createAndConnectProgram's
// read-then-write logic; true concurrent-race behavior is not something
// this mock can exercise and is not claimed to be covered by these tests.
mockPrisma.$transaction = async (fn) => fn(mockPrisma);

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const {
  listEligiblePrograms,
  getBridgeState,
  connectProgram,
  disconnectProgram,
  createAndConnectProgram,
  checkExistingQraivyLinkage,
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

// ── checkExistingQraivyLinkage (Phase 3B pre-work diagnostic) ──────

test('Global Admin: finds a matching Business, BusinessLocation, and LandingPage', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  addBusiness({ id: 'biz_staib', name: 'Bäckerei Staib', slug: 'baeckerei-staib' });
  addBusinessLocation({ id: 'bl_staib', businessId: 'biz_staib', locationId: ULM, status: 'active' });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty', businessId: 'biz_staib' });
  const result = await checkExistingQraivyLinkage(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.deepEqual(result, {
    business: { name: 'Bäckerei Staib', slug: 'baeckerei-staib', ambiguous: false },
    businessLocation: { status: 'active' },
    landingPage: { slug: 'baeckerei-staib-loyalty' },
  });
});

test('Global Admin: nothing found -- all three null, never an error', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  const result = await checkExistingQraivyLinkage(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.deepEqual(result, { business: null, businessLocation: null, landingPage: null });
});

test('Global Admin: Business found but no BusinessLocation in this city and no LandingPage', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  addBusiness({ id: 'biz_staib', name: 'Bäckerei Staib', slug: 'baeckerei-staib' });
  const result = await checkExistingQraivyLinkage(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.equal(result.business.name, 'Bäckerei Staib');
  assert.equal(result.businessLocation, null);
  assert.equal(result.landingPage, null);
});

test('Global Admin: ambiguous match (multiple Businesses) is flagged, not silently guessed', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Staib' });
  addBusiness({ id: 'biz_1', name: 'Bäckerei Staib', slug: 'baeckerei-staib' });
  addBusiness({ id: 'biz_2', name: 'Staib Backwaren GmbH', slug: 'staib-backwaren' });
  const result = await checkExistingQraivyLinkage(ULM, 'll_staib', GLOBAL_ADMIN);
  assert.equal(result.business.ambiguous, true);
});

test('a scoped City Manager cannot call the diagnostic at all -- 403 before any Prisma read', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  addBusiness({ id: 'biz_staib', name: 'Bäckerei Staib', slug: 'baeckerei-staib' });
  addBusinessLocation({ id: 'bl_staib', businessId: 'biz_staib', locationId: ULM });
  try {
    await checkExistingQraivyLinkage(ULM, 'll_staib', ulmManager());
    throw new Error('expected 403, none was thrown');
  } catch (err) {
    assert.equal(err.status, 403);
  }
});

test('the diagnostic never exposes LandingPage.userId, any Clerk id, or customer-specific fields', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  addBusiness({ id: 'biz_staib', name: 'Bäckerei Staib', slug: 'baeckerei-staib' });
  addBusinessLocation({ id: 'bl_staib', businessId: 'biz_staib', locationId: ULM, status: 'active' });
  addLandingPage({ id: 'lp_staib', slug: 'baeckerei-staib-loyalty', businessId: 'biz_staib' });
  const result = await checkExistingQraivyLinkage(ULM, 'll_staib', GLOBAL_ADMIN);
  const flat = JSON.stringify(result);
  for (const forbidden of ['userId', 'some_owner', 'primaryOwnerUserId', 'customerId', 'cid', 'stampCount', 'currentStamps']) {
    assert.equal(flat.includes(forbidden), false, `diagnostic response must not expose "${forbidden}"`);
  }
  assert.deepEqual(Object.keys(result.business).sort(), ['ambiguous', 'name', 'slug'].sort());
  assert.deepEqual(Object.keys(result.businessLocation).sort(), ['status'].sort());
  assert.deepEqual(Object.keys(result.landingPage).sort(), ['slug'].sort());
});

test('a caller-supplied listingLocationId outside this city is rejected (404), even for Global Admin', async () => {
  resetFixtures();
  addListingLocation({ id: 'll_staib', locationId: ULM });
  try {
    await checkExistingQraivyLinkage(STUTTGART, 'll_staib', GLOBAL_ADMIN);
    throw new Error('expected 404, none was thrown');
  } catch (err) {
    assert.equal(err.status, 404);
  }
});

// ── createAndConnectProgram (Phase 3B — platform-managed setup) ───

test('Global Admin can create a platform-managed program for an unclaimed listing', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  const program = await createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: 'Gratis Kaffee' });
  assert.equal(program.requiredStamps, 10);
  assert.equal(program.rewardTitle, 'Gratis Kaffee');
  assert.equal(program.businessName, 'Bäckerei Staib');
});

test('a City Manager can create a platform-managed program within their own authorized city', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  const program = await createAndConnectProgram(ULM, 'll_staib', ulmManager(), { goal: 8, rewardName: 'Gratis Brötchen' });
  assert.equal(program.requiredStamps, 8);
});

test('an out-of-scope City Manager is rejected (403), no writes happen', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', stuttgartManager, { goal: 10, rewardName: 'Gratis Kaffee' }), 403);
  assert.equal(landingPageRows.length, 0);
  assert.equal(stampSettingsRows.length, 0);
});

test('the created LandingPage is platform-managed: userId null, no Business, no BusinessLocation', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  await createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: 'Gratis Kaffee' });
  assert.equal(landingPageRows.length, 1);
  assert.equal(landingPageRows[0].userId, null);
  assert.equal(landingPageRows[0].businessId, null);
  assert.equal(businessRows.length, 0);
  assert.equal(businessLocationRows.length, 0);
});

test('StampSettings is created with the exact goal/reward and enabled: true', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  await createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 12, rewardName: 'Gratis Kuchen' });
  assert.equal(stampSettingsRows.length, 1);
  assert.equal(stampSettingsRows[0].goal, 12);
  assert.equal(stampSettingsRows[0].rewardName, 'Gratis Kuchen');
  assert.equal(stampSettingsRows[0].enabled, true);
});

test('the bridge (loyaltyLandingPageId) is set to the newly created LandingPage', async () => {
  resetFixtures();
  const ll = addListingLocation({ listingName: 'Bäckerei Staib' });
  const program = await createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: 'Gratis Kaffee' });
  assert.equal(ll.loyaltyLandingPageId, landingPageRows[0].id);
  assert.equal(ll.loyaltyLandingPageId, program.landingPageId);
});

test('an invalid goal (bad input) is rejected before any row is written -- atomic failure', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 1, rewardName: 'Gratis Kaffee' }));
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 51, rewardName: 'Gratis Kaffee' }));
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10.5, rewardName: 'Gratis Kaffee' }));
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 'ten', rewardName: 'Gratis Kaffee' }));
  assert.equal(landingPageRows.length, 0);
  assert.equal(stampSettingsRows.length, 0);
});

test('an invalid rewardName (empty, whitespace-only, too long, non-string) is rejected before any row is written', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: '' }));
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: '   ' }));
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: 'x'.repeat(81) }));
  await expectError(() => createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: null }));
  assert.equal(landingPageRows.length, 0);
  assert.equal(stampSettingsRows.length, 0);
});

test('repeated submission does not create a duplicate LandingPage or StampSettings', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  const first = await createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: 'Gratis Kaffee' });
  const second = await createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 12, rewardName: 'Gratis Kuchen' });
  assert.equal(landingPageRows.length, 1);
  assert.equal(stampSettingsRows.length, 1);
  assert.equal(second.landingPageId, first.landingPageId);
  assert.equal(second.requiredStamps, 12);
  assert.equal(second.rewardTitle, 'Gratis Kuchen');
});

test('an already-claimed business with its own existing LandingPage is reused, not duplicated', async () => {
  resetFixtures();
  addBusinessLocation({ id: 'bl_staib', businessId: 'biz_staib' });
  const ll = addListingLocation({ businessLocationId: 'bl_staib', listingName: 'Bäckerei Staib' });
  addLandingPage({ id: 'lp_owned', slug: 'baeckerei-staib-loyalty', businessId: 'biz_staib', userId: 'real_owner' });
  const program = await createAndConnectProgram(ULM, 'll_staib', ulmManager(), { goal: 10, rewardName: 'Gratis Kaffee' });
  assert.equal(landingPageRows.length, 1);
  assert.equal(program.landingPageId, 'lp_owned');
  assert.equal(ll.loyaltyLandingPageId, 'lp_owned');
  assert.equal(landingPageRows[0].userId, 'real_owner'); // untouched -- never overwritten
});

test('extra/unexpected fields in the request body cannot inject a target id -- only goal/rewardName are ever read', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  const program = await createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, {
    goal: 10,
    rewardName: 'Gratis Kaffee',
    landingPageId: 'lp_attacker_supplied',
    businessId: 'biz_attacker_supplied',
    userId: 'user_attacker_supplied',
  });
  assert.equal(landingPageRows.length, 1);
  assert.notEqual(landingPageRows[0].id, 'lp_attacker_supplied');
  assert.equal(landingPageRows[0].businessId, null);
  assert.equal(landingPageRows[0].userId, null);
});

test('the created-program response never exposes customer-specific or internal fields', async () => {
  resetFixtures();
  addListingLocation({ listingName: 'Bäckerei Staib' });
  const program = await createAndConnectProgram(ULM, 'll_staib', GLOBAL_ADMIN, { goal: 10, rewardName: 'Gratis Kaffee' });
  assert.deepEqual(Object.keys(program).sort(), ['businessName', 'landingPageId', 'requiredStamps', 'rewardTitle', 'slug'].sort());
  for (const forbidden of [
    'customerId', 'cid', 'currentStamps', 'totalStamps', 'rewardsEarned', 'rewardReady',
    'hasWallet', 'stampCount', 'userId', 'websiteUrl', 'useCase', 'color', 'id',
  ]) {
    assert.equal(forbidden in program, false, `program summary must not expose "${forbidden}"`);
  }
});

test('a nonexistent listingLocationId is rejected (404) inside the transaction too', async () => {
  resetFixtures();
  await expectError(() => createAndConnectProgram(ULM, 'll_does_not_exist', GLOBAL_ADMIN, { goal: 10, rewardName: 'Gratis Kaffee' }), 404);
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
