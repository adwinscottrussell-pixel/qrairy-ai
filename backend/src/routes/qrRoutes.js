const express = require('express');
const router = express.Router();
const {
  handleCreateQR,
  handleGetUserPlan,
  handleUpdateUserPhone,
  handleRedirect,
  handleVisit,
  handleChat,
  handleAnalytics,
  handleDashboard,
  handleSubscribe,
  handleSendSpecial,
  handleGenerateSpecial,
} = require('../controllers/qrController');

router.post('/qr', handleCreateQR);
router.get('/user/plan', handleGetUserPlan);
router.post('/user/phone', handleUpdateUserPhone);
router.get('/r/:id', handleRedirect);
router.get('/visit/:id', handleVisit);
router.post('/chat', handleChat);
router.get('/analytics', handleAnalytics);
router.get('/dashboard', handleDashboard);
router.post('/subscribe', handleSubscribe);
router.post('/send-special', handleSendSpecial);
router.post('/generate-special', handleGenerateSpecial);

module.exports = router;