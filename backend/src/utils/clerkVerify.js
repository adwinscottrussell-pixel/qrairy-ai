/**
 * clerkVerify.js — verifies a Clerk session token.
 * ─────────────────────────────────────────────────────────────
 * Production (APP_ENV not "staging"): exactly the call the callers made
 * themselves before this file existed — verifyToken with the Clerk
 * secret key. Nothing is added and nothing is relaxed.
 *
 * Staging (APP_ENV=staging) holds no Clerk secret. The token is verified
 * with the Clerk instance's PUBLIC key (config/stagingPolicy.js), which
 * can check a token but can do nothing else. On top of what the library
 * checks (RSA signature, expiry, not-before, issued-at, subject), staging
 * also requires:
 *   iss  the expected Clerk instance, exactly
 *   azp  present, and one of the staging site origins
 *
 * Returns the token's payload, or throws. It never returns a payload for
 * a token that failed any check, and it knows no user identities: who may
 * use staging is decided afterwards by the allowlist in stagingGate.js.
 * ─────────────────────────────────────────────────────────────
 */

const { verifyToken } = require('@clerk/backend');
const stagingPolicy = require('../config/stagingPolicy');

async function verifyClerkToken(token) {
  if (!stagingPolicy.policy) {
    return verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  }

  const { jwtKey, issuer, authorizedParties } = stagingPolicy.policy.clerk;
  const payload = await verifyToken(token, { jwtKey, authorizedParties });
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) throw new Error('Token has no subject.');
  if (payload.iss !== issuer) throw new Error('Token was not issued by the expected Clerk instance.');
  if (typeof payload.azp !== 'string' || !authorizedParties.includes(payload.azp)) throw new Error('Token was not issued for the staging site.');
  return payload;
}

module.exports = { verifyClerkToken };
