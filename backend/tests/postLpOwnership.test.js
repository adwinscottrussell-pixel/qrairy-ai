// ============================================================
// postLpOwnership.test.js — Security fix: POST /lp existing-page
// ownership enforcement.
//
// Proves:
//   - req.body.userId is never trusted as authenticated identity
//   - anonymous CREATE of a genuinely new slug still works
//   - authenticated CREATE uses the verified token's identity
//   - updating an EXISTING page requires a verified token (401 if absent)
//   - updating an EXISTING page requires the verified user to match its
//     owner (403 on mismatch), even with a forged body.userId
//   - the owner successfully updating their own page still works
//   - an ownerless (legacy) existing page fails closed on update: no
//     authenticated ownership relationship exists to check against, so
//     no user -- however validly authenticated -- may edit it (403),
//     and it can never silently acquire a userId as a side effect
//   - LandingPage.userId can never be rewritten/transferred by an update
//   - the StadtPocket businessId entitlement path is unaffected, and the
//     general ownership gate still applies even when businessId is sent
//     for an existing page owned by someone else
//
// No test framework dependency: uses Node's built-in `assert` and a tiny
// inline runner, matching every other test in this directory. Prisma,
// qrController (for getUserFromToken), emailService, and
// customerIdentityService are all mocked by pre-seeding require.cache
// before lpController.js is required, so no real DB, Clerk, or email
// call is ever made.
//
// Run: node tests/postLpOwnership.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath          = resolve('src', 'utils', 'prismaClient.js');
const pageCachePath             = resolve('src', 'utils', 'pageCache.js');
const qrControllerPath          = resolve('src', 'controllers', 'qrController.js');
const emailServicePath          = resolve('src', 'services', 'emailService.js');
const customerIdentityServicePath = resolve('src', 'services', 'customerIdentityService.js');

// ── Fixtures ─────────────────────────────────────────────────

const landingPages = {}; // slug -> row
const businesses = {};   // id -> row
const businessLocations = {}; // businessId -> row
const users = {};        // id -> row
const upsertCalls = [];

function makePage(overrides = {}) {
  return Object.assign({
    id: 'lp-id', slug: 'existing-slug', businessName: 'Old Name', userId: 'user-a',
    businessId: null, sections: JSON.stringify({}), createdAt: new Date(), updatedAt: new Date(),
  }, overrides);
}

const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug } }) { return landingPages[slug] || null; },
    async findFirst({ where }) {
      if (where.businessId !== undefined) {
        return Object.values(landingPages).find(p => p.businessId === where.businessId) || null;
      }
      return null;
    },
    async count({ where: { userId } }) { return Object.values(landingPages).filter(p => p.userId === userId).length; },
    async upsert(args) {
      upsertCalls.push(args);
      const slug = args.where.slug;
      const isNew = !landingPages[slug];
      const data = isNew ? args.create : Object.assign({}, landingPages[slug], args.update);
      landingPages[slug] = Object.assign({ id: 'lp-' + slug }, data, { slug });
      return landingPages[slug];
    },
    async update({ where: { slug }, data }) {
      landingPages[slug] = Object.assign({}, landingPages[slug], data);
      return landingPages[slug];
    },
  },
  business: { async findUnique({ where: { id } }) { return businesses[id] || null; } },
  businessLocation: { async findFirst({ where: { businessId } }) { return businessLocations[businessId] || null; } },
  user: { async findUnique({ where: { id } }) { return users[id] || null; } },
  async $transaction(fn) { return fn(mockPrisma); },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };
require.cache[pageCachePath] = {
  id: pageCachePath, filename: pageCachePath, loaded: true,
  exports: { pageCache: { delByPrefix() {} } },
};
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: { sendWelcomeEmail: async () => ({ success: 0, failed: 0 }) },
};
require.cache[customerIdentityServicePath] = {
  id: customerIdentityServicePath, filename: customerIdentityServicePath, loaded: true,
  exports: { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} },
};

// getUserFromToken: test convention — "Bearer <userId>" resolves directly
// to <userId>; no header, malformed header, or the literal token
// "invalid-token" all resolve to null, simulating real Clerk verification
// failure without needing a real JWT.
require.cache[qrControllerPath] = {
  id: qrControllerPath, filename: qrControllerPath, loaded: true,
  exports: {
    getUserFromToken: async (authHeader) => {
      if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
      const token = authHeader.slice('Bearer '.length);
      if (token === 'invalid-token') return null;
      return token;
    },
  },
};

const { handlePublishLP } = require('../src/controllers/lpController');

function fakeReq(body, authHeader) {
  return { body, headers: authHeader ? { authorization: authHeader } : {} };
}
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. Anonymous CREATE of a new slug still works ───────────────────────

test('1. anonymous CREATE of a genuinely new slug succeeds (smart-demo.html pattern)', async () => {
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'new-anon-slug', businessName: 'Anon Biz' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(landingPages['new-anon-slug'].userId, null);
});

// ── 2. Authenticated CREATE uses the verified identity ──────────────────

test('2. authenticated CREATE of a new slug assigns the verified token identity', async () => {
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'new-auth-slug', businessName: 'Auth Biz' }, 'Bearer user-a'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(landingPages['new-auth-slug'].userId, 'user-a');
});

// ── 3. body.userId alone does not authenticate an existing-page update ──

test('3. body.userId alone (no token) does NOT authenticate an existing-page update -> 401', async () => {
  landingPages['sp1'] = makePage({ slug: 'sp1', userId: 'user-a', businessName: 'Original' });
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp1', businessName: 'Hacked Name', userId: 'user-a' }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(landingPages['sp1'].businessName, 'Original'); // unchanged
});

// ── 4. existing page update without any token -> 401 ────────────────────

test('4. existing page update without any Authorization header -> 401', async () => {
  landingPages['sp2'] = makePage({ slug: 'sp2', userId: 'user-a', businessName: 'Original' });
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp2', businessName: 'Hacked' }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(landingPages['sp2'].businessName, 'Original');
});

// ── 5. owner token updating own page -> success ──────────────────────────

test('5. owner token updating their own existing page succeeds', async () => {
  landingPages['sp3'] = makePage({ slug: 'sp3', userId: 'user-a', businessName: 'Original' });
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp3', businessName: 'Updated By Owner' }, 'Bearer user-a'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(landingPages['sp3'].businessName, 'Updated By Owner');
});

// ── 6. different authenticated user updating the page -> 403 ────────────

test('6. a different authenticated user updating someone else\'s page -> 403', async () => {
  landingPages['sp4'] = makePage({ slug: 'sp4', userId: 'user-a', businessName: 'Original' });
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp4', businessName: 'Stolen' }, 'Bearer user-b'), res);
  assert.equal(res.statusCode, 403);
  assert.equal(landingPages['sp4'].businessName, 'Original');
});

// ── 7. forged body.userId cannot bypass the mismatch check ──────────────

test('7. forged body.userId (claiming to be the owner) cannot bypass a real cross-account mismatch -> 403', async () => {
  landingPages['sp5'] = makePage({ slug: 'sp5', userId: 'user-a', businessName: 'Original' });
  const res = fakeRes();
  // Attacker has a real token for user-b, but forges body.userId = user-a
  // hoping the old code path would trust it. Must still be 403.
  await handlePublishLP(fakeReq({ slug: 'sp5', businessName: 'Stolen', userId: 'user-a' }, 'Bearer user-b'), res);
  assert.equal(res.statusCode, 403);
  assert.equal(landingPages['sp5'].businessName, 'Original');
});

// ── 8. existing userId can never be transferred/rewritten by update ─────

test('8. LandingPage.userId cannot be transferred by the owner submitting a different body.userId', async () => {
  landingPages['sp6'] = makePage({ slug: 'sp6', userId: 'user-a', businessName: 'Original' });
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp6', businessName: 'Still Mine', userId: 'user-b' }, 'Bearer user-a'), res);
  assert.equal(res.statusCode, 200); // owner editing their own page succeeds
  assert.equal(landingPages['sp6'].userId, 'user-a'); // ownership never moved to user-b
  assert.equal(landingPages['sp6'].businessName, 'Still Mine');
});

test('8b. ownerless (legacy) existing page + no token -> 401', async () => {
  landingPages['sp-orphan'] = makePage({ slug: 'sp-orphan', userId: null, businessName: 'Orphan' });
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp-orphan', businessName: 'Try' }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(landingPages['sp-orphan'].businessName, 'Orphan');
});

test('8c. ownerless (legacy) existing page + a valid but arbitrary authenticated user -> 403 (fail closed)', async () => {
  landingPages['sp-orphan2'] = makePage({ slug: 'sp-orphan2', userId: null, businessName: 'Orphan' });
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp-orphan2', businessName: 'Edited' }, 'Bearer user-c'), res);
  assert.equal(res.statusCode, 403);
  assert.equal(landingPages['sp-orphan2'].businessName, 'Orphan'); // unchanged
});

test('8d. ownerless existing page can never acquire a userId through a rejected update attempt', async () => {
  landingPages['sp-orphan3'] = makePage({ slug: 'sp-orphan3', userId: null, businessName: 'Orphan' });
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp-orphan3', businessName: 'Claimed', userId: 'user-c' }, 'Bearer user-c'), res);
  assert.equal(res.statusCode, 403);
  assert.equal(landingPages['sp-orphan3'].userId, null); // still ownerless, no side-effect claim
  assert.equal(landingPages['sp-orphan3'].businessName, 'Orphan');
});

// ── 9. StadtPocket businessId creation path still passes ────────────────

test('9. StadtPocket businessId entitlement grant still works for a genuinely new page', async () => {
  businesses['biz-1'] = { id: 'biz-1', primaryOwnerUserId: 'user-a' };
  businessLocations['biz-1'] = { id: 'bl-1', businessId: 'biz-1' };
  const res = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp-new-biz', businessName: 'New StadtPocket Biz', businessId: 'biz-1' }, 'Bearer user-a'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(landingPages['sp-new-biz'].businessId, 'biz-1');
  assert.equal(landingPages['sp-new-biz'].userId, 'user-a');
});

test('9b. sending businessId does not bypass the ownership gate for an existing page owned by someone else', async () => {
  landingPages['sp7'] = makePage({ slug: 'sp7', userId: 'user-a', businessId: null, businessName: 'Original' });
  businesses['biz-2'] = { id: 'biz-2', primaryOwnerUserId: 'user-b' };
  businessLocations['biz-2'] = { id: 'bl-2', businessId: 'biz-2' };
  const res = fakeRes();
  // user-b legitimately owns biz-2, but does NOT own the existing sp7 page.
  await handlePublishLP(fakeReq({ slug: 'sp7', businessName: 'Hijacked', businessId: 'biz-2' }, 'Bearer user-b'), res);
  assert.equal(res.statusCode, 403);
  assert.equal(landingPages['sp7'].businessName, 'Original');
});

// ── 10. normal existing Smart QR editing remains compatible ─────────────

test('10. normal existing Smart QR editing (smart-qr-detail.html pattern) remains compatible: owner publish + autosave both succeed', async () => {
  landingPages['sp8'] = makePage({ slug: 'sp8', userId: 'user-a', businessName: 'V1' });
  const res1 = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp8', businessName: 'V2', brandColor: '#111111', sections: { theme: { accentColor: '#111111' } } }, 'Bearer user-a'), res1);
  assert.equal(res1.statusCode, 200);
  const res2 = fakeRes();
  await handlePublishLP(fakeReq({ slug: 'sp8', businessName: 'V3', brandColor: '#222222', sections: { theme: { accentColor: '#222222' } } }, 'Bearer user-a'), res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(landingPages['sp8'].businessName, 'V3');
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
