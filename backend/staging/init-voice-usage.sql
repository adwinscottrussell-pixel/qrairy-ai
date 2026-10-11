-- QRAIVY Voice staging — recording counter.
--
-- STAGING DATABASES ONLY. Never run against production.
-- Not a Prisma migration: this table is outside schema.prisma on purpose
-- and is not created by `prisma migrate deploy`.
--
-- The staging backend takes one unit from this row before every
-- text-to-speech call and refuses to record when the row is missing, when
-- it cannot be read, or when "used" has reached
-- STAGING_VOICE_RECORDING_CEILING (src/services/stagingVoiceBudget.js).
--
-- Safe to run more than once: it never resets an existing count.
--
-- Where this fits when setting up an empty staging database
-- (see backend/staging/README.md for the full, ordered procedure):
--   1. create the schema from schema.prisma
--   2. mark the existing migrations as applied
--   3. run this file
--   4. verify

CREATE TABLE IF NOT EXISTS "StagingVoiceUsage" (
  "id"        INTEGER      PRIMARY KEY,
  "used"      INTEGER      NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StagingVoiceUsage_single_row" CHECK ("id" = 1),
  CONSTRAINT "StagingVoiceUsage_not_negative" CHECK ("used" >= 0)
);

INSERT INTO "StagingVoiceUsage" ("id", "used") VALUES (1, 0)
ON CONFLICT ("id") DO NOTHING;
