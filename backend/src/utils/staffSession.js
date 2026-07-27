// ============================================================
// QRAIVY — Staff Session Tokens
// Short-lived, server-signed tokens proving a staff member passed the
// Staff PIN gate for one specific business. Minted only by
// handleVerifyStaffPin (lpController.js) on a successful PIN check;
// required by every staff-only scanner/stamp/redeem route. Never carries
// the PIN or PIN hash — only slug/purpose/issuedAt/expiresAt.
//
// HMAC-SHA256, not JWT — this project has no existing generic JWT signer
// (the only jsonwebtoken usage, googleWalletService.js, signs Google's own
// RS256 service-account claims with Google's private key, which is a
// different trust boundary and not reusable here). A dedicated HMAC
// secret keeps this token's blast radius scoped to staff sessions only.
// ============================================================

const crypto = require('crypto');

const STAFF_SESSION_PURPOSE = 'staff-loyalty';
const STAFF_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// A hardcoded fallback secret would let anyone forge a staff-session token
// in production (they'd just need to read this file, which is public in
// the repo). So: production requires STAFF_SESSION_SECRET and fails loudly
// at module load if it's missing — never falls back to a predictable
// value. Outside production, an explicit dev/test secret set via the same
// env var is used if present; only if it's ALSO absent does a clearly-
// labeled, non-random dev-only constant apply, gated strictly on NODE_ENV
// so it can never be reached in production. Never logs the secret value
// itself, only whether a fallback was used.
const _DEV_ONLY_FALLBACK_SECRET = 'qraivy-staff-session-DEV-ONLY-not-a-real-secret';

function _resolveStaffSessionSecret() {
  const configured = process.env.STAFF_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'STAFF_SESSION_SECRET environment variable is required in production. ' +
      'Set it before starting the server — staff-session tokens cannot be signed without it.'
    );
  }
  console.warn('[staffSession] STAFF_SESSION_SECRET not set — using a dev-only fallback. Do not use this outside development/test.');
  return _DEV_ONLY_FALLBACK_SECRET;
}

const STAFF_SESSION_SECRET = _resolveStaffSessionSecret();

function _toBase64Url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _fromBase64Url(str) {
  let padded = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  return Buffer.from(padded, 'base64');
}

function _sign(body) {
  return _toBase64Url(crypto.createHmac('sha256', STAFF_SESSION_SECRET).update(body).digest());
}

// Mints a staff-session token for exactly one slug. Callers must not
// accept a token whose slug doesn't match the request's own :slug param —
// enforced by requireStaffSession below, not by the caller.
function signStaffToken(slug) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + STAFF_SESSION_TTL_MS;
  const payload = { slug, purpose: STAFF_SESSION_PURPOSE, issuedAt, expiresAt };
  const body = _toBase64Url(JSON.stringify(payload));
  const token = body + '.' + _sign(body);
  return { token, expiresAt };
}

// Verifies signature + shape only. Expiry and slug-match are the caller's
// responsibility (requireStaffSession checks both, so it can distinguish
// staff_auth_required from staff_session_expired) — this function returns
// the decoded payload even if expired, or null if the token is missing,
// malformed, or has an invalid/forged signature.
function verifyStaffToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = _sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(_fromBase64Url(body).toString('utf8')); } catch (e) { return null; }
  if (!payload || payload.purpose !== STAFF_SESSION_PURPOSE || typeof payload.slug !== 'string') return null;
  return payload;
}

// Express middleware for staff-only routes. Reads the token from the
// X-Staff-Token header (never a query string, so it never lands in logs
// or browser history). Rejects missing, invalid, expired, or
// wrong-business tokens with a status the frontend can branch on.
function requireStaffSession(req, res, next) {
  const token = req.headers['x-staff-token'];
  const payload = verifyStaffToken(token);
  if (!payload) return res.status(401).json({ error: 'staff_auth_required' });
  if (payload.expiresAt < Date.now()) return res.status(401).json({ error: 'staff_session_expired' });
  if (payload.slug !== req.params.slug) return res.status(401).json({ error: 'staff_auth_required' });
  next();
}

module.exports = { signStaffToken, verifyStaffToken, requireStaffSession, STAFF_SESSION_TTL_MS };
