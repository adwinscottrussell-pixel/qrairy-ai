/**
 * studioImageUploadLimiter.js — how many Studio V3 images an account may
 * upload (Image Phase 1). The dealUploadLimiter.js pattern with its own
 * counts (Studio and Deals uploads never share or use up each other's quota):
 *
 *   40 uploads per rolling hour   (a full 24-image Gallery plus retries)
 *   120 uploads per rolling 24 hours
 *
 * Per signed-in account (req.userId from requireAuth, never anything the
 * client sends). Route: requireAuth -> requireVerifiedEmail -> page owner
 * -> THIS -> multer -> controller:
 *   - reserved synchronously BEFORE the body is read, so a refused request
 *     is answered 429 without its image being read or stored, and parallel
 *     requests cannot all pass on the last free slot
 *   - committed once the attempt is sent to Cloudinary (also when Cloudinary
 *     then fails)
 *   - released when the request ends before reaching Cloudinary (no file,
 *     wrong type, too large, storage not configured, client gone)
 *
 * Same caveat as dealUploadLimiter.js: in memory, per server process, lost on
 * restart; a brake on overuse, not a billing control.
 */
'use strict';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const STUDIO_UPLOAD_LIMITS = Object.freeze({ perHour: 40, perDay: 120 });

const byOwner = new Map();
let calls = 0;

function prune(userId, now) {
  const kept = (byOwner.get(userId) || []).filter((e) => now - e.at < DAY);
  if (kept.length) byOwner.set(userId, kept); else byOwner.delete(userId);
  return kept;
}
function sweep(now) { for (const id of [...byOwner.keys()]) prune(id, now); }

function reserveStudioUploadSlot(userId, now = Date.now()) {
  if (typeof userId !== 'string' || !userId) throw new Error('reserveStudioUploadSlot needs the signed-in user id');
  if (++calls % 500 === 0) sweep(now);
  const entries = prune(userId, now);
  const lastHour = entries.filter((e) => now - e.at < HOUR);
  const refuse = (window, limit, list, span) => ({
    ok: false, window, limit,
    retryAfterSeconds: Math.max(1, Math.ceil((list[list.length - limit].at + span - now) / 1000)),
  });
  if (lastHour.length >= STUDIO_UPLOAD_LIMITS.perHour) return refuse('hour', STUDIO_UPLOAD_LIMITS.perHour, lastHour, HOUR);
  if (entries.length >= STUDIO_UPLOAD_LIMITS.perDay) return refuse('day', STUDIO_UPLOAD_LIMITS.perDay, entries, DAY);
  const entry = { at: now, committed: false };
  entries.push(entry);
  byOwner.set(userId, entries);
  let done = false;
  return {
    ok: true,
    slot: {
      commit() { if (!done) { done = true; entry.committed = true; } },
      release() {
        if (done) return;
        done = true;
        const list = byOwner.get(userId);
        if (!list) return;
        const i = list.indexOf(entry);
        if (i !== -1) list.splice(i, 1);
        if (!list.length) byOwner.delete(userId);
      },
      get settled() { return done; },
    },
  };
}

function studioUploadUsage(userId, now = Date.now()) {
  const entries = (byOwner.get(userId) || []).filter((e) => now - e.at < DAY);
  return { lastHour: entries.filter((e) => now - e.at < HOUR).length, lastDay: entries.length };
}

function throttleStudioUploads() {
  return (req, res, next) => {
    if (typeof req.userId !== 'string' || !req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const r = reserveStudioUploadSlot(req.userId);
    if (!r.ok) {
      if (typeof res.set === 'function') { res.set('Retry-After', String(r.retryAfterSeconds)); res.set('Cache-Control', 'private, no-store'); }
      return res.status(429).json({
        error: 'upload_limit',
        message: r.window === 'hour'
          ? `You can upload up to ${r.limit} images per hour. Please try again later.`
          : `You can upload up to ${r.limit} images per day. Please try again later.`,
        window: r.window, limit: r.limit, retryAfter: r.retryAfterSeconds,
      });
    }
    req.studioUploadSlot = r.slot;
    const settle = () => { if (!r.slot.settled) r.slot.release(); };
    if (typeof res.on === 'function') { res.on('finish', settle); res.on('close', settle); }
    return next();
  };
}

function _resetStudioUploadLimiter() { byOwner.clear(); calls = 0; }

module.exports = { STUDIO_UPLOAD_LIMITS, reserveStudioUploadSlot, studioUploadUsage, throttleStudioUploads, _resetStudioUploadLimiter };
