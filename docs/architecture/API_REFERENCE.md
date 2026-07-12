# QRAIVY — API Reference

> **Provenance**: reused from `docs/API_REFERENCE.md` (that file still
> exists, unmodified). Content identical to the verified Phase 2 version.

> **Verified** directly from `backend/src/routes/*.js` and their paired
> controllers (Phase 2). Mount paths (e.g. `/admin`, `/analytics`) are noted
> where a comment in the route file states them; where not stated, the
> mount path wasn't confirmed (that lives in `backend/src/index.js`, not
> included in this review — see Not Yet Reviewed at the end).
>
> Auth column: `public` = no auth, `Clerk (user)` = `requireAuth` middleware,
> `Clerk (admin)` = `requireAdmin` middleware, `API key` = `apiKeyAuth`
> middleware. Middleware implementations themselves were not read (not
> included in this source archive) — only their usage at the route level.

## Admin — `adminRoutes.js` (mount: `/admin`, per file header comment)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/overview` | Clerk (admin) | Platform totals: users, plan breakdown, QR/scan/subscriber counts, estimated MRR, 10 most recent users |
| GET | `/users` | Clerk (admin) | All users with QR/scan/subscriber counts per user |
| PUT | `/users/:id/plan` | Clerk (admin) | Body `{ plan }`, validated against `['free','starter','pro','business']` |
| PUT | `/users/:id/suspend` | Clerk (admin) | Sets plan to `free` (there is no separate "suspended" state — suspension = downgrade) |
| GET | `/api-keys` | Clerk (admin) | **See Discrepancies in `DATABASE_SCHEMA.md` — the `APIKey` model doesn't exist in schema.prisma** |
| PUT | `/api-keys/:id/revoke` | Clerk (admin) | Same caveat |
| GET | `/revenue` | Clerk (admin) | Plan breakdown + estimated MRR only (subset of `/overview`) |
| GET | `/qr-analytics` | Clerk (admin) | Platform-wide QR stats + top 20 QRs by scan count |
| GET | `/health` | **public, intentionally** (comment explicitly notes this — needed by Railway/uptime monitors) | Reports booleans for `db`, `anthropic`, `stripe`, `onesignal`, `clerk` env-var presence — does not prove those integrations work, only that keys are set |

The file's header comment states a hardcoded `ADMIN_SECRET_KEY` auth method
was removed in favor of Clerk JWT + `publicMetadata.role === 'admin'` — this
is documented in the source itself, not inferred.

## Analytics — `analyticsRoutes.js` (mount: `/analytics`, per file header)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/dashboard` | Clerk (user) | Calls `analyticsService.getCustomerDashboard(req.userId)` |
| GET | `/qr/:id` | Clerk (user) | Ownership-checked in the service layer |
| GET | `/admin/overview` | Clerk (admin) | |
| GET | `/admin/users` | Clerk (admin) | |

File header states: "Pages must NOT calculate analytics independently" — all
analytics reads are meant to flow through this service, confirmed as the
actual pattern in the service code.

## API Keys — `apiKeyRoutes.js`

For third-party/GHL (GoHighLevel) integration, per file header comment.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/keys` | Clerk (user) | Lists the user's own keys, key value never returned after creation |
| POST | `/keys` | Clerk (user) | Creates a key; `qrLimit` set by plan (`api_agency`→unlimited, `api_pro`→2000, else 500) |
| DELETE | `/keys/:id` | Clerk (user) | Soft-revoke (`isActive: false`), ownership-checked |
| POST | `/v1/qr` | API key | Public API — create QR |
| POST | `/v1/pass` | API key | Public API — forces `req.userPlan = 'business'`; calls the **schema-inconsistent** `handleCreatePass` (see Database Schema discrepancies) |
| GET | `/v1/analytics` | API key | Returns up to 100 QRs with `redirectUrl` pointing at `https://api.qraivy.com/r/{id}` |

Same `APIKey`-model-missing caveat applies to every `/keys` endpoint here.

## Design — `designRoutes.js`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/generate` | Clerk (user), via manual `getUserFromToken` inside the controller (not the `requireAuth` middleware used elsewhere) | AI + headless-Chrome print design generation — see AI Architecture below |

## Loyalty Admin — `loyaltyAdminRoutes.js`

All routes `requireAuth` (Clerk). "A loyalty program = a `LandingPage` + its
`StampSettings`" — stated directly in the file's own comment and confirmed
by the code.

| Method | Path | Notes |
|---|---|---|
| GET | `/programs` | List all programs for the logged-in owner |
| POST | `/programs` | Upsert `StampSettings` for an existing `LandingPage` (body: `slug`, `goal?`, `rewardName?`, `enabled?`) |
| GET | `/programs/:id` | |
| PUT | `/programs/:id` | Update goal/reward/enabled/businessName |
| PATCH | `/programs/:id/status` | Body `{ status: 'active'|'paused' }` |
| POST | `/programs/:id/stamp` | Admin manually issues a stamp to the program's single anonymous `Pass` |
| GET | `/programs/:id/stats` | |
| GET | `/programs/:id/customers` | **Confirmed broken as written** — queries a non-existent `clerkUserId` field and uses `req.auth.userId` instead of the `req.userId` pattern used everywhere else in this file (see Database Schema discrepancies) |
| POST | `/campaign/generate` | AI-generated push copy (title/body/cta) — see AI Architecture |
| GET | `/subscribers/summary` | Cross-channel (email + web push + wallet) subscriber counts per page |
| GET | `/subscribers/:slug/detail` | Masked email/endpoint/device list |

## Landing Pages — `lpRoutes.js`

The largest route file (37 endpoints). Grouped by function as found in the
file:

**Wallet pass generation & assets**
- `GET /lp/nfc-token/:slug`, `GET /lp/card/:slug`, `GET /lp/wallet/apple/:slug` — public
- `GET /lp/wallet/google/:slug` — public, also upserts a `LoyaltyCustomer` row if a `cid` query param is present
- `GET /lp/wallet-hero/:slug` — public, renders a PNG banner (pure-JS via `pngjs`, no image library dependency)
- `POST /lp/upload-logo/:slug`, `POST /lp/upload-strip/:slug` — Clerk (user), Cloudinary upload via multer memory storage, 5MB cap, PNG/JPG/WebP only

**Loyalty stamp/redeem (public — these are QR/NFC scan targets, not dashboard calls)**
- `GET /stamp/:slug/:token`, `POST /stamp/:slug/:token/confirm`
- `GET /redeem/:slug/:token`, `POST /redeem/:slug/:token/confirm`
- `POST /stamp/:slug/customer` — per-customer stamp variant
- `GET /lp/welcome/:slug` — first-visit enrollment

**Stamp settings (dashboard-facing)**
- `GET /lp/stamp/token/:slug`, `POST /lp/stamp/settings/:slug`, `GET /lp/stamp/settings/:slug` — no `requireAuth` on these three in the route file itself; comment says "auth required via frontend" — **server-side auth is not enforced at the route level for these**

**Serving & CRUD**
- `GET /manifest/:slug` — PWA manifest per landing page
- `GET /lp/:slug` — public, serves the rendered landing page
- `POST /lp` — publish (create/update), public at the route level — see `handlePublishLP` notes below
- `DELETE /lp/:slug` — public at the route level (no `requireAuth`)
- `GET /api/lp/:slug`, `GET /api/lp` — public at the route level

**AI chat** — `POST /lp/chat` — public, see AI Architecture

**Push** — `POST /lp/push/:slug` (Clerk user), `GET /lp/push/:slug/count`, `GET /lp/push/:slug/history` (both public), `POST /lp/webpush/subscribe/:slug`, `GET /lp/webpush/vapid-key/:slug`, `POST /lp/subscribe/:slug` (email), `GET /lp/subscribers/:slug` — see Push Notification Flow below

**Staff PIN** — `POST /lp/staff-pin/:slug` (Clerk user, sets it), `POST /lp/staff-pin/:slug/verify` (public, staff use)

> **Auth note**: Several dashboard-facing endpoints here (`handlePublishLP`,
> `handleDeleteLP`, `handleGetLP`, `handleListLPs`) have no `requireAuth` at
> the route level. `handlePublishLP` does its own optional auth check
> internally (`getUserFromToken` from the Authorization header, falling back
> to an anonymous `userId` from the request body if absent) — meaning an
> unauthenticated request can still publish a page, just without an owner.
> This may be intentional (supporting the free/anonymous QR flow) but is
> worth confirming against product intent.

## Passes (standalone) — `passRoutes.js`

**This entire route file's backing model usage is schema-inconsistent — see
Database Schema Discrepancy #2.** Endpoints as routed:

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/list` | Clerk (user) | |
| GET | `/:id` | Clerk (user) | |
| POST | `/create` | Clerk (user) + `requirePlan('walletPasses')` | Calls `prisma.pass.create()` with fields absent from schema |
| PUT | `/:id` | Clerk (user) | |
| DELETE | `/:id` | Clerk (user) | Soft delete |
| GET | `/download/:id` | public | Generates `.pkpass` via `generatePkpass()` |
| POST | `/:id/asset` | Clerk (user) | Upload logo/thumbnail/strip/icon — calls `storageService.uploadPassAsset()`, which is a stub that always returns `null` (confirmed in source, marked `// Phase 2: Replace with real S3 upload`) |

## QR Codes — `qrRoutes.js`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/qr` | public | |
| PUT | `/qr/:id/destination` | public | |
| DELETE | `/qr/:id` | public | |
| GET | `/r/:id` | public | Redirect endpoint — fires `trackScan()` from `utils/scanTracker.js` (not `services/scanService.js`, which is dead code — see below) via `setImmediate`, non-blocking |
| GET | `/visit/:id` | public | |
| POST | `/chat` | public | |
| GET | `/dashboard`, `/analytics` | public (no middleware in this file — inconsistent with `analyticsRoutes.js`'s Clerk-gated equivalents) | |
| GET | `/user/plan` | public | |
| POST | `/user/phone` | public | |

## Stripe — `stripeRoutes.js`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/webhook` | Stripe signature verification (not Clerk) | Must receive raw body — route comment notes this is wired in `index.js` with `express.raw()` before the global `express.json()` |
| POST | `/checkout` | Clerk (user) | Creates/reuses Stripe customer, creates Checkout session |
| POST | `/portal` | Clerk (user) | Stripe Billing Portal session |
| GET | `/status` | Clerk (user) | Returns plan + AI/dynamic-QR entitlements from `config/constants.js`'s `PLANS` map (not read in this phase) |

Webhook handles: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed` — all confirmed
directly in the switch statement.

## Tiers/Plans — `tierRoutes.js`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/plan` | Clerk (user) | Returns `buildPlanInfo()` from `utils/tierSystem.js` (not read) |
| POST | `/trial` | Clerk (user) | Starts a trial if not already premium/trialing |
| POST | `/check` | Clerk (user) | Capability gate check, body `{ capability }` |
| GET | `/status/:slug` | public | Whether a landing page is live |

## Users — `userRoutes.js`

**File contains only `module.exports = router;` — no routes defined.**
Confirmed empty, not a documentation gap.

## AI — `aiRoutes.js`

**Also confirmed empty** — same as `userRoutes.js`, just an empty router.
This is significant: there is no centralized `/ai` namespace despite the
file existing. Actual AI functionality is embedded directly in
`designRoutes.js`, `lpRoutes.js` (chat + auto-generation), and
`loyaltyAdminRoutes.js` (campaign copy) — see AI Architecture below.

## Wallet — `walletRoutes.js`

Apple Wallet Web Service protocol endpoints (called by Apple's servers
directly, not the frontend) plus internal endpoints:

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier` | Apple-side auth token in header | |
| POST | `/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber` | Apple-side | Registers device + push token |
| DELETE | same path | Apple-side | Unregisters |
| GET | `/v1/passes/:passTypeIdentifier/:serialNumber` | Apple-side | Fetches latest `.pkpass`, has explicit `If-Modified-Since` handling |
| POST | `/v1/log` | none (always returns 200 per Apple's spec) | |
| POST | `/push/:passId` | Clerk (user) | Manual push trigger — **uses the schema-inconsistent `pass.userId` field**, see Database Schema Discrepancy #2 |
| GET | `/ps/:passId` | public | QR-in-pass scan redirect — also uses schema-inconsistent fields (`pass.qrDestination`, `pass.website`) |

## Dead Code Found (confirmed, not inferred)

`services/qrService.js` (`createQR`, `getQRById`) and `services/scanService.js`
(`logScan`) are exported but **never imported or called anywhere** in
`routes/`, `controllers/`, or `services/` — confirmed by grep across all
provided source files. QR creation and scan logging are actually done
directly via `prisma.qR.create()` in `qrController.js` and via
`utils/scanTracker.js`'s `trackScan()` (referenced in `qrRoutes.js`, but
`utils/` wasn't included in this source archive so its contents aren't
verified). These two service files may be safe to remove, but that's a
decision for a later phase — flagging only.

## Not Yet Reviewed

- `backend/src/index.js` — actual mount paths/order, where `express.raw()`
  vs `express.json()` is applied, middleware registration order
- `backend/src/middleware/*.js` — actual implementation of `requireAuth`,
  `requireAdmin`, `apiKeyAuth`, `planGate` (only their usage was observed)
- `backend/src/config/constants.js` — `PLANS`, `WALLET_CONFIG` contents
- `backend/src/utils/*.js` — `tierSystem.js`, `scanTracker.js`, `pageCache.js`
