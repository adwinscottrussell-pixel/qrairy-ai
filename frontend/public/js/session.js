/**
 * session.js — QRairy Centralized Session Model
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for session type, entitlements, routing
 * decisions, feature gates, and upgrade prompts.
 *
 * sessionType enum:
 *   anonymous | free | trial | premium | admin
 *
 * Include on every app page (customer + admin):
 *   <script src="/js/session.js"></script>
 *
 * Do NOT duplicate entitlement checks in individual pages.
 * Call QRairySession.init() once after Clerk loads.
 * ─────────────────────────────────────────────────────────────────
 */

const QRairySession = (function () {
  'use strict';

  // ── Session type enum ─────────────────────────────────────────
  var TYPE = {
    ANONYMOUS : 'anonymous',
    FREE      : 'free',
    TRIAL     : 'trial',
    PREMIUM   : 'premium',
    ADMIN     : 'admin',
  };

  // ── Feature gate definitions ──────────────────────────────────
  // Each feature lists the minimum session types that can access it.
  var GATES = {
    freeQrGenerator   : [TYPE.ANONYMOUS, TYPE.FREE, TYPE.TRIAL, TYPE.PREMIUM, TYPE.ADMIN],
    dashboard         : [TYPE.FREE, TYPE.TRIAL, TYPE.PREMIUM, TYPE.ADMIN],
    analytics         : [TYPE.TRIAL, TYPE.PREMIUM, TYPE.ADMIN],
    subscribers       : [TYPE.TRIAL, TYPE.PREMIUM, TYPE.ADMIN],
    campaigns         : [TYPE.PREMIUM, TYPE.ADMIN],
    walletPasses      : [TYPE.PREMIUM, TYPE.ADMIN],
    aiLandingPage     : [TYPE.PREMIUM, TYPE.ADMIN],
    aiAssistant       : [TYPE.PREMIUM, TYPE.ADMIN],
    adminPanel        : [TYPE.ADMIN],
  };

  // ── Route groups ──────────────────────────────────────────────
  var ROUTES = {
    public: {
      home    : '/',
      pricing : '/pricing.html',
      freeQr  : '/qr/free.html',
      login   : '/login.html',
    },
    app: {
      dashboard   : '/app/dashboard.html',
      analytics   : '/app/analytics.html',
      pages       : '/app/pages.html',
      subscribers : '/app/subscribers.html',
      wallet      : '/app/wallet.html',
      upgrade     : '/app/upgrade.html',
    },
    admin: {
      overview  : '/admin/index.html',
      users     : '/admin/users.html',
      revenue   : '/admin/revenue.html',
      analytics : '/admin/analytics.html',
      health    : '/admin/health.html',
      billing   : '/admin/billing.html',
      settings  : '/admin/settings.html',
    },
  };

  // ── Internal state ────────────────────────────────────────────
  var _session = {
    type      : TYPE.ANONYMOUS,
    userId    : null,
    email     : null,
    firstName : null,
    plan      : null,
    trialEnd  : null,
    role      : null,
    loaded    : false,
  };

  // ── Derive session type from Clerk user metadata ──────────────
  function _deriveType(user) {
    if (!user) return TYPE.ANONYMOUS;

    var meta = user.publicMetadata || {};

    if (meta.role === 'admin')     return TYPE.ADMIN;
    if (meta.plan === 'premium')   return TYPE.PREMIUM;

    // Trial: plan=trial and trialEnd is in the future
    if (meta.plan === 'trial' && meta.trialEnd) {
      var expiry = new Date(meta.trialEnd);
      if (expiry > new Date()) return TYPE.TRIAL;
      // Trial expired — downgrade to free
      return TYPE.FREE;
    }

    return TYPE.FREE;
  }

  // ── Load session from Clerk ───────────────────────────────────
  async function init() {
    if (!window.Clerk) {
      _session.type   = TYPE.ANONYMOUS;
      _session.loaded = true;
      return _session;
    }

    await window.Clerk.load();
    var user = window.Clerk.user;

    if (!user) {
      _session.type   = TYPE.ANONYMOUS;
      _session.loaded = true;
      return _session;
    }

    var meta = user.publicMetadata || {};

    _session.type      = _deriveType(user);
    _session.userId    = user.id;
    _session.email     = user.primaryEmailAddress
                           ? user.primaryEmailAddress.emailAddress : null;
    _session.firstName = user.firstName || null;
    _session.plan      = meta.plan || 'free';
    _session.trialEnd  = meta.trialEnd || null;
    _session.role      = meta.role || null;
    _session.loaded    = true;

    return _session;
  }

  // ── Feature gate check ────────────────────────────────────────
  function can(feature) {
    var allowed = GATES[feature];
    if (!allowed) {
      console.warn('[QRairySession] Unknown feature gate:', feature);
      return false;
    }
    return allowed.indexOf(_session.type) !== -1;
  }

  // ── Routing helpers ───────────────────────────────────────────

  // Redirect if current session cannot access a feature.
  // upgradePath: where to send them if they lack access (optional).
  function requireFeature(feature, upgradePath) {
    if (!_session.loaded) {
      console.warn('[QRairySession] requireFeature called before init()');
      return;
    }
    if (!can(feature)) {
      var dest = upgradePath || ROUTES.app.upgrade;
      window.location.replace(dest);
    }
  }

  // Used by auth-guard and admin-guard — enforce minimum session type.
  function requireType(minType, redirectTo) {
    var ORDER = [
      TYPE.ANONYMOUS,
      TYPE.FREE,
      TYPE.TRIAL,
      TYPE.PREMIUM,
      TYPE.ADMIN,
    ];
    var currentIdx = ORDER.indexOf(_session.type);
    var requiredIdx = ORDER.indexOf(minType);

    if (currentIdx < requiredIdx) {
      window.location.replace(redirectTo || ROUTES.public.login);
    }
  }

  // ── Upgrade prompt logic ──────────────────────────────────────
  // Returns true if an upgrade prompt should be shown on this page.
  function shouldShowUpgradePrompt(feature) {
    if (_session.type === TYPE.PREMIUM || _session.type === TYPE.ADMIN) {
      return false;
    }
    return !can(feature);
  }

  // ── Trial status ──────────────────────────────────────────────
  function trialDaysLeft() {
    if (_session.type !== TYPE.TRIAL || !_session.trialEnd) return 0;
    var msLeft = new Date(_session.trialEnd) - new Date();
    return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    TYPE                 : TYPE,
    ROUTES               : ROUTES,
    GATES                : GATES,
    init                 : init,
    get                  : function () { return Object.assign({}, _session); },
    can                  : can,
    requireFeature       : requireFeature,
    requireType          : requireType,
    shouldShowUpgradePrompt : shouldShowUpgradePrompt,
    trialDaysLeft        : trialDaysLeft,
    isAdmin              : function () { return _session.type === TYPE.ADMIN; },
    isAuthenticated      : function () { return _session.type !== TYPE.ANONYMOUS; },
  };

})();
