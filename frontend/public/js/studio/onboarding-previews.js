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
 * Step 3's live phone (Phase O2): liveHtml adds FRAME_SCRIPT, fixed text with
 * no customer data, to a core.js page. The page is shown in a frame sandboxed
 * with "allow-scripts" only (never allow-same-origin: an opaque origin, no
 * access to the wizard, its storage or cookies), as the Studio's preview is.
 * The script blocks every click, form and link (nothing navigates), takes
 * the page's controls out of the keyboard order, reports the scroll position
 * and, on the wizard's message, restores it and scrolls to a section just
 * added or moved. acceptFrameMessage accepts exactly { type: 'scroll', y }.
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

  // ── Step 3's live phone ──
  var SECTION_ID = /^s_[a-z0-9]{4,16}$/;
  var MAX_SCROLL = 10000000;
  var FRAME_SCRIPT =
    '<style>html{scrollbar-width:none}html::-webkit-scrollbar{display:none}' +
    '[data-v3-id].ob-new{outline:3px solid #ff5a1f;outline-offset:-3px;transition:outline-color .6s ease}[data-v3-id].ob-new.ob-fade{outline-color:transparent}</style>' +
    '<script>(function(){' +
    'function stop(e){e.preventDefault();e.stopPropagation();}' +
    '["click","auxclick","dblclick","submit"].forEach(function(t){document.addEventListener(t,stop,true);});' +
    'var all=document.querySelectorAll("a,button,input,select,textarea,summary,iframe,[tabindex]");for(var i=0;i<all.length;i++)all[i].setAttribute("tabindex","-1");' +
    'var t=null;addEventListener("scroll",function(){if(t)return;t=setTimeout(function(){t=null;parent.postMessage({type:"scroll",y:Math.round(scrollY)},"*");},120);},{passive:true});' +
    'function reveal(id){var s=document.querySelectorAll("[data-v3-id]");for(var i=0;i<s.length;i++){if(s[i].getAttribute("data-v3-id")!==id)continue;var n=s[i];' +
    // reduced motion (O2.1): straight there, no smooth scroll
    'var still=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;' +
    'scrollTo({top:Math.max(0,n.getBoundingClientRect().top+scrollY-56),behavior:still?"instant":"smooth"});n.classList.add("ob-new");' +
    'setTimeout(function(){n.classList.add("ob-fade");},1400);setTimeout(function(){n.classList.remove("ob-new","ob-fade");},2100);return;}}' +
    'addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data;if(!d||typeof d!=="object"||d.type!=="init")return;' +
    'if(typeof d.y==="number")scrollTo({top:d.y,behavior:"instant"});' +
    'if(typeof d.reveal==="string"&&/^s_[a-z0-9]{4,16}$/.test(d.reveal))reveal(d.reveal);});' +
    '})();</script>';
  // the core.js page plus FRAME_SCRIPT, just before </body> ('' for anything else)
  function liveHtml(html) {
    if (typeof html !== 'string' || !/<\/body><\/html>$/.test(html)) return '';
    return html.slice(0, html.length - '</body></html>'.length) + FRAME_SCRIPT + '</body></html>';
  }
  // a message from the live frame -> { type: 'scroll', y } or null (nothing else is accepted)
  function acceptFrameMessage(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.getPrototypeOf(d) !== Object.prototype) return null;
    if (d.type === 'scroll' && Object.keys(d).sort().join(',') === 'type,y' && typeof d.y === 'number' && isFinite(d.y) && Math.floor(d.y) === d.y && d.y >= 0 && d.y <= MAX_SCROLL) return { type: 'scroll', y: d.y };
    return null;
  }
  // the message the wizard sends after each render: the scroll position, and the section to reveal (or none)
  function initMessage(y, revealId) {
    return { type: 'init', y: typeof y === 'number' && isFinite(y) && y >= 0 ? Math.min(Math.floor(y), MAX_SCROLL) : 0, reveal: typeof revealId === 'string' && SECTION_ID.test(revealId) ? revealId : null };
  }

  return { EXAMPLES: EXAMPLES, SCRATCH_NAME: SCRATCH_NAME, exampleDesign: exampleDesign, scratchDesign: scratchDesign, previews: previews,
    FRAME_SCRIPT: FRAME_SCRIPT, liveHtml: liveHtml, acceptFrameMessage: acceptFrameMessage, initMessage: initMessage };
});
