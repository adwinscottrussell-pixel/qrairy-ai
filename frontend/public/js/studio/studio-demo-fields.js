/*
 * studio-demo-fields.js — Landing Page Studio V3 (E3): which values of an
 * onboarding draft are still the template's example content.
 *
 * A draft saved by the onboarding (E2) holds the chosen template's example
 * content in its sections. The draft's origin (D2.1, read only: { source:
 * 'onboarding', template, language, ... }) names the template and language;
 * this file builds that template's example page (onboarding-templates.js
 * sample(), checked and normalized by core.js exactly as a saved draft is) and
 * compares the draft's values with it, field by field. Nothing is stored,
 * nothing is sent: the result only drives the Studio's "Example" marks.
 *
 * Rules (so real information is never marked):
 *   - only drafts whose origin is the onboarding's, with a known template and
 *     language; anything else (legacy pages, the sample page, older or unknown
 *     origins): no example values at all
 *   - a section is compared with the template's example of the same type (so
 *     a moved or duplicated section is still recognised); a value is an
 *     example only while it is exactly the example's (core.js's normalized
 *     form); an edited value is the customer's
 *   - the Hero headline (the customer's business name), Social Media links
 *     (only ever the customer's) and every section title (neutral headings)
 *     are never marked
 *   - list rows (buttons, products, gallery photos): a row counts as an
 *     example row only when one of its identifying values (label / name,
 *     description, photo) is an example's; then its fields equal to that
 *     example row are marked (a price is never marked on its own)
 *   - a link is an example while its row is and it stays on the page itself
 *     ("/" or a section of the page)
 *
 * exampleFields(section, catalog) -> paths as the inspector names its fields
 * ("data.subheadline", "data.items[0].name", "data.address.city", "data.days").
 * exampleMap(design, origin, T, V3) -> { sectionId: [paths] } (only sections
 * with at least one example value).
 *
 * No request, no storage, no DOM. In Node: module.exports (for the tests).
 * In the browser: window.QraivyStudioDemoFields.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyStudioDemoFields = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TYPES = ['hero', 'buttons', 'products', 'openingHours', 'contact', 'gallery', 'text'];
  var cache = {};

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function filled(v) { return typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : isObj(v) ? Object.keys(v).some(function (k) { return filled(v[k]); }) : v !== undefined && v !== null; }
  function onPage(target) { return typeof target === 'string' && /^\/([a-z0-9-]*)$/.test(target); }

  // The origin this file trusts: the onboarding's, with a known template and a language (else null)
  function originOf(origin, T) {
    if (!isObj(origin) || origin.source !== 'onboarding' || typeof origin.template !== 'string') return null;
    if (origin.language !== 'en' && origin.language !== 'de') return null;
    if (!T || typeof T.get !== 'function' || !T.get(origin.template)) return null;
    return { template: origin.template, language: origin.language };
  }

  // catalog(origin, T, V3) -> { type: example section data } for the origin's template and language (all its section
  // types, core.js's normalized form), or null. Built once per template and language.
  function catalog(origin, T, V3) {
    var o = originOf(origin, T);
    if (!o || !V3 || typeof V3.validateDesign !== 'function') return null;
    var key = o.template + ':' + o.language;
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    var s = T.sample(V3, o.template, { lang: o.language, sections: TYPES, exampleProfiles: false });
    var out = null;
    if (s && s.ok) {
      out = {};
      s.design.pages[0].sections.forEach(function (sec) { if (TYPES.indexOf(sec.type) !== -1) out[sec.type] = sec.data; });
    }
    cache[key] = out;
    return out;
  }

  // a list row against the example rows: the fields equal to the matching example row (anchored by an identifying value)
  function rowFields(item, examples, ids, fields, link) {
    if (!isObj(item) || !Array.isArray(examples)) return [];
    var best = null, score = 0;
    examples.forEach(function (ex) {
      if (!ids.some(function (k) { return filled(item[k]) && item[k] === ex[k]; })) return;
      var n = fields.filter(function (k) { return filled(item[k]) && item[k] === ex[k]; }).length;
      if (n > score) { score = n; best = ex; }
    });
    if (!best) return [];
    var out = fields.filter(function (k) { return filled(item[k]) && item[k] === best[k]; });
    if (link && onPage(item[link])) out.push(link);
    return out;
  }

  function exampleFields(sec, cat) {
    if (!isObj(sec) || !isObj(sec.data) || !cat || !isObj(cat[sec.type])) return [];
    var d = sec.data, ex = cat[sec.type], out = [];
    var eq = function (k) { if (filled(d[k]) && same(d[k], ex[k])) out.push('data.' + k); };
    var rows = function (k, ids, fields, link) {
      (Array.isArray(d[k]) ? d[k] : []).forEach(function (item, i) {
        rowFields(item, ex[k], ids, fields, link).forEach(function (f) { out.push('data.' + k + '[' + i + '].' + f); });
      });
    };
    if (sec.type === 'hero') {
      ['eyebrow', 'subheadline', 'backgroundImage', 'imageAlt'].forEach(eq);
      ['primary', 'secondary'].forEach(function (k) {
        var b = d[k];
        if (!isObj(b) || !filled(b.text)) return;
        var hit = ['primary', 'secondary'].filter(function (e) { return isObj(ex[e]) && ex[e].text === b.text; })[0];
        if (!hit) return;
        out.push('data.' + k + '.text');
        if (onPage(b.target)) out.push('data.' + k + '.target');
      });
    } else if (sec.type === 'buttons') rows('items', ['label', 'subtitle'], ['label', 'subtitle'], 'target');
    else if (sec.type === 'products') rows('items', ['name', 'description', 'image'], ['name', 'description', 'price', 'image']);
    else if (sec.type === 'gallery') rows('images', ['image', 'alt'], ['image', 'alt', 'caption']);
    else if (sec.type === 'openingHours') { eq('days'); eq('note'); }
    else if (sec.type === 'contact') {
      if (isObj(d.address) && isObj(ex.address)) ['line1', 'line2', 'postalCode', 'city'].forEach(function (k) { if (filled(d.address[k]) && d.address[k] === ex.address[k]) out.push('data.address.' + k); });
      eq('email');
    } else if (sec.type === 'text') { eq('heading'); eq('body'); }
    return out;
  }

  function exampleMap(design, origin, T, V3) {
    var cat = catalog(origin, T, V3), out = {};
    if (!cat || !isObj(design) || !Array.isArray(design.pages) || !design.pages[0] || !Array.isArray(design.pages[0].sections)) return out;
    design.pages[0].sections.forEach(function (sec) {
      var f = exampleFields(sec, cat);
      if (f.length && sec && typeof sec.id === 'string') out[sec.id] = f;
    });
    return out;
  }

  return { TYPES: TYPES.slice(), originOf: originOf, catalog: catalog, exampleFields: exampleFields, exampleMap: exampleMap };
});
