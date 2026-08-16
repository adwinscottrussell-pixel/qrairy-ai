/**
 * adminRoutes.js — Qraivy Platform Admin API
 * ─────────────────────────────────────────────────────────────
 * SECURITY: All routes protected by requireAdmin middleware.
 * requireAdmin verifies:
 *   - Valid Clerk JWT (cryptographic)
 *   - publicMetadata.role === 'admin'
 *
 * The old hardcoded ADMIN_SECRET_KEY ('qraivy-admin-2026') has
 * been removed. It was not secure — anyone who found that string
 * had full admin access with no user identity or audit trail.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const prisma  = require('../utils/prismaClient');
const { requireAdmin } = require('../middleware/adminMiddleware');
const { getHealthChecks } = require('../services/attentionService');
const networkAdmin = require('../services/networkAdminService');

// ── GET /admin/overview ───────────────────────────────────────
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

    const planPrices    = { free: 0, starter: 9, pro: 29, business: 49 };
    const paidUsers     = planBreakdown
      .filter(p => p.plan !== 'free')
      .reduce((s, p) => s + p._count._all, 0);
    const freeUsers     = planBreakdown.find(p => p.plan === 'free')?._count._all || 0;
    const estimatedMRR  = planBreakdown.reduce((total, p) => {
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
      planBreakdown : planBreakdown.map(p => ({ plan: p.plan, count: p._count._all })),
      recentUsers,
    });
  } catch (err) {
    console.error('[admin/overview]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /admin/users ──────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        qrs: {
          include: {
            scans       : true,
            subscribers : true,
          },
        },
      },
    });

    return res.json({
      users: users.map(u => ({
        id                   : u.id,
        email                : u.email,
        plan                 : u.plan,
        phone                : u.phone,
        stripeCustomerId     : u.stripeCustomerId,
        stripeSubscriptionId : u.stripeSubscriptionId,
        subscriptionStatus   : u.subscriptionStatus,
        createdAt            : u.createdAt,
        qrCount              : u.qrs.length,
        totalScans           : u.qrs.reduce((s, q) => s + q.scans.length, 0),
        totalSubscribers     : u.qrs.reduce((s, q) => s + q.subscribers.length, 0),
      })),
    });
  } catch (err) {
    console.error('[admin/users]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /admin/users/:id/plan ─────────────────────────────────
router.put('/users/:id/plan', requireAdmin, async (req, res) => {
  try {
    const { id }  = req.params;
    const { plan } = req.body;
    const validPlans = ['free', 'starter', 'pro', 'business'];

    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    await prisma.user.update({ where: { id }, data: { plan } });

    console.log(`[admin/users/plan] Admin ${req.adminUser.email} changed user ${id} to plan: ${plan}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('[admin/users/plan]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /admin/users/:id/suspend ──────────────────────────────
router.put('/users/:id/suspend', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.update({ where: { id }, data: { plan: 'free' } });

    console.log(`[admin/users/suspend] Admin ${req.adminUser.email} suspended user ${id}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('[admin/users/suspend]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /admin/api-keys ───────────────────────────────────────
router.get('/api-keys', requireAdmin, async (req, res) => {
  try {
    const keys = await prisma.aPIKey.findMany({
      include  : { user: { select: { email: true } } },
      orderBy  : { createdAt: 'desc' },
    });
    return res.json({ keys });
  } catch (err) {
    console.error('[admin/api-keys]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /admin/api-keys/:id/revoke ────────────────────────────
router.put('/api-keys/:id/revoke', requireAdmin, async (req, res) => {
  try {
    await prisma.aPIKey.update({
      where : { id: req.params.id },
      data  : { isActive: false },
    });

    console.log(`[admin/api-keys/revoke] Admin ${req.adminUser.email} revoked key ${req.params.id}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('[admin/api-keys/revoke]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /admin/revenue ────────────────────────────────────────
router.get('/revenue', requireAdmin, async (req, res) => {
  try {
    const planBreakdown = await prisma.user.groupBy({
      by     : ['plan'],
      _count : { _all: true },
    });

    const planPrices   = { free: 0, starter: 9, pro: 29, business: 49 };
    const paidUsers    = planBreakdown
      .filter(p => p.plan !== 'free')
      .reduce((s, p) => s + p._count._all, 0);
    const freeUsers    = planBreakdown.find(p => p.plan === 'free')?._count._all || 0;
    const estimatedMRR = planBreakdown.reduce(
      (t, p) => t + (p._count._all * (planPrices[p.plan] || 0)), 0
    );

    return res.json({
      paidUsers,
      freeUsers,
      estimatedMRR,
      planBreakdown : planBreakdown.map(p => ({ plan: p.plan, count: p._count._all })),
    });
  } catch (err) {
    console.error('[admin/revenue]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /admin/qr-analytics ───────────────────────────────────
router.get('/qr-analytics', requireAdmin, async (req, res) => {
  try {
    const [totalQRs, aiQRs, dynamicQRs, totalScans, totalSubscribers, topQRs] =
      await Promise.all([
        prisma.qR.count(),
        prisma.qR.count({ where: { businessName: { not: null } } }),
        prisma.qR.count({ where: { isDynamic: true } }),
        prisma.scan.count(),
        prisma.subscriber.count(),
        prisma.qR.findMany({
          where   : { deletedAt: null },
          include : { scans: true, subscribers: true },
          orderBy : { scans: { _count: 'desc' } },
          take    : 20,
        }),
      ]);

    return res.json({
      totalQRs,
      aiQRs,
      dynamicQRs,
      totalScans,
      totalSubscribers,
      topQRs: topQRs.map(q => ({
        id               : q.id,
        businessName     : q.businessName,
        originalUrl      : q.originalUrl,
        isDynamic        : q.isDynamic,
        totalScans       : q.scans.length,
        totalSubscribers : q.subscribers.length,
        createdAt        : q.createdAt,
      })),
    });
  } catch (err) {
    console.error('[admin/qr-analytics]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /admin/health ─────────────────────────────────────────
// NOTE: health check is public (no requireAdmin) intentionally —
// it reveals no sensitive data and is needed by Railway/uptime monitors.
// If you want it private, add requireAdmin here too.
router.get('/health', async (req, res) => {
  const checks = await getHealthChecks();
  return res.json(checks);
});

// ────────────────────────────────────────────────────────────────────
// Stadt Pocket Phase 1B — Network / Location / Business / Manager admin
// ─────────────────────────────────────────────────────────────────────
// All routes below are requireAdmin-protected platform-owner-only APIs.
// See docs/architecture/NETWORK_LOCATION_FOUNDATION.md. Business creation
// is intentionally not exposed here this phase — only read/edit/assign —
// see that doc for why.

function handleAdminServiceError(err, res) {
  if (err instanceof networkAdmin.AdminServiceError) {
    const statusByCode = { NOT_FOUND: 404, INVALID: 400, DUPLICATE: 409 };
    return res.status(statusByCode[err.code] || 500).json({ error: err.message });
  }
  console.error('[admin/network-foundation]', err);
  return res.status(500).json({ error: 'Internal server error.' });
}

// ── Networks ─────────────────────────────────────────────────────────
router.get('/networks', requireAdmin, async (req, res) => {
  try {
    return res.json({ networks: await networkAdmin.listNetworks() });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.get('/networks/:id', requireAdmin, async (req, res) => {
  try {
    return res.json({ network: await networkAdmin.getNetwork(req.params.id) });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.post('/networks', requireAdmin, async (req, res) => {
  try {
    const network = await networkAdmin.createNetwork(req.body || {});
    console.log(`[admin/networks] Admin ${req.adminUser.email} created Network ${network.id}`);
    return res.status(201).json({ network });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.patch('/networks/:id', requireAdmin, async (req, res) => {
  try {
    const network = await networkAdmin.updateNetwork(req.params.id, req.body || {});
    console.log(`[admin/networks] Admin ${req.adminUser.email} updated Network ${network.id}`);
    return res.json({ network });
  } catch (err) { return handleAdminServiceError(err, res); }
});

// ── Locations ────────────────────────────────────────────────────────
router.get('/locations', requireAdmin, async (req, res) => {
  try {
    const { networkId, type, status } = req.query;
    return res.json({ locations: await networkAdmin.listLocations({ networkId, type, status }) });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.get('/locations/:id', requireAdmin, async (req, res) => {
  try {
    return res.json({ location: await networkAdmin.getLocation(req.params.id) });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.post('/locations', requireAdmin, async (req, res) => {
  try {
    const location = await networkAdmin.createLocation(req.body || {});
    console.log(`[admin/locations] Admin ${req.adminUser.email} created Location ${location.id}`);
    return res.status(201).json({ location });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.patch('/locations/:id', requireAdmin, async (req, res) => {
  try {
    const location = await networkAdmin.updateLocation(req.params.id, req.body || {});
    console.log(`[admin/locations] Admin ${req.adminUser.email} updated Location ${location.id}`);
    return res.json({ location });
  } catch (err) { return handleAdminServiceError(err, res); }
});

// ── Businesses (platform read/manage/create — Phase 1B-B1 adds creation) ──
router.get('/businesses', requireAdmin, async (req, res) => {
  try {
    const { networkId, locationId, status } = req.query;
    return res.json({ businesses: await networkAdmin.listBusinesses({ networkId, locationId, status }) });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.get('/businesses/:id', requireAdmin, async (req, res) => {
  try {
    return res.json({ business: await networkAdmin.getBusiness(req.params.id) });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.post('/businesses', requireAdmin, async (req, res) => {
  try {
    const { name, primaryOwnerUserId, status } = req.body || {};
    const business = await networkAdmin.createBusiness({ name, primaryOwnerUserId, status });
    console.log(`[admin/businesses] Admin ${req.adminUser.email} created Business ${business.id} for owner ${primaryOwnerUserId}`);
    return res.status(201).json({ business });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.patch('/businesses/:id', requireAdmin, async (req, res) => {
  try {
    const business = await networkAdmin.updateBusiness(req.params.id, req.body || {});
    console.log(`[admin/businesses] Admin ${req.adminUser.email} updated Business ${business.id}`);
    return res.json({ business });
  } catch (err) { return handleAdminServiceError(err, res); }
});

// ── LandingPage -> Business mapping (Phase 1B-B1) ──────────────────────
router.get('/landing-pages/unmapped', requireAdmin, async (req, res) => {
  try {
    const { ownerUserId } = req.query;
    return res.json({ landingPages: await networkAdmin.listUnmappedLandingPages(ownerUserId) });
  } catch (err) { return handleAdminServiceError(err, res); }
});

// Global, platform-wide intake queue (Phase 1B-B2) — every LandingPage with
// businessId: null across all owners, not scoped to one Business's owner
// the way /landing-pages/unmapped above is. Read-only.
router.get('/landing-pages/unassigned', requireAdmin, async (req, res) => {
  try {
    return res.json({ landingPages: await networkAdmin.listUnassignedLandingPages() });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.patch('/landing-pages/:id/business', requireAdmin, async (req, res) => {
  try {
    const { businessId } = req.body || {};
    const landingPage = await networkAdmin.mapLandingPageToBusiness(req.params.id, businessId);
    console.log(`[admin/landing-pages] Admin ${req.adminUser.email} mapped LandingPage ${landingPage.id} to Business ${businessId}`);
    return res.json({ landingPage });
  } catch (err) { return handleAdminServiceError(err, res); }
});

// ── Business ↔ Location assignment ─────────────────────────────────────
router.post('/business-locations', requireAdmin, async (req, res) => {
  try {
    const { businessId, locationId } = req.body || {};
    const businessLocation = await networkAdmin.assignBusinessToLocation({ businessId, locationId });
    console.log(`[admin/business-locations] Admin ${req.adminUser.email} assigned Business ${businessId} to Location ${locationId}`);
    return res.status(201).json({ businessLocation });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.patch('/business-locations/:id', requireAdmin, async (req, res) => {
  try {
    const businessLocation = await networkAdmin.setBusinessLocationStatus(req.params.id, (req.body || {}).status);
    console.log(`[admin/business-locations] Admin ${req.adminUser.email} set BusinessLocation ${businessLocation.id} to ${businessLocation.status}`);
    return res.json({ businessLocation });
  } catch (err) { return handleAdminServiceError(err, res); }
});

// ── Managers (NetworkMember) ────────────────────────────────────────────
router.get('/managers', requireAdmin, async (req, res) => {
  try {
    const { networkId, locationId } = req.query;
    return res.json({ managers: await networkAdmin.listManagers({ networkId, locationId }) });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.post('/managers', requireAdmin, async (req, res) => {
  try {
    const { userId, networkId, locationId, role } = req.body || {};
    const manager = await networkAdmin.assignManager({ userId, networkId, locationId, role });
    console.log(`[admin/managers] Admin ${req.adminUser.email} assigned ${userId} as ${role} on Network ${networkId}`);
    return res.status(201).json({ manager });
  } catch (err) { return handleAdminServiceError(err, res); }
});

router.delete('/managers/:id', requireAdmin, async (req, res) => {
  try {
    await networkAdmin.removeManager(req.params.id);
    console.log(`[admin/managers] Admin ${req.adminUser.email} removed manager assignment ${req.params.id}`);
    return res.json({ success: true });
  } catch (err) { return handleAdminServiceError(err, res); }
});

module.exports = router;
