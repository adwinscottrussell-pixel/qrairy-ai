const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const prisma  = require('../utils/prismaClient');
const { buildPlanInfo, startTrial, resolveEffectivePlan, TRIAL_DURATION_MS } = require('../utils/tierSystem');
const { normalizePlan, isRecognizedPaidPlan } = require('../config/plans');

router.get('/plan', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const aiQrCount = await prisma.qR.count({ where: { userId: req.userId, businessName: { not: null } } });
    return res.json({ planInfo: buildPlanInfo(user, aiQrCount) });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.post('/trial', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Any recognised paid plan (monthly, annual, Business or internal
    // enterprise) is never replaced by an application trial.
    if (isRecognizedPaidPlan(user.plan))
      return res.json({ ok: true, message: 'Already premium', planInfo: buildPlanInfo(user) });
    const plan = normalizePlan(user.plan);
    if (plan.isTrial && user.trialExpiresAt && new Date(user.trialExpiresAt) > new Date()) {
      const c = await prisma.qR.count({ where: { userId: req.userId, businessName: { not: null } } });
      return res.json({ ok: true, message: 'Trial active', planInfo: buildPlanInfo(user, c) });
    }
    // One trial per account: a populated trialExpiresAt is the durable
    // "trial already used" marker (never cleared), whatever the plan value.
    if (user.trialExpiresAt) {
      return res.status(409).json({
        ok: false,
        code: 'trial_already_used',
        message: 'Trial already used',
        error: 'Your 14-day trial has already been used. Upgrade to keep using Smart QR features.',
        planInfo: buildPlanInfo(user),
      });
    }
    // Unrecognised plan values are never overwritten by a trial.
    if (!plan.known) {
      return res.status(409).json({
        ok: false,
        code: 'trial_not_available',
        message: 'Trial not available',
        error: 'A trial cannot be started for this account.',
        planInfo: buildPlanInfo(user),
      });
    }
    const updated = await startTrial(req.userId);
    const c = await prisma.qR.count({ where: { userId: req.userId, businessName: { not: null } } });
    return res.json({ ok: true, message: 'Trial started', planInfo: buildPlanInfo(updated, c), trialDurationMs: TRIAL_DURATION_MS });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.post('/check', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { PLAN_CAPS } = require('../utils/tierSystem');
    const plan = resolveEffectivePlan(user);
    const caps = PLAN_CAPS[plan] || PLAN_CAPS.free;
    const allowed = req.body.capability ? !!caps[req.body.capability] : true;
    return res.json({ allowed, plan, upgradeRequired: !allowed, upgradeUrl: '/upgrade.html' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.get('/status/:slug', async (req, res) => {
  try {
    const page = await prisma.landingPage.findUnique({ where: { slug: req.params.slug }, select: { status: true, userId: true } });
    if (!page || page.status !== 'live') return res.json({ active: false });
    return res.json({ active: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

module.exports = router;
