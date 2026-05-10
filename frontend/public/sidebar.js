// sidebar v4 145100
// sidebar v3 133115
// sidebar v2 132317
(function() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';

  function isActive(href) {
    return page === href || (page === '' && href === 'index.html');
  }

  const navItems = [
    {
      section: 'MAIN',
      items: [
        { href: 'dashboard.html', icon: '⊞', label: 'Dashboard', tooltip: 'Dashboard' },
        { href: 'dashboard.html', icon: '⬡', label: 'QR Generator', tooltip: 'QR Generator' },
        { href: 'analytics.html', icon: '↗', label: 'Analytics', tooltip: 'Analytics' },
      ]
    },
    {
      section: 'ENGAGE',
      items: [
        { href: 'dashboard.html', icon: '🔔', label: 'Push Notifications', tooltip: 'Push Notifications', badge: 'LIVE' },
        { href: '#campaigns', icon: '📣', label: 'Campaigns', tooltip: 'Campaigns', soon: true },

      ]
    },
    {
      section: 'CONFIGURE',
      items: [
        { href: '#branding', icon: '🎨', label: 'Branding', tooltip: 'Branding', soon: true },
        { href: '#integrations', icon: '⚡', label: 'Integrations', tooltip: 'Integrations', soon: true },
        { href: '#settings', icon: '⚙', label: 'Settings', tooltip: 'Settings', soon: true },
      ]
    },
    {
      section: 'ACCOUNT',
      items: [
        { href: '#billing', icon: '💳', label: 'Billing', tooltip: 'Billing', badge: 'FREE', soon: true },
        { href: '#help', icon: '?', label: 'Help & Docs', tooltip: 'Help' },
      ]
    }
  ];

  function buildSidebar() {
    if (!document.querySelector('link[href*="Inter"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Mono:wght@300;400&display=swap';
      document.head.appendChild(link);
    }

    document.body.classList.add('has-sidebar');

    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed) document.body.classList.add('sidebar-collapsed');

    let navHTML = '';
    navItems.forEach(section => {
      navHTML += `<div class="sidebar-section-label">${section.section}</div>`;
      section.items.forEach(item => {
        const active = isActive(item.href) ? 'active' : '';
        const soonLabel = item.soon ? '<span style="font-size:0.6rem;opacity:0.5;margin-left:auto;font-family:DM Mono,monospace;">SOON</span>' : '';
        const badge = item.badge && !item.soon ? `<span class="sidebar-badge">${item.badge}</span>` : '';
        navHTML += `
          <a href="${item.href}" class="sidebar-item ${active}" data-tooltip="${item.tooltip}">
            <span class="sidebar-item-icon">${item.icon}</span>
            <span class="sidebar-item-label">${item.label}</span>
            ${badge}
            ${soonLabel}
          </a>`;
      });
    });

    const sidebarHTML = `
      <div id="qr-sidebar" class="${isCollapsed ? 'collapsed' : ''}">
        <div class="sidebar-logo">
          <div class="sidebar-logo-icon">⬡</div>
          <div class="sidebar-logo-text">QR<span>Aivy</span></div>
        </div>
        <button class="sidebar-toggle" id="sidebar-toggle-btn">&#8249;</button>
        <nav class="sidebar-nav">${navHTML}</nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-avatar">A</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">Admin</div>
              <div class="sidebar-user-role">Business Owner</div>
            </div>
          </div>
          <div class="sidebar-divider"></div>
          <a href="#" class="sidebar-signout" onclick="(async()=>{if(window.Clerk)await window.Clerk.signOut();window.location.href='login.html';})();return false;">
            <span class="sidebar-item-icon">→</span>
            <span class="sidebar-item-label">Sign Out</span>
          </a>
        </div>
      </div>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <button id="mobile-sidebar-btn">☰</button>
    `;

    const existingContent = document.body.innerHTML;
    document.body.innerHTML = sidebarHTML + `<div id="sidebar-content">${existingContent}</div>`;

    attachEvents();
  }

  function attachEvents() {
    const sidebar = document.getElementById('qr-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const overlay = document.getElementById('sidebar-overlay');
    const mobileBtn = document.getElementById('mobile-sidebar-btn');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        localStorage.setItem('sidebar-collapsed', collapsed);
      });
    }

    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
        overlay.classList.add('active');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
      });
    }

    document.querySelectorAll('.sidebar-item[href^="#"]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const label = item.querySelector('.sidebar-item-label').textContent.trim();
        showComingSoon(label);
      });
    });
  }

  function showComingSoon(name) {
    const existing = document.getElementById('coming-soon-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'coming-soon-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1c2128;
      border: 1px solid rgba(255,90,31,0.3);
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: Inter, sans-serif;
      font-size: 0.85rem;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      animation: toastIn 0.3s ease;
    `;
    toast.innerHTML = `<span style="color:#ff5a1f">⚡</span> <strong>${name}</strong> is coming soon!`;
    document.body.appendChild(toast);

    const style = document.createElement('style');
    style.textContent = `@keyframes toastIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`;
    document.head.appendChild(style);

    setTimeout(() => toast.remove(), 3000);
  }

  function attachSignOut() {
    setTimeout(() => {
      document.querySelectorAll('.sb-item, a').forEach(link => {
        if (link.textContent.trim().includes('Sign Out')) {
          link.addEventListener('click', async (e) => {
            e.preventDefault();
            if (window.Clerk) await window.Clerk.signOut();
            window.location.href = 'login.html';
          });
        }
      });
    }, 800);
  }
    function attachSignOut() {
    setTimeout(() => {
      document.querySelectorAll('.sidebar-signout').forEach(el => {
        if (true) {
          el.addEventListener('click', async (e) => {
            e.preventDefault();
            if (window.Clerk) await window.Clerk.signOut();
            window.location.href = 'login.html';
          });
        }
      });
    }, 800);
  }
    if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { buildSidebar(); attachSignOut(); });
  } else {
    buildSidebar();
  }
})();