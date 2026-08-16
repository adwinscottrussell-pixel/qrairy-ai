// Stadt Pocket Phase 1A — Business compatibility backfill projection.
//
// Dry run by default (read-only, zero writes). Pass --apply to write.
// Idempotent: re-running finds every already-created Business/
// BusinessMember/LandingPage.businessId link and creates nothing further.
//
// ============================================================
// Source-of-truth decision (see docs/architecture/NETWORK_LOCATION_FOUNDATION.md):
//
// A Clerk user is treated as "represents a QRAIVY business" if and only if
// they own at least one LandingPage (LandingPage.userId, non-null), cross-
// checked against a real User row. LandingPage was chosen over QR.userId
// or Subscriber.userId as the sole source of truth because:
//   - A LandingPage IS literally "a business's Smart Page" -- the actual
//     unit of business presence in QRAIVY today. Owning one is the
//     strongest, most direct signal that exists in the current schema.
//   - QR.userId alone is too weak: a QR can be an anonymous, unclaimed
//     basic code with no business identity attached (businessName is
//     nullable) -- using it would risk creating Business rows for users
//     who never actually operate a business presence.
//   - Subscriber.userId is a denormalized copy of the LandingPage owner at
//     signup time, not an independent signal -- reusing it would just
//     double-count the same evidence LandingPage already provides.
//   - Platform admins are not distinguished by any Postgres column (the
//     `role: admin` flag lives only in Clerk's own publicMetadata, not in
//     this database) -- if a platform admin also happens to personally own
//     a real LandingPage, they correctly get a Business row too; this is
//     harmless, not a false positive, since it reflects a real product
//     usage fact independent of their separate admin privileges.
//   - End-consumer Customer identities can never trigger this path at all:
//     Customer.ownerUserId always identifies the BUSINESS side of a
//     relationship, never the consumer; consumers never own a LandingPage.
//
// Every discovered ownerUserId is additionally cross-checked against a
// real `User` row -- an orphaned/stale LandingPage.userId with no matching
// User is skipped and counted, never guessed.

const path = require('path');
const backendRoot = path.join(__dirname, '..');
const prisma = require(path.join(backendRoot, 'src', 'utils', 'prismaClient'));

const APPLY = process.argv.includes('--apply');

// Hard safety guard: this script must never run against anything but a
// local database. Parsed, not string-matched, so "localhost.evil.example"
// can't slip past a naive substring check. Same convention as
// backfill-customer-foundation-phase3.js -- do not weaken.
function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL || '';
  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch (e) {
    console.error('[NetworkLocationBackfill] DATABASE_URL is missing or unparseable. Refusing to run.');
    process.exit(1);
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  console.log('[NetworkLocationBackfill] DATABASE_URL host:', host, '| database:', new URL(raw).pathname.replace(/^\//, ''));
  if (!isLocal) {
    console.error('[NetworkLocationBackfill] DATABASE_URL host is NOT localhost/127.0.0.1. Refusing to run against a non-local database.');
    process.exit(1);
  }
}

async function main() {
  assertLocalDatabase();
  console.log(APPLY ? '=== Network/Location/Business backfill: APPLY (writes enabled) ===' : '=== Network/Location/Business backfill: DRY RUN (no writes) ===');

  const counts = {
    ownerUserIdsDiscovered: 0,
    skippedNoMatchingUser: 0,
    businessesResolved: 0,   // Business already existed for this owner
    businessesCreated: 0,    // written this run (--apply only)
    businessesWouldCreate: 0,
    businessMembersResolved: 0,
    businessMembersCreated: 0,
    businessMembersWouldCreate: 0,
    landingPagesAlreadyLinked: 0,
    landingPagesLinked: 0,        // written this run (--apply only)
    landingPagesWouldLink: 0,
    ambiguousOrSkipped: [],
    errors: 0,
  };

  // Distinct non-null LandingPage.userId values -- the sole source of truth.
  const distinctOwners = await prisma.landingPage.findMany({
    where: { userId: { not: null } },
    distinct: ['userId'],
    select: { userId: true },
  });
  counts.ownerUserIdsDiscovered = distinctOwners.length;

  for (const { userId: ownerUserId } of distinctOwners) {
    // Cross-check against a real User row -- never guess for an orphaned id.
    const realUser = await prisma.user.findUnique({ where: { id: ownerUserId } });
    if (!realUser) {
      counts.skippedNoMatchingUser++;
      counts.ambiguousOrSkipped.push({ ownerUserId, reason: 'no matching User row' });
      continue;
    }

    // Resolve or project the Business for this owner.
    let business = await prisma.business.findFirst({ where: { primaryOwnerUserId: ownerUserId } });
    if (business) {
      counts.businessesResolved++;
    } else if (APPLY) {
      try {
        business = await prisma.business.create({
          data: { name: realUser.email || ownerUserId, primaryOwnerUserId: ownerUserId },
        });
        counts.businessesCreated++;
        console.log('[NetworkLocationBackfill] created Business:', business.id, 'for owner:', ownerUserId);
      } catch (e) {
        counts.errors++;
        console.error('[NetworkLocationBackfill] Business create failed for', ownerUserId, '-', e.message);
        continue;
      }
    } else {
      counts.businessesWouldCreate++;
    }

    const businessId = business ? business.id : null;

    // Resolve or project the owner's BusinessMember row.
    if (businessId) {
      const existingMember = await prisma.businessMember.findFirst({ where: { businessId, userId: ownerUserId } });
      if (existingMember) {
        counts.businessMembersResolved++;
      } else if (APPLY) {
        try {
          await prisma.businessMember.create({ data: { businessId, userId: ownerUserId, role: 'owner' } });
          counts.businessMembersCreated++;
        } catch (e) {
          counts.errors++;
          console.error('[NetworkLocationBackfill] BusinessMember create failed for', ownerUserId, '-', e.message);
        }
      } else {
        counts.businessMembersWouldCreate++;
      }
    } else {
      // Dry run and no existing Business -- BusinessMember is a dependent
      // projection, same "hop 2 wouldCreate exactly when hop 1 wouldCreate"
      // pattern as the Customer Foundation backfill.
      counts.businessMembersWouldCreate++;
    }

    // Resolve or project this owner's LandingPage.businessId links.
    const ownedPages = await prisma.landingPage.findMany({ where: { userId: ownerUserId }, select: { id: true, businessId: true } });
    for (const page of ownedPages) {
      if (page.businessId) {
        counts.landingPagesAlreadyLinked++;
        continue;
      }
      if (APPLY && businessId) {
        try {
          await prisma.landingPage.update({ where: { id: page.id }, data: { businessId } });
          counts.landingPagesLinked++;
        } catch (e) {
          counts.errors++;
          console.error('[NetworkLocationBackfill] LandingPage.businessId link failed for', page.id, '-', e.message);
        }
      } else {
        counts.landingPagesWouldLink++;
      }
    }
  }

  console.log(JSON.stringify(counts, null, 2));
  return counts;
}

if (require.main === module) {
  main()
    .catch((e) => { console.error('[NetworkLocationBackfill] FATAL:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

module.exports = { main };
