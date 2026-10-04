// ============================================================
// lpPlanLimit.test.js — Phase 2E: canonical Smart QR Page limits on
// POST /lp (handlePublishLP).
//
// Smart QR Pages = LandingPage records owned by the user. The limit comes
// from config/plans.js via the effective plan (trial expiry, subscription
// status, annual = base, enterprise = Business; null = unlimited):
//   Free 0 · Trial 1 · Starter 10 · Pro/Business unlimited.
// A missing User row is Free (0). Editing an existing page never consumes
// a slot. The 402 plan_limit contract (error, message, limit, current,
// upgrade) is unchanged. Legacy AI QR records are never consulted.
//
// Prisma, qrController (getUserFromToken), emailService, pageCache and
// customerIdentityService are mocked via require.cache — no DB, Clerk,
// network or email. Same no-framework convention as the other tests.
//
// Run: node tests/lpPlanLimit.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const seed = (p, exports) => { require.cache[p] = { id: p, filename: p, loaded: true, exports }; };

const DAY = 24 * 60 * 60 * 1000;
let landingPages = {};   // slug -> row
let users = {};          // id -> row
let upserts = 0;

const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug } }) { return landingPages[slug] || null; },
    async findFirst() { return null; },
    async count({ where: { userId } }) { return Object.values(landingPages).filter((p) => p.userId === userId).length; },
    async upsert(args) {
      upserts++;
      const slug = args.where.slug;
      const data = landingPages[slug] ? Object.assign({}, landingPages[slug], args.update) : args.create;
      landingPages[slug] = Object.assign({ id: 'lp-' + slug }, data, { slug });
      return landingPages[slug];
    },
    async update({ where: { slug }, data }) { landingPages[slug] = Object.assign({}, landingPages[slug], data); return landingPages[slug]; },
  },
  // Legacy AI QR records are not Smart QR Pages — must never be counted here.
  qR: { async count() { throw new Error('legacy QR records must not be counted for Smart QR Pages'); } },
  business: { async findUnique() { return null; } },
  businessLocation: { async findFirst() { return null; } },
  user: { async findUnique({ where: { id } }) { return users[id] || null; } },
  async $transaction(fn) { return fn(mockPrisma); },
};

seed(resolve('src', 'utils', 'prismaClient.js'), mockPrisma);
seed(resolve('src', 'utils', 'pageCache.js'), { pageCache: { delByPrefix() {} } });
seed(resolve('src', 'services', 'emailService.js'), { sendWelcomeEmail: async () => ({ success: 0, failed: 0 }) });
seed(resolve('src', 'services', 'customerIdentityService.js'), { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} });
seed(resolve('src', 'controllers', 'qrController.js'), {
  getUserFromToken: async (h) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
});

const { handlePublishLP } = require('../src/controllers/lpController');

function fakeRes() {
  return { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
function ownPages(userId, n) {
  for (let i = 0; i < n; i++) landingPages[userId + '-p' + i] = { slug: userId + '-p' + i, businessName: 'P' + i, userId, status: i % 2 ? 'draft' : 'live', sections: '{}' };
}
async function publish(userId, slug = 'brand-new-slug') {
  const res = fakeRes();
  await handlePublishLP({ body: { slug, businessName: 'New Biz' }, headers: userId ? { authorization: 'Bearer ' + userId } : {} }, res);
  return res;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn: async () => { landingPages = {}; users = {}; upserts = 0; await fn(); } }); }

const ACTIVE = (plan) => ({ plan, subscriptionStatus: 'active' });
const FUTURE = () => new Date(Date.now() + 5 * DAY);
const PAST = () => new Date(Date.now() - DAY);

// [label, user row (null = missing account), limit (null = unlimited)]
const MATRIX = [
  ['free', { plan: 'free' }, 0],
  ['missing account row', null, 0],
  ['active trial', { plan: 'trial', trialExpiresAt: FUTURE() }, 1],
  ['expired trial', { plan: 'trial', trialExpiresAt: PAST() }, 0],
  ['starter', ACTIVE('starter'), 10],
  ['starter_annual', ACTIVE('starter_annual'), 10],
  ['pro', ACTIVE('pro'), null],
  ['pro_annual', ACTIVE('pro_annual'), null],
  ['business', ACTIVE('business'), null],
  ['business_annual', ACTIVE('business_annual'), null],
  ['enterprise (internal Business)', { plan: 'enterprise', subscriptionStatus: null }, null],
  ['unknown plan', { plan: 'gold_lifetime' }, 0],
  ['starter past_due (keeps paid)', { plan: 'starter', subscriptionStatus: 'past_due' }, 10],
  ['pro null status (legacy paid)', { plan: 'pro', subscriptionStatus: null }, null],
  ...['canceled', 'cancelled', 'unpaid', 'incomplete_expired'].map((s) => ['business ' + s, { plan: 'business', subscriptionStatus: s }, 0]),
];

for (const [label, user, limit] of MATRIX) {
  if (limit === null) {
    test(`${label}: unlimited — creates at 0 and 50 existing pages`, async () => {
      for (const n of [0, 50]) {
        landingPages = {}; if (user) users.u = { id: 'u', ...user };
        ownPages('u', n);
        const res = await publish('u');
        assert.equal(res.statusCode, 200, `${label} @${n}: ${JSON.stringify(res.body)}`);
        assert.equal(landingPages['brand-new-slug'].userId, 'u');
      }
    });
  } else if (limit === 0) {
    test(`${label}: 0 Smart QR Pages — 402 with the Free wording`, async () => {
      if (user) users.u = { id: 'u', ...user };
      const res = await publish('u');
      assert.equal(res.statusCode, 402);
      assert.deepEqual(Object.keys(res.body), ['error', 'message', 'limit', 'current', 'upgrade']);
      assert.deepEqual(res.body, { error: 'plan_limit', message: 'Your Free plan does not include Smart QR Pages. Upgrade to create one.', limit: 0, current: 0, upgrade: true });
      assert.equal(upserts, 0);
    });
  } else {
    test(`${label}: limit ${limit} — ${limit - 1} pages allowed, ${limit} pages → 402`, async () => {
      users.u = { id: 'u', ...user };
      ownPages('u', limit - 1);
      const ok = await publish('u', 'slot-' + limit);
      assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
      const blocked = await publish('u', 'one-too-many');
      assert.equal(blocked.statusCode, 402);
      assert.deepEqual(Object.keys(blocked.body), ['error', 'message', 'limit', 'current', 'upgrade']);
      assert.equal(blocked.body.error, 'plan_limit');
      assert.equal(blocked.body.limit, limit);
      assert.equal(blocked.body.current, limit);
      assert.equal(blocked.body.upgrade, true);
      assert.equal(landingPages['one-too-many'], undefined);
    });
  }
}

test('Starter: 9 owned pages (drafts included) → allowed; 10 → 402 with plan-named message', async () => {
  users.u = { id: 'u', ...ACTIVE('starter') };
  ownPages('u', 9);
  assert.equal((await publish('u', 'tenth')).statusCode, 200);
  const res = await publish('u', 'eleventh');
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.message, 'Your Starter plan allows 10 Smart QR pages. Upgrade to create more.');
});

test('active trial with 1 page (preview account shape): second page → 402, Trial wording', async () => {
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: FUTURE() };
  landingPages['netflix-j6q'] = { slug: 'netflix-j6q', businessName: 'Netflix', userId: 'u', status: 'live', sections: '{}' };
  const res = await publish('u', 'second-page');
  assert.equal(res.statusCode, 402);
  assert.deepEqual(res.body, { error: 'plan_limit', message: 'Your Trial plan allows 1 Smart QR page. Upgrade to create more.', limit: 1, current: 1, upgrade: true });
});

test('editing an existing owned page never consumes a slot (Free with pages, at/over limit)', async () => {
  users.u = { id: 'u', plan: 'free' };
  landingPages.mine = { slug: 'mine', businessName: 'Mine', userId: 'u', status: 'live', sections: '{}' };
  ownPages('u', 3);
  const res = fakeRes();
  await handlePublishLP({ body: { slug: 'mine', businessName: 'Mine Renamed' }, headers: { authorization: 'Bearer u' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(landingPages.mine.businessName, 'Mine Renamed');
});

test('only the user\'s own LandingPages count (other users\' pages ignored)', async () => {
  users.u = { id: 'u', plan: 'trial', trialExpiresAt: FUTURE() };
  ownPages('someone-else', 5);
  assert.equal((await publish('u')).statusCode, 200);
});

test('anonymous POST /lp (no token) is unchanged: no plan check, ownerless create', async () => {
  const res = await publish(null, 'anon-demo');
  assert.equal(res.statusCode, 200);
  assert.equal(landingPages['anon-demo'].userId, null);
});

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${err.message}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
