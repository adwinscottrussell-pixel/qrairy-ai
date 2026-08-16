// customerDtoService.js — Canonical Customer Foundation, Phase 4.
//
// Pure DTO-shaping functions. No Prisma calls here — every function takes
// already-fetched data and returns a plain object. This is what keeps the
// same channel/loyalty/status derivation rules identical across the list,
// detail, and summary endpoints instead of duplicating them per route.
//
// Never returns raw CustomerIdentity values (cid, push endpoint, wallet
// serial, email is the one deliberate exception — see README below) to a
// list/detail caller directly; only derived booleans/snapshots.
//
// Email is the one identity value this module DOES expose (as
// `channels.email.address` / detail `primaryEmail`) — the approved
// Customers UI displays it directly, and the authenticated business owner
// is entitled to see their own customer's contact email. cid, push
// endpoint, and wallet serial are never exposed; they are internal
// linkage keys, not business-facing information.

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function groupIdentitiesByCustomer(identities) {
  const map = new Map();
  for (const identity of identities) {
    if (!map.has(identity.customerId)) map.set(identity.customerId, []);
    map.get(identity.customerId).push(identity);
  }
  return map;
}

// channels.email: `known` (an email identity exists) vs `marketingAllowed`
// (deliberately null — see docs/architecture/CUSTOMER_FOUNDATION.md Phase 4:
// CustomerConsent has no deterministic Customer linkage yet, so this can
// never be safely computed as true/false. null means "not determinable",
// never "declined").
// channels.push: `push_endpoint` identity presence, OR'd with a direct
// WebPushSubscription lookup keyed by this Customer's own (slug, cid) pairs
// — the same composite-key rule as loyaltyKey()/loyaltyMembershipsFor()
// (cid is a shared-browser token with no tenant awareness at generation
// time, so it is never safe to match by cid alone). No live write path
// creates `push_endpoint` identities today (only the Phase 3 backfill,
// not yet run, would), so in practice this is currently driven entirely by
// the WebPushSubscription lookup; the identity check is kept so a future
// backfill or a `push_endpoint`-writing hook doesn't silently regress this.
// channels.wallet: `passExists` (a wallet_serial identity exists) vs
// `installed` (a real PassDevice registration was found for that serial —
// the only genuine "added to wallet" signal in the schema; Pass existing
// alone only proves a pass was generated, not that it was installed).
function deriveChannels(identitiesForCustomer, walletInstalledBySerial, webPushSubscribedPairs) {
  const byType = { email: [], push_endpoint: [], wallet_serial: [], cid: [] };
  for (const identity of identitiesForCustomer) {
    if (byType[identity.type]) byType[identity.type].push(identity);
  }

  const emailIdentity = byType.email[0] || null;
  const walletSerials = byType.wallet_serial.map((i) => i.value);
  const installed = walletSerials.some((serial) => walletInstalledBySerial.get(serial) === true);
  const hasWebPushSubscription = byType.cid.some(
    (i) => i.slug && webPushSubscribedPairs && webPushSubscribedPairs.has(i.slug + '|' + i.value)
  );

  return {
    email: {
      known: byType.email.length > 0,
      address: emailIdentity ? emailIdentity.value : null,
      marketingAllowed: null, // not determinable — see module comment
    },
    push: {
      subscribed: byType.push_endpoint.length > 0 || hasWebPushSubscription,
    },
    wallet: {
      passExists: byType.wallet_serial.length > 0,
      installed,
    },
  };
}

// Multi-membership rule (documented, not silent — see
// docs/architecture/CUSTOMER_FOUNDATION.md Phase 4): a Customer can have
// more than one `cid` identity (e.g. LoyaltyCustomerAlias convergence),
// and each cid may independently be a LoyaltyCustomer row. The list DTO
// flattens to the MOST RECENTLY ACTIVE membership (by lastStampAt, falling
// back to createdAt) for a simple table cell. The detail DTO instead
// returns every membership as a structured array — never silently drops
// the others.
function pickMostRecentLoyaltyMembership(memberships) {
  if (!memberships.length) return null;
  return memberships.slice().sort((a, b) => {
    const at = a.lastStampAt ? new Date(a.lastStampAt).getTime() : new Date(a.createdAt).getTime();
    const bt = b.lastStampAt ? new Date(b.lastStampAt).getTime() : new Date(b.createdAt).getTime();
    return bt - at;
  })[0];
}

function loyaltyMembershipToDto(m) {
  return {
    slug: m.slug,
    enrolled: true,
    stampCount: m.stampCount,
    stampGoal: m.stampGoal,
    totalStamps: m.totalStamps,
    rewardsEarned: m.rewardsEarned,
    rewardReady: m.rewardReady,
    lastStampAt: m.lastStampAt,
  };
}

function deriveLoyaltySnapshot(memberships) {
  if (!memberships.length) return { enrolled: false };
  const best = pickMostRecentLoyaltyMembership(memberships);
  return loyaltyMembershipToDto(best);
}

function deriveLoyaltyMemberships(memberships) {
  return memberships.map(loyaltyMembershipToDto);
}

function anyRewardReady(memberships) {
  return memberships.some((m) => m.rewardReady === true);
}

// Presentation status: a UI-facing computed label, deliberately separate
// from Customer.status (the canonical lifecycle field — active | merged |
// anonymized | deleted). Never written back to the database; recomputed
// on every read. See docs/architecture/CUSTOMER_FOUNDATION.md Phase 4.
function derivePresentationStatus(customer, loyaltyMemberships) {
  if (customer.status !== 'active') return customer.status; // merged/anonymized/deleted pass through as-is

  if (anyRewardReady(loyaltyMemberships)) return 'reward_ready';

  const now = Date.now();
  const lastActivity = customer.lastActivityAt ? new Date(customer.lastActivityAt).getTime() : null;
  if (lastActivity === null || now - lastActivity > THIRTY_DAYS_MS) return 'inactive';

  const firstSeen = customer.firstSeenAt ? new Date(customer.firstSeenAt).getTime() : null;
  if (firstSeen !== null && now - firstSeen < SEVEN_DAYS_MS) return 'new';

  return 'active';
}

// Same composite-key rule as customerQueryService.js's loyaltyKey(): a
// raw cid value alone is not tenant-safe to look up with (see that
// module's comment) — `loyaltyByIdentity` is keyed by `slug|cid`.
function loyaltyMembershipsFor(identities, loyaltyByIdentity) {
  return identities
    .filter((i) => i.type === 'cid' && i.slug)
    .map((i) => loyaltyByIdentity.get(i.slug + '|' + i.value))
    .filter(Boolean);
}

function toListItemDto(customer, identitiesByCustomer, loyaltyByIdentity, walletInstalledBySerial, webPushSubscribedPairs) {
  const identities = identitiesByCustomer.get(customer.id) || [];
  const channels = deriveChannels(identities, walletInstalledBySerial, webPushSubscribedPairs);
  const loyaltyMemberships = loyaltyMembershipsFor(identities, loyaltyByIdentity);

  return {
    id: customer.id,
    displayName: customer.displayName,
    email: channels.email.address,
    channels: {
      email: channels.email.known,
      push: channels.push.subscribed,
      wallet: channels.wallet.passExists,
    },
    loyalty: deriveLoyaltySnapshot(loyaltyMemberships),
    status: customer.status,
    presentationStatus: derivePresentationStatus(customer, loyaltyMemberships),
    firstSeenAt: customer.firstSeenAt,
    lastActivityAt: customer.lastActivityAt,
    source: customer.source,
  };
}

function toDetailDto(customer, identities, loyaltyByIdentity, walletInstalledBySerial, webPushSubscribedPairs) {
  const channels = deriveChannels(identities, walletInstalledBySerial, webPushSubscribedPairs);
  const loyaltyMemberships = loyaltyMembershipsFor(identities, loyaltyByIdentity);
  const slugsSeen = Array.from(new Set(identities.map((i) => i.slug).filter(Boolean)));
  const sortedByFirstSeen = identities.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const firstSourceSlug = sortedByFirstSeen.length ? sortedByFirstSeen[0].slug : customer.slug;
  const lastSourceSlug = identities.length
    ? identities.slice().sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))[0].slug
    : customer.slug;

  return {
    id: customer.id,
    displayName: customer.displayName,
    primaryEmail: channels.email.address,
    firstSeenAt: customer.firstSeenAt,
    lastActivityAt: customer.lastActivityAt,
    status: customer.status,
    presentationStatus: derivePresentationStatus(customer, loyaltyMemberships),
    source: customer.source,
    channels,
    loyalty: {
      enrolled: loyaltyMemberships.length > 0,
      memberships: deriveLoyaltyMemberships(loyaltyMemberships),
    },
    pageContext: {
      firstSourceSlug: firstSourceSlug || null,
      lastSourceSlug: lastSourceSlug || null,
      pageCount: slugsSeen.length,
    },
  };
}

function toActivityDto(identities) {
  const LABELS = {
    cid: 'First seen',
    email: 'Email identity captured',
    push_endpoint: 'Subscribed to push notifications',
    wallet_serial: 'Wallet pass enrolled',
  };
  return identities
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((i) => ({
      type: i.type,
      source: i.source,
      occurredAt: i.createdAt,
      event: LABELS[i.type] || ('Identity captured: ' + i.type),
    }));
}

module.exports = {
  groupIdentitiesByCustomer,
  deriveChannels,
  deriveLoyaltySnapshot,
  deriveLoyaltyMemberships,
  derivePresentationStatus,
  anyRewardReady,
  toListItemDto,
  toDetailDto,
  toActivityDto,
};
