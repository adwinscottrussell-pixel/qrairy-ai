# Project Links

Permanent location registry for QRAIVY. Separate from
`docs/DAILY_ENGINEER_REPORT.md` — that file tracks engineering state,
this file tracks *where things live*. Only URLs/locations verifiable
from repository/config/documentation evidence are listed; anything else
is marked UNKNOWN / NEEDS VERIFICATION rather than guessed.

## Production

- Frontend: `https://www.qraivy.com` (canonical) / `https://qraivy.com`
  (apex) — per `frontend/public/index.html` canonical/OG tags and the
  static origin allowlist in `backend/src/utils/corsOriginPolicy.js`.
- Backend API: `https://api.qraivy.com` — per root `vercel.json`
  rewrites, `corsOriginPolicy.js`, and used as `API_BASE` throughout
  `frontend/public/*.html`.
- StadtPocket Production: `https://stadtpocket.de` — registered domain,
  DNS managed at Namecheap, intended target `stadtpocket.de` → Vercel
  production per founder-confirmed architecture. **Not yet live** — as
  of the 2026-09-15 DNS inspection the apex had no A/CNAME record at
  all; **NEEDS RE-VERIFICATION** if this has changed since.

## Preview / Staging

- QRAIVY frontend preview alias: `https://preview.qraivy.com` — in
  `corsOriginPolicy.js`'s static allowlist.
- Per-deployment Vercel preview URLs follow the pattern
  `*-adwinscottrussell-5957s-projects.vercel.app` (exact suffix enforced
  in `corsOriginPolicy.js`). The current live preview URL for any given
  branch is **UNKNOWN / NEEDS VERIFICATION** — no Vercel CLI/dashboard
  access in this session, and Vercel assigns a new URL per deployment.
- **StadtPocket Preview (consumer app): `https://preview.stadtpocket.de`
  — VERIFIED LIVE AND WORKING (2026-09-16, founder browser acceptance
  test).** Tracks `stadtpocket-web`'s `preview/phase6e-start-screen-api`.
  Sits behind Vercel Deployment Protection (SSO) for unauthenticated/
  non-team requests — this is why automated/unauthenticated fetches from
  this session could not read it directly, even though a signed-in
  browser can.
- StadtPocket consumer-app staging backend:
  `https://pacific-youth-staging.up.railway.app` — **VERIFIED LIVE**
  (2026-09-16, direct `curl` + Railway dashboard confirmation). Railway
  project `sparkling-love`, environment `staging`, service
  `pacific-youth`, root directory `backend`. Currently deploys from
  QRAIVY's `preview/stadtpocket-phase6d-admin` via GitHub auto-deploy
  (confirmed via `railway status`, not inferred). This is the only API
  the `stadtpocket-web` repo calls (confirmed there in
  `frontend/src/data/businesses/usePublishedBusiness.js`). CORS-allowed
  for `https://preview.stadtpocket.de` as of `0e8e8cb` on that branch.

## Backend / API

- Production API base: `https://api.qraivy.com` (see Production).
- StadtPocket public API namespace (`/public/stadtpocket/*`) is served
  from this same backend codebase; the `stadtpocket-web` consumer app
  currently reaches it only via the staging Railway host above, never
  `api.qraivy.com` directly.

## Admin

- Global Admin: `https://preview.qraivy.com/admin.html` — documented in
  `stadtpocket-web/docs/STADTPOCKET_PAGE_REGISTRY.md` (cross-repo
  evidence, 2026-09-14). `frontend/public/admin.html` exists on the
  currently checked-out branch.
- **StadtPocket City Manager / Business Portal (Admin Preview):
  `https://preview.qraivy.com/stadtpocket-admin.html` — VERIFIED WORKING
  (2026-09-16, founder confirmed in browser: the Bäckerei Staib "testing
  / 2 für 1" Angebot is visible there with title, type, LIVE status,
  dates, and image).** `frontend/public/stadtpocket-admin.html` lives on
  `preview/stadtpocket-phase6d-admin` (not `main`).
- Production-equivalent admin URLs (e.g. under `www.qraivy.com`) are
  **UNKNOWN / NEEDS VERIFICATION** — not documented anywhere found in
  this repo.

## Repository

- QRAIVY (this repo):
  `https://github.com/adwinscottrussell-pixel/qrairy-ai.git`
- stadtpocket-web (consumer frontend, separate repo):
  `https://github.com/adwinscottrussell-pixel/stadtpocket-web.git`

## Deployment Services

- Backend: Railway, `nixpacks`/Railpack builder (`backend/railway.toml`;
  pre-deploy runs `prisma migrate deploy`, healthcheck `/health`).
  **Confirmed via `railway status` (2026-09-16):** project
  `sparkling-love`, two environments — `production` (deploys from
  `main`) and `staging` (deploys from `preview/stadtpocket-phase6d-admin`,
  service `pacific-youth`, root directory `backend`). No longer
  unverified.
- Frontend: Vercel (root `vercel.json`, `outputDirectory:
  frontend/public`). No Vercel CLI available in this environment —
  project name/dashboard link is **NEEDS VERIFICATION**.

## Important Local Paths

- Primary checkout: `C:\Users\adwin\OneDrive\Desktop\qrairy.ai`
- Additional persistent (non-scratchpad) worktrees observed on this
  machine:
  - `C:\Users\adwin\git-worktrees\qrairy-phase6d` —
    `local/phase6d-seed-script-prep`
  - `C:\Users\adwin\qraivy-deploy-worktree` —
    `preview/stadt-pocket-phase1b-operations-center`
  - `C:\Users\adwin\main-manager-merge` —
    `merge-staging/main-manager-backend`
  - `C:\Users\adwin\manager-backend-candidate` —
    `production-candidate/manager-backend-2026-08-23`
- ~20 additional ephemeral worktrees exist under
  `AppData\Local\Temp\claude\...\scratchpad\*` (Claude Code session
  scratchpads, several already flagged `prunable` by Git) — not
  individually catalogued here; see
  `docs/DAILY_ENGINEER_REPORT.md` → Blockers/Risks.

## Last Verified

2026-09-15, by direct inspection of repository config, code, and
cross-repo documentation. Updated 2026-09-16 with live-verified entries
(Railway dashboard confirmation, direct `curl` checks, and founder
browser acceptance of the StadtPocket Preview/Admin/staging-API path).
Anything above not backed by a file in this repo (or a cited file in the
other repo) or an explicit live verification is marked UNKNOWN / NEEDS
VERIFICATION, not guessed.
