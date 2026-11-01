// ============================================================
// studioOnboarding.test.js — Landing Page Studio V3 onboarding, Phases O0
// and O1 (the wizard frame, Step 1, Step 2), static and pure checks:
// - it starts only on the isolated Studio V3 staging address (routing
//   isolated, the staging API and the Clerk development key); every other
//   address, production included, gets the notice;
// - the wizard opens only for a signed-in user with a verified email;
// - Step 1: Instagram and Website cannot be chosen, Start from Scratch
//   leads to Step 2; Steps 3-4 are placeholders (no field, no draft);
// - Step 2 (O1, onboarding-model.js): name required (80), description
//   (300), up to 8 social links on each platform's own domains (core.js
//   rules), the page they make, errors mapped to the fields; the progress
//   kept per user (hash key) and checked when restored; logo "Coming soon";
// - no request: no fetch / XHR / beacon, no API path, no payment or trial
//   call; storage only this tab's sessionStorage under the per-user key;
//   the page loads only the language file, the routing, the sign-in loader,
//   the renderer and its own scripts; no Admin sidebar;
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

test('Step 1: Instagram and Website cannot be chosen; Start from Scratch leads on; Step 2 only with valid answers; four steps, none can finish', () => {
  assert.deepEqual(OB.STEPS, ['start', 'business', 'sections', 'review']);
  assert.deepEqual(OB.OPTIONS, [{ id: 'instagram', available: false }, { id: 'website', available: false }, { id: 'scratch', available: true }]);
  let s = { step: 0, choice: null };
  assert.equal(OB.canNext(s), false, 'nothing chosen: no Next');
  for (const id of ['instagram', 'website', 'other', '']) { assert.equal(OB.choose(s, id), s, id + ' cannot be chosen'); }
  s = OB.choose(s, 'scratch');
  assert.deepEqual(s, { step: 0, choice: 'scratch' });
  assert.equal(OB.canNext(s), true);
  s = OB.next(s); assert.equal(s.step, 1);
  assert.equal(OB.next(s, false), s, 'Step 2: invalid answers, no Next');
  assert.equal(OB.canNext(s), true, 'Step 2: Next can be tried (it shows the errors)');
  s = OB.next(s, true); assert.equal(s.step, 2);
  s = OB.next(s); assert.equal(s.step, 3);
  assert.equal(OB.canNext(s), false, 'the last step has no Next');
  assert.equal(OB.next(s), s);
  s = OB.back(OB.back(OB.back(s)));
  assert.deepEqual(s, { step: 0, choice: 'scratch' }, 'Back keeps the choice');
  assert.equal(OB.back(s), s, 'no Back before Step 1');
});

test('page: no Admin sidebar, no Studio controls; the language file, the routing, the sign-in loader, the shared renderer with the demo (O0.1) and its own scripts', () => {
  const scripts = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/qraivy-lang.js', 'js/studio/studio-routing.js', 'js/studio/studio-auth.js',
    'js/lpV3/core.js', 'js/studio/studio-demo.js', 'js/studio/studio-demo-images.js', 'js/studio/onboarding-previews.js', 'js/studio/onboarding-model.js', 'js/studio/onboarding-shell.js']);
  assert.equal((HTML.match(/<script\b/g) || []).length, 9, 'no inline script');
  const styles = (HTML.match(/<link\b[^>]*>/g) || []).filter((l) => /rel="stylesheet"/.test(l)).map((l) => l.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(styles, ['https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap', 'css/studio-onboarding.css']);
  // no form that could be submitted anywhere, no file input (the logo upload is "Coming soon")
  for (const re of [/id="sidebar"/, /sb-item/, /admin-shell/, /dashboard-shell/, /st-save-btn|st-publish-btn|st-inspector|st-canvas/, /<form\b/, /type="file"/, /\baction=/, /clerk/i]) assert.ok(!re.test(HTML), String(re));
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow" \/>/);
  // O0.1: three preview frames, O1: the live preview, sandboxed with no permissions; O2: Step 3's live phone, scripts only
  // (never allow-same-origin); all not focusable, inside a part hidden from screen readers, outside the buttons
  const frames = [...HTML.matchAll(/<iframe\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(frames, ['instagram', 'website', 'scratch'].map((id) => '<iframe class="ob-phone__frame" data-preview="' + id + '" sandbox="" tabindex="-1" title="" referrerpolicy="no-referrer">')
    .concat('<iframe class="ob-phone__frame" id="ob-live-frame" sandbox="" tabindex="-1" title="" referrerpolicy="no-referrer">',
      '<iframe class="ob-phone__frame" id="ob-sections-frame" sandbox="allow-scripts" tabindex="-1" title="" referrerpolicy="no-referrer">'));
  assert.ok(!/allow-same-origin|allow-popups|allow-top-navigation|allow-forms|allow-modals/.test(HTML), 'no other sandbox permission anywhere');
  for (const [from, to] of [['<aside class="ob-live" aria-labelledby="ob-live-label"', '</aside>'], ['<aside class="ob-live" aria-labelledby="ob-sections-live-label"', '</aside>']]) {
    const live = HTML.slice(HTML.indexOf(from), HTML.indexOf(to, HTML.indexOf(from)));
    assert.ok(/<div class="ob-live__stage[^"]*" aria-hidden="true">/.test(live) && live.search(/aria-hidden="true">/) < live.indexOf('<iframe'), from + ': the frame in the hidden part');
  }
  for (const id of ['instagram', 'website', 'scratch']) {
    const card = HTML.slice(HTML.indexOf('<div class="ob-card" data-card="' + id + '">'), HTML.indexOf('</button>', HTML.indexOf('<div class="ob-card" data-card="' + id + '">')));
    assert.ok(card.indexOf('<div class="ob-card__media" aria-hidden="true">') < card.indexOf('<iframe') && card.indexOf('<iframe') < card.indexOf('<button'), id + ': the frame in the hidden part, before (not inside) the button');
  }
  assert.equal((HTML.match(/data-ob="example"/g) || []).length, 2, 'the two Coming soon cards say Example');
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

test('markup: Step 1 three cards, Instagram and Website "Coming soon"; Step 2 fields with labels and error slots, the logo disabled; Steps 3-4 placeholders only', () => {
  const cards = [...HTML.matchAll(/<button type="button" class="ob-option"[^>]*>/g)].map((m) => m[0]);
  assert.equal(cards.length, 3);
  assert.match(cards[0], /data-option="instagram" disabled aria-disabled="true"/);
  assert.match(cards[1], /data-option="website" disabled aria-disabled="true"/);
  assert.ok(/data-option="scratch"/.test(cards[2]) && !/disabled/.test(cards[2]));
  assert.equal((HTML.match(/data-ob="soon"/g) || []).length, 3, 'three "Coming soon" badges: Instagram, Website, the logo');
  assert.match(HTML, /<button type="button" class="ob-btn ob-btn--primary" id="ob-finish" hidden disabled data-ob="finish_soon">/, 'no working finish button');
  // Step 2: labelled name (required) and description, errors and counters described; the links' list and the green Add link
  assert.match(HTML, /<label class="ob-label" for="ob-name">/);
  assert.match(HTML, /<input class="ob-input" id="ob-name" type="text" autocomplete="organization" spellcheck="false" aria-required="true" aria-describedby="ob-name-error ob-name-count-sr" \/>/);
  assert.match(HTML, /<label class="ob-label" for="ob-description">/);
  assert.match(HTML, /<textarea class="ob-input ob-input--area" id="ob-description" rows="3" aria-describedby="ob-description-hint ob-description-error ob-description-count-sr"><\/textarea>/);
  for (const id of ['ob-name-error', 'ob-description-error']) assert.match(HTML, new RegExp('<p class="ob-error" id="' + id + '"></p>'));
  for (const id of ['ob-name-count-sr', 'ob-description-count-sr']) assert.match(HTML, new RegExp('<span class="ob-sr" id="' + id + '" aria-live="polite"></span>'));
  assert.match(HTML, /<fieldset class="ob-field ob-links">\s*<legend class="ob-label">/);
  assert.match(HTML, /<button type="button" class="ob-btn ob-btn--add" id="ob-add-link" aria-describedby="ob-links-hint">/);
  assert.match(HTML, /<button type="button" class="ob-upload" id="ob-logo" disabled aria-disabled="true" aria-describedby="ob-logo-note">/, 'the logo: disabled');
  const step2 = HTML.slice(HTML.indexOf('id="ob-step-1"'), HTML.indexOf('id="ob-step-2"'));
  assert.equal((step2.match(/<input\b/g) || []).length, 1, 'Step 2 markup: one input (the name); link rows are added by the script');
  // Step 3: the two lists (filled by the script), the status for screen readers, the info note; no field
  const step3 = HTML.slice(HTML.indexOf('id="ob-step-2"'), HTML.indexOf('id="ob-step-3"'));
  assert.match(step3, /<ol class="ob-chosen" id="ob-chosen"><\/ol>/);
  assert.match(step3, /<ul class="ob-more" id="ob-more"><\/ul>/);
  assert.match(step3, /<p class="ob-sr" id="ob-sections-status" role="status" aria-live="polite"><\/p>/);
  assert.match(step3, /data-ob="sections_info"/);
  assert.ok(!/<input|<textarea|<select|<button/.test(step3), 'Step 3 markup: no field, no button (added by the script)');
  // Step 4: still the placeholder
  const step4 = HTML.slice(HTML.indexOf('id="ob-step-3"'), HTML.indexOf('<div class="ob-nav">'));
  assert.ok(!/<input|<textarea|<select|<button/.test(step4) && /data-ob="review_placeholder"/.test(step4), 'Step 4 collects nothing');
});

test('no request: no fetch, XHR, sockets, beacons, API paths, payment or trial calls; storage only this tab\'s sessionStorage under the per-user key', () => {
  const c = code(SRC);
  for (const re of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/, /localStorage|document\.cookie|indexedDB/, /getToken/,
    /\/studio\/|\/deals|\/lp\b|\/stripe|\/billing|\/checkout|\/trial|\/api\//, /https?:\/\//, /railway\.app|vercel\.app|qraivy\.com/, /\beval\s*\(|new\s+Function|toString\s*\(/, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
    /createElement\('script'\)/]) {
    assert.ok(!re.test(c), 'onboarding-shell.js must not contain ' + re);
  }
  // the language is the shared setting (qraivy-lang.js setQraivyLang), never written here directly
  assert.ok(c.includes('win.setQraivyLang(current)'));
  // the sign-in comes from studio-auth.js only, created only after canStart
  assert.equal((c.match(/createAuth\(/g) || []).length, 1);
  assert.ok(c.indexOf('if (!canStart(ROUTING)) return;') < c.indexOf('createAuth('), 'no sign-in before the address is checked');
  // O1: sessionStorage read in one place; written only under the user's key, with the step and the answers
  assert.equal((c.match(/sessionStorage/g) || []).length, 1);
  assert.equal((c.match(/\.setItem\(/g) || []).length, 1);
  assert.ok(c.includes('st.setItem(owner, JSON.stringify({ step: nav.step, choice: nav.choice, answers: answers }));'));
  assert.ok(c.includes("var key = storeKey(c && c.user && c.user.id);"), 'the key: the signed-in Clerk user');
  // sign-out clears the kept progress before signing out
  const out = c.slice(c.indexOf("$('ob-signout').addEventListener"));
  assert.ok(out.indexOf('clearStore();') < out.indexOf('clerk.signOut()') && out.indexOf('forget();') < out.indexOf('clerk.signOut()'));
});

test('O1 progress: one key per user (a hash, not the id); a restore is checked (bad data -> safe defaults, no skipping past Step 2 with invalid answers)', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const a = OB.storeKey('user_2abcDEF123'), b = OB.storeKey('user_2abcDEF124');
  assert.match(a, /^qraivy\.onboarding\.v1:[0-9a-f]{8}$/);
  assert.ok(a !== b && a === OB.storeKey('user_2abcDEF123'), 'stable, per user');
  assert.ok(!a.includes('user_2abc'), 'the id itself is not in the key');
  for (const x of [undefined, null, '', 42, {}]) assert.equal(OB.storeKey(x), null, 'no user: memory only');
  const good = { name: 'Café Sonne', description: 'Kaffee', links: [{ platform: 'instagram', url: 'instagram.com/sonne' }] };
  assert.deepEqual(OB.restore({ step: 2, choice: 'scratch', answers: good }, M, V3), { step: 2, choice: 'scratch', answers: Object.assign({ sections: null, social: 'auto' }, good) });
  // O2: the section list and Social Media's mode come back cleaned; Step 4 only with a valid page
  const withSections = OB.restore({ step: 3, choice: 'scratch', answers: Object.assign({ sections: ['gallery', 'hero', 'evil', 'gallery'], social: 'removed' }, good) }, M, V3);
  assert.deepEqual([withSections.step, withSections.answers.sections, withSections.answers.social], [3, ['hero', 'gallery'], 'removed']);
  assert.equal(OB.restore({ step: 3, choice: 'scratch', answers: Object.assign({}, good, { social: 'everything' }) }, M, V3).answers.social, 'auto');
  assert.equal(OB.restore({ step: 3, choice: 'scratch', answers: { name: '' } }, M, V3).step, 1, 'invalid answers: back to Step 2');
  assert.equal(OB.restore({ step: 2, choice: 'instagram', answers: good }, M, V3).step, 0, 'no valid choice: Step 1');
  for (const bad of [null, 'x', 7, [], { step: 99, choice: 'scratch' }, { step: -1 }, { step: 1.5, choice: 'scratch' }]) {
    const r = OB.restore(bad, M, V3);
    assert.ok(r.step >= 0 && r.step <= 1, JSON.stringify(bad));
    assert.deepEqual(Object.keys(r.answers).sort(), ['description', 'links', 'name', 'sections', 'social']);
  }
  const r = OB.restore({ step: 1, choice: 'scratch', answers: { name: 5, links: [{ platform: 'myspace', url: 'x', token: 't' }, ...Array(12).fill({ platform: 'x', url: '' })], token: 'secret' } }, M, V3);
  assert.deepEqual(r.answers.links[0], { platform: 'instagram', url: 'x' }, 'unknown platform -> the first; unknown fields dropped');
  assert.equal(r.answers.links.length, 8, 'at most 8 rows');
  assert.equal(r.answers.name, '');
  assert.ok(!JSON.stringify(r).includes('secret') && !JSON.stringify(r).includes('token'));
});

test('O1 model: name required, cleaned like the draft endpoint, at most 80 characters; description at most 300 with line breaks', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  assert.equal(M.check(V3, {}).errors.name, 'name_required');
  assert.equal(M.check(V3, { name: '   \n\t ' }).errors.name, 'name_required');
  assert.equal(M.cleanName('  Café\u0000 \u202eSonne\n\nUlm  '), 'Café Sonne Ulm', 'control and direction characters removed, spaces collapsed');
  assert.equal(M.check(V3, { name: 'a'.repeat(80) }).ok, true);
  assert.equal(M.check(V3, { name: 'a'.repeat(81) }).errors.name, 'name_too_long');
  assert.equal(M.check(V3, { name: '😀'.repeat(80) }).ok, true, 'characters, not UTF-16 units');
  assert.equal(M.check(V3, { name: '<script>alert(1)</script>' }).ok, true, 'text is text: core.js escapes it');
  const html = V3.renderDesign(M.check(V3, { name: '<img src=x onerror=alert(1)>' }).design, {}, { preview: true }).html;
  assert.ok(!html.includes('<img src=x') && html.includes('&lt;img src=x'), 'escaped in the page');
  assert.equal(M.cleanDescription('Line one\r\nLine two\n\n\n\nEnd\t!'), 'Line one\nLine two\n\nEnd !');
  assert.equal(M.check(V3, { name: 'A', description: 'd'.repeat(300) }).ok, true);
  assert.equal(M.check(V3, { name: 'A', description: 'd'.repeat(301) }).errors.description, 'description_too_long');
  assert.deepEqual(M.LIMITS, { name: 80, description: 300, links: 8 });
});

test('O1 model: all eight platforms, each on its own domains only (core.js rules); https:// added when missing; unsafe and lookalike addresses refused; 8 links at most', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  assert.deepEqual(M.PLATFORMS, V3.SOCIAL_PLATFORMS, 'the platforms core.js supports, all eight');
  assert.equal(M.PLATFORMS.length, 8);
  const ok = { instagram: 'instagram.com/cafe', facebook: 'www.facebook.com/cafe', tiktok: 'tiktok.com/@cafe', youtube: 'youtu.be/abc', linkedin: 'linkedin.com/company/cafe', x: 'twitter.com/cafe', pinterest: 'pinterest.de/cafe', whatsapp: 'wa.me/491701234567' };
  for (const p of M.PLATFORMS) {
    assert.equal(M.linkError(V3, p, M.normalizeUrl(ok[p])), null, p + ' accepted');
    assert.equal(M.linkError(V3, p, M.normalizeUrl(M.EXAMPLES[p])), null, p + ': its own example is valid');
    const other = M.PLATFORMS.find((q) => q !== p && q !== 'x');
    assert.equal(M.linkError(V3, p, M.normalizeUrl(ok[other === p ? 'x' : other])), 'link_invalid', p + ' refuses another platform');
  }
  assert.equal(M.normalizeUrl('instagram.com/a'), 'https://instagram.com/a');
  assert.equal(M.normalizeUrl('  //instagram.com/a '), 'https://instagram.com/a');
  assert.equal(M.normalizeUrl('https://instagram.com/a'), 'https://instagram.com/a');
  assert.equal(M.normalizeUrl(''), '');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'http://instagram.com/a', 'data:text/html,x', 'https://instagram.com.evil.com/a', 'https://evil.com/instagram.com', 'https://evilinstagram.com/a',
    'https://user@instagram.com/a', 'https://instagram.com/a b', 'https://instagram.com/"onmouseover=x', 'instagram', 'ftp://instagram.com/a']) {
    assert.equal(M.linkError(V3, 'instagram', M.normalizeUrl(bad)), 'link_invalid', bad);
  }
  assert.equal(M.linkError(V3, 'myspace', 'https://myspace.com/a'), 'link_platform');
  // empty rows ignored; errors on their rows; only valid links reach the page
  const r = M.check(V3, { name: 'Café', links: [{ platform: 'instagram', url: 'instagram.com/c' }, { platform: 'facebook', url: '  ' }, { platform: 'x', url: 'javascript:alert(1)' }, { platform: 'whatsapp', url: 'wa.me/491701234567' }] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.links, { 2: 'link_invalid' });
  assert.deepEqual(r.values.links.map((l) => [l.platform, l.url, l.row]), [['instagram', 'https://instagram.com/c', 0], ['whatsapp', 'https://wa.me/491701234567', 3]]);
  const nine = Array.from({ length: 9 }, () => ({ platform: 'instagram', url: 'instagram.com/c' }));
  assert.deepEqual(M.check(V3, { name: 'A', links: nine }).errors.links, { 8: 'links_too_many' });
  assert.equal(M.check(V3, { name: 'A', links: nine.slice(0, 8) }).ok, true);
  assert.equal(M.nextPlatform([{ platform: 'instagram' }, { platform: 'facebook' }]), 'tiktok');
});

test('O1 model: the page the answers make is the draft starter (Hero: name, description) plus Social Media only with links; checked by core.validateDesign', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  for (const l of ['en', 'de']) {
    const plain = M.check(V3, { name: 'Café Sonne', description: 'Frischer Kaffee' }, l);
    assert.ok(plain.ok);
    const hero = V3.starter('hero', l);
    assert.deepEqual(plain.design.pages[0].sections.map((s) => [s.type, s.variant]), [['hero', hero.variant]], 'no links: the Hero only');
    assert.equal(plain.design.pages[0].sections[0].data.headline, 'Café Sonne');
    assert.equal(plain.design.pages[0].sections[0].data.subheadline, 'Frischer Kaffee');
    assert.equal(plain.design.settings.language, l);
    const withLinks = M.check(V3, { name: 'Café Sonne', links: [{ platform: 'tiktok', url: 'tiktok.com/@sonne' }] }, l);
    const s = withLinks.design.pages[0].sections;
    assert.deepEqual(s.map((x) => x.type), ['hero', 'socialMedia']);
    assert.deepEqual(s[1].data.links, [{ platform: 'tiktok', url: 'https://tiktok.com/@sonne' }]);
    assert.equal(s[1].data.title, V3.starter('socialMedia', l).data.title);
    assert.ok(V3.validateDesign(withLinks.design).ok, 'valid by the server rules');
  }
  // the preview's page with no name yet: the placeholder
  const d = M.buildDesign(V3, { name: '', description: '', links: [] }, 'de');
  assert.equal(d.pages[0].sections[0].data.headline, 'Ihr Unternehmen');
  assert.ok(V3.validateDesign(d).ok);
  const src = code(read('js/studio/onboarding-model.js'));
  for (const re of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage|sessionStorage|document\.|window\./, /innerHTML|outerHTML/, /\beval\s*\(|new\s+Function/]) assert.ok(!re.test(src), 'onboarding-model.js must not contain ' + re);
});

test('O2 model: the eight section types; defaults Hero, Buttons, Opening Hours, Contact (+ Social Media with links); each once, Hero first; all valid by core.js rules', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  assert.deepEqual(M.SECTION_TYPES, ['hero', 'buttons', 'socialMedia', 'contact', 'openingHours', 'products', 'gallery', 'text']);
  assert.ok(M.SECTION_TYPES.every((t) => V3.describe().sections[t] && V3.describe().sections[t].rendered), 'only types the public page renders');
  for (const t of M.SECTION_TYPES) assert.match(M.SECTION_IDS[t], /^s_[a-z0-9]{4,16}$/);
  assert.equal(new Set(Object.values(M.SECTION_IDS)).size, 8, 'distinct ids');
  const links = [{ platform: 'instagram', url: 'instagram.com/sonne' }];
  assert.deepEqual(M.checkPage(V3, { name: 'A' }).sections, ['hero', 'buttons', 'openingHours', 'contact'], 'defaults without links');
  assert.deepEqual(M.checkPage(V3, { name: 'A', links }).sections, ['hero', 'buttons', 'openingHours', 'contact', 'socialMedia'], 'Social Media with links');
  // the list is cleaned: known types, once each, Hero first
  assert.deepEqual(M.cleanSections(['text', 'gallery', 'hero', 'text', 'dealsOffers', 'loyalty', 'x', 7, null]), ['hero', 'text', 'gallery']);
  assert.deepEqual(M.cleanSections([]), ['hero'], 'the Hero is always there');
  assert.equal(M.cleanSections('hero'), null, 'not a list: the defaults');
  // all eight at once: valid, one Hero (MAX_PER_PAGE), in the chosen order
  for (const l of ['en', 'de']) {
    const r = M.checkPage(V3, { name: 'Café', description: 'Kaffee', links, sections: ['hero', 'text', 'gallery', 'products', 'openingHours', 'contact', 'socialMedia', 'buttons'], social: 'auto' }, l);
    assert.ok(r.pageOk, l);
    assert.deepEqual(r.page.pages[0].sections.map((s) => s.type), ['hero', 'text', 'gallery', 'products', 'openingHours', 'contact', 'socialMedia', 'buttons']);
    assert.deepEqual(r.page.pages[0].sections.map((s) => s.id), r.sections.map((t) => M.SECTION_IDS[t]));
    const s = Object.fromEntries(r.page.pages[0].sections.map((x) => [x.type, x]));
    assert.equal(s.hero.data.headline, 'Café'); assert.equal(s.hero.data.subheadline, 'Kaffee');
    assert.deepEqual(s.socialMedia.data.links, [{ platform: 'instagram', url: 'https://instagram.com/sonne' }]);
    assert.deepEqual([s.text.data.heading, s.text.data.body], ['', ''], 'the Text section starts empty');
    for (const t of ['buttons', 'contact', 'openingHours', 'products', 'gallery']) assert.equal(s[t].variant, V3.starter(t, l).variant, t + ': core.js starter');
    assert.ok(V3.validateDesign(r.page).ok);
  }
  // the empty sections are hidden on the public page, shown as core.js placeholders in the preview; no fake content, no placeholder text
  const all = M.checkPage(V3, { name: 'Café', sections: M.SECTION_TYPES, social: 'added' }, 'en');
  const pub = V3.renderDesign(all.page, {}, {}).html, pv = V3.renderDesign(all.page, {}, { preview: true }).html;
  assert.equal((pv.match(/data-v3-id="s_ob/g) || []).length, 8, 'the preview shows all eight');
  assert.equal((pv.match(/Empty section – add content in the editor/g) || []).length, 7, 'seven empty placeholders (all but the Hero)');
  assert.ok(!pub.includes('Empty section') && !pub.includes('Your text') && !/v3-social|v3-btns|v3-hours/.test(pub.replace(/<style[\s\S]*?<\/style>/g, '')), 'public page: only the Hero');
});

test('O2 Social Media: follows Step 2 links while untouched; a deliberate add or remove is kept; its place is remembered', () => {
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  assert.deepEqual(M.sectionsFor({}, true).slice(-1), ['socialMedia']);
  assert.ok(!M.sectionsFor({}, false).includes('socialMedia'));
  // moved while auto: kept at its place with links, left out without
  const moved = { sections: ['hero', 'socialMedia', 'buttons', 'contact'], social: 'auto' };
  assert.deepEqual(M.sectionsFor(moved, true), ['hero', 'socialMedia', 'buttons', 'contact']);
  assert.deepEqual(M.sectionsFor(moved, false), ['hero', 'buttons', 'contact']);
  // added by the customer: stays even without links; removed: stays out even with links
  assert.deepEqual(M.sectionsFor({ sections: ['hero', 'socialMedia'], social: 'added' }, false), ['hero', 'socialMedia']);
  assert.deepEqual(M.sectionsFor({ sections: ['hero'], social: 'added' }, false), ['hero', 'socialMedia']);
  assert.deepEqual(M.sectionsFor({ sections: ['hero', 'socialMedia'], social: 'removed' }, true), ['hero']);
  assert.deepEqual(M.sectionsFor({ social: 'removed' }, true), ['hero', 'buttons', 'openingHours', 'contact']);
});

test('O2 live frame: the fixed script (no customer data) blocks clicks and links, restores the scroll, reveals a section; only exact scroll messages accepted', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const PV = require('../../frontend/public/js/studio/onboarding-previews.js');
  const html = V3.renderDesign(M.checkPage(V3, { name: '<b>Sonne</b>', sections: M.SECTION_TYPES, social: 'added' }).page, {}, { preview: true }).html;
  const live = PV.liveHtml(html);
  assert.ok(live.endsWith(PV.FRAME_SCRIPT + '</body></html>') && live.startsWith(html.slice(0, -'</body></html>'.length)), 'the page plus the script, once');
  assert.equal((live.match(/<script>/g) || []).length, 1, 'one script: the fixed one');
  assert.ok(!PV.FRAME_SCRIPT.includes('Sonne') && !/https?:|fetch|XMLHttp|localStorage|sessionStorage|cookie|eval|Function\(|innerHTML|top\.|parent\.location|window\.open/.test(PV.FRAME_SCRIPT), 'fixed text, no request, no storage, no navigation');
  assert.ok(PV.FRAME_SCRIPT.includes('["click","auxclick","dblclick","submit"].forEach(function(t){document.addEventListener(t,stop,true);})'), 'every click and form blocked (capture)');
  assert.ok(PV.FRAME_SCRIPT.includes('setAttribute("tabindex","-1")'), 'the page\'s controls out of the keyboard order');
  assert.ok(PV.FRAME_SCRIPT.includes('if(e.source!==parent)return;'), 'messages from the wizard only');
  for (const bad of [null, '', '<html>', html + 'x']) assert.equal(PV.liveHtml(bad), '');
  // from the frame: exactly { type: 'scroll', y }
  assert.deepEqual(PV.acceptFrameMessage({ type: 'scroll', y: 120 }), { type: 'scroll', y: 120 });
  for (const bad of [null, [], 'scroll', { type: 'scroll' }, { type: 'scroll', y: -1 }, { type: 'scroll', y: 1.5 }, { type: 'scroll', y: 1e9 }, { type: 'scroll', y: '5' }, { type: 'scroll', y: 5, x: 1 }, { type: 'select', id: 's_obhero01' }, Object.create({ type: 'scroll', y: 1 })]) {
    assert.equal(PV.acceptFrameMessage(bad), null, JSON.stringify(bad));
  }
  // to the frame: a whole, bounded scroll position and a valid section id only
  assert.deepEqual(PV.initMessage(250.7, 's_obgallery1'), { type: 'init', y: 250, reveal: 's_obgallery1' });
  assert.deepEqual(PV.initMessage(-5, '"]<script>'), { type: 'init', y: 0, reveal: null });
  assert.deepEqual(PV.initMessage(NaN, null), { type: 'init', y: 0, reveal: null });
});

test('O0.1 previews: real QRAIVY pages from core.js; examples from the Studio demo, the scratch page is the draft starter; no request', () => {
  const V3 = require('../src/lpV3/core.js');
  const PV = require('../../frontend/public/js/studio/onboarding-previews.js');
  const ctx = { window: {} };
  vm.runInNewContext(read('js/studio/studio-demo.js'), ctx);
  const demo = JSON.parse(JSON.stringify(ctx.window.QRAIVY_STUDIO_DEMO));
  const demoIds = demo.design.pages[0].sections.map((s) => s.id);
  for (const id of ['instagram', 'website']) {
    const d = PV.exampleDesign(demo, id);
    const v = V3.validateDesign(d);
    assert.ok(v.ok, id + ' is a valid design: ' + JSON.stringify(v.errors));
    assert.deepEqual(d.pages[0].sections.map((s) => s.id), PV.EXAMPLES[id], id);
    for (const s of d.pages[0].sections) assert.ok(demoIds.includes(s.id), 'demo content only: ' + s.id);
    assert.ok(d.pages[0].sections.every((s) => V3.describe().sections[s.type].rendered), id + ': only sections the public page renders');
  }
  assert.deepEqual(demo, JSON.parse(JSON.stringify(ctx.window.QRAIVY_STUDIO_DEMO)), 'the demo itself is not changed');
  for (const l of ['en', 'de']) {
    const d = PV.scratchDesign(V3, l);
    assert.ok(V3.validateDesign(d).ok, 'scratch ' + l);
    const hero = V3.starter('hero', l);
    assert.deepEqual(d.pages[0].sections.map((s) => [s.type, s.variant]), [['hero', hero.variant]], 'one starter Hero, as POST /studio/drafts creates');
    assert.equal(d.pages[0].sections[0].data.subheadline, hero.data.subheadline);
    assert.equal(d.pages[0].sections[0].data.headline, PV.SCRATCH_NAME[l]);
    assert.equal(d.settings.language, l);
  }
  const html = PV.previews({ V3, demo, lang: 'de', localize: (h) => h + '<!--localized-->' });
  for (const id of ['instagram', 'website', 'scratch']) assert.ok(/^<!DOCTYPE html>/.test(html[id]) && html[id].endsWith('<!--localized-->'), id + ': rendered by core.js, then localized');
  assert.ok(html.instagram.includes('Aus unserer Backstube') && html.website.includes('Öffnungszeiten') && html.scratch.includes('Ihr Unternehmen'));
  assert.ok(!/<script/i.test(html.instagram + html.website + html.scratch), 'no script in the pages');
  const src = code(read('js/studio/onboarding-previews.js'));
  for (const re of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage|sessionStorage|document\.cookie/, /https?:\/\//, /innerHTML|document\.write/, /\beval\s*\(|new\s+Function|toString\s*\(/]) assert.ok(!re.test(src), 'onboarding-previews.js must not contain ' + re);
  // the frames get the page only through srcdoc
  assert.ok(code(SRC).includes('frames[i].srcdoc = page;'));
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
