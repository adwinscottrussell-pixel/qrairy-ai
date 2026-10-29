// ============================================================
// lpV3Validate.test.js — Landing Page Studio V3 design validation
// (backend/src/lpV3/core.js validateDesign). The server's validation is the
// gate for every draft and every publish: only known section types and
// fields, typed and length-limited; safe links and Cloudinary images only.
// Run: node tests/lpV3Validate.test.js
// ============================================================
const assert = require('assert/strict');
const V3 = require('../src/lpV3/core');
const BASE = require('./fixtures/lpV3/localBusiness.json');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const clone = (x) => JSON.parse(JSON.stringify(x));
const codes = (r) => r.errors.map((e) => e.code);
// a section of a one-per-page type (Hero, Deals, Loyalty) replaces the base's own (Phase C limits)
// (keeping the replaced section's link name, which other links point to)
const withSection = (section) => { const d = clone(BASE); const old = V3.MAX_PER_PAGE[section.type] && d.pages[0].sections.find((s) => s.type === section.type); if (old) { d.pages[0].sections = d.pages[0].sections.filter((s) => s !== old); if (old.anchor && !section.anchor) section = Object.assign({}, section, { anchor: old.anchor }); } d.pages[0].sections.push(section); return d; };
const sectionData = (r, id) => r.design.pages[0].sections.find((s) => s.id === id).data;
const valid = (d, opts) => { const r = V3.validateDesign(d, opts); assert.ok(r.ok, JSON.stringify(r.errors)); return r; };
const invalid = (d, code, opts) => { const r = V3.validateDesign(d, opts); assert.equal(r.ok, false, 'expected ' + code); assert.ok(codes(r).includes(code), 'expected ' + code + ', got ' + JSON.stringify(r.errors)); assert.equal(r.design, null); return r; };
const button = (kind, target) => ({ id: 's_btnx', type: 'buttons', data: { items: [{ label: 'Go', kind, target }] } });

test('the Local Business design (Staib layout, placeholder content) is valid and normalized', () => {
  const r = valid(BASE);
  const hero = r.design.pages[0].sections[0];
  assert.deepEqual(hero.style, { background: 'default', align: 'left', spacing: 'normal' }, 'style defaults');
  assert.equal(hero.hidden, false);
  assert.equal(r.design.header.nav.length, 4);
  assert.equal(sectionData(r, 's_quick01').items[3].target, 'tel:+4973112345678', 'call links are normalized');
});

test('the input is never changed (the normalized copy is returned)', () => {
  const d = clone(BASE);
  const before = JSON.stringify(d);
  V3.validateDesign(d);
  assert.equal(JSON.stringify(d), before);
});

test('the section library: the ten approved types, with the mockup labels', () => {
  assert.deepEqual(V3.SECTION_TYPES.sort(), ['buttons', 'contact', 'dealsOffers', 'gallery', 'hero', 'loyalty', 'openingHours', 'products', 'socialMedia', 'text']);
  const lib = Object.fromEntries(V3.library().map((s) => [s.type, s]));
  assert.equal(lib.hero.description, 'Eye-catching header with image, text and buttons');
  assert.equal(lib.buttons.description, 'WhatsApp, Call, Directions, Website');
  assert.equal(lib.text.label, 'Text Section');
  // Phase 2A-1 added Gallery and Products; Deals / Offers and Loyalty follow with their data.
  assert.deepEqual(V3.library().filter((s) => s.rendered).map((s) => s.type).sort(), ['buttons', 'contact', 'gallery', 'hero', 'openingHours', 'products', 'socialMedia', 'text']);
});

test('structure: schema version, one "start" page, no unknown fields or types', () => {
  invalid(Object.assign(clone(BASE), { schemaVersion: 2 }), 'unsupported_schema_version');
  invalid(Object.assign(clone(BASE), { extra: 1 }), 'unknown_field');
  invalid(Object.assign(clone(BASE), { pages: [] }), 'required');
  const two = clone(BASE); two.pages.push({ id: 'menu', sections: [] }); invalid(two, 'too_many');
  const id = clone(BASE); id.pages[0].id = 'home'; invalid(id, 'not_allowed');
  invalid(withSection({ id: 's_html01', type: 'customHtml', data: {} }), 'unknown_section_type');
  invalid(withSection({ id: 's_text99', type: 'text', data: { heading: 'x', html: '<b>x</b>' } }), 'unknown_field');
  invalid(withSection({ id: 's_text99', type: 'text', data: {}, onclick: 'x' }), 'unknown_field');
  invalid(withSection({ id: 's_text99', type: 'text', variant: 'fancy', data: {} }), 'not_allowed');
  invalid('not a design', 'not_object');
});

test('section ids and anchors: format, unique, reserved names', () => {
  invalid(withSection({ id: 'hero', type: 'text', data: {} }), 'invalid_id');
  invalid(withSection({ id: 's_hero01', type: 'text', data: {} }), 'duplicate');
  invalid(withSection({ id: 's_text99', type: 'text', anchor: 'angebote', data: {} }), 'duplicate');
  invalid(withSection({ id: 's_text99', type: 'text', anchor: 'top', data: {} }), 'duplicate');
  invalid(withSection({ id: 's_text99', type: 'text', anchor: 'Bad Anchor', data: {} }), 'invalid_anchor');
});

test('internal links must point to the page or an existing section', () => {
  valid(withSection(button('link', '/')));
  valid(withSection(button('link', '/start')));
  valid(withSection(button('link', '/s_hero01')));
  valid(withSection(button('link', '/kontakt')));
  invalid(withSection(button('link', '/nowhere')), 'unknown_internal_target');
  const nav = clone(BASE); nav.header.nav.push({ label: 'X', target: '/missing' }); invalid(nav, 'unknown_internal_target');
});

test('links: only https, mailto, tel or internal; everything else is refused', () => {
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', 'http://example.com', '//evil.example',
    'https://user:pw@evil.example/', 'https://evil.example/"><script>', 'https://evil.example/a b', 'angebote', 'ftp://x.example', 'https://localhost/', 'https://', 'mailto:x', 'tel:abc']) {
    invalid(withSection(button('link', bad)), 'invalid_link');
  }
  for (const good of ['https://example.com', 'https://example.com/a?b=c#d', 'mailto:info@example.com', 'tel:+4973112345']) valid(withSection(button('link', good)));
});

test('typed buttons: WhatsApp, call, email, directions, website', () => {
  valid(withSection(button('whatsapp', 'https://wa.me/491701234567')));
  invalid(withSection(button('whatsapp', 'https://evil.example/wa.me/49170')), 'invalid_whatsapp');
  assert.equal(sectionData(valid(withSection(button('call', '+49 (731) 123-45'))), 's_btnx').items[0].target, 'tel:+4973112345');
  invalid(withSection(button('call', 'call me')), 'invalid_phone');
  assert.equal(sectionData(valid(withSection(button('email', 'info@example.com'))), 's_btnx').items[0].target, 'mailto:info@example.com');
  invalid(withSection(button('email', 'info@')), 'invalid_email');
  valid(withSection(button('directions', 'https://www.google.com/maps/place/Ulm')));
  valid(withSection(button('directions', 'https://maps.apple.com/?q=Ulm')));
  invalid(withSection(button('directions', 'https://www.google.com/search?q=x')), 'invalid_maps_link');
  invalid(withSection(button('directions', 'https://evil.example/maps')), 'invalid_maps_link');
  invalid(withSection(button('website', 'mailto:a@b.de')), 'invalid_url');
});

test('images: https Cloudinary uploads only (no data:, no other hosts, no SVG)', () => {
  const img = (url, opts) => V3.validateDesign(Object.assign(clone(BASE), { header: Object.assign(clone(BASE.header), { logo: url }) }), opts);
  for (const bad of ['data:image/png;base64,AAAA', 'http://res.cloudinary.com/demo/image/upload/a.png', 'https://evil.example/a.png', 'https://res.cloudinary.com/demo/image/upload/a.svg',
    'https://res.cloudinary.com/demo/video/upload/a.png', 'https://res.cloudinary.com/demo/image/upload/a.png"onerror="x', 'javascript:alert(1)']) {
    assert.ok(codes(img(bad)).includes('invalid_image'), bad);
  }
  assert.ok(img('https://res.cloudinary.com/demo/image/upload/v1/x/a.webp').ok);
  assert.ok(codes(img('https://res.cloudinary.com/other/image/upload/a.png', { cloudName: 'qraivy' })).includes('invalid_image'), 'our cloud only when configured');
  const ours = JSON.parse(JSON.stringify(BASE).split('res.cloudinary.com/demo/').join('res.cloudinary.com/qraivy/'));
  assert.ok(V3.validateDesign(ours, { cloudName: 'qraivy' }).ok, 'every image in our cloud');
  assert.ok(codes(V3.validateDesign(BASE, { cloudName: 'qraivy' })).includes('invalid_image'), 'any image elsewhere is refused');
});

test('colours: hex only (normalized to lower case)', () => {
  const pal = (c) => V3.validateDesign(Object.assign(clone(BASE), { theme: { palette: { brand: c } } }));
  for (const bad of ['red', '#ff5a1g', '#fff;}body{display:none', 'rgb(1,2,3)', 'url(x)', '#ff5a1f80;']) assert.ok(codes(pal(bad)).includes('invalid_color'), bad);
  assert.equal(pal('#FF5A1F').design.theme.palette.brand, '#ff5a1f');
  const hero = withSection({ id: 's_hero02', type: 'hero', data: { headline: 'x', primary: { text: 'a', target: '/', color: 'red' } } });
  invalid(hero, 'invalid_color');
  invalid(Object.assign(clone(BASE), { theme: { fontPair: 'comic-sans' } }), 'not_allowed');
});

test('text: typed, length-limited, control and direction characters removed', () => {
  invalid(withSection({ id: 's_hero02', type: 'hero', data: {} }), 'required');
  invalid(withSection({ id: 's_hero02', type: 'hero', data: { headline: '   ' } }), 'required');
  invalid(withSection({ id: 's_hero02', type: 'hero', data: { headline: 'x'.repeat(121) } }), 'too_long');
  valid(withSection({ id: 's_hero02', type: 'hero', data: { headline: '🥐'.repeat(120) } }));
  invalid(withSection({ id: 's_hero02', type: 'hero', data: { headline: 42 } }), 'not_text');
  const r = valid(withSection({ id: 's_text99', type: 'text', data: { heading: 'A\nB\u0007‮c', body: 'line 1\r\nline 2\u0000' } }));
  assert.equal(sectionData(r, 's_text99').heading, 'A Bc', 'single-line: breaks become spaces, controls removed');
  assert.equal(sectionData(r, 's_text99').body, 'line 1\nline 2', 'multi-line keeps line breaks');
  invalid(withSection({ id: 's_hero02', type: 'hero', data: { headline: 'x', overlay: 95 } }), 'out_of_range');
  invalid(withSection({ id: 's_hero02', type: 'hero', hidden: 'yes', data: { headline: 'x' } }), 'not_boolean');
});

test('opening hours: real times, each day once, opening before closing', () => {
  const hours = (days) => withSection({ id: 's_hours99', type: 'openingHours', data: { days } });
  valid(hours([{ day: 'mon', ranges: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '24:00' }] }]));
  invalid(hours([{ day: 'mon', ranges: [{ open: '25:00', close: '26:00' }] }]), 'invalid_time');
  invalid(hours([{ day: 'mon', ranges: [{ open: '18:00', close: '08:00' }] }]), 'closes_before_opening');
  invalid(hours([{ day: 'mon' }, { day: 'mon' }]), 'duplicate');
  invalid(hours([{ day: 'someday' }]), 'not_allowed');
});

test('contact and social media: phone, email, maps and platform-matched links', () => {
  invalid(withSection({ id: 's_cont99', type: 'contact', data: { phone: '---' } }), 'invalid_phone');
  invalid(withSection({ id: 's_cont99', type: 'contact', data: { email: 'x"@y.de' } }), 'invalid_email');
  invalid(withSection({ id: 's_cont99', type: 'contact', data: { mapsUrl: 'https://evil.example/' } }), 'invalid_maps_link');
  const social = (platform, url) => withSection({ id: 's_soc99', type: 'socialMedia', data: { links: [{ platform, url }] } });
  valid(social('instagram', 'https://www.instagram.com/example'));
  valid(social('tiktok', 'https://www.tiktok.com/@example'));
  invalid(social('instagram', 'https://evil.example/instagram.com'), 'invalid_social_link');
  invalid(social('instagram', 'https://www.facebook.com/x'), 'invalid_social_link');
  invalid(social('myspace', 'https://myspace.com/x'), 'not_allowed');
});

test('sections rendered later are still validated (gallery, products, deals, loyalty)', () => {
  valid(withSection({ id: 's_gal99', type: 'gallery', data: { images: [{ image: 'https://res.cloudinary.com/demo/image/upload/a.jpg', alt: 'A' }] } }));
  invalid(withSection({ id: 's_gal99', type: 'gallery', data: { images: [{ image: 'data:image/png;base64,AA' }] } }), 'invalid_image');
  invalid(withSection({ id: 's_prod99', type: 'products', data: { items: [{ name: 'Brot', target: 'javascript:alert(1)' }] } }), 'invalid_link');
  invalid(withSection({ id: 's_deal99', type: 'dealsOffers', data: { maxItems: 50 } }), 'out_of_range');
  invalid(withSection({ id: 's_loy99', type: 'loyalty', data: { stampCount: 5 } }), 'unknown_field');
});

test('limits: 40 sections, list sizes, 256 KB per design, at most 100 errors reported', () => {
  const many = clone(BASE);
  many.pages[0].sections = Array.from({ length: 41 }, (_, i) => ({ id: 's_t' + String(i).padStart(4, '0'), type: 'text', data: {} }));
  invalid(many, 'too_many');
  invalid(withSection({ id: 's_btn99', type: 'buttons', data: { items: Array.from({ length: 13 }, () => ({ label: 'x', target: '/' })) } }), 'too_many');
  const big = withSection({ id: 's_text99', type: 'text', data: { body: 'x'.repeat(300000) } });
  assert.deepEqual(V3.validateDesign(big).errors, [{ path: '$', code: 'too_large', max: 262144 }]);
  const noisy = clone(BASE); noisy.pages[0].sections = Array.from({ length: 40 }, (_, i) => ({ id: 's_t' + String(i).padStart(4, '0'), type: 'hero', data: { headline: 'x'.repeat(200), eyebrow: 'y'.repeat(100), extra: 1 } }));
  assert.equal(V3.validateDesign(noisy).errors.length, 100);
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
