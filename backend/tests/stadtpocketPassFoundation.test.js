// ============================================================
// stadtpocketPassFoundation.test.js — StadtPocket Canonical Customer
// Identity + One In-App Pass Foundation, Step 1.
//
// Mocked-Prisma tests for stadtpocketPassService.js, following the same
// pattern as tests/stadtpocketLoyaltyBridge.test.js: no test framework
// dependency, Node's built-in assert/strict + a tiny inline runner,
// require.cache override of src/utils/prismaClient.js so the real
// customerIdentityService.js and stadtpocketPassService.js run against
// an in-memory fixture instead of a real database.
//
// $transaction here just calls the callback against the SAME mock
// object (no real DB isolation) -- same limitation and same disclaimer
// as stadtpocketLoyaltyBridge.test.js: true concurrent-race behavior is
// not something this mock can exercise. The "race convergence" test
// below instead directly seeds a second pass-link row into the fixture
// to exercise the SAME code path a real race would hit, without
// needing genuine concurrency.
//
// Run: node tests/stadtpocketPassFoundation.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');

let customerRows = [];
let identityRows = [];
let passRows = [];
let seq = 0;
let clockTick = 0;

function resetFixtures() {
  customerRows = [];
  identityRows = [];
  passRows = [];
  seq = 0;
  clockTick = 0;
}

// Monotonically increasing fake timestamp so orderBy: { createdAt: 'asc' }
// behaves deterministically regardless of how fast these tests run.
function nextTimestamp() {
  clockTick += 1;
  return new Date(2026, 0, 1, 0, 0, 0, clockTick);
}

function findIdentityByUniqueKey(ownerUserId, type, value) {
  return identityRows.find((r) => r.ownerUserId === ownerUserId && r.type === type && r.value === value) || null;
}

const mockPrisma = {
  customer: {
    create: async ({ data }) => {
      const row = {
        id: `cust_${++seq}`,
        status: 'active',
        mergedIntoId: null,
        primaryEmail: null,
        primaryEmailVerifiedAt: null,
        displayName: null,
        lastActivityAt: null,
        ...data,
        createdAt: nextTimestamp(),
        updatedAt: nextTimestamp(),
        firstSeenAt: data.firstSeenAt || nextTimestamp(),
      };
      customerRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = customerRows.find((c) => c.id === where.id);
      if (!row) return null;
      Object.assign(row, data);
      return { ...row };
    },
  },
  customerIdentity: {
    findUnique: async ({ where }) => {
      if (where.ownerUserId_type_value) {
        const { ownerUserId, type, value } = where.ownerUserId_type_value;
        const row = findIdentityByUniqueKey(ownerUserId, type, value);
        return row ? { ...row } : null;
      }
      if (where.id) {
        const row = identityRows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }
      return null;
    },
    findFirst: async ({ where }) => {
      const rows = identityRows.filter((r) =>
        (!where.customerId || r.customerId === where.customerId) &&
        (!where.ownerUserId || r.ownerUserId === where.ownerUserId) &&
        (!where.type || r.type === where.type)
      );
      return rows[0] ? { ...rows[0] } : null;
    },
    findMany: async ({ where, orderBy }) => {
      let rows = identityRows.filter((r) =>
        (!where.customerId || r.customerId === where.customerId) &&
        (!where.ownerUserId || r.ownerUserId === where.ownerUserId) &&
        (!where.type || r.type === where.type)
      );
      if (orderBy && orderBy.createdAt === 'asc') {
        rows = rows.slice().sort((a, b) => a.createdAt - b.createdAt);
      }
      return rows.map((r) => ({ ...r }));
    },
    create: async ({ data }) => {
      const dup = findIdentityByUniqueKey(data.ownerUserId, data.type, data.value);
      if (dup) {
        const err = new Error('Unique constraint failed on ownerUserId_type_value');
        err.code = 'P2002';
        throw err;
      }
      const row = {
        id: `ci_${++seq}`,
        verified: false,
        verifiedAt: null,
        slug: null,
        source: null,
        ...data,
        createdAt: nextTimestamp(),
        lastSeenAt: nextTimestamp(),
      };
      identityRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = identityRows.find((r) => r.id === where.id);
      if (!row) return null;
      Object.assign(row, data);
      return { ...row };
    },
  },
  pass: {
    create: async ({ data }) => {
      const dup = passRows.find((p) => p.serialNumber === data.serialNumber);
      if (dup) {
        const err = new Error('Unique constraint failed on serialNumber');
        err.code = 'P2002';
        throw err;
      }
      const row = {
        id: `pass_${++seq}`,
        authToken: null,
        stampCount: 0,
        stampGoal: 10,
        rewardReady: false,
        totalStamps: 0,
        rewardsEarned: 0,
        lastStampAt: null,
        ...data,
        createdAt: nextTimestamp(),
        updatedAt: nextTimestamp(),
      };
      passRows.push(row);
      return { ...row };
    },
    findUnique: async ({ where }) => {
      const row = passRows.find((p) =>
        (where.serialNumber != null && p.serialNumber === where.serialNumber) ||
        (where.id != null && p.id === where.id)
      );
      return row ? { ...row } : null;
    },
  },
};

mockPrisma.$transaction = async (fn) => fn(mockPrisma);

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const stadtpocketPassService = require('../src/services/stadtpocketPassService');
const { resolveOrCreateCustomerIdentity } = require('../src/services/customerIdentityService');
const { STADTPOCKET_PLATFORM_TENANT_ID } = require('../src/config/stadtpocketPlatformTenant');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. Same anonymous identity -> same Customer ─────────────────

test('same anonymous device token resolves to the same canonical Customer', async () => {
  resetFixtures();
  const first = await stadtpocketPassService.resolveOrCreatePass({});
  const second = await stadtpocketPassService.resolveOrCreatePass({ deviceToken: first.deviceToken });
  assert.equal(second.customerId, first.customerId);
  assert.equal(customerRows.length, 1);
  assert.equal(first.isNewCustomer, true);
  assert.equal(second.isNewCustomer, false);
});

// ── 2. Same anonymous identity -> same Pass ──────────────────────

test('same anonymous device token resolves to the same Pass', async () => {
  resetFixtures();
  const first = await stadtpocketPassService.resolveOrCreatePass({});
  const second = await stadtpocketPassService.resolveOrCreatePass({ deviceToken: first.deviceToken });
  assert.equal(second.serialNumber, first.serialNumber);
  assert.equal(passRows.length, 1);
  assert.equal(first.isNewPass, true);
  assert.equal(second.isNewPass, false);
});

// ── 3. Different anonymous identities -> different Customers/Passes ─

test('different anonymous device tokens resolve to different Customers and different Passes', async () => {
  resetFixtures();
  const a = await stadtpocketPassService.resolveOrCreatePass({});
  const b = await stadtpocketPassService.resolveOrCreatePass({});
  assert.notEqual(a.customerId, b.customerId);
  assert.notEqual(a.serialNumber, b.serialNumber);
  assert.equal(customerRows.length, 2);
  assert.equal(passRows.length, 2);
});

// ── 4. Platform tenant does not interfere with owner-scoped identity ─

test('StadtPocket platform tenant never collides with an existing owner-scoped identity of the same value', async () => {
  resetFixtures();
  const collidingValue = `spd_${'a'.repeat(48)}`;
  await resolveOrCreateCustomerIdentity({
    ownerUserId: 'real_business_owner_1',
    type: 'stadtpocket_device',
    value: collidingValue,
    source: 'unrelated_qraivy_flow',
  });
  assert.equal(customerRows.length, 1);

  const result = await stadtpocketPassService.resolveOrCreatePass({ deviceToken: collidingValue });

  // A brand-new StadtPocket Customer must be created under the platform
  // tenant -- the pre-existing owner-scoped row must never be reused.
  assert.equal(customerRows.length, 2);
  const platformCustomer = customerRows.find((c) => c.id === result.customerId);
  assert.ok(platformCustomer);
  assert.equal(platformCustomer.ownerUserId, STADTPOCKET_PLATFORM_TENANT_ID);
  const untouchedOwnerCustomer = customerRows.find((c) => c.ownerUserId === 'real_business_owner_1');
  assert.ok(untouchedOwnerCustomer);
  assert.notEqual(untouchedOwnerCustomer.id, result.customerId);
});

// ── 5. Exactly one StadtPocket Pass per customer ─────────────────

test('exactly one Pass per customer -- repeated resolution never creates a second Pass or a second link', async () => {
  resetFixtures();
  const first = await stadtpocketPassService.resolveOrCreatePass({});
  for (let i = 0; i < 5; i++) {
    await stadtpocketPassService.resolveOrCreatePass({ deviceToken: first.deviceToken });
  }
  assert.equal(passRows.length, 1);
  const links = identityRows.filter(
    (r) => r.customerId === first.customerId && r.type === stadtpocketPassService.PASS_LINK_TYPE
  );
  assert.equal(links.length, 1);
});

// ── 6. serialNumber is opaque/non-sequential and never the Customer.id ─

test('Pass.serialNumber is opaque, high-entropy, and never equal to Customer.id', async () => {
  resetFixtures();
  const result = await stadtpocketPassService.resolveOrCreatePass({});
  assert.notEqual(result.serialNumber, result.customerId);
  assert.match(result.serialNumber, stadtpocketPassService.PASS_SERIAL_PATTERN);
  // Never a raw sequential-looking id, unlike the mock's own internal ids.
  assert.notEqual(result.serialNumber, `pass_1`);
});

// ── 7. Race convergence: two links for one customer never breaks resolution ─

test('a duplicate pass-link race converges on the earliest Pass instead of erroring or duplicating', async () => {
  resetFixtures();
  const first = await stadtpocketPassService.resolveOrCreatePass({});

  // Simulate a lost race: seed a second, later pass-link + Pass row for
  // the SAME customer, as two concurrent first-visits might have.
  const rogueSerial = stadtpocketPassService.generateOpaqueToken('sp');
  passRows.push({
    id: `pass_${++seq}`,
    serialNumber: rogueSerial,
    slug: null,
    passTypeId: stadtpocketPassService.STADTPOCKET_PASS_TYPE_ID,
    authToken: null, stampCount: 0, stampGoal: 10, rewardReady: false, totalStamps: 0, rewardsEarned: 0, lastStampAt: null,
    createdAt: nextTimestamp(), updatedAt: nextTimestamp(),
  });
  identityRows.push({
    id: `ci_${++seq}`,
    customerId: first.customerId,
    ownerUserId: STADTPOCKET_PLATFORM_TENANT_ID,
    type: stadtpocketPassService.PASS_LINK_TYPE,
    value: rogueSerial,
    verified: false, verifiedAt: null, slug: null, source: null,
    createdAt: nextTimestamp(), lastSeenAt: nextTimestamp(),
  });

  const result = await stadtpocketPassService.resolveOrCreatePass({ deviceToken: first.deviceToken });
  assert.equal(result.serialNumber, first.serialNumber); // earliest wins, not the rogue one
  assert.equal(result.customerId, first.customerId);
});

// ── 8. Missing/invalid deviceToken never crashes ─────────────────

test('a missing or malformed deviceToken is treated as "no token" and a fresh valid one is minted', async () => {
  resetFixtures();
  assert.equal(stadtpocketPassService.isValidDeviceToken('not-a-valid-token'), false);
  assert.equal(stadtpocketPassService.isValidDeviceToken(undefined), false);
  assert.equal(stadtpocketPassService.isValidDeviceToken(null), false);

  const result = await stadtpocketPassService.resolveOrCreatePass({ deviceToken: 'not-a-valid-token' });
  assert.equal(stadtpocketPassService.isValidDeviceToken(result.deviceToken), true);
  assert.equal(result.isNewCustomer, true);
});

// ── 9. Existing Customer Foundation behavior remains green ───────

test('existing owner-scoped resolveOrCreateCustomerIdentity behavior is unaffected by the new StadtPocket service existing', async () => {
  resetFixtures();
  const a = await resolveOrCreateCustomerIdentity({ ownerUserId: 'owner_x', type: 'cid', value: 'cid123' });
  const b = await resolveOrCreateCustomerIdentity({ ownerUserId: 'owner_x', type: 'cid', value: 'cid123' });
  assert.equal(a.customerId, b.customerId);
  assert.equal(a.created, true);
  assert.equal(b.created, false);

  // Same value, different owner -- must never collide (pre-existing,
  // unmodified guarantee of the Customer Foundation itself).
  const c = await resolveOrCreateCustomerIdentity({ ownerUserId: 'owner_y', type: 'cid', value: 'cid123' });
  assert.notEqual(c.customerId, a.customerId);

  // A falsy ownerUserId remains a safe no-op, exactly as before.
  const noop = await resolveOrCreateCustomerIdentity({ ownerUserId: null, type: 'cid', value: 'cid123' });
  assert.equal(noop, null);
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
