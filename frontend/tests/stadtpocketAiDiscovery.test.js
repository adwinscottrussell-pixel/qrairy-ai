// ============================================================
// stadtpocketAiDiscovery.test.js — Phase 1H.3 (AI Business Discovery
// Admin UI). Unit tests for the pure presentation-logic helpers added
// to frontend/public/js/stadtpocket-ai-research.js, plus static
// source-level checks against frontend/public/stadtpocket-admin.html
// for the DOM-wiring requirements this repo has no browser/jsdom
// harness to exercise directly -- same documented limitation and same
// mitigation already used by stadtpocketAiResearch.test.js (verified by
// source inspection / local visual review, not a simulated DOM).
//
// Run: node frontend/tests/stadtpocketAiDiscovery.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const {
  AI_DISCOVERY_DUPLICATE_LABELS,
  getDiscoveryDuplicateLabel,
  isDiscoveryCandidateSelectedByDefault,
  AI_DISCOVERY_DEFAULT_QUANTITY,
  AI_DISCOVERY_MIN_QUANTITY,
  AI_DISCOVERY_MAX_QUANTITY,
  validateAiDiscoveryInput,
  buildAiDiscoveryRequestBody,
  getAiDiscoveryProviderStatusMessage,
} = require('../public/js/stadtpocket-ai-research');

const adminHtmlPath = path.join(__dirname, '..', 'public', 'stadtpocket-admin.html');
const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

// Isolates the discovery-specific inline-script block for the static
// checks below, so a match elsewhere in this large file (e.g. the
// single-business research screen) can never produce a false pass.
const discoveryBlockStart = adminHtml.indexOf('function openAiDiscovery()');
// Ends right before the Phase 1H.4 preparation-pipeline block (which
// legitimately DOES call POST .../research, once a human explicitly
// presses "Ausgewählte Unternehmen vorbereiten" -- see
// stadtpocketAiPreparation.test.js for that block's own tests) so
// discovery's "never calls research/draft directly" checks below stay
// scoped to discovery itself, not the later step it hands off to.
const discoveryBlockEnd = adminHtml.indexOf('// ── Selected Businesses -> AI Preparation Pipeline (Phase 1H.4) ────');
assert.ok(discoveryBlockStart > -1 && discoveryBlockEnd > discoveryBlockStart, 'discovery script block not found');
const discoveryBlock = adminHtml.slice(discoveryBlockStart, discoveryBlockEnd);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── discovery option opens ───────────────────────────────────────
test('1. "Neues Geschäft" choice grid has a discovery option that opens openAiDiscovery()', () => {
  assert.match(adminHtml, /Unternehmen mit KI finden/);
  assert.match(adminHtml, /onclick="openAiDiscovery\(\)"/);
});

test('1b. openAiDiscovery() shows the discovery page and renders the form', () => {
  const fn = discoveryBlock.match(/function openAiDiscovery\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /showPage\('page-ai-discovery'\)/);
  assert.match(fn, /renderAiDiscoveryForm\(\)/);
});

test('1c. manual creation and single-business AI research options are still present (not removed)', () => {
  assert.match(adminHtml, /onclick="openInitForCurrentCity\(\)"/);
  assert.match(adminHtml, /onclick="openAiResearch\(\)"/);
});

// ── correct city displayed ────────────────────────────────────────
test('2. the form derives the city from the manager\'s own currentLocationId/cities context, not a free-text field', () => {
  const fn = discoveryBlock.match(/function renderAiDiscoveryForm\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /cities\.find\(\(c\) => c\.id === currentLocationId\)/);
  assert.match(fn, /<input type="text" value="\$\{escapeHtml\(cityName\)\}" disabled \/>/);
});

// ── category required ─────────────────────────────────────────────
test('3. empty/whitespace-only category is rejected', () => {
  assert.equal(validateAiDiscoveryInput('', 10).valid, false);
  assert.equal(validateAiDiscoveryInput('   ', 10).valid, false);
  assert.equal(validateAiDiscoveryInput(undefined, 10).valid, false);
});
test('3b. a real category with a valid quantity is accepted', () => {
  assert.equal(validateAiDiscoveryInput('Fitness', 10).valid, true);
});

// ── default quantity 10 ───────────────────────────────────────────
test('4. AI_DISCOVERY_DEFAULT_QUANTITY is 10, and the initial form state seeds quantity from it', () => {
  assert.equal(AI_DISCOVERY_DEFAULT_QUANTITY, 10);
  // resetAiDiscoveryState() is defined just before openAiDiscovery(),
  // so it sits just outside the discoveryBlock slice above -- searched
  // directly in the full file instead.
  const resetIdx = adminHtml.indexOf('function resetAiDiscoveryState()');
  assert.ok(resetIdx > -1, 'resetAiDiscoveryState() not found');
  const fn = adminHtml.slice(resetIdx, discoveryBlockStart);
  assert.match(fn, /quantity: AI_DISCOVERY_DEFAULT_QUANTITY/);
});

// ── quantity min/max ───────────────────────────────────────────────
test('5. quantity below the minimum (1) is rejected', () => {
  assert.equal(validateAiDiscoveryInput('Fitness', 0).valid, false);
});
test('5b. quantity above the maximum (20) is rejected', () => {
  assert.equal(validateAiDiscoveryInput('Fitness', 21).valid, false);
});
test('5c. the boundary values 1 and 20 are both accepted', () => {
  assert.equal(validateAiDiscoveryInput('Fitness', 1).valid, true);
  assert.equal(validateAiDiscoveryInput('Fitness', 20).valid, true);
  assert.equal(AI_DISCOVERY_MIN_QUANTITY, 1);
  assert.equal(AI_DISCOVERY_MAX_QUANTITY, 20);
});
test('5d. a non-integer quantity is rejected', () => {
  assert.equal(validateAiDiscoveryInput('Fitness', 3.5).valid, false);
});

// ── request body ───────────────────────────────────────────────────
test('buildAiDiscoveryRequestBody trims category and coerces quantity to a number', () => {
  assert.deepEqual(buildAiDiscoveryRequestBody('  Fitness  ', '10'), { category: 'Fitness', quantity: 10 });
});

// ── loading state ─────────────────────────────────────────────────
test('6. submitAiDiscovery shows the loading state before awaiting the API call', () => {
  const fn = discoveryBlock.match(/async function submitAiDiscovery\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  const loadingIdx = fn.indexOf('renderAiDiscoveryLoading()');
  const apiCallIdx = fn.indexOf('await api(');
  assert.ok(loadingIdx > -1 && apiCallIdx > -1 && loadingIdx < apiCallIdx, 'loading state must render before the API call');
});

// ── successful candidates render ────────────────────────────────────
test('7. renderAiDiscoveryResults wires every available candidate field into the card, never fabricating missing ones', () => {
  const fn = discoveryBlock.match(/function renderAiDiscoveryResults\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /c\.name \|\| 'Unbenanntes Unternehmen'/);
  assert.match(fn, /c\.address \? `<div class="muted">\$\{escapeHtml\(c\.address\)\}<\/div>` : ''/);
  assert.match(fn, /c\.category \? `<div class="muted">\$\{escapeHtml\(c\.category\)\}<\/div>` : ''/);
  assert.match(fn, /c\.website \? `<div class="muted">\$\{escapeHtml\(c\.website\)\}<\/div>` : ''/);
  assert.match(fn, /getDiscoveryDuplicateLabel\(c\.duplicateStatus\)/);
});

// ── duplicate labels (exact German wording) ──────────────────────────
test('8. duplicate status labels match the exact specified German wording', () => {
  assert.equal(getDiscoveryDuplicateLabel('NEW'), 'Neu');
  assert.equal(getDiscoveryDuplicateLabel('POSSIBLE_MATCH'), 'Möglicher Treffer');
  assert.equal(getDiscoveryDuplicateLabel('ALREADY_DRAFT'), 'Bereits als Entwurf vorhanden');
  assert.equal(getDiscoveryDuplicateLabel('ALREADY_PUBLISHED'), 'Bereits in StadtPocket');
  assert.equal(Object.keys(AI_DISCOVERY_DUPLICATE_LABELS).length, 4);
});
test('8b. an unrecognized status falls back to the "possible match" label rather than showing nothing', () => {
  assert.equal(getDiscoveryDuplicateLabel('something-unexpected'), 'Möglicher Treffer');
});

// ── NEW selected by default / duplicates unselected ───────────────────
test('9. only NEW is selected by default', () => {
  assert.equal(isDiscoveryCandidateSelectedByDefault('NEW'), true);
});
test('10. POSSIBLE_MATCH/ALREADY_DRAFT/ALREADY_PUBLISHED are never selected by default', () => {
  assert.equal(isDiscoveryCandidateSelectedByDefault('POSSIBLE_MATCH'), false);
  assert.equal(isDiscoveryCandidateSelectedByDefault('ALREADY_DRAFT'), false);
  assert.equal(isDiscoveryCandidateSelectedByDefault('ALREADY_PUBLISHED'), false);
});
test('10b. the results screen actually builds selectedSourceIds by filtering on the default-selection helper', () => {
  const fn = discoveryBlock.match(/async function submitAiDiscovery\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /isDiscoveryCandidateSelectedByDefault\(c\.duplicateStatus\)/);
});

// ── empty results ──────────────────────────────────────────────────
test('11. zero candidates renders an honest "keine Unternehmen gefunden" state, not a fabricated result', () => {
  const fn = discoveryBlock.match(/function renderAiDiscoveryResults\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /count === 0/);
  assert.match(fn, /Keine Unternehmen gefunden/);
});

// ── provider error ────────────────────────────────────────────────
test('12. provider-not-configured and provider-unavailable both produce distinct, non-null German messages', () => {
  const notConfigured = getAiDiscoveryProviderStatusMessage('provider-not-configured');
  const unavailable = getAiDiscoveryProviderStatusMessage('provider-unavailable');
  assert.notEqual(notConfigured, null);
  assert.notEqual(unavailable, null);
  assert.notEqual(notConfigured, unavailable);
});
test('12b. a normal "ok" status produces no error message', () => {
  assert.equal(getAiDiscoveryProviderStatusMessage('ok'), null);
});
test('12c. submitAiDiscovery checks the provider status and returns to the form with an error banner on failure', () => {
  const fn = discoveryBlock.match(/async function submitAiDiscovery\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /getAiDiscoveryProviderStatusMessage\(res\.body\.status\)/);
  assert.match(fn, /banner\('ai-discovery-form-error', 'error', providerMessage\)/);
});

// ── no Phase 1G call ─────────────────────────────────────────────────
test('13. discovery never calls the Phase 1G research endpoints', () => {
  assert.equal(/\/research(?!Service)/.test(discoveryBlock), false);
  assert.match(discoveryBlock, /\/manager\/stadtpocket\/listings\/\$\{currentLocationId\}\/discover/);
});

// ── no creation/publishing ────────────────────────────────────────────
test('14. discovery never calls a draft/publish/initialize endpoint', () => {
  assert.equal(/\/draft/.test(discoveryBlock), false);
  assert.equal(/\/publish/.test(discoveryBlock), false);
  assert.equal(/initializeDraft/.test(discoveryBlock), false);
});
// Phase 1H.4 connected this button (see stadtpocketAiPreparation.test.js
// for the actual preparation-pipeline behavior it triggers, including
// that draft creation still never happens automatically). It stays
// disabled with zero candidates selected -- never a bare click with
// nothing to process -- and calls submitAiDiscoveryPrep() only, never a
// draft/publish endpoint directly, when something is selected.
test('14b. "Ausgewählte Unternehmen vorbereiten" is disabled with nothing selected, and calls only submitAiDiscoveryPrep()', () => {
  const fn = discoveryBlock.match(/function renderAiDiscoveryResults\(\)\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /\$\{selectedCount === 0 \? 'disabled' : ''\}/);
  assert.match(fn, /onclick="submitAiDiscoveryPrep\(\)"/);
  assert.match(fn, /Ausgewählte Unternehmen vorbereiten/);
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
