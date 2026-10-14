// ============================================================
// dealPagePicker.test.js — Deal Builder, Review step: "Where should this
// Deal appear?" (Phase 3.3).
//
//   A. decisions (js/deal-page-picker.js): page states, ticking and
//      unticking, Select all / Clear all, archived pages, when publishing
//      includes the pages, saving ticks (order, failures, duplicates)
//   B. Deal Builder wiring (deals.html): placement in the Review step,
//      only the owner's pages, save/publish order, no false success,
//      EN/DE texts, escaping, confirmation before removing
//
// Run: node tests/dealPagePicker.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const ctx = { window: {} };
vm.runInNewContext(read('frontend/public/js/deal-page-picker.js'), ctx);
const P = ctx.window.QraivyDealPagePicker;
const plain = (v) => JSON.parse(JSON.stringify(v));

let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }

const PAGES = [{ slug: 'cafe', name: 'Café', live: true }, { slug: 'bar', name: 'Bar', live: true }, { slug: 'shop', name: 'Shop', live: false }, { slug: 'old', name: 'Old', live: true }, { slug: 'pub', name: 'Pub', live: true }];
const BY = { bar: { placementId: 'p1', status: 'draft' }, old: { placementId: 'p2', status: 'archived' }, pub: { placementId: 'p3', status: 'published' } };

// ── A. Decisions ───────────────────────────────────────────────
test('A. each page shows its state: none, selected (unsaved), saved, published here, removed earlier', () => {
  const r = Object.fromEntries(P.rows(PAGES, BY, new Set(['cafe'])).map((x) => [x.slug, x]));
  assert.deepEqual(plain([r.cafe.state, r.cafe.checked, r.cafe.disabled]), ['pending', true, false]);
  assert.deepEqual(plain([r.bar.state, r.bar.checked, r.bar.placementId]), ['draft', true, 'p1']);
  assert.deepEqual(plain([r.pub.state, r.pub.checked]), ['published', true]);
  assert.deepEqual(plain([r.old.state, r.old.checked, r.old.disabled, r.old.placementId]), ['archived', false, false, 'p2'], 'removed earlier: unticked, but selectable');
  assert.deepEqual(plain([r.shop.state, r.shop.checked, r.shop.live]), ['none', false, false]);
  assert.deepEqual(plain(P.rows(null, null, null)), []);
});

test('A. ticking adds an unsaved choice; unticking it simply drops it', () => {
  const rows = P.rows(PAGES, BY, new Set(['cafe']));
  assert.deepEqual(plain(P.toggleAction(rows.find((r) => r.slug === 'shop'))), { type: 'add-pending' });
  assert.deepEqual(plain(P.toggleAction(rows.find((r) => r.slug === 'cafe'))), { type: 'remove-pending' });
});

test('A. unticking a saved or published page means archiving it (asked first); a page removed earlier can be ticked again', () => {
  const rows = P.rows(PAGES, BY, new Set());
  assert.deepEqual(plain(P.toggleAction(rows.find((r) => r.slug === 'bar'))), { type: 'archive', placementId: 'p1' });
  assert.deepEqual(plain(P.toggleAction(rows.find((r) => r.slug === 'pub'))), { type: 'archive', placementId: 'p3' });
  assert.deepEqual(plain(P.toggleAction(rows.find((r) => r.slug === 'old'))), { type: 'add-pending' }, 'restored by the server on Save / Publish');
  const again = Object.fromEntries(P.rows(PAGES, BY, new Set(['old'])).map((x) => [x.slug, x]));
  assert.deepEqual(plain([again.old.state, again.old.checked]), ['pending', true], 'ticked again: Selected');
  assert.deepEqual(plain(P.toggleAction(again.old)), { type: 'remove-pending' });
  assert.deepEqual(plain(P.toggleAction(undefined)), { type: 'blocked' });
});

test('A. Select all picks every page not chosen yet, including pages removed earlier', () => {
  assert.deepEqual(plain(P.selectAllSlugs(P.rows(PAGES, BY, new Set(['cafe'])))), ['shop', 'old']);
  assert.deepEqual(plain(P.selectAllSlugs(P.rows(PAGES, {}, new Set()))), ['cafe', 'bar', 'shop', 'old', 'pub']);
});

test('A. Clear all drops unsaved choices at once and lists saved pages for a confirmed archive', () => {
  const plan = plain(P.clearAllPlan(P.rows(PAGES, BY, new Set(['cafe']))));
  assert.deepEqual(plan, { dropPending: ['cafe'], archive: [{ slug: 'bar', placementId: 'p1' }, { slug: 'pub', placementId: 'p3' }] });
});

test('A. publishing includes the pages only when a saved page is waiting to be published', () => {
  assert.equal(P.needsIncludePlacements(BY), true);
  assert.equal(P.needsIncludePlacements({ pub: { status: 'published' }, old: { status: 'archived' } }), false, 'nothing to publish: plain publish as before');
  assert.equal(P.needsIncludePlacements({}), false, 'no pages selected: plain publish as before');
  assert.equal(P.needsIncludePlacements(undefined), false);
});

test('A. saving ticks: one POST per page, exact body, the deal id encoded, saved pages marked', async () => {
  const calls = [];
  const api = async (m, p, b) => { calls.push([m, p, b]); return { placement: { placementId: 'n' + calls.length, status: 'draft', targetRef: b.targetRef } }; };
  const pending = new Set(['cafe', 'shop']), bySlug = {};
  const r = await P.savePending(api, 'deal/1', pending, bySlug);
  assert.deepEqual(plain(r), { ok: true });
  assert.deepEqual(plain(calls), [['POST', '/deals/deal%2F1/placements', { channel: 'landing_page', targetRef: 'cafe' }], ['POST', '/deals/deal%2F1/placements', { channel: 'landing_page', targetRef: 'shop' }]]);
  assert.equal(pending.size, 0);
  assert.deepEqual(Object.keys(bySlug), ['cafe', 'shop']);
});

test('A. a failed save stops at once and is reported; pages saved before it stay saved', async () => {
  let n = 0;
  const api = async (m, p, b) => { n += 1; if (n === 2) { const e = new Error('nope'); e.status = 500; throw e; } return { placement: { placementId: 'x' + n, status: 'draft' } }; };
  const pending = new Set(['a', 'b', 'c']), bySlug = {};
  const r = await P.savePending(api, 'd1', pending, bySlug);
  assert.equal(r.ok, false); assert.equal(r.slug, 'b'); assert.equal(r.error.status, 500);
  assert.equal(n, 2, 'the third page was not attempted');
  assert.deepEqual(Object.keys(bySlug), ['a']);
  assert.deepEqual([...pending], ['b', 'c'], 'unsaved choices are kept for another try');
});

test('A. a duplicate (409) is reported as a conflict, never as success; no second placement is created', async () => {
  const api = async () => { const e = new Error('dup'); e.status = 409; throw e; };
  const pending = new Set(['cafe']), bySlug = {};
  const r = plain(await P.savePending(api, 'd1', pending, bySlug));
  assert.deepEqual(r, { ok: false, conflict: true, slug: 'cafe' });
  assert.equal(pending.size, 0);
  assert.deepEqual(bySlug, {});
});

test("A. a saved page that is no longer the owner's is still listed, so it can be removed instead of blocking publishing", () => {
  const r = P.rows([{ slug: 'cafe', name: 'Café', live: true }], { gone: { placementId: 'pg', status: 'draft' }, sold: { placementId: 'ps', status: 'published' }, past: { placementId: 'pa', status: 'archived' } }, new Set());
  const gone = r.find((x) => x.slug === 'gone');
  assert.deepEqual(plain([gone.gone, gone.checked, gone.disabled, gone.state]), [true, true, false, 'draft']);
  assert.ok(r.find((x) => x.slug === 'sold').gone);
  assert.equal(r.find((x) => x.slug === 'past'), undefined, 'removed ones are not listed again');
  assert.deepEqual(plain(P.toggleAction(gone)), { type: 'archive', placementId: 'pg' });
  assert.deepEqual(plain(P.selectAllSlugs(r)), ['cafe'], 'only the owner\'s own unchosen page; pages no longer theirs are never offered');
  assert.equal(r.find((x) => x.slug === 'cafe').gone, false);
});

test('A. "publish on landing page" is offered only for a saved page of an already-published deal', () => {
  const r = Object.fromEntries(P.rows(PAGES, BY, new Set(['cafe'])).map((x) => [x.slug, x]));
  assert.equal(P.canPublishOnPage(r.bar, 'published'), true, 'saved page, published deal');
  assert.equal(P.canPublishOnPage(r.bar, 'draft'), false, 'the deal is not published yet: Publish publishes both');
  assert.equal(P.canPublishOnPage(r.bar, 'archived'), false);
  for (const s of ['cafe', 'pub', 'old', 'shop']) assert.equal(P.canPublishOnPage(r[s], 'published'), false, s + ' (' + r[s].state + ')');
  const gone = P.rows(PAGES, { ...BY, sold: { placementId: 'pg', status: 'draft' } }, new Set()).find((x) => x.slug === 'sold');
  assert.equal(P.canPublishOnPage(gone, 'published'), false, 'not one of the owner\'s pages any more');
  assert.equal(P.canPublishOnPage(undefined, 'published'), false);
});

test('A. publishing on a page sends ONLY the placement-publish request; the page is then "published here"', async () => {
  const calls = [];
  const by = { bar: { placementId: 'p 1', dealId: 'd/1', status: 'draft', targetRef: 'bar' } };
  const row = P.rows(PAGES, by, new Set()).find((x) => x.slug === 'bar');
  const api = async (m, p, b) => { calls.push([m, p, b]); return { placement: { placementId: 'p 1', dealId: 'd/1', targetRef: 'bar', channel: 'landing_page', status: 'published', publishedAt: 'now' } }; };
  assert.deepEqual(plain(await P.publishOnPage(api, 'd/1', row, by)), { ok: true });
  assert.deepEqual(calls.map((c) => c.slice(0, 2)), [['POST', '/deals/d%2F1/placements/p%201/publish']], 'one request, ids encoded');
  assert.equal(calls[0][2], undefined, 'no body');
  assert.ok(!calls.some((c) => /^\/deals\/[^/]+\/publish$/.test(c[1])), 'never the deal publish');
  assert.equal(by.bar.status, 'published');
  assert.equal(P.rows(PAGES, by, new Set()).find((x) => x.slug === 'bar').state, 'published');
});

test('A. a refused or odd response publishes nothing locally: the page stays "saved"', async () => {
  const by = { bar: { placementId: 'p1', status: 'draft', targetRef: 'bar' } };
  const row = P.rows(PAGES, by, new Set()).find((x) => x.slug === 'bar');
  const err = { status: 400 };
  const r1 = await P.publishOnPage(async () => { throw err; }, 'd1', row, by);
  assert.equal(r1.ok, false); assert.equal(r1.error, err);
  const r2 = await P.publishOnPage(async () => ({ placement: { placementId: 'other', status: 'published' } }), 'd1', row, by);
  assert.deepEqual(plain(r2), { ok: false, error: null });
  const r3 = await P.publishOnPage(async () => ({ placement: { placementId: 'p1', status: 'draft' } }), 'd1', row, by);
  assert.equal(r3.ok, false);
  assert.equal(by.bar.status, 'draft');
});

// ── B. Deal Builder wiring ─────────────────────────────────────
const page = read('frontend/public/deals.html');
const panel4 = page.slice(page.indexOf('data-panel="4"'), page.indexOf('<!-- LIVE PREVIEW -->'));
// the source of one function in deals.html, from its definition to its closing brace
const fn = (name) => {
  let at = page.indexOf('  function ' + name + '(');
  if (at === -1) at = page.indexOf('  async function ' + name + '(');
  return page.slice(at, page.indexOf('\n  }\n', at) + 4);
};

test('B. the picker sits in the Review step; no new wizard step', () => {
  assert.ok(page.includes('<script src="js/deal-page-picker.js"></script>'));
  const issues = panel4.indexOf('id="deal-issues"'), box = panel4.indexOf('id="deal-pages"'), note = panel4.indexOf('data-i18n="s4_note"');
  assert.ok(issues > -1 && issues < box && box < note, 'between the checks and the publish note');
  for (const id of ['deal-pages-all', 'deal-pages-none', 'deal-pages-status', 'deal-pages-list']) assert.ok(panel4.includes('id="' + id + '"'), id);
  assert.equal((page.match(/class="deal-step" type="button" data-step="/g) || []).length, 4, 'still four steps');
});

test('B. only the signed-in owner\'s pages are listed, and the deal\'s own placements restored', () => {
  const load = fn('loadPicker');
  assert.ok(load.includes("api('GET', '/deals/pages')"));
  assert.ok(load.includes("api('GET', '/deals/' + encodeURIComponent(forDeal) + '/placements')"));
  assert.ok(load.includes("if (p.channel === 'landing_page') picker.bySlug[p.targetRef] = p;"));
  assert.ok(page.includes('    loadPicker(false);\n  }'), 'loaded when the Review step is drawn');
  assert.ok(page.includes('    picker = freshPicker();\n    editingId = deal ? deal.id : null;'), 'a fresh picker for every deal opened');
});

test('B. Save and Publish: deal first, then the ticked pages, then publish -- and no success unless all worked', () => {
  const c = page.slice(page.indexOf('  async function commit('), page.indexOf('  // ── Image upload'));
  const persist = c.indexOf('if (!(await persist())) return false;'), pages = c.indexOf('if (!(await savePickedPages())) return false;'), pub = c.indexOf("+ '/publish'");
  assert.ok(persist > -1 && persist < pages && pages < pub);
  assert.ok(c.includes("withPages ? { includePlacements: true } : undefined"), 'pages are published with the deal only when there are saved pages');
  assert.ok(c.includes("if (withPages && err instanceof ApiError && err.status === 409) { showAlert(t('e_pages_publish')); await loadPicker(true); }"));
  assert.ok(c.indexOf("toast(t(status === 'published' ? 'toast_published' : 'toast_draft'));") > c.indexOf('if (!done) return;'), 'the success message only after everything succeeded');
  const save = fn('savePickedPages');
  assert.ok(save.includes('if (res.ok) return true;') && save.includes('return false;'));
  assert.ok(save.includes("t('e_pages_conflict'") && save.includes("t('e_pages_save'"));
});

test('B. removing a saved page asks first, and a failed removal is reported and the list reloaded', () => {
  const toggle = fn('onPageToggle');
  assert.ok(toggle.includes("window.confirm(t('pg_confirm_remove', { name: row.name }))"));
  const none = fn('onPagesNone');
  assert.ok(none.includes("window.confirm(t('pg_confirm_clear', { n: plan.archive.length }))"));
  const remove = page.slice(page.indexOf('  async function removePages('), page.indexOf('  function onPageToggle('));
  assert.ok(remove.includes("+ '/archive'") && remove.includes("t('e_pages_remove'") && remove.includes('await loadPicker(true);'));
});

test('B. names and slugs are escaped; states, empty and loading texts are shown', () => {
  const render = fn('renderPicker');
  assert.ok(render.includes('esc(r.name)') && render.includes('esc(r.slug)') && render.includes("esc(t('pg_st_' + r.state))"));
  assert.ok(render.includes("(r.disabled || busy ? ' disabled' : '')"));
  assert.ok(render.includes("t('pg_empty')") && render.includes("t('pg_loading')"));
  assert.ok(!page.includes('pg_archived_note'), 'no "cannot be added again" note any more');
  assert.ok(render.includes("t('pg_retry')"), 'a failed load offers a retry');
});

test('B. English and German texts for every label, state and message', () => {
  const keys = ['pg_title', 'pg_lead', 'pg_all', 'pg_none', 'pg_loading', 'pg_retry', 'pg_empty', 'pg_page_draft', 'pg_page_gone', 'pg_st_pending', 'pg_st_draft', 'pg_st_published', 'pg_st_archived',
    'pg_confirm_remove', 'pg_confirm_clear', 'e_pages_load', 'e_pages_save', 'e_pages_conflict', 'e_pages_remove', 'e_pages_publish'];
  for (const k of keys) assert.equal((page.match(new RegExp('\\b' + k + ": '", 'g')) || []).length, 2, k);
  assert.ok(page.includes("pg_title: 'Where should this Deal appear?'") && page.includes("pg_title: 'Wo soll dieser Deal erscheinen?'"));
  // removal can be undone: the warnings say so, and nothing claims it is permanent
  assert.ok(page.includes("pg_confirm_remove: 'Remove this deal from “{name}”? You can add it to this page again later.'"));
  assert.ok(page.includes("pg_confirm_remove: 'Diesen Deal von „{name}“ entfernen? Du kannst ihn dieser Seite später wieder hinzufügen.'"));
  assert.ok(page.includes("You can add it to those pages again later.") && page.includes('Du kannst ihn diesen Seiten später wieder hinzufügen.'));
  assert.ok(page.includes("pg_st_archived: 'Removed earlier'") && page.includes("pg_st_archived: 'Früher entfernt'"));
  for (const gone of ['cannot add it to this page again', 'cannot be added to it again', 'nicht erneut hinzufügen', 'nicht erneut hinzugefügt']) assert.ok(!page.includes(gone), gone);
});

test('B. "Auf Landingpage veröffentlichen": shown per saved page of a published deal, publishes only that placement', () => {
  const render = fn('renderPicker');
  assert.ok(render.includes('lib.canPublishOnPage(r, draft.status)') && render.includes('data-publish-page="') && render.includes("t('pg_publish_one')") && render.includes("t('pg_publish_hint')"));
  assert.ok(render.indexOf('</label>') < render.indexOf("+ one + '</li>'"), 'the button sits outside the checkbox label');
  const h = fn('onPublishOnPage');
  assert.ok(h.includes('lib.canPublishOnPage(row, draft.status)') && h.includes('lib.publishOnPage(api, draft.id, row, picker.bySlug)'));
  assert.ok(!/api\(|persist\(|savePickedPages\(|\/publish'/.test(h.replace('lib.publishOnPage(api,', '')), 'no deal save, no deal publish, no tick saving');
  assert.ok(h.includes("t('pg_publish_ok'") && h.includes("t('e_pages_publish_one'") && h.includes('await loadPicker(true)'), 'success message; failure explained and the list reloaded');
  assert.ok(page.includes("else if (e.target.closest('[data-publish-page]'))"), 'wired through the list\'s click handler');
  // the deal's own Publish is unchanged
  const c = fn('commit');
  assert.ok(c.includes("'/publish', withPages ? { includePlacements: true } : undefined") && !c.includes('publishOnPage'));
  for (const k of ['pg_publish_one', 'pg_publish_hint', 'pg_publish_ok', 'e_pages_publish_one']) assert.equal((page.match(new RegExp('\\b' + k + ": '", 'g')) || []).length, 2, k);
  assert.ok(page.includes("pg_publish_one: 'Publish on landing page'") && page.includes("pg_publish_one: 'Auf Landingpage veröffentlichen'"));
  assert.ok(page.includes('Unpublished changes stay unpublished.') && page.includes('Unveröffentlichte Änderungen bleiben unveröffentlicht.'));
  const css = read('frontend/public/deals-page.css');
  assert.ok(css.includes('.deal-page__actions { display: flex; flex-wrap: wrap;') && css.includes('.deal-page__hint {'));
});

test('B. responsive styles for the list', () => {
  const css = read('frontend/public/deals-page.css');
  const block = css.slice(css.indexOf('/* ── Review: where the deal appears'), css.indexOf('/* ── Step 2: formats preview'));
  assert.ok(block.includes('.deal-page__row {') && block.includes('overflow-wrap: anywhere;') && block.includes('.deal-pages__tools { display: flex; flex-wrap: wrap;'));
  assert.ok(block.includes('var(--qds-color-brand-primary)'));
});

(async () => {
  for (const [name, f] of queue) {
    try { await f(); passed++; console.log('PASS  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
