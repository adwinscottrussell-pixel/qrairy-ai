/**
 * stadtpocketManagerAuth.js — StadtPocket Listing write-path scope
 * resolution. Phase 6C.
 * ─────────────────────────────────────────────────────────────
 * Not a second authorization system: reuses the exact Clerk verification
 * call already used by middleware/auth.js and middleware/locationManagerAuth.js,
 * and the exact NetworkMember scope-resolution logic already proven by
 * requireManagerScope -- this file only adds one thing neither of those
 * two provides on its own: a single scope object that recognizes BOTH a
 * platform Global Admin (Clerk publicMetadata.role === 'admin', same
 * check adminMiddleware.js's requireAdmin already uses) AND a scoped
 * City Manager, so route handlers don't need two separate code paths.
 *
 * Business Owner is deliberately NOT part of this scope. StadtPocket-
 * Listing.businessId has no claim/link mechanism yet (see the Phase 6B
 * schema comment: "only ever populated by a future claim/link step, not
 * part of this phase") -- there is no safe, unambiguous way today to
 * resolve "this authenticated user owns this Business" into "therefore
 * they may edit this StadtPocketListing." Left for an explicit later
 * phase rather than guessed at here.
 *
 * req.stadtpocketScope shape:
 *   { userId, isGlobalAdmin: true }                                -- admin
 *   { userId, isGlobalAdmin: false, locationIds: [...] }           -- manager
 *
 * A caller with isGlobalAdmin:true bypasses every locationIds check
 * downstream; every other caller must have their target locationId
 * present in locationIds, checked explicitly by each route handler
 * (never inferred here, since this middleware has no route-specific
 * knowledge of what's being written).
 * ─────────────────────────────────────────────────────────────
 */

const { verifyToken, createClerkClient } = require('@clerk/backend');
const prisma = require('../utils/prismaClient');

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function requireStadtpocketWriteScope(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  } catch (err) {
    console.error('[stadtpocketManagerAuth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  const userId = payload.sub;

  // Global Admin check first -- same publicMetadata.role convention
  // adminMiddleware.js's requireAdmin already uses. A Clerk lookup
  // failure here is treated as "not an admin," never as an error that
  // blocks falling through to the manager-scope check below.
  try {
    const user = await clerk.users.getUser(userId);
    const meta = user.publicMetadata || {};
    if (meta.role === 'admin') {
      req.stadtpocketScope = { userId, isGlobalAdmin: true };
      return next();
    }
  } catch (err) {
    // Not fatal -- fall through to the manager-scope check. A genuine
    // Clerk outage will also fail the requireAuth-equivalent verifyToken
    // call above in that case, so this path is specifically "token is
    // valid but the admin-role lookup itself failed," not a silent
    // auth bypass.
  }

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

    req.stadtpocketScope = { userId, isGlobalAdmin: false, locationIds: [...locationIds] };
    return next();
  } catch (err) {
    console.error('[stadtpocketManagerAuth] Scope resolution failed:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { requireStadtpocketWriteScope };
