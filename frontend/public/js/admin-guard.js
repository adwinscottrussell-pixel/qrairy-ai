/**
 * admin-guard.js — Frontend Admin Guard (UX Layer Only)
 * ─────────────────────────────────────────────────────────────
 * This is a UX convenience layer, NOT the security boundary.
 * Real security is enforced server-side in adminMiddleware.js.
 *
 * What this does:
 *   - Hides the page until Clerk session is confirmed
 *   - Redirects unauthenticated users to login
 *   - Redirects non-admin users to customer dashboard
 *   - Prevents flash of admin content before role is checked
 *
 * What this does NOT do:
 *   - Protect admin API data (that's adminMiddleware.js)
 *   - Serve as the only protection for admin routes
 *
 * Include on every /admin/* page, after Clerk script:
 *   <script src="/js/admin-guard.js"></script>
 * ─────────────────────────────────────────────────────────────
 */

(function () {

  // Hide page immediately — prevents flash of admin content
  document.documentElement.style.visibility = 'hidden';

  var REDIRECT = {
    login     : '/login.html',
    dashboard : '/dashboard.html',
  };

  function reveal() {
    document.documentElement.style.visibility = '';
  }

  function runGuard() {
    if (!window.Clerk) {
      // Clerk not loaded — send to login, backend will block API calls anyway
      window.location.replace(REDIRECT.login +
        '?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }

    window.Clerk.load().then(function () {
      var user = window.Clerk.user;

      // Not authenticated — go to login
      if (!user) {
        window.location.replace(REDIRECT.login +
          '?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      // Authenticated but not admin — go to customer dashboard
      var meta = user.publicMetadata || {};
      if (meta.role !== 'admin') {
        window.location.replace(REDIRECT.dashboard);
        return;
      }

      // Confirmed admin — reveal page
      reveal();

    }).catch(function () {
      window.location.replace(REDIRECT.login);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runGuard);
  } else {
    runGuard();
  }

})();
