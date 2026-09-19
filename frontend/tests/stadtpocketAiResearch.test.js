// ============================================================
// stadtpocketAiResearch.test.js — Phase 1C (AI Business Onboarding).
// Unit tests for frontend/public/js/stadtpocket-ai-research.js -- the
// pure presentation-logic helpers behind the "Mit KI hinzufügen" review
// screen. Same plain assert + custom runner convention as every backend
// test in this repo (backend/tests/*.test.js) -- no test framework
// dependency, since this repo has none for its frontend either.
//
// This covers the pure logic only (label translation, hours formatting,
// input validation, request-body building, candidate-to-editable
// transform) -- not DOM rendering or the api()/fetch wiring inside
// stadtpocket-admin.html itself, which has no test harness in this repo
// (no bundler, no jsdom dependency) and was verified by local visual
// review instead (see the Phase 1C report).
//
// Run: node frontend/tests/stadtpocketAiResearch.test.js
// ============================================================
const assert = require('assert/strict');
const {
  translateConfidence,
  getResearchStatusMessage,
  getDuplicateStatusUI,
  isDuplicateBlocking,
  AI_FIELD_DISPLAY_ORDER,
  formatHoursForDisplay,
  validateAiResearchInput,
  buildAiResearchRequestBody,
  extractEditableFieldsFromCandidate,
} = require('../public/js/stadtpocket-ai-research');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── confidence translation ──────────────────────────────────────
test('1. high/medium/low translate to the exact German labels', () => {
  assert.equal(translateConfidence('high'), 'Hoch');
  assert.equal(translateConfidence('medium'), 'Mittel');
  assert.equal(translateConfidence('low'), 'Niedrig');
});
test('2. an unrecognized confidence value defaults to Niedrig, never crashes', () => {
  assert.equal(translateConfidence('unexpected'), 'Niedrig');
  assert.equal(translateConfidence(undefined), 'Niedrig');
});

// ── research status messages ────────────────────────────────────
test('3. every non-ok research status has an honest German message', () => {
  for (const status of ['partial', 'no-source', 'website-rejected', 'website-unreachable', 'provider-unavailable', 'malformed-output']) {
    const msg = getResearchStatusMessage(status);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0);
  }
});
test('4. "ok" has no message -- no warning banner for a fully successful research', () => {
  assert.equal(getResearchStatusMessage('ok'), null);
});
test('5. an unrecognized status has no message rather than a fabricated one', () => {
  assert.equal(getResearchStatusMessage('totally-unknown-status'), null);
});

// ── duplicate status UI ─────────────────────────────────────────
test('6. NEW renders as a success, everything else as a visible warning', () => {
  assert.equal(getDuplicateStatusUI('NEW').type, 'success');
  assert.equal(getDuplicateStatusUI('POSSIBLE_MATCH').type, 'error');
  assert.equal(getDuplicateStatusUI('ALREADY_DRAFT').type, 'error');
  assert.equal(getDuplicateStatusUI('ALREADY_PUBLISHED').type, 'error');
});
test('7. exact required message text for ALREADY_DRAFT / ALREADY_PUBLISHED', () => {
  assert.equal(getDuplicateStatusUI('ALREADY_DRAFT').message, 'Dieses Unternehmen scheint bereits als Entwurf vorhanden zu sein.');
  assert.equal(getDuplicateStatusUI('ALREADY_PUBLISHED').message, 'Dieses Unternehmen scheint bereits veröffentlicht zu sein.');
});
test('8. only ALREADY_DRAFT/ALREADY_PUBLISHED block a future create-draft action', () => {
  assert.equal(isDuplicateBlocking('NEW'), false);
  assert.equal(isDuplicateBlocking('POSSIBLE_MATCH'), false);
  assert.equal(isDuplicateBlocking('ALREADY_DRAFT'), true);
  assert.equal(isDuplicateBlocking('ALREADY_PUBLISHED'), true);
});

// ── field display order/labels ──────────────────────────────────
test('9. every field the backend can return has a German label, none invented', () => {
  const keys = AI_FIELD_DISPLAY_ORDER.map(([k]) => k);
  assert.deepEqual(keys, ['name', 'category', 'subCategory', 'tags', 'shortDescription', 'longDescription', 'address', 'phone', 'website', 'hours', 'coordinates']);
  // headerImageCandidateUrl must never appear in this list -- it is
  // rendered as a separate, clearly-labeled candidate section instead.
  assert.ok(!keys.includes('headerImageCandidateUrl'));
});

// ── hours formatting ────────────────────────────────────────────
test('10. the exact brief example: Di–Fr range, Sa alone, Mo+So combined as closed', () => {
  const hours = [
    { day: 'Mo', closed: true },
    { day: 'Di', intervals: [{ open: '11:30', close: '23:00' }] },
    { day: 'Mi', intervals: [{ open: '11:30', close: '23:00' }] },
    { day: 'Do', intervals: [{ open: '11:30', close: '23:00' }] },
    { day: 'Fr', intervals: [{ open: '11:30', close: '23:00' }] },
    { day: 'Sa', intervals: [{ open: '09:30', close: '23:00' }] },
    { day: 'So', closed: true },
  ];
  assert.deepEqual(formatHoursForDisplay(hours), [
    'Dienstag–Freitag 11:30–23:00',
    'Samstag 09:30–23:00',
    'Montag/Sonntag geschlossen',
  ]);
});
test('11. a single open day with no neighbors renders alone, not as a false range', () => {
  const hours = [{ day: 'Mi', intervals: [{ open: '10:00', close: '18:00' }] }];
  assert.deepEqual(formatHoursForDisplay(hours), ['Mittwoch 10:00–18:00']);
});
test('12. an unconfirmed/absent day is simply not rendered -- never guessed', () => {
  const hours = [{ day: 'Mo', intervals: [{ open: '09:00', close: '17:00' }] }];
  const lines = formatHoursForDisplay(hours);
  assert.equal(lines.length, 1);
  assert.ok(!lines.some((l) => l.includes('Dienstag')));
});
test('13. a split-shift day (two intervals) renders both, comma-separated', () => {
  const hours = [{ day: 'Do', intervals: [{ open: '08:00', close: '12:00' }, { open: '14:00', close: '18:00' }] }];
  assert.deepEqual(formatHoursForDisplay(hours), ['Donnerstag 08:00–12:00, 14:00–18:00']);
});
test('14. empty/missing hours -> empty array, never throws', () => {
  assert.deepEqual(formatHoursForDisplay([]), []);
  assert.deepEqual(formatHoursForDisplay(undefined), []);
  assert.deepEqual(formatHoursForDisplay(null), []);
});

// ── input validation ────────────────────────────────────────────
test('15. neither name nor URL -> invalid, with an honest German error', () => {
  const result = validateAiResearchInput('', '');
  assert.equal(result.valid, false);
  assert.ok(result.error.length > 0);
});
test('16. name only, or URL only, is valid -- matches the backend contract exactly', () => {
  assert.equal(validateAiResearchInput('Café Brettle', '').valid, true);
  assert.equal(validateAiResearchInput('', 'https://www.brettle-ulm.de/').valid, true);
});
test('17. whitespace-only input is treated as empty, not valid', () => {
  assert.equal(validateAiResearchInput('   ', '   ').valid, false);
});

// ── request body building ───────────────────────────────────────
test('18. builds a trimmed body with only the provided fields, requestedBy never included', () => {
  const body = buildAiResearchRequestBody('  Café Brettle  ', '  https://www.brettle-ulm.de/  ');
  assert.deepEqual(body, { businessName: 'Café Brettle', websiteUrl: 'https://www.brettle-ulm.de/' });
  assert.equal('requestedBy' in body, false);
});
test('19. an empty field is OMITTED entirely, never sent as an empty string', () => {
  const body = buildAiResearchRequestBody('Café Brettle', '');
  assert.deepEqual(body, { businessName: 'Café Brettle' });
  assert.equal('websiteUrl' in body, false);
});

// ── candidate -> editable transform ─────────────────────────────
test('20. only fields actually present in the candidate become editable -- nothing fabricated', () => {
  const candidate = { fields: { name: { value: 'Café Brettle', confidence: 'high' } } };
  const editable = extractEditableFieldsFromCandidate(candidate);
  assert.deepEqual(Object.keys(editable), ['name']);
  assert.equal(editable.name, 'Café Brettle');
});
test('21. tags become a comma-joined editable string', () => {
  const candidate = { fields: { tags: { value: ['Café', 'Frühstück'], confidence: 'medium' } } };
  const editable = extractEditableFieldsFromCandidate(candidate);
  assert.equal(editable.tags, 'Café, Frühstück');
});
test('22. hours become the same human-readable lines as the review screen shows', () => {
  const candidate = { fields: { hours: { value: [{ day: 'Mo', intervals: [{ open: '09:00', close: '18:00' }] }], confidence: 'high' } } };
  const editable = extractEditableFieldsFromCandidate(candidate);
  assert.equal(editable.hours, 'Montag 09:00–18:00');
});
test('23. coordinates render as "lat, lng"', () => {
  const candidate = { fields: { coordinates: { value: { lat: 48.4, lng: 9.99 }, confidence: 'high' } } };
  const editable = extractEditableFieldsFromCandidate(candidate);
  assert.equal(editable.coordinates, '48.4, 9.99');
});
test('24. an empty candidate (no fields at all) -> an empty editable object, never throws', () => {
  assert.deepEqual(extractEditableFieldsFromCandidate({ fields: {} }), {});
  assert.deepEqual(extractEditableFieldsFromCandidate({}), {});
  assert.deepEqual(extractEditableFieldsFromCandidate(null), {});
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
