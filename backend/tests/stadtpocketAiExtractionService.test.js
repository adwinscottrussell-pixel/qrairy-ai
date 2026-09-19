// ============================================================
// stadtpocketAiExtractionService.test.js — Phase 1B (AI Business
// Onboarding). Unit tests for extractBusinessFields(). anthropicClient
// is injectable -- no real Anthropic call, no SDK dependency needed at
// test time.
//
// Run: node tests/stadtpocketAiExtractionService.test.js
// ============================================================
const assert = require('assert/strict');
const { extractBusinessFields, STATUS, sanitizeExtractedFields, ANTHROPIC_MODEL } = require('../src/services/stadtpocketAiExtractionService');

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

test('18. no thinking parameter is set -- the request relies on the model\'s own default behavior, nothing manually enabled here', async () => {
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
