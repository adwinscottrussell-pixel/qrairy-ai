// ============================================================
// studioSections.test.js — Landing Page Studio V3, Phase C: adding,
// duplicating, moving and removing sections (studio-store.js) and the
// section rules of the shared validator (core.js, both copies).
//
// Checked: starter content for every type, valid in both languages; at most
// one Hero, Deals / Offers and Loyalty (validator and store); 40 sections;
// new ids unique, duplicates without a link name; removing resets the links
// that pointed to the section to the page top, in one Undo step; every
// change is one Undo step and never leaves the design invalid; unsaved
// changes follow.
//
// Run: node tests/studioSections.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const V3 = require('../src/lpV3/core');
const V3_BROWSER = require('../../frontend/public/js/lpV3/core.js');
const STORE = require('../../frontend/public/js/studio/studio-store.js');
const BASE = require('./fixtures/lpV3/localBusiness.json');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const clone = (x) => JSON.parse(JSON.stringify(x));
const make = (design, extra) => STORE.createStore(Object.assign({ design: design || clone(BASE), validate: V3.validateDesign, starter: V3.starter, maxPerPage: V3.MAX_PER_PAGE, maxSections: V3.LIMITS.sections }, extra));
const minimal = (sections) => ({ schemaVersion: 1, settings: { language: 'de' }, pages: [{ id: 'start', sections: sections || [] }] });
const ADDABLE = V3.SECTION_TYPES;

test('validator: at most one Hero, Deals / Offers and Loyalty per page (too_many_of_type), the same in both copies; other types repeat freely; 40 sections', () => {
  assert.deepEqual(V3.MAX_PER_PAGE, { hero: 1, dealsOffers: 1, loyalty: 1 });
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'src', 'lpV3', 'core.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'lpV3', 'core.js'), 'utf8'), 'core.js copies identical');
  for (const core of [V3, V3_BROWSER]) {
    for (const type of ['hero', 'dealsOffers', 'loyalty']) {
      const st = core.starter(type, 'de');
      const r = core.validateDesign(minimal([Object.assign({ id: 's_one00001' }, st), Object.assign({ id: 's_two00002' }, st)]));
      assert.equal(r.ok, false, type);
      assert.deepEqual(r.errors, [{ path: '$.pages[0].sections[1].type', code: 'too_many_of_type', max: 1 }], type);
      assert.ok(core.validateDesign(minimal([Object.assign({ id: 's_one00001' }, st)])).ok, type + ': one is fine');
    }
    const many = ['text', 'buttons', 'gallery', 'products', 'openingHours', 'contact', 'socialMedia'].flatMap((type, i) => [0, 1, 2].map((k) => Object.assign({ id: 's_' + type.slice(0, 4).toLowerCase() + i + k + '00' }, core.starter(type, 'en'))));
    assert.ok(core.validateDesign(minimal(many)).ok, JSON.stringify(core.validateDesign(minimal(many)).errors));
    const forty = Array.from({ length: 40 }, (_, i) => Object.assign({ id: 's_t' + String(i).padStart(5, '0') }, core.starter('text', 'de')));
    assert.ok(core.validateDesign(minimal(forty)).ok, '40 sections');
    assert.ok(core.validateDesign(minimal(forty.concat([Object.assign({ id: 's_t99999' }, core.starter('text', 'de'))]))).errors.some((e) => e.code === 'too_many' && e.max === 40));
  }
  assert.equal(V3.describe().limits.perPage.hero, 1);
  assert.deepEqual(V3.library().map((s) => [s.type, s.maxPerPage]).filter((x) => x[1] === 1).map((x) => x[0]), ['hero', 'dealsOffers', 'loyalty']);
});

test('existing designs stay valid: the Studio demo, the reference fixtures, the legacy import, the Phase B test drafts', () => {
  const demo = (() => { const w = {}; new Function('window', fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'studio', 'studio-demo.js'), 'utf8'))(w); return w.QRAIVY_STUDIO_DEMO.design; })();
  assert.ok(V3.validateDesign(demo).ok, 'demo');
  for (const f of ['localBusiness', 'allRenderedVariants', 'allRenderedVariantsHeroSplit', 'allRenderedVariantsHeroSimple']) assert.ok(V3.validateDesign(require('./fixtures/lpV3/' + f + '.json')).ok, f);
  const { importLegacyPage } = require('../src/lpV3/importLegacy');
  const imported = importLegacyPage({ slug: 'x', userId: 'user_x', businessName: 'X', websiteUrl: 'https://x.example', brandColor: '#123456', sections: JSON.stringify({ hero: { title: 'T' }, buttons: [{ label: 'A', url: 'https://a.example' }], actionLinks: [{ label: 'B', url: 'https://b.example' }] }) });
  assert.ok(imported.ok && V3.validateDesign(imported.draft).ok, 'legacy import');
});

test('starter content: every type, both languages, valid on its own and inside the demo-like page; neutral, in the page language', () => {
  for (const lang of ['de', 'en']) {
    for (const type of ADDABLE) {
      const st = V3.starter(type, lang);
      assert.ok(st && st.type === type && V3.describe().sections[type].variants.includes(st.variant), type);
      const r = V3.validateDesign(minimal([Object.assign({ id: 's_new00001' }, st)]));
      assert.ok(r.ok, lang + ' ' + type + ' ' + JSON.stringify(r.errors));
    }
  }
  assert.equal(V3.starter('hero', 'de').data.headline, 'Ihre Überschrift');
  assert.equal(V3.starter('hero', 'en').data.headline, 'Your headline');
  assert.equal(V3.starter('hero', 'fr').data.headline, 'Ihre Überschrift', 'unknown language: German');
  assert.equal(V3.starter('nope', 'de'), null);
  const a = V3.starter('text', 'de'); a.data.body = 'changed';
  assert.equal(V3.starter('text', 'de').data.body, 'Ihr Text.', 'each call is a fresh copy');
  for (const s of ADDABLE.map((t) => JSON.stringify(V3.starter(t, 'de')))) assert.ok(!/Musterbäckerei|Croissant|Bäckerei|example|https?:/.test(s), 'neutral: ' + s);
});

test('add: every type from an empty page, below the selected section or at the end; new ids unique; selected; the design stays valid', () => {
  const ids = new Set();
  for (const type of ADDABLE) {
    const s = make(minimal());
    const id = s.addSection(type, null, 'en');
    assert.match(id, /^s_[a-z0-9]{8}$/, type);
    assert.deepEqual(s.sectionIds(), [id]);
    assert.equal(s.selected(), id);
    assert.ok(s.isValid(), type);
    assert.deepEqual(s.section(id).data, V3.starter(type, 'en').data);
    ids.add(id);
  }
  const s = make();
  const first = s.sectionIds()[0];
  const g = s.addSection('gallery', first, 'de');
  assert.equal(s.sectionIds()[1], g, 'below the given section');
  const t = s.addSection('text', null, 'de');
  assert.equal(s.sectionIds().slice(-1)[0], t, 'no section given: at the end');
  assert.equal(s.addSection('gallery', 's_unknown', 'de') !== null, true, 'unknown anchor section: at the end');
  assert.equal(new Set(s.sectionIds()).size, s.sectionIds().length, 'all ids unique');
});

test('add: Hero, Deals / Offers, Loyalty once only (canAdd says why); 40 sections maximum; refused adds change nothing', () => {
  const s = make();
  for (const type of ['hero', 'dealsOffers', 'loyalty']) { assert.equal(s.canAdd(type), 'only_one', type); assert.equal(s.addSection(type, null, 'de'), null); }
  assert.equal(s.canAdd('nope'), 'unknown_type');
  const e = make(minimal());
  for (const type of ['hero', 'dealsOffers', 'loyalty']) { assert.equal(e.canAdd(type), null); e.addSection(type, null, 'de'); assert.equal(e.canAdd(type), 'only_one'); }
  const full = make(minimal());
  for (let i = 0; i < 40; i++) assert.ok(full.addSection('text', null, 'de'));
  assert.equal(full.sectionIds().length, 40);
  const snap = full.snapshot(), undoable = full.canUndo();
  assert.equal(full.canAdd('text'), 'max_sections');
  assert.equal(full.addSection('text', null, 'de'), null);
  assert.equal(full.canDuplicate(full.sectionIds()[0]), 'max_sections');
  assert.equal(full.duplicateSection(full.sectionIds()[0]), null);
  assert.equal(full.snapshot(), snap, 'nothing changed');
  assert.equal(full.canUndo(), undoable);
  assert.ok(full.isValid());
});

test('new ids never collide with existing ids or link names (even with a repeating random source)', () => {
  let n = 0;
  const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  const s = make(minimal([{ id: 's_aaaaaaaa', type: 'text', data: { heading: 'x' } }]), { random: () => seq[n++ % seq.length] });
  const id = s.addSection('text', null, 'de');
  assert.notEqual(id, 's_aaaaaaaa');
  assert.match(id, /^s_[a-z0-9]{8}$/);
});

test('duplicate: a copy right below with a new id, no link name, the same content; never Hero, Deals / Offers or Loyalty', () => {
  const s = make();
  const text = s.sectionIds().find((id) => s.section(id).type === 'text');
  s.setAnchor(text, 'ueber-uns');
  const copy = s.duplicateSection(text);
  const ids = s.sectionIds();
  assert.equal(ids[ids.indexOf(text) + 1], copy);
  assert.equal(s.section(copy).anchor, undefined, 'link names stay unique');
  assert.deepEqual(s.section(copy).data, s.section(text).data);
  assert.equal(s.selected(), copy);
  assert.ok(s.isValid());
  for (const type of ['hero', 'dealsOffers', 'loyalty']) {
    const id = s.sectionIds().find((x) => s.section(x).type === type);
    assert.equal(s.canDuplicate(id), 'not_duplicable', type);
    assert.equal(s.duplicateSection(id), null);
  }
  assert.equal(s.canDuplicate('s_nope'), 'unknown_section');
});

test('move: up / down one place, data kept, nothing beyond either end; one Undo step each; Undo / Redo restore the exact order', () => {
  const s = make();
  const before = s.sectionIds(), id = before[2], data = JSON.stringify(s.section(id));
  assert.equal(s.moveSection(before[0], -1), false);
  assert.equal(s.moveSection(before[before.length - 1], 1), false);
  assert.equal(s.moveSection(id, 2), false, 'one place only');
  assert.ok(s.moveSection(id, -1));
  assert.deepEqual(s.sectionIds().slice(0, 3), [before[0], id, before[1]]);
  assert.ok(s.moveSection(id, -1));
  assert.equal(s.sectionIds()[0], id);
  assert.equal(JSON.stringify(s.section(id)), data, 'content unchanged');
  assert.deepEqual(s.position(id), { index: 1, total: before.length });
  s.undo(); s.undo();
  assert.deepEqual(s.sectionIds(), before);
  s.redo();
  assert.equal(s.sectionIds()[1], id);
});

test('remove: links to the section point to the page top in the same step; Undo restores section and links; selection moves to a neighbour', () => {
  const s = make();
  const deals = s.sectionIds().find((id) => s.section(id).type === 'dealsOffers');
  assert.equal(s.section(deals).anchor, 'angebote');
  const links = s.linksTo(deals);
  assert.ok(links >= 2, 'the fixture links to #angebote: ' + links);
  const before = s.snapshot();
  s.select(deals);
  const ids = s.sectionIds(), next = ids[ids.indexOf(deals) + 1];
  const r = s.removeSection(deals);
  assert.deepEqual(r, { ok: true, relinked: links });
  assert.ok(s.isValid(), JSON.stringify(s.errors()));
  assert.ok(!s.snapshot().includes('"/angebote"'));
  assert.equal(s.selected(), next);
  s.undo();
  assert.equal(s.snapshot(), before, 'one Undo: section, position and every link back');
  s.redo();
  assert.ok(!s.sectionIds().includes(deals));
  // a link by the section id too
  const t = make();
  const text = t.sectionIds().find((id) => t.section(id).type === 'text');
  t.set(t.sectionIds()[0], ['data', 'primary', 'target'], '/' + text);
  assert.equal(t.linksTo(text), 1);
  assert.equal(t.removeSection(text).relinked, 1);
  assert.equal(t.section(t.sectionIds()[0]).data.primary.target, '/');
  assert.deepEqual(t.removeSection('s_nope'), { ok: false, relinked: 0 });
});

test('isUntouched: true for fresh starter content (either language), false once edited, with a link name or hidden', () => {
  const s = make(minimal());
  const id = s.addSection('gallery', null, 'en');
  assert.equal(s.isUntouched(id), true);
  const de = s.addSection('text', null, 'de');
  assert.equal(s.isUntouched(de), true);
  s.set(de, ['data', 'body'], 'Mein Text');
  assert.equal(s.isUntouched(de), false);
  s.undo();
  assert.equal(s.isUntouched(de), true);
  s.setAnchor(id, 'fotos');
  assert.equal(s.isUntouched(id), false);
  const h = s.addSection('hero', null, 'de');
  s.setHidden(h, true);
  assert.equal(s.isUntouched(h), false);
  const fix = make();
  assert.equal(fix.isUntouched(fix.sectionIds()[0]), false, 'the owner’s own Hero');
});

test('a structural change never leaves the design invalid; while a field is invalid, changes that add no error still work', () => {
  const s = make();
  const hero = s.sectionIds()[0];
  s.set(hero, ['data', 'headline'], 'x'.repeat(500));
  assert.equal(s.isValid(), false);
  const n = s.errors().length;
  assert.ok(s.moveSection(s.sectionIds()[3], -1), 'moving another section: no new error');
  assert.ok(s.addSection('text', null, 'de'), 'adding valid starter content: no new error');
  assert.equal(s.errors().length, n);
  // a remove whose result would be invalid is refused (a stored link that only resolves through another rule)
  const v = make(minimal([{ id: 's_aaaa0001', type: 'text', data: { heading: 'a' } }]));
  assert.ok(v.isValid());
  const orig = v.snapshot();
  const bad = STORE.createStore({ design: JSON.parse(orig), validate: (d) => (d.pages[0].sections.length === 0 ? { ok: false, design: null, errors: [{ path: '$', code: 'x' }] } : V3.validateDesign(d)), starter: V3.starter, maxPerPage: V3.MAX_PER_PAGE });
  assert.deepEqual(bad.removeSection('s_aaaa0001'), { ok: false, relinked: 0 });
  assert.equal(bad.snapshot(), orig, 'refused: nothing changed');
  assert.equal(bad.canUndo(), false, 'and no Undo step');
});

test('unsaved changes and events: every structural change is dirty, Undo back is clean; one "edit" event with structure: true', () => {
  const s = make();
  const events = [];
  s.onChange((k, info) => events.push([k, !!info.structure]));
  assert.equal(s.dirty(), false);
  const id = s.addSection('products', null, 'de');
  assert.equal(s.dirty(), true);
  s.undo();
  assert.equal(s.dirty(), false);
  s.redo();
  s.markSaved(s.snapshot());
  s.moveSection(id, -1);
  assert.equal(s.dirty(), true);
  s.undo();
  assert.equal(s.dirty(), false, 'Undo back to the saved order');
  assert.deepEqual(events.filter((e) => e[0] === 'edit'), [['edit', true], ['edit', true]]);
});

(async () => {
  let passed = 0, failed = 0;
  console.log('studioSections');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.stack)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
