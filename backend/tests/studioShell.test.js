// ============================================================
// studioShell.test.js — Landing Page Studio V3, Phase 2A-2 (visual shell)
// and 2A-3A (Hero editing), static checks on frontend/public/studio.html
// and js/studio/*:
// - default-deny routing: only localhost / 127.0.0.1 / file: run (local
//   mode, no API); every other address, production included, is blocked;
// - no network: no fetch / XHR / WebSocket / beacon / API address anywhere
//   in the Studio files; no Clerk, no API routing scripts loaded;
// - Save Draft and Publish are disabled and never enabled; Undo / Redo
//   start disabled (the store enables them after an edit); preview frames
//   allow scripts only (never same origin), the full-size preview nothing;
// - no existing page links to the Studio yet;
// - the demo is the Local Business layout with placeholder content only.
// Run: node tests/studioShell.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');
const HTML = read('studio.html');
const STUDIO_JS = fs.readdirSync(path.join(PUB, 'js', 'studio')).map((f) => 'js/studio/' + f);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function routing() {
  const ctx = { window: { location: { hostname: 'x', protocol: 'https:' } } };
  vm.runInNewContext(read('js/studio/studio-routing.js'), ctx);
  // plain copies: objects made inside the sandbox belong to another realm
  return (h, p) => JSON.parse(JSON.stringify(ctx.window.QraivyStudioRouting.resolve(h, p)));
}

test('routing: local only, no API; every other address blocked (default deny)', () => {
  const resolve = routing();
  for (const h of ['localhost', '127.0.0.1', 'LOCALHOST', '[::1]']) assert.deepEqual(resolve(h, 'http:'), { mode: 'local', api: '', blocked: false }, h);
  assert.deepEqual(resolve('', 'file:'), { mode: 'local', api: '', blocked: false });
  for (const h of ['www.qraivy.com', 'qraivy.com', 'api.qraivy.com', 'deals-preview.qraivy.com', 'voice-preview.qraivy.com', 'plan-preview.qraivy.com',
    'qraivy-ai-git-preview-l-3d55c7-adwinscottrussell-5957s-projects.vercel.app', 'localhost.evil.example', 'evil-localhost', '127.0.0.1.nip.io', '', undefined]) {
    assert.deepEqual(resolve(h, 'https:'), { mode: 'unavailable', api: '', blocked: true }, String(h));
  }
  const ctx = { window: { location: { hostname: 'www.qraivy.com', protocol: 'https:' } } };
  vm.runInNewContext(read('js/studio/studio-routing.js'), ctx);
  assert.equal(ctx.window.QRAIVY_STUDIO_ROUTING.blocked, true, 'production: the Studio does not start');
});

test('scripts: only the shell, the shared V3 code and the Studio files; no Clerk, no API routing', () => {
  const scripts = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/qraivy-lang.js', 'js/admin-shell.js', 'js/studio/studio-routing.js', 'js/lpV3/core.js', 'js/studio/studio-demo.js',
    'js/studio/studio-store.js', 'js/studio/studio-preview.js', 'js/studio/studio-inspector.js', 'js/studio/studio-shell.js']);
  assert.ok(!/clerk|api-base\.js|lp-routing\.js|deals-routing\.js|staging-config\.js/i.test(HTML));
  const styles = (HTML.match(/<link\b[^>]*>/g) || []).filter((l) => /rel="stylesheet"/.test(l)).map((l) => l.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(styles, ['https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap', 'dashboard-shell.css', 'css/studio.css']);
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow" \/>/);
});

test('no network in the Studio files (no fetch, XHR, sockets, beacons, imports or API addresses)', () => {
  for (const f of ['studio.html'].concat(STUDIO_JS)) {
    const src = read(f);
    for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/, /serviceWorker/, /api\.qraivy\.com/, /railway\.app/, /\.vercel\.app/]) {
      assert.ok(!re.test(src), f + ' must not contain ' + re);
    }
  }
});

test('Save Draft and Publish are disabled and never enabled; Undo / Redo start disabled; the overflow menu only has disabled items', () => {
  assert.match(HTML, /<button type="button" class="st-btn st-btn--outline" id="st-save-btn" disabled aria-disabled="true"/);
  assert.match(HTML, /<button type="button" class="st-btn st-btn--primary" id="st-publish-btn" disabled aria-disabled="true"/);
  assert.match(HTML, /<button type="button" class="st-iconbtn" id="st-undo-btn" disabled data-st-aria="undo" /);
  assert.match(HTML, /<button type="button" class="st-iconbtn" id="st-redo-btn" disabled data-st-aria="redo" /);
  const menu = HTML.slice(HTML.indexOf('id="st-more-menu"'), HTML.indexOf('</div>', HTML.indexOf('id="st-more-menu"')));
  assert.equal((menu.match(/<button /g) || []).length, (menu.match(/<button type="button" role="menuitem" disabled/g) || []).length);
  for (const f of STUDIO_JS) assert.ok(!/st-(publish|save)-btn/.test(read(f)), f + ' never touches Save Draft or Publish');
});

const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // code, not comments
test('preview frames: sandbox "allow-scripts" only (never same origin); the full-size preview: no permissions', () => {
  assert.match(HTML, /<iframe class="st-full__frame" id="st-full-frame" sandbox="" title="Preview" referrerpolicy="no-referrer"><\/iframe>/);
  const pv = read('js/studio/studio-preview.js');
  assert.ok(pv.includes("var SANDBOX = 'allow-scripts';") && pv.includes("ifr.setAttribute('sandbox', SANDBOX);"));
  assert.ok(!/allow-same-origin/.test(HTML + STUDIO_JS.map(code).join('')));
  assert.equal((HTML.match(/<iframe/g) || []).length, 1, 'only the full-size preview is in the page; frames come from studio-preview.js');
  const shell = read('js/studio/studio-shell.js');
  assert.ok(shell.includes('{ preview: true }'), 'rendered by the shared core in preview mode');
  assert.ok(shell.includes("$('st-full-frame').srcdoc = pageHtml();"), 'the full-size preview gets the plain page, no Studio script');
});

test('2A-3C: only the Hero, the Buttons and Social Media are editable; the shell builds no form controls itself; no adding sections or templates yet', () => {
  assert.deepEqual(require('../../frontend/public/js/studio/studio-inspector.js').EDITABLE, ['hero', 'buttons', 'socialMedia']);
  // the approved notice while anything is invalid, in English and German
  assert.match(HTML, /<p class="st-stale" id="st-stale" role="status" hidden>.*<span data-st="preview_stale">Preview shows the last valid version\. Fix the highlighted field\.<\/span><\/p>/);
  assert.ok(read('js/studio/studio-shell.js').includes("preview_stale: 'Die Vorschau zeigt die letzte gültige Version. Korrigiere das markierte Feld.'"));
  const shell = code('js/studio/studio-shell.js');
  assert.ok(!/el\('(input|textarea|select)'/.test(shell), 'every control comes from studio-inspector.js');
  assert.ok(shell.includes("title: t('add_later'), 'data-type': s.type"), 'library items still say "arrives later"');
  assert.ok(!/insertSection|addSection|applyTemplate|removeSection|deleteSection|moveSection|duplicateSection/.test(shell + code('js/studio/studio-store.js')), 'no add / move / delete / templates in this step');
});

test('every id in studio.html is unique (an icon and a button once shared "st-undo")', () => {
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), []);
});

test('no existing page links to the Studio yet', () => {
  for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith('.html') && x !== 'studio.html')) {
    assert.ok(!/(^|[^-\w])studio\.html/.test(read(f)), f);   // (wallet-pass-studio.html is another page)
  }
  for (const f of fs.readdirSync(path.join(PUB, 'js')).filter((x) => x.endsWith('.js'))) {
    assert.ok(!/(^|[^-\w])studio\.html/.test(read('js/' + f)), 'js/' + f);
  }
});

test('demo: the Local Business layout, valid, placeholder content only (no customer branding, no photos)', () => {
  const ctx = { window: {} };
  vm.runInNewContext(read('js/studio/studio-demo.js'), ctx);
  const demo = ctx.window.QRAIVY_STUDIO_DEMO;
  const V3 = require('../src/lpV3/core');
  const v = V3.validateDesign(JSON.parse(JSON.stringify(demo.design)));
  assert.ok(v.ok, JSON.stringify(v.errors));
  const text = JSON.stringify(demo);
  assert.ok(!/staib/i.test(text), 'no Bäckerei Staib branding');
  assert.ok(!/res\.cloudinary\.com|https?:\/\/[^"]*\.(?:jpe?g|png|webp)/i.test(text), 'no photos');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.design.pages[0].sections.map((s) => s.type))),['hero', 'buttons', 'dealsOffers', 'loyalty', 'products', 'openingHours', 'contact', 'socialMedia']);
  const r = V3.renderDesign(JSON.parse(JSON.stringify(demo.design)), { businessName: demo.businessName }, { preview: true });
  assert.ok(r.ok && r.samples.join() === 'dealsOffers,loyalty');
});

test('the ten approved section types and the five templates are offered', () => {
  const V3 = require('../src/lpV3/core');
  assert.equal(V3.library().length, 10);
  const shell = read('js/studio/studio-shell.js');
  for (const name of ['Local Business', 'Link-in-Bio', 'Product Gallery', 'Campaign Page', 'Loyalty & Rewards']) assert.ok(shell.includes("'" + name + "'"), name);
  for (const c of ['all', 'popular', 'business', 'media', 'more']) assert.ok(shell.includes("'" + c + "'"), c);
});

// QRAIVY Dark identity = the existing Admin black / gray theme (dashboard-
// shell.css --sbx-*, academy.css --ac-*, QDS), orange accent; no navy,
// blue-tinted black, brown or sepia in the Studio, its thumbnails or the demo.
function hueSat(hex) {
  const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0; if (d) hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { hue: (hue + 360) % 360, s };
}
const isWarmNeutral = (hex) => { const { hue, s } = hueSat(hex); return s >= 0.08 && hue >= 15 && hue <= 45 && parseInt(hex.slice(1), 16) !== 0xff5a1f; };
test('Dark mode: exactly the Admin black / gray tokens, orange accent; no navy, blue-tinted black, brown or sepia', () => {
  const css = read('css/studio.css');
  const dark = css.slice(css.indexOf(':root[data-studio-theme="dark"]'), css.indexOf('}', css.indexOf(':root[data-studio-theme="dark"]')));
  const val = (k) => dark.match(new RegExp(k + ':\\s*([^;]+);'))[1].trim().toLowerCase();
  // the values the existing Admin pages use (dashboard-shell.css, academy.css, QDS)
  const shell = read('dashboard-shell.css'), qds = read('qds/foundation/colors.css');
  const sbx = (k) => shell.match(new RegExp('--sbx-' + k + ':\\s*([^;]+);'))[1].trim().toLowerCase();
  assert.equal(val('--st-bg'), sbx('bg'));
  assert.equal(val('--st-surface'), sbx('tab'));
  assert.equal(val('--st-surface-2'), sbx('tab-hover'));
  assert.equal(val('--st-border'), sbx('line').replace(/,(\S)/g, ', $1'));
  assert.equal(val('--st-text'), sbx('text'));
  assert.equal(val('--st-text-2'), sbx('text-2'));
  assert.ok(qds.toLowerCase().includes('--qds-color-surface-3: ' + val('--st-surface-3')));
  assert.ok(qds.toLowerCase().includes('--qds-color-background: ' + val('--st-canvas')));
  assert.ok(shell.includes('--dashboard-accent: ' + val('--st-accent')));
  for (const k of ['--st-bg', '--st-surface', '--st-surface-2', '--st-surface-3', '--st-canvas', '--st-frame', '--st-bezel']) {
    const { hue, s } = hueSat(val(k));
    assert.ok(s < 0.1, k + ' ' + val(k) + ' is a neutral black / charcoal (hue ' + Math.round(hue) + ', saturation ' + s.toFixed(2) + ')');
  }
  assert.ok(!/rgba\(148, 163, 184/.test(dark), 'no slate (blue-gray) borders');
  // template thumbnails: neutral or the orange campaign card; no navy, no brown / beige / sepia
  const thumbs = css.slice(css.indexOf('.st-tpl--local'), css.indexOf('/* not available here */'));
  for (const hex of thumbs.match(/#[0-9a-f]{6}/gi)) {
    if (/st-tpl--campaign/.test(thumbs.slice(Math.max(0, thumbs.indexOf(hex) - 80), thumbs.indexOf(hex)))) continue; // the orange campaign card
    const { s } = hueSat(hex);
    assert.ok(s < 0.1, 'thumbnail colour ' + hex + ' is neutral');
    assert.ok(!isWarmNeutral(hex), 'thumbnail colour ' + hex + ' is brown / sepia');
  }
  // the demo uses the QRAIVY default palette
  const ctx = { window: {} };
  vm.runInNewContext(read('js/studio/studio-demo.js'), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.QRAIVY_STUDIO_DEMO.design.theme.palette)), { brand: '#ff5a1f' });
});

test('appearance: Light by default, Dark and System; stored per browser; tokens only in css/studio.css', () => {
  assert.match(HTML, /<html lang="en" data-studio-theme="light">/);
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  assert.ok(head.indexOf("localStorage.getItem('qraivy.studio.theme')") !== -1 && head.indexOf('prefers-color-scheme: dark') !== -1, 'set before the first paint');
  const css = read('css/studio.css');
  assert.ok(css.includes(':root[data-studio-theme="light"]') && css.includes(':root[data-studio-theme="dark"]'));
  assert.ok(!/#sidebar|\.sb-/.test(css), 'the Admin sidebar keeps its own styling');
  for (const p of ['light', 'dark', 'system']) assert.ok(HTML.includes('data-theme-pref="' + p + '"'), p);
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
