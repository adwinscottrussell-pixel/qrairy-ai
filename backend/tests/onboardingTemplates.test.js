// ============================================================
// onboardingTemplates.test.js — Landing Page Studio V3 onboarding, Phase
// T0: the starter template catalog (js/studio/onboarding-templates.js),
// pure checks:
// - six templates, EN and DE, three or four palettes each, the suggested
//   sections and buttons; the eleven button presets on core.js's link kinds
//   and icons; the onboarding's fixed section ids;
// - every template x palette x language is a valid V3 design (the example
//   page and the page a save may store), with the frontend and the backend
//   core.js, under the server's Cloudinary rule; both render the same HTML;
// - every palette: each text colour pair at 4.5:1 or better;
// - photos only from the approved starter catalog, from the template's own
//   category; Creator and Professional Services their approved Studio heroes
//   (the supplied originals byte for byte, a web copy, the intended address);
// - example-only parts (links, prices, products, hours, address, email,
//   social profiles) are listed and never in starter(); example links lead
//   only to the page itself, social examples to the platforms' home pages;
// - the customer's name and description replace the example texts;
// - no request, no storage, no DOM; the onboarding does not load it yet.
// Rendering at phone widths: onboardingTemplates.browser.test.js.
// Run: node tests/onboardingTemplates.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');
const V3 = require('../../frontend/public/js/lpV3/core.js');
const V3B = require('../src/lpV3/core.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');
const M = require('../../frontend/public/js/studio/onboarding-model.js');
const IMAGES = require('../../frontend/public/js/studio/studio-demo-images.js');
const CATALOG = (() => { const w = {}; vm.runInNewContext(read('js/deal-starter-images.js'), { window: w }); return w.QRAIVY_DEAL_STARTER_IMAGES; })();
const CLOUD = 'dwqc6n7rn';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const LANGS = ['en', 'de'];
const opts = (lang, palette, extra) => Object.assign({ lang, palette, imageUrl: T.imageUrl, cloudName: CLOUD }, extra || {});
function each(fn) { T.TEMPLATE_IDS.forEach((id) => T.get(id).palettes.forEach((p) => LANGS.forEach((l) => fn(id, p, l)))); }

function lum(h) { return [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

test('six templates in the approved order, EN and DE labels, 3 or 4 palettes, a font pair and radius core.js knows', () => {
  assert.deepEqual(T.TEMPLATE_IDS, ['restaurant', 'bakery', 'beauty', 'retail', 'creator', 'services']);
  assert.deepEqual(T.list('en').map((t) => t.label), ['Restaurant', 'Bakery & Café', 'Beauty & Salon', 'Retail & Boutique', 'Creator & Influencer', 'Professional Services']);
  assert.deepEqual(T.list('de').map((t) => t.label), ['Restaurant', 'Bäckerei & Café', 'Beauty & Salon', 'Einzelhandel & Boutique', 'Creator & Influencer', 'Dienstleistungen']);
  T.list('en').forEach((t, i) => {
    const de = T.list('de')[i];
    assert.ok(t.palettes.length >= 3 && t.palettes.length <= 4, t.id + ' palettes');
    assert.equal(new Set(t.palettes.map((p) => p.id)).size, t.palettes.length, t.id + ' palette ids unique');
    t.palettes.forEach((p, j) => { assert.ok(p.label && de.palettes[j].label, t.id + ' palette names'); assert.deepEqual(Object.keys(p.colors).sort(), Object.keys(V3.DEFAULT_PALETTE).sort()); });
    assert.ok(V3.FONT_PAIRS.includes(t.fontPair) && ['none', 'sm', 'md', 'lg'].includes(t.radius), t.id + ' theme');
    assert.ok(t.blurb && de.blurb && t.blurb !== de.blurb, t.id + ' blurb EN/DE');
    assert.equal(t.sections[0], 'hero', t.id + ' Hero first');
    assert.ok(t.sections.every((s) => T.SECTION_TYPES.includes(s)) && new Set(t.sections).size === t.sections.length, t.id + ' sections');
    assert.ok(t.buttons.length >= 3 && t.buttons.every((b) => T.BUTTON_PRESETS.some((p) => p.id === b)), t.id + ' buttons');
  });
  assert.equal(T.get('creator').kind, 'creator');
  assert.ok(T.TEMPLATE_IDS.filter((id) => id !== 'creator').every((id) => T.get(id).kind === 'business'), 'the kinds POST /studio/drafts accepts');
  assert.equal(T.get('nope'), null);
});

test('the section types and fixed ids are the onboarding\'s own (onboarding-model.js)', () => {
  assert.deepEqual(T.SECTION_TYPES, M.SECTION_TYPES);
  assert.deepEqual(T.SECTION_IDS, M.SECTION_IDS);
  each((id, p, l) => {
    const r = T.sample(V3, id, opts(l, p.id));
    r.design.pages[0].sections.forEach((s) => assert.equal(s.id, M.SECTION_IDS[s.type], id + ' ' + s.type));
  });
});

test('the eleven button presets: Website, WhatsApp, Call, Directions, Book, Shop, Menu, Offers, Events, Email, Custom', () => {
  assert.deepEqual(T.BUTTON_PRESETS.map((p) => p.id), ['website', 'whatsapp', 'call', 'directions', 'book', 'shop', 'menu', 'offers', 'events', 'email', 'custom']);
  T.BUTTON_PRESETS.forEach((p) => {
    assert.ok(V3.LINK_KINDS.includes(p.kind), p.id + ' kind');
    assert.ok(V3.ICONS.includes(p.icon) && p.icon !== 'none', p.id + ' icon');
    assert.ok(p.label.en && p.label.de, p.id + ' labels');
  });
  const kind = Object.fromEntries(T.BUTTON_PRESETS.map((p) => [p.id, p.kind]));
  assert.deepEqual([kind.website, kind.whatsapp, kind.call, kind.directions, kind.email], ['website', 'whatsapp', 'call', 'directions', 'email']);
});

test('every template x palette x language: the example page and the starter page are valid (frontend and backend core.js, server Cloudinary rule)', () => {
  let n = 0;
  each((id, p, l) => {
    const s = T.sample(V3, id, opts(l, p.id));
    assert.ok(s.ok, id + ' ' + p.id + ' ' + l + ' sample: ' + JSON.stringify(s.errors));
    const st = T.starter(V3, id, opts(l, p.id));
    assert.ok(st.ok, id + ' ' + p.id + ' ' + l + ' starter: ' + JSON.stringify(st.errors));
    assert.ok(V3B.validateDesign(s.design, { cloudName: CLOUD }).ok && V3B.validateDesign(st.design, { cloudName: CLOUD }).ok, id + ' backend');
    assert.deepEqual(s.design.theme.palette, T.get(id).palettes.find((x) => x.id === p.id).colors);
    assert.equal(s.design.settings.language, l);
    n++;
  });
  assert.equal(n, 46);
});

test('frontend and backend core.js render the same HTML for every example and starter page', () => {
  assert.equal(fs.readFileSync(path.join(PUB, 'js/lpV3/core.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'src/lpV3/core.js'), 'utf8'), 'core.js copies byte-identical');
  each((id, p, l) => {
    [T.sample(V3, id, opts(l, p.id)).design, T.starter(V3, id, opts(l, p.id)).design].forEach((d) => {
      [{}, { preview: true }].forEach((o) => {
        const a = V3.renderDesign(d, { businessName: 'Demo' }, o), b = V3B.renderDesign(d, { businessName: 'Demo' }, o);
        assert.ok(a.ok && b.ok, id + ' renders');
        assert.equal(a.html, b.html, id + ' ' + p.id + ' ' + l);
      });
    });
  });
});

test('contrast: every palette reaches 4.5:1 for each text colour pair the renderer uses', () => {
  each((id, p) => {
    const c = p.colors;
    const pairs = { 'text/background': [c.text, c.background], 'text/surface': [c.text, c.surface], 'muted/background': [c.muted, c.background], 'muted/surface': [c.muted, c.surface],
      'onBrand/brand': [c.onBrand, c.brand], 'heroText/dark': [c.heroText, c.dark], 'brand/background': [c.brand, c.background], 'brand/surface': [c.brand, c.surface] };
    Object.keys(pairs).forEach((k) => { const r = contrast(pairs[k][0], pairs[k][1]); assert.ok(r >= 4.5, id + ' ' + p.id + ' ' + k + ' ' + r.toFixed(2)); });
  });
});

test('EN and DE: every text is translated (only names, brands and placeholders may match)', () => {
  const texts = (d) => { const out = []; (function walk(v, k) { if (typeof v === 'string') { if (v && !/^(https?:|\/|#|s_)/.test(v) && !/^(image|backgroundImage|target|url|platform|day|open|close|variant|type|id|anchor|background|align|spacing|icon|kind)$/.test(k)) out.push(v); } else if (v && typeof v === 'object') Object.keys(v).forEach((x) => walk(v[x], x)); })(d.pages, ''); return out; };
  const SAME = /^(Trattoria Sole|Backstube Morgenrot|Studio Belle|Atelier Nord|Mila Sommer|Berger & Partner|Tiramisu della casa|WhatsApp|Bordeaux|12345|Start|Home)$/;
  T.TEMPLATE_IDS.forEach((id) => {
    const en = texts(T.sample(V3, id, opts('en')).design), de = texts(T.sample(V3, id, opts('de')).design);
    assert.equal(en.length, de.length, id + ' same structure');
    en.forEach((x, i) => { if (!SAME.test(x)) assert.notEqual(x, de[i], id + ': "' + x + '" untranslated'); });
    assert.ok(de.some((x) => /[äöüß]/.test(x)), id + ' German text');
  });
  // prices in each language's own format
  assert.ok(JSON.stringify(T.sample(V3, 'restaurant', opts('en')).design).includes('"€12.50"'));
  assert.ok(JSON.stringify(T.sample(V3, 'restaurant', opts('de')).design).includes('"12,50 €"'));
});

test('photos: only approved images, at their Cloudinary address, each from its own template; Creator and Services use their approved Studio heroes', () => {
  const cat = Object.fromEntries(CATALOG.images.map((i) => [i.id, i]));
  const studio = Object.fromEntries(T.STUDIO_IMAGES.map((i) => [i.id, i]));
  const CATEGORY = { restaurant: 'restaurant', bakery: 'bakery-cafe', beauty: 'beauty-wellness', retail: 'fashion-retail' };
  T.TEMPLATE_IDS.forEach((id) => {
    const t = T.get(id);
    assert.ok(t.images.length >= 1, id + ' has a photo');
    t.images.forEach((sid) => {
      if (studio[sid]) {
        assert.equal(studio[sid].template, id, sid + ' belongs to ' + id);
        assert.equal(studio[sid].origin.type, 'ai_generated');
        return;
      }
      assert.ok(cat[sid], sid + ' in the approved catalog');
      assert.equal(cat[sid].origin.type, 'ai_generated');
      assert.equal(cat[sid].category, CATEGORY[id], id + ': ' + sid + ' from its own category');
      assert.ok(fs.existsSync(path.join(PUB, 'images/deals/starter', sid + '.jpg')), sid + ' file');
      assert.equal(T.imageUrl(sid), IMAGES.cloudinaryUrl(sid), sid + ': the Deals starter address');
    });
    LANGS.forEach((l) => {
      const json = JSON.stringify(T.sample(V3, id, opts(l)).design);
      const used = [...json.matchAll(/https:\/\/res\.cloudinary\.com\/[^"]+/g)].map((m) => m[0]);
      used.forEach((u) => { const m = /\/qraivy-(?:deal|studio)-starters\/([A-Za-z0-9-]+)\.jpg$/.exec(u); assert.ok(m && t.images.includes(m[1]) && u === T.imageUrl(m[1]), id + ': ' + u); });
      assert.equal(new Set(used.map((u) => u.split('/').pop())).size, t.images.length, id + ' uses all its photos');
      assert.ok(!/images\/|\.png|unsplash|placeholder/i.test(json.replace(/https:\/\/res\.cloudinary\.com\/[^"]+/g, '')), id + ' no other image');
    });
  });
  assert.deepEqual(T.get('creator').images, ['QRAIVY-Creator-Hero']);
  assert.deepEqual(T.get('services').images, ['QRAIVY-Professional-Services-Hero']);
  assert.ok(!T.available('creator').includes('gallery') && !T.available('services').includes('gallery'), 'no Gallery example with a single photo');
});

test('the two Studio starter heroes: the agreed names, only the web copies in the repository (originals recorded by checksum), the original size, the intended Cloudinary address (aspect ratio kept)', () => {
  const crypto = require('crypto');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, f))).digest('hex');
  assert.deepEqual(T.STUDIO_IMAGES.map((i) => i.id), ['QRAIVY-Creator-Hero', 'QRAIVY-Professional-Services-Hero']);
  assert.deepEqual(fs.readdirSync(path.join(PUB, 'images/studio/starter')).sort(), ['QRAIVY-Creator-Hero.jpg', 'QRAIVY-Professional-Services-Hero.jpg'], 'only the web copies, no PNG originals');
  T.STUDIO_IMAGES.forEach((i) => {
    assert.equal(i.master, i.id + '.png', 'the agreed name of the original');
    assert.match(i.origin.masterSha256, /^[0-9a-f]{64}$/);
    assert.equal(i.file, 'images/studio/starter/' + i.id + '.jpg');
    assert.equal(sha(i.file), i.sha256, i.id + ' web copy unchanged');
    const jpg = fs.readFileSync(path.join(PUB, i.file));
    assert.deepEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff], i.id + ' JPEG');
    let o = 2, size = null;
    while (o < jpg.length) { const m = jpg[o + 1], len = jpg.readUInt16BE(o + 2); if (m >= 0xc0 && m <= 0xc3) { size = [jpg.readUInt16BE(o + 7), jpg.readUInt16BE(o + 5)]; break; } o += 2 + len; }
    assert.deepEqual(size, [i.width, i.height], i.id + ' web copy keeps the original size');
    assert.ok(jpg.length < 300 * 1024, i.id + ' web copy small: ' + jpg.length);
    assert.equal(T.imageUrl(i.id), 'https://res.cloudinary.com/dwqc6n7rn/image/upload/c_limit,w_1200,f_auto,q_auto/qraivy-studio-starters/' + i.id + '.jpg');
    assert.ok(V3.validateDesign({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_hero01', type: 'hero', data: { headline: 'x', backgroundImage: T.imageUrl(i.id) } }] }] }, { cloudName: CLOUD }).ok, i.id + ' passes the image rule');
  });
  assert.equal(T.AI_LABEL, IMAGES.AI_LABEL, 'the same AI label as the Studio');
});

test('example-only parts are listed in sample() and never in starter(): no example link, price, product, hours, address, email or profile', () => {
  each((id, p, l) => {
    const s = T.sample(V3, id, opts(l, p.id)), st = T.starter(V3, id, opts(l, p.id));
    const get = (d, pth) => pth.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((v, k) => (v == null ? v : v[k]), d);
    assert.ok(s.demoOnly.length >= 3, id + ' demo-only listed');
    s.demoOnly.forEach((pth) => assert.notEqual(get(s.design, pth), undefined, pth));
    st.design.pages[0].sections.forEach((sec) => {
      const d = sec.data;
      if (sec.type === 'hero') assert.ok(!d.primary.text && !d.primary.target && !d.secondary.text && !d.secondary.target, id + ' hero buttons');
      if (sec.type === 'buttons' || sec.type === 'products') assert.deepEqual(d.items, [], id + ' ' + sec.type);
      if (sec.type === 'openingHours') { assert.deepEqual(d.days, []); assert.equal(d.note, ''); }
      if (sec.type === 'contact') { assert.ok(!d.address.line1 && !d.address.city && !d.address.postalCode && !d.phone && !d.email && !d.mapsUrl && d.showMapLink === false, id + ' contact'); }
      if (sec.type === 'socialMedia') assert.deepEqual(d.links, []);
    });
    const json = JSON.stringify(st.design);
    assert.ok(!/example\.com|Musterstra|Sample Street|Musterstadt|Sample Town|€|wa\.me|tel:|mailto:|instagram\.com|facebook\.com|linkedin\.com|tiktok\.com/.test(json), id + ' ' + l + ' starter is free of example facts');
    // and the public page of the starter shows none of them either
    const page = V3.renderDesign(st.design, { businessName: 'Demo' }, {}).html;
    const html = page.slice(page.indexOf('<body'));   // the content (the stylesheet names every class)
    assert.ok(!/example\.com|Musterstra|Sample Street|€|v3-prod-price|v3-hours|v3-social-ic/.test(html), id + ' ' + l + ' public starter page');
  });
});

test('example links never leave the page: buttons and hero buttons to the page top or one of its sections; social examples are the platforms\' home pages', () => {
  each((id, p, l) => {
    const s = T.sample(V3, id, opts(l, p.id));
    const anchors = s.design.pages[0].sections.map((x) => x.anchor).filter(Boolean);
    const internal = (t) => t === '/' || anchors.includes(t.slice(1));
    s.design.pages[0].sections.forEach((sec) => {
      if (sec.type === 'hero') ['primary', 'secondary'].forEach((k) => assert.ok(!sec.data[k].target || internal(sec.data[k].target), id + ' hero ' + sec.data[k].target));
      if (sec.type === 'buttons') sec.data.items.forEach((it) => { assert.equal(it.kind, 'link'); assert.ok(internal(it.target), id + ' ' + it.target); });
      if (sec.type === 'products') sec.data.items.forEach((it) => assert.equal(it.target, '', id + ' no product link'));
      if (sec.type === 'socialMedia') sec.data.links.forEach((x) => assert.equal(x.url, T.PLATFORM_HOME[x.platform], id + ' ' + x.url));
      if (sec.type === 'contact') { assert.equal(sec.data.phone, '', id + ' no example phone number'); assert.equal(sec.data.mapsUrl, ''); assert.match(sec.data.email, /^(hello|hallo)@example\.com$|^$/); }
    });
    assert.ok(!/wa\.me|tel:|mailto:|maps\.|google\./.test(JSON.stringify(s.design)), id + ' no example contact link');
  });
});

test('the customer\'s name and description (Step 2) replace the example headline and sub-headline, and are not listed as samples', () => {
  const name = 'Café Lindenhof', description = 'Kaffee und Kuchen am Marktplatz.';
  T.TEMPLATE_IDS.forEach((id) => {
    const plain = T.sample(V3, id, opts('de'));
    assert.equal(plain.design.pages[0].sections[0].data.headline, T.get(id).demoName);
    assert.ok(plain.samplePaths.includes('pages[0].sections[0].data.headline'));
    [T.sample(V3, id, opts('de', null, { name, description })), T.starter(V3, id, opts('de', null, { name, description }))].forEach((r) => {
      const hero = r.design.pages[0].sections[0];
      assert.equal(hero.data.headline, name);
      assert.equal(hero.data.subheadline, description);
      assert.ok(!r.samplePaths.includes('pages[0].sections[0].data.headline') && !r.samplePaths.includes('pages[0].sections[0].data.subheadline'), id);
    });
  });
});

test('a chosen section list: kept in order, the Hero first, each type once, types without an example left out; the palette falls back to the first', () => {
  const r = T.sample(V3, 'creator', opts('en', 'nope', { sections: ['text', 'gallery', 'text', 'buttons', 'hero', 'openingHours', 'bogus'] }));
  assert.ok(r.ok);
  assert.deepEqual(r.design.pages[0].sections.map((s) => s.type), ['hero', 'text', 'buttons']);
  assert.equal(r.palette, 'coral');
  // links to sections left out (the shop, collaborations) lead to the page top
  assert.deepEqual(r.design.pages[0].sections[2].data.items.map((x) => x.target), ['/', '/', '/', '/']);
  assert.equal(r.design.pages[0].sections[0].data.secondary.target, '/');
  T.TEMPLATE_IDS.forEach((id) => T.SECTION_TYPES.forEach((type) => assert.ok(T.sample(V3, id, opts('de', null, { sections: ['hero', 'buttons', type] })).ok, id + ' with ' + type)));
  const all = T.sample(V3, 'restaurant', opts('en', 'olive', { sections: T.SECTION_TYPES }));
  assert.deepEqual(all.design.pages[0].sections.map((s) => s.type), T.SECTION_TYPES);
  assert.equal(all.palette, 'olive');
  // the suggested page by default
  T.TEMPLATE_IDS.forEach((id) => assert.deepEqual(T.sample(V3, id, opts('en')).design.pages[0].sections.map((s) => s.type), T.get(id).sections));
  assert.equal(T.sample(V3, 'nope', opts('en')).ok, false);
});

test('a palette change touches only the theme; a template change keeps the customer\'s name and description', () => {
  T.TEMPLATE_IDS.forEach((id) => {
    const ps = T.get(id).palettes;
    const a = T.sample(V3, id, opts('en', ps[0].id)), b = T.sample(V3, id, opts('en', ps[ps.length - 1].id));
    assert.deepEqual(a.design.pages, b.design.pages, id);
    assert.notDeepEqual(a.design.theme.palette, b.design.theme.palette);
  });
  const answers = { name: 'Lindenhof', description: 'Our own words.' };
  T.TEMPLATE_IDS.forEach((id) => { const h = T.starter(V3, id, opts('en', null, answers)).design.pages[0].sections[0].data; assert.deepEqual([h.headline, h.subheadline], [answers.name, answers.description]); });
});

test('Hero spacing: compact for Creator and Professional Services only (T0 refinement); the other four unchanged', () => {
  T.TEMPLATE_IDS.forEach((id) => LANGS.forEach((l) => {
    [T.sample(V3, id, opts(l)), T.starter(V3, id, opts(l))].forEach((r) => {
      const hero = r.design.pages[0].sections[0];
      assert.equal(hero.style.spacing, ['creator', 'services'].includes(id) ? 'compact' : 'normal', id + ' ' + l);
      assert.equal(V3.renderDesign(r.design, { businessName: 'Demo' }, {}).html.includes('v3-hero-compact'), ['creator', 'services'].includes(id), id + ' class and CSS');
    });
  }));
  assert.equal(T.get('creator').content((en) => en, () => '', () => '').hero.variant, 'split');
  assert.equal(T.get('services').content((en) => en, () => '', () => '').hero.variant, 'split');
});

test('pure: no request, no storage, no DOM; nothing loads the catalog yet (onboarding unchanged)', () => {
  const src = read('js/studio/onboarding-templates.js');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.|window\.|new Image|import\(/.test(src.replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')));
  ['studio-onboarding.html', 'studio.html'].forEach((f) => assert.ok(!read(f).includes('onboarding-templates.js'), f));
  ['js/studio/onboarding-shell.js', 'js/studio/studio-shell.js'].forEach((f) => assert.ok(!read(f).includes('QraivyOnboardingTemplates'), f));
});

(async () => {
  let passed = 0, failed = 0;
  console.log('onboardingTemplates');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
