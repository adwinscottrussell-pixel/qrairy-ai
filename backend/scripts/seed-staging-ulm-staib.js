// Phase 6D — Staging-only seed: minimal Ulm + Bäckerei Staib draft topology.
//
// Creates the smallest real topology the Phase 6D StadtPocket Admin needs
// to show Global Admin -> Ulm -> business list -> Bäckerei Staib -> Profile
// Editor, per the Phase 6D read-only topology audit:
//   Network (StadtPocket) -> Location (Ulm, type=city)
//     -> StadtPocketListing (Bäckerei Staib) -> StadtPocketListingLocation
// Business/BusinessLocation are NOT created — proven not required by
// stadtpocketManagerService.js (no prisma.business/businessLocation calls
// anywhere in that file; StadtPocketListing.businessId and
// StadtPocketListingLocation.businessLocationId are nullable, populated
// only by a future claim/link step, not this one).
//
// Dry run by default (read-only, zero writes). Pass --apply to write.
// Idempotent: re-running finds the Network by slug, the Location by slug,
// and the Staib listing by (locationId, listing.name) and reuses each —
// never creates a duplicate. A mismatch between an existing record and
// the intended identity (name/type/address) is a CONFLICT: the script
// aborts and reports it rather than overwriting unknown existing data.
//
// Leaves the Staib listing in publicationStatus="draft", publishedAt=null.
// This script never calls publishForLocation / publishListingLocation.
// Reaching "published" is a deliberately separate, later, explicitly
// approved step (see Phase 6D staging topology audit, report section K).
//
// Writes go through the same service functions the real admin UI uses
// (networkAdminService.createNetwork/createLocation,
// stadtpocketManagerService.initializeDraft/saveDraft) rather than raw
// Prisma creates, so a successful run produces exactly the state the
// admin UI itself would have produced -- same validation, same slug
// generation, same field allow-lists. No Express req/res is faked to get
// there: stadtpocketManagerService's exported functions take a plain
// `scope` object as their auth input (see middleware/stadtpocketManagerAuth.js's
// own documented req.stadtpocketScope shape), not a request -- passing
// { isGlobalAdmin: true, userId: <script name> } directly is the exact
// same shape requireStadtpocketWriteScope would have attached to req,
// nothing is being spoofed at the HTTP layer because no HTTP layer is
// involved.
//
// Known accuracy note (found while writing this script, not assumed):
// stadtpocketManagerService.js's internal slugify() strips characters
// outside [a-z0-9\s-] rather than transliterating them, so "Bäckerei"
// loses its "ä" entirely -- the real generated StadtPocketListing.slug
// for this row will NOT be "baeckerei-staib" as used elsewhere (test
// fixtures, stadtpocket-web's mock dataset). slugify()/generateUniqueSlug()
// are also not exported by that service, so this script cannot predict
// the exact slug without duplicating private logic. Idempotency below is
// therefore keyed on (locationId, listing.name) -- the same identity the
// admin UI's own business list is keyed on -- never on a guessed slug.
//
// Usage (staging only -- see the hard DB guard below; this only PREPARES
// the script, it is not invoked by anything in this commit):
//   DATABASE_URL=<staging Postgres-Yb09 URL> \
//     node backend/scripts/seed-staging-ulm-staib.js
//   DATABASE_URL=<staging Postgres-Yb09 URL> \
//     node backend/scripts/seed-staging-ulm-staib.js --apply

const path = require('path');
const backendRoot = path.join(__dirname, '..');
const prisma = require(path.join(backendRoot, 'src', 'utils', 'prismaClient'));
const networkAdmin = require(path.join(backendRoot, 'src', 'services', 'networkAdminService'));
const stadtpocketManager = require(path.join(backendRoot, 'src', 'services', 'stadtpocketManagerService'));

const APPLY = process.argv.includes('--apply');

class SeedConflictError extends Error {}

// ── Hard staging safety guard ──────────────────────────────────────────
// Must positively identify the intended staging database before ANY
// Prisma read/write below. Production ambiguity means ABORT -- an exact
// hostname match against the one staging host identity we have direct
// prior confirmation of (postgres-yb09.railway.internal), never a
// substring/prefix check, so no other Railway-internal host (production's
// included) can accidentally pass. Never logs the DATABASE_URL itself or
// any credential -- only the parsed hostname and database name, both of
// which are non-secret identifiers, matching the exact convention already
// used by backfill-network-location-business-phase1a.js's own
// assertLocalDatabase().
//
// This is the ONLY identity check, deliberately -- a second, Railway-
// environment-name-based check was considered (e.g. RAILWAY_SERVICE_NAME,
// RAILWAY_ENVIRONMENT_NAME) but dropped: a repo-wide search (both
// railway.toml files, backend/src, backend/scripts, docs/) found zero
// reference to any RAILWAY_*-prefixed variable anywhere in this codebase,
// and this script has no live access to the actual pacific-youth
// service's runtime to confirm which variables Railway actually injects
// for it. Naming one here would be an assumption, not a proven identifier
// -- see the Phase 6D seed script prep session's read-only verification.
// If a genuinely confirmed second identifier surfaces later (e.g. by
// reading it from an actual pacific-youth deploy log), it can be added as
// a second required check then; until proven, the exact hostname match
// below is the sole and authoritative guard.
const EXPECTED_STAGING_HOST = 'postgres-yb09.railway.internal';

function assertStagingDatabase() {
  const raw = process.env.DATABASE_URL || '';
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    console.error('[Phase6DSeed] STAGING SAFETY CHECK: FAIL — DATABASE_URL is missing or unparseable. Refusing to run.');
    process.exit(1);
  }

  const host = url.hostname.toLowerCase();
  const dbName = url.pathname.replace(/^\//, '');
  console.log('[Phase6DSeed] DATABASE_URL host:', host, '| database:', dbName);

  if (host !== EXPECTED_STAGING_HOST) {
    console.error(
      `[Phase6DSeed] STAGING SAFETY CHECK: FAIL — host "${host}" does not exactly match the known staging host ` +
      `"${EXPECTED_STAGING_HOST}". This script only runs against a positively identified staging database. Refusing to run.`
    );
    process.exit(1);
  }

  console.log('[Phase6DSeed] STAGING SAFETY CHECK: PASS');
}

// ── Intended identity (from the approved Phase 6D topology audit) ──────
const NETWORK = { name: 'StadtPocket', slug: 'stadt-pocket' };
const LOCATION = { name: 'Ulm', slug: 'ulm', type: 'city' };
const STAIB = {
  name: 'Bäckerei Staib',
  category: 'Essen & Trinken',
  shortDescription: 'Filiale der Ulmer Bäckereikette Staib in der Platzgasse.',
  address: 'Platzgasse 2–4, 89073 Ulm',
  phone: '0731 8800911',
  website: 'https://www.baeckerei-staib.de/',
  latitude: 48.3993425,
  longitude: 9.9911963,
};

// Passed directly to stadtpocketManagerService's exported functions as
// their `scope` argument -- the same shape requireStadtpocketWriteScope
// attaches to req.stadtpocketScope for a real Global Admin (see that
// middleware's own header comment). Not an HTTP request; nothing faked.
const SCOPE = { userId: 'seed-script:phase6d-ulm-staib', isGlobalAdmin: true };

// ── Step 1: Network (check-before-create by slug) ──────────────────────
async function resolveNetwork() {
  const existing = await prisma.network.findUnique({ where: { slug: NETWORK.slug } });
  if (existing) {
    if (existing.name !== NETWORK.name) {
      throw new SeedConflictError(
        `Network with slug "${NETWORK.slug}" already exists but its name is "${existing.name}", ` +
        `not the intended "${NETWORK.name}". Refusing to modify existing data.`
      );
    }
    return { record: existing, created: false };
  }
  if (!APPLY) return { record: null, created: 'would-create' };
  const created = await networkAdmin.createNetwork(NETWORK);
  return { record: created, created: true };
}

// ── Step 2: Location (check-before-create by slug) ─────────────────────
// Reuse requires ALL FOUR identity fields to match exactly, including
// networkId -- a Location belonging to a different Network is never
// silently reused (it would misrepresent which Network "owns" Ulm) and
// never modified/reassigned. That is a genuine identity conflict, not a
// warning: abort.
async function resolveLocation(networkId) {
  const existing = await prisma.location.findUnique({ where: { slug: LOCATION.slug } });
  if (existing) {
    if (existing.name !== LOCATION.name) {
      throw new SeedConflictError(
        `Location with slug "${LOCATION.slug}" already exists but its name is "${existing.name}", ` +
        `not the intended "${LOCATION.name}". Refusing to modify existing data.`
      );
    }
    if (existing.type !== LOCATION.type) {
      throw new SeedConflictError(
        `Location with slug "${LOCATION.slug}" already exists but its type is "${existing.type}", ` +
        `not the intended "${LOCATION.type}". Refusing to modify existing data.`
      );
    }
    if (networkId == null) {
      // Dry run, Network not yet created (resolveNetwork returned no real
      // id to compare against) -- the networkId identity check literally
      // cannot be evaluated yet. NOT treated as a pass: reported as
      // inconclusive rather than silently reused, and re-checked for real
      // the moment a real Network id exists (every --apply run resolves
      // Network before calling this function, so the hard check below
      // always runs before any real Location write).
      console.warn(
        `[Phase6DSeed] NOTE: cannot yet verify existing Location "ulm" (Network=${existing.networkId}) against the ` +
        `intended "${NETWORK.slug}" Network -- that Network doesn't exist yet in this dry run. Re-run with --apply ` +
        `(which creates/resolves the Network first) to get a real conflict check before anything is written.`
      );
      return { record: existing, created: false };
    }
    if (existing.networkId !== networkId) {
      throw new SeedConflictError(
        `Location with slug "${LOCATION.slug}" already exists but belongs to Network "${existing.networkId}", ` +
        `not the intended "${NETWORK.slug}" Network ("${networkId}"). Refusing to reuse a Location from a ` +
        `different Network, and refusing to modify/reassign the existing row.`
      );
    }
    return { record: existing, created: false };
  }
  if (!APPLY) return { record: null, created: 'would-create' };
  if (!networkId) {
    throw new SeedConflictError('Cannot create Location: no Network id available to attach it to.');
  }
  const created = await networkAdmin.createLocation({ networkId, ...LOCATION });
  return { record: created, created: true };
}

// ── Step 3+4: StadtPocketListing + StadtPocketListingLocation ──────────
// Created together, atomically, by initializeDraft() -- this script never
// creates either row independently. Idempotency is keyed on
// (locationId, listing.name), not slug (see header note on slugify()).
async function resolveStaibListing(locationId) {
  if (!locationId) return { record: null, created: 'would-create' };

  const rows = await prisma.stadtPocketListingLocation.findMany({
    where: { locationId },
    include: { listing: true },
  });
  const existing = rows.find((r) => r.listing.name === STAIB.name);

  if (existing) {
    if (existing.address !== STAIB.address) {
      throw new SeedConflictError(
        `A "${STAIB.name}" listing already exists in Ulm (listingLocationId=${existing.id}) but its address ` +
        `is "${existing.address}", not the intended "${STAIB.address}". Refusing to modify existing data.`
      );
    }
    return { record: existing, created: false };
  }

  if (!APPLY) return { record: null, created: 'would-create' };

  const draft = await stadtpocketManager.initializeDraft(locationId, SCOPE, {
    name: STAIB.name,
    category: STAIB.category,
    shortDescription: STAIB.shortDescription,
    address: STAIB.address,
  });

  await stadtpocketManager.saveDraft(locationId, draft.listingLocationId, SCOPE, {
    phone: STAIB.phone,
    website: STAIB.website,
    latitude: STAIB.latitude,
    longitude: STAIB.longitude,
  });

  const final = await stadtpocketManager.getEditableState(locationId, draft.listingLocationId, SCOPE);
  return { record: final, created: true };
}

function describe(step) {
  if (step.created === true) return 'created';
  if (step.created === false) return 'reused';
  return 'would-create';
}

async function main() {
  assertStagingDatabase();
  console.log(APPLY ? '=== Phase 6D Ulm/Staib seed: APPLY (writes enabled) ===' : '=== Phase 6D Ulm/Staib seed: DRY RUN (no writes) ===');

  const network = await resolveNetwork();
  console.log('Network:', describe(network));

  const networkId = network.record ? network.record.id : null;
  const location = await resolveLocation(networkId);
  console.log('Location Ulm:', describe(location));

  const locationId = location.record ? location.record.id : null;
  const staib = await resolveStaibListing(locationId);
  console.log('Bäckerei Staib listing:', describe(staib));
  console.log('Listing location:', describe(staib));
  console.log('Publication status:', staib.record ? staib.record.publicationStatus : 'draft (not yet created)');

  return { network: describe(network), location: describe(location), staib: describe(staib) };
}

if (require.main === module) {
  main()
    .catch((e) => {
      if (e instanceof SeedConflictError) {
        console.error('[Phase6DSeed] CONFLICT — aborting without writing further:', e.message);
      } else {
        console.error('[Phase6DSeed] FATAL:', e.message);
      }
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { main, resolveNetwork, resolveLocation, resolveStaibListing };
