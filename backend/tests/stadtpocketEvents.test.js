// ============================================================
// stadtpocketEvents.test.js — tests for stadtpocketEventsService.js
// (GET /public/stadtpocket/cities/:citySlug/events) against realistic
// fixture XML matching the live Ulm LeoEvent RSS feed's actual observed
// structure (fetched and inspected directly before writing this
// service -- see docs note in stadtpocketEventsService.js). No real
// network call: fetchCityEvents()'s fetchImpl is injectable.
//
// No test framework dependency, same pattern as
// tests/stadtpocketPublic.test.js.
//
// Run: node tests/stadtpocketEvents.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

const { fetchCityEvents, parseLeoEventFeed, selectUpcoming, _resetCacheForTests } = require(
  path.join(__dirname, '..', 'src', 'services', 'stadtpocketEventsService.js')
);

// One realistic item, matching the live feed's exact observed shape
// (nested <staette>/<veranstalter> both carrying their own
// <bezeichnung>, XML-entity-escaped &amp; in the image URL, empty
// <preise>).
function buildItem({
  id = '52757',
  title = 'Ausstellung: Gesichter des Friedens',
  jahr = '2026',
  monat = '09',
  tag = '25',
  uhrzeit = '08:00',
  venue = 'EinsteinHaus - Ulmer Volkshochschule',
  strasse = 'Kornhausplatz',
  hausnr = '5',
  plz = '89073',
  ort = 'Ulm',
  organizer = 'Friedenswerkstatt Ulm',
  image = 'https://leoevent.ulm.de/leoevent/FileBufferServlet?fileno=311959525&amp;width=600&amp;height=-1',
  category = 'Bildung',
} = {}) {
  return `
            <item id="${id}">
                <title>${title}</title>
                <description>
                    <termin>
<jahr>${jahr}</jahr>
<monat>${monat}</monat>
<tag>${tag}</tag>
<uhrzeit>${uhrzeit}</uhrzeit>
</termin>
                <beschreibung>Eine Veranstaltung</beschreibung>
                <kategorien>
<kategorie>${category}</kategorie>
</kategorien>
<staette>
<bezeichnung>${venue} </bezeichnung>
<teilstaette> </teilstaette>
<strasse>${strasse}</strasse>
<hausnr>${hausnr}</hausnr>
<plz>${plz}</plz>
<ort>${ort}</ort>
</staette>
<bild>${image}</bild>
<veranstalter>
<bezeichnung>${organizer}</bezeichnung>
<strasse></strasse>
<hausnr></hausnr>
<plz></plz>
<ort></ort>
</veranstalter>
<preise></preise>
</description>
                <link>https://veranstaltungen.ulm.de/leoonline/portals/ulm/veranstaltungen/id/${id}/</link>
                <guid>https://veranstaltungen.ulm.de/leoonline/portals/ulm/veranstaltungen/id/${id}/</guid>
                <category>${category}</category>
        </item>`;
}

function buildFeed(items) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
            <title>Stadt ULM Veranstaltungskalender</title>
            <link>https://veranstaltungen.ulm.de/leoonline/portals/ulm/veranstaltungen/</link>
            <description>Veranstaltungen</description>
            <language>de-de</language>
${items.join('\n')}
    </channel>
  </rss>`;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── parseLeoEventFeed ────────────────────────────────────────

test('1. real feed structure parses correctly -- all fields extracted', () => {
  const feed = buildFeed([buildItem()]);
  const events = parseLeoEventFeed(feed);
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.id, '52757');
  assert.equal(e.title, 'Ausstellung: Gesichter des Friedens');
  assert.equal(e.startDate, '2026-09-25');
  assert.equal(e.time, '08:00');
  assert.equal(e.venue, 'EinsteinHaus - Ulmer Volkshochschule');
  assert.equal(e.venueAddress, 'Kornhausplatz 5, 89073 Ulm');
  assert.equal(e.organizer, 'Friedenswerkstatt Ulm');
  assert.equal(e.category, 'Bildung');
  assert.equal(e.url, 'https://veranstaltungen.ulm.de/leoonline/portals/ulm/veranstaltungen/id/52757/');
});

test('2. venue bezeichnung is never confused with organizer bezeichnung (both blocks have one)', () => {
  const feed = buildFeed([buildItem({ venue: 'Stadthaus Ulm', organizer: 'Kulturamt Ulm' })]);
  const e = parseLeoEventFeed(feed)[0];
  assert.equal(e.venue, 'Stadthaus Ulm');
  assert.equal(e.organizer, 'Kulturamt Ulm');
});

test('3. image URL is XML-entity-decoded (&amp; -> &), never left escaped', () => {
  const feed = buildFeed([buildItem()]);
  const e = parseLeoEventFeed(feed)[0];
  assert.equal(e.image, 'https://leoevent.ulm.de/leoevent/FileBufferServlet?fileno=311959525&width=600&height=-1');
});

test('4. multiple real items each parse independently, in feed order', () => {
  const feed = buildFeed([
    buildItem({ id: '1', title: 'Erstes Event', tag: '22' }),
    buildItem({ id: '2', title: 'Zweites Event', tag: '23' }),
  ]);
  const events = parseLeoEventFeed(feed);
  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'Erstes Event');
  assert.equal(events[1].title, 'Zweites Event');
});

test('5. missing venue (no <staette> at all) is handled honestly -- field simply absent, never fabricated', () => {
  const itemWithoutVenue = `
            <item id="99">
                <title>Ohne Ort</title>
                <description>
                    <termin>
<jahr>2026</jahr>
<monat>09</monat>
<tag>25</tag>
<uhrzeit></uhrzeit>
</termin>
                </description>
                <link>https://veranstaltungen.ulm.de/leoonline/portals/ulm/veranstaltungen/id/99/</link>
        </item>`;
  const feed = buildFeed([itemWithoutVenue]);
  const e = parseLeoEventFeed(feed)[0];
  assert.equal('venue' in e, false);
  assert.equal('venueAddress' in e, false);
});

test('6. missing image never produces a fake/placeholder URL -- field simply absent', () => {
  const feed = buildFeed([buildItem({ image: '' })]);
  const e = parseLeoEventFeed(feed)[0];
  assert.equal('image' in e, false);
});

test('7. an item with no usable date is skipped entirely, never included with a guessed date', () => {
  const brokenItem = `
            <item id="88">
                <title>Kaputtes Datum</title>
                <description></description>
                <link>https://veranstaltungen.ulm.de/leoonline/portals/ulm/veranstaltungen/id/88/</link>
        </item>`;
  const feed = buildFeed([brokenItem]);
  assert.equal(parseLeoEventFeed(feed).length, 0);
});

test('8. an item with no title is skipped entirely', () => {
  const noTitle = `
            <item id="77">
                <description><termin><jahr>2026</jahr><monat>09</monat><tag>25</tag><uhrzeit></uhrzeit></termin></description>
                <link>x</link>
        </item>`;
  assert.equal(parseLeoEventFeed(buildFeed([noTitle])).length, 0);
});

test('9. no cost field is ever produced -- <preise> is intentionally unparsed (nested multi-tier XML, no consumer today)', () => {
  const feed = buildFeed([buildItem()]);
  const e = parseLeoEventFeed(feed)[0];
  assert.equal('cost' in e, false);
});

test('10. a genuinely empty feed (no items) parses to an empty array, never an error', () => {
  assert.deepEqual(parseLeoEventFeed(buildFeed([])), []);
});

// ── selectUpcoming ────────────────────────────────────────────

test('11. events are ordered chronologically ascending, never by any other order', () => {
  const events = [
    { id: '1', title: 'C', startDate: '2026-09-30', url: 'x' },
    { id: '2', title: 'A', startDate: '2026-09-25', url: 'x' },
    { id: '3', title: 'B', startDate: '2026-09-27', url: 'x' },
  ];
  const upcoming = selectUpcoming(events, new Date('2026-09-25T00:00:00.000Z'));
  assert.deepEqual(upcoming.map((e) => e.title), ['A', 'B', 'C']);
});

test('12. a past-dated item (e.g. a long-running exhibition listed under its original start date) is excluded from "upcoming"', () => {
  const events = [
    { id: '1', title: 'Alte Ausstellung', startDate: '2026-03-06', url: 'x' },
    { id: '2', title: 'Heute', startDate: '2026-09-25', url: 'x' },
  ];
  const upcoming = selectUpcoming(events, new Date('2026-09-25T00:00:00.000Z'));
  assert.deepEqual(upcoming.map((e) => e.title), ['Heute']);
});

test('13. same-day events are ordered by time when both have one', () => {
  const events = [
    { id: '1', title: 'Abends', startDate: '2026-09-25', time: '19:00', url: 'x' },
    { id: '2', title: 'Morgens', startDate: '2026-09-25', time: '08:00', url: 'x' },
  ];
  const upcoming = selectUpcoming(events, new Date('2026-09-25T00:00:00.000Z'));
  assert.deepEqual(upcoming.map((e) => e.title), ['Morgens', 'Abends']);
});

test('14. an empty upcoming result is honest ready/empty, never an error', () => {
  assert.deepEqual(selectUpcoming([], new Date('2026-09-25T00:00:00.000Z')), []);
});

// ── fetchCityEvents ───────────────────────────────────────────

function fakeFetch(body, ok = true) {
  return async () => ({ ok, status: ok ? 200 : 500, text: async () => body });
}

test('15. an unconfigured city returns null (route treats this as 404), never a fabricated empty city', async () => {
  _resetCacheForTests();
  const result = await fetchCityEvents('stuttgart', fakeFetch(buildFeed([])));
  assert.equal(result, null);
});

test('16. Ulm resolves real parsed+filtered events from the injected fetch', async () => {
  _resetCacheForTests();
  const feed = buildFeed([buildItem({ id: '1', tag: '25' })]);
  const result = await fetchCityEvents('ulm', fakeFetch(feed));
  assert.equal(result.city, 'ulm');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].id, '1');
});

test('17. a feed fetch failure throws -- caller (route) must turn this into a 500, never a silent empty success', async () => {
  _resetCacheForTests();
  await assert.rejects(() => fetchCityEvents('ulm', fakeFetch('', false)));
});

test('18. a successful fetch is cached -- a second call within TTL does not re-invoke fetchImpl', async () => {
  _resetCacheForTests();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, status: 200, text: async () => buildFeed([buildItem({ id: '1', tag: '25' })]) };
  };
  await fetchCityEvents('ulm', fetchImpl);
  await fetchCityEvents('ulm', fetchImpl);
  assert.equal(calls, 1);
});

// ── runner ────────────────────────────────────────────────────

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
