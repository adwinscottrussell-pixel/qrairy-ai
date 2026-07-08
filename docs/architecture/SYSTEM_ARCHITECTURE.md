# QRAIVY — System Architecture

> **Provenance**: reused from `docs/QRAIVY_MASTER_ARCHITECTURE.md` (that
> file still exists, unmodified). Renamed to match this structure's
> naming — content otherwise identical to the verified Phase 2 version.

> **Verified** from `backend/prisma/schema.prisma`, all `backend/src/routes/`,
> `backend/src/controllers/`, `backend/src/services/`, and `frontend/public/js/`
> files (Phase 2 — read directly). `backend/src/middleware/`, `utils/`,
> `config/`, and `index.js` were **not** part of this review — anything
> depending on them is marked accordingly.

## 1. System Shape (verified)

```
                 ┌────────────────────────────┐
   Browser  ───► │ frontend/public/*.html + js│  Clerk client SDK, plan-gated UI
                 └─────────────┬──────────────┘
                                │ REST/JSON, Clerk Bearer token
                 ┌──────────────▼──────────────┐
                 │ backend/src/  (Express)     │
                 │  routes/ → controllers/ → services/  │
                 └───┬────┬────┬────┬────┬─────┘
                     │    │    │    │    │
                     ▼    ▼    ▼    ▼    ▼
                Postgres Stripe Clerk Cloudinary  Resend
                (Prisma)                          (email)
                     │
        ┌────────────┼─────────────────┬───────────────┐
        ▼                              ▼                ▼
  Apple Wallet (APNs +           Google Wallet      Anthropic API
  passkit-generator)            (googleapis+JWT)   (4 separate call sites,
                                                       see AI section)
```

Also present, called via raw HTTPS (no SDK dependency, so not visible in
`package.json`): **Firecrawl** (website scraping for AI landing-page
generation) and **ElevenLabs** (text-to-speech voice welcome messages).

## 2. Authentication Flow (verified)

- **Identity provider: Clerk.** Frontend loads `window.Clerk`, calls
  `Clerk.load()`, reads `Clerk.user` and `Clerk.session.getToken()`.
  Confirmed in `frontend/public/js/session.js` and `auth-guard.js`.
- **Frontend guards are UX-only, not security.** `admin-guard.js`'s own
  header comment states this explicitly: "This is a UX convenience layer,
  NOT the security boundary. Real security is enforced server-side in
  adminMiddleware.js." Both `auth-guard.js` (any logged-in user) and
  `admin-guard.js` (admin role) hide the page (`visibility: hidden`) until
  Clerk resolves, then reveal or redirect.
- **Backend**: routes use a `requireAuth` middleware (sets `req.userId`) and
  a `requireAdmin` middleware (sets `req.adminUser`, checks
  `publicMetadata.role === 'admin'` per `adminRoutes.js`'s header comment).
  **The actual middleware implementations were not read in this phase** —
  only their call-site usage across every route file.
- **Inconsistency found**: `loyaltyAdminController.js`'s `getCustomers`
  function uses `req.auth.userId` instead of the `req.userId` pattern used
  by every other handler in the same file, and queries a non-existent
  `clerkUserId` field — see `DATABASE_SCHEMA.md` Discrepancy #3.
- **API key auth** is a separate path (`apiKeyAuth` middleware) for
  third-party/GHL integration — independent of Clerk, scoped by
  `req.userPlan`/`req.userId` set from the key record. Depends on the
  `APIKey` model, which — see `DATABASE_SCHEMA.md` Discrepancy #1 — doesn't
  exist in the schema currently reviewed.
- **Client-side plan gating**: `frontend/public/js/session.js` defines a
  `QRairySession` module with a `GATES` map (dashboard, analytics,
  subscribers, campaigns, walletPasses, aiLandingPage, aiAssistant,
  dynamicQr, push, adminPanel → allowed plan tiers) and a session type enum
  (`anonymous`, `free`, `trial`, `premium`, `admin`). This mirrors — but is
  a separate implementation from — the backend's `requirePlan`/tier-check
  logic in `tierRoutes.js`. Confirm both are kept in sync manually; nothing
  in the code shares this configuration between frontend and backend.

## 3. AI Architecture (verified — four separate integration points, not one)

There is **no centralized AI service module or `/ai` route** despite
`routes/aiRoutes.js` existing — it's confirmed empty (just an unused Express
router). Real AI usage is spread across four call sites, using three
different calling conventions:

1. **`controllers/designController.js`** — uses the `@anthropic-ai/sdk`
   package (the only site that does). Generates a full HTML print design
   (model `claude-sonnet-4-20250514`), then renders it to PDF/PNG via
   `puppeteer-core` + `@sparticuz/chromium` (serverless-compatible headless
   Chrome). Requires user auth (manual `getUserFromToken` check, not the
   `requireAuth` middleware).

2. **`controllers/lpController.js`'s `generateLPFromSite()`** — raw
   `https.request()` call to `api.anthropic.com` (model `claude-sonnet-4-6`),
   not the SDK. Takes scraped website content (from `scrapeWithFirecrawl()`,
   also in this file) and generates landing-page copy/structure as JSON.
   Runs asynchronously via `setImmediate()` after a page is published — not
   in the request/response cycle.

3. **`controllers/lpController.js`'s `handleChatLP()`** — a second, separate
   raw `https.request()` call to the same Anthropic endpoint (model
   `claude-haiku-4-5-20251001`), for the customer-facing AI chat widget on
   published landing pages. Public endpoint, no auth.

4. **`controllers/loyaltyAdminController.js`'s `generateCampaignMessage()`**
   — a third calling style, native `fetch()` (not `https.request`, not the
   SDK) to the same Anthropic endpoint (model `claude-haiku-4-5-20251001`),
   generating push-notification copy (title/body/cta as JSON) for loyalty
   campaigns.

**Note on model naming**: these calls reference model strings
(`claude-sonnet-4-20250514`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`)
as literal values in the code — this documentation does not verify whether
those model identifiers are currently valid/active; that's a runtime concern
for whoever maintains the Anthropic API integration, not something this
read-only review can confirm.

## 4. Wallet System (verified)

Two wallet providers, both tied to the **loyalty stamp card**, not a generic
wallet-pass product (see below for the separate, seemingly-incomplete
business-card pass feature):

**Apple Wallet** (`services/passService.js`'s `generateSmartQRPass()`,
`services/apnsService.js`, `controllers/walletController.js`):
- Builds a `.pkpass` via `passkit-generator`, signed with a cert/key pair
  from `APPLE_PASS_CERT_PEM`/`APPLE_PASS_KEY_PEM` env vars (base64-encoded)
  plus Apple's WWDR G4 intermediate cert (fetched once per process and
  cached in memory).
- Implements Apple's actual Wallet Web Service protocol — device
  registration, unregistration, latest-pass-fetch with `If-Modified-Since`
  support, and a log endpoint — these are called by Apple's servers, not the
  QRAIVY frontend.
- Push updates use raw HTTP/2 + a manually-signed ES256 JWT
  (`services/apnsService.js`) — no third-party APNs library, consistent
  with there being no such package in `package.json`.
- A serial number encodes the slug (and optional per-customer ID) directly
  as `sqr-{slug}` or `sqr-{slug}-{cid}` — a code comment explains this
  explicitly replaced an earlier reverse-parsing approach that broke for
  slugs containing hyphens.

**Google Wallet** (`services/googleWalletService.js`):
- Uses `google-auth-library` + a service account credential
  (`GOOGLE_WALLET_KEY` env var, JSON or base64) to create/update a
  `loyaltyClass` and per-customer `loyaltyObject` via Google's Wallet
  Objects REST API directly (via `fetch`, not a Google Wallet-specific SDK
  package — `googleapis` is in `package.json` but this file talks to the
  REST API directly instead).
- Save-to-Wallet uses a signed JWT (`jsonwebtoken` package, RS256) embedding
  the loyalty object, per Google's documented flow.

**Shared theming**: both providers pull visual theme data from
`services/walletThemes.js`, which also renders a hero/strip banner PNG using
`pngjs` (pure JS, no native image-processing dependency) when the business
hasn't uploaded their own photo.

**The separate, schema-inconsistent "business card" pass system**
(`passRoutes.js`, `passController.js`, `services/passService.js`'s
`generatePkpass()`/`buildPassJson()`, and part of `walletController.js`) is
a distinct feature — generic contact-card-style passes (name, company,
title, social links) rather than loyalty stamp cards. As documented in
`DATABASE_SCHEMA.md` Discrepancy #2, this path uses `Pass` model fields that
don't exist in the current schema, and its asset-upload dependency
(`storageService.uploadPassAsset`) is a stub that always returns `null`.
This looks like an earlier or parallel product direction that isn't
currently wired to a working data model — flagged for your review, not
assumed to be either dead or a bug without your confirmation.

## 5. Loyalty Flow (verified)

Stated directly in `loyaltyAdminController.js`'s header comment: *"A loyalty
program = LandingPage (owns userId + slug) + StampSettings (the config)."*
Confirmed by the code:

1. A `LandingPage` is published (`handlePublishLP`); loyalty is layered on
   top via `StampSettings` (upserted separately, keyed by `slug`).
2. Physical/digital stamp collection has **two parallel tracking
   mechanisms** that coexist:
   - A single anonymous `Pass` row per slug (`sqr-{slug}`) — used by
     `buildProgram()`, `adminStamp()`, `getStats()` in
     `loyaltyAdminController.js`. This is the "one shared card" model.
   - Per-customer rows in `LoyaltyCustomer` (unique on `slug`+`customerId`)
     — used by `getCustomers()` (though that function is confirmed broken,
     see above) and referenced when a `cid` query param is present on
     Google Wallet save.
   These are not reconciled by any code read in this phase — a customer
   could exist in `LoyaltyCustomer` without a corresponding per-customer
   `Pass` row (`sqr-{slug}-{cid}`), or vice versa.
3. Stamps are issued via NFC tap or QR scan hitting `GET /stamp/:slug/:token`
   (public), using a long-lived token (`StampToken`, 1-year expiry, reused
   only if it has 30+ days of remaining life — both figures literal in
   `getOrCreateStampToken()`).
4. Reward redemption is a second physical NFC tag / URL
   (`GET /redeem/:slug/:token`), sharing the same token as the stamp tap.
5. Every stamp/redeem writes a `StampEntry` (audit trail) and, on reaching
   goal, a `RewardEvent` (`status: 'earned'`, later `'redeemed'`).
6. An admin dashboard can also manually stamp (`POST
   /loyalty/programs/:id/stamp`) — same underlying update path as the
   customer-facing tap.

## 6. Push Notification Flow (verified)

A single "send push" action (`POST /lp/push/:slug`, `handleSendPush` in
`lpController.js`) fans out to **three channels simultaneously**, all from
one endpoint:

1. **Apple Wallet push** — via `passDevice` records for that slug's pass(es),
   triggers `apnsService.pushUpdateToDevices()` (a *silent* push telling
   Wallet to re-fetch the pass, not a visible notification itself — the
   actual message is written into the `Pass.lastMsg*` fields and shown when
   Wallet re-fetches the pass content).
2. **Web Push** — iterates every `WebPushSubscription` row for the slug,
   calls `webPushService.sendWebPush()` (VAPID via the `web-push` package)
   individually per subscriber (not batched).
3. **Email** — every `Subscriber` row with `gdprConsent: true` for the slug,
   via `emailService.sendCampaignEmail()` (Resend), individually per
   recipient, with per-recipient error handling (a failure on one doesn't
   stop the rest).

Every send is logged as one `PushCampaign` row (`sent` = successful Apple
Wallet push count only — email/web-push counts are returned in the response
but not stored on the campaign record itself).

**AI-assisted copy**: `loyaltyAdminController.js`'s `generateCampaignMessage`
provides AI-drafted title/body/cta for use in this flow (a separate step —
the business still has to submit the send).

## 7. Frontend Structure (verified, ~6,550 lines across `js/`)

- **Session/auth**: `session.js` (Clerk wrapper + plan-gating state machine),
  `auth-guard.js` (any-user gate), `admin-guard.js` (admin gate, explicitly
  UX-only per its own comment).
- **Routing**: `router.js` — binds `[data-flow]` elements to either the free
  (no-auth) or "smart" (Clerk-gated) flow; no client-side SPA router beyond
  this.
- **Editor**: `canvas.js`, `canvas-elements.js`, `panels.js`, `toolbar.js`,
  `smart-block-editor.js`, `editor.js` — a canvas-based visual editor,
  consistent with `editor.html` + the `css/canvas.css`/`editor.css`/
  `panels.css`/`toolbar.css` files seen in the file tree.
- **Landing page generation/rendering**: `landing-generator.js`,
  `landing-page-renderer.js`, `landing-section-registry.js` — client-side
  counterparts to the server-side `renderLP`/`renderPremiumLP` functions in
  `lpController.js`.
- **Shell/dashboard**: `shell-admin.js`, `shell-customer.js` — separate
  shells per user type, consistent with `admin.html` vs `dashboard.html`.
- **Misc**: `ai-modal.js` (chat widget UI), `onboarding.js` (also present
  duplicated at the `public/` root — still unresolved, see Phase 1 notes),
  `qraivy-lang.js` (likely i18n, not opened in detail), `smart-qr-categories.js`,
  `shortcuts.js`, `state.js`, `templates.js`, `utils.js`.

## 8. Deployment Architecture

**Not verified in this phase** — `railway.toml` (×2) and `vercel.json` (×2)
weren't part of this source archive. Still open questions from Phase 1:
which target is authoritative for backend vs. frontend.

## Confirmed Dead/Inconsistent Code (see docs for detail)

- `services/qrService.js`, `services/scanService.js` — unused, never called
- `passRoutes.js`/`passController.js`/parts of `walletController.js` — Pass
  model field mismatch against schema (Discrepancy #2)
- `routes/apiKeyRoutes.js`, parts of `adminRoutes.js` — depend on a missing
  `APIKey` model (Discrepancy #1)
- `loyaltyAdminController.js`'s `getCustomers` — non-existent field +
  inconsistent auth pattern (Discrepancy #3)
- `services/storageService.js` — stub, always returns `null`
- `controllers/lpController.js`'s `LP_CONTENT` object has a duplicate
  `event` key (defined twice, ~line 48 and ~line 157) — the second silently
  overrides the first in JavaScript; minor, but worth knowing if the first
  `event` template ever seems unreachable

## Not Yet Reviewed

`backend/src/index.js`, `backend/src/middleware/*.js`,
`backend/src/config/constants.js`, `backend/src/utils/*.js` (except as
referenced by name from files that were read), `backend/prisma/lp_migration.sql`,
`backend/prisma/schema.prisma.bak`, both `railway.toml` files, both
`vercel.json` files, and the frontend's `.html`/`.css` files.
