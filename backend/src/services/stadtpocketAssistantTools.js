/**
 * stadtpocketAssistantTools.js — StadtPocket City Assistant, Phase
 * 2B.1b (StadtPocket-only tools) + Phase 2B.2 (search_city_places,
 * whole-city discovery via Google Places). The tool-execution layer:
 * the four tool definitions Claude may call (Anthropic Messages API
 * `tools` shape) plus the backend code that actually runs one when
 * requested.
 * ─────────────────────────────────────────────────────────────
 * REUSE, NEVER DUPLICATE: every tool below is a thin wrapper around
 * services this codebase already has and already trusts --
 * stadtpocketPublicService.listCityBusinesses/getCityBusiness (the same
 * functions GET /public/stadtpocket/cities/:citySlug/businesses[/:slug]
 * already uses), stadtpocketEventsService.fetchCityEvents (the same
 * function, same 10-minute cache, GET .../events already uses), and
 * (Phase 2B.2) stadtpocketDiscoveryService.callGooglePlacesTextSearch/
 * toCandidate (the EXACT SAME Google Places (New) Text Search HTTP
 * integration, FIELD_MASK/cost tier, and raw-response parser the
 * existing admin "AI Business Discovery" feature already uses). No new
 * database query, no new event-fetching implementation, no second
 * "all offers in a city" endpoint, no second Google Places integration
 * -- the offers tool reproduces the exact "list businesses -> fetch
 * each one's detail -> collect published, non-expired offers"
 * aggregation the stadtpocket-web frontend's own resolveCityOffers()
 * already established as the proven pattern for this (no dedicated
 * all-city-offers backend endpoint exists -- confirmed in the Phase 2A
 * architecture inspection).
 *
 * TRUST BOUNDARY: every executor takes citySlug as its own first,
 * explicit argument, supplied only by stadtpocketAssistantService.js
 * from the ALREADY server-resolved city (findCityLocation()'s result).
 * None of the four tool input_schema definitions below expose a city/
 * citySlug parameter to the model at all -- Claude has no argument slot
 * to put one in, so there is no field to ignore-if-present; the trusted
 * city is structurally the only one that can ever reach these
 * executors, matching the task's own "Claude must NEVER be allowed to
 * select another citySlug through tool arguments" rule by construction,
 * not by a runtime check that could be forgotten. search_city_places
 * re-resolves the city NAME (not just the slug) from that same trusted
 * citySlug via findCityLocation() -- see executeSearchPlaces below.
 *
 * RESULT SHAPE: every result object executeTool() returns is already
 * tagged `origin`/`partnerStatus` by this file's own code -- never left
 * for the model to add, matching the task's explicit "do not rely on
 * Claude to add these fields" rule. StadtPocket tools tag
 * `origin: "stadtpocket"` / `partnerStatus: "partner"`; search_city_places
 * (Phase 2B.2) tags `origin: "external"` / `partnerStatus: "none"` --
 * the exact shape stadtpocketAssistantService.js's own header comment
 * already anticipated, so the response contract itself never needed to
 * change.
 *
 * COST CONTROL: every executor caps how many results it returns BEFORE
 * anything reaches Claude's context (MAX_*_RESULTS below) -- an
 * unbounded StadtPocket dataset, or an unbounded Google Places result
 * set, is never dumped into the model. search_city_places also requests
 * exactly MAX_PLACE_RESULTS from Google itself (never more than will
 * ever be shown).
 *
 * NEVER THROWS past executeTool(): an unknown tool name, a malformed
 * argument, or the underlying service itself failing (e.g.
 * fetchCityEvents' own documented "throws on a real fetch/parse
 * failure" contract, or callGooglePlacesTextSearch's own "never throws,
 * resolves to a { status, places } shape" contract) all resolve to a
 * safe, empty-or-partial result with an honest `error` field for the
 * orchestrator's own logging -- matching this codebase's established
 * "an external/data call never throws past its own wrapper" convention
 * used throughout stadtpocketWebResearchService.js/
 * stadtpocketDiscoveryService.js.
 * ─────────────────────────────────────────────────────────────
 */

const { listCityBusinesses, getCityBusiness, findCityLocation } = require('./stadtpocketPublicService');
const { fetchCityEvents } = require('./stadtpocketEventsService');
// Phase 2B.2 -- reused, not reimplemented: callGooglePlacesTextSearch is
// the EXACT same Google Places (New) Text Search HTTP integration
// stadtpocketDiscoveryService.js's own admin-facing "AI Business
// Discovery" feature already uses (same endpoint, same FIELD_MASK/cost
// tier, same GOOGLE_PLACES_API_KEY, same never-throws-on-provider-
// failure contract). toCandidate/DEFAULT_COUNTRY are reused too, so the
// raw-Google-object parsing and the "<query> in <city>, <country>" query
// shape live in exactly one place in this codebase. This file adds a
// second, DIFFERENT-shaped consumer of that same output
// (toPlaceResult below) -- it does not touch, wrap, or duplicate the
// HTTP call itself.
const { callGooglePlacesTextSearch, toCandidate, DEFAULT_COUNTRY, PROVIDER_STATUS: PLACES_PROVIDER_STATUS } = require('./stadtpocketDiscoveryService');

// Hard ceilings applied at execution time, before results ever reach
// Claude's context -- independent of, and always at least as strict
// as, any future per-request UI display cap. Small on purpose: these
// bound both Anthropic token cost per tool call and how much of
// StadtPocket's real dataset one conversation turn can pull in.
const MAX_BUSINESS_RESULTS = 8;
const MAX_OFFER_RESULTS = 8;
const MAX_EVENT_RESULTS = 6;
// Phase 2B.2's own target (5 per call), comfortably under its stated
// hard maximum of 8 -- Google Places is a variable-cost provider, so
// this also doubles as the exact `pageSize` requested from Google
// itself (never asking for more than we will ever show).
const MAX_PLACE_RESULTS = 5;
// How many businesses' own detail pages the offers tool will fetch
// while aggregating -- bounds DB load for a broad/unfiltered "what
// offers are there" question the same way MAX_OFFER_RESULTS bounds the
// final result count; distinct from it because most businesses
// contribute zero offers, so this must be allowed to look at more
// businesses than MAX_OFFER_RESULTS to have a real chance of finding
// that many.
const MAX_OFFER_AGGREGATION_BUSINESSES = 12;

// Anthropic Messages API `tools` shape. Deliberately minimal input
// schemas -- only the argument each search genuinely needs, per the
// task's own "minimum arguments actually needed" rule. No city/
// citySlug field on any of them -- see this file's header comment for
// why that is a structural guarantee, not a convention to remember.
const TOOL_DEFINITIONS = [
  {
    name: 'search_stadtpocket_businesses',
    description:
      "Search StadtPocket's own published business directory for this city. Returns ONLY real businesses that are registered StadtPocket partners -- this is a curated partner list, never the whole city's businesses. Use this for a question about a specific StadtPocket business, or to check whether StadtPocket has any partner matching a name or category.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Optional: match against the business's name." },
        category: {
          type: 'string',
          description:
            "Optional: match against the business's own published category or subCategory. Use a category StadtPocket itself would plausibly use (e.g. a cuisine, a business type) -- never invent a category system.",
        },
      },
    },
  },
  {
    name: 'search_stadtpocket_offers',
    description:
      "Search StadtPocket's own published, currently active offers/deals from businesses in this city. Optionally filter to one business by name (e.g. to check whether a specific business currently has an offer). Returns ONLY real, published, non-expired offers -- an empty result honestly means no matching business currently has an active offer, never that one should be assumed.",
    input_schema: {
      type: 'object',
      properties: {
        businessName: { type: 'string', description: 'Optional: only offers from the business matching this name.' },
      },
    },
  },
  {
    name: 'search_stadtpocket_events',
    description:
      "Fetch StadtPocket's real, currently upcoming events for this city, sourced live from the official city event feed. Returns ONLY real, currently-upcoming events in chronological order -- never invents one, and an empty result honestly means nothing is currently listed as upcoming.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_city_places',
    description:
      "Searches real, live businesses/places anywhere in this city via Google Places -- NOT limited to StadtPocket's own registered partners. Use this for broader city-wide discovery questions (e.g. 'Italian restaurants', 'where can I get coffee', 'find an optician', 'where can I buy shoes') that StadtPocket's own business/offer/event tools cannot answer, since those only ever cover StadtPocket's own partners. A place returned here is a real business, but it is NOT a StadtPocket partner unless a StadtPocket tool also returned it.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            "A natural-language search for a kind of business/place, e.g. 'Italienisches Restaurant', 'coffee', 'Friseur', 'Optiker'. The city itself is already fixed server-side -- never include a city name in this query.",
        },
      },
      required: ['query'],
    },
  },
];

function matchesQuery(haystack, needle) {
  if (!needle) return true;
  if (typeof haystack !== 'string' || !haystack) return false;
  return haystack.toLowerCase().includes(String(needle).trim().toLowerCase());
}

// A non-string/garbage argument is simply treated as "no filter given"
// rather than rejected outright -- the one thing that must never be
// wrong here (which city) is structurally guaranteed elsewhere (see
// header comment), so a malformed optional filter degrading to "return
// broader, still-real results" is the honest, safe behavior, not a
// hard failure.
function stringArgOrUndefined(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function executeSearchBusinesses(citySlug, args = {}) {
  const list = await listCityBusinesses(citySlug);
  if (!list) return { results: [], sources: [] };

  const query = stringArgOrUndefined(args.query);
  const category = stringArgOrUndefined(args.category);

  const filtered = list.businesses.filter((b) => {
    if (query && !matchesQuery(b.name, query)) return false;
    if (category && !matchesQuery(b.category, category) && !matchesQuery(b.subCategory, category)) return false;
    return true;
  });

  const results = filtered.slice(0, MAX_BUSINESS_RESULTS).map((b) => ({
    type: 'business',
    origin: 'stadtpocket',
    partnerStatus: 'partner',
    slug: b.slug,
    name: b.name,
    subLabel: b.subCategory || b.category,
    image: (b.headerImage && b.headerImage.url) || undefined,
  }));

  return { results, sources: results.length ? [{ type: 'stadtpocket', label: 'StadtPocket' }] : [] };
}

async function executeSearchOffers(citySlug, args = {}) {
  const list = await listCityBusinesses(citySlug);
  if (!list) return { results: [], sources: [] };

  const businessNameFilter = stringArgOrUndefined(args.businessName);
  const candidates = businessNameFilter
    ? list.businesses.filter((b) => matchesQuery(b.name, businessNameFilter))
    : list.businesses;

  const results = [];
  for (const business of candidates.slice(0, MAX_OFFER_AGGREGATION_BUSINESSES)) {
    if (results.length >= MAX_OFFER_RESULTS) break;
    // eslint-disable-next-line no-await-in-loop -- sequential by design,
    // same tradeoff resolveCityOffers() (stadtpocket-web) already
    // accepts: one business's own detail fetch failing must never abort
    // the whole aggregation (see the try/catch below), which a
    // Promise.all would make harder to reason about for no real benefit
    // at this small, already-capped business count.
    let detail;
    try {
      detail = await getCityBusiness(citySlug, business.slug);
    } catch (err) {
      console.error(`[stadtpocketAssistantTools] search_stadtpocket_offers: business detail fetch failed for "${business.slug}": ${err.message}`);
      continue;
    }
    if (!detail) continue;
    for (const location of detail.locations || []) {
      for (const offer of location.offers || []) {
        if (results.length >= MAX_OFFER_RESULTS) break;
        results.push({
          type: 'offer',
          origin: 'stadtpocket',
          partnerStatus: 'partner',
          slug: business.slug,
          name: detail.name,
          subLabel: offer.offerText || offer.title,
          image: (offer.image && offer.image.url) || undefined,
        });
      }
    }
  }

  return { results, sources: results.length ? [{ type: 'stadtpocket', label: 'StadtPocket' }] : [] };
}

async function executeSearchEvents(citySlug) {
  let raw;
  try {
    raw = await fetchCityEvents(citySlug);
  } catch (err) {
    // fetchCityEvents() documents that it throws on a real fetch/parse
    // failure rather than returning a fabricated empty success -- this
    // is the one place that distinction is caught and turned into the
    // same honest "no results" shape every other tool failure produces,
    // per this file's own never-throws-past-executeTool rule.
    console.error(`[stadtpocketAssistantTools] search_stadtpocket_events failed: ${err.message}`);
    return { results: [], sources: [], error: 'events are temporarily unavailable' };
  }
  if (!raw) return { results: [], sources: [] }; // no event source configured for this city yet -- honest, not an error

  const results = raw.events.slice(0, MAX_EVENT_RESULTS).map((e) => ({
    type: 'event',
    origin: 'stadtpocket',
    partnerStatus: 'partner',
    id: e.id,
    name: e.title,
    subLabel: e.venue,
    date: e.startDate,
    url: e.url,
    image: e.image,
  }));

  return { results, sources: results.length ? [{ type: 'stadtpocket', label: 'StadtPocket Events (Stadt Ulm)' }] : [] };
}

// Maps ONE real Google Places (New) `place` object -- via toCandidate(),
// the EXACT SAME raw-object parser stadtpocketDiscoveryService.js's own
// admin Discovery feature already uses -- onto the Assistant's
// structured-result contract. `origin`/`partnerStatus` are hardcoded
// literals assigned by THIS backend code, never left for Claude to
// decide (same rule the StadtPocket tools' own results already follow):
// a place found via Google is real, but it is never presented as a
// StadtPocket partner. Only fields toCandidate() actually extracted from
// the real response are included -- nothing here is ever fabricated.
// `url` (candidate.website) is included because it is already part of
// the existing FIELD_MASK (no extra Google cost) and is the only
// sensible call-to-action link for an external, non-StadtPocket result
// (there is no internal /business/:slug route for it). rating/
// ratingCount/openNow are deliberately NOT included: the reused
// FIELD_MASK/callGooglePlacesTextSearch never requests or returns them,
// and expanding that shared field mask (used by the admin Discovery
// feature too) is out of scope for this phase -- see this file's
// top-of-file comment.
function toPlaceResult(place) {
  const candidate = toCandidate(place);
  if (!candidate.name) return null; // no name -- not a real, displayable place
  const result = {
    type: 'place',
    origin: 'external',
    partnerStatus: 'none',
    id: candidate.sourceId,
    name: candidate.name,
  };
  result.subLabel = candidate.category || candidate.address || undefined;
  if (candidate.address) result.address = candidate.address;
  if (candidate.coordinates) {
    result.latitude = candidate.coordinates.latitude;
    result.longitude = candidate.coordinates.longitude;
  }
  if (candidate.website) result.url = candidate.website;
  return result;
}

async function executeSearchPlaces(citySlug, args = {}) {
  const query = stringArgOrUndefined(args.query);
  if (!query) return { results: [], sources: [] }; // no real query to search -- never call Google with a garbage/empty one

  // The city name (not just the slug) is required to build a real
  // Google text query ("<query> in <city>, <country>", the exact same
  // shape discoverBusinesses() already uses) -- re-resolved here from
  // the TRUSTED citySlug the orchestrator already validated, never from
  // any model-supplied value (search_city_places' own input_schema has
  // no city/citySlug property at all -- see this file's header comment
  // for why that is a structural guarantee).
  const cityLocation = await findCityLocation(citySlug);
  if (!cityLocation) return { results: [], sources: [], error: 'city is temporarily unavailable' };

  const searchText = `${query} in ${cityLocation.name}, ${DEFAULT_COUNTRY}`;
  const providerResult = await callGooglePlacesTextSearch(searchText, MAX_PLACE_RESULTS);

  if (providerResult.status !== PLACES_PROVIDER_STATUS.OK) {
    // Covers NOT_CONFIGURED (no GOOGLE_PLACES_API_KEY) and UNAVAILABLE
    // (timeout/rejected/malformed) alike -- callGooglePlacesTextSearch's
    // own never-throws contract already turned every provider failure
    // into this one honest shape; this executor never sees a raw
    // Google error.
    return { results: [], sources: [], error: 'broader city search is temporarily unavailable' };
  }

  const results = providerResult.places.slice(0, MAX_PLACE_RESULTS).map(toPlaceResult).filter(Boolean);

  return { results, sources: results.length ? [{ type: 'external', label: 'Google Places' }] : [] };
}

const TOOL_EXECUTORS = {
  search_stadtpocket_businesses: executeSearchBusinesses,
  search_stadtpocket_offers: executeSearchOffers,
  search_stadtpocket_events: executeSearchEvents,
  search_city_places: executeSearchPlaces,
};

/**
 * The one entry point the orchestrator calls. `citySlug` is always the
 * caller's own trusted, already-resolved value (see header comment) --
 * never read from `args`. Never throws: an unknown tool name, a
 * malformed args object, or the underlying executor itself throwing all
 * resolve to the same safe `{ results: [], sources: [], error }` shape.
 */
async function executeTool(name, citySlug, args) {
  const executor = TOOL_EXECUTORS[name];
  if (!executor) {
    console.error(`[stadtpocketAssistantTools] unknown tool requested: ${name}`);
    return { results: [], sources: [], error: `Unknown tool: ${name}` };
  }
  const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  try {
    return await executor(citySlug, safeArgs);
  } catch (err) {
    console.error(`[stadtpocketAssistantTools] ${name} failed: ${err.message}`);
    return { results: [], sources: [], error: 'This tool is temporarily unavailable.' };
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  MAX_BUSINESS_RESULTS,
  MAX_OFFER_RESULTS,
  MAX_EVENT_RESULTS,
  MAX_OFFER_AGGREGATION_BUSINESSES,
  MAX_PLACE_RESULTS,
  // exported for direct unit testing only
  executeSearchBusinesses,
  executeSearchOffers,
  executeSearchEvents,
  executeSearchPlaces,
  toPlaceResult,
  matchesQuery,
};
