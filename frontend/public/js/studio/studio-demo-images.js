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
 *   Studio page, where the cookie is sent, shrinks them to at most 800 px
 *   wide (JPEG, the photo's own proportions) and keeps them as data: URLs.
 *   Until they are ready, or if one cannot be loaded, the frame shows a
 *   neutral placeholder of the same proportions instead (no request, no
 *   broken image).
 * Only these exact addresses are swapped, only in the HTML the Studio
 * displays; the design is never changed and core.js renders the real
 * addresses.
 *
 * T1a: the onboarding starter templates' photos (onboarding-templates.js)
 * are known too: the twelve Deals starters they use and the two Studio
 * starter heroes (images/studio/starter/, portrait 1122 x 1402; their
 * intended address in qraivy-studio-starters, not uploaded yet).
 * prepareImages(urls) loads just the ones asked for (the selected
 * template's), each once; prepare() still loads the demo's three.
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
  var STUDIO_FOLDER = 'qraivy-studio-starters', STUDIO_TRANSFORM = 'c_limit,w_1200,f_auto,q_auto';
  var STARTERS = ['bakery-croissants-01', 'bakery-bread-01', 'bakery-coffee-01'];
  var LOCAL_DIR = 'images/deals/starter/', STUDIO_LOCAL_DIR = 'images/studio/starter/';
  // T1a: every photo the onboarding starter templates use, with its file's size (the Deals starters
  // are 1200 x 900, the Studio heroes 1122 x 1402); the same ids as onboarding-templates.js (checked by the tests)
  var TEMPLATE_IMAGES = ['restaurant-table-01', 'restaurant-fresh-01', 'restaurant-meal-01', 'bakery-croissants-01', 'bakery-bread-01', 'bakery-coffee-01',
    'beauty-salon-01', 'beauty-skincare-01', 'beauty-spa-01', 'fashion-boutique-01', 'fashion-rack-01', 'fashion-lifestyle-01']
    .map(function (id) { return { id: id, studio: false, width: 1200, height: 900 }; })
    .concat([{ id: 'QRAIVY-Creator-Hero', studio: true, width: 1122, height: 1402 }, { id: 'QRAIVY-Professional-Services-Hero', studio: true, width: 1122, height: 1402 }]);
  var AI_LABEL = 'AI · KI-generiert';
  // the inline copies: at most this wide, the photo's own proportions
  var SIZE = { width: 800, height: 600, quality: 0.8 };
  // shown in the frame until a photo is ready, or if it cannot be loaded (4:3; placeholder() for other proportions)
  var PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
    '<rect width="800" height="600" fill="#e9e9ec"/><g fill="none" stroke="#9a9aa2" stroke-width="12" stroke-linejoin="round"><rect x="330" y="240" width="140" height="110" rx="10"/>' +
    '<path d="M342 338l40-44 30 30 22-22 30 36"/></g><circle cx="438" cy="270" r="11" fill="#9a9aa2"/></svg>');

  // the address the design stores (as dealCards.js builds it for this account)
  function cloudinaryUrl(id) { return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/' + TRANSFORM + '/' + FOLDER + '/' + id + '.jpg'; }
  // a Studio starter's intended address (onboarding-templates.js imageUrl; the proportions kept)
  function studioUrl(id) { return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/' + STUDIO_TRANSFORM + '/' + STUDIO_FOLDER + '/' + id + '.jpg'; }

  // fit(width, height) -> the inline copy's size: at most SIZE.width wide, the same proportions
  function fit(width, height) {
    var w = Math.min(SIZE.width, Math.round(width)), h = Math.round(height * w / width);
    return { width: w, height: h };
  }
  // the placeholder for a photo of these proportions (the 4:3 one is PLACEHOLDER itself)
  function placeholder(width, height) {
    var s = fit(width, height);
    if (s.width === 800 && s.height === 600) return PLACEHOLDER;
    var dy = Math.round((s.height - 600) / 2);
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + s.width + '" height="' + s.height + '" viewBox="0 0 ' + s.width + ' ' + s.height + '">' +
      '<rect width="' + s.width + '" height="' + s.height + '" fill="#e9e9ec"/><g transform="translate(' + Math.round((s.width - 800) / 2) + ' ' + dy + ')"><g fill="none" stroke="#9a9aa2" stroke-width="12" stroke-linejoin="round">' +
      '<rect x="330" y="240" width="140" height="110" rx="10"/><path d="M342 338l40-44 30 30 22-22 30 36"/></g><circle cx="438" cy="270" r="11" fill="#9a9aa2"/></g></svg>');
  }

  // address -> { local, width, height }: the demo's three and the templates' photos
  var KNOWN = {}, INLINE = {}, FAILED = {}, ASKED = {};
  TEMPLATE_IMAGES.forEach(function (i) {
    KNOWN[i.studio ? studioUrl(i.id) : cloudinaryUrl(i.id)] = { local: (i.studio ? STUDIO_LOCAL_DIR : LOCAL_DIR) + i.id + '.jpg', width: i.width, height: i.height };
  });
  var state = { started: false };
  function known(url) { return Object.prototype.hasOwnProperty.call(KNOWN, url); }

  // the local copy of one of these addresses, or null for any other image
  function localSrc(url) { return known(url) ? KNOWN[url].local : null; }
  // what the Studio page shows for an image address: the local copy, or the address itself
  function displaySrc(url) { return localSrc(url) || url; }
  // the template photos' addresses, for a list of ids (unknown ids left out)
  function templateUrls(ids) {
    return (Array.isArray(ids) ? ids : []).map(function (id) {
      var i = TEMPLATE_IMAGES.filter(function (x) { return x.id === id; })[0];
      return i ? (i.studio ? studioUrl(i.id) : cloudinaryUrl(i.id)) : null;
    }).filter(Boolean);
  }

  // The browser loader: the photo is loaded by the Studio page (same site,
  // so the sign-in cookie goes with it), drawn at most 800 px wide in its own
  // proportions and returned as a JPEG data: URL. An image element, not the
  // fetch API; errors carry no details.
  function canvasLoader(src, done) {
    var img = new Image();
    img.onload = function () {
      try {
        var s = fit(img.naturalWidth, img.naturalHeight);
        var c = document.createElement('canvas');
        c.width = s.width; c.height = s.height;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/jpeg', SIZE.quality);
        done(/^data:image\/jpeg;base64,/.test(data) ? data : null);
      } catch (e) { done(null); }
    };
    img.onerror = function () { done(null); };
    img.src = src;
  }
  // Loads the inline copies of these addresses (known ones only, each once
  // per page); onReady() runs when this call's photos are settled and at
  // least one of them is ready. Returns how many it started loading.
  // loader(src, done(dataUrlOrNull)) is for tests.
  function prepareImages(urls, onReady, loader) {
    var load = loader || canvasLoader;
    var list = (Array.isArray(urls) ? urls : []).filter(function (u, i, a) { return known(u) && a.indexOf(u) === i && !ASKED[u]; });
    var done = 0, ok = 0;
    list.forEach(function (url) {
      ASKED[url] = true;
      load(KNOWN[url].local, function (data) {
        if (typeof data === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) { INLINE[url] = data; ok++; } else FAILED[url] = true;
        done++;
        if (done === list.length && ok > 0 && typeof onReady === 'function') onReady();
      });
    });
    return list.length;
  }
  // Prepares the demo's three inline photos once (the Studio, Step 1); onReady() as above.
  function prepare(onReady, loader) {
    if (state.started) return;
    state.started = true;
    prepareImages(STARTERS.map(cloudinaryUrl), onReady, loader);
  }
  function status() { return { started: state.started, ready: Object.keys(INLINE).length, failed: Object.keys(FAILED).length }; }

  var BADGE_CSS = '<style>.st-ai{position:absolute;top:8px;left:8px;z-index:2;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;' +
    'font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.02em;pointer-events:none}:has(> .st-ai){position:relative}</style>';
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // The page HTML for the Studio's frames: each of these images becomes its
  // inline photo with the AI label right before it, or the placeholder (no
  // label, the photo's proportions) while it is not ready. Anything else is untouched.
  function localizeHtml(html) {
    if (typeof html !== 'string') return html;
    var label = false;
    Object.keys(KNOWN).forEach(function (url) {
      if (html.indexOf(url) === -1) return;
      var re = new RegExp('<img\\b([^>]*?) src="' + escRe(url) + '"', 'g');
      html = html.replace(re, function (m, before) {
        if (!INLINE[url]) return '<img' + before + ' src="' + placeholder(KNOWN[url].width, KNOWN[url].height) + '" data-st-placeholder="1"';
        label = true;
        return '<span class="st-ai">' + AI_LABEL + '</span><img' + before + ' src="' + INLINE[url] + '"';
      });
    });
    return label ? html.replace('</head>', BADGE_CSS + '</head>') : html;
  }

  return { STARTERS: STARTERS.slice(), LOCAL_DIR: LOCAL_DIR, STUDIO_LOCAL_DIR: STUDIO_LOCAL_DIR, AI_LABEL: AI_LABEL, SIZE: SIZE, PLACEHOLDER: PLACEHOLDER,
    TEMPLATE_IMAGES: TEMPLATE_IMAGES.map(function (i) { return Object.assign({}, i); }),
    cloudinaryUrl: cloudinaryUrl, studioUrl: studioUrl, fit: fit, placeholder: placeholder, templateUrls: templateUrls,
    localSrc: localSrc, displaySrc: displaySrc, prepare: prepare, prepareImages: prepareImages, status: status, localizeHtml: localizeHtml };
});
