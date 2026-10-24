/*
 * studio-demo-images.js — Landing Page Studio V3: the demo's starter photos,
 * shown from the Studio's own files (2A-3H).
 *
 * The demo Gallery uses three approved Deals starter images. The design
 * stores their real addresses in QRAIVY's Cloudinary account
 * (qraivy-deal-starters/<id>, uploaded 2026-10-16, byte-identical to the
 * files in images/deals/starter/; the address the Deals cards use), so it
 * passes the schema unchanged and would stay correct if it were saved.
 *
 * Inside the Studio only, the preview frames and the inspector show the
 * local copies instead, so the demo needs no request to Cloudinary. Only
 * these exact addresses are swapped, only in the HTML the Studio displays;
 * the design is never changed and core.js renders the real addresses.
 *
 * Every starter image is AI-generated: wherever one is shown, the label
 * "AI · KI-generiert" is shown with it (EU AI Act Art. 50; see
 * js/deal-starter-images.js).
 *
 * In Node: module.exports (for the tests). In the Studio:
 * window.QraivyStudioDemoImages.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyStudioDemoImages = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var CLOUD = 'dwqc6n7rn', FOLDER = 'qraivy-deal-starters', TRANSFORM = 'c_fill,g_auto,h_900,w_1200,f_auto,q_auto';
  var STARTERS = ['bakery-croissants-01', 'bakery-bread-01', 'bakery-coffee-01'];
  var LOCAL_DIR = 'images/deals/starter/';
  var AI_LABEL = 'AI · KI-generiert';

  // the address the design stores (as dealCards.js builds it for this account)
  function cloudinaryUrl(id) { return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/' + TRANSFORM + '/' + FOLDER + '/' + id + '.jpg'; }
  var LOCAL = {};
  STARTERS.forEach(function (id) { LOCAL[cloudinaryUrl(id)] = LOCAL_DIR + id + '.jpg'; });

  // the local copy of one of these addresses, or null for any other image
  function localSrc(url) { return Object.prototype.hasOwnProperty.call(LOCAL, url) ? LOCAL[url] : null; }
  // what the Studio shows for an image address: the local copy, or the address itself
  function displaySrc(url) { return localSrc(url) || url; }

  var BADGE_CSS = '<style>.st-ai{position:absolute;top:8px;left:8px;z-index:2;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;' +
    'font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.02em;pointer-events:none}:has(> .st-ai){position:relative}</style>';
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // The page HTML for the Studio's frames: each of these images gets its
  // local copy and the AI label right before it. Anything else is untouched.
  function localizeHtml(html) {
    if (typeof html !== 'string') return html;
    var hit = false;
    Object.keys(LOCAL).forEach(function (url) {
      var re = new RegExp('<img\\b([^>]*?) src="' + escRe(url) + '"', 'g');
      html = html.replace(re, function (m, before) { hit = true; return '<span class="st-ai">' + AI_LABEL + '</span><img' + before + ' src="' + LOCAL[url] + '"'; });
    });
    return hit ? html.replace('</head>', BADGE_CSS + '</head>') : html;
  }

  return { STARTERS: STARTERS.slice(), LOCAL_DIR: LOCAL_DIR, AI_LABEL: AI_LABEL, cloudinaryUrl: cloudinaryUrl, localSrc: localSrc, displaySrc: displaySrc, localizeHtml: localizeHtml };
});
