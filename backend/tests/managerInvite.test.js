// ============================================================
// managerInvite.test.js — mocked-Prisma/Clerk tests for Phase 6D.1:
// StadtPocket Manager Invitation onboarding
// (POST/GET /admin/manager-invites, POST /admin/manager-invites/:id/revoke,
// GET /manager-invites/preview, POST /manager-invites/accept).
//
// No test framework dependency: uses Node's built-in `assert` and a tiny
// inline runner, following the same pattern as businessClaim.test.js /
// stadtpocketManagerWrite.test.js. Prisma, @clerk/backend, and
// emailService.js are mocked by pre-seeding require.cache before any
// route/service is required, so no real DB, network, or email call is
// ever made, and no real Clerk token/session is ever needed.
//
// Covers Phase 6D.1 task items 1-14 (Authorization, Invitation
// Acceptance, Role/Scope). Items 15-18 (Login/Guard: role resolution
// timing, no-fallback-while-unresolved, redirect-injection rejection,
// safe-redirect success) are pure client-side DOM/Clerk-widget logic in
// stadtpocket-admin-guard.js / stadtpocket-login.html with no Node-testable
// surface and no existing frontend test harness in this repo -- verified
// instead by direct code review (see the Phase 6D.1 report) plus the
// visual verification pass, not fabricated here as automated tests.
//
// Run: node tests/managerInvite.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const crypto = require('crypto');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');
const emailServicePath = resolve('src', 'services', 'emailService.js');

// ── Fixture data (mutable, reset per test) ──────────────────────
const NET1 = 'net_stadtpocket';
const ULM = 'loc_ulm';
const MUNICH = 'loc_munich';

let networkRows = [];
let locationRows = [];
let managerInviteRows = [];
let networkMemberRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }

let tokenValid = true;
let currentUserId = 'user_admin';
let clerkUserFixture = null; // { id, publicMetadata, primaryEmailAddressId, emailAddresses }
let sentEmails = [];

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function resetFixtures() {
  networkRows = [{ id: NET1, name: 'StadtPocket', slug: 'stadt-pocket' }];
  locationRows = [
    { id: ULM, networkId: NET1, name: 'Ulm', slug: 'ulm', type: 'city' },
    { id: MUNICH, networkId: NET1, name: 'München', slug: 'muenchen', type: 'city' },
  ];
  managerInviteRows = [];
  networkMemberRows = [];
  idSeq = 0;
  sentEmails = [];
  tokenValid = true;
  currentUserId = 'user_admin';
  clerkUserFixture = {
    id: 'user_admin',
    publicMetadata: { role: 'admin' },
    primaryEmailAddressId: 'ea_admin',
    emailAddresses: [{ id: 'ea_admin', emailAddress: 'admin@example.com', verification: { status: 'verified' } }],
  };
}

// Creates a pending ManagerInvite fixture directly (bypassing
// createInvite's own validation) with a known raw token, for tests that
// exercise acceptance behavior in isolation from creation.
function makeInvite(overrides = {}) {
  const rawToken = `rawtoken_${nextId('t')}_${crypto.randomBytes(6).toString('hex')}`;
  const row = {
    id: nextId('invite'),
    email: 'manager@example.com',
    name: 'Christopher',
    networkId: NET1,
    locationId: MUNICH,
    role: 'location_manager',
    status: 'pending',
    tokenHash: hashToken(rawToken),
    createdBy: 'user_admin',
    acceptedByUserId: null,
    acceptedNetworkMemberId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
  managerInviteRows.push(row);
  return { row, rawToken };
}

// ── Mock Prisma ──────────────────────────────────────────────────
function attachIncludes(row, include) {
  const out = { ...row };
  if (include && include.network) {
    const n = networkRows.find((x) => x.id === row.networkId);
    out.network = n ? { id: n.id, name: n.name, slug: n.slug } : null;
  }
  if (include && include.location) {
    const l = row.locationId ? locationRows.find((x) => x.id === row.locationId) : null;
    out.location = l ? { id: l.id, name: l.name, slug: l.slug } : null;
  }
  return out;
}

const mockPrisma = {
  network: {
    findUnique: async ({ where }) => networkRows.find((n) => n.id === where.id) || null,
  },
  location: {
    findUnique: async ({ where }) => locationRows.find((l) => l.id === where.id) || null,
  },
  managerInvite: {
    findFirst: async ({ where }) => managerInviteRows.find((i) =>
      i.email === where.email
      && i.networkId === where.networkId
      && (i.locationId ?? null) === (where.locationId ?? null)
      && (where.status === undefined || i.status === where.status)
    ) || null,
    findUnique: async ({ where, include }) => {
      let row = null;
      if (where.id !== undefined) row = managerInviteRows.find((i) => i.id === where.id) || null;
      else if (where.tokenHash !== undefined) row = managerInviteRows.find((i) => i.tokenHash === where.tokenHash) || null;
      return row ? attachIncludes(row, include) : null;
    },
    findMany: async ({ include } = {}) => {
      const rows = [...managerInviteRows].sort((a, b) => b.createdAt - a.createdAt);
      return rows.map((r) => attachIncludes(r, include));
    },
    create: async ({ data }) => {
      const row = { id: nextId('invite'), createdAt: new Date(), updatedAt: new Date(), ...data };
      managerInviteRows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = managerInviteRows.find((i) => i.id === where.id);
      if (!row) throw new Error('invite not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    updateMany: async ({ where, data }) => {
      const row = managerInviteRows.find((i) => i.id === where.id && i.status === where.status);
      if (!row) return { count: 0 };
      Object.assign(row, data, { updatedAt: new Date() });
      return { count: 1 };
    },
  },
  networkMember: {
    findFirst: async ({ where }) => networkMemberRows.find((m) =>
      m.userId === where.userId && m.networkId === where.networkId && (m.locationId ?? null) === (where.locationId ?? null)
    ) || null,
    findMany: async ({ where }) => networkMemberRows.filter((r) => r.userId === where.userId),
    create: async ({ data }) => {
      const row = { id: nextId('nm'), createdAt: new Date(), updatedAt: new Date(), ...data };
      networkMemberRows.push(row);
      return row;
    },
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// ── Clerk mock ────────────────────────────────────────────────────
require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => {
      if (!tokenValid) throw new Error('simulated invalid/expired token');
      return { sub: currentUserId };
    },
    createClerkClient: () => ({
      users: {
        getUser: async (id) => {
          if (clerkUserFixture && clerkUserFixture.id === id) return clerkUserFixture;
          return { id, publicMetadata: {}, primaryEmailAddressId: null, emailAddresses: [] };
        },
      },
    }),
  },
};

// ── Email mock ─────────────────────────────────────────────────
// adminRoutes.js (required below) constructs a real Resend client at
// emailService.js's module load time -- mocked here so requiring it
// never throws on a missing RESEND_API_KEY and no live network call is
// ever made, matching businessClaim.test.js's exact convention.
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: {
    sendCampaignEmail: async () => ({ success: 0, failed: 0, errors: [] }),
    sendWelcomeEmail: async () => ({ ok: true }),
    sendBusinessInviteEmail: async () => ({ ok: true }),
    sendManagerInviteEmail: async (email, opts) => { sentEmails.push({ email, ...opts }); return { ok: true }; },
  },
};

const adminRoutes = require('../src/routes/adminRoutes');
const { handleListManagerInvites, handleCreateManagerInvite, handleRevokeManagerInvite } = adminRoutes;
const { requireAdmin } = require('../src/middleware/adminMiddleware');
const managerInviteAcceptRoutes = require('../src/routes/managerInviteAcceptRoutes');
const { handleGetInvitePreview, handleAcceptInvite } = managerInviteAcceptRoutes;
const { requireAuth } = require('../src/middleware/auth');
const managerInviteService = require('../src/services/managerInviteService');

// ── Test helpers ──────────────────────────────────────────────────
function fakeReq({ auth = true, query = {}, params = {}, body = {} } = {}) {
  return {
    headers: auth ? { authorization: 'Bearer test-token' } : {},
    query, params, body,
    method: 'GET',
    originalUrl: '/test',
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

async function callAdmin(handler, req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireAdmin(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res;
  await handler(req, res);
  return res;
}

async function callAuth(handler, req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res;
  await handler(req, res);
  return res;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── AUTHORIZATION ────────────────────────────────────────────────

test('1. Global Admin can create a manager invite', async () => {
  resetFixtures();
  const res = await callAdmin(handleCreateManagerInvite, fakeReq({
    body: { email: 'christopher@example.com', name: 'Christopher', networkId: NET1, locationId: MUNICH, role: 'location_manager' },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.invite.email, 'christopher@example.com');
  assert.equal(res.body.invite.status, 'pending');
  assert.equal(sentEmails.length, 1, 'invite email must be sent');
  assert.equal(sentEmails[0].email, 'christopher@example.com');
});

test('2. City Manager (authenticated, NetworkMember but not Clerk admin) cannot create a manager invite', async () => {
  resetFixtures();
  currentUserId = 'user_city_manager';
  clerkUserFixture = { id: 'user_city_manager', publicMetadata: { role: 'staff' }, primaryEmailAddressId: null, emailAddresses: [] };
  networkMemberRows.push({ id: 'nm_1', userId: 'user_city_manager', networkId: NET1, locationId: ULM, role: 'location_manager' });
  const res = await callAdmin(handleCreateManagerInvite, fakeReq({
    body: { email: 'x@example.com', networkId: NET1, locationId: ULM, role: 'location_manager' },
  }));
  assert.equal(res.statusCode, 403);
  assert.equal(managerInviteRows.length, 0, 'no invite must be created');
});

test('3. Ordinary authenticated user (no role, no membership) cannot create a manager invite', async () => {
  resetFixtures();
  currentUserId = 'user_ordinary';
  clerkUserFixture = { id: 'user_ordinary', publicMetadata: {}, primaryEmailAddressId: null, emailAddresses: [] };
  const res = await callAdmin(handleCreateManagerInvite, fakeReq({
    body: { email: 'x@example.com', networkId: NET1, locationId: ULM, role: 'location_manager' },
  }));
  assert.equal(res.statusCode, 403);
  assert.equal(managerInviteRows.length, 0);
});

test('4. Unauthenticated user cannot create a manager invite', async () => {
  resetFixtures();
  const res = await callAdmin(handleCreateManagerInvite, fakeReq({
    auth: false,
    body: { email: 'x@example.com', networkId: NET1, locationId: ULM, role: 'location_manager' },
  }));
  assert.equal(res.statusCode, 401);
  assert.equal(managerInviteRows.length, 0);
});

// ── INVITATION ACCEPTANCE ─────────────────────────────────────────

test('5. Invited authenticated identity (verified, matching email) can accept a valid invite', async () => {
  resetFixtures();
  const { row, rawToken } = makeInvite({ email: 'christopher@example.com', locationId: MUNICH, role: 'location_manager' });
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  const res = await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.networkMember.locationId, MUNICH);
  const updated = managerInviteRows.find((i) => i.id === row.id);
  assert.equal(updated.status, 'accepted');
  assert.equal(updated.acceptedByUserId, 'user_christopher');
});

test('6. Wrong authenticated email cannot accept the invite', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ email: 'christopher@example.com' });
  currentUserId = 'user_someone_else';
  clerkUserFixture = {
    id: 'user_someone_else', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'someone-else@example.com', verification: { status: 'verified' } }],
  };
  const res = await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 403);
  assert.equal(networkMemberRows.length, 0, 'no membership must be created');
});

test('6b. Unverified email cannot accept even with a matching address', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ email: 'christopher@example.com' });
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'unverified' } }],
  };
  const res = await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 403);
  assert.equal(networkMemberRows.length, 0);
});

test('7. Invite cannot be reused after acceptance', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ email: 'christopher@example.com' });
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  const first = await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  assert.equal(first.statusCode, 201);

  const second = await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  assert.equal(second.statusCode, 409);
  assert.equal(networkMemberRows.length, 1, 'still only one membership after the second attempt');
});

test('8. Invalid/unknown token is rejected', async () => {
  resetFixtures();
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  const res = await callAuth(handleAcceptInvite, fakeReq({ body: { token: 'this-token-does-not-exist' } }));
  assert.equal(res.statusCode, 404);
});

test('9. Duplicate membership (two overlapping invites accepted by the same person) is handled safely, not as an error', async () => {
  resetFixtures();
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  const first = makeInvite({ email: 'christopher@example.com', locationId: MUNICH, role: 'location_manager' });
  const second = makeInvite({ email: 'christopher@example.com', locationId: MUNICH, role: 'location_manager' });

  const res1 = await callAuth(handleAcceptInvite, fakeReq({ body: { token: first.rawToken } }));
  assert.equal(res1.statusCode, 201);
  const res2 = await callAuth(handleAcceptInvite, fakeReq({ body: { token: second.rawToken } }));
  assert.equal(res2.statusCode, 201, 'second accept must succeed idempotently, not error');
  assert.equal(networkMemberRows.length, 1, 'exactly one real NetworkMember must exist, not two');
  assert.equal(res1.body.networkMember.id, res2.body.networkMember.id, 'both accepts resolve to the same membership row');
});

test('10. Client cannot change the invited city/scope during acceptance (extra fields rejected)', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ email: 'christopher@example.com', locationId: MUNICH });
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  const res = await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken, locationId: ULM } }));
  assert.equal(res.statusCode, 400, 'an unexpected field (locationId) must be rejected outright');
  assert.equal(managerInviteRows.find((i) => i.tokenHash === hashToken(rawToken)).status, 'pending', 'invite must remain untouched');
});

// ── ROLE / SCOPE ──────────────────────────────────────────────────

test('11. Accepted manager receives only their assigned city', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ email: 'christopher@example.com', locationId: MUNICH, role: 'location_manager' });
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  const { requireManagerScope } = require('../src/middleware/locationManagerAuth');
  const req = fakeReq();
  const res = fakeRes();
  let scope = null;
  await requireManagerScope(req, res, () => { scope = req.managerScope; });
  assert.ok(scope, 'requireManagerScope must grant access');
  assert.deepEqual(scope.locationIds, [MUNICH]);
});

test('12. Accepted manager cannot access another city', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ email: 'christopher@example.com', locationId: MUNICH, role: 'location_manager' });
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  const { requireManagerScope } = require('../src/middleware/locationManagerAuth');
  const req = fakeReq();
  const res = fakeRes();
  let scope = null;
  await requireManagerScope(req, res, () => { scope = req.managerScope; });
  assert.ok(!scope.locationIds.includes(ULM), 'Munich manager must not implicitly have Ulm');
});

test('13. Global Admin retains platform-wide access regardless of NetworkMember rows', async () => {
  resetFixtures();
  // Global Admin has zero NetworkMember rows in this fixture -- access
  // must come from Clerk publicMetadata.role alone, never from scope.
  const { requireStadtpocketWriteScope } = require('../src/middleware/stadtpocketManagerAuth');
  const req = fakeReq();
  const res = fakeRes();
  let scope = null;
  await requireStadtpocketWriteScope(req, res, () => { scope = req.stadtpocketScope; });
  assert.ok(scope && scope.isGlobalAdmin === true);
});

test('14. Authenticated user with no assignment and no accepted invite gets no manager scope', async () => {
  resetFixtures();
  currentUserId = 'user_no_assignment';
  clerkUserFixture = { id: 'user_no_assignment', publicMetadata: {}, primaryEmailAddressId: null, emailAddresses: [] };
  const { requireManagerScope } = require('../src/middleware/locationManagerAuth');
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await requireManagerScope(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

// ── Additional coverage: revoke + preview + list ──────────────────

test('Revoked invite cannot later be accepted', async () => {
  resetFixtures();
  const { row, rawToken } = makeInvite({ email: 'christopher@example.com' });
  const revokeRes = await callAdmin(handleRevokeManagerInvite, fakeReq({ params: { id: row.id } }));
  assert.equal(revokeRes.statusCode, undefined); // 200 default (handler calls bare res.json(), matching managerStadtpocketListingRoutes.js's own convention)

  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  const acceptRes = await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  assert.equal(acceptRes.statusCode, 410);
});

test('Expired invite is rejected at accept time', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ email: 'christopher@example.com', expiresAt: new Date(Date.now() - 1000) });
  currentUserId = 'user_christopher';
  clerkUserFixture = {
    id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'christopher@example.com', verification: { status: 'verified' } }],
  };
  const res = await callAuth(handleAcceptInvite, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 410);
});

test('Global Admin list includes network/location display data, never tokenHash', async () => {
  resetFixtures();
  makeInvite({ email: 'christopher@example.com', locationId: MUNICH });
  const res = await callAdmin(handleListManagerInvites, fakeReq());
  assert.equal(res.statusCode, undefined); // 200 default (bare res.json())
  assert.equal(res.body.invites.length, 1);
  assert.equal(res.body.invites[0].location.name, 'München');
  assert.equal(res.body.invites[0].tokenHash, undefined);
});

test('Preview by token is readable without accepting (no status change)', async () => {
  resetFixtures();
  const { row, rawToken } = makeInvite({ email: 'christopher@example.com', locationId: MUNICH, role: 'location_manager' });
  currentUserId = 'user_christopher';
  clerkUserFixture = { id: 'user_christopher', publicMetadata: {}, primaryEmailAddressId: null, emailAddresses: [] };
  const res = await callAuth(handleGetInvitePreview, fakeReq({ query: { token: rawToken } }));
  assert.equal(res.statusCode, undefined); // 200 default (bare res.json())
  assert.equal(res.body.invite.location.name, 'München');
  assert.equal(managerInviteRows.find((i) => i.id === row.id).status, 'pending');
});

test('Creating an invite for a location_manager role without a locationId is rejected', async () => {
  resetFixtures();
  const res = await callAdmin(handleCreateManagerInvite, fakeReq({
    body: { email: 'x@example.com', networkId: NET1, role: 'location_manager' },
  }));
  assert.equal(res.statusCode, 400);
});

test('Creating a duplicate pending invite for the same email + exact assignment is rejected', async () => {
  resetFixtures();
  makeInvite({ email: 'christopher@example.com', locationId: MUNICH, status: 'pending' });
  const res = await callAdmin(handleCreateManagerInvite, fakeReq({
    body: { email: 'christopher@example.com', networkId: NET1, locationId: MUNICH, role: 'location_manager' },
  }));
  assert.equal(res.statusCode, 409);
});

// ── runner ──────────────────────────────────────────────────────
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
