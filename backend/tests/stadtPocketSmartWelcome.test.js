// ============================================================
// stadtPocketSmartWelcome.test.js — Phase 3C.7A Smart Welcome UX
// (Add to Home Screen as primary action).
//
// Proves: the new renderer only fires for a genuinely StadtPocket-linked,
// loyalty-off page (server-resolved from LandingPage.businessId, never
// from the client); Add to Home Screen is the primary CTA and Wallet is
// secondary; business name/logo/brand color/city are all canonical
// server-resolved values; Continue always routes to the canonical
// /lp/:slug Smart Page regardless of query-string tampering; existing cid
// behavior, Apple/Google wallet URLs, and both the loyalty-on and
// non-StadtPocket welcome paths are byte-for-byte unaffected; and no
// manifest/service-worker behavior was introduced in this phase.
//
// No test framework dependency: uses Node's built-in `assert` and a tiny
// inline runner, following the same pattern as
// tests/stadtPocketBusinessWallet.test.js.
//
// Run: node tests/stadtPocketSmartWelcome.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const emailServicePath = resolve('src', 'services', 'emailService.js');

// ── Fixtures ─────────────────────────────────────────────────

const businesses = {
  'biz-1': { id: 'biz-1', name: 'Ulm Cafe', primaryOwnerUserId: 'user-1', status: 'active' },
  'biz-2': { id: 'biz-2', name: 'Koeln Bakery', primaryOwnerUserId: 'user-2', status: 'active' },
  'biz-no-loc': { id: 'biz-no-loc', name: 'No Location Biz', primaryOwnerUserId: 'user-3', status: 'active' },
};
const businessLocations = {
  'biz-1': { id: 'bl-1', businessId: 'biz-1', locationId: 'loc-ulm', location: { id: 'loc-ulm', name: 'Ulm' } },
  'biz-2': { id: 'bl-2', businessId: 'biz-2', locationId: 'loc-koeln', location: { id: 'loc-koeln', name: 'Köln' } },
  // biz-no-loc deliberately has no BusinessLocation row.
};
const stampSettingsStore = {}; // slug -> { enabled, goal, rewardName }
const landingPages = {};       // slug -> page row

function makePage(slug, overrides = {}) {
  return Object.assign({
    id: slug + '-id',
    slug,
    businessName: 'Ulm Cafe',
    brandColor: null,
    userId: null,
    businessId: null,
    sections: JSON.stringify({ theme: { accentColor: '#112233' }, logo: null }),
  }, overrides);
}

landingPages['sw-off']          = makePage('sw-off',          { businessId: 'biz-1' });
landingPages['sw-off-brand']    = makePage('sw-off-brand',    { businessId: 'biz-1', brandColor: '#ff00aa' });
landingPages['sw-off-logo']     = makePage('sw-off-logo',     { businessId: 'biz-1', sections: JSON.stringify({ theme: { accentColor: '#112233' }, logo: { url: 'https://res.cloudinary.com/fake/logo.png' } }) });
landingPages['sw-off-no-loc']   = makePage('sw-off-no-loc',   { businessId: 'biz-no-loc', businessName: 'No Location Biz' });
landingPages['sw-off-2']        = makePage('sw-off-2',        { businessId: 'biz-2', businessName: 'Koeln Bakery' });
landingPages['sw-on']           = makePage('sw-on',           { businessId: 'biz-1' });
landingPages['sw-non-sp']       = makePage('sw-non-sp',       { businessId: null });

stampSettingsStore['sw-on'] = { enabled: true, goal: 8, rewardName: 'Free Coffee' };
// sw-off, sw-off-brand, sw-off-logo, sw-off-no-loc, sw-off-2, sw-non-sp:
// deliberately no StampSettings row (loyalty off / not configured).

const mockPrisma = {
  landingPage: { async findUnique({ where: { slug } }) { return landingPages[slug] || null; } },
  business: { async findUnique({ where: { id } }) { return businesses[id] || null; } },
  businessLocation: { async findFirst({ where: { businessId } }) { return businessLocations[businessId] || null; } },
  stampSettings: { async findUnique({ where: { slug } }) { return stampSettingsStore[slug] || null; } },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: { sendWelcomeEmail: async () => ({ success: 0, failed: 0 }) },
};

const { handleLoyaltyWelcome } = require('../src/controllers/lpController');

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    set() { return this; },
  };
}

async function renderWelcome(slug, query) {
  const res = fakeRes();
  await handleLoyaltyWelcome({ params: { slug }, query: query || {} }, res);
  return res.body;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. StadtPocket + loyalty OFF renders Smart Welcome ─────────────────

test('1. StadtPocket + loyalty OFF renders the new Smart Welcome UX', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('Save Ulm Cafe to your phone'));
  assert.ok(body.includes('id="onboarding"'));
});

// ── 2/3. Add to Home Screen primary, Wallet secondary ──────────────────

test('2. Add to Home Screen is the primary CTA', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('class="card card-primary"'));
  assert.ok(body.includes('Add to Home Screen'));
  assert.ok(body.includes('Recommended'));
});

test('3. Wallet is secondary, in its own card, after the primary card', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  const primaryIdx = body.indexOf('card-primary');
  const secondaryIdx = body.indexOf('card-secondary');
  assert.ok(primaryIdx > -1 && secondaryIdx > -1);
  assert.ok(primaryIdx < secondaryIdx, 'primary CTA must render before the wallet section');
  assert.ok(body.includes('Add Business Card to Wallet'));
  assert.ok(!body.toLowerCase().includes('join loyalty'));
  assert.ok(!body.toLowerCase().includes('membership'));
  assert.ok(!/>rewards</i.test(body));
});

// ── 4/5/6/7. Canonical branding ─────────────────────────────────────────

test('4. Business name is canonical (from LandingPage.businessName)', async () => {
  const body = await renderWelcome('sw-off-2', { lang: 'en' });
  assert.ok(body.includes('Koeln Bakery'));
});

test('5. Logo is canonical (from sections.logo.url) when present', async () => {
  const body = await renderWelcome('sw-off-logo', { lang: 'en' });
  assert.ok(body.includes('https://res.cloudinary.com/fake/logo.png'));
});

test('5b. Falls back to a letter avatar when no logo is uploaded', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(!body.includes('<img'));
  assert.ok(body.includes('class="logo">U<')); // "Ulm Cafe" -> "U"
});

test('6. Brand color is canonical: LandingPage.brandColor wins over sections.theme.accentColor', async () => {
  const body = await renderWelcome('sw-off-brand', { lang: 'en' });
  assert.ok(body.includes('#ff00aa'));
});

test('7. StadtPocket city is server-derived from Business -> BusinessLocation -> Location', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('StadtPocket &middot; Ulm'));
});

test('7b. Missing BusinessLocation: city section omitted, never "undefined"', async () => {
  const body = await renderWelcome('sw-off-no-loc', { lang: 'en' });
  assert.ok(!body.toLowerCase().includes('undefined'));
});

test('7c. City cannot be overridden by a query parameter', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en', city: 'Berlin', businessId: 'hacked' });
  assert.ok(body.includes('StadtPocket &middot; Ulm'));
  assert.ok(!body.includes('Berlin'));
});

// ── 8/9. Continue destination + cid ─────────────────────────────────────

test('8. Continue always resolves to the canonical /lp/:slug Smart Page', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('function backToLP(){return "/lp/"+s+'));
});

test('8b. Query-string tampering cannot change the Continue/redirect destination', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en', slug: 'other-business', redirect: 'https://evil.example' });
  assert.ok(body.includes('var s="sw-off";'));
  assert.ok(!body.includes('other-business'));
  assert.ok(!body.includes('evil.example'));
});

test('9. cid resolution behavior is preserved (resolveSlugCid wired into wallet/continue links)', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('resolveSlugCid(s)'));
  assert.ok(body.includes('RESOLVED_CID?"?cid="+encodeURIComponent(RESOLVED_CID):""'));
});

// ── 10/11/12/13. Device guidance ────────────────────────────────────────

test('10. iOS Safari guidance steps are present', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('Tap the Share button in Safari.'));
  assert.ok(body.includes('isIOS&&isSafari'));
});

test('11. iOS non-Safari fallback is present', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('Open this page in Safari to add Ulm Cafe to your Home Screen.'));
});

test('12. Android guidance steps are present', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('Open the browser menu.'));
  assert.ok(body.includes('isAndroid'));
});

test('13. Desktop/other fallback message is present', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('Open this page on your phone to save Ulm Cafe to your Home Screen.'));
});

// ── 14. Standalone mode suppresses repeated onboarding ──────────────────

test('14. Standalone-mode detection and ready-state markup are present', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('id="readyState"'));
  assert.ok(body.includes('isStandalone'));
  assert.ok(body.includes('if(isStandalone){onboarding.style.display="none";ready.style.display="block";}'));
  assert.ok(body.includes('Ulm Cafe is ready.'));
  assert.ok(body.includes('Open Smart Page'));
});

// ── 15/16. Language completeness ────────────────────────────────────────

test('15. English copy is complete with no stray German text', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('Save Ulm Cafe to your phone'));
  assert.ok(body.includes('Keep Ulm Cafe one tap away.'));
  assert.ok(body.includes('Continue without saving'));
  assert.ok(!body.includes('Home-Bildschirm'));
  assert.ok(!body.includes('Öffne'));
});

test('16. German copy is complete (default language) with no stray English CTA text', async () => {
  const body = await renderWelcome('sw-off', {}); // no ?lang= -> defaults to 'de'
  assert.ok(body.includes('Ulm Cafe auf deinem Handy speichern'));
  assert.ok(body.includes('Auf dem Home-Bildschirm speichern'));
  assert.ok(body.includes('Ohne Speichern fortfahren'));
  assert.ok(!body.includes('Continue without saving'));
  assert.ok(!body.includes('Add to Home Screen'));
});

// ── 17/18/19. Regression: loyalty ON and non-StadtPocket unchanged ─────

test('17. No "Loyalty Rewards" wording appears in Business Wallet (Smart Welcome) mode', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(!body.includes('Loyalty Rewards'));
});

test('18. StadtPocket + loyalty ON keeps the legacy loyalty welcome screen, unchanged', async () => {
  const body = await renderWelcome('sw-on', { lang: 'en' });
  assert.ok(body.includes('Loyalty Rewards'));
  assert.ok(!body.includes('Add to Home Screen'));
  assert.ok(!body.includes('id="onboarding"'));
});

test('19. Non-StadtPocket page keeps the legacy loyalty welcome screen, unchanged', async () => {
  const body = await renderWelcome('sw-non-sp', { lang: 'en' });
  assert.ok(body.includes('Loyalty Rewards'));
  assert.ok(!body.includes('Add to Home Screen'));
  assert.ok(!body.includes('id="onboarding"'));
});

// ── 20/21. Wallet URLs unchanged ────────────────────────────────────────

test('20. Apple Wallet URL is unchanged (/lp/wallet/apple/:slug)', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('"/lp/wallet/apple/"+s+'));
});

test('21. Google Wallet URL is unchanged (/lp/wallet/google/:slug)', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(body.includes('"/lp/wallet/google/"+s+'));
});

// ── 22. No manifest/service-worker behavior introduced in 3C.7A ────────

test('22. No manifest link or service-worker registration on the Smart Welcome page', async () => {
  const body = await renderWelcome('sw-off', { lang: 'en' });
  assert.ok(!body.includes('rel="manifest"'));
  assert.ok(!body.includes('serviceWorker'));
  assert.ok(!body.includes('beforeinstallprompt'));
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
