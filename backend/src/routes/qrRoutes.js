const express = require('express');
const router = express.Router();
const {
  handleCreateQR,
  handleUpdateDestination,
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
  handleDeleteQR,
} = require('../controllers/qrController');

// QR codes
router.post('/qr', handleCreateQR);
router.put('/qr/:id/destination', handleUpdateDestination);
router.delete('/qr/:id', handleDeleteQR);  // NEW: dynamic QR destination update

// Redirect
router.get('/r/:id', handleRedirect);

// Visit page data
router.get('/visit/:id', handleVisit);

// Chat
router.post('/chat', handleChat);

// Dashboard & analytics
router.get('/dashboard', handleDashboard);
router.get('/analytics', handleAnalytics);

// User account
router.get('/user/plan', handleGetUserPlan);
router.post('/user/phone', handleUpdateUserPhone);

// Subscribers & notifications
router.post('/subscribe', handleSubscribe);
router.post('/send-special', handleSendSpecial);
router.post('/generate-special', handleGenerateSpecial);

module.exports = router;
