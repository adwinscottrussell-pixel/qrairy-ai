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
  // Phase C.1, phone-first: until the owner picks a device, the preview picks
  // one from the space it has: the phone below AUTO_DESKTOP_MIN px of canvas
  // width (readable), else the desktop; from DUAL_VIEWPORT px of window width
  // the desktop and the phone side by side when the canvas has DUAL_MIN px.
  var AUTO_DESKTOP_MIN = 900, DUAL_VIEWPORT = 1600, DUAL_MIN = 840;
  // Phase C.2, the phone: a realistic device around the same 390 x 844 page
  // (the page itself is unchanged): a status bar with the Dynamic Island above
  // the page (top) and the home indicator below it (bottom), never on it.
  var FRAMES = { desktop: { w: 1280, h: 800, chrome: 30 }, tablet: { w: 820, h: 1180, pad: 14 }, mobile: { w: 390, h: 844, pad: 16, top: 50, bottom: 22 } };
  // the status bar's icons (fixed markup: signal, Wi-Fi, battery), decoration only
  var PHONE_ICONS = '<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
    '<svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0z"/><path d="M3.2 6.6a6.8 6.8 0 0 1 9.6 0l-1.5 1.5a4.7 4.7 0 0 0-6.6 0z"/><path d="M.8 4.2a10.2 10.2 0 0 1 14.4 0l-1.5 1.5a8.1 8.1 0 0 0-11.4 0z"/></svg>' +
    '<svg viewBox="0 0 27 12" width="27" height="12" aria-hidden="true"><rect x=".5" y=".5" width="23" height="11" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".45"/><rect x="2" y="2" width="20" height="8" rx="2"/><path d="M25 4v4a2 2 0 0 0 0-4z" fill-opacity=".45"/></svg>';

  // Added to the preview only (never to a public page). Links do not
  // navigate in the preview: a click selects the section it is in.
  var FRAME_SCRIPT =
    '<style>[data-v3-id]{cursor:pointer}[data-v3-id]:hover{outline:2px dashed rgba(255,90,31,.6);outline-offset:-2px}' +
    '[data-v3-id].st-sel{outline:3px solid #ff5a1f;outline-offset:-3px}' +
    // the phone frame (390 px wide): no scrollbar, as on a phone (Phase C.2); wider frames unchanged
    '@media (max-width:480px){html{scrollbar-width:none}html::-webkit-scrollbar{display:none}}</style>' +
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
    var state = { html: '', device: 'desktop', auto: true, layout: '', selected: null, scroll: {}, timer: null, nav: '', revealAt: 0 };

    function mq(q) { return win.matchMedia && win.matchMedia(q).matches; }
    function phoneOnly() { return mq('(max-width: 767px)'); }
    function canvasWidth() { var cs = win.getComputedStyle(o.canvas); return o.canvas.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }
    function roomForTwo() { return mq('(min-width: ' + DUAL_VIEWPORT + 'px)') && canvasWidth() >= DUAL_MIN; }
    function dual() { return state.device === 'desktop' && roomForTwo(); }
    function autoDevice() { return roomForTwo() || canvasWidth() >= AUTO_DESKTOP_MIN ? 'desktop' : 'mobile'; }
    // the frames to show now (phones: the phone only)
    function layout() {
      if (phoneOnly()) return ['mobile'];
      if (state.auto) state.device = autoDevice();
      return dual() ? ['desktop', 'mobile'] : [state.device];
    }
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
      if (device === 'mobile') scale.appendChild(phoneScreen(ifr));
      else scale.appendChild(ifr);
      frame.appendChild(scale);
      return frame;
    }
    // The phone's screen: status bar (time, Dynamic Island, signal, Wi-Fi,
    // battery), the page, the home indicator; and the side buttons. All of it
    // decoration (aria-hidden, no pointer events) outside the page itself.
    function phoneScreen(ifr) {
      var screen = doc.createElement('div');
      screen.className = 'st-phone__screen';
      var bar = doc.createElement('div');
      bar.className = 'st-phone__status';
      bar.setAttribute('aria-hidden', 'true');
      var time = doc.createElement('span'); time.className = 'st-phone__time'; time.textContent = '9:41';
      var island = doc.createElement('span'); island.className = 'st-phone__island';
      var icons = doc.createElement('span'); icons.className = 'st-phone__icons'; icons.innerHTML = PHONE_ICONS;
      bar.appendChild(time); bar.appendChild(island); bar.appendChild(icons);
      var home = doc.createElement('div');
      home.className = 'st-phone__home';
      home.setAttribute('aria-hidden', 'true');
      home.appendChild(doc.createElement('i'));
      screen.appendChild(bar); screen.appendChild(ifr); screen.appendChild(home);
      var frag = doc.createDocumentFragment();
      ['action', 'up', 'down', 'power'].forEach(function (k) {
        var b = doc.createElement('span'); b.className = 'st-phone__btn st-phone__btn--' + k; b.setAttribute('aria-hidden', 'true'); frag.appendChild(b);
      });
      frag.appendChild(screen);
      return frag;
    }

    function render() {
      o.canvas.textContent = '';
      var devices = layout();
      state.layout = devices.join(',');
      if (o.onLayout) o.onLayout(state.device);
      devices.forEach(function (d) { o.canvas.appendChild(makeFrame(d)); });
      fit(true);
    }

    function fit(rendered) {
      // the space changed so much that other frames fit better (phone-first, side by side)
      if (rendered !== true && layout().join(',') !== state.layout) { render(); return; }
      var c = o.canvas;
      var cs = win.getComputedStyle(c);
      var availW = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var availH = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var list = c.querySelectorAll('.st-frame');
      var gap = 20;
      var outer = function (d) { var f = FRAMES[d]; return { w: f.w + 2 * (f.pad || 0) + (d === 'desktop' ? 2 : 0), h: f.h + 2 * (f.pad || 0) + (f.chrome || 0) + (f.top || 0) + (f.bottom || 0) + (d === 'desktop' ? 2 : 0) }; };
      var sizes = []; list.forEach(function (fr) { sizes.push(outer(fr.getAttribute('data-device'))); });
      // Side by side (from DUAL_VIEWPORT px): the phone as tall as the space allows, the
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
      // a device the owner picks stays (no more automatic choice)
      setDevice: function (d) { if (FRAMES[d]) { state.auto = false; state.device = d; render(); } },
    };
  }

  return { SANDBOX: SANDBOX, FRAMES: FRAMES, FRAME_SCRIPT: FRAME_SCRIPT, previewHtml: previewHtml, acceptMessage: acceptMessage, createPreview: createPreview };
});
