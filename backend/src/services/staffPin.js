/**
 * staffPin.js — the staff PIN of a loyalty program (Phase 0, S2 + S5).
 * ─────────────────────────────────────────────────────────────
 * A page's staff PIN lets staff without the owner's account use the stamp
 * scanner. It is checked here, on the server, every time staff ask for a
 * stamp code (lpController.handleGetStampToken) -- a PIN check in the
 * browser alone protects nothing.
 *
 *   hashPin(pin)         salted scrypt, stored as sections.staffPin
 *                        ("scrypt$<salt hex>$<hash hex>")
 *   pinMatches(pin, h)   also accepts the old unsalted SHA-256 format, so a
 *                        PIN set before this change keeps working
 *   attempts             wrong PINs per page: 10 in 15 minutes, then every
 *                        PIN check for that page is refused until the window
 *                        has passed. Correct PINs are not counted.
 *
 * The attempt counts live in this process only (lost on restart, not shared
 * between instances), like the other in-memory limiters in services/. They
 * are counted per page, not per visitor: the API sees the proxy's address,
 * not the visitor's, so a per-address count would not be reliable. Someone
 * guessing can therefore make staff wait up to 15 minutes; the owner's own
 * sign-in is never limited by this.
 * ─────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');

const LEGACY_SALT = 'qraivy-pin-salt';
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin).trim(), salt, 32).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function sameHex(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function pinMatches(pin, stored) {
  if (pin == null || !stored || typeof stored !== 'string') return false;
  const p = String(pin).trim();
  if (!p) return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    return sameHex(crypto.scryptSync(p, parts[1], 32).toString('hex'), parts[2]);
  }
  // A PIN set before Phase 0 (unsalted SHA-256).
  return sameHex(crypto.createHash('sha256').update(p + LEGACY_SALT).digest('hex'), stored);
}

const failures = new Map(); // slug -> timestamps of wrong PINs

function recent(slug, now) {
  const list = (failures.get(slug) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(slug, list); else failures.delete(slug);
  return list;
}

function isLocked(slug, now = Date.now()) {
  return recent(slug, now).length >= MAX_FAILURES;
}

function recordFailure(slug, now = Date.now()) {
  const list = recent(slug, now);
  list.push(now);
  failures.set(slug, list);
}

// One PIN check for a page: { ok: true } or { ok: false, status, error }.
// A locked page is refused before the PIN is even compared.
function checkPin(slug, pin, stored, now = Date.now()) {
  if (!stored) return { ok: false, status: 404, error: 'No PIN set for this page.' };
  if (isLocked(slug, now)) return { ok: false, status: 429, error: 'Too many incorrect PINs. Please try again in 15 minutes.' };
  if (pinMatches(pin, stored)) return { ok: true };
  recordFailure(slug, now);
  return { ok: false, status: 401, error: 'Incorrect PIN.' };
}

function _resetForTests() { failures.clear(); }

module.exports = { hashPin, pinMatches, checkPin, isLocked, MAX_FAILURES, WINDOW_MS, _resetForTests };
