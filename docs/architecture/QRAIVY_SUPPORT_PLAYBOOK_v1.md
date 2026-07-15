# QRAIVY Support Playbook & Operations Architecture

Document: QRAIVY Support Playbook & Operations Architecture
Version: 1.0
Status: ACCEPTED
Approved: 2026-07-13
Approved By: Founder
Related Sprint: SP3.1
Last Updated: 2026-07-13

Founder Amendments
- Repository grounding refreshed.
- Navigation architecture deferred to a dedicated sprint.
- GET /ops/logs deferred pending logging architecture approval.

Architecture only.

No route, controller, service, schema, migration, configuration, or frontend file is created or modified by this document.

Scope: internal QRAIVY Operations & Support platform (the successor to
today's Admin Panel — `frontend/public/admin.html` + `backend/src/routes/adminRoutes.js`
+ `backend/src/middleware/adminMiddleware.js`). This document defines what
that platform becomes, not how the current dashboard/customer-facing product
works.

---

## 0. Grounding: What Exists Today

Verified directly against the current repo (not assumed), because every
recommendation below is a delta from this, not a greenfield design:

- **Auth**: `requireAdmin` middleware — Clerk Bearer token, cryptographically
  verified, checks `publicMetadata.role === 'admin'`, logs denials as
  structured `[SECURITY]` JSON. This is a sound foundation and is kept
  as-is (§1, §11).
- **Surface**: a single `admin.html`, **1,485 lines as of SP2.3** (grown
  from 1,010 lines at this document's original drafting, following the
  Operations Overview and Universal Search additions), with a hand-rolled
  sidebar (`sb-nav`) and pages including Overview, Universal Search, All
  Customers, API Keys, Revenue, Cost Analytics, QR Analytics, System
  Health, Error Logs. Still no routing framework, no per-page URL, no
  deep-linking — the additions since original drafting did not change
  this.
- **Backend**: `adminRoutes.js` (262 lines) — 8 endpoints, all direct Prisma
  calls inline in the route handler (no controller/service split, unlike the
  rest of the codebase's `routes/ → controllers/ → services/` convention).
- **Cost Analytics is hardcoded.** `loadCosts()` renders a static array of
  strings ("~€15–50", "check Anthropic console") with outbound links to
  provider dashboards. There is no real cost telemetry anywhere in the
  system.
- **Error Logs is an acknowledged stub.** `loadLogs()`'s entire body is:
  render "No error logging endpoint yet — add to Phase 3." This document
  *is* that Phase 3 — but scoped much wider than a log viewer, per the
  founder's Support Playbook / Operations Center direction.
- **System Health is a single boolean ping per dependency** (`api`, `db`,
  `anthropic`, `stripe`, `clerk`, `frontend`), no history, no latency, no
  alerting, re-checked only on manual refresh.
- **No concept of a customer timeline, an incident, or a support ticket**
  exists anywhere in the schema or code today.
- **No dedicated support-diagnostic surface exists per subsystem** — a
  support session today means someone with Railway/Vercel/Stripe/Clerk
  dashboard access manually cross-referencing four external consoles plus
  `prisma studio`.
- **The data model has real, documented seams a support platform must
  respect, not paper over** (`DATABASE_SCHEMA.md`):
  - `LandingPage`, `StampSettings`, `StampToken`, `StampEntry`,
    `LoyaltyCustomer`, `PushCampaign`, `WebPushSubscription` are joined only
    by a shared `slug` string — **no foreign keys**. Referential integrity
    between these is an application-logic guarantee, not a database one.
  - Two loyalty tracking mechanisms coexist unreconciled: a single anonymous
    `Pass` row per slug, and per-customer `LoyaltyCustomer` rows. A customer
    can exist in one without the other.
  - `Pass` model has two incompatible consumers (loyalty stamp cards vs. an
    apparently non-functional "business card pass" feature using fields
    that don't exist in the schema).
  - `APIKey` is used in code (`adminRoutes.js`, `apiKeyRoutes.js`) but has no
    corresponding model in `schema.prisma` — those code paths are either
    running against undocumented schema drift or throwing at runtime.
  - `loyaltyAdminController.js`'s `getCustomers` queries a non-existent
    `clerkUserId` field and a different auth pattern than every sibling
    handler — almost certainly dead/broken today.
  - AI generation runs through **four separate integration points** with
    three different calling conventions (SDK, raw `https.request`, `fetch`),
    three different models, no shared retry/timeout/error handling, and no
    shared logging.
  - Single production environment: one Railway backend, one Postgres
    instance, one Clerk instance. No isolated staging stack. Preview
    deployments talk to live production data.
  - **No API request/response observability exists today**, for any
    integration, beyond whatever happens to be `console.log`'d into
    Railway's ephemeral stream. Nothing durable, nothing per-provider,
    nothing correlated to a support case or an account — the gap API
    Inspector (§6) is new instrumentation for, not a UI over data that
    already exists.
  - **No data/configuration consistency checking exists today.** The seams
    listed above (slug-only joins, `Pass` vs. `LoyaltyCustomer`, the missing
    `APIKey` model, `clerkUserId`) are only visible by reading code or
    querying `prisma studio` by hand — nothing surfaces them proactively.
    This is the gap System Integrity (§7) fills.
  - **Timestamps, corrected against `schema.prisma` directly (Founder
    Amendment 1).** `Scan`, `RewardEvent` (`redeemedAt` and `createdAt`),
    and `StampToken` (`expiresAt`) have confirmed date fields.
    `User.createdAt`, `QR.createdAt`, `LandingPage.createdAt`, and
    `PushCampaign.createdAt` are also confirmed present in `schema.prisma`
    — this corrects the original drafting, which had flagged these as
    unconfirmed pending a direct schema check. This resolves several
    Customer & Business Journey (§4) events as read-time-aggregatable that
    were previously flagged uncertain; §4's table has been updated to
    match.

Every section below is written against this reality — the platform this
document defines is designed to make these exact seams *visible and
diagnosable*, not to assume they don't exist.

---

## 1. Vision

**The Operations & Support Platform is QRAIVY's internal instrument panel** —
the system QRAIVY (founder, and eventually support staff) uses to see what
is actually happening inside the product, diagnose why something is wrong,
and resolve it with a clear record of what changed and why.

It is not a bigger admin panel. The current Admin Panel answers "what does
the business look like" (users, revenue, plan counts). The Support Platform
answers a different question: **"what is happening to this specific
customer, right now, and what do I do about it."**

**How it differs from the customer dashboard:**

| | Customer Dashboard | Operations & Support Platform |
|---|---|---|
| Audience | The business owner using QRAIVY | QRAIVY staff operating QRAIVY |
| Unit of work | "My QR codes, my page, my customers" | "This ticket, this incident, this account" |
| Data shown | Only the logged-in owner's data | Cross-account, cross-tenant, system-wide |
| Primary action | Configure and grow their own presence | Diagnose, verify, and — rarely, deliberately — intervene |
| Failure mode if wrong | Bad UX | Wrong diagnosis, wrong fix, silent data damage |

It absorbs and supersedes the current Admin Panel (Overview, Customers, API
Keys, Revenue, Cost Analytics, QR Analytics, Health, Logs) rather than
running alongside it — those become sections within this platform's
navigation (§3), not a separate app to maintain.

It is explicitly **not**:
- A customer-facing help center or knowledge base.
- A ticketing SaaS replacement (Zendesk/Intercom) — it may integrate with
  one later, but the source of truth for "what happened to this account" is
  QRAIVY's own data, not a third-party ticket log.
- A place where AI silently changes production state (§2, §10).

---

## 2. Guiding Principles

These are the tiebreakers for every design decision in §3–§12, in the same
spirit as `docs/company/03_CORE_PRINCIPLES.md`.

1. **Diagnose before changing.** Every workflow leads with "what is true
   right now" before it offers "what to do about it." A support action that
   skips diagnosis and jumps to a mutation (replan, resend, resync) is a
   design smell.
2. **Every issue should be traceable.** If staff took an action inside this
   platform, there is a durable record of who, when, what, and why — not
   just a `console.log` line in Railway's ephemeral log stream.
3. **Every customer should have a timeline.** One page that answers "what
   has happened to this account, ever" — signup, plan changes, scans,
   pushes sent, support actions taken, incidents affecting them. Support
   staff should never have to reconstruct this by hand across four tables.
4. **APIs should be observable.** Every external dependency call (Anthropic,
   Firecrawl, Stripe, Clerk, Apple/Google Wallet, Resend, web-push) should be
   inspectable after the fact — did it happen, what did it return, how long
   did it take — not just visible if it happened to throw and get logged.
5. **No hidden system state.** If the platform shows a number, it is a real
   query result, not a hardcoded estimate (this replaces §0's Cost
   Analytics pattern directly). If something is a stub or "not yet
   supported," it says so — it does not silently render a fake success
   state.
6. **AI assists but never silently changes production.** AI can summarize,
   suggest, draft, and classify. Any AI output that would change customer
   data, resend a message, or modify billing requires an explicit human
   confirm — same posture as `docs/company/03_CORE_PRINCIPLES.md`'s "AI
   generates a starting point a human can edit," applied to support tooling
   instead of landing pages.
7. **Respect the seams that already exist, don't hide them.** Where the
   data model has no FK integrity (slug-joined tables) or two coexisting
   mechanisms (Pass vs. LoyaltyCustomer), the diagnostic tooling should
   surface the mismatch as a finding, not quietly pick one source of truth
   and hope.
8. **Converge, don't fork.** Per `docs/company/03_CORE_PRINCIPLES.md`
   ("check whether it already exists," "converge on one working
   mechanism") — this platform absorbs the existing Admin Panel's 8
   endpoints and `requireAdmin` middleware rather than standing up a
   parallel auth/API surface.
9. **Production is the only environment — treat every action accordingly.**
   With no isolated staging stack, every diagnostic query and every support
   action in this platform runs against live customer data by default. The
   platform's design must make read vs. write, and safe vs. destructive,
   visually and structurally distinct — not rely on staff caution alone.
10. **Reachability is not correctness.** Whether a dependency is up (System
    Health, §3) and whether QRAIVY's own data and configuration are
    internally consistent (System Integrity, §7) are different questions,
    with different failure modes. Conflating them hides real problems
    behind a green "all systems operational" banner — a service can be
    100% reachable while the data behind it is already wrong.
11. **Evidence before conclusions, always labeled.** Any AI-assisted
    investigation (§10) states what it actually looked at and how confident
    it is per hypothesis. It does not present a guess as a fact, and it
    says plainly when evidence is missing rather than filling the gap with
    a plausible-sounding answer.

---

## 3. Operations Center Structure

Complete navigation for the platform. Existing Admin Panel pages are marked
**[existing]**; everything else is new. Grouped by the question each section
answers.

```
Overview                    — "Is the business/system OK right now?"  [existing, extended]

Support                     — "What's happening with this specific customer?"
  ├─ Workspace               (customer/business/page/subscriber lookup + Journey — §4)
  ├─ AI Investigation Mode    (constrained, evidence-grounded investigation — §10.1)
  ├─ Tickets / Cases          (if QRAIVY adopts a ticket concept — §11)
  └─ Known Issues             (curated, linked to Diagnostics/Integrity findings — §4, §5, §7)

Customers                   — "Who are our customers, in aggregate?"  [existing: All Customers]
Businesses                  — "Landing pages / brands, independent of the owning user"
                               (anticipates Brand → Locations → Landing Pages, §0/company/04_DECISIONS.md)

Diagnostics                 — "Is this specific subsystem working correctly, for this account?"  — §5
  ├─ Landing Pages
  ├─ Wallet (Apple / Google)
  ├─ Loyalty
  ├─ Subscribers
  ├─ Push (Web Push / APNs / Email)
  ├─ Campaigns
  ├─ Firecrawl
  ├─ AI (Claude / Anthropic)
  ├─ Stripe
  ├─ Clerk
  └─ Database

API Inspector                — evidence about external/internal API operations — §6
System Health                 — real-time dependency reachability & latency  [existing, extended — history, not just boolean]
System Integrity              — is QRAIVY's own data/configuration internally consistent — §7
Incidents                    — incident lifecycle, timeline, runbooks — §8
Deployments                  — what's live where, deploy history, rollback pointers
Logs                         — structured, searchable, replaces the current stub — §5/§11
API Explorer                 — future: interactive request-construction tool for support staff
                               (not evidence-focused like API Inspector — see §6.5, §13)
Database                     — read-only query console + row lookup, audited — §11

Revenue                      — [existing]
Cost Analytics                — [existing, but real telemetry — §11 — replaces hardcoded estimates]
Wallet                       — pass issuance/registration/push state, cross-account — feeds Diagnostics + API Inspector
Push                         — campaign history, delivery stats, cross-account — feeds Diagnostics + API Inspector
AI Services                  — usage, cost, error rate per of the 4 call sites — §5, §6, §11
Billing                      — Stripe subscription/webhook state, cross-account

Settings                     — admin roles, playbook config, alerting thresholds
```

Design notes:

- **Overview, Revenue, Customers, Cost Analytics, System Health** are
  evolutions of existing pages — same job, real data, more depth. Not a
  rewrite of their purpose.
- **Support, Diagnostics, Incidents, Logs, Database, Deployments, API
  Inspector, System Integrity, and AI Investigation Mode** are the
  genuinely new territory this sprint is about. **API Explorer** is named
  here only as a reserved future placeholder (§6.5, §13) — it is not
  specified further in this document.
- **Businesses** is deliberately separate from **Customers**: a `User` (the
  account/billing entity) and a `LandingPage` (the thing that actually
  breaks, gets scanned, gets support tickets) are different objects today
  and will diverge further under the Brand → Locations → Landing Pages
  model. Support staff usually start from "this landing page/slug is
  broken," not "this Clerk user ID."
- Every top-level item should be reachable by direct URL (deep-linkable),
  unlike today's single-page `showPage()` JS switch with no routing.
  **Deferred (Founder Amendment 2)**: this routing/navigation
  architecture is not part of SP3.1 and requires its own
  founder-approved plan doc — see §12 Phase 1.

---

## 4. Support Workspace

The core "someone reported a problem, help them" experience. Optimized for
speed of diagnosis over completeness of controls.

**Entry: universal lookup bar.** One input, accepts any of:

- Email → resolves to `User`
- Clerk user ID → resolves to `User`
- Slug → resolves to `LandingPage` (+ everything joined to it by slug)
- QR / QR id (uuid) → resolves to `QR`
- Stripe customer ID → resolves to `User` via `stripeCustomerId`
- Pass serial number (`sqr-{slug}` / `sqr-{slug}-{cid}`) → resolves to
  `Pass` → `LandingPage`

Because `LandingPage`, `StampSettings`, `StampToken`, `StampEntry`,
`LoyaltyCustomer`, `PushCampaign`, and `WebPushSubscription` are joined only
by `slug` with no DB-level relation, slug-based lookup is the single most
important resolution path in this tool — it's the one place in the product
where those tables get stitched back together for a human to read.

**Customer lookup** (`User`): plan, billing status, all owned `QR`s, all
owned `LandingPage`s (via `QR`/slug), Stripe state, API key(s), suspension
state, support timeline (below).

**Business lookup** (`LandingPage` by slug): business name, brand config,
`sections` JSON (rendered readably, not as a raw blob — this is the actual
content model per `DATABASE_SCHEMA.md` and is opaque without decoding),
status, scan count, owning `User` (if any — anonymous QRs have none),
associated `Pass` row(s), `StampSettings`, active `StampToken`s, loyalty
customer count.

**Landing page lookup**: same as Business lookup — `slug` is the natural
key for both; this is one screen with two entry points, not two screens.

**Subscriber lookup**: by email or `slug` — GDPR consent status (enforced,
not decorative, per `docs/company/03_CORE_PRINCIPLES.md`), source, status,
which `PushCampaign`s reached them, `oneSignalId` presence (legacy — flag
as historical-only, OneSignal is fully removed).

**Customer & Business Journey** — the concrete implementation of Principle
3, extended per founder direction into a complete lifecycle view, not just
recent activity. A single chronological feed per `User` or per `slug`.

Required event coverage, and what each actually requires to implement:

| Event | Status |
|---|---|
| User signup | `User` row creation. **Confirmed** — `User.createdAt` exists in `schema.prisma` (`@default(now())`); aggregatable at read time, no migration needed. |
| Plan assignment/change | `User.plan`/`subscriptionStatus` are mutated in place by `stripeController.js` webhook handlers — **current value only, no change history** in QRAIVY's own DB. Stripe itself retains an event history (external source), but a QRAIVY-local record requires new durable event logging. |
| Business creation | `LandingPage` row creation. **Confirmed** — `LandingPage.createdAt` exists in `schema.prisma`; aggregatable at read time. |
| QR creation | `QR` row creation. **Confirmed** — `QR.createdAt` exists in `schema.prisma`; aggregatable at read time. |
| Landing Page generation | The AI-generation step (`generateLPFromSite()`) is not itself persisted as an event distinct from page creation/edit — no way today to tell "AI-generated" from "manually edited later" after the fact. Requires a durable event. |
| Firecrawl onboarding | `scrapeWithFirecrawl()` has **no persistence at all** today — this is exactly the evidence API Inspector (§6) is built to capture going forward; currently unrecoverable after the fact except via Railway's ephemeral log stream. |
| Page publication | `handlePublishLP` sets `LandingPage.status`. Current value only — no record of *when* first published or of republish history. Requires a durable event for history beyond "is it live now." |
| First scan | **Confirmed aggregatable at read time.** `Scan.createdAt` exists and joins to `QR` via `qrId` — `MIN(Scan.createdAt)` per QR, no new table needed. |
| Wallet installation | Apple: `PassDevice` registration exists but its timestamp field isn't confirmed in `DATABASE_SCHEMA.md`. Google: no local "install" event is persisted at all — only `LoyaltyCustomer.hasWallet` as a boolean state, not a timestamped event. Requires verification (Apple) and a new durable event (Google). |
| Subscriber enrollment | `Subscriber` row creation — likely aggregatable if a `createdAt` exists, not explicitly confirmed. |
| Loyalty enrollment | `LoyaltyCustomer` row creation — same caveat, not confirmed. |
| Stamp activity | `StampEntry` — "one row per stamp issued" implies an ordering timestamp exists, field name not explicitly confirmed in `DATABASE_SCHEMA.md`. |
| Reward earned/redeemed | **Confirmed.** `RewardEvent.createdAt` (earned moment) and `RewardEvent.redeemedAt` (redeemed moment) both exist in `schema.prisma`; both aggregatable at read time. |
| Push campaign created/sent | `PushCampaign` row. **Confirmed** — `PushCampaign.createdAt` exists in `schema.prisma`; aggregatable at read time. |
| Delivery outcomes | **Confirmed gap.** Per `SYSTEM_ARCHITECTURE.md` §6, only the Apple Wallet push count (`sent`) is persisted on `PushCampaign` — email and web-push counts are returned in the API response but not stored anywhere. Per-recipient outcome history requires new durable event logging; even aggregate email/web-push counts are currently lost. |
| Support cases | Does not exist yet in any form (§3 marks Tickets/Cases as not-yet-adopted). Requires a new table if built. |
| Support actions | Covered by the planned `SupportAction` log (§11, Build Order Phase 1, §12) — the one new table this entire document depends on. |
| Incidents affecting the business | `Incident` records (§8), new — linked to affected slugs/accounts. |

**How slug-based entities are reconciled**: the same mechanism already
described above for lookup — `LandingPage`, `StampSettings`, `StampToken`,
`StampEntry`, `LoyaltyCustomer`, `PushCampaign`, and `WebPushSubscription`
have no FK relation, so the Journey read path explicitly queries each of
these tables filtered by the one resolved `slug`, then merges by timestamp.
There is no single query that returns "the journey" — it is always an
explicit, enumerated fan-out, which is a deliberate consequence of §0's
no-FK reality, not an oversight.

**How the Journey avoids exposing unrelated tenants**: every Journey query
is scoped by a single resolved identity (`User.id` or `LandingPage.slug`)
returned from the universal lookup above — never a global feed. Because
most joins are slug-string matches with no FK enforcement, the read path
must filter every joined table by the *exact* resolved slug — no
prefix/wildcard matching — since two unrelated businesses could otherwise
collide on similar slugs. `LandingPage.userId` is optional (anonymous QRs
have none), so a business with no owning `User` must still be walled off to
only its own slug's rows — never merged with another anonymous business
just because both happen to have `userId: null`.

This does not require new tables to backfill history for the
already-aggregatable events — it's a read-time merge of existing
timestamped rows, once the `createdAt` gaps flagged above are verified,
plus a new `SupportAction` log (§11) going forward. Historical events that
require new durable logging (plan changes, Firecrawl attempts, page
publication history, per-channel delivery outcomes, wallet installation for
Google) are simply absent before that logging exists — not backfilled, not
faked, per Principle 5.

**Recent activity**: last N events across the whole platform, for
situational awareness before a specific ticket comes in.

**Known issues**: a curated, hand-maintained list linking directly to
Diagnostics findings (§5) and open Incidents (§8) — e.g. today, this would
already list "Pass model business-card path is schema-inconsistent" and
"`loyaltyAdminController.getCustomers` likely 404s" as known issues, so
support staff recognize a report instead of re-discovering it. Both of
these are exactly the *shape* of finding System Integrity (§7) is designed
to surface automatically once built — Known Issues today is the manual,
hand-curated version of what System Integrity later generates.

**Resolution history**: what was actually done for a given account/issue,
sourced from the `SupportAction` log (§11) — not a separate freeform notes
field that drifts from reality.

---

## 5. Diagnostics

One diagnostic view per subsystem. Each answers: **is this working, for
this specific account/slug, right now** — not just "is the service up"
(that's System Health, §3), and not "is our own data internally consistent"
(that's System Integrity, §7 — a related but distinct question). Several
panels below are themselves views over API Inspector (§6) evidence for the
relevant provider. Each diagnostic panel states what it would actually
check, grounded in verified code paths (`SYSTEM_ARCHITECTURE.md`), not a
generic checklist.

| Subsystem | What it checks | Grounded in |
|---|---|---|
| **Landing Pages** | slug resolves, `sections` JSON parses cleanly, last render/publish timestamp, scan pipeline reaching `Scan` table | `lpController.js` render/publish paths |
| **Wallet (Apple)** | cert/key validity (`APPLE_PASS_CERT_PEM`/`KEY_PEM`), `PassDevice`/`PassRegistration` state for a serial, last APNs push result | `passService.js`, `apnsService.js`, `walletController.js` |
| **Wallet (Google)** | service account credential validity, `loyaltyObject` existence for a given customer/serial | `googleWalletService.js` |
| **Loyalty** | reconciliation check between the anonymous `Pass` row and any `LoyaltyCustomer` rows for the same slug — this is the one diagnostic that should exist specifically *because* these two mechanisms aren't reconciled by any existing code | `DATABASE_SCHEMA.md` Discrepancy on `Pass` vs `LoyaltyCustomer` |
| **Subscribers** | GDPR consent flag distribution, `resendContactId` presence, `oneSignalId` legacy-only flag | `Subscriber` model |
| **Push** | last `PushCampaign` for a slug, per-channel outcome (Apple silent push count vs. Web Push vs. email — note today only Apple's count is persisted on the campaign row per `SYSTEM_ARCHITECTURE.md` §6, email/web-push counts are response-only and currently lost) | `lpController.js` `handleSendPush` |
| **Campaigns** | same as Push, plus AI-drafted-copy usage rate | `loyaltyAdminController.generateCampaignMessage` |
| **Firecrawl** | last scrape result/status for a given onboarding, timeout/failure rate | `lpController.scrapeWithFirecrawl` |
| **Claude/Anthropic** | per-call-site health (there are 4, §0) — model ID currently in use per site, last error, latency; this is the diagnostic that would have caught the `34e0307` model-ID-revert incident before it needed a revert | `designController.js`, `lpController.js` (×2), `loyaltyAdminController.js` |
| **Stripe** | webhook delivery/processing status for a customer, subscription status drift vs. local `User.subscriptionStatus` | `stripeController.js` webhook handlers |
| **Clerk** | user existence, `publicMetadata.role`, session validity — mainly for diagnosing "why can't this admin log in" | `adminMiddleware.js` |
| **Database** | connection health (already in System Health), plus slow-query / row-count sanity checks for the un-related-by-FK tables (§0) | `DATABASE_SCHEMA.md` |

Each panel is read-only by default. Where a diagnostic surfaces an
actionable fix (e.g., "resend this pass push," "retry this scrape"), that
action is a distinct, explicitly-logged operation (§11's `SupportAction`
log) — not silently triggered by viewing the diagnostic.

---

## 6. API Inspector

A first-class Operations Center capability: a passive, evidence-focused
record of API operations QRAIVY's backend has already performed — distinct
from Diagnostics (§5), which asks "is this subsystem healthy for this
account." API Inspector asks instead "what actually happened on the wire,
for this specific call." It is the evidence layer several Diagnostics
panels (§5's AI/Anthropic, Firecrawl, and Stripe rows) and AI Investigation
Mode (§10.1) depend on to have anything concrete to inspect.

### 6.1 Grounding

Per §0, no such observability exists today for any integration:
- The 4 Anthropic call sites have three different calling conventions and
  no shared logging — a failed call today is visible only if it happened to
  throw and land in Railway's ephemeral stream.
- Firecrawl scrape attempts (`scrapeWithFirecrawl()`) are not persisted at
  all.
- Stripe webhook processing has no request/response record beyond whatever
  `User` field mutation it triggered.
- Apple/Google Wallet API calls (push, registration, object/class create)
  are not logged beyond the immediate success/failure of the operation.
- Resend, QRAIVY's own Web Push sends, and Clerk calls have no persisted
  per-call record.

API Inspector is therefore new instrumentation, not a UI layered over data
that already exists — contrast with the Journey (§4), which is mostly
read-time aggregation of rows that already exist today.

### 6.2 Covered providers

- Firecrawl
- Anthropic (all 4 call sites, §0/§5 — the one integration where
  per-call-site visibility matters most, since the sites share no code
  today)
- Stripe
- Clerk
- Apple Wallet (APNs push, Wallet Web Service registration/log endpoints)
- Google Wallet (Wallet Objects REST API)
- Resend
- QRAIVY native Web Push (VAPID, `web-push` package)
- Railway API/backend, where observable (deploy status, service health —
  bounded by what Railway's own API actually exposes, not a promise of
  full request-level visibility into Railway's infrastructure)
- Future external integrations — new providers register into this model
  rather than getting a one-off, unlogged integration, per
  `docs/company/03_CORE_PRINCIPLES.md`'s "converge on one working
  mechanism," applied to integrations specifically

### 6.3 Inspection model

Every captured operation record has:

| Field | Purpose |
|---|---|
| `provider` | e.g. `anthropic`, `firecrawl`, `stripe` |
| `operation` | the calling function/purpose (e.g. `generateLPFromSite`, `chargeSubscription`) — not just the raw HTTP path |
| `timestamp` | when the call was made |
| `account/business/slug context` | which `User`/`slug` this call was made on behalf of, if any (some calls — e.g. a platform-wide health check — have none) |
| `endpoint or operation name` | the actual provider endpoint/method called |
| `HTTP status` | |
| `response time` | |
| `success/failure state` | |
| `masked request metadata` | shape of what was sent, secrets/PII masked (§6.4) — not the raw body |
| `masked response metadata` | same, for the response |
| `retry history` | each attempt, if the calling code retried |
| `rate-limit state` | remaining quota/reset time, where the provider exposes it |
| `correlation ID` | ties this call to the support case, incident, or user-facing request that triggered it |
| `related incident` | link to §8, if applicable |
| `related support action` | link to the `SupportAction` log (§11), if a human acted on this evidence |

### 6.4 Security requirements

- Never display secrets (API keys, cert/key material, webhook signing
  secrets).
- Never display access tokens (Clerk session tokens, Stripe restricted
  keys, Apple/Google service credentials).
- Mask personal data in both request and response metadata (email, phone,
  name) — the same enforcement bar `docs/company/03_CORE_PRINCIPLES.md`
  sets for consent data generally.
- Restrict raw payload access — viewing a full, unmasked request/response
  body is a separate, explicitly higher-privileged action from viewing the
  summary, not the default view.
- Audit every privileged inspection — accessing a raw/unmasked payload is
  itself a `SupportAction`-logged event (§11), same as any other privileged
  support action, per Principle 2.
- Default to summaries, not raw bodies — the table in §6.3 is the default
  view; raw body access is the explicit opt-in above.

### 6.5 How this differs from adjacent tools

| | What it shows | Audience | Scope |
|---|---|---|---|
| **Public API documentation** (`API_REFERENCE.md`) | How to call QRAIVY's own public API | External developers/integrators | QRAIVY's outbound-facing API surface — not what QRAIVY itself called |
| **Railway logs** | Raw, ephemeral stdout/stderr stream from the running process | Whoever has Railway dashboard access | Unstructured, not per-provider, not correlated to an account or a support case, not retained long-term |
| **Browser DevTools** | Network calls made by the *frontend*, from one browser session | Whoever has that browser open | Only frontend-to-QRAIVY-backend calls — invisible to backend-to-third-party calls (Anthropic, Stripe, etc.) entirely, and gone once the tab closes |
| **API Explorer** (future, §3/§13) | An interactive tool to *construct and fire* a test API call | Support staff debugging live, hands-on | Active/exploratory — "let me try calling this endpoint right now" |
| **API Inspector** (this section) | A passive, durable record of API calls QRAIVY's backend *already made* | Support staff, AI Investigation Mode (§10.1) | Evidence — "what actually happened," after the fact, correlated to an account/incident/support action |

API Inspector and API Explorer are complementary, not the same tool:
Inspector is what you check first (evidence of what happened); Explorer, if
ever built, is what you'd reach for second (a live test to reproduce or
confirm a hypothesis). API Explorer is out of scope for this document —
§13 lists it only as a reserved term.

---

## 7. System Integrity

A section distinct from System Health (§3):

- **System Health** asks: *are services currently reachable?*
- **System Integrity** asks: *is QRAIVY's data and configuration internally
  consistent?*

A dependency can be 100% reachable while the data behind it is already
wrong — System Health would show all-green while a business's wallet pass
silently stopped updating three days ago. System Integrity is what catches
that (Principle 10, §2).

### 7.1 Grounding

Every check below targets a seam §0 already documents as real, not
hypothetical:
- `LandingPage`, `StampSettings`, `StampToken`, `StampEntry`,
  `LoyaltyCustomer`, `PushCampaign`, `WebPushSubscription` share no FK —
  integrity here is entirely an application-logic guarantee today, meaning
  nothing currently verifies it holds.
- `Pass` vs. `LoyaltyCustomer` are two unreconciled loyalty-tracking
  mechanisms (§0, §5).
- `APIKey` is used in code but has no schema model (§0, `DATABASE_SCHEMA.md`
  Discrepancy #1).
- `LandingPage.clerkUserId` is queried but doesn't exist (§0,
  `DATABASE_SCHEMA.md` Discrepancy #3).

### 7.2 Checks

- QR exists but Landing Page missing
- Landing Page exists but owner (`userId`) missing, where ownership is
  expected (as distinct from a legitimately anonymous page)
- Wallet enabled but pass/class/object missing (Apple `Pass` row absent, or
  Google `loyaltyClass`/`loyaltyObject` absent)
- Loyalty enabled (`StampSettings.enabled`) but the `StampSettings` row
  itself missing for the slug
- `PushCampaign` exists but no eligible subscriptions (no
  `WebPushSubscription`, no consented `Subscriber`, no `PassDevice` for
  that slug at send time)
- `WebPushSubscription` exists for a missing slug (no matching
  `LandingPage`)
- Apple Wallet registration drift (`PassDevice`/`PassRegistration` present
  but the underlying `Pass` gone, or vice versa)
- Google Wallet object/class drift (`loyaltyObject` created with no
  corresponding `loyaltyClass`, or `LoyaltyCustomer.hasWallet: true` with no
  confirmable object)
- Subscriber status conflicts with GDPR consent (e.g. `status: active` with
  `gdprConsent: false`)
- Stale Firecrawl/onboarding data (a scrape result referenced by a page
  that's since been substantially edited/republished, or a scrape that
  never completed, leaving the page in a partial state)
- Stripe subscription drift versus local `User.plan`/`subscriptionStatus`
  (Stripe says one thing, QRAIVY's row says another — exactly the class of
  bug a missed or failed webhook produces)
- Orphaned records joined only by slug (any slug-joined table in §0 with no
  matching `LandingPage` for that slug)
- `Pass` vs. `LoyaltyCustomer` inconsistency (§0, §5) — a customer present
  in one without the other
- Duplicate or conflicting configuration (e.g., two `StampSettings` rows
  keyed to the same slug, if the schema doesn't already prevent it — worth
  confirming a unique constraint exists)
- Expiring certificates or credentials (Apple `APPLE_PASS_CERT_PEM`/WWDR
  intermediate, Google service account key) — a time-bounded check rather
  than a data-consistency check, grouped here because its failure mode is
  identical to the others: everything looks healthy until it silently isn't

### 7.3 Severity

- **Healthy** — check passed, no finding
- **Informational** — a known, accepted seam (e.g., an anonymous
  `LandingPage` with no `userId`, which is by design) — surfaced for
  awareness, not action
- **Warning** — worth looking at, not actively breaking anything yet (e.g.,
  a certificate expiring in 30 days)
- **Failure** — actively broken for a specific account (e.g., wallet
  enabled with no pass object — that customer's wallet integration does not
  work right now)
- **Critical** — broken in a way that risks data correctness or spans many
  accounts (e.g., Stripe/local plan drift affecting billing, or a systemic
  slug-orphan pattern suggesting a bug in a shared write path rather than
  one bad record)

### 7.4 Read-only by design

System Integrity is read-only in every phase covered by this document
(§12). Findings surface into Support Workspace (§4, via Known Issues) and
Incidents (§8) for a human to act on through the normal, audited
support-action path (§11) — this section defines detection, not automatic
repair. Automatic remediation, if ever built, is a distinct future decision
requiring its own founder approval and its own document, consistent with
Principle 6's posture on AI/automation and production data.

---

## 8. Incident Response

**Incident severity** (kept small — 3 tiers, not a 5-tier enterprise
matrix, given team size):

- **SEV1** — production down or data-integrity risk for many accounts
  (e.g., DB unreachable, auth broken platform-wide, a bad deploy corrupting
  writes).
- **SEV2** — a subsystem broken for some accounts, workaround may exist
  (e.g., Apple Wallet push failing, AI generation erroring for one call
  site, Stripe webhook backlog).
- **SEV3** — isolated/cosmetic, or a known-broken feature already flagged
  (e.g., the business-card Pass path, `getCustomers` 404) — tracked, not
  urgent.

**Incident lifecycle**: `Detected → Acknowledged → Investigating →
Mitigated → Resolved → Reviewed`. "Reviewed" is not optional for SEV1/SEV2 —
it's where a root cause gets written down and, if it reveals a systemic gap
(like the AI call-site fragmentation), feeds back into §9/§11's backlog.

**Incident timeline**: every incident gets the same timeline mechanism as
§4's Journey — detection source (alert, customer report, manual
discovery), each status transition, actions taken (linked to
`SupportAction` entries), affected accounts/slugs (linked to Support
Workspace lookups), resolution.

**Runbooks**: a named, versioned procedure per recurring failure mode,
written *before* it's needed. Given this codebase's actual fragile points
(§0), the first runbooks that matter are:

- Anthropic model ID invalid/deprecated (already happened once — `34e0307`)
- Apple Wallet cert/WWDR intermediate expiry or push failure
- Stripe webhook signature/processing failure
- Firecrawl scrape timeout/failure during onboarding
- Database migration gone wrong (single-prod-environment risk, §0)

**Recovery process**: for each runbook, an explicit "what does 'resolved'
mean" check — not just "the error stopped," but a verification step (e.g.,
for a Stripe webhook incident: confirm `User.subscriptionStatus` matches
Stripe's actual state for every account touched during the incident
window, not just that new webhooks are processing again).

---

## 9. Support Playbooks

Every playbook QRAIVY should eventually have — one per subsystem, written
as a concrete "customer says X → check Y → do Z" procedure, not a generic
template. Ordered roughly by how often the underlying subsystem is likely
to generate a support case, based on what's fragile today (§0):

1. **AI Generation (Claude/Anthropic)** — 4 call sites, 3 calling
   conventions, no shared error handling; highest-fragility surface today.
2. **Firecrawl (onboarding scrape)** — external dependency, first-impression
   moment (AI-generated-first-page is the preferred onboarding path per
   `docs/company/04_DECISIONS.md`), so failures here are high-stakes even
   if rare.
3. **Landing Pages** — the central object; most other playbooks reference
   "check the slug's LandingPage state" as a first step.
4. **Wallet (Apple)** — cert lifecycle, APNs push failures, the two-track
   Pass-vs-business-card confusion (§0).
5. **Wallet (Google)** — service account credential issues.
6. **Loyalty** — the `Pass`-vs-`LoyaltyCustomer` reconciliation gap (§5) is
   the single most likely source of "my customer's stamps disappeared"
   tickets.
7. **Push Notifications** — three-channel fan-out, partial-failure by
   design (one channel failing doesn't stop others) — playbook must cover
   "customer says they didn't get a push" per-channel, not as one question.
8. **Subscribers** — GDPR consent disputes, resend/email deliverability.
9. **Campaigns** — AI-copy-generation failures, send failures.
10. **Stripe** — webhook drift, plan mismatch, failed payment handling.
11. **Clerk** — login issues, admin role grants/revocations (who has
    `publicMetadata.role === 'admin'` today is not currently visible
    anywhere in the product — a real gap).
12. **Database** — read-only query playbook for support staff, escalation
    path to a real migration/fix.
13. **Deployment** — Railway/Vercel rollback procedure, given no staging
    environment exists (§0) this is higher-stakes than typical.
14. **Analytics** — scan-count discrepancies, dashboard-vs-reality mismatches.

Each playbook should be a short, living document (not this file) linked
from its Diagnostics panel (§5), from Known Issues (§4), and — once built —
from any matching System Integrity finding (§7). Written as they're
actually needed, starting with #1–#3 given today's fragility profile, not
all 14 upfront.

---

## 10. AI Support & AI Investigation Mode

How AI assists *support staff*, distinct from — and much more constrained
than — how AI already assists *customers* (landing-page generation, chat
widget, campaign copy). Every capability in this section is advisory, per
Principle 6 and Principle 11 (§2).

### 10.1 AI Investigation Mode

The founder-approved, concrete workflow this section is built around: a
support operator states a problem in plain language — e.g. *"Wallet does
not update for this business"* — and the system produces a structured,
evidence-grounded report. It does not take action.

**Evidence sources available** (all read-only):
- Customer & Business Journey (§4)
- Diagnostics (§5)
- API Inspector (§6)
- System Integrity (§7)
- Logs (§11)
- Wallet registrations, push history, campaign history (the cross-account
  feeds behind §3's Wallet/Push nav items)
- Incidents (§8)
- Known Issues (§4)
- Support Playbooks (§9)

**Required output shape:**
- Issue summary
- Evidence inspected — explicitly listed, not implied
- Probable causes
- Confidence per hypothesis
- Missing evidence — what it could not check, and why (e.g., "raw Apple
  Wallet response body not available without a privileged API Inspector
  action")
- Customer impact
- Matching known issues
- Recommended playbook (§9)
- Suggested next diagnostic
- Proposed fix, if appropriate — a draft/suggestion, not an executed action
- Rollback considerations

**Hard boundaries** (absolute, not configurable defaults):
- Cannot silently mutate production
- Cannot send campaigns or notifications
- Cannot change plans or billing
- Cannot modify customer records
- Cannot run migrations
- Cannot expose secrets — inherits API Inspector's masking rules (§6.4) in
  full; Investigation Mode has no higher privilege than a human using API
  Inspector directly
- Cannot present uncertain conclusions as facts — every hypothesis carries
  its confidence, and "missing evidence" is a required output field, not
  optional

Any future fix action Investigation Mode proposes requires explicit human
approval and produces a `SupportAction` audit entry (§11) under the
approving human's identity — the same rule every other AI Support
capability below follows.

### 10.2 Supporting AI capabilities

The building blocks Investigation Mode composes — also independently
useful for narrower tasks:

- **Root cause analysis**: given an incident or case, summarizes the
  relevant Journey (§4) and correlated Diagnostics (§5)/Integrity (§7)
  findings into a plain-language hypothesis — e.g., "this customer's push
  failures correlate with an Apple cert issue affecting 12 other slugs
  since 14:02 UTC." Proposes; a human confirms the incident linkage.
- **Log summarisation**: condenses Logs (§11) into "what changed / what's
  new / what's recurring" for a time window or a specific slug — necessary
  the moment structured logging exists at all, given its total absence
  today (§0).
- **Suggested fixes**: surfaces the matching runbook (§8) or playbook (§9)
  for a diagnosed issue, and drafts (not sends) a customer-facing
  explanation if relevant.
- **Customer impact analysis**: for a given incident, enumerates which
  accounts/slugs were plausibly affected, using the same slug-joined read
  paths as §4 — genuinely useful specifically *because* referential
  integrity isn't enforced by the database (§0), making this a fuzzy-match
  problem AI is well suited to and a plain JOIN is not.
- **Regression detection**: compares current Diagnostics (§5)/Integrity
  (§7) state against a recent-past baseline to flag "this metric moved"
  before a customer reports it — the closest thing to proactive monitoring
  in this design.

### 10.3 Hard boundary (applies to every capability in this section)

No capability in §10 calls a mutation endpoint directly. Every suggested
fix produces a reviewable action a human explicitly approves and that gets
written to the `SupportAction` log (§11) under the human's identity, not
the AI's.

---

## 11. Future APIs

Architecture only — no implementation. Namespaced under `/ops` (or
`/internal`), distinct from the existing `/admin` prefix, reusing
`requireAdmin` (§0/§2 Principle 8) rather than inventing new auth.

- `GET /ops/lookup?q=` — universal resolver for §4's lookup bar; returns a
  typed result (`user` | `landing_page` | `pass` | `subscriber`) plus a
  resolution path, so the frontend doesn't need to guess which table format
  matched.
- `GET /ops/journey/:type/:id` — merged Customer & Business Journey for a
  `User` or slug (§4).
- `GET /ops/diagnostics/:subsystem/:id` — one endpoint per §5 panel,
  consistent shape (`status`, `checks[]`, `lastChecked`).
- `GET /ops/api-inspector?provider=&account=&since=` — query captured API
  Inspector records (§6), summary view by default (§6.3/§6.4). A separate,
  explicitly higher-privileged `GET /ops/api-inspector/:id/raw` covers
  unmasked payload access, itself always written to the `SupportAction` log
  below (§6.4).
- `GET /ops/integrity?scope=&severity=` — run/query System Integrity checks
  (§7), scoped to an account/slug or platform-wide; read-only, no
  corresponding write endpoint in this phase (§7.4).
- `POST /ops/investigate` — AI Investigation Mode (§10.1) entry point:
  takes a plain-language problem statement plus optional scope
  (account/slug/incident), returns the structured report shape defined in
  §10.1. Accepts and returns no mutation — any raw-payload citation in the
  response still resolves through `/ops/api-inspector/:id/raw`'s own audit
  path, not a shortcut around it.
- `POST /ops/support-actions` — write path for the `SupportAction` log.
  Every mutating support action funnels through this (or is itself modeled
  as one) — including privileged API Inspector raw-payload views (§6.4) and
  any human-approved AI Investigation Mode fix (§10.1) — capturing
  `actorId`, `actorType` (`human`|`ai-suggested`), `targetType`, `targetId`,
  `action`, `reason`, `timestamp`. This is the single new piece of durable
  state this whole document ultimately depends on for Principles 2 and 3 —
  everything else can be read-time aggregation of existing tables, but
  "what did staff actually do" has nowhere to live today.
- `GET /ops/incidents`, `POST /ops/incidents`, `PATCH
  /ops/incidents/:id/status` — incident lifecycle (§8). Minimal fields:
  severity, status, affected scope, timeline entries, linked
  `SupportAction`s.
- `GET /ops/costs/anthropic`, `/ops/costs/firecrawl`, `/ops/costs/railway`,
  `/ops/costs/stripe` — real per-provider usage/cost pulled from each
  provider's own usage API where one exists, replacing §0's hardcoded
  Cost Analytics strings. Where a provider has no usage API (e.g., some
  Railway tiers), this stays an explicit "not available" state, not a
  fabricated number (Principle 5).
- `GET /ops/logs?service=&level=&since=` — the actual Phase 3 the current
  `loadLogs()` stub refers to. Requires picking a structured logging
  approach first (§12 Phase 1) — Railway's log stream is not queryable
  today, so this is a real build, not a thin wrapper. **Deferred
  (Founder Amendment 3)**: not part of SP3.1; requires its own approved
  logging architecture (storage, retention, access control, PII masking,
  secret redaction) before implementation.
- `GET /ops/health/history` — extends the current boolean `/admin/health`
  into a time series (so "System Health" in §3 can show "down for the last
  40 minutes" instead of only "down right now").

---

## 12. Recommended Build Order

Phased so each phase produces something independently useful, and later
phases build on real data the earlier phases start capturing — not a
big-bang rewrite of `admin.html`.

**Phase 1 — Foundation (small, unblocks everything else)**
- `SupportAction` audit model (table + `POST /ops/support-actions`) —
  nothing else in this document is trustworthy without it (Principles 2,
  3). **First Phase 1 increment approved for implementation: SP3.1 —
  Operations Center Foundation: SupportAction Audit Trail.**
- Shared `/ops` authorization and response contracts, reusing `requireAdmin`
  (§11) rather than inventing new auth (Principle 8) — already the
  pattern `/ops/search` uses today; SP3.1 continues it, no new auth
  surface.
- Operations navigation foundation (§3's shell, replacing today's
  single-page `showPage()` switch) — **deferred, not part of SP3.1**
  (Founder Amendment 2). Whether this means real deep-linkable routing
  or a narrower nav-shell restructuring is an open design question
  requiring its own founder-approved plan doc before implementation;
  `frontend/public/admin.html` is not touched by SP3.1.
- Structured logging decision — replaces the literal "add to Phase 3" stub
  with a real, minimal `GET /ops/logs`. **Deferred, not part of SP3.1**
  (Founder Amendment 3). Requires a separate, founder-approved logging
  architecture covering storage, retention, access control, PII masking,
  and secret redaction before any logging endpoint is implemented.

**Phase 2 — Support Workspace (highest support-staff leverage per unit of
work)**
- Universal lookup (`GET /ops/lookup`) covering the 6 resolution types in
  §4.
- Customer/Business/Landing Page/Subscriber lookup views.
- Customer & Business Journey (`GET /ops/journey`) as read-time
  aggregation of the confirmed-aggregatable events from §4's table, plus
  the new `SupportAction` log going forward.
- Known Issues list, seeded with the discrepancies already documented in
  `DATABASE_SCHEMA.md`/`SYSTEM_ARCHITECTURE.md` (§0) — zero new discovery
  work needed to populate the first version.

**Phase 3 — Evidence and Diagnostics**
- API Inspector foundation (§6): capture-and-store instrumentation for the
  covered providers, summary view first, raw-payload access gated from day
  one (§6.4) — this is genuinely new instrumentation, so it lands before
  the diagnostics that depend on it.
- System Integrity checks (§7): the read-only check list, starting with the
  checks tied to already-documented discrepancies (§0) — again, zero new
  discovery work needed.
- Landing Page, Firecrawl, and AI/Anthropic diagnostics first (§5) —
  highest fragility per §9's ordering, and the surfaces API Inspector and
  Integrity checks most directly light up.
- Remaining subsystem diagnostics (Wallet, Push, Stripe, Clerk, Database,
  Loyalty reconciliation) follow incrementally, as each becomes the active
  support bottleneck.

**Phase 4 — Incidents and Runbooks**
- Incident lifecycle + timeline (§8), reusing Phase 1's `SupportAction` log
  and Phase 2's Journey mechanism.
- Resolution history (§4), sourced from the same `SupportAction` log rather
  than a separate freeform field.
- First 3–5 runbooks written for real (§8's list), not templated for all
  14 playbooks (§9) at once.

**Phase 5 — AI Investigation Mode**
- Only after Phases 2–4 have produced reliable evidence (Journey,
  Diagnostics, API Inspector, System Integrity, Incidents) — AI
  Investigation Mode built on top of thin or stubbed evidence would just
  hallucinate plausibly (Principle 11).
- Advisory only, in every sub-capability (§10.1, §10.2) — no exceptions in
  this phase.
- Any fix action remains approval-gated and `SupportAction`-audited
  (§10.1, §10.3) — this does not change in a later phase without a
  separate founder decision.
- Real Cost Analytics (`/ops/costs/*`) and Health history/time series
  round out this phase, since they depend on the same "real telemetry over
  hardcoded estimate" pattern (Principle 5) as everything else here.

Each phase should land as its own founder-approved plan doc (matching this
repo's established pattern — `frontend/public/qds/docs/*_v1.md`) before
implementation starts, consistent with `PROJECT_STATE.md`'s existing
plan-then-implement convention. No phase is a prerequisite-free big-bang —
each is independently useful on its own, per the framing above.

---

## 13. Terminology

Consistent names, used throughout this document and, going forward, in the
product itself:

- **QRAIVY Operations Center** — the internal application this document
  defines as a whole (supersedes "Admin Panel").
- **Support Workspace** — the account/business investigation area (§4):
  lookup, profiles, Journey, Known Issues, AI Investigation Mode entry
  point.
- **Customer & Business Journey** (or **Journey**) — the full per-account/
  per-slug lifecycle timeline (§4).
- **Diagnostics** — subsystem-specific "is this working, for this account"
  checks (§5).
- **System Health** — service reachability and latency (§3) — "is it up."
- **System Integrity** — data/configuration consistency (§7) — "is it
  correct."
- **API Inspector** — passive, evidence-focused record of API operations
  QRAIVY's backend already made (§6).
- **API Explorer** — a distinct, future, interactive tool for constructing
  and firing test API calls (§6.5) — not specified further in this
  document; do not conflate with API Inspector.
- **AI Investigation Mode** — the constrained, evidence-grounded advisory
  investigation workflow (§10.1).
- **AI Support** — the broader set of AI-assisted support capabilities
  (§10.2) that AI Investigation Mode draws on.
- **Support Playbook** — procedural support documentation and runbooks
  (§9); also this document's own overall subject matter.
- **Incident** — a tracked, lifecycle-managed event, distinct from a
  routine support case (§8).
- **SupportAction** — the durable audit log entry for any privileged action
  taken in the Operations Center (§11) — the record every "who did what,
  when, why" answer in this document ultimately traces back to.
