/**
 * Qraivy Tier Routes
 * Handles trial activation, plan info, and tier management.
 */

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const prisma  = require('../prismaClient');
const {
  buildPlanInfo,
  startTrial,
  resolveEffectivePlan,
  TRIAL_DURATION_MS,
} = require('../utils/tierSystem');

// ── GET /tier/plan — get current plan info ─────────────────────────────────
router.get('/plan', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const user   = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const aiQrCount = await prisma.qR.count({
      where: { userId, businessName: { not: null } },
    });

    return res.json({ planInfo: buildPlanInfo(user, aiQrCount) });
  } catch (err) {
    console.error('[Tier] plan error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /tier/trial — start a trial ──────────────────────────────────────
router.post('/trial', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const user   = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const currentPlan = (user.plan || 'free').toLowerCase();

    // Don't restart trial if already on paid plan
    if (['starter','pro','starter_annual','pro_annual'].includes(currentPlan)) {
      return res.json({ ok: true, message: 'Already on premium plan', planInfo: buildPlanInfo(user) });
    }

    // Don't restart if trial is still active
    if (currentPlan === 'trial' && user.trialExpiresAt && new Date(user.trialExpiresAt) > new Date()) {
      const aiQrCount = await prisma.qR.count({ where: { userId, businessName: { not: null } } });
      return res.json({
        ok: true,
        message: 'Trial already active',
        planInfo: buildPlanInfo(user, aiQrCount),
      });
    }

    // Start trial
    const updatedUser = await startTrial(userId);
    const aiQrCount   = await prisma.qR.count({ where: { userId, businessName: { not: null } } });
    const planInfo    = buildPlanInfo(updatedUser, aiQrCount);

    console.log(`[Tier] Trial started for user ${userId}, expires ${updatedUser.trialExpiresAt}`);

    return res.json({
      ok: true,
      message: 'Trial started',
      planInfo,
      trialDurationMs: TRIAL_DURATION_MS,
    });
  } catch (err) {
    console.error('[Tier] trial error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /tier/check — check if a capability is allowed ───────────────────
router.post('/check', requireAuth, async (req, res) => {
  try {
    const { capability } = req.body;
    const userId = req.userId;
    const user   = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const plan = resolveEffectivePlan(user);
    const { PLAN_CAPS } = require('../utils/tierSystem');
    const caps = PLAN_CAPS[plan] || PLAN_CAPS.free;
    const allowed = capability ? !!caps[capability] : true;
    const isExpiredTrial = (user.plan || '') === 'trial' && plan === 'free';

    return res.json({
      allowed,
      plan,
      isExpiredTrial,
      upgradeRequired: !allowed,
      upgradeUrl: '/upgrade.html',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /tier/status — public tier status for a landing page slug ──────────
router.get('/status/:slug', async (req, res) => {
  try {
    const page = await prisma.landingPage.findUnique({
      where: { slug: req.params.slug },
      select: { status: true, userId: true },
    });
    if (!page) return res.json({ active: false, reason: 'not_found' });

    if (page.status !== 'live') return res.json({ active: false, reason: 'unpublished' });

    // Check if owner's plan still allows it
    if (page.userId) {
      const user = await prisma.user.findUnique({ where: { id: page.userId } });
      if (user) {
        const plan = resolveEffectivePlan(user);
        if (plan === 'free') {
          // Check if it was created during a trial that has now expired
          const { PLAN_CAPS } = require('../utils/tierSystem');
          if (!PLAN_CAPS[plan].canCreateAI) {
            return res.json({ active: false, reason: 'trial_expired', upgradeUrl: '/upgrade.html' });
          }
        }
      }
    }

    return res.json({ active: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
