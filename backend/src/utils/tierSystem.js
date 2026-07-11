/**
 * Qraivy Account Tier System
 * Centralised tier definitions, access rules and plan resolution.
 */

// ── Tier constants ────────────────────────────────────────────────────────────
const TIERS = {
  FREE:     'free',
  TRIAL:    'trial',
  STARTER:  'starter',
  PRO:      'pro',
  STARTER_ANNUAL: 'starter_annual',
  PRO_ANNUAL:     'pro_annual',
};

// Trial duration in milliseconds (1 hour default, configurable via env)
const TRIAL_DURATION_MS = parseInt(process.env.TRIAL_DURATION_MS || '3600000', 10);

// ── Plan capabilities ─────────────────────────────────────────────────────────
const PLAN_CAPS = {
  free: {
    canCreateAI:      false,
    canUseDynamic:    false,
    canAccessSmartDash: false,
    canUseAnalytics:  false,
    canUseWallet:     false,
    canUsePush:       false,
    canUseCampaigns:  false,
    aiLimit:          0,
    dynamicLimit:     0,
  },
  trial: {
    canCreateAI:      true,
    canUseDynamic:    false,
    canAccessSmartDash: true,
    canUseAnalytics:  true,
    canUseWallet:     false,
    canUsePush:       false,
    canUseCampaigns:  false,
    aiLimit:          1,   // one Smart QR during trial
    dynamicLimit:     0,
  },
  starter: {
    canCreateAI:      true,
    canUseDynamic:    false,
    canAccessSmartDash: true,
    canUseAnalytics:  true,
    canUseWallet:     true,
    canUsePush:       true,
    canUseCampaigns:  false,
    aiLimit:          5,
    dynamicLimit:     0,
  },
  starter_annual: {
    canCreateAI:      true,
    canUseDynamic:    false,
    canAccessSmartDash: true,
    canUseAnalytics:  true,
    canUseWallet:     true,
    canUsePush:       true,
    canUseCampaigns:  false,
    aiLimit:          5,
    dynamicLimit:     0,
  },
  pro: {
    canCreateAI:      true,
    canUseDynamic:    true,
    canAccessSmartDash: true,
    canUseAnalytics:  true,
    canUseWallet:     true,
    canUsePush:       true,
    canUseCampaigns:  true,
    aiLimit:          null, // unlimited
    dynamicLimit:     null,
  },
  pro_annual: {
    canCreateAI:      true,
    canUseDynamic:    true,
    canAccessSmartDash: true,
    canUseAnalytics:  true,
    canUseWallet:     true,
    canUsePush:       true,
    canUseCampaigns:  true,
    aiLimit:          null,
    dynamicLimit:     null,
  },
};

// ── Resolve effective plan for a user ─────────────────────────────────────────
/**
 * Given a User record, returns the effective plan string,
 * accounting for trial expiration.
 */
function resolveEffectivePlan(user) {
  const rawPlan = (user.plan || 'free').toLowerCase();

  // If user is on trial, check expiry
  if (rawPlan === 'trial') {
    if (user.trialExpiresAt && new Date(user.trialExpiresAt) < new Date()) {
      return 'free'; // trial expired → downgrade to free
    }
    return 'trial';
  }

  // Stripe-managed subscriptions
  if (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing') {
    return rawPlan;
  }

  // If subscription is cancelled/past_due, fall back to free
  if (user.stripeSubscriptionId && 
      ['canceled', 'past_due', 'unpaid', 'incomplete_expired'].includes(user.subscriptionStatus)) {
    return 'free';
  }

  return rawPlan;
}

// ── Build planInfo object for frontend ────────────────────────────────────────
function buildPlanInfo(user, aiQrCount = 0) {
  const effectivePlan = resolveEffectivePlan(user);
  const caps          = PLAN_CAPS[effectivePlan] || PLAN_CAPS.free;
  const rawPlan       = (user.plan || 'free').toLowerCase();
  const isTrialExpired = rawPlan === 'trial' && effectivePlan === 'free';

  // Trial time remaining
  let trialExpiresAt = null;
  let trialSecondsRemaining = null;
  if (rawPlan === 'trial' && user.trialExpiresAt) {
    trialExpiresAt = user.trialExpiresAt;
    const msLeft = new Date(user.trialExpiresAt).getTime() - Date.now();
    trialSecondsRemaining = Math.max(0, Math.floor(msLeft / 1000));
  }

  return {
    plan:                 effectivePlan,
    rawPlan:              rawPlan,
    basePlan:             effectivePlan.replace('_annual', ''),
    isAnnual:             effectivePlan.includes('_annual'),
    isFree:               effectivePlan === 'free',
    isTrial:              effectivePlan === 'trial',
    isTrialExpired:       isTrialExpired,
    isPremium:            ['starter','pro','starter_annual','pro_annual'].includes(effectivePlan),
    subscriptionStatus:   user.subscriptionStatus || null,

    // Capabilities
    canCreateAI:          caps.canCreateAI,
    canUseDynamic:        caps.canUseDynamic,
    canAccessSmartDash:   caps.canAccessSmartDash,
    canUseAnalytics:      caps.canUseAnalytics,
    canUseWallet:         caps.canUseWallet,
    canUsePush:           caps.canUsePush,
    canUseCampaigns:      caps.canUseCampaigns,

    // Limits
    aiLimit:              caps.aiLimit,
    aiQrCount:            aiQrCount,
    aiRemaining:          caps.aiLimit === null ? null : Math.max(0, caps.aiLimit - aiQrCount),
    dynamicLimit:         caps.dynamicLimit,

    // Trial
    trialExpiresAt:       trialExpiresAt,
    trialSecondsRemaining: trialSecondsRemaining,

    // Profile
    hasPhone:             !!user.phone,
  };
}

// ── Middleware: require plan capability ───────────────────────────────────────
function requireCap(cap) {
  return async (req, res, next) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const prisma = require('./prismaClient');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const plan = resolveEffectivePlan(user);
    const caps = PLAN_CAPS[plan] || PLAN_CAPS.free;

    if (!caps[cap]) {
      const isExpiredTrial = (user.plan || '').toLowerCase() === 'trial' && plan === 'free';
      return res.status(403).json({
        error: isExpiredTrial
          ? 'Your Smart QR trial has expired. Upgrade to continue.'
          : 'This feature requires a Smart QR plan. Upgrade to unlock.',
        upgrade: true,
        requiredCap: cap,
        currentPlan: plan,
        upgradeUrl: '/upgrade.html',
      });
    }
    req.userPlan = plan;
    req.planCaps = caps;
    next();
  };
}

// ── Start trial for a user ────────────────────────────────────────────────────
async function startTrial(userId) {
  const prisma = require('./prismaClient');
  const expiresAt = new Date(Date.now() + TRIAL_DURATION_MS);
  return prisma.user.update({
    where: { id: userId },
    data: {
      plan: 'trial',
      trialExpiresAt: expiresAt,
    },
  });
}

module.exports = {
  TIERS,
  PLAN_CAPS,
  TRIAL_DURATION_MS,
  resolveEffectivePlan,
  buildPlanInfo,
  requireCap,
  startTrial,
};
