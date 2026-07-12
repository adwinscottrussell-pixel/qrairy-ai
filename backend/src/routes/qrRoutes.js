const {trackScan}=require('../utils/scanTracker');
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
  handleDeleteQR,
} = require('../controllers/qrController');

// QR codes
router.post('/qr', handleCreateQR);
router.put('/qr/:id/destination', handleUpdateDestination);
router.delete('/qr/:id', handleDeleteQR);  // NEW: dynamic QR destination update

// Redirect
router.get('/r/:id',async(req,res,next)=>{if(req.params.id)setImmediate(()=>trackScan(req.params.id,req));return handleRedirect(req,res,next);});

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

module.exports = router;
