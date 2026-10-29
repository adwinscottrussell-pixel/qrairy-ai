// lpV3/studioPagesRoutes.js — Landing Page Studio V3, Phase A. Mounted at
// /studio. The signed-in owner's own pages, read only (requireAuth: the
// Clerk session; ownership checked in studioPagesController.js).
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listStudioPages, getStudioPageDesign } = require('./studioPagesController');

const router = express.Router();
router.get('/pages', requireAuth, listStudioPages);
router.get('/pages/:slug/design', requireAuth, getStudioPageDesign);

module.exports = router;
