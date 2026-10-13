// ============================================================
// lpEditorPublishSafety.test.js — Publish and Save Draft in the Smart
// Landing Page editor.
//
// Proves:
//   - one click on a Publish button sends exactly one save, built by the
//     Smart Editor, after one confirmation; the page's older handlers on
//     the same buttons never run
//   - Cancel in the confirmation sends nothing
//   - clicks while a save is running send nothing more
//   - nothing can be published or saved before this page's own record has
//     been loaded from the server, and never after a failed load; a failed
//     load does not turn the editor's default values into the page's state
//   - what is saved is what the owner sees: the selected language, the
//     Voice switch, custom greetings — and every field of the page the
//     Smart Editor does not edit goes back unchanged
//
// What is real: smart-editor.js, js/voice-greetings.js,
// js/voice-greeting-editor.js, js/staging-config.js and js/lp-routing.js,
// run in a stand-in browser. The Publish / Save Draft buttons carry the
// same three kinds of handler smart-qr-detail.html gives them (its inline
// onclick text is read from the page itself); the page's two older
// senders are stand-ins that record being called and would send a save.
// The editor as it was before this change (commit 6846266) is run in the
// same stand-in page to show the fault and to prove that the one save now
// sent is, field for field, the save the Smart Editor sent before.
// No network: fetch is a recorder. Every name and address is made up.
//
// No test framework dependency. Run: node tests/lpEditorPublishSafety.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const EDITOR_PAGE = read(PUB, 'smart-qr-detail.html');
const SMART_EDITOR = read(PUB, 'smart-editor.js');
// smart-editor.js before the publish-safety change
const EDITOR_BEFORE = execFileSync('git', ['show', '6846266:frontend/public/smart-editor.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replace(/\r\n/g, '\n');
const SCRIPTS = ['js/staging-config.js', 'js/lp-routing.js', 'js/voice-greetings.js', 'js/voice-greeting-editor.js'].map((f) => [f, read(PUB, ...f.split('/'))]);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

const SLUG = 'casa-lumi';
const CONFIRM_TEXT = 'Publish this page? This will update your live Smart QR page immediately.';
const LOAD_FAILED_TEXT = 'This page could not be loaded, so nothing can be saved or published. Please reload the page.';

// The page as the server has it, including fields the Smart Editor never edits.
function serverPage(overrides = {}) {
  const sections = Object.assign({
    language: 'en',
    hero: { title: 'Casa Lumi', subtitle: 'Fresh pasta daily', badge: 'Restaurant', aiTitle: 'Casa Lumi — Trattoria', aiSubtitle: 'Since 1998' },
    voice: { enabled: false, language: 'en', voiceKey: 'sarah', customGreeting: { en: 'Hello and welcome to Casa Lumi, your table is waiting.' },
      audioUrl: 'https://res.cloudinary.example/audio/published.mp3', audioFor: 'fp-published', audioLang: 'en',
      previewUrl: 'https://res.cloudinary.example/audio/preview.mp3', previewFor: 'fp-preview', previewLang: 'de', previewCache: { 'fp-preview': 'https://res.cloudinary.example/audio/preview.mp3' } },
    buttons: [{ type: 'instagram', label: 'instagram', url: 'https://instagram.example/casalumi', active: true }],
    theme: { accentColor: '#123456', background: 'dark', buttonStyle: 'rounded' },
    logo: { url: 'https://res.cloudinary.example/logos/casa.png' },
    // fields owned by other parts of the product
    ai: { enabled: true, title: 'Ask Casa Lumi', placeholder: 'Opening hours?' },
    loop: { enabled: true, title: 'Stay close', buttonLabel: 'Join' },
    footer: { businessName: 'Casa Lumi GmbH', footerText: 'Hauptstr. 1' },
    info: { address: 'Hauptstr. 1, 89073 Ulm', phone: '+49 000 0000' },
    settings: { pageActive: true, voiceEnabled: true, aiEnabled: false, walletEnabled: true },
    order: ['hero', 'voice', 'buttons', 'loop', 'footer'],
    featured: [{ enabled: true, icon: 'x', title: 'Handmade', description: 'Every day' }],
    businessInfo: { hours: 'Mo-Sa 11-22', address: 'Hauptstr. 1' },
    actionLinks: [{ label: 'Menu', url: 'https://casalumi.example/menu' }],
    siteContent: 'crawled text', aiGenerated: true, crawlLocked: true,
  }, overrides.sections || {});
  return Object.assign({ id: 'page-1', slug: SLUG, businessName: 'Casa Lumi', websiteUrl: 'https://casalumi.example', useCase: 'restaurant', brandColor: '#123456', logoUrl: null, userId: 'user_owner', template: 'premium', status: 'live' },
    overrides, { sections: JSON.stringify(sections) });
}

// ── A stand-in browser ─────────────────────────────────────────
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);
function createDom() {
  const byId = new Map();
  class El {
    constructor(tag, attrs = {}) {
      this.tagName = String(tag).toUpperCase(); this.attrs = Object.assign({}, attrs); this.children = []; this.parentNode = null;
      this.listeners = []; this.style = {}; this.value = ''; this.textContent = ''; this.disabled = false; this.onclick = null; this._html = '';
      this.id = this.attrs.id || ''; this.className = this.attrs.class || '';
    }
    get innerHTML() { return this._html; }
    set innerHTML(html) { this.children.slice().forEach((c) => this.removeChild(c)); this._html = String(html); parseInto(this, this._html); }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); register(c); return c; }
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i === -1) this.children.push(c); else this.children.splice(i, 0, c); register(c); return c; }
    removeChild(c) { const i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); c.parentNode = null; unregister(c); return c; }
    get nextSibling() { if (!this.parentNode) return null; const s = this.parentNode.children; return s[s.indexOf(this) + 1] || null; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') { this.id = String(v); register(this); } if (k === 'class') this.className = String(v); }
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
    addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture: !!capture }); }
    querySelectorAll(sel) { const out = []; walk(this, (n) => { if (n !== this && matches(n, sel)) out.push(n); }); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { for (let n = this; n && n instanceof El; n = n.parentNode) if (matches(n, sel)) return n; return null; }
    focus() {} blur() {} scrollIntoView() {}
    click() { return click(this); }
  }
  function walk(n, fn) { fn(n); n.children.forEach((c) => walk(c, fn)); }
  function register(n) { walk(n, (x) => { if (x.id && attached(x)) byId.set(x.id, x); }); }
  function unregister(n) { walk(n, (x) => { if (x.id && byId.get(x.id) === x) byId.delete(x.id); }); }
  function attached(n) { for (let x = n; x; x = x.parentNode) if (x === body) return true; return false; }
  function attrsOf(text) { const a = {}; for (const m of text.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) a[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : '')); return a; }
  function parseInto(root, html) {
    const stack = [root];
    for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
      const tag = m[2].toLowerCase();
      if (m[1]) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag.toUpperCase()) { stack.length = i; break; } continue; }
      const el = new El(tag, attrsOf(m[3].replace(/\/\s*$/, '')));
      if (el.attrs.value !== undefined) el.value = el.attrs.value;
      stack[stack.length - 1].appendChild(el);
      if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(el);
    }
  }
  function simple(n, sel) {
    const m = /^([a-zA-Z][a-zA-Z0-9]*)?((?:\.[-\w]+)*)((?:\[[^\]]+\])*)$/.exec(sel.trim());
    if (!m) return false;
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    const classes = (n.className || '').split(/\s+/);
    for (const c of (m[2] ? m[2].split('.').filter(Boolean) : [])) if (classes.indexOf(c) === -1) return false;
    for (const a of (m[3] ? m[3].match(/\[[^\]]+\]/g) : [])) {
      const p = /^\[([-\w]+)(?:(\*=|=)"?([^"\]]*)"?)?\]$/.exec(a); if (!p) return false;
      const v = n.getAttribute(p[1]);
      if (v === null) return false;
      if (p[2] === '=' && v !== p[3]) return false;
      if (p[2] === '*=' && v.indexOf(p[3]) === -1) return false;
    }
    return true;
  }
  function matches(n, sel) { return sel.split(',').some((s) => simple(n, s)); }

  const body = new El('body');
  const docListeners = [];
  const document = {
    body, readyState: 'complete',
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new El(tag),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    querySelector: (sel) => body.querySelector(sel),
    addEventListener: (type, fn, capture) => { docListeners.push({ type, fn, capture: !!capture }); },
  };
  // A click as a browser delivers it: document (capture) -> the element's
  // own handlers (inline onclick first, then listeners in the order they
  // were added) -> document (bubble). A disabled button receives nothing.
  function click(el) {
    for (let n = el; n; n = n.parentNode) if (n.disabled) return { delivered: false };
    const e = { type: 'click', target: el, defaultPrevented: false, _stop: false, _stopNow: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._stop = true; }, stopImmediatePropagation() { this._stop = true; this._stopNow = true; } };
    for (const l of docListeners) { if (l.type === 'click' && l.capture && !e._stopNow) l.fn.call(document, e); }
    if (e._stop) return { delivered: true, stoppedAtDocument: true, event: e };
    for (let n = el; n; n = n.parentNode) {
      if (n.onclick && !e._stopNow) n.onclick.call(n, e);
      for (const l of n.listeners) { if (l.type === 'click' && !e._stopNow) l.fn.call(n, e); }
      if (e._stop) return { delivered: true, event: e };
    }
    for (const l of docListeners) { if (l.type === 'click' && !l.capture && !e._stopNow) l.fn.call(document, e); }
    return { delivered: true, event: e };
  }
  function fire(el, type) { const e = { type, target: el, preventDefault() {}, stopPropagation() {} }; el.listeners.filter((l) => l.type === type).forEach((l) => l.fn.call(el, e)); }
  return { El, document, body, click, fire, byId };
}

// The inline onclick text of a button, exactly as smart-qr-detail.html has it.
function inlineOnclick(id) {
  const m = new RegExp('<button id="' + id + '"(?: onclick="([^"]*)")?').exec(EDITOR_PAGE);
  assert.ok(m, 'smart-qr-detail.html has a button #' + id);
  return m[1] || '';
}

// Opens the editor page for `?slug=…` with the Smart Editor loaded.
//   load     what GET /api/lp/:slug answers: { status, body } | { reject } | a page object
//   confirm  what the confirmation dialog returns
//   holdSave true: POST /lp stays pending until env.releaseSave()
async function openEditor({ slug = SLUG, load = serverPage(), confirm = true, holdSave = false, lateLegacyWiring = true, runInit = true, editor = SMART_EDITOR } = {}) {
  const dom = createDom();
  const { El, document, body } = dom;
  const env = { dom, requests: [], confirms: [], legacy: { publish: 0, draft: 0, localDraft: 0 }, timers: [], confirmAnswer: confirm, load, pendingSaves: [] };

  // The parts of smart-qr-detail.html the editor touches.
  const mk = (tag, attrs, parent = body) => parent.appendChild(new El(tag, attrs));
  const editSection = mk('div', { id: 'sqd-edit-section' });
  const publish1 = mk('button', { id: 'sqd-publish-btn' }, editSection);
  const draftBtn = mk('button', { id: 'sqd-save-draft-btn' }, editSection);
  const bar = mk('div', { class: 'sqd-panel' });
  const tabs = mk('div', { id: 'sqd-tabs' }, bar);
  for (const t of ['hero', 'voice', 'buttons', 'ai', 'loop']) mk('button', { class: 'sqd-tab', 'data-tab': t }, tabs);
  const publish2 = mk('button', { id: 'sqd-publish-btn-2' }, bar);
  const publish2Label = mk('span', {}, publish2);            // a click usually lands on something inside the button
  mk('div', { id: 'sqd-save-global-status' }, bar);
  const tabContent = mk('div', { id: 'sqd-tab-content' }, bar);
  mk('div', { id: 'hero-save-status' }, tabContent);
  mk('input', { id: 'hero-title-input' }, tabContent);       // the page's older inputs live here until the Smart Editor replaces them
  mk('iframe', { id: 'sqd-iframe' });

  const storage = new Map();
  const window = {
    location: { hostname: 'www.qraivy.com', origin: 'https://www.qraivy.com', href: 'https://www.qraivy.com/smart-qr-detail.html' + (slug ? '?slug=' + slug : ''), search: slug ? '?slug=' + slug : '' },
    console: { log() {}, info() {}, warn() {}, error() {} },
    navigator: {},
    Clerk: { session: { getToken: () => Promise.resolve('tok-owner') } },
    confirm(text) { env.confirms.push(text); return env.confirmAnswer; },
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => { storage.set(k, String(v)); }, removeItem: (k) => { storage.delete(k); } },
    // the page's own editor state: its defaults, as smart-qr-detail.html declares them
    QRAIVY_EDITOR_STATE: { pageName: '', slug: '', dirty: false, hero: { title: '', subtitle: '', badgeText: 'Qraivy Smart Page', logoInitial: 'A' }, buttons: [],
      sections: { hero: { enabled: true, title: '', subtitle: '', badge: '' }, voice: { enabled: true, title: 'Voice Welcome', description: '', buttonLabel: 'Play' }, ai: { enabled: true, title: 'AI Assistant' }, loop: { enabled: true, title: 'Stay in the loop' }, footer: { enabled: true, businessName: '' }, buttons: [], order: ['hero', 'voice', 'ai', 'buttons', 'loop', 'footer'], theme: { background: 'dark', accentColor: '#ff5a1f' } } },
  };
  window.window = window; window.document = document;
  window.fetch = function (url, init) {
    const u = typeof url === 'string' ? url : url.url; const method = (init && init.method) || 'GET';
    const req = { url: u, method, headers: (init && init.headers) || {}, body: init && init.body ? JSON.parse(init.body) : null, sender: (init && init.headers && init.headers['X-Test-Sender']) || 'smart-editor' };
    env.requests.push(req);
    const answer = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => (body === '<<not json>>' ? Promise.reject(new SyntaxError('bad json')) : Promise.resolve(body)) });
    if (method === 'GET' && /\/api\/lp\//.test(u)) {
      const l = env.load;
      if (l && l.reject) return Promise.reject(new TypeError('Failed to fetch'));
      if (l && typeof l.status === 'number') return answer(l.status, l.body === undefined ? { error: 'x' } : l.body);
      return answer(200, l);
    }
    if (method === 'POST' && /\/lp\/voice\/preview\//.test(u)) return answer(200, { ok: true, status: 'none' });
    if (method === 'POST' && /\/lp$/.test(u)) {
      const ok = () => answer(200, { ok: true, url: 'https://www.qraivy.com/lp/' + slug, slug, id: 'page-1', voice: { enabled: !!(req.body.sections && req.body.sections.voice && req.body.sections.voice.enabled), pending: false } });
      if (!env.holdSave) return ok();
      return new Promise((resolve) => { env.pendingSaves.push(() => resolve(ok())); });
    }
    return answer(404, { error: 'not found' });
  };
  env.holdSave = holdSave;
  env.releaseSave = async () => { env.pendingSaves.splice(0).forEach((f) => f()); await settle(); };

  const ctx = vm.createContext({ window, document, localStorage: window.localStorage, fetch: (...a) => window.fetch(...a), console: window.console, navigator: window.navigator,
    URL, URLSearchParams, Promise, TypeError, Error, Array, String, Object, JSON, Date, Math, FormData: function () { this.append = () => {}; },
    setTimeout: (fn, ms) => { env.timers.push({ fn, ms }); return env.timers.length; }, clearTimeout: () => {} });
  ctx.window.setTimeout = ctx.setTimeout;

  // ── the page's own wiring of the buttons (smart-qr-detail.html) ──
  // its two older senders, as stand-ins: they record being reached and would send a save
  const legacyPublishPage = async () => { env.legacy.publish += 1; if (!window.confirm(CONFIRM_TEXT)) return; await window.Clerk.session.getToken(); await window.fetch('https://api.qraivy.com/lp', { method: 'POST', headers: { 'X-Test-Sender': 'legacy-publish' }, body: JSON.stringify({ slug: window.QRAIVY_EDITOR_STATE.slug, sections: window.QRAIVY_EDITOR_STATE.sections }) }); };
  const legacySaveDraft = async () => { env.legacy.draft += 1; await window.Clerk.session.getToken(); await window.fetch('https://api.qraivy.com/lp', { method: 'POST', headers: { 'X-Test-Sender': 'legacy-draft' }, body: JSON.stringify({ slug: window.QRAIVY_EDITOR_STATE.slug, sections: window.QRAIVY_EDITOR_STATE.sections }) }); };
  window.publishPage = legacyPublishPage;                    // the page: window.publishPage = publishPage
  window.saveDraftToBackend = legacySaveDraft;               // the page: window.saveDraftToBackend = saveDraftToBackend
  window.QRAIVY_EDITOR_STATE.slug = slug || '';             // the page fills this from the address
  const inline = (id) => { const code = inlineOnclick(id); return code ? vm.runInContext('(function(event){' + code + '})', ctx) : null; };
  publish1.onclick = inline('sqd-publish-btn'); publish2.onclick = inline('sqd-publish-btn-2'); draftBtn.onclick = inline('sqd-save-draft-btn');
  // (1) added while the page is parsed:   btn.addEventListener('click', function(){ publishPage(); });
  [publish1, publish2].forEach((b) => b.addEventListener('click', () => { legacyPublishPage(); }));
  draftBtn.addEventListener('click', () => { env.legacy.localDraft += 1; });
  // (2) added on DOMContentLoaded, i.e. AFTER smart-editor.js has run:   if(window.publishPage) window.publishPage();
  const wireLate = () => { [publish1, publish2].forEach((b) => b.addEventListener('click', () => { if (window.publishPage) window.publishPage(); })); draftBtn.addEventListener('click', () => { legacySaveDraft(); }); };
  if (!lateLegacyWiring) wireLate();

  for (const [name, src] of SCRIPTS) vm.runInContext(src, ctx, { filename: name });
  vm.runInContext(editor, ctx, { filename: 'smart-editor.js' });
  if (lateLegacyWiring) wireLate();

  Object.assign(env, { window, document, publish1, publish2, publish2Label, draftBtn, tabContent,
    el: (id) => document.getElementById(id),
    status: () => document.getElementById('sqd-save-global-status').textContent,
    saves: () => env.requests.filter((r) => r.method === 'POST' && /\/lp$/.test(r.url)),
    loads: () => env.requests.filter((r) => r.method === 'GET' && /\/api\/lp\//.test(r.url)),
    click: async (el) => { const r = dom.click(el); await settle(); return r; },
    change: async (id, value) => { const e = document.getElementById(id); e.value = value; dom.fire(e, 'change'); dom.fire(e, 'input'); await settle(); },
    // runs what the browser would run after a delay (the editor starts itself 900 ms after the page)
    runTimers: async () => { const due = env.timers.splice(0); for (const t of due) { t.fn(); await settle(); } },
  });
  if (runInit) { await env.runTimers(); await settle(); }
  return env;
}
const savedSections = (req) => req.body.sections;

// ── A. What the page does, and what the editor now does about it ──
test('A. smart-qr-detail.html still gives each Publish button its own older handlers — the reason one authority is needed', () => {
  assert.equal(inlineOnclick('sqd-publish-btn-2'), 'if(window.SmartEditor)window.SmartEditor.publish();else if(window.publishPage)window.publishPage();');
  assert.equal(inlineOnclick('sqd-save-draft-btn'), 'if(window.saveDraftToBackend)window.saveDraftToBackend();');
  assert.ok(EDITOR_PAGE.includes("if (btn) btn.addEventListener('click', function(){ publishPage(); });"));
  assert.ok(EDITOR_PAGE.includes("if (btn) btn.addEventListener('click', function(){ if(window.publishPage) window.publishPage(); });"));
  assert.equal((EDITOR_PAGE.match(/fetch\('https:\/\/api\.qraivy\.com\/lp', \{ method: 'POST'/g) || []).length, 2, 'the page has two senders of its own');
  assert.ok(EDITOR_PAGE.indexOf('<script src="smart-editor.js"></script>') > EDITOR_PAGE.indexOf('id="sqd-publish-btn-2"'), 'the editor script runs after the buttons exist');
});

test('A. smart-editor.js: one listener in front of everything, no handler of its own on the buttons, every entry point guarded', () => {
  assert.ok(SMART_EDITOR.includes("document.addEventListener('click',onGuardedClick,true);"));
  assert.ok(!/btn\.onclick\s*=/.test(SMART_EDITOR), 'the editor no longer adds a second handler to the buttons');
  assert.ok(SMART_EDITOR.includes('window.SmartEditor={state:SE,publish:requestPublish,reload:init,renderAll:renderAll};window.publishPage=requestPublish;'));
  assert.ok(!/publish:publish\b|window\.publishPage=publish\b/.test(SMART_EDITOR), 'the unguarded publish is not reachable from the page');
  assert.equal((SMART_EDITOR.match(/window\.confirm\(/g) || []).length, 1, 'one confirmation');
  // a failed load no longer takes over default values
  assert.ok(!SMART_EDITOR.includes('QRAIVY_EDITOR_STATE fallback') && !/var leg=window\.QRAIVY_EDITOR_STATE/.test(SMART_EDITOR));
  const failure = SMART_EDITOR.slice(SMART_EDITOR.indexOf("console.error('[SE] Backend failed:'"), SMART_EDITOR.indexOf("console.log('[SE] Ready')"));
  assert.match(failure, /^console\.error\('\[SE\] Backend failed:',e\.message\);guard\.state='failed';paintGuard\(\);showLoadFailed\(\);return;\}guard\.state='ready';paintGuard\(\);renderAll\(\);$/);
  assert.equal((SMART_EDITOR.match(/guard\.state='ready'/g) || []).length, 1, 'ready is set in exactly one place: after a successful load');
});

// ── B. One click, one save ─────────────────────────────────────
test('B. one click on either Publish button: one confirmation, exactly one save, sent by the Smart Editor; the page\'s older handlers never run', async () => {
  for (const which of ['publish1', 'publish2', 'publish2Label']) {
    for (const lateLegacyWiring of [true, false]) {
      const env = await openEditor({ lateLegacyWiring });
      assert.equal(env.loads().length, 1, 'the page was loaded once');
      const r = await env.click(env[which]);
      assert.ok(r.stoppedAtDocument, which + ': the click is handled before it reaches the button');
      assert.deepEqual(env.confirms, [CONFIRM_TEXT], which);
      assert.equal(env.saves().length, 1, which + ': exactly one POST /lp');
      assert.equal(env.saves()[0].sender, 'smart-editor');
      assert.equal(env.saves()[0].url, 'https://api.qraivy.com/lp');
      assert.equal(env.saves()[0].headers.Authorization, 'Bearer tok-owner');
      assert.equal(env.saves()[0].body.slug, SLUG);
      assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 });
      assert.equal(env.status(), 'Published');
    }
  }
});

test('B. the editor as it was before (6846266), in this same page: one click sent three saves from two different states', async () => {
  const env = await openEditor({ editor: EDITOR_BEFORE });
  await env.change('se-voice-lang', 'de');
  await env.click(env.publish2);
  // three saves; the order they reach the server in is not fixed, which is the danger
  assert.deepEqual(env.saves().map((x) => x.sender).sort(), ['legacy-publish', 'smart-editor', 'smart-editor']);
  const own = env.saves().filter((x) => x.sender === 'smart-editor'), older = env.saves().filter((x) => x.sender === 'legacy-publish')[0];
  assert.deepEqual(own.map((x) => x.body.sections.language), ['de', 'de']);
  assert.equal(older.body.sections.language, undefined, "the page's older sender carries no language of its own");
  assert.equal(older.body.sections.voice.enabled, true, 'and it says Voice is on, whatever the owner chose');
  // and after a failed load it published default values
  const failed = await openEditor({ editor: EDITOR_BEFORE, load: { status: 403 } });
  await failed.click(failed.publish2);
  const blind = failed.saves().filter((x) => x.sender === 'smart-editor');
  assert.equal(blind.length, 2);
  assert.equal(blind[0].body.sections.voice.enabled, true, 'Voice on by default');
  assert.equal(blind[0].body.useCase, 'restaurant'); assert.equal(blind[0].body.businessName, '');
});

// ── C. The confirmation ────────────────────────────────────────
test('C. Cancel in the confirmation sends nothing at all, and the next click asks again', async () => {
  const env = await openEditor({ confirm: false });
  await env.click(env.publish2);
  await env.click(env.publish1);
  assert.equal(env.confirms.length, 2);
  assert.equal(env.saves().length, 0, 'no request after Cancel');
  assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 });
  assert.equal(env.publish2.disabled, false, 'the button stays usable');
  env.confirmAnswer = true;
  await env.click(env.publish2);
  assert.equal(env.saves().length, 1);
  assert.equal(env.confirms.length, 3);
});

// ── D. Rapid clicks ────────────────────────────────────────────
test('D. clicks while a save is running send nothing more and ask nothing more; afterwards publishing works again', async () => {
  const env = await openEditor({ holdSave: true });
  await env.click(env.publish2);
  assert.equal(env.saves().length, 1);
  assert.equal(env.publish1.disabled, true); assert.equal(env.publish2.disabled, true);
  assert.equal(env.publish2.style.opacity, '0.5');
  // the buttons are disabled; and every other way in is closed as well
  for (let i = 0; i < 5; i++) { await env.click(env.publish2); await env.click(env.publish1); }
  await env.window.SmartEditor.publish(); await env.window.publishPage();
  env.publish2.disabled = false; await env.click(env.publish2); env.publish2.disabled = true;   // even if something re-enabled the button
  await settle();
  assert.equal(env.saves().length, 1, 'still one save');
  assert.equal(env.confirms.length, 1, 'still one confirmation');
  assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 });
  await env.releaseSave();
  assert.equal(env.publish1.disabled, false); assert.equal(env.publish2.disabled, false);
  assert.equal(env.publish2.style.opacity, ''); assert.equal(env.publish2.style.cursor, 'pointer');
  env.holdSave = false;
  await env.click(env.publish1);
  assert.equal(env.saves().length, 2);
  assert.equal(env.confirms.length, 2);
});

// ── E. Before the page has loaded ──────────────────────────────
test('E. from the moment the script runs until the page is loaded, nothing can be published or saved', async () => {
  const env = await openEditor({ runInit: false });               // the editor has not started yet (it starts 900 ms later)
  assert.equal(env.loads().length, 0);
  assert.equal(env.publish1.disabled, true); assert.equal(env.publish2.disabled, true);
  await env.click(env.publish2); await env.click(env.draftBtn);
  // also when something bypasses the disabled state or calls in directly
  env.publish2.disabled = false; env.publish1.disabled = false;
  await env.click(env.publish2); await env.click(env.publish1); await env.click(env.publish2Label); await env.click(env.draftBtn);
  await env.window.SmartEditor.publish(); await env.window.publishPage();
  assert.equal(env.saves().length, 0, 'no request');
  assert.equal(env.confirms.length, 0, 'no dialog');
  assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 }, 'the page\'s older handlers were not reached either');
  assert.equal(env.status(), 'Loading...');
  // once the editor has loaded the page, everything works
  await env.runTimers(); await settle();
  assert.equal(env.loads().length, 1);
  assert.equal(env.publish2.disabled, false);
  await env.click(env.publish2);
  assert.equal(env.saves().length, 1);
});

// ── F. Failed loads ────────────────────────────────────────────
const FAILED_LOADS = [
  ['not signed in (401)', { status: 401 }], ['not allowed (403)', { status: 403 }], ['no such page (404)', { status: 404 }], ['server error (500)', { status: 500 }],
  ['no connection', { reject: true }], ['an answer that is not JSON', { status: 200, body: '<<not json>>' }], ['an empty answer', { status: 200, body: null }],
  ['another page\'s record', { status: 200, body: serverPage({ slug: 'someone-else' }) }], ['an answer without a slug', { status: 200, body: { ok: true } }],
];
test('F. a failed load blocks Publish and Save Draft, shows why, and never turns default values into the page\'s state', async () => {
  for (const [what, load] of FAILED_LOADS) {
    const env = await openEditor({ load });
    assert.equal(env.loads().length, 1, what);
    assert.equal(env.status(), LOAD_FAILED_TEXT, what);
    assert.equal(env.publish1.disabled, true, what); assert.equal(env.publish2.disabled, true, what);
    // the editor shows no editable defaults: no Voice switch reading "On", no fields
    assert.equal(env.document.querySelectorAll('.se-panel').length, 0, what + ': no panels');
    for (const id of ['se-voice-enabled', 'se-voice-lang', 'se-hero-title', 'se-voice-preview-generate']) assert.equal(env.el(id), null, what + ': ' + id);
    assert.notEqual(env.window.SmartEditor.state.loaded, true, what);
    // every way of saving is closed
    await env.click(env.publish1); await env.click(env.publish2); await env.click(env.draftBtn);
    env.publish1.disabled = false; env.publish2.disabled = false;
    await env.click(env.publish1); await env.click(env.publish2); await env.click(env.publish2Label); await env.click(env.draftBtn);
    await env.window.SmartEditor.publish(); await env.window.publishPage();
    assert.equal(env.saves().length, 0, what + ': no save request of any kind');
    assert.equal(env.confirms.length, 0, what + ': no dialog');
    assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 }, what + ': the page\'s older senders were not reached');
    assert.equal(env.requests.filter((r) => /voice\/preview/.test(r.url)).length, 0, what + ': no audio request');
    assert.equal(env.status(), LOAD_FAILED_TEXT, what);
  }
});

test('F. after a failed load, loading again successfully publishes the SERVER\'s values, not the defaults', async () => {
  const env = await openEditor({ load: { status: 500 } });
  assert.equal(env.status(), LOAD_FAILED_TEXT);
  env.load = serverPage();
  await env.window.SmartEditor.reload(); await settle();
  assert.equal(env.publish2.disabled, false);
  assert.equal(env.el('se-voice-enabled').textContent, 'Off', 'the Voice switch shows what is saved');
  await env.click(env.publish2);
  assert.equal(env.saves().length, 1);
  const s = savedSections(env.saves()[0]);
  assert.equal(s.voice.enabled, false);
  assert.equal(s.language, 'en');
  assert.equal(env.saves()[0].body.businessName, 'Casa Lumi');
  // and a page that loaded fine and then fails on reload is blocked again
  env.load = { status: 403 };
  await env.window.SmartEditor.reload(); await settle();
  await env.click(env.publish2); await env.window.publishPage();
  assert.equal(env.saves().length, 1);
  assert.equal(env.status(), LOAD_FAILED_TEXT);
});

// ── G. Save Draft ──────────────────────────────────────────────
test('G. Save Draft: blocked until the page has loaded; once it has, it is the page\'s own unchanged behaviour', async () => {
  const early = await openEditor({ runInit: false });
  await early.click(early.draftBtn);
  assert.deepEqual(early.legacy, { publish: 0, draft: 0, localDraft: 0 });
  assert.equal(early.saves().length, 0);

  const env = await openEditor();
  const r = await env.click(env.draftBtn);
  assert.ok(!r.stoppedAtDocument, 'the click is passed through');
  assert.equal(env.legacy.localDraft, 1);
  assert.equal(env.legacy.draft, 2, 'the page\'s Save Draft runs as it does today (its inline handler and its listener)');
  assert.equal(env.legacy.publish, 0);
  assert.equal(env.confirms.length, 0);
  assert.ok(env.saves().every((s) => s.sender === 'legacy-draft'), 'the Smart Editor itself sends nothing on Save Draft');
});

// ── H. Language ────────────────────────────────────────────────
test('H. the language selected in the Voice tab is the language of the one save — German, then English', async () => {
  const env = await openEditor();
  assert.equal(env.el('se-voice-lang').value, 'en');
  await env.change('se-voice-lang', 'de');
  await env.click(env.publish2);
  assert.equal(env.saves().length, 1);
  let s = savedSections(env.saves()[0]);
  assert.equal(s.language, 'de'); assert.equal(s.voice.language, 'de'); assert.equal(s.voice.voiceKey, 'anna_de');
  await env.change('se-voice-lang', 'en');
  await env.click(env.publish1);
  assert.equal(env.saves().length, 2);
  s = savedSections(env.saves()[1]);
  assert.equal(s.language, 'en'); assert.equal(s.voice.language, 'en'); assert.equal(s.voice.voiceKey, 'sarah');
  assert.ok(env.saves().every((x) => x.sender === 'smart-editor' && typeof x.body.sections.voice.language === 'string'), 'no save without a language of its own');
  assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 });
});

// ── I. Voice settings, previews and audio ──────────────────────
test('I. the Voice switch, custom greetings and stored audio references go out as the owner left them', async () => {
  const env = await openEditor();
  assert.equal(env.el('se-voice-enabled').textContent, 'Off');
  await env.click(env.publish2);
  let v = savedSections(env.saves()[0]).voice;
  assert.equal(v.enabled, false, 'a page saved with Voice off is not switched on by publishing');
  assert.deepEqual(v.customGreeting, { en: 'Hello and welcome to Casa Lumi, your table is waiting.' });
  // server-owned audio fields are sent back untouched (the server keeps its own copy in any case)
  assert.equal(v.audioUrl, 'https://res.cloudinary.example/audio/published.mp3'); assert.equal(v.audioFor, 'fp-published');
  assert.equal(v.previewUrl, 'https://res.cloudinary.example/audio/preview.mp3'); assert.deepEqual(v.previewCache, { 'fp-preview': 'https://res.cloudinary.example/audio/preview.mp3' });
  // switching Voice on is saved as on, with one request
  await env.click(env.el('se-voice-enabled'));
  assert.equal(env.el('se-voice-enabled').textContent, 'On');
  await env.click(env.publish2);
  assert.equal(env.saves().length, 2);
  v = savedSections(env.saves()[1]).voice;
  assert.equal(v.enabled, true);
  assert.deepEqual(v.customGreeting, { en: 'Hello and welcome to Casa Lumi, your table is waiting.' });
  // publishing asks for no recording by itself
  assert.equal(env.requests.filter((r) => /voice\/preview/.test(r.url) && r.body && r.body.generate === true).length, 0);
});

// ── J. Everything the Smart Editor does not edit ───────────────
test('J. fields the Smart Editor does not edit — including those of the older editor — are saved back exactly as loaded', async () => {
  const page = serverPage(); const loaded = JSON.parse(page.sections);
  const env = await openEditor({ load: page });
  await env.change('se-hero-title', 'Casa Lumi Ulm');
  await env.click(env.publish2);
  assert.equal(env.saves().length, 1);
  const body = env.saves()[0].body, s = body.sections;
  for (const key of ['ai', 'loop', 'footer', 'info', 'settings', 'order', 'featured', 'businessInfo', 'actionLinks', 'siteContent', 'aiGenerated', 'crawlLocked']) assert.deepEqual(s[key], loaded[key], key);
  assert.equal(body.businessName, 'Casa Lumi'); assert.equal(body.websiteUrl, 'https://casalumi.example'); assert.equal(body.useCase, 'restaurant'); assert.equal(body.template, 'premium'); assert.equal(body.brandColor, '#123456');
  assert.equal(s.hero.title, 'Casa Lumi Ulm', 'the edit made in the Smart Editor is in the save');
  assert.equal(s.hero.subtitle, 'Fresh pasta daily'); assert.equal(s.hero.aiTitle, 'Casa Lumi — Trattoria');
  // (the Smart Editor lists its eleven platforms; the saved button is among them, unchanged)
  assert.deepEqual(s.buttons.filter((x) => x.active), loaded.buttons);
  assert.ok(s.buttons.filter((x) => !x.active).every((x) => x.url === ''));
  assert.equal(s.theme.buttonStyle, 'rounded'); assert.equal(s.logo.url, 'https://res.cloudinary.example/logos/casa.png');
  // none of the page's own default values (its older editor state) reached the server
  assert.notEqual(s.ai.title, 'AI Assistant'); assert.notEqual(s.loop.title, 'Stay in the loop');
  assert.ok(!('title' in s.voice), 'the older editor\'s voice block was not sent');
});

test('J. the one save now sent is exactly the save the Smart Editor sent before this change — nothing added, nothing dropped', async () => {
  const scenarios = {
    'unchanged page': async () => {},
    'German selected': async (env) => { await env.change('se-voice-lang', 'de'); },
    'Voice switched on': async (env) => { await env.click(env.el('se-voice-enabled')); },
    'hero and greeting edited': async (env) => { await env.change('se-hero-title', 'Casa Lumi Ulm'); await env.change('se-hero-subtitle', 'Neu am Münsterplatz'); await env.change('se-voice-greeting', 'Welcome to Casa Lumi. Tonight: fresh tagliatelle.'); },
  };
  for (const [what, edit] of Object.entries(scenarios)) {
    const before = await openEditor({ editor: EDITOR_BEFORE }); await edit(before); await before.click(before.publish2);
    const now = await openEditor(); await edit(now); await now.click(now.publish2);
    const was = before.saves().filter((x) => x.sender === 'smart-editor');
    assert.equal(was.length, 2, what); assert.deepEqual(was[0].body, was[1].body, what + ': before, the editor sent its save twice');
    assert.equal(now.saves().length, 1, what);
    assert.deepEqual(now.saves()[0].body, was[0].body, what + ': same save as before');
    assert.equal(JSON.stringify(now.saves()[0].headers), JSON.stringify(was[0].headers), what);
  }
});

// ── K. Pages without a Smart Editor page ───────────────────────
test('K. where there is no page for the Smart Editor (no slug), the buttons are left entirely to the page, as before', async () => {
  const env = await openEditor({ slug: '' });
  assert.equal(env.loads().length, 0);
  assert.equal(env.publish1.disabled, false); assert.equal(env.publish2.disabled, false);
  const r = await env.click(env.publish1);
  assert.ok(!r.stoppedAtDocument);
  assert.equal(env.legacy.publish, 1, 'the page\'s own handler runs');
  await env.click(env.draftBtn);
  assert.equal(env.legacy.draft, 2);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${String(err && err.stack || err).split('\n').slice(0, 6).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
