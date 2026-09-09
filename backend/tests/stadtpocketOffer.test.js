// ============================================================
// stadtpocketOffer.test.js — mocked-Prisma tests for the StadtPocket
// Angebote Foundation (Phase A): stadtpocketOfferService.js.
//
// No test framework dependency: uses Node's built-in `assert` and a
// tiny inline runner, following the same pattern as
// tests/stadtpocketManagerWrite.test.js. Prisma is mocked by
// pre-seeding require.cache before the service is required, so no real
// DB or network call is ever made.
//
// No route/Clerk layer exists yet for Offers in this phase (Phase A is
// backend-only), so these tests call stadtpocketOfferService's exported
// functions directly with a pre-built `scope` object -- the same shape
// requireStadtpocketWriteScope produces -- rather than going through
// HTTP handlers.
//
// $transaction is mocked with real rollback semantics (snapshot before
// the callback, restore on throw), matching
// tests/stadtpocketManagerWrite.test.js's own mock, so the publish
// atomicity test is exercising real transactional behavior.
//
// Run: node tests/stadtpocketOffer.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

const prismaClientPath = require.resolve(path.join(__dirname, '..', 'src', 'utils', 'prismaClient.js'));

// ── Fixture data ─────────────────────────────────────────────────
const ULM = 'loc_ulm';
const STUTTGART = 'loc_stuttgart';
const STAIB_LL_ID = 'll_staib_ulm';
const OTHER_LL_ID = 'll_other_ulm';
const STUTTGART_LL_ID = 'll_shop_stuttgart';

let listingLocationRows = [];
let offerRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }

function resetFixtures() {
  listingLocationRows = [
    { id: STAIB_LL_ID, listingId: 'listing_staib', locationId: ULM },
    { id: OTHER_LL_ID, listingId: 'listing_other', locationId: ULM },
    { id: STUTTGART_LL_ID, listingId: 'listing_shop', locationId: STUTTGART },
  ];
  offerRows = [];
  idSeq = 100;
}

function cloneRows(rows) { return rows.map((r) => ({ ...r })); }

const ulmManagerScope = { userId: 'ulm_manager', isGlobalAdmin: false, locationIds: [ULM] };
const stuttgartManagerScope = { userId: 'stuttgart_manager', isGlobalAdmin: false, locationIds: [STUTTGART] };
const adminScope = { userId: 'global_admin', isGlobalAdmin: true };

// ── Mock Prisma ──────────────────────────────────────────────────
const mockPrisma = {
  stadtPocketListingLocation: {
    findUnique: async ({ where }) => listingLocationRows.find((ll) => ll.id === where.id) || null,
  },
  stadtPocketOffer: {
    findUnique: async ({ where }) => offerRows.find((o) => o.id === where.id) || null,
    findMany: async ({ where }) => {
      let rows = offerRows;
      if (where && where.listingLocationId) rows = rows.filter((o) => o.listingLocationId === where.listingLocationId);
      return cloneRows(rows);
    },
    create: async ({ data }) => {
      const row = {
        image: null, draftData: null, publishedAt: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      offerRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = offerRows.find((o) => o.id === where.id);
      if (!row) throw new Error('offer not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  },
  $transaction: async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const snapshot = cloneRows(offerRows);
    try {
      return await arg(mockPrisma);
    } catch (err) {
      offerRows.length = 0;
      offerRows.push(...snapshot);
      throw err;
    }
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// isTrustedStadtPocketHeaderImage (reused by checkOfferImage) reads this
// at call time, not at require time -- same convention as
// tests/stadtpocketHeaderImage.test.js.
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';

const service = require('../src/services/stadtpocketOfferService');

const TRUSTED_IMAGE = { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/stadtpocket-headers/offer1-123-abcd.jpg', publicId: 'stadtpocket-headers/offer1-123-abcd' };

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

// ── A. Create draft ────────────────────────────────────────────
test('A. create requires title and offerText', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x' }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /offerText/);
});

test('A. create succeeds with minimum required fields, status starts draft', async () => {
  resetFixtures();
  const state = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: '20% Rabatt', offerText: '20% auf alles' });
  assert.equal(state.status, 'draft');
  assert.equal(state.title, '20% Rabatt');
  assert.equal(state.publishedAt, null);
  assert.equal(state.isExpired, false);
});

test('A. create rejects unexpected fields (e.g. image, status)', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', status: 'published' }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /Unexpected field/);
});

test('A. create rejects endsAt before startsAt', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, {
    title: 'x', offerText: 'y', startsAt: '2026-09-10T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z',
  }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /endsAt must be after startsAt/);
});

test('A. create on a nonexistent business -> 404', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.createOfferDraft(ULM, 'll_does_not_exist', ulmManagerScope, { title: 'x', offerText: 'y' }));
  assert.equal(err.status, 404);
});

// ── B. Authorization: manager scope ────────────────────────────
test('B. manager outside the business city cannot create', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.createOfferDraft(ULM, STAIB_LL_ID, stuttgartManagerScope, { title: 'x', offerText: 'y' }));
  assert.equal(err.status, 403);
});

test('B. Global Admin bypasses location scope', async () => {
  resetFixtures();
  const state = await service.createOfferDraft(ULM, STAIB_LL_ID, adminScope, { title: 'x', offerText: 'y' });
  assert.equal(state.title, 'x');
});

test('B. cross-city denial: Stuttgart manager cannot read an Ulm offer', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.getOfferState(ULM, STAIB_LL_ID, created.offerId, stuttgartManagerScope));
  assert.equal(err.status, 403);
});

test('B. cross-business denial: offer from one business is not reachable via a sibling business id in the same city', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.getOfferState(ULM, OTHER_LL_ID, created.offerId, ulmManagerScope));
  assert.equal(err.status, 404);
});

test('B. mismatched locationId/listingLocationId pair (Stuttgart business addressed via Ulm locationId) -> 404, not leaked', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.listOffersForListingLocation(ULM, STUTTGART_LL_ID, ulmManagerScope));
  assert.equal(err.status, 404);
});

// ── C. Save draft ──────────────────────────────────────────────
test('C. saveDraft updates draftData without touching live columns until publish', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const updated = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { title: 'Neuer Titel' });
  assert.equal(updated.title, 'Neuer Titel');
  const rawRow = offerRows.find((o) => o.id === created.offerId);
  assert.equal(rawRow.title, 'x'); // live column untouched
  assert.equal(rawRow.draftData.title, 'Neuer Titel');
});

test('C. saveDraft rejects empty title', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { title: '   ' }));
  assert.ok(err instanceof service.StadtpocketOfferError);
});

test('C. saveDraft rejects invalid dates', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { startsAt: 'not-a-date' }));
  assert.ok(err instanceof service.StadtpocketOfferError);
});

test('C. saveDraft catches endsAt-before-startsAt across two separate calls (merged-state validation)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', endsAt: '2026-09-05T00:00:00.000Z' });
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { startsAt: '2026-09-10T00:00:00.000Z' }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /endsAt must be after startsAt/);
});

test('C. saveDraft accepts a trusted image and rejects an untrusted one', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const okState = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { image: TRUSTED_IMAGE });
  assert.equal(okState.image.publicId, TRUSTED_IMAGE.publicId);
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, {
    image: { url: 'https://evil.example.com/fake.jpg', publicId: 'fake' },
  }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /not a recognized StadtPocket-uploaded image/);
});

test('C. saveDraft on a nonexistent offer -> 404', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, 'offer_does_not_exist', ulmManagerScope, { title: 'x' }));
  assert.equal(err.status, 404);
});

// ── D. Publish ────────────────────────────────────────────────
test('D. publish copies draft onto live columns, sets status + publishedAt, retains draftData', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { title: 'Live Titel' });
  const published = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(published.status, 'published');
  assert.ok(published.publishedAt instanceof Date);
  const rawRow = offerRows.find((o) => o.id === created.offerId);
  assert.equal(rawRow.title, 'Live Titel'); // copied onto the live column
  assert.notEqual(rawRow.draftData, null); // never cleared on publish
});

test('D. publish fails without offerText ever having been set (defensive re-check)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  // simulate a corrupted live column bypassing the normal creation path
  const raw = offerRows.find((o) => o.id === created.offerId);
  raw.offerText = '   ';
  const err = await throwsAsync(() => service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /missing required field/);
});

test('D. publish an archived offer is rejected', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  await service.archiveOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  const err = await throwsAsync(() => service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /archived/);
});

test('D. duplicate publish actions are idempotent (publishing an already-published offer again succeeds, updates publishedAt)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const first = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  const second = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(second.status, 'published');
  assert.ok(second.publishedAt.getTime() >= first.publishedAt.getTime());
});

test('D. publish by a manager outside scope is rejected, even with a valid offerId', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.publishOffer(ULM, STAIB_LL_ID, created.offerId, stuttgartManagerScope));
  assert.equal(err.status, 403);
});

// ── E. Archive ────────────────────────────────────────────────
test('E. archive from draft succeeds', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const archived = await service.archiveOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(archived.status, 'archived');
});

test('E. archive from published succeeds', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  const archived = await service.archiveOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(archived.status, 'archived');
});

test('E. archiving an already-archived offer is rejected', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  await service.archiveOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  const err = await throwsAsync(() => service.archiveOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /already archived/);
});

// ── F. List ───────────────────────────────────────────────────
test('F. list returns only offers for the requested business, not siblings', async () => {
  resetFixtures();
  await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'Staib 1', offerText: 'a' });
  await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'Staib 2', offerText: 'b' });
  await service.createOfferDraft(ULM, OTHER_LL_ID, ulmManagerScope, { title: 'Other 1', offerText: 'c' });
  const staibOffers = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(staibOffers.length, 2);
  assert.ok(staibOffers.every((o) => ['Staib 1', 'Staib 2'].includes(o.title)));
});

// ── G. Expiration is computed, never stored ────────────────────
test('G. isExpired is true once endsAt is in the past, without a stored status change', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, {
    title: 'x', offerText: 'y', endsAt: '2020-01-01T00:00:00.000Z',
  });
  await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  const state = await service.getOfferState(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(state.isExpired, true);
  assert.equal(state.status, 'published'); // status itself is untouched -- isExpired is derived, not stored
  const rawRow = offerRows.find((o) => o.id === created.offerId);
  assert.equal('isExpired' in rawRow, false); // never persisted
});

test('G. isExpired is false with no endsAt set', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const state = await service.getOfferState(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(state.isExpired, false);
});

// ── H. No fabricated defaults ───────────────────────────────────
test('H. description/image/startsAt/endsAt are never fabricated -- absent at creation stays null', async () => {
  resetFixtures();
  const state = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  assert.equal(state.description, null);
  assert.equal(state.image, null);
  assert.equal(state.startsAt, null);
  assert.equal(state.endsAt, null);
});

// ── I. Image source tracking (Phase B.1) ─────────────────────────
test('I. source "uploaded" is accepted', async () => {
  const img = service.checkOfferImage({ ...TRUSTED_IMAGE, source: 'uploaded' });
  assert.equal(img.source, 'uploaded');
});

test('I. source "starter" is accepted', async () => {
  const img = service.checkOfferImage({ ...TRUSTED_IMAGE, source: 'starter' });
  assert.equal(img.source, 'starter');
});

test('I. source "ai_generated" is accepted (validator allows it even though nothing sends it yet)', async () => {
  const img = service.checkOfferImage({ ...TRUSTED_IMAGE, source: 'ai_generated' });
  assert.equal(img.source, 'ai_generated');
});

test('I. an invalid source value is rejected', async () => {
  assert.throws(() => service.checkOfferImage({ ...TRUSTED_IMAGE, source: 'stock_photo' }), service.StadtpocketOfferError);
});

test('I. source persists through draft save -> publish', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { image: { ...TRUSTED_IMAGE, source: 'starter' } });
  const published = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(published.image.source, 'starter');
  const rawRow = offerRows.find((o) => o.id === created.offerId);
  assert.equal(rawRow.image.source, 'starter'); // copied onto the live column, not just left in draftData
});

test('I. an image object with no source key (pre-B.1 shape) remains valid', async () => {
  const img = service.checkOfferImage(TRUSTED_IMAGE); // TRUSTED_IMAGE has no source key at all
  assert.equal(img.url, TRUSTED_IMAGE.url);
  assert.equal(img.publicId, TRUSTED_IMAGE.publicId);
});

test('I. missing source is never auto-inferred -- stays null, not guessed as "uploaded" or any other value', async () => {
  const img = service.checkOfferImage(TRUSTED_IMAGE);
  assert.equal(img.source, null);
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
