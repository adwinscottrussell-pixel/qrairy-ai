/**
 * admin-guard.js — Frontend Admin Guard (UX Layer Only)
 * ─────────────────────────────────────────────────────────────
 * This is a UX convenience layer, NOT the security boundary.
 * Real security is enforced server-side: adminMiddleware.js (requireAdmin)
 * for Owner/platform-admin routes, locationManagerAuth.js
 * (requireManagerScope) for the City/Location Manager routes below.
 *
 * What this does:
 *   - Hides the page until Clerk session is confirmed
 *   - Redirects unauthenticated users to login
 *   - Reveals the page in Owner mode for publicMetadata.role === 'admin'
 *   - Otherwise checks GET /manager/context (the same server-side-scoped
 *     read the City Operations Center itself uses) -- if it returns at
 *     least one City, reveals the page in Manager mode instead of
 *     redirecting. This call can only ever return what requireManagerScope
 *     already resolved for this user; it is not a separate trust decision.
 *   - Redirects everyone else (no admin role, no manager scope) to the
 *     customer dashboard
 *   - Prevents flash of admin content before role/scope is checked
 *
 * What this does NOT do:
 *   - Protect admin or manager API data (that's adminMiddleware.js /
 *     locationManagerAuth.js) -- a forged window.QRAIVY_ADMIN_MODE value
 *     grants nothing; every /admin/* and /manager/* call is independently
 *     authorized server-side regardless of what this file decided.
 *   - Serve as the only protection for admin or manager routes
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
  var API_BASE = 'https://api.qraivy.com';

  function reveal() {
    document.documentElement.style.visibility = '';
  }

  function enterManagerModeOrRedirect(token) {
    fetch(API_BASE + '/manager/context', {
      headers: { 'Authorization': 'Bearer ' + token },
    }).then(function (res) {
      if (!res.ok) { window.location.replace(REDIRECT.dashboard); return null; }
      return res.json();
    }).then(function (data) {
      if (!data) return; // already redirected above
      if (!data.locations || !data.locations.length) {
        window.location.replace(REDIRECT.dashboard);
        return;
      }
      window.QRAIVY_ADMIN_MODE = 'manager';
      window.QRAIVY_MANAGER_CONTEXT = data;
      // Run the manager-mode DOM setup (hide Owner-only nav, build the
      // City nav, load the workspace) while still hidden, then reveal --
      // avoids a flash of Owner navigation before it's hidden.
      if (window.enterManagerMode) window.enterManagerMode(data);
      reveal();
    }).catch(function () {
      window.location.replace(REDIRECT.dashboard);
    });
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

      var meta = user.publicMetadata || {};
      if (meta.role === 'admin') {
        // Confirmed platform Owner/Admin — reveal page in Owner mode.
        // Unchanged from before: no manager check, no extra request.
        window.QRAIVY_ADMIN_MODE = 'owner';
        reveal();
        return;
      }

      // Not a platform admin -- check whether they're a scoped City/
      // Location Manager before falling back to the customer dashboard.
      window.Clerk.session.getToken().then(function (token) {
        enterManagerModeOrRedirect(token);
      }).catch(function () {
        window.location.replace(REDIRECT.dashboard);
      });

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
