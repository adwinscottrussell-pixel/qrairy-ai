/*
 * studio-preview.js — Landing Page Studio V3: the live preview frames.
 *
 * The page is rendered by the shared js/lpV3/core.js (preview mode) and
 * shown in iframes sandboxed with "allow-scripts" only — never
 * allow-same-origin: the frame has an opaque origin and cannot reach the
 * Studio, its storage or cookies. Its scripts are FRAME_SCRIPT below
 * (fixed text, no owner data: it reports clicks on a section and the scroll
 * position, and marks the selected section) and, on a page with a Gallery
 * carousel, the trusted first-party controller js/lpV3/gallery-nav.js
 * (setNavScript: its fixed code, window.QraivyGalleryNav.source from the
 * copy studio.html loads; it sends no messages). The frames themselves load
 * nothing. Messages are
 * checked both ways (acceptMessage here, the source window in each direction).
 *
 * In Node: module.exports (pure parts, for the tests). In the Studio:
 * window.QraivyStudioPreview.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyStudioPreview = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SANDBOX = 'allow-scripts';
  var ID = /^s_[a-z0-9]{4,16}$/;
  var MAX_SCROLL = 10000000;
  // a reveal asked for this long before a reload still applies to it (Phase C: a section just added)
  var REVEAL_MS = 2000;
  var FRAMES = { desktop: { w: 1280, h: 800, chrome: 30 }, tablet: { w: 820, h: 1180, pad: 14 }, mobile: { w: 390, h: 844, pad: 12 } };

  // Added to the preview only (never to a public page). Links do not
  // navigate in the preview: a click selects the section it is in.
  var FRAME_SCRIPT =
    '<style>[data-v3-id]{cursor:pointer}[data-v3-id]:hover{outline:2px dashed rgba(255,90,31,.6);outline-offset:-2px}' +
    '[data-v3-id].st-sel{outline:3px solid #ff5a1f;outline-offset:-3px}</style>' +
    '<script>(function(){' +
    'function mark(id,reveal){var all=document.querySelectorAll("[data-v3-id]");for(var i=0;i<all.length;i++){var on=all[i].getAttribute("data-v3-id")===id;' +
    'all[i].classList.toggle("st-sel",on);if(on&&reveal)all[i].scrollIntoView({block:"start",behavior:"smooth"});}}' +
    'document.addEventListener("click",function(e){var n=e.target&&e.target.closest?e.target:null;if(!n)return;' +
    'if(n.closest("a"))e.preventDefault();var s=n.closest("[data-v3-id]");' +
    'if(s)parent.postMessage({type:"select",id:s.getAttribute("data-v3-id")},"*");},true);' +
    'var t=null;addEventListener("scroll",function(){if(t)return;t=setTimeout(function(){t=null;parent.postMessage({type:"scroll",y:Math.round(scrollY)},"*");},120);},{passive:true});' +
    'addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data;if(!d||typeof d!=="object")return;' +
    // back to the same place at once after a re-render (the page itself
    // scrolls smoothly, which would replay the whole way down on every edit)
    'if(d.type==="init"&&typeof d.y==="number")scrollTo({top:d.y,behavior:"instant"});' +
    'if(d.type==="init"||d.type==="select")mark(typeof d.id==="string"?d.id:null,d.reveal===true);});' +
    '})();</script>';

  // The Gallery controller (gallery-nav.js `source`) is accepted only as
  // plain script text that cannot close or comment out its element.
  function navTag(nav) {
    return typeof nav === 'string' && nav.length > 0 && nav.length < 20000 && !/<\/script|<!--|<script/i.test(nav) ? '<script>' + nav + '</script>' : '';
  }

  // The rendered page plus FRAME_SCRIPT (and, on a page with a Gallery
  // carousel, the controller), just before </body>.
  function previewHtml(html, nav) {
    if (typeof html !== 'string' || !/<\/body><\/html>$/.test(html)) return '';
    var gallery = html.indexOf('<div class="v3-gal-wrap">') !== -1 ? navTag(nav) : '';
    return html.slice(0, html.length - '</body></html>'.length) + FRAME_SCRIPT + gallery + '</body></html>';
  }

  // A message from a preview frame -> the accepted message, or null.
  // Exactly { type: 'select', id } or { type: 'scroll', y }; nothing else.
  function acceptMessage(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.getPrototypeOf(d) !== Object.prototype) return null;
    var keys = Object.keys(d).sort().join(',');
    if (d.type === 'select' && keys === 'id,type' && typeof d.id === 'string' && ID.test(d.id)) return { type: 'select', id: d.id };
    if (d.type === 'scroll' && keys === 'type,y' && typeof d.y === 'number' && isFinite(d.y) && Math.floor(d.y) === d.y && d.y >= 0 && d.y <= MAX_SCROLL) return { type: 'scroll', y: d.y };
    return null;
  }

  // createPreview({ canvas, title(device), onSelect(id) })
  function createPreview(o) {
    var doc = o.canvas.ownerDocument, win = doc.defaultView;
    var state = { html: '', device: 'desktop', selected: null, scroll: {}, timer: null, nav: '', revealAt: 0 };

    function mq(q) { return win.matchMedia && win.matchMedia(q).matches; }
    function phoneOnly() { return mq('(max-width: 767px)'); }
    function dual() { return mq('(min-width: 1920px)') && state.device === 'desktop'; }
    function frames() { return Array.prototype.slice.call(o.canvas.querySelectorAll('iframe')); }
    function post(ifr, msg) { if (ifr.contentWindow) ifr.contentWindow.postMessage(msg, '*'); }

    function makeFrame(device) {
      var f = FRAMES[device];
      var frame = doc.createElement('div');
      frame.className = 'st-frame st-frame--' + device;
      frame.setAttribute('data-device', device);
      var scale = doc.createElement('div');
      scale.className = 'st-frame__scale';
      if (device === 'desktop') {
        var chrome = doc.createElement('div');
        chrome.className = 'st-frame__chrome';
        chrome.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 3; i++) chrome.appendChild(doc.createElement('i'));
        scale.appendChild(chrome);
      }
      var ifr = doc.createElement('iframe');
      ifr.setAttribute('sandbox', SANDBOX);
      ifr.setAttribute('title', o.title(device));
      ifr.setAttribute('referrerpolicy', 'no-referrer');
      ifr.setAttribute('width', String(f.w));
      ifr.setAttribute('height', String(f.h));
      ifr.setAttribute('loading', 'eager');
      ifr.setAttribute('data-device', device);
      // after every (re)load: back to the same scroll position, selection marked
      // (a section just asked to be shown, e.g. one just added, is scrolled into view in the reloaded page)
      ifr.addEventListener('load', function () { post(ifr, { type: 'init', id: state.selected, y: state.scroll[device] || 0, reveal: revealPending() }); });
      ifr.srcdoc = previewHtml(state.html, state.nav);
      scale.appendChild(ifr);
      frame.appendChild(scale);
      return frame;
    }

    function render() {
      o.canvas.textContent = '';
      var devices = phoneOnly() ? ['mobile'] : dual() ? ['desktop', 'mobile'] : [state.device];
      devices.forEach(function (d) { o.canvas.appendChild(makeFrame(d)); });
      fit();
    }

    function fit() {
      var c = o.canvas;
      var cs = win.getComputedStyle(c);
      var availW = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var availH = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var list = c.querySelectorAll('.st-frame');
      var gap = 20;
      var outer = function (d) { var f = FRAMES[d]; return { w: f.w + 2 * (f.pad || 0) + (d === 'desktop' ? 2 : 0), h: f.h + 2 * (f.pad || 0) + (f.chrome || 0) + (d === 'desktop' ? 2 : 0) }; };
      var sizes = []; list.forEach(function (fr) { sizes.push(outer(fr.getAttribute('data-device'))); });
      // Side by side (>= 1920 px): the phone as tall as the space allows, the
      // desktop frame takes the remaining width (as in the approved mockup).
      var phoneScale = null;
      if (list.length === 2) phoneScale = Math.min(1, availH / sizes[1].h);
      list.forEach(function (fr, i) {
        var d = fr.getAttribute('data-device'), sz = sizes[i], s;
        if (list.length === 2) {
          s = d === 'mobile' ? phoneScale : Math.min(1, (availW - gap - sizes[1].w * phoneScale) / sz.w, availH / sz.h);
        } else if (d === 'desktop' || phoneOnly()) s = Math.min(1, availW / sz.w);
        else s = Math.min(1, availW / sz.w, Math.max(availH, 480) / sz.h);
        s = Math.max(0.1, s);
        var scaleBox = fr.firstChild, ifr = scaleBox.querySelector('iframe');
        // A single desktop frame fills the canvas height (taller page window,
        // same 1280 px layout width); every other frame keeps its device size.
        if (list.length === 1 && d === 'desktop' && !phoneOnly()) {
          var ih = Math.max(FRAMES.desktop.h, Math.floor(availH / s) - FRAMES.desktop.chrome - 2);
          ifr.setAttribute('height', String(ih));
          sz = { w: sz.w, h: ih + FRAMES.desktop.chrome + 2 };
        } else ifr.setAttribute('height', String(FRAMES[d].h));
        // the box keeps its real (logical) size; only the transform shrinks it
        scaleBox.style.width = sz.w + 'px';
        scaleBox.style.height = sz.h + 'px';
        scaleBox.style.transform = 'scale(' + s + ')';
        fr.style.width = Math.floor(sz.w * s) + 'px';
        fr.style.height = Math.floor(sz.h * s) + 'px';
      });
    }

    // New page HTML: every frame reloads it (after `delay` ms, so typing does
    // not reload on every key). The same HTML (an invalid edit keeps the last
    // valid page) changes nothing.
    function setHtml(html, delay) {
      clearTimeout(state.timer);
      var apply = function () {
        if (html === state.html) return;
        state.html = html;
        var doc2 = previewHtml(html, state.nav);
        frames().forEach(function (ifr) { ifr.srcdoc = doc2; });
      };
      if (delay) state.timer = setTimeout(apply, delay); else apply();
    }

    // The Gallery controller's code (set once at start): kept only if
    // acceptable; every frame (re)load from then on includes it.
    function setNavScript(text) {
      if (!navTag(text) || text === state.nav) return;
      state.nav = text;
      var doc2 = previewHtml(state.html, state.nav);
      frames().forEach(function (ifr) { ifr.srcdoc = doc2; });
    }

    function revealPending() { return !!state.revealAt && Date.now() - state.revealAt < REVEAL_MS; }
    function select(id, reveal) {
      state.selected = id;
      state.revealAt = reveal ? Date.now() : 0;
      frames().forEach(function (ifr) { post(ifr, { type: 'select', id: id, reveal: !!reveal }); });
    }

    // Only messages from the current preview frames, only the accepted shapes.
    win.addEventListener('message', function (e) {
      var ifr = frames().filter(function (f) { return f.contentWindow === e.source; })[0];
      if (!ifr) return;
      var m = acceptMessage(e.data);
      if (!m) return;
      if (m.type === 'scroll') state.scroll[ifr.getAttribute('data-device')] = m.y;
      else if (o.onSelect) o.onSelect(m.id);
    });

    return {
      render: render, fit: fit, setHtml: setHtml, setNavScript: setNavScript, select: select, phoneOnly: phoneOnly,
      html: function () { return state.html; },
      device: function () { return state.device; },
      setDevice: function (d) { if (FRAMES[d]) { state.device = d; render(); } },
    };
  }

  return { SANDBOX: SANDBOX, FRAMES: FRAMES, FRAME_SCRIPT: FRAME_SCRIPT, previewHtml: previewHtml, acceptMessage: acceptMessage, createPreview: createPreview };
});
