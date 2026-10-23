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
// settings (Buttons texts exactly as at d70d883) and the eight platforms.
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

test('2A-3C: only the Hero, the Buttons and Social Media are editable (Gallery stays read-only)', () => {
  assert.deepEqual(INSP.EDITABLE, ['hero', 'buttons', 'socialMedia']);
  assert.deepEqual(Object.keys(INSP.PLANS), ['hero', 'buttons', 'socialMedia']);
  assert.deepEqual(Object.keys(INSP.LISTS), ['buttons', 'socialMedia']);
  for (const t of ['gallery', 'dealsOffers', 'loyalty', 'products', 'openingHours', 'contact', 'text']) {
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

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
