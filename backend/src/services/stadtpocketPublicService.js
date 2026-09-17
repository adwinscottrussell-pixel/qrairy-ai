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
// reviews/qraivyLandingUrl/logoUrl/coverImage/gallery -- none of those
// exist in this phase. `loyalty` (business-level only, see
// toLoyaltyItem below) is the one exception, added once an existing
// QRAIVY loyalty program is actually bridged and enabled -- still never
// fabricated, just conditionally real. Optional fields are omitted from the
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

// Offers — public-safe shape only. Never listingLocationId (internal
// id), status (visibility is already fully decided before this function
// ever sees an offer -- see getCityBusiness), draftData, or createdBy
// (Clerk id) -- matching this file's existing "no internal/admin/
// provenance data" rule for listings above. isExpired is computed by
// the caller (getCityBusiness), never here and never stored -- same
// "never persisted" convention as StadtPocketOffer's own schema
// comment, kept independent of stadtpocketOfferService.js's own
// (draft-aware) merge logic on purpose: this file must never import
// anything that knows how to read draftData.
function toOfferItem(offer) {
  const item = { id: offer.id, title: offer.title, offerText: offer.offerText };
  if (offer.description) item.description = offer.description;
  if (offer.offerType) item.offerType = offer.offerType;
  if (offer.offerDetails) item.offerDetails = offer.offerDetails;
  if (offer.image && offer.image.url) {
    item.image = { url: offer.image.url, width: offer.image.width, height: offer.image.height };
  }
  if (offer.startsAt) item.startsAt = offer.startsAt;
  if (offer.endsAt) item.endsAt = offer.endsAt;
  return item;
}

// Updates (Aktuelles) — public-safe shape only. Never listingLocationId
// (internal id), status (visibility is already fully decided before
// this function ever sees an update -- see getCityBusiness), draftData,
// or createdBy (Clerk id) -- same "no internal/admin/provenance data"
// rule as toOfferItem above. Deliberately narrower than an offer: no
// offerText/offerType/offerDetails/startsAt/endsAt exist on this model
// at all (product lock, 2026-09-17) -- this is a simple business news
// post, not a second Deals shape.
function toUpdateItem(update) {
  const item = { id: update.id, title: update.title, body: update.body };
  if (update.image && update.image.url) {
    item.image = { url: update.image.url, width: update.image.width, height: update.image.height };
  }
  if (update.publishedAt) item.publishedAt = update.publishedAt;
  return item;
}

// Loyalty — business-level configuration only. Deliberately excludes
// every customer-specific field on LoyaltyCustomer (customerId, cid,
// stampCount, totalStamps, rewardsEarned, rewardReady, hasWallet, any
// stamp history) -- this is a public, unauthenticated surface, and this
// phase exposes only "does this storefront have an active loyalty
// program, and what does it take to earn the reward," never anything
// about who is asking or their personal progress. That's a deliberately
// separate, later milestone (real customer identity, not built here).
//
// Reads QRAIVY's existing loyalty engine (StampSettings, keyed by
// LandingPage.slug) through the loyaltyLandingPageId bridge already on
// StadtPocketListingLocation -- no second loyalty system, no new
// program model. `enabled` here means StampSettings.enabled, i.e. the
// business owner has actually turned the program on, not merely that a
// StampSettings row exists.
function toLoyaltyItem(stampSettings) {
  return {
    enabled: true,
    requiredStamps: stampSettings.goal,
    rewardTitle: stampSettings.rewardName,
  };
}

// One storefront's shape, nested inside the detail response's locations[].
// `offers` (already filtered to published + non-expired by the caller)
// and `loyalty` (already resolved+filtered to an enabled program by the
// caller) are each included only when present, matching every other
// optional field in this function -- omitted, never an empty array or a
// disabled/placeholder object, when there is nothing to show.
function toLocationItem(listingLocation, offers, loyalty, updates) {
  const item = { address: listingLocation.address };
  if (listingLocation.latitude != null && listingLocation.longitude != null) {
    item.coordinates = { lat: listingLocation.latitude, lng: listingLocation.longitude };
  }
  if (listingLocation.phone) item.phone = listingLocation.phone;
  if (listingLocation.website) item.website = listingLocation.website;
  if (listingLocation.hours && Array.isArray(listingLocation.hours) && listingLocation.hours.length) {
    item.hours = listingLocation.hours;
  }
  if (offers && offers.length) item.offers = offers.map(toOfferItem);
  if (loyalty) item.loyalty = loyalty;
  if (updates && updates.length) item.updates = updates.map(toUpdateItem);
  return item;
}

// Full shape for the detail endpoint -- brand-level fields plus every
// published storefront this listing has in the requested city.
// offersByLocationId / loyaltyByLocationId / updatesByLocationId:
// Map<listingLocationId, ...> -- already scoped/filtered by
// getCityBusiness before this function ever runs, so this function only
// ever attaches data to the exact storefront it belongs to.
function toDetailItem(listing, listingLocations, offersByLocationId, loyaltyByLocationId, updatesByLocationId) {
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
  item.locations = listingLocations.map((ll) =>
    toLocationItem(ll, offersByLocationId.get(ll.id), loyaltyByLocationId.get(ll.id), updatesByLocationId.get(ll.id))
  );
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
    include: { listing: true, loyaltyLandingPage: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!listingLocations.length) return null;

  // Loyalty (business-level only -- see toLoyaltyItem's header comment).
  // loyaltyLandingPage is only ever populated when a storefront's
  // loyaltyLandingPageId bridge has actually been set (unset for every
  // storefront today -- see StadtPocketListingLocation's schema
  // comment); every one of those cases resolves to "no loyalty" below,
  // never a fabricated program. StampSettings is looked up in one
  // batched query by slug (its own key, no direct Prisma relation to
  // LandingPage exists) -- same batching convention as the offers query
  // below, scoped to exactly the slugs these storefronts bridge to.
  const loyaltySlugs = [
    ...new Set(
      listingLocations
        .map((ll) => ll.loyaltyLandingPage && ll.loyaltyLandingPage.slug)
        .filter(Boolean)
    ),
  ];
  const enabledStampSettings = loyaltySlugs.length
    ? await prisma.stampSettings.findMany({ where: { slug: { in: loyaltySlugs }, enabled: true } })
    : [];
  const stampSettingsBySlug = new Map(enabledStampSettings.map((s) => [s.slug, s]));
  const loyaltyByLocationId = new Map();
  for (const ll of listingLocations) {
    const slug = ll.loyaltyLandingPage && ll.loyaltyLandingPage.slug;
    const settings = slug && stampSettingsBySlug.get(slug);
    if (settings) loyaltyByLocationId.set(ll.id, toLoyaltyItem(settings));
  }

  // Offers: published only, and not expired -- the only two visibility
  // rules for a public read (draft/archived are already excluded by the
  // status filter itself; "not expired" is a computed, never-stored
  // fact, same convention as StadtPocketOffer's own schema comment).
  // Scoped to exactly these storefronts' ids -- never a business-wide
  // or cross-city query -- so a listing with storefronts in multiple
  // cities can never leak another city's offers onto this one.
  const listingLocationIds = listingLocations.map((ll) => ll.id);
  const rawOffers = await prisma.stadtPocketOffer.findMany({
    where: { listingLocationId: { in: listingLocationIds }, status: PUBLISHED },
  });
  const offersByLocationId = new Map();
  const now = Date.now();
  for (const offer of rawOffers) {
    if (offer.endsAt != null && new Date(offer.endsAt).getTime() < now) continue; // expired -- never shown
    if (!offersByLocationId.has(offer.listingLocationId)) offersByLocationId.set(offer.listingLocationId, []);
    offersByLocationId.get(offer.listingLocationId).push(offer);
  }

  // Updates (Aktuelles): published only -- the only visibility rule
  // (draft/archived already excluded by the status filter). No expiry
  // concept exists for an update (product lock, 2026-09-17), unlike
  // offers -- so no "not expired" filter is applied here. Scoped to
  // exactly these storefronts' ids, same cross-city-leak protection as
  // the offers query above.
  const rawUpdates = await prisma.stadtPocketUpdate.findMany({
    where: { listingLocationId: { in: listingLocationIds }, status: PUBLISHED },
    orderBy: { publishedAt: 'desc' },
  });
  const updatesByLocationId = new Map();
  for (const update of rawUpdates) {
    if (!updatesByLocationId.has(update.listingLocationId)) updatesByLocationId.set(update.listingLocationId, []);
    updatesByLocationId.get(update.listingLocationId).push(update);
  }

  return toDetailItem(listingLocations[0].listing, listingLocations, offersByLocationId, loyaltyByLocationId, updatesByLocationId);
}

module.exports = {
  listCityBusinesses,
  getCityBusiness,
  // exported for direct unit testing only
  toListItem,
  toLocationItem,
  toDetailItem,
};
