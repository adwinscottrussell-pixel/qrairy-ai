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

const { LPV3_FILES: PHASE1_FILES, withoutV3, indexOnlyStudioMount } = require('./helpers/lpV3Files');
const fs = require('fs');
// Phase A: index.js may differ from ae2861e by exactly the Studio pages mount (helpers/lpV3Files.js)
const INDEX_OK = indexOnlyStudioMount(ROOT, 'ae2861e');
const mountOnly = (f) => f === 'backend/src/index.js' && INDEX_OK;
// Phase D1: the existing production files it changes, each by exactly its own edits (helpers/studioD1Files.js)
const { D1_CHANGED_FILES, d1Only, withoutD1 } = require('./helpers/studioD1Files');
const D1_OK = new Set(D1_CHANGED_FILES.filter((f) => d1Only(ROOT, 'ae2861e', f)));
const allowedChange = (f) => mountOnly(f) || D1_OK.has(f);

test('Phase 1 changes only its own files', () => {
  const changed = git('diff', 'ae2861e', '--name-only').concat(git('ls-files', '--others', '--exclude-standard'));
  const extra = [...new Set(changed)].filter((f) => !PHASE1_FILES.includes(f) && !allowedChange(f));
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
  // Phase D1 also adds its own new backend files (draft policy and controller, the public draft guard)
  const { D1_NEW_FILES } = require('./helpers/studioD1Files');
  const isNewFile = (f) => isNew(f) || D1_NEW_FILES.includes(f);
  assert.deepEqual(changed.filter((l) => !isNewFile(l.split('\t')[1]) && !allowedChange(l.split('\t')[1])), []);
  for (const l of changed) assert.ok(/^[A?]\t/.test(l) || allowedChange(l.split('\t')[1]), 'only new files, nothing existing replaced: ' + l);
  assert.deepEqual([...D1_OK].sort(), D1_CHANGED_FILES.slice().sort(), 'each D1 production file differs by exactly the D1 edits');
});

test('older scope guards: exactly these now allow the V3 files, and only the V3 lines', () => {
  // existing tests that were edited (M); every V3 / Studio test is a new file (A)
  const guards = git('diff', 'ae2861e', '--name-only', '--diff-filter=M', '--', 'backend/tests');
  assert.deepEqual(guards.sort(), ['backend/tests/academyPage.test.js', 'backend/tests/adminNavShell.test.js', 'backend/tests/dealImageMaster.test.js', 'backend/tests/dealsPreviewSafety.test.js', 'backend/tests/lpDeleteAuth.test.js', 'backend/tests/lpStagingClerkAuth.test.js', 'backend/tests/lpStagingFrontend.test.js', 'backend/tests/lpStagingGate.test.js',
    'backend/tests/lpStagingRouting.test.js', 'backend/tests/lpVoicePreview.test.js', 'backend/tests/pushCampaignAuth.test.js', 'backend/tests/pushLocalization.test.js', 'backend/tests/pushPageSubscriptions.test.js', 'backend/tests/slugReservation.test.js', 'backend/tests/welcomeUnified.test.js']);
  const lf = (s) => s.replace(/\r\n/g, '\n');
  const now = lf(fs.readFileSync(path.join(ROOT, 'backend', 'prisma', 'schema.prisma'), 'utf8'));
  const then = lf(execFileSync('git', ['show', 'ae2861e:backend/prisma/schema.prisma'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  assert.equal(withoutV3(withoutD1(now)), then, 'schema.prisma: only the V3 blocks (and the D1 model) were added');
});

test('nothing outside the new lpV3 module uses it yet', () => {
  let users = [];
  try { users = git('grep', '-l', 'lpV3', '--', 'backend/src'); } catch (e) { if (e.status !== 1) throw e; } // 1 = no match
  // Phase A: the server entry point mounts the Studio pages routes (exactly that, INDEX_OK)
  // Phase D1: its production edits name lpV3/draftPolicy.js in comments only (pinned by d1Only)
  assert.deepEqual(users.filter((f) => !f.startsWith('backend/src/lpV3/') && !allowedChange(f)), []);
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
