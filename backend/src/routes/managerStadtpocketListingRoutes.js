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
const router = express.Router();
const { requireStadtpocketWriteScope } = require('../middleware/stadtpocketManagerAuth');
const service = require('../services/stadtpocketManagerService');

function handleServiceError(err, res, route) {
  if (err instanceof service.StadtpocketManagerError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[${route}]`, err);
  return res.status(500).json({ error: 'Internal server error.' });
}

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

// City-scoped list + create.
router.get('/listings/:locationId', requireStadtpocketWriteScope, handleListListings);
router.post('/listings/:locationId', requireStadtpocketWriteScope, handleInitializeDraft);

// Per-business operations, addressed by (locationId, listingLocationId).
router.get('/listings/:locationId/:listingLocationId', requireStadtpocketWriteScope, handleGetEditableState);
router.put('/listings/:locationId/:listingLocationId/draft', requireStadtpocketWriteScope, handleSaveDraft);
router.get('/listings/:locationId/:listingLocationId/preview', requireStadtpocketWriteScope, handlePreviewDraft);
router.post('/listings/:locationId/:listingLocationId/publish', requireStadtpocketWriteScope, handlePublish);
router.post('/listings/:locationId/:listingLocationId/pause', requireStadtpocketWriteScope, handlePause);

module.exports = router;
module.exports.handleListListings = handleListListings; // exported for direct unit testing only
module.exports.handleInitializeDraft = handleInitializeDraft; // exported for direct unit testing only
module.exports.handleGetEditableState = handleGetEditableState; // exported for direct unit testing only
module.exports.handleSaveDraft = handleSaveDraft; // exported for direct unit testing only
module.exports.handlePreviewDraft = handlePreviewDraft; // exported for direct unit testing only
module.exports.handlePublish = handlePublish; // exported for direct unit testing only
module.exports.handlePause = handlePause; // exported for direct unit testing only
