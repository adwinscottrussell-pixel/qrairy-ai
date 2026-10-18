// slugReservation.js — a deleted page's address stays reserved while its data remains.
//
// Customer and business records are stored by page slug (subscribers, push
// subscriptions, Wallet passes, loyalty, stamps, campaigns, deals). Deleting
// a page keeps those records. If anyone could create a new page on the same
// slug, the new owner would inherit them: read the old subscribers' emails,
// send them campaigns, update their Wallet passes, show the old deals.
//
// So a NEW page may not be created on a slug that still has any such record.
// Nothing is deleted or reassigned; the address simply stays unavailable.
// Existing pages are unaffected (this is only consulted when no page exists).
//
// Phase 5.5C.4A: a deleted page's address also stays reserved once its data
// is gone. Printed QR codes, NFC tags and Wallet links keep pointing at it, so
// a new page there would receive the old page's visitors. handleDeleteLP
// records every deletion (SupportAction, DELETED_PAGE_MARKER); that record
// reserves the slug for good.

const prisma = require('../utils/prismaClient');

const DELETED_PAGE_MARKER = { actionType: 'landing_page_deleted', targetType: 'LandingPageSlug' };

// Each check answers "is there at least one record for this slug?".
// Wallet passes: newer passes carry `slug`; older ones only the serial
// number, 'sqr-<slug>' or 'sqr-<slug>-<customer id>'. The prefix form can also
// match a longer slug's passes; that errs on the side of keeping the address
// reserved.
function checks(slug) {
  const one = { select: { id: true } };
  return [
    ['subscribers', () => prisma.subscriber.findFirst(Object.assign({ where: { slug } }, one))],
    ['push subscriptions', () => prisma.webPushSubscription.findFirst(Object.assign({ where: { slug } }, one))],
    // Phase 5.5C.3: per-business push opt-ins (a browser's legacy slug may name another page)
    ['push opt-ins', () => prisma.webPushPageSubscription.findFirst(Object.assign({ where: { slug } }, one))],
    ['wallet passes', () => prisma.pass.findFirst(Object.assign({ where: { OR: [{ slug }, { serialNumber: 'sqr-' + slug }, { serialNumber: { startsWith: 'sqr-' + slug + '-' } }] } }, one))],
    ['loyalty customers', () => prisma.loyaltyCustomer.findFirst(Object.assign({ where: { slug } }, one))],
    ['stamps', () => prisma.stampEntry.findFirst(Object.assign({ where: { slug } }, one))],
    ['rewards', () => prisma.rewardEvent.findFirst(Object.assign({ where: { slug } }, one))],
    ['stamp settings', () => prisma.stampSettings.findFirst(Object.assign({ where: { slug } }, one))],
    ['stamp tokens', () => prisma.stampToken.findFirst(Object.assign({ where: { slug } }, one))],
    ['push campaigns', () => prisma.pushCampaign.findFirst(Object.assign({ where: { slug } }, one))],
    ['customers', () => prisma.customer.findFirst(Object.assign({ where: { slug } }, one))],
    ['customer identities', () => prisma.customerIdentity.findFirst(Object.assign({ where: { slug } }, one))],
    ['deal placements', () => prisma.dealPlacement.findFirst(Object.assign({ where: { channel: 'landing_page', targetRef: slug } }, one))],
    ['deleted page', () => prisma.supportAction.findFirst(Object.assign({ where: Object.assign({ targetId: slug }, DELETED_PAGE_MARKER) }, one))],
  ];
}

// The kinds of records still held under `slug` (empty = the address is free).
async function retainedDataFor(slug) {
  if (typeof slug !== 'string' || !slug) return [];
  const found = await Promise.all(checks(slug).map(async ([kind, q]) => ((await q()) ? kind : null)));
  return found.filter(Boolean);
}

module.exports = { retainedDataFor, DELETED_PAGE_MARKER, CHECKED_KINDS: checks('x').map(([kind]) => kind) };
