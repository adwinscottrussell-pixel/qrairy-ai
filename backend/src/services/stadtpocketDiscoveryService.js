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
 * FieldMask / cost tier (Step 4) -- deliberately Pro-tier ONLY:
 *   places.id, places.displayName, places.formattedAddress,
 *   places.location, places.types, places.addressComponents
 * These are Places API Text Search PRO SKU fields ($32/1000 requests,
 * 5,000 free events/month). places.websiteUri and
 * places.nationalPhoneNumber require the separate, more expensive
 * ENTERPRISE SKU ($35/1000 requests, only 1,000 free events/month) --
 * NOT requested here. That is not an oversight: this phase's own
 * architecture is "cheap discovery -> human selection -> deeper
 * enrichment only for selected businesses," and Phase 1G's existing
 * website-scraping research already exists as exactly that enrichment
 * step for whichever candidates a manager actually selects. Paying the
 * Enterprise rate on every one of ~10 discovery candidates just to
 * pre-fill a website field that Phase 1G would re-derive from the
 * business's own site anyway is the "automatically request higher-cost
 * fields" this phase was explicitly told not to do. `website` is
 * therefore always null on a DiscoveryCandidate.
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
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents';

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
    website: null, // see this file's header comment -- Enterprise-SKU-only field, never requested at discovery time
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
    return { status: providerResult.status, candidates: [] };
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

  // Step 8 -- reuse the EXISTING duplicate service (never a second
  // engine) against StadtPocket's own data, per surviving candidate.
  // Read-only; matches checkForDuplicateListing's own contract exactly
  // -- never mutates anything.
  const candidates = [];
  for (const candidate of deduped) {
    const dup = await checkForDuplicateListing({
      locationId,
      businessName: candidate.name,
      websiteUrl: candidate.website,
      phone: null,
      address: candidate.address,
    });
    candidates.push({ ...candidate, duplicateStatus: dup.status });
  }

  return { status: PROVIDER_STATUS.OK, candidates };
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
  // exported for direct unit testing only
  validateCategory,
  validateQuantity,
  resolveCityName,
  toCandidate,
  normalizeForDedupe,
  extractAddressComponent,
  callGooglePlacesTextSearch,
};
