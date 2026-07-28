// ============================================================
// QRAIVY — URL CONFIGURATION (static frontend)
// Single source of truth for the customer-facing origin used by
// client-side pages under frontend/public/. These files are served as
// static assets (no server-side templating, no build step), so this
// cannot read process.env like backend/src/config/urls.js does — it
// mirrors the same fallback values. Update both together if the
// canonical origin ever changes.
// ============================================================

window.PUBLIC_APP_ORIGIN = 'https://www.qraivy.com';
window.API_ORIGIN = 'https://api.qraivy.com';
