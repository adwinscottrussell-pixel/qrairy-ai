/*
 * gallery-nav.js — Landing Page Studio V3: previous / next for Gallery
 * carousels (2A-3H), the same in Chrome, Edge, Firefox and Safari.
 *
 * A trusted first-party file. The page renderer (js/lpV3/core.js) stays
 * script-free: it renders the two buttons hidden. This file, added by the
 * application (the Studio's sandboxed preview now, the publish route
 * later), wires them up and only then shows them. It reads the page
 * structure only (fixed class names), never owner text; no network, no
 * HTML strings, no messages. Without it the buttons stay hidden: swipe,
 * keyboard and the hint remain.
 *
 * Browser: runs once loaded. A published page will load this file as an
 * external first-party script. The Studio loads it too and puts
 * window.QraivyGalleryNav.source into its sandboxed preview frames (they
 * load nothing themselves, and the Studio makes no network requests):
 * `source` is galleryNav's own text (Function.prototype.toString on this
 * fixed function only, characters exactly as written below) plus the call.
 * No eval, no Function constructor, nothing from page data.
 * Node: module.exports = { init, source } (tests).
 */
(function (root) {
  function galleryNav(doc, win) {
    'use strict';
    var reduce = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;

    function setup(wrap) {
      if (wrap.getAttribute('data-nav') === 'on') return;
      var strip = wrap.querySelector('.v3-gal-carousel');
      var prev = wrap.querySelector('.v3-gal-prev'), next = wrap.querySelector('.v3-gal-next');
      if (!strip || !prev || !next) return;
      var items = strip.querySelectorAll('.v3-gal-item');
      if (items.length < 2) return;

      function max() { return Math.max(0, strip.scrollWidth - strip.clientWidth); }
      // where each photo starts, in the strip's scroll coordinates
      function starts() {
        var base = strip.getBoundingClientRect().left - strip.scrollLeft, out = [];
        for (var i = 0; i < items.length; i++) out.push(items[i].getBoundingClientRect().left - base);
        return out;
      }
      // to the next / previous photo start (snapping keeps it exact), at most to the ends
      function go(dir) {
        var x = strip.scrollLeft, m = max(), s = starts(), to = dir > 0 ? m : 0, i;
        if (dir > 0) { for (i = 0; i < s.length; i++) if (s[i] > x + 1) { to = Math.min(s[i], m); break; } }
        else { for (i = s.length - 1; i >= 0; i--) if (s[i] < x - 1) { to = Math.max(s[i], 0); break; } }
        strip.scrollTo({ left: to, behavior: reduce && reduce.matches ? 'auto' : 'smooth' });
      }
      // disabled at the ends; a focused button that becomes disabled hands focus to the other one
      function setOff(btn, other, off) {
        if (btn.disabled === off) return;
        if (off && doc.activeElement === btn && !other.disabled) other.focus({ preventScroll: true });
        btn.disabled = off;
      }
      function update() {
        var x = strip.scrollLeft, m = max();
        setOff(prev, next, x <= 1);
        setOff(next, prev, x >= m - 1);
      }
      var queued = false;
      function onScroll() {
        if (queued) return;
        queued = true;
        (win.requestAnimationFrame || win.setTimeout)(function () { queued = false; update(); });
      }

      prev.addEventListener('click', function () { go(-1); });
      next.addEventListener('click', function () { go(1); });
      strip.addEventListener('scroll', onScroll, { passive: true });
      if (win.ResizeObserver) new win.ResizeObserver(update).observe(strip);
      else win.addEventListener('resize', update);
      update();
      // only now, with everything wired up, are the buttons shown
      prev.hidden = false;
      next.hidden = false;
      wrap.setAttribute('data-nav', 'on');
    }

    function init() {
      var all = doc.querySelectorAll('.v3-gal-wrap');
      for (var i = 0; i < all.length; i++) {
        // a carousel that cannot be set up keeps swipe, keyboard and the hint
        try { setup(all[i]); } catch (e) { /* buttons stay hidden */ }
      }
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
  }

  var api = { init: galleryNav, source: '(' + galleryNav.toString() + ')(document, window);' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.QraivyGalleryNav = api; galleryNav(root.document, root); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
