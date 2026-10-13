/**
 * lpVoiceService.js — the welcome greeting of a Smart Landing Page.
 * ─────────────────────────────────────────────────────────────
 * Decides WHAT is spoken (the owner's own greeting for the page's voice
 * language, or the standard greeting for its industry), and makes sure
 * the stored audio is a recording of exactly that -- regenerating it
 * when, and only when, it is not.
 *
 * What lives in sections.voice:
 *   owner-controlled   enabled, title, description, voiceLanguage,
 *                      customGreeting { en?, de? }
 *   server-controlled  audioUrl, audioFor, audioLang      (published)
 *                      audioStale   the stored audio is known not to be a
 *                                   recording of the saved greeting; the
 *                                   page does not play it
 *                      audioError   why the last recording did not happen
 *                      previewUrl, previewFor, previewLang (latest preview)
 *                      previewCache { fingerprint: address } (recent previews)
 *
 * audioFor is a fingerprint of everything that determines a recording:
 * voice id, model, voice settings and the exact text. Audio is current
 * when audioFor equals the fingerprint of what should be spoken now.
 * That one comparison is the whole regeneration rule -- editing the
 * hero, a button or the theme never changes it, so those saves never
 * cost a text-to-speech call.
 *
 * Preview audio (the editor's "listen before publishing") is kept apart
 * from published audio: it is stored under preview*, never under audio*,
 * so nothing a visitor hears changes before Publish. Every recording is a
 * file named after its fingerprint, so a preview and the published audio
 * of the same greeting are the same file, and Publish adopts a matching
 * preview instead of paying for the recording a second time.
 * ─────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const { defaultGreeting, voiceLanguage, GREETING_MAX_LENGTH, VOICE_LANGUAGES } = require('../data/voiceGreetings');
const { standardVoice, synthesizeAndUploadVoice } = require('./voiceService');
const { patchLandingPageSections } = require('./lpSectionsPatch');
const { pageCache } = require('../utils/pageCache');
const { reserveRecording } = require('./stagingVoiceBudget');
const { takeSlot, peekSlot } = require('./voicePreviewLimiter');

// Fields of sections.voice that only the server may set. A save never
// takes them from the request: the editor sends back whatever it loaded,
// which may be older than the audio generated since.
const SERVER_VOICE_FIELDS = ['audioUrl', 'audioFor', 'audioLang', 'audioStale', 'audioError', 'previewUrl', 'previewFor', 'previewLang', 'previewCache'];
// How many recent preview recordings a page remembers for reuse.
const PREVIEW_CACHE_SIZE = 10;

function parseSections(page) {
  if (!page || !page.sections) return {};
  try {
    const s = typeof page.sections === 'string' ? JSON.parse(page.sections) : page.sections;
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  } catch (_) { return {}; }
}

// A greeting as it will be spoken: single spaces, trimmed, never longer
// than the limit. Returns '' for anything that is not usable text.
function cleanGreeting(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, GREETING_MAX_LENGTH).trim();
}

// The owner's custom greetings, reduced to { en?, de? } of usable text.
// Unknown languages and empty entries are dropped rather than stored.
function cleanCustomGreetings(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const lang of VOICE_LANGUAGES) {
    const text = cleanGreeting(value[lang]);
    if (text) out[lang] = text;
  }
  return out;
}

// Same switches the live renderer uses to show or hide the player.
function isVoiceEnabled(sections) {
  const voice = sections.voice || {};
  const settings = (sections.settings && typeof sections.settings === 'object') ? sections.settings : {};
  return voice.enabled !== false && voice.active !== false && settings.voiceEnabled !== false;
}

// The language the greeting is spoken in: the Voice tab's choice, else the
// page's own language, else English.
//
// The Voice tab of the editor in use (smart-editor.js) saves its choice as
// voice.language (and sets the page's language to the same value). An
// earlier editor saved voice.voiceLanguage; a page may still carry that
// from long ago, so it is only consulted when voice.language is absent --
// otherwise a stale value would outvote what the owner just picked.
function greetingLanguage(sections) {
  const voice = sections.voice || {};
  if (voice.language === 'en' || voice.language === 'de') return voice.language;
  if (voice.voiceLanguage === 'en' || voice.voiceLanguage === 'de') return voice.voiceLanguage;
  return voiceLanguage(sections.language);
}

function voiceFingerprint(voice, text) {
  return crypto.createHash('sha256')
    .update(JSON.stringify([voice.id, voice.model, voice.settings, text]))
    .digest('hex').slice(0, 32);
}

// Everything about the greeting this page should have right now.
function effectiveGreeting(page, sections = parseSections(page)) {
  const voice = sections.voice || {};
  const lang = greetingLanguage(sections);
  const custom = cleanCustomGreetings(voice.customGreeting);
  // voice.customText is the single-language field older code read; it is
  // honoured for the page's language when no per-language greeting exists.
  const legacy = cleanGreeting(voice.customText);
  const standard = cleanGreeting(defaultGreeting(page.useCase, lang, page.businessName || page.slug));
  const text = custom[lang] || legacy || standard;
  const speaker = standardVoice(lang);
  return {
    enabled: isVoiceEnabled(sections),
    lang,
    text,
    isCustom: !!(custom[lang] || legacy),
    standard,
    fingerprint: voiceFingerprint(speaker, text),
  };
}

function audioIsCurrent(sections, greeting) {
  const voice = sections.voice || {};
  return typeof voice.audioUrl === 'string' && !!voice.audioUrl && voice.audioFor === greeting.fingerprint;
}

// May a visitor hear the stored audio? Not while it is marked stale, and
// not when it carries a fingerprint that is no longer the page's greeting.
// Audio from before fingerprints existed (no audioFor) plays until a save
// marks it stale.
function audioIsPlayable(page, sections = parseSections(page)) {
  const voice = sections.voice || {};
  if (voice.audioStale) return false;
  if (typeof voice.audioFor === 'string' && voice.audioFor) return voice.audioFor === effectiveGreeting(page, sections).fingerprint;
  return true;
}

// Applied to the sections a save is about to store, for the page as it
// will be stored. If Voice is on and the stored audio is not a recording
// of the greeting being saved, the audio is marked stale IN THE SAME
// WRITE, so there is no moment in which the new greeting is paired with
// the old audio. This only ever sets the mark: it is removed in one place,
// when the right recording is attached (attachAudio). A note about an
// earlier failed recording is dropped, because every save tries again.
function flagVoiceOnSave(page, sections) {
  const voice = sections && sections.voice;
  if (!voice || typeof voice !== 'object' || Array.isArray(voice)) return sections;
  const next = Object.assign({}, voice);
  delete next.audioError;
  const greeting = effectiveGreeting(page, Object.assign({}, sections, { voice: next }));
  const hasAudio = typeof next.audioUrl === 'string' && !!next.audioUrl;
  if (greeting.enabled && hasAudio && next.audioFor !== greeting.fingerprint) next.audioStale = true;
  sections.voice = next;
  return sections;
}

// Applied when a page is saved. Returns the voice object to store:
//   - audio fields always come from what is already stored, never from
//     the request
//   - custom greetings are cleaned; a request that does not mention them
//     at all (an older editor tab, onboarding re-publishing) keeps the
//     stored ones instead of wiping them
function mergeVoiceOnSave(incomingVoice, existingVoice) {
  const existing = (existingVoice && typeof existingVoice === 'object') ? existingVoice : {};
  if (!incomingVoice || typeof incomingVoice !== 'object' || Array.isArray(incomingVoice)) {
    return Object.keys(existing).length ? existing : incomingVoice;
  }
  const merged = Object.assign({}, incomingVoice);
  for (const field of SERVER_VOICE_FIELDS) {
    if (existing[field] !== undefined) merged[field] = existing[field];
    else delete merged[field];
  }
  if (incomingVoice.customGreeting !== undefined) {
    const custom = cleanCustomGreetings(incomingVoice.customGreeting);
    if (Object.keys(custom).length) merged.customGreeting = custom; else delete merged.customGreeting;
  } else if (existing.customGreeting !== undefined) {
    merged.customGreeting = existing.customGreeting;
  }
  return merged;
}

// The greeting an owner is looking at in the editor, which may not be
// saved yet: the text in the field for the selected language, or the
// standard greeting of that language when the field is empty.
function previewGreeting(page, { language, text } = {}) {
  const lang = voiceLanguage(language);
  const standard = cleanGreeting(defaultGreeting(page.useCase, lang, page.businessName || page.slug));
  const spoken = cleanGreeting(text) || standard;
  return { lang, text: spoken, isCustom: spoken !== standard, standard, fingerprint: voiceFingerprint(standardVoice(lang), spoken) };
}

// A recording that already exists for this fingerprint, if any: the
// published audio, or the last preview.
function existingAudioFor(sections, fingerprint) {
  const voice = sections.voice || {};
  const usable = (url) => typeof url === 'string' && /^https:\/\//.test(url);
  if (usable(voice.audioUrl) && voice.audioFor === fingerprint) return { audioUrl: voice.audioUrl, source: 'published' };
  if (usable(voice.previewUrl) && voice.previewFor === fingerprint) return { audioUrl: voice.previewUrl, source: 'preview' };
  const cache = (voice.previewCache && typeof voice.previewCache === 'object' && !Array.isArray(voice.previewCache)) ? voice.previewCache : {};
  if (Object.prototype.hasOwnProperty.call(cache, fingerprint) && usable(cache[fingerprint])) return { audioUrl: cache[fingerprint], source: 'preview' };
  return null;
}

// ── Recording ──────────────────────────────────────────────────
// THE one place a text-to-speech call starts. Preview, Publish and the
// background jobs after a save all come through here, so the recording
// limits (voicePreviewLimiter) cannot be bypassed by choosing another way in.
//
// One call per recording at a time, whoever asks: two preview requests, or
// a preview and a Publish, for the same greeting of the same page share
// one call and one result. Joining a call that is already running, and
// getting a recording this process has already made, take no slot.
class RecordingLimitError extends Error {
  constructor(slot) {
    super('Recording limit reached (' + slot.scope + ').');
    this.name = 'RecordingLimitError'; this.code = 'RECORDING_LIMIT'; this.scope = slot.scope; this.retryAfter = slot.retryAfter;
  }
}
const recordings = new Map(); // slug + ':' + fingerprint -> promise of the audio address
// Recordings this process has made, by the same key. A file is named after
// its fingerprint and is never deleted, so its address stays valid: a
// recording that could not be attached to its page (the page kept changing,
// or the greeting changed and later changed back) is used again instead of
// being paid for twice.
const made = new Map();
const MADE_SIZE = 500;
function recordingInFlight(slug, fingerprint) { return recordings.has(slug + ':' + fingerprint); }
// Is a recording of this greeting available without a new call?
function recordingAtHand(slug, fingerprint) { return recordings.has(slug + ':' + fingerprint) || made.has(slug + ':' + fingerprint); }
// `userId` is the page's owner (null for a page without one). Throws a
// RecordingLimitError, before anything is called, when no slot is free.
function record(slug, greeting, { userId = null } = {}) {
  const key = slug + ':' + greeting.fingerprint;
  const running = recordings.get(key);
  if (running) return running;
  if (made.has(key)) return Promise.resolve(made.get(key));
  // Check and take in one synchronous step, immediately before the call is
  // registered: requests arriving together cannot share the last slot.
  const slot = takeSlot(slug, userId || null);
  if (!slot.ok) throw new RecordingLimitError(slot);
  // On staging one unit of the staging-wide ceiling is taken next, and no
  // call is made if that fails. In production this resolves immediately.
  const promise = Promise.resolve()
    .then(() => reserveRecording())
    .then(() => synthesizeAndUploadVoice({ slug, text: greeting.text, lang: greeting.lang, fingerprint: greeting.fingerprint }))
    .then((audioUrl) => {
      made.set(key, audioUrl);
      if (made.size > MADE_SIZE) made.delete(made.keys().next().value);
      return audioUrl;
    })
    .finally(() => { recordings.delete(key); });
  recordings.set(key, promise);
  return promise;
}
// Tests only.
function resetRecordings() { recordings.clear(); made.clear(); }

// ── Preview ────────────────────────────────────────────────────
// Which preview request is the newest for each page. A recording that
// finishes after a newer one was requested is still returned to whoever
// asked for it, but it is not stored as the page's preview: the newest
// request decides what the page's preview is.
const previewSeq = new Map(); // slug -> number
function stampPreviewRequest(slug) { const n = (previewSeq.get(slug) || 0) + 1; previewSeq.set(slug, n); return n; }

// Records the greeting for the editor and remembers it as the page's
// preview. Never touches audioUrl / audioFor. Throws if recording fails.
async function recordPreview(slug, greeting, { userId = null } = {}) {
  // Refused by the limits before it counts as the page's newest request.
  const recording = record(slug, greeting, { userId });
  const seq = stampPreviewRequest(slug);
  const audioUrl = await recording;
  const newest = previewSeq.get(slug) === seq;
  await patchLandingPageSections(slug, (fresh) => {
    const current = fresh.voice || {};
    // Every finished recording is remembered for reuse (the oldest drop
    // out); only the newest request becomes "the" preview.
    const old = (current.previewCache && typeof current.previewCache === 'object' && !Array.isArray(current.previewCache)) ? current.previewCache : {};
    const entries = Object.entries(old).filter(([k]) => k !== greeting.fingerprint).concat([[greeting.fingerprint, audioUrl]]).slice(-PREVIEW_CACHE_SIZE);
    const next = Object.assign({}, current, { previewCache: Object.fromEntries(entries) });
    if (newest) Object.assign(next, { previewUrl: audioUrl, previewFor: greeting.fingerprint, previewLang: greeting.lang });
    fresh.voice = next;
    return fresh;
  });
  return audioUrl;
}

// ── Generation ─────────────────────────────────────────────────
// One run per page at a time. A second request for the same page while a
// run is in flight does not start another text-to-speech call; it asks
// the running one to look again when it finishes, so the last saved
// greeting always wins and two saves in quick succession cost one call
// more at most, never two in parallel.
const inFlight = new Map(); // slug -> { again: boolean, promise }

// Attaches a recording to its page, and is the ONLY place the stale mark
// is removed. It is written on top of whatever is saved NOW (see
// lpSectionsPatch.js), and only if this recording is still the right one:
// the greeting is worked out again from the freshly read page and its
// fingerprint must equal the recording's. A job that finishes after a
// newer Publish (another greeting, another language, Voice switched off)
// therefore writes nothing at all -- it can neither attach its outdated
// audio nor remove the mark the newer save set.
//
// The write only succeeds if the page was not touched since it was read.
// A page that keeps changing (every visit touches it) is tried again here,
// with the recording already in hand: only the write is repeated, never
// the paid text-to-speech call.
const ATTACH_ROUNDS = 4;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function attachAudio(slug, greeting, audioUrl) {
  let superseded = false, saved = { applied: false, reason: 'conflict' };
  for (let round = 0; round < ATTACH_ROUNDS; round++) {
    if (round) await wait(40 * round);
    superseded = false;
    saved = await patchLandingPageSections(slug, (fresh, freshPage) => {
      const now = effectiveGreeting(freshPage, fresh);
      if (!now.enabled || now.fingerprint !== greeting.fingerprint) { superseded = true; return null; }
      const next = Object.assign({}, fresh.voice || {}, { audioUrl, audioFor: greeting.fingerprint, audioLang: greeting.lang });
      delete next.audioStale;
      delete next.audioError;
      fresh.voice = next;
      return fresh;
    });
    if (saved.applied || saved.reason !== 'conflict') break;
  }
  pageCache.delByPrefix('lp:' + slug);
  return { applied: !!saved.applied, reason: superseded ? 'superseded' : saved.reason };
}

// Notes on the page why its greeting has no recording, for the editor to
// show, and makes sure audio of another greeting is not played meanwhile.
// Guarded like attachAudio: only for the greeting that is saved now.
async function noteRecordingFailure(slug, greeting, failure) {
  try {
    await patchLandingPageSections(slug, (fresh, freshPage) => {
      const now = effectiveGreeting(freshPage, fresh);
      if (!now.enabled || now.fingerprint !== greeting.fingerprint || audioIsCurrent(fresh, now)) return null;
      const next = Object.assign({}, fresh.voice || {}, { audioError: Object.assign({ for: greeting.fingerprint, at: new Date().toISOString() }, failure) });
      if (typeof next.audioUrl === 'string' && next.audioUrl) next.audioStale = true;
      fresh.voice = next;
      return fresh;
    });
    pageCache.delByPrefix('lp:' + slug);
  } catch (_) { /* the page simply carries no note */ }
}

async function generateOnce(slug) {
  const page = await prisma.landingPage.findUnique({ where: { slug } });
  if (!page) return { generated: false, reason: 'not_found' };
  const sections = parseSections(page);
  const greeting = effectiveGreeting(page, sections);
  if (!greeting.enabled) return { generated: false, reason: 'voice_off' };
  if (!greeting.text) return { generated: false, reason: 'no_text' };
  const marks = sections.voice || {};
  if (audioIsCurrent(sections, greeting)) {
    if (!marks.audioStale && !marks.audioError) return { generated: false, reason: 'current' };
    // The right audio is attached but still marked (the greeting was changed
    // and changed back): the mark comes off through the guarded attachment.
    await attachAudio(slug, greeting, marks.audioUrl);
    return { generated: false, reason: 'current' };
  }

  // A preview of exactly this greeting was already recorded in the
  // editor: publish that recording instead of making it again.
  const reusable = existingAudioFor(sections, greeting.fingerprint);
  let audioUrl;
  if (reusable) audioUrl = reusable.audioUrl;
  else {
    try {
      audioUrl = await record(slug, greeting, { userId: page.userId || null });
    } catch (err) {
      if (err && err.code === 'RECORDING_LIMIT') {
        await noteRecordingFailure(slug, greeting, { code: 'limit', scope: err.scope, retryAfter: err.retryAfter });
        return { generated: false, reason: 'limit', scope: err.scope, retryAfter: err.retryAfter };
      }
      await noteRecordingFailure(slug, greeting, { code: err && err.code === 'STAGING_CEILING' ? 'staging_ceiling' : 'failed' });
      throw err;
    }
  }

  const saved = await attachAudio(slug, greeting, audioUrl);
  if (saved.applied) return { generated: true, reused: !!reusable, audioUrl, fingerprint: greeting.fingerprint, lang: greeting.lang };
  return { generated: true, reused: !!reusable, stored: false, reason: saved.reason };
}

// What a save can tell the editor straight away about the page's audio:
//   off      Voice is off, nothing is recorded
//   ready    the stored audio is a recording of the saved greeting
//   pending  a recording is on its way (or one that exists is being attached)
//   limited  no recording will be made now: a recording limit is reached
// Looks only; the slot itself is taken when the recording starts.
function publishVoiceStatus(page, sections = parseSections(page)) {
  const greeting = effectiveGreeting(page, sections);
  if (!greeting.enabled || !greeting.text) return { status: 'off' };
  if (audioIsCurrent(sections, greeting)) return { status: 'ready' };
  if (existingAudioFor(sections, greeting.fingerprint) || recordingAtHand(page.slug, greeting.fingerprint)) return { status: 'pending' };
  const slot = peekSlot(page.slug, page.userId || null);
  return slot.ok ? { status: 'pending' } : { status: 'limited', limit: { scope: slot.scope, retryAfter: slot.retryAfter } };
}

// Makes the page's audio match its greeting. Never throws: a failure is
// logged and the page simply keeps the audio it had.
function ensureVoiceAudio(slug) {
  const running = inFlight.get(slug);
  if (running) { running.again = true; return running.promise; }
  const state = { again: false, promise: null };
  state.promise = (async () => {
    let result = { generated: false, reason: 'not_run' };
    try {
      // "again" covers both a save that arrived mid-run and a recording
      // that was superseded; bounded so a page under constant edits cannot
      // loop here.
      for (let i = 0; i < 3; i++) {
        state.again = false;
        try {
          result = await generateOnce(slug);
        } catch (err) {
          // A recording that failed for a greeting saved earlier must not
          // leave a greeting saved meanwhile without its own attempt.
          if (!state.again || i === 2) throw err;
          console.error('[Voice] Error for', slug + ':', err && err.message);
          continue;
        }
        if (result.generated && result.stored === false && result.reason === 'superseded') continue;
        if (!state.again) break;
      }
      if (result.generated && result.stored !== false) console.log('[Voice] ' + (result.reused ? 'Published existing preview for' : 'Generated for'), slug, '(' + result.lang + ')');
      else if (result.generated) console.error('[Voice] Generated but not stored for', slug, '(' + result.reason + ')');
      else if (result.reason === 'limit') console.error('[Voice] Recording limit reached for', slug, '(' + result.scope + ')');
    } catch (err) {
      console.error('[Voice] Error for', slug + ':', err && err.message);
      result = { generated: false, reason: 'error', error: err && err.message };
    } finally {
      inFlight.delete(slug);
    }
    return result;
  })();
  inFlight.set(slug, state);
  return state.promise;
}

module.exports = {
  SERVER_VOICE_FIELDS,
  cleanGreeting,
  cleanCustomGreetings,
  isVoiceEnabled,
  greetingLanguage,
  voiceFingerprint,
  effectiveGreeting,
  audioIsCurrent,
  audioIsPlayable,
  flagVoiceOnSave,
  publishVoiceStatus,
  RecordingLimitError,
  resetRecordings,
  mergeVoiceOnSave,
  ensureVoiceAudio,
  parseSections,
  previewGreeting,
  existingAudioFor,
  recordingInFlight,
  recordPreview,
};
