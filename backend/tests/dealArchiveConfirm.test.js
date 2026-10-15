// ============================================================
// dealArchiveConfirm.test.js — QRAIVY Deals: archiving needs an explicit
// confirmation (frontend/public/deals.html, #deal-archive-dialog).
//
// Archiving is final (no restore). The page's own code is run, not a
// copy: the dictionary, t(), ApiError and the block between
// "── Archive confirmation" and "── end archive confirmation" are cut out
// of deals.html and evaluated in a sandbox with a stand-in <dialog>,
// stand-in buttons and a stand-in api() that records every request.
//
// Run: node tests/dealArchiveConfirm.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const page = fs.readFileSync(path.join(ROOT, 'frontend', 'public', 'deals.html'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(ROOT, 'frontend', 'public', 'deals-page.css'), 'utf8').replace(/\r\n/g, '\n');

function cut(startMarker, endMarker, { includeEnd = false } = {}) {
  const s = page.indexOf(startMarker);
  const e = page.indexOf(endMarker, s + startMarker.length);
  assert.ok(s !== -1 && e !== -1, 'not found: ' + startMarker.trim());
  return page.slice(s, includeEnd ? e + endMarker.length : e);
}

// A stand-in element with real listener bookkeeping.
function node(id) {
  const listeners = {};
  return {
    id, textContent: '', open: false, shown: 0, closed: 0,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    fire(type) { const e = { type, prevented: false, preventDefault() { this.prevented = true; } }; (listeners[type] || []).slice().forEach((f) => f(e)); return e; },
    click() { return this.fire('click'); },
    listenerCount(type) { return (listeners[type] || []).length; },
  };
}

function load({ lang = 'de', modal = true, confirmAnswer = false, apiImpl } = {}) {
  const dialog = node('deal-archive-dialog');
  if (modal) {
    dialog.showModal = function () { if (this.open) throw new Error('InvalidStateError: already open'); this.open = true; this.shown++; };
    dialog.close = function () { this.open = false; this.closed++; };
  }
  const els = { 'deal-archive-dialog': dialog, 'deal-archive-name': node('deal-archive-name'), 'deal-archive-confirm': node('deal-archive-confirm'), 'deal-archive-cancel': node('deal-archive-cancel') };
  const calls = [], toasts = [], confirms = [];
  let refreshes = 0;
  const ctx = {
    els, calls, toasts, confirms,
    window: { confirm: (msg) => { confirms.push(msg); return confirmAnswer; } },
    api: apiImpl || (async (method, p) => { calls.push(method + ' ' + p); return { deal: { status: 'archived' } }; }),
    toast: (m) => toasts.push(m),
    errorText: (err) => 'error: ' + (err && err.message),
    refreshList: async () => { refreshes++; },
  };
  const src = [
    cut('  var _t = {', '\n  };', { includeEnd: true }),
    "  var _lang = '" + lang + "';",
    '  function $(id) { return els[id] || null; }',
    cut('  function t(key, vars) {', '  function esc(v) {'),
    cut('  function ApiError(status, message)', '\n', { includeEnd: true }),
    // same one-action-at-a-time guard as the page's runBusy()
    '  var busy = false;',
    '  async function runBusy(btn, fn) { if (busy) return undefined; busy = true; try { return await fn(); } finally { busy = false; } }',
    cut('  // ── Archive confirmation', '  // ── end archive confirmation'),
    '  return { t: t, _t: _t, ApiError: ApiError, askArchive: askArchive, confirmArchive: confirmArchive, setBusy: function (v) { busy = v; } };',
  ].join('\n');
  const p = vm.runInNewContext('(function(){' + src + '})()', ctx);
  return { ...p, els, dialog, calls, toasts, confirms, refreshes: () => refreshes };
}

const tick = () => new Promise((r) => setImmediate(r));
const KAFFEE = { id: 'deal_kaffee', title: 'Testangebot Kaffee' };
const BTN = {};

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── W. Wording ─────────────────────────────────────────────────
test('W. German wording is exactly the approved text; English exists and is translated', () => {
  const { _t } = load();
  assert.equal(_t.de.ac_title, 'Deal wirklich archivieren?');
  assert.equal(_t.de.ac_message, 'Dieser Deal wird archiviert und ist danach nicht mehr bearbeitbar oder veröffentlichbar. Die Archivierung kann nicht rückgängig gemacht werden. Ein belegter Deal-Platz wird wieder frei.');
  assert.equal(_t.de.ac_cancel, 'Abbrechen');
  assert.equal(_t.de.ac_confirm, 'Endgültig archivieren');
  for (const k of ['ac_title', 'ac_message', 'ac_cancel', 'ac_confirm', 'ac_untitled']) {
    assert.ok(typeof _t.en[k] === 'string' && _t.en[k].trim(), 'en.' + k);
    assert.notEqual(_t.en[k], _t.de[k], k + ' is translated');
  }
});

// ── C. Confirm ─────────────────────────────────────────────────
test('C. Archive opens the dialog with the deal title and sends nothing until confirmed', async () => {
  const p = load();
  const done = p.confirmArchive(KAFFEE, BTN);
  await tick();
  assert.equal(p.dialog.open, true);
  assert.equal(p.dialog.shown, 1);
  assert.equal(p.els['deal-archive-name'].textContent, 'Testangebot Kaffee', 'the dialog names the deal');
  assert.deepEqual(p.calls, [], 'no request while the question is open');
  p.els['deal-archive-confirm'].click();
  await done;
  assert.deepEqual([...p.calls], ['POST /deals/deal_kaffee/archive'], 'exactly the existing archive request');
  assert.equal(p.dialog.open, false);
  assert.deepEqual([...p.toasts], ['Deal archiviert']);
  assert.equal(p.refreshes(), 1, 'list and usage reload afterwards');
});

test('C. the deal id is URL-encoded and an empty title is named as untitled', async () => {
  const p = load({ lang: 'en' });
  const done = p.confirmArchive({ id: 'a/b?c', title: '   ' }, BTN);
  await tick();
  assert.equal(p.els['deal-archive-name'].textContent, '(untitled deal)');
  p.els['deal-archive-confirm'].click();
  await done;
  assert.deepEqual([...p.calls], ['POST /deals/a%2Fb%3Fc/archive']);
});

test('C. a refused archive shows the error and still reloads; 401 stays silent', async () => {
  const p = load({ apiImpl: async () => { throw new Error('Deal is already archived.'); } });
  let done = p.confirmArchive(KAFFEE, BTN); await tick();
  p.els['deal-archive-confirm'].click(); await done;
  assert.deepEqual([...p.toasts], ['error: Deal is already archived.']);
  assert.equal(p.refreshes(), 1);
  const q = load({ apiImpl: async () => { throw new q.ApiError(401, 'signed out'); } });
  done = q.confirmArchive(KAFFEE, BTN); await tick();
  q.els['deal-archive-confirm'].click(); await done;
  assert.deepEqual([...q.toasts], []);
});

// ── X. Cancel ──────────────────────────────────────────────────
test('X. "Abbrechen" closes the dialog and makes no request at all', async () => {
  const p = load();
  const done = p.confirmArchive(KAFFEE, BTN); await tick();
  p.els['deal-archive-cancel'].click();
  await done;
  assert.equal(p.dialog.open, false);
  assert.deepEqual([...p.calls], []);
  assert.deepEqual([...p.toasts], []);
  assert.equal(p.refreshes(), 0, 'nothing changed, nothing to reload');
});

test('X. Esc (the dialog\'s cancel event) counts as Abbrechen: no request', async () => {
  const p = load();
  const done = p.confirmArchive(KAFFEE, BTN); await tick();
  const e = p.dialog.fire('cancel');
  await done;
  assert.equal(e.prevented, true, 'closed by our code, so the answer is always settled');
  assert.equal(p.dialog.open, false);
  assert.deepEqual([...p.calls], []);
});

test('X. after cancelling, the buttons are unhooked: a later click on the hidden confirm sends nothing', async () => {
  const p = load();
  const done = p.confirmArchive(KAFFEE, BTN); await tick();
  p.els['deal-archive-cancel'].click(); await done;
  for (const id of ['deal-archive-confirm', 'deal-archive-cancel']) assert.equal(p.els[id].listenerCount('click'), 0, id);
  assert.equal(p.dialog.listenerCount('cancel'), 0);
  p.els['deal-archive-confirm'].click(); await tick();
  assert.deepEqual([...p.calls], []);
});

// ── D. Duplicates ──────────────────────────────────────────────
test('D. a double click on "Endgültig archivieren" sends one request', async () => {
  const p = load();
  const done = p.confirmArchive(KAFFEE, BTN); await tick();
  p.els['deal-archive-confirm'].click();
  p.els['deal-archive-confirm'].click();
  await done; await tick();
  assert.deepEqual([...p.calls], ['POST /deals/deal_kaffee/archive']);
});

test('D. a second Archive click while the dialog is open opens nothing and sends nothing', async () => {
  const p = load();
  const first = p.confirmArchive(KAFFEE, BTN); await tick();
  const second = p.confirmArchive({ id: 'deal_other', title: 'Anderer Deal' }, BTN);
  await second;
  assert.equal(p.dialog.shown, 1, 'still the first question');
  assert.equal(p.els['deal-archive-name'].textContent, 'Testangebot Kaffee', 'still names the first deal');
  p.els['deal-archive-confirm'].click(); await first;
  assert.deepEqual([...p.calls], ['POST /deals/deal_kaffee/archive'], 'only the confirmed deal');
});

test('D. confirming while another action is running sends nothing', async () => {
  const p = load();
  const done = p.confirmArchive(KAFFEE, BTN); await tick();
  p.setBusy(true);
  p.els['deal-archive-confirm'].click(); await done;
  assert.deepEqual([...p.calls], []);
});

test('D. a slow archive cannot be started twice', async () => {
  let release;
  const calls = [];
  const p = load({ apiImpl: (m, u) => { calls.push(m + ' ' + u); return new Promise((r) => { release = r; }); } });
  const one = p.confirmArchive(KAFFEE, BTN); await tick();
  p.els['deal-archive-confirm'].click(); await tick();
  const two = p.confirmArchive(KAFFEE, BTN); await tick();
  p.els['deal-archive-confirm'].click(); await tick();
  release({}); await one; await two;
  assert.deepEqual(calls, ['POST /deals/deal_kaffee/archive']);
});

// ── F. Without <dialog> support ────────────────────────────────
test('F. without showModal the browser confirm is used, with title, deal and message; "no" sends nothing', async () => {
  const p = load({ modal: false, confirmAnswer: false });
  await p.confirmArchive(KAFFEE, BTN);
  assert.equal(p.confirms.length, 1);
  assert.ok(p.confirms[0].includes('Deal wirklich archivieren?') && p.confirms[0].includes('„Testangebot Kaffee“') && p.confirms[0].includes('nicht rückgängig'));
  assert.deepEqual([...p.calls], []);
  const q = load({ modal: false, confirmAnswer: true });
  await q.confirmArchive(KAFFEE, BTN);
  assert.deepEqual([...q.calls], ['POST /deals/deal_kaffee/archive']);
});

// ── P. Page wiring ─────────────────────────────────────────────
test('P. the list\'s Archive button goes through confirmArchive; Delete keeps its own confirm', () => {
  const s = page.indexOf("$('deal-list').addEventListener('click'");
  const handler = page.slice(s, page.indexOf('});', s));
  assert.ok(handler.includes("if (btn.hasAttribute('data-archive')) { confirmArchive(deal, btn); return; }"));
  assert.ok(!handler.includes('/archive'), 'no direct archive request from the click handler');
  assert.ok(handler.includes("if (!window.confirm(t('dl_confirm_delete'))) return;") && handler.includes("api('DELETE'"));
  assert.deepEqual(page.match(/encodeURIComponent\([\w.]+\) \+ '\/archive'\)/g), ["encodeURIComponent(deal.id) + '/archive')"], 'one deal archive request in the page, inside confirmArchive (placements end in …/placements/<id>/archive)');
  assert.ok(page.includes('  async function runBusy(btn, fn) {\n    if (busy) return undefined;'), 'the real runBusy has the guard the sandbox copies');
});

test('P. dialog markup: labelled, deal named, Abbrechen first and focused, danger button for the final action', () => {
  const s = page.indexOf('<dialog class="deal-confirm" id="deal-archive-dialog"');
  assert.ok(s !== -1);
  const dlg = page.slice(s, page.indexOf('</dialog>', s));
  assert.ok(dlg.includes('aria-labelledby="deal-archive-title"') && dlg.includes('aria-describedby="deal-archive-name deal-archive-msg"'));
  for (const k of ['ac_title', 'ac_message', 'ac_cancel', 'ac_confirm']) assert.ok(dlg.includes('data-i18n="' + k + '"'), k);
  assert.ok(dlg.includes('id="deal-archive-name"'));
  assert.ok(dlg.indexOf('id="deal-archive-cancel"') < dlg.indexOf('id="deal-archive-confirm"'));
  assert.ok(/id="deal-archive-cancel"[^>]*autofocus/.test(dlg), 'Enter right after opening cancels');
  assert.ok(/qds-btn--danger[^>]*id="deal-archive-confirm"/.test(dlg));
  assert.ok(css.includes('.deal-confirm { margin: auto;'), 'centred: the page reset removes the browser\'s own dialog margin');
  assert.ok(css.includes('@media (max-width: 480px) { .deal-confirm__actions { flex-direction: column; }') && !css.includes('column-reverse; } .deal-confirm__actions'), 'phone: Abbrechen stacked above Endgültig archivieren (markup order)');
  assert.ok(css.includes('.deal-confirm {') && css.includes('.deal-confirm::backdrop') && css.includes('@media (max-width: 480px) { .deal-confirm__actions'));
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${err.message}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
