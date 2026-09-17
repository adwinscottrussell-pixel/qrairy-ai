/**
 * managerStadtpocketUpdateRoutes.js — StadtPocket Aktuelles write API.
 * Phase 4B.
 * ─────────────────────────────────────────────────────────────
 * Mounted at /manager/stadtpocket (same prefix as
 * managerStadtpocketListingRoutes.js / managerStadtpocketOfferRoutes.js),
 * nested under a business:
 * /manager/stadtpocket/listings/:locationId/:listingLocationId/updates/...
 * -- an Update never exists independent of the business/storefront that
 * posts it, matching stadtpocketUpdateService.js's own three-level
 * addressing (city -> business -> update).
 *
 * Uses requireStadtpocketWriteScope, the exact same middleware every
 * other StadtPocket manager route uses -- one authorization outcome
 * shape shared across all of them, not a second system.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireStadtpocketWriteScope } = require('../middleware/stadtpocketManagerAuth');
const service = require('../services/stadtpocketUpdateService');
const { uploadStadtPocketHeaderImage } = require('../services/stadtPocketHeaderImageService');

function handleServiceError(err, res, route) {
  if (err instanceof service.StadtpocketUpdateError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[${route}]`, err);
  return res.status(500).json({ error: 'Internal server error.' });
}

// Same convention as managerStadtpocketOfferRoutes.js's image upload:
// memory storage, 5MB cap, PNG/JPEG/JPG/WebP only.
const UPDATE_IMAGE_ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const UPDATE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function updateImageFileFilter(req, file, cb) {
  if (UPDATE_IMAGE_ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PNG, JPG, JPEG, and WebP images are allowed.'));
}

const updateImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPDATE_IMAGE_MAX_BYTES },
  fileFilter: updateImageFileFilter,
});

async function handleListUpdates(req, res) {
  try {
    const updates = await service.listUpdatesForListingLocation(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json({ updates });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../updates GET');
  }
}

async function handleCreateUpdate(req, res) {
  try {
    const update = await service.createUpdateDraft(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope, req.body);
    return res.status(201).json({ update });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../updates POST');
  }
}

async function handleGetUpdate(req, res) {
  try {
    const update = await service.getUpdateState(req.params.locationId, req.params.listingLocationId, req.params.updateId, req.stadtpocketScope);
    return res.json({ update });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../updates/:updateId GET');
  }
}

async function handleSaveUpdateDraft(req, res) {
  try {
    const update = await service.saveUpdateDraft(req.params.locationId, req.params.listingLocationId, req.params.updateId, req.stadtpocketScope, req.body);
    return res.json({ update });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../updates/:updateId/draft PUT');
  }
}

async function handlePublishUpdate(req, res) {
  try {
    const update = await service.publishUpdate(req.params.locationId, req.params.listingLocationId, req.params.updateId, req.stadtpocketScope);
    return res.json({ update });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../updates/:updateId/publish POST');
  }
}

async function handleArchiveUpdate(req, res) {
  try {
    const update = await service.archiveUpdate(req.params.locationId, req.params.listingLocationId, req.params.updateId, req.stadtpocketScope);
    return res.json({ update });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../updates/:updateId/archive POST');
  }
}

async function handleDeleteUpdate(req, res) {
  try {
    const result = await service.deleteUpdate(req.params.locationId, req.params.listingLocationId, req.params.updateId, req.stadtpocketScope);
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../updates/:updateId DELETE');
  }
}

// Upload-only, mirrors managerStadtpocketOfferRoutes.js's
// handleUploadOfferImage exactly: never writes to the database itself,
// only proves authorization (via getUpdateState, which re-checks the
// full (locationId, listingLocationId, updateId) chain), uploads to
// Cloudinary, and returns the resulting metadata. The frontend commits
// it via the existing PUT .../draft with { image: {...} } right after.
async function handleUploadUpdateImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file received.' });
    }
    const update = await service.getUpdateState(req.params.locationId, req.params.listingLocationId, req.params.updateId, req.stadtpocketScope);
    const result = await uploadStadtPocketHeaderImage(req.file.buffer, update.updateId);
    return res.json({
      image: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      },
    });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../updates/:updateId/image POST');
  }
}

router.get('/listings/:locationId/:listingLocationId/updates', requireStadtpocketWriteScope, handleListUpdates);
router.post('/listings/:locationId/:listingLocationId/updates', requireStadtpocketWriteScope, handleCreateUpdate);
router.get('/listings/:locationId/:listingLocationId/updates/:updateId', requireStadtpocketWriteScope, handleGetUpdate);
router.put('/listings/:locationId/:listingLocationId/updates/:updateId/draft', requireStadtpocketWriteScope, handleSaveUpdateDraft);
router.post('/listings/:locationId/:listingLocationId/updates/:updateId/publish', requireStadtpocketWriteScope, handlePublishUpdate);
router.post('/listings/:locationId/:listingLocationId/updates/:updateId/archive', requireStadtpocketWriteScope, handleArchiveUpdate);
router.delete('/listings/:locationId/:listingLocationId/updates/:updateId', requireStadtpocketWriteScope, handleDeleteUpdate);
router.post('/listings/:locationId/:listingLocationId/updates/:updateId/image', requireStadtpocketWriteScope, (req, res, next) => {
  updateImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, handleUploadUpdateImage);

module.exports = router;
module.exports.handleListUpdates = handleListUpdates; // exported for direct unit testing only
module.exports.handleCreateUpdate = handleCreateUpdate; // exported for direct unit testing only
module.exports.handleGetUpdate = handleGetUpdate; // exported for direct unit testing only
module.exports.handleSaveUpdateDraft = handleSaveUpdateDraft; // exported for direct unit testing only
module.exports.handlePublishUpdate = handlePublishUpdate; // exported for direct unit testing only
module.exports.handleArchiveUpdate = handleArchiveUpdate; // exported for direct unit testing only
module.exports.handleDeleteUpdate = handleDeleteUpdate; // exported for direct unit testing only
module.exports.handleUploadUpdateImage = handleUploadUpdateImage; // exported for direct unit testing only
module.exports.updateImageFileFilter = updateImageFileFilter; // exported for direct unit testing only
module.exports.UPDATE_IMAGE_ALLOWED_MIMETYPES = UPDATE_IMAGE_ALLOWED_MIMETYPES; // exported for direct unit testing only
module.exports.UPDATE_IMAGE_MAX_BYTES = UPDATE_IMAGE_MAX_BYTES; // exported for direct unit testing only
