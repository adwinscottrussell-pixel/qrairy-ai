/**
 * stadtpocket-admin-guard.js — StadtPocket Admin Guard (UX Layer Only).
 * Phase 6D.
 * ─────────────────────────────────────────────────────────────
 * Same discipline as js/admin-guard.js, which this deliberately does
 * NOT modify or reuse directly -- that guard only ever admits
 * publicMetadata.role === 'admin' (Global Admin), and stadtpocket-admin.html
 * must also admit a City Manager, who has no such role. This is a
 * separate, StadtPocket-scoped guard rather than a change to the
 * existing admin.html's access rules.
 *
 * This is a UX convenience layer, NOT the security boundary. Every real
 * StadtPocket read/write in stadtpocket-admin.html goes through the
 * backend's requireStadtpocketWriteScope (Phase 6C) or requireAdmin /
 * requireManagerScope, which re-verify the Clerk token and re-resolve
 * scope server-side on every request -- this file only decides whether
 * to reveal the page shell, never whether a specific read/write succeeds.
 *
 * Role determination is backend-driven, not inferred from email/client
 * constants: Global Admin is the same Clerk publicMetadata.role check
 * every other admin page already uses (fast, no network round-trip
 * needed since Clerk exposes it in the session); City Manager status is
 * confirmed by actually calling GET /manager/context and checking for a
 * non-empty scope -- a real backend answer, not a guess.
 *
 * Sets window.__stadtpocketRole to 'global_admin' | 'city_manager' and
 * window.__stadtpocketManagerLocations (only for city_manager) before
 * revealing the page, so stadtpocket-admin.html's own script doesn't
 * need to re-derive role from scratch.
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  document.documentElement.style.visibility = 'hidden';

  var API_BASE = 'https://api.qraivy.com';
  var REDIRECT = {
    login: '/login.html',
    dashboard: '/dashboard.html',
  };

  function reveal() {
    document.documentElement.style.visibility = '';
  }

  function goToLogin() {
    window.location.replace(REDIRECT.login + '?redirect=' + encodeURIComponent(window.location.pathname));
  }

  function goToDashboard() {
    window.location.replace(REDIRECT.dashboard);
  }

  async function runGuard() {
    if (!window.Clerk) {
      goToLogin();
      return;
    }

    try {
      await window.Clerk.load();
    } catch (e) {
      goToLogin();
      return;
    }

    var user = window.Clerk.user;
    if (!user) {
      goToLogin();
      return;
    }

    var meta = user.publicMetadata || {};
    if (meta.role === 'admin') {
      window.__stadtpocketRole = 'global_admin';
      reveal();
      return;
    }

    // Not a Global Admin -- ask the backend whether this user has any
    // real City Manager scope. A 403/empty response means no access;
    // this is never assumed from anything client-side.
    try {
      var token = await window.Clerk.session.getToken();
      var res = await fetch(API_BASE + '/manager/context', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        goToDashboard();
        return;
      }
      var data = await res.json();
      var locationIds = (data && data.scope && data.scope.locationIds) || [];
      if (locationIds.length === 0) {
        goToDashboard();
        return;
      }
      window.__stadtpocketRole = 'city_manager';
      window.__stadtpocketManagerLocations = data.locations || [];
      reveal();
    } catch (e) {
      goToDashboard();
    }
  }

  // Exposes the guard's own completion as a promise so
  // stadtpocket-admin.html's boot() can wait for window.__stadtpocketRole
  // / window.__stadtpocketManagerLocations to actually be set before
  // reading them, instead of racing this async chain. Previously
  // runGuard() was fired-and-forgotten here, so boot() (called
  // synchronously, immediately, at the bottom of the page's own inline
  // script) always read both globals while they were still undefined --
  // producing a "City Manager" / empty-cities render regardless of the
  // real role, for every account, every time. Same
  // readyState-driven trigger timing as before, just with its promise
  // captured instead of discarded.
  window.__stadtpocketGuardReady = new Promise(function (resolve) {
    function start() { resolve(runGuard()); }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  });
})();
