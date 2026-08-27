// ============================================================
// stadtPocketPageEntitlement.test.js — mocked-Prisma/Clerk tests for
// Phase 3C.4: the one-included-Smart-Page entitlement on POST /lp for a
// claimed StadtPocket Business.
//
// No test framework dependency: uses Node's built-in `assert` and a tiny
// inline runner, following the exact same pattern as
// tests/businessClaim.test.js. Prisma and @clerk/backend are mocked by
// pre-seeding require.cache before lpController.js (or anything it
// requires) is ever required, so no real DB or network call is ever made.
//
// Run: node tests/stadtPocketPageEntitlement.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');

// ── Fixture data (mutable, reset per test) ──────────────────────
let businessRows = [];
let businessLocationRows = [];
let landingPageRows = [];
let userRows = [];
let seq = 0;

const ULM = 'loc_ulm';

function resetFixtures() {
  businessRows = [{ id: 'biz_owned', name: 'rick ross marketing', primaryOwnerUserId: 'user_owner', status: 'active' }];
  businessLocationRows = [{ id: 'bl_1', businessId: 'biz_owned', locationId: ULM, status: 'active', joinedAt: new Date() }];
  landingPageRows = [];
  // user_owner is already AT the trial plan limit (1) with an unrelated
  // pre-existing personal page -- this is the exact real QA scenario
  // (trial account, 3 existing pages in the report; 1 is enough to prove
  // "at limit" against LIMITS.trial === 1).
  userRows = [{ id: 'user_owner', plan: 'trial' }, { id: 'user_other', plan: 'trial' }];
  // Both users are already AT the trial plan limit (1) by default -- this
  // is the real QA scenario, and it's also what makes "no bypass granted"
  // actually observable as a 402 rather than accidentally succeeding
  // because the caller happened to have room under their own normal limit
  // regardless of any businessId they sent.
  landingPageRows.push({ id: 'lp_existing', slug: 'existing-personal-page', userId: 'user_owner', businessId: null, sections: null, createdAt: new Date() });
  landingPageRows.push({ id: 'lp_existing_other', slug: 'existing-personal-page-other', userId: 'user_other', businessId: null, sections: null, createdAt: new Date() });
  seq = 0;
  tokenValid = true;
  currentUserId = 'user_owner';
}

const mockPrisma = {
  business: {
    findUnique: async ({ where }) => businessRows.find((b) => b.id === where.id) || null,
  },
  businessLocation: {
    findFirst: async ({ where }) => businessLocationRows.find((bl) => bl.businessId === where.businessId) || null,
  },
  user: {
    findUnique: async ({ where }) => userRows.find((u) => u.id === where.id) || null,
  },
  landingPage: {
    findUnique: async ({ where }) => landingPageRows.find((lp) => lp.slug === where.slug) || null,
    findFirst: async ({ where }) => landingPageRows.find((lp) => where.businessId ? lp.businessId === where.businessId : false) || null,
    count: async ({ where }) => landingPageRows.filter((lp) => lp.userId === where.userId).length,
    upsert: async ({ where, update, create }) => {
      const existing = landingPageRows.find((lp) => lp.slug === where.slug);
      if (existing) { Object.assign(existing, update); return existing; }
      seq += 1;
      const row = { id: `lp_${seq}`, businessId: null, createdAt: new Date(), ...create };
      landingPageRows.push(row);
      return row;
    },
  },
  // Simple passthrough -- the fixture store is a shared in-memory array
  // either way, so this test harness doesn't need real transactional
  // isolation to prove the entitlement logic; the "no second bypass" case
  // is exercised via two sequential calls (see test 5) rather than
  // simulated concurrency.
  $transaction: async (fn) => fn(mockPrisma),
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// ── Clerk mock ───────────────────────────────────────────────
let tokenValid = true;
let currentUserId = 'user_owner';

require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => {
      if (!tokenValid) throw new Error('simulated invalid/expired token');
      return { sub: currentUserId };
    },
    createClerkClient: () => ({ users: { getUser: async (userId) => ({ id: userId, primaryEmailAddressId: null, emailAddresses: [] }) } }),
  },
};

// ── emailService mock (lpController.js requires it directly; the real
// module constructs a Resend client at load time) ──────────────────
const emailServicePath = resolve('src', 'services', 'emailService.js');
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: { sendWelcomeEmail: async () => ({ ok: true }), sendCampaignEmail: async () => ({ success: 0, failed: 0, errors: [] }), sendBusinessInviteEmail: async () => ({ ok: true }) },
};

const { handlePublishLP } = require('../src/controllers/lpController');

// ── Test helpers ──────────────────────────────────────────────
function fakeReq({ auth = true, body = {} } = {}) {
  return { headers: auth ? { authorization: 'Bearer test-token' } : {}, body };
}
function fakeRes() {
  return { statusCode: undefined, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
async function call(req) {
  const res = fakeRes();
  await handlePublishLP(req, res);
  return res;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. Normal user below plan limit, no businessId ──
test('1. normal user below plan limit, no businessId -> unchanged success', async () => {
  resetFixtures();
  landingPageRows = []; // no existing pages -- under the trial limit of 1
  const res = await call(fakeReq({ body: { slug: 'normal-page', businessName: 'Cafe', qrType: 'ai' } }));
  assert.equal(res.statusCode, undefined); // default 200
  assert.equal(res.body.businessId, undefined);
});

// ── 2. Normal user at plan limit, no businessId ──
test('2. normal user at plan limit, no businessId -> existing plan_limit response, unchanged', async () => {
  resetFixtures(); // already has 1 existing page for user_owner === trial limit
  const res = await call(fakeReq({ body: { slug: 'second-personal-page', businessName: 'Cafe', qrType: 'ai' } }));
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.error, 'plan_limit');
  assert.equal(res.body.limit, 1);
});

// ── 3/4. StadtPocket owner at plan limit + valid unlinked Business -> creation allowed + linked ──
test('3-4. authenticated StadtPocket owner at plan limit + valid unlinked Business -> creation allowed and businessId persisted', async () => {
  resetFixtures(); // user_owner is at the trial limit
  const res = await call(fakeReq({ body: { slug: 'stadtpocket-page', businessName: 'rick ross marketing', qrType: 'ai', businessId: 'biz_owned' } }));
  assert.equal(res.statusCode, undefined); // default 200 -- NOT the 402 that would happen without the grant
  const created = landingPageRows.find((lp) => lp.slug === 'stadtpocket-page');
  assert.ok(created, 'page should have been created');
  assert.equal(created.businessId, 'biz_owned');
});

// ── 5. Same Business used again at plan limit -> plan_limit, no second bypass ──
test('5. same Business used again -> the entitlement is already consumed, normal plan_limit applies', async () => {
  resetFixtures();
  const first = await call(fakeReq({ body: { slug: 'stadtpocket-page-1', businessName: 'rick ross marketing', businessId: 'biz_owned' } }));
  assert.equal(first.statusCode, undefined); // first grant succeeds

  const second = await call(fakeReq({ body: { slug: 'stadtpocket-page-2', businessName: 'rick ross marketing', businessId: 'biz_owned' } }));
  assert.equal(second.statusCode, 402, 'second attempt for the same Business must NOT get another bypass');
  assert.equal(second.body.error, 'plan_limit');
  assert.equal(landingPageRows.filter((lp) => lp.businessId === 'biz_owned').length, 1, 'only one page ever linked to this Business');
});

// ── 6. Another owner's Business -> denied (no bypass; normal limit applies) ──
test('6. another user supplying someone else\'s businessId gets no bypass -- normal plan_limit applies, no data disclosed', async () => {
  resetFixtures();
  currentUserId = 'user_other'; // authenticated as a DIFFERENT user than biz_owned's owner
  const res = await call(fakeReq({ body: { slug: 'attempted-steal', businessName: 'x', businessId: 'biz_owned' } }));
  assert.equal(res.statusCode, 402, 'no bypass granted for a Business the caller does not own');
  assert.equal(res.body.error, 'plan_limit');
  const linked = landingPageRows.find((lp) => lp.slug === 'attempted-steal');
  assert.equal(linked, undefined, 'page must not have been created at all (user_other is also at their own trial limit)');
});

// ── 7. Nonexistent Business -> denied (no bypass; normal limit applies) ──
test('7. nonexistent businessId gets no bypass -- normal plan_limit applies, no existence signal', async () => {
  resetFixtures();
  const res = await call(fakeReq({ body: { slug: 'ghost-business', businessName: 'x', businessId: 'biz_does_not_exist' } }));
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.error, 'plan_limit');
});

// ── 8. Business without valid StadtPocket membership -> no bypass ──
test('8. owned Business with no BusinessLocation membership -> no bypass, normal plan_limit applies', async () => {
  resetFixtures();
  businessRows.push({ id: 'biz_no_membership', name: 'orphan biz', primaryOwnerUserId: 'user_owner', status: 'active' });
  // deliberately no businessLocationRows entry for biz_no_membership
  const res = await call(fakeReq({ body: { slug: 'orphan-attempt', businessName: 'x', businessId: 'biz_no_membership' } }));
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.error, 'plan_limit');
});

// ── 9. Unauthenticated request with businessId -> denied ──
test('9. unauthenticated request with businessId -> explicit 401, not a silent fallback', async () => {
  resetFixtures();
  const res = await call(fakeReq({ auth: false, body: { slug: 'no-auth-attempt', businessName: 'x', businessId: 'biz_owned' } }));
  assert.equal(res.statusCode, 401);
  const created = landingPageRows.find((lp) => lp.slug === 'no-auth-attempt');
  assert.equal(created, undefined, 'no page may be created on an unauthenticated businessId request');
});

// ── 10. Normal onboarding behavior unchanged (no businessId, under limit, existing-page edit) ──
test('10. editing an existing page (no businessId) is unaffected -- plan-limit check is skipped for edits exactly as before', async () => {
  resetFixtures();
  const res = await call(fakeReq({ body: { slug: 'existing-personal-page', businessName: 'Cafe Updated', qrType: 'ai' } }));
  assert.equal(res.statusCode, undefined); // editing an existing page never hits the NEW-page limit check
  const updated = landingPageRows.find((lp) => lp.slug === 'existing-personal-page');
  assert.equal(updated.businessName, 'Cafe Updated');
  assert.equal(updated.businessId, null, 'an ordinary edit must never retroactively acquire a businessId link');
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
