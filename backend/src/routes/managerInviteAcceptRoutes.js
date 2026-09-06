/**
 * managerInviteAcceptRoutes.js — Phase 6D.1.
 * ─────────────────────────────────────────────────────────────
 * Public accept surface for a ManagerInvite. Entirely separate from
 * adminRoutes.js's /admin/manager-invites (Global-Admin-only create/
 * list/revoke): the acceptor is an ordinary authenticated Clerk user
 * (possibly brand new), never assumed to already be a manager or admin,
 * so this uses requireAuth, never requireAdmin/requireManagerScope.
 * Mirrors businessClaimRoutes.js's exact shape and reasoning.
 *
 * The request body is never trusted for identity or scope:
 * - Identity comes ONLY from req.userId (requireAuth, verified Clerk
 *   JWT) plus a live Clerk lookup for the verified primary email.
 * - Network/location/role are never accepted here at all -- they come
 *   only from the ManagerInvite record the token resolves to, so a
 *   client can never widen or redirect its own assignment.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { fetchPrimaryEmailVerified } = require('../utils/clerkEmailSync');
const managerInviteService = require('../services/managerInviteService');

// Explicit allow-list on the accept POST body -- token only. Any of
// userId/networkId/locationId/role/email is rejected outright with 400,
// same pattern already used by businessClaimRoutes.js's CLAIM_ALLOWED_FIELDS.
const ACCEPT_ALLOWED_FIELDS = ['token'];

function rejectUnexpectedFields(body) {
  const extra = Object.keys(body || {}).filter((k) => !ACCEPT_ALLOWED_FIELDS.includes(k));
  return extra.length ? extra : null;
}

// GET /manager-invites/preview?token=... — read-only, shows the invitee
// what they're about to accept before they authenticate/submit.
// requireAuth-gated for defense in depth, matching
// businessClaimRoutes.js's handleGetClaimPreview exactly; token
// possession is the real authorization for the invite's own content.
async function handleGetInvitePreview(req, res) {
  try {
    const token = req.query.token;
    let preview;
    try {
      preview = await managerInviteService.getInvitePreviewByToken(token);
    } catch (err) {
      if (err instanceof managerInviteService.ManagerInviteError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }
    return res.json({ invite: preview });
  } catch (err) {
    console.error('[manager-invites/preview]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// POST /manager-invites/accept — the actual accept. See
// managerInviteService.js for the full email-match/race/duplicate logic;
// this handler's only job is deriving a trustworthy identity and
// forwarding the token.
async function handleAcceptInvite(req, res) {
  try {
    const body = req.body || {};
    const extraFields = rejectUnexpectedFields(body);
    if (extraFields) {
      return res.status(400).json({ error: `Unexpected field(s): ${extraFields.join(', ')}.` });
    }

    const { token } = body;
    if (!token) {
      return res.status(400).json({ error: 'An invite token is required.' });
    }

    // Live Clerk lookup, not any client-supplied email string -- the
    // real, current verified-email signal per clerkEmailSync.js's
    // fetchPrimaryEmailVerified, identical to businessClaimRoutes.js's
    // own use of it.
    const { email: claimantEmail, verified: claimantEmailVerified } = await fetchPrimaryEmailVerified(req.userId);

    let result;
    try {
      result = await managerInviteService.acceptInvite({
        rawToken: token,
        claimantUserId: req.userId,
        claimantEmail,
        claimantEmailVerified,
      });
    } catch (err) {
      if (err instanceof managerInviteService.ManagerInviteError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    return res.status(201).json({
      networkMember: { id: result.networkMember.id, networkId: result.networkMember.networkId, locationId: result.networkMember.locationId, role: result.networkMember.role },
    });
  } catch (err) {
    console.error('[manager-invites/accept]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

router.get('/preview', requireAuth, handleGetInvitePreview);
router.post('/accept', requireAuth, handleAcceptInvite);

module.exports = router;
module.exports.handleGetInvitePreview = handleGetInvitePreview; // exported for direct unit testing only
module.exports.handleAcceptInvite = handleAcceptInvite; // exported for direct unit testing only
