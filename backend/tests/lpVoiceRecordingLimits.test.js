// ============================================================
// lpVoiceRecordingLimits.test.js — Smart Landing Page voice: what a
// recording may cost, and what visitors hear when there is none.
//
// Covers the recording limits at the one place a text-to-speech call
// starts (Preview, Publish, background jobs and pages created without a
// sign-in all draw on them), reuse that costs nothing, the stale mark
// that keeps audio of another greeting from being played, jobs that
// finish after a newer Publish, attaching a recording to a page that
// keeps changing, and what the editor is told.
//
// What is real here: the save handler, the preview endpoint, the page
// renderer, lpVoiceService, voiceService, the limiter, lpSectionsPatch
// and the editor's Voice script (run against a stand-in DOM). What is
// replaced: the database (in-memory, with real compare-and-swap
// semantics), the staging recording counter (a counter that can be made
// to refuse), and the two outside services at their network edge --
// https.request (ElevenLabs) and Cloudinary's upload_stream -- so every
// text-to-speech call is counted and none is ever made or paid for.
//
// No test framework dependency, same convention as the other voice tests.
// Run: node tests/lpVoiceRecordingLimits.test.js
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
  return { end() { tts.version += 1; setImmediate(() => cb(null, { secure_url: `https://res.cloudinary.com/test/video/upload/v${tts.version}/${opts.folder}/${opts.public_id}.mp3` })); } };
};
cloudinary.uploader.destroy = () => { throw new Error('no audio file is ever deleted'); };
process.env.ELEVENLABS_API_KEY = 'test-key';

// ── In-memory database ───────────────────────────────────────────
let landingPages = {};
let users = {};
let clock = 1700000000000;
let writes = [];          // every sections value written, in order
let conflicts = 0;        // how many guarded writes are still to lose against "another write"
const tickClock = () => new Date(clock += 1000);
const noteWrite = (slug) => { writes.push({ slug, voice: (JSON.parse(landingPages[slug].sections || '{}').voice) || {} }); };
const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug } }) { const r = landingPages[slug]; return r ? Object.assign({}, r) : null; },
    async findFirst() { return null; },
    async count({ where: { userId } }) { return Object.values(landingPages).filter((p) => p.userId === userId).length; },
    async upsert(args) {
      const slug = args.where.slug;
      const data = landingPages[slug] ? Object.assign({}, landingPages[slug], args.update) : Object.assign({ id: 'lp-' + slug }, args.create);
      landingPages[slug] = Object.assign(data, { slug, updatedAt: tickClock() });
      noteWrite(slug);
      return Object.assign({}, landingPages[slug]);
    },
    async update({ where: { slug }, data }) {
      landingPages[slug] = Object.assign({}, landingPages[slug], data.scanCount ? {} : data, { updatedAt: tickClock() });
      return Object.assign({}, landingPages[slug]);
    },
    async updateMany({ where, data }) {
      const row = landingPages[where.slug];
      // a visit (or any other write) landed since the job read the page
      if (conflicts > 0) { conflicts -= 1; if (row) row.updatedAt = tickClock(); return { count: 0 }; }
      if (!row || (where.updatedAt && row.updatedAt.getTime() !== where.updatedAt.getTime())) return { count: 0 };
      Object.assign(row, data, { updatedAt: tickClock() });
      noteWrite(where.slug);
      return { count: 1 };
    },
  },
  user: { async findUnique({ where: { id } }) { return users[id] || null; } },
  business: { async findUnique() { return null; } },
  businessLocation: { async findFirst() { return null; } },
  stampSettings: { async findUnique() { return null; } },
  async $transaction(fn) { return fn(mockPrisma); },
};
// The staging-wide recording counter: asked once per recording, and able to refuse.
const budget = { calls: 0, refuse: false };
const seed = (p, exports) => { require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
seed(resolve('src', 'utils', 'prismaClient.js'), mockPrisma);
seed(resolve('src', 'services', 'stagingVoiceBudget.js'), { reserveRecording: async () => { budget.calls += 1; if (budget.refuse) throw Object.assign(new Error('Staging recording ceiling reached'), { code: 'STAGING_CEILING' }); return null; } });
seed(resolve('src', 'services', 'emailService.js'), { sendWelcomeEmail: async () => ({}), sendCampaignEmail: async () => ({}) });
seed(resolve('src', 'services', 'customerIdentityService.js'), { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} });
seed(resolve('src', 'services', 'apnsService.js'), { pushUpdateToDevices: async () => ({}) });
seed(resolve('src', 'services', 'webPushService.js'), { sendWebPush: async () => ({}) });
seed(resolve('src', 'controllers', 'qrController.js'), { getUserFromToken: async (h) => (h && h.startsWith('Bearer ') ? h.slice(7) : null) });

const greetings = require('../src/data/voiceGreetings');
const { standardVoice } = require('../src/services/voiceService');
const voice = require('../src/services/lpVoiceService');
const limiter = require('../src/services/voicePreviewLimiter');
const { handleVoicePreview } = require('../src/controllers/lpVoiceController');
// The deleted-page address reservation (tests/slugReservation.test.js) is not under test here: no slug is reserved.
require.cache[require.resolve('../src/services/slugReservation')] = { loaded: true, exports: { retainedDataFor: async () => [] } };
const { handlePublishLP, handleGetLP, handleServeLP } = require('../src/controllers/lpController');

const realError = console.error;
const quiet = (on) => { console.error = on ? () => {} : realError; };

// ── Helpers ──────────────────────────────────────────────────────
const OWNER = 'user-owner', OTHER = 'user-other';
function reset() {
  landingPages = {}; users = { [OWNER]: { id: OWNER, plan: 'business', subscriptionStatus: 'active' }, [OTHER]: { id: OTHER, plan: 'business', subscriptionStatus: 'active' } };
  tts.calls = []; tts.fail = false; tts.gate = null;
  writes = []; conflicts = 0; budget.calls = 0; budget.refuse = false;
  limiter.resetPreviewLimits();
  voice.resetRecordings();
  quiet(false);
}
const settle = async () => { for (let i = 0; i < 16; i++) await new Promise((r) => setImmediate(r)); };
let slugSeq = 0;
const newSlug = () => 'lim-' + (++slugSeq);
function putPage(slug, { useCase = 'restaurant', businessName = 'Casa Lumi', sections = {}, userId = OWNER } = {}) {
  landingPages[slug] = { id: 'lp-' + slug, slug, businessName, useCase, userId, template: 'premium', status: 'live', sections: JSON.stringify(sections), createdAt: new Date(clock), updatedAt: tickClock() };
}
const voiceOf = (slug) => JSON.parse(landingPages[slug].sections).voice || {};
const mkRes = () => ({ statusCode: 200, body: undefined, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });
async function preview(slug, text, { user = OWNER, generate = true } = {}) {
  const res = mkRes();
  await handleVoicePreview({ params: { slug }, body: { language: 'en', text, generate }, userId: user, headers: {} }, res);
  return res;
}
// A Publish from the editor. `greeting` is the owner's own English greeting ('' = the standard one).
async function publish(slug, greeting, { owner = OWNER, extra = {}, wait = true } = {}) {
  const res = mkRes();
  const voiceSection = Object.assign({ language: 'en', customGreeting: greeting ? { en: greeting } : {} }, extra.voice || {});
  const body = Object.assign({ slug, businessName: 'Casa Lumi', useCase: 'restaurant', template: 'premium' }, extra.body || {}, { sections: Object.assign({ language: 'en' }, extra.sections || {}, { voice: voiceSection }) });
  await handlePublishLP({ body, headers: owner ? { authorization: 'Bearer ' + owner } : {} }, res);
  if (wait) await settle();
  return res;
}
async function servePage(slug) { const res = mkRes(); await handleServeLP({ params: { slug }, query: { preview: '1' }, headers: {} }, res); return res.body; }
const hasPlayer = async (slug) => (await servePage(slug)).includes('onclick="playAudio(this)"');
const fp = (text, lang = 'en') => voice.voiceFingerprint(standardVoice(lang), text);
const STD_EN = greetings.defaultGreeting('restaurant', 'en', 'Casa Lumi');
function gate() { let open; tts.gate = new Promise((r) => { open = r; }); return () => { open(); tts.gate = null; }; }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── A. One limiter for every way a recording can start ─────────
test('A. the limits are the agreed ones, and the limiter says they are per process', () => {
  assert.deepEqual(limiter.RECORDING_LIMITS, { perPagePerHour: 10, perOwnerPerHour: 20, perOwnerPerDay: 40, anonymousPerDay: 20, globalPerDay: 150 });
  const src = fs.readFileSync(resolve('src', 'services', 'voicePreviewLimiter.js'), 'utf8');
  assert.match(src, /IN-MEMORY/);
  assert.match(src, /per process, not a ceiling for the account/);
});

test('A. text-to-speech is called from exactly one place, and the slot is taken there before anything else', () => {
  const service = fs.readFileSync(resolve('src', 'services', 'lpVoiceService.js'), 'utf8');
  assert.equal((service.match(/synthesizeAndUploadVoice\(\{/g) || []).length, 1, 'one call site');
  assert.equal((service.match(/takeSlot\(/g) || []).length, 1, 'one place a slot is taken');
  const record = service.slice(service.indexOf('function record(slug, greeting'), service.indexOf('function resetRecordings'));
  const order = ['recordings.get(key)', 'made.has(key)', 'takeSlot(', 'reserveRecording()', 'synthesizeAndUploadVoice({'].map((s) => record.indexOf(s));
  assert.ok(order.every((n) => n !== -1) && order.every((n, i) => i === 0 || n > order[i - 1]), 'join / reuse, then the slot, then the staging counter, then the call: ' + order.join(','));
  // nothing outside the service can start a recording or take a slot itself
  for (const f of [['controllers', 'lpController.js'], ['controllers', 'lpVoiceController.js']]) {
    const src = fs.readFileSync(resolve('src', ...f), 'utf8');
    assert.ok(!/synthesizeAndUploadVoice|takeSlot\(|api\.elevenlabs/.test(src), f.join('/'));
  }
});

test('A. Preview and Publish draw on the same ten an hour for a page', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  for (let i = 1; i <= 6; i++) assert.equal((await preview(slug, 'Preview ' + i + '.')).statusCode, 200);
  for (let i = 1; i <= 4; i++) assert.equal((await publish(slug, 'Published ' + i + '.')).body.voice.status, 'pending');
  assert.equal(tts.calls.length, 10);
  assert.equal(voiceOf(slug).audioFor, fp('Published 4.'));
  // the eleventh, whichever way it comes
  const overPreview = await preview(slug, 'Preview 7.');
  assert.deepEqual([overPreview.statusCode, overPreview.body.code], [429, 'limit_page']);
  assert.ok(Number(overPreview.headers['Retry-After']) > 0);
  quiet(true);
  const overPublish = await publish(slug, 'Published 5.');
  quiet(false);
  assert.equal(overPublish.statusCode, 200, 'the page itself is saved');
  assert.deepEqual([overPublish.body.voice.status, overPublish.body.voice.limit.scope], ['limited', 'page']);
  assert.ok(overPublish.body.voice.limit.retryAfter > 0);
  assert.equal(tts.calls.length, 10, 'and neither made a call');
});

test('A. twenty an hour for one owner across pages, by Publish as well; another owner is not affected', async () => {
  reset();
  const pages = Array.from({ length: 5 }, () => { const s = newSlug(); putPage(s); return s; });
  for (let i = 0; i < 20; i++) assert.equal((await publish(pages[i % 4], 'Owner run ' + i + '.')).body.voice.status, 'pending', 'publish ' + i);
  assert.equal(tts.calls.length, 20);
  quiet(true);
  const over = await publish(pages[4], 'One too many.');
  quiet(false);
  assert.deepEqual([over.body.voice.status, over.body.voice.limit.scope, tts.calls.length], ['limited', 'owner', 20]);
  assert.deepEqual([(await preview(pages[4], 'By preview.')).body.code], ['limit_owner']);
  const theirs = newSlug(); putPage(theirs, { userId: OTHER });
  assert.equal((await publish(theirs, 'Mine.', { owner: OTHER })).body.voice.status, 'pending');
  assert.equal(tts.calls.length, 21);
});

test('A. the limiter itself: forty a day per owner, twenty a day anonymous, 150 a day in all', () => {
  limiter.resetPreviewLimits();
  const t0 = 1_800_000_000_000, MIN = 60 * 1000, HOUR = 60 * MIN;
  // owner: 10 an hour on fresh pages for four hours = 40, then the day is used up
  let taken = 0;
  for (let h = 0; h < 4; h++) for (let i = 0; i < 10; i++) taken += limiter.takeSlot('o-' + h + '-' + i, 'u1', t0 + h * 61 * MIN + i).ok ? 1 : 0;
  assert.equal(taken, 40);
  const day = limiter.takeSlot('o-fresh', 'u1', t0 + 5 * HOUR);
  assert.deepEqual([day.ok, day.scope], [false, 'owner']);
  assert.ok(day.retryAfter > 18 * 3600 && day.retryAfter <= 24 * 3600);
  assert.equal(limiter.takeSlot('o-fresh', 'u1', t0 + 24 * HOUR + 1).ok, true, 'the first of them has left the day');

  // anonymous: one allowance for all pages without an owner
  limiter.resetPreviewLimits();
  for (let i = 0; i < 20; i++) assert.equal(limiter.takeSlot('anon-' + i, null, t0 + i).ok, true);
  const anon = limiter.takeSlot('anon-20', null, t0 + 100);
  assert.deepEqual([anon.ok, anon.scope], [false, 'anonymous']);
  assert.equal(limiter.takeSlot('owned', 'u2', t0 + 100).ok, true, 'signed-in owners are not held up by it');
  assert.equal(limiter.takeSlot('anon-20', undefined, t0 + 24 * HOUR + 50).ok, true);

  // everything: 150 a day whoever asks
  limiter.resetPreviewLimits();
  for (let i = 0; i < 150; i++) assert.equal(limiter.takeSlot('g-' + i, 'owner-' + i, t0 + i).ok, true, 'recording ' + i);
  for (const who of ['a-new-owner', null]) {
    const no = limiter.takeSlot('g-new-' + who, who, t0 + 1000);
    assert.deepEqual([no.ok, no.scope], [false, 'global'], String(who));
  }
  assert.equal(limiter.takeSlot('g-new', 'a-new-owner', t0 + 24 * HOUR + 1).ok, true);
  limiter.resetPreviewLimits();
});

test('A. looking takes nothing; a refused request takes nothing either', () => {
  limiter.resetPreviewLimits();
  const t0 = 1_800_000_000_000;
  for (let i = 0; i < 50; i++) assert.deepEqual(limiter.peekSlot('peek', 'u', t0), { ok: true });
  for (let i = 0; i < 10; i++) limiter.takeSlot('peek', 'u', t0 + i);
  for (let i = 0; i < 50; i++) assert.equal(limiter.takeSlot('peek', 'u', t0 + 20).ok, false);
  assert.deepEqual([limiter.peekSlot('peek', 'u', t0 + 20).scope, limiter.peekSlot('other-page', 'u', t0 + 20).ok], ['page', true], 'fifty refusals did not use up the owner\'s allowance');
  limiter.resetPreviewLimits();
});

test('A. repeated Publish with a new text each time cannot get past the cap, however fast it comes', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  quiet(true);
  // all at once ...
  await Promise.all(Array.from({ length: 15 }, (_, i) => publish(slug, 'Burst ' + i + '.', { wait: false })));
  await settle(); await settle();
  // ... and then one after another
  for (let i = 0; i < 15; i++) await publish(slug, 'Then ' + i + '.');
  quiet(false);
  assert.ok(tts.calls.length <= 10, 'calls made: ' + tts.calls.length);
  assert.equal(limiter.remainingForPage(slug), 0);
  assert.equal(budget.calls, tts.calls.length);
});

test('A. two requests arriving together cannot share the last slot', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  for (let i = 1; i <= 9; i++) await preview(slug, 'Version ' + i + '.');
  const open = gate();
  const both = [preview(slug, 'Last slot, first.'), preview(slug, 'Last slot, second.')];
  await settle();
  open();
  const codes = (await Promise.all(both)).map((r) => r.statusCode).sort();
  assert.deepEqual(codes, [200, 429]);
  assert.equal(tts.calls.length, 10);
});

test('A. a recording that fails keeps its slot: a failing provider cannot be used to get more calls', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  tts.fail = true; quiet(true);
  for (let i = 1; i <= 10; i++) await publish(slug, 'Failing ' + i + '.');
  const over = await publish(slug, 'Failing 11.');
  quiet(false); tts.fail = false;
  assert.equal(tts.calls.length, 10);
  assert.equal(over.body.voice.status, 'limited');
  assert.equal((await preview(slug, 'And by preview.')).statusCode, 429);
});

// ── B. What already exists costs nothing ───────────────────────
test('B. publishing a greeting that was previewed uses that recording: no call, no slot', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const made = await preview(slug, 'Previewed words.');
  assert.equal(limiter.remainingForPage(slug), 9);
  const res = await publish(slug, 'Previewed words.');
  assert.equal(res.body.voice.status, 'pending', 'it only has to be attached');
  assert.deepEqual([tts.calls.length, limiter.remainingForPage(slug), budget.calls], [1, 9, 1]);
  assert.deepEqual([voiceOf(slug).audioUrl, voiceOf(slug).audioFor], [made.body.audioUrl, fp('Previewed words.')]);
  // asking again, checking only, and playing it back: still nothing
  await preview(slug, 'Previewed words.');
  await preview(slug, 'Something else entirely.', { generate: false });
  await publish(slug, 'Previewed words.');
  assert.deepEqual([tts.calls.length, limiter.remainingForPage(slug)], [1, 9]);
});

test('B. a preview and a Publish of the same greeting at the same moment share one call and one slot', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const open = gate();
  const asked = preview(slug, 'At the same moment.');
  await settle();
  const saved = publish(slug, 'At the same moment.', { wait: false });
  await settle();
  assert.equal(tts.calls.length, 1, 'one in flight');
  open();
  const [p] = await Promise.all([asked, saved]);
  await settle();
  assert.deepEqual([tts.calls.length, limiter.remainingForPage(slug), budget.calls], [1, 9, 1]);
  assert.equal(voiceOf(slug).audioUrl, p.body.audioUrl);
  assert.equal(voiceOf(slug).audioFor, fp('At the same moment.'));
});

test('B. a greeting changed and changed back gets the recording already made, not a second one', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, 'First words.');
  const first = voiceOf(slug).audioUrl;
  await publish(slug, 'Second words.');
  await publish(slug, 'First words.');
  assert.deepEqual(tts.calls.map((c) => c.body.text), ['First words.', 'Second words.']);
  assert.deepEqual([voiceOf(slug).audioUrl, voiceOf(slug).audioFor, limiter.remainingForPage(slug)], [first, fp('First words.'), 8]);
  assert.equal(await hasPlayer(slug), true);
});

test('B. saving anything else costs nothing: hero, buttons and theme never touch the recording', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, '');
  const before = voiceOf(slug);
  for (const sections of [{ hero: { title: 'New title' } }, { buttons: [{ type: 'website', url: 'https://example.com' }] }, { theme: { accentColor: '#123456' } }]) {
    const res = await publish(slug, '', { extra: { sections } });
    assert.equal(res.body.voice.status, 'ready');
  }
  assert.deepEqual([tts.calls.length, limiter.remainingForPage(slug)], [1, 9]);
  assert.deepEqual(voiceOf(slug), before, 'no mark, no note, the same audio');
  assert.equal(await hasPlayer(slug), true);
});

// ── C. Pages created without a sign-in ─────────────────────────
test('C. anonymous creation records from one shared allowance; when it is used up the page is still created, without audio', async () => {
  reset();
  for (let i = 0; i < 20; i++) {
    const slug = newSlug();
    const res = await publish(slug, '', { owner: null });
    assert.deepEqual([res.statusCode, res.body.ok, res.body.voice.status], [200, true, 'pending'], 'page ' + i);
    assert.equal(landingPages[slug].userId, null);
    assert.ok(voiceOf(slug).audioUrl, 'page ' + i + ' has its welcome audio');
  }
  assert.equal(tts.calls.length, 20);
  quiet(true);
  const slug = newSlug();
  const res = await publish(slug, '', { owner: null });
  quiet(false);
  assert.deepEqual([res.statusCode, res.body.ok, res.body.voice.status, res.body.voice.limit.scope], [200, true, 'limited', 'anonymous']);
  assert.equal(tts.calls.length, 20, 'no call');
  assert.ok(landingPages[slug], 'the page exists');
  assert.deepEqual([voiceOf(slug).audioUrl, voiceOf(slug).audioStale], [undefined, undefined], 'no audio, and nothing old that could be mistaken for it');
  assert.equal(await hasPlayer(slug), false);
  // a different greeting text does not open another way in
  quiet(true);
  assert.equal((await publish(newSlug(), 'My own anonymous words.', { owner: null })).body.voice.status, 'limited');
  quiet(false);
  assert.equal(tts.calls.length, 20);
  // signed-in owners are not held up by it
  const owned = newSlug(); putPage(owned);
  assert.equal((await publish(owned, 'An owner\'s words.')).body.voice.status, 'pending');
  assert.equal(tts.calls.length, 21);
});

// ── D. Audio of another greeting is never played ───────────────
test('D. a changed greeting marks the old audio stale in the save itself; the player returns with the new recording', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, 'The old greeting.');
  const old = voiceOf(slug);
  assert.equal(await hasPlayer(slug), true);
  writes = [];
  const open = gate();                                   // the new recording is held back
  const res = await publish(slug, 'The new greeting.');
  assert.equal(res.body.voice.status, 'pending');
  // the save's own write already carries the mark: there was no moment with the new text and playable old audio
  assert.deepEqual([writes[0].voice.customGreeting.en, writes[0].voice.audioStale, writes[0].voice.audioFor], ['The new greeting.', true, old.audioFor]);
  assert.deepEqual([voiceOf(slug).audioUrl, voiceOf(slug).audioStale], [old.audioUrl, true], 'the old recording is kept, not played');
  assert.equal(await hasPlayer(slug), false);
  open(); await settle();
  const now = voiceOf(slug);
  assert.deepEqual([now.audioFor, 'audioStale' in now, 'audioError' in now], [fp('The new greeting.'), false, false]);
  assert.notEqual(now.audioUrl, old.audioUrl);
  assert.equal(await hasPlayer(slug), true);
  assert.ok((await servePage(slug)).includes(JSON.stringify(now.audioUrl)));
});

test('D. when the limit stops the recording, the page says so and stays silent until a later Publish succeeds', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, 'The old greeting.');
  const old = voiceOf(slug);
  for (let i = 1; i <= 9; i++) await preview(slug, 'Trying ' + i + '.');
  quiet(true);
  const res = await publish(slug, 'One greeting too many.');
  quiet(false);
  assert.deepEqual([res.body.ok, res.body.voice.status, res.body.voice.limit.scope, res.body.voice.audioFor], [true, 'limited', 'page', fp('One greeting too many.')]);
  const v = voiceOf(slug);
  assert.equal(v.customGreeting.en, 'One greeting too many.', 'the greeting was saved');
  assert.deepEqual([v.audioUrl, v.audioFor, v.audioStale], [old.audioUrl, old.audioFor, true]);
  assert.deepEqual([v.audioError.code, v.audioError.scope, v.audioError.for], ['limit', 'page', fp('One greeting too many.')]);
  assert.ok(v.audioError.retryAfter > 0 && !Number.isNaN(Date.parse(v.audioError.at)));
  assert.equal(await hasPlayer(slug), false, 'the old audio is not played with the new greeting');
  assert.equal(tts.calls.length, 10);
  // later, with room again, the same Publish records it and everything is back
  limiter.resetPreviewLimits();
  assert.equal((await publish(slug, 'One greeting too many.')).body.voice.status, 'pending');
  const fixed = voiceOf(slug);
  assert.deepEqual([fixed.audioFor, 'audioStale' in fixed, 'audioError' in fixed], [fp('One greeting too many.'), false, false]);
  assert.equal(await hasPlayer(slug), true);
});

test('D. existing pages: audio from before fingerprints plays until the page is saved, and is replaced on that save', async () => {
  reset();
  const slug = newSlug();
  const legacy = { language: 'en', voice: { audioUrl: 'https://res.cloudinary.com/prod/video/upload/v1/qraivy-voices/voice-' + slug + '.mp3', voiceKey: 'sarah' } };
  putPage(slug, { sections: legacy });
  assert.equal(await hasPlayer(slug), true, 'untouched: plays as it always has');
  assert.equal(JSON.stringify(JSON.parse(landingPages[slug].sections)), JSON.stringify(legacy), 'looking at it changes nothing');
  await publish(slug, '', { extra: { voice: { voiceKey: 'sarah' } } });
  const v = voiceOf(slug);
  assert.deepEqual([tts.calls.length, tts.calls[0].body.text, v.audioFor, 'audioStale' in v], [1, STD_EN, fp(STD_EN), false]);
  assert.notEqual(v.audioUrl, legacy.voice.audioUrl);
  assert.equal(await hasPlayer(slug), true);
  await publish(slug, '', { extra: { voice: { voiceKey: 'sarah' } } });
  assert.equal(tts.calls.length, 1, 'once, then left alone');
});

test('D. audio whose fingerprint is not the page\'s greeting is not played, even without a mark', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, '');
  assert.equal(await hasPlayer(slug), true);
  // something other than a save changes what should be spoken (the name, here)
  landingPages[slug].businessName = 'Casa Luna'; landingPages[slug].updatedAt = tickClock();
  require('../src/utils/pageCache').pageCache.delByPrefix('lp:' + slug);
  assert.equal(voiceOf(slug).audioStale, undefined);
  assert.equal(voice.audioIsPlayable(landingPages[slug]), false);
  assert.equal(await hasPlayer(slug), false);
});

test('D. Voice off: no mark is set and nothing is recorded; switching it on again decides afresh', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, 'Spoken while on.');
  const off = await publish(slug, 'Written while off.', { extra: { voice: { enabled: false } } });
  assert.equal(off.body.voice.status, 'off');
  assert.deepEqual([voiceOf(slug).audioStale, tts.calls.length], [undefined, 1]);
  assert.equal(await hasPlayer(slug), false);
  const open = gate();
  await publish(slug, 'Written while off.', { extra: { voice: { enabled: true } } });
  assert.equal(voiceOf(slug).audioStale, true);
  open(); await settle();
  assert.deepEqual([voiceOf(slug).audioFor, 'audioStale' in voiceOf(slug), tts.calls.length], [fp('Written while off.'), false, 2]);
});

test('D. a request can neither set nor remove the mark, nor plant a failure note', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, '', { extra: { voice: { audioStale: true, audioError: { code: 'limit', for: 'x' } } } });
  assert.deepEqual(['audioStale' in voiceOf(slug), 'audioError' in voiceOf(slug)], [false, false]);
  assert.equal(await hasPlayer(slug), true);
  const open = gate();
  await publish(slug, 'Changed.', { extra: { voice: { audioStale: false } } });
  assert.equal(voiceOf(slug).audioStale, true, 'the request said false; the server knows better');
  open(); await settle();
  assert.ok(voice.SERVER_VOICE_FIELDS.includes('audioStale') && voice.SERVER_VOICE_FIELDS.includes('audioError'));
});

// ── E. Jobs that finish late ───────────────────────────────────
test('E. a recording that finishes after a newer Publish is not attached and does not remove the mark', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, 'Greeting A.');
  writes = [];
  const open = gate();
  await publish(slug, 'Greeting B.');                    // its recording is held back
  await publish(slug, 'Greeting C.');                    // a newer Publish while B is still being made
  assert.deepEqual([voiceOf(slug).customGreeting.en, voiceOf(slug).audioStale, voiceOf(slug).audioFor], ['Greeting C.', true, fp('Greeting A.')]);
  open(); await settle(); await settle();
  // Every write to the page, in order: B's recording never appears on it, and
  // the mark only ever comes off together with C's recording.
  assert.ok(writes.length >= 3);
  for (const w of writes) {
    assert.notEqual(w.voice.audioFor, fp('Greeting B.'), 'B\'s audio was never attached');
    if (!w.voice.audioStale) assert.equal(w.voice.audioFor, fp('Greeting C.'), 'the mark is only gone where the audio is C\'s');
  }
  const v = voiceOf(slug);
  assert.deepEqual([v.customGreeting.en, v.audioFor, 'audioStale' in v], ['Greeting C.', fp('Greeting C.'), false]);
  assert.deepEqual(tts.calls.map((c) => c.body.text), ['Greeting A.', 'Greeting B.', 'Greeting C.']);
  assert.equal(await hasPlayer(slug), true);
});

test('E. changed and changed back while the recording was running: the original audio is cleared for play again, through the guarded write', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, 'Greeting A.');
  const a = voiceOf(slug);
  writes = [];
  const open = gate();
  await publish(slug, 'Greeting B.');
  await publish(slug, 'Greeting A.');                    // back again before B is finished
  assert.equal(voiceOf(slug).audioStale, true, 'the save does not remove the mark by itself');
  open(); await settle(); await settle();
  const v = voiceOf(slug);
  assert.deepEqual([v.audioUrl, v.audioFor, 'audioStale' in v], [a.audioUrl, a.audioFor, false]);
  for (const w of writes) assert.notEqual(w.voice.audioFor, fp('Greeting B.'));
  assert.equal(await hasPlayer(slug), true);
});

test('E. Voice switched off while the recording was running: nothing is attached', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const open = gate();
  await publish(slug, 'Made while switching off.');
  await publish(slug, 'Made while switching off.', { extra: { voice: { enabled: false } } });
  open(); await settle(); await settle();
  assert.equal(voiceOf(slug).audioUrl, undefined);
  assert.equal(await hasPlayer(slug), false);
});

test('E. the mark is removed in one place only: the fingerprint-guarded attachment', () => {
  const service = fs.readFileSync(resolve('src', 'services', 'lpVoiceService.js'), 'utf8');
  assert.equal((service.match(/delete \w+\.audioStale/g) || []).length, 1);
  const attach = service.slice(service.indexOf('async function attachAudio('), service.indexOf('async function noteRecordingFailure('));
  assert.ok(attach.includes('delete next.audioStale;'));
  assert.ok(attach.indexOf('now.fingerprint !== greeting.fingerprint') < attach.indexOf('delete next.audioStale;'), 'after the fingerprint check');
  assert.ok(attach.includes('patchLandingPageSections(slug, (fresh, freshPage) => {'), 'inside the compare-and-swap write');
  const controller = fs.readFileSync(resolve('src', 'controllers', 'lpController.js'), 'utf8');
  assert.ok(!/delete [\w.]*audioStale|audioStale\s*=\s*false/.test(controller));
  // the save can set it, never clear it
  const sections = { voice: { language: 'en', audioUrl: 'https://res.cloudinary.com/test/a.mp3', audioFor: fp(STD_EN), audioStale: true } };
  voice.flagVoiceOnSave({ slug: 's', businessName: 'Casa Lumi', useCase: 'restaurant' }, sections);
  assert.equal(sections.voice.audioStale, true, 'matching audio, mark left for the attachment to remove');
});

// ── F. A page that keeps changing ──────────────────────────────
test('F. attaching is tried again when the page was touched in between, without recording again', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en', voice: { language: 'en' } } });
  conflicts = 7;                                          // more than one round of the guarded write absorbs
  const r = await voice.ensureVoiceAudio(slug);
  assert.deepEqual([r.generated, r.stored, tts.calls.length], [true, undefined, 1]);
  assert.equal(voiceOf(slug).audioFor, fp(STD_EN));
});

test('F. if it cannot be attached at all, the recording is kept and used by the next run: paid for once', async () => {
  reset();
  const slug = newSlug(); putPage(slug, { sections: { language: 'en', voice: { language: 'en' } } });
  conflicts = Infinity; quiet(true);
  const lost = await voice.ensureVoiceAudio(slug);
  quiet(false);
  assert.deepEqual([lost.generated, lost.stored, lost.reason, tts.calls.length], [true, false, 'conflict', 1]);
  assert.equal(voiceOf(slug).audioUrl, undefined, 'the page is exactly as its owner saved it');
  conflicts = 0;
  const again = await voice.ensureVoiceAudio(slug);
  assert.equal(again.generated, true);
  assert.deepEqual([tts.calls.length, limiter.remainingForPage(slug), budget.calls], [1, 9, 1], 'no second call, no second slot');
  assert.deepEqual([voiceOf(slug).audioFor, voiceOf(slug).audioUrl], [fp(STD_EN), again.audioUrl]);
  // the same goes for a preview of that greeting
  const p = await preview(slug, STD_EN);
  assert.deepEqual([p.body.audioUrl, tts.calls.length], [again.audioUrl, 1]);
});

// ── G. What the editor is told ─────────────────────────────────
test('G. the answer to a save names the state of the audio: off, ready, pending or limited', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  const first = await publish(slug, 'Status words.');
  assert.deepEqual([first.body.voice.status, first.body.voice.pending, first.body.voice.limit], ['pending', true, undefined]);
  const same = await publish(slug, 'Status words.');
  assert.deepEqual([same.body.voice.status, same.body.voice.pending], ['ready', false]);
  const off = await publish(slug, 'Status words.', { extra: { voice: { enabled: false } } });
  assert.deepEqual([off.body.voice.status, off.body.voice.enabled], ['off', false]);
  for (const key of ['enabled', 'lang', 'isCustom', 'audioFor', 'pending']) assert.ok(key in first.body.voice, key + ' is still there for the editor');
});

test('G. a recording that fails is noted on the page for the editor, and the next save tries again', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, 'Before the failure.');
  tts.fail = true; quiet(true);
  const res = await publish(slug, 'This one fails.');
  quiet(false); tts.fail = false;
  assert.equal(res.body.voice.status, 'pending', 'nothing was known to be wrong when the save was answered');
  const read = mkRes(); await handleGetLP({ params: { slug }, headers: { authorization: 'Bearer ' + OWNER } }, read);   // Phase 0 (S4): owner only
  const seen = JSON.parse(read.body.sections).voice;
  assert.deepEqual([seen.audioError.code, seen.audioError.for, seen.audioStale], ['failed', res.body.voice.audioFor, true]);
  assert.equal(await hasPlayer(slug), false);
  writes = [];
  const open = gate();
  await publish(slug, 'This one fails.');
  assert.equal('audioError' in writes[0].voice, false, 'the note is dropped by the save that tries again');
  open(); await settle();
  assert.deepEqual([voiceOf(slug).audioFor, 'audioError' in voiceOf(slug), 'audioStale' in voiceOf(slug)], [fp('This one fails.'), false, false]);
});

test('G. a failure note is only written for the greeting that is saved now', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  tts.fail = true; quiet(true);
  const open = gate();
  await publish(slug, 'Fails slowly.');
  tts.fail = false;
  await publish(slug, 'Saved meanwhile.');               // newer greeting while the failing call is out
  open(); await settle(); await settle();
  quiet(false);
  const v = voiceOf(slug);
  assert.deepEqual([v.audioFor, 'audioError' in v], [fp('Saved meanwhile.'), false], 'the older job\'s failure is not pinned on the newer greeting');
  assert.deepEqual(writes.filter((w) => w.voice.audioError).length, 0, 'not even for a moment');
  assert.deepEqual(tts.calls.map((c) => c.body.text), ['Fails slowly.', 'Saved meanwhile.'], 'and the newer greeting got its own attempt');
});

test('D. existing pages: if that first save cannot record, the old audio is marked and not played with the saved greeting', async () => {
  reset();
  const slug = newSlug();
  const legacyUrl = 'https://res.cloudinary.com/prod/video/upload/v1/qraivy-voices/voice-' + slug + '.mp3';
  putPage(slug, { sections: { language: 'en', voice: { audioUrl: legacyUrl } } });
  for (let i = 1; i <= 10; i++) await preview(slug, 'Used up ' + i + '.');
  assert.equal(await hasPlayer(slug), true, 'previews change nothing a visitor hears');
  quiet(true);
  const res = await publish(slug, '');
  quiet(false);
  assert.equal(res.body.voice.status, 'limited');
  const v = voiceOf(slug);
  assert.deepEqual([v.audioUrl, v.audioFor, v.audioStale, v.audioError.code], [legacyUrl, undefined, true, 'limit'], 'kept, without a fingerprint, and marked');
  assert.equal(voice.audioIsPlayable(landingPages[slug]), false);
  assert.equal(await hasPlayer(slug), false);
});

// The editor's own script, run against a stand-in DOM.
function editorHarness({ uiLang = 'en' } = {}) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, value: '', textContent: '', style: {}, listeners: {}, addEventListener(ev, fn) { this.listeners[ev] = fn; } });
  for (const id of ['se-voice-greeting', 'se-voice-greeting-count', 'se-voice-greeting-status', 'se-voice-greeting-reset', 'se-voice-audio-status', 'sqd-iframe']) el(id);
  const timers = [], fetches = [];
  const state = { slug: 'casa-lumi-ab1', voice: { language: 'en', voiceKey: 'sarah', customText: '', customGreeting: {} }, _db: { useCase: 'restaurant', businessName: 'Casa Lumi' } };
  const ctx = {
    window: { SmartEditor: { state }, _qraivyLang: uiLang, location: { hostname: 'www.qraivy.com', href: 'https://www.qraivy.com/smart-qr-detail.html' } },
    document: { getElementById: (id) => els[id] || null },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    Date, JSON, encodeURIComponent,
    fetch: (url) => { let resolveFn; const p = new Promise((r) => { resolveFn = r; }); fetches.push({ url, respond: (page) => resolveFn({ ok: true, json: async () => page }) }); return p; },
  };
  for (const f of ['staging-config.js', 'lp-routing.js', 'voice-greetings.js', 'voice-greeting-editor.js']) vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', f), 'utf8'), ctx);
  const api = ctx.window.QRAIVY_VOICE_GREETING;
  api.adopt({}); api.bind(() => {}); api.sync();
  return { api, els, timers, fetches, status: els['se-voice-audio-status'], async runTimers() { const due = timers.splice(0); due.forEach((fn) => fn()); await settle(); } };
}
const pageWith = (voiceSection) => ({ sections: JSON.stringify({ voice: voiceSection }) });

test('G. editor: told "limited", it says so at once and does not wait for audio that will not come', async () => {
  const h = editorHarness();
  h.api.afterSave({ ok: true, voice: { enabled: true, pending: true, audioFor: 'x', status: 'limited', limit: { scope: 'page', retryAfter: 600 } } }, { skipReload: true });
  assert.match(h.status.textContent, /^Published\. The welcome audio was not updated: the recording limit is reached\./);
  assert.match(h.status.textContent, /Visitors see no audio player until it is updated/);
  assert.deepEqual([h.status.style.display, h.status.style.color, h.fetches.length, h.timers.length], ['block', '#f87171', 0, 0]);
  const de = editorHarness({ uiLang: 'de' });
  de.api.afterSave({ ok: true, voice: { enabled: true, pending: true, audioFor: 'x', status: 'limited' } }, { skipReload: true });
  assert.match(de.status.textContent, /^Veröffentlicht\. Die Willkommens-Audiodatei wurde nicht aktualisiert: Das Aufnahme-Limit ist erreicht\./);
});

test('G. editor: while waiting, a failure noted on the page ends the wait with a plain message', async () => {
  for (const [code, expected] of [['failed', /The welcome audio could not be recorded\./], ['staging_ceiling', /The welcome audio could not be recorded\./], ['limit', /the recording limit is reached/]]) {
    const h = editorHarness();
    h.api.afterSave({ ok: true, voice: { enabled: true, pending: true, audioFor: 'new-print', status: 'pending' } }, { skipReload: true });
    assert.equal(h.status.textContent, 'Welcome audio is being updated…');
    await settle();   // Phase 0 (S4): the page is read with the sign-in, which is fetched first
    // a note about some other greeting is not this one's
    h.fetches[0].respond(pageWith({ audioUrl: 'https://old', audioFor: 'old-print', audioStale: true, audioError: { code, for: 'another-print' } }));
    await settle();
    assert.equal(h.status.textContent, 'Welcome audio is being updated…');
    await h.runTimers();
    h.fetches[1].respond(pageWith({ audioUrl: 'https://old', audioFor: 'old-print', audioStale: true, audioError: { code, for: 'new-print' } }));
    await settle();
    assert.match(h.status.textContent, expected, code);
    assert.deepEqual([h.status.style.color, h.timers.length], ['#f87171', 0], 'and it stops asking');
  }
});

test('G. editor: an answer without the new status still works as before', async () => {
  const h = editorHarness();
  h.api.afterSave({ ok: true, voice: { enabled: true, pending: true, audioFor: 'new-print' } }, { skipReload: true });
  assert.equal(h.status.textContent, 'Welcome audio is being updated…');
  await settle();   // Phase 0 (S4): the page is read with the sign-in, which is fetched first
  h.fetches[0].respond(pageWith({ audioUrl: 'https://new', audioFor: 'new-print' }));
  await settle();
  assert.equal(h.status.textContent, 'Welcome audio updated ✓');
});

// ── H. The staging ceiling is still there, behind the limits ───
test('H. every recording still asks the staging counter once; a request the limits refuse never reaches it', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  for (let i = 1; i <= 10; i++) await preview(slug, 'Counted ' + i + '.');
  assert.deepEqual([budget.calls, tts.calls.length], [10, 10]);
  quiet(true);
  await preview(slug, 'Refused by the limits.');
  await publish(slug, 'Refused by the limits as well.');
  quiet(false);
  assert.deepEqual([budget.calls, tts.calls.length], [10, 10], 'no staging unit is spent on a request that makes no recording');
});

test('H. when the staging ceiling refuses, no call is made and the editor is told, by Preview and by Publish', async () => {
  reset();
  const slug = newSlug(); putPage(slug);
  await publish(slug, 'Before the ceiling.');
  budget.refuse = true; quiet(true);
  const p = await preview(slug, 'Over the ceiling.');
  assert.deepEqual([p.statusCode, p.body.code], [429, 'staging_ceiling']);
  await publish(slug, 'Over the ceiling too.');
  quiet(false);
  assert.equal(tts.calls.length, 1, 'only the one before');
  const v = voiceOf(slug);
  assert.deepEqual([v.audioError.code, v.audioStale, v.audioFor], ['staging_ceiling', true, fp('Before the ceiling.')]);
  assert.equal(await hasPlayer(slug), false);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  const jobLog = console.log;
  console.log = (...a) => { if (!String(a[0]).startsWith('[Voice]') && a[0] !== '') jobLog(...a); };
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; quiet(false); console.log(`FAIL  ${name}`); console.log(`      ${String(err.message).split('\n').slice(0, 10).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
