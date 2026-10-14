// ============================================================
// lpVoicePreview.test.js — Smart Landing Page voice, Phase V3: the
// editor's real audio preview.
//
// What is real here: the preview endpoint handler, the auth middleware,
// the route table, lpVoiceService, voiceService, the preview limiter,
// lpSectionsPatch, the save handler, the page renderer, and the editor's
// own Voice tab script (run against a stand-in DOM). What is replaced:
// the database (in-memory, with real compare-and-swap semantics) and the
// two outside services at their network edge -- https.request
// (ElevenLabs) and Cloudinary's upload_stream -- so every text-to-speech
// call is counted and none is ever made or paid for.
//
// No test framework dependency, same convention as the other voice tests.
// Run: node tests/lpVoicePreview.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const https = require('https');
const { EventEmitter } = require('events');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');

// ── Stand-in text-to-speech and storage ──────────────────────────
const tts = { calls: [], uploads: [], fail: false, gate: null, version: 0 };
https.request = function fakeRequest(options, cb) {
  const req = new EventEmitter();
  let body = '';
  req.write = (chunk) => { body += chunk; };
  req.end = () => {
    const call = { host: options.hostname, voiceId: options.path.split('/').pop(), body: JSON.parse(body) };
    tts.calls.push(call);
    const failing = tts.fail;
    const respond = () => {
      const res = new EventEmitter();
      res.statusCode = failing ? 500 : 200;
      cb(res);
      res.emit('data', Buffer.from(failing ? '{"detail":"quota exceeded"}' : 'MP3:' + call.body.text));
      res.emit('end');
    };
    if (tts.gate) tts.gate.then(respond); else setImmediate(respond);
  };
  return req;
};
const cloudinary = require('cloudinary').v2;
cloudinary.uploader.upload_stream = function fakeUpload(opts, cb) {
  return { end(buffer) { tts.version += 1; tts.uploads.push({ public_id: opts.public_id, folder: opts.folder, content: buffer.toString() }); setImmediate(() => cb(null, { secure_url: `https://res.cloudinary.com/test/video/upload/v${tts.version}/${opts.folder}/${opts.public_id}.mp3` })); } };
};
cloudinary.uploader.destroy = () => { throw new Error('V3 must never delete an audio file'); };
cloudinary.api.delete_resources = () => { throw new Error('V3 must never delete an audio file'); };
process.env.ELEVENLABS_API_KEY = 'test-key';

// ── In-memory database ───────────────────────────────────────────
let landingPages = {};
let users = {};
let clock = 1700000000000;
const tickClock = () => new Date(clock += 1000);
const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug } }) { const r = landingPages[slug]; return r ? Object.assign({}, r) : null; },
    async findFirst() { return null; },
    async count({ where: { userId } }) { return Object.values(landingPages).filter((p) => p.userId === userId).length; },
    async upsert(args) {
      const slug = args.where.slug;
      const data = landingPages[slug] ? Object.assign({}, landingPages[slug], args.update) : Object.assign({ id: 'lp-' + slug }, args.create);
      landingPages[slug] = Object.assign(data, { slug, updatedAt: tickClock() });
      return Object.assign({}, landingPages[slug]);
    },
    async update({ where: { slug }, data }) {
      landingPages[slug] = Object.assign({}, landingPages[slug], data.scanCount ? {} : data, { updatedAt: tickClock() });
      return Object.assign({}, landingPages[slug]);
    },
    async updateMany({ where, data }) {
      const row = landingPages[where.slug];
      if (!row || (where.updatedAt && row.updatedAt.getTime() !== where.updatedAt.getTime())) return { count: 0 };
      Object.assign(row, data, { updatedAt: tickClock() });
      return { count: 1 };
    },
  },
  user: { async findUnique({ where: { id } }) { return users[id] || null; } },
  business: { async findUnique() { return null; } },
  businessLocation: { async findFirst() { return null; } },
  stampSettings: { async findUnique() { return null; } },
  async $transaction(fn) { return fn(mockPrisma); },
};
const seed = (p, exports) => { require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
seed(resolve('src', 'utils', 'prismaClient.js'), mockPrisma);
seed(resolve('src', 'services', 'emailService.js'), { sendWelcomeEmail: async () => ({}), sendCampaignEmail: async () => ({}) });
seed(resolve('src', 'services', 'customerIdentityService.js'), { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} });
seed(resolve('src', 'services', 'apnsService.js'), { pushUpdateToDevices: async () => ({}) });
seed(resolve('src', 'services', 'webPushService.js'), { sendWebPush: async () => ({}) });
seed(resolve('src', 'controllers', 'qrController.js'), { getUserFromToken: async (h) => (h && h.startsWith('Bearer ') ? h.slice(7) : null) });

const greetings = require('../src/data/voiceGreetings');
const { STANDARD_VOICES, standardVoice } = require('../src/services/voiceService');
const voice = require('../src/services/lpVoiceService');
const limiter = require('../src/services/voicePreviewLimiter');
const { handleVoicePreview } = require('../src/controllers/lpVoiceController');
const { handlePublishLP, handleGetLP, handleServeLP } = require('../src/controllers/lpController');
const { requireAuth } = require('../src/middleware/auth');

const realError = console.error;
const quiet = (on) => { console.error = on ? () => {} : realError; };

// ── Helpers ──────────────────────────────────────────────────────
const OWNER = 'user-owner', OTHER = 'user-other';
function reset() {
  landingPages = {}; users = { [OWNER]: { id: OWNER, plan: 'business', subscriptionStatus: 'active' }, [OTHER]: { id: OTHER, plan: 'business', subscriptionStatus: 'active' } };
  tts.calls = []; tts.uploads = []; tts.fail = false; tts.gate = null;
  limiter.resetPreviewLimits();
  voice.resetRecordings();
}
const settle = async () => { for (let i = 0; i < 14; i++) await new Promise((r) => setImmediate(r)); };
let slugSeq = 0;
const newSlug = () => 'prev-' + (++slugSeq);
function putPage(slug, { useCase = 'restaurant', businessName = 'Casa Lumi', sections = {}, userId = OWNER } = {}) {
  landingPages[slug] = { id: 'lp-' + slug, slug, businessName, useCase, userId, template: 'premium', status: 'live', sections: JSON.stringify(sections), createdAt: new Date(clock), updatedAt: tickClock() };
}
const sectionsOf = (slug) => JSON.parse(landingPages[slug].sections);
const mkRes = () => ({ statusCode: 200, body: undefined, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });
async function preview(slug, body, { user = OWNER } = {}) {
  const res = mkRes();
  await handleVoicePreview({ params: { slug }, body, userId: user, headers: {} }, res);
  return res;
}
async function save(slug, body, { owner = OWNER } = {}) {
  const res = mkRes();
  await handlePublishLP({ body: Object.assign({ slug, businessName: 'Casa Lumi', useCase: 'restaurant', template: 'premium' }, body), headers: { authorization: 'Bearer ' + owner } }, res);
  await settle();
  return res;
}
async function servePage(slug) { const res = mkRes(); await handleServeLP({ params: { slug }, query: { preview: '1' }, headers: {} }, res); return res.body; }
const fp = (lang, text) => voice.voiceFingerprint(standardVoice(lang), text);
const STD_EN = greetings.defaultGreeting('restaurant', 'en', 'Casa Lumi');
const STD_DE = greetings.defaultGreeting('restaurant', 'de', 'Casa Lumi');
function gate() { let open; tts.gate = new Promise((r) => { open = r; }); return () => { open(); tts.gate = null; }; }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── A. Who may use it ──────────────────────────────────────────
test('A. the endpoint is registered behind requireAuth', () => {
  const router = require('../src/routes/lpRoutes');
  const layer = router.stack.find((l) => l.route && l.route.path === '/lp/voice/preview/:slug');
  assert.ok(layer, 'route exists');
  assert.deepEqual(Object.keys(layer.route.methods), ['post']);
  assert.deepEqual(layer.route.stack.map((s) => s.handle), [requireAuth, handleVoicePreview]);
});

test('A. without a valid sign-in token the request never reaches the handler', async () => {
  quiet(true);
  for (const headers of [{}, { authorization: 'Basic abc' }, { authorization: 'Bearer not-a-real-token' }]) {
    const res = mkRes(); let reached = false;
    await requireAuth({ headers }, res, () => { reached = true; });
    assert.equal(res.statusCode, 401, JSON.stringify(headers));
    assert.equal(reached, false);
  }
  quiet(false);
});

test('A. only the page\'s owner gets an answer; nobody else can cause a recording', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const ownerless = newSlug(); putPage(ownerless, { userId: null });
  const body = { language: 'en', text: 'Hello from the owner.', generate: true };
  assert.equal((await preview(slug, body, { user: OTHER })).statusCode, 403);
  assert.equal((await preview(slug, body, { user: null })).statusCode, 401);
  assert.equal((await preview(ownerless, body)).statusCode, 403, 'a page without an owner has nobody who can be authorized');
  assert.equal((await preview('no-such-page', body)).statusCode, 404);
  assert.equal(tts.calls.length, 0);
  assert.equal(sectionsOf(slug).voice, undefined, 'and nothing was stored');
  // another user cannot even learn whether audio exists
  putPage(slug, { sections: { language: 'en', voice: { audioUrl: 'https://res.cloudinary.com/test/a.mp3', audioFor: fp('en', STD_EN) } } });
  const peek = await preview(slug, { language: 'en' }, { user: OTHER });
  assert.equal(peek.statusCode, 403);
  assert.equal(peek.body.audioUrl, undefined);
});

test('A. malformed requests are refused before anything is looked up or recorded', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  for (const body of [{}, { language: 'fr' }, { language: 'en', text: 42 }, { language: 'de', text: 'x'.repeat(5000) }, null]) {
    const res = await preview(slug, body);
    assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal(tts.calls.length, 0);
});

// ── B. Check only ──────────────────────────────────────────────
test('B. check-only never records: it reports existing audio or says there is none', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en' } });
  const none = await preview(slug, { language: 'en', text: 'Not recorded yet.' });
  assert.deepEqual([none.statusCode, none.body.status, none.body.audioUrl], [200, 'none', undefined]);
  assert.equal(none.body.fingerprint, fp('en', 'Not recorded yet.'));
  for (const generate of [undefined, false, 'true', 1]) assert.equal((await preview(slug, { language: 'en', text: 'Still not.', generate })).body.status, 'none', 'only generate === true records');
  assert.equal(tts.calls.length, 0);
  assert.equal(sectionsOf(slug).voice, undefined);
  assert.deepEqual(none.body.limit, { perHour: 10, remaining: 10 });
});

test('B. an empty field means the standard greeting of the selected language', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  for (const [language, text, std] of [['en', '', STD_EN], ['de', '   ', STD_DE], ['de', undefined, STD_DE]]) {
    const res = await preview(slug, { language, text });
    assert.deepEqual([res.body.fingerprint, res.body.isCustom, res.body.lang], [fp(language, std), false, language]);
  }
});

// ── C. Recording a preview ─────────────────────────────────────
test('C. generate records once, in the standard voice of the selected language, into a file named after the greeting', async () => {
  reset();
  for (const [language, text] of [['en', 'Hello, Maria here.'], ['de', 'Hallo, hier ist Maria.']]) {
    const slug = newSlug(); putPage(slug);
    tts.calls = []; tts.uploads = [];
    const res = await preview(slug, { language, text, generate: true });
    assert.deepEqual([res.statusCode, res.body.status, res.body.source, res.body.lang, res.body.isCustom], [200, 'ready', 'generated', language, true]);
    assert.equal(tts.calls.length, 1);
    assert.deepEqual([tts.calls[0].host, tts.calls[0].voiceId, tts.calls[0].body.model_id, tts.calls[0].body.text], ['api.elevenlabs.io', STANDARD_VOICES[language].id, STANDARD_VOICES[language].model, text]);
    assert.deepEqual(tts.uploads, [{ public_id: `voice-${slug}-${fp(language, text)}`, folder: 'qraivy-voices', content: 'MP3:' + text }]);
    assert.ok(res.body.audioUrl.endsWith(`/qraivy-voices/voice-${slug}-${fp(language, text)}.mp3`));
    const stored = sectionsOf(slug).voice;
    assert.deepEqual(stored, { previewCache: { [fp(language, text)]: res.body.audioUrl }, previewUrl: res.body.audioUrl, previewFor: fp(language, text), previewLang: language });
    assert.equal(res.body.limit.remaining, 9);
  }
});

test('C. a preview never changes what visitors hear: published audio, greeting and page stay exactly as they were', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { language: 'en', voice: { language: 'en', customGreeting: { en: 'The published words.' } } } });
  const before = sectionsOf(slug).voice, pageBefore = await servePage(slug);
  assert.ok(pageBefore.includes(JSON.stringify(before.audioUrl)));
  tts.calls = [];
  const res = await preview(slug, { language: 'en', text: 'Words I am only trying out.', generate: true });
  const after = sectionsOf(slug).voice;
  assert.deepEqual([after.audioUrl, after.audioFor, after.audioLang, after.customGreeting], [before.audioUrl, before.audioFor, before.audioLang, { en: 'The published words.' }]);
  assert.notEqual(res.body.audioUrl, before.audioUrl, 'the preview is a different file');
  assert.equal(await servePage(slug), pageBefore, 'the customer page is byte-for-byte the same');
  // the published file was not written again either
  assert.ok(!tts.uploads.slice(1).some((u) => u.public_id.endsWith(before.audioFor)));
});

test('C. the sixteen default greetings are untouched and a custom greeting is never overwritten by previewing', async () => {
  reset();
  const snapshot = JSON.stringify(greetings.VOICE_GREETINGS);
  const slug = newSlug();
  putPage(slug, { sections: { language: 'de', voice: { language: 'de', customGreeting: { en: 'Own EN.', de: 'Eigenes DE.' } } } });
  await preview(slug, { language: 'de', text: '', generate: true });            // preview of the standard greeting
  await preview(slug, { language: 'en', text: 'Something else.', generate: true });
  assert.deepEqual(sectionsOf(slug).voice.customGreeting, { en: 'Own EN.', de: 'Eigenes DE.' });
  assert.equal(JSON.stringify(greetings.VOICE_GREETINGS), snapshot);
  assert.equal(tts.calls[0].body.text, STD_DE);
});

// ── D. Reuse ───────────────────────────────────────────────────
test('D. audio that already exists is reused: no second call for the same greeting, language and voice', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const first = await preview(slug, { language: 'en', text: 'Say it once.', generate: true });
  const again = await preview(slug, { language: 'en', text: '  Say   it once. ', generate: true });
  const check = await preview(slug, { language: 'en', text: 'Say it once.' });
  assert.equal(tts.calls.length, 1);
  assert.deepEqual([again.body.source, again.body.audioUrl, check.body.status, check.body.audioUrl], ['preview', first.body.audioUrl, 'ready', first.body.audioUrl]);
  assert.equal(again.body.limit.remaining, 9, 'reuse does not use up the limit');
  // an earlier wording is remembered too: going back to it costs nothing
  await preview(slug, { language: 'en', text: 'A second wording.', generate: true });
  const back = await preview(slug, { language: 'en', text: 'Say it once.', generate: true });
  assert.deepEqual([tts.calls.length, back.body.source, back.body.audioUrl], [2, 'preview', first.body.audioUrl]);
  tts.calls.pop();
  // same words in the other language are a different recording
  const de = await preview(slug, { language: 'de', text: 'Say it once.', generate: true });
  assert.equal(tts.calls.length, 2);
  assert.notEqual(de.body.audioUrl, first.body.audioUrl);
});

test('D. the published audio is offered as the preview when the greeting is the published one', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { language: 'en', voice: { language: 'en' } } });
  const published = sectionsOf(slug).voice.audioUrl;
  tts.calls = [];
  for (const body of [{ language: 'en', text: STD_EN }, { language: 'en', text: '' }, { language: 'en', text: STD_EN, generate: true }]) {
    const res = await preview(slug, body);
    assert.deepEqual([res.body.status, res.body.source, res.body.audioUrl], ['ready', 'published', published]);
  }
  assert.equal(tts.calls.length, 0);
});

// ── E. Publish adopts a matching preview ───────────────────────
test('E. Publish reuses the preview of the same greeting instead of recording it again', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { language: 'en', voice: { language: 'en' } } });
  const oldAudio = sectionsOf(slug).voice.audioUrl;
  tts.calls = [];
  const p = await preview(slug, { language: 'en', text: 'Fresh bread from seven.', generate: true });
  assert.equal(sectionsOf(slug).voice.audioUrl, oldAudio, 'still the old audio until Publish');
  const res = await save(slug, { sections: { language: 'en', voice: { language: 'en', customGreeting: { en: 'Fresh bread from seven.' } } } });
  assert.equal(res.statusCode, 200);
  const v = sectionsOf(slug).voice;
  assert.equal(tts.calls.length, 1, 'one recording in total: the preview');
  assert.deepEqual([v.audioUrl, v.audioFor, v.audioLang], [p.body.audioUrl, fp('en', 'Fresh bread from seven.'), 'en']);
  assert.ok((await servePage(slug)).includes(JSON.stringify(p.body.audioUrl)), 'and visitors now hear it');
});

test('E. Publish of a greeting other than the preview records that greeting, into its own file', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en' } });
  const p = await preview(slug, { language: 'en', text: 'Only a try-out.', generate: true });
  await save(slug, { sections: { language: 'en', voice: { language: 'en', customGreeting: { en: 'What I really publish.' } } } });
  const v = sectionsOf(slug).voice;
  assert.equal(tts.calls.length, 2);
  assert.equal(v.audioFor, fp('en', 'What I really publish.'));
  assert.notEqual(v.audioUrl, p.body.audioUrl);
  assert.deepEqual([v.previewUrl, v.previewFor], [p.body.audioUrl, fp('en', 'Only a try-out.')], 'the preview is kept as it was');
  assert.deepEqual(tts.uploads.map((u) => u.public_id), [`voice-${slug}-${fp('en', 'Only a try-out.')}`, `voice-${slug}-${fp('en', 'What I really publish.')}`], 'two files; neither replaced the other');
});

test('E. with Voice off, Publish does not adopt a preview either', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en' } });
  await preview(slug, { language: 'en', text: 'Recorded while on.', generate: true });
  await save(slug, { sections: { language: 'en', voice: { language: 'en', enabled: false, customGreeting: { en: 'Recorded while on.' } } } });
  assert.equal(sectionsOf(slug).voice.audioUrl, undefined);
  assert.equal(tts.calls.length, 1);
});

test('E. a save cannot set or erase the preview fields, and unrelated saves keep them', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en' } });
  const p = await preview(slug, { language: 'en', text: 'Kept across saves.', generate: true });
  await save(slug, { sections: { language: 'en', hero: { title: 'New title' }, voice: { language: 'en', previewUrl: 'https://evil.example/x.mp3', previewFor: 'forged', audioUrl: 'https://evil.example/y.mp3', audioFor: fp('en', STD_EN) } } });
  const v = sectionsOf(slug).voice;
  assert.deepEqual([v.previewUrl, v.previewFor, v.previewLang], [p.body.audioUrl, fp('en', 'Kept across saves.'), 'en']);
  assert.notEqual(v.audioUrl, 'https://evil.example/y.mp3');
  await save(slug, { sections: { hero: { title: 'Another' } } });
  assert.equal(sectionsOf(slug).voice.previewUrl, p.body.audioUrl);
});

// ── F. Concurrency and stale results ───────────────────────────
test('F. two preview requests for the same greeting at the same moment make one recording and use one slot', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const open = gate();
  const a = preview(slug, { language: 'en', text: 'Double click.', generate: true });
  const b = preview(slug, { language: 'en', text: 'Double click.', generate: true });
  const c = preview(slug, { language: 'en', text: 'Double click.', generate: true });
  await settle();
  assert.equal(tts.calls.length, 1);
  open();
  const [ra, rb, rc] = await Promise.all([a, b, c]);
  assert.equal(tts.calls.length, 1);
  assert.ok(ra.body.audioUrl && ra.body.audioUrl === rb.body.audioUrl && rb.body.audioUrl === rc.body.audioUrl);
  assert.equal(limiter.remainingForPage(slug), 9);
});

test('F. a preview and a Publish of the same greeting at the same moment share one recording', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en' } });
  const open = gate();
  const p = preview(slug, { language: 'en', text: 'Both at once.', generate: true });
  await settle();
  await save(slug, { sections: { language: 'en', voice: { language: 'en', customGreeting: { en: 'Both at once.' } } } });
  assert.equal(tts.calls.length, 1);
  open();
  const res = await p; await settle();
  assert.equal(tts.calls.length, 1);
  assert.equal(sectionsOf(slug).voice.audioUrl, res.body.audioUrl);
});

test('F. a recording that finishes after a newer preview was requested does not become the page\'s preview', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const open = gate();                                   // the first request's recording is slow
  const slow = preview(slug, { language: 'en', text: 'First thought.', generate: true });
  await settle();
  tts.gate = null;                                       // the second one is fast
  const fast = await preview(slug, { language: 'en', text: 'Second thought.', generate: true });
  assert.equal(sectionsOf(slug).voice.previewFor, fp('en', 'Second thought.'));
  open();
  const late = await slow; await settle();
  assert.equal(late.body.status, 'ready', 'whoever asked for it still gets it');
  const v = sectionsOf(slug).voice;
  assert.deepEqual([v.previewFor, v.previewUrl], [fp('en', 'Second thought.'), fast.body.audioUrl], 'but the newest request decides the page\'s preview');
  assert.equal(v.previewCache[fp('en', 'First thought.')], late.body.audioUrl, 'the late recording is kept for reuse, since it was paid for');
});

test('F. a preview recorded while the owner publishes something else is not published', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { language: 'en', voice: { language: 'en' } } });
  tts.calls = [];
  const open = gate();
  const p = preview(slug, { language: 'en', text: 'Try-out A.', generate: true });
  await settle();
  tts.gate = null;
  await save(slug, { sections: { language: 'en', voice: { language: 'en', customGreeting: { en: 'Published B.' } } } });
  open(); await p; await settle();
  const v = sectionsOf(slug).voice;
  assert.equal(v.audioFor, fp('en', 'Published B.'));
  assert.ok(v.audioUrl.endsWith(fp('en', 'Published B.') + '.mp3'));
  assert.deepEqual(v.customGreeting, { en: 'Published B.' }, 'the preview write did not undo the save');
});

// ── G. Limits ──────────────────────────────────────────────────
test('G. ten recordings per page per hour; the eleventh is refused without a call', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  for (let i = 1; i <= 10; i++) assert.equal((await preview(slug, { language: 'en', text: 'Version ' + i + '.', generate: true })).statusCode, 200, 'recording ' + i);
  const over = await preview(slug, { language: 'en', text: 'Version 11.', generate: true });
  assert.deepEqual([over.statusCode, over.body.code, tts.calls.length], [429, 'limit_page', 10]);
  assert.ok(Number(over.headers['Retry-After']) > 0 && over.body.retryAfter > 0);
  // what exists can still be fetched and checked
  assert.equal((await preview(slug, { language: 'en', text: 'Version 3.', generate: true })).body.source, 'preview');
  assert.equal((await preview(slug, { language: 'en', text: 'Version 11.' })).body.limit.remaining, 0);
  // another page of the same owner has its own page allowance
  const other = newSlug(); putPage(other);
  assert.equal((await preview(other, { language: 'en', text: 'Elsewhere.', generate: true })).statusCode, 200);
});

test('D. a page remembers its ten most recent previews, no more', async () => {
  reset();
  const pages = [newSlug(), newSlug()]; pages.forEach((s) => putPage(s));
  // twelve recordings of one page need two owners' worth of hours; move the clock instead
  const realNow = Date.now; let now = realNow();
  Date.now = () => now;
  try {
    for (let i = 1; i <= 12; i++) { if (i === 11) now += 61 * 60 * 1000; assert.equal((await preview(pages[0], { language: 'en', text: 'Wording ' + i + '.', generate: true })).statusCode, 200); }
  } finally { Date.now = realNow; }
  const cache = sectionsOf(pages[0]).voice.previewCache;
  assert.deepEqual(Object.keys(cache), Array.from({ length: 10 }, (_, i) => fp('en', 'Wording ' + (i + 3) + '.')));
  assert.equal(tts.uploads.length, 12, 'the two that dropped out of the list were not deleted from storage');
});

test('G. requests fired together cannot get past the limit', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const open = gate();
  const all = Array.from({ length: 25 }, (_, i) => preview(slug, { language: 'en', text: 'Burst ' + i + '.', generate: true }));
  await settle();
  assert.equal(tts.calls.length, 10, 'exactly ten calls were started');
  open();
  const codes = (await Promise.all(all)).map((r) => r.statusCode);
  assert.deepEqual([codes.filter((c) => c === 200).length, codes.filter((c) => c === 429).length], [10, 15]);
  assert.equal(tts.calls.length, 10);
});

test('G. the per-owner guard: twenty recordings an hour across all of an owner\'s pages', async () => {
  reset();
  const pages = Array.from({ length: 4 }, () => { const s = newSlug(); putPage(s); return s; });
  let ok = 0;
  for (let i = 0; i < 20; i++) ok += (await preview(pages[i % 4], { language: 'en', text: 'Owner run ' + i + '.', generate: true })).statusCode === 200 ? 1 : 0;
  assert.equal(ok, 20);
  const over = await preview(pages[3], { language: 'en', text: 'One too many.', generate: true });
  assert.deepEqual([over.statusCode, over.body.code, tts.calls.length], [429, 'limit_owner', 20]);
  // a different owner is not affected
  const theirs = newSlug(); putPage(theirs, { userId: OTHER });
  assert.equal((await preview(theirs, { language: 'en', text: 'Mine.', generate: true }, { user: OTHER })).statusCode, 200);
});

test('G. the limiter itself: windows slide, and the daily owner cap holds', () => {
  limiter.resetPreviewLimits();
  const t0 = 1_800_000_000_000, MIN = 60 * 1000;
  for (let i = 0; i < 10; i++) assert.equal(limiter.takeSlot('p', 'u', t0 + i * MIN).ok, true);
  const no = limiter.takeSlot('p', 'u', t0 + 10 * MIN);
  assert.deepEqual([no.ok, no.scope, no.retryAfter], [false, 'page', 50 * 60]);
  assert.equal(limiter.takeSlot('p', 'u', t0 + 60 * MIN).ok, true, 'the first one has left the hour');
  assert.equal(limiter.remainingForPage('p', t0 + 60 * MIN), 0);
  limiter.resetPreviewLimits();
  let taken = 0;                       // 10 an hour over many pages stays under the hourly cap
  for (let h = 0; h < 4; h++) for (let i = 0; i < 10; i++) taken += limiter.takeSlot('page-' + h + '-' + i, 'u', t0 + h * 61 * MIN + i).ok ? 1 : 0;
  assert.equal(taken, 40);
  const day = limiter.takeSlot('fresh-page', 'u', t0 + 4 * 61 * MIN);
  assert.deepEqual([day.ok, day.scope], [false, 'owner']);
  assert.deepEqual(limiter.PREVIEW_LIMITS, { perPagePerHour: 10, perOwnerPerHour: 20, perOwnerPerDay: 40, anonymousPerDay: 20, globalPerDay: 150 });
  limiter.resetPreviewLimits();
});

test('G. the limiter says plainly that it is temporary and not production-grade', () => {
  const src = fs.readFileSync(resolve('src', 'services', 'voicePreviewLimiter.js'), 'utf8');
  assert.match(src, /TEMPORARY, IN-MEMORY, NOT PRODUCTION-GRADE/);
  assert.match(src, /lost on every restart/);
});

// ── H. Voice off, and failures ─────────────────────────────────
test('H. Voice off: nothing new is recorded, existing audio can still be fetched for playback', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en' } });
  const made = await preview(slug, { language: 'en', text: 'Made while on.', generate: true });
  landingPages[slug].sections = JSON.stringify(Object.assign(sectionsOf(slug), { voice: Object.assign(sectionsOf(slug).voice, { enabled: false }) }));
  tts.calls = [];
  const refused = await preview(slug, { language: 'en', text: 'New while off.', generate: true });
  assert.deepEqual([refused.statusCode, refused.body.code], [409, 'voice_off']);
  const existing = await preview(slug, { language: 'en', text: 'Made while on.', generate: true });
  assert.deepEqual([existing.statusCode, existing.body.status, existing.body.audioUrl, existing.body.voiceEnabled], [200, 'ready', made.body.audioUrl, false]);
  assert.equal(tts.calls.length, 0);
  assert.equal(limiter.remainingForPage(slug), 9, 'a refusal uses no slot');
  // the two older switches count as off too
  for (const off of [{ voice: { active: false } }, { settings: { voiceEnabled: false } }]) {
    const s = newSlug(); putPage(s, { sections: Object.assign({ language: 'en' }, off) });
    assert.equal((await preview(s, { language: 'en', text: 'x', generate: true })).statusCode, 409);
  }
});

test('H. the switch as the owner sees it in the editor wins over what is saved, in both directions', async () => {
  reset();
  const on = newSlug(); putPage(on, { sections: { language: 'en' } });
  assert.equal((await preview(on, { language: 'en', text: 'Just switched off.', generate: true, enabled: false })).statusCode, 409);
  const off = newSlug(); putPage(off, { sections: { language: 'en', voice: { enabled: false } } });
  const res = await preview(off, { language: 'en', text: 'Just switched on.', generate: true, enabled: true });
  assert.deepEqual([res.statusCode, res.body.status], [200, 'ready']);
  assert.equal(sectionsOf(off).voice.enabled, false, 'previewing does not save the switch');
  assert.equal(tts.calls.length, 1);
});

test('H. a failed recording is reported as an error, stores nothing, and a retry works', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en' } });
  quiet(true);
  tts.fail = true;
  const bad = await preview(slug, { language: 'en', text: 'Provider is down.', generate: true });
  quiet(false);
  assert.deepEqual([bad.statusCode, bad.body.code, bad.body.audioUrl], [502, 'generation_failed', undefined]);
  assert.ok(!/quota|ElevenLabs/i.test(JSON.stringify(bad.body)), 'no provider detail is passed on');
  assert.equal(sectionsOf(slug).voice, undefined);
  assert.equal(tts.uploads.length, 0);
  assert.equal(limiter.remainingForPage(slug), 9, 'a failed attempt still counts, so failures cannot be used to get extra calls');
  tts.fail = false;
  const good = await preview(slug, { language: 'en', text: 'Provider is down.', generate: true });
  assert.deepEqual([good.statusCode, good.body.status, good.body.source], [200, 'ready', 'generated']);
});

test('H. a missing ElevenLabs key is an error, not a silent success', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  delete process.env.ELEVENLABS_API_KEY;
  quiet(true);
  const res = await preview(slug, { language: 'en', text: 'No key.', generate: true });
  quiet(false);
  process.env.ELEVENLABS_API_KEY = 'test-key';
  assert.deepEqual([res.statusCode, res.body.code, tts.calls.length], [502, 'generation_failed', 0]);
});

// ── I. The assistant ───────────────────────────────────────────
test('I. previewing has no effect on the AI assistant or anything else on the customer page', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { language: 'en', voice: { language: 'en' } } });
  const before = await servePage(slug);
  await preview(slug, { language: 'en', text: 'A preview.', generate: true });
  await preview(slug, { language: 'de', text: 'Eine Vorschau.', generate: true });
  const after = await servePage(slug);
  assert.equal(after, before);
  assert.ok(after.includes('id="chat-input"') && after.includes('onclick="sendChat()"'));
  const controller = fs.readFileSync(resolve('src', 'controllers', 'lpVoiceController.js'), 'utf8');
  assert.ok(!/aiEnabled|chat/i.test(controller), 'the preview endpoint does not look at the assistant at all');
});

// ── J. The Voice tab in the editor ─────────────────────────────
const smartEditor = fs.readFileSync(path.join(PUB, 'smart-editor.js'), 'utf8').replace(/\r\n/g, '\n');

function editorHarness({ voiceState = {}, uiLang = 'en', token = 'tok-owner' } = {}) {
  const els = {};
  const mk = (id) => (els[id] = { id, value: '', textContent: '', disabled: false, style: {}, attrs: {}, listeners: {}, addEventListener(ev, fn) { this.listeners[ev] = fn; }, setAttribute(k, v) { this.attrs[k] = v; } });
  for (const id of ['se-voice-greeting', 'se-voice-greeting-count', 'se-voice-greeting-status', 'se-voice-greeting-reset', 'se-voice-audio-status', 'sqd-iframe', 'se-voice-enabled', 'se-voice-enabled-hint', 'se-voice-preview-play', 'se-voice-preview-generate', 'se-voice-preview-status']) mk(id);
  const fetches = [], audios = [], timers = [];
  const state = { slug: 'casa-lumi-ab1', voice: Object.assign({ enabled: true, language: 'en', voiceKey: 'sarah', customText: '', customGreeting: {} }, voiceState), _db: { useCase: 'restaurant', businessName: 'Casa Lumi' } };
  function FakeAudio(url) { this.src = url; this.paused = true; this.currentTime = 5; this.listeners = {}; audios.push(this); }
  FakeAudio.prototype.addEventListener = function (ev, fn) { this.listeners[ev] = fn; };
  FakeAudio.prototype.play = function () { this.paused = false; return Promise.resolve(); };
  FakeAudio.prototype.pause = function () { this.paused = true; };
  const win = { SmartEditor: { state }, _qraivyLang: uiLang, Audio: FakeAudio, Clerk: token ? { session: { getToken: () => Promise.resolve(token) } } : undefined, location: { hostname: 'www.qraivy.com', href: 'https://www.qraivy.com/smart-qr-detail.html' } };
  const ctx = {
    window: win, document: { getElementById: (id) => els[id] || null },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    Date, JSON, encodeURIComponent, Promise,
    fetch: (url, opts) => {
      let done; const p = new Promise((res, rej) => { done = { res, rej }; });
      const f = { url, method: opts && opts.method, headers: (opts && opts.headers) || {}, body: opts && opts.body ? JSON.parse(opts.body) : null,
        respond: (status, json) => done.res({ ok: status < 400, status, json: async () => json }), fail: () => done.rej(new Error('offline')) };
      fetches.push(f); return p;
    },
  };
  // the page loads its API routing first (production here: nothing is rerouted)
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'staging-config.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'lp-routing.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'voice-greetings.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'voice-greeting-editor.js'), 'utf8'), ctx);
  const api = win.QRAIVY_VOICE_GREETING;
  api.adopt(voiceState); api.bind(() => {}); api.paintToggle(); api.sync();
  const field = els['se-voice-greeting'];
  const h = {
    api, state, els, fetches, audios, field,
    play: els['se-voice-preview-play'], gen: els['se-voice-preview-generate'], status: els['se-voice-preview-status'],
    previews: () => fetches.filter((f) => f.url.includes('/lp/voice/preview/')),
    type(text) { field.value = text; field.listeners.input(); },
    setLanguage(l) { api.collect(); state.voice.language = l; api.sync(); },
    setVoice(on) { state.voice.enabled = on; api.paintToggle(); },
    clickGenerate() { els['se-voice-preview-generate'].listeners.click(); },
    clickPlay() { els['se-voice-preview-play'].listeners.click(); },
    // answers the first check request made when the tab opens
    async opened(status = 'none', audioUrl) { await settle(); const f = h.previews()[0]; f.respond(200, { ok: true, status, audioUrl }); await settle(); return f; },
  };
  return h;
}

test('J. the Voice tab has Play/Pause, a Generate button and a status line, in the editor\'s own style, below the greeting', () => {
  const panel = smartEditor.slice(smartEditor.indexOf('data-se-panel="voice"'), smartEditor.indexOf('data-se-panel="buttons"'));
  const play = panel.match(/<button id="se-voice-preview-play"[^>]*>/)[0], gen = panel.match(/<button id="se-voice-preview-generate"[^>]*>/)[0];
  assert.match(play, /type="button" disabled aria-pressed="false"/);
  assert.match(play, /border:1px solid rgba\(255,90,31,0\.4\);background:rgba\(255,90,31,0\.12\);color:#ff5a1f;/, 'same orange pill as the Voice switch');
  assert.match(gen, /type="button"/);
  assert.ok(panel.includes('<div id="se-voice-preview-status" role="status" aria-live="polite"'));
  const order = ['id="se-voice-enabled"', 'id="se-voice-lang"', 'id="se-voice-greeting"', 'id="se-voice-greeting-reset"', 'id="se-voice-preview-play"', 'id="se-voice-preview-generate"', 'id="se-voice-preview-status"', 'id="se-voice-audio-status"'].map((x) => panel.indexOf(x));
  assert.ok(order.every((n, i) => n !== -1 && (i === 0 || n > order[i - 1])), 'everything that was there before is still there, in the same order');
  assert.ok(!/<audio|autoplay/i.test(panel), 'nothing plays by itself');
});

test('J. opening the tab looks once for existing audio, with the owner\'s token, and records nothing', async () => {
  const h = editorHarness();
  await settle();
  assert.equal(h.previews().length, 1);
  const f = h.previews()[0];
  assert.deepEqual([f.url, f.method, f.headers.Authorization], ['https://api.qraivy.com/lp/voice/preview/casa-lumi-ab1', 'POST', 'Bearer tok-owner']);
  assert.deepEqual(f.body, { language: 'en', text: STD_EN, generate: false, enabled: true });
  assert.equal(h.status.textContent, 'Checking audio…');
  assert.equal(h.play.disabled, true);
  f.respond(200, { ok: true, status: 'ready', audioUrl: 'https://res.cloudinary.com/test/pub.mp3', source: 'published' });
  await settle();
  assert.deepEqual([h.status.textContent, h.play.disabled, h.gen.style.display, h.play.textContent], ['Preview audio matches this greeting.', false, 'none', '▶ Play']);
  h.api.sync(); h.api.sync(); await settle();
  assert.equal(h.previews().length, 1, 're-rendering the tab does not ask again');
});

test('J. typing never contacts the server; the previous audio is marked outdated and cannot be played', async () => {
  const h = editorHarness();
  await h.opened('ready', 'https://res.cloudinary.com/test/pub.mp3');
  h.clickPlay();
  assert.equal(h.audios[0].paused, false);
  for (const text of ['H', 'Hi', 'Hi!', 'Hi! Maria', 'Hi! Maria here.']) h.type(text);
  await settle();
  assert.equal(h.previews().length, 1, 'no request for any keystroke');
  assert.equal(h.status.textContent, 'The greeting has changed — the previous audio is outdated.');
  assert.equal(h.status.style.color, '#f59e0b');
  assert.deepEqual([h.play.disabled, h.gen.style.display, h.gen.textContent, h.gen.disabled], [true, 'inline-block', 'Update preview', false]);
  assert.equal(h.audios[0].paused, true, 'playback of the outdated audio stops');
  h.clickPlay();
  assert.equal(h.audios[0].paused, true, 'and cannot be started again');
  // typing the old text back restores it without a request
  h.type(STD_EN); await settle();
  assert.deepEqual([h.status.textContent, h.play.disabled, h.previews().length], ['Preview audio matches this greeting.', false, 1]);
});

test('J. a page with no audio yet offers "Generate preview"', async () => {
  const h = editorHarness();
  await h.opened('none');
  assert.deepEqual([h.status.textContent, h.gen.textContent, h.gen.disabled, h.play.disabled], ['No audio for this greeting yet.', 'Generate preview', false, true]);
});

test('J. Generate: loading state, one request, then success with Play enabled', async () => {
  const h = editorHarness();
  await h.opened('none');
  h.type('Hi! Maria here.');
  h.clickGenerate();
  assert.deepEqual([h.status.textContent, h.gen.disabled, h.play.disabled], ['Generating audio…', true, true]);
  h.clickGenerate(); h.clickGenerate();
  await settle();
  assert.equal(h.previews().length, 2, 'further clicks while loading do nothing');
  assert.deepEqual(h.previews()[1].body, { language: 'en', text: 'Hi! Maria here.', generate: true, enabled: true });
  h.previews()[1].respond(200, { ok: true, status: 'ready', audioUrl: 'https://res.cloudinary.com/test/new.mp3', source: 'generated' });
  await settle();
  assert.deepEqual([h.status.textContent, h.status.style.color, h.play.disabled, h.gen.style.display], ['Preview ready ✓', '#22d47e', false, 'none']);
});

test('J. Play and Pause control the audio of the greeting shown', async () => {
  const h = editorHarness();
  await h.opened('ready', 'https://res.cloudinary.com/test/pub.mp3');
  h.clickPlay();
  const a = h.audios[0];
  assert.deepEqual([a.src, a.paused, a.currentTime, h.play.textContent, h.play.attrs['aria-pressed']], ['https://res.cloudinary.com/test/pub.mp3', false, 0, '❚❚ Pause', 'true']);
  h.clickPlay();
  assert.deepEqual([a.paused, h.play.textContent, h.play.attrs['aria-pressed']], [true, '▶ Play', 'false']);
  h.clickPlay();
  assert.equal(h.audios.length, 1, 'the same audio is reused');
  a.listeners.ended();
  assert.equal(h.play.textContent, '▶ Play');
  // a file that cannot be played is an error, not a silent nothing
  h.clickPlay(); a.listeners.error();
  assert.deepEqual([h.status.textContent, h.status.style.color, h.gen.textContent], ['The audio could not be played.', '#f87171', 'Try again']);
});

test('J. a result that arrives after the owner has edited again is not presented as the current audio', async () => {
  const h = editorHarness();
  await h.opened('none');
  h.type('Version A.');
  h.clickGenerate(); await settle();
  h.type('Version B.');
  h.previews()[1].respond(200, { ok: true, status: 'ready', audioUrl: 'https://res.cloudinary.com/test/a.mp3', source: 'generated' });
  await settle();
  assert.equal(h.play.disabled, true, 'audio of A is not offered for text B');
  assert.notEqual(h.status.textContent, 'Preview ready ✓');
  assert.equal(h.gen.disabled, false);
  h.type('Version A.'); await settle();
  assert.deepEqual([h.play.disabled, h.previews().length], [false, 2], 'going back to A finds its audio without another request');
  h.clickPlay();
  assert.equal(h.audios[0].src, 'https://res.cloudinary.com/test/a.mp3');
});

test('J. errors are shown and can be retried: failure, limit reached, signed out, offline', async () => {
  for (const [answer, message] of [
    [(f) => f.respond(502, { error: 'x', code: 'generation_failed' }), 'The audio could not be generated. Please try again.'],
    [(f) => f.respond(429, { error: 'x', code: 'limit_page', retryAfter: 600 }), 'Preview limit reached for now. Please try again later.'],
    [(f) => f.respond(401, { error: 'Unauthorized.' }), 'Please sign in again to preview the audio.'],
    [(f) => f.fail(), 'The audio could not be generated. Please try again.'],
  ]) {
    const h = editorHarness();
    await h.opened('none');
    h.clickGenerate(); await settle();
    answer(h.previews()[1]); await settle();
    assert.deepEqual([h.status.textContent, h.status.style.color, h.gen.textContent, h.gen.disabled, h.play.disabled], [message, '#f87171', 'Try again', false, true]);
    h.clickGenerate(); await settle();
    h.previews()[2].respond(200, { ok: true, status: 'ready', audioUrl: 'https://res.cloudinary.com/test/ok.mp3', source: 'generated' });
    await settle();
    assert.equal(h.play.disabled, false, 'retry works');
  }
  const signedOut = editorHarness({ token: null });
  await settle();
  assert.equal(signedOut.previews().length, 0, 'without a session nothing is sent');
  signedOut.clickGenerate(); await settle();
  assert.equal(signedOut.status.textContent, 'Please sign in again to preview the audio.');
});

test('J. Voice off: Generate is disabled and says why; existing audio can still be played', async () => {
  const h = editorHarness({ voiceState: { enabled: false } });
  await h.opened('ready', 'https://res.cloudinary.com/test/pub.mp3');
  assert.equal(h.previews()[0].body.enabled, false);
  assert.equal(h.play.disabled, false);
  h.clickPlay();
  assert.equal(h.audios[0].paused, false, 'existing audio plays while Voice is off');
  h.type('Something new.');
  assert.deepEqual([h.gen.disabled, h.play.disabled], [true, true]);
  assert.equal(h.status.textContent, 'The greeting has changed — the previous audio is outdated. Voice Welcome is off — no new audio is generated.');
  h.clickGenerate(); await settle();
  assert.equal(h.previews().length, 1, 'a click on the disabled button sends nothing');
  h.setVoice(true);
  assert.equal(h.gen.disabled, false, 'switching Voice on enables it at once');
  h.setVoice(false);
  assert.equal(h.gen.disabled, true);
});

test('J. each language has its own audio: switching language checks that language and uses its own state', async () => {
  const h = editorHarness();
  await h.opened('ready', 'https://res.cloudinary.com/test/en.mp3');
  h.setLanguage('de'); await settle();
  assert.equal(h.previews().length, 2);
  assert.deepEqual(h.previews()[1].body, { language: 'de', text: STD_DE, generate: false, enabled: true });
  h.previews()[1].respond(200, { ok: true, status: 'none' }); await settle();
  assert.deepEqual([h.play.disabled, h.gen.textContent], [true, 'Update preview']);
  h.setLanguage('en'); await settle();
  assert.deepEqual([h.play.disabled, h.previews().length], [false, 2], 'English is still known');
  h.clickPlay();
  assert.equal(h.audios[0].src, 'https://res.cloudinary.com/test/en.mp3');
});

test('J. German editor: German labels', async () => {
  const h = editorHarness({ uiLang: 'de', voiceState: { language: 'de' } });
  await h.opened('none');
  assert.deepEqual([h.status.textContent, h.gen.textContent, h.play.textContent], ['Für diese Begrüßung gibt es noch keine Audiodatei.', 'Vorschau erzeugen', '▶ Abspielen']);
});

test('J. after Publish the tab looks again, because what is published may now match', async () => {
  const h = editorHarness();
  await h.opened('none');
  h.type('Published now.');
  assert.equal(h.play.disabled, true);
  h.api.afterSave({ ok: true, voice: { enabled: true, pending: false, audioFor: 'x' } }, { skipReload: true });
  await settle();
  const again = h.previews()[1];
  assert.deepEqual(again.body, { language: 'en', text: 'Published now.', generate: false, enabled: true });
  again.respond(200, { ok: true, status: 'ready', audioUrl: 'https://res.cloudinary.com/test/published.mp3', source: 'published' });
  await settle();
  assert.equal(h.play.disabled, false);
});

test('J. the editor\'s request is accepted by the real endpoint as sent', async () => {
  reset();
  putPage('casa-lumi-ab1', { sections: { language: 'en' } });
  const h = editorHarness();
  await h.opened('none');
  h.type('Round trip.');
  h.clickGenerate(); await settle();
  const sent = h.previews()[1];
  const res = await preview('casa-lumi-ab1', sent.body);
  assert.deepEqual([res.statusCode, res.body.status, tts.calls[0].body.text], [200, 'ready', 'Round trip.']);
  sent.respond(res.statusCode, res.body); await settle();
  h.clickPlay();
  assert.equal(h.audios[0].src, res.body.audioUrl);
});

// ── K. Nothing is deleted; the rest of the editor is untouched ─
test('K. V3 deletes no audio file anywhere', () => {
  for (const f of [['src', 'services', 'voiceService.js'], ['src', 'services', 'lpVoiceService.js'], ['src', 'controllers', 'lpVoiceController.js'], ['src', 'services', 'voicePreviewLimiter.js']]) {
    const src = fs.readFileSync(resolve(...f), 'utf8');
    assert.ok(!/\.destroy\(|delete_resources|invalidate/.test(src), f.join('/'));
  }
});

test('K. the QRAIVY Design System, the greetings and the database schema are unchanged since V2', () => {
  // (the editor page itself is compared with production in lpVoiceGreetings.test.js)
  const { execFileSync } = require('child_process');
  const git = (...a) => execFileSync('git', a, { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(git('diff', 'd7f28e5', '--stat', '--', 'frontend/public/qds', 'frontend/public/js/voice-greetings.js', 'backend/src/data/voiceGreetings.js').trim(), '');
  // QRAIVY Deals (recovered from preview/qraivy-deals-foundation): the Deal and DealPlacement
  // schema with its migration, and the Deals-only files below, are allowed to differ -- they
  // are pinned to the reviewed Deals commit 3319cc8 instead and tested in deal*.test.js.
  assert.equal(git('diff', '3319cc8', '--stat', '--', 'backend/prisma').trim(), '');
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  const jobLog = console.log;
  console.log = (...a) => { if (!String(a[0]).startsWith('[Voice]') && a[0] !== '') jobLog(...a); };
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; quiet(false); console.log(`FAIL  ${name}`); console.log(`      ${String(err.message).split('\n').slice(0, 8).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
