/**
 * router.js — QRairy Centralized Flow Router
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for all routing decisions.
 *
 * Two flows:
 *   free  → /qr/free.html        (no auth)
 *   smart → /dashboard.html      (Clerk auth required)
 *
 * Usage in HTML:
 *   <button data-flow="free">Generate QR Code</button>
 *   <button data-flow="smart">Smart QR Dashboard</button>
 *
 * The router binds all [data-flow] elements on DOMContentLoaded.
 * No text detection. No inline onclick overrides. No patches.
 *
 * Place in: frontend/public/js/router.js
 * Include in index.html: <script src="js/router.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */

const QRairyRouter = (function () {

  // ── Route definitions ─────────────────────────────────────────
  const ROUTES = {
    free:      '/qr/free.html',
    smart:     '/dashboard.html',
    login:     '/login.html',
  };

  // ── Navigate to free QR (no auth) ────────────────────────────
  function navigateFree(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    window.location.href = ROUTES.free;
  }

  // ── Navigate to Smart QR (auth required) ─────────────────────
  async function navigateSmart(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const clerk = await loadClerk();
    if (!clerk) {
      // Clerk not available — fallback to login page
      window.location.href = ROUTES.login + '?redirect=dashboard';
      return;
    }

    if (clerk.user) {
      window.location.href = ROUTES.smart;
    } else {
      clerk.openSignIn({
        afterSignInUrl:  ROUTES.smart,
        afterSignUpUrl:  ROUTES.smart,
      });
    }
  }

  // ── Lazy-load Clerk and resolve when ready ───────────────────
  function loadClerk() {
    return new Promise(function (resolve) {
      if (window.Clerk && window.Clerk.loaded) {
        resolve(window.Clerk);
        return;
      }
      if (window.Clerk) {
        window.Clerk.load().then(function () {
          resolve(window.Clerk);
        }).catch(function () { resolve(null); });
        return;
      }
      // Clerk script not on page — resolve null
      resolve(null);
    });
  }

  // ── Bind all [data-flow] elements ─────────────────────────────
  function bindFlowElements() {
    document.querySelectorAll('[data-flow]').forEach(function (el) {
      var flow = el.getAttribute('data-flow');

      if (flow === 'free') {
        // Strip any existing href that might conflict
        if (el.tagName === 'A') el.setAttribute('href', ROUTES.free);
        el.addEventListener('click', navigateFree);

      } else if (flow === 'smart') {
        if (el.tagName === 'A') el.setAttribute('href', '#');
        el.addEventListener('click', navigateSmart);
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindFlowElements);
    } else {
      bindFlowElements();
    }
  }

  init();

  // ── Public API ────────────────────────────────────────────────
  return {
    navigateFree:  navigateFree,
    navigateSmart: navigateSmart,
    ROUTES:        ROUTES,
  };

})();
