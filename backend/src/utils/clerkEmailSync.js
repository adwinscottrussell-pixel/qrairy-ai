/**
 * clerkEmailSync.js — Resolves a Clerk user's canonical primary email.
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for "what is this Clerk user's real email,"
 * reused by both the live sync path (qrController.js's upsertUser) and the
 * offline backfill script (scripts/backfill-user-email-from-clerk.js).
 *
 * Never derives or guesses an email. Reads Clerk's own
 * `primaryEmailAddressId` to pick the actual primary address out of
 * `emailAddresses` — the same @clerk/backend client construction already
 * used in middleware/adminMiddleware.js, not a new integration.
 * ─────────────────────────────────────────────────────────────
 */

// Constructed lazily, on first real use, not at module load -- so simply
// requiring this file (e.g. transitively, via qrController.js) never
// depends on @clerk/backend exporting createClerkClient. Several existing
// test files mock @clerk/backend with only { verifyToken }, which is a
// perfectly valid mock for what they test; constructing a client eagerly
// here would break those unrelated to this fix.
let clerk = null;
function getClerkClient() {
  if (!clerk) {
    const { createClerkClient } = require('@clerk/backend');
    clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }
  return clerk;
}

// Given a full Clerk user object (from clerk.users.getUser()), returns
// their canonical primary email, or null if they have none set. A user
// with zero email addresses, or whose primaryEmailAddressId doesn't match
// any address in the array, resolves to null -- never falls back to
// guessing e.g. emailAddresses[0].
function resolvePrimaryEmail(clerkUser) {
  if (!clerkUser) return null;
  const addresses = clerkUser.emailAddresses || [];
  const primary = addresses.find((e) => e.id === clerkUser.primaryEmailAddressId);
  return primary?.emailAddress || null;
}

// Fetches a Clerk user by id and resolves their primary email in one call.
// Returns null (never throws) if the user doesn't exist in Clerk or the
// lookup fails -- callers treat "no email available yet" as a normal, safe
// outcome, not an error to propagate.
async function fetchPrimaryEmail(clerkUserId) {
  try {
    const user = await getClerkClient().users.getUser(clerkUserId);
    return resolvePrimaryEmail(user);
  } catch (err) {
    console.error('[clerkEmailSync] Failed to fetch Clerk user', clerkUserId, '-', err.message);
    return null;
  }
}

module.exports = { resolvePrimaryEmail, fetchPrimaryEmail };
