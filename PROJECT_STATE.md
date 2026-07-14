# QRAIVY — Project State

> Canonical project snapshot for Claude Code sessions. Complements
> `CLAUDE.md` (rules/conventions) and `docs/` (durable architecture) —
> does not duplicate them. Update this file at the end of each sprint.
>
> Last updated: 2026-07-14, from `git log`/`git diff` inspection at
> commit `2614990`, plus founder approval of the SP3.1 implementation.
> See `CURRENT_SPRINT.md` for the short-lived, keystroke-level view of
> the active sprint; this file tracks the broader project state.

## Project

QRAIVY — AI-powered QR code SaaS (dynamic QR, Smart Landing Pages,
loyalty, wallet passes, push).

## Current Branch

`preview/sprint-2d-smart-qr-renderer` — up to date with
`origin/preview/sprint-2d-smart-qr-renderer`, clean working tree.
Diverges from `main` at `0698055` ("docs: add QRAIVY preview deployment
plan"); `main` has since taken one follow-up commit of its own
(CORS allowlist fix) that this branch also carries.

## Current Phase

QDS (QRAIVY Design System) migration — replacing legacy hand-styled
frontend components with canonical QDS primitives (Surface, Button,
Input), one component family at a time, via founder-approved
plan-then-implement docs under `frontend/public/qds/docs/`.

## Current Sprint

**Current focus: QRAIVY Operations Center (Support Playbook pivot,
founder-set 2026-07-12).** This is the active initiative, with real
committed history on this branch:

- Operations Center identity established (`4c7e32e`) — admin panel
  rebranded "QRAIVY Operations Center / Platform Operations • Support
  • Intelligence".
- Operations Overview foundation built (`aea39b7`).
- Universal Operations Search architecture defined and committed
  (`f575a70`, `docs/architecture/QRAIVY_UNIVERSAL_OPERATIONS_SEARCH_v1.md`).
- Universal Operations Search backend committed and pushed (`d150799`)
  — `/ops/search`, `searchService.js`, grouped resolvers, tests.
- **SP2.3 — Universal Search UI**: **complete, committed (`f0067ad`),
  and pushed** to `origin/preview/sprint-2d-smart-qr-renderer`.
- **SP3.1 — Operations Center Foundation: SupportAction Audit Trail**:
  **complete, committed (`2614990`), and pushed** to
  `origin/preview/sprint-2d-smart-qr-renderer`. `SupportAction` Prisma
  model (`metadata Json?`), additive migration (unapplied),
  `POST /ops/support-actions`, and a permanent 23-test suite
  (`backend/tests/supportActionService.test.js`).
- **No active sprint** — see `CURRENT_SPRINT.md`. Next sprint not yet
  scoped or approved; see Next Recommended Sprint below.

`docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md` — **Accepted, Version
1.0** (Approved 2026-07-13, by Founder, Related Sprint: SP3.1), with
three amendments: repository grounding refreshed; Operations
navigation/routing deferred to its own future sprint; `GET /ops/logs`
deferred pending a separate logging-architecture approval. Committed
(`cacb998`), no longer untracked.

**Sprint 2D — Canonical Smart QR Card Renderer** (prior focus, in
progress on this branch, not yet merged to `main`, now paused rather
than abandoned):

- Smart QR Card architecture + migration plan written and approved
  (`QDS_SMART_QR_CARD_ARCHITECTURE_v1.md`, `..._MIGRATION_PLAN_v1.md`)
- Wave 1 executed: first Smart QR card migrated to the canonical
  Surface-based renderer (`21bb911`), spacing refined (`1a226ad`)
- New `surface.css` region-inset primitive added to support the card
  layout (`a3e42d1`)
- Unplanned, folded into this branch: legacy OneSignal integration
  fully removed for security (`dc1dc5a`) — not part of the QDS plan,
  a separate cleanup done opportunistically

Not yet done (see migration plan §7, now deferred behind the Support
Playbook pivot): Wave 2 (`.sqr-claimed-card`, both builders) and Wave 3
(status badges → real Badge component).

## Last Completed Sprint

**Sprint 2D.1–2D.2 — Smart QR Card planning + preview deployment
planning** (merged to `main` at `e7d209b`):

- QDS Badge system defined (doc only, no CSS shipped yet)
- Canonical Smart QR Card renderer scaffold added to `dashboard.html`
- `QRAIVY_PREVIEW_DEPLOYMENT_PLAN_v1.md` written (audit/plan only)
- Follow-up from that plan actioned: backend CORS allowlist opened for
  the Vercel preview origin

Before that: QDS Input system implemented and finalized, Dashboard KPI
cards migrated to QDS Surface, Prisma client duplication consolidated
into a single `backend/src/utils/prismaClient.js`.

## Current Platform Status

- **Dashboard** — mid-migration to QDS. KPI cards: done (QDS Surface).
  Smart QR cards: Wave 1 of 3 done (see Current Sprint). Sidebar,
  Subscribers, Campaigns, Loyalty, Analytics, Wallet, Settings sections:
  untouched, legacy styling, explicitly out of scope for this sprint.
- **Smart QR** — core create/scan/analytics flow stable and in
  production; visual layer (dashboard cards) actively migrating, see
  above.
- **Loyalty** — stamp-card + wallet loyalty flow, staff PIN-protected
  scanner, per-customer stamp counts, NFC redeem — production-validated
  (see `CHANGELOG.md`, 2026-06-27). No QDS migration work started here;
  out of scope for the current sprint per the migration plan.
- **Wallet** — Apple/Google Wallet pass generation, Wallet Pass Studio,
  premium per-customer rendering — stable, no open work identified in
  recent history.
- **Push** — legacy OneSignal integration fully removed this sprint
  (`dc1dc5a`): controllers, routes, docs, and frontend SDK/worker files
  all cleaned. `web-push` (VAPID) remains the intended push mechanism
  per `CLAUDE.md`; no new push feature work shipped this sprint. One DB
  leftover remains — see Known Outstanding Work.
- **Firecrawl** — used for AI-assisted landing page generation on
  onboarding (`lpController.js`, `qrController.js`,
  `onboarding.js`/`smart-editor.js`). Stable since the last fix
  (generic-template-text bug, `72a5b8a`); untouched this sprint.
- **AI** — Anthropic SDK powers `aiRoutes.js` / AI business generation
  onboarding. Untouched this sprint; last change was a model-ID revert
  (`34e0307`) after a deprecated identifier broke generation.
- **Operations Center** (formerly "Admin Panel" — `admin.html` +
  `adminRoutes.js`, rebranded `4c7e32e`) — active development, not part
  of the QDS migration scope. Operations Overview foundation shipped
  (`aea39b7`). Universal Operations Search backend shipped (`d150799`,
  `/ops/search`). Universal Search UI (SP2.3) shipped and pushed
  (`f0067ad`). SupportAction audit foundation (SP3.1) shipped and pushed
  (`2614990`) — `SupportAction` model, `POST /ops/support-actions`,
  23-test suite. No active sprint currently. Health-check endpoint is
  already clean of OneSignal references (no stale flag to fix).

## Recent Major Changes

- Smart QR Card polish: canonical renderer scaffold → first card
  migrated → spacing refinement (`21f105e` → `21bb911` → `1a226ad`)
- QDS Surface region inset primitive added to `surface.css` and wired
  into `dashboard-shell.css` (`a3e42d1`)
- Legacy OneSignal integration removed end-to-end: backend routes/
  controllers, docs, and frontend SDK/service-worker files (`dc1dc5a`)
- Backend CORS opened for the Vercel preview origin, following the
  preview deployment plan's recommendation (on `main` as `e7d209b`,
  on this branch as `44cd4f6`)
- QRAIVY Operations Center identity established (`4c7e32e`)
- Operations Overview foundation built (`aea39b7`)
- Universal Operations Search architecture defined (`f575a70`)
- Universal Operations Search backend shipped: `/ops/search`,
  `searchService.js` grouped resolvers, Prisma search-index migration
  `20260712000000_add_search_indexes` (`d150799`)
- SP2.3 Universal Search UI committed and pushed (`f0067ad`)
- Support Playbook accepted with amendments (repository grounding
  refresh; navigation/routing deferred; `GET /ops/logs` deferred)
- SP3.1 — SupportAction audit foundation committed and pushed
  (`2614990`): `SupportAction` Prisma model, additive migration
  (unapplied), `POST /ops/support-actions`, permanent test suite

## Known Outstanding Work

- **Database cleanup**: `Subscriber.oneSignalId` (`schema.prisma:53`)
  still exists after the OneSignal removal — needs a proper Prisma
  migration to drop it (do not hand-edit `schema.prisma` per
  `CLAUDE.md` guardrail #5).
- **Smart QR Card migration Waves 2–3**: `.sqr-claimed-card` (two
  drifted builders, 3-vs-4-button mismatch) not yet migrated; status
  badges blocked on a QDS Badge CSS component that doesn't exist yet
  (`qds/components/` only has `button.css`, `surface.css`, `input.css`).
- **Preview deployment open items** (from
  `QRAIVY_PREVIEW_DEPLOYMENT_PLAN_v1.md`): confirm which of the two
  identical `vercel.json` files the live Vercel project actually uses;
  confirm Preview Deployments are enabled; add the preview domain to
  Clerk's allowed origins.
- **Longstanding duplicates, still unresolved**: `backend/public/sw.js`
  vs `frontend/public/sw.js`; `frontend/public/onboarding.js` vs
  `frontend/public/js/onboarding.js`. (Prisma client duplication was
  already resolved — no longer outstanding.)
- **Prisma search-index migration** (`20260712000000_add_search_indexes`):
  exists in the repo, committed as part of `d150799`, but has **not
  been applied** to the database — do not run `prisma migrate deploy`
  for it without explicit confirmation.
- **Prisma SupportAction migration** (`20260713000000_add_support_action`):
  exists in the repo, committed as part of `2614990`, but has **not
  been applied** to the database — do not run `prisma migrate deploy`
  for it without explicit confirmation. Two unapplied migrations are now
  stacked on this branch; consider applying both together, in order,
  when founder approves a migration run.
- **Support Playbook** (`docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md`):
  Accepted, Version 1.0, committed (`cacb998`). Broader capabilities it
  defines beyond SP3.1 (API Inspector, Customer/Business Journey, System
  Integrity, AI Investigation, Operations navigation/routing,
  `GET /ops/logs`) are not yet started and — for navigation/routing and
  logging specifically — require their own separate founder-approved
  plan docs before implementation.
- **Next sprint**: not yet scoped or approved. See Next Recommended
  Sprint below.

## Production Status

- **`main`**: currently at `e7d209b`, one commit ahead of the fork
  point with this preview branch (CORS fix only). Untouched by all
  Operations Center work below. Represents the last founder-approved,
  mergeable state.
- **`preview/sprint-2d-smart-qr-renderer`**: active work branch, ahead
  of `main` by 11 commits (Smart QR card Wave 1 + Surface inset +
  OneSignal removal + Operations Center identity/Overview/Search
  architecture/Search backend/continuity docs/Search UI/SP3.1 planning
  docs/SupportAction audit foundation). Not yet merged.
- **Deployment**: frontend on Vercel (static, `frontend/public/`),
  backend on Railway (single environment, single production DB/Clerk
  instance — no isolated staging stack exists). Per the preview
  deployment plan, any preview URL still talks to the live production
  backend/DB — test only with existing bypass-plan dev accounts, never
  live customer data or Stripe/wallet-push flows.

## Important Architecture Decisions

(Full record: `docs/company/04_DECISIONS.md` — summarized here)

- Smart Landing Page (one per QR, by slug) is the platform's central
  object; every feature should attach to it, not stand alone.
- AI-generated landing pages (via Firecrawl + Anthropic) are the
  preferred onboarding path, not one option among several.
- Long-term data model is Brand → Locations → Landing Pages, for
  multi-location/agency support — design new work to stay compatible.
- Wallet passes are the answer to "on customer's phone," not a native
  app.
- Mobile-first for all customer-facing UX.
- QDS migrations must not invent new primitives unless a real gap
  blocks the work (e.g. Badge component) — page-level classes are kept
  as a bridge until the primitive exists.

## Next Recommended Sprint

**Not yet defined or approved.** SP3.1 is complete; per
`docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md` §12 (Recommended
Build Order) and Founder Amendments 2–3, the two remaining Phase 1
items each require their own separate founder-approved plan doc before
a sprint can be scoped:
- Operations navigation/routing foundation (real deep-linkable routing
  vs. a narrower nav-shell restructuring — undecided, per Amendment 2)
- `GET /ops/logs` (needs a separate logging-architecture approval:
  storage, retention, access control, PII masking, secret redaction,
  per Amendment 3)

Do not begin implementation on either until one is scoped in its own
plan doc and founder-approved, consistent with this project's
established plan-then-implement pattern.

Deferred, not dropped, behind the Operations Center pivot:
- Sprint 2D Wave 2 (`.sqr-claimed-card` migration)
- `Subscriber.oneSignalId` Prisma migration cleanup
- Preview deployment open items (`vercel.json`, Clerk preview domains)
- Applying the search-index migration (`20260712000000_add_search_indexes`)
- Applying the SupportAction migration (`20260713000000_add_support_action`)
