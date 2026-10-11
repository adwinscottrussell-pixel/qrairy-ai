/**
 * voicePreviewLimiter.js — how often preview audio may be recorded.
 * ─────────────────────────────────────────────────────────────
 * Every recording is a paid text-to-speech call, so the editor's
 * "Generate preview" is capped per page and per owner.
 *
 * TEMPORARY, IN-MEMORY, NOT PRODUCTION-GRADE COST PROTECTION:
 *   - counts live in this process only: they are lost on every restart
 *     or deploy, and are not shared between instances
 *   - they are a brake on accidental or casual overuse, not a billing
 *     control; a durable limit needs to be stored in the database
 *
 * A slot is taken BEFORE the recording starts and is not given back if
 * the recording fails, so neither parallel requests nor a failing
 * provider can be used to get more calls than the caps allow.
 * ─────────────────────────────────────────────────────────────
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const PREVIEW_LIMITS = {
  perPagePerHour: 10,
  perOwnerPerHour: 30,
  perOwnerPerDay: 100,
};

const byPage = new Map();  // slug   -> timestamps of recordings started
const byOwner = new Map(); // userId -> timestamps of recordings started

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
  return Math.max(0, PREVIEW_LIMITS.perPagePerHour - recent(byPage, slug, now, HOUR).length);
}

// Takes one slot, or says why not. Synchronous on purpose: check and take
// happen in one step, so two requests arriving together cannot both pass
// on the last free slot.
function takeSlot(slug, userId, now = Date.now()) {
  const page = recent(byPage, slug, now, HOUR);
  if (page.length >= PREVIEW_LIMITS.perPagePerHour) {
    return { ok: false, scope: 'page', retryAfter: retryAfterSeconds(page, now, HOUR) };
  }
  const ownerDay = recent(byOwner, userId, now, DAY);
  const ownerHour = ownerDay.filter((t) => now - t < HOUR);
  if (ownerHour.length >= PREVIEW_LIMITS.perOwnerPerHour) {
    return { ok: false, scope: 'owner', retryAfter: retryAfterSeconds(ownerHour, now, HOUR) };
  }
  if (ownerDay.length >= PREVIEW_LIMITS.perOwnerPerDay) {
    return { ok: false, scope: 'owner', retryAfter: retryAfterSeconds(ownerDay, now, DAY) };
  }
  byPage.set(slug, page.concat(now));
  byOwner.set(userId, ownerDay.concat(now));
  return { ok: true, remaining: PREVIEW_LIMITS.perPagePerHour - page.length - 1 };
}

// Tests only.
function resetPreviewLimits() { byPage.clear(); byOwner.clear(); }

module.exports = { PREVIEW_LIMITS, takeSlot, remainingForPage, resetPreviewLimits };
