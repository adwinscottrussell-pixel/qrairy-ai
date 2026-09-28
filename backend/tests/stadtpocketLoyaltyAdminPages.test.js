// ============================================================
// stadtpocketLoyaltyAdminPages.test.js — StadtPocket Admin LOYALTY split
// into three separate destinations (frontend/public/stadtpocket-admin.html):
//
//   Stempelprogramm  -- business-level program configuration
//   Kunden stempeln  -- daily counter workflow (QR / Pass-Code -> +1)
//   Belohnungen      -- honest placeholder (redemption = next milestone)
//
// Source-level structure checks (same convention as
// stadtpocketPassScanner.test.js) plus behaviour checks that execute the
// REAL page functions (extracted from the HTML) against a tiny fake DOM
// and a recording fake api() -- so "Nächster Kunde resets UI only",
// "Belohnungen never writes" and "save sends only the three fields" are
// proven by running the code, not just by grepping it.
//
// Run: node tests/stadtpocketLoyaltyAdminPages.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'stadtpocket-admin.html');
const src = fs.readFileSync(adminPath, 'utf8').replace(/\r\n/g, '\n');

function fnSource(name) {
  const re = new RegExp(`(async )?function ${name}\\(`);
  const m = re.exec(src);
  assert.ok(m, `${name} exists`);
  let depth = 0;
  for (let i = src.indexOf('{', m.index); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}

function section(id) {
  const start = src.indexOf(`<section class="page" id="${id}">`);
  assert.ok(start >= 0, `section ${id} exists`);
  return src.slice(start, src.indexOf('</section>', start) + '</section>'.length);
}

// Tiny fake DOM: elements are plain objects created on first access.
function fakeDom() {
  const els = {};
  return {
    els,
    document: {
      getElementById(id) {
        if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', disabled: false, className: '', focused: false, focus() { this.focused = true; }, style: {} };
        return els[id];
      },
    },
  };
}

// Builds the named page functions with injected globals.
function load(names, globals) {
  const keys = Object.keys(globals);
  const body = names.map(fnSource).join('\n') + `\nreturn { ${names.join(', ')} };`;
  return new Function(...keys, body)(...keys.map((k) => globals[k]));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 12. navigation + three separate destinations ─────────────

test('sidebar: LOYALTY group with Stempelprogramm, Kunden stempeln, Belohnungen (old single Stempelkarte item removed)', () => {
  const nav = src.slice(src.indexOf('<nav class="sidebar-nav">'), src.indexOf('</nav>', src.indexOf('<nav class="sidebar-nav">')));
  const i0 = nav.indexOf('<div class="nav-group-label">Loyalty</div>');
  const i1 = nav.indexOf('id="nav-stempelprogramm" onclick="goToStempelprogramm()"');
  const i2 = nav.indexOf('id="nav-kunden-stempeln" onclick="goToKundenStempeln()"');
  const i3 = nav.indexOf('id="nav-belohnungen" onclick="goToBelohnungen()"');
  assert.ok(i0 >= 0 && i0 < i1 && i1 < i2 && i2 < i3, 'label then three items in order');
  assert.ok(nav.indexOf('id="nav-aktuelles"') < i0, 'Profil/Angebote/Aktuelles stay above');
  assert.doesNotMatch(nav, /nav-stempelkarte|>Stempelkarte</);
});

test('three distinct page sections exist; the old page-stempelkarte section is gone', () => {
  for (const id of ['page-stempelprogramm', 'page-kunden-stempeln', 'page-belohnungen']) section(id);
  assert.doesNotMatch(src, /<section class="page" id="page-stempelkarte">/);
  assert.match(src, /const SHELL_PAGES = \[[^\]]*'page-stempelprogramm', 'page-kunden-stempeln', 'page-belohnungen'/);
  assert.match(src, /'page-stempelprogramm': 'nav-stempelprogramm', 'page-kunden-stempeln': 'nav-kunden-stempeln', 'page-belohnungen': 'nav-belohnungen'/);
});

test('each destination owns only its own workspace (no program controls on Kunden stempeln, no stamping on Stempelprogramm)', () => {
  const programme = section('page-stempelprogramm');
  const kunden = section('page-kunden-stempeln');
  const rewards = section('page-belohnungen');
  assert.match(programme, /id="loyalty-workspace"/);
  assert.doesNotMatch(programme, /stamp-workspace/);
  assert.match(kunden, /<div id="stamp-workspace"><\/div>/);
  assert.doesNotMatch(kunden, /loyalty-workspace|program-save-btn|Stempelprogramm einrichten/);
  assert.doesNotMatch(rewards, /stamp-workspace|loyalty-workspace/);
  // the staff tool is built only by renderStampWorkspace, the program form only by renderProgramSettings
  assert.match(fnSource('renderStampWorkspace'), /QR-Code scannen[\s\S]*Pass-Code eingeben[\s\S]*Kunde prüfen/);
  assert.doesNotMatch(fnSource('renderStampWorkspace'), /program-save-btn|Benötigte Stempel/);
  assert.match(fnSource('renderProgramSettings'), /Benötigte Stempel[\s\S]*Belohnung[\s\S]*Änderungen speichern/);
  assert.doesNotMatch(fnSource('renderProgramSettings'), /stamp-pass-input|startPassScan|addStampForCurrentCustomer/);
  assert.doesNotMatch(fnSource('renderLoyaltyWorkspace'), /renderStampWorkspace/);
});

test('reload restores all three destinations; a context saved before the split maps to Stempelprogramm', () => {
  const restore = fnSource('tryRestoreLastContext');
  assert.match(restore, /ctx\.pageId === 'page-stempelprogramm' \|\| ctx\.pageId === 'page-stempelkarte'\) \{\s*\/\/[^\n]*\n\s*showPage\('page-stempelprogramm'\)/);
  assert.match(restore, /showPage\('page-kunden-stempeln'\);\s*await renderKundenStempelnWorkspace\(\)/);
  assert.match(restore, /showPage\('page-belohnungen'\);\s*await renderBelohnungen\(\)/);
});

test('leaving Kunden stempeln always stops the camera (showPage), and each nav item loads its own view', () => {
  assert.match(fnSource('showPage'), /if \(id !== 'page-kunden-stempeln' && typeof stopPassScan === 'function'\) stopPassScan\(\);/);
  assert.match(src, /function goToStempelprogramm\(\) \{ showPage\('page-stempelprogramm'\); renderLoyaltyWorkspace\(\); \}/);
  assert.match(src, /function goToKundenStempeln\(\) \{ showPage\('page-kunden-stempeln'\); renderKundenStempelnWorkspace\(\); \}/);
  assert.match(src, /function goToBelohnungen\(\) \{ showPage\('page-belohnungen'\); renderBelohnungen\(\); \}/);
});

// ── Stempelprogramm ───────────────────────────────────────────

test('Stempelprogramm loads the manager-scoped program config first; never uses the legacy /lp/stamp/settings writer', () => {
  assert.match(fnSource('renderLoyaltyWorkspace'), /api\(`\/manager\/stadtpocket\/listings\/\$\{currentLocationId\}\/\$\{currentListingLocationId\}\/loyalty\/program`\)/);
  // no request anywhere on the page targets the legacy writer (a code comment naming it is fine)
  assert.doesNotMatch(src, /(api|fetch)\(\s*[`'"][^`'"]*lp\/stamp\/settings/);
});

test('save sends ONLY { enabled, requiredStamps, rewardName } via PUT .../loyalty/program and shows success', async () => {
  const dom = fakeDom();
  const apiCalls = [];
  const banners = [];
  const renders = [];
  const g = {
    document: dom.document,
    currentLocationId: 'loc_ulm',
    currentListingLocationId: 'll_staib',
    PROGRAM_MAX_REWARD_LENGTH: 80,
    PROGRAM_MIN_STAMPS: 2,
    PROGRAM_MAX_STAMPS: 50,
    programForm: { enabled: true, requiredStamps: 10, rewardName: '  Gratis Brot ', savedRequiredStamps: 8 },
    api: async (url, opts) => { apiCalls.push({ url, opts }); return { ok: true, status: 200, body: { configured: true, editable: true, program: { enabled: true, requiredStamps: 10, rewardName: 'Gratis Brot' } } }; },
    banner: (id, type, msg) => banners.push({ id, type, msg }),
    renderProgramSettings: (cfg) => renders.push(cfg),
  };
  const { saveProgramSettings } = load(['programErrorMessage', 'saveProgramSettings'], g);
  await saveProgramSettings();
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].url, '/manager/stadtpocket/listings/loc_ulm/ll_staib/loyalty/program');
  assert.equal(apiCalls[0].opts.method, 'PUT');
  assert.deepEqual(apiCalls[0].opts.body, { enabled: true, requiredStamps: 10, rewardName: 'Gratis Brot' });
  assert.equal(renders.length, 1);
  assert.deepEqual(banners.at(-1), { id: 'loyalty-banner', type: 'success', msg: '✓ Änderungen gespeichert' });
});

test('save with an empty reward is blocked client-side (no request); server errors are shown, not swallowed', async () => {
  const dom = fakeDom();
  const apiCalls = [];
  const banners = [];
  const g = {
    document: dom.document, currentLocationId: 'l', currentListingLocationId: 'll',
    PROGRAM_MAX_REWARD_LENGTH: 80, PROGRAM_MIN_STAMPS: 2, PROGRAM_MAX_STAMPS: 50,
    programForm: { enabled: true, requiredStamps: 8, rewardName: '   ', savedRequiredStamps: 8 },
    api: async (url, opts) => { apiCalls.push({ url, opts }); return { ok: false, status: 400, body: { error: 'x' } }; },
    banner: (id, type, msg) => banners.push({ type, msg }),
    renderProgramSettings: () => {},
  };
  let fns = load(['programErrorMessage', 'saveProgramSettings'], g);
  await fns.saveProgramSettings();
  assert.equal(apiCalls.length, 0);
  assert.equal(banners.at(-1).type, 'error');

  g.programForm = { enabled: true, requiredStamps: 8, rewardName: 'Free Coffee', savedRequiredStamps: 8 };
  fns = load(['programErrorMessage', 'saveProgramSettings'], g);
  await fns.saveProgramSettings();
  assert.equal(apiCalls.length, 1);
  assert.equal(banners.at(-1).type, 'error');
  assert.match(banners.at(-1).msg, /2–50 Stempel/);
  assert.equal(dom.els['program-save-btn'].disabled, false, 'button re-enabled after an error');
});

test('stepper stays within 2..50 and lowering the goal shows the "Stempel bleiben erhalten" note', () => {
  const dom = fakeDom();
  const g = { document: dom.document, PROGRAM_MIN_STAMPS: 2, PROGRAM_MAX_STAMPS: 50, programForm: { enabled: true, requiredStamps: 3, rewardName: 'A', savedRequiredStamps: 8 } };
  const fns = load(['refreshProgramForm', 'changeProgramStamps'], g);
  fns.changeProgramStamps(-1);
  fns.changeProgramStamps(-1); // would go to 1 -> ignored
  assert.equal(dom.els['program-stamps-value'].textContent, '2');
  assert.equal(dom.els['program-stamps-minus'].disabled, true);
  assert.match(dom.els['program-stamps-hint'].textContent, /Gesammelte Stempel bleiben erhalten/);
});

test('Stempelprogramm never shows customer balances', () => {
  const form = fnSource('renderProgramSettings') + fnSource('refreshProgramForm');
  assert.doesNotMatch(form, /stampCount|Kunde gefunden|Stempelstand/);
});

// ── 13/14. Kunden stempeln ─────────────────────────────────────

test('Kunden stempeln loads the ACTIVE program via the existing bridge read and reuses the unchanged staff workspace', () => {
  const fn = fnSource('renderKundenStempelnWorkspace');
  assert.match(fn, /stopPassScan\(\);/);
  assert.match(fn, /\/loyalty`\);/);
  assert.match(fn, /renderStampWorkspace\(stateRes\.body\.program\);/);
  assert.match(fn, /Kein aktives Stempelprogramm/);
  // proven staff flow untouched: QR + manual + protected lookup + explicit +1
  assert.match(fnSource('lookupCustomerPass'), /\/loyalty\/lookup`, \{\s*method: 'POST',\s*body: \{ passSerialNumber \},/);
  assert.match(fnSource('addStampForCurrentCustomer'), /\/loyalty\/stamp`, \{\s*method: 'POST',\s*body: \{ passSerialNumber: currentStampCustomerSerial \},/);
  assert.match(fnSource('startPassScan'), /input\.value = serial;[\s\S]*lookupCustomerPass\(\);/);
});

test('after a successful lookup the raw Pass-Code is cleared from the input (the stamp uses the remembered serial)', () => {
  assert.match(fnSource('lookupCustomerPass'), /currentStampCustomerSerial = passSerialNumber;\s*input\.value = '';/);
});

test('"Nächster Kunde" is offered with the found customer and resets UI state only (no request, no data)', () => {
  assert.match(fnSource('renderStampCustomerFound'), /id="stamp-next-btn" onclick="nextCustomer\(\)">Nächster Kunde</);
  const dom = fakeDom();
  dom.document.getElementById('stamp-pass-input').value = 'sp_whatever';
  dom.document.getElementById('stamp-customer-result').innerHTML = '<p>Kunde gefunden</p>';
  let stopped = 0;
  const banners = [];
  const forbidden = () => { throw new Error('nextCustomer must not make requests'); };
  const g = {
    document: dom.document,
    stopPassScan: () => { stopped += 1; },
    banner: (id, type, msg) => banners.push({ id, type, msg }),
    api: forbidden,
    fetch: forbidden,
    currentStampCustomerSerial: 'sp_previous',
  };
  const body = `${fnSource('nextCustomer')}\nnextCustomer();\nreturn currentStampCustomerSerial;`;
  const keys = Object.keys(g);
  const serialAfter = new Function(...keys, body)(...keys.map((k) => g[k]));
  assert.equal(serialAfter, null);
  assert.equal(stopped, 1);
  assert.equal(dom.els['stamp-pass-input'].value, '');
  assert.equal(dom.els['stamp-customer-result'].innerHTML, '');
  assert.deepEqual(banners, [{ id: 'stamp-banner', type: 'info', msg: '' }]);
  assert.equal(dom.els['stamp-scan-btn'].focused, true);
  assert.doesNotMatch(fnSource('nextCustomer'), /api\(|fetch\(|loyalty\//);
});

// ── 15. Belohnungen ───────────────────────────────────────────

test('Belohnungen is an honest placeholder: no buttons, inputs, customers or redemption history', () => {
  const rewards = section('page-belohnungen');
  assert.match(rewards, /Belohnungen einlösen – bald verfügbar/);
  assert.doesNotMatch(rewards, /<button|<input|<select|<table|onclick=/);
  assert.doesNotMatch(rewards, /eingelöst am|Kunde:|Verlauf/);
});

test('Belohnungen only READS the business\'s own program (GET, no method/body) and shows the current reward', async () => {
  const dom = fakeDom();
  const apiCalls = [];
  const g = {
    document: dom.document, currentLocationId: 'loc_ulm', currentListingLocationId: 'll_staib',
    api: async (url, opts) => { apiCalls.push({ url, opts }); return { ok: true, body: { configured: true, program: { enabled: true, requiredStamps: 8, rewardName: 'Free Coffee' } } }; },
  };
  const { renderBelohnungen } = load(['renderBelohnungen'], g);
  await renderBelohnungen();
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].url, '/manager/stadtpocket/listings/loc_ulm/ll_staib/loyalty/program');
  assert.equal(apiCalls[0].opts, undefined, 'plain GET');
  assert.equal(dom.els['belohnungen-program'].textContent, 'Aktuelle Belohnung: Free Coffee nach 8 Stempeln.');

  g.api = async () => ({ ok: true, body: { configured: false } });
  await load(['renderBelohnungen'], g).renderBelohnungen();
  assert.equal(dom.els['belohnungen-program'].textContent, 'Noch kein Stempelprogramm eingerichtet.');
});

// ── runner ────────────────────────────────────────────────────

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
