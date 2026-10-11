/**
 * stagingVoiceBudget.js — the total number of recordings staging may make.
 * ─────────────────────────────────────────────────────────────
 * Production: reserveRecording() returns immediately. Nothing is counted,
 * nothing is limited here (voicePreviewLimiter has production's limits).
 *
 * Staging: every text-to-speech call, from the editor's preview or from
 * Publish, must first take one unit from a counter kept IN THE STAGING
 * DATABASE, so it survives restarts and deploys. The ceiling is
 * STAGING_VOICE_RECORDING_CEILING.
 *
 * Fail closed: if the counter cannot be read or updated for any reason
 * (table missing, database unreachable, unexpected answer), no recording
 * is made. A unit is taken before the call and never given back.
 *
 * The counter is one row in "StagingVoiceUsage". That table is not part
 * of the Prisma schema and is never created by this code: it is created
 * once, by hand, when the staging database is set up
 * (backend/staging/init-voice-usage.sql). On a database without it,
 * staging records nothing.
 * ─────────────────────────────────────────────────────────────
 */

const stagingPolicy = require('../config/stagingPolicy');

class StagingCeilingError extends Error {
  constructor(message, reason) { super(message); this.name = 'StagingCeilingError'; this.code = 'STAGING_CEILING'; this.reason = reason; }
}

// Takes one unit, atomically. The UPDATE only matches while there is room,
// so two requests arriving together cannot both take the last unit.
async function takeUnit(prisma, ceiling) {
  let rows;
  try {
    rows = await prisma.$queryRaw`UPDATE "StagingVoiceUsage" SET "used" = "used" + 1, "updatedAt" = NOW() WHERE "id" = 1 AND "used" < ${ceiling} RETURNING "used"`;
  } catch (err) {
    throw new StagingCeilingError('Staging recording counter could not be verified; no recording was made.', 'unverified');
  }
  if (Array.isArray(rows) && rows.length === 1 && Number.isFinite(Number(rows[0].used))) {
    return { used: Number(rows[0].used), ceiling };
  }
  // No row updated: either the ceiling is reached, or the counter row is missing.
  let check;
  try {
    check = await prisma.$queryRaw`SELECT "used" FROM "StagingVoiceUsage" WHERE "id" = 1`;
  } catch (err) {
    throw new StagingCeilingError('Staging recording counter could not be verified; no recording was made.', 'unverified');
  }
  if (Array.isArray(check) && check.length === 1 && Number(check[0].used) >= ceiling) {
    throw new StagingCeilingError(`Staging recording ceiling reached (${ceiling}). No more audio is generated on this staging database.`, 'reached');
  }
  throw new StagingCeilingError('Staging recording counter could not be verified; no recording was made.', 'unverified');
}

// Called immediately before every text-to-speech call.
async function reserveRecording({ policy = stagingPolicy.policy, prisma } = {}) {
  if (!policy) return null;                       // production
  const db = prisma || require('../utils/prismaClient');
  const result = await takeUnit(db, policy.recordingCeiling);
  console.log(`[Voice] staging recording ${result.used} of ${result.ceiling}`);
  return result;
}

module.exports = { reserveRecording, takeUnit, StagingCeilingError };
