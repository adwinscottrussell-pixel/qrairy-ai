/**
 * analyticsService.js — QRairy Centralized Analytics Service
 * ─────────────────────────────────────────────────────────────
 * Single source for all analytics data.
 * Dashboard cards must NOT calculate independently.
 *
 * All functions return consistent data shapes.
 * Routes call this service — never query Prisma directly in routes.
 *
 * Place in: backend/src/services/analyticsService.js
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');

// ── Customer analytics ────────────────────────────────────────

/**
 * getCustomerDashboard(userId)
 * Returns all data needed for a customer's dashboard in one call.
 * No page should make multiple round-trips for this data.
 */
async function getCustomerDashboard(userId) {
  const [qrCodes, scans, subscribers] = await Promise.all([
    // Total QR codes for this user
    prisma.qR.count({ where: { userId } }),

    // Total scans across all their QR codes
    prisma.scan.count({
      where: { qr: { userId } },
    }),

    // Total subscribers (if Subscriber model exists)
    prisma.subscriber
      ? prisma.subscriber.count({ where: { userId } })
      : Promise.resolve(0),
  ]);

  // Scans in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentScans = await prisma.scan.count({
    where: {
      qr: { userId },
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  // Scans by day for sparkline (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const scansByDay = await prisma.scan.groupBy({
    by: ['createdAt'],
    where: {
      qr: { userId },
      createdAt: { gte: sevenDaysAgo },
    },
    _count: { id: true },
  });

  return {
    totalQrCodes   : qrCodes,
    totalScans     : scans,
    scansLast30Days: recentScans,
    totalSubscribers: subscribers,
    scanSparkline  : _groupByDate(scansByDay, 7),
  };
}

/**
 * getQrAnalytics(qrId, userId)
 * Per-QR analytics. Verifies ownership before returning data.
 */
async function getQrAnalytics(qrId, userId) {
  const qr = await prisma.qR.findFirst({
    where: { id: qrId, userId },
  });

  if (!qr) throw new Error('QR not found or access denied.');

  const scans = await prisma.scan.findMany({
    where: { qrId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id        : true,
      userAgent : true,
      createdAt : true,
    },
  });

  return {
    qrId,
    totalScans : scans.length,
    recentScans: scans,
  };
}

// ── Admin analytics ───────────────────────────────────────────

/**
 * getAdminOverview()
 * Platform-wide metrics for the admin dashboard.
 * Requires server-side admin role check before calling.
 */
async function getAdminOverview() {
  const [totalUsers, totalQr, totalScans] = await Promise.all([
    prisma.user
      ? prisma.user.count()
      : _getClerkUserCount(),
    prisma.qR.count(),
    prisma.scan.count(),
  ]);

  // New users in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const newUsersLast30 = prisma.user
    ? await prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } })
    : 0;

  const newScansLast30 = await prisma.scan.count({
    where: { createdAt: { gte: thirtyDaysAgo } },
  });

  // Recent QR codes with user info
  const recentQr = await prisma.qR.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { scans: { select: { id: true } } },
  });

  return {
    totalUsers,
    totalQr,
    totalScans,
    mrr              : 0, // Wire to Stripe when payments are live
    newUsersLast30,
    newScansLast30,
    recentQr: recentQr.map(function (q) {
      return {
        id        : q.id,
        url       : q.originalUrl,
        scanCount : q.scans.length,
        createdAt : q.createdAt,
      };
    }),
  };
}

/**
 * getAdminUsers()
 * All users with their QR count and scan totals.
 */
async function getAdminUsers() {
  const qrByUser = await prisma.qR.groupBy({
    by: ['userId'],
    _count: { id: true },
  });

  const scansByUser = await prisma.scan.groupBy({
    by: [],
    // Group through QR → userId requires raw or relation count
    _count: { id: true },
  });

  return {
    qrByUser: qrByUser.map(function (r) {
      return { userId: r.userId, qrCount: r._count.id };
    }),
  };
}

// ── Helpers ───────────────────────────────────────────────────

function _groupByDate(records, days) {
  var result = [];
  for (var i = days - 1; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var dateStr = d.toISOString().split('T')[0];
    var count = records.filter(function (r) {
      return r.createdAt && r.createdAt.toISOString().startsWith(dateStr);
    }).reduce(function (sum, r) { return sum + r._count.id; }, 0);
    result.push({ date: dateStr, count: count });
  }
  return result;
}

async function _getClerkUserCount() {
  // Fallback if no local user table — returns 0
  return 0;
}

module.exports = {
  getCustomerDashboard,
  getQrAnalytics,
  getAdminOverview,
  getAdminUsers,
};
