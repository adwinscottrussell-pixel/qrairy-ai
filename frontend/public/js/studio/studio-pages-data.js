/*
 * studio-pages-data.js — Landing Page Studio V3 (Phase A): the signed-in
 * owner's own landing pages. Read only.
 *
 * It sends exactly these requests, both GET, both to the Studio owner
 * endpoints (backend/src/lpV3/studioPagesRoutes.js: requireAuth, ownership
 * LandingPage.userId checked by the server):
 *   GET /studio/pages               the owner's pages
 *   GET /studio/pages/<slug>/design one page as a V3 design (its saved draft,
 *                                   or the legacy page converted in memory)
 * Nothing is created, changed or saved. Only the Studio shell calls this
 * file, never the sandboxed preview frames. The token is the signed-in Clerk
 * session's, handed in by the shell. Without an API address nothing is sent.
 *
 * In Node: module.exports (for the tests). In the Studio:
 * window.QraivyStudioPages.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.QraivyStudioPages = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var LIST = '/studio/pages';
  var SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
  // an API origin: https, or a local test server; no path, no query
  var API = /^(?:https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+|http:\/\/(?:127\.0\.0\.1|localhost))(?::[0-9]{1,5})?$/;
  var TIMEOUT_MS = 15000;

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function text(v, max) { return typeof v === 'string' && v.length <= max ? v : ''; }
  function designPath(slug) { return LIST + '/' + encodeURIComponent(slug) + '/design'; }
  function allowed(path) {
    if (path === LIST) return true;
    var m = /^\/studio\/pages\/([^/]+)\/design$/.exec(path);
    return !!m && SLUG.test(decodeURIComponent(m[1]));
  }
  function Failure(state) { this.state = state; }
  function page(p) {
    if (!isObj(p) || typeof p.slug !== 'string' || !SLUG.test(p.slug)) return null;
    return { slug: p.slug, name: text(p.name, 120) || p.slug, live: p.live === true, kind: p.kind === 'creator' ? 'creator' : 'business', hasDraft: p.hasDraft === true };
  }

  // createPagesData({ api, getToken, fetch })
  function createPagesData(o) {
    var api = typeof o.api === 'string' && API.test(o.api) ? o.api : '';
    var doFetch = typeof o.fetch === 'function' ? o.fetch : typeof root.fetch === 'function' ? root.fetch.bind(root) : null;

    function connected() { return !!(api && doFetch && typeof o.getToken === 'function'); }

    function get(path) {
      if (!allowed(path)) return Promise.reject(new Failure('error'));
      return Promise.resolve().then(function () { return o.getToken(); }).then(function (token) {
        if (typeof token !== 'string' || !token) throw new Failure('signin');
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
        var init = { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' };
        if (ctl) init.signal = ctl.signal;
        return doFetch(api + path, init).then(function (res) {
          clearTimeout(timer);
          if (res.status === 401) throw new Failure('signin');
          if (res.status === 403) throw new Failure('forbidden');
          if (res.status === 404) throw new Failure('notfound');
          if (!res.ok) throw new Failure('error');
          return res.json().catch(function () { throw new Failure('error'); });
        }, function () { clearTimeout(timer); throw new Failure('error'); });
      });
    }
    function fail(e) { return { state: e instanceof Failure ? e.state : 'error' }; }

    // list() -> { state: 'ready' | 'empty' | 'signin' | 'error' | 'notfound', pages }
    // ('notfound': this API has no Studio endpoints). Never rejects.
    function list() {
      if (!connected()) return Promise.resolve({ state: 'off', pages: [] });
      return get(LIST).then(function (r) {
        if (!isObj(r) || !Array.isArray(r.pages)) throw new Failure('error');
        var pages = r.pages.slice(0, 200).map(page).filter(Boolean);
        return { state: pages.length ? 'ready' : 'empty', pages: pages };
      }).catch(function (e) { var f = fail(e); f.pages = []; return f; });
    }
    // load(slug) -> { state: 'loaded', page, design, source, warnings } or
    // { state: 'signin' | 'forbidden' | 'notfound' | 'error' }. Never rejects.
    function load(slug) {
      if (!connected() || typeof slug !== 'string' || !SLUG.test(slug)) return Promise.resolve({ state: 'error' });
      return get(designPath(slug)).then(function (r) {
        var p = isObj(r) ? page(r.page) : null;
        if (!p || !isObj(r.design) || (r.source !== 'draft' && r.source !== 'legacy_import')) throw new Failure('error');
        var warnings = Array.isArray(r.warnings) ? r.warnings.filter(isObj).map(function (w) { return text(w.code, 60); }).filter(Boolean) : [];
        return { state: 'loaded', page: p, design: r.design, source: r.source, warnings: warnings };
      }).catch(fail);
    }

    return { connected: connected, list: list, load: load };
  }

  return { LIST: LIST, SLUG: SLUG, designPath: designPath, allowed: allowed, createPagesData: createPagesData };
});
