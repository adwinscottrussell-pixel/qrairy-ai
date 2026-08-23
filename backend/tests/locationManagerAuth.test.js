// ============================================================
// locationManagerAuth.test.js — mocked-Prisma/Clerk tests for the
// City/Location Manager scoped-read foundation (Phase 1, read-only).
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the same pattern as
// tests/attentionService.test.js and tests/scansVsVisits.test.js.
// Prisma and @clerk/backend are mocked by pre-seeding require.cache
// before the middleware/routes are required, so no real DB or network
// call is ever made, and no real Clerk token is ever needed.
//
// Run: node tests/locationManagerAuth.test.js
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
const MUNICH = 'loc_munich';

let networkMemberRows = [];
let locationRows = [
  { id: ULM, networkId: NET1, name: 'Ulm', slug: 'ulm', type: 'city', status: 'active', network: { id: NET1, name: 'Stadt Pocket' } },
  { id: STUTTGART, networkId: NET1, name: 'Stuttgart', slug: 'stuttgart', type: 'city', status: 'active', network: { id: NET1, name: 'Stadt Pocket' } },
  { id: MUNICH, networkId: NET1, name: 'München', slug: 'muenchen', type: 'city', status: 'active', network: { id: NET1, name: 'Stadt Pocket' } },
];
let businessLocationRows = [
  {
    businessId: 'biz_staib', locationId: ULM,
    business: { id: 'biz_staib', name: 'Baeckerei Staib', status: 'active', primaryOwnerUserId: 'owner1' },
    location: { id: ULM, name: 'Ulm', slug: 'ulm' },
  },
  {
    businessId: 'biz_leadconnector', locationId: ULM,
    business: { id: 'biz_leadconnector', name: 'lead connector', status: 'active', primaryOwnerUserId: 'owner1' },
    location: { id: ULM, name: 'Ulm', slug: 'ulm' },
  },
  {
    businessId: 'biz_archived_ulm', locationId: ULM,
    business: { id: 'biz_archived_ulm', name: 'Old Ulm Biz', status: 'archived', primaryOwnerUserId: 'owner1' },
    location: { id: ULM, name: 'Ulm', slug: 'ulm' },
  },
  {
    businessId: 'biz_stuttgart', locationId: STUTTGART,
    business: { id: 'biz_stuttgart', name: 'Stuttgart Biz', status: 'active', primaryOwnerUserId: 'owner2' },
    location: { id: STUTTGART, name: 'Stuttgart', slug: 'stuttgart' },
  },
];

const mockPrisma = {
  networkMember: {
    findMany: async ({ where }) => networkMemberRows.filter((r) => r.userId === where.userId),
  },
  location: {
    // Two distinct callers use this: the middleware resolves network-wide
    // membership via `where.networkId.in` (id-only projection is all it
    // needs); handleGetManagerContext resolves real City identity via
    // `where.id.in` (needs the full row). Same mock, both shapes, matching
    // the two real Prisma queries in the non-test code.
    findMany: async ({ where }) => {
      if (where.networkId) {
        const ids = where.networkId.in;
        return locationRows.filter((l) => ids.includes(l.networkId)).map((l) => ({ id: l.id }));
      }
      const ids = where.id.in;
      return locationRows.filter((l) => ids.includes(l.id));
    },
  },
  businessLocation: {
    findMany: async ({ where }) => {
      const ids = where.locationId.in;
      return businessLocationRows.filter(
        (bl) => ids.includes(bl.locationId) && bl.business.status !== 'archived'
      );
    },
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// ── Clerk mock — configurable per test ───────────────────────────
let tokenValid = true;
let currentUserId = 'user_default';
let mockAdminRole = 'staff'; // for the requireAdmin regression test only

require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => {
      if (!tokenValid) throw new Error('simulated invalid/expired token');
      return { sub: currentUserId };
    },
    createClerkClient: () => ({
      users: {
        getUser: async (id) => ({
          id,
          emailAddresses: [{ emailAddress: `${id}@example.com` }],
          publicMetadata: { role: mockAdminRole },
        }),
      },
    }),
  },
};

const { requireManagerScope } = require('../src/middleware/locationManagerAuth');
const managerRoutes = require('../src/routes/managerRoutes');
const { handleGetManagerBusinesses, handleGetManagerContext } = managerRoutes;

// ── Test helpers ──────────────────────────────────────────────
function fakeReq({ auth = true, query = {} } = {}) {
  return {
    headers: auth ? { authorization: 'Bearer test-token' } : {},
    query,
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

async function callManagerBusinesses(req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireManagerScope(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res; // middleware short-circuited (401/403/500)
  await handleGetManagerBusinesses(req, res);
  return res;
}

async function callManagerContext(req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireManagerScope(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res; // middleware short-circuited (401/403/500)
  await handleGetManagerContext(req, res);
  return res;
}

function resetScopeFixtures() {
  tokenValid = true;
  locationRows = [
    { id: ULM, networkId: NET1, name: 'Ulm', slug: 'ulm', type: 'city', status: 'active', network: { id: NET1, name: 'Stadt Pocket' } },
    { id: STUTTGART, networkId: NET1, name: 'Stuttgart', slug: 'stuttgart', type: 'city', status: 'active', network: { id: NET1, name: 'Stadt Pocket' } },
    { id: MUNICH, networkId: NET1, name: 'München', slug: 'muenchen', type: 'city', status: 'active', network: { id: NET1, name: 'Stadt Pocket' } },
  ];
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. No JWT -> 401 ──────────────────────────────────────────

test('no JWT -> 401', async () => {
  resetScopeFixtures();
  const res = await callManagerBusinesses(fakeReq({ auth: false }));
  assert.equal(res.statusCode, 401);
});

test('invalid/expired token -> 401', async () => {
  resetScopeFixtures();
  tokenValid = false;
  currentUserId = 'user_x';
  const res = await callManagerBusinesses(fakeReq());
  assert.equal(res.statusCode, 401);
  tokenValid = true;
});

// ── 2. Authenticated, no NetworkMember -> 403 ────────────────

test('authenticated user with no NetworkMember rows -> 403', async () => {
  resetScopeFixtures();
  currentUserId = 'user_no_membership';
  networkMemberRows = [];
  const res = await callManagerBusinesses(fakeReq());
  assert.equal(res.statusCode, 403);
});

// ── 3/8. Ulm location_manager sees Ulm Businesses, archived excluded ──

test('Ulm location_manager sees Businesses assigned to Ulm', async () => {
  resetScopeFixtures();
  currentUserId = 'user_ulm';
  networkMemberRows = [{ id: 'm1', userId: 'user_ulm', networkId: NET1, locationId: ULM, role: 'location_manager' }];
  const res = await callManagerBusinesses(fakeReq());
  assert.equal(res.statusCode, undefined); // default 200
  assert.deepEqual(res.body.businesses.map((b) => b.id).sort(), ['biz_leadconnector', 'biz_staib']);
  assert.deepEqual(res.body.scope.locationIds, [ULM]);
});

test('archived Business in Ulm excluded from normal result', async () => {
  resetScopeFixtures();
  currentUserId = 'user_ulm';
  networkMemberRows = [{ id: 'm1', userId: 'user_ulm', networkId: NET1, locationId: ULM, role: 'location_manager' }];
  const res = await callManagerBusinesses(fakeReq());
  assert.ok(!res.body.businesses.some((b) => b.id === 'biz_archived_ulm'));
});

// ── 4/7. Cross-location protection ───────────────────────────

test('Ulm-only manager requesting ?locationId=stuttgart -> 403 (never empty array)', async () => {
  resetScopeFixtures();
  currentUserId = 'user_ulm';
  networkMemberRows = [{ id: 'm1', userId: 'user_ulm', networkId: NET1, locationId: ULM, role: 'location_manager' }];
  const res = await callManagerBusinesses(fakeReq({ query: { locationId: STUTTGART } }));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.businesses, undefined);
});

test('Munich not assigned -> 403 when explicitly requested', async () => {
  resetScopeFixtures();
  currentUserId = 'user_multi';
  networkMemberRows = [
    { id: 'm2', userId: 'user_multi', networkId: NET1, locationId: ULM, role: 'location_manager' },
    { id: 'm3', userId: 'user_multi', networkId: NET1, locationId: STUTTGART, role: 'location_manager' },
  ];
  const res = await callManagerBusinesses(fakeReq({ query: { locationId: MUNICH } }));
  assert.equal(res.statusCode, 403);
});

// ── 5/6. Multi-location manager ──────────────────────────────

test('manager with Ulm+Stuttgart memberships sees both when no filter used', async () => {
  resetScopeFixtures();
  currentUserId = 'user_multi';
  networkMemberRows = [
    { id: 'm2', userId: 'user_multi', networkId: NET1, locationId: ULM, role: 'location_manager' },
    { id: 'm3', userId: 'user_multi', networkId: NET1, locationId: STUTTGART, role: 'location_manager' },
  ];
  const res = await callManagerBusinesses(fakeReq());
  assert.deepEqual(res.body.businesses.map((b) => b.id).sort(), ['biz_leadconnector', 'biz_staib', 'biz_stuttgart']);
});

test('multi-location manager may filter to either assigned Location', async () => {
  resetScopeFixtures();
  currentUserId = 'user_multi';
  networkMemberRows = [
    { id: 'm2', userId: 'user_multi', networkId: NET1, locationId: ULM, role: 'location_manager' },
    { id: 'm3', userId: 'user_multi', networkId: NET1, locationId: STUTTGART, role: 'location_manager' },
  ];
  let res = await callManagerBusinesses(fakeReq({ query: { locationId: ULM } }));
  assert.deepEqual(res.body.businesses.map((b) => b.id).sort(), ['biz_leadconnector', 'biz_staib']);

  res = await callManagerBusinesses(fakeReq({ query: { locationId: STUTTGART } }));
  assert.deepEqual(res.body.businesses.map((b) => b.id), ['biz_stuttgart']);
});

test("a Business's locations field never leaks an out-of-scope Location", async () => {
  resetScopeFixtures();
  // Same Business ('biz_staib') also present in Stuttgart -- an Ulm-only
  // manager must never see the Stuttgart entry in its `locations` array.
  const originalRows = businessLocationRows;
  businessLocationRows = [
    ...originalRows,
    {
      businessId: 'biz_staib', locationId: STUTTGART,
      business: { id: 'biz_staib', name: 'Baeckerei Staib', status: 'active', primaryOwnerUserId: 'owner1' },
      location: { id: STUTTGART, name: 'Stuttgart', slug: 'stuttgart' },
    },
  ];
  currentUserId = 'user_ulm';
  networkMemberRows = [{ id: 'm1', userId: 'user_ulm', networkId: NET1, locationId: ULM, role: 'location_manager' }];
  const res = await callManagerBusinesses(fakeReq());
  const staib = res.body.businesses.find((b) => b.id === 'biz_staib');
  assert.deepEqual(staib.locations.map((l) => l.id), [ULM]);
  businessLocationRows = originalRows;
});

// ── 9. Revocation is immediate (scope read fresh, never cached) ──

test('removing a membership loses access on the very next request', async () => {
  resetScopeFixtures();
  currentUserId = 'user_temp';
  networkMemberRows = [{ id: 'm9', userId: 'user_temp', networkId: NET1, locationId: ULM, role: 'location_manager' }];

  let res = await callManagerBusinesses(fakeReq());
  assert.equal(res.statusCode, undefined);
  assert.ok(res.body.businesses.length > 0);

  networkMemberRows = []; // simulate networkAdminService.removeManager() deleting the row
  res = await callManagerBusinesses(fakeReq());
  assert.equal(res.statusCode, 403);
});

// ── 11. Ambiguous/invalid membership shapes are excluded, not broadly granted ──

test('location_manager with null locationId is excluded, not broadly granted', async () => {
  resetScopeFixtures();
  currentUserId = 'user_ambiguous1';
  networkMemberRows = [{ id: 'm10', userId: 'user_ambiguous1', networkId: NET1, locationId: null, role: 'location_manager' }];
  const res = await callManagerBusinesses(fakeReq());
  assert.equal(res.statusCode, 403);
});

test('network_admin with a set locationId is excluded, not treated as network-wide', async () => {
  resetScopeFixtures();
  currentUserId = 'user_ambiguous2';
  networkMemberRows = [{ id: 'm11', userId: 'user_ambiguous2', networkId: NET1, locationId: ULM, role: 'network_admin' }];
  const res = await callManagerBusinesses(fakeReq());
  assert.equal(res.statusCode, 403);
});

// ── GET /manager/context — City identity for the City Operations Center ──
// (Phase 2: the manager-scoped equivalent of GET /admin/locations/:id, used
// so the frontend's shared City Operations Center never has to call an
// Owner-only /admin/* route for a City Manager session.)

test('context: no JWT -> 401', async () => {
  resetScopeFixtures();
  const res = await callManagerContext(fakeReq({ auth: false }));
  assert.equal(res.statusCode, 401);
});

test('context: authenticated user with no NetworkMember rows -> 403', async () => {
  resetScopeFixtures();
  currentUserId = 'user_no_membership_ctx';
  networkMemberRows = [];
  const res = await callManagerContext(fakeReq());
  assert.equal(res.statusCode, 403);
});

test('context: Ulm manager receives exactly Ulm, with real identity fields', async () => {
  resetScopeFixtures();
  currentUserId = 'user_ulm_ctx';
  networkMemberRows = [{ id: 'm20', userId: 'user_ulm_ctx', networkId: NET1, locationId: ULM, role: 'location_manager' }];
  const res = await callManagerContext(fakeReq());
  assert.equal(res.statusCode, undefined); // default 200
  assert.equal(res.body.locations.length, 1);
  const [ulm] = res.body.locations;
  assert.equal(ulm.id, ULM);
  assert.equal(ulm.name, 'Ulm');
  assert.equal(ulm.slug, 'ulm');
  assert.equal(ulm.status, 'active');
  assert.equal(ulm.network.name, 'Stadt Pocket');
});

test('context: Ulm manager never receives Stuttgart or München -- no client-suppliable id to manipulate', async () => {
  resetScopeFixtures();
  currentUserId = 'user_ulm_ctx2';
  networkMemberRows = [{ id: 'm21', userId: 'user_ulm_ctx2', networkId: NET1, locationId: ULM, role: 'location_manager' }];
  // handleGetManagerContext takes no query/body input at all -- there is no
  // parameter for a caller to tamper with. Proving this by trying anyway:
  // the extra query field must have zero effect on which Locations come back.
  const res = await callManagerContext(fakeReq({ query: { locationId: STUTTGART } }));
  assert.deepEqual(res.body.locations.map((l) => l.id), [ULM]);
});

test('context: multi-location manager receives every assigned city, never a third', async () => {
  resetScopeFixtures();
  currentUserId = 'user_multi_ctx';
  networkMemberRows = [
    { id: 'm22', userId: 'user_multi_ctx', networkId: NET1, locationId: ULM, role: 'location_manager' },
    { id: 'm23', userId: 'user_multi_ctx', networkId: NET1, locationId: STUTTGART, role: 'location_manager' },
  ];
  const res = await callManagerContext(fakeReq());
  assert.deepEqual(res.body.locations.map((l) => l.id).sort(), [ULM, STUTTGART].sort());
  assert.ok(!res.body.locations.some((l) => l.id === MUNICH));
});

test('context: revocation removes the city from context on the very next request', async () => {
  resetScopeFixtures();
  currentUserId = 'user_temp_ctx';
  networkMemberRows = [{ id: 'm24', userId: 'user_temp_ctx', networkId: NET1, locationId: ULM, role: 'location_manager' }];
  let res = await callManagerContext(fakeReq());
  assert.equal(res.body.locations.length, 1);
  networkMemberRows = [];
  res = await callManagerContext(fakeReq());
  assert.equal(res.statusCode, 403);
});

// ── network_admin (locationId=null) resolves to all Locations in that Network ──

test('network_admin (locationId=null) resolves to every Location in that Network', async () => {
  resetScopeFixtures();
  currentUserId = 'user_netadmin';
  networkMemberRows = [{ id: 'm12', userId: 'user_netadmin', networkId: NET1, locationId: null, role: 'network_admin' }];
  const res = await callManagerBusinesses(fakeReq());
  assert.deepEqual(res.body.businesses.map((b) => b.id).sort(), ['biz_leadconnector', 'biz_staib', 'biz_stuttgart']);
  assert.deepEqual(res.body.scope.locationIds.sort(), [MUNICH, STUTTGART, ULM].sort());
});

// ── 10. Global QRAIVY admin logic remains unchanged (regression proof) ──

test('requireAdmin still requires publicMetadata.role===admin (regression proof, untouched by this phase)', async () => {
  const { requireAdmin } = require('../src/middleware/adminMiddleware');

  mockAdminRole = 'staff'; // non-admin, has-a-NetworkMember-row is irrelevant to this check
  const req1 = fakeReq();
  const res1 = fakeRes();
  let next1 = false;
  await requireAdmin(req1, res1, () => { next1 = true; });
  assert.equal(next1, false);
  assert.equal(res1.statusCode, 403);

  mockAdminRole = 'admin';
  const req2 = fakeReq();
  const res2 = fakeRes();
  let next2 = false;
  await requireAdmin(req2, res2, () => { next2 = true; });
  assert.equal(next2, true);
  assert.equal(req2.adminUser.role, 'admin');
});

test('requireAdmin still rejects a request with no token (regression proof)', async () => {
  const { requireAdmin } = require('../src/middleware/adminMiddleware');
  const req = fakeReq({ auth: false });
  const res = fakeRes();
  let nextCalled = false;
  await requireAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
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
