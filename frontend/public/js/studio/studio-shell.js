/*
 * studio-shell.js — Landing Page Studio V3: wires the Studio together.
 *
 * The approved layout (Phase 2A-2) with the Local Business placeholder
 * design: Sections / Add panel, live preview (studio-preview.js), the
 * Content / Style / Settings inspector (studio-inspector.js), the template
 * strip and the Studio appearance (Light / Dark / System).
 *
 * Phase 2A-3A / 2A-3B: the Hero and Buttons sections are editable. The
 * design lives only in memory (studio-store.js) with Undo / Redo; nothing is
 * saved: Save Draft and Publish stay disabled, and a reload starts again
 * from the demo. While anything is invalid, the preview keeps the last valid
 * version and says so. Adding, moving or deleting sections and the other
 * section types follow in later steps.
 *
 * No network: this file never calls an API (studio-routing.js decides where
 * the Studio may run at all: local mode, or preview mode on the protected
 * Studio staging address; both work on the in-memory demo only). The preview
 * is rendered by the shared js/lpV3/core.js.
 *
 * Deals / Offers (D2): the owner's real deals come from
 * studio-deals-data.js (read only, the one file with requests), only when
 * studio-routing.js gives an API address; this file hands it the Clerk
 * session token and passes the result to the renderer. Without an address
 * the preview shows labelled samples. The sign-in (Clerk) is loaded by
 * studio-auth.js on the connected preview only; the deals load once it is
 * known, and again when the signed-in account changes.
 */
(function () {
  'use strict';
  var V3 = window.QraivyV3;
  var STORE = window.QraivyStudioStore, PREVIEW = window.QraivyStudioPreview, INSPECTOR = window.QraivyStudioInspector;
  // the demo's starter photos: shown from the Studio's own files, with the AI label (2A-3H);
  // the preview frames get them inline (studio-demo-images.js prepare())
  var DEMO_IMAGES = window.QraivyStudioDemoImages || { localizeHtml: function (h) { return h; }, localSrc: function () { return null; }, displaySrc: function (u) { return u; } };
  var ROUTING = window.QRAIVY_STUDIO_ROUTING || { blocked: true };
  var DEALS = window.QraivyStudioDeals;
  var AUTH = window.QraivyStudioAuth ? window.QraivyStudioAuth.createAuth({ routing: ROUTING }) : null;
  var PAGES = window.QraivyStudioPages;
  var THEME_KEY = 'qraivy.studio.theme';
  var TEMPLATES_KEY = 'qraivy.studio.templates';
  var PANELS_KEY = 'qraivy.studio.panels';
  var $ = function (id) { return document.getElementById(id); };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }

  // ── texts ──
  var T = {
    en: {
      title: 'Landing Page Studio', subtitle: 'Create a beautiful mobile landing page for your business.', local_mode: 'Local preview · not saved', preview_mode: 'Preview · not saved',
      theme: 'Theme', theme_light: 'Light', theme_dark: 'Dark', theme_system: 'System', preview: 'Preview', save_draft: 'Save Draft', publish: 'Publish',
      save_disabled: 'Saving arrives in a later step.', publish_disabled: 'Publishing is not available yet.', more: 'More',
      menu_history: 'Version history', menu_settings: 'Page settings', menu_classic: 'Switch back to the classic page', menu_note: 'Available once the Studio is connected.',
      tab_sections: 'Sections', tab_add: 'Add', close: 'Close', add_section: 'Add Section', page_sections: 'Page sections', open_sections: 'Sections', open_edit: 'Edit section',
      page: 'Page', device: 'Device', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile', undo: 'Undo', redo: 'Redo',
      phone_note: 'Full editing works on a tablet or computer. On a phone you can preview and publish.',
      edit_section: 'Edit Section', insp_content: 'Content', insp_style: 'Style', insp_settings: 'Settings',
      undone: 'Undone', redone: 'Redone', preview_stale: 'Preview shows the last valid version. Fix the highlighted field.', select_section: 'Select a section on the left to see its settings.',
      templates: 'Page Templates', add_later: 'Adding sections arrives in the next step.',
      page_label: 'Page', page_src_import: 'Current page', page_src_draft: 'Studio draft', page_loading: 'Loading your pages …',
      page_loading_short: 'Loading …', page_empty_short: 'No landing page yet', page_signin_short: 'Please sign in', page_error_short: 'Pages not loaded',
      page_forbidden_short: 'Not one of your pages', page_notfound_short: 'Not one of your pages', page_invalid_short: 'Cannot be opened yet', page_not_live: ' (not live)', page_retry: 'Try again', page_signin_btn: 'Sign in', page_dashboard: 'Go to dashboard',
      page_loaded_import: 'Your current page “{name}”, opened as a Studio draft. Changes are not saved yet.', page_loaded_draft: 'Your Studio draft of “{name}”. Changes are not saved yet.',
      page_empty: 'You have no landing page yet. Create one in the dashboard; until then the Studio shows a sample page.', page_signin: 'Sign in to open your landing pages.',
      page_error: 'Your pages could not be loaded. The Studio shows a sample page.', page_forbidden: 'This page belongs to another account.', page_notfound: 'This page is not one of your pages.',
      page_invalid: 'This page cannot be opened in the Studio yet.', page_switch_confirm: 'Open another page? Your changes on this page are not saved and will be lost.',
      unavailable_title: "Landing Page Studio isn't available here yet", unavailable_text: 'The new Studio is still being built and tested. Your landing pages keep working as before.', unavailable_back: 'Back to Smart QR Pages',
      chip_all: 'All', chip_popular: 'Popular', chip_business: 'Business', chip_media: 'Media', chip_more: 'More',
      hidden: 'Hidden', items: '{n} items', change_image: 'Change Image', remove: 'Remove', no_image: 'No image yet',
      variant: 'Layout', yes: 'Yes', no: 'No', section_id: 'Section ID', anchor: 'Link name (#)', visibility: 'Show on page', section_header: 'Header', section_footer: 'Footer',
      hide_left: 'Hide sections panel', hide_right: 'Hide edit panel', local_account: 'Local preview', preview_account: 'Preview', not_signed_in: 'Not signed in',
    },
    de: {
      title: 'Landing Page Studio', subtitle: 'Erstelle eine schöne mobile Landingpage für dein Unternehmen.', local_mode: 'Lokale Vorschau · nicht gespeichert', preview_mode: 'Vorschau · nicht gespeichert',
      theme: 'Design', theme_light: 'Hell', theme_dark: 'Dunkel', theme_system: 'System', preview: 'Vorschau', save_draft: 'Entwurf speichern', publish: 'Veröffentlichen',
      save_disabled: 'Speichern folgt in einem späteren Schritt.', publish_disabled: 'Veröffentlichen ist noch nicht verfügbar.', more: 'Mehr',
      menu_history: 'Versionsverlauf', menu_settings: 'Seiteneinstellungen', menu_classic: 'Zur klassischen Seite zurück', menu_note: 'Verfügbar, sobald das Studio verbunden ist.',
      tab_sections: 'Abschnitte', tab_add: 'Hinzufügen', close: 'Schließen', add_section: 'Abschnitt hinzufügen', page_sections: 'Abschnitte der Seite', open_sections: 'Abschnitte', open_edit: 'Abschnitt bearbeiten',
      page: 'Seite', device: 'Gerät', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Smartphone', undo: 'Rückgängig', redo: 'Wiederholen',
      phone_note: 'Vollständig bearbeiten kannst du auf Tablet oder Computer. Auf dem Smartphone: Vorschau und Veröffentlichen.',
      edit_section: 'Abschnitt bearbeiten', insp_content: 'Inhalt', insp_style: 'Stil', insp_settings: 'Einstellungen',
      undone: 'Rückgängig gemacht', redone: 'Wiederholt', preview_stale: 'Die Vorschau zeigt die letzte gültige Version. Korrigiere das markierte Feld.', select_section: 'Wähle links einen Abschnitt, um seine Einstellungen zu sehen.',
      templates: 'Seitenvorlagen', add_later: 'Abschnitte hinzufügen folgt im nächsten Schritt.',
      page_label: 'Seite', page_src_import: 'Aktuelle Seite', page_src_draft: 'Studio-Entwurf', page_loading: 'Ihre Seiten werden geladen …',
      page_loading_short: 'Wird geladen …', page_empty_short: 'Noch keine Landingpage', page_signin_short: 'Bitte anmelden', page_error_short: 'Seiten nicht geladen',
      page_forbidden_short: 'Nicht Ihre Seite', page_notfound_short: 'Nicht Ihre Seite', page_invalid_short: 'Noch nicht zu öffnen', page_not_live: ' (nicht live)', page_retry: 'Erneut versuchen', page_signin_btn: 'Anmelden', page_dashboard: 'Zum Dashboard',
      page_loaded_import: 'Ihre aktuelle Seite „{name}“, als Studio-Entwurf geöffnet. Änderungen werden noch nicht gespeichert.', page_loaded_draft: 'Ihr Studio-Entwurf von „{name}“. Änderungen werden noch nicht gespeichert.',
      page_empty: 'Sie haben noch keine Landingpage. Erstellen Sie eine im Dashboard – bis dahin zeigt das Studio eine Beispielseite.', page_signin: 'Melden Sie sich an, um Ihre Landingpages zu öffnen.',
      page_error: 'Ihre Seiten konnten nicht geladen werden. Das Studio zeigt eine Beispielseite.', page_forbidden: 'Diese Seite gehört zu einem anderen Konto.', page_notfound: 'Diese Seite gehört nicht zu Ihren Seiten.',
      page_invalid: 'Diese Seite kann im Studio noch nicht geöffnet werden.', page_switch_confirm: 'Andere Seite öffnen? Ihre Änderungen an dieser Seite sind nicht gespeichert und gehen verloren.',
      unavailable_title: 'Das Landing Page Studio ist hier noch nicht verfügbar', unavailable_text: 'Das neue Studio wird noch gebaut und getestet. Deine Landingpages funktionieren weiter wie bisher.', unavailable_back: 'Zurück zu den Smart-QR-Seiten',
      chip_all: 'Alle', chip_popular: 'Beliebt', chip_business: 'Business', chip_media: 'Medien', chip_more: 'Mehr',
      hidden: 'Ausgeblendet', items: '{n} Einträge', change_image: 'Bild ändern', remove: 'Entfernen', no_image: 'Noch kein Bild',
      variant: 'Layout', yes: 'Ja', no: 'Nein', section_id: 'Abschnitts-ID', anchor: 'Linkname (#)', visibility: 'Auf der Seite zeigen', section_header: 'Kopfzeile', section_footer: 'Fußzeile',
      hide_left: 'Abschnittsleiste ausblenden', hide_right: 'Bearbeitungsleiste ausblenden', local_account: 'Lokale Vorschau', preview_account: 'Vorschau', not_signed_in: 'Nicht angemeldet',
    },
  };
  var SECTION_TEXT = {
    de: {
      hero: ['Hero', 'Auffälliger Kopfbereich mit Bild, Text und Buttons'], gallery: ['Galerie', 'Bilder, Produkte oder Speisekarte'],
      dealsOffers: ['Angebote', 'Aktuelle Angebote und Aktionen zeigen'], loyalty: ['Treueprogramm', 'Digitale Stempelkarte und Prämien'],
      products: ['Produkte', 'Produkte mit Links zum Shop'], openingHours: ['Öffnungszeiten', 'Deine Geschäftszeiten zeigen'],
      contact: ['Kontakt', 'Karte, Adresse, Telefon, E-Mail'], buttons: ['Buttons', 'WhatsApp, Anruf, Route, Website'],
      socialMedia: ['Social Media', 'Instagram, Facebook, TikTok usw.'], text: ['Textabschnitt', 'Text, Überschriften und Bilder'],
    },
  };
  var FIELD = {
    en: { eyebrow: 'Badge', headline: 'Headline', subheadline: 'Subheadline', backgroundImage: 'Background Image', imageAlt: 'Image description', overlay: 'Image darkening (%)',
      primary: 'Primary Button', secondary: 'Secondary Button', text: 'Text', target: 'Link', icon: 'Icon', color: 'Colour', title: 'Title', subtitle: 'Subtitle', items: 'Items',
      images: 'Images', maxItems: 'Number of offers', showAllText: '"Show all" text', showAllTarget: '"Show all" link', showWalletButtons: 'Wallet buttons', days: 'Days', note: 'Note',
      address: 'Address', phone: 'Phone', email: 'Email', mapsUrl: 'Map link', showMapLink: 'Show route button', links: 'Links', heading: 'Heading', body: 'Text', image: 'Image',
      background: 'Background', align: 'Alignment', spacing: 'Spacing' },
    de: { eyebrow: 'Badge', headline: 'Überschrift', subheadline: 'Unterzeile', backgroundImage: 'Hintergrundbild', imageAlt: 'Bildbeschreibung', overlay: 'Bild abdunkeln (%)',
      primary: 'Haupt-Button', secondary: 'Zweiter Button', text: 'Text', target: 'Link', icon: 'Symbol', color: 'Farbe', title: 'Titel', subtitle: 'Untertitel', items: 'Einträge',
      images: 'Bilder', maxItems: 'Anzahl Angebote', showAllText: 'Text „Alle anzeigen“', showAllTarget: 'Link „Alle anzeigen“', showWalletButtons: 'Wallet-Buttons', days: 'Tage', note: 'Hinweis',
      address: 'Adresse', phone: 'Telefon', email: 'E-Mail', mapsUrl: 'Karten-Link', showMapLink: 'Routen-Button zeigen', links: 'Links', heading: 'Überschrift', body: 'Text', image: 'Bild',
      background: 'Hintergrund', align: 'Ausrichtung', spacing: 'Abstand' },
  };
  var TEMPLATES = [
    { id: 'local', cls: 'st-tpl--local', thumb: 'Tradition trifft Genuss', en: ['Local Business', 'Perfect for restaurants, bakeries, salons and local shops.'], de: ['Lokales Geschäft', 'Ideal für Restaurants, Bäckereien, Salons und Läden vor Ort.'] },
    { id: 'bio', cls: 'st-tpl--bio', thumb: 'Dein Link in Bio', en: ['Link-in-Bio', 'Ideal for creators, influencers and social profiles.'], de: ['Link-in-Bio', 'Ideal für Creator, Influencer und Social-Profile.'] },
    { id: 'gallery', cls: 'st-tpl--gallery', thumb: 'Natürliche Schönheit', en: ['Product Gallery', 'Show your products with images and purchase links.'], de: ['Produktgalerie', 'Zeige deine Produkte mit Bildern und Kauf-Links.'] },
    { id: 'campaign', cls: 'st-tpl--campaign', thumb: 'Sommer Angebote', en: ['Campaign Page', 'Promotions, seasonal campaigns and lead generation.'], de: ['Kampagnenseite', 'Aktionen, Saisonkampagnen und Leadgewinnung.'] },
    { id: 'loyalty', cls: 'st-tpl--loyalty', thumb: 'Unsere Stempelkarte', en: ['Loyalty & Rewards', 'Customer loyalty, rewards and subscriber signup.'], de: ['Treue & Prämien', 'Kundentreue, Prämien und Anmeldungen.'] },
  ];
  var CHIPS = ['all', 'popular', 'business', 'media', 'more'];

  var state = { lang: 'en', chip: 'all', leftTab: 'add', insp: 'content' };
  var editor = null, preview = null, inspector = null;
  // the Deals / Offers preview: { state, pages, page, items, withheld } (studio-deals-data.js)
  var dealsData = null, dealsView = { state: 'sample', pages: [], page: '', items: [], withheld: 0 }, dealsLoad = 0;
  // the owner's own pages (studio-pages-data.js): state off | loading | ready | empty | signin | error |
  // forbidden | notfound | invalid; current = the page open in the editor (null: the demo)
  var pagesData = null, pageView = { state: 'off', pages: [], current: null, source: '' }, pageLoad = 0;
  function lang() { return window.QraivyShell ? window.QraivyShell.lang() : 'en'; }
  function t(k) { var d = T[state.lang] || T.en; return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : T.en[k]; }
  function sectionText(type) {
    var lib = V3.library().filter(function (s) { return s.type === type; })[0];
    var de = SECTION_TEXT[state.lang] && SECTION_TEXT[state.lang][type];
    return de ? { label: de[0], description: de[1] } : { label: lib.label, description: lib.description };
  }
  function fieldLabel(k) { var d = FIELD[state.lang] || FIELD.en; return d[k] || FIELD.en[k] || k; }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function icon(id, cls) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg'); s.setAttribute('class', 'st-ic' + (cls ? ' ' + cls : '')); s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(ns, 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s;
  }

  // ── static texts ──
  function applyTexts() {
    document.querySelectorAll('[data-st]').forEach(function (n) { n.textContent = t(n.getAttribute('data-st')); });
    document.querySelectorAll('[data-st-aria]').forEach(function (n) { var v = t(n.getAttribute('data-st-aria')); n.setAttribute('aria-label', v); n.setAttribute('title', v); });
    document.querySelectorAll('[data-st-title]').forEach(function (n) { n.setAttribute('title', t(n.getAttribute('data-st-title'))); });
  }
  window.toggleLang = function () {
    var next = lang() === 'en' ? 'de' : 'en';
    if (window.QraivyShell) window.QraivyShell.apply(next);
    state.lang = next;
    renderAll();
  };

  // ── appearance (Studio chrome only) ──
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function themePref() { var p = store(THEME_KEY); return p === 'dark' || p === 'system' ? p : 'light'; }
  function applyTheme() {
    var pref = themePref();
    var dark = pref === 'dark' || (pref === 'system' && darkQuery && darkQuery.matches);
    document.documentElement.setAttribute('data-studio-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-studio-theme-pref', pref);
    document.querySelectorAll('[data-theme-pref]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-theme-pref') === pref)); });
  }
  function bindTheme() {
    document.querySelectorAll('[data-theme-pref]').forEach(function (b) {
      b.addEventListener('click', function () { store(THEME_KEY, b.getAttribute('data-theme-pref')); applyTheme(); });
    });
    if (darkQuery) { var f = function () { if (themePref() === 'system') applyTheme(); }; if (darkQuery.addEventListener) darkQuery.addEventListener('change', f); else if (darkQuery.addListener) darkQuery.addListener(f); }
    applyTheme();
  }

  // ── left: Add (library) and Sections (outline) ──
  function renderChips() {
    var box = $('st-chips'); box.textContent = '';
    CHIPS.forEach(function (c) {
      var b = el('button', { type: 'button', class: 'st-chip', 'aria-pressed': String(state.chip === c), text: t('chip_' + c) });
      b.addEventListener('click', function () { state.chip = c; renderChips(); renderLibrary(); });
      box.appendChild(b);
    });
  }
  function renderLibrary() {
    var list = $('st-lib'); list.textContent = '';
    V3.library().filter(function (s) { return state.chip === 'all' || s.category.indexOf(state.chip) !== -1; }).forEach(function (s) {
      var tx = sectionText(s.type);
      var item = el('button', { type: 'button', class: 'st-lib__item', title: t('add_later'), 'data-type': s.type }, [
        el('span', { class: 'st-lib__icon' }, [icon('st-t-' + s.type)]),
        el('span', { class: 'st-lib__text' }, [el('strong', { text: tx.label }), el('small', { text: tx.description })]),
        el('span', { class: 'st-lib__more', 'aria-hidden': 'true' }, [icon('st-dots')]),
      ]);
      list.appendChild(el('li', {}, [item]));
    });
  }
  function sectionSummary(s) {
    var d = s.data || {};
    return d.headline || d.title || d.heading || (d.items && d.items[0] && (d.items[0].label || d.items[0].name)) || '';
  }
  function renderOutline() {
    var list = $('st-outline');
    var had = list.contains(document.activeElement) ? document.activeElement.getAttribute('data-id') : null;
    list.textContent = '';
    editor.draft().pages[0].sections.forEach(function (s) {
      var tx = sectionText(s.type);
      var item = el('button', { type: 'button', class: 'st-outline__item' + (s.hidden ? ' is-hidden' : ''), 'aria-current': String(editor.selected() === s.id), 'data-id': s.id }, [
        el('span', { class: 'st-outline__grip', 'aria-hidden': 'true' }, [icon('st-grip')]),
        el('span', { class: 'st-lib__icon' }, [icon('st-t-' + s.type)]),
        el('span', { class: 'st-lib__text' }, [el('strong', { text: tx.label }), el('small', { text: sectionSummary(s) })]),
        el('span', { class: 'st-lib__more', 'aria-hidden': 'true' }, [icon(s.hidden ? 'st-eye-off' : 'st-eye')]),
      ]);
      item.addEventListener('click', function () { select(s.id, 'outline'); });
      list.appendChild(el('li', {}, [item]));
    });
    if (had) { var back = list.querySelector('[data-id="' + had + '"]'); if (back) back.focus(); }
  }
  function setLeftTab(tab) {
    state.leftTab = tab;
    [['sections', 'st-tab-sections', 'st-pane-sections'], ['add', 'st-tab-add', 'st-pane-add']].forEach(function (x) {
      $(x[1]).setAttribute('aria-selected', String(x[0] === tab));
      $(x[2]).hidden = x[0] !== tab;
    });
  }

  // ── selection, editing, Undo / Redo ──
  // from: 'outline' (the preview scrolls to it), 'preview' (clicked there).
  function select(id, from) {
    if (!editor.select(id)) return;
    if (from === 'preview' && state.leftTab !== 'sections') setLeftTab('sections');
    renderOutline();
    inspector.render();
    preview.select(id, from === 'outline');
  }
  // The page as the shared core renders it, from the last valid design: an
  // invalid edit never reaches the preview.
  function pageHtml() {
    var valid = editor.lastValid();
    var name = pageView.current ? pageView.current.name : window.QRAIVY_STUDIO_DEMO.businessName;
    var r = valid ? V3.renderDesign(valid, { businessName: name }, { preview: true, deals: dealsView }) : null;
    return r && r.ok ? DEMO_IMAGES.localizeHtml(r.html) : preview.html();
  }
  // The signed-in Clerk session's token (the Deal Builder's mechanism); none without a session.
  function clerkToken() {
    var c = window.Clerk;
    return c && c.session && typeof c.session.getToken === 'function' ? c.session.getToken() : null;
  }
  function showDeals(view) {
    dealsView = view;
    preview.setHtml(pageHtml(), 0);
    inspector.refresh();
  }
  // (Re)load the owner's deals; only the latest answer is shown.
  function loadDeals() {
    if (!dealsData || !dealsData.connected()) return;
    var n = ++dealsLoad;
    showDeals({ state: 'loading', pages: dealsView.pages, page: dealsView.page, items: [], withheld: 0 });
    dealsData.load(dealsView.page).then(function (view) {
      if (n !== dealsLoad) return;
      // the deals of the page open in the editor, when it is one of the owner's pages
      var loaded = view.state === 'live' || view.state === 'none';
      showDeals(loaded && pageView.current ? dealsOf(pageView.current.slug) : view);
    });
  }
  // First load: once the sign-in is known (studio-auth.js); again on a new sign-in.
  function startDeals() {
    if (!dealsData || !dealsData.connected()) return;
    showDeals({ state: 'loading', pages: [], page: '', items: [], withheld: 0 });
    (AUTH ? AUTH.ready() : Promise.resolve()).then(loadDeals);
    if (AUTH) AUTH.onChange(loadDeals);
  }
  // the page whose deals the preview shows (the inspector's choice; not saved)
  function selectDealsPage(slug) {
    var view = dealsData && dealsData.select(slug);
    if (view) showDeals(view);
  }
  // The deals of exactly this page (never another page's: the Deals data
  // falls back to another page when it does not know the slug).
  function dealsOf(slug) {
    var view = dealsData && dealsData.select(slug);
    if (!view) return dealsView;
    return view.page === slug ? view : { state: 'none', pages: view.pages, page: slug, items: [], withheld: 0 };
  }

  // ── the owner's own pages (Phase A: read only, nothing is saved) ──
  // ?slug=… in the address: that page (when it is one of the owner's)
  function requestedSlug() {
    var s = null;
    try { s = new URLSearchParams(window.location.search).get('slug'); } catch (e) { s = null; }
    return s && PAGES && PAGES.SLUG.test(s) ? s : null;
  }
  function rememberSlug(slug) {
    try { var u = new URL(window.location.href); u.searchParams.set('slug', slug); window.history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {}
  }
  function renderPageBar() {
    var bar = $('st-pagebar');
    if (pageView.state === 'off') { bar.hidden = true; return; }
    bar.hidden = false;
    $('st-top').querySelector('.st-top__title').setAttribute('data-pages', '');
    var sel = $('st-page-select');
    var pages = pageView.pages;
    sel.textContent = '';
    pages.forEach(function (p) { sel.appendChild(el('option', { value: p.slug, text: p.name + (p.live ? '' : t('page_not_live')) })); });
    // nothing chosen while no page of the owner is open (e.g. ?slug of another account's page)
    if (pageView.current) sel.value = pageView.current.slug; else sel.selectedIndex = -1;
    sel.hidden = !pages.length;
    sel.disabled = pageView.state === 'loading';
    var st = pageView.state, msg = '', shown = '';
    if (st === 'loaded') {
      msg = t(pageView.source === 'draft' ? 'page_loaded_draft' : 'page_loaded_import').replace('{name}', pageView.current.name);
      // short in the bar (the selector already names the page); the full sentence as its title
      shown = t(pageView.source === 'draft' ? 'page_src_draft' : 'page_src_import');
    } else { msg = t('page_' + st); shown = t('page_' + st + '_short'); }
    var status = $('st-page-status');
    status.textContent = shown;
    status.title = msg;
    status.setAttribute('data-state', st);
    $('st-page-retry').hidden = st !== 'error';
    $('st-page-signin').hidden = st !== 'signin' || !(AUTH && AUTH.available());
    $('st-page-dashboard').hidden = st !== 'empty';
  }
  // Back to the sample page: the open customer page (if any) leaves the editor.
  function showSample() {
    if (!pageView.current) return;
    pageView.current = null;
    // the address no longer names that page (a next account starts from its own pages)
    try { var u = new URL(window.location.href); u.searchParams.delete('slug'); window.history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {}
    editor.load(window.QRAIVY_STUDIO_DEMO.design);
    select('s_hero01');
    preview.setHtml(pageHtml(), 0);
    // and the deals again under the current sign-in (signed out: none; another account: its own)
    dealsView.page = '';
    loadDeals();
  }
  function showPages(patch) { Object.keys(patch).forEach(function (k) { pageView[k] = patch[k]; }); renderPageBar(); }
  // Open one of the owner's pages in the editor (its saved draft, or the
  // current page converted in memory). Only the latest request counts.
  function openPage(slug) {
    if (!pagesData) return;
    if (pageView.current && pageView.current.slug !== slug && editor.canUndo() && !window.confirm(t('page_switch_confirm'))) { renderPageBar(); return; }
    var n = ++pageLoad;
    showPages({ state: 'loading' });
    pagesData.load(slug).then(function (r) {
      if (n !== pageLoad) return;
      if (r.state !== 'loaded') {
        // signed out or no longer this account's page: its content leaves the editor
        if (r.state === 'signin' || r.state === 'forbidden' || r.state === 'notfound') { showSample(); showPages({ state: r.state }); }
        else showPages({ state: 'error' });
        return;
      }
      if (!editor.load(r.design)) { showPages({ state: 'invalid' }); return; }
      pageView.current = r.page;
      showPages({ state: 'loaded', source: r.source });
      rememberSlug(r.page.slug);
      var first = editor.sectionIds()[0];
      if (first) select(first);
      preview.setHtml(pageHtml(), 0);
      // the Deals / Offers preview follows the open page
      dealsView.page = r.page.slug;
      showDeals(dealsOf(r.page.slug));
    });
  }
  // List the owner's pages; open ?slug=… or else the most recently changed one.
  // No page is ever created here.
  function listPages() {
    if (!pagesData || !pagesData.connected()) return;
    var n = ++pageLoad;
    showPages({ state: 'loading' });
    pagesData.list().then(function (r) {
      if (n !== pageLoad) return;
      var known = function (s) { return r.pages.some(function (p) { return p.slug === s; }); };
      // signed out, another account, no pages or a failure: no previous
      // customer's page stays in the editor (the sample page instead)
      if (r.state !== 'ready' || (pageView.current && !known(pageView.current.slug))) showSample();
      if (r.state !== 'ready') { showPages({ state: r.state === 'notfound' ? 'error' : r.state, pages: r.pages }); return; }
      pageView.pages = r.pages;
      var want = requestedSlug();
      if (want && !known(want)) { showSample(); showPages({ state: 'notfound' }); return; }
      openPage(want || (pageView.current && known(pageView.current.slug) ? pageView.current.slug : r.pages[0].slug));
    });
  }
  function startPages() {
    if (!pagesData || !pagesData.connected()) return;
    showPages({ state: 'loading' });
    (AUTH ? AUTH.ready() : Promise.resolve()).then(listPages);
    if (AUTH) AUTH.onChange(listPages);
  }
  function historyButtons() {
    $('st-undo-btn').disabled = !editor.canUndo();
    $('st-redo-btn').disabled = !editor.canRedo();
  }
  // the approved notice while anything is invalid: the preview keeps the last valid version
  function staleNote() { $('st-stale').hidden = editor.isValid(); }
  function announce(msg) { var n = $('st-live'); n.textContent = ''; setTimeout(function () { n.textContent = msg; }, 30); }
  function onStoreChange(kind, info) {
    if (kind === 'select') return;
    // Undo / Redo and list changes (add, move, remove) rebuild the inspector
    if (kind === 'history' || info.structure) inspector.render(); else inspector.refresh();
    staleNote();
    renderOutline();
    historyButtons();
    // typing: one preview update after a short pause; anything else at once
    preview.setHtml(pageHtml(), info.typing ? 150 : 0);
  }
  function undo() { if (editor.undo()) announce(t('undone')); }
  function redo() { if (editor.redo()) announce(t('redone')); }
  // Ctrl / Cmd + Z, Shift + Ctrl / Cmd + Z, Ctrl + Y. In a text field the
  // browser's own text undo applies; on phones nothing is edited.
  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || preview.phoneOnly()) return;
    var k = String(e.key || '').toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    var a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|number|search|url|email|tel)$/.test(a.type)) || a.isContentEditable)) return;
    if (!$('st-full').hidden) return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
  }

  // ── templates strip ──
  function renderTemplates() {
    var list = $('st-templates-list'); list.textContent = '';
    TEMPLATES.forEach(function (tp, i) {
      var tx = tp[state.lang] || tp.en;
      var b = el('button', { type: 'button', class: 'st-tpl ' + tp.cls, 'aria-current': String(tp.id === 'local'), title: t('add_later') }, [
        el('span', { class: 'st-tpl__thumb', 'aria-hidden': 'true' }, [el('b', { text: tp.thumb }), el('span')]),
        el('strong', { text: (i + 1) + '. ' + tx[0] }), el('small', { text: tx[1] })]);
      list.appendChild(el('li', {}, [b]));
    });
    // Open by default on desktops (as in the mockup); on tablets and phones the
    // preview comes first, so the strip starts collapsed unless it was opened.
    var kept = store(TEMPLATES_KEY);
    var open = kept ? kept === 'open' : !(window.matchMedia && window.matchMedia('(max-width: 1199px), (max-height: 899px)').matches);
    $('st-templates-toggle').setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  }

  // ── desktop panels: each can be hidden on its own (remembered) ──
  function desktop() { return !(window.matchMedia && window.matchMedia('(max-width: 1199px)').matches); }
  function panels() { try { var p = JSON.parse(store(PANELS_KEY) || '{}'); return { left: p.left !== false, right: p.right !== false }; } catch (e) { return { left: true, right: true }; } }
  function applyPanels() {
    var p = panels();
    $('st-work').classList.toggle('no-left', !p.left);
    $('st-work').classList.toggle('no-right', !p.right);
    preview.fit();
  }
  function setPanel(side, shown) { var p = panels(); p[side] = shown; store(PANELS_KEY, JSON.stringify(p)); applyPanels(); }

  // The sidebar account in local and preview mode: nobody is signed in, say
  // so plainly.
  function localAccount() {
    if (ROUTING.mode !== 'local' && ROUTING.mode !== 'preview') return;
    var n = $('sb-username'), a = $('sb-avatar'), role = document.querySelector('#sidebar .sb-user-role');
    if (n) n.textContent = t(ROUTING.mode === 'preview' ? 'preview_account' : 'local_account');
    if (a) a.textContent = 'Q';
    if (role) role.textContent = t('not_signed_in');
  }

  // ── drawers (below 1200 px) and menus ──
  function closeDrawers() {
    ['st-left', 'st-right'].forEach(function (id) { $(id).classList.remove('is-open'); });
    $('st-scrim').hidden = true;
  }
  function openDrawer(id) {
    closeDrawers();
    $(id).classList.add('is-open');
    $('st-scrim').hidden = false;
  }
  function bindUi() {
    $('st-tab-sections').addEventListener('click', function () { setLeftTab('sections'); });
    $('st-tab-add').addEventListener('click', function () { setLeftTab('add'); });
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-insp]'));
    var setInsp = function (b) { state.insp = b.getAttribute('data-insp'); inspTabs(); inspector.render(); };
    tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { setInsp(b); });
      // arrow keys move between the tabs (ARIA tabs)
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = tabs[(i + d + tabs.length) % tabs.length];
        n.focus(); setInsp(n);
      });
    });
    document.querySelectorAll('button[data-device]').forEach(function (b) { b.addEventListener('click', function () { preview.setDevice(b.getAttribute('data-device')); deviceButtons(); }); });
    $('st-undo-btn').addEventListener('click', undo);
    $('st-redo-btn').addEventListener('click', redo);
    document.addEventListener('keydown', onKey);
    // Below 1200 px these open the drawers; on a desktop they bring a hidden panel back.
    $('st-open-left').addEventListener('click', function () { if (desktop()) setPanel('left', true); else openDrawer('st-left'); });
    $('st-open-right').addEventListener('click', function () { if (desktop()) setPanel('right', true); else openDrawer('st-right'); });
    $('st-collapse-left').addEventListener('click', function () { setPanel('left', false); $('st-open-left').focus(); });
    $('st-collapse-right').addEventListener('click', function () { setPanel('right', false); $('st-open-right').focus(); });
    $('st-scrim').addEventListener('click', closeDrawers);
    document.querySelectorAll('[data-close-drawer]').forEach(function (b) { b.addEventListener('click', closeDrawers); });
    $('st-templates-toggle').addEventListener('click', function () {
      var open = $('st-templates-toggle').getAttribute('aria-expanded') !== 'true';
      store(TEMPLATES_KEY, open ? 'open' : 'collapsed');
      renderTemplates();
      preview.fit();
    });
    var more = $('st-more-btn'), menu = $('st-more-menu');
    more.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); } });
    // full size: the plain page (sandboxed with no permissions, no Studio script)
    $('st-preview-btn').addEventListener('click', function () { $('st-full-frame').srcdoc = pageHtml(); $('st-full').hidden = false; $('st-full-close').focus(); });
    $('st-full-close').addEventListener('click', function () { $('st-full').hidden = true; $('st-preview-btn').focus(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('st-full').hidden) { $('st-full').hidden = true; return; }
      if (!menu.hidden) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); return; }
      closeDrawers();
    });
    var resizeTimer = null;
    var onResize = function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { preview.render(); if (window.innerWidth >= 1200) closeDrawers(); }, 80); };
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(function () { preview.fit(); }).observe($('st-canvas'));
  }

  function inspTabs() { document.querySelectorAll('[data-insp]').forEach(function (b) { var on = b.getAttribute('data-insp') === state.insp; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); }
  function deviceButtons() { document.querySelectorAll('button[data-device]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-device') === preview.device())); }); }

  function renderAll() {
    state.lang = lang();
    applyTexts();
    renderChips(); renderLibrary(); renderOutline(); inspTabs(); inspector.render(); renderTemplates();
    localAccount();
    renderPageBar();
  }

  function start() {
    bindTheme();
    state.lang = lang();
    if (ROUTING.blocked || !V3 || !STORE || !PREVIEW || !INSPECTOR) {
      $('st-app').setAttribute('data-unavailable', '');
      $('st-unavailable').hidden = false;
      applyTexts();
      return;
    }
    // preview mode: the same Studio with its own label (texts follow the language)
    if (ROUTING.mode === 'preview') $('st-mode').setAttribute('data-st', 'preview_mode');
    var demo = window.QRAIVY_STUDIO_DEMO;
    editor = STORE.createStore({ design: demo.design, validate: V3.validateDesign });
    editor.select('s_hero01');
    preview = PREVIEW.createPreview({ canvas: $('st-canvas'), title: function (d) { return t(d); },
      // a click in the preview selects that section (not on phones: preview only)
      onSelect: function (id) { if (!preview.phoneOnly() && id !== editor.selected()) select(id, 'preview'); } });
    inspector = INSPECTOR.createInspector({ box: $('st-fields'), note: $('st-note'), kind: $('st-kind'), store: editor, V3: V3, el: el, icon: icon,
      lang: function () { return state.lang; }, tab: function () { return state.insp; }, t: t, fieldLabel: fieldLabel,
      sectionLabel: function (type) { return sectionText(type).label; }, announce: announce, brand: (demo.design.theme.palette.brand || V3.DEFAULT_PALETTE.brand).toLowerCase(),
      displaySrc: DEMO_IMAGES.displaySrc, aiLabel: function (u) { return DEMO_IMAGES.localSrc(u) ? DEMO_IMAGES.AI_LABEL : ''; },
      deals: function () { return dealsView; }, selectDealsPage: selectDealsPage, retryDeals: loadDeals,
      signIn: function () { return !!(AUTH && AUTH.signIn()); }, dealBuilder: ROUTING.builder || 'deals.html' });
    if (DEALS) dealsData = DEALS.createDealsData({ api: ROUTING.api, getToken: clerkToken, starters: (window.QRAIVY_DEAL_STARTER_IMAGES || {}).images });
    if (PAGES) pagesData = PAGES.createPagesData({ api: ROUTING.api, getToken: clerkToken });
    $('st-page-select').addEventListener('change', function () { openPage($('st-page-select').value); });
    $('st-page-retry').addEventListener('click', listPages);
    $('st-page-signin').addEventListener('click', function () { if (AUTH) AUTH.signIn(); });
    // the trusted Gallery controller (js/lpV3/gallery-nav.js, loaded by
    // studio.html): its fixed code for the sandboxed frames, which load
    // nothing themselves; without it: no buttons, swipe and the hint remain
    if (window.QraivyGalleryNav) preview.setNavScript(window.QraivyGalleryNav.source);
    preview.setHtml(pageHtml(), 0);
    // the demo photos as inline images for the sandboxed frames; once ready, show them
    if (DEMO_IMAGES.prepare) DEMO_IMAGES.prepare(function () { preview.setHtml(pageHtml(), 0); });
    preview.select(editor.selected(), false);
    renderAll();
    setLeftTab(state.leftTab);
    bindUi();
    editor.onChange(onStoreChange);
    historyButtons();
    staleNote();
    applyPanels();
    preview.render();
    deviceButtons();
    startPages();
    startDeals();
    window.QraivyStudio = { state: state, editor: editor, preview: preview }; // for local inspection only
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
