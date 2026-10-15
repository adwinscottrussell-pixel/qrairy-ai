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
  afterNextRead = null;
  committedByOthers = [];
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
// Prisma-style where: plain equality, or { not: v } / { in: [...] } per field.
function matches(row, where) {
  return Object.keys(where).every((k) => {
    const c = where[k];
    if (c && typeof c === 'object' && !(c instanceof Date)) {
      if ('not' in c) return row[k] !== c.not;
      if ('in' in c) return c.in.includes(row[k]);
    }
    return row[k] === c;
  });
}
// Simulates another request that commits between this request's read and its write.
// afterNextRead = { table: 'deal' | 'dealPlacement', fn(row) }: runs once, right after that read.
// fn is "another request" that commits: it is applied at once and survives this
// request's own rollback (re-applied after the mock transaction restores its snapshot).
let afterNextRead = null;
let committedByOthers = [];
function readThen(table, row) {
  if (row && afterNextRead && afterNextRead.table === table) {
    const { fn } = afterNextRead; afterNextRead = null;
    const commit = () => fn(row);
    commit(); committedByOthers.push(commit);
  }
  return row;
}

// ── Mock Prisma ──────────────────────────────────────────────────
const mockPrisma = {
  deal: {
    findUnique: async ({ where }) => {
      const row = dealRows.find((d) => d.id === where.id);
      return readThen('deal', row ? { ...row } : null);
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
    updateMany: async ({ where, data }) => {
      const rows = dealRows.filter((d) => matches(d, where));
      rows.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
      return { count: rows.length };
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
      return readThen('dealPlacement', row ? { ...row } : null);
    },
    // equality filters on any field; orderBy publishedAt desc; take (as Prisma does)
    findMany: async ({ where = {}, orderBy, take } = {}) => {
      let rows = placementRows.filter((p) => Object.keys(where).every((k) => p[k] === where[k]));
      if (orderBy && orderBy.publishedAt === 'desc') rows = rows.slice().sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
      if (take) rows = rows.slice(0, take);
      return cloneRows(rows);
    },
    // like the real unique (dealId, channel, targetRef) key: a second row is refused with P2002
    create: async ({ data }) => {
      if (placementRows.some((p) => p.dealId === data.dealId && p.channel === data.channel && p.targetRef === data.targetRef)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      const row = { id: nextId('placement'), publishedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      placementRows.push(row);
      return { ...row };
    },
    updateMany: async ({ where, data }) => {
      const rows = placementRows.filter((p) => matches(p, where));
      rows.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
      return { count: rows.length };
    },
    update: async ({ where, data }) => {
      const row = placementRows.find((p) => p.id === where.id);
      if (!row) throw new Error('placement not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  },
  landingPage: {
    findUnique: async ({ where }) => readThen('landingPage', landingPageRows.find((p) => p.slug === where.slug) || null),
    findMany: async ({ where, select }) => landingPageRows.filter((p) => p.userId === where.userId).map((p) => {
      const full = { businessName: p.slug + ' name', status: 'live', updatedAt: new Date(0), ...p };
      return select ? Object.fromEntries(Object.keys(select).map((k) => [k, full[k]])) : full;
    }),
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
    committedByOthers = [];
    try {
      return await arg(mockPrisma);
    } catch (err) {
      dealRows = dealSnapshot;
      placementRows = placementSnapshot;
      committedByOthers.forEach((commit) => commit());
      throw err;
    }
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// isTrustedDealImage reads this at call time, not at require time.
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';

const service = require('../src/services/dealService');

// Attaching a NEW uploaded picture is the upload handler's job; these service tests stand in for it.
const UPLOAD = { allowNewUpload: true };
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
  const state = await service.saveDealDraft(ANNA, deal.dealId, { image: { ...TRUSTED_IMAGE, width: '1200', height: 900, source: 'uploaded' } }, UPLOAD);
  assert.deepEqual(state.image, { source: 'uploaded', ...TRUSTED_IMAGE, width: 1200, height: 900 });
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

test('E. image width/height/source are validated; nothing is trusted without a configured cloud', () => {
  for (const extra of [{ width: 0 }, { height: -5 }, { width: 'wide' }, { source: 'stock' }, { source: 'ai_generated' }]) {
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

test('E. an uploaded image must sit in the deals folder, not merely on our cloud', () => {
  const elsewhere = { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/qraivy-logos/logo-x.png', publicId: 'qraivy-logos/logo-x' };
  assert.equal(service.isTrustedDealImage(elsewhere.url, elsewhere.publicId), false);
  assert.ok(throwsSync(() => service.checkDealImage(elsewhere)) instanceof service.DealError);
  assert.equal(service.isTrustedDealImage(TRUSTED_IMAGE.url, TRUSTED_IMAGE.publicId), true);
});

test('E. a starter image is stored by id, and its AI origin is stamped by the server', async () => {
  resetFixtures();
  const deal = await newDeal();
  const state = await service.saveDealDraft(ANNA, deal.dealId, { image: { source: 'starter', starterId: 'bakery-coffee-01' } });
  assert.deepEqual(state.image, { source: 'starter', starterId: 'bakery-coffee-01', aiGenerated: true });
  // A client cannot strip the disclosure, nor smuggle a URL in alongside.
  const forged = service.checkDealImage({ source: 'starter', starterId: 'travel-greece-01', aiGenerated: false, url: 'https://evil.example.com/x.jpg', publicId: 'x' });
  assert.deepEqual(forged, { source: 'starter', starterId: 'travel-greece-01', aiGenerated: true });
  for (const bad of [{ source: 'starter' }, { source: 'starter', starterId: 'no-such-image' }, { source: 'starter', starterId: 7 }]) {
    assert.ok(throwsSync(() => service.checkDealImage(bad)) instanceof service.DealError, JSON.stringify(bad));
  }
});

test('E. every catalog starter image is accepted and marked AI-generated', () => {
  const { DEAL_STARTER_IMAGES } = require('../src/data/dealImages');
  assert.equal(DEAL_STARTER_IMAGES.length, 22);
  for (const i of DEAL_STARTER_IMAGES) {
    assert.deepEqual(service.checkDealImage({ source: 'starter', starterId: i.id }), { source: 'starter', starterId: i.id, aiGenerated: true });
  }
});

test('E. a plain background is stored by id from the allow-list', () => {
  assert.deepEqual(service.checkDealImage({ source: 'background', backgroundId: 'ocean', url: 'https://evil.example.com' }), { source: 'background', backgroundId: 'ocean' });
  for (const bad of [{ source: 'background' }, { source: 'background', backgroundId: 'neon' }, { source: 'background', backgroundId: 3 }]) {
    assert.ok(throwsSync(() => service.checkDealImage(bad)) instanceof service.DealError, JSON.stringify(bad));
  }
});

test('E. starter and background images survive publish and stay as stored', async () => {
  resetFixtures();
  const a = await newDeal();
  await service.saveDealDraft(ANNA, a.dealId, { image: { source: 'starter', starterId: 'general-flower-01' } });
  dealRows[0].draftData = JSON.parse(JSON.stringify(dealRows[0].draftData));
  const published = await service.publishDeal(ANNA, a.dealId);
  assert.deepEqual(published.image, { source: 'starter', starterId: 'general-flower-01', aiGenerated: true });
  assert.deepEqual(dealRows[0].image, { source: 'starter', starterId: 'general-flower-01', aiGenerated: true });
  const b = await newDeal(ANNA, { title: 'B' });
  await service.saveDealDraft(ANNA, b.dealId, { image: { source: 'background', backgroundId: 'plum' } });
  assert.deepEqual((await service.publishDeal(ANNA, b.dealId)).image, { source: 'background', backgroundId: 'plum' });
});

// ── E2. Image masters (uploads from image Phase 1 on) ─────────────
const MASTER_PID = 'qraivy-deals/deal-m1-1700000000000';
const MASTER_IMAGE = {
  source: 'uploaded',
  url: 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1700000000/' + MASTER_PID + '.jpg',
  publicId: MASTER_PID, width: 1200, height: 900,
  master: { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1700000000/' + MASTER_PID + '.jpg', width: 4032, height: 3024 },
};

test('E2. an upload with its master is stored with the 4:3 picture and the master reference + size', async () => {
  resetFixtures();
  const deal = await newDeal();
  const state = await service.saveDealDraft(ANNA, deal.dealId, { image: { ...MASTER_IMAGE, master: { ...MASTER_IMAGE.master, width: '4032' } } }, UPLOAD);
  assert.deepEqual(state.image, MASTER_IMAGE);
  assert.deepEqual(service.checkDealImage(MASTER_IMAGE), MASTER_IMAGE);
});

test('E2. older uploads without a master keep exactly their old stored shape', () => {
  const old = service.checkDealImage({ ...TRUSTED_IMAGE, width: 1200, height: 900 });
  assert.deepEqual(old, { source: 'uploaded', ...TRUSTED_IMAGE, width: 1200, height: 900 });
  assert.ok(!('master' in old), 'no master key at all, not even null');
  assert.ok(!('master' in service.checkDealImage({ ...TRUSTED_IMAGE, master: null })));
});

test('E2. the master survives saving again and publishing', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.saveDealDraft(ANNA, deal.dealId, { image: MASTER_IMAGE }, UPLOAD);
  dealRows[0].draftData = JSON.parse(JSON.stringify(dealRows[0].draftData));
  const again = await service.saveDealDraft(ANNA, deal.dealId, { title: 'Renamed' });
  assert.deepEqual(again.image, MASTER_IMAGE, 'saving other fields keeps the image and its master');
  dealRows[0].draftData = JSON.parse(JSON.stringify(dealRows[0].draftData));
  const published = await service.publishDeal(ANNA, deal.dealId);
  assert.deepEqual(published.image, MASTER_IMAGE);
  assert.deepEqual(dealRows[0].image, MASTER_IMAGE);
});

test('E2. a master must be the plain original of the SAME trusted image', () => {
  const pid = MASTER_PID;
  const bad = [
    { url: 'https://evil.example.com/' + pid + '.jpg' },                                                       // other host
    { url: 'https://res.cloudinary.com/other-cloud/image/upload/v1/' + pid + '.jpg' },                          // other cloud
    { url: 'http://res.cloudinary.com/test-cloud/image/upload/v1/' + pid + '.jpg' },                             // not https
    { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/qraivy-deals/deal-other-1.jpg' },              // another asset
    { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/qraivy-logos/deal-m1-1700000000000.jpg' },     // another folder
    { url: 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,w_10/v1/' + pid + '.jpg' },               // a transformation, not the original
    { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/' + pid + '.jpg?x=1' },                       // extra parts
    { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/' + pid + '.svg' },                           // not an accepted image type
    { url: 'data:image/png;base64,AAAA' },
    { url: '' },
  ];
  for (const m of bad) {
    assert.ok(throwsSync(() => service.checkDealImage({ ...MASTER_IMAGE, master: { width: 4032, height: 3024, ...m } })) instanceof service.DealError, m.url);
  }
  for (const size of [{ width: 0 }, { height: -1 }, { width: 40.5 }, { width: 'abc' }, { width: 20001 }, { width: undefined }, { height: null }]) {
    assert.ok(throwsSync(() => service.checkDealImage({ ...MASTER_IMAGE, master: { ...MASTER_IMAGE.master, ...size } })) instanceof service.DealError, JSON.stringify(size));
  }
  for (const shape of ['https://x', 5, ['a'], true]) {
    assert.ok(throwsSync(() => service.checkDealImage({ ...MASTER_IMAGE, master: shape })) instanceof service.DealError, JSON.stringify(shape));
  }
  // the 4:3 picture itself is still checked exactly as before
  assert.ok(throwsSync(() => service.checkDealImage({ ...MASTER_IMAGE, url: 'https://evil.example.com/' + pid + '.jpg' })) instanceof service.DealError);
});

test('E2. only uploads carry a master: starter and background images ignore one', () => {
  assert.deepEqual(service.checkDealImage({ source: 'starter', starterId: 'bakery-croissants-01', master: MASTER_IMAGE.master }), { source: 'starter', starterId: 'bakery-croissants-01', aiGenerated: true });
  assert.deepEqual(service.checkDealImage({ source: 'background', backgroundId: 'ocean', master: MASTER_IMAGE.master }), { source: 'background', backgroundId: 'ocean' });
});

test('E2. nothing is trusted without a configured cloud, master included', () => {
  const saved = process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  try { assert.ok(throwsSync(() => service.checkDealImage(MASTER_IMAGE)) instanceof service.DealError); }
  finally { process.env.CLOUDINARY_CLOUD_NAME = saved; }
});

// ── P. Placements on landing pages (Phase 3.1) ───────────────────
async function publishedDealOn(slugs, extra = {}, owner = ANNA) {
  // image and offerDetails can only be set by saving a draft after creation
  const { image, offerDetails, ...atCreation } = extra;
  const deal = await newDeal(owner, atCreation);
  if (image !== undefined || offerDetails !== undefined) await service.saveDealDraft(owner, deal.dealId, { ...(image !== undefined ? { image } : {}), ...(offerDetails !== undefined ? { offerDetails } : {}) }, UPLOAD);
  for (const s of slugs) await service.addDealPlacement(owner, deal.dealId, { channel: 'landing_page', targetRef: s });
  await service.publishDeal(owner, deal.dealId, { includePlacements: true });
  return deal;
}
const DAY = 864e5;

test('P. publish with includePlacements publishes the deal and all its draft placements together', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe-north' });
  const state = await service.publishDeal(ANNA, deal.dealId, { includePlacements: true });
  assert.equal(state.status, 'published');
  assert.deepEqual(placementRows.map((p) => p.status), ['published', 'published']);
  assert.ok(placementRows.every((p) => p.publishedAt instanceof Date));
  assert.equal(dealRows.length, 1, 'one deal, two placements: nothing duplicated');
});

test('P. without the option (or with false) publishing is exactly as before: placements stay draft', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.publishDeal(ANNA, deal.dealId);
  assert.equal(placementRows[0].status, 'draft');
  await service.publishDeal(ANNA, deal.dealId, { includePlacements: false });
  assert.equal(placementRows[0].status, 'draft');
  const plain = await newDeal(ANNA, { title: 'No pages' });
  assert.equal((await service.publishDeal(ANNA, plain.dealId, { includePlacements: true })).status, 'published', 'no placements selected: publishes as before');
  assert.equal((await throwsAsync(() => service.publishDeal(ANNA, plain.dealId, { includePlacements: 'yes' }))).status, 400);
});

test('P. if a selected page is no longer the owner\'s, NOTHING is published (deal included)', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe-north' });
  landingPageRows.find((p) => p.slug === 'anna-cafe-north').userId = BEN;
  const err = await throwsAsync(() => service.publishDeal(ANNA, deal.dealId, { includePlacements: true }));
  assert.equal(err.status, 409);
  assert.match(err.message, /anna-cafe-north/);
  assert.equal(dealRows[0].status, 'draft', 'the deal was rolled back');
  assert.deepEqual(placementRows.map((p) => p.status), ['draft', 'draft'], 'no placement was published');
});

test('P. archived placements are not re-published; duplicates are refused', async () => {
  resetFixtures();
  const deal = await newDeal();
  const p = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  assert.equal((await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' }))).status, 409);
  await service.archiveDealPlacement(ANNA, deal.dealId, p.placementId);
  await service.publishDeal(ANNA, deal.dealId, { includePlacements: true });
  assert.equal(placementRows[0].status, 'archived');
  assert.equal((await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'ben-bikes' }))).status, 404, 'never another owner\'s page');
  assert.equal((await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'orphan-page' }))).status, 404, 'never an ownerless page');
});

test('P. activeDealsForPage: a published deal with a published placement, inside its dates', async () => {
  resetFixtures();
  await publishedDealOn(['anna-cafe'], { title: 'Coffee', offerText: '2 for 1', description: 'Today' });
  const shown = await service.activeDealsForPage('anna-cafe');
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, 'Coffee');
  assert.deepEqual(await service.activeDealsForPage('anna-cafe-north'), [], 'only on the pages it was placed on');
});

test('P. activeDealsForPage: scheduled and expired deals are not shown; they appear and disappear on time', async () => {
  resetFixtures();
  const now = Date.now();
  await publishedDealOn(['anna-cafe'], { title: 'Later', startsAt: new Date(now + 2 * DAY).toISOString(), endsAt: new Date(now + 9 * DAY).toISOString() });
  assert.deepEqual(await service.activeDealsForPage('anna-cafe', new Date(now)), [], 'scheduled');
  assert.equal((await service.activeDealsForPage('anna-cafe', new Date(now + 3 * DAY))).length, 1, 'running');
  assert.deepEqual(await service.activeDealsForPage('anna-cafe', new Date(now + 10 * DAY)), [], 'expired');
});

test('P. activeDealsForPage: draft or archived deals and draft or archived placements are not shown', async () => {
  resetFixtures();
  const a = await newDeal(ANNA, { title: 'Draft deal' });
  await service.addDealPlacement(ANNA, a.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  assert.deepEqual(await service.activeDealsForPage('anna-cafe'), [], 'draft deal, draft placement');
  await service.publishDeal(ANNA, a.dealId);
  assert.deepEqual(await service.activeDealsForPage('anna-cafe'), [], 'published deal, placement still draft');
  const b = await publishedDealOn(['anna-cafe'], { title: 'Live' });
  assert.equal((await service.activeDealsForPage('anna-cafe')).length, 1);
  await service.archiveDeal(ANNA, b.dealId);
  assert.deepEqual(await service.activeDealsForPage('anna-cafe'), [], 'archived deal');
  const c = await publishedDealOn(['anna-cafe'], { title: 'Live 2' });
  const pc = placementRows.find((p) => p.dealId === c.dealId);
  await service.archiveDealPlacement(ANNA, c.dealId, pc.placementId || pc.id);
  assert.deepEqual(await service.activeDealsForPage('anna-cafe'), [], 'archived placement');
});

test('P. activeDealsForPage: never shown when the page is no longer the deal owner\'s, is a draft, or has no owner', async () => {
  resetFixtures();
  await publishedDealOn(['anna-cafe'], { title: 'Mine' });
  landingPageRows.find((p) => p.slug === 'anna-cafe').userId = BEN;
  assert.deepEqual(await service.activeDealsForPage('anna-cafe'), [], 'page now belongs to someone else');
  landingPageRows.find((p) => p.slug === 'anna-cafe').userId = ANNA;
  landingPageRows.find((p) => p.slug === 'anna-cafe').status = 'draft';
  assert.deepEqual(await service.activeDealsForPage('anna-cafe'), [], 'draft page');
  // a placement row pointing at a page that is not the deal owner's (e.g. forged in the DB)
  placementRows.push({ id: 'p_x', dealId: dealRows[0].id, channel: 'landing_page', targetRef: 'ben-bikes', status: 'published', publishedAt: new Date() });
  assert.deepEqual(await service.activeDealsForPage('ben-bikes'), []);
  placementRows.push({ id: 'p_y', dealId: dealRows[0].id, channel: 'landing_page', targetRef: 'orphan-page', status: 'published', publishedAt: new Date() });
  assert.deepEqual(await service.activeDealsForPage('orphan-page'), []);
  for (const bad of ['', '../x', 'a b', null, 42, 'x'.repeat(200)]) assert.deepEqual(await service.activeDealsForPage(bad), [], String(bad));
  assert.deepEqual(await service.activeDealsForPage('no-such-page'), []);
});

test('P. activeDealsForPage returns customer-safe fields only', async () => {
  resetFixtures();
  const MASTER_PID2 = 'qraivy-deals/deal-pub-1';
  const img = { source: 'uploaded', url: 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1/' + MASTER_PID2 + '.jpg', publicId: MASTER_PID2, width: 1200, height: 900,
    master: { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/' + MASTER_PID2 + '.jpg', width: 4000, height: 3000 } };
  const deal = await publishedDealOn(['anna-cafe'], { title: 'Safe', offerType: 'percentage_discount', offerDetails: { percentOff: 20 }, image: img });
  // an unpublished draft change must never leak
  await service.saveDealDraft(ANNA, deal.dealId, { title: 'SECRET DRAFT TITLE' });
  const [d] = await service.activeDealsForPage('anna-cafe');
  assert.deepEqual(Object.keys(d).sort(), ['description', 'endsAt', 'image', 'offerDetails', 'offerText', 'offerType', 'startsAt', 'title']);
  assert.equal(d.title, 'Safe');
  assert.deepEqual(d.image, { source: 'uploaded', url: img.url, width: 1200, height: 900 });
  const json = JSON.stringify(d);
  for (const secret of ['SECRET DRAFT TITLE', ANNA, 'ownerUserId', 'draftData', 'businessId', 'createdBy', 'publicId', 'master', img.master.url, deal.dealId]) {
    assert.ok(!json.includes(secret), 'leaks ' + secret);
  }
});

test('P. activeDealsForPage: starter images keep their AI flag; at most three deals, newest first, each once', async () => {
  resetFixtures();
  const st = await publishedDealOn(['anna-cafe'], { title: 'Starter', image: { source: 'starter', starterId: 'bakery-croissants-01' } });
  const [d] = await service.activeDealsForPage('anna-cafe');
  assert.deepEqual(d.image, { source: 'starter', starterId: 'bakery-croissants-01', aiGenerated: true });
  for (let i = 1; i <= 4; i++) await publishedDealOn(['anna-cafe'], { title: 'D' + i });
  placementRows.forEach((p, i) => { p.publishedAt = new Date(1000 * (i + 1)); });
  const shown = await service.activeDealsForPage('anna-cafe');
  assert.equal(shown.length, service.MAX_PUBLIC_DEALS_PER_PAGE);
  assert.deepEqual(shown.map((x) => x.title), ['D4', 'D3', 'D2']);
  placementRows.push({ ...placementRows[placementRows.length - 1], id: 'dup' });
  assert.equal(new Set((await service.activeDealsForPage('anna-cafe')).map((x) => x.title)).size, 3, 'a deal is never listed twice');
  assert.ok(st);
});

test('P. listOwnerLandingPages: only the owner\'s own pages, with name and live state', async () => {
  resetFixtures();
  const pages = await service.listOwnerLandingPages(ANNA);
  assert.deepEqual(pages.map((p) => p.slug).sort(), ['anna-cafe', 'anna-cafe-north']);
  assert.deepEqual(Object.keys(pages[0]).sort(), ['live', 'name', 'slug']);
  assert.deepEqual((await service.listOwnerLandingPages(BEN)).map((p) => p.slug), ['ben-bikes']);
  assert.equal((await throwsAsync(() => service.listOwnerLandingPages(''))).status, 401);
});

// ── R. Removing and re-adding a page (reversible placements) ─────
test('R. re-adding a removed page restores the SAME placement as a draft -- no second record', async () => {
  resetFixtures();
  const deal = await publishedDealOn(['anna-cafe']);
  const id = placementRows[0].id;
  await service.archiveDealPlacement(ANNA, deal.dealId, id);
  const back = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  assert.equal(placementRows.length, 1, 'still exactly one record for this deal and page');
  assert.equal(back.placementId, id);
  assert.equal(back.status, 'draft', 'never published by itself');
  assert.equal(back.publishedAt, null);
  assert.equal(back.restored, true);
});

test('R. removed, re-added and published again: hidden until published, then shown', async () => {
  resetFixtures();
  const deal = await publishedDealOn(['anna-cafe'], { title: 'Again' });
  const id = placementRows[0].id;
  assert.equal((await service.activeDealsForPage('anna-cafe')).length, 1);
  await service.archiveDealPlacement(ANNA, deal.dealId, id);
  assert.deepEqual(await service.activeDealsForPage('anna-cafe'), [], 'removed');
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  assert.deepEqual(await service.activeDealsForPage('anna-cafe'), [], 'restored as a draft: not shown yet');
  await service.publishDealPlacement(ANNA, deal.dealId, id);
  assert.equal((await service.activeDealsForPage('anna-cafe'))[0].title, 'Again', 'shown again once published');
  // ...and through publishing the deal with its pages
  await service.archiveDealPlacement(ANNA, deal.dealId, id);
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.publishDeal(ANNA, deal.dealId, { includePlacements: true });
  assert.equal(placementRows[0].status, 'published');
});

test('R. only an archived placement is restored; a saved or published one is still a 409; archived rules stay', async () => {
  resetFixtures();
  const deal = await newDeal();
  const p = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  assert.equal((await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' }))).status, 409, 'draft');
  await service.publishDeal(ANNA, deal.dealId, { includePlacements: true });
  assert.equal((await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' }))).status, 409, 'published');
  await service.archiveDealPlacement(ANNA, deal.dealId, p.placementId);
  assert.match((await throwsAsync(() => service.archiveDealPlacement(ANNA, deal.dealId, p.placementId))).message, /already archived/);
  assert.match((await throwsAsync(() => service.publishDealPlacement(ANNA, deal.dealId, p.placementId))).message, /archived placement/, 'must be re-added before publishing');
});

test('R. restoring re-checks the owner: someone else\'s page, someone else\'s deal, an archived deal', async () => {
  resetFixtures();
  const deal = await publishedDealOn(['anna-cafe']);
  const id = placementRows[0].id;
  await service.archiveDealPlacement(ANNA, deal.dealId, id);
  landingPageRows.find((p) => p.slug === 'anna-cafe').userId = BEN;
  assert.equal((await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' }))).status, 404);
  assert.equal(placementRows[0].status, 'archived', 'stays removed');
  landingPageRows.find((p) => p.slug === 'anna-cafe').userId = ANNA;
  assert.equal((await throwsAsync(() => service.addDealPlacement(BEN, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' }))).status, 404, 'not Ben\'s deal');
  await service.archiveDeal(ANNA, deal.dealId);
  assert.equal((await throwsAsync(() => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' }))).status, 400, 'archived deal');
  assert.equal(placementRows[0].status, 'archived');
});

test('R. concurrent requests never create a second record: restores and first adds both resolve to one row', async () => {
  resetFixtures();
  const deal = await newDeal();
  const add = () => service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' }).then(() => 'ok', (e) => e.status);
  const first = await Promise.all([add(), add()]);
  assert.deepEqual(first.slice().sort(), [409, 'ok'].sort());
  assert.equal(placementRows.length, 1);
  await service.archiveDealPlacement(ANNA, deal.dealId, placementRows[0].id);
  const again = await Promise.all([add(), add()]);
  assert.deepEqual(again.slice().sort(), [409, 'ok'].sort(), 'the archived row is restored exactly once');
  assert.equal(placementRows.length, 1);
  assert.equal(placementRows[0].status, 'draft');
});

// ── F. Publish ─────────────────────────────────────────────────
test('F. publish promotes the draft into the live columns, sets publishedAt and clears draftData', async () => {
  resetFixtures();
  const deal = await newDeal(ANNA, { offerType: 'percentage_discount' });
  await service.saveDealDraft(ANNA, deal.dealId, { title: 'Live title', offerDetails: { percentOff: 20 }, image: TRUSTED_IMAGE, endsAt: FUTURE }, UPLOAD);
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

test('F. displayStatus: draft, published, scheduled, expired and archived, from the live dates only', async () => {
  resetFixtures();
  const draft = await newDeal();
  assert.equal(draft.displayStatus, 'draft');

  const live = await newDeal(ANNA, { title: 'Live' });
  assert.equal((await service.publishDeal(ANNA, live.dealId)).displayStatus, 'published');

  const scheduled = await newDeal(ANNA, { title: 'Later', startsAt: FUTURE, endsAt: FAR_FUTURE });
  assert.equal((await service.publishDeal(ANNA, scheduled.dealId)).displayStatus, 'scheduled');

  const expiring = await newDeal(ANNA, { title: 'Ending', endsAt: FUTURE });
  await service.publishDeal(ANNA, expiring.dealId);
  dealRows.find((d) => d.id === expiring.dealId).endsAt = new Date(Date.now() - 1000);
  const expired = await service.getDealState(ANNA, expiring.dealId);
  assert.equal(expired.displayStatus, 'expired');
  assert.equal(expired.status, 'published', 'the stored status is untouched');

  // A pending draft edit does not change what is live.
  await service.saveDealDraft(ANNA, live.dealId, { startsAt: FUTURE });
  const edited = await service.getDealState(ANNA, live.dealId);
  assert.equal(edited.displayStatus, 'published');
  assert.equal(edited.hasUnpublishedChanges, true);

  assert.equal((await service.archiveDeal(ANNA, scheduled.dealId)).displayStatus, 'archived');
});

test('F. text length limits are enforced on create and on save-draft', async () => {
  resetFixtures();
  assert.deepEqual(service.DEAL_TEXT_LIMITS, { title: 80, offerText: 120, description: 400, detail: 60 });
  const long = (n) => 'x'.repeat(n);
  for (const body of [{ title: long(81), offerText: 'o' }, { title: 't', offerText: long(121) }, { title: 't', offerText: 'o', description: long(401) }]) {
    const err = await throwsAsync(() => service.createDealDraft(ANNA, body));
    assert.match(err.message, /at most \d+ characters/, Object.keys(body).join(','));
  }
  assert.equal(dealRows.length, 0);
  const deal = await service.createDealDraft(ANNA, { title: long(80), offerText: long(120), description: long(400), offerType: 'free_bonus' });
  for (const body of [{ title: long(81) }, { offerText: long(121) }, { description: long(401) }, { offerDetails: { freeItem: long(61) } }]) {
    const err = await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, body));
    assert.match(err.message, /at most \d+ characters/, Object.keys(body).join(','));
  }
  assert.deepEqual((await service.saveDealDraft(ANNA, deal.dealId, { offerDetails: { freeItem: long(60) } })).offerDetails, { freeItem: long(60), minPurchase: null });
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

test('H. an archived placement stays archived until re-added; an archived deal accepts no new placements', async () => {
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
// ── S. Races: an archive committed by another request is never overwritten ──
// The other request runs right after this request's read (afterNextRead) and
// commits; PostgreSQL behaves the same way under READ COMMITTED (verified on a
// real database: conditional UPDATE re-checks the committed row).
const archiveDealRow = (id) => () => { dealRows.find((d) => d.id === id).status = 'archived'; };
const setPlacementStatus = (slug, status) => () => { placementRows.find((p) => p.targetRef === slug).status = status; };

test('S. deal archived while publish is running: 409, the deal stays archived, no placement goes live', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  afterNextRead = { table: 'deal', fn: archiveDealRow(deal.dealId) };
  const err = await throwsAsync(() => service.publishDeal(ANNA, deal.dealId, { includePlacements: true }));
  assert.equal(err && err.status, 409);
  assert.match(err.message, /archived or deleted while it was being published/);
  assert.equal(dealRows[0].status, 'archived');
  assert.equal(dealRows[0].publishedAt, null);
  assert.equal(placementRows[0].status, 'draft');
});

test('S. deal deleted while publish is running: a clear 409, not a server error', async () => {
  resetFixtures();
  const deal = await newDeal();
  afterNextRead = { table: 'deal', fn: () => { dealRows = dealRows.filter((d) => d.id !== deal.dealId); } };
  const err = await throwsAsync(() => service.publishDeal(ANNA, deal.dealId));
  assert.equal(err && err.status, 409);
  assert.equal(dealRows.length, 0);
});

test('S. page removed from the deal while publish(includePlacements) is running: 409 and nothing is published', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe-north' });
  afterNextRead = { table: 'landingPage', fn: setPlacementStatus('anna-cafe', 'archived') };
  const err = await throwsAsync(() => service.publishDeal(ANNA, deal.dealId, { includePlacements: true }));
  assert.equal(err && err.status, 409);
  assert.match(err.message, /removed from this deal while it was being published: anna-cafe/);
  assert.equal(dealRows[0].status, 'draft');
  assert.deepEqual(placementRows.map((p) => [p.targetRef, p.status]), [['anna-cafe', 'archived'], ['anna-cafe-north', 'draft']]);
});

test('S. placement already published by a parallel publish of the same deal: publish still succeeds', async () => {
  resetFixtures();
  const deal = await newDeal();
  await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  afterNextRead = { table: 'landingPage', fn: setPlacementStatus('anna-cafe', 'published') };
  const out = await service.publishDeal(ANNA, deal.dealId, { includePlacements: true });
  assert.equal(out.status, 'published');
  assert.equal(placementRows[0].status, 'published');
});

test('S. placement archived while its publish is running: 409, the placement stays archived', async () => {
  resetFixtures();
  const deal = await newDeal();
  const placement = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.publishDeal(ANNA, deal.dealId);
  afterNextRead = { table: 'dealPlacement', fn: setPlacementStatus('anna-cafe', 'archived') };
  const err = await throwsAsync(() => service.publishDealPlacement(ANNA, deal.dealId, placement.placementId));
  assert.equal(err && err.status, 409);
  assert.match(err.message, /removed from the deal while it was being published/);
  assert.equal(placementRows[0].status, 'archived');
  assert.equal(placementRows[0].publishedAt, null);
});

test('S. republishing stays possible: a published deal and a published placement can be published again', async () => {
  resetFixtures();
  const deal = await newDeal();
  const placement = await service.addDealPlacement(ANNA, deal.dealId, { channel: 'landing_page', targetRef: 'anna-cafe' });
  await service.publishDeal(ANNA, deal.dealId, { includePlacements: true });
  await service.saveDealDraft(ANNA, deal.dealId, { title: 'Free Coffee Saturday' });
  const again = await service.publishDeal(ANNA, deal.dealId, { includePlacements: true });
  assert.equal(again.status, 'published');
  assert.equal(again.title, 'Free Coffee Saturday');
  const p = await service.publishDealPlacement(ANNA, deal.dealId, placement.placementId);
  assert.equal(p.status, 'published');
  // an archived deal is still refused up front, as before
  await service.archiveDeal(ANNA, deal.dealId);
  const err = await throwsAsync(() => service.publishDeal(ANNA, deal.dealId));
  assert.equal(err && err.status, 400);
});

// ── U. Uploaded pictures only come in through the upload (Phase 3B.2) ──
test('U. a draft save cannot attach a new uploaded picture; the upload step (allowNewUpload) can', async () => {
  resetFixtures();
  const deal = await newDeal();
  const err = await throwsAsync(() => service.saveDealDraft(ANNA, deal.dealId, { image: TRUSTED_IMAGE }));
  assert.equal(err && err.status, 400);
  assert.match(err.message, /only be added with the image upload/);
  assert.equal(dealRows[0].draftData, null, 'nothing saved');
  const ok = await service.saveDealDraft(ANNA, deal.dealId, { image: TRUSTED_IMAGE }, UPLOAD);
  assert.equal(ok.image.publicId, TRUSTED_IMAGE.publicId);
});

test('U. the deal\'s own draft or live upload may be saved again; another deal\'s upload may not', async () => {
  resetFixtures();
  const a = await newDeal();
  const b = await newDeal();
  await service.saveDealDraft(ANNA, a.dealId, { image: MASTER_IMAGE }, UPLOAD);
  dealRows[0].draftData = JSON.parse(JSON.stringify(dealRows[0].draftData));
  assert.deepEqual((await service.saveDealDraft(ANNA, a.dealId, { image: MASTER_IMAGE, title: 'again' })).image, MASTER_IMAGE, 'own draft upload kept');
  await service.publishDeal(ANNA, a.dealId);
  await service.saveDealDraft(ANNA, a.dealId, { image: { source: 'background', backgroundId: 'night' } });
  assert.deepEqual((await service.saveDealDraft(ANNA, a.dealId, { image: MASTER_IMAGE })).image, MASTER_IMAGE, 'own live upload restored');
  const copy = await throwsAsync(() => service.saveDealDraft(ANNA, b.dealId, { image: MASTER_IMAGE }));
  assert.equal(copy && copy.status, 400, 'another deal\'s picture is refused');
  const sameAssetOtherUrl = await throwsAsync(() => service.saveDealDraft(ANNA, a.dealId, { image: { ...MASTER_IMAGE, url: MASTER_IMAGE.master.url } }));
  assert.equal(sameAssetOtherUrl && sameAssetOtherUrl.status, 400, 'url must match the stored one too');
});

test('U. starter, background and removing the picture need no upload step', async () => {
  resetFixtures();
  const deal = await newDeal();
  assert.equal((await service.saveDealDraft(ANNA, deal.dealId, { image: { source: 'starter', starterId: 'travel-greece-01' } })).image.source, 'starter');
  assert.equal((await service.saveDealDraft(ANNA, deal.dealId, { image: { source: 'background', backgroundId: 'night' } })).image.source, 'background');
  assert.equal((await service.saveDealDraft(ANNA, deal.dealId, { image: null })).image, null);
});

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
  assert.deepEqual([...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]), ['../utils/prismaClient', '../data/dealImages', './dealCards']); // dealCards: the Deals' own landing page cards
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
