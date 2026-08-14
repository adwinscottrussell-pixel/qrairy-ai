// ============================================================
// customerIdentityService.js — Canonical Customer Foundation, Phase 2.
//
// The ONE place in the backend that resolves or creates a canonical
// Customer + CustomerIdentity row. Every dual-write call site must go
// through this file — never duplicate this resolution logic inside a
// controller. Phase 2 is additive-only infrastructure: it runs alongside
// the existing Subscriber / WebPushSubscription / Pass / LoyaltyCustomer
// writes, never in place of them, and its own failure must never affect
// the response those existing writes already produce.
//
// Tenant isolation is mandatory and non-negotiable: every resolution is
// scoped by `ownerUserId` (the authenticated business owner — the same
// value already used as LandingPage.userId), never by `type`+`value`
// alone. The same cid, email, or any other identity value seen under two
// different ownerUserIds always resolves to two separate Customer rows —
// see docs/architecture/CUSTOMER_FOUNDATION.md for why this matters (cid
// in particular is a shared-browser token with no tenant awareness at
// generation time).
//
// This service never infers a relationship. It only ever records an
// identity as belonging to a Customer when the calling code already
// deterministically knows that, in the current request, from data it
// already trusts (e.g. "this cid was just used to create this Pass").
// Nothing here backfills historical data — see Phase 3 for that, not yet
// started.
// ============================================================

const prisma = require('../utils/prismaClient');

/**
 * Resolve (or create) the canonical Customer + CustomerIdentity for one
 * identity signal, scoped to one business tenant. Idempotent: calling
 * this again with the same (ownerUserId, type, value) returns the same
 * Customer and does not create a duplicate CustomerIdentity row — it
 * updates `lastSeenAt` instead.
 *
 * @param {Object} params
 * @param {string|null|undefined} params.ownerUserId - REQUIRED. The
 *   authenticated business owner this identity belongs to. If falsy, this
 *   function is a safe no-op (returns null) — a flow that cannot
 *   determine its own tenant must never guess one.
 * @param {string} params.type - "cid" | "email" | "wallet_serial" |
 *   "push_endpoint" | "phone" | "whatsapp" | "external_crm"
 * @param {string|null|undefined} params.value - the identity value
 *   itself (e.g. the cid string, the normalized email). Falsy => no-op.
 * @param {string|null} [params.slug] - optional first-touch/context slug.
 * @param {string|null} [params.source] - e.g. "landing_page_signup",
 *   "wallet_enrollment_apple", "loyalty_stamp".
 * @param {boolean} [params.verified] - whether this identity value is
 *   independently verified (e.g. a confirmed email). Defaults to false.
 * @returns {Promise<{customerId: string, identityId: string, created: boolean}|null>}
 *   null on any failure or missing required input — never throws.
 */
async function resolveOrCreateCustomerIdentity({ ownerUserId, type, value, slug = null, source = null, verified = false }) {
  try {
    if (!ownerUserId || !type || !value) {
      // Cannot safely resolve a tenant-scoped identity without a tenant.
      // Silent no-op by design — see module comment. Callers already log
      // their own context; this stays quiet to avoid duplicate noise.
      return null;
    }

    const existing = await prisma.customerIdentity.findUnique({
      where: { ownerUserId_type_value: { ownerUserId, type, value } }
    });

    if (existing) {
      return await touchExisting(existing, verified);
    }

    // Concurrency strategy: optimistic create, recover on conflict.
    // The find-then-create above is NOT itself race-safe — two concurrent
    // requests for the same brand-new (ownerUserId, type, value) can both
    // reach this point believing no row exists. Correctness comes from
    // the @@unique([ownerUserId, type, value]) DB constraint, not from the
    // find above: Customer + CustomerIdentity are created together inside
    // one transaction, so if the identity insert hits that unique
    // constraint (Prisma error code P2002), the whole transaction —
    // including the Customer row — rolls back atomically (no orphaned
    // Customer left behind), and this re-reads the row the OTHER request
    // just won the race to create, converging both callers on the same
    // canonical Customer.
    const now = new Date();
    try {
      const created = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            ownerUserId,
            slug,
            source,
            firstSeenAt: now,
            lastActivityAt: now,
            // primaryEmail is intentionally NOT set here even when
            // type === 'email' — promoting an identity to the Customer's
            // primary contact fields is a later-phase decision, not an
            // automatic side effect of identity creation.
          }
        });
        const identity = await tx.customerIdentity.create({
          data: { customerId: customer.id, ownerUserId, slug, type, value, source, verified, verifiedAt: verified ? now : null }
        });
        return { customerId: customer.id, identityId: identity.id };
      });

      console.log('[CustomerIdentity] created new Customer:', created.customerId, 'via', type, 'owner:', ownerUserId);
      return { customerId: created.customerId, identityId: created.identityId, created: true };
    } catch (createErr) {
      if (createErr && createErr.code === 'P2002') {
        // Lost the race — another concurrent request created this exact
        // identity first. Re-read and converge on their Customer instead
        // of erroring out.
        const winner = await prisma.customerIdentity.findUnique({
          where: { ownerUserId_type_value: { ownerUserId, type, value } }
        });
        if (winner) {
          console.log('[CustomerIdentity] lost create race, converged on existing:', type, 'owner:', ownerUserId, 'customer:', winner.customerId);
          return await touchExisting(winner, verified);
        }
      }
      throw createErr;
    }
  } catch (e) {
    // Canonical dual-write failures must never surface to the caller as
    // an error, and must never contain the raw identity value (email/cid)
    // in the log — only enough context to investigate.
    console.error('[CustomerIdentity] resolve/create failed:', type, 'owner:', ownerUserId, '-', e.message);
    return null;
  }
}

async function touchExisting(existing, verified) {
  await prisma.customerIdentity.update({
    where: { id: existing.id },
    data: { lastSeenAt: new Date(), ...(verified ? { verified: true, verifiedAt: existing.verifiedAt || new Date() } : {}) }
  });
  await prisma.customer.update({
    where: { id: existing.customerId },
    data: { lastActivityAt: new Date() }
  }).catch(() => {}); // best-effort; never fatal to the identity resolution itself
  console.log('[CustomerIdentity] resolved existing:', existing.type, 'owner:', existing.ownerUserId, 'customer:', existing.customerId);
  return { customerId: existing.customerId, identityId: existing.id, created: false };
}

/**
 * Attach a SECOND identity to an already-resolved Customer, only when the
 * calling code has deterministic proof (within the same request/flow)
 * that both identities belong to the same person — e.g. the cid that was
 * just used to create a wallet Pass, so the resulting serial belongs to
 * that same cid's Customer. Never call this to guess a relationship from
 * timing, slug, or similarity — see docs/architecture/CUSTOMER_FOUNDATION.md's
 * merge-safety rules.
 *
 * Idempotent — safe to call repeatedly for the same (ownerUserId, type,
 * value); does not create a duplicate or move the identity to a
 * different Customer if one already exists under this tenant.
 */
async function attachDeterministicIdentity({ customerId, ownerUserId, type, value, slug = null, source = null, verified = false }) {
  try {
    if (!customerId || !ownerUserId || !type || !value) return null;

    const existing = await prisma.customerIdentity.findUnique({
      where: { ownerUserId_type_value: { ownerUserId, type, value } }
    });
    if (existing) {
      // Already resolved (possibly to a different Customer than the one
      // passed in) — never reassign an existing identity's owner here;
      // that is a merge decision, explicitly out of scope for Phase 2.
      await prisma.customerIdentity.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
      return { identityId: existing.id, customerId: existing.customerId, created: false };
    }

    try {
      const identity = await prisma.customerIdentity.create({
        data: { customerId, ownerUserId, slug, type, value, source, verified, verifiedAt: verified ? new Date() : null }
      });
      console.log('[CustomerIdentity] attached', type, 'to existing customer:', customerId);
      return { identityId: identity.id, customerId, created: true };
    } catch (createErr) {
      // Same race-recovery strategy as resolveOrCreateCustomerIdentity.
      if (createErr && createErr.code === 'P2002') {
        const winner = await prisma.customerIdentity.findUnique({
          where: { ownerUserId_type_value: { ownerUserId, type, value } }
        });
        if (winner) {
          await prisma.customerIdentity.update({ where: { id: winner.id }, data: { lastSeenAt: new Date() } });
          return { identityId: winner.id, customerId: winner.customerId, created: false };
        }
      }
      throw createErr;
    }
  } catch (e) {
    console.error('[CustomerIdentity] attach failed:', type, 'owner:', ownerUserId, '-', e.message);
    return null;
  }
}

module.exports = { resolveOrCreateCustomerIdentity, attachDeterministicIdentity };
