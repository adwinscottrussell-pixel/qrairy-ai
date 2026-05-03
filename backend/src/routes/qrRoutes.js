const express = require('express');
const router = express.Router();

const qrController = require('../controllers/qrController');

// Debug (temporary)
console.log('QR Controller:', qrController);

router.post('/create-qr', qrController.createQR);
router.get('/r/:id', qrController.handleRedirect);

module.exports = router;