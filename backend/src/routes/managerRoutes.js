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

// Local, deliberately not imported from networkAdminService.js -- that file
// is the platform-admin-only write surface (see its own header comment);
// /manager/* stays fully independent of it. Resolves Clerk userIds to their
// QRAIVY email via the local User table only (same source /admin/users and
// networkAdminService's own resolveUsers use) -- never calls Clerk's API,
// never fabricates a value. A userId with no matching User row, or a User
// row with no email yet, simply has ownerEmail: null -- callers already
// fall back to the raw id for display, exactly like every existing Owner
// dropdown/table in admin.html does.
async function resolveOwnerEmails(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
  return new Map(users.map((u) => [u.id, u.email || null]));
}

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

    const ownerEmails = await resolveOwnerEmails(businessLocations.map((bl) => bl.business.primaryOwnerUserId));

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
          ownerEmail: ownerEmails.get(bl.business.primaryOwnerUserId) || null,
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

// Phase 3A — single-Business read, scoped exactly like the list above. The
// business id itself is caller-supplied (it's a path param, has to be) but
// it is NEVER trusted directly: existence is checked via its real
// BusinessLocation rows, and the request is rejected with 403 unless at
// least one of those rows' locationId is inside req.managerScope.locationIds.
// The `locations` field returned is filtered down to ONLY the manager's
// in-scope Locations -- if this Business also participates in an
// out-of-scope Location (a multi-outlet brand spanning Ulm and Stuttgart,
// say), that other Location's name/id/status is never present in the
// response, mirroring the exact same invariant handleGetManagerBusinesses
// already documents and tests for the list endpoint.
async function handleGetManagerBusiness(req, res) {
  try {
    const scope = req.managerScope;
    const { id } = req.params;

    const businessLocations = await prisma.businessLocation.findMany({
      where: { businessId: id },
      include: {
        business: true,
        location: { select: { id: true, name: true, slug: true, network: { select: { id: true, name: true } } } },
      },
    });

    if (businessLocations.length === 0) {
      return res.status(404).json({ error: 'Business not found.' });
    }

    const business = businessLocations[0].business;
    if (business.status === 'archived') {
      // Excluded from the manager's normal operational view, consistent
      // with handleGetManagerBusinesses -- treated as not-found, not as a
      // 403, since this has nothing to do with city scope.
      return res.status(404).json({ error: 'Business not found.' });
    }

    const inScope = businessLocations.filter((bl) => scope.locationIds.includes(bl.locationId));
    if (inScope.length === 0) {
      return res.status(403).json({ error: 'Forbidden. Business outside manager scope.' });
    }

    const ownerEmails = await resolveOwnerEmails([business.primaryOwnerUserId]);

    return res.json({
      business: {
        id: business.id,
        name: business.name,
        status: business.status,
        primaryOwnerUserId: business.primaryOwnerUserId,
        ownerEmail: ownerEmails.get(business.primaryOwnerUserId) || null,
        locations: inScope.map((bl) => ({
          id: bl.location.id,
          name: bl.location.name,
          slug: bl.location.slug,
          network: bl.location.network,
          status: bl.status,
        })),
      },
      scope: { locationIds: scope.locationIds },
    });
  } catch (err) {
    console.error('[manager/businesses/:id]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// Returns the real Location (City) identity for exactly the Locations
// req.managerScope already resolved -- no caller-supplied id, so there is
// no manipulable input on this route at all. This is what the frontend's
// City Operations Center uses in place of the Owner-only
// GET /admin/locations/:id read: same data shape (id/name/slug/type/status/
// network), scoped server-side, never client-side.
async function handleGetManagerContext(req, res) {
  try {
    const scope = req.managerScope;
    if (scope.locationIds.length === 0) {
      return res.json({ locations: [], scope: { locationIds: [] } });
    }

    const locations = await prisma.location.findMany({
      where: { id: { in: scope.locationIds } },
      include: { network: { select: { id: true, name: true } } },
    });

    return res.json({
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        type: l.type,
        status: l.status,
        network: l.network,
      })),
      scope: { locationIds: scope.locationIds },
    });
  } catch (err) {
    console.error('[manager/context]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

router.get('/businesses', requireManagerScope, handleGetManagerBusinesses);
router.get('/businesses/:id', requireManagerScope, handleGetManagerBusiness);
router.get('/context', requireManagerScope, handleGetManagerContext);

module.exports = router;
module.exports.handleGetManagerBusinesses = handleGetManagerBusinesses; // exported for direct unit testing only
module.exports.handleGetManagerBusiness = handleGetManagerBusiness; // exported for direct unit testing only
module.exports.handleGetManagerContext = handleGetManagerContext; // exported for direct unit testing only
