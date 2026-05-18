/**
 * shell-customer.js — QRairy Customer Application Shell
 * ─────────────────────────────────────────────────────────────
 * Injects the customer sidebar. Uses the unified orange brand.
 * Reads session via QRairySession (session.js).
 *
 * Customer nav items:
 *   Dashboard | Analytics | Smart QR Pages | Subscribers |
 *   Campaigns | Wallet Passes | Billing
 *
 * Usage — add to every /app/* page <head>, in this order:
 *   <link rel="stylesheet" href="/dashboard-shell.css" />
 *   <script src="...clerk.browser.js"></script>
 *   <script src="/js/session.js"></script>
 *   <script src="/js/auth-guard.js"></script>
 *   <script src="/js/shell-customer.js"></script>
 *
 * Body tag:
 *   <body data-shell="customer" data-active-nav="nav-dashboard">
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  var NAV = [
    {
      group: 'Overview',
      items: [
        { id: 'nav-dashboard',   label: 'Dashboard',      icon: '⬡', href: '/app/dashboard.html' },
      ]
    },
    {
      group: 'Smart QR',
      items: [
        { id: 'nav-pages',       label: 'Smart QR Pages', icon: '⬡', href: '/app/pages.html' },
        { id: 'nav-analytics',   label: 'Analytics',      icon: '↗', href: '/app/analytics.html' },
      ]
    },
    {
      group: 'Engage',
      items: [
        { id: 'nav-subscribers', label: 'Subscribers',    icon: '◎', href: '/app/subscribers.html' },
        { id: 'nav-campaigns',   label: 'Campaigns',      icon: '◈', href: '/app/campaigns.html' },
      ]
    },
    {
      group: 'Features',
      items: [
        { id: 'nav-wallet',      label: 'Wallet Passes',  icon: '⬡', href: '/app/wallet.html' },
      ]
    },
    {
      group: 'Account',
      items: [
        { id: 'nav-billing',     label: 'Billing & Plan', icon: '↑', href: '/app/upgrade.html' },
      ]
    }
  ];

  function buildSidebar(activeId) {
    var nav = NAV.map(function (section) {
      var items = section.items.map(function (item) {
        var active = item.id === activeId ||
          window.location.pathname === item.href ||
          window.location.pathname.endsWith(item.href.replace('/', ''));
        var badge = item.badge
          ? '<span class="sb-item-badge" id="sb-plan-badge">' + item.badge + '</span>'
          : '';
        return '<a href="' + item.href + '"' +
          ' class="sb-item' + (active ? ' active' : '') + '"' +
          ' id="' + item.id + '">' +
          '<span class="sb-icon">' + item.icon + '</span>' +
          '<span>' + item.label + '</span>' +
          badge +
          '</a>';
      }).join('');
      return '<div class="sb-group-label">' + section.group + '</div>' + items;
    }).join('');

    return '<div id="qrairy-sidebar" class="app-sidebar">' +
      '<a href="/app/dashboard.html" class="sb-logo">' +
        '<div class="sb-logo-icon">Q</div>' +
        '<div class="sb-logo-text">QR<em>Aivy</em></div>' +
        '</a>' +
      '<nav class="sb-nav">' + nav + '</nav>' +
      '<div class="sb-footer">' +
        '<div class="sb-user" id="sb-user">' +
          '<div class="sb-avatar" id="sb-avatar">?</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="sb-user-name" id="sb-name">Loading…</div>' +
            '<div class="sb-user-sub" id="sb-role">Customer</div>' +
          '</div>' +
        '</div>' +
        '<div class="sb-divider"></div>' +
        '<a href="#" class="sb-footer-link" id="sb-signout">' +
          '<span class="sb-icon">→</span>Sign Out' +
        '</a>' +
      '</div>' +
    '</div>' +
    '<div id="sb-overlay" class="sb-overlay"></div>' +
    '<button class="mob-menu-btn" id="mob-btn" style="display:none">☰</button>';
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

  function wireInteractions() {
    var sb  = document.getElementById('qrairy-sidebar');
    var ov  = document.getElementById('sb-overlay');
    var mob = document.getElementById('mob-btn');

    if (mob) {
      mob.addEventListener('click', function () {
        sb && sb.classList.add('mob-open');
        ov && ov.classList.add('active');
      });
    }

    if (ov) {
      ov.addEventListener('click', function () {
        sb && sb.classList.remove('mob-open');
        ov.classList.remove('active');
      });
    }
  }

  function populateUser() {
    if (typeof QRairySession === 'undefined') return;

    QRairySession.init().then(function (session) {
      var nameEl    = document.getElementById('sb-name');
      var avatarEl  = document.getElementById('sb-avatar');
      var roleEl    = document.getElementById('sb-role');
      var planLabel = document.getElementById('sb-plan-label');
      var planBadge = document.getElementById('sb-plan-badge');

      if (nameEl && session.firstName) {
        nameEl.textContent = session.firstName;
      } else if (nameEl && session.email) {
        nameEl.textContent = session.email.split('@')[0];
      }

      if (avatarEl && session.firstName) {
        avatarEl.textContent = session.firstName[0].toUpperCase();
      }

      var planMap = {
        anonymous : 'FREE',
        free      : 'FREE',
        trial     : 'TRIAL',
        premium   : 'PRO',
        admin     : 'ADMIN',
      };

      var planText = planMap[session.type] || 'FREE';
      if (planLabel) planLabel.textContent = planText;
      if (planBadge) planBadge.textContent = planText;
      if (roleEl)    roleEl.textContent    = 'Business Owner';

      // Wire sign out
      var signoutEl = document.getElementById('sb-signout');
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

  window.initCustomerShell = function (activeId) {
    var placeholder = document.getElementById('sidebar');
    if (placeholder && placeholder.children.length === 0) {
      placeholder.outerHTML = buildSidebar(activeId);
    } else {
      wrapBody(buildSidebar(activeId));
    }
    wireInteractions();
    populateUser();
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.body.getAttribute('data-shell') === 'customer') {
      var activeId = document.body.getAttribute('data-active-nav') || null;
      window.initCustomerShell(activeId);
    }
  });

})();


