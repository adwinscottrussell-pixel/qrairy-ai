/**
 * auth-guard.js — QRairy Page-Level Auth Guard
 * ─────────────────────────────────────────────────────────────────
 * Called once at the top of every SMART QR protected page.
 * If the user has no Clerk session, redirects to login.html.
 *
 * Protected pages (add this script to all of them):
 *   dashboard.html, analytics.html, qr-manage.html,
 *   subscribers.html, campaigns.html, upgrade.html,
 *   wallet-passes.html, ai-assistant.html
 *
 * NOT needed on:
 *   index.html, login.html, qr/free.html, pricing.html
 *
 * Usage — place in <head> after the Clerk script tag:
 *   <script src="../js/auth-guard.js"></script>
 *
 * The page body is hidden until auth resolves (no flash of content).
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  // Hide page immediately — revealed only after auth resolves
  document.documentElement.style.visibility = 'hidden';

  var LOGIN_URL = '/login.html';

  // Resolve the login redirect path relative to current page. Includes
  // search (query string) as well as pathname -- e.g. dashboard.html's own
  // ?claimed=<businessId> StadtPocket activation context (Phase 3C.2) was
  // previously dropped here, silently losing it across the login round-trip.
  // Still root-relative only; login.html independently re-validates this
  // value with its own safeRedirectPath() before ever using it as a
  // redirect target, so this file constructing it is never itself the
  // safety boundary.
  function getLoginUrl() {
    var target = window.location.pathname + window.location.search;
    return LOGIN_URL + '?redirect=' + encodeURIComponent(target);
  }

  function reveal() {
    document.documentElement.style.visibility = '';
  }

  function redirectToLogin() {
    window.location.replace(getLoginUrl());
  }

  // Wait for Clerk, then check session
  function runGuard() {
    if (!window.Clerk) {
      // Clerk not loaded — hard redirect
      redirectToLogin();
      return;
    }

    window.Clerk.load().then(function () {
      if (window.Clerk.user) {
        reveal();
      } else {
        redirectToLogin();
      }
    }).catch(function () {
      redirectToLogin();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runGuard);
  } else {
    runGuard();
  }
})();
