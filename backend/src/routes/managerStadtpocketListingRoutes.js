/**
 * managerStadtpocketListingRoutes.js — StadtPocket Listing write API.
 * Phase 6C, extended Phase 6D for city -> many-businesses.
 * ─────────────────────────────────────────────────────────────
 * Mounted at /manager/stadtpocket, entirely separate from
 * /public/stadtpocket (unauthenticated, read-only, see
 * stadtpocketPublicRoutes.js) and from /manager (existing City Manager
 * Business-membership API, see managerRoutes.js). Every route here uses
 * requireStadtpocketWriteScope, never requireAdmin/requireManagerScope
 * directly, so Global Admin and City Manager share one authorization
 * outcome shape (req.stadtpocketScope) instead of two divergent ones.
 *
 * :locationId in every route below is the caller's QRAIVY Location id
 * (a city), matching the shape req.stadtpocketScope.locationIds already
 * uses -- it is the authorization boundary, never a business identity by
 * itself. A city can hold zero, one, or many StadtPocket businesses, so
 * a specific business is addressed by :locationId/:listingLocationId
 * together -- :listingLocationId is never trusted to belong to the
 * claimed city without the service layer's own re-check against it.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireStadtpocketWriteScope } = require('../middleware/stadtpocketManagerAuth');
const service = require('../services/stadtpocketManagerService');
const { uploadStadtPocketHeaderImage } = require('../services/stadtPocketHeaderImageService');

function handleServiceError(err, res, route) {
  if (err instanceof service.StadtpocketManagerError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[${route}]`, err);
  return res.status(500).json({ error: 'Internal server error.' });
}

// Same convention as the existing /lp/upload-logo and /lp/upload-strip
// uploads (lpRoutes.js): memory storage (buffer straight to Cloudinary,
// no temp file on disk), 5MB cap, PNG/JPEG/JPG/WebP only -- no SVG (SVG
// can carry embedded scripts/XSS, this codebase's existing image
// uploads never allow it, not introducing an exception here). Validated
// server-side by this fileFilter/limits config regardless of whatever
// the frontend already checked. Constants and the filter function are
// named + exported (unlike lpRoutes.js's inline equivalents) so the
// actual rejection rule can be unit-tested directly.
const HEADER_IMAGE_ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const HEADER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function headerImageFileFilter(req, file, cb) {
  if (HEADER_IMAGE_ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PNG, JPG, JPEG, and WebP images are allowed.'));
}

const headerImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HEADER_IMAGE_MAX_BYTES },
  fileFilter: headerImageFileFilter,
});

async function handleListListings(req, res) {
  try {
    const listings = await service.listListingsForLocation(req.params.locationId, req.stadtpocketScope);
    return res.json({ listings });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId GET');
  }
}

async function handleInitializeDraft(req, res) {
  try {
    const state = await service.initializeDraft(req.params.locationId, req.stadtpocketScope, req.body);
    return res.status(201).json({ listing: state });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId POST');
  }
}

async function handleGetEditableState(req, res) {
  try {
    const state = await service.getEditableState(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json({ listing: state });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId GET');
  }
}

async function handleSaveDraft(req, res) {
  try {
    const state = await service.saveDraft(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope, req.body);
    return res.json({ listing: state });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/draft PUT');
  }
}

async function handlePreviewDraft(req, res) {
  try {
    const state = await service.previewDraft(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json({ preview: state });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/preview GET');
  }
}

async function handlePublish(req, res) {
  try {
    const result = await service.publishForLocation(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json({ published: result });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/publish POST');
  }
}

async function handlePause(req, res) {
  try {
    const result = await service.pauseForLocation(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json({ paused: result });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/pause POST');
  }
}

// Phase 6D.2 — header/hero image upload. Upload-only: this route never
// writes to the database at all (mirrors /lp/upload-logo's exact
// posture) -- it only proves authorization, uploads to Cloudinary, and
// returns the resulting metadata. The frontend then calls the EXISTING
// PUT .../draft (handleSaveDraft above) with { headerImage: {...} } to
// actually commit it to the draft -- no separate/parallel persistence
// path, no separate "publish image" mechanism; headerImage travels
// through the exact same Draft -> Preview -> Publish machinery as every
// other field.
//
// Authorization is re-derived server-side via getEditableState() --
// the SAME function handleGetEditableState above uses, which internally
// re-checks (locationId, listingLocationId) against req.stadtpocketScope
// before returning anything. A caller-supplied locationId/
// listingLocationId pair is never trusted just because it parses --
// this call throws 403/404 exactly like every other route here if it
// doesn't hold up.
async function handleUploadHeaderImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file received.' });
    }
    const state = await service.getEditableState(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    const result = await uploadStadtPocketHeaderImage(req.file.buffer, state.listingId);
    return res.json({
      headerImage: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      },
    });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/header-image POST');
  }
}

// City-scoped list + create.
router.get('/listings/:locationId', requireStadtpocketWriteScope, handleListListings);
router.post('/listings/:locationId', requireStadtpocketWriteScope, handleInitializeDraft);

// Per-business operations, addressed by (locationId, listingLocationId).
router.get('/listings/:locationId/:listingLocationId', requireStadtpocketWriteScope, handleGetEditableState);
router.put('/listings/:locationId/:listingLocationId/draft', requireStadtpocketWriteScope, handleSaveDraft);
router.get('/listings/:locationId/:listingLocationId/preview', requireStadtpocketWriteScope, handlePreviewDraft);
router.post('/listings/:locationId/:listingLocationId/publish', requireStadtpocketWriteScope, handlePublish);
router.post('/listings/:locationId/:listingLocationId/pause', requireStadtpocketWriteScope, handlePause);
// requireStadtpocketWriteScope runs BEFORE multer parses the upload --
// an unauthenticated/unauthorized request never gets its file buffered
// at all, same ordering as /lp/upload-logo in lpRoutes.js.
router.post('/listings/:locationId/:listingLocationId/header-image', requireStadtpocketWriteScope, (req, res, next) => {
  headerImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, handleUploadHeaderImage);

module.exports = router;
module.exports.handleListListings = handleListListings; // exported for direct unit testing only
module.exports.handleInitializeDraft = handleInitializeDraft; // exported for direct unit testing only
module.exports.handleGetEditableState = handleGetEditableState; // exported for direct unit testing only
module.exports.handleSaveDraft = handleSaveDraft; // exported for direct unit testing only
module.exports.handlePreviewDraft = handlePreviewDraft; // exported for direct unit testing only
module.exports.handlePublish = handlePublish; // exported for direct unit testing only
module.exports.handlePause = handlePause; // exported for direct unit testing only
module.exports.handleUploadHeaderImage = handleUploadHeaderImage; // exported for direct unit testing only
module.exports.headerImageFileFilter = headerImageFileFilter; // exported for direct unit testing only
module.exports.HEADER_IMAGE_ALLOWED_MIMETYPES = HEADER_IMAGE_ALLOWED_MIMETYPES; // exported for direct unit testing only
module.exports.HEADER_IMAGE_MAX_BYTES = HEADER_IMAGE_MAX_BYTES; // exported for direct unit testing only
