/**
 * businessClaimRoutes.js — Stadt Pocket Phase 3B Step 3B.
 * ─────────────────────────────────────────────────────────────
 * Public claim surface for a CityBusinessInvite. Entirely separate from
 * managerRoutes.js: the claimant is an ordinary authenticated QRAIVY user
 * (or a brand-new one, just signed up), never a City Manager, so this uses
 * requireAuth, never requireManagerScope.
 *
 * The request body/query is never trusted for identity or location:
 * - Identity comes ONLY from req.userId (requireAuth, verified Clerk JWT)
 *   plus a live Clerk lookup for the verified primary email.
 * - City/location is never accepted here at all -- it comes from the
 *   CityBusinessInvite record the token resolves to.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { fetchPrimaryEmailVerified } = require('../utils/clerkEmailSync');
const businessClaimService = require('../services/businessClaimService');

// Explicit allow-list on the claim POST body -- token only. Any of
// ownerUserId/primaryOwnerUserId/locationId/cityId/businessId/role/billing
// fields is rejected outright with 400, same pattern already used by
// managerRoutes.js's onboard endpoint, never silently ignored.
const CLAIM_ALLOWED_FIELDS = ['token'];

function rejectUnexpectedFields(body) {
  const extra = Object.keys(body || {}).filter((k) => !CLAIM_ALLOWED_FIELDS.includes(k));
  return extra.length ? extra : null;
}

// GET /businesses/claim/preview?token=... — read-only, shows the claimant
// what they're about to accept before they submit. requireAuth-gated (the
// claim page itself always authenticates first, per the claim-business.html
// flow) purely for defense in depth; token possession is the real
// authorization for the invite's own content.
async function handleGetClaimPreview(req, res) {
  try {
    const token = req.query.token;
    let preview;
    try {
      preview = await businessClaimService.getInvitePreviewByToken(token);
    } catch (err) {
      if (err instanceof businessClaimService.ClaimError) {
        return res.status(err.status).json({ error: err.message, ...(err.claimedBusinessId ? { claimedBusinessId: err.claimedBusinessId } : {}) });
      }
      throw err;
    }
    return res.json({ invite: preview });
  } catch (err) {
    console.error('[businesses/claim/preview]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// POST /businesses/claim — the actual claim. See businessClaimService.js
// for the full ownership/race/email-match logic; this handler's only job
// is deriving a trustworthy identity and forwarding the token.
async function handleClaimBusiness(req, res) {
  try {
    const body = req.body || {};
    const extraFields = rejectUnexpectedFields(body);
    if (extraFields) {
      return res.status(400).json({ error: `Unexpected field(s): ${extraFields.join(', ')}.` });
    }

    const { token } = body;
    if (!token) {
      return res.status(400).json({ error: 'A claim token is required.' });
    }

    // Live Clerk lookup, not the (possibly stale/never-synced) local
    // User.email column -- this is the real, current verified-email signal
    // per clerkEmailSync.js's fetchPrimaryEmailVerified.
    const { email: claimantEmail, verified: claimantEmailVerified } = await fetchPrimaryEmailVerified(req.userId);

    let result;
    try {
      result = await businessClaimService.claimInvite({
        rawToken: token,
        claimantUserId: req.userId,
        claimantEmail,
        claimantEmailVerified,
      });
    } catch (err) {
      if (err instanceof businessClaimService.ClaimError) {
        return res.status(err.status).json({ error: err.message, ...(err.claimedBusinessId ? { claimedBusinessId: err.claimedBusinessId } : {}) });
      }
      throw err;
    }

    return res.status(201).json({
      business: { id: result.business.id, name: result.business.name, status: result.business.status },
      membership: { id: result.membership.id, locationId: result.membership.locationId, status: result.membership.status },
    });
  } catch (err) {
    console.error('[businesses/claim]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// GET /businesses/:id/summary — Phase 3C.2. Minimal, owner-only read used
// solely by the post-claim dashboard activation card. :id is navigation
// context only (the dashboard's own ?claimed= query param supplies it) --
// never trusted as proof of ownership. getOwnedBusinessSummary
// independently re-verifies req.userId against Business.primaryOwnerUserId
// on every call and returns an identical 404 whether the id doesn't exist
// or simply isn't this caller's, so this can never disclose another
// owner's Business. Registered after /claim/preview and /claim so those
// literal paths are never shadowed by this param route.
async function handleGetBusinessSummary(req, res) {
  try {
    const summary = await businessClaimService.getOwnedBusinessSummary({
      businessId: req.params.id,
      ownerUserId: req.userId,
    });
    return res.json(summary);
  } catch (err) {
    if (err instanceof businessClaimService.ClaimError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[businesses/:id/summary]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

router.get('/claim/preview', requireAuth, handleGetClaimPreview);
router.post('/claim', requireAuth, handleClaimBusiness);
router.get('/:id/summary', requireAuth, handleGetBusinessSummary);

module.exports = router;
module.exports.handleGetClaimPreview = handleGetClaimPreview; // exported for direct unit testing only
module.exports.handleClaimBusiness = handleClaimBusiness; // exported for direct unit testing only
module.exports.handleGetBusinessSummary = handleGetBusinessSummary; // exported for direct unit testing only
