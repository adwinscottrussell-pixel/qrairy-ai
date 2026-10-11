/*
 * QRAIVY Smart Landing Page editor — API routing.
 *
 * Decides, once, where this page's API requests go. The rule is
 * default-deny: a hostname gets production routing only if it is a known
 * production site. Everything else — any new preview hostname, a
 * *.vercel.app deployment, localhost — is a preview by definition and is
 * blocked unless it has been explicitly connected to a staging API. No
 * list of preview hostnames has to be kept for that to hold.
 *
 *   production     (the sites in PRODUCTION_SITES)
 *                  Nothing is changed: no request is touched, url()
 *                  returns its argument, fetch is the browser's own.
 *
 *   staging        (host listed in js/staging-config.js, staging API valid)
 *                  Every request to the production API is sent to the
 *                  staging API instead — fetch, XMLHttpRequest, the phone
 *                  preview and links to a page. That includes the
 *                  same-origin paths that vercel.json forwards to
 *                  production (/lp, /stamp, /wallet, /manifest).
 *
 *   staging-error  (host listed, staging API missing, not https, a
 *                  production host, or the site itself)
 *   unknown-host   (not a production site and not listed as staging)
 *                  In both: those same requests are REFUSED and a notice
 *                  is shown. Nothing falls back to production.
 *
 * Outside production the site also registers no service worker and
 * removes any it finds: /sw.js on a website host is forwarded to the
 * production API by vercel.json.
 *
 * window.QRAIVY_ROUTING = { mode, api, error, url(u), isProductionApi(u) }
 * The staging API comes only from js/staging-config.js; no staging
 * hostname is written in this file. Sign-in is not touched here.
 *
 * Staging test scope: the editor, its phone preview and the customer
 * page. QR codes, stamp, loyalty and wallet flows are NOT part of it —
 * see js/staging-config.js.
 */
(function () {
  'use strict';

  var PRODUCTION_API = 'https://api.qraivy.com';
  // The websites on which this editor has always used the production API.
  // These are the website origins the production API itself accepts
  // (backend/src/utils/corsOriginPolicy.js, STATIC_ALLOWED_ORIGINS), without
  // the API host and without plan-preview, where this page never runs. A
  // test keeps the two in step. Adding a production website means adding
  // it there AND here; forgetting it here blocks the editor on that site,
  // it never opens a path to production from somewhere unexpected.
  var PRODUCTION_SITES = ['www.qraivy.com', 'qraivy.com', 'preview.qraivy.com', 'admin-preview.qraivy.com'];
  // Hosts that ARE production. Never valid as a staging host or staging API.
  var PRODUCTION_HOSTS = ['api.qraivy.com', 'www.qraivy.com', 'qraivy.com', 'pages.qraivy.com', 'qrairy-ai-production.up.railway.app'];
  // Paths that reach the API when requested from a website host
  // (vercel.json rewrites), as opposed to the website's own files.
  var API_PATHS = /^\/(lp|stamp|wallet|manifest|redeem)(\/|$)|^\/api\/|^\/sw\.js$/;
  var WEBSITE_HOSTS = ['www.qraivy.com', 'qraivy.com'];

  var cfg = window.QRAIVY_STAGING_CONFIG || {};
  var hosts = Array.isArray(cfg.hosts) ? cfg.hosts.filter(function (h) { return typeof h === 'string' && h; }).map(function (h) { return h.toLowerCase(); }) : [];
  var here = String(window.location.hostname || '').toLowerCase();

  function parse(u) { try { return new URL(u, window.location.href); } catch (e) { return null; } }
  function stagingApiOrigin() {
    if (typeof cfg.api !== 'string' || !cfg.api) return { error: 'No staging API is configured for this staging host.' };
    var u = null;
    try { u = new URL(cfg.api); } catch (e) {}      // absolute only: never resolved against this page
    if (!u || u.protocol !== 'https:') return { error: 'The staging API must be an https address.' };
    if (PRODUCTION_HOSTS.indexOf(u.hostname.toLowerCase()) !== -1) return { error: 'The staging API points to production.' };
    if (u.hostname.toLowerCase() === here) return { error: 'The staging API cannot be the staging website itself.' };
    return { origin: u.origin };
  }

  // A production hostname listed as a staging host is a configuration
  // mistake; production must keep working, so the whole staging
  // configuration is ignored rather than applied.
  var listsProduction = hosts.some(function (h) { return PRODUCTION_HOSTS.indexOf(h) !== -1; });
  if (listsProduction) {
    hosts = [];
    if (window.console) console.error('[QRAIVY routing] staging-config.js lists a production host; the staging configuration is ignored.');
  }

  var mode, api = '', error = '';
  if (hosts.indexOf(here) !== -1) {
    var s = stagingApiOrigin();
    if (s.origin) { mode = 'staging'; api = s.origin; }
    else { mode = 'staging-error'; error = s.error; }
  } else if (PRODUCTION_SITES.indexOf(here) !== -1) {
    mode = 'production'; api = PRODUCTION_API;
  } else {
    mode = 'unknown-host';
    error = '"' + here + '" is not a production site and is not connected to a staging API.';
  }
  var blocked = mode === 'staging-error' || mode === 'unknown-host';

  // Does this address reach the production API (directly, through the
  // website's rewrites, or through this site's own copy of those rewrites)?
  function productionApiPath(u) {
    var p = parse(u);
    if (!p) return null;
    var host = p.hostname.toLowerCase();
    if (host === 'api.qraivy.com' || host === 'pages.qraivy.com' || host === 'qrairy-ai-production.up.railway.app') return p.pathname + p.search + p.hash;
    if ((WEBSITE_HOSTS.indexOf(host) !== -1 || (mode !== 'production' && host === here)) && API_PATHS.test(p.pathname)) return p.pathname + p.search + p.hash;
    return null;
  }
  function isProductionApi(u) { return productionApiPath(u) !== null; }

  var BLOCKED = 'about:blank#qraivy-api-blocked';
  // Where `u` should really go. Production: unchanged.
  function url(u) {
    if (mode === 'production') return u;
    var path = productionApiPath(u);
    if (path === null) return u;
    if (mode === 'staging') return api + path;
    notice();
    return BLOCKED;
  }

  var noticeShown = false;
  function notice() {
    if (noticeShown || !document.body) return;
    noticeShown = true;
    var el = document.createElement('div');
    el.id = 'qraivy-staging-routing-notice';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#7f1d1d;color:#fff;font:600 13px/1.5 Inter,system-ui,sans-serif;padding:10px 16px;text-align:center;';
    el.textContent = 'This preview is not connected to a staging API. Requests are blocked; nothing is sent to production. ' + error;
    document.body.appendChild(el);
  }
  function refuse() { notice(); return 'Blocked: this preview is not connected to a staging API. ' + error; }

  if (mode !== 'production') {
    var realFetch = window.fetch;
    window.fetch = function (input, init) {
      var target = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (!isProductionApi(target)) return realFetch.apply(this, arguments);
      if (blocked) return Promise.reject(new TypeError(refuse()));
      var to = url(target);
      if (typeof input === 'string' || !(window.Request && input instanceof window.Request)) return realFetch.call(this, to, init);
      return realFetch.call(this, new window.Request(to, input), init);
    };
    if (window.XMLHttpRequest) {
      var realOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function (method, target) {
        var args = Array.prototype.slice.call(arguments);
        if (isProductionApi(target)) {
          if (blocked) throw new Error(refuse());
          args[1] = url(target);
        }
        return realOpen.apply(this, args);
      };
    }
    // Links to a page ("Open Full Page", the address under the QR) point
    // at the production site; on staging the page lives on the staging API.
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || !isProductionApi(a.href)) return;
      if (blocked) { e.preventDefault(); e.stopPropagation(); notice(); return; }
      a.href = url(a.href);
    }, true);
    // Service workers. This site's /sw.js is forwarded to the production
    // API by vercel.json, so outside production the site must not run one:
    // none may be registered, and any left from an earlier visit is removed.
    // (A customer page served by the staging API registers the staging
    // API's own /sw.js on the staging API's origin; that is unaffected.)
    var sw = window.navigator && window.navigator.serviceWorker;
    if (sw) {
      try {
        sw.register = function () { return Promise.reject(new Error('Blocked: no service worker is registered on a preview site.')); };
        if (sw.getRegistrations) sw.getRegistrations().then(function (regs) { (regs || []).forEach(function (r) { try { r.unregister(); } catch (e) {} }); }, function () {});
      } catch (e) {}
    }
    if (blocked) {
      if (document.body) notice(); else document.addEventListener('DOMContentLoaded', notice);
    }
    if (window.console) console.info('[QRAIVY routing] ' + (mode === 'staging' ? 'staging: API requests go to ' + api : 'blocked: ' + error));
  }

  window.QRAIVY_ROUTING = { mode: mode, api: api, error: error, url: url, isProductionApi: isProductionApi, PRODUCTION_SITES: PRODUCTION_SITES.slice() };
})();
