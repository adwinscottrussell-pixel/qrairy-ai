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
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const { requireStadtpocketWriteScope } = require('../middleware/stadtpocketManagerAuth');
const service = require('../services/stadtpocketManagerService');
const { uploadStadtPocketHeaderImage } = require('../services/stadtPocketHeaderImageService');
const loyaltyBridgeService = require('../services/stadtpocketLoyaltyBridgeService');
const {
  discoverWebsiteImageCandidates,
  copyWebsiteImageToCloudinary,
  StadtpocketImageError,
} = require('../services/stadtpocketImageDiscoveryService');

// Phase 1H.4.3 -- image discovery/copy both make a real, bounded
// external fetch (Firecrawl for discovery, a direct image download for
// the copy step), same cost class as the existing research rate
// limiter, so both share its exact convention: keyed by the resolved
// manager userId (requireStadtpocketWriteScope runs first), never per-IP
// alone.
const imageRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.stadtpocketScope && req.stadtpocketScope.userId) || ipKeyGenerator(req.ip),
});

function handleServiceError(err, res, route) {
  if (err instanceof service.StadtpocketManagerError || err instanceof StadtpocketImageError) {
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

async function handleArchive(req, res) {
  try {
    const result = await service.archiveForLocation(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json({ archived: result });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/archive POST');
  }
}

async function handleDeleteDraft(req, res) {
  try {
    const result = await service.deleteDraftListingLocation(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json({ deleted: result });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId DELETE');
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

// Phase 1H.4.3 — website image candidate discovery. Read-only: never
// writes to the database, never uploads anything to Cloudinary. Scoped
// by :locationId only (city-level authorization) -- deliberately NOT
// :listingLocationId, since this is called from the AI research review
// screen BEFORE any draft/listing exists yet. websiteUrl is re-validated
// inside discoverWebsiteImageCandidates -- never trusted merely because
// it was present in an earlier research result.
async function handleDiscoverImageCandidates(req, res) {
  try {
    service.authorizeLocationAccess(req.params.locationId, req.stadtpocketScope);
    const websiteUrl = req.body && req.body.websiteUrl;
    if (typeof websiteUrl !== 'string' || !websiteUrl.trim()) {
      return res.status(400).json({ error: 'websiteUrl is required.' });
    }
    const result = await discoverWebsiteImageCandidates(websiteUrl.trim());
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/image-candidates POST');
  }
}

// Phase 1H.4.3 — turns one Admin-SELECTED website image candidate into
// a real, StadtPocket-owned Cloudinary asset, scoped to a specific
// listing exactly like the manual file-upload route above (same
// getEditableState re-authorization, same never-writes-the-draft-
// itself posture -- the frontend commits it via the EXISTING
// PUT .../draft with { headerImage } afterward, identical to the
// manual-upload flow).
async function handleCopyWebsiteImage(req, res) {
  try {
    const url = req.body && req.body.url;
    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'url is required.' });
    }
    const state = await service.getEditableState(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    const headerImage = await copyWebsiteImageToCloudinary(url.trim(), state.listingId);
    return res.json({ headerImage });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/header-image-from-url POST');
  }
}

// Stempelkarte Phase 2 — loyalty bridge (connect/disconnect an existing
// QRAIVY loyalty program). See stadtpocketLoyaltyBridgeService.js for
// the eligibility/authorization rules; this file is routing only, same
// posture as every other handler above.
async function handleGetLoyaltyState(req, res) {
  try {
    const state = await loyaltyBridgeService.getBridgeState(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json(state);
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty GET');
  }
}

async function handleListEligiblePrograms(req, res) {
  try {
    const programs = await loyaltyBridgeService.listEligiblePrograms(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope, req.query);
    return res.json({ programs });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty/eligible GET');
  }
}

async function handleConnectLoyalty(req, res) {
  try {
    const program = await loyaltyBridgeService.connectProgram(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope, req.body && req.body.landingPageId);
    return res.json({ connected: true, program });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty PUT');
  }
}

// Stempelkarte Phase 3B — platform-managed setup. Body is only
// { goal, rewardName } -- no id of any kind is accepted from the
// caller (see stadtpocketLoyaltyBridgeService.js's own comment on
// createAndConnectProgram); the target LandingPage/StampSettings/bridge
// are all derived server-side from (locationId, listingLocationId,
// scope) exactly like every other route in this file.
async function handleSetupLoyalty(req, res) {
  try {
    const body = req.body || {};
    const program = await loyaltyBridgeService.createAndConnectProgram(
      req.params.locationId,
      req.params.listingLocationId,
      req.stadtpocketScope,
      { goal: body.goal, rewardName: body.rewardName }
    );
    return res.json({ connected: true, program });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty/setup POST');
  }
}

async function handleDisconnectLoyalty(req, res) {
  try {
    const state = await loyaltyBridgeService.disconnectProgram(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json(state);
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty DELETE');
  }
}

// Stempelkarte Phase 3B pre-work (2026-09-17) — TEMPORARY, read-only,
// Global-Admin-only diagnostic. See stadtpocketLoyaltyBridgeService.js's
// checkExistingQraivyLinkage for the exact scope/eligibility reasoning;
// this handler is routing only.
async function handleCheckExistingLinkage(req, res) {
  try {
    const result = await loyaltyBridgeService.checkExistingQraivyLinkage(req.params.locationId, req.params.listingLocationId, req.stadtpocketScope);
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty/linkage-check GET');
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
router.post('/listings/:locationId/:listingLocationId/archive', requireStadtpocketWriteScope, handleArchive);
// Draft-only delete -- deleteDraftListingLocation itself refuses any
// non-'draft' publicationStatus (see that function's own comment), so
// a published/paused/archived listing can never reach this path
// regardless of what the frontend does or doesn't show.
router.delete('/listings/:locationId/:listingLocationId', requireStadtpocketWriteScope, handleDeleteDraft);
// requireStadtpocketWriteScope runs BEFORE multer parses the upload --
// an unauthenticated/unauthorized request never gets its file buffered
// at all, same ordering as /lp/upload-logo in lpRoutes.js.
router.post('/listings/:locationId/:listingLocationId/header-image', requireStadtpocketWriteScope, (req, res, next) => {
  headerImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, handleUploadHeaderImage);

// Phase 1H.4.3 — hero image candidate discovery/copy.
router.post('/listings/:locationId/image-candidates', requireStadtpocketWriteScope, imageRateLimiter, handleDiscoverImageCandidates);
router.post('/listings/:locationId/:listingLocationId/header-image-from-url', requireStadtpocketWriteScope, imageRateLimiter, handleCopyWebsiteImage);

// Stempelkarte Phase 2 — loyalty bridge.
router.get('/listings/:locationId/:listingLocationId/loyalty', requireStadtpocketWriteScope, handleGetLoyaltyState);
router.get('/listings/:locationId/:listingLocationId/loyalty/eligible', requireStadtpocketWriteScope, handleListEligiblePrograms);
router.put('/listings/:locationId/:listingLocationId/loyalty', requireStadtpocketWriteScope, handleConnectLoyalty);
router.post('/listings/:locationId/:listingLocationId/loyalty/setup', requireStadtpocketWriteScope, handleSetupLoyalty);
router.delete('/listings/:locationId/:listingLocationId/loyalty', requireStadtpocketWriteScope, handleDisconnectLoyalty);
router.get('/listings/:locationId/:listingLocationId/loyalty/linkage-check', requireStadtpocketWriteScope, handleCheckExistingLinkage);

module.exports = router;
module.exports.handleListListings = handleListListings; // exported for direct unit testing only
module.exports.handleInitializeDraft = handleInitializeDraft; // exported for direct unit testing only
module.exports.handleGetEditableState = handleGetEditableState; // exported for direct unit testing only
module.exports.handleSaveDraft = handleSaveDraft; // exported for direct unit testing only
module.exports.handlePreviewDraft = handlePreviewDraft; // exported for direct unit testing only
module.exports.handlePublish = handlePublish; // exported for direct unit testing only
module.exports.handlePause = handlePause; // exported for direct unit testing only
module.exports.handleArchive = handleArchive; // exported for direct unit testing only
module.exports.handleDeleteDraft = handleDeleteDraft; // exported for direct unit testing only
module.exports.handleUploadHeaderImage = handleUploadHeaderImage; // exported for direct unit testing only
module.exports.handleDiscoverImageCandidates = handleDiscoverImageCandidates; // exported for direct unit testing only
module.exports.handleCopyWebsiteImage = handleCopyWebsiteImage; // exported for direct unit testing only
module.exports.imageRateLimiter = imageRateLimiter; // exported for direct unit testing only
module.exports.headerImageFileFilter = headerImageFileFilter; // exported for direct unit testing only
module.exports.HEADER_IMAGE_ALLOWED_MIMETYPES = HEADER_IMAGE_ALLOWED_MIMETYPES; // exported for direct unit testing only
module.exports.HEADER_IMAGE_MAX_BYTES = HEADER_IMAGE_MAX_BYTES; // exported for direct unit testing only
module.exports.handleGetLoyaltyState = handleGetLoyaltyState; // exported for direct unit testing only
module.exports.handleListEligiblePrograms = handleListEligiblePrograms; // exported for direct unit testing only
module.exports.handleConnectLoyalty = handleConnectLoyalty; // exported for direct unit testing only
module.exports.handleSetupLoyalty = handleSetupLoyalty; // exported for direct unit testing only
module.exports.handleCheckExistingLinkage = handleCheckExistingLinkage; // exported for direct unit testing only
module.exports.handleDisconnectLoyalty = handleDisconnectLoyalty; // exported for direct unit testing only
