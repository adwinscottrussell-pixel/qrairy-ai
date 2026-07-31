/**
 * dashboard-shell.js — QRAIVY shared customer dashboard shell.
 *
 * Single source of truth for the customer sidebar: markup, navigation
 * groups/order, active-item state, collapse behavior, mobile menu button
 * and overlay, user footer, language switcher UI, and sign-out. Content
 * is extracted from dashboard.html's sidebar (the most complete existing
 * implementation) — see docs/dashboard-design-system.md for the full
 * ownership contract.
 *
 * This file owns chrome only. It never fetches business data and never
 * touches page content outside the sidebar placeholder and its two small
 * sibling utility elements (mobile menu button, mobile overlay).
 *
 * Usage — add to every customer dashboard page:
 *   <link rel="stylesheet" href="dashboard-shell.css" />
 *   ...
 *   <div id="sidebar"></div>
 *   <script src="js/dashboard-shell.js"></script>
 *
 * Body tag:
 *   <body data-shell="customer" data-active-nav="nav-dashboard">
 *
 * Pages hand the shell already-resolved data through the exposed API —
 * they keep owning their own auth, fetches, and routing:
 *   QraivyDashboardShell.setUser({ name: 'Jane', initial: 'J' });
 *   QraivyDashboardShell.setSmartQrCount(3);
 *   QraivyDashboardShell.updateLanguageLabel('English');
 *   QraivyDashboardShell.setActive('nav-loyalty');
 */
(function () {
  'use strict';

  // Exact order/content of dashboard.html's current sidebar — the
  // canonical source this file was extracted from. domId preserves the
  // legacy element IDs existing page scripts already wire click handlers
  // to (sb-loyalty, sb-campaigns, etc.); nav id is shell-internal only,
  // used for data-active-nav / setActive() and never referenced by pages.
  var GROUPS = [
    { label: 'Main', i18n: 'nav_main', marginTop: false, items: [
      { id: 'nav-dashboard',   domId: null,             href: 'dashboard.html',                     icon: '&#x229E;',   i18n: 'nav_dashboard',  label: 'Dashboard' },
      { id: 'nav-analytics',   domId: null,             href: 'analytics.html',                      icon: '&#x2197;',   i18n: 'nav_analytics',  label: 'Analytics' }
    ]},
    { label: 'Smart Pages', i18n: 'nav_smartpages', marginTop: true, items: [
      { id: 'nav-sqrpages',    domId: 'sb-smart-pages', href: 'dashboard.html',                      icon: '&#x2B21;',   i18n: 'nav_sqrpages',   label: 'Smart QR Pages', badge: true },
      { id: 'nav-create',      domId: 'sb-create-sqr',  href: 'dashboard.html?launch=onboarding',     icon: '&#xFF0B;',   i18n: 'nav_createnew',  label: 'Create New QR' }
    ]},
    { label: 'Engage', i18n: 'nav_engage', marginTop: true, items: [
      { id: 'nav-campaigns',   domId: 'sb-campaigns',   href: 'dashboard.html?section=campaigns',     icon: '&#x1F4E3;',  i18n: 'nav_campaigns',  label: 'AI Campaigns' },
      { id: 'nav-subscribers', domId: 'sb-subscribers', href: 'dashboard.html?section=subscribers',   icon: '&#x1F465;',  i18n: 'nav_subscribers',label: 'Subscribers' },
      { id: 'nav-loyalty',     domId: 'sb-loyalty',     href: 'dashboard.html?section=loyalty',       icon: '&#x1F3AB;',  i18n: 'nav_loyalty',    label: 'Loyalty' }
    ]},
    { label: 'Configure', i18n: 'nav_configure', marginTop: true, items: [
      { id: 'nav-wallet',      domId: 'sb-wallet',      href: 'wallet-pass-studio.html',              icon: '&#x1F4B3;',  i18n: 'nav_wallet',     label: 'Wallet Passes' }
    ]},
    { label: 'Account', i18n: 'nav_account', marginTop: true, items: [
      { id: 'nav-billing',     domId: null,             href: 'upgrade.html',                         icon: '&#x1F4B3;',  i18n: 'nav_billing',    label: 'Billing &amp; Plans' },
      { id: 'nav-settings',    domId: 'sb-settings',    href: '#',                                    icon: '&#x2699;',   i18n: 'nav_settings',   label: 'Settings' }
    ]}
  ];

  var _rendered = false;

  function buildNavHtml(activeId) {
    return GROUPS.map(function (g) {
      var groupStyle = g.marginTop ? ' style="margin-top:4px"' : '';
      var groupHtml = '<div class="sb-group"' + groupStyle + ' data-i18n="' + g.i18n + '">' + g.label + '</div>';
      var itemsHtml = g.items.map(function (item) {
        var isActive = item.id === activeId;
        var idAttr = item.domId ? ' id="' + item.domId + '"' : '';
        var badgeHtml = item.badge ? '<span class="sb-badge" id="sqr-count-badge">0</span>' : '';
        return '<a href="' + item.href + '" class="sb-item' + (isActive ? ' active' : '') + '"' + idAttr + ' data-nav-id="' + item.id + '">' +
          '<span class="sb-icon">' + item.icon + '</span>' +
          '<span class="sb-label" data-i18n="' + item.i18n + '">' + item.label + '</span>' +
          badgeHtml +
          '</a>';
      }).join('');
      return groupHtml + itemsHtml;
    }).join('');
  }

  function buildSidebarInnerHtml(activeId) {
    return (
      '<div class="sb-logo">' +
        '<div class="sb-logo-icon">Q</div>' +
        '<div class="sb-logo-text">QR<span>Aivy</span></div>' +
      '</div>' +
      '<button class="sb-toggle" id="sb-toggle">&#x2039;</button>' +
      '<nav class="sb-nav">' + buildNavHtml(activeId) + '</nav>' +
      '<div class="sb-footer">' +
        '<div class="sb-user">' +
          '<div class="sb-avatar" id="sb-avatar">?</div>' +
          '<div class="sb-user-info">' +
            '<div class="sb-user-name" id="sb-username">Loading&#x2026;</div>' +
            '<div class="sb-user-role" data-i18n="role_owner">Business Owner</div>' +
          '</div>' +
        '</div>' +
        '<div style="padding:6px 12px 2px;">' +
          '<button id="lang-toggle" onclick="toggleLang()" style="width:100%;padding:7px 10px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;color:rgba(240,244,248,0.5);font-size:.72rem;font-family:inherit;cursor:pointer;transition:all .18s;text-align:left;display:flex;align-items:center;gap:7px;" onmouseover="this.style.background=\'rgba(255,255,255,0.09)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.05)\'">' +
            '<span style="font-size:.8rem;">🌐</span>' +
            '<span id="lang-toggle-label">Deutsch</span>' +
          '</button>' +
        '</div>' +
        '<div class="sb-divider"></div>' +
        '<a href="#" class="sb-signout" id="sb-signout"><span class="sb-icon">&#x2192;</span><span class="sb-label" data-i18n="nav_signout">Sign Out</span></a>' +
      '</div>'
    );
  }

  // Rendered as the sidebar placeholder's next siblings, matching their
  // exact original position in dashboard.html's markup (they were never
  // inside #sidebar itself — position is preserved, not reinvented).
  var MOBILE_CHROME_HTML =
    '<button id="mob-btn">&#x2630;</button>' +
    '<div class="sb-overlay" id="sb-overlay"></div>';

  function wireCollapse(sidebar) {
    var toggle = document.getElementById('sb-toggle');
    if (!toggle) return;
    if (localStorage.getItem('sb-collapsed') === 'true') {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sb-collapsed');
    }
    toggle.addEventListener('click', function () {
      var collapsed = sidebar.classList.toggle('collapsed');
      document.body.classList.toggle('sb-collapsed', collapsed);
      localStorage.setItem('sb-collapsed', collapsed);
    });
  }

  function wireMobile(sidebar) {
    var mobBtn = document.getElementById('mob-btn');
    var overlay = document.getElementById('sb-overlay');
    if (mobBtn) {
      mobBtn.addEventListener('click', function () {
        sidebar.classList.add('mob-open');
        if (overlay) overlay.classList.add('on');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('mob-open');
        overlay.classList.remove('on');
      });
    }
  }

  function wireSignOut() {
    var signout = document.getElementById('sb-signout');
    if (!signout) return;
    signout.addEventListener('click', function (e) {
      e.preventDefault();
      if (window.Clerk && window.Clerk.signOut) {
        window.Clerk.signOut().then(function () { window.location.href = 'login.html'; });
      } else {
        window.location.href = 'login.html';
      }
    });
  }

  function init(activeNavId) {
    if (_rendered) return; // already initialized this page load — no-op
    var placeholder = document.getElementById('sidebar');
    if (!placeholder) return;
    if (placeholder.children.length > 0) { _rendered = true; return; } // pre-rendered/foreign content — never overwrite
    var activeId = activeNavId || document.body.getAttribute('data-active-nav');
    placeholder.innerHTML = buildSidebarInnerHtml(activeId);
    placeholder.insertAdjacentHTML('afterend', MOBILE_CHROME_HTML);
    _rendered = true;
    wireCollapse(placeholder);
    wireMobile(placeholder);
    wireSignOut();
  }

  function setActive(navId) {
    document.querySelectorAll('.sb-item[data-nav-id]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-nav-id') === navId);
    });
  }

  function setSmartQrCount(count) {
    var badge = document.getElementById('sqr-count-badge');
    if (badge) badge.textContent = count;
  }

  function setUser(user) {
    user = user || {};
    var avatarEl = document.getElementById('sb-avatar');
    var nameEl = document.getElementById('sb-username');
    if (avatarEl && user.initial) avatarEl.textContent = user.initial;
    if (nameEl && user.name) nameEl.textContent = user.name;
  }

  function updateLanguageLabel(text) {
    var label = document.getElementById('lang-toggle-label');
    if (label && text) label.textContent = text;
  }

  window.QraivyDashboardShell = {
    init: init,
    setActive: setActive,
    setSmartQrCount: setSmartQrCount,
    setUser: setUser,
    updateLanguageLabel: updateLanguageLabel
  };

  function autoInit() {
    if (document.body && document.body.getAttribute('data-shell') === 'customer') {
      init(document.body.getAttribute('data-active-nav'));
    }
  }

  // Runs immediately if the placeholder already exists in the parsed DOM
  // (script placed after <div id="sidebar">, the recommended position),
  // otherwise waits for DOMContentLoaded — either way this always
  // completes before any later DOMContentLoaded listener (e.g. a page's
  // own i18n pass over [data-i18n]) can run, since browsers only fire
  // DOMContentLoaded after synchronous scripts encountered during parsing
  // have finished executing.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
