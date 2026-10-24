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
 *   anything else (www.qraivy.com, the   not available yet. The Studio does
 *   staging sites, the public qraivy-ai   not start and sends no request.
 *   Vercel previews, per-deployment
 *   addresses)
 *
 * A V3 staging host with an API (and later production, behind the pilot
 * list) is added here only together with the server endpoints (Phase 2B).
 *
 * window.QRAIVY_STUDIO_ROUTING = { mode, api, blocked }
 * window.QraivyStudioRouting.resolve(hostname, protocol) is the same decision
 * as a pure function (backend/tests/studioRouting.test.js).
 */
(function () {
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
  // exact names, https only; no patterns (the public qraivy-ai previews and
  // the per-deployment addresses must never match)
  var PREVIEW_HOSTS = ['qraivy-studio-staging.vercel.app'];
  function resolve(hostname, protocol) {
    var host = String(hostname || '').toLowerCase();
    if (String(protocol || '') === 'file:' && host === '') return { mode: 'local', api: '', blocked: false };
    if (LOCAL_HOSTS.indexOf(host) !== -1) return { mode: 'local', api: '', blocked: false };
    if (String(protocol || '') === 'https:' && PREVIEW_HOSTS.indexOf(host) !== -1) return { mode: 'preview', api: '', blocked: false };
    return { mode: 'unavailable', api: '', blocked: true };
  }
  var loc = window.location || {};
  window.QraivyStudioRouting = { resolve: resolve, PREVIEW_HOSTS: PREVIEW_HOSTS.slice() };
  window.QRAIVY_STUDIO_ROUTING = resolve(loc.hostname, loc.protocol);
})();
