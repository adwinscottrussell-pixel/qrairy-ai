// customerQueryService.js — Canonical Customer Foundation, Phase 4.
//
// The only place that queries Customer/CustomerIdentity/LoyaltyCustomer/
// Pass/PassDevice for the read API. Every function is tenant-scoped by
// ownerUserId — never by slug, email, or cid alone (see
// docs/architecture/CUSTOMER_FOUNDATION.md). Batches related lookups
// (identities, loyalty, wallet installs) in a handful of queries
// regardless of page size, instead of one query per row.

const prisma = require('../utils/prismaClient');
const dto = require('./customerDtoService');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_STATUSES = ['active'];

function clampPagination(page, limit) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  return { page: p, limit: l };
}

// Batch-fetch every CustomerIdentity for a set of Customer ids in one
// query, grouped by customerId. Used by both list and detail so channel/
// loyalty derivation never runs a query per row.
async function fetchIdentitiesForCustomers(customerIds) {
  if (!customerIds.length) return new Map();
  const identities = await prisma.customerIdentity.findMany({
    where: { customerId: { in: customerIds } },
    select: { customerId: true, type: true, value: true, source: true, slug: true, createdAt: true, lastSeenAt: true },
  });
  return dto.groupIdentitiesByCustomer(identities);
}

// Composite key helper. LoyaltyCustomer.customerId (the legacy cid) is
// only unique per-slug (`@@unique([slug, customerId])`), NOT globally —
// cid is a shared-browser token with no tenant awareness at generation
// time (see docs/architecture/CUSTOMER_FOUNDATION.md), so the exact same
// cid string can legitimately belong to two different businesses'
// LoyaltyCustomer rows under two different slugs. Keying lookups by raw
// cid value alone would let one tenant's loyalty data overwrite/leak into
// another's map entry for a colliding cid. `slug` IS safe to key on
// because LandingPage.slug is globally unique, so (slug, cid) uniquely
// identifies one real LoyaltyCustomer row across the whole platform.
function loyaltyKey(slug, cid) { return slug + '|' + cid; }

// Batch-fetch LoyaltyCustomer rows for a set of (slug, cid) identity
// pairs, keyed by the composite (slug, cid) — never by cid alone. One
// query regardless of page size. Identities with no slug context cannot
// be safely resolved to a tenant-scoped LoyaltyCustomer row and are
// skipped rather than matched by cid alone.
async function fetchLoyaltyByIdentityPairs(cidIdentities) {
  const map = new Map();
  const pairs = cidIdentities.filter((i) => i.slug && i.value);
  if (!pairs.length) return map;

  const rows = await prisma.loyaltyCustomer.findMany({
    where: { OR: pairs.map((p) => ({ slug: p.slug, customerId: p.value })) },
    select: { customerId: true, slug: true, stampCount: true, totalStamps: true, rewardsEarned: true, rewardReady: true, lastStampAt: true, createdAt: true },
  });
  const slugs = Array.from(new Set(rows.map((r) => r.slug)));
  const settings = slugs.length
    ? await prisma.stampSettings.findMany({ where: { slug: { in: slugs } }, select: { slug: true, goal: true } })
    : [];
  const goalBySlug = new Map(settings.map((s) => [s.slug, s.goal]));
  for (const row of rows) {
    map.set(loyaltyKey(row.slug, row.customerId), { ...row, stampGoal: goalBySlug.get(row.slug) ?? 10 });
  }
  return map;
}

// Batch-check "real wallet install" (a PassDevice registration exists) for
// a set of wallet_serial values, in one query. Never reverse-parses
// serialNumber — looks it up directly by the exact stored value.
async function fetchWalletInstalledBySerial(serialValues) {
  const map = new Map();
  if (!serialValues.length) return map;
  const passes = await prisma.pass.findMany({
    where: { serialNumber: { in: serialValues } },
    select: { serialNumber: true, devices: { select: { id: true }, take: 1 } },
  });
  for (const p of passes) map.set(p.serialNumber, p.devices.length > 0);
  return map;
}

// Same composite-key rule as loyaltyKey() — never key a WebPushSubscription
// lookup by raw cid alone (see that function's comment for why).
function webPushKey(slug, cid) { return slug + '|' + cid; }

// Batch-check WebPushSubscription existence for a set of (slug, cid)
// identity pairs, keyed by the same composite (slug, cid) convention as
// loyaltyKey() — never by cid alone. cid is a shared-browser token with no
// tenant awareness at generation time, so the exact same cid string can
// legitimately belong to a different tenant's WebPushSubscription row under
// a different slug; matching by cid alone would let that other tenant's
// subscription make this Customer appear push-subscribed. Rows with a null
// cid are excluded by the query itself and can never match.
async function fetchWebPushSubscribedByIdentityPairs(cidIdentities) {
  const set = new Set();
  const pairs = cidIdentities.filter((i) => i.slug && i.value);
  if (!pairs.length) return set;

  const rows = await prisma.webPushSubscription.findMany({
    where: { cid: { not: null }, OR: pairs.map((p) => ({ slug: p.slug, cid: p.value })) },
    select: { slug: true, cid: true },
  });
  for (const row of rows) set.add(webPushKey(row.slug, row.cid));
  return set;
}

async function hydrateRelated(customers) {
  const customerIds = customers.map((c) => c.id);
  const identitiesByCustomer = await fetchIdentitiesForCustomers(customerIds);
  const allIdentities = Array.from(identitiesByCustomer.values()).flat();
  const cidIdentities = allIdentities.filter((i) => i.type === 'cid');
  const walletSerials = Array.from(new Set(allIdentities.filter((i) => i.type === 'wallet_serial').map((i) => i.value)));
  const [loyaltyByIdentity, walletInstalledBySerial, webPushSubscribedPairs] = await Promise.all([
    fetchLoyaltyByIdentityPairs(cidIdentities),
    fetchWalletInstalledBySerial(walletSerials),
    fetchWebPushSubscribedByIdentityPairs(cidIdentities),
  ]);
  return { identitiesByCustomer, loyaltyByIdentity, walletInstalledBySerial, webPushSubscribedPairs };
}

// Resolves a segment filter to an extra Prisma `where` fragment. Channel
// segments map directly to a relation filter (`some`); `reward_ready`
// needs a pre-resolved id set because LoyaltyCustomer has no FK to
// Customer (by design — see Phase 1). `most_engaged` has no defined
// formula anywhere in this codebase and is intentionally NOT a supported
// filter value (see docs/architecture/CUSTOMER_FOUNDATION.md Phase 4).
async function resolveSegmentWhere(ownerUserId, segment) {
  switch (segment) {
    case 'email': return { identities: { some: { type: 'email' } } };
    case 'push': {
      // push_endpoint kept as an OR'd compatibility fallback (see
      // fetchWebPushSubscribedByIdentityPairs's comment) — WebPushSubscription
      // via resolveWebPushCustomerIds is the real, current source of truth.
      const ids = await resolveWebPushCustomerIds(ownerUserId);
      return { OR: [{ identities: { some: { type: 'push_endpoint' } } }, { id: { in: ids } }] };
    }
    case 'wallet': return { identities: { some: { type: 'wallet_serial' } } };
    case 'loyalty': {
      const ids = await resolveLoyaltyCustomerIds(ownerUserId);
      return { id: { in: ids } };
    }
    case 'reward_ready': {
      const ids = await resolveRewardReadyCustomerIds(ownerUserId);
      return { id: { in: ids } };
    }
    case 'inactive': {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return { OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: cutoff } }] };
    }
    default:
      return {};
  }
}

// cid identities -> LoyaltyCustomer membership -> back to Customer.id.
// Two bounded queries (not per-row). Matches by the composite (slug, cid)
// key, never by cid alone — see loyaltyKey()'s comment: the same raw cid
// value can legitimately belong to a different tenant's LoyaltyCustomer
// row under a different slug, and matching by cid alone would count that
// other tenant's membership as this owner's.
async function resolveLoyaltyCustomerIds(ownerUserId, rewardReadyOnly) {
  const cidIdentities = await prisma.customerIdentity.findMany({
    where: { ownerUserId, type: 'cid', slug: { not: null } },
    select: { customerId: true, value: true, slug: true },
  });
  if (!cidIdentities.length) return [];
  const keyToCustomer = new Map(cidIdentities.map((i) => [loyaltyKey(i.slug, i.value), i.customerId]));
  const memberships = await prisma.loyaltyCustomer.findMany({
    where: {
      OR: cidIdentities.map((i) => ({ slug: i.slug, customerId: i.value })),
      ...(rewardReadyOnly ? { rewardReady: true } : {}),
    },
    select: { customerId: true, slug: true },
  });
  return Array.from(new Set(
    memberships.map((m) => keyToCustomer.get(loyaltyKey(m.slug, m.customerId))).filter(Boolean)
  ));
}

async function resolveRewardReadyCustomerIds(ownerUserId) {
  return resolveLoyaltyCustomerIds(ownerUserId, true);
}

// cid identities -> WebPushSubscription -> back to Customer.id. Same shape
// and same collision-safety reasoning as resolveLoyaltyCustomerIds(): two
// bounded queries, matched by the composite (slug, cid) key via
// webPushKey(), never by cid alone.
async function resolveWebPushCustomerIds(ownerUserId) {
  const cidIdentities = await prisma.customerIdentity.findMany({
    where: { ownerUserId, type: 'cid', slug: { not: null } },
    select: { customerId: true, value: true, slug: true },
  });
  if (!cidIdentities.length) return [];
  const keyToCustomer = new Map(cidIdentities.map((i) => [webPushKey(i.slug, i.value), i.customerId]));
  const subscriptions = await prisma.webPushSubscription.findMany({
    where: { cid: { not: null }, OR: cidIdentities.map((i) => ({ slug: i.slug, cid: i.value })) },
    select: { slug: true, cid: true },
  });
  return Array.from(new Set(
    subscriptions.map((s) => keyToCustomer.get(webPushKey(s.slug, s.cid))).filter(Boolean)
  ));
}

async function listCustomers({ ownerUserId, page, limit, search, segment, status }) {
  const { page: p, limit: l } = clampPagination(page, limit);
  const statuses = status ? [status] : DEFAULT_STATUSES;

  const where = { ownerUserId, status: { in: statuses } };
  if (search) {
    where.OR = [
      { displayName: { contains: search, mode: 'insensitive' } },
      { identities: { some: { type: 'email', value: { contains: search, mode: 'insensitive' } } } },
    ];
  }
  if (segment) {
    Object.assign(where, await resolveSegmentWhere(ownerUserId, segment));
  }

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { lastActivityAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);

  const { identitiesByCustomer, loyaltyByIdentity, walletInstalledBySerial, webPushSubscribedPairs } = await hydrateRelated(customers);

  return {
    items: customers.map((c) => dto.toListItemDto(c, identitiesByCustomer, loyaltyByIdentity, walletInstalledBySerial, webPushSubscribedPairs)),
    page: p,
    limit: l,
    total,
    totalPages: Math.max(1, Math.ceil(total / l)),
    hasNext: p * l < total,
  };
}

// Single filtered query — ownership is part of the WHERE clause itself,
// not a find-then-compare. A Customer belonging to a different owner (or
// not existing at all) both resolve to `null` here, so the controller can
// return an identical 404 either way — never confirming existence of
// another tenant's Customer id.
async function getCustomerDetail({ ownerUserId, customerId }) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ownerUserId } });
  if (!customer) return null;

  const identities = await prisma.customerIdentity.findMany({
    where: { customerId: customer.id },
    select: { customerId: true, type: true, value: true, source: true, slug: true, createdAt: true, lastSeenAt: true },
  });
  const cidIdentities = identities.filter((i) => i.type === 'cid');
  const walletSerials = Array.from(new Set(identities.filter((i) => i.type === 'wallet_serial').map((i) => i.value)));
  const [loyaltyByIdentity, walletInstalledBySerial, webPushSubscribedPairs] = await Promise.all([
    fetchLoyaltyByIdentityPairs(cidIdentities),
    fetchWalletInstalledBySerial(walletSerials),
    fetchWebPushSubscribedByIdentityPairs(cidIdentities),
  ]);

  return dto.toDetailDto(customer, identities, loyaltyByIdentity, walletInstalledBySerial, webPushSubscribedPairs);
}

async function getCustomerActivity({ ownerUserId, customerId }) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ownerUserId }, select: { id: true } });
  if (!customer) return null;

  const identities = await prisma.customerIdentity.findMany({
    where: { customerId: customer.id },
    select: { type: true, source: true, createdAt: true },
  });
  return dto.toActivityDto(identities);
}

// Summary counts. Each metric is a distinct-Customer count, not a raw
// identity-row count (see docs/architecture/CUSTOMER_FOUNDATION.md Phase
// 4 for why `loyaltyCustomers` cannot just be "has a cid identity" — cid
// is shared by push/wallet/loyalty flows, so it needs the same
// cid->LoyaltyCustomer resolution the `loyalty` segment filter uses).
async function getCustomerSummary({ ownerUserId }) {
  const [totalCustomers, emailCustomers, walletCustomers, loyaltyCustomerIds, webPushCustomerIds] = await Promise.all([
    prisma.customer.count({ where: { ownerUserId, status: 'active' } }),
    prisma.customer.count({ where: { ownerUserId, status: 'active', identities: { some: { type: 'email' } } } }),
    prisma.customer.count({ where: { ownerUserId, status: 'active', identities: { some: { type: 'wallet_serial' } } } }),
    resolveLoyaltyCustomerIds(ownerUserId),
    resolveWebPushCustomerIds(ownerUserId),
  ]);

  const [loyaltyCustomers, pushCustomers] = await Promise.all([
    loyaltyCustomerIds.length
      ? prisma.customer.count({ where: { id: { in: loyaltyCustomerIds }, ownerUserId, status: 'active' } })
      : 0,
    // push_endpoint kept as an OR'd compatibility fallback, same as the
    // 'push' segment above — WebPushSubscription is the real source of truth.
    prisma.customer.count({
      where: {
        ownerUserId,
        status: 'active',
        OR: [{ identities: { some: { type: 'push_endpoint' } } }, { id: { in: webPushCustomerIds } }],
      },
    }),
  ]);

  return { totalCustomers, emailCustomers, pushCustomers, walletCustomers, loyaltyCustomers };
}

// Distinct canonical Customer count per slug, tenant-scoped, for Analytics'
// per-page display (see docs/architecture/CUSTOMER_FOUNDATION.md). Grouped
// by CustomerIdentity.slug (the identity's own first-touch page context) —
// never by cid/email alone, so cross-tenant collision is structurally
// impossible (the initial query is already ownerUserId-scoped). A Customer
// with multiple identities on the SAME slug counts once (deduped via Set).
// A Customer known on two DIFFERENT slugs for the same owner legitimately
// counts once on EACH of those slugs' rows — each identity's own slug is
// its own first-touch context; this is the existing Phase 1 slug semantic,
// not a new relationship model. Slugs with no `LandingPage` (e.g. legacy
// bare QR codes, which Customer Foundation has no linkage to at all) are
// simply absent from the returned map — callers must treat a missing key
// as "not yet attributable", not zero, since zero would falsely imply
// Customer Foundation ran and found none.
async function getCustomerCountsBySlug({ ownerUserId, slugs }) {
  const map = new Map();
  if (!slugs.length) return map;
  const identities = await prisma.customerIdentity.findMany({
    where: { ownerUserId, slug: { in: slugs } },
    select: { slug: true, customerId: true },
  });
  const bySlug = new Map();
  for (const i of identities) {
    if (!bySlug.has(i.slug)) bySlug.set(i.slug, new Set());
    bySlug.get(i.slug).add(i.customerId);
  }
  for (const [slug, set] of bySlug) map.set(slug, set.size);
  return map;
}

// Cumulative canonical Customer count per day, tenant-scoped, for the
// trailing `days` days (index 0 = oldest, last index = today) — "cumulative"
// means the true as-of-that-day total (every Customer whose firstSeenAt is
// on or before that day), matching Customer.firstSeenAt as the established
// Phase 1 creation timestamp, not a synthetic/estimated distribution. Two
// bounded queries regardless of `days` size.
async function getCustomerGrowthSeries({ ownerUserId, days }) {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - (days - 1));

  const [totalBeforeWindow, withinWindow] = await Promise.all([
    prisma.customer.count({ where: { ownerUserId, status: 'active', firstSeenAt: { lt: windowStart } } }),
    prisma.customer.findMany({
      where: { ownerUserId, status: 'active', firstSeenAt: { gte: windowStart } },
      select: { firstSeenAt: true },
    }),
  ]);

  const perDay = new Array(days).fill(0);
  for (const c of withinWindow) {
    const dayIndex = Math.floor((new Date(c.firstSeenAt).getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000));
    if (dayIndex >= 0 && dayIndex < days) perDay[dayIndex]++;
  }

  let running = totalBeforeWindow;
  return perDay.map((c) => (running += c));
}

module.exports = {
  getCustomerCountsBySlug,
  getCustomerGrowthSeries,
  listCustomers,
  getCustomerDetail,
  getCustomerActivity,
  getCustomerSummary,
};
