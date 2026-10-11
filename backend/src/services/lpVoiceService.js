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
 *   server-controlled  audioUrl, audioFor, audioLang
 *
 * audioFor is a fingerprint of everything that determines a recording:
 * voice id, model, voice settings and the exact text. Audio is current
 * when audioFor equals the fingerprint of what should be spoken now.
 * That one comparison is the whole regeneration rule -- editing the
 * hero, a button or the theme never changes it, so those saves never
 * cost a text-to-speech call.
 * ─────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const { defaultGreeting, voiceLanguage, GREETING_MAX_LENGTH, VOICE_LANGUAGES } = require('../data/voiceGreetings');
const { standardVoice, synthesizeAndUploadVoice } = require('./voiceService');
const { patchLandingPageSections } = require('./lpSectionsPatch');
const { pageCache } = require('../utils/pageCache');

// Fields of sections.voice that only the server may set. A save never
// takes them from the request: the editor sends back whatever it loaded,
// which may be older than the audio generated since.
const SERVER_VOICE_FIELDS = ['audioUrl', 'audioFor', 'audioLang'];

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

// ── Generation ─────────────────────────────────────────────────
// One run per page at a time. A second request for the same page while a
// run is in flight does not start another text-to-speech call; it asks
// the running one to look again when it finishes, so the last saved
// greeting always wins and two saves in quick succession cost one call
// more at most, never two in parallel.
const inFlight = new Map(); // slug -> { again: boolean, promise }

async function generateOnce(slug) {
  const page = await prisma.landingPage.findUnique({ where: { slug } });
  if (!page) return { generated: false, reason: 'not_found' };
  const sections = parseSections(page);
  const greeting = effectiveGreeting(page, sections);
  if (!greeting.enabled) return { generated: false, reason: 'voice_off' };
  if (!greeting.text) return { generated: false, reason: 'no_text' };
  if (audioIsCurrent(sections, greeting)) return { generated: false, reason: 'current' };

  const audioUrl = await synthesizeAndUploadVoice({ slug, text: greeting.text, lang: greeting.lang });

  // Stored on top of whatever is saved NOW (see lpSectionsPatch.js), and
  // only if this recording is still the right one: if the owner changed
  // the greeting, the language, or switched Voice off while it was being
  // made, it is not attached -- the next run makes the right one.
  let stale = false;
  const saved = await patchLandingPageSections(slug, (fresh, freshPage) => {
    const now = effectiveGreeting(freshPage, fresh);
    if (!now.enabled || now.fingerprint !== greeting.fingerprint) { stale = true; return null; }
    fresh.voice = Object.assign({}, fresh.voice || {}, { audioUrl, audioFor: greeting.fingerprint, audioLang: greeting.lang });
    return fresh;
  });
  pageCache.delByPrefix('lp:' + slug);
  if (saved.applied) return { generated: true, audioUrl, fingerprint: greeting.fingerprint, lang: greeting.lang };
  return { generated: true, stored: false, reason: stale ? 'superseded' : saved.reason };
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
        result = await generateOnce(slug);
        if (result.generated && result.stored === false && result.reason === 'superseded') continue;
        if (!state.again) break;
      }
      if (result.generated && result.stored !== false) console.log('[Voice] Generated for', slug, '(' + result.lang + ')');
      else if (result.generated) console.error('[Voice] Generated but not stored for', slug, '(' + result.reason + ')');
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
  mergeVoiceOnSave,
  ensureVoiceAudio,
};
