// ============================================================
// lpV3ImportLegacy.test.js — a V3 draft from an existing page
// (backend/src/lpV3/importLegacy.js). Read-only and pure: it never writes;
// the legacy page stays live until the owner publishes. Uses the same
// synthetic pages as the legacy-renderer guard.
// Run: node tests/lpV3ImportLegacy.test.js
// ============================================================
const assert = require('assert/strict');
const V3 = require('../src/lpV3/core');
const { importLegacyPage } = require('../src/lpV3/importLegacy');
const FIXTURES = require('./fixtures/legacyPages/fixtures.json');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const page = (slug) => FIXTURES.pages.find((p) => p.slug === slug);
const codes = (r) => r.warnings.map((w) => w.code);

test('every page with an owner becomes a valid draft that renders safely', () => {
  for (const p of FIXTURES.pages.filter((x) => x.userId)) {
    const before = JSON.stringify(p);
    const r = importLegacyPage(p);
    assert.ok(r.ok, p.slug + ': ' + JSON.stringify(r));
    assert.ok(V3.validateDesign(r.draft).ok, p.slug);
    const out = V3.renderDesign(r.draft, { businessName: p.businessName });
    assert.ok(out.ok, p.slug);
    assert.ok(!/<script/i.test(out.html), p.slug);
    assert.equal(JSON.stringify(p), before, 'the page row is not changed');
  }
});

test('pages without an owner (StadtPocket, platform pages) are not eligible', () => {
  assert.deepEqual(importLegacyPage(page('fx-stadtpocket')), { ok: false, reason: 'not_eligible_ownerless', warnings: [] });
  assert.equal(importLegacyPage(page('fx-ownerless')).reason, 'not_eligible_ownerless');
  assert.equal(importLegacyPage(null).reason, 'no_page');
});

test('what carries over: language, brand colour, hero texts, buttons, link cards, website', () => {
  const r = importLegacyPage(page('fx-standard-de'));
  assert.equal(r.draft.settings.language, 'de');
  assert.equal(r.draft.theme.palette.brand, '#c2410c');
  const [hero, buttons, cards, website] = r.draft.pages[0].sections;
  assert.deepEqual([hero.type, hero.data.eyebrow, hero.data.headline, hero.data.subheadline], ['hero', 'Fresh daily', 'Bread & coffee since 1952', 'Your neighbourhood bakery']);
  assert.deepEqual(hero.data.primary, { text: 'Order online', target: 'https://example.com/order', icon: 'none', color: '' });
  assert.deepEqual(buttons.data.items.map((i) => [i.label, i.target]), [['Call us', 'https://example.com/call']], 'legacy "https://" prefix kept; hidden button left out');
  assert.equal(cards.variant, 'cards');
  assert.deepEqual(cards.data.items.map((i) => [i.label, i.subtitle, i.target]), [['Menu', 'Speisekarte', 'https://example.com/menu']]);
  assert.equal(website.data.items[0].target, 'https://example.com');
  assert.equal(r.draft.header.logo, 'https://res.cloudinary.com/demo/image/upload/v1/qraivy-fixture/logo.png');
  assert.ok(codes(r).includes('emoji_icons_replaced') && codes(r).includes('ai_assistant_not_in_v3'));
});

test('what does not carry over is reported, never copied unsafely', () => {
  assert.ok(codes(importLegacyPage(page('fx-data-logo'))).includes('logo_data_uri_reupload'));
  assert.equal(importLegacyPage(page('fx-data-logo')).draft.header.logo, '');
  assert.ok(codes(importLegacyPage(page('fx-voice-on'))).includes('voice_welcome_later_phase'));
  assert.ok(codes(importLegacyPage(page('fx-corrupt'))).includes('sections_unreadable'));
  const hostile = importLegacyPage(page('fx-escaping'));
  assert.ok(hostile.ok);
  for (const c of ['brand_color_not_hex', 'logo_not_cloudinary_reupload', 'button_link_dropped', 'action_link_dropped']) assert.ok(codes(hostile).includes(c), c);
  const html = V3.renderDesign(hostile.draft, { businessName: page('fx-escaping').businessName }).html;
  assert.ok(!/<script|<img src=x/i.test(html), 'hostile text stays text');
  assert.ok(!/(?:href|src)="\s*javascript:/i.test(html), 'no javascript: link');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'shown escaped');
});

test('long legacy texts are shortened to the V3 limits (with a warning)', () => {
  const p = Object.assign({}, page('fx-minimal'), { sections: JSON.stringify({ hero: { title: 'T'.repeat(500), badge: 'B'.repeat(90) } }) });
  const r = importLegacyPage(p);
  assert.ok(r.ok);
  assert.equal(r.draft.pages[0].sections[0].data.headline.length, 120);
  assert.equal(r.draft.pages[0].sections[0].data.eyebrow.length, 60);
  assert.ok(codes(r).includes('shortened'));
});

test('deterministic', () => {
  assert.equal(JSON.stringify(importLegacyPage(page('fx-standard-en'))), JSON.stringify(importLegacyPage(page('fx-standard-en'))));
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
