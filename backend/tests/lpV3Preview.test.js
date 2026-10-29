// ============================================================
// lpV3Preview.test.js — Studio V3 Phase 2A-1 core additions
// (backend/src/lpV3/core.js):
// - the PUBLIC output of the designs supported before (Hero, Buttons, Text,
//   Opening Hours, Contact, Social Media) is byte for byte what b04f15e
//   produced (fixtures/lpV3/publicRender.golden.json);
// - preview mode (Studio only): data-v3-id for selection, visible empty
//   sections, image placeholders, labelled samples for Deals / Offers and
//   Loyalty; none of it ever appears in public output;
// - Gallery and Products render publicly (escaped, lazy images, CSS only
//   when present);
// - describe() matches what validateDesign enforces.
// - Contact icons on Brand sections use the on-brand colour (2A-3D).
// - Social Media pills pair their text colour with their background (2A-3C
//   contrast fix; golden revision 2026-10-23).
// Run: node tests/lpV3Preview.test.js
// ============================================================
const assert = require('assert/strict');
const crypto = require('crypto');
const V3 = require('../src/lpV3/core');
const BASE = require('./fixtures/lpV3/localBusiness.json');
const GOLDEN = require('./fixtures/lpV3/publicRender.golden.json');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const clone = (x) => JSON.parse(JSON.stringify(x));
const CTX = { businessName: 'Musterbäckerei' };
const IMG = (n) => 'https://res.cloudinary.com/demo/image/upload/v1/' + n + '.jpg';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// a section of a one-per-page type (Hero, Deals, Loyalty) replaces the base's own (Phase C limits)
// (keeping the replaced section's link name, which other links point to)
const withSections = (...sections) => {
  const d = clone(BASE);
  const added = sections.map((s) => { const old = V3.MAX_PER_PAGE[s.type] && d.pages[0].sections.find((x) => x.type === s.type); if (!old) return s; d.pages[0].sections = d.pages[0].sections.filter((x) => x !== old); return old.anchor && !s.anchor ? Object.assign({}, s, { anchor: old.anchor }) : s; });
  d.pages[0].sections.push(...added);
  return d;
};
const PREVIEW_MARKERS = /data-v3-id|data-v3-part|v3-ph-section|v3-img-ph|v3-sample|v3-stamp|Beispiel|Sample offer|\.v3-ph-note/;

test('public output of the earlier section types is unchanged (b04f15e reference)', () => {
  const ctxs = [CTX, { businessName: '"><script>x</script>' }];
  assert.equal(GOLDEN.generatedFrom, 'b04f15e90c2ebeae1d2079991ccfa3c10821505a');
  for (const g of GOLDEN.results) {
    const r = V3.renderDesign(require('./fixtures/lpV3/' + g.design + '.json'), ctxs[g.ctx]);
    assert.ok(r.ok);
    assert.equal(Buffer.byteLength(r.html), g.bytes, g.design + ' length');
    assert.equal(sha(r.html), g.sha256, g.design + ' content');
    assert.deepEqual(r.skipped, g.skipped);
  }
});

// Default landing-page colours: QRAIVY neutral near-black navy / white with
// orange as the accent; no brown, chocolate or sepia; readable contrast.
const lum = (hex) => { const h = hex.replace('#', ''); const c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function hueSat(hex) {
  const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0; if (d) hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { hue: (hue + 360) % 360, s };
}
// Social Media contrast (2A-3C visual review): the pill sets its own text
// colour, paired with its own background, so Dark / Brand sections (white
// text) cannot leave white text on the light pill. The computed colours for
// every background and layout are checked in a real browser in
// studioSocialEditor.browser.test.js.
test('Social Media links: the pill pairs its text colour with its background (readable on every section background)', () => {
  const d = withSections({ id: 's_soc01', type: 'socialMedia', variant: 'buttons', style: { background: 'dark' }, data: { title: 'T', links: [{ platform: 'instagram', url: 'https://instagram.com/a' }] } });
  const html = V3.renderDesign(d, CTX).html;
  const rule = (html.match(/\.v3-social\{[^}]*\}/) || [''])[0];
  assert.match(rule, /background:var\(--v3-surface\)/);
  assert.match(rule, /color:var\(--v3-text\)/, 'the pill text does not inherit the section colour');
  // nothing more specific overrides the pill colour for a section background
  assert.ok(!/\.v3-bg-(dark|brand|alt)[^{]*\.v3-social[^{]*\{/.test(html));
  const p = V3.DEFAULT_PALETTE;
  assert.ok(contrast(p.text, p.surface) >= 4.5, 'text on the pill: ' + contrast(p.text, p.surface).toFixed(1));
});

// Contact icons on Brand sections (2A-3D visual review): the icons are the
// brand colour, so on a Brand section they take the on-brand colour instead.
// Computed colours for all four backgrounds: studioContactEditor.browser.test.js.
test('Contact icons: brand-coloured, except on Brand sections where they use the on-brand colour', () => {
  const d = withSections({ id: 's_con77', type: 'contact', style: { background: 'brand' }, data: { phone: '+49 731 1' } });
  const html = V3.renderDesign(d, CTX).html;
  assert.ok(html.includes('.v3-ct-row .v3-ic{color:var(--v3-brand);margin-top:2px}'), 'the usual icon colour is unchanged');
  assert.ok(html.includes('.v3-bg-brand .v3-ct-row .v3-ic{color:var(--v3-on-brand)}'), 'on Brand: the on-brand colour');
  assert.equal((html.match(/\.v3-ct-row \.v3-ic\{/g) || []).length, 2, 'the usual rule and the Brand rule, no other override');
  assert.ok(contrast(V3.DEFAULT_PALETTE.onBrand, V3.DEFAULT_PALETTE.brand) >= 3, 'on-brand icons are visible on the brand colour');
});

// Opening Hours on Dark / Brand (2A-3E): Closed rows and the note used the
// muted grey (2.4–2.6:1 there). They now take the section colour; the
// divider lines are light on Dark. Default / Alternate keep the grey; the
// Deals / Loyalty sample notes are not affected. Computed colours:
// studioHoursEditor.browser.test.js.
test('Opening Hours on Dark / Brand: Closed rows and the note follow the section colour; nothing else changes', () => {
  const html = V3.renderDesign(withSections({ id: 's_hrs77', type: 'openingHours', style: { background: 'dark' }, data: { days: [{ day: 'sun', closed: true }], note: 'N' } }), CTX).html;
  assert.ok(html.includes('.v3-closed td{color:var(--v3-muted)}') && html.includes('.v3-note{color:var(--v3-muted);margin-top:12px}'), 'the usual muted grey stays for Default / Alternate');
  assert.ok(html.includes('.v3-bg-dark .v3-closed td,.v3-openingHours.v3-bg-dark .v3-note{color:inherit;opacity:.85}'));
  assert.ok(html.includes('.v3-bg-brand .v3-closed td,.v3-openingHours.v3-bg-brand .v3-note{color:inherit}'));
  assert.ok(html.includes('.v3-bg-dark .v3-hours th,.v3-bg-dark .v3-hours td{border-bottom-color:rgba(255,255,255,.14)}'));
  assert.ok(!/(^|[,}])\.v3-bg-(dark|brand) \.v3-note/.test(html), 'the note rule is scoped to Opening Hours (Deals / Loyalty sample notes unchanged)');
  const p = V3.DEFAULT_PALETTE;
  assert.ok(contrast(p.heroText, p.dark) >= 4.5 && contrast(p.onBrand, p.brand) >= 3, 'the section colours are readable on their backgrounds');
});

test('default palette: QRAIVY neutral black / gray / white, orange accent, no navy, brown or sepia, readable contrast', () => {
  const p = V3.DEFAULT_PALETTE;
  assert.equal(p.brand, '#ff5a1f', 'QRAIVY orange stays the accent');
  for (const k of ['background', 'surface', 'text', 'muted', 'dark']) {
    const { hue, s } = hueSat(p[k]);
    assert.ok(s < 0.1, k + ' ' + p[k] + ' is a neutral gray (hue ' + Math.round(hue) + ', saturation ' + s.toFixed(2) + ')');
  }
  assert.equal(p.dark, '#101012', 'the Admin black (--sbx-bg)');
  assert.ok(contrast(p.text, p.background) >= 7, 'text on background');
  assert.ok(contrast(p.text, p.surface) >= 7, 'text on surface');
  assert.ok(contrast(p.muted, p.background) >= 4.5 && contrast(p.muted, p.surface) >= 4.5, 'muted text');
  assert.ok(contrast(p.heroText, p.dark) >= 7, 'white on the dark hero, header and footer');
  assert.ok(contrast(p.onBrand, p.brand) >= 3, 'button text on orange (large bold text)');
  const css = V3.renderDesign({ schemaVersion: 1, pages: [{ id: 'start', sections: [] }] }, CTX).html;
  assert.ok(css.includes('--v3-dark:#101012') && css.includes('--v3-surface:#f8f8f8'), 'used when a design sets no colours');
  const own = V3.renderDesign({ schemaVersion: 1, theme: { palette: { dark: '#3b2a1e', surface: '#fdf6ec' } }, pages: [{ id: 'start', sections: [] }] }, CTX).html;
  assert.ok(own.includes('--v3-dark:#3b2a1e') && own.includes('--v3-surface:#fdf6ec'), 'owners can still choose their own colours');
});

test('public output never contains preview markup', () => {
  const d = withSections({ id: 's_empty1', type: 'text', variant: 'image-left', data: {} }, { id: 's_prod01', type: 'products', data: { items: [{ name: 'x' }] } });
  const r = V3.renderDesign(d, CTX);
  assert.ok(!PREVIEW_MARKERS.test(r.html), r.html.match(PREVIEW_MARKERS));
  assert.deepEqual(r.samples, []);
  assert.deepEqual(r.skipped, ['dealsOffers', 'loyalty']);
});

test('preview: every visible section is selectable by its id; header and footer too', () => {
  const r = V3.renderDesign(BASE, CTX, { preview: true });
  const ids = [...r.html.matchAll(/data-v3-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, BASE.pages[0].sections.map((s) => s.id));
  assert.match(r.html, /<header class="v3-header" data-v3-part="header">/);
  assert.match(r.html, /<footer class="v3-footer" data-v3-part="footer">/);
  assert.deepEqual(r.samples, ['dealsOffers', 'loyalty']);
  assert.deepEqual(r.skipped, []);
  assert.ok(!/<script/i.test(r.html), 'the preview has no script either (the Studio adds its own)');
});

test('preview: hidden sections stay out; empty sections become a selectable note', () => {
  const d = withSections({ id: 's_empty1', type: 'contact', data: {} }, { id: 's_hide01', type: 'text', hidden: true, data: { heading: 'Hidden' } });
  const r = V3.renderDesign(d, CTX, { preview: true });
  assert.match(r.html, /<section id="s_empty1" data-v3-id="s_empty1" class="[^"]*v3-ph-section[^"]*"><div class="v3-wrap"><div class="v3-ph-note">/);
  assert.ok(r.html.includes('Leerer Abschnitt – Inhalte im Editor ergänzen'));
  assert.ok(!r.html.includes('s_hide01') && !r.html.includes('Hidden'));
});

test('preview: image placeholders where an image is missing (split hero, text, products)', () => {
  const d = withSections(
    { id: 's_hero09', type: 'hero', variant: 'split', data: { headline: 'H' } },
    { id: 's_text09', type: 'text', variant: 'image-right', data: { heading: 'T' } },
    { id: 's_prod09', type: 'products', data: { items: [{ name: 'Ohne Bild' }] } });
  const r = V3.renderDesign(d, CTX, { preview: true });
  assert.equal((r.html.match(/class="v3-img-ph[^"]*" role="img" aria-label="Bildplatzhalter"/g) || []).length, 3 + 3, 'split hero, text, product + the 3 deal sample cards (the base text section has an image)');
  const pub = V3.renderDesign(d, CTX);
  assert.ok(!pub.html.includes('v3-img-ph'));
});

test('preview samples: Deals / Offers and Loyalty, labelled, owner text escaped, fixed sample content', () => {
  const d = clone(BASE);
  d.pages[0].sections.find((s) => s.type === 'dealsOffers').data.title = '<b>Deals</b>';
  d.pages[0].sections.find((s) => s.type === 'dealsOffers').data.maxItems = 2;
  const r = V3.renderDesign(d, CTX, { preview: true });
  assert.ok(r.html.includes('<h2 class="v3-h2">&lt;b&gt;Deals&lt;/b&gt;</h2>'));
  assert.equal((r.html.match(/v3-sample-card/g) || []).length, 2, 'maxItems respected');
  assert.equal((r.html.match(/<span class="v3-sample-badge">Beispiel<\/span>/g) || []).length, 2);
  assert.ok(r.html.includes('Vorschau: Hier erscheinen Ihre aktuellen Angebote.') && r.html.includes('Vorschau: Hier erscheint Ihre Stempelkarte.'));
  assert.equal((r.html.match(/class="v3-stamp v3-stamp-on"/g) || []).length, 3);
  assert.equal((r.html.match(/class="v3-stamp"/g) || []).length, 7);
  assert.ok(r.html.includes('<a class="v3-more" href="#angebote">Alle Angebote anzeigen →</a>'));
  assert.ok(!/<a[^>]*>Zu (Apple|Google) Wallet/.test(r.html), 'sample Wallet buttons are not links');
});

test('Gallery: grid and carousel, lazy images with alt text and captions, escaped', () => {
  const d = withSections({ id: 's_gal01', type: 'gallery', variant: 'carousel', data: { title: 'Fotos & "mehr"', images: [{ image: IMG('a'), alt: 'Brot <frisch>', caption: 'Unsere <Backstube>' }, { image: IMG('b') }] } });
  const h = V3.renderDesign(d, CTX).html;
  assert.match(h, /<section id="s_gal01" class="v3-s v3-gallery v3-v-carousel [^"]*"><div class="v3-wrap"><h2 class="v3-h2">Fotos &amp; &quot;mehr&quot;<\/h2><div class="v3-gal-wrap"><div class="v3-gal v3-gal-carousel" id="s_gal01-photos" tabindex="0" role="region" aria-label="Fotos &amp; &quot;mehr&quot;">/);
  assert.ok(/<\/figure><\/div><button type="button" class="v3-gal-btn v3-gal-prev"[^>]*>[\s\S]*?<\/button><button type="button" class="v3-gal-btn v3-gal-next"[^>]*>[\s\S]*?<\/button><\/div><p class="v3-gal-hint" aria-hidden="true"><span class="v3-gal-hint-l">← Weitere Bilder: wischen oder scrollen →<\/span><span class="v3-gal-hint-s">Weitere Bilder · Wischen<\/span><\/p><\/div><\/section>/.test(h), 'the two buttons after the strip, then the swipe hint (long and short text)');
  assert.ok(h.includes('<figure class="v3-gal-item"><img src="https://res.cloudinary.com/demo/image/upload/v1/a.jpg" alt="Brot &lt;frisch&gt;" loading="lazy" width="800" height="600"><figcaption>Unsere &lt;Backstube&gt;</figcaption></figure>'));
  assert.ok(h.includes('<img src="https://res.cloudinary.com/demo/image/upload/v1/b.jpg" alt="" loading="lazy"'), 'decorative image: empty alt');
  assert.ok(h.includes('.v3-gal-carousel{display:flex;overflow-x:auto'), 'carousel scrolls inside its box, not the page');
  const grid = withSections({ id: 's_gal02', type: 'gallery', data: { images: [{ image: IMG('c') }] } });
  assert.match(V3.renderDesign(grid, CTX).html, /class="v3-gal v3-gal-grid"/);
  assert.equal(V3.renderDesign(withSections({ id: 's_gal03', type: 'gallery', data: {} }), CTX).html.includes('s_gal03'), false, 'empty gallery: nothing public');
});

// Carousel navigation (2A-3H): previous / next buttons rendered as plain,
// hidden markup (no script, no handler); the trusted controller
// js/lpV3/gallery-nav.js (added by the application) shows and runs them.
// Without it: the edge fade and the swipe hint. No ::scroll-button() any more.
test('Carousel navigation: hidden, named previous / next buttons (no script, no handler), one design for every browser; the hint; Grid untouched', () => {
  const imgs = [{ image: IMG('a'), alt: 'A' }, { image: IMG('b'), alt: 'B' }, { image: IMG('c'), alt: 'C' }];
  const de = V3.renderDesign(withSections({ id: 's_gal05', type: 'gallery', variant: 'carousel', data: { images: imgs } }), CTX).html;
  const enDesign = withSections({ id: 's_gal05', type: 'gallery', variant: 'carousel', data: { title: '"></style><b>', images: imgs } });
  enDesign.settings.language = 'en';
  const en = V3.renderDesign(enDesign, CTX).html;
  // the strip: focusable, a region, named by the title or "Galerie" / "Gallery"; its id from the (validated) section id
  assert.ok(de.includes('<div class="v3-gal-wrap"><div class="v3-gal v3-gal-carousel" id="s_gal05-photos" tabindex="0" role="region" aria-label="Galerie">'));
  assert.ok(en.includes('<div class="v3-gal v3-gal-carousel" id="s_gal05-photos" tabindex="0" role="region" aria-label="&quot;&gt;&lt;/style&gt;&lt;b&gt;">'), 'the title, escaped');
  // the buttons: real <button>s, hidden until the controller shows them, named in the page language, pointing at the strip
  const svg = (d) => '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  const btn = (dir, label, d) => '<button type="button" class="v3-gal-btn v3-gal-' + dir + '" aria-controls="s_gal05-photos" aria-label="' + label + '" hidden>' + svg(d) + '</button>';
  assert.ok(de.includes('</figure></div>' + btn('prev', 'Vorheriges Bild', 'M15 6l-6 6 6 6') + btn('next', 'Nächstes Bild', 'M9 6l6 6-6 6') + '</div>'));
  assert.ok(en.includes(btn('prev', 'Previous image', 'M15 6l-6 6 6 6') + btn('next', 'Next image', 'M9 6l6 6-6 6')));
  assert.ok(!/\son[a-z]+=|javascript:/i.test(de.slice(de.indexOf('<main'))), 'no handler, no script URL');
  // one design for every browser: 56 px QRAIVY orange, white chevron, darker hover, dimmed when disabled, two-tone focus ring
  assert.ok(de.includes('.v3-gal-btn{position:absolute;z-index:3;top:calc(100% + 8px);display:flex;align-items:center;justify-content:center;width:56px;height:56px;'));
  assert.ok(de.includes('border-radius:50%;background:#ff5a1f;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer}.v3-gal-btn[hidden]{display:none}'), 'hidden stays hidden');
  assert.ok(de.includes('.v3-gal-btn:hover:not(:disabled){background-color:#d9480f}.v3-gal-btn:disabled{opacity:.3;cursor:default}'));
  assert.ok(de.includes('.v3-gal-btn:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 7px rgba(0,0,0,.6)}'));
  // on the brand colour: white buttons with QRAIVY orange chevrons
  assert.ok(de.includes('.v3-gallery.v3-bg-brand .v3-gal-btn{background-color:#fff;color:#ff5a1f}.v3-gallery.v3-bg-brand .v3-gal-btn:hover:not(:disabled){background-color:#ffe4d6}'));
  // phones: a row under the photos (the hint between them, once the controller runs); tablet / desktop: over the photo edges
  assert.ok(de.includes('.v3-gal-prev{left:0}.v3-gal-next{right:0}') && de.includes('@media (min-width:768px){.v3-gal-btn{top:calc(15cqw - 28px)}.v3-gal-prev{left:10px}.v3-gal-next{right:10px}}'));
  assert.ok(de.includes('@media (max-width:767px){.v3-gal-wrap[data-nav=on] + .v3-gal-hint{display:flex;align-items:center;justify-content:center;min-height:56px;margin-top:8px;padding:0 64px;text-align:center}}'));
  assert.ok(de.includes('.v3-gal-wrap{position:relative;container-type:inline-size;margin-top:16px}.v3-gal-wrap > .v3-gal-carousel{margin-top:0}'), 'the strip at the top of its wrap: the buttons line up with the photos');
  // without the controller: the edge fade
  assert.ok(de.includes('.v3-gal-wrap:not([data-nav=on])::after{content:"";position:absolute;top:0;right:0;bottom:8px;width:48px;pointer-events:none;background:linear-gradient(to left,var(--v3-gal-fade),transparent)}'));
  assert.ok(!/scroll-button|anchor-name|anchor\(/.test(de), 'no Chromium-only arrows any more');
  // no visible scrollbar on the strip, which still scrolls (Grid untouched)
  assert.ok(de.includes('.v3-gal-carousel{scrollbar-width:none}.v3-gal-carousel::-webkit-scrollbar{display:none}') && de.includes('.v3-gal-carousel{display:flex;overflow-x:auto'));
  // whole-pixel photo widths, so snapping reaches the very end (next disabled there)
  assert.ok(de.includes('.v3-gal-carousel .v3-gal-item{flex-basis:round(down,80%,1px)}@media (min-width:768px){.v3-gal-carousel .v3-gal-item{flex-basis:round(down,40%,1px)}}'));
  assert.ok(de.includes('@media (prefers-reduced-motion:no-preference){.v3-gal-carousel{scroll-behavior:smooth}}'), 'smooth only without a reduced-motion preference');
  // the hint: shown in every browser (no display rule hides it), in the section text colour (light, dark and brand backgrounds)
  assert.ok(de.includes('.v3-gal-hint{margin:10px 0 0;font-size:15px;font-weight:600;line-height:1.4;color:inherit}') && !/\.v3-gal-hint\{[^}]*display:none/.test(de));
  // plain text, never a chip; on the brand colour a text colour that reads at 4.5:1 there
  assert.ok(!/\.v3-gal-hint\{[^}]*(border-radius|background)/.test(de), 'no chip: nothing makes the hint look like a button');
  assert.ok(de.includes('.v3-gallery.v3-bg-brand .v3-gal-hint{color:#1a1410}'), 'default orange: the dark page text (white would be 3.1:1)');
  const brandHint = (brand, onBrand) => { const d = withSections({ id: 's_gal08', type: 'gallery', variant: 'carousel', data: { images: imgs } }); Object.assign(d.theme.palette, { brand }, onBrand ? { onBrand } : {}); return (V3.renderDesign(d, CTX).html.match(/\.v3-gallery\.v3-bg-brand \.v3-gal-hint\{color:(#[0-9a-f]+)\}/i) || [])[1]; };
  assert.deepEqual([brandHint('#1b3a8a'), brandHint('#ffd400'), brandHint('#1b3a8a', '#ffe08a'), brandHint('#777777')], ['#ffffff', '#1a1410', '#ffe08a', '#000000'], 'dark brand: white; light brand: dark text; a readable onBrand is kept; otherwise black or white');
  // long text on wider screens, short text on phones
  assert.ok(de.includes('<p class="v3-gal-hint" aria-hidden="true"><span class="v3-gal-hint-l">← Weitere Bilder: wischen oder scrollen →</span><span class="v3-gal-hint-s">Weitere Bilder · Wischen</span></p>'));
  assert.ok(en.includes('<p class="v3-gal-hint" aria-hidden="true"><span class="v3-gal-hint-l">← More photos: swipe or scroll →</span><span class="v3-gal-hint-s">More photos · Swipe</span></p>'));
  assert.ok(de.includes('.v3-gal-hint-s{display:none}@media (max-width:767px){.v3-gal-hint-l{display:none}.v3-gal-hint-s{display:inline}}'));
  // owner text never reaches the stylesheet; no script anywhere
  const style = (h) => h.slice(h.indexOf('<style>'), h.indexOf('</style>'));
  assert.ok(!style(en).includes('</style><b>') && !/<b>/.test(style(en)));
  for (const h of [de, en]) assert.ok(!/<script/i.test(h), 'no script');
  // one photo: nothing to scroll to, no buttons, no hint; Grid: none of it
  const one = V3.renderDesign(withSections({ id: 's_gal06', type: 'gallery', variant: 'carousel', data: { images: [imgs[0]] } }), CTX).html;
  assert.ok(!one.includes('<p class="v3-gal-hint"') && !one.includes('<button'));
  const grid = V3.renderDesign(withSections({ id: 's_gal07', type: 'gallery', variant: 'grid', data: { images: imgs } }), CTX).html;
  assert.ok(grid.includes('<div class="v3-gal v3-gal-grid"><figure') && !/tabindex|v3-gal-wrap"|<p class="v3-gal-hint|<button/.test(grid.slice(grid.indexOf('<main'))), 'Grid markup unchanged');
});

test('Products: grid and list, price, description, button (internal link same tab, external new tab)', () => {
  const d = withSections({ id: 's_prod01', type: 'products', variant: 'list', data: { title: 'Produkte', items: [
    { name: 'Bauernbrot', description: '1 kg', price: '4,20 €', image: IMG('p'), target: '/kontakt', buttonText: 'Bestellen' },
    { name: 'Croissant <neu>', target: 'https://example.com/shop' }, { name: 'Brezel' }] } });
  const h = V3.renderDesign(d, CTX).html;
  assert.ok(h.includes('<article class="v3-prod"><img class="v3-prod-img" src="https://res.cloudinary.com/demo/image/upload/v1/p.jpg" alt="Bauernbrot" loading="lazy" width="800" height="600"><div class="v3-prod-body"><h3 class="v3-prod-name">Bauernbrot</h3><p class="v3-prod-desc">1 kg</p><p class="v3-prod-price">4,20 €</p><a class="v3-btn v3-btn-primary v3-prod-btn" href="#kontakt"><span>Bestellen</span></a></div></article>'));
  assert.ok(h.includes('<h3 class="v3-prod-name">Croissant &lt;neu&gt;</h3><a class="v3-btn v3-btn-primary v3-prod-btn" href="https://example.com/shop" target="_blank" rel="noopener noreferrer"><span>Ansehen</span></a>'), 'default button text by language');
  assert.ok(h.includes('<article class="v3-prod"><div class="v3-prod-body"><h3 class="v3-prod-name">Brezel</h3></div></article>'), 'no image, no link: just the text');
  assert.match(h, /class="v3-prods v3-prods-list"/);
});

test('Gallery and Products CSS is added only when such a section is on the page', () => {
  const plain = V3.renderDesign(BASE, CTX).html;
  assert.ok(!plain.includes('.v3-gal{') && !plain.includes('.v3-prods{') && !plain.includes('.v3-img-ph{'));
  const gal = V3.renderDesign(withSections({ id: 's_gal01', type: 'gallery', data: { images: [{ image: IMG('a') }] } }), CTX).html;
  assert.ok(gal.includes('.v3-gal{') && !gal.includes('.v3-prods{'));
  const pv = V3.renderDesign(BASE, CTX, { preview: true }).html;
  assert.ok(pv.includes('.v3-img-ph{') && pv.includes('.v3-prods{'), 'preview styles and the sample cards');
});

test('preview is only switched on by { preview: true } exactly', () => {
  for (const opts of [{ preview: 'true' }, { preview: 1 }, { preview: {} }, {}, null]) {
    assert.ok(!/data-v3-id/.test(V3.renderDesign(BASE, CTX, opts).html), JSON.stringify(opts));
  }
});

test('describe(): plain data, a fresh copy each time, covering all ten types', () => {
  const a = V3.describe(), b = V3.describe();
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'JSON only, no functions');
  a.sections.hero.data.fields.headline.max = 1;
  assert.equal(b.sections.hero.data.fields.headline.max, 120, 'callers cannot change the rules');
  assert.equal(V3.describe().sections.hero.data.fields.headline.max, 120);
  assert.deepEqual(Object.keys(b.sections).sort(), V3.SECTION_TYPES.slice().sort());
  assert.equal(b.schemaVersion, 1);
  assert.deepEqual(b.sections.buttons.variants, ['buttons', 'cards', 'list']);
  assert.deepEqual(b.sections.buttons.data.fields.items.item.fields.target, { t: 'link', kind: 'link', required: true, kindFrom: 'kind' });
  assert.deepEqual(b.section.style.fields.background.values, ['default', 'alt', 'brand', 'dark']);
  assert.equal(b.choices.languages.length, 2);
  assert.deepEqual(V3.library().filter((s) => s.rendered).map((s) => s.type).sort(), ['buttons', 'contact', 'gallery', 'hero', 'openingHours', 'products', 'socialMedia', 'text']);
});

// A value that passes the rule, made only from describe() (what the Studio will do).
function sample(spec, platform) {
  switch (spec.t) {
    case 'str': return spec.required ? 'x' : '';
    case 'enum': return spec.def;
    case 'bool': return spec.def;
    case 'int': return spec.def;
    case 'color': return '';
    case 'time': return '08:00';
    case 'image': return spec.required ? IMG('req') : '';
    case 'link': return spec.required ? '/' : '';
    case 'phone': case 'email': return '';
    case 'social': return 'https://www.instagram.com/x';
    case 'arr': return [];
    case 'obj': { const o = {}; for (const k of Object.keys(spec.fields)) o[k] = sample(spec.fields[k], platform); return o; }
  }
  throw new Error('no sample for ' + spec.t);
}
function strFields(spec, path, out) {
  if (spec.t === 'str') out.push({ path, max: spec.max });
  if (spec.t === 'obj') for (const k of Object.keys(spec.fields)) strFields(spec.fields[k], path.concat(k), out);
  return out;
}
const setPath = (o, p, v) => { let n = o; for (let i = 0; i < p.length - 1; i++) n = n[p[i]]; n[p[p.length - 1]] = v; };

test('describe() agrees with validation: data built from it is valid; every text limit is the one enforced', () => {
  const D = V3.describe();
  for (const type of V3.SECTION_TYPES) {
    const data = sample(D.sections[type].data);
    const section = { id: 's_desc01', type, data };
    const ok = V3.validateDesign(withSections(section));
    assert.ok(ok.ok, type + ': ' + JSON.stringify(ok.errors));
    for (const f of strFields(D.sections[type].data, [], [])) {
      const over = JSON.parse(JSON.stringify(section));
      setPath(over.data, f.path, 'y'.repeat(f.max + 1));
      const r = V3.validateDesign(withSections(over));
      assert.ok(r.errors.some((e) => e.code === 'too_long' && e.max === f.max), type + '.' + f.path.join('.'));
      setPath(over.data, f.path, 'y'.repeat(f.max));
      assert.ok(V3.validateDesign(withSections(over)).ok, type + '.' + f.path.join('.') + ' at the limit');
    }
  }
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
