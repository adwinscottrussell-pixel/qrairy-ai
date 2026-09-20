// ============================================================
// stadtpocketAiPreparation.test.js — Phase 1H.4 (Selected Businesses ->
// AI Preparation Pipeline). Unit tests for the pure sequential-batch
// orchestrator added to frontend/public/js/stadtpocket-ai-research.js,
// plus static source-level checks against
// frontend/public/stadtpocket-admin.html for the DOM-wiring
// requirements this repo has no browser/jsdom harness to exercise
// directly -- same documented approach as stadtpocketAiDiscovery.test.js.
//
// No live Google/Anthropic/Firecrawl call is possible or attempted
// anywhere in this file: researchFn is always a fake injected function.
//
// Run: node frontend/tests/stadtpocketAiPreparation.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const {
  runSequentialPreparation,
  getPrepReadyResultIndices,
  getPrepSummary,
} = require('../public/js/stadtpocket-ai-research');

const adminHtmlPath = path.join(__dirname, '..', 'public', 'stadtpocket-admin.html');
const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

const prepBlockStart = adminHtml.indexOf('let aiDiscoveryPrepState = null;');
const prepBlockEnd = adminHtml.indexOf('function openAiResearch()');
assert.ok(prepBlockStart > -1 && prepBlockEnd > prepBlockStart, 'Phase 1H.4 prep script block not found');
const prepBlock = adminHtml.slice(prepBlockStart, prepBlockEnd);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function candidate(sourceId, name, website) {
  return { sourceId, name, website: website || null };
}

function fakeCandidateResult(name) {
  return { researchStatus: 'ok', fields: { name: { value: name, confidence: 'high' } }, multipleLocationsDetected: false, locations: [], duplicate: { status: 'NEW', matches: [] } };
}

// ── 1. one selected NEW candidate ────────────────────────────────────
test('1. a single candidate is prepared and marked ready', async () => {
  const calls = [];
  const researchFn = async (r) => { calls.push(r.name); return fakeCandidateResult(r.name); };
  const results = await runSequentialPreparation([candidate('s1', 'Fitness A')], researchFn);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'ready');
  assert.equal(results[0].researchCandidate.fields.name.value, 'Fitness A');
  assert.deepEqual(calls, ['Fitness A']);
});

// ── 2. several selected NEW candidates ───────────────────────────────
test('2. several candidates are all prepared', async () => {
  const researchFn = async (r) => fakeCandidateResult(r.name);
  const results = await runSequentialPreparation(
    [candidate('s1', 'Fitness A'), candidate('s2', 'Fitness B'), candidate('s3', 'Fitness C')],
    researchFn
  );
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.status === 'ready'));
});

// ── 3. sequential ordering (never concurrent) ────────────────────────
test('3. candidates are processed strictly one at a time, in order -- never concurrently', async () => {
  const order = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  const researchFn = async (r) => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    order.push(`start:${r.name}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push(`end:${r.name}`);
    inFlight -= 1;
    return fakeCandidateResult(r.name);
  };
  await runSequentialPreparation(
    [candidate('s1', 'A'), candidate('s2', 'B'), candidate('s3', 'C')],
    researchFn
  );
  assert.equal(maxConcurrent, 1, 'no more than one candidate should ever be in flight at once');
  assert.deepEqual(order, ['start:A', 'end:A', 'start:B', 'end:B', 'start:C', 'end:C']);
});

test('3b. onProgress reports each candidate as "preparing" before it resolves', async () => {
  const snapshots = [];
  const researchFn = async (r) => fakeCandidateResult(r.name);
  await runSequentialPreparation(
    [candidate('s1', 'A'), candidate('s2', 'B')],
    researchFn,
    (results, index) => { if (index >= 0) snapshots.push({ index, status: results[index].status }); }
  );
  // Each index transitions 'preparing' -> ('ready'|'failed'), never
  // skipping straight to a terminal state without the caller having
  // been told it started.
  assert.deepEqual(snapshots, [
    { index: 0, status: 'preparing' }, { index: 0, status: 'ready' },
    { index: 1, status: 'preparing' }, { index: 1, status: 'ready' },
  ]);
});

// ── 4. one failure does not stop the following candidates ───────────
test('4. a research failure on candidate 2 does not prevent candidate 3 from running', async () => {
  const researchFn = async (r) => {
    if (r.name === 'Fitness B') throw new Error('Recherche fehlgeschlagen.');
    return fakeCandidateResult(r.name);
  };
  const results = await runSequentialPreparation(
    [candidate('s1', 'Fitness A'), candidate('s2', 'Fitness B'), candidate('s3', 'Fitness C')],
    researchFn
  );
  assert.equal(results[0].status, 'ready');
  assert.equal(results[1].status, 'failed');
  assert.equal(results[1].error, 'Recherche fehlgeschlagen.');
  assert.equal(results[2].status, 'ready'); // still ran, despite #2 failing
});

test('4b. a thrown non-Error value still produces a safe, non-crashing failure result', async () => {
  const researchFn = async () => { throw 'plain string rejection'; }; // eslint-disable-line no-throw-literal
  const results = await runSequentialPreparation([candidate('s1', 'X')], researchFn);
  assert.equal(results[0].status, 'failed');
  assert.equal(typeof results[0].error, 'string');
});

// ── 5. duplicate/unselected candidates cannot accidentally enter preparation ──
test('5. the orchestrator only ever processes candidates explicitly passed to it -- nothing implicit is added', async () => {
  const researchFn = async (r) => fakeCandidateResult(r.name);
  const results = await runSequentialPreparation([candidate('s1', 'Only This One')], researchFn);
  assert.equal(results.length, 1);
  assert.equal(results[0].sourceId, 's1');
});
test('5b. submitAiDiscoveryPrep only includes candidates the Admin actually selected (source check)', () => {
  const fn = prepBlock.match(/async function submitAiDiscoveryPrep\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /discovery\.candidates\.filter\(\(c\) => discovery\.selectedSourceIds\.has\(c\.sourceId\)\)/);
});

// ── 6. prepared result enters the EXISTING review UI ─────────────────
test('6. openPrepReviewAt loads a prepared result into the existing single-business review screen', () => {
  const fn = prepBlock.match(/function openPrepReviewAt\(position\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /loadCandidateIntoAiResearchState\(/);
  assert.match(fn, /showPage\('page-ai-research'\)/);
  assert.match(fn, /renderAiResearchReview\(\)/);
});

// ── 7. draft is NOT automatically created ─────────────────────────────
test('7. nothing in the preparation pipeline ever calls a draft-creation endpoint or function', () => {
  assert.equal(/\/research\/draft/.test(prepBlock), false);
  assert.equal(/createDraftFromAiResearch\(\)/.test(prepBlock), false); // never CALLED here (only referenced by name in unrelated comments elsewhere in the file)
  assert.equal(/createMultiLocationDraftFromAiResearch\(\)/.test(prepBlock), false);
});
test('7b. prepResearchOneCandidate calls only the existing single-business research endpoint', () => {
  const fn = prepBlock.match(/async function prepResearchOneCandidate\(result\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /`\/manager\/stadtpocket\/listings\/\$\{currentLocationId\}\/research`/);
});

// ── 8. existing research/draft behavior remains intact (regression) ───
test('8. draft creation still marks the batch item done via draftCreated, without altering its own success path otherwise', () => {
  assert.match(adminHtml, /if \(s\.batchContext && aiDiscoveryPrepState\)/);
  assert.match(adminHtml, /prepResult\.draftCreated = true/);
});

// ── 9. multi-location research remains compatible ─────────────────────
test('9. a multi-location researchCandidate passes through the orchestrator completely unmodified', async () => {
  const multiLocationCandidate = {
    researchStatus: 'ok',
    fields: { name: { value: 'Filialkette', confidence: 'high' } },
    multipleLocationsDetected: true,
    locations: [{ address: 'Erste Str. 1' }, { address: 'Zweite Str. 2' }],
    totalLocationsDiscovered: 2,
    duplicate: { status: 'NEW', matches: [] },
  };
  const researchFn = async () => multiLocationCandidate;
  const results = await runSequentialPreparation([candidate('s1', 'Filialkette')], researchFn);
  assert.equal(results[0].researchCandidate.multipleLocationsDetected, true);
  assert.equal(results[0].researchCandidate.locations.length, 2);
});
test('9b. renderAiResearchReview\'s existing multi-location dispatch is untouched (still checks multipleLocationsDetected)', () => {
  assert.match(adminHtml, /if \(aiResearchState\.candidate && aiResearchState\.candidate\.multipleLocationsDetected\)/);
});

// ── 10. no Google/Anthropic/Firecrawl calls anywhere in this pipeline ──
test('10. the preparation pipeline never references Google Places, Anthropic, or Firecrawl', () => {
  assert.equal(/google|places\.googleapis|anthropic|firecrawl/i.test(prepBlock), false);
});

// ── getPrepReadyResultIndices / getPrepSummary ──────────────────────────
test('getPrepReadyResultIndices excludes failed, pending, preparing, and already-drafted results', () => {
  const results = [
    { status: 'ready', draftCreated: false },
    { status: 'failed', draftCreated: false },
    { status: 'ready', draftCreated: true },
    { status: 'pending', draftCreated: false },
    { status: 'ready', draftCreated: false },
  ];
  assert.deepEqual(getPrepReadyResultIndices(results), [0, 4]);
});
test('getPrepSummary counts each bucket correctly and they sum to the total', () => {
  const results = [
    { status: 'ready', draftCreated: false },
    { status: 'ready', draftCreated: true },
    { status: 'failed', draftCreated: false },
    { status: 'preparing', draftCreated: false },
  ];
  const summary = getPrepSummary(results);
  assert.deepEqual(summary, { total: 4, readyCount: 1, draftedCount: 1, failedCount: 1, pendingCount: 1 });
});
test('an empty candidate list produces an empty, honest result -- never fabricated', async () => {
  const results = await runSequentialPreparation([], async () => { throw new Error('should never be called'); });
  assert.deepEqual(results, []);
});

// ── no database persistence anywhere in this pipeline (source check) ──
test('the preparation pipeline never references a Prisma/database write -- everything is transient/in-memory', () => {
  assert.equal(/prisma\.|CandidateBusiness|\.create\(|\.update\(/.test(prepBlock), false);
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
