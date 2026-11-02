/*
 * onboarding-shell.js — Landing Page Studio V3 onboarding (Phases O0, O1): the
 * four-step wizard frame, Step 1 (Get started) and Step 2 (Business
 * information).
 *
 * Only studio-onboarding.html loads this file. It starts only on the
 * isolated Studio V3 staging address (studio-routing.js isolated: the
 * isolated staging API and the separate Clerk DEVELOPMENT application);
 * on every other address, production included, it shows a notice, loads no
 * sign-in and sends nothing.
 *
 * Step 1's cards show real QRAIVY pages in phones (Phase O0.1,
 * onboarding-previews.js: rendered by core.js, shown in frames sandboxed
 * without permissions).
 *
 * Step 2 (Phase O1) asks for the business name (required), a short
 * description and up to 8 social media links, checks them with
 * onboarding-model.js (core.js's own rules) and shows the page they make in a
 * live phone preview (core.js renderDesign, a frame sandboxed without
 * permissions). The logo upload is shown disabled, "Coming soon".
 *
 * Step 3 (Phase O2) chooses the page's sections: the Hero (from Step 2,
 * always first), the defaults and "Add more", each type once, Move up / Move
 * down / Remove. The live phone shows the whole page (core.js renderDesign)
 * in a frame sandboxed with "allow-scripts" only, running just the fixed
 * script of onboarding-previews.js: nothing in it navigates, the scroll
 * position is kept and a section just added or moved is scrolled into view.
 *
 * The answers and the step are kept in memory and, for a reload, in this
 * tab's sessionStorage under a key for the signed-in user (a hash of the
 * Clerk user id; never a token). Sign-out clears them.
 *
 * Step 4 (Phase O3A) reviews the page: the answers of Steps 2 and 3 (read
 * only, as checkPage() returns them) with Edit buttons back to those steps,
 * and the same page in the same script-only frame as Step 3. Save Draft is
 * shown but disabled, with a note: no draft is saved, nothing is sent (draft
 * saving is a later, separately approved phase).
 *
 * O2.1: the appearance (Light / Dark) is onboarding-theme.js's; this file only
 * tells the page which screen is shown (body data-ob-step: the background is
 * fuller on Step 1, calmer elsewhere) and gives the toggle its EN/DE labels.
 *
 * Nothing is sent: no fetch, no draft, no save. The sign-in (studio-auth.js)
 * only tells it who is signed in and whether the email is verified; the
 * server checks that again before any draft is created (lpV3/draftPolicy.js,
 * later phases). Instagram and Website import
 * are shown as "Coming soon" and cannot be chosen.
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
      soon: 'Coming soon', available: 'Available', demo: 'DEMO',
      start_help: 'Instagram and website import are coming soon. Nothing is imported in this version.',
      business_text: 'Your business name, a short description and your social media links.',
      sections_text: 'Pick the sections for your page, put them in order and see a live phone preview.',
      review_text: 'Check your page before you save it as a draft.',
      back: 'Back', next: 'Next', exit: 'Back to Studio', sign_out: 'Sign out',
      // Step 4 (O3A)
      draft_status: 'Ready to save · Not saved yet',
      draft_free: "Creating a draft is free and doesn't start your 14-day trial. The trial only starts when you choose to publish.",
      sum_business: 'Business information', sum_sections: 'Sections ({n})', sum_no_description: 'No description', sum_no_links: 'No social media links',
      edit: 'Edit', edit_business_label: 'Edit business information', edit_sections_label: 'Edit sections',
      review_live_label: 'Your page as a draft', review_live_note: 'Scroll the phone to see the whole page.',
      save_draft: 'Save Draft', save_note: 'Saving is coming in the next update. Nothing has been saved yet — your answers stay in this browser tab.',
      review_invalid: "This page can't be built yet. Please check Step 2 or Step 3.",
      unavailable_title: "Onboarding isn't available here yet", unavailable_text: 'The new onboarding is still being built and tested. Your landing pages keep working as before.',
      loading_title: 'Checking your sign-in …', loading_text: 'One moment.',
      signedout_title: 'Create your landing page', signedout_text: 'Sign in or create a free account to start. No payment card needed.',
      signedout_info: 'Creating and saving drafts is free. Your 14-day trial only starts when you choose to publish.',
      sign_in: 'Sign in', sign_up: 'Create account',
      unverified_title: 'Please verify your email address', unverified_text: 'We sent you a code when you signed up. Verify your email address to start building your page.',
      unverified_info: 'For your security, pages can only be created with a verified email address.',
      verify_open: 'Verify my email', verify_recheck: 'I have verified it',
      error_title: 'The sign-in could not be loaded', error_text: 'Check your connection and try again.', retry: 'Try again',
      // Step 2 (O1)
      name_label: 'Business name', name_placeholder: 'e.g. Café Sonnenschein', required: 'required', optional: 'optional',
      description_label: 'Short description', description_placeholder: 'e.g. Fresh coffee and homemade cakes in the heart of the old town.',
      description_hint: 'A sentence or two about what you offer.',
      links_label: 'Social media links', links_hint: 'Add up to 8 links. Empty rows are ignored.', add_link: 'Add link',
      links_full: 'You have added the maximum of 8 links.',
      link_platform_label: 'Platform, link {n}', link_url_label: 'Address, link {n}', remove: 'Remove', remove_label: 'Remove link {n}',
      logo_label: 'Logo', logo_button: 'Upload logo', logo_note: 'Logo upload is coming soon. You can add images later in the Studio.',
      live_preview: 'Live preview', live_note: 'Updates as you type. Nothing is saved yet.',
      count: '{n} / {max}', chars_left: '{n} characters left', chars_over: '{n} characters too many',
      name_required: 'Please enter your business name.', name_too_long: 'The business name can have at most 80 characters.',
      name_invalid: 'Please check your business name.', description_too_long: 'The description can have at most 300 characters.',
      link_invalid: 'Enter a {platform} address, for example {example}', link_platform: 'Please choose a platform.',
      links_too_many: 'You can add at most 8 links.',
      // Step 3 (O2)
      chosen_title: 'On your page', more_title: 'Add more', more_none: 'All eight sections are on your page.',
      sections_info: 'Empty sections stay hidden on your public page until you add their content in the Studio.',
      live_note_sections: 'Scroll the phone to see every section. Nothing is saved yet.',
      add: 'Add', add_section_label: 'Add {name}', move_up_label: 'Move {name} up', move_down_label: 'Move {name} down', remove_section_label: 'Remove {name}',
      hero_locked: 'Always first · from Step 2', social_links: '{n} links from Step 2', social_links_one: '1 link from Step 2',
      social_none: 'No links yet · add them in Step 2', sec_empty: 'Add your content in the Studio',
      sec_added: '{name} added, position {n} of {total}.', sec_removed: '{name} removed.', sec_moved: '{name} moved to position {n} of {total}.',
      sections_invalid: "This page can't be built yet. Please go back to Step 2 and check your answers.",
      sec_hero: 'Hero', sec_hero_text: 'Header with your business name and description',
      sec_buttons: 'Buttons', sec_buttons_text: 'WhatsApp, call, directions, website',
      sec_socialMedia: 'Social Media', sec_socialMedia_text: 'Your social media profiles',
      sec_contact: 'Contact', sec_contact_text: 'Address, phone, email and map',
      sec_openingHours: 'Opening Hours', sec_openingHours_text: 'Your business hours',
      sec_products: 'Products', sec_products_text: 'Products with links to your shop',
      sec_gallery: 'Gallery', sec_gallery_text: 'Photos of your business, products or menu',
      sec_text: 'Text', sec_text_text: 'A heading and your own text',
      // O2.1: appearance and the Step 1 benefits
      theme_group: 'Appearance', theme_light: 'Light mode', theme_dark: 'Dark mode',
      benefit_code: 'No coding required', benefit_mobile: 'Mobile optimized', benefit_update: 'Easy to update', benefit_free: 'Start for free',
      note_text: 'Create your digital business page in minutes!',
    },
    de: {
      page_title: 'Loslegen — QRAIVY', lang_group: 'Sprache', progress_label: 'Fortschritt', step_of: 'Schritt {n} von {total}',
      step_start: 'Loslegen', step_business: 'Unternehmensdaten', step_sections: 'Abschnitte wählen', step_review: 'Prüfen & speichern',
      start_title: 'Wie möchten Sie starten?', start_text: 'Wählen Sie, wie Ihre Landingpage entstehen soll. Im Studio können Sie später alles ändern.',
      opt_instagram: 'Instagram', opt_instagram_text: 'Starten Sie mit Ihrem Instagram-Profil.',
      opt_website: 'Bestehende Website', opt_website_text: 'Bringen Sie Ihre bestehende Website zu QRAIVY.',
      opt_scratch: 'Neu beginnen', opt_scratch_text: 'Gestalten Sie Ihre Landingpage ganz nach Ihren Wünschen.',
      soon: 'Demnächst', available: 'Verfügbar', demo: 'DEMO',
      start_help: 'Der Import von Instagram und Websites folgt bald. In dieser Version wird nichts importiert.',
      business_text: 'Ihr Unternehmensname, eine kurze Beschreibung und Ihre Social-Media-Links.',
      sections_text: 'Wählen Sie die Abschnitte Ihrer Seite, legen Sie die Reihenfolge fest und sehen Sie eine Live-Vorschau auf dem Smartphone.',
      review_text: 'Prüfen Sie Ihre Seite, bevor Sie sie als Entwurf speichern.',
      back: 'Zurück', next: 'Weiter', exit: 'Zurück zum Studio', sign_out: 'Abmelden',
      draft_status: 'Bereit zum Speichern · Noch nicht gespeichert',
      draft_free: 'Das Erstellen eines Entwurfs ist kostenlos und startet nicht Ihre 14-tägige Testphase. Die Testphase beginnt erst, wenn Sie veröffentlichen.',
      sum_business: 'Unternehmensdaten', sum_sections: 'Abschnitte ({n})', sum_no_description: 'Keine Beschreibung', sum_no_links: 'Keine Social-Media-Links',
      edit: 'Bearbeiten', edit_business_label: 'Unternehmensdaten bearbeiten', edit_sections_label: 'Abschnitte bearbeiten',
      review_live_label: 'Ihre Seite als Entwurf', review_live_note: 'Scrollen Sie im Smartphone, um die ganze Seite zu sehen.',
      save_draft: 'Entwurf speichern', save_note: 'Das Speichern folgt im nächsten Update. Es wurde noch nichts gespeichert – Ihre Angaben bleiben in diesem Browser-Tab.',
      review_invalid: 'Diese Seite kann noch nicht erstellt werden. Bitte prüfen Sie Schritt 2 oder 3.',
      unavailable_title: 'Das Onboarding ist hier noch nicht verfügbar', unavailable_text: 'Das neue Onboarding wird noch gebaut und getestet. Ihre Landingpages funktionieren weiter wie bisher.',
      loading_title: 'Anmeldung wird geprüft …', loading_text: 'Einen Moment bitte.',
      signedout_title: 'Erstellen Sie Ihre Landingpage', signedout_text: 'Melden Sie sich an oder erstellen Sie ein kostenloses Konto. Keine Zahlungskarte nötig.',
      signedout_info: 'Entwürfe erstellen und speichern ist kostenlos. Ihre 14-tägige Testphase beginnt erst, wenn Sie veröffentlichen.',
      sign_in: 'Anmelden', sign_up: 'Konto erstellen',
      unverified_title: 'Bitte bestätigen Sie Ihre E-Mail-Adresse', unverified_text: 'Bei der Registrierung haben wir Ihnen einen Code gesendet. Bestätigen Sie Ihre E-Mail-Adresse, um mit Ihrer Seite zu beginnen.',
      unverified_info: 'Zu Ihrer Sicherheit können Seiten nur mit einer bestätigten E-Mail-Adresse erstellt werden.',
      verify_open: 'E-Mail bestätigen', verify_recheck: 'Ich habe sie bestätigt',
      error_title: 'Die Anmeldung konnte nicht geladen werden', error_text: 'Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.', retry: 'Erneut versuchen',
      name_label: 'Unternehmensname', name_placeholder: 'z. B. Café Sonnenschein', required: 'Pflichtfeld', optional: 'optional',
      description_label: 'Kurzbeschreibung', description_placeholder: 'z. B. Frischer Kaffee und hausgemachte Kuchen mitten in der Altstadt.',
      description_hint: 'Ein bis zwei Sätze dazu, was Sie anbieten.',
      links_label: 'Social-Media-Links', links_hint: 'Fügen Sie bis zu 8 Links hinzu. Leere Zeilen werden ignoriert.', add_link: 'Link hinzufügen',
      links_full: 'Sie haben die maximale Anzahl von 8 Links erreicht.',
      link_platform_label: 'Plattform, Link {n}', link_url_label: 'Adresse, Link {n}', remove: 'Entfernen', remove_label: 'Link {n} entfernen',
      logo_label: 'Logo', logo_button: 'Logo hochladen', logo_note: 'Der Logo-Upload folgt bald. Bilder können Sie später im Studio hinzufügen.',
      live_preview: 'Live-Vorschau', live_note: 'Aktualisiert sich beim Tippen. Noch wird nichts gespeichert.',
      count: '{n} / {max}', chars_left: 'Noch {n} Zeichen', chars_over: '{n} Zeichen zu viel',
      name_required: 'Bitte geben Sie Ihren Unternehmensnamen ein.', name_too_long: 'Der Unternehmensname darf höchstens 80 Zeichen haben.',
      name_invalid: 'Bitte prüfen Sie Ihren Unternehmensnamen.', description_too_long: 'Die Beschreibung darf höchstens 300 Zeichen haben.',
      link_invalid: 'Geben Sie eine {platform}-Adresse ein, zum Beispiel {example}', link_platform: 'Bitte wählen Sie eine Plattform.',
      links_too_many: 'Sie können höchstens 8 Links hinzufügen.',
      chosen_title: 'Auf Ihrer Seite', more_title: 'Weitere hinzufügen', more_none: 'Alle acht Abschnitte sind auf Ihrer Seite.',
      sections_info: 'Leere Abschnitte bleiben auf Ihrer öffentlichen Seite verborgen, bis Sie im Studio Inhalte ergänzen.',
      live_note_sections: 'Scrollen Sie im Smartphone, um alle Abschnitte zu sehen. Noch wird nichts gespeichert.',
      add: 'Hinzufügen', add_section_label: '{name} hinzufügen', move_up_label: '{name} nach oben verschieben', move_down_label: '{name} nach unten verschieben', remove_section_label: '{name} entfernen',
      hero_locked: 'Immer zuerst · aus Schritt 2', social_links: '{n} Links aus Schritt 2', social_links_one: '1 Link aus Schritt 2',
      social_none: 'Noch keine Links · in Schritt 2 hinzufügen', sec_empty: 'Inhalte später im Studio hinzufügen',
      sec_added: '{name} hinzugefügt, Position {n} von {total}.', sec_removed: '{name} entfernt.', sec_moved: '{name} auf Position {n} von {total} verschoben.',
      sections_invalid: 'Diese Seite kann noch nicht erstellt werden. Bitte prüfen Sie Ihre Angaben in Schritt 2.',
      sec_hero: 'Hero', sec_hero_text: 'Kopfbereich mit Ihrem Unternehmensnamen und Ihrer Beschreibung',
      sec_buttons: 'Buttons', sec_buttons_text: 'WhatsApp, Anruf, Route, Website',
      sec_socialMedia: 'Social Media', sec_socialMedia_text: 'Ihre Social-Media-Profile',
      sec_contact: 'Kontakt', sec_contact_text: 'Adresse, Telefon, E-Mail und Karte',
      sec_openingHours: 'Öffnungszeiten', sec_openingHours_text: 'Ihre Geschäftszeiten',
      sec_products: 'Produkte', sec_products_text: 'Produkte mit Links zu Ihrem Shop',
      sec_gallery: 'Galerie', sec_gallery_text: 'Fotos von Ihrem Geschäft, Ihren Produkten oder Ihrer Speisekarte',
      sec_text: 'Text', sec_text_text: 'Eine Überschrift und Ihr eigener Text',
      theme_group: 'Darstellung', theme_light: 'Heller Modus', theme_dark: 'Dunkler Modus',
      benefit_code: 'Ganz ohne Programmieren', benefit_mobile: 'Für Smartphones optimiert', benefit_update: 'Einfach zu aktualisieren', benefit_free: 'Kostenlos starten',
      note_text: 'Erstellen Sie Ihre digitale Geschäftsseite in wenigen Minuten!',
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
  // Step 2 leads on only with valid answers (businessOk: onboarding-model.js check().ok), Step 3 only
  // with a valid page (checkPage().pageOk); without it (undefined) Next may be tried and shows the errors.
  function choose(s, id) {
    var o = OPTIONS.filter(function (x) { return x.id === id; })[0];
    return o && o.available ? { step: s.step, choice: id } : s;
  }
  function canNext(s, businessOk) {
    if (s.step === 0) return s.choice === 'scratch';
    if (s.step === 1 || s.step === 2) return businessOk !== false;
    return s.step > 0 && s.step < STEPS.length - 1;
  }
  function next(s, businessOk) { return canNext(s, businessOk) ? { step: s.step + 1, choice: s.choice } : s; }
  function back(s) { return s.step > 0 ? { step: s.step - 1, choice: s.choice } : s; }

  // Progress kept for a reload: this tab's sessionStorage, one key per signed-in user
  // (a hash of the Clerk user id, not the id itself). Holds the step and the answers only.
  var STORE_PREFIX = 'qraivy.onboarding.v1:';
  function hex(n) { var s = ''; for (var i = 7; i >= 0; i--) s += '0123456789abcdef'.charAt((n >>> (i * 4)) & 15); return s; }
  function storeKey(userId) {
    if (typeof userId !== 'string' || !userId) return null;
    var h = 0x811c9dc5;
    for (var i = 0; i < userId.length; i++) { h ^= userId.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return STORE_PREFIX + hex(h >>> 0);
  }
  // The kept progress, checked: { step, choice, answers }. Steps past 2 only with valid answers, past 3 with a valid page.
  function restore(saved, M, V3) {
    var s = saved && typeof saved === 'object' ? saved : {};
    var answers = M.sanitize(s.answers);
    var choice = s.choice === 'scratch' ? 'scratch' : null;
    var step = typeof s.step === 'number' && s.step >= 0 && s.step < STEPS.length ? Math.floor(s.step) : 0;
    if (!choice) step = 0;
    if (step > 1 && !M.check(V3, answers, 'en').ok) step = 1;
    if (step > 2 && !M.checkPage(V3, answers, 'en').pageOk) step = 2;
    return { step: step, choice: choice, answers: answers };
  }

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
    // Step 1 previews: three DEMO pages (onboarding-previews.js, rendered by core.js) in the cards' phones, drawn once
    // per language and again when the demo photos are ready (inline, with the AI label)
    var PV = win.QraivyOnboardingPreviews, V3 = win.QraivyV3, IMAGES = win.QraivyStudioDemoImages;
    var drawn = null;
    function previews(force) {
      if (!PV || !V3 || !IMAGES || (!force && drawn === current)) return;
      drawn = current;
      var html = PV.previews({ V3: V3, imageUrl: IMAGES.cloudinaryUrl, lang: current, localize: IMAGES.localizeHtml });
      var frames = doc.querySelectorAll('.ob-phone__frame[data-preview]');
      for (var i = 0; i < frames.length; i++) {
        var page = html[frames[i].getAttribute('data-preview')];
        // only a changed page is reloaded (no blank frame while an unchanged one reloads)
        if (page && frames[i].srcdoc !== page) frames[i].srcdoc = page;
      }
      if (IMAGES && IMAGES.prepare) IMAGES.prepare(function () { previews(true); });
    }

    // ── Step 2: the answers (memory; this tab's sessionStorage for the signed-in user),
    // the errors that show, the live preview ──
    var M = win.QraivyOnboardingModel;
    var answers = M ? M.sanitize({}) : { name: '', description: '', links: [] };
    var rowKeys = [], rowSeq = 0;                // a stable key per link row (its element ids)
    var tried = false, touched = {};             // after a Next attempt every error shows; a link's after leaving it filled in
    var last = { name: '', description: '' };    // the last valid name and description: the preview keeps them while a field is too long
    var adopted = false, owner = null;           // whose progress this is (owner: the store key; null: memory only)
    var liveTimer = null, spoken = {};

    function store() { try { return win.sessionStorage || null; } catch (e) { return null; } }
    function save() {
      var st = store();
      if (!owner || !st) return;
      try { st.setItem(owner, JSON.stringify({ step: nav.step, choice: nav.choice, answers: answers })); } catch (e) {}
    }
    function clearStore() {
      var st = store();
      if (!st) return;
      try { for (var i = st.length - 1; i >= 0; i--) { var k = st.key(i); if (k && k.indexOf(STORE_PREFIX) === 0) st.removeItem(k); } } catch (e) {}
    }
    // the signed-in user: their own kept progress; another user's never shows
    function adopt(c) {
      var key = storeKey(c && c.user && c.user.id);
      if (adopted && key === owner) return;
      adopted = true; owner = key;
      var st = store(), saved = null;
      if (key && st) { try { saved = JSON.parse(st.getItem(key) || 'null'); } catch (e) { saved = null; } }
      if (M && V3) { var r = restore(saved, M, V3); nav = { step: r.step, choice: r.choice }; answers = r.answers; }
      tried = false; touched = {}; last = { name: '', description: '' }; frameY = 0; reveal = null; reviewY = 0;
      fields();
    }
    function forget() {
      adopted = false; owner = null;
      nav = { step: 0, choice: null };
      answers = M ? M.sanitize({}) : answers;
      tried = false; touched = {}; last = { name: '', description: '' }; frameY = 0; reveal = null; reviewY = 0;
      fields();
    }
    function check() { return M && V3 ? M.check(V3, answers, current) : null; }

    // the inputs from the answers (after a restore or a reset)
    function fields() {
      if (!M || !$('ob-name')) return;
      $('ob-name').value = answers.name;
      $('ob-description').value = answers.description;
      rowKeys = answers.links.map(function () { return 'r' + (++rowSeq); });
      rows();
    }
    function rowIndex(key) { return rowKeys.indexOf(key); }
    function rows() {
      var list = $('ob-links');
      while (list.firstChild) list.removeChild(list.firstChild);
      for (var i = 0; i < answers.links.length; i++) list.appendChild(row(rowKeys[i], answers.links[i]));
      rowTexts();
    }
    function el(tag, cls, attrs) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      return n;
    }
    function row(key, link) {
      var li = el('li', 'ob-link-row', { 'data-row': key });
      var pl = el('label', 'ob-sr', { for: 'ob-link-platform-' + key, 'data-row-text': 'link_platform_label' });
      var sel = el('select', 'ob-input ob-select ob-link-row__platform', { id: 'ob-link-platform-' + key });
      M.PLATFORMS.forEach(function (p) { var o = el('option', '', { value: p }); o.textContent = M.LABELS[p]; sel.appendChild(o); });
      sel.value = link.platform;
      var ul = el('label', 'ob-sr', { for: 'ob-link-url-' + key, 'data-row-text': 'link_url_label' });
      var inp = el('input', 'ob-input ob-link-row__url', { id: 'ob-link-url-' + key, type: 'url', inputmode: 'url', autocomplete: 'url', spellcheck: 'false', 'aria-describedby': 'ob-link-error-' + key });
      inp.value = link.url;
      var rm = el('button', 'ob-remove ob-link-row__remove', { type: 'button', 'data-row-text': 'remove' });
      var err = el('p', 'ob-error', { id: 'ob-link-error-' + key });
      sel.addEventListener('change', function () { var i = rowIndex(key); if (i < 0) return; answers.links[i].platform = sel.value; rowTexts(); changed(); });
      inp.addEventListener('input', function () { var i = rowIndex(key); if (i < 0) return; answers.links[i].url = inp.value; changed(); });
      inp.addEventListener('blur', function () { if (inp.value.trim()) { touched[key] = true; errors(); } });
      rm.addEventListener('click', function () { removeRow(key); });
      [pl, sel, ul, inp, rm, err].forEach(function (n) { li.appendChild(n); });
      return li;
    }
    // the rows' labels in the language, numbered; the address example follows the platform
    function rowTexts() {
      var items = $('ob-links').children;
      for (var i = 0; i < items.length; i++) {
        var n = String(i + 1), key = items[i].getAttribute('data-row');
        var labels = items[i].querySelectorAll('[data-row-text]');
        for (var j = 0; j < labels.length; j++) labels[j].textContent = t(labels[j].getAttribute('data-row-text')).replace('{n}', n);
        items[i].querySelector('.ob-remove').setAttribute('aria-label', t('remove_label').replace('{n}', n));
        $('ob-link-url-' + key).placeholder = M.EXAMPLES[answers.links[i].platform] || '';
      }
      var full = answers.links.length >= M.LIMITS.links;
      $('ob-add-link').disabled = full;
      $('ob-links-full').hidden = !full;
    }
    function addRow() {
      if (!M || answers.links.length >= M.LIMITS.links) return;
      answers.links.push({ platform: M.nextPlatform(answers.links), url: '' });
      rowKeys.push('r' + (++rowSeq));
      rows();
      $('ob-link-platform-' + rowKeys[rowKeys.length - 1]).focus();
      changed();
    }
    function removeRow(key) {
      var i = rowIndex(key);
      if (i < 0) return;
      answers.links.splice(i, 1); rowKeys.splice(i, 1); delete touched[key];
      rows();
      // focus: the row that took its place, else the one before, else "+ Add link"
      var to = rowKeys[i] || rowKeys[i - 1];
      (to ? $('ob-link-platform-' + to) : $('ob-add-link')).focus();
      changed();
    }
    function changed() { save(); errors(); live(false); }

    // counters: "12 / 80"; screen readers hear only the last 10 characters and going over
    function counter(id, value, max) {
      var n = M.chars(value);
      $(id + '-count').textContent = t('count').replace('{n}', String(n)).replace('{max}', String(max));
      $(id + '-count').setAttribute('data-over', String(n > max));
      var say = n > max ? t('chars_over').replace('{n}', String(n - max)) : max - n <= 10 ? t('chars_left').replace('{n}', String(max - n)) : '';
      if (spoken[id] !== say) { spoken[id] = say; $(id + '-count-sr').textContent = say; }
    }
    function setError(input, msg) {
      var e = $(input.getAttribute('aria-describedby').split(' ').filter(function (x) { return /-error(-|$)/.test(x); })[0]);
      e.textContent = msg;
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    function linkMessage(code, platform) {
      return t(code).replace('{platform}', M.LABELS[platform] || '').replace('{example}', M.EXAMPLES[platform] || '');
    }
    // the errors that show: too long at once; a missing name after a Next attempt; a link after leaving it filled in (or a Next attempt)
    function errors() {
      var r = check();
      if (!r) return null;
      var ne = r.errors.name && (tried || r.errors.name !== 'name_required') ? r.errors.name : '';
      setError($('ob-name'), ne ? t(ne) : '');
      setError($('ob-description'), r.errors.description ? t(r.errors.description) : '');
      rowKeys.forEach(function (key, i) {
        var code = r.errors.links[i];
        setError($('ob-link-url-' + key), code && (tried || touched[key]) ? linkMessage(code, answers.links[i].platform) : '');
      });
      counter('ob-name', M.cleanName(answers.name), M.LIMITS.name);
      counter('ob-description', M.cleanDescription(answers.description), M.LIMITS.description);
      return r;
    }
    function focusInvalid(r) {
      if (!r || r.errors.name) return $('ob-name').focus();
      if (r.errors.description) return $('ob-description').focus();
      var i = Object.keys(r.errors.links).map(Number).sort(function (a, b) { return a - b; })[0];
      if (i !== undefined && rowKeys[i]) $('ob-link-url-' + rowKeys[i]).focus();
    }

    // the live preview: the page the valid answers make, rendered by core.js into the sandboxed frame
    // (about 150 ms after typing stops); an invalid field keeps its last valid content, an empty name the placeholder
    function live(now) {
      if (liveTimer) win.clearTimeout(liveTimer);
      liveTimer = null;
      if (now) draw(); else liveTimer = win.setTimeout(draw, 150);
    }
    function draw() {
      var r = check(), frame = $('ob-live-frame');
      if (!r || !frame) return;
      var name = r.errors.name === 'name_too_long' ? last.name : r.values.name;
      var description = r.errors.description ? last.description : r.values.description;
      if (!r.errors.name) last.name = r.values.name;
      if (!r.errors.description) last.description = r.values.description;
      var out = V3.renderDesign(M.buildDesign(V3, { name: name, description: description, links: r.values.links }, current),
        { businessName: name || M.PLACEHOLDER_NAME[current] }, { preview: true });
      if (out && out.ok && frame.srcdoc !== out.html) frame.srcdoc = out.html;
    }
    function business() {
      if (!M || !$('ob-name')) return;
      $('ob-name').placeholder = t('name_placeholder');
      $('ob-description').placeholder = t('description_placeholder');
      rowTexts();
      errors();
      live(true);
    }

    // ── Step 3: the sections (answers.sections and answers.social, kept with the other answers) and the
    // live phone (the whole page; its scroll position kept; a section just added or moved shown) ──
    var frameY = 0, reveal = null, reviewY = 0;
    function page() { return M && V3 ? M.checkPage(V3, answers, current) : null; }
    function secName(type) { return t('sec_' + type); }
    function icon(name) { return $('ob-tpl-icons').content.querySelector('[data-icon="' + name + '"]').cloneNode(true); }
    function say(msg) {
      var s = $('ob-sections-status');
      s.textContent = '';
      win.setTimeout(function () { s.textContent = msg; }, 40);   // cleared first, so a repeat is spoken again
    }
    function tag(type, r) {
      var n = r.values.links.length, text, cls = 'ob-sec__tag';
      if (type === 'hero') text = t('hero_locked');
      else if (type === 'socialMedia') { text = n === 1 ? t('social_links_one') : n ? t('social_links').replace('{n}', String(n)) : t('social_none'); if (n) cls += ' ob-sec__tag--links'; }
      else text = t('sec_empty');
      var s = el('span', cls);
      if (type === 'hero') s.appendChild(icon('lock'));
      s.appendChild(doc.createTextNode(text));
      return s;
    }
    function body(type, r) {
      var b = el('span', 'ob-sec__body'), title = el('span', 'ob-sec__title'), text = el('span', 'ob-sec__text');
      title.textContent = secName(type);
      text.textContent = t('sec_' + type + '_text');
      b.appendChild(title); b.appendChild(text);
      if (r) b.appendChild(tag(type, r));
      return b;
    }
    function moveButton(dir, type, disabled) {
      var b = el('button', 'ob-iconbtn', { type: 'button', 'data-act': dir, 'aria-label': t(dir === 'up' ? 'move_up_label' : 'move_down_label').replace('{name}', secName(type)) });
      b.appendChild(icon(dir));
      b.disabled = disabled;
      b.addEventListener('click', function () { moveSection(type, dir); });
      return b;
    }
    function chosenItem(type, i, total, r) {
      var li = el('li', 'ob-sec' + (type === 'hero' ? ' ob-sec--locked' : ''), { 'data-type': type });
      var num = el('span', 'ob-sec__num', { 'aria-hidden': 'true' });
      num.textContent = String(i + 1);
      li.appendChild(num);
      li.appendChild(body(type, r));
      if (type === 'hero') return li;                       // locked: always first, never removed
      var acts = el('span', 'ob-sec__actions');
      acts.appendChild(moveButton('up', type, i <= 1));
      acts.appendChild(moveButton('down', type, i >= total - 1));
      var rm = el('button', 'ob-remove', { type: 'button', 'data-act': 'remove', 'aria-label': t('remove_section_label').replace('{name}', secName(type)) });
      rm.textContent = t('remove');
      rm.addEventListener('click', function () { removeSection(type); });
      acts.appendChild(rm);
      li.appendChild(acts);
      return li;
    }
    function moreItem(type) {
      var li = el('li', 'ob-sec', { 'data-type': type });
      li.appendChild(body(type, null));
      var acts = el('span', 'ob-sec__actions');
      var add = el('button', 'ob-btn ob-btn--add', { type: 'button', 'data-act': 'add', 'aria-label': t('add_section_label').replace('{name}', secName(type)) });
      var plus = el('span', '', { 'aria-hidden': 'true' });
      plus.textContent = '+';
      var label = el('span', '');
      label.textContent = t('add');
      add.appendChild(plus); add.appendChild(label);
      add.addEventListener('click', function () { addSection(type); });
      acts.appendChild(add);
      li.appendChild(acts);
      return li;
    }
    function sections() {
      if (!M || !$('ob-chosen')) return;
      var r = page(), list = r.sections, chosen = $('ob-chosen'), more = $('ob-more');
      while (chosen.firstChild) chosen.removeChild(chosen.firstChild);
      while (more.firstChild) more.removeChild(more.firstChild);
      list.forEach(function (type, i) { chosen.appendChild(chosenItem(type, i, list.length, r)); });
      var rest = M.SECTION_TYPES.filter(function (x) { return list.indexOf(x) === -1; });
      rest.forEach(function (type) { more.appendChild(moreItem(type)); });
      $('ob-more-none').hidden = rest.length > 0;
      $('ob-sections-error').textContent = r.pageOk ? '' : t('sections_invalid');
      drawSections();
    }
    function addSection(type) {
      var list = page().sections;
      if (list.indexOf(type) !== -1 || M.SECTION_TYPES.indexOf(type) === -1) return;
      var restIndex = M.SECTION_TYPES.filter(function (x) { return list.indexOf(x) === -1; }).indexOf(type);
      list.push(type);
      answers.sections = list;
      if (type === 'socialMedia') answers.social = 'added';
      reveal = M.SECTION_IDS[type];
      save(); sections();
      var now = page().sections;
      say(t('sec_added').replace('{name}', secName(type)).replace('{n}', String(now.indexOf(type) + 1)).replace('{total}', String(now.length)));
      // focus: the next "+ Add" (or the one before), else the list's heading
      var adds = $('ob-more').querySelectorAll('[data-act="add"]');
      (adds[restIndex] || adds[restIndex - 1] || $('ob-chosen-title')).focus();
    }
    function removeSection(type) {
      var list = page().sections, i = list.indexOf(type);
      if (i < 1) return;                                     // the Hero cannot be removed
      list.splice(i, 1);
      answers.sections = list;
      if (type === 'socialMedia') answers.social = 'removed';
      reveal = null;
      save(); sections();
      say(t('sec_removed').replace('{name}', secName(type)));
      // focus: the section that took its place (or the one before), else the list's heading
      var items = $('ob-chosen').children, to = items[i] || items[i - 1];
      var b = to && to.querySelector('[data-act="remove"]');
      (b || $('ob-chosen-title')).focus();
    }
    function moveSection(type, dir) {
      var list = page().sections, i = list.indexOf(type), j = i + (dir === 'up' ? -1 : 1);
      if (i < 1 || j < 1 || j >= list.length) return;        // the Hero stays first
      list[i] = list[j]; list[j] = type;
      answers.sections = list;
      reveal = M.SECTION_IDS[type];
      save(); sections();
      say(t('sec_moved').replace('{name}', secName(type)).replace('{n}', String(j + 1)).replace('{total}', String(list.length)));
      // focus: the same button on the moved section (the other one when it reached the end)
      var li = $('ob-chosen').querySelector('[data-type="' + type + '"]');
      var b = li.querySelector('[data-act="' + dir + '"]');
      if (b.disabled) b = li.querySelector('[data-act="' + (dir === 'up' ? 'down' : 'up') + '"]');
      b.focus();
    }
    // the page into the scriptable live frame (onboarding-previews.js liveHtml); unchanged HTML is not reloaded,
    // a reveal then goes to the page as it is
    function drawSections() {
      var r = page(), frame = $('ob-sections-frame');
      if (!r || !frame || !PV) return;
      var out = V3.renderDesign(r.page || M.buildDesign(V3, r.values, current, r.sections), { businessName: r.values.name || M.PLACEHOLDER_NAME[current] }, { preview: true });
      var html = out && out.ok ? PV.liveHtml(out.html) : '';
      if (html && frame.srcdoc !== html) frame.srcdoc = html;
      else if (reveal && frame.contentWindow) { frame.contentWindow.postMessage(PV.initMessage(frameY, reveal), '*'); reveal = null; }
    }

    // ── Step 4: the review. Read only: the values and the page come from checkPage(), exactly what a draft will
    // hold later; text only through textContent; the phone shows the same page in the same frame as Step 3 ──
    function setText(id, value, empty) {
      var n = $(id);
      n.textContent = value || t(empty);
      if (value) n.removeAttribute('data-empty'); else n.setAttribute('data-empty', 'true');
    }
    function review() {
      if (!M || !$('ob-sum-name')) return;
      var r = page();
      setText('ob-sum-name', r.values.name || M.cleanName(answers.name), 'name_required');
      setText('ob-sum-description', r.values.description, 'sum_no_description');
      var links = $('ob-sum-links');
      while (links.firstChild) links.removeChild(links.firstChild);
      if (r.values.links.length) {
        links.removeAttribute('data-empty');
        var ul = el('ul', 'ob-sum-links');
        r.values.links.forEach(function (l) {
          var li = el('li', ''), pf = el('span', 'ob-sum-links__platform'), url = el('span', 'ob-sum-links__url');
          pf.textContent = M.LABELS[l.platform] + ': ';
          url.textContent = l.url;                        // shown as text, not a link: nothing leaves the wizard
          li.appendChild(pf); li.appendChild(url); ul.appendChild(li);
        });
        links.appendChild(ul);
      } else setText('ob-sum-links', '', 'sum_no_links');
      $('ob-sum-sections-title').textContent = t('sum_sections').replace('{n}', String(r.sections.length));
      var list = $('ob-sum-sections');
      while (list.firstChild) list.removeChild(list.firstChild);
      r.sections.forEach(function (type, i) {
        var li = el('li', 'ob-sec' + (type === 'hero' ? ' ob-sec--locked' : ''), { 'data-type': type });
        var num = el('span', 'ob-sec__num', { 'aria-hidden': 'true' });
        num.textContent = String(i + 1);
        li.appendChild(num);
        li.appendChild(body(type, r));
        list.appendChild(li);
      });
      $('ob-review-error').textContent = r.pageOk ? '' : t('review_invalid');
      drawReview(r);
    }
    function drawReview(r) {
      var frame = $('ob-review-frame');
      if (!frame || !PV) return;
      var out = V3.renderDesign(r.page || M.buildDesign(V3, r.values, current, r.sections), { businessName: r.values.name || M.PLACEHOLDER_NAME[current] }, { preview: true });
      var html = out && out.ok ? PV.liveHtml(out.html) : '';
      if (html && frame.srcdoc !== html) frame.srcdoc = html;
    }
    // Edit: back to the step, its answers as they are (saved first), focus where the change starts
    function editStep(step, focusId) {
      nav = { step: step, choice: nav.choice };
      save();
      wizard(false);
      $(focusId).focus();
    }

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
      // O2.1: which screen is shown, for the background (Step 1 full, everything else calmer)
      doc.body.setAttribute('data-ob-step', id === 'ob-wizard' ? String(nav.step) : 'notice');
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
      doc.body.setAttribute('data-ob-step', String(s));
      var opts = doc.querySelectorAll('.ob-option');
      for (var j = 0; j < opts.length; j++) opts[j].setAttribute('aria-checked', String(opts[j].getAttribute('data-option') === nav.choice));
      $('ob-back').hidden = s === 0;
      var last = s === STEPS.length - 1;
      $('ob-next').hidden = last;
      $('ob-next').disabled = !canNext(nav);
      $('ob-finish').hidden = !last;          // O3A: shown on Step 4, always disabled (no draft is saved yet)
      $('ob-save-note').hidden = !last;
      if (s === 0) previews(false);
      if (s === 1) business();
      if (s === 2) sections();
      if (s === 3) review();
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
    function refresh() {
      auth = authState(clerk);
      if (auth === 'ready') adopt(clerk); else if (adopted) forget();
      render(false);
    }

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
        save();
        wizard(false);
      });
    }
    $('ob-next').addEventListener('click', function () {
      var ok;
      if (nav.step === 1) {
        var r = check();
        ok = !!(r && r.ok);
        if (!ok) { tried = true; errors(); focusInvalid(r); return; }
      }
      if (nav.step === 2) {
        var p = page();
        ok = !!(p && p.pageOk);
        if (!ok) { sections(); $('ob-chosen-title').focus(); return; }
      }
      var n = next(nav, ok);
      if (n !== nav) { nav = n; save(); wizard(true); }
    });
    $('ob-back').addEventListener('click', function () { var b = back(nav); if (b !== nav) { nav = b; save(); wizard(true); } });
    // Step 2's fields
    if (M) {
      $('ob-name').addEventListener('input', function (e) { answers.name = e.target.value; changed(); });
      $('ob-description').addEventListener('input', function (e) { answers.description = e.target.value; changed(); });
      $('ob-add-link').addEventListener('click', addRow);
    }
    // Step 4: Edit back to Steps 2 and 3
    $('ob-edit-business').addEventListener('click', function () { editStep(1, 'ob-name'); });
    $('ob-edit-sections').addEventListener('click', function () { editStep(2, 'ob-chosen-title'); });
    // Step 4's frame: after each load its scroll position (no reveal); from it, only its scroll position
    if (PV && $('ob-review-frame')) {
      $('ob-review-frame').addEventListener('load', function () {
        var f = $('ob-review-frame');
        if (f.contentWindow) f.contentWindow.postMessage(PV.initMessage(reviewY, null), '*');
      });
      win.addEventListener('message', function (e) {
        var f = $('ob-review-frame');
        if (!f || e.source !== f.contentWindow) return;
        var m = PV.acceptFrameMessage(e.data);
        if (m) reviewY = m.y;
      });
    }
    // Step 3's live frame: after each load, the scroll position and the section to reveal; from it, only its scroll position
    if (PV && $('ob-sections-frame')) {
      $('ob-sections-frame').addEventListener('load', function () {
        var f = $('ob-sections-frame');
        if (f.contentWindow) f.contentWindow.postMessage(PV.initMessage(frameY, reveal), '*');
        reveal = null;
      });
      win.addEventListener('message', function (e) {
        var f = $('ob-sections-frame');
        if (!f || e.source !== f.contentWindow) return;
        var m = PV.acceptFrameMessage(e.data);
        if (m) frameY = m.y;
      });
    }

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
      // sign-out: the kept progress goes (this tab), and the answers in memory
      clearStore();
      forget();
      Promise.resolve(clerk && typeof clerk.signOut === 'function' ? clerk.signOut() : null).then(refresh, refresh);
    });
    AUTH.ready().then(function (c) {
      clerk = c;
      refresh();
      if (c && typeof c.addListener === 'function') c.addListener(function () { refresh(); });
    });
  }

  return { STEPS: STEPS, OPTIONS: OPTIONS, TX: TX, STORE_PREFIX: STORE_PREFIX, canStart: canStart, authState: authState, choose: choose, canNext: canNext, next: next, back: back,
    storeKey: storeKey, restore: restore, start: start };
});
