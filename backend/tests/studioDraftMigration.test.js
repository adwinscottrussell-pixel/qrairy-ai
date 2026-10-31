// ============================================================
// studioDraftMigration.test.js — Studio V3 Phase D1: the creation-log
// migration only ADDS the StudioDraftCreation table and its two indexes.
// No other table is touched, nothing is dropped, renamed, updated or
// deleted, no foreign key (the log row outlives a deleted draft), and the
// schema model matches. Applied for real on a local PostgreSQL rehearsal
// (see the D1 verification report).
// Run: node tests/studioDraftMigration.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const NAME = '20261031090000_add_studio_draft_creation';
const SQL = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
const statements = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('exactly three additive statements: the table and its two indexes', () => {
  assert.equal(statements.length, 3, statements.join('\n'));
  assert.ok(statements[0].startsWith('CREATE TABLE "StudioDraftCreation" ('));
  assert.equal(statements[1], 'CREATE INDEX "StudioDraftCreation_userId_createdAt_idx" ON "StudioDraftCreation"("userId", "createdAt")');
  assert.equal(statements[2], 'CREATE UNIQUE INDEX "StudioDraftCreation_userId_requestId_key" ON "StudioDraftCreation"("userId", "requestId")');
  assert.ok(!/\b(DROP|RENAME|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|FOREIGN KEY|REFERENCES)\b/i.test(SQL));
  assert.ok(!/"LandingPage"|"PageDesign"|"User"/.test(SQL), 'no existing table is named');
});

test('the columns: account, page (nullable, no relation), request id and hash (nullable), time', () => {
  const t = statements[0];
  for (const col of ['"id" TEXT NOT NULL', '"userId" TEXT NOT NULL', '"landingPageId" TEXT,', '"requestId" TEXT,', '"requestHash" TEXT,', '"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP', 'CONSTRAINT "StudioDraftCreation_pkey" PRIMARY KEY ("id")']) assert.ok(t.includes(col), col);
});

test('schema.prisma has the matching model, without a relation', () => {
  const m = SCHEMA.match(/model StudioDraftCreation \{([\s\S]*?)\n\}/);
  assert.ok(m);
  const body = m[1];
  for (const re of [/userId\s+String\n/, /landingPageId\s+String\?/, /requestId\s+String\?/, /requestHash\s+String\?/, /createdAt\s+DateTime\s+@default\(now\(\)\)/, /@@unique\(\[userId, requestId\]\)/, /@@index\(\[userId, createdAt\]\)/]) assert.match(body, re);
  assert.ok(!/@relation/.test(body));
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
