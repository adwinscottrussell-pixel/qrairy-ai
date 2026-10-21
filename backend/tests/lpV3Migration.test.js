// ============================================================
// lpV3Migration.test.js — the Studio V3 database migration only ADDS:
// LandingPage.renderer (NOT NULL DEFAULT 'legacy': every existing page keeps
// the legacy renderer), the PageDesign and PageDesignVersion tables, their
// unique indexes and foreign keys. Nothing is dropped, renamed, retyped,
// updated or deleted, and no earlier migration is touched.
// Run: node tests/lpV3Migration.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS = path.join(__dirname, '..', 'prisma', 'migrations');
const NAME = '20261021090000_add_page_design_v3';
const SQL = fs.readFileSync(path.join(MIGRATIONS, NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const statements = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

test('only additive statements', () => {
  const allowed = [
    /^ALTER TABLE "LandingPage" ADD COLUMN "renderer" TEXT NOT NULL DEFAULT 'legacy'$/,
    /^CREATE TABLE "PageDesign" \(/,
    /^CREATE TABLE "PageDesignVersion" \(/,
    /^CREATE UNIQUE INDEX "PageDesign_landingPageId_key" ON "PageDesign"\("landingPageId"\)$/,
    /^CREATE UNIQUE INDEX "PageDesignVersion_designId_version_key" ON "PageDesignVersion"\("designId", "version"\)$/,
    /^ALTER TABLE "PageDesign" ADD CONSTRAINT "PageDesign_landingPageId_fkey" FOREIGN KEY \("landingPageId"\) REFERENCES "LandingPage"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE$/,
    /^ALTER TABLE "PageDesignVersion" ADD CONSTRAINT "PageDesignVersion_designId_fkey" FOREIGN KEY \("designId"\) REFERENCES "PageDesign"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE$/,
  ];
  assert.equal(statements.length, allowed.length, statements.join('\n'));
  for (const s of statements) assert.ok(allowed.some((re) => re.test(s)), 'unexpected statement: ' + s);
  assert.ok(!/\b(DROP|RENAME|TRUNCATE|DELETE|UPDATE|INSERT|ALTER COLUMN|SET DATA TYPE)\b/i.test(SQL.replace(/ON (DELETE|UPDATE) CASCADE/g, '')));
});

test('the tables hold what the design needs (JSONB draft and versions, revision counter)', () => {
  const pd = statements.find((s) => s.startsWith('CREATE TABLE "PageDesign" ('));
  for (const col of ['"landingPageId" TEXT NOT NULL', '"schemaVersion" INTEGER NOT NULL DEFAULT 1', '"draft" JSONB NOT NULL', '"draftRevision" INTEGER NOT NULL DEFAULT 0', '"publishedVersionId" TEXT']) assert.ok(pd.includes(col), col);
  const pv = statements.find((s) => s.startsWith('CREATE TABLE "PageDesignVersion" ('));
  for (const col of ['"designId" TEXT NOT NULL', '"version" INTEGER NOT NULL', '"content" JSONB NOT NULL']) assert.ok(pv.includes(col), col);
});

test('schema.prisma matches the migration', () => {
  assert.match(SCHEMA, /renderer\s+String\s+@default\("legacy"\)/);
  assert.match(SCHEMA, /model PageDesign \{[\s\S]*?landingPageId\s+String\s+@unique[\s\S]*?onDelete: Cascade[\s\S]*?draft\s+Json[\s\S]*?\n\}/);
  assert.match(SCHEMA, /model PageDesignVersion \{[\s\S]*?@@unique\(\[designId, version\]\)[\s\S]*?\n\}/);
});

test('it is the newest migration and no earlier migration changed', () => {
  const dirs = fs.readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();
  assert.equal(dirs[dirs.length - 1], NAME);
  // Committed or not: the only difference from main is this migration, added.
  const changed = execFileSync('git', ['diff', 'ae2861e', '--name-status', '--', 'backend/prisma/migrations'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const allowed = 'A\tbackend/prisma/migrations/' + NAME + '/migration.sql';
  assert.deepEqual(changed.filter((l) => l !== allowed), [], 'earlier migrations unchanged');
});

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
