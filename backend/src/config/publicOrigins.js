/**
 * publicOrigins.js — the public addresses a rendered Smart Landing Page
 * points back to.
 * ─────────────────────────────────────────────────────────────
 * A customer page is HTML produced by this server. It contains absolute
 * addresses: where its AI assistant posts, where push subscriptions go,
 * where the Google Wallet link leads, and the page's own share address.
 * In production these are, and stay, the values below.
 *
 *   APP_ENV                 'staging' marks an isolated staging backend.
 *                           Unset (or anything else) = production.
 *   LP_PUBLIC_API_ORIGIN    origin the page calls the API on
 *   LP_PUBLIC_PAGE_ORIGIN   origin the page itself is reachable on
 *
 * Production ignores the two LP_PUBLIC_* settings entirely unless they
 * are set, and its defaults are the addresses it has always used.
 *
 * Staging (APP_ENV=staging) must be told both, explicitly, and neither
 * may be a production host. If that is not the case this module throws
 * when it is loaded, so a staging server does not start at all rather
 * than serve pages that quietly talk to production.
 *
 * What uses these settings: the customer page (renderPremiumLP) — its
 * AI assistant, push subscription and Google Wallet link.
 * OUTSIDE the staging test scope, and still rendered with production
 * addresses: stamp, loyalty card and reward pages, wallet passes, and
 * the QR codes that encode a page address. Do not test those on staging.
 * ─────────────────────────────────────────────────────────────
 */

const PRODUCTION_API_ORIGIN = 'https://api.qraivy.com';
const PRODUCTION_PAGE_ORIGIN = 'https://www.qraivy.com';
// Never valid for a staging backend.
const PRODUCTION_HOSTS = ['api.qraivy.com', 'www.qraivy.com', 'qraivy.com', 'pages.qraivy.com', 'qrairy-ai-production.up.railway.app'];

function cleanOrigin(value, name) {
  let url;
  try { url = new URL(String(value)); } catch (_) { throw new Error(`${name} is not a valid address.`); }
  if (url.protocol !== 'https:') throw new Error(`${name} must be an https address.`);
  if (url.pathname !== '/' || url.search || url.hash) throw new Error(`${name} must be an origin only, without a path.`);
  return url.origin;
}

function resolvePublicOrigins(env = process.env) {
  const staging = String(env.APP_ENV || '').trim().toLowerCase() === 'staging';
  const rawApi = (env.LP_PUBLIC_API_ORIGIN || '').trim();
  const rawPage = (env.LP_PUBLIC_PAGE_ORIGIN || '').trim();

  if (!staging) {
    return {
      staging: false,
      apiOrigin: rawApi ? cleanOrigin(rawApi, 'LP_PUBLIC_API_ORIGIN') : PRODUCTION_API_ORIGIN,
      pageOrigin: rawPage ? cleanOrigin(rawPage, 'LP_PUBLIC_PAGE_ORIGIN') : PRODUCTION_PAGE_ORIGIN,
    };
  }

  if (!rawApi || !rawPage) {
    throw new Error('APP_ENV=staging requires LP_PUBLIC_API_ORIGIN and LP_PUBLIC_PAGE_ORIGIN. A staging server does not fall back to production addresses.');
  }
  const apiOrigin = cleanOrigin(rawApi, 'LP_PUBLIC_API_ORIGIN');
  const pageOrigin = cleanOrigin(rawPage, 'LP_PUBLIC_PAGE_ORIGIN');
  for (const [name, origin] of [['LP_PUBLIC_API_ORIGIN', apiOrigin], ['LP_PUBLIC_PAGE_ORIGIN', pageOrigin]]) {
    if (PRODUCTION_HOSTS.includes(new URL(origin).hostname.toLowerCase())) {
      throw new Error(`${name} points to production. A staging server must not use production addresses.`);
    }
  }
  return { staging: true, apiOrigin, pageOrigin };
}

const resolved = resolvePublicOrigins();

module.exports = {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_PAGE_ORIGIN,
  PRODUCTION_HOSTS,
  resolvePublicOrigins,
  apiOrigin: resolved.apiOrigin,
  pageOrigin: resolved.pageOrigin,
  isStaging: resolved.staging,
};
