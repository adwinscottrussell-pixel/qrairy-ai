// ============================================================
// adminManagerCandidates.test.js — mocked-Prisma/Clerk tests for the
// Stadt Pocket manager-resolution fix (2026-09-13):
//   - GET /admin/manager-candidates (Clerk-authoritative user list for
//     the "+ Manager zuweisen" picker, independent of the local User
//     table)
//   - networkAdminService.resolveUsers()'s new Clerk fallback for a
//     NetworkMember.userId with no local User row
//   - existing assignManager() duplicate-assignment guard (regression)
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the exact same require.cache-mocking
// pattern as managerInvite.test.js. No real DB, network, or Clerk call
// is ever made.
//
// Run: node tests/adminManagerCandidates.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');

// ── Fixture data ────────────────────────────────────────────────────
let localUserRows = [];   // rows that DO exist in the local `User` table
let clerkUserRows = [];   // full Clerk user directory (independent of localUserRows)
let networkRows = [];
let locationRows = [];
let networkMemberRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }
let clerkListShouldFail = false;

function resetFixtures() {
  localUserRows = [];
  clerkUserRows = [
    { id: 'user_christopher', primaryEmailAddressId: 'ea_c', emailAddresses: [{ id: 'ea_c', emailAddress: 'christopher_russell@web.de' }] },
    { id: 'user_admin', primaryEmailAddressId: 'ea_a', emailAddresses: [{ id: 'ea_a', emailAddress: 'admin@example.com' }] },
    { id: 'user_no_email', primaryEmailAddressId: null, emailAddresses: [] },
  ];
  networkRows = [{ id: 'net_sp', name: 'Stadt Pocket', slug: 'stadt-pocket', status: 'active' }];
  locationRows = [{ id: 'loc_ulm', networkId: 'net_sp', name: 'Ulm', slug: 'ulm', type: 'city', status: 'active' }];
  networkMemberRows = [];
  idSeq = 0;
  clerkListShouldFail = false;
}

// ── Prisma mock ─────────────────────────────────────────────────────
const mockPrisma = {
  user: {
    findMany: async ({ where }) => {
      const ids = where && where.id && where.id.in;
      if (!ids) return localUserRows;
      return localUserRows.filter((u) => ids.includes(u.id));
    },
  },
  network: {
    findUnique: async ({ where }) => networkRows.find((n) => n.id === where.id) || null,
  },
  location: {
    findUnique: async ({ where }) => locationRows.find((l) => l.id === where.id) || null,
  },
  networkMember: {
    findFirst: async ({ where }) => networkMemberRows.find((m) =>
      m.userId === where.userId && m.networkId === where.networkId && (m.locationId ?? null) === (where.locationId ?? null)
    ) || null,
    findMany: async ({ where }) => {
      let rows = networkMemberRows;
      if (where && where.networkId) rows = rows.filter((r) => r.networkId === where.networkId);
      if (where && where.locationId) rows = rows.filter((r) => r.locationId === where.locationId);
      return rows;
    },
    create: async ({ data }) => {
      const row = { id: nextId('nm'), createdAt: new Date(), updatedAt: new Date(), ...data };
      networkMemberRows.push(row);
      return row;
    },
  },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// ── Clerk mock ──────────────────────────────────────────────────────
require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => ({ sub: 'user_admin' }),
    createClerkClient: () => ({
      users: {
        getUser: async (id) => {
          const found = clerkUserRows.find((u) => u.id === id);
          if (found) return found;
          const err = new Error('User not found');
          err.status = 404;
          throw err;
        },
        getUserList: async ({ query, limit } = {}) => {
          if (clerkListShouldFail) throw new Error('simulated Clerk outage');
          let rows = clerkUserRows;
          if (query) rows = rows.filter((u) => (u.emailAddresses[0]?.emailAddress || '').includes(query));
          return { data: rows.slice(0, limit || 100) };
        },
      },
    }),
  },
};

const adminRoutes = require('../src/routes/adminRoutes');
const { handleGetManagerCandidates } = adminRoutes;
const networkAdmin = require('../src/services/networkAdminService');

function fakeReq({ query = {} } = {}) { return { query, headers: { authorization: 'Bearer test-token' } }; }
function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const results = [];
async function test(name, fn) {
  resetFixtures();
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, error: e.stack || e.message }); }
}

(async () => {

// ── GET /admin/manager-candidates ───────────────────────────────────
await test('1. Returns Clerk users even when the local User table is completely empty', async () => {
  assert.equal(localUserRows.length, 0);
  const req = fakeReq();
  const res = fakeRes();
  await handleGetManagerCandidates(req, res);
  assert.equal(res.statusCode, 200);
  const emails = res.body.users.map((u) => u.email);
  assert.ok(emails.includes('christopher_russell@web.de'), 'Christopher must be listed with no local User row');
  assert.ok(emails.includes('admin@example.com'));
});

await test('2. Each returned user has {id, email} -- id is the real Clerk id', async () => {
  const res = fakeRes();
  await handleGetManagerCandidates(fakeReq(), res);
  const christopher = res.body.users.find((u) => u.email === 'christopher_russell@web.de');
  assert.equal(christopher.id, 'user_christopher');
});

await test('3. A Clerk user with no email address is excluded, never shown as a blank/unusable option', async () => {
  const res = fakeRes();
  await handleGetManagerCandidates(fakeReq(), res);
  assert.ok(!res.body.users.some((u) => u.id === 'user_no_email'));
});

await test('4. ?q= filters the Clerk lookup itself (not a client-side filter)', async () => {
  const res = fakeRes();
  await handleGetManagerCandidates(fakeReq({ query: { q: 'christopher' } }), res);
  assert.equal(res.body.users.length, 1);
  assert.equal(res.body.users[0].email, 'christopher_russell@web.de');
});

await test('5. A failed Clerk lookup returns a real 502 admin API error -- never a silently-empty list, never a fabricated user', async () => {
  clerkListShouldFail = true;
  const res = fakeRes();
  await handleGetManagerCandidates(fakeReq(), res);
  assert.equal(res.statusCode, 502);
  assert.ok(res.body.error);
});

// ── networkAdminService.resolveUsers() Clerk fallback ───────────────
await test('6. resolveUsers() falls back to Clerk for a userId with no local User row (the exact Ulm-manager scenario)', async () => {
  const resolved = await networkAdmin.resolveUsers(['user_christopher']);
  assert.equal(resolved.get('user_christopher').email, 'christopher_russell@web.de');
});

await test('7. resolveUsers() prefers the local User row when one exists (never overwrites real local data with a Clerk-only stub)', async () => {
  localUserRows = [{ id: 'user_christopher', email: 'local-cached@example.com', plan: 'pro' }];
  const resolved = await networkAdmin.resolveUsers(['user_christopher']);
  assert.equal(resolved.get('user_christopher').email, 'local-cached@example.com');
  assert.equal(resolved.get('user_christopher').plan, 'pro');
});

await test('8. A userId that resolves in neither the local table nor Clerk is simply absent from the map (caller\'s existing raw-id fallback, never fabricated)', async () => {
  const resolved = await networkAdmin.resolveUsers(['user_totally_unknown']);
  assert.equal(resolved.has('user_totally_unknown'), false);
});

await test('9. Manager list rendering (listManagers) resolves the Ulm-style Clerk-only manager to a real email end-to-end', async () => {
  networkMemberRows = [{ id: 'nm1', userId: 'user_christopher', networkId: 'net_sp', locationId: 'loc_ulm', role: 'location_manager', createdAt: new Date() }];
  const managers = await networkAdmin.listManagers({});
  assert.equal(managers[0].user.email, 'christopher_russell@web.de');
});

// ── Regression: existing duplicate-assignment guard is untouched ────
await test('10. assignManager() still rejects a duplicate (userId, networkId, locationId) assignment', async () => {
  await networkAdmin.assignManager({ userId: 'user_christopher', networkId: 'net_sp', locationId: 'loc_ulm', role: 'location_manager' });
  await assert.rejects(
    () => networkAdmin.assignManager({ userId: 'user_christopher', networkId: 'net_sp', locationId: 'loc_ulm', role: 'location_manager' }),
    (err) => err.code === 'DUPLICATE'
  );
});

await test('11. assignManager() still stores the raw Clerk userId (not an email) -- unaffected by this fix', async () => {
  const manager = await networkAdmin.assignManager({ userId: 'user_christopher', networkId: 'net_sp', locationId: 'loc_ulm', role: 'location_manager' });
  assert.equal(manager.userId, 'user_christopher');
});

const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok);
results.forEach((r) => console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.ok ? '' : '\n      ' + r.error)));
console.log(`\n${pass} passed, ${fail.length} failed (${results.length} total)`);
process.exit(fail.length ? 1 : 0);

})();
