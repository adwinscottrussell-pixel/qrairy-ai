# Current Sprint

SP3.1 — Operations Center Foundation: SupportAction Audit Trail

# Repository

C:\Users\adwin\OneDrive\Desktop\qrairy.ai

# Branch

preview/sprint-2d-smart-qr-renderer (up to date with origin)

# Latest Pushed Commit

f0067ad — feat: add universal operations search UI

# Previous Sprint (Completed)

**SP2.3 — Universal Operations Search UI** — COMPLETE, committed, and pushed.

- Commit: `f0067ad`
- Message: `feat: add universal operations search UI`
- Branch: `preview/sprint-2d-smart-qr-renderer`
- Push status: pushed to origin

# SP3.1 Objective

Create the durable audit foundation for privileged Operations Center
actions by adding the `SupportAction` Prisma model and an
admin-protected `POST /ops/support-actions` endpoint.

# In Scope

- `SupportAction` Prisma model
- Additive Prisma migration
- `SupportAction` service/controller
- `POST /ops/support-actions`
- Route registration in `backend/src/routes/opsRoutes.js`
- Existing `requireAdmin` middleware
- Input validation
- Safe error handling
- Focused endpoint validation

# Out of Scope

- Any frontend changes
- Operations navigation or routing
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

# Acceptance Criteria

- Migration creates only the `SupportAction` table and required indexes
- No existing tables or columns are modified
- Unauthenticated and non-admin requests are rejected
- Required request fields are validated
- Successful records contain: `actorId`, `actorType`, `actionType`,
  `targetType`, `targetId` (when applicable), `metadata` (when
  applicable), `createdAt`
- Metadata must not store passwords, tokens, secrets, or unnecessary
  personal data
- No frontend files change
- No production migration is executed
- Focused validation confirms endpoint behavior

# Current Working State

- Documentation-only phase: `docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md`
  amended and accepted; `CURRENT_SPRINT.md` and `PROJECT_STATE.md` updated
  to reflect SP2.3 closeout and SP3.1 activation.
- No application code has been written for SP3.1 yet.
- Founder has approved the Support Playbook (with amendments) and the
  SP3.1 scope above. Implementation has not started.

# Next Action

Wait for founder review of these documentation updates before beginning
SP3.1 implementation (Prisma model, migration, controller/service,
route).

# Important Safety Notes

- Do not create the `SupportAction` Prisma model or migration until
  founder gives an explicit go-ahead to begin implementation.
- Do not modify `frontend/public/admin.html` as part of SP3.1.
- Do not implement `GET /ops/logs` as part of SP3.1.
- Do not apply the still-unapplied search-index migration
  (`20260712000000_add_search_indexes`) as part of this sprint.
- Do not modify `main`.
- Do not run any production migration without separate, explicit
  founder approval.
