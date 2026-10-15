/**
 * dealImageLifecycle.js — reversible quarantine of unreferenced QRAIVY Deal images.
 * ─────────────────────────────────────────────────────────────
 * Nothing here ever deletes an image. "Quarantine" makes an image non-public
 * in place (Cloudinary access_control token) and marks it; its public ID,
 * version and every stored URL stay exactly the same, so restoring it makes
 * every reference work again without touching the database.
 * Verified on the preview Cloudinary account (Phase 3B.5 Step 0 / 3B.5b):
 *   - quarantine: one api.update with access_control [{access_type:'token'}],
 *     the full tag list + quarantine tag, the full context + quarantine keys
 *     (api.update REPLACES tags/context, so the existing ones are passed back)
 *   - delivery is refused (401) within seconds, also for cached URLs
 *   - restore: access_control [{access_type:'anonymous'}]; public delivery
 *     returns after up to ~33 s (the CDN briefly caches the refusal)
 *
 * Only run by hand (scripts/deal-images-reconcile.js, scripts/deal-images-restore.js);
 * there is no scheduler. DRY RUN unless the caller passes apply:true AND
 * DEAL_IMAGE_CLEANUP=quarantine is set (two explicit opt-ins).
 *
 * Reconciliation is two-pass, so a 10-minute waiting period needs no
 * database table and no background job:
 *   run 1: an unreferenced deal image older than 10 minutes gets a
 *          candidate mark (context qraivy_quarantine_candidate_at)
 *   run 2 (>= 10 minutes later): every reference is checked AGAIN, right
 *          before quarantine; still unreferenced -> quarantined; referenced
 *          again -> the mark is removed and the image is left alone
 * Any doubt (database error, unreadable image, unexpected data) means the
 * image is skipped. Quarantined images that are referenced again are
 * reported (and restored when applying).
 * ─────────────────────────────────────────────────────────────
 */
const { ACTIVE_DEAL_IMAGE_FOLDER } = require('../data/dealImages');

const WAIT_MS = 10 * 60 * 1000;                 // minimum waiting period (never less)
const MIN_ASSET_AGE_MS = 10 * 60 * 1000;        // never look at an upload younger than this
const RESTORE_DELIVERY_WAIT_MS = 60 * 1000;     // observed restore delay ~33 s; give it 60 s
const RESTORE_DELIVERY_POLL_MS = 15 * 1000;
const RESTORE_DELIVERY_MAX_MS = 3 * 60 * 1000;
const QUARANTINE_TAG = 'qraivy_deal_quarantine';
const CTX = Object.freeze({
  candidateAt: 'qraivy_quarantine_candidate_at',
  quarantinedAt: 'qraivy_quarantined_at',
  reason: 'qraivy_quarantine_reason',
  dealId: 'qraivy_deal_id',
});
const OWN_CTX_KEYS = Object.values(CTX);

// ── Namespace guard ─────────────────────────────────────────────
// <folder>/deal-<dealId>-<13-digit ms timestamp>, exactly as dealImageUploadService names uploads.
function dealImagePattern(folder = ACTIVE_DEAL_IMAGE_FOLDER) {
  if (!folder || !/^[a-z0-9][a-z0-9-]{2,60}$/.test(folder)) return null;
  return new RegExp('^' + folder + '/deal-([A-Za-z0-9_-]{1,64})-(\\d{13})$');
}
function parseDealImageId(publicId, folder = ACTIVE_DEAL_IMAGE_FOLDER) {
  const re = dealImagePattern(folder);
  const m = re && typeof publicId === 'string' ? re.exec(publicId) : null;
  return m ? { dealId: m[1], uploadedAt: Number(m[2]) } : null;
}

// ── Mode ────────────────────────────────────────────────────────
// Writes only with apply:true AND DEAL_IMAGE_CLEANUP=quarantine.
function resolveMode({ apply = false, env = process.env } = {}) {
  const setting = String((env && env.DEAL_IMAGE_CLEANUP) || '').trim();
  if (apply === true && setting === 'quarantine') return 'apply';
  return 'dry-run';
}

// ── Logging (JSON lines, no URLs, no user data) ─────────────────
function makeLogger(sink = (line) => console.log(line)) {
  return (event, fields = {}) => sink('[deals-images] ' + JSON.stringify({ event, ...fields }));
}

// ── Reference check ─────────────────────────────────────────────
// Every place where a QRAIVY database row can hold an image URL or ID
// (Phase 3B.5 audit). One read-only query; strpos instead of LIKE, so "_"
// in an ID is never a wildcard. Archived deals and every owner included.
const REFERENCE_SOURCES = Object.freeze([
  'deal_live', 'deal_draft', 'deal_other_fields', 'landing_page', 'qr', 'push_campaign', 'pass',
  'stadtpocket_listing', 'stadtpocket_location', 'support_action',
]);
async function findReferences(prisma, publicId) {
  if (!prisma || typeof prisma.$queryRaw !== 'function') throw new Error('reference check needs a database client');
  if (typeof publicId !== 'string' || !publicId) throw new Error('reference check needs a public id');
  const rows = await prisma.$queryRaw`
    SELECT 'deal_live' AS src, count(*)::int AS n FROM "Deal" WHERE "image"->>'publicId' = ${publicId}
    UNION ALL SELECT 'deal_draft', count(*)::int FROM "Deal" WHERE "draftData"->'image'->>'publicId' = ${publicId}
    UNION ALL SELECT 'deal_other_fields', count(*)::int FROM "Deal"
      WHERE strpos(coalesce("image"::text, '') || ' ' || coalesce("draftData"::text, '') || ' ' || coalesce("offerDetails"::text, '') || ' ' ||
                   coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("offerText", ''), ${publicId}) > 0
    UNION ALL SELECT 'landing_page', count(*)::int FROM "LandingPage"
      WHERE strpos(coalesce("sections", '') || ' ' || coalesce("logoUrl", '') || ' ' || coalesce("websiteUrl", ''), ${publicId}) > 0
    UNION ALL SELECT 'qr', count(*)::int FROM "QR"
      WHERE strpos(coalesce("originalUrl", '') || ' ' || coalesce("destinationUrl", '') || ' ' || coalesce("siteContent", ''), ${publicId}) > 0
    UNION ALL SELECT 'push_campaign', count(*)::int FROM "PushCampaign" WHERE strpos(coalesce("linkUrl", ''), ${publicId}) > 0
    UNION ALL SELECT 'pass', count(*)::int FROM "Pass" WHERE strpos(coalesce("lastMsgLink", ''), ${publicId}) > 0
    UNION ALL SELECT 'stadtpocket_listing', count(*)::int FROM "StadtPocketListing"
      WHERE strpos(coalesce("draftData"::text, '') || ' ' || coalesce("sourceUrl", '') || ' ' || coalesce("shortDescription", '') || ' ' || coalesce("longDescription", ''), ${publicId}) > 0
    UNION ALL SELECT 'stadtpocket_location', count(*)::int FROM "StadtPocketListingLocation"
      WHERE strpos(coalesce("draftData"::text, '') || ' ' || coalesce("website", '') || ' ' || coalesce("sourceUrl", ''), ${publicId}) > 0
    UNION ALL SELECT 'support_action', count(*)::int FROM "SupportAction" WHERE strpos(coalesce("metadata"::text, ''), ${publicId}) > 0`;
  // Anything but exactly one row per known source is "uncertain".
  if (!Array.isArray(rows) || rows.length !== REFERENCE_SOURCES.length) throw new Error('unexpected reference check result');
  const sources = [];
  for (const r of rows) {
    if (!REFERENCE_SOURCES.includes(r.src) || !Number.isInteger(Number(r.n))) throw new Error('unexpected reference check row');
    if (Number(r.n) > 0) sources.push(r.src);
  }
  return { referenced: sources.length > 0, sources };
}

// ── Cloudinary helpers ──────────────────────────────────────────
function contextOf(resource) {
  const c = resource && resource.context;
  const custom = c && typeof c === 'object' ? (c.custom && typeof c.custom === 'object' ? c.custom : c) : {};
  return { ...custom };
}
function isQuarantined(resource) { return Array.isArray(resource && resource.tags) && resource.tags.includes(QUARANTINE_TAG); }
function withoutOwnKeys(ctx, keys = OWN_CTX_KEYS) { const c = { ...ctx }; for (const k of keys) delete c[k]; return c; }
function sameAsset(a, b) { return a && b && a.public_id === b.public_id && a.version === b.version && a.secure_url === b.secure_url; }
async function readResource(cloudinary, publicId) {
  return cloudinary.api.resource(publicId, { tags: true, context: true });
}
// Sets the context to exactly `ctx`; an empty context is cleared explicitly.
async function setContext(cloudinary, publicId, ctx) {
  if (Object.keys(ctx).length) return cloudinary.api.update(publicId, { context: ctx });
  return cloudinary.uploader.remove_all_context([publicId]);
}

// ── Quarantine one image (re-reads; preserves tags/context; verifies) ──
async function quarantineImage({ cloudinary, publicId, reason, log, now = Date.now() }) {
  const meta = parseDealImageId(publicId);
  if (!meta) throw new Error('not a deal image id');
  const before = await readResource(cloudinary, publicId);
  if (isQuarantined(before)) return { status: 'already_quarantined' };
  const ctx = withoutOwnKeys(contextOf(before), [CTX.candidateAt]);
  ctx[CTX.quarantinedAt] = new Date(now).toISOString();
  ctx[CTX.reason] = String(reason || 'unreferenced').replace(/[^a-z_]/g, '').slice(0, 40) || 'unreferenced';
  ctx[CTX.dealId] = meta.dealId;
  await cloudinary.api.update(publicId, {
    access_control: [{ access_type: 'token' }],
    tags: [...(before.tags || []).filter((t) => t !== QUARANTINE_TAG), QUARANTINE_TAG],
    context: ctx,
  });
  const after = await readResource(cloudinary, publicId);
  const ok = sameAsset(before, after) && isQuarantined(after) &&
    Array.isArray(after.access_control) && after.access_control.some((a) => a && a.access_type === 'token') &&
    (before.tags || []).every((t) => (after.tags || []).includes(t));
  log(ok ? 'quarantined' : 'quarantine_unverified', { publicId, dealId: meta.dealId, reason: ctx[CTX.reason] });
  return { status: ok ? 'quarantined' : 'unverified' };
}

// ── Restore one image (removes only quarantine tag/keys; anonymous access) ──
async function restoreImage({ cloudinary, publicId, log, fetchImpl = (typeof fetch === 'function' ? fetch : null), verifyDelivery = true, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timing = {} }) {
  if (!parseDealImageId(publicId)) throw new Error('not a deal image id');
  const before = await readResource(cloudinary, publicId);
  if (!isQuarantined(before)) { log('restore_skipped', { publicId, why: 'not_quarantined' }); return { status: 'not_quarantined' }; }
  const ownCtx = withoutOwnKeys(contextOf(before));
  await cloudinary.api.update(publicId, { access_control: [{ access_type: 'anonymous' }] });
  await cloudinary.uploader.remove_tag(QUARANTINE_TAG, [publicId]);
  await setContext(cloudinary, publicId, ownCtx);
  const after = await readResource(cloudinary, publicId);
  const ctxAfter = contextOf(after);
  const restored = sameAsset(before, after) && !isQuarantined(after) &&
    Array.isArray(after.access_control) && after.access_control.some((a) => a && a.access_type === 'anonymous') &&
    OWN_CTX_KEYS.every((k) => !(k in ctxAfter)) &&
    Object.entries(ownCtx).every(([k, v]) => ctxAfter[k] === v) &&
    (before.tags || []).filter((t) => t !== QUARANTINE_TAG).every((t) => (after.tags || []).includes(t));
  if (!restored) { log('restore_unverified', { publicId }); return { status: 'unverified' }; }
  if (!verifyDelivery || !fetchImpl) { log('restored', { publicId, delivery: 'not_checked' }); return { status: 'restored', delivery: 'not_checked' }; }
  // Public delivery returns after the CDN drops its cached refusal (~33 s observed).
  const wait = timing.firstWaitMs != null ? timing.firstWaitMs : RESTORE_DELIVERY_WAIT_MS;
  const poll = timing.pollMs != null ? timing.pollMs : RESTORE_DELIVERY_POLL_MS;
  const max = timing.maxMs != null ? timing.maxMs : RESTORE_DELIVERY_MAX_MS;
  let waited = 0, status = null;
  await sleep(wait); waited += wait;
  for (;;) {
    try { status = (await fetchImpl(after.secure_url, { redirect: 'manual', cache: 'no-store' })).status; } catch (_) { status = null; }
    if (status === 200 || waited >= max) break;
    await sleep(poll); waited += poll;
  }
  const delivery = status === 200 ? 'public' : 'not_yet_public';
  log('restored', { publicId, delivery, afterMs: waited });
  return { status: 'restored', delivery };
}

// ── Reconciliation (one bounded run over the deal image folder) ───
async function reconcile({ cloudinary, prisma, apply = false, env = process.env, now = Date.now(), limit = 100, log = makeLogger(), restoreReferenced = true }) {
  const mode = resolveMode({ apply, env });
  const folder = ACTIVE_DEAL_IMAGE_FOLDER;
  const summary = { mode, folder, seen: 0, skipped_namespace: 0, too_new: 0, referenced: 0, marked: 0, waiting: 0, unmarked: 0, quarantined: 0,
    already_quarantined: 0, quarantined_but_referenced: 0, restored: 0, uncertain: 0, errors: 0, would: { mark: 0, quarantine: 0, unmark: 0, restore: 0 } };
  if (!dealImagePattern(folder)) { log('stop', { why: 'no_active_deal_folder' }); return summary; }
  log('run_start', { mode, folder, limit });
  let cursor;
  do {
    const page = await cloudinary.api.resources({ type: 'upload', resource_type: 'image', prefix: folder + '/deal-', max_results: Math.min(100, limit - summary.seen), tags: true, context: true, next_cursor: cursor });
    for (const res of (page && page.resources) || []) {
      if (summary.seen >= limit) break;
      summary.seen++;
      const id = res.public_id;
      try {
        const meta = parseDealImageId(id);
        if (!meta) { summary.skipped_namespace++; log('skip', { publicId: id, why: 'outside_namespace' }); continue; }
        if (now - meta.uploadedAt < MIN_ASSET_AGE_MS) { summary.too_new++; continue; }
        let refs;
        try { refs = await findReferences(prisma, id); }
        catch (e) { summary.uncertain++; log('uncertain', { publicId: id, why: 'reference_check_failed' }); continue; }
        const ctx = contextOf(res);
        if (isQuarantined(res)) {
          if (!refs.referenced) { summary.already_quarantined++; continue; }
          summary.quarantined_but_referenced++;
          log('quarantined_but_referenced', { publicId: id, sources: refs.sources });
          if (mode === 'apply' && restoreReferenced) {
            const r = await restoreImage({ cloudinary, publicId: id, log, verifyDelivery: false });
            if (r.status === 'restored') summary.restored++;
          } else summary.would.restore++;
          continue;
        }
        if (refs.referenced) {
          summary.referenced++;
          if (ctx[CTX.candidateAt]) {
            if (mode === 'apply') { await setContext(cloudinary, id, withoutOwnKeys(ctx, [CTX.candidateAt])); summary.unmarked++; log('unmarked', { publicId: id, sources: refs.sources }); }
            else summary.would.unmark++;
          }
          continue;
        }
        const markedAt = Date.parse(ctx[CTX.candidateAt] || '');
        if (!Number.isFinite(markedAt)) {
          if (mode === 'apply') { await setContext(cloudinary, id, { ...ctx, [CTX.candidateAt]: new Date(now).toISOString() }); summary.marked++; log('marked', { publicId: id, dealId: meta.dealId }); }
          else { summary.would.mark++; log('would_mark', { publicId: id, dealId: meta.dealId }); }
          continue;
        }
        if (now - markedAt < WAIT_MS) { summary.waiting++; continue; }
        // Waiting period over: check every reference AGAIN, immediately before quarantine.
        let again;
        try { again = await findReferences(prisma, id); }
        catch (e) { summary.uncertain++; log('uncertain', { publicId: id, why: 'recheck_failed' }); continue; }
        if (again.referenced) {
          summary.referenced++;
          if (mode === 'apply') { await setContext(cloudinary, id, withoutOwnKeys(ctx, [CTX.candidateAt])); summary.unmarked++; log('unmarked', { publicId: id, sources: again.sources }); }
          else summary.would.unmark++;
          continue;
        }
        if (mode === 'apply') {
          const q = await quarantineImage({ cloudinary, publicId: id, reason: 'unreferenced', log, now });
          if (q.status === 'quarantined') summary.quarantined++; else if (q.status === 'unverified') summary.errors++;
        } else { summary.would.quarantine++; log('would_quarantine', { publicId: id, dealId: meta.dealId }); }
      } catch (e) {
        summary.errors++;
        log('error', { publicId: id, message: String((e && e.error && e.error.message) || (e && e.message) || e).slice(0, 160) });
      }
    }
    cursor = page && page.next_cursor;
  } while (cursor && summary.seen < limit);
  log('run_end', summary);
  return summary;
}

module.exports = {
  WAIT_MS, MIN_ASSET_AGE_MS, RESTORE_DELIVERY_WAIT_MS, QUARANTINE_TAG, CTX, REFERENCE_SOURCES,
  dealImagePattern, parseDealImageId, resolveMode, makeLogger, findReferences,
  contextOf, isQuarantined, quarantineImage, restoreImage, reconcile,
};
