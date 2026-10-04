// ============================================================
// QRAIVY — CANONICAL PLAN MODEL
// One definition of plan IDs, entitlements, subscription-status policy,
// trial duration, display pricing and Stripe price-mapping helpers.
//
// Phase 1 (plan consolidation): this module is intentionally NOT yet
// imported by any production caller. constants.js, utils/tierSystem.js,
// qrController, lpController, planGate, passController, stripeController,
// tierRoutes and adminRoutes keep their current behaviour until each one
// is migrated in its own reviewed step.
//
// Conventions:
//   - null = unlimited. Never compare a count against a limit directly;
//     use hasCapacity()/remainingCapacity(), which treat null explicitly.
//   - Raw plan values stored on User.plan are never rewritten here.
//     normalizePlan() only describes them.
//   - No secrets. Stripe Price IDs are read from environment variables
//     by name, only inside the pure mapping helpers below.
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Plan IDs ────────────────────────────────────────────────
const PUBLIC_BASE_PLANS = Object.freeze(['free', 'starter', 'pro', 'business']);
const ANNUAL_PLAN_IDS = Object.freeze(['starter_annual', 'pro_annual', 'business_annual']);
const TRIAL_PLAN_ID = 'trial';

// Internal compatibility IDs: recognised raw values that resolve to a
// public base plan's entitlements but are never sold or shown as a plan.
// 'enterprise' = pre-launch dev/test accounts bumped past free-tier limits.
const INTERNAL_PLAN_ALIASES = Object.freeze({
  enterprise: 'business',
});

// Paid plan IDs that can be bought through Stripe Checkout.
const PURCHASABLE_PLAN_IDS = Object.freeze([
  'starter', 'pro', 'business',
  'starter_annual', 'pro_annual', 'business_annual',
]);

// Plan IDs a NEW customer can buy through Stripe Checkout today. Business
// stays purchasable in the model (existing subscriptions keep their price
// mapping and entitlements) but is "coming soon" for new purchases.
const PUBLIC_CHECKOUT_PLAN_IDS = Object.freeze([
  'starter', 'starter_annual', 'pro', 'pro_annual',
]);

// ── Entitlements ────────────────────────────────────────────
// Keys:
//   basicQrLimit     basic (non-AI) QR codes; null = unlimited
//   smartPageLimit   ONE shared limit for Smart QR pages (AI QR records and
//                    landing pages alike); null = unlimited
//   dynamicQr        dynamic QR destinations
//   push             push notifications
//   walletPasses     canonical POST /pass/create entitlement only. Loyalty
//                    and Wallet Studio flows are NOT gated by this.
//   walletPassLimit  pass count limit when walletPasses is true
//   campaigns        DEFINITION ONLY — not enforced server-side yet
//   aiVoice          DEFINITION ONLY — not enforced server-side yet
//   aiChat           AI chat assistant (mirrors the current frontend gate)
//   analytics        mirrors the current tierSystem flag; no server-side
//                    analytics enforcement exists or is introduced here
//   smartDashboard   Smart QR dashboard access (current tierSystem flag)
const ENTITLEMENTS = Object.freeze({
  free: Object.freeze({
    basicQrLimit: null, smartPageLimit: 0, dynamicQr: false, push: false,
    walletPasses: false, walletPassLimit: 0, campaigns: false, aiVoice: false,
    aiChat: false, analytics: false, smartDashboard: false,
  }),
  trial: Object.freeze({
    basicQrLimit: null, smartPageLimit: 1, dynamicQr: false, push: false,
    walletPasses: false, walletPassLimit: 0, campaigns: false, aiVoice: false,
    aiChat: false, analytics: true, smartDashboard: true,
  }),
  starter: Object.freeze({
    basicQrLimit: null, smartPageLimit: 10, dynamicQr: false, push: true,
    walletPasses: false, walletPassLimit: 0, campaigns: false, aiVoice: false,
    aiChat: true, analytics: true, smartDashboard: true,
  }),
  pro: Object.freeze({
    basicQrLimit: null, smartPageLimit: null, dynamicQr: true, push: true,
    walletPasses: false, walletPassLimit: 0, campaigns: true, aiVoice: true,
    aiChat: true, analytics: true, smartDashboard: true,
  }),
  business: Object.freeze({
    basicQrLimit: null, smartPageLimit: null, dynamicQr: true, push: true,
    walletPasses: true, walletPassLimit: null, campaigns: true, aiVoice: true,
    aiChat: true, analytics: true, smartDashboard: true,
  }),
});

// ── Display pricing (EUR, per month) ────────────────────────
// annualMonthly = monthly-equivalent price when billed annually.
const DISPLAY_PRICES_EUR = Object.freeze({
  free:     Object.freeze({ monthly: 0,  annualMonthly: 0 }),
  starter:  Object.freeze({ monthly: 9,  annualMonthly: 7 }),
  pro:      Object.freeze({ monthly: 29, annualMonthly: 23 }),
  business: Object.freeze({ monthly: 49, annualMonthly: 39 }),
});

const PLAN_NAMES = Object.freeze({
  free: 'Free', starter: 'Starter', pro: 'Pro', business: 'Business', trial: 'Trial',
});

// ── Subscription-status policy ──────────────────────────────
// Only these statuses revoke paid entitlements. active, trialing,
// past_due (Stripe retry period) and a missing status keep them.
const REVOKING_SUBSCRIPTION_STATUSES = Object.freeze([
  'canceled', 'cancelled', 'unpaid', 'incomplete_expired',
]);

// ── Trial ───────────────────────────────────────────────────
const DEFAULT_TRIAL_DURATION_MS = 14 * DAY_MS;

// TRIAL_DURATION_MS stays supported as an explicit override (positive
// integer milliseconds). Anything else falls back to the 14-day default.
function getTrialDurationMs(env = process.env) {
  const raw = env && env.TRIAL_DURATION_MS;
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_TRIAL_DURATION_MS;
  const n = Number(String(raw).trim());
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TRIAL_DURATION_MS;
}

// ── Normalisation ───────────────────────────────────────────
// Describes a raw User.plan value without changing it.
//   id         lower-cased trimmed raw value ('free' when empty)
//   raw        the value exactly as given
//   base       entitlement base: free | starter | pro | business | trial
//   isAnnual   annual billing variant
//   isInternal internal compatibility alias (never sold)
//   isTrial    the application trial
//   known      false for unrecognised values (base falls back to 'free')
function normalizePlan(rawPlan) {
  const raw = rawPlan === undefined ? null : rawPlan;
  const id = typeof rawPlan === 'string' && rawPlan.trim() ? rawPlan.trim().toLowerCase() : 'free';
  const result = { raw, id, base: 'free', isAnnual: false, isInternal: false, isTrial: false, known: true };

  if (PUBLIC_BASE_PLANS.includes(id)) {
    result.base = id;
  } else if (ANNUAL_PLAN_IDS.includes(id)) {
    result.base = id.replace(/_annual$/, '');
    result.isAnnual = true;
  } else if (Object.prototype.hasOwnProperty.call(INTERNAL_PLAN_ALIASES, id)) {
    result.base = INTERNAL_PLAN_ALIASES[id];
    result.isInternal = true;
  } else if (id === TRIAL_PLAN_ID) {
    result.base = TRIAL_PLAN_ID;
    result.isTrial = true;
  } else {
    result.known = false;
  }
  return Object.freeze(result);
}

function isPaidBase(base) {
  return base === 'starter' || base === 'pro' || base === 'business';
}

// A recognised paid plan (monthly, annual or internal alias). Used to
// block an application trial from overwriting a paid plan.
function isRecognizedPaidPlan(rawPlan) {
  const p = normalizePlan(rawPlan);
  return p.known && isPaidBase(p.base);
}

// ── Effective plan ──────────────────────────────────────────
// Applies trial expiry and subscription-status policy to a user-like
// object { plan, subscriptionStatus, trialExpiresAt }.
//   effectiveBase  base whose entitlements apply right now
//   reason         why effectiveBase differs from plan.base (or 'plan')
function resolveEffectivePlan(user, now = new Date()) {
  const u = user || {};
  const plan = normalizePlan(u.plan);
  const status = typeof u.subscriptionStatus === 'string' && u.subscriptionStatus.trim()
    ? u.subscriptionStatus.trim().toLowerCase()
    : null;

  let effectiveBase = plan.base;
  let reason = 'plan';
  let isTrialExpired = false;
  let trialExpiresAt = null;

  if (!plan.known) {
    effectiveBase = 'free';
    reason = 'unknown_plan';
  } else if (plan.isTrial) {
    if (u.trialExpiresAt) {
      trialExpiresAt = new Date(u.trialExpiresAt);
      if (!(trialExpiresAt.getTime() > now.getTime())) {
        effectiveBase = 'free';
        reason = 'trial_expired';
        isTrialExpired = true;
      }
    }
  } else if (isPaidBase(plan.base) && status && REVOKING_SUBSCRIPTION_STATUSES.includes(status)) {
    effectiveBase = 'free';
    reason = 'subscription_' + (status === 'cancelled' ? 'canceled' : status);
  }

  return Object.freeze({
    plan,
    subscriptionStatus: status,
    effectiveBase,
    reason,
    isTrialExpired,
    trialExpiresAt,
  });
}

function getPlanEntitlements(base) {
  return ENTITLEMENTS[base] || ENTITLEMENTS.free;
}

function getEntitlements(user, now = new Date()) {
  return getPlanEntitlements(resolveEffectivePlan(user, now).effectiveBase);
}

// ── Limit helpers (null = unlimited) ────────────────────────
function assertLimit(limit) {
  if (limit === null) return;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new TypeError(`Invalid plan limit: ${limit}`);
  }
}

function assertCount(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError(`Invalid usage count: ${count}`);
  }
}

// True when one more item can be created at the given usage count.
function hasCapacity(limit, currentCount) {
  assertLimit(limit);
  assertCount(currentCount);
  if (limit === null) return true;
  return currentCount < limit;
}

// Remaining items before the limit; null when unlimited.
function remainingCapacity(limit, currentCount) {
  assertLimit(limit);
  assertCount(currentCount);
  if (limit === null) return null;
  return Math.max(0, limit - currentCount);
}

// ── Stripe price mapping (pure; no Stripe calls) ────────────
const STRIPE_PRICE_ENV_VARS = Object.freeze({
  starter:         'STRIPE_PRICE_STARTER',
  pro:             'STRIPE_PRICE_PRO',
  business:        'STRIPE_PRICE_BUSINESS',
  starter_annual:  'STRIPE_PRICE_STARTER_ANNUAL',
  pro_annual:      'STRIPE_PRICE_PRO_ANNUAL',
  business_annual: 'STRIPE_PRICE_BUSINESS_ANNUAL',
});

function isPurchasable(planId) {
  return typeof planId === 'string' && PURCHASABLE_PLAN_IDS.includes(planId);
}

// True only for plans a new customer may check out now (see above).
function isPublicCheckoutPlan(planId) {
  return isPurchasable(planId) && PUBLIC_CHECKOUT_PLAN_IDS.includes(planId);
}

function stripePriceEnvVar(planId) {
  return isPurchasable(planId) ? STRIPE_PRICE_ENV_VARS[planId] : null;
}

function readEnvPrice(env, name) {
  const v = env && env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// Configured Stripe Price ID for a purchasable plan, or null. No silent
// annual→monthly fallback: an unset annual price is reported as unset.
function stripePriceIdForPlan(planId, env = process.env) {
  const name = stripePriceEnvVar(planId);
  return name ? readEnvPrice(env, name) : null;
}

// Reverse map Price ID → plan ID. Unset/empty variables are skipped, so no
// 'undefined' key can exist. If one Price ID is configured for several
// plans, the monthly plan (listed first) wins.
function buildStripePriceToPlanMap(env = process.env) {
  const map = new Map();
  for (const planId of PURCHASABLE_PLAN_IDS) {
    const priceId = readEnvPrice(env, STRIPE_PRICE_ENV_VARS[planId]);
    if (priceId && !map.has(priceId)) map.set(priceId, planId);
  }
  return map;
}

function planIdForStripePrice(priceId, env = process.env) {
  if (typeof priceId !== 'string' || !priceId.trim()) return null;
  return buildStripePriceToPlanMap(env).get(priceId.trim()) || null;
}

// ── Public plan catalogue (pure; safe to expose publicly) ──────────────
// The single catalogue used by both the public homepage (GET /public/plans)
// and Admin Billing (GET /stripe/status). Public base plans only — never
// trial or internal aliases — with display prices and enforced limits.
// Checkout plan IDs are listed only where a new customer can buy the plan;
// a paid plan without any is "comingSoon".
function getPublicPlanCatalogue() {
  return PUBLIC_BASE_PLANS.map((id) => {
    const entitlements = getPlanEntitlements(id);
    const price = DISPLAY_PRICES_EUR[id];
    const annualId = `${id}_annual`;
    const monthlyCheckout = isPublicCheckoutPlan(id) ? id : null;
    const annualCheckout = isPublicCheckoutPlan(annualId) ? annualId : null;
    return {
      id,
      name: PLAN_NAMES[id],
      currency: 'EUR',
      monthlyPrice: price.monthly,
      annualMonthlyPrice: price.annualMonthly,
      smartPageLimit: entitlements.smartPageLimit, // null = unlimited
      basicQrLimit: entitlements.basicQrLimit,     // null = unlimited
      dynamicQr: entitlements.dynamicQr,
      checkoutPlans: {
        monthly: monthlyCheckout,
        annual: annualCheckout,
      },
      comingSoon: isPaidBase(id) && !monthlyCheckout && !annualCheckout,
    };
  });
}

module.exports = {
  // IDs
  PUBLIC_BASE_PLANS,
  ANNUAL_PLAN_IDS,
  TRIAL_PLAN_ID,
  INTERNAL_PLAN_ALIASES,
  PURCHASABLE_PLAN_IDS,
  PUBLIC_CHECKOUT_PLAN_IDS,
  // Entitlements & metadata
  ENTITLEMENTS,
  DISPLAY_PRICES_EUR,
  PLAN_NAMES,
  REVOKING_SUBSCRIPTION_STATUSES,
  // Trial
  DEFAULT_TRIAL_DURATION_MS,
  getTrialDurationMs,
  // Resolution
  normalizePlan,
  isRecognizedPaidPlan,
  resolveEffectivePlan,
  getPlanEntitlements,
  getEntitlements,
  // Limits
  hasCapacity,
  remainingCapacity,
  // Stripe mapping
  STRIPE_PRICE_ENV_VARS,
  isPurchasable,
  isPublicCheckoutPlan,
  stripePriceEnvVar,
  stripePriceIdForPlan,
  buildStripePriceToPlanMap,
  planIdForStripePrice,
  // Public catalogue
  getPublicPlanCatalogue,
};
