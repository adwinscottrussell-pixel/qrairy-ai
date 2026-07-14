# Current Sprint

None active — SP3.1 complete, next sprint not yet scoped/approved.

# Repository

C:\Users\adwin\OneDrive\Desktop\qrairy.ai

# Branch

preview/sprint-2d-smart-qr-renderer (up to date with origin)

# Latest Pushed Commit

261499039ee64a4bacedefbadc170ab7c02a2f8d — feat: add SupportAction audit foundation

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

# Next Sprint

**Not yet defined or approved.** Per `docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md`
§12 (Recommended Build Order) and its Founder Amendments 2–3, the two
remaining Phase 1 items are both explicitly deferred pending their own
separate founder-approved plan docs — neither is scoped as a startable
sprint yet:

- **Operations navigation/routing foundation** — requires a decision on
  whether it means real deep-linkable routing or a narrower nav-shell
  restructuring, per Founder Amendment 2.
- **`GET /ops/logs`** — requires a separate approved logging architecture
  (storage, retention, access control, PII masking, secret redaction),
  per Founder Amendment 3.

No implementation should begin on either until one is scoped, written up
as its own plan doc, and founder-approved — consistent with this
project's established plan-then-implement pattern.

# Out of Scope (carried over, still applies until a new sprint is defined)

- Any frontend changes
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

- The SP3.1 migration (`20260713000000_add_support_action`) exists in the
  repo but has **not** been applied to any database — do not run
  `prisma migrate deploy` for it without explicit founder confirmation.
- Do not apply the still-unapplied search-index migration
  (`20260712000000_add_search_indexes`) either.
- Do not modify `main`.
- Do not begin implementation on the next sprint until it is scoped and
  founder-approved.
