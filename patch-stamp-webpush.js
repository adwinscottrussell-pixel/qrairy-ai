// patch-stamp-webpush.js
// Adds Web Push (deep link) to the stamp flow in lpController.js
// Run from the qrairy.ai folder:  node patch-stamp-webpush.js

const fs = require('fs');
const path = require('path');

const filePath = path.join('backend', 'src', 'controllers', 'lpController.js');

if (!fs.existsSync(filePath)) {
  console.error('✗ File not found:', filePath);
  console.error('  Make sure you run this from the qrairy.ai folder.');
  process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Detect line ending style so we can restore it on save
const usesCRLF = content.includes('\r\n');
// Normalize to LF for matching
content = content.replace(/\r\n/g, '\n');

// Idempotency check — don't patch twice
if (content.includes('Web Push: deep link customer to their loyalty card')) {
  console.log('✓ Patch already applied — nothing to do.');
  process.exit(0);
}

const oldBlock = `    await prisma.stampEntry.create({ data: { slug, passId: pass.id } });
    const devices = await prisma.passDevice.findMany({ where: { passId: pass.id }, select: { pushToken: true } });
    if (devices.length) {
      try {
        const { pushUpdateToDevices } = require('../services/apnsService');
        await pushUpdateToDevices(devices);
      } catch(e) { console.error('[Stamp] Push error:', e.message); }
    }
    const rewardName = settings ? settings.rewardName : 'Free item';`;

const newBlock = `    await prisma.stampEntry.create({ data: { slug, passId: pass.id } });
    const rewardName = settings ? settings.rewardName : 'Free item';
    const devices = await prisma.passDevice.findMany({ where: { passId: pass.id }, select: { pushToken: true } });
    if (devices.length) {
      try {
        const { pushUpdateToDevices } = require('../services/apnsService');
        await pushUpdateToDevices(devices);
      } catch(e) { console.error('[Stamp] Push error:', e.message); }
    }
    // Web Push: deep link customer to their loyalty card
    try {
      const webSubs = await prisma.webPushSubscription.findMany({ where: { slug } });
      if (webSubs.length > 0) {
        const { sendWebPush } = require('../services/webPushService');
        const title = rewardReady ? '\u{1F389} Reward ready!' : '\u{2705} Stamp collected!';
        const body = rewardReady
          ? 'Show your pass to claim your ' + rewardName
          : newCount + ' of ' + goal + ' stamps - tap to see your card';
        const url = 'https://api.qraivy.com/lp/card/' + slug;
        for (const sub of webSubs) {
          await sendWebPush(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            { title, body, url, icon: 'https://qraivy.com/icon-192.png' }
          );
        }
        console.log('[Stamp] Web push sent to', webSubs.length, 'subscribers for', slug);
      }
    } catch(e) { console.error('[Stamp] WebPush error:', e.message); }`;

if (!content.includes(oldBlock)) {
  console.error('✗ Could not find the target block in handleStamp().');
  console.error('  The file may have been modified since we last looked.');
  console.error('  No changes made — your file is untouched.');
  process.exit(1);
}

content = content.replace(oldBlock, newBlock);

// Restore original line endings
if (usesCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');

console.log('');
console.log('✓ Successfully patched', filePath);
console.log('');
console.log('What changed:');
console.log('  - After each stamp, a web push now fires alongside the Apple Wallet push');
console.log('  - Notification text: "✅ Stamp collected! 3 of 10 stamps - tap to see your card"');
console.log('  - On reward ready: "🎉 Reward ready! Show your pass to claim your <reward>"');
console.log('  - Tap deep-links to: https://api.qraivy.com/lp/card/<slug>');
console.log('');
console.log('Next steps:');
console.log('  1. Review:  git diff backend/src/controllers/lpController.js');
console.log('  2. Commit:  git add . ; git commit -m "Add web push deep link to stamp flow"');
console.log('  3. Push:    git push');
console.log('  4. Railway auto-deploys in ~1 minute');
console.log('');
