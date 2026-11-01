/*
 * onboarding-previews.js — Landing Page Studio V3 onboarding (Phase O0.1):
 * the real QRAIVY pages shown in the Step 1 cards' phones.
 *
 * Every preview is rendered by the shared js/lpV3/core.js (renderDesign,
 * preview mode), the same renderer as the Studio and the public page; this
 * file only chooses what to render:
 *   instagram, website  "Example" pages: sections of the Studio demo
 *                        (js/studio/studio-demo.js, placeholder content, the
 *                        three approved AI-generated starter photos). Nothing
 *                        is imported from anywhere.
 *   scratch              the page a new draft starts with: the starter Hero
 *                        (core.starter), as POST /studio/drafts creates it
 *                        (lpV3/studioDraftsController.js starterDesign), in
 *                        the wizard's language.
 * The HTML goes into frames sandboxed with no permissions (no scripts, no
 * origin); the photos become inline images with the "AI · KI-generiert"
 * label through js/studio/studio-demo-images.js (localize, passed in).
 * No request, no storage.
 *
 * In Node: module.exports (for the tests). In the browser:
 * window.QraivyOnboardingPreviews.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyOnboardingPreviews = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // the demo sections each example shows, in this order
  var EXAMPLES = {
    instagram: ['s_gal01', 's_social01', 's_hero01'],  // photos first, as on a profile
    website: ['s_hero01', 's_quick01', 's_hours01', 's_contact1'],
  };
  var SCRATCH_NAME = { en: 'Your business', de: 'Ihr Unternehmen' };

  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  // Links to a section that is not in the example ('/angebote' without the
  // Deals section) point to the page start instead, so the example stays a
  // valid design (core.js refuses unknown internal targets).
  function relink(v, anchors) {
    if (Array.isArray(v)) return v.map(function (x) { return relink(x, anchors); });
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = relink(v[k], anchors); }); return o; }
    var m = typeof v === 'string' ? /^\/([a-z0-9][a-z0-9-]*)$/.exec(v) : null;
    return m && !anchors[m[1]] ? '/' : v;
  }

  // An example page: the demo design with only these sections
  function exampleDesign(demo, id) {
    var ids = EXAMPLES[id];
    if (!ids || !demo || !demo.design) return null;
    var d = copy(demo.design);
    var all = d.pages[0].sections;
    d.pages[0].sections = ids.map(function (sid) { return all.filter(function (s) { return s.id === sid; })[0]; }).filter(Boolean);
    var anchors = {};
    d.pages[0].sections.forEach(function (s) { anchors[s.id] = true; if (s.anchor) anchors[s.anchor] = true; });
    return relink(d, anchors);
  }
  // The new draft's page: the starter Hero with the business name, in the language
  function scratchDesign(V3, lang) {
    var l = lang === 'de' ? 'de' : 'en';
    var hero = V3.starter('hero', l);
    hero.data.headline = SCRATCH_NAME[l];
    return { schemaVersion: V3.SCHEMA_VERSION, settings: { language: l }, pages: [{ id: 'start', title: l === 'en' ? 'Home' : 'Start', sections: [Object.assign({ id: 's_start01' }, hero)] }] };
  }
  function render(V3, design, name, localize) {
    var r = design ? V3.renderDesign(design, { businessName: name }, { preview: true }) : null;
    if (!r || !r.ok) return '';
    return typeof localize === 'function' ? localize(r.html) : r.html;
  }
  // previews({ V3, demo, lang, localize }) -> { instagram, website, scratch } (page HTML, '' if invalid)
  function previews(o) {
    var l = o.lang === 'de' ? 'de' : 'en';
    var name = o.demo && o.demo.businessName;
    return {
      instagram: render(o.V3, exampleDesign(o.demo, 'instagram'), name, o.localize),
      website: render(o.V3, exampleDesign(o.demo, 'website'), name, o.localize),
      scratch: render(o.V3, scratchDesign(o.V3, l), SCRATCH_NAME[l], o.localize),
    };
  }

  return { EXAMPLES: EXAMPLES, SCRATCH_NAME: SCRATCH_NAME, exampleDesign: exampleDesign, scratchDesign: scratchDesign, previews: previews };
});
