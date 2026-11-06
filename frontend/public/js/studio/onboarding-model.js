/*
 * onboarding-model.js — Landing Page Studio V3 onboarding (Phase O1): Step 2
 * (Business information), the pure part.
 *
 * It cleans up the answers (business name, description, social media links),
 * checks them and builds the page they make: the starter Hero (core.starter)
 * with the name as the headline and the description as the sub-headline, plus
 * the Social Media section when there are links. The final check is
 * core.validateDesign, the same rules as the server; its errors are mapped
 * back to the fields. A link is checked by core.js too (its own platform
 * domains), so nothing here repeats those rules.
 *
 * Limits: the name as POST /studio/drafts allows it (80 characters, control
 * characters removed, spaces collapsed: lpV3/studioDraftsController.js), the
 * description as the Hero sub-headline (300), at most 8 links (the Social
 * Media section).
 *
 * Step 3 (Phase O2): the sections the page starts with. The eight types the
 * public page renders, each at most once, the Hero always first; the Hero and
 * Social Media come from Step 2, the others are core.js's own starters (empty,
 * so they stay hidden on the public page until filled in the Studio; the Text
 * section starts empty too, so no placeholder text can be published). Social
 * Media follows Step 2's links until the customer adds or removes it.
 *
 * No request, no storage, no DOM. In Node: module.exports (for the tests).
 * In the browser: window.QraivyOnboardingModel.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyOnboardingModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIMITS = { name: 80, description: 300, links: 8 };
  // the eight platforms core.js supports (SOCIAL_PLATFORMS), in this order; brand names in both languages
  var PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'pinterest', 'whatsapp'];
  var LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X (Twitter)', pinterest: 'Pinterest', whatsapp: 'WhatsApp' };
  var EXAMPLES = { instagram: 'instagram.com/yourbusiness', facebook: 'facebook.com/yourbusiness', tiktok: 'tiktok.com/@yourbusiness', youtube: 'youtube.com/@yourbusiness',
    linkedin: 'linkedin.com/company/yourbusiness', x: 'x.com/yourbusiness', pinterest: 'pinterest.com/yourbusiness', whatsapp: 'wa.me/491701234567' };
  var PLACEHOLDER_NAME = { en: 'Your business', de: 'Ihr Unternehmen' };
  // the draft endpoint's set (studioDraftsController.js CONTROL), and the line breaks a one-line field may not keep
  var CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

  function lang(l) { return l === 'de' ? 'de' : 'en'; }
  function chars(s) { return Array.from(s).length; }
  function str(v) { return typeof v === 'string' ? v : ''; }

  function cleanName(v) { return str(v).replace(/[\r\n\t]/g, ' ').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim(); }
  function cleanDescription(v) {
    return str(v).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(CONTROL, '').replace(/[ ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // "instagram.com/name" -> "https://instagram.com/name"; anything with a scheme (http:, javascript:, ...) stays as it is and fails the check
  function normalizeUrl(v) {
    var s = str(v).replace(CONTROL, '').trim();
    if (!s) return '';
    if (/^\/\//.test(s)) return 'https:' + s;
    return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
  }

  // Step 3: the eight section types, in the order "Add more" lists them; fixed ids (core.js: s_ + 4-16 of a-z0-9)
  var SECTION_TYPES = ['hero', 'buttons', 'socialMedia', 'contact', 'openingHours', 'products', 'gallery', 'text'];
  var SECTION_IDS = { hero: 's_obhero01', buttons: 's_obbuttons1', socialMedia: 's_obsocial1', contact: 's_obcontact1',
    openingHours: 's_obhours01', products: 's_obproducts1', gallery: 's_obgallery1', text: 's_obtext01' };
  var DEFAULT_SECTIONS = ['hero', 'buttons', 'openingHours', 'contact'];   // plus Social Media when Step 2 has links
  // Custom Sections (repeatable): each one an entry "custom:" + 8 of a-z0-9 in the section list, kept as made (its stable
  // instance id); on the page an empty core.js Text section with the id "s_c" + those 8 characters. Empty, so nothing is
  // invented and nothing shows on a public page until filled in the Studio. At most MAX_CUSTOM.
  var CUSTOM_RE = /^custom:([a-z0-9]{8})$/, MAX_CUSTOM = 10;
  function isCustom(entry) { return typeof entry === 'string' && CUSTOM_RE.test(entry); }
  function sectionId(entry) { var m = typeof entry === 'string' && CUSTOM_RE.exec(entry); return m ? 's_c' + m[1] : SECTION_IDS[entry]; }
  // a new entry not in the list yet (rand: () -> [0, 1), default Math.random; the browser passes crypto-based)
  function newCustom(list, rand) {
    var r = typeof rand === 'function' ? rand : Math.random, have = Array.isArray(list) ? list : [];
    for (var tries = 0; tries < 50; tries++) {
      var s = '';
      for (var i = 0; i < 8; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(r() * 36) % 36);
      if (have.indexOf('custom:' + s) === -1) return 'custom:' + s;
    }
    return null;
  }
  var SOCIAL_MODES = ['auto', 'added', 'removed'];

  function hero(V3, l, name, description) {
    var h = V3.starter('hero', l);
    h.data.headline = name;
    h.data.subheadline = description;
    return Object.assign({ id: 's_obhero01' }, h);
  }
  function social(V3, l, links) {
    var s = V3.starter('socialMedia', l);
    s.data.links = links.map(function (x) { return { platform: x.platform, url: x.url }; });
    return Object.assign({ id: 's_obsocial1' }, s);
  }
  // a Step 3 section: the Hero and Social Media from Step 2, the Text section empty, the others core.js's starter
  function section(V3, l, type, values) {
    if (type === 'hero') return hero(V3, l, values.name || PLACEHOLDER_NAME[l], values.description || '');
    if (type === 'socialMedia') return social(V3, l, values.links || []);
    if (isCustom(type)) return customSection(V3, l, type);
    var s = V3.starter(type, l);
    if (type === 'text') s.data = { heading: '', body: '' };
    return Object.assign({ id: SECTION_IDS[type] }, s);
  }
  // a Custom Section: core.js's Text starter, emptied (no heading, no text), with its instance id
  function customSection(V3, l, entry) {
    var s = V3.starter('text', l);
    s.data = { heading: '', body: '' };
    return Object.assign({ id: sectionId(entry) }, s);
  }
  // The page the answers make (not yet checked). Without a section list (Step 2): the Hero, then Social
  // Media when there are links. With one (Step 3): those sections, in that order.
  function buildDesign(V3, values, language, types) {
    var l = lang(language);
    var sections;
    if (Array.isArray(types)) sections = types.map(function (t) { return section(V3, l, t, values); });
    else {
      sections = [hero(V3, l, values.name || PLACEHOLDER_NAME[l], values.description || '')];
      if (values.links && values.links.length) sections.push(social(V3, l, values.links));
    }
    return { schemaVersion: V3.SCHEMA_VERSION, settings: { language: l }, pages: [{ id: 'start', title: l === 'en' ? 'Home' : 'Start', sections: sections }] };
  }

  // A kept section list, cleaned: known types each once, Custom Sections (each instance once, at most MAX_CUSTOM),
  // the Hero first (null: not chosen yet, the defaults apply)
  function cleanSections(list) {
    if (!Array.isArray(list)) return null;
    var out = ['hero'], customs = 0;
    list.forEach(function (t) {
      if (out.indexOf(t) !== -1) return;
      if (SECTION_TYPES.indexOf(t) !== -1) out.push(t);
      else if (isCustom(t) && customs < MAX_CUSTOM) { out.push(t); customs++; }
    });
    return out;
  }
  // The sections the page has now: the customer's list (or the defaults: the chosen template's suggested
  // sections when given (T1c), else DEFAULT_SECTIONS), with Social Media following Step 2's links while its
  // mode is 'auto' (kept at its place when there are links, left out without, for every template);
  // 'added' keeps it even without links, 'removed' leaves it out. A list the customer made is never
  // replaced by a template's (only the Hero, always first, is added to it).
  function sectionsFor(answers, hasLinks, defaults) {
    var a = answers || {};
    var list = cleanSections(a.sections) || cleanSections(defaults) || DEFAULT_SECTIONS.slice();
    var mode = SOCIAL_MODES.indexOf(a.social) !== -1 ? a.social : 'auto';
    var has = list.indexOf('socialMedia') !== -1;
    if (mode === 'removed' || (mode === 'auto' && !hasLinks)) return list.filter(function (t) { return t !== 'socialMedia'; });
    if (!has) list.push('socialMedia');
    return list;
  }

  // checkPage(V3, answers, language[, T]) -> Step 2's check plus { sections, page }: the full page with the sections,
  // checked by core.validateDesign (page: its normalized copy when valid, else null). With the template catalog
  // (T, onboarding-templates.js) and a chosen template (T1c): the template's page (pageFor), plus composed.
  function checkPage(V3, answers, language, T) {
    var p = T ? pageFor(V3, T, answers, language) : null;
    if (p) {
      var c = p.check;
      c.sections = p.sections;
      c.page = p.ok ? p.design : null;
      c.pageOk = !!c.page;
      c.composed = p;
      return c;
    }
    var r = check(V3, answers, language);
    var types = sectionsFor(answers, r.values.links.length > 0);
    var v = V3.validateDesign(buildDesign(V3, r.values, language, types));
    r.sections = types;
    r.page = r.ok && v.ok ? v.design : null;
    r.pageOk = !!r.page;
    return r;
  }

  // pageFor(V3, T, answers, language[, opts]) -> the chosen template's page for Steps 3, 4 and 5 (T1c), or null
  // without a known template: { ok, check, name, sections, design, draft, palette, exampleIds, emptyIds, demoOnly,
  // customerPaths, samplePaths, errors }.
  //   sections  sectionsFor() with the template's suggested list as the default (the customer's own list kept)
  //   design    the preview page (T.sample: example content where the customer has none), checked by core.js
  //   draft     the same page without the example-only parts (T.starter), what a draft may hold later; null when invalid
  //   exampleIds the sections holding example-only content (the Hero excluded: it carries the customer's name)
  //   emptyIds  sections without content yet (no example here, or Social Media without the customer's links)
  // The customer's name, description and links (Step 2: the valid ones; the name as typed, else the placeholder,
  // while it is still invalid) always replace the examples. opts.imageUrl: the photo addresses (default: the catalog's).
  function pageFor(V3, T, answers, language, opts) {
    var a = answers || {};
    var tpl = T && a.template ? T.get(a.template) : null;
    if (!tpl) return null;
    var l = lang(language), r = check(V3, a, l);
    var name = r.values.name || cleanName(a.name) || PLACEHOLDER_NAME[l];
    var types = sectionsFor(a, r.values.links.length > 0, tpl.sections);
    var o = { lang: l, palette: a.palette, name: name, description: r.values.description, links: r.values.links, sections: types,
      emptyFallback: true, exampleProfiles: false };
    if (opts && typeof opts.imageUrl === 'function') o.imageUrl = opts.imageUrl;
    var s = T.sample(V3, tpl.id, o);
    if (!s.ok) { o.links = []; s = T.sample(V3, tpl.id, o); }   // a name the schema refuses: the page without the links, Next blocked by check()
    var d = s.ok ? T.starter(V3, tpl.id, o) : null;
    var examples = [];
    if (s.ok) {
      var secs = s.design.pages[0].sections;
      s.demoOnly.forEach(function (p) {
        var m = /^pages\[0\]\.sections\[(\d+)\]\./.exec(p), sec = m && secs[Number(m[1])];
        if (sec && sec.type !== 'hero' && examples.indexOf(sec.id) === -1) examples.push(sec.id);
      });
    }
    return { ok: r.ok && s.ok, check: r, name: name, sections: types, design: s.ok ? s.design : null, draft: d && d.ok ? d.design : null,
      palette: s.palette, exampleIds: examples, emptyIds: s.emptySections || [], demoOnly: s.demoOnly, customerPaths: s.customerPaths,
      samplePaths: s.samplePaths, errors: s.errors };
  }

  // suggestedSections(V3, T, answers, language) -> the chosen template's suggested list as the page would have it
  // with an untouched list (Social Media following Step 2's links), or null without a known template (T1c.4)
  function suggestedSections(V3, T, answers, language) {
    var a = answers || {}, tpl = T && a.template ? T.get(a.template) : null;
    if (!tpl) return null;
    return sectionsFor({ social: 'auto' }, check(V3, a, lang(language)).values.links.length > 0, tpl.sections);
  }

  // One link, by core.js's own rules: null when valid, else an error code
  function linkError(V3, platform, url) {
    if (PLATFORMS.indexOf(platform) === -1) return 'link_platform';
    var v = V3.validateDesign(buildDesign(V3, { name: 'x', description: '', links: [{ platform: platform, url: url }] }, 'en'));
    return v.ok ? null : 'link_invalid';
  }

  // check(V3, { name, description, links: [{ platform, url }] }, language) ->
  //   { ok, values: { name, description, links }, errors: { name?, description?, links: { rowIndex: code } }, design }
  // values hold only the valid parts (links: valid, non-empty rows, each with its row index);
  // design: the checked page (core.validateDesign's normalized copy) when ok, else null.
  function check(V3, answers, language) {
    var a = answers || {};
    var errors = { links: {} };
    var name = cleanName(a.name);
    if (!name) errors.name = 'name_required';
    else if (chars(name) > LIMITS.name) errors.name = 'name_too_long';
    var description = cleanDescription(a.description);
    if (chars(description) > LIMITS.description) errors.description = 'description_too_long';
    var links = [];
    (Array.isArray(a.links) ? a.links : []).forEach(function (row, i) {
      var url = normalizeUrl(row && row.url);
      if (!url) return;                                   // empty rows are ignored
      if (i >= LIMITS.links) { errors.links[i] = 'links_too_many'; return; }
      var e = linkError(V3, row.platform, url);
      if (e) errors.links[i] = e; else links.push({ platform: row.platform, url: url, row: i });
    });
    var values = { name: errors.name ? '' : name, description: errors.description ? '' : description, links: links };
    var bad = !!(errors.name || errors.description || Object.keys(errors.links).length);
    var design = null;
    if (!bad) {
      var v = V3.validateDesign(buildDesign(V3, values, language));
      if (v.ok) design = v.design;
      else v.errors.forEach(function (e) { mapError(e, errors, links); });
      bad = !v.ok;
    }
    return { ok: !bad, values: values, errors: errors, design: design };
  }
  // a validateDesign error -> the field it belongs to (anything else: on the name, so Next stays blocked)
  function mapError(e, errors, links) {
    var p = String(e.path || '');
    var m = /sections\[1\]\.data\.links\[(\d+)\]/.exec(p);
    if (m && links[Number(m[1])]) errors.links[links[Number(m[1])].row] = 'link_invalid';
    else if (/\.subheadline$/.test(p)) errors.description = 'description_too_long';
    else errors.name = errors.name || (e.code === 'too_long' ? 'name_too_long' : 'name_invalid');
  }

  // A starter template's or palette's id as kept (onboarding-templates.js checks that it exists), or null
  var CHOICE_ID = /^[a-z][a-z0-9-]{0,31}$/;
  function choiceId(v) { return typeof v === 'string' && CHOICE_ID.test(v) ? v : null; }

  // The answers as kept between steps and across a reload (no token, nothing else).
  // sections: null until the customer changes the sections step (then the ordered list); social: Social
  // Media's mode; template / palette (T1b, "Choose Your Design"): the chosen starter template and palette, or null.
  function sanitize(a) {
    a = a && typeof a === 'object' ? a : {};
    return {
      template: choiceId(a.template),
      palette: choiceId(a.palette),
      name: str(a.name).slice(0, 400),
      description: str(a.description).slice(0, 1500),
      links: (Array.isArray(a.links) ? a.links : []).slice(0, LIMITS.links).map(function (r) {
        return { platform: PLATFORMS.indexOf(r && r.platform) !== -1 ? r.platform : PLATFORMS[0], url: str(r && r.url).slice(0, 500) };
      }),
      sections: cleanSections(a.sections),
      social: SOCIAL_MODES.indexOf(a.social) !== -1 ? a.social : 'auto',
    };
  }
  // the platform a new row starts with: the first one not used yet
  function nextPlatform(links) {
    var used = (links || []).map(function (r) { return r.platform; });
    for (var i = 0; i < PLATFORMS.length; i++) if (used.indexOf(PLATFORMS[i]) === -1) return PLATFORMS[i];
    return PLATFORMS[0];
  }

  return { LIMITS: LIMITS, PLATFORMS: PLATFORMS, LABELS: LABELS, EXAMPLES: EXAMPLES, PLACEHOLDER_NAME: PLACEHOLDER_NAME,
    chars: chars, cleanName: cleanName, cleanDescription: cleanDescription, normalizeUrl: normalizeUrl,
    buildDesign: buildDesign, linkError: linkError, check: check, sanitize: sanitize, nextPlatform: nextPlatform,
    SECTION_TYPES: SECTION_TYPES, SECTION_IDS: SECTION_IDS, DEFAULT_SECTIONS: DEFAULT_SECTIONS, cleanSections: cleanSections,
    MAX_CUSTOM: MAX_CUSTOM, isCustom: isCustom, sectionId: sectionId, newCustom: newCustom, suggestedSections: suggestedSections, sectionsFor: sectionsFor, checkPage: checkPage, pageFor: pageFor };
});
