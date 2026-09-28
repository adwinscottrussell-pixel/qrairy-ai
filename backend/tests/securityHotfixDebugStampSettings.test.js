// ============================================================
// securityHotfixDebugStampSettings.test.js — security hotfix regression
// tests.
//
//  1. The TEMP /debug/pass and /debug/passes-for routes are gone from
//     index.js (they exposed legacy wallet Pass serials behind a key with
//     a hard-coded fallback committed to a public repo) and no DEBUG_KEY
//     fallback/default remains anywhere in backend/src.
//  2. POST /lp/stamp/settings/:slug (legacy loyalty-settings writer) now
//     requires an authenticated caller (requireAuth) who OWNS the landing
//     page. Anonymous callers, other users, unknown slugs and platform-
//     managed pages (userId null, e.g. StadtPocket programs) are refused
//     without any database write. The owner's existing workflow
//     (smart-qr-detail.html, which already sends its Clerk token) keeps
//     working with unchanged field semantics.
//
// Mocked-Prisma, no framework, same convention as the other backend
// tests. The mock records every call so "no unexpected mutation" is
// asserted against the full call log.
//
// Run: node tests/securityHotfixDebugStampSettings.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const prismaClientPath = require.resolve(path.join(srcDir, 'utils', 'prismaClient.js'));

let calls = [];
const pages = {
  'owner-shop': { userId: 'user_owner' },
  'other-shop': { userId: 'user_someone_else' },
  'platform-shop': { userId: null }, // e.g. a StadtPocket platform-managed program
};

const mockPrisma = new Proxy({}, {
  get(_, model) {
    if (typeof model !== 'string') return undefined;
    return new Proxy({}, {
      get(__, method) {
        return async (args) => {
          calls.push({ model, method, args });
          if (model === 'landingPage' && method === 'findUnique') {
            const p = pages[args.where.slug];
            return p ? { ...p } : null;
          }
          if (model === 'stampSettings' && method === 'upsert') {
            return { slug: args.where.slug, ...args.update };
          }
          return null;
        };
      },
    });
  },
});
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const { handleStampSettings } = require(path.join(srcDir, 'controllers', 'lpController.js'));
const lpRoutes = require(path.join(srcDir, 'routes', 'lpRoutes.js'));
const { requireAuth } = require(path.join(srcDir, 'middleware', 'auth.js'));

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
  };
}

async function callSettings({ slug, userId, body = { goal: 8, rewardName: 'Free Coffee', enabled: true } }) {
  const res = fakeRes();
  await handleStampSettings({ params: { slug }, body, userId }, res);
  return res;
}

const writes = () => calls.filter((c) => /^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(c.method));

const tests = [];
function test(name, fn) { tests.push({ name, fn: async () => { calls = []; await fn(); } }); }

// ── 1. debug routes removed, no fallback key ──────────────────

test('/debug routes are no longer registered in index.js', () => {
  const index = fs.readFileSync(path.join(srcDir, 'index.js'), 'utf8');
  assert.doesNotMatch(index, /app\.(get|post|use|all)\(\s*['"`]\/debug/);
  assert.doesNotMatch(index, /\/debug\/pass/);
});

test('no DEBUG_KEY usage or hard-coded fallback key remains anywhere in backend/src', () => {
  const offenders = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        const s = fs.readFileSync(p, 'utf8');
        if (/DEBUG_KEY/.test(s) || /req\.query\.key\s*!==/.test(s)) offenders.push(path.relative(srcDir, p));
      }
    }
  })(srcDir);
  assert.deepEqual(offenders, []);
});

// ── 2. legacy StampSettings writer ────────────────────────────

test('POST /lp/stamp/settings/:slug runs requireAuth before the handler', () => {
  const layer = lpRoutes.stack.find((l) => l.route && l.route.path === '/lp/stamp/settings/:slug' && l.route.methods.post);
  assert.ok(layer, 'route registered');
  const handlers = layer.route.stack.map((s) => s.handle);
  assert.equal(handlers[0], requireAuth, 'requireAuth is the first handler');
  assert.equal(handlers[handlers.length - 1], handleStampSettings);
});

test('anonymous request (no Authorization header) is rejected by requireAuth with 401 before the handler', async () => {
  const res = fakeRes();
  let reachedHandler = false;
  await requireAuth({ headers: {} }, res, () => { reachedHandler = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(reachedHandler, false);
  assert.deepEqual(calls, []);
});

test('handler itself refuses a request without an authenticated user (defence in depth): 401, no DB access', async () => {
  const res = await callSettings({ slug: 'owner-shop', userId: undefined });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(calls, []);
});

test('another user cannot modify a page they do not own: 403, no write', async () => {
  const res = await callSettings({ slug: 'owner-shop', userId: 'user_attacker' });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(writes(), []);
});

test('unknown slug is refused (404) instead of creating settings for it', async () => {
  const res = await callSettings({ slug: 'no-such-page', userId: 'user_owner' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(writes(), []);
});

test('platform-managed page (userId null, e.g. StadtPocket) can never be written through this route', async () => {
  for (const userId of ['user_owner', 'user_someone_else']) {
    const res = await callSettings({ slug: 'platform-shop', userId });
    assert.equal(res.statusCode, 403);
  }
  assert.deepEqual(writes(), []);
});

test('the owner\'s legitimate workflow still works with unchanged field semantics', async () => {
  const res = await callSettings({ slug: 'owner-shop', userId: 'user_owner', body: { goal: 8, rewardName: 'Free Coffee', enabled: true } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  const upserts = calls.filter((c) => c.model === 'stampSettings' && c.method === 'upsert');
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].args.where, { slug: 'owner-shop' });
  assert.deepEqual(upserts[0].args.update, { goal: 8, rewardName: 'Free Coffee', enabled: true });

  // pre-existing defaults unchanged (goal || 10, rewardName || 'Free item', enabled !== false)
  calls = [];
  await callSettings({ slug: 'owner-shop', userId: 'user_owner', body: {} });
  const u2 = calls.find((c) => c.method === 'upsert');
  assert.deepEqual(u2.args.update, { goal: 10, rewardName: 'Free item', enabled: true });
});

test('no customer or stamp data is touched by the settings route in any case', async () => {
  await callSettings({ slug: 'owner-shop', userId: 'user_owner' });
  await callSettings({ slug: 'owner-shop', userId: 'user_attacker' });
  await callSettings({ slug: 'platform-shop', userId: 'user_owner' });
  await callSettings({ slug: 'no-such-page', userId: 'user_owner' });
  const models = new Set(calls.map((c) => c.model));
  for (const m of ['loyaltyCustomer', 'stampEntry', 'pass', 'customer', 'customerIdentity']) {
    assert.equal(models.has(m), false, `${m} must never be touched`);
  }
  assert.deepEqual([...new Set(writes().map((c) => `${c.model}.${c.method}`))], ['stampSettings.upsert']);
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
