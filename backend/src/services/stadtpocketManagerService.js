/**
 * stadtpocketManagerService.js — Secure Draft -> Preview -> Publish write
 * path for StadtPocketListing/StadtPocketListingLocation. Phase 6C.
 * ─────────────────────────────────────────────────────────────
 * Isolation model (see the schema comment on StadtPocketListing.draftData
 * / StadtPocketListingLocation.draftData for the full reasoning): every
 * write in this file goes into draftData. The live scalar columns
 * (name/category/.../address/.../hours) are the published source of
 * truth stadtpocketPublicService.js reads — they are only ever touched
 * by publishListingLocation(), and only inside one transaction.
 *
 * draftData is retained (never cleared) after a successful publish.
 * Reasoning: draftData represents "the manager's current working copy,"
 * the live columns represent "what's actually public" — those are two
 * different questions, and clearing draftData on publish would collapse
 * them back into one, forcing the next edit session to start from
 * scratch instead of continuing from what was just published. A fresh
 * GET of the editable state after publish shows the draft and the live
 * values in agreement (since publish just copied one into the other),
 * so nothing looks stale to the manager.
 *
 * Authorization is never decided in this file — every exported function
 * takes an already-resolved `scope` (see middleware/stadtpocketManagerAuth.js)
 * and re-checks the specific target's real locationId against it before
 * any read or write, exactly like managerRoutes.js's own established
 * pattern. A caller-supplied listingLocationId is never trusted to
 * belong to the caller's scope merely because they know its id.
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');
const { isTrustedStadtPocketHeaderImage } = require('./stadtPocketHeaderImageService');

class StadtpocketManagerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Field allow-lists ─────────────────────────────────────────
// headerImage (Phase 6D.2) lives here, not in LOCATION_FIELDS -- it is
// brand-level (StadtPocketListing.headerImage), one hero image per
// business, not per storefront, same grouping as name/category/tags.
const LISTING_FIELDS = ['name', 'category', 'subCategory', 'tags', 'shortDescription', 'longDescription', 'headerImage'];
const LOCATION_FIELDS = ['address', 'latitude', 'longitude', 'phone', 'website', 'hours'];
const ALL_EDITABLE_FIELDS = [...LISTING_FIELDS, ...LOCATION_FIELDS];

// ── Low-level validators (reused at both save-draft and publish time) ──
const DAY_KEYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const VALID_DAYS = new Set(DAY_KEYS);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkLatitude(lat) {
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new StadtpocketManagerError('latitude must be a finite number between -90 and 90.');
  }
}

function checkLongitude(lng) {
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new StadtpocketManagerError('longitude must be a finite number between -180 and 180.');
  }
}

function checkWebsite(website) {
  let url;
  try {
    url = new URL(website);
  } catch {
    throw new StadtpocketManagerError('website must be a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new StadtpocketManagerError('website must use http or https.');
  }
}

function checkHours(hours) {
  if (!Array.isArray(hours)) throw new StadtpocketManagerError('hours must be an array.');
  const seenDays = new Set();
  for (const entry of hours) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new StadtpocketManagerError('Each hours entry must be an object.');
    }
    const { day, closed, intervals, ...rest } = entry;
    if (Object.keys(rest).length) {
      throw new StadtpocketManagerError(`Unexpected field(s) on hours entry: ${Object.keys(rest).join(', ')}.`);
    }
    if (!VALID_DAYS.has(day)) throw new StadtpocketManagerError(`Invalid day "${day}" in hours.`);
    if (seenDays.has(day)) throw new StadtpocketManagerError(`Duplicate day "${day}" in hours.`);
    seenDays.add(day);

    if (closed === true) {
      if (intervals !== undefined) {
        throw new StadtpocketManagerError(`Day "${day}" cannot be both closed and have intervals.`);
      }
      continue;
    }
    if (closed !== undefined) {
      throw new StadtpocketManagerError('"closed" must be true or omitted.');
    }
    if (!Array.isArray(intervals) || intervals.length === 0) {
      throw new StadtpocketManagerError(`Day "${day}" must have at least one interval, or be marked closed.`);
    }
    for (const iv of intervals) {
      if (!iv || typeof iv !== 'object' || Array.isArray(iv)) {
        throw new StadtpocketManagerError(`Invalid interval on day "${day}".`);
      }
      const { open, close, ...ivRest } = iv;
      if (Object.keys(ivRest).length) {
        throw new StadtpocketManagerError(`Unexpected field(s) on interval: ${Object.keys(ivRest).join(', ')}.`);
      }
      if (typeof open !== 'string' || typeof close !== 'string' || !TIME_RE.test(open) || !TIME_RE.test(close)) {
        throw new StadtpocketManagerError(`Interval times must be HH:MM (00:00-23:59) on day "${day}".`);
      }
      if (open === close) {
        throw new StadtpocketManagerError(`Interval open/close times cannot be identical on day "${day}".`);
      }
    }
  }
}

// ── Payload validation for save-draft (partial update semantics: a
// field is only touched in draftData if the caller included its key).
// `null` on a nullable field is an explicit, honored "clear this field"
// -- never coerced from falsy input, and never itself invented. ──
function validateDraftPayload(body) {
  const src = body || {};
  const extra = Object.keys(src).filter((k) => !ALL_EDITABLE_FIELDS.includes(k));
  if (extra.length) {
    throw new StadtpocketManagerError(`Unexpected field(s): ${extra.join(', ')}.`);
  }

  const listingFields = {};
  const locationFields = {};

  if ('name' in src) {
    if (typeof src.name !== 'string' || !src.name.trim()) {
      throw new StadtpocketManagerError('name must be a non-empty string.');
    }
    listingFields.name = src.name.trim();
  }
  if ('category' in src) {
    if (typeof src.category !== 'string' || !src.category.trim()) {
      throw new StadtpocketManagerError('category must be a non-empty string.');
    }
    listingFields.category = src.category.trim();
  }
  if ('subCategory' in src) {
    if (src.subCategory !== null && (typeof src.subCategory !== 'string' || !src.subCategory.trim())) {
      throw new StadtpocketManagerError('subCategory must be a non-empty string, or null to clear it.');
    }
    listingFields.subCategory = src.subCategory === null ? null : src.subCategory.trim();
  }
  if ('tags' in src) {
    if (!Array.isArray(src.tags) || src.tags.some((t) => typeof t !== 'string' || !t.trim())) {
      throw new StadtpocketManagerError('tags must be an array of non-empty strings.');
    }
    listingFields.tags = src.tags.map((t) => t.trim());
  }
  if ('shortDescription' in src) {
    if (typeof src.shortDescription !== 'string' || !src.shortDescription.trim()) {
      throw new StadtpocketManagerError('shortDescription must be a non-empty string.');
    }
    listingFields.shortDescription = src.shortDescription.trim();
  }
  if ('longDescription' in src) {
    if (src.longDescription !== null && (typeof src.longDescription !== 'string' || !src.longDescription.trim())) {
      throw new StadtpocketManagerError('longDescription must be a non-empty string, or null to clear it.');
    }
    listingFields.longDescription = src.longDescription === null ? null : src.longDescription.trim();
  }
  // Phase 6D.2 — header/hero image. null clears it (participates safely
  // in draft/publish exactly like any other clearable field: the
  // published image is untouched until an explicit Publish). Any
  // non-null value must be a genuine upload from THIS system's own
  // Cloudinary account/folder (isTrustedStadtPocketHeaderImage) --
  // never an arbitrary externally-supplied URL injected through this
  // generic field path.
  if ('headerImage' in src) {
    if (src.headerImage !== null) {
      const hi = src.headerImage;
      if (!hi || typeof hi !== 'object' || Array.isArray(hi)) {
        throw new StadtpocketManagerError('headerImage must be an object, or null to remove it.');
      }
      if (typeof hi.url !== 'string' || !hi.url.trim() || typeof hi.publicId !== 'string' || !hi.publicId.trim()) {
        throw new StadtpocketManagerError('headerImage.url and headerImage.publicId are required.');
      }
      if (!isTrustedStadtPocketHeaderImage(hi.url, hi.publicId)) {
        throw new StadtpocketManagerError('headerImage is not a recognized StadtPocket-uploaded image.');
      }
      let width = null;
      let height = null;
      if (hi.width != null) {
        width = Number(hi.width);
        if (!Number.isFinite(width) || width <= 0) throw new StadtpocketManagerError('headerImage.width must be a positive number.');
      }
      if (hi.height != null) {
        height = Number(hi.height);
        if (!Number.isFinite(height) || height <= 0) throw new StadtpocketManagerError('headerImage.height must be a positive number.');
      }
      listingFields.headerImage = { url: hi.url.trim(), publicId: hi.publicId.trim(), width, height };
    } else {
      listingFields.headerImage = null;
    }
  }

  if ('address' in src) {
    if (typeof src.address !== 'string' || !src.address.trim()) {
      throw new StadtpocketManagerError('address must be a non-empty string.');
    }
    locationFields.address = src.address.trim();
  }
  if ('latitude' in src || 'longitude' in src) {
    const { latitude, longitude } = src;
    if (latitude === null && longitude === null) {
      locationFields.latitude = null;
      locationFields.longitude = null;
    } else if (latitude == null || longitude == null) {
      throw new StadtpocketManagerError('latitude and longitude must be provided together (both set, or both null to clear).');
    } else {
      checkLatitude(latitude);
      checkLongitude(longitude);
      locationFields.latitude = latitude;
      locationFields.longitude = longitude;
    }
  }
  if ('phone' in src) {
    if (src.phone !== null && (typeof src.phone !== 'string' || !src.phone.trim())) {
      throw new StadtpocketManagerError('phone must be a non-empty string, or null to clear it.');
    }
    locationFields.phone = src.phone === null ? null : src.phone.trim();
  }
  if ('website' in src) {
    if (src.website !== null) {
      if (typeof src.website !== 'string') throw new StadtpocketManagerError('website must be a string, or null to clear it.');
      checkWebsite(src.website);
    }
    locationFields.website = src.website;
  }
  if ('hours' in src) {
    if (src.hours !== null) checkHours(src.hours);
    locationFields.hours = src.hours;
  }

  return { listingFields, locationFields };
}

// ── Scope enforcement ─────────────────────────────────────────
function authorizeLocationAccess(locationId, scope) {
  if (scope.isGlobalAdmin) return;
  if (!scope.locationIds.includes(locationId)) {
    throw new StadtpocketManagerError('Forbidden. Location outside manager scope.', 403);
  }
}

// ── Slug generation (creation-time only; slug is never part of the
// manager-editable field set above, so it can never be hijacked via a
// draft-save payload). Mirrors lpController.js's own inline slugify
// convention (lowercase, strip to [a-z0-9-], collapse separators), with
// one addition specific to this service: German characters are
// transliterated to their standard ASCII spelling BEFORE that strip
// step, so "Bäckerei Staib" becomes "baeckerei-staib" (the real,
// expected public slug) instead of silently losing the "ä" and becoming
// "bckerei-staib". lpController.js has its own separate, unexported
// inline slugify (embedded in a client-side demo-widget script) and is
// not touched by this change -- this function has no other caller in
// this file besides generateUniqueSlug() below, and is exported (like
// mergeState/checkHours/etc. above) for direct unit testing only, never
// consumed by an HTTP route. ──
const GERMAN_TRANSLITERATIONS = [
  [/ä/g, 'ae'], [/ö/g, 'oe'], [/ü/g, 'ue'],
  [/Ä/g, 'Ae'], [/Ö/g, 'Oe'], [/Ü/g, 'Ue'],
  [/ß/g, 'ss'],
];

function transliterateGerman(s) {
  let out = String(s || '');
  for (const [pattern, replacement] of GERMAN_TRANSLITERATIONS) {
    out = out.replace(pattern, replacement);
  }
  // Any other accented Latin character (e.g. the "é" in "Café") is folded
  // to its unaccented base letter via Unicode decomposition -- applied
  // AFTER the German-specific rules above so "ä"/"ö"/"ü"/"ß" keep their
  // deliberate two-letter spelling instead of being reduced by this more
  // generic step to plain "a"/"o"/"u"/"ss"-minus-one-s.
  return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugify(s) {
  return transliterateGerman(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

async function generateUniqueSlug(tx, name) {
  const base = slugify(name) || 'listing';
  let candidate = base;
  let suffix = 1;
  // Bounded loop -- this namespace is small (one row per real business),
  // a collision run longer than a handful of attempts would indicate a
  // real problem, not something to loop on forever.
  for (let attempt = 0; attempt < 50; attempt++) {
    const existing = await tx.stadtPocketListing.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  throw new StadtpocketManagerError('Could not generate a unique slug.', 500);
}

// ── Read: editable state (draft merged over live, per field) ──────
function mergeState(listing, listingLocation) {
  const draftListing = listing.draftData || {};
  const draftLocation = listingLocation.draftData || {};
  const pick = (draft, key, live) => (key in draft ? draft[key] : live);
  return {
    listingId: listing.id,
    listingLocationId: listingLocation.id,
    locationId: listingLocation.locationId,
    slug: listing.slug,
    publicationStatus: listingLocation.publicationStatus,
    publishedAt: listingLocation.publishedAt,
    name: pick(draftListing, 'name', listing.name),
    category: pick(draftListing, 'category', listing.category),
    subCategory: pick(draftListing, 'subCategory', listing.subCategory),
    tags: pick(draftListing, 'tags', listing.tags),
    shortDescription: pick(draftListing, 'shortDescription', listing.shortDescription),
    longDescription: pick(draftListing, 'longDescription', listing.longDescription),
    headerImage: pick(draftListing, 'headerImage', listing.headerImage),
    address: pick(draftLocation, 'address', listingLocation.address),
    latitude: pick(draftLocation, 'latitude', listingLocation.latitude),
    longitude: pick(draftLocation, 'longitude', listingLocation.longitude),
    phone: pick(draftLocation, 'phone', listingLocation.phone),
    website: pick(draftLocation, 'website', listingLocation.website),
    hours: pick(draftLocation, 'hours', listingLocation.hours),
  };
}

// A city (locationId) can hold zero, one, or many StadtPocketListingLocation
// rows -- see the schema comment on StadtPocketListingLocation. A specific
// business is therefore identified by (locationId, listingLocationId)
// together, never by locationId alone: locationId is only the authorization
// boundary (which city is this manager scoped to), listingLocationId is the
// actual row identity. The listingLocationId is never trusted to belong to
// the claimed city merely because the caller supplied both -- it is always
// re-checked against the loaded row's own locationId.
async function findListingLocationInCityOrThrow(locationId, listingLocationId, scope) {
  authorizeLocationAccess(locationId, scope);
  const listingLocation = await prisma.stadtPocketListingLocation.findUnique({
    where: { id: listingLocationId },
    include: { listing: true },
  });
  if (!listingLocation || listingLocation.locationId !== locationId) {
    throw new StadtpocketManagerError('StadtPocket listing not found for this location.', 404);
  }
  return listingLocation;
}

async function getEditableState(locationId, listingLocationId, scope) {
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  return mergeState(listingLocation.listing, listingLocation);
}

// ── List: every StadtPocket business in a city ─────────────────
async function listListingsForLocation(locationId, scope) {
  authorizeLocationAccess(locationId, scope);
  const rows = await prisma.stadtPocketListingLocation.findMany({
    where: { locationId },
    include: { listing: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => mergeState(row.listing, row));
}

// ── Create / initialize ────────────────────────────────────────
// The four NOT NULL live columns (name/category/shortDescription on the
// listing, address on the location) must be supplied immediately --
// Postgres will not allow the row to exist without them, and
// publicationStatus starts 'draft' regardless, so nothing here is ever
// publicly visible until an explicit publish. Every other field is
// left unset and filled in later via saveDraft.
// A city may already contain other StadtPocketListingLocation rows --
// that is not a conflict, since a city holds many businesses. Duplicate
// protection for the SAME business is enforced by generateUniqueSlug's
// DB-level slug collision handling below, not by a city-level guard here.
async function initializeDraft(locationId, scope, body) {
  authorizeLocationAccess(locationId, scope);

  const src = body || {};
  const required = ['name', 'category', 'shortDescription', 'address'];
  const missing = required.filter((f) => typeof src[f] !== 'string' || !src[f].trim());
  if (missing.length) {
    throw new StadtpocketManagerError(`Missing required field(s) to initialize a listing: ${missing.join(', ')}.`);
  }
  const extra = Object.keys(src).filter((k) => !required.includes(k));
  if (extra.length) {
    throw new StadtpocketManagerError(
      `Unexpected field(s) at initialization: ${extra.join(', ')}. Use save-draft after creating the listing to set optional fields.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const slug = await generateUniqueSlug(tx, src.name);
    const listing = await tx.stadtPocketListing.create({
      data: {
        slug,
        name: src.name.trim(),
        category: src.category.trim(),
        shortDescription: src.shortDescription.trim(),
        createdBy: scope.userId,
      },
    });
    const listingLocation = await tx.stadtPocketListingLocation.create({
      data: {
        listingId: listing.id,
        locationId,
        address: src.address.trim(),
        publicationStatus: 'draft',
      },
    });
    return mergeState(listing, listingLocation);
  });
}

// ── Create / initialize — MULTI-LOCATION (Phase 1G.1) ──────────────
// Companion to initializeDraft() above for the one case that function
// cannot express: ONE business/brand with MORE THAN ONE physical
// storefront known up front (e.g. AI research verifying several real
// branches of the same chain in one city -- the real Bäckerei Betz has
// 8 in Ulm). Creates exactly ONE StadtPocketListing plus N
// StadtPocketListingLocation rows, all inside ONE transaction -- never
// N separate listings. This matters concretely: stadtpocketPublicService.js's
// listCityBusinesses() shows one card per LISTING, not per storefront
// (see that file's own header comment) -- N listings would wrongly
// appear as N separate businesses in the public city directory, exactly
// the outcome this function exists to prevent. A single-location
// business keeps using initializeDraft() above, completely unchanged;
// this function is never called for that case (the caller -- see
// stadtpocketAiDraftService.js -- only calls this when 2+ verified
// locations exist).
//
// No schema change / migration was needed for this: StadtPocketListing
// already declares `locations StadtPocketListingLocation[]`, and that
// model's own header comment already anticipated "a single brand may
// have multiple physical storefronts in the SAME city" -- this function
// is new orchestration over an already-correct schema, not new schema.
//
// body: { listing: { name, category, shortDescription, subCategory?,
// tags?, longDescription? }, locations: [{ address, phone?, website?,
// hours?, latitude?, longitude? }, ... ] } (at least 2 entries).
// Optional listing fields go straight into the new listing's draftData
// (never the live columns -- same isolation model as saveDraft, see
// this file's own header comment), so nothing is ever publicly visible
// until an explicit publish, exactly like the single-location path.
const MAX_LOCATIONS_PER_DRAFT = 50; // matches stadtpocketAiExtractionService.js's own MAX_LOCATION_CANDIDATES ceiling -- a defensive request-size bound, not a product decision about how many locations a real business may have.
const OPTIONAL_LISTING_FIELDS_AT_CREATE = ['subCategory', 'tags', 'longDescription'];
const LOCATION_ENTRY_FIELDS = ['address', 'latitude', 'longitude', 'phone', 'website', 'hours'];

function validateMultiLocationListingFields(listingSrc) {
  const required = ['name', 'category', 'shortDescription'];
  const missing = required.filter((f) => typeof listingSrc[f] !== 'string' || !listingSrc[f].trim());
  if (missing.length) {
    throw new StadtpocketManagerError(`Missing required listing field(s): ${missing.join(', ')}.`);
  }
  const allowed = [...required, ...OPTIONAL_LISTING_FIELDS_AT_CREATE];
  const extra = Object.keys(listingSrc).filter((k) => !allowed.includes(k));
  if (extra.length) {
    throw new StadtpocketManagerError(`Unexpected listing field(s): ${extra.join(', ')}.`);
  }

  const draft = {};
  if ('subCategory' in listingSrc) {
    if (typeof listingSrc.subCategory !== 'string' || !listingSrc.subCategory.trim()) {
      throw new StadtpocketManagerError('subCategory must be a non-empty string.');
    }
    draft.subCategory = listingSrc.subCategory.trim();
  }
  if ('tags' in listingSrc) {
    if (!Array.isArray(listingSrc.tags) || listingSrc.tags.some((t) => typeof t !== 'string' || !t.trim())) {
      throw new StadtpocketManagerError('tags must be an array of non-empty strings.');
    }
    draft.tags = listingSrc.tags.map((t) => t.trim());
  }
  if ('longDescription' in listingSrc) {
    if (typeof listingSrc.longDescription !== 'string' || !listingSrc.longDescription.trim()) {
      throw new StadtpocketManagerError('longDescription must be a non-empty string.');
    }
    draft.longDescription = listingSrc.longDescription.trim();
  }
  return draft;
}

function validateMultiLocationEntries(rawLocations) {
  if (!Array.isArray(rawLocations) || rawLocations.length < 2) {
    throw new StadtpocketManagerError('locations must be an array of at least 2 entries -- use initializeDraft for a single-location business.');
  }
  if (rawLocations.length > MAX_LOCATIONS_PER_DRAFT) {
    throw new StadtpocketManagerError(`Too many locations in one request (max ${MAX_LOCATIONS_PER_DRAFT}).`);
  }
  return rawLocations.map((loc, i) => {
    const l = loc || {};
    if (typeof l.address !== 'string' || !l.address.trim()) {
      throw new StadtpocketManagerError(`Location ${i + 1}: address is required.`);
    }
    const extra = Object.keys(l).filter((k) => !LOCATION_ENTRY_FIELDS.includes(k));
    if (extra.length) {
      throw new StadtpocketManagerError(`Location ${i + 1}: unexpected field(s): ${extra.join(', ')}.`);
    }
    const cleaned = { address: l.address.trim() };
    if (l.phone !== undefined) {
      if (typeof l.phone !== 'string' || !l.phone.trim()) {
        throw new StadtpocketManagerError(`Location ${i + 1}: phone must be a non-empty string.`);
      }
      cleaned.phone = l.phone.trim();
    }
    if (l.website !== undefined) {
      checkWebsite(l.website);
      cleaned.website = l.website;
    }
    if (l.hours !== undefined) {
      checkHours(l.hours);
      cleaned.hours = l.hours;
    }
    if (l.latitude !== undefined || l.longitude !== undefined) {
      checkLatitude(l.latitude);
      checkLongitude(l.longitude);
      cleaned.latitude = l.latitude;
      cleaned.longitude = l.longitude;
    }
    return cleaned;
  });
}

async function initializeMultiLocationDraft(locationId, scope, body) {
  authorizeLocationAccess(locationId, scope);

  const src = body || {};
  const listingDraft = validateMultiLocationListingFields(src.listing || {});
  const cleanedLocations = validateMultiLocationEntries(src.locations);
  const listingSrc = src.listing;

  return prisma.$transaction(async (tx) => {
    const slug = await generateUniqueSlug(tx, listingSrc.name);
    const listing = await tx.stadtPocketListing.create({
      data: {
        slug,
        name: listingSrc.name.trim(),
        category: listingSrc.category.trim(),
        shortDescription: listingSrc.shortDescription.trim(),
        createdBy: scope.userId,
        draftData: Object.keys(listingDraft).length ? listingDraft : undefined,
      },
    });

    const createdLocations = [];
    // Sequential, not Promise.all -- each create depends on the same
    // listing.id and this is already inside one transaction; sequential
    // writes keep the transaction's statement order deterministic and
    // easy to reason about for what is, in practice, a small (<=50) list.
    for (const loc of cleanedLocations) {
      // eslint-disable-next-line no-await-in-loop
      const listingLocation = await tx.stadtPocketListingLocation.create({
        data: { listingId: listing.id, locationId, publicationStatus: 'draft', ...loc },
      });
      createdLocations.push(listingLocation);
    }

    return {
      listingId: listing.id,
      slug: listing.slug,
      name: listing.name,
      category: listing.category,
      subCategory: listingDraft.subCategory || null,
      shortDescription: listing.shortDescription,
      tags: listingDraft.tags || [],
      longDescription: listingDraft.longDescription || null,
      locations: createdLocations.map((ll) => ({
        listingLocationId: ll.id,
        locationId: ll.locationId,
        address: ll.address,
        phone: ll.phone,
        website: ll.website,
        hours: ll.hours,
        publicationStatus: ll.publicationStatus,
      })),
    };
  });
}

// ── Save draft ──────────────────────────────────────────────────
async function saveDraft(locationId, listingLocationId, scope, body) {
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  const { listingFields, locationFields } = validateDraftPayload(body);

  const nextListingDraft = { ...(listingLocation.listing.draftData || {}), ...listingFields };
  const nextLocationDraft = { ...(listingLocation.draftData || {}), ...locationFields };

  const [updatedListing, updatedLocation] = await prisma.$transaction([
    prisma.stadtPocketListing.update({
      where: { id: listingLocation.listingId },
      data: { draftData: nextListingDraft },
    }),
    prisma.stadtPocketListingLocation.update({
      where: { id: listingLocation.id },
      data: { draftData: nextLocationDraft },
    }),
  ]);

  return mergeState(updatedListing, updatedLocation);
}

// ── Preview ─────────────────────────────────────────────────────
async function previewDraft(locationId, listingLocationId, scope) {
  // Identical to getEditableState today -- kept as its own exported
  // function (rather than an alias) because "what does the manager see
  // when reviewing before publish" and "what does the edit form load"
  // are conceptually different callers, even though they compute the
  // same thing from the same isolation model.
  return getEditableState(locationId, listingLocationId, scope);
}

// ── Publish (atomic) ────────────────────────────────────────────
// Everything from "load the authorized draft" through "write the
// published columns" happens inside one Prisma interactive transaction.
// Any failure at any step -- not-found, out-of-scope, incomplete draft,
// a re-validation failure, or a database error on either write -- throws
// out of the transaction callback, which rolls back every write Prisma
// attempted inside it. The public API's next read is guaranteed to see
// either the complete pre-publish state or the complete post-publish
// state, never a partial mix of the two.
async function publishListingLocation(listingLocationId, scope) {
  return prisma.$transaction(async (tx) => {
    const listingLocation = await tx.stadtPocketListingLocation.findUnique({
      where: { id: listingLocationId },
      include: { listing: true },
    });
    if (!listingLocation) {
      throw new StadtpocketManagerError('Listing location not found.', 404);
    }

    authorizeLocationAccess(listingLocation.locationId, scope);

    const merged = mergeState(listingLocation.listing, listingLocation);

    const missing = ['name', 'category', 'shortDescription', 'address'].filter(
      (f) => !merged[f] || !String(merged[f]).trim()
    );
    if (missing.length) {
      throw new StadtpocketManagerError(`Cannot publish: missing required field(s): ${missing.join(', ')}.`);
    }

    // Defense-in-depth re-validation of the fully merged state, using
    // the exact same rules save-draft already enforced on each field
    // individually -- protects against any future code path that could
    // write draftData without going through validateDraftPayload.
    if (merged.latitude != null || merged.longitude != null) {
      if (merged.latitude == null || merged.longitude == null) {
        throw new StadtpocketManagerError('Cannot publish: latitude and longitude must both be set or both be absent.');
      }
      checkLatitude(merged.latitude);
      checkLongitude(merged.longitude);
    }
    if (merged.website != null) checkWebsite(merged.website);
    if (merged.hours != null) checkHours(merged.hours);

    // draftData is deliberately NOT modified here -- see this file's
    // header comment. Only the live columns + publicationStatus/
    // publishedAt are written.
    await tx.stadtPocketListing.update({
      where: { id: listingLocation.listingId },
      data: {
        name: merged.name,
        category: merged.category,
        subCategory: merged.subCategory,
        tags: merged.tags,
        shortDescription: merged.shortDescription,
        longDescription: merged.longDescription,
        headerImage: merged.headerImage,
      },
    });

    const publishedAt = new Date();
    const updatedLocation = await tx.stadtPocketListingLocation.update({
      where: { id: listingLocationId },
      data: {
        address: merged.address,
        latitude: merged.latitude,
        longitude: merged.longitude,
        phone: merged.phone,
        website: merged.website,
        hours: merged.hours,
        publicationStatus: 'published',
        publishedAt,
      },
    });

    return { listingId: listingLocation.listingId, listingLocationId, publicationStatus: 'published', publishedAt: updatedLocation.publishedAt };
  });
}

async function publishForLocation(locationId, listingLocationId, scope) {
  // Confirms (locationId, listingLocationId) actually pair up before
  // handing off to the atomic transaction below, which re-authorizes
  // independently against the row's own locationId -- this check exists
  // for a correct 404 on a mismatched pair, not as the only guard.
  await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  return publishListingLocation(listingLocationId, scope);
}

// ── Pause (published -> paused only; straightforward given
// publicationStatus already models this value) ──────────────────
async function pauseForLocation(locationId, listingLocationId, scope) {
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  if (listingLocation.publicationStatus !== 'published') {
    throw new StadtpocketManagerError('Only a published listing can be paused.', 400);
  }
  const updated = await prisma.stadtPocketListingLocation.update({
    where: { id: listingLocation.id },
    data: { publicationStatus: 'paused' },
  });
  return { listingLocationId: updated.id, publicationStatus: updated.publicationStatus };
}

// ── Archive (published or paused -> archived) ────────────────────
// publicationStatus's documented value set already includes 'archived'
// (see the schema comment on this column) -- no migration needed, and
// this mirrors pauseForLocation's exact shape. An archived listing is
// never deleted: StadtPocketOffer/StadtPocketUpdate rows and the
// listing/location themselves are all left completely intact, simply
// no longer visible on the public API (stadtpocketPublicService.js's
// visibility check is `publicationStatus === 'published'`, a strict
// equality, so 'archived' is already exactly as invisible as 'paused'
// or 'draft' with zero further change needed there).
async function archiveForLocation(locationId, listingLocationId, scope) {
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  if (listingLocation.publicationStatus !== 'published' && listingLocation.publicationStatus !== 'paused') {
    throw new StadtpocketManagerError('Only a published or paused listing can be archived.', 400);
  }
  const updated = await prisma.stadtPocketListingLocation.update({
    where: { id: listingLocation.id },
    data: { publicationStatus: 'archived' },
  });
  return { listingLocationId: updated.id, publicationStatus: updated.publicationStatus };
}

// ── Delete a DRAFT listing location (and its now-orphaned parent, if
// this was its only location) ─────────────────────────────────────
// Only a 'draft' listing location may use this path. A published,
// paused, or archived listing must never be deleted this way -- it
// must be explicitly archived first (see archiveForLocation above),
// and even then permanent deletion of a once-live business is a
// separate, more deliberate action this function does not perform.
//
// Every StadtPocketOffer/StadtPocketUpdate row belonging to this
// listing location is deleted first, inside the SAME transaction,
// because both of those foreign keys are ON DELETE RESTRICT at the
// database level (see the migration SQL -- no ON DELETE CASCADE
// exists anywhere in this relationship graph); Postgres would
// otherwise reject the StadtPocketListingLocation delete outright
// with a foreign-key violation, and a partial delete would leave an
// orphaned Offer/Update pointing at a listingLocationId that no
// longer exists.
//
// If this was the ONLY StadtPocketListingLocation under its parent
// StadtPocketListing, the now-childless listing row is deleted too,
// in the same transaction, so a single-location test/failed draft
// never leaves an orphaned parent behind. If sibling locations still
// exist under the same listing, only this one location (and its own
// dependent Offers/Updates) is removed -- deleting one draft location
// of a multi-location business never touches that business's other,
// unrelated locations.
//
// Never touches Business/BusinessLocation/User or any other QRAIVY
// account record: StadtPocketListing.businessId is the only link to
// that world, and deleting a StadtPocketListing never cascades onto
// the Business it optionally points at (that FK's own ON DELETE
// direction is SET NULL on Business's deletion, not the reverse, and
// this function never deletes a Business row in either case).
async function deleteDraftListingLocation(locationId, listingLocationId, scope) {
  const listingLocation = await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);

  if (listingLocation.publicationStatus !== 'draft') {
    throw new StadtpocketManagerError(
      'Only a draft listing can be deleted this way. Archive a published or paused listing first.',
      400
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.stadtPocketOffer.deleteMany({ where: { listingLocationId } });
    await tx.stadtPocketUpdate.deleteMany({ where: { listingLocationId } });
    await tx.stadtPocketListingLocation.delete({ where: { id: listingLocationId } });

    const remainingSiblings = await tx.stadtPocketListingLocation.count({
      where: { listingId: listingLocation.listingId },
    });

    let listingDeleted = false;
    if (remainingSiblings === 0) {
      await tx.stadtPocketListing.delete({ where: { id: listingLocation.listingId } });
      listingDeleted = true;
    }

    return { listingLocationId, listingId: listingLocation.listingId, listingDeleted };
  });
}

module.exports = {
  StadtpocketManagerError,
  getEditableState,
  listListingsForLocation,
  initializeDraft,
  initializeMultiLocationDraft,
  MAX_LOCATIONS_PER_DRAFT,
  saveDraft,
  previewDraft,
  publishForLocation,
  pauseForLocation,
  archiveForLocation,
  deleteDraftListingLocation,
  // Reused by stadtpocketLoyaltyBridgeService.js (Phase 2, Stempelkarte)
  // for the exact same "never trust a caller-supplied listingLocationId"
  // re-check -- not exported for testing only, genuinely consumed
  // elsewhere, unlike the block below.
  findListingLocationInCityOrThrow,
  authorizeLocationAccess,
  // exported for direct unit testing only
  validateDraftPayload,
  mergeState,
  checkHours,
  checkLatitude,
  checkLongitude,
  checkWebsite,
  slugify,
  validateMultiLocationListingFields,
  validateMultiLocationEntries,
};
