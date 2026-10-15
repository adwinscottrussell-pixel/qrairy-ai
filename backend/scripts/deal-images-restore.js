// QRAIVY Deals — restore quarantined Deal images (public again, same URL).
//
// Dry run by default: lists what would be restored, writes nothing.
// Writes ONLY with BOTH:  --apply   and   DEAL_IMAGE_CLEANUP=quarantine
// Removes only the quarantine tag and the quarantine context keys, restores
// anonymous access, then checks public delivery again (the CDN keeps its
// cached refusal for ~30 s; the check waits 60 s and polls up to 3 minutes).
//
// Usage: node scripts/deal-images-restore.js (--id <publicId> | --all-quarantined) [--apply] [--no-verify] [--limit N]
const lifecycle = require('../src/services/dealImageLifecycle');
const { ACTIVE_DEAL_IMAGE_FOLDER } = require('../src/data/dealImages');

function parseArgs(argv) {
  const out = { apply: false, verify: true, ids: [], all: false, limit: 100 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--no-verify') out.verify = false;
    else if (a === '--all-quarantined') out.all = true;
    else if (a === '--id') out.ids.push(String(argv[++i] || ''));
    else if (a === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error('--limit must be a whole number from 1 to 1000');
      out.limit = n;
    } else throw new Error('unknown argument: ' + a);
  }
  if (!out.all && !out.ids.length) throw new Error('give --id <publicId> or --all-quarantined');
  if (out.all && out.ids.length) throw new Error('use either --id or --all-quarantined');
  for (const id of out.ids) if (!lifecycle.parseDealImageId(id)) throw new Error('not a QRAIVY deal image id: ' + id);
  return out;
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const env = deps.env || process.env;
  const log = deps.log || lifecycle.makeLogger();
  const mode = lifecycle.resolveMode({ apply: args.apply, env });
  if (args.apply && mode !== 'apply') log('apply_refused', { why: 'DEAL_IMAGE_CLEANUP is not "quarantine" -- running as dry run' });
  const cloudinary = deps.cloudinary || configuredCloudinary(env);
  let ids = args.ids;
  if (args.all) {
    ids = [];
    let cursor;
    do {
      const page = await cloudinary.api.resources_by_tag(lifecycle.QUARANTINE_TAG, { resource_type: 'image', type: 'upload', max_results: 100, tags: true, next_cursor: cursor });
      for (const r of (page && page.resources) || []) if (lifecycle.parseDealImageId(r.public_id) && ids.length < args.limit) ids.push(r.public_id);
      cursor = page && page.next_cursor;
    } while (cursor && ids.length < args.limit);
  }
  const summary = { mode, folder: ACTIVE_DEAL_IMAGE_FOLDER, requested: ids.length, restored: 0, not_quarantined: 0, unverified: 0, not_yet_public: 0, errors: 0, would_restore: 0 };
  for (const id of ids) {
    if (mode !== 'apply') { summary.would_restore++; log('would_restore', { publicId: id }); continue; }
    try {
      const r = await lifecycle.restoreImage({ cloudinary, publicId: id, log, verifyDelivery: args.verify, fetchImpl: deps.fetchImpl, sleep: deps.sleep, timing: deps.timing });
      if (r.status === 'restored') { summary.restored++; if (r.delivery === 'not_yet_public') summary.not_yet_public++; }
      else if (r.status === 'not_quarantined') summary.not_quarantined++;
      else summary.unverified++;
    } catch (e) {
      summary.errors++;
      log('error', { publicId: id, message: String((e && e.error && e.error.message) || (e && e.message) || e).slice(0, 160) });
    }
  }
  log('restore_end', summary);
  return summary;
}

function configuredCloudinary(env) {
  for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) if (!env[k]) throw new Error(k + ' is not set');
  const { v2 } = require('cloudinary');
  v2.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  return v2;
}

module.exports = { main, parseArgs };

if (require.main === module) {
  main().then((s) => process.exit(s && (s.errors || s.unverified) ? 1 : 0), (e) => { console.error('[deals-images] fatal: ' + (e && e.message)); process.exit(2); });
}
