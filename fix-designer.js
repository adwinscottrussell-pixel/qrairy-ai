const fs = require('fs'), path = require('path');
const fr = path.join(__dirname, 'frontend/public');

// Fix designer.html - replace old sidebar with new, remove sidebar.js
let d = fs.readFileSync(path.join(fr, 'designer.html'), 'utf8');
const hasOldSidebar = d.includes('sidebar.js');
const hasNewShell   = d.includes('dashboard-shell.css');

console.log('designer.html - has sidebar.js:', hasOldSidebar, '| has shell:', hasNewShell);

// Remove sidebar.js
d = d.replace(/<script src="sidebar\.js[^"]*"><\/script>/g, '');
d = d.replace(/<link rel="stylesheet" href="sidebar\.css[^"]*"\/>/g, '');

// Add dashboard-shell.css if missing
if (!hasNewShell && d.includes('styles.css')) {
  d = d.replace('<link rel="stylesheet" href="styles.css"', 
    '<link rel="stylesheet" href="styles.css"/>\n<link rel="stylesheet" href="dashboard-shell.css"');
}

// Replace old sidebar nav with new clean nav
const newNav = `<div id="sidebar">
  <div class="sb-logo">
    <div class="sb-logo-icon">Q</div>
    <div class="sb-logo-text">QR<span>Aivy</span></div>
  </div>
  <button class="sb-toggle" id="sb-toggle">&#x2039;</button>
  <nav class="sb-nav">
    <div class="sb-group">Main</div>
    <a href="dashboard.html" class="sb-item"><span class="sb-icon">&#x229E;</span><span class="sb-label">Dashboard</span></a>
    <a href="analytics.html" class="sb-item"><span class="sb-icon">&#x2197;</span><span class="sb-label">Analytics</span></a>
    <div class="sb-group" style="margin-top:4px">Smart Pages</div>
    <a href="dashboard.html" class="sb-item"><span class="sb-icon">&#x2B21;</span><span class="sb-label">Smart QR Pages</span></a>
    <a href="#" class="sb-item" id="sb-create-sqr"><span class="sb-icon">&#xFF0B;</span><span class="sb-label">Create New QR</span></a>
    <div class="sb-group" style="margin-top:4px">Engage</div>
    <a href="#" class="sb-item" id="sb-campaigns"><span class="sb-icon">&#x1F4E3;</span><span class="sb-label">AI Campaigns</span></a>
    <a href="#" class="sb-item" id="sb-subscribers"><span class="sb-icon">&#x1F465;</span><span class="sb-label">Subscribers</span></a>
    <div class="sb-group" style="margin-top:4px">Configure</div>
    <a href="designer.html" class="sb-item active"><span class="sb-icon">&#x1F3A8;</span><span class="sb-label">AI Designer</span></a>
    <a href="#" class="sb-item" id="sb-wallet"><span class="sb-icon">&#x1F4B3;</span><span class="sb-label">Wallet Passes</span></a>
    <div class="sb-group" style="margin-top:4px">Account</div>
    <a href="upgrade.html" class="sb-item"><span class="sb-icon">&#x1F4B3;</span><span class="sb-label">Billing &amp; Plans</span><span class="sb-badge" id="plan-badge">FREE</span></a>
    <a href="#" class="sb-item" id="sb-settings"><span class="sb-icon">&#x2699;</span><span class="sb-label">Settings</span></a>
  </nav>
  <div class="sb-footer">
    <div class="sb-user">
      <div class="sb-avatar" id="sb-avatar">?</div>
      <div class="sb-user-info">
        <div class="sb-user-name" id="sb-username">Loading&#x2026;</div>
        <div class="sb-user-role">Business Owner</div>
      </div>
    </div>
    <div class="sb-divider"></div>
    <a href="#" class="sb-signout" id="sb-signout"><span class="sb-icon">&#x2192;</span><span class="sb-label">Sign Out</span></a>
  </div>
</div>`;

// Replace old sidebar div
const oldSbMatch = d.match(/<div id="sidebar">[\s\S]*?<\/div>\s*\n\s*<button id="mob-btn"/);
if (oldSbMatch) {
  d = d.replace(oldSbMatch[0], newNav + '\n\n<button id="mob-btn"');
  console.log('Sidebar replaced ✓');
} else {
  console.log('Could not find old sidebar - manual check needed');
}

fs.writeFileSync(path.join(fr, 'designer.html'), d, 'utf8');
console.log('designer.html saved:', d.length, 'bytes');