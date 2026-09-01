// ============================================================
// stadtpocketPublicRoutes.js — Independent StadtPocket Listing
// Foundation, Phase 1.
//
// Public, unauthenticated, read-only routes only -- no requireAuth,
// requireAdmin, or requireManagerScope anywhere in this file. Mounted at
// /public/stadtpocket in index.js. Covered by the existing global
// express-rate-limit middleware (app.use in index.js) like every other
// route in this app; no additional per-route limiter added here.
//
// All response-shaping logic (visibility rule, field selection) lives in
// stadtpocketPublicService.js -- this file is routing only. Visibility is
// gated purely on StadtPocketListingLocation.publicationStatus; ownership/
// claim state (Business/BusinessLocation) is never consulted here.
// ============================================================

const express = require('express');
const router = express.Router();
const stadtpocketPublicService = require('../services/stadtpocketPublicService');

async function handleListCityBusinesses(req, res) {
  try {
    const { citySlug } = req.params;
    const result = await stadtpocketPublicService.listCityBusinesses(citySlug);
    if (!result) {
      return res.status(404).json({ error: 'City not found.' });
    }
    return res.json(result);
  } catch (err) {
    console.error('[public/stadtpocket/cities/:citySlug/businesses]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleGetCityBusiness(req, res) {
  try {
    const { citySlug, listingSlug } = req.params;
    const business = await stadtpocketPublicService.getCityBusiness(citySlug, listingSlug);
    if (!business) {
      return res.status(404).json({ error: 'Business not found.' });
    }
    return res.json(business);
  } catch (err) {
    console.error('[public/stadtpocket/cities/:citySlug/businesses/:listingSlug]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

router.get('/cities/:citySlug/businesses', handleListCityBusinesses);
router.get('/cities/:citySlug/businesses/:listingSlug', handleGetCityBusiness);

module.exports = router;
module.exports.handleListCityBusinesses = handleListCityBusinesses; // exported for direct unit testing only
module.exports.handleGetCityBusiness = handleGetCityBusiness; // exported for direct unit testing only
