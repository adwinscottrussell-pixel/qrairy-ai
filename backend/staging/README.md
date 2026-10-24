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

## Vercel: which branch the Voice staging project deploys

This is a setting of the new Voice staging Vercel project only, entered
in its dashboard (Settings -> Build and Deployment -> Ignored Build
Step -> Custom). It is never in `vercel.json`: that file is read by
every Vercel project connected to this repository, including the
existing QRAIVY project, which must keep deploying all its branches.

Paste exactly the one line in `staging/vercel-ignored-build-step.txt`.

Vercel's convention is inverted: exit code 1 builds, exit code 0 skips.
The command builds `preview/lp-voice-social` and skips everything else,
including the case where Vercel provides no branch name. It applies to
production and preview deployments alike.

It only governs deployments triggered by a Git push. It does not stop
someone with access from deploying another branch by hand in the
dashboard or with the Vercel CLI.

## Landing Page Studio V3: the private preview (qraivy-studio-staging)

A separate Vercel project, `qraivy-studio-staging`
(`prj_ZqX5JYC9ODlUaNEKN45S3gvOjajk`): root `frontend/public`, framework
Other, no build, Vercel Authentication on every deployment (only members
of the Vercel team), no bypass secrets, no Git connection, no custom
domain. Address: `https://qraivy-studio-staging.vercel.app`, the only
address `js/studio/studio-routing.js` accepts besides localhost (preview
mode: the in-memory demo, no API, Save Draft and Publish disabled).

It never receives the repository's `vercel.json` (whose rewrites send
`/lp`, `/stamp`, `/wallet`, `/manifest` and `/sw.js` to the production
API). Each deploy is a Studio-files-only upload of one commit:

1. `node backend/staging/studio-preview-export.js <commit> <empty-folder>`
   copies the Studio files of that commit (`git show`, not the working
   tree) to `<folder>/upload/frontend/public/`, adds its own `vercel.json`
   (no rewrites, `/` -> `/studio.html`, noindex / no-store) and
   `robots.txt`, and writes `<folder>/manifest.json` (commit, size and
   sha256 per file). It stops if `studio.html` needs a file that is not
   in the upload.
2. Only with approval, from `<folder>/upload`:
   `VERCEL_ORG_ID=team_9DZ0L0zpjwe5NZf21uUfKTF0 VERCEL_PROJECT_ID=prj_ZqX5JYC9ODlUaNEKN45S3gvOjajk npx vercel deploy --prod --yes`
3. Check signed out: every address of the deployment answers 302 to
   `vercel.com/sso-api`. Signed in (browser): the Studio starts and reads
   "Preview · not saved". Do not use `vercel curl` on this project: it
   works through a protection bypass.

Rollback: `vercel rollback` to the previous deployment of this project,
or delete the project. Nothing else (main, www, Railway, the other Vercel
projects) is involved.
