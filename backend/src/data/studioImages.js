/**
 * studioImages.js — where Landing Page Studio V3 images may come from
 * (Image Phase 1).
 * ─────────────────────────────────────────────────────────────
 * Storage (Cloudinary, the account in CLOUDINARY_CLOUD_NAME):
 *
 *   <ACTIVE_STUDIO_IMAGE_FOLDER>/<userId>/<pageId>/img-<ms>-<hex>
 *               an owner's upload (services/studioImageUploadService.js).
 *               userId is the Clerk user id (user_…), pageId the
 *               LandingPage id: no email, name or slug in the path. Every
 *               upload gets its own public id and is never overwritten, so
 *               an older draft keeps the picture it was saved with.
 *   qraivy-studio-starters/<id>, qraivy-deal-starters/<id>
 *               the approved starter photos the onboarding templates and the
 *               Studio demo use (js/studio/onboarding-templates.js); shared by
 *               every account, uploaded by QRAIVY, never by an owner.
 *
 * ACTIVE_STUDIO_IMAGE_FOLDER is production's qraivy-studio, or on a staging
 * server its STUDIO_IMAGE_FOLDER (config/stagingPolicy.js), or none: then
 * Studio uploads answer 503 and never fall back to the production folder.
 *
 * imageScope(userId, known) is what the server passes to
 * V3.validateDesign as opts.images on every write: a design may only hold
 * images from the signed-in owner's own folder, the starter folders, or an
 * address the page already held (`known`: the stored draft, the legacy
 * page's logo). Another account's uploads, deal images or logos cannot be
 * brought in, through the Studio or the API.
 * ─────────────────────────────────────────────────────────────
 */
'use strict';

const STUDIO_IMAGE_FOLDER = 'qraivy-studio';
const STARTER_IMAGE_FOLDERS = Object.freeze(['qraivy-studio-starters', 'qraivy-deal-starters']);

function studioImageFolderFor(policy) {
  if (!policy) return STUDIO_IMAGE_FOLDER;
  return policy.studioImageFolder || null;
}
const ACTIVE_STUDIO_IMAGE_FOLDER = studioImageFolderFor(require('../config/stagingPolicy').policy);

// Path segments that are safe in a public id (Clerk ids and Prisma cuid/uuid ids pass).
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

// The owner's folder, or null when this server stores no Studio images or the id is not safe in a path.
function ownerImageFolder(userId, folder = ACTIVE_STUDIO_IMAGE_FOLDER) {
  if (!folder || typeof userId !== 'string' || !SAFE_SEGMENT.test(userId)) return null;
  return folder + '/' + userId;
}
function pageImageFolder(userId, pageId, folder = ACTIVE_STUDIO_IMAGE_FOLDER) {
  const owner = ownerImageFolder(userId, folder);
  if (!owner || typeof pageId !== 'string' || !SAFE_SEGMENT.test(pageId)) return null;
  return owner + '/' + pageId;
}

// Every string in a stored design that looks like a Cloudinary image address
// (the images the page already holds).
const CLOUDINARY_IMAGE = /^https:\/\/res\.cloudinary\.com\//;
function imagesIn(value, out = new Set(), depth = 0) {
  if (depth > 12 || value == null) return out;
  if (typeof value === 'string') { if (CLOUDINARY_IMAGE.test(value) && value.length <= 500) out.add(value); return out; }
  if (Array.isArray(value)) { for (const v of value) imagesIn(v, out, depth + 1); return out; }
  if (typeof value === 'object') { for (const k of Object.keys(value)) imagesIn(value[k], out, depth + 1); }
  return out;
}

function imageScope(userId, known = []) {
  const owner = ownerImageFolder(userId);
  return {
    folders: STARTER_IMAGE_FOLDERS.concat(owner ? [owner] : []),
    known: Array.from(new Set(known.filter((u) => typeof u === 'string' && u))),
  };
}

module.exports = {
  STUDIO_IMAGE_FOLDER,
  STARTER_IMAGE_FOLDERS,
  ACTIVE_STUDIO_IMAGE_FOLDER,
  studioImageFolderFor,
  ownerImageFolder,
  pageImageFolder,
  imagesIn,
  imageScope,
  SAFE_SEGMENT,
};
