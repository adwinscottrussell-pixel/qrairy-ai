/**
 * stadtpocketCustomerLoyaltyService.js — StadtPocket Working Model:
 * customer-facing loyalty progress (READ ONLY).
 * ─────────────────────────────────────────────────────────────
 * Lets a customer see their OWN business-specific loyalty balance (e.g.
 * Bäckerei Staib 1 / 8) on the consumer Stempelkarte screen. The
 * customer-side mirror of stadtpocketStampService.js's staff
 * lookupPassForStamping -- same data, different credential:
 *
 *   - Customer identity comes ONLY from the customer's own persisted
 *     deviceToken (a 192-bit secret that never leaves their device),
 *     resolved FIND-ONLY via resolveCustomerIdForDeviceToken(). Never the
 *     Pass.serialNumber: that value is displayed on screen, typed in by
 *     staff, and will later sit in a QR code, so it must never double as
 *     a credential for reading someone's balance.
 *   - Business identity comes from the public (citySlug, listingSlug)
 *     pair, resolved through exactly the same published-storefront +
 *     loyalty-bridge rule stadtpocketPublicService.getCityBusiness()
 *     already uses to decide whether a Stempelkarte exists at all -- so
 *     the program shown here can never disagree with the one the public
 *     business endpoint advertises.
 *   - The (slug, customerId) membership key is derived entirely
 *     server-side. Changing listingSlug only selects which of the SAME
 *     customer's own business-specific rows is read -- there is no input
 *     that selects a different customer.
 *
 * Strictly read-only: findUnique/findMany only. Never creates a
 * Customer, CustomerIdentity, Pass, LoyaltyCustomer, or StampEntry, and
 * never updates any row (no lastSeenAt/lastActivityAt touch either).
 *
 * Response never includes customerId, any internal row id, the Pass
 * serialNumber, landingPageId, or the deviceToken itself.
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');
const { findCityLocation } = require('./stadtpocketPublicService');
const { resolveCustomerIdForDeviceToken } = require('./stadtpocketPassService');

const PUBLISHED = 'published';

class CustomerLoyaltyError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function normalizeSlug(slug) {
  return String(slug || '').trim().toLowerCase();
}

/**
 * @param {string} citySlug
 * @param {string} listingSlug
 * @param {string} deviceToken - the customer's own persisted token.
 * @returns {Promise<{loyalty: null} | {loyalty: {businessName: string, stampCount: number, requiredStamps: number, rewardName: string, member: boolean}}>}
 * @throws {CustomerLoyaltyError} 401 for any malformed/unknown token (one
 *   generic message, never distinguishing why), 404 for an unknown
 *   city/unpublished business.
 */
async function getCustomerLoyaltyForBusiness(citySlug, listingSlug, deviceToken) {
  const customerId = await resolveCustomerIdForDeviceToken(deviceToken);
  if (!customerId) {
    throw new CustomerLoyaltyError('Unknown pass.', 401);
  }

  const location = await findCityLocation(citySlug);
  const normalizedListingSlug = normalizeSlug(listingSlug);
  if (!location || !normalizedListingSlug) {
    throw new CustomerLoyaltyError('Business not found.', 404);
  }

  // Same query shape and ordering as getCityBusiness(): all published
  // storefronts of this listing in this city, oldest first.
  const listingLocations = await prisma.stadtPocketListingLocation.findMany({
    where: {
      locationId: location.id,
      publicationStatus: PUBLISHED,
      listing: { slug: normalizedListingSlug },
    },
    include: { listing: true, loyaltyLandingPage: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!listingLocations.length) {
    throw new CustomerLoyaltyError('Business not found.', 404);
  }

  // First storefront with an enabled, bridged program wins -- the same
  // storefront the consumer frontend's toPublicLoyalty() picks from the
  // public business response, so both always describe one program.
  const loyaltySlugs = [
    ...new Set(listingLocations.map((ll) => ll.loyaltyLandingPage && ll.loyaltyLandingPage.slug).filter(Boolean)),
  ];
  if (!loyaltySlugs.length) return { loyalty: null };

  const enabledSettings = await prisma.stampSettings.findMany({ where: { slug: { in: loyaltySlugs }, enabled: true } });
  const settingsBySlug = new Map(enabledSettings.map((s) => [s.slug, s]));

  let program = null;
  for (const ll of listingLocations) {
    const slug = ll.loyaltyLandingPage && ll.loyaltyLandingPage.slug;
    const settings = slug && settingsBySlug.get(slug);
    if (settings) {
      program = { slug, settings, businessName: ll.listing.name };
      break;
    }
  }
  if (!program) return { loyalty: null };

  const membership = await prisma.loyaltyCustomer.findUnique({
    where: { slug_customerId: { slug: program.slug, customerId } },
  });

  // Explicit allow-list -- nothing from `membership` or `settings` is
  // spread into the response.
  return {
    loyalty: {
      businessName: program.businessName,
      stampCount: membership ? membership.stampCount : 0,
      requiredStamps: program.settings.goal,
      rewardName: program.settings.rewardName,
      member: !!membership,
    },
  };
}

module.exports = { getCustomerLoyaltyForBusiness, CustomerLoyaltyError };
