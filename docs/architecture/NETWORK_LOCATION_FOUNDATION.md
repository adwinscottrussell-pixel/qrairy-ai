# Network + Location + Business Foundation

**Status**: Phase 1A **live in production** (2026-08-16) — migration applied, Business compatibility backfill run (3 Businesses / 3 BusinessMembers / 5 LandingPages linked). Phase 1B (Operations Center platform-admin UI) implemented on a preview branch, **pending founder visual approval before production deploy** — see "Phase 1B" section below. Phase 1B-B1 (Business identity correction foundation) implemented on the same preview branch, **preview only, not promoted to production backend** — see "Phase 1B-B1" section below.

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

## Phase 1B — Operations Center platform-admin UI (implemented, preview only)

Extends the existing platform-owner Operations Center (`frontend/public/admin.html`,
`https://www.qraivy.com/admin.html`) with a **STADT POCKET** nav group:
Networks, Locations, Businesses, Managers. This is the platform owner's view
only — no City Manager / Location Manager dashboard, no consumer Pocket app,
no mall-specific UI. The same generic CRUD supports both the Stadt Pocket
(city) and Mall Group (shopping-center) shapes without any city/mall-specific
code — `Network.type`/`Location.type` stay free-text.

**Naming collision resolved**: the Operations Center's existing "All
Customers" (QRAIVY's own paying business accounts — `User` records) is now
labelled **Business Accounts**, both in the sidebar and page title. This is a
label-only change — no model, route, or query changed. Canonical end-consumer
`Customer` records (Customer Foundation) are unaffected and were never
reachable from that page.

**New service**: `backend/src/services/networkAdminService.js` — the only
place that writes `Network`/`Location`/`Business`/`BusinessLocation`/
`NetworkMember` on the platform-admin's behalf. Resolves Clerk `userId`s to
display info via the existing local `User` table (same source `/admin/users`
already uses) — never calls Clerk's API directly, never fabricates a user.

**New routes** (all `requireAdmin`-protected, in `backend/src/routes/adminRoutes.js`):
`GET/POST /admin/networks`, `GET/PATCH /admin/networks/:id`,
`GET/POST /admin/locations`, `GET/PATCH /admin/locations/:id`,
`GET /admin/businesses`, `GET/PATCH /admin/businesses/:id`,
`POST /admin/business-locations`, `PATCH /admin/business-locations/:id`,
`GET/POST /admin/managers`, `DELETE /admin/managers/:id`.

**Business creation was not exposed in the original Phase 1B** — Phase 1A's
backfill had already created one Business per existing owner, so there was
nothing to create yet. That assumption turned out to be wrong at the
*semantic* level (see "Phase 1B-B1" below): Business creation is now exposed,
scoped exactly to the correction it exists to enable.

**BusinessLocation** represents participation in a Location's business
ecosystem, not a postal address — a Business can be assigned to multiple
Locations (multi-outlet brand), and a Location can hold multiple Businesses.

**Managers** (`NetworkMember`): `location_manager`/`network_admin` role
assignment only — `locationId = null` means network-wide. Assigning a
Location that doesn't belong to the given Network is rejected. No permission
*enforcement* middleware exists yet — see item 3 below; the Operations Center
can only assign/list/remove the data rows.

**Deployment status**: implemented and tested on a new preview branch
(`preview/stadt-pocket-phase1b-operations-center`, branched from `main` at
`217403e`), **not merged to `main`**, **not deployed to production** —
pending founder visual review of the preview deployment.

## Phase 1B-B1 — Business identity correction: creation + LandingPage mapping foundation

**Corrects a Phase 1A assumption**: the backfill's "one Business per Clerk
User account" shim was never meant to be permanent business semantics — the
schema's own `BusinessLocation` comment already described the intended
"multi-outlet brand" shape. Real production evidence (one owner account with
three unrelated LandingPages — a personal/demo page, an explicitly-named
test page, and a real bakery) confirmed the shim conflates *authentication
identity* with *merchant identity*. Approved semantics going forward:

```
Clerk User   = authenticated principal/person/account
Business     = real merchant/company entity
LandingPage  = one or more Smart Pages belonging to a Business
BusinessLocation = that Business's participation in a Network/Location
```

One User may own/manage multiple Businesses; one Business may have multiple
LandingPages; a LandingPage belongs to at most one Business at a time
(nullable during this compatibility period — see below).

**New service functions** (`networkAdminService.js`):
- `createBusiness({ name, primaryOwnerUserId, status })` — `primaryOwnerUserId`
  must resolve to an existing `User` row (never creates a Clerk user).
  Business + its owner `BusinessMember` row are created in one
  `prisma.$transaction`, so a Business can never exist with no owner
  membership. Idempotent membership creation (checks for an existing
  `BusinessMember` first) matches the same pattern used everywhere else in
  this file.
- `listUnmappedLandingPages(ownerUserId)` — LandingPages owned by that user
  with `businessId: null`.
- `mapLandingPageToBusiness(landingPageId, businessId)` — the *only* write
  path touching `LandingPage.businessId`. **Critical tenant-protection
  rule**: rejected outright if `LandingPage.userId !== Business.
  primaryOwnerUserId` — no cross-owner mapping, no agency/staff exception
  exists yet. Supports remapping (moving an already-mapped page to a
  different Business owned by the same user) — no restriction based on the
  page's current `businessId`.
- `listBusinesses`/`getBusiness` now also return `isLegacyShim`: `true` when
  `Business.name` still equals the resolved owner's email/id — i.e., never
  renamed through the real creation flow above. No schema change; purely a
  computed read-model field so Operations Center can visually flag
  never-reviewed shim rows as **"Legacy Account Business"** without deleting
  or archiving anything automatically.

**New routes** (`requireAdmin`-protected, additive to the existing list):
`POST /admin/businesses`, `GET /admin/landing-pages/unmapped?ownerUserId=`,
`PATCH /admin/landing-pages/:id/business`.

**New Operations Center UI**: "+ Create Business" on the Businesses page
(owner selected from the existing `/admin/users` list, never a raw ID);
Business Detail gained an "Unmapped Landing Pages (same owner)" section with
an explicit **Attach** action per page — the admin chooses every mapping,
nothing here infers or groups pages automatically (no name-similarity
merge, no timestamp inference). Business rows/detail flagged **Legacy
Account Business** where `isLegacyShim` is true.

**Compatibility, re-verified for this phase**: `businessId` is referenced by
exactly two backend files in the entire codebase
(`networkAdminService.js`, `adminRoutes.js`) — grepped fresh, zero hits
elsewhere. Wallet (`Pass`/`PassDevice`/`StampEntry`/`RewardEvent`), Loyalty
(`LoyaltyCustomer`), and WebPush (`WebPushSubscription`) are all keyed by
`slug`, never touched here. `Customer.ownerUserId` is anchored to the Clerk
User, never to `Business.id` — a Business split changes nothing about
Customer dedup. `LandingPage.userId` is never written by this phase.

**Legacy shim rows are explicitly preserved, not migrated automatically**:
the three Phase 1A shim Business rows still exist untouched. The intended
cleanup sequence for a shim row, once an admin has manually split out its
real Businesses via the new UI, is *create → map → verify → archive*
(`Business.status = 'archived'`, the existing enum value — never delete).
That archive step is **not yet automated or triggered anywhere** — this
phase only builds the create+map capability a human uses to do the
splitting; deciding a shim row is fully "empty" and safe to archive is a
future, explicit action, not a side effect of mapping.

**LandingPage.businessId stays nullable** through this phase — tightening it
to `NOT NULL` requires proving backfill/mapping coverage is complete first,
which is out of scope here.

**Deployment status**: implemented and tested on
`preview/stadt-pocket-phase1b-operations-center`, preview only. Backend
diff not yet promoted to `main`/production (see the Phase 1B backend
promotion precedent — same "path-scoped `git checkout <commit> -- <path>`
onto fresh `main`" method would apply here too, not run this turn).

## Future phases (not implemented)

2. Service layer: resolve "which Business/ownerUserId to scope by" above
   Customer Foundation reads, without modifying Customer Foundation itself.
3. `NetworkMember` permission *middleware* (`network_admin` /
   `location_manager` actually gating access, not just data assignment —
   Phase 1B built the data/assignment side only), including the deferred
   network-wide-membership dedup fix above.
4. Location Manager admin surface (a separate, non-platform-owner dashboard).
5. Secure business-admin handoff model (Network operator ↔ Business owner) —
   Phase 1B's Business Detail view is explicitly read-only, no impersonation.
6. Customer-privacy/scope model distinguishing Business-customer
   relationships from Network/Location-level audience relationships.
7. ~~Business creation API (platform-owned onboarding state).~~ Done —
   Phase 1B-B1, scoped to the shim-correction workflow above.
8. Consumer Pocket app, Network Analytics, Deals/Campaigns, Featured
   Businesses, location push/audience — all explicitly out of scope through
   Phase 1B.
9. Guided shim-review workflow (bulk-list every shim Business's LandingPages
   for classification in one place) and the archive step for fully-split
   shim rows — Phase 1B-B1 built the underlying create/map primitives only,
   one Business at a time.
10. `LandingPage.businessId` NOT NULL tightening, once mapping coverage is
    proven complete.
