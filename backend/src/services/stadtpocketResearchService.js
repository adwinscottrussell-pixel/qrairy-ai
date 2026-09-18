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

/**
 * The one entry point. `scope` is the already-resolved
 * req.stadtpocketScope (see middleware/stadtpocketManagerAuth.js) --
 * re-checked here exactly like every stadtpocketManagerService.js
 * function re-checks its own caller, never trusted merely because the
 * route matched. `requestedBy` is the caller's userId, always
 * server-derived from scope, never accepted from the request body.
 */
async function researchBusiness(locationId, scope, body) {
  authorizeLocationAccess(locationId, scope);
  const { businessName, websiteUrl } = validateRequest(body);
  const requestedBy = scope.userId;

  let evidencedFields = {};
  let researchStatus = RESEARCH_STATUS.NO_SOURCE;

  if (websiteUrl) {
    const webResult = await fetchBusinessWebsiteContent(websiteUrl);
    if (webResult.status !== WEB_STATUS.OK) {
      researchStatus = WEB_STATUS_TO_RESEARCH_STATUS[webResult.status] || RESEARCH_STATUS.WEBSITE_UNREACHABLE;
    } else {
      const extraction = await extractBusinessFields({ businessName, websiteUrl: webResult.sourceUrl, siteContent: webResult.content });
      if (extraction.status === AI_STATUS.OK) {
        evidencedFields = withEvidence(extraction.fields, webResult.sourceUrl);
        researchStatus = Object.keys(evidencedFields).length ? RESEARCH_STATUS.OK : RESEARCH_STATUS.PARTIAL;
      } else if (extraction.status === AI_STATUS.PROVIDER_UNAVAILABLE) {
        researchStatus = RESEARCH_STATUS.PROVIDER_UNAVAILABLE;
      } else if (extraction.status === AI_STATUS.MALFORMED_OUTPUT) {
        researchStatus = RESEARCH_STATUS.MALFORMED_OUTPUT;
      } else {
        researchStatus = RESEARCH_STATUS.PROVIDER_UNAVAILABLE;
      }
    }
  }

  const { fields, headerImageCandidate } = splitHeaderImageCandidate(evidencedFields);

  // Duplicate check always runs, even when research produced nothing --
  // a manager researching "Café Brettle, Ulm" with an unreachable
  // website should still learn it already exists as a draft, per the
  // Phase 1A duplicate-detection design.
  const duplicate = await checkForDuplicateListing({
    locationId,
    businessName: businessName || fields.name?.value,
    websiteUrl: websiteUrl || fields.website?.value,
    phone: fields.phone?.value,
    address: fields.address?.value,
  });

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
