/**
 * voicePreviewLimiter.js — how often welcome audio may be recorded.
 * ─────────────────────────────────────────────────────────────
 * Every recording is a paid text-to-speech call. This is the one limiter
 * for all of them: the editor's "Generate preview", Publish, the
 * background jobs that follow a save, and pages created without a
 * sign-in. It is asked at the single place a recording starts
 * (lpVoiceService.record), so no caller can go around it.
 *
 *   per page       10 an hour
 *   per owner      20 an hour, 40 a day     (all pages of one account)
 *   anonymous      20 a day                 (all pages without an owner, together)
 *   everything    150 a day                 (every recording this process makes)
 *
 * TEMPORARY, IN-MEMORY, NOT PRODUCTION-GRADE COST PROTECTION:
 *   - counts live in this process only: they are lost on every restart
 *     or deploy, and are not shared between instances. "150 a day" is
 *     therefore per process, not a ceiling for the account
 *   - they are a brake on accidental or casual overuse, not a billing
 *     control; a durable limit needs to be stored in the database. The
 *     account-wide stop is the credit limit on the text-to-speech key
 *
 * A slot is taken BEFORE the recording starts and is not given back if
 * the recording fails, so neither parallel requests nor a failing
 * provider can be used to get more calls than the caps allow.
 * ─────────────────────────────────────────────────────────────
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const RECORDING_LIMITS = {
  perPagePerHour: 10,
  perOwnerPerHour: 20,
  perOwnerPerDay: 40,
  anonymousPerDay: 20,
  globalPerDay: 150,
};

const byPage = new Map();  // slug   -> timestamps of recordings started
const byOwner = new Map(); // userId -> timestamps of recordings started
let anonymous = [];        // recordings started for pages without an owner
let everything = [];       // every recording started

function recent(map, key, now, windowMs) {
  const kept = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (kept.length) map.set(key, kept); else map.delete(key);
  return kept;
}

function retryAfterSeconds(stamps, now, windowMs) {
  return Math.max(1, Math.ceil((stamps[0] + windowMs - now) / 1000));
}

// How many recordings this page may still start within the hour.
function remainingForPage(slug, now = Date.now()) {
  return Math.max(0, RECORDING_LIMITS.perPagePerHour - recent(byPage, slug, now, HOUR).length);
}

// Looks at every cap that applies. `userId` is the page's owner; a page
// without one counts against the shared anonymous allowance instead.
function look(slug, userId, now) {
  const page = recent(byPage, slug, now, HOUR);
  if (page.length >= RECORDING_LIMITS.perPagePerHour) {
    return { ok: false, scope: 'page', retryAfter: retryAfterSeconds(page, now, HOUR) };
  }
  let ownerDay = null;
  if (userId) {
    ownerDay = recent(byOwner, userId, now, DAY);
    const ownerHour = ownerDay.filter((t) => now - t < HOUR);
    if (ownerHour.length >= RECORDING_LIMITS.perOwnerPerHour) {
      return { ok: false, scope: 'owner', retryAfter: retryAfterSeconds(ownerHour, now, HOUR) };
    }
    if (ownerDay.length >= RECORDING_LIMITS.perOwnerPerDay) {
      return { ok: false, scope: 'owner', retryAfter: retryAfterSeconds(ownerDay, now, DAY) };
    }
  } else {
    anonymous = anonymous.filter((t) => now - t < DAY);
    if (anonymous.length >= RECORDING_LIMITS.anonymousPerDay) {
      return { ok: false, scope: 'anonymous', retryAfter: retryAfterSeconds(anonymous, now, DAY) };
    }
  }
  everything = everything.filter((t) => now - t < DAY);
  if (everything.length >= RECORDING_LIMITS.globalPerDay) {
    return { ok: false, scope: 'global', retryAfter: retryAfterSeconds(everything, now, DAY) };
  }
  return { ok: true, page, ownerDay };
}

// Would a recording be allowed right now? Takes nothing.
function peekSlot(slug, userId, now = Date.now()) {
  const seen = look(slug, userId, now);
  return seen.ok ? { ok: true } : seen;
}

// Takes one slot, or says why not. Synchronous on purpose: check and take
// happen in one step, so two requests arriving together cannot both pass
// on the last free slot.
function takeSlot(slug, userId, now = Date.now()) {
  const seen = look(slug, userId, now);
  if (!seen.ok) return seen;
  byPage.set(slug, seen.page.concat(now));
  if (userId) byOwner.set(userId, seen.ownerDay.concat(now)); else anonymous.push(now);
  everything.push(now);
  return { ok: true, remaining: RECORDING_LIMITS.perPagePerHour - seen.page.length - 1 };
}

// Tests only.
function resetPreviewLimits() { byPage.clear(); byOwner.clear(); anonymous = []; everything = []; }

module.exports = { RECORDING_LIMITS, PREVIEW_LIMITS: RECORDING_LIMITS, takeSlot, peekSlot, remainingForPage, resetPreviewLimits };
