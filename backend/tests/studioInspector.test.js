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

test('2A-3A: only the Hero is editable', () => {
  assert.deepEqual(INSP.EDITABLE, ['hero']);
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
});

test('every validation code a Hero edit can produce has a message, in English and German', () => {
  for (const lang of ['en', 'de']) {
    for (const code of ['required', 'too_long', 'invalid_link', 'unknown_internal_target', 'invalid_color', 'out_of_range', 'invalid_anchor', 'reserved', 'duplicate']) {
      const msg = INSP.errorText(lang, { code, max: 120, min: 0 });
      assert.ok(msg && msg !== INSP.TX[lang].e_other, lang + ' ' + code);
      assert.ok(!/\{(max|min)\}/.test(msg), 'placeholders filled: ' + msg);
    }
    assert.equal(INSP.errorText(lang, { code: 'something_new' }), INSP.TX[lang].e_other);
  }
  assert.deepEqual(Object.keys(INSP.TX.de).sort(), Object.keys(INSP.TX.en).sort(), 'German has every English text');
});

test('Change Image stays disabled; the read-only view keeps every control disabled', () => {
  const change = SRC.match(/el\('button', \{[^}]*text: o\.t\('change_image'\)[^}]*\}/g) || [];
  assert.equal(change.length, 2, 'the Hero image control and the read-only view');
  for (const b of change) assert.ok(/disabled: true/.test(b), b);
  const ro = SRC.slice(SRC.indexOf('// ── read-only view'), SRC.indexOf('// ── Hero editor ──'));
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

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
