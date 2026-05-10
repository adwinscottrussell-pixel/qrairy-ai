const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { handleGenerateDesign } = require('../controllers/designController');

router.post('/generate', requireAuth, handleGenerateDesign);

module.exports = router;