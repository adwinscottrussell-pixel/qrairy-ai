// ============================================================
// QRAIVY — Email Unsubscribe Tokens
// Signs the recipient-specific unsubscribe link embedded in every
// campaign email (see emailService.js's sendCampaignEmail). Binds
// subscriberId + slug + a dedicated purpose string so this token can
// never be replayed as, or confused with, a different kind of signed
// link (e.g. a future double-opt-in confirmation token) even though both
// would live under the same HMAC-secret-per-purpose pattern this project
// already uses (see staffSession.js).
//
// No expiry by design: unlike a staff session, an email sitting unread in
// an inbox for months must still be able to unsubscribe correctly later —
// an expiring unsubscribe link is a compliance footgun, not a feature.
//
// HMAC-SHA256, not JWT — same reasoning as staffSession.js: this project
// has no generic JWT signer suitable for reuse here, and a dedicated
// secret keeps this token's blast radius scoped to unsubscribe links only
// (a leaked STAFF_SESSION_SECRET, Stripe key, Clerk key, etc. must not be
// enough to forge or read an unsubscribe token, and vice versa).
// ============================================================

const crypto = require('crypto');

const UNSUBSCRIBE_PURPOSE = 'email-unsubscribe';

// A hardcoded fallback secret would let anyone forge an unsubscribe link
// for any subscriber in production (they'd just need to read this file,
// which is public in the repo) — including maliciously unsubscribing a
// competitor's customers. So: production requires
// UNSUBSCRIBE_SIGNING_SECRET and fails loudly at module load if it's
// missing — never falls back to a predictable value. Outside production,
// an explicit dev/test secret set via the same env var is used if
// present; only if it's ALSO absent does a clearly-labeled, non-random
// dev-only constant apply, gated strictly on NODE_ENV so it can never be
// reached in production. Never logs the secret value itself, only
// whether a fallback was used.
const _DEV_ONLY_FALLBACK_SECRET = 'qraivy-unsubscribe-DEV-ONLY-not-a-real-secret';

function _resolveUnsubscribeSigningSecret() {
  const configured = process.env.UNSUBSCRIBE_SIGNING_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'UNSUBSCRIBE_SIGNING_SECRET environment variable is required in production. ' +
      'Set it before starting the server — unsubscribe links cannot be signed without it.'
    );
  }
  console.warn('[unsubscribeToken] UNSUBSCRIBE_SIGNING_SECRET not set — using a dev-only fallback. Do not use this outside development/test.');
  return _DEV_ONLY_FALLBACK_SECRET;
}

const UNSUBSCRIBE_SIGNING_SECRET = _resolveUnsubscribeSigningSecret();

function _toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// subscriberId and slug are already plaintext in the URL path (the whole
// point of this token is to prove they weren't tampered with, not to hide
// them), so the signed body is just their concatenation with the purpose
// string — no separate encoded payload is needed the way staffSession's
// token needs one (that token also carries an expiry that isn't otherwise
// present in its URL).
function signUnsubscribeToken(subscriberId, slug) {
  const body = String(subscriberId) + ':' + String(slug) + ':' + UNSUBSCRIBE_PURPOSE;
  return _toBase64Url(crypto.createHmac('sha256', UNSUBSCRIBE_SIGNING_SECRET).update(body).digest());
}

// Constant-time comparison, same pattern as staffSession.verifyStaffToken.
function verifyUnsubscribeToken(subscriberId, slug, token) {
  if (!subscriberId || !slug || !token || typeof token !== 'string') return false;
  const expected = signUnsubscribeToken(subscriberId, slug);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { signUnsubscribeToken, verifyUnsubscribeToken, UNSUBSCRIBE_PURPOSE };
