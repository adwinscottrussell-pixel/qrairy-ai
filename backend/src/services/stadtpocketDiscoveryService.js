/**
 * stadtpocketDiscoveryService.js — Phase 1H.2 (AI Business Discovery).
 * ─────────────────────────────────────────────────────────────
 * Answers "find me ~10 real Fitness businesses in Ulm" -- a DIFFERENT
 * question from Phase 1G's stadtpocketResearchService.js, which only
 * ever researches ONE already-identified business/website. Neither
 * Firecrawl nor Anthropic is a city+category -> businesses discovery
 * provider; this file exists specifically because that capability did
 * not exist anywhere in this codebase before Phase 1H.1's architecture
 * inspection confirmed the gap. Kept fully separate from
 * stadtpocketResearchService.js on purpose -- discovery and research
 * are different operations with different providers, different cost
 * models, and different output shapes (a transient review candidate
 * here vs. a persisted draft there).
 *
 * Provider: Google Places API (New), Text Search (New)
 *   POST https://places.googleapis.com/v1/places:searchText
 * Verified against Google's current documentation (2026-09-20):
 * Text Search (New) is the correct product for a free-text
 * "<category> in <city>, <country>" query with no radius (Nearby
 * Search requires a radius, which we do not have or want here).
 *
 * FieldMask / cost tier (Step 4, revised Phase 1H.4.1) --
 *   places.id, places.displayName, places.formattedAddress,
 *   places.location, places.types, places.addressComponents,
 *   places.websiteUri
 * The first six are Places API Text Search PRO SKU fields ($32/1000
 * requests, 5,000 free events/month). places.websiteUri requires the
 * separate, more expensive ENTERPRISE SKU ($35/1000 requests, only
 * 1,000 free events/month) -- Phase 1H.2 deliberately left it out on
 * cost grounds, but a real Ulm/Fitness test (Phase 1H.4.1) proved
 * Phase 1G's own research pipeline needs a real website to do anything
 * useful at all: TopFit Ulm has a real, known site
 * (https://www.topfit.fitness/ulm/), yet without websiteUri the
 * discovery candidate reached research with website: null and produced
 * "keine Website angegeben" -- research never even had a URL to try.
 * That defeats this phase's own "Google Places -> candidate.website ->
 * Phase 1G research -> Firecrawl/Anthropic" design, so websiteUri is
 * now requested -- the ONE additional field genuinely required, not a
 * blanket upgrade (nationalPhoneNumber is still never requested).
 * `nationalPhoneNumber` does not change the SKU further since
 * websiteUri already puts every request on Enterprise; it remains
 * unrequested simply because nothing downstream needs it yet.
 *
 * Storage/caching (Step 12): DiscoveryCandidate is transient -- no
 * Prisma model, no migration, nothing here is written to the database.
 * Per Google's ToS, only place_id (sourceId here) may be cached
 * indefinitely; every other field must be treated as live/ephemeral.
 * This service never persists ANY field, place_id included, so that
 * restriction is satisfied trivially -- there is no cache to design.
 *
 * Never throws for a provider failure -- callGooglePlacesTextSearch
 * always resolves to a { status, places } shape (PROVIDER_STATUS.OK /
 * NOT_CONFIGURED / UNAVAILABLE), matching this repo's established
 * injectable-fetch, never-throw-on-provider-failure convention (see
 * stadtpocketWebResearchService.js's own header comment for the same
 * pattern applied to Firecrawl). `fetchImpl` is injectable purely so
 * this is unit-testable with no real network call.
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');
const { authorizeLocationAccess } = require('./stadtpocketManagerService');
const { checkForDuplicateListing } = require('./stadtpocketDuplicateService');
// Reused, not reimplemented -- this is the EXACT same "Ulm != Neu-Ulm"
// normalized-equality rule Phase 1G's own multi-location city filter
// (splitLocationCandidates) already established and this codebase
// already relies on: strip a leading postal code, lowercase, compare
// with strict ===, never substring-match ("ulm" must never match
// inside "neu-ulm").
const { normalizeCityName } = require('./stadtpocketResearchService');

class StadtpocketDiscoveryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_QUANTITY = 10;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 20;
// StadtPocket is a Germany-only product today (every existing city --
// Ulm, Stuttgart, Neu-Ulm -- is German); Location has no country field
// to derive this from, so it is a fixed server-side constant, never
// accepted from the request body (same "never trust frontend city
// context" principle applied to country).
const DEFAULT_COUNTRY = 'Germany';

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_TIMEOUT_MS = 10000;
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents,places.websiteUri';

const PROVIDER_STATUS = {
  OK: 'ok',
  NOT_CONFIGURED: 'provider-not-configured',
  UNAVAILABLE: 'provider-unavailable',
};

function validateCategory(category) {
  if (typeof category !== 'string' || !category.trim()) {
    throw new StadtpocketDiscoveryError('category is required.');
  }
  const trimmed = category.trim();
  if (trimmed.length > 80) {
    throw new StadtpocketDiscoveryError('category must be 80 characters or fewer.');
  }
  return trimmed;
}

function validateQuantity(quantity) {
  if (quantity === undefined || quantity === null) return DEFAULT_QUANTITY;
  if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    throw new StadtpocketDiscoveryError(`quantity must be an integer between ${MIN_QUANTITY} and ${MAX_QUANTITY}.`);
  }
  return quantity;
}

// Not reused from stadtpocketResearchService.js's own resolveCityName --
// that one is a private, unexported helper there, and discovery has a
// different failure requirement: research treats an unresolvable city
// as informational-only (cityContext stays null, research continues),
// but discovery CANNOT run a meaningful "<category> in <city>" query
// without a real city name, so this throws instead of silently
// continuing with a broken query.
async function resolveCityName(locationId) {
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { name: true } });
  return (location && location.name) || null;
}

// Google's AddressComponent shape: { longText, shortText, types[] }.
// 'locality' and 'postal_code' are Google's standard, stable geocoding
// type strings (same convention used across the legacy Geocoding API).
function extractAddressComponent(components, type) {
  if (!Array.isArray(components)) return null;
  const match = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
  return match ? match.longText || match.shortText || null : null;
}

// Maps one Places API (New) `place` object onto the DiscoveryCandidate
// contract (Step 5). Pure/no I/O -- duplicateStatus is filled in by the
// caller after this, once the duplicate check has actually run.
function toCandidate(place) {
  const addressComponents = place.addressComponents || [];
  const location = place.location;
  return {
    name: (place.displayName && place.displayName.text) || null,
    website: place.websiteUri || null,
    address: place.formattedAddress || null,
    city: extractAddressComponent(addressComponents, 'locality'),
    postalCode: extractAddressComponent(addressComponents, 'postal_code'),
    category: Array.isArray(place.types) && place.types.length ? place.types[0] : null,
    source: 'google-places',
    sourceId: place.id || null,
    coordinates: location && typeof location.latitude === 'number' && typeof location.longitude === 'number'
      ? { latitude: location.latitude, longitude: location.longitude }
      : null,
    duplicateStatus: null,
  };
}

// Normalization key for Step 9's own-response dedupe -- deliberately
// crude (lowercase + collapsed whitespace on name+address), NOT brand/
// chain consolidation. Two legitimate McFIT locations at two different
// addresses both produce different keys and both survive.
function normalizeForDedupe(name, address) {
  const n = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const a = (address || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${n}|${a}`;
}

// Structured, SAFE-only diagnostics (Step B) -- never the request
// itself, never any header (the api key travels only in
// X-Goog-Api-Key, which is never read back or logged here), never any
// business/candidate data. `detail` is a small, explicitly-built plain
// object (see call sites below), never req/res/headers passed through
// directly, so there is no path for a secret to end up in a log line
// by accident.
function logDiscoveryEvent(event, detail) {
  console.log(`[stadtpocket-discovery] ${event}`, detail);
}

async function callGooglePlacesTextSearch(query, quantity, { fetchImpl = fetch } = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { status: PROVIDER_STATUS.NOT_CONFIGURED, places: [] };

  const startedAt = Date.now();
  let res;
  try {
    res = await fetchImpl(PLACES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, pageSize: quantity }),
      // Zero retries -- no retry loop is implemented at all here, so
      // there is nothing to bound beyond this one request's own
      // timeout. A single hung request still fails cleanly instead of
      // hanging the discovery request indefinitely.
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });
  } catch (err) {
    logDiscoveryEvent('google-places-failure', {
      httpStatus: null,
      googleStatus: null,
      googleErrorMessage: err && err.name === 'TimeoutError' ? 'request timed out' : (err && err.message) || 'network error',
      endpoint: PLACES_ENDPOINT,
      elapsedMs: Date.now() - startedAt,
    });
    return { status: PROVIDER_STATUS.UNAVAILABLE, places: [] };
  }

  // Google's Places API (New) error envelope, when present, is
  // { error: { code, message, status } } -- these three fields only are
  // safe, small, and directly diagnostic; nothing else from the body is
  // ever logged. Read once regardless of res.ok so a non-2xx response's
  // real reason is captured before the body is discarded. A body that
  // fails to parse as JSON at all is its own distinct failure --
  // jsonParseFailed is tracked separately so it is never silently
  // reinterpreted as "zero results" below.
  let body = null;
  let jsonParseFailed = false;
  try {
    body = await res.json();
  } catch {
    jsonParseFailed = true;
  }

  if (!res || !res.ok || jsonParseFailed) {
    const googleError = body && body.error;
    logDiscoveryEvent('google-places-failure', {
      httpStatus: res ? res.status : null,
      googleStatus: googleError ? googleError.status || null : null,
      googleErrorCode: googleError ? googleError.code || null : null,
      googleErrorMessage: googleError ? googleError.message || null : (jsonParseFailed ? 'response body was not valid JSON' : null),
      endpoint: PLACES_ENDPOINT,
      elapsedMs: Date.now() - startedAt,
    });
    return { status: PROVIDER_STATUS.UNAVAILABLE, places: [] };
  }

  const places = Array.isArray(body && body.places) ? body.places : [];
  logDiscoveryEvent('google-places-success', {
    httpStatus: res.status,
    resultCount: places.length,
    elapsedMs: Date.now() - startedAt,
  });
  return { status: PROVIDER_STATUS.OK, places };
}

/**
 * Places API (New) Place Details -- Phase 2B.3. A genuinely SEPARATE,
 * second real Google request per call (Place Details is not bundled
 * into Text Search), reused (not duplicated) by the City Assistant's
 * get_city_place_details tool (stadtpocketAssistantTools.js) -- this
 * function stays scoped to the raw Google HTTP call + never-throws
 * status shape, matching callGooglePlacesTextSearch's own contract
 * exactly; response mapping into the Assistant's own result shape lives
 * in the tool layer, not here (same separation of concerns as
 * toCandidate() staying data-shape-agnostic of any one caller).
 *
 * FIELD MASK (PLACE_DETAILS_FIELD_MASK below) -- every field on it is
 * Enterprise SKU except id/displayName/location (Essentials/Pro, but
 * cost NOTHING extra here since currentOpeningHours/nationalPhoneNumber/
 * rating/userRatingCount already put the whole request on Enterprise --
 * Google bills a mixed-tier request at its single highest tier, not
 * per field, confirmed against Google's own current billing docs).
 * displayName/location are deliberately requested even though the
 * Assistant already has them from the original search result, because
 * (a) that costs nothing extra at this tier and (b) get_city_place_details
 * only ever receives a bare placeId -- with no other source for them,
 * omitting them would mean an unlabeled result card and no coordinates
 * to build a directions link from. Every OTHER already-known field
 * (formattedAddress, websiteUri, types, addressComponents) is still
 * skipped -- there is no equivalent functional need for those here.
 * regularOpeningHours is deliberately skipped too: currentOpeningHours
 * already reflects the real current week including holiday exceptions,
 * which is what "is it open / when does it close today" actually needs.
 * googleMapsUri is skipped -- a dedicated directions deep link is
 * constructed instead (see buildDirectionsUrl in the tool layer), which
 * needs no extra Google field and no extra API key/cost (Google's own
 * Maps URLs scheme, verified current 2026-09-26: no API key required,
 * not a billable Google Maps Platform request).
 */
const PLACE_DETAILS_ENDPOINT_BASE = 'https://places.googleapis.com/v1/places';
const PLACE_DETAILS_TIMEOUT_MS = 10000;
const PLACE_DETAILS_FIELD_MASK = 'id,displayName,currentOpeningHours,nationalPhoneNumber,rating,userRatingCount,location';

async function callGooglePlaceDetails(placeId, { fetchImpl = fetch } = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { status: PROVIDER_STATUS.NOT_CONFIGURED, place: null };

  const endpoint = `${PLACE_DETAILS_ENDPOINT_BASE}/${encodeURIComponent(placeId)}`;
  const startedAt = Date.now();
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
      },
      signal: AbortSignal.timeout(PLACE_DETAILS_TIMEOUT_MS),
    });
  } catch (err) {
    logDiscoveryEvent('google-place-details-failure', {
      httpStatus: null,
      googleStatus: null,
      googleErrorMessage: err && err.name === 'TimeoutError' ? 'request timed out' : (err && err.message) || 'network error',
      endpoint: PLACE_DETAILS_ENDPOINT_BASE,
      elapsedMs: Date.now() - startedAt,
    });
    return { status: PROVIDER_STATUS.UNAVAILABLE, place: null };
  }

  let body = null;
  let jsonParseFailed = false;
  try {
    body = await res.json();
  } catch {
    jsonParseFailed = true;
  }

  if (!res || !res.ok || jsonParseFailed) {
    const googleError = body && body.error;
    logDiscoveryEvent('google-place-details-failure', {
      httpStatus: res ? res.status : null,
      googleStatus: googleError ? googleError.status || null : null,
      googleErrorCode: googleError ? googleError.code || null : null,
      googleErrorMessage: googleError ? googleError.message || null : (jsonParseFailed ? 'response body was not valid JSON' : null),
      endpoint: PLACE_DETAILS_ENDPOINT_BASE,
      elapsedMs: Date.now() - startedAt,
    });
    // Covers a genuinely unknown/malformed placeId too (Google returns a
    // non-2xx for that) -- never a crash, never a fabricated "found
    // nothing" success, just the same honest UNAVAILABLE shape every
    // other provider failure here already resolves to.
    return { status: PROVIDER_STATUS.UNAVAILABLE, place: null };
  }

  logDiscoveryEvent('google-place-details-success', {
    httpStatus: res.status,
    elapsedMs: Date.now() - startedAt,
  });
  return { status: PROVIDER_STATUS.OK, place: body };
}

/**
 * discoverBusinesses({ locationId, scope, category, quantity, fetchImpl })
 * Authorizes locationId against scope exactly like every other
 * StadtPocket manager write/read (authorizeLocationAccess -- a City
 * Manager can only discover within their own city; Global Admin is
 * unrestricted). City name is always derived server-side from
 * locationId, never accepted from the request body. Returns
 * { status, candidates } -- candidates is [] (never fabricated data)
 * whenever status !== 'ok', and [] is also the legitimate result of a
 * genuine zero-result search. Never writes to the database; never
 * calls Anthropic or Firecrawl.
 */
async function discoverBusinesses({ locationId, scope, category, quantity, fetchImpl } = {}) {
  authorizeLocationAccess(locationId, scope);
  const validCategory = validateCategory(category);
  const validQuantity = validateQuantity(quantity);

  const cityName = await resolveCityName(locationId);
  if (!cityName) {
    throw new StadtpocketDiscoveryError('Unable to resolve a city for this location.', 404);
  }

  const query = `${validCategory} in ${cityName}, ${DEFAULT_COUNTRY}`;
  const providerResult = await callGooglePlacesTextSearch(query, validQuantity, { fetchImpl });

  if (providerResult.status !== PROVIDER_STATUS.OK) {
    return { status: providerResult.status, candidates: [], rejectedOutOfCity: 0 };
  }

  // Step 9 -- dedupe the PROVIDER'S OWN response before anything else.
  // Identical sourceId never appears twice; identical normalized
  // name+address never appears twice. No brand/chain consolidation.
  const seenSourceIds = new Set();
  const seenNameAddress = new Set();
  const deduped = [];
  for (const place of providerResult.places) {
    const sourceId = place.id || null;
    if (sourceId) {
      if (seenSourceIds.has(sourceId)) continue;
      seenSourceIds.add(sourceId);
    }
    const candidate = toCandidate(place);
    const key = normalizeForDedupe(candidate.name, candidate.address);
    if (seenNameAddress.has(key)) continue;
    seenNameAddress.add(key);
    deduped.push(candidate);
  }

  // Phase 1H.4.1 -- exact-city filter, BEFORE the duplicate check (no
  // point spending a DB read on a candidate about to be discarded
  // anyway). Reuses normalizeCityName's exact, non-substring equality
  // (see the import comment above): "Ulm" never matches "Neu-Ulm". A
  // candidate whose own locality is missing/unresolvable is rejected
  // too, same "cannot safely determine relevance, never guess" posture
  // stadtpocketResearchService.js's own multi-location filter already
  // uses -- never included on the benefit of the doubt.
  const normalizedTargetCity = normalizeCityName(cityName);
  const inCity = [];
  let rejectedOutOfCity = 0;
  for (const candidate of deduped) {
    if (candidate.city && normalizeCityName(candidate.city) === normalizedTargetCity) {
      inCity.push(candidate);
    } else {
      rejectedOutOfCity += 1;
    }
  }

  // Step 8 -- reuse the EXISTING duplicate service (never a second
  // engine) against StadtPocket's own data, per surviving candidate.
  // Read-only; matches checkForDuplicateListing's own contract exactly
  // -- never mutates anything.
  const candidates = [];
  for (const candidate of inCity) {
    const dup = await checkForDuplicateListing({
      locationId,
      businessName: candidate.name,
      websiteUrl: candidate.website,
      phone: null,
      address: candidate.address,
    });
    candidates.push({ ...candidate, duplicateStatus: dup.status });
  }

  // Never fabricates replacements to reach `quantity` -- candidates is
  // simply whatever survives real, honest filtering, even if that is
  // fewer than requested. rejectedOutOfCity lets the Admin see WHY
  // (e.g. "10 gefunden, 4 außerhalb von Ulm ausgeschlossen") instead of
  // silently wondering why fewer than requested came back.
  return { status: PROVIDER_STATUS.OK, candidates, rejectedOutOfCity };
}

module.exports = {
  StadtpocketDiscoveryError,
  discoverBusinesses,
  PROVIDER_STATUS,
  DEFAULT_QUANTITY,
  MIN_QUANTITY,
  MAX_QUANTITY,
  DEFAULT_COUNTRY,
  PLACES_ENDPOINT,
  FIELD_MASK,
  PLACE_DETAILS_ENDPOINT_BASE,
  PLACE_DETAILS_FIELD_MASK,
  callGooglePlaceDetails,
  // exported for direct unit testing only
  validateCategory,
  validateQuantity,
  resolveCityName,
  toCandidate,
  normalizeForDedupe,
  extractAddressComponent,
  callGooglePlacesTextSearch,
};
