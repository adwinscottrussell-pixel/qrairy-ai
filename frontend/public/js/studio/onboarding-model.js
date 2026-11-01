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
  // The page the answers make (not yet checked): the Hero, then Social Media when there are links
  function buildDesign(V3, values, language) {
    var l = lang(language);
    var sections = [hero(V3, l, values.name || PLACEHOLDER_NAME[l], values.description || '')];
    if (values.links && values.links.length) sections.push(social(V3, l, values.links));
    return { schemaVersion: V3.SCHEMA_VERSION, settings: { language: l }, pages: [{ id: 'start', title: l === 'en' ? 'Home' : 'Start', sections: sections }] };
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

  // The answers as kept between steps and across a reload (no token, nothing else)
  function sanitize(a) {
    a = a && typeof a === 'object' ? a : {};
    return {
      name: str(a.name).slice(0, 400),
      description: str(a.description).slice(0, 1500),
      links: (Array.isArray(a.links) ? a.links : []).slice(0, LIMITS.links).map(function (r) {
        return { platform: PLATFORMS.indexOf(r && r.platform) !== -1 ? r.platform : PLATFORMS[0], url: str(r && r.url).slice(0, 500) };
      }),
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
    buildDesign: buildDesign, linkError: linkError, check: check, sanitize: sanitize, nextPlatform: nextPlatform };
});
