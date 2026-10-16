/*
 * deal-page-picker.js — "Where should this Deal appear?" (Deal Builder,
 * Review step). Decides what the owner's landing pages show and which
 * requests to send; deals.html draws it and talks to the API.
 *
 * Per page (only the signed-in owner's pages, from GET /deals/pages):
 *   none       not chosen
 *   pending    ticked here, not saved yet -> POST /deals/:id/placements on
 *              Save draft / Publish
 *   draft      saved with the deal; published together with it
 *              (POST /deals/:id/publish { includePlacements: true })
 *   published  the deal is published on this page
 *   archived   removed from this deal earlier; can be ticked again -- on
 *              Save / Publish the server restores that same placement as a
 *              draft (never a second record, never published by itself)
 * Unticking a saved page (draft or published) archives it, after asking.
 * "Publish on landing page": a saved (draft) page of a deal that is already
 * published can be published on its own -- POST
 * /deals/:id/placements/:placementId/publish. The deal itself is not
 * republished: its live version stays as it is, and unpublished changes
 * stay unpublished.
 * A saved placement on a page that is no longer the owner's (gone: true) is
 * still listed, so it can be removed -- otherwise it would block publishing.
 *
 * Links to the customer page (dealLinks), at the site's customer-page origin
 * (QRAIVY_DEALS_PAGE_ORIGIN): for a deal that is shown right now on a page
 * the owner still has and that is live -- the offers link (#qraivy-deals),
 * and the deal's own link (#qraivy-deal-<id>) only when that page lists the
 * deal among the cards it shows (GET /deals/pages shownDealIds: at most three).
 * Shared links are the public address; the owner's own View adds ?preview=1
 * so it never counts as a visit. Scheduled: a start-date hint, no link.
 * Expired, archived and draft deals: nothing.
 *
 * window.QraivyDealPagePicker: rows, toggleAction, selectAllSlugs,
 * clearAllPlan, needsIncludePlacements, savePending, canPublishOnPage,
 * publishOnPage, pageUrl, dealLinks, DEALS_ANCHOR, DEAL_ANCHOR_PREFIX
 */
(function (root) {
  function rows(pages, bySlug, pending) {
    bySlug = bySlug || {};
    var mine = {};
    var list = (pages || []).map(function (p) {
      mine[p.slug] = true;
      var pl = bySlug[p.slug] || null;
      var state = pl && pl.status !== 'archived' ? pl.status
        : (pending && pending.has(p.slug) ? 'pending' : (pl ? 'archived' : 'none'));
      return {
        slug: p.slug, name: p.name || p.slug, live: p.live !== false,
        state: state, placementId: pl ? pl.placementId : null,
        checked: state === 'pending' || state === 'draft' || state === 'published',
        disabled: false, gone: false
      };
    });
    Object.keys(bySlug).forEach(function (slug) {
      var pl = bySlug[slug];
      if (mine[slug] || !pl || (pl.status !== 'draft' && pl.status !== 'published')) return;
      list.push({ slug: slug, name: slug, live: false, state: pl.status, placementId: pl.placementId, checked: true, disabled: false, gone: true });
    });
    return list;
  }

  // What ticking or unticking one page means.
  function toggleAction(row) {
    if (!row) return { type: 'blocked' };
    if (row.state === 'none' || row.state === 'archived') return { type: 'add-pending' };
    if (row.state === 'pending') return { type: 'remove-pending' };
    return { type: 'archive', placementId: row.placementId };      // draft or published: ask first
  }

  // Select all: every page of the owner that is not chosen yet, including pages removed earlier.
  function selectAllSlugs(rowList) {
    return (rowList || []).filter(function (r) { return !r.gone && (r.state === 'none' || r.state === 'archived'); }).map(function (r) { return r.slug; });
  }
  // Clear all: drop unsaved ticks at once; saved pages need a confirmed archive.
  function clearAllPlan(rowList) {
    var list = rowList || [];
    return {
      dropPending: list.filter(function (r) { return r.state === 'pending'; }).map(function (r) { return r.slug; }),
      archive: list.filter(function (r) { return r.state === 'draft' || r.state === 'published'; }).map(function (r) { return { slug: r.slug, placementId: r.placementId }; })
    };
  }

  // Publish with includePlacements only when there is a draft placement to publish;
  // otherwise publishing is exactly what it was before pages existed.
  function needsIncludePlacements(bySlug) {
    return Object.keys(bySlug || {}).some(function (s) { return bySlug[s].status === 'draft'; });
  }

  // Saves the unsaved ticks, one page at a time. Stops at the first failure and
  // reports it; pages saved before that stay saved (and are shown as saved).
  // A 409 means the page already has a placement for this deal: the caller reloads.
  async function savePending(api, dealId, pending, bySlug) {
    var list = Array.from(pending || []);
    for (var i = 0; i < list.length; i++) {
      var slug = list[i];
      try {
        var res = await api('POST', '/deals/' + encodeURIComponent(dealId) + '/placements', { channel: 'landing_page', targetRef: slug });
        bySlug[slug] = res.placement;
        pending.delete(slug);
      } catch (err) {
        if (err && err.status === 409) { pending.delete(slug); return { ok: false, conflict: true, slug: slug }; }
        return { ok: false, slug: slug, error: err };
      }
    }
    return { ok: true };
  }

  // Only a saved page of the owner, on a deal that is already published
  // (dealStatus = the deal's status on the server, not the form).
  function canPublishOnPage(row, dealStatus) {
    return !!row && row.state === 'draft' && !row.gone && !!row.placementId && dealStatus === 'published';
  }

  // Publishes that one placement -- never the deal. On success the page is
  // marked "published here"; on failure nothing is changed here.
  async function publishOnPage(api, dealId, row, bySlug) {
    try {
      var res = await api('POST', '/deals/' + encodeURIComponent(dealId) + '/placements/' + encodeURIComponent(row.placementId) + '/publish');
      if (!res || !res.placement || res.placement.placementId !== row.placementId || res.placement.status !== 'published') return { ok: false, error: null };
      bySlug[row.slug] = res.placement;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  // The customer address of one page; '' when there is no safe one.
  // opts.dealId: straight to that deal's card; opts.preview: the owner's own
  // view (?preview=1 -- never counted as a visit, never cached).
  var DEALS_ANCHOR = 'qraivy-deals';
  var DEAL_ANCHOR_PREFIX = 'qraivy-deal-';
  var SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
  var DEAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
  function pageUrl(origin, slug, opts) {
    opts = opts || {};
    var u;
    try { u = new URL(String(origin || '')); } catch (e) { return ''; }
    var local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local)) || u.origin !== String(origin).replace(/\/$/, '')) return '';
    if (typeof slug !== 'string' || !SLUG.test(slug)) return '';
    if (opts.dealId != null && (typeof opts.dealId !== 'string' || !DEAL_ID.test(opts.dealId))) return '';
    return u.origin + '/lp/' + encodeURIComponent(slug) + (opts.preview ? '?preview=1' : '') +
      '#' + (opts.dealId != null ? DEAL_ANCHOR_PREFIX + opts.dealId : DEALS_ANCHOR);
  }

  // The links of one deal, one entry per landing page it is published on
  // (page still the owner's and live), sorted by page name:
  //   shown      the page shows this deal: offersUrl, dealUrl, viewUrl
  //   not-shown  running, but the page does not show it right now (three newer
  //              offers, or cards switched off): offersUrl only if the page
  //              shows any offers, viewUrl to them; no dealUrl
  //   scheduled  starts later: startsAt only, no link yet
  // Expired, archived and draft deals get no entries.
  function dealLinks(deal, placements, pages, origin) {
    if (!deal || typeof deal.id !== 'string' || deal.status !== 'published') return [];
    var display = deal.displayStatus || 'published';
    if (display !== 'published' && display !== 'scheduled') return [];
    var bySlug = {};
    (pages || []).forEach(function (p) { if (p && p.slug) bySlug[p.slug] = p; });
    var seen = {}, out = [];
    (placements || []).forEach(function (pl) {
      if (!pl || pl.channel !== 'landing_page' || pl.status !== 'published' || seen[pl.targetRef]) return;
      var page = bySlug[pl.targetRef];
      if (!page || page.live === false || !pageUrl(origin, pl.targetRef)) return;
      seen[pl.targetRef] = true;
      var entry = { slug: pl.targetRef, name: page.name || pl.targetRef, state: 'scheduled', offersUrl: '', dealUrl: '', viewUrl: '', startsAt: deal.startsAt || null };
      if (display === 'published') {
        var shownIds = Array.isArray(page.shownDealIds) ? page.shownDealIds : [];
        var shown = shownIds.indexOf(deal.id) !== -1;
        entry.state = shown ? 'shown' : 'not-shown';
        if (shownIds.length) {
          entry.offersUrl = pageUrl(origin, pl.targetRef);
          entry.viewUrl = pageUrl(origin, pl.targetRef, shown ? { dealId: deal.id, preview: true } : { preview: true });
        }
        if (shown) entry.dealUrl = pageUrl(origin, pl.targetRef, { dealId: deal.id });
      }
      out.push(entry);
    });
    return out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  root.QraivyDealPagePicker = { rows: rows, toggleAction: toggleAction, selectAllSlugs: selectAllSlugs, clearAllPlan: clearAllPlan, needsIncludePlacements: needsIncludePlacements, savePending: savePending,
    canPublishOnPage: canPublishOnPage, publishOnPage: publishOnPage, pageUrl: pageUrl, dealLinks: dealLinks, DEALS_ANCHOR: DEALS_ANCHOR, DEAL_ANCHOR_PREFIX: DEAL_ANCHOR_PREFIX };
})(typeof window !== 'undefined' ? window : this);
