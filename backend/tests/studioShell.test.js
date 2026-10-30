// ============================================================
// studioShell.test.js — Landing Page Studio V3, Phase 2A-2 (visual shell)
// and 2A-3A (Hero editing), static checks on frontend/public/studio.html
// and js/studio/*:
// - default-deny routing: only localhost / 127.0.0.1 / file: run (local
//   mode, no API) and https://qraivy-studio-staging.vercel.app (preview
//   mode, no API); every other address, production included, is blocked;
// - no network: no fetch / XHR / WebSocket / beacon / API address anywhere
//   in the Studio files; no Clerk, no API routing scripts loaded. The one
//   exception (D2): js/studio/studio-deals-data.js, which may send only the
//   three read-only Deals GET requests (allow-list checked below, behaviour
//   in studioDealsData.test.js);
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

test('routing: local, and preview on the one Studio staging address (https only); no API; every other address blocked (default deny)', () => {
  const resolve = routing();
  for (const h of ['localhost', '127.0.0.1', 'LOCALHOST', '[::1]']) assert.deepEqual(resolve(h, 'http:'), { mode: 'local', api: '', blocked: false }, h);
  assert.deepEqual(resolve('', 'file:'), { mode: 'local', api: '', blocked: false });
  assert.deepEqual(resolve('qraivy-studio-staging.vercel.app', 'https:'), { mode: 'preview', api: '', blocked: false });
  assert.deepEqual(resolve('QRAIVY-STUDIO-STAGING.vercel.app', 'https:'), { mode: 'preview', api: '', blocked: false });
  const ctx0 = { window: { location: {} } };
  vm.runInNewContext(read('js/studio/studio-routing.js'), ctx0);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx0.window.QraivyStudioRouting.PREVIEW_HOSTS)), ['qraivy-studio-staging.vercel.app'], 'exactly one preview address');
  for (const h of ['www.qraivy.com', 'qraivy.com', 'api.qraivy.com', 'deals-preview.qraivy.com', 'voice-preview.qraivy.com', 'plan-preview.qraivy.com', 'admin-preview.qraivy.com',
    'qraivy-ai-git-preview-l-3d55c7-adwinscottrussell-5957s-projects.vercel.app', 'qraivy-pb0klf7kc-adwinscottrussell-5957s-projects.vercel.app',
    'qraivy-deals-staging.vercel.app', 'qraivy-voice-staging.vercel.app', 'qraivy-ai.vercel.app',
    // the Studio project's own per-deployment and team addresses, and look-alikes
    'qraivy-studio-staging-lzul4fejl.vercel.app', 'qraivy-studio-staging-adwinscottrussell-5957s-projects.vercel.app',
    'qraivy-studio-staging.vercel.app.evil.example', 'evil-qraivy-studio-staging.vercel.app', 'qraivy-studio-staging.vercel.app.', 'qraivy-studio-staging.vercel.app:443',
    'localhost.evil.example', 'evil-localhost', '127.0.0.1.nip.io', '', undefined]) {
    assert.deepEqual(resolve(h, 'https:'), { mode: 'unavailable', api: '', blocked: true }, String(h));
  }
  for (const p of ['http:', 'file:', '', undefined]) assert.deepEqual(resolve('qraivy-studio-staging.vercel.app', p), { mode: 'unavailable', api: '', blocked: true }, 'preview needs https: ' + p);
  // Deals connection: exactly one connected preview, https only, with the isolated
  // Deals preview API (never production) and the Deal Builder of the same environment
  assert.deepEqual(JSON.parse(JSON.stringify(ctx0.window.QraivyStudioRouting.CONNECTED_HOSTS)), ['studio-preview.qraivy.com'], 'exactly one connected address');
  const connected = { mode: 'preview', api: 'https://qraivy-deals-api-deals-preview.up.railway.app', blocked: false, clerk: 'pk_live_Y2xlcmsucXJhaXZ5LmNvbSQ', builder: 'https://deals-preview.qraivy.com/deals.html' };
  assert.deepEqual(resolve('studio-preview.qraivy.com', 'https:'), connected);
  assert.deepEqual(resolve('STUDIO-PREVIEW.qraivy.com', 'https:'), connected);
  for (const p of ['http:', 'file:', '', undefined]) assert.deepEqual(resolve('studio-preview.qraivy.com', p), { mode: 'unavailable', api: '', blocked: true }, 'connected preview needs https: ' + p);
  for (const h of ['studio-preview.qraivy.com.evil.example', 'evil-studio-preview.qraivy.com', 'x.studio-preview.qraivy.com', 'studio-preview.qraivy.com.', 'studio-preview.qraivy.com:443', 'studio.qraivy.com']) {
    assert.deepEqual(resolve(h, 'https:'), { mode: 'unavailable', api: '', blocked: true }, h);
  }
  const ctx = { window: { location: { hostname: 'www.qraivy.com', protocol: 'https:' } } };
  vm.runInNewContext(read('js/studio/studio-routing.js'), ctx);
  assert.equal(ctx.window.QRAIVY_STUDIO_ROUTING.blocked, true, 'production: the Studio does not start');
});

test('scripts: only the shell, the shared V3 code and the Studio files; no Clerk, no API routing', () => {
  const scripts = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/qraivy-lang.js', 'js/admin-shell.js', 'js/studio/studio-routing.js', 'js/lpV3/core.js', 'js/lpV3/gallery-nav.js', 'js/studio/studio-demo.js',
    'js/studio/studio-demo-images.js', 'js/studio/studio-store.js', 'js/studio/studio-preview.js', 'js/studio/studio-inspector.js',
    // D2: the Deal Builder's starter catalog (plain data) and the read-only Deals data file
    'js/deal-starter-images.js', 'js/studio/studio-deals-data.js',
    // Deals connection: the sign-in loader (loads Clerk on the connected preview only)
    'js/studio/studio-auth.js',
    // Phase A: the owner's own pages, read only (studioPagesData.test.js)
    'js/studio/studio-pages-data.js', 'js/studio/studio-shell.js']);
  assert.ok(!/clerk|api-base\.js|lp-routing\.js|deals-routing\.js|staging-config\.js/i.test(HTML));
  const styles = (HTML.match(/<link\b[^>]*>/g) || []).filter((l) => /rel="stylesheet"/.test(l)).map((l) => l.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(styles, ['https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap', 'dashboard-shell.css', 'css/studio.css']);
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow" \/>/);
});

test('no network in the Studio files (no fetch, XHR, sockets, beacons, imports or API addresses)', () => {
  for (const f of ['studio.html'].concat(STUDIO_JS)) {
    let src = read(f);
    // the routing file names the one preview address it accepts (a hostname
    // it compares, never a URL it calls); no other Vercel address anywhere
    if (f === 'js/studio/studio-routing.js') {
      // its only addresses: the connected preview's API and Deal Builder (studioDealsConnection.test.js)
      assert.deepEqual(src.match(/https?:\/\/[^'\s]*/g), ['https://qraivy-deals-api-deals-preview.up.railway.app', 'https://deals-preview.qraivy.com/deals.html'], 'the routing file names exactly the connected addresses');
      src = src.split('qraivy-studio-staging.vercel.app').join('').split('https://qraivy-deals-api-deals-preview.up.railway.app').join('');
    }
    for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/, /serviceWorker/, /api\.qraivy\.com/, /railway\.app/, /\.vercel\.app/]) {
      assert.ok(!re.test(src), f + ' must not contain ' + re);
    }
    // the request itself is made only in the Deals data file (it calls the browser's fetch through doFetch)
    // ... and, since Phase A, in the pages data file: only the two Studio page GET requests (studioPagesData.test.js), never a Deals endpoint
    if (f === 'js/studio/studio-pages-data.js') assert.ok(!/'\/deals/.test(src), f + ': no Deals endpoint');
    else if (f !== 'js/studio/studio-deals-data.js') assert.ok(!/\bdoFetch\b|\.fetch\b|'\/deals/.test(src), f + ': no request, no Deals endpoint');
  }
  // the starter catalog the Studio now loads is plain data
  const catalog = read('js/deal-starter-images.js');
  for (const re of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /\bimport\s*\(/]) assert.ok(!re.test(catalog), 'deal-starter-images.js must not contain ' + re);
});

test('D2: the one Studio file with requests sends only the three read-only Deals GET requests (allow-list)', () => {
  const src = read('js/studio/studio-deals-data.js');
  const c = code('js/studio/studio-deals-data.js');
  const DD = require('../../frontend/public/js/studio/studio-deals-data.js');
  // exactly these endpoints, nothing else
  assert.deepEqual(JSON.parse(JSON.stringify(DD.PATHS)), { access: '/deals/access', pages: '/deals/pages', deals: '/deals' });
  assert.deepEqual(DD.ALLOWED, ['/deals/access', '/deals/pages', '/deals']);
  assert.deepEqual([...new Set(c.match(/'\/[^']*'/g))].sort(), ["'/deals'", "'/deals/access'", "'/deals/pages'"], 'no other path in the code');
  assert.ok(c.includes('if (ALLOWED.indexOf(path) === -1) return Promise.reject('), 'any other path is refused before a request');
  // one request site, GET only, no body, no cookies, no redirects
  assert.equal((c.match(/doFetch\(/g) || []).length, 1, 'one request site');
  assert.ok(c.includes('return doFetch(api + path, init)'));
  assert.ok(c.includes("var init = { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' };"));
  assert.ok(!/'(POST|PUT|PATCH|DELETE|HEAD|OPTIONS)'|\bbody\s*:|FormData|keepalive/i.test(c), 'GET only, never a body');
  assert.ok(c.includes("var doFetch = typeof o.fetch === 'function' ? o.fetch : typeof root.fetch === 'function' ? root.fetch.bind(root) : null;"));
  // the API origin is checked; the only address written in the file is the starter images' Cloudinary folder
  // (read from the source: the comment filter would cut a line at "//")
  assert.deepEqual(src.match(/'https?:\/\/[^']*'/g), ["'https://res.cloudinary.com/dwqc6n7rn/image/upload/c_fill,g_auto,h_600,w_800,f_auto,q_auto/qraivy-deal-starters/'"]);
  assert.ok(c.includes("var api = typeof o.api === 'string' && API.test(o.api) ? o.api : '';"), 'only an API origin from the routing, checked');
  for (const re of [/XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/, /serviceWorker/, /postMessage/, /localStorage|sessionStorage|document\.cookie/, /\beval\s*\(|new\s+Function/]) {
    assert.ok(!re.test(c), 'studio-deals-data.js must not contain ' + re);
  }
  assert.match(src, /Only the Studio shell calls\s+\* this file, never the sandboxed preview frames/);
  // only the shell uses it, with the routing's API address and the Clerk session token; the frames never
  const shell = code('js/studio/studio-shell.js');
  assert.ok(shell.includes("if (DEALS) dealsData = DEALS.createDealsData({ api: ROUTING.api, getToken: clerkToken, starters: (window.QRAIVY_DEAL_STARTER_IMAGES || {}).images });"));
  assert.ok(shell.includes("return c && c.session && typeof c.session.getToken === 'function' ? c.session.getToken() : null;"));
  for (const f of STUDIO_JS.filter((x) => x !== 'js/studio/studio-deals-data.js' && x !== 'js/studio/studio-shell.js')) assert.ok(!/QraivyStudioDeals|createDealsData/.test(code(f)), f);
  const PV = require('../../frontend/public/js/studio/studio-preview.js');
  assert.ok(!/fetch|deals/i.test(PV.FRAME_SCRIPT), 'the frames request nothing');
  // and in this phase no address has an API: no request is ever sent from a real Studio address
  assert.ok(!/clerk/i.test(HTML), 'no Clerk on the Studio page yet');
});

test('Save Draft and Publish start disabled; Publish is never enabled, Save Draft only by the shell (Phase B); Undo / Redo start disabled; the overflow menu only has disabled items', () => {
  assert.match(HTML, /<button type="button" class="st-btn st-btn--outline" id="st-save-btn" disabled aria-disabled="true"/);
  // Phase C.1: Publish is a muted, locked button that says "Coming soon"; still disabled
  assert.ok(HTML.includes('<button type="button" class="st-btn st-btn--locked" id="st-publish-btn" disabled aria-disabled="true" data-st-title="publish_disabled" aria-describedby="st-publish-soon"><svg class="st-ic" aria-hidden="true"><use href="#st-lock"/></svg><span class="st-locked__text"><span data-st="publish">Publish</span><small id="st-publish-soon" data-st="coming_soon">Coming soon</small></span></button>'));
  assert.match(HTML, /<button type="button" class="st-iconbtn" id="st-undo-btn" disabled data-st-aria="undo" /);
  assert.match(HTML, /<button type="button" class="st-iconbtn" id="st-redo-btn" disabled data-st-aria="redo" /);
  // the "⋯" menu: the three theme choices, a note about publishing, and only disabled items otherwise
  const menuStart = HTML.indexOf('id="st-more-menu"'), menu = HTML.slice(menuStart, HTML.indexOf('<p class="st-menu__note"', menuStart));
  const buttons = menu.match(/<button [^>]*>/g) || [];
  assert.equal(buttons.filter((b) => /data-theme-pref=/.test(b)).length, 3, 'theme choices');
  assert.deepEqual(buttons.filter((b) => !/data-theme-pref=/.test(b)).map((b) => /\sdisabled[\s>]/.test(b)), [true, true, true], 'every other item disabled');
  assert.ok(menu.includes('data-st="publish_note"'), 'the publishing note');
  for (const f of STUDIO_JS) assert.ok(!/st-publish-btn/.test(read(f)), f + ' never touches Publish');
  for (const f of STUDIO_JS.filter((x) => x !== 'js/studio/studio-shell.js')) assert.ok(!/st-save-btn/.test(read(f)), f + ' never touches Save Draft');
  const shell = read('js/studio/studio-shell.js');
  // Save Draft is enabled only by canSave(): one of the owner’s pages open, unsaved, valid, no save running
  assert.ok(shell.includes('function canSave() { return ownerPageOpen() && !saveView.busy && editor.dirty() && editor.isValid(); }'));
  assert.ok(shell.includes("var btn = $('st-save-btn'), ok = canSave();") && shell.includes('btn.disabled = !ok;'));
  assert.equal((shell.match(/st-save-btn/g) || []).length, 3, 'set in renderSave, bound once, focused after Keep editing');
});

const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // code, not comments
test('preview frames: sandbox "allow-scripts" only (never same origin); the full-size preview: no permissions', () => {
  assert.match(HTML, /<iframe class="st-full__frame" id="st-full-frame" sandbox="" title="Preview" referrerpolicy="no-referrer"><\/iframe>/);
  const pv = read('js/studio/studio-preview.js');
  assert.ok(pv.includes("var SANDBOX = 'allow-scripts';") && pv.includes("ifr.setAttribute('sandbox', SANDBOX);"));
  assert.ok(!/allow-same-origin/.test(HTML + STUDIO_JS.map(code).join('')));
  assert.equal((HTML.match(/<iframe/g) || []).length, 1, 'only the full-size preview is in the page; frames come from studio-preview.js');
  const shell = read('js/studio/studio-shell.js');
  assert.ok(shell.includes('{ preview: true, deals: dealsView }'), 'rendered by the shared core in preview mode (with the Deals preview state, D2)');
  assert.ok(shell.includes("$('st-full-frame').srcdoc = pageHtml();"), 'the full-size preview gets the plain page, no Studio script');
});

test('D2: the Hero, the Buttons, Social Media, Contact, Opening Hours, Products, Text, Gallery and Deals / Offers are editable; the shell builds no form controls itself; sections are added, moved, duplicated and removed through the store (Phase C); no templates or drag and drop yet', () => {
  assert.deepEqual(require('../../frontend/public/js/studio/studio-inspector.js').EDITABLE, ['hero', 'buttons', 'socialMedia', 'contact', 'openingHours', 'products', 'text', 'gallery', 'dealsOffers']);
  // the approved notice while anything is invalid, in English and German
  assert.match(HTML, /<p class="st-stale" id="st-stale" role="status" hidden>.*<span data-st="preview_stale">Preview shows the last valid version\. Fix the highlighted field\.<\/span><\/p>/);
  assert.ok(read('js/studio/studio-shell.js').includes("preview_stale: 'Die Vorschau zeigt die letzte gültige Version. Korrigiere das markierte Feld.'"));
  const shell = code('js/studio/studio-shell.js');
  assert.ok(!/el\('(input|textarea|select)'/.test(shell), 'every control comes from studio-inspector.js');
  // Phase C: one section system, the store's commands; the shell only calls them
  const store = code('js/studio/studio-store.js');
  for (const fn of ['addSection', 'removeSection', 'moveSection', 'duplicateSection']) {
    assert.ok(store.includes(fn + ': function'), 'store: ' + fn);
    assert.ok(shell.includes('editor.' + fn + '('), 'shell calls editor.' + fn);
  }
  assert.ok(!/\.splice\(|sections\.push|pages\[0\]\.sections\s*=/.test(shell), 'the shell never changes the section list itself');
  assert.ok(!/applyTemplate|draggable|dragstart|ondrop|dataTransfer/.test(shell + store), 'no templates, no drag and drop');
  assert.ok(shell.includes("var COMING_SOON = ['loyalty'];"), 'Loyalty: shown, not addable yet');
  assert.ok(read('js/studio/studio-shell.js').includes("lib_soon: 'Demnächst verfügbar'") && read('js/studio/studio-shell.js').includes("lib_soon: 'Coming soon'"));
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

test('demo: the Local Business layout, valid, placeholder content only (no customer branding; the only photos are the three approved starter images, 2A-3H)', () => {
  const ctx = { window: {} };
  vm.runInNewContext(read('js/studio/studio-demo.js'), ctx);
  const demo = ctx.window.QRAIVY_STUDIO_DEMO;
  const V3 = require('../src/lpV3/core');
  const v = V3.validateDesign(JSON.parse(JSON.stringify(demo.design)));
  assert.ok(v.ok, JSON.stringify(v.errors));
  const DEMO_IMAGES = require('../../frontend/public/js/studio/studio-demo-images.js');
  const starters = DEMO_IMAGES.STARTERS.map(DEMO_IMAGES.cloudinaryUrl);
  const gal = demo.design.pages[0].sections.filter((s) => s.type === 'gallery');
  assert.equal(gal.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(gal[0].data.images.map((i) => i.image))), starters, 'the gallery shows exactly the starter images');
  let text = JSON.stringify(demo);
  assert.ok(!/staib/i.test(text), 'no Bäckerei Staib branding');
  for (const u of starters) text = text.split(u).join('');
  assert.ok(!/res\.cloudinary\.com|https?:\/\/[^"]*\.(?:jpe?g|png|webp)/i.test(text), 'no other photos');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.design.pages[0].sections.map((s) => s.type))),['hero', 'buttons', 'dealsOffers', 'loyalty', 'products', 'text', 'gallery', 'openingHours', 'contact', 'socialMedia']);
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
