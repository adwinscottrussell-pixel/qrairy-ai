/*
 * onboarding-drafts.js — Landing Page Studio V3 onboarding (D2.2): Save Draft.
 *
 * The onboarding's only request, and only this one:
 *   POST <api>/studio/drafts  { name, language, kind, requestId, design, origin }
 * (backend/src/lpV3/studioDraftsController.js, D2.1: requireAuth,
 * requireVerifiedEmail, the owner is the session's account, one transaction,
 * idempotent requestId, 3 unpublished drafts, 5 creations per 24 hours). It
 * creates an unpublished, private draft: never a public page, never a trial,
 * plan or billing change. The token is the signed-in Clerk session's
 * (studio-auth.js loads Clerk); it is sent in the Authorization header only,
 * never stored. Without an API address (any address but the isolated staging
 * one) nothing is sent.
 *
 * create(body) resolves { slug, name, revision, created } only on the
 * server's 201 / 200 with a well-formed answer, else rejects with a Failure:
 *   signin       no session or token, or 401
 *   unverified   403 email_unverified
 *   forbidden    any other 403 (e.g. an account staging does not allow)
 *   limit        409 draft_limit                 info { limit, active }
 *   conflict     409 request_id_conflict / request_id_used (a new requestId is needed)
 *   rate         429 draft_rate_limit            info { retryAfterSeconds }
 *   invalid      400 / 422 (the page or a field was refused)
 *   unavailable  5xx, another status, or an answer that is not the expected one
 *   network      no answer (offline, blocked, timed out)
 *
 * In Node: module.exports (for the tests). In the browser:
 * window.QraivyOnboardingDrafts.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.QraivyOnboardingDrafts = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var PATH = '/studio/drafts';
  // an API origin: https, or a local test server; no path, no query
  var API = /^(?:https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+|http:\/\/(?:127\.0\.0\.1|localhost))(?::[0-9]{1,5})?$/;
  var SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
  var REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var TIMEOUT_MS = 20000;

  function Failure(state, info) { this.state = state; this.info = info || null; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function count(v) { return typeof v === 'number' && v === Math.floor(v) && v >= 0 && v < 1e7 ? v : null; }

  // a version 4 UUID (the request's idempotency key), from the browser's secure random numbers
  function requestId(cryptoObj) {
    var c = cryptoObj || root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = [], HEX = '0123456789abcdef';
    for (var i = 0; i < 16; i++) h.push(HEX.charAt(b[i] >> 4) + HEX.charAt(b[i] & 15));
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join('');
  }

  // the server's answer -> the result, or the Failure to reject with
  function outcome(status, body) {
    var e = isObj(body) && typeof body.error === 'string' ? body.error : '';
    if (status === 200 || status === 201) {
      var p = isObj(body) && isObj(body.page) ? body.page : null;
      var rev = isObj(body) ? count(body.revision) : null;
      if (!p || typeof p.slug !== 'string' || !SLUG.test(p.slug) || !rev || rev < 1) return new Failure('unavailable');
      return { slug: p.slug, name: typeof p.name === 'string' ? p.name.slice(0, 120) : '', revision: rev, created: body.created === true };
    }
    if (status === 401) return new Failure('signin');
    if (status === 403) return new Failure(e === 'email_unverified' ? 'unverified' : 'forbidden');
    if (status === 409 && e === 'draft_limit') return new Failure('limit', { limit: count(body.limit), active: count(body.active) });
    if (status === 409 && (e === 'request_id_conflict' || e === 'request_id_used')) return new Failure('conflict');
    if (status === 429) return new Failure('rate', { retryAfterSeconds: count(body && body.retryAfterSeconds) });
    if (status === 400 || status === 422) return new Failure('invalid');
    return new Failure('unavailable');
  }

  // createDraftClient({ api, session: () => Clerk session or null, fetch })
  function createDraftClient(o) {
    var api = typeof o.api === 'string' && API.test(o.api) ? o.api : '';
    var doFetch = typeof o.fetch === 'function' ? o.fetch : typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
    var sessionOf = typeof o.session === 'function' ? o.session : function () { return null; };

    function available() { return !!(api && doFetch); }

    function create(body) {
      if (!available()) return Promise.reject(new Failure('unavailable'));
      if (!isObj(body) || typeof body.requestId !== 'string' || !REQUEST_ID.test(body.requestId) || !isObj(body.design)) return Promise.reject(new Failure('invalid'));
      return Promise.resolve().then(function () {
        var s = sessionOf();
        return s && typeof s.getToken === 'function' ? s.getToken() : null;
      }).then(function (token) {
        if (typeof token !== 'string' || !token) throw new Failure('signin');
        var ctrl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
        var init = { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' };
        if (ctrl) init.signal = ctrl.signal;
        return Promise.resolve(doFetch(api + PATH, init)).then(function (res) {
          clearTimeout(timer);
          return Promise.resolve(res.json()).catch(function () { return null; }).then(function (json) { return outcome(res.status, json); });
        }, function () { clearTimeout(timer); throw new Failure('network'); });
      }).then(function (r) { if (r instanceof Failure) throw r; return r; }, function (e) { throw e instanceof Failure ? e : new Failure('network'); });
    }

    return { available: available, create: create };
  }

  return { PATH: PATH, TIMEOUT_MS: TIMEOUT_MS, Failure: Failure, requestId: requestId, outcome: outcome, createDraftClient: createDraftClient };
});
