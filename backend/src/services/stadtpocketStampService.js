/**
 * stadtpocketStampService.js — StadtPocket Working Model, Step 2:
 * Bäckerei Staib real loyalty + staff stamping.
 * ─────────────────────────────────────────────────────────────
 * Authenticated business/City-Manager staff apply ONE stamp to a real
 * StadtPocket customer's per-business loyalty membership, identified
 * only by the customer's Pass.serialNumber (their one StadtPocket Pass,
 * from Step 1 -- see stadtpocketPassService.js). No rewards, no deal
 * redemption, no Wallet integration here -- later steps.
 *
 * Trust boundary: entirely reused, not reinvented. getBridgeState()
 * (stadtpocketLoyaltyBridgeService.js) already calls
 * findListingLocationInCityOrThrow(), which calls
 * authorizeLocationAccess(locationId, scope) -- the SAME staff
 * authorization check every other StadtPocket manager write (offers,
 * updates, the loyalty bridge itself) already uses. This file makes no
 * separate authorization decision; it only proceeds once getBridgeState
 * has already proven the caller is authorized for this (locationId,
 * listingLocationId) AND that the listing has an active, enabled
 * loyalty program connected -- if either is false, this never reaches
 * customer data at all.
 *
 * Known, deliberate authorization-grain note: authorizeLocationAccess
 * checks scope at the CITY level (locationId, e.g. "Ulm"), the same
 * grain every sibling StadtPocket manager service already uses -- there
 * is no finer-grained "this staff member belongs to Staib specifically"
 * check anywhere in the codebase yet, because Staib (like most listings
 * today) has no claimed Business/BusinessLocation link. A Ulm-scoped
 * manager can therefore act on any Ulm business today, Staib included
 * -- exactly as already true for offers/updates/the loyalty bridge
 * itself, not a new gap introduced here. Cross-BUSINESS DATA isolation
 * is still guaranteed regardless: every write below is keyed to the one
 * specific, already-validated listingLocationId's own bridged slug, so
 * a call scoped to Staib's listingLocationId can never write to a
 * different business's LoyaltyCustomer/StampEntry rows.
 *
 * Customer resolution reuses Step 1 entirely: the Pass.serialNumber
 * supplied by the client resolves (via stadtpocketPassService's
 * resolveCustomerIdForPassSerial) to the canonical StadtPocket
 * Customer.id -- LoyaltyCustomer.customerId is ALWAYS that canonical id
 * for new StadtPocket rows, never a raw device token. A serialNumber
 * that doesn't resolve to a StadtPocket customer (wrong format, not
 * found, or a real but unrelated/old Pass row) is rejected with the
 * SAME generic "Invalid pass." message in every case -- never
 * distinguishing why, so a caller cannot use this endpoint to probe
 * which serials exist.
 *
 * Reward computation (rewardReady/rewardsEarned, goal-capping) is
 * explicitly NOT implemented here -- deferred to the rewards step, per
 * the approved Step 2 scope ("Do NOT implement rewards yet"). stampCount
 * is a plain, uncapped running total for now.
 */

const prisma = require('../utils/prismaClient');
const { StadtpocketManagerError } = require('./stadtpocketManagerService');
const { getBridgeState } = require('./stadtpocketLoyaltyBridgeService');
const { resolveCustomerIdForPassSerial } = require('./stadtpocketPassService');

// Matches lpController.js's existing handleStampConfirm cooldown
// (per-identity, 1 hour) -- the same anti-abuse convention already
// established for stamping in this codebase, applied here per
// (customer, business) instead of per legacy Pass row.
const STAMP_COOLDOWN_MS = 60 * 60 * 1000;

function isPlausiblePassSerial(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function assertNotInCooldown(loyaltyCustomer, now) {
  if (loyaltyCustomer.lastStampAt && now.getTime() - new Date(loyaltyCustomer.lastStampAt).getTime() < STAMP_COOLDOWN_MS) {
    throw new StadtpocketManagerError('This customer was already stamped recently. Please wait before stamping again.', 429);
  }
}

/**
 * Apply exactly one stamp to a StadtPocket customer's loyalty
 * membership at one business/location, on behalf of authenticated
 * staff.
 *
 * @param {string} locationId - the caller's QRAIVY Location id (city),
 *   e.g. Ulm -- the authorization boundary, per authorizeLocationAccess.
 * @param {string} listingLocationId - the specific StadtPocket business
 *   storefront (e.g. Staib's Ulm location) being stamped for.
 * @param {Object} scope - req.stadtpocketScope, exactly as every other
 *   StadtPocket manager write already receives it.
 * @param {string} passSerialNumber - the customer's Pass.serialNumber,
 *   supplied by staff (scanned/typed), never a Customer.id.
 * @returns {Promise<{businessName: string, slug: string, stampCount: number, requiredStamps: number}>}
 *   Never includes customerId, passId, or any other internal identifier.
 */
async function applyStaffStamp(locationId, listingLocationId, scope, passSerialNumber) {
  const bridgeState = await getBridgeState(locationId, listingLocationId, scope);
  if (!bridgeState.connected) {
    throw new StadtpocketManagerError('Loyalty is not enabled for this business.', 400);
  }
  const { slug, businessName, requiredStamps } = bridgeState.program;

  if (!isPlausiblePassSerial(passSerialNumber)) {
    throw new StadtpocketManagerError('Invalid pass.', 404);
  }

  const pass = await prisma.pass.findUnique({ where: { serialNumber: passSerialNumber } });
  if (!pass) {
    throw new StadtpocketManagerError('Invalid pass.', 404);
  }

  const customerId = await resolveCustomerIdForPassSerial(passSerialNumber);
  if (!customerId) {
    // A real Pass row exists but is not a StadtPocket canonical
    // customer's platform Pass (e.g. an old per-business QRAIVY Pass) --
    // same generic message as "not found", never distinguished.
    throw new StadtpocketManagerError('Invalid pass.', 404);
  }

  const now = new Date();
  const membershipKey = { slug_customerId: { slug, customerId } };

  let loyaltyCustomer = await prisma.loyaltyCustomer.findUnique({ where: membershipKey });

  if (loyaltyCustomer) {
    assertNotInCooldown(loyaltyCustomer, now);
    loyaltyCustomer = await prisma.loyaltyCustomer.update({
      where: membershipKey,
      data: { stampCount: { increment: 1 }, totalStamps: { increment: 1 }, lastStampAt: now },
    });
  } else {
    try {
      loyaltyCustomer = await prisma.loyaltyCustomer.create({
        data: { slug, customerId, stampCount: 1, totalStamps: 1, lastStampAt: now },
      });
    } catch (err) {
      if (err && err.code === 'P2002') {
        // Lost a first-stamp race -- another concurrent request just
        // created this exact membership. Re-check cooldown against the
        // WINNER's row (its lastStampAt is effectively "now"), so this
        // request is correctly rejected as a duplicate rather than
        // silently applying a second stamp for the same real-world tap.
        const winner = await prisma.loyaltyCustomer.findUnique({ where: membershipKey });
        assertNotInCooldown(winner, now);
        loyaltyCustomer = await prisma.loyaltyCustomer.update({
          where: membershipKey,
          data: { stampCount: { increment: 1 }, totalStamps: { increment: 1 }, lastStampAt: now },
        });
      } else {
        throw err;
      }
    }
  }

  // StampEntry.passId has no enforced FK in this schema (a plain string,
  // same convention as LoyaltyCustomer.customerId) -- pointing it at the
  // customer's own Step 1 platform Pass.id (already resolved above) is
  // structurally correct and requires no schema change.
  await prisma.stampEntry.create({ data: { slug, passId: pass.id, source: 'stadtpocket_staff_stamp' } });

  return {
    businessName,
    slug,
    stampCount: loyaltyCustomer.stampCount,
    requiredStamps,
  };
}

module.exports = { applyStaffStamp, STAMP_COOLDOWN_MS };
