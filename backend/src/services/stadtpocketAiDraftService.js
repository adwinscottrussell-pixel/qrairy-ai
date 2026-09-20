/**
 * stadtpocketAiDraftService.js — Phase 1D follow-up (close the
 * duplicate-creation gap).
 * ─────────────────────────────────────────────────────────────
 * Problem this file exists to fix: Phase 1D's frontend called the
 * existing initializeDraft/saveDraft routes directly from the browser,
 * trusting the duplicate status Phase 1B's /research endpoint returned
 * EARLIER in the session. That status can go stale -- another manager
 * (or the same one, in another tab) can create the real duplicate in
 * the gap between "research says NEW" and "Admin clicks Als Entwurf
 * erstellen". A stale client-side NEW must never be sufficient to
 * create a duplicate.
 *
 * Fix: one new server-side entry point that re-runs the duplicate
 * check IMMEDIATELY before creation, using the request's own reviewed
 * values (never a client-supplied duplicate status field, which this
 * file never even reads) -- then, only if genuinely NEW, calls the
 * EXISTING initializeDraft()/saveDraft() functions from
 * stadtpocketManagerService.js exactly as Phase 1D's frontend used to
 * call them itself, and reuses checkForDuplicateListing() from
 * stadtpocketDuplicateService.js verbatim -- no second duplicate-
 * detection implementation, no second persistence path.
 *
 * Deliberately NOT touched to build this: stadtpocketManagerService.js,
 * stadtpocketDuplicateService.js, managerStadtpocketListingRoutes.js.
 * The existing manual "+ Neues Geschäft" flow still calls
 * initializeDraft directly with NO duplicate check of its own,
 * completely unchanged -- see this file's own report for why adding a
 * check there instead would have altered manual behavior no one asked
 * to change here.
 *
 * ── Atomicity, precisely stated (never overclaimed) ─────────────────
 * This closes the STALE-CLIENT-STATUS gap completely: the duplicate
 * status used here is always freshly computed by this very request,
 * server-side, at write time -- a caller cannot lie about it or rely on
 * information that is even a few seconds old.
 *
 * It does NOT provide database-level atomic duplicate prevention. The
 * duplicate check (a SELECT) and initializeDraft's insert are two
 * separate operations with no shared transaction or unique constraint
 * between them (StadtPocketListingLocation has no unique index on
 * website/phone/address/name -- only slug is DB-unique, per
 * stadtpocketManagerService.js's own existing comment). Two requests
 * that both pass the duplicate check within the same narrow window
 * (genuinely concurrent, same city, matching identity) could still both
 * create a listing. Closing that fully would need a real schema change
 * (e.g. a unique constraint or advisory lock) -- explicitly out of
 * scope here per this task's own instruction not to introduce a
 * migration casually. This is the strongest safe check available
 * without one, and is a real, substantial improvement over trusting an
 * old client-side value across an entire human-review session.
 * ─────────────────────────────────────────────────────────────
 */

const {
  StadtpocketManagerError,
  authorizeLocationAccess,
  initializeDraft,
  initializeMultiLocationDraft,
  saveDraft,
} = require('./stadtpocketManagerService');
const { checkForDuplicateListing, STATUS: DUPLICATE_STATUS } = require('./stadtpocketDuplicateService');

class StadtpocketDuplicateError extends Error {
  constructor(duplicate) {
    super('A possible duplicate business was found in this city.');
    this.status = 409;
    this.duplicate = duplicate;
  }
}

const REQUIRED_FIELDS = ['name', 'category', 'shortDescription', 'address'];

function splitRequiredAndOptional(body) {
  const src = body || {};
  const required = {};
  for (const key of REQUIRED_FIELDS) required[key] = src[key];
  const optional = {};
  for (const key of Object.keys(src)) {
    if (!REQUIRED_FIELDS.includes(key)) optional[key] = src[key];
  }
  return { required, optional };
}

/**
 * Creates a real StadtPocket draft from a reviewed AI research
 * candidate's final (human-edited) values, with a fresh server-side
 * duplicate re-check immediately before creation.
 *
 * `body` is the SAME merged shape the Phase 1D frontend already built
 * across two calls (buildInitializeDraftPayload + the enrichment
 * payload) -- now sent as one request: { name, category,
 * shortDescription, address, subCategory?, tags?, longDescription?,
 * phone?, website?, hours?, latitude?, longitude? }. Optional-field
 * validation (checkWebsite/checkHours/checkLatitude/checkLongitude,
 * the lat/lng pairing rule, etc.) is never reimplemented here -- it's
 * inherited for free by delegating straight to saveDraft(), which
 * already enforces all of it via validateDraftPayload().
 *
 * Throws StadtpocketDuplicateError (status 409, carries the real
 * `duplicate` result) when the server's own fresh check finds anything
 * other than NEW -- never merges, never overwrites, never creates.
 * Throws StadtpocketManagerError for auth/validation failures, exactly
 * like initializeDraft/saveDraft already do on their own.
 */
async function createDraftFromReview(locationId, scope, body) {
  authorizeLocationAccess(locationId, scope);

  const { required, optional } = splitRequiredAndOptional(body);

  // Fresh, server-computed duplicate check -- reuses Phase 1B's exact
  // service and matching rules (website/phone/address/normalized
  // name+city), using the strongest reviewed values THIS request
  // actually carries. No client-supplied duplicate status of any kind
  // is read anywhere in this function.
  const duplicate = await checkForDuplicateListing({
    locationId,
    businessName: required.name,
    websiteUrl: optional.website,
    phone: optional.phone,
    address: required.address,
  });
  if (duplicate.status !== DUPLICATE_STATUS.NEW) {
    throw new StadtpocketDuplicateError(duplicate);
  }

  // The duplicate check just passed -- proceed immediately (no
  // intervening I/O, no round-trip back to the browser) into the exact
  // same two existing, already-authorized, already-validated write
  // calls the frontend used to make itself. initializeDraft re-checks
  // scope again internally too (never trusted twice-removed).
  const created = await initializeDraft(locationId, scope, required);

  let finalListing = created;
  let enrichmentFailed = false;
  let enrichmentError = null;

  if (Object.keys(optional).length) {
    // The draft REALLY EXISTS now -- initializeDraft is never retried
    // and no second listing is ever created below, no matter what
    // happens here. Matches the exact partial-write safety rule the
    // Phase 1D frontend orchestration used to implement itself.
    try {
      finalListing = await saveDraft(locationId, created.listingLocationId, scope, optional);
    } catch (err) {
      enrichmentFailed = true;
      enrichmentError = err instanceof StadtpocketManagerError ? err.message : 'Unbekannter Fehler beim Speichern zusätzlicher Angaben.';
    }
  }

  return { listing: finalListing, enrichmentFailed, enrichmentError };
}

// Phase 1G.1 — multi-location counterpart to createDraftFromReview
// above, for the case that function cannot express: an AI research
// result with MORE THAN ONE verified, city-relevant location (e.g. the
// real Bäckerei Betz, 8 branches in Ulm). Creates ONE
// StadtPocketListing plus one StadtPocketListingLocation PER included
// location, never one listing per location -- see
// initializeMultiLocationDraft's own header comment in
// stadtpocketManagerService.js for exactly why that distinction matters
// (the public city directory shows one card per listing, see
// stadtpocketPublicService.js's listCityBusinesses()). A single-location
// result still goes through createDraftFromReview above, completely
// unchanged -- this function is only ever called when the Admin's
// reviewed candidate has 2+ locations.
//
// body: { listing: { name, category, shortDescription, subCategory?,
// tags?, longDescription? }, locations: [{ address, phone?, website?,
// hours?, latitude?, longitude? }, ... ] }.
//
// Duplicate protection, precisely scoped (same honesty as
// createDraftFromReview's own header comment): this re-checks the BRAND
// identity (name, and the first location's website if one is present --
// there is no single brand-level website field in this schema; website
// lives on StadtPocketListingLocation, see that model's own comment)
// fresh, immediately before creation. If "Bäckerei Betz" already exists
// as a listing in this city, the ENTIRE batch is refused before any row
// is written -- never a partial create.
//
// Known, acknowledged gap (not hidden -- see this feature's own final
// report): this does NOT yet check each individual proposed address
// against existing StadtPocketListingLocation rows in the city
// (a LOCATION-level duplicate, e.g. one of the 8 addresses already
// exists as its own separately-entered row from a different source).
// Only the PARENT/brand-level duplicate is checked. Closing that fully
// is a real, separate piece of work -- flagged for the next phase
// rather than forced in here.
async function createMultiLocationDraftFromReview(locationId, scope, body) {
  authorizeLocationAccess(locationId, scope);
  const src = body || {};
  const listing = src.listing || {};
  const firstWebsite = (Array.isArray(src.locations) && src.locations[0] && src.locations[0].website) || undefined;

  const duplicate = await checkForDuplicateListing({
    locationId,
    businessName: listing.name,
    websiteUrl: firstWebsite,
  });
  if (duplicate.status !== DUPLICATE_STATUS.NEW) {
    throw new StadtpocketDuplicateError(duplicate);
  }

  const created = await initializeMultiLocationDraft(locationId, scope, src);
  return { listing: created };
}

module.exports = {
  StadtpocketDuplicateError,
  createDraftFromReview,
  createMultiLocationDraftFromReview,
  // exported for direct unit testing only
  splitRequiredAndOptional,
};
