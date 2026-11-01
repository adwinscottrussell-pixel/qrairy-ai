/*
 * onboarding-theme.js — Landing Page Studio V3 onboarding (Phase O2.1): the
 * wizard's own appearance, Light or Dark.
 *
 * It shares the Studio's appearance preference (studio-shell.js THEME_KEY,
 * 'qraivy.studio.theme': 'light' | 'dark' | 'system'; Light when there is
 * none), so the wizard and the Studio always match. 'system' follows the
 * device setting. Loaded in the page's <head>, before anything is drawn, so a
 * reload never flashes the other appearance; the sun / moon buttons in the
 * header set 'light' or 'dark'.
 *
 * It only sets data-ob-theme (and data-ob-theme-pref) on <html> and the
 * buttons' aria-pressed. It never touches the answers, the page being built
 * or its previews (their frames keep the customer's own appearance), and it
 * stores nothing else. No request.
 *
 * In Node: module.exports (the pure parts, for the tests). In the browser:
 * window.QraivyOnboardingTheme, and it starts itself.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.QraivyOnboardingTheme = api; api.start(root); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KEY = 'qraivy.studio.theme';
  var PREFS = ['light', 'dark', 'system'];

  // a stored preference, checked (anything else: Light)
  function clean(p) { return PREFS.indexOf(p) !== -1 ? p : 'light'; }
  // the appearance shown: 'light' or 'dark'
  function resolve(pref, systemDark) { pref = clean(pref); return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref; }

  function start(win) {
    var doc = win.document, html = doc.documentElement;
    var mq = win.matchMedia ? win.matchMedia('(prefers-color-scheme: dark)') : null;
    function read() { try { return clean(win.localStorage.getItem(KEY)); } catch (e) { return 'light'; } }
    var pref = read(), shown = 'light';
    function apply() {
      shown = resolve(pref, !!(mq && mq.matches));
      html.setAttribute('data-ob-theme', shown);
      html.setAttribute('data-ob-theme-pref', pref);
      var b = doc.querySelectorAll('[data-ob-theme-choice]');
      for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', String(b[i].getAttribute('data-ob-theme-choice') === shown));
    }
    function set(p) {
      pref = p === 'dark' ? 'dark' : 'light';
      try { win.localStorage.setItem(KEY, pref); } catch (e) {}
      apply();
    }
    apply();
    if (mq) {
      var follow = function () { if (pref === 'system') apply(); };
      if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
    }
    // changed in another tab (the Studio): follow it
    win.addEventListener('storage', function (e) { if (e.key === KEY) { pref = read(); apply(); } });
    function bind() {
      var b = doc.querySelectorAll('[data-ob-theme-choice]');
      for (var i = 0; i < b.length; i++) b[i].addEventListener('click', function (e) { set(e.currentTarget.getAttribute('data-ob-theme-choice')); });
      apply();
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bind); else bind();
    return { set: set, pref: function () { return pref; }, theme: function () { return shown; } };
  }

  return { KEY: KEY, PREFS: PREFS, clean: clean, resolve: resolve, start: start };
});
