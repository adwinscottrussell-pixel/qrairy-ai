// ============================================================
// lpVoiceGreetings.test.js — Smart Landing Page voice, Phase V2:
// bilingual industry greetings, the editable greeting, and audio that is
// regenerated exactly when what should be spoken has changed.
//
// What is real here: the greeting data, lpVoiceService, voiceService,
// lpSectionsPatch, the save handler (handlePublishLP), the page reload
// (handleGetLP), and the editor's own greeting script, which is executed
// against a stand-in DOM. What is replaced: the database (in-memory, with
// real compare-and-swap semantics), and the two outside services at their
// network edge -- https.request (ElevenLabs) and Cloudinary's
// upload_stream -- so every text-to-speech call is counted and inspected
// and none is ever made.
//
// No test framework dependency, same convention as tests/lpVoice.test.js.
// Run: node tests/lpVoiceGreetings.test.js
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
const tts = { calls: [], fail: false, gate: null, version: 0 };
https.request = function fakeRequest(options, cb) {
  const req = new EventEmitter();
  let body = '';
  req.write = (chunk) => { body += chunk; };
  req.end = () => {
    const call = { host: options.hostname, path: options.path, voiceId: options.path.split('/').pop(), body: JSON.parse(body), key: options.headers['xi-api-key'] };
    tts.calls.push(call);
    const respond = () => {
      const res = new EventEmitter();
      res.statusCode = tts.fail ? 500 : 200;
      cb(res);
      res.emit('data', Buffer.from(tts.fail ? '{"detail":"quota exceeded"}' : 'MP3:' + call.body.text));
      res.emit('end');
    };
    if (tts.gate) tts.gate.then(respond); else setImmediate(respond);
  };
  return req;
};
const cloudinary = require('cloudinary').v2;
cloudinary.uploader.upload_stream = function fakeUpload(opts, cb) {
  return { end(buffer) { tts.version += 1; setImmediate(() => cb(null, { secure_url: `https://res.cloudinary.com/test/video/upload/v${tts.version}/${opts.folder}/${opts.public_id}.mp3`, bytes: buffer.length })); } };
};
process.env.ELEVENLABS_API_KEY = 'test-key';

// ── In-memory database ───────────────────────────────────────────
let landingPages = {};
let users = {};
let beforeCas = null;   // hook: runs once between a read and the next compare-and-swap write
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
      if (beforeCas) { const hook = beforeCas; beforeCas = null; await hook(); }
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
const { STANDARD_VOICES, standardVoice, synthesizeAndUploadVoice } = require('../src/services/voiceService');
const voice = require('../src/services/lpVoiceService');
const { handlePublishLP, handleGetLP, handleServeLP } = require('../src/controllers/lpController');

const realError = console.error, realLog = console.log;
const quiet = (on) => { console.error = on ? () => {} : realError; };

// ── Helpers ──────────────────────────────────────────────────────
const OWNER = 'user-owner';
function reset() { landingPages = {}; users = { [OWNER]: { id: OWNER, plan: 'business', subscriptionStatus: 'active' } }; tts.calls = []; tts.fail = false; tts.gate = null; beforeCas = null; }
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
let slugSeq = 0;
const newSlug = () => 'greet-' + (++slugSeq);
function putPage(slug, { useCase = 'restaurant', businessName = 'Casa Lumi', sections = {} } = {}) {
  landingPages[slug] = { id: 'lp-' + slug, slug, businessName, useCase, userId: OWNER, template: 'premium', status: 'live', sections: JSON.stringify(sections), createdAt: new Date(clock), updatedAt: tickClock() };
}
const sectionsOf = (slug) => JSON.parse(landingPages[slug].sections);
function editSections(slug, change) { const s = sectionsOf(slug); change(s); landingPages[slug].sections = JSON.stringify(s); landingPages[slug].updatedAt = tickClock(); }
async function save(slug, body, { owner = OWNER } = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handlePublishLP({ body: Object.assign({ slug, businessName: 'Casa Lumi', useCase: 'restaurant', template: 'premium' }, body), headers: { authorization: 'Bearer ' + owner } }, res);
  await settle();
  return res;
}
async function reload(slug) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handleGetLP({ params: { slug } }, res);
  return JSON.parse(res.body.sections);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const INDUSTRIES = ['restaurant', 'creator', 'artist', 'event', 'ecommerce', 'local_business', 'fitness', 'other'];

// ── A. The greetings themselves ────────────────────────────────
test('A. eight industries, each with an English and a German greeting', () => {
  assert.deepEqual(greetings.VOICE_INDUSTRIES, INDUSTRIES);
  assert.deepEqual(Object.keys(greetings.VOICE_GREETINGS), INDUSTRIES);
  assert.deepEqual(greetings.VOICE_LANGUAGES, ['en', 'de']);
  const seen = new Set();
  for (const industry of INDUSTRIES) {
    assert.deepEqual(Object.keys(greetings.VOICE_GREETINGS[industry]), ['en', 'de'], industry);
    for (const lang of ['en', 'de']) {
      const text = greetings.VOICE_GREETINGS[industry][lang];
      assert.ok(typeof text === 'string' && text.length > 60, industry + '/' + lang);
      assert.equal(text.split('{name}').length, 2, industry + '/' + lang + ' names the business exactly once');
      assert.ok(!seen.has(text), 'every greeting is its own text'); seen.add(text);
    }
  }
  assert.equal(seen.size, 16);
});

test('A. wording rules: no prices, promotions, hours or named features, no mention of the assistant; German is formal', () => {
  // "what we have to offer" / "unser Angebot" is the approved general sense, not a promotion.
  for (const industry of INDUSTRIES) {
    const { en, de } = greetings.VOICE_GREETINGS[industry];
    assert.ok(!/[%€$£0-9]|\b(discount|deal|special offer|free|sale|price|opening hours|wallet|loyalty|stamp|subscribe|AI|assistant|chat|ask|question)\b/i.test(en), industry + ' en: ' + en);
    assert.ok(!/[%€$£0-9]|\b(Rabatt|Sonderangebot|gratis|kostenlos|Preis|Öffnungszeiten|Wallet|Treue|Stempel|abonnier|KI|Assistent|Chat|fragen|Frage)/i.test(de), industry + ' de: ' + de);
    assert.ok(/\bSie\b/.test(de) && !/\b(du|dich|dir|dein|deine|euch|ihr seid)\b/i.test(de), industry + ' de is formal');
    assert.ok(/^(Welcome to|Hi, this is) \{name\}!/.test(en), industry);
    assert.ok(/^(Willkommen bei|Hallo, hier ist) \{name\}!/.test(de), industry);
    // Creator speaks in the first person singular; the business categories never do
    assert.equal(/\b(I|I've|I'd)\b/.test(en) || /\bich\b/.test(de), industry === 'creator', industry);
  }
});

test('A. the sixteen greetings are exactly the wording the founder approved on 2026-10-11', () => {
  const approved = {
    restaurant: {
      en: "Welcome to {name}! We're glad you're here. Take a look around and get to know us. We look forward to your visit.",
      de: "Willkommen bei {name}! Schön, dass Sie da sind. Sehen Sie sich in Ruhe um und lernen Sie uns kennen. Wir freuen uns auf Ihren Besuch.",
    },
    creator: {
      en: "Hi, this is {name}! Thanks for stopping by. I've put together a few things I'd love to share with you. Enjoy exploring!",
      de: "Hallo, hier ist {name}! Schön, dass Sie vorbeischauen. Hier habe ich einiges zusammengestellt, das ich gern mit Ihnen teilen möchte. Viel Spaß beim Entdecken!",
    },
    artist: {
      en: "Welcome to {name}! Thanks for stopping by. Discover what's new and explore more right here.",
      de: "Willkommen bei {name}! Schön, dass Sie vorbeischauen. Entdecken Sie hier Neues und erfahren Sie mehr.",
    },
    event: {
      en: "Welcome to {name}! We're glad you're here. Explore this page for information about the event.",
      de: "Willkommen bei {name}! Schön, dass Sie da sind. Hier finden Sie Informationen rund um die Veranstaltung.",
    },
    ecommerce: {
      en: "Welcome to {name}! Thanks for visiting. Take a look around and discover what we have to offer.",
      de: "Willkommen bei {name}! Vielen Dank für Ihren Besuch. Stöbern Sie in Ruhe und entdecken Sie unser Angebot.",
    },
    local_business: {
      en: "Welcome to {name}! Thanks for stopping by. Discover more about us and what we do.",
      de: "Willkommen bei {name}! Schön, dass Sie vorbeischauen. Erfahren Sie mehr über uns und unsere Arbeit.",
    },
    fitness: {
      en: "Welcome to {name}! Great to have you here. Discover what we offer. We look forward to seeing you!",
      de: "Willkommen bei {name}! Schön, dass Sie da sind. Entdecken Sie unser Angebot. Wir freuen uns auf Sie!",
    },
    other: {
      en: "Welcome to {name}! Thanks for stopping by. Take a look around and discover more.",
      de: "Willkommen bei {name}! Schön, dass Sie vorbeischauen. Sehen Sie sich in Ruhe um und entdecken Sie mehr.",
    },
  };
  assert.deepEqual(greetings.VOICE_GREETINGS, approved);
  assert.deepEqual(Object.keys(approved), INDUSTRIES);
});

test('A. every greeting fits the limit even with a long business name', () => {
  assert.equal(greetings.GREETING_MAX_LENGTH, 400);
  const longName = 'Zum Goldenen Hirschen Gasthaus & Biergarten am Marktplatz'; // 56 characters
  for (const industry of INDUSTRIES) for (const lang of ['en', 'de']) {
    const text = greetings.defaultGreeting(industry, lang, longName);
    assert.ok(text.includes(longName) && text.length <= 400, industry + '/' + lang + ' = ' + text.length);
  }
});

test('A. the eight onboarding categories map onto the eight industries, one each; unknown means "other"', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'smart-qr-categories.js'), 'utf8'), ctx);
  // Copied into an array of this realm (deepEqual compares prototypes).
  const slugs = [...ctx.window.QRAIVY_SMART_QR_CATEGORIES].map((c) => c.slug);
  assert.equal(slugs.length, 8);
  assert.deepEqual(slugs.map(greetings.industryKey).sort(), INDUSTRIES.slice().sort());
  for (const [useCase, expected] of [['Restaurant', 'restaurant'], ['gym', 'fitness'], ['shop', 'ecommerce'], ['influencer', 'creator'], ['music', 'artist'], ['events', 'event'], ['local', 'local_business'], ['Local Business', 'local_business'], ['realestate', 'other'], ['', 'other'], [null, 'other'], ['something-new', 'other']]) {
    assert.equal(greetings.industryKey(useCase), expected, String(useCase));
  }
});

test('A. the business name is spoken cleanly, and a page without one still gets a natural sentence', () => {
  assert.equal(greetings.defaultGreeting('restaurant', 'en', 'Casa Lumi').slice(0, 22), 'Welcome to Casa Lumi! ');
  assert.equal(greetings.spokenBusinessName('Welcome to Casa Lumi'), 'Casa Lumi');
  assert.equal(greetings.spokenBusinessName('https://www.casa-lumi.de/menu'), 'casa-lumi');
  for (const industry of INDUSTRIES) {
    const en = greetings.defaultGreeting(industry, 'en', ''), de = greetings.defaultGreeting(industry, 'de', null);
    assert.ok(!en.includes('{name}') && !/to !|to  /.test(en) && /^(Welcome!|Hi!) /.test(en), en);
    assert.ok(!de.includes('{name}') && /^(Willkommen!|Hallo!) /.test(de), de);
  }
});

test('A. the editor\'s copy of the greetings is identical to what the server speaks', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'voice-greetings.js'), 'utf8'), ctx);
  const fe = ctx.window.QRAIVY_VOICE_GREETINGS;
  assert.deepEqual(JSON.parse(JSON.stringify(fe.GREETINGS)), greetings.VOICE_GREETINGS);
  assert.deepEqual(JSON.parse(JSON.stringify(fe.INDUSTRIES)), greetings.VOICE_INDUSTRIES);
  assert.deepEqual(JSON.parse(JSON.stringify(fe.ALIASES)), greetings.INDUSTRY_ALIASES);
  assert.equal(fe.MAX_LENGTH, greetings.GREETING_MAX_LENGTH);
  const names = ['Casa Lumi', '', 'Welcome to Müller & Söhne', 'https://www.example.de/x', null];
  const useCases = [...INDUSTRIES, 'gym', 'Local Business', 'artist_music', 'weird', undefined];
  for (const useCase of useCases) for (const lang of ['en', 'de', 'fr']) for (const name of names) {
    assert.equal(fe.defaultGreeting(useCase, lang, name), greetings.defaultGreeting(useCase, lang, name), [useCase, lang, name].join('|'));
    assert.equal(fe.industryKey(useCase), greetings.industryKey(useCase));
  }
  for (const text of ['  a   b \n c ', 'x'.repeat(450), '', null, 5]) assert.equal(fe.cleanGreeting(text), voice.cleanGreeting(text));
});

// ── B. One standard voice per language ─────────────────────────
test('B. exactly two standard voices: Sarah for English, Charlotte for German', () => {
  assert.deepEqual(Object.keys(STANDARD_VOICES), ['en', 'de']);
  assert.equal(STANDARD_VOICES.en.id, 'EXAVITQu4vr4xnSDxMaL');
  assert.equal(STANDARD_VOICES.en.model, 'eleven_turbo_v2');
  assert.equal(STANDARD_VOICES.de.id, 'XB0fDUnXU5powFXDhCwa');
  assert.equal(STANDARD_VOICES.de.model, 'eleven_multilingual_v2');
  assert.equal(standardVoice('de'), STANDARD_VOICES.de);
  for (const other of ['en', 'fr', undefined, null, 'DE']) assert.equal(standardVoice(other), STANDARD_VOICES.en);
});

test('B. these are the same two ids the service has always used as its defaults', () => {
  // Read from the last committed version of the service, not from the new code.
  const { execFileSync } = require('child_process');
  const before = execFileSync('git', ['show', 'origin/main:backend/src/services/voiceService.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.match(before, /sarah:\s+\{ id: "EXAVITQu4vr4xnSDxMaL"/);
  assert.match(before, /anna_de: \{ id: "XB0fDUnXU5powFXDhCwa"/);
  const controllerBefore = execFileSync('git', ['show', 'origin/main:backend/src/controllers/lpController.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.match(controllerBefore, /_lang === 'de' \? 'anna_de' : 'sarah'/);
});

test('B. a greeting is sent to the voice and model of its language, with the exact text', async () => {
  reset();
  const en = await synthesizeAndUploadVoice({ slug: 'b-en', text: 'Hello there.', lang: 'en' });
  const de = await synthesizeAndUploadVoice({ slug: 'b-de', text: 'Guten Tag.', lang: 'de' });
  assert.equal(tts.calls.length, 2);
  assert.deepEqual([tts.calls[0].host, tts.calls[0].path, tts.calls[0].body.model_id, tts.calls[0].body.text, tts.calls[0].key], ['api.elevenlabs.io', '/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL', 'eleven_turbo_v2', 'Hello there.', 'test-key']);
  assert.deepEqual([tts.calls[1].path, tts.calls[1].body.model_id, tts.calls[1].body.text], ['/v1/text-to-speech/XB0fDUnXU5powFXDhCwa', 'eleven_multilingual_v2', 'Guten Tag.']);
  assert.match(en, /^https:\/\/res\.cloudinary\.com\/test\/video\/upload\/v\d+\/qraivy-voices\/voice-b-en\.mp3$/);
  assert.match(de, /voice-b-de\.mp3$/);
});

test('B. a failed or impossible generation throws; it never returns a placeholder', async () => {
  reset();
  tts.fail = true;
  await assert.rejects(() => synthesizeAndUploadVoice({ slug: 'x', text: 'Hi', lang: 'en' }), /ElevenLabs error/);
  tts.fail = false;
  await assert.rejects(() => synthesizeAndUploadVoice({ slug: 'x', text: '   ', lang: 'en' }), /No greeting text/);
  const key = process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_API_KEY;
  try { await assert.rejects(() => synthesizeAndUploadVoice({ slug: 'x', text: 'Hi', lang: 'en' }), /ELEVENLABS_API_KEY not set/); } finally { process.env.ELEVENLABS_API_KEY = key; }
});

// ── C. What a page says ────────────────────────────────────────
test('C. all eight industries, both languages: the page speaks its industry\'s greeting in its language\'s voice', async () => {
  reset();
  for (const industry of INDUSTRIES) for (const lang of ['en', 'de']) {
    const slug = newSlug();
    putPage(slug, { useCase: industry, businessName: 'Casa Lumi', sections: { voice: { enabled: true, voiceLanguage: lang } } });
    tts.calls = [];
    const result = await voice.ensureVoiceAudio(slug);
    assert.equal(result.generated, true, industry + '/' + lang);
    assert.equal(tts.calls.length, 1);
    assert.equal(tts.calls[0].body.text, greetings.VOICE_GREETINGS[industry][lang].replace('{name}', 'Casa Lumi'));
    assert.equal(tts.calls[0].voiceId, STANDARD_VOICES[lang].id);
    const v = sectionsOf(slug).voice;
    assert.equal(v.audioLang, lang);
    assert.match(v.audioUrl, /^https:\/\//);
    assert.equal(v.audioFor, voice.effectiveGreeting(landingPages[slug]).fingerprint);
  }
});

test('C. language: the Voice tab\'s choice, else the page\'s language, else English', () => {
  const page = { slug: 's', useCase: 'fitness', businessName: 'Studio Nord' };
  const g = (sections) => voice.effectiveGreeting(Object.assign({}, page, { sections: JSON.stringify(sections) }));
  assert.equal(g({}).lang, 'en');
  assert.equal(g({ language: 'de' }).lang, 'de');
  assert.equal(g({ language: 'de', voice: { voiceLanguage: 'en' } }).lang, 'en');
  assert.equal(g({ language: 'en', voice: { voiceLanguage: 'de' } }).lang, 'de');
  assert.equal(g({ language: 'de', voice: { voiceLanguage: 'fr' } }).lang, 'de');
  // the editor in use saves voice.language; it outranks a stale voiceLanguage left by the earlier editor
  assert.equal(g({ language: 'en', voice: { language: 'de' } }).lang, 'de');
  assert.equal(g({ language: 'de', voice: { language: 'de', voiceLanguage: 'en' } }).lang, 'de');
  assert.equal(g({ language: 'en', voice: { language: 'en', voiceLanguage: 'de' } }).lang, 'en');
  assert.equal(g({ language: 'de', voice: { language: 'xx', voiceLanguage: 'en' } }).lang, 'en');
  assert.ok(g({ language: 'de' }).text.startsWith('Willkommen bei Studio Nord!'));
  assert.equal(g({ language: 'de' }).isCustom, false);
});

test('C. a custom greeting replaces the standard one for its own language only', () => {
  const page = (sections) => ({ slug: 's', useCase: 'restaurant', businessName: 'Casa Lumi', sections: JSON.stringify(sections) });
  const custom = { en: 'Hi! Maria here. The oven is on.', de: 'Hallo! Hier ist Maria. Der Ofen läuft.' };
  const en = voice.effectiveGreeting(page({ voice: { voiceLanguage: 'en', customGreeting: custom } }));
  const de = voice.effectiveGreeting(page({ voice: { voiceLanguage: 'de', customGreeting: custom } }));
  assert.deepEqual([en.text, en.isCustom, de.text, de.isCustom], [custom.en, true, custom.de, true]);
  const onlyEn = voice.effectiveGreeting(page({ voice: { voiceLanguage: 'de', customGreeting: { en: custom.en } } }));
  assert.equal(onlyEn.isCustom, false);
  assert.ok(onlyEn.text.startsWith('Willkommen bei Casa Lumi!'), 'German falls back to the German standard, never to the English custom text');
  assert.equal(en.standard, greetings.defaultGreeting('restaurant', 'en', 'Casa Lumi'));
});

test('C. custom text is cleaned and capped; unusable values are ignored', () => {
  assert.equal(voice.cleanGreeting('  Hello   there \n\n friend  '), 'Hello there friend');
  assert.equal(voice.cleanGreeting('x'.repeat(600)).length, 400);
  for (const bad of [null, undefined, 5, {}, [], '   ']) assert.equal(voice.cleanGreeting(bad), '');
  assert.deepEqual(voice.cleanCustomGreetings({ en: '  Hi  ', de: '', fr: 'Bonjour', xx: 1 }), { en: 'Hi' });
  for (const bad of [null, 'text', ['a'], 7]) assert.deepEqual(voice.cleanCustomGreetings(bad), {});
  const page = { slug: 's', useCase: 'other', businessName: 'X', sections: JSON.stringify({ voice: { customGreeting: { en: '   ' } } }) };
  assert.equal(voice.effectiveGreeting(page).isCustom, false);
});

test('C. the fingerprint changes with the text, the language or the voice, and with nothing else', () => {
  const base = { slug: 's', useCase: 'restaurant', businessName: 'Casa Lumi' };
  const fp = (sections, over = {}) => voice.effectiveGreeting(Object.assign({}, base, over, { sections: JSON.stringify(sections) })).fingerprint;
  const a = fp({ voice: { voiceLanguage: 'en' } });
  assert.equal(a, fp({ voice: { voiceLanguage: 'en', title: 'New title', description: 'x', enabled: false }, hero: { title: 'h' }, buttons: [1], theme: { accentColor: '#000' } }), 'unrelated edits');
  assert.notEqual(a, fp({ voice: { voiceLanguage: 'de' } }), 'language');
  assert.notEqual(a, fp({ voice: { voiceLanguage: 'en', customGreeting: { en: 'Hi' } } }), 'custom text');
  assert.notEqual(a, fp({ voice: { voiceLanguage: 'en' } }, { useCase: 'fitness' }), 'industry');
  assert.notEqual(a, fp({ voice: { voiceLanguage: 'en' } }, { businessName: 'Casa Luna' }), 'business name');
  assert.equal(a, fp({ voice: { voiceLanguage: 'en', customGreeting: { de: 'Nur Deutsch geändert' } } }), 'the other language\'s custom text');
  assert.notEqual(voice.voiceFingerprint(STANDARD_VOICES.en, 'Hi'), voice.voiceFingerprint(STANDARD_VOICES.de, 'Hi'));
  assert.notEqual(voice.voiceFingerprint(STANDARD_VOICES.en, 'Hi'), voice.voiceFingerprint(Object.assign({}, STANDARD_VOICES.en, { model: 'other' }), 'Hi'));
});

// ── D. Regeneration: when needed, and only then ────────────────
test('D. generated once; saving again, or editing anything else, makes no further call', async () => {
  reset();
  const slug = newSlug();
  putPage(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en' }, hero: { title: 'A' } } });
  assert.equal((await voice.ensureVoiceAudio(slug)).generated, true);
  const first = sectionsOf(slug).voice.audioUrl;
  assert.deepEqual(await voice.ensureVoiceAudio(slug), { generated: false, reason: 'current' });
  editSections(slug, (s) => { s.hero.title = 'B'; s.buttons = [{ id: 'b1', url: 'https://example.com' }]; s.theme = { accentColor: '#123456' }; s.voice.title = 'A word from us'; s.voice.description = 'Listen'; });
  assert.deepEqual(await voice.ensureVoiceAudio(slug), { generated: false, reason: 'current' });
  assert.equal(tts.calls.length, 1);
  assert.equal(sectionsOf(slug).voice.audioUrl, first);
});

test('D. changing the greeting regenerates, with the new text', async () => {
  reset();
  const slug = newSlug();
  putPage(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en' } } });
  await voice.ensureVoiceAudio(slug);
  const first = sectionsOf(slug).voice;
  editSections(slug, (s) => { s.voice.customGreeting = { en: 'Hi! Maria here. The oven is on.' }; });
  const r = await voice.ensureVoiceAudio(slug);
  assert.equal(r.generated, true);
  assert.equal(tts.calls.length, 2);
  assert.equal(tts.calls[1].body.text, 'Hi! Maria here. The oven is on.');
  const second = sectionsOf(slug).voice;
  assert.notEqual(second.audioUrl, first.audioUrl, 'a new address, so no cached copy of the old greeting');
  assert.notEqual(second.audioFor, first.audioFor);
  // back to the standard greeting: that is a change too
  editSections(slug, (s) => { delete s.voice.customGreeting; });
  await voice.ensureVoiceAudio(slug);
  assert.equal(tts.calls.length, 3);
  assert.ok(tts.calls[2].body.text.startsWith('Welcome to Casa Lumi!'));
});

test('D. changing the language regenerates in that language\'s voice; custom texts of both languages are kept', async () => {
  reset();
  const slug = newSlug();
  const custom = { en: 'Hi! Maria here.', de: 'Hallo! Hier ist Maria.' };
  putPage(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en', customGreeting: custom } } });
  await voice.ensureVoiceAudio(slug);
  editSections(slug, (s) => { s.voice.voiceLanguage = 'de'; });
  await voice.ensureVoiceAudio(slug);
  editSections(slug, (s) => { s.voice.voiceLanguage = 'en'; });
  await voice.ensureVoiceAudio(slug);
  assert.deepEqual(tts.calls.map((c) => [c.voiceId, c.body.text]), [[STANDARD_VOICES.en.id, custom.en], [STANDARD_VOICES.de.id, custom.de], [STANDARD_VOICES.en.id, custom.en]]);
  assert.deepEqual(sectionsOf(slug).voice.customGreeting, custom);
  assert.equal(sectionsOf(slug).voice.audioLang, 'en');
});

test('D. changing the business name or industry changes a standard greeting, but not a custom one', async () => {
  reset();
  const std = newSlug(), own = newSlug();
  putPage(std, { sections: { voice: { voiceLanguage: 'en' } } });
  putPage(own, { sections: { voice: { voiceLanguage: 'en', customGreeting: { en: 'Our own words.' } } } });
  await voice.ensureVoiceAudio(std); await voice.ensureVoiceAudio(own);
  for (const slug of [std, own]) { landingPages[slug].businessName = 'Casa Luna'; landingPages[slug].useCase = 'fitness'; landingPages[slug].updatedAt = tickClock(); }
  assert.equal((await voice.ensureVoiceAudio(std)).generated, true);
  assert.deepEqual(await voice.ensureVoiceAudio(own), { generated: false, reason: 'current' });
  assert.equal(tts.calls.length, 3);
  assert.ok(tts.calls[2].body.text.startsWith('Welcome to Casa Luna! Great to have you here.'));
});

test('D. with Voice off nothing is generated; switching it back on only generates if something changed', async () => {
  reset();
  const slug = newSlug();
  for (const off of [{ voice: { enabled: false } }, { voice: { active: false } }, { voice: { enabled: true }, settings: { voiceEnabled: false } }]) {
    putPage(slug, { sections: off });
    assert.deepEqual(await voice.ensureVoiceAudio(slug), { generated: false, reason: 'voice_off' });
  }
  assert.equal(tts.calls.length, 0);
  putPage(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en' } } });
  await voice.ensureVoiceAudio(slug);
  editSections(slug, (s) => { s.voice.enabled = false; });
  await voice.ensureVoiceAudio(slug);
  editSections(slug, (s) => { s.voice.enabled = true; });
  assert.deepEqual(await voice.ensureVoiceAudio(slug), { generated: false, reason: 'current' });
  assert.equal(tts.calls.length, 1, 'off and on again reuses the audio that already matches');
});

test('D. a page that has audio from before fingerprints existed is regenerated once, then left alone', async () => {
  reset();
  const slug = newSlug();
  putPage(slug, { sections: { voice: { enabled: true, voiceKey: 'laura', audioUrl: 'https://res.cloudinary.com/test/video/upload/v1/qraivy-voices/old.mp3' } } });
  assert.equal((await voice.ensureVoiceAudio(slug)).generated, true);
  assert.equal(tts.calls[0].voiceId, STANDARD_VOICES.en.id, 'the old per-page character choice is no longer used');
  await voice.ensureVoiceAudio(slug);
  assert.equal(tts.calls.length, 1);
});

test('D. several requests at once for one page make one call; different pages do not block each other', async () => {
  reset();
  const a = newSlug(), b = newSlug();
  putPage(a, { sections: { voice: { voiceLanguage: 'en' } } }); putPage(b, { sections: { voice: { voiceLanguage: 'de' } } });
  let release; tts.gate = new Promise((r) => { release = r; });
  const runs = [voice.ensureVoiceAudio(a), voice.ensureVoiceAudio(a), voice.ensureVoiceAudio(a), voice.ensureVoiceAudio(b)];
  await settle();
  assert.equal(tts.calls.length, 2, 'one in flight per page');
  release(); tts.gate = null;
  const results = await Promise.all(runs);
  assert.equal(tts.calls.length, 2);
  assert.ok(results.every((r) => r && (r.generated || r.reason === 'current')));
  assert.ok(sectionsOf(a).voice.audioUrl && sectionsOf(b).voice.audioUrl);
  assert.equal((await voice.ensureVoiceAudio(a)).reason, 'current', 'and the page is free for the next run');
});

test('D. a greeting changed while audio was being made: the old recording is not attached, the new one is', async () => {
  reset();
  const slug = newSlug();
  putPage(slug, { sections: { voice: { voiceLanguage: 'en' }, hero: { title: 'Kept' } } });
  let release; tts.gate = new Promise((r) => { release = r; });
  const run = voice.ensureVoiceAudio(slug);
  await settle();
  editSections(slug, (s) => { s.voice.customGreeting = { en: 'Changed while you were recording.' }; s.hero.title = 'Edited meanwhile'; });
  release(); tts.gate = null;
  const result = await run;
  assert.equal(tts.calls.length, 2, 'one for the old text, one for the new');
  assert.equal(tts.calls[1].body.text, 'Changed while you were recording.');
  const s = sectionsOf(slug);
  assert.equal(s.voice.audioFor, voice.effectiveGreeting(landingPages[slug]).fingerprint, 'the stored audio is of the current greeting');
  assert.equal(s.hero.title, 'Edited meanwhile', 'and the edit made meanwhile is intact');
  assert.equal(result.generated, true);
});

test('D. Voice switched off while audio was being made: nothing is attached', async () => {
  reset();
  const slug = newSlug();
  putPage(slug, { sections: { voice: { voiceLanguage: 'en' } } });
  let release; tts.gate = new Promise((r) => { release = r; });
  quiet(true);
  const run = voice.ensureVoiceAudio(slug);
  await settle();
  editSections(slug, (s) => { s.voice.enabled = false; });
  release(); tts.gate = null;
  await run; quiet(false);
  assert.equal(sectionsOf(slug).voice.audioUrl, undefined);
  assert.equal(tts.calls.length, 1);
});

test('D. a save landing between the job\'s read and write is not overwritten', async () => {
  reset();
  const slug = newSlug();
  putPage(slug, { sections: { voice: { voiceLanguage: 'en' }, hero: { title: 'Old' } } });
  beforeCas = async () => editSections(slug, (s) => { s.hero.title = 'Newer'; s.buttons = [{ id: 'b', url: 'https://example.com' }]; });
  await voice.ensureVoiceAudio(slug);
  const s = sectionsOf(slug);
  assert.equal(s.hero.title, 'Newer');
  assert.equal(s.buttons.length, 1);
  assert.ok(s.voice.audioUrl);
  assert.equal(tts.calls.length, 1, 'the recording was still right, so it was kept, not made again');
});

test('D. generation failure: logged, nothing stored, the page keeps what it had, and the next save tries again', async () => {
  reset();
  const slug = newSlug();
  putPage(slug, { sections: { voice: { voiceLanguage: 'en' } } });
  await voice.ensureVoiceAudio(slug);
  const good = sectionsOf(slug).voice;
  editSections(slug, (s) => { s.voice.customGreeting = { en: 'New words.' }; });
  const before = landingPages[slug].sections;
  tts.fail = true; quiet(true);
  const failed = await voice.ensureVoiceAudio(slug);
  quiet(false); tts.fail = false;
  assert.equal(failed.generated, false);
  assert.equal(failed.reason, 'error');
  assert.match(failed.error, /ElevenLabs error/);
  assert.equal(landingPages[slug].sections, before, 'nothing was written');
  assert.equal(sectionsOf(slug).voice.audioUrl, good.audioUrl, 'the previous audio is still there');
  const retry = await voice.ensureVoiceAudio(slug);
  assert.equal(retry.generated, true);
  assert.equal(tts.calls[tts.calls.length - 1].body.text, 'New words.');
});

test('D. a missing page or a missing key never throws', async () => {
  reset();
  assert.deepEqual(await voice.ensureVoiceAudio('no-such-page'), { generated: false, reason: 'not_found' });
  const slug = newSlug(); putPage(slug, { sections: {} });
  const key = process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_API_KEY; quiet(true);
  let r; try { r = await voice.ensureVoiceAudio(slug); } finally { process.env.ELEVENLABS_API_KEY = key; quiet(false); }
  assert.equal(r.reason, 'error');
  assert.equal(tts.calls.length, 0);
});

// ── E. Saving ──────────────────────────────────────────────────
test('E. audio fields are the server\'s: a save can neither set nor erase them', () => {
  const stored = { enabled: true, audioUrl: 'https://res.cloudinary.com/x/a.mp3', audioFor: 'abc', audioLang: 'en', customGreeting: { en: 'Kept' } };
  const fromEditor = { enabled: true, title: 'T', voiceLanguage: 'de', audioUrl: 'https://evil.example.com/x.mp3', audioFor: 'forged', audioLang: 'de' };
  const merged = voice.mergeVoiceOnSave(fromEditor, stored);
  assert.deepEqual([merged.audioUrl, merged.audioFor, merged.audioLang], [stored.audioUrl, 'abc', 'en']);
  assert.deepEqual([merged.title, merged.voiceLanguage], ['T', 'de']);
  const fresh = voice.mergeVoiceOnSave(fromEditor, null);
  for (const f of voice.SERVER_VOICE_FIELDS) assert.equal(f in fresh, false, f + ' cannot be introduced by a request');
});

test('E. custom greetings: kept when a save does not mention them, replaced when it does, removed when cleared', () => {
  const stored = { customGreeting: { en: 'Stored EN', de: 'Stored DE' }, audioUrl: 'https://a' };
  assert.deepEqual(voice.mergeVoiceOnSave({ enabled: true, title: 'x' }, stored).customGreeting, stored.customGreeting);
  assert.deepEqual(voice.mergeVoiceOnSave({ customGreeting: { en: '  New   EN ', de: 'Stored DE' } }, stored).customGreeting, { en: 'New EN', de: 'Stored DE' });
  assert.deepEqual(voice.mergeVoiceOnSave({ customGreeting: { de: 'Only DE' } }, stored).customGreeting, { de: 'Only DE' });
  assert.equal('customGreeting' in voice.mergeVoiceOnSave({ customGreeting: {} }, stored), false);
  assert.equal('customGreeting' in voice.mergeVoiceOnSave({ customGreeting: { en: '   ' } }, stored), false);
  assert.deepEqual(voice.mergeVoiceOnSave(undefined, stored), stored, 'a save without any voice block keeps the stored one');
  assert.equal(voice.mergeVoiceOnSave(undefined, null), undefined);
});

test('E. save -> reload: a custom greeting is stored, spoken, and comes back', async () => {
  reset();
  const slug = newSlug();
  const res = await save(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en', customGreeting: { en: '  Hi!   Maria here. ' } }, hero: { title: 'Casa Lumi' } } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.voice.pending, true);
  assert.equal(res.body.voice.isCustom, true);
  assert.equal(res.body.voice.lang, 'en');
  const loaded = await reload(slug);
  assert.deepEqual(loaded.voice.customGreeting, { en: 'Hi! Maria here.' });
  assert.equal(loaded.voice.audioFor, res.body.voice.audioFor, 'the editor can recognise the new audio by the fingerprint it was told');
  assert.equal(tts.calls.length, 1);
  assert.equal(tts.calls[0].body.text, 'Hi! Maria here.');
});

test('E. saving other settings keeps the custom greeting and costs no call; so does an old editor tab that does not send it', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en', customGreeting: { en: 'Our own words.', de: 'Unsere eigenen Worte.' } } } });
  const audio = (await reload(slug)).voice.audioUrl;
  // the editor sends back the voice block it loaded, plus other edits
  const loaded = await reload(slug);
  const res = await save(slug, { sections: { voice: Object.assign({}, loaded.voice, { title: 'A word from Maria' }), hero: { title: 'Casa Lumi' }, buttons: [{ id: 'b1', label: 'Menu', url: 'https://example.com', active: true }] } });
  assert.equal(res.body.voice.pending, false);
  // a client that knows nothing about customGreeting
  await save(slug, { sections: { voice: { enabled: true, title: 'Voice Welcome', voiceLanguage: 'en', voiceKey: 'sarah' } } });
  // a client that sends no sections.voice at all
  await save(slug, { sections: { hero: { title: 'Casa Lumi' } } });
  const after = await reload(slug);
  assert.deepEqual(after.voice.customGreeting, { en: 'Our own words.', de: 'Unsere eigenen Worte.' });
  assert.equal(after.voice.audioUrl, audio);
  assert.equal(tts.calls.length, 1, 'four saves, one recording');
});

test('E. switching language in the editor: the other language\'s greeting is spoken and neither custom text is lost', async () => {
  reset();
  const slug = newSlug();
  const custom = { en: 'Our own words.', de: 'Unsere eigenen Worte.' };
  await save(slug, { sections: { voice: { voiceLanguage: 'en', customGreeting: custom } } });
  const res = await save(slug, { sections: { voice: { voiceLanguage: 'de', customGreeting: custom } } });
  assert.equal(res.body.voice.pending, true);
  assert.equal(res.body.voice.lang, 'de');
  const after = await reload(slug);
  assert.deepEqual(after.voice.customGreeting, custom);
  assert.equal(after.voice.audioLang, 'de');
  assert.deepEqual(tts.calls.map((c) => c.body.text), [custom.en, custom.de]);
});

test('E. a request cannot plant an audio address, and cannot knock out the real one', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { voice: { voiceLanguage: 'en', audioUrl: 'https://evil.example.com/x.mp3', audioFor: 'forged' } } });
  const first = await reload(slug);
  assert.match(first.voice.audioUrl, /^https:\/\/res\.cloudinary\.com\/test\//);
  await save(slug, { sections: { voice: { voiceLanguage: 'en', audioUrl: '', audioFor: '' } } });
  const second = await reload(slug);
  assert.equal(second.voice.audioUrl, first.voice.audioUrl);
  assert.equal(tts.calls.length, 1);
});

test('E. saving with Voice off: no call, the response says so, and the stored audio is left in place', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en' } } });
  const res = await save(slug, { sections: { voice: { enabled: false, voiceLanguage: 'en', customGreeting: { en: 'Changed while off.' } } } });
  assert.deepEqual([res.body.voice.enabled, res.body.voice.pending], [false, false]);
  assert.equal(tts.calls.length, 1);
  const back = await save(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en', customGreeting: { en: 'Changed while off.' } } } });
  assert.equal(back.body.voice.pending, true);
  assert.equal(tts.calls.length, 2);
  assert.equal(tts.calls[1].body.text, 'Changed while off.');
});

test('E. another account cannot change a page\'s greeting', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { voice: { voiceLanguage: 'en', customGreeting: { en: 'Ours.' } } } });
  users['user-other'] = { id: 'user-other', plan: 'business', subscriptionStatus: 'active' };
  const res = await save(slug, { sections: { voice: { voiceLanguage: 'en', customGreeting: { en: 'Hijacked.' } } } }, { owner: 'user-other' });
  assert.equal(res.statusCode, 403);
  assert.deepEqual((await reload(slug)).voice.customGreeting, { en: 'Ours.' });
  assert.equal(tts.calls.length, 1);
});

test('E. the published page plays the regenerated audio', async () => {
  reset();
  const slug = newSlug();
  await save(slug, { sections: { voice: { enabled: true, voiceLanguage: 'en' } } });
  const url = (await reload(slug)).voice.audioUrl;
  const res = { headers: {}, statusCode: 200, body: '', setHeader() {}, status(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; } };
  await handleServeLP({ params: { slug }, query: { preview: '1' }, headers: {} }, res);
  assert.ok(res.body.includes('onclick="playAudio(this)"'));
  assert.ok(res.body.includes(JSON.stringify(url)));
});

test('E. the controller has one generation entry point, used after every save and after AI page generation', () => {
  const src = fs.readFileSync(resolve('src', 'controllers', 'lpController.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal((src.match(/ensureVoiceAudio\(slug\)/g) || []).length, 2);
  assert.ok(!/generateAndUploadVoice|synthesizeAndUploadVoice|voiceKey/.test(src.slice(src.indexOf('async function handlePublishLP'), src.indexOf('async function handleSubscribe'))), 'no direct text-to-speech call or character choice left in the save handler');
  assert.match(src, /setImmediate\(\(\) => \{ ensureVoiceAudio\(slug\); \}\);/);
});

// ── F. The editor's Voice tab ──────────────────────────────────
// The editor in use is frontend/public/smart-editor.js: at load it
// replaces the tab panels of smart-qr-detail.html with its own (Hero,
// Voice, Buttons, Style) and owns loading and publishing. The greeting
// field's behaviour lives in js/voice-greeting-editor.js and is run here
// for real against a stand-in DOM.
const editorPage = fs.readFileSync(path.join(PUB, 'smart-qr-detail.html'), 'utf8').replace(/\r\n/g, '\n');
const smartEditor = fs.readFileSync(path.join(PUB, 'smart-editor.js'), 'utf8').replace(/\r\n/g, '\n');

function editorHarness({ useCase = 'restaurant', businessName = 'Casa Lumi', voiceState = {}, uiLang = 'en' } = {}) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, value: '', textContent: '', style: {}, listeners: {}, addEventListener(ev, fn) { this.listeners[ev] = fn; } });
  for (const id of ['se-voice-greeting', 'se-voice-greeting-count', 'se-voice-greeting-status', 'se-voice-greeting-reset', 'se-voice-audio-status', 'sqd-iframe']) el(id);
  const timers = [], fetches = [];
  const state = { slug: 'casa-lumi-ab1', voice: Object.assign({ language: 'en', voiceKey: 'sarah', customText: '', customGreeting: {} }, voiceState), _db: { useCase, businessName } };
  let dirty = 0;
  const ctx = {
    window: { SmartEditor: { state }, _qraivyLang: uiLang },
    document: { getElementById: (id) => els[id] || null },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    Date, JSON, encodeURIComponent,
    fetch: (url) => { let resolveFn; const p = new Promise((r) => { resolveFn = r; }); fetches.push({ url, respond: (page) => resolveFn({ ok: true, json: async () => page }) }); return p; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'voice-greetings.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'voice-greeting-editor.js'), 'utf8'), ctx);
  const api = ctx.window.QRAIVY_VOICE_GREETING;
  // what smart-editor.js does: adopt on load, bind once, sync on render
  api.adopt(voiceState);
  api.bind(() => { dirty += 1; });
  api.sync();
  const field = els['se-voice-greeting'];
  return {
    api, state, els, field, timers, fetches,
    dirty: () => dirty,
    type(text) { field.value = text; field.listeners.input(); },
    // exactly the editor's language-change handler
    setLanguage(l) { api.collect(); state.voice.language = l; api.sync(); },
    custom: () => JSON.parse(JSON.stringify(state.voice.customGreeting || {})),
    runTimers: async () => { const due = timers.splice(0); due.forEach((fn) => fn()); await settle(); },
  };
}

test('F. the Voice tab offers Language and an editable greeting, limited like the server; the voice picker is gone', () => {
  const panel = smartEditor.slice(smartEditor.indexOf('data-se-panel="voice"'), smartEditor.indexOf('data-se-panel="buttons"'));
  assert.ok(panel.includes('<select id="se-voice-lang"') && panel.includes('<option value="de">Deutsch</option><option value="en">English</option>'));
  const field = panel.match(/<textarea id="se-voice-greeting"[^>]*>/)[0];
  assert.match(field, /maxlength="400"/);
  assert.ok(!/readonly|disabled/.test(field));
  for (const id of ['se-voice-greeting-status', 'se-voice-greeting-count', 'se-voice-greeting-reset', 'se-voice-audio-status']) assert.ok(panel.includes('id="' + id + '"'), id);
  assert.ok(!/se-voice-key|se-voice-text/.test(smartEditor), 'the per-page voice picker and the old optional box are no longer used');
  assert.ok(!panel.includes('AI greeting'), 'no leftover "AI greeting" wording');
  // same field styling as the rest of the panel: the editor's own style variables, nothing new
  assert.match(field, /style="'\+s\+'resize:vertical;line-height:1\.5;font-family:inherit;"/);
});

test('F. the editor page loads the greeting data and field script before the editor itself; nothing else on the page changed', () => {
  const a = editorPage.indexOf('<script src="js/voice-greetings.js"></script>');
  const b = editorPage.indexOf('<script src="js/voice-greeting-editor.js"></script>');
  const c = editorPage.indexOf('<script src="smart-editor.js"></script>');
  assert.ok(a !== -1 && b > a && c > b);
  const { execFileSync } = require('child_process');
  const before = execFileSync('git', ['show', 'origin/main:frontend/public/smart-qr-detail.html'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replace(/\r\n/g, '\n');
  assert.equal(editorPage.replace('<script src="js/voice-greetings.js"></script>\n<script src="js/voice-greeting-editor.js"></script>\n', ''), before, 'phone mockup, Hero layout and every other part of the editor page are byte-for-byte as before');
});

test('F. the editor script hooks the field into load, draft restore, render, language change and publish', () => {
  for (const hook of [
    "customText:'',customGreeting:{}}",
    "if(window.QRAIVY_VOICE_GREETING)window.QRAIVY_VOICE_GREETING.adopt(sv);SE.buttons=Array.isArray(sec.buttons)",
    "if(d.voice){Object.assign(SE.voice,d.voice);if(window.QRAIVY_VOICE_GREETING)window.QRAIVY_VOICE_GREETING.adopt(SE.voice);}",
    "function renderVoice(){var l=$('se-voice-lang');if(l)l.value=SE.voice.language;SE.voice.voiceKey=SE.voice.language==='de'?'anna_de':'sarah';",
    "window.QRAIVY_VOICE_GREETING.sync();}}",
    "if(l)l.addEventListener('change',function(){if(window.QRAIVY_VOICE_GREETING)window.QRAIVY_VOICE_GREETING.collect();SE.voice.language=this.value;renderVoice();markDirty();});",
    "if(window.QRAIVY_VOICE_GREETING)window.QRAIVY_VOICE_GREETING.bind(markDirty);}",
    "if(window.QRAIVY_VOICE_GREETING)window.QRAIVY_VOICE_GREETING.collect();var mergedVoice=Object.assign({},ds.voice||{},{language:SE.voice.language,voiceKey:SE.voice.voiceKey,customText:'',customGreeting:Object.assign({},SE.voice.customGreeting||{})});",
    "if(window.QRAIVY_VOICE_GREETING)window.QRAIVY_VOICE_GREETING.afterSave(data,{skipReload:true});",
  ]) assert.ok(smartEditor.includes(hook), hook.slice(0, 80));
  // the page language still follows the Voice tab's language, as before
  assert.ok(smartEditor.includes('language:SE.voice.language,theme:mergedTheme'));
});

test('F. the field shows the standard greeting of the page\'s industry, for all eight, in both languages', () => {
  for (const industry of INDUSTRIES) for (const lang of ['en', 'de']) {
    const h = editorHarness({ useCase: industry, voiceState: { language: lang } });
    assert.equal(h.field.value, greetings.defaultGreeting(industry, lang, 'Casa Lumi'), industry + '/' + lang);
    assert.deepEqual(h.custom(), {}, 'showing the standard greeting stores nothing');
    assert.equal(h.els['se-voice-greeting-reset'].style.display, 'none');
    assert.ok(h.els['se-voice-greeting-status'].textContent.startsWith('Standard greeting for: '));
    assert.equal(h.els['se-voice-greeting-count'].textContent, h.field.value.length + ' / 400');
  }
});

test('F. typing a greeting makes it the page\'s own, for the selected language', () => {
  const h = editorHarness();
  h.type('Hi!   Maria here.\nThe oven is on.');
  assert.deepEqual(h.custom(), { en: 'Hi! Maria here. The oven is on.' });
  assert.equal(h.els['se-voice-greeting-status'].textContent, 'Your own greeting');
  assert.equal(h.els['se-voice-greeting-reset'].style.display, 'inline-block');
  assert.equal(h.dirty(), 1, 'the editor knows there is something to publish');
});

test('F. switching language keeps both custom greetings and shows the right one', () => {
  const h = editorHarness();
  h.type('English words.');
  h.setLanguage('de');
  assert.equal(h.field.value, greetings.defaultGreeting('restaurant', 'de', 'Casa Lumi'), 'German has no custom text yet: its standard greeting is shown');
  h.type('Deutsche Worte.');
  h.setLanguage('en');
  assert.equal(h.field.value, 'English words.');
  h.setLanguage('de');
  assert.equal(h.field.value, 'Deutsche Worte.');
  assert.deepEqual(h.custom(), { en: 'English words.', de: 'Deutsche Worte.' });
});

test('F. text typed just before switching language is not lost, even without a further keystroke', () => {
  const h = editorHarness();
  h.field.value = 'Pasted without an input event.';
  h.setLanguage('de');
  h.setLanguage('en');
  assert.equal(h.field.value, 'Pasted without an input event.');
});

test('F. greetings loaded from the server are shown and survive collecting for publish untouched', () => {
  const h = editorHarness({ voiceState: { language: 'de', customGreeting: { en: 'Stored EN.', de: 'Gespeichert DE.' }, audioUrl: 'https://a', audioFor: 'x' } });
  assert.equal(h.field.value, 'Gespeichert DE.');
  h.api.collect();
  assert.deepEqual(h.custom(), { en: 'Stored EN.', de: 'Gespeichert DE.' });
  h.setLanguage('en'); h.api.collect();
  assert.deepEqual(h.custom(), { en: 'Stored EN.', de: 'Gespeichert DE.' });
});

test('F. the older single "custom welcome message" becomes the greeting of the page\'s language; nothing an owner wrote is dropped', () => {
  const h = editorHarness({ voiceState: { language: 'de', customText: '  Hallo, hier ist Maria. ' } });
  assert.equal(h.field.value, 'Hallo, hier ist Maria.');
  assert.deepEqual(h.custom(), { de: 'Hallo, hier ist Maria.' });
  assert.equal(h.state.voice.customText, '', 'and it is not kept twice');
  // a per-language greeting already stored takes precedence over the older field
  const h2 = editorHarness({ voiceState: { language: 'en', customText: 'Old single message.', customGreeting: { en: 'Newer EN.' } } });
  assert.deepEqual(h2.custom(), { en: 'Newer EN.' });
});

test('F. text equal to the standard greeting is not stored as custom; clearing the field goes back to standard', () => {
  const h = editorHarness();
  h.type('Something else.');
  h.type(greetings.defaultGreeting('restaurant', 'en', 'Casa Lumi'));
  assert.deepEqual(h.custom(), {});
  h.type('Custom again.');
  h.type('   ');
  assert.deepEqual(h.custom(), {});
  h.field.listeners.blur();
  assert.equal(h.field.value, greetings.defaultGreeting('restaurant', 'en', 'Casa Lumi'));
});

test('F. "Use standard greeting" removes only the selected language\'s custom text', () => {
  const h = editorHarness({ voiceState: { language: 'en', customGreeting: { en: 'EN own.', de: 'DE eigen.' } } });
  h.els['se-voice-greeting-reset'].listeners.click();
  assert.deepEqual(h.custom(), { de: 'DE eigen.' });
  assert.equal(h.field.value, greetings.defaultGreeting('restaurant', 'en', 'Casa Lumi'));
  assert.equal(h.dirty(), 1);
});

test('F. what the editor shows as standard is exactly what the server will speak', async () => {
  reset();
  for (const [industry, lang] of [['restaurant', 'en'], ['fitness', 'de'], ['artist_music', 'en'], ['Local Business', 'de']]) {
    const h = editorHarness({ useCase: industry, businessName: 'Casa Lumi', voiceState: { language: lang } });
    const slug = newSlug();
    putPage(slug, { useCase: industry, businessName: 'Casa Lumi', sections: { language: lang, voice: { language: lang, voiceKey: h.state.voice.voiceKey, customText: '', customGreeting: h.custom() } } });
    tts.calls = [];
    await voice.ensureVoiceAudio(slug);
    assert.equal(tts.calls[0].body.text, h.field.value, industry + '/' + lang);
  }
});

test('F. German editor: German status texts', () => {
  const h = editorHarness({ uiLang: 'de', useCase: 'fitness', voiceState: { language: 'de' } });
  assert.equal(h.els['se-voice-greeting-status'].textContent, 'Standardbegrüßung für: Fitness');
  h.type('Eigene Worte.');
  assert.equal(h.els['se-voice-greeting-status'].textContent, 'Ihre eigene Begrüßung');
});

// ── G. The phone preview shows the real published page ─────────
test('G. the phone preview is the published page itself, not a copy', () => {
  assert.match(editorPage, /iframeEl\.src = _iframeSlug \? \('https:\/\/api\.qraivy\.com\/lp\/' \+ _iframeSlug \+ '\?preview=1&t=' \+ Date\.now\(\)\)/);
  assert.ok(smartEditor.includes("var _newSrc='https://api.qraivy.com/lp/'+encodeURIComponent(SE.slug)+'?preview=1&t='+Date.now();iframe.src='';setTimeout(function(){iframe.src=_newSrc;},600);"), 'after publishing the editor reloads the real page, as before');
});

test('G. with no new audio on its way there is nothing to wait for', () => {
  const h = editorHarness();
  h.els['sqd-iframe'].src = 'set-by-publish';
  h.api.afterSave({ ok: true, voice: { enabled: true, pending: false, audioFor: 'abc' } }, { skipReload: true });
  assert.equal(h.els['sqd-iframe'].src, 'set-by-publish', 'the editor\'s own reload is not repeated');
  assert.equal(h.fetches.length, 0);
  assert.equal(h.els['se-voice-audio-status'].style.display, 'none');
});

test('G. when new audio is on its way the preview reloads again once it is really on the page', async () => {
  const h = editorHarness();
  h.els['sqd-iframe'].src = 'set-by-publish';
  h.api.afterSave({ ok: true, voice: { enabled: true, pending: true, audioFor: 'new-print' } }, { skipReload: true });
  assert.equal(h.els['se-voice-audio-status'].textContent, 'Welcome audio is being updated…');
  assert.equal(h.fetches.length, 1);
  assert.match(h.fetches[0].url, /^https:\/\/api\.qraivy\.com\/api\/lp\/casa-lumi-ab1\?t=\d+$/, 'asks the page-data route, not the page itself');
  // still the old audio
  h.fetches[0].respond({ sections: JSON.stringify({ voice: { audioUrl: 'https://old', audioFor: 'old-print' } }) });
  await settle();
  assert.equal(h.els['sqd-iframe'].src, 'set-by-publish', 'no reload for audio that is not the new one');
  assert.equal(h.timers.length, 1);
  await h.runTimers();
  assert.equal(h.fetches.length, 2);
  h.fetches[1].respond({ sections: JSON.stringify({ voice: { audioUrl: 'https://new', audioFor: 'new-print' } }) });
  await settle();
  assert.equal(h.els['se-voice-audio-status'].textContent, 'Welcome audio updated ✓');
  assert.match(h.els['sqd-iframe'].src, /^https:\/\/api\.qraivy\.com\/lp\/casa-lumi-ab1\?preview=1&t=\d+$/);
  assert.equal(h.timers.length, 0, 'and it stops asking');
});

test('G. it gives up politely if the audio never arrives, and a newer publish replaces an older wait', async () => {
  const h = editorHarness();
  h.api.afterSave({ voice: { enabled: true, pending: true, audioFor: 'never' } }, { skipReload: true });
  for (let i = 0; i < 20; i++) {
    h.fetches[h.fetches.length - 1].respond({ sections: JSON.stringify({ voice: {} }) });
    await settle();
    await h.runTimers();
  }
  assert.equal(h.fetches.length, 20);
  assert.match(h.els['se-voice-audio-status'].textContent, /taking longer than usual/);
  const h2 = editorHarness();
  h2.api.afterSave({ voice: { enabled: true, pending: true, audioFor: 'first' } }, { skipReload: true });
  h2.api.afterSave({ voice: { enabled: true, pending: true, audioFor: 'second' } }, { skipReload: true });
  h2.els['sqd-iframe'].src = 'marker';
  h2.fetches[0].respond({ sections: JSON.stringify({ voice: { audioUrl: 'https://x', audioFor: 'first' } }) });
  await settle();
  assert.equal(h2.els['sqd-iframe'].src, 'marker', 'the superseded wait does nothing');
  h2.fetches[1].respond({ sections: JSON.stringify({ voice: { audioUrl: 'https://y', audioFor: 'second' } }) });
  await settle();
  assert.notEqual(h2.els['sqd-iframe'].src, 'marker');
});

test('G. when Voice is off for the page the editor says no audio is generated', () => {
  const h = editorHarness();
  h.api.afterSave({ voice: { enabled: false, pending: false } }, { skipReload: true });
  assert.match(h.els['se-voice-audio-status'].textContent, /switched off/);
  assert.equal(h.fetches.length, 0);
});

// ── H. Enable Voice Welcome ────────────────────────────────────
const toggleApi = () => editorHarness().api;
async function servePage(slug) {
  const res = { statusCode: 200, body: '', setHeader() {}, status(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; } };
  await handleServeLP({ params: { slug }, query: { preview: '1' }, headers: {} }, res);
  return res.body;
}
const pageHasPlayer = (html) => html.includes('onclick="playAudio(this)"');
const pageChatUsable = (html) => { const m = html.match(/<div id="chat-input-area"[^>]*>/); return !!m && !/opacity|pointer-events|title=/.test(m[0]) && html.includes('id="chat-input"') && html.includes('onclick="sendChat()"'); };
// Publishes exactly as smart-editor.js does: the stored sections, with the
// Voice tab's fields merged in and the toggle applied.
async function publishFromEditor(slug, { enabled, language = 'en', customGreeting = {} }) {
  const ds = landingPages[slug] ? await reload(slug) : {};
  const mergedVoice = Object.assign({}, ds.voice || {}, { language, voiceKey: language === 'de' ? 'anna_de' : 'sarah', customText: '', customGreeting: Object.assign({}, customGreeting) });
  const vt = toggleApi().applyVoiceToggle(mergedVoice, ds, enabled);
  const sections = Object.assign({}, ds, { voice: mergedVoice, language });
  if (vt.settings) sections.settings = vt.settings;
  return save(slug, { sections });
}

test('H. the Voice tab has an Enable Voice Welcome switch, first in the tab, wired into load, render and publish', () => {
  const panel = smartEditor.slice(smartEditor.indexOf('data-se-panel="voice"'), smartEditor.indexOf('data-se-panel="buttons"'));
  const sw = panel.match(/<button id="se-voice-enabled"[^>]*>/)[0];
  assert.match(sw, /type="button" role="switch" aria-checked="true" aria-labelledby="se-voice-enabled-label" aria-describedby="se-voice-enabled-hint"/);
  assert.ok(panel.includes('<span id="se-voice-enabled-label" style="font-size:.82rem;color:#f0ece0;">Enable Voice Welcome</span>'));
  assert.ok(panel.indexOf('id="se-voice-enabled"') < panel.indexOf('id="se-voice-lang"'), 'the switch comes before Language');
  // the editor's own switch look: brand orange #ff5a1f, the QDS brand colour
  assert.match(sw, /border:1px solid rgba\(255,90,31,0\.4\);background:rgba\(255,90,31,0\.12\);color:#ff5a1f;/);
  assert.match(fs.readFileSync(path.join(PUB, 'qds', 'foundation', 'colors.css'), 'utf8'), /--qds-color-brand-primary: #ff5a1f;/);
  for (const hook of [
    "voice:{enabled:true,language:'de',voiceKey:'anna_de',customText:'',customGreeting:{}}",
    "SE.voice.enabled=window.QRAIVY_VOICE_GREETING?window.QRAIVY_VOICE_GREETING.isVoiceOn(sec):sv.enabled!==false;",
    "window.QRAIVY_VOICE_GREETING.paintToggle();window.QRAIVY_VOICE_GREETING.sync();",
    "var en=$('se-voice-enabled');if(en)en.addEventListener('click',function(){SE.voice.enabled=SE.voice.enabled===false;if(window.QRAIVY_VOICE_GREETING)window.QRAIVY_VOICE_GREETING.paintToggle();markDirty();});",
    "var _vt=window.QRAIVY_VOICE_GREETING?window.QRAIVY_VOICE_GREETING.applyVoiceToggle(mergedVoice,ds,SE.voice.enabled!==false):{voice:mergedVoice};",
    "if(_vt.settings)sections.settings=_vt.settings;",
  ]) assert.ok(smartEditor.includes(hook), hook.slice(0, 80));
});

test('H. the switch shows what the published page does today: on unless one of the three stored switches is off', () => {
  const api = toggleApi();
  for (const on of [undefined, null, {}, { voice: {} }, { voice: { enabled: true } }, { voice: { enabled: true, active: true }, settings: { voiceEnabled: true } }, { settings: { aiEnabled: false } }, { voice: 'junk', settings: 7 }]) assert.equal(api.isVoiceOn(on), true, JSON.stringify(on));
  for (const off of [{ voice: { enabled: false } }, { voice: { active: false } }, { settings: { voiceEnabled: false } }, { voice: { enabled: true }, settings: { voiceEnabled: false } }]) assert.equal(api.isVoiceOn(off), false, JSON.stringify(off));
  // and it agrees with the server and the renderer for every combination
  for (const enabled of [undefined, true, false]) for (const active of [undefined, true, false]) for (const voiceEnabled of [undefined, true, false]) {
    const sections = { voice: {}, settings: {} };
    if (enabled !== undefined) sections.voice.enabled = enabled;
    if (active !== undefined) sections.voice.active = active;
    if (voiceEnabled !== undefined) sections.settings.voiceEnabled = voiceEnabled;
    assert.equal(api.isVoiceOn(sections), voice.isVoiceEnabled(sections), JSON.stringify(sections));
  }
});

test('H. switching off writes only voice.enabled; switching on also lifts older "off" switches, and nothing else changes', () => {
  const api = toggleApi();
  const ds = { settings: { voiceEnabled: false, aiEnabled: true, pageActive: true }, hero: { title: 'x' } };
  // (results come from the editor script's own realm, so they are compared as plain data)
  const off = api.applyVoiceToggle({ active: true, title: 'T' }, ds, false);
  assert.deepEqual(JSON.parse(JSON.stringify(off)), { voice: { active: true, title: 'T', enabled: false } });
  const on = api.applyVoiceToggle({ active: false, title: 'T' }, ds, true);
  assert.deepEqual(JSON.parse(JSON.stringify(on)), { voice: { active: true, title: 'T', enabled: true }, settings: { voiceEnabled: true, aiEnabled: true, pageActive: true } });
  assert.equal(ds.settings.voiceEnabled, false, 'the loaded sections are not modified in place');
  // on, with nothing to lift: settings is left alone entirely
  for (const clean of [{}, { settings: { voiceEnabled: true } }, { settings: { aiEnabled: false } }, { settings: null }]) {
    assert.deepEqual(Object.keys(api.applyVoiceToggle({}, clean, true)), ['voice'], JSON.stringify(clean));
  }
  assert.equal(api.isVoiceOn({ voice: on.voice, settings: on.settings }), true);
});

test('H. the switch is painted from the state, in English and German, with a hint only when off', () => {
  for (const [uiLang, onText, offText, hintStart] of [['en', 'On', 'Off', 'Off: the audio player is hidden'], ['de', 'An', 'Aus', 'Aus: Der Audio-Player wird']]) {
    const h = editorHarness({ uiLang });
    const attrs = {};
    h.els['se-voice-enabled'] = { style: {}, textContent: '', setAttribute(k, v) { attrs[k] = v; } };
    h.els['se-voice-enabled-hint'] = { style: {}, textContent: '' };
    h.state.voice.enabled = true; h.api.paintToggle();
    assert.deepEqual([attrs['aria-checked'], h.els['se-voice-enabled'].textContent, h.els['se-voice-enabled'].style.color, h.els['se-voice-enabled-hint'].style.display], ['true', onText, '#ff5a1f', 'none']);
    h.state.voice.enabled = false; h.api.paintToggle();
    assert.deepEqual([attrs['aria-checked'], h.els['se-voice-enabled'].textContent, h.els['se-voice-enabled-hint'].style.display], ['false', offText, 'block']);
    assert.ok(h.els['se-voice-enabled-hint'].textContent.startsWith(hintStart));
    assert.notEqual(h.els['se-voice-enabled'].style.color, '#ff5a1f');
  }
});

test('H. Voice OFF: the player is hidden, no audio is generated, and the assistant is still there', async () => {
  reset();
  const slug = newSlug();
  const res = await publishFromEditor(slug, { enabled: false });
  assert.deepEqual([res.body.voice.enabled, res.body.voice.pending], [false, false]);
  assert.equal(tts.calls.length, 0, 'no text-to-speech call for a page whose Voice is off');
  const html = await servePage(slug);
  assert.ok(!pageHasPlayer(html));
  assert.ok(pageChatUsable(html), 'the assistant does not depend on the toggle');
  assert.equal((await reload(slug)).voice.enabled, false);
});

test('H. Voice ON: the selected language, its standard voice and the saved greeting are used', async () => {
  reset();
  const slug = newSlug();
  const res = await publishFromEditor(slug, { enabled: true, language: 'de', customGreeting: { en: 'English own words.', de: 'Eigene deutsche Worte.' } });
  assert.deepEqual([res.body.voice.enabled, res.body.voice.pending, res.body.voice.lang], [true, true, 'de']);
  assert.equal(tts.calls.length, 1);
  assert.deepEqual([tts.calls[0].voiceId, tts.calls[0].body.model_id, tts.calls[0].body.text], [STANDARD_VOICES.de.id, 'eleven_multilingual_v2', 'Eigene deutsche Worte.']);
  const html = await servePage(slug);
  assert.ok(pageHasPlayer(html) && pageChatUsable(html));
  assert.ok(html.includes(JSON.stringify((await reload(slug)).voice.audioUrl)));
});

test('H. off -> on with nothing changed brings the same audio back without a new call; a greeting changed while off is generated when switched on', async () => {
  reset();
  const slug = newSlug();
  await publishFromEditor(slug, { enabled: true, customGreeting: { en: 'First words.' } });
  const audio = (await reload(slug)).voice.audioUrl;
  await publishFromEditor(slug, { enabled: false, customGreeting: { en: 'First words.' } });
  assert.ok(!pageHasPlayer(await servePage(slug)));
  assert.equal((await reload(slug)).voice.audioUrl, audio, 'the stored audio is kept while Voice is off');
  const back = await publishFromEditor(slug, { enabled: true, customGreeting: { en: 'First words.' } });
  assert.equal(back.body.voice.pending, false);
  assert.ok(pageHasPlayer(await servePage(slug)));
  assert.equal(tts.calls.length, 1);
  // change the greeting while off: nothing is generated until it is switched on
  await publishFromEditor(slug, { enabled: false, customGreeting: { en: 'Second words.' } });
  assert.equal(tts.calls.length, 1);
  assert.deepEqual((await reload(slug)).voice.customGreeting, { en: 'Second words.' }, 'the text is saved even while off');
  const on = await publishFromEditor(slug, { enabled: true, customGreeting: { en: 'Second words.' } });
  assert.equal(on.body.voice.pending, true);
  assert.equal(tts.calls.length, 2);
  assert.equal(tts.calls[1].body.text, 'Second words.');
});

test('H. the toggle persists: after save and reload the editor shows the same state', async () => {
  reset();
  const api = toggleApi();
  const slug = newSlug();
  await publishFromEditor(slug, { enabled: false });
  assert.equal(api.isVoiceOn(await reload(slug)), false);
  await publishFromEditor(slug, { enabled: false });        // publishing again without touching it
  assert.equal(api.isVoiceOn(await reload(slug)), false);
  await publishFromEditor(slug, { enabled: true });
  assert.equal(api.isVoiceOn(await reload(slug)), true);
  // an unrelated save from a client that knows nothing about the toggle keeps it
  await publishFromEditor(slug, { enabled: false });
  await save(slug, { sections: { hero: { title: 'Casa Lumi' } } });
  assert.equal(api.isVoiceOn(await reload(slug)), false);
});

test('H. existing published pages are untouched: no flags means on, and publishing without touching the switch changes nothing', async () => {
  reset();
  const api = toggleApi();
  const slug = newSlug();
  putPage(slug, { sections: { language: 'en', voice: { voiceKey: 'sarah' }, hero: { title: 'Casa Lumi' } } });
  await voice.ensureVoiceAudio(slug);
  const before = await reload(slug);
  assert.equal(api.isVoiceOn(before), true);
  assert.ok(pageHasPlayer(await servePage(slug)));
  await publishFromEditor(slug, { enabled: api.isVoiceOn(before) });
  const after = await reload(slug);
  assert.equal(after.voice.audioUrl, before.voice.audioUrl);
  assert.equal(after.settings, undefined, 'no settings block is invented');
  assert.ok(pageHasPlayer(await servePage(slug)));
  assert.equal(tts.calls.length, 1);
});

test('H. a page switched off by an older editor shows Off, stays off when published as is, and On really turns it on', async () => {
  reset();
  const api = toggleApi();
  for (const legacy of [{ voice: { active: false }, settings: { voiceEnabled: true, aiEnabled: true } }, { voice: {}, settings: { voiceEnabled: false, aiEnabled: true, pageActive: true } }]) {
    const slug = newSlug();
    putPage(slug, { sections: Object.assign({ language: 'en' }, legacy) });
    const stored = await reload(slug);
    assert.equal(api.isVoiceOn(stored), false);
    await publishFromEditor(slug, { enabled: api.isVoiceOn(stored) });
    assert.ok(!pageHasPlayer(await servePage(slug)));
    assert.equal(tts.calls.length, 0);
    await publishFromEditor(slug, { enabled: true });
    const now = await reload(slug);
    assert.equal(api.isVoiceOn(now), true);
    assert.equal(now.settings.aiEnabled, true, 'other settings are kept');
    assert.ok(pageHasPlayer(await servePage(slug)), JSON.stringify(legacy));
    tts.calls = [];
  }
});

test('H. the assistant is the same on the published page whether Voice is on or off', async () => {
  reset();
  const slug = newSlug();
  await publishFromEditor(slug, { enabled: true });
  const on = await servePage(slug);
  await publishFromEditor(slug, { enabled: false });
  const off = await servePage(slug);
  const chat = (html) => html.slice(html.indexOf('<!-- AI CHAT -->'), html.indexOf('<!-- SMART PASS -->'));
  assert.ok(pageChatUsable(on) && pageChatUsable(off));
  assert.equal(chat(off), chat(on), 'the assistant\'s markup is identical in both states');
  assert.ok(pageHasPlayer(on) && !pageHasPlayer(off));
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  const jobLog = console.log;
  console.log = (...a) => { if (!String(a[0]).startsWith('[Voice]') && a[0] !== '') jobLog(...a); };
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${String(err.message).split('\n').slice(0, 6).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
