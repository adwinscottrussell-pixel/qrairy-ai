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
const router = express.Router();
const stadtpocketPassService = require('../services/stadtpocketPassService');

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

router.post('/pass', handleResolvePass);

module.exports = router;
module.exports.handleResolvePass = handleResolvePass; // exported for direct unit testing only
