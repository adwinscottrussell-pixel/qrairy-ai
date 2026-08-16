# Network + Location + Business Foundation

**Status**: Phase 1A (schema + backend foundation only) — additive models exist, migration created but **not applied to production**, no application code reads or writes them yet, no UI exists.

## Origin

Stadt Pocket (Hello Ulm) and future shopping-center groups both need QRAIVY to
manage an operator ecosystem curating many independent businesses across
locations — not a single business's own multi-outlet chain. Approved via the
Stadt Pocket Phase 1 architecture audit (inspection + design only) as the
canonical hierarchy:

```
QRAIVY Platform → Network → Location → Business → Customer
```

This sits **above** Customer Foundation, not inside it. See
`docs/architecture/CUSTOMER_FOUNDATION.md` — nothing there changes.

## Business = tenant, Clerk User = authenticated principal — never silently treated as identical again

Before this phase, the tenant boundary in every table was the raw Clerk
`User.id`, propagated directly as `ownerUserId`/`userId` (`QR.userId`,
`LandingPage.userId`, `Subscriber.userId`, `Customer.ownerUserId`). `Business`
is now the first-class tenant entity going forward; a Clerk user is the
authenticated principal who acts on behalf of one or more Businesses via
`BusinessMember`, not the tenant itself.

**Legacy `ownerUserId`/`userId` scoping remains authoritative during this
compatibility period.** No existing query, route, or Customer Foundation
service was changed. `Business` is additive and currently unreferenced by any
runtime code path.

## Why this is a *different* hierarchy than ADR-004

`docs/adr/004-multi-location-hierarchy.md` (accepted, unimplemented) models
`Brand → Locations → Landing Pages` — one company's own multiple storefronts.
Stadt Pocket's need is the opposite direction: one operator (`Network`)
curating many *independent* businesses across `Location`s. Both are
satisfied without two competing hierarchies: a `Business` with multiple
`BusinessLocation` rows *is* a multi-outlet brand — ADR-004's shape is a
special case of this one, not a separate model.

## Models added (additive, migration `20260816095718_add_network_location_business`)

- **`Network`** — the operator ecosystem itself (Stadt Pocket, a mall group).
  Not a business account. `type` is a free-text discriminator (e.g.
  `city_network`), no Stadt-Pocket-specific columns.
- **`Location`** — belongs to a `Network`. Generic `type` (`city` \| `mall` \|
  `district` \| `generic`) — no separate `City`/`Mall` tables.
- **`Business`** — the canonical tenant entity. Minimum fields only: `id`,
  `name`, `slug` (optional, unique), `primaryOwnerUserId`, `status`,
  timestamps. `primaryOwnerUserId` is a bare column (not a Prisma relation),
  matching the existing `LandingPage.userId` convention — this schema has
  never modeled `User` as a Prisma relation target.
- **`BusinessMember`** — Clerk-user↔Business membership. `role`: `owner` \|
  `staff`. `@@unique([businessId, userId])` prevents duplicate membership; a
  user can belong to multiple different Businesses.
- **`BusinessLocation`** — the participation join between a `Business` and a
  `Location` it operates in. `@@unique([businessId, locationId])`. Minimum
  fields only — no promotional/billing logic yet.
- **`NetworkMember`** — future permission structure only (`network_admin` \|
  `location_manager`). `locationId = null` means network-wide. No middleware
  reads this yet. `@@unique([userId, networkId, locationId])`.

  **Known limitation, deliberately deferred**: Postgres NULL ≠ NULL means the
  unique constraint above does not fully deduplicate two `network_admin`
  rows for the same `(userId, networkId)` both with `locationId = null` — a
  partial unique index would close this, but that requires enabling a Prisma
  preview feature this schema doesn't otherwise need yet. Deferred to the
  future Phase 3 service layer, which will enforce it at the write path
  instead. Not a risk today since nothing writes `NetworkMember` rows yet.

- **`LandingPage.businessId`** — new **nullable** FK to `Business`. `userId`
  is untouched; no existing ownership query changed; nothing requires this
  column to be set.

## Migration

`backend/prisma/migrations/20260816095718_add_network_location_business/` —
additive only (one new nullable column on `LandingPage`, six new tables, no
drops, no column type changes). Created via `prisma migrate diff` against a
real pre-change schema snapshot (this worktree's migration folder is a
curated non-linear subset of full history, so `prisma migrate dev`'s
shadow-database replay fails on an unrelated historical migration — a
pre-existing, unrelated structural property of this worktree). Applied and
verified locally. **Not applied to production.**

## Business backfill (compatibility projection, not yet run)

**Script**: `backend/scripts/backfill-network-location-business-phase1a.js`.
Same safety discipline as `backfill-customer-foundation-phase3.js`: dry run
by default, `--apply` required for writes, hard `assertLocalDatabase()` guard
(parses `DATABASE_URL` hostname, refuses anything but
`localhost`/`127.0.0.1`/`::1`).

**Source-of-truth decision**: a Clerk user is treated as "represents a
QRAIVY business" if and only if they own at least one `LandingPage`
(`LandingPage.userId`, non-null), cross-checked against a real `User` row.

- `LandingPage` was chosen because it *is* the actual unit of business
  presence in QRAIVY today — the strongest direct signal that exists.
- `QR.userId` alone was rejected: a QR can be anonymous/unclaimed
  (`businessName` nullable), too weak a signal on its own.
- `Subscriber.userId` was rejected: it's a denormalized copy of the
  LandingPage owner at signup time, not independent evidence.
- Platform admins are not distinguished by any Postgres column (the admin
  flag lives only in Clerk's `publicMetadata`) — if an admin also personally
  owns a real LandingPage, correctly getting a Business row is not a false
  positive, it reflects a real, separate product-usage fact.
- End-consumer Customer identities can never trigger this path: they never
  own a LandingPage.
- Any `LandingPage.userId` with no matching `User` row is skipped and
  counted, never guessed.

**Local correctness/idempotency proof**: seeded fixture (2 distinct owners,
1 with a matching `User` row and 2 LandingPages, 1 orphaned with no matching
`User`) — dry run correctly projected 1 Business + 1 BusinessMember + 2
LandingPage links, 1 owner correctly skipped as orphaned. `--apply` run
twice plus a post-apply dry run all converged on zero further writes.

**Read-only production projection** (via a disposable, byte-diff-verified
copy of the real script — deleted immediately after use; the real committed
script and its guard were never modified): production has **not** had this
migration applied, so `Business`/`BusinessMember`/`LandingPage.businessId`
don't exist there yet — the projection is a first-run projection computed
only from the two columns that already exist today (`LandingPage.userId`,
`User`):

```
ownerUserIdsDiscovered: 3
skippedNoMatchingUser:  0
businessesWouldCreate:  3
businessMembersWouldCreate: 3
landingPagesWouldLink:  5
totalLandingPages:      6
landingPagesWithNoUserId (excluded by design): 1
```

**The production write has not been run.** Running it requires: (1) applying
the Phase 1A migration to production, (2) separate founder approval, matching
the Customer Foundation backfill's approval gate.

## Compatibility guarantee

- `Customer.ownerUserId` / `CustomerIdentity.ownerUserId` — unchanged.
- `LandingPage.userId` and every existing `userId`-scoped query — unchanged,
  still authoritative.
- No auth/permission code changed. `requireAdmin` (Operations Center) and the
  business-owner auth path are both untouched.
- Existing single-business accounts need no migration action to keep working
  exactly as they do today; `Business` only becomes load-bearing once a
  future phase starts reading it.

## Future phases (not implemented)

2. Service layer: resolve "which Business/ownerUserId to scope by" above
   Customer Foundation reads, without modifying Customer Foundation itself.
3. `NetworkMember` permission middleware (`network_admin` /
   `location_manager`), including the deferred network-wide-membership
   dedup fix above.
4. Operations Center navigation: Networks/Locations/Businesses views.
5. Location Manager admin surface.
6. Secure business-admin handoff model (Network operator ↔ Business owner).
7. Customer-privacy/scope model distinguishing Business-customer
   relationships from Network/Location-level audience relationships.
8. Business backfill production write (pending the migration + separate
   founder approval).
