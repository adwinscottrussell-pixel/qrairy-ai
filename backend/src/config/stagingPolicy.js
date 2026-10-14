/**
 * stagingPolicy.js — what an isolated staging backend is allowed to be.
 * ─────────────────────────────────────────────────────────────
 * Production (APP_ENV not "staging"): this module does nothing.
 * `policy` is null, nothing is validated, nothing is restricted.
 *
 * Staging (APP_ENV=staging) is a deliberately small server for testing
 * the Voice Welcome editor with real audio. Loading this module checks
 * its settings and THROWS if any is missing or unsafe, so a misconfigured
 * staging server does not start:
 *
 *   STAGING_ALLOWED_USER_IDS         required. Comma separated Clerk user
 *                                    ids. Only these accounts may use any
 *                                    signed-in endpoint.
 *   STAGING_VOICE_RECORDING_CEILING  required. Whole number 1..500: the
 *                                    most text-to-speech recordings this
 *                                    staging database will ever allow.
 *   VOICE_AUDIO_FOLDER               required. Storage folder for staging
 *                                    audio; must name itself "staging"
 *                                    and can never be a production folder.
 *   CLOUDINARY_CLOUD_NAME            must be set. A separate account is
 *                                    best; the folder rule protects
 *                                    production audio either way.
 *   DEAL_IMAGE_FOLDER                optional. Storage folder for QRAIVY
 *                                    Deals image uploads; same rules as
 *                                    VOICE_AUDIO_FOLDER, and different
 *                                    from it. Without it a staging server
 *                                    refuses Deals uploads (it never falls
 *                                    back to the production folder); set
 *                                    but unsafe, the server does not start.
 *
 *
 * Sign-in is verified with Clerk's PUBLIC key only, so staging holds no
 * Clerk secret (utils/clerkVerify.js):
 *
 *   CLERK_JWT_KEY                    required. The Clerk instance's public
 *                                    verification key (PEM, RSA 2048).
 *   STAGING_CLERK_ISSUER             required. The Clerk instance tokens
 *                                    must come from, e.g. https://clerk.example.com
 *   STAGING_CLERK_AUTHORIZED_PARTIES required. Comma separated https
 *                                    origins of the staging site(s) a
 *                                    token must have been issued for.
 *   CLERK_SECRET_KEY                 must NOT be set.
 *
 * And none of the settings that let the server contact customers or take
 * money may be present (FORBIDDEN_SETTINGS): email, web push, Apple push,
 * wallet passes, payments.
 *
 * See middleware/stagingGate.js for the request-level rules.
 * ─────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');

// Exact https origin, nothing else: no path, no wildcard.
function isHttpsOrigin(value) {
  if (String(value).includes('*')) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && u.origin === value; } catch (_) { return false; }
}

// Reads the sign-in verification settings. Adds to `problems`; returns the
// values to verify with, or null. Never includes a setting's value in a message.
function readClerkVerification(env, problems) {
  if (String(env.CLERK_SECRET_KEY || '').trim()) problems.push('CLERK_SECRET_KEY must not exist on a staging server. Staging verifies sign-ins with the public key (CLERK_JWT_KEY).');

  let jwtKey = null;
  const pem = String(env.CLERK_JWT_KEY || '').replace(/\\n/g, '\n').trim();
  if (!pem) problems.push('CLERK_JWT_KEY is required on staging: the Clerk public verification key (PEM).');
  else if (/PRIVATE KEY/.test(pem)) problems.push('CLERK_JWT_KEY must be a PUBLIC key. A private key was supplied.');
  else {
    try {
      const key = crypto.createPublicKey(pem);
      if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength !== 2048) throw new Error('unsupported key');
      jwtKey = key.export({ type: 'spki', format: 'pem' }).trim();
    } catch (_) { problems.push('CLERK_JWT_KEY is not a valid RSA 2048 public key in PEM format.'); }
  }

  const issuer = String(env.STAGING_CLERK_ISSUER || '').trim();
  if (!issuer) problems.push('STAGING_CLERK_ISSUER is required on staging: the https address of the Clerk instance.');
  else if (!isHttpsOrigin(issuer)) problems.push('STAGING_CLERK_ISSUER must be an https origin only, without a path.');

  const parties = String(env.STAGING_CLERK_AUTHORIZED_PARTIES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parties.length) problems.push('STAGING_CLERK_AUTHORIZED_PARTIES is required on staging: the https origin(s) of the staging site.');
  else if (!parties.every(isHttpsOrigin)) problems.push('STAGING_CLERK_AUTHORIZED_PARTIES may only contain exact https origins.');

  return Object.freeze({ jwtKey, issuer, authorizedParties: Object.freeze(parties) });
}

// Storage folders production writes to. Staging may never use them.
const PRODUCTION_STORAGE_FOLDERS = ['qraivy-voices', 'qraivy-logos', 'qraivy-wallet-strips', 'qraivy-deals'];
const PRODUCTION_VOICE_FOLDER = 'qraivy-voices';

// Settings that enable customer communication or payments. Their mere
// presence on a staging server is refused.
const FORBIDDEN_SETTINGS = [
  'RESEND_API_KEY',
  'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY',
  'APNS_KEY_P8_BASE64', 'APNS_KEY_ID',
  'APPLE_PASS_CERT_PEM', 'APPLE_PASS_KEY_PEM', 'APPLE_PASS_P12_PASSWORD', 'APPLE_PASS_P12_BASE64',
  'GOOGLE_WALLET_KEY', 'GOOGLE_WALLET_ISSUER_ID',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
];

const MAX_CEILING = 500;

function isStagingEnv(env = process.env) {
  return String(env.APP_ENV || '').trim().toLowerCase() === 'staging';
}

// Returns null in production. In staging returns the validated policy or
// throws an Error that says exactly what is wrong (never a secret value).
function loadStagingPolicy(env = process.env) {
  if (!isStagingEnv(env)) return null;
  const problems = [];

  const ids = String(env.STAGING_ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) problems.push('STAGING_ALLOWED_USER_IDS is required: list the Clerk user ids of the test accounts.');
  const badIds = ids.filter((id) => !/^user_[A-Za-z0-9]{8,}$/.test(id));
  if (badIds.length) problems.push(`STAGING_ALLOWED_USER_IDS contains ${badIds.length} entr${badIds.length === 1 ? 'y that is' : 'ies that are'} not a Clerk user id (user_…).`);

  const rawCeiling = String(env.STAGING_VOICE_RECORDING_CEILING || '').trim();
  const ceiling = /^\d+$/.test(rawCeiling) ? Number(rawCeiling) : NaN;
  if (!(ceiling >= 1 && ceiling <= MAX_CEILING)) problems.push(`STAGING_VOICE_RECORDING_CEILING is required: a whole number from 1 to ${MAX_CEILING}.`);

  const folder = String(env.VOICE_AUDIO_FOLDER || '').trim();
  if (!folder) problems.push('VOICE_AUDIO_FOLDER is required on staging.');
  else if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(folder)) problems.push('VOICE_AUDIO_FOLDER may only contain lowercase letters, digits and hyphens.');
  else if (PRODUCTION_STORAGE_FOLDERS.includes(folder)) problems.push('VOICE_AUDIO_FOLDER is a production folder. Staging audio must go somewhere else.');
  else if (!/(^|-)staging(-|$)/.test(folder)) problems.push('VOICE_AUDIO_FOLDER must contain the word "staging" (for example qraivy-voices-staging).');

  if (!String(env.CLOUDINARY_CLOUD_NAME || '').trim()) problems.push('CLOUDINARY_CLOUD_NAME is required on staging.');

  // QRAIVY Deals uploads: an explicit staging folder, or none at all.
  const dealFolder = String(env.DEAL_IMAGE_FOLDER || '').trim();
  if (dealFolder) {
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(dealFolder)) problems.push('DEAL_IMAGE_FOLDER may only contain lowercase letters, digits and hyphens.');
    else if (PRODUCTION_STORAGE_FOLDERS.includes(dealFolder)) problems.push('DEAL_IMAGE_FOLDER is a production folder. Staging deal images must go somewhere else.');
    else if (!/(^|-)staging(-|$)/.test(dealFolder)) problems.push('DEAL_IMAGE_FOLDER must contain the word "staging" (for example qraivy-deals-staging).');
    else if (dealFolder === folder) problems.push('DEAL_IMAGE_FOLDER must differ from VOICE_AUDIO_FOLDER.');
  }

  const clerk = readClerkVerification(env, problems);

  const present = FORBIDDEN_SETTINGS.filter((name) => String(env[name] || '').trim());
  if (present.length) problems.push('These settings must not exist on a staging server (customer communication or payments): ' + present.join(', ') + '.');

  if (problems.length) throw new Error('Staging server refused to start:\n - ' + problems.join('\n - '));

  return Object.freeze({
    allowedUserIds: Object.freeze(ids.slice()),
    recordingCeiling: ceiling,
    voiceAudioFolder: folder,
    dealImageFolder: dealFolder || null,
    clerk,
  });
}

const policy = loadStagingPolicy();

module.exports = {
  PRODUCTION_STORAGE_FOLDERS,
  PRODUCTION_VOICE_FOLDER,
  FORBIDDEN_SETTINGS,
  MAX_CEILING,
  isStagingEnv,
  loadStagingPolicy,
  policy,
  isStaging: policy !== null,
  // The folder welcome audio is stored in: production's, unless this is staging.
  voiceAudioFolder: policy ? policy.voiceAudioFolder : PRODUCTION_VOICE_FOLDER,
};
