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
//   - just before the one save the page is read again: if a field this
//     editor edits was changed elsewhere the owner decides, if the page
//     cannot be read nothing is published, and everything this editor does
//     not edit is saved as the server has it at that moment
//   - Save Draft sends nothing: it keeps the owner's unfinished changes in
//     this browser, says so, restores them on the next visit, and never
//     puts a draft over a newer published page without the owner's say
//
// What is real: smart-editor.js, js/voice-greetings.js,
// js/voice-greeting-editor.js, js/staging-config.js and js/lp-routing.js,
// run in a stand-in browser. The Publish / Save Draft buttons carry the
// same three kinds of handler smart-qr-detail.html gives them (its inline
// onclick text is read from the page itself); the page's two older
// senders are stand-ins that record being called and would send a save.
// The editor as it was before this change (commit 6846266) is run in the
// same stand-in page to show the fault and to prove that the one save now
// sent is, field for field, the save the Smart Editor sent before. For
// Save Draft the comparison is with commit d20b17f.
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
// smart-editor.js before Save Draft became a local draft
const EDITOR_BEFORE_DRAFT_FIX = execFileSync('git', ['show', 'd20b17f:frontend/public/smart-editor.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replace(/\r\n/g, '\n');
const SCRIPTS = ['js/staging-config.js', 'js/lp-routing.js', 'js/voice-greetings.js', 'js/voice-greeting-editor.js'].map((f) => [f, read(PUB, ...f.split('/'))]);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

const SLUG = 'casa-lumi';
const CONFIRM_TEXT = 'Publish this page? This will update your live Smart QR page immediately.';
const LOAD_FAILED_TEXT = 'This page could not be loaded, so nothing can be saved or published. Please reload the page.';
const DRAFT_SAVED_TEXT = 'Draft saved on this device only — not published.';
const DRAFT_NOT_SAVED_TEXT = 'The draft could not be saved on this device. Nothing was published.';
const DRAFT_RESTORED_TEXT = 'Local draft restored — not published yet.';
const DRAFT_BUTTON_ID = 'sqd-save-draft-btn-se';
const DRAFT_SET_ASIDE_TEXT = 'Showing the published page. Your local draft was not applied.';
const DRAFT_KEY = 'qraivy_se_draft_' + SLUG;

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
//   storage  the browser's localStorage (pass the same Map again to "reload the page")
//   storageFails  true: the browser refuses to store anything
async function openEditor({ slug = SLUG, load = serverPage(), confirm = true, holdSave = false, lateLegacyWiring = true, runInit = true, editor = SMART_EDITOR, storage = new Map(), storageFails = false, holdLoad = false } = {}) {
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

  const window = {
    location: { hostname: 'www.qraivy.com', origin: 'https://www.qraivy.com', href: 'https://www.qraivy.com/smart-qr-detail.html' + (slug ? '?slug=' + slug : ''), search: slug ? '?slug=' + slug : '' },
    console: { log() {}, info() {}, warn() {}, error() {} },
    navigator: {},
    Clerk: { session: { getToken: () => Promise.resolve('tok-owner') } },
    confirm(text) { env.confirms.push(text); return env.confirmAnswer; },
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => { if (storageFails) throw new Error('QuotaExceededError'); env.storageWrites.push(k); storage.set(k, String(v)); }, removeItem: (k) => { storage.delete(k); } },
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
      const reply = () => ((l && typeof l.status === 'number') ? answer(l.status, l.body === undefined ? { error: 'x' } : l.body) : answer(200, l));
      if (env.holdLoad) return new Promise((resolve) => { env.pendingLoads.push(() => resolve(reply())); });
      return reply();
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
  env.holdLoad = holdLoad; env.pendingLoads = []; env.storageWrites = [];
  env.releaseLoad = async () => { env.holdLoad = false; env.pendingLoads.splice(0).forEach((f) => f()); await settle(); };

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

  Object.assign(env, { window, document, publish1, publish2, publish2Label, draftBtn, tabContent, storage,
    draft: () => (storage.has(DRAFT_KEY) ? JSON.parse(storage.get(DRAFT_KEY)) : null),
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
  assert.equal((SMART_EDITOR.match(/window\.confirm\(PUBLISH_CONFIRM\)/g) || []).length, 1, 'one confirmation for publishing');
  assert.equal((SMART_EDITOR.match(/window\.confirm\(DRAFT_CONFLICT\)/g) || []).length, 1, 'one question about a draft made from an older version of the page');
  assert.equal((SMART_EDITOR.match(/window\.confirm\(conflictText\(d\)\)/g) || []).length, 1, 'one question when the page was changed elsewhere before publishing');
  assert.equal((SMART_EDITOR.match(/window\.confirm\(/g) || []).length, 3, 'and no other dialog');
  // the one save is only reachable through the check that reads the page again
  assert.equal((SMART_EDITOR.match(/[^a-zA-Z_]publish\(\)/g) || []).length, 3, 'publish() is defined once and called from two places');
  assert.ok(SMART_EDITOR.includes("if(guard.state==='off')return publish();"), 'directly only where there is no page');
  assert.ok(SMART_EDITOR.includes('return checkBeforePublish().then(function(ok){if(!ok)return false;return publish().then('), 'otherwise only after the check');
  // a failed load no longer takes over default values
  assert.ok(!SMART_EDITOR.includes('QRAIVY_EDITOR_STATE fallback') && !/var leg=window\.QRAIVY_EDITOR_STATE/.test(SMART_EDITOR));
  const failure = SMART_EDITOR.slice(SMART_EDITOR.indexOf("console.error('[SE] Backend failed:'"), SMART_EDITOR.indexOf("console.log('[SE] Ready')"));
  assert.match(failure, /^console\.error\('\[SE\] Backend failed:',e\.message\);guard\.state='failed';paintGuard\(\);showLoadFailed\(\);return;\}guard\.state='ready';paintGuard\(\);renderAll\(\);if\(restored\)/);
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
  env.window.SmartEditor.publish(); env.window.publishPage(); await settle();
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
// The owner's unfinished changes used in these tests: Voice on, German, an own greeting, a new title.
async function makeChanges(env) {
  await env.click(env.el('se-voice-enabled'));
  await env.change('se-voice-lang', 'de');
  await env.change('se-voice-greeting', 'Willkommen bei Casa Lumi. Heute: frische Tagliatelle.');
  await env.change('se-hero-title', 'Casa Lumi Ulm');
}
const noSaves = (env, what) => {
  assert.equal(env.saves().length, 0, what + ': no save request');
  assert.equal(env.requests.filter((r) => r.method !== 'GET').filter((r) => !/voice\/preview/.test(r.url) || (r.body && r.body.generate === true)).length, 0, what + ': nothing that changes anything on the server, no recording');
  assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 }, what + ': the page\'s older Save Draft code was not reached');
};

test('G. before this change, Save Draft on this page sent two saves built from the page\'s older state (d20b17f)', async () => {
  const env = await openEditor({ editor: EDITOR_BEFORE_DRAFT_FIX });
  await makeChanges(env);
  await env.click(env.draftBtn);
  assert.equal(env.legacy.draft, 2);
  assert.deepEqual(env.saves().map((x) => x.sender), ['legacy-draft', 'legacy-draft']);
  assert.ok(env.saves().every((x) => x.body.sections.voice.title === 'Voice Welcome' && x.body.sections.language === undefined), 'the older state, not what the owner sees');
});

test('G. Save Draft sends nothing: no save, no publishing, no recording — however often it is clicked', async () => {
  const env = await openEditor();
  const requestsBefore = env.requests.length;
  for (let i = 0; i < 4; i++) { const r = await env.click(env.draftBtn); assert.ok(r.stoppedAtDocument, 'handled before the page\'s own handlers'); }
  await makeChanges(env);
  for (let i = 0; i < 3; i++) await env.click(env.draftBtn);
  noSaves(env, 'Save Draft');
  assert.equal(env.requests.slice(requestsBefore).filter((r) => r.method === 'GET').length, 0, 'not even a read');
  assert.equal(env.confirms.length, 0, 'no dialog');
  assert.equal(env.status(), DRAFT_SAVED_TEXT, 'the status line says it is local and not published');
  assert.match(DRAFT_SAVED_TEXT, /this device only/); assert.match(DRAFT_SAVED_TEXT, /not published/);
});

test('G. the local draft holds the unfinished changes: Voice switch, language, greeting, hero, buttons, style', async () => {
  const env = await openEditor();
  await makeChanges(env);
  await env.click(env.draftBtn);
  const d = env.draft();
  assert.equal(d.voice.enabled, true); assert.equal(d.voice.language, 'de'); assert.equal(d.voice.voiceKey, 'anna_de');
  assert.equal(d.voice.customGreeting.de, 'Willkommen bei Casa Lumi. Heute: frische Tagliatelle.');
  assert.equal(d.voice.customGreeting.en, 'Hello and welcome to Casa Lumi, your table is waiting.', 'the saved English greeting is kept alongside');
  assert.equal(d.hero.title, 'Casa Lumi Ulm'); assert.equal(d.hero.subtitle, 'Fresh pasta daily');
  assert.ok(Array.isArray(d.buttons) && d.buttons.some((x) => x.type === 'instagram' && x.active));
  assert.equal(d.style.brandColor, '#123456'); assert.equal(d.style.logoUrl, 'https://res.cloudinary.example/logos/casa.png');
  assert.match(d.base, /^\d+\.[0-9a-f]+$/, 'it remembers which version of the page it was made from');
  assert.equal(typeof d.savedAt, 'number');
  // nothing the server owns is in it, and no credentials
  assert.ok(!/audioUrl|previewCache|tok-owner|Bearer/.test(JSON.stringify(d)));
});

test('G. reloading the page restores the draft, says it is not published, and one Publish then saves exactly those changes', async () => {
  const first = await openEditor();
  await makeChanges(first);
  await first.click(first.draftBtn);
  // the page is opened again; the server still has what it had
  const env = await openEditor({ storage: first.storage });
  assert.equal(env.confirms.length, 0, 'same version of the page: no question');
  assert.equal(env.status(), DRAFT_RESTORED_TEXT);
  assert.equal(env.el('se-voice-enabled').textContent, 'On');
  assert.equal(env.el('se-voice-lang').value, 'de');
  assert.equal(env.el('se-voice-greeting').value, 'Willkommen bei Casa Lumi. Heute: frische Tagliatelle.');
  assert.equal(env.el('se-hero-title').value, 'Casa Lumi Ulm');
  noSaves(env, 'restoring');
  // Publish: one confirmation, one save, with the restored values
  await env.click(env.publish2);
  assert.deepEqual(env.confirms, [CONFIRM_TEXT]);
  assert.equal(env.saves().length, 1);
  const body = env.saves()[0].body, sec = body.sections;
  assert.equal(env.saves()[0].sender, 'smart-editor');
  assert.equal(sec.voice.enabled, true); assert.equal(sec.language, 'de'); assert.equal(sec.voice.language, 'de');
  assert.equal(sec.voice.customGreeting.de, 'Willkommen bei Casa Lumi. Heute: frische Tagliatelle.');
  assert.equal(sec.hero.title, 'Casa Lumi Ulm');
  assert.equal(body.useCase, 'restaurant', 'the industry is the page\'s own (the Smart Editor has no field for it)');
  assert.deepEqual(sec.loop, JSON.parse(serverPage().sections).loop, 'fields outside the Smart Editor are untouched');
  // published: the draft is gone, and it is not asked about again
  assert.equal(env.draft(), null);
  const again = await openEditor({ storage: env.storage });
  assert.equal(again.confirms.length, 0); assert.notEqual(again.status(), DRAFT_RESTORED_TEXT);
});

test('G. unfinished changes are also kept without pressing Save Draft, and survive a reload the same way', async () => {
  const first = await openEditor();
  await first.change('se-hero-subtitle', 'Neu am Münsterplatz');
  assert.equal(first.draft().hero.subtitle, 'Neu am Münsterplatz');
  const env = await openEditor({ storage: first.storage });
  assert.equal(env.el('se-hero-subtitle').value, 'Neu am Münsterplatz');
  assert.equal(env.status(), DRAFT_RESTORED_TEXT);
  noSaves(env, 'autosave');
});

test('G. a draft made from an older version of the page is never applied over the newer one without the owner deciding', async () => {
  const first = await openEditor();
  await makeChanges(first);
  await first.click(first.draftBtn);
  const stored = first.storage.get(DRAFT_KEY);
  // meanwhile the page was changed and published somewhere else
  const newer = () => serverPage({ sections: { hero: { title: 'Casa Lumi', subtitle: 'Now with a garden', badge: 'Restaurant' } } });

  // Cancel: the published page is shown, the draft is not applied — and not deleted
  const keep = await openEditor({ storage: new Map(first.storage), load: newer(), confirm: false });
  assert.equal(keep.confirms.length, 1); assert.match(keep.confirms[0], /published page has changed since that draft was made/);
  assert.equal(keep.status(), DRAFT_SET_ASIDE_TEXT);
  assert.equal(keep.el('se-hero-subtitle').value, 'Now with a garden');
  assert.equal(keep.el('se-hero-title').value, 'Casa Lumi'); assert.equal(keep.el('se-voice-enabled').textContent, 'Off'); assert.equal(keep.el('se-voice-lang').value, 'en');
  assert.equal(keep.storage.get(DRAFT_KEY), stored, 'the draft is still there, byte for byte');
  keep.confirmAnswer = true;
  await keep.click(keep.publish2);
  assert.equal(keep.saves().length, 1);
  assert.equal(keep.saves()[0].body.sections.hero.subtitle, 'Now with a garden'); assert.equal(keep.saves()[0].body.sections.voice.enabled, false);

  // ... and when the owner then starts a new draft, the old one is kept as the previous draft
  const edit = await openEditor({ storage: new Map(first.storage), load: newer(), confirm: false });
  await edit.change('se-hero-badge', 'Trattoria');
  assert.equal(edit.storage.get(DRAFT_KEY + ':previous'), stored, 'nothing was thrown away');
  assert.equal(edit.draft().hero.badge, 'Trattoria'); assert.equal(edit.draft().hero.subtitle, 'Now with a garden');

  // OK: the owner chooses the draft
  const take = await openEditor({ storage: new Map(first.storage), load: newer(), confirm: true });
  assert.equal(take.confirms.length, 1);
  assert.equal(take.status(), DRAFT_RESTORED_TEXT);
  assert.equal(take.el('se-hero-title').value, 'Casa Lumi Ulm'); assert.equal(take.el('se-voice-enabled').textContent, 'On');
  noSaves(take, 'choosing the draft');
});

test('G. what the server does on its own (visits, preview recordings, attached audio) is not mistaken for a newer version', async () => {
  const first = await openEditor();
  await makeChanges(first);
  await first.click(first.draftBtn);
  const loaded = JSON.parse(serverPage().sections);
  const serverSide = serverPage({ scanCount: 4711, updatedAt: '2030-01-01T00:00:00.000Z',
    sections: { voice: Object.assign({}, loaded.voice, { audioUrl: 'https://res.cloudinary.example/audio/new.mp3', audioFor: 'fp-new', audioLang: 'de', previewUrl: 'https://res.cloudinary.example/audio/p2.mp3', previewFor: 'fp-p2', previewLang: 'de', previewCache: { 'fp-p2': 'https://res.cloudinary.example/audio/p2.mp3' } }) } });
  const env = await openEditor({ storage: first.storage, load: serverSide });
  assert.equal(env.confirms.length, 0, 'no question');
  assert.equal(env.status(), DRAFT_RESTORED_TEXT);
  assert.equal(env.el('se-hero-title').value, 'Casa Lumi Ulm');
  // a real change of a Voice setting on the server IS a newer version
  const changed = await openEditor({ storage: new Map(first.storage), confirm: false, load: serverPage({ sections: { voice: Object.assign({}, loaded.voice, { enabled: true }) } }) });
  assert.equal(changed.confirms.length, 1);
  // ... and so is any other field this editor edits
  for (const sections of [{ language: 'de' }, { buttons: [] }, { theme: { accentColor: '#000000', background: 'dark' } }, { hero: Object.assign({}, loaded.hero, { badge: 'Trattoria' }) }]) {
    const e = await openEditor({ storage: new Map(first.storage), confirm: false, load: serverPage({ sections }) });
    assert.equal(e.confirms.length, 1, JSON.stringify(sections));
  }
  // What the draft does not contain cannot be overwritten by it, so it raises no question:
  // the page's name, website and industry, the settings of other parts of the product, a staff
  // PIN, and everything the website scan generates.
  const elsewhere = serverPage({ useCase: 'fitness', businessName: 'Casa Lumi Ulm GmbH', websiteUrl: 'https://casalumi-ulm.example',
    sections: { staffPin: 'hash-of-a-pin', loop: { enabled: true, title: 'Changed elsewhere' }, footer: { businessName: 'Neu GmbH' }, settings: { pageActive: true, voiceEnabled: true, aiEnabled: true },
      hero: Object.assign({}, loaded.hero, { aiTitle: 'A new scanned title', aiSubtitle: 'A new scanned subtitle' }), featured: [{ enabled: true, icon: 'y', title: 'Scanned', description: 'again' }], businessInfo: { hours: 'changed' }, actionLinks: [], siteContent: 'scanned again', aiGeneratedAt: '2030-01-01T00:00:00.000Z' } });
  const quiet = await openEditor({ storage: new Map(first.storage), confirm: false, load: elsewhere });
  assert.equal(quiet.confirms.length, 0);
  assert.equal(quiet.status(), DRAFT_RESTORED_TEXT);
});

test('G. a draft stored by the editor before this change (no version in it) is not applied without asking', async () => {
  const old = new Map([[DRAFT_KEY, JSON.stringify({ hero: { title: 'Old draft title', subtitle: '', badge: '' }, voice: { enabled: true, language: 'de', voiceKey: 'anna_de', customText: '', customGreeting: {} }, buttons: [], style: { brandColor: '#000000', logoUrl: '', walletHeroUrl: '' } })]]);
  const env = await openEditor({ storage: old, confirm: false });
  assert.equal(env.confirms.length, 1);
  assert.equal(env.el('se-hero-title').value, 'Casa Lumi'); assert.equal(env.el('se-voice-enabled').textContent, 'Off');
  assert.ok(env.storage.has(DRAFT_KEY), 'and it is not deleted');
});

test('G. before the page has loaded and after a failed load: Save Draft is blocked, writes nothing, and an existing draft is left exactly as it is', async () => {
  const first = await openEditor();
  await makeChanges(first);
  await first.click(first.draftBtn);
  const stored = first.storage.get(DRAFT_KEY);

  const early = await openEditor({ storage: new Map(first.storage), runInit: false });
  await early.click(early.draftBtn);
  noSaves(early, 'before loading');
  assert.equal(early.storage.get(DRAFT_KEY), stored);
  assert.equal(early.status(), 'Loading...');

  for (const [what, load] of FAILED_LOADS) {
    const env = await openEditor({ storage: new Map(first.storage), load });
    await env.click(env.draftBtn); await env.click(env.draftBtn);
    noSaves(env, what);
    assert.equal(env.confirms.length, 0, what + ': no dialog');
    assert.equal(env.status(), LOAD_FAILED_TEXT, what);
    assert.equal(env.storage.get(DRAFT_KEY), stored, what + ': the stored draft is untouched');
    assert.equal(env.storage.has(DRAFT_KEY + ':previous'), false, what);
    // with no draft stored, a failed load does not create one from default values
    const empty = await openEditor({ load });
    await empty.click(empty.draftBtn);
    assert.equal(empty.storage.size, 0, what + ': nothing written');
  }
});

test('G. while the page is still loading, nothing typed into the empty editor can replace a stored draft', async () => {
  const first = await openEditor();
  await makeChanges(first);
  await first.click(first.draftBtn);
  const stored = first.storage.get(DRAFT_KEY);
  // the editor has started and shows its (still empty) fields, but the server has not answered yet
  const env = await openEditor({ storage: first.storage, holdLoad: true });
  assert.equal(env.loads().length, 1); assert.ok(env.el('se-hero-title'), 'the fields are there');
  await env.change('se-hero-title', 'typed too early'); await env.change('se-voice-lang', 'en');
  await env.click(env.draftBtn);
  assert.equal(env.storage.get(DRAFT_KEY), stored, 'the stored draft is untouched');
  noSaves(env, 'while loading');
  // the answer arrives: the stored draft is restored, not the early typing
  await env.releaseLoad();
  assert.equal(env.status(), DRAFT_RESTORED_TEXT);
  assert.equal(env.el('se-hero-title').value, 'Casa Lumi Ulm'); assert.equal(env.el('se-voice-lang').value, 'de');
  // and with no draft stored, early typing does not create one
  const fresh = await openEditor({ holdLoad: true });
  await fresh.change('se-hero-title', 'typed too early');
  assert.equal(fresh.storage.size, 0);
});

test('G. if the browser cannot store the draft, the owner is told so — and still nothing is sent', async () => {
  const env = await openEditor({ storageFails: true });
  await makeChanges(env);
  await env.click(env.draftBtn);
  assert.equal(env.status(), DRAFT_NOT_SAVED_TEXT);
  noSaves(env, 'storage refused');
  assert.equal(env.storage.size, 0);
});

test('G. after publishing, later unfinished changes belong to the newly published version: no question on the next visit', async () => {
  const env = await openEditor();
  await env.change('se-hero-title', 'Casa Lumi Ulm');
  // from the moment it is published, the server has the new title
  const published = serverPage({ sections: { hero: Object.assign({}, JSON.parse(serverPage().sections).hero, { title: 'Casa Lumi Ulm' }) } });
  env.load = published;
  const loadsBefore = env.loads().length;
  await env.click(env.publish2);
  assert.equal(env.saves().length, 1);
  assert.equal(env.loads().length, loadsBefore + 2, 'two reads around the one save: the check before it, and the published version after it');
  assert.equal(env.draft(), null, 'published: no draft left');
  // the owner keeps editing after publishing and leaves
  await env.change('se-hero-badge', 'Trattoria');
  assert.equal(env.draft().hero.badge, 'Trattoria');
  const next = await openEditor({ storage: env.storage, load: published });
  assert.equal(next.confirms.length, 0, 'the draft was made from the published version: no question');
  assert.equal(next.status(), DRAFT_RESTORED_TEXT);
  assert.equal(next.el('se-hero-badge').value, 'Trattoria'); assert.equal(next.el('se-hero-title').value, 'Casa Lumi Ulm');
  assert.equal(env.saves().length + next.saves().length, 1, 'still exactly the one save');
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

// ── L. Reading the page again before publishing ────────────────
const PUBLISH_CONFLICT_START = 'This page was changed somewhere else after you opened it here.';
const NOT_PUBLISHED_TEXT = 'Not published. Your changes are kept on this device as a draft.';
const CHECK_FAILED_TEXT = 'The page could not be checked, so nothing was published. Your changes are kept on this device. Please try again.';
const LOADED = JSON.parse(serverPage().sections);
// the order of everything sent after the page was opened
// a stored draft without the moment it was written
const draftContent = (raw) => { const d = JSON.parse(raw); delete d.savedAt; return d; };
const sentSince = (env, from) => env.requests.slice(from).filter((r) => !/voice\/preview/.test(r.url)).map((r) => r.method + ' ' + r.url.replace('https://api.qraivy.com', '').replace(/\?.*$/, ''));

test('L. an unchanged page: one confirmation, the page is read, then the one save — nothing else changes', async () => {
  const env = await openEditor();
  await env.change('se-hero-title', 'Casa Lumi Ulm');
  const from = env.requests.length;
  await env.click(env.publish2);
  assert.deepEqual(env.confirms, [CONFIRM_TEXT], 'no second question');
  assert.deepEqual(sentSince(env, from), ['GET /api/lp/' + SLUG, 'POST /lp', 'GET /api/lp/' + SLUG], 'read, save, read');
  assert.equal(env.saves().length, 1);
  assert.equal(env.status(), 'Published');
  assert.equal(env.requests.filter((r) => r.method === 'GET' && r.headers.Authorization !== 'Bearer tok-owner').length, 0, 'every read is made as the signed-in owner');
});

test('L. Cancel in the first confirmation: no read and no save', async () => {
  const env = await openEditor({ confirm: false });
  const from = env.requests.length;
  await env.click(env.publish2);
  assert.deepEqual(sentSince(env, from), []);
});

const CHANGED_ELSEWHERE = {
  'hero subtitle': { sections: { hero: Object.assign({}, LOADED.hero, { subtitle: 'Now with a garden' }) } },
  'hero title': { sections: { hero: Object.assign({}, LOADED.hero, { title: 'Casa Lumi Garden' }) } },
  'Voice switched on': { sections: { voice: Object.assign({}, LOADED.voice, { enabled: true }) } },
  'Voice switched off by an older switch': { sections: { settings: Object.assign({}, LOADED.settings, { voiceEnabled: false }) } },
  'greeting': { sections: { voice: Object.assign({}, LOADED.voice, { customGreeting: { en: 'A different greeting saved elsewhere.' } }) } },
  'language': { sections: { language: 'de', voice: Object.assign({}, LOADED.voice, { language: 'de', voiceKey: 'anna_de' }) } },
  'buttons': { sections: { buttons: [{ type: 'facebook', label: 'facebook', url: 'https://facebook.example/x', active: true }] } },
  'colour': { brandColor: '#000000', sections: { theme: Object.assign({}, LOADED.theme, { accentColor: '#000000' }) } },
  'logo': { sections: { logo: { url: 'https://res.cloudinary.example/logos/other.png' } } },
};
test('L. changed elsewhere in a field this editor edits: a second question — Cancel sends no save and keeps the draft', async () => {
  for (const [what, change] of Object.entries(CHANGED_ELSEWHERE)) {
    const env = await openEditor();
    await env.change('se-hero-badge', 'Trattoria');
    const draftBefore = env.storage.get(DRAFT_KEY);
    env.load = serverPage(change);                               // meanwhile, somewhere else
    let n = 0; env.window.confirm = (text) => { env.confirms.push(text); n += 1; return n === 1; };   // OK to publish, Cancel to the second question
    const from = env.requests.length;
    await env.click(env.publish2);
    assert.equal(env.confirms.length, 2, what);
    assert.equal(env.confirms[0], CONFIRM_TEXT); assert.ok(env.confirms[1].indexOf(PUBLISH_CONFLICT_START) === 0, what);
    assert.match(env.confirms[1], /Cancel: do not publish\. Your changes stay on this device as a draft/);
    assert.deepEqual(sentSince(env, from), ['GET /api/lp/' + SLUG], what + ': the read, and nothing after it');
    assert.equal(env.saves().length, 0, what + ': no save');
    assert.equal(env.status(), NOT_PUBLISHED_TEXT, what);
    assert.deepEqual(draftContent(env.storage.get(DRAFT_KEY)), draftContent(draftBefore), what + ': the draft holds exactly what it held, made from the version the owner opened');
    assert.equal(env.draft().hero.badge, 'Trattoria');
    assert.equal(env.el('se-hero-badge').value, 'Trattoria', what + ': the editor still shows the owner\'s work');
    assert.equal(env.publish1.disabled, false); assert.equal(env.publish2.disabled, false);
    // pressing Publish again asks again: the newer version has still not been seen
    n = 0;
    await env.click(env.publish1);
    assert.equal(env.confirms.length, 4, what + ': asked again');
    assert.equal(env.saves().length, 0);
    // on the next visit the draft is not applied over the newer page without asking either
    const next = await openEditor({ storage: env.storage, load: serverPage(change), confirm: false });
    assert.equal(next.confirms.length, 1, what);
  }
});

test('L. changed elsewhere, and the owner decides to publish anyway: one save with the editor\'s values', async () => {
  const env = await openEditor();
  await env.change('se-hero-badge', 'Trattoria');
  env.load = serverPage(CHANGED_ELSEWHERE['hero subtitle']);
  const from = env.requests.length;
  await env.click(env.publish2);                                 // OK, OK
  assert.equal(env.confirms.length, 2);
  assert.deepEqual(sentSince(env, from), ['GET /api/lp/' + SLUG, 'POST /lp', 'GET /api/lp/' + SLUG]);
  const s = savedSections(env.saves()[0]);
  assert.equal(s.hero.badge, 'Trattoria'); assert.equal(s.hero.subtitle, 'Fresh pasta daily', 'the fields of this editor are the editor\'s');
  assert.equal(env.status(), 'Published');
  // the published version is now the editor's own: the next publish asks nothing more
  env.load = serverPage({ sections: { hero: Object.assign({}, LOADED.hero, { badge: 'Trattoria' }) } });
  await env.window.SmartEditor.reload(); await settle();
  await env.click(env.publish2);
  assert.equal(env.confirms.length, 3);
});

test('L. everything this editor does not edit is saved as it is on the server NOW: staff PIN, loop, footer, settings, name, industry, website', async () => {
  const env = await openEditor();
  await env.change('se-hero-title', 'Casa Lumi Ulm');
  await env.click(env.el('se-voice-enabled'));                   // Voice on
  await env.change('se-voice-lang', 'de');
  // while the editor was open: a staff PIN was set, loyalty and other settings changed, the page was renamed
  const now = serverPage({ businessName: 'Casa Lumi Ulm GmbH', useCase: 'fitness', websiteUrl: 'https://casalumi-ulm.example', template: 'premium',
    sections: { staffPin: 'hash-of-the-new-pin', loop: { enabled: false, title: 'Changed elsewhere' }, footer: { businessName: 'Casa Lumi Ulm GmbH', footerText: 'Neue Str. 2' }, info: { address: 'Neue Str. 2', phone: '+49 111' },
      settings: { pageActive: true, voiceEnabled: true, aiEnabled: true, walletEnabled: false }, ai: { enabled: false, title: 'Changed AI title' }, order: ['hero', 'buttons', 'voice'], loyalty: { stampsRequired: 8 } } });
  env.load = now;
  await env.click(env.publish2);
  assert.deepEqual(env.confirms, [CONFIRM_TEXT], 'none of this is edited here, so there is nothing to ask');
  assert.equal(env.saves().length, 1);
  const body = env.saves()[0].body, s = body.sections, fresh = JSON.parse(now.sections);
  for (const key of ['staffPin', 'loop', 'footer', 'info', 'settings', 'ai', 'order', 'loyalty', 'featured', 'businessInfo', 'actionLinks', 'siteContent', 'aiGenerated', 'crawlLocked']) assert.deepEqual(s[key], fresh[key], key + ' is the server\'s current value');
  assert.equal(s.staffPin, 'hash-of-the-new-pin');
  assert.equal(body.businessName, 'Casa Lumi Ulm GmbH'); assert.equal(body.useCase, 'fitness'); assert.equal(body.websiteUrl, 'https://casalumi-ulm.example');
  // and what the owner did here is in the same save
  assert.equal(s.hero.title, 'Casa Lumi Ulm'); assert.equal(s.voice.enabled, true); assert.equal(s.language, 'de'); assert.equal(s.voice.language, 'de');
  assert.deepEqual(s.voice.customGreeting, { en: 'Hello and welcome to Casa Lumi, your table is waiting.' });
  assert.equal(env.requests.filter((r) => /voice\/preview/.test(r.url) && r.body && r.body.generate === true).length, 0, 'no recording is asked for');
});

test('L. a page renamed or moved to another industry elsewhere: the standard greeting follows the server, an own greeting stays the owner\'s', async () => {
  const renamed = serverPage({ businessName: 'Trattoria Lumi', useCase: 'fitness' });
  // German has no own greeting on this page: the editor shows the standard one
  const env = await openEditor();
  await env.change('se-voice-lang', 'de');
  assert.match(env.el('se-voice-greeting').value, /Casa Lumi/);
  env.load = renamed;
  await env.click(env.publish2);
  assert.deepEqual(env.confirms, [CONFIRM_TEXT]);
  let v = savedSections(env.saves()[0]).voice;
  assert.deepEqual(v.customGreeting, { en: 'Hello and welcome to Casa Lumi, your table is waiting.' }, 'the standard greeting was not frozen as an own text with the old name');
  assert.equal(env.saves()[0].body.businessName, 'Trattoria Lumi'); assert.equal(env.saves()[0].body.useCase, 'fitness');
  assert.match(env.el('se-voice-greeting').value, /Trattoria Lumi/, 'and the editor now shows the greeting that will be spoken');
  // an own German greeting written here is saved exactly as written
  const own = await openEditor();
  await own.change('se-voice-lang', 'de');
  await own.change('se-voice-greeting', 'Willkommen bei Casa Lumi. Heute: frische Tagliatelle.');
  own.load = renamed;
  await own.click(own.publish2);
  v = savedSections(own.saves()[0]).voice;
  assert.equal(v.customGreeting.de, 'Willkommen bei Casa Lumi. Heute: frische Tagliatelle.');
  assert.equal(own.el('se-voice-greeting').value, 'Willkommen bei Casa Lumi. Heute: frische Tagliatelle.');
  // no recording is requested by publishing in either case
  for (const e of [env, own]) assert.equal(e.requests.filter((r) => /voice\/preview/.test(r.url) && r.body && r.body.generate === true).length, 0);
});

test('L. the website scan: what it generates is never a conflict and is never sent back stale — but a badge it changed is put to the owner', async () => {
  const scanned = (badge) => ({ sections: { hero: Object.assign({}, LOADED.hero, { aiTitle: 'Casa Lumi — fresh pasta in Ulm', aiSubtitle: 'Scanned again', badge }), featured: [{ enabled: true, icon: 'z', title: 'New from the scan', description: 'x' }],
    businessInfo: { hours: 'Mo-So 10-23', address: 'Hauptstr. 1' }, actionLinks: [{ label: 'Reserve', url: 'https://casalumi.example/reserve' }], siteContent: 'newly scanned text', aiGenerated: true, aiGeneratedAt: '2030-01-01T00:00:00.000Z', crawlLocked: true } });
  // the scan ran and left the badge as it was
  const env = await openEditor();
  await env.change('se-hero-subtitle', 'Neu am Münsterplatz');
  env.load = serverPage(scanned('Restaurant'));
  await env.click(env.publish2);
  assert.deepEqual(env.confirms, [CONFIRM_TEXT], 'no second question');
  let s = savedSections(env.saves()[0]); const fresh = JSON.parse(env.load.sections);
  for (const key of ['featured', 'businessInfo', 'actionLinks', 'siteContent', 'aiGeneratedAt']) assert.deepEqual(s[key], fresh[key], key + ': the scan\'s new value, not the one loaded earlier');
  assert.equal(s.hero.aiTitle, 'Casa Lumi — fresh pasta in Ulm'); assert.equal(s.hero.aiSubtitle, 'Scanned again');
  assert.equal(s.hero.subtitle, 'Neu am Münsterplatz');
  // the scan replaced the badge
  const b = await openEditor();
  await b.change('se-hero-badge', 'Trattoria');
  b.load = serverPage(scanned('Italian Restaurant'));
  let n = 0; b.window.confirm = (text) => { b.confirms.push(text); n += 1; return n === 1; };
  await b.click(b.publish2);
  assert.equal(b.confirms.length, 2);
  assert.match(b.confirms[1], /The badge on the page is now "Italian Restaurant"; publishing sets it to "Trattoria"\./);
  assert.match(b.confirms[1], /It may have been changed by the automatic website scan\./);
  assert.equal(b.saves().length, 0, 'not overwritten without the owner\'s decision');
  // a badge changed elsewhere without a scan is put to the owner as well, without that remark
  const c = await openEditor();
  c.load = serverPage({ sections: { hero: Object.assign({}, LOADED.hero, { badge: 'Bistro' }) } });
  n = 0; c.window.confirm = (text) => { c.confirms.push(text); n += 1; return n === 1; };
  await c.click(c.publish2);
  assert.match(c.confirms[1], /The badge on the page is now "Bistro"; publishing sets it to "Restaurant"\./);
  assert.ok(!/website scan/.test(c.confirms[1]));
  assert.equal(c.saves().length, 0);
});

test('L. visits and the audio the server attaches do not raise a question', async () => {
  const env = await openEditor();
  await env.change('se-hero-title', 'Casa Lumi Ulm');
  env.load = serverPage({ scanCount: 9999, updatedAt: '2030-01-01T00:00:00.000Z', sections: { voice: Object.assign({}, LOADED.voice, { audioUrl: 'https://res.cloudinary.example/audio/new.mp3', audioFor: 'fp-new', audioLang: 'en', previewUrl: 'https://res.cloudinary.example/audio/p9.mp3', previewFor: 'fp-p9', previewLang: 'en', previewCache: { 'fp-p9': 'https://res.cloudinary.example/audio/p9.mp3' } }) } });
  await env.click(env.publish2);
  assert.deepEqual(env.confirms, [CONFIRM_TEXT]);
  assert.equal(env.saves().length, 1);
});

test('L. if the page cannot be read or is not this page, nothing is published; the changes stay; a later try works', async () => {
  for (const [what, load] of FAILED_LOADS) {
    const env = await openEditor();
    await env.change('se-hero-title', 'Casa Lumi Ulm');
    const draftBefore = env.storage.get(DRAFT_KEY);
    const good = env.load; env.load = load;
    const from = env.requests.length;
    await env.click(env.publish2);
    assert.deepEqual(env.confirms, [CONFIRM_TEXT], what);
    assert.deepEqual(sentSince(env, from), ['GET /api/lp/' + SLUG], what + ': the failed read, and no save');
    assert.equal(env.saves().length, 0, what);
    assert.equal(env.status(), CHECK_FAILED_TEXT, what);
    assert.deepEqual(draftContent(env.storage.get(DRAFT_KEY)), draftContent(draftBefore), what + ': the draft holds exactly what it held');
    assert.equal(env.el('se-hero-title').value, 'Casa Lumi Ulm', what);
    assert.equal(env.publish2.disabled, false, what + ': the button can be used again');
    assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 });
    env.load = good;
    await env.click(env.publish2);
    assert.equal(env.saves().length, 1, what + ': works once the page can be read');
    assert.equal(savedSections(env.saves()[0]).hero.title, 'Casa Lumi Ulm');
  }
});

test('L. rapid clicks while the page is being read, and while the question is open: still one read and one save', async () => {
  const env = await openEditor();
  await env.change('se-hero-title', 'Casa Lumi Ulm');
  env.holdLoad = true;
  const from = env.requests.length;
  await env.click(env.publish2);
  assert.equal(env.publish1.disabled, true); assert.equal(env.publish2.disabled, true);
  assert.equal(env.status(), 'Checking...');
  for (let i = 0; i < 4; i++) { await env.click(env.publish1); await env.click(env.publish2); }
  env.window.SmartEditor.publish(); env.window.publishPage(); await settle();
  env.publish2.disabled = false; await env.click(env.publish2); env.publish2.disabled = true;
  assert.deepEqual(sentSince(env, from), ['GET /api/lp/' + SLUG], 'one read so far, no save yet');
  assert.equal(env.confirms.length, 1);
  await env.releaseLoad();
  assert.deepEqual(sentSince(env, from), ['GET /api/lp/' + SLUG, 'POST /lp', 'GET /api/lp/' + SLUG]);
  assert.equal(env.saves().length, 1);
  assert.equal(env.publish2.disabled, false);
});

// ── M. The Save Draft button of the Smart Editor ───────────────
test('M. the Smart Editor shows one "Save Draft" button beside Publish; the page\'s older block and its buttons stay hidden', async () => {
  const env = await openEditor();
  const b = env.el(DRAFT_BUTTON_ID);
  assert.ok(b, 'the button exists');
  assert.equal(b.tagName, 'BUTTON'); assert.equal(b.textContent, 'Save Draft'); assert.equal(b.getAttribute('type'), 'button');
  assert.match(b.getAttribute('title'), /on this device only\. Nothing is published\./);
  // in the Smart Editor's bar, directly after Publish
  assert.equal(b.parentNode, env.publish2.parentNode, 'same bar as Publish');
  assert.equal(env.publish2.nextSibling, b, 'directly beside Publish');
  assert.equal(env.document.querySelectorAll('button').filter((x) => /save-draft-btn/.test(x.id) && x.parentNode === env.publish2.parentNode).length, 1, 'exactly one in the bar');
  assert.equal(env.document.querySelectorAll('button').filter((x) => /save-draft-btn/.test(x.id)).length, 2, 'the page\'s own one (in its hidden block) and this one');
  // it is not hidden and not inside the older block
  for (let n = b; n; n = n.parentNode) { assert.notEqual(n.id, 'sqd-edit-section'); assert.ok(!/display\s*:\s*none/.test((n.style && n.style.cssText) || '') && !(n.style && n.style.display === 'none'), 'no hidden ancestor'); }
  assert.equal(b.disabled, false);
  // the look: the coral outline next to the solid coral Publish, never wrapping its label
  assert.match(b.style.cssText, /color:#ff5a1f/); assert.match(b.style.cssText, /border:1px solid rgba\(255,90,31,0\.3\)/); assert.match(b.style.cssText, /white-space:nowrap/); assert.match(b.style.cssText, /flex:0 0 auto/);
  // room for a sentence in the status line without squeezing Publish
  assert.equal(env.publish2.style.minWidth, '110px'); assert.equal(env.el('sqd-save-global-status').style.whiteSpace, 'normal');
  // nothing of the page's older editor was revealed or added
  assert.equal(env.el('sqd-edit-section').style.display === 'block', false, 'the older block was not opened');
  assert.equal(env.document.querySelectorAll('button').filter((x) => /^sqd-publish-btn/.test(x.id)).length, 2, 'no additional Publish control');
  assert.ok(!SMART_EDITOR.includes("getElementById('sqd-edit-section')") && !SMART_EDITOR.includes("$('sqd-edit-section')"), 'the editor script never touches the older block');
  // starting the editor again does not add a second one
  await env.window.SmartEditor.reload(); await settle();
  await env.window.SmartEditor.reload(); await settle();
  assert.equal(env.document.querySelectorAll('button').filter((x) => x.id === DRAFT_BUTTON_ID).length, 1);
});

test('M. one click on it: one local save, the feedback text, no request of any kind, and no other handler involved', async () => {
  const env = await openEditor();
  const b = env.el(DRAFT_BUTTON_ID);
  assert.equal(b.onclick, null); assert.equal(b.listeners.length, 0, 'the button carries no handler of its own: the one listener in front handles it');
  await makeChanges(env);
  const requestsBefore = env.requests.length; env.storageWrites.length = 0;
  const r = await env.click(b);
  assert.ok(r.stoppedAtDocument);
  assert.deepEqual(env.storageWrites, [DRAFT_KEY], 'exactly one write, to this page\'s draft');
  assert.equal(env.requests.length, requestsBefore, 'zero requests: no save, no read, no audio');
  assert.equal(env.status(), DRAFT_SAVED_TEXT);
  assert.equal(env.status(), 'Draft saved on this device only — not published.');
  assert.deepEqual(env.legacy, { publish: 0, draft: 0, localDraft: 0 }, 'the page\'s older Save Draft code is not reached');
  assert.equal(env.confirms.length, 0);
  const d = env.draft();
  assert.equal(d.voice.enabled, true); assert.equal(d.voice.language, 'de'); assert.equal(d.hero.title, 'Casa Lumi Ulm');
  assert.equal(d.voice.customGreeting.de, 'Willkommen bei Casa Lumi. Heute: frische Tagliatelle.');
  // a click on something inside the button counts as the button
  const inner = new env.dom.El('span'); b.appendChild(inner);
  env.storageWrites.length = 0;
  await env.click(inner);
  assert.deepEqual(env.storageWrites, [DRAFT_KEY]);
  assert.equal(env.requests.length, requestsBefore);
  // the draft survives a reload, and Publish is still one confirmed save
  const next = await openEditor({ storage: env.storage });
  assert.equal(next.status(), DRAFT_RESTORED_TEXT);
  assert.equal(next.el('se-hero-title').value, 'Casa Lumi Ulm'); assert.equal(next.el('se-voice-lang').value, 'de');
  await next.click(next.publish2);
  assert.deepEqual(next.confirms, [CONFIRM_TEXT]); assert.equal(next.saves().length, 1);
  assert.equal(savedSections(next.saves()[0]).hero.title, 'Casa Lumi Ulm');
});

test('M. the button is disabled until this page has loaded, stays disabled after a failed load, and is not offered where there is no page', async () => {
  // while the server has not answered yet
  const loading = await openEditor({ holdLoad: true });
  const b = loading.el(DRAFT_BUTTON_ID);
  assert.ok(b, 'shown as soon as the editor starts');
  assert.equal(b.disabled, true); assert.equal(b.style.opacity, '0.5'); assert.equal(b.style.cursor, 'not-allowed');
  await loading.click(b); b.disabled = false; await loading.click(b); b.disabled = true;      // even if something enabled it
  assert.equal(loading.storage.size, 0); assert.equal(loading.saves().length, 0);
  await loading.releaseLoad();
  assert.equal(b.disabled, false); assert.equal(b.style.opacity, ''); assert.equal(b.style.cursor, 'pointer');
  // after every kind of failed load
  for (const [what, load] of FAILED_LOADS) {
    const env = await openEditor({ load });
    const x = env.el(DRAFT_BUTTON_ID);
    assert.equal(x.disabled, true, what);
    x.disabled = false; await env.click(x);
    assert.equal(env.storage.size, 0, what + ': nothing written'); assert.equal(env.saves().length, 0, what);
    assert.equal(env.status(), LOAD_FAILED_TEXT, what);
  }
  // while a publish is running
  const busy = await openEditor({ holdSave: true });
  await busy.click(busy.publish2);
  assert.equal(busy.el(DRAFT_BUTTON_ID).disabled, true);
  await busy.releaseSave();
  assert.equal(busy.el(DRAFT_BUTTON_ID).disabled, false);
  // before the editor has started, and on a page without a Smart Editor page
  const early = await openEditor({ runInit: false });
  assert.equal(early.el(DRAFT_BUTTON_ID), null);
  const none = await openEditor({ slug: '' });
  assert.equal(none.el(DRAFT_BUTTON_ID), null, 'no button where the Smart Editor has no page');
});

// ── K. Pages without a Smart Editor page ───────────────────────
test('K. where there is no page for the Smart Editor (no slug), the buttons are left entirely to the page, as before', async () => {
  const env = await openEditor({ slug: '' });
  assert.equal(env.loads().length, 0);
  assert.equal(env.publish1.disabled, false); assert.equal(env.publish2.disabled, false);
  const r = await env.click(env.publish1);
  assert.ok(!r.stoppedAtDocument);
  assert.equal(env.legacy.publish, 1, 'the page\'s own handler runs');
  const d = await env.click(env.draftBtn);
  assert.ok(!d.stoppedAtDocument);
  assert.equal(env.legacy.draft, 2, 'the page\'s own Save Draft, untouched');
  assert.equal(env.storage.has(DRAFT_KEY), false);
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
