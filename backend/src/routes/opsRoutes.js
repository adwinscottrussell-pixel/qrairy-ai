// ============================================================
// opsRoutes.js — Universal Operations Search
// Reuses requireAdmin — no new auth surface (§5).
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminMiddleware');
const { handleSearch } = require('../controllers/opsSearchController');

router.get('/search', requireAdmin, handleSearch);

module.exports = router;
