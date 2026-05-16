/**
 * auth.js — Clerk JWT Verification Middleware
 * ─────────────────────────────────────────────────────────────
 * SECURITY FIX: Previous version decoded the JWT payload without
 * verifying the signature. That means any forged token would pass.
 * This version uses @clerk/backend to properly verify tokens.
 * ─────────────────────────────────────────────────────────────
 */

const { createClerkClient } = require('@clerk/backend');

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * requireAuth
 * Verifies Clerk Bearer token cryptographically.
 * Attaches req.userId on success.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const token = authHeader.split(' ')[1];

    // Cryptographic verification — not just base64 decode
    const payload = await clerk.verifyToken(token);

    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    req.userId = payload.sub;
    next();

  } catch (err) {
    console.error('[auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized.' });
  }
}

/**
 * optionalAuth
 * Sets req.userId if a valid token is present, continues either way.
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const payload = await clerk.verifyToken(token);
      if (payload && payload.sub) {
        req.userId = payload.sub;
      }
    }
  } catch (_) {
    // No valid token — continue as anonymous
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
