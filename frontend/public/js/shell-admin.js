/**
 * shell-admin.js — QRairy Platform Admin Shell
 * ─────────────────────────────────────────────────────────────
 * Injects the admin sidebar. Same orange brand as customer shell.
 * Admin is distinguished by denser data layout, not different colours.
 *
 * Admin nav items:
 *   System Overview | User Management | Revenue/MRR |
 *   Global Analytics | Platform Health |
 *   Billing Controls | System Settings
 *
 * Usage — add to every /admin/* page <head>, in this order:
 *   <link rel="stylesheet" href="/dashboard-shell.css" />
 *   <script src="...clerk.browser.js"></script>
 *   <script src="/js/session.js"></script>
 *   <script src="/js/admin-guard.js"></script>
 *   <script src="/js/shell-admin.js"></script>
 *
 * Body tag:
 *   <body data-shell="admin" data-active-nav="nav-overview">
 *
 * NEVER include shell-customer.js on admin pages.
 * NEVER include shell-admin.js on customer pages.
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  var NAV = [
    {
      group: 'Platform',
      items: [
        { id: 'nav-overview',  label: 'System Overview',  icon: '⬡', href: '/admin/index.html' },
        { id: 'nav-health',    label: 'Platform Health',  icon: '◎', href: '/admin/health.html' },
      ]
    },
    {
      group: 'Users',
      items: [
        { id: 'nav-users',     label: 'User Management',  icon: '◈', href: '/admin/users.html' },
        { id: 'nav-all-qr',    label: 'All QR Codes',     icon: '⬡', href: '/admin/qr.html' },
      ]
    },
    {
      group: 'Revenue',
      items: [
        { id: 'nav-revenue',   label: 'Revenue / MRR',    icon: '↗', href: '/admin/revenue.html' },
        { id: 'nav-billing',   label: 'Billing Controls', icon: '⬡', href: '/admin/billing.html' },
      ]
    },
    {
      group: 'Analytics',
      items: [
        { id: 'nav-analytics', label: 'Global Analytics', icon: '↗', href: '/admin/analytics.html' },
      ]
    },
    {
      group: 'System',
      items: [
        { id: 'nav-settings',  label: 'System Settings',  icon: '⚙', href: '/admin/settings.html' },
      ]
    }
  ];

  function buildSidebar(activeId) {
    var nav = NAV.map(function (section) {
      var items = section.items.map(function (item) {
        var active = item.id === activeId ||
          window.location.pathname === item.href ||
          window.location.pathname.endsWith(item.href.replace('/', ''));
        return '<a href="' + item.href + '"' +
          ' class="sb-item' + (active ? ' active' : '') + '"' +
          ' id="' + item.id + '">' +
          '<span class="sb-icon">' + item.icon + '</span>' +
          '<span>' + item.label + '</span>' +
          '</a>';
      }).join('');
      return '<div class="sb-group-label">' + section.group + '</div>' + items;
    }).join('');

    return '<div id="qrairy-admin-sidebar" class="app-sidebar">' +
      '<a href="/admin/index.html" class="sb-logo">' +
        '<div class="sb-logo-icon">Q</div>' +
        '<div class="sb-logo-text">QR<em>Aivy</em></div>' +
        // Orange badge same as customer — one brand identity
        '<span class="sb-context-badge">ADMIN</span>' +
      '</a>' +
      '<nav class="sb-nav">' + nav + '</nav>' +
      '<div class="sb-footer">' +
        '<div class="sb-user" id="sb-admin-user">' +
          '<div class="sb-avatar" id="sb-admin-avatar">A</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="sb-user-name" id="sb-admin-name">Admin</div>' +
            '<div class="sb-user-sub">Platform Admin</div>' +
          '</div>' +
        '</div>' +
        '<div class="sb-divider"></div>' +
        '<a href="/app/dashboard.html" class="sb-footer-link">' +
          '<span class="sb-icon">↩</span>Customer View' +
        '</a>' +
        '<a href="#" class="sb-footer-link" id="sb-admin-signout">' +
          '<span class="sb-icon">→</span>Sign Out' +
        '</a>' +
      '</div>' +
    '</div>';
  }

  function wrapBody(sidebarHtml) {
    var inner = document.body.innerHTML;
    document.body.innerHTML =
      '<div class="app-shell">' +
        sidebarHtml +
        '<div class="app-main">' +
          '<div class="main-content" id="main-content">' + inner + '</div>' +
        '</div>' +
      '</div>';
  }

  function populateUser() {
    if (typeof QRairySession === 'undefined') return;

    QRairySession.init().then(function (session) {
      var nameEl   = document.getElementById('sb-admin-name');
      var avatarEl = document.getElementById('sb-admin-avatar');

      if (nameEl && session.firstName) {
        nameEl.textContent = session.firstName;
      }
      if (avatarEl && session.firstName) {
        avatarEl.textContent = session.firstName[0].toUpperCase();
      }

      var signoutEl = document.getElementById('sb-admin-signout');
      if (signoutEl) {
        signoutEl.addEventListener('click', function (e) {
          e.preventDefault();
          if (window.Clerk) {
            window.Clerk.signOut().then(function () {
              window.location.href = '/login.html';
            });
          }
        });
      }
    });
  }

  window.initAdminShell = function (activeId) {
    wrapBody(buildSidebar(activeId));
    populateUser();
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.body.getAttribute('data-shell') === 'admin') {
      var activeId = document.body.getAttribute('data-active-nav') || null;
      window.initAdminShell(activeId);
    }
  });

})();
