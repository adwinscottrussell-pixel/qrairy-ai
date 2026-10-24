// ============================================================
// studioInspector.test.js — Landing Page Studio V3, Phase 2A-3A: the
// inspector rules (frontend/public/js/studio/studio-inspector.js).
// - only the Hero is editable in this step;
// - every Hero field core.js describe() lists has exactly one control, in
//   the approved tab (Content / Style / Settings);
// - the character counter counts exactly what validateDesign counts, so
//   "120 / 120" is accepted and "121 / 120" is refused;
// - every validation code the Hero can produce has a message (EN and DE);
// - Change Image stays disabled (uploads come later); the other types keep
//   the read-only view.
// 2A-3B / 2A-3C: the Buttons and Social Media plans, the shared list
/// settings (Buttons texts exactly as at d70d883) and the eight platforms./n// 2A-3G: the Text plan (three layouts, image shown not changed), Plain never/n// renders an image, and the six earlier editors exactly as at e99ac11.
// Run: node tests/studioInspector.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const V3 = require('../src/lpV3/core');
const INSP = require('../../frontend/public/js/studio/studio-inspector.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'studio', 'studio-inspector.js'), 'utf8');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const D = V3.describe();

function leaves(spec, prefix) {
  if (spec.t === 'obj') return Object.keys(spec.fields).flatMap((k) => leaves(spec.fields[k], prefix.concat(k)));
  return [prefix.join('.')];
}

test('2A-3G: only the Hero, the Buttons, Social Media, Contact, Opening Hours, Products and Text are editable (Gallery, Deals, Loyalty stay read-only)', () => {
  assert.deepEqual(INSP.EDITABLE, ['hero', 'buttons', 'socialMedia', 'contact', 'openingHours', 'products', 'text']);
  assert.deepEqual(Object.keys(INSP.PLANS), ['hero', 'buttons', 'socialMedia', 'contact', 'openingHours', 'products', 'text']);
  assert.deepEqual(Object.keys(INSP.LISTS), ['buttons', 'socialMedia', 'products']);
  for (const t of ['gallery', 'dealsOffers', 'loyalty']) {
    assert.ok(D.sections[t], t);
    assert.ok(!INSP.EDITABLE.includes(t) && !INSP.PLANS[t], t + ' read-only');
  }
});

// the inspector module as it was at an approved checkpoint (null when git or the commit is missing)
function inspectorAt(sha) {
  const { execFileSync } = require('child_process');
  let then;
  try { then = execFileSync('git', ['show', sha + ':frontend/public/js/studio/studio-inspector.js'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { console.log('      (' + sha + ' not available here: skipped the comparison)'); return null; }
  const m = { exports: {} };
  new Function('module', 'exports', then)(m, m.exports);
  return { exports: m.exports, src: then };
}

test('Buttons regression: plan and every text exactly as approved at d70d883', () => {
  const then = inspectorAt('d70d883');
  if (then) {
    assert.deepEqual(JSON.parse(JSON.stringify(INSP.BUTTONS_PLAN)), JSON.parse(JSON.stringify(then.exports.BUTTONS_PLAN)));
    for (const lang of ['en', 'de']) for (const [k, v] of Object.entries(then.exports.TX[lang])) assert.equal(INSP.TX[lang][k], v, lang + ' ' + k + ' unchanged');
    assert.deepEqual(INSP.TARGET_INPUT, then.exports.TARGET_INPUT);
  }
  assert.deepEqual(INSP.PLANS.buttons, INSP.BUTTONS_PLAN);
});

test('Buttons regression: the generic list settings reproduce the d70d883 list texts and new button', () => {
  const B = INSP.LISTS.buttons;
  for (const lang of ['en', 'de']) {
    const tx = (k) => INSP.TX[lang][k];
    assert.deepEqual([B.heading, B.add, B.max, B.remove, B.removed, B.moved], ['buttons', 'add_button', 'max_buttons', 'remove_button', 'removed', 'moved']);
    assert.deepEqual(B.newItem(tx), { label: tx('new_button'), kind: 'link', target: '' }, 'the new button, intentionally incomplete');
    assert.deepEqual([B.focus, B.select], ['label', true], 'focus and select its label');
    assert.equal(B.name({ label: 'Kontakt', kind: 'call' }, tx), 'Kontakt');
    assert.equal(B.name({ label: '  ', kind: 'call' }, tx), tx('no_label'));
    assert.equal(B.name({}, tx), tx('no_label'));
    assert.equal(B.tag({ kind: 'call' }, tx), tx('k_call'));
    assert.equal(B.tag({}, tx), tx('k_link'));
  }
  assert.equal(INSP.TX.en.add_button + '|' + INSP.TX.en.max_buttons + '|' + INSP.TX.en.removed + '|' + INSP.TX.en.buttons, 'Add button|Up to {max} buttons.|Button removed. Undo is available.|Buttons');
  // the d70d883 list code used exactly these texts and this new item
  const then = inspectorAt('d70d883');
  if (then) {
    const body = then.src.slice(then.src.indexOf('function itemsControl'), then.src.indexOf('function controlFor'));
    for (const s of ["tx('add_button')", "tx('max_buttons')", "tx('moved')", "tx('remove_button')", "tx('removed')", "tx('buttons')", "{ label: tx('new_button'), kind: 'link', target: '' }",
      "textLength(item.label, false) ? item.label : tx('no_label')", "tx('k_' + (item.kind || 'link'))", '.label"] input', 'label.select()']) assert.ok(body.includes(s), s);
  }
});

test('Social Media regression: plan and texts exactly as approved at 20e97c6', () => {
  const then = inspectorAt('20e97c6');
  if (then) {
    for (const k of ['HERO_PLAN', 'BUTTONS_PLAN', 'SOCIAL_PLAN', 'SOCIAL_HINT_HOSTS', 'SOCIAL_PLACEHOLDER', 'TARGET_INPUT']) assert.deepEqual(JSON.parse(JSON.stringify(INSP[k])), JSON.parse(JSON.stringify(then.exports[k])), k);
    for (const lang of ['en', 'de']) for (const [k, v] of Object.entries(then.exports.TX[lang])) assert.equal(INSP.TX[lang][k], v, lang + ' ' + k + ' unchanged');
    for (const t of ['buttons', 'socialMedia']) for (const k of ['heading', 'add', 'max', 'remove', 'removed', 'moved', 'focus', 'select']) assert.equal(INSP.LISTS[t][k], then.exports.LISTS[t][k], t + ' ' + k);
  }
});

// ── Contact (2A-3D) ──
const contact = (data, extra) => ({ schemaVersion: 1, pages: [{ id: 'start', sections: [Object.assign({ id: 's_con01', type: 'contact', data }, extra)] }] });
const contactErrors = (data) => V3.validateDesign(contact(data)).errors.map((e) => e.path.replace('$.pages[0].sections[0].', '') + ':' + e.code);

test('every Contact field from describe() has exactly one control; Layout and Alignment are not offered', () => {
  const plan = INSP.CONTACT_PLAN;
  const planned = plan.filter((c) => c.path).map((c) => c.path.join('.'));
  assert.equal(new Set(planned).size, planned.length, 'no field twice');
  const want = leaves(D.sections.contact.data, ['data']).concat(['style.background', 'style.spacing', 'anchor', 'hidden', 'id']);
  assert.deepEqual(planned.slice().sort(), want.slice().sort());
  const tab = (t) => plan.filter((c) => c.path && c.tab === t).map((c) => c.control + ':' + c.path.join('.'));
  assert.deepEqual(tab('content'), ['text:data.title', 'text:data.address.line1', 'text:data.address.line2', 'text:data.address.postalCode', 'text:data.address.city', 'text:data.address.country',
    'input:data.phone', 'input:data.email', 'input:data.mapsUrl', 'switch:data.showMapLink']);
  assert.deepEqual(tab('style'), ['select:style.background', 'select:style.spacing'], 'no Layout (Card and Split render alike), no Alignment (it only moves the title)');
  assert.deepEqual(tab('settings'), ['anchor:anchor', 'show:hidden', 'readonly:id']);
  assert.deepEqual(plan.filter((c) => c.group).map((c) => c.group), ['address', 'directions']);
  for (const c of plan.filter((x) => x.path)) assert.ok(INSP.specFor(D, 'contact', c.path), 'spec for ' + c.path.join('.'));
  assert.deepEqual(INSP.PLANS.contact, plan);
});

test('Contact rules come from describe(): limits, types, nothing required, Directions on by default', () => {
  const s = (p) => INSP.specFor(D, 'contact', p.split('.'));
  assert.deepEqual(['data.title', 'data.address.line1', 'data.address.line2', 'data.address.postalCode', 'data.address.city', 'data.address.country'].map((p) => s(p).max), [80, 100, 100, 12, 60, 60]);
  assert.deepEqual([s('data.phone').t, s('data.email').t, s('data.mapsUrl').t, s('data.mapsUrl').kind, s('data.showMapLink').t, s('data.showMapLink').def], ['phone', 'email', 'link', 'directions', 'bool', true]);
  for (const p of ['data.title', 'data.address.line1', 'data.phone', 'data.email', 'data.mapsUrl']) assert.ok(!s(p).required, p);
  assert.deepEqual(contactErrors({}), [], 'an empty Contact is valid');
});

test('Contact counters count exactly what validateDesign counts', () => {
  const cases = [[['title'], 80], [['address', 'line1'], 100], [['address', 'line2'], 100], [['address', 'postalCode'], 12], [['address', 'city'], 60], [['address', 'country'], 60]];
  for (const [p, max] of cases) {
    for (const t of ['  Ulm  ', 'Zeile\nzwei', 'ä😀', 'a‮b']) {
      for (const extra of [max, max + 1].map((n) => n - INSP.textLength(t, false))) {
        if (extra < 0) continue;
        const v = t + 'x'.repeat(extra);
        const data = p.length === 1 ? { [p[0]]: v } : { address: { [p[1]]: v } };
        assert.equal(contactErrors(data).some((e) => e.endsWith(':too_long')), INSP.textLength(v, false) > max, p.join('.') + ' ' + JSON.stringify(v.slice(0, 10)));
      }
    }
  }
});

test('Contact phone, email and map link: what core.js accepts and refuses; every error has an EN/DE message', () => {
  for (const ok of ['+49 731 123456', '0731 99', '+49 (731) 123-4', '+49 (0)731 123456']) assert.deepEqual(contactErrors({ phone: ok }), [], ok);
  for (const bad of ['---', 'abc', '12', '+49 731 1234567890123456789012345']) assert.deepEqual(contactErrors({ phone: bad }), ['data.phone:invalid_phone'], bad);
  for (const ok of ['hallo@example.com', 'a.b@sub.example.de']) assert.deepEqual(contactErrors({ email: ok }), [], ok);
  for (const bad of ['nope', 'x"@y.de', 'a@b.c', 'a b@c.de']) assert.deepEqual(contactErrors({ email: bad }), ['data.email:invalid_email'], bad);
  for (const ok of ['https://maps.app.goo.gl/abc', 'https://www.google.com/maps/place/Ulm', 'https://maps.apple.com/?q=Ulm', 'https://www.openstreetmap.org/#map=12/48.4/10']) assert.deepEqual(contactErrors({ mapsUrl: ok }), [], ok);
  for (const bad of ['https://evil.example/', 'https://www.google.com/search?q=ulm', 'http://maps.app.goo.gl/abc', 'maps.app.goo.gl/abc']) assert.deepEqual(contactErrors({ mapsUrl: bad }), ['data.mapsUrl:invalid_maps_link'], bad);
  for (const lang of ['en', 'de']) for (const code of ['invalid_phone', 'invalid_email', 'invalid_maps_link', 'too_long']) {
    const msg = INSP.errorText(lang, { code, max: 80 });
    assert.ok(msg && msg !== INSP.TX[lang].e_other && !/\{|undefined/.test(msg), lang + ' ' + code);
  }
  assert.equal(INSP.errorText('en', { code: 'invalid_phone' }, 'phone'), 'Enter a phone number, e.g. +49 731 123456.');
  assert.equal(INSP.errorText('de', { code: 'invalid_email' }, 'email'), 'Gib eine E-Mail-Adresse ein, z. B. name@beispiel.de.');
});

test('the "(0)" warning: country code followed by (0); an inspector hint only, core.js keeps the number', () => {
  for (const v of ['+49 (0)731 123456', '+49 (0) 731 123456', '+49(0)731', '0049 (0)731 12', '+43 ( 0 ) 1 234', '  +41-(0)44 123']) assert.equal(INSP.phoneZeroWarning(v), true, v);
  for (const v of ['+49 731 123456', '0731 123456', '(0731) 123456', '+49 (731) 123-4', '', null, '+49 731 (0)']) assert.equal(INSP.phoneZeroWarning(v), false, String(v));
  // stored and validated unchanged
  assert.deepEqual(contactErrors({ phone: '+49 (0)731 123456' }), []);
  const html = V3.renderDesign(contact({ phone: '+49 (0)731 123456' }), {}).html;
  assert.ok(html.includes('href="tel:+490731123456"') && html.includes('+49 (0)731 123456</a>'), 'the renderer is unchanged');
  for (const lang of ['en', 'de']) assert.match(INSP.TX[lang].warn_phone_zero, /\(0\)/);
});

test('Contact labels, group headings and hints in English and German', () => {
  const en = INSP.TX.en, de = INSP.TX.de;
  assert.deepEqual(['line1', 'line2', 'postalCode', 'city', 'country', 'phone', 'email', 'mapsUrl', 'showMapLink'].map((k) => en['f_' + k]),
    ['Street and number', 'Address line 2', 'Postal code', 'City', 'Country', 'Phone', 'Email', 'Map link', 'Show directions button']);
  assert.deepEqual(['line1', 'line2', 'postalCode', 'city', 'country', 'phone', 'email', 'mapsUrl', 'showMapLink'].map((k) => de['f_' + k]),
    ['Straße und Hausnummer', 'Adresszusatz', 'Postleitzahl', 'Ort', 'Land', 'Telefon', 'E-Mail', 'Karten-Link', 'Routen-Button anzeigen']);
  assert.deepEqual([en.g_directions, de.g_directions], ['Directions', 'Route']);
  assert.match(en.hint_show_map, /only when a valid map link/);
  assert.match(de.hint_show_map, /nur, wenn ein gültiger Karten-Link/);
  assert.match(en.hint_maps, /Google Maps, Apple Maps or OpenStreetMap/);
  assert.match(de.hint_maps, /Google Maps, Apple Maps oder OpenStreetMap/);
  // the Contact labels use their own keys: no Hero, Buttons or Social Media field shares them
  const others = [INSP.HERO_PLAN, INSP.BUTTONS_PLAN, INSP.SOCIAL_PLAN].flatMap((p) => p.flatMap((c) => (c.item || []).map((f) => f.path).concat(c.path ? [c.path] : []))).map((p) => p[p.length - 1]);
  for (const k of others) assert.ok(!Object.prototype.hasOwnProperty.call(en, 'f_' + k), k);
});

test('Contact HTML: address lines, tel / mailto links, the Directions button only with a map link and the switch on; empty -> nothing public', () => {
  const full = { title: 'Kontakt', address: { line1: 'Musterstraße 1', line2: 'Hinterhaus', postalCode: '89073', city: 'Ulm', country: 'Deutschland' }, phone: '+49 (731) 123-4', email: 'hallo@example.com', mapsUrl: 'https://maps.app.goo.gl/abc' };
  const html = (data, extra, pv) => V3.renderDesign(contact(data, extra), { businessName: 'B' }, { preview: !!pv }).html;
  const h = html(full);
  assert.ok(h.includes('<h2 class="v3-h2">Kontakt</h2>'));
  assert.ok(h.includes('Musterstraße 1<br>Hinterhaus<br>89073 Ulm<br>Deutschland</address>'), 'address lines, postal code + city together');
  assert.ok(h.includes('<a href="tel:+497311234">'), 'tel: without spaces, brackets and dashes');
  assert.ok(h.includes('+49 (731) 123-4</a>'), 'shown as typed');
  assert.ok(h.includes('<a href="mailto:hallo@example.com">'));
  assert.ok(h.includes('<a class="v3-btn v3-btn-outline" href="https://maps.app.goo.gl/abc" target="_blank" rel="noopener noreferrer">'), 'Directions button');
  assert.ok(!html(Object.assign({}, full, { showMapLink: false })).includes('<a class="v3-btn v3-btn-outline"'), 'switch off: no button');
  assert.ok(!html(Object.assign({}, full, { mapsUrl: '' })).includes('<a class="v3-btn v3-btn-outline"'), 'no map link: no button');
  assert.ok(!html({ title: 'Kontakt' }).includes('<section'), 'title only: nothing on the public page');
  assert.ok(html({ title: 'Kontakt' }, {}, true).includes('v3-ph-section'), 'title only: the empty note in the preview');
  // Card and Split render alike; alignment only reaches the section class (hence not offered)
  const sectionOf = (x) => x.slice(x.indexOf('<section'), x.indexOf('</section>'));
  assert.equal(sectionOf(html(full, { variant: 'split' })).replace('v3-v-split', 'v3-v-card'), sectionOf(h));
  assert.equal(html(full, { variant: 'split' }).replace('v3-contact v3-v-split', 'v3-contact v3-v-card'), h, 'and the page CSS is the same');
  assert.equal(html(full, { style: { background: 'dark', spacing: 'roomy' } }).includes('class="v3-s v3-contact v3-v-card v3-bg-dark v3-al-left v3-sp-roomy"'), true);
  // hostile text is escaped
  const e = html({ title: '<img src=x onerror=alert(1)>', address: { line1: '"><svg onload=alert(2)>' } });
  assert.ok(e.includes('&lt;img src=x onerror=alert(1)&gt;') && e.includes('&quot;&gt;&lt;svg onload=alert(2)&gt;') && !e.includes('<svg onload'));
});

// ── Opening Hours (2A-3E) ──
const hoursDesign = (data, extra) => ({ schemaVersion: 1, pages: [{ id: 'start', sections: [Object.assign({ id: 's_hrs01', type: 'openingHours', data }, extra)] }] });
const hoursErrors = (data) => V3.validateDesign(hoursDesign(data)).errors.map((e) => e.path.replace('$.pages[0].sections[0].', '') + ':' + e.code);

test('Contact regression: plan and texts exactly as approved at 5a2bce6', () => {
  const then = inspectorAt('5a2bce6');
  if (then) {
    for (const k of ['HERO_PLAN', 'BUTTONS_PLAN', 'SOCIAL_PLAN', 'CONTACT_PLAN']) assert.deepEqual(JSON.parse(JSON.stringify(INSP[k])), JSON.parse(JSON.stringify(then.exports[k])), k);
    for (const lang of ['en', 'de']) for (const [k, v] of Object.entries(then.exports.TX[lang])) assert.equal(INSP.TX[lang][k], v, lang + ' ' + k + ' unchanged');
  }
});

test('every Opening Hours field from describe() has a control; Layout and Alignment are not offered', () => {
  const plan = INSP.HOURS_PLAN;
  const tab = (t) => plan.filter((c) => c.path && c.tab === t).map((c) => c.control + ':' + c.path.join('.'));
  assert.deepEqual(tab('content'), ['text:data.title', 'hours:data.days', 'text:data.note']);
  assert.deepEqual(tab('style'), ['select:style.background', 'select:style.spacing'], 'no Layout (Table and Compact render alike), no Alignment (the table stays left)');
  assert.deepEqual(tab('settings'), ['anchor:anchor', 'show:hidden', 'readonly:id']);
  assert.deepEqual(Object.keys(D.sections.openingHours.data.fields), ['title', 'days', 'note'], 'nothing else to edit');
  assert.deepEqual(Object.keys(D.sections.openingHours.data.fields.days.item.fields), ['day', 'closed', 'ranges'], 'the day rows cover day, closed and ranges');
  const s = (p) => INSP.specFor(D, 'openingHours', p);
  assert.deepEqual([s(['data', 'title']).max, s(['data', 'note']).max, s(['data', 'note']).multiline, s(['data', 'days']).max, s(['data', 'days', 0, 'ranges']).max], [80, 300, true, 7, 3]);
  assert.deepEqual(D.choices.days, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.deepEqual(INSP.PLANS.openingHours, plan);
});

test('day status: Open (times), Closed, Not shown (not listed) — as core.js renders them', () => {
  assert.equal(INSP.dayState(undefined), 'hidden');
  assert.equal(INSP.dayState({ day: 'mon', closed: true }), 'closed');
  assert.equal(INSP.dayState({ day: 'mon', closed: true, ranges: [{ open: '08:00', close: '12:00' }] }), 'closed', 'Closed wins over kept times');
  assert.equal(INSP.dayState({ day: 'mon', ranges: [] }), 'closed', 'a listed day without times is shown as Closed');
  assert.equal(INSP.dayState({ day: 'mon', ranges: [{ open: '08:00', close: '12:00' }] }), 'open');
  const html = (days) => V3.renderDesign(hoursDesign({ title: 'Zeiten', days }), {}).html;
  assert.ok(html([{ day: 'mon', closed: true, ranges: [{ open: '08:00', close: '12:00' }] }]).includes('<tr class="v3-closed"><th scope="row">Montag</th><td>Geschlossen</td></tr>'));
  assert.ok(html([{ day: 'mon', ranges: [] }]).includes('<th scope="row">Montag</th><td>Geschlossen</td>'));
  assert.ok(!html([{ day: 'tue', ranges: [{ open: '08:00', close: '12:00' }] }]).includes('Montag'), 'a day not listed is not shown');
  assert.ok(html([{ day: 'sun', closed: true }, { day: 'mon', ranges: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '18:00' }] }])
    .includes('<th scope="row">Montag</th><td>08:00–12:00, 13:00–18:00</td></tr><tr class="v3-closed"><th scope="row">Sonntag</th>'), 'always Monday to Sunday, ranges joined');
});

test('Opening Hours validation the editor relies on, with an EN/DE message for every code', () => {
  assert.deepEqual(hoursErrors({ days: [{ day: 'mon', ranges: [{ open: '08:00', close: '24:00' }] }] }), [], '24:00 is midnight');
  assert.deepEqual(hoursErrors({ days: [{ day: 'mon', ranges: [{ open: '', close: '' }] }] }), ['data.days[0].ranges[0].open:required', 'data.days[0].ranges[0].close:required'], 'a newly opened day waits for its times');
  assert.deepEqual(hoursErrors({ days: [{ day: 'mon', ranges: [{ open: '8:00', close: '25:00' }] }] }), ['data.days[0].ranges[0].open:invalid_time', 'data.days[0].ranges[0].close:invalid_time']);
  assert.deepEqual(hoursErrors({ days: [{ day: 'mon', ranges: [{ open: '18:00', close: '08:00' }] }] }), ['data.days[0].ranges[0]:closes_before_opening']);
  assert.deepEqual(hoursErrors({ days: [{ day: 'mon' }, { day: 'mon' }] }), ['data.days[1].day:duplicate']);
  assert.deepEqual(hoursErrors({ days: [{ day: 'mon', ranges: [1, 2, 3, 4].map(() => ({ open: '08:00', close: '09:00' })) }] }), ['data.days[0].ranges:too_many']);
  for (const lang of ['en', 'de']) {
    const tx = INSP.TX[lang];
    assert.equal(INSP.errorText(lang, { code: 'required' }, 'time'), tx.e_enter_time);
    assert.equal(INSP.errorText(lang, { code: 'duplicate' }, 'day'), tx.e_duplicate_day);
    assert.equal(INSP.errorText(lang, { code: 'duplicate' }, 'anchor'), tx.e_duplicate, 'the link-name message is unchanged');
    for (const code of ['invalid_time', 'closes_before_opening']) assert.ok(INSP.errorText(lang, { code }) !== tx.e_other, lang + ' ' + code);
    for (const d of D.choices.days) assert.ok(tx['d_' + d], lang + ' ' + d);
    for (const s of ['open', 'closed', 'hidden']) assert.ok(tx['ds_' + s], lang + ' ' + s);
  }
  assert.deepEqual(['d_mon', 'd_sun', 'ds_open', 'ds_closed', 'ds_hidden', 'add_range'].map((k) => INSP.TX.de[k]), ['Montag', 'Sonntag', 'Geöffnet', 'Geschlossen', 'Nicht anzeigen', 'Zeitraum hinzufügen']);
  // the day names match the ones the page shows
  const page = V3.renderDesign(hoursDesign({ days: D.choices.days.map((day) => ({ day, closed: true })) }), {}).html;
  for (const d of D.choices.days) assert.ok(page.includes('<th scope="row">' + INSP.TX.de['d_' + d] + '</th>'), d);
});

test('Opening Hours title / note counters count exactly what validateDesign counts', () => {
  for (const [field, max, multiline] of [['title', 80, false], ['note', 300, true]]) {
    for (const t of ['  Zeiten  ', 'Zeile\nzwei', 'ä😀', 'a‮b']) {
      for (const extra of [max, max + 1].map((n) => n - INSP.textLength(t, multiline))) {
        if (extra < 0) continue;
        const v = t + 'x'.repeat(extra);
        assert.equal(hoursErrors({ [field]: v }).some((e) => e.endsWith(':too_long')), INSP.textLength(v, multiline) > max, field + ' ' + JSON.stringify(v.slice(0, 10)));
      }
    }
  }
});

// ── Products (2A-3F) ──
const productsDesign = (data, extra) => ({ schemaVersion: 1, pages: [{ id: 'start', sections: [Object.assign({ id: 's_prd01', type: 'products', data }, extra)] }] });
const productErrors = (data) => V3.validateDesign(productsDesign(data)).errors.map((e) => e.path.replace('$.pages[0].sections[0].', '') + ':' + e.code);

test('Opening Hours regression: plans and texts exactly as approved at e3e7afc', () => {
  const then = inspectorAt('e3e7afc');
  if (then) {
    for (const k of ['HERO_PLAN', 'BUTTONS_PLAN', 'SOCIAL_PLAN', 'CONTACT_PLAN', 'HOURS_PLAN']) assert.deepEqual(JSON.parse(JSON.stringify(INSP[k])), JSON.parse(JSON.stringify(then.exports[k])), k);
    for (const lang of ['en', 'de']) for (const [k, v] of Object.entries(then.exports.TX[lang])) assert.equal(INSP.TX[lang][k], v, lang + ' ' + k + ' unchanged');
    for (const t of ['buttons', 'socialMedia']) for (const k of ['heading', 'add', 'max', 'remove', 'removed', 'moved', 'focus', 'select']) assert.equal(INSP.LISTS[t][k], then.exports.LISTS[t][k], t + ' ' + k);
  }
});

test('every Products field from describe() has a control; Alignment is not offered', () => {
  const plan = INSP.PRODUCTS_PLAN;
  const items = plan.find((c) => c.control === 'items');
  const tab = (t) => plan.filter((c) => c.path && c.tab === t).map((c) => c.control + ':' + c.path.join('.'));
  assert.deepEqual(tab('content'), ['text:data.title', 'items:data.items']);
  assert.deepEqual(tab('style'), ['select:variant', 'select:style.background', 'select:style.spacing'], 'no Alignment (it centres the card texts but not the cards or buttons)');
  assert.deepEqual(tab('settings'), ['anchor:anchor', 'show:hidden', 'readonly:id']);
  assert.deepEqual(Object.keys(D.sections.products.data.fields), ['title', 'items']);
  assert.deepEqual(items.item.map((f) => f.control + ':' + f.path.join('.')), ['text:name', 'text:description', 'text:price', 'imageView:image', 'link:target', 'text:buttonText']);
  assert.deepEqual(items.item.map((f) => f.path[0]).sort(), Object.keys(D.sections.products.data.fields.items.item.fields).sort(), 'every product field, nothing invented');
  const s = (p) => INSP.specFor(D, 'products', p);
  assert.deepEqual([s(['data', 'title']).max, s(['data', 'items']).max], [80, 24]);
  assert.deepEqual(['name', 'description', 'price', 'buttonText'].map((k) => s(['data', 'items', 0, k]).max), [80, 200, 20, 30]);
  assert.equal(s(['data', 'items', 0, 'name']).required, true);
  assert.deepEqual([s(['data', 'items', 0, 'target']).t, s(['data', 'items', 0, 'target']).kind, s(['data', 'items', 0, 'image']).t], ['link', 'link', 'image']);
  assert.deepEqual(s(['variant']).values, ['grid', 'list']);
  for (const lang of ['en', 'de']) for (const v of ['grid', 'list']) assert.ok(INSP.TX[lang]['v_' + v], lang + ' ' + v);
  assert.deepEqual(INSP.PLANS.products, plan);
});

test('a new product is named, so it is valid at once; closed rows show the name and the price', () => {
  const P = INSP.LISTS.products, tx = (k) => INSP.TX.en[k], de = (k) => INSP.TX.de[k];
  assert.deepEqual(P.newItem(tx), { name: 'New product' });
  assert.deepEqual(P.newItem(de), { name: 'Neues Produkt' });
  assert.deepEqual(productErrors({ items: [P.newItem(tx)] }), []);
  assert.deepEqual([P.heading, P.add, P.max, P.remove, P.removed, P.moved, P.focus, P.select], ['products', 'add_product', 'max_products', 'remove_product', 'product_removed', 'product_moved', 'name', true]);
  assert.equal(P.name({ name: 'Bauernbrot' }, tx), 'Bauernbrot');
  assert.equal(P.name({ name: '  ' }, tx), '(no name)');
  assert.equal(P.tag({ price: '4,20 €' }), '4,20 €');
  assert.equal(P.tag({}), '');
  assert.deepEqual(productErrors({ items: [{ name: '' }] }), ['data.items[0].name:required']);
  assert.deepEqual(productErrors({ items: Array.from({ length: 25 }, (x, i) => ({ name: 'P' + i })) }), ['data.items:too_many']);
  assert.deepEqual(productErrors({ items: [{ name: 'A', target: 'javascript:alert(1)' }] }), ['data.items[0].target:invalid_link']);
  assert.deepEqual(productErrors({ items: [{ name: 'A', target: '/kontakt' }] }), ['data.items[0].target:unknown_internal_target'], 'internal links must point to a section');
  for (const ok of ['https://example.com/shop', 'mailto:a@b.de', 'tel:+497311']) assert.deepEqual(productErrors({ items: [{ name: 'A', target: ok }] }), [], ok);
});

test('Products counters count exactly what validateDesign counts', () => {
  for (const [field, max] of [['name', 80], ['description', 200], ['price', 20], ['buttonText', 30]]) {
    for (const t of ['  4,20 €  ', 'Zeile\nzwei', 'ä😀', 'a‮b']) {
      for (const extra of [max, max + 1].map((n) => n - INSP.textLength(t, false))) {
        if (extra < 0) continue;
        const v = t + 'x'.repeat(extra);
        assert.equal(productErrors({ items: [Object.assign({ name: 'N' }, { [field]: v })] }).some((e) => e.endsWith(':too_long')), INSP.textLength(v, false) > max, field + ' ' + JSON.stringify(v.slice(0, 10)));
      }
    }
  }
});

test('Products HTML: Grid / List, price as written, the button only with a link (default text from the page language), image only when set; escaped', () => {
  const html = (data, extra, pv, lang) => V3.renderDesign(Object.assign(productsDesign(data, extra), lang ? { settings: { language: lang } } : {}), { businessName: 'B' }, { preview: !!pv }).html;
  const items = [{ name: 'Bauernbrot', description: 'Sauerteig, 1 kg', price: 'ab 4,20 €', target: 'https://example.com/brot', buttonText: 'Bestellen' }, { name: 'Croissant', price: '1,40 €', target: 'https://example.com/c' }, { name: 'Brezel' }];
  const h = html({ title: 'Produkte', items });
  assert.ok(h.includes('<div class="v3-prods v3-prods-grid">'));
  assert.ok(html({ items }, { variant: 'list' }).includes('<div class="v3-prods v3-prods-list">'));
  assert.ok(h.includes('<p class="v3-prod-price">ab 4,20 €</p>'), 'price shown as written');
  assert.ok(h.includes('<a class="v3-btn v3-btn-primary v3-prod-btn" href="https://example.com/brot" target="_blank" rel="noopener noreferrer"><span>Bestellen</span></a>'));
  assert.ok(h.includes('href="https://example.com/c" target="_blank" rel="noopener noreferrer"><span>Ansehen</span></a>'), 'empty button text: "Ansehen" (German page)');
  assert.equal((h.match(/<a class="v3-btn v3-btn-primary v3-prod-btn"/g) || []).length, 2, 'no link, no button');
  assert.ok(!h.includes('<img class="v3-prod-img"') && !h.includes('v3-img-ph'), 'no image: none on the public page');
  assert.ok(html({ items }, {}, true).includes('v3-img-ph v3-prod-img'), 'the preview shows a placeholder');
  const img = 'https://res.cloudinary.com/demo/image/upload/v1/brot.jpg';
  assert.ok(html({ items: [{ name: 'Brot', image: img }] }).includes('<img class="v3-prod-img" src="' + img + '" alt="Brot"'), 'image with the name as its description');
  const e = html({ title: '<img src=x onerror=alert(1)>', items: [{ name: '"><svg onload=alert(2)>', price: '<b>9</b>' }] });
  assert.ok(e.includes('&lt;img src=x onerror=alert(1)&gt;') && e.includes('&quot;&gt;&lt;svg onload=alert(2)&gt;') && e.includes('&lt;b&gt;9&lt;/b&gt;') && !e.includes('<svg onload'));
});

test('Products labels and hints in English and German', () => {
  assert.deepEqual(['name', 'description', 'price', 'buttonText', 'image'].map((k) => INSP.TX.en['f_' + k]), ['Product name', 'Description', 'Price', 'Button text', 'Image']);
  assert.deepEqual(['name', 'description', 'price', 'buttonText', 'image'].map((k) => INSP.TX.de['f_' + k]), ['Produktname', 'Beschreibung', 'Preis', 'Button-Text', 'Bild']);
  assert.match(INSP.TX.en.product_image_later, /later step/);
  assert.match(INSP.TX.de.product_image_later, /späteren Schritt/);
  assert.match(INSP.TX.en.hint_product_button, /"View"/);
  assert.match(INSP.TX.de.hint_product_button, /„Ansehen“/);
  // the product labels use their own keys: no earlier editor field shares them
  const others = [INSP.HERO_PLAN, INSP.BUTTONS_PLAN, INSP.SOCIAL_PLAN, INSP.CONTACT_PLAN, INSP.HOURS_PLAN].flatMap((p) => p.flatMap((c) => (c.item || []).map((f) => f.path).concat(c.path ? [c.path] : []))).map((p) => p[p.length - 1]);
  for (const k of ['name', 'description', 'price', 'buttonText', 'image']) assert.ok(!others.includes(k), k);
});

test('every Social Media field from describe() has exactly one control, in the approved tab', () => {
  const plan = INSP.SOCIAL_PLAN;
  const items = plan.find((c) => c.control === 'items');
  const planned = plan.filter((c) => c.path && c.control !== 'items').map((c) => c.path.join('.'))
    .concat(items.item.map((f) => 'data.links[].' + f.path.join('.')));
  const spec = D.sections.socialMedia.data;
  const want = ['data.title'].concat(Object.keys(spec.fields.links.item.fields).map((k) => 'data.links[].' + k))
    .concat(['variant', 'style.background', 'style.align', 'style.spacing', 'anchor', 'hidden', 'id']);
  assert.deepEqual(planned.slice().sort(), want.slice().sort());
  assert.deepEqual(Object.keys(spec.fields), ['title', 'links']);
  const tab = (t) => plan.filter((c) => c.path && c.tab === t).map((c) => c.path.join('.'));
  assert.deepEqual(tab('content'), ['data.title', 'data.links']);
  assert.deepEqual(tab('style'), ['variant', 'style.background', 'style.align', 'style.spacing']);
  assert.deepEqual(tab('settings'), ['anchor', 'hidden', 'id']);
  assert.deepEqual(items.item.map((f) => f.control + ':' + f.path.join('.')), ['select:platform', 'social:url']);
  assert.equal(items.item[1].platformFrom, 'platform');
  assert.deepEqual(INSP.PLANS.socialMedia, plan);
});

test('Social Media rules come from describe(): 8 links, title 80, required platform and address, the eight platforms, two layouts', () => {
  const s = (p) => INSP.specFor(D, 'socialMedia', p);
  assert.equal(s(['data', 'links']).max, 8);
  assert.equal(s(['data', 'title']).max, 80);
  assert.equal(s(['data', 'links', 0, 'platform']).required, true);
  assert.equal(s(['data', 'links', 0, 'url']).required, true);
  assert.equal(s(['data', 'links', 0, 'url']).t, 'social');
  assert.deepEqual(s(['data', 'links', 0, 'platform']).values, ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'pinterest', 'whatsapp']);
  assert.deepEqual(s(['data', 'links', 0, 'platform']).values, D.choices.socialPlatforms);
  assert.deepEqual(s(['variant']).values, ['icons', 'buttons']);
  assert.deepEqual([s(['style', 'background']).values, s(['style', 'align']).values, s(['style', 'spacing']).values], [['default', 'alt', 'brand', 'dark'], ['left', 'center'], ['normal', 'compact', 'roomy']]);
  for (const lang of ['en', 'de']) {
    for (const p of D.choices.socialPlatforms) assert.ok(INSP.TX[lang]['pf_' + p], lang + ' ' + p);
    for (const v of s(['variant']).values) assert.ok(INSP.TX[lang]['v_' + v], lang + ' ' + v);
  }
  // the labels are the names the page shows (core.js SOCIAL_LABEL)
  for (const p of D.choices.socialPlatforms) {
    const html = V3.renderDesign(social([{ platform: p, url: p === 'whatsapp' ? 'https://wa.me/491512345678' : 'https://' + INSP.SOCIAL_HINT_HOSTS[p][0] + '/a' }]), {}, {}).html;
    assert.ok(html.includes('aria-label="' + INSP.TX.en['pf_' + p] + '"'), p);
  }
});

const social = (links, extra) => ({ schemaVersion: 1, pages: [{ id: 'start', sections: [Object.assign({ id: 's_soc01', type: 'socialMedia', data: { title: 'T', links } }, extra)] }] });
const socialErrors = (links) => V3.validateDesign(social(links)).errors.map((e) => e.path.replace('$.pages[0].sections[0].', '') + ':' + e.code);

test('all eight platforms: every hinted host and placeholder is accepted by core.js; other platforms\' addresses, http and other hosts are refused', () => {
  const all = D.choices.socialPlatforms;
  assert.deepEqual(Object.keys(INSP.SOCIAL_HINT_HOSTS).sort(), all.filter((p) => p !== 'whatsapp').sort(), 'a hint for each URL platform');
  assert.deepEqual(Object.keys(INSP.SOCIAL_PLACEHOLDER).sort(), all.filter((p) => p !== 'whatsapp').sort());
  for (const p of all.filter((x) => x !== 'whatsapp')) {
    for (const h of INSP.SOCIAL_HINT_HOSTS[p]) assert.deepEqual(socialErrors([{ platform: p, url: 'https://' + h + '/example' }]), [], p + ' ' + h);
    assert.deepEqual(socialErrors([{ platform: p, url: INSP.SOCIAL_PLACEHOLDER[p].replace('…', 'example') }]), [], p + ' placeholder');
    assert.ok(INSP.SOCIAL_PLACEHOLDER[p].startsWith('https://'));
    const host = INSP.SOCIAL_HINT_HOSTS[p][0];
    assert.deepEqual(socialErrors([{ platform: p, url: 'http://' + host + '/example' }]), ['data.links[0].url:invalid_social_link'], p + ' http');
    assert.deepEqual(socialErrors([{ platform: p, url: 'https://evil.example/' + host }]), ['data.links[0].url:invalid_social_link'], p + ' other host');
    assert.deepEqual(socialErrors([{ platform: p, url: host + '/example' }]), ['data.links[0].url:invalid_social_link'], p + ' without https://');
    assert.deepEqual(socialErrors([{ platform: p, url: '' }]), ['data.links[0].url:required'], p + ' empty');
    for (const q of all.filter((x) => x !== p && x !== 'whatsapp')) {
      // (X and Twitter are one platform; no host is shared between two platforms)
      assert.deepEqual(socialErrors([{ platform: p, url: 'https://' + INSP.SOCIAL_HINT_HOSTS[q][0] + '/example' }]), ['data.links[0].url:invalid_social_link'], p + ' with a ' + q + ' address');
    }
  }
  // WhatsApp: the number the owner types becomes a wa.me link core.js accepts
  assert.deepEqual(socialErrors([{ platform: 'whatsapp', url: INSP.whatsappLink('+49 151 2345678') }]), []);
  assert.deepEqual(socialErrors([{ platform: 'whatsapp', url: INSP.whatsappLink('0049 151 234 56 78') }]), []);
  assert.equal(INSP.whatsappLink('0049 151 234 56 78'), 'https://wa.me/491512345678');
  assert.deepEqual(socialErrors([{ platform: 'whatsapp', url: INSP.whatsappLink('abc') || undefined }]), ['data.links[0].url:required']);
  assert.deepEqual(socialErrors([{ platform: 'whatsapp', url: 'https://www.instagram.com/example' }]), ['data.links[0].url:invalid_social_link']);
  // the quirks that stay: any path, duplicate platforms
  assert.deepEqual(socialErrors([{ platform: 'instagram', url: 'https://www.instagram.com/' }, { platform: 'instagram', url: 'https://instagram.com/b' }]), []);
});

test('a new social link is Instagram with an empty address: incomplete only in its address', () => {
  const S = INSP.LISTS.socialMedia;
  const item = S.newItem((k) => INSP.TX.en[k]);
  assert.deepEqual(item, { platform: 'instagram', url: '' });
  assert.deepEqual(socialErrors([item]), ['data.links[0].url:required']);
  assert.deepEqual([S.heading, S.add, S.max, S.remove, S.removed, S.moved, S.focus, S.select], ['social_links', 'add_link', 'max_links', 'remove_link', 'link_removed', 'link_moved', 'url', false]);
  // a platform change keeps the address; core.js reports when it no longer fits
  assert.deepEqual(socialErrors([{ platform: 'tiktok', url: 'https://www.instagram.com/example' }]), ['data.links[0].url:invalid_social_link']);
});

test('closed social rows: the platform name and the address host (WhatsApp: the number)', () => {
  const S = INSP.LISTS.socialMedia, tx = (k) => INSP.TX.en[k], de = (k) => INSP.TX.de[k];
  assert.equal(S.name({ platform: 'youtube' }, tx), 'YouTube');
  assert.equal(S.name({ platform: 'x' }, de), 'X');
  assert.equal(S.tag({ platform: 'instagram', url: 'https://WWW.Instagram.com/example?x=1' }, tx), 'www.instagram.com');
  assert.equal(S.tag({ platform: 'instagram', url: '' }, tx), '(no address)');
  assert.equal(S.tag({ platform: 'instagram', url: '' }, de), '(keine Adresse)');
  assert.equal(S.tag({ platform: 'whatsapp', url: 'https://wa.me/491512345678' }, tx), '+491512345678');
  assert.equal(S.tag({ platform: 'instagram', url: 'not a url' }, tx), 'not a url');
  assert.equal(S.tag({ platform: 'instagram', url: 'x'.repeat(200) }, tx).length, 40, 'long text shortened');
});

test('social texts: hints, the two address errors with platform and hosts, in English and German', () => {
  assert.equal(INSP.socialHosts('en', 'instagram'), 'instagram.com');
  assert.equal(INSP.socialHosts('en', 'facebook'), 'facebook.com or fb.com');
  assert.equal(INSP.socialHosts('de', 'x'), 'x.com oder twitter.com');
  assert.equal(INSP.errorText('en', { code: 'required' }, 'social'), 'Enter the profile address.');
  assert.equal(INSP.errorText('de', { code: 'required' }, 'social'), 'Gib die Profiladresse ein.');
  assert.equal(INSP.errorText('en', { code: 'invalid_social_link', platform: 'YouTube', hosts: INSP.socialHosts('en', 'youtube') }, 'social'),
    'YouTube addresses start with https:// on youtube.com or youtu.be.');
  assert.equal(INSP.errorText('de', { code: 'invalid_social_link', platform: 'TikTok', hosts: INSP.socialHosts('de', 'tiktok') }, 'social'),
    'TikTok-Adressen beginnen mit https:// auf tiktok.com.');
  for (const lang of ['en', 'de']) {
    for (const p of Object.keys(INSP.SOCIAL_HINT_HOSTS)) {
      const msg = INSP.errorText(lang, { code: 'invalid_social_link', platform: INSP.TX[lang]['pf_' + p], hosts: INSP.socialHosts(lang, p) }, 'social');
      assert.ok(!/\{|undefined/.test(msg), msg);
      assert.ok(!/\{|undefined/.test(INSP.TX[lang].hint_social.replace('{hosts}', INSP.socialHosts(lang, p))));
    }
    assert.equal(INSP.errorText(lang, { code: 'too_many', max: 8 }), INSP.TX[lang].e_too_many.replace('{max}', 8));
    // the Buttons messages are unchanged by the new field
    assert.equal(INSP.errorText(lang, { code: 'required' }, 'target'), INSP.TX[lang].e_choose_target);
  }
});

test('the Social Media title counter counts exactly what validateDesign counts', () => {
  for (const t of ['  Folgen  ', 'Zeile\nzwei', '😀😀', 'a‮b']) {
    for (const extra of [80, 81].map((n) => n - INSP.textLength(t, false))) {
      if (extra < 0) continue;
      const v = t + 'x'.repeat(extra);
      const d = social([{ platform: 'instagram', url: 'https://instagram.com/a' }]);
      d.pages[0].sections[0].data.title = v;
      assert.equal(V3.validateDesign(d).errors.some((e) => e.code === 'too_long'), INSP.textLength(v, false) > 80, JSON.stringify(v.slice(0, 12)));
    }
  }
});

test('Hero regression: the Hero plan is exactly the one approved at 1f6beb9', () => {
  const { execFileSync } = require('child_process');
  let then;
  try { then = execFileSync('git', ['show', '1f6beb9:frontend/public/js/studio/studio-inspector.js'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }); }
  catch (e) { console.log('      (1f6beb9 not available here: compared with the plan text instead)'); }
  if (then) {
    const m = { exports: {} };
    new Function('module', 'exports', then)(m, m.exports);
    assert.deepEqual(JSON.parse(JSON.stringify(INSP.HERO_PLAN)), JSON.parse(JSON.stringify(m.exports.HERO_PLAN)));
    assert.deepEqual(INSP.PLANS.hero, INSP.HERO_PLAN);
  }
  // the Hero keeps the controls it was approved with
  assert.deepEqual(INSP.HERO_PLAN.filter((c) => c.path).map((c) => c.control + ':' + c.path.join('.')).join(' '),
    'text:data.eyebrow text:data.headline text:data.subheadline image:data.backgroundImage text:data.imageAlt text:data.primary.text color:data.primary.color link:data.primary.target ' +
    'select:data.primary.icon text:data.secondary.text link:data.secondary.target select:data.secondary.icon select:variant select:style.align number:data.overlay anchor:anchor show:hidden readonly:id');
});

test('every Buttons field from describe() has exactly one control, in the approved tab', () => {
  const plan = INSP.BUTTONS_PLAN;
  const items = plan.find((c) => c.control === 'items');
  const planned = plan.filter((c) => c.path && c.control !== 'items').map((c) => c.path.join('.'))
    .concat(items.item.map((f) => 'data.items[].' + f.path.join('.')));
  const spec = D.sections.buttons.data;
  const want = ['data.title', 'data.subtitle'].concat(Object.keys(spec.fields.items.item.fields).map((k) => 'data.items[].' + k))
    .concat(['variant', 'style.background', 'style.align', 'style.spacing', 'anchor', 'hidden', 'id']);
  assert.deepEqual(planned.slice().sort(), want.slice().sort());
  assert.deepEqual(items.path, ['data', 'items']);
  const tab = (t) => plan.filter((c) => c.path && c.tab === t).map((c) => c.path.join('.'));
  assert.deepEqual(tab('content'), ['data.title', 'data.subtitle', 'data.items']);
  assert.deepEqual(tab('style'), ['variant', 'style.background', 'style.align', 'style.spacing']);
  assert.deepEqual(tab('settings'), ['anchor', 'hidden', 'id']);
  assert.deepEqual(items.item.map((f) => f.control + ':' + f.path.join('.')), ['text:label', 'text:subtitle', 'select:kind', 'target:target', 'select:icon']);
  assert.equal(items.item.find((f) => f.path[0] === 'icon').noneLabel, 'i_default', '"Default for this type", not "None"');
  assert.equal(items.item.find((f) => f.path[0] === 'subtitle').hint, 'subtitle_layouts');
});

test('Buttons rules come from describe(): 12 buttons, limits, required label and target, the six action types', () => {
  const s = (p) => INSP.specFor(D, 'buttons', p);
  assert.equal(s(['data', 'items']).max, 12);
  assert.deepEqual([s(['data', 'title']).max, s(['data', 'subtitle']).max, s(['data', 'items', 0, 'label']).max, s(['data', 'items', 3, 'subtitle']).max], [80, 160, 40, 80]);
  assert.equal(s(['data', 'items', 0, 'label']).required, true);
  assert.equal(s(['data', 'items', 0, 'target']).required, true);
  assert.equal(s(['data', 'items', 0, 'target']).kindFrom, 'kind');
  assert.deepEqual(s(['data', 'items', 0, 'kind']).values, ['link', 'website', 'whatsapp', 'call', 'email', 'directions']);
  assert.deepEqual(s(['variant']).values, ['buttons', 'cards', 'list']);
  assert.deepEqual([s(['style', 'background']).values, s(['style', 'align']).values, s(['style', 'spacing']).values], [['default', 'alt', 'brand', 'dark'], ['left', 'center'], ['normal', 'compact', 'roomy']]);
  // every action type has a target control: Link -> the link chooser, the others -> an input
  for (const k of D.choices.linkKinds) assert.ok(k === 'link' || INSP.TARGET_INPUT[k], k);
  assert.deepEqual(Object.keys(INSP.TARGET_INPUT).sort(), D.choices.linkKinds.filter((k) => k !== 'link').sort());
  for (const lang of ['en', 'de']) for (const k of D.choices.linkKinds) assert.ok(INSP.TX[lang]['k_' + k] && INSP.TX[lang]['t_' + k], lang + ' ' + k);
});

test('list keys match validateDesign error paths', () => {
  assert.equal(INSP.errKey(['data', 'headline']), 'data.headline');
  assert.equal(INSP.errKey(['data', 'primary', 'target']), 'data.primary.target');
  assert.equal(INSP.errKey(['data', 'items', 2, 'label']), 'data.items[2].label');
  assert.equal(INSP.errKey(['data', 'items']), 'data.items');
  const d = { schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_q01xx', type: 'buttons', data: { items: [{ label: 'A', target: '/' }, { label: '', kind: 'call', target: 'x' }] } }] }] };
  const paths = V3.validateDesign(d).errors.map((e) => e.path.replace('$.pages[0].sections[0].', ''));
  assert.deepEqual(paths.sort(), [INSP.errKey(['data', 'items', 1, 'label']), INSP.errKey(['data', 'items', 1, 'target'])].sort());
});

test('WhatsApp: the number the owner types becomes the wa.me link core.js accepts', () => {
  const cases = { '+49 151 2345678': 'https://wa.me/491512345678', '0049 151 2345678': 'https://wa.me/491512345678', '49-151-234 56 78': 'https://wa.me/491512345678',
    '+1 (415) 555-0100': 'https://wa.me/14155550100', '': '', 'abc': '', '  +49 151 2345678 ': 'https://wa.me/491512345678' };
  for (const [typed, link] of Object.entries(cases)) assert.equal(INSP.whatsappLink(typed), link, typed);
  const ok = (target) => V3.validateDesign({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_q01xx', type: 'buttons', data: { items: [{ label: 'W', kind: 'whatsapp', target }] } }] }] });
  assert.ok(ok(INSP.whatsappLink('+49 151 2345678')).ok, 'core accepts the stored link');
  assert.equal(ok(INSP.whatsappLink('+49 12')).errors[0].code, 'invalid_whatsapp', 'too short: core refuses');
  assert.equal(ok(INSP.whatsappLink('abc')).errors[0].code, 'required', 'no digits: empty target');
  assert.equal(INSP.whatsappNumber('https://wa.me/491512345678'), '+491512345678', 'shown back as a number');
  assert.equal(INSP.whatsappNumber('https://example.com'), null);
});

test('every Hero field from describe() has exactly one control, in the approved tab', () => {
  const planned = INSP.HERO_PLAN.filter((c) => c.path).map((c) => c.path.join('.'));
  assert.equal(new Set(planned).size, planned.length, 'no field twice');
  const want = leaves(D.sections.hero.data, ['data']).concat(['variant', 'style.align', 'anchor', 'hidden', 'id']);
  assert.deepEqual(planned.slice().sort(), want.slice().sort());
  const tab = (t) => INSP.HERO_PLAN.filter((c) => c.path && c.tab === t).map((c) => c.path.join('.'));
  assert.deepEqual(tab('content'), ['data.eyebrow', 'data.headline', 'data.subheadline', 'data.backgroundImage', 'data.imageAlt',
    'data.primary.text', 'data.primary.color', 'data.primary.target', 'data.primary.icon', 'data.secondary.text', 'data.secondary.target', 'data.secondary.icon']);
  assert.deepEqual(tab('style'), ['variant', 'style.align', 'data.overlay']);
  assert.deepEqual(tab('settings'), ['anchor', 'hidden', 'id']);
  for (const c of INSP.HERO_PLAN.filter((x) => x.path)) assert.ok(INSP.heroSpec(D, c.path), 'spec for ' + c.path.join('.'));
});

test('the controls take their rules from describe(): text limits, choices, number range', () => {
  const spec = (p) => INSP.heroSpec(D, p.split('.'));
  assert.deepEqual([spec('data.eyebrow').max, spec('data.headline').max, spec('data.subheadline').max, spec('data.imageAlt').max, spec('data.primary.text').max, spec('data.secondary.text').max], [60, 120, 300, 120, 40, 40]);
  assert.equal(spec('data.headline').required, true);
  assert.equal(spec('data.subheadline').multiline, true);
  assert.deepEqual(spec('variant').values, ['overlay', 'split', 'simple']);
  assert.deepEqual(spec('style.align').values, ['left', 'center']);
  assert.deepEqual(spec('data.primary.icon').values, D.choices.icons);
  assert.deepEqual([spec('data.overlay').min, spec('data.overlay').max, spec('data.overlay').def], [0, 80, 45]);
  // and each control kind is the one for its type
  const kind = Object.fromEntries(INSP.HERO_PLAN.filter((c) => c.path).map((c) => [c.path.join('.'), c.control]));
  for (const [p, k] of Object.entries(kind)) {
    const t = spec(p).t;
    const expect = { str: 'text', image: 'image', link: 'link', enum: 'select', int: 'number', color: 'color', anchor: 'anchor', bool: 'show', id: 'readonly' }[t];
    assert.equal(k, expect, p);
  }
});

test('Hero style: background and spacing are not offered because the Hero renderer does not use them', () => {
  const base = { schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_hero01', type: 'hero', data: { headline: 'H' } }] }] };
  const html = (style) => { const d = JSON.parse(JSON.stringify(base)); d.pages[0].sections[0].style = style; return V3.renderDesign(d, {}, { preview: true }).html; };
  const ref = html({});
  for (const background of ['alt', 'brand', 'dark']) assert.equal(html({ background }), ref, background);
  for (const spacing of ['compact', 'roomy']) assert.equal(html({ spacing }), ref, spacing);
  assert.notEqual(html({ align: 'center' }), ref, 'alignment does change the Hero');
});

test('the character counter counts exactly what validateDesign counts', () => {
  const tricky = ['  Leerzeichen  ', 'Zeile\nzwei', 'Tab\tTab', '😀😀😀', 'ä'.repeat(3), 'a‮b', 'x\u0007y', '\r\n\r\nz'];
  const cases = [['eyebrow', 60, false], ['headline', 120, false], ['subheadline', 300, true], ['imageAlt', 120, false]];
  for (const [field, max, multiline] of cases) {
    for (const t of tricky) {
      for (const extra of [max - 1, max, max + 1].map((n) => n - INSP.textLength(t, multiline))) {
        if (extra < 0) continue;
        const v = t + 'x'.repeat(extra);
        const n = INSP.textLength(v, multiline);
        const d = { schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_hero01', type: 'hero', data: { headline: 'H', [field]: v } }] }] };
        const r = V3.validateDesign(d);
        const tooLong = r.errors.some((e) => e.code === 'too_long');
        assert.equal(tooLong, n > max, field + ' ' + JSON.stringify(v.slice(0, 20)) + ' counted ' + n + ' of ' + max);
      }
    }
  }
  // the same for the Buttons texts (section title / subtitle, button label / subtitle)
  const bcases = [[['title'], 80], [['subtitle'], 160], [['items', 0, 'label'], 40], [['items', 0, 'subtitle'], 80]];
  for (const [p, max] of bcases) {
    for (const t of tricky) {
      for (const extra of [max, max + 1].map((n) => n - INSP.textLength(t, false))) {
        if (extra < 0) continue;
        const v = t + 'x'.repeat(extra);
        const data = { items: [{ label: 'L', kind: 'link', target: '/' }] };
        if (p.length === 1) data[p[0]] = v; else data.items[0][p[2]] = v;
        const r = V3.validateDesign({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_q01xx', type: 'buttons', data }] }] });
        assert.equal(r.errors.some((e) => e.code === 'too_long'), INSP.textLength(v, false) > max, p.join('.') + ' ' + JSON.stringify(v.slice(0, 16)));
      }
    }
  }
});

test('every validation code a Hero or Buttons edit can produce has a message, in English and German', () => {
  for (const lang of ['en', 'de']) {
    for (const code of ['required', 'too_long', 'invalid_link', 'unknown_internal_target', 'invalid_color', 'out_of_range', 'invalid_anchor', 'reserved', 'duplicate',
      'invalid_url', 'invalid_whatsapp', 'invalid_phone', 'invalid_email', 'invalid_maps_link', 'too_many']) {
      const msg = INSP.errorText(lang, { code, max: 120, min: 0 });
      assert.ok(msg && msg !== INSP.TX[lang].e_other, lang + ' ' + code);
      assert.ok(!/\{(max|min)\}/.test(msg), 'placeholders filled: ' + msg);
    }
    assert.equal(INSP.errorText(lang, { code: 'something_new' }), INSP.TX[lang].e_other);
    // a missing button target asks for a destination; other required fields say "Required."
    assert.equal(INSP.errorText(lang, { code: 'required' }, 'target'), INSP.TX[lang].e_choose_target);
    assert.equal(INSP.errorText(lang, { code: 'required' }, 'label'), INSP.TX[lang].e_required);
  }
  assert.deepEqual(Object.keys(INSP.TX.de).sort(), Object.keys(INSP.TX.en).sort(), 'German has every English text');
});

test('Change Image stays disabled; the read-only view keeps every control disabled', () => {
  const change = SRC.match(/el\('button', \{[^}]*text: o\.t\('change_image'\)[^}]*\}/g) || [];
  assert.equal(change.length, 2, 'the Hero image control and the read-only view');
  for (const b of change) assert.ok(/disabled: true/.test(b), b);
  const ro = SRC.slice(SRC.indexOf('// ── read-only view'), SRC.indexOf('// ── editors (Hero, Buttons)'));
  const controls = ro.match(/el\('(input|textarea|select|button)', \{[^}]*\}/g) || [];
  assert.ok(controls.length >= 5);
  for (const c of controls) assert.ok(/disabled: true/.test(c), c);
  // the Hero editor is the only editable path, and only for EDITABLE types
  assert.ok(SRC.includes('var editable = EDITABLE.indexOf(sec.type) !== -1;'));
});

test('no network, storage or page navigation in the inspector', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /innerHTML/, /location\./, /postMessage/]) assert.ok(!re.test(code), String(re));
});

// ── Text (2A-3G) ──
test('the six earlier editors: plans and texts exactly as approved at e99ac11 (2A-3F)', () => {
  const then = inspectorAt('e99ac11');
  if (!then) return;
  for (const k of ['HERO_PLAN', 'BUTTONS_PLAN', 'SOCIAL_PLAN', 'CONTACT_PLAN', 'HOURS_PLAN', 'PRODUCTS_PLAN']) {
    assert.deepEqual(JSON.parse(JSON.stringify(INSP[k])), JSON.parse(JSON.stringify(then.exports[k])), k + ' unchanged');
  }
  for (const lang of ['en', 'de']) for (const [k, v] of Object.entries(then.exports.TX[lang])) assert.equal(INSP.TX[lang][k], v, lang + ' ' + k + ' unchanged');
  assert.deepEqual(JSON.parse(JSON.stringify(INSP.LISTS)), JSON.parse(JSON.stringify(then.exports.LISTS)));
  // the Hero image keeps its own hint (no c.hints on its plan entry)
  assert.equal(INSP.HERO_PLAN.find((c) => c.control === 'image').hints, undefined);
});

test('every Text field from describe() has exactly one control; three layouts offered; Style and Settings as for the other sections', () => {
  const plan = INSP.TEXT_PLAN;
  const fields = leaves(D.sections.text.data, []);
  assert.deepEqual(fields, ['heading', 'body', 'image', 'imageAlt']);
  for (const f of fields) assert.equal(plan.filter((c) => c.path && c.path.join('.') === 'data.' + f).length, 1, f);
  const by = (p) => plan.find((c) => c.path && c.path.join('.') === p);
  assert.equal(by('data.heading').control, 'text');
  assert.equal(by('data.body').control, 'text');
  assert.equal(by('data.image').control, 'image', 'shown and removable, never changed (uploads later)');
  assert.equal(by('data.imageAlt').control, 'text');
  assert.deepEqual(by('variant').values, ['plain', 'image-left', 'image-right']);
  assert.ok(by('variant').values.every((v) => D.sections.text.variants.includes(v)), 'only schema layouts');
  assert.deepEqual(D.sections.text.variants, ['plain', 'image-left', 'image-right', 'image-top'], 'the schema is unchanged');
  assert.deepEqual(plan.filter((c) => c.tab === 'style').map((c) => c.path.join('.')), ['variant', 'style.background', 'style.align', 'style.spacing']);
  assert.deepEqual(plan.filter((c) => c.tab === 'settings').map((c) => c.control), ['anchor', 'show', 'readonly']);
  assert.equal(D.sections.text.data.fields.body.multiline, true);
  assert.equal(INSP.PLANS.text, plan);
});

test('Text image hints: Plain with an image says it is not shown; Image left / right without one say uploads come later', () => {
  const h = INSP.TEXT_PLAN.find((c) => c.control === 'image').hints;
  const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg';
  assert.equal(h.plain_image(IMG, 'plain'), true);
  assert.equal(h.plain_image(IMG, 'image-left'), false);
  assert.equal(h.plain_image('', 'plain'), false);
  assert.equal(h.text_image_later('', 'image-left'), true);
  assert.equal(h.text_image_later('', 'image-right'), true);
  assert.equal(h.text_image_later('', 'plain'), false);
  assert.equal(h.text_image_later(IMG, 'image-left'), false);
});

test('Text counters count exactly what validateDesign counts (heading 120, body 2000 with line breaks)', () => {
  const design = (data) => ({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_text09', type: 'text', data }] }] });
  for (const [f, max, ml] of [['heading', 120, false], ['body', 2000, true]]) {
    const ok = 'a'.repeat(max - 1) + 'ü', over = ok + 'x';
    assert.equal(INSP.textLength(ok, ml), max);
    assert.ok(V3.validateDesign(design({ [f]: ok })).ok, f + ' at the limit');
    assert.equal(INSP.textLength(over, ml), max + 1);
    assert.ok(!V3.validateDesign(design({ [f]: over })).ok, f + ' over the limit');
  }
  assert.equal(INSP.textLength('a\nb', true), 3, 'a line break counts in the body');
});

test('Text HTML: Plain never shows an image (public or preview); Image left / right keep image and placeholder; text escaped with line breaks', () => {
  const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg';
  const base = require('./fixtures/lpV3/localBusiness.json');
  const page = (variant, data) => {
    const d = JSON.parse(JSON.stringify(base));
    d.pages[0].sections.push({ id: 's_text09', type: 'text', variant, data });
    return (opts) => {
      const r = V3.renderDesign(d, { businessName: 'X' }, opts);
      assert.ok(r.ok, JSON.stringify(r.errors));
      const html = r.html;
      const m = html.match(/<section id="s_text09"[\s\S]*?<\/section>/);
      return m ? m[0] : '';
    };
  };
  const full = { heading: 'Über <uns>', body: 'Zeile 1\nZeile 2', image: IMG, imageAlt: 'Theke' };
  for (const opts of [undefined, { preview: true }]) {
    const plain = page('plain', full)(opts);
    assert.ok(plain.includes('Über &lt;uns&gt;') && plain.includes('Zeile 1<br>Zeile 2'), 'text, escaped, line breaks');
    assert.ok(!/<img|<figure|v3-img-ph/.test(plain), 'Plain: no image, no placeholder');
    const left = page('image-left', full)(opts), right = page('image-right', full)(opts);
    for (const s of [left, right]) assert.ok(s.includes('<img src="' + IMG + '" alt="Theke"'), 'the image');
    assert.ok(left.indexOf('<figure') < left.indexOf('v3-text-body'), 'Image left: image first');
    assert.ok(right.indexOf('<figure') > right.indexOf('v3-text-body'), 'Image right: image after the text');
  }
  const noImg = { heading: 'H', body: 'B' };
  assert.ok(!/<figure/.test(page('image-left', noImg)()), 'public: no image, no placeholder');
  assert.ok(page('image-left', noImg)({ preview: true }).includes('v3-img-ph'), 'preview: placeholder');
  assert.ok(!/v3-img-ph/.test(page('plain', noImg)({ preview: true })), 'Plain preview: no placeholder');
  // Plain with only an image: nothing to show (the preview marks the empty section)
  assert.equal(page('plain', { image: IMG })(), '', 'public: left out');
  assert.ok(page('plain', { image: IMG })({ preview: true }).includes('v3-ph-section'), 'preview: empty-section note');
});

test('Text labels, layouts and hints in English and German', () => {
  for (const lang of ['en', 'de']) {
    for (const k of ['v_plain', 'v_image-left', 'v_image-right', 'v_image-top', 'hint_plain_image', 'hint_text_image_later']) assert.ok(INSP.TX[lang][k], lang + ' ' + k);
  }
  assert.equal(INSP.TX.en['v_plain'], 'Plain: text only');
  assert.equal(INSP.TX.de['v_image-left'], 'Bild links');
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
