/**
 * stadtpocketOfferService.js — StadtPocket Angebote Foundation, Phase A.
 * ─────────────────────────────────────────────────────────────
 * Backend-only foundation: database model + service layer +
 * authorization. No route file consumes this yet (Phase B adds the
 * StadtPocket Angebote Admin UI + its manager routes; Phase C adds the
 * public published-offers API) -- this module is exported for direct
 * unit testing only in this phase.
 *
 * Reuses stadtpocketManagerService.js's exact patterns rather than
 * inventing a parallel architecture:
 *   - requireStadtpocketWriteScope's scope object (middleware/
 *     stadtpocketManagerAuth.js) -- same { userId, isGlobalAdmin,
 *     locationIds } shape, not a second authorization system.
 *   - draftData isolation: live scalar columns are the published
 *     source of truth, draftData holds pending edits, never cleared on
 *     publish.
 *   - (locationId, listingLocationId) addressing as the authorization
 *     boundary + row identity pair, re-checked on every read/write --
 *     a caller-supplied id is never trusted merely because it parses.
 *   - isTrustedStadtPocketHeaderImage for any client-supplied image
 *     reference -- no second media system, no second Cloudinary
 *     folder/upload path introduced in this phase.
 *
 * An Offer additionally requires an offerId (three-level addressing:
 * city -> business -> offer), since one storefront can run many
 * offers. offerId is never trusted to belong to the claimed
 * listingLocation merely because the caller supplied it -- always
 * re-checked against the loaded row's own listingLocationId, exactly
 * like listingLocationId is re-checked against locationId.
 *
 * Business Owner has no access here -- identical reasoning to
 * stadtpocketManagerService.js's own header comment: no safe,
 * unambiguous claim/link mechanism exists yet from an authenticated
 * user to "owns this StadtPocketListingLocation."
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');
const { isTrustedStadtPocketHeaderImage } = require('./stadtPocketHeaderImageService');

class StadtpocketOfferError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Field allow-list ──────────────────────────────────────────
const OFFER_FIELDS = ['title', 'description', 'offerText', 'offerType', 'offerDetails', 'image', 'startsAt', 'endsAt'];

// Phase B.2.2 — offer-type structure. Plain string allow-list, matching
// this schema's existing no-enum convention (see OFFER_IMAGE_SOURCES
// above and the schema comment on StadtPocketOffer.offerType) -- adding
// a 7th type later is a one-line addition here, no migration.
const OFFER_TYPES = ['percentage_discount', 'two_for_one', 'fixed_price', 'free_bonus', 'upgrade', 'custom'];

// Phase B.1 — image source tracking (metadata only, see the schema
// comment on StadtPocketOffer.image). No enum type: matches this
// schema's existing no-enum convention for every other status-like
// column, validated here as a plain string allow-list instead.
const OFFER_IMAGE_SOURCES = ['uploaded', 'starter', 'ai_generated'];

// ── Low-level validators ────────────────────────────────────────
function checkOfferImage(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    throw new StadtpocketOfferError('image must be an object, or null to remove it.');
  }
  if (typeof image.url !== 'string' || !image.url.trim() || typeof image.publicId !== 'string' || !image.publicId.trim()) {
    throw new StadtpocketOfferError('image.url and image.publicId are required.');
  }
  if (!isTrustedStadtPocketHeaderImage(image.url, image.publicId)) {
    throw new StadtpocketOfferError('image is not a recognized StadtPocket-uploaded image.');
  }
  let width = null;
  let height = null;
  if (image.width != null) {
    width = Number(image.width);
    if (!Number.isFinite(width) || width <= 0) throw new StadtpocketOfferError('image.width must be a positive number.');
  }
  if (image.height != null) {
    height = Number(image.height);
    if (!Number.isFinite(height) || height <= 0) throw new StadtpocketOfferError('image.height must be a positive number.');
  }
  // source (Phase B.1) -- optional, never inferred. Records how this
  // master image was produced (uploaded / starter / a future real
  // ai_generated path) without changing what the image itself is. An
  // image validated before this field existed, or one that simply never
  // had it supplied, gets source: null here -- exactly the same
  // "default to null, never guess" posture width/height already use
  // above, not a fabricated default source value.
  let source = null;
  if (image.source != null) {
    if (typeof image.source !== 'string' || !OFFER_IMAGE_SOURCES.includes(image.source)) {
      throw new StadtpocketOfferError(`image.source must be one of: ${OFFER_IMAGE_SOURCES.join(', ')}.`);
    }
    source = image.source;
  }
  // starterId (Phase B.2) -- optional, traces which catalog entry
  // (stadtpocketOfferStarterImages.js) a starter-sourced image came
  // from, for future re-selection/AI-reference use. Validated only for
  // shape here (non-empty string) -- deliberately NOT cross-checked
  // against the live catalog, so editing/removing a catalog entry later
  // never retroactively invalidates an offer that already used it: the
  // actual image url/publicId, already independently trust-checked
  // above, remains the real source of truth regardless of what
  // starterId points at.
  let starterId = null;
  if (image.starterId != null) {
    if (typeof image.starterId !== 'string' || !image.starterId.trim()) {
      throw new StadtpocketOfferError('image.starterId must be a non-empty string, or omitted.');
    }
    starterId = image.starterId.trim();
  }
  return { url: image.url.trim(), publicId: image.publicId.trim(), width, height, source, starterId };
}

function checkOfferType(offerType) {
  if (offerType === null) return null;
  if (typeof offerType !== 'string' || !OFFER_TYPES.includes(offerType)) {
    throw new StadtpocketOfferError(`offerType must be one of: ${OFFER_TYPES.join(', ')}, or null to clear it.`);
  }
  return offerType;
}

// Reject-not-strip, same posture as checkOfferImage above: an unknown
// key in offerDetails always throws, never silently dropped. Each
// type's shape is validated explicitly (no generic schema loop) so
// every rule -- what's required, what's optional, what range is valid
// -- stays readable and type-specific, matching this file's style.
// offerDetails NEVER duplicates offerText: it only ever carries the
// structured business meaning offerText itself can't express (a real
// number/qty/label), never a second copy of the customer-facing string.
function checkOfferDetails(offerType, offerDetails) {
  if (offerDetails === null) return null;
  if (offerType == null) {
    throw new StadtpocketOfferError('offerDetails requires an offerType.');
  }
  if (!OFFER_TYPES.includes(offerType)) {
    throw new StadtpocketOfferError(`offerDetails requires a valid offerType, got: ${offerType}.`);
  }
  if (typeof offerDetails !== 'object' || Array.isArray(offerDetails)) {
    throw new StadtpocketOfferError('offerDetails must be an object, or null to clear it.');
  }

  const num = (key, { min, max } = {}) => {
    if (offerDetails[key] == null) return null;
    const n = Number(offerDetails[key]);
    if (!Number.isFinite(n)) throw new StadtpocketOfferError(`offerDetails.${key} must be a finite number.`);
    if (min != null && n < min) throw new StadtpocketOfferError(`offerDetails.${key} must be at least ${min}.`);
    if (max != null && n > max) throw new StadtpocketOfferError(`offerDetails.${key} must be at most ${max}.`);
    return n;
  };
  const str = (key) => {
    if (offerDetails[key] == null) return null;
    if (typeof offerDetails[key] !== 'string' || !offerDetails[key].trim()) {
      throw new StadtpocketOfferError(`offerDetails.${key} must be a non-empty string, or omitted/null.`);
    }
    return offerDetails[key].trim();
  };
  const rejectExtraKeys = (allowed) => {
    const extra = Object.keys(offerDetails).filter((k) => !allowed.includes(k));
    if (extra.length) {
      throw new StadtpocketOfferError(`Unexpected offerDetails field(s) for offerType "${offerType}": ${extra.join(', ')}.`);
    }
  };

  // custom (Eigenes Angebot) stays genuinely free-form -- structured
  // details never apply here, by design, not merely unimplemented.
  if (offerType === 'custom') {
    throw new StadtpocketOfferError('offerDetails is not supported for offerType "custom".');
  }

  if (offerType === 'percentage_discount') {
    rejectExtraKeys(['percentOff']);
    const percentOff = num('percentOff', { min: 1, max: 100 });
    if (percentOff == null) throw new StadtpocketOfferError('offerDetails.percentOff is required for offerType "percentage_discount".');
    return { percentOff };
  }

  if (offerType === 'two_for_one') {
    rejectExtraKeys(['buyQty', 'freeQty']);
    const buyQty = num('buyQty', { min: 1 });
    const freeQty = num('freeQty', { min: 1 });
    if (buyQty == null || freeQty == null) {
      throw new StadtpocketOfferError('offerDetails.buyQty and offerDetails.freeQty are both required for offerType "two_for_one".');
    }
    return { buyQty, freeQty };
  }

  if (offerType === 'fixed_price') {
    rejectExtraKeys(['price', 'currency']);
    const price = num('price', { min: 0.01 });
    if (price == null) throw new StadtpocketOfferError('offerDetails.price is required for offerType "fixed_price".');
    // currency defaults to 'EUR' when omitted -- StadtPocket is DE/EUR-only
    // today, a fixed default, never an inference from caller-supplied data.
    const currency = str('currency') || 'EUR';
    return { price, currency };
  }

  if (offerType === 'free_bonus') {
    rejectExtraKeys(['freeItem', 'minPurchase']);
    return { freeItem: str('freeItem'), minPurchase: str('minPurchase') };
  }

  // upgrade
  rejectExtraKeys(['fromLabel', 'toLabel']);
  return { fromLabel: str('fromLabel'), toLabel: str('toLabel') };
}

function parseOfferDate(value, fieldName) {
  if (value === null) return null;
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new StadtpocketOfferError(`${fieldName} must be an ISO date string, or null to clear it.`);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new StadtpocketOfferError(`${fieldName} must be a valid date.`);
  }
  return date;
}

// Normalizes a startsAt/endsAt value that may have round-tripped
// through draftData (a Prisma `Json` column) back into a real Date
// instance. Prisma's Json type has no Date-reviving behavior: a Date
// written into draftData in one request comes back as a plain ISO
// string on the next read (JSON has no Date type), while a value
// that's still fresh in the same request -- e.g. straight out of
// parseOfferDate() -- is already a real Date instance. This accepts
// either transparently, never fabricates a value (null stays null),
// and treats a genuinely unparseable persisted value as null rather
// than throwing -- the same "unknown stays unknown, never invented,
// never allowed to crash an otherwise-valid read" posture this codebase
// already uses elsewhere (see the opening-hours editor's own handling
// of an unrecognized day).
function toDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// startsAt/endsAt are validated together (not per-field) because the
// only real constraint between them -- endsAt strictly after startsAt
// -- only makes sense once both are known. Called both at save-draft
// time (against the merged draft+live pair) and again at publish time
// (defense-in-depth re-validation of the fully merged state, matching
// stadtpocketManagerService.publishListingLocation's own pattern).
// Coerces both inputs via toDateOrNull() first -- every call site
// (createOfferDraft with fresh Dates, saveOfferDraft with a mix of
// fresh Dates and possibly-round-tripped draftData strings, and
// publishOfferInternal via mergeOfferState's own already-normalized
// output) is protected by this one change, with no behavior difference
// for the already-correct cases (a real Date or null in, the same
// comparison result out).
function checkDateOrder(startsAt, endsAt) {
  const s = toDateOrNull(startsAt);
  const e = toDateOrNull(endsAt);
  if (s != null && e != null && e.getTime() <= s.getTime()) {
    throw new StadtpocketOfferError('endsAt must be after startsAt.');
  }
}

// ── Payload validation for save-draft (partial update semantics,
// identical convention to stadtpocketManagerService.validateDraftPayload:
// a field is only touched in draftData if the caller included its key;
// null on a nullable field is an explicit, honored "clear this field") ──
// currentOfferType is the offer's EFFECTIVE offerType before this call
// (draft-over-live, from mergeOfferState) -- needed because a caller may
// send offerDetails alone, without also resending offerType in the same
// payload (e.g. adding the percent value after already picking the
// type in an earlier call). Only saveOfferDraft can supply this; direct
// unit tests of this function pass it explicitly.
function validateOfferDraftPayload(body, currentOfferType = null) {
  const src = body || {};
  const extra = Object.keys(src).filter((k) => !OFFER_FIELDS.includes(k));
  if (extra.length) {
    throw new StadtpocketOfferError(`Unexpected field(s): ${extra.join(', ')}.`);
  }

  const fields = {};

  if ('title' in src) {
    if (typeof src.title !== 'string' || !src.title.trim()) {
      throw new StadtpocketOfferError('title must be a non-empty string.');
    }
    fields.title = src.title.trim();
  }
  if ('description' in src) {
    if (src.description !== null && (typeof src.description !== 'string' || !src.description.trim())) {
      throw new StadtpocketOfferError('description must be a non-empty string, or null to clear it.');
    }
    fields.description = src.description === null ? null : src.description.trim();
  }
  if ('offerText' in src) {
    if (typeof src.offerText !== 'string' || !src.offerText.trim()) {
      throw new StadtpocketOfferError('offerText must be a non-empty string.');
    }
    fields.offerText = src.offerText.trim();
  }
  if ('offerType' in src) {
    fields.offerType = checkOfferType(src.offerType);
  }
  if ('offerDetails' in src) {
    const effectiveType = 'offerType' in fields ? fields.offerType : currentOfferType;
    fields.offerDetails = src.offerDetails === null ? null : checkOfferDetails(effectiveType, src.offerDetails);
  }
  if ('image' in src) {
    fields.image = src.image === null ? null : checkOfferImage(src.image);
  }
  if ('startsAt' in src) {
    fields.startsAt = parseOfferDate(src.startsAt, 'startsAt');
  }
  if ('endsAt' in src) {
    fields.endsAt = parseOfferDate(src.endsAt, 'endsAt');
  }

  return fields;
}

// ── Scope enforcement (identical to stadtpocketManagerService's own) ──
function authorizeLocationAccess(locationId, scope) {
  if (scope.isGlobalAdmin) return;
  if (!scope.locationIds.includes(locationId)) {
    throw new StadtpocketOfferError('Forbidden. Location outside manager scope.', 403);
  }
}

// Three-level re-check: locationId (city, the authorization boundary)
// -> listingLocationId (the business/storefront) -> offerId (this
// specific offer). Each level is re-verified against the loaded row's
// own parent id -- none is ever trusted merely because it was supplied
// alongside the others.
async function findListingLocationInCityOrThrow(locationId, listingLocationId, scope) {
  authorizeLocationAccess(locationId, scope);
  const listingLocation = await prisma.stadtPocketListingLocation.findUnique({
    where: { id: listingLocationId },
  });
  if (!listingLocation || listingLocation.locationId !== locationId) {
    throw new StadtpocketOfferError('StadtPocket listing not found for this location.', 404);
  }
  return listingLocation;
}

async function findOfferOrThrow(locationId, listingLocationId, offerId, scope) {
  await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  const offer = await prisma.stadtPocketOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.listingLocationId !== listingLocationId) {
    throw new StadtpocketOfferError('Offer not found for this business.', 404);
  }
  return offer;
}

// ── Read: editable state (draft merged over live, per field) ──────
// isExpired is always computed here, never stored -- see the schema
// comment on StadtPocketOffer for why (a timestamp already carries this
// fact; a second, potentially-stale status value would not).
//
// startsAt/endsAt are normalized via toDateOrNull() here -- this is the
// single seam every reader (list, detail, and publish's own re-check of
// this function's output) goes through, so the returned shape is always
// a real Date-or-null regardless of whether the picked value came
// fresh from a live column (already a Date) or from draftData after a
// genuine DB round-trip (a plain ISO string). The HTTP response shape
// is unchanged for the frontend either way: res.json() already
// serializes a Date to the same ISO string it always did.
function mergeOfferState(offer) {
  const draft = offer.draftData || {};
  const pick = (key, live) => (key in draft ? draft[key] : live);
  const startsAt = toDateOrNull(pick('startsAt', offer.startsAt));
  const endsAt = toDateOrNull(pick('endsAt', offer.endsAt));
  return {
    offerId: offer.id,
    listingLocationId: offer.listingLocationId,
    status: offer.status,
    publishedAt: offer.publishedAt,
    title: pick('title', offer.title),
    description: pick('description', offer.description),
    offerText: pick('offerText', offer.offerText),
    offerType: pick('offerType', offer.offerType),
    offerDetails: pick('offerDetails', offer.offerDetails),
    image: pick('image', offer.image),
    startsAt,
    endsAt,
    isExpired: endsAt != null ? endsAt.getTime() < Date.now() : false,
  };
}

async function getOfferState(locationId, listingLocationId, offerId, scope) {
  const offer = await findOfferOrThrow(locationId, listingLocationId, offerId, scope);
  return mergeOfferState(offer);
}

// ── List: every offer for one business (admin use only in this phase) ──
async function listOffersForListingLocation(locationId, listingLocationId, scope) {
  await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  const rows = await prisma.stadtPocketOffer.findMany({
    where: { listingLocationId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mergeOfferState);
}

// ── Create / initialize ─────────────────────────────────────────
// title and offerText are the two NOT NULL live columns -- must be
// supplied immediately, same reasoning as
// stadtpocketManagerService.initializeDraft's own required-field set.
// status always starts 'draft' regardless of what's supplied, so a new
// offer is never accidentally publicly relevant until an explicit
// publish (moot today -- no public read path exists yet -- but kept
// consistent with the listing's own creation posture for when one does).
async function createOfferDraft(locationId, listingLocationId, scope, body) {
  await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);

  const src = body || {};
  const required = ['title', 'offerText'];
  const missing = required.filter((f) => typeof src[f] !== 'string' || !src[f].trim());
  if (missing.length) {
    throw new StadtpocketOfferError(`Missing required field(s) to create an offer: ${missing.join(', ')}.`);
  }
  // offerType (not offerDetails) is allowed immediately at creation --
  // Step 1 of the editor picks a type alongside title/offerText.
  // offerDetails stays save-draft-only, same posture as image: it needs
  // an already-resolved offerType to validate against, and the create
  // payload only ever sets offerType itself in the same call, never
  // both together.
  const allowedAtCreate = ['title', 'description', 'offerText', 'offerType', 'startsAt', 'endsAt'];
  const extra = Object.keys(src).filter((k) => !allowedAtCreate.includes(k));
  if (extra.length) {
    throw new StadtpocketOfferError(
      `Unexpected field(s) at creation: ${extra.join(', ')}. Use save-draft after creating the offer to set optional fields, including image and offerDetails.`
    );
  }

  const description = 'description' in src
    ? (src.description === null ? null : (typeof src.description === 'string' && src.description.trim() ? src.description.trim() : (() => { throw new StadtpocketOfferError('description must be a non-empty string, or null to clear it.'); })()))
    : null;
  const offerType = 'offerType' in src ? checkOfferType(src.offerType) : null;
  const startsAt = 'startsAt' in src ? parseOfferDate(src.startsAt, 'startsAt') : null;
  const endsAt = 'endsAt' in src ? parseOfferDate(src.endsAt, 'endsAt') : null;
  checkDateOrder(startsAt, endsAt);

  const offer = await prisma.stadtPocketOffer.create({
    data: {
      listingLocationId,
      title: src.title.trim(),
      description,
      offerText: src.offerText.trim(),
      offerType,
      startsAt,
      endsAt,
      status: 'draft',
      createdBy: scope.userId,
    },
  });
  return mergeOfferState(offer);
}

// ── Save draft ──────────────────────────────────────────────────
async function saveOfferDraft(locationId, listingLocationId, offerId, scope, body) {
  const offer = await findOfferOrThrow(locationId, listingLocationId, offerId, scope);
  const currentMerged = mergeOfferState(offer);
  const fields = validateOfferDraftPayload(body, currentMerged.offerType);

  // Defense-in-depth: if offerType is changing in this call and the
  // caller didn't also explicitly send offerDetails, the OLD type's
  // offerDetails would otherwise persist alongside the NEW type -- a
  // mismatched combination the frontend is expected to avoid (clearing
  // its own local state on switch) but never trusted to actually avoid.
  // Auto-clearing here guarantees offerDetails always belongs to the
  // CURRENT offerType regardless of what the caller remembered to send.
  if ('offerType' in fields && fields.offerType !== currentMerged.offerType && !('offerDetails' in fields)) {
    fields.offerDetails = null;
  }

  // Defense-in-depth: validate date order against the state the draft
  // WOULD produce (merged fields over current live/draft values), not
  // just the fields present in this one call -- a caller who only sends
  // a new startsAt that now conflicts with an already-saved endsAt is
  // still caught here, not just at publish time.
  const nextDraft = { ...(offer.draftData || {}), ...fields };
  const pick = (key, live) => (key in nextDraft ? nextDraft[key] : live);
  checkDateOrder(pick('startsAt', offer.startsAt), pick('endsAt', offer.endsAt));

  const updated = await prisma.stadtPocketOffer.update({
    where: { id: offer.id },
    data: { draftData: nextDraft },
  });
  return mergeOfferState(updated);
}

// ── Publish (atomic) ────────────────────────────────────────────
async function publishOfferInternal(offerId, scope) {
  return prisma.$transaction(async (tx) => {
    const offer = await tx.stadtPocketOffer.findUnique({ where: { id: offerId } });
    if (!offer) {
      throw new StadtpocketOfferError('Offer not found.', 404);
    }
    const listingLocation = await tx.stadtPocketListingLocation.findUnique({ where: { id: offer.listingLocationId } });
    if (!listingLocation) {
      throw new StadtpocketOfferError('Offer not found.', 404);
    }
    authorizeLocationAccess(listingLocation.locationId, scope);

    if (offer.status === 'archived') {
      throw new StadtpocketOfferError('Cannot publish an archived offer.', 400);
    }

    const merged = mergeOfferState(offer);
    const missing = ['title', 'offerText'].filter((f) => !merged[f] || !String(merged[f]).trim());
    if (missing.length) {
      throw new StadtpocketOfferError(`Cannot publish: missing required field(s): ${missing.join(', ')}.`);
    }
    // Re-validation of the fully merged state, same posture as
    // stadtpocketManagerService.publishListingLocation's own re-checks.
    checkDateOrder(merged.startsAt, merged.endsAt);
    if (merged.image != null) checkOfferImage(merged.image);
    if (merged.offerType != null) checkOfferType(merged.offerType);
    if (merged.offerDetails != null) checkOfferDetails(merged.offerType, merged.offerDetails);

    const publishedAt = new Date();
    const updated = await tx.stadtPocketOffer.update({
      where: { id: offer.id },
      data: {
        title: merged.title,
        description: merged.description,
        offerText: merged.offerText,
        offerType: merged.offerType,
        offerDetails: merged.offerDetails,
        image: merged.image,
        startsAt: merged.startsAt,
        endsAt: merged.endsAt,
        status: 'published',
        publishedAt,
      },
    });
    return mergeOfferState(updated);
  });
}

async function publishOffer(locationId, listingLocationId, offerId, scope) {
  // Confirms (locationId, listingLocationId, offerId) actually pair up
  // before handing off to the atomic transaction, which re-authorizes
  // independently -- same reasoning as
  // stadtpocketManagerService.publishForLocation.
  await findOfferOrThrow(locationId, listingLocationId, offerId, scope);
  return publishOfferInternal(offerId, scope);
}

// ── Archive (draft or published -> archived; terminal state) ──────
async function archiveOffer(locationId, listingLocationId, offerId, scope) {
  const offer = await findOfferOrThrow(locationId, listingLocationId, offerId, scope);
  if (offer.status === 'archived') {
    throw new StadtpocketOfferError('Offer is already archived.', 400);
  }
  const updated = await prisma.stadtPocketOffer.update({
    where: { id: offer.id },
    data: { status: 'archived' },
  });
  return mergeOfferState(updated);
}

// ── Delete (hard delete; irreversible) ───────────────────────────────
// Phase B.2.3. Unlike archive above (a status transition -- the row
// stays, just terminal), this permanently removes the row. Same
// three-level ownership re-check as every other mutation here
// (findOfferOrThrow: locationId -> listingLocationId -> offerId, each
// re-verified against the loaded row's own parent id) -- ownership is
// always re-proven against the database, never assumed from the
// caller-supplied ids alone. No status restriction: a draft, published,
// or archived offer can all be deleted the same way, matching the
// admin's "Löschen" action having no such distinction either.
async function deleteOffer(locationId, listingLocationId, offerId, scope) {
  const offer = await findOfferOrThrow(locationId, listingLocationId, offerId, scope);
  await prisma.stadtPocketOffer.delete({ where: { id: offer.id } });
  return { deleted: true, offerId: offer.id };
}

module.exports = {
  StadtpocketOfferError,
  createOfferDraft,
  getOfferState,
  listOffersForListingLocation,
  saveOfferDraft,
  publishOffer,
  archiveOffer,
  deleteOffer,
  // exported for direct unit testing only
  validateOfferDraftPayload,
  mergeOfferState,
  checkOfferImage,
  checkOfferType,
  checkOfferDetails,
  checkDateOrder,
  parseOfferDate,
  toDateOrNull,
  OFFER_IMAGE_SOURCES,
  OFFER_TYPES,
};
