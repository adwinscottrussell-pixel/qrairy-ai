const prisma = require('../utils/prismaClient');
const { PLANS } = require('../config/constants');
const normalizePlan = (plan) => plan ? plan.replace('_annual', '') : 'free';

// ─── requirePlan(feature) ─────────────────────────────────────
// Usage: router.post('/pass/create', requireAuth, requirePlan('walletPasses'), handler)

function requirePlan(feature) {
  return async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      const plan = user?.plan || 'free';
      const limits = PLANS[normalizePlan(plan)] || PLANS['free'];

      if (!limits[feature]) {
        const upgradeMap = {
          aiQRLimit:         { requiredPlan: 'starter', price: '$9/mo' },
          dynamicQR:         { requiredPlan: 'pro',     price: '$29/mo' },
          pushNotifications: { requiredPlan: 'starter', price: '$9/mo' },
          walletPasses:      { requiredPlan: 'business',price: '$49/mo' },
          apiAccess:         { requiredPlan: 'api',     price: '$49/mo' },
        };
        const upgrade = upgradeMap[feature] || { requiredPlan: 'pro', price: '$29/mo' };
        return res.status(403).json({
          error: `This feature requires the ${upgrade.requiredPlan} plan (${upgrade.price}).`,
          upgrade: true,
          requiredPlan: upgrade.requiredPlan,
          currentPlan: plan,
        });
      }

      req.userPlan = plan;
      req.planLimits = limits;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requirePlan };
