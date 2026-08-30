// ============================================================
// lpLogoRemovalPersistence.test.js — Bug fix: Wallet Pass Studio
// "Remove Logo" did not persist across a reload.
//
// Root cause: POST /lp's update path wrote the legacy LandingPage.
// logoUrl column with `...(logoUrl ? { logoUrl } : {})` — an empty
// string sent to explicitly CLEAR the logo is falsy, so this guard
// silently OMITTED the column from the Prisma update entirely,
// indistinguishable from "the caller didn't send a logo field at
// all". The stale value survived in the DB, and every read path in
// the app (sections.logo.url || page.logoUrl) fell through to it on
// the next load, resurrecting a logo the user had just removed.
//
// Fix: whenever the request includes a `sections` object (every real
// caller — smart-editor.js, wallet-pass-studio.html, smart-demo.html,
// onboarding.js — always sends one), the legacy `logoUrl` column is
// now derived directly from the merged sections.logo.url (falling
// back to the top-level logoUrl field, then null) — so it can never
// drift from, or resurrect a value the canonical sections field no
// longer has. When no `sections` object is sent at all, the original
// truthy-only behavior is preserved unchanged, for backward
// compatibility with any caller that only ever sets the top-level
// field.
//
// This test calls the REAL handlePublishLP directly (not a
// reimplementation) against a mock Prisma whose `upsert` reproduces
// real Prisma partial-update-merge semantics: any key omitted from
// `update` leaves the existing DB value untouched, exactly like the
// production behavior that let this bug hide. No test framework
// dependency: uses Node's built-in `assert` and a tiny inline runner,
// matching every other test in this directory.
//
// Run: node tests/lpLogoRemovalPersistence.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const pageCachePath = resolve('src', 'utils', 'pageCache.js');
const qrControllerPath = resolve('src', 'controllers', 'qrController.js');
const emailServicePath = resolve('src', 'services', 'emailService.js');
const customerIdentityServicePath = resolve('src', 'services', 'customerIdentityService.js');

// ── Fixtures ─────────────────────────────────────────────────

const landingPages = {}; // slug -> row

function makePage(overrides = {}) {
  return Object.assign({
    id: 'lp-id', slug: 'biz-slug', businessName: 'Rick Ross Marketing', userId: 'user-a',
    websiteUrl: null, useCase: 'restaurant', brandColor: '#ff5a1f', logoUrl: null,
    businessId: null, template: 'premium', sections: JSON.stringify({}), createdAt: new Date(), updatedAt: new Date(),
  }, overrides);
}

// Reproduces real Prisma upsert/update merge semantics: keys omitted from
// `update` leave the existing row untouched; keys present (even null/'')
// overwrite it. This is the exact mechanism the real bug hid behind.
const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug } }) { return landingPages[slug] || null; },
    async findFirst() { return null; },
    async count() { return 0; },
    async upsert(args) {
      const slug = args.where.slug;
      const isNew = !landingPages[slug];
      const data = isNew ? args.create : Object.assign({}, landingPages[slug], args.update);
      landingPages[slug] = Object.assign({ id: 'lp-' + slug }, data, { slug });
      return landingPages[slug];
    },
  },
  business: { async findUnique() { return null; } },
  businessLocation: { async findFirst() { return null; } },
  user: { async findUnique() { return null; } },
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
require.cache[qrControllerPath] = {
  id: qrControllerPath, filename: qrControllerPath, loaded: true,
  exports: {
    getUserFromToken: async (authHeader) => {
      if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
      const token = authHeader.slice('Bearer '.length);
      return token === 'invalid-token' ? null : token;
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

// Mirrors the exact canonical read rule used everywhere in the app
// (fetchPage() in wallet-pass-studio.html, lpController.js:337-338,
// 1872-1873, 2512-2513): sections.logo.url wins, page.logoUrl is only a
// fallback for pages that predate the sections.logo model.
function readLogo(row) {
  const sec = JSON.parse(row.sections);
  return (sec.logo && sec.logo.url) || row.logoUrl || '';
}

async function publish(body, token) {
  const res = fakeRes();
  await handlePublishLP(fakeReq(body, token ? 'Bearer ' + token : undefined), res);
  return res;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── A. Upload: no logo -> upload -> save -> reload ──────────────────────

test('A. Upload: no logo -> new logo persists through sections.logo.url and the legacy column', async () => {
  landingPages['sp-a'] = makePage({ slug: 'sp-a', logoUrl: null, sections: JSON.stringify({ hero: { badge: 'Family Bakery' }, theme: { accentColor: '#ff5a1f' } }) });
  const res = await publish({
    slug: 'sp-a', businessName: 'Rick Ross Marketing', brandColor: '#ff5a1f',
    logoUrl: 'https://res.cloudinary.com/logo-1.png',
    sections: { hero: { badge: 'Family Bakery' }, theme: { accentColor: '#ff5a1f' }, logo: { url: 'https://res.cloudinary.com/logo-1.png' } },
    template: 'premium',
  }, 'user-a');
  assert.equal(res.statusCode, 200);
  const row = landingPages['sp-a'];
  assert.equal(row.logoUrl, 'https://res.cloudinary.com/logo-1.png'); // legacy column kept in sync
  assert.equal(readLogo(row), 'https://res.cloudinary.com/logo-1.png'); // survives a simulated reload
});

// ── B. Replace: existing logo -> replace -> save -> reload ──────────────

test('B. Replace: existing logo -> new logo replaces the old one everywhere, no stale value survives', async () => {
  landingPages['sp-b'] = makePage({ slug: 'sp-b', logoUrl: 'https://res.cloudinary.com/logo-old.png', sections: JSON.stringify({ hero: { badge: 'Family Bakery' }, theme: { accentColor: '#ff5a1f' }, logo: { url: 'https://res.cloudinary.com/logo-old.png' } }) });
  const res = await publish({
    slug: 'sp-b', businessName: 'Rick Ross Marketing', brandColor: '#ff5a1f',
    logoUrl: 'https://res.cloudinary.com/logo-new.png',
    sections: { hero: { badge: 'Family Bakery' }, theme: { accentColor: '#ff5a1f' }, logo: { url: 'https://res.cloudinary.com/logo-new.png' } },
    template: 'premium',
  }, 'user-a');
  assert.equal(res.statusCode, 200);
  const row = landingPages['sp-b'];
  assert.equal(row.logoUrl, 'https://res.cloudinary.com/logo-new.png');
  assert.equal(readLogo(row), 'https://res.cloudinary.com/logo-new.png');
  assert.notEqual(readLogo(row), 'https://res.cloudinary.com/logo-old.png');
});

// ── C. Remove: existing logo -> remove -> save -> reload (THE BUG) ──────

test('C. Remove: existing logo in BOTH sections.logo.url and the legacy column -> removal clears both, does not resurrect on reload', async () => {
  // Deliberately seeds the worst case: the legacy column already holds the
  // same stale value sections.logo.url does, exactly the production state
  // this bug was found in.
  landingPages['sp-c'] = makePage({
    slug: 'sp-c',
    logoUrl: 'https://res.cloudinary.com/logo-old.png',
    sections: JSON.stringify({
      hero: { title: 'Welcome to Rick Ross Marketing', badge: 'Family Bakery' },
      theme: { accentColor: '#ff5a1f' },
      logo: { url: 'https://res.cloudinary.com/logo-old.png' },
      walletHero: { url: 'https://res.cloudinary.com/hero.png' },
    }),
  });
  const res = await publish({
    slug: 'sp-c', businessName: 'Rick Ross Marketing', brandColor: '#ff5a1f',
    logoUrl: '', // Wallet Studio's saveLogoUrl(slug, null) sends this on removal
    sections: { hero: { title: 'Welcome to Rick Ross Marketing', badge: 'Family Bakery' }, theme: { accentColor: '#ff5a1f' }, walletHero: { url: 'https://res.cloudinary.com/hero.png' } }, // no `logo` key at all
    template: 'premium',
  }, 'user-a');
  assert.equal(res.statusCode, 200);
  const row = landingPages['sp-c'];

  // The exact bug: this column must actually be cleared, not silently
  // left at its stale value.
  assert.equal(row.logoUrl, null, 'legacy logoUrl column must be cleared, not left stale');
  // The full canonical read rule must resolve to "no logo" — this is what
  // a real page reload would show.
  assert.equal(readLogo(row), '', 'logo must not resurrect from the legacy column fallback');

  // Preserved unrelated canonical fields — this fix must not touch them.
  const sec = JSON.parse(row.sections);
  assert.equal(sec.hero.badge, 'Family Bakery'); // sections.hero.badge untouched
  assert.equal(sec.hero.title, 'Welcome to Rick Ross Marketing');
  assert.equal(sec.walletHero.url, 'https://res.cloudinary.com/hero.png'); // hero image untouched
  assert.equal(row.brandColor, '#ff5a1f'); // card color untouched
  assert.equal(row.businessName, 'Rick Ross Marketing');
});

// ── D. Backward compatibility: no `sections` sent at all ────────────────

test('D. No `sections` object sent at all: legacy truthy-only column behavior is unchanged (backward compatible)', async () => {
  landingPages['sp-d'] = makePage({ slug: 'sp-d', logoUrl: 'https://res.cloudinary.com/logo-existing.png' });
  const res = await publish({
    slug: 'sp-d', businessName: 'Rick Ross Marketing', brandColor: '#ff5a1f',
    logoUrl: '', // falsy, and no sections object at all
  }, 'user-a');
  assert.equal(res.statusCode, 200);
  // Column is left untouched, exactly as before this fix, since no
  // sections payload was present to derive a trustworthy signal from.
  assert.equal(landingPages['sp-d'].logoUrl, 'https://res.cloudinary.com/logo-existing.png');
});

// ── E. Hero image removal: no legacy top-level column exists for it, ────
// ── so this bug class never applied to it — confirm it still works ──────

test('E. Hero image removal (sections.walletHero) persists correctly — no legacy fallback field exists for it, unaffected by this fix', async () => {
  landingPages['sp-e'] = makePage({
    slug: 'sp-e',
    logoUrl: 'https://res.cloudinary.com/logo.png',
    sections: JSON.stringify({
      hero: { badge: 'Family Bakery' },
      theme: { accentColor: '#ff5a1f' },
      logo: { url: 'https://res.cloudinary.com/logo.png' },
      walletHero: { url: 'https://res.cloudinary.com/hero-old.png' },
    }),
  });
  const res = await publish({
    slug: 'sp-e', businessName: 'Rick Ross Marketing', brandColor: '#ff5a1f',
    sections: { hero: { badge: 'Family Bakery' }, theme: { accentColor: '#ff5a1f' }, logo: { url: 'https://res.cloudinary.com/logo.png' } }, // no walletHero key
    template: 'premium',
  }, 'user-a');
  assert.equal(res.statusCode, 200);
  const sec = JSON.parse(landingPages['sp-e'].sections);
  assert.equal(sec.walletHero, undefined);
  // Logo (a sibling canonical field, unrelated to this save) is untouched.
  assert.equal(readLogo(landingPages['sp-e']), 'https://res.cloudinary.com/logo.png');
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
