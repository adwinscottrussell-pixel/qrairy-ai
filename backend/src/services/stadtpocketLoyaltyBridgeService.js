/**
 * stadtpocketLoyaltyBridgeService.js — Stempelkarte Phase 2: connect an
 * EXISTING QRAIVY loyalty program (LandingPage + StampSettings) to a
 * StadtPocketListingLocation via the loyaltyLandingPageId bridge column
 * (schema added Phase 6D, commit 050ac9e; read by the public API in
 * Phase 1, commit 2964028).
 * ─────────────────────────────────────────────────────────────
 * NOT a second loyalty system: StampSettings/LandingPage/LoyaltyCustomer
 * are never created, modified, or duplicated here — this file only
 * reads and writes the single bridge column, and only ever reads
 * StampSettings/LandingPage (never LoyaltyCustomer — customer-specific
 * data has no business being anywhere in an Admin-configuration flow
 * either, not just the public API).
 *
 * Authorization: reuses stadtpocketManagerService.js's exact
 * findListingLocationInCityOrThrow (which itself calls
 * authorizeLocationAccess) — the same requireStadtpocketWriteScope-
 * derived `scope` object, the same "never trust a caller-supplied id"
 * posture every other route in this namespace already uses. This file
 * makes no separate authorization decision of its own.
 *
 * Eligibility (which programs may be connected) is a SEPARATE check on
 * top of that authorization, since a Global Admin and a scoped City
 * Manager have different trust levels for THIS specific action:
 *   - Global Admin is already unrestricted platform-wide in this
 *     namespace (bypasses every locationIds check) -- extending that
 *     same trust to "which existing, enabled loyalty program may be
 *     connected" is not a new exception, just the existing one applied
 *     here too. May search/select any LandingPage with an enabled
 *     StampSettings program.
 *   - A scoped City Manager may only connect a program whose
 *     LandingPage.businessId matches the SAME claimed Business as the
 *     target StadtPocketListingLocation's own businessLocationId (see
 *     BusinessLocation's schema comment). That claim link, like the
 *     loyalty bridge itself, is not yet populated for most/any real
 *     listings today -- an unclaimed listing correctly has ZERO
 *     eligible programs, not a bug (see this file's own tests).
 *
 * A caller-supplied landingPageId is NEVER trusted merely because it
 * appeared in an "eligible" list the frontend was shown earlier —
 * connectProgram() independently re-derives eligibility server-side,
 * every time, before writing anything.
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');
const {
  StadtpocketManagerError,
  findListingLocationInCityOrThrow,
} = require('./stadtpocketManagerService');

// Business-level, admin-authenticated shape for a loyalty program.
// Deliberately never StampSettings.id/color, LandingPage.userId/
// websiteUrl/useCase, or anything from LoyaltyCustomer — an
// authenticated Admin caller still has no business seeing customer-
// specific data or unrelated internal identifiers through this flow.
function toProgramSummary(landingPage, stampSettings) {
  return {
    landingPageId: landingPage.id,
    slug: landingPage.slug,
    businessName: landingPage.businessName,
    requiredStamps: stampSettings.goal,
    rewardTitle: stampSettings.rewardName,
  };
}

// The claim link a scoped (non-Global-Admin) caller's eligibility is
// checked against. Null whenever the listing hasn't been claimed yet
// (the common case today) — never fabricated, never inferred another way.
async function resolveClaimedBusinessId(listingLocation) {
  if (!listingLocation.businessLocationId) return null;
  const businessLocation = await prisma.businessLocation.findUnique({
    where: { id: listingLocation.businessLocationId },
  });
  return businessLocation ? businessLocation.businessId : null;
}

// ── List eligible programs (for the "Stempelkarte verbinden" picker) ──
async function listEligiblePrograms(locationId, listingLocationId, scope, query = {}) {
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);

  let landingPages;
  if (scope.isGlobalAdmin) {
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
    landingPages = await prisma.landingPage.findMany({
      where: q ? { slug: { contains: q } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  } else {
    const businessId = await resolveClaimedBusinessId(listingLocation);
    if (!businessId) return [];
    landingPages = await prisma.landingPage.findMany({ where: { businessId } });
  }

  if (!landingPages.length) return [];
  const slugs = landingPages.map((lp) => lp.slug);
  const settingsRows = await prisma.stampSettings.findMany({ where: { slug: { in: slugs }, enabled: true } });
  const settingsBySlug = new Map(settingsRows.map((s) => [s.slug, s]));

  return landingPages
    .filter((lp) => settingsBySlug.has(lp.slug))
    .map((lp) => toProgramSummary(lp, settingsBySlug.get(lp.slug)));
}

// ── Current bridge state (for the Stempelkarte section's own display) ──
async function getBridgeState(locationId, listingLocationId, scope) {
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  if (!listingLocation.loyaltyLandingPageId) return { connected: false };

  const landingPage = await prisma.landingPage.findUnique({ where: { id: listingLocation.loyaltyLandingPageId } });
  // Dangling bridge should be impossible (ON DELETE SET NULL on the FK)
  // but this is never trusted blindly -- an honest "not connected" if
  // the linked row is somehow gone, not a crash.
  if (!landingPage) return { connected: false };

  const settings = await prisma.stampSettings.findUnique({ where: { slug: landingPage.slug } });
  if (!settings || !settings.enabled) return { connected: false };

  return { connected: true, program: toProgramSummary(landingPage, settings) };
}

// ── Connect ──────────────────────────────────────────────────────
async function connectProgram(locationId, listingLocationId, scope, landingPageId) {
  if (!landingPageId || typeof landingPageId !== 'string') {
    throw new StadtpocketManagerError('landingPageId is required.');
  }
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);

  const landingPage = await prisma.landingPage.findUnique({ where: { id: landingPageId } });
  if (!landingPage) throw new StadtpocketManagerError('Loyalty program not found.', 404);

  const settings = await prisma.stampSettings.findUnique({ where: { slug: landingPage.slug } });
  if (!settings || !settings.enabled) {
    throw new StadtpocketManagerError('This LandingPage has no active loyalty program.', 400);
  }

  // Server-side ownership re-check -- independent of whatever the
  // frontend displayed as "eligible". Global Admin is exempt (see
  // header comment); every other caller must match the claimed
  // Business exactly.
  if (!scope.isGlobalAdmin) {
    const businessId = await resolveClaimedBusinessId(listingLocation);
    if (!businessId || landingPage.businessId !== businessId) {
      throw new StadtpocketManagerError('This loyalty program does not belong to this business.', 403);
    }
  }

  await prisma.stadtPocketListingLocation.update({
    where: { id: listingLocationId },
    data: { loyaltyLandingPageId: landingPageId },
  });

  return toProgramSummary(landingPage, settings);
}

// ── Disconnect ─────────────────────────────────────────────────
// Always allowed for any scope-authorized caller -- removing a link
// never needs the eligibility re-check connecting one does, and an
// already-dangling/disabled bridge must still be clearable.
async function disconnectProgram(locationId, listingLocationId, scope) {
  await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  await prisma.stadtPocketListingLocation.update({
    where: { id: listingLocationId },
    data: { loyaltyLandingPageId: null },
  });
  return { connected: false };
}

module.exports = {
  listEligiblePrograms,
  getBridgeState,
  connectProgram,
  disconnectProgram,
  // exported for direct unit testing only
  toProgramSummary,
  resolveClaimedBusinessId,
};
