// ============================================================
// lpV3Scope.test.js — Landing Page Studio V3 Phase 1 (foundation) changes
// only its own files. The public page handler, routes, server entry point,
// staging gate, StadtPocket, scanner, deals, voice and the whole frontend
// are exactly as on main (ae2861e).
// Run: node tests/lpV3Scope.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const { LPV3_FILES: PHASE1_FILES, withoutV3 } = require('./helpers/lpV3Files');
const fs = require('fs');

test('Phase 1 changes only its own files', () => {
  const changed = git('diff', 'ae2861e', '--name-only').concat(git('ls-files', '--others', '--exclude-standard'));
  const extra = [...new Set(changed)].filter((f) => !PHASE1_FILES.includes(f));
  assert.deepEqual(extra, [], 'unexpected changes');
});

test('customer-facing code is untouched (public pages, routes, server, staging, StadtPocket, scanner, frontend)', () => {
  const protectedPaths = ['backend/src/controllers', 'backend/src/routes', 'backend/src/index.js', 'backend/src/middleware', 'backend/src/services', 'backend/src/utils', 'backend/src/config', 'backend/src/data',
    'frontend', 'vercel.json', 'backend/railway.toml'];
  // The exceptions are NEW files only: the browser copy of core.js
  // (lpV3CoreCopy.test.js) and the Studio page with its own css/js
  // (studioShell.test.js). Every existing file under these paths is unchanged.
  const { LPV3_NEW_FRONTEND } = require('./helpers/lpV3Files');
  const isNew = (f) => LPV3_NEW_FRONTEND.some((p) => f === p || f.startsWith(p + '/'));
  const changed = git('diff', 'ae2861e', '--name-status', '--', ...protectedPaths).concat(git('ls-files', '--others', '--exclude-standard', '--', ...protectedPaths).map((f) => '?\t' + f));
  assert.deepEqual(changed.filter((l) => !isNew(l.split('\t')[1])), []);
  for (const l of changed) assert.ok(/^[A?]\t/.test(l), 'only new files, nothing existing replaced: ' + l);
});

test('older scope guards: exactly these now allow the V3 files, and only the V3 lines', () => {
  // existing tests that were edited (M); every V3 / Studio test is a new file (A)
  const guards = git('diff', 'ae2861e', '--name-only', '--diff-filter=M', '--', 'backend/tests');
  assert.deepEqual(guards.sort(), ['backend/tests/academyPage.test.js', 'backend/tests/adminNavShell.test.js', 'backend/tests/dealImageMaster.test.js', 'backend/tests/lpDeleteAuth.test.js', 'backend/tests/lpStagingFrontend.test.js',
    'backend/tests/lpStagingRouting.test.js', 'backend/tests/lpVoicePreview.test.js', 'backend/tests/pushLocalization.test.js', 'backend/tests/pushPageSubscriptions.test.js', 'backend/tests/slugReservation.test.js', 'backend/tests/welcomeUnified.test.js']);
  const lf = (s) => s.replace(/\r\n/g, '\n');
  const now = lf(fs.readFileSync(path.join(ROOT, 'backend', 'prisma', 'schema.prisma'), 'utf8'));
  const then = lf(execFileSync('git', ['show', 'ae2861e:backend/prisma/schema.prisma'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  assert.equal(withoutV3(now), then, 'schema.prisma: only the V3 blocks were added');
});

test('nothing outside the new lpV3 module uses it yet', () => {
  let users = [];
  try { users = git('grep', '-l', 'lpV3', '--', 'backend/src'); } catch (e) { if (e.status !== 1) throw e; } // 1 = no match
  assert.deepEqual(users.filter((f) => !f.startsWith('backend/src/lpV3/')), []);
});

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 8).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
