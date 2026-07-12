# QRAIVY Universal Operations Search — Architecture v1

Status: DRAFT — awaiting founder approval. Architecture and audit only. No
route, controller, service, schema, or frontend file was created or modified
to produce this document.

Scope: refines `QRAIVY_SUPPORT_PLAYBOOK_v1.md` §4 ("universal lookup bar")
and §11 (`GET /ops/lookup`) into a concrete search architecture — the
primary entry point into the Operations Center. Everything here is a delta
from the Support Playbook doc, not a competing design; where the two
overlap, this document is the detailed spec for that one surface.

---

## 1. Existing Searchable Entities

Verified directly against the current repo.

| Entity | Model | Identifiers today | Where exposed today |
|---|---|---|---|
| User (business owner / account) | `User` | `id` (= Clerk user ID, Clerk is the identity provider — there is no separate "Clerk User" record), `email`, `phone`, `stripeCustomerId` | `/admin/users`, `/analytics/admin/users` — full dump, client-filtered by email substring only (`admin.html:417,861`) |
| QR | `QR` | `id` (uuid), `businessName`, `originalUrl` | `/admin/qr-analytics` — top 20 by scan count only, no lookup by id/name |
| Landing Page / Business | `LandingPage` | `slug` (unique), `businessName` | `/api/lp/:slug` (single get, exact slug only), `/api/lp` (owner-scoped list, no admin-wide access) |
| Subscriber | `Subscriber` | `email`, `slug`, `oneSignalId` (legacy, dead) | `/lp/subscribers/:slug`, `/loyalty/subscribers/summary`, `/loyalty/subscribers/:slug/detail` — all slug-scoped, no cross-account lookup |
| Wallet Pass | `Pass` | `serialNumber` (`sqr-{slug}` / `sqr-{slug}-{cid}`, unique), `id` (cuid) | `/pass/:id` — owner-scoped get by internal id only; no lookup by serial number anywhere |
| Loyalty Customer | `LoyaltyCustomer` | `customerId` + `slug` (composite unique) | `/loyalty/programs/:id/customers` — **broken today**, queries `LandingPage.clerkUserId`, a field that does not exist in `schema.prisma` |
| API Key | *(no model)* | n/a | `/admin/api-keys`, `/api/keys` — **both broken today**: `prisma.aPIKey` is called throughout (`adminRoutes.js:143,157`, `apiKeyRoutes.js:17,41,66,68`, `apiKeyAuth.js:12,41`) but `schema.prisma` has no `APIKey` model at all. Any of these code paths throws at runtime. |
| Scan | `Scan` | `id`, `qrId` | Not independently searchable; only ever read via `QR.scans` |

No entity is searchable by a partial/fuzzy match server-side today. The
only substring search in the entire codebase is client-side, over an
already-fully-loaded, unpaginated user list (`admin.html:861`,
`filterUsers()`).

---

## 2. Existing Endpoints Usable For Search

All mounted per `backend/src/index.js:86-98`.

| Method + Path | File:line | Returns | Fit for search |
|---|---|---|---|
| `GET /admin/users` | `adminRoutes.js:70` | all users, unpaginated | Data source only — no filtering, no query param |
| `GET /admin/overview` | `adminRoutes.js:21` | aggregate counts + 10 recent users | Not a lookup |
| `GET /admin/qr-analytics` | `adminRoutes.js:200` | top 20 QRs by scans | Not a lookup (ranked, not searchable) |
| `GET /admin/api-keys` | `adminRoutes.js:141` | **broken** (see §1) | n/a |
| `GET /analytics/admin/overview`, `/analytics/admin/users` | `analyticsRoutes.js:49,61` | duplicate of the two `adminRoutes.js` endpoints above, separate implementation (`analyticsService.js:108,158`) | Duplicate surface — unclear which is canonical, both would need reconciling before either becomes a search data source |
| `GET /api/lp/:slug` | `lpRoutes.js:131` | one landing page, exact slug | Exact-match resolver, not search |
| `GET /api/lp` | `lpRoutes.js:133` | owner-scoped list, unpaginated | Not admin-wide |
| `GET /pass/:id` | `passRoutes.js:19` | one pass, exact internal id, owner-scoped | Exact-match resolver, not search |
| `GET /lp/subscribers/:slug` | `lpRoutes.js:122` | subscribers for one slug | Scoped, not a global lookup |
| `GET /loyalty/subscribers/:slug/detail` | `loyaltyAdminRoutes.js:32` | subscriber detail for one slug | Scoped, not a global lookup |

**Zero endpoints today accept a free-text query parameter.** There is no
`?q=`, no `contains`, no `OR` clause anywhere in `backend/src/routes` or
`backend/src/controllers`.

---

## 3. Database Models That Would Participate

All 13 models in `schema.prisma` (206 lines, no other schema file):

`User`, `QR`, `Scan`, `Subscriber`, `LandingPage`, `Pass`, `PassDevice`,
`PassRegistration`, `PushCampaign`, `WebPushSubscription`,
`StampSettings`, `StampToken`, `StampEntry`, `RewardEvent`,
`LoyaltyCustomer`.

Reality that shapes the design (consistent with `QRAIVY_SUPPORT_PLAYBOOK_v1.md`
§0, independently reconfirmed by reading `schema.prisma` directly for this
audit):

- **No foreign keys** join `LandingPage`, `StampSettings`, `StampToken`,
  `StampEntry`, `LoyaltyCustomer`, `PushCampaign`, `WebPushSubscription` —
  all joined only by the `slug` string. A search result for "Business X"
  cannot be produced by one query; it is always a fan-out of independent
  slug-filtered queries, same as the Journey read path in the Playbook doc
  §4.
- **Only three indexes exist in the entire schema**: `Subscriber.slug`,
  `Subscriber.userId`, `Subscriber.status` (`schema.prisma:66-68`). Unique
  constraints (`LandingPage.slug`, `Pass.serialNumber`,
  `WebPushSubscription.endpoint`, `StampSettings.slug`, `StampToken.token`,
  `LoyaltyCustomer[slug,customerId]`) implicitly index those columns too —
  but `User.email`, `QR.businessName`, and `LandingPage.businessName` (the
  three fields a name-based search would filter on) have **no index at
  all**.
- **`APIKey` has no model** — confirmed by reading the full schema; this is
  not a naming mismatch, the table does not exist in Prisma's view of the
  world. Any search feature that wants to include API keys needs this
  fixed first, as a separate, explicit migration — not folded into the
  search work.
- **`QR.deletedAt` is referenced in code but not in schema** —
  `adminRoutes.js:210` filters `qR.findMany({ where: { deletedAt: null } })`
  against a field `schema.prisma`'s `QR` model does not define. This is a
  third schema-drift instance beyond the two (`APIKey`, `clerkUserId`)
  already flagged in the Support Playbook doc — new finding from this
  audit, flagged here for the same "verify before building on it"
  treatment.

---

## 4. Gaps

Ranked by what blocks the search feature vs. what merely limits it.

**Blocking:**

1. No server-side search/filter capability exists anywhere — every
   candidate data source is either an exact-match-by-key lookup or an
   unbounded full-table dump. A universal search cannot be built on top of
   client-side filtering (today's only precedent) at any scale beyond
   what's already loaded in one browser tab.
2. Two of the entities explicitly requested for coverage — **API Key** and,
   partially, **Loyalty Customer** (via the business lookup path) — sit
   behind currently-broken code (`APIKey` has no schema model;
   `getCustomers` queries a nonexistent field). Neither can be wired into
   search until fixed independently.
3. No admin-wide, cross-tenant read path exists for `Pass` (by
   serialNumber) or `LandingPage`/`QR` (by name substring) — today's
   endpoints are either exact-slug/exact-id or owner-scoped to the
   requesting user, neither of which fits a staff-facing global search.

**Scale-limiting (directly the sprint's Performance concern):**

4. Every list endpoint that exists is unbounded — no `take`/`skip` on
   `/admin/users`, `/api/lp`, or any subscriber list except
   `/admin/qr-analytics` (`take: 20`, but that's a fixed top-N, not
   pagination). At 10,000 businesses, `/admin/users` alone would return
   10,000+ full rows with nested `qrs`/`scans`/`subscribers` includes
   (`adminRoutes.js:74-81`) in one response.
5. The one filtering mechanism that exists (`filterUsers()`) requires the
   full dataset to already be in the browser. This is the exact pattern
   the Performance section rules out for anything beyond the current
   dataset size.
6. No index exists on the columns a name/email search would filter — see
   §3. `contains` queries against `User.email`, `QR.businessName`, or
   `LandingPage.businessName` today would be sequential scans.

**Structural (shapes the design, not blocking):**

7. No FK relations mean a single search hit on a `slug` cannot be resolved
   with one join — same fan-out cost the Playbook doc's Journey feature
   already accepts (§4 of that doc). Search result assembly per business
   will have the same shape.
8. Duplicate admin-data implementations (`adminRoutes.js` vs
   `analyticsRoutes.js`, §2 above) mean picking a search data source also
   means picking (or reconciling) which of the two becomes canonical — not
   strictly required for search to ship, but building search on top of
   both would encode the duplication further.

---

## 5. Recommended Architecture

Builds on, does not replace, `QRAIVY_SUPPORT_PLAYBOOK_v1.md` §4/§11.

**Relationship to the Playbook's `GET /ops/lookup`:** that endpoint (§11 of
the Playbook doc) is specified as a single-best-match typed resolver — one
query string in, one typed result out (`user | landing_page | pass |
subscriber`). Universal Operations Search, as scoped by this sprint, is the
**grouped, multi-result** version of the same problem: one query in,
*every* plausible match across *every* type, grouped for a results screen
rather than an immediate redirect. Recommend these share one resolver layer
and differ only in response shape, per Playbook Principle 8 ("converge,
don't fork") — not two independently-maintained matching implementations.

```
GET /ops/search?q=<query>&limit=<per-group>
```

- Mounted under `/ops`, reusing `requireAdmin` — no new auth surface
  (Playbook §2 Principle 8, §11).
- Read-only. No write path. Consistent with Diagnostics/System Integrity's
  read-only posture (Playbook §5, §7.4).

**Resolver-per-type pattern**, not one giant `OR` query across
unrelated tables:

1. Classify the query string against cheap, deterministic patterns first
   (before touching the DB): looks like an email → candidate `User`,
   `Subscriber`; looks like a UUID → candidate `QR.id`, `User.id`
   (Clerk IDs are also string IDs, not UUIDs — check format); starts with
   `sqr-` → candidate `Pass.serialNumber`; starts with `cus_` → candidate
   `User.stripeCustomerId`; otherwise → candidate slug (exact) and
   name/email substring (fuzzy) across `User`, `QR`, `LandingPage`.
2. Run only the resolvers the classification makes plausible, in parallel
   (`Promise.all`), each with its own timeout — a 3-character query
   shouldn't trigger a full-table substring scan across every model.
3. Each resolver returns its group pre-limited (`take: limit`, default
   5–10) with a `hasMore` flag — never an unbounded result into the
   response.

**Response shape:**

```json
{
  "query": "acme",
  "tookMs": 42,
  "results": {
    "businesses":   { "items": [...], "total": 3, "hasMore": false },
    "landingPages": { "items": [...], "total": 3, "hasMore": false },
    "users":        { "items": [...], "total": 1, "hasMore": false },
    "subscribers":  { "items": [...], "total": 12, "hasMore": true },
    "walletPasses": { "items": [...], "total": 1, "hasMore": false },
    "qrCodes":      { "items": [...], "total": 5, "hasMore": false }
  }
}
```

**Business Entity Clarification**

QRAIVY has no confirmed canonical `Business` model today — confirmed
against §3's model list; there is no `Business` table in `schema.prisma`.
For Phase 1 (§6):

- "Businesses" is a **presentation group** derived from existing
  `LandingPage` data (and, where useful, `QR.businessName`) — not a
  distinct backend entity and not a separate resolver. This document does
  not claim a `Business` database entity exists.
- "Businesses" and "Landing Pages" surface from the same `LandingPage`
  table per the Playbook doc §3's design note — same underlying resolver,
  kept as two labeled UI groups per the founder's stated examples, not two
  backend code paths.
- **Phase 1 deduplication rule:** a `LandingPage` row backs at most one
  "Business" card and one "Landing Page" card, keyed 1:1 by `slug`. No
  other source is merged into the "Businesses" group in Phase 1, so no
  duplicate-slug case can arise yet. If a later phase adds a second source
  of business identity (e.g. a `QR.businessName` with no matching
  `LandingPage.slug`), that source may only produce its own "Businesses"
  card when no `LandingPage` row shares its `slug` — it must never emit a
  second card for a `slug` `LandingPage` already covers.
- When Brand → Locations → Landing Pages (`docs/company/04_DECISIONS.md`)
  lands, the resolver migrates the "Businesses" group from `LandingPage`
  to the canonical `Brand` model — see §8 Future Expansion Path. Until
  then, "Businesses" is a view over `LandingPage`, not a preview of a
  `Brand` table that doesn't exist yet.

**Search Result Privacy (Data Masking)**

Universal search is a discovery surface, not a detail view — the
`/ops/search` response is deliberately less permissive than a record's own
detail endpoint (Phase 3, §6):

- Email addresses are masked by default (e.g. `j***@acmecoffee.com`) in
  every result item that surfaces one (`User`, `Subscriber`).
- Phone numbers are masked by default in every result item that surfaces
  one (`User`).
- Wallet/pass identifiers (`Pass.serialNumber`) are partially masked where
  appropriate (e.g. `sqr-acme-***-a1b2`) — enough to visually confirm a
  match, not enough to reconstruct the full identifier from the result
  alone.
- Search results never return push endpoints
  (`WebPushSubscription.endpoint`), tokens (`StampToken.token`), API keys,
  auth secrets, certificate material, or raw provider credentials, in any
  field, under any condition.
- Each result item returns only the minimum fields required to identify
  and open the record (per the Result card anatomy table, §7) — not the
  full row.
- Unmasked/full sensitive values are available only inside the record's
  own authorized detail view (Phase 3, §6). They are never embedded in the
  `/ops/search` response and never derivable client-side from a masked
  value.

**Result Ranking**

Ranking is deterministic within each result group (entity type). No AI or
relevance-model ranking in Phase 1 (§6), consistent with Playbook
Principle 5/6 — no result is presented with more confidence than the
matching logic actually supports.

Within a group, matches are ordered:

1. Exact internal ID match (`User.id`, `QR.id`, `Pass.id`, …)
2. Exact slug, email, serial, or external ID match (`LandingPage.slug`,
   `User.email`, `Pass.serialNumber`, `User.stripeCustomerId`, …)
3. Prefix match
4. Contains match
5. Most recently updated, as a tie-breaker, where a reliable timestamp
   field exists on that model

This ordering is applied per resolver, before the `take: limit` cap
described above — the cap truncates the ranked list, it does not affect
ranking order.

**Required before this is viable at scale (not optional, per the
Performance section):**

- New indexes: `User.email`, `QR.businessName`, `LandingPage.businessName`
  — one Prisma migration, additive only, no data change (per `CLAUDE.md`
  guardrail #5 — migration required, no hand-editing `schema.prisma`).
- Every resolver paginated from day one (`take`/`skip` or cursor), not
  retrofitted later.
- Defer Postgres trigram/full-text search (`pg_trgm` + GIN index) until
  row counts justify it — plain indexed `contains`/`startsWith` is
  sufficient through the low thousands the Performance section's own
  phasing (10 → 100 → 1,000) implies; revisit at the 10,000 tier if
  `contains` latency becomes the bottleneck. Don't build trigram search
  speculatively.

**Explicit non-goals for this endpoint**, consistent with Playbook
Principle 5/6: no result is ever a cached/stale snapshot presented as
current; no search result triggers any mutation; broken entities (`APIKey`,
`LoyaltyCustomer` via `getCustomers`) are excluded from the resolver set
until their underlying bugs are fixed, not silently included with wrong
data; no AI or relevance-model ranking in Phase 1 — ranking is the
deterministic order defined in Result Ranking above; no unmasked sensitive
field (email, phone, wallet/pass identifier, credential, token, or secret)
in the response — see Search Result Privacy above.

---

## 6. Implementation Phases

**Phase 1 — Search Backend Foundation**

- `/ops/search` response contract (§5)
- `requireAdmin` protection — no new auth surface (§5)
- Additive database indexes: `User.email`, `QR.businessName`,
  `LandingPage.businessName` (§5, §9)
- Resolvers for:
  - Users
  - Landing Pages
  - QR Codes
  - Subscribers
  - Wallet Passes
- Grouped, server-limited results (`take`/`skip`, `hasMore` per group,
  masked per Search Result Privacy, ordered per Result Ranking — §5)
- No frontend required to validate the backend contract — Phase 1 ships
  and is testable via the `/ops/search` response alone.

**Phase 2 — Operations Center Search UI**

- One search input
- Grouped results, per §7 UI Wireframe
- Loading, empty, and error states
- Keyboard navigation
- Open and Copy ID actions
- No dead "Investigate" action unless a real destination exists — until
  the Support Workspace entry point (Playbook §4) is live for a given
  entity type, that entity's result cards ship with Open/Copy actions
  only, not a stubbed Investigate button.

**Phase 3 — Detail Integration**

- Business/Landing Page profile
- User profile
- Subscriber profile
- Pass profile
- Investigation entry points wired in as each profile above becomes real,
  per the Playbook's own build order (§12) — not stubbed ahead of the page
  it would point to.

**Phase 4 — Deferred Entities**

- API Keys and Loyalty Customers are added to the resolver set only after
  their existing schema/controller defects (§1, §4) are fixed in
  separate, explicitly approved sprints — not folded into Phase 1–3 scope.

---

## 7. UI Wireframe

```
┌──────────────────────────────────────────────────────────────────┐
│  🔍  Search businesses, emails, slugs, QR codes, passes…         │
└──────────────────────────────────────────────────────────────────┘

  ▾ Businesses (3)                                    [see all 3]
  ┌────────────────────────────────────────────────────────────┐
  │ Acme Coffee Co.                              ● live         │
  │ acme-coffee-downtown · 1,204 scans                          │
  │                          [Open] [Investigate] [Copy Slug]   │
  └────────────────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────────────────┐
  │ Acme Coffee — Uptown                         ● live         │
  │ acme-coffee-uptown · 312 scans                              │
  │                          [Open] [Investigate] [Copy Slug]   │
  └────────────────────────────────────────────────────────────┘

  ▾ Users (1)                                          [see all 1]
  ┌────────────────────────────────────────────────────────────┐
  │ j***@acmecoffee.com                          pro plan       │
  │ Signed up 2026-02-11 · 2 QR codes                           │
  │           [Open] [Investigate] [Copy ID] [Open Dashboard]   │
  └────────────────────────────────────────────────────────────┘

  ▾ Subscribers (12 — showing 5)                       [see all 12]
  ┌────────────────────────────────────────────────────────────┐
  │ j***@acmecoffee.com                          subscribed     │
  │ acme-coffee-downtown · joined via email                     │
  │                                    [Open] [Copy Email]      │
  └────────────────────────────────────────────────────────────┘
  …

  ▾ Wallet Passes (1)                                  [see all 1]
  ┌────────────────────────────────────────────────────────────┐
  │ sqr-acme-***-a1b2                            8/10 stamps    │
  │ Apple Wallet · last stamp 3h ago                             │
  │           [Open] [Investigate] [Copy Serial]                │
  └────────────────────────────────────────────────────────────┘

  ▾ QR Codes (5)                                       [see all 5]
  …
```

**Result card anatomy** (per entity type, matching the founder's example
shape):

| Field | Business/Landing Page | User | Subscriber | Wallet Pass | QR Code |
|---|---|---|---|---|---|
| Title | `businessName` | masked `email` (fallback: id) | masked `email` | partially masked `serialNumber` | `businessName` (fallback: `originalUrl`) |
| Subtitle | `slug` + scan count | plan + signup date | slug + source | wallet type + last stamp | destination + scan count |
| Status | `status` (live/…) | plan badge | `status` (subscribed/…) | stamp progress | `isDynamic` badge |
| Quick actions | Open, Investigate, Copy Slug | Open, Investigate, Copy ID, Open Dashboard | Open, Copy Email | Open, Investigate, Copy Serial | Open, Investigate, Copy ID |

"Investigate" opens the Support Workspace entry for that entity (Playbook
§4); "Open" opens the entity's own page (customer dashboard, landing page,
etc.) where one exists; "Open Dashboard" is user-specific (their customer
dashboard). Every action here is read-only navigation or clipboard —
nothing in the result card itself mutates data, consistent with Playbook
Principle 9.

---

## 8. Future Expansion Path

- **Brand → Locations → Landing Pages** (`docs/company/04_DECISIONS.md`):
  when this hierarchy lands, "Businesses" becomes a `Brand`-level group
  with `LandingPage`s nested under it, not a flat list — the resolver
  layer's grouping key changes from `LandingPage` directly to `Brand`,
  without changing the search endpoint's external shape.
- **Incidents (Playbook §8)**: once incidents exist, a search hit on an
  affected slug/account should surface a "1 open incident" badge inline on
  the result card, sourced the same way Known Issues does today (Playbook
  §4).
- **API Inspector correlation (Playbook §6)**: once call-level evidence
  exists, a result card could surface "3 failed Anthropic calls in the
  last hour" as a live signal — this is exactly the kind of evidence AI
  Investigation Mode (Playbook §10.1) would want handed to it pre-scoped
  from a search hit, rather than starting investigation from zero context.
- **Recent / saved searches**: once usage exists to learn from — not
  needed for v1.
- **Keyboard-driven command palette** (`Cmd+K` style): a natural evolution
  of the same `/ops/search` endpoint once the Operations Center has actual
  routing (Playbook §3's "every top-level item reachable by direct URL" —
  a command palette needs that routing to exist first).
- **Full-text/trigram search**: deferred per §5, revisit once row counts
  in the low tens of thousands make plain `contains` measurably slow.

---

## 9. Files To Be Modified During Implementation

Listed for founder review — **none of these have been touched to produce
this document.**

**Backend — new:**
- `backend/src/routes/opsRoutes.js` — new `/ops` router (or extends
  `adminRoutes.js` if the founder prefers not to introduce a new prefix —
  open question, not decided here)
- `backend/src/controllers/opsSearchController.js` — `GET /ops/search`
  handler
- `backend/src/services/searchService.js` — per-type resolvers, query
  classification, parallel fan-out

**Backend — modified:**
- `backend/src/index.js` — mount the new router (one `app.use(...)` line,
  same pattern as the 12 existing mounts at lines 86-98)
- `backend/prisma/schema.prisma` — add indexes on `User.email`,
  `QR.businessName`, `LandingPage.businessName` (additive only)
- `backend/prisma/migrations/<timestamp>_add_search_indexes/migration.sql`
  — the corresponding migration (per `CLAUDE.md` guardrail #5, generated
  via Prisma, not hand-written)

**Frontend — new:**
- A new search bar + results view — exact location depends on whether the
  Operations Center shell (Playbook §3, §12 Phase 1) exists yet at
  implementation time. If it does not yet exist, this cannot be built as
  a standalone feature — it depends on Phase 1's navigation foundation
  landing first, per the Playbook's own recommended build order (§12).

**Not touched by this feature, but blocking two of the requested entity
types until fixed separately (§4 above):**
- `backend/prisma/schema.prisma` — add the missing `APIKey` model (its own
  migration, its own founder decision — schema drift fix, not a search
  feature)
- `backend/src/controllers/loyaltyAdminController.js:333` — fix
  `getCustomers`' `clerkUserId` reference

---

## Open Questions For Founder

1. Does Universal Search ship standalone, or does it wait for the
   Operations Center navigation shell (Playbook §12 Phase 1)? The
   Playbook's own build order puts navigation foundation first — this
   document doesn't override that sequencing.
2. Should `/ops/search` and the Playbook's `/ops/lookup` (§11) be the same
   endpoint with a `mode` param, or two endpoints sharing one resolver
   service? Recommend the latter (simpler contracts, shared logic) but
   flagging as a decision, not assuming it.
3. Fix `APIKey`'s missing schema model and `getCustomers`' `clerkUserId`
   bug as prerequisites, or ship search with those two entity types
   explicitly excluded/marked "not yet available" (Playbook Principle 5)
   and fix them later?
4. Which of `adminRoutes.js` vs `analyticsRoutes.js`'s duplicate
   `/admin/overview` + `/admin/users` pair becomes canonical, if either
   is to feed the User resolver — or does the search resolver query
   Prisma directly rather than reusing either existing endpoint (likely
   correct, since both return full unpaginated dumps unsuited to a
   resolver, per §4)?
