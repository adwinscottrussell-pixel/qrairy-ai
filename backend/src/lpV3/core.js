/**
 * lpV3/core.js — Landing Page Studio V3: design format, validation and
 * renderer, shared by the server and (later) the Studio's live preview.
 *
 * One file without dependencies: no require, no DOM, no process, no URL.
 * In Node it is `module.exports`; in a browser `window.QraivyV3`
 * (backend/tests/lpV3Render.test.js runs it in an empty sandbox).
 *
 * Safety model (the server decides; the editor only helps):
 *   1. validateDesign(): only known section types and known fields, typed,
 *      length-limited; links are https / mailto / tel or an internal
 *      "/<page-or-anchor>" that must exist; images are https Cloudinary
 *      uploads only (no data:); colours are hex; everything else is an enum.
 *   2. renderDesign(): validates again, then escapes every value for its
 *      context. Owner text is plain text only (no HTML), there are no inline
 *      event handlers, and the output contains no <script> at all.
 *
 * The legacy renderer (renderPremiumLP) is not touched or used here.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyV3 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEMA_VERSION = 1;
  var LIMITS = { designChars: 262144, sections: 40, errors: 100 };

  // ── safety helpers (same rules as the Phase 0 helpers in lpController) ──
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Text with line breaks: escaped first, then each break becomes <br>.
  function escMultiline(v) { return esc(v).replace(/\n/g, '<br>'); }
  var HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  // Control characters and bidirectional overrides never belong in owner text.
  var CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

  // ── link and image rules ──
  var INTERNAL = /^\/([a-z0-9_-]{0,40})$/;
  var HTTPS = /^https:\/\/([^\/?#\s@\\]+)((?:[\/?#])[^\s"'<>\\^`{|}]*)?$/i;
  var HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;
  var MAILTO = /^mailto:[^\s@"'<>\\?]{1,64}@[^\s@"'<>\\?]{1,190}\.[a-z]{2,24}$/i;
  var TEL = /^tel:\+?[0-9]{3,20}$/;
  var EMAIL = /^[^\s@"'<>\\]{1,64}@[^\s@"'<>\\]{1,190}\.[a-z]{2,24}$/i;
  var PHONE = /^\+?[0-9 ()\/-]{3,30}$/;
  var CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/([A-Za-z0-9_-]+)\/image\/upload\/[A-Za-z0-9_,:.\/-]+\.(?:jpe?g|png|webp)$/;
  var MAP_HOSTS = ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl', 'maps.apple.com', 'openstreetmap.org', 'www.openstreetmap.org'];
  var SOCIAL_HOSTS = {
    instagram: ['instagram.com', 'www.instagram.com'],
    facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com'],
    tiktok: ['tiktok.com', 'www.tiktok.com'],
    youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
    linkedin: ['linkedin.com', 'www.linkedin.com'],
    x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    pinterest: ['pinterest.com', 'www.pinterest.com', 'pinterest.de', 'www.pinterest.de'],
    whatsapp: ['wa.me'],
  };
  function httpsHost(s) {
    var m = HTTPS.exec(s);
    if (!m || s.length > 500) return null;
    var host = m[1].toLowerCase().replace(/:\d{2,5}$/, '');
    return HOST.test(host) ? host : null;
  }

  // ── fixed choices ──
  var ICONS = ['none', 'arrow', 'tag', 'gift', 'cart', 'clock', 'pin', 'phone', 'mail', 'globe', 'calendar', 'star', 'info', 'chat', 'heart'];
  var LINK_KINDS = ['link', 'website', 'whatsapp', 'call', 'email', 'directions'];
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var FONT_PAIRS = {
    modern: { head: "'Inter',system-ui,sans-serif", body: "'Inter',system-ui,sans-serif", href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap' },
    'serif-display': { head: "'Playfair Display',Georgia,serif", body: "'Inter',system-ui,sans-serif", href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap' },
    classic: { head: "'Lora',Georgia,serif", body: "'Lora',Georgia,serif", href: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&display=swap' },
    rounded: { head: "'Nunito',system-ui,sans-serif", body: "'Nunito',system-ui,sans-serif", href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap' },
  };
  var RADII = { none: '0px', sm: '6px', md: '12px', lg: '20px' };
  // QRAIVY defaults: the existing neutral black / gray / white with orange as
  // the accent (no navy, no brown or sepia): dark = the Admin black (#101012),
  // surface / text / muted = the current landing pages' #f8f8f8 / #0a0a0a /
  // #555. Owners override any of these in theme.palette.
  // Contrast: text 19.8:1, muted 7.5:1 on white; heroText on dark 19.0:1.
  var DEFAULT_PALETTE = { brand: '#ff5a1f', onBrand: '#ffffff', background: '#ffffff', surface: '#f8f8f8', text: '#0a0a0a', muted: '#555555', heroText: '#ffffff', dark: '#101012' };

  // ── field specs ──
  function str(max, o) { return Object.assign({ t: 'str', max: max }, o || {}); }
  function en(values, o) { return Object.assign({ t: 'enum', values: values, def: values[0] }, o || {}); }
  function bool(def) { return { t: 'bool', def: !!def }; }
  function int(min, max, def) { return { t: 'int', min: min, max: max, def: def }; }
  function color(o) { return Object.assign({ t: 'color' }, o || {}); }
  function image(o) { return Object.assign({ t: 'image' }, o || {}); }
  function link(o) { return Object.assign({ t: 'link', kind: 'link' }, o || {}); }
  function arr(item, max, o) { return Object.assign({ t: 'arr', item: item, max: max }, o || {}); }
  function obj(fields, o) { return Object.assign({ t: 'obj', fields: fields }, o || {}); }

  var BUTTON = obj({ text: str(40), target: link(), icon: en(ICONS), color: color() });
  var STYLE = obj({ background: en(['default', 'alt', 'brand', 'dark']), align: en(['left', 'center']), spacing: en(['normal', 'compact', 'roomy']) });

  // The approved section library (labels and descriptions as in the mockup).
  // rendered: implemented by renderDesign in this phase; the others are
  // validated and stored but rendered in a later phase.
  var SECTIONS = {
    hero: { label: 'Hero', description: 'Eye-catching header with image, text and buttons', category: ['popular'], rendered: true,
      variants: ['overlay', 'split', 'simple'],
      data: obj({ eyebrow: str(60), headline: str(120, { required: true }), subheadline: str(300, { multiline: true }), backgroundImage: image(), imageAlt: str(120),
        overlay: int(0, 80, 45), primary: BUTTON, secondary: obj({ text: str(40), target: link(), icon: en(ICONS) }) }) },
    gallery: { label: 'Gallery', description: 'Images, products or menu items', category: ['media'], rendered: true,
      variants: ['grid', 'carousel'],
      data: obj({ title: str(80), images: arr(obj({ image: image({ required: true }), alt: str(120), caption: str(120) }), 24) }) },
    dealsOffers: { label: 'Deals / Offers', description: 'Show current offers and promotions', category: ['popular', 'business'], rendered: false,
      variants: ['cards'],
      data: obj({ title: str(80), subtitle: str(160), maxItems: int(1, 6, 3), showAllText: str(40), showAllTarget: link() }) },
    loyalty: { label: 'Loyalty', description: 'Digital stamp card and rewards', category: ['business'], rendered: false,
      variants: ['card'],
      data: obj({ title: str(80), subtitle: str(160), showWalletButtons: bool(true) }) },
    products: { label: 'Products', description: 'Products with links to shop', category: ['business'], rendered: true,
      variants: ['grid', 'list'],
      data: obj({ title: str(80), items: arr(obj({ name: str(80, { required: true }), description: str(200), price: str(20), image: image(), target: link(), buttonText: str(30) }), 24) }) },
    openingHours: { label: 'Opening Hours', description: 'Show your business hours', category: ['business'], rendered: true,
      variants: ['table', 'compact'],
      data: obj({ title: str(80), days: arr(obj({ day: en(DAYS, { required: true }), closed: bool(false), ranges: arr(obj({ open: { t: 'time', required: true }, close: { t: 'time', required: true } }), 3) }), 7), note: str(300, { multiline: true }) }) },
    contact: { label: 'Contact', description: 'Map, address, phone, email', category: ['business'], rendered: true,
      variants: ['card', 'split'],
      data: obj({ title: str(80), address: obj({ line1: str(100), line2: str(100), postalCode: str(12), city: str(60), country: str(60) }),
        phone: { t: 'phone' }, email: { t: 'email' }, mapsUrl: link({ kind: 'directions' }), showMapLink: bool(true) }) },
    buttons: { label: 'Buttons', description: 'WhatsApp, Call, Directions, Website', category: ['popular'], rendered: true,
      variants: ['buttons', 'cards', 'list'],
      data: obj({ title: str(80), subtitle: str(160), items: arr(obj({ label: str(40, { required: true }), subtitle: str(80), kind: en(LINK_KINDS), target: link({ required: true, kindFrom: 'kind' }), icon: en(ICONS) }), 12) }) },
    socialMedia: { label: 'Social Media', description: 'Instagram, Facebook, TikTok, etc.', category: ['more'], rendered: true,
      variants: ['icons', 'buttons'],
      data: obj({ title: str(80), links: arr(obj({ platform: en(Object.keys(SOCIAL_HOSTS), { required: true }), url: { t: 'social', required: true } }), 8) }) },
    text: { label: 'Text Section', description: 'Add text, headings and images', category: ['more'], rendered: true,
      variants: ['plain', 'image-left', 'image-right', 'image-top'],
      data: obj({ heading: str(120), body: str(2000, { multiline: true }), image: image(), imageAlt: str(120) }) },
  };
  var SECTION_TYPES = Object.keys(SECTIONS);

  var DESIGN = obj({
    schemaVersion: { t: 'version', required: true },
    theme: obj({ palette: obj({ brand: color(), onBrand: color(), background: color(), surface: color(), text: color(), muted: color(), heroText: color(), dark: color() }),
      fontPair: en(Object.keys(FONT_PAIRS)), radius: en(['md', 'none', 'sm', 'lg']) }),
    settings: obj({ language: en(['de', 'en']), seo: obj({ title: str(70), description: str(160) }) }),
    header: obj({ logo: image(), logoAlt: str(80), showBusinessName: bool(true), nav: arr(obj({ label: str(30, { required: true }), target: link({ required: true }) }), 8) }),
    footer: obj({ text: str(300, { multiline: true }), links: arr(obj({ label: str(30, { required: true }), target: link({ required: true }) }), 8) }),
    pages: { t: 'pages', required: true },
  });

  // ── validation ──
  function Ctx(opts) {
    this.errors = [];
    this.internal = []; // { path, id } -- checked once all anchors are known
    this.cloudName = opts && typeof opts.cloudName === 'string' && opts.cloudName ? opts.cloudName : null;
  }
  Ctx.prototype.err = function (path, code, extra) {
    if (this.errors.length < LIMITS.errors) this.errors.push(Object.assign({ path: path, code: code }, extra || {}));
  };
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cleanStr(v, multiline) {
    var s = String(v).replace(/\r\n?/g, '\n').replace(CONTROL, '');
    if (!multiline) s = s.replace(/[\n\t]+/g, ' ');
    return s.trim();
  }
  function len(s) { var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0xdc00 || c > 0xdfff) n++; } return n; }

  function checkLink(v, kind, path, ctx) {
    var s = v.trim();
    if (kind === 'whatsapp') return /^https:\/\/wa\.me\/[0-9]{6,15}$/.test(s) ? s : (ctx.err(path, 'invalid_whatsapp'), null);
    if (kind === 'call') { var t = s.replace(/^tel:/i, '').replace(/[ ()\/-]/g, ''); return /^\+?[0-9]{3,20}$/.test(t) ? 'tel:' + t : (ctx.err(path, 'invalid_phone'), null); }
    if (kind === 'email') { var e = s.replace(/^mailto:/i, ''); return EMAIL.test(e) ? 'mailto:' + e : (ctx.err(path, 'invalid_email'), null); }
    if (kind === 'directions') {
      var h = httpsHost(s);
      if (!h || MAP_HOSTS.indexOf(h) === -1) return ctx.err(path, 'invalid_maps_link'), null;
      if ((h === 'google.com' || h === 'www.google.com') && !/^https:\/\/(?:www\.)?google\.com\/maps(?:[\/?]|$)/i.test(s)) return ctx.err(path, 'invalid_maps_link'), null;
      return s;
    }
    if (kind === 'website') return httpsHost(s) ? s : (ctx.err(path, 'invalid_url'), null);
    // kind 'link': an internal target or any https / mailto / tel link
    var m = INTERNAL.exec(s);
    if (m) { ctx.internal.push({ path: path, id: m[1] }); return s; }
    if (httpsHost(s) || MAILTO.test(s) || TEL.test(s)) return s;
    ctx.err(path, 'invalid_link');
    return null;
  }

  function checkValue(spec, v, path, ctx, parent) {
    var missing = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    switch (spec.t) {
      case 'obj': {
        if (v === undefined || v === null) v = {};
        if (!isObj(v)) return ctx.err(path, 'not_object'), undefined;
        var out = {};
        Object.keys(v).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(spec.fields, k)) ctx.err(path + '.' + k, 'unknown_field'); });
        Object.keys(spec.fields).forEach(function (k) {
          var r = checkValue(spec.fields[k], v[k], path + '.' + k, ctx, v);
          if (r !== undefined) out[k] = r;
        });
        return out;
      }
      case 'arr': {
        if (v === undefined || v === null) return [];
        if (!Array.isArray(v)) return ctx.err(path, 'not_list'), undefined;
        if (v.length > spec.max) ctx.err(path, 'too_many', { max: spec.max });
        return v.slice(0, spec.max).map(function (x, i) { return checkValue(spec.item, x, path + '[' + i + ']', ctx); });
      }
      case 'str': {
        if (missing) { if (spec.required) ctx.err(path, 'required'); return ''; }
        if (typeof v !== 'string') return ctx.err(path, 'not_text'), '';
        var s = cleanStr(v, spec.multiline);
        if (spec.required && !s) ctx.err(path, 'required');
        if (len(s) > spec.max) ctx.err(path, 'too_long', { max: spec.max });
        return s;
      }
      case 'enum': {
        if (missing) { if (spec.required) ctx.err(path, 'required'); return spec.def; }
        if (spec.values.indexOf(v) === -1) return ctx.err(path, 'not_allowed'), spec.def;
        return v;
      }
      case 'bool':
        if (v === undefined || v === null) return spec.def;
        if (typeof v !== 'boolean') return ctx.err(path, 'not_boolean'), spec.def;
        return v;
      case 'int':
        if (v === undefined || v === null) return spec.def;
        if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < spec.min || v > spec.max) return ctx.err(path, 'out_of_range', { min: spec.min, max: spec.max }), spec.def;
        return v;
      case 'color':
        if (missing) return '';
        if (typeof v !== 'string' || !HEX.test(v.trim())) return ctx.err(path, 'invalid_color'), '';
        return v.trim().toLowerCase();
      case 'time':
        if (missing) { if (spec.required) ctx.err(path, 'required'); return ''; }
        if (typeof v !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/.test(v)) return ctx.err(path, 'invalid_time'), '';
        return v;
      case 'image': {
        if (missing) { if (spec.required) ctx.err(path, 'required'); return ''; }
        if (typeof v !== 'string') return ctx.err(path, 'not_text'), '';
        var im = CLOUDINARY.exec(v.trim());
        if (!im || v.length > 500) return ctx.err(path, 'invalid_image'), '';
        if (ctx.cloudName && im[1] !== ctx.cloudName) return ctx.err(path, 'invalid_image'), '';
        return v.trim();
      }
      case 'link': {
        if (missing) { if (spec.required) ctx.err(path, 'required'); return ''; }
        if (typeof v !== 'string') return ctx.err(path, 'not_text'), '';
        var kind = spec.kindFrom ? ((parent && LINK_KINDS.indexOf(parent[spec.kindFrom]) !== -1) ? parent[spec.kindFrom] : 'link') : spec.kind;
        var l = checkLink(v, kind, path, ctx);
        return l === null ? '' : l;
      }
      case 'phone':
        if (missing) return '';
        if (typeof v !== 'string' || !PHONE.test(v.trim()) || (v.match(/[0-9]/g) || []).length < 3) return ctx.err(path, 'invalid_phone'), '';
        return v.trim();
      case 'email':
        if (missing) return '';
        if (typeof v !== 'string' || !EMAIL.test(v.trim())) return ctx.err(path, 'invalid_email'), '';
        return v.trim();
      case 'social': {
        if (missing) { ctx.err(path, 'required'); return ''; }
        var platform = parent && parent.platform;
        var hosts = SOCIAL_HOSTS[platform];
        var h = typeof v === 'string' ? httpsHost(v.trim()) : null;
        if (!hosts || !h || hosts.indexOf(h) === -1) return ctx.err(path, 'invalid_social_link'), '';
        return v.trim();
      }
      case 'version':
        if (v !== SCHEMA_VERSION) ctx.err(path, 'unsupported_schema_version', { expected: SCHEMA_VERSION });
        return SCHEMA_VERSION;
      case 'pages':
        return checkPages(v, path, ctx);
    }
    ctx.err(path, 'unknown_spec');
    return undefined;
  }

  // Each weekday once; every range opens before it closes ("HH:MM" compares
  // as text; "24:00" is the end of the day).
  function checkHours(data, path, ctx) {
    var seen = {};
    (data.days || []).forEach(function (d, i) {
      if (!d) return;
      if (seen[d.day]) ctx.err(path + '.days[' + i + '].day', 'duplicate');
      seen[d.day] = true;
      (d.ranges || []).forEach(function (r, j) {
        if (r && r.open && r.close && !(r.open < r.close)) ctx.err(path + '.days[' + i + '].ranges[' + j + ']', 'closes_before_opening');
      });
    });
  }

  function checkPages(v, path, ctx) {
    if (!Array.isArray(v) || v.length === 0) return ctx.err(path, 'required'), [];
    // Version 1 publishes one page, "start"; pages[] is there for later.
    if (v.length > 1) ctx.err(path, 'too_many', { max: 1 });
    var p = v[0];
    if (!isObj(p)) return ctx.err(path + '[0]', 'not_object'), [];
    Object.keys(p).forEach(function (k) { if (['id', 'title', 'sections'].indexOf(k) === -1) ctx.err(path + '[0].' + k, 'unknown_field'); });
    if (p.id !== 'start') ctx.err(path + '[0].id', 'not_allowed');
    var title = checkValue(str(60), p.title, path + '[0].title', ctx);
    var list = p.sections === undefined ? [] : p.sections;
    if (!Array.isArray(list)) return ctx.err(path + '[0].sections', 'not_list'), [];
    if (list.length > LIMITS.sections) ctx.err(path + '[0].sections', 'too_many', { max: LIMITS.sections });
    var ids = {}, anchors = { start: true, top: true };
    var sections = list.slice(0, LIMITS.sections).map(function (s, i) {
      var sp = path + '[0].sections[' + i + ']';
      if (!isObj(s)) return ctx.err(sp, 'not_object'), null;
      Object.keys(s).forEach(function (k) { if (['id', 'type', 'anchor', 'hidden', 'variant', 'data', 'style'].indexOf(k) === -1) ctx.err(sp + '.' + k, 'unknown_field'); });
      var def = SECTIONS[s.type];
      if (!def) return ctx.err(sp + '.type', 'unknown_section_type'), null;
      if (typeof s.id !== 'string' || !/^s_[a-z0-9]{4,16}$/.test(s.id)) ctx.err(sp + '.id', 'invalid_id');
      else if (ids[s.id]) ctx.err(sp + '.id', 'duplicate');
      ids[s.id] = true;
      var anchor = '';
      if (s.anchor !== undefined && s.anchor !== null && s.anchor !== '') {
        if (typeof s.anchor !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(s.anchor)) ctx.err(sp + '.anchor', 'invalid_anchor');
        else if (anchors[s.anchor]) ctx.err(sp + '.anchor', 'duplicate');
        else { anchor = s.anchor; anchors[anchor] = true; }
      }
      if (typeof s.id === 'string') anchors[s.id] = true;
      var data = checkValue(def.data, s.data, sp + '.data', ctx);
      if (s.type === 'openingHours' && data) checkHours(data, sp + '.data', ctx);
      return {
        id: s.id, type: s.type, anchor: anchor,
        hidden: checkValue(bool(false), s.hidden, sp + '.hidden', ctx),
        variant: checkValue(en(def.variants), s.variant, sp + '.variant', ctx),
        data: data,
        style: checkValue(STYLE, s.style, sp + '.style', ctx),
      };
    }).filter(Boolean);
    ctx.anchors = anchors;
    return [{ id: 'start', title: title || 'Start', sections: sections }];
  }

  // validateDesign(input, { cloudName }) -> { ok, design, errors }
  // `design` is the normalized copy (defaults filled in) -- store and render
  // that, never the raw input.
  function validateDesign(input, opts) {
    var ctx = new Ctx(opts);
    var size;
    try { size = JSON.stringify(input).length; } catch (e) { return { ok: false, design: null, errors: [{ path: '$', code: 'not_json' }] }; }
    if (size > LIMITS.designChars) return { ok: false, design: null, errors: [{ path: '$', code: 'too_large', max: LIMITS.designChars }] };
    if (!isObj(input)) return { ok: false, design: null, errors: [{ path: '$', code: 'not_object' }] };
    var design = checkValue(DESIGN, input, '$', ctx);
    ctx.internal.forEach(function (ref) {
      if (ref.id !== '' && !(ctx.anchors && ctx.anchors[ref.id])) ctx.err(ref.path, 'unknown_internal_target');
    });
    return { ok: ctx.errors.length === 0, design: ctx.errors.length === 0 ? design : null, errors: ctx.errors };
  }

  // ── rendering ──
  var TEXT = {
    de: { menu: 'Menü', closed: 'Geschlossen', phone: 'Telefon', email: 'E-Mail', directions: 'Route planen', address: 'Adresse', skip: 'Zum Inhalt springen',
      days: { mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag' },
      view: 'Ansehen',
      // preview only (the Studio)
      empty: 'Leerer Abschnitt – Inhalte im Editor ergänzen', image: 'Bildplatzhalter', sample: 'Beispiel',
      dealsNote: 'Vorschau: Hier erscheinen Ihre aktuellen Angebote.', loyaltyNote: 'Vorschau: Hier erscheint Ihre Stempelkarte.',
      sampleDeals: [['2 für 1', 'Beispielangebot', 'Jeden Montag'], ['-20%', 'Beispielaktion', 'Nur diese Woche'], ['€ 2,50', 'Beispielpreis', 'Freitag & Samstag']],
      stamps: '3 von 10 Stempeln', walletApple: 'Zu Apple Wallet hinzufügen', walletGoogle: 'Zu Google Wallet hinzufügen' },
    en: { menu: 'Menu', closed: 'Closed', phone: 'Phone', email: 'Email', directions: 'Get directions', address: 'Address', skip: 'Skip to content',
      days: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
      view: 'View',
      empty: 'Empty section – add content in the editor', image: 'Image placeholder', sample: 'Sample',
      dealsNote: 'Preview: your current deals appear here.', loyaltyNote: 'Preview: your stamp card appears here.',
      sampleDeals: [['2 for 1', 'Sample offer', 'Every Monday'], ['-20%', 'Sample promotion', 'This week only'], ['€ 2.50', 'Sample price', 'Friday & Saturday']],
      stamps: '3 of 10 stamps', walletApple: 'Add to Apple Wallet', walletGoogle: 'Add to Google Wallet' },
  };
  var SOCIAL_LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', pinterest: 'Pinterest', whatsapp: 'WhatsApp' };
  var KIND_ICON = { whatsapp: 'chat', call: 'phone', email: 'mail', directions: 'pin', website: 'globe', link: 'arrow' };
  // Fixed SVG paths (24x24, stroke). Never built from owner input.
  var SVG = {
    arrow: 'M5 12h14M13 6l6 6-6 6', tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01', gift: 'M4 10h16v10H4zM12 10v10M3 7h18v3H3zM12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0',
    cart: 'M3 4h2l2.5 11h11L21 7H7M9 20h.01M18 20h.01', clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', pin: 'M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z', mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
    globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18', calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v6M12 7.5h.01',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.7A8 8 0 1 1 21 12z', heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
    chevron: 'M9 6l6 6-6 6', menu: 'M4 7h16M4 12h16M4 17h16', image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01',
  };
  function icon(name, cls) {
    var d = SVG[name];
    if (!d) return '';
    return '<svg class="' + (cls || 'v3-ic') + '" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  }
  function href(target) {
    var m = INTERNAL.exec(target);
    if (m) return '#' + (m[1] === '' || m[1] === 'start' ? 'top' : m[1]);
    return target;
  }
  function linkAttrs(target) {
    var external = /^https:/i.test(target);
    return ' href="' + esc(href(target)) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '');
  }
  function heading(text, cls) { return text ? '<h2 class="' + cls + '">' + esc(text) + '</h2>' : ''; }
  // pv (preview, the Studio only): adds data-v3-id for click-to-select. The
  // public output never contains it.
  function selectId(s, pv) { return pv ? ' data-v3-id="' + esc(s.id) + '"' : ''; }
  function sectionOpen(s, extraClass, pv) {
    return '<section id="' + esc(s.anchor || s.id) + '"' + selectId(s, pv) + ' class="v3-s v3-' + esc(s.type) + ' v3-v-' + esc(s.variant) + ' v3-bg-' + esc(s.style.background) +
      ' v3-al-' + esc(s.style.align) + ' v3-sp-' + esc(s.style.spacing) + (extraClass ? ' ' + extraClass : '') + '"><div class="v3-wrap">';
  }
  var SECTION_CLOSE = '</div></section>';
  // Preview only: an empty section stays visible and selectable; a missing
  // image shows a placeholder. Fixed texts only.
  function emptySection(s, t, pv) {
    return pv ? sectionOpen(s, 'v3-ph-section', pv) + '<div class="v3-ph-note">' + icon('info') + '<span>' + esc(t.empty) + '</span></div>' + SECTION_CLOSE : '';
  }
  function imagePlaceholder(t, cls) {
    return '<div class="v3-img-ph' + (cls ? ' ' + cls : '') + '" role="img" aria-label="' + esc(t.image) + '">' + icon('image') + '</div>';
  }

  var RENDER = {
    hero: function (s, t, pv) {
      var d = s.data, out = '';
      var img = s.variant !== 'simple' && d.backgroundImage
        ? '<img class="v3-hero-img" src="' + esc(d.backgroundImage) + '" alt="' + esc(d.imageAlt) + '" width="1600" height="900" fetchpriority="high">' : '';
      var media = s.variant === 'split' ? (img || (pv ? imagePlaceholder(t) : '')) : '';
      var overlay = s.variant === 'overlay' && img ? '<div class="v3-hero-shade" style="opacity:' + (d.overlay / 100) + '"></div>' : '';
      var btns = '';
      if (d.primary.text && d.primary.target) {
        btns += '<a class="v3-btn v3-btn-primary"' + linkAttrs(d.primary.target) + (d.primary.color ? ' style="background:' + d.primary.color + '"' : '') + '>' + icon(d.primary.icon) + '<span>' + esc(d.primary.text) + '</span></a>';
      }
      if (d.secondary.text && d.secondary.target) btns += '<a class="v3-btn v3-btn-outline"' + linkAttrs(d.secondary.target) + '>' + icon(d.secondary.icon) + '<span>' + esc(d.secondary.text) + '</span></a>';
      out += '<section id="' + esc(s.anchor || s.id) + '"' + selectId(s, pv) + ' class="v3-s v3-hero v3-v-' + esc(s.variant) + ' v3-al-' + esc(s.style.align) + (img ? ' v3-has-img' : '') + '">';
      if (s.variant === 'overlay') out += img + overlay;
      out += '<div class="v3-wrap v3-hero-in"><div class="v3-hero-text">' +
        (d.eyebrow ? '<p class="v3-eyebrow">' + esc(d.eyebrow) + '</p>' : '') +
        '<h1 class="v3-h1">' + esc(d.headline) + '</h1>' +
        (d.subheadline ? '<p class="v3-lead">' + escMultiline(d.subheadline) + '</p>' : '') +
        (btns ? '<div class="v3-btns">' + btns + '</div>' : '') + '</div>' +
        (media ? '<div class="v3-hero-media">' + media + '</div>' : '') + '</div></section>';
      return out;
    },
    buttons: function (s, t, pv) {
      var d = s.data;
      if (!d.items.length) return emptySection(s, t, pv);
      var items = d.items.map(function (it) {
        var ic = it.icon !== 'none' ? it.icon : KIND_ICON[it.kind];
        if (s.variant === 'buttons') return '<a class="v3-btn v3-btn-primary"' + linkAttrs(it.target) + '>' + icon(ic) + '<span>' + esc(it.label) + '</span></a>';
        return '<a class="v3-card-link"' + linkAttrs(it.target) + '><span class="v3-card-ic">' + icon(ic) + '</span><span class="v3-card-tx"><strong>' + esc(it.label) + '</strong>' +
          (it.subtitle ? '<small>' + esc(it.subtitle) + '</small>' : '') + '</span>' + (s.variant === 'list' ? icon('chevron', 'v3-chev') : '') + '</a>';
      }).join('');
      return sectionOpen(s, '', pv) + heading(d.title, 'v3-h2') + (d.subtitle ? '<p class="v3-sub">' + esc(d.subtitle) + '</p>' : '') +
        '<div class="v3-items v3-items-' + esc(s.variant) + '">' + items + '</div>' + SECTION_CLOSE;
    },
    // Plain is text only: a stored image is kept but never shown (2A-3G).
    text: function (s, t, pv) {
      var d = s.data, plain = s.variant === 'plain';
      if (!d.heading && !d.body && (!d.image || plain)) return emptySection(s, t, pv);
      var img = plain ? '' : d.image ? '<figure class="v3-text-fig"><img src="' + esc(d.image) + '" alt="' + esc(d.imageAlt) + '" loading="lazy" width="800" height="600"></figure>'
        : (pv ? '<figure class="v3-text-fig">' + imagePlaceholder(t) + '</figure>' : '');
      return sectionOpen(s, '', pv) + '<div class="v3-text-grid">' + (s.variant === 'image-right' ? '' : img) +
        '<div class="v3-text-body">' + heading(d.heading, 'v3-h2') + (d.body ? '<p class="v3-body">' + escMultiline(d.body) + '</p>' : '') + '</div>' +
        (s.variant === 'image-right' ? img : '') + '</div>' + SECTION_CLOSE;
    },
    openingHours: function (s, t, pv) {
      var d = s.data;
      if (!d.days.length && !d.note) return emptySection(s, t, pv);
      var order = DAYS.filter(function (day) { return d.days.some(function (x) { return x.day === day; }); });
      var rows = order.map(function (day) {
        var e = d.days.filter(function (x) { return x.day === day; })[0];
        var hours = e.closed || !e.ranges.length ? esc(t.closed) : e.ranges.map(function (r) { return esc(r.open) + '–' + esc(r.close); }).join(', ');
        return '<tr' + (e.closed ? ' class="v3-closed"' : '') + '><th scope="row">' + esc(t.days[day]) + '</th><td>' + hours + '</td></tr>';
      }).join('');
      return sectionOpen(s, '', pv) + heading(d.title, 'v3-h2') + (rows ? '<table class="v3-hours">' + rows + '</table>' : '') +
        (d.note ? '<p class="v3-note">' + escMultiline(d.note) + '</p>' : '') + SECTION_CLOSE;
    },
    contact: function (s, t, pv) {
      var d = s.data, a = d.address, parts = [];
      var addr = [a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.country].filter(Boolean);
      if (addr.length) parts.push('<div class="v3-ct-row">' + icon('pin') + '<address><span class="v3-sr">' + esc(t.address) + ': </span>' + addr.map(esc).join('<br>') + '</address></div>');
      if (d.phone) parts.push('<div class="v3-ct-row">' + icon('phone') + '<a href="' + esc('tel:' + d.phone.replace(/[ ()\/-]/g, '')) + '"><span class="v3-sr">' + esc(t.phone) + ': </span>' + esc(d.phone) + '</a></div>');
      if (d.email) parts.push('<div class="v3-ct-row">' + icon('mail') + '<a href="' + esc('mailto:' + d.email) + '"><span class="v3-sr">' + esc(t.email) + ': </span>' + esc(d.email) + '</a></div>');
      if (d.mapsUrl && d.showMapLink) parts.push('<a class="v3-btn v3-btn-outline"' + linkAttrs(d.mapsUrl) + '>' + icon('pin') + '<span>' + esc(t.directions) + '</span></a>');
      if (!parts.length) return emptySection(s, t, pv);
      return sectionOpen(s, '', pv) + heading(d.title, 'v3-h2') + '<div class="v3-contact">' + parts.join('') + '</div>' + SECTION_CLOSE;
    },
    socialMedia: function (s, t, pv) {
      var d = s.data;
      if (!d.links.length) return emptySection(s, t, pv);
      var links = d.links.map(function (l) {
        var label = SOCIAL_LABEL[l.platform];
        return '<a class="v3-social v3-social-' + esc(l.platform) + '"' + linkAttrs(l.url) + ' aria-label="' + esc(label) + '"><span class="v3-social-mark" aria-hidden="true">' + esc(label.charAt(0)) + '</span>' +
          (s.variant === 'buttons' ? '<span>' + esc(label) + '</span>' : '') + '</a>';
      }).join('');
      return sectionOpen(s, '', pv) + heading(d.title, 'v3-h2') + '<div class="v3-socials">' + links + '</div>' + SECTION_CLOSE;
    },
    gallery: function (s, t, pv) {
      var d = s.data;
      if (!d.images.length) return emptySection(s, t, pv);
      var items = d.images.map(function (im) {
        return '<figure class="v3-gal-item"><img src="' + esc(im.image) + '" alt="' + esc(im.alt) + '" loading="lazy" width="800" height="600">' +
          (im.caption ? '<figcaption>' + esc(im.caption) + '</figcaption>' : '') + '</figure>';
      }).join('');
      return sectionOpen(s, '', pv) + heading(d.title, 'v3-h2') + '<div class="v3-gal v3-gal-' + esc(s.variant) + '">' + items + '</div>' + SECTION_CLOSE;
    },
    products: function (s, t, pv) {
      var d = s.data;
      if (!d.items.length) return emptySection(s, t, pv);
      var items = d.items.map(function (p) {
        var img = p.image ? '<img class="v3-prod-img" src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" width="800" height="600">'
          : (pv ? imagePlaceholder(t, 'v3-prod-img') : '');
        return '<article class="v3-prod">' + img + '<div class="v3-prod-body"><h3 class="v3-prod-name">' + esc(p.name) + '</h3>' +
          (p.description ? '<p class="v3-prod-desc">' + esc(p.description) + '</p>' : '') +
          (p.price ? '<p class="v3-prod-price">' + esc(p.price) + '</p>' : '') +
          (p.target ? '<a class="v3-btn v3-btn-primary v3-prod-btn"' + linkAttrs(p.target) + '><span>' + esc(p.buttonText || t.view) + '</span></a>' : '') + '</div></article>';
      }).join('');
      return sectionOpen(s, '', pv) + heading(d.title, 'v3-h2') + '<div class="v3-prods v3-prods-' + esc(s.variant) + '">' + items + '</div>' + SECTION_CLOSE;
    },
  };

  // Preview only: Deals / Offers and Loyalty show labelled samples in the
  // Studio. The public page renders them from real data in a later phase
  // (until then they are reported as `skipped` and render nothing).
  var SAMPLE = {
    dealsOffers: function (s, t) {
      var d = s.data;
      var cards = t.sampleDeals.slice(0, d.maxItems).map(function (c) {
        return '<article class="v3-prod v3-sample-card">' + imagePlaceholder(t, 'v3-prod-img') + '<div class="v3-prod-body"><p class="v3-prod-price">' + esc(c[0]) + '</p>' +
          '<h3 class="v3-prod-name">' + esc(c[1]) + '</h3><p class="v3-prod-desc">' + esc(c[2]) + '</p></div></article>';
      }).join('');
      return sectionOpen(s, 'v3-sample', true) + '<span class="v3-sample-badge">' + esc(t.sample) + '</span>' + heading(d.title, 'v3-h2') +
        (d.subtitle ? '<p class="v3-sub">' + esc(d.subtitle) + '</p>' : '') + '<div class="v3-prods v3-prods-grid">' + cards + '</div>' +
        (d.showAllText && d.showAllTarget ? '<p><a class="v3-more"' + linkAttrs(d.showAllTarget) + '>' + esc(d.showAllText) + ' →</a></p>' : '') +
        '<p class="v3-note">' + esc(t.dealsNote) + '</p>' + SECTION_CLOSE;
    },
    loyalty: function (s, t) {
      var d = s.data, dots = '';
      for (var i = 0; i < 10; i++) dots += '<span class="v3-stamp' + (i < 3 ? ' v3-stamp-on' : '') + '"></span>';
      return sectionOpen(s, 'v3-sample', true) + '<span class="v3-sample-badge">' + esc(t.sample) + '</span>' + heading(d.title, 'v3-h2') +
        (d.subtitle ? '<p class="v3-sub">' + esc(d.subtitle) + '</p>' : '') + '<div class="v3-loyalty-card"><div class="v3-stamps" role="img" aria-label="' + esc(t.stamps) + '">' + dots + '</div>' +
        '<p class="v3-stamps-tx">' + esc(t.stamps) + '</p>' +
        (d.showWalletButtons ? '<div class="v3-btns"><span class="v3-btn v3-btn-outline">' + esc(t.walletApple) + '</span><span class="v3-btn v3-btn-outline">' + esc(t.walletGoogle) + '</span></div>' : '') +
        '</div><p class="v3-note">' + esc(t.loyaltyNote) + '</p>' + SECTION_CLOSE;
    },
  };

  function css(design, extra) {
    var p = Object.assign({}, DEFAULT_PALETTE);
    Object.keys(design.theme.palette).forEach(function (k) { if (design.theme.palette[k]) p[k] = design.theme.palette[k]; });
    var f = FONT_PAIRS[design.theme.fontPair];
    // Only validated hex colours and constants reach the stylesheet.
    return ':root{--v3-brand:' + p.brand + ';--v3-on-brand:' + p.onBrand + ';--v3-bg:' + p.background + ';--v3-surface:' + p.surface + ';--v3-text:' + p.text +
      ';--v3-muted:' + p.muted + ';--v3-hero-text:' + p.heroText + ';--v3-dark:' + p.dark + ';--v3-radius:' + RADII[design.theme.radius] +
      ';--v3-font-head:' + f.head + ';--v3-font-body:' + f.body + '}' + BASE_CSS + (extra || '');
  }
  // Added only when a page contains these sections (or in the preview), so
  // the stylesheet of every other page stays exactly as it was.
  var GALLERY_CSS = [
    '.v3-gal{display:grid;gap:12px;margin-top:16px;grid-template-columns:1fr 1fr}.v3-gal-item{margin:0;min-width:0}',
    '.v3-gal-item img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--v3-radius)}.v3-gal-item figcaption{margin-top:6px;font-size:13px;color:var(--v3-muted)}',
    '.v3-gal-carousel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding-bottom:8px}.v3-gal-carousel .v3-gal-item{flex:0 0 80%;scroll-snap-align:start}',
    '@media (min-width:768px){.v3-gal-grid{grid-template-columns:repeat(3,1fr)}.v3-gal-carousel .v3-gal-item{flex-basis:40%}}@media (min-width:1200px){.v3-gal-grid{grid-template-columns:repeat(4,1fr)}}',
  ].join('');
  var PRODUCTS_CSS = [
    '.v3-prods{display:grid;gap:16px;margin-top:16px}.v3-prods-grid{grid-template-columns:1fr 1fr}.v3-prods-list{grid-template-columns:1fr}',
    '.v3-prod{display:flex;flex-direction:column;min-width:0;background:var(--v3-bg);color:var(--v3-text);border:1px solid rgba(0,0,0,.08);border-radius:var(--v3-radius);overflow:hidden}',
    '.v3-prods-list .v3-prod{flex-direction:row}.v3-prod-img{width:100%;aspect-ratio:4/3;object-fit:cover}.v3-prods-list .v3-prod-img{width:112px;aspect-ratio:1/1;flex-shrink:0}',
    '.v3-prod-body{display:flex;flex-direction:column;gap:6px;flex:1;padding:12px;min-width:0}.v3-prod-name{margin:0;font-size:16px;line-height:1.3}.v3-prod-desc{margin:0;font-size:14px;color:var(--v3-muted)}',
    '.v3-prod-price{margin:0;font-weight:700;color:var(--v3-brand)}.v3-prod-btn{align-self:flex-start;min-height:40px;margin-top:auto;padding:8px 14px;font-size:14px}',
    '@media (min-width:768px){.v3-prods-grid{grid-template-columns:repeat(3,1fr)}}@media (min-width:1200px){.v3-prods-grid{grid-template-columns:repeat(4,1fr)}}',
  ].join('');
  var PREVIEW_CSS = [
    '.v3-ph-note{display:flex;align-items:center;gap:10px;padding:18px;border:2px dashed rgba(0,0,0,.2);border-radius:var(--v3-radius);color:var(--v3-muted)}',
    '.v3-img-ph{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:4/3;border:2px dashed rgba(127,127,127,.45);border-radius:var(--v3-radius);background:rgba(127,127,127,.08);color:var(--v3-muted)}',
    '.v3-img-ph .v3-ic{width:32px;height:32px}.v3-prod .v3-img-ph{border-radius:0;border-width:0 0 2px}',
    '.v3-sample{position:relative}.v3-sample-badge{display:inline-block;margin-bottom:10px;padding:2px 10px;border-radius:999px;background:var(--v3-muted);color:var(--v3-bg);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}',
    '.v3-more{font-weight:700;color:var(--v3-brand)}.v3-loyalty-card{max-width:420px;margin-top:16px;padding:18px;border-radius:var(--v3-radius);background:var(--v3-surface)}',
    '.v3-stamps{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.v3-stamp{aspect-ratio:1/1;border-radius:50%;border:2px solid var(--v3-brand)}.v3-stamp-on{background:var(--v3-brand)}.v3-stamps-tx{margin:12px 0;font-weight:600}',
  ].join('');
  var BASE_CSS = [
    '*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}',
    'body{margin:0;background:var(--v3-bg);color:var(--v3-text);font-family:var(--v3-font-body);font-size:16px;line-height:1.55;overflow-x:hidden}',
    'img{max-width:100%;height:auto;display:block}a{color:inherit}.v3-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.v3-skip{position:absolute;left:-9999px}.v3-skip:focus{left:12px;top:12px;z-index:10;background:var(--v3-bg);padding:8px 12px}',
    '.v3-wrap{width:100%;max-width:1200px;margin:0 auto;padding:0 20px}',
    '.v3-ic{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}',
    // header + navigation (mobile: <details> menu, no script)
    '.v3-header{position:sticky;top:0;z-index:5;background:var(--v3-dark);color:var(--v3-hero-text)}',
    '.v3-header .v3-wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px}',
    '.v3-brandmark{display:flex;align-items:center;gap:10px;text-decoration:none;font-family:var(--v3-font-head);font-weight:700;font-size:20px}.v3-brandmark img{max-height:40px;width:auto}',
    '.v3-nav{display:none;gap:22px}.v3-nav a{text-decoration:none;font-size:14px;font-weight:600;opacity:.9}.v3-nav a:hover{opacity:1;color:var(--v3-brand)}',
    '.v3-menu summary{list-style:none;cursor:pointer;padding:8px}.v3-menu summary::-webkit-details-marker{display:none}.v3-menu summary .v3-ic{width:24px;height:24px}',
    '.v3-menu[open] .v3-menu-panel{position:absolute;left:0;right:0;top:100%;background:var(--v3-dark);padding:8px 20px 16px;display:flex;flex-direction:column}',
    '.v3-menu-panel a{padding:10px 0;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1)}',
    // hero
    '.v3-hero{position:relative;overflow:hidden;background:var(--v3-dark);color:var(--v3-hero-text)}.v3-hero-in{position:relative;z-index:1;padding-top:56px;padding-bottom:56px}',
    '.v3-hero.v3-v-overlay .v3-hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.v3-hero-shade{position:absolute;inset:0;background:#000}',
    '.v3-hero.v3-v-simple{background:var(--v3-surface);color:var(--v3-text)}.v3-hero-media img{border-radius:var(--v3-radius);width:100%;object-fit:cover}',
    '.v3-al-center .v3-hero-text,.v3-al-center{text-align:center}.v3-al-center .v3-btns,.v3-al-center .v3-socials{justify-content:center}',
    '.v3-eyebrow{display:inline-block;margin:0 0 14px;padding:4px 10px;border-radius:4px;background:var(--v3-brand);color:var(--v3-on-brand);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}',
    '.v3-h1{margin:0 0 12px;font-family:var(--v3-font-head);font-size:clamp(32px,8vw,64px);line-height:1.05}.v3-lead{margin:0 0 22px;font-size:17px;opacity:.92;max-width:560px}',
    '.v3-al-center .v3-lead{margin-left:auto;margin-right:auto}',
    // buttons
    '.v3-btns{display:flex;flex-wrap:wrap;gap:12px}.v3-btn{display:inline-flex;align-items:center;gap:8px;min-height:46px;padding:12px 20px;border-radius:var(--v3-radius);font-weight:700;font-size:15px;text-decoration:none}',
    '.v3-btn-primary{background:var(--v3-brand);color:var(--v3-on-brand)}.v3-btn-outline{border:1.5px solid currentColor}',
    // sections
    '.v3-s{padding:40px 0}.v3-sp-compact{padding:24px 0}.v3-sp-roomy{padding:64px 0}.v3-bg-alt{background:var(--v3-surface)}.v3-bg-brand{background:var(--v3-brand);color:var(--v3-on-brand)}.v3-bg-dark{background:var(--v3-dark);color:var(--v3-hero-text)}',
    '.v3-h2{margin:0 0 8px;font-family:var(--v3-font-head);font-size:clamp(24px,5vw,36px);line-height:1.15}.v3-sub{margin:0 0 20px;color:var(--v3-muted)}.v3-bg-dark .v3-sub,.v3-bg-brand .v3-sub{color:inherit;opacity:.85}',
    '.v3-items{display:grid;gap:12px;margin-top:16px}.v3-items-buttons{display:flex;flex-wrap:wrap}.v3-items-cards{grid-template-columns:1fr 1fr}.v3-items-list{grid-template-columns:1fr}',
    '.v3-card-link{display:flex;align-items:center;gap:12px;padding:14px;border-radius:var(--v3-radius);background:var(--v3-bg);border:1px solid rgba(0,0,0,.08);text-decoration:none;color:var(--v3-text)}',
    '.v3-card-ic{display:flex;color:var(--v3-brand)}.v3-card-tx{display:flex;flex-direction:column;min-width:0;flex:1}.v3-card-tx small{color:var(--v3-muted);font-size:12px}.v3-chev{color:var(--v3-muted)}',
    '.v3-text-grid{display:grid;gap:24px;align-items:center}.v3-text-fig{margin:0}.v3-text-fig img{border-radius:var(--v3-radius);width:100%}.v3-body{margin:0;white-space:normal}',
    '.v3-hours{border-collapse:collapse;width:100%;max-width:520px;margin-top:12px}.v3-hours th,.v3-hours td{padding:10px 0;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;font-weight:500}.v3-hours td{text-align:right}.v3-closed td{color:var(--v3-muted)}.v3-note{color:var(--v3-muted);margin-top:12px}.v3-bg-dark .v3-closed td,.v3-openingHours.v3-bg-dark .v3-note{color:inherit;opacity:.85}.v3-bg-brand .v3-closed td,.v3-openingHours.v3-bg-brand .v3-note{color:inherit}.v3-bg-dark .v3-hours th,.v3-bg-dark .v3-hours td{border-bottom-color:rgba(255,255,255,.14)}',
    '.v3-contact{display:flex;flex-direction:column;gap:14px;margin-top:12px}.v3-ct-row{display:flex;gap:12px;align-items:flex-start}.v3-ct-row .v3-ic{color:var(--v3-brand);margin-top:2px}.v3-bg-brand .v3-ct-row .v3-ic{color:var(--v3-on-brand)}.v3-contact address{font-style:normal}.v3-contact .v3-btn{align-self:flex-start}',
    '.v3-socials{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}.v3-social{display:inline-flex;align-items:center;gap:8px;min-height:44px;min-width:44px;justify-content:center;padding:0 12px;border-radius:999px;background:var(--v3-surface);color:var(--v3-text);text-decoration:none;font-weight:600}',
    '.v3-social-mark{font-weight:800}',
    '.v3-footer{padding:28px 0;background:var(--v3-dark);color:var(--v3-hero-text);font-size:14px}.v3-footer .v3-wrap{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between}.v3-footer a{opacity:.85}',
    // tablet and up
    '@media (min-width:768px){.v3-nav{display:flex}.v3-menu{display:none}.v3-hero-in{padding-top:96px;padding-bottom:96px}.v3-items-cards{grid-template-columns:repeat(4,1fr)}',
    '.v3-items-list{grid-template-columns:1fr 1fr}.v3-hero.v3-v-split .v3-hero-in{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}',
    '.v3-v-image-left .v3-text-grid,.v3-v-image-right .v3-text-grid{grid-template-columns:1fr 1fr}.v3-s{padding:56px 0}.v3-sp-compact{padding:32px 0}.v3-sp-roomy{padding:88px 0}}',
    '@media (min-width:1200px){.v3-wrap{padding:0 32px}}',
  ].join('');

  // renderDesign(design, ctx, opts) -> { ok, html, errors, skipped, samples }
  // ctx: { businessName } (server-known facts only). The design is validated
  // here again, whatever the caller did before.
  // opts: { cloudName } for validation; { preview: true } only for the
  // Studio's preview frame: section ids for selection (data-v3-id), visible
  // empty sections, image placeholders and labelled samples for Deals /
  // Offers and Loyalty. Never use preview for a public page.
  function renderDesign(input, ctx, opts) {
    var v = validateDesign(input, opts);
    if (!v.ok) return { ok: false, html: '', errors: v.errors, skipped: [], samples: [] };
    var pv = !!(opts && opts.preview === true);
    var design = v.design, lang = design.settings.language, t = TEXT[lang];
    var businessName = ctx && typeof ctx.businessName === 'string' ? cleanStr(ctx.businessName, false).slice(0, 120) : '';
    var skipped = [], samples = [], used = {};
    var page = design.pages[0];
    var body = page.sections.map(function (s) {
      if (s.hidden) return '';
      var out;
      if (SECTIONS[s.type].rendered) out = RENDER[s.type](s, t, pv);
      else if (pv) { samples.push(s.type); out = SAMPLE[s.type](s, t); }
      else { skipped.push(s.type); return ''; }
      if (out) used[s.type] = true;
      return out;
    }).join('');
    var extraCss = (used.gallery ? GALLERY_CSS : '') + (used.products || used.dealsOffers ? PRODUCTS_CSS : '') + (pv ? PREVIEW_CSS : '');
    var h = design.header;
    var navLinks = h.nav.map(function (n) { return '<a' + linkAttrs(n.target) + '>' + esc(n.label) + '</a>'; }).join('');
    var brand = '<a class="v3-brandmark" href="#top">' + (h.logo ? '<img src="' + esc(h.logo) + '" alt="' + esc(h.logoAlt || businessName) + '">' : '') +
      (h.showBusinessName || !h.logo ? '<span>' + esc(businessName) + '</span>' : '') + '</a>';
    var header = '<header class="v3-header"' + (pv ? ' data-v3-part="header"' : '') + '><div class="v3-wrap">' + brand +
      (navLinks ? '<nav class="v3-nav" aria-label="' + esc(t.menu) + '">' + navLinks + '</nav><details class="v3-menu"><summary aria-label="' + esc(t.menu) + '">' + icon('menu') +
        '</summary><nav class="v3-menu-panel" aria-label="' + esc(t.menu) + '">' + navLinks + '</nav></details>' : '') + '</div></header>';
    var f = design.footer;
    var footer = '<footer class="v3-footer"' + (pv ? ' data-v3-part="footer"' : '') + '><div class="v3-wrap"><span>' + (f.text ? escMultiline(f.text) : '© ' + esc(businessName)) + '</span>' +
      (f.links.length ? '<span>' + f.links.map(function (l) { return '<a' + linkAttrs(l.target) + '>' + esc(l.label) + '</a>'; }).join(' · ') + '</span>' : '') + '</div></footer>';
    var title = design.settings.seo.title || businessName || 'QRAIVY';
    var head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + '</title>' +
      (design.settings.seo.description ? '<meta name="description" content="' + esc(design.settings.seo.description) + '">' : '') +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link rel="stylesheet" href="' + esc(FONT_PAIRS[design.theme.fontPair].href) + '"><style>' + css(design, extraCss) + '</style>';
    var html = '<!DOCTYPE html><html lang="' + lang + '"><head>' + head + '</head><body class="v3-page"><a class="v3-skip" href="#main">' + esc(t.skip) + '</a>' +
      '<div id="top"></div>' + header + '<main id="main">' + body + '</main>' + footer + '</body></html>';
    return { ok: true, html: html, errors: [], skipped: skipped, samples: samples };
  }

  // describe(): the editable schema as plain data (no functions), for
  // building the Studio inspector from the same rules the server enforces.
  // A fresh copy on every call.
  var SPEC_KEYS = ['t', 'max', 'min', 'required', 'multiline', 'values', 'def', 'kind', 'kindFrom'];
  function plainSpec(spec) {
    var out = {};
    SPEC_KEYS.forEach(function (k) {
      if (spec[k] !== undefined) out[k] = Array.isArray(spec[k]) ? spec[k].slice() : spec[k];
    });
    if (spec.fields) { out.fields = {}; Object.keys(spec.fields).forEach(function (k) { out.fields[k] = plainSpec(spec.fields[k]); }); }
    if (spec.item) out.item = plainSpec(spec.item);
    return out;
  }
  function describe() {
    var sections = {};
    SECTION_TYPES.forEach(function (type) {
      var d = SECTIONS[type];
      sections[type] = { label: d.label, description: d.description, category: d.category.slice(), variants: d.variants.slice(), rendered: d.rendered, data: plainSpec(d.data) };
    });
    var F = DESIGN.fields;
    return {
      schemaVersion: SCHEMA_VERSION,
      limits: { designChars: LIMITS.designChars, sections: LIMITS.sections, pages: 1 },
      design: { theme: plainSpec(F.theme), settings: plainSpec(F.settings), header: plainSpec(F.header), footer: plainSpec(F.footer) },
      section: {
        id: { t: 'id', pattern: '^s_[a-z0-9]{4,16}$', required: true },
        anchor: { t: 'anchor', pattern: '^[a-z0-9][a-z0-9-]{0,39}$', reserved: ['start', 'top'] },
        hidden: { t: 'bool', def: false },
        style: plainSpec(STYLE),
      },
      sections: sections,
      choices: { icons: ICONS.slice(), linkKinds: LINK_KINDS.slice(), fontPairs: Object.keys(FONT_PAIRS), radii: Object.keys(RADII), socialPlatforms: Object.keys(SOCIAL_HOSTS),
        days: DAYS.slice(), languages: ['de', 'en'], mapHosts: MAP_HOSTS.slice() },
      defaultPalette: Object.assign({}, DEFAULT_PALETTE),
    };
  }

  // The Studio's "Add Section" library (metadata only).
  function library() {
    return SECTION_TYPES.map(function (type) {
      var d = SECTIONS[type];
      return { type: type, label: d.label, description: d.description, category: d.category.slice(), variants: d.variants.slice(), rendered: d.rendered };
    });
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, LIMITS: LIMITS, SECTION_TYPES: SECTION_TYPES, ICONS: ICONS, LINK_KINDS: LINK_KINDS, FONT_PAIRS: Object.keys(FONT_PAIRS),
    SOCIAL_PLATFORMS: Object.keys(SOCIAL_HOSTS), DEFAULT_PALETTE: DEFAULT_PALETTE,
    validateDesign: validateDesign, renderDesign: renderDesign, library: library, describe: describe,
    _esc: esc,
  };
});
