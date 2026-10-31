/**
 * lpV3/draftPolicy.js — Landing Page Studio V3 (Phase D1): the rules for
 * creating and changing Studio drafts.
 *
 *   LIMITS                 3 unpublished drafts per account, 5 creations per
 *                          rolling 24 hours (deleted drafts still count)
 *   draftSlug(name, lang)  a new draft's page address
 *   requireVerifiedEmail   middleware, after requireAuth: the account's
 *                          primary email must be verified (403 otherwise)
 *
 * Verified email is decided on the server only, never from the request body:
 *   production  a live Clerk lookup (utils/clerkEmailSync.js, the secret key):
 *               Clerk's state at the moment of the request, so an old session
 *               token cannot claim it
 *   staging     holds no Clerk secret (config/stagingPolicy.js), so the
 *               signed session token must carry the claim
 *               email_verified: true (Clerk session token customisation on the
 *               staging instance). The claim is covered by the signature,
 *               issuer and azp checks in utils/clerkVerify.js; it is at most
 *               one token lifetime old.
 * Anything else (lookup failed, claim missing or not exactly true) is refused.
 */
'use strict';
const crypto = require('crypto');
const stagingPolicy = require('../config/stagingPolicy');

const LIMITS = Object.freeze({
  activeDrafts: 3,
  creationsPerWindow: 5,
  windowMs: 24 * 60 * 60 * 1000,
  // creation log rows older than this are removed (well past the window)
  keepLogMs: 7 * 24 * 60 * 60 * 1000,
});

const SLUG_BASE_MAX = 40;
const SUFFIX_LENGTH = 6;
const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TRANSLIT = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', æ: 'ae', ø: 'oe', œ: 'oe', å: 'a' };

// "Anna's Café" -> "annas-cafe"; empty -> "seite" / "page"
function slugBase(name, language) {
  const s = String(name || '').toLowerCase()
    .replace(/[äöüßæøœå]/g, (c) => TRANSLIT[c])
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_BASE_MAX)
    .replace(/-+$/g, '');
  return s || (language === 'en' ? 'page' : 'seite');
}
function randomSuffix() {
  let s = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) s += SUFFIX_CHARS[crypto.randomInt(SUFFIX_CHARS.length)];
  return s;
}
function draftSlug(name, language) { return slugBase(name, language) + '-' + randomSuffix(); }

async function emailVerified(req) {
  if (stagingPolicy.policy) return !!req.authClaims && req.authClaims.email_verified === true;
  // required lazily: clerkEmailSync builds its Clerk client on first use
  const { fetchPrimaryEmailVerified } = require('../utils/clerkEmailSync');
  const r = await fetchPrimaryEmailVerified(req.userId);
  return !!r && r.verified === true;
}

async function requireVerifiedEmail(req, res, next) {
  let ok = false;
  try { ok = !!req.userId && (await emailVerified(req)); } catch (_) { ok = false; }
  if (!ok) {
    if (typeof res.set === 'function') res.set('Cache-Control', 'private, no-store');
    return res.status(403).json({ error: 'email_unverified', message: 'Please verify your email address first.' });
  }
  return next();
}

module.exports = { LIMITS, slugBase, draftSlug, emailVerified, requireVerifiedEmail, SLUG_BASE_MAX, SUFFIX_LENGTH };
