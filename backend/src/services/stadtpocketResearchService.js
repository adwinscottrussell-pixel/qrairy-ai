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
const prisma = require('../utils/prismaClient');
const { authorizeLocationAccess, StadtpocketManagerError } = require('./stadtpocketManagerService');
const { fetchBusinessWebsiteResearch, STATUS: WEB_STATUS } = require('./stadtpocketWebResearchService');
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
// Anthropic's own per-attempt SDK timeout (stadtpocketAiExtractionService.js's
// ANTHROPIC_TIMEOUT_MS). Exists specifically to guarantee the HTTP
// response always returns even if some step turns out not to be
// bounded the way it's expected to be (see
// stadtpocketResearchUrlSafety.js's own DNS-lookup timeout, added for
// the same reason).
//
// Phase 1G.3 -- raised from 45000 alongside ANTHROPIC_TIMEOUT_MS's own
// increase to 60000 (see that constant's comment for the full real-
// staging-failure reasoning): the old 45s no longer comfortably fits a
// single legitimate 60s Anthropic attempt. 70000 = 60000 (the new
// single-attempt Anthropic ceiling; Phase 1G.3 also set the SDK's own
// maxRetries to 0, so this is now genuinely the ceiling, not a
// multiplied one) + ~10000 coordination margin for Firecrawl/DNS/
// overhead in the normal case -- an initial, deliberately bounded value
// for real-world validation, not claimed as permanently tuned.
//
// Also as of Phase 1G.3, this deadline is no longer purely advisory:
// when it wins the race below, researchBusiness() actively cancels the
// still-running Anthropic call via an AbortController rather than only
// abandoning its own wait for it -- see runWebAndExtraction's `signal`
// parameter and researchBusiness's own call site.
const OVERALL_RESEARCH_DEADLINE_MS = 70000;
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

// Phase 1G correction -- exact match only (never .includes()/substring):
// "Ulm" must never match "Neu-Ulm" just because one contains the other.
// Also strips a leading German postal code ("89073 Ulm" -> "Ulm") in
// case a location's "city" field ever carries one despite the
// extraction prompt asking for the city name alone -- defensive, not
// something this system relies on the model getting wrong on purpose.
function normalizeCityName(value) {
  return typeof value === 'string' ? value.trim().replace(/^\d{4,5}\s+/, '').toLowerCase() : '';
}

function shapeLocationCandidate(loc, generalSourceUrl) {
  return {
    name: loc.name || null,
    address: loc.address,
    phone: loc.phone || null,
    hours: loc.hours || null,
    city: loc.city || null,
    postalCode: loc.postalCode || null,
    sourceUrl: loc.sourceUrl || generalSourceUrl,
  };
}

function foldSingleLocationIntoFields(rest, locationsMeta, only, generalSourceUrl) {
  const merged = { ...rest };
  const sourceUrl = only.sourceUrl || generalSourceUrl;
  if (!merged.address) merged.address = { value: only.address, confidence: locationsMeta.confidence, source: locationsMeta.source, sourceUrl };
  if (only.phone && !merged.phone) merged.phone = { value: only.phone, confidence: locationsMeta.confidence, source: locationsMeta.source, sourceUrl };
  if (only.hours && !merged.hours) merged.hours = { value: only.hours, confidence: locationsMeta.confidence, source: locationsMeta.source, sourceUrl };
  return merged;
}

// Phase 1G, corrected -- pulls the optional "locations" signal out of
// the evidenced field set and decides what the Admin sees. Backwards
// compatible by construction: a business with no "locations" key (the
// overwhelming majority, and every pre-Phase-1G behavior) is untouched
// here -- `fields` passes through exactly as it always has.
//
// DISCOVERY is never limited here: every entry Claude returned (already
// capped, if at all, far upstream by stadtpocketAiExtractionService.js's
// own MAX_LOCATION_CANDIDATES safety ceiling -- see that file) survives
// into `totalLocationsDiscovered`. A real Bäckerei Betz research call
// discovers all ~30 branches, not 2 and not 5 -- MAX_RESEARCH_PAGES
// (stadtpocketWebResearchService.js) bounds how many PAGES are fetched,
// never how many locations one page may describe.
//
// CITY-RELEVANCE FILTERING happens entirely HERE, in this server's own
// code, by exact (case-insensitive) comparison of each candidate's own
// `city` field against the manager's authorized StadtPocket city name
// (`cityContext`) -- never left to the model's own judgment (the
// extraction prompt explicitly tells it to include every location
// regardless of city; see that file's own header comment for why).
// "Ulm" and "Neu-Ulm" are different strings and are never conflated.
//
// Exactly ONE city-relevant entry is treated the same as a normal
// single-location result: folded into the top-level address/phone/hours
// fields (this also covers the plain "totalLocationsDiscovered === 1"
// case, where there is nothing to filter by city at all -- unchanged
// from Phase 1G's original behavior).
//
// TWO OR MORE city-relevant entries is the real multi-location case:
// multipleLocationsDetected becomes true, only the CITY-RELEVANT
// candidates are returned for the Admin to choose from (not all ~30),
// and the top-level address/phone/hours fields are left absent -- never
// auto-filled from any one candidate. No code path here may ever choose
// a branch, or a city, on the Admin's behalf.
//
// ZERO city-relevant entries among two-or-more discovered (or an
// unresolvable cityContext) is reported as `noMatchingCityLocation:
// true` -- an honest "we found several locations but none we could
// confirm for your city" signal, never a silent fallback to the
// nearest-looking one (e.g. Neu-Ulm when the authorized city is Ulm).
function splitLocationCandidates(evidencedFields, generalSourceUrl, cityContext) {
  const { locations, locationsTruncated, ...rest } = evidencedFields;
  const rawLocations = locations && Array.isArray(locations.value) ? locations.value : null;
  const truncated = !!(locationsTruncated && locationsTruncated.value);

  const NONE = { fields: rest, multipleLocationsDetected: false, locations: null, totalLocationsDiscovered: 0, noMatchingCityLocation: false, locationsTruncated: false };
  if (!rawLocations || !rawLocations.length) return NONE;

  const totalLocationsDiscovered = rawLocations.length;

  if (totalLocationsDiscovered === 1) {
    const fields = foldSingleLocationIntoFields(rest, locations, rawLocations[0], generalSourceUrl);
    return { fields, multipleLocationsDetected: false, locations: null, totalLocationsDiscovered, noMatchingCityLocation: false, locationsTruncated: truncated };
  }

  const normalizedCity = normalizeCityName(cityContext);
  const cityRelevant = normalizedCity
    ? rawLocations.filter((loc) => normalizeCityName(loc.city) === normalizedCity)
    : []; // authorized city unknown -- cannot safely determine relevance, never guess

  if (cityRelevant.length >= 2) {
    return {
      fields: rest,
      multipleLocationsDetected: true,
      locations: cityRelevant.map((loc) => shapeLocationCandidate(loc, generalSourceUrl)),
      totalLocationsDiscovered,
      noMatchingCityLocation: false,
      locationsTruncated: truncated,
    };
  }

  if (cityRelevant.length === 1) {
    const fields = foldSingleLocationIntoFields(rest, locations, cityRelevant[0], generalSourceUrl);
    return { fields, multipleLocationsDetected: false, locations: null, totalLocationsDiscovered, noMatchingCityLocation: false, locationsTruncated: truncated };
  }

  // Two or more locations exist, but none could be confirmed for the
  // authorized city -- never fall back to an out-of-city address.
  return { fields: rest, multipleLocationsDetected: false, locations: null, totalLocationsDiscovered, noMatchingCityLocation: true, locationsTruncated: truncated };
}

// Best-effort, read-only lookup of the manager's already-authorized
// city name (Location.name -- same field managerRoutes.js's own invite
// endpoints already select), used ONLY as informational context handed
// to the extraction model so it can prioritize which verified
// location(s) are relevant when a site describes several (Phase 1G §6).
// Never used to filter/select on this service's own behalf, and a
// lookup failure here must never fail or degrade the research request
// itself -- it just means no city hint is given this one time.
async function resolveCityName(locationId) {
  try {
    const location = await prisma.location.findUnique({ where: { id: locationId }, select: { name: true } });
    return (location && location.name) || null;
  } catch {
    return null;
  }
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
//
// `signal` (Phase 1G.3) is forwarded to extractBusinessFields, which
// forwards it again to the Anthropic SDK call itself -- see that
// file's own header comment on its `signal` parameter. Firecrawl is
// deliberately NOT wired to this same signal: it already has its own
// independent, always-effective AbortSignal.timeout() per page (see
// stadtpocketWebResearchService.js), and typically finishes in a few
// seconds (confirmed on the real Bäckerei Betz staging request: 2.2s
// for 5 pages) -- the real, evidenced problem this phase fixes is
// specifically the Anthropic call being left running unbounded after
// the deadline, not Firecrawl.
async function runWebAndExtraction(requestId, businessName, websiteUrl, cityContext, signal) {
  const webStart = Date.now();
  const webResult = await fetchBusinessWebsiteResearch(websiteUrl);
  logStage(requestId, 'firecrawl', { status: webResult.status, durationMs: Date.now() - webStart, pages: (webResult.pageUrls || []).length });

  if (webResult.status !== WEB_STATUS.OK) {
    return { evidencedFields: {}, researchStatus: WEB_STATUS_TO_RESEARCH_STATUS[webResult.status] || RESEARCH_STATUS.WEBSITE_UNREACHABLE };
  }

  const aiStart = Date.now();
  const extraction = await extractBusinessFields({ businessName, websiteUrl: webResult.sourceUrl, siteContent: webResult.content, cityContext, signal });
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
  // Resolved once, used both as extraction context (informational only,
  // see runWebAndExtraction) and, further below, as the deterministic
  // basis for this server's OWN city-relevance filtering in
  // splitLocationCandidates -- never left to the model's judgment.
  const cityContext = await resolveCityName(locationId);

  if (websiteUrl) {
    const urlSafetyStart = Date.now();
    // Phase 1G.3 -- real cancellation. A real deployed Bäckerei Betz
    // request proved the deadline previously only stopped OUR wait: the
    // Anthropic call kept running for ~16.5s after the Admin had
    // already received provider-unavailable (the SDK's own default
    // maxRetries=2 turned one 20s timeout into ~61.5s of orphaned
    // work -- see stadtpocketAiExtractionService.js's own
    // ANTHROPIC_TIMEOUT_MS/ANTHROPIC_MAX_RETRIES comments for the full
    // diagnosis). This controller's signal is threaded through
    // runWebAndExtraction -> extractBusinessFields ->
    // client.messages.create(params, { signal }) -- the SDK's own
    // documented per-request cancellation option -- so aborting it here
    // actually tears down the in-flight HTTP request, not just this
    // function's own await.
    const controller = new AbortController();
    const outcome = await raceWithDeadline(runWebAndExtraction(requestId, businessName, websiteUrl, cityContext, controller.signal), deadlineMs);
    if (outcome === DEADLINE_EXCEEDED) {
      // Only reached when the deadline actually won the race -- a
      // normal completion never calls abort() at all, so a fast,
      // successful request is never affected by this. Reuses the
      // existing provider-unavailable public status -- no new public-
      // contract value, per Phase 1E's own instruction -- with a
      // distinct internal log tag for diagnosis. The now-cancelled
      // extractBusinessFields() call resolves (never throws) into its
      // own existing STATUS.UNAVAILABLE path once the abort reaches it
      // -- exactly the same safe shape a genuine provider timeout
      // already produced, so there is nothing new to catch here and no
      // unhandled rejection risk: that orphaned promise is simply never
      // awaited again, and it was never going to reject in the first
      // place (extractBusinessFields catches its own errors, including
      // an abort, and returns a status object).
      controller.abort();
      logStage(requestId, 'deadline-exceeded', { afterMs: Date.now() - urlSafetyStart });
      researchStatus = RESEARCH_STATUS.PROVIDER_UNAVAILABLE;
    } else {
      ({ evidencedFields, researchStatus } = outcome);
    }
  }

  const { fields: fieldsWithLocations, headerImageCandidate } = splitHeaderImageCandidate(evidencedFields);
  const generalSourceUrl = headerImageCandidate ? headerImageCandidate.sourceUrl : Object.values(fieldsWithLocations)[0]?.sourceUrl;
  const {
    fields,
    multipleLocationsDetected,
    locations,
    totalLocationsDiscovered,
    noMatchingCityLocation,
    locationsTruncated,
  } = splitLocationCandidates(fieldsWithLocations, generalSourceUrl, cityContext);

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
    multipleLocationsDetected,
    locations,
    totalLocationsDiscovered,
    noMatchingCityLocation,
    locationsTruncated,
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
  splitLocationCandidates,
  resolveCityName,
  normalizeCityName,
};

// Re-exported for the route layer's error-handling convenience, mirroring
// stadtpocketManagerService.js's own StadtpocketManagerError being caught
// alongside this file's error type -- both are 4xx-status, message-safe
// errors, never leaking internals to the HTTP response.
module.exports.StadtpocketManagerError = StadtpocketManagerError;
