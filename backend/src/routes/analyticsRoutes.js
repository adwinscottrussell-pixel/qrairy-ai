/**
 * analyticsRoutes.js — QRairy Centralized Analytics Routes
 * ─────────────────────────────────────────────────────────────
 * All analytics data flows through here.
 * Pages must NOT calculate analytics independently.
 *
 * Register in backend/src/index.js:
 *   const analyticsRoutes = require('./routes/analyticsRoutes');
 *   app.use('/analytics', analyticsRoutes);
 * ─────────────────────────────────────────────────────────────
 */

const express  = require('express');
const router   = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminMiddleware');
const analytics = require('../services/analyticsService');

// ── GET /analytics/dashboard ──────────────────────────────────
// Customer dashboard aggregate — scans, subscribers, QR totals.
// Replaces any page-level analytics calculation.
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const data = await analytics.getCustomerDashboard(req.userId);
    return res.json(data);
  } catch (err) {
    console.error('[analytics/dashboard]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /analytics/qr/:id ─────────────────────────────────────
// Per-QR analytics. Verifies ownership.
router.get('/qr/:id', requireAuth, async (req, res) => {
  try {
    const data = await analytics.getQrAnalytics(req.params.id, req.userId);
    return res.json(data);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('[analytics/qr]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /analytics/admin/overview ────────────────────────────
// Platform-wide metrics. Admin only.
router.get('/admin/overview', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getAdminOverview();
    return res.json(data);
  } catch (err) {
    console.error('[analytics/admin/overview]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /analytics/admin/users ────────────────────────────────
// Per-user analytics breakdown. Admin only.
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getAdminUsers();
    return res.json(data);
  } catch (err) {
    console.error('[analytics/admin/users]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
