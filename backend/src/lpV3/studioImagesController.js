/**
 * lpV3/studioImagesController.js — Landing Page Studio V3 image upload
 * (Image Phase 1):
 *
 *   POST /studio/pages/:slug/images   multipart/form-data, one file "image"
 *     201 { image: { url, publicId, width, height, master: { url, width, height } } }
 *
 * The chain (studioPagesRoutes.js), every check BEFORE the file is read:
 *   requireAuth            401  { error: 'Unauthorized.' }        (middleware/auth.js)
 *   requireVerifiedEmail   403  { error: 'email_unverified' }     (draftPolicy.js)
 *   requireOwnStudioPage   400 invalid_slug · 404 not_found · 403 forbidden
 *                          (LandingPage.userId === req.userId; ownerless pages 404)
 *   throttleStudioUploads  429  { error: 'upload_limit', retryAfter }
 *   precheckUpload         415 unsupported_type (not multipart) · 413 file_too_large (Content-Length)
 *   parseImage (multer)    413 file_too_large · 415 unsupported_type · 400 invalid_upload
 *   uploadStudioPageImage  400 no_file · 415 unsupported_type (content is not JPEG/PNG/WebP)
 *                          503 storage_unavailable · 502 storage_failed
 *
 * Every answer is { error: <code>, message } (or the image) and private,
 * no-store; Cloudinary's own error text is logged, never returned.
 *
 * The upload only STORES the picture in the owner's folder
 * (<folder>/<userId>/<pageId>/…, data/studioImages.js) and returns its
 * address. It changes no draft: the editor puts the address into the design,
 * and the next Save Draft (PUT /studio/pages/:slug/design) validates it like
 * every other image, including the ownership rule (opts.images).
 */
'use strict';
const multer = require('multer');
const { ownPage } = require('./studioPagesController');
const {
  StudioImageError, uploadStudioImage, isStudioImageStorageConfigured, checkImageFile,
  STUDIO_IMAGE_MAX_BYTES, STUDIO_IMAGE_TYPES,
} = require('../services/studioImageUploadService');

// multipart overhead allowed on top of the file itself before the body is refused unread
const MULTIPART_ALLOWANCE = 64 * 1024;

function noStore(res) { if (typeof res.set === 'function') res.set('Cache-Control', 'private, no-store'); }
function fail(res, status, error, message) { noStore(res); return res.status(status).json({ error, message }); }
const MESSAGES = {
  unsupported_type: 'Only JPEG, PNG and WebP images are allowed.',
  file_too_large: 'The image is larger than 5 MB.',
  invalid_upload: 'Send exactly one image in the field "image".',
  no_file: 'No image file was sent.',
  storage_unavailable: 'Image storage is not available right now.',
  storage_failed: 'The image could not be stored. Please try again.',
};

// The page must exist and be the signed-in owner's (studioPagesController.ownPage).
async function requireOwnStudioPage(req, res, next) {
  noStore(res);
  try {
    const page = await ownPage(req, res, { id: true, userId: true });
    if (!page) return undefined;
    req.studioPage = page;
    return next();
  } catch (e) {
    console.error('[StudioImages] page lookup error:', e && e.message);
    return fail(res, 500, 'server_error', 'The page could not be checked. Please try again.');
  }
}

// Refuses what can be refused from the headers alone, before multer reads anything.
function precheckUpload(req, res, next) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.startsWith('multipart/form-data')) return fail(res, 415, 'unsupported_type', MESSAGES.unsupported_type);
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > STUDIO_IMAGE_MAX_BYTES + MULTIPART_ALLOWANCE) return fail(res, 413, 'file_too_large', MESSAGES.file_too_large);
  return next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  // exactly one file and no text fields (busboy's own "parts" limit refuses even a single part, so it is not used)
  limits: { fileSize: STUDIO_IMAGE_MAX_BYTES, files: 1, fields: 0 },
  fileFilter: (req, file, cb) => {
    const t = String(file.mimetype || '').toLowerCase();
    if (STUDIO_IMAGE_TYPES.includes(t === 'image/jpg' ? 'image/jpeg' : t)) cb(null, true);
    else cb(new StudioImageError('unsupported_type', 415));
  },
});
function parseImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof StudioImageError) return fail(res, err.status, err.code, MESSAGES[err.code]);
    if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'file_too_large', MESSAGES.file_too_large);
    return fail(res, 400, 'invalid_upload', MESSAGES.invalid_upload);
  });
}

async function uploadStudioPageImage(req, res) {
  noStore(res);
  try {
    checkImageFile(req.file);
  } catch (e) {
    if (e instanceof StudioImageError) return fail(res, e.status, e.code, MESSAGES[e.code]);
    return fail(res, 400, 'invalid_upload', MESSAGES.invalid_upload);
  }
  if (!isStudioImageStorageConfigured()) return fail(res, 503, 'storage_unavailable', MESSAGES.storage_unavailable);
  // From here the attempt reaches Cloudinary: it counts against the limit even if storing fails.
  if (req.studioUploadSlot) req.studioUploadSlot.commit();
  let image;
  try {
    image = await uploadStudioImage(req.file.buffer, { userId: req.userId, pageId: req.studioPage.id });
  } catch (e) {
    if (e instanceof StudioImageError) {
      if (e.code === 'storage_failed') console.error('[StudioImages] unexpected stored asset for page', req.studioPage.id);
      return fail(res, e.status, e.code, MESSAGES[e.code]);
    }
    console.error('[StudioImages] storage error:', e && e.message);
    return fail(res, 502, 'storage_failed', MESSAGES.storage_failed);
  }
  return res.status(201).json({ image: { url: image.url, publicId: image.publicId, width: image.width, height: image.height, master: image.master } });
}

module.exports = { requireOwnStudioPage, precheckUpload, parseImage, uploadStudioPageImage, MESSAGES, MULTIPART_ALLOWANCE };
