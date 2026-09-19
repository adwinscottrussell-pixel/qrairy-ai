/**
 * managerStadtpocketResearchRoutes.js — Phase 1B (AI Business Onboarding).
 * ─────────────────────────────────────────────────────────────
 * Mounted at /manager/stadtpocket, same prefix and same
 * requireStadtpocketWriteScope authorization as every other StadtPocket
 * manager route (managerStadtpocketListingRoutes.js,
 * managerStadtpocketOfferRoutes.js) -- City Manager and Global Admin
 * share one authorization outcome, and a City Manager stays city-scoped
 * exactly like every existing write path.
 *
 * This route is additionally rate-limited on its own, tighter than the
 * app-wide limiter in index.js (200 req/15min/IP) -- research triggers a
 * real Firecrawl + Anthropic call, a genuinely paid operation, so it is
 * bounded per-manager (keyed by the resolved Clerk userId, not IP, since
 * requireStadtpocketWriteScope already runs first) rather than relying
 * on the generic app-wide IP limiter alone.
 *
 * POST .../research accepts exactly ONE candidate (businessName and/or
 * websiteUrl) per request -- see stadtpocketResearchService.js's own
 * header comment for why the same function is already shaped to be
 * reusable for a future bulk caller without needing to change here
 * first.
 *
 * POST .../research/draft (Phase 1D follow-up) turns a REVIEWED
 * candidate into a real draft, with a fresh server-side duplicate
 * re-check immediately before creation -- see
 * stadtpocketAiDraftService.js's own header comment for why this
 * exists (a stale client-side "NEW" from an earlier /research call must
 * never be trusted at creation time) and its precise, honestly-stated
 * atomicity guarantee.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const { requireStadtpocketWriteScope } = require('../middleware/stadtpocketManagerAuth');
const { researchBusiness, StadtpocketResearchError, StadtpocketManagerError } = require('../services/stadtpocketResearchService');
const { createDraftFromReview, StadtpocketDuplicateError } = require('../services/stadtpocketAiDraftService');

const researchRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Runs AFTER requireStadtpocketWriteScope, so req.stadtpocketScope is
  // already resolved -- bounds real research operations per manager
  // account, not per IP (several managers can share an office network;
  // one manager should not be able to exhaust another's quota, and a
  // single manager should not be able to bypass the limit by rotating
  // networks). The req.ip fallback (should req.stadtpocketScope ever be
  // absent) goes through express-rate-limit's own ipKeyGenerator so an
  // IPv6 address is normalized the same safe way the library's default
  // keyGenerator already does -- required by the library's own startup
  // validation, not just a style preference.
  keyGenerator: (req) => (req.stadtpocketScope && req.stadtpocketScope.userId) || ipKeyGenerator(req.ip),
});

function handleServiceError(err, res, route) {
  if (err instanceof StadtpocketResearchError || err instanceof StadtpocketManagerError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[${route}]`, err);
  return res.status(500).json({ error: 'Internal server error.' });
}

async function handleResearch(req, res) {
  try {
    const candidate = await researchBusiness(req.params.locationId, req.stadtpocketScope, req.body);
    return res.json({ candidate });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/research POST');
  }
}

// Not rate-limited like handleResearch above -- this performs no
// external/paid provider call, only DB reads/writes, the same cost
// class as initializeDraft/saveDraft (neither of which is rate-limited
// either).
async function handleCreateDraftFromReview(req, res) {
  try {
    const result = await createDraftFromReview(req.params.locationId, req.stadtpocketScope, req.body);
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof StadtpocketDuplicateError) {
      // Structured, non-500 response -- the Admin gets the real
      // duplicate result to review, never a generic failure.
      return res.status(err.status).json({ error: err.message, duplicate: err.duplicate });
    }
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/research/draft POST');
  }
}

router.post('/listings/:locationId/research', requireStadtpocketWriteScope, researchRateLimiter, handleResearch);
router.post('/listings/:locationId/research/draft', requireStadtpocketWriteScope, handleCreateDraftFromReview);

module.exports = router;
module.exports.handleResearch = handleResearch; // exported for direct unit testing only
module.exports.handleCreateDraftFromReview = handleCreateDraftFromReview; // exported for direct unit testing only
module.exports.researchRateLimiter = researchRateLimiter; // exported for direct unit testing only
