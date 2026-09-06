// ============================================================
// stadtpocketPublicService.js — Independent StadtPocket Listing
// Foundation, Phase 1. Multi-storefront public API semantics correction.
//
// Read-only, unauthenticated data access for the public StadtPocket city
// directory (GET /public/stadtpocket/cities/:citySlug/businesses[/:listingSlug]).
// See the "Independent StadtPocket Listing architecture" review.
//
// Data source: Location -> StadtPocketListingLocation -> StadtPocketListing.
// Business/BusinessLocation are NEVER read here -- publication and
// ownership are independent axes (architecture review rule). A listing
// with businessId = null (never claimed) is exactly as visible as one
// with businessId set (claimed/connected), for identical publicationStatus.
//
// Visibility rule (exact): a StadtPocketListingLocation appears for a
// city if and only if its publicationStatus === 'published'. That is
// the ONLY gate. Ownership/claim state never affects visibility, and is
// never read for this decision.
//
// Multi-storefront correction: StadtPocketListing (the brand) is the
// public business identity; StadtPocketListingLocation (a storefront) is
// never a second, competing public identity. Concretely:
//   - the LIST endpoint returns ONE card per listing per city, no matter
//     how many published storefronts that listing has in that city
//   - the DETAIL endpoint returns ONE listing object with ALL of that
//     listing's published storefronts in the requested city, nested
//     under `locations[]` -- never an arbitrary single pick
// This also removes the prior deterministic-but-semantically-wrong
// "earliest-created storefront wins" resolution entirely -- there is no
// longer a single storefront to arbitrarily prefer.
//
// Never returns: StadtPocketListing.id/businessId/createdBy/
// sourceProvider/sourceUrl/sourceType/verifiedAt/verifiedBy,
// StadtPocketListingLocation.id/listingId/locationId/businessLocationId/
// sourceProvider/sourceUrl/sourceType/verifiedAt/verifiedBy, or anything
// from Business/BusinessLocation -- this is a public surface, ownership/
// admin/provenance data has no business being on it.
//
// Never fabricates: no deals field (no Deal model exists), no rating/
// reviews/loyalty/qraivyLandingUrl/logoUrl/coverImage/gallery -- none of
// those exist in this phase. Optional fields are omitted from the
// response when absent, never sent as null/placeholder values. Brand-
// level fields (address, phone, hours, etc. were NEVER brand-level to
// begin with) are never picked from one arbitrary storefront and
// presented as if they represent the whole brand.
//
// Phase 6D.2 addition: headerImage, when the listing has one, is
// included as { url, width, height } only -- publicId is Cloudinary's
// own internal asset identifier and has no public purpose, so it is
// never included here, matching this file's existing "no
// internal/admin/provenance data" rule. Read directly from the LIVE
// StadtPocketListing.headerImage column, never from draftData -- an
// in-progress draft image is exactly as unreachable from this file as
// any other in-progress draft edit (see that column's own schema
// comment). Absent entirely (not null) when no header image has ever
// been published, per this file's own "omit when absent" convention.
// ============================================================

const prisma = require('../utils/prismaClient');

const PUBLISHED = 'published';

function normalizeSlug(slug) {
  return String(slug || '').trim().toLowerCase();
}

async function findCityLocation(citySlug) {
  const normalized = normalizeSlug(citySlug);
  if (!normalized) return null;
  const location = await prisma.location.findUnique({ where: { slug: normalized } });
  if (!location || location.type !== 'city') return null;
  return location;
}

// Card-level shape for the list endpoint -- brand-level fields only, no
// physical/storefront-level fields (address/phone/hours are a detail-page
// concern, and picking one storefront's values to represent the whole
// brand on the card would misrepresent a multi-storefront listing).
// Shared by toListItem/toDetailItem -- see this file's Phase 6D.2
// header comment for what is and isn't included.
function pickPublicHeaderImage(listing) {
  if (!listing.headerImage || !listing.headerImage.url) return undefined;
  return { url: listing.headerImage.url, width: listing.headerImage.width, height: listing.headerImage.height };
}

function toListItem(listing) {
  const item = {
    slug: listing.slug,
    name: listing.name,
    category: listing.category,
  };
  if (listing.subCategory) item.subCategory = listing.subCategory;
  const headerImage = pickPublicHeaderImage(listing);
  if (headerImage) item.headerImage = headerImage;
  return item;
}

// One storefront's shape, nested inside the detail response's locations[].
function toLocationItem(listingLocation) {
  const item = { address: listingLocation.address };
  if (listingLocation.latitude != null && listingLocation.longitude != null) {
    item.coordinates = { lat: listingLocation.latitude, lng: listingLocation.longitude };
  }
  if (listingLocation.phone) item.phone = listingLocation.phone;
  if (listingLocation.website) item.website = listingLocation.website;
  if (listingLocation.hours && Array.isArray(listingLocation.hours) && listingLocation.hours.length) {
    item.hours = listingLocation.hours;
  }
  return item;
}

// Full shape for the detail endpoint -- brand-level fields plus every
// published storefront this listing has in the requested city.
function toDetailItem(listing, listingLocations) {
  const item = {
    slug: listing.slug,
    name: listing.name,
    category: listing.category,
  };
  if (listing.subCategory) item.subCategory = listing.subCategory;
  if (listing.tags && listing.tags.length) item.tags = listing.tags;
  if (listing.shortDescription) item.shortDescription = listing.shortDescription;
  if (listing.longDescription) item.longDescription = listing.longDescription;
  const headerImage = pickPublicHeaderImage(listing);
  if (headerImage) item.headerImage = headerImage;
  item.locations = listingLocations.map(toLocationItem);
  return item;
}

async function listCityBusinesses(citySlug) {
  const location = await findCityLocation(citySlug);
  if (!location) return null;

  const listingLocations = await prisma.stadtPocketListingLocation.findMany({
    where: { locationId: location.id, publicationStatus: PUBLISHED },
    include: { listing: true },
  });

  // One card per listing, not per storefront -- a listing with several
  // published storefronts in this city (e.g. two Ulm branches of the
  // same bakery) must appear exactly once in the discovery list. First
  // occurrence's listing row is used for the card; listing content is
  // identical across all of a listing's storefronts, so there is no
  // "which one wins" choice being made here (unlike storefront-level
  // fields, which are never collapsed onto the card at all).
  const seen = new Map();
  for (const ll of listingLocations) {
    if (!seen.has(ll.listingId)) {
      seen.set(ll.listingId, toListItem(ll.listing));
    }
  }

  const businesses = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    city: { slug: location.slug, name: location.name },
    businesses,
  };
}

async function getCityBusiness(citySlug, listingSlug) {
  const location = await findCityLocation(citySlug);
  if (!location) return null;

  const normalizedListingSlug = normalizeSlug(listingSlug);
  if (!normalizedListingSlug) return null;

  // ALL published storefronts for this listing in this city, not one
  // arbitrarily picked -- see the module header comment. Ordered only
  // for a stable, predictable locations[] array; ordering is never used
  // to select a "winner" any more.
  const listingLocations = await prisma.stadtPocketListingLocation.findMany({
    where: {
      locationId: location.id,
      publicationStatus: PUBLISHED,
      listing: { slug: normalizedListingSlug },
    },
    include: { listing: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!listingLocations.length) return null;

  return toDetailItem(listingLocations[0].listing, listingLocations);
}

module.exports = {
  listCityBusinesses,
  getCityBusiness,
  // exported for direct unit testing only
  toListItem,
  toLocationItem,
  toDetailItem,
};
