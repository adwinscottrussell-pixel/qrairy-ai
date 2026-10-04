const express = require('express');
const router = express.Router();
const plans = require('../config/plans');

// Public, read-only plan catalogue for the homepage pricing section.
// No authentication, no account or Stripe data — the same canonical
// catalogue Admin Billing receives in GET /stripe/status.
function handlePublicPlans(req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ plans: plans.getPublicPlanCatalogue() });
}

router.get('/', handlePublicPlans);

module.exports = router;
module.exports.handlePublicPlans = handlePublicPlans;
