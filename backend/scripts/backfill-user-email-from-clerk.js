// User.email backfill from Clerk.
//
// Dry run by default (read-only, zero writes). Pass --apply to write.
// Idempotent: only ever touches rows where User.email is currently
// null/empty, and only sets it to a real Clerk-resolved primary email --
// running it twice in a row makes zero further writes on the second run.
//
// Matches strictly by Clerk user ID (User.id === the Clerk user id, the
// same convention every other table in this schema already uses). Never
// creates a User row -- only updates existing ones. Never touches
// plan/phone/stripeCustomerId/stripeSubscriptionId/subscriptionStatus or
// any other field. Never overwrites an existing non-empty email -- users
// already scoped out of the query entirely, see below.
//
// Uses utils/clerkEmailSync.js (same primaryEmailAddressId resolution
// already used by adminMiddleware.js and the live upsertUser() sync path)
// -- never derives/guesses an email from anything else.

const path = require('path');
const backendRoot = path.join(__dirname, '..');
const prisma = require(path.join(backendRoot, 'src', 'utils', 'prismaClient'));
const { fetchPrimaryEmail } = require(path.join(backendRoot, 'src', 'utils', 'clerkEmailSync'));

const APPLY = process.argv.includes('--apply');

// Hard safety guard: this script must never run against anything but a
// local database. Parsed, not string-matched, so "localhost.evil.example"
// can't slip past a naive substring check. Same convention as
// backfill-customer-foundation-phase3.js / backfill-network-location-
// business-phase1a.js -- do not weaken. Running this against a real
// preview/production database follows the same established precedent
// documented for those scripts: a disposable, byte-diff-verified copy of
// this file with the guard removed, used once and deleted immediately
// after, never a modification to this committed script's guard.
function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL || '';
  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch (e) {
    console.error('[UserEmailBackfill] DATABASE_URL is missing or unparseable. Refusing to run.');
    process.exit(1);
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  console.log('[UserEmailBackfill] DATABASE_URL host:', host, '| database:', new URL(raw).pathname.replace(/^\//, ''));
  if (!isLocal) {
    console.error('[UserEmailBackfill] DATABASE_URL host is NOT localhost/127.0.0.1. Refusing to run against a non-local database.');
    process.exit(1);
  }
}

// `opts.apply`, when explicitly passed (true or false), overrides the
// process.argv-derived APPLY flag -- this is what lets tests exercise both
// modes in-process. Direct CLI usage (`node backfill-....js --apply`) never
// passes opts, so it's governed by argv exactly as before.
async function main(opts = {}) {
  const apply = opts.apply !== undefined ? opts.apply : APPLY;
  assertLocalDatabase();
  console.log(apply ? '=== User.email backfill from Clerk: APPLY (writes enabled) ===' : '=== User.email backfill from Clerk: DRY RUN (no writes) ===');

  const counts = {
    usersMissingEmail: 0,
    updated: 0,          // written this run (--apply only)
    wouldUpdate: 0,
    noClerkEmailFound: 0, // Clerk user exists but has no primary email set
    clerkLookupFailed: 0, // Clerk user not found / API error
    errors: 0,
    skipped: [],
  };

  // Scope is exactly "User rows with no email yet" -- a row that already
  // has one is never read by this script at all, so it can never be
  // touched, let alone overwritten.
  const usersMissingEmail = await prisma.user.findMany({
    where: { OR: [{ email: null }, { email: '' }] },
    select: { id: true },
  });
  counts.usersMissingEmail = usersMissingEmail.length;

  for (const { id: userId } of usersMissingEmail) {
    let email;
    try {
      email = await fetchPrimaryEmail(userId);
    } catch (e) {
      // fetchPrimaryEmail itself never throws (it catches internally and
      // returns null) -- this branch is defensive only.
      counts.clerkLookupFailed++;
      counts.skipped.push({ userId, reason: 'clerk lookup threw unexpectedly: ' + e.message });
      continue;
    }

    if (!email) {
      counts.noClerkEmailFound++;
      counts.skipped.push({ userId, reason: 'no primary email in Clerk (or user not found in Clerk)' });
      continue;
    }

    if (apply) {
      try {
        await prisma.user.update({ where: { id: userId }, data: { email } });
        counts.updated++;
        console.log('[UserEmailBackfill] updated User', userId, '-> email set');
      } catch (e) {
        counts.errors++;
        console.error('[UserEmailBackfill] update failed for', userId, '-', e.message);
      }
    } else {
      counts.wouldUpdate++;
    }
  }

  console.log(JSON.stringify(counts, null, 2));
  return counts;
}

if (require.main === module) {
  main()
    .catch((e) => { console.error('[UserEmailBackfill] FATAL:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

module.exports = { main };
