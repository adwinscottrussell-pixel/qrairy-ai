# QRAIVY — Master Architecture

> Built from `backend/package.json` and the repo file tree only. Business
> logic and data flow are **not yet verified** against actual file contents —
> treat descriptions here as a starting map, not ground truth, until reviewed.

## 1. High-Level Shape

```
                 ┌────────────────────┐
   Browser  ───► │ frontend/public/   │  Static HTML/CSS/JS, no framework
                 └─────────┬──────────┘
                           │ REST/JSON (assumed — not yet confirmed)
                 ┌─────────▼──────────┐
                 │ backend/src/       │  Express API
                 │  routes/→controllers/→services/  │
                 └─────────┬──────────┘
                           │
        ┌──────────┬───────┼───────┬───────────┬────────────┐
        ▼          ▼       ▼       ▼           ▼            ▼
   Prisma/DB   Clerk    Stripe  Cloudinary  Resend      web-push /
   (schema     (auth)  (billing) (uploads)  (email)   passkit-generator /
    TBD)                                                googleapis (wallet)
                                                            Anthropic SDK (AI)
```

## 2. Backend Modules (from route filenames — endpoints themselves not yet read)

| Route file | Likely domain (inferred from name) |
|---|---|
| `adminRoutes.js` | Admin-only endpoints, paired with `adminMiddleware.js` |
| `aiRoutes.js` | AI features via `@anthropic-ai/sdk` |
| `analyticsRoutes.js` | Scan/engagement analytics, paired with `analyticsService.js` |
| `apiKeyRoutes.js` | API key management, paired with `apiKeyAuth.js` middleware |
| `designRoutes.js` | Landing page / QR design, paired with `designController.js` |
| `loyaltyAdminRoutes.js` | Loyalty program admin, paired with `loyaltyAdminController.js` |
| `lpRoutes.js` | Landing pages, paired with `lpController.js` |
| `passRoutes.js` | Wallet passes, paired with `passController.js`, `passService.js` |
| `qrRoutes.js` | QR code generation/resolution, paired with `qrController.js`, `qrService.js`, `scanService.js` |
| `stripeRoutes.js` | Stripe billing/webhooks, paired with `stripeController.js` |
| `tierRoutes.js` | Plan/tier logic, paired with `tierSystem.js`, `planGate.js` middleware |
| `userRoutes.js` | User account endpoints |
| `walletRoutes.js` | Wallet pass endpoints, paired with `walletController.js`, `googleWalletService.js`, `walletThemes.js` |

**Endpoints, request/response shapes, and auth requirements per route are not
documented here — they require reading the actual route/controller files.**
See `docs/API_REFERENCE.md` for the same caveat.

## 3. Frontend Surfaces (from filenames — not yet reviewed for content)

- Marketing/entry: `index.html`, `pricing.html`, `login.html`, `admin-login.html`
- Editor: `editor.html` + `js/canvas*.js`, `js/panels.js`, `js/toolbar.js`, `js/smart-block-editor.js`
- Dashboards: `dashboard.html`, `admin.html`, `qr-free-dashboard.html`
- Landing page tooling: `js/landing-generator.js`, `js/landing-page-renderer.js`, `js/landing-section-registry.js`
- Loyalty: `loyalty-setup.html`
- Wallet: `wallet-pass-studio.html`
- Analytics: `analytics.html` / `analytics-page.css`
- QR management: `qr-manage.html`, `qr-panel.html`, `qr-free.html`, `qr/free.html` (possible partial migration to a `qr/` namespace — flagged, not yet resolved)
- Onboarding: `onboarding.html`(?)/`onboarding.js`/`onboarding.css` (note: `onboarding.js` also exists under `js/` — flagged duplicate)
- Support/misc: `support.html`, `upgrade.html`, `stamp-scanner.html`, `visit.html`, `smart-demo.html`, `smart-preview.html`, `smart-qr-detail.html`, `designer-saved.html`, `lp-preview.html`

## 4. Deploy Targets

Both Railway and Vercel configs exist for both backend and frontend. Which is
actually live for which piece is **TBD** — confirm before assuming either is
authoritative, and definitely before changing either config.

## 5. Change Process

Any change to module boundaries, data flow, or deploy topology should be
reflected here in the same change. Given this doc currently rests on filename
inference rather than verified content, the first real update to this file
should come from someone who has read the actual route/service/schema files.
