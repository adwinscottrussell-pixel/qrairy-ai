/*
 * deal-image-formats.js — how a deal's image fits four formats (Deal Builder,
 * Step 2). Preview only: nothing is uploaded, stored or published here.
 *
 *   deal    QRAIVY Deal          1200 x 900   (4:3)  the deal's own image, unchanged
 *   feed    Instagram Feed       1080 x 1350  (4:5)
 *   story   Story / Reel         1080 x 1920  (9:16)
 *   square  Square thumbnail     1080 x 1080  (1:1)
 *
 * Per image kind:
 *   uploaded, with master  Cloudinary transformation of the master. Subject-aware
 *                          crop (c_fill,g_auto) when the crop keeps at least
 *                          RETAIN_MIN of the picture; otherwise the whole
 *                          picture fitted over a blurred, full-frame copy of
 *                          itself (two layers of the SAME asset; Cloudinary's
 *                          b_blurred padding works for videos only).
 *                          If a preview cannot load, the tile falls back to
 *                          the master padded in the browser (tile.fallback).
 *   uploaded, no master    (uploads from before masters were kept) and
 *   starter                the picture shown whole, padded in the browser (CSS).
 *   background             the colour fills every format.
 * The "deal" format always shows the deal's existing 4:3 image as it is.
 *
 * window.QraivyDealImageFormats.formatsFor(image, { starterSrc }) -> tiles
 */
(function (root) {
  var FORMATS = [
    { id: 'deal', width: 1200, height: 900, preview: { width: 448, height: 336 } },
    { id: 'feed', width: 1080, height: 1350, preview: { width: 272, height: 340 } },
    { id: 'story', width: 1080, height: 1920, preview: { width: 180, height: 320 } },
    { id: 'square', width: 1080, height: 1080, preview: { width: 336, height: 336 } }
  ];
  var RETAIN_MIN = 0.6;        // keep at least 60 % of the picture, or pad instead of cropping
  var ENLARGE_NOTE = 1.05;     // above this the picture is shown as "Enlarged"
  var ENLARGE_WARN = 1.5;      // above this the label is a warning
  // Only the plain, untransformed delivery URL of an image on Cloudinary is used.
  var MASTER_URL = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/(?:v\d+\/)?([A-Za-z0-9_\/-]+)\.(?:jpe?g|png|webp)$/;

  // Share of the picture a fill-crop to width:height keeps (1 = nothing cut away).
  function retention(mw, mh, width, height) {
    var m = mw / mh, r = width / height;
    return m > r ? r / m : m / r;
  }
  // How much the picture is enlarged to reach the full export size.
  function cropEnlargement(mw, mh, width, height) {
    var r = width / height, cropW = mw / mh > r ? mh * r : mw;
    return width / cropW;
  }
  function padEnlargement(mw, mh, width, height) { return Math.min(width / mw, height / mh); }
  function round1(n) { return Math.round(n * 10) / 10; }

  function masterTransform(masterUrl, transformation) {
    if (typeof masterUrl !== 'string' || !MASTER_URL.test(masterUrl)) return null;
    return masterUrl.replace('/image/upload/', '/image/upload/' + transformation + '/');
  }
  function cropTransformation(p) { return 'c_fill,g_auto,w_' + p.width + ',h_' + p.height + ',f_auto,q_auto'; }
  // The master's own asset as a Cloudinary layer id: folder separators become ':'.
  function layerIdOf(masterUrl) {
    var m = typeof masterUrl === 'string' ? masterUrl.match(MASTER_URL) : null;
    return m ? m[1].replace(/\//g, ':') : null;
  }
  // Blurred full-frame background of the picture, with the whole picture fitted on top
  // (tested against the real account: HTTP 200, exact size, nothing cropped away).
  // The background is darkened like the browser fallback (deals-page.css,
  // .deal-format__blur: brightness(0.65)), so the whole picture stands out from
  // its border instead of seeming to run on into it.
  function padTransformation(p, layerId) {
    var size = 'w_' + p.width + ',h_' + p.height;
    return 'c_fill,' + size + '/e_blur:1000/e_brightness:-35/l_' + layerId + ',c_fit,' + size + '/fl_layer_apply/f_auto,q_auto';
  }

  function status(kind, enlargement) {
    if (kind === 'padded') return { status: 'padded', enlargement: enlargement > ENLARGE_NOTE ? round1(enlargement) : null, warn: enlargement > ENLARGE_WARN };
    if (enlargement > ENLARGE_NOTE) return { status: 'enlarged', enlargement: round1(enlargement), warn: enlargement > ENLARGE_WARN };
    return { status: 'optimal', enlargement: null, warn: false };
  }
  function tile(f, mode, src, s, extra) {
    var t = { id: f.id, width: f.width, height: f.height, mode: mode, src: src || '', status: s.status, enlargement: s.enlargement, warn: s.warn, retention: null };
    for (var k in (extra || {})) t[k] = extra[k];
    return t;
  }

  // image: the Deal Builder's image ({ source: 'uploaded', url, width, height, master? }
  //        | { source: 'starter', id, aiGenerated } | { source: 'background', id }) or null.
  // opts.starterSrc(id) -> the starter's file URL; opts.backgroundCss(id) -> its CSS.
  function formatsFor(image, opts) {
    opts = opts || {};
    if (!image) return [];
    var ai = image.source === 'starter';
    if (image.source === 'background') {
      var css = opts.backgroundCss ? opts.backgroundCss(image.id) : '';
      return FORMATS.map(function (f) { return tile(f, 'color', css, status('optimal', 1), { ai: false }); });
    }
    var plain = image.source === 'starter' ? (opts.starterSrc ? opts.starterSrc(image.id) : '') : (image.url || '');
    var m = image.source === 'uploaded' && image.master ? image.master : null;
    var mw = m && Number(m.width), mh = m && Number(m.height);
    var hasMaster = !!(m && mw > 0 && mh > 0 && masterTransform(m.url, 'x'));
    return FORMATS.map(function (f) {
      if (f.id === 'deal') {
        // the deal's own 4:3 picture, exactly as stored and shown today
        return tile(f, 'image', plain, hasMaster ? status('crop', cropEnlargement(mw, mh, f.width, f.height)) : status('optimal', 1), { ai: ai, legacy: !hasMaster && image.source === 'uploaded' });
      }
      if (!hasMaster) return tile(f, 'css-pad', plain, status('padded', 1), { ai: ai, legacy: image.source === 'uploaded' });
      var keep = retention(mw, mh, f.width, f.height);
      // fallback: the plain master, padded in the browser, if the Cloudinary preview fails
      var t = keep >= RETAIN_MIN
        ? tile(f, 'crop', masterTransform(m.url, cropTransformation(f.preview)), status('crop', cropEnlargement(mw, mh, f.width, f.height)), { ai: false, fallback: m.url })
        : tile(f, 'pad', masterTransform(m.url, padTransformation(f.preview, layerIdOf(m.url))), status('padded', padEnlargement(mw, mh, f.width, f.height)), { ai: false, fallback: m.url });
      t.retention = Math.round(keep * 100) / 100;
      return t;
    });
  }

  root.QraivyDealImageFormats = {
    FORMATS: FORMATS, RETAIN_MIN: RETAIN_MIN, ENLARGE_NOTE: ENLARGE_NOTE, ENLARGE_WARN: ENLARGE_WARN,
    retention: retention, cropEnlargement: cropEnlargement, padEnlargement: padEnlargement,
    masterTransform: masterTransform, layerIdOf: layerIdOf, padTransformation: padTransformation, formatsFor: formatsFor
  };
})(typeof window !== 'undefined' ? window : this);
