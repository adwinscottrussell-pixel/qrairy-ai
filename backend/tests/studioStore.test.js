// ============================================================
// studioStore.test.js — Landing Page Studio V3, Phase 2A-3A: the in-memory
// draft (frontend/public/js/studio/studio-store.js).
// - edits go through commands and are validated by the shared core;
// - an invalid edit is kept (with its errors) but never replaces the last
//   valid design the preview renders;
// - Undo / Redo, typing merged into one step, 100 steps at most;
// - renaming a link name moves every internal link with it (one step), and
//   an unusable name changes nothing;
// - the design it starts from is never changed; nothing is stored or sent.
// Run: node tests/studioStore.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const V3 = require('../src/lpV3/core');
const STORE = require('../../frontend/public/js/studio/studio-store.js');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function demo() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'studio', 'studio-demo.js'), 'utf8'), ctx);
  return JSON.parse(JSON.stringify(ctx.window.QRAIVY_STUDIO_DEMO));
}
function make(design) {
  let t = 1000;
  const clock = { now: () => t, tick: (ms) => { t += ms; } };
  const store = STORE.createStore({ design: design || demo().design, validate: V3.validateDesign, now: clock.now });
  return { store, clock };
}
const HERO = 's_hero01';
const hero = (d) => d.pages[0].sections.find((s) => s.id === HERO);
const render = (design) => V3.renderDesign(design, { businessName: 'Musterbäckerei' }, { preview: true });

test('starts from the demo, valid, without changing it', () => {
  const d = demo();
  const before = JSON.stringify(d.design);
  const { store } = make(d.design);
  assert.ok(store.isValid());
  assert.deepEqual(store.errors(), []);
  store.set(HERO, ['data', 'headline'], 'Neu');
  assert.equal(JSON.stringify(d.design), before, 'the input design is never changed');
  assert.equal(hero(store.draft()).data.headline, 'Neu');
  // copies out, too: changing what the store hands out changes nothing inside
  hero(store.draft()).data.headline = 'x';
  assert.equal(store.section(HERO).data.headline, 'Neu');
});

test('a valid edit becomes the design the preview renders', () => {
  const { store } = make();
  store.set(HERO, ['data', 'headline'], 'Frisch gebacken');
  const r = render(store.lastValid());
  assert.ok(r.ok && r.html.includes('<h1 class="v3-h1">Frisch gebacken</h1>'));
});

test('an invalid edit shows its error and never replaces the last valid design', () => {
  const { store } = make();
  store.set(HERO, ['data', 'headline'], 'Gut');
  store.set(HERO, ['data', 'headline'], '   ');
  assert.equal(store.isValid(), false);
  assert.deepEqual(Object.keys(store.sectionErrors(HERO)), ['data.headline']);
  assert.equal(store.sectionErrors(HERO)['data.headline'].code, 'required');
  assert.equal(hero(store.lastValid()).data.headline, 'Gut', 'the preview keeps the last valid page');
  assert.equal(hero(store.draft()).data.headline, '   ', 'the field keeps what was typed');
  store.set(HERO, ['data', 'headline'], 'x'.repeat(121));
  assert.deepEqual(store.sectionErrors(HERO)['data.headline'], { path: '$.pages[0].sections[0].data.headline', code: 'too_long', max: 120 });
  store.set(HERO, ['data', 'primary', 'target'], 'javascript:alert(1)');
  assert.equal(store.sectionErrors(HERO)['data.primary.target'].code, 'invalid_link');
  store.set(HERO, ['data', 'headline'], 'x'.repeat(120));
  store.set(HERO, ['data', 'primary', 'target'], '/kontakt');
  assert.ok(store.isValid());
  assert.equal(hero(store.lastValid()).data.headline, 'x'.repeat(120));
});

test('a link to a section that does not exist is an error; the button keeps its last valid link', () => {
  const { store } = make();
  store.set(HERO, ['data', 'primary', 'target'], '/nirgendwo');
  assert.equal(store.sectionErrors(HERO)['data.primary.target'].code, 'unknown_internal_target');
  assert.equal(hero(store.lastValid()).data.primary.target, '/angebote');
});

test('id and type cannot be edited; unknown sections are refused', () => {
  const { store } = make();
  assert.equal(store.set(HERO, ['id'], 's_other1'), false);
  assert.equal(store.set(HERO, ['type'], 'text'), false);
  assert.equal(store.set('s_nope01', ['data', 'headline'], 'x'), false);
  assert.equal(store.select('s_nope01'), false);
  assert.equal(store.canUndo(), false, 'nothing was recorded');
});

test('Undo / Redo: each edit one step; a new edit clears Redo', () => {
  const { store, clock } = make();
  store.set(HERO, ['data', 'headline'], 'A'); clock.tick(1000);
  store.set(HERO, ['variant'], 'overlay'); clock.tick(1000);
  assert.ok(store.undo());
  assert.equal(store.section(HERO).variant, 'split');
  assert.ok(store.undo());
  assert.equal(store.section(HERO).data.headline, 'Tradition trifft Genuss');
  assert.equal(store.undo(), false, 'nothing more to undo');
  assert.ok(store.redo());
  assert.equal(store.section(HERO).data.headline, 'A');
  store.set(HERO, ['style', 'align'], 'center');
  assert.equal(store.canRedo(), false);
  assert.equal(hero(store.lastValid()).style.align, 'center');
});

test('typing in one field is one step; a pause, another field or leaving the field starts a new one', () => {
  const { store, clock } = make();
  for (const v of ['N', 'Ne', 'Neu']) { store.set(HERO, ['data', 'headline'], v, 'typing'); clock.tick(100); }
  store.undo();
  assert.equal(store.section(HERO).data.headline, 'Tradition trifft Genuss', 'three keys, one step');
  store.redo();
  clock.tick(STORE.MERGE_MS + 1);
  store.set(HERO, ['data', 'headline'], 'Neu!', 'typing');
  store.set(HERO, ['data', 'eyebrow'], 'E', 'typing');
  store.endMerge();
  store.set(HERO, ['data', 'eyebrow'], 'Ex', 'typing');
  store.undo(); assert.equal(store.section(HERO).data.eyebrow, 'E');
  store.undo(); assert.equal(store.section(HERO).data.eyebrow, 'Frisch · Regional · Mit Herz');
  store.undo(); assert.equal(store.section(HERO).data.headline, 'Neu');
});

test('Undo keeps at most 100 steps', () => {
  const { store } = make();
  for (let i = 0; i < 130; i++) store.set(HERO, ['data', 'headline'], 'H' + i);
  let n = 0; while (store.undo()) n++;
  assert.equal(n, STORE.HISTORY_LIMIT);
  assert.equal(store.section(HERO).data.headline, 'H29');
});

test('Undo of an invalid edit brings back the valid state and clears its errors', () => {
  const { store } = make();
  store.set(HERO, ['data', 'headline'], '');
  assert.equal(store.isValid(), false);
  store.undo();
  assert.ok(store.isValid());
  assert.deepEqual(store.sectionErrors(HERO), {});
});

test('removing a value (the background image, a button colour) deletes the field', () => {
  const d = demo().design;
  hero(d).data.backgroundImage = 'https://res.cloudinary.com/demo/image/upload/v1/hero.jpg';
  hero(d).data.primary.color = '#123456';
  const { store } = make(d);
  store.set(HERO, ['data', 'backgroundImage'], undefined);
  store.set(HERO, ['data', 'primary', 'color'], undefined);
  assert.ok(!('backgroundImage' in store.section(HERO).data));
  assert.ok(!('color' in store.section(HERO).data.primary));
  assert.ok(store.isValid());
  store.undo(); store.undo();
  assert.equal(store.section(HERO).data.backgroundImage, 'https://res.cloudinary.com/demo/image/upload/v1/hero.jpg');
});

test('Show on page: a hidden Hero is not rendered, but stays selectable and editable', () => {
  const { store } = make();
  store.setHidden(HERO, true);
  assert.equal(store.section(HERO).hidden, true);
  const r = render(store.lastValid());
  assert.ok(r.ok && !r.html.includes('data-v3-id="s_hero01"'));
  store.set(HERO, ['data', 'headline'], 'Später');
  assert.ok(store.select(HERO));
  store.setHidden(HERO, false);
  assert.ok(render(store.lastValid()).html.includes('<h1 class="v3-h1">Später</h1>'));
});

test('link names: the same rules as validateDesign; an unusable name changes nothing', () => {
  const { store } = make();
  const cases = { 'Willkommen': 'invalid_anchor', '-a': 'invalid_anchor', 'a b': 'invalid_anchor', 'ä': 'invalid_anchor', ['x'.repeat(41)]: 'invalid_anchor',
    s_quick01: 'invalid_anchor', start: 'reserved', top: 'reserved', kontakt: 'duplicate', produkte: 'duplicate' };
  for (const [name, code] of Object.entries(cases)) {
    assert.equal(store.checkAnchor(HERO, name), code, name);
    assert.deepEqual(store.setAnchor(HERO, name), { ok: false, code, relinked: 0 }, name);
    // the core agrees: it refuses the same name
    const d = store.draft(); hero(d).anchor = name;
    assert.equal(V3.validateDesign(d).ok, false, 'core refuses ' + name);
  }
  assert.equal(store.section(HERO).anchor, undefined);
  assert.equal(store.canUndo(), false, 'refused names leave no step');
  for (const ok of ['willkommen', 'a', '9-zu-5', 'x'.repeat(40)]) assert.equal(store.checkAnchor(HERO, ok), null, ok);
  assert.equal(store.checkAnchor('s_contact1', 'kontakt'), null, 'a section keeps its own name');
});

test('renaming a link name moves every internal link with it, in one Undo step', () => {
  const d = demo().design;
  hero(d).data.secondary.target = '/s_hero01';
  d.header.nav.push({ label: 'Oben', target: '/s_hero01' });
  d.footer.links.push({ label: 'Hero', target: '/s_hero01' });
  const { store } = make(d);
  assert.deepEqual(store.setAnchor(HERO, 'willkommen'), { ok: true, code: null, relinked: 3 });
  let now = store.draft();
  assert.equal(hero(now).anchor, 'willkommen');
  assert.equal(hero(now).data.secondary.target, '/willkommen');
  assert.equal(now.header.nav[5].target, '/willkommen');
  assert.equal(now.footer.links[0].target, '/willkommen');
  assert.equal(hero(now).data.primary.target, '/angebote', 'links to other sections are untouched');
  assert.ok(store.isValid());
  assert.ok(render(store.lastValid()).html.includes('id="willkommen"'));
  assert.ok(render(store.lastValid()).html.includes('href="#willkommen"'));
  // again, then back to the id (empty name)
  assert.equal(store.setAnchor(HERO, 'hallo').relinked, 3);
  assert.equal(store.setAnchor(HERO, '').relinked, 3);
  now = store.draft();
  assert.equal(hero(now).anchor, undefined);
  assert.equal(hero(now).data.secondary.target, '/s_hero01');
  store.undo();
  now = store.draft();
  assert.equal(hero(now).anchor, 'hallo');
  assert.equal(now.footer.links[0].target, '/hallo', 'name and links come back together');
  store.undo(); store.undo();
  assert.equal(store.draft().footer.links[0].target, '/s_hero01');
});

test('the page link list: the top of the page and every section by its link name', () => {
  const { store } = make();
  assert.deepEqual(store.linkTargets().map((x) => x.target), ['/', '/s_hero01', '/s_quick01', '/angebote', '/stempelkarte', '/produkte', '/s_hours01', '/kontakt', '/s_social01']);
  store.setAnchor(HERO, 'willkommen');
  assert.equal(store.linkTargets()[1].target, '/willkommen');
  // every listed target is accepted by the core
  for (const x of store.linkTargets()) { store.set(HERO, ['data', 'primary', 'target'], x.target); assert.ok(store.isValid(), x.target); }
});

test('change events: kind and whether it was typing (the preview waits a moment only then)', () => {
  const { store } = make();
  const seen = [];
  store.onChange((kind, info) => seen.push(kind + ':' + !!info.typing));
  store.set(HERO, ['data', 'headline'], 'A', 'typing');
  store.set(HERO, ['variant'], 'simple');
  store.undo();
  store.select('s_quick01');
  assert.deepEqual(seen, ['edit:true', 'edit:false', 'history:false', 'select:false']);
});

// ── lists (2A-3B: the Buttons) ──
const QUICK = 's_quick01';
const ITEMS = ['data', 'items'];
const labels = (store) => store.section(QUICK).data.items.map((x) => x.label);

test('add a button: appended, one Undo step, intentionally incomplete until a destination is chosen', () => {
  const { store } = make();
  const i = store.addItem(QUICK, ITEMS, { label: 'New button', kind: 'link', target: '' }, 12);
  assert.equal(i, 4);
  assert.deepEqual(labels(store), ['Stempelkarte', 'Angebote', 'Unsere Produkte', 'Kontakt', 'New button']);
  assert.equal(store.sectionErrors(QUICK)['data.items[4].target'].code, 'required', 'the target waits for a choice');
  assert.equal(store.isValid(), false);
  assert.equal(store.lastValid().pages[0].sections[1].data.items.length, 4, 'the preview keeps the last valid page');
  store.undo();
  assert.equal(store.section(QUICK).data.items.length, 4, 'one step');
  assert.ok(store.isValid());
  store.redo();
  assert.equal(store.section(QUICK).data.items.length, 5);
});

test('at most 12 buttons (from describe()); a full list refuses without an Undo step', () => {
  const max = V3.describe().sections.buttons.data.fields.items.max;
  assert.equal(max, 12);
  const { store } = make();
  for (let n = 4; n < max; n++) assert.equal(store.addItem(QUICK, ITEMS, { label: 'B' + n, kind: 'link', target: '/' }, max), n);
  assert.ok(store.isValid(), '12 is valid');
  const before = JSON.stringify(store.draft());
  let undos = 0; while (store.canUndo()) { store.undo(); undos++; }
  for (let k = 0; k < undos; k++) store.redo();
  assert.equal(store.addItem(QUICK, ITEMS, { label: 'B13', kind: 'link', target: '/' }, max), -1);
  assert.equal(JSON.stringify(store.draft()), before);
  // and the core agrees that 13 is too many
  const d = store.draft(); d.pages[0].sections[1].data.items.push({ label: 'x', kind: 'link', target: '/' });
  assert.equal(V3.validateDesign(d).errors[0].code, 'too_many');
});

test('remove a button: one Undo step; the last one leaves an empty section (preview note, left out of the public page)', () => {
  const { store } = make();
  assert.ok(store.removeItem(QUICK, ITEMS, 1));
  assert.deepEqual(labels(store), ['Stempelkarte', 'Unsere Produkte', 'Kontakt']);
  store.undo();
  assert.deepEqual(labels(store), ['Stempelkarte', 'Angebote', 'Unsere Produkte', 'Kontakt']);
  for (let k = 0; k < 4; k++) store.removeItem(QUICK, ITEMS, 0);
  assert.deepEqual(store.section(QUICK).data.items, []);
  assert.ok(store.isValid());
  const pv = render(store.lastValid()).html;
  assert.ok(pv.includes('data-v3-id="s_quick01"') && pv.includes('v3-ph-note'), 'preview: empty-section note');
  assert.ok(!V3.renderDesign(store.lastValid(), {}).html.includes('id="s_quick01"'), 'public page: left out');
  assert.equal(store.removeItem(QUICK, ITEMS, 0), false, 'nothing left to remove');
  assert.equal(store.removeItem(QUICK, ITEMS, -1), false);
});

test('move a button: one Undo step; out-of-range or same-place moves are refused', () => {
  const { store } = make();
  assert.ok(store.moveItem(QUICK, ITEMS, 0, 1));
  assert.deepEqual(labels(store), ['Angebote', 'Stempelkarte', 'Unsere Produkte', 'Kontakt']);
  assert.ok(store.moveItem(QUICK, ITEMS, 3, 0));
  assert.deepEqual(labels(store), ['Kontakt', 'Angebote', 'Stempelkarte', 'Unsere Produkte']);
  const html = render(store.lastValid()).html;
  assert.ok(html.indexOf('>Kontakt</strong>') < html.indexOf('>Angebote</strong>'), 'the preview follows the order');
  store.undo();
  assert.deepEqual(labels(store), ['Angebote', 'Stempelkarte', 'Unsere Produkte', 'Kontakt']);
  for (const [a, b] of [[0, 0], [0, 4], [-1, 0], [1.5, 2], [0, -1]]) assert.equal(store.moveItem(QUICK, ITEMS, a, b), false, a + '->' + b);
  assert.equal(store.addItem(QUICK, ['id'], {}, 12), -1, 'lists only inside data');
  assert.equal(store.moveItem('s_nope01', ITEMS, 0, 1), false);
});

test('Buttons: edits by path, a type change keeps the target and reports when it no longer fits', () => {
  const { store } = make();
  store.set(QUICK, ['data', 'items', 0, 'kind'], 'call');
  assert.equal(store.section(QUICK).data.items[0].target, '/stempelkarte', 'kept, not converted');
  assert.equal(store.sectionErrors(QUICK)['data.items[0].target'].code, 'invalid_phone');
  store.set(QUICK, ['data', 'items', 0, 'target'], '+49 731 123456');
  assert.ok(store.isValid());
  assert.ok(render(store.lastValid()).html.includes('href="tel:+49731123456"'));
  store.undo(); store.undo();
  assert.equal(store.section(QUICK).data.items[0].kind, 'link');
  assert.ok(store.isValid());
});

test('renaming a link name also moves the Buttons targets that point to it', () => {
  const { store } = make();
  assert.equal(store.setAnchor('s_contact1', 'so-finden-sie-uns').relinked, 3, 'Hero secondary, nav, the Kontakt button');
  assert.equal(store.section(QUICK).data.items[3].target, '/so-finden-sie-uns');
  assert.ok(store.isValid());
});

test('pure: no DOM, network or storage in the store', () => {
  const src = fs.readFileSync(path.join(PUB, 'js', 'studio', 'studio-store.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // code only
  for (const re of [/document\./, /window\./, /localStorage/, /sessionStorage/, /indexedDB/, /\bfetch\s*\(/, /XMLHttpRequest/, /postMessage/]) assert.ok(!re.test(src), String(re));
});

// ── lists (2A-3C: the social links), with the same generic commands ──
const SOCIAL = 's_social01';
const LINKS = ['data', 'links'];
const platforms = (store) => store.section(SOCIAL).data.links.map((x) => x.platform);

test('social links: add (Instagram, empty address), remove, move; one Undo step each; the last valid page while incomplete', () => {
  const { store } = make();
  const max = V3.describe().sections.socialMedia.data.fields.links.max;
  assert.equal(max, 8);
  assert.equal(store.addItem(SOCIAL, LINKS, { platform: 'instagram', url: '' }, max), 2);
  assert.deepEqual(Object.keys(store.sectionErrors(SOCIAL)), ['data.links[2].url']);
  assert.equal(store.sectionErrors(SOCIAL)['data.links[2].url'].code, 'required');
  assert.equal(store.lastValid().pages[0].sections[7].data.links.length, 2, 'the preview keeps the last valid page');
  store.set(SOCIAL, ['data', 'links', 2, 'url'], 'https://www.tiktok.com/@example');
  assert.equal(store.sectionErrors(SOCIAL)['data.links[2].url'].code, 'invalid_social_link', 'an address of another platform');
  store.set(SOCIAL, ['data', 'links', 2, 'platform'], 'tiktok');
  assert.ok(store.isValid(), 'the platform change makes it fit');
  assert.ok(store.moveItem(SOCIAL, LINKS, 2, 0));
  assert.deepEqual(platforms(store), ['tiktok', 'instagram', 'facebook']);
  assert.ok(store.removeItem(SOCIAL, LINKS, 1));
  assert.deepEqual(platforms(store), ['tiktok', 'facebook']);
  store.undo();
  assert.deepEqual(platforms(store), ['tiktok', 'instagram', 'facebook']);
  store.undo();
  assert.deepEqual(platforms(store), ['instagram', 'facebook', 'tiktok']);
  for (let n = 3; n < max; n++) assert.equal(store.addItem(SOCIAL, LINKS, { platform: 'x', url: 'https://x.com/a' }, max), n);
  assert.equal(store.addItem(SOCIAL, LINKS, { platform: 'x', url: 'https://x.com/a' }, max), -1, 'at most 8');
  assert.ok(store.isValid(), 'duplicate platforms are allowed');
});

// ── Contact (2A-3D): nested address fields, phone / email / map link, the switch ──
test('Contact edits: nested address, typing merged into one Undo step, invalid phone keeps the last valid page, the switch', () => {
  const { store, clock } = make();
  const C = 's_contact1';
  store.set(C, ['data', 'address', 'city'], 'U', 'typing');
  store.set(C, ['data', 'address', 'city'], 'Ul', 'typing');
  store.set(C, ['data', 'address', 'city'], 'Ulm-Mitte', 'typing');
  store.endMerge();
  assert.equal(store.section(C).data.address.city, 'Ulm-Mitte');
  assert.equal(store.section(C).data.address.line1, 'Musterstraße 1', 'the other address lines are kept');
  store.undo();
  assert.equal(store.section(C).data.address.city, 'Ulm', 'one Undo step for the typing');
  store.set(C, ['data', 'phone'], 'abc');
  assert.equal(store.sectionErrors(C)['data.phone'].code, 'invalid_phone');
  assert.equal(store.lastValid().pages[0].sections[6].data.phone, '+49 731 000 00', 'the preview keeps the last valid number');
  store.set(C, ['data', 'phone'], '+49 (0)731 123456');
  assert.ok(store.isValid(), '"(0)" is accepted by core.js (the inspector only warns)');
  store.set(C, ['data', 'mapsUrl'], 'https://evil.example/');
  assert.equal(store.sectionErrors(C)['data.mapsUrl'].code, 'invalid_maps_link');
  store.set(C, ['data', 'mapsUrl'], 'https://maps.app.goo.gl/abc');
  store.set(C, ['data', 'showMapLink'], false);
  assert.ok(store.isValid());
  assert.equal(store.section(C).data.showMapLink, false);
  store.undo();
  assert.notEqual(store.section(C).data.showMapLink, false, 'the switch is one Undo step');
  void clock;
});

// ── Opening Hours (2A-3E): day entries and their time ranges ──
test('Opening Hours edits: close / reopen a day keeps its times, hide / show, ranges, typing merged, invalid times keep the last valid page', () => {
  const { store } = make();
  const H = 's_hours01', DAYS = ['data', 'days'];
  const idx = (day) => store.section(H).data.days.findIndex((d) => d.day === day);
  const valid = () => store.lastValid().pages[0].sections[5].data.days;
  // Monday closed (whole entry, one step) keeps its times; reopening restores them
  const mon = idx('mon');
  store.set(H, DAYS.concat(mon), Object.assign({}, store.section(H).data.days[mon], { closed: true }));
  assert.ok(store.isValid());
  assert.deepEqual(store.section(H).data.days[mon].ranges, [{ open: '06:30', close: '18:00' }]);
  store.undo();
  assert.notEqual(store.section(H).data.days[mon].closed, true, 'one Undo step');
  // Sunday not shown, then shown again as Closed
  assert.ok(store.removeItem(H, DAYS, idx('sun')));
  assert.equal(idx('sun'), -1);
  assert.ok(store.addItem(H, DAYS, { day: 'sun', closed: true }, 7) >= 0);
  // a second Saturday range: incomplete until typed; typing is one step
  const sat = idx('sat');
  assert.equal(store.addItem(H, DAYS.concat(sat, 'ranges'), { open: '', close: '' }, 3), 1);
  assert.deepEqual(Object.keys(store.sectionErrors(H)).sort(), ['data.days[' + sat + '].ranges[1].close', 'data.days[' + sat + '].ranges[1].open']);
  assert.equal(valid()[sat].ranges.length, 1, 'the preview keeps the last valid hours');
  store.set(H, DAYS.concat(sat, 'ranges', 1, 'open'), '1', 'typing');
  store.set(H, DAYS.concat(sat, 'ranges', 1, 'open'), '14:', 'typing');
  store.set(H, DAYS.concat(sat, 'ranges', 1, 'open'), '14:00', 'typing');
  store.endMerge();
  store.set(H, DAYS.concat(sat, 'ranges', 1, 'close'), '12:00');
  assert.equal(store.sectionErrors(H)['data.days[' + sat + '].ranges[1]'].code, 'closes_before_opening');
  store.set(H, DAYS.concat(sat, 'ranges', 1, 'close'), '17:00');
  assert.ok(store.isValid());
  store.undo(); store.undo(); // the two closing times
  assert.deepEqual([store.section(H).data.days[sat].ranges[1].open, store.section(H).data.days[sat].ranges[1].close], ['14:00', '']);
  store.undo();
  assert.equal(store.section(H).data.days[sat].ranges[1].open, '', 'the typing was one step');
  assert.equal(store.addItem(H, DAYS.concat(sat, 'ranges'), { open: '', close: '' }, 3), 2);
  assert.equal(store.addItem(H, DAYS.concat(sat, 'ranges'), { open: '', close: '' }, 3), -1, 'at most 3 ranges');
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
