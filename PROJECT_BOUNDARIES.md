# PROJECT_BOUNDARIES.md — QRAIVY ⟷ StadtPocket (Permanent)

Founder-approved 2026-10-08. An identical copy lives in both repositories:

- `qrairy.ai` → branches `preview/stadtpocket-phase6d-admin`,
  `preview/admin-nav-standardization`, `preview/plan-consolidation`,
  `preview/billing-step2`
- `stadtpocket-web` → branch `preview/phase6e-start-screen-api`

If the two copies differ, stop and ask. These rules override convenience,
branch activity, and "it's the same backend". When unsure which project a
task belongs to: ask.

## A. Project identities

| | QRAIVY | StadtPocket / HelloUlm |
|---|---|---|
| What | AI QR / Smart Landing Page SaaS (business owners) | City portal for Ulm: consumer app + City Manager Admin |
| Consumer frontend | — | repo `stadtpocket-web` (local `C:\Users\adwin\OneDrive\Desktop\stadtpocket-web`, remote `adwinscottrussell-pixel/stadtpocket-web`) |
| Admin frontend | repo `qrairy.ai`: `dashboard.html`, `analytics.html`, `wallet-pass-studio.html`, … | repo `qrairy.ai`: `stadtpocket-admin.html`, `stadtpocket-login.html`, `js/stadtpocket-*.js` (temporarily hosted in QRAIVY) |
| Backend | `qrairy.ai/backend` (shared, see F) | same shared backend: `/manager/stadtpocket/*`, `/public/stadtpocket/*`, `/manager-invites/*` |

`qrairy.ai`: local `C:\Users\adwin\OneDrive\Desktop\qrairy.ai`, remote
`adwinscottrussell-pixel/qrairy-ai`.

StadtPocket Admin and backend code live inside the QRAIVY repo, but they
belong to the StadtPocket project. Shipping them follows StadtPocket rules
(staging), never QRAIVY production timing.

## B. Repository and branch rules

1. Before any edit, verify and state: repository path, `git remote -v`,
   current branch, `git status --short`. If on `main` in either repo: STOP
   unless the task is an explicitly approved production promotion.
2. Protected production branches (never commit or push without explicit,
   per-action founder approval; promote only by fast-forward of an
   approved, tested commit; never force-push):
   - `qrairy.ai` → `main` (www.qraivy.com + api.qraivy.com)
   - `stadtpocket-web` → `main` (stadtpocket.de, public)
3. Allowed working branches:
   - QRAIVY work: `qrairy.ai` `preview/*` that are not StadtPocket
     (current: `preview/admin-nav-standardization`).
   - StadtPocket Admin and backend work: `qrairy.ai` `preview/stadtpocket-*`
     (current: `preview/stadtpocket-phase6d-admin`).
   - StadtPocket consumer work: `stadtpocket-web` `preview/*`
     (current: `preview/phase6e-start-screen-api`, approved HelloUlm
     checkpoint `020aeb3`).
4. No merging, cherry-picking or rebasing between QRAIVY branches and
   StadtPocket branches without an explicit task that names both branches.
   Never merge `preview/stadtpocket-*` into `main`, or `main` into a
   StadtPocket branch, as a side effect of other work.
5. Stage files by explicit path only (never `git add -A` / `git add .`);
   show the staged diff before committing; never touch the other project's
   files.
6. Never delegate push, merge or deploy to a background agent.
7. Do not delete or clean up worktrees, stashes or branches without an
   explicit task.

## C. Deployment rules

| Destination | Source | Who may deploy |
|---|---|---|
| www.qraivy.com, qraivy.com, api.qraivy.com (Railway `sparkling-love` / production) | `qrairy.ai` `main` | explicit founder approval, per promotion |
| admin-preview.qraivy.com | `qrairy.ai` `preview/admin-nav-standardization` | preview push for QRAIVY tasks (production API + production Clerk: actions there are real) |
| plan-preview.qraivy.com (+ Railway plan-preview) | `qrairy.ai` `preview/plan-consolidation` | QRAIVY plan work only |
| preview.qraivy.com (StadtPocket Admin) + Railway staging (`pacific-youth-staging.up.railway.app`) | `qrairy.ai` `preview/stadtpocket-phase6d-admin` | StadtPocket tasks only |
| preview.stadtpocket.de (behind Vercel SSO) | `stadtpocket-web` `preview/phase6e-start-screen-api` | StadtPocket consumer tasks only |
| stadtpocket.de (public) | `stadtpocket-web` `main` | explicit founder approval only. Reserved for a Coming Soon page; HelloUlm (`020aeb3`) must NOT be promoted there |

- Vercel projects: `qraivy` (all four `*.qraivy.com` hosts above) and
  `stadtpocket-web` (`*.stadtpocket.de`).
- Every push to `main` in either repo deploys production automatically.
  Treat a `main` push as a production deployment.
- Every push to `preview/stadtpocket-phase6d-admin` also redeploys Railway
  staging (the backend StadtPocket Admin and the consumer previews use).
- No cross-project deployment: a QRAIVY task never pushes a
  `preview/stadtpocket-*` branch or `stadtpocket-web`, and vice versa.
- Never repoint, rebind, add or remove domains; never change Vercel or
  Railway settings, DNS or environment variables without an explicit task.

## D. Authentication rules

- Keep the existing Clerk setup: one application "QRAivy", production
  instance (`clerk.qraivy.com`), Hobby plan, primary domain `qraivy.com`.
- No satellite domains, no new Clerk applications, no plan changes, no
  Clerk dashboard changes.
- No changes to login pages, guards, roles or permission checks
  (`publicMetadata.role`, `NetworkMember`, `requireAdmin`,
  `requireManagerScope`, StadtPocket manager auth) without an explicitly
  scoped task.
- StadtPocket Admin stays at `preview.qraivy.com/stadtpocket-admin.html`
  until a domain move is approved.

## E. Task execution rules

Before every task, report:

- Project (QRAIVY / StadtPocket Admin / StadtPocket consumer)
- Repository + current branch + HEAD SHA + `git status`
- Intended files
- Deployment target (exact host, or "none")
- Protected environments for this task

After every task, report:

- Files changed
- Tests/build results (actual counts)
- Commit SHA (or "not committed")
- Deployment URL, and whether the deployed content was verified
- Confirmation the protected environments are unchanged (`origin/main`
  SHAs of both repos, live checks where possible)

## F. Shared infrastructure (changes here can affect both products)

| Shared item | Used by | Risk |
|---|---|---|
| Clerk app "QRAivy" (production instance) | QRAIVY prod + previews, StadtPocket Admin | any dashboard or session change hits both; users and roles are shared |
| `qrairy.ai/backend` code | Railway production, staging, plan-preview | a StadtPocket backend change merged to `main` ships to QRAIVY production |
| `backend/src/utils/corsOriginPolicy.js` (static list) | all backends | an origin edit applies to every environment built from that branch |
| Vercel project `qraivy` | www, admin-preview, preview, plan-preview | domain or project settings affect all four hosts; every branch builds a preview |
| Production Postgres | QRAIVY prod (+ admin-preview) | real customer data; read-only checks only; a real `GET /lp/:slug` (without `?preview=1`) increments `scanCount` |
| Staging Postgres (Railway staging) | StadtPocket Admin + consumer previews | holds StadtPocket test businesses, customers and passes |
| Cloudinary, Resend, Stripe, Wallet credentials | configured per Railway environment | changing one environment's variables affects every host on that backend |
| DNS: Namecheap (`stadtpocket.de`), Vercel (`qraivy.com`) | both | DNS edits are out of scope unless explicitly tasked |

## G. Rollback

- Preview (either repo): `git revert <sha>` on the same preview branch, then
  push (the preview and, for `preview/stadtpocket-phase6d-admin`, Railway
  staging redeploy). Never force-push, never reset shared branches.
- Production (`main`): revert commit on `main` only with founder approval;
  verify with `git rev-parse origin/main` plus live checks.
- Approved checkpoints to return to (as of 2026-10-08): QRAIVY production
  `6b23e2f`; StadtPocket Admin `383b8e0`; HelloUlm preview `020aeb3`;
  stadtpocket.de `83aee66`.
- Never delete or rewrite shared data as a rollback step. Report data side
  effects instead of "fixing" them.

## H. Known production dependencies — risks requiring future review

These exist today. Do not change them as a side effect of other work; each
needs its own approved task.

1. **StadtPocket Admin API fallback to production.**
   `frontend/public/stadtpocket-admin.html` and
   `frontend/public/js/stadtpocket-admin-guard.js` (branch
   `preview/stadtpocket-phase6d-admin`) choose the staging API only when
   `window.location.hostname === 'preview.qraivy.com'`; every other host
   silently uses production `https://api.qraivy.com`. Serving the Admin
   from any new host would point it at production.
2. **Production rewrites on the StadtPocket preview.** `vercel.json` (and
   `frontend/public/vercel.json`) on `preview/stadtpocket-phase6d-admin`
   rewrite `/lp/*`, `/stamp/*`, `/wallet/*`, `/manifest/*` and `/sw.js` to
   production `https://api.qraivy.com`, so those paths on preview.qraivy.com
   hit production data.
3. **Shared production Clerk instance.** StadtPocket Admin signs in against
   the QRAIVY production Clerk instance; the staging backend therefore
   verifies production Clerk tokens. Users and `publicMetadata.role` are
   shared across both products.
4. **admin-preview.qraivy.com is a production client.** It is a preview
   frontend on the production API and production Clerk: any action taken
   there changes real data.
5. **Backend does not restrict token origin.** `verifyToken` is called
   without an authorized-parties check, so a valid token from any site using
   the "QRAivy" instance is accepted by every backend environment.
6. **Manager invite links** are built from `STADTPOCKET_FRONTEND_URL`
   (default `https://preview.qraivy.com`, `backend/src/routes/adminRoutes.js`);
   any Admin host move must update and test this.
