// patch-pwa-meta.js
// Adds iOS PWA meta tags to the landing page so "Add to Home Screen" creates a real
// standalone app icon (no URL bar). This is required for iOS web push notifications.
// Run from the qrairy.ai project root:  node patch-pwa-meta.js

const fs = require('fs');
const path = require('path');

const filePath = path.join('backend', 'src', 'controllers', 'lpController.js');

if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  console.error('Run this from the qrairy.ai project root.');
  process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Detect line endings
const usesCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// Idempotency check
if (content.includes('apple-mobile-web-app-capable')) {
  console.log('Already patched - apple-mobile-web-app-capable meta tag already present.');
  process.exit(0);
}

// Find the service worker / PushManager registration code - this marks the landing page
const swMarker = '"serviceWorker"in navigator&&"PushManager"in window';
const swIndex = content.indexOf(swMarker);
if (swIndex === -1) {
  console.error('Could not find the service worker registration code.');
  console.error('Landing page may have been modified.');
  process.exit(1);
}

// Backtrack to find the nearest <head> tag before the service worker code
const headStart = content.lastIndexOf('<head>', swIndex);
if (headStart === -1) {
  console.error('Could not find <head> tag before service worker code.');
  process.exit(1);
}

const headEnd = headStart + '<head>'.length;

// PWA meta tags - the minimum iOS needs to launch the page in standalone mode
const pwaMeta = '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="apple-touch-icon" href="https://qraivy.com/icon-192.png">';

content = content.slice(0, headEnd) + pwaMeta + content.slice(headEnd);

// Restore original line endings
if (usesCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');

console.log('');
console.log('Patched successfully:', filePath);
console.log('');
console.log('Added PWA meta tags to the landing page head:');
console.log('  - apple-mobile-web-app-capable      (makes iOS launch in standalone mode)');
console.log('  - mobile-web-app-capable            (Android equivalent)');
console.log('  - apple-mobile-web-app-status-bar   (clean dark status bar)');
console.log('  - apple-touch-icon                  (nice home screen icon)');
console.log('');
console.log('After deploying, customers who tap Add to Home Screen will get a real');
console.log('standalone app icon (no Safari URL bar), which is required for web push.');
console.log('');
console.log('Next steps:');
console.log('  1. git add . ; git commit -m "Add iOS PWA meta tags for web push"');
console.log('  2. git push');
console.log('  3. Wait ~1 min for Railway to redeploy');
console.log('  4. On iPhone: delete the old home screen bookmark, clear Safari data for qraivy.com');
console.log('  5. Visit https://api.qraivy.com/lp/joes-bar-odk in Safari');
console.log('  6. Share > Add to Home Screen > Add');
console.log('  7. Open from home screen icon - should now be full screen with NO url bar');
console.log('  8. Tap the orange "Get notified of new deals" button - permission prompt appears');
console.log('  9. Tap Allow - subscription is saved');
console.log('');
