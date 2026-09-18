// ============================================================
// stadtpocketAiExtractionService.test.js — Phase 1B (AI Business
// Onboarding). Unit tests for extractBusinessFields(). anthropicClient
// is injectable -- no real Anthropic call, no SDK dependency needed at
// test time.
//
// Run: node tests/stadtpocketAiExtractionService.test.js
// ============================================================
const assert = require('assert/strict');
const { extractBusinessFields, STATUS, sanitizeExtractedFields } = require('../src/services/stadtpocketAiExtractionService');

function fakeClient(text) {
  return { messages: { create: async () => ({ content: [{ text }] }) } };
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
