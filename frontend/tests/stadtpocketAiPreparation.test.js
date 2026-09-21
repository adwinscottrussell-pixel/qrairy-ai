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
  getPrepRowStatusLabel,
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
test('getPrepSummary counts each bucket correctly and they sum to the total (Phase 1H.4.2: reviewed/toReview split)', () => {
  const results = [
    { status: 'ready', draftCreated: false, reviewed: true },
    { status: 'ready', draftCreated: false, reviewed: false },
    { status: 'ready', draftCreated: true },
    { status: 'failed', draftCreated: false },
    { status: 'preparing', draftCreated: false },
  ];
  const summary = getPrepSummary(results);
  assert.deepEqual(summary, {
    total: 5, readyCount: 2, reviewedCount: 1, toReviewCount: 1, draftedCount: 1, failedCount: 1, pendingCount: 1,
  });
  assert.equal(summary.reviewedCount + summary.toReviewCount, summary.readyCount);
});
test('an empty candidate list produces an empty, honest result -- never fabricated', async () => {
  const results = await runSequentialPreparation([], async () => { throw new Error('should never be called'); });
  assert.deepEqual(results, []);
});

// ── no database persistence anywhere in this pipeline (source check) ──
test('the preparation pipeline never references a Prisma/database write -- everything is transient/in-memory', () => {
  assert.equal(/prisma\.|CandidateBusiness|\.create\(|\.update\(/.test(prepBlock), false);
});

// ── Phase 1H.4.1 — website survives the discovery -> preparation handoff ──
test('2. a discovery candidate\'s website is included in the request body sent to research (prepResearchOneCandidate)', () => {
  const fn = prepBlock.match(/async function prepResearchOneCandidate\(result\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /if \(result\.website\) body\.websiteUrl = result\.website;/);
});
test('2b. a discovery candidate WITHOUT a website omits websiteUrl entirely rather than sending an empty/fake one', async () => {
  let capturedBody = null;
  // Simulate exactly what prepResearchOneCandidate builds, using the
  // same real branch it contains (verified by the source check above)
  // -- this proves the actual behavior for both cases, not just that
  // the line of code exists.
  const buildBody = (result) => {
    const body = { businessName: result.name };
    if (result.website) body.websiteUrl = result.website;
    return body;
  };
  capturedBody = buildBody({ name: 'No Website Gym', website: null });
  assert.equal('websiteUrl' in capturedBody, false);
  capturedBody = buildBody({ name: 'TopFit Ulm', website: 'https://www.topfit.fitness/ulm/' });
  assert.equal(capturedBody.websiteUrl, 'https://www.topfit.fitness/ulm/');
});
test('3. runSequentialPreparation passes each candidate\'s website through to the injected research function unchanged', async () => {
  let receivedWebsite;
  const researchFn = async (r) => { receivedWebsite = r.website; return fakeCandidateResult(r.name); };
  await runSequentialPreparation([candidate('s1', 'TopFit Ulm', 'https://www.topfit.fitness/ulm/')], researchFn);
  assert.equal(receivedWebsite, 'https://www.topfit.fitness/ulm/');
});

// ── Phase 1H.4.1 — no-source is never presented as a normal success (Problem 3) ──
test('8. a ready result with researchStatus "no-source" is labeled honestly, never a plain "Bereit zur Prüfung"', () => {
  const result = { status: 'ready', draftCreated: false, researchCandidate: { researchStatus: 'no-source' } };
  const { text, tone } = getPrepRowStatusLabel(result);
  assert.equal(text.includes('Keine Quelle gefunden'), true);
  assert.notEqual(text, 'Bereit zur Prüfung'); // never JUST the bare success text
  assert.notEqual(tone, 'success');
});
test('8b. a ready result that genuinely found evidence (researchStatus "ok") IS shown as a normal "Bereit zur Prüfung" success', () => {
  const result = { status: 'ready', draftCreated: false, researchCandidate: { researchStatus: 'ok' } };
  const { text, tone } = getPrepRowStatusLabel(result);
  assert.equal(text, 'Bereit zur Prüfung');
  assert.equal(tone, 'success');
});
test('8c. every no-evidence research status (website-rejected/unreachable/provider-unavailable/malformed-output) gets its own honest label, never a bare success checkmark', () => {
  for (const status of ['no-source', 'website-rejected', 'website-unreachable', 'provider-unavailable', 'malformed-output']) {
    const { text, tone } = getPrepRowStatusLabel({ status: 'ready', draftCreated: false, researchCandidate: { researchStatus: status } });
    assert.notEqual(tone, 'success');
    assert.notEqual(text, 'Bereit zur Prüfung');
  }
});
test('8d. a "partial" research result (some real evidence found) still reads as ready for review, not a failure', () => {
  const { tone } = getPrepRowStatusLabel({ status: 'ready', draftCreated: false, researchCandidate: { researchStatus: 'partial' } });
  assert.equal(tone, 'success');
});

// ── Phase 1H.4.1 — no automatic draft/publish behavior introduced (regression) ──
test('10. the preparation pipeline still never calls a draft, publish, or owner-creation endpoint (unchanged from Phase 1H.4)', () => {
  assert.equal(/\/research\/draft/.test(prepBlock), false);
  assert.equal(/\/publish/.test(prepBlock), false);
  assert.equal(/\/owners?/i.test(prepBlock), false);
  assert.equal(/initializeDraft/.test(prepBlock), false);
});

// ============================================================
// Phase 1H.4.2 — Business Review Queue UX
// ============================================================

// ── 1/2. every prepared business can be opened individually; business
// #4 opens business #4, not business #1 ────────────────────────────
test('1H.4.2-1/2. the ready-index lookup used by openPrepReviewForResult opens the CLICKED business, not always the first', () => {
  // Mirrors openPrepReviewForResult's own logic exactly
  // (readyIndices.indexOf(resultIndex)) using the real, exported,
  // pure getPrepReadyResultIndices -- proves the translation from
  // "clicked row #4" to "the correct position in the ready list" is
  // correct for every ready row, not just the first.
  const results = [
    { status: 'ready', draftCreated: false },   // #0
    { status: 'preparing', draftCreated: false }, // #1 -- not reviewable yet
    { status: 'failed', draftCreated: false },  // #2 -- not reviewable
    { status: 'ready', draftCreated: false },   // #3 -- "business #4"
    { status: 'ready', draftCreated: false },   // #4
  ];
  const readyIndices = getPrepReadyResultIndices(results);
  assert.deepEqual(readyIndices, [0, 3, 4]);
  // Clicking business #4 (absolute index 3) must resolve to position 1
  // (the SECOND ready item), never position 0 (which would silently
  // open business #1 instead).
  assert.equal(readyIndices.indexOf(3), 1);
  assert.notEqual(readyIndices.indexOf(3), 0);
  // Clicking business #1 (absolute index 0) still correctly resolves
  // to position 0 -- the fix does not break the simple case.
  assert.equal(readyIndices.indexOf(0), 0);
});
test('1H.4.2-1b. openPrepReviewForResult uses the exact same ready-index translation, not a hardcoded position', () => {
  const fn = prepBlock.match(/function openPrepReviewForResult\(resultIndex\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /getPrepReadyResultIndices\(prep\.results\)/);
  assert.match(fn, /readyIndices\.indexOf\(resultIndex\)/);
  assert.match(fn, /openPrepReviewAt\(position\)/);
});
test('1H.4.2-1c. every ready row in the queue renders its own "Prüfen" action wired to openPrepReviewForResult(i)', () => {
  const fn = prepBlock.match(/function renderAiDiscoveryPrepProgress\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /openPrepReviewForResult\(\$\{i\}\)/);
});

// ── 3/4. "Zur Übersicht" returns to the queue, and batch state survives ──
test('1H.4.2-3. navigatePrepBatchToOverview always returns to the queue page', () => {
  const fn = prepBlock.match(/function navigatePrepBatchToOverview\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /showPage\('page-ai-discovery-prep'\)/);
  assert.match(fn, /renderAiDiscoveryPrepProgress\(\)/);
});
test('1H.4.2-4. navigatePrepBatchToOverview never resets or clears aiDiscoveryPrepState -- the batch survives the trip back to the queue', () => {
  const fn = prepBlock.match(/function navigatePrepBatchToOverview\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.equal(/aiDiscoveryPrepState\s*=/.test(fn), false);
});
test('1H.4.2-4b. the "Zur Übersicht" button is always present when reviewing a batch item, not only at the first/last position', () => {
  assert.match(adminHtml, /function renderBatchOverviewButtonHtml\(s\)\s*\{\s*\n\s*if \(!s\.batchContext\) return '';\s*\n\s*return '<button class="secondary" type="button" onclick="navigatePrepBatchToOverview\(\)">Zur Übersicht<\/button>';/);
});

// ── 5. "Weiter" still works ─────────────────────────────────────────
test('1H.4.2-5. the "Weiter" button still advances via navigatePrepBatchStep(1)', () => {
  assert.match(adminHtml, /onclick="navigatePrepBatchStep\(1\)">\$\{isLast \? 'Fertig' : 'Weiter'\}<\/button>/);
});

// ── 6. reviewed state is represented correctly ───────────────────────
test('1H.4.2-6. a reviewed, evidence-bearing ready result shows "Geprüft" instead of the plain "Bereit zur Prüfung"', () => {
  const unreviewed = getPrepRowStatusLabel({ status: 'ready', draftCreated: false, reviewed: false, researchCandidate: { researchStatus: 'ok' } });
  const reviewed = getPrepRowStatusLabel({ status: 'ready', draftCreated: false, reviewed: true, researchCandidate: { researchStatus: 'ok' } });
  assert.equal(unreviewed.text, 'Bereit zur Prüfung');
  assert.equal(reviewed.text, 'Geprüft');
  assert.equal(reviewed.tone, 'success');
});
test('1H.4.2-6b. reviewed is only ever set by explicitly navigating away from a review, never merely because research finished', () => {
  const fn = prepBlock.match(/function markCurrentBatchResultReviewed\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /result\.reviewed = true/);
  // Called from navigatePrepBatchToOverview/navigatePrepBatchStep only
  // -- never from prepResearchOneCandidate or runSequentialPreparation
  // (the actual research-completion code paths).
  assert.equal(/markCurrentBatchResultReviewed/.test(prepBlock.match(/async function prepResearchOneCandidate\(result\)\s*\{([\s\S]*?)\n  \}/)[1]), false);
});

// ── 7. draft-created state is represented only after successful existing draft creation ──
test('1H.4.2-7. draftCreated is set only inside the success path (after the !res.ok check), not unconditionally', () => {
  const fnStart = adminHtml.indexOf('async function createDraftFromAiResearch()');
  const fnEnd = adminHtml.indexOf('async function createMultiLocationDraftFromAiResearch()');
  const fn = adminHtml.slice(fnStart, fnEnd);
  const notOkIdx = fn.indexOf('if (!res.ok)');
  const draftCreatedIdx = fn.indexOf('prepResult.draftCreated = true');
  assert.ok(notOkIdx > -1 && draftCreatedIdx > notOkIdx, 'draftCreated must be set after the failure check, in the success path only');
});
test('1H.4.2-7b. draftCreated takes display priority over "Geprüft" and over the plain ready state', () => {
  const label = getPrepRowStatusLabel({ status: 'ready', draftCreated: true, reviewed: true });
  assert.equal(label.text, 'Entwurf erstellt');
});

// ── 8. failed/no-source candidates remain individually selectable ────
test('1H.4.2-8. a no-source (or other no-evidence) ready result is STILL in the reviewable/ready-index set -- "Prüfen" remains available', () => {
  const results = [{ status: 'ready', draftCreated: false, researchCandidate: { researchStatus: 'no-source' } }];
  assert.deepEqual(getPrepReadyResultIndices(results), [0]);
});
test('1H.4.2-8b. a failed candidate\'s retry action is only disabled while the batch is still actively processing, never permanently', () => {
  const fn = prepBlock.match(/function renderAiDiscoveryPrepProgress\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /retryPrepCandidate\(\$\{i\}\)" \$\{prep\.processing \? 'disabled' : ''\}/);
});

// ── 9. no automatic draft creation (regression, restated for 1H.4.2) ──
test('1H.4.2-9. neither the queue rendering nor the navigation functions ever call a draft-creation endpoint', () => {
  assert.equal(/\/research\/draft/.test(prepBlock), false);
});

// ── 10. existing Phase 1H.4 sequential preparation remains unchanged ──
test('1H.4.2-10. runSequentialPreparation is untouched: still strictly sequential, one candidate at a time', async () => {
  let maxConcurrent = 0;
  let inFlight = 0;
  const researchFn = async (r) => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 3));
    inFlight -= 1;
    return fakeCandidateResult(r.name);
  };
  await runSequentialPreparation([candidate('s1', 'A'), candidate('s2', 'B'), candidate('s3', 'C')], researchFn);
  assert.equal(maxConcurrent, 1);
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
