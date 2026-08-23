// ============================================================
// userEmailSync.test.js — mocked-Prisma/Clerk tests for the User.email
// sync-from-Clerk fix: clerkEmailSync.js, qrController.js's upsertUser(),
// and the offline backfill script.
//
// No test framework dependency: uses Node's built-in `assert` and a tiny
// inline runner, following the same pattern as
// tests/locationManagerAuth.test.js. Prisma and @clerk/backend are mocked
// by pre-seeding require.cache before the modules under test are required,
// so no real DB or network call is ever made.
//
// Run: node tests/userEmailSync.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const clerkBackendPath = require.resolve('@clerk/backend');

// ── Fixture data (mutable, reset per test) ──────────────────────
let userRows = [];
let clerkUsers = {}; // clerkUserId -> Clerk user shape, or absent = "not found"

const mockPrisma = {
  user: {
    findUnique: async ({ where, select }) => {
      const row = userRows.find((u) => u.id === where.id);
      if (!row) return null;
      if (select) {
        const out = {};
        for (const k of Object.keys(select)) out[k] = row[k];
        return out;
      }
      return { ...row };
    },
    findMany: async ({ where }) => {
      if (where && where.OR) {
        return userRows
          .filter((u) => where.OR.some((cond) => u[Object.keys(cond)[0]] === Object.values(cond)[0]))
          .map((u) => ({ id: u.id }));
      }
      return userRows.map((u) => ({ ...u }));
    },
    upsert: async ({ where, update, create }) => {
      const idx = userRows.findIndex((u) => u.id === where.id);
      if (idx === -1) {
        const row = { id: where.id, email: null, plan: 'free', phone: null, stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: null, ...create };
        userRows.push(row);
        return { ...row, qrs: [] };
      }
      userRows[idx] = { ...userRows[idx], ...update };
      return { ...userRows[idx], qrs: [] };
    },
    update: async ({ where, data }) => {
      const idx = userRows.findIndex((u) => u.id === where.id);
      if (idx === -1) throw new Error('User not found: ' + where.id);
      userRows[idx] = { ...userRows[idx], ...data };
      return { ...userRows[idx] };
    },
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

require.cache[clerkBackendPath] = {
  id: clerkBackendPath, filename: clerkBackendPath, loaded: true,
  exports: {
    verifyToken: async () => { throw new Error('not used by these tests'); },
    createClerkClient: () => ({
      users: {
        getUser: async (id) => {
          const u = clerkUsers[id];
          if (!u) { const err = new Error('Clerk user not found: ' + id); throw err; }
          return u;
        },
      },
    }),
  },
};

function clerkUserFixture({ id, primaryEmailAddressId, emailAddresses }) {
  return { id, primaryEmailAddressId, emailAddresses };
}

const { resolvePrimaryEmail, fetchPrimaryEmail } = require('../src/utils/clerkEmailSync');
const { upsertUser } = require('../src/controllers/qrController');
const { main: runBackfill } = require('../scripts/backfill-user-email-from-clerk');

function resetFixtures() {
  userRows = [];
  clerkUsers = {};
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── resolvePrimaryEmail (pure) ───────────────────────────────

test('resolvePrimaryEmail: picks the address matching primaryEmailAddressId, not just [0]', () => {
  const u = clerkUserFixture({
    id: 'user_1',
    primaryEmailAddressId: 'ea_2',
    emailAddresses: [
      { id: 'ea_1', emailAddress: 'secondary@example.com' },
      { id: 'ea_2', emailAddress: 'primary@example.com' },
    ],
  });
  assert.equal(resolvePrimaryEmail(u), 'primary@example.com');
});

test('resolvePrimaryEmail: no email addresses -> null', () => {
  const u = clerkUserFixture({ id: 'user_2', primaryEmailAddressId: null, emailAddresses: [] });
  assert.equal(resolvePrimaryEmail(u), null);
});

test('resolvePrimaryEmail: primaryEmailAddressId matches nothing in the array -> null (never guesses)', () => {
  const u = clerkUserFixture({
    id: 'user_3',
    primaryEmailAddressId: 'ea_missing',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'nonprimary@example.com' }],
  });
  assert.equal(resolvePrimaryEmail(u), null);
});

test('resolvePrimaryEmail: null clerkUser -> null', () => {
  assert.equal(resolvePrimaryEmail(null), null);
});

// ── fetchPrimaryEmail (Clerk API, mocked) ────────────────────

test('fetchPrimaryEmail: resolves a real user', async () => {
  resetFixtures();
  clerkUsers['user_ok'] = clerkUserFixture({
    id: 'user_ok', primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'ok@example.com' }],
  });
  assert.equal(await fetchPrimaryEmail('user_ok'), 'ok@example.com');
});

test('fetchPrimaryEmail: Clerk lookup failure (user not found) -> null, never throws', async () => {
  resetFixtures();
  const email = await fetchPrimaryEmail('user_does_not_exist_in_clerk');
  assert.equal(email, null);
});

// ── upsertUser (qrController.js) -- future users get synced ──

test('upsertUser: brand-new user with a resolvable Clerk email -> User.email populated on create', async () => {
  resetFixtures();
  clerkUsers['user_new'] = clerkUserFixture({
    id: 'user_new', primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'new@example.com' }],
  });
  const user = await upsertUser('user_new');
  assert.equal(user.email, 'new@example.com');
  assert.equal(userRows.find((u) => u.id === 'user_new').email, 'new@example.com');
});

test('upsertUser: existing User with null email + resolvable Clerk email -> backfilled in place', async () => {
  resetFixtures();
  userRows.push({ id: 'user_old', email: null, plan: 'pro', phone: '+491234', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' });
  clerkUsers['user_old'] = clerkUserFixture({
    id: 'user_old', primaryEmailAddressId: 'ea_1',
    emailAddresses: [{ id: 'ea_1', emailAddress: 'old@example.com' }],
  });
  const user = await upsertUser('user_old');
  assert.equal(user.email, 'old@example.com');
  // Unrelated fields untouched.
  const row = userRows.find((u) => u.id === 'user_old');
  assert.equal(row.plan, 'pro');
  assert.equal(row.phone, '+491234');
  assert.equal(row.stripeCustomerId, 'cus_1');
  assert.equal(row.stripeSubscriptionId, 'sub_1');
  assert.equal(row.subscriptionStatus, 'active');
});

test('upsertUser: existing User already has an email -> never overwritten, Clerk never called', async () => {
  resetFixtures();
  userRows.push({ id: 'user_has_email', email: 'existing@example.com', plan: 'free' });
  // Deliberately no clerkUsers['user_has_email'] fixture -- if upsertUser
  // called Clerk for this user, fetchPrimaryEmail would throw internally
  // (caught, returns null) rather than the test itself failing loudly, so
  // this also double-checks the email stays exactly as it was.
  const user = await upsertUser('user_has_email');
  assert.equal(user.email, 'existing@example.com');
});

test('upsertUser: Clerk user has no primary email set -> User.email stays null, no crash', async () => {
  resetFixtures();
  clerkUsers['user_no_email'] = clerkUserFixture({ id: 'user_no_email', primaryEmailAddressId: null, emailAddresses: [] });
  const user = await upsertUser('user_no_email');
  assert.equal(user.email, null);
});

test('upsertUser: user unknown to Clerk entirely -> User row still created, email stays null', async () => {
  resetFixtures();
  const user = await upsertUser('user_unknown_to_clerk');
  assert.equal(user.email, null);
  assert.ok(userRows.some((u) => u.id === 'user_unknown_to_clerk'));
});

// ── Backfill script -- existing users ────────────────────────

test('backfill: dry run makes zero writes, reports wouldUpdate', async () => {
  resetFixtures();
  userRows.push({ id: 'user_a', email: null }, { id: 'user_b', email: '' });
  clerkUsers['user_a'] = clerkUserFixture({ id: 'user_a', primaryEmailAddressId: 'ea_a', emailAddresses: [{ id: 'ea_a', emailAddress: 'a@example.com' }] });
  clerkUsers['user_b'] = clerkUserFixture({ id: 'user_b', primaryEmailAddressId: 'ea_b', emailAddresses: [{ id: 'ea_b', emailAddress: 'b@example.com' }] });

  const counts = await runBackfill();
  assert.equal(counts.usersMissingEmail, 2);
  assert.equal(counts.wouldUpdate, 2);
  assert.equal(counts.updated, 0);
  // Dry run -- rows unchanged.
  assert.equal(userRows.find((u) => u.id === 'user_a').email, null);
  assert.equal(userRows.find((u) => u.id === 'user_b').email, '');
});

test('backfill: --apply writes only rows with a resolvable Clerk email, skips the rest safely', async () => {
  resetFixtures();
  userRows.push(
    { id: 'user_a', email: null, plan: 'pro' },
    { id: 'user_c', email: null }, // no Clerk fixture at all -- lookup fails
    { id: 'user_d', email: null }, // Clerk user exists but has no email
  );
  clerkUsers['user_a'] = clerkUserFixture({ id: 'user_a', primaryEmailAddressId: 'ea_a', emailAddresses: [{ id: 'ea_a', emailAddress: 'a@example.com' }] });
  clerkUsers['user_d'] = clerkUserFixture({ id: 'user_d', primaryEmailAddressId: null, emailAddresses: [] });

  const counts = await runBackfill({ apply: true });
  assert.equal(counts.usersMissingEmail, 3);
  assert.equal(counts.updated, 1);
  assert.equal(counts.clerkLookupFailed + counts.noClerkEmailFound, 2);
  assert.equal(userRows.find((u) => u.id === 'user_a').email, 'a@example.com');
  assert.equal(userRows.find((u) => u.id === 'user_a').plan, 'pro'); // unrelated field untouched
  assert.equal(userRows.find((u) => u.id === 'user_c').email, null);
  assert.equal(userRows.find((u) => u.id === 'user_d').email, null);
});

test('backfill: never touches a User row that already has an email (not even read into scope)', async () => {
  resetFixtures();
  userRows.push({ id: 'user_has_email', email: 'keep-me@example.com' });
  // No Clerk fixture -- if this row were ever looked up, the lookup would
  // fail loudly rather than silently; proving it's never even selected.
  const counts = await runBackfill();
  assert.equal(counts.usersMissingEmail, 0);
  assert.equal(userRows.find((u) => u.id === 'user_has_email').email, 'keep-me@example.com');
});

test('backfill: idempotent -- second run after --apply finds nothing left to do', async () => {
  resetFixtures();
  userRows.push({ id: 'user_e', email: null });
  clerkUsers['user_e'] = clerkUserFixture({ id: 'user_e', primaryEmailAddressId: 'ea_e', emailAddresses: [{ id: 'ea_e', emailAddress: 'e@example.com' }] });

  const first = await runBackfill({ apply: true });
  assert.equal(first.updated, 1);
  const second = await runBackfill({ apply: true });
  assert.equal(second.usersMissingEmail, 0);
  assert.equal(second.updated, 0);
});

test('backfill: refuses to run against a non-local DATABASE_URL', async () => {
  resetFixtures();
  const originalExit = process.exit;
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://user:pass@prod-db.example.com:5432/proddb';
  let exitCode;
  process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
  try {
    await runBackfill();
    assert.fail('expected assertLocalDatabase to refuse and exit');
  } catch (e) {
    assert.equal(e.message, '__exit__');
    assert.equal(exitCode, 1);
  } finally {
    process.exit = originalExit;
    process.env.DATABASE_URL = originalUrl;
  }
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
