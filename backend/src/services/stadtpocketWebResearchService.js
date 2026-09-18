/**
 * stadtpocketWebResearchService.js — Phase 1B (AI Business Onboarding).
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
 * ─────────────────────────────────────────────────────────────
 */

const { validateResearchUrl } = require('./stadtpocketResearchUrlSafety');

const FIRECRAWL_TIMEOUT_MS = 15000;
// Same cap lpController.js's own scrapeWithFirecrawl() already uses for
// its markdown content -- kept identical here so this service's cost/
// token footprint per request is a known, already-accepted quantity,
// not a new number invented for this phase.
const CONTENT_CHAR_CAP = 8000;

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
 */
async function fetchBusinessWebsiteContent(rawUrl, { fetchImpl = fetch, dnsLookup } = {}) {
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
      body: JSON.stringify({ url: validation.url.toString(), formats: ['markdown'], onlyMainContent: true }),
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

  const content = markdown.slice(0, CONTENT_CHAR_CAP);
  return { status: STATUS.OK, content, truncated: markdown.length > CONTENT_CHAR_CAP, sourceUrl: validation.url.toString() };
}

module.exports = {
  STATUS,
  fetchBusinessWebsiteContent,
  CONTENT_CHAR_CAP,
};
