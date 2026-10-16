/*
 * deals-routing.js — which API the Deal Builder (deals.html) may talk to.
 *
 * Only deals.html loads this file. Every other page keeps its own routing
 * (js/api-base.js, js/lp-routing.js) exactly as before.
 *
 * Default deny: a hostname gets an API only if it is listed here.
 *   www.qraivy.com, qraivy.com   production API (https://api.qraivy.com)
 *   deals-preview.qraivy.com     the isolated Deals preview API, never production
 *   localhost, 127.0.0.1         a test server on this machine, never production
 *   anything else                blocked: Vercel preview builds of a branch,
 *                                other preview domains. The Deal Builder sends
 *                                no request at all and says why.
 *
 * window.QRAIVY_DEALS_ROUTING = { mode, api, blocked }
 * window.QRAIVY_DEALS_PAGE_ORIGIN: where this site's customers see a landing
 * page (links from the Deals admin), never this admin site itself:
 *   production      https://www.qraivy.com (the address the editor publishes)
 *   deals-preview   the isolated Deals API, which serves /lp/<slug> itself --
 *                   deals-preview.qraivy.com/lp/... would go to production
 *   local           the local test server
 *   blocked         '' (no links)
 * window.QraivyDealsRouting.resolve(hostname, localApi) is the same decision
 * as a pure function (tests/dealsPreviewSafety.test.js).
 */
(function () {
  var PRODUCTION_API = 'https://api.qraivy.com';
  var PRODUCTION_SITES = ['www.qraivy.com', 'qraivy.com'];
  var DEALS_PREVIEW_HOST = 'deals-preview.qraivy.com';
  var DEALS_PREVIEW_API = 'https://qraivy-deals-api-deals-preview.up.railway.app';
  var LOCAL_HOSTS = ['localhost', '127.0.0.1'];

  function resolve(hostname, localApi) {
    var host = String(hostname || '').toLowerCase();
    if (PRODUCTION_SITES.indexOf(host) !== -1) return { mode: 'production', api: PRODUCTION_API, blocked: false };
    if (host === DEALS_PREVIEW_HOST) return { mode: 'deals-preview', api: DEALS_PREVIEW_API, blocked: false };
    if (LOCAL_HOSTS.indexOf(host) !== -1) {
      // A local test server, given explicitly or the page's own origin. Never production.
      var u = null;
      try { u = new URL(String(localApi || '')); } catch (e) { u = null; }
      var ok = u && (u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTS.indexOf(u.hostname) !== -1;
      return { mode: 'local', api: ok ? u.origin : '', blocked: !ok };
    }
    return { mode: 'unknown-host', api: '', blocked: true };
  }

  var PRODUCTION_PAGES = 'https://www.qraivy.com';
  function pageOrigin(routing) {
    if (!routing || routing.blocked) return '';
    if (routing.mode === 'production') return PRODUCTION_PAGES;
    if (routing.mode === 'deals-preview') return DEALS_PREVIEW_API;
    if (routing.mode === 'local') return routing.api || '';
    return '';
  }

  window.QraivyDealsRouting = { resolve: resolve, pageOrigin: pageOrigin, PRODUCTION_API: PRODUCTION_API, PRODUCTION_PAGES: PRODUCTION_PAGES, DEALS_PREVIEW_HOST: DEALS_PREVIEW_HOST, DEALS_PREVIEW_API: DEALS_PREVIEW_API };
  window.QRAIVY_DEALS_ROUTING = resolve(window.location.hostname, window.QRAIVY_DEALS_LOCAL_API || window.location.origin);
  window.QRAIVY_DEALS_PAGE_ORIGIN = pageOrigin(window.QRAIVY_DEALS_ROUTING);
})();
