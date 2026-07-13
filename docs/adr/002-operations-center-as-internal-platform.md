# ADR-002: Admin Panel evolves into the QRAIVY Operations Center

## Status

Accepted

## Context

The existing internal Admin Panel (`frontend/public/admin.html` +
`backend/src/routes/adminRoutes.js` + `adminMiddleware.js`) grew
piecemeal to cover System Overview, Customers, API Keys, Revenue,
Cost Analytics, QR Analytics, System Health, and Error Logs. As
`docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md` lays out, the
founder's direction is for this surface to become a proper internal
Operations & Support platform — not a rename, but a real identity and
architecture to build against (Universal Search, Customer Journey, API
Inspector, System Integrity, AI Investigation).

## Decision

The existing internal Admin Panel is the QRAIVY Operations Center — an
evolution of the same codebase and surface, not a rebuild. Official
identity:

```
QRAIVY Operations Center
Platform Operations • Support • Intelligence
```

Everything shipped under this initiative (Operations Overview,
Universal Operations Search, and future capabilities defined in the
Support Playbook architecture) is Operations Center work, extending
`admin.html` / `adminRoutes.js`, not a parallel system.

## Consequences

- New Operations Center features are additive to the existing admin
  surface (new sidebar pages/sections), consistent with its current
  structure, rather than a separate app.
- The Support Playbook architecture doc is the forward-looking spec
  for where this surface is headed; features should be checked against
  it for consistency before being designed ad hoc.
- Naming and identity (sidebar title/subtitle) is now fixed — future
  work should not invent a different name for this surface.

## Related documents/commits

- Commit `4c7e32e` — "feat: establish QRAIVY Operations Center identity"
- Commit `aea39b7` — "feat: add Operations Overview foundation"
- `docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md` (untracked, DRAFT) —
  full forward-looking architecture (API Inspector, Customer/Business
  Journey, System Integrity, AI Investigation)
