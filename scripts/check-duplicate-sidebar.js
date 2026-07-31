#!/usr/bin/env node
/**
 * check-duplicate-sidebar.js
 *
 * Fails (non-zero exit) if any customer dashboard page under
 * frontend/public contains its own copy of the shared sidebar markup
 * instead of the empty <div id="sidebar"></div> placeholder that
 * frontend/public/js/dashboard-shell.js renders into.
 *
 * Run: node scripts/check-duplicate-sidebar.js
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'frontend', 'public');

// Pages that intentionally own a separate, documented shell and are not
// part of the customer dashboard shell migration.
const ALLOWLIST = new Set([
  'admin.html', // uses js/shell-admin.js — separate admin-only shell
]);

const VIOLATION_PATTERNS = [
  { name: '<nav class="sb-nav">', re: /<nav[^>]*class="sb-nav"/ },
  { name: '<div class="sb-logo">', re: /<div[^>]*class="sb-logo"/ },
];

function findHtmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(function (e) { return e.isFile() && e.name.endsWith('.html'); })
    .map(function (e) { return e.name; });
}

function checkFile(name) {
  const filePath = path.join(PUBLIC_DIR, name);
  const html = fs.readFileSync(filePath, 'utf8');
  const violations = [];

  VIOLATION_PATTERNS.forEach(function (p) {
    if (p.re.test(html)) violations.push(p.name);
  });

  // The only markup allowed for the sidebar is the empty placeholder the
  // shared shell renders into — anything else means full static content
  // was copied into this page instead.
  const sidebarOpen = /<div id="sidebar">/.exec(html);
  if (sidebarOpen) {
    const after = html.slice(sidebarOpen.index + sidebarOpen[0].length, sidebarOpen.index + sidebarOpen[0].length + 20);
    if (!/^\s*<\/div>/.test(after)) {
      violations.push('non-empty <div id="sidebar"> (full static content instead of the shared-shell placeholder)');
    }
  }

  return violations;
}

function main() {
  const files = findHtmlFiles(PUBLIC_DIR).filter(function (f) { return !ALLOWLIST.has(f); });
  let failed = false;

  files.forEach(function (f) {
    const violations = checkFile(f);
    if (violations.length) {
      failed = true;
      console.log('FAIL ' + f);
      violations.forEach(function (v) { console.log('  - ' + v); });
    }
  });

  if (failed) {
    console.log('\nDuplicated sidebar markup found. Use frontend/public/js/dashboard-shell.js (the shared customer dashboard shell) instead of copying sidebar HTML into individual pages.');
    process.exit(1);
  } else {
    console.log('OK - no duplicated sidebar markup found in ' + files.length + ' checked file(s).');
    process.exit(0);
  }
}

main();
