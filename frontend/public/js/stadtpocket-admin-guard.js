/**
 * stadtpocket-admin-guard.js — StadtPocket Admin Guard (UX Layer Only).
 * Phase 6D, extended 6D.1 for manager-invite acceptance and an explicit
 * unauthorized state.
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
 * backend's requireStadtpocketWriteScope (Phase 6C), requireAdmin, or
 * requireManagerScope, which re-verify the Clerk token and re-resolve
 * scope server-side on every request -- this file only decides whether
 * to reveal the page shell, never whether a specific read/write succeeds.
 * Accepting a manager invite (see maybeAcceptPendingInvite below) is
 * itself just another authenticated backend call
 * (POST /manager-invites/accept, requireAuth) -- this file never decides
 * by itself that an invite is valid; it only forwards the token and
 * reports whatever the backend actually decided.
 *
 * Role determination is backend-driven, not inferred from email/client
 * constants: Global Admin is the same Clerk publicMetadata.role check
 * every other admin page already uses (fast, no network round-trip
 * needed since Clerk exposes it in the session); City Manager status is
 * confirmed by actually calling GET /manager/context and checking for a
 * non-empty scope -- a real backend answer, not a guess.
 *
 * Sets window.__stadtpocketRole to 'global_admin' | 'city_manager' |
 * 'unauthorized', window.__stadtpocketManagerLocations (only for
 * city_manager), and window.__stadtpocketUnauthorizedReason (only for
 * 'unauthorized', a short human-readable reason if one is known -- e.g.
 * an invite-acceptance error -- or null for the generic "no role
 * assigned yet" case) before revealing the page, so
 * stadtpocket-admin.html's own script doesn't need to re-derive any of
 * this from scratch.
 *
 * IMPORTANT ARCHITECTURAL RULE (see the Phase 6D.1 task): authentication
 * (Clerk proving who the user is) and authorization (this backend-driven
 * scope resolution) are kept strictly separate here. A user who signs in
 * successfully but has no Global Admin role and no NetworkMember/accepted
 * invite is 'unauthorized', not silently upgraded to any access level --
 * there is no code path in this file that infers or grants a role from
 * anything other than the two real backend checks below.
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  document.documentElement.style.visibility = 'hidden';

  var API_BASE = window.location.hostname === 'preview.qraivy.com'
    ? 'https://pacific-youth-staging.up.railway.app'
    : 'https://api.qraivy.com';
  var REDIRECT = {
    login: '/stadtpocket-login.html',
  };

  function reveal() {
    document.documentElement.style.visibility = '';
  }

  function goToLogin() {
    // Preserves the current full path + query (so an inviteToken on the
    // URL survives the round trip through sign-in) as the `redirect`
    // param -- stadtpocket-login.html validates it with the exact same
    // isSafeLocalPath used by login.html before ever using it.
    var here = window.location.pathname + window.location.search;
    window.location.replace(REDIRECT.login + '?redirect=' + encodeURIComponent(here));
  }

  function setUnauthorized(reason) {
    window.__stadtpocketRole = 'unauthorized';
    window.__stadtpocketUnauthorizedReason = reason || null;
    reveal();
  }

  // If the current URL carries an inviteToken (the manager invite email's
  // link lands here after sign-in, per stadtpocket-login.html's own
  // redirect-target construction), attempt to accept it before resolving
  // /manager/context -- accepting is what CREATES the NetworkMember row
  // /manager/context depends on, so without this step a first-time
  // invitee would always see "no access" on their very first visit.
  // Best-effort: any failure (wrong email, expired, already used) is
  // surfaced as a specific reason string rather than blocking the
  // subsequent /manager/context check, since a user might already have
  // separate, real access even if this particular invite can't be
  // accepted (e.g. they already accepted it in another tab).
  async function maybeAcceptPendingInvite(token) {
    var inviteToken = new URLSearchParams(window.location.search).get('inviteToken');
    if (!inviteToken) return null;
    try {
      var res = await fetch(API_BASE + '/manager-invites/accept', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken }),
      });
      if (res.ok) return null; // accepted -- no error to report
      var body = null;
      try { body = await res.json(); } catch (e) { /* no body */ }
      return (body && body.error) || 'Diese Einladung konnte nicht angenommen werden.';
    } catch (e) {
      return null; // network failure here is not itself proof of an invalid invite -- fall through to the normal scope check
    }
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

    // Not a Global Admin -- resolve real StadtPocket authorization from
    // the backend only. Never inferred from email, display name, URL
    // parameters, or localStorage.
    try {
      var token = await window.Clerk.session.getToken();
      var inviteError = await maybeAcceptPendingInvite(token);

      var res = await fetch(API_BASE + '/manager/context', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        setUnauthorized(inviteError);
        return;
      }
      var data = await res.json();
      var locationIds = (data && data.scope && data.scope.locationIds) || [];
      if (locationIds.length === 0) {
        setUnauthorized(inviteError);
        return;
      }
      window.__stadtpocketRole = 'city_manager';
      window.__stadtpocketManagerLocations = data.locations || [];
      reveal();
    } catch (e) {
      setUnauthorized(null);
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
  // captured instead of discarded. Unchanged by the 6D.1 additions above
  // -- boot() still never runs until this promise resolves, so there is
  // still no fallback-to-city-manager-while-unresolved race.
  window.__stadtpocketGuardReady = new Promise(function (resolve) {
    function start() { resolve(runGuard()); }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  });
})();
