const express = require('express');
const router  = express.Router();
const { handlePublishLP, handleDeleteLP, handleServeLP, handleGetLP, handleListLPs,
  handleGenerateAppleWalletPass, handleChatLP, handleSendPush, handlePushCount, handlePushHistory, handleWebPushSubscribe, handleWebPushVapidKey, handleSubscribe, handleGetSubscribers,
  handleStamp, handleGetStampToken, handleStampSettings, handleGetStampSettings, handleRedeemStamp } = require('../controllers/lpController');

// Apple Wallet pass download (must be before /lp/:slug)
router.get('/lp/wallet/apple/:slug', handleGenerateAppleWalletPass);
// Loyalty stamp (public — no auth — QR and NFC target)
router.get('/stamp/:slug/:token', handleStamp);
// Stamp dashboard API (auth required via frontend)
router.get('/lp/stamp/token/:slug', handleGetStampToken);
router.post('/lp/stamp/settings/:slug', handleStampSettings);
router.get('/lp/stamp/settings/:slug', handleGetStampSettings);
router.post('/lp/stamp/redeem/:slug', handleRedeemStamp);
// Serve live landing page (public — no auth)
router.get('/lp/:slug', handleServeLP);
// AI chat endpoint
router.post('/lp/chat', handleChatLP);
// Push notification endpoint
router.post('/lp/push/:slug', handleSendPush);
router.get('/lp/push/:slug/count', handlePushCount);
router.get('/lp/push/:slug/history', handlePushHistory);
router.post('/lp/webpush/subscribe/:slug', handleWebPushSubscribe);
router.get('/lp/webpush/vapid-key/:slug', handleWebPushVapidKey);
router.post('/lp/subscribe/:slug', handleSubscribe);
router.get('/lp/subscribers/:slug', handleGetSubscribers);
// API: publish a new landing page
router.post('/lp', handlePublishLP);
router.delete('/lp/:slug', handleDeleteLP);
// API: get single landing page data (for dashboard)
router.get('/api/lp/:slug', handleGetLP);
// API: list user's landing pages
router.get('/api/lp', handleListLPs);
module.exports = router;
