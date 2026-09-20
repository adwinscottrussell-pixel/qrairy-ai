/**
 * stadtpocketWebResearchService.js — Phase 1B (AI Business Onboarding),
 * extended Phase 1G (bounded multi-page research).
 * ─────────────────────────────────────────────────────────────
 * Isolated, hardened wrapper around Firecrawl's scrape API. This
 * deliberately does NOT reuse lpController.js's scrapeWithFirecrawl() or
 * qrController.js's scrapeBusinessSite() -- both exist and work, but
 * neither validates the target URL (see stadtpocketResearchUrlSafety.js),
 * neither sets a request timeout, and both collapse every failure to a
 * bare `null` with no distinguishable reason. StadtPocket's research
 * pipeline needs to tell "the website was unreachable" apart from "no
 * Firecrawl key configured" apart from "the URL was rejected as an
 * internal/private target" so the Admin-facing result (and this phase's
 * tests) can be honest about which one happened -- so this is its own
 * small, purpose-built service behind a narrow interface, per the
 * Phase 1A architecture decision to keep provider-specific code out of
 * stadtpocketManagerService.js and not spread across multiple
 * controllers.
 *
 * Never throws: every path resolves to a { status, ... } object. `fetchImpl`
 * is injectable (defaults to the global fetch) purely so this is
 * directly unit-testable with no real network call, matching this
 * repo's established injectable-fetch convention (see
 * stadtpocket-web/usePublishedBusiness.js for the same pattern in the
 * other repo).
 *
 * Phase 1G adds bounded, same-domain MULTI-PAGE research on top of the
 * original single-page fetchBusinessWebsiteContent() (kept fully intact
 * and still directly used/tested on its own -- nothing below changes
 * its default behavior for an existing caller). Architecture choice,
 * decided and justified here rather than left implicit:
 *
 *   Option A (chosen): fetch the homepage -> extract same-domain links
 *   from ITS OWN returned markdown -> run each selected link through
 *   the exact same fetchBusinessWebsiteContent() + full URL-safety gate
 *   (stadtpocketResearchUrlSafety.js) as the homepage, one at a time.
 *
 *   Option B (rejected): a Firecrawl crawl/map call that discovers and
 *   fetches multiple pages in one provider-side operation.
 *
 * Option A wins for one concrete reason: it keeps EVERY fetched URL
 * passing through this server's own SSRF/same-domain gate before
 * Firecrawl ever sees it, with a page count this server decides and
 * bounds itself. A crawl/map call hands page discovery AND fetching to
 * Firecrawl's own infrastructure -- this server would only learn what
 * was fetched after the fact, unable to apply stadtpocketResearchUrlSafety.js
 * per-page before the request happens, and unable to guarantee a hard
 * page-count ceiling without trusting a provider-side parameter this
 * codebase cannot verify server-side. Reusing fetchBusinessWebsiteContent()
 * per page also means zero new Firecrawl request shapes to trust --
 * every page fetch is byte-for-byte the same, already-tested call.
 * ─────────────────────────────────────────────────────────────
 */

const { validateResearchUrl } = require('./stadtpocketResearchUrlSafety');

const FIRECRAWL_TIMEOUT_MS = 15000;
// Same cap lpController.js's own scrapeWithFirecrawl() already uses for
// its markdown content -- kept identical here so this service's cost/
// token footprint per request is a known, already-accepted quantity,
// not a new number invented for this phase.
const CONTENT_CHAR_CAP = 8000;

// Phase 1G bounds -- both hard ceilings, never exceeded regardless of
// how many candidate links a site's homepage contains.
const MAX_RESEARCH_PAGES = 5; // includes the homepage itself. This
// bounds NETWORK RESEARCH COST (how many pages get fetched) -- it has
// nothing to do with how many BUSINESS LOCATIONS one of those pages may
// describe. A single Filialen/Standorte page counts as ONE page toward
// this cap no matter whether it lists 2 branches or 50.

// Phase 1G correction -- a page matched by a location/branch keyword
// (extractSameDomainLinks' tier 0: Filialen, Standorte, branches,
// stores, locations) gets a MUCH larger per-page cap than a generic
// page. Justified by live measurement, not a guess: the real Bäckerei
// Betz Filialen page (2026-09-20, read-only inspection, no draft
// created) lists 30 branches across 16 towns with full address/phone/
// hours each -- roughly 9.8K characters of plain branch-listing text
// alone, already exceeding the original single CONTENT_CHAR_CAP of
// 8000. That cap was silently truncating exactly the page most likely
// to contain the location data this phase exists to surface -- and,
// because Betz's page lists towns alphabetically, the truncation would
// have cut off the LAST-listed towns first, which happened to include
// Ulm. LOCATION_PAGE_CONTENT_CHAR_CAP gives roughly 2.4x that measured
// real-world size as headroom for a larger chain, while remaining a
// firm, finite bound (not "no limit").
const LOCATION_PAGE_CONTENT_CHAR_CAP = 24000;

// Raised from Phase 1G's original 20000 specifically so a location-tier
// page's own larger allocation (above) isn't immediately re-truncated
// the moment it's combined with the homepage and any other fetched
// pages. The location-tier page is always combined right after the
// homepage (extractSameDomainLinks sorts candidates tier-first, so a
// tier-0 URL is always fetched -- and therefore combined -- before any
// lower-priority page), so in the worst case (homepage 8000 +
// location-tier page 24000 = 32000) there is still headroom left for
// one more generic page before this cap engages; any further page
// beyond that is what gets shortened first, never the location data.
const COMBINED_CONTENT_CHAR_CAP = 40000;

const STATUS = {
  OK: 'ok',
  INVALID_URL: 'invalid-url',
  UNSUPPORTED_PROTOCOL: 'unsupported-protocol',
  PRIVATE_TARGET: 'private-target',
  DNS_FAILURE: 'dns-failure',
  PROVIDER_UNAVAILABLE: 'provider-unavailable',
  UNREACHABLE: 'unreachable',
  EMPTY: 'empty',
};

// Maps stadtpocketResearchUrlSafety's REASONS onto this service's own
// STATUS values -- kept as an explicit table (not a passthrough) so a
// future change to one module's vocabulary can't silently rename the
// other's public contract.
const URL_REJECTION_STATUS = {
  'invalid-url': STATUS.INVALID_URL,
  'unsupported-protocol': STATUS.UNSUPPORTED_PROTOCOL,
  'credentials-in-url': STATUS.INVALID_URL,
  'private-target': STATUS.PRIVATE_TARGET,
  'dns-failure': STATUS.DNS_FAILURE,
};

/**
 * Fetches and returns the scraped, size-capped text content of a
 * manager-submitted business website, via Firecrawl. Always validates
 * the URL first (fail-closed) -- Firecrawl is never called with a URL
 * that didn't pass stadtpocketResearchUrlSafety.js.
 *
 * `onlyMainContent` defaults to true, matching this function's exact
 * pre-Phase-1G behavior for any existing caller that doesn't pass it.
 * fetchBusinessWebsiteResearch() below explicitly passes `false` --
 * Phase 1F's live investigation of the real Bäckerei Betz site proved
 * onlyMainContent:true strips header/nav/footer, which is exactly where
 * that site's only homepage phone number lived (icon-only tel: links).
 * Fetching the full page trades a bounded amount of nav/footer noise
 * (still capped by CONTENT_CHAR_CAP below) for not silently discarding
 * real, load-bearing content.
 */
async function fetchBusinessWebsiteContent(rawUrl, { fetchImpl = fetch, dnsLookup, onlyMainContent = true, contentCharCap = CONTENT_CHAR_CAP } = {}) {
  const validation = await validateResearchUrl(rawUrl, dnsLookup ? { dnsLookup } : {});
  if (!validation.ok) {
    return { status: URL_REJECTION_STATUS[validation.reason] || STATUS.INVALID_URL };
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { status: STATUS.PROVIDER_UNAVAILABLE };

  let res;
  try {
    res = await fetchImpl('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: validation.url.toString(), formats: ['markdown'], onlyMainContent }),
      signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
    });
  } catch {
    return { status: STATUS.UNREACHABLE };
  }

  if (!res || !res.ok) return { status: STATUS.UNREACHABLE };

  let body;
  try {
    body = await res.json();
  } catch {
    return { status: STATUS.UNREACHABLE };
  }

  const markdown = body && body.data && typeof body.data.markdown === 'string' ? body.data.markdown.trim() : '';
  if (!markdown) return { status: STATUS.EMPTY };

  const content = markdown.slice(0, contentCharCap);
  return { status: STATUS.OK, content, truncated: markdown.length > contentCharCap, sourceUrl: validation.url.toString() };
}

// Priority tiers for same-domain link discovery -- German terms first
// (StadtPocket's primary market), English equivalents alongside each
// tier. Tier order reflects Phase 1F's own finding: per-branch address/
// phone/hours (tier 0) is the concrete, proven gap; general contact
// pages (tier 1) are the next most likely source of a phone number;
// "about us" pages (tier 2) sometimes carry a registered address;
// Impressum (tier 3) reliably has a legal address but rarely a
// storefront's hours or phone. A link matching no tier is not a
// candidate at all -- irrelevant links (Datenschutz, Karriere, blog
// posts, product pages, etc.) are ignored, never fetched.
const LINK_KEYWORD_TIERS = [
  ['filiale', 'filialen', 'standort', 'standorte', 'branch', 'branches', 'store', 'stores', 'location', 'locations'],
  ['kontakt', 'contact'],
  ['über-uns', 'ueber-uns', 'unternehmen', 'about'],
  ['impressum'],
];

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;

/**
 * Parses markdown link syntax out of already-fetched page content and
 * returns same-domain candidates only, deduplicated, sorted by tier
 * (most relevant first). Pure function -- no network call, no
 * assumption of safety beyond "same hostname as baseUrl and http(s)";
 * every returned URL is still re-validated from scratch by
 * fetchBusinessWebsiteContent()'s own call to validateResearchUrl()
 * before it is ever fetched -- appearing here never counts as trusted.
 */
function extractSameDomainLinks(markdown, baseUrl) {
  if (typeof markdown !== 'string' || !markdown) return [];
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const seen = new Set([base.toString()]);
  const candidates = [];
  let match;
  MARKDOWN_LINK_RE.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = MARKDOWN_LINK_RE.exec(markdown))) {
    const text = match[1] || '';
    const rawHref = match[2] || '';
    let resolved;
    try {
      resolved = new URL(rawHref, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    if (resolved.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue; // same-domain only, exact host match
    resolved.hash = '';
    const normalized = resolved.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const haystack = `${text} ${resolved.pathname}`.toLowerCase();
    let tier = -1;
    for (let i = 0; i < LINK_KEYWORD_TIERS.length; i += 1) {
      if (LINK_KEYWORD_TIERS[i].some((kw) => haystack.includes(kw))) {
        tier = i;
        break;
      }
    }
    if (tier === -1) continue;

    candidates.push({ url: normalized, text: text.trim(), tier });
  }

  candidates.sort((a, b) => a.tier - b.tier);
  return candidates;
}

/**
 * Picks the final ordered list of additional pages to fetch, given
 * already-scored/sorted candidates from extractSameDomainLinks() and how
 * many additional pages are still allowed (MAX_RESEARCH_PAGES - 1 in
 * practice). Pure, deterministic, no I/O. Keeps each candidate's `tier`
 * alongside its URL (not just a bare URL string) so the caller can give
 * a location/branch-tier page (tier 0) a larger content cap -- see
 * LOCATION_PAGE_CONTENT_CHAR_CAP's own comment above for why.
 */
function selectAdditionalPages(candidates, maxAdditional) {
  if (!Array.isArray(candidates) || maxAdditional <= 0) return [];
  return candidates.slice(0, maxAdditional).map((c) => ({ url: c.url, tier: c.tier }));
}

function formatPageBlock(sourceUrl, content) {
  return `SOURCE:\n${sourceUrl}\n\nCONTENT:\n${content}`;
}

/**
 * The Phase 1G entry point: bounded, same-domain, multi-page research.
 * Fetches the homepage exactly as before; on success only, discovers up
 * to (maxPages - 1) same-domain sub-pages from the homepage's own
 * content and fetches each one through the identical safety-checked
 * single-page path. A sub-page failing (unreachable, empty, rejected)
 * is skipped silently -- it never degrades or aborts a result that
 * already has a usable homepage. If the homepage itself fails, this
 * returns exactly the same failure shape fetchBusinessWebsiteContent()
 * always has -- no sub-page fetch is ever attempted without one.
 *
 * Returns { status: 'ok', content, truncated, sourceUrl, pageUrls } on
 * success (content is the combined, source-attributed evidence bundle,
 * bounded to COMBINED_CONTENT_CHAR_CAP; pageUrls lists every page that
 * actually contributed, homepage first) or the homepage's own failure
 * shape otherwise.
 */
async function fetchBusinessWebsiteResearch(rawUrl, { fetchImpl = fetch, dnsLookup, maxPages = MAX_RESEARCH_PAGES } = {}) {
  const homepage = await fetchBusinessWebsiteContent(rawUrl, { fetchImpl, dnsLookup, onlyMainContent: false });
  if (homepage.status !== STATUS.OK) return homepage;

  const pages = [{ sourceUrl: homepage.sourceUrl, content: homepage.content, truncated: !!homepage.truncated }];

  const linkCandidates = extractSameDomainLinks(homepage.content, homepage.sourceUrl);
  const additionalPages = selectAdditionalPages(linkCandidates, Math.max(0, maxPages - 1));

  for (const { url, tier } of additionalPages) {
    // Re-validated from scratch here (inside fetchBusinessWebsiteContent
    // -> validateResearchUrl) -- same-domain was already true when this
    // URL was extracted, but private-IP/DNS-rebinding/protocol checks
    // are never skipped just because a URL came from already-fetched,
    // already-trusted-enough-to-scan content. tier 0 (location/branch
    // keywords) gets the larger LOCATION_PAGE_CONTENT_CHAR_CAP -- every
    // other tier keeps the standard CONTENT_CHAR_CAP.
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchBusinessWebsiteContent(url, {
      fetchImpl,
      dnsLookup,
      onlyMainContent: false,
      contentCharCap: tier === 0 ? LOCATION_PAGE_CONTENT_CHAR_CAP : CONTENT_CHAR_CAP,
    });
    if (page.status === STATUS.OK) {
      pages.push({ sourceUrl: page.sourceUrl, content: page.content, truncated: !!page.truncated });
    }
  }

  let combined = '';
  let capTruncated = false;
  for (const page of pages) {
    const block = formatPageBlock(page.sourceUrl, page.content);
    const separator = combined ? '\n\n' : '';
    if (combined.length + separator.length + block.length > COMBINED_CONTENT_CHAR_CAP) {
      const remaining = COMBINED_CONTENT_CHAR_CAP - combined.length - separator.length;
      if (remaining > 0) combined += separator + block.slice(0, remaining);
      capTruncated = true;
      break;
    }
    combined += separator + block;
  }

  return {
    status: STATUS.OK,
    content: combined,
    truncated: capTruncated || pages.some((p) => p.truncated),
    sourceUrl: homepage.sourceUrl,
    pageUrls: pages.map((p) => p.sourceUrl),
  };
}

module.exports = {
  STATUS,
  fetchBusinessWebsiteContent,
  fetchBusinessWebsiteResearch,
  CONTENT_CHAR_CAP,
  MAX_RESEARCH_PAGES,
  LOCATION_PAGE_CONTENT_CHAR_CAP,
  COMBINED_CONTENT_CHAR_CAP,
  // exported for direct unit testing only
  extractSameDomainLinks,
  selectAdditionalPages,
};
