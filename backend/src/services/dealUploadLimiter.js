/**
 * dealUploadLimiter.js — how many Deal images an account may upload.
 * ─────────────────────────────────────────────────────────────
 * Every attempt that reaches Cloudinary costs a call (a stored upload is an
 * uncropped master plus a 4:3 eager crop). Per signed-in account (req.userId from requireAuth,
 * never anything the client sends), for every plan and for pilots alike:
 *
 *   20 uploads per rolling hour
 *   60 uploads per rolling 24 hours
 *
 * How a slot is used (route: requireAuth -> dealAccess -> THIS -> multer
 * -> controller):
 *   - reserved synchronously BEFORE multer reads the body, so a refused
 *     request is answered 429 without its image being read or stored, and
 *     parallel requests cannot all pass on the last free slot (a pending
 *     reservation counts like a used upload)
 *   - kept ("committed") as soon as the attempt is sent to Cloudinary --
 *     also when Cloudinary then fails, so broken files cannot be retried
 *     against the storage provider without limit
 *   - released when the request ends before reaching Cloudinary: refused
 *     by a later check (not the owner, no file, wrong type, too large,
 *     storage not configured) or the client going away first -- such
 *     requests never consume quota
 *
 * TEMPORARY, IN-MEMORY, NOT PRODUCTION-GRADE COST PROTECTION:
 *   - counts live in this server process only: they are lost on every
 *     restart or deploy, and are not shared between instances. With N
 *     instances an account can upload up to N times the limits.
 *   - it is a brake on accidental or casual overuse, not a billing
 *     control; a durable limit needs to be stored in the database.
 * Same pattern and the same caveats as services/voicePreviewLimiter.js.
 * ─────────────────────────────────────────────────────────────
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DEAL_UPLOAD_LIMITS = Object.freeze({ perHour: 20, perDay: 60 });

// userId -> [{ at, committed }] (reservations and kept uploads of the last 24 hours)
const byOwner = new Map();
let calls = 0;

function prune(userId, now) {
  const kept = (byOwner.get(userId) || []).filter((e) => now - e.at < DAY);
  if (kept.length) byOwner.set(userId, kept); else byOwner.delete(userId);
  return kept;
}
// Drop accounts whose entries have all expired (keeps memory bounded).
function sweep(now) {
  for (const id of [...byOwner.keys()]) prune(id, now);
}

// Takes one slot, or says why not. Synchronous on purpose: check and take
// happen in one step.
//   -> { ok: true, slot: { commit(), release() } }
//   -> { ok: false, window: 'hour' | 'day', limit, retryAfterSeconds }
function reserveUploadSlot(userId, now = Date.now()) {
  if (typeof userId !== 'string' || !userId) throw new Error('reserveUploadSlot needs the signed-in user id');
  if (++calls % 500 === 0) sweep(now);
  const entries = prune(userId, now);
  const lastHour = entries.filter((e) => now - e.at < HOUR);
  const refuse = (window, limit, list, span) => ({
    ok: false, window, limit,
    retryAfterSeconds: Math.max(1, Math.ceil((list[list.length - limit].at + span - now) / 1000)),
  });
  if (lastHour.length >= DEAL_UPLOAD_LIMITS.perHour) return refuse('hour', DEAL_UPLOAD_LIMITS.perHour, lastHour, HOUR);
  if (entries.length >= DEAL_UPLOAD_LIMITS.perDay) return refuse('day', DEAL_UPLOAD_LIMITS.perDay, entries, DAY);

  const entry = { at: now, committed: false };
  entries.push(entry);
  byOwner.set(userId, entries);
  let done = false;
  return {
    ok: true,
    slot: {
      // the attempt went to Cloudinary: the slot stays used
      commit() { if (!done) { done = true; entry.committed = true; } },
      // anything else: the slot is given back (idempotent; no-op after commit)
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

// How many uploads count against the account right now (pending + kept).
function usage(userId, now = Date.now()) {
  const entries = (byOwner.get(userId) || []).filter((e) => now - e.at < DAY);
  return { lastHour: entries.filter((e) => now - e.at < HOUR).length, lastDay: entries.length };
}

// Route middleware, after requireAuth and the Deals access check, BEFORE multer.
// Releases the slot when the response ends without the controller having
// committed it (any error status, or the connection closing early).
function throttleDealUploads() {
  return (req, res, next) => {
    if (typeof req.userId !== 'string' || !req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const r = reserveUploadSlot(req.userId);
    if (!r.ok) {
      if (typeof res.set === 'function') res.set('Retry-After', String(r.retryAfterSeconds));
      return res.status(429).json({
        error: 'upload_limit',
        message: r.window === 'hour'
          ? `You can upload up to ${r.limit} deal images per hour. Please try again later.`
          : `You can upload up to ${r.limit} deal images per day. Please try again later.`,
        window: r.window,
        limit: r.limit,
        retryAfter: r.retryAfterSeconds,
      });
    }
    req.dealUploadSlot = r.slot;
    const settle = () => { if (!r.slot.settled) r.slot.release(); };
    if (typeof res.on === 'function') { res.on('finish', settle); res.on('close', settle); }
    return next();
  };
}

// Tests only.
function _resetDealUploadLimiter() { byOwner.clear(); calls = 0; }

module.exports = { DEAL_UPLOAD_LIMITS, reserveUploadSlot, usage, throttleDealUploads, _resetDealUploadLimiter };
