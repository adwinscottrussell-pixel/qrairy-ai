/**
 * adminMiddleware.js — Server-Side Admin Role Enforcement
 * ─────────────────────────────────────────────────────────────
 * Replaces the hardcoded ADMIN_SECRET_KEY approach in adminRoutes.js.
 *
 * Security model:
 *   1. Valid Clerk Bearer token required (cryptographic verification)
 *   2. Clerk user must exist
 *   3. publicMetadata.role must === 'admin'
 *
 * All unauthorized attempts are logged with timestamp, route, and
 * Clerk userId (or 'unauthenticated').
 *
 * Usage:
 *   const { requireAdmin } = require('../middleware/adminMiddleware');
 *   router.get('/overview', requireAdmin, handler);
 * ─────────────────────────────────────────────────────────────
 */

const { createClerkClient } = require('@clerk/backend');

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// ── Security event logger ─────────────────────────────────────
function logSecurityEvent(event, req, extra) {
  const entry = {
    timestamp : new Date().toISOString(),
    event     : event,
    route     : req.method + ' ' + req.originalUrl,
    ip        : req.ip || req.connection.remoteAddress || 'unknown',
    userId    : req.userId || 'unauthenticated',
    userAgent : req.headers['user-agent'] || 'unknown',
    ...extra,
  };
  // Log as structured JSON — Railway will capture this in logs
  console.warn('[SECURITY]', JSON.stringify(entry));
}

// ── requireAdmin ──────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  const route = req.method + ' ' + req.originalUrl;

  try {
    // 1. Check Bearer token exists
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logSecurityEvent('ADMIN_ACCESS_NO_TOKEN', req, { route });
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const token = authHeader.split(' ')[1];

    // 2. Cryptographically verify token with Clerk
    let payload;
    try {
      payload = await clerk.verifyToken(token);
    } catch (verifyErr) {
      logSecurityEvent('ADMIN_ACCESS_INVALID_TOKEN', req, {
        route,
        reason: verifyErr.message,
      });
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    if (!payload || !payload.sub) {
      logSecurityEvent('ADMIN_ACCESS_INVALID_TOKEN', req, { route });
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    req.userId = payload.sub;

    // 3. Fetch full Clerk user to check publicMetadata
    let user;
    try {
      user = await clerk.users.getUser(payload.sub);
    } catch (fetchErr) {
      logSecurityEvent('ADMIN_ACCESS_USER_NOT_FOUND', req, {
        route,
        clerkId: payload.sub,
      });
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    // 4. Check role === 'admin' in publicMetadata
    const meta = user.publicMetadata || {};
    if (meta.role !== 'admin') {
      logSecurityEvent('ADMIN_ACCESS_ROLE_DENIED', req, {
        route,
        clerkId : payload.sub,
        role    : meta.role || 'none',
      });
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // 5. Attach user context for use in route handlers
    req.adminUser = {
      clerkId : user.id,
      email   : user.emailAddresses?.[0]?.emailAddress || null,
      role    : meta.role,
    };

    next();

  } catch (err) {
    logSecurityEvent('ADMIN_ACCESS_ERROR', req, {
      route,
      error: err.message,
    });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { requireAdmin, logSecurityEvent };
