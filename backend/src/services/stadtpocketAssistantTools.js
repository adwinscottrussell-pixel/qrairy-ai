/**
 * stadtpocketAssistantTools.js — StadtPocket City Assistant, Phase
 * 2B.1b. The tool-execution layer: the three tool definitions Claude
 * may call (Anthropic Messages API `tools` shape) plus the backend
 * code that actually runs one when requested.
 * ─────────────────────────────────────────────────────────────
 * REUSE, NEVER DUPLICATE: every tool below is a thin wrapper around
 * services this codebase already has and already trusts --
 * stadtpocketPublicService.listCityBusinesses/getCityBusiness (the same
 * functions GET /public/stadtpocket/cities/:citySlug/businesses[/:slug]
 * already uses) and stadtpocketEventsService.fetchCityEvents (the same
 * function, same 10-minute cache, GET .../events already uses). No new
 * database query, no new event-fetching implementation, no second
 * "all offers in a city" endpoint -- the offers tool reproduces the
 * exact "list businesses -> fetch each one's detail -> collect
 * published, non-expired offers" aggregation the stadtpocket-web
 * frontend's own resolveCityOffers() already established as the proven
 * pattern for this (no dedicated all-city-offers backend endpoint
 * exists -- confirmed in the Phase 2A architecture inspection).
 *
 * TRUST BOUNDARY: every executor takes citySlug as its own first,
 * explicit argument, supplied only by stadtpocketAssistantService.js
 * from the ALREADY server-resolved city (findCityLocation()'s result).
 * None of the three tool input_schema definitions below expose a city/
 * citySlug parameter to the model at all -- Claude has no argument slot
 * to put one in, so there is no field to ignore-if-present; the trusted
 * city is structurally the only one that can ever reach these
 * executors, matching the task's own "Claude must NEVER be allowed to
 * select another citySlug through tool arguments" rule by construction,
 * not by a runtime check that could be forgotten.
 *
 * RESULT SHAPE: every result object executeTool() returns is already
 * tagged `origin: "stadtpocket"` / `partnerStatus: "partner"` by this
 * file's own code -- never left for the model to add, matching the
 * task's explicit "do not rely on Claude to add these fields" rule.
 * The shape is a strict subset of the structured response contract
 * (stadtpocketAssistantService.js's own header comment) -- future
 * external-source tools (Google Places, Phase 2B.2) will produce
 * `origin: "external"` / `partnerStatus: "none"` results in this exact
 * same shape, so the response contract itself never needs to change.
 *
 * COST CONTROL: every executor caps how many results it returns BEFORE
 * anything reaches Claude's context (MAX_*_RESULTS below) -- an
 * unbounded StadtPocket dataset is never dumped into the model.
 *
 * NEVER THROWS past executeTool(): an unknown tool name, a malformed
 * argument, or the underlying service itself failing (e.g.
 * fetchCityEvents' own documented "throws on a real fetch/parse
 * failure" contract) all resolve to a safe, empty-or-partial result
 * with an honest `error` field for the orchestrator's own logging --
 * matching this codebase's established "an external/data call never
 * throws past its own wrapper" convention used throughout
 * stadtpocketWebResearchService.js/stadtpocketDiscoveryService.js.
 * ─────────────────────────────────────────────────────────────
 */

const { listCityBusinesses, getCityBusiness } = require('./stadtpocketPublicService');
const { fetchCityEvents } = require('./stadtpocketEventsService');

// Hard ceilings applied at execution time, before results ever reach
// Claude's context -- independent of, and always at least as strict
// as, any future per-request UI display cap. Small on purpose: these
// bound both Anthropic token cost per tool call and how much of
// StadtPocket's real dataset one conversation turn can pull in.
const MAX_BUSINESS_RESULTS = 8;
const MAX_OFFER_RESULTS = 8;
const MAX_EVENT_RESULTS = 6;
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

const TOOL_EXECUTORS = {
  search_stadtpocket_businesses: executeSearchBusinesses,
  search_stadtpocket_offers: executeSearchOffers,
  search_stadtpocket_events: executeSearchEvents,
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
  // exported for direct unit testing only
  executeSearchBusinesses,
  executeSearchOffers,
  executeSearchEvents,
  matchesQuery,
};
