/**
 * Qraivy Scan Tracker
 * Records scan events when a QR code is scanned (/r/:id redirect).
 * Stores: timestamp, qrId, IP, userAgent, country (if available)
 * Increments: QR.totalScans (via Scan count), QR.lastScannedAt
 */

const prisma = require('./prismaClient');

// ── Track a scan event ────────────────────────────────────────────────────────
async function trackScan(qrId, req) {
  try {
    const ip        = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                    || req.headers['x-real-ip']
                    || req.connection?.remoteAddress
                    || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referer   = req.headers['referer'] || null;

    // Create scan record
    await prisma.scan.create({
      data: {
        qrId,
        userAgent,
        ip,
        referer,
      },
    });

    // Update QR lastScannedAt
    await prisma.qR.update({
      where: { id: qrId },
      data: { lastScannedAt: new Date() },
    }).catch(() => {}); // non-blocking — field may not exist yet

  } catch (err) {
    // Never let scan tracking break the redirect
    console.error('[ScanTracker] error:', err.message);
  }
}

// ── Get scan analytics for a QR ──────────────────────────────────────────────
async function getScanAnalytics(qrId, days = 30) {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [total, recent, dailyScans] = await Promise.all([
      prisma.scan.count({ where: { qrId } }),
      prisma.scan.count({ where: { qrId, createdAt: { gte: since } } }),
      prisma.scan.groupBy({
        by: ['createdAt'],
        where: { qrId, createdAt: { gte: since } },
        _count: true,
        orderBy: { createdAt: 'asc' },
      }).catch(() => []),
    ]);

    return { total, recent, dailyScans };
  } catch (err) {
    console.error('[ScanTracker] analytics error:', err.message);
    return { total: 0, recent: 0, dailyScans: [] };
  }
}

// ── Patch: enhanced handleRedirect ──────────────────────────────────────────
// Drop-in replacement that wraps the existing redirect with scan tracking.
async function handleRedirectWithTracking(req, res, originalHandler) {
  const qrId = req.params.id;

  // Fire scan tracking asynchronously — don't block the redirect
  if (qrId) {
    setImmediate(() => trackScan(qrId, req));
  }

  // Proceed with original redirect logic
  return originalHandler(req, res);
}

module.exports = { trackScan, getScanAnalytics, handleRedirectWithTracking };
