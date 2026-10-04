/**
 * Qraivy Account Tier System
 * Access rules and plan resolution for /tier/* and the frontend session.
 *
 * Plan IDs, entitlements, subscription-status policy and trial duration
 * come from the canonical model in ../config/plans.js. This module adapts
 * that model to the existing tierSystem API (PLAN_CAPS keys, plan strings
 * and the buildPlanInfo response shape consumed by frontend js/session.js).
 */

const plans = require('../config/plans');

// ── Tier constants ────────────────────────────────────────────────────────────
const TIERS = {
  FREE:     'free',
  TRIAL:    'trial',
  STARTER:  'starter',
  PRO:      'pro',
  BUSINESS: 'business',
  STARTER_ANNUAL:  'starter_annual',
  PRO_ANNUAL:      'pro_annual',
  BUSINESS_ANNUAL: 'business_annual',
  ENTERPRISE:      'enterprise', // internal alias of Business; never sold
};

// Application trial duration (canonical 14 days; TRIAL_DURATION_MS overrides)
const TRIAL_DURATION_MS = plans.getTrialDurationMs();

// Recognised paid plan IDs — a trial must never overwrite these.
const PAID_PLAN_IDS = [...plans.PURCHASABLE_PLAN_IDS, ...Object.keys(plans.INTERNAL_PLAN_ALIASES)];

// ── Plan capabilities ─────────────────────────────────────────────────────────
// Legacy capability shape derived from the canonical entitlements.
function capsFromEntitlements(e) {
  return Object.freeze({
    canCreateAI:        e.smartPageLimit !== 0,
    canUseDynamic:      e.dynamicQr,
    canAccessSmartDash: e.smartDashboard,
    canUseAnalytics:    e.analytics,
    canUseWallet:       e.walletPasses,
    canUsePush:         e.push,
    canUseCampaigns:    e.campaigns,
    aiLimit:            e.smartPageLimit, // null = unlimited
    dynamicLimit:       e.dynamicQr ? null : 0,
  });
}

// Keyed by every plan string resolveEffectivePlan() can return.
const PLAN_CAPS = Object.freeze(Object.fromEntries(
  ['free', 'trial', ...PAID_PLAN_IDS].map(id =>
    [id, capsFromEntitlements(plans.getPlanEntitlements(plans.normalizePlan(id).base))]),
));

// Plan string whose entitlements apply: the user's own (known) plan ID,
// or 'free' when those entitlements do not apply.
function effectivePlanId(r) {
  return r.plan.known && r.effectiveBase === r.plan.base ? r.plan.id : 'free';
}

// ── Resolve effective plan for a user ─────────────────────────────────────────
/**
 * Given a User record, returns the effective plan string: the user's own
 * plan ID (e.g. 'pro_annual', 'enterprise') when its entitlements apply,
 * 'trial' during an active trial, otherwise 'free' (expired trial,
 * revoked subscription or unrecognised plan value).
 */
function resolveEffectivePlan(user) {
  const r = plans.resolveEffectivePlan(user);
  return effectivePlanId(r);
}

// ── Build planInfo object for frontend ────────────────────────────────────────
function buildPlanInfo(user, aiQrCount = 0) {
  const r             = plans.resolveEffectivePlan(user);
  const effectivePlan = effectivePlanId(r);
  const caps          = PLAN_CAPS[effectivePlan] || PLAN_CAPS.free;
  const rawPlan       = r.plan.id;
  const appliesPlan   = effectivePlan !== 'free';
  const count         = Number.isInteger(aiQrCount) && aiQrCount >= 0 ? aiQrCount : 0;

  // Trial time remaining
  let trialExpiresAt = null;
  let trialSecondsRemaining = null;
  if (r.plan.isTrial && user.trialExpiresAt) {
    trialExpiresAt = user.trialExpiresAt;
    const msLeft = new Date(user.trialExpiresAt).getTime() - Date.now();
    trialSecondsRemaining = Math.max(0, Math.floor(msLeft / 1000));
  }

  return {
    plan:                 effectivePlan,
    rawPlan:              rawPlan,
    basePlan:             r.effectiveBase,
    isAnnual:             appliesPlan && r.plan.isAnnual,
    isFree:               effectivePlan === 'free',
    isTrial:              effectivePlan === 'trial',
    isTrialExpired:       r.isTrialExpired,
    isPremium:            ['starter', 'pro', 'business'].includes(r.effectiveBase),
    isInternal:           appliesPlan && r.plan.isInternal,
    isKnownPlan:          r.plan.known,
    subscriptionStatus:   user.subscriptionStatus || null,

    // Capabilities
    // Smart QR Page capacity: plan includes Smart Pages AND usage below limit.
    canCreateAI:          caps.canCreateAI && plans.hasCapacity(caps.aiLimit, count),
    canUseDynamic:        caps.canUseDynamic,
    canAccessSmartDash:   caps.canAccessSmartDash,
    canUseAnalytics:      caps.canUseAnalytics,
    canUseWallet:         caps.canUseWallet,
    canUsePush:           caps.canUsePush,
    canUseCampaigns:      caps.canUseCampaigns,

    // Limits
    aiLimit:              caps.aiLimit,
    aiQrCount:            aiQrCount,
    aiRemaining:          plans.remainingCapacity(caps.aiLimit, count),
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

// ── Smart QR Page usage ───────────────────────────────────────────────────────
// Authoritative Smart QR Page usage: LandingPage records owned by the user
// (drafts and StadtPocket-linked pages included). Legacy QR.businessName
// records and basic/static QR codes are not Smart QR Pages.
async function countSmartPages(userId) {
  const prisma = require('./prismaClient');
  return prisma.landingPage.count({ where: { userId } });
}

// ── Start trial for a user ────────────────────────────────────────────────────
// One trial per account: only a user who has never had a trial
// (trialExpiresAt null) and is not on a recognised paid plan (monthly,
// annual or internal) is updated. The conditional update makes this atomic;
// the current record is returned either way.
async function startTrial(userId) {
  const prisma = require('./prismaClient');
  const expiresAt = new Date(Date.now() + TRIAL_DURATION_MS);
  await prisma.user.updateMany({
    where: { id: userId, plan: { notIn: PAID_PLAN_IDS }, trialExpiresAt: null },
    data: {
      plan: 'trial',
      trialExpiresAt: expiresAt,
    },
  });
  return prisma.user.findUnique({ where: { id: userId } });
}

module.exports = {
  TIERS,
  PLAN_CAPS,
  TRIAL_DURATION_MS,
  resolveEffectivePlan,
  buildPlanInfo,
  requireCap,
  startTrial,
  countSmartPages,
};
