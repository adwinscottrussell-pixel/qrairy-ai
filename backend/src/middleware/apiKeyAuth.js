const prisma = require('../utils/prismaClient');

// ─── API Key auth for GHL / third-party integrations ─────────
// Usage: router.post('/qr', apiKeyAuth, handler)
// Header: X-API-Key: qraivy_xxxxxxxx

async function apiKeyAuth(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required. Add X-API-Key header.' });

    const keyRecord = await prisma.aPIKey.findUnique({
      where: { key: apiKey },
      include: { user: true },
    });

    if (!keyRecord || !keyRecord.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive API key.' });
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return res.status(401).json({ error: 'API key has expired.' });
    }

    // Check QR usage limit
    if (keyRecord.qrLimit !== -1 && keyRecord.qrUsed >= keyRecord.qrLimit) {
      return res.status(403).json({
        error: `API QR limit reached (${keyRecord.qrLimit}). Upgrade your API plan.`,
        upgrade: true,
        limit: keyRecord.qrLimit,
        used: keyRecord.qrUsed,
      });
    }

    // Attach to request
    req.userId = keyRecord.userId;
    req.apiKey = keyRecord;
    req.isApiRequest = true;

    // Update last used timestamp
    await prisma.aPIKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { apiKeyAuth };
