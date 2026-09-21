// stadtpocketEventsService.js — StadtPocket public "Events in Ulm"
// source, read-only, no database model.
//
// ARCHITECTURE (multi-city, per docs/STADTPOCKET_DEALS_ARCHITECTURE.md's
// same city-keyed convention -- see the stadtpocket-web repo's own
// research report on this feature for the full investigation):
//
//   citySlug -> EVENT_SOURCES[citySlug] (a static config: which real
//   external event feed this city uses, and its parser type)
//   -> fetch the raw feed
//   -> parse into the source's own raw shape
//   -> normalize into ONE shared StadtPocket event contract
//   -> cached briefly, returned to the public route
//
// Only Ulm is configured today. Adding Stuttgart/München later means
// adding one more EVENT_SOURCES entry (+ a parser for whatever format
// that city's source turns out to be, if different) -- never touching
// the normalized contract shape or the route/service call sites.
//
// Ulm's source: the City of Ulm's own official, CC0-licensed open-data
// event feed (Stadt Ulm "Digitale Agenda", datenhub.ulm.de dataset
// "Veranstaltungsdaten in Ulm und Neu-Ulm"), generated live by the
// city's own "LeoEvent" municipal event system. No API key, no auth,
// publicly fetchable server-side. It sends no CORS headers at all
// (confirmed by direct inspection), so it cannot be fetched from a
// browser -- this service exists specifically to make that fetch
// server-side and expose a same-origin StadtPocket API instead.
//
// The feed is XML but is served with an incorrect `text/html`
// Content-Type by the city's own server (a known quirk, not something
// this code can fix) -- never rely on the response's Content-Type
// header, always parse the body as XML/text directly.
//
// No XML parsing library exists in this backend's dependencies. The
// feed's structure is small, stable, and well-understood (verified by
// direct inspection of the live response) -- parsed here with plain,
// scoped regexes rather than adding a new dependency for one feed,
// matching this codebase's existing convention of lightweight
// regex-based extraction for fetched external content (see
// stadtpocketImageDiscoveryService.js).

const EVENT_SOURCES = {
  ulm: {
    type: 'leoevent-rss',
    feedUrl:
      'https://veranstaltungen.ulm.de/leoonline/portals/ulm/veranstaltungen/templates/rss_events.groovy?data_source=evt_rssfeed_ulm_events',
  },
};

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes -- the feed is itself a live, city-managed rolling window; this only avoids re-fetching on every single page load.

const cache = new Map(); // citySlug -> { fetchedAt, events }

function decodeXmlEntities(value) {
  if (!value) return value;
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(text, tag) {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return null;
  const value = decodeXmlEntities(match[1]).trim();
  return value ? value : null;
}

function extractBlock(text, tag) {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : '';
}

/**
 * Parses one <item>...</item> chunk from the Ulm LeoEvent RSS feed into
 * its raw source fields. Scoped sub-extraction (<staette>/<veranstalter>
 * both contain a <bezeichnung> -- venue name vs organizer name -- so each
 * is read from within its own block only, never the whole item, which
 * would risk picking up the wrong one).
 */
function parseLeoEventItem(itemXml, id) {
  const title = extractTag(itemXml, 'title');
  if (!title) return null;

  const termin = extractBlock(itemXml, 'termin');
  const jahr = extractTag(termin, 'jahr');
  const monat = extractTag(termin, 'monat');
  const tag = extractTag(termin, 'tag');
  if (!jahr || !monat || !tag) return null; // no usable date -- not a displayable event
  const startDate = `${jahr}-${monat.padStart(2, '0')}-${tag.padStart(2, '0')}`;
  const time = extractTag(termin, 'uhrzeit');

  const staette = extractBlock(itemXml, 'staette');
  const venue = extractTag(staette, 'bezeichnung');
  const strasse = extractTag(staette, 'strasse');
  const hausnr = extractTag(staette, 'hausnr');
  const plz = extractTag(staette, 'plz');
  const ort = extractTag(staette, 'ort');
  const venueAddressParts = [
    strasse && hausnr ? `${strasse} ${hausnr}` : strasse,
    plz && ort ? `${plz} ${ort}` : ort,
  ].filter(Boolean);
  const venueAddress = venueAddressParts.length ? venueAddressParts.join(', ') : null;

  const veranstalter = extractBlock(itemXml, 'veranstalter');
  const organizer = extractTag(veranstalter, 'bezeichnung');

  // <preise>, when non-empty, contains its own nested structured XML
  // (one or more <preis><preisart>/<preiswert>/<waehrung></preis>
  // tiers, e.g. adult/reduced/child pricing) -- confirmed by direct
  // inspection of the live feed. Properly normalizing that multi-tier
  // shape is real, non-trivial work with no consumer today (the
  // approved Emergent Events.jsx design has no cost/price field at
  // all) -- rather than leak raw inner XML into a `cost` string or
  // half-parse it, this field is intentionally omitted entirely for
  // now. Revisit only if/when a UI actually needs to show pricing.

  // <bild>/<link>/<category> all live outside <description>, once per
  // item -- safe to extract directly from the whole item chunk.
  const image = extractTag(itemXml, 'bild');
  const url = extractTag(itemXml, 'link');
  const category = extractTag(itemXml, 'category');

  return { id, title, startDate, time, venue, venueAddress, organizer, image, url, category };
}

/**
 * Maps one parsed raw LeoEvent item into the shared StadtPocket event
 * contract. Every field is either copied through or omitted -- nothing
 * here is ever invented. No endDate: the source feed has no end-date/
 * date-range field of any kind (confirmed by direct inspection of the
 * live response) -- a multi-day event is represented here by whatever
 * single date the source itself lists, never a guessed range.
 */
function toNormalizedEvent(raw) {
  const event = { id: raw.id, title: raw.title, startDate: raw.startDate, url: raw.url };
  if (raw.time) event.time = raw.time;
  if (raw.venue) event.venue = raw.venue;
  if (raw.venueAddress) event.venueAddress = raw.venueAddress;
  if (raw.organizer) event.organizer = raw.organizer;
  if (raw.category) event.category = raw.category;
  if (raw.image) event.image = raw.image;
  return event;
}

/**
 * Parses the full raw LeoEvent RSS body into normalized StadtPocket
 * events. Exported for direct unit testing against fixture text, no
 * network call needed.
 */
function parseLeoEventFeed(xmlText) {
  if (!xmlText) return [];
  const itemRegex = /<item\s+id="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
  const events = [];
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const [, id, itemXml] = match;
    const raw = parseLeoEventItem(itemXml, id);
    if (raw) events.push(toNormalizedEvent(raw));
  }
  return events;
}

async function fetchLeoEventFeed(feedUrl, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(feedUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Ulm event feed returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Only events today-or-later, sorted chronologically ascending -- never
 * ranked by any guessed "importance"/"popularity". A source item dated
 * in the past (the feed is documented as a rolling "today + 9 days"
 * window but was observed, in practice, to also include at least one
 * long-running exhibition listed under its original start date) is
 * excluded here rather than shown as if it were upcoming.
 */
function selectUpcoming(events, now = new Date()) {
  const todayKey = now.toISOString().slice(0, 10);
  return events
    .filter((e) => e.startDate >= todayKey)
    .sort((a, b) => (a.startDate + (a.time || '')).localeCompare(b.startDate + (b.time || '')));
}

/**
 * Resolves a city's current upcoming events.
 *
 * Returns:
 *   { city: citySlug, events: [...] }  -- success, events may be [] (an
 *     honest empty result, e.g. genuinely nothing upcoming today).
 *   null -- citySlug has no configured event source (public route
 *     treats this as 404, matching listCityBusinesses()'s own
 *     "unconfigured city" convention).
 *
 * Throws on a real fetch/parse failure -- the caller (route handler)
 * is responsible for turning that into a 500, exactly like every other
 * stadtpocketPublicService function. Never silently returns a
 * fabricated/empty-looking success on failure.
 *
 * fetchImpl is injectable purely so this is unit-testable without a
 * real network call.
 */
async function fetchCityEvents(citySlug, fetchImpl = fetch) {
  const source = EVENT_SOURCES[String(citySlug || '').toLowerCase()];
  if (!source) return null;

  const cached = cache.get(citySlug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { city: citySlug, events: selectUpcoming(cached.events) };
  }

  const xmlText = await fetchLeoEventFeed(source.feedUrl, fetchImpl);
  const events = parseLeoEventFeed(xmlText);
  cache.set(citySlug, { fetchedAt: Date.now(), events });
  return { city: citySlug, events: selectUpcoming(events) };
}

module.exports = {
  fetchCityEvents,
  parseLeoEventFeed, // exported for direct unit testing only
  selectUpcoming, // exported for direct unit testing only
  _resetCacheForTests: () => cache.clear(), // exported for direct unit testing only
};
