// ============================================================
// lpVoice.test.js — Smart Landing Page voice welcome, Phase V1.
//
// Regression tests for four confirmed defects on the live page
// (renderPremiumLP, served by handleServeLP):
//   1. the AI chat was locked until the welcome audio had been played
//   2. the editor's Voice settings never reached the live page (it saves
//      voice.enabled / title / description and settings.voiceEnabled; the
//      renderer read voice.active / playerTitle / playerSubtitle)
//   3. the background audio job wrote back a stale copy of the page's
//      sections, overwriting edits saved while it was waiting
//   4. a page without audio showed a Play button that could not play
//
// The page is rendered through the real handleServeLP; the player's
// script is then executed for real against a small stand-in DOM, so
// playback success and every failure path are observed, not assumed.
//
// No test framework dependency, same convention as tests/lpScanAndPush.test.js.
// Prisma and the push services are mocked via require.cache; no DB,
// network, ElevenLabs or Cloudinary call is made.
//
// Run: node tests/lpVoice.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath   = resolve('src', 'utils', 'prismaClient.js');
const apnsServicePath    = resolve('src', 'services', 'apnsService.js');
const emailServicePath   = resolve('src', 'services', 'emailService.js');
const webPushServicePath = resolve('src', 'services', 'webPushService.js');

// ── Mock Prisma ──────────────────────────────────────────────
let landingPages = {};   // slug -> row
let beforeWrite = null;  // hook: runs once between a read and the following write
let writes = [];

const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug } }) { const r = landingPages[slug]; return r ? Object.assign({}, r) : null; },
    async update({ where: { slug }, data }) {
      const row = landingPages[slug]; if (!row) throw new Error('not found');
      if (data.sections !== undefined) row.sections = data.sections;
      row.updatedAt = new Date(row.updatedAt.getTime() + 1);
      return Object.assign({}, row);
    },
    // Real compare-and-swap semantics: matches only the exact updatedAt.
    async updateMany({ where, data }) {
      if (beforeWrite) { const hook = beforeWrite; beforeWrite = null; await hook(); }
      const row = landingPages[where.slug];
      if (!row || (where.updatedAt && row.updatedAt.getTime() !== where.updatedAt.getTime())) { writes.push({ slug: where.slug, applied: false }); return { count: 0 }; }
      row.sections = data.sections;
      row.updatedAt = new Date(row.updatedAt.getTime() + 1);
      writes.push({ slug: where.slug, applied: true });
      return { count: 1 };
    },
  },
  stampSettings: { async findUnique() { return null; } },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };
for (const [p, exports] of [
  [apnsServicePath, { pushUpdateToDevices: async () => ({ success: 0, failed: 0 }) }],
  [emailServicePath, { sendCampaignEmail: async () => ({ success: 0, failed: 0 }), sendWelcomeEmail: async () => ({ success: 0, failed: 0 }) }],
  [webPushServicePath, { sendWebPush: async () => ({ ok: true }) }],
]) require.cache[p] = { id: p, filename: p, loaded: true, exports };

const { handleServeLP } = require('../src/controllers/lpController');
const { patchLandingPageSections, setVoiceAudioUrl } = require('../src/services/lpSectionsPatch');

const AUDIO = 'https://res.cloudinary.com/demo/video/upload/v1/qraivy-voices/voice-test.mp3';
let slugSeq = 0;
function makePage(sections, overrides = {}) {
  slugSeq += 1;
  const slug = 'voice-test-' + slugSeq;   // unique per test: the page cache is keyed by slug
  landingPages[slug] = Object.assign({
    id: 'lp_' + slug, slug, businessName: 'Test Bakery', websiteUrl: 'https://example.com', useCase: 'local_business',
    brandColor: '#000064', logoUrl: null, userId: 'user_test', qrType: 'ai', template: 'premium', status: 'live',
    scanCount: 0, createdAt: new Date(), updatedAt: new Date(1700000000000),
    sections: JSON.stringify(Object.assign({ language: 'en', hero: { aiTitle: 'Hello', aiSubtitle: 'World' }, featured: [], businessInfo: {} }, sections)),
  }, overrides);
  return slug;
}
async function render(slug) {
  const res = { headers: {}, statusCode: 200, body: '', setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; } };
  await handleServeLP({ params: { slug }, query: { preview: '1' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  return res.body;
}
const hasPlayer = (html) => html.includes('onclick="playAudio(this)"');
const playerText = (html) => { const m = html.match(/<div style="font-size:14px;font-weight:600;color:#0a0a0a;margin-bottom:3px;">([^<]*)<\/div>\s*<div id="audio-sub"[^>]*>([^<]*)<\/div>/); return m ? { title: m[1], sub: m[2] } : null; };

// Runs the page's own player script against a stand-in DOM and Audio.
function runPlayer(html, audioBehaviour) {
  const start = html.indexOf('var VOICE_TXT = ');
  const end = html.indexOf('// ── AI Chat ──', start);
  assert.ok(start !== -1 && end > start, 'player script not found');
  const sub = { textContent: 'idle' };
  const toasts = [];
  const bars = [{ style: {} }, { style: {} }];
  const audios = [];
  function FakeAudio(url) { this.url = url; this.paused = false; audios.push(this); }
  FakeAudio.prototype.pause = function () { this.paused = true; };
  FakeAudio.prototype.play = function () { return audioBehaviour(this); };
  const win = {};
  const ctx = { window: win, document: { getElementById: (id) => (id === 'audio-sub' ? sub : null), querySelectorAll: (sel) => (sel === '.wave-bar' ? bars : []) }, Audio: FakeAudio, toast: (m) => toasts.push(m) };
  vm.runInNewContext(html.slice(start, end), ctx);
  return { play: () => win.playAudio({}), sub, toasts, bars, audios, win, txt: ctx.VOICE_TXT };
}
const tick = () => new Promise((r) => setImmediate(r));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. AI chat does not depend on the audio ────────────────────
test('1. chat input is usable on load: not dimmed, not click-blocked, no "play to activate" hint', async () => {
  const html = await render(makePage({ voice: { audioUrl: AUDIO } }));
  const area = html.match(/<div id="chat-input-area"[^>]*>/)[0];
  assert.ok(!/opacity\s*:\s*0?\.\d/.test(area), area);
  assert.ok(!/pointer-events\s*:\s*none/.test(area), area);
  assert.ok(!/title=/.test(area), area);
  assert.ok(html.includes('id="chat-input"') && html.includes('onclick="sendChat()"'));
  for (const gone of ['Tap welcome to activate', 'Play welcome message to activate', 'unlocks AI assistant']) assert.ok(!html.includes(gone), gone);
});

test('1. chat is usable when there is no audio, and when voice is switched off', async () => {
  for (const sections of [{}, { voice: { enabled: false, audioUrl: AUDIO } }, { voice: { audioUrl: AUDIO }, settings: { voiceEnabled: false } }]) {
    const html = await render(makePage(sections));
    assert.ok(!hasPlayer(html), JSON.stringify(sections));
    const area = html.match(/<div id="chat-input-area"[^>]*>/)[0];
    assert.ok(!/opacity|pointer-events/.test(area), area);
    assert.ok(html.includes('id="chat-input"'));
  }
});

test('1. German page: no leftover "activates the assistant" wording', async () => {
  const html = await render(makePage({ language: 'de', voice: { audioUrl: AUDIO } }));
  for (const gone of ['aktiviert KI-Assistent', 'Willkommensnachricht antippen']) assert.ok(!html.includes(gone), gone);
  assert.deepEqual(playerText(html), { title: 'Persönliche Willkommensnachricht', sub: 'Tippen zum Anhören' });
  assert.ok(html.includes('KI-Assistent'));
});

test('1. the player script no longer touches the chat', async () => {
  const html = await render(makePage({ voice: { audioUrl: AUDIO } }));
  const script = html.slice(html.indexOf('var VOICE_TXT = '), html.indexOf('// ── AI Chat ──'));
  assert.ok(!script.includes('chat-input-area') && !script.includes('pointerEvents'));
});

// ── 2. Editor settings reach the live page ─────────────────────
test('2. "Show Voice Section" off (voice.enabled: false) hides the player', async () => {
  assert.ok(hasPlayer(await render(makePage({ voice: { enabled: true, audioUrl: AUDIO } }))));
  assert.ok(!hasPlayer(await render(makePage({ voice: { enabled: false, audioUrl: AUDIO } }))));
});

test('2. Settings "Voice Welcome Message" off (settings.voiceEnabled: false) hides the player', async () => {
  assert.ok(hasPlayer(await render(makePage({ voice: { audioUrl: AUDIO }, settings: { voiceEnabled: true } }))));
  assert.ok(!hasPlayer(await render(makePage({ voice: { audioUrl: AUDIO }, settings: { voiceEnabled: false } }))));
});

test('2. the legacy voice.active flag still works', async () => {
  assert.ok(!hasPlayer(await render(makePage({ voice: { active: false, audioUrl: AUDIO } }))));
});

test('2. the editor\'s Section Title and Description appear on the live page', async () => {
  const html = await render(makePage({ voice: { title: 'A word from Maria', description: 'Thirty seconds about our bakery', audioUrl: AUDIO } }));
  assert.deepEqual(playerText(html), { title: 'A word from Maria', sub: 'Thirty seconds about our bakery' });
});

test('2. the editor\'s untouched placeholder title does not replace the localized default', async () => {
  // Exactly what the editor saves for a page whose owner never opened the Voice tab.
  const untouched = { enabled: true, title: 'Voice Welcome', description: '', buttonLabel: 'Play', audioUrl: AUDIO };
  assert.deepEqual(playerText(await render(makePage({ voice: untouched }))), { title: 'Personal welcome message', sub: 'Tap to listen' });
  assert.deepEqual(playerText(await render(makePage({ language: 'de', voice: untouched }))), { title: 'Persönliche Willkommensnachricht', sub: 'Tippen zum Anhören' });
});

test('2. legacy playerTitle / playerSubtitle still take precedence', async () => {
  const html = await render(makePage({ voice: { playerTitle: 'Legacy title', playerSubtitle: 'Legacy sub', title: 'New', description: 'New sub', audioUrl: AUDIO } }));
  assert.deepEqual(playerText(html), { title: 'Legacy title', sub: 'Legacy sub' });
});

test('2. owner text is escaped, in the markup and in the script', async () => {
  const html = await render(makePage({ voice: { title: '<img src=x onerror=alert(1)>', description: '</script><script>alert(2)</script>', audioUrl: AUDIO } }));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(!html.includes('</script><script>alert(2)'));
  assert.deepEqual(playerText(html), { title: '&lt;img src=x onerror=alert(1)&gt;', sub: '&lt;/script&gt;&lt;script&gt;alert(2)&lt;/script&gt;' });
  // and the script still runs and carries the text intact
  const p = runPlayer(html, () => Promise.resolve());
  assert.equal(p.txt.idle, '</script><script>alert(2)</script>');
});

// ── 4. Unavailable audio ───────────────────────────────────────
test('4. a page with no audio yet shows no player at all (no dead Play button)', async () => {
  for (const voice of [undefined, {}, { enabled: true }, { audioUrl: '' }, { audioUrl: null }]) {
    const html = await render(makePage(voice === undefined ? {} : { voice }));
    assert.ok(!hasPlayer(html), JSON.stringify(voice));
    assert.ok(!html.includes('No audio available yet'));
  }
});

test('4. an audio address that is not an https URL is treated as no audio', async () => {
  for (const audioUrl of ['javascript:alert(1)', 'http://insecure.example.com/a.mp3', "';alert(1);//", 42]) {
    const html = await render(makePage({ voice: { audioUrl } }));
    assert.ok(!hasPlayer(html), String(audioUrl));
    assert.ok(!html.includes('alert(1)'), String(audioUrl));
  }
});

test('4. playback that works: shows "Playing", animates, then "played"', async () => {
  const p = runPlayer(await render(makePage({ voice: { audioUrl: AUDIO } })), () => Promise.resolve());
  p.play(); await tick();
  assert.equal(p.audios[0].url, AUDIO);
  assert.equal(p.sub.textContent, 'Playing…');
  assert.deepEqual(p.toasts, ['▶ Playing welcome message…']);
  assert.ok(/waveBar/.test(p.bars[0].style.animation));
  p.audios[0].onended();
  assert.equal(p.sub.textContent, 'Welcome message played ✓');
  assert.equal(p.bars[0].style.animation, 'none');
  assert.equal(p.win._premiumAudio, null);
});

test('4. a file that cannot be loaded: says so plainly and never shows "Playing"', async () => {
  const p = runPlayer(await render(makePage({ voice: { audioUrl: AUDIO } })), (audio) => { setImmediate(() => audio.onerror()); return Promise.reject(Object.assign(new Error('no supported source'), { name: 'NotSupportedError' })); });
  p.play(); await tick(); await tick();
  assert.equal(p.sub.textContent, 'The welcome message is not available right now.');
  assert.deepEqual(p.toasts, ['The welcome message is not available right now.'], 'reported once, not twice');
  assert.equal(p.win._premiumAudio, null);
  assert.ok(!p.bars.some((b) => /waveBar/.test(b.style.animation || '')));
});

test('4. a file that breaks mid-stream stops the animation and reports it', async () => {
  const p = runPlayer(await render(makePage({ voice: { audioUrl: AUDIO } })), () => Promise.resolve());
  p.play(); await tick();
  p.audios[0].onerror();
  assert.equal(p.sub.textContent, 'The welcome message is not available right now.');
  assert.equal(p.bars[0].style.animation, 'none');
  p.audios[0].onended();
  assert.equal(p.sub.textContent, 'The welcome message is not available right now.', 'a later "ended" does not claim it played');
});

test('4. the browser asking for another tap is not reported as broken audio', async () => {
  const p = runPlayer(await render(makePage({ voice: { audioUrl: AUDIO } })), () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
  p.play(); await tick();
  assert.equal(p.sub.textContent, 'Tap to listen');
  assert.deepEqual(p.toasts, ['Tap again to play']);
});

test('4. German failure and success messages', async () => {
  const html = await render(makePage({ language: 'de', voice: { audioUrl: AUDIO } }));
  const bad = runPlayer(html, () => Promise.reject(new Error('x')));
  bad.play(); await tick();
  assert.equal(bad.sub.textContent, 'Die Willkommensnachricht ist gerade nicht verfügbar.');
  const ok = runPlayer(html, () => Promise.resolve());
  ok.play(); await tick();
  assert.equal(ok.sub.textContent, 'Wird abgespielt …');
});

test('4. tapping Play again restarts cleanly', async () => {
  const p = runPlayer(await render(makePage({ voice: { audioUrl: AUDIO } })), () => Promise.resolve());
  p.play(); await tick(); p.play(); await tick();
  assert.equal(p.audios.length, 2);
  assert.equal(p.audios[0].paused, true);
  assert.equal(p.win._premiumAudio, p.audios[1]);
});

// ── 3. Background generation never overwrites newer edits ──────
test('3. an edit saved while the audio was being generated is kept', async () => {
  const slug = makePage({ hero: { title: 'Old headline' }, voice: { enabled: true, voiceKey: 'sarah' }, buttons: [] });
  writes = [];
  // The owner saves while the job is between its read and its write.
  beforeWrite = async () => {
    const row = landingPages[slug]; const s = JSON.parse(row.sections);
    s.hero.title = 'New headline'; s.buttons = [{ id: 'b1', label: 'Menu', url: 'https://example.com/menu', active: true }]; s.voice.voiceKey = 'anna_de';
    row.sections = JSON.stringify(s); row.updatedAt = new Date(row.updatedAt.getTime() + 5000);
  };
  const result = await setVoiceAudioUrl(slug, AUDIO);
  assert.equal(result.applied, true);
  const saved = JSON.parse(landingPages[slug].sections);
  assert.equal(saved.hero.title, 'New headline', 'the owner\'s edit survived');
  assert.equal(saved.buttons.length, 1);
  assert.equal(saved.voice.voiceKey, 'anna_de', 'the newer voice setting survived');
  assert.equal(saved.voice.audioUrl, AUDIO, 'and the audio address was added');
  assert.deepEqual(writes.map((w) => w.applied), [false, true], 'first attempt was refused, second applied on the fresh state');
});

test('3. only voice.audioUrl changes; every other key is byte-for-byte what was saved', async () => {
  const before = { language: 'de', hero: { aiTitle: 'Hallo', badge: 'Bäckerei' }, voice: { enabled: false, title: 'Gruß', voiceLanguage: 'de' }, ai: { enabled: true }, buttons: [{ id: 'x', url: 'https://a.example' }], settings: { voiceEnabled: false }, siteContent: 'long text', actionLinks: [{ label: 'Menu' }] };
  const slug = makePage(before);
  const stored = JSON.parse(landingPages[slug].sections);
  await setVoiceAudioUrl(slug, AUDIO);
  const after = JSON.parse(landingPages[slug].sections);
  assert.deepEqual(after.voice, Object.assign({}, stored.voice, { audioUrl: AUDIO }));
  delete after.voice; delete stored.voice;
  assert.deepEqual(after, stored);
});

test('3. a page that keeps changing is left as its owner saved it, and the job says it did not save', async () => {
  const slug = makePage({ hero: { title: 'v0' } });
  let n = 0;
  const keepEditing = async () => { n += 1; const row = landingPages[slug]; const s = JSON.parse(row.sections); s.hero.title = 'v' + n; row.sections = JSON.stringify(s); row.updatedAt = new Date(row.updatedAt.getTime() + 1000); beforeWrite = keepEditing; };
  beforeWrite = keepEditing;
  const result = await setVoiceAudioUrl(slug, AUDIO);
  beforeWrite = null;
  assert.deepEqual(result, { applied: false, reason: 'conflict' });
  const saved = JSON.parse(landingPages[slug].sections);
  assert.equal(saved.hero.title, 'v5');
  assert.equal(saved.voice, undefined);
});

test('3. a deleted page, unreadable sections and "nothing to change" write nothing', async () => {
  writes = [];
  assert.deepEqual(await setVoiceAudioUrl('no-such-page', AUDIO), { applied: false, reason: 'not_found' });
  const broken = makePage({}); landingPages[broken].sections = '{not json';
  assert.deepEqual(await setVoiceAudioUrl(broken, AUDIO), { applied: false, reason: 'unreadable_sections' });
  assert.equal(landingPages[broken].sections, '{not json', 'unreadable sections are not replaced');
  const arr = makePage({}); landingPages[arr].sections = '[1,2]';
  assert.deepEqual(await setVoiceAudioUrl(arr, AUDIO), { applied: false, reason: 'unreadable_sections' });
  const fine = makePage({});
  assert.deepEqual(await patchLandingPageSections(fine, () => null), { applied: false, reason: 'no_change' });
  assert.equal(writes.length, 0);
});

test('3. a page with no sections yet gets them created with just the audio address', async () => {
  const slug = makePage({}); landingPages[slug].sections = null;
  assert.equal((await setVoiceAudioUrl(slug, AUDIO)).applied, true);
  assert.deepEqual(JSON.parse(landingPages[slug].sections), { voice: { audioUrl: AUDIO } });
});

test('3. background audio is stored only through the safe patch, and the page cache is refreshed', () => {
  // Since Phase V2 both jobs go through lpVoiceService.ensureVoiceAudio
  // (behaviour covered in tests/lpVoiceGreetings.test.js); what must stay
  // true is that nothing writes a stale whole copy of sections back.
  const controller = fs.readFileSync(resolve('src', 'controllers', 'lpController.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!/merged\.voice = Object\.assign\(\{\}, merged\.voice \|\| \{\}, \{ audioUrl \}\);/.test(controller));
  assert.ok(!/cs\.voice = Object\.assign\(\{\}, cs\.voice \|\| \{\}, \{ audioUrl \}\);/.test(controller));
  assert.ok(!/generateAndUploadVoice|synthesizeAndUploadVoice/.test(controller), 'the controller makes no text-to-speech call of its own');
  assert.equal((controller.match(/ensureVoiceAudio\(slug\)/g) || []).length, 2, 'after AI generation and after every save');
  const service = fs.readFileSync(resolve('src', 'services', 'lpVoiceService.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(service, /saved = await patchLandingPageSections\(slug, \(fresh, freshPage\) => \{/);
  assert.match(service, /pageCache\.delByPrefix\('lp:' \+ slug\);/);
  assert.ok(!/prisma\.landingPage\.(update|upsert|updateMany)\(/.test(service), 'the service never writes sections directly');
});

// ── 6. AI and Voice are independent ────────────────────────────
const chatUsable = (html) => {
  const m = html.match(/<div id="chat-input-area"[^>]*>/);
  return !!m && !/opacity|pointer-events|title=/.test(m[0]) && html.includes('id="chat-input"') && html.includes('onclick="sendChat()"') && html.includes('<!-- AI CHAT -->') && html.includes('id="chat-msgs"');
};

test('6. every Voice state leaves the assistant visible and usable while AI is enabled', async () => {
  const voiceStates = {
    'voice on, playable audio': [{ voice: { enabled: true, audioUrl: AUDIO } }, true],
    'voice on, no audio yet': [{ voice: { enabled: true } }, false],
    'voice on, audio generation failed (nothing saved)': [{ voice: { enabled: true, voiceKey: 'sarah', voiceLanguage: 'en' } }, false],
    'voice on, unusable audio address': [{ voice: { enabled: true, audioUrl: 'not-a-url' } }, false],
    'voice off in the Voice tab': [{ voice: { enabled: false, audioUrl: AUDIO } }, false],
    'voice off in Settings': [{ voice: { enabled: true, audioUrl: AUDIO }, settings: { voiceEnabled: false, aiEnabled: true } }, false],
    'no voice settings at all': [{}, false],
  };
  const aiStates = [{}, { ai: { enabled: true, title: 'AI Assistant' } }, { settings: { aiEnabled: true } }];
  let checked = 0;
  for (const [label, [voiceSections, expectPlayer]] of Object.entries(voiceStates)) {
    for (const ai of aiStates) {
      const sections = Object.assign({}, voiceSections, ai, { settings: Object.assign({}, voiceSections.settings || {}, ai.settings || {}) });
      const html = await render(makePage(sections));
      assert.equal(hasPlayer(html), expectPlayer, label + ' / player');
      assert.ok(chatUsable(html), label + ' / chat with ' + JSON.stringify(ai));
      checked += 1;
    }
  }
  assert.equal(checked, 21);
});

test('6. with the assistant off, the welcome player is still shown and still plays', async () => {
  // voice.active/ai.active are the keys this renderer has always used for
  // "section off"; the player must not need the chat to exist.
  const html = await render(makePage({ voice: { enabled: true, audioUrl: AUDIO }, ai: { active: false } }));
  assert.ok(hasPlayer(html));
  assert.ok(!html.includes('id="chat-input-area"'), 'chat section is not rendered');
  const p = runPlayer(html, () => Promise.resolve());
  p.play(); await tick();
  assert.equal(p.sub.textContent, 'Playing…');
  p.audios[0].onended();
  assert.equal(p.sub.textContent, 'Welcome message played ✓');
});

test('6. the German page behaves the same: no audio, assistant usable', async () => {
  for (const sections of [{ language: 'de' }, { language: 'de', voice: { enabled: false, audioUrl: AUDIO } }]) {
    const html = await render(makePage(sections));
    assert.ok(!hasPlayer(html));
    assert.ok(chatUsable(html));
    assert.ok(html.includes('KI-Assistent') && html.includes('Fragen Sie etwas…'));
  }
});

// ── 7. Audio generation failures ───────────────────────────────
test('7. when generation fails nothing is saved, so the page has no player and the assistant works', async () => {
  // What the publish job leaves behind after generateAndUploadVoice() throws:
  // the voice settings as the owner saved them, and no audioUrl.
  const slug = makePage({ voice: { enabled: true, title: 'Voice Welcome', description: '', buttonLabel: 'Play', voiceKey: 'anna_de', voiceLanguage: 'de' } });
  const before = landingPages[slug].sections;
  const html = await render(slug);
  assert.ok(!hasPlayer(html));
  assert.ok(chatUsable(html));
  // Judged on what is displayed: the player's message texts live in the
  // page script either way and are only ever shown by a player.
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.ok(!/No audio available|not available right now|Voice generating|welcome message|Tap to listen/i.test(visible), 'the visitor is not shown anything about audio');
  assert.equal(landingPages[slug].sections, before, 'rendering never writes');
});

test('7. a generated file that could not be saved leaves the page as it was', async () => {
  const slug = makePage({ hero: { title: 'Kept' }, voice: { enabled: true } });
  const before = landingPages[slug].sections;
  const original = mockPrisma.landingPage.updateMany;
  mockPrisma.landingPage.updateMany = async () => { throw new Error('database unavailable'); };
  let thrown = null;
  try { await setVoiceAudioUrl(slug, AUDIO); } catch (e) { thrown = e; } finally { mockPrisma.landingPage.updateMany = original; }
  assert.ok(thrown && /database unavailable/.test(thrown.message), 'the failure reaches the job, which logs it');
  assert.equal(landingPages[slug].sections, before);
  assert.ok(!hasPlayer(await render(slug)));
});

test('7. both generation jobs catch their own failures and never fail the save that started them', () => {
  const src = fs.readFileSync(resolve('src', 'controllers', 'lpController.js'), 'utf8').replace(/\r\n/g, '\n');
  // The job (lpVoiceService.ensureVoiceAudio, since Phase V2) catches
  // everything itself: its whole run is inside one try whose catch logs.
  const service = fs.readFileSync(resolve('src', 'services', 'lpVoiceService.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(service, /\} catch \(err\) \{\n\s+console\.error\('\[Voice\] Error for', slug \+ ':', err && err\.message\);/);
  assert.match(service, /\/\/ Makes the page's audio match its greeting\. Never throws:/);
  // After a save it runs once the response is on its way, not before it.
  const job = src.indexOf('setImmediate(() => { ensureVoiceAudio(slug); });');
  const reply = src.indexOf("return res.json({ ok: true, url: 'https://www.qraivy.com/lp/' + slug, slug, id: page.id, voice: _voiceInfo });");
  assert.ok(job !== -1 && reply > job);
  // A recording that could not be stored is reported, not treated as success.
  assert.match(service, /else if \(result\.generated\) console\.error\('\[Voice\] Generated but not stored for', slug/);
});

// ── Nothing else on the page changed ───────────────────────────
test('5. the rest of the page is intact: hero, CTA, chat, subscribe, footer; and the player keeps its markup', async () => {
  const html = await render(makePage({ voice: { audioUrl: AUDIO }, buttons: [{ id: 'b1', label: 'Book now', url: 'https://example.com/book', active: true, style: 'primary' }] }));
  for (const part of ['<!-- NAV -->', '<!-- HERO -->', '<!-- AUDIO -->', '<!-- AI CHAT -->', '<!-- SMART PASS -->', '<!-- ACTION CARDS', '<!-- SUBSCRIBE -->', '<!-- FOOTER -->']) assert.ok(html.includes(part), part);
  assert.ok(html.includes('Book now') && html.includes('https://example.com/book'));
  assert.ok(html.includes('Welcome from Test Bakery'));
  assert.ok(html.includes('id="audio-play-btn"') && (html.match(/class="wave-bar"/g) || []).length === 12);
  assert.ok(html.includes("fetch(API + '/lp/chat'"));
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
