/**
 * managerStadtpocketDiscoveryRoutes.js — Phase 1H.2 (AI Business
 * Discovery), backend foundation only. No Admin UI yet (Phase 1H.3).
 * ─────────────────────────────────────────────────────────────
 * Mounted at /manager/stadtpocket, same requireStadtpocketWriteScope
 * authorization as every other StadtPocket manager route -- a City
 * Manager stays scoped to their own city (:locationId), Global Admin is
 * unrestricted, identical outcome shape to
 * managerStadtpocketListingRoutes.js / managerStadtpocketResearchRoutes.js.
 *
 * Rate-limited like POST .../research (a real, paid Google Places call
 * per request), same keyGenerator convention: bounded per-manager
 * (resolved Clerk userId from req.stadtpocketScope, already resolved by
 * requireStadtpocketWriteScope which runs first), not per IP.
 *
 * This route never creates a StadtPocketListing/ListingLocation, never
 * runs Phase 1G research, never calls Anthropic or Firecrawl -- see
 * stadtpocketDiscoveryService.js's own header comment for the full
 * discovery-vs-research distinction.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const { requireStadtpocketWriteScope } = require('../middleware/stadtpocketManagerAuth');
const { discoverBusinesses, StadtpocketDiscoveryError } = require('../services/stadtpocketDiscoveryService');
const { StadtpocketManagerError } = require('../services/stadtpocketManagerService');

const discoveryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.stadtpocketScope && req.stadtpocketScope.userId) || ipKeyGenerator(req.ip),
});

function handleServiceError(err, res, route) {
  if (err instanceof StadtpocketDiscoveryError || err instanceof StadtpocketManagerError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[${route}]`, err);
  return res.status(500).json({ error: 'Internal server error.' });
}

async function handleDiscover(req, res) {
  try {
    const body = req.body || {};
    const extra = Object.keys(body).filter((k) => !['category', 'quantity'].includes(k));
    if (extra.length) {
      return res.status(400).json({ error: `Unexpected field(s): ${extra.join(', ')}.` });
    }
    const result = await discoverBusinesses({
      locationId: req.params.locationId,
      scope: req.stadtpocketScope,
      category: body.category,
      quantity: body.quantity,
    });
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/discover POST');
  }
}

router.post('/listings/:locationId/discover', requireStadtpocketWriteScope, discoveryRateLimiter, handleDiscover);

module.exports = router;
module.exports.handleDiscover = handleDiscover; // exported for direct unit testing only
module.exports.discoveryRateLimiter = discoveryRateLimiter; // exported for direct unit testing only
