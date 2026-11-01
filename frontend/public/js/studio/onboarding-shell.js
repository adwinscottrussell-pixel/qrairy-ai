/*
 * onboarding-shell.js — Landing Page Studio V3 onboarding (Phase O0): the
 * four-step wizard frame and Step 1 (Get started).
 *
 * Only studio-onboarding.html loads this file. It starts only on the
 * isolated Studio V3 staging address (studio-routing.js isolated: the
 * isolated staging API and the separate Clerk DEVELOPMENT application);
 * on every other address, production included, it shows a notice, loads no
 * sign-in and sends nothing.
 *
 * Phase O0 sends no request at all: no fetch, no draft, no save. The sign-in
 * (studio-auth.js) only tells it who is signed in and whether the email is
 * verified; the server checks that again before any draft is created
 * (lpV3/draftPolicy.js, later phases). Steps 2-4 are placeholders: nothing is
 * collected or stored. Instagram and Website import are shown as "Coming
 * soon" and cannot be chosen.
 *
 * In Node: module.exports (the pure parts, for the tests). In the browser:
 * window.QraivyOnboarding, and it starts itself.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.QraivyOnboarding = api; api.start(root); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STEPS = ['start', 'business', 'sections', 'review'];
  // Step 1: only Start from Scratch is available in this version
  var OPTIONS = [
    { id: 'instagram', available: false },
    { id: 'website', available: false },
    { id: 'scratch', available: true },
  ];

  var TX = {
    en: {
      page_title: 'Get started — QRAIVY', lang_group: 'Language', progress_label: 'Progress', step_of: 'Step {n} of {total}',
      step_start: 'Get started', step_business: 'Business information', step_sections: 'Choose sections', step_review: 'Review & save',
      start_title: 'How would you like to start?', start_text: 'Choose how to create your landing page. You can change everything later in the Studio.',
      opt_instagram: 'Instagram', opt_instagram_text: 'Start with your Instagram profile.',
      opt_website: 'Existing Website', opt_website_text: 'Bring your existing website into QRAIVY.',
      opt_scratch: 'Start from Scratch', opt_scratch_text: 'Build your landing page your way.',
      soon: 'Coming soon', available: 'Available',
      start_help: 'Instagram and website import are coming soon. Nothing is imported in this version.',
      business_text: 'Your business name, a short description and your social media links.',
      sections_text: 'Pick the sections for your page, put them in order and see a live phone preview.',
      review_text: 'Check your page, then save it as an unpublished draft and continue in the Studio.',
      placeholder_text: 'This step is still being built. Nothing is collected or saved yet.',
      review_placeholder: 'This step is still being built. No draft is created yet.',
      back: 'Back', next: 'Next', finish_soon: 'Create draft — coming soon', exit: 'Back to Studio', sign_out: 'Sign out',
      unavailable_title: "Onboarding isn't available here yet", unavailable_text: 'The new onboarding is still being built and tested. Your landing pages keep working as before.',
      loading_title: 'Checking your sign-in …', loading_text: 'One moment.',
      signedout_title: 'Create your landing page', signedout_text: 'Sign in or create a free account to start. No payment card needed.',
      signedout_info: 'Creating and saving drafts is free. Your 14-day trial only starts when you choose to publish.',
      sign_in: 'Sign in', sign_up: 'Create account',
      unverified_title: 'Please verify your email address', unverified_text: 'We sent you a code when you signed up. Verify your email address to start building your page.',
      unverified_info: 'For your security, pages can only be created with a verified email address.',
      verify_open: 'Verify my email', verify_recheck: 'I have verified it',
      error_title: 'The sign-in could not be loaded', error_text: 'Check your connection and try again.', retry: 'Try again',
    },
    de: {
      page_title: 'Loslegen — QRAIVY', lang_group: 'Sprache', progress_label: 'Fortschritt', step_of: 'Schritt {n} von {total}',
      step_start: 'Loslegen', step_business: 'Unternehmensdaten', step_sections: 'Abschnitte wählen', step_review: 'Prüfen & speichern',
      start_title: 'Wie möchten Sie starten?', start_text: 'Wählen Sie, wie Ihre Landingpage entstehen soll. Im Studio können Sie später alles ändern.',
      opt_instagram: 'Instagram', opt_instagram_text: 'Starten Sie mit Ihrem Instagram-Profil.',
      opt_website: 'Bestehende Website', opt_website_text: 'Bringen Sie Ihre bestehende Website zu QRAIVY.',
      opt_scratch: 'Neu beginnen', opt_scratch_text: 'Gestalten Sie Ihre Landingpage ganz nach Ihren Wünschen.',
      soon: 'Demnächst', available: 'Verfügbar',
      start_help: 'Der Import von Instagram und Websites folgt bald. In dieser Version wird nichts importiert.',
      business_text: 'Ihr Unternehmensname, eine kurze Beschreibung und Ihre Social-Media-Links.',
      sections_text: 'Wählen Sie die Abschnitte Ihrer Seite, legen Sie die Reihenfolge fest und sehen Sie eine Live-Vorschau auf dem Smartphone.',
      review_text: 'Prüfen Sie Ihre Seite, speichern Sie sie als unveröffentlichten Entwurf und arbeiten Sie im Studio weiter.',
      placeholder_text: 'Dieser Schritt wird noch gebaut. Es wird noch nichts erfasst oder gespeichert.',
      review_placeholder: 'Dieser Schritt wird noch gebaut. Es wird noch kein Entwurf erstellt.',
      back: 'Zurück', next: 'Weiter', finish_soon: 'Entwurf erstellen – demnächst', exit: 'Zurück zum Studio', sign_out: 'Abmelden',
      unavailable_title: 'Das Onboarding ist hier noch nicht verfügbar', unavailable_text: 'Das neue Onboarding wird noch gebaut und getestet. Ihre Landingpages funktionieren weiter wie bisher.',
      loading_title: 'Anmeldung wird geprüft …', loading_text: 'Einen Moment bitte.',
      signedout_title: 'Erstellen Sie Ihre Landingpage', signedout_text: 'Melden Sie sich an oder erstellen Sie ein kostenloses Konto. Keine Zahlungskarte nötig.',
      signedout_info: 'Entwürfe erstellen und speichern ist kostenlos. Ihre 14-tägige Testphase beginnt erst, wenn Sie veröffentlichen.',
      sign_in: 'Anmelden', sign_up: 'Konto erstellen',
      unverified_title: 'Bitte bestätigen Sie Ihre E-Mail-Adresse', unverified_text: 'Bei der Registrierung haben wir Ihnen einen Code gesendet. Bestätigen Sie Ihre E-Mail-Adresse, um mit Ihrer Seite zu beginnen.',
      unverified_info: 'Zu Ihrer Sicherheit können Seiten nur mit einer bestätigten E-Mail-Adresse erstellt werden.',
      verify_open: 'E-Mail bestätigen', verify_recheck: 'Ich habe sie bestätigt',
      error_title: 'Die Anmeldung konnte nicht geladen werden', error_text: 'Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.', retry: 'Erneut versuchen',
    },
  };

  function lang(l) { return l === 'de' ? 'de' : 'en'; }
  function tx(l, k) { var d = TX[lang(l)]; return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : TX.en[k]; }

  // Where the wizard may start: only the isolated Studio V3 staging address
  // (its API and the Clerk development key). Everything else: the notice.
  function canStart(routing) {
    return !!(routing && routing.blocked === false && routing.isolated === true && routing.api && routing.clerk);
  }

  // The sign-in state from Clerk (null: it could not be loaded).
  // 'ready' only for a signed-in user whose primary email is verified.
  function authState(c) {
    if (!c) return 'error';
    var u = c.user;
    if (!u || !c.session) return 'signedout';
    var e = u.primaryEmailAddress;
    return e && e.verification && e.verification.status === 'verified' ? 'ready' : 'unverified';
  }

  // The wizard's navigation state: { step, choice }. Pure.
  function choose(s, id) {
    var o = OPTIONS.filter(function (x) { return x.id === id; })[0];
    return o && o.available ? { step: s.step, choice: id } : s;
  }
  function canNext(s) {
    if (s.step === 0) return s.choice === 'scratch';
    return s.step > 0 && s.step < STEPS.length - 1;
  }
  function next(s) { return canNext(s) ? { step: s.step + 1, choice: s.choice } : s; }
  function back(s) { return s.step > 0 ? { step: s.step - 1, choice: s.choice } : s; }

  // ── the page ──
  function start(win) {
    var doc = win.document;
    var $ = function (id) { return doc.getElementById(id); };
    var ROUTING = win.QRAIVY_STUDIO_ROUTING || { mode: 'unavailable', api: '', blocked: true };
    var current = lang(win.QRAIVY_LANGUAGE);
    var nav = { step: 0, choice: null };
    var auth = 'loading';
    var AUTH = null, clerk = null;

    function t(k) { return tx(current, k); }
    function texts() {
      doc.documentElement.lang = current;
      doc.title = t('page_title');
      var nodes = doc.querySelectorAll('[data-ob]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-ob'));
      var aria = doc.querySelectorAll('[data-ob-aria]');
      for (var j = 0; j < aria.length; j++) aria[j].setAttribute('aria-label', t(aria[j].getAttribute('data-ob-aria')));
      var langs = doc.querySelectorAll('.ob-lang__btn');
      for (var k = 0; k < langs.length; k++) langs[k].setAttribute('aria-pressed', String(langs[k].getAttribute('data-lang') === current));
    }

    function show(id) {
      ['ob-unavailable', 'ob-gate', 'ob-wizard'].forEach(function (x) { $(x).hidden = x !== id; });
    }
    function gate(state) {
      var icon = { loading: 'ob-lock', signedout: 'ob-lock', unverified: 'ob-mail', error: 'ob-info' }[state];
      $('ob-gate-icon').querySelector('use').setAttribute('href', '#' + icon);
      $('ob-gate-title').textContent = t(state + '_title');
      $('ob-gate-text').textContent = t(state + '_text');
      var info = state === 'signedout' || state === 'unverified' ? t(state + '_info') : '';
      $('ob-gate-info').hidden = !info;
      $('ob-gate-info-text').textContent = info;
      $('ob-signin').hidden = state !== 'signedout';
      $('ob-signup').hidden = state !== 'signedout';
      $('ob-verify').hidden = state !== 'unverified' || !(clerk && typeof clerk.openUserProfile === 'function');
      $('ob-recheck').hidden = state !== 'unverified';
      $('ob-retry').hidden = state !== 'error';
    }
    function wizard(focus) {
      var s = nav.step;
      $('ob-progress-count').textContent = t('step_of').replace('{n}', String(s + 1)).replace('{total}', String(STEPS.length));
      $('ob-progress-fill').style.width = ((s + 1) / STEPS.length * 100) + '%';
      var items = doc.querySelectorAll('.ob-steps__item');
      for (var i = 0; i < items.length; i++) {
        var n = Number(items[i].getAttribute('data-step'));
        if (n === s) items[i].setAttribute('aria-current', 'step'); else items[i].removeAttribute('aria-current');
        items[i].setAttribute('data-state', n < s ? 'done' : n === s ? 'current' : 'todo');
      }
      for (var k = 0; k < STEPS.length; k++) $('ob-step-' + k).hidden = k !== s;
      var opts = doc.querySelectorAll('.ob-option');
      for (var j = 0; j < opts.length; j++) opts[j].setAttribute('aria-checked', String(opts[j].getAttribute('data-option') === nav.choice));
      $('ob-back').hidden = s === 0;
      var last = s === STEPS.length - 1;
      $('ob-next').hidden = last;
      $('ob-next').disabled = !canNext(nav);
      $('ob-finish').hidden = !last;
      if (focus) { var h = $('ob-step-' + s).querySelector('.ob-h1'); if (h) h.focus(); }
    }
    function render(focus) {
      texts();
      if (!canStart(ROUTING)) { show('ob-unavailable'); return; }
      $('ob-exit').hidden = false;
      $('ob-signout').hidden = auth !== 'ready' && auth !== 'unverified';
      if (auth === 'ready') { show('ob-wizard'); wizard(focus); }
      else { show('ob-gate'); gate(auth); }
    }
    function refresh() { auth = authState(clerk); render(false); }

    // language: the shared QRAIVY setting (js/qraivy-lang.js)
    var langs = doc.querySelectorAll('.ob-lang__btn');
    for (var i = 0; i < langs.length; i++) {
      langs[i].addEventListener('click', function (e) {
        current = lang(e.currentTarget.getAttribute('data-lang'));
        if (typeof win.setQraivyLang === 'function') { try { win.setQraivyLang(current); } catch (err) {} }
        render(false);
      });
    }

    render(false);
    if (!canStart(ROUTING)) return;

    // Step 1 and Back / Next
    var opts = doc.querySelectorAll('.ob-option');
    for (var j = 0; j < opts.length; j++) {
      opts[j].addEventListener('click', function (e) {
        var b = e.currentTarget;
        if (b.disabled) return;
        nav = choose(nav, b.getAttribute('data-option'));
        wizard(false);
      });
    }
    $('ob-next').addEventListener('click', function () { var n = next(nav); if (n !== nav) { nav = n; wizard(true); } });
    $('ob-back').addEventListener('click', function () { var b = back(nav); if (b !== nav) { nav = b; wizard(true); } });

    // the sign-in: Clerk of this address only (studio-auth.js)
    AUTH = win.QraivyStudioAuth ? win.QraivyStudioAuth.createAuth({ routing: ROUTING }) : null;
    if (!AUTH) { auth = 'error'; render(false); return; }
    $('ob-signin').addEventListener('click', function () { AUTH.signIn(); });
    $('ob-signup').addEventListener('click', function () { AUTH.signUp(); });
    $('ob-verify').addEventListener('click', function () { if (clerk && typeof clerk.openUserProfile === 'function') clerk.openUserProfile(); });
    $('ob-recheck').addEventListener('click', function () {
      var u = clerk && clerk.user;
      Promise.resolve(u && typeof u.reload === 'function' ? u.reload() : null).then(refresh, refresh);
    });
    $('ob-retry').addEventListener('click', function () { win.location.reload(); });
    $('ob-signout').addEventListener('click', function () {
      nav = { step: 0, choice: null };
      Promise.resolve(clerk && typeof clerk.signOut === 'function' ? clerk.signOut() : null).then(refresh, refresh);
    });
    AUTH.ready().then(function (c) {
      clerk = c;
      refresh();
      if (c && typeof c.addListener === 'function') c.addListener(function () { refresh(); });
    });
  }

  return { STEPS: STEPS, OPTIONS: OPTIONS, TX: TX, canStart: canStart, authState: authState, choose: choose, canNext: canNext, next: next, back: back, start: start };
});
