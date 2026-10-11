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
 *
 * And none of the settings that let the server contact customers or take
 * money may be present (FORBIDDEN_SETTINGS): email, web push, Apple push,
 * wallet passes, payments.
 *
 * See middleware/stagingGate.js for the request-level rules.
 * ─────────────────────────────────────────────────────────────
 */

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

  const present = FORBIDDEN_SETTINGS.filter((name) => String(env[name] || '').trim());
  if (present.length) problems.push('These settings must not exist on a staging server (customer communication or payments): ' + present.join(', ') + '.');

  if (problems.length) throw new Error('Staging server refused to start:\n - ' + problems.join('\n - '));

  return Object.freeze({
    allowedUserIds: Object.freeze(ids.slice()),
    recordingCeiling: ceiling,
    voiceAudioFolder: folder,
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
