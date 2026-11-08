// lpV3/studioPagesRoutes.js — Landing Page Studio V3. Mounted at /studio.
// The signed-in owner's own pages (requireAuth: the Clerk session; ownership
// checked in studioPagesController.js): read (Phase A) and save the Studio
// draft (Phase B; never publishes, never touches the live page), create a new
// unpublished draft (Phase D1), delete the owner's own unpublished draft
// (Delete draft). Creating, changing and deleting a draft also need a
// verified email address (draftPolicy.js).
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireVerifiedEmail } = require('./draftPolicy');
const { listStudioPages, getStudioPageDesign, saveStudioPageDesign } = require('./studioPagesController');
const { deleteStudioDraft } = require('./studioDraftDeleteController');
const { createStudioDraft } = require('./studioDraftsController');

const router = express.Router();
router.get('/pages', requireAuth, listStudioPages);
router.get('/pages/:slug/design', requireAuth, getStudioPageDesign);
router.put('/pages/:slug/design', requireAuth, requireVerifiedEmail, saveStudioPageDesign);
router.post('/drafts', requireAuth, requireVerifiedEmail, createStudioDraft);
// Delete draft: the owner's own unpublished Studio draft only (never a live or published page; studioDraftDeleteController.js)
router.delete('/pages/:slug', requireAuth, requireVerifiedEmail, deleteStudioDraft);

module.exports = router;
