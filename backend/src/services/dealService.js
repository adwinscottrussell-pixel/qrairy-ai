/**
 * dealService.js — QRAIVY Deals foundation, Phase A1.
 * ─────────────────────────────────────────────────────────────
 * Backend-only foundation: database models + service layer +
 * ownership checks. No route file consumes this yet -- this module is
 * exported for direct unit testing only in this phase.
 *
 * "Create once, distribute everywhere": a Deal carries the content of
 * one offer; a DealPlacement says where that same deal is shown. Nothing
 * here copies a deal per channel or per landing page.
 *
 * Adapted from the StadtPocket Angebote foundation
 * (stadtpocketOfferService.js on preview/stadtpocket-phase6d-admin):
 * same offer types, same draft/publish/archive lifecycle, same
 * draftData isolation, same "expired is computed, never stored" rule.
 * What differs is ownership: there is no city/manager scope here. Every
 * function takes the authenticated account's Clerk user id
 * (`ownerUserId`, the same value as LandingPage.userId) and re-proves
 * ownership against the loaded row on every read and write -- a
 * caller-supplied id is never trusted merely because it parses. A deal
 * that exists but belongs to another account answers 404, never 403, so
 * its existence is not disclosed.
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');

class DealError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Field allow-lists ─────────────────────────────────────────
const DEAL_FIELDS = ['title', 'description', 'offerText', 'offerType', 'offerDetails', 'image', 'startsAt', 'endsAt'];

// Plain string allow-lists, this schema's existing no-enum convention --
// adding a value later is a one-line change here, no migration.
const OFFER_TYPES = ['percentage_discount', 'two_for_one', 'fixed_price', 'free_bonus', 'upgrade', 'custom'];
const DEAL_IMAGE_SOURCES = ['uploaded', 'starter', 'ai_generated'];
const DEAL_STATUSES = ['draft', 'published', 'archived'];

// Only channels with a real, ownership-checkable target are accepted.
// push / wallet / others are added here when their phase is built.
const DEAL_PLACEMENT_CHANNELS = ['landing_page'];

// ── Low-level validators ────────────────────────────────────────
// Shape/origin check only, no network round-trip. The image must sit on
// this deployment's own Cloudinary cloud; restricting it further to a
// dedicated deals folder belongs to the upload phase, which decides that
// folder.
function isTrustedDealImage(url, publicId) {
  if (typeof url !== 'string' || typeof publicId !== 'string' || !publicId) return false;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;
  if (!url.startsWith(`https://res.cloudinary.com/${cloudName}/image/upload/`)) return false;
  return url.includes(publicId);
}

function checkDealImage(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    throw new DealError('image must be an object, or null to remove it.');
  }
  if (typeof image.url !== 'string' || !image.url.trim() || typeof image.publicId !== 'string' || !image.publicId.trim()) {
    throw new DealError('image.url and image.publicId are required.');
  }
  if (!isTrustedDealImage(image.url.trim(), image.publicId.trim())) {
    throw new DealError('image is not a recognized QRAIVY-hosted image.');
  }
  let width = null;
  let height = null;
  if (image.width != null) {
    width = Number(image.width);
    if (!Number.isFinite(width) || width <= 0) throw new DealError('image.width must be a positive number.');
  }
  if (image.height != null) {
    height = Number(image.height);
    if (!Number.isFinite(height) || height <= 0) throw new DealError('image.height must be a positive number.');
  }
  // source is optional and never inferred: an image without it stays
  // source: null rather than getting a fabricated default.
  let source = null;
  if (image.source != null) {
    if (typeof image.source !== 'string' || !DEAL_IMAGE_SOURCES.includes(image.source)) {
      throw new DealError(`image.source must be one of: ${DEAL_IMAGE_SOURCES.join(', ')}.`);
    }
    source = image.source;
  }
  let starterId = null;
  if (image.starterId != null) {
    if (typeof image.starterId !== 'string' || !image.starterId.trim()) {
      throw new DealError('image.starterId must be a non-empty string, or omitted.');
    }
    starterId = image.starterId.trim();
  }
  return { url: image.url.trim(), publicId: image.publicId.trim(), width, height, source, starterId };
}

function checkOfferType(offerType) {
  if (offerType === null) return null;
  if (typeof offerType !== 'string' || !OFFER_TYPES.includes(offerType)) {
    throw new DealError(`offerType must be one of: ${OFFER_TYPES.join(', ')}, or null to clear it.`);
  }
  return offerType;
}

// Reject-not-strip: an unknown key in offerDetails always throws, never
// silently dropped. Each type's shape is validated explicitly so every
// rule stays readable and type-specific. offerDetails never duplicates
// offerText -- it only carries the structured meaning (a real
// number/qty/label) the customer-facing string can't express.
function checkOfferDetails(offerType, offerDetails) {
  if (offerDetails === null) return null;
  if (offerType == null) {
    throw new DealError('offerDetails requires an offerType.');
  }
  if (!OFFER_TYPES.includes(offerType)) {
    throw new DealError(`offerDetails requires a valid offerType, got: ${offerType}.`);
  }
  if (typeof offerDetails !== 'object' || Array.isArray(offerDetails)) {
    throw new DealError('offerDetails must be an object, or null to clear it.');
  }

  const num = (key, { min, max } = {}) => {
    if (offerDetails[key] == null) return null;
    const n = Number(offerDetails[key]);
    if (!Number.isFinite(n)) throw new DealError(`offerDetails.${key} must be a finite number.`);
    if (min != null && n < min) throw new DealError(`offerDetails.${key} must be at least ${min}.`);
    if (max != null && n > max) throw new DealError(`offerDetails.${key} must be at most ${max}.`);
    return n;
  };
  const str = (key) => {
    if (offerDetails[key] == null) return null;
    if (typeof offerDetails[key] !== 'string' || !offerDetails[key].trim()) {
      throw new DealError(`offerDetails.${key} must be a non-empty string, or omitted/null.`);
    }
    return offerDetails[key].trim();
  };
  const rejectExtraKeys = (allowed) => {
    const extra = Object.keys(offerDetails).filter((k) => !allowed.includes(k));
    if (extra.length) {
      throw new DealError(`Unexpected offerDetails field(s) for offerType "${offerType}": ${extra.join(', ')}.`);
    }
  };

  // custom stays genuinely free-form -- structured details never apply.
  if (offerType === 'custom') {
    throw new DealError('offerDetails is not supported for offerType "custom".');
  }

  if (offerType === 'percentage_discount') {
    rejectExtraKeys(['percentOff']);
    const percentOff = num('percentOff', { min: 1, max: 100 });
    if (percentOff == null) throw new DealError('offerDetails.percentOff is required for offerType "percentage_discount".');
    return { percentOff };
  }

  if (offerType === 'two_for_one') {
    rejectExtraKeys(['buyQty', 'freeQty']);
    const buyQty = num('buyQty', { min: 1 });
    const freeQty = num('freeQty', { min: 1 });
    if (buyQty == null || freeQty == null) {
      throw new DealError('offerDetails.buyQty and offerDetails.freeQty are both required for offerType "two_for_one".');
    }
    return { buyQty, freeQty };
  }

  if (offerType === 'fixed_price') {
    rejectExtraKeys(['price', 'currency']);
    const price = num('price', { min: 0.01 });
    if (price == null) throw new DealError('offerDetails.price is required for offerType "fixed_price".');
    // QRAIVY is not EUR-only, so a supplied currency must be a real
    // ISO-4217-shaped code; omitted still defaults to 'EUR', a fixed
    // default rather than an inference from caller data.
    const currency = str('currency') || 'EUR';
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new DealError('offerDetails.currency must be a 3-letter uppercase currency code.');
    }
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

function parseDealDate(value, fieldName) {
  if (value === null) return null;
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new DealError(`${fieldName} must be an ISO date string, or null to clear it.`);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DealError(`${fieldName} must be a valid date.`);
  }
  return date;
}

// A date that round-tripped through draftData (a Prisma Json column)
// comes back as an ISO string, while one fresh from parseDealDate() is a
// real Date. Accepts either, never fabricates a value, and treats an
// unparseable persisted value as null instead of crashing a read.
function toDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function checkDateOrder(startsAt, endsAt) {
  const s = toDateOrNull(startsAt);
  const e = toDateOrNull(endsAt);
  if (s != null && e != null && e.getTime() <= s.getTime()) {
    throw new DealError('endsAt must be after startsAt.');
  }
}

function requireOwner(ownerUserId) {
  if (typeof ownerUserId !== 'string' || !ownerUserId.trim()) {
    throw new DealError('Authentication required.', 401);
  }
  return ownerUserId;
}

// ── Payload validation for save-draft (partial update semantics: a
// field is only touched in draftData if the caller included its key;
// null on a nullable field is an explicit, honored "clear this field") ──
// currentOfferType is the deal's EFFECTIVE offerType before this call
// (draft-over-live), needed because a caller may send offerDetails
// alone, after picking the type in an earlier call.
function validateDealDraftPayload(body, currentOfferType = null) {
  const src = body || {};
  const extra = Object.keys(src).filter((k) => !DEAL_FIELDS.includes(k));
  if (extra.length) {
    throw new DealError(`Unexpected field(s): ${extra.join(', ')}.`);
  }

  const fields = {};

  if ('title' in src) {
    if (typeof src.title !== 'string' || !src.title.trim()) {
      throw new DealError('title must be a non-empty string.');
    }
    fields.title = src.title.trim();
  }
  if ('description' in src) {
    if (src.description !== null && (typeof src.description !== 'string' || !src.description.trim())) {
      throw new DealError('description must be a non-empty string, or null to clear it.');
    }
    fields.description = src.description === null ? null : src.description.trim();
  }
  if ('offerText' in src) {
    if (typeof src.offerText !== 'string' || !src.offerText.trim()) {
      throw new DealError('offerText must be a non-empty string.');
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
    fields.image = src.image === null ? null : checkDealImage(src.image);
  }
  if ('startsAt' in src) {
    fields.startsAt = parseDealDate(src.startsAt, 'startsAt');
  }
  if ('endsAt' in src) {
    fields.endsAt = parseDealDate(src.endsAt, 'endsAt');
  }

  return fields;
}

// ── Ownership enforcement ───────────────────────────────────────
async function findDealOrThrow(ownerUserId, dealId, client = prisma) {
  requireOwner(ownerUserId);
  const deal = typeof dealId === 'string' && dealId
    ? await client.deal.findUnique({ where: { id: dealId } })
    : null;
  if (!deal || deal.ownerUserId !== ownerUserId) {
    throw new DealError('Deal not found.', 404);
  }
  return deal;
}

// The optional Business link is only ever accepted for a Business this
// account actually owns: its primary owner, or an "owner" member row.
// A Business that exists but isn't theirs answers exactly like one that
// doesn't exist.
async function resolveOwnedBusinessId(ownerUserId, businessId) {
  if (businessId === null) return null;
  if (typeof businessId !== 'string' || !businessId.trim()) {
    throw new DealError('businessId must be a non-empty string, or null.');
  }
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw new DealError('Business not found.', 404);
  }
  if (business.primaryOwnerUserId !== ownerUserId) {
    const member = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId: business.id, userId: ownerUserId } },
    });
    if (!member || member.role !== 'owner') {
      throw new DealError('Business not found.', 404);
    }
  }
  return business.id;
}

// ── Read: editable state (draft merged over live, per field) ──────
// isExpired is always computed here, never stored: endsAt already
// carries that fact, and a second status value could go stale.
function mergeDealState(deal) {
  const draft = deal.draftData || {};
  const pick = (key, live) => (key in draft ? draft[key] : live);
  const startsAt = toDateOrNull(pick('startsAt', deal.startsAt));
  const endsAt = toDateOrNull(pick('endsAt', deal.endsAt));
  return {
    dealId: deal.id,
    businessId: deal.businessId || null,
    status: deal.status,
    publishedAt: deal.publishedAt,
    title: pick('title', deal.title),
    description: pick('description', deal.description),
    offerText: pick('offerText', deal.offerText),
    offerType: pick('offerType', deal.offerType),
    offerDetails: pick('offerDetails', deal.offerDetails),
    image: pick('image', deal.image),
    startsAt,
    endsAt,
    isExpired: endsAt != null ? endsAt.getTime() < Date.now() : false,
    hasUnpublishedChanges: Object.keys(draft).length > 0,
  };
}

async function getDealState(ownerUserId, dealId) {
  const deal = await findDealOrThrow(ownerUserId, dealId);
  return mergeDealState(deal);
}

async function listDeals(ownerUserId, { status } = {}) {
  requireOwner(ownerUserId);
  if (status != null && !DEAL_STATUSES.includes(status)) {
    throw new DealError(`status must be one of: ${DEAL_STATUSES.join(', ')}.`);
  }
  const where = { ownerUserId };
  if (status != null) where.status = status;
  const rows = await prisma.deal.findMany({ where, orderBy: { createdAt: 'desc' } });
  return rows.map(mergeDealState);
}

// ── Create ──────────────────────────────────────────────────────
// title and offerText are the two NOT NULL live columns, so both are
// required immediately. status always starts 'draft', whatever is
// supplied. offerDetails and image stay save-draft-only: offerDetails
// needs an already-resolved offerType to validate against.
async function createDealDraft(ownerUserId, body) {
  requireOwner(ownerUserId);

  const src = body || {};
  const required = ['title', 'offerText'];
  const missing = required.filter((f) => typeof src[f] !== 'string' || !src[f].trim());
  if (missing.length) {
    throw new DealError(`Missing required field(s) to create a deal: ${missing.join(', ')}.`);
  }
  const allowedAtCreate = ['title', 'description', 'offerText', 'offerType', 'startsAt', 'endsAt', 'businessId'];
  const extra = Object.keys(src).filter((k) => !allowedAtCreate.includes(k));
  if (extra.length) {
    throw new DealError(
      `Unexpected field(s) at creation: ${extra.join(', ')}. Use save-draft after creating the deal to set optional fields, including image and offerDetails.`
    );
  }

  let description = null;
  if ('description' in src && src.description !== null) {
    if (typeof src.description !== 'string' || !src.description.trim()) {
      throw new DealError('description must be a non-empty string, or null to clear it.');
    }
    description = src.description.trim();
  }
  const offerType = 'offerType' in src ? checkOfferType(src.offerType) : null;
  const startsAt = 'startsAt' in src ? parseDealDate(src.startsAt, 'startsAt') : null;
  const endsAt = 'endsAt' in src ? parseDealDate(src.endsAt, 'endsAt') : null;
  checkDateOrder(startsAt, endsAt);
  const businessId = 'businessId' in src ? await resolveOwnedBusinessId(ownerUserId, src.businessId) : null;

  const deal = await prisma.deal.create({
    data: {
      ownerUserId,
      businessId,
      title: src.title.trim(),
      description,
      offerText: src.offerText.trim(),
      offerType,
      startsAt,
      endsAt,
      status: 'draft',
      createdBy: ownerUserId,
    },
  });
  return mergeDealState(deal);
}

// ── Save draft ──────────────────────────────────────────────────
async function saveDealDraft(ownerUserId, dealId, body) {
  const deal = await findDealOrThrow(ownerUserId, dealId);
  if (deal.status === 'archived') {
    throw new DealError('Cannot edit an archived deal.', 400);
  }
  const currentMerged = mergeDealState(deal);
  const fields = validateDealDraftPayload(body, currentMerged.offerType);

  // If offerType changes and the caller didn't also send offerDetails,
  // the old type's details would otherwise persist alongside the new
  // type. Clearing here guarantees offerDetails always belongs to the
  // current offerType, whatever the caller remembered to send.
  if ('offerType' in fields && fields.offerType !== currentMerged.offerType && !('offerDetails' in fields)) {
    fields.offerDetails = null;
  }

  // Validate date order against the state the draft WOULD produce, not
  // just the fields in this one call.
  const nextDraft = { ...(deal.draftData || {}), ...fields };
  const pick = (key, live) => (key in nextDraft ? nextDraft[key] : live);
  checkDateOrder(pick('startsAt', deal.startsAt), pick('endsAt', deal.endsAt));

  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: { draftData: nextDraft },
  });
  return mergeDealState(updated);
}

// ── Publish (atomic) ────────────────────────────────────────────
// Promotes the merged draft into the live columns and clears draftData
// in the same write, so the published row and the editable state can
// never disagree after a successful publish. Ownership is re-proven
// inside the transaction, against the row the transaction itself read.
async function publishDeal(ownerUserId, dealId) {
  requireOwner(ownerUserId);
  return prisma.$transaction(async (tx) => {
    const deal = await findDealOrThrow(ownerUserId, dealId, tx);
    if (deal.status === 'archived') {
      throw new DealError('Cannot publish an archived deal.', 400);
    }

    const merged = mergeDealState(deal);
    const missing = ['title', 'offerText'].filter((f) => !merged[f] || !String(merged[f]).trim());
    if (missing.length) {
      throw new DealError(`Cannot publish: missing required field(s): ${missing.join(', ')}.`);
    }
    // Re-validation of the fully merged state (defense in depth).
    checkDateOrder(merged.startsAt, merged.endsAt);
    if (merged.endsAt != null && merged.endsAt.getTime() <= Date.now()) {
      throw new DealError('Cannot publish: endsAt is in the past.');
    }
    if (merged.image != null) checkDealImage(merged.image);
    if (merged.offerType != null) checkOfferType(merged.offerType);
    if (merged.offerDetails != null) checkOfferDetails(merged.offerType, merged.offerDetails);

    const updated = await tx.deal.update({
      where: { id: deal.id },
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
        publishedAt: new Date(),
        draftData: null,
      },
    });
    return mergeDealState(updated);
  });
}

// ── Archive (draft or published -> archived; terminal state) ──────
// Placements are left as they are: a placement is only ever publicly
// relevant while its deal is published, so archiving the deal alone
// already takes it out of every channel.
async function archiveDeal(ownerUserId, dealId) {
  const deal = await findDealOrThrow(ownerUserId, dealId);
  if (deal.status === 'archived') {
    throw new DealError('Deal is already archived.', 400);
  }
  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: { status: 'archived' },
  });
  return mergeDealState(updated);
}

// ── Delete (hard delete; irreversible) ──────────────────────────
// Placements go with it (DealPlacement.dealId is ON DELETE CASCADE).
async function deleteDeal(ownerUserId, dealId) {
  const deal = await findDealOrThrow(ownerUserId, dealId);
  await prisma.deal.delete({ where: { id: deal.id } });
  return { deleted: true, dealId: deal.id };
}

// ── Placements ──────────────────────────────────────────────────
function toPlacementState(placement) {
  return {
    placementId: placement.id,
    dealId: placement.dealId,
    channel: placement.channel,
    targetRef: placement.targetRef,
    status: placement.status,
    publishedAt: placement.publishedAt,
  };
}

function checkPlacementChannel(channel) {
  if (typeof channel !== 'string' || !DEAL_PLACEMENT_CHANNELS.includes(channel)) {
    throw new DealError(`channel must be one of: ${DEAL_PLACEMENT_CHANNELS.join(', ')}.`);
  }
  return channel;
}

// The target must belong to the same account as the deal -- a deal can
// never be placed on someone else's landing page, and a page that isn't
// theirs answers exactly like one that doesn't exist.
async function assertOwnedPlacementTarget(ownerUserId, channel, targetRef, client = prisma) {
  if (typeof targetRef !== 'string' || !targetRef.trim()) {
    throw new DealError('targetRef must be a non-empty string.');
  }
  const ref = targetRef.trim();
  // landing_page: targetRef is LandingPage.slug
  const page = await client.landingPage.findUnique({ where: { slug: ref } });
  if (!page || page.userId !== ownerUserId) {
    throw new DealError('Landing page not found.', 404);
  }
  return ref;
}

async function findPlacementOrThrow(ownerUserId, dealId, placementId, client = prisma) {
  const deal = await findDealOrThrow(ownerUserId, dealId, client);
  const placement = typeof placementId === 'string' && placementId
    ? await client.dealPlacement.findUnique({ where: { id: placementId } })
    : null;
  if (!placement || placement.dealId !== deal.id) {
    throw new DealError('Placement not found for this deal.', 404);
  }
  return { deal, placement };
}

async function listDealPlacements(ownerUserId, dealId) {
  const deal = await findDealOrThrow(ownerUserId, dealId);
  const rows = await prisma.dealPlacement.findMany({
    where: { dealId: deal.id },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toPlacementState);
}

// Attaches the deal to one target. Always starts 'draft' -- attaching
// never makes anything publicly relevant by itself. One placement per
// (deal, channel, target): asking again for the same one is a 409, not
// a silent second row.
async function addDealPlacement(ownerUserId, dealId, body) {
  const deal = await findDealOrThrow(ownerUserId, dealId);
  if (deal.status === 'archived') {
    throw new DealError('Cannot add a placement to an archived deal.', 400);
  }
  const src = body || {};
  const extra = Object.keys(src).filter((k) => !['channel', 'targetRef'].includes(k));
  if (extra.length) {
    throw new DealError(`Unexpected field(s): ${extra.join(', ')}.`);
  }
  const channel = checkPlacementChannel(src.channel);
  const targetRef = await assertOwnedPlacementTarget(ownerUserId, channel, src.targetRef);

  const existing = await prisma.dealPlacement.findUnique({
    where: { dealId_channel_targetRef: { dealId: deal.id, channel, targetRef } },
  });
  if (existing) {
    throw new DealError('This deal already has a placement for that target.', 409);
  }
  const placement = await prisma.dealPlacement.create({
    data: { dealId: deal.id, channel, targetRef, status: 'draft' },
  });
  return toPlacementState(placement);
}

// A placement can only go live for a deal that is itself published, and
// only while the target still belongs to this account (re-checked here,
// not assumed from when the placement was added).
async function publishDealPlacement(ownerUserId, dealId, placementId) {
  requireOwner(ownerUserId);
  return prisma.$transaction(async (tx) => {
    const { deal, placement } = await findPlacementOrThrow(ownerUserId, dealId, placementId, tx);
    if (placement.status === 'archived') {
      throw new DealError('Cannot publish an archived placement.', 400);
    }
    if (deal.status !== 'published') {
      throw new DealError('Publish the deal before publishing a placement.', 400);
    }
    await assertOwnedPlacementTarget(ownerUserId, placement.channel, placement.targetRef, tx);
    const updated = await tx.dealPlacement.update({
      where: { id: placement.id },
      data: { status: 'published', publishedAt: new Date() },
    });
    return toPlacementState(updated);
  });
}

async function archiveDealPlacement(ownerUserId, dealId, placementId) {
  const { placement } = await findPlacementOrThrow(ownerUserId, dealId, placementId);
  if (placement.status === 'archived') {
    throw new DealError('Placement is already archived.', 400);
  }
  const updated = await prisma.dealPlacement.update({
    where: { id: placement.id },
    data: { status: 'archived' },
  });
  return toPlacementState(updated);
}

module.exports = {
  DealError,
  createDealDraft,
  getDealState,
  listDeals,
  saveDealDraft,
  publishDeal,
  archiveDeal,
  deleteDeal,
  listDealPlacements,
  addDealPlacement,
  publishDealPlacement,
  archiveDealPlacement,
  // exported for direct unit testing only
  validateDealDraftPayload,
  mergeDealState,
  checkDealImage,
  checkOfferType,
  checkOfferDetails,
  checkDateOrder,
  parseDealDate,
  toDateOrNull,
  isTrustedDealImage,
  OFFER_TYPES,
  DEAL_IMAGE_SOURCES,
  DEAL_STATUSES,
  DEAL_PLACEMENT_CHANNELS,
};
