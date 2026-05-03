const express = require('express');
const router = express.Router();

const { createQR, handleRedirect } = require('../controllers/qrController');

// ==========================
// CREATE QR
// POST /api/qr
// ==========================
router.post('/', createQR);

// ==========================
// REDIRECT
// GET /api/qr/r/:id
// ==========================
router.get('/r/:id', handleRedirect);

module.exports = router;