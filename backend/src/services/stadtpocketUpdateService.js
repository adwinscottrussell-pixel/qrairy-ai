/**
 * stadtpocketUpdateService.js — StadtPocket Aktuelles Foundation, Phase 4B.
 * ─────────────────────────────────────────────────────────────
 * Reuses stadtpocketOfferService.js's exact proven architecture rather
 * than inventing a parallel one:
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
 *     folder/upload path introduced here.
 *
 * An Update additionally requires an updateId (three-level addressing:
 * city -> business -> update), since one storefront can post many
 * updates. updateId is never trusted to belong to the claimed
 * listingLocation merely because the caller supplied it -- always
 * re-checked against the loaded row's own listingLocationId, exactly
 * like listingLocationId is re-checked against locationId.
 *
 * PRODUCT LOCK (2026-09-17): Aktuelles is a simple business news feed --
 * title, body, optional image, draft/published/archived status,
 * publishedAt. Deliberately does NOT carry any offer-specific field
 * (no offerText/offerType/offerDetails) and does NOT have an
 * expiresAt/auto-archive concept, an events/coupon shape, or any
 * customer-interaction field -- a post is either draft, published, or
 * explicitly archived by the manager. Do not add any of those without a
 * separately scoped, approved task.
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');
const { isTrustedStadtPocketHeaderImage } = require('./stadtPocketHeaderImageService');

class StadtpocketUpdateError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Field allow-list ──────────────────────────────────────────
const UPDATE_FIELDS = ['title', 'body', 'image'];

// ── Low-level validators ────────────────────────────────────────
// Identical shape/validation to stadtpocketOfferService.checkOfferImage
// (same Cloudinary account, same trusted-origin check) -- deliberately
// without offer-only metadata (no source/starterId: Aktuelles has no
// starter-image catalog).
function checkUpdateImage(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    throw new StadtpocketUpdateError('image must be an object, or null to remove it.');
  }
  if (typeof image.url !== 'string' || !image.url.trim() || typeof image.publicId !== 'string' || !image.publicId.trim()) {
    throw new StadtpocketUpdateError('image.url and image.publicId are required.');
  }
  if (!isTrustedStadtPocketHeaderImage(image.url, image.publicId)) {
    throw new StadtpocketUpdateError('image is not a recognized StadtPocket-uploaded image.');
  }
  let width = null;
  let height = null;
  if (image.width != null) {
    width = Number(image.width);
    if (!Number.isFinite(width) || width <= 0) throw new StadtpocketUpdateError('image.width must be a positive number.');
  }
  if (image.height != null) {
    height = Number(image.height);
    if (!Number.isFinite(height) || height <= 0) throw new StadtpocketUpdateError('image.height must be a positive number.');
  }
  return { url: image.url.trim(), publicId: image.publicId.trim(), width, height };
}

// ── Payload validation for save-draft (partial update semantics,
// identical convention to stadtpocketOfferService.validateOfferDraftPayload:
// a field is only touched in draftData if the caller included its key;
// null on image is an explicit, honored "clear this field") ──
function validateUpdateDraftPayload(body) {
  const src = body || {};
  const extra = Object.keys(src).filter((k) => !UPDATE_FIELDS.includes(k));
  if (extra.length) {
    throw new StadtpocketUpdateError(`Unexpected field(s): ${extra.join(', ')}.`);
  }

  const fields = {};

  if ('title' in src) {
    if (typeof src.title !== 'string' || !src.title.trim()) {
      throw new StadtpocketUpdateError('title must be a non-empty string.');
    }
    fields.title = src.title.trim();
  }
  if ('body' in src) {
    if (typeof src.body !== 'string' || !src.body.trim()) {
      throw new StadtpocketUpdateError('body must be a non-empty string.');
    }
    fields.body = src.body.trim();
  }
  if ('image' in src) {
    fields.image = src.image === null ? null : checkUpdateImage(src.image);
  }

  return fields;
}

// ── Scope enforcement (identical to stadtpocketOfferService's own) ──
function authorizeLocationAccess(locationId, scope) {
  if (scope.isGlobalAdmin) return;
  if (!scope.locationIds.includes(locationId)) {
    throw new StadtpocketUpdateError('Forbidden. Location outside manager scope.', 403);
  }
}

// Three-level re-check: locationId (city, the authorization boundary)
// -> listingLocationId (the business/storefront) -> updateId (this
// specific post). Each level is re-verified against the loaded row's
// own parent id -- none is ever trusted merely because it was supplied
// alongside the others.
async function findListingLocationInCityOrThrow(locationId, listingLocationId, scope) {
  authorizeLocationAccess(locationId, scope);
  const listingLocation = await prisma.stadtPocketListingLocation.findUnique({
    where: { id: listingLocationId },
  });
  if (!listingLocation || listingLocation.locationId !== locationId) {
    throw new StadtpocketUpdateError('StadtPocket listing not found for this location.', 404);
  }
  return listingLocation;
}

async function findUpdateOrThrow(locationId, listingLocationId, updateId, scope) {
  await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  const update = await prisma.stadtPocketUpdate.findUnique({ where: { id: updateId } });
  if (!update || update.listingLocationId !== listingLocationId) {
    throw new StadtpocketUpdateError('Update not found for this business.', 404);
  }
  return update;
}

// ── Read: editable state (draft merged over live, per field) ──────
function mergeUpdateState(update) {
  const draft = update.draftData || {};
  const pick = (key, live) => (key in draft ? draft[key] : live);
  return {
    updateId: update.id,
    listingLocationId: update.listingLocationId,
    status: update.status,
    publishedAt: update.publishedAt,
    title: pick('title', update.title),
    body: pick('body', update.body),
    image: pick('image', update.image),
  };
}

async function getUpdateState(locationId, listingLocationId, updateId, scope) {
  const update = await findUpdateOrThrow(locationId, listingLocationId, updateId, scope);
  return mergeUpdateState(update);
}

// ── List: every update for one business (admin use only) ──────────
async function listUpdatesForListingLocation(locationId, listingLocationId, scope) {
  await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);
  const rows = await prisma.stadtPocketUpdate.findMany({
    where: { listingLocationId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mergeUpdateState);
}

// ── Create / initialize ─────────────────────────────────────────
// title and body are the two NOT NULL live columns -- must be supplied
// immediately, same reasoning as stadtpocketOfferService.createOfferDraft's
// own required-field set. status always starts 'draft' regardless of
// what's supplied.
async function createUpdateDraft(locationId, listingLocationId, scope, body) {
  await findListingLocationInCityOrThrow(locationId, listingLocationId, scope);

  const src = body || {};
  const required = ['title', 'body'];
  const missing = required.filter((f) => typeof src[f] !== 'string' || !src[f].trim());
  if (missing.length) {
    throw new StadtpocketUpdateError(`Missing required field(s) to create an update: ${missing.join(', ')}.`);
  }
  const allowedAtCreate = ['title', 'body'];
  const extra = Object.keys(src).filter((k) => !allowedAtCreate.includes(k));
  if (extra.length) {
    throw new StadtpocketUpdateError(
      `Unexpected field(s) at creation: ${extra.join(', ')}. Use save-draft after creating the update to set the optional image.`
    );
  }

  const update = await prisma.stadtPocketUpdate.create({
    data: {
      listingLocationId,
      title: src.title.trim(),
      body: src.body.trim(),
      status: 'draft',
      createdBy: scope.userId,
    },
  });
  return mergeUpdateState(update);
}

// ── Save draft ──────────────────────────────────────────────────
async function saveUpdateDraft(locationId, listingLocationId, updateId, scope, body) {
  const update = await findUpdateOrThrow(locationId, listingLocationId, updateId, scope);
  const fields = validateUpdateDraftPayload(body);

  const nextDraft = { ...(update.draftData || {}), ...fields };
  const updated = await prisma.stadtPocketUpdate.update({
    where: { id: update.id },
    data: { draftData: nextDraft },
  });
  return mergeUpdateState(updated);
}

// ── Publish (atomic) ────────────────────────────────────────────
async function publishUpdateInternal(updateId, scope) {
  return prisma.$transaction(async (tx) => {
    const update = await tx.stadtPocketUpdate.findUnique({ where: { id: updateId } });
    if (!update) {
      throw new StadtpocketUpdateError('Update not found.', 404);
    }
    const listingLocation = await tx.stadtPocketListingLocation.findUnique({ where: { id: update.listingLocationId } });
    if (!listingLocation) {
      throw new StadtpocketUpdateError('Update not found.', 404);
    }
    authorizeLocationAccess(listingLocation.locationId, scope);

    if (update.status === 'archived') {
      throw new StadtpocketUpdateError('Cannot publish an archived update.', 400);
    }

    const merged = mergeUpdateState(update);
    const missing = ['title', 'body'].filter((f) => !merged[f] || !String(merged[f]).trim());
    if (missing.length) {
      throw new StadtpocketUpdateError(`Cannot publish: missing required field(s): ${missing.join(', ')}.`);
    }
    // Re-validation of the fully merged state, same posture as
    // stadtpocketOfferService.publishOfferInternal's own re-checks.
    if (merged.image != null) checkUpdateImage(merged.image);

    const publishedAt = new Date();
    const updated = await tx.stadtPocketUpdate.update({
      where: { id: update.id },
      data: {
        title: merged.title,
        body: merged.body,
        image: merged.image,
        status: 'published',
        publishedAt,
      },
    });
    return mergeUpdateState(updated);
  });
}

async function publishUpdate(locationId, listingLocationId, updateId, scope) {
  await findUpdateOrThrow(locationId, listingLocationId, updateId, scope);
  return publishUpdateInternal(updateId, scope);
}

// ── Archive (draft or published -> archived; terminal state) ──────
async function archiveUpdate(locationId, listingLocationId, updateId, scope) {
  const update = await findUpdateOrThrow(locationId, listingLocationId, updateId, scope);
  if (update.status === 'archived') {
    throw new StadtpocketUpdateError('Update is already archived.', 400);
  }
  const updated = await prisma.stadtPocketUpdate.update({
    where: { id: update.id },
    data: { status: 'archived' },
  });
  return mergeUpdateState(updated);
}

// ── Delete (hard delete; irreversible) ───────────────────────────────
async function deleteUpdate(locationId, listingLocationId, updateId, scope) {
  const update = await findUpdateOrThrow(locationId, listingLocationId, updateId, scope);
  await prisma.stadtPocketUpdate.delete({ where: { id: update.id } });
  return { deleted: true, updateId: update.id };
}

module.exports = {
  StadtpocketUpdateError,
  createUpdateDraft,
  getUpdateState,
  listUpdatesForListingLocation,
  saveUpdateDraft,
  publishUpdate,
  archiveUpdate,
  deleteUpdate,
  // exported for direct unit testing only
  validateUpdateDraftPayload,
  mergeUpdateState,
  checkUpdateImage,
};
