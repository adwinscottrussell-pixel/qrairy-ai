// ============================================================
// studioOnboarding.test.js — Landing Page Studio V3 onboarding, Phase O0
// (the wizard frame and Step 1), static and pure checks:
// - it starts only on the isolated Studio V3 staging address (routing
//   isolated, the staging API and the Clerk development key); every other
//   address, production included, gets the notice;
// - the wizard opens only for a signed-in user with a verified email;
// - Step 1: Instagram and Website cannot be chosen, Start from Scratch
//   leads to Step 2; Steps 2-4 are placeholders (no field, no draft);
// - no request in Phase O0: no fetch / XHR / beacon, no API path, no
//   payment or trial call; the page loads only the language file, the
//   routing, the sign-in loader and its own script; no Admin sidebar;
// - English and German have the same texts;
// - the Studio's entry point exists on the isolated staging address only.
// Behaviour in the browser: studioOnboarding.browser.test.js.
// Run: node tests/studioOnboarding.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');
const OB = require('../../frontend/public/js/studio/onboarding-shell.js');
const HTML = read('studio-onboarding.html');
const SRC = read('js/studio/onboarding-shell.js');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function routing(host, protocol = 'https:') {
  const ctx = { window: { location: { hostname: host, protocol } } };
  vm.runInNewContext(read('js/studio/studio-routing.js'), ctx);
  return JSON.parse(JSON.stringify(ctx.window.QRAIVY_STUDIO_ROUTING));
}

test('starts only on the isolated Studio V3 staging address; every other address gets the notice', () => {
  assert.equal(OB.canStart(routing('qraivy-studio-v3-staging.vercel.app')), true);
  for (const h of ['www.qraivy.com', 'qraivy.com', 'studio-preview.qraivy.com', 'qraivy-studio-staging.vercel.app', 'localhost', '127.0.0.1',
    'qraivy-studio-v3-staging-8p5n97clr.vercel.app', 'evil-qraivy-studio-v3-staging.vercel.app', 'qraivy-studio-v3-staging.vercel.app.evil.example', 'admin-preview.qraivy.com']) {
    assert.equal(OB.canStart(routing(h)), false, h);
  }
  assert.equal(OB.canStart(routing('qraivy-studio-v3-staging.vercel.app', 'http:')), false, 'https only');
  assert.equal(OB.canStart(null), false);
  assert.equal(OB.canStart({ blocked: false, isolated: true, api: '', clerk: 'pk_test_x' }), false, 'no API: no start');
  assert.equal(OB.canStart({ blocked: false, isolated: true, api: 'https://x.example', clerk: '' }), false, 'no sign-in: no start');
  assert.equal(OB.canStart({ blocked: true, isolated: true, api: 'https://x.example', clerk: 'pk_test_x' }), false);
});

test('the wizard opens only for a signed-in user with a verified primary email', () => {
  const user = (status) => ({ session: { id: 's' }, user: { primaryEmailAddress: status === undefined ? null : { verification: { status } } } });
  assert.equal(OB.authState(null), 'error', 'the sign-in could not be loaded');
  assert.equal(OB.authState({ session: null, user: null }), 'signedout');
  assert.equal(OB.authState({ session: { id: 's' }, user: null }), 'signedout');
  assert.equal(OB.authState({ session: null, user: user('verified').user }), 'signedout');
  assert.equal(OB.authState(user('verified')), 'ready');
  for (const s of ['unverified', 'expired', 'failed', 'transferable', '', 'VERIFIED', true, undefined]) assert.equal(OB.authState(user(s)), 'unverified', String(s));
  assert.equal(OB.authState({ session: { id: 's' }, user: { primaryEmailAddress: { verification: null } } }), 'unverified');
});

test('Step 1: Instagram and Website cannot be chosen; Start from Scratch leads on; four steps, Steps 2-4 cannot finish', () => {
  assert.deepEqual(OB.STEPS, ['start', 'business', 'sections', 'review']);
  assert.deepEqual(OB.OPTIONS, [{ id: 'instagram', available: false }, { id: 'website', available: false }, { id: 'scratch', available: true }]);
  let s = { step: 0, choice: null };
  assert.equal(OB.canNext(s), false, 'nothing chosen: no Next');
  for (const id of ['instagram', 'website', 'other', '']) { assert.equal(OB.choose(s, id), s, id + ' cannot be chosen'); }
  s = OB.choose(s, 'scratch');
  assert.deepEqual(s, { step: 0, choice: 'scratch' });
  assert.equal(OB.canNext(s), true);
  s = OB.next(s); assert.equal(s.step, 1);
  s = OB.next(s); assert.equal(s.step, 2);
  s = OB.next(s); assert.equal(s.step, 3);
  assert.equal(OB.canNext(s), false, 'the last step has no Next');
  assert.equal(OB.next(s), s);
  s = OB.back(OB.back(OB.back(s)));
  assert.deepEqual(s, { step: 0, choice: 'scratch' }, 'Back keeps the choice');
  assert.equal(OB.back(s), s, 'no Back before Step 1');
});

test('page: no Admin sidebar, no Studio controls; only the language file, the routing, the sign-in loader and its own script', () => {
  const scripts = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/qraivy-lang.js', 'js/studio/studio-routing.js', 'js/studio/studio-auth.js', 'js/studio/onboarding-shell.js']);
  assert.equal((HTML.match(/<script\b/g) || []).length, 4, 'no inline script');
  const styles = (HTML.match(/<link\b[^>]*>/g) || []).filter((l) => /rel="stylesheet"/.test(l)).map((l) => l.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(styles, ['https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap', 'css/studio-onboarding.css']);
  for (const re of [/id="sidebar"/, /sb-item/, /admin-shell/, /dashboard-shell/, /st-save-btn|st-publish-btn|st-inspector|st-canvas/, /<iframe/, /<form\b/, /<input\b/, /clerk/i]) assert.ok(!re.test(HTML), String(re));
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow" \/>/);
  // the header logo: the approved file, at its own proportions (square, 1254 x 1254), the only image
  assert.deepEqual([...HTML.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]), ['<img class="ob-brand__logo" src="images/qraivy-onboarding-logo.jpg" width="1254" height="1254" alt="QRAIVY" decoding="async" />']);
  const logo = fs.readFileSync(path.join(PUB, 'images', 'qraivy-onboarding-logo.jpg'));
  assert.equal(require('crypto').createHash('sha256').update(logo).digest('hex').slice(0, 16), '3b92407982102bd6', 'the approved logo file, unchanged');
  assert.ok(logo[0] === 0xff && logo[1] === 0xd8, 'a JPEG');
  const css = read('css/studio-onboarding.css');
  assert.ok(css.includes('.ob-brand__logo { display: block; height: 40px; width: auto; aspect-ratio: 1 / 1; object-fit: contain; }'), 'height only: never stretched');
  // the only link: back to the Studio (in the same upload)
  assert.deepEqual([...HTML.matchAll(/\shref="([^"#][^"]*)"/g)].map((m) => m[1]).filter((h) => !/^https:\/\/fonts\.googleapis\.com/.test(h) && !h.endsWith('.css')), ['studio.html']);
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], 'unique ids');
});

test('Step 1 markup: three cards, Instagram and Website disabled with "Coming soon"; Steps 2-4 placeholders only', () => {
  const cards = [...HTML.matchAll(/<button type="button" class="ob-option"[^>]*>/g)].map((m) => m[0]);
  assert.equal(cards.length, 3);
  assert.match(cards[0], /data-option="instagram" disabled aria-disabled="true"/);
  assert.match(cards[1], /data-option="website" disabled aria-disabled="true"/);
  assert.ok(/data-option="scratch"/.test(cards[2]) && !/disabled/.test(cards[2]));
  assert.equal((HTML.match(/data-ob="soon"/g) || []).length, 2, 'two "Coming soon" badges');
  assert.match(HTML, /<button type="button" class="ob-btn ob-btn--primary" id="ob-finish" hidden disabled data-ob="finish_soon">/, 'no working finish button');
  for (const n of [1, 2, 3]) {
    const step = HTML.slice(HTML.indexOf('id="ob-step-' + n + '"'), HTML.indexOf('</div>\n      </div>', HTML.indexOf('id="ob-step-' + n + '"')));
    assert.ok(!/<input|<textarea|<select|<button/.test(step), 'step ' + (n + 1) + ' collects nothing');
  }
});

test('no request in Phase O0: no fetch, XHR, sockets, beacons, storage writes, API paths, payment or trial calls', () => {
  const c = code(SRC);
  for (const re of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/, /localStorage|sessionStorage|document\.cookie/, /getToken/,
    /\/studio\/|\/deals|\/lp\b|\/stripe|\/billing|\/checkout|\/trial|\/api\//, /https?:\/\//, /railway\.app|vercel\.app|qraivy\.com/, /\beval\s*\(|new\s+Function|toString\s*\(/, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
    /createElement\('script'\)/]) {
    assert.ok(!re.test(c), 'onboarding-shell.js must not contain ' + re);
  }
  // the language is the shared setting (qraivy-lang.js setQraivyLang), never written here directly
  assert.ok(c.includes('win.setQraivyLang(current)'));
  // the sign-in comes from studio-auth.js only, created only after canStart
  assert.equal((c.match(/createAuth\(/g) || []).length, 1);
  assert.ok(c.indexOf('if (!canStart(ROUTING)) return;') < c.indexOf('createAuth('), 'no sign-in before the address is checked');
});

test('English and German: the same texts, none empty', () => {
  assert.deepEqual(Object.keys(OB.TX.de).sort(), Object.keys(OB.TX.en).sort());
  for (const l of ['en', 'de']) for (const [k, v] of Object.entries(OB.TX[l])) assert.ok(typeof v === 'string' && v.trim(), l + '.' + k);
  const keys = [...HTML.matchAll(/data-ob(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  for (const k of keys) assert.ok(Object.prototype.hasOwnProperty.call(OB.TX.en, k), 'text for ' + k);
  assert.equal(OB.TX.en.opt_instagram_text, 'Start with your Instagram profile.');
  assert.equal(OB.TX.en.opt_website, 'Existing Website');
  assert.equal(OB.TX.en.opt_website_text, 'Bring your existing website into QRAIVY.');
  assert.equal(OB.TX.en.opt_scratch, 'Start from Scratch');
  assert.equal(OB.TX.en.opt_scratch_text, 'Build your landing page your way.');
  assert.equal(OB.TX.en.soon, 'Coming soon');
  assert.equal(OB.TX.en.step_of, 'Step {n} of {total}');
});

test('the sign-in loader adds Clerk\'s own sign-up and nothing else', () => {
  const AUTH = require('../../frontend/public/js/studio/studio-auth.js');
  delete globalThis.Clerk;
  const none = AUTH.createAuth({ routing: { mode: 'local', api: '', blocked: false }, document: { head: { appendChild: () => { throw new Error('no script'); } } } });
  assert.equal(none.signUp(), false, 'no Clerk: no sign-up');
  let opened = 0;
  globalThis.Clerk = { openSignUp: () => { opened++; } };
  assert.equal(none.signUp(), true);
  assert.equal(opened, 1);
  delete globalThis.Clerk;
});

test('the Studio\'s entry point: in the empty state, on the isolated staging address only (removed everywhere else)', () => {
  const studio = read('studio.html');
  assert.match(studio, /<a class="st-pagebar__btn st-pagebar__btn--primary" id="st-page-onboard" href="studio-onboarding.html" hidden data-st="page_onboard">Create your first page<\/a>/);
  const shell = read('js/studio/studio-shell.js');
  assert.ok(shell.includes("if (onboard && !ROUTING.isolated) onboard.parentNode.removeChild(onboard);"));
  const start = shell.slice(shell.indexOf('  function start() {'));
  assert.ok(start.indexOf('removeChild(onboard)') < start.indexOf('if (ROUTING.blocked'), 'removed before anything else, also where the Studio does not start');
  assert.ok(shell.includes("if ($('st-page-onboard')) $('st-page-onboard').hidden = st !== 'empty';"));
  assert.ok(shell.includes("page_onboard: 'Create your first page'") && shell.includes("page_onboard: 'Erste Seite erstellen'"));
});

(async () => {
  let passed = 0, failed = 0;
  console.log('studioOnboarding');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
