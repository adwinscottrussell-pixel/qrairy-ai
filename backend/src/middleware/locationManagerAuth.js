/**
 * locationManagerAuth.js — City/Location Manager scoped-access middleware.
 * ─────────────────────────────────────────────────────────────
 * Completely separate from adminMiddleware.js / requireAdmin. This file
 * grants NO access to /admin/* — it exists only to power the new
 * /manager/* namespace (see routes/managerRoutes.js). requireAdmin is
 * untouched by this file.
 *
 * Clerk verification mirrors middleware/auth.js's requireAuth (same
 * @clerk/backend verifyToken call, same 401 shape). What's new: instead
 * of a global Clerk publicMetadata.role check, this resolves the
 * caller's live NetworkMember rows into a per-request scope.
 *
 * NetworkMember is queried fresh on every request — never cached on the
 * request/session — so removing a NetworkMember row (networkAdminService
 * .removeManager) takes effect on the very next request.
 *
 * Invalid-membership rule (documented choice — see
 * docs/architecture/NETWORK_LOCATION_FOUNDATION.md's Future Phase 3
 * note): a NetworkMember row is only trusted if its role/locationId
 * combination is unambiguous —
 *   role='location_manager' requires a non-null locationId
 *   role='network_admin'    requires a null locationId
 * Any row that doesn't match either shape (including an unrecognized
 * role string) is EXCLUDED from scope, never used as a fallback to grant
 * broader access. A user with only invalid/ambiguous rows is treated
 * the same as a user with zero rows — 403, not a wider grant.
 *
 * network_admin (locationId=null) is network-wide by definition. To
 * represent that scope correctly (not just record the intent), this
 * resolves which Locations it actually covers right now via one extra
 * query — only run when a network-wide membership is present. This is
 * the only "network_admin" behavior this phase implements; no other
 * network-admin-specific functionality is built here.
 * ─────────────────────────────────────────────────────────────
 */

const { verifyToken } = require('@clerk/backend');
const prisma = require('../utils/prismaClient');

async function requireManagerScope(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  } catch (err) {
    console.error('[locationManagerAuth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  const userId = payload.sub;

  try {
    const rows = await prisma.networkMember.findMany({ where: { userId } });

    const locationManagerRows = rows.filter((r) => r.role === 'location_manager' && r.locationId != null);
    const networkAdminRows    = rows.filter((r) => r.role === 'network_admin' && r.locationId == null);
    const validMemberships = [...locationManagerRows, ...networkAdminRows];

    if (validMemberships.length === 0) {
      return res.status(403).json({ error: 'Forbidden. No manager membership found.' });
    }

    const locationIds = new Set(locationManagerRows.map((r) => r.locationId));
    const networkIds  = new Set(networkAdminRows.map((r) => r.networkId));

    if (networkIds.size > 0) {
      const networkLocations = await prisma.location.findMany({
        where: { networkId: { in: [...networkIds] } },
        select: { id: true },
      });
      for (const loc of networkLocations) locationIds.add(loc.id);
    }

    req.managerScope = {
      userId,
      memberships: validMemberships,
      locationIds: [...locationIds],
      networkIds: [...networkIds],
    };

    return next();
  } catch (err) {
    console.error('[locationManagerAuth] Scope resolution failed:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { requireManagerScope };
