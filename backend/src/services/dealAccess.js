// ============================================================
// dealAccess.js — who may use QRAIVY Deals (Phase 3B.1: foundation only;
// not attached to any route yet).
//
// Two separate questions, both required:
//
//   1. ROLLOUT  -- is Deals switched on for this account at all?
//      Railway variables, read on every call, FAIL-CLOSED:
//        DEALS_ENABLED=true          every account ("general"); only the
//                                    exact value "true" counts
//        DEALS_PILOT_USER_IDS=a,b    only these Clerk user ids ("pilot");
//                                    entries that are not a well-formed
//                                    Clerk user id are ignored, so "*",
//                                    "all", "" or "user_" match nobody
//        neither                     nobody ("none")
//      A pilot entry never enables any other account.
//
//   2. PLAN     -- does the account's effective plan include Deals?
//      config/plans.js (deals, dealLimit) after resolveEffectivePlan():
//      an expired trial or a cancelled / unpaid subscription is Free,
//      annual plans are their base plan, enterprise is Business, and a
//      missing User row is Free.
//
//   rollout none     -> no access, whatever the plan (403)
//   rollout general  -> the plan decides (402 plan_required on Free)
//   rollout pilot    -> access whatever the plan; dealLimit 10, except
//                       plans with unlimited Deals (Pro / Business), which
//                       stay unlimited
// ============================================================
const plans = require('../config/plans');

const PILOT_DEAL_LIMIT = 10;
const UPGRADE_PLAN = 'starter';                // cheapest plan that includes Deals
const CLERK_USER_ID = /^user_[A-Za-z0-9]+$/;

function isClerkUserId(v) {
  return typeof v === 'string' && CLERK_USER_ID.test(v);
}

// The rollout settings as they are right now. Never cached: Railway
// restarts the service on every variable change anyway.
function readRollout(env = process.env) {
  const e = env || {};
  const general = e.DEALS_ENABLED === 'true';
  const entries = String(e.DEALS_PILOT_USER_IDS == null ? '' : e.DEALS_PILOT_USER_IDS)
    .split(',').map((s) => s.trim()).filter(Boolean);
  const valid = entries.filter(isClerkUserId);
  return Object.freeze({
    general,
    pilotIds: Object.freeze(new Set(valid)),
    ignoredPilotEntries: entries.length - valid.length,
  });
}

// 'pilot' | 'general' | 'none'. A listed pilot stays 'pilot' when Deals is
// also on for everyone, so it keeps the pilot limit.
function rolloutFor(userId, env = process.env) {
  const r = readRollout(env);
  if (isClerkUserId(userId) && r.pilotIds.has(userId)) return 'pilot';
  return r.general ? 'general' : 'none';
}

// Pure: the full access decision for one account.
//   user    the User row ({ plan, subscriptionStatus, trialExpiresAt }) or null
//   userId  the signed-in Clerk user id (rollout is keyed by it)
function evaluateDealAccess(user, userId, { env = process.env, now = new Date() } = {}) {
  const rollout = rolloutFor(userId, env);
  const effective = plans.resolveEffectivePlan(user || {}, now);
  const entitlements = plans.getPlanEntitlements(effective.effectiveBase);
  const planAllows = entitlements.deals === true;

  let allowed = false;
  let reason;
  let dealLimit = 0;
  if (rollout === 'none') {
    reason = 'not_rolled_out';
  } else if (rollout === 'pilot') {
    allowed = true;
    reason = 'pilot';
    dealLimit = entitlements.dealLimit === null ? null : Math.max(entitlements.dealLimit, PILOT_DEAL_LIMIT);
  } else if (planAllows) {
    allowed = true;
    reason = 'plan';
    dealLimit = entitlements.dealLimit;
  } else {
    reason = 'plan_required';
  }

  return Object.freeze({
    allowed,
    reason,                                  // pilot | plan | plan_required | not_rolled_out
    rollout,                                 // pilot | general | none
    planAllows,                              // plan eligibility, independent of rollout
    effectiveBase: effective.effectiveBase,  // free | trial | starter | pro | business
    planReason: effective.reason,            // plan | trial_expired | subscription_* | unknown_plan
    dealLimit,                               // null = unlimited; 0 when not allowed
  });
}

// Loads the User row and decides. A database error is thrown, never read
// as "allowed" -- the caller answers it as a failure.
async function getDealAccess(userId, { client, env = process.env, now = new Date() } = {}) {
  const db = client || require('../utils/prismaClient');
  const user = isClerkUserId(userId) ? await db.user.findUnique({ where: { id: userId } }) : null;
  return evaluateDealAccess(user, userId, { env, now });
}

// May one more draft or published Deal be created?
function canCreateDeal(access, currentCount) {
  return !!(access && access.allowed) && plans.hasCapacity(access.dealLimit, currentCount);
}

// The HTTP answer for a refused access decision, or null when allowed.
// Never contains user ids, e-mail addresses or rollout settings.
function denialFor(access) {
  if (access && access.allowed) return null;
  if (!access || access.reason === 'not_rolled_out') {
    return { status: 403, body: { error: 'deals_not_available', message: 'Deals are not available for this account yet.' } };
  }
  return {
    status: 402,
    body: {
      error: 'plan_required',
      message: 'Your plan does not include Deals. Upgrade to Starter or higher to use Deals.',
      upgrade: true,
      requiredPlan: UPGRADE_PLAN,
      currentPlan: access.effectiveBase,
    },
  };
}

// The HTTP answer when the Deal limit is reached (same shape as the Smart Page limit).
function limitResponse(access, currentCount) {
  const limit = access.dealLimit;
  return {
    status: 402,
    body: {
      error: 'plan_limit',
      message: `This account can have ${limit} active Deal${limit === 1 ? '' : 's'} (draft or published). Archive one, or upgrade to create more.`,
      limit,
      current: currentCount,
      upgrade: true,
    },
  };
}

module.exports = {
  PILOT_DEAL_LIMIT,
  UPGRADE_PLAN,
  isClerkUserId,
  readRollout,
  rolloutFor,
  evaluateDealAccess,
  getDealAccess,
  canCreateDeal,
  denialFor,
  limitResponse,
};
