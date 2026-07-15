# Current Sprint

None active — MC-1 (Mission Control foundation) complete, committed, and
pushed. MC-2 not yet scoped or approved. Do not begin MC-2.

# Repository

C:\Users\adwin\OneDrive\Desktop\qrairy.ai

# Branch

preview/sprint-2d-smart-qr-renderer (up to date with origin)

# Latest Pushed Commit

0a23778 — feat: add Mission Control MC-1 foundation

# Previous Sprint (Completed)

**SP2.3 — Universal Operations Search UI** — COMPLETE, committed, and pushed.

- Commit: `f0067ad`
- Message: `feat: add universal operations search UI`
- Branch: `preview/sprint-2d-smart-qr-renderer`
- Push status: pushed to origin

**SP3.1 — Operations Center Foundation: SupportAction Audit Trail** — COMPLETE, committed, and pushed.

- Commit: `261499039ee64a4bacedefbadc170ab7c02a2f8d`
- Message: `feat: add SupportAction audit foundation`
- Branch: `preview/sprint-2d-smart-qr-renderer`
- Push status: pushed to origin
- Delivered: `SupportAction` Prisma model (`metadata Json?`), additive migration
  (`20260713000000_add_support_action`, **not applied** to any database),
  `supportActionService.js` (reject-not-strip metadata validation:
  precise dangerous-key matching, prototype-pollution guarding, circular-
  reference detection, size limit), `opsSupportActionController.js`,
  `POST /ops/support-actions` (reuses `requireAdmin`), and a permanent
  test suite (`backend/tests/supportActionService.test.js`, 23/23 passing,
  following the `searchService.test.js` convention).

**MC-1 — Mission Control Foundation: Executive Brief + Founder Attention + Platform Health** — COMPLETE, committed, and pushed.

- Commit: `0a23778`
- Message: `feat: add Mission Control MC-1 foundation`
- Branch: `preview/sprint-2d-smart-qr-renderer`
- Push status: pushed to origin
- Delivered:
  - **Executive Brief** — single evidence-derived verdict sentence
    (healthy / degraded / critical / unavailable), outcome-focused
    founder-facing copy, no implementation detail (e.g. check counts)
    exposed.
  - **Founder Attention** — read-only findings list derived from
    deterministic health evidence (subsystem, severity, explanation,
    evidence, scope); explicit earned-silence empty state when nothing
    requires attention. No persisted lifecycle state, no correlation
    engine (out of scope this sprint — see below).
  - **Platform Health** — existing `/admin/health` rendering preserved
    exactly; heading relabeled for clarity only, no change to underlying
    meaning.
  - **Shared health/attention source of truth**:
    `backend/src/services/attentionService.js` — the single
    implementation `GET /admin/health` and `GET /ops/attention` both
    consume; no duplicated health-check logic.
  - `GET /ops/attention` (`backend/src/controllers/opsAttentionController.js`,
    reuses `requireAdmin`, no new auth path).
  - Permanent test suite: `backend/tests/attentionService.test.js`,
    17/17 passing, following the existing no-framework/mocked-Prisma
    convention (`searchService.test.js` / `supportActionService.test.js`).
- Implemented inside the existing Overview page in `admin.html` — no new
  page, no new nav item, no routing changes.
- No schema changes, no new migrations, no production database changes.

# Next Sprint

**MC-2 — not yet scoped or approved. Do not begin.**

Deferred out of MC-1, explicitly:

- **Founder Attention lifecycle actions** (acknowledge / defer / dismiss)
  — blocked on a separate founder decision to apply the still-unapplied
  SP3.1 `SupportAction` migration; not made as part of MC-1.
- **Correlation / grouping engine** — deferred until a second real
  finding source exists; a single health-check source has nothing to
  correlate against yet.
- **Mission Control MC-2** (remaining modules: AI Operations Brief,
  Command Bar, Investigation Queue, Operational Timeline, Recent
  Approved Actions, Operational Wins) — not scoped as a startable sprint.

No implementation should begin on MC-2 until it is scoped and
founder-approved — consistent with this project's established
plan-then-implement pattern.

# Out of Scope (carried over, still applies until a new sprint is defined)

- Any frontend changes beyond MC-1's Overview page additions
- `GET /ops/logs`
- Support Workspace
- Customer Journey
- Diagnostics
- API Inspector
- System Integrity
- Incident management
- AI Investigation Mode
- Running any production database migration without separate founder
  approval

# Important Safety Notes

- No production database migration was applied during MC-1. Both
  previously unapplied migrations remain unapplied:
  - `20260712000000_add_search_indexes`
  - `20260713000000_add_support_action`
- Do not run `prisma migrate deploy` for either without explicit founder
  confirmation.
- Do not modify `main`.
- Do not begin implementation on MC-2 until it is scoped and
  founder-approved.
