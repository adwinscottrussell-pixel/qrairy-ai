# QRAIVY — Database Schema

> **Verified** against the actual `backend/prisma/schema.prisma` (read directly,
> Phase 2). Provider: **PostgreSQL** (`datasource db { provider = "postgresql" }`).
> Replaces the Phase 1 draft, which was inferred from migration filenames only.

## Models (as defined in schema.prisma)

### `User`
Core account record. `id` is a plain `String` (no `@default` generator) —
consistent with being populated from an external identity provider (Clerk)
rather than DB-generated.

| Field | Type | Notes |
|---|---|---|
| `id` | String (`@id`) | Set externally — matches Clerk user ID pattern seen in code (`req.userId`) |
| `email`, `phone` | String? | |
| `plan` | String | Default `"free"` |
| `accountType` | String? | Default `"free"` — **relationship to `plan` is unclear**, both default to "free" but are tracked separately; not resolved by any code read so far |
| `trialExpiresAt` | DateTime? | |
| `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` | String? | Populated by `stripeController.js` webhook handlers |
| `qrs` | QR[] | One-to-many |

### `QR`
Dynamic/static QR code record.

| Field | Type | Notes |
|---|---|---|
| `id` | String (`uuid`) | |
| `originalUrl` | String | |
| `businessName`, `siteContent` | String? | |
| `userId` | String? | Optional — anonymous/free QR codes have no owner |
| `isDynamic` | Boolean | Default false |
| `destinationUrl` | String? | Used when `isDynamic` |
| `lastScannedAt` | DateTime? | |
| `scans` | Scan[] | |
| `subscribers` | Subscriber[] | |

### `Scan`
One row per QR scan. `qrId` (required) → `QR`. Fields: `userAgent`, `ip`,
`referer`, `createdAt`.

### `Subscriber`
Email/notification subscriber tied to a `QR` (via `qrId`, optional) and/or a
`slug` (landing page). Notable fields: `oneSignalId` (String?, present but —
see Open Questions, no OneSignal integration was found anywhere in the code
read), `gdprConsent` (Boolean, default false — actively enforced in
`handleSubscribe`), `resendContactId`, `status`, `source`. Indexed on `slug`,
`userId`, `status`.

### `LandingPage`
The "Smart QR" landing page — the central object most features hang off of.

| Field | Type | Notes |
|---|---|---|
| `slug` | String (`@unique`) | Primary lookup key used everywhere (not `id`) |
| `businessName`, `websiteUrl`, `useCase` | | |
| `brandColor` | String? | Default `#ff5a1f` — this is the actual brand accent color used throughout (wallet passes, hero banners, email templates) |
| `logoUrl` | String? | |
| `userId` | String? | Owner — **note**: `loyaltyAdminController.js`'s `getCustomers` function queries a `clerkUserId` field on this model instead — **that field does not exist in this schema**, see Discrepancies below |
| `sections` | String? | JSON blob (stored as string, parsed with `JSON.parse` throughout) holding hero copy, theme, business info, AI-generated content, voice settings, action links, etc. — this is the real "content model" for the page, not normalized into columns |
| `qrType`, `template`, `status`, `scanCount` | | `status` default `"live"` |

### `Pass`
**This model has two different, incompatible sets of consumers — see
Discrepancies below.** As defined in schema:

| Field | Type | Notes |
|---|---|---|
| `serialNumber` | String (`@unique`) | Format `sqr-{slug}` (per-business anonymous pass) or `sqr-{slug}-{cid}` (per-customer pass) — confirmed in `passService.js` and `lpController.js` |
| `slug` | String? | Stored directly rather than reverse-parsed from `serialNumber`, per an explicit code comment explaining why (slugs contain hyphens, making reverse-parsing ambiguous) |
| `passTypeId`, `authToken` | | Apple Wallet identifiers |
| `lastMsgTitle`, `lastMsg`, `lastMsgLink` | String? | Last push message, shown on the pass back |
| `stampCount`, `stampGoal`, `rewardReady`, `totalStamps`, `rewardsEarned`, `lastStampAt` | | Loyalty stamp-card state |
| `devices` | PassDevice[] | |
| `registrations` | PassRegistration[] | |
| `rewardEvents` | RewardEvent[] | |

### `PassDevice`
Apple/Google Wallet device registration. `passId` → `Pass`, unique on
`[passId, deviceLibraryId]`. `walletType` default `"apple"`.

### `PassRegistration`
Apple Wallet Web Service registration record (separate from `PassDevice` —
both are written on registration, per `walletController.js`).

### `PushCampaign`
History of a "send push" action (see push flow in
`QRAIVY_MASTER_ARCHITECTURE.md`) — `slug`, `title`, `message`, `linkUrl`,
`sent` count.

### `WebPushSubscription`
Web Push (VAPID) subscription — `slug`, `endpoint` (`@unique`), `p256dh`,
`auth`.

### `StampSettings`
Per-slug loyalty program config — `goal` (default 10), `rewardName` (default
`"Free item"`), `enabled`, `color`.

### `StampToken`
Long-lived NFC/QR redeem token — `slug`, `token` (`@unique`), `expiresAt`.
Code enforces a minimum 30-day remaining lifetime before reusing an existing
token, and issues new tokens with a 1-year expiry.

### `StampEntry`
One row per stamp issued — `slug`, `passId`, `source` (e.g. `"admin"`,
customer self-serve).

### `RewardEvent`
One row per reward earned/redeemed — `slug`, `passId`, `rewardText`,
`status` (`"earned"` / `"redeemed"`), `redeemedAt`.

### `LoyaltyCustomer`
Per-customer loyalty tracking, unique on `[slug, customerId]` — `hasWallet`,
`stampCount`, `totalStamps`, `rewardsEarned`, `rewardReady`, `lastStampAt`.
**Coexists with, but is not the same mechanism as, the single anonymous
`Pass` row per slug** — see Discrepancies below.

## Relationships (verified)

```
User 1───N QR 1───N Scan
User 1───N QR 1───N Subscriber (via qrId, optional)
QR N───1 User (optional — anonymous QR codes have no owner)
Pass 1───N PassDevice
Pass 1───N PassRegistration
Pass 1───N RewardEvent
```

`LandingPage`, `StampSettings`, `StampToken`, `StampEntry`, `LoyaltyCustomer`,
`PushCampaign`, and `WebPushSubscription` are **not linked by Prisma relations**
— they're joined only by the shared `slug` string field, matched manually in
application code (confirmed throughout `lpController.js` and
`loyaltyAdminController.js`). This is a real architectural pattern here, not
an oversight to "fix" — flagging it because it means referential integrity
between these tables is enforced by application logic, not the database.

## Discrepancies Found (code vs. schema — verified, not inferred)

These were found by cross-referencing actual Prisma calls in
`controllers/`/`services/`/`routes/` against the model definitions above.
Flagging only, per Phase 2 scope — no fix attempted.

1. **`APIKey` model does not exist in `schema.prisma`, but is actively used.**
   `routes/apiKeyRoutes.js` (5 call sites) and `routes/adminRoutes.js` (2 call
   sites) call `prisma.aPIKey.findMany/create/update/findUnique`. There is no
   `model APIKey` (or similarly named model) anywhere in the schema file
   provided. Either the schema file is out of sync with the deployed
   database, or these code paths currently throw at runtime. Worth checking
   directly against the live database or a fuller schema export before
   assuming either.

2. **`Pass` model is used with two incompatible field sets.**
   - The schema-consistent usage (loyalty stamp cards): `lpController.js`,
     `loyaltyAdminController.js`, `googleWalletService.js`, and
     `passService.js`'s `generateSmartQRPass()` function all read/write
     exactly the fields defined in the schema above (`stampCount`,
     `rewardReady`, `serialNumber`, etc.).
   - A second, incompatible usage (a "digital business card" pass product):
     `controllers/passController.js`, `services/passService.js`'s
     `generatePkpass()`/`buildPassJson()` functions, and the internal-endpoint
     handlers in `controllers/walletController.js` (`handleManualPush`,
     `handlePassScan`) all read/write fields that **do not exist anywhere in
     this schema**: `userId`, `name`, `company`, `title`, `website`, `email`,
     `phoneNumber`, `socialLinks`, `membershipId`, `customFields`,
     `biography`, `contactData`, `aiInstructions`, `dynamicLinks`,
     `qrDestination`, `backgroundColor`, `foregroundColor`, `labelColor`,
     `logoUrl`, `thumbnailUrl`, `stripUrl`, `iconUrl`, `status`, `deletedAt`,
     `type`, `templateId`, `webServiceUrl`, `teamId`.
   - Calling `prisma.pass.create()` with those fields (as
     `passController.js`'s `handleCreatePass` does) would fail Prisma's
     schema validation as written. This strongly suggests the
     `passRoutes.js` / `passController.js` "business card wallet pass"
     feature is either non-functional against the current schema, or is
     built against a different/older schema than the one in this repo.

3. **`LandingPage.clerkUserId` referenced but does not exist.**
   `loyaltyAdminController.js`'s `getCustomers` function (line ~333) queries
   `{ id: req.params.id, clerkUserId: ownerId }` — the schema field is named
   `userId`, not `clerkUserId`. This function also reads `req.auth.userId`
   instead of `req.userId`, which is the pattern used by every other handler
   in the same file. Both point to this specific endpoint
   (`GET /loyalty/programs/:id/customers`) likely always returning 404, but
   this wasn't confirmed by running the code — only by reading it.

4. **`Subscriber.oneSignalId` field exists but no OneSignal integration was
   found.** The only push mechanisms found in the code are Apple APNs
   (`apnsService.js`), Web Push/VAPID (`webPushService.js`), and email
   (`emailService.js` via Resend). `adminRoutes.js`'s `/admin/health` endpoint
   does check `process.env.ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY` and reports
   an `onesignal` boolean, but no code was found that actually calls
   OneSignal's API. This field/env-check pair may be legacy from an earlier
   push implementation.

## Not Yet Reviewed

`backend/prisma/lp_migration.sql` and `backend/prisma/schema.prisma.bak`
still haven't been opened — they weren't part of this Phase 2 source archive
(only `schema.prisma` itself was included). Given discrepancy #1 above
(missing `APIKey` model), it's worth checking whether `schema.prisma.bak`
or the migration history explains the drift, next time these are available.
