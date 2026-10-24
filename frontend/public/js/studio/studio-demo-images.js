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
 * Inside the Studio only, the demo needs no request to Cloudinary:
 * - the inspector thumbnails (in the Studio page) show the local copies;
 * - the preview frames get them as inline images. The frames are sandboxed
 *   (no origin of their own), so the browser sends their requests as
 *   cross-site and the private preview's sign-in cookie (Vercel
 *   Authentication) does not go with them: a file path would come back as
 *   the login redirect. prepare() therefore loads the photos once in the
 *   Studio page, where the cookie is sent, shrinks them to 800 x 600 JPEG
 *   and keeps them as data: URLs. Until they are ready, or if one cannot be
 *   loaded, the frame shows a neutral placeholder instead (no request, no
 *   broken image).
 * Only these exact addresses are swapped, only in the HTML the Studio
 * displays; the design is never changed and core.js renders the real
 * addresses.
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
  var SIZE = { width: 800, height: 600, quality: 0.8 };
  // shown in the frame until a photo is ready, or if it cannot be loaded
  var PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
    '<rect width="800" height="600" fill="#e9e9ec"/><g fill="none" stroke="#9a9aa2" stroke-width="12" stroke-linejoin="round"><rect x="330" y="240" width="140" height="110" rx="10"/>' +
    '<path d="M342 338l40-44 30 30 22-22 30 36"/></g><circle cx="438" cy="270" r="11" fill="#9a9aa2"/></svg>');

  // the address the design stores (as dealCards.js builds it for this account)
  function cloudinaryUrl(id) { return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/' + TRANSFORM + '/' + FOLDER + '/' + id + '.jpg'; }
  var LOCAL = {}, INLINE = {};
  STARTERS.forEach(function (id) { LOCAL[cloudinaryUrl(id)] = LOCAL_DIR + id + '.jpg'; });
  var state = { started: false, done: 0, failed: 0 };

  // the local copy of one of these addresses, or null for any other image
  function localSrc(url) { return Object.prototype.hasOwnProperty.call(LOCAL, url) ? LOCAL[url] : null; }
  // what the Studio page shows for an image address: the local copy, or the address itself
  function displaySrc(url) { return localSrc(url) || url; }

  // The browser loader: the photo is loaded by the Studio page (same site,
  // so the sign-in cookie goes with it), drawn at 800 x 600 and returned as
  // a JPEG data: URL. An image element, not the fetch API; errors carry no details.
  function canvasLoader(src, done) {
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = SIZE.width; c.height = SIZE.height;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/jpeg', SIZE.quality);
        done(/^data:image\/jpeg;base64,/.test(data) ? data : null);
      } catch (e) { done(null); }
    };
    img.onerror = function () { done(null); };
    img.src = src;
  }
  // Prepares the inline photos once; onReady() runs when they are settled
  // and at least one is ready. loader(src, done(dataUrlOrNull)) is for tests.
  function prepare(onReady, loader) {
    if (state.started) return;
    state.started = true;
    var load = loader || canvasLoader;
    Object.keys(LOCAL).forEach(function (url) {
      load(LOCAL[url], function (data) {
        if (typeof data === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) INLINE[url] = data; else state.failed++;
        state.done++;
        if (state.done === STARTERS.length && state.failed < STARTERS.length && typeof onReady === 'function') onReady();
      });
    });
  }
  function status() { return { started: state.started, ready: Object.keys(INLINE).length, failed: state.failed }; }

  var BADGE_CSS = '<style>.st-ai{position:absolute;top:8px;left:8px;z-index:2;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;' +
    'font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.02em;pointer-events:none}:has(> .st-ai){position:relative}</style>';
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // The page HTML for the Studio's frames: each of these images becomes its
  // inline photo with the AI label right before it, or the placeholder (no
  // label) while it is not ready. Anything else is untouched.
  function localizeHtml(html) {
    if (typeof html !== 'string') return html;
    var label = false;
    Object.keys(LOCAL).forEach(function (url) {
      var re = new RegExp('<img\\b([^>]*?) src="' + escRe(url) + '"', 'g');
      html = html.replace(re, function (m, before) {
        if (!INLINE[url]) return '<img' + before + ' src="' + PLACEHOLDER + '" data-st-placeholder="1"';
        label = true;
        return '<span class="st-ai">' + AI_LABEL + '</span><img' + before + ' src="' + INLINE[url] + '"';
      });
    });
    return label ? html.replace('</head>', BADGE_CSS + '</head>') : html;
  }

  return { STARTERS: STARTERS.slice(), LOCAL_DIR: LOCAL_DIR, AI_LABEL: AI_LABEL, SIZE: SIZE, PLACEHOLDER: PLACEHOLDER,
    cloudinaryUrl: cloudinaryUrl, localSrc: localSrc, displaySrc: displaySrc, prepare: prepare, status: status, localizeHtml: localizeHtml };
});
