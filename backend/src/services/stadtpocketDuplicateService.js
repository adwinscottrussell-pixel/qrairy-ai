/**
 * stadtpocketDuplicateService.js — Phase 1B (AI Business Onboarding).
 * ─────────────────────────────────────────────────────────────
 * Advisory duplicate detection for the research pipeline. initializeDraft()
 * in stadtpocketManagerService.js has no real duplicate check today (see
 * its own header comment: a city can hold many businesses, only slug
 * collision is guarded) -- this fills that gap for the NEW research
 * flow specifically, without changing initializeDraft()'s existing
 * behavior for manual entry.
 *
 * Read-only: this file never writes anything. It exists so a future
 * caller (the not-yet-built draft-creation step, Phase 1D) can decide
 * whether to block, warn, or proceed -- this service only classifies,
 * it never itself prevents a write.
 *
 * Matching is against StadtPocketListingLocation rows already in the
 * SAME city (locationId) only -- a business in a different city is
 * never considered a duplicate of one being researched here, matching
 * every other StadtPocket write path's existing city-scoping.
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');
const { slugify } = require('./stadtpocketManagerService');

const STATUS = {
  NEW: 'NEW',
  POSSIBLE_MATCH: 'POSSIBLE_MATCH',
  ALREADY_DRAFT: 'ALREADY_DRAFT',
  ALREADY_PUBLISHED: 'ALREADY_PUBLISHED',
};

function normalizeWebsite(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return null;
  }
}

function normalizePhone(phone) {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null; // too short to be a meaningful match key
}

function normalizeAddress(address) {
  if (typeof address !== 'string' || !address.trim()) return null;
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeName(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  return slugify(name); // reuses the exact German-transliterating slugify already used for real slugs
}

/**
 * Read-only. Compares the given candidate identity against every
 * StadtPocketListingLocation in the same city and returns an advisory
 * classification -- never blocks or writes anything itself.
 */
async function checkForDuplicateListing({ locationId, businessName, websiteUrl, phone, address }) {
  const targetWebsite = normalizeWebsite(websiteUrl);
  const targetPhone = normalizePhone(phone);
  const targetAddress = normalizeAddress(address);
  const targetName = normalizeName(businessName);

  const rows = await prisma.stadtPocketListingLocation.findMany({
    where: { locationId },
    include: { listing: true },
  });

  const matches = [];
  for (const row of rows) {
    const listing = row.listing;
    const matchedOn = [];
    if (targetWebsite && normalizeWebsite(row.website) === targetWebsite) matchedOn.push('website');
    if (targetPhone && normalizePhone(row.phone) === targetPhone) matchedOn.push('phone');
    if (targetAddress && normalizeAddress(row.address) === targetAddress) matchedOn.push('address');
    if (targetName && normalizeName(listing.name) === targetName) matchedOn.push('name');
    if (matchedOn.length) {
      matches.push({
        listingLocationId: row.id,
        listingId: listing.id,
        name: listing.name,
        slug: listing.slug,
        publicationStatus: row.publicationStatus,
        matchedOn,
      });
    }
  }

  if (!matches.length) return { status: STATUS.NEW, matches: [] };

  // Strong-identity match (website/phone/address, not name alone) is
  // required before this can ever escalate to ALREADY_DRAFT/
  // ALREADY_PUBLISHED -- a name-only match is always advisory
  // (POSSIBLE_MATCH), regardless of that row's own publicationStatus,
  // since business names collide legitimately (chains, common names)
  // far more often than a phone/address/website does.
  const strongMatches = matches.filter((m) => m.matchedOn.some((f) => f !== 'name'));
  if (!strongMatches.length) {
    return { status: STATUS.POSSIBLE_MATCH, matches };
  }
  if (strongMatches.some((m) => m.publicationStatus === 'published')) {
    return { status: STATUS.ALREADY_PUBLISHED, matches };
  }
  if (strongMatches.some((m) => m.publicationStatus === 'draft')) {
    return { status: STATUS.ALREADY_DRAFT, matches };
  }
  return { status: STATUS.POSSIBLE_MATCH, matches };
}

module.exports = {
  STATUS,
  checkForDuplicateListing,
  // exported for direct unit testing only
  normalizeWebsite,
  normalizePhone,
  normalizeAddress,
  normalizeName,
};
