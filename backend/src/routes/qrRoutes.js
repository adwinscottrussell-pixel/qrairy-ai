
const express = require('express');
const router = express.Router();
const { handleCreateQR, handleRedirect } = require('../controllers/qrController');

// ✅ FIXED ROUTES
router.post('/', handleCreateQR);     // was /qr ❌
router.get('/r/:id', handleRedirect);

module.exports = router;