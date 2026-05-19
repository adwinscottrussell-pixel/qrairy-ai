const express = require('express');
const router  = express.Router();
const { handlePublishLP, handleDeleteLP, handleServeLP, handleGetLP, handleListLPs } = require('../controllers/lpController');

// Serve live landing page (public — no auth)
router.get('/lp/:slug', handleServeLP);

// API: publish a new landing page
router.post('/lp', handlePublishLP);
router.delete('/lp/:slug', handleDeleteLP);

// API: get single landing page data (for dashboard)
router.get('/api/lp/:slug', handleGetLP);

// API: list user's landing pages
router.get('/api/lp', handleListLPs);

module.exports = router;

