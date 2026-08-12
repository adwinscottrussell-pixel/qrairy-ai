// ============================================================
// QRAIVY — Email Double Opt-In Confirmation Tokens
// Signs the confirmation link embedded in the double-opt-in email sent by
// emailService.sendDoubleOptInEmail. Same HMAC family as
// unsubscribeToken.js — same reasoning for HMAC-over-JWT (see that file's
// header) — but this token is intentionally NOT interchangeable with it:
// a dedicated purpose string is bound into the signature, and an
// unsubscribe token could never satisfy this module's verification (or
// vice versa) even if presented at the wrong endpoint.
//
// Unlike the unsubscribe link, a confirmation link SHOULD expire — an
// unconfirmed signup sitting unconfirmed forever is not evidence of
// anything, and a long-lived confirmation link is unnecessary standing
// attack surface. The expiry is bound INTO the signed content (not a
// separate trusted-as-is query parameter): the signature is computed over
// subscriberId + slug + purpose + expiresAt together, so presenting a
// modified `exp` value without the matching secret-derived signature
// fails verification exactly like a tampered subscriberId or slug would.
// ============================================================

const crypto = require('crypto');

const DOUBLE_OPT_IN_PURPOSE = 'email-double-opt-in';
const DOUBLE_OPT_IN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

// Same fail-closed-in-production / labeled-dev-fallback pattern as
// STAFF_SESSION_SECRET and UNSUBSCRIBE_SIGNING_SECRET. A separate secret
// (not reused from either) keeps this token's blast radius scoped to
// double-opt-in confirmations only.
const _DEV_ONLY_FALLBACK_SECRET = 'qraivy-double-opt-in-DEV-ONLY-not-a-real-secret';

function _resolveDoubleOptInSigningSecret() {
  const configured = process.env.DOUBLE_OPT_IN_SIGNING_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DOUBLE_OPT_IN_SIGNING_SECRET environment variable is required in production. ' +
      'Set it before starting the server — confirmation links cannot be signed without it.'
    );
  }
  console.warn('[doubleOptInToken] DOUBLE_OPT_IN_SIGNING_SECRET not set — using a dev-only fallback. Do not use this outside development/test.');
  return _DEV_ONLY_FALLBACK_SECRET;
}

const DOUBLE_OPT_IN_SIGNING_SECRET = _resolveDoubleOptInSigningSecret();

function _toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _sign(subscriberId, slug, expiresAt) {
  const body = String(subscriberId) + ':' + String(slug) + ':' + DOUBLE_OPT_IN_PURPOSE + ':' + String(expiresAt);
  return _toBase64Url(crypto.createHmac('sha256', DOUBLE_OPT_IN_SIGNING_SECRET).update(body).digest());
}

// Returns { token, expiresAt } — expiresAt is a plain epoch-ms number,
// safe to expose in the URL because it's bound into the signature itself.
function signDoubleOptInToken(subscriberId, slug) {
  const expiresAt = Date.now() + DOUBLE_OPT_IN_TTL_MS;
  return { token: _sign(subscriberId, slug, expiresAt), expiresAt };
}

// Signature/shape check only — deliberately does NOT check expiry, so a
// caller can distinguish "expired" from "invalid" (unlike the unsubscribe
// token, there's no adversarial reason to hide that distinction here, and
// it directly enables a useful "link expired, request a new one" message).
function verifyDoubleOptInSignature(subscriberId, slug, expiresAt, token) {
  if (!subscriberId || !slug || !expiresAt || !token || typeof token !== 'string') return false;
  const expected = _sign(subscriberId, slug, expiresAt);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isDoubleOptInTokenExpired(expiresAt) {
  const n = Number(expiresAt);
  return !Number.isFinite(n) || Date.now() > n;
}

module.exports = {
  signDoubleOptInToken,
  verifyDoubleOptInSignature,
  isDoubleOptInTokenExpired,
  DOUBLE_OPT_IN_PURPOSE,
  DOUBLE_OPT_IN_TTL_MS,
};
