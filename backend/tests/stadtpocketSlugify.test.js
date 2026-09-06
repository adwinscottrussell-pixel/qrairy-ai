// ============================================================
// stadtpocketSlugify.test.js — focused unit tests for
// stadtpocketManagerService.slugify()'s German transliteration behavior.
//
// slugify() is a pure function (no Prisma/Clerk/network dependency), so
// unlike stadtpocketManagerWrite.test.js this file requires the real
// service module directly with no mocking -- it exercises exactly the
// same slugify() that generateUniqueSlug()/initializeDraft() call, not a
// reimplementation of the rules.
//
// Same no-framework convention as the other tests/*.test.js files: Node's
// built-in `assert` plus a tiny inline runner.
//
// Run: node tests/stadtpocketSlugify.test.js
// ============================================================
const assert = require('assert/strict');
const { slugify } = require('../src/services/stadtpocketManagerService');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Required examples (Phase 6D canonical-slug fix) ──────────────
test('Bäckerei Staib -> baeckerei-staib', () => {
  assert.equal(slugify('Bäckerei Staib'), 'baeckerei-staib');
});

test('Müller Café -> mueller-cafe', () => {
  assert.equal(slugify('Müller Café'), 'mueller-cafe');
});

test('Schröder -> schroeder', () => {
  assert.equal(slugify('Schröder'), 'schroeder');
});

test('Straße -> strasse', () => {
  assert.equal(slugify('Straße'), 'strasse');
});

// ── Regression guard: ordinary ASCII names are unaffected ────────
test('ordinary ASCII name is unchanged in behavior', () => {
  assert.equal(slugify('Cafe Central'), 'cafe-central');
});

// ── Additional coverage for the individual German rules ──────────
test('capital Ä/Ö/Ü transliterate the same as lowercase', () => {
  assert.equal(slugify('Ärztehaus'), 'aerztehaus');
  assert.equal(slugify('Österreich Deli'), 'oesterreich-deli');
  assert.equal(slugify('Übergangshaus'), 'uebergangshaus');
});

test('multiple umlauts in one name all transliterate', () => {
  assert.equal(slugify('Grüne Öko-Bäckerei'), 'gruene-oeko-baeckerei');
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
