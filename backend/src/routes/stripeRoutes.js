const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  handleCreateCheckout,
  handleCustomerPortal,
  handleSubscriptionStatus,
  handleWebhook,
} = require('../controllers/stripeController');

// Webhook must use raw body — registered BEFORE express.json()
// This is handled in index.js with express.raw()
router.post('/webhook', handleWebhook);

// Authenticated routes
router.post('/checkout',  requireAuth, handleCreateCheckout);
router.post('/portal',    requireAuth, handleCustomerPortal);
router.get('/status',     requireAuth, handleSubscriptionStatus);

module.exports = router;
