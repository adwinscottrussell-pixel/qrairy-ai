// ============================================================
// legacyRenderGolden.test.js — existing published landing pages stay
// byte-for-byte the same while Landing Page Studio V3 is built.
//
// The synthetic pages in tests/fixtures/legacyPages/fixtures.json (standard,
// German, voice, loyalty / Wallet welcome, Welcome V2, StadtPocket, deals,
// escaping, 404) are rendered through the REAL public handlers
// (handleServeLP -> renderPremiumLP, /lp/card, /lp/welcome) and compared with
// legacyRender.golden.json: SHA-256 of every response body, plus status and
// caching headers. The reference values were generated from main ae2861e
// before any V3 code existed. A difference means a customer-visible change
// to an existing page: find out why; do not regenerate the file to make the
// test pass.
// Run: node tests/legacyRenderGolden.test.js
// ============================================================
const assert = require('assert/strict');
const { renderAll, FIXTURES } = require('./helpers/legacyRenderHarness');
const GOLDEN = require('./fixtures/legacyPages/legacyRender.golden.json');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let rendered = null;
const results = async () => (rendered = rendered || await renderAll());

test('the reference file covers exactly the fixture cases', () => {
  assert.equal(GOLDEN.generatedFrom, 'ae2861e89a42f65914d215647b261a427a65d9ab');
  assert.equal(GOLDEN.frozenNow, FIXTURES.frozenNow);
  assert.deepEqual(GOLDEN.results.map((r) => r.id), FIXTURES.cases.map((c) => c.id));
});

for (const g of GOLDEN.results) {
  test('unchanged: ' + g.id + ' — ' + FIXTURES.cases.find((c) => c.id === g.id).why, async () => {
    const r = (await results()).find((x) => x.id === g.id);
    assert.ok(r, 'rendered');
    assert.equal(r.status, g.status, 'status');
    assert.deepEqual(r.headers, g.headers, 'caching and framing headers');
    assert.equal(r.bytes, g.bytes, 'length of the page');
    assert.equal(r.sha256, g.sha256, 'page content (SHA-256)');
  });
}

test('the cases exercise what they claim (guards the guard)', async () => {
  const body = (id) => (rendered || []).find((r) => r.id === id).body;
  await results();
  const welcome = (id) => body(id).includes('wEnr_');
  for (const id of ['09-loyalty-on', '12-welcome-v2-slug', '13-welcome-v2-owner', '14-stadtpocket-linked']) assert.ok(welcome(id), id + ' gets the first-visit welcome');
  for (const id of ['01-standard-en', '10-loyalty-on-preview', '11-loyalty-disabled', '15-business-not-stadtpocket']) assert.ok(!welcome(id), id + ' does not');
  const cards = (id) => (body(id).match(/class="qd-card"/g) || []).length;
  assert.equal(cards('16-deals-cards'), 2);
  for (const id of ['17-deals-no-access', '18-deals-switch-off']) assert.equal(cards(id), 0, id);
  assert.match(body('27-deals-uploaded-image'), /<img src="https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/v1\/qraivy-fixture\/bread\.jpg"/);
  assert.match(body('28-deals-starter-image'), /<img src="https:\/\/res\.cloudinary\.com\/demo\//);
  assert.ok(!/<img/.test(body('29-deals-starter-no-cloud').slice(body('29-deals-starter-no-cloud').indexOf('<article class="qd-card"'))), 'colour fallback');
  assert.ok(body('06-voice-on').includes('Hallo from the bakery'));
  assert.ok(!body('07-voice-stale').includes('Hallo from the bakery'));
  assert.ok(body('05-legacy-logo-column-data-uri').includes('data:image/png;base64'));
  assert.ok(body('02-standard-de').includes('Speisekarte'));
  const hostile = body('20-escaping');
  assert.ok(!hostile.includes('<script>alert') && !hostile.includes('<img src=x onerror') && !/href="javascript:/i.test(hostile));
});

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
