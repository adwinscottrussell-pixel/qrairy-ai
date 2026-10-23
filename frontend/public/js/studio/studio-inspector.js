/*
 * studio-inspector.js — Landing Page Studio V3: the Content / Style /
 * Settings inspector.
 *
 * Editable: the Hero (2A-3A), the Buttons (2A-3B), Social Media (2A-3C),
 * Contact (2A-3D) and Opening Hours (2A-3E), listed in EDITABLE. Their
 * controls follow PLANS (HERO_PLAN, BUTTONS_PLAN, SOCIAL_PLAN, CONTACT_PLAN,
 * HOURS_PLAN), with every rule (limits, choices, required fields) read from
 * QraivyV3.describe(), so the inspector cannot drift from what the server
 * enforces. Edits go through the store (studio-store.js); errors come from
 * the shared validation and are shown under the field. The other section
 * types keep the read-only view of Phase 2A-2.
 *
 * In Node: module.exports (pure parts, for the tests). In the Studio:
 * window.QraivyStudioInspector.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyStudioInspector = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EDITABLE = ['hero', 'buttons', 'socialMedia', 'contact', 'openingHours'];

  // Where each Hero field is edited. The Hero renderer ignores
  // style.background and style.spacing, so they are not offered.
  var HERO_PLAN = [
    { tab: 'content', path: ['data', 'eyebrow'], control: 'text' },
    { tab: 'content', path: ['data', 'headline'], control: 'text' },
    { tab: 'content', path: ['data', 'subheadline'], control: 'text' },
    { tab: 'content', path: ['data', 'backgroundImage'], control: 'image' },
    { tab: 'content', path: ['data', 'imageAlt'], control: 'text' },
    { tab: 'content', group: 'primary' },
    { tab: 'content', path: ['data', 'primary', 'text'], control: 'text', color: ['data', 'primary', 'color'] },
    { tab: 'content', path: ['data', 'primary', 'color'], control: 'color' },
    { tab: 'content', path: ['data', 'primary', 'target'], control: 'link' },
    { tab: 'content', path: ['data', 'primary', 'icon'], control: 'select' },
    { tab: 'content', hint: 'primary' },
    { tab: 'content', group: 'secondary' },
    { tab: 'content', path: ['data', 'secondary', 'text'], control: 'text' },
    { tab: 'content', path: ['data', 'secondary', 'target'], control: 'link' },
    { tab: 'content', path: ['data', 'secondary', 'icon'], control: 'select' },
    { tab: 'content', hint: 'secondary' },
    { tab: 'style', path: ['variant'], control: 'select' },
    { tab: 'style', path: ['style', 'align'], control: 'select' },
    { tab: 'style', path: ['data', 'overlay'], control: 'number' },
    { tab: 'settings', path: ['anchor'], control: 'anchor' },
    { tab: 'settings', path: ['hidden'], control: 'show' },
    { tab: 'settings', path: ['id'], control: 'readonly' },
  ];

  // Buttons (2A-3B): every field the Buttons section has; the button list is
  // one 'items' control whose rows are edited with ITEM (one row open at a time).
  var BUTTONS_PLAN = [
    { tab: 'content', path: ['data', 'title'], control: 'text' },
    { tab: 'content', path: ['data', 'subtitle'], control: 'text' },
    { tab: 'content', path: ['data', 'items'], control: 'items', item: [
      { path: ['label'], control: 'text' },
      { path: ['subtitle'], control: 'text', hint: 'subtitle_layouts' },
      { path: ['kind'], control: 'select' },
      { path: ['target'], control: 'target', kindFrom: 'kind' },
      { path: ['icon'], control: 'select', noneLabel: 'i_default' },
    ] },
    { tab: 'style', path: ['variant'], control: 'select' },
    { tab: 'style', path: ['style', 'background'], control: 'select' },
    { tab: 'style', path: ['style', 'align'], control: 'select' },
    { tab: 'style', path: ['style', 'spacing'], control: 'select' },
    { tab: 'settings', path: ['anchor'], control: 'anchor' },
    { tab: 'settings', path: ['hidden'], control: 'show' },
    { tab: 'settings', path: ['id'], control: 'readonly' },
  ];

  // Social Media (2A-3C): the title and the link list (platform + address).
  var SOCIAL_PLAN = [
    { tab: 'content', path: ['data', 'title'], control: 'text' },
    { tab: 'content', path: ['data', 'links'], control: 'items', item: [
      { path: ['platform'], control: 'select' },
      { path: ['url'], control: 'social', platformFrom: 'platform' },
    ] },
    { tab: 'style', path: ['variant'], control: 'select' },
    { tab: 'style', path: ['style', 'background'], control: 'select' },
    { tab: 'style', path: ['style', 'align'], control: 'select' },
    { tab: 'style', path: ['style', 'spacing'], control: 'select' },
    { tab: 'settings', path: ['anchor'], control: 'anchor' },
    { tab: 'settings', path: ['hidden'], control: 'show' },
    { tab: 'settings', path: ['id'], control: 'readonly' },
  ];
  // Contact (2A-3D): every Contact field. Layout and alignment are not
  // offered: the renderer draws Card and Split alike, and alignment would
  // only move the title.
  var CONTACT_PLAN = [
    { tab: 'content', path: ['data', 'title'], control: 'text' },
    { tab: 'content', group: 'address' },
    { tab: 'content', path: ['data', 'address', 'line1'], control: 'text' },
    { tab: 'content', path: ['data', 'address', 'line2'], control: 'text' },
    { tab: 'content', path: ['data', 'address', 'postalCode'], control: 'text' },
    { tab: 'content', path: ['data', 'address', 'city'], control: 'text' },
    { tab: 'content', path: ['data', 'address', 'country'], control: 'text' },
    { tab: 'content', path: ['data', 'phone'], control: 'input' },
    { tab: 'content', path: ['data', 'email'], control: 'input' },
    { tab: 'content', group: 'directions' },
    { tab: 'content', path: ['data', 'mapsUrl'], control: 'input' },
    { tab: 'content', path: ['data', 'showMapLink'], control: 'switch' },
    { tab: 'style', path: ['style', 'background'], control: 'select' },
    { tab: 'style', path: ['style', 'spacing'], control: 'select' },
    { tab: 'settings', path: ['anchor'], control: 'anchor' },
    { tab: 'settings', path: ['hidden'], control: 'show' },
    { tab: 'settings', path: ['id'], control: 'readonly' },
  ];
  // Opening Hours (2A-3E): the seven weekdays as fixed rows (the page always
  // lists them Monday to Sunday, each once). Layout and alignment are not
  // offered: Table and Compact render alike, and alignment leaves the table
  // where it is.
  var HOURS_PLAN = [
    { tab: 'content', path: ['data', 'title'], control: 'text' },
    { tab: 'content', path: ['data', 'days'], control: 'hours' },
    { tab: 'content', path: ['data', 'note'], control: 'text' },
    { tab: 'style', path: ['style', 'background'], control: 'select' },
    { tab: 'style', path: ['style', 'spacing'], control: 'select' },
    { tab: 'settings', path: ['anchor'], control: 'anchor' },
    { tab: 'settings', path: ['hidden'], control: 'show' },
    { tab: 'settings', path: ['id'], control: 'readonly' },
  ];
  var PLANS = { hero: HERO_PLAN, buttons: BUTTONS_PLAN, socialMedia: SOCIAL_PLAN, contact: CONTACT_PLAN, openingHours: HOURS_PLAN };

  // A weekday's state in the design: 'open' (times), 'closed' (shown as
  // Closed) or 'hidden' (not in the list, so not on the page). As core.js
  // renders it, a listed day without times shows as Closed too.
  function dayState(entry) { return !entry ? 'hidden' : entry.closed || !(entry.ranges || []).length ? 'closed' : 'open'; }

  // An international number with "(0)" after the country code, e.g.
  // "+49 (0)731 …": the (0) is dialled too. Shown as a hint only; core.js
  // accepts the number unchanged.
  var PHONE_ZERO = /^\s*(?:\+|00)\s*[0-9]{1,4}[\s-]*\(\s*0\s*\)/;
  function phoneZeroWarning(v) { return PHONE_ZERO.test(String(v == null ? '' : v)); }

  // The hosts named in each platform's hint, and its placeholder. core.js
  // (SOCIAL_HOSTS) decides what is accepted; the tests check that every host
  // here is one of them. WhatsApp takes a phone number instead.
  var SOCIAL_HINT_HOSTS = {
    instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.com'], tiktok: ['tiktok.com'], youtube: ['youtube.com', 'youtu.be'],
    linkedin: ['linkedin.com'], x: ['x.com', 'twitter.com'], pinterest: ['pinterest.com', 'pinterest.de'],
  };
  var SOCIAL_PLACEHOLDER = {
    instagram: 'https://www.instagram.com/…', facebook: 'https://www.facebook.com/…', tiktok: 'https://www.tiktok.com/…', youtube: 'https://www.youtube.com/…',
    linkedin: 'https://www.linkedin.com/…', x: 'https://x.com/…', pinterest: 'https://www.pinterest.com/…',
  };

  // The spec of one path of a section type, from describe(). Numbers in the
  // path step into a list's item.
  function specFor(D, type, path) {
    if (path[0] === 'variant') return { t: 'enum', values: D.sections[type].variants.slice(), def: D.sections[type].variants[0] };
    if (path[0] === 'style') return D.section.style.fields[path[1]];
    if (path[0] === 'anchor') return D.section.anchor;
    if (path[0] === 'hidden') return D.section.hidden;
    if (path[0] === 'id') return D.section.id;
    var s = D.sections[type].data;
    for (var i = 1; i < path.length; i++) {
      if (!s) return undefined;
      if (typeof path[i] === 'number') { s = s.t === 'arr' ? s.item : undefined; continue; }
      s = s.fields && s.fields[path[i]];
    }
    return s;
  }
  function heroSpec(D, path) { return specFor(D, 'hero', path); }

  // The key validateDesign uses for a path inside a section:
  // ['data','items',2,'label'] -> 'data.items[2].label'.
  function errKey(path) {
    return path.reduce(function (k, p) { return typeof p === 'number' ? k + '[' + p + ']' : (k ? k + '.' : '') + p; }, '');
  }

  // WhatsApp (2A-3B): the owner types a phone number; the design stores the
  // https://wa.me/<digits> link core.js validates and renders. "+" and "00"
  // prefixes, spaces and punctuation are dropped.
  function whatsappLink(number) {
    var digits = String(number == null ? '' : number).replace(/[^0-9]/g, '');
    if (/^\s*00/.test(String(number))) digits = digits.replace(/^00/, '');
    return digits ? 'https://wa.me/' + digits : '';
  }
  // the input type for each non-Link button target
  var TARGET_INPUT = { website: 'url', whatsapp: 'tel', call: 'tel', email: 'email', directions: 'url' };
  function whatsappNumber(link) {
    var m = /^https:\/\/wa\.me\/([0-9]+)$/.exec(String(link || ''));
    return m ? '+' + m[1] : null;
  }

  // The length validateDesign measures (core.js cleanStr + len): line breaks
  // normalised, control and direction characters removed, single-line text
  // on one line, trimmed; characters, not UTF-16 units.
  var CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;
  function textLength(v, multiline) {
    var s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(CONTROL, '');
    if (!multiline) s = s.replace(/[\n\t]+/g, ' ');
    s = s.trim();
    var n = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0xdc00 || c > 0xdfff) n++; }
    return n;
  }

  var TX = {
    en: {
      variant: 'Layout', align: 'Alignment', overlay: 'Image darkening (%)',
      v_overlay: 'Overlay: image behind the text', v_split: 'Split: image beside the text', v_simple: 'Simple: text only',
      a_left: 'Left', a_center: 'Centered',
      no_link: 'No link', top_of_page: 'Top of the page', custom_link: 'Web address, email or phone…', hidden_suffix: ' (hidden)', link_placeholder: 'https://…, mailto:… or tel:…',
      color_default: 'Default', color_label: 'Button colour', change_soon: 'Image upload arrives in a later step.',
      hint_button: 'This button appears on the page once it has both a text and a link.',
      hint_overlay: 'Only for the Overlay layout with a background image.', hint_simple_image: 'The Simple layout shows no image.',
      hint_anchor: 'Used for links to this section. Empty: the section ID.',
      note_edit: 'Changes stay in this browser tab only. They are not saved.', note_later: 'Editing this section type arrives in a later step.',
      i_none: 'None', i_arrow: 'Arrow', i_tag: 'Tag', i_gift: 'Gift', i_cart: 'Cart', i_clock: 'Clock', i_pin: 'Location', i_phone: 'Phone', i_mail: 'Mail',
      i_globe: 'Globe', i_calendar: 'Calendar', i_star: 'Star', i_info: 'Info', i_chat: 'Chat', i_heart: 'Heart',
      e_required: 'Required.', e_too_long: 'Too long: at most {max} characters.',
      e_invalid_link: 'Choose a section of this page or enter a link starting with https://, mailto: or tel:.',
      e_unknown_internal_target: 'There is no such section on this page.', e_invalid_color: 'Use a colour like #ff5a1f.',
      e_out_of_range: 'Enter a whole number from {min} to {max}.',
      e_invalid_anchor: 'Use lowercase letters, numbers and hyphens (up to 40), starting with a letter or number.',
      e_reserved: '"start" and "top" are reserved.', e_duplicate: 'Another section already uses this name.', e_other: 'Not valid.',
      // Buttons (2A-3B)
      label: 'Label', kind: 'Action', background: 'Background', spacing: 'Spacing', buttons: 'Buttons',
      v_buttons: 'Buttons', v_cards: 'Cards', v_list: 'List',
      bg_default: 'Default', bg_alt: 'Alternate', bg_brand: 'Brand colour', bg_dark: 'Dark', sp_normal: 'Normal', sp_compact: 'Compact', sp_roomy: 'Roomy',
      k_link: 'Link', k_website: 'Website', k_whatsapp: 'WhatsApp', k_call: 'Call', k_email: 'Email', k_directions: 'Directions',
      t_link: 'Link', t_website: 'Web address', t_whatsapp: 'WhatsApp number', t_call: 'Phone number', t_email: 'Email address', t_directions: 'Map link',
      p_website: 'https://…', p_whatsapp: '+49 151 2345678', p_call: '+49 731 123456', p_email: 'name@example.com', p_directions: 'https://maps.app.goo.gl/…',
      hint_whatsapp: 'International format with country code, e.g. +49 151 2345678.', hint_directions: 'A link from {hosts}.',
      i_default: 'Default for this type', hint_subtitle_layouts: 'Subtitles appear in the Cards and List layouts.',
      choose_link: 'Choose a destination…', new_button: 'New button', add_button: 'Add button', max_buttons: 'Up to {max} buttons.', no_label: '(no label)',
      move_up: 'Move up', move_down: 'Move down', remove_button: 'Remove button', removed: 'Button removed. Undo is available.', moved: 'Button moved.',
      errors_one: '1 error', errors_many: '{n} errors',
      e_choose_target: 'Choose where this button leads.', e_invalid_url: 'Enter a web address starting with https://.',
      e_invalid_whatsapp: 'Enter the WhatsApp number in international format, e.g. +49 151 2345678.', e_invalid_phone: 'Enter a phone number, e.g. +49 731 123456.',
      e_invalid_email: 'Enter an email address, e.g. name@example.com.', e_invalid_maps_link: 'Use a link from Google Maps, Apple Maps or OpenStreetMap.',
      e_too_many: 'At most {max}.',
      // Social Media (2A-3C)
      platform: 'Platform', social_links: 'Social links', profile_address: 'Profile address', v_icons: 'Icons',
      pf_instagram: 'Instagram', pf_facebook: 'Facebook', pf_tiktok: 'TikTok', pf_youtube: 'YouTube', pf_linkedin: 'LinkedIn', pf_x: 'X', pf_pinterest: 'Pinterest', pf_whatsapp: 'WhatsApp',
      hint_social: 'A full address starting with https:// on {hosts}.', or: ' or ', no_address: '(no address)',
      add_link: 'Add link', max_links: 'Up to {max} links.', remove_link: 'Remove link', link_removed: 'Link removed. Undo is available.', link_moved: 'Link moved.',
      e_enter_address: 'Enter the profile address.', e_invalid_social_link: '{platform} addresses start with https:// on {hosts}.',
      // Contact (2A-3D)
      g_directions: 'Directions', f_line1: 'Street and number', f_line2: 'Address line 2', f_postalCode: 'Postal code', f_city: 'City', f_country: 'Country',
      f_phone: 'Phone', f_email: 'Email', f_mapsUrl: 'Map link', f_showMapLink: 'Show directions button',
      hint_phone: 'International format, e.g. +49 731 123456.', warn_phone_zero: 'Leave out the (0) after the country code: write +49 731 … instead of +49 (0)731 …, otherwise the 0 is dialled too.',
      hint_maps: 'Paste a share link from Google Maps, Apple Maps or OpenStreetMap (starting with https://).',
      hint_show_map: 'The button appears only when a valid map link is entered.',
      // Opening Hours (2A-3E)
      g_days: 'Days', d_mon: 'Monday', d_tue: 'Tuesday', d_wed: 'Wednesday', d_thu: 'Thursday', d_fri: 'Friday', d_sat: 'Saturday', d_sun: 'Sunday',
      ds_open: 'Open', ds_closed: 'Closed', ds_hidden: 'Not shown', day_state: 'Status for {day}', opens: 'Opens', closes: 'Closes',
      add_range: 'Add time range', remove_range: 'Remove time range', max_ranges: 'Up to {max} time ranges per day.',
      hint_hours: 'Times as HH:MM, e.g. 08:30. Closing must be after opening (24:00 = midnight). "Not shown" leaves the day out of the table.',
      e_enter_time: 'Enter a time.', e_invalid_time: 'Use a time like 08:30 (00:00 to 24:00).', e_closes_before_opening: 'The closing time must be after the opening time.',
      e_duplicate_day: 'This day is listed twice.',
    },
    de: {
      variant: 'Layout', align: 'Ausrichtung', overlay: 'Bild abdunkeln (%)',
      v_overlay: 'Overlay: Bild hinter dem Text', v_split: 'Geteilt: Bild neben dem Text', v_simple: 'Schlicht: nur Text',
      a_left: 'Links', a_center: 'Zentriert',
      no_link: 'Kein Link', top_of_page: 'Seitenanfang', custom_link: 'Webadresse, E-Mail oder Telefon…', hidden_suffix: ' (ausgeblendet)', link_placeholder: 'https://…, mailto:… oder tel:…',
      color_default: 'Standard', color_label: 'Button-Farbe', change_soon: 'Bilder hochladen folgt in einem späteren Schritt.',
      hint_button: 'Dieser Button erscheint auf der Seite, sobald er einen Text und einen Link hat.',
      hint_overlay: 'Nur beim Layout Overlay mit Hintergrundbild.', hint_simple_image: 'Das Layout Schlicht zeigt kein Bild.',
      hint_anchor: 'Für Links zu diesem Abschnitt. Leer: die Abschnitts-ID.',
      note_edit: 'Änderungen bleiben nur in diesem Browser-Tab. Sie werden nicht gespeichert.', note_later: 'Das Bearbeiten dieses Abschnittstyps folgt in einem späteren Schritt.',
      i_none: 'Keins', i_arrow: 'Pfeil', i_tag: 'Etikett', i_gift: 'Geschenk', i_cart: 'Warenkorb', i_clock: 'Uhr', i_pin: 'Standort', i_phone: 'Telefon', i_mail: 'E-Mail',
      i_globe: 'Globus', i_calendar: 'Kalender', i_star: 'Stern', i_info: 'Info', i_chat: 'Chat', i_heart: 'Herz',
      e_required: 'Pflichtfeld.', e_too_long: 'Zu lang: höchstens {max} Zeichen.',
      e_invalid_link: 'Wähle einen Abschnitt dieser Seite oder gib einen Link mit https://, mailto: oder tel: ein.',
      e_unknown_internal_target: 'Diesen Abschnitt gibt es auf der Seite nicht.', e_invalid_color: 'Nutze eine Farbe wie #ff5a1f.',
      e_out_of_range: 'Gib eine ganze Zahl von {min} bis {max} ein.',
      e_invalid_anchor: 'Kleinbuchstaben, Zahlen und Bindestriche (bis 40), am Anfang ein Buchstabe oder eine Zahl.',
      e_reserved: '„start“ und „top“ sind reserviert.', e_duplicate: 'Diesen Namen nutzt schon ein anderer Abschnitt.', e_other: 'Ungültig.',
      // Buttons (2A-3B)
      label: 'Beschriftung', kind: 'Aktion', background: 'Hintergrund', spacing: 'Abstand', buttons: 'Buttons',
      v_buttons: 'Buttons', v_cards: 'Karten', v_list: 'Liste',
      bg_default: 'Standard', bg_alt: 'Alternativ', bg_brand: 'Markenfarbe', bg_dark: 'Dunkel', sp_normal: 'Normal', sp_compact: 'Kompakt', sp_roomy: 'Großzügig',
      k_link: 'Link', k_website: 'Website', k_whatsapp: 'WhatsApp', k_call: 'Anruf', k_email: 'E-Mail', k_directions: 'Route',
      t_link: 'Link', t_website: 'Webadresse', t_whatsapp: 'WhatsApp-Nummer', t_call: 'Telefonnummer', t_email: 'E-Mail-Adresse', t_directions: 'Karten-Link',
      p_website: 'https://…', p_whatsapp: '+49 151 2345678', p_call: '+49 731 123456', p_email: 'name@beispiel.de', p_directions: 'https://maps.app.goo.gl/…',
      hint_whatsapp: 'Internationales Format mit Ländervorwahl, z. B. +49 151 2345678.', hint_directions: 'Ein Link von {hosts}.',
      i_default: 'Standard für diesen Typ', hint_subtitle_layouts: 'Untertitel erscheinen in den Layouts Karten und Liste.',
      choose_link: 'Ziel wählen…', new_button: 'Neuer Button', add_button: 'Button hinzufügen', max_buttons: 'Bis zu {max} Buttons.', no_label: '(ohne Beschriftung)',
      move_up: 'Nach oben', move_down: 'Nach unten', remove_button: 'Button entfernen', removed: 'Button entfernt. Rückgängig ist möglich.', moved: 'Button verschoben.',
      errors_one: '1 Fehler', errors_many: '{n} Fehler',
      e_choose_target: 'Wähle, wohin dieser Button führt.', e_invalid_url: 'Gib eine Webadresse mit https:// ein.',
      e_invalid_whatsapp: 'Gib die WhatsApp-Nummer im internationalen Format ein, z. B. +49 151 2345678.', e_invalid_phone: 'Gib eine Telefonnummer ein, z. B. +49 731 123456.',
      e_invalid_email: 'Gib eine E-Mail-Adresse ein, z. B. name@beispiel.de.', e_invalid_maps_link: 'Nutze einen Link von Google Maps, Apple Maps oder OpenStreetMap.',
      e_too_many: 'Höchstens {max}.',
      // Social Media (2A-3C)
      platform: 'Plattform', social_links: 'Social-Links', profile_address: 'Profiladresse', v_icons: 'Symbole',
      pf_instagram: 'Instagram', pf_facebook: 'Facebook', pf_tiktok: 'TikTok', pf_youtube: 'YouTube', pf_linkedin: 'LinkedIn', pf_x: 'X', pf_pinterest: 'Pinterest', pf_whatsapp: 'WhatsApp',
      hint_social: 'Eine vollständige Adresse mit https:// auf {hosts}.', or: ' oder ', no_address: '(keine Adresse)',
      add_link: 'Link hinzufügen', max_links: 'Bis zu {max} Links.', remove_link: 'Link entfernen', link_removed: 'Link entfernt. Rückgängig ist möglich.', link_moved: 'Link verschoben.',
      e_enter_address: 'Gib die Profiladresse ein.', e_invalid_social_link: '{platform}-Adressen beginnen mit https:// auf {hosts}.',
      // Contact (2A-3D)
      g_directions: 'Route', f_line1: 'Straße und Hausnummer', f_line2: 'Adresszusatz', f_postalCode: 'Postleitzahl', f_city: 'Ort', f_country: 'Land',
      f_phone: 'Telefon', f_email: 'E-Mail', f_mapsUrl: 'Karten-Link', f_showMapLink: 'Routen-Button anzeigen',
      hint_phone: 'Internationales Format, z. B. +49 731 123456.', warn_phone_zero: 'Lass die (0) nach der Ländervorwahl weg: +49 731 … statt +49 (0)731 …, sonst wird die 0 mitgewählt.',
      hint_maps: 'Füge einen Teilen-Link aus Google Maps, Apple Maps oder OpenStreetMap ein (beginnt mit https://).',
      hint_show_map: 'Der Button erscheint nur, wenn ein gültiger Karten-Link eingetragen ist.',
      // Opening Hours (2A-3E)
      g_days: 'Tage', d_mon: 'Montag', d_tue: 'Dienstag', d_wed: 'Mittwoch', d_thu: 'Donnerstag', d_fri: 'Freitag', d_sat: 'Samstag', d_sun: 'Sonntag',
      ds_open: 'Geöffnet', ds_closed: 'Geschlossen', ds_hidden: 'Nicht anzeigen', day_state: 'Status für {day}', opens: 'Öffnet', closes: 'Schließt',
      add_range: 'Zeitraum hinzufügen', remove_range: 'Zeitraum entfernen', max_ranges: 'Bis zu {max} Zeiträume pro Tag.',
      hint_hours: 'Zeiten als HH:MM, z. B. 08:30. Schließen muss nach dem Öffnen liegen (24:00 = Mitternacht). „Nicht anzeigen“ lässt den Tag in der Tabelle weg.',
      e_enter_time: 'Gib eine Uhrzeit ein.', e_invalid_time: 'Nutze eine Uhrzeit wie 08:30 (00:00 bis 24:00).', e_closes_before_opening: 'Die Schließzeit muss nach der Öffnungszeit liegen.',
      e_duplicate_day: 'Dieser Tag ist doppelt eingetragen.',
    },
  };
  // field: the last path key; a missing button target or social address gets
  // its own message. e.platform / e.hosts: filled in by the social control.
  function errorText(lang, e, field) {
    var d = TX[lang] || TX.en;
    var code = e.code === 'required' && field === 'target' ? 'choose_target' : e.code === 'required' && field === 'social' ? 'enter_address'
      : e.code === 'required' && field === 'time' ? 'enter_time' : e.code === 'duplicate' && field === 'day' ? 'duplicate_day' : e.code;
    var s = d['e_' + code] || d.e_other;
    return s.replace('{max}', e.max).replace('{min}', e.min).replace('{platform}', e.platform).replace('{hosts}', e.hosts);
  }
  // a platform's hint hosts, joined for reading: "facebook.com or fb.com"
  function socialHosts(lang, platform) {
    var d = TX[lang] || TX.en, h = SOCIAL_HINT_HOSTS[platform] || [];
    return h.length > 1 ? h.slice(0, -1).join(', ') + d.or + h[h.length - 1] : h.join('');
  }

  // The repeatable lists (Buttons 2A-3B, Social Media 2A-3C), by section
  // type: their texts, a new item, and what a closed row shows.
  function hostOf(url) {
    var m = /^https?:\/\/([^\/?#\s]+)/i.exec(String(url || '').trim());
    return m ? m[1].toLowerCase() : String(url || '').trim();
  }
  var LISTS = {
    buttons: {
      heading: 'buttons', add: 'add_button', max: 'max_buttons', remove: 'remove_button', removed: 'removed', moved: 'moved',
      // intentionally incomplete: the owner chooses where it leads
      newItem: function (tx) { return { label: tx('new_button'), kind: 'link', target: '' }; },
      focus: 'label', select: true,
      name: function (item, tx) { return textLength(item.label, false) ? item.label : tx('no_label'); },
      tag: function (item, tx) { return tx('k_' + (item.kind || 'link')); },
    },
    socialMedia: {
      heading: 'social_links', add: 'add_link', max: 'max_links', remove: 'remove_link', removed: 'link_removed', moved: 'link_moved',
      // intentionally incomplete: the owner enters the profile address
      newItem: function () { return { platform: 'instagram', url: '' }; },
      focus: 'url', select: false,
      name: function (item, tx) { return (item.platform && tx('pf_' + item.platform)) || String(item.platform || ''); },
      tag: function (item, tx) {
        if (!item.url || !String(item.url).trim()) return tx('no_address');
        var shown = (item.platform === 'whatsapp' && whatsappNumber(item.url)) || hostOf(item.url);
        return shown.length > 40 ? shown.slice(0, 39) + '…' : shown;
      },
    },
  };

  function getPath(o, path) { var n = o; for (var i = 0; i < path.length; i++) { if (n == null) return undefined; n = n[path[i]]; } return n; }

  // createInspector({ box, note, kind, store, V3, lang(), tab(), t(k), fieldLabel(k), el, icon, sectionLabel(type), announce(msg), brand })
  function createInspector(o) {
    var store = o.store, el = o.el;
    var refreshers = [];
    var uid = 0;
    function tx(k) { var d = TX[o.lang()] || TX.en; return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : TX.en[k]; }
    function nextId(p) { uid += 1; return 'st-f-' + p + '-' + uid; }

    // ── read-only view (Phase 2A-2), for the section types not yet editable ──
    function roInput(value, multiline) {
      return multiline ? el('textarea', { disabled: true, rows: '3', text: value }) : el('input', { type: 'text', disabled: true, value: value == null ? '' : String(value) });
    }
    function roField(key, spec, value) {
      var label = el('span', { text: o.fieldLabel(key) });
      if (spec.t === 'image') {
        return el('label', { class: 'st-field' }, [label, el('div', { class: 'st-field__img' }, [
          el('div', { class: 'st-field__thumb', title: o.t('no_image') }, [o.icon('st-t-hero')]),
          el('button', { type: 'button', class: 'st-btn st-btn--ghost', disabled: true, text: o.t('change_image') }),
          el('button', { type: 'button', class: 'st-btn st-btn--ghost', disabled: true, text: o.t('remove') })])]);
      }
      if (spec.t === 'bool') return el('label', { class: 'st-field' }, [label, roInput(value ? o.t('yes') : o.t('no'))]);
      if (spec.t === 'enum') {
        var sel = el('select', { disabled: true });
        spec.values.forEach(function (v) { var op = el('option', { value: v, text: v }); if (v === value) op.selected = true; sel.appendChild(op); });
        return el('label', { class: 'st-field' }, [label, sel]);
      }
      if (spec.t === 'arr') return el('label', { class: 'st-field' }, [label, roInput(o.t('items').replace('{n}', (value || []).length))]);
      return el('label', { class: 'st-field' }, [label, roInput(value, spec.multiline)]);
    }
    function renderReadOnly(box, s, D) {
      if (o.tab() === 'content') {
        var spec = D.sections[s.type].data;
        Object.keys(spec.fields).forEach(function (k) {
          var f = spec.fields[k], v = s.data[k];
          if (f.t === 'obj') {
            box.appendChild(el('div', { class: 'st-group', text: o.fieldLabel(k) }));
            Object.keys(f.fields).forEach(function (kk) { box.appendChild(roField(kk, f.fields[kk], v[kk])); });
          } else box.appendChild(roField(k, f, v));
        });
      } else if (o.tab() === 'style') {
        box.appendChild(roField('variant', { t: 'enum', values: D.sections[s.type].variants }, s.variant));
        var st = D.section.style.fields;
        Object.keys(st).forEach(function (k) { box.appendChild(roField(k, st[k], s.style[k])); });
      } else {
        box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: o.t('section_id') }), roInput(s.id)]));
        box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: o.t('anchor') }), roInput(s.anchor || s.id)]));
        box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: o.t('visibility') }), roInput(s.hidden ? o.t('no') : o.t('yes'))]));
      }
    }

    // ── editors (Hero, Buttons) and Social Media: shared controls, driven by PLANS ──
    function labelFor(path) {
      var k = path[path.length - 1];
      if (k === 'variant' || k === 'align' || k === 'overlay' || k === 'background' || k === 'spacing' || k === 'kind' || k === 'label' || k === 'platform') return tx(k);
      if (k === 'anchor') return o.t('anchor');
      if (k === 'hidden') return o.t('visibility');
      if (k === 'id') return o.t('section_id');
      // the Contact fields have their own labels (2A-3D)
      if (Object.prototype.hasOwnProperty.call(TX.en, 'f_' + k)) return tx('f_' + k);
      return o.fieldLabel(k);
    }
    // the field's error line; every control registers how it refreshes
    function errorLine(id) { return el('p', { class: 'st-err', id: id, role: 'status', hidden: true }); }
    function showError(input, line, err, field) {
      line.hidden = !err;
      line.textContent = err ? errorText(o.lang(), err, field) : '';
      if (err) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    function focused(n) { return n.ownerDocument.activeElement === n; }
    function heroValue(sec, path, spec) { var v = getPath(sec, path); return v === undefined && spec && spec.def !== undefined ? spec.def : v; }

    function textControl(sec, c, spec) {
      var multiline = !!spec.multiline, key = errKey(c.path);
      var id = nextId('text'), errId = id + '-err';
      var inp = multiline ? el('textarea', { id: id, rows: '3', 'aria-describedby': errId }) : el('input', { type: 'text', id: id, 'aria-describedby': errId, autocomplete: 'off' });
      inp.value = heroValue(sec, c.path) || '';
      if (spec.required) inp.setAttribute('aria-required', 'true');
      var count = el('small', { class: 'st-count', 'aria-hidden': 'true' });
      var line = errorLine(errId);
      inp.addEventListener('input', function () { store.set(sec.id, c.path, inp.value, 'typing'); });
      inp.addEventListener('blur', function () { store.endMerge(); });
      var control = inp;
      if (c.color) control = el('div', { class: 'st-field__row' }, [inp, colorControl(sec, c.color)]);
      var node = el('div', { class: 'st-field', 'data-path': key }, [
        el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) }), count]), control, line]);
      // a Buttons item subtitle: shown on the page only in Cards and List
      var hint = c.hint ? el('p', { class: 'st-hint', 'data-hint': c.hint, text: tx('hint_' + c.hint) }) : null;
      if (hint) node.appendChild(hint);
      refreshers.push(function (cur, errs) {
        var v = getPath(cur, c.path) || '';
        if (!focused(inp) && inp.value !== v) inp.value = v;
        var n = textLength(inp.value, multiline);
        count.textContent = n + ' / ' + spec.max;
        count.classList.toggle('is-over', n > spec.max);
        showError(inp, line, errs[key]);
        if (hint) hint.hidden = heroValue(cur, ['variant'], specFor(o.V3.describe(), cur.type, ['variant'])) !== 'buttons';
      });
      return node;
    }

    function colorControl(sec, path) {
      var key = errKey(path);
      var wrap = el('span', { class: 'st-color', 'data-path': key });
      var inp = el('input', { type: 'color', class: 'st-swatch st-swatch--input', 'aria-label': tx('color_label'), title: tx('color_label') });
      var reset = el('button', { type: 'button', class: 'st-linkbtn', text: tx('color_default') });
      inp.addEventListener('input', function () { store.set(sec.id, path, inp.value.toLowerCase(), 'color'); });
      inp.addEventListener('change', function () { store.endMerge(); });
      reset.addEventListener('click', function () { store.set(sec.id, path, undefined); inp.focus(); });
      wrap.appendChild(inp); wrap.appendChild(reset);
      refreshers.push(function (cur) {
        var v = getPath(cur, path);
        var shown = v || o.brand;
        if (!focused(inp) && inp.value.toLowerCase() !== shown) inp.value = shown;
        reset.hidden = !v;
      });
      return wrap;
    }

    function imageControl(sec, c) {
      var key = errKey(c.path);
      var thumb = el('div', { class: 'st-field__thumb' });
      var change = el('button', { type: 'button', class: 'st-btn st-btn--ghost', disabled: true, title: tx('change_soon'), text: o.t('change_image') });
      var remove = el('button', { type: 'button', class: 'st-btn st-btn--ghost', 'data-action': 'remove-image', text: o.t('remove') });
      var hint = el('p', { class: 'st-hint', hidden: true, text: tx('hint_simple_image') });
      remove.addEventListener('click', function () { store.set(sec.id, c.path, undefined); });
      refreshers.push(function (cur) {
        var v = getPath(cur, c.path) || '';
        var img = thumb.querySelector('img');
        if (v && (!img || img.getAttribute('src') !== v)) {
          thumb.textContent = '';
          thumb.appendChild(el('img', { src: v, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' }));
          thumb.classList.add('has-img');
        } else if (!v && (img || !thumb.firstChild)) {
          thumb.textContent = '';
          thumb.appendChild(o.icon('st-t-hero'));
          thumb.classList.remove('has-img');
          thumb.title = o.t('no_image');
        }
        remove.disabled = !v;
        hint.hidden = !(v && heroValue(cur, ['variant'], heroSpec(o.V3.describe(), ['variant'])) === 'simple');
      });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { text: labelFor(c.path) }), el('div', { class: 'st-field__img' }, [thumb, change, remove]), hint]);
    }

    function linkControl(sec, c) {
      var key = errKey(c.path);
      var id = nextId('link'), errId = id + '-err', customId = id + '-custom';
      var sel = el('select', { id: id, 'aria-describedby': errId });
      var custom = el('input', { type: 'text', id: customId, class: 'st-field__sub', placeholder: tx('link_placeholder'), 'aria-label': o.fieldLabel('target'), 'aria-describedby': errId, autocomplete: 'off', inputmode: 'url', hidden: true });
      var line = errorLine(errId);
      var signature = '';
      var mode = ''; // 'custom' once the person chose to type an address
      function targets() {
        return store.linkTargets().map(function (x) {
          if (x.target === '/') return { value: '/', label: tx('top_of_page') };
          var s = store.section(x.id);
          return { value: x.target, label: '#' + x.target.slice(1) + ' · ' + o.sectionLabel(x.type) + (s && s.hidden ? tx('hidden_suffix') : '') };
        });
      }
      function build() {
        var list = targets();
        var sig = JSON.stringify(list) + o.lang();
        if (sig === signature) return list;
        signature = sig;
        sel.textContent = '';
        // a required link (a Buttons target) asks for a choice instead of offering "No link"
        sel.appendChild(el('option', { value: '', text: tx(c.required ? 'choose_link' : 'no_link') }));
        list.forEach(function (x) { sel.appendChild(el('option', { value: x.value, text: x.label })); });
        sel.appendChild(el('option', { value: '__custom', text: tx('custom_link') }));
        return list;
      }
      function sync(v) {
        var list = build();
        var known = mode !== 'custom' && (v === '' || list.some(function (x) { return x.value === v; }));
        if (!focused(sel) && !focused(custom)) {
          sel.value = known ? v : '__custom';
          custom.hidden = known;
          if (!known && custom.value !== v) custom.value = v;
        }
      }
      sel.addEventListener('change', function () {
        if (sel.value === '__custom') {
          mode = 'custom';
          custom.hidden = false;
          var cur = getPath(store.section(sec.id), c.path) || '';
          custom.value = /^\//.test(cur) ? '' : cur;
          custom.focus();
          store.set(sec.id, c.path, custom.value || undefined);
        } else {
          mode = '';
          custom.hidden = true;
          store.set(sec.id, c.path, sel.value || undefined);
        }
      });
      custom.addEventListener('input', function () { store.set(sec.id, c.path, custom.value || undefined, 'typing'); });
      custom.addEventListener('blur', function () { store.endMerge(); });
      refreshers.push(function (cur, errs) { sync(getPath(cur, c.path) || ''); showError(custom.hidden ? sel : custom, line, errs[key], 'target'); });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) })]), sel, custom, line]);
    }

    // A Buttons target: the control follows the button's action type. Link
    // uses the Hero link control; WhatsApp takes a phone number (stored as the
    // wa.me link core.js expects); the others are plain fields. A type change
    // keeps the value; core.js validation reports when it no longer fits.
    function targetControl(sec, c, spec) {
      // as core.js: an unknown or missing type is checked as a Link
      var kind = getPath(sec, c.path.slice(0, -1).concat(c.kindFrom));
      if (o.V3.describe().choices.linkKinds.indexOf(kind) === -1) kind = 'link';
      if (kind === 'link') return linkControl(sec, { path: c.path, required: true });
      var key = errKey(c.path);
      var id = nextId('target'), errId = id + '-err', hintId = id + '-hint';
      var inp = el('input', { type: TARGET_INPUT[kind], id: id, 'aria-describedby': errId + ' ' + hintId, 'aria-required': 'true', autocomplete: 'off', spellcheck: 'false', placeholder: tx('p_' + kind) });
      var shown = function (v) { return kind === 'whatsapp' ? (whatsappNumber(v) || v || '') : (v || ''); };
      inp.value = shown(getPath(sec, c.path));
      var line = errorLine(errId);
      var hintText = kind === 'whatsapp' ? tx('hint_whatsapp') : kind === 'directions' ? tx('hint_directions').replace('{hosts}', o.V3.describe().choices.mapHosts.join(', ')) : '';
      var hint = el('p', { class: 'st-hint', id: hintId, hidden: !hintText, text: hintText });
      inp.addEventListener('input', function () {
        var v = kind === 'whatsapp' ? whatsappLink(inp.value) : inp.value;
        store.set(sec.id, c.path, v || undefined, 'typing');
      });
      inp.addEventListener('blur', function () { store.endMerge(); });
      refreshers.push(function (cur, errs) {
        var v = shown(getPath(cur, c.path));
        if (!focused(inp) && inp.value !== v) inp.value = v;
        showError(inp, line, errs[key], 'target');
      });
      return el('div', { class: 'st-field', 'data-path': key, 'data-kind': kind }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: tx('t_' + kind) })]), inp, line, hint]);
    }

    // A social profile address: a full https:// address for the platform, or
    // for WhatsApp a phone number (stored as the wa.me link, as in the Buttons).
    // A platform change keeps the value; core.js reports when it no longer fits.
    function socialControl(sec, c) {
      var platform = getPath(sec, c.path.slice(0, -1).concat(c.platformFrom));
      var wa = platform === 'whatsapp';
      var key = errKey(c.path);
      var id = nextId('social'), errId = id + '-err', hintId = id + '-hint';
      var inp = el('input', { type: wa ? 'tel' : 'url', id: id, 'aria-describedby': errId + ' ' + hintId, 'aria-required': 'true', autocomplete: 'off', spellcheck: 'false',
        placeholder: wa ? tx('p_whatsapp') : SOCIAL_PLACEHOLDER[platform] || 'https://…' });
      var shown = function (v) { return wa ? (whatsappNumber(v) || v || '') : (v || ''); };
      inp.value = shown(getPath(sec, c.path));
      var line = errorLine(errId);
      var hintText = wa ? tx('hint_whatsapp') : SOCIAL_HINT_HOSTS[platform] ? tx('hint_social').replace('{hosts}', socialHosts(o.lang(), platform)) : '';
      var hint = el('p', { class: 'st-hint', id: hintId, hidden: !hintText, text: hintText });
      inp.addEventListener('input', function () {
        var v = wa ? whatsappLink(inp.value) : inp.value;
        store.set(sec.id, c.path, v || undefined, 'typing');
      });
      inp.addEventListener('blur', function () { store.endMerge(); });
      refreshers.push(function (cur, errs) {
        var v = shown(getPath(cur, c.path));
        if (!focused(inp) && inp.value !== v) inp.value = v;
        var err = errs[key];
        if (err && wa) err = { code: 'invalid_whatsapp' };
        else if (err) err = Object.assign({}, err, { platform: tx('pf_' + platform), hosts: socialHosts(o.lang(), platform) });
        showError(inp, line, err, 'social');
      });
      return el('div', { class: 'st-field', 'data-path': key, 'data-platform': platform || '' }, [
        el('span', { class: 'st-field__label' }, [el('label', { for: id, text: tx(wa ? 't_whatsapp' : 'profile_address') })]), inp, line, hint]);
    }

    // A Contact phone, email or map link (2A-3D): one fixed-type field, stored
    // as typed; core.js validates it. The phone warns about "(0)".
    var INPUT = { phone: { type: 'tel', placeholder: 'p_call', hint: 'hint_phone' }, email: { type: 'email', placeholder: 'p_email' }, link: { type: 'url', placeholder: 'p_directions', hint: 'hint_maps' } };
    function inputControl(sec, c, spec) {
      var key = errKey(c.path), kind = INPUT[spec.t];
      var id = nextId('input'), errId = id + '-err', hintId = id + '-hint', warnId = id + '-warn';
      var inp = el('input', { type: kind.type, id: id, 'aria-describedby': errId + ' ' + warnId + ' ' + hintId, autocomplete: 'off', spellcheck: 'false', placeholder: tx(kind.placeholder) });
      inp.value = getPath(sec, c.path) || '';
      var line = errorLine(errId);
      var warn = spec.t === 'phone' ? el('p', { class: 'st-warn', id: warnId, role: 'status', 'data-warn': 'phone_zero', hidden: true, text: tx('warn_phone_zero') }) : null;
      var hint = kind.hint ? el('p', { class: 'st-hint', id: hintId, text: tx(kind.hint) }) : null;
      inp.addEventListener('input', function () { store.set(sec.id, c.path, inp.value || undefined, 'typing'); });
      inp.addEventListener('blur', function () { store.endMerge(); });
      refreshers.push(function (cur, errs) {
        var v = getPath(cur, c.path) || '';
        if (!focused(inp) && inp.value !== v) inp.value = v;
        showError(inp, line, errs[key]);
        if (warn) warn.hidden = !!errs[key] || !phoneZeroWarning(inp.value);
      });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) })]), inp, line, warn, hint].filter(Boolean));
    }

    // A yes / no field of the section data (Contact: Show directions button).
    function switchControl(sec, c, spec) {
      var key = errKey(c.path);
      var id = nextId('switch'), hintId = id + '-hint';
      var box = el('input', { type: 'checkbox', id: id, role: 'switch', class: 'st-switch', 'aria-describedby': hintId });
      box.addEventListener('change', function () { store.set(sec.id, c.path, box.checked); });
      refreshers.push(function (cur) { var v = heroValue(cur, c.path, spec) !== false; box.checked = v; box.setAttribute('aria-checked', String(v)); });
      return el('div', { class: 'st-field', 'data-path': key }, [el('div', { class: 'st-field st-field--inline' }, [el('label', { for: id, text: labelFor(c.path) }), box]),
        el('p', { class: 'st-hint', id: hintId, text: tx('hint_show_map') })]);
    }

    function selectControl(sec, c, spec) {
      var key = errKey(c.path);
      var id = nextId('sel');
      var sel = el('select', { id: id });
      var k = c.path[c.path.length - 1];
      var PREFIX = { variant: 'v_', align: 'a_', icon: 'i_', background: 'bg_', spacing: 'sp_', kind: 'k_', platform: 'pf_' };
      spec.values.forEach(function (v) {
        var label = k === 'icon' && v === 'none' && c.noneLabel ? tx(c.noneLabel) : PREFIX[k] ? tx(PREFIX[k] + v) : v;
        sel.appendChild(el('option', { value: v, text: label }));
      });
      sel.addEventListener('change', function () {
        store.set(sec.id, c.path, sel.value);
        // a new action type (or platform) needs a different target (address) control
        if (k === 'kind' || k === 'platform') { render(); var again = o.box.querySelector('[data-path="' + key + '"] select'); if (again) again.focus(); }
      });
      refreshers.push(function (cur) { var v = heroValue(cur, c.path, spec); if (!focused(sel) && sel.value !== v) sel.value = v; });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) })]), sel]);
    }

    function numberControl(sec, c, spec) {
      var key = errKey(c.path);
      var id = nextId('num'), errId = id + '-err', hintId = id + '-hint';
      var inp = el('input', { type: 'number', id: id, min: String(spec.min), max: String(spec.max), step: '1', inputmode: 'numeric', 'aria-describedby': errId + ' ' + hintId });
      var line = errorLine(errId);
      var hint = el('p', { class: 'st-hint', id: hintId, text: tx('hint_overlay') });
      inp.addEventListener('input', function () {
        var raw = inp.value.trim();
        store.set(sec.id, c.path, raw === '' ? '' : Number(raw), 'typing');
      });
      inp.addEventListener('blur', function () { store.endMerge(); });
      refreshers.push(function (cur, errs) {
        var v = heroValue(cur, c.path, spec);
        if (!focused(inp) && String(inp.value) !== String(v)) inp.value = v;
        var D = o.V3.describe();
        inp.disabled = !(heroValue(cur, ['variant'], heroSpec(D, ['variant'])) === 'overlay' && getPath(cur, ['data', 'backgroundImage']));
        hint.hidden = !inp.disabled;
        showError(inp, line, errs[key]);
      });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) })]), inp, line, hint]);
    }

    function anchorControl(sec) {
      var id = nextId('anchor'), errId = id + '-err', hintId = id + '-hint';
      var inp = el('input', { type: 'text', id: id, 'aria-describedby': errId + ' ' + hintId, autocomplete: 'off', spellcheck: 'false', placeholder: sec.id });
      inp.value = sec.anchor || '';
      var line = errorLine(errId);
      // Checked while typing; applied (with the links that follow it) when
      // the field is left or Enter is pressed, and only if the name is usable.
      var check = function () { var code = store.checkAnchor(sec.id, inp.value); showError(inp, line, code ? { code: code } : null); return !code; };
      inp.addEventListener('input', check);
      inp.addEventListener('change', function () { if (check()) store.setAnchor(sec.id, inp.value); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (check()) store.setAnchor(sec.id, inp.value); } });
      refreshers.push(function (cur) {
        if (!focused(inp) && inp.value !== (cur.anchor || '')) { inp.value = cur.anchor || ''; check(); }
      });
      return el('div', { class: 'st-field', 'data-path': 'anchor' }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(['anchor']) })]), inp, line,
        el('p', { class: 'st-hint', id: hintId, text: tx('hint_anchor') })]);
    }

    function showControl(sec) {
      var id = nextId('show');
      var box = el('input', { type: 'checkbox', id: id, role: 'switch', class: 'st-switch' });
      box.addEventListener('change', function () { store.setHidden(sec.id, !box.checked); });
      refreshers.push(function (cur) { box.checked = !cur.hidden; box.setAttribute('aria-checked', String(!cur.hidden)); });
      return el('div', { class: 'st-field st-field--inline', 'data-path': 'hidden' }, [el('label', { for: id, text: labelFor(['hidden']) }), box]);
    }

    function readonlyControl(sec) {
      var id = nextId('id');
      return el('div', { class: 'st-field', 'data-path': 'id' }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(['id']) })]),
        el('input', { type: 'text', id: id, readonly: true, value: sec.id, class: 'st-readonly' })]);
    }

    function buttonHint(sec, which) {
      var hint = el('p', { class: 'st-hint', 'data-hint': which, text: tx('hint_button') });
      refreshers.push(function (cur) {
        var b = getPath(cur, ['data', which]) || {};
        hint.hidden = !!(textLength(b.text, false) && typeof b.target === 'string' && b.target.trim());
      });
      return hint;
    }

    // ── a list of items (the Buttons, the social links): one row open at a time ──
    var openRows = {}; // section id + list key -> the open row's index (-1: none)
    function itemsControl(sec, c, D) {
      var key = errKey(c.path), spec = specFor(D, sec.type, c.path), max = spec.max, cfg = LISTS[sec.type];
      var stateKey = sec.id + ':' + key;
      var list = getPath(sec, c.path) || [];
      var open = openRows[stateKey] === undefined ? -1 : openRows[stateKey];
      if (open >= list.length) open = openRows[stateKey] = -1;
      var count = el('span', { class: 'st-items__count' });
      var ol = el('ol', { class: 'st-items__list' });
      var add = el('button', { type: 'button', class: 'st-btn st-btn--ghost st-items__add', 'data-action': 'add-item' }, [tx(cfg.add)]);
      var full = el('p', { class: 'st-hint', 'data-hint': 'max', text: tx(cfg.max).replace('{max}', max) });
      var row = function (i) { return o.box.querySelector('[data-path="' + key + '"] .st-item[data-index="' + i + '"] .st-item__toggle'); };
      // the open row follows the change; the store event rebuilds the inspector
      var move = function (from, to) {
        var before = open;
        openRows[stateKey] = open === from ? to : open === to ? from : open;
        if (!store.moveItem(sec.id, c.path, from, to)) { openRows[stateKey] = before; return; }
        if (o.announce) o.announce(tx(cfg.moved));
        var r = row(to); if (r) r.focus();
      };
      list.forEach(function (it, i) {
        var isOpen = open === i, bodyId = nextId('item');
        var name = el('span', { class: 'st-item__name' });
        var kind = el('small', { class: 'st-item__kind' });
        var errs = el('small', { class: 'st-item__err', hidden: true });
        var toggle = el('button', { type: 'button', class: 'st-item__toggle', 'aria-expanded': String(isOpen), 'aria-controls': bodyId, 'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown' },
          [el('span', { class: 'st-item__num', text: (i + 1) + '.' }), name, kind, errs]);
        toggle.addEventListener('click', function () { openRows[stateKey] = isOpen ? -1 : i; render(); var r = row(i); if (r) r.focus(); });
        toggle.addEventListener('keydown', function (e) {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          var to = i + (e.key === 'ArrowUp' ? -1 : 1);
          if (to >= 0 && to < list.length) move(i, to);
        });
        var iconBtn = function (action, label, ic, cls, disabled, fn) {
          var b = el('button', { type: 'button', class: 'st-iconbtn st-item__act', 'data-action': action, 'aria-label': label, title: label, disabled: disabled }, [o.icon(ic, cls)]);
          b.addEventListener('click', fn);
          return b;
        };
        var li = el('li', { class: 'st-item' + (isOpen ? ' is-open' : ''), 'data-index': String(i) }, [
          el('div', { class: 'st-item__head' }, [toggle,
            iconBtn('move-up', tx('move_up'), 'st-chevron', 'st-ic--up', i === 0, function () { move(i, i - 1); }),
            iconBtn('move-down', tx('move_down'), 'st-chevron', '', i === list.length - 1, function () { move(i, i + 1); }),
            iconBtn('remove-item', tx(cfg.remove), 'st-x', '', false, function () {
              openRows[stateKey] = open === i ? -1 : open > i ? open - 1 : open;
              if (!store.removeItem(sec.id, c.path, i)) return;
              if (o.announce) o.announce(tx(cfg.removed));
              var next = row(Math.min(i, list.length - 2)) || o.box.querySelector('[data-path="' + key + '"] [data-action="add-item"]');
              if (next) next.focus();
            })])]);
        if (isOpen) {
          var body = el('div', { class: 'st-item__body', id: bodyId });
          c.item.forEach(function (f) {
            var fc = Object.assign({}, f, { path: c.path.concat(i, f.path) });
            var node = controlFor(sec, fc, D);
            if (node) body.appendChild(node);
          });
          li.appendChild(body);
        }
        refreshers.push(function (cur, errMap) {
          var item = (getPath(cur, c.path) || [])[i] || {};
          name.textContent = cfg.name(item, tx);
          kind.textContent = cfg.tag(item, tx);
          var n = Object.keys(errMap).filter(function (k) { return k.indexOf(key + '[' + i + '].') === 0; }).length;
          errs.hidden = !n;
          errs.textContent = n === 1 ? tx('errors_one') : tx('errors_many').replace('{n}', n);
          li.classList.toggle('has-error', !!n);
        });
        ol.appendChild(li);
      });
      add.addEventListener('click', function () {
        var n = (getPath(store.section(sec.id), c.path) || []).length;
        var before = openRows[stateKey];
        openRows[stateKey] = n;
        if (store.addItem(sec.id, c.path, cfg.newItem(tx), max) < 0) { openRows[stateKey] = before; return; }
        var first = o.box.querySelector('[data-path="' + key + '[' + n + '].' + cfg.focus + '"] input');
        if (first) { first.focus(); if (cfg.select) first.select(); }
      });
      refreshers.push(function (cur) {
        var n = (getPath(cur, c.path) || []).length;
        count.textContent = '(' + n + ' / ' + max + ')';
        add.disabled = n >= max;
        full.hidden = n < max;
      });
      return el('div', { class: 'st-items', 'data-path': key }, [el('div', { class: 'st-group st-items__head' }, [tx(cfg.heading) + ' ', count]), ol, add, full]);
    }

    // ── Opening Hours (2A-3E): one row per weekday, Monday to Sunday ──
    // Status Open (1 to 3 time ranges) / Closed / Not shown. Changing the
    // status is one Undo step; times are typed as HH:MM (typing merged).
    function hoursControl(sec, c, D) {
      var key = errKey(c.path);
      var rangeMax = specFor(D, sec.type, c.path.concat(0, 'ranges')).max;
      var list = function () { return getPath(store.section(sec.id), c.path) || []; };
      var indexOf = function (days, day) { for (var k = 0; k < days.length; k++) if (days[k] && days[k].day === day) return k; return -1; };
      var focus = function (sel) { var n = o.box.querySelector(sel); if (n) n.focus(); };
      var wrap = el('div', { class: 'st-days', 'data-path': key }, [el('div', { class: 'st-group', text: tx('g_days') }), el('p', { class: 'st-hint', text: tx('hint_hours') })]);
      D.choices.days.forEach(function (day) {
        var days = list(), i = indexOf(days, day), entry = i >= 0 ? days[i] : null, state = dayState(entry);
        var id = nextId('day'), dayErrId = id + '-err';
        var sel = el('select', { id: id, 'aria-label': tx('day_state').replace('{day}', tx('d_' + day)), 'aria-describedby': dayErrId });
        ['open', 'closed', 'hidden'].forEach(function (v) { sel.appendChild(el('option', { value: v, text: tx('ds_' + v) })); });
        sel.value = state;
        sel.addEventListener('change', function () {
          var cur = list(), j = indexOf(cur, day), v = sel.value;
          if (v === 'hidden') { if (j >= 0) store.removeItem(sec.id, c.path, j); }
          // a newly opened day waits for its times, like a new button waits for its target
          else if (j < 0) store.addItem(sec.id, c.path, v === 'closed' ? { day: day, closed: true } : { day: day, ranges: [{ open: '', close: '' }] }, D.choices.days.length);
          else {
            var e = JSON.parse(JSON.stringify(cur[j]));
            if (v === 'closed') e.closed = true;
            else { delete e.closed; if (!(e.ranges || []).length) e.ranges = [{ open: '', close: '' }]; }
            store.set(sec.id, c.path.concat(j), e); // the times are kept, so Open brings them back
            render();
          }
          focus('[data-day="' + day + '"] select');
        });
        var dayErr = errorLine(dayErrId);
        var row = el('div', { class: 'st-field st-day', 'data-day': day, 'data-state': state }, [
          el('div', { class: 'st-day__head' }, [el('label', { for: id, class: 'st-day__name', text: tx('d_' + day) }), sel]), dayErr]);
        var ranges = state === 'open' ? entry.ranges : [];
        ranges.forEach(function (r, j) {
          var base = c.path.concat(i, 'ranges', j), rk = errKey(base);
          var rangeErrId = nextId('range') + '-err', rangeErr = errorLine(rangeErrId);
          var lines = [];
          var inputs = ['open', 'close'].map(function (f) {
            var p = base.concat(f), fk = errKey(p), fid = nextId('time');
            var inp = el('input', { type: 'text', id: fid, class: 'st-time', inputmode: 'numeric', maxlength: '5', placeholder: 'HH:MM', autocomplete: 'off', spellcheck: 'false',
              'aria-label': tx('d_' + day) + ', ' + tx(f === 'open' ? 'opens' : 'closes') + (ranges.length > 1 ? ' (' + (j + 1) + ')' : ''), 'aria-describedby': fid + '-err ' + rangeErrId });
            inp.value = r[f] || '';
            var line = errorLine(fid + '-err');
            lines.push(line);
            inp.addEventListener('input', function () { store.set(sec.id, p, inp.value, 'typing'); });
            inp.addEventListener('blur', function () { store.endMerge(); });
            refreshers.push(function (cur, errs) {
              var v = getPath(cur, p) || '';
              if (!focused(inp) && inp.value !== v) inp.value = v;
              showError(inp, line, errs[fk], 'time');
            });
            return el('span', { class: 'st-time-wrap', 'data-path': fk }, [inp]);
          });
          var remove = el('button', { type: 'button', class: 'st-iconbtn', 'data-action': 'remove-range', 'aria-label': tx('remove_range'), title: tx('remove_range'), disabled: ranges.length <= 1 }, [o.icon('st-x')]);
          remove.addEventListener('click', function () {
            if (!store.removeItem(sec.id, c.path.concat(i, 'ranges'), j)) return;
            focus('[data-day="' + day + '"] [data-action="add-range"]');
          });
          row.appendChild(el('div', { class: 'st-range', 'data-path': rk }, [inputs[0], el('span', { class: 'st-range__dash', 'aria-hidden': 'true', text: '–' }), inputs[1], remove]));
          lines.concat(rangeErr).forEach(function (n) { row.appendChild(n); });
          refreshers.push(function (cur, errs) { if (errs[rk]) showError(inputs[1].querySelector('input'), rangeErr, errs[rk]); else rangeErr.hidden = true; });
        });
        if (state === 'open') {
          var add = el('button', { type: 'button', class: 'st-btn st-btn--ghost st-day__add', 'data-action': 'add-range', disabled: ranges.length >= rangeMax, title: ranges.length >= rangeMax ? tx('max_ranges').replace('{max}', rangeMax) : '' }, [tx('add_range')]);
          add.addEventListener('click', function () {
            var n = store.addItem(sec.id, c.path.concat(i, 'ranges'), { open: '', close: '' }, rangeMax);
            if (n >= 0) focus('[data-path="' + errKey(c.path.concat(i, 'ranges', n, 'open')) + '"] input');
          });
          row.appendChild(add);
        }
        // the day itself: listed twice; or errors in times that are not shown (a Closed day)
        refreshers.push(function (cur, errs) {
          if (i < 0) return showError(sel, dayErr, null);
          if (errs[key + '[' + i + '].day']) return showError(sel, dayErr, errs[key + '[' + i + '].day'], 'day');
          var n = state === 'open' ? 0 : Object.keys(errs).filter(function (k) { return k.indexOf(key + '[' + i + '].') === 0; }).length;
          dayErr.hidden = !n;
          dayErr.textContent = n === 1 ? tx('errors_one') : tx('errors_many').replace('{n}', n);
        });
        wrap.appendChild(row);
      });
      return wrap;
    }

    function controlFor(sec, c, D) {
      if (c.control === 'color') return null; // shown beside the Hero button text
      var spec = specFor(D, sec.type, c.path);
      if (c.control === 'text') return textControl(sec, c, spec);
      if (c.control === 'image') return imageControl(sec, c);
      if (c.control === 'link') return linkControl(sec, c);
      if (c.control === 'target') return targetControl(sec, c, spec);
      if (c.control === 'social') return socialControl(sec, c);
      if (c.control === 'input') return inputControl(sec, c, spec);
      if (c.control === 'switch') return switchControl(sec, c, spec);
      if (c.control === 'hours') return hoursControl(sec, c, D);
      if (c.control === 'select') return selectControl(sec, c, spec);
      if (c.control === 'number') return numberControl(sec, c, spec);
      if (c.control === 'items') return itemsControl(sec, c, D);
      if (c.control === 'anchor') return anchorControl(sec);
      if (c.control === 'show') return showControl(sec);
      if (c.control === 'readonly') return readonlyControl(sec);
      return null;
    }
    function renderPlan(box, sec, D, plan) {
      plan.filter(function (c) { return c.tab === o.tab(); }).forEach(function (c) {
        if (c.group) return box.appendChild(el('div', { class: 'st-group', text: Object.prototype.hasOwnProperty.call(TX.en, 'g_' + c.group) ? tx('g_' + c.group) : o.fieldLabel(c.group) }));
        if (c.hint) return box.appendChild(buttonHint(sec, c.hint));
        var node = controlFor(sec, c, D);
        if (node) box.appendChild(node);
      });
    }

    // Full build: on selection, tab, language or Undo / Redo.
    function render() {
      var box = o.box;
      box.textContent = '';
      refreshers = [];
      var id = store.selected();
      var sec = id ? store.section(id) : null;
      o.kind.textContent = sec ? o.sectionLabel(sec.type) : '';
      if (!sec) { box.appendChild(el('p', { class: 'st-empty', text: o.t('select_section') })); o.note.textContent = ''; return; }
      var D = o.V3.describe();
      var editable = EDITABLE.indexOf(sec.type) !== -1;
      box.setAttribute('data-editable', String(editable));
      if (editable) {
        renderPlan(box, sec, D, PLANS[sec.type]);
        o.note.textContent = tx('note_edit');
      } else {
        var valid = store.lastValid();
        var normalized = valid && valid.pages[0].sections.filter(function (x) { return x.id === id; })[0];
        if (normalized) renderReadOnly(box, normalized, D);
        o.note.textContent = tx('note_later');
      }
      refresh();
    }
    // In place, after an edit: values of the fields not being typed in,
    // counters, errors and dependent states. Keeps focus and the caret.
    function refresh() {
      var id = store.selected();
      var sec = id ? store.section(id) : null;
      if (!sec) return;
      var errs = store.sectionErrors(id);
      refreshers.forEach(function (f) { f(sec, errs); });
    }
    return { render: render, refresh: refresh };
  }

  return { EDITABLE: EDITABLE, HERO_PLAN: HERO_PLAN, BUTTONS_PLAN: BUTTONS_PLAN, SOCIAL_PLAN: SOCIAL_PLAN, CONTACT_PLAN: CONTACT_PLAN, HOURS_PLAN: HOURS_PLAN, dayState: dayState, PLANS: PLANS, LISTS: LISTS, TARGET_INPUT: TARGET_INPUT,
    phoneZeroWarning: phoneZeroWarning,
    SOCIAL_HINT_HOSTS: SOCIAL_HINT_HOSTS, SOCIAL_PLACEHOLDER: SOCIAL_PLACEHOLDER, heroSpec: heroSpec, specFor: specFor, errKey: errKey, socialHosts: socialHosts,
    whatsappLink: whatsappLink, whatsappNumber: whatsappNumber, textLength: textLength, errorText: errorText, TX: TX, createInspector: createInspector };
});
