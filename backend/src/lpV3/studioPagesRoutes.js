// lpV3/studioPagesRoutes.js — Landing Page Studio V3. Mounted at /studio.
// The signed-in owner's own pages (requireAuth: the Clerk session; ownership
// checked in studioPagesController.js): read (Phase A) and save the Studio
// draft (Phase B; never publishes, never touches the live page).
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listStudioPages, getStudioPageDesign, saveStudioPageDesign } = require('./studioPagesController');

const router = express.Router();
router.get('/pages', requireAuth, listStudioPages);
router.get('/pages/:slug/design', requireAuth, getStudioPageDesign);
router.put('/pages/:slug/design', requireAuth, saveStudioPageDesign);

module.exports = router;
