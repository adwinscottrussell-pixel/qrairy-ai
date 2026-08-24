// ============================================================
// cityBusinessOnboarding.test.js — mocked-Prisma/Clerk tests for
// Phase 3B Step 3A: Pending New-Business Invite Foundation
// (POST /manager/businesses/onboard, POST /manager/businesses/onboard/
// :inviteId/cancel, plus the pendingInvites addition to
// GET /manager/businesses).
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the same pattern as
// tests/locationManagerAuth.test.js and
// tests/managerBusinessMembership.test.js.
//
// Run: node tests/cityBusinessOnboarding.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');

// ── Fixture data (mutable, reset per test) ──────────────────────
const NET1 = 'net_stadtpocket';
const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';

const ulmLocation = { id: ULM, networkId: NET1, name: 'Ulm', slug: 'ulm', type: 'city', status: 'active', network: { id: NET1, name: 'Stadt Pocket' } };
const stuttgartLocation = { id: STUTTGART, networkId: NET1, name: 'Stuttgart', slug: 'stuttgart', type: 'city', status: 'active', network: { id: NET1, name: 'Stadt Pocket' } };

let locationRows = [];
let businessRows = [];
let businessLocationRows = [];
let inviteRows = []; // { id, locationId, businessName, email, status, tokenHash, createdBy, createdAt, updatedAt, expiresAt, claimedBusinessId }
let networkMemberRows = [];
let inviteSeq = 0;

function resetFixtures() {
  locationRows = [ulmLocation, stuttgartLocation];
  businessRows = [
    { id: 'biz_staib', name: 'Baeckerei Staib', slug: 'baeckerei-staib', status: 'active', primaryOwnerUserId: 'owner1' },
  ];
  businessLocationRows = [];
  inviteRows = [];
  networkMemberRows = [];
  inviteSeq = 0;
  tokenValid = true;
}

const mockPrisma = {
  networkMember: {
    findMany: async ({ where }) => networkMemberRows.filter((r) => r.userId === where.userId),
  },
  location: {
    findMany: async ({ where }) => {
      if (where.networkId) {
        const ids = where.networkId.in;
        return locationRows.filter((l) => ids.includes(l.networkId)).map((l) => ({ id: l.id }));
      }
      const ids = where.id.in;
      return locationRows.filter((l) => ids.includes(l.id));
    },
  },
  business: {
    findMany: async ({ where }) => {
      let rows = businessRows;
      if (where && where.status && where.status.not) {
        rows = rows.filter((b) => b.status !== where.status.not);
      }
      return rows.map((b) => ({ id: b.id, name: b.name, slug: b.slug }));
    },
  },
  businessLocation: {
    findMany: async ({ where }) => {
      let rows = businessLocationRows;
      if (where && where.locationId && where.locationId.in) {
        rows = rows.filter((bl) => where.locationId.in.includes(bl.locationId));
      }
      if (where && where.business && where.business.status && where.business.status.not) {
        const excluded = where.business.status.not;
        rows = rows.filter((bl) => bl.business.status !== excluded);
      }
      return rows;
    },
  },
  cityBusinessInvite: {
    findFirst: async ({ where }) => {
      return inviteRows.find((inv) =>
        inv.locationId === where.locationId && inv.email === where.email && inv.status === where.status
      ) || null;
    },
    findUnique: async ({ where }) => inviteRows.find((inv) => inv.id === where.id) || null,
    findMany: async ({ where }) => {
      let rows = inviteRows;
      if (where && where.locationId && where.locationId.in) {
        rows = rows.filter((inv) => where.locationId.in.includes(inv.locationId));
      }
      if (where && where.status) {
        rows = rows.filter((inv) => inv.status === where.status);
      }
      return rows;
    },
    create: async ({ data }) => {
      inviteSeq += 1;
      const row = {
        id: `inv_${inviteSeq}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        claimedBusinessId: null,
      };
      inviteRows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = inviteRows.find((inv) => inv.id === where.id);
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  },
  // Deliberately NOT defined -- Step 3A must never touch Business
  // ownership/creation or BusinessLocation membership. If any code path
  // under test calls prisma.businessMember.<anything>() or
  // prisma.business.create(...)/prisma.businessLocation.create(...), the
  // corresponding call throws on `undefined` and fails the test loudly.
  businessMember: undefined,
};
mockPrisma.business.create = undefined;
mockPrisma.businessLocation.create = undefined;

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// ── Clerk mock ───────────────────────────────────────────────
let tokenValid = true;
let currentUserId = 'user_default';

require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => {
      if (!tokenValid) throw new Error('simulated invalid/expired token');
      return { sub: currentUserId };
    },
  },
};

const managerRoutes = require('../src/routes/managerRoutes');
const { requireManagerScope } = require('../src/middleware/locationManagerAuth');
const { handleOnboardBusiness, handleCancelOnboardInvite, handleGetManagerBusinesses } = managerRoutes;

// ── Test helpers ──────────────────────────────────────────────
function fakeReq({ auth = true, query = {}, params = {}, body = {} } = {}) {
  return {
    headers: auth ? { authorization: 'Bearer test-token' } : {},
    query,
    params,
    body,
    method: 'GET',
    originalUrl: '/manager/businesses',
    connection: { remoteAddress: '127.0.0.1' },
  };
}

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function call(handler, req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireManagerScope(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res;
  await handler(req, res);
  return res;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function ulmManagerReq(overrides = {}) {
  networkMemberRows = [{ id: 'm1', userId: 'user_ulm', networkId: NET1, locationId: ULM, role: 'location_manager' }];
  currentUserId = 'user_ulm';
  return fakeReq(overrides);
}

// ── 1. Ulm City Manager can create a pending invite for Ulm ──

test('1. Ulm City Manager can create a pending invite for Ulm', async () => {
  resetFixtures();
  const req = ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } });
  const res = await call(handleOnboardBusiness, req);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.result, 'created');
  assert.equal(res.body.invite.businessName, 'Cafe Muller');
  assert.equal(res.body.invite.status, 'pending');
  assert.equal(res.body.invite.locationId, ULM);
  assert.equal(inviteRows.length, 1);
  assert.equal(inviteRows[0].locationId, ULM);
});

// ── 2. Another city cannot be supplied/overridden by request body ──

test('2. locationId in the request body is ignored/rejected, never overrides manager scope', async () => {
  resetFixtures();
  const req = ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com', locationId: STUTTGART } });
  const res = await call(handleOnboardBusiness, req);
  assert.equal(res.statusCode, 400, 'unexpected field locationId must be rejected outright');
  assert.equal(inviteRows.length, 0);
});

test('2b. cityId/ownerUserId/businessId/role/billing fields in body are rejected outright', async () => {
  resetFixtures();
  const req = ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com', cityId: STUTTGART, ownerUserId: 'someone', role: 'owner', stripeCustomerId: 'cus_123' } });
  const res = await call(handleOnboardBusiness, req);
  assert.equal(res.statusCode, 400);
  assert.equal(inviteRows.length, 0);
});

// ── 3. Ordinary non-manager user is denied ──

test('3. Authenticated user with no NetworkMember rows cannot create an invite', async () => {
  resetFixtures();
  currentUserId = 'user_no_membership';
  networkMemberRows = [];
  const res = await call(handleOnboardBusiness, fakeReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  assert.equal(res.statusCode, 403);
  assert.equal(inviteRows.length, 0);
});

// ── 4. businessName required ──

test('4. Empty businessName is rejected', async () => {
  resetFixtures();
  const res = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: '   ', email: 'owner@example.com' } }));
  assert.equal(res.statusCode, 400);
  assert.equal(inviteRows.length, 0);
});

// ── 5. Valid email required ──

test('5. Malformed email is rejected', async () => {
  resetFixtures();
  const res = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'not-an-email' } }));
  assert.equal(res.statusCode, 400);
  assert.equal(inviteRows.length, 0);
});

// ── 6. Duplicate pending invite is prevented ──

test('6. Duplicate pending invite for same city+email is rejected, not silently created twice', async () => {
  resetFixtures();
  const first = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  assert.equal(first.statusCode, 201);
  const second = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller 2', email: 'owner@example.com' } }));
  assert.equal(second.statusCode, 409);
  assert.equal(inviteRows.length, 1);
});

// ── 7/8/9. Pending invite does NOT create a Business / BusinessMember / BusinessLocation ──

test('7-9. Pending invite creates no Business, no BusinessMember, no BusinessLocation', async () => {
  resetFixtures();
  const before = businessRows.length;
  // mockPrisma.business.create / businessLocation.create / businessMember
  // are all undefined -- if handleOnboardBusiness or createInvite ever
  // called any of them, this throws and the test fails loudly.
  const res = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  assert.equal(res.statusCode, 201);
  assert.equal(businessRows.length, before, 'no Business row should have been created');
  assert.equal(businessLocationRows.length, 0, 'no BusinessLocation row should have been created');
});

test('7b. Onboarding a name matching an existing canonical Business returns existing_business_found instead of creating an invite', async () => {
  resetFixtures();
  const res = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Baeckerei Staib', email: 'someone@example.com' } }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.result, 'existing_business_found');
  assert.equal(res.body.business.id, 'biz_staib');
  assert.equal(inviteRows.length, 0);
});

// ── 10. Pending invites are visible only to the correct city manager ──

test('10. Pending invites appear in GET /manager/businesses scoped to Ulm, not Stuttgart', async () => {
  resetFixtures();
  await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));

  const ulmRes = await call(handleGetManagerBusinesses, ulmManagerReq({ query: { locationId: ULM } }));
  assert.equal(ulmRes.body.pendingInvites.length, 1);
  assert.equal(ulmRes.body.pendingInvites[0].businessName, 'Cafe Muller');
  assert.equal(ulmRes.body.pendingInvites[0].ownerStatus, 'invitation_pending');
  assert.equal(ulmRes.body.pendingInvites[0].stadtpocketStatus, 'pending');

  const stuttgartRes = await call(handleGetManagerBusinesses, ulmManagerReq({ query: { locationId: STUTTGART } }));
  assert.equal(stuttgartRes.statusCode, 403, "Ulm-only manager can't even query Stuttgart's list");
});

// ── 11. Manager cannot cancel another city's invite ──

test('11. Ulm manager cannot cancel a Stuttgart invite', async () => {
  resetFixtures();
  inviteRows = [{
    id: 'inv_stuttgart_1', locationId: STUTTGART, businessName: 'Foo', email: 'foo@example.com',
    status: 'pending', tokenHash: 'x', createdBy: 'someone', createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(),
  }];
  const res = await call(handleCancelOnboardInvite, ulmManagerReq({ params: { inviteId: 'inv_stuttgart_1' } }));
  assert.equal(res.statusCode, 403);
  assert.equal(inviteRows[0].status, 'pending', 'the Stuttgart invite must be untouched');
});

test('11b. Ulm manager CAN cancel their own Ulm invite', async () => {
  resetFixtures();
  const created = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  const inviteId = created.body.invite.id;
  const res = await call(handleCancelOnboardInvite, ulmManagerReq({ params: { inviteId } }));
  assert.equal(res.statusCode, undefined); // default 200
  assert.equal(res.body.invite.status, 'cancelled');
  assert.equal(inviteRows[0].status, 'cancelled');
});

test('11c. A cancelled invite cannot be cancelled again', async () => {
  resetFixtures();
  const created = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  const inviteId = created.body.invite.id;
  await call(handleCancelOnboardInvite, ulmManagerReq({ params: { inviteId } }));
  const res = await call(handleCancelOnboardInvite, ulmManagerReq({ params: { inviteId } }));
  assert.equal(res.statusCode, 400);
});

// ── 12. Token stored in DB is hashed, not raw ──

test('12. Stored tokenHash is never the raw token, and is a 64-char hex SHA-256 digest', async () => {
  resetFixtures();
  await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  const stored = inviteRows[0].tokenHash;
  assert.equal(typeof stored, 'string');
  assert.equal(stored.length, 64);
  assert.ok(/^[0-9a-f]{64}$/.test(stored), 'tokenHash must be a lowercase hex digest, not a raw token or anything else');
});

test('12b. The response body never includes a raw token or tokenHash field', async () => {
  resetFixtures();
  const res = await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  assert.equal(res.body.invite.token, undefined);
  assert.equal(res.body.invite.tokenHash, undefined);
  assert.equal(res.body.invite.rawToken, undefined);
});

test('onboard: no JWT -> 401', async () => {
  resetFixtures();
  const res = await call(handleOnboardBusiness, fakeReq({ auth: false, body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  assert.equal(res.statusCode, 401);
});

test('pending row never exposes a raw owner/Clerk id or billing field', async () => {
  resetFixtures();
  await call(handleOnboardBusiness, ulmManagerReq({ body: { businessName: 'Cafe Muller', email: 'owner@example.com' } }));
  const res = await call(handleGetManagerBusinesses, ulmManagerReq({ query: { locationId: ULM } }));
  const row = res.body.pendingInvites[0];
  assert.equal(row.createdBy, undefined);
  assert.equal(row.tokenHash, undefined);
  assert.equal(row.stripeCustomerId, undefined);
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
