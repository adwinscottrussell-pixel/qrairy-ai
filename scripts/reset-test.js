// reset-test.js
// Clears recent stamp entries so you can re-test the stamp flow without waiting an hour.
// Run from the qrairy.ai project root.
// Usage:
//   node reset-test.js               -> lists your loyalty cards
//   node reset-test.js <slug>        -> clears the 1-hour cooldown for that slug

const path = require('path');
const fs = require('fs');

// ── Find the backend folder (where @prisma/client and .env live) ──
const candidates = [
  process.cwd(),
  path.join(process.cwd(), 'backend'),
  __dirname,
  path.join(__dirname, 'backend'),
];

let backendDir = null;
for (const c of candidates) {
  if (fs.existsSync(path.join(c, 'node_modules', '@prisma', 'client'))) {
    backendDir = c;
    break;
  }
}

if (!backendDir) {
  console.error('');
  console.error('Could not find @prisma/client. I looked in:');
  candidates.forEach(c => console.error('  -', c));
  console.error('');
  console.error('Try running from the qrairy.ai project root.');
  process.exit(1);
}

// ── Load .env from the backend folder so DATABASE_URL is available ──
const envPath = path.join(backendDir, '.env');
if (fs.existsSync(envPath)) {
  try {
    const dotenv = require(path.join(backendDir, 'node_modules', 'dotenv'));
    dotenv.config({ path: envPath });
  } catch (e) {
    // Manually parse if dotenv isn't installed
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  }
}

// ── Load Prisma from the backend folder ──
const { PrismaClient } = require(path.join(backendDir, 'node_modules', '@prisma', 'client'));
const prisma = new PrismaClient();

const slug = process.argv[2];

(async () => {
  try {
    if (!slug) {
      const passes = await prisma.pass.findMany({
        select: { serialNumber: true, stampCount: true, rewardReady: true }
      });
      console.log('');
      console.log('Your loyalty cards:');
      console.log('');
      if (passes.length === 0) {
        console.log('  (no passes found in the database)');
      } else {
        passes.forEach(p => {
          const s = p.serialNumber.replace(/^sqr-/, '');
          const flag = p.rewardReady ? '  [reward ready!]' : '';
          console.log('  - ' + s + '   (' + p.stampCount + ' stamps)' + flag);
        });
      }
      console.log('');
      console.log('Now run:  node reset-test.js <slug>');
      console.log('');
      return;
    }

    const recent = await prisma.stampEntry.findMany({
      where: { slug, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' }
    });

    if (recent.length === 0) {
      console.log('');
      console.log('No recent stamps for "' + slug + '". Cooldown is already clear.');
      console.log('You can scan the NFC stamper right now.');
      console.log('');
      return;
    }

    const deleted = await prisma.stampEntry.deleteMany({
      where: { slug, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } }
    });

    console.log('');
    console.log('Cleared ' + deleted.count + ' recent stamp(s) for "' + slug + '".');
    console.log('Cooldown is now clear. Go scan the NFC stamper.');
    console.log('');
    console.log('Note: this only clears the cooldown. The pass\'s stamp count stays the same.');
    console.log('Your next scan will increment to the next number normally.');
    console.log('');
  } catch (e) {
    console.error('Error:', e.message);
    if (e.message.includes('DATABASE_URL')) {
      console.error('');
      console.error('Tip: make sure backend/.env contains DATABASE_URL.');
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
