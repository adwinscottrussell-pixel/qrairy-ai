const express = require('express');
const router = express.Router();
const { createQR, handleRedirect } = require('../controllers/qrController');

router.post('/qr', createQR);
router.get('/r/:id', handleRedirect);

module.exports = router;