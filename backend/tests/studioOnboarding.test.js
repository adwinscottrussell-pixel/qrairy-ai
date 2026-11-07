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

test('Step 1: Instagram and Website cannot be chosen; Start from Scratch leads on; Step 2 only with valid answers; T1b: five steps, Step 3 only with a chosen design; none can finish', () => {
  assert.deepEqual(OB.STEPS, ['start', 'business', 'design', 'sections', 'review']);
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
  // T1b: Step 3, no design chosen at first: no Next (not even to try)
  assert.equal(OB.canNext(s), false, 'Step 3: no design chosen, no Next');
  assert.equal(OB.next(s), s); assert.equal(OB.next(s, false), s);
  s = OB.next(s, true); assert.equal(s.step, 3, 'a design chosen: Step 4');
  assert.equal(OB.canNext(s), true, 'Step 4: Next can be tried (it shows the errors)');
  assert.equal(OB.next(s, false), s, 'Step 4: an invalid page, no Next');
  s = OB.next(s); assert.equal(s.step, 4);
  assert.equal(OB.canNext(s), false, 'the last step has no Next');
  assert.equal(OB.next(s), s);
  s = OB.back(OB.back(OB.back(OB.back(s))));
  assert.deepEqual(s, { step: 0, choice: 'scratch' }, 'Back keeps the choice');
  assert.equal(OB.back(s), s, 'no Back before Step 1');
});

test('page: no Admin sidebar, no Studio controls; the language file, the routing, the sign-in loader, the shared renderer with the demo (O0.1) and its own scripts', () => {
  const scripts = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/studio/onboarding-theme.js', 'js/qraivy-lang.js', 'js/studio/studio-routing.js', 'js/studio/studio-auth.js',
    'js/lpV3/core.js', 'js/studio/studio-demo-images.js', 'js/studio/onboarding-previews.js', 'js/studio/onboarding-model.js', 'js/studio/onboarding-templates.js',
    // D2.3a: the Studio's own Save Draft (studio-pages-data.js), used only through onboarding-drafts.js update()
    'js/studio/studio-pages-data.js', 'js/studio/onboarding-drafts.js', 'js/studio/onboarding-shell.js']);
  assert.equal((HTML.match(/<script\b/g) || []).length, 12, 'no inline script');
  // O2.1: the theme script in <head>, after the stylesheet and before the body (no flash of the other appearance)
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  assert.ok(head.indexOf('css/studio-onboarding.css') < head.indexOf('js/studio/onboarding-theme.js'), 'the theme script in the head, after the stylesheet');
  const styles = (HTML.match(/<link\b[^>]*>/g) || []).filter((l) => /rel="stylesheet"/.test(l)).map((l) => l.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(styles, ['https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Caveat:wght@600&display=swap', 'css/studio-onboarding.css']);
  // no form that could be submitted anywhere, no file input (the logo upload is "Coming soon")
  for (const re of [/id="sidebar"/, /sb-item/, /admin-shell/, /dashboard-shell/, /st-save-btn|st-publish-btn|st-inspector|st-canvas/, /<form\b/, /type="file"/, /\baction=/, /clerk/i]) assert.ok(!re.test(HTML), String(re));
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow" \/>/);
  // O0.1: three preview frames, O1: the live preview, sandboxed with no permissions; O2: Step 3's live phone, scripts only
  // (never allow-same-origin); all not focusable, inside a part hidden from screen readers, outside the buttons
  const frames = [...HTML.matchAll(/<iframe\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(frames, ['instagram', 'website', 'scratch'].map((id) => '<iframe class="ob-phone__frame" data-preview="' + id + '" sandbox="" tabindex="-1" title="" referrerpolicy="no-referrer">')
    .concat('<iframe class="ob-phone__frame" id="ob-live-frame" sandbox="" tabindex="-1" title="" referrerpolicy="no-referrer">',
      '<iframe class="ob-phone__frame" id="ob-design-frame" sandbox="allow-scripts" tabindex="-1" title="" referrerpolicy="no-referrer">',
      '<iframe class="ob-phone__frame" id="ob-sections-frame" sandbox="allow-scripts" tabindex="-1" title="" referrerpolicy="no-referrer">',
      '<iframe class="ob-phone__frame" id="ob-review-frame" sandbox="allow-scripts" tabindex="-1" title="" referrerpolicy="no-referrer">'));
  assert.ok(!/allow-same-origin|allow-popups|allow-top-navigation|allow-forms|allow-modals/.test(HTML), 'no other sandbox permission anywhere');
  for (const [from, to] of [['<aside class="ob-live" aria-labelledby="ob-live-label"', '</aside>'], ['<aside class="ob-live" id="ob-design-live" tabindex="-1" aria-labelledby="ob-design-live-label"', '</aside>'], ['<aside class="ob-live" aria-labelledby="ob-sections-live-label"', '</aside>'], ['<aside class="ob-live" aria-labelledby="ob-review-live-label"', '</aside>']]) {
    const live = HTML.slice(HTML.indexOf(from), HTML.indexOf(to, HTML.indexOf(from)));
    assert.ok(/<div class="ob-live__stage[^"]*"[^>]* aria-hidden="true"[^>]*>/.test(live) && live.search(/aria-hidden="true"[^>]*>/) < live.indexOf('<iframe'), from + ': the frame in the hidden part');
  }
  for (const id of ['instagram', 'website', 'scratch']) {
    const card = HTML.slice(HTML.indexOf('<div class="ob-card" data-card="' + id + '">'), HTML.indexOf('</button>', HTML.indexOf('<div class="ob-card" data-card="' + id + '">')));
    assert.ok(card.indexOf('<div class="ob-card__media" aria-hidden="true">') < card.indexOf('<iframe') && card.indexOf('<iframe') < card.indexOf('<button'), id + ': the frame in the hidden part, before (not inside) the button');
  }
  // the DEMO label on each of the three example pictures (inside the phone), never on the card or its button
  assert.equal((HTML.match(/<div class="ob-phone"><span class="ob-card__demo" data-ob="demo">DEMO<\/span><div class="ob-phone__screen">/g) || []).length, 3);
  for (const id of ['instagram', 'website', 'scratch']) {
    const card = HTML.slice(HTML.indexOf('<div class="ob-card" data-card="' + id + '">'), HTML.indexOf('</button>', HTML.indexOf('<div class="ob-card" data-card="' + id + '">')));
    assert.ok(card.indexOf('ob-card__demo') > card.indexOf('<div class="ob-card__media ob-card__media--' + id + '" aria-hidden="true">') && card.indexOf('ob-card__demo') < card.indexOf('<button'), id + ': DEMO in the hidden picture, not in the button');
  }
  assert.ok(!/data-ob="example"|ob-card__example/.test(HTML));
  assert.equal(OB.TX.en.demo, 'DEMO'); assert.equal(OB.TX.de.demo, 'DEMO');
  // the header logo: the approved file, at its own proportions (square, 1254 x 1254), the only image
  assert.deepEqual([...HTML.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]), ['<img class="ob-brand__logo" src="images/qraivy-onboarding-logo.jpg" width="1254" height="1254" alt="QRAIVY" decoding="async" />']);
  const logo = fs.readFileSync(path.join(PUB, 'images', 'qraivy-onboarding-logo.jpg'));
  assert.equal(require('crypto').createHash('sha256').update(logo).digest('hex').slice(0, 16), '3b92407982102bd6', 'the approved logo file, unchanged');
  assert.ok(logo[0] === 0xff && logo[1] === 0xd8, 'a JPEG');
  const css = read('css/studio-onboarding.css');
  assert.ok(css.includes('.ob-brand__logo { display: block; height: 40px; width: auto; aspect-ratio: 1 / 1; object-fit: contain; }'), 'height only: never stretched');
  // the only links: back to the Studio and (the draft limit) Manage drafts, both to the Studio in the same upload
  assert.deepEqual([...HTML.matchAll(/\shref="([^"#][^"]*)"/g)].map((m) => m[1]).filter((h) => !/^https:\/\/fonts\.googleapis\.com/.test(h) && !h.endsWith('.css')), ['studio.html', 'studio.html']);
  assert.ok(HTML.includes('<a class="ob-btn ob-btn--secondary" id="ob-manage" href="studio.html" data-ob="manage_drafts">Manage drafts</a>'), 'Manage drafts: the Studio\'s page list');
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], 'unique ids');
});

test('markup: Step 1 three cards, Instagram and Website "Coming soon"; Step 2 fields with labels and error slots, the logo disabled; Step 3 (T1b) the design groups; Step 4 lists; Step 5 review with a disabled Save Draft', () => {
  const cards = [...HTML.matchAll(/<button type="button" class="ob-option"[^>]*>/g)].map((m) => m[0]);
  assert.equal(cards.length, 3);
  assert.match(cards[0], /data-option="instagram" disabled aria-disabled="true"/);
  assert.match(cards[1], /data-option="website" disabled aria-disabled="true"/);
  assert.ok(/data-option="scratch"/.test(cards[2]) && !/disabled/.test(cards[2]));
  assert.equal((HTML.match(/data-ob="soon"/g) || []).length, 3, 'three "Coming soon" badges: Instagram, Website, the logo');
  assert.match(HTML, /<button type="button" class="ob-btn ob-btn--primary" id="ob-finish" hidden disabled aria-disabled="true" aria-describedby="ob-save-note" data-ob="save_draft">Save Draft<\/button>/, 'Save Draft: disabled, with its note');
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
  // Step 3 (T1b): the two radio groups (filled by the script), the hint, the status for screen readers, the empty phone
  // and the legend; no field, no button in the markup
  const design = HTML.slice(HTML.indexOf('id="ob-step-2"'), HTML.indexOf('id="ob-step-3"'));
  assert.ok(design.includes('<div class="ob-tpls" id="ob-tpls" role="radiogroup" aria-labelledby="ob-design-title"></div>'));
  assert.ok(design.includes('<div class="ob-pals" id="ob-pals" role="radiogroup" aria-labelledby="ob-pals-title"></div>'));
  assert.ok(design.includes('<section class="ob-secgroup ob-pals-wrap" id="ob-pals-wrap" aria-labelledby="ob-pals-title" hidden>'), 'the palettes only once a design is chosen');
  assert.ok(design.includes('<p class="ob-sr" id="ob-design-status" role="status" aria-live="polite"></p>'));
  for (const k of ['design_hint', 'design_empty', 'legend_yours', 'legend_example', 'live_note_design', 'jump_preview']) assert.ok(design.includes('data-ob="' + k + '"'), k);
  // the buttons: the phones-only jump to the live phone (the same aside, no second preview) and (T1c.4) the switch notice's two actions
  assert.deepEqual((design.match(/<button\b[^>]*>/g) || []).map((b) => (b.match(/id="([^"]+)"/) || [])[1]), ['ob-design-jump', 'ob-switch-use', 'ob-switch-undo']);
  assert.ok(design.includes('<div class="ob-info ob-switch" id="ob-switch" hidden>') && design.includes('<button type="button" class="ob-switch__btn" id="ob-switch-undo" hidden></button>'), 'T1c.4: the notice hidden until a switch needs it');
  assert.ok(design.includes('<button type="button" class="ob-design-jump" id="ob-design-jump" aria-controls="ob-design-live" disabled>'), 'disabled until a design is chosen');
  assert.ok(design.includes('<aside class="ob-live" id="ob-design-live" tabindex="-1" aria-labelledby="ob-design-live-label">'));
  assert.equal((design.match(/<iframe\b/g) || []).length, 1, 'one live phone');
  assert.ok(!/<input|<textarea|<select|<form/.test(design), 'Step 3 markup: no field (cards and palettes added by the script)');
  // Step 4: the two lists (filled by the script), the status for screen readers, the info note; no field
  const step3 = HTML.slice(HTML.indexOf('id="ob-step-3"'), HTML.indexOf('id="ob-step-4"'));
  assert.match(step3, /<ol class="ob-chosen" id="ob-chosen"><\/ol>/);
  assert.match(step3, /<ul class="ob-more" id="ob-more"><\/ul>/);
  assert.match(step3, /<p class="ob-sr" id="ob-sections-status" role="status" aria-live="polite"><\/p>/);
  // E1: the blue information panel first in the fields column, before the section lists; the old lead and note gone
  assert.ok(step3.indexOf('id="ob-sections-intro"') !== -1 && step3.indexOf('id="ob-sections-intro"') < step3.indexOf('id="ob-chosen"'), 'E1: the panel before the cards');
  assert.match(step3, /<section class="ob-info ob-info--intro" id="ob-sections-intro" aria-labelledby="ob-sections-intro-title">/);
  ['sections_intro_title', 'sections_intro_text', 'sections_intro_detail', 'sections_intro_later'].forEach((k) => assert.match(step3, new RegExp('data-ob="' + k + '"')));
  assert.ok(!/sections_info|sections_text|Empty sections stay hidden/.test(step3), 'E1: the former lead line and note removed');
  assert.ok(!/<input|<textarea|<select|<button/.test(step3), 'Step 4 markup: no field, no button (added by the script)');
  // Step 5 (O3A): the status, the free / trial note, the two summaries with named Edit buttons, the save note; no field
  const step4 = HTML.slice(HTML.indexOf('id="ob-step-4"'), HTML.indexOf('<div class="ob-nav">'));
  assert.ok(!/<input|<textarea|<select|<form/.test(step4), 'Step 5 collects nothing');
  assert.deepEqual([...step4.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]), [
    '<button type="button" class="ob-edit" id="ob-edit-business" aria-label="Edit business information" data-ob-aria="edit_business_label">',
    '<button type="button" class="ob-edit" id="ob-edit-sections" aria-label="Edit sections" data-ob-aria="edit_sections_label">',
    '<button type="button" class="ob-sum-toggle" id="ob-sum-toggle" aria-expanded="false" aria-controls="ob-sum-sections">'], 'the two Edit buttons and (T1c.3, phones) the section summary toggle');
  assert.ok(step4.includes('<section class="ob-summary" id="ob-sum-sections-box" data-open="false" aria-labelledby="ob-sum-sections-title">') && !step4.includes('ob-sum-compact'));
  assert.deepEqual([OB.TX.en.draft_status, OB.TX.de.draft_status], ['Draft preview ready · Not saved', 'Entwurfsvorschau bereit · Nicht gespeichert']);
  assert.deepEqual([OB.TX.en.sum_view_all, OB.TX.de.sum_view_all, OB.TX.en.sum_view_less, OB.TX.de.sum_view_less], ['Show all sections ({n})', 'Alle Abschnitte anzeigen ({n})', 'Show fewer sections', 'Weniger Abschnitte anzeigen']);
  for (const k of ['draft_status', 'draft_free', 'sum_business', 'review_live_label']) assert.ok(step4.includes('data-ob="' + k + '"'), k);
  assert.match(HTML, /<p class="ob-save-note" id="ob-save-note" hidden tabindex="-1" data-tone="info" data-ob="save_note">/);
  assert.ok(HTML.includes('<p class="ob-sr" id="ob-save-status" role="status" aria-live="polite"></p>'), 'D2.2: the Save Draft announcements');
  assert.ok(!/review_placeholder|finish_soon/.test(HTML + SRC), 'the placeholder texts are gone');
  // honest copy: never claims a saved draft
  for (const l of ['en', 'de']) assert.ok(!/\b(saved successfully|draft (was|has been) (created|saved)|erfolgreich gespeichert|wurde (erstellt|gespeichert))\b/i.test(Object.values(OB.TX[l]).join(' ')), l + ': no success wording');
  assert.equal(OB.TX.en.save_draft, 'Save Draft'); assert.equal(OB.TX.de.save_draft, 'Entwurf speichern');
  assert.ok(/free/.test(OB.TX.en.draft_free) && /14-day trial/.test(OB.TX.en.draft_free) && /kostenlos/.test(OB.TX.de.draft_free) && /14-tägige Testphase/.test(OB.TX.de.draft_free));
  // D2.2: one handler; D2.3a: primaryAction (Save Draft, Save changes or Open in Studio); the button is enabled / disabled in renderSave only
  assert.equal((code(SRC).match(/\$\('ob-finish'\)\.addEventListener/g) || []).length, 1);
  assert.ok(code(SRC).includes("$('ob-finish').addEventListener('click', primaryAction);") && !/ob-finish'\)\.disabled\s*=/.test(code(SRC)) && (code(SRC).match(/btn\.disabled\s*=/g) || []).length === 1, 'Save Draft: primaryAction handles it, renderSave sets disabled');
  // D2.3a: the Studio is opened only at the checked, encoded address of the saved draft; one navigation, after marking the handoff
  assert.equal((code(SRC).match(/location\.assign\(/g) || []).length, 1);
  assert.ok(code(SRC).includes("'studio.html?slug=' + encodeURIComponent(slug)") && /draft\.handedOff = true;[\s\S]{0,40}save\(\);[\s\S]{0,20}win\.location\.assign\(url\);/.test(code(SRC)), 'handoff: marked and kept, then the one navigation');
  assert.equal(OB.studioUrl('cafe-sonne-abc123'), 'studio.html?slug=cafe-sonne-abc123');
  for (const bad of ['', null, 42, '../x', 'a/b', 'a b', '-x', 'https://evil.example', 'x?y=1', 'x#y', 'a'.repeat(121), 'é']) assert.equal(OB.studioUrl(bad), null, 'refused: ' + bad);
  for (const k of ['open_studio', 'save_changes', 'save_updated', 'draft_conflict', 'upd_conflict', 'upd_forbidden', 'upd_notfound', 'leave_title', 'leave_text', 'leave_text_conflict', 'leave_stay', 'leave_go', 'done_title', 'done_text', 'done_text_noname', 'done_info', 'done_new']) {
    assert.ok(OB.TX.en[k] && OB.TX.de[k] && OB.TX.en[k] !== OB.TX.de[k], 'D2.3a EN/DE text: ' + k);
  }
  assert.ok(!/next update|nächsten Update/.test(OB.TX.en.save_saved + OB.TX.en.save_changed + OB.TX.de.save_saved + OB.TX.de.save_changed), 'D2.3a: no "follows in the next update" any more');
  // the leave question: a modal dialog, labelled and described; the return screen with its two choices
  assert.ok(HTML.includes('<dialog class="ob-dialog" id="ob-leave" aria-labelledby="ob-leave-title" aria-describedby="ob-leave-text">'));
  for (const id of ['ob-done', 'ob-done-title', 'ob-done-text', 'ob-done-open', 'ob-done-new', 'ob-open', 'ob-leave-stay', 'ob-leave-go']) assert.ok(HTML.includes('id="' + id + '"'), id);
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
  assert.ok(c.includes('if (draft) data.draft = draft;'), 'D2.2: the Save Draft state (requestId, then the confirmed address) is kept with the answers');
  assert.ok(c.includes('var data = { v: STORE_VERSION, step: nav.step, choice: nav.choice, answers: answers };') && c.includes('if (sw) data.sw = sw;') && c.includes('st.setItem(owner, JSON.stringify(data));'), 'T1b: with the layout version (T1c.4: the switch notice state only while active)');
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
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  const good = { name: 'Café Sonne', description: 'Kaffee', links: [{ platform: 'instagram', url: 'instagram.com/sonne' }] };
  const v2 = (o) => Object.assign({ v: OB.STORE_VERSION }, o);
  assert.equal(OB.STORE_VERSION, 2);
  // T1b: the five steps (v 2); Step 3 needs nothing more than valid answers, Step 4 a chosen design
  assert.deepEqual(OB.restore(v2({ step: 2, choice: 'scratch', answers: good }), M, V3, T), { step: 2, choice: 'scratch', answers: Object.assign({ template: null, palette: null, sections: null, social: 'auto' }, good) });
  const chosen = Object.assign({ template: 'bakery', palette: 'sage' }, good);
  assert.deepEqual([OB.restore(v2({ step: 3, choice: 'scratch', answers: chosen }), M, V3, T).step, OB.restore(v2({ step: 3, choice: 'scratch', answers: chosen }), M, V3, T).answers.palette], [3, 'sage']);
  assert.equal(OB.restore(v2({ step: 3, choice: 'scratch', answers: good }), M, V3, T).step, 2, 'no design chosen: back to Step 3');
  // an unknown template is dropped (back to Step 3); an unknown palette becomes the template's first
  const evil = OB.restore(v2({ step: 3, choice: 'scratch', answers: Object.assign({}, good, { template: 'evil', palette: 'sage' }) }), M, V3, T);
  assert.deepEqual([evil.step, evil.answers.template, evil.answers.palette], [2, null, null]);
  assert.equal(OB.restore(v2({ step: 3, choice: 'scratch', answers: Object.assign({}, good, { template: 'retail', palette: 'nope' }) }), M, V3, T).answers.palette, 'mono');
  for (const x of ['<b>', 'BAKERY', 'a'.repeat(40), 7, {}]) assert.equal(M.sanitize({ template: x }).template, null, 'an id only: ' + JSON.stringify(x));
  // T1b migration: progress kept by the four-step version (no v) moves to the new numbers: its Choose sections (2) and
  // Review (3) become Steps 4 and 5; without a design yet, the customer lands on the new Step 3 with everything kept
  const old2 = OB.restore({ step: 2, choice: 'scratch', answers: Object.assign({ sections: ['hero', 'gallery'], social: 'removed' }, good) }, M, V3, T);
  assert.deepEqual([old2.step, old2.answers.sections, old2.answers.social, old2.answers.name], [2, ['hero', 'gallery'], 'removed', 'Café Sonne'], 'old Step 3 -> new Step 3 (choose a design first); sections and answers kept');
  assert.equal(OB.restore({ step: 1, choice: 'scratch', answers: good }, M, V3, T).step, 1, 'old Step 2 stays Step 2');
  assert.equal(OB.restore({ step: 3, choice: 'scratch', answers: chosen }, M, V3, T).step, 4, 'old Review (3) -> Step 5 when a design is kept');
  assert.equal(OB.restore({ step: 4, choice: 'scratch', answers: chosen }, M, V3, T).step, 0, 'the old layout had no Step 5: not trusted');
  // O2: the section list and Social Media's mode come back cleaned; Step 5 only with a valid page
  const withSections = OB.restore(v2({ step: 4, choice: 'scratch', answers: Object.assign({ sections: ['gallery', 'hero', 'evil', 'gallery'], social: 'removed' }, chosen) }), M, V3, T);
  assert.deepEqual([withSections.step, withSections.answers.sections, withSections.answers.social], [4, ['hero', 'gallery'], 'removed']);
  assert.equal(OB.restore(v2({ step: 4, choice: 'scratch', answers: Object.assign({}, chosen, { social: 'everything' }) }), M, V3, T).answers.social, 'auto');
  assert.equal(OB.restore(v2({ step: 4, choice: 'scratch', answers: { name: '' } }), M, V3, T).step, 1, 'invalid answers: back to Step 2');
  assert.equal(OB.restore(v2({ step: 2, choice: 'instagram', answers: good }), M, V3, T).step, 0, 'no valid choice: Step 1');
  for (const bad of [null, 'x', 7, [], { step: 99, choice: 'scratch' }, { step: -1 }, { step: 1.5, choice: 'scratch' }, v2({ step: 5, choice: 'scratch' })]) {
    const r = OB.restore(bad, M, V3, T);
    assert.ok(r.step >= 0 && r.step <= 1, JSON.stringify(bad));
    assert.deepEqual(Object.keys(r.answers).sort(), ['description', 'links', 'name', 'palette', 'sections', 'social', 'template']);
  }
  const r = OB.restore({ step: 1, choice: 'scratch', answers: { name: 5, links: [{ platform: 'myspace', url: 'x', token: 't' }, ...Array(12).fill({ platform: 'x', url: '' })], token: 'secret' } }, M, V3, T);
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

test('T1c.1 sectionsFor: the chosen template\'s suggested sections while the list is untouched; Social Media only with links (every template); the customer\'s own list (also just the Hero) never replaced', () => {
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  T.TEMPLATE_IDS.forEach((id) => {
    const s = T.get(id).sections;
    assert.deepEqual(M.sectionsFor({}, true, s), s, id + ' with links: the suggested list, Social Media at its place');
    assert.deepEqual(M.sectionsFor({}, false, s), s.filter((x) => x !== 'socialMedia'), id + ' without links: no Social Media');
    assert.deepEqual(M.sectionsFor({ social: 'removed' }, true, s), s.filter((x) => x !== 'socialMedia'), id + ': removed stays out');
    assert.deepEqual(M.sectionsFor({ social: 'added' }, false, s), s, id + ': added stays in');
    // the customer's lists win over every template
    assert.deepEqual(M.sectionsFor({ sections: ['hero', 'text', 'gallery'] }, false, s), ['hero', 'text', 'gallery'], id);
    assert.deepEqual(M.sectionsFor({ sections: [] }, false, s), ['hero'], id + ': an emptied list stays empty (the Hero only)');
    assert.deepEqual(M.sectionsFor({ sections: ['hero'] }, true, s), ['hero', 'socialMedia'], id + ': links while auto: Social Media added at the end');
  });
  // no template: the O2 defaults, unchanged
  assert.deepEqual(M.sectionsFor({}, false), ['hero', 'buttons', 'openingHours', 'contact']);
  assert.deepEqual(M.sectionsFor({}, false, null), ['hero', 'buttons', 'openingHours', 'contact']);
  assert.deepEqual(M.sanitize({ sections: [] }).sections, ['hero'], 'kept as the customer\'s list');
});

test('T1c.1 pageFor: all six templates, EN / DE, every palette: the template\'s page with the Step 2 details and links (the customer\'s, never examples), example sections listed, the draft without example-only parts; nothing in the answers changed', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  const links = [{ platform: 'instagram', url: 'instagram.com/cafesonne' }, { platform: 'tiktok', url: 'https://www.tiktok.com/@cafesonne' }];
  const own = [{ platform: 'instagram', url: 'https://instagram.com/cafesonne' }, { platform: 'tiktok', url: 'https://www.tiktok.com/@cafesonne' }];
  const at = (d, type) => d.pages[0].sections.find((s) => s.type === type);
  T.TEMPLATE_IDS.forEach((id) => ['en', 'de'].forEach((l) => T.get(id).palettes.forEach((p) => {
    const tag = id + ' ' + l + ' ' + p.id;
    const answers = { template: id, palette: p.id, name: 'Café Sonne', description: 'Kaffee & Kuchen', links: links.slice(), sections: null, social: 'auto' };
    const before = JSON.stringify(answers);
    const r = M.pageFor(V3, T, answers, l);
    assert.equal(JSON.stringify(answers), before, tag + ': the answers untouched');
    assert.ok(r.ok && r.design && r.draft, tag + ' valid: ' + JSON.stringify(r.errors));
    assert.deepEqual(r.sections, T.get(id).sections, tag + ': the suggested list');
    assert.deepEqual(r.design.pages[0].sections.map((s) => s.type), r.sections);
    assert.deepEqual(r.design.pages[0].sections.map((s) => s.id), r.sections.map((x) => M.SECTION_IDS[x]), tag + ': the fixed ids');
    assert.deepEqual(r.design.theme.palette, p.colors, tag + ': the palette');
    // Step 2 stays the customer's: in the preview and in the draft, listed as the customer's
    [r.design, r.draft].forEach((d) => {
      assert.deepEqual([at(d, 'hero').data.headline, at(d, 'hero').data.subheadline], ['Café Sonne', 'Kaffee & Kuchen'], tag);
      assert.deepEqual(at(d, 'socialMedia').data.links, own, tag + ': the customer\'s links');
    });
    assert.ok(r.customerPaths.some((x) => x.endsWith('.data.headline')) && r.customerPaths.some((x) => x.endsWith('.data.links')), tag);
    assert.ok(!r.exampleIds.includes('s_obhero01') && !r.exampleIds.includes('s_obsocial1'), tag + ': the Hero and the customer\'s links are not examples');
    assert.ok(r.exampleIds.includes('s_obbuttons1') && r.exampleIds.length >= 2, tag + ': example sections listed');
    // the draft: no example-only part (buttons, prices, hours, address, example profiles)
    assert.deepEqual(at(r.draft, 'buttons').data.items, [], tag);
    assert.ok(!/example\.com|Musterstra|Sample Street|€/.test(JSON.stringify(r.draft)), tag + ': no example facts in the draft');
    assert.equal(r.name, 'Café Sonne');
  })));
  // no links: no Social Media on any template; no example profile anywhere
  T.TEMPLATE_IDS.forEach((id) => {
    const r = M.pageFor(V3, T, { template: id, palette: null, name: 'Café Sonne', links: [] }, 'en');
    assert.ok(r.ok && !r.sections.includes('socialMedia') && !at(r.design, 'socialMedia'), id + ': no Social Media without links');
    assert.ok(!Object.values(T.PLATFORM_HOME).some((u) => JSON.stringify(r.design).includes(u)), id + ': no example profile');
    assert.equal(r.palette, T.get(id).palettes[0].id, id + ': the first palette by default');
    // added without links: kept, empty, not an example
    const added = M.pageFor(V3, T, { template: id, name: 'Café Sonne', links: [], social: 'added' }, 'en');
    assert.deepEqual([at(added.design, 'socialMedia').data.links, added.emptyIds.includes('s_obsocial1'), added.exampleIds.includes('s_obsocial1')], [[], true, false], id);
  });
});

test('T1c.1 pageFor: the customer\'s own section lists in every template (every type, alone and all together, any order, just the Hero), empty starters where a template has no example, stable ids; unknown template: null', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  const links = [{ platform: 'facebook', url: 'facebook.com/sonne' }];
  const lists = [['hero'], [], M.SECTION_TYPES.slice(), M.SECTION_TYPES.slice().reverse()].concat(M.SECTION_TYPES.filter((x) => x !== 'hero').map((x) => ['hero', x]));
  T.TEMPLATE_IDS.forEach((id) => lists.forEach((list) => ['added', 'auto', 'removed'].forEach((social) => {
    const answers = { template: id, name: 'Sonne', links, sections: list, social };
    const r = M.pageFor(V3, T, answers, 'de');
    const want = M.sectionsFor(answers, true, T.get(id).sections);
    const tag = id + ' ' + JSON.stringify(list) + ' ' + social;
    assert.ok(r.ok && r.draft, tag + ': ' + JSON.stringify(r.errors));
    assert.deepEqual(r.sections, want, tag + ': the customer\'s list');
    assert.deepEqual(r.design.pages[0].sections.map((s) => s.type), want, tag + ': nothing left out');
    assert.deepEqual(r.design.pages[0].sections.map((s) => s.id), want.map((x) => M.SECTION_IDS[x]), tag + ': stable ids');
    assert.deepEqual(r.draft.pages[0].sections.map((s) => s.type), want, tag + ': the draft too');
    const noExample = T.SECTION_TYPES.filter((x) => !T.available(id).includes(x));
    assert.deepEqual(r.emptyIds, want.filter((x) => noExample.includes(x)).map((x) => M.SECTION_IDS[x]), tag + ': empty starters listed');
  })));
  // the same list in two templates: the same sections and ids, only the look changes
  const a = M.pageFor(V3, T, { template: 'restaurant', name: 'Sonne', sections: ['hero', 'gallery', 'contact'] }, 'en');
  const b = M.pageFor(V3, T, { template: 'creator', name: 'Sonne', sections: ['hero', 'gallery', 'contact'] }, 'en');
  assert.deepEqual(a.design.pages[0].sections.map((s) => s.id), b.design.pages[0].sections.map((s) => s.id));
  assert.notDeepEqual(a.design.theme, b.design.theme);
  assert.deepEqual(b.emptyIds, ['s_obgallery1'], 'Creator has no gallery example: empty, not dropped');
  // no or an unknown template: null; checkPage then builds the O2 page as before
  assert.equal(M.pageFor(V3, T, { name: 'Sonne' }, 'en'), null);
  assert.equal(M.pageFor(V3, T, { template: 'evil', name: 'Sonne' }, 'en'), null);
  assert.equal(M.pageFor(V3, null, { template: 'bakery', name: 'Sonne' }, 'en'), null);
  // an invalid name: the page still draws (the typed name or the placeholder), not ok, no draft relied on
  const bad = M.pageFor(V3, T, { template: 'bakery', name: '' }, 'en');
  assert.equal(bad.ok, false); assert.ok(bad.design); assert.equal(bad.name, M.PLACEHOLDER_NAME.en);
});

test('T1c.1 checkPage with the catalog: the template\'s page and sections (composed); without a template or the catalog: the O2 page, unchanged; restore keeps the customer\'s list and checks the template\'s page', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  const links = [{ platform: 'instagram', url: 'instagram.com/sonne' }];
  const answers = { template: 'beauty', palette: 'plum', name: 'Salon Sonne', description: '', links, sections: null, social: 'auto' };
  const r = M.checkPage(V3, answers, 'en', T);
  assert.ok(r.ok && r.pageOk);
  assert.deepEqual(r.sections, T.get('beauty').sections);
  assert.equal(r.page, r.composed.design);
  assert.deepEqual(r.values.links, [{ platform: 'instagram', url: 'https://instagram.com/sonne', row: 0 }], 'Step 2\'s check kept');
  // without the catalog (Steps 4 and 5 until T1c.2) or a template: exactly the O2 page
  assert.deepEqual(M.checkPage(V3, answers, 'en'), M.checkPage(V3, Object.assign({}, answers, { template: null }), 'en', T));
  assert.deepEqual(M.checkPage(V3, answers, 'en').sections, ['hero', 'buttons', 'openingHours', 'contact', 'socialMedia']);
  assert.equal(M.checkPage(V3, answers, 'en').composed, undefined);
  // restore: Step 5 kept with the template's page; the customer's lists (also just the Hero) kept exactly
  const v2 = (o) => Object.assign({ v: OB.STORE_VERSION }, o);
  const kept = OB.restore(v2({ step: 4, choice: 'scratch', answers: Object.assign({}, answers, { sections: ['hero', 'gallery', 'text'], social: 'removed' }) }), M, V3, T);
  assert.deepEqual([kept.step, kept.answers.sections, kept.answers.social, kept.answers.template, kept.answers.palette], [4, ['hero', 'gallery', 'text'], 'removed', 'beauty', 'plum']);
  const bare = OB.restore(v2({ step: 4, choice: 'scratch', answers: Object.assign({}, answers, { template: 'creator', palette: 'coral', sections: [] }) }), M, V3, T);
  assert.deepEqual([bare.step, bare.answers.sections], [4, ['hero']], 'an emptied list: kept (the Hero only)');
  const untouched = OB.restore(v2({ step: 3, choice: 'scratch', answers }), M, V3, T);
  assert.deepEqual([untouched.step, untouched.answers.sections], [3, null], 'untouched stays untouched: follows the template');
});

test('T1c.2 Step 4: the list, add / remove / move, Next and the phone use the template\'s page (M.pageFor through checkPage with the catalog); only its photos; example sections tagged', () => {
  const c = code(SRC);
  assert.ok(c.includes("function sectionsPage() { return M && V3 ? M.checkPage(V3, answers, current, T) : null; }"));
  const step4 = c.slice(c.indexOf('function sections() {'), c.indexOf('function setText('));
  assert.equal((step4.match(/\bpage\(\)/g) || []).length, 0, 'Step 4 never uses the O2 page');
  assert.equal((step4.match(/sectionsPage\(\)/g) || []).length, 8, 'list, add (2), add a Custom Section (2), remove, move, the phone');
  assert.ok(c.slice(c.indexOf("if (nav.step === 3) {"), c.indexOf("var n = next(nav, ok);")).includes('var p = sectionsPage();'), 'Next checks the same page');
  assert.ok(step4.includes("IMAGES.prepareImages(IMAGES.templateUrls(T.get(answers.template).images), photosReady);"), 'only the template\'s photos (T1a helper)');
  assert.ok(step4.includes("html = tout && tout.ok ? PV.liveHtml(PV.markExamples(IMAGES.localizeHtml(tout.html), p.exampleIds, t('example_tag'))) : '';"), 'inline photos, Example tags, the fixed frame script');
  // the reveal and scroll handling unchanged
  assert.ok(step4.includes("if (html && frame.srcdoc !== html) frame.srcdoc = html;") && step4.includes("frame.contentWindow.postMessage(PV.initMessage(frameY, reveal), '*'); reveal = null;"));
  // T1c.3: the O2-only page() is gone; Steps 4 and 5 share sectionsPage()
  assert.ok(!c.includes('function page()') && !/\bpage\(\)/.test(c));
  // the tags: the template's example sections, starter content, empty ones
  assert.ok(c.includes("r.composed.exampleIds.indexOf(M.sectionId(type)) !== -1) { text = t('sec_example'); cls += ' ob-sec__tag--example'; }"));
  for (const k of ['sec_example', 'sec_starter']) assert.ok(OB.TX.en[k] && OB.TX.de[k] && OB.TX.en[k] !== OB.TX.de[k], k);
  assert.deepEqual([OB.TX.en.sec_example, OB.TX.de.sec_example], ['Example · Edit later in Studio', 'Beispiel · Später im Studio bearbeiten'], 'the short example label (T1c.2 polish)');
  assert.ok(!/^Example|^Beispiel/.test(OB.TX.en.sec_starter + OB.TX.de.sec_starter), 'starter content is not called an example');
  // the Step 4 legend: the same short texts as Step 3
  const s4 = HTML.slice(HTML.indexOf('id="ob-step-3"'), HTML.indexOf('id="ob-step-4"'));
  assert.ok(s4.includes('<ul class="ob-legend" id="ob-sections-legend">') && s4.includes('data-ob="legend_yours"') && s4.includes('data-ob="legend_example"'));
});

test('T1c.3 Step 5: the review uses the same template page as Step 4 (sectionsPage: palette, the customer\'s order, Step 2); the phone the template\'s page with inline photos and Example tags; the legend and the "not saved" note in EN / DE; Save Draft untouched', () => {
  const c = code(SRC);
  const rev = c.slice(c.indexOf('function review() {'), c.indexOf('var DR = win.QraivyOnboardingDrafts'));
  assert.ok(c.indexOf('var DR = win.QraivyOnboardingDrafts') > c.indexOf('function review() {'));
  assert.ok(rev.includes('var r = sectionsPage();'), 'the Step 4 page');
  assert.ok(rev.includes("IMAGES.prepareImages(IMAGES.templateUrls(T.get(answers.template).images), photosReady);"), 'only the template\'s photos');
  assert.ok(rev.includes("html = tout && tout.ok ? PV.liveHtml(PV.markExamples(IMAGES.localizeHtml(tout.html), p.exampleIds, t('example_tag'))) : '';"), 'inline photos, Example tags');
  assert.ok(rev.includes('li.appendChild(body(type, r));'), 'the section summary with the Step 4 tags (example / starter / the customer\'s)');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|ob-finish/.test(rev), 'no request, Save Draft not touched (D2.2: renderSave / saveDraft only)');
  assert.deepEqual([OB.TX.en.review_example_note, OB.TX.de.review_example_note], ['Sections marked “Example” come into your draft with example content, so you can edit them in the Studio. The examples are not your business details: replace them with your own.', 'Mit „Beispiel“ markierte Abschnitte kommen mit Beispielinhalten in Ihren Entwurf, damit Sie sie im Studio bearbeiten können. Die Beispiele sind nicht Ihre Unternehmensangaben: Ersetzen Sie sie durch Ihre eigenen.']);
  const s5 = HTML.slice(HTML.indexOf('id="ob-step-4"'));
  assert.ok(s5.includes('<ul class="ob-legend" id="ob-review-legend">') && s5.includes('data-ob="review_example_note"'));
  assert.ok(s5.includes('id="ob-finish" hidden disabled aria-disabled="true"'), 'Save Draft disabled in the markup');
});

test('T1c.2 Step 4 model: Restaurant and Creator: untouched -> the suggested list; add / remove / move from it make the customer\'s list (kept, also Hero-only); the tags\' data (example / starter / empty)', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  const links = [{ platform: 'instagram', url: 'instagram.com/sonne' }];
  const r = M.checkPage(V3, { template: 'restaurant', palette: 'olive', name: 'Sonne', links, sections: null }, 'en', T);
  assert.deepEqual(r.sections, ['hero', 'buttons', 'products', 'gallery', 'text', 'openingHours', 'contact', 'socialMedia']);
  assert.deepEqual(r.composed.exampleIds, ['s_obbuttons1', 's_obproducts1', 's_obhours01', 's_obcontact1'], 'Restaurant: examples');
  assert.deepEqual(r.composed.emptyIds, []);
  const cr = M.checkPage(V3, { template: 'creator', name: 'Sonne', links: [], sections: null }, 'de', T);
  assert.deepEqual(cr.sections, ['hero', 'buttons', 'products', 'text', 'contact'], 'Creator without links: no Social Media');
  // the shell's edits, as the shell makes them: from the page's list
  const answers = { template: 'creator', name: 'Sonne', links: [], sections: null, social: 'auto' };
  let list = M.checkPage(V3, answers, 'en', T).sections; list.push('gallery'); answers.sections = list;   // add
  assert.deepEqual(M.checkPage(V3, answers, 'en', T).sections, ['hero', 'buttons', 'products', 'text', 'contact', 'gallery']);
  assert.deepEqual(M.checkPage(V3, answers, 'en', T).composed.emptyIds, ['s_obgallery1'], 'Creator\'s Gallery: empty, kept');
  list = M.checkPage(V3, answers, 'en', T).sections; list.splice(list.indexOf('buttons'), 1); answers.sections = list;   // remove
  list = M.checkPage(V3, answers, 'en', T).sections; const i = list.indexOf('contact'); list[i] = list[i - 1]; list[i - 1] = 'contact'; answers.sections = list;   // move up
  assert.deepEqual(M.checkPage(V3, answers, 'en', T).sections, ['hero', 'products', 'contact', 'text', 'gallery']);
  assert.deepEqual(M.checkPage(V3, Object.assign({}, answers, { template: 'restaurant' }), 'en', T).sections, ['hero', 'products', 'contact', 'text', 'gallery'], 'the customer\'s list in another template too');
  assert.deepEqual(M.checkPage(V3, Object.assign({}, answers, { sections: ['hero'] }), 'en', T).sections, ['hero'], 'Hero-only kept');
  assert.ok(M.checkPage(V3, Object.assign({}, answers, { sections: ['hero'] }), 'en', T).pageOk, 'a Hero-only page is valid');
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

test('Step 1 demo pages: three fictional V3 designs (creator, Bäckerei MorgenGold, finished café page), EN / DE, valid by core.js; only the three local AI photos; no request', () => {
  const V3 = require('../src/lpV3/core.js');
  const PV = require('../../frontend/public/js/studio/onboarding-previews.js');
  const IM = require('../../frontend/public/js/studio/studio-demo-images.js');
  assert.deepEqual(PV.CARDS, ['instagram', 'website', 'scratch']);
  assert.deepEqual(Object.values(PV.PHOTOS).sort(), IM.STARTERS.slice().sort(), 'the three starter photos, nothing else');
  const photoUrls = IM.STARTERS.map(IM.cloudinaryUrl);
  for (const l of ['en', 'de']) {
    const all = PV.demos(V3, IM.cloudinaryUrl, l);
    for (const id of PV.CARDS) {
      const v = V3.validateDesign(all[id].design);
      assert.ok(v.ok, l + ' ' + id + ' is a valid design: ' + JSON.stringify(v.errors));
      assert.equal(all[id].design.settings.language, l);
      assert.ok(all[id].design.pages[0].sections.every((s) => V3.describe().sections[s.type].rendered), id + ': only sections the public page renders');
      // every image is one of the three local, AI-labelled photos
      const imgs = JSON.stringify(all[id].design).match(/https:\/\/res\.cloudinary\.com[^"]+/g) || [];
      assert.ok(imgs.every((u) => photoUrls.includes(u)), id + ': only the starter photos');
    }
    assert.deepEqual(PV.CARDS.map((k) => all[k].name), ['Mia backt', 'Bäckerei MorgenGold', 'Café Sonnenschein']);
    const types = (k) => all[k].design.pages[0].sections.map((s) => s.type);
    assert.deepEqual(types('instagram'), ['hero', 'gallery', 'socialMedia', 'products'], 'creator storefront: profile header, photo feed, social links, shop');
    assert.equal(all.instagram.design.pages[0].sections[1].data.images.length, 4, 'the feed: a 2 x 2 grid on the phone');
    assert.ok(all.instagram.design.pages[0].sections[3].data.items.every((p) => p.price && p.image), 'the shop: products with prices and photos');
    assert.deepEqual(types('website'), ['hero', 'products', 'openingHours', 'contact'], 'bakery: photo hero, products, hours, contact');
    assert.deepEqual(types('scratch'), ['hero', 'buttons', 'text', 'openingHours'], 'finished page: hero, buttons, sections');
    assert.ok(JSON.stringify(all.website.design).includes('Ulm'));
    assert.deepEqual([all.scratch.design.pages[0].sections[0].variant, all.scratch.design.pages[0].sections[0].data.backgroundImage], ['overlay', IM.cloudinaryUrl('bakery-coffee-01')], 'the finished page: a photo hero (overlay keeps the text readable)');
  }
  // rendered by core.js, localized, no script; each photo marked by the localizer (the AI label) in the browser
  const html = PV.previews({ V3, imageUrl: IM.cloudinaryUrl, lang: 'de', localize: (h) => h + '<!--localized-->' });
  for (const id of PV.CARDS) assert.ok(/^<!DOCTYPE html>/.test(html[id]) && html[id].endsWith('<!--localized-->'), id + ': rendered by core.js, then localized');
  assert.ok(html.instagram.includes('Neueste Beiträge') && html.instagram.includes('Zum Shop') && html.website.includes('Jeden Morgen ofenfrisch') && html.scratch.includes('Tisch reservieren'));
  assert.ok(!/<script/i.test(html.instagram + html.website + html.scratch), 'no script in the pages');
  assert.equal(PV.previews({ V3, imageUrl: IM.cloudinaryUrl, lang: 'en' }).website.includes('Fresh from the oven every morning'), true);
  const src = code(read('js/studio/onboarding-previews.js'));
  for (const re of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage|sessionStorage|document\.cookie/, /innerHTML|document\.write/, /\beval\s*\(|new\s+Function|toString\s*\(/]) assert.ok(!re.test(src), 'onboarding-previews.js must not contain ' + re);
  // the only addresses in the file are the demo pages' own social / map links (page content in frames that cannot navigate), never an image or script
  const urls = src.match(/https?:\/\/[^'"\s]+/g) || [];
  assert.ok(urls.every((u) => /^https:\/\/(www\.instagram\.com|www\.tiktok\.com|www\.youtube\.com|www\.pinterest\.de|wa\.me|maps\.google\.com)\//.test(u)), 'only demo link targets: ' + urls);
  // the frames get the page only through srcdoc; the Studio demo is no longer loaded here
  assert.ok(code(SRC).includes('frames[i].srcdoc = page;'));
  assert.ok(!HTML.includes('studio-demo.js"') && !code(SRC).includes('QRAIVY_STUDIO_DEMO'));
});

test('O2.1 appearance: the Studio\'s preference (light / dark / system, Light by default); stored only there; no request; the markup', () => {
  const TH = require('../../frontend/public/js/studio/onboarding-theme.js');
  assert.equal(TH.KEY, 'qraivy.studio.theme', 'the Studio\'s own key (studio-shell.js THEME_KEY)');
  assert.ok(read('js/studio/studio-shell.js').includes("var THEME_KEY = 'qraivy.studio.theme';"), 'the same key as the Studio');
  assert.deepEqual(TH.PREFS, ['light', 'dark', 'system']);
  for (const x of [null, undefined, '', 'DARK', 'blue', 1]) assert.equal(TH.clean(x), 'light', 'nothing stored or unknown: Light');
  assert.deepEqual(['light', 'dark', 'system', 'system'].map((p, i) => TH.resolve(p, i === 3)), ['light', 'dark', 'light', 'dark'], 'system follows the device');
  const c = code(read('js/studio/onboarding-theme.js'));
  for (const re of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /sessionStorage|document\.cookie|indexedDB/, /innerHTML|document\.write/, /\beval\s*\(|new\s+Function/, /https?:\/\//]) assert.ok(!re.test(c), 'onboarding-theme.js must not contain ' + re);
  assert.equal((c.match(/localStorage\.(get|set)Item\(/g) || []).length, 2, 'one read, one write');
  assert.ok(c.includes('win.localStorage.getItem(KEY)') && c.includes('win.localStorage.setItem(KEY, pref)'), 'only the preference key');
  assert.ok(c.includes("pref = p === 'dark' ? 'dark' : 'light';"), 'the toggle writes light or dark only');
  assert.ok(!/localStorage/.test(code(SRC)), 'the wizard itself still uses no localStorage');
  // markup: the toggle beside EN / DE in the black header; the background and the checklist are decoration
  const top = HTML.slice(HTML.indexOf('<header class="ob-top">'), HTML.indexOf('</header>'));
  assert.ok(top.indexOf('class="ob-lang"') < top.indexOf('class="ob-theme"') && top.indexOf('class="ob-theme"') < top.indexOf('id="ob-signout"'), 'the toggle right after EN / DE');
  assert.match(top, /<div class="ob-theme" role="group" aria-label="Appearance" data-ob-aria="theme_group">/);
  for (const t of ['light', 'dark']) assert.match(top, new RegExp('<button type="button" class="ob-theme__btn" data-ob-theme-choice="' + t + '" aria-pressed="(true|false)" aria-label="[^"]+" data-ob-aria="theme_' + t + '">'));
  assert.match(HTML, /<div class="ob-bg" aria-hidden="true">/);
  assert.match(HTML, /<aside class="ob-benefits" aria-hidden="true">/);
  assert.equal((HTML.match(/class="ob-benefits__item"/g) || []).length, 4);
  // the handwritten note (approved later in O2.1): only in its decorative, hidden part
  assert.equal((HTML.match(/digital business page/g) || []).length, 1);
  const note = HTML.slice(HTML.indexOf('<div class="ob-note" aria-hidden="true">'), HTML.indexOf('</div>', HTML.indexOf('<div class="ob-note"')));
  assert.ok(note.includes('data-ob="note_text">Create your digital business page in minutes!</p>'), 'in the hidden note');
  assert.equal(OB.TX.de.note_text, 'Erstellen Sie Ihre digitale Geschäftsseite in wenigen Minuten!');
  assert.equal((HTML.match(/<img\b/g) || []).length, 1, 'the approved logo is still the only image');
});

test('O2.1 colours: QDS tokens in Dark, dark text on orange, black header in both; readable contrast for every text pair in Light and Dark', () => {
  const css = read('css/studio-onboarding.css');
  const block = (sel) => { const i = css.indexOf(sel + ' {'); const b = css.slice(i, css.indexOf('\n}', i)); return Object.fromEntries([...b.matchAll(/(--ob-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])); };
  const light = block(':root'), dark = Object.assign({}, light, block(':root[data-ob-theme="dark"]'));
  // QDS (frontend/public/qds/foundation/colors.css)
  const qds = read('qds/foundation/colors.css');
  for (const [k, v] of [['--ob-bg', '#0a0a0a'], ['--ob-surface', '#111111'], ['--ob-surface-2', '#1a1a1a'], ['--ob-text', '#f0ece0'], ['--ob-text-2', '#c8c8c0'], ['--ob-muted', '#a0a09a']]) {
    assert.equal(dark[k], v, 'Dark ' + k); assert.ok(qds.includes(v), v + ' is a QDS value');
  }
  for (const t of [light, dark]) { assert.equal(t['--ob-accent'], '#ff5a1f'); assert.equal(t['--ob-on-accent'], '#0a0a0a'); assert.equal(t['--ob-accent-hover'], '#ff7a45'); assert.equal(t['--ob-accent-active'], '#e6490f'); }
  assert.ok(css.includes('.ob-btn--primary { background: var(--ob-accent); color: var(--ob-on-accent); }'), 'primary: orange, dark text');
  assert.ok(css.includes('padding: 12px 16px; background: #000000; border-bottom: 1px solid #000000; color: #ffffff;'), 'the header: solid black, not a token (the same in both)');
  assert.ok(css.includes('background: #fff; color-scheme: light;'), 'the phone frames keep the customer page\'s appearance');
  // contrast (WCAG): text on its surface, rgba backgrounds composed over the card
  const rgb = (v, under) => {
    let m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    m = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/.exec(v);
    if (m) { const a = +m[4]; return [1, 2, 3].map((i, j) => Math.round(+m[i] * a + under[j] * (1 - a))); }
    throw new Error('colour ' + v);
  };
  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const pairs = [['--ob-text', '--ob-surface'], ['--ob-text-2', '--ob-surface'], ['--ob-muted', '--ob-surface'], ['--ob-muted', '--ob-surface-2'], ['--ob-navy', '--ob-surface'],
    ['--ob-accent-text', '--ob-surface'], ['--ob-accent-text', '--ob-accent-soft'], ['--ob-on-accent', '--ob-accent'], ['--ob-on-accent', '--ob-accent-hover'], ['--ob-on-accent', '--ob-accent-active'],
    ['--ob-info-text', '--ob-info-bg'], ['--ob-add', '--ob-add-bg'], ['--ob-danger', '--ob-surface'], ['--ob-muted', '--ob-tag-bg'], ['--ob-text', '--ob-bg']];
  for (const [name, t] of [['Light', light], ['Dark', dark]]) {
    const card = rgb(t['--ob-surface'], [255, 255, 255]);
    for (const [fg, bg] of pairs) {
      const r = ratio(rgb(t[fg], card), rgb(t[bg], card));
      assert.ok(r >= 4.5, name + ': ' + fg + ' on ' + bg + ' = ' + r.toFixed(2));
    }
  }
});

test('T1b Step 3: the "Example" tag on sections with example content only (fixed text, escaped, valid ids only, its style once); the hero and other sections untouched', () => {
  const PV = require('../../frontend/public/js/studio/onboarding-previews.js');
  const V3 = require('../src/lpV3/core.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  const s = T.sample(V3, 'restaurant', { lang: 'en', name: 'Café Sonne' });
  const html = V3.renderDesign(s.design, { businessName: 'Café Sonne' }, { preview: true }).html;
  const ids = ['s_obbuttons1', 's_obproducts1', 'evil"><script>', 's_obhours01'];
  const out = PV.markExamples(html, ids, 'Example <b>');
  assert.equal((out.match(/<span class="ob-ex">Example &#60;b&#62;<\/span>/g) || []).length, 3, 'three tags, the label escaped');
  assert.equal((out.match(/<style>\.ob-ex\{/g) || []).length, 1, 'the style once');
  assert.ok(/data-v3-id="s_obbuttons1"[^>]*><div class="v3-wrap"><span class="ob-ex">/.test(out), 'at the top of the section');
  assert.ok(!/data-v3-id="s_obhero01"[^>]*>[^]{0,200}ob-ex/.test(out.replace(/<style>[^]*?<\/style>/g, '')), 'the hero (the customer\'s name) is not tagged');
  assert.ok(!out.includes('<script>'), 'nothing injected from an id');
  assert.equal(PV.markExamples(html, [], 'Example'), html, 'no example section: unchanged');
  assert.equal(PV.markExamples('<p>x</p>', ['s_obbuttons1'], 'Example'), '', 'not a page: nothing');
});

test('T1b Step 3: the shell draws the chosen template with the customer\'s answers, only its photos, example sections tagged; Next waits for a design; nothing else on the page changes', () => {
  const c = code(SRC);
  // T1c.1: the shared M.pageFor builds the page (the customer's own name, description and links: tested on the model),
  // Step 3 with the template's suggested sections until T1c.2
  assert.ok(c.includes("var p = M.pageFor(V3, T, Object.assign({}, answers, { sections: null, social: 'auto' }), current);"), 'the shared composition');
  assert.equal((c.match(/T\.sample\(|T\.starter\(|T\.compose\(/g) || []).length, 0, 'no page built by the shell itself');
  assert.ok(c.includes("IMAGES.prepareImages(IMAGES.templateUrls(T.get(answers.template).images), photosReady);"), 'only the chosen template\'s photos');
  assert.ok(c.includes("function photosReady() { if (nav.step === 2) drawDesign(); if (nav.step === 3) drawSections(); if (nav.step === 4) review(); }"), 'redrawn on the step on screen');
  assert.ok(c.includes("var html = PV.liveHtml(PV.markExamples(IMAGES.localizeHtml(out.html), p.exampleIds, t('example_tag')));"), 'inline photos, example tags, the fixed frame script');
  assert.ok(c.includes("if (step > 3 && !M.checkPage(V3, answers, 'en', T).pageOk) step = 3;"), 'restore checks the template\'s page');
  assert.ok(c.includes("$('ob-next').disabled = !canNext(nav, s === 2 ? designOk() : undefined);"), 'Next disabled until a design is chosen');
  // choosing a template or palette changes only template / palette (Step 2 answers and the section list are kept)
  const pick = c.slice(c.indexOf('function pickTemplate('), c.indexOf('function drawDesign('));
  // T1c.4: only the notice's two explicit actions change the section list; picking a template or palette never does
  const actions = pick.slice(pick.indexOf('function useSuggested('), pick.indexOf('function pickPalette('));
  assert.ok(actions.length > 0 && !/answers\.(name|description|links|sections|social)\s*=/.test(pick.replace(actions, '')), 'never touches the customer\'s answers or sections');
  assert.deepEqual((actions.match(/answers\.(\w+)\s*=/g) || []).map((x) => x.replace(/\s*=$/, '')), ['answers.sections', 'answers.social', 'answers.sections', 'answers.social'], 'useSuggested and undoSwitch: the section list and Social Media mode only');
  assert.ok(/answers\.template = id;/.test(pick) && /answers\.palette = /.test(pick));
  // texts of Step 3 in both languages
  for (const k of ['step_design', 'design_text', 'pal_title', 'design_hint', 'design_empty', 'design_selected', 'pal_selected', 'selected', 'legend_yours', 'legend_example', 'example_tag', 'live_note_design', 'jump_preview']) {
    assert.ok(OB.TX.en[k] && OB.TX.de[k] && (OB.TX.en[k] !== OB.TX.de[k] || k === 'selected'), k);
  }
  assert.deepEqual([OB.TX.en.step_sections, OB.TX.de.step_sections, OB.TX.en.step_review], ['Customize your page', 'Seite anpassen', 'Review & save draft']);
  // the legend, short: the customer's details and the demo content (the 'Example' tags stay in the phone)
  assert.deepEqual([OB.TX.en.legend_yours, OB.TX.en.legend_example], ['Your details from Step 2', '“Example”: demo, not your real details']);
  assert.deepEqual([OB.TX.de.legend_yours, OB.TX.de.legend_example], ['Ihre Angaben aus Schritt 2', '„Beispiel“: Demo, nicht Ihre Angaben']);
  for (const l of ['en', 'de']) assert.ok(OB.TX[l].legend_example.includes(OB.TX[l].example_tag), l + ': the legend names the tag');
  assert.deepEqual([OB.TX.en.jump_preview, OB.TX.de.jump_preview], ['See live preview', 'Live-Vorschau ansehen']);
  assert.ok(/getElementById\('ob-design-jump'\)|\$\('ob-design-jump'\)/.test(c) && /scrollIntoView/.test(c), 'the jump scrolls to the existing phone');
  assert.ok(c.includes("$('ob-design-jump').disabled = !designOk();"), 'the jump enabled with a design');
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

test('Custom Sections (model): repeatable "custom:" entries with stable instance ids; cleaned and capped; an empty core.js Text section each; kept by sanitize; a template switch keeps them; nothing invented', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  // ids
  assert.equal(M.isCustom('custom:ab12cd34'), true);
  for (const bad of ['custom:AB12CD34', 'custom:ab12', 'custom:ab12cd345', 'text', 'custom', null, 3]) assert.equal(M.isCustom(bad), false, String(bad));
  assert.equal(M.sectionId('custom:ab12cd34'), 's_cab12cd34');
  assert.equal(M.sectionId('text'), M.SECTION_IDS.text);
  assert.match(M.sectionId('custom:ab12cd34'), /^s_[a-z0-9]{4,16}$/, 'a valid core.js section id');
  assert.ok(Object.values(M.SECTION_IDS).every((id) => !/^s_c[a-z0-9]{8}$/.test(id)), 'no clash with the fixed ids');
  // new entries: unique, never one already in the list
  const seq = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]; let k = 0;
  const first = M.newCustom([], () => seq[k++ % seq.length]);
  k = 0;
  const second = M.newCustom([first], () => seq[k++ % seq.length]);
  assert.ok(M.isCustom(first) && M.isCustom(second) && first !== second, first + ' ' + second);
  // cleaned: each instance once, at most MAX_CUSTOM, the Hero first, unknown dropped, order kept
  const many = Array.from({ length: 14 }, (_, i) => 'custom:' + String(i).padStart(8, '0'));
  const c = M.cleanSections(['buttons', 'custom:aaaa1111', 'custom:aaaa1111', 'custom:BAD', 'text', 'nope', ...many]);
  assert.deepEqual(c.slice(0, 4), ['hero', 'buttons', 'custom:aaaa1111', 'text']);
  assert.equal(c.filter(M.isCustom).length, M.MAX_CUSTOM);
  assert.equal(M.MAX_CUSTOM, 10);
  // kept across a reload (sanitize)
  assert.deepEqual(M.sanitize({ sections: ['hero', 'custom:aaaa1111', 'text', 'custom:bbbb2222'] }).sections, ['hero', 'custom:aaaa1111', 'text', 'custom:bbbb2222']);
  // the template page: an empty Text section per instance, in place, listed as empty, never an example
  const list = ['hero', 'custom:aaaa1111', 'buttons', 'custom:bbbb2222', 'text'];
  for (const tpl of ['restaurant', 'creator', 'services']) {
    const p = M.pageFor(V3, T, { template: tpl, name: 'Café Sonne', description: '', links: [], sections: list, social: 'auto' }, 'en');
    assert.ok(p.ok, tpl);
    const secs = p.design.pages[0].sections;
    assert.deepEqual(secs.map((s) => s.id).slice(0, 4), ['s_obhero01', 's_caaaa1111', 's_obbuttons1', 's_cbbbb2222'], tpl + ': order');
    for (const id of ['s_caaaa1111', 's_cbbbb2222']) {
      const s = secs.find((x) => x.id === id);
      assert.equal(s.type, 'text', tpl + ': a core.js Text section');
      assert.ok(!s.data.heading && !s.data.body && !s.data.image, tpl + ': empty, nothing invented');
      assert.ok(p.emptyIds.includes(id) && !p.exampleIds.includes(id), tpl + ': listed as empty');
    }
    // preview: core.js's own "empty section" note on each; the draft (public rendering): nothing shown for them
    const prev = V3.renderDesign(p.design, { businessName: 'Café Sonne' }, { preview: true }).html;
    assert.equal((prev.match(/Empty section – add content in the editor/g) || []).length >= 2, true, tpl + ': preview notes');
    const pub = V3.renderDesign(p.draft, { businessName: 'Café Sonne' }, {}).html;
    assert.ok(!/Empty section/.test(pub), tpl + ': nothing on the public page');
  }
  // German preview note
  const de = M.pageFor(V3, T, { template: 'bakery', name: 'Bäckerei', links: [], sections: ['hero', 'custom:aaaa1111'], social: 'auto' }, 'de');
  assert.match(V3.renderDesign(de.design, { businessName: 'x' }, { preview: true }).html, /Leerer Abschnitt – Inhalte im Editor ergänzen/);
  // a template switch keeps the customer's list, Custom Sections included
  const a = { template: 'restaurant', name: 'Café Sonne', links: [], sections: list, social: 'auto' };
  const before = M.pageFor(V3, T, a, 'en').sections;
  const after = M.pageFor(V3, T, Object.assign({}, a, { template: 'beauty' }), 'en').sections;
  assert.deepEqual(after, before);
  // without a template (checkPage without the catalog) the same empty Text sections
  const plain = M.checkPage(V3, { name: 'Café Sonne', links: [], sections: ['hero', 'custom:aaaa1111'], social: 'auto' }, 'en');
  assert.ok(plain.pageOk && plain.page.pages[0].sections[1].id === 's_caaaa1111' && plain.page.pages[0].sections[1].type === 'text');
  // EN / DE names
  assert.deepEqual([OB.TX.en.sec_custom, OB.TX.de.sec_custom], ['Custom Section', 'Eigener Abschnitt']);
  for (const key of ['sec_custom_text', 'sec_custom_more']) assert.ok(OB.TX.en[key] && OB.TX.de[key], key);
  // the shared renderer is not touched for this
  const crypto = require('crypto'), h = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  assert.equal(h(path.join(PUB, 'js/lpV3/core.js')), h(path.join(__dirname, '../src/lpV3/core.js')), 'both core.js copies identical');
});

test('T1c.4 switch protection (pure): suggestedSections is the template\'s own list; restoreSwitch keeps the notice state only while it still fits (same template, list unchanged since), with the exact previous list for Undo', () => {
  const V3 = require('../src/lpV3/core.js');
  const M = require('../../frontend/public/js/studio/onboarding-model.js');
  const T = require('../../frontend/public/js/studio/onboarding-templates.js');
  const base = { name: 'Café Sonne', description: '', links: [], social: 'auto' };
  // suggested: the template's list as an untouched list would have it (Social Media only with Step 2 links)
  for (const tpl of ['restaurant', 'bakery', 'beauty', 'retail', 'creator', 'services']) {
    const a = Object.assign({}, base, { template: tpl, sections: ['hero', 'custom:aaaa1111'] });
    assert.deepEqual(M.suggestedSections(V3, T, a, 'en'), M.pageFor(V3, T, Object.assign({}, a, { sections: null }), 'en').sections, tpl);
    const withLink = Object.assign({}, a, { links: [{ platform: 'instagram', url: 'instagram.com/sonne' }] });
    assert.deepEqual(M.suggestedSections(V3, T, withLink, 'en'), M.pageFor(V3, T, Object.assign({}, withLink, { sections: null }), 'en').sections, tpl + ' with a link');
  }
  assert.equal(M.suggestedSections(V3, T, Object.assign({}, base, { template: null }), 'en'), null);
  // restoreSwitch
  const prev = ['hero', 'custom:bbbb2222', 'buttons', 'custom:aaaa1111', 'contact'];
  const kept = Object.assign({}, base, { template: 'creator', sections: prev.slice() });
  const applied = Object.assign({}, base, { template: 'creator', sections: null });
  assert.deepEqual(OB.restoreSwitch({ kind: 'kept', tpl: 'creator' }, kept, M), { kind: 'kept', tpl: 'creator' });
  assert.deepEqual(OB.restoreSwitch({ kind: 'applied', tpl: 'creator', prev, prevSocial: 'removed' }, applied, M), { kind: 'applied', tpl: 'creator', prev, prevSocial: 'removed' }, 'the exact list, Custom Section ids and order kept');
  assert.equal(OB.restoreSwitch({ kind: 'kept', tpl: 'restaurant' }, kept, M), null, 'another template');
  assert.equal(OB.restoreSwitch({ kind: 'kept', tpl: 'creator' }, applied, M), null, 'kept needs a customised list');
  assert.equal(OB.restoreSwitch({ kind: 'applied', tpl: 'creator', prev }, kept, M), null, 'applied needs the untouched list (changed since: no Undo over newer edits)');
  assert.equal(OB.restoreSwitch({ kind: 'applied', tpl: 'creator', prev: 'x' }, applied, M), null, 'bad prev');
  assert.equal(OB.restoreSwitch({ kind: 'weird', tpl: 'creator' }, kept, M), null);
  assert.equal(OB.restoreSwitch(null, kept, M), null);
  assert.equal(OB.restoreSwitch({ kind: 'applied', tpl: 'creator', prev, prevSocial: 'evil' }, applied, M).prevSocial, 'auto', 'unknown Social Media mode -> auto');
  const dirty = OB.restoreSwitch({ kind: 'applied', tpl: 'creator', prev: ['custom:aaaa1111', 'custom:aaaa1111', 'nope', 'text'] }, applied, M);
  assert.deepEqual(dirty.prev, ['hero', 'custom:aaaa1111', 'text'], 'prev cleaned like any list');
  // texts
  for (const k of ['switch_kept_title', 'switch_kept_text', 'switch_custom_one', 'switch_custom_many', 'switch_use', 'switch_applied_title', 'switch_applied_text', 'switch_undo', 'switch_undo_label', 'switch_kept_say', 'switch_applied_say', 'switch_undone_say']) assert.ok(OB.TX.en[k] && OB.TX.de[k], k);
  assert.equal(OB.TX.en.switch_use, 'Use {name}\'s suggested sections');
  assert.equal(OB.TX.de.switch_use, 'Vorgeschlagene Abschnitte von {name} verwenden');
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
