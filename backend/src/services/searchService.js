// ============================================================
// searchService.js — Universal Operations Search resolvers
// Per docs/architecture/QRAIVY_UNIVERSAL_OPERATIONS_SEARCH_v1.md §5/§6
// Phase 1: Users, Landing Pages (+ Businesses view), QR Codes,
// Subscribers, Wallet Passes. API Keys / Loyalty Customers excluded
// per §4/§6 Phase 4 (broken schema, fixed separately).
// ============================================================
const prisma = require('../utils/prismaClient');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MIN_FUZZY_LEN = 2;
const FETCH_MULTIPLIER = 5;
const MAX_FETCH = 50;
// Stops waiting on a resolver after this long and returns FAILED_GROUP instead.
// This does NOT cancel the underlying Prisma query — the query keeps running
// against the DB in the background; the timeout only stops the HTTP response
// from waiting on it. Kept because it bounds response latency, which is the
// property this endpoint actually needs.
const RESOLVER_TIMEOUT_MS = 3000;

// Same shape a genuine zero-result group returns, plus a safe (non-leaking)
// indicator so the caller can distinguish "nothing matched" from
// "this group's resolver failed or timed out" without exposing why.
const FAILED_GROUP = { items: [], total: 0, hasMore: false, error: 'unavailable' };

function classifyQuery(raw) {
  const q = String(raw || '').trim();
  return {
    q,
    isStripeCustomerId: q.startsWith('cus_'),
    fuzzyEligible: q.length >= MIN_FUZZY_LEN,
  };
}

// ── Masking (Search Result Privacy, §5) ───────────────────────
function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

function maskSerial(serial) {
  if (!serial) return null;
  const parts = serial.split('-');
  if (parts.length < 3) return `${serial.slice(0, 4)}***`;
  return `${parts[0]}-${parts[1]}-***-${parts[parts.length - 1]}`;
}

// ── Ranking (Result Ranking, §5) ──────────────────────────────
// 1 exact id, 2 exact slug/email/serial/external id, 3 prefix, 4 contains, 5 no match
function fieldRank(value, q) {
  if (value === undefined || value === null) return 5;
  const v = String(value).toLowerCase();
  const needle = q.toLowerCase();
  if (v === needle) return 2;
  if (v.startsWith(needle)) return 3;
  if (v.includes(needle)) return 4;
  return 5;
}

function bestRank(item, idFields, fuzzyFields, q) {
  for (const f of idFields) {
    if (item[f] !== undefined && item[f] !== null && String(item[f]) === q) return 1;
  }
  let best = 5;
  for (const f of fuzzyFields) best = Math.min(best, fieldRank(item[f], q));
  return best;
}

function sortByRank(items, rankFn, recencyField) {
  return items
    .map(item => ({ item, rank: rankFn(item) }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const ta = a.item[recencyField] ? new Date(a.item[recencyField]).getTime() : 0;
      const tb = b.item[recencyField] ? new Date(b.item[recencyField]).getTime() : 0;
      return tb - ta;
    })
    .map(x => x.item);
}

function fetchCap(limit) {
  return Math.min(Math.max(limit * FETCH_MULTIPLIER, 25), MAX_FETCH);
}

// Guards a resolver with a timeout AND catches late rejections, so a slow
// or failing resolver degrades to an empty group instead of ever surfacing
// an unhandled rejection or blocking the other groups.
function withTimeout(promise, ms, fallback) {
  const guarded = promise.catch(err => {
    console.error('[ops/search] resolver failed:', err.message);
    return fallback;
  });
  return Promise.race([
    guarded,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ── Per-entity resolvers ───────────────────────────────────────

async function resolveUsers(cls, limit) {
  const { q, isStripeCustomerId, fuzzyEligible } = cls;
  const or = [{ id: q }];
  if (isStripeCustomerId) or.push({ stripeCustomerId: q });
  if (fuzzyEligible) or.push({ email: { contains: q, mode: 'insensitive' } });

  const where = { OR: or };
  const cap = fetchCap(limit);

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      take: cap,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { qrs: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  const ranked = sortByRank(
    rows,
    item => bestRank(item, ['id', 'stripeCustomerId'], ['email'], q),
    'createdAt'
  ).slice(0, limit);

  return {
    items: ranked.map(u => ({
      id: u.id,
      email: maskEmail(u.email),
      phone: maskPhone(u.phone),
      plan: u.plan,
      qrCount: u._count.qrs,
      createdAt: u.createdAt,
    })),
    total,
    hasMore: total > limit,
  };
}

async function resolveLandingPages(cls, limit) {
  const { q, fuzzyEligible } = cls;
  // { id: q } is the internal-ID exact match (rank 1); { slug: q } is the
  // exact-slug match (rank 2, via fieldRank equality below) — kept as
  // separate tiers per §5 Result Ranking, not merged into one idFields tier.
  const or = [{ id: q }, { slug: q }];
  if (fuzzyEligible) {
    or.push({ businessName: { contains: q, mode: 'insensitive' } });
    or.push({ slug: { contains: q, mode: 'insensitive' } });
  }

  const where = { OR: or };
  const cap = fetchCap(limit);

  const [rows, total] = await Promise.all([
    prisma.landingPage.findMany({ where, take: cap, orderBy: { updatedAt: 'desc' } }),
    prisma.landingPage.count({ where }),
  ]);

  const ranked = sortByRank(
    rows,
    item => bestRank(item, ['id'], ['slug', 'businessName'], q),
    'updatedAt'
  ).slice(0, limit);

  return {
    items: ranked.map(lp => ({
      slug: lp.slug,
      businessName: lp.businessName,
      status: lp.status,
      // Landing Page visits (GET /lp/:slug page loads) — not QR scans.
      visitCount: lp.scanCount,
      updatedAt: lp.updatedAt,
    })),
    total,
    hasMore: total > limit,
  };
}

async function resolveQrCodes(cls, limit) {
  const { q, fuzzyEligible } = cls;
  const or = [{ id: q }];
  if (fuzzyEligible) or.push({ businessName: { contains: q, mode: 'insensitive' } });

  const where = { OR: or };
  const cap = fetchCap(limit);

  const [rows, total] = await Promise.all([
    prisma.qR.findMany({
      where,
      take: cap,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { scans: true } } },
    }),
    prisma.qR.count({ where }),
  ]);

  const ranked = sortByRank(
    rows,
    item => bestRank(item, ['id'], ['businessName'], q),
    'createdAt'
  ).slice(0, limit);

  return {
    items: ranked.map(qr => ({
      id: qr.id,
      businessName: qr.businessName,
      originalUrl: qr.originalUrl,
      isDynamic: qr.isDynamic,
      totalScans: qr._count.scans,
      createdAt: qr.createdAt,
    })),
    total,
    hasMore: total > limit,
  };
}

async function resolveSubscribers(cls, limit) {
  const { q, fuzzyEligible } = cls;
  const or = [{ id: q }, { slug: q }];
  if (fuzzyEligible) or.push({ email: { contains: q, mode: 'insensitive' } });

  const where = { OR: or };
  const cap = fetchCap(limit);

  const [rows, total] = await Promise.all([
    prisma.subscriber.findMany({ where, take: cap, orderBy: { subscribedAt: 'desc' } }),
    prisma.subscriber.count({ where }),
  ]);

  const ranked = sortByRank(
    rows,
    item => bestRank(item, ['id'], ['email', 'slug'], q),
    'subscribedAt'
  ).slice(0, limit);

  return {
    items: ranked.map(s => ({
      id: s.id,
      email: maskEmail(s.email),
      slug: s.slug,
      status: s.status,
      source: s.source,
      subscribedAt: s.subscribedAt,
    })),
    total,
    hasMore: total > limit,
  };
}

async function resolveWalletPasses(cls, limit) {
  const { q, fuzzyEligible } = cls;
  const or = [{ id: q }, { serialNumber: q }];
  if (fuzzyEligible) or.push({ serialNumber: { contains: q, mode: 'insensitive' } });

  const where = { OR: or };
  const cap = fetchCap(limit);

  const [rows, total] = await Promise.all([
    prisma.pass.findMany({ where, take: cap, orderBy: { updatedAt: 'desc' } }),
    prisma.pass.count({ where }),
  ]);

  const ranked = sortByRank(
    rows,
    item => bestRank(item, ['id', 'serialNumber'], ['serialNumber'], q),
    'updatedAt'
  ).slice(0, limit);

  return {
    items: ranked.map(p => ({
      id: p.id,
      serialNumber: maskSerial(p.serialNumber),
      slug: p.slug,
      stampCount: p.stampCount,
      stampGoal: p.stampGoal,
      rewardReady: p.rewardReady,
      lastStampAt: p.lastStampAt,
    })),
    total,
    hasMore: total > limit,
  };
}

async function search(rawQuery, rawLimit) {
  const start = Date.now();
  const cls = classifyQuery(rawQuery);
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const [users, landingPages, qrCodes, subscribers, walletPasses] = await Promise.all([
    withTimeout(resolveUsers(cls, limit), RESOLVER_TIMEOUT_MS, FAILED_GROUP),
    withTimeout(resolveLandingPages(cls, limit), RESOLVER_TIMEOUT_MS, FAILED_GROUP),
    withTimeout(resolveQrCodes(cls, limit), RESOLVER_TIMEOUT_MS, FAILED_GROUP),
    withTimeout(resolveSubscribers(cls, limit), RESOLVER_TIMEOUT_MS, FAILED_GROUP),
    withTimeout(resolveWalletPasses(cls, limit), RESOLVER_TIMEOUT_MS, FAILED_GROUP),
  ]);

  return {
    query: cls.q,
    tookMs: Date.now() - start,
    results: {
      // "Businesses" and "Landing Pages" are the same LandingPage-backed
      // resolver surfaced as two labeled groups — not two code paths.
      // Phase 1 dedup rule: 1:1 by slug, no other source merged in yet (§5).
      businesses: landingPages,
      landingPages,
      users,
      subscribers,
      walletPasses,
      qrCodes,
    },
  };
}

module.exports = { search, classifyQuery };
