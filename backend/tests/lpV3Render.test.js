// ============================================================
// lpV3Render.test.js — Landing Page Studio V3 renderer
// (backend/src/lpV3/core.js renderDesign).
//
// - The approved Local Business layout renders: header + nav (mobile menu
//   without script), hero, quick-link cards, opening hours, text, contact,
//   social links, footer; responsive CSS for tablet and desktop.
// - XSS: hostile values are written into EVERY field of EVERY section.
//   Free-text fields must come out escaped; link, image and colour fields
//   must be refused by validation. The output never contains a script, an
//   inline event handler or a javascript:/data: URL.
// - The same file runs in an empty sandbox (no require, module, process,
//   window): the browser preview can use exactly this code.
// Run: node tests/lpV3Render.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const V3 = require('../src/lpV3/core');
const BASE = require('./fixtures/lpV3/localBusiness.json');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const clone = (x) => JSON.parse(JSON.stringify(x));
const CTX = { businessName: 'Musterbäckerei' };
const render = (d, ctx = CTX) => V3.renderDesign(d, ctx);

// Every section type with every field filled, so the XSS sweep reaches all of them.
function fullDesign() {
  const d = clone(BASE);
  const img = 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg';
  d.pages[0].sections.push(
    { id: 's_gal01', type: 'gallery', data: { title: 'Galerie', images: [{ image: img, alt: 'Alt', caption: 'Caption' }] } },
    { id: 's_prod01', type: 'products', data: { title: 'Produkte', items: [{ name: 'Brot', description: 'Desc', price: '3,50 €', image: img, target: '/', buttonText: 'Kaufen' }] } },
    { id: 's_hero02', type: 'hero', variant: 'split', data: { eyebrow: 'E', headline: 'H', subheadline: 'S', backgroundImage: img, imageAlt: 'A', primary: { text: 'P', target: '/', icon: 'star', color: '#123456' }, secondary: { text: 'Q', target: 'https://example.com' } } },
    { id: 's_btn02', type: 'buttons', variant: 'list', data: { title: 'T', subtitle: 'U', items: [{ label: 'L', subtitle: 'M', kind: 'email', target: 'info@example.com' }] } },
    { id: 's_btn03', type: 'buttons', variant: 'buttons', data: { items: [{ label: 'L', kind: 'directions', target: 'https://maps.apple.com/?q=x' }] } },
    { id: 's_text02', type: 'text', variant: 'image-right', data: { heading: 'H', body: 'B', image: img, imageAlt: 'A' } },
    { id: 's_soc02', type: 'socialMedia', variant: 'buttons', data: { title: 'T', links: [{ platform: 'youtube', url: 'https://youtu.be/x' }] } },
  );
  d.header.showBusinessName = true;
  return d;
}

// All string leaves of a design, as paths.
function stringPaths(node, base = [], out = []) {
  if (typeof node === 'string') out.push(base);
  else if (Array.isArray(node)) node.forEach((x, i) => stringPaths(x, base.concat(i), out));
  else if (node && typeof node === 'object') Object.keys(node).forEach((k) => stringPaths(node[k], base.concat(k), out));
  return out;
}
const setPath = (o, p, v) => { let n = o; for (let i = 0; i < p.length - 1; i++) n = n[p[i]]; n[p[p.length - 1]] = v; };
const STRUCTURAL = new Set(['id', 'type', 'variant', 'kind', 'icon', 'platform', 'day', 'background', 'align', 'spacing', 'fontPair', 'radius', 'language', 'anchor']);
const PAYLOADS = ['"><b>', "'><i>", '<svg/onload=1>', '<script>x</script>', '"><img src=x onerror=alert(1)>', '</style><script>alert(1)</script>', 'javascript:alert(1)', '{{7*7}}${7*7}<!--'];

function assertSafe(html, label) {
  assert.ok(!/<script/i.test(html), label + ': no script element');
  // attribute NAMES only: quoted values (always escaped) are blanked first
  const tags = html.match(/<[a-zA-Z][^>]*>/g) || [];
  assert.ok(!tags.some((t) => /\son[a-z]+\s*=/i.test(t.replace(/"[^"]*"/g, '""'))), label + ': no inline event handler attribute');
  assert.ok(!tags.some((t) => /=\s*[^"\s>]/.test(t.replace(/"[^"]*"/g, '""'))), label + ': every attribute value quoted');
  assert.ok(!/(?:href|src)\s*=\s*"\s*(?:javascript|data|vbscript):/i.test(html), label + ': no javascript:/data: URL');
  assert.ok(!/<svg\/onload|<img src=x|<b>|<i>/i.test(html), label + ': no injected markup');
  assert.ok(!/<\/style><script/i.test(html), label + ': stylesheet not broken out of');
}

test('the Local Business layout renders as approved (header, hero, cards, hours, text, contact, social, footer)', () => {
  const r = render(BASE);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const h = r.html;
  assert.ok(h.startsWith('<!DOCTYPE html><html lang="de"><head>'), 'document with <head> (the page wrapper adds its parts there)');
  assert.ok(h.includes('<title>Musterbäckerei – Tradition trifft Genuss</title>'));
  assert.match(h, /<nav class="v3-nav" aria-label="Menü"><a href="#top">Start<\/a><a href="#angebote">Angebote<\/a>/);
  assert.match(h, /<details class="v3-menu"><summary aria-label="Menü">/, 'mobile menu without script');
  assert.match(h, /<p class="v3-eyebrow">Frisch · Regional · Mit Herz<\/p><h1 class="v3-h1">Tradition trifft Genuss<\/h1>/);
  assert.ok(h.includes('Unsere Backwaren – täglich frisch<br>in der Stadt und Umgebung.'), 'line break after escaping');
  assert.match(h, /<a class="v3-btn v3-btn-primary" href="#angebote">/, 'internal button -> anchor, same tab');
  assert.match(h, /<a class="v3-card-link" href="https:\/\/wa\.me\/4973112345678" target="_blank" rel="noopener noreferrer">/);
  assert.match(h, /<a class="v3-card-link" href="tel:\+4973112345678">/);
  assert.match(h, /<th scope="row">Sonntag<\/th><td>Geschlossen<\/td>/);
  assert.match(h, /<section id="zeiten" class="v3-s v3-openingHours v3-v-table v3-bg-alt/);
  assert.match(h, /<section id="kontakt" class="v3-s v3-contact/);
  assert.ok(h.includes('href="mailto:info@example.com"'));
  assert.match(h, /aria-label="Instagram"/);
  assert.ok(h.includes('<footer class="v3-footer">'));
  assert.deepEqual(r.skipped, ['dealsOffers', 'loyalty'], 'rendered in a later phase, reported, not guessed');
  assertSafe(h, 'Local Business');
});

test('responsive: mobile first, tablet and desktop breakpoints, no fixed widths wider than a phone', () => {
  const css = render(BASE).html.match(/<style>([\s\S]*)<\/style>/)[1];
  assert.ok(css.includes('@media (min-width:768px)') && css.includes('@media (min-width:1200px)'));
  assert.ok(css.includes('.v3-items-cards{grid-template-columns:1fr 1fr}') && css.includes('.v3-items-cards{grid-template-columns:repeat(4,1fr)}'));
  assert.ok(css.includes('overflow-x:hidden') && css.includes('max-width:1200px'));
  const widths = (css.match(/(?:^|[;{])width:(\d+)px/g) || []).map((w) => Number(w.replace(/\D/g, '')));
  assert.ok(widths.every((w) => w <= 390), 'no element wider than a phone: ' + widths);
  assert.match(render(BASE).html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});

test('theme: only validated hex colours and fixed font choices reach the stylesheet', () => {
  const d = clone(BASE); d.theme.palette.brand = '#AA0000'; d.theme.fontPair = 'rounded';
  const h = render(d).html;
  assert.ok(h.includes('--v3-brand:#aa0000'));
  assert.ok(h.includes('href="https://fonts.googleapis.com/css2?family=Nunito'));
  const unset = clone(BASE); delete unset.theme;
  assert.ok(render(unset).html.includes('--v3-brand:#ff5a1f'), 'QRAIVY orange by default');
});

test('hidden sections are not rendered; empty sections render nothing', () => {
  const d = clone(BASE);
  d.pages[0].sections.find((s) => s.id === 's_hours01').hidden = true;
  d.pages[0].sections.push({ id: 's_empty1', type: 'text', data: {} });
  const h = render(d).html;
  assert.ok(!h.includes('Öffnungszeiten</h2>') && !h.includes('id="zeiten"'));
  assert.ok(!h.includes('id="s_empty1"'));
});

test('an invalid design is never rendered', () => {
  const d = clone(BASE); d.pages[0].sections[0].data.primary.target = 'javascript:alert(1)';
  const r = render(d);
  assert.equal(r.ok, false); assert.equal(r.html, '');
  assert.ok(r.errors.some((e) => e.code === 'invalid_link'));
});

test('XSS sweep: hostile values in every field of every section', () => {
  const base = fullDesign();
  assert.ok(V3.validateDesign(base).ok, JSON.stringify(V3.validateDesign(base).errors));
  const paths = stringPaths(base).filter((p) => !STRUCTURAL.has(p[p.length - 1]));
  let acceptedAsText = 0, refused = 0;
  const refusedFields = new Set();
  for (const p of paths) {
    for (const payload of PAYLOADS) {
      const d = clone(base); setPath(d, p, payload);
      const v = V3.validateDesign(d);
      const key = p[p.length - 1];
      if (!v.ok) { refused++; refusedFields.add(key); continue; }
      acceptedAsText++;
      const r = render(d);
      assert.ok(r.ok);
      assertSafe(r.html, p.join('.') + ' = ' + payload);
    }
    // hostile business name (server-known, still escaped)
  }
  for (const k of ['target', 'url', 'image', 'backgroundImage', 'logo', 'mapsUrl', 'brand', 'onBrand', 'background', 'surface', 'text', 'muted', 'heroText', 'dark', 'color', 'phone', 'email', 'open', 'close', 'showAllTarget']) {
    if (paths.some((p) => p[p.length - 1] === k)) assert.ok(refusedFields.has(k), 'structured field refuses hostile input: ' + k);
  }
  assert.ok(acceptedAsText > 300 && refused > 100, 'sweep reached the fields (' + acceptedAsText + ' text, ' + refused + ' refused)');
  for (const payload of PAYLOADS) assertSafe(render(base, { businessName: payload }).html, 'businessName ' + payload);
});

test('owner text is shown, escaped, not interpreted', () => {
  const d = clone(BASE); d.pages[0].sections[0].data.headline = '<b>Brot & "Brötchen"</b>';
  assert.ok(render(d).html.includes('<h1 class="v3-h1">&lt;b&gt;Brot &amp; &quot;Brötchen&quot;&lt;/b&gt;</h1>'));
});

test('same code in an empty sandbox (browser preview) gives the same page', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lpV3', 'core.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'])\/\/[^\n]*/g, '$1');
  assert.ok(!/\brequire\s*\(|\bprocess\.|\bdocument\.|\bwindow\.|\bnew URL\b|\bBuffer\b/.test(code), 'no Node or DOM APIs used');
  const sandbox = vm.createContext({});
  vm.runInContext(src, sandbox);
  const Browser = vm.runInContext('QraivyV3', sandbox);
  assert.equal(typeof Browser.renderDesign, 'function');
  const a = Browser.renderDesign(JSON.parse(JSON.stringify(fullDesign())), CTX);
  const b = V3.renderDesign(fullDesign(), CTX);
  assert.equal(a.html, b.html);
  assert.deepEqual(JSON.parse(JSON.stringify(a.skipped)), b.skipped);
});

test('rendering is deterministic (no time, randomness or input mutation)', () => {
  const d = fullDesign(); const before = JSON.stringify(d);
  assert.equal(render(d).html, render(d).html);
  assert.equal(JSON.stringify(d), before);
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
