/*
 * studio-shell.js — Landing Page Studio V3: wires the Studio together.
 *
 * The approved layout (Phase 2A-2) with the Local Business placeholder
 * design: Sections / Add panel, live preview (studio-preview.js), the
 * Content / Style / Settings inspector (studio-inspector.js), the template
 * strip and the Studio appearance (Light / Dark / System).
 *
 * Phase 2A-3A: the Hero section is editable. The design lives only in
 * memory (studio-editor.js) with Undo / Redo; nothing is saved: Save Draft
 * and Publish stay disabled, and a reload starts again from the demo.
 * Adding, moving or deleting sections and the other section types follow in
 * later steps.
 *
 * No network: this file never calls an API (studio-routing.js decides where
 * the Studio may run at all). The preview is rendered by the shared
 * js/lpV3/core.js.
 */
(function () {
  'use strict';
  var V3 = window.QraivyV3;
  var STORE = window.QraivyStudioStore, PREVIEW = window.QraivyStudioPreview, INSPECTOR = window.QraivyStudioInspector;
  var ROUTING = window.QRAIVY_STUDIO_ROUTING || { blocked: true };
  var THEME_KEY = 'qraivy.studio.theme';
  var TEMPLATES_KEY = 'qraivy.studio.templates';
  var PANELS_KEY = 'qraivy.studio.panels';
  var $ = function (id) { return document.getElementById(id); };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }

  // ── texts ──
  var T = {
    en: {
      title: 'Landing Page Studio', subtitle: 'Create a beautiful mobile landing page for your business.', local_mode: 'Local preview · not saved',
      theme: 'Theme', theme_light: 'Light', theme_dark: 'Dark', theme_system: 'System', preview: 'Preview', save_draft: 'Save Draft', publish: 'Publish',
      save_disabled: 'Saving arrives in a later step.', publish_disabled: 'Publishing is not available yet.', more: 'More',
      menu_history: 'Version history', menu_settings: 'Page settings', menu_classic: 'Switch back to the classic page', menu_note: 'Available once the Studio is connected.',
      tab_sections: 'Sections', tab_add: 'Add', close: 'Close', add_section: 'Add Section', page_sections: 'Page sections', open_sections: 'Sections', open_edit: 'Edit section',
      page: 'Page', device: 'Device', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile', undo: 'Undo', redo: 'Redo',
      phone_note: 'Full editing works on a tablet or computer. On a phone you can preview and publish.',
      edit_section: 'Edit Section', insp_content: 'Content', insp_style: 'Style', insp_settings: 'Settings',
      undone: 'Undone', redone: 'Redone', select_section: 'Select a section on the left to see its settings.',
      templates: 'Page Templates', add_later: 'Adding sections arrives in the next step.',
      unavailable_title: "Landing Page Studio isn't available here yet", unavailable_text: 'The new Studio is still being built and tested. Your landing pages keep working as before.', unavailable_back: 'Back to Smart QR Pages',
      chip_all: 'All', chip_popular: 'Popular', chip_business: 'Business', chip_media: 'Media', chip_more: 'More',
      hidden: 'Hidden', items: '{n} items', change_image: 'Change Image', remove: 'Remove', no_image: 'No image yet',
      variant: 'Layout', yes: 'Yes', no: 'No', section_id: 'Section ID', anchor: 'Link name (#)', visibility: 'Show on page', section_header: 'Header', section_footer: 'Footer',
      hide_left: 'Hide sections panel', hide_right: 'Hide edit panel', local_account: 'Local preview', not_signed_in: 'Not signed in',
    },
    de: {
      title: 'Landing Page Studio', subtitle: 'Erstelle eine schöne mobile Landingpage für dein Unternehmen.', local_mode: 'Lokale Vorschau · nicht gespeichert',
      theme: 'Design', theme_light: 'Hell', theme_dark: 'Dunkel', theme_system: 'System', preview: 'Vorschau', save_draft: 'Entwurf speichern', publish: 'Veröffentlichen',
      save_disabled: 'Speichern folgt in einem späteren Schritt.', publish_disabled: 'Veröffentlichen ist noch nicht verfügbar.', more: 'Mehr',
      menu_history: 'Versionsverlauf', menu_settings: 'Seiteneinstellungen', menu_classic: 'Zur klassischen Seite zurück', menu_note: 'Verfügbar, sobald das Studio verbunden ist.',
      tab_sections: 'Abschnitte', tab_add: 'Hinzufügen', close: 'Schließen', add_section: 'Abschnitt hinzufügen', page_sections: 'Abschnitte der Seite', open_sections: 'Abschnitte', open_edit: 'Abschnitt bearbeiten',
      page: 'Seite', device: 'Gerät', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Smartphone', undo: 'Rückgängig', redo: 'Wiederholen',
      phone_note: 'Vollständig bearbeiten kannst du auf Tablet oder Computer. Auf dem Smartphone: Vorschau und Veröffentlichen.',
      edit_section: 'Abschnitt bearbeiten', insp_content: 'Inhalt', insp_style: 'Stil', insp_settings: 'Einstellungen',
      undone: 'Rückgängig gemacht', redone: 'Wiederholt', select_section: 'Wähle links einen Abschnitt, um seine Einstellungen zu sehen.',
      templates: 'Seitenvorlagen', add_later: 'Abschnitte hinzufügen folgt im nächsten Schritt.',
      unavailable_title: 'Das Landing Page Studio ist hier noch nicht verfügbar', unavailable_text: 'Das neue Studio wird noch gebaut und getestet. Deine Landingpages funktionieren weiter wie bisher.', unavailable_back: 'Zurück zu den Smart-QR-Seiten',
      chip_all: 'Alle', chip_popular: 'Beliebt', chip_business: 'Business', chip_media: 'Medien', chip_more: 'Mehr',
      hidden: 'Ausgeblendet', items: '{n} Einträge', change_image: 'Bild ändern', remove: 'Entfernen', no_image: 'Noch kein Bild',
      variant: 'Layout', yes: 'Ja', no: 'Nein', section_id: 'Abschnitts-ID', anchor: 'Linkname (#)', visibility: 'Auf der Seite zeigen', section_header: 'Kopfzeile', section_footer: 'Fußzeile',
      hide_left: 'Abschnittsleiste ausblenden', hide_right: 'Bearbeitungsleiste ausblenden', local_account: 'Lokale Vorschau', not_signed_in: 'Nicht angemeldet',
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
    var r = valid ? V3.renderDesign(valid, { businessName: window.QRAIVY_STUDIO_DEMO.businessName }, { preview: true }) : null;
    return r && r.ok ? r.html : preview.html();
  }
  function historyButtons() {
    $('st-undo-btn').disabled = !editor.canUndo();
    $('st-redo-btn').disabled = !editor.canRedo();
  }
  function announce(msg) { var n = $('st-live'); n.textContent = ''; setTimeout(function () { n.textContent = msg; }, 30); }
  function onStoreChange(kind, info) {
    if (kind === 'select') return;
    if (kind === 'history') inspector.render(); else inspector.refresh();
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

  // The sidebar account in local mode: nobody is signed in, say so plainly.
  function localAccount() {
    if (ROUTING.mode !== 'local') return;
    var n = $('sb-username'), a = $('sb-avatar'), role = document.querySelector('#sidebar .sb-user-role');
    if (n) n.textContent = t('local_account');
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
    var demo = window.QRAIVY_STUDIO_DEMO;
    editor = STORE.createStore({ design: demo.design, validate: V3.validateDesign });
    editor.select('s_hero01');
    preview = PREVIEW.createPreview({ canvas: $('st-canvas'), title: function (d) { return t(d); },
      // a click in the preview selects that section (not on phones: preview only)
      onSelect: function (id) { if (!preview.phoneOnly() && id !== editor.selected()) select(id, 'preview'); } });
    inspector = INSPECTOR.createInspector({ box: $('st-fields'), note: $('st-note'), kind: $('st-kind'), store: editor, V3: V3, el: el, icon: icon,
      lang: function () { return state.lang; }, tab: function () { return state.insp; }, t: t, fieldLabel: fieldLabel,
      sectionLabel: function (type) { return sectionText(type).label; }, brand: (demo.design.theme.palette.brand || V3.DEFAULT_PALETTE.brand).toLowerCase() });
    preview.setHtml(pageHtml(), 0);
    preview.select(editor.selected(), false);
    renderAll();
    setLeftTab(state.leftTab);
    bindUi();
    editor.onChange(onStoreChange);
    historyButtons();
    applyPanels();
    preview.render();
    deviceButtons();
    window.QraivyStudio = { state: state, editor: editor, preview: preview }; // for local inspection only
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
