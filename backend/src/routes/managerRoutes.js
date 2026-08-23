/**
 * managerRoutes.js — City/Location Manager scoped API (Phase 1, read-only).
 * ─────────────────────────────────────────────────────────────
 * Entirely separate from adminRoutes.js — mounted at /manager, not
 * /admin, and every route here uses requireManagerScope, never
 * requireAdmin. See middleware/locationManagerAuth.js.
 *
 * A caller-supplied locationId is always checked against
 * req.managerScope.locationIds before being used to query. An
 * out-of-scope id gets an explicit 403, never a silently empty result —
 * an empty result would be indistinguishable from "this Location
 * genuinely has no Businesses" and would hide the scope boundary
 * instead of enforcing it.
 *
 * Businesses are resolved through BusinessLocation only (never a direct
 * Business.findMany by caller-supplied id), and each Business's
 * `locations` field in the response is filtered down to the manager's
 * own in-scope Locations — never the Business's full, unfiltered
 * BusinessLocation list — so a Business that also participates in an
 * out-of-scope Location never leaks that Location's name/id here.
 *
 * Archived Businesses are excluded, consistent with the existing
 * default-view policy in networkAdminService.listBusinesses.
 *
 * Read-only this phase: GET only, no writes.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prismaClient');
const { requireManagerScope } = require('../middleware/locationManagerAuth');

async function handleGetManagerBusinesses(req, res) {
  try {
    const scope = req.managerScope;
    const { locationId } = req.query;

    let targetLocationIds;
    if (locationId) {
      if (!scope.locationIds.includes(locationId)) {
        return res.status(403).json({ error: 'Forbidden. Location outside manager scope.' });
      }
      targetLocationIds = [locationId];
    } else {
      targetLocationIds = scope.locationIds;
    }

    if (targetLocationIds.length === 0) {
      return res.json({ businesses: [], scope: { locationIds: scope.locationIds } });
    }

    const businessLocations = await prisma.businessLocation.findMany({
      where: {
        locationId: { in: targetLocationIds },
        business: { status: { not: 'archived' } },
      },
      include: {
        business: true,
        location: { select: { id: true, name: true, slug: true } },
      },
    });

    const businessMap = new Map();
    for (const bl of businessLocations) {
      const existing = businessMap.get(bl.businessId);
      if (existing) {
        existing.locations.push(bl.location);
      } else {
        businessMap.set(bl.businessId, {
          id: bl.business.id,
          name: bl.business.name,
          status: bl.business.status,
          primaryOwnerUserId: bl.business.primaryOwnerUserId,
          locations: [bl.location],
        });
      }
    }

    return res.json({
      businesses: [...businessMap.values()],
      scope: { locationIds: scope.locationIds },
    });
  } catch (err) {
    console.error('[manager/businesses]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

router.get('/businesses', requireManagerScope, handleGetManagerBusinesses);

module.exports = router;
module.exports.handleGetManagerBusinesses = handleGetManagerBusinesses; // exported for direct unit testing only
