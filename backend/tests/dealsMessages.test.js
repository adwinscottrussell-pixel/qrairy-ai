// ============================================================
// dealsMessages.test.js — QRAIVY Deals, Phase 3B.7: what the Deal
// Builder tells an owner about Deals access, plan limits and the upload
// limit (frontend/public/deals.html).
//
// The page's own code is run, not a copy: the dictionary, t(), ApiError,
// errorText() and the access block (accessErrorText … renderAccess) and
// showAlert() are cut out of deals.html and evaluated in a small sandbox
// with stand-in DOM elements and a stand-in api().
//
// Run: node tests/dealsMessages.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const page = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'deals.html'), 'utf8').replace(/\r\n/g, '\n');

function cut(startMarker, endMarker, { includeEnd = false } = {}) {
  const s = page.indexOf(startMarker);
  const e = page.indexOf(endMarker, s + startMarker.length);
  assert.ok(s !== -1 && e !== -1, 'not found: ' + startMarker.trim());
  return page.slice(s, includeEnd ? e + endMarker.length : e);
}

function el(id) {
  let text = '';
  const node = {
    id, hidden: true, disabled: false, attrs: {}, children: [], scrolled: 0,
    get textContent() { return text + node.children.map((c) => c.textContent).join(''); },
    set textContent(v) { text = String(v); node.children = []; },
    setAttribute(k, v) { node.attrs[k] = String(v); },
    removeAttribute(k) { delete node.attrs[k]; },
    appendChild(c) { node.children.push(c); return c; },
    scrollIntoView() { node.scrolled += 1; },
  };
  return node;
}

// A fresh copy of the page's code, in one language, with its own elements.
function load(lang = 'en', apiImpl = async () => ({})) {
  const ids = ['deal-access', 'deal-access-text', 'deal-access-billing', 'deal-access-usage', 'deal-create-btn', 'deal-empty-create-btn', 'deal-alert'];
  const els = Object.fromEntries(ids.map((id) => [id, el(id)]));
  const ctx = {
    els,
    api: apiImpl,
    loadDeals: async () => {},
    document: {
      createElement: (tag) => { const n = el(''); n.tag = tag; return n; },
      createTextNode: (t) => ({ textContent: t }),
    },
  };
  const src = [
    cut('  var _t = {', '\n  };', { includeEnd: true }),
    "  var _lang = '" + lang + "';",
    '  function $(id) { return els[id]; }',
    cut('  function t(key, vars) {', '  function esc(v) {'),
    cut('  function ApiError(status, message)', '\n', { includeEnd: true }),
    cut('  function errorText(err) {', '  // ── Server <-> form mapping'),
    cut('  function showAlert(message, err) {', "    if (message) box.scrollIntoView({ block: 'nearest' });\n  }", { includeEnd: true }),
    '  ({ t: t, _t: _t, ApiError: ApiError, errorText: errorText, accessNotice: accessNotice, renderAccess: renderAccess, loadAccess: loadAccess,',
    '     showAlert: showAlert, refreshList: refreshList, BILLING_URL: BILLING_URL, state: function () { return accessState; } })',
  ].join('\n');
  const p = vm.runInNewContext('(function(){' + src.replace(/\n  \(\{ t: t/, '\n  return ({ t: t') + '})()', ctx);
  return { ...p, els };
}
function refusal(p, status, data) { const e = new p.ApiError(status, data && data.error); e.data = data || {}; return e; }

const NEW_KEYS = ['acc_tag', 'acc_billing', 'acc_not_available', 'acc_plan_required', 'acc_limit_reached', 'acc_limit_reached_one', 'acc_usage',
  'acc_usage_unlimited', 'acc_pilot', 'acc_unknown', 'e_access_unavailable', 'e_plan_required', 'e_plan_limit', 'e_plan_limit_one',
  'e_upload_limit_hour', 'e_upload_limit_day', 'e_upload_limit', 'e_upload_retry', 'e_upload_retry_later', 'wait_minutes', 'wait_hours'];

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── M. Messages for refusals ───────────────────────────────────
test('M. every new message exists in English and German, and the German one is a real translation', () => {
  const { _t } = load();
  for (const k of NEW_KEYS) {
    assert.ok(typeof _t.en[k] === 'string' && _t.en[k].trim(), 'en.' + k);
    assert.ok(typeof _t.de[k] === 'string' && _t.de[k].trim(), 'de.' + k);
    if (!['acc_tag'].includes(k)) assert.notEqual(_t.de[k], _t.en[k], k + ' is not translated');
  }
});

test('M. 403 deals_not_available: not available yet, existing deals stay manageable (EN/DE)', () => {
  const en = load('en'), de = load('de');
  const data = { error: 'deals_not_available', message: 'Deals are not available for this account yet.' };
  const m = en.errorText(refusal(en, 403, data));
  assert.match(m, /isn’t available for your account yet/); assert.match(m, /existing deals stay saved/); assert.match(m, /edit, archive or delete/);
  const d = de.errorText(refusal(de, 403, data));
  assert.match(d, /noch nicht verfügbar/); assert.match(d, /bearbeiten, archivieren oder löschen/);
});

test('M. 402 plan_required: the plan does not include Deals, Starter or higher, existing deals stay editable (EN/DE)', () => {
  const en = load('en'), de = load('de');
  const data = { error: 'plan_required', upgrade: true, requiredPlan: 'starter', currentPlan: 'free' };
  const m = en.errorText(refusal(en, 402, data));
  assert.match(m, /doesn’t include Deals/); assert.match(m, /Starter or higher/); assert.match(m, /stay saved and editable/);
  const d = de.errorText(refusal(de, 402, data));
  assert.match(d, /enthält keine Deals/); assert.match(d, /Starter oder höher/);
});

test('M. 402 plan_limit: names the limit, explains archiving, singular for a limit of 1 (EN/DE)', () => {
  const en = load('en'), de = load('de');
  const three = { error: 'plan_limit', limit: 3, current: 3, upgrade: true };
  assert.equal(en.errorText(refusal(en, 402, three)), 'All 3 deal slots are in use (drafts, scheduled and running deals). Archive a deal you no longer need or wait until one ends – or upgrade your plan.');
  assert.equal(de.errorText(refusal(de, 402, three)), 'Alle 3 Deal-Plätze sind belegt (Entwürfe, geplante und laufende Deals). Archiviere einen Deal, den du nicht mehr brauchst, oder warte, bis einer endet – oder wechsle in einen höheren Tarif.');
  const one = { error: 'plan_limit', limit: 1, current: 1, upgrade: true };
  assert.equal(en.errorText(refusal(en, 402, one)), 'Your deal slot is in use (a draft, scheduled or running deal). Archive it or wait until it ends – or upgrade your plan.');
  assert.equal(de.errorText(refusal(de, 402, one)), 'Dein Deal-Platz ist belegt (Entwurf, geplanter oder laufender Deal). Archiviere ihn oder warte, bis er endet – oder wechsle in einen höheren Tarif.');
  // a malformed limit never prints "undefined"
  assert.doesNotMatch(en.errorText(refusal(en, 402, { error: 'plan_limit' })), /undefined/);
});

test('M. 429 upload_limit: hour or day, with a retry estimate rounded UP (EN/DE)', () => {
  const en = load('en'), de = load('de');
  const hour = { error: 'upload_limit', window: 'hour', limit: 20, retryAfter: 125 };
  assert.equal(en.errorText(refusal(en, 429, hour)), 'You’ve uploaded the maximum of 20 pictures per hour. You can upload again in about 3 min.');
  assert.equal(de.errorText(refusal(de, 429, hour)), 'Du hast das Maximum von 20 Bildern pro Stunde hochgeladen. In etwa 3 Min. kannst du wieder hochladen.');
  const day = { error: 'upload_limit', window: 'day', limit: 60, retryAfter: 5400 };
  assert.equal(en.errorText(refusal(en, 429, day)), 'You’ve uploaded the maximum of 60 pictures per day. You can upload again in about 2 h.');
  assert.equal(de.errorText(refusal(de, 429, day)), 'Du hast das Maximum von 60 Bildern pro Tag hochgeladen. In etwa 2 Std. kannst du wieder hochladen.');
  assert.match(en.errorText(refusal(en, 429, { ...hour, retryAfter: 1 })), /about 1 min\.$/, 'never "0 min"');
  assert.match(en.errorText(refusal(en, 429, { ...hour, retryAfter: 3600 })), /about 60 min\.$|about 1 h\.$/);
  for (const bad of [undefined, 0, -5, 'soon', NaN]) {
    assert.match(en.errorText(refusal(en, 429, { ...hour, retryAfter: bad })), /per hour\. Please try again later\.$/, String(bad));
  }
});

test('M. the upload field explains 402, 403 and 429 with these messages instead of "please try again"', () => {
  const upload = cut("        var msg = !(err instanceof ApiError) ? t('e_img_upload')", 'setError(\'field-image\'');
  assert.ok(upload.includes(': err.status === 402 || err.status === 403 || err.status === 429 ? errorText(err)'));
  assert.ok(upload.indexOf('err.status === 429') < upload.indexOf("t('e_img_upload');"), 'checked before the general upload message');
});

test('M. everything else keeps its previous message: 400/409 detail, 404, network, routing, 500 and unknown 402/403/429', () => {
  const p = load('en');
  assert.equal(p.errorText(refusal(p, 400, { error: 'Give the deal a title.' })), 'Could not save: Give the deal a title.');
  assert.equal(p.errorText(refusal(p, 404, {})), p.t('e_gone'));
  assert.equal(p.errorText(new p.ApiError(0)), p.t('e_network'));
  assert.equal(p.errorText(new p.ApiError(-1)), p.t('e_routing'));
  assert.equal(p.errorText(new Error('x')), p.t('e_server'));
  for (const [s, d] of [[500, {}], [403, { error: 'Forbidden' }], [429, { error: 'Too many requests' }], [402, { error: 'payment' }], [403, undefined]]) {
    assert.equal(p.errorText(refusal(p, s, d)), d && d.error === 'payment' ? p.t('e_server') : p.t('e_server'), s + ' ' + JSON.stringify(d));
  }
});

test('M. api() keeps the refusal details (limit, window, retryAfter) on the error; the routing block and single fetch are unchanged', () => {
  assert.ok(page.includes("    if (!res.ok) { var failed = new ApiError(res.status, data && data.error); failed.data = data && typeof data === 'object' ? data : {}; throw failed; }"));
  assert.equal((page.match(/\bfetch\(/g) || []).length, 1);
});

// ── B. The billing link ─────────────────────────────────────────
test('B. a plan refusal (402) in the alert offers exactly the existing billing page; other refusals do not', () => {
  const p = load('en');
  assert.equal(p.BILLING_URL, 'dashboard.html?section=billing');
  p.showAlert(p.errorText(refusal(p, 402, { error: 'plan_limit', limit: 3 })), refusal(p, 402, { error: 'plan_limit', limit: 3 }));
  const box = p.els['deal-alert'];
  assert.equal(box.hidden, false);
  assert.equal(box.children.length, 2);
  assert.equal(box.children[1].href, 'dashboard.html?section=billing');
  assert.equal(box.children[1].textContent, 'View plans & billing →');
  for (const [s, d] of [[403, { error: 'deals_not_available' }], [429, { error: 'upload_limit', window: 'hour', limit: 20, retryAfter: 60 }], [500, {}]]) {
    p.showAlert(p.errorText(refusal(p, s, d)), refusal(p, s, d));
    assert.equal(box.children.length, 0, s + ': no billing link');
  }
  p.showAlert('');
  assert.equal(box.hidden, true);
  assert.equal(load('de').t('acc_billing'), 'Tarif & Abrechnung ansehen →');
});

test('B. the only upgrade destination on the page is the existing billing section; no prices, currencies or new URLs in the new texts', () => {
  const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /billing|pricing|upgrade|checkout|stripe/i.test(h));
  assert.deepEqual([...new Set(hrefs)], ['dashboard.html?section=billing']);
  assert.ok(!/pricing\.html|checkout|stripe\.com/i.test(page));
  const { _t } = load();
  for (const lang of ['en', 'de']) for (const k of NEW_KEYS) {
    assert.ok(!/€|\$|EUR|USD|\bCHF\b|\d+[.,]\d{2}\b|\/mo|month|monat|https?:/i.test(_t[lang][k]), lang + '.' + k + ' mentions a price or URL');
  }
});

test('B. the new texts never claim a deal is visible to customers', () => {
  const { _t } = load();
  for (const lang of ['en', 'de']) for (const k of NEW_KEYS) {
    assert.ok(!/is (now )?live|now visible|customers can (now )?see|ist (jetzt )?live|jetzt sichtbar/i.test(_t[lang][k]), lang + '.' + k);
  }
});

// ── A. The account's access status on the list ──────────────────
test('A. not loaded yet: nothing claimed, nothing blocked', () => {
  const p = load('en');
  assert.deepEqual(JSON.parse(JSON.stringify(p.accessNotice('idle', null))), { notice: '', billing: false, usage: '', blockCreate: false });
  p.renderAccess();
  assert.equal(p.els['deal-access'].hidden, true);
  assert.equal(p.els['deal-create-btn'].disabled, false);
});

test('A. plan_required (Free, expired trial, cancelled subscription): reason, billing link, Create held back (EN/DE)', () => {
  for (const lang of ['en', 'de']) {
    const p = load(lang);
    const v = p.accessNotice('ready', { allowed: false, reason: 'plan_required', dealLimit: 0, activeDeals: 2 });
    assert.equal(v.notice, p.t('acc_plan_required')); assert.equal(v.billing, true); assert.equal(v.blockCreate, true);
  }
  assert.match(load('en').t('acc_plan_required'), /trial has ended or a subscription is no longer active/);
  assert.match(load('en').t('acc_plan_required'), /you can still open, edit, archive and delete them/);
  assert.match(load('de').t('acc_plan_required'), /Testzeitraum abgelaufen oder ein Abo nicht mehr aktiv/);
});

test('A. not_rolled_out: reason without a billing link (a plan change would not help), Create held back', () => {
  const p = load('en');
  const v = p.accessNotice('ready', { allowed: false, reason: 'not_rolled_out', dealLimit: 0, activeDeals: 0 });
  assert.equal(v.notice, p.t('acc_not_available')); assert.equal(v.billing, false); assert.equal(v.blockCreate, true);
});

test('A. usage versus limit: Trial 0 of 1, Starter 2 of 3, limit reached holds Create back with the billing link, singular for 1', () => {
  const p = load('en'), de = load('de');
  assert.equal(p.accessNotice('ready', { allowed: true, reason: 'plan', dealLimit: 1, activeDeals: 0 }).usage, '0 of 1 deal slots in use. Drafts, scheduled and running deals count; expired and archived ones don’t – a deal frees its slot automatically when it ends.');
  const starter = p.accessNotice('ready', { allowed: true, reason: 'plan', dealLimit: 3, activeDeals: 2 });
  assert.match(starter.usage, /^2 of 3 deal slots in use/); assert.equal(starter.blockCreate, false); assert.equal(starter.notice, '');
  assert.equal(de.accessNotice('ready', { allowed: true, reason: 'plan', dealLimit: 3, activeDeals: 2 }).usage, '2 von 3 Deal-Plätzen belegt. Entwürfe, geplante und laufende Deals zählen; abgelaufene und archivierte nicht – ein Deal gibt seinen Platz automatisch frei, sobald er endet.');
  const full = p.accessNotice('ready', { allowed: true, reason: 'plan', dealLimit: 3, activeDeals: 3 });
  assert.match(full.notice, /limit of 3 deals for your account/); assert.equal(full.billing, true); assert.equal(full.blockCreate, true);
  assert.match(p.accessNotice('ready', { allowed: true, reason: 'plan', dealLimit: 1, activeDeals: 1 }).notice, /limit of 1 deal for/);
});

test('A. Pro / Business (unlimited) and pilot access', () => {
  const p = load('en');
  const pro = p.accessNotice('ready', { allowed: true, reason: 'plan', dealLimit: null, activeDeals: 7 });
  assert.equal(pro.usage, '7 active deals. Your plan has no deal limit.'); assert.equal(pro.blockCreate, false);
  const pilot = p.accessNotice('ready', { allowed: true, reason: 'pilot', dealLimit: 10, activeDeals: 4 });
  assert.match(pilot.usage, /^4 of 10 deal slots in use\. .* You have pilot access to Deals\.$/);
  const pilotFull = p.accessNotice('ready', { allowed: true, reason: 'pilot', dealLimit: 10, activeDeals: 10 });
  assert.equal(pilotFull.blockCreate, true);
});

test('A. a failed or malformed status claims nothing and blocks nothing; a missing session or blocked host shows nothing', async () => {
  for (const [why, impl] of [
    ['500', async function () { throw refusal(this, 500, { error: 'Failed to check Deals access.' }); }],
    ['network', async function () { throw new this.ApiError(0); }],
    ['malformed', async () => ({ allowed: 'yes' })],
    ['empty', async () => null],
  ]) {
    let p; p = load('en', (...a) => impl.apply(p, a));
    await p.loadAccess();
    assert.equal(p.state(), 'error', why);
    assert.equal(p.els['deal-access'].hidden, true, why + ': no claim either way');
    assert.equal(p.els['deal-access-usage'].textContent, p.t('acc_unknown'), why);
    assert.equal(p.els['deal-create-btn'].disabled, false, why + ': Create not blocked');
    assert.equal(p.els['deal-empty-create-btn'].disabled, false, why);
  }
  for (const status of [401, -1]) {
    let p; p = load('en', async () => { throw new p.ApiError(status); });
    await p.loadAccess();
    assert.equal(p.state(), 'idle'); assert.equal(p.els['deal-access-usage'].hidden, true); assert.equal(p.els['deal-create-btn'].disabled, false);
  }
});

test('A. renderAccess holds back only the two Create buttons, and releases them when access returns', async () => {
  let answer = { allowed: false, reason: 'plan_required', dealLimit: 0, activeDeals: 3 };
  const p = load('en', async (m, path) => { assert.equal(m + ' ' + path, 'GET /deals/access'); return answer; });
  await p.loadAccess();
  assert.equal(p.els['deal-create-btn'].disabled, true);
  assert.equal(p.els['deal-empty-create-btn'].disabled, true);
  assert.equal(p.els['deal-create-btn'].attrs['aria-describedby'], 'deal-access-text');
  assert.equal(p.els['deal-access'].hidden, false);
  assert.equal(p.els['deal-access-billing'].hidden, false);
  answer = { allowed: true, reason: 'plan', dealLimit: 3, activeDeals: 1 };
  await p.loadAccess();
  assert.equal(p.els['deal-create-btn'].disabled, false);
  assert.equal(p.els['deal-create-btn'].attrs['aria-describedby'], undefined);
  assert.equal(p.els['deal-access'].hidden, true);
  // the access block disables nothing else: edit, archive, delete, page removal and publishing are never touched
  const block = cut('  function errorText(err) {', '  // ── Server <-> form mapping');
  assert.deepEqual([...block.matchAll(/\.disabled = /g)].length, 1);
  assert.ok(block.includes("['deal-create-btn', 'deal-empty-create-btn'].forEach"));
  for (const id of ['data-edit', 'data-archive', 'data-delete', 'deal-publish', 'deal-save-draft', 'deal-pages']) assert.ok(!block.includes(id), id);
});

test('A. the status follows the list: loaded after sign-in, reloaded after closing the builder, archive/delete and retry', () => {
  assert.match(page, /window\.QraivyDeals = \{ start: loadDeals \};/);
  assert.ok(page.includes('  window.QraivyDeals.loadAccess = loadAccess;'));
  assert.ok(page.includes("showView('list'); refreshList(); }"));
  assert.ok(page.includes('      }).then(refreshList);'));
  assert.ok(page.includes("$('deal-retry-btn').addEventListener('click', refreshList);"));
  assert.ok(page.includes('    renderList();\n    renderAccess();\n  }\n  window.toggleLang'), 'a language switch re-renders the notice');
});

test('A. markup: the notice reuses the existing banner, the usage line the existing note; both hidden until known', () => {
  assert.ok(page.includes('<div class="deal-preview-banner" id="deal-access" role="status" hidden>'));
  assert.ok(page.includes('<a class="deal-access__billing" id="deal-access-billing" href="dashboard.html?section=billing" data-i18n="acc_billing" hidden>'));
  assert.ok(page.includes('<p class="deal-note deal-access-usage" id="deal-access-usage" hidden></p>'));
});

test('A. every limit text says what counts (drafts, scheduled, running) and what does not (expired, archived), EN and DE', () => {
  const { _t } = load();
  for (const k of ['acc_usage', 'acc_limit_reached', 'acc_limit_reached_one']) {
    assert.match(_t.en[k], /drafts, scheduled and running deals count; expired and archived ones don’t/i, 'en.' + k);
    assert.match(_t.de[k], /Entwürfe, geplante und laufende Deals zählen; abgelaufene und archivierte nicht/, 'de.' + k);
    assert.match(_t.en[k], /automatically when (a|the) deal ends|automatically when it ends/, 'en.' + k + ' frees automatically');
    assert.match(_t.de[k], /automatisch frei, sobald (ein|der) Deal endet|automatisch frei, sobald er endet/, 'de.' + k + ' frees automatically');
  }
  for (const k of ['e_plan_limit', 'e_plan_limit_one']) {
    assert.match(_t.en[k], /scheduled or running|scheduled and running/, 'en.' + k);
    assert.match(_t.de[k], /geplante?r? (und|oder) laufende/, 'de.' + k);
    assert.match(_t.en[k], /wait until (one|it) ends/); assert.match(_t.de[k], /warte, bis (einer|er) endet/);
  }
  for (const lang of ['en', 'de']) assert.doesNotMatch(Object.values(_t[lang]).join(' | '), /drafts and published deals count|Entwürfe und veröffentlichte Deals zählen|to create more|um weitere zu erstellen/, lang + ': no old rule left');
});

test('A. a hidden notice really disappears: the banner\'s display:flex never overrides the hidden attribute', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'deals-page.css'), 'utf8').replace(/\r\n/g, '\n');
  const flex = css.indexOf('.deal-preview-banner {\n  display: flex;');
  const hidden = css.indexOf('.deal-preview-banner[hidden] { display: none; }');
  assert.ok(flex !== -1, 'the banner is a flex box');
  assert.ok(hidden > flex, 'and a hidden banner is display:none (after the flex rule, same specificity wins later)');
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
