# QRAIVY Admin Architecture — Source of Truth

> **QRAIVY ADMIN ARCHITECTURE GUARDRAIL**
>
> Before modifying admin navigation, shared shell, page routing, Customers
> design, or approved admin page architecture, read this document and
> inspect the referenced approved visual assets.
>
> Do not redesign an approved page unless explicitly requested.
>
> Do not substitute legacy pages for approved current pages.
>
> Preserve working functionality while migrating data and functionality
> underneath the approved design.

---

## Official business-owner admin shell

Source of truth:
- `frontend/public/js/dashboard-shell.js` — single `NAV_ITEMS` array driving **both** the desktop sidebar and the mobile bottom nav. Owns: sidebar markup, nav groups/order, active-item state (`setActive()`), collapse behavior, user footer, language-switcher UI, sign-out, and the mobile bottom-nav bar.
- `frontend/public/dashboard-shell.css` — shared visual tokens/layout (`--sidebar-width`, `--dashboard-padding`, `--card-radius`, `--dashboard-accent`, etc.) consumed by every page on this shell.

**This is a distinct system from, and must never be merged with:**
- `frontend/public/admin.html`'s own inline `#sidebar` — the separate internal **staff/Operations Center** tool (Universal Search/Ctrl+K, System Overview, All Customers = QRAIVY's own paying businesses, Revenue, Platform Health). Different product, different data model, different audience.
- `frontend/public/js/shell-admin.js` — dead code. References a `/admin/*.html` route structure that was never built (`frontend/public/admin/` doesn't exist); never actually initializes since `admin.html`'s `<body>` has no `data-shell="admin"` attribute.
- `frontend/public/js/shell-customer.js` — an older, separate, abandoned unification attempt (the third of four historical attempts at this exact shell, per this doc's own predecessor `docs/dashboard-design-system.md`). Currently wired only to `qr-manage.html`.
- Any page's own hardcoded inline `#sidebar` markup — legacy, being migrated away from page by page (see status table below).

---

## Current menu (as actually implemented in `dashboard-shell.js`)

| Group | Item | Route | Icon | Mobile |
|---|---|---|---|---|
| Main | Dashboard | `dashboard.html` | ⊞ | "Home", bottom-nav slot 1 |
| Main | Analytics | `analytics.html` | ↗ | sidebar only |
| Smart Pages | Smart QR Pages | `dashboard.html` | ⬡ | bottom-nav slot 2, live-count badge |
| Smart Pages | Create New QR | `dashboard.html?launch=onboarding` | ＋ | sidebar only (opens onboarding modal) |
| Engage | AI Campaigns | `dashboard.html?section=campaigns` | 📣 | bottom-nav slot 5 |
| Engage | **Customers** | `dashboard.html?section=customers` | 👥 | bottom-nav slot 4 |
| Engage | Loyalty | `dashboard.html?section=loyalty` | 🎫 | bottom-nav slot 3 |
| Configure | Wallet Passes | `wallet-pass-studio.html` | 💳 | sidebar only |
| Account | Billing & Plans | `upgrade.html` | 💳 | sidebar only |
| Account | Settings | `#` (sidebar: "Coming soon" toast) / `dashboard.html?section=settings` (mobile) | ⚙ | bottom-nav slot 6 |

- **Active state**: one `QraivyDashboardShell.setActive(navId)` call updates every element carrying `data-nav-id`, desktop and mobile together — no separate per-surface active-state system.
- **EN/DE**: `nav_subscribers` i18n key → `"Customers"` (EN) / `"Kunden"` (DE). Every other label has a matching translation entry.
- **Desktop**: fixed 220px sidebar (`--sidebar-width`), collapsible via `#sb-toggle`, state persisted in `localStorage('sb-collapsed')`.
- **Mobile (≤768px)**: sidebar hides entirely; the 6-item bottom nav (`#bottom-nav`) is the sole mobile nav surface — derived from the same `NAV_ITEMS`, not a separate list.
- **Search / Ctrl+K**: does **not** exist on this shell. It exists only on the separate internal `admin.html` Operations Center ("Universal Search", `sb-search-nav-btn`, `Ctrl K` hint) — do not confuse the two when asked about "admin search."

---

## Current admin page status

| Page/section | Filename | Route | Shell used | Status | Known unfinished work |
|---|---|---|---|---|---|
| Dashboard | `dashboard.html` | `dashboard.html` | `dashboard-shell.js` | **APPROVED / CURRENT** | — |
| Smart QR Pages | `dashboard.html` (`#main-content`) | `dashboard.html` | `dashboard-shell.js` | **APPROVED / CURRENT** | — |
| Create New QR | `dashboard.html` (onboarding modal, `onboarding.js`) | `dashboard.html?launch=onboarding` | `dashboard-shell.js` | **APPROVED / CURRENT** | — |
| AI Campaigns | `dashboard.html` (`#section-campaigns`) | `?section=campaigns` | `dashboard-shell.js` | **APPROVED / CURRENT** | — |
| **Customers** | `dashboard.html` (`#section-customers`) | `?section=customers` | `dashboard-shell.js` | **APPROVED (design) / CURRENT — DATA WORK PENDING** | Uses `MOCK_CUSTOMERS`; canonical Customer API not built yet — see Part L below |
| Loyalty | `dashboard.html` (`#section-loyalty`) | `?section=loyalty` | `dashboard-shell.js` | **APPROVED / CURRENT** | Live data |
| Wallet Passes | `wallet-pass-studio.html` | own page | `dashboard-shell.js` (migrated) | **APPROVED / CURRENT** | — |
| Billing & Plans | `upgrade.html` | own page | none (standalone, no admin sidebar by design) | **APPROVED / CURRENT** | — |
| Settings | `dashboard.html` (`#section-settings`) | `?section=settings` | `dashboard-shell.js` | **CURRENT — DATA/FEATURE WORK PENDING** | Sidebar entry shows "Coming soon" toast; only reachable functionally via mobile bottom nav |
| Analytics | `analytics.html` | own page | `dashboard-shell.js` (migrated) | **APPROVED / CURRENT** | See Part I |
| Designs | `designer-saved.html` ("AI Print Designer") | own page | own static sidebar (legacy) | **LEGACY** | Not yet migrated to shared shell |
| — | `loyalty-setup.html` | own page | own static sidebar (legacy) | **LEGACY** | Not yet migrated to shared shell |
| Deals | — | — | — | **DOES NOT EXIST AS AN ADMIN PAGE** | Backend scaffolding only (`dealController.js`, `DealClaim`/`Deal` models, uncommitted); no live claim/redemption flow; no frontend page |
| Locations / Multi-location | — | — | — | **DOES NOT EXIST** | Long-term direction only — `docs/adr/004-multi-location-hierarchy.md` ("Accepted; not yet implemented"). Today's schema is flat `User → LandingPage`, no `Brand`/`Location` model |
| Customers mockup (superseded) | `customers-preview.html` | standalone | none | **PROTOTYPE / UNUSED** | Superseded by `dashboard.html#section-customers` |
| Homepage V2 | `homepage-v2.html` | standalone | n/a | **PROTOTYPE / UNUSED** (unrelated to admin) | Not the admin baseline; see `docs/HOMEPAGE-ARCHITECTURE.md` |
| Legacy Subscribers | `dashboard.html` (`#section-subscribers`) | unreachable from current nav | old page-local styles | **LEGACY** | Kept intact, unreferenced by any current nav item — see rule below |

> **Never replace a current QRAIVY admin page with a legacy/prototype page merely because the legacy implementation already has live data.**
> **Migrate proven data into the approved current design instead.**

---

## Approved Customers design baseline

**`docs/approved-designs/admin/customers-approved-v1.png`** — the founder-approved screenshot, stored unmodified (byte-for-byte copy, 168,707 bytes, verified against the source file).

This is **APPROVED CUSTOMERS DESIGN BASELINE — V1**.

> **CUSTOMERS DESIGN GUARDRAIL**
>
> The approved Customers screenshot is the visual source of truth.
>
> Future Customer data work must be implemented underneath this design.
>
> DATA CHANGES UNDER THE DESIGN — NOT A NEW DESIGN AROUND THE DATA.
>
> Do not substantially redesign, replace, or restructure this Customers
> experience without explicit founder approval.

**Customers status summary:**
- Design: **APPROVED**
- Navigation: **CURRENT**
- Canonical Customer foundation: **PHASE 4 READ API** (see `docs/architecture/CUSTOMER_FOUNDATION.md`)
- Live Customer API: **BACKEND READY / NOT YET WIRED TO UI**
- UI data: **PREVIEW/MOCK** until a later phase wires it

Confirmed elements matching the current `#section-customers` implementation: header ("Customers" + description), 5 KPI cards (Total Customers/Email/Push/Wallet/Loyalty), unified customer table (avatar/initials, name, email, channel indicators, loyalty progress bar, last activity, status badge), Smart Segments (Reward Ready/Inactive 30+ Days/Wallet Customers/Most Engaged) each with "View Customers"/"Create Campaign" actions, dark/orange QRAIVY visual language, shared sidebar. **No visual redesign occurred in producing this document or in Phase 2 work.**

---

## Current Customers routing

`frontend/public/dashboard.html`, section `#section-customers`, reached via `dashboard.html?section=customers`. This is the intended Customers/Kunden destination — confirmed the sole route the shared shell (desktop sidebar + mobile bottom nav) points to.

`#section-subscribers` is **legacy**: markup, styling, and its data-loading code (`window.subLoad`, calling the real `/loyalty/subscribers/summary` and `/loyalty/subscribers/:slug/detail` endpoints) remain intact and untouched, but no current navigation surface opens it. Retained for fallback/reference only, per explicit instruction not to delete it yet.

The current Customers preview/mock data (`MOCK_CUSTOMERS`) remains in place until the canonical Customer API is ready — **not removed during Phase 2**.

---

## Analytics status

`frontend/public/analytics.html` has been migrated to the current shared business-owner shell (`dashboard-shell.js`/`dashboard-shell.css`) — static duplicated sidebar removed, `data-shell="customer" data-active-nav="nav-analytics"` added, user population routed through `QraivyDashboardShell.setUser()`. Not redesigned in this task. One known, pre-existing (not shell-related) issue remains open: the page's `initAnalytics()` trigger (`onload=""` attribute on its Clerk `<script>` tag) does not reliably fire on real page load — flagged, not fixed, out of scope for admin/Customers work.

---

## Testing environments

Lesson from a prior admin-recovery task: the QRAIVY admin depends on real authentication, real backend APIs, and real business data — **a static localhost preview cannot exercise any of that.**

- **Functional admin testing** (auth, live data, real API behavior): use the proper deployed/authenticated QRAIVY environment. The one verified from repository evidence: `https://preview.qraivy.com` (Vercel), documented in `docs/WORKLOG.md` as tracking `preview/sprint-2d-smart-qr-renderer`, calling the single production backend `https://api.qraivy.com` (no staging backend exists) and the same production database — no isolation. **As of the last verification this session, this session's uncommitted shell-migration work has not been pushed there yet.** CORS allowlist gap and Clerk-domain-allowlist status for that URL were flagged as unconfirmed/unverified in a prior task — check before relying on it working end-to-end.
- **Localhost** (`http://localhost:5500/...`): appropriate only for static visual inspection, isolated development, and intentionally local testing (e.g. via the `?preview=1` local-only bypass already built into `dashboard.html`/`wallet-pass-studio.html`/`analytics.html`). **Do not conclude that authenticated, production-style functionality is broken merely because a static localhost preview cannot reach the required auth/API environment** — this was the exact root cause of a prior false alarm this session.

No other preview/staging URL is stored anywhere in this repository — not inventing one.
