const express = require('express');
const router = express.Router();
const { handleCreateQR, handleRedirect, handleAnalytics, handleDashboard, handleSubscribe, handleSendSpecial } = require('../controllers/qrController');

router.post('/qr', handleCreateQR);
router.get('/r/:id', handleRedirect);
router.get('/analytics', handleAnalytics);
router.get('/dashboard', handleDashboard);
router.post('/subscribe', handleSubscribe);
router.post('/send-special', handleSendSpecial);

module.exports = router;