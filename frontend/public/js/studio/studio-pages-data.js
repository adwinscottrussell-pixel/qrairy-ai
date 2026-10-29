/*
 * studio-pages-data.js — Landing Page Studio V3: the signed-in owner's own
 * landing pages (Phase A: read; Phase B: Save Draft).
 *
 * It sends exactly these requests, all to the Studio owner endpoints
 * (backend/src/lpV3/studioPagesRoutes.js: requireAuth, ownership
 * LandingPage.userId checked by the server):
 *   GET /studio/pages               the owner's pages
 *   GET /studio/pages/<slug>/design one page as a V3 design (its saved draft,
 *                                   or the legacy page converted in memory)
 *   PUT /studio/pages/<slug>/design save the Studio draft { design,
 *                                   baseRevision }; never publishes, never
 *                                   changes the live page
 * Nothing else is ever created or changed. Only the Studio shell calls this
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
  function Failure(state, info) { this.state = state; this.info = info || null; }
  function revisionOf(v) { return typeof v === 'number' && v === Math.floor(v) && v >= 1 ? v : null; }
  function dateOf(v) { return typeof v === 'string' && v.length <= 40 && !isNaN(Date.parse(v)) ? v : null; }
  function page(p) {
    if (!isObj(p) || typeof p.slug !== 'string' || !SLUG.test(p.slug)) return null;
    return { slug: p.slug, name: text(p.name, 120) || p.slug, live: p.live === true, kind: p.kind === 'creator' ? 'creator' : 'business', hasDraft: p.hasDraft === true };
  }

  // createPagesData({ api, getToken, fetch })
  function createPagesData(o) {
    var api = typeof o.api === 'string' && API.test(o.api) ? o.api : '';
    var doFetch = typeof o.fetch === 'function' ? o.fetch : typeof root.fetch === 'function' ? root.fetch.bind(root) : null;

    function connected() { return !!(api && doFetch && typeof o.getToken === 'function'); }

    // GET to either path; PUT (with a JSON body) only to a design path
    function request(path, body) {
      if (!allowed(path) || (body !== undefined && path === LIST)) return Promise.reject(new Failure('error'));
      return Promise.resolve().then(function () { return o.getToken(); }).then(function (token) {
        if (typeof token !== 'string' || !token) throw new Failure('signin');
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
        var init = { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' };
        if (body !== undefined) { init.method = 'PUT'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
        if (ctl) init.signal = ctl.signal;
        return doFetch(api + path, init).then(function (res) {
          clearTimeout(timer);
          if (res.status === 401) throw new Failure('signin');
          if (res.status === 403) throw new Failure('forbidden');
          if (res.status === 404) throw new Failure('notfound');
          if (res.status === 409 || res.status === 422) {
            return res.json().catch(function () { return null; }).then(function (r) { throw new Failure(res.status === 409 ? 'conflict' : 'invalid', r); });
          }
          if (!res.ok) throw new Failure('error');
          return res.json().catch(function () { throw new Failure('error'); });
        }, function () { clearTimeout(timer); throw new Failure('error'); });
      });
    }
    function get(path) { return request(path); }
    // a refused save or a 409 / 422 on a GET: the states load() knows
    function fail(e) { var st = e instanceof Failure ? e.state : 'error'; return { state: st === 'conflict' || st === 'invalid' ? 'error' : st }; }

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
    // load(slug) -> { state: 'loaded', page, design, source, revision, savedAt, warnings } or
    // { state: 'signin' | 'forbidden' | 'notfound' | 'error' }. Never rejects.
    function load(slug) {
      if (!connected() || typeof slug !== 'string' || !SLUG.test(slug)) return Promise.resolve({ state: 'error' });
      return get(designPath(slug)).then(function (r) {
        var p = isObj(r) ? page(r.page) : null;
        if (!p || !isObj(r.design) || (r.source !== 'draft' && r.source !== 'legacy_import')) throw new Failure('error');
        var warnings = Array.isArray(r.warnings) ? r.warnings.filter(isObj).map(function (w) { return text(w.code, 60); }).filter(Boolean) : [];
        var revision = r.source === 'draft' ? revisionOf(r.revision) : null;
        if (r.source === 'draft' && !revision) throw new Failure('error');
        return { state: 'loaded', page: p, design: r.design, source: r.source, revision: revision, savedAt: dateOf(r.savedAt), warnings: warnings };
      }).catch(fail);
    }
    // save(slug, design, baseRevision) -> { state: 'saved', revision, savedAt } or
    // { state: 'conflict', currentRevision } (a newer version is saved: nothing
    // was overwritten) | 'invalid' (errors) | 'signin' | 'forbidden' |
    // 'notfound' | 'error'. baseRevision: the revision the editor holds (null:
    // no draft yet). Never rejects.
    function save(slug, design, baseRevision) {
      if (!connected() || typeof slug !== 'string' || !SLUG.test(slug) || !isObj(design)) return Promise.resolve({ state: 'error' });
      var base = baseRevision === null ? null : revisionOf(baseRevision);
      if (baseRevision !== null && !base) return Promise.resolve({ state: 'error' });
      return request(designPath(slug), { design: design, baseRevision: base }).then(function (r) {
        var revision = isObj(r) ? revisionOf(r.revision) : null;
        if (!revision) throw new Failure('error');
        return { state: 'saved', revision: revision, savedAt: dateOf(r.savedAt) };
      }).catch(function (e) {
        if (!(e instanceof Failure)) return { state: 'error' };
        var info = isObj(e.info) ? e.info : {};
        if (e.state === 'conflict') return { state: 'conflict', currentRevision: revisionOf(info.currentRevision), savedAt: dateOf(info.savedAt) };
        if (e.state === 'invalid') return { state: 'invalid', errors: Array.isArray(info.errors) ? info.errors.filter(isObj).slice(0, 100).map(function (x) { return { path: text(x.path, 200), code: text(x.code, 60) }; }) : [] };
        return { state: e.state };
      });
    }

    return { connected: connected, list: list, load: load, save: save };
  }

  return { LIST: LIST, SLUG: SLUG, designPath: designPath, allowed: allowed, createPagesData: createPagesData };
});
