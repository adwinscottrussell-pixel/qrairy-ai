/**
 * managerStadtpocketListingRoutes.js — StadtPocket Listing write API.
 * Phase 6C.
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
 * uses — never a StadtPocketListingLocation id, and never trusted
 * without the service layer's own re-check against scope.
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

async function handleGetEditableState(req, res) {
  try {
    const state = await service.getEditableState(req.params.locationId, req.stadtpocketScope);
    return res.json({ listing: state });
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

async function handleSaveDraft(req, res) {
  try {
    const state = await service.saveDraft(req.params.locationId, req.stadtpocketScope, req.body);
    return res.json({ listing: state });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/draft PUT');
  }
}

async function handlePreviewDraft(req, res) {
  try {
    const state = await service.previewDraft(req.params.locationId, req.stadtpocketScope);
    return res.json({ preview: state });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/preview GET');
  }
}

async function handlePublish(req, res) {
  try {
    const result = await service.publishForLocation(req.params.locationId, req.stadtpocketScope);
    return res.json({ published: result });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/publish POST');
  }
}

async function handlePause(req, res) {
  try {
    const result = await service.pauseForLocation(req.params.locationId, req.stadtpocketScope);
    return res.json({ paused: result });
  } catch (err) {
    return handleServiceError(err, res, 'manager/stadtpocket/listings/:locationId/pause POST');
  }
}

router.get('/listings/:locationId', requireStadtpocketWriteScope, handleGetEditableState);
router.post('/listings/:locationId', requireStadtpocketWriteScope, handleInitializeDraft);
router.put('/listings/:locationId/draft', requireStadtpocketWriteScope, handleSaveDraft);
router.get('/listings/:locationId/preview', requireStadtpocketWriteScope, handlePreviewDraft);
router.post('/listings/:locationId/publish', requireStadtpocketWriteScope, handlePublish);
router.post('/listings/:locationId/pause', requireStadtpocketWriteScope, handlePause);

module.exports = router;
module.exports.handleGetEditableState = handleGetEditableState; // exported for direct unit testing only
module.exports.handleInitializeDraft = handleInitializeDraft; // exported for direct unit testing only
module.exports.handleSaveDraft = handleSaveDraft; // exported for direct unit testing only
module.exports.handlePreviewDraft = handlePreviewDraft; // exported for direct unit testing only
module.exports.handlePublish = handlePublish; // exported for direct unit testing only
module.exports.handlePause = handlePause; // exported for direct unit testing only
