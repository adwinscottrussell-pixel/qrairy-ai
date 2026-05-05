const express = require('express');
const router = express.Router();
const { handleCreateQR, handleRedirect, handleAnalytics } = require('../controllers/qrController');

router.post('/qr', handleCreateQR);
router.get('/r/:id', handleRedirect);
router.get('/analytics', handleAnalytics);

module.exports = router;