// lpV3/studioPagesRoutes.js — Landing Page Studio V3. Mounted at /studio.
// The signed-in owner's own pages (requireAuth: the Clerk session; ownership
// checked in studioPagesController.js): read (Phase A) and save the Studio
// draft (Phase B; never publishes, never touches the live page), create a new
// unpublished draft (Phase D1), delete the owner's own unpublished draft
// (Delete draft), upload an image for the owner's page (Image Phase 1; stored
// only, the draft is changed by the next save). Creating, changing and
// deleting a draft and uploading also need a verified email address
// (draftPolicy.js).
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireVerifiedEmail } = require('./draftPolicy');
const { listStudioPages, getStudioPageDesign, saveStudioPageDesign } = require('./studioPagesController');
const { deleteStudioDraft } = require('./studioDraftDeleteController');
const { createStudioDraft } = require('./studioDraftsController');
const { requireOwnStudioPage, precheckUpload, parseImage, uploadStudioPageImage } = require('./studioImagesController');
const { throttleStudioUploads } = require('../services/studioImageUploadLimiter');

const router = express.Router();
router.get('/pages', requireAuth, listStudioPages);
router.get('/pages/:slug/design', requireAuth, getStudioPageDesign);
router.put('/pages/:slug/design', requireAuth, requireVerifiedEmail, saveStudioPageDesign);
router.post('/drafts', requireAuth, requireVerifiedEmail, createStudioDraft);
// Delete draft: the owner's own unpublished Studio draft only (never a live or published page; studioDraftDeleteController.js)
router.delete('/pages/:slug', requireAuth, requireVerifiedEmail, deleteStudioDraft);
// Image Phase 1: signed in, verified email, own page and the upload limit are all checked
// BEFORE the body is read (studioImagesController.js); nothing in the draft changes here
router.post('/pages/:slug/images', requireAuth, requireVerifiedEmail, requireOwnStudioPage, throttleStudioUploads(), precheckUpload, parseImage, uploadStudioPageImage);

module.exports = router;
