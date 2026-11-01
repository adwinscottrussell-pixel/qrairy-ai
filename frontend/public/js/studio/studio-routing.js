/*
 * studio-routing.js — where Landing Page Studio V3 may run, and with which API.
 *
 * Only studio.html loads this file. Default deny:
 *   localhost, 127.0.0.1, [::1], file:   local mode. NO API at all: the
 *                                         Studio works on a local draft only.
 *   qraivy-studio-staging.vercel.app     preview mode. NO API either: the same
 *   (https, exact name only)              in-memory demo. That Vercel project
 *                                         serves the Studio files only and is
 *                                         behind Vercel Authentication.
 *   studio-preview.qraivy.com            connected preview. The isolated Deals
 *   (https, exact name only)              preview API (Railway deals-preview,
 *                                         its own database, signed-in
 *                                         allowlist), with the QRAIVY sign-in:
 *                                         the owner's real deals, read only
 *                                         (studio-deals-data.js). Never the
 *                                         production API.
 *   qraivy-studio-v3-staging.vercel.app  Studio V3 staging. The isolated
 *   (https, exact name only)              Studio V3 staging API (Railway
 *                                         project qraivy-studio-v3-staging,
 *                                         its own private database, signed-in
 *                                         allowlist) with the sign-in of the
 *                                         separate Clerk DEVELOPMENT
 *                                         application (pk_test). That Vercel
 *                                         project serves the Studio files
 *                                         only and is behind Vercel
 *                                         Authentication. Never the
 *                                         production API or production Clerk.
 *   anything else (www.qraivy.com, the   not available yet. The Studio does
 *   staging sites, the public qraivy-ai   not start and sends no request.
 *   Vercel previews, per-deployment
 *   addresses)
 *
 * Production (behind the pilot list) is added here only together with the
 * server endpoints (Phase 2B).
 *
 * window.QRAIVY_STUDIO_ROUTING = { mode, api, blocked } (+ clerk, builder on
 * the connected preview: the sign-in key for studio-auth.js and the Deal
 * Builder of the same environment; + isolated on the Studio V3 staging
 * address: no other Admin page there, studio-shell.js hides those links)
 * window.QraivyStudioRouting.resolve(hostname, protocol) is the same decision
 * as a pure function (backend/tests/studioRouting.test.js).
 */
(function () {
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
  // exact names, https only; no patterns (the public qraivy-ai previews and
  // the per-deployment addresses must never match)
  var PREVIEW_HOSTS = ['qraivy-studio-staging.vercel.app'];
  // the one connected preview: exact name, https only; the API is the
  // isolated Deals preview (never production), the key is QRAIVY's public
  // Clerk key (the same as deals.html)
  var CONNECTED = {
    'studio-preview.qraivy.com': { api: 'https://qraivy-deals-api-deals-preview.up.railway.app', clerk: 'pk_live_Y2xlcmsucXJhaXZ5LmNvbSQ', builder: 'https://deals-preview.qraivy.com/deals.html' },
    // Studio V3 staging: the isolated Studio V3 staging API (never production) and the
    // separate Clerk DEVELOPMENT application's public key. No Deal Builder in that environment.
    // isolated: that deployment serves the Studio files only, so the Studio hides its links
    // to the other Admin pages (dashboard, deals, …) there instead of sending the owner to a 404.
    'qraivy-studio-v3-staging.vercel.app': { isolated: true, api: 'https://studio-v3-api-production.up.railway.app', clerk: 'pk_test_YnJpZWYtc3dpbmUtNDEzMy5jbGVyay5hY2NvdW50cy5kZXYk' },
  };
  function resolve(hostname, protocol) {
    var host = String(hostname || '').toLowerCase();
    if (String(protocol || '') === 'file:' && host === '') return { mode: 'local', api: '', blocked: false };
    if (LOCAL_HOSTS.indexOf(host) !== -1) return { mode: 'local', api: '', blocked: false };
    if (String(protocol || '') === 'https:' && PREVIEW_HOSTS.indexOf(host) !== -1) return { mode: 'preview', api: '', blocked: false };
    if (String(protocol || '') === 'https:' && Object.prototype.hasOwnProperty.call(CONNECTED, host)) {
      var c = CONNECTED[host];
      return { mode: 'preview', api: c.api, blocked: false, clerk: c.clerk, builder: c.builder, isolated: c.isolated };
    }
    return { mode: 'unavailable', api: '', blocked: true };
  }
  var loc = window.location || {};
  window.QraivyStudioRouting = { resolve: resolve, PREVIEW_HOSTS: PREVIEW_HOSTS.slice(), CONNECTED_HOSTS: Object.keys(CONNECTED) };
  window.QRAIVY_STUDIO_ROUTING = resolve(loc.hostname, loc.protocol);
})();
