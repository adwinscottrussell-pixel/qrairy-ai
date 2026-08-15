# Canonical Customer Foundation

**Status**: Phase 1 (infrastructure only) — schema exists, not deployed to production, not referenced by any application code yet.

## The three concepts, kept deliberately separate

- **`Customer`** — canonical identity: that this person exists and which business (`ownerUserId`) they belong to. Existing does **not** imply consent to anything.
- **`CustomerIdentity`** — the one or more ways QRAIVY recognizes that customer again (`cid`, `email`, `wallet_serial`, `push_endpoint`, `phone`, `whatsapp`, `external_crm`, ...). A recognition signal, not a permission.
- **`CustomerConsent`** (already in production, unchanged by this work) — independent permission to communicate over a specific channel, tracked per consent cycle. A `Customer` can exist with zero active consents.

A Customer record existing must never be read as implying email marketing consent, push consent, SMS consent, or WhatsApp consent. Consent is tracked exclusively in `CustomerConsent`.

## Tenant anchor: `ownerUserId`, not `slug`

An earlier local-only draft of this foundation (2026-08-11) anchored `Customer` to a single landing page (`slug`). That draft was never applied to production and has been superseded by this version.

`Customer.ownerUserId` — the authenticated business owner (Clerk `User.id`, the same field already used as `LandingPage.userId`) — is the real tenant boundary today, confirmed by inspecting the actual schema: no `Business`, `Account`, or `Location` model exists; `User → LandingPage` is direct and flat (see `docs/adr/004-multi-location-hierarchy.md`, "Accepted; not yet implemented").

Anchoring to `ownerUserId` instead of `slug`:
- lets one Customer span multiple landing pages owned by the same business, instead of being artificially confined to one page;
- is the smallest upgrade path to the future `Brand → Locations → Landing Pages` hierarchy — `ownerUserId` today is exactly who a future Brand's owner would be, so promoting it to a `brandId` later is a straightforward swap, not a redesign.

`slug` is retained on both `Customer` and `CustomerIdentity` as **optional first-touch/source context only** — never the ownership or uniqueness anchor.

## `cid` is a browser/device signal, not proof of a unique human

`cid` ("cTok") is generated entirely client-side (`CUSTOMER_ID_HELPER_JS` in `backend/src/controllers/lpController.js`): a `localStorage`-persisted random token (`crypto.randomUUID()` or a `Date.now()+Math.random()` fallback), unauthenticated, unverified by any server.

Consequences, confirmed by tracing the actual code:
- **Not stable across devices or browsers** — a new device or a cleared `localStorage` produces a new `cid` for the same real person.
- **Not tenant-scoped at generation time** — the storage key is a fixed `"cTok"` string, so the same browser could in principle present the same `cid` value to two unrelated QRAIVY businesses. This is exactly why `CustomerIdentity`'s uniqueness is scoped `[ownerUserId, type, value]`, not global — the same raw `cid` value under two different `ownerUserId`s must always resolve to two separate rows, never one.
- **Never a sufficient signal on its own** for merging across businesses, and only a *strong-but-needs-confirmation* signal even within the *same* business across different landing pages (see the merge-rules section of the approved architecture report).

## Anonymous `Scan` records

`Scan` carries no `cid`, no session token, and no identity signal of any kind (`qrId`, `userAgent`, `ip`, `referer` only). Anonymous Scan records must **not** be retroactively attached to a `Customer` without a deterministic identity signal existing on the scan itself — none currently does, so `Scan` stays unlinked until/unless a future feature captures one.

## Phase 1 scope (this change)

Additive only:
- `Customer`, `CustomerIdentity` tables created.
- `CustomerChannel` (the superseded draft's name for the same concept) renamed to `CustomerIdentity` — confirmed safe: zero application code referenced `prisma.customerChannel` anywhere.
- The premature `customerRecordId` columns/FKs the superseded draft had added to `Subscriber`, `WebPushSubscription`, `Pass`, `LoyaltyCustomer`, and `DealClaim` have been removed — those models are back to their exact pre-Phase-1 shape. Linking them to `Customer` is later-phase work.
- `CustomerConsent` is completely untouched — no new relation to `Customer` yet.
- No backfill, no dual-write, no existing API or frontend behavior changed.

## Phase 2 — Canonical Dual Write (implemented)

**One service, `backend/src/services/customerIdentityService.js`, is the only place that resolves or creates `Customer`/`CustomerIdentity` rows.** No controller duplicates this logic.

- `resolveOrCreateCustomerIdentity({ ownerUserId, type, value, slug, source, verified })` — idempotent tenant-scoped resolve-or-create. Returns `null` (safe no-op, never throws) if `ownerUserId`/`type`/`value` is missing.
- `attachDeterministicIdentity({ customerId, ownerUserId, type, value, slug, source, verified })` — attaches a second identity to an already-resolved Customer, only for calls where the *current request* deterministically proves the relationship (e.g. the cid that just created a Pass owns that Pass's serial). Never used to infer a relationship from timing/slug/similarity.

**Dual-write creation paths wired (`backend/src/controllers/lpController.js`)**:

| Existing (legacy) write | Canonical write | Identity type | Tenant resolution |
|---|---|---|---|
| `handleSubscribe` — new subscriber and re-subscribe-after-unsubscribe branches | `resolveOrCreateCustomerIdentity` | `email` | `LandingPage.userId` (already looked up for the existing flow) |
| `handleWebPushSubscribe` | `resolveOrCreateCustomerIdentity` (only when `cid` present) | `cid` | `LandingPage.findUnique({slug}).userId`, looked up fire-and-forget |
| `handleGenerateAppleWalletPass` | `resolveOrCreateCustomerIdentity` (cid) then `attachDeterministicIdentity` (wallet_serial, same request) | `cid` + `wallet_serial` | `LandingPage.userId` (already looked up) |
| `handleStampConfirm` (Loyalty stamp) | `resolveOrCreateCustomerIdentity` | `cid` | `LandingPage.userId` (already looked up) |

**Intentionally not wired**: Google Wallet's `createGoogleWalletSaveUrl` (`googleWalletService.js`) — inspected and confirmed it never creates/upserts a `Pass` row itself (read-only `findUnique` only; the actual `Pass` row is created lazily by the stamp flow or Apple's own upsert). Dual-writing there would mean recording a `wallet_serial` identity for a serial that might not correspond to any real `Pass` yet — exactly the non-deterministic linkage this phase forbids. Flagged, not implemented; revisit once/if Google's flow gains its own deterministic Pass write. `Scan` and `DealClaim` are untouched per Phase 2 scope (Scan has no identity signal at all; DealClaim has no live redemption flow to hook).

**Concurrency strategy**: optimistic create, recover on conflict — not find-then-create alone, which is not race-safe. `Customer` + `CustomerIdentity` are created together inside one `$transaction`; if the identity insert hits the `@@unique([ownerUserId, type, value])` constraint (Prisma `P2002`), the whole transaction rolls back atomically (no orphaned `Customer` row), and the losing caller re-reads and converges on the row the winner just created. Verified directly: 10 simultaneous calls for one identical identity produced exactly 1 `Customer` and exactly 1 `CustomerIdentity` row.

**Failure isolation**: every canonical call is fire-and-forget (`.catch(() => {})`), placed strictly *after* the existing legacy write already succeeded, and never awaited into the HTTP response. A canonical-layer failure is logged (`[CustomerIdentity] ... failed: <type> owner: <ownerUserId> - <message>` — never the raw identity value) and has zero effect on the existing Subscriber/Push/Wallet/Loyalty behavior.

**Tenant isolation**: every resolution and every uniqueness constraint is scoped by `ownerUserId`, verified directly: same tenant + same cid/email twice resolves to the same `Customer`; different tenant + identical cid/email value produces a separate `Customer`; a missing `ownerUserId` is a safe no-op that creates nothing.

**No historical backfill occurred** — only brand-new activity from this point forward triggers a canonical write. **No new Prisma migration** — Phase 2 wrote to tables Phase 1 already created. **Read paths remain entirely legacy** — nothing anywhere reads from `Customer`/`CustomerIdentity` yet. **Customers UI remains canonical-data-pending** — `MOCK_CUSTOMERS` untouched.

## Phase 3 — Deterministic Historical Backfill (validated locally, not run against production)

**Script**: `backend/scripts/backfill-customer-foundation-phase3.js`. Supersedes the untracked `backfill-customer-foundation-phase1.js` (2026-08-11), which targeted the superseded slug-anchored draft (`customerChannel`, `customerRecordId` FKs) and is incompatible with the current schema — do not run it.

Dry run by default; writes only with `--apply`:

```
DATABASE_URL=... node backend/scripts/backfill-customer-foundation-phase3.js
DATABASE_URL=... node backend/scripts/backfill-customer-foundation-phase3.js --apply
```

Reuses `customerIdentityService.js` exclusively — the script contains no independent resolve/create logic, only the decision of which legacy rows are deterministic enough to submit to it. Every legacy table is read-only; nothing is ever written to `Subscriber`, `WebPushSubscription`, `Pass`, `LoyaltyCustomer`, `LoyaltyCustomerAlias`, `StampEntry`, `Scan`, `DealClaim`, or `CustomerConsent`.

**Eligible sources**:

| Source | Rule | Identity type(s) | Source tag |
|---|---|---|---|
| `LoyaltyCustomer` | `slug` → `LandingPage.userId` resolvable | `cid` | `backfill_loyalty_customer` |
| `LoyaltyCustomerAlias` | FK-linked to an already-resolved `LoyaltyCustomer` row (deterministic: same real customer by construction) | `cid` | `backfill_loyalty_customer_alias` |
| `WebPushSubscription` | `cid` present (non-null) and slug resolvable | `cid` + `push_endpoint` | `backfill_webpush` |
| `Pass` | `loyaltyCustomerId` populated AND `Pass.slug` matches its linked `LoyaltyCustomer.slug` (mismatch = skipped as ambiguous). Resolves via the linked `LoyaltyCustomer.customerId` — never reverse-parses `serialNumber`. | `wallet_serial` | `backfill_pass` |
| `Subscriber` | non-null `email`, slug resolvable. Normalized identically to the live Phase 2 write (`email.toLowerCase().trim()`) so backfilled and live rows always converge. Never merged with any cid-based Customer — a different `type`, so it can never collide under `[ownerUserId, type, value]`. | `email` | `backfill_subscriber_email` |

**Excluded sources**:

| Source | Reason |
|---|---|
| `Scan` | Carries no identity signal of any kind (`qrId`/`userAgent`/`ip`/`referer` only) — never processed. |
| `DealClaim` | No live claim/redemption endpoint exists yet, so a `DealClaim.cid` has no deterministic proof tying it to a real redemption event. Script counts rows only (`totalRows`, `rowsWithCid`) and links nothing. |

**Tenant resolution**: always `slug → LandingPage.userId`, the same path Phase 2's live dual-writes use — never a model's own denormalized `userId` field, for consistency across every source. A row with no slug, no matching `LandingPage`, or a `LandingPage` with a null `userId` is skipped and counted (`skippedNoSlug` / `skippedNoLandingPage` / `skippedNoOwner`), never guessed.

**Idempotency**: every write goes through `resolveOrCreateCustomerIdentity`/`attachDeterministicIdentity`'s existing idempotent, race-safe resolve-or-create logic — re-running the script (dry run or apply) after a successful apply finds every identity already resolved and creates nothing further. Verified locally: a second dry run after apply produced zero `wouldCreate` across every source.

**Cross-system convergence verified locally**: a `LoyaltyCustomer` row, its `LoyaltyCustomerAlias` rows, and a `Pass` linked via `loyaltyCustomerId` for the same tenant all converged onto one `Customer`. The same `cid` value under two different `ownerUserId`s produced two separate `Customer` rows (tenant isolation held). A `Subscriber` email for the same tenant as an existing cid-based `Customer` produced a distinct `Customer` — never merged.

**Local validation performed**: synthetic fixtures in `qraivy_phase1_test` covering a plain loyalty cid, a duplicate alias cid (same as its parent, and a genuinely different second cid), the same cid under two businesses, WebPush with and without cid, a safe wallet identity, an ambiguous Pass (slug mismatch vs. its linked LoyaltyCustomer), a missing LandingPage, a LandingPage with a null `userId`, a pre-existing Phase 2 canonical identity, and a Subscriber email-only candidate. Full integrity check passed: every `Customer` has a non-null `ownerUserId`, every `CustomerIdentity` belongs to a `Customer`, `CustomerIdentity.ownerUserId` always matches its parent `Customer.ownerUserId`, zero duplicate `[ownerUserId, type, value]` rows, zero orphan `Customer` rows, `CustomerConsent` untouched (0 rows), legacy table schemas unchanged (no new columns).

**Local apply executed** (`qraivy_phase1_test` only): first dry run projected 5 new `Customer` / 8 new `CustomerIdentity` rows; `--apply` created exactly that (`Customer` 1→6, `CustomerIdentity` 1→9); a second dry run immediately after reported zero `wouldCreate` across every source (idempotency confirmed). Post-apply integrity re-check: 0 null `ownerUserId`, 0 orphan `CustomerIdentity`, 0 `ownerUserId` mismatches, 0 duplicate `[ownerUserId,type,value]`, 0 orphan `Customer`. Every legacy table's row count was identical before and after (`Subscriber`, `WebPushSubscription`, `Pass`, `LoyaltyCustomer`, `LoyaltyCustomerAlias`, `PassDevice`, `StampEntry`, `Scan`, `DealClaim`, `CustomerConsent` all unchanged) — only `Customer`/`CustomerIdentity` changed. Source tags on the created rows were exactly `backfill_loyalty_customer`, `backfill_loyalty_customer_alias`, `backfill_webpush`, `backfill_pass`, `backfill_subscriber_email` — no ambiguous values.

**Not run against production.** Not committed as a migration (no schema change — Phase 1 already created these tables). No Customer-facing API or frontend change in this phase. Committed: `42cb715`.

## Phase 4 — Canonical Customer Read API (backend only, not wired to UI)

**No schema migration.** Every endpoint reads from tables Phase 1 already created; nothing new required.

**Files**: `backend/src/services/customerQueryService.js` (all Prisma access — the only place that queries `Customer`/`CustomerIdentity`/`LoyaltyCustomer`/`Pass`/`PassDevice`/`StampSettings` for this API), `backend/src/services/customerDtoService.js` (pure DTO-shaping, no Prisma calls — reused identically by list/detail so derivation rules never diverge), `backend/src/controllers/customerController.js` (thin HTTP layer), `backend/src/routes/customerRoutes.js`, registered at `/customers` in `backend/src/index.js`.

**Endpoints** (all `requireAuth`, tenant-scoped by `req.userId` → `Customer.ownerUserId`):

| Endpoint | Purpose |
|---|---|
| `GET /customers/summary` | Aggregated counts for the authenticated owner |
| `GET /customers` | Paginated, searchable, filterable canonical Customer list |
| `GET /customers/:id` | Single Customer detail DTO |
| `GET /customers/:id/activity` | Deterministic identity-lifecycle timeline |

**Not implemented — `/customers/:id/consents`**: `CustomerConsent` has no deterministic linkage to `Customer`/`CustomerIdentity` in the current schema (only `slug` + `subscriberId`, confirmed by direct schema inspection — its own comment states "no Customer/CustomerChannel link in B2A"). `Subscriber` likewise has no FK to `Customer`. Joining by email would not be deterministic (`Customer.primaryEmail` is never set by any write path today — see below). Deferred rather than invented.

**Tenant security**: every list/summary query is scoped by `ownerUserId` in the `WHERE` clause. Detail/activity use a single `findFirst({ id, ownerUserId })` — never find-then-compare — so a Customer belonging to another tenant and a nonexistent id both resolve to the same `null` → `404`, never confirming existence of another tenant's id (deliberately different from this codebase's existing find-then-403 convention, chosen here to avoid an existence-confirmation side channel).

**Cross-tenant collision fix (found and fixed during this phase, not shipped)**: an early draft of the loyalty-lookup batching keyed `LoyaltyCustomer` rows by raw `cid` value alone. `LoyaltyCustomer.customerId` (cid) is only unique per `[slug, customerId]`, not globally — cid is a shared-browser token with no tenant awareness at generation (see Phase 1 above) — so two different tenants' rows can share the same cid string. Keying by raw cid let one tenant's loyalty data silently overwrite another's map entry for a colliding cid. Fixed by keying every loyalty lookup (`fetchLoyaltyByIdentityPairs`, `resolveLoyaltyCustomerIds`, `resolveRewardReadyCustomerIds`) by the composite `(slug, cid)` pair instead — safe because `LandingPage.slug` is globally unique. Caught by inspecting real output, not by the first test pass (two fixtures happened to share the same `rewardReady` value, masking it); a dedicated regression test now asserts the exact collision scenario.

**Email exposure**: the DTO exposes the resolved `email`-type identity value directly (`channels.email.address` / detail `primaryEmail`) — the one deliberate exception to "never return raw identity values." The approved Customers UI displays a real email address per row, and the authenticated business owner is entitled to see their own customer's contact info. `cid`, `push_endpoint`, and `wallet_serial` values are never exposed. `Customer.primaryEmail` itself is not used as the source — no Phase 2/3 write path has ever set it (a known, documented gap), so the DTO derives the display email from the `email`-type `CustomerIdentity` instead.

**Channel derivation**:
- `email.known` = has an `email` identity. `email.marketingAllowed` = always `null` — not "false" — because consent cannot be deterministically linked (see the deferred consents endpoint above).
- `push.subscribed` = has a `push_endpoint` identity. Presence-only: `WebPushSubscription` has no active/expired column in the schema.
- `wallet.passExists` = has a `wallet_serial` identity. `wallet.installed` = a real `PassDevice` registration exists for that serial — the only genuine "added to wallet" signal; a `Pass` row existing alone only proves one was generated.

**Loyalty aggregation rule** (documented, not silent — a Customer can have more than one `cid` identity, e.g. via `LoyaltyCustomerAlias` convergence, and each may be its own `LoyaltyCustomer` membership): the **list** DTO flattens to the single most-recently-active membership (by `lastStampAt`, falling back to `createdAt`). The **detail** DTO returns every membership as a structured array instead of flattening — verified locally with a two-membership fixture.

**Smart segments**:

| Segment | Status | Rule |
|---|---|---|
| Reward Ready | Ready | Any linked `LoyaltyCustomer` membership has `rewardReady = true` |
| Wallet Customers | Ready | Has a `wallet_serial` identity |
| Inactive 30+ Days | Ready | `Customer.lastActivityAt` is null or older than 30 days (kept current by Phase 2's `touchExisting`) |
| Most Engaged | **Deferred** | No engagement-score formula exists anywhere in this codebase; not invented here |

**Presentation status**: a UI-facing computed field (`presentationStatus`: `active` \| `new` \| `reward_ready` \| `inactive`, or the canonical value passed through for `merged`/`anonymized`/`deleted`), recomputed on every read — never written back to `Customer.status` (the canonical lifecycle field, which remains exactly `active | merged | anonymized | deleted`).

**GDPR/lifecycle**: list/summary default to `status: 'active'` only; `merged`/`anonymized`/`deleted` Customers are excluded by default and only returned via an explicit `?status=` filter. No merge-redirect behavior implemented — no merge write path exists anywhere in Phase 1-3, so there are no `merged` rows to test against yet.

**Query strategy**: list/detail/summary each run a small, fixed number of queries regardless of page size — one `Customer` query, one batched `CustomerIdentity` query for the whole page (`customerId IN (...)`), one batched `LoyaltyCustomer` query, one batched `Pass`+`PassDevice` query — never one query per row.

**Explicitly excluded from any endpoint**: `Scan` (never queried — no identity signal exists on the row, no per-customer visit count is fabricated), `StampEntry`/`RewardEvent` (no direct Customer link, would require the same Pass→loyaltyCustomerId ambiguity guard as Phase 3 for a nice-to-have), ambiguous Pass linkage (only `wallet_serial` identities already resolved by Phase 2/3 are used — no `serialNumber` parsing anywhere in Phase 4).

**Local validation**: 47 tests against synthetic two-tenant fixtures in `qraivy_phase1_test` (tenant isolation for list/detail/summary/search/segments, pagination and bounded `limit`, default-status exclusion, channel/loyalty derivation, multi-membership flattening vs. structured array, wallet-installed-vs-exists distinction, activity determinism, and the cross-tenant collision regression above) plus 5 routing/auth-wiring tests (unauthenticated and forged-token requests correctly rejected with `401`). All passing. Not run against production; `Customers` UI (`MOCK_CUSTOMERS`) not touched.

## Phase 5 — Customers UI Integration (deployed to preview, not yet production-approved)

**Commit**: `0f14e75` (on top of merge commit `317b243`, which reconciled 15 origin-only commits with local's Phase 1-4 work — see that commit's message for the conflict-resolution record). File: `frontend/public/dashboard.html`, `#section-customers` only.

**Endpoints consumed**: `GET /customers/summary`, `GET /customers` (page/limit/search/segment), `GET /customers/:id`, `GET /customers/:id/activity`. `/customers/:id/consents` not consumed — not implemented in Phase 4.

**Loading model**: real API calls are deferred until the section is actually opened (`window.custInitPage()`, idempotent, called from the desktop sidebar handler, the `?section=customers` deep link, and the `showSection('customers')` dispatcher) rather than firing eagerly at parse time — this script block runs before `initDashboard()`'s Clerk auth is guaranteed ready, same reasoning `loadLoyaltyDashboard()` already used.

**Frontend → DTO mapping**: KPI cards read `totalCustomers/emailCustomers/pushCustomers/walletCustomers/loyaltyCustomers` directly (no relabeling). Table rows use `displayName` (falls back to `email`, then a generic label — `displayName` is not yet set by any write path, a known Phase 2/3 gap, not new here), `channels.email/push/wallet`, `loyalty.stampCount/stampGoal` (flattened list snapshot), `lastActivityAt` (relative time), `presentationStatus` (mapped onto the existing `active/new/reward/inactive` badge set — `reward_ready` → `reward`). Detail drawer additionally uses `primaryEmail`, `channels.wallet.passExists`/`installed` (rendered as three distinct states: installed / pass created but not installed / no pass — never claims install from `passExists` alone), and `loyalty.memberships[]` in full (never flattened to one, unlike the table's necessarily-simplified snapshot).

**Consent**: the old mock "Consent" drawer section is removed entirely, not faked — `channels.email.marketingAllowed` is always `null` from Phase 4 (no deterministic `CustomerConsent` linkage exists yet), so there is nothing real to render there. The "Reachability › Email" row uses `channels.email.known` only, worded as "Known" / "No email on file" — never implies marketing permission.

**Smart Segments**: Reward Ready, Wallet Customers, and Inactive 30+ Days are live — each card's count comes from `GET /customers?limit=1&segment=<value>`, and "View Customers" applies that segment to the table via the same code path as the Filter menu. Most Engaged stays visually present with both actions disabled — no engagement-score formula exists anywhere in this codebase.

**Search / filter / pagination**: search is backend-scoped (debounced 300ms, `?search=`), never client-side filtering of an already-loaded page. All 6 filter menu options map 1:1 onto Phase 4 `segment` values. A minimal pagination footer (Prev/Next + "Page X / Y") was added below the table — the approved screenshot shows no pagination control, so this is the smallest addition that keeps a >25-row tenant from silently truncating, not a redesign.

**Deferred, reported rather than faked**:
- **Export** — no canonical Customer export endpoint exists in Phase 4. Button stays visible; click shows a "coming soon" toast. Never exports legacy `Subscriber` rows relabeled as Customers.
- **Create Campaign** (header + drawer + segment cards) — the existing AI Campaigns flow is built around selecting a landing-page program (`_slug`), with no parameter anywhere for "target these Customer ids/segment". Wiring a real hand-off would mean extending that system, out of Phase 5's read-only-API scope. Button stays visible; click shows a "coming soon" toast pointing at AI Campaigns.

**MOCK_CUSTOMERS**: left in the file, fully disconnected — confirmed by grep that its only remaining reference is its own declaration. Never used as an error fallback; a failed API call shows a contained error state with a retry link instead.

**i18n**: ~25 new `cust_*` keys added to both the `en` and `de` dictionaries (loading/error/empty/retry/segment/drawer strings), following the same `window._qt`/`_lt(key, fallback)` pattern already used by Loyalty/Subscribers — no second translation system.

**Local validation**: all 7 inline `<script>` blocks in `dashboard.html` parse cleanly (`new Function()` check per block); `<div>` tags remain balanced (487/487); the 52 Phase 4 backend tests (47 service-layer + 5 routing/auth) re-run clean after the merge. No browser/visual QA was performed locally (no browser automation available this session) — visual comparison against the approved screenshot requires the deployed preview, see below.

**Preview deployment**: pushed to `origin/preview/sprint-2d-smart-qr-renderer` (fast-forward, `c94149b..0f14e75`, no force). Vercel preview: `https://preview.qraivy.com/dashboard.html?section=customers`. **Production (`main`) not touched** — confirmed separate branch, separate Vercel target.

## Future phases (not implemented)

6. Add nullable `customerId` FKs to legacy tables, or a `CustomerConsent` → `Customer` linkage, so the deferred consent endpoint becomes possible.
7. Wire Export and Create Campaign to real canonical behavior.
7. Legacy identity cleanup (separate future decision).
