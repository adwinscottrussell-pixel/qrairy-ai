# QRAIVY — Claude Code Project Guide

AI-powered QR code SaaS: dynamic QR codes, smart landing pages, loyalty, wallet
passes, push notifications.

This file is loaded automatically at the start of every Claude Code session in
this repo. Personal/local overrides live in `QRAIVY.local.md` (gitignored) and
are merged on top of this file.

> **Status**: This file was introduced as a Phase 1 documentation/organization
> layer on top of the existing, working `qraivy.ai` codebase. It describes
> what is verifiably true from `backend/package.json` and the repo file tree.
> Sections marked **TBD** need confirmation from someone who has read the
> actual route/service/schema files — do not treat them as fact yet.

## Canonical Repository

Repository root:

```
C:\Users\adwin\OneDrive\Desktop\qrairy.ai
```

At the start of every implementation session:

1. cd into the repository
2. verify it is a Git repository
3. verify the current branch
4. inspect git status
5. read `CURRENT_SPRINT.md`
6. read `PROJECT_STATE.md`

Rules:

- Never assume the current working directory.
- Never act on claims about staged work without inspecting Git.
- After `/clear`, reconstruct context from repository files.
- Do not restart completed architecture work when its commit is already present.
- Do not stage unrelated or pre-existing untracked files.

## Tech Stack (confirmed from backend/package.json)

- **Runtime**: Node.js, Express 4
- **ORM**: Prisma 5 (`@prisma/client`, `prisma`) — DB provider: **TBD**, check `backend/prisma/schema.prisma`
- **Auth**: Clerk (`@clerk/backend`) — `jsonwebtoken` is also present, so there
  may be a secondary/legacy JWT path — **TBD**, check `backend/src/middleware/auth.js`
- **Billing**: Stripe (`stripe`)
- **AI**: Anthropic SDK (`@anthropic-ai/sdk`) — powers `backend/src/routes/aiRoutes.js`
- **File storage / uploads**: Cloudinary (`cloudinary`), `multer` for upload handling
- **Email**: Resend (`resend`) — not SendGrid
- **Push notifications**: `web-push` (VAPID-based Web Push) — not OneSignal
- **Wallet passes**: `passkit-generator` (Apple Wallet), `googleapis` (Google Wallet)
- **PDF/image rendering**: `puppeteer-core` + `@sparticuz/chromium` (serverless-friendly headless Chrome) — likely used for QR/pass image generation or PDF export, **TBD** exact usage
- **Security/infra**: `helmet`, `cors`, `express-rate-limit`
- **Misc**: `jszip` (bundling/export), `pngjs` + `node-forge` (image/cert handling, likely wallet-pass related), Google OAuth (`google-auth-library`)
- **Frontend**: Static HTML/CSS/JS in `frontend/public/` — no framework, includes
  a canvas-based editor, admin dashboard, customer dashboard, landing page
  renderer/generator, loyalty setup, wallet pass studio, analytics
- **Deploy**: Both Railway (`backend/railway.toml`, `frontend/railway.toml`) and
  Vercel (`vercel.json` at root, `frontend/public/vercel.json`) configs exist —
  **TBD** which is the actual live target for each piece; confirm before
  assuming either is authoritative

## Repo Structure (as it exists today)

```
backend/
  prisma/            schema.prisma + migrations/ (Prisma-managed)
  public/sw.js        service worker served from backend — TBD why separate
                       from frontend/public/sw.js
  src/
    agents/            redirectAgent.js — application logic, NOT Claude Code
                        subagents. Do not confuse with any Claude "agents"
                        folder if one is added later.
    config/, controllers/, middleware/, routes/, services/, utils/
    index.js           entry point
    prismaClient.js    NOTE: also exists at src/utils/prismaClient.js —
                        unresolved duplicate, flagged for later cleanup,
                        not touched in this phase
frontend/
  public/              ~60 files: pages, css/, js/, img/, qr/ — reorg planned
                        for a later phase, not yet started
scripts/               check-pass.js, check-subs.js, reset-test.js — ops/debug
                        scripts, undocumented purpose (TBD)
```

## Key Conventions (observed, not yet formally enforced)

- Backend follows `routes/ → controllers/ → services/` layering
- `middleware/` is cleanly separated by concern (auth, admin, api-key, plan-gating, error handling)
- Frontend groups some assets by type (`css/`, `js/`, `img/`) but not consistently — some files sit flat in `public/` instead

## Architecture Guardrails

1. Never commit secrets. `.env` is gitignored at both root and `backend/`; only `.env.example` (if present) should be committed.
2. Don't introduce a second Prisma client instance — resolve the existing `prismaClient.js` duplication before adding new DB access code (see TBD above).
3. New routes should follow the existing controller/service split already used throughout `backend/src/`.
4. Frontend should proxy third-party calls (Stripe, Cloudinary, wallet APIs, AI) through the backend, consistent with existing routes — don't call these providers directly from `frontend/public/js/`.
5. Any schema change must come with a Prisma migration in `backend/prisma/migrations/` — never hand-edit `schema.prisma` without a matching migration.
6. `backend/prisma/schema.prisma.bak` and `backend/prisma/lp_migration.sql` exist outside the normal migration flow — flagged for review, do not delete or run without understanding what they are first.

## Claude Code Safety Rules

1. **Never break production.** Don't run `prisma migrate deploy`, Stripe webhook changes, or any deploy action against Railway/Vercel production without explicit confirmation in chat.
2. **Inspect before editing.** Read the actual file(s) — this project's docs describe structure, not verified business logic — before changing behavior.
3. **Small commits.** One logical change per commit, conventional-commit style.
4. **Follow the docs in `docs/`** for architecture/API/schema context, but treat any TBD marker as "verify first," not as settled fact.
5. **Ask before deleting.** Never delete files, drop DB columns/tables, or force-push without explicit confirmation — this applies especially to the flagged duplicates (`prismaClient.js`, `sw.js` ×2, `onboarding.js` ×2) until they've been diffed.
6. **Protect env secrets.** Never print, log, or commit `.env`, `.env.*`, or anything matching Clerk/Stripe/Cloudinary/Resend/Anthropic/Google key patterns.
7. **Respect backend/frontend boundaries** as described above.

## Open Questions (to resolve in a later phase, not now)

- Which deploy target (Railway vs Vercel) is authoritative for backend vs frontend?
- Is `backend/src/prismaClient.js` or `backend/src/utils/prismaClient.js` the one actually imported elsewhere?
- Are `backend/public/sw.js` and `frontend/public/sw.js` different on purpose?
- Are `frontend/public/onboarding.js` and `frontend/public/js/onboarding.js` duplicates or unrelated?
- What do `scripts/check-pass.js`, `check-subs.js`, `reset-test.js` do, and when should they be run?
- What is `backend/src/services/stripUploadService.js` for (Stripe? "strip" as in metadata stripping? possible typo)?

---

# Response Style

The project owner prefers concise engineering output.

Unless explicitly requested otherwise:

- Output only the requested artifact.
- Do not explain your reasoning.
- Do not narrate your work.
- Do not describe what you searched.
- Do not summarize completed work.
- Do not repeat the user's instructions.
- Do not add conversational filler.
- Do not add unnecessary introductions or conclusions.
- Prefer bullet lists over long paragraphs.
- Keep responses focused and professional.

When producing documentation:
- Output only the documentation.
- Do not explain how it was created.
- Do not include implementation notes unless requested.

When producing audits:
- Begin immediately with the findings.
- Group findings by category.
- Rank issues by importance.
- Finish with recommended next steps.
- Do not include recaps or status summaries.

When producing code:
- Show only the relevant code or diff.
- Keep explanations brief.
- Never rewrite unrelated code.

Assume the project owner is already familiar with QRAIVY and the repository.

The goal is to maximize useful information while minimizing unnecessary text.
