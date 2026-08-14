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

## Future phases (not implemented)

3. Backfill deterministic historical identities only (see the approved architecture report's Section H for exactly which historical records are safe/uncertain/impossible to backfill).
4. Add nullable `customerId` FKs to `Subscriber`/`WebPushSubscription`/`LoyaltyCustomer`/`DealClaim`.
5. Switch reads to the canonical `Customer` model.
6. Customers UI consumes the real Customer API.
7. Legacy identity cleanup (separate future decision).
