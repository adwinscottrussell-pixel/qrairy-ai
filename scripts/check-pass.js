// check-pass.js
// Dumps the Pass row + recent stamp activity for a slug so we can verify
// that handleStamp / handleRedeemStamp are populating the new tracking fields.
//
// Usage:
//   node check-pass.js              -> lists all loyalty cards (same as reset-test.js)
//   node check-pass.js <slug>       -> dumps Pass row + recent stamps + recent rewards

const path = require('path');
const fs = require('fs');

const candidates = [
  process.cwd(),
  path.join(process.cwd(), 'backend'),
  __dirname,
  path.join(__dirname, '..'),
  path.join(__dirname, '..', 'backend'),
];

let backendDir = null;
for (const c of candidates) {
  if (fs.existsSync(path.join(c, 'node_modules', '@prisma', 'client'))) {
    backendDir = c;
    break;
  }
}

if (!backendDir) {
  console.error('Could not find @prisma/client. Run from the qrairy.ai project root.');
  process.exit(1);
}

const envPath = path.join(backendDir, '.env');
if (fs.existsSync(envPath)) {
  try {
    require(path.join(backendDir, 'node_modules', 'dotenv')).config({ path: envPath });
  } catch (e) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}

const { PrismaClient } = require(path.join(backendDir, 'node_modules', '@prisma', 'client'));
const prisma = new PrismaClient();

const slug = process.argv[2];

function fmt(v) {
  if (v === null || v === undefined) return '(null)';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

(async () => {
  try {
    if (!slug) {
      const passes = await prisma.pass.findMany({
        select: { serialNumber: true, stampCount: true, totalStamps: true, rewardsEarned: true, rewardReady: true, lastStampAt: true }
      });
      console.log('');
      console.log('All passes:');
      console.log('');
      if (passes.length === 0) {
        console.log('  (no passes found)');
      } else {
        passes.forEach(p => {
          const s = p.serialNumber.replace(/^sqr-/, '');
          const ready = p.rewardReady ? '  [READY]' : '';
          console.log('  ' + s);
          console.log('    current=' + p.stampCount + '  total=' + p.totalStamps + '  rewardsEarned=' + p.rewardsEarned + '  lastStampAt=' + fmt(p.lastStampAt) + ready);
        });
      }
      console.log('');
      console.log('Run with a slug to see full activity:  node check-pass.js <slug>');
      console.log('');
      return;
    }

    const serial = 'sqr-' + slug;
    const pass = await prisma.pass.findUnique({ where: { serialNumber: serial } });

    if (!pass) {
      console.log('');
      console.log('No Pass exists for slug "' + slug + '" (serialNumber: ' + serial + ')');
      console.log('A customer needs to save the wallet pass first.');
      console.log('');
      return;
    }

    console.log('');
    console.log('Pass row for "' + slug + '":');
    console.log('  id:              ' + pass.id);
    console.log('  serialNumber:    ' + pass.serialNumber);
    console.log('  stampCount:      ' + pass.stampCount + '  (current cycle)');
    console.log('  stampGoal:       ' + pass.stampGoal);
    console.log('  rewardReady:     ' + pass.rewardReady);
    console.log('  totalStamps:     ' + pass.totalStamps + '  (lifetime - NEW)');
    console.log('  rewardsEarned:   ' + pass.rewardsEarned + '  (lifetime - NEW)');
    console.log('  lastStampAt:     ' + fmt(pass.lastStampAt) + '  (NEW)');
    console.log('  createdAt:       ' + fmt(pass.createdAt) + '  (NEW)');
    console.log('  updatedAt:       ' + fmt(pass.updatedAt));
    console.log('');

    const stamps = await prisma.stampEntry.findMany({
      where: { slug },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log('Recent stamps (' + stamps.length + ' shown, source field is NEW):');
    if (stamps.length === 0) {
      console.log('  (none)');
    } else {
      stamps.forEach(s => {
        const src = s.source || '(no source - pre-B2)';
        console.log('  ' + fmt(s.createdAt) + '   source=' + src);
      });
    }
    console.log('');

    const rewards = await prisma.rewardEvent.findMany({
      where: { slug },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log('Reward events (' + rewards.length + ' total, status: earned | redeemed | expired):');
    if (rewards.length === 0) {
      console.log('  (none - none earned yet, or stamps happened before B2 deployed)');
    } else {
      rewards.forEach(r => {
        const redeemed = r.redeemedAt ? '  redeemedAt=' + fmt(r.redeemedAt) : '';
        console.log('  ' + fmt(r.createdAt) + '   status=' + r.status + '   "' + r.rewardText + '"' + redeemed);
      });
    }
    console.log('');

    const totalStampEntries = await prisma.stampEntry.count({ where: { slug } });
    console.log('Aggregates:');
    console.log('  StampEntry count (all-time):  ' + totalStampEntries);
    console.log('  Pass.totalStamps:             ' + pass.totalStamps);
    if (totalStampEntries !== pass.totalStamps) {
      console.log('  NOTE: mismatch is normal if stamps happened before Phase B2 deployed.');
      console.log('        Pass.totalStamps only counts stamps after B2.');
    }
    console.log('');
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
