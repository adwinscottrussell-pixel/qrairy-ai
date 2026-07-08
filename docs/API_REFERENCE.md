# QRAIVY — API Reference

> Endpoint paths, methods, and payloads below are **not documented yet** —
> this file only maps known route files to their likely domain, based on
> filenames and paired controllers/services in `backend/src/`. Do not treat
> any path as real until confirmed from the actual route file.

| Route module | File | Paired controller/service (observed) |
|---|---|---|
| Admin | `routes/adminRoutes.js` | `middleware/adminMiddleware.js` |
| AI | `routes/aiRoutes.js` | `@anthropic-ai/sdk` (direct dependency) |
| Analytics | `routes/analyticsRoutes.js` | `services/analyticsService.js` |
| API Keys | `routes/apiKeyRoutes.js` | `middleware/apiKeyAuth.js` |
| Design | `routes/designRoutes.js` | `controllers/designController.js` |
| Loyalty (admin) | `routes/loyaltyAdminRoutes.js` | `controllers/loyaltyAdminController.js`, `utils/tierSystem.js` |
| Landing Pages | `routes/lpRoutes.js` | `controllers/lpController.js`, `utils/pageCache.js` |
| Wallet Passes | `routes/passRoutes.js` | `controllers/passController.js`, `services/passService.js` |
| QR Codes | `routes/qrRoutes.js` | `controllers/qrController.js`, `services/qrService.js`, `services/scanService.js`, `utils/scanTracker.js` |
| Stripe | `routes/stripeRoutes.js` | `controllers/stripeController.js` |
| Tiers/Plans | `routes/tierRoutes.js` | `middleware/planGate.js`, `utils/tierSystem.js` |
| Users | `routes/userRoutes.js` | (auth via `@clerk/backend` — exact wiring TBD) |
| Wallet | `routes/walletRoutes.js` | `controllers/walletController.js`, `services/googleWalletService.js`, `services/walletThemes.js` |

## To document properly

For each route file above: list actual HTTP methods, paths, auth requirements
(Clerk session? API key? admin-only?), and request/response shapes. This
requires reading the route + controller files directly — happy to do this
once you share their contents or approve reading them from the repo.
