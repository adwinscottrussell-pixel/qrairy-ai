// QRAIVY Deals — find unreferenced Deal images and quarantine them (reversible).
//
// Dry run by default: reads Cloudinary and the database, writes nothing.
// Writes ONLY with BOTH:  --apply   and   DEAL_IMAGE_CLEANUP=quarantine
// Never deletes an image (see src/services/dealImageLifecycle.js).
//
// Two-pass waiting period: the first applied run marks unreferenced images as
// candidates; a run at least 10 minutes later re-checks every reference and
// quarantines the ones that are still unreferenced. Run it by hand; there is
// no scheduler.
//
// Usage: node scripts/deal-images-reconcile.js [--apply] [--limit N]
const lifecycle = require('../src/services/dealImageLifecycle');

function parseArgs(argv) {
  const out = { apply: false, limit: 100 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error('--limit must be a whole number from 1 to 1000');
      out.limit = n;
    } else throw new Error('unknown argument: ' + argv[i]);
  }
  return out;
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const env = deps.env || process.env;
  const log = deps.log || lifecycle.makeLogger();
  const mode = lifecycle.resolveMode({ apply: args.apply, env });
  if (args.apply && mode !== 'apply') log('apply_refused', { why: 'DEAL_IMAGE_CLEANUP is not "quarantine" -- running as dry run' });
  const cloudinary = deps.cloudinary || configuredCloudinary(env);
  const prisma = deps.prisma || require('../src/utils/prismaClient');
  try {
    return await lifecycle.reconcile({ cloudinary, prisma, apply: args.apply, env, limit: args.limit, log, now: deps.now });
  } finally {
    if (!deps.prisma && prisma.$disconnect) await prisma.$disconnect();
  }
}

function configuredCloudinary(env) {
  for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) if (!env[k]) throw new Error(k + ' is not set');
  const { v2 } = require('cloudinary');
  v2.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  return v2;
}

module.exports = { main, parseArgs };

if (require.main === module) {
  main().then((s) => process.exit(s && s.errors ? 1 : 0), (e) => { console.error('[deals-images] fatal: ' + (e && e.message)); process.exit(2); });
}
