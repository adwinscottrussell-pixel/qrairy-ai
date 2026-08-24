/**
 * managerRoutes.js — City/Location Manager scoped API.
 * ─────────────────────────────────────────────────────────────
 * Entirely separate from adminRoutes.js — mounted at /manager, not
 * /admin, and every route here uses requireManagerScope, never
 * requireAdmin. See middleware/locationManagerAuth.js.
 *
 * A caller-supplied locationId is always checked against
 * req.managerScope.locationIds before being used to query OR write. An
 * out-of-scope id gets an explicit 403, never a silently empty result —
 * an empty result would be indistinguishable from "this Location
 * genuinely has no Businesses" and would hide the scope boundary
 * instead of enforcing it. This applies equally to the Phase 3B invite
 * write below: the request body's locationId is never trusted on its
 * own, only ever used after being checked against the server-derived
 * scope — the same pattern already proven by the read endpoints' own
 * ?locationId= filter.
 *
 * Businesses are resolved through BusinessLocation only (never a direct
 * Business.findMany by caller-supplied id for scoped reads), and each
 * Business's `locations` field in the response is filtered down to the
 * manager's own in-scope Locations — never the Business's full,
 * unfiltered BusinessLocation list — so a Business that also
 * participates in an out-of-scope Location never leaks that Location's
 * name/id here.
 *
 * Archived Businesses are excluded, consistent with the existing
 * default-view policy in networkAdminService.listBusinesses.
 *
 * Phase 3B — City Manager Invite Existing Business: adds the first
 * write this namespace has ever had (POST /businesses/:businessId/invite)
 * plus a manager-scoped Business search (GET /businesses/search). Both
 * strictly preserve the ownership boundary: neither ever creates or
 * touches a BusinessMember row, never writes Business.primaryOwnerUserId,
 * never touches Clerk or Stripe. Inviting a Business into a city is
 * purely a BusinessLocation row with status:'invited' — the exact same
 * model the read endpoints already use, extended with one new,
 * additive status value (BusinessLocation.status is untyped free text
 * everywhere else in this schema, so no migration is required to add
 * "invited" alongside the existing "active"/"paused").
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
      // membershipStatus is the BusinessLocation row's own status
      // (invited/active/paused -- Phase 3B onward) for THIS Location,
      // kept separate from the Business's own status field above it
      // never confuse "is this Business active on QRAIVY" with "is this
      // Business's StadtPocket membership in this city active".
      const locationWithMembership = { ...bl.location, membershipStatus: bl.status };
      const existing = businessMap.get(bl.businessId);
      if (existing) {
        existing.locations.push(locationWithMembership);
      } else {
        businessMap.set(bl.businessId, {
          id: bl.business.id,
          name: bl.business.name,
          status: bl.business.status,
          primaryOwnerUserId: bl.business.primaryOwnerUserId,
          ownerEmail: ownerEmails.get(bl.business.primaryOwnerUserId) || null,
          locations: [locationWithMembership],
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

// ── Phase 3B — City Manager Invite Existing Business ────────────────
//
// MIN_QUERY_LEN/RESULT_LIMIT mirror searchService.js's own
// MIN_FUZZY_LEN=2 / DEFAULT_LIMIT=10 conventions -- small, fixed bounds
// deliberately chosen over a caller-configurable limit, since this
// endpoint only backs one small "pick a Business to invite" UI, not a
// general search surface.
const MIN_QUERY_LEN = 2;
const RESULT_LIMIT = 20;

// Manager-scoped Business lookup, for the "Invite Business" search UI
// only. `locationId` is required and checked against
// req.managerScope.locationIds exactly like the existing ?locationId=
// filter on GET /businesses -- never trusted on its own. Returns the
// minimum fields the UI needs to let a manager pick the right Business
// (id/name/slug/isMember) -- never primaryOwnerUserId, ownerEmail, or
// any Stripe/billing field, since this is a lookup surface, not a
// Business-detail read.
async function handleSearchBusinesses(req, res) {
  try {
    const scope = req.managerScope;
    const { q, locationId } = req.query;

    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required.' });
    }
    if (!scope.locationIds.includes(locationId)) {
      return res.status(403).json({ error: 'Forbidden. Location outside manager scope.' });
    }

    const query = String(q || '').trim();
    if (query.length < MIN_QUERY_LEN) {
      return res.status(400).json({ error: `Query must be at least ${MIN_QUERY_LEN} characters.` });
    }

    const businesses = await prisma.business.findMany({
      where: {
        status: { not: 'archived' },
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { slug: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
      take: RESULT_LIMIT,
    });

    const ids = businesses.map((b) => b.id);
    const existingMemberships = ids.length
      ? await prisma.businessLocation.findMany({
          where: { businessId: { in: ids }, locationId },
          select: { businessId: true, status: true },
        })
      : [];
    const membershipByBusiness = new Map(existingMemberships.map((m) => [m.businessId, m.status]));

    return res.json({
      businesses: businesses.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        isMember: membershipByBusiness.has(b.id),
        membershipStatus: membershipByBusiness.get(b.id) || null,
      })),
    });
  } catch (err) {
    console.error('[manager/businesses/search]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// Creates the StadtPocket city-membership relationship for an EXISTING
// canonical Business -- never creates or modifies a Business row, never
// touches BusinessMember (Business ownership/admin), never touches
// Clerk or Stripe. locationId comes from the request body but is
// checked against req.managerScope.locationIds before being used for
// anything -- a manager can only ever invite into one of their own
// assigned cities, never an arbitrary one. Initial status is
// "invited", per the Phase 3B Step 1 architecture inspection §8/§10 --
// deliberately distinct from "active" so the UI/UX never implies the
// manager has granted themselves or the business immediate full
// membership.
async function handleInviteBusiness(req, res) {
  try {
    const scope = req.managerScope;
    const { businessId } = req.params;
    const { locationId } = req.body || {};

    if (!businessId) {
      return res.status(400).json({ error: 'businessId is required.' });
    }
    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required.' });
    }
    if (!scope.locationIds.includes(locationId)) {
      return res.status(403).json({ error: 'Forbidden. Location outside manager scope.' });
    }

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business || business.status === 'archived') {
      return res.status(404).json({ error: 'Business not found.' });
    }

    const existing = await prisma.businessLocation.findUnique({
      where: { businessId_locationId: { businessId, locationId } },
    });
    if (existing) {
      return res.status(409).json({
        error: 'This Business is already a member of this city.',
        membership: { id: existing.id, status: existing.status },
      });
    }

    let membership;
    try {
      membership = await prisma.businessLocation.create({
        data: { businessId, locationId, status: 'invited' },
        include: { location: { select: { id: true, name: true, slug: true } } },
      });
    } catch (err) {
      // Race-condition fallback: two requests could both pass the
      // findUnique check above before either create() lands. The
      // @@unique([businessId, locationId]) constraint is the real
      // guarantee against a duplicate membership; this just turns the
      // resulting Prisma P2002 into the same clean 409 the pre-check
      // above already returns for the non-racing case.
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'This Business is already a member of this city.' });
      }
      throw err;
    }

    return res.status(201).json({
      membership: {
        id: membership.id,
        businessId: membership.businessId,
        locationId: membership.locationId,
        status: membership.status,
        joinedAt: membership.joinedAt,
        location: membership.location,
      },
    });
  } catch (err) {
    console.error('[manager/businesses/:businessId/invite]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

router.get('/businesses/search', requireManagerScope, handleSearchBusinesses); // must precede /businesses/:id
router.get('/businesses', requireManagerScope, handleGetManagerBusinesses);
router.get('/businesses/:id', requireManagerScope, handleGetManagerBusiness);
router.post('/businesses/:businessId/invite', requireManagerScope, handleInviteBusiness);
router.get('/context', requireManagerScope, handleGetManagerContext);

module.exports = router;
module.exports.handleGetManagerBusinesses = handleGetManagerBusinesses; // exported for direct unit testing only
module.exports.handleGetManagerBusiness = handleGetManagerBusiness; // exported for direct unit testing only
module.exports.handleGetManagerContext = handleGetManagerContext; // exported for direct unit testing only
module.exports.handleSearchBusinesses = handleSearchBusinesses; // exported for direct unit testing only
module.exports.handleInviteBusiness = handleInviteBusiness; // exported for direct unit testing only
