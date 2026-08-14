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
  // Local-only visual preview bypass. Requires BOTH a local hostname AND an
  // explicit ?preview=1 flag — never true on qraivy.com, a Vercel preview
  // deployment, or Railway. If either condition is false, this is a no-op
  // and the guard below runs exactly as it always has.
  var _host = window.location.hostname;
  var _isLocalHost = _host === 'localhost' || _host === '127.0.0.1';
  var _hasPreviewFlag = /(?:^|[?&])preview=1(?:&|$)/.test(window.location.search);
  if (_isLocalHost && _hasPreviewFlag) return;

  // Hide page immediately — revealed only after auth resolves
  document.documentElement.style.visibility = 'hidden';

  var LOGIN_URL = '/login.html';

  // Resolve the login redirect path relative to current page
  function getLoginUrl() {
    var path = window.location.pathname;
    // Normalise to root-relative
    return LOGIN_URL + '?redirect=' + encodeURIComponent(path);
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
