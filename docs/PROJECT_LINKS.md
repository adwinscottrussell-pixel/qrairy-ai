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

## Preview / Staging

- QRAIVY frontend preview alias: `https://preview.qraivy.com` — in
  `corsOriginPolicy.js`'s static allowlist.
- Per-deployment Vercel preview URLs follow the pattern
  `*-adwinscottrussell-5957s-projects.vercel.app` (exact suffix enforced
  in `corsOriginPolicy.js`). The current live preview URL for any given
  branch is **UNKNOWN / NEEDS VERIFICATION** — no Vercel CLI/dashboard
  access in this session, and Vercel assigns a new URL per deployment.
- StadtPocket consumer-app staging backend:
  `https://pacific-youth-staging.up.railway.app` — Railway service
  `pacific-youth`, environment `staging`. This is the API the
  `stadtpocket-web` repo calls (confirmed there in
  `frontend/src/data/businesses/usePublishedBusiness.js`).

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
- StadtPocket City Manager / Business Portal:
  `https://preview.qraivy.com/stadtpocket-admin.html` — documented in the
  same file, **but `frontend/public/stadtpocket-admin.html` does not
  exist on `main` or the currently checked-out branch** — it exists only
  on the unmerged `preview/stadtpocket-phase6d-admin` branch. Whether
  this URL currently resolves depends entirely on which branch is
  deployed to the `preview.qraivy.com` alias right now —
  **NEEDS VERIFICATION.**
- Production-equivalent admin URLs (e.g. under `www.qraivy.com`) are
  **UNKNOWN / NEEDS VERIFICATION** — not documented anywhere found in
  this repo.

## Repository

- QRAIVY (this repo):
  `https://github.com/adwinscottrussell-pixel/qrairy-ai.git`
- stadtpocket-web (consumer frontend, separate repo):
  `https://github.com/adwinscottrussell-pixel/stadtpocket-web.git`

## Deployment Services

- Backend: Railway, `nixpacks` builder (`backend/railway.toml`;
  pre-deploy runs `prisma migrate deploy`, healthcheck `/health`).
  Railway CLI in this environment is authenticated as
  `adwinscottrussell@gmail.com` and can see a project named
  `sparkling-love`, but this checkout is not `railway link`-ed, so it is
  **NEEDS VERIFICATION** whether that is the production service for this
  repo.
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
cross-repo documentation in this session. Anything above not backed by a
file in this repo (or a cited file in the other repo) is marked
UNKNOWN / NEEDS VERIFICATION, not guessed.
