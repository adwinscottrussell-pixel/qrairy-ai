// ============================================================
// lpStagingVercelSkip.test.js — which branch the dedicated Voice staging
// Vercel project may deploy.
//
// The rule is a setting of THAT project only (Vercel dashboard ->
// Settings -> Build and Deployment -> Ignored Build Step). It is not in
// vercel.json, because vercel.json is read by every Vercel project
// connected to this repository, including the existing QRAIVY project.
//
// The exact command to paste is kept in
// backend/staging/vercel-ignored-build-step.txt and is executed here with
// the environment Vercel provides. Vercel's convention is inverted:
//   exit code 1 (or more)  -> build
//   exit code 0            -> skip
//
// This proves what the command decides. It does not prove Vercel runs it:
// that is confirmed on the first push to the new project.
//
// No test framework dependency. Run: node tests/lpStagingVercelSkip.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const COMMAND_FILE = read(__dirname, '..', 'staging', 'vercel-ignored-build-step.txt');
const COMMAND = COMMAND_FILE.trim();
const VOICE_BRANCH = 'preview/lp-voice-social';

// Runs the command the way Vercel does: a shell, with Vercel's variables.
function decide(env, shell = 'sh') {
  const r = spawnSync(shell, ['-c', COMMAND], { env: Object.assign({ PATH: process.env.PATH }, env), encoding: 'utf8' });
  if (r.error) throw r.error;
  return { exit: r.status, builds: r.status !== 0, output: (r.stdout + r.stderr).trim() };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('the command is one self-contained line that needs no file from the repository', () => {
  assert.equal(COMMAND_FILE.split('\n').filter(Boolean).length, 1);
  assert.equal(COMMAND, 'case "$VERCEL_GIT_COMMIT_REF" in preview/lp-voice-social) exit 1 ;; *) exit 0 ;; esac');
  // A command that called a script in the repo would fail on every branch
  // that does not have the script, and a failing command means "build".
  assert.ok(!/\.sh|\.js|node |bash |cat |\.\/|backend|frontend/.test(COMMAND));
  // nothing in it can fail or produce a third outcome
  assert.ok(!/\[|\btest\b|&&|\|\||grep|git /.test(COMMAND));
});

test('the Voice branch builds, for production and for preview deployments alike', () => {
  for (const VERCEL_ENV of ['production', 'preview', undefined]) {
    const env = { VERCEL_GIT_COMMIT_REF: VOICE_BRANCH }; if (VERCEL_ENV) env.VERCEL_ENV = VERCEL_ENV;
    assert.deepEqual(decide(env), { exit: 1, builds: true, output: '' }, String(VERCEL_ENV));
  }
});

test('every other branch is skipped, for production and for preview deployments alike', () => {
  const others = ['main', 'master', 'preview/billing-step2', 'preview/qraivy-admin', 'preview/plan-consolidation', 'preview/qraivy-deals-foundation', 'preview/ai-image-transparency', 'preview/stadtpocket-phase6d-admin', 'preview/sprint-2d-smart-qr-renderer', 'feature/anything', 'hotfix/x', 'dependabot/npm_and_yarn/x'];
  for (const branch of others) for (const VERCEL_ENV of ['production', 'preview']) {
    assert.deepEqual(decide({ VERCEL_GIT_COMMIT_REF: branch, VERCEL_ENV }), { exit: 0, builds: false, output: '' }, branch + ' ' + VERCEL_ENV);
  }
});

test('every branch that exists on the remote today is skipped', () => {
  const remote = execFileSync('git', ['branch', '-r', '--format=%(refname:short)'], { cwd: ROOT, encoding: 'utf8' }).split('\n').map((b) => b.trim().replace(/^origin\//, '')).filter((b) => b && b !== 'HEAD' && b !== 'origin');
  assert.ok(remote.length >= 30, remote.length + ' remote branches');
  const building = remote.filter((b) => decide({ VERCEL_GIT_COMMIT_REF: b, VERCEL_ENV: 'preview' }).builds);
  assert.deepEqual(building.filter((b) => b !== VOICE_BRANCH), []);
});

test('names that only resemble the Voice branch are skipped', () => {
  for (const branch of ['preview/lp-voice-social-2', 'preview/lp-voice-social/', 'preview/lp-voice-social/extra', 'xpreview/lp-voice-social', 'Preview/LP-Voice-Social', 'PREVIEW/LP-VOICE-SOCIAL', 'preview/lp-voice', 'lp-voice-social', 'refs/heads/preview/lp-voice-social', 'origin/preview/lp-voice-social', ' preview/lp-voice-social', 'preview/lp-voice-social ', 'preview/lp-voice-social\n', 'preview/lp_voice_social', 'preview/*', '*', '?', 'preview/lp-voice-socia?', '[p]review/lp-voice-social', '$(echo preview/lp-voice-social)', '`echo preview/lp-voice-social`', 'main; exit 1', 'x) exit 1 ;; *', '-n', '']) {
    assert.equal(decide({ VERCEL_GIT_COMMIT_REF: branch, VERCEL_ENV: 'preview' }).builds, false, JSON.stringify(branch));
  }
});

test('if Vercel provides no branch at all, nothing is built', () => {
  assert.deepEqual(decide({}), { exit: 0, builds: false, output: '' });
  assert.equal(decide({ VERCEL_ENV: 'production' }).builds, false);
  // other Vercel variables cannot turn a skip into a build
  assert.equal(decide({ VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_MESSAGE: VOICE_BRANCH, VERCEL_GIT_PULL_REQUEST_ID: '1', VERCEL_GIT_REPO_SLUG: VOICE_BRANCH, VOICE_STAGING_PROJECT: '1' }).builds, false);
});

test('the same decision under bash as under sh', () => {
  for (const [branch, builds] of [[VOICE_BRANCH, true], ['main', false], ['', false], ['preview/lp-voice-social-2', false]]) {
    assert.equal(decide({ VERCEL_GIT_COMMIT_REF: branch }, 'bash').builds, builds, 'bash ' + branch);
    assert.equal(decide({ VERCEL_GIT_COMMIT_REF: branch }, 'sh').builds, builds, 'sh ' + branch);
  }
});

test('the rule is NOT in the shared vercel.json: the existing QRAIVY project keeps deploying every branch as before', () => {
  for (const copy of [path.join(ROOT, 'vercel.json'), path.join(ROOT, 'frontend', 'public', 'vercel.json')]) {
    const config = JSON.parse(fs.readFileSync(copy, 'utf8'));
    for (const key of ['ignoreCommand', 'git', 'github', 'buildCommand', 'installCommand', 'framework']) assert.equal(config[key], undefined, path.basename(path.dirname(copy)) + '/vercel.json has no "' + key + '"');
    assert.deepEqual(Object.keys(config).sort(), ['headers', 'outputDirectory', 'redirects', 'rewrites']);
  }
  // neither copy has changed since the frontend isolation commit
  assert.equal(execFileSync('git', ['diff', '9572bed', '--stat', '--', 'vercel.json', 'frontend/public/vercel.json'], { cwd: ROOT, encoding: 'utf8' }).trim(), '');
  // and nothing in the product code reads the branch or decides about deployments
  for (const file of ['frontend/public/js/staging-config.js', 'frontend/public/js/lp-routing.js']) assert.ok(!/VERCEL_GIT|ignoreCommand/.test(read(ROOT, file)), file);
});

test('where the rule goes is written down next to the command', () => {
  const notes = read(__dirname, '..', 'staging', 'README.md').replace(/\s+/g, ' ');
  assert.match(notes, /Ignored Build Step/);
  assert.match(notes, /new Voice staging Vercel project only/);
  assert.match(notes, /never in `vercel\.json`/);
  assert.match(notes, /exit code 1 builds, exit code 0 skips/);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${String(err.message).split('\n').slice(0, 8).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
