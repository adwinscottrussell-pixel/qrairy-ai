/**
 * dashboard-shell.js — QRAIVY shared customer dashboard shell.
 *
 * Single source of truth for the customer sidebar AND the mobile bottom
 * navigation: markup, navigation groups/order, active-item state, collapse
 * behavior, user footer, language switcher UI, sign-out, and the mobile
 * bottom-nav bar. Content is extracted from dashboard.html's sidebar/
 * #bottom-nav (the most complete existing implementation) — see
 * docs/dashboard-design-system.md for the full ownership contract.
 *
 * Below 768px the desktop sidebar hides entirely and the bottom nav is
 * the sole mobile navigation surface — there is no hamburger/drawer/
 * overlay in this shell. (dashboard-shell.css still defines #mob-btn/
 * .sb-overlay/.mob-open for a few other pages — loyalty-setup.html,
 * wallet-pass-studio.html, qr-manage.html — that render their own static
 * sidebar and don't use this file; those rules are unrelated to this
 * shell's behavior and out of scope here.)
 *
 * This file owns chrome only. It never fetches business data and never
 * touches page content outside the sidebar placeholder and its sibling
 * utility element (bottom nav).
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
  //
  // Group headers — desktop-sidebar-only visual structure. Referenced by
  // id from each NAV_ITEMS entry's `group` field; the bottom nav ignores
  // this entirely (it's a flat bar, not grouped sections).
  var NAV_GROUPS = [
    { id: 'main',        label: 'Main',        i18n: 'nav_main',        marginTop: false },
    { id: 'smartpages',  label: 'Smart Pages', i18n: 'nav_smartpages',  marginTop: true },
    { id: 'engage',      label: 'Engage',      i18n: 'nav_engage',      marginTop: true },
    { id: 'configure',   label: 'Configure',   i18n: 'nav_configure',   marginTop: true },
    { id: 'account',     label: 'Account',     i18n: 'nav_account',     marginTop: true }
  ];

  // ── Single canonical navigation model ──────────────────────────────────
  // One entry per nav destination — id, label, icon, and href are each
  // defined exactly once here. The desktop sidebar and the mobile bottom
  // nav are both DERIVED views over this same array (renderSidebar()/
  // renderBottomNav() below); neither one owns its own copy of an item's
  // identity. Adding/renaming/relinking an item happens in exactly one
  // place and both surfaces stay in sync automatically.
  //
  //   group            — which NAV_GROUPS section this item's sidebar
  //                       row belongs to (bottom nav ignores this)
  //   sbDomId/bnDomId  — legacy per-surface element ids existing page
  //                       scripts already call getElementById() on
  //                       (sb-loyalty, bn-loyalty, etc.) — kept distinct
  //                       because they're two different DOM nodes, not
  //                       duplicated identity
  //   mobileLabel      — shorter label for the 6-slot mobile bar where
  //                       "Smart QR Pages"/"Subscribers"/"AI Campaigns"
  //                       don't fit; falls back to `label` when absent —
  //                       a presentation detail of the SAME item, not a
  //                       second definition of it
  //   showInSidebar / showInBottomNav — which surface(s) this item
  //                       appears on
  //   bottomNavOrder   — the mobile bar's own approved left-to-right
  //                       order (Home, Pages, Loyalty, Subs, Campaigns,
  //                       Settings) differs intentionally from the
  //                       desktop group order (Campaigns, Subscribers,
  //                       Loyalty) — a real, pre-existing UX difference
  //                       between a 10-item grouped list and a 6-slot
  //                       bar, not something to silently unify away
  //   badgeSource      — non-null means this item renders a live-count
  //                       badge (sidebar only, matching the pre-existing
  //                       design — the mobile bar never had one)
  var NAV_ITEMS = [
    { id: 'nav-dashboard',   group: 'main',       sbDomId: null,             bnDomId: 'bn-home',     href: 'dashboard.html',                   icon: '&#x229E;',  i18n: 'nav_dashboard',   label: 'Dashboard',      mobileLabel: 'Home',      showInSidebar: true, showInBottomNav: true,  bottomNavOrder: 1 },
    { id: 'nav-analytics',   group: 'main',       sbDomId: null,             bnDomId: null,          href: 'analytics.html',                   icon: '&#x2197;',  i18n: 'nav_analytics',   label: 'Analytics',                                showInSidebar: true, showInBottomNav: false },
    { id: 'nav-sqrpages',    group: 'smartpages', sbDomId: 'sb-smart-pages', bnDomId: 'bn-pages',    href: 'dashboard.html',                   icon: '&#x2B21;',  i18n: 'nav_sqrpages',    label: 'Smart QR Pages', mobileLabel: 'Pages',     showInSidebar: true, showInBottomNav: true,  bottomNavOrder: 2, badgeSource: 'smartQrCount' },
    { id: 'nav-create',      group: 'smartpages', sbDomId: 'sb-create-sqr', bnDomId: null,           href: 'dashboard.html?launch=onboarding', icon: '&#xFF0B;',  i18n: 'nav_createnew',   label: 'Create New QR',                            showInSidebar: true, showInBottomNav: false },
    { id: 'nav-campaigns',   group: 'engage',     sbDomId: 'sb-campaigns',  bnDomId: 'bn-campaigns', href: 'dashboard.html?section=campaigns', icon: '&#x1F4E3;', i18n: 'nav_campaigns',   label: 'AI Campaigns',   mobileLabel: 'Campaigns', showInSidebar: true, showInBottomNav: true,  bottomNavOrder: 5 },
    { id: 'nav-subscribers', group: 'engage',     sbDomId: 'sb-subscribers',bnDomId: 'bn-subs',      href: 'dashboard.html?section=subscribers', icon: '&#x1F465;', i18n: 'nav_subscribers', label: 'Subscribers',   mobileLabel: 'Subs',      showInSidebar: true, showInBottomNav: true,  bottomNavOrder: 4 },
    { id: 'nav-loyalty',     group: 'engage',     sbDomId: 'sb-loyalty',    bnDomId: 'bn-loyalty',   href: 'dashboard.html?section=loyalty',   icon: '&#x1F3AB;', i18n: 'nav_loyalty',     label: 'Loyalty',                                  showInSidebar: true, showInBottomNav: true,  bottomNavOrder: 3 },
    { id: 'nav-wallet',      group: 'configure',  sbDomId: 'sb-wallet',     bnDomId: null,           href: 'wallet-pass-studio.html',          icon: '&#x1F4B3;', i18n: 'nav_wallet',      label: 'Wallet Passes',                            showInSidebar: true, showInBottomNav: false },
    { id: 'nav-billing',     group: 'account',    sbDomId: null,            bnDomId: null,           href: 'upgrade.html',                     icon: '&#x1F4B3;', i18n: 'nav_billing',     label: 'Billing &amp; Plans',                      showInSidebar: true, showInBottomNav: false },
    { id: 'nav-settings',    group: 'account',    sbDomId: 'sb-settings',   bnDomId: 'bn-settings',  href: '#',                                 icon: '&#x2699;',  i18n: 'nav_settings',    label: 'Settings',                                 showInSidebar: true, showInBottomNav: true,  bottomNavOrder: 6 }
  ];

  var _rendered = false;

  function renderSidebar(activeId) {
    return NAV_GROUPS.map(function (g) {
      var groupItems = NAV_ITEMS.filter(function (item) { return item.showInSidebar && item.group === g.id; });
      if (!groupItems.length) return '';
      var groupStyle = g.marginTop ? ' style="margin-top:4px"' : '';
      var groupHtml = '<div class="sb-group"' + groupStyle + ' data-i18n="' + g.i18n + '">' + g.label + '</div>';
      var itemsHtml = groupItems.map(function (item) {
        var isActive = item.id === activeId;
        var idAttr = item.sbDomId ? ' id="' + item.sbDomId + '"' : '';
        var badgeHtml = item.badgeSource ? '<span class="sb-badge" id="sqr-count-badge">0</span>' : '';
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
      '<nav class="sb-nav">' + renderSidebar(activeId) + '</nav>' +
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

  // Bottom nav is the SAME NAV_ITEMS array, just filtered to the items
  // opted in via showInBottomNav and laid out in their own approved
  // bottomNavOrder — no separate item list, no separately-maintained
  // ids/labels/hrefs. hrefs are the same canonical dashboard.html?section=X
  // URLs the desktop sb-items already use, so any page gets working
  // navigation with zero page-specific wiring; dashboard.html additionally
  // intercepts these clicks (see initDashboard()) to keep its existing
  // instant, no-reload section switching — that interception is page
  // business logic and intentionally stays out of this file.
  function renderBottomNav(activeId) {
    var items = NAV_ITEMS.filter(function (item) { return item.showInBottomNav; })
      .sort(function (a, b) { return a.bottomNavOrder - b.bottomNavOrder; });
    return '<nav id="bottom-nav">' + items.map(function (item) {
      var isActive = item.id === activeId;
      return '<a href="' + item.href + '" class="bn-item' + (isActive ? ' active' : '') + '" id="' + item.bnDomId + '" data-nav-id="' + item.id + '">' +
        '<span class="bn-icon">' + item.icon + '</span>' +
        '<span class="bn-label">' + (item.mobileLabel || item.label) + '</span>' +
        '</a>';
    }).join('') + '</nav>';
  }

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
    placeholder.insertAdjacentHTML('afterend', renderBottomNav(activeId));
    _rendered = true;
    wireCollapse(placeholder);
    wireSignOut();
  }

  // Single active-state system: updates every element carrying a
  // data-nav-id, desktop sidebar and mobile bottom-nav alike, so no
  // caller ever needs its own parallel "which item is active" logic.
  function setActive(navId) {
    document.querySelectorAll('[data-nav-id]').forEach(function (el) {
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
