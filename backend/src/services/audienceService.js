// ============================================================
// audienceService.js — Reusable customer/subscriber audience selection
// for AI Campaigns (Increase Visits / Reactivation / Reward Reminder /
// Reward Ready), designed to be reused by future SMS, Email, WhatsApp,
// and Wallet campaigns.
//
// Identity model: cid is QRAIVY's universal anonymous customer identifier
// (the "cTok" value set in localStorage, sent as req.body.cid). It links
// WebPushSubscription rows to LoyaltyCustomer rows for a given slug.
//
// Pass is intentionally excluded from cid-based audience selection.
// docs/QRAIVY_MASTER_ARCHITECTURE.md §5 documents two parallel, UNRECONCILED
// loyalty-tracking mechanisms: a single shared Pass row per slug
// ("sqr-{slug}", no customer id — the admin "one shared card" model) and
// per-customer LoyaltyCustomer rows (unique on slug+customerId). Pass has
// no cid/customerId column; the only way to recover one is reverse-parsing
// Pass.serialNumber ("sqr-{slug}-{cid}"), which lpController.js's own
// comment calls ambiguous because slugs themselves contain hyphens. A
// customer can exist in LoyaltyCustomer without a matching per-customer
// Pass row, or vice versa — joining through Pass would silently produce
// wrong or incomplete audiences. LoyaltyCustomer (real DB uniqueness
// constraint on slug+customerId) is the only source of loyalty truth this
// service uses. Wallet-channel audiences are a separate, future problem
// that requires solving that reconciliation first — not an extension of
// the methods here.
//
// Return-shape convention: the three cid-based methods
// (getReactivationAudience, getRewardReminderAudience,
// getRewardReadyAudience) return a channel-agnostic customer-audience
// record (cid/slug/loyalty snapshot) via toAudienceRecord() — not push
// subscriptions — so a future channel (Email/SMS/WhatsApp) can resolve
// the same audience against its own identity table. getVisitsAudience
// and resolveWebPushSubscriptions are the one channel-specific pair,
// returning raw WebPushSubscription rows, because "all subscribers" and
// "turn these cids into push endpoints" are inherently push-shaped.
// ============================================================
const prisma = require('../utils/prismaClient');

const DEFAULT_INACTIVE_DAYS = 14;
const DEFAULT_STAMPS_REMAINING = 2;

// Every public method is slug-scoped. Prisma treats `where: { slug: undefined }`
// as "no filter on this field", not "match nothing" — a caller bug that lets
// an undefined/empty slug through would silently return every subscriber or
// customer across every program in the database. Never let that happen.
function requireSlug(slug) {
  if (typeof slug !== 'string' || !slug.trim()) {
    throw new Error('AudienceService: slug is required');
  }
  return slug;
}

function toAudienceRecord(customer, goal) {
  return {
    cid: customer.customerId,
    slug: customer.slug,
    lastStampAt: customer.lastStampAt,
    stampCount: customer.stampCount,
    stampGoal: goal,
    stampsRemaining: goal != null ? Math.max(goal - customer.stampCount, 0) : null,
    rewardReady: customer.rewardReady,
  };
}

// ── 1. Increase Visits — all web push subscribers for a program ──────────
// Matches today's handleSendPush behavior (unfiltered). Named to match
// existing campaign terminology (dashboard.html's "boost"/Increase Visits
// trigger) rather than the more generic "all subscribers" — kept as-is
// for this milestone per founder direction.
async function getVisitsAudience(slug) {
  requireSlug(slug);
  return prisma.webPushSubscription.findMany({ where: { slug } });
}

// ── 2. Reactivation — inactive, previously-engaged customers ─────────────
// Milestone 2 scope: only customers who already have a LoyaltyCustomer
// record (i.e. have stamped at least once) and have gone quiet since.
// Subscribers linked by cid who have NEVER stamped (no LoyaltyCustomer row
// at all) are NOT returned here — Prisma can only query rows that exist,
// and a never-engaged subscriber has none. Including them requires a
// separate "subscription-first" audience query (all WebPushSubscription
// cids for the slug, minus cids present in LoyaltyCustomer) — intentionally
// out of scope for this milestone; tracked as a follow-up, not solved here.
async function getReactivationAudience(slug, { inactiveDays = DEFAULT_INACTIVE_DAYS } = {}) {
  requireSlug(slug);
  const threshold = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
  const customers = await prisma.loyaltyCustomer.findMany({
    where: { slug, lastStampAt: { lt: threshold } },
  });
  return customers.map((c) => toAudienceRecord(c, null));
}

// ── 3. Reward Reminder — customers close to their reward ─────────────────
async function getRewardReminderAudience(slug, { stampsRemaining = DEFAULT_STAMPS_REMAINING } = {}) {
  requireSlug(slug);
  const settings = await prisma.stampSettings.findUnique({ where: { slug } });
  // No usable loyalty config (missing, disabled, or a non-positive goal) —
  // return an empty audience rather than let a goal <= 0 collapse the
  // stampCount filter to "matches everyone" and silently broadcast.
  if (!settings || !settings.enabled || !(settings.goal > 0)) return [];
  const goal = settings.goal;
  const customers = await prisma.loyaltyCustomer.findMany({
    where: {
      slug,
      rewardReady: false,
      stampCount: { gte: Math.max(goal - stampsRemaining, 0) },
    },
  });
  return customers.map((c) => toAudienceRecord(c, goal));
}

// ── 4. Reward Ready — customers whose reward is already available ────────
async function getRewardReadyAudience(slug) {
  requireSlug(slug);
  const customers = await prisma.loyaltyCustomer.findMany({ where: { slug, rewardReady: true } });
  return customers.map((c) => toAudienceRecord(c, null));
}

// ── Channel resolver — turns a cid-based audience into push endpoints ────
// The one piece a future channel (Email/SMS/WhatsApp) implements for
// itself, reusing the same upstream audience-selection methods above.
async function resolveWebPushSubscriptions(slug, cids) {
  requireSlug(slug);
  const valid = (cids || []).filter(Boolean);
  if (!valid.length) return [];
  return prisma.webPushSubscription.findMany({ where: { slug, cid: { in: valid } } });
}

module.exports = {
  getVisitsAudience,
  getReactivationAudience,
  getRewardReminderAudience,
  getRewardReadyAudience,
  resolveWebPushSubscriptions,
};
