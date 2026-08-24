// ============================================================
// managerBusinessMembership.test.js — mocked-Prisma/Clerk tests for
// Phase 3B: City Manager Invite Existing Business
// (GET /manager/businesses/search, POST /manager/businesses/:id/invite,
// plus the membershipStatus addition to GET /manager/businesses).
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the same pattern as
// tests/locationManagerAuth.test.js (this suite's Phase 1/3A sibling).
// Prisma and @clerk/backend are mocked by pre-seeding require.cache
// before the middleware/routes are required, so no real DB or network
// call is ever made, and no real Clerk token is ever needed.
//
// Run: node tests/managerBusinessMembership.test.js
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
let businessLocationRows = []; // { id, businessId, locationId, status, business, location }
let networkMemberRows = [];
let userRows = [];

function resetFixtures() {
  locationRows = [ulmLocation, stuttgartLocation];
  businessRows = [
    { id: 'biz_staib', name: 'Baeckerei Staib', slug: 'baeckerei-staib', status: 'active', primaryOwnerUserId: 'owner1' },
    { id: 'biz_bakery_neu', name: 'Bakery Neu', slug: null, status: 'active', primaryOwnerUserId: 'owner2' },
    { id: 'biz_archived', name: 'Archived Biz', slug: null, status: 'archived', primaryOwnerUserId: 'owner3' },
  ];
  businessLocationRows = [
    {
      id: 'bl_staib_ulm', businessId: 'biz_staib', locationId: ULM, status: 'active',
      business: businessRows[0],
      location: { id: ULM, name: 'Ulm', slug: 'ulm' },
    },
  ];
  networkMemberRows = [];
  userRows = [
    { id: 'owner1', email: 'owner1@example.com' },
    { id: 'owner2', email: 'owner2@example.com' },
  ];
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
    // Mirrors handleSearchBusinesses's real shape:
    // { status: { not: 'archived' }, OR: [{name:{contains,mode}}, {slug:{contains,mode}}] }
    findMany: async ({ where, take }) => {
      const term = ((where.OR && where.OR[0] && where.OR[0].name && where.OR[0].name.contains) || '').toLowerCase();
      let rows = businessRows.filter((b) => b.status !== 'archived');
      rows = rows.filter((b) => b.name.toLowerCase().includes(term) || (b.slug || '').toLowerCase().includes(term));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      if (take) rows = rows.slice(0, take);
      return rows.map((b) => ({ id: b.id, name: b.name, slug: b.slug }));
    },
    findUnique: async ({ where }) => businessRows.find((b) => b.id === where.id) || null,
  },
  businessLocation: {
    findMany: async ({ where }) => {
      // handleSearchBusinesses shape: { businessId: { in: [...] }, locationId }
      if (where.businessId && where.businessId.in) {
        return businessLocationRows
          .filter((bl) => where.businessId.in.includes(bl.businessId) && bl.locationId === where.locationId)
          .map((bl) => ({ businessId: bl.businessId, status: bl.status }));
      }
      // handleGetManagerBusinesses shape: { locationId: { in: [...] }, business: { status: { not } } }
      let rows = businessLocationRows;
      if (where.locationId && where.locationId.in) {
        rows = rows.filter((bl) => where.locationId.in.includes(bl.locationId));
      }
      if (where.business && where.business.status && where.business.status.not) {
        const excluded = where.business.status.not;
        rows = rows.filter((bl) => bl.business.status !== excluded);
      }
      return rows;
    },
    findUnique: async ({ where }) => {
      const { businessId, locationId } = where.businessId_locationId;
      return businessLocationRows.find((bl) => bl.businessId === businessId && bl.locationId === locationId) || null;
    },
    create: async ({ data }) => {
      const business = businessRows.find((b) => b.id === data.businessId);
      const location = locationRows.find((l) => l.id === data.locationId);
      const row = {
        id: `bl_new_${businessLocationRows.length + 1}`,
        businessId: data.businessId,
        locationId: data.locationId,
        status: data.status,
        joinedAt: new Date(),
        business,
        location: { id: location.id, name: location.name, slug: location.slug },
      };
      businessLocationRows.push(row);
      return row;
    },
  },
  user: {
    findMany: async ({ where }) => {
      const ids = where.id.in;
      return userRows.filter((u) => ids.includes(u.id));
    },
  },
  // Step 3A addition: GET /manager/businesses now also fetches pending
  // CityBusinessInvite rows via cityBusinessInviteService. This suite
  // predates Step 3A and isn't testing that feature, so a no-op stub is
  // enough to keep handleGetManagerBusinesses from throwing.
  cityBusinessInvite: {
    findMany: async () => [],
  },
  // Deliberately NOT defined. Business ownership/admin permissions live on
  // BusinessMember -- if the invite flow ever touched it (which it must
  // not, per the Phase 3B architecture boundary), calling any method on
  // `undefined` throws immediately and fails the test loudly, rather than
  // silently mutating an object this suite forgot to assert on.
  businessMember: undefined,
};

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
const { handleGetManagerBusinesses, handleSearchBusinesses, handleInviteBusiness } = managerRoutes;

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
  if (!nextCalled) return res; // middleware short-circuited (401/403/500)
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

// ── 1. Authenticated Ulm City Manager can list Ulm memberships ──

test('1. Ulm City Manager can list Ulm memberships', async () => {
  resetFixtures();
  const res = await call(handleGetManagerBusinesses, ulmManagerReq({ query: { locationId: ULM } }));
  assert.equal(res.statusCode, undefined); // default 200
  assert.deepEqual(res.body.businesses.map((b) => b.id), ['biz_staib']);
  assert.equal(res.body.businesses[0].locations[0].membershipStatus, 'active');
});

// ── 2. Ulm manager cannot read another city's memberships ──

test("2. Ulm manager cannot read Stuttgart's memberships", async () => {
  resetFixtures();
  const res = await call(handleGetManagerBusinesses, ulmManagerReq({ query: { locationId: STUTTGART } }));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.businesses, undefined);
});

// ── 3. Ulm manager can invite an existing Business into Ulm ──

test('3. Ulm manager can invite an existing Business into Ulm', async () => {
  resetFixtures();
  const req = ulmManagerReq({ params: { businessId: 'biz_bakery_neu' }, body: { locationId: ULM } });
  const res = await call(handleInviteBusiness, req);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.membership.businessId, 'biz_bakery_neu');
  assert.equal(res.body.membership.locationId, ULM);
  assert.equal(res.body.membership.status, 'invited'); // approved initial status, never "active"
  assert.ok(businessLocationRows.some((bl) => bl.businessId === 'biz_bakery_neu' && bl.locationId === ULM && bl.status === 'invited'));
});

test('3b. Invited Business appears in the Ulm memberships list with status "invited"', async () => {
  resetFixtures();
  await call(handleInviteBusiness, ulmManagerReq({ params: { businessId: 'biz_bakery_neu' }, body: { locationId: ULM } }));
  const res = await call(handleGetManagerBusinesses, ulmManagerReq({ query: { locationId: ULM } }));
  const invited = res.body.businesses.find((b) => b.id === 'biz_bakery_neu');
  assert.ok(invited, 'expected biz_bakery_neu in the Ulm list after invite');
  assert.equal(invited.locations[0].membershipStatus, 'invited');
});

// ── 4. cityId from frontend cannot override Ulm scope ──

test('4. Sending Stuttgart as locationId cannot make an Ulm-only manager invite into Stuttgart', async () => {
  resetFixtures();
  const req = ulmManagerReq({ params: { businessId: 'biz_bakery_neu' }, body: { locationId: STUTTGART } });
  const res = await call(handleInviteBusiness, req);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.membership, undefined);
  assert.ok(!businessLocationRows.some((bl) => bl.businessId === 'biz_bakery_neu'), 'no membership row should have been created');
});

test('4b. Same protection on the search endpoint -- Ulm manager cannot search scoped to Stuttgart', async () => {
  resetFixtures();
  const req = ulmManagerReq({ query: { q: 'bakery', locationId: STUTTGART } });
  const res = await call(handleSearchBusinesses, req);
  assert.equal(res.statusCode, 403);
});

// ── 5. Duplicate Business + City invite is rejected ──

test('5. Duplicate invite for the same Business + City is rejected with 409, not a second row', async () => {
  resetFixtures();
  const req = ulmManagerReq({ params: { businessId: 'biz_staib' }, body: { locationId: ULM } }); // biz_staib already active in Ulm
  const res = await call(handleInviteBusiness, req);
  assert.equal(res.statusCode, 409);
  assert.equal(businessLocationRows.filter((bl) => bl.businessId === 'biz_staib' && bl.locationId === ULM).length, 1);
});

// ── 6. Nonexistent Business cannot be invited ──

test('6. Nonexistent Business cannot be invited -> 404', async () => {
  resetFixtures();
  const req = ulmManagerReq({ params: { businessId: 'biz_does_not_exist' }, body: { locationId: ULM } });
  const res = await call(handleInviteBusiness, req);
  assert.equal(res.statusCode, 404);
});

test('6b. Archived Business cannot be invited -> 404 (excluded, same as read endpoints)', async () => {
  resetFixtures();
  const req = ulmManagerReq({ params: { businessId: 'biz_archived' }, body: { locationId: ULM } });
  const res = await call(handleInviteBusiness, req);
  assert.equal(res.statusCode, 404);
});

// ── 7. Ordinary authenticated user without City Manager assignment is denied ──

test('7. Authenticated user with no NetworkMember rows cannot search or invite', async () => {
  resetFixtures();
  currentUserId = 'user_no_membership';
  networkMemberRows = [];

  const searchRes = await call(handleSearchBusinesses, fakeReq({ query: { q: 'bakery', locationId: ULM } }));
  assert.equal(searchRes.statusCode, 403);

  const inviteRes = await call(handleInviteBusiness, fakeReq({ params: { businessId: 'biz_bakery_neu' }, body: { locationId: ULM } }));
  assert.equal(inviteRes.statusCode, 403);
});

// ── 8. City Manager invite does NOT change Business ownership/admin permissions ──

test('8. Inviting a Business never touches its ownership -- primaryOwnerUserId unchanged, BusinessMember untouched', async () => {
  resetFixtures();
  const before = businessRows.find((b) => b.id === 'biz_bakery_neu').primaryOwnerUserId;

  // mockPrisma.businessMember is undefined -- if handleInviteBusiness ever
  // called prisma.businessMember.<anything>(), this line throws and the
  // test fails loudly (see the mockPrisma comment above).
  const res = await call(handleInviteBusiness, ulmManagerReq({ params: { businessId: 'biz_bakery_neu' }, body: { locationId: ULM } }));

  assert.equal(res.statusCode, 201);
  const after = businessRows.find((b) => b.id === 'biz_bakery_neu').primaryOwnerUserId;
  assert.equal(after, before, 'primaryOwnerUserId must be unchanged by an invite');
  assert.equal(after, 'owner2'); // still the original QRAIVY owner, not the inviting manager
});

// ── Search endpoint: field minimalism + isMember flag ──

test('search: results never include primaryOwnerUserId or any owner/billing field', async () => {
  resetFixtures();
  const res = await call(handleSearchBusinesses, ulmManagerReq({ query: { q: 'bak', locationId: ULM } }));
  assert.equal(res.statusCode, undefined);
  assert.ok(res.body.businesses.length > 0);
  for (const b of res.body.businesses) {
    assert.equal(b.primaryOwnerUserId, undefined);
    assert.equal(b.ownerEmail, undefined);
  }
});

test('search: isMember true + membershipStatus for an already-invited Business, false for a new one', async () => {
  resetFixtures();
  const res = await call(handleSearchBusinesses, ulmManagerReq({ query: { q: 'ba', locationId: ULM } }));
  const staib = res.body.businesses.find((b) => b.id === 'biz_staib');
  const bakeryNeu = res.body.businesses.find((b) => b.id === 'biz_bakery_neu');
  assert.equal(staib.isMember, true);
  assert.equal(staib.membershipStatus, 'active');
  assert.equal(bakeryNeu.isMember, false);
  assert.equal(bakeryNeu.membershipStatus, null);
});

test('search: query shorter than 2 characters is rejected, not silently truncated to a full dump', async () => {
  resetFixtures();
  const res = await call(handleSearchBusinesses, ulmManagerReq({ query: { q: 'a', locationId: ULM } }));
  assert.equal(res.statusCode, 400);
});

test('search: missing locationId is rejected, never defaults to "all scope"', async () => {
  resetFixtures();
  const res = await call(handleSearchBusinesses, ulmManagerReq({ query: { q: 'bakery' } }));
  assert.equal(res.statusCode, 400);
});

test('invite: missing locationId is rejected', async () => {
  resetFixtures();
  const res = await call(handleInviteBusiness, ulmManagerReq({ params: { businessId: 'biz_bakery_neu' }, body: {} }));
  assert.equal(res.statusCode, 400);
});

test('invite: no JWT -> 401', async () => {
  resetFixtures();
  const res = await call(handleInviteBusiness, fakeReq({ auth: false, params: { businessId: 'biz_bakery_neu' }, body: { locationId: ULM } }));
  assert.equal(res.statusCode, 401);
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
