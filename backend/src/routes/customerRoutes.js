// customerRoutes.js — Canonical Customer Foundation, Phase 4 (read-only).
// All endpoints owner-scoped via requireAuth (Clerk JWT), same convention
// as loyaltyAdminRoutes.js. Not yet called by any frontend page.

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getSummary,
  listCustomers,
  getCustomerDetail,
  getCustomerActivity,
} = require('../controllers/customerController');

router.get('/summary', requireAuth, getSummary);
router.get('/', requireAuth, listCustomers);
router.get('/:id', requireAuth, getCustomerDetail);
router.get('/:id/activity', requireAuth, getCustomerActivity);

// /:id/consents intentionally NOT implemented — CustomerConsent has no
// deterministic Customer/CustomerIdentity linkage in the current schema
// (slug + subscriberId only). See docs/architecture/CUSTOMER_FOUNDATION.md
// Phase 4, "Consents endpoint — deferred".

module.exports = router;
