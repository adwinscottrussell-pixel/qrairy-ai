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
  slugify,
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
// `client` defaults to the module-level `prisma` (existing callers,
// unchanged) but accepts a `tx` handle so createAndConnectProgram below
// can call this from inside its own transaction without reading through
// a separate, non-transactional connection.
async function resolveClaimedBusinessId(listingLocation, client = prisma) {
  if (!listingLocation.businessLocationId) return null;
  const businessLocation = await client.businessLocation.findUnique({
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

// ── Setup (Phase 3B, 2026-09-17): platform-managed loyalty anchor ──
// For an unclaimed StadtPocket business, creates a LandingPage with
// userId: null -- never a fake owner, never a fake Business, never a
// fake BusinessLocation (see Phase 3B architecture report, this date).
// The schema already models "no owner yet" as a first-class state
// (LandingPage.userId String? -- nullable), and networkAdminService.js
// already has the repair path (assignLandingPageOwner/
// mapLandingPageToBusiness) that will later adopt this exact row when
// the real owner claims the business -- this function never duplicates
// that machinery, only produces a row that fits it.

const MIN_GOAL = 2;
const MAX_GOAL = 50;
const MAX_REWARD_NAME_LENGTH = 80;

function validateGoal(goal) {
  if (typeof goal !== 'number' || !Number.isInteger(goal)) {
    throw new StadtpocketManagerError('goal must be a whole number.');
  }
  if (goal < MIN_GOAL || goal > MAX_GOAL) {
    throw new StadtpocketManagerError(`goal must be between ${MIN_GOAL} and ${MAX_GOAL}.`);
  }
  return goal;
}

function validateRewardName(rewardName) {
  if (typeof rewardName !== 'string') {
    throw new StadtpocketManagerError('rewardName is required.');
  }
  const trimmed = rewardName.trim();
  if (!trimmed) {
    throw new StadtpocketManagerError('rewardName is required.');
  }
  if (trimmed.length > MAX_REWARD_NAME_LENGTH) {
    throw new StadtpocketManagerError(`rewardName must be ${MAX_REWARD_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

// Mirrors stadtpocketManagerService.js's own generateUniqueSlug exactly
// (same slugify, same bounded-collision-loop shape) but checked against
// LandingPage.slug's own uniqueness, not StadtPocketListing's -- these
// are two separate unique namespaces in the schema, never conflated.
async function generateUniqueLandingPageSlug(tx, name) {
  const base = slugify(name) || 'stempelkarte';
  let candidate = base;
  let suffix = 1;
  for (let attempt = 0; attempt < 50; attempt++) {
    const existing = await tx.landingPage.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  throw new StadtpocketManagerError('Could not generate a unique slug.', 500);
}

// caller-supplied input is only ever { goal, rewardName } -- no id of
// any kind is accepted here, so there is no field through which a
// caller could point this at another business's LandingPage/Business/
// user. The target is derived entirely server-side from
// (locationId, listingLocationId, scope).
async function createAndConnectProgram(locationId, listingLocationId, scope, input) {
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  const goal = validateGoal(input && input.goal);
  const rewardName = validateRewardName(input && input.rewardName);

  // Everything below runs in one transaction so the public side can
  // never observe a half-created program (LandingPage without
  // StampSettings, or either without the bridge column set).
  //
  // Idempotency: the bridge/eligible-program state is re-read fresh
  // INSIDE the transaction (`fresh`, `tx.landingPage.findFirst`) rather
  // than trusting the pre-transaction `listingLocation` snapshot, so a
  // second submission -- after the first has committed -- always finds
  // and reuses the same row instead of creating another one. This does
  // not add a DB-level unique constraint or advisory lock, so it does
  // not guarantee safety against two literally-simultaneous requests;
  // that is out of scope for the smallest working model. The realistic
  // case this guards -- a resubmitted or double-clicked setup call -- is
  // fully covered.
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.stadtPocketListingLocation.findUnique({ where: { id: listingLocationId } });
    if (!fresh) throw new StadtpocketManagerError('StadtPocket listing not found for this location.', 404);

    let landingPage = null;

    // 1. Already connected -- reuse the exact same row (idempotent resubmit).
    if (fresh.loyaltyLandingPageId) {
      landingPage = await tx.landingPage.findUnique({ where: { id: fresh.loyaltyLandingPageId } });
    }

    // 2. Not connected yet, but this business is already claimed and
    // has its own LandingPage -- reuse it rather than creating a second,
    // platform-managed one alongside a real owner's existing program.
    if (!landingPage) {
      const businessId = await resolveClaimedBusinessId({ businessLocationId: fresh.businessLocationId }, tx);
      if (businessId) {
        landingPage = await tx.landingPage.findFirst({ where: { businessId } });
      }
    }

    // 3. Nothing eligible exists -- create ONE platform-managed
    // LandingPage. userId stays null; businessId stays null. No
    // Business or BusinessLocation is created here, ever.
    if (!landingPage) {
      const slug = await generateUniqueLandingPageSlug(tx, listingLocation.listing.name);
      landingPage = await tx.landingPage.create({
        data: {
          slug,
          businessName: listingLocation.listing.name,
          userId: null,
          status: 'live',
        },
      });
    }

    await tx.stampSettings.upsert({
      where: { slug: landingPage.slug },
      create: { slug: landingPage.slug, goal, rewardName, enabled: true },
      update: { goal, rewardName, enabled: true },
    });

    if (fresh.loyaltyLandingPageId !== landingPage.id) {
      await tx.stadtPocketListingLocation.update({
        where: { id: listingLocationId },
        data: { loyaltyLandingPageId: landingPage.id },
      });
    }

    return toProgramSummary(landingPage, { goal, rewardName });
  });
}

// ── Diagnostic (Phase 3B pre-work, 2026-09-17) ──────────────────
// TEMPORARY, READ-ONLY, Global-Admin-only. Checks whether this
// StadtPocket business already has a matching QRAIVY Business /
// BusinessLocation / LandingPage, using the listing's own public name
// as the search term -- the exact same case-insensitive `contains`
// pattern managerRoutes.js's own GET /manager/businesses/search already
// uses (that endpoint itself isn't reusable here: it sits behind
// requireManagerScope, a NetworkMember-only middleware with no
// Global-Admin bypass, entirely separate from requireStadtpocketWriteScope).
//
// Writes nothing, ever -- no Business/BusinessLocation/LandingPage/
// StampSettings is created, and loyaltyLandingPageId is never touched
// here. Never reads or returns LandingPage.userId, any Clerk id, or
// anything from LoyaltyCustomer -- business-level identifiers
// (name/slug/status) only.
//
// Global-Admin-only by explicit scope check (not just a hidden frontend
// button): a scoped City Manager gets 403 before any Prisma call runs,
// since the Business-name search below is broader than any other
// Phase 2/3 read in this file (it isn't confined to one already-
// authorized listingLocation's own claim state) and this is a
// temporary diagnostic, not a permanent product surface.
async function checkExistingQraivyLinkage(locationId, listingLocationId, scope) {
  if (!scope.isGlobalAdmin) {
    throw new StadtpocketManagerError('Forbidden. Global Admin only.', 403);
  }
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  const listingName = listingLocation.listing.name;

  const businesses = await prisma.business.findMany({
    where: {
      status: { not: 'archived' },
      name: { contains: listingName, mode: 'insensitive' },
    },
    select: { id: true, name: true, slug: true },
    take: 5,
  });

  if (!businesses.length) {
    return { business: null, businessLocation: null, landingPage: null };
  }

  // Diagnostic, not a picker -- report the first match's relationships,
  // and flag plainly if the name search was ambiguous rather than
  // silently guessing which one is "the" match.
  const business = businesses[0];
  const ambiguous = businesses.length > 1;

  const businessLocation = await prisma.businessLocation.findFirst({
    where: { businessId: business.id, locationId },
    select: { status: true },
  });

  // Found via businessId, so "associated with the matching Business" is
  // true by construction whenever this is non-null -- no separate check
  // needed (Step 6).
  const landingPage = await prisma.landingPage.findFirst({
    where: { businessId: business.id },
    select: { slug: true },
  });

  return {
    business: { name: business.name, slug: business.slug, ambiguous },
    businessLocation: businessLocation ? { status: businessLocation.status } : null,
    landingPage: landingPage ? { slug: landingPage.slug } : null,
  };
}

module.exports = {
  listEligiblePrograms,
  getBridgeState,
  connectProgram,
  disconnectProgram,
  createAndConnectProgram,
  checkExistingQraivyLinkage,
  // exported for direct unit testing only
  toProgramSummary,
  resolveClaimedBusinessId,
  validateGoal,
  validateRewardName,
  MIN_GOAL,
  MAX_GOAL,
  MAX_REWARD_NAME_LENGTH,
};
