/**
 * managerStadtpocketOfferRoutes.js — StadtPocket Angebote write API.
 * Phase B.
 * ─────────────────────────────────────────────────────────────
 * Mounted at /manager/stadtpocket (same prefix as
 * managerStadtpocketListingRoutes.js), nested under a business:
 * /manager/stadtpocket/listings/:locationId/:listingLocationId/offers/...
 * -- an Offer never exists independent of the business/storefront that
 * runs it, matching stadtpocketOfferService.js's own three-level
 * addressing (city -> business -> offer).
 *
 * Uses requireStadtpocketWriteScope, the exact same middleware
 * managerStadtpocketListingRoutes.js uses -- one authorization outcome
 * shape shared by both, not a second system.
 *
 * No GET .../preview route: unlike the listing editor (which compares
 * an in-progress draft against what's already live on the PUBLIC api),
 * an Offer has no public read path yet in this phase -- there is
 * nothing to compare against. The detail GET below already returns the
 * draft-merged-over-live state (identical posture to
 * stadtpocketManagerService.previewDraft being an alias for
 * getEditableState), which is what the admin's own preview step
 * renders from client-side, no extra network round trip needed.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireStadtpocketWriteScope } = require('../middleware/stadtpocketManagerAuth');
const service = require('../services/stadtpocketOfferService');
const { uploadStadtPocketHeaderImage } = require('../services/stadtPocketHeaderImageService');

function handleServiceError(err, res, route) {
  if (err instanceof service.StadtpocketOfferError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[${route}]`, err);
  return res.status(500).json({ error: 'Internal server error.' });
}

// Same convention as managerStadtpocketListingRoutes.js's header-image
// upload: memory storage, 5MB cap, PNG/JPEG/JPG/WebP only. The uploaded
// buffer is expected to already be cropped/rendered client-side to the
// 1200x900 (4:3) StadtPocket Deal Image standard -- this route does not
// itself validate pixel dimensions (Cloudinary's own response is the
// authoritative record of what was actually uploaded, same as the
// header-image path).
const OFFER_IMAGE_ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const OFFER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function offerImageFileFilter(req, file, cb) {
  if (OFFER_IMAGE_ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PNG, JPG, JPEG, and WebP images are allowed.'));
}

const offerImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OFFER_IMAGE_MAX_BYTES },
  fileFilter: offerImageFileFilter,
});

async function handleListOffers(req, res) {
  try {
    const offers = await service.listOffersForListingLocation(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json({ offers });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../offers GET');
  }
}

async function handleCreateOffer(req, res) {
  try {
    const offer = await service.createOfferDraft(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope, req.body);
    return res.status(201).json({ offer });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../offers POST');
  }
}

async function handleGetOffer(req, res) {
  try {
    const offer = await service.getOfferState(req.params.locationId, req.params.listingLocationId, req.params.offerId, req.stadtpocketScope);
    return res.json({ offer });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../offers/:offerId GET');
  }
}

async function handleSaveOfferDraft(req, res) {
  try {
    const offer = await service.saveOfferDraft(req.params.locationId, req.params.listingLocationId, req.params.offerId, req.stadtpocketScope, req.body);
    return res.json({ offer });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../offers/:offerId/draft PUT');
  }
}

async function handlePublishOffer(req, res) {
  try {
    const offer = await service.publishOffer(req.params.locationId, req.params.listingLocationId, req.params.offerId, req.stadtpocketScope);
    return res.json({ offer });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../offers/:offerId/publish POST');
  }
}

async function handleArchiveOffer(req, res) {
  try {
    const offer = await service.archiveOffer(req.params.locationId, req.params.listingLocationId, req.params.offerId, req.stadtpocketScope);
    return res.json({ offer });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../offers/:offerId/archive POST');
  }
}

// Phase B.2.3 -- hard delete. Same requireStadtpocketWriteScope +
// three-level ownership re-check every other mutation on this router
// already uses (via service.deleteOffer -> findOfferOrThrow); no
// separate authorization path introduced for this one action.
async function handleDeleteOffer(req, res) {
  try {
    const result = await service.deleteOffer(req.params.locationId, req.params.listingLocationId, req.params.offerId, req.stadtpocketScope);
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../offers/:offerId DELETE');
  }
}

// Upload-only, mirrors managerStadtpocketListingRoutes.js's
// handleUploadHeaderImage exactly: never writes to the database itself,
// only proves authorization (via getOfferState, which re-checks the
// full (locationId, listingLocationId, offerId) chain), uploads to
// Cloudinary, and returns the resulting metadata. The frontend commits
// it via the existing PUT .../draft with { image: {...} } right after
// -- same single write path every other field already uses, no second
// persistence mechanism.
async function handleUploadOfferImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file received.' });
    }
    const offer = await service.getOfferState(req.params.locationId, req.params.listingLocationId, req.params.offerId, req.stadtpocketScope);
    const result = await uploadStadtPocketHeaderImage(req.file.buffer, offer.offerId);
    return res.json({
      image: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      },
    });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/.../offers/:offerId/image POST');
  }
}

router.get('/listings/:locationId/:listingLocationId/offers', requireStadtpocketWriteScope, handleListOffers);
router.post('/listings/:locationId/:listingLocationId/offers', requireStadtpocketWriteScope, handleCreateOffer);
router.get('/listings/:locationId/:listingLocationId/offers/:offerId', requireStadtpocketWriteScope, handleGetOffer);
router.put('/listings/:locationId/:listingLocationId/offers/:offerId/draft', requireStadtpocketWriteScope, handleSaveOfferDraft);
router.post('/listings/:locationId/:listingLocationId/offers/:offerId/publish', requireStadtpocketWriteScope, handlePublishOffer);
router.post('/listings/:locationId/:listingLocationId/offers/:offerId/archive', requireStadtpocketWriteScope, handleArchiveOffer);
router.delete('/listings/:locationId/:listingLocationId/offers/:offerId', requireStadtpocketWriteScope, handleDeleteOffer);
// requireStadtpocketWriteScope runs BEFORE multer parses the upload --
// same ordering as the listing header-image route, for the same reason
// (an unauthorized request never gets its file buffered at all).
router.post('/listings/:locationId/:listingLocationId/offers/:offerId/image', requireStadtpocketWriteScope, (req, res, next) => {
  offerImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, handleUploadOfferImage);

module.exports = router;
module.exports.handleListOffers = handleListOffers; // exported for direct unit testing only
module.exports.handleCreateOffer = handleCreateOffer; // exported for direct unit testing only
module.exports.handleGetOffer = handleGetOffer; // exported for direct unit testing only
module.exports.handleSaveOfferDraft = handleSaveOfferDraft; // exported for direct unit testing only
module.exports.handlePublishOffer = handlePublishOffer; // exported for direct unit testing only
module.exports.handleArchiveOffer = handleArchiveOffer; // exported for direct unit testing only
module.exports.handleDeleteOffer = handleDeleteOffer; // exported for direct unit testing only
module.exports.handleUploadOfferImage = handleUploadOfferImage; // exported for direct unit testing only
module.exports.offerImageFileFilter = offerImageFileFilter; // exported for direct unit testing only
module.exports.OFFER_IMAGE_ALLOWED_MIMETYPES = OFFER_IMAGE_ALLOWED_MIMETYPES; // exported for direct unit testing only
module.exports.OFFER_IMAGE_MAX_BYTES = OFFER_IMAGE_MAX_BYTES; // exported for direct unit testing only
