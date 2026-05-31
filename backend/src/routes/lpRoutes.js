const express = require('express');
const router  = express.Router();
const { handlePublishLP, handleDeleteLP, handleServeLP, handleGetLP, handleListLPs,
  handleGenerateAppleWalletPass, handleChatLP} = require('../controllers/lpController');

// Apple Wallet pass download (must be before /lp/:slug)
router.get('/lp/wallet/apple/:slug', handleGenerateAppleWalletPass);

// Serve live landing page (public — no auth)
router.get('/lp/:slug', handleServeLP);

// AI chat endpoint
router.post('/lp/chat', handleChatLP);

// API: publish a new landing page
router.post('/lp', handlePublishLP);
router.delete('/lp/:slug', handleDeleteLP);

// API: get single landing page data (for dashboard)
router.get('/api/lp/:slug', handleGetLP);

// API: list user's landing pages
router.get('/api/lp', handleListLPs);

module.exports = router;

