/*
 * studio-auth.js — Landing Page Studio V3: the QRAIVY sign-in (Clerk), only
 * on the connected preview.
 *
 * The one Studio file that loads a script from elsewhere: Clerk's browser
 * bundle (the same address and public key as deals.html), and only when
 * studio-routing.js gives both an API address and a Clerk key
 * (studio-preview.qraivy.com). On every other address it loads nothing and
 * ready() answers at once: no sign-in, so studio-deals-data.js sends nothing.
 * A Clerk already on the page (the browser tests' stand-in) is used as it is.
 *
 * Nothing here reads or changes a deal; the session token is handed to
 * studio-deals-data.js by the shell.
 *
 * In Node: module.exports (for the tests). In the Studio:
 * window.QraivyStudioAuth.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.QraivyStudioAuth = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CLERK_SRC = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
  var KEY = /^pk_(?:live|test)_[A-Za-z0-9]{1,200}$/;
  var TIMEOUT_MS = 15000;

  // createAuth({ routing, document }) -> { ready, signIn, onChange }
  function createAuth(o) {
    var routing = o.routing || {};
    var doc = o.document || root.document;
    var key = routing.api && typeof routing.clerk === 'string' && KEY.test(routing.clerk) ? routing.clerk : '';
    var pending = null;

    function clerk() { return root.Clerk || null; }
    function load() {
      var c = clerk();
      if (c && typeof c.load === 'function' && !c.loaded) return Promise.resolve(c.load()).then(function () { return c; }, function () { return null; });
      return Promise.resolve(c);
    }
    // Resolves once the sign-in is known (signed in or not); never rejects.
    function ready() {
      if (pending) return pending;
      if (clerk()) { pending = load(); return pending; }
      if (!key || !doc || !doc.createElement) { pending = Promise.resolve(null); return pending; }
      pending = new Promise(function (resolve) {
        var done = false;
        var finish = function (v) { if (!done) { done = true; resolve(v); } };
        var s = doc.createElement('script');
        s.src = CLERK_SRC;
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.setAttribute('data-clerk-publishable-key', key);
        s.onload = function () { load().then(finish); };
        s.onerror = function () { finish(null); };
        setTimeout(function () { finish(null); }, TIMEOUT_MS);
        (doc.head || doc.body).appendChild(s);
      });
      return pending;
    }
    // Opens Clerk's own sign-in; false when no sign-in exists on this address.
    function signIn() {
      var c = clerk();
      if (!c || typeof c.openSignIn !== 'function') return false;
      c.openSignIn({});
      return true;
    }
    // fn() whenever the signed-in session changes (to reload the deals)
    function onChange(fn) {
      ready().then(function (c) {
        if (!c || typeof c.addListener !== 'function') return;
        var last = c.session ? c.session.id : null;
        c.addListener(function (e) {
          var id = e && e.session ? e.session.id : null;
          if (id !== last) { last = id; fn(); }
        });
      });
    }
    return { ready: ready, signIn: signIn, onChange: onChange, available: function () { return !!key || !!clerk(); } };
  }

  return { CLERK_SRC: CLERK_SRC, createAuth: createAuth };
});
