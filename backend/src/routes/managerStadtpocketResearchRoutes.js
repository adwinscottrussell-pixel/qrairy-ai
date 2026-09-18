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
 * Only ONE route exists here today: POST .../research, accepting exactly
 * ONE candidate (businessName and/or websiteUrl) per request -- see
 * stadtpocketResearchService.js's own header comment for why the same
 * function is already shaped to be reusable for a future bulk caller
 * without needing to change here first.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const { requireStadtpocketWriteScope } = require('../middleware/stadtpocketManagerAuth');
const { researchBusiness, StadtpocketResearchError, StadtpocketManagerError } = require('../services/stadtpocketResearchService');

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

router.post('/listings/:locationId/research', requireStadtpocketWriteScope, researchRateLimiter, handleResearch);

module.exports = router;
module.exports.handleResearch = handleResearch; // exported for direct unit testing only
module.exports.researchRateLimiter = researchRateLimiter; // exported for direct unit testing only
