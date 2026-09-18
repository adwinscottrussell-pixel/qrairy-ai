// ============================================================
// stadtpocketDuplicateService.test.js — Phase 1B (AI Business
// Onboarding). Mocked-Prisma tests for checkForDuplicateListing(),
// following the exact require.cache pre-seeding pattern established by
// tests/stadtpocketOfferRoutes.test.js -- no real DB call.
//
// Run: node tests/stadtpocketDuplicateService.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');

const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';

let rows = [];

function resetFixtures() {
  rows = [
    {
      id: 'll_staib', locationId: ULM, address: 'Platzgasse 2–4, 89073 Ulm', phone: '0731 8800911', website: 'https://www.baeckerei-staib.de/',
      publicationStatus: 'published',
      listing: { id: 'listing_staib', name: 'Bäckerei Staib', slug: 'baeckerei-staib' },
    },
    {
      id: 'll_brettle_draft', locationId: ULM, address: 'Hafengasse 1, 89073 Ulm', phone: null, website: 'https://www.brettle-ulm.de/',
      publicationStatus: 'draft',
      listing: { id: 'listing_brettle', name: 'Café Brettle', slug: 'cafe-brettle' },
    },
    {
      id: 'll_paused_shop', locationId: ULM, address: 'Irgendwo 9, 89073 Ulm', phone: '0731 111222', website: null,
      publicationStatus: 'paused',
      listing: { id: 'listing_paused', name: 'Pausiertes Geschäft', slug: 'pausiertes-geschaeft' },
    },
    {
      id: 'll_stuttgart_same_name', locationId: STUTTGART, address: 'Café Brettle Str. 1', phone: null, website: 'https://www.brettle-stuttgart.de/',
      publicationStatus: 'published',
      listing: { id: 'listing_stuttgart', name: 'Café Brettle', slug: 'cafe-brettle-stuttgart' },
    },
  ];
}

const mockPrisma = {
  stadtPocketListingLocation: {
    findMany: async ({ where }) => rows.filter((r) => r.locationId === where.locationId).map((r) => ({ ...r, listing: { ...r.listing } })),
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

const {
  checkForDuplicateListing,
  normalizeWebsite,
  normalizePhone,
  normalizeAddress,
  normalizeName,
  STATUS,
} = require('../src/services/stadtpocketDuplicateService');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── normalization helpers ────────────────────────────────────────
test('1. normalizeWebsite ignores protocol/www/trailing slash/case', () => {
  assert.equal(normalizeWebsite('https://www.Brettle-Ulm.de/'), normalizeWebsite('http://brettle-ulm.de'));
});
test('2. normalizePhone ignores formatting, keeps only digits', () => {
  assert.equal(normalizePhone('0731 37 860 880'), '073137860880');
  assert.equal(normalizePhone('(0731) 37-860-880'), '073137860880');
});
test('3. normalizeAddress collapses whitespace and case', () => {
  assert.equal(normalizeAddress('  Platzgasse   2–4,  89073   Ulm '), normalizeAddress('platzgasse 2–4, 89073 ulm'));
});
test('4. normalizeName reuses the German-transliterating slugify -- case/accent-insensitive', () => {
  assert.equal(normalizeName('Café Brettle'), normalizeName('CAFÉ BRETTLE'));
  assert.equal(normalizeName('Bäckerei Staib'), 'baeckerei-staib');
});

// ── checkForDuplicateListing ─────────────────────────────────────
test('5. a genuinely new business in the city -> NEW, no matches', async () => {
  resetFixtures();
  const result = await checkForDuplicateListing({ locationId: ULM, businessName: 'Ganz Neues Geschäft', websiteUrl: 'https://neu.example.com', phone: '0731 999999', address: 'Neue Straße 1' });
  assert.equal(result.status, STATUS.NEW);
  assert.deepEqual(result.matches, []);
});

test('6. exact website match against a PUBLISHED listing -> ALREADY_PUBLISHED', async () => {
  resetFixtures();
  const result = await checkForDuplicateListing({ locationId: ULM, businessName: 'Some Different Name', websiteUrl: 'https://www.baeckerei-staib.de/' });
  assert.equal(result.status, STATUS.ALREADY_PUBLISHED);
  assert.equal(result.matches[0].listingLocationId, 'll_staib');
  assert.ok(result.matches[0].matchedOn.includes('website'));
});

test('7. exact website match against a DRAFT listing -> ALREADY_DRAFT', async () => {
  resetFixtures();
  const result = await checkForDuplicateListing({ locationId: ULM, websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(result.status, STATUS.ALREADY_DRAFT);
  assert.equal(result.matches[0].listingLocationId, 'll_brettle_draft');
});

test('8. exact phone match against a PAUSED listing -> POSSIBLE_MATCH (not draft/published)', async () => {
  resetFixtures();
  const result = await checkForDuplicateListing({ locationId: ULM, phone: '0731 111222' });
  assert.equal(result.status, STATUS.POSSIBLE_MATCH);
  assert.equal(result.matches[0].listingLocationId, 'll_paused_shop');
});

test('9. name-only match (no phone/address/website match) -> POSSIBLE_MATCH, never a stronger status', async () => {
  resetFixtures();
  const result = await checkForDuplicateListing({ locationId: ULM, businessName: 'Café Brettle', websiteUrl: 'https://totally-different-domain.example.com' });
  assert.equal(result.status, STATUS.POSSIBLE_MATCH);
  assert.ok(result.matches.some((m) => m.matchedOn.includes('name') && !m.matchedOn.some((f) => f !== 'name')));
});

test('10. a same-named business in a DIFFERENT city is never considered a match', async () => {
  resetFixtures();
  const result = await checkForDuplicateListing({ locationId: ULM, businessName: 'Café Brettle', websiteUrl: 'https://www.brettle-stuttgart.de/' });
  // Stuttgart's row must never appear even though the name and (if it
  // matched) website look similar -- city scoping is enforced by the
  // findMany({ where: { locationId } }) query itself.
  assert.ok(!result.matches.some((m) => m.listingLocationId === 'll_stuttgart_same_name'));
});

test('11. a strong match (website) wins over a coincidental name match, never diluted to POSSIBLE_MATCH by it', async () => {
  resetFixtures();
  const result = await checkForDuplicateListing({ locationId: ULM, businessName: 'Café Brettle', websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal(result.status, STATUS.ALREADY_DRAFT);
});

test('12. no identifying data at all (empty request) -> NEW, never crashes', async () => {
  resetFixtures();
  const result = await checkForDuplicateListing({ locationId: ULM });
  assert.equal(result.status, STATUS.NEW);
});

test('13. this function never writes anything -- mockPrisma exposes no write method for it to call', async () => {
  resetFixtures();
  assert.equal(mockPrisma.stadtPocketListingLocation.create, undefined);
  assert.equal(mockPrisma.stadtPocketListingLocation.update, undefined);
  await checkForDuplicateListing({ locationId: ULM, businessName: 'Anything' });
  // If checkForDuplicateListing ever tried to write, the call above
  // would have thrown (mockPrisma has no create/update to call) --
  // reaching this line without throwing is the assertion.
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
