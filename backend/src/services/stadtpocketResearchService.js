/**
 * stadtpocketResearchService.js — Phase 1B (AI Business Onboarding).
 * ─────────────────────────────────────────────────────────────
 * The reusable core pipeline:
 *   ResearchRequest -> source collection -> extraction -> normalization
 *   -> provenance/evidence -> duplicate analysis -> CandidateBusiness
 *
 * This is the ONLY function the route (managerStadtpocketResearchRoutes.js)
 * calls. It never writes to the database (duplicate-check is read-only),
 * never calls initializeDraft/saveDraft, and never creates a Business,
 * BusinessLocation, offer, loyalty program, or update -- this phase
 * produces a proposal for human review only. Draft creation from an
 * approved candidate is a deliberately separate, later action (Phase 1D),
 * not part of this file.
 *
 * Designed for reuse by a single request (Phase 1, one candidate) or a
 * future bulk loop (Phase 2, many candidates) without changes: the
 * entire function takes one ResearchRequest and returns one
 * CandidateBusiness, with no state or assumption tying it to "the one
 * business a form submitted" -- a future bulk-discovery caller can call
 * this once per discovered candidate, with per-candidate failure
 * isolation already implied by this function never throwing for a
 * research-layer failure (only for a genuine input/authorization error --
 * see StadtpocketResearchError below).
 * ─────────────────────────────────────────────────────────────
 */

const { randomUUID } = require('crypto');
const { authorizeLocationAccess, StadtpocketManagerError } = require('./stadtpocketManagerService');
const { fetchBusinessWebsiteContent, STATUS: WEB_STATUS } = require('./stadtpocketWebResearchService');
const { extractBusinessFields, STATUS: AI_STATUS } = require('./stadtpocketAiExtractionService');
const { checkForDuplicateListing } = require('./stadtpocketDuplicateService');

class StadtpocketResearchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Overall deadline for the external-provider portion (website fetch +
// AI extraction) of one research request -- a second, independent
// backstop on top of Firecrawl's own 15s AbortSignal timeout and
// Anthropic's own 20s SDK timeout (neither of those two is changed
// here). Exists specifically to guarantee the HTTP response always
// returns even if some step turns out not to be bounded the way it's
// expected to be (see stadtpocketResearchUrlSafety.js's own DNS-lookup
// timeout, added for the same reason) -- generous enough to comfortably
// fit both real provider timeouts plus DNS/overhead in the normal case.
const OVERALL_RESEARCH_DEADLINE_MS = 45000;
const DEADLINE_EXCEEDED = Symbol('deadline-exceeded');

// Minimal, structured stage logging -- concise enough to distinguish
// where a request is spending its time without ever printing a secret,
// token, full scraped page, or full AI response. `requestId` correlates
// every line for one call to researchBusiness().
function logStage(requestId, stage, details = {}) {
  const parts = Object.entries(details).map(([k, v]) => `${k}=${v}`).join(' ');
  // eslint-disable-next-line no-console
  console.log(`[stadtpocket-research] requestId=${requestId} stage=${stage}${parts ? ' ' + parts : ''}`);
}

function raceWithDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE_EXCEEDED), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

const RESEARCH_STATUS = {
  OK: 'ok',
  PARTIAL: 'partial',
  NO_SOURCE: 'no-source',
  WEBSITE_REJECTED: 'website-rejected',
  WEBSITE_UNREACHABLE: 'website-unreachable',
  PROVIDER_UNAVAILABLE: 'provider-unavailable',
  MALFORMED_OUTPUT: 'malformed-output',
};

// Web-collection statuses that mean "we could not get content, but this
// is not the manager's fault" vs. "the URL itself was rejected" --
// mapped to distinct top-level research statuses so the Admin-facing
// result (and this phase's tests) can tell them apart.
const WEB_STATUS_TO_RESEARCH_STATUS = {
  [WEB_STATUS.INVALID_URL]: RESEARCH_STATUS.WEBSITE_REJECTED,
  [WEB_STATUS.UNSUPPORTED_PROTOCOL]: RESEARCH_STATUS.WEBSITE_REJECTED,
  [WEB_STATUS.PRIVATE_TARGET]: RESEARCH_STATUS.WEBSITE_REJECTED,
  [WEB_STATUS.DNS_FAILURE]: RESEARCH_STATUS.WEBSITE_UNREACHABLE,
  [WEB_STATUS.PROVIDER_UNAVAILABLE]: RESEARCH_STATUS.PROVIDER_UNAVAILABLE,
  [WEB_STATUS.UNREACHABLE]: RESEARCH_STATUS.WEBSITE_UNREACHABLE,
  [WEB_STATUS.EMPTY]: RESEARCH_STATUS.WEBSITE_UNREACHABLE,
};

const SOURCE_LABEL = 'official business website';

function withEvidence(fields, sourceUrl) {
  const evidenced = {};
  for (const [key, entry] of Object.entries(fields)) {
    evidenced[key] = { value: entry.value, confidence: entry.confidence, source: SOURCE_LABEL, sourceUrl };
  }
  return evidenced;
}

// headerImageCandidateUrl (the extraction service's field name, matching
// its own validator) is surfaced to the Admin as `headerImageCandidate`
// -- a clearly different shape/name from the trusted `headerImage`
// column (stadtpocketManagerService.js), so nothing downstream can
// confuse "a URL an AI noticed on a webpage" with "an approved,
// QRAIVY-uploaded asset." See that file's own header comment for the
// full reasoning; this is purely a rename/reshape at the boundary.
function splitHeaderImageCandidate(evidencedFields) {
  const { headerImageCandidateUrl, ...rest } = evidencedFields;
  if (!headerImageCandidateUrl) return { fields: rest, headerImageCandidate: undefined };
  return {
    fields: rest,
    headerImageCandidate: {
      value: { url: headerImageCandidateUrl.value },
      confidence: headerImageCandidateUrl.confidence,
      source: headerImageCandidateUrl.source,
      sourceUrl: headerImageCandidateUrl.sourceUrl,
    },
  };
}

function validateRequest(body) {
  const src = body || {};
  const businessName = typeof src.businessName === 'string' ? src.businessName.trim() : '';
  const websiteUrl = typeof src.websiteUrl === 'string' ? src.websiteUrl.trim() : '';
  const extra = Object.keys(src).filter((k) => !['businessName', 'websiteUrl'].includes(k));
  if (extra.length) {
    throw new StadtpocketResearchError(`Unexpected field(s): ${extra.join(', ')}.`);
  }
  if (!businessName && !websiteUrl) {
    throw new StadtpocketResearchError('At least one of businessName or websiteUrl is required.');
  }
  return { businessName: businessName || undefined, websiteUrl: websiteUrl || undefined };
}

// The external-provider portion only (website fetch + AI extraction) --
// isolated into its own function specifically so it can be raced
// against the overall deadline below without that deadline also
// covering the (fast, DB-only, never-hangs) duplicate check, which
// should always run regardless of how the provider portion turned out.
async function runWebAndExtraction(requestId, businessName, websiteUrl) {
  const webStart = Date.now();
  const webResult = await fetchBusinessWebsiteContent(websiteUrl);
  logStage(requestId, 'firecrawl', { status: webResult.status, durationMs: Date.now() - webStart });

  if (webResult.status !== WEB_STATUS.OK) {
    return { evidencedFields: {}, researchStatus: WEB_STATUS_TO_RESEARCH_STATUS[webResult.status] || RESEARCH_STATUS.WEBSITE_UNREACHABLE };
  }

  const aiStart = Date.now();
  const extraction = await extractBusinessFields({ businessName, websiteUrl: webResult.sourceUrl, siteContent: webResult.content });
  logStage(requestId, 'anthropic', { status: extraction.status, durationMs: Date.now() - aiStart });

  if (extraction.status === AI_STATUS.OK) {
    const evidencedFields = withEvidence(extraction.fields, webResult.sourceUrl);
    return { evidencedFields, researchStatus: Object.keys(evidencedFields).length ? RESEARCH_STATUS.OK : RESEARCH_STATUS.PARTIAL };
  }
  if (extraction.status === AI_STATUS.PROVIDER_UNAVAILABLE) {
    return { evidencedFields: {}, researchStatus: RESEARCH_STATUS.PROVIDER_UNAVAILABLE };
  }
  if (extraction.status === AI_STATUS.MALFORMED_OUTPUT) {
    return { evidencedFields: {}, researchStatus: RESEARCH_STATUS.MALFORMED_OUTPUT };
  }
  return { evidencedFields: {}, researchStatus: RESEARCH_STATUS.PROVIDER_UNAVAILABLE };
}

/**
 * The one entry point. `scope` is the already-resolved
 * req.stadtpocketScope (see middleware/stadtpocketManagerAuth.js) --
 * re-checked here exactly like every stadtpocketManagerService.js
 * function re-checks its own caller, never trusted merely because the
 * route matched. `requestedBy` is the caller's userId, always
 * server-derived from scope, never accepted from the request body.
 *
 * `options.deadlineMs` is injectable (defaults to
 * OVERALL_RESEARCH_DEADLINE_MS) purely so the deadline behavior is
 * directly unit-testable without a real 45s wait, matching this
 * repo's established injectable-dependency convention.
 */
async function researchBusiness(locationId, scope, body, options = {}) {
  const { deadlineMs = OVERALL_RESEARCH_DEADLINE_MS } = options;
  const requestId = randomUUID();
  const requestStart = Date.now();

  authorizeLocationAccess(locationId, scope);
  const { businessName, websiteUrl } = validateRequest(body);
  const requestedBy = scope.userId;

  logStage(requestId, 'start', { locationId, hasWebsite: !!websiteUrl });

  let evidencedFields = {};
  let researchStatus = RESEARCH_STATUS.NO_SOURCE;

  if (websiteUrl) {
    const urlSafetyStart = Date.now();
    const outcome = await raceWithDeadline(runWebAndExtraction(requestId, businessName, websiteUrl), deadlineMs);
    if (outcome === DEADLINE_EXCEEDED) {
      // The provider portion is still running in the background (this
      // does not, and cannot, forcibly cancel it -- Firecrawl's own
      // 15s AbortSignal and Anthropic's own 20s SDK timeout will still
      // conclude it on their own). This only guarantees OUR response
      // doesn't wait for that any longer. Reuses the existing
      // provider-unavailable public status -- no new public-contract
      // value, per Phase 1E's own instruction -- with a distinct
      // internal log tag for diagnosis.
      logStage(requestId, 'deadline-exceeded', { afterMs: Date.now() - urlSafetyStart });
      researchStatus = RESEARCH_STATUS.PROVIDER_UNAVAILABLE;
    } else {
      ({ evidencedFields, researchStatus } = outcome);
    }
  }

  const { fields, headerImageCandidate } = splitHeaderImageCandidate(evidencedFields);

  // Duplicate check always runs, even when research produced nothing --
  // a manager researching "Café Brettle, Ulm" with an unreachable
  // website should still learn it already exists as a draft, per the
  // Phase 1A duplicate-detection design. Deliberately NOT inside the
  // deadline race above: this is a fast, DB-only read with no external
  // provider involved, so it should never be the thing a timeout is
  // protecting against, and skipping it on a provider timeout would
  // throw away real, always-available information for no reason.
  const dupStart = Date.now();
  const duplicate = await checkForDuplicateListing({
    locationId,
    businessName: businessName || fields.name?.value,
    websiteUrl: websiteUrl || fields.website?.value,
    phone: fields.phone?.value,
    address: fields.address?.value,
  });
  logStage(requestId, 'duplicate-check', { status: duplicate.status, durationMs: Date.now() - dupStart });

  logStage(requestId, 'complete', { researchStatus, totalDurationMs: Date.now() - requestStart });

  return {
    locationId,
    requestedBy,
    input: { businessName: businessName || null, websiteUrl: websiteUrl || null },
    researchStatus,
    fields,
    headerImageCandidate: headerImageCandidate || null,
    duplicate,
  };
}

module.exports = {
  StadtpocketResearchError,
  RESEARCH_STATUS,
  researchBusiness,
  // exported for direct unit testing only
  validateRequest,
  withEvidence,
  splitHeaderImageCandidate,
};

// Re-exported for the route layer's error-handling convenience, mirroring
// stadtpocketManagerService.js's own StadtpocketManagerError being caught
// alongside this file's error type -- both are 4xx-status, message-safe
// errors, never leaking internals to the HTTP response.
module.exports.StadtpocketManagerError = StadtpocketManagerError;
