// ============================================================
// stadtpocketAiExtractionService.test.js — Phase 1B (AI Business
// Onboarding). Unit tests for extractBusinessFields(). anthropicClient
// is injectable -- no real Anthropic call, no SDK dependency needed at
// test time.
//
// Run: node tests/stadtpocketAiExtractionService.test.js
// ============================================================
const assert = require('assert/strict');
const { extractBusinessFields, STATUS, sanitizeExtractedFields, ANTHROPIC_MODEL, ANTHROPIC_MAX_TOKENS, buildUserMessage, looksLikeUselessImageCandidate, MAX_LOCATION_CANDIDATES } = require('../src/services/stadtpocketAiExtractionService');

// Real Anthropic responses carry a `type: 'text'` field on the text
// content block -- matched exactly here (not just `{ text }`) since
// extractBusinessFields() finds the text block by type, not position
// (see that file's own comment on why: Claude Sonnet 5's default
// adaptive thinking can add a preceding non-text block).
function fakeClient(text) {
  return { messages: { create: async () => ({ content: [{ type: 'text', text }] }) } };
}
// Simulates a response where adaptive thinking produced a `thinking`
// block BEFORE the real text block -- proves extraction finds the text
// block by type regardless of its position in the array.
function fakeClientWithThinkingBlock(text) {
  return { messages: { create: async () => ({ content: [{ type: 'thinking', thinking: 'internal reasoning, never read by this code' }, { type: 'text', text }] }) } };
}
function fakeClientThrows() {
  return { messages: { create: async () => { throw new Error('simulated provider outage'); } } };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. well-formed JSON -> structured fields with confidence retained', async () => {
  const json = JSON.stringify({
    name: { value: 'Café Brettle', confidence: 'high' },
    category: { value: 'Café', confidence: 'high' },
    phone: { value: '0731 37 860 880', confidence: 'high' },
    website: { value: 'https://www.brettle-ulm.de/', confidence: 'high' },
  });
  const result = await extractBusinessFields({ businessName: 'Café Brettle', websiteUrl: 'https://www.brettle-ulm.de/', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.name.value, 'Café Brettle');
  assert.equal(result.fields.phone.value, '0731 37 860 880');
  assert.equal(result.fields.phone.confidence, 'high');
});

test('2. markdown code-fenced JSON is stripped and still parses', async () => {
  const json = '```json\n' + JSON.stringify({ name: { value: 'Bäckerei Staib', confidence: 'high' } }) + '\n```';
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.name.value, 'Bäckerei Staib');
});

test('3. missing fields are simply absent from the result -- never fabricated', async () => {
  const json = JSON.stringify({ name: { value: 'Only Name Co', confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(Object.keys(result.fields).length, 1);
  assert.equal(result.fields.address, undefined);
  assert.equal(result.fields.coordinates, undefined);
});

test('4. an unexpected/unknown top-level key is silently ignored, never surfaced', async () => {
  const json = JSON.stringify({
    name: { value: 'X', confidence: 'high' },
    ignoreMeCompletely: { value: 'malicious or junk', confidence: 'high' },
    __proto__: { value: 'x', confidence: 'high' },
  });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.deepEqual(Object.keys(result.fields), ['name']);
});

test('5. one invalid field is dropped without discarding the other valid fields', async () => {
  const json = JSON.stringify({
    name: { value: 'Valid Name', confidence: 'high' },
    website: { value: 'not a url at all', confidence: 'high' }, // fails checkWebsite
    phone: { value: '0731 123456', confidence: 'medium' },
  });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.name.value, 'Valid Name');
  assert.equal(result.fields.website, undefined);
  assert.equal(result.fields.phone.value, '0731 123456');
});

test('6. invalid hours entries are dropped via the shared checkHours validator', async () => {
  const json = JSON.stringify({
    hours: { value: [{ day: 'NotADay', closed: true }], confidence: 'high' },
  });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.hours, undefined);
});

test('7. valid hours pass through in the exact shape checkHours expects', async () => {
  const hours = [{ day: 'Mo', closed: true }, { day: 'Di', intervals: [{ open: '09:00', close: '18:00' }] }];
  const json = JSON.stringify({ hours: { value: hours, confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.deepEqual(result.fields.hours.value, hours);
});

test('8. coordinates outside valid range are dropped, never coerced', async () => {
  const json = JSON.stringify({ coordinates: { value: { lat: 999, lng: 9.99 }, confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.coordinates, undefined);
});

test('9. a plausible headerImageCandidateUrl passes; a malformed one is dropped', async () => {
  const jsonOk = JSON.stringify({ headerImageCandidateUrl: { value: 'https://www.brettle-ulm.de/hero.jpg', confidence: 'medium' } });
  const ok = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(jsonOk) });
  assert.equal(ok.fields.headerImageCandidateUrl.value, 'https://www.brettle-ulm.de/hero.jpg');

  const jsonBad = JSON.stringify({ headerImageCandidateUrl: { value: 'not a url', confidence: 'medium' } });
  const bad = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(jsonBad) });
  assert.equal(bad.fields.headerImageCandidateUrl, undefined);
});

test('10. an invalid confidence value defaults to "low" rather than being trusted as-is', async () => {
  const json = JSON.stringify({ name: { value: 'X', confidence: 'absolutely certain' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.fields.name.confidence, 'low');
});

test('11. malformed (unparseable) JSON output -> malformed-output, empty fields, never throws', async () => {
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient('not json at all {{{') });
  assert.equal(result.status, STATUS.MALFORMED_OUTPUT);
  assert.deepEqual(result.fields, {});
});

test('12. a non-object/array JSON payload -> sanitizeExtractedFields returns {}, never throws', () => {
  assert.deepEqual(sanitizeExtractedFields(null), {});
  assert.deepEqual(sanitizeExtractedFields('a string'), {});
  assert.deepEqual(sanitizeExtractedFields([1, 2, 3]), {});
});

test('13. provider call throwing (timeout/outage) -> unavailable, never throws out', async () => {
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClientThrows() });
  assert.equal(result.status, STATUS.UNAVAILABLE);
  assert.deepEqual(result.fields, {});
});

test('14. no API key AND no injected client -> provider-unavailable, provider never actually called', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x' });
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  assert.equal(result.status, STATUS.PROVIDER_UNAVAILABLE);
});

// ── Phase 1E follow-up — Claude Sonnet 5 model migration ─────────
// Captures the exact request object passed to messages.create() so the
// tests below can assert on model/params directly, not just the
// resulting extraction outcome.
function fakeClientCapturing(text) {
  const calls = [];
  const client = {
    messages: {
      create: async (request) => {
        calls.push(request);
        return { content: [{ type: 'text', text }] };
      },
    },
  };
  return { client, calls };
}

test('15. the request uses claude-sonnet-5, matching the exported ANTHROPIC_MODEL constant', () => {
  assert.equal(ANTHROPIC_MODEL, 'claude-sonnet-5');
});

test('16. the stale claude-sonnet-4-20250514 model ID is never sent', async () => {
  const { client, calls } = fakeClientCapturing(JSON.stringify({ name: { value: 'x', confidence: 'high' } }));
  await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: client });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-sonnet-5');
  assert.notEqual(calls[0].model, 'claude-sonnet-4-20250514');
});

test('17. no incompatible non-default sampling parameters (temperature/top_p/top_k) are ever sent', async () => {
  const { client, calls } = fakeClientCapturing(JSON.stringify({ name: { value: 'x', confidence: 'high' } }));
  await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: client });
  assert.equal('temperature' in calls[0], false);
  assert.equal('top_p' in calls[0], false);
  assert.equal('top_k' in calls[0], false);
});

test('18. no thinking parameter is set -- per the installed SDK\'s own types, thinking is opt-in and stays off, matching this extraction task\'s need for predictable structured output', async () => {
  const { client, calls } = fakeClientCapturing(JSON.stringify({ name: { value: 'x', confidence: 'high' } }));
  await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: client });
  assert.equal('thinking' in calls[0], false);
});

test('19. structured extraction still works when a preceding "thinking" content block is present (adaptive thinking response shape)', async () => {
  const json = JSON.stringify({ name: { value: 'Bäckerei Betz', confidence: 'high' }, phone: { value: '0731 000000', confidence: 'medium' } });
  const result = await extractBusinessFields({ businessName: 'Bäckerei Betz', websiteUrl: 'https://baeckerei-betz.com/', siteContent: 'x', anthropicClient: fakeClientWithThinkingBlock(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.name.value, 'Bäckerei Betz');
  assert.equal(result.fields.phone.value, '0731 000000');
});

test('20. a response consisting ONLY of a thinking block (no text block at all) -> malformed-output, never throws', async () => {
  const client = { messages: { create: async () => ({ content: [{ type: 'thinking', thinking: 'no text block follows' }] }) } };
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: client });
  assert.equal(result.status, STATUS.MALFORMED_OUTPUT);
  assert.deepEqual(result.fields, {});
});

// ── Phase 1G — "locations" field validation ─────────────────────
test('21. a well-formed multi-location array is retained with sourceUrl per entry', async () => {
  const json = JSON.stringify({
    locations: {
      value: [
        { name: 'Westerlingerstraße', address: 'Westerlingerstr. 49, 89073 Ulm', phone: '0731 111111', sourceUrl: 'https://betz.de/filialen/' },
        { name: 'Haslacherweg', address: 'Haslacherweg 59, 89075 Ulm', sourceUrl: 'https://betz.de/filialen/' },
      ],
      confidence: 'high',
    },
  });
  const result = await extractBusinessFields({ businessName: 'Betz', websiteUrl: 'https://betz.de/', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.locations.value.length, 2);
  assert.equal(result.fields.locations.value[0].address, 'Westerlingerstr. 49, 89073 Ulm');
  assert.equal(result.fields.locations.value[1].sourceUrl, 'https://betz.de/filialen/');
});

test('22. a location entry missing an address is dropped; siblings with a real address survive', async () => {
  const json = JSON.stringify({
    locations: { value: [{ address: 'Echte Str. 1, Ulm' }, { name: 'ohne Adresse' }], confidence: 'medium' },
  });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.fields.locations.value.length, 1);
  assert.equal(result.fields.locations.value[0].address, 'Echte Str. 1, Ulm');
});

test('23. if every location entry is malformed, the whole "locations" field is dropped rather than kept empty', async () => {
  const json = JSON.stringify({
    name: { value: 'x', confidence: 'high' },
    locations: { value: [{ name: 'nur ein Name, keine Adresse' }], confidence: 'low' },
  });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal('locations' in result.fields, false);
  assert.equal(result.fields.name.value, 'x'); // sibling field unaffected
});

test('24. "locations" that is not an array at all is dropped, never coerced', async () => {
  const json = JSON.stringify({ locations: { value: 'not an array', confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal('locations' in result.fields, false);
});

test('25. malformed hours within one location entry are dropped for that entry only, address/phone survive', async () => {
  const json = JSON.stringify({
    locations: { value: [{ address: 'Str. 1', phone: '0731 1', hours: 'not-an-array' }], confidence: 'high' },
  });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  const loc = result.fields.locations.value[0];
  assert.equal(loc.address, 'Str. 1');
  assert.equal(loc.phone, '0731 1');
  assert.equal('hours' in loc, false);
});

test('30b. a location entry\'s optional "city" and "postalCode" are retained verbatim', async () => {
  const json = JSON.stringify({
    locations: {
      value: [
        { address: 'Westerlingerstr. 49, 89073 Ulm', city: 'Ulm', postalCode: '89073' },
        { address: 'Carl-Zeiss-Str. 1, 89231 Neu-Ulm', city: 'Neu-Ulm', postalCode: '89231' },
      ],
      confidence: 'high',
    },
  });
  const result = await extractBusinessFields({ businessName: 'Betz', websiteUrl: 'https://betz.de/', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.fields.locations.value[0].city, 'Ulm');
  assert.equal(result.fields.locations.value[0].postalCode, '89073');
  assert.equal(result.fields.locations.value[1].city, 'Neu-Ulm');
});

// ── PHASE 1G CORRECTION — real Bäckerei Betz has 30 branches; prove
// none of that is silently limited to 2 or 5, and that a defensive cap
// only ever engages far above that, with an explicit, honest flag. ───
test('30c. 30 real-shaped location entries (the actual Bäckerei Betz count) all survive -- nothing here reduces them to 2 or 5', async () => {
  const thirty = Array.from({ length: 30 }, (_, i) => ({ address: `Straße ${i}, Stadt ${i}`, city: i < 8 ? 'Ulm' : `Stadt ${i}` }));
  const json = JSON.stringify({ locations: { value: thirty, confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'Betz', websiteUrl: 'https://betz.de/', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.fields.locations.value.length, 30);
  assert.equal('locationsTruncated' in result.fields, false);
});

test('30d. more than MAX_LOCATION_CANDIDATES entries are capped, with an explicit locationsTruncated flag -- never silently discarded without a trace', async () => {
  const many = Array.from({ length: MAX_LOCATION_CANDIDATES + 20 }, (_, i) => ({ address: `Straße ${i}, Stadt ${i}` }));
  const json = JSON.stringify({ locations: { value: many, confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.fields.locations.value.length, MAX_LOCATION_CANDIDATES);
  assert.equal(result.fields.locationsTruncated.value, true);
});

test('30e. exactly MAX_LOCATION_CANDIDATES entries are not flagged as truncated (the cap is inclusive)', async () => {
  const exact = Array.from({ length: MAX_LOCATION_CANDIDATES }, (_, i) => ({ address: `Straße ${i}, Stadt ${i}` }));
  const json = JSON.stringify({ locations: { value: exact, confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.fields.locations.value.length, MAX_LOCATION_CANDIDATES);
  assert.equal('locationsTruncated' in result.fields, false);
});

test('30f. buildUserMessage no longer suggests filtering by relevance -- it instructs the model to include every location regardless of the requested city', () => {
  const msg = buildUserMessage('Betz', 'https://betz.de', 'content', 'Ulm');
  assert.ok(msg.includes('include EVERY one of them in "locations" regardless of city'));
  assert.ok(!msg.toLowerCase().includes('help identify which'));
});

// ── PHASE 1G.2 — Sonnet output budget fix (real Bäckerei Betz staging
// failure: 1500-token cap left no room for a real multi-location
// response, response came back with no usable text block at all) ──
function makeLocation(i) {
  return {
    name: `Filiale ${i}`,
    address: `Musterstraße ${i}, 89${String(i).padStart(3, '0')} Ulm`,
    city: 'Ulm',
    postalCode: `89${String(i).padStart(3, '0')}`,
    phone: `0731 97800${i % 10}`,
    hours: [
      { day: 'Mo', intervals: [{ open: '06:30', close: '18:30' }] },
      { day: 'Di', intervals: [{ open: '06:30', close: '18:30' }] },
      { day: 'Mi', intervals: [{ open: '06:30', close: '18:30' }] },
      { day: 'Do', intervals: [{ open: '06:30', close: '18:30' }] },
      { day: 'Fr', intervals: [{ open: '06:30', close: '18:30' }] },
      { day: 'Sa', intervals: [{ open: '07:00', close: '14:00' }] },
      { day: 'So', closed: true },
    ],
    sourceUrl: 'https://baeckerei-betz.com/filialen/',
  };
}

test('31. the Sonnet request uses the new, larger ANTHROPIC_MAX_TOKENS value', async () => {
  let capturedRequest = null;
  const client = { messages: { create: async (req) => { capturedRequest = req; return { content: [{ type: 'text', text: '{}' }] }; } } };
  await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: client });
  assert.equal(capturedRequest.max_tokens, ANTHROPIC_MAX_TOKENS);
  assert.ok(ANTHROPIC_MAX_TOKENS > 1500, 'must be raised above the old, too-small value');
});

test('32. a full 30-location response (real Betz shape, full weekly hours) parses successfully -- the exact case that failed on staging', async () => {
  const thirty = Array.from({ length: 30 }, (_, i) => makeLocation(i));
  const json = JSON.stringify({
    name: { value: 'Bäckerei Betz', confidence: 'high' },
    category: { value: 'Bäckerei', confidence: 'high' },
    shortDescription: { value: 'Traditionsbäckerei mit über 30 Filialen in und um Ulm.', confidence: 'medium' },
    locations: { value: thirty, confidence: 'high' },
  });
  const result = await extractBusinessFields({ businessName: 'Bäckerei Betz', websiteUrl: 'https://baeckerei-betz.com/', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.locations.value.length, 30);
  assert.equal(result.fields.locations.value[0].address, 'Musterstraße 0, 89000 Ulm');
});

test('33. a full 50-location response (the application-side ceiling) parses successfully and is not flagged as truncated', async () => {
  const fifty = Array.from({ length: 50 }, (_, i) => makeLocation(i));
  const json = JSON.stringify({ locations: { value: fifty, confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.locations.value.length, 50);
  assert.equal('locationsTruncated' in result.fields, false);
});

test('34. stop_reason/usage diagnostic metadata on the response never affects parsing -- extra, unknown top-level response fields are simply ignored', async () => {
  const client = {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ name: { value: 'x', confidence: 'high' } }) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1234, output_tokens: 56 },
      }),
    },
  };
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: client });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.fields.name.value, 'x');
});

test('35. the response missing stop_reason/usage entirely (older/mocked shapes) still parses normally -- diagnostic logging never throws on absent metadata', async () => {
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: 'x', anthropicClient: fakeClient(JSON.stringify({ name: { value: 'x', confidence: 'high' } })) });
  assert.equal(result.status, STATUS.OK);
});

test('36. the new diagnostic log line never includes the scraped website content or the model\'s generated JSON text -- structural metadata only', async () => {
  const secretEvidence = 'SECRET-SCRAPED-CONTENT-MARKER-89073-Ulm-vertraulich';
  const generatedJsonMarker = 'GENERATED-JSON-TEXT-MARKER';
  const json = JSON.stringify({ name: { value: generatedJsonMarker, confidence: 'high' } });
  const originalLog = console.log;
  const capturedLines = [];
  console.log = (...args) => { capturedLines.push(args.join(' ')); };
  try {
    await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://x.de', siteContent: secretEvidence, anthropicClient: fakeClient(json) });
  } finally {
    console.log = originalLog;
  }
  const diagnosticLine = capturedLines.find((l) => l.includes('[stadtpocketAiExtractionService] response'));
  assert.ok(diagnosticLine, 'expected the diagnostic line to be logged');
  assert.ok(!diagnosticLine.includes(secretEvidence), 'scraped evidence must never appear in diagnostic logs');
  assert.ok(!diagnosticLine.includes(generatedJsonMarker), 'the model\'s generated JSON/business data must never appear in diagnostic logs');
  assert.ok(diagnosticLine.includes('stopReason=') && diagnosticLine.includes('blockTypes=') && diagnosticLine.includes('hasText=') && diagnosticLine.includes('textLength='), 'expected only structural metadata fields');
});

// ── Phase 1G — image-candidate junk filtering ───────────────────
test('26. a favicon URL is rejected as a header image candidate', async () => {
  const json = JSON.stringify({ headerImageCandidateUrl: { value: 'https://betz.de/cropped-favicon-180x180.jpg', confidence: 'high' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://betz.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal('headerImageCandidateUrl' in result.fields, false);
});

test('27. a plausible hero/storefront photo URL is accepted', async () => {
  const json = JSON.stringify({ headerImageCandidateUrl: { value: 'https://betz.de/wp-content/uploads/laden-aussenansicht.jpg', confidence: 'medium' } });
  const result = await extractBusinessFields({ businessName: 'x', websiteUrl: 'https://betz.de', siteContent: 'x', anthropicClient: fakeClient(json) });
  assert.equal(result.fields.headerImageCandidateUrl.value, 'https://betz.de/wp-content/uploads/laden-aussenansicht.jpg');
});

test('28. looksLikeUselessImageCandidate directly: icon-size suffix, spacer, and placeholder patterns are all rejected', () => {
  assert.equal(looksLikeUselessImageCandidate('https://x.de/img/icon-32x32.png'), true);
  assert.equal(looksLikeUselessImageCandidate('https://x.de/img/spacer.gif'), true);
  assert.equal(looksLikeUselessImageCandidate('https://x.de/img/placeholder.jpg'), true);
  assert.equal(looksLikeUselessImageCandidate('https://x.de/img/laden-vorne.jpg'), false);
});

test('29. looksLikeUselessImageCandidate treats an unparsable URL as useless (fail-closed)', () => {
  assert.equal(looksLikeUselessImageCandidate('not a url'), true);
});

// ── Phase 1G — city context passed through to the model ─────────
test('30. buildUserMessage includes the city context line only when one is provided', () => {
  const withCity = buildUserMessage('Betz', 'https://betz.de', 'content', 'Ulm');
  assert.ok(withCity.includes('StadtPocket city "Ulm"'));
  const withoutCity = buildUserMessage('Betz', 'https://betz.de', 'content');
  assert.ok(!withoutCity.includes('StadtPocket city'));
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
