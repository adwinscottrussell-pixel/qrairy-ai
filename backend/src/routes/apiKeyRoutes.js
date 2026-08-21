// ============================================================
// apiKeyRoutes.js — GHL and third-party API key management
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const prisma = require('../utils/prismaClient');
const { handleCreateQR } = require('../controllers/qrController');
const { handleCreatePass } = require('../controllers/passController');
const { API_ORIGIN } = require('../config/urls');

// ── Manage API keys (dashboard) ───────────────────────────────

// List user's API keys
router.get('/keys', requireAuth, async (req, res) => {
  try {
    const keys = await prisma.aPIKey.findMany({
      where: { userId: req.userId },
      select: {
        id: true, name: true, plan: true,
        qrLimit: true, qrUsed: true,
        isActive: true, lastUsedAt: true,
        createdAt: true,
        // Never expose the actual key value after creation
        key: false,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ keys });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Create new API key
router.post('/keys', requireAuth, async (req, res) => {
  try {
    const { name, plan = 'api_starter' } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    const apiKey = await prisma.aPIKey.create({
      data: {
        userId: req.userId,
        name,
        plan,
        qrLimit: plan === 'api_agency' ? -1 : plan === 'api_pro' ? 2000 : 500,
      },
    });

    // Return full key only on creation
    return res.status(201).json({
      success: true,
      key: apiKey.key, // Show once
      id: apiKey.id,
      name: apiKey.name,
      plan: apiKey.plan,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Revoke API key
router.delete('/keys/:id', requireAuth, async (req, res) => {
  try {
    const key = await prisma.aPIKey.findUnique({ where: { id: req.params.id } });
    if (!key || key.userId !== req.userId) return res.status(404).json({ error: 'Not found.' });
    await prisma.aPIKey.update({ where: { id: req.params.id }, data: { isActive: false } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Public API endpoints (used by GHL via X-API-Key) ─────────

// Create QR via API key
router.post('/v1/qr', apiKeyAuth, handleCreateQR);

// Create Wallet pass via API key
router.post('/v1/pass', apiKeyAuth, async (req, res) => {
  // Inject planLimits for apiKey users
  req.userPlan = 'business'; // API keys always have business features
  return handleCreatePass(req, res);
});

// Get QR analytics via API key
router.get('/v1/analytics', apiKeyAuth, async (req, res) => {
  try {
    const data = await prisma.qR.findMany({
      where: { userId: req.userId, deletedAt: null },
      include: { scans: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({
      qrs: data.map(qr => ({
        id: qr.id,
        originalUrl: qr.originalUrl,
        businessName: qr.businessName,
        redirectUrl: `${API_ORIGIN}/r/${qr.id}`,
        totalScans: qr.scans.length,
        createdAt: qr.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
