// Phase 6D — Staging-only one-off correction: Bäckerei Staib's slug.
//
// The pre-fix slugify() (before the German-transliteration fix landed)
// generated "bckerei-staib" for "Bäckerei Staib" -- see
// backend/tests/stadtpocketSlugify.test.js and
// stadtpocketManagerService.js's slugify()/transliterateGerman() for the
// fix itself, already shipped and tested. That fix only changes what
// FUTURE listings generate; it never touched this already-existing
// staging row, by design (explicitly deferred pending approval in an
// earlier session).
//
// This script corrects ONLY that one row's slug column:
//   bckerei-staib -> baeckerei-staib
// Nothing else. It does not recreate the listing, does not touch its id,
// does not touch its city/location ownership (StadtPocketListingLocation
// rows are addressed by listingId, never by slug, so they are entirely
// unaffected by a slug rename), does not touch any published profile
// field, does not touch headerImage, and does not touch draftData.
//
// Dry run by default (read-only, zero writes). Pass --apply to write.
// Idempotent: if the old slug is already gone and the new slug already
// exists, this is treated as "already corrected" (success, no-op), not
// an error -- safe to re-run.
//
// Same hard staging safety guard as seed-staging-ulm-staib.js: exact
// hostname match against postgres-yb09.railway.internal, checked BEFORE
// any Prisma query. Never logs DATABASE_URL or any credential.
//
// Usage (staging only):
//   DATABASE_URL=<staging Postgres-Yb09 URL> \
//     node backend/scripts/fix-staib-canonical-slug.js
//   DATABASE_URL=<staging Postgres-Yb09 URL> \
//     node backend/scripts/fix-staib-canonical-slug.js --apply

const path = require('path');
const backendRoot = path.join(__dirname, '..');
const prisma = require(path.join(backendRoot, 'src', 'utils', 'prismaClient'));

const APPLY = process.argv.includes('--apply');

const OLD_SLUG = 'bckerei-staib';
const NEW_SLUG = 'baeckerei-staib';

// ── Hard staging safety guard ──────────────────────────────────────────
// Identical convention/reasoning to seed-staging-ulm-staib.js's own
// assertStagingDatabase() -- exact hostname match only, no substring
// match, no second unproven identifier (see that script's own comment
// for why a Railway-environment-name check was considered and rejected
// as unverifiable from this codebase).
const EXPECTED_STAGING_HOST = 'postgres-yb09.railway.internal';

function assertStagingDatabase() {
  const raw = process.env.DATABASE_URL || '';
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    console.error('[FixStaibSlug] STAGING SAFETY CHECK: FAIL — DATABASE_URL is missing or unparseable. Refusing to run.');
    process.exit(1);
  }

  const host = url.hostname.toLowerCase();
  const dbName = url.pathname.replace(/^\//, '');
  console.log('[FixStaibSlug] DATABASE_URL host:', host, '| database:', dbName);

  if (host !== EXPECTED_STAGING_HOST) {
    console.error(
      `[FixStaibSlug] STAGING SAFETY CHECK: FAIL — host "${host}" does not exactly match the known staging host ` +
      `"${EXPECTED_STAGING_HOST}". This script only runs against a positively identified staging database. Refusing to run.`
    );
    process.exit(1);
  }

  console.log('[FixStaibSlug] STAGING SAFETY CHECK: PASS');
}

async function main() {
  assertStagingDatabase();
  console.log(APPLY ? '=== Fix Staib canonical slug: APPLY (write enabled) ===' : '=== Fix Staib canonical slug: DRY RUN (no writes) ===');

  const existingOld = await prisma.stadtPocketListing.findUnique({ where: { slug: OLD_SLUG } });
  const existingNew = await prisma.stadtPocketListing.findUnique({ where: { slug: NEW_SLUG } });

  if (!existingOld && existingNew) {
    console.log(`[FixStaibSlug] Already corrected — no row has slug "${OLD_SLUG}", and "${NEW_SLUG}" already exists (id=${existingNew.id}). Nothing to do.`);
    return { result: 'already-corrected', id: existingNew.id };
  }

  if (!existingOld && !existingNew) {
    console.error(`[FixStaibSlug] Neither "${OLD_SLUG}" nor "${NEW_SLUG}" exists. Refusing to guess — nothing changed.`);
    process.exit(1);
  }

  if (existingOld && existingNew) {
    console.error(
      `[FixStaibSlug] CONFLICT — both "${OLD_SLUG}" (id=${existingOld.id}) and "${NEW_SLUG}" (id=${existingNew.id}) ` +
      `already exist as separate rows. Refusing to overwrite or merge either automatically. Resolve manually.`
    );
    process.exit(1);
  }

  // existingOld only, from here on -- the real, expected case.
  console.log(`[FixStaibSlug] Found listing id=${existingOld.id}, name="${existingOld.name}", current slug="${existingOld.slug}".`);

  if (!APPLY) {
    console.log(`[FixStaibSlug] Would update: slug "${OLD_SLUG}" -> "${NEW_SLUG}" on listing id=${existingOld.id}. No other field would be touched.`);
    return { result: 'would-update', id: existingOld.id };
  }

  const updated = await prisma.stadtPocketListing.update({
    where: { id: existingOld.id },
    data: { slug: NEW_SLUG },
  });

  console.log(`[FixStaibSlug] Updated listing id=${updated.id}: slug is now "${updated.slug}".`);
  return { result: 'updated', id: updated.id };
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('[FixStaibSlug] FATAL:', e.message);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { main };
