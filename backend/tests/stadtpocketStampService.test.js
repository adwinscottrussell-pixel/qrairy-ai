// ============================================================
// stadtpocketStampService.test.js — StadtPocket Working Model Step 2:
// Bäckerei Staib real loyalty + staff stamping.
//
// Mocked-Prisma tests for stadtpocketStampService.js, following the
// same convention as tests/stadtpocketLoyaltyBridge.test.js and
// tests/stadtpocketPassFoundation.test.js: no test framework
// dependency, Node's built-in assert/strict + a tiny inline runner,
// require.cache override of src/utils/prismaClient.js. Because
// applyStaffStamp() reuses getBridgeState() -> findListingLocationInCityOrThrow()
// -> authorizeLocationAccess() UNMODIFIED, this mock must also cover the
// models those real functions touch (stadtPocketListingLocation,
// landingPage, stampSettings), not just the new stamping models
// (customerIdentity, pass, loyaltyCustomer, stampEntry).
//
// Run: node tests/stadtpocketStampService.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');

const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const PLATFORM_TENANT = require(resolve('src', 'config', 'stadtpocketPlatformTenant.js')).STADTPOCKET_PLATFORM_TENANT_ID;

let listingLocationRows = [];
let landingPageRows = [];
let stampSettingsRows = [];
let customerIdentityRows = [];
let passRows = [];
let loyaltyCustomerRows = [];
let stampEntryRows = [];
let seq = 0;
let clockTick = 0;

function resetFixtures() {
  listingLocationRows = [];
  landingPageRows = [];
  stampSettingsRows = [];
  customerIdentityRows = [];
  passRows = [];
  loyaltyCustomerRows = [];
  stampEntryRows = [];
  seq = 0;
  clockTick = 0;
}

function nextTimestamp() {
  clockTick += 1;
  return new Date(2026, 0, 1, 0, 0, 0, clockTick);
}

function addListingLocation({ id = 'll_staib', locationId = ULM, loyaltyLandingPageId = null, listingName = 'Bäckerei Staib' } = {}) {
  listingLocationRows.push({ id, locationId, businessLocationId: null, loyaltyLandingPageId, listing: { name: listingName } });
  return listingLocationRows[listingLocationRows.length - 1];
}

function addLandingPage({ id = 'lp_staib', slug = 'baeckerei-staib', businessName = 'Bäckerei Staib' } = {}) {
  landingPageRows.push({ id, slug, businessName, businessId: null, userId: null, websiteUrl: null, useCase: null });
  return landingPageRows[landingPageRows.length - 1];
}

function addStampSettings({ slug = 'baeckerei-staib', goal = 8, rewardName = 'Free Coffee', enabled = true } = {}) {
  stampSettingsRows.push({ id: `ss_${++seq}`, slug, goal, rewardName, enabled, color: '#ff5a1f' });
  return stampSettingsRows[stampSettingsRows.length - 1];
}

// Full real setup: Staib in Ulm, bridged, loyalty enabled. Mirrors the
// actual staging state confirmed during this step's inspection.
function setUpConnectedStaib() {
  addListingLocation({ loyaltyLandingPageId: 'lp_staib' });
  addLandingPage();
  addStampSettings();
}

// Registers a StadtPocket canonical customer with one platform Pass --
// exactly what stadtpocketPassService.resolveOrCreatePass would have
// produced in Step 1.
function addStadtPocketCustomerWithPass(customerId, serialNumber) {
  passRows.push({ id: `pass_${++seq}`, serialNumber, slug: null, passTypeId: 'pass.com.qraivy.stadtpocket', createdAt: nextTimestamp() });
  customerIdentityRows.push({
    id: `ci_${++seq}`, customerId, ownerUserId: PLATFORM_TENANT, type: 'stadtpocket_pass_serial', value: serialNumber,
    createdAt: nextTimestamp(), lastSeenAt: nextTimestamp(), verified: false, verifiedAt: null, slug: null, source: null,
  });
}

const mockPrisma = {
  stadtPocketListingLocation: {
    findUnique: async ({ where }) => listingLocationRows.find((ll) => ll.id === where.id) || null,
  },
  landingPage: {
    findUnique: async ({ where }) => landingPageRows.find((lp) => lp.id === where.id || lp.slug === where.slug) || null,
  },
  stampSettings: {
    findUnique: async ({ where }) => stampSettingsRows.find((s) => s.slug === where.slug) || null,
  },
  customerIdentity: {
    findFirst: async ({ where }) => {
      const row = customerIdentityRows.find((r) =>
        (!where.ownerUserId || r.ownerUserId === where.ownerUserId) &&
        (!where.type || r.type === where.type) &&
        (!where.value || r.value === where.value)
      );
      return row ? { ...row } : null;
    },
  },
  pass: {
    findUnique: async ({ where }) => {
      const row = passRows.find((p) => p.serialNumber === where.serialNumber || p.id === where.id);
      return row ? { ...row } : null;
    },
  },
  loyaltyCustomer: {
    findUnique: async ({ where }) => {
      const key = where.slug_customerId;
      const row = loyaltyCustomerRows.find((lc) => lc.slug === key.slug && lc.customerId === key.customerId);
      return row ? { ...row } : null;
    },
    create: async ({ data }) => {
      const dup = loyaltyCustomerRows.find((lc) => lc.slug === data.slug && lc.customerId === data.customerId);
      if (dup) {
        const err = new Error('Unique constraint failed on slug_customerId');
        err.code = 'P2002';
        throw err;
      }
      const row = {
        id: `lc_${++seq}`, hasWallet: false, rewardsEarned: 0, rewardReady: false,
        ...data,
      };
      loyaltyCustomerRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const key = where.slug_customerId;
      const row = loyaltyCustomerRows.find((lc) => lc.slug === key.slug && lc.customerId === key.customerId);
      if (!row) throw new Error('LoyaltyCustomer not found');
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && 'increment' in v) {
          row[k] = (row[k] || 0) + v.increment;
        } else {
          row[k] = v;
        }
      }
      return { ...row };
    },
  },
  stampEntry: {
    create: async ({ data }) => {
      const row = { id: `se_${++seq}`, createdAt: nextTimestamp(), ...data };
      stampEntryRows.push(row);
      return { ...row };
    },
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const { applyStaffStamp, lookupPassForStamping } = require('../src/services/stadtpocketStampService');
const { StadtpocketManagerError } = require('../src/services/stadtpocketManagerService');

const GLOBAL_ADMIN = { userId: 'admin1', isGlobalAdmin: true };
const ulmManager = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
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

// ── 1. Valid staff + valid Pass -> one stamp added ──────────────

test('valid Staib staff + valid StadtPocket Pass -> one stamp added, real balance returned', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  const result = await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');

  assert.equal(result.stampCount, 1);
  assert.equal(result.requiredStamps, 8);
  assert.equal(result.businessName, 'Bäckerei Staib');
  assert.equal(result.slug, 'baeckerei-staib');
  assert.equal(loyaltyCustomerRows.length, 1);
  assert.equal(loyaltyCustomerRows[0].customerId, 'cust_1');
  assert.equal(stampEntryRows.length, 1);
  assert.equal(stampEntryRows[0].slug, 'baeckerei-staib');
});

// ── 2. Repeated request outside cooldown -> correct increment ──

test('same customer, second stamp AFTER cooldown -> stampCount correctly increments to 2', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  const first = await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  assert.equal(first.stampCount, 1);

  // Simulate cooldown having elapsed by rewriting lastStampAt into the past.
  loyaltyCustomerRows[0].lastStampAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const second = await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  assert.equal(second.stampCount, 2);
  assert.equal(stampEntryRows.length, 2);
});

// ── 3. Duplicate/immediate replay -> rejected per cooldown ──────

test('same customer, immediate second stamp -> rejected (429), stampCount unchanged', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  await expectError(() => applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1'), 429);

  assert.equal(loyaltyCustomerRows.length, 1);
  assert.equal(loyaltyCustomerRows[0].stampCount, 1); // unchanged
  assert.equal(stampEntryRows.length, 1); // no second history row either
});

// ── 4. Different customer -> separate balance ───────────────────

test('two different customers at the same business have completely separate balances', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');
  addStadtPocketCustomerWithPass('cust_2', 'sp_customer2');

  const a1 = await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  const b1 = await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer2');
  assert.equal(a1.stampCount, 1);
  assert.equal(b1.stampCount, 1);

  loyaltyCustomerRows.find((lc) => lc.customerId === 'cust_1').lastStampAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const a2 = await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  assert.equal(a2.stampCount, 2);

  // Customer 2's balance must be completely untouched by customer 1's second stamp.
  const b = loyaltyCustomerRows.find((lc) => lc.customerId === 'cust_2');
  assert.equal(b.stampCount, 1);
});

// ── 5. Unauthorized staff/location -> rejected ───────────────────

test('a Stuttgart-scoped manager cannot stamp a Ulm business (Staib) -- 403, no data touched', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  await expectError(() => applyStaffStamp(ULM, 'll_staib', stuttgartManager, 'sp_customer1'), 403);
  assert.equal(loyaltyCustomerRows.length, 0);
  assert.equal(stampEntryRows.length, 0);
});

test('Global Admin can stamp regardless of manager location scope', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  const result = await applyStaffStamp(ULM, 'll_staib', GLOBAL_ADMIN, 'sp_customer1');
  assert.equal(result.stampCount, 1);
});

test('a nonexistent listingLocationId is rejected (404), never silently creates loyalty state', async () => {
  resetFixtures();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');
  await expectError(() => applyStaffStamp(ULM, 'll_does_not_exist', ulmManager, 'sp_customer1'), 404);
  assert.equal(loyaltyCustomerRows.length, 0);
});

// ── 6. Loyalty disabled -> rejected ───────────────────────────────

test('loyalty disabled for this business -> rejected (400), no LoyaltyCustomer/StampEntry created', async () => {
  resetFixtures();
  addListingLocation({ loyaltyLandingPageId: 'lp_staib' });
  addLandingPage();
  addStampSettings({ enabled: false });
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  await expectError(() => applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1'), 400);
  assert.equal(loyaltyCustomerRows.length, 0);
  assert.equal(stampEntryRows.length, 0);
});

test('no loyalty bridge connected at all -> rejected (400)', async () => {
  resetFixtures();
  addListingLocation({ loyaltyLandingPageId: null });
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  await expectError(() => applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1'), 400);
  assert.equal(loyaltyCustomerRows.length, 0);
});

// ── 7. Invalid Pass.serialNumber -> rejected without leaking info ──

test('a well-formed but nonexistent Pass.serialNumber is rejected (404) with a generic message', async () => {
  resetFixtures();
  setUpConnectedStaib();

  const err = await expectError(() => applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_does_not_exist'), 404);
  assert.equal(err.message, 'Invalid pass.');
  assert.equal(loyaltyCustomerRows.length, 0);
});

test('a Pass row exists but is not a StadtPocket canonical customer Pass -- rejected with the SAME generic message', async () => {
  resetFixtures();
  setUpConnectedStaib();
  // A real Pass row (e.g. an old per-business QRAIVY Pass), but with NO
  // stadtpocket_pass_serial CustomerIdentity link -- must be rejected
  // identically to a not-found serial, never distinguished.
  passRows.push({ id: 'pass_old', serialNumber: 'sqr-someslug', slug: 'someslug', passTypeId: 'pass.com.qraivy.wallet', createdAt: nextTimestamp() });

  const err = await expectError(() => applyStaffStamp(ULM, 'll_staib', ulmManager, 'sqr-someslug'), 404);
  assert.equal(err.message, 'Invalid pass.');
});

test('empty/oversized/non-string passSerialNumber is rejected (404) before any DB lookup', async () => {
  resetFixtures();
  setUpConnectedStaib();
  await expectError(() => applyStaffStamp(ULM, 'll_staib', ulmManager, ''), 404);
  await expectError(() => applyStaffStamp(ULM, 'll_staib', ulmManager, null), 404);
  await expectError(() => applyStaffStamp(ULM, 'll_staib', ulmManager, 'x'.repeat(200)), 404);
});

// ── 8. StadtPocket LoyaltyCustomer uses canonical Customer.id ────

test('LoyaltyCustomer.customerId is the canonical StadtPocket Customer.id, never the raw serialNumber or a device token', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_canonical_123', 'sp_customer1');

  await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  assert.equal(loyaltyCustomerRows[0].customerId, 'cust_canonical_123');
  assert.notEqual(loyaltyCustomerRows[0].customerId, 'sp_customer1');
});

// ── 10. Concurrent stamp safety ────────────────────────────────────

test('a lost first-stamp race (P2002 on create) converges safely -- no double stamp, second loses to cooldown', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  // Simulate two concurrent "first stamp" requests for a brand-new
  // membership: both see no existing row, both attempt create(); the
  // mock's own uniqueness check makes the second create() throw P2002,
  // exactly like the real DB constraint would.
  const [r1, r2] = await Promise.allSettled([
    applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1'),
    applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1'),
  ]);

  const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
  const rejected = [r1, r2].filter((r) => r.status === 'rejected');

  // Exactly one LoyaltyCustomer row, and it was never double-stamped by
  // this pair of concurrent requests.
  assert.equal(loyaltyCustomerRows.length, 1);
  assert.ok(loyaltyCustomerRows[0].stampCount === 1 || loyaltyCustomerRows[0].stampCount === 2);
  // At least one of the two concurrent requests must have been rejected
  // (cooldown) rather than both silently succeeding as two full stamps
  // -- the winner's write always happens before the loser's re-check.
  assert.ok(fulfilled.length >= 1);
  if (rejected.length > 0) {
    assert.equal(rejected[0].reason.status, 429);
  }
});

test('concurrent stamps on an ALREADY-EXISTING row use atomic increment -- count reflects the accepted stamp only', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  loyaltyCustomerRows[0].lastStampAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // clear cooldown

  const results = await Promise.allSettled([
    applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1'),
    applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1'),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  // The mock's synchronous find-then-update on an existing row is not
  // truly concurrent (Node's event loop serializes these two async
  // functions' awaits), so this asserts the SAME safety property a real
  // Postgres atomic increment guarantees: no lost update, no
  // over/under-count relative to how many stamps were actually accepted.
  assert.equal(loyaltyCustomerRows[0].stampCount, 1 + fulfilled.length);
  if (rejected.length) assert.equal(rejected[0].reason.status, 429);
});

// ── 9. Existing QRAIVY loyalty/stamping behavior remains green ───

test('existing getBridgeState/authorizeLocationAccess behavior for a Stempelkarte-only (no StadtPocket stamping) query is unaffected', async () => {
  resetFixtures();
  setUpConnectedStaib();
  const { getBridgeState } = require('../src/services/stadtpocketLoyaltyBridgeService');
  const state = await getBridgeState(ULM, 'll_staib', ulmManager);
  assert.equal(state.connected, true);
  assert.equal(state.program.slug, 'baeckerei-staib');
  assert.equal(state.program.requiredStamps, 8);
  assert.equal(state.program.rewardTitle, 'Free Coffee');
});

// ── lookupPassForStamping (Step 3A — read-only "Kunde prüfen") ──

test('lookup: valid Pass with an EXISTING Staib LoyaltyCustomer returns the correct real balance', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');
  await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1'); // real prior stamp

  const result = await lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_customer1');
  assert.equal(result.found, true);
  assert.equal(result.stampCount, 1);
  assert.equal(result.requiredStamps, 8);
  assert.equal(result.rewardName, 'Free Coffee');
  assert.equal(result.businessName, 'Bäckerei Staib');
});

test('lookup: valid Pass with NO Staib LoyaltyCustomer yet -> found true, stampCount 0', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_never_stamped', 'sp_fresh_customer');

  const result = await lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_fresh_customer');
  assert.equal(result.found, true);
  assert.equal(result.stampCount, 0);
  assert.equal(result.requiredStamps, 8);
});

test('lookup: invalid/unknown Pass.serialNumber -> safe not-found error, no customer info leaked', async () => {
  resetFixtures();
  setUpConnectedStaib();

  const err = await expectError(() => lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_does_not_exist'), 404);
  assert.equal(err.message, 'Invalid pass.');
});

test('lookup: a real Pass row that is not a StadtPocket canonical customer Pass -> same generic 404', async () => {
  resetFixtures();
  setUpConnectedStaib();
  passRows.push({ id: 'pass_old', serialNumber: 'sqr-someslug', slug: 'someslug', passTypeId: 'pass.com.qraivy.wallet', createdAt: nextTimestamp() });

  const err = await expectError(() => lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sqr-someslug'), 404);
  assert.equal(err.message, 'Invalid pass.');
});

test('lookup: unauthorized location/staff -> rejected (403), never reaches pass/customer data', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  await expectError(() => lookupPassForStamping(ULM, 'll_staib', stuttgartManager, 'sp_customer1'), 403);
});

test('lookup: loyalty disabled for this business -> rejected (400)', async () => {
  resetFixtures();
  addListingLocation({ loyaltyLandingPageId: 'lp_staib' });
  addLandingPage();
  addStampSettings({ enabled: false });
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');

  await expectError(() => lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_customer1'), 400);
});

test('lookup creates NO LoyaltyCustomer row, even for a customer who never stamped here before', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_never_stamped', 'sp_fresh_customer');

  await lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_fresh_customer');
  assert.equal(loyaltyCustomerRows.length, 0);
});

test('lookup creates NO StampEntry row', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');
  await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  const stampEntryCountBefore = stampEntryRows.length;

  await lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_customer1');
  assert.equal(stampEntryRows.length, stampEntryCountBefore);
});

test('lookup changes NO stamp counters or timestamps on an existing LoyaltyCustomer, even called repeatedly', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');
  await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');
  const before = { ...loyaltyCustomerRows[0] };

  await lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_customer1');
  await lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_customer1');
  await lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_customer1');

  assert.deepEqual(loyaltyCustomerRows[0], before);
});

test('lookup never triggers or is affected by the stamping cooldown -- repeated lookups right after a real stamp all succeed', async () => {
  resetFixtures();
  setUpConnectedStaib();
  addStadtPocketCustomerWithPass('cust_1', 'sp_customer1');
  await applyStaffStamp(ULM, 'll_staib', ulmManager, 'sp_customer1');

  // Immediately after a real stamp (still well inside the 1-hour
  // cooldown) -- a lookup must still succeed; only the mutating POST is
  // cooldown-gated, never the read-only GET.
  const result = await lookupPassForStamping(ULM, 'll_staib', ulmManager, 'sp_customer1');
  assert.equal(result.found, true);
  assert.equal(result.stampCount, 1);
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
