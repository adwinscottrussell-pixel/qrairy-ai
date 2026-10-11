// ============================================================
// deal.test.js — mocked-Prisma tests for the QRAIVY Deals foundation
// (Phase A1): dealService.js.
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the same pattern as
// tests/stadtpocketManagerWrite.test.js. Prisma is mocked by
// pre-seeding require.cache before the service is required, so no real
// DB or network call is ever made.
//
// No route/Clerk layer exists yet for Deals in this phase, so these
// tests call dealService's exported functions directly with the owner's
// user id -- the value requireAuth would supply -- rather than going
// through HTTP handlers.
//
// $transaction is mocked with real rollback semantics (snapshot before
// the callback, restore on throw), so the publish atomicity tests are
// exercising real transactional behavior.
//
// Run: node tests/deal.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');

const prismaClientPath = require.resolve(path.join(__dirname, '..', 'src', 'utils', 'prismaClient.js'));

// ── Fixture data ─────────────────────────────────────────────────
const ANNA = 'user_anna';
const BEN = 'user_ben';
const ANNA_BUSINESS = 'biz_anna';
const BEN_BUSINESS = 'biz_ben';
const SHARED_BUSINESS = 'biz_shared';

let dealRows = [];
let placementRows = [];
let landingPageRows = [];
let businessRows = [];
let businessMemberRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }

function resetFixtures() {
  dealRows = [];
  placementRows = [];
  landingPageRows = [
    { id: 'lp_1', slug: 'anna-cafe', userId: ANNA },
    { id: 'lp_2', slug: 'anna-cafe-north', userId: ANNA },
    { id: 'lp_3', slug: 'ben-bikes', userId: BEN },
    { id: 'lp_4', slug: 'orphan-page', userId: null },
  ];
  businessRows = [
    { id: ANNA_BUSINESS, primaryOwnerUserId: ANNA },
    { id: BEN_BUSINESS, primaryOwnerUserId: BEN },
    { id: SHARED_BUSINESS, primaryOwnerUserId: BEN },
  ];
  businessMemberRows = [
    { businessId: SHARED_BUSINESS, userId: ANNA, role: 'owner' },
    { businessId: BEN_BUSINESS, userId: ANNA, role: 'staff' },
  ];
  idSeq = 100;
}

function cloneRows(rows) { return rows.map((r) => ({ ...r })); }

// ── Mock Prisma ──────────────────────────────────────────────────
const mockPrisma = {
  deal: {
    findUnique: async ({ where }) => {
      const row = dealRows.find((d) => d.id === where.id);
      return row ? { ...row } : null;
    },
    findMany: async ({ where }) => {
      let rows = dealRows;
      if (where && where.ownerUserId) rows = rows.filter((d) => d.ownerUserId === where.ownerUserId);
      if (where && where.status) rows = rows.filter((d) => d.status === where.status);
      return cloneRows(rows);
    },
    create: async ({ data }) => {
      const row = {
        id: nextId('deal'),
        description: null, offerType: null, offerDetails: null, image: null,
        startsAt: null, endsAt: null, publishedAt: null, draftData: null, businessId: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      dealRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = dealRows.find((d) => d.id === where.id);
      if (!row) throw new Error('deal not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    // Mirrors DealPlacement.dealId's ON DELETE CASCADE.
    delete: async ({ where }) => {
      const idx = dealRows.findIndex((d) => d.id === where.id);
      if (idx === -1) throw new Error('deal not found in mock');
      const [row] = dealRows.splice(idx, 1);
      placementRows = placementRows.filter((p) => p.dealId !== row.id);
      return { ...row };
    },
  },
  dealPlacement: {
    findUnique: async ({ where }) => {
      let row;
      if (where.id) row = placementRows.find((p) => p.id === where.id);
      else {
        const k = where.dealId_channel_targetRef;
        row = placementRows.find((p) => p.dealId === k.dealId && p.channel === k.channel && p.targetRef === k.targetRef);
      }
      return row ? { ...row } : null;
    },
    findMany: async ({ where }) => cloneRows(placementRows.filter((p) => p.dealId === where.dealId)),
    create: async ({ data }) => {
      const row = { id: nextId('placement'), publishedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      placementRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = placementRows.find((p) => p.id === where.id);
      if (!row) throw new Error('placement not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  },
  landingPage: {
    findUnique: async ({ where }) => landingPageRows.find((p) => p.slug === where.slug) || null,
  },
  business: {
    findUnique: async ({ where }) => businessRows.find((b) => b.id === where.id) || null,
  },
  businessMember: {
    findUnique: async ({ where }) => {
      const k = where.businessId_userId;
      return businessMemberRows.find((m) => m.businessId === k.businessId && m.userId === k.userId) || null;
    },
  },
  $transaction: async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const dealSnapshot = cloneRows(dealRows);
    const placementSnapshot = cloneRows(placementRows);
    try {
      return await arg(mockPrisma);
    } catch (err) {
      dealRows = dealSnapshot;
      placementRows = placementSnapshot;
      throw err;
    }
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// isTrustedDealImage reads this at call time, not at require time.
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';

const service = require('../src/services/dealService');

const TRUSTED_IMAGE = { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/qraivy-deals/deal1-abcd.jpg', publicId: 'qraivy-deals/deal1-abcd' };
const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const FAR_FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function throwsAsync(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

function throwsSync(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

async function newDeal(owner = ANNA, extra = {}) {
  return service.createDealDraft(owner, { title: 'Free Coffee Friday', offerText: 'Buy one, get one free', ...extra });
}

// ── A. Create draft ────────────────────────────────────────────
test('A. create requires title and offerText', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.createDealDraft(ANNA, { title: 'x' }));
  assert.ok(err instanceof service.DealError);
  assert.match(err.message, /offerText/);
  assert.equal(dealRows.length, 0);
});

test('A. create succeeds with minimum fields: draft, owned and created by the caller', async () => {
  resetFixtures();
  const state = await newDeal();
  assert.equal(state.status, 'draft');
  assert.equal(state.title, 'Free Coffee Friday');
  assert.equal(state.publishedAt, null);
  assert.equal(state.businessId, null);
  assert.equal(state.isExpired, false);
  assert.equal(dealRows[0].ownerUserId, ANNA);
  assert.equal(dealRows[0].createdBy, ANNA);
});

test('A. create ignores a caller-supplied status / owner (rejected as unexpected fields)', async () => {
  resetFixtures();
  for (const extra of [{ status: 'published' }, { ownerUserId: BEN }, { createdBy: BEN }, { image: TRUSTED_IMAGE }, { offerDetails: { percentOff: 10 } }]) {
    const err = await throwsAsync(() => newDeal(ANNA, extra));
    assert.ok(err instanceof service.DealError, JSON.stringify(extra));
    assert.match(err.message, /Unexpected field/);
  }
  assert.equal(dealRows.length, 0);
});

test('A. create without an authenticated owner is 401', async () => {
  resetFixtures();
  for (const owner of [undefined, null, '', '   ']) {
    const err = await throwsAsync(() => service.createDealDraft(owner, { title: 'x', offerText: 'y' }));
    assert.equal(err.status, 401, String(owner));
  }
});

test('A. create rejects endsAt on or before startsAt', async () => {
  resetFixtures();
  const err = await throwsAsync(() => newDeal(ANNA, { startsAt: FAR_FUTURE, endsAt: FUTURE }));
  assert.match(err.message, /endsAt must be after startsAt/);
});

test('A. create accepts a business the caller owns (primary owner or owner member)', async () => {
  resetFixtures();
  const a = await newDeal(ANNA, { businessId: ANNA_BUSINESS });
  assert.equal(a.businessId, ANNA_BUSINESS);
  const b = await newDeal(ANNA, { businessId: SHARED_BUSINESS });
  assert.equal(b.businessId, SHARED_BUSINESS);
});

test('A. create rejects a business the caller does not own, a staff-only membership, and an unknown one -- all 404', async () => {
  resetFixtures();
  for (const businessId of [BEN_BUSINESS, 'biz_missing']) {
    const err = await throwsAsync(() => newDeal(ANNA, { businessId }));
    assert.equal(err.status, 404, businessId);
    assert.equal(err.message, 'Business not found.');
  }
  assert.equal(dealRows.length, 0);
});

// ── B. Owner scoping ───────────────────────────────────────────
test('B. another account cannot read, edit, publish, archive or delete a deal -- always 404', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA);
  const attempts = [
    () => service.getDealState(BEN, deal.dealId),
    () => service.saveDealDraft(BEN, deal.dealId, { title: 'hijacked' }),
    () => service.publishDeal(BEN, deal.dealId),
    () => service.archiveDeal(BEN, deal.dealId),
    () => service.deleteDeal(BEN, deal.dealId),
    () => service.listDealPlacements(BEN, deal.dealId),
    () => service.addDealPlacement(BEN, deal.dealId, { channel: 'landing_page', targetRef: 'ben-bikes' }),
  ];
  for (const attempt of attempts) {
    const err = await throwsAsync(attempt);
    assert.ok(err instanceof service.DealError);
    assert.equal(err.status, 404);
    assert.equal(err.message, 'Deal not found.');
  }
  assert.equal(dealRows[0].title, 'Free Coffee Friday');
  assert.equal(dealRows[0].status, 'draft');
});

test('B. an unknown or malformed deal id is 404, never a crash', async () => {
  resetFixtures();
  for (const id of ['deal_missing', '', null, undefined, 42]) {
    const err = await throwsAsync(() => service.getDealState(ANNA, id));
    assert.equal(err.status, 404);
  }
});

test('B. list returns only the caller\'s deals, optionally by status', async () => {
  resetFixtures();
  const a1 = await newDeal(ANNA);
  await newDeal(ANNA, { title: 'Second' });
  await newDeal(BEN, { title: 'Ben deal' });
  await service.publishDeal(ANNA, a1.dealId);

  const all = await service.listDeals(ANNA);
  assert.equal(all.length, 2);
  assert.ok(all.every((d) => d.title !== 'Ben deal'));
  const published = await service.listDeals(ANNA, { status: 'published' });
  assert.deepEqual(published.map((d) => d.dealId), [a1.dealId]);
  const err = await throwsAsync(() => service.listDeals(ANNA, { status: 'live' }));
  assert.match(err.message, /status must be one of/);
});

// ── C. Six offer types ─────────────────────────────────────────
test('C. exactly six offer types are accepted', () => {
  assert.deepEqual(service.OFFER_TYPES, ['percentage_discount', 'two_for_one', 'fixed_price', 'free_bonus', 'upgrade', 'custom']);
  for (const t of service.OFFER_TYPES) assert.equal(service.checkOfferType(t), t);
  assert.equal(service.checkOfferType(null), null);
  for (const bad of ['bogo', '', 5, undefined, {}]) {
    assert.ok(throwsSync(() => service.checkOfferType(bad)) instanceof service.DealError);
  }
});

test('C. percentage_discount: percentOff required, 1-100, numeric strings coerced', () => {
  assert.deepEqual(service.checkOfferDetails('percentage_discount', { percentOff: '20' }), { percentOff: 20 });
  assert.deepEqual(service.checkOfferDetails('percentage_discount', { percentOff: 100 }), { percentOff: 100 });
  for (const bad of [{}, { percentOff: 0 }, { percentOff: 101 }, { percentOff: 'abc' }, { percentOff: 20, price: 5 }]) {
    assert.ok(throwsSync(() => service.checkOfferDetails('percentage_discount', bad)) instanceof service.DealError, JSON.stringify(bad));
  }
});

test('C. two_for_one: buyQty and freeQty both required, each at least 1', () => {
  assert.deepEqual(service.checkOfferDetails('two_for_one', { buyQty: 1, freeQty: 1 }), { buyQty: 1, freeQty: 1 });
  for (const bad of [{ buyQty: 1 }, { freeQty: 1 }, { buyQty: 0, freeQty: 1 }, { buyQty: 1, freeQty: 0 }, { buyQty: 1, freeQty: 1, x: 1 }]) {
    assert.ok(throwsSync(() => service.checkOfferDetails('two_for_one', bad)) instanceof service.DealError, JSON.stringify(bad));
  }
});

test('C. fixed_price: price required and positive; currency defaults to EUR, must be a 3-letter code', () => {
  assert.deepEqual(service.checkOfferDetails('fixed_price', { price: '5.90' }), { price: 5.9, currency: 'EUR' });
  assert.deepEqual(service.checkOfferDetails('fixed_price', { price: 5, currency: 'USD' }), { price: 5, currency: 'USD' });
  for (const bad of [{}, { price: 0 }, { price: -1 }, { price: 5, currency: 'usd' }, { price: 5, currency: 'EURO' }, { price: 5, percentOff: 10 }]) {
    assert.ok(throwsSync(() => service.checkOfferDetails('fixed_price', bad)) instanceof service.DealError, JSON.stringify(bad));
  }
});

test('C. free_bonus: both fields optional, trimmed, blank strings rejected', () => {
  assert.deepEqual(service.checkOfferDetails('free_bonus', {}), { freeItem: null, minPurchase: null });
  assert.deepEqual(service.checkOfferDetails('free_bonus', { freeItem: ' 1 coffee ', minPurchase: 'from 10' }), { freeItem: '1 coffee', minPurchase: 'from 10' });
  for (const bad of [{ freeItem: '  ' }, { freeItem: 3 }, { freeItem: 'x', price: 1 }]) {
    assert.ok(throwsSync(() => service.checkOfferDetails('free_bonus', bad)) instanceof service.DealError, JSON.stringify(bad));
  }
});

test('C. upgrade: fromLabel/toLabel optional, unknown keys rejected', () => {
  assert.deepEqual(service.checkOfferDetails('upgrade', { fromLabel: 'Standard', toLabel: 'Premium' }), { fromLabel: 'Standard', toLabel: 'Premium' });
  assert.deepEqual(service.checkOfferDetails('upgrade', {}), { fromLabel: null, toLabel: null });
  assert.ok(throwsSync(() => service.checkOfferDetails('upgrade', { toLabel: 'x', freeItem: 'y' })) instanceof service.DealError);
});

test('C. custom never takes offerDetails; details without or with an invalid type are rejected', () => {
  assert.match(throwsSync(() => service.checkOfferDetails('custom', {})).message, /not supported/);
  assert.match(throwsSync(() => service.checkOfferDetails(null, { percentOff: 10 })).message, /requires an offerType/);
  assert.match(throwsSync(() => service.checkOfferDetails('bogo', { percentOff: 10 })).message, /valid offerType/);
  assert.ok(throwsSync(() => service.checkOfferDetails('upgrade', [])) instanceof service.DealError);
  assert.equal(service.checkOfferDetails('custom', null), null);
});

// ── D. Save draft ──────────────────────────────────────────────
test('D. save-draft stores edits in draftData only; live columns stay untouched', async () => {
  resetFixtures();
  const deal = await newDeal();
  const state = await service.saveDealDraft(ANNA, deal.dealId, { title: 'New title', description: 'Fridays only' });
  assert.equal(state.title, 'New title');
  assert.equal(state.description, 'Fridays only');
  assert.equal(state.hasUnpublishedChanges, true);
  assert.equal(dealRows[0].title, 'Free Coffee Friday');
  assert.equal(dealRows[0].description, null);
  assert.deepEqual(dealRows[0].draftData, { title: 'New title', description: 'Fridays only' });
});

test('D. save-draft is a partial update: untouched keys keep their earlier draft value', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.saveDealDraft(ANNA, deal.dealId, { title: 'T2' });
  const state = await service.saveDealDraft(ANNA, deal.dealId, { offerText: 'O2' });
  assert.equal(state.title, 'T2');
  assert.equal(state.offerText, 'O2');
});

test('D. save-draft rejects unknown fields, including status, owner and business', async () => {
  resetFixtures();
  const deal = await newDeal();
  for (const body of [{ status: 'published' }, { ownerUserId: BEN }, { businessId: BEN_BUSINESS }, { publishedAt: FUTURE }, { draftData: {} }]) {
    const err = await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, body));
    assert.match(err.message, /Unexpected field/, JSON.stringify(body));
  }
  assert.equal(dealRows[0].draftData, null);
});

test('D. save-draft rejects blank title/offerText; null clears description', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA, { description: 'Old' });
  assert.ok(await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, { title: '  ' })));
  assert.ok(await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, { offerText: null })));
  const state = await service.saveDealDraft(ANNA, deal.dealId, { description: null });
  assert.equal(state.description, null);
});

test('D. offerDetails can be sent alone once a type is set, validated against the effective type', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA, { offerType: 'percentage_discount' });
  const state = await service.saveDealDraft(ANNA, deal.dealId, { offerDetails: { percentOff: 15 } });
  assert.deepEqual(state.offerDetails, { percentOff: 15 });
  const err = await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, { offerDetails: { price: 5 } }));
  assert.match(err.message, /Unexpected offerDetails field/);
});

test('D. changing offerType without resending offerDetails clears the old details', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA, { offerType: 'percentage_discount' });
  await service.saveDealDraft(ANNA, deal.dealId, { offerDetails: { percentOff: 15 } });
  const state = await service.saveDealDraft(ANNA, deal.dealId, { offerType: 'fixed_price' });
  assert.equal(state.offerType, 'fixed_price');
  assert.equal(state.offerDetails, null);
});

test('D. save-draft checks date order against the merged state, including dates round-tripped as strings', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.saveDealDraft(ANNA, deal.dealId, { endsAt: FUTURE });
  // Simulate the real Json round-trip: a Date in draftData comes back as an ISO string.
  dealRows[0].draftData = JSON.parse(JSON.stringify(dealRows[0].draftData));
  const err = await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, { startsAt: FAR_FUTURE }));
  assert.match(err.message, /endsAt must be after startsAt/);
  const state = await service.getDealState(ANNA, deal.dealId);
  assert.ok(state.endsAt instanceof Date);
  assert.equal(state.startsAt, null);
});

test('D. invalid dates are rejected; null clears a date', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA, { endsAt: FUTURE });
  assert.match((await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, { endsAt: 'not-a-date' }))).message, /valid date/);
  assert.match((await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, { startsAt: 12345 }))).message, /ISO date string/);
  const state = await service.saveDealDraft(ANNA, deal.dealId, { endsAt: null });
  assert.equal(state.endsAt, null);
});

test('D. an archived deal can no longer be edited', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.archiveDeal(ANNA, deal.dealId);
  const err = await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, { title: 'x' }));
  assert.match(err.message, /archived/);
});

// ── E. Image metadata ──────────────────────────────────────────
test('E. a trusted image is normalized to metadata only', async () => {
  resetFixtures();
  const deal = await newDeal();
  const state = await service.saveDealDraft(ANNA, deal.dealId, { image: { ...TRUSTED_IMAGE, width: '1200', height: 900, source: 'uploaded' } });
  assert.deepEqual(state.image, { ...TRUSTED_IMAGE, width: 1200, height: 900, source: 'uploaded', starterId: null });
  const cleared = await service.saveDealDraft(ANNA, deal.dealId, { image: null });
  assert.equal(cleared.image, null);
});

test('E. images from another host, another cloud, or with a mismatched publicId are rejected', () => {
  const bad = [
    { url: 'https://evil.example.com/x.jpg', publicId: 'x' },
    { url: 'https://res.cloudinary.com/other-cloud/image/upload/v1/qraivy-deals/a.jpg', publicId: 'qraivy-deals/a' },
    { url: 'http://res.cloudinary.com/test-cloud/image/upload/v1/qraivy-deals/a.jpg', publicId: 'qraivy-deals/a' },
    { url: TRUSTED_IMAGE.url, publicId: 'qraivy-deals/something-else' },
    { url: TRUSTED_IMAGE.url },
    'https://res.cloudinary.com/test-cloud/image/upload/v1/a.jpg',
    [],
  ];
  for (const image of bad) {
    assert.ok(throwsSync(() => service.checkDealImage(image)) instanceof service.DealError, JSON.stringify(image));
  }
});

test('E. image width/height/source/starterId are validated; nothing is trusted without a configured cloud', () => {
  for (const extra of [{ width: 0 }, { height: -5 }, { width: 'wide' }, { source: 'stock' }, { starterId: '  ' }]) {
    assert.ok(throwsSync(() => service.checkDealImage({ ...TRUSTED_IMAGE, ...extra })) instanceof service.DealError, JSON.stringify(extra));
  }
  const prev = process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  try {
    assert.equal(service.isTrustedDealImage(TRUSTED_IMAGE.url, TRUSTED_IMAGE.publicId), false);
  } finally {
    process.env.CLOUDINARY_CLOUD_NAME = prev;
  }
});

// ── F. Publish ─────────────────────────────────────────────────
test('F. publish promotes the draft into the live columns, sets publishedAt and clears draftData', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA, { offerType: 'percentage_discount' });
  await service.saveDealDraft(ANNA, deal.dealId, { title: 'Live title', offerDetails: { percentOff: 20 }, image: TRUSTED_IMAGE, endsAt: FUTURE });
  dealRows[0].draftData = JSON.parse(JSON.stringify(dealRows[0].draftData));

  const state = await service.publishDeal(ANNA, deal.dealId);
  assert.equal(state.status, 'published');
  assert.ok(state.publishedAt instanceof Date);
  assert.equal(state.hasUnpublishedChanges, false);
  const row = dealRows[0];
  assert.equal(row.title, 'Live title');
  assert.deepEqual(row.offerDetails, { percentOff: 20 });
  assert.equal(row.image.publicId, TRUSTED_IMAGE.publicId);
  assert.ok(row.endsAt instanceof Date);
  assert.equal(row.draftData, null);
});

test('F. edits after publish stay in the draft until published again; publishedAt moves forward', async () => {
  resetFixtures();
  const deal = await newDeal();
  const first = await service.publishDeal(ANNA, deal.dealId);
  await service.saveDealDraft(ANNA, deal.dealId, { title: 'Edited' });
  assert.equal(dealRows[0].title, 'Free Coffee Friday');
  assert.equal(dealRows[0].status, 'published');
  await new Promise((r) => setTimeout(r, 5));
  const second = await service.publishDeal(ANNA, deal.dealId);
  assert.equal(dealRows[0].title, 'Edited');
  assert.ok(second.publishedAt.getTime() > first.publishedAt.getTime());
});

test('F. publish re-validates the merged state and rolls back completely on failure', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA, { offerType: 'percentage_discount' });
  // A draft that could only exist if validation were bypassed.
  dealRows[0].draftData = { title: 'Should not go live', offerDetails: { percentOff: 500 } };
  const err = await throwsAsync(() => service.publishDeal(ANNA, deal.dealId));
  assert.match(err.message, /at most 100/);
  assert.equal(dealRows[0].status, 'draft');
  assert.equal(dealRows[0].title, 'Free Coffee Friday');
  assert.equal(dealRows[0].publishedAt, null);
  assert.deepEqual(dealRows[0].draftData, { title: 'Should not go live', offerDetails: { percentOff: 500 } });
});

test('F. publish refuses an untrusted image, a past endsAt and an archived deal', async () => {
  resetFixtures();
  const a = await newDeal();
  dealRows[0].draftData = { image: { url: 'https://evil.example.com/x.jpg', publicId: 'x' } };
  assert.match((await throwsAsync(() => service.publishDeal(ANNA, a.dealId))).message, /recognized/);

  const b = await newDeal(ANNA, { endsAt: PAST });
  assert.match((await throwsAsync(() => service.publishDeal(ANNA, b.dealId))).message, /in the past/);

  const c = await newDeal();
  await service.archiveDeal(ANNA, c.dealId);
  assert.match((await throwsAsync(() => service.publishDeal(ANNA, c.dealId))).message, /archived/);
  assert.ok(dealRows.every((d) => d.status !== 'published'));
});

test('F. isExpired is computed from endsAt, never stored', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA, { endsAt: FUTURE });
  await service.publishDeal(ANNA, deal.dealId);
  dealRows[0].endsAt = new Date(Date.now() - 1000);
  const state = await service.getDealState(ANNA, deal.dealId);
  assert.equal(state.isExpired, true);
  assert.equal(state.status, 'published');
  assert.equal('isExpired' in dealRows[0], false);
});

// ── G. Archive / delete ────────────────────────────────────────
test('G. archive works from draft and from published, and is terminal', async () => {
  resetFixtures();
  const a = await newDeal();
  assert.equal((await service.archiveDeal(ANNA, a.dealId)).status, 'archived');
  const b = await newDeal();
  await service.publishDeal(ANNA, b.dealId);
  const archived = await service.archiveDeal(ANNA, b.dealId);
  assert.equal(archived.status, 'archived');
  assert.ok(archived.publishedAt instanceof Date);
  assert.match((await throwsAsync(() => service.archiveDeal(ANNA, b.dealId))).message, /already archived/);
});

test('G. delete removes the deal and its placements, and only that deal', async () => {
  resetFixtures();
  const a = await newDeal();
  const b = await newDeal(ANNA, { title: 'Keep me' });
  await service.addDealPlacement(ANNA, a.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.addDealPlacement(ANNA, b.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  const result = await service.deleteDeal(ANNA, a.dealId);
  assert.deepEqual(result, { deleted: true, dealId: a.dealId });
  assert.deepEqual(dealRows.map((d) => d.id), [b.dealId]);
  assert.deepEqual(placementRows.map((p) => p.dealId), [b.dealId]);
  assert.equal((await throwsAsync(() => service.getDealState(ANNA, a.dealId))).status, 404);
});

// ── H. Placements (create once, distribute everywhere) ─────────
test('H. one deal can be placed on several of the owner\'s landing pages without being copied', async () => {
  resetFixtures();
  const deal = await newDeal();
  const p1 = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  const p2 = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: ' anna-cafe-north ' });
  assert.equal(p1.status, 'draft');
  assert.equal(p1.publishedAt, null);
  assert.equal(p2.targetRef, 'anna-cafe-north');
  assert.equal(dealRows.length, 1);
  const list = await service.listDealPlacements(ANNA, deal.dealId);
  assert.deepEqual(list.map((p) => p.targetRef), ['anna-cafe', 'anna-cafe-north']);
  assert.ok(list.every((p) => p.dealId === deal.dealId));
});

test('H. the same target twice is a 409, not a second row', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  const err = await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' }));
  assert.equal(err.status, 409);
  assert.equal(placementRows.length, 1);
});

test('H. a deal cannot be placed on another account\'s page, an ownerless page or a missing page -- all 404', async () => {
  resetFixtures();
  const deal = await newDeal();
  for (const targetRef of ['ben-bikes', 'orphan-page', 'no-such-page']) {
    const err = await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef }));
    assert.equal(err.status, 404, targetRef);
    assert.equal(err.message, 'Landing page not found.');
  }
  assert.equal(placementRows.length, 0);
});

test('H. only built channels are accepted; payload is validated', async () => {
  resetFixtures();
  const deal = await newDeal();
  assert.deepEqual(service.DEAL_PLACEMENT_CHANNELS, ['landing_page']);
  for (const body of [
    { channel: 'push', targetRef: 'anna-cafe' },
    { channel: 'wallet', targetRef: 'anna-cafe' },
    { targetRef: 'anna-cafe' },
    { channel: 'landing_page' },
    { channel: 'landing_page', targetRef: '  ' },
    { channel: 'landing_page', targetRef: 'anna-cafe', status: 'published' },
  ]) {
    const err = await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, body));
    assert.ok(err instanceof service.DealError, JSON.stringify(body));
    assert.equal(err.status, 400, JSON.stringify(body));
  }
  assert.equal(placementRows.length, 0);
});

test('H. a placement can only be published once its deal is published', async () => {
  resetFixtures();
  const deal = await newDeal();
  const placement = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  const err = await throwsAsync(() => service.publishDealPlacement(ANNA, deal.dealId, placement.placementId));
  assert.match(err.message, /Publish the deal/);
  assert.equal(placementRows[0].status, 'draft');

  await service.publishDeal(ANNA, deal.dealId);
  const published = await service.publishDealPlacement(ANNA, deal.dealId, placement.placementId);
  assert.equal(published.status, 'published');
  assert.ok(published.publishedAt instanceof Date);
});

test('H. publishing a placement re-checks that the page still belongs to the owner', async () => {
  resetFixtures();
  const deal = await newDeal();
  const placement = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.publishDeal(ANNA, deal.dealId);
  landingPageRows.find((p) => p.slug === 'anna-cafe').userId = BEN;
  const err = await throwsAsync(() => service.publishDealPlacement(ANNA, deal.dealId, placement.placementId));
  assert.equal(err.status, 404);
  assert.equal(placementRows[0].status, 'draft');
  assert.equal(placementRows[0].publishedAt, null);
});

test('H. a placement id from another deal, or another account, is never honored', async () => {
  resetFixtures();
  const a = await newDeal();
  const b = await newDeal(ANNA, { title: 'Other' });
  const pa = await service.addDealPlacement(ANNA, a.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.publishDeal(ANNA, a.dealId);
  await service.publishDeal(ANNA, b.dealId);
  for (const attempt of [
    () => service.publishDealPlacement(ANNA, b.dealId, pa.placementId),
    () => service.archiveDealPlacement(ANNA, b.dealId, pa.placementId),
    () => service.publishDealPlacement(BEN, a.dealId, pa.placementId),
    () => service.archiveDealPlacement(ANNA, a.dealId, 'placement_missing'),
  ]) {
    assert.equal((await throwsAsync(attempt)).status, 404);
  }
  assert.equal(placementRows[0].status, 'draft');
});

test('H. placement archive is terminal; an archived deal accepts no new placements', async () => {
  resetFixtures();
  const deal = await newDeal();
  const placement = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.publishDeal(ANNA, deal.dealId);
  assert.equal((await service.archiveDealPlacement(ANNA, deal.dealId, placement.placementId)).status, 'archived');
  assert.match((await throwsAsync(() => service.archiveDealPlacement(ANNA, deal.dealId, placement.placementId))).message, /already archived/);
  assert.match((await throwsAsync(() => service.publishDealPlacement(ANNA, deal.dealId, placement.placementId))).message, /archived placement/);

  await service.archiveDeal(ANNA, deal.dealId);
  const err = await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe-north' }));
  assert.match(err.message, /archived deal/);
});

// ── I. Schema / migration / isolation guards ───────────────────
test('I. schema defines Deal and DealPlacement with the fields the service writes', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const block = (name) => {
    const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
    assert.ok(m, `model ${name} missing`);
    return m[0];
  };
  const deal = block('Deal');
  for (const field of ['ownerUserId', 'businessId', 'title', 'description', 'offerText', 'offerType', 'offerDetails', 'image', 'status', 'startsAt', 'endsAt', 'publishedAt', 'draftData', 'createdBy']) {
    assert.match(deal, new RegExp(`\\n\\s+${field}\\s`), `Deal.${field}`);
  }
  assert.doesNotMatch(deal, /landingPageSlug|listingLocationId/);
  const placement = block('DealPlacement');
  for (const field of ['dealId', 'channel', 'targetRef', 'status', 'publishedAt']) {
    assert.match(placement, new RegExp(`\\n\\s+${field}\\s`), `DealPlacement.${field}`);
  }
  assert.match(placement, /@@unique\(\[dealId, channel, targetRef\]\)/);
  assert.match(placement, /onDelete: Cascade/);
});

test('I. the migration is additive only: two new tables, nothing altered or dropped elsewhere', () => {
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  const name = fs.readdirSync(dir).find((d) => d.endsWith('_add_deal_and_deal_placement'));
  assert.ok(name, 'migration folder missing');
  const sql = fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
  assert.deepEqual(sql.match(/CREATE TABLE "(\w+)"/g), ['CREATE TABLE "Deal"', 'CREATE TABLE "DealPlacement"']);
  // Statement-level check: 'ON DELETE' / 'ON UPDATE' inside a foreign key are not statements.
  assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
  const altered = [...sql.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(altered.sort(), ['Deal', 'DealPlacement']);
  assert.doesNotMatch(sql, /DealClaim|landingPageSlug/);
});

test('I. dealService has no StadtPocket dependency', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'dealService.js'), 'utf8');
  assert.deepEqual([...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]), ['../utils/prismaClient']);
  assert.doesNotMatch(src, /prisma\.stadtPocket|tx\.stadtPocket|listingLocationId/);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
