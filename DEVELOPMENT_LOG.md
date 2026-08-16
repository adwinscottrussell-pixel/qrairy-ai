# Development Log

Append-only sprint history. Newest entries at the bottom. Do not edit
past entries except to fix factual errors — this is a log, not a plan
(see `CURRENT_SPRINT.md`) or a state snapshot (see `PROJECT_STATE.md`).

---

**2026-07-12 — QDS Surface region inset**
Status: DONE
`surface.css` region-inset primitive added to support the Smart QR
Card layout; wired into `dashboard-shell.css`.
Commit: `a3e42d1`

---

**2026-07-12 — Legacy OneSignal removal**
Status: DONE
Removed OneSignal integration end-to-end: backend controllers/routes,
docs, frontend SDK and service-worker files. Security-motivated
cleanup, not part of the QDS migration plan.
Commit: `dc1dc5a`
Follow-up: `Subscriber.oneSignalId` (`schema.prisma:53`) still needs a
Prisma migration to drop it — not yet done.

---

**2026-07-12 — QRAIVY Operations Center identity**
Status: DONE
Admin Panel rebranded to "QRAIVY Operations Center / Platform
Operations • Support • Intelligence". Establishes the identity the
rest of the Operations Center work builds on.
Commit: `4c7e32e`

---

**2026-07-12 — Operations Overview foundation**
Status: DONE
Operations Overview page built in `admin.html` (platform summary
stats).
Commit: `aea39b7`

---

**2026-07-12 — Universal Operations Search architecture**
Status: DONE
Architecture defined for Universal Operations Search: entity
inventory, endpoint gap analysis, ranking/masking rules, grouped
resolver design. Refines `QRAIVY_SUPPORT_PLAYBOOK_v1.md` §4/§11 into a
concrete spec.
Commit: `f575a70`
Doc: `docs/architecture/QRAIVY_UNIVERSAL_OPERATIONS_SEARCH_v1.md`

---

**2026-07-12 — Universal Operations Search backend**
Status: DONE
`GET /ops/search` shipped: `opsSearchController.js`, `searchService.js`
(grouped resolvers for users, landing pages/businesses, QR codes,
subscribers, wallet passes; ranking, masking, per-resolver timeout
guard), tests, and the `20260712000000_add_search_indexes` Prisma
migration (committed, not yet applied to the database).
Commit: `d150799`

---

**SP2.3 — Universal Operations Search UI**
Status: IN PROGRESS (implemented, uncommitted, awaiting founder
approval)
Frontend consumer of `/ops/search` added to `admin.html`: dedicated
Search page (sidebar), 300ms debounce, Enter-to-search, Escape-to-clear,
clear button, loading/empty/error/partial-group-failure states, result
cards for Businesses/Users/Subscribers/Wallet Passes/QR Codes
(duplicate Landing Pages group intentionally not rendered). No backend,
Prisma, or route changes.
Commit: none yet — do not commit until founder approval is given.

---

**2026-08-16 — Stadt Pocket Phase 1A: Network/Location/Business foundation — PRODUCTION**
Status: DONE, LIVE IN PRODUCTION
Separate work stream (`deploy/customer-foundation-phase1-4` → `main`, not
this branch). Additive schema (`Network`, `Location`, `Business`,
`BusinessMember`, `BusinessLocation`, `NetworkMember`, nullable
`LandingPage.businessId`) migrated to production; Business compatibility
backfill run (3 Businesses / 3 BusinessMembers / 5 LandingPages linked,
idempotency proven). `Customer.ownerUserId`/`LandingPage.userId` scoping
unchanged. See `docs/architecture/NETWORK_LOCATION_FOUNDATION.md`.
Commit: `217403e` (promoted to `main`, previous `main` SHA `3be60c9`).

---

**2026-08-16 — Stadt Pocket Phase 1B: Operations Center Network/Location/Business/Manager admin**
Status: IMPLEMENTED, TESTED, NOT DEPLOYED — pending founder visual approval
Extends `admin.html` with a new STADT POCKET nav group (Networks,
Locations, Businesses, Managers), platform-owner-only, `requireAdmin`-
protected. New service `backend/src/services/networkAdminService.js` +
routes in `adminRoutes.js`. Renamed the pre-existing "All Customers" nav
item/page to "Business Accounts" to resolve the naming collision with
Customer Foundation's end-consumer `Customer` concept (label-only, no
model/route change). 48 new tests (43 service + 5 route-auth), full
regression suite green. See
`docs/architecture/NETWORK_LOCATION_FOUNDATION.md` § Phase 1B.
Branch: `preview/stadt-pocket-phase1b-operations-center` (off `main` at
`217403e`). Commit: see branch history — not merged to `main`.
