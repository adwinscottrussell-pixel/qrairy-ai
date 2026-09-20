// ============================================================
// stadtpocketWebResearchService.test.js — Phase 1B (AI Business
// Onboarding). Unit tests for fetchBusinessWebsiteContent(). fetchImpl
// and dnsLookup are both injectable -- no real network/DNS call.
//
// Run: node tests/stadtpocketWebResearchService.test.js
// ============================================================
const assert = require('assert/strict');
const {
  fetchBusinessWebsiteContent,
  fetchBusinessWebsiteResearch,
  extractSameDomainLinks,
  selectAdditionalPages,
  STATUS,
  CONTENT_CHAR_CAP,
  MAX_RESEARCH_PAGES,
  LOCATION_PAGE_CONTENT_CHAR_CAP,
  COMBINED_CONTENT_CHAR_CAP,
} = require('../src/services/stadtpocketWebResearchService');

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

// Multi-page-aware fake fetch: `mapFn(url)` returns the markdown for
// that exact URL, or null to simulate an HTTP failure for it. Also
// records every requested URL + whether onlyMainContent was set, for
// assertions on which pages were (or weren't) fetched and how.
function fakeFetchByUrl(mapFn, calls) {
  return async (endpoint, opts) => {
    const body = JSON.parse(opts.body);
    if (calls) calls.push({ url: body.url, onlyMainContent: body.onlyMainContent });
    const markdown = mapFn(body.url);
    if (markdown === null) return { ok: false, status: 500 };
    return { ok: true, json: async () => ({ data: { markdown } }) };
  };
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

// ── Phase 1G — extractSameDomainLinks ───────────────────────────
test('11. extracts a same-domain link matched by German keyword in the link text', () => {
  const md = 'Besuchen Sie unsere [Filialen](https://example.com/filialen/) für mehr Infos.';
  const links = extractSameDomainLinks(md, 'https://example.com/');
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'https://example.com/filialen/');
});

test('12. matches by URL path even when the link text does not contain a keyword', () => {
  const md = '[Mehr erfahren](https://example.com/kontakt/)';
  const links = extractSameDomainLinks(md, 'https://example.com/');
  assert.equal(links.length, 1);
});

test('13. ignores a link matching no keyword at all (irrelevant page)', () => {
  const md = '[Datenschutz](https://example.com/datenschutz/) [Karriere](https://example.com/jobs/)';
  const links = extractSameDomainLinks(md, 'https://example.com/');
  assert.equal(links.length, 0);
});

test('14. ignores a cross-domain link even if it matches a keyword', () => {
  const md = '[Kontakt](https://other-domain.com/kontakt/)';
  const links = extractSameDomainLinks(md, 'https://example.com/');
  assert.equal(links.length, 0);
});

test('15. resolves a relative href against the base URL and deduplicates repeats', () => {
  const md = '[Kontakt](/kontakt/) [Kontakt nochmal](/kontakt/) [Kontakt#formular](/kontakt/#formular)';
  const links = extractSameDomainLinks(md, 'https://example.com/');
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'https://example.com/kontakt/');
});

test('16. sorts a location/branch-tier link (Filialen) ahead of a general contact-tier link (Kontakt)', () => {
  const md = '[Kontakt](https://example.com/kontakt/) [Filialen](https://example.com/filialen/)';
  const links = extractSameDomainLinks(md, 'https://example.com/');
  assert.equal(links[0].url, 'https://example.com/filialen/');
  assert.equal(links[1].url, 'https://example.com/kontakt/');
});

test('17. an unparsable base URL yields no candidates rather than throwing', () => {
  assert.deepEqual(extractSameDomainLinks('[x](https://example.com/)', 'not a url'), []);
});

// ── Phase 1G — selectAdditionalPages ────────────────────────────
test('18. caps the selection to maxAdditional, preserving priority order and each candidate\'s tier', () => {
  const candidates = [{ url: 'a', tier: 0 }, { url: 'b', tier: 0 }, { url: 'c', tier: 1 }];
  assert.deepEqual(selectAdditionalPages(candidates, 2), [{ url: 'a', tier: 0 }, { url: 'b', tier: 0 }]);
});

test('19. maxAdditional of 0 (or less) selects nothing', () => {
  assert.deepEqual(selectAdditionalPages([{ url: 'a', tier: 0 }], 0), []);
});

// ── Phase 1G — fetchBusinessWebsiteResearch (bounded multi-page) ─
test('20. homepage failure short-circuits -- no sub-page fetch is ever attempted', async () => {
  withFirecrawlKey('test-key');
  const calls = [];
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl(() => null, calls),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.UNREACHABLE);
  assert.equal(calls.length, 1);
});

test('21. a homepage with no relevant links returns a single-page result exactly like the original single-page behavior', async () => {
  withFirecrawlKey('test-key');
  const calls = [];
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => (url === 'https://example.com/' ? '# Willkommen\n[Datenschutz](https://example.com/datenschutz/)' : null), calls),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.OK);
  assert.deepEqual(result.pageUrls, ['https://example.com/']);
  assert.equal(calls.length, 1);
});

test('22. discovers and fetches Kontakt + Filialen pages, combining all three into one source-attributed evidence bundle', async () => {
  withFirecrawlKey('test-key');
  const pages = {
    'https://example.com/': '# Betz\n[Filialen](https://example.com/filialen/) [Kontakt](https://example.com/kontakt/)',
    'https://example.com/filialen/': 'Filiale Ulm: Westerlingerstr. 49',
    'https://example.com/kontakt/': 'Tel: 0731 978000',
  };
  const calls = [];
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => pages[url] ?? null, calls),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.OK);
  assert.equal(calls.length, 3);
  assert.deepEqual(result.pageUrls, ['https://example.com/', 'https://example.com/filialen/', 'https://example.com/kontakt/']);
  assert.ok(result.content.includes('SOURCE:\nhttps://example.com/filialen/'));
  assert.ok(result.content.includes('Westerlingerstr. 49'));
  assert.ok(result.content.includes('0731 978000'));
});

test('23. never fetches more than MAX_RESEARCH_PAGES total, even with many matching links', async () => {
  withFirecrawlKey('test-key');
  const homepageMd = ['filialen', 'standorte', 'kontakt', 'ueber-uns', 'impressum']
    .map((slug) => `[${slug}](https://example.com/${slug}/)`).join(' ');
  const calls = [];
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => (url === 'https://example.com/' ? homepageMd : `content for ${url}`), calls),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.OK);
  assert.ok(calls.length <= MAX_RESEARCH_PAGES, `expected at most ${MAX_RESEARCH_PAGES} fetches, got ${calls.length}`);
});

test('24. a cross-domain link discovered in homepage content is never fetched', async () => {
  withFirecrawlKey('test-key');
  const calls = [];
  await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => (url === 'https://example.com/' ? '[Kontakt](https://evil-other-domain.com/kontakt/)' : 'should never be fetched'), calls),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(calls.length, 1);
  assert.ok(!calls.some((c) => c.url.includes('evil-other-domain.com')));
});

test('25. a sub-page rejected as a private/reserved target (DNS rebinding) is skipped, not fatal to the overall result', async () => {
  withFirecrawlKey('test-key');
  const calls = [];
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => (url === 'https://example.com/' ? '[Kontakt](https://example.com/kontakt/)' : 'unreachable in practice'), calls),
    // Homepage's own hostname resolves publicly; the sub-page fetch
    // reuses the same dnsLookup, but same-domain here means it would
    // resolve the same way -- so this test simulates the case via a
    // dnsLookup that only starts rejecting after the first (homepage)
    // call, proving a later per-page rejection doesn't abort the batch.
    dnsLookup: (() => {
      let n = 0;
      return async () => {
        n += 1;
        return n === 1 ? [{ address: '93.184.216.34' }] : [{ address: '127.0.0.1' }];
      };
    })(),
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.OK);
  assert.deepEqual(result.pageUrls, ['https://example.com/']);
});

test('26. combined content is bounded to COMBINED_CONTENT_CHAR_CAP regardless of how many pages succeed', async () => {
  withFirecrawlKey('test-key');
  const big = 'y'.repeat(CONTENT_CHAR_CAP);
  const pages = {
    'https://example.com/': `${'x'.repeat(CONTENT_CHAR_CAP)}\n[Filialen](https://example.com/filialen/) [Kontakt](https://example.com/kontakt/) [Impressum](https://example.com/impressum/)`,
    'https://example.com/filialen/': big,
    'https://example.com/kontakt/': big,
    'https://example.com/impressum/': big,
  };
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => pages[url] ?? null),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(result.status, STATUS.OK);
  assert.ok(result.content.length <= COMBINED_CONTENT_CHAR_CAP);
  assert.equal(result.truncated, true);
});

test('27. every page fetch (homepage and sub-pages) requests onlyMainContent:false', async () => {
  withFirecrawlKey('test-key');
  const calls = [];
  await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => (url === 'https://example.com/' ? '[Kontakt](https://example.com/kontakt/)' : 'kontakt content'), calls),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.onlyMainContent === false));
});

test('28. fetchBusinessWebsiteContent itself still defaults to onlyMainContent:true, unchanged for any existing caller', async () => {
  withFirecrawlKey('test-key');
  const calls = [];
  await fetchBusinessWebsiteContent('https://example.com/', { fetchImpl: fakeFetchByUrl(() => 'x', calls), dnsLookup: PUBLIC_DNS });
  restoreFirecrawlKey();
  assert.equal(calls[0].onlyMainContent, true);
});

// ── PHASE 1G CORRECTION — location-page content cap ─────────────
// Real Bäckerei Betz measurement (2026-09-20, read-only): the Filialen
// page's branch listing alone (30 branches, 16 towns) is ~9.8K
// characters -- already bigger than the original 8000-char cap. These
// tests prove a location/branch-tier page (tier 0) gets the larger
// LOCATION_PAGE_CONTENT_CHAR_CAP, never the standard one, and that this
// is unrelated to MAX_RESEARCH_PAGES (which bounds page COUNT, not the
// content of any one page).
test('29. a location-tier page (Filialen) is fetched with LOCATION_PAGE_CONTENT_CHAR_CAP, not the standard CONTENT_CHAR_CAP', async () => {
  withFirecrawlKey('test-key');
  const branchListing = 'x'.repeat(CONTENT_CHAR_CAP + 1000); // bigger than the old cap, smaller than the new one
  const pages = {
    'https://example.com/': '[Filialen](https://example.com/filialen/)',
    'https://example.com/filialen/': branchListing,
  };
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => pages[url] ?? null),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.ok(LOCATION_PAGE_CONTENT_CHAR_CAP > CONTENT_CHAR_CAP, 'sanity: the location cap must actually be larger');
  assert.ok(result.content.includes(branchListing), 'the full branch listing must survive uncut -- it exceeds the OLD cap but not the new one');
});

test('30. a non-location page (Kontakt) is still bounded by the standard CONTENT_CHAR_CAP, not the larger one', async () => {
  withFirecrawlKey('test-key');
  const big = 'y'.repeat(CONTENT_CHAR_CAP + 1000);
  const pages = {
    'https://example.com/': '[Kontakt](https://example.com/kontakt/)',
    'https://example.com/kontakt/': big,
  };
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => pages[url] ?? null),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.ok(!result.content.includes(big), 'a generic page must still be truncated at the standard cap');
});

test('31. MAX_RESEARCH_PAGES (page COUNT) is independent of a single page\'s location content -- a location page with a huge branch list still counts as exactly one page', async () => {
  withFirecrawlKey('test-key');
  const calls = [];
  const branchListing = 'x'.repeat(LOCATION_PAGE_CONTENT_CHAR_CAP - 100); // one page, near its own (larger) cap
  const pages = {
    'https://example.com/': '[Filialen](https://example.com/filialen/) [Kontakt](https://example.com/kontakt/) [Impressum](https://example.com/impressum/)',
    'https://example.com/filialen/': branchListing,
    'https://example.com/kontakt/': 'kontakt',
    'https://example.com/impressum/': 'impressum',
  };
  const result = await fetchBusinessWebsiteResearch('https://example.com/', {
    fetchImpl: fakeFetchByUrl((url) => pages[url] ?? null, calls),
    dnsLookup: PUBLIC_DNS,
  });
  restoreFirecrawlKey();
  assert.ok(calls.length <= MAX_RESEARCH_PAGES);
  assert.ok(result.content.includes(branchListing.slice(0, 100)), 'the location page\'s content (however large) is not itself reduced by the page-count cap');
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
