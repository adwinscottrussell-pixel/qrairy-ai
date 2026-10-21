/*
 * studio-routing.js — where Landing Page Studio V3 may run, and with which API.
 *
 * Only studio.html loads this file. Default deny:
 *   localhost, 127.0.0.1, [::1], file:   local mode. NO API at all: the
 *                                         Studio works on a local draft only.
 *   anything else (www.qraivy.com, the   not available yet. The Studio does
 *   staging sites, Vercel previews)       not start and sends no request.
 *
 * A V3 staging host (and later production, behind the pilot list) is added
 * here only together with the server endpoints (Phase 2B).
 *
 * window.QRAIVY_STUDIO_ROUTING = { mode, api, blocked }
 * window.QraivyStudioRouting.resolve(hostname, protocol) is the same decision
 * as a pure function (backend/tests/studioRouting.test.js).
 */
(function () {
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
  function resolve(hostname, protocol) {
    var host = String(hostname || '').toLowerCase();
    if (String(protocol || '') === 'file:' && host === '') return { mode: 'local', api: '', blocked: false };
    if (LOCAL_HOSTS.indexOf(host) !== -1) return { mode: 'local', api: '', blocked: false };
    return { mode: 'unavailable', api: '', blocked: true };
  }
  var loc = window.location || {};
  window.QraivyStudioRouting = { resolve: resolve };
  window.QRAIVY_STUDIO_ROUTING = resolve(loc.hostname, loc.protocol);
})();
