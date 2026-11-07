// ============================================================
// studioDemoFields.test.js — Landing Page Studio V3, E3: which values of an
// onboarding draft are still its template's example content
// (frontend/public/js/studio/studio-demo-fields.js).
// - every template, English and German: a saved draft (E2, draftRequest) has
//   its example values found, field by field, in every section type;
// - the customer's values are never marked (business name, description,
//   social links; anything edited); editing one value removes only its mark;
// - moved, duplicated and reordered sections and rows are still recognised;
// - drafts saved before E2, unknown templates, other origins and legacy
//   pages are safe (no mark, no error);
// - snapshot: the template example values, so a template change cannot
//   silently stop the detection (update the snapshot deliberately);
// - nothing is changed: no input is modified, no storage, no request.
// Run: node tests/studioDemoFields.test.js
// ============================================================
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const V3 = require('../src/lpV3/core');
const M = require('../../frontend/public/js/studio/onboarding-model.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');
const OB = require('../../frontend/public/js/studio/onboarding-shell.js');
const F = require('../../frontend/public/js/studio/studio-demo-fields.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const LANGS = ['en', 'de'];
const copy = (v) => JSON.parse(JSON.stringify(v));
// a draft as the onboarding saves it now (E2), every section type plus a Custom Section
function draft(tpl, lang, extra) {
  const a = Object.assign({ template: tpl, palette: null, name: 'Werkstatt Lindenhof', description: '', links: [], social: 'auto',
    sections: M.SECTION_TYPES.concat(['custom:aaaa1111']) }, extra || {});
  return OB.draftRequest(M, V3, T, a, lang);
}
const secOf = (design, type) => design.pages[0].sections.find((s) => s.type === type);

// The template example values the detection compares with (core.js's normalized form), per template and language.
// A change here is a change of the template catalog: drafts saved before it keep their old values, which then stop
// being recognised as examples. Decide deliberately (keep the old values recognisable, or accept), then update.
const SNAPSHOT = {
  'restaurant:en': '6c78404f68a29b5e', 'restaurant:de': 'b92cdfa5d4e7914c', 'bakery:en': '35f329eda6d7e4ae', 'bakery:de': '5ef8335e654e5ce3',
  'beauty:en': '5155a241e28ffc56', 'beauty:de': 'a39a849e5583eb83', 'retail:en': '55b8840d7b0efae6', 'retail:de': '8d64980975b5a16e',
  'creator:en': '7399477a6d8132b7', 'creator:de': '6784190ccf120a79', 'services:en': 'f8707bd2bf8a1c3c', 'services:de': '92c52e861183640e',
};

test('snapshot: the template example values are unchanged (a template change must update this snapshot deliberately)', () => {
  const now = {};
  for (const t of T.TEMPLATE_IDS) for (const l of LANGS) {
    const cat = F.catalog({ source: 'onboarding', template: t, language: l }, T, V3);
    assert.ok(cat, t + ' ' + l);
    now[t + ':' + l] = crypto.createHash('sha256').update(JSON.stringify(cat)).digest('hex').slice(0, 16);
  }
  assert.deepEqual(now, SNAPSHOT);
});

test('every template, English and German: the saved draft\'s example values found in every section type with example content; the business name, description and social links never', () => {
  for (const tpl of T.TEMPLATE_IDS) for (const l of LANGS) {
    const tag = tpl + ' ' + l;
    const r = draft(tpl, l, { description: 'Our own words.', links: [{ platform: 'instagram', url: 'instagram.com/lindenhof' }] });
    const map = F.exampleMap(r.design, r.origin, T, V3);
    const hero = map.s_obhero01 || [];
    assert.ok(hero.includes('data.eyebrow') && hero.includes('data.backgroundImage') && hero.includes('data.primary.text'), tag + ': Hero examples ' + hero);
    assert.ok(!hero.includes('data.headline') && !hero.includes('data.subheadline'), tag + ': the name and description are the customer\'s');
    assert.equal(map.s_obsocial1, undefined, tag + ': Social Media holds only the customer\'s link');
    assert.equal(map.s_caaaa1111, undefined, tag + ': the empty Custom Section');
    for (const id of r.origin.exampleSectionIds) assert.ok(map[id] && map[id].length, tag + ': ' + id + ' (an example section of the origin) marked');
    const items = secOf(r.design, 'products').data.items;
    items.forEach((it, i) => assert.ok(map.s_obproducts1.includes('data.items[' + i + '].name'), tag + ': product ' + i));
    secOf(r.design, 'buttons').data.items.forEach((it, i) => assert.ok(map.s_obbuttons1.includes('data.items[' + i + '].label'), tag + ': button ' + i));
    assert.ok(map.s_obcontact1.includes('data.email'), tag + ': the example email');
    if (secOf(r.design, 'openingHours').data.days.length) assert.ok(map.s_obhours01.includes('data.days'), tag + ': the example hours');
    else assert.equal(map.s_obhours01, undefined, tag + ': no example hours here (empty)');
    // every marked path names a value the draft really has, equal to the template's
    const cat = F.catalog(r.origin, T, V3);
    for (const [id, paths] of Object.entries(map)) for (const p of paths) {
      const sec = r.design.pages[0].sections.find((s) => s.id === id);
      const v = p.split(/\.|\[|\]\.?/).filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), sec);
      assert.ok(v !== undefined && v !== '' && JSON.stringify(cat[sec.type]).includes(JSON.stringify(v).slice(1, -1)), tag + ': ' + id + ' ' + p);
    }
  }
});

test('without a description: the template\'s neutral sub-headline is an example; the name never, also when it equals a template\'s demo name', () => {
  for (const tpl of T.TEMPLATE_IDS) for (const l of LANGS) {
    const r = draft(tpl, l);
    assert.ok(F.exampleMap(r.design, r.origin, T, V3).s_obhero01.includes('data.subheadline'), tpl + ' ' + l);
    const same = draft(tpl, l, { name: T.get(tpl).demoName });
    assert.ok(!F.exampleMap(same.design, same.origin, T, V3).s_obhero01.includes('data.headline'), tpl + ' ' + l + ': the headline is never marked');
  }
});

test('editing one example value removes only its mark; a changed row keeps its other example fields; a link stays an example only with its example text; everything replaced: the section is no longer marked', () => {
  for (const l of LANGS) {
    const r = draft('restaurant', l), base = F.exampleMap(r.design, r.origin, T, V3);
    const d = copy(r.design), p = secOf(d, 'products');
    p.data.items[0].price = '9,99 €';
    let m = F.exampleMap(d, r.origin, T, V3).s_obproducts1;
    assert.ok(!m.includes('data.items[0].price') && m.includes('data.items[0].name') && m.includes('data.items[0].description'), l + ': only the price lost its mark');
    assert.deepEqual(m.filter((x) => !x.startsWith('data.items[0].')), base.s_obproducts1.filter((x) => !x.startsWith('data.items[0].')), l + ': the other rows unchanged');
    p.data.items[0].name = 'Pizza Lindenhof';
    m = F.exampleMap(d, r.origin, T, V3).s_obproducts1;
    assert.ok(!m.includes('data.items[0].name') && m.includes('data.items[0].description'), l + ': still anchored by its description');
    p.data.items[0].description = 'Our own';
    m = F.exampleMap(d, r.origin, T, V3).s_obproducts1;
    assert.ok(!m.some((x) => x.startsWith('data.items[0].')), l + ': the row is the customer\'s now (a price on its own is never marked)');
    // a button: its link is an example only while its text is
    const b = secOf(d, 'buttons');
    b.data.items[0].label = 'Book online';
    m = F.exampleMap(d, r.origin, T, V3).s_obbuttons1;
    assert.ok(m.includes('data.items[0].subtitle') && m.includes('data.items[0].target'), l + ': subtitle and link still the example\'s');
    b.data.items[0].subtitle = 'Our own';
    m = F.exampleMap(d, r.origin, T, V3).s_obbuttons1;
    assert.ok(!m.some((x) => x.startsWith('data.items[0].')), l + ': the row is the customer\'s');
    b.data.items[1].target = 'https://example.org/book';   // the customer's own link
    assert.ok(!F.exampleMap(d, r.origin, T, V3).s_obbuttons1.includes('data.items[1].target'), l + ': a real link is never marked');
    // contact: each field on its own
    const c = secOf(d, 'contact');
    c.data.address.city = l === 'de' ? 'Ulm' : 'Ulm';
    m = F.exampleMap(d, r.origin, T, V3).s_obcontact1;
    assert.ok(!m.includes('data.address.city') && m.includes('data.address.line1') && m.includes('data.email'), l + ': contact field by field');
    c.data.address = { line1: 'Hauptstraße 5', line2: '', postalCode: '89073', city: 'Ulm' }; c.data.email = 'info@lindenhof.de';
    assert.equal(F.exampleMap(d, r.origin, T, V3).s_obcontact1, undefined, l + ': all replaced: not marked');
    // hours: any change makes them the customer's
    const h = secOf(d, 'openingHours');
    h.data.days[0] = { day: 'mon', closed: false, ranges: [{ open: '09:00', close: '17:00' }] };
    assert.equal(F.exampleMap(d, r.origin, T, V3).s_obhours01, undefined, l + ': edited hours are the customer\'s');
    // text
    const tx = secOf(d, 'text');
    tx.data.heading = 'Hello';
    assert.deepEqual(F.exampleMap(d, r.origin, T, V3).s_obtext01, ['data.body'], l + ': only the untouched text');
  }
});

test('moved, duplicated and reordered sections and rows are still recognised (by type and value, not by place or id)', () => {
  const r = draft('bakery', 'en'), d = copy(r.design), secs = d.pages[0].sections;
  const prod = secs.find((s) => s.type === 'products');
  prod.data.items.reverse();
  const dup = Object.assign(copy(prod), { id: 's_dupprod01' });
  secs.splice(1, 0, dup);
  secs.push(secs.splice(secs.findIndex((s) => s.type === 'contact'), 1)[0]);
  const m = F.exampleMap(d, r.origin, T, V3);
  assert.ok(m.s_dupprod01 && m.s_obproducts1 && m.s_obcontact1, 'the copy, the original and the moved Contact');
  prod.data.items.forEach((it, i) => assert.ok(m.s_obproducts1.includes('data.items[' + i + '].name'), 'reversed row ' + i));
});

test('safe: drafts saved before E2 mark only the starter texts and photos they hold; no origin, another source, unknown template or language, legacy pages, the Studio sample page, malformed input: no mark, no error', () => {
  for (const tpl of T.TEMPLATE_IDS) for (const l of LANGS) {
    const a = { template: tpl, palette: null, name: 'Werkstatt Lindenhof', description: '', links: [], social: 'auto', sections: M.SECTION_TYPES.slice() };
    const r = OB.draftRequest(M, V3, T, a, l), old = M.pageFor(V3, T, a, l).draft;
    const m = F.exampleMap(old, r.origin, T, V3);
    for (const id of ['s_obbuttons1', 's_obproducts1', 's_obhours01', 's_obcontact1', 's_obsocial1']) assert.equal(m[id], undefined, tpl + ' ' + l + ': ' + id + ' was saved empty');
    assert.ok(!(m.s_obhero01 || []).some((p) => /primary|secondary/.test(p)), tpl + ' ' + l + ': no example Hero buttons were saved');
  }
  const r = draft('restaurant', 'en');
  for (const origin of [null, undefined, {}, 'x', [], { source: 'import', template: 'restaurant', language: 'en' }, { source: 'onboarding', template: 'nope', language: 'en' },
    { source: 'onboarding', template: 'restaurant', language: 'fr' }, { source: 'onboarding', language: 'en' }, { source: 'onboarding', template: '__proto__', language: 'en' },
    { source: 'onboarding', template: 'constructor', language: 'de' }]) {
    assert.deepEqual(F.exampleMap(r.design, origin, T, V3), {}, JSON.stringify(origin));
  }
  for (const design of [null, undefined, {}, { pages: [] }, { pages: [{}] }, { pages: [{ sections: [null, 1, 'x', { id: 's_x1234', type: 'hero' }, { id: 's_y1234', type: 'products', data: { items: [null, 'x', 3] } }] }] }]) {
    assert.deepEqual(F.exampleMap(design, r.origin, T, V3), {}, JSON.stringify(design));
  }
  assert.deepEqual(F.exampleMap(r.design, r.origin, null, V3), {}, 'no catalog');
  assert.deepEqual(F.exampleMap(r.design, r.origin, T, null), {}, 'no core');
  global.window = global;
  require('../../frontend/public/js/studio/studio-demo.js');
  const sampleDesign = global.QRAIVY_STUDIO_DEMO.design;
  delete global.window;
  assert.ok(sampleDesign && sampleDesign.pages, 'the Studio sample page');
  assert.deepEqual(F.exampleMap(sampleDesign, null, T, V3), {}, 'the Studio sample page has no origin');
});

test('the other language\'s examples are not this draft\'s: a German draft compared as English (and back) marks no texts', () => {
  const de = draft('beauty', 'de');
  const asEn = Object.assign({}, de.origin, { language: 'en' });
  const m = F.exampleMap(de.design, asEn, T, V3), catDe = JSON.stringify(F.catalog(de.origin, T, V3)), catEn = JSON.stringify(F.catalog(asEn, T, V3));
  assert.ok(Object.keys(m).length, 'photos and other shared values still match');
  for (const [id, paths] of Object.entries(m)) for (const p of paths) {
    const sec = de.design.pages[0].sections.find((s) => s.id === id);
    const v = JSON.stringify(p.split(/\.|\[|\]\.?/).filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), sec)).slice(1, -1);
    assert.ok(catDe.includes(v) && catEn.includes(v), p + ': only values the same in both languages (photos, links, hours, brand names)');
  }
});

test('nothing is changed: the design and origin stay as they were; the file has no request, storage or DOM use', () => {
  const r = draft('services', 'de'), before = copy(r);
  F.exampleMap(r.design, r.origin, T, V3);
  assert.deepEqual(r, before);
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'studio', 'studio-demo-fields.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/fetch|XMLHttpRequest|localStorage|sessionStorage|document\.|window\.|innerHTML|eval\(/.test(code));
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
}
console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
process.exit(failed ? 1 : 0);
