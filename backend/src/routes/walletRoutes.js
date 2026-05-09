// ============================================================
// walletRoutes.js
// Apple Wallet Web Service — called by Apple directly
// https://developer.apple.com/documentation/walletpasses
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  handleGetPasses,
  handleRegisterDevice,
  handleUnregisterDevice,
  handleGetLatestPass,
  handleLog,
  handleManualPush,
  handlePassScan,
} = require('../controllers/walletController');

// ── Apple Wallet Web Service endpoints (called by Apple) ──────
router.get(  '/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier',           handleGetPasses);
router.post( '/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber', handleRegisterDevice);
router.delete('/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber', handleUnregisterDevice);
router.get(  '/v1/passes/:passTypeIdentifier/:serialNumber',                                      handleGetLatestPass);
router.post( '/v1/log',                                                                           handleLog);

// ── Internal endpoints (called by your dashboard) ────────────
router.post('/push/:passId',  requireAuth, handleManualPush);

// ── QR scan redirect for passes ──────────────────────────────
// /ps/:passId — QR code inside the pass points here
router.get('/ps/:passId',    handlePassScan);

module.exports = router;
