const express = require('express');
const router = express.Router();
const { handleCreateQR, handleRedirect } = require('../controllers/qrController');

router.post('/qr', handleCreateQR);
router.get('/r/:id', handleRedirect);

module.exports = router;
