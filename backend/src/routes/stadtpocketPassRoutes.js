// stadtpocketPassRoutes.js — StadtPocket Canonical Customer Identity +
// One In-App Pass Foundation, Step 1.
//
// Public, unauthenticated -- issuing/resuming a customer's own anonymous
// StadtPocket identity requires no login (approved architecture
// decision packet, "Pre-Login Identity": anonymous-first, no mandatory
// registration). Mounted at /public/stadtpocket in index.js, alongside
// stadtpocketPublicRoutes.js -- kept in a separate file because that
// file's own header explicitly documents itself as "Public,
// unauthenticated, read-only routes only", and this endpoint writes (it
// creates a Customer + CustomerIdentity + Pass on a customer's first
// visit).
//
// The response never includes Customer.id or any other raw internal
// database id -- only the opaque deviceToken (for the client to persist
// and resend to resume the same identity) and the Pass's own opaque
// serialNumber (the value that will go into the Pass QR once a Pass UI
// exists). See architecture decision packet, "One StadtPocket Pass" /
// "Pass / QR question".

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const stadtpocketPassService = require('../services/stadtpocketPassService');
const { getCustomerLoyaltyForBusiness, CustomerLoyaltyError } = require('../services/stadtpocketCustomerLoyaltyService');

// Customer loyalty read limiter -- keyed purely by IP, same convention as
// stadtpocketAssistantRoutes.js's assistantRateLimiter (no authenticated
// identity exists on a public route). Guessing a 192-bit deviceToken is
// already infeasible; this only bounds cheap abuse. 60 / 15 min / IP
// comfortably covers a customer opening several Stempelkarten.
const customerLoyaltyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});

async function handleResolvePass(req, res) {
  try {
    const deviceToken = req.body && typeof req.body.deviceToken === 'string' ? req.body.deviceToken : null;
    const result = await stadtpocketPassService.resolveOrCreatePass({ deviceToken });
    return res.json({
      deviceToken: result.deviceToken,
      pass: { serialNumber: result.serialNumber },
      isNewCustomer: result.isNewCustomer,
      isNewPass: result.isNewPass,
    });
  } catch (err) {
    console.error('[public/stadtpocket/pass]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// Customer loyalty progress -- READ ONLY (see
// stadtpocketCustomerLoyaltyService.js). POST, not GET, purely so the
// deviceToken credential travels in the body and never enters a URL or
// query string (and therefore never an access/proxy log line). Only
// body.deviceToken is read; the request body is never logged.
async function handleGetCustomerLoyalty(req, res) {
  try {
    const deviceToken = req.body && typeof req.body.deviceToken === 'string' ? req.body.deviceToken : null;
    const result = await getCustomerLoyaltyForBusiness(req.params.citySlug, req.params.listingSlug, deviceToken);
    return res.json(result);
  } catch (err) {
    if (err instanceof CustomerLoyaltyError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[public/stadtpocket/cities/:citySlug/businesses/:listingSlug/loyalty/me POST]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

router.post('/pass', handleResolvePass);
router.post('/cities/:citySlug/businesses/:listingSlug/loyalty/me', customerLoyaltyRateLimiter, handleGetCustomerLoyalty);

module.exports = router;
module.exports.handleResolvePass = handleResolvePass; // exported for direct unit testing only
module.exports.handleGetCustomerLoyalty = handleGetCustomerLoyalty; // exported for direct unit testing only
