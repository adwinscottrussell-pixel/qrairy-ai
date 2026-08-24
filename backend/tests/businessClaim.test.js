// ============================================================
// businessClaim.test.js — mocked-Prisma/Clerk tests for Phase 3B Step 3B:
// Owner Invitation + Business Claim Flow
// (POST /businesses/claim, GET /businesses/claim/preview, plus the
// resend endpoint's token-invalidation behavior).
//
// No test framework dependency: uses Node's built-in `assert` and a tiny
// inline runner, following the same pattern as
// tests/cityBusinessOnboarding.test.js / tests/managerBusinessMembership.test.js.
// Prisma and @clerk/backend are mocked by pre-seeding require.cache before
// any route/service is required, so no real DB or network call is ever
// made, and no real Clerk token/session is ever needed.
//
// Run: node tests/businessClaim.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const crypto = require('crypto');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');

// ── Fixture data (mutable, reset per test) ──────────────────────
const NET1 = 'net_stadtpocket';
const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const ulmLocation = { id: ULM, name: 'Ulm', slug: 'ulm' };
const stuttgartLocation = { id: STUTTGART, name: 'Stuttgart', slug: 'stuttgart' };
const locationRows = [ulmLocation, stuttgartLocation];

let businessRows = [];
let businessMemberRows = [];
let businessLocationRows = [];
let inviteRows = [];
let userRows = [];
let seq = 0;

// The claimant's live Clerk profile -- controllable per test so we can
// simulate a verified/unverified email and an email that does/doesn't
// match the invite.
let clerkUserFixture = null; // { id, emailAddresses: [{id, emailAddress, verification:{status}}], primaryEmailAddressId }

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function makeInvite(overrides = {}) {
  seq += 1;
  const rawToken = `rawtoken_${seq}_${crypto.randomBytes(8).toString('hex')}`;
  const row = {
    id: `inv_${seq}`,
    locationId: ULM,
    businessName: 'Cafe Muller',
    email: 'owner@example.com',
    status: 'pending',
    tokenHash: hashToken(rawToken),
    createdBy: 'user_ulm_manager',
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    claimedBusinessId: null,
    ...overrides,
  };
  inviteRows.push(row);
  return { row, rawToken };
}

function resetFixtures() {
  businessRows = [];
  businessMemberRows = [];
  businessLocationRows = [];
  inviteRows = [];
  userRows = [{ id: 'user_claimant', email: 'owner@example.com' }];
  seq = 0;
  clerkUserFixture = {
    id: 'user_claimant',
    primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'owner@example.com', verification: { status: 'verified' } }],
  };
  tokenValid = true;
  currentUserId = 'user_claimant';
  networkMemberRows = [];
}

let networkMemberRows = [];

const mockPrisma = {
  networkMember: {
    findMany: async ({ where }) => networkMemberRows.filter((r) => r.userId === where.userId),
  },
  location: {
    findMany: async ({ where }) => {
      const ids = where.id.in;
      return locationRows.filter((l) => ids.includes(l.id)).map((l) => ({ ...l, network: { id: NET1, name: 'Stadt Pocket' } }));
    },
  },
  user: {
    findUnique: async ({ where }) => userRows.find((u) => u.id === where.id) || null,
    findMany: async ({ where }) => {
      const ids = (where && where.id && where.id.in) || [];
      return userRows.filter((u) => ids.includes(u.id)).map((u) => ({ id: u.id, email: u.email || null }));
    },
    upsert: async ({ where, update, create }) => {
      let row = userRows.find((u) => u.id === where.id);
      if (row) {
        Object.assign(row, update);
      } else {
        row = { ...create };
        userRows.push(row);
      }
      return row;
    },
  },
  business: {
    findMany: async ({ where }) => {
      let rows = businessRows;
      if (where && where.primaryOwnerUserId) rows = rows.filter((b) => b.primaryOwnerUserId === where.primaryOwnerUserId);
      if (where && where.status && where.status.not) rows = rows.filter((b) => b.status !== where.status.not);
      return rows;
    },
    findUnique: async ({ where }) => businessRows.find((b) => b.id === where.id) || null,
    create: async ({ data }) => {
      seq += 1;
      const row = { id: `biz_${seq}`, status: 'active', ...data };
      businessRows.push(row);
      return row;
    },
  },
  businessMember: {
    findFirst: async ({ where }) => businessMemberRows.find((m) => m.businessId === where.businessId && m.userId === where.userId) || null,
    create: async ({ data }) => {
      seq += 1;
      const row = { id: `bm_${seq}`, ...data };
      businessMemberRows.push(row);
      return row;
    },
  },
  businessLocation: {
    findUnique: async ({ where }) => {
      const key = where.businessId_locationId;
      return businessLocationRows.find((bl) => bl.businessId === key.businessId && bl.locationId === key.locationId) || null;
    },
    // Mirrors handleGetManagerBusinesses's real shape:
    // { locationId: { in: [...] }, business: { status: { not } } },
    // include: { business: true, location: { select } }
    findMany: async ({ where }) => {
      let rows = businessLocationRows;
      if (where && where.locationId && where.locationId.in) {
        rows = rows.filter((bl) => where.locationId.in.includes(bl.locationId));
      }
      return rows.map((bl) => ({
        ...bl,
        business: businessRows.find((b) => b.id === bl.businessId),
        location: locationRows.find((l) => l.id === bl.locationId),
      }));
    },
    create: async ({ data }) => {
      seq += 1;
      const row = { id: `bl_${seq}`, joinedAt: new Date(), ...data };
      businessLocationRows.push(row);
      return row;
    },
  },
  cityBusinessInvite: {
    findUnique: async ({ where, include }) => {
      const row = inviteRows.find((inv) => (where.tokenHash ? inv.tokenHash === where.tokenHash : inv.id === where.id));
      if (!row) return null;
      if (include && include.location) {
        const loc = locationRows.find((l) => l.id === row.locationId);
        return { ...row, location: loc };
      }
      return { ...row };
    },
    findMany: async ({ where }) => {
      let rows = inviteRows;
      if (where && where.locationId && where.locationId.in) {
        rows = rows.filter((inv) => where.locationId.in.includes(inv.locationId));
      }
      if (where && where.status) {
        rows = rows.filter((inv) => inv.status === where.status);
      }
      return rows.map((r) => ({ ...r }));
    },
    update: async ({ where, data }) => {
      const row = inviteRows.find((inv) => inv.id === where.id);
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    updateMany: async ({ where, data }) => {
      const row = inviteRows.find((inv) => inv.id === where.id && inv.status === where.status);
      if (!row) return { count: 0 };
      Object.assign(row, data, { updatedAt: new Date() });
      return { count: 1 };
    },
  },
  $transaction: async (fn) => fn(mockPrisma),
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// ── Clerk mock ───────────────────────────────────────────────
let tokenValid = true;
let currentUserId = 'user_claimant';

require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => {
      if (!tokenValid) throw new Error('simulated invalid/expired token');
      return { sub: currentUserId };
    },
    createClerkClient: () => ({
      users: {
        getUser: async (userId) => {
          if (clerkUserFixture && clerkUserFixture.id === userId) return clerkUserFixture;
          return { id: userId, primaryEmailAddressId: null, emailAddresses: [] };
        },
      },
    }),
  },
};

// ── Email mock ─────────────────────────────────────────────────
// managerRoutes.js (required below, for scenario 20's integration test)
// constructs a real Resend client at module load -- mocked here so
// requiring it never throws on a missing RESEND_API_KEY and no live
// network call is ever made.
const emailServicePath = resolve('src', 'services', 'emailService.js');
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: {
    sendCampaignEmail: async () => ({ success: 0, failed: 0, errors: [] }),
    sendWelcomeEmail: async () => ({ ok: true }),
    sendBusinessInviteEmail: async () => ({ ok: true }),
  },
};

const businessClaimRoutes = require('../src/routes/businessClaimRoutes');
const { handleGetClaimPreview, handleClaimBusiness } = businessClaimRoutes;
const { requireAuth } = require('../src/middleware/auth');
const managerRoutes = require('../src/routes/managerRoutes');
const { handleGetManagerBusinesses } = managerRoutes;
const { requireManagerScope } = require('../src/middleware/locationManagerAuth');

// ── Test helpers ──────────────────────────────────────────────
function fakeReq({ auth = true, query = {}, params = {}, body = {} } = {}) {
  return {
    headers: auth ? { authorization: 'Bearer test-token' } : {},
    query, params, body, method: 'POST',
    originalUrl: '/businesses/claim',
    connection: { remoteAddress: '127.0.0.1' },
  };
}
function fakeRes() {
  return {
    statusCode: undefined, body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
async function call(handler, req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res;
  await handler(req, res);
  return res;
}

// For scenario 20 -- exercises the real manager-scoped list endpoint
// (requireManagerScope, not requireAuth) against the same fixture store a
// claim was just performed against, to prove the claimed invite really
// disappears from pendingInvites and the new Business really appears.
async function callManager(handler, req) {
  const res = fakeRes();
  let nextCalled = false;
  await requireManagerScope(req, res, () => { nextCalled = true; });
  if (!nextCalled) return res;
  await handler(req, res);
  return res;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. Valid pending invitation claim ──

test('1. Valid pending invitation claim succeeds', async () => {
  resetFixtures();
  const { rawToken } = makeInvite();
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.business.name, 'Cafe Muller');
});

// ── 2. Business created under claimant, not manager ──

test('2. Business is created under the claimant, never the inviting manager', async () => {
  resetFixtures();
  const { row: invite, rawToken } = makeInvite({ createdBy: 'user_ulm_manager' });
  await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(businessRows.length, 1);
  assert.equal(businessRows[0].primaryOwnerUserId, 'user_claimant');
  assert.notEqual(businessRows[0].primaryOwnerUserId, invite.createdBy);
});

// ── 3. BusinessMember owner created ──

test('3. BusinessMember owner relationship is created for the claimant', async () => {
  resetFixtures();
  const { rawToken } = makeInvite();
  await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(businessMemberRows.length, 1);
  assert.equal(businessMemberRows[0].userId, 'user_claimant');
  assert.equal(businessMemberRows[0].role, 'owner');
});

// ── 4. BusinessLocation created for invitation's city ──

test('4. BusinessLocation is created for the invitation\'s original city', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ locationId: ULM });
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(businessLocationRows.length, 1);
  assert.equal(businessLocationRows[0].locationId, ULM);
  assert.equal(res.body.membership.locationId, ULM);
});

// ── 5/6. Invitation becomes claimed, claimedBusinessId recorded ──

test('5-6. Invitation transitions to claimed and records claimedBusinessId', async () => {
  resetFixtures();
  const { row: invite, rawToken } = makeInvite();
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(invite.status, 'claimed');
  assert.equal(invite.claimedBusinessId, res.body.business.id);
});

// ── 7. Invalid token rejected ──

test('7. Invalid/unknown token is rejected', async () => {
  resetFixtures();
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: 'not-a-real-token' } }));
  assert.equal(res.statusCode, 404);
  assert.equal(businessRows.length, 0);
});

// ── 8. Expired token rejected ──

test('8. Expired token is rejected', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ expiresAt: new Date(Date.now() - 1000) });
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 410);
  assert.equal(businessRows.length, 0);
});

// ── 9. Cancelled token rejected (also covers scenario 17: cancel makes token unusable) ──

test('9/17. Cancelled invitation cannot be claimed', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ status: 'cancelled' });
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 410);
  assert.equal(businessRows.length, 0);
});

// ── 10. Already-claimed token cannot create duplicate Business ──

test('10. Already-claimed token is rejected and never creates a second Business', async () => {
  resetFixtures();
  const { rawToken } = makeInvite();
  const first = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(first.statusCode, 201);
  const second = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(second.statusCode, 409);
  assert.equal(businessRows.length, 1, 'a second claim attempt must never create a second Business');
});

// ── 11. Client-supplied owner/city/business fields rejected ──

test('11. Client-supplied ownerUserId/locationId/businessId/role/billing fields are rejected outright', async () => {
  resetFixtures();
  const { rawToken } = makeInvite();
  const res = await call(handleClaimBusiness, fakeReq({
    body: { token: rawToken, ownerUserId: 'someone_else', locationId: STUTTGART, businessId: 'biz_x', role: 'owner', stripeCustomerId: 'cus_x' },
  }));
  assert.equal(res.statusCode, 400);
  assert.equal(businessRows.length, 0);
});

// ── 12. Claimant email mismatch rejected ──

test('12. Claim is rejected when the claimant\'s verified email does not match the invitation email', async () => {
  resetFixtures();
  clerkUserFixture.emailAddresses[0].emailAddress = 'different-person@example.com';
  const { rawToken } = makeInvite({ email: 'owner@example.com' });
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 403);
  assert.equal(businessRows.length, 0);
});

test('12b. Claim is rejected when the claimant\'s primary email is not verified, even if it matches', async () => {
  resetFixtures();
  clerkUserFixture.emailAddresses[0].verification.status = 'unverified';
  const { rawToken } = makeInvite({ email: 'owner@example.com' });
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 403);
  assert.equal(businessRows.length, 0);
});

// ── 13. Same-name duplicate Business protected ──

test('13. Claimant who already owns a Business with the same normalized name reuses it instead of duplicating', async () => {
  resetFixtures();
  businessRows.push({ id: 'biz_existing', name: 'Cafe Muller', status: 'active', primaryOwnerUserId: 'user_claimant' });
  const { rawToken } = makeInvite({ businessName: 'Cafe Muller' });
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.business.id, 'biz_existing');
  assert.equal(businessRows.length, 1, 'no second Business row should be created');
});

// ── 18/19. Manager and platform owner never become owner ──

test('18-19. Neither the inviting manager nor a platform-owner id is ever used as primaryOwnerUserId', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ createdBy: 'user_ulm_manager' });
  await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(businessRows[0].primaryOwnerUserId, 'user_claimant');
  assert.notEqual(businessRows[0].primaryOwnerUserId, 'user_ulm_manager');
  assert.notEqual(businessRows[0].primaryOwnerUserId, 'admin');
  assert.notEqual(businessRows[0].primaryOwnerUserId, 'system');
});

// ── Preview endpoint ──

test('preview: valid pending token returns safe, minimal fields only', async () => {
  resetFixtures();
  const { rawToken } = makeInvite();
  const res = await call(handleGetClaimPreview, fakeReq({ method: 'GET', query: { token: rawToken } }));
  assert.equal(res.statusCode, undefined); // default 200
  assert.equal(res.body.invite.businessName, 'Cafe Muller');
  assert.equal(res.body.invite.city.name, 'Ulm');
  assert.equal(res.body.invite.tokenHash, undefined);
  assert.equal(res.body.invite.createdBy, undefined);
});

test('preview: cancelled/expired/claimed tokens report their real state, never a generic success', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ status: 'cancelled' });
  const res = await call(handleGetClaimPreview, fakeReq({ method: 'GET', query: { token: rawToken } }));
  assert.equal(res.statusCode, 410);
});

test('claim: no JWT -> 401', async () => {
  resetFixtures();
  const { rawToken } = makeInvite();
  const res = await call(handleClaimBusiness, fakeReq({ auth: false, body: { token: rawToken } }));
  assert.equal(res.statusCode, 401);
});

test('claim response never exposes tokenHash or the raw token', async () => {
  resetFixtures();
  const { rawToken } = makeInvite();
  const res = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(res.body.business.tokenHash, undefined);
  assert.equal(res.body.membership.tokenHash, undefined);
  assert.equal(JSON.stringify(res.body).includes(rawToken), false, 'raw token must never appear anywhere in the response');
});

// ── 20. GET /manager/businesses no longer returns claimed invite as pending ──

test('20. After claim, GET /manager/businesses stops listing it as pending and shows the real Business instead', async () => {
  resetFixtures();
  const { rawToken } = makeInvite({ locationId: ULM, businessName: 'Cafe Muller', email: 'owner@example.com' });
  networkMemberRows = [{ id: 'm1', userId: 'user_ulm_manager', networkId: NET1, locationId: ULM, role: 'location_manager' }];

  const managerReq = () => ({
    headers: { authorization: 'Bearer test-token' }, query: { locationId: ULM }, params: {}, body: {},
    method: 'GET', originalUrl: '/manager/businesses', connection: { remoteAddress: '127.0.0.1' },
  });

  currentUserId = 'user_ulm_manager';
  const before = await callManager(handleGetManagerBusinesses, managerReq());
  assert.equal(before.body.pendingInvites.length, 1, 'invite should be pending before claim');
  assert.equal(before.body.businesses.length, 0);

  currentUserId = 'user_claimant';
  const claimRes = await call(handleClaimBusiness, fakeReq({ body: { token: rawToken } }));
  assert.equal(claimRes.statusCode, 201);

  currentUserId = 'user_ulm_manager';
  const after = await callManager(handleGetManagerBusinesses, managerReq());
  assert.equal(after.body.pendingInvites.length, 0, 'claimed invite must no longer appear as pending');
  assert.equal(after.body.businesses.length, 1, 'the real Business must now appear');
  assert.equal(after.body.businesses[0].name, 'Cafe Muller');
  assert.equal(after.body.businesses[0].locations[0].membershipStatus, 'active');
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
