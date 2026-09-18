// ============================================================
// stadtpocketWebResearchService.test.js — Phase 1B (AI Business
// Onboarding). Unit tests for fetchBusinessWebsiteContent(). fetchImpl
// and dnsLookup are both injectable -- no real network/DNS call.
//
// Run: node tests/stadtpocketWebResearchService.test.js
// ============================================================
const assert = require('assert/strict');
const { fetchBusinessWebsiteContent, STATUS, CONTENT_CHAR_CAP } = require('../src/services/stadtpocketWebResearchService');

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }];

function fakeFetchOk(markdown) {
  return async () => ({ ok: true, json: async () => ({ data: { markdown } }) });
}
function fakeFetchHttpError(status = 500) {
  return async () => ({ ok: false, status });
}
function fakeFetchNetworkError() {
  return async () => { throw new Error('simulated network failure'); };
}
function fakeFetchMalformedJson() {
  return async () => ({ ok: true, json: async () => { throw new Error('bad json'); } });
}

let savedKey;
function withFirecrawlKey(value) {
  savedKey = process.env.FIRECRAWL_API_KEY;
  if (value === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = value;
}
function restoreFirecrawlKey() {
  if (savedKey === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = savedKey;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. successful scrape returns capped content and the resolved source URL', async () => {
  withFirecrawlKey('test-key');
  const result = await fetchBusinessWebsiteContent('https://www.brettle-ulm.de/', {
    fetchImpl: fakeFetchOk('# Café Brettle\nWillkommen.'),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.content, '# Café Brettle\nWillkommen.');
  assert.equal(result.sourceUrl, 'https://www.brettle-ulm.de/');
  assert.equal(result.truncated, false);
});

test('2. content longer than the cap is truncated and flagged', async () => {
  withFirecrawlKey('test-key');
  const long = 'x'.repeat(CONTENT_CHAR_CAP + 500);
  const result = await fetchBusinessWebsiteContent('https://example.com/', { fetchImpl: fakeFetchOk(long), dnsLookup: PUBLIC_DNS });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.content.length, CONTENT_CHAR_CAP);
  assert.equal(result.truncated, true);
});

test('3. no FIRECRAWL_API_KEY configured -> provider-unavailable, Firecrawl never called', async () => {
  withFirecrawlKey(undefined);
  let called = false;
  const result = await fetchBusinessWebsiteContent('https://example.com/', {
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.PROVIDER_UNAVAILABLE);
  assert.equal(called, false);
});

test('4. an invalid/private URL is rejected before Firecrawl is ever called', async () => {
  let called = false;
  const result = await fetchBusinessWebsiteContent('http://169.254.169.254/latest/meta-data/', {
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  assert.equal(result.status, STATUS.PRIVATE_TARGET);
  assert.equal(called, false);
});

test('5. malformed URL -> invalid-url, Firecrawl never called', async () => {
  let called = false;
  const result = await fetchBusinessWebsiteContent('not a url', { fetchImpl: async () => { called = true; } });
  assert.equal(result.status, STATUS.INVALID_URL);
  assert.equal(called, false);
});

test('6. Firecrawl HTTP error response -> unreachable', async () => {
  withFirecrawlKey('test-key');
  const result = await fetchBusinessWebsiteContent('https://example.com/', { fetchImpl: fakeFetchHttpError(503), dnsLookup: PUBLIC_DNS });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.UNREACHABLE);
});

test('7. network-level fetch failure -> unreachable, never throws', async () => {
  withFirecrawlKey('test-key');
  const result = await fetchBusinessWebsiteContent('https://example.com/', { fetchImpl: fakeFetchNetworkError(), dnsLookup: PUBLIC_DNS });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.UNREACHABLE);
});

test('8. malformed JSON response -> unreachable, never throws', async () => {
  withFirecrawlKey('test-key');
  const result = await fetchBusinessWebsiteContent('https://example.com/', { fetchImpl: fakeFetchMalformedJson(), dnsLookup: PUBLIC_DNS });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.UNREACHABLE);
});

test('9. empty/missing markdown in an otherwise-ok response -> empty', async () => {
  withFirecrawlKey('test-key');
  const result = await fetchBusinessWebsiteContent('https://example.com/', { fetchImpl: fakeFetchOk(''), dnsLookup: PUBLIC_DNS });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.EMPTY);
});

test('10. a DNS-rebinding target is rejected exactly like a literal private IP', async () => {
  withFirecrawlKey('test-key');
  let called = false;
  const result = await fetchBusinessWebsiteContent('https://looks-public.example.com/', {
    fetchImpl: async () => { called = true; },
    dnsLookup: async () => [{ address: '127.0.0.1' }],
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.PRIVATE_TARGET);
  assert.equal(called, false);
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
