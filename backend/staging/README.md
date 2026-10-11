# Setting up an empty Voice staging database

For an isolated staging database only. Never run any of this against
production. Nothing here is run automatically.

## Why not `prisma migrate deploy`

The migration history cannot build the schema from nothing:

- 17 migrations exist; together they create 16 of the 27 tables in
  `schema.prisma`.
- 11 tables are never created by any migration, among them `LandingPage`,
  `Pass`, `StampSettings` and `LoyaltyCustomer` (they were added to the
  production database outside the migration flow).
- `20260628150205_add_pass_slug` alters `Pass`, and
  `20260712000000_add_search_indexes` indexes `LandingPage`, before either
  exists, so a replay stops there.

Production is unaffected: its database already has every table and every
migration is recorded as applied.

## Procedure

Run from `backend/`, with `DATABASE_URL` set to the **staging** database
for this shell only.

0. Confirm the target. Stop if the host is not the new staging database.

   ```
   node -e "console.log(new URL(process.env.DATABASE_URL).host)"
   ```

1. Confirm the database is empty (exit code 0 means empty).

   ```
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-empty --exit-code
   ```

2. Generate the schema script from this branch's `schema.prisma`. No
   database is involved; the file can be read before it is used.

   ```
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > staging/baseline.sql
   ```

3. Apply it.

   ```
   npx prisma db execute --url "$DATABASE_URL" --file staging/baseline.sql
   ```

4. Record the existing migrations as applied, so the deploy step
   (`prisma migrate deploy`) finds nothing to do.

   ```
   for m in $(ls prisma/migrations | grep '^[0-9]'); do npx prisma migrate resolve --applied "$m"; done
   ```

5. Verify. Both must report no difference / up to date.

   ```
   npx prisma migrate status
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
   ```

6. Create the recording counter (staging only, outside the Prisma schema).

   ```
   npx prisma db execute --url "$DATABASE_URL" --file staging/init-voice-usage.sql
   ```

`staging/baseline.sql` is generated output; do not commit it.

After step 6 the schema check in step 5 reports one extra table,
`StagingVoiceUsage`. That is expected.

## Resetting the recording counter

Deliberate, manual, staging only:

```
UPDATE "StagingVoiceUsage" SET "used" = 0 WHERE "id" = 1;
```
