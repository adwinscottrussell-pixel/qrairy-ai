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
 * A saved placement on a page that is no longer the owner's (gone: true) is
 * still listed, so it can be removed -- otherwise it would block publishing.
 *
 * window.QraivyDealPagePicker: rows, toggleAction, selectAllSlugs,
 * clearAllPlan, needsIncludePlacements, savePending
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

  root.QraivyDealPagePicker = { rows: rows, toggleAction: toggleAction, selectAllSlugs: selectAllSlugs, clearAllPlan: clearAllPlan, needsIncludePlacements: needsIncludePlacements, savePending: savePending };
})(typeof window !== 'undefined' ? window : this);
