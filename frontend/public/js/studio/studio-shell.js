/*
 * studio-shell.js — Landing Page Studio V3, Phase 2A-2: the visual shell.
 *
 * Shows the approved layout with the Local Business placeholder design:
 * Sections / Add panel, live preview (desktop / tablet / mobile), the
 * Content / Style / Settings inspector (read-only, generated from
 * QraivyV3.describe()), the template strip and the Studio appearance
 * (Light / Dark / System). Editing, saving and publishing are not part of
 * this step: Save Draft, Publish and Undo / Redo stay disabled.
 *
 * No network: this file never calls an API (studio-routing.js decides where
 * the Studio may run at all). The preview is rendered by the shared
 * js/lpV3/core.js into an iframe sandboxed with no permissions.
 */
(function () {
  'use strict';
  var V3 = window.QraivyV3;
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
      readonly_note: 'Read-only in this build: editing arrives in the next step.', select_section: 'Select a section on the left to see its settings.',
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
      readonly_note: 'In diesem Stand nur zur Ansicht: Bearbeiten folgt im nächsten Schritt.', select_section: 'Wähle links einen Abschnitt, um seine Einstellungen zu sehen.',
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
  var FRAMES = { desktop: { w: 1280, h: 800, chrome: 30 }, tablet: { w: 820, h: 1180, pad: 14 }, mobile: { w: 390, h: 844, pad: 12 } };

  var state = { lang: 'en', chip: 'all', leftTab: 'add', insp: 'content', selected: 's_hero01', device: 'desktop', html: '' };
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
  function demoSections() { return window.QRAIVY_STUDIO_DEMO.design.pages[0].sections; }
  function sectionSummary(s) {
    var d = s.data || {};
    return d.headline || d.title || d.heading || (d.items && d.items[0] && (d.items[0].label || d.items[0].name)) || '';
  }
  function renderOutline() {
    var list = $('st-outline'); list.textContent = '';
    demoSections().forEach(function (s) {
      var tx = sectionText(s.type);
      var item = el('button', { type: 'button', class: 'st-outline__item' + (s.hidden ? ' is-hidden' : ''), 'aria-current': String(state.selected === s.id), 'data-id': s.id }, [
        el('span', { class: 'st-outline__grip', 'aria-hidden': 'true' }, [icon('st-grip')]),
        el('span', { class: 'st-lib__icon' }, [icon('st-t-' + s.type)]),
        el('span', { class: 'st-lib__text' }, [el('strong', { text: tx.label }), el('small', { text: sectionSummary(s) })]),
        el('span', { class: 'st-lib__more', 'aria-hidden': 'true' }, [icon(s.hidden ? 'st-eye-off' : 'st-eye')]),
      ]);
      item.addEventListener('click', function () { select(s.id); });
      list.appendChild(el('li', {}, [item]));
    });
  }
  function setLeftTab(tab) {
    state.leftTab = tab;
    [['sections', 'st-tab-sections', 'st-pane-sections'], ['add', 'st-tab-add', 'st-pane-add']].forEach(function (x) {
      $(x[1]).setAttribute('aria-selected', String(x[0] === tab));
      $(x[2]).hidden = x[0] !== tab;
    });
  }

  // ── right: inspector (read-only, from describe()) ──
  function input(value, multiline) {
    return multiline ? el('textarea', { disabled: true, rows: '3', text: value }) : el('input', { type: 'text', disabled: true, value: value == null ? '' : String(value) });
  }
  function fieldNode(key, spec, value) {
    var label = el('span', { text: fieldLabel(key) });
    if (spec.t === 'image') {
      return el('label', { class: 'st-field' }, [label, el('div', { class: 'st-field__img' }, [
        el('div', { class: 'st-field__thumb', title: t('no_image') }, [icon('st-t-hero')]),
        el('button', { type: 'button', class: 'st-btn st-btn--ghost', disabled: true, text: t('change_image') }),
        el('button', { type: 'button', class: 'st-btn st-btn--ghost', disabled: true, text: t('remove') })])]);
    }
    if (spec.t === 'bool') return el('label', { class: 'st-field' }, [label, input(value ? t('yes') : t('no'))]);
    if (spec.t === 'enum') {
      var sel = el('select', { disabled: true });
      spec.values.forEach(function (v) { var o = el('option', { value: v, text: v }); if (v === value) o.selected = true; sel.appendChild(o); });
      return el('label', { class: 'st-field' }, [label, sel]);
    }
    if (spec.t === 'arr') return el('label', { class: 'st-field' }, [label, input(t('items').replace('{n}', (value || []).length))]);
    return el('label', { class: 'st-field' }, [label, input(value, spec.multiline)]);
  }
  function buttonGroup(key, spec, value) {
    // As in the mockup: text with a link icon, the colour beside it, the link below.
    var v = value || {};
    var nodes = [el('div', { class: 'st-group', text: fieldLabel(key) })];
    var row = el('div', { class: 'st-field__row' }, [input(v.text)]);
    if (spec.fields.color) row.appendChild(el('span', { class: 'st-swatch', style: 'background:' + (/^#[0-9a-f]{3,6}$/i.test(v.color || '') ? v.color : 'var(--st-accent)') }));
    nodes.push(el('label', { class: 'st-field' }, [el('span', { text: fieldLabel('text') }), row]));
    nodes.push(el('label', { class: 'st-field' }, [el('span', { text: fieldLabel('target') }), input(v.target)]));
    return nodes;
  }
  function renderInspector() {
    var box = $('st-fields'); box.textContent = '';
    document.querySelectorAll('[data-insp]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-insp') === state.insp)); });
    var s = demoSections().filter(function (x) { return x.id === state.selected; })[0];
    $('st-kind').textContent = s ? sectionText(s.type).label : '';
    if (!s) { box.appendChild(el('p', { class: 'st-empty', text: t('select_section') })); return; }
    var D = V3.describe();
    var normalized = V3.validateDesign(window.QRAIVY_STUDIO_DEMO.design).design.pages[0].sections.filter(function (x) { return x.id === s.id; })[0];
    if (state.insp === 'content') {
      var spec = D.sections[s.type].data;
      Object.keys(spec.fields).forEach(function (k) {
        var f = spec.fields[k], v = normalized.data[k];
        if (f.t === 'obj' && (k === 'primary' || k === 'secondary')) buttonGroup(k, f, v).forEach(function (n) { box.appendChild(n); });
        else if (f.t === 'obj') {
          box.appendChild(el('div', { class: 'st-group', text: fieldLabel(k) }));
          Object.keys(f.fields).forEach(function (kk) { box.appendChild(fieldNode(kk, f.fields[kk], v[kk])); });
        } else box.appendChild(fieldNode(k, f, v));
      });
    } else if (state.insp === 'style') {
      box.appendChild(fieldNode('variant', { t: 'enum', values: D.sections[s.type].variants }, normalized.variant));
      var st = D.section.style.fields;
      Object.keys(st).forEach(function (k) { box.appendChild(fieldNode(k, st[k], normalized.style[k])); });
    } else {
      box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: t('section_id') }), input(normalized.id)]));
      box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: t('anchor') }), input(normalized.anchor || normalized.id)]));
      box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: t('visibility') }), input(normalized.hidden ? t('no') : t('yes'))]));
    }
  }
  function select(id) { state.selected = id; renderOutline(); renderInspector(); }

  // ── center: device frames ──
  function makeFrame(device) {
    var f = FRAMES[device];
    var frame = el('div', { class: 'st-frame st-frame--' + device, 'data-device': device });
    var scale = el('div', { class: 'st-frame__scale' });
    if (device === 'desktop') scale.appendChild(el('div', { class: 'st-frame__chrome', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]));
    var iframe = el('iframe', { sandbox: '', title: t(device), referrerpolicy: 'no-referrer', width: String(f.w), height: String(f.h), loading: 'eager' });
    iframe.srcdoc = state.html;
    scale.appendChild(iframe);
    frame.appendChild(scale);
    return frame;
  }
  function dual() { return window.matchMedia && window.matchMedia('(min-width: 1920px)').matches && state.device === 'desktop'; }
  function phoneOnly() { return window.matchMedia && window.matchMedia('(max-width: 767px)').matches; }
  function renderCanvas() {
    var c = $('st-canvas'); c.textContent = '';
    var devices = phoneOnly() ? ['mobile'] : dual() ? ['desktop', 'mobile'] : [state.device];
    devices.forEach(function (d) { c.appendChild(makeFrame(d)); });
    document.querySelectorAll('[data-device]').forEach(function (b) { if (b.tagName === 'BUTTON') b.setAttribute('aria-checked', String(b.getAttribute('data-device') === state.device)); });
    fitFrames();
  }
  function fitFrames() {
    var c = $('st-canvas'); if (!c) return;
    var cs = window.getComputedStyle(c);
    var availW = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var availH = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var frames = c.querySelectorAll('.st-frame');
    var gap = 20;
    var outer = function (d) { var f = FRAMES[d]; return { w: f.w + 2 * (f.pad || 0) + (d === 'desktop' ? 2 : 0), h: f.h + 2 * (f.pad || 0) + (f.chrome || 0) + (d === 'desktop' ? 2 : 0) }; };
    var sizes = []; frames.forEach(function (fr) { sizes.push(outer(fr.getAttribute('data-device'))); });
    // Side by side (>= 1920 px): the phone as tall as the space allows, the
    // desktop frame takes the remaining width (as in the approved mockup).
    var phoneScale = null;
    if (frames.length === 2) phoneScale = Math.min(1, availH / sizes[1].h);
    frames.forEach(function (fr, i) {
      var d = fr.getAttribute('data-device'), o = sizes[i], s;
      if (frames.length === 2) {
        s = d === 'mobile' ? phoneScale : Math.min(1, (availW - gap - sizes[1].w * phoneScale) / o.w, availH / o.h);
      } else if (d === 'desktop' || phoneOnly()) s = Math.min(1, availW / o.w);
      else s = Math.min(1, availW / o.w, Math.max(availH, 480) / o.h);
      s = Math.max(0.1, s);
      var scaleBox = fr.firstChild, ifr = scaleBox.querySelector('iframe');
      // A single desktop frame fills the canvas height (taller page window,
      // same 1280 px layout width); every other frame keeps its device size.
      if (frames.length === 1 && d === 'desktop' && !phoneOnly()) {
        var ih = Math.max(FRAMES.desktop.h, Math.floor(availH / s) - FRAMES.desktop.chrome - 2);
        ifr.setAttribute('height', String(ih));
        o = { w: o.w, h: ih + FRAMES.desktop.chrome + 2 };
      } else ifr.setAttribute('height', String(FRAMES[d].h));
      // the box keeps its real (logical) size; only the transform shrinks it
      scaleBox.style.width = o.w + 'px';
      scaleBox.style.height = o.h + 'px';
      scaleBox.style.transform = 'scale(' + s + ')';
      fr.style.width = Math.floor(o.w * s) + 'px';
      fr.style.height = Math.floor(o.h * s) + 'px';
    });
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
    fitFrames();
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
    document.querySelectorAll('[data-insp]').forEach(function (b) { b.addEventListener('click', function () { state.insp = b.getAttribute('data-insp'); renderInspector(); }); });
    document.querySelectorAll('button[data-device]').forEach(function (b) { b.addEventListener('click', function () { state.device = b.getAttribute('data-device'); renderCanvas(); }); });
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
      fitFrames();
    });
    var more = $('st-more-btn'), menu = $('st-more-menu');
    more.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); } });
    $('st-preview-btn').addEventListener('click', function () { $('st-full-frame').srcdoc = state.html; $('st-full').hidden = false; $('st-full-close').focus(); });
    $('st-full-close').addEventListener('click', function () { $('st-full').hidden = true; $('st-preview-btn').focus(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('st-full').hidden) { $('st-full').hidden = true; return; }
      if (!menu.hidden) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); return; }
      closeDrawers();
    });
    var resizeTimer = null;
    var onResize = function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { renderCanvas(); if (window.innerWidth >= 1200) closeDrawers(); }, 80); };
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(function () { fitFrames(); }).observe($('st-canvas'));
  }

  function renderAll() {
    state.lang = lang();
    applyTexts();
    renderChips(); renderLibrary(); renderOutline(); renderInspector(); renderTemplates();
    localAccount();
  }

  function start() {
    bindTheme();
    state.lang = lang();
    if (ROUTING.blocked || !V3) {
      $('st-app').setAttribute('data-unavailable', '');
      $('st-unavailable').hidden = false;
      applyTexts();
      return;
    }
    var demo = window.QRAIVY_STUDIO_DEMO;
    var r = V3.renderDesign(demo.design, { businessName: demo.businessName }, { preview: true });
    state.html = r.ok ? r.html : '';
    renderAll();
    setLeftTab(state.leftTab);
    bindUi();
    applyPanels();
    renderCanvas();
    window.QraivyStudio = { state: state, fitFrames: fitFrames }; // for local inspection only
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
