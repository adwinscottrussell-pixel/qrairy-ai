// ============================================================
// studioDealsConnection.test.js — the Studio's Deals / Offers preview
// connected to the real Deal Builder on the one connected preview address
// (studio-preview.qraivy.com -> the isolated Deals preview API).
//
// Checked: the sign-in (Clerk) is loaded by studio-auth.js only, only there,
// from the one address deals.html uses; everywhere else nothing is loaded
// and nothing is sent; the shell asks for the deals only once the sign-in is
// known; the inspector offers the sign-in in that state; the Deals section
// still stores display settings only; the public page still skips it; the
// D2 layout (3 cards, one per row on phones) is unchanged.
// The owner endpoints themselves (scoping, visibility rules, zero writes)
// are covered by studioDealsPreview.browser.test.js and deal*.test.js.
//
// Run: node tests/studioDealsConnection.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const AUTH = require('../../frontend/public/js/studio/studio-auth.js');
const V3 = require('../src/lpV3/core.js');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const CONNECTED = { mode: 'preview', api: 'https://qraivy-deals-api-deals-preview.up.railway.app', blocked: false, clerk: 'pk_live_Y2xlcmsucXJhaXZ5LmNvbSQ', builder: 'https://deals-preview.qraivy.com/deals.html' };
function fakeDocument() {
  const added = [];
  return { added, head: { appendChild: (s) => added.push(s) }, createElement: (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('no connected address (local, the Studio staging site): nothing is loaded, the sign-in is "none"', async () => {
  delete globalThis.Clerk;
  for (const routing of [{ mode: 'local', api: '', blocked: false }, { mode: 'preview', api: '', blocked: false }, { mode: 'preview', api: '', blocked: false, clerk: CONNECTED.clerk }]) {
    const doc = fakeDocument();
    const a = AUTH.createAuth({ routing, document: doc });
    assert.equal(await a.ready(), null);
    assert.deepEqual(doc.added, [], 'no script');
    assert.equal(a.signIn(), false, 'no sign-in offered');
  }
});

test('connected preview: exactly one script, the Clerk bundle deals.html uses, with the public key; ready once Clerk has loaded', async () => {
  delete globalThis.Clerk;
  const doc = fakeDocument();
  const a = AUTH.createAuth({ routing: CONNECTED, document: doc });
  const p = a.ready();
  assert.equal(a.ready(), p, 'loaded once');
  assert.equal(doc.added.length, 1);
  const s = doc.added[0];
  assert.equal(s.tag, 'script');
  assert.equal(s.src, 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js');
  assert.equal(s.attrs['data-clerk-publishable-key'], CONNECTED.clerk);
  assert.ok(read('deals.html').includes('data-clerk-publishable-key="' + CONNECTED.clerk + '"') && read('deals.html').includes('src="' + AUTH.CLERK_SRC + '"'), 'the same key and address as the Deal Builder');
  let loads = 0;
  const clerk = { loaded: false, load: async () => { loads++; clerk.loaded = true; }, session: { id: 'sess_1', getToken: async () => 'tok' }, openSignIn: () => { clerk.opened = true; } };
  globalThis.Clerk = clerk;
  s.onload();
  assert.equal(await p, clerk);
  assert.equal(loads, 1);
  assert.equal(a.signIn(), true);
  assert.equal(clerk.opened, true, "Clerk's own sign-in");
  delete globalThis.Clerk;
});

test('the sign-in cannot be loaded: "none" (never an error that shows samples); a bad key or no API loads nothing', async () => {
  delete globalThis.Clerk;
  const doc = fakeDocument();
  const a = AUTH.createAuth({ routing: CONNECTED, document: doc });
  const p = a.ready();
  doc.added[0].onerror();
  assert.equal(await p, null);
  for (const routing of [{ ...CONNECTED, clerk: 'sk_live_secret' }, { ...CONNECTED, clerk: 'pk_live_x"><script>' }, { ...CONNECTED, api: '' }]) {
    const d = fakeDocument();
    assert.equal(await AUTH.createAuth({ routing, document: d }).ready(), null);
    assert.deepEqual(d.added, []);
  }
});

test('a Clerk already on the page is used as it is (no script), and a new sign-in reloads the deals', async () => {
  const listeners = [];
  globalThis.Clerk = { session: { id: 'a', getToken: async () => 't' }, addListener: (fn) => listeners.push(fn) };
  const doc = fakeDocument();
  const a = AUTH.createAuth({ routing: { mode: 'local', api: 'http://127.0.0.1:1', blocked: false }, document: doc });
  assert.equal(await a.ready(), globalThis.Clerk);
  assert.deepEqual(doc.added, []);
  let reloads = 0;
  a.onChange(() => { reloads++; });
  await tick();
  listeners[0]({ session: { id: 'a' } });
  assert.equal(reloads, 0, 'same session: nothing');
  listeners[0]({ session: { id: 'b' } });
  listeners[0]({ session: null });
  assert.equal(reloads, 2);
  delete globalThis.Clerk;
});

test('studio-auth.js: the only Studio file that adds a script; one address; no request, storage or deal access', () => {
  const src = read('js/studio/studio-auth.js');
  assert.deepEqual(src.match(/https?:\/\/[^'\s]*/g), [AUTH.CLERK_SRC]);
  assert.equal((src.match(/createElement\('script'\)/g) || []).length, 1);
  for (const re of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /\bimport\s*\(/, /localStorage|sessionStorage|document\.cookie/, /'\/deals/, /\beval\s*\(|new\s+Function/]) assert.ok(!re.test(src), re);
  for (const f of fs.readdirSync(path.join(PUB, 'js', 'studio')).filter((x) => x !== 'studio-auth.js')) assert.ok(!/createElement\('script'\)|clerk\.browser/i.test(read('js/studio/' + f)), f);
  assert.ok(!/clerk/i.test(read('studio.html')), 'no Clerk tag in the page itself');
});

test('shell: the deals are asked for once the sign-in is known, only when connected; the inspector gets the sign-in and the Deal Builder address', () => {
  const shell = read('js/studio/studio-shell.js');
  assert.ok(shell.includes("var AUTH = window.QraivyStudioAuth ? window.QraivyStudioAuth.createAuth({ routing: ROUTING }) : null;"));
  const start = shell.slice(shell.indexOf('function startDeals()'), shell.indexOf('function selectDealsPage'));
  assert.ok(start.includes('if (!dealsData || !dealsData.connected()) return;'));
  assert.ok(start.includes('(AUTH ? AUTH.ready() : Promise.resolve()).then(loadDeals);'));
  assert.ok(start.includes('if (AUTH) AUTH.onChange(loadDeals);'));
  // start() itself (Phase A: showSample() reloads the deals for the current sign-in, outside start())
  const startFn = shell.slice(shell.indexOf('  function start() {'), shell.indexOf('\n  }\n', shell.indexOf('  function start() {')));
  assert.ok(startFn.includes('    startDeals();\n') && !/\n {4}loadDeals\(\);\n/.test(startFn), 'start() uses startDeals');
  assert.ok(shell.includes("signIn: function () { return !!(AUTH && AUTH.signIn()); }, dealBuilder: ROUTING.builder || 'deals.html' });"));
});

test('inspector: in the sign-in state a Sign in button (and Try again); elsewhere hidden; texts in both languages', () => {
  const INSP = require('../../frontend/public/js/studio/studio-inspector.js');
  assert.equal(INSP.TX.en.deals_signin, 'Sign in');
  assert.equal(INSP.TX.de.deals_signin, 'Anmelden');
  const src = read('js/studio/studio-inspector.js');
  const block = src.slice(src.indexOf('function dealsSourceControl'), src.indexOf('function controlFor'));
  assert.ok(block.includes("retry.hidden = state !== 'error' && state !== 'signin';"));
  assert.ok(block.includes("signin.hidden = state !== 'signin' || !o.signIn;"));
  assert.ok(block.includes("signin.addEventListener('click', function () { if (o.signIn) o.signIn(); });"));
});

test('one source of truth: the Deals section stores display settings only; deal content never enters the design', () => {
  const spec = V3.describe().sections.dealsOffers;
  assert.deepEqual(Object.keys(spec.data.fields), ['title', 'subtitle', 'maxItems', 'showAllText', 'showAllTarget'], 'display settings only');
  // deal content handed to a stored design is refused, never kept
  const withContent = { schemaVersion: 1, settings: { language: 'de' }, pages: [{ id: 'start', sections: [{ id: 's_deals01', type: 'dealsOffers', variant: 'cards', data: { title: 'Angebote', offerText: '-10%', dealId: 'd1' } }] }] };
  const v = V3.validateDesign(withContent);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /offerText/.test(e.path)) && v.errors.some((e) => /dealId/.test(e.path)), JSON.stringify(v.errors));
});

test('the public page still skips Deals / Offers, also when real deals are handed in; the D2 layout is unchanged', () => {
  const design = { schemaVersion: 1, settings: { language: 'de' }, pages: [{ id: 'start', sections: [{ id: 's_deals01', type: 'dealsOffers', variant: 'cards', data: { title: 'Angebote' } }] }] };
  const deals = { state: 'live', pages: [], page: 'x', items: [{ title: 'REAL DEAL', offerText: '-10%', description: '', endsAt: '', image: null }], withheld: 0 };
  const pub = V3.renderDesign(design, { businessName: 'X' }, { deals });
  assert.equal(pub.ok, true, JSON.stringify(pub.errors));
  assert.deepEqual(pub.skipped, ['dealsOffers']);
  assert.ok(!pub.html.includes('REAL DEAL'));
  const pv = V3.renderDesign(design, { businessName: 'X' }, { preview: true, deals });
  assert.ok(pv.html.includes('REAL DEAL') && pv.html.includes('v3-deals-live'), 'the Studio preview shows it');
  assert.equal(V3.describe().sections.dealsOffers.rendered, false);
  for (const f of [path.join(__dirname, '..', 'src', 'lpV3', 'core.js'), path.join(PUB, 'js', 'lpV3', 'core.js')]) {
    assert.ok(fs.readFileSync(f, 'utf8').includes("'@media (max-width:767px){.v3-dealsOffers .v3-prods-grid{grid-template-columns:1fr}}'"), 'one card per row on phones: ' + f);
  }
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'src', 'lpV3', 'core.js'), 'utf8'), read('js/lpV3/core.js'), 'core.js copies identical');
});

(async () => {
  let passed = 0, failed = 0;
  console.log('studioDealsConnection');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
