// Customer Foundation Phase 3 — deterministic historical backfill.
//
// Supersedes backfill-customer-foundation-phase1.js (untracked, dated
// 2026-08-11), which targeted the SUPERSEDED slug-anchored draft
// (customerChannel, customerRecordId FKs on legacy tables). That draft was
// never applied to production and is incompatible with the current schema.
// Do not run it. This script is a from-scratch replacement built on the
// committed Phase 1/2 foundation (commit 33bb5d5).
//
// Reuses the Phase 2 canonical service (customerIdentityService.js) as the
// ONLY thing that ever creates/resolves a Customer or CustomerIdentity row.
// This script contains no independent resolve/create logic of its own —
// it only decides WHICH legacy rows are deterministic enough to submit to
// that service, and never writes to any legacy table.
//
// Dry run by default (read-only, zero writes). Pass --apply to write.
// Idempotent: re-running (in either mode) after a successful --apply finds
// every identity already resolved and creates nothing further.
//
// Usage (local test DB only — see docs/architecture/CUSTOMER_FOUNDATION.md):
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/qraivy_phase1_test \
//     node backend/scripts/backfill-customer-foundation-phase3.js
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/qraivy_phase1_test \
//     node backend/scripts/backfill-customer-foundation-phase3.js --apply
//
// Source matrix (see docs/architecture/CUSTOMER_FOUNDATION.md, Phase 3):
//   LoyaltyCustomer        -> cid identity                  [backfill_loyalty_customer]
//   LoyaltyCustomerAlias   -> additional cid identity, same Customer as its
//                             parent LoyaltyCustomer (FK-deterministic)
//                                                            [backfill_loyalty_customer_alias]
//   WebPushSubscription    -> cid + push_endpoint identity, cid-present only
//                                                            [backfill_webpush]
//   Pass                   -> wallet_serial identity, loyaltyCustomerId-linked
//                             only. Never reverse-parses serialNumber.
//                                                            [backfill_pass]
//   Subscriber             -> email identity, slug-resolvable only. Never
//                             merged with any cid-based Customer.
//                                                            [backfill_subscriber_email]
//   Scan                   -> never processed (no identity signal on the row).
//   DealClaim              -> counted only, never linked (no live
//                             claim/redemption endpoint exists to supply
//                             deterministic proof — see checkDealClaims()).
//
// Tenant resolution is always slug -> LandingPage.userId, the same path
// Phase 2's live dual-writes use. A row with no slug, no matching
// LandingPage, or a LandingPage with a null userId is skipped and counted,
// never guessed.

const path = require('path');
const backendRoot = path.join(__dirname, '..');
const prisma = require(path.join(backendRoot, 'src', 'utils', 'prismaClient'));
const {
  resolveOrCreateCustomerIdentity,
  attachDeterministicIdentity,
} = require(path.join(backendRoot, 'src', 'services', 'customerIdentityService'));

const APPLY = process.argv.includes('--apply');

// Hard safety guard: this script must never run against anything but a
// local database. Parsed, not string-matched, so "localhost.evil.example"
// can't slip past a naive substring check.
function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL || '';
  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch (e) {
    console.error('[Phase3Backfill] DATABASE_URL is missing or unparseable. Refusing to run.');
    process.exit(1);
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  console.log('[Phase3Backfill] DATABASE_URL host:', host, '| database:', new URL(raw).pathname.replace(/^\//, ''));
  if (!isLocal) {
    console.error('[Phase3Backfill] DATABASE_URL host is NOT localhost/127.0.0.1. Refusing to run against a non-local database.');
    process.exit(1);
  }
}

// Deduplicated projection tracking for the dry-run summary: a Customer and
// a CustomerIdentity are created together exactly once per distinct
// (ownerUserId, type, value) triple, regardless of which source function
// discovers that triple first (e.g. LoyaltyCustomer and Pass deliberately
// resolve the SAME cid triple — Set dedup makes that converge into one
// projected Customer here too, matching what --apply would actually do).
const projection = { newCustomerKeys: new Set(), newIdentityKeys: new Set() };
function keyOf({ ownerUserId, type, value }) { return `${ownerUserId}|${type}|${value}`; }

function freshCounter() {
  return {
    scanned: 0,
    skippedNoSlug: 0,
    skippedNoLandingPage: 0,
    skippedNoOwner: 0,
    resolved: 0, // already existed, converged
    created: 0, // written this run (--apply only)
    wouldCreate: 0, // dry-run projection of `created`
    errors: 0,
  };
}

function resolveOwner(slug, slugOwnerMap, counter) {
  if (!slug) { counter.skippedNoSlug++; return null; }
  if (!slugOwnerMap.has(slug)) { counter.skippedNoLandingPage++; return null; }
  const owner = slugOwnerMap.get(slug);
  if (!owner) { counter.skippedNoOwner++; return null; }
  return owner;
}

function tally(counter, result) {
  if (result.error) { counter.errors++; return; }
  if (result.wouldCreate) { counter.wouldCreate++; return; }
  if (result.created) { counter.created++; return; }
  counter.resolved++;
}

// Dry-run-safe wrapper around resolveOrCreateCustomerIdentity: in dry-run
// mode this performs a read-only lookup instead of calling the writing
// service function at all.
async function resolveIdentity({ ownerUserId, type, value, slug, source }) {
  if (!APPLY) {
    const existing = await prisma.customerIdentity.findUnique({
      where: { ownerUserId_type_value: { ownerUserId, type, value } },
    });
    if (existing) return { customerId: existing.customerId, created: false };
    const key = keyOf({ ownerUserId, type, value });
    projection.newCustomerKeys.add(key);
    projection.newIdentityKeys.add(key);
    return { customerId: null, wouldCreate: true };
  }
  const r = await resolveOrCreateCustomerIdentity({ ownerUserId, type, value, slug, source });
  return r ? { customerId: r.customerId, created: r.created } : { customerId: null, error: true };
}

// Same dry-run-safe pattern for attachDeterministicIdentity. Attach calls
// only ever add a CustomerIdentity to an ALREADY-resolved Customer, so
// they contribute to newIdentityKeys but never newCustomerKeys.
async function attachIdentity({ customerId, ownerUserId, type, value, slug, source }) {
  if (!APPLY) {
    const existing = await prisma.customerIdentity.findUnique({
      where: { ownerUserId_type_value: { ownerUserId, type, value } },
    });
    if (existing) return { created: false };
    projection.newIdentityKeys.add(keyOf({ ownerUserId, type, value }));
    return { wouldCreate: true };
  }
  const r = await attachDeterministicIdentity({ customerId, ownerUserId, type, value, slug, source });
  return r ? { created: r.created } : { error: true };
}

// Two-hop dry-run projection helper: hop 1 resolves/creates the "anchor"
// identity (e.g. cid), hop 2 attaches a second identity to whatever
// Customer hop 1 resolves to (e.g. push_endpoint, wallet_serial). In dry
// run, hop 1 never actually creates anything, so its customerId is null
// even when apply would succeed — that is NOT an error, it's a dependent
// projection: hop 2 "wouldCreate" exactly when hop 1 "wouldCreate".
async function resolveThenAttach(anchorCall, attachCallFactory, anchorCounter, attachCounter) {
  const anchorResult = await resolveIdentity(anchorCall);
  tally(anchorCounter, anchorResult);

  attachCounter.scanned++;
  if (anchorResult.error) { attachCounter.errors++; return; }
  if (!anchorResult.customerId) {
    attachCounter.wouldCreate++;
    const attachCall = attachCallFactory(null);
    projection.newIdentityKeys.add(keyOf({ ownerUserId: attachCall.ownerUserId, type: attachCall.type, value: attachCall.value }));
    return;
  }

  const attachResult = await attachIdentity(attachCallFactory(anchorResult.customerId));
  tally(attachCounter, attachResult);
}

async function buildSlugOwnerMap() {
  const pages = await prisma.landingPage.findMany({ select: { slug: true, userId: true } });
  const map = new Map();
  for (const p of pages) map.set(p.slug, p.userId || null);
  return map;
}

async function backfillLoyaltyCustomers(slugOwnerMap, counts) {
  const rows = await prisma.loyaltyCustomer.findMany({
    select: { id: true, slug: true, customerId: true },
  });
  for (const row of rows) {
    counts.loyaltyCustomer.scanned++;
    const owner = resolveOwner(row.slug, slugOwnerMap, counts.loyaltyCustomer);
    if (!owner) continue;

    const result = await resolveIdentity({
      ownerUserId: owner, type: 'cid', value: row.customerId, slug: row.slug,
      source: 'backfill_loyalty_customer',
    });
    tally(counts.loyaltyCustomer, result);

    // Deterministic cross-cid convergence: every alias FK-linked to this
    // same LoyaltyCustomer row is, by that FK, the same real customer.
    const aliases = await prisma.loyaltyCustomerAlias.findMany({
      where: { loyaltyCustomerId: row.id },
      select: { cid: true, slug: true },
    });
    for (const alias of aliases) {
      counts.loyaltyCustomerAlias.scanned++;
      if (alias.cid === row.customerId) { counts.loyaltyCustomerAlias.resolved++; continue; }
      if (!result.customerId) {
        // Dry-run projection: the anchor cid itself would only be created
        // once --apply runs, so the alias attach is contingent on it too.
        counts.loyaltyCustomerAlias.wouldCreate++;
        projection.newIdentityKeys.add(keyOf({ ownerUserId: owner, type: 'cid', value: alias.cid }));
        continue;
      }
      const aliasResult = await attachIdentity({
        customerId: result.customerId, ownerUserId: owner, type: 'cid',
        value: alias.cid, slug: alias.slug || row.slug,
        source: 'backfill_loyalty_customer_alias',
      });
      tally(counts.loyaltyCustomerAlias, aliasResult);
    }
  }
}

async function backfillWebPush(slugOwnerMap, counts) {
  const totalRows = await prisma.webPushSubscription.count();
  const rows = await prisma.webPushSubscription.findMany({
    where: { cid: { not: null } },
    select: { slug: true, cid: true, endpoint: true },
  });
  counts.webpush.skippedNoCid = totalRows - rows.length;

  for (const row of rows) {
    counts.webpush.scanned++;
    const owner = resolveOwner(row.slug, slugOwnerMap, counts.webpush);
    if (!owner) continue;

    await resolveThenAttach(
      { ownerUserId: owner, type: 'cid', value: row.cid, slug: row.slug, source: 'backfill_webpush' },
      (customerId) => ({ customerId, ownerUserId: owner, type: 'push_endpoint', value: row.endpoint, slug: row.slug, source: 'backfill_webpush' }),
      counts.webpush, counts.webpushEndpoint,
    );
  }
}

async function backfillPass(slugOwnerMap, counts) {
  const totalRows = await prisma.pass.count();
  const rows = await prisma.pass.findMany({
    where: { loyaltyCustomerId: { not: null } },
    select: {
      serialNumber: true, slug: true, loyaltyCustomerId: true,
      loyaltyCustomer: { select: { slug: true, customerId: true } },
    },
  });
  counts.pass.skippedNoLoyaltyLink = totalRows - rows.length;

  for (const row of rows) {
    counts.pass.scanned++;
    if (!row.loyaltyCustomer) { counts.pass.skippedOrphanFk++; continue; } // defensive; FK guarantees this shouldn't happen
    if (row.slug && row.loyaltyCustomer.slug && row.slug !== row.loyaltyCustomer.slug) {
      // Ambiguous — a Pass and its linked LoyaltyCustomer disagree on slug.
      // Never guess which one is right; skip.
      counts.pass.skippedSlugMismatch++;
      continue;
    }
    const effectiveSlug = row.slug || row.loyaltyCustomer.slug;
    const owner = resolveOwner(effectiveSlug, slugOwnerMap, counts.pass);
    if (!owner) continue;

    // Resolve (never reverse-parse) via the SAME cid the LoyaltyCustomer
    // step above already owns — guarantees a Pass never lands on a
    // different Customer than its own LoyaltyCustomer resolved to. This is
    // a dependency lookup, not a distinct Pass-owned identity, so its
    // outcome gates the wallet_serial attach below but is not itself
    // tallied into counts.pass (that would double-count the LoyaltyCustomer
    // step's own cid creation under the wrong source).
    const cidResult = await resolveIdentity({
      ownerUserId: owner, type: 'cid', value: row.loyaltyCustomer.customerId,
      slug: effectiveSlug, source: 'backfill_pass',
    });
    if (cidResult.error) { counts.pass.errors++; continue; }
    if (!cidResult.customerId) {
      counts.pass.wouldCreate++;
      projection.newIdentityKeys.add(keyOf({ ownerUserId: owner, type: 'wallet_serial', value: row.serialNumber }));
      continue;
    }

    const serialResult = await attachIdentity({
      customerId: cidResult.customerId, ownerUserId: owner, type: 'wallet_serial',
      value: row.serialNumber, slug: effectiveSlug, source: 'backfill_pass',
    });
    tally(counts.pass, serialResult);
  }
}

async function backfillSubscribers(slugOwnerMap, counts) {
  const totalRows = await prisma.subscriber.count();
  const rows = await prisma.subscriber.findMany({
    where: { email: { not: null } },
    select: { slug: true, email: true },
  });
  counts.subscriber.skippedNoEmail = totalRows - rows.length;

  for (const row of rows) {
    counts.subscriber.scanned++;
    const owner = resolveOwner(row.slug, slugOwnerMap, counts.subscriber);
    if (!owner) continue;

    // Same normalization as the live Phase 2 dual-write (lpController.js
    // handleSubscribe: email.toLowerCase().trim()) — required so a
    // backfilled row and a later live write for the same address always
    // converge on one CustomerIdentity, never two.
    const emailNorm = row.email.toLowerCase().trim();
    const result = await resolveIdentity({
      ownerUserId: owner, type: 'email', value: emailNorm, slug: row.slug,
      source: 'backfill_subscriber_email',
    });
    tally(counts.subscriber, result);
  }
}

async function checkDealClaims(counts) {
  const totalRows = await prisma.dealClaim.count();
  const rowsWithCid = await prisma.dealClaim.count({ where: { cid: { not: null } } });
  counts.dealClaim = {
    totalRows,
    rowsWithCid,
    action: 'skipped — no live claim/redemption endpoint exists yet, so no deterministic proof ties a DealClaim.cid to a real redemption event',
  };
}

async function main() {
  assertLocalDatabase();
  console.log(APPLY ? '=== Phase 3 backfill: APPLY (writes enabled) ===' : '=== Phase 3 backfill: DRY RUN (no writes) ===');

  const counts = {
    loyaltyCustomer: freshCounter(),
    loyaltyCustomerAlias: freshCounter(),
    webpush: freshCounter(),
    webpushEndpoint: freshCounter(),
    pass: { ...freshCounter(), skippedOrphanFk: 0, skippedSlugMismatch: 0 },
    subscriber: freshCounter(),
    scan: { note: 'not processed by design — no identity signal exists on Scan rows' },
    dealClaim: null,
  };

  const slugOwnerMap = await buildSlugOwnerMap();

  await backfillLoyaltyCustomers(slugOwnerMap, counts);
  await backfillWebPush(slugOwnerMap, counts);
  await backfillPass(slugOwnerMap, counts);
  await backfillSubscribers(slugOwnerMap, counts);
  await checkDealClaims(counts);

  if (!APPLY) {
    counts.summary = {
      customersWouldBeCreated: projection.newCustomerKeys.size,
      customerIdentitiesWouldBeCreated: projection.newIdentityKeys.size,
      note: 'Deduplicated by (ownerUserId, type, value) — Pass/alias rows that converge onto the same cid as a LoyaltyCustomer row are counted once, matching what --apply would actually do.',
    };
  }

  console.log(JSON.stringify(counts, null, 2));
  return counts;
}

if (require.main === module) {
  main()
    .catch((e) => { console.error('[Phase3Backfill] FATAL:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

module.exports = { main };
