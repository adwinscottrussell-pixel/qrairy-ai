// webPushPages.js — Phase 5.5C.3: one browser, many businesses.
//
// A browser has one push address (WebPushSubscription, unique endpoint) for
// all QRAIVY pages on the same site. Which businesses it agreed to hear from
// is recorded per page in WebPushPageSubscription:
//   - a row is created only when the customer taps to enable on that page
//     ('explicit'), or by the migration for the one page an existing
//     subscription already belonged to ('migrated');
//   - opting out on a page sets that row's unsubscribedAt and nothing else;
//   - the page's background re-sync (permission already granted) refreshes
//     the address and keys but never creates or re-activates a row: no
//     consent is ever inferred.
// Sending reads only active rows for the page, of addresses the push service
// has not rejected, one delivery per address. A 404/410 answer marks the
// address expired (kept, never deleted).

const prisma = require('../utils/prismaClient');

const CID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_ENDPOINT = 2048;

function validSubscription(endpoint, keys) {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT) return false;
  let url;
  try { url = new URL(endpoint); } catch (_) { return false; }
  if (url.protocol !== 'https:') return false;
  return !!keys && typeof keys.p256dh === 'string' && typeof keys.auth === 'string'
    && keys.p256dh.length > 0 && keys.p256dh.length <= 256 && keys.auth.length > 0 && keys.auth.length <= 256;
}

const validCid = (cid) => (typeof cid === 'string' && CID_RE.test(cid)) ? cid : null;

// Store the browser's address for `slug`. Returns { subscribed } — true only
// when this page's opt-in is active after the call.
async function subscribePage({ slug, endpoint, keys, cid, explicit }) {
  const c = validCid(cid);
  // Legacy columns are written exactly as before (slug = last page), so the
  // previous release still behaves as it did if it is ever rolled back to.
  const update = { slug, p256dh: keys.p256dh, auth: keys.auth, expiredAt: null };
  if (c) update.cid = c;
  const device = await prisma.webPushSubscription.upsert({
    where: { endpoint },
    update,
    create: { slug, endpoint, p256dh: keys.p256dh, auth: keys.auth, cid: c },
  });

  const link = await prisma.webPushPageSubscription.findUnique({
    where: { subscriptionId_slug: { subscriptionId: device.id, slug } },
  });
  if (explicit) {
    if (link) {
      const data = { unsubscribedAt: null, source: 'explicit' };
      if (c) data.cid = c;
      await prisma.webPushPageSubscription.update({ where: { id: link.id }, data });
    } else {
      await prisma.webPushPageSubscription.create({ data: { subscriptionId: device.id, slug, cid: c, source: 'explicit' } });
    }
    return { subscribed: true };
  }
  // Background re-sync: never creates or re-activates an opt-in.
  if (link && !link.unsubscribedAt && c && link.cid !== c) {
    await prisma.webPushPageSubscription.update({ where: { id: link.id }, data: { cid: c } });
  }
  return { subscribed: !!(link && !link.unsubscribedAt) };
}

// Opt out of `slug` only. Other pages of the same browser stay as they are.
async function unsubscribePage({ slug, endpoint }) {
  const device = await prisma.webPushSubscription.findUnique({ where: { endpoint } });
  if (!device) return { changed: false };
  const r = await prisma.webPushPageSubscription.updateMany({
    where: { subscriptionId: device.id, slug, unsubscribedAt: null },
    data: { unsubscribedAt: new Date() },
  });
  return { changed: r.count > 0 };
}

// Active, deliverable opt-ins for one page, one entry per push address.
// `cid` narrows to one customer (stamp and reward messages).
async function recipientsForPage(slug, { cid } = {}) {
  const where = { slug, unsubscribedAt: null, subscription: { expiredAt: null } };
  if (cid !== undefined) where.cid = cid;
  const rows = await prisma.webPushPageSubscription.findMany({
    where,
    include: { subscription: { select: { id: true, endpoint: true, p256dh: true, auth: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const s = r.subscription;
    if (!s || seen.has(s.endpoint)) continue;
    seen.add(s.endpoint);
    out.push(s);
  }
  return out;
}

// One delivery per address; returns { attempted, sent, failed, expired }.
async function sendToRecipients(recipients, payload, send) {
  const sendWebPush = send || require('./webPushService').sendWebPush;
  const seen = new Set();
  let sent = 0, failed = 0;
  const expired = [];
  for (const s of recipients) {
    if (seen.has(s.endpoint)) continue;
    seen.add(s.endpoint);
    const r = await sendWebPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    if (r && r.ok) { sent++; continue; }
    failed++;
    if (r && (r.statusCode === 404 || r.statusCode === 410)) expired.push(s.id);
  }
  if (expired.length) {
    await prisma.webPushSubscription.updateMany({ where: { id: { in: expired } }, data: { expiredAt: new Date() } }).catch(() => {});
  }
  return { attempted: seen.size, sent, failed, expired: expired.length };
}

// Counts for the Admin: active, deliverable opt-ins per page.
async function countActiveBySlug(slugs) {
  if (!slugs.length) return {};
  const groups = await prisma.webPushPageSubscription.groupBy({
    by: ['slug'],
    where: { slug: { in: slugs }, unsubscribedAt: null, subscription: { expiredAt: null } },
    _count: { id: true },
  });
  const m = {};
  groups.forEach((g) => { m[g.slug] = g._count.id; });
  return m;
}

module.exports = { validSubscription, validCid, subscribePage, unsubscribePage, recipientsForPage, sendToRecipients, countActiveBySlug };
