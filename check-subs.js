// check-subs.js
// Lists all web push subscriptions in the database so we can see who can actually receive pushes.
// Run from the qrairy.ai project root:  node check-subs.js [slug]

const path = require('path');
const fs = require('fs');

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
  console.error('Could not find @prisma/client.');
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

(async () => {
  try {
    const where = slug ? { slug } : {};
    const subs = await prisma.webPushSubscription.findMany({ where });

    console.log('');
    if (slug) {
      console.log('Web push subscriptions for "' + slug + '":');
    } else {
      console.log('All web push subscriptions:');
    }
    console.log('');

    if (subs.length === 0) {
      console.log('  (none found)');
      console.log('');
      console.log('No one has accepted notifications for ' + (slug ? '"' + slug + '"' : 'any slug') + '.');
      console.log('Until someone visits the landing page (or PWA on iOS) and taps Allow,');
      console.log('there is nothing for the stamp event to push to.');
    } else {
      const bySlug = {};
      subs.forEach(s => {
        bySlug[s.slug] = bySlug[s.slug] || [];
        bySlug[s.slug].push(s);
      });
      Object.keys(bySlug).forEach(k => {
        console.log('  ' + k + ': ' + bySlug[k].length + ' subscriber(s)');
        bySlug[k].forEach(s => {
          console.log('    - endpoint: ' + s.endpoint.substring(0, 80) + '...');
        });
      });
    }
    console.log('');
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
