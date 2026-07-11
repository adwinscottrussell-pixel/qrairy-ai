# QRAIVY Preview Deployment Plan v1

Sprint 2D.2 — audit and planning only. No production code, config, or
settings were changed to produce this document.

---

## 1. Current Deployment Architecture

- **Frontend**: static files in `frontend/public/`, deployed to Vercel.
  - Root `vercel.json` and `frontend/public/vercel.json` are **identical**
    (`outputDirectory: frontend/public`, three API rewrites). No local
    `.vercel` project link exists in the repo, so which of these two files
    is actually authoritative for the live Vercel project is **TBD** —
    confirm in the Vercel dashboard (Project → Settings → General → Root
    Directory / Build & Output Settings).
  - No `.env` files exist under `frontend/`. There is no build step and no
    `NODE_ENV`/`VERCEL_ENV`-based branching in any frontend file — every
    page is plain static HTML/JS.
- **Backend**: Express app on Railway (`backend/railway.toml`), started via
  `npx prisma generate && npx prisma migrate deploy && node src/index.js`.
  Single environment — no staging backend exists.
- **API base URL**: hardcoded as `https://api.qraivy.com` (production) in
  12+ frontend files (`app.js`, `dashboard.html`, `analytics.html`,
  `admin.html`, `designer-saved.html`, `index.html`, `pricing.html`,
  `js/session.js`, `qr-manage.html`, `qr-free-dashboard.html`,
  `smart-qr-detail.html`, `visit.html`). There is no environment-based
  override mechanism — every deployment of the frontend, preview or
  production, talks to the same production backend and production
  database today.
- **Auth**: Clerk, embedded via `data-clerk-publishable-key` script tags.
  Every page uses the same **live** key:
  `pk_live_Y2xlcmsucXJhaXZ5LmNvbSQ`. There is no test/dev Clerk instance
  referenced anywhere in the frontend.
- **CORS**: `backend/src/index.js:23-26` — hardcoded allowlist:
  ```js
  origin: ['https://www.qraivy.com', 'https://qraivy.com', 'https://api.qraivy.com'],
  credentials: true
  ```
  No wildcard, no `*.vercel.app`, no preview-domain pattern. This will
  **reject** any authenticated (credentialed / `Authorization`-header)
  fetch from a Vercel preview URL at the CORS layer before it reaches
  Clerk verification.
- **Git**: only `main` exists, locally and on `origin`
  (`github.com/adwinscottrussell-pixel/qrairy-ai`). No feature branches,
  no prior preview deployments to reference.

---

## 2. Recommended Preview Workflow

Given there is one backend environment and one live Clerk instance, the
safest low-effort option is:

**Vercel Preview Deployment on a feature branch, pointed at the existing
production backend in read-mostly/test-account mode** — not a fully
isolated staging stack (that would require a second Railway backend, a
second Postgres DB, and a second Clerk instance, which is out of scope for
this sprint).

Rationale:
- Frontend is static — a preview deployment only changes *which HTML/JS/CSS
  is served*, not what it talks to, unless we also branch the API base URL.
- The real risk isn't "wrong code ships to preview" — it's **preview code
  writing to production data** through the shared backend/DB, and **CORS
  silently blocking the preview domain** so nothing works at all.

## 3. Feature-Branch Strategy

1. Create a short-lived branch off `main`, e.g. `preview/2d2-dashboard-qds`.
   (Not created in this sprint — planning only.)
2. Push the branch (not `main`) to trigger a Vercel Preview Deployment via
   the existing Git integration, without touching production.
3. Keep the branch scoped to the current uncommitted change
   (`frontend/public/dashboard.html`) plus whatever else is under active
   QDS migration — don't accumulate unrelated work on it.
4. Delete the branch once the preview is validated and merged/discarded.

## 4. Vercel Configuration Requirements

To confirm (dashboard access required — not verifiable from repo alone):
- **Root Directory** setting for the frontend project — must resolve to
  the same `frontend/public` that both `vercel.json` files declare.
- **Preview Deployments** toggle: Project → Settings → Git → confirm
  "Preview Deployments" is enabled for non-production branches (this is
  Vercel's default, but confirm it wasn't disabled).
- **Ignored Build Step**: confirm nothing is configured to skip builds for
  non-`main` branches.
- Given two identical `vercel.json` files exist, confirm only one Vercel
  project actually consumes this repo — a second project pointed at the
  same repo would double-deploy every push.

## 5. Clerk Configuration Requirements

- The frontend uses Clerk's **production/live** instance
  (`pk_live_...`) everywhere. Clerk's production instances restrict
  sign-in/session behavior to configured domains.
- Before a preview URL (`https://<branch>-<project>.vercel.app`) can
  complete Clerk auth, the Vercel preview domain pattern must be added to
  Clerk Dashboard → **Configure → Domains** (or "Allowed Origins" /
  satellite domain config, depending on Clerk plan) for the `qraivy.com`
  production instance.
- This is an external dashboard setting, not visible in this repo —
  confirm current state directly in Clerk before assuming it's missing or
  present.
- Risk: adding a wildcard `*.vercel.app` to a **live** Clerk instance
  widens where production session cookies/tokens can be issued from. If
  Clerk supports scoping to your specific Vercel project's preview
  pattern (`your-project-*.vercel.app`) rather than all of `*.vercel.app`,
  prefer the narrower pattern.

## 6. Backend/API Considerations

- Backend has **one** environment (Railway, production DB). There is no
  staging API to point previews at.
- Preview frontend, unmodified, will call `https://api.qraivy.com` — i.e.
  **the live production backend and production database** — for every
  request (QR reads/writes, analytics, wallet passes, loyalty stamps,
  Stripe-adjacent endpoints).
- This is acceptable **only** if testing is restricted to the existing
  test accounts already on the bypass plan (see project memory: three dev
  users bumped to enterprise/bypass free-tier limits pre-launch). Do not
  use real customer accounts or trigger Stripe/wallet-pass side effects
  from a preview session.

## 7. CORS and Redirect Requirements

- `backend/src/index.js:23-26` allowlist does **not** include any Vercel
  preview domain. Any preview-origin request that requires a preflight
  (i.e. anything sending `Authorization: Bearer ...`, which is every
  authenticated call in this app) will be blocked by the browser before
  it reaches the backend.
- To make preview testing work, the backend CORS origin list needs a
  preview-domain entry added — e.g. the specific
  `qrairy-ai-git-<branch>-<team>.vercel.app` preview URL, or a
  regex/function-based origin check matching the project's Vercel preview
  pattern. **Not done in this sprint** — flagged as a required follow-up
  change, and it touches shared backend code, so it needs its own
  confirmed, reviewed change (small, revertible) rather than a wildcard
  `origin: '*'` (which is incompatible with `credentials: true` per CORS
  spec anyway).
- Clerk redirect URLs: any Clerk-hosted redirect (e.g. post-sign-in
  redirect, OAuth callback) configured in the Clerk dashboard as an
  absolute `https://www.qraivy.com/...` URL will not return to a preview
  domain automatically — check Clerk Dashboard → Paths/URLs for any
  hardcoded absolute redirect and note whether it needs a preview-specific
  override or can stay relative.

## 8. Preview Environment Variables

Frontend has no build-time env vars today (static files, hardcoded
constants) — so there is nothing to set in Vercel's "Preview" environment
variable scope *unless* the API base URL and Clerk key are refactored to
read from env/config at request time. Until that refactor happens,
"environment variables for Preview" is moot for the frontend — the
constants are baked into the HTML/JS as committed.

Backend (Railway) has no preview environment at all today — it's a single
Railway service. If backend changes are ever needed for preview testing,
that requires a second Railway environment/service with its own
`DATABASE_URL`, `CLERK_SECRET_KEY`, etc. — out of scope for this sprint.

## 9. Testing Checklist

- [ ] Confirm Vercel project's Root Directory / which `vercel.json` is live
- [ ] Confirm Preview Deployments are enabled in Vercel project settings
- [ ] Add preview domain to Clerk allowed origins (narrowest pattern
      available)
- [ ] Add preview domain to backend CORS allowlist (separate, reviewed
      backend change)
- [ ] Push feature branch, confirm Vercel preview build succeeds
- [ ] Load preview URL, confirm Clerk sign-in completes (no CORS/console
      errors)
- [ ] Confirm dashboard renders and API calls to `api.qraivy.com` succeed
- [ ] Test only with the three known dev/test accounts already on the
      bypass plan — never a live customer account
- [ ] Confirm no Stripe charge, wallet pass push, or loyalty stamp write
      is triggered by routine navigation during the test
- [ ] Confirm `frontend/public/dashboard.html` renders as expected on
      preview before merging

## 10. Production Data Safety Rules

- Only test with the existing bypass-plan dev accounts — do not create
  new "real" customer records during preview testing.
- Do not exercise Stripe checkout/billing flows against preview (shared
  production Stripe keys — any charge is a real charge).
- Do not exercise wallet-pass push or loyalty-stamp flows against real
  device registrations.
- Treat every write from the preview URL as a write to the same database
  production reads from — there is no isolation.

## 11. Rollback Plan

- **Frontend**: preview deployments are inherently non-destructive to
  production — a preview URL never affects the production Vercel
  deployment. To fully back out, delete the feature branch; no rollback
  of `main` or the live deployment is needed.
- **CORS change** (if made later, in its own commit): revert the single
  added origin-array entry in `backend/src/index.js` and redeploy backend.
- **Clerk domain change** (if made later): remove the added preview
  domain pattern from Clerk Dashboard → Domains.
- No database migration, schema change, or data mutation is part of this
  plan — nothing to roll back there.

## 12. Step-by-Step Founder Instructions

1. In Vercel dashboard: confirm which project/Root Directory is live, and
   that Preview Deployments are enabled.
2. Create branch `preview/2d2-dashboard-qds` from `main` (do this only
   when ready to test — not part of this sprint).
3. Commit the current `frontend/public/dashboard.html` change to that
   branch and push it.
4. In Clerk dashboard, add the resulting Vercel preview URL/pattern to
   allowed domains.
5. Decide, with the backend owner, on the smallest CORS change to allow
   that one preview origin; make and deploy that change separately from
   frontend work.
6. Open the preview URL, sign in with a bypass-plan dev account, and work
   through the checklist in Section 9.
7. When satisfied, merge the branch to `main` through the normal PR flow
   and delete the feature branch.
8. Revert the CORS allowlist entry and Clerk preview domain once no
   longer needed, if they were added as one-offs rather than a permanent
   pattern.

---

## Open Items Requiring Founder/Dashboard Confirmation

- Which `vercel.json` (root vs `frontend/public/`) the live Vercel project
  actually uses.
- Whether Vercel Preview Deployments are currently enabled or disabled.
- Current state of Clerk's allowed domains/origins list.
- Whether any Clerk redirect URL is hardcoded absolute to
  `www.qraivy.com`.
