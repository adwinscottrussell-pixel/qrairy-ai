/**
 * adminMiddleware.js — QRairy Server-Side Admin Guard
 * ─────────────────────────────────────────────────────────────
 * Protects all /admin/* API routes server-side.
 * Frontend hiding (admin-guard.js) is UX only — this is the
 * actual security layer.
 *
 * Verifies:
 *   1. Bearer token is present
 *   2. Token is a valid Clerk session token
 *   3. User publicMetadata.role === 'admin'
 *
 * Place in: backend/src/middleware/adminMiddleware.js
 *
 * Usage in routes:
 *   const { requireAdmin } = require('../middleware/adminMiddleware');
 *   router.get('/admin/users', requireAdmin, handleGetUsers);
 * ─────────────────────────────────────────────────────────────
 */

const { createClerkClient } = require('@clerk/backend');

// Initialise Clerk backend client once
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * requireAuth
 * Validates Clerk session token. Attaches userId to req.
 * Use on any authenticated route (customer or admin).
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({ error: 'No auth token provided.' });
    }

    // Verify token with Clerk
    const payload = await clerk.verifyToken(token);

    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    req.userId = payload.sub;
    next();

  } catch (err) {
    console.error('[requireAuth]', err.message);
    return res.status(401).json({ error: 'Authentication failed.' });
  }
}

/**
 * requireAdmin
 * Extends requireAuth — also checks role === 'admin' in Clerk
 * publicMetadata. This is server-side enforcement, not frontend hiding.
 *
 * Non-admin authenticated users get 403 Forbidden.
 * Unauthenticated requests get 401 Unauthorized.
 */
async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({ error: 'No auth token provided.' });
    }

    const payload = await clerk.verifyToken(token);

    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Fetch full user to check publicMetadata
    const user = await clerk.users.getUser(payload.sub);
    const meta = user.publicMetadata || {};

    if (meta.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied. Admin role required.',
      });
    }

    req.userId = payload.sub;
    req.adminUser = user;
    next();

  } catch (err) {
    console.error('[requireAdmin]', err.message);
    return res.status(401).json({ error: 'Authentication failed.' });
  }
}

module.exports = { requireAuth, requireAdmin };
