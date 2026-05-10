const express = require('express');
const router = express.Router();
const prisma = require('../utils/prismaClient');

// ─── Admin key middleware ─────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'qraivy-admin-2026';

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

// ─── GET /admin/overview ──────────────────────────────────────
router.get('/overview', requireAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      planBreakdown,
      totalQRs,
      totalScans,
      totalSubscribers,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
      prisma.qR.count(),
      prisma.scan.count(),
      prisma.subscriber.count(),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { qrs: true } } },
      }),
    ]);

    const planPrices = { free: 0, starter: 9, pro: 29, business: 49 };
    const paidUsers = planBreakdown
      .filter(p => p.plan !== 'free')
      .reduce((s, p) => s + p._count._all, 0);
    const freeUsers = planBreakdown.find(p => p.plan === 'free')?._count._all || 0;

    const estimatedMRR = planBreakdown.reduce((total, p) => {
      return total + (p._count._all * (planPrices[p.plan] || 0));
    }, 0);

    return res.json({
      totalUsers,
      paidUsers,
      freeUsers,
      totalQRs,
      totalScans,
      totalSubscribers,
      estimatedMRR,
      planBreakdown: planBreakdown.map(p => ({ plan: p.plan, count: p._count._all })),
      recentUsers,
    });
  } catch (err) {
    console.error('admin/overview error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── GET /admin/users ─────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        qrs: {
          include: {
            scans: true,
            subscribers: true,
          },
        },
      },
    });

    return res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        plan: u.plan,
        phone: u.phone,
        stripeCustomerId: u.stripeCustomerId,
        stripeSubscriptionId: u.stripeSubscriptionId,
        subscriptionStatus: u.subscriptionStatus,
        createdAt: u.createdAt,
        qrCount: u.qrs.length,
        totalScans: u.qrs.reduce((s, q) => s + q.scans.length, 0),
        totalSubscribers: u.qrs.reduce((s, q) => s + q.subscribers.length, 0),
      })),
    });
  } catch (err) {
    console.error('admin/users error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── PUT /admin/users/:id/plan ────────────────────────────────
router.put('/users/:id/plan', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan } = req.body;
    const validPlans = ['free', 'starter', 'pro', 'business'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }
    await prisma.user.update({ where: { id }, data: { plan } });
    return res.json({ success: true });
  } catch (err) {
    console.error('admin/users/plan error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── PUT /admin/users/:id/suspend ────────────────────────────
router.put('/users/:id/suspend', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.update({ where: { id }, data: { plan: 'free' } });
    return res.json({ success: true });
  } catch (err) {
    console.error('admin/users/suspend error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── GET /admin/api-keys ──────────────────────────────────────
router.get('/api-keys', requireAdmin, async (req, res) => {
  try {
    const keys = await prisma.aPIKey.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ keys });
  } catch (err) {
    console.error('admin/api-keys error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── PUT /admin/api-keys/:id/revoke ──────────────────────────
router.put('/api-keys/:id/revoke', requireAdmin, async (req, res) => {
  try {
    await prisma.aPIKey.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── GET /admin/revenue ───────────────────────────────────────
router.get('/revenue', requireAdmin, async (req, res) => {
  try {
    const planBreakdown = await prisma.user.groupBy({
      by: ['plan'],
      _count: { _all: true },
    });

    const planPrices = { free: 0, starter: 9, pro: 29, business: 49 };
    const paidUsers = planBreakdown.filter(p => p.plan !== 'free').reduce((s, p) => s + p._count.id, 0);
    const freeUsers = planBreakdown.find(p => p.plan === 'free')?._count.id || 0;
    const estimatedMRR = planBreakdown.reduce((t, p) => t + (p._count.id * (planPrices[p.plan] || 0)), 0);

    return res.json({
      paidUsers,
      freeUsers,
      estimatedMRR,
      planBreakdown: planBreakdown.map(p => ({ plan: p.plan, count: p._count._all })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── GET /admin/qr-analytics ─────────────────────────────────
router.get('/qr-analytics', requireAdmin, async (req, res) => {
  try {
    const [totalQRs, aiQRs, dynamicQRs, totalScans, totalSubscribers, topQRs] = await Promise.all([
      prisma.qR.count(),
      prisma.qR.count({ where: { businessName: { not: null } } }),
      prisma.qR.count({ where: { isDynamic: true } }),
      prisma.scan.count(),
      prisma.subscriber.count(),
      prisma.qR.findMany({
        where: { deletedAt: null },
        include: { scans: true, subscribers: true },
        orderBy: { scans: { _count: 'desc' } },
        take: 20,
      }),
    ]);

    return res.json({
      totalQRs,
      aiQRs,
      dynamicQRs,
      totalScans,
      totalSubscribers,
      topQRs: topQRs.map(q => ({
        id: q.id,
        businessName: q.businessName,
        originalUrl: q.originalUrl,
        isDynamic: q.isDynamic,
        totalScans: q.scans.length,
        totalSubscribers: q.subscribers.length,
        createdAt: q.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
