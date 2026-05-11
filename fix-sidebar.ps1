$root = "C:\Users\adwin\OneDrive\Desktop\qrairy.ai\frontend\public"
$sidebarPath = "$root\sidebar.js"

Write-Host "Patching sidebar.js..." -ForegroundColor Cyan

$newSidebar = @'
(function() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'dashboard.html';

  // Match active item by exact href — each nav item needs a unique href
  function isActive(href, isCreateQR) {
    if (isCreateQR) return false; // Create QR Code is never a "page" — it's a button
    return page === href || (page === '' && href === 'dashboard.html');
  }

  const navItems = [
    {
      section: 'MAIN',
      items: [
        { href: 'dashboard.html', icon: '⊞', label: 'Dashboard' },
        { href: 'dashboard.html', icon: '⬡', label: 'Create QR Code', isCreateQR: true },
        { href: 'analytics.html', icon: '↗', label: 'Analytics' },
      ]
    },
    {
      section: 'ENGAGE',
      items: [
        { href: 'dashboard.html#push', icon: '🔔', label: 'Push Notifications', badge: 'LIVE' },
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
        { href: 'pricing.html', icon: '💳', label: 'Billing & Plans', planBadge: true },
        { href: '#', icon: '?', label: 'Help & Docs' },
      ]
    }
  ];

  // Map pages to which nav label should be active
  const pageActiveMap = {
    'dashboard.html': 'Dashboard',
    'analytics.html': 'Analytics',
    'designer.html':  'AI Designer',
    'loyalty-setup.html': 'Loyalty Cards',
    'pricing.html':   'Billing & Plans',
  };

  const activeLabel = pageActiveMap[page] || 'Dashboard';

  function buildSidebar() {
    const isCollapsed = localStorage.getItem('sb-collapsed') === 'true';

    // Get plan badge from Clerk metadata
    let planBadgeHTML = '';

    let navHTML = '';
    navItems.forEach(section => {
      navHTML += `<div class="sb-section">${section.section}</div>`;
      section.items.forEach(item => {
        const active = (!item.isCreateQR && item.label === activeLabel) ? 'sb-item-active' : '';
        const soon = item.soon ? '<span class="sb-soon">SOON</span>' : '';
        const badge = item.badge ? `<span class="sb-badge">${item.badge}</span>` : '';
        const planBadge = item.planBadge ? `<span class="sb-plan-badge" id="sb-plan-badge"></span>` : '';

        // Create QR Code — trigger modal/scroll instead of navigate
        if (item.isCreateQR) {
          navHTML += `<a href="dashboard.html" class="sb-item" id="sb-create-qr">
            <span class="sb-icon">${item.icon}</span>
            <span class="sb-label">${item.label}</span>
            ${badge}${soon}
          </a>`;
        } else {
          navHTML += `<a href="${item.href}" class="sb-item ${active}">
            <span class="sb-icon">${item.icon}</span>
            <span class="sb-label">${item.label}</span>
            ${badge}${soon}${planBadge}
          </a>`;
        }
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

    // Toggle collapse
    const toggleBtn = document.getElementById('sb-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const sb = document.getElementById('sidebar');
        const collapsed = sb.classList.toggle('collapsed');
        localStorage.setItem('sb-collapsed', collapsed);
        toggleBtn.textContent = collapsed ? '›' : '‹';
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

        // Show plan badge
        const planEl = document.getElementById('sb-plan-badge');
        if (planEl) {
          const plan = (u.publicMetadata && u.publicMetadata.plan) || 'FREE';
          planEl.textContent = plan.toUpperCase();
          planEl.style.cssText = 'margin-left:auto;font-size:0.55rem;font-family:monospace;letter-spacing:0.06em;padding:2px 6px;border-radius:4px;background:rgba(255,90,31,0.15);color:#ff5a1f;border:0.5px solid rgba(255,90,31,0.3);';
        }
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
'@

Set-Content -Path $sidebarPath -Value $newSidebar -Encoding UTF8
Write-Host "sidebar.js patched" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Done! Now run:" -ForegroundColor Cyan
Write-Host " git add . && git commit -m 'fix: sidebar active state on all pages' && git push" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
