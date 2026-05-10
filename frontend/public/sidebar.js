(function() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'dashboard.html';

  function isActive(href) {
    return page === href || (page === '' && href === 'dashboard.html');
  }

  const navItems = [
    {
      section: 'MAIN',
      items: [
        { href: 'dashboard.html', icon: '⊞', label: 'Dashboard' },
        { href: 'dashboard.html', icon: '⬡', label: 'Create QR Code' },
        { href: 'analytics.html', icon: '↗', label: 'Analytics' },
      ]
    },
    {
      section: 'ENGAGE',
      items: [
        { href: 'dashboard.html', icon: '🔔', label: 'Push Notifications', badge: 'LIVE' },
        { href: '#', icon: '📣', label: 'Campaigns', soon: true },
      ]
    },
    {
      section: 'CONFIGURE',
      items: [
        { href: 'designer.html', icon: '🎨', label: 'AI Designer' },
        { href: 'loyalty-setup.html', icon: '🃏', label: 'Loyalty Cards', soon: true },
      ]
    },
    {
      section: 'ACCOUNT',
      items: [
        { href: '#', icon: '💳', label: 'Billing & Plans', planBadge: true },
        { href: '#', icon: '?', label: 'Help & Docs' },
      ]
    }
  ];

  function buildSidebar() {
    const isCollapsed = localStorage.getItem('sb-collapsed') === 'true';

    let navHTML = '';
    navItems.forEach(section => {
      navHTML += `<div class="sb-section">${section.section}</div>`;
      section.items.forEach(item => {
        const active = isActive(item.href) ? 'sb-item-active' : '';
        const soon = item.soon ? '<span class="sb-soon">SOON</span>' : '';
        const badge = item.badge ? `<span class="sb-badge">${item.badge}</span>` : '';
        navHTML += `<a href="${item.href}" class="sb-item ${active}">
          <span class="sb-icon">${item.icon}</span>
          <span class="sb-label">${item.label}</span>
          ${badge}${soon}
        </a>`;
      });
    });

    const sidebarHTML = `<div id="sidebar" ${isCollapsed ? 'class="collapsed"' : ''}>
      <div class="sb-logo">
        <div class="sb-logo-icon">⬡</div>
        <div class="sb-logo-text">QR<span>Aivy</span></div>
      </div>
      <button class="sb-toggle" id="sb-toggle">‹</button>
      <nav class="sb-nav">${navHTML}</nav>
      <div class="sb-footer">
        <div class="sb-user">
          <div class="sb-avatar" id="sb-avatar">?</div>
          <div class="sb-user-info">
            <div class="sb-user-name" id="sb-user-name">...</div>
            <div class="sb-user-role">Business Owner</div>
          </div>
        </div>
        <div class="sb-divider"></div>
        <a href="login.html" class="sb-signout sb-item" onclick="(async()=>{if(window.Clerk)await window.Clerk.signOut();window.location.href='login.html';})();return false;">
          <span class="sb-icon">→</span>
          <span class="sb-label">Sign Out</span>
        </a>
      </div>
    </div>`;

    const target = document.getElementById('sidebar');
    if (target) {
      target.outerHTML = sidebarHTML;
    } else {
      document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    }

    const toggleBtn = document.getElementById('sb-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const sb = document.getElementById('sidebar');
        const collapsed = sb.classList.toggle('collapsed');
        localStorage.setItem('sb-collapsed', collapsed);
      });
    }

    updateUser();
  }

  function updateUser() {
    const tryUpdate = () => {
      if (window.Clerk && window.Clerk.user) {
        const u = window.Clerk.user;
        const name = u.firstName || u.emailAddresses[0].emailAddress;
        const el = document.getElementById('sb-user-name');
        const av = document.getElementById('sb-avatar');
        if (el) el.textContent = name;
        if (av) av.textContent = name[0].toUpperCase();
      } else {
        setTimeout(tryUpdate, 500);
      }
    };
    tryUpdate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildSidebar);
  } else {
    buildSidebar();
  }
})();