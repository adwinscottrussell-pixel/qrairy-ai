// ============================================================
// opsRoutes.js — Universal Operations Search + SupportAction audit log
// Reuses requireAdmin — no new auth surface (§5).
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminMiddleware');
const { handleSearch } = require('../controllers/opsSearchController');
const { handleCreateSupportAction } = require('../controllers/opsSupportActionController');
const { handleGetAttention } = require('../controllers/opsAttentionController');

router.get('/search', requireAdmin, handleSearch);
router.post('/support-actions', requireAdmin, handleCreateSupportAction);
router.get('/attention', requireAdmin, handleGetAttention);

module.exports = router;
