// corsOriginPolicy.js — CORS transport-origin allowlist.
//
// This decides whose responses a browser is allowed to read. It is NOT an
// authentication boundary — every admin route still requires a valid Clerk
// token + publicMetadata.role === 'admin' via requireAdmin regardless of
// origin (see middleware/adminMiddleware.js). Extracted from index.js so
// the matching logic can be unit-tested without booting the full app.

const STATIC_ALLOWED_ORIGINS = ['https://www.qraivy.com', 'https://qraivy.com', 'https://api.qraivy.com', 'https://preview.qraivy.com'];

// QRAIVY's own Vercel team/project preview deployments only. Every preview
// URL for this project ends in this exact, Vercel-assigned team-scope
// suffix (not attacker-choosable) — e.g.
// "qraivy-ai-git-preview-s-6053c5-adwinscottrussell-5957s-projects.vercel.app".
// Matching only this literal suffix (leading hyphen included, so it can
// only match at a real hostname-label boundary) means:
//   - "evil.vercel.app" / "random-project.vercel.app" never match (they
//     don't end with this suffix at all).
//   - "xadwinscottrussell-5957s-projects.vercel.app" never matches either
//     (missing the leading "-" boundary before "adwinscottrussell").
//   - a hostname merely containing the suffix earlier in the string, e.g.
//     "adwinscottrussell-5957s-projects.vercel.app.evil.com", is rejected
//     too, because endsWith checks the actual end of the string, not a
//     substring anywhere in it.
// Overridable via env var for future team/project changes; falls back to
// this known-safe default if unset.
const QRAIVY_VERCEL_PREVIEW_HOST_SUFFIX =
  process.env.VERCEL_PREVIEW_HOST_SUFFIX || '-adwinscottrussell-5957s-projects.vercel.app';

function isAllowedOrigin(origin) {
  // No Origin header at all -- not a cross-origin browser request (curl,
  // server-to-server, uptime checks). Nothing for CORS to enforce here;
  // matches the previous array-based config's behavior for these callers.
  if (!origin) return true;
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith(QRAIVY_VERCEL_PREVIEW_HOST_SUFFIX);
  } catch (e) {
    return false;
  }
}

module.exports = { isAllowedOrigin, STATIC_ALLOWED_ORIGINS, QRAIVY_VERCEL_PREVIEW_HOST_SUFFIX };
