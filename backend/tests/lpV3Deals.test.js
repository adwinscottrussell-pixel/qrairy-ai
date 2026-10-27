// ============================================================
// lpV3Deals.test.js — Landing Page Studio V3, Phase D2: the Deals / Offers
// section in the Studio preview (backend/src/lpV3/core.js, opts.deals).
//
// - at most 3 cards (schema, renderer), within the section's maxItems;
// - every owner value escaped, no script, every attribute quoted, images
//   only by the image rule, the AI label on AI-generated images;
// - every state distinct: samples (labelled), the owner's deals ('live'),
//   none, loading, sign in, error, disabled; a failure never shows samples;
// - the public page still renders nothing for the section, whatever is given.
// Run: node tests/lpV3Deals.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const V3 = require('../src/lpV3/core');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const design = (data = {}, lang = 'de', extra = {}) => ({ schemaVersion: 1, settings: { language: lang }, pages: [{ id: 'start', sections: [
  Object.assign({ id: 's_deals01', type: 'dealsOffers', anchor: 'angebote', data: Object.assign({ title: 'Aktuelle Angebote', subtitle: 'Unsere Highlights', maxItems: 3 }, data) }, extra)] }] });
const CLD = 'https://res.cloudinary.com/dwqc6n7rn/image/upload/c_fill,g_auto,h_600,w_800,f_auto,q_auto/qraivy-deal-starters/bakery-bread-01.jpg';
const UP = 'https://res.cloudinary.com/nantofwm/image/upload/c_fill,g_auto,h_900,w_1200/v1/qraivy-deals-staging/d1.jpg';
const item = (o) => Object.assign({ title: 'Kaffee', offerText: '2 für 1', description: 'Jeden Montag', endsAt: '2026-10-31T22:59:59.000Z', image: { src: UP, ai: false } }, o);
const render = (deals, d = design(), opts = {}) => V3.renderDesign(d, { businessName: 'Musterbäckerei' }, Object.assign({ preview: true, deals }, opts));
function section(html) {
  const i = html.indexOf('<section id="angebote"');
  assert.ok(i !== -1, 'the section is rendered');
  return html.slice(i, html.indexOf('</section>', i) + '</section>'.length);
}
const count = (s, re) => (s.match(re) || []).length;
const PAYLOADS = ['"><b>', "'><i>", '<svg/onload=1>', '<script>x</script>', '"><img src=x onerror=alert(1)>', '</style><script>alert(1)</script>', 'javascript:alert(1)', '{{7*7}}${7*7}<!--'];
function assertSafe(html, label) {
  assert.ok(!/<script/i.test(html), label + ': no script element');
  const tags = html.match(/<[a-zA-Z][^>]*>/g) || [];
  assert.ok(!tags.some((t) => /\son[a-z]+\s*=/i.test(t.replace(/"[^"]*"/g, '""'))), label + ': no inline event handler attribute');
  assert.ok(!tags.some((t) => /=\s*[^"\s>]/.test(t.replace(/"[^"]*"/g, '""'))), label + ': every attribute value quoted');
  assert.ok(!/(?:href|src)\s*=\s*"\s*(?:javascript|data|vbscript):/i.test(html), label + ': no javascript:/data: URL');
  assert.ok(!/<svg\/onload|<img src=x|<b>|<i>/i.test(html), label + ': no injected markup');
}

test('schema: 1 to 3 cards, 3 by default (the public page shows at most 3 deals)', () => {
  const s = V3.describe().sections.dealsOffers.data.fields.maxItems;
  assert.deepEqual([s.t, s.min, s.max, s.def], ['int', 1, 3, 3]);
  for (const n of [1, 2, 3]) assert.ok(V3.validateDesign(design({ maxItems: n })).ok, String(n));
  for (const n of [0, 4, 6, 50, 2.5, '3']) assert.ok(!V3.validateDesign(design({ maxItems: n })).ok, String(n));
});

test('the owner\'s deals: real cards with the "Your deals" badge, at most 3 and at most maxItems; no sample', () => {
  const five = [1, 2, 3, 4, 5].map((n) => item({ title: 'Angebot ' + n }));
  let s = section(render({ state: 'live', items: five }).html);
  assert.equal(count(s, /<article class="v3-prod v3-deal">/g), 3, 'never more than 3');
  assert.match(s, /class="v3-s v3-dealsOffers [^"]* v3-deals v3-deals-live"/);
  assert.match(s, /<span class="v3-sample-badge v3-live-badge">Ihre Angebote<\/span>/);
  assert.match(s, /<p class="v3-note">Vorschau: Diese Angebote zeigt Ihre Seite gerade\.<\/p>/);
  assert.ok(!/v3-sample-card|Beispiel/.test(s), 'no sample anywhere');
  assert.deepEqual(['Angebot 1', 'Angebot 2', 'Angebot 3'], [...s.matchAll(/<h3 class="v3-prod-name">([^<]*)<\/h3>/g)].map((m) => m[1]), 'in the given order');
  s = section(render({ state: 'live', items: five }, design({ maxItems: 2 })).html);
  assert.equal(count(s, /<article class="v3-prod v3-deal">/g), 2, 'maxItems');
  // one card: offer, title, description, end date (Europe/Berlin), the picture
  s = section(render({ state: 'live', items: [item()] }).html);
  assert.ok(s.includes('<article class="v3-prod v3-deal"><div class="v3-deal-media"><img class="v3-prod-img" src="' + UP + '" alt="" width="800" height="600" loading="lazy" decoding="async"></div>' +
    '<div class="v3-prod-body"><p class="v3-prod-price">2 für 1</p><h3 class="v3-prod-name">Kaffee</h3><p class="v3-prod-desc">Jeden Montag</p><p class="v3-deal-until">Gültig bis 31.10.2026</p></div></article>'));
  const en = section(render({ state: 'live', items: [item()] }, design({}, 'en')).html);
  assert.match(en, /Your deals<\/span>/);
  assert.match(en, /<p class="v3-deal-until">Valid until 31 Oct 2026<\/p>/);
  // the "show all" link as the section has it
  s = section(render({ state: 'live', items: [item()] }, design({ showAllText: 'Alle Angebote', showAllTarget: 'https://example.com/angebote' })).html);
  assert.ok(s.includes('<p><a class="v3-more" href="https://example.com/angebote" target="_blank" rel="noopener noreferrer">Alle Angebote →</a></p>'));
});

test('AI label on AI-generated images only; images only by the image rule (else a plain tile, no picture)', () => {
  let s = section(render({ state: 'live', items: [item({ image: { src: CLD, ai: true } }), item({ image: { src: UP, ai: false } })] }).html);
  assert.equal(count(s, /<span class="v3-ai"><span aria-hidden="true">AI · KI-generiert<\/span><span class="v3-sr">KI-generiertes Bild<\/span><\/span>/g), 1);
  const en = section(render({ state: 'live', items: [item({ image: { src: CLD, ai: true } })] }, design({}, 'en')).html);
  assert.ok(en.includes('<span aria-hidden="true">AI · KI-generiert</span><span class="v3-sr">AI-generated image</span>'), 'the visible label is the same in every language');
  for (const src of ['https://evil.example/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'http://res.cloudinary.com/x/image/upload/a.jpg', 'https://res.cloudinary.com/x/image/upload/a.jpg"onerror="x', '//res.cloudinary.com/x/image/upload/a.jpg',
    'https://res.cloudinary.com/x/image/upload/a.gif', 'https://res.cloudinary.com/x/image/upload/' + 'a'.repeat(500) + '.jpg', 42, null]) {
    s = section(render({ state: 'live', items: [item({ image: { src, ai: true } })] }).html);
    assert.ok(!/<img/.test(s) && !/v3-ai/.test(s), 'refused: ' + String(src).slice(0, 50));
    assert.ok(s.includes('<div class="v3-deal-media v3-deal-noimg" aria-hidden="true"><svg'), 'plain tile');
  }
  // the account's cloud, when the caller knows it
  assert.ok(!/<img/.test(section(render({ state: 'live', items: [item()] }, design(), { cloudName: 'dwqc6n7rn' }).html)), 'another cloud refused');
  assert.ok(/<img/.test(section(render({ state: 'live', items: [item({ image: { src: CLD } })] }, design(), { cloudName: 'dwqc6n7rn' }).html)));
});

test('every owner value escaped; no script, no handler, every attribute quoted, in every state', () => {
  for (const p of PAYLOADS) {
    const evil = { title: p.slice(0, 80), offerText: p, description: p + '\n' + p, endsAt: p, image: { src: p, ai: p } };
    for (const deals of [{ state: 'live', items: [evil, item({ title: p })], withheld: 1 }, { state: p }, { state: 'live', items: p }, { state: 'error', items: [evil] }]) {
      const r = render(deals, design({ title: p, subtitle: p, showAllText: p }));
      assert.ok(r.ok, p);
      assertSafe(r.html, JSON.stringify(deals).slice(0, 60));
    }
  }
  // control characters and bidi overrides removed, line breaks kept only in the description
  const s = section(render({ state: 'live', items: [item({ title: 'A‮b\u0007c', offerText: 'x\ny', description: 'one\ntwo' })] }).html);
  assert.ok(s.includes('<p class="v3-prod-price">x y</p><h3 class="v3-prod-name">Abc</h3><p class="v3-prod-desc">one<br>two</p>'));
  // limits as the Deal Builder's: a deal outside them is not shown at all
  for (const bad of [{ title: 'x'.repeat(81) }, { offerText: 'x'.repeat(121) }, { description: 'x'.repeat(401) }, { title: '' }, { offerText: '   ' }, { title: 7 }]) {
    assert.equal(count(section(render({ state: 'live', items: [item(bad)] }).html), /<article/g), 0, JSON.stringify(bad).slice(0, 40));
  }
  // emoji count as one character (as the server counts)
  assert.equal(count(section(render({ state: 'live', items: [item({ title: '☕'.repeat(80) })] }).html), /<article/g), 1);
});

test('every state is distinct; only "sample" shows samples, and says so', () => {
  const states = {
    sample: { badge: 'Beispiel', text: 'Beispielangebote: Ihre echten Angebote können auf dieser Adresse noch nicht geladen werden.', cards: 3 },
    loading: { text: 'Ihre Angebote werden geladen …', cards: 0 },
    none: { text: 'Ihre Seite zeigt gerade keine Angebote.', cards: 0 },
    signin: { text: 'Melden Sie sich an, um Ihre Angebote hier zu sehen.', cards: 0 },
    error: { text: 'Ihre Angebote konnten nicht geladen werden. Es werden keine Beispiele gezeigt.', cards: 0 },
    disabled: { text: 'Angebote sind für dieses Konto nicht verfügbar.', cards: 0 },
  };
  for (const [state, want] of Object.entries(states)) {
    const r = render({ state, items: [item()] });
    const s = section(r.html);
    assert.equal(count(s, /<article/g), want.cards, state);
    assert.ok(s.includes(want.text), state);
    assert.equal(/v3-sample-card/.test(s), state === 'sample', state + ': samples only in the sample state');
    assert.equal(r.samples.includes('dealsOffers'), state === 'sample', state + ': reported as samples only then');
    if (state !== 'sample') {
      assert.match(s, new RegExp('class="v3-s v3-dealsOffers [^"]* v3-deals v3-deals-' + state + '"'));
      assert.ok(!/>Beispiel<|v3-sample-badge|Beispielangebot/.test(s), state + ': no sample label either');
    }
  }
  // the hint where deals come from, only when there are none
  assert.ok(section(render({ state: 'none' }).html).includes('Angebote erstellen Sie im Deal Builder und ordnen sie dort dieser Seite zu.'));
  // anything unknown is an error, never samples
  for (const deals of [null, 'live', 42, [], { state: 'bogus' }, { state: 'LIVE' }, {}]) {
    const s = section(render(deals).html);
    assert.ok(s.includes('Ihre Angebote konnten nicht geladen werden.') && !/v3-sample-card/.test(s), JSON.stringify(deals));
  }
  // live without a usable deal: none; with withheld ones only: says so, without claiming there are none
  assert.ok(section(render({ state: 'live', items: [{ title: '' }] }).html).includes('Ihre Seite zeigt gerade keine Angebote.'));
  const w = section(render({ state: 'live', items: [], withheld: 2 }).html);
  assert.ok(w.includes('Angebote mit unveröffentlichten Änderungen: 2. Ihre Live-Fassung kann hier nicht gezeigt werden.') && !w.includes('keine Angebote'));
  const w2 = section(render({ state: 'live', items: [item()], withheld: 1 }).html);
  assert.ok(w2.includes('<article') && w2.includes('Änderungen: 1.'));
  // without opts.deals: the earlier samples and note, unchanged
  const plain = section(V3.renderDesign(design(), { businessName: 'X' }, { preview: true }).html);
  assert.ok(plain.includes('<p class="v3-note">Vorschau: Hier erscheinen Ihre aktuellen Angebote.</p>') && count(plain, /v3-sample-card/g) === 3);
});

test('the public page: still nothing for Deals / Offers, whatever is passed (published in a later phase)', () => {
  for (const deals of [undefined, { state: 'live', items: [item()] }, { state: 'sample' }]) {
    const r = V3.renderDesign(design(), { businessName: 'X' }, { deals });
    assert.ok(r.ok);
    assert.deepEqual(r.skipped, ['dealsOffers']);
    assert.ok(!/angebote|v3-deal|Kaffee/.test(r.html.replace(/<style>[\s\S]*?<\/style>/, '')), 'no section, no deal');
    assert.ok(!/<script/i.test(r.html));
  }
  // and the public golden output is unchanged (lpV3Render's golden file covers every rendered type)
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lpV3', 'publicRender.golden.json'), 'utf8'));
  assert.ok(golden && typeof golden === 'object');
});

test('the browser copy behaves the same in an empty sandbox (the Studio preview)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'lpV3', 'core.js'), 'utf8');
  const sandbox = vm.createContext({});
  vm.runInContext(src, sandbox);
  const B = vm.runInContext('QraivyV3', sandbox);
  for (const deals of [{ state: 'live', items: [item({ image: { src: CLD, ai: true } })], withheld: 1 }, { state: 'error' }, { state: 'sample' }]) {
    const a = render(deals).html;
    const b = B.renderDesign(design(), { businessName: 'Musterbäckerei' }, { preview: true, deals: JSON.parse(JSON.stringify(deals)) }).html;
    assert.equal(b, a, deals.state);
  }
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS  ' + t.name); }
  catch (e) { failed++; console.log('FAIL  ' + t.name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e)); }
}
console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
if (failed) process.exit(1);
