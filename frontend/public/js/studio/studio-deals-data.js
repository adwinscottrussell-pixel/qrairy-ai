/*
 * studio-deals-data.js — Landing Page Studio V3 (Phase D2): the owner's real
 * QRAIVY Deals for the Deals / Offers preview. Read only.
 *
 * The one Studio file that uses the network. It sends exactly these
 * requests, all GET, all to the existing owner endpoints
 * (backend/src/routes/dealRoutes.js: requireAuth, every answer scoped by the
 * server to the signed-in account -- owner level; deals have no business or
 * location scoping of their own):
 *   GET /deals/access   whether this account has Deals at all (rollout and
 *                       plan; without it the public page shows no deals)
 *   GET /deals/pages    the account's landing pages, each with shownDealIds:
 *                       the deals that page shows customers right now (the
 *                       server's own decision, the same as the public cards)
 *   GET /deals          the account's deals, for their content
 * Nothing is created, changed or published. Only the Studio shell calls
 * this file, never the sandboxed preview frames. The token is the signed-in
 * Clerk session's (window.Clerk.session.getToken(), as in the Deal Builder),
 * passed in by the shell. Without an API address (studio-routing.js names
 * none on any address in this phase) nothing is sent and the preview shows
 * labelled samples.
 *
 * What may appear as a real deal: only an id in the selected page's
 * shownDealIds whose deal is published, running and has no unpublished
 * changes. GET /deals returns pending edits merged over the live values, so
 * a deal with unpublished changes is withheld (counted, never shown).
 * Drafts, archived, scheduled and expired deals never appear, and only
 * display fields leave this file. A failure is a failure: it is never
 * answered with samples.
 *
 * In Node: module.exports (for the tests). In the Studio:
 * window.QraivyStudioDeals.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.QraivyStudioDeals = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // the only requests this file can make
  var PATHS = { access: '/deals/access', pages: '/deals/pages', deals: '/deals' };
  var ALLOWED = [PATHS.access, PATHS.pages, PATHS.deals];
  // an API origin: https, or a local test server; no path, no query
  var API = /^(?:https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+|http:\/\/(?:127\.0\.0\.1|localhost))(?::[0-9]{1,5})?$/;
  var TIMEOUT_MS = 15000;
  var MAX_CARDS = 3;
  var SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
  var DEAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
  var CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[A-Za-z0-9_,:.\/-]+\.(?:jpe?g|png|webp)$/;
  // Starter images: the Deal Builder's catalog (js/deal-starter-images.js),
  // served from the account's Cloudinary copies (qraivy-deal-starters/<id>,
  // the same images as the deal cards), at card size.
  var STARTER_BASE = 'https://res.cloudinary.com/dwqc6n7rn/image/upload/c_fill,g_auto,h_600,w_800,f_auto,q_auto/qraivy-deal-starters/';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function text(v, max) { return typeof v === 'string' && v.trim() && v.length <= max ? v : ''; }
  function result(state, extra) {
    var r = { state: state, pages: [], page: '', items: [], withheld: 0 };
    Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }
  function Failure(state) { this.state = state; }

  // createDealsData({ api, getToken, starters, fetch })
  //   api       the API origin (from studio-routing.js); '' = not connected
  //   getToken  () -> the Clerk session token (or a promise of it)
  //   starters  the starter catalog's images (QRAIVY_DEAL_STARTER_IMAGES.images)
  //   fetch     for the tests only; the browser's fetch otherwise
  function createDealsData(o) {
    var api = typeof o.api === 'string' && API.test(o.api) ? o.api : '';
    var doFetch = typeof o.fetch === 'function' ? o.fetch : typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
    var starters = {};
    (Array.isArray(o.starters) ? o.starters : []).forEach(function (s) {
      if (isObj(s) && typeof s.id === 'string' && /^[a-z0-9-]{1,64}$/.test(s.id)) starters[s.id] = isObj(s.origin) && s.origin.type === 'ai_generated';
    });
    var last = null; // the answers of the last successful load (pages, deals)

    function connected() { return !!(api && doFetch && typeof o.getToken === 'function'); }

    function get(path) {
      if (ALLOWED.indexOf(path) === -1) return Promise.reject(new Failure('error'));
      return Promise.resolve().then(function () { return o.getToken(); }).then(function (token) {
        if (typeof token !== 'string' || !token) throw new Failure('signin');
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
        var init = { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' };
        if (ctl) init.signal = ctl.signal;
        return doFetch(api + path, init).then(function (res) {
          clearTimeout(timer);
          if (res.status === 401) throw new Failure('signin');
          // 403: this account may not use Deals here (rollout, plan or staging list)
          if (res.status === 403) throw new Failure('disabled');
          if (!res.ok) throw new Failure('error');
          return res.json().catch(function () { throw new Failure('error'); });
        }, function () { clearTimeout(timer); throw new Failure('error'); });
      });
    }

    function image(im) {
      if (!isObj(im)) return null;
      if (im.source === 'uploaded' && typeof im.url === 'string' && im.url.length <= 500 && CLOUDINARY.test(im.url)) return { src: im.url, ai: im.aiGenerated === true };
      if (im.source === 'starter' && typeof im.starterId === 'string' && Object.prototype.hasOwnProperty.call(starters, im.starterId)) {
        // every starter image is AI-generated; the label is shown unless the catalog says otherwise
        return { src: STARTER_BASE + im.starterId + '.jpg', ai: starters[im.starterId] || im.aiGenerated === true };
      }
      return null; // a background colour, or nothing usable: the card shows no picture
    }
    function item(d) {
      var title = text(d.title, 80), offerText = text(d.offerText, 120);
      if (!title || !offerText) return null;
      var ends = typeof d.endsAt === 'string' && !isNaN(Date.parse(d.endsAt)) ? new Date(d.endsAt).toISOString() : '';
      return { title: title, offerText: offerText, description: text(d.description, 400), endsAt: ends, image: image(d.image) };
    }
    function running(d, now) {
      var s = typeof d.startsAt === 'string' ? Date.parse(d.startsAt) : NaN, e = typeof d.endsAt === 'string' ? Date.parse(d.endsAt) : NaN;
      return !(s > now) && !(e < now);
    }

    // The preview for one page, from the last answers.
    function build(slug) {
      var pages = last.pages, page = pages.filter(function (p) { return p.slug === slug; })[0] || pages.filter(function (p) { return p.live; })[0] || pages[0];
      var list = pages.map(function (p) { return { slug: p.slug, name: p.name, live: p.live }; });
      if (!page) return result('none', { pages: list });
      var items = [], withheld = 0, now = Date.now();
      page.shown.forEach(function (id) {
        var d = last.deals[id];
        if (!d || d.status !== 'published' || d.displayStatus !== 'published' || d.isExpired === true || !running(d, now)) return;
        if (d.hasUnpublishedChanges !== false) { withheld += 1; return; }
        var x = item(d);
        if (x) items.push(x);
      });
      return result(items.length || withheld ? 'live' : 'none', { pages: list, page: page.slug, items: items.slice(0, MAX_CARDS), withheld: withheld });
    }
    function remember(pagesRes, dealsRes) {
      if (!isObj(pagesRes) || !Array.isArray(pagesRes.pages) || !isObj(dealsRes) || !Array.isArray(dealsRes.deals)) throw new Failure('error');
      var pages = pagesRes.pages.slice(0, 500).filter(function (p) { return isObj(p) && typeof p.slug === 'string' && SLUG.test(p.slug) && Array.isArray(p.shownDealIds); })
        .map(function (p) {
          return { slug: p.slug, name: text(p.name, 120) || p.slug, live: p.live === true,
            shown: p.shownDealIds.filter(function (id) { return typeof id === 'string' && DEAL_ID.test(id); }).slice(0, MAX_CARDS) };
        });
      var deals = {};
      dealsRes.deals.slice(0, 1000).forEach(function (d) { if (isObj(d) && typeof d.dealId === 'string' && DEAL_ID.test(d.dealId)) deals[d.dealId] = d; });
      last = { pages: pages, deals: deals };
    }

    // load(slug) -> Promise of { state, pages, page, items, withheld }
    // state: 'sample' (not connected: no request), 'live', 'none', 'signin',
    // 'disabled' or 'error'. Never rejects.
    function load(slug) {
      if (!connected()) return Promise.resolve(result('sample'));
      return get(PATHS.access).then(function (a) {
        if (!isObj(a) || typeof a.allowed !== 'boolean') throw new Failure('error');
        if (!a.allowed) return result('disabled');
        return get(PATHS.pages).then(function (pagesRes) {
          return get(PATHS.deals).then(function (dealsRes) { remember(pagesRes, dealsRes); return build(slug); });
        });
      }).catch(function (e) {
        last = null;
        return result(e instanceof Failure ? e.state : 'error');
      });
    }
    // Another of the owner's pages: from the answers already loaded, no request.
    function select(slug) { return last ? build(slug) : null; }

    return { connected: connected, load: load, select: select };
  }

  return { PATHS: PATHS, ALLOWED: ALLOWED.slice(), STARTER_BASE: STARTER_BASE, MAX_CARDS: MAX_CARDS, createDealsData: createDealsData };
});
