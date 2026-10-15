/**
 * dealService.js — QRAIVY Deals foundation, Phase A1.
 * ─────────────────────────────────────────────────────────────
 * Database models + service layer + ownership checks. Consumed by
 * controllers/dealController.js (routes/dealRoutes.js, mounted at /deals).
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
const { hasCapacity } = require('../config/plans');
const { ACTIVE_DEAL_IMAGE_FOLDER, DEAL_BACKGROUNDS, findDealStarterImage } = require('../data/dealImages');
const { forgetPageDeals } = require('./dealCards');
const { getDealAccess } = require('./dealAccess');

class DealError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// The account already has as many draft/published deals as its limit allows.
// The controller answers it as the established 402 plan_limit.
class DealLimitError extends DealError {
  constructor(limit, current) {
    super('Deal limit reached.', 402);
    this.code = 'plan_limit';
    this.limit = limit;
    this.current = current;
  }
}
const LIMITED_DEAL_STATUSES = ['draft', 'published'];
const DEAL_CREATE_LOCK_PREFIX = 'qraivy:deals:create:';

// ── Field allow-lists ─────────────────────────────────────────
const DEAL_FIELDS = ['title', 'description', 'offerText', 'offerType', 'offerDetails', 'image', 'startsAt', 'endsAt'];

// Plain string allow-lists, this schema's existing no-enum convention --
// adding a value later is a one-line change here, no migration.
const OFFER_TYPES = ['percentage_discount', 'two_for_one', 'fixed_price', 'free_bonus', 'upgrade', 'custom'];
const DEAL_IMAGE_SOURCES = ['uploaded', 'starter', 'background'];
const DEAL_STATUSES = ['draft', 'published', 'archived'];

// Only channels with a real, ownership-checkable target are accepted.
// push / wallet / others are added here when their phase is built.
const DEAL_PLACEMENT_CHANNELS = ['landing_page'];

// Same limits the Deal Builder shows as character counters. Enforced here
// so they hold for every caller, not only for that one screen.
const DEAL_TEXT_LIMITS = { title: 80, offerText: 120, description: 400, detail: 60 };
function checkLength(value, fieldName, max) {
  if (value.length > max) throw new DealError(`${fieldName} must be at most ${max} characters.`);
  return value;
}

// ── Low-level validators ────────────────────────────────────────
// Shape/origin check only, no network round-trip. An uploaded image must
// sit on this deployment's own Cloudinary cloud, inside the deals folder
// dealImageUploadService.js writes to -- so a URL to some other picture
// can never be attached to a deal by editing a request.
function isTrustedDealImage(url, publicId) {
  if (typeof url !== 'string' || typeof publicId !== 'string' || !publicId) return false;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;
  if (!url.startsWith(`https://res.cloudinary.com/${cloudName}/image/upload/`)) return false;
  if (!ACTIVE_DEAL_IMAGE_FOLDER || !publicId.startsWith(`${ACTIVE_DEAL_IMAGE_FOLDER}/`)) return false;
  return url.includes(publicId);
}

// The master of an uploaded image (uploads from Phase 1 on): the plain,
// untransformed delivery URL of the SAME Cloudinary asset as the image
// itself, with its pixel size. Optional -- older uploads have none.
const MAX_MASTER_EDGE = 20000;
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); }
function checkDealImageMaster(master, publicId) {
  if (master == null) return null;
  if (typeof master !== 'object' || Array.isArray(master)) throw new DealError('image.master must be an object.');
  const url = typeof master.url === 'string' ? master.url.trim() : '';
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const plain = cloudName ? new RegExp('^https://res\\.cloudinary\\.com/' + escapeRegExp(cloudName) + '/image/upload/(?:v\\d+/)?' + escapeRegExp(publicId) + '\\.(?:jpe?g|png|webp)$') : null;
  if (!plain || !isTrustedDealImage(url, publicId) || !plain.test(url)) {
    throw new DealError('image.master is not the original of this QRAIVY-hosted image.');
  }
  const width = Number(master.width);
  const height = Number(master.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > MAX_MASTER_EDGE || height > MAX_MASTER_EDGE) {
    throw new DealError('image.master width and height must be whole positive numbers.');
  }
  return { url, width, height };
}

// A deal image is exactly one of three kinds (see data/dealImages.js).
// Whatever the caller sends is rebuilt here from scratch: only the fields
// of that kind survive, and facts the server owns -- above all whether a
// starter image is AI-generated -- come from the server's own catalog.
// An image stored without a source is an upload (the only kind that
// existed before sources were introduced).
function checkDealImage(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    throw new DealError('image must be an object, or null to remove it.');
  }
  const source = image.source == null ? 'uploaded' : image.source;
  if (typeof source !== 'string' || !DEAL_IMAGE_SOURCES.includes(source)) {
    throw new DealError(`image.source must be one of: ${DEAL_IMAGE_SOURCES.join(', ')}.`);
  }

  if (source === 'starter') {
    const starter = typeof image.starterId === 'string' ? findDealStarterImage(image.starterId.trim()) : null;
    if (!starter) throw new DealError('image.starterId is not a known starter image.');
    // aiGenerated is stamped from the catalog and can never be sent as false.
    return { source: 'starter', starterId: starter.id, aiGenerated: starter.origin === 'ai_generated' };
  }

  if (source === 'background') {
    const id = typeof image.backgroundId === 'string' ? image.backgroundId.trim() : '';
    if (!DEAL_BACKGROUNDS.includes(id)) throw new DealError('image.backgroundId is not a known background.');
    return { source: 'background', backgroundId: id };
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
  const master = checkDealImageMaster(image.master, image.publicId.trim());
  const stored = { source: 'uploaded', url: image.url.trim(), publicId: image.publicId.trim(), width, height };
  if (master) stored.master = master;   // absent, not null, on older uploads: their stored shape is unchanged
  return stored;
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
    return checkLength(offerDetails[key].trim(), `offerDetails.${key}`, DEAL_TEXT_LIMITS.detail);
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
    fields.title = checkLength(src.title.trim(), 'title', DEAL_TEXT_LIMITS.title);
  }
  if ('description' in src) {
    if (src.description !== null && (typeof src.description !== 'string' || !src.description.trim())) {
      throw new DealError('description must be a non-empty string, or null to clear it.');
    }
    fields.description = src.description === null ? null : checkLength(src.description.trim(), 'description', DEAL_TEXT_LIMITS.description);
  }
  if ('offerText' in src) {
    if (typeof src.offerText !== 'string' || !src.offerText.trim()) {
      throw new DealError('offerText must be a non-empty string.');
    }
    fields.offerText = checkLength(src.offerText.trim(), 'offerText', DEAL_TEXT_LIMITS.offerText);
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

// What the deal IS right now, judged from its published (live) columns
// only: "scheduled" and "expired" are computed from the live dates, never
// stored, and pending draft edits never change them -- an owner trying a
// new end date in a draft has not un-published anything.
function liveStatus(deal, now = Date.now()) {
  if (deal.status !== 'published') return deal.status;
  const startsAt = toDateOrNull(deal.startsAt);
  const endsAt = toDateOrNull(deal.endsAt);
  if (endsAt != null && endsAt.getTime() < now) return 'expired';
  if (startsAt != null && startsAt.getTime() > now) return 'scheduled';
  return 'published';
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
    displayStatus: liveStatus(deal),
    publishedAt: deal.publishedAt,
    createdAt: deal.createdAt || null,
    updatedAt: deal.updatedAt || null,
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
async function createDealDraft(ownerUserId, body, options = {}) {
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
    description = checkLength(src.description.trim(), 'description', DEAL_TEXT_LIMITS.description);
  }
  checkLength(src.title.trim(), 'title', DEAL_TEXT_LIMITS.title);
  checkLength(src.offerText.trim(), 'offerText', DEAL_TEXT_LIMITS.offerText);
  const offerType = 'offerType' in src ? checkOfferType(src.offerType) : null;
  const startsAt = 'startsAt' in src ? parseDealDate(src.startsAt, 'startsAt') : null;
  const endsAt = 'endsAt' in src ? parseDealDate(src.endsAt, 'endsAt') : null;
  checkDateOrder(startsAt, endsAt);
  const businessId = 'businessId' in src ? await resolveOwnedBusinessId(ownerUserId, src.businessId) : null;

  const data = {
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
  };

  // Deal limit (options.limit from services/dealAccess.js; null = unlimited).
  // Draft and published deals count, archived ones do not. Count and create
  // run in ONE transaction behind a per-account advisory lock, so parallel
  // creates by the same account queue up and can never exceed the limit;
  // other accounts are not affected. Without options.limit (internal
  // callers) creation is unlimited, as before.
  if (options.limit !== undefined && options.limit !== null) {
    const limit = options.limit;
    const deal = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${DEAL_CREATE_LOCK_PREFIX + ownerUserId}, 0))`;
      const current = await countLimitedDeals(ownerUserId, tx);
      if (!hasCapacity(limit, current)) throw new DealLimitError(limit, current);
      return tx.deal.create({ data });
    });
    return mergeDealState(deal);
  }

  const deal = await prisma.deal.create({ data });
  return mergeDealState(deal);
}

// The deals the Deal limit counts: draft and published, never archived.
// The create transaction above and GET /deals/access both use this, so the
// usage the owner is shown is exactly the number the limit is checked against.
async function countLimitedDeals(ownerUserId, client = prisma) {
  return client.deal.count({ where: { ownerUserId, status: { in: LIMITED_DEAL_STATUSES } } });
}

// ── Save draft ──────────────────────────────────────────────────
// An uploaded image can only come in through the image upload (which is
// access-checked): saving a draft may keep this deal's own live or draft
// upload, but never attach any other uploaded picture -- not a new one and
// not one from another deal. options.allowNewUpload is set by the upload
// handler only.
function isUploadedImage(image) {
  return !!image && typeof image === 'object' && (image.source == null || image.source === 'uploaded');
}
function isOwnExistingUpload(deal, image) {
  const own = [deal.image, deal.draftData && deal.draftData.image].filter(isUploadedImage);
  return own.some((o) => o.publicId === image.publicId && o.url === image.url);
}

async function saveDealDraft(ownerUserId, dealId, body, options = {}) {
  const deal = await findDealOrThrow(ownerUserId, dealId);
  if (deal.status === 'archived') {
    throw new DealError('Cannot edit an archived deal.', 400);
  }
  const currentMerged = mergeDealState(deal);
  const fields = validateDealDraftPayload(body, currentMerged.offerType);
  if (fields.image && isUploadedImage(fields.image) && options.allowNewUpload !== true && !isOwnExistingUpload(deal, fields.image)) {
    throw new DealError('A new picture can only be added with the image upload.', 400);
  }

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
// options.includePlacements (opt-in): in the same transaction, also publish
// every DRAFT placement of this deal, re-checking that each page still
// belongs to the owner. If one does not, nothing is published (the deal
// included). Without the option publishing is exactly as before.
// What customers see on landing pages is cached briefly (services/dealCards.js);
// every change that could alter it drops the cache of the affected pages.
// A failure here never fails the owner's action.
async function forgetDealPages(dealId) {
  try {
    const rows = await prisma.dealPlacement.findMany({ where: { dealId } });
    forgetPageDeals(rows.map((p) => p.targetRef));
  } catch (e) { console.error('[deals] could not clear landing page cache:', e && e.message); }
}

async function publishDeal(ownerUserId, dealId, options = {}) {
  requireOwner(ownerUserId);
  const includePlacements = options && options.includePlacements;
  if (includePlacements !== undefined && typeof includePlacements !== 'boolean') {
    throw new DealError('includePlacements must be true or false.');
  }
  const published = await prisma.$transaction(async (tx) => {
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

    // Conditional write: the status read above may be stale. If an archive
    // (or delete) commits meanwhile, PostgreSQL re-checks this WHERE against
    // the committed row, nothing matches, and the whole publish is refused
    // instead of silently turning the archived deal back into a published one.
    // Republishing a published deal still matches.
    const written = await tx.deal.updateMany({
      where: { id: deal.id, ownerUserId, status: { not: 'archived' } },
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
    if (written.count !== 1) {
      throw new DealError('This deal was archived or deleted while it was being published. Nothing was published.', 409);
    }
    const updated = await tx.deal.findUnique({ where: { id: deal.id } });
    if (includePlacements === true) {
      const drafts = (await tx.dealPlacement.findMany({ where: { dealId: deal.id } })).filter((p) => p.status === 'draft');
      for (const p of drafts) {
        try {
          await assertOwnedPlacementTarget(ownerUserId, p.channel, p.targetRef, tx);
        } catch (e) {
          throw new DealError('A selected page no longer belongs to this account: ' + p.targetRef + '. Nothing was published.', 409);
        }
        // Only a placement that is still a draft. Another publish of the same
        // deal may have published it meanwhile (fine); a removal (archive)
        // that committed meanwhile stops the whole publish.
        const placed = await tx.dealPlacement.updateMany({ where: { id: p.id, status: 'draft' }, data: { status: 'published', publishedAt: new Date() } });
        if (placed.count !== 1) {
          const current = await tx.dealPlacement.findUnique({ where: { id: p.id } });
          if (!current || current.status !== 'published') {
            throw new DealError('A selected page was removed from this deal while it was being published: ' + p.targetRef + '. Nothing was published.', 409);
          }
        }
      }
    }
    return mergeDealState(updated);
  });
  await forgetDealPages(published.dealId);
  return published;
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
  await forgetDealPages(deal.id);
  return mergeDealState(updated);
}

// ── Delete (hard delete; irreversible) ──────────────────────────
// Placements go with it (DealPlacement.dealId is ON DELETE CASCADE).
async function deleteDeal(ownerUserId, dealId) {
  const deal = await findDealOrThrow(ownerUserId, dealId);
  await forgetDealPages(deal.id);   // before the cascade removes its placements
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
    if (existing.status !== 'archived') {
      throw new DealError('This deal already has a placement for that target.', 409);
    }
    // A page removed earlier is added again by restoring the SAME row -- one
    // record per deal and page -- as a draft: publishing stays an explicit
    // step. The update only applies while the row is still archived, so two
    // concurrent requests restore it once; the other one gets a 409.
    // Ownership of the page was re-checked above.
    const res = await prisma.dealPlacement.updateMany({
      where: { id: existing.id, status: 'archived' },
      data: { status: 'draft', publishedAt: null },
    });
    if (res.count !== 1) {
      throw new DealError('This deal already has a placement for that target.', 409);
    }
    const restored = await prisma.dealPlacement.findUnique({ where: { id: existing.id } });
    forgetPageDeals([targetRef]);
    return { ...toPlacementState(restored), restored: true };
  }
  let placement;
  try {
    placement = await prisma.dealPlacement.create({
      data: { dealId: deal.id, channel, targetRef, status: 'draft' },
    });
  } catch (e) {
    // Two concurrent first-time adds: the unique (deal, channel, page) key lets one win.
    if (e && e.code === 'P2002') throw new DealError('This deal already has a placement for that target.', 409);
    throw e;
  }
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
    // Conditional write, like publishDeal: a removal (archive) that commits
    // after the read above is never overwritten; republishing still matches.
    const written = await tx.dealPlacement.updateMany({
      where: { id: placement.id, dealId: deal.id, status: { not: 'archived' } },
      data: { status: 'published', publishedAt: new Date() },
    });
    if (written.count !== 1) {
      throw new DealError('This page was removed from the deal while it was being published. Nothing was published.', 409);
    }
    const updated = await tx.dealPlacement.findUnique({ where: { id: placement.id } });
    return toPlacementState(updated);
  }).then((state) => { forgetPageDeals([state.targetRef]); return state; });
}

// ── Owner's landing pages (for choosing where a deal appears) ─────
// Only the signed-in owner's own pages; only what a page picker needs.
async function listOwnerLandingPages(ownerUserId, client = prisma) {
  requireOwner(ownerUserId);
  const pages = await client.landingPage.findMany({
    where: { userId: ownerUserId },
    select: { slug: true, businessName: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  return pages.map((p) => ({ slug: p.slug, name: p.businessName, live: p.status !== 'draft' }));
}

// ── Public: the deals a customer may see on a landing page ───────
// A deal is shown on a page only if ALL of these hold right now:
//   - the page exists, is live and has an owner
//   - a PUBLISHED landing_page placement points at that page
//   - the deal itself is published and inside its date range
//   - the deal's owner is (still) the page's owner
//   - that owner has Deals access RIGHT NOW (services/dealAccess.js: the
//     same rollout + plan decision that gates creating and publishing; an
//     expired trial or a cancelled subscription counts as Free). Without it
//     nothing is shown, but nothing is changed either: deals, placements
//     and their statuses stay as they are, so the same cards come back as
//     soon as access returns. If access cannot be determined, the lookup
//     throws and the page is rendered without cards (dealCards.js).
// Only customer-safe fields are returned -- never draftData, ids of
// owners or businesses, storage public ids or the image master.
const MAX_PUBLIC_DEALS_PER_PAGE = 3;
const PUBLIC_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
function toPublicImage(image) {
  if (!image || typeof image !== 'object') return null;
  if (image.source === 'starter') {
    const starter = findDealStarterImage(image.starterId);
    return starter ? { source: 'starter', starterId: starter.id, aiGenerated: starter.origin === 'ai_generated' } : null;
  }
  if (image.source === 'background') return DEAL_BACKGROUNDS.includes(image.backgroundId) ? { source: 'background', backgroundId: image.backgroundId } : null;
  if (typeof image.url === 'string' && image.url && isTrustedDealImage(image.url, image.publicId)) {
    return { source: 'uploaded', url: image.url, width: image.width || null, height: image.height || null };
  }
  return null;
}
function toPublicDeal(deal) {
  return {
    title: deal.title,
    offerText: deal.offerText,
    description: deal.description || null,
    offerType: deal.offerType || null,
    offerDetails: deal.offerDetails || null,
    image: toPublicImage(deal.image),
    startsAt: deal.startsAt || null,
    endsAt: deal.endsAt || null,
  };
}
async function activeDealsForPage(slug, now = new Date(), client = prisma) {
  if (typeof slug !== 'string' || !PUBLIC_SLUG.test(slug)) return [];
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(at)) return [];
  const page = await client.landingPage.findUnique({ where: { slug } });
  if (!page || !page.userId || page.status === 'draft') return [];
  // Every card belongs to the page owner (checked below), so one access decision covers the page.
  const access = await getDealAccess(page.userId, { client, now: new Date(at) });
  if (!access.allowed) return [];
  const placements = await client.dealPlacement.findMany({
    where: { channel: 'landing_page', targetRef: slug, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });
  const shown = [];
  const seen = new Set();
  for (const p of placements) {
    if (p.channel !== 'landing_page' || p.targetRef !== slug || p.status !== 'published' || seen.has(p.dealId)) continue;
    const deal = await client.deal.findUnique({ where: { id: p.dealId } });
    if (!deal || deal.ownerUserId !== page.userId) continue;
    if (liveStatus(deal, at) !== 'published') continue;     // draft, archived, scheduled, expired
    seen.add(p.dealId);
    shown.push(toPublicDeal(deal));
    if (shown.length >= MAX_PUBLIC_DEALS_PER_PAGE) break;
  }
  return shown;
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
  forgetPageDeals([updated.targetRef]);
  return toPlacementState(updated);
}

module.exports = {
  DealError,
  DealLimitError,
  LIMITED_DEAL_STATUSES,
  countLimitedDeals,
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
  listOwnerLandingPages,
  activeDealsForPage,
  MAX_PUBLIC_DEALS_PER_PAGE,
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
  liveStatus,
  DEAL_TEXT_LIMITS,
  OFFER_TYPES,
  DEAL_IMAGE_SOURCES,
  DEAL_STATUSES,
  DEAL_PLACEMENT_CHANNELS,
};
