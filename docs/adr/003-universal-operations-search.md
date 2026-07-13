# ADR-003: Universal Operations Search as the primary lookup mechanism

## Status

Accepted

## Context

`docs/architecture/QRAIVY_UNIVERSAL_OPERATIONS_SEARCH_v1.md` audited
the pre-existing state: zero endpoints in the codebase accepted a
free-text query parameter, the only substring search was a client-side
filter over an already-fully-loaded, unpaginated user list, and lookups
(users, QR codes, landing pages, subscribers, wallet passes) each lived
behind separate, inconsistent, scoped, exact-match-only endpoints. This
made "find this one thing across the platform" — the most basic
support/ops task — slow and inconsistent.

## Decision

Universal Operations Search, backed by `GET /ops/search` and a set of
grouped entity resolvers (`searchService.js`), is the primary lookup
mechanism for the Operations Center. It covers Users, Landing
Pages/Businesses, QR Codes, Subscribers, and Wallet Passes behind one
query parameter, with per-entity ranking (exact id → exact
slug/email/serial → prefix → contains), field masking for sensitive
data (email, phone, serial number), and per-resolver timeout guarding
so one slow/failing entity group degrades independently instead of
failing the whole search.

API Keys and Loyalty Customers are explicitly excluded from Phase 1
(broken schema/model issues, to be fixed separately per the
architecture doc §4/§6).

## Consequences

- Any new admin-facing lookup need should extend `searchService.js`'s
  resolver set rather than growing a new bespoke endpoint.
- The UI groups "Businesses" and "Landing Pages" both map to the same
  `LandingPage` resolver in Phase 1 — the UI renders only one of the
  two (Businesses) to avoid showing duplicate results; this is a
  known, deliberate Phase 1 simplification, not a bug.
- Sensitive fields (email, phone, wallet serial) are masked at the
  resolver level, not the UI level — any new consumer of `/ops/search`
  gets masking for free and should not re-mask or double-mask.

## Related documents/commits

- Commit `f575a70` — "docs: define Universal Operations Search
  architecture" (`docs/architecture/QRAIVY_UNIVERSAL_OPERATIONS_SEARCH_v1.md`)
- Commit `d150799` — "feat: add Universal Operations Search backend"
  (`opsSearchController.js`, `searchService.js`, tests, Prisma migration
  `20260712000000_add_search_indexes` — migration committed but **not
  yet applied** to the database)
- SP2.3 (uncommitted as of this ADR) — Universal Search UI consuming
  `/ops/search` in `admin.html`
