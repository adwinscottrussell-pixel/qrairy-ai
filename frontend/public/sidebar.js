(function() {
  const page = window.location.pathname.split('/').pop() || 'dashboard.html';

  const pageActiveMap = {
    'dashboard.html':     'Dashboard',
    'analytics.html':     'Analytics',
    'designer.html':      'AI Designer',
    'loyalty-setup.html': 'Loyalty Cards',
    'pricing.html':       'Billing & Plans',
    'admin.html':         'Admin',
  };

  const activeLabel = pageActiveMap[page] || 'Dashboard';

  const nav = [
    { section: 'MAIN', items: [
      { href: 'dashboard.html', icon: '⊞', label: 'Dashboard' },
      { href: 'dashboard.html', icon: '⬡', label: 'Create QR Code', createQR: true },
      { href: 'analytics.html', icon: '↗', label: 'Analytics' },
    ]},
    { section: 'ENGAGE', items: [
      { href: 'dashboard.html', icon: '🔔', label: 'Push Notifications', badge: 'LIVE' },
      { href: '#',              icon: '📣', label: 'Campaigns', soon: true },
    ]},
    { section: 'CONFIGURE', items: [
      { href: 'designer.html',      icon: '🎨', label: 'AI Designer' },
      { href: 'loyalty-setup.html', icon: '🃏', label: 'Loyalty Cards' },
    ]},
    { section: 'ACCOUNT', items: [
      { href: 'pricing.html', icon: '💳', label: 'Billing & Plans', planBadge: true },
      { href: '#',            icon: '?',  label: 'Help & Docs' },
    ]},
  ];

  function render() {
    const collapsed = localStorage.getItem('sb-collapsed') === 'true';
    let navHTML = '';

    nav.forEach(function(section) {
      navHTML += '<div class="sb-section">' + section.section + '</div>';
      section.items.forEach(function(item) {
        const isActive = !item.createQR && item.label === activeLabel;
        const activeClass = isActive ? ' sb-item-active' : '';
        const badge   = item.badge    ? '<span class="sb-badge">'      + item.badge + '</span>' : '';
        const soon    = item.soon     ? '<span class="sb-soon">SOON</span>' : '';
        const plan    = item.planBadge? '<span class="sb-plan-badge" id="sb-plan-badge"></span>' : '';
        navHTML += '<a href="' + item.href + '" class="sb-item' + activeClass + '">'
          + '<span class="sb-icon">' + item.icon + '</span>'
          + '<span class="sb-label">' + item.label + '</span>'
          + badge + soon + plan
          + '</a>';
      });
    });

    const html = '<div id="sidebar"' + (collapsed ? ' class="collapsed"' : '') + '>'
      + '<div class="sb-logo">'
        + '<div class="sb-logo-icon">Q</div>'
        + '<div class="sb-logo-text">QR<span>Aivy</span></div>'
      + '</div>'
      + '<button class="sb-toggle" id="sb-toggle">' + (collapsed ? '›' : '‹') + '</button>'
      + '<nav class="sb-nav">' + navHTML + '</nav>'
      + '<div class="sb-footer">'
        + '<div class="sb-user">'
          + '<div class="sb-avatar" id="sb-avatar">?</div>'
          + '<div class="sb-user-info">'
            + '<div class="sb-user-name" id="sb-user-name">...</div>'
            + '<div class="sb-user-role">Business Owner</div>'
          + '</div>'
        + '</div>'
        + '<div class="sb-divider"></div>'
        + '<a href="#" class="sb-item sb-signout" id="sb-signout">'
          + '<span class="sb-icon">→</span>'
          + '<span class="sb-label">Sign Out</span>'
        + '</a>'
      + '</div>'
    + '</div>';

    const existing = document.getElementById('sidebar');
    if (existing) { existing.outerHTML = html; } 
    else { document.body.insertAdjacentHTML('afterbegin', html); }

    document.getElementById('sb-toggle').addEventListener('click', function() {
      const sb = document.getElementById('sidebar');
      const c = sb.classList.toggle('collapsed');
      localStorage.setItem('sb-collapsed', c);
      document.getElementById('sb-toggle').textContent = c ? '›' : '‹';
    });

    document.getElementById('sb-signout').addEventListener('click', async function(e) {
      e.preventDefault();
      if (window.Clerk) await window.Clerk.signOut();
      window.location.href = 'login.html';
    });

    updateUser();
  }

  function updateUser() {
    if (window.Clerk && window.Clerk.user) {
      const u = window.Clerk.user;
      const name = u.firstName || u.emailAddresses[0].emailAddress;
      const el = document.getElementById('sb-user-name');
      const av = document.getElementById('sb-avatar');
      if (el) el.textContent = name;
      if (av) av.textContent = name[0].toUpperCase();
      const planEl = document.getElementById('sb-plan-badge');
      if (planEl) {
        const plan = (u.publicMetadata && u.publicMetadata.plan) || 'FREE';
        planEl.textContent = plan.toUpperCase();
      }
    } else {
      setTimeout(updateUser, 400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
