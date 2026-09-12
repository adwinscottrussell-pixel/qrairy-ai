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
const fs = require('fs');

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
      // Real Prisma auto-generates `id` via @default(cuid()); createOfferDraft
      // never supplies one itself. Without this, every mock row would share
      // id: undefined, making two offers on the same business indistinguishable
      // by id -- harmless for tests that only ever touch one offer at a time,
      // but wrong for anything (like delete) that must target ONE of several.
      const row = {
        id: nextId('offer'),
        image: null, draftData: null, publishedAt: null, offerDetails: null,
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
    delete: async ({ where }) => {
      const idx = offerRows.findIndex((o) => o.id === where.id);
      if (idx === -1) throw new Error('offer not found in mock');
      const [row] = offerRows.splice(idx, 1);
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
const { STADTPOCKET_OFFER_STARTER_IMAGES, STADTPOCKET_OFFER_STARTER_CATEGORIES } = require('../src/data/stadtpocketOfferStarterImages');

const TRUSTED_IMAGE = { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/stadtpocket-headers/offer1-123-abcd.jpg', publicId: 'stadtpocket-headers/offer1-123-abcd' };
// A fixture starter-catalog entry, matching the exact shape
// stadtpocketOfferStarterImages.js documents for a real entry -- used
// only to prove the selection/validation MECHANISM works correctly;
// never added to the real (currently empty) catalog file itself.
const FIXTURE_STARTER_ENTRY = {
  id: 'starter-fixture-01',
  label: 'Testbild',
  url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/stadtpocket-headers/starter-fixture-01.jpg',
  publicId: 'stadtpocket-headers/starter-fixture-01',
  width: 1200,
  height: 900,
  tags: ['neutral'],
};

// The 18 real starter-catalog entries (Phase B.2.1) point at the
// PROJECT'S REAL Cloudinary cloud (uploaded via
// backend/scripts/uploadStadtpocketStarterImages.js), not the
// 'test-cloud' this whole file mocks CLOUDINARY_CLOUD_NAME as. Tests
// that trust-check a REAL catalog entry must temporarily swap the env
// var to the real cloud name for that one check (isTrustedStadtPocketHeaderImage
// reads it at call time, not at require time -- see the note above --
// so this is safe and doesn't need a fresh require of the service).
const REAL_CLOUDINARY_CLOUD_NAME = 'dwqc6n7rn';
async function withRealCloudName(fn) {
  const prev = process.env.CLOUDINARY_CLOUD_NAME;
  process.env.CLOUDINARY_CLOUD_NAME = REAL_CLOUDINARY_CLOUD_NAME;
  try { return await fn(); } finally { process.env.CLOUDINARY_CLOUD_NAME = prev; }
}

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

// ── J. Starter-image catalog (Phase B.2) ─────────────────────────
test('J. the real starter catalog (18 entries, Phase B.2.1) is structurally valid', async () => {
  // Runs against the ACTUAL committed catalog. Every entry must have
  // all required fields and pass the exact same trust check real offer
  // images go through -- proving no catalog entry could ever reach a
  // business's Offer without also being a genuine, already-uploaded
  // StadtPocket asset. Real entries point at the real Cloudinary cloud,
  // so this check runs under REAL_CLOUDINARY_CLOUD_NAME (see
  // withRealCloudName above), not this file's 'test-cloud' mock.
  const ids = new Set();
  const categoryIds = new Set(STADTPOCKET_OFFER_STARTER_CATEGORIES.map((c) => c.id));
  await withRealCloudName(() => {
    for (const entry of STADTPOCKET_OFFER_STARTER_IMAGES) {
      assert.equal(typeof entry.id, 'string');
      assert.ok(entry.id.trim().length > 0);
      assert.equal(ids.has(entry.id), false, `duplicate starter id: ${entry.id}`);
      ids.add(entry.id);
      assert.equal(typeof entry.label, 'string');
      assert.ok(entry.label.trim().length > 0);
      assert.equal(typeof entry.alt, 'string');
      assert.ok(entry.alt.trim().length > 0);
      assert.ok(categoryIds.has(entry.category), `unknown category: ${entry.category}`);
      assert.doesNotThrow(() => service.checkOfferImage({ url: entry.url, publicId: entry.publicId, width: entry.width, height: entry.height }));
    }
  });
});

test('J. STADTPOCKET_OFFER_STARTER_CATEGORIES has 6 categories with unique, non-empty ids/labels (B.2.1 initial structure)', async () => {
  assert.equal(STADTPOCKET_OFFER_STARTER_CATEGORIES.length, 6);
  const catIds = new Set();
  for (const cat of STADTPOCKET_OFFER_STARTER_CATEGORIES) {
    assert.equal(typeof cat.id, 'string');
    assert.ok(cat.id.trim().length > 0);
    assert.equal(catIds.has(cat.id), false, `duplicate category id: ${cat.id}`);
    catIds.add(cat.id);
    assert.equal(typeof cat.label, 'string');
    assert.ok(cat.label.trim().length > 0);
  }
});

test('J. the real catalog now holds exactly 18 entries (Phase B.2.1 -- populated from the real, approved Cloudinary upload)', async () => {
  assert.equal(STADTPOCKET_OFFER_STARTER_IMAGES.length, 18);
  // All 18 secure_urls must be real HTTPS Cloudinary URLs under the
  // exact target folder, never invented or reconstructed.
  for (const entry of STADTPOCKET_OFFER_STARTER_IMAGES) {
    assert.ok(entry.url.startsWith('https://res.cloudinary.com/'));
    assert.ok(entry.url.includes('/stadtpocket-headers/angebote-starter/'));
    assert.ok(entry.publicId.startsWith('stadtpocket-headers/angebote-starter/'));
    assert.equal(entry.width, 1200);
    assert.equal(entry.height, 900);
  }
});

test('J. every category has at least 1 real catalog entry (6 categories, 18 entries)', async () => {
  for (const cat of STADTPOCKET_OFFER_STARTER_CATEGORIES) {
    const count = STADTPOCKET_OFFER_STARTER_IMAGES.filter((e) => e.category === cat.id).length;
    assert.ok(count > 0, `category ${cat.id} has no real entries`);
  }
});

test('J. a valid fixture starter entry passes the exact same trust check as any other offer image', async () => {
  const img = service.checkOfferImage({ url: FIXTURE_STARTER_ENTRY.url, publicId: FIXTURE_STARTER_ENTRY.publicId, width: FIXTURE_STARTER_ENTRY.width, height: FIXTURE_STARTER_ENTRY.height, source: 'starter', starterId: FIXTURE_STARTER_ENTRY.id });
  assert.equal(img.source, 'starter');
  assert.equal(img.starterId, FIXTURE_STARTER_ENTRY.id);
});

test('J. an untrusted url/publicId cannot pass as a starter image even with a valid starterId', async () => {
  assert.throws(() => service.checkOfferImage({ url: 'https://evil.example.com/fake.jpg', publicId: 'fake', source: 'starter', starterId: FIXTURE_STARTER_ENTRY.id }), service.StadtpocketOfferError);
});

test('J. starterId is accepted as an optional non-empty string', async () => {
  const img = service.checkOfferImage({ ...TRUSTED_IMAGE, starterId: 'starter-01' });
  assert.equal(img.starterId, 'starter-01');
});

test('J. an empty-string starterId is rejected', async () => {
  assert.throws(() => service.checkOfferImage({ ...TRUSTED_IMAGE, starterId: '   ' }), service.StadtpocketOfferError);
});

test('J. missing starterId is never auto-inferred -- stays null', async () => {
  const img = service.checkOfferImage(TRUSTED_IMAGE);
  assert.equal(img.starterId, null);
});

test('J. an image object with no starterId key (pre-B.2 shape) remains valid', async () => {
  const img = service.checkOfferImage(TRUSTED_IMAGE);
  assert.equal(img.url, TRUSTED_IMAGE.url);
});

test('J. selecting a starter image (source+starterId via draft save) produces source: "starter" and persists through publish, without touching unrelated fields', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'Unverändert', offerText: 'Unverändert-Wert', description: 'Unverändert-Text' });
  const afterImage = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, {
    image: { url: FIXTURE_STARTER_ENTRY.url, publicId: FIXTURE_STARTER_ENTRY.publicId, width: FIXTURE_STARTER_ENTRY.width, height: FIXTURE_STARTER_ENTRY.height, source: 'starter', starterId: FIXTURE_STARTER_ENTRY.id },
  });
  // Title/offerText/description untouched -- saveOfferDraft's partial-
  // update semantics only ever touch keys present in the payload, and
  // this payload contained only "image".
  assert.equal(afterImage.title, 'Unverändert');
  assert.equal(afterImage.offerText, 'Unverändert-Wert');
  assert.equal(afterImage.description, 'Unverändert-Text');
  assert.equal(afterImage.image.source, 'starter');
  assert.equal(afterImage.image.starterId, FIXTURE_STARTER_ENTRY.id);

  const published = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(published.image.source, 'starter');
  assert.equal(published.image.starterId, FIXTURE_STARTER_ENTRY.id);
  assert.equal(published.title, 'Unverändert');
});

test('J. the existing uploaded path still produces source: "uploaded" (no B.2 regression)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const updated = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { image: { ...TRUSTED_IMAGE, source: 'uploaded' } });
  assert.equal(updated.image.source, 'uploaded');
  assert.equal(updated.image.starterId, null);
});

test('J. sending source: "ai_generated" is still accepted by the validator (unchanged from B.1) but nothing in this phase ever sends it', async () => {
  // The validator itself must keep accepting the full allow-list
  // (that's B.1's contract, unchanged) -- this phase's job is only to
  // confirm no B.2 code path ever actually sends it. See the separate
  // grep-based check in this session's report for the frontend side.
  const img = service.checkOfferImage({ ...TRUSTED_IMAGE, source: 'ai_generated' });
  assert.equal(img.source, 'ai_generated');
});

test('J. catalog editing does not invalidate persisted offers -- a starterId absent from the CURRENT (real, 18-entry) catalog is still accepted, because trust is checked against url/publicId alone, never against catalog membership', async () => {
  // Simulates the real-world case this architecture is built to survive:
  // an offer was published while the catalog had an entry with this id;
  // later that entry is renamed or removed from the catalog entirely.
  // The offer's own persisted image (a real, already-trusted Cloudinary
  // asset) must remain valid regardless -- checkOfferImage() never
  // looks the starterId up anywhere, so there is nothing for a catalog
  // edit to break.
  const removedId = 'a-hypothetically-removed-starter-01';
  assert.equal(STADTPOCKET_OFFER_STARTER_IMAGES.some((e) => e.id === removedId), false, 'precondition: this id must not exist in the current catalog for this test to be meaningful');
  const img = service.checkOfferImage({ ...TRUSTED_IMAGE, source: 'starter', starterId: removedId });
  assert.equal(img.starterId, removedId);
  assert.equal(img.source, 'starter');
});

test('J. catalog editing does not invalidate persisted offers -- full draft save + publish flow with a starterId not present in the current catalog', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, {
    image: { ...TRUSTED_IMAGE, source: 'starter', starterId: 'a-since-removed-catalog-entry' },
  });
  const published = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(published.image.starterId, 'a-since-removed-catalog-entry');
  assert.equal(published.image.source, 'starter');
});

test('J. selecting a REAL catalog entry (not a fixture) end-to-end: draft save -> publish, using the exact real Cloudinary asset', async () => {
  resetFixtures();
  const realEntry = STADTPOCKET_OFFER_STARTER_IMAGES.find((e) => e.id === 'bakery-croissants-01');
  assert.ok(realEntry, 'expected real catalog entry bakery-croissants-01 to exist');
  await withRealCloudName(async () => {
    const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
    const afterImage = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, {
      image: { url: realEntry.url, publicId: realEntry.publicId, width: realEntry.width, height: realEntry.height, source: 'starter', starterId: realEntry.id },
    });
    assert.equal(afterImage.image.source, 'starter');
    assert.equal(afterImage.image.starterId, 'bakery-croissants-01');
    assert.equal(afterImage.image.url, realEntry.url);
    const published = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
    assert.equal(published.image.url, realEntry.url);
    assert.equal(published.image.starterId, 'bakery-croissants-01');
  });
});

test('J. backend/frontend starter catalog parity -- frontend/public/stadtpocket-admin.html mirrors backend/src/data/stadtpocketOfferStarterImages.js exactly (18 entries, byte-identical fields)', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'stadtpocket-admin.html'), 'utf8');
  const marker = 'const STADTPOCKET_OFFER_STARTER_IMAGES = [';
  const start = html.indexOf(marker);
  assert.ok(start !== -1, 'STADTPOCKET_OFFER_STARTER_IMAGES not found in stadtpocket-admin.html');
  const arrayStart = start + marker.length - 1; // include the opening '['
  const closeIdx = html.indexOf('\n  ];', arrayStart);
  assert.ok(closeIdx !== -1, 'could not find closing "];" for STADTPOCKET_OFFER_STARTER_IMAGES');
  const arraySource = html.slice(arrayStart, closeIdx + 4); // up to and including the ']'
  // eslint-disable-next-line no-new-func -- isolated, no external input, evaluates only a literal array of plain data objects extracted from the real file
  const frontendEntries = new Function(`return ${arraySource};`)();

  assert.equal(frontendEntries.length, STADTPOCKET_OFFER_STARTER_IMAGES.length);
  const backendById = new Map(STADTPOCKET_OFFER_STARTER_IMAGES.map((e) => [e.id, e]));
  for (const feEntry of frontendEntries) {
    const beEntry = backendById.get(feEntry.id);
    assert.ok(beEntry, `frontend entry ${feEntry.id} has no backend counterpart`);
    assert.equal(feEntry.label, beEntry.label);
    assert.equal(feEntry.category, beEntry.category);
    assert.equal(feEntry.alt, beEntry.alt);
    assert.equal(feEntry.url, beEntry.url);
    assert.equal(feEntry.publicId, beEntry.publicId);
    assert.equal(feEntry.width, beEntry.width);
    assert.equal(feEntry.height, beEntry.height);
  }
});

// ── K. Date-roundtrip regression (draftData.startsAt/endsAt surviving
//      a real JSON round-trip, as Prisma's `Json` column type actually
//      returns them -- a plain Date written into draftData comes back
//      as an ISO STRING on the next read, never revived. The existing
//      mock Prisma above stores/returns object references directly
//      (via `cloneRows`'s shallow `{...r}`), so it never exercised this
//      path -- these tests build fixture rows with a genuine
//      JSON.parse(JSON.stringify(...)) round-trip already applied to
//      draftData, exactly like a real fresh SELECT of a JSONB column
//      would produce, then drive them through the real service
//      functions. ────────────────────────────────────────────────
// mergeOfferState now normalizes startsAt/endsAt to real Date instances
// (that's the fix) -- assertions below compare via ISO string so they
// don't care whether the seam happens to hand back a Date or a string,
// only that the VALUE round-tripped correctly.
function isoOf(v) { return v instanceof Date ? v.toISOString() : v; }

function seedRoundTrippedOffer(overrides = {}) {
  const row = {
    id: nextId('offer'),
    listingLocationId: STAIB_LL_ID,
    title: 'Bestandsangebot', description: null, offerText: 'Bestandswert',
    image: null, status: 'draft', startsAt: null, endsAt: null, publishedAt: null,
    createdBy: 'ulm_manager', createdAt: new Date(2026, 8, 1), updatedAt: new Date(2026, 8, 1),
    draftData: null,
    ...overrides,
  };
  // Simulate a genuine Postgres JSONB round-trip of draftData, exactly
  // as a fresh Prisma read would return it -- any Date inside becomes a
  // plain ISO string, never a Date instance.
  if (row.draftData) row.draftData = JSON.parse(JSON.stringify(row.draftData));
  offerRows.push(row);
  return row;
}

test('K. empty Offer list still works (baseline, unaffected by the fix)', async () => {
  resetFixtures();
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.deepEqual(list, []);
});

test('K. Offer without any dates still works', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({ draftData: { title: 'Bestandsangebot' } });
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(list.length, 1);
  assert.equal(list[0].startsAt, null);
  assert.equal(list[0].endsAt, null);
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(detail.isExpired, false);
});

test('K. Offer with a round-tripped startsAt survives list + detail reads', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({ draftData: { startsAt: new Date('2026-09-10T00:00:00.000Z') } });
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(isoOf(list[0].startsAt), '2026-09-10T00:00:00.000Z');
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(isoOf(detail.startsAt), '2026-09-10T00:00:00.000Z');
});

test('K. Offer with a round-tripped endsAt survives list + detail reads -- the exact reported bug condition', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({ draftData: { endsAt: new Date('2026-09-20T00:00:00.000Z') } });
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(list.length, 1);
  assert.equal(isoOf(list[0].endsAt), '2026-09-20T00:00:00.000Z');
  assert.equal(list[0].isExpired, false);
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(isoOf(detail.endsAt), '2026-09-20T00:00:00.000Z');
});

test('K. Offer with both round-tripped startsAt and endsAt survives list + detail reads', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({
    draftData: { startsAt: new Date('2026-09-10T00:00:00.000Z'), endsAt: new Date('2026-09-20T00:00:00.000Z') },
  });
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(isoOf(list[0].startsAt), '2026-09-10T00:00:00.000Z');
  assert.equal(isoOf(list[0].endsAt), '2026-09-20T00:00:00.000Z');
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(isoOf(detail.startsAt), '2026-09-10T00:00:00.000Z');
  assert.equal(isoOf(detail.endsAt), '2026-09-20T00:00:00.000Z');
});

test('K. a fresh (non-round-tripped) Date instance for endsAt still works, unchanged', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({ draftData: { endsAt: new Date('2026-09-20T00:00:00.000Z') } });
  // Overwrite AFTER the round-trip helper ran, so this row genuinely
  // holds a live Date instance (as e.g. a same-request write would).
  row.draftData = { endsAt: new Date('2026-09-20T00:00:00.000Z') };
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(isoOf(detail.endsAt), '2026-09-20T00:00:00.000Z');
  assert.equal(detail.isExpired, false);
});

test('K. null date values still work after a round-trip (null survives JSON as null, not the bug case)', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({ draftData: { startsAt: null, endsAt: null } });
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(detail.startsAt, null);
  assert.equal(detail.endsAt, null);
});

test('K. invalid date input is still rejected the same way as before the fix (handled by validation, not silently swallowed)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { endsAt: 'not-a-date' }));
  assert.ok(err instanceof service.StadtpocketOfferError);
});

test('K. persisted image metadata (including source: "uploaded") is unchanged by a round-tripped endsAt on the same offer', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({
    image: { ...TRUSTED_IMAGE, source: 'uploaded' },
    draftData: { endsAt: new Date('2026-09-20T00:00:00.000Z') },
  });
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(list[0].image.url, TRUSTED_IMAGE.url);
  assert.equal(list[0].image.publicId, TRUSTED_IMAGE.publicId);
  assert.equal(list[0].image.source, 'uploaded');
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(detail.image.source, 'uploaded');
});

test('K. REGRESSION: saveOfferDraft editing an unrelated field on an offer with a round-tripped endsAt no longer throws (was: TypeError: endsAt.getTime is not a function)', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({ draftData: { endsAt: new Date('2026-09-20T00:00:00.000Z') } });
  const updated = await service.saveOfferDraft(ULM, STAIB_LL_ID, row.id, ulmManagerScope, { title: 'Neuer Titel' });
  assert.equal(updated.title, 'Neuer Titel');
  assert.equal(isoOf(updated.endsAt), '2026-09-20T00:00:00.000Z');
});

test('K. REGRESSION: listOffersForListingLocation on a business with one round-tripped offer no longer throws (was: "Fehler beim Laden der Angebote")', async () => {
  resetFixtures();
  seedRoundTrippedOffer({ draftData: { endsAt: new Date('2026-09-20T00:00:00.000Z') } });
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(list.length, 1);
});

test('K. REGRESSION: getOfferState (detail endpoint) on a round-tripped offer no longer throws', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({ draftData: { endsAt: new Date('2026-09-20T00:00:00.000Z') } });
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(detail.offerId, row.id);
});

// ── L. Offer-type structure (Phase B.2.2) ──────────────────────────
// checkOfferType / checkOfferDetails validator unit tests, one example
// per approved type: percentage_discount, two_for_one, fixed_price,
// free_bonus, upgrade, custom.

test('L. checkOfferType accepts every approved type and null', async () => {
  service.OFFER_TYPES.forEach((t) => assert.equal(service.checkOfferType(t), t));
  assert.equal(service.checkOfferType(null), null);
});

test('L. checkOfferType rejects an unknown value', async () => {
  assert.throws(() => service.checkOfferType('buy_one_get_one_free'), service.StadtpocketOfferError);
});

test('L. checkOfferDetails: percentage_discount requires percentOff, accepts 1-100, rejects out of range', async () => {
  assert.throws(() => service.checkOfferDetails('percentage_discount', {}), /percentOff is required/);
  assert.deepEqual(service.checkOfferDetails('percentage_discount', { percentOff: 20 }), { percentOff: 20 });
  assert.deepEqual(service.checkOfferDetails('percentage_discount', { percentOff: '20' }), { percentOff: 20 }); // coerced, as sent by a real <input type="number">
  assert.throws(() => service.checkOfferDetails('percentage_discount', { percentOff: 0 }), /at least 1/);
  assert.throws(() => service.checkOfferDetails('percentage_discount', { percentOff: 150 }), /at most 100/);
});

test('L. checkOfferDetails: percentage_discount rejects an unexpected key (reject-not-strip)', async () => {
  const err = await throwsAsync(async () => service.checkOfferDetails('percentage_discount', { percentOff: 20, buyQty: 1 }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /Unexpected offerDetails field/);
});

test('L. checkOfferDetails: two_for_one requires BOTH buyQty and freeQty if either is sent', async () => {
  assert.deepEqual(service.checkOfferDetails('two_for_one', { buyQty: 1, freeQty: 1 }), { buyQty: 1, freeQty: 1 });
  assert.throws(() => service.checkOfferDetails('two_for_one', { buyQty: 1 }), /both required/);
});

test('L. checkOfferDetails: fixed_price requires price, defaults currency to EUR when omitted', async () => {
  assert.deepEqual(service.checkOfferDetails('fixed_price', { price: 5.9 }), { price: 5.9, currency: 'EUR' });
  assert.deepEqual(service.checkOfferDetails('fixed_price', { price: 5.9, currency: 'CHF' }), { price: 5.9, currency: 'CHF' });
  assert.throws(() => service.checkOfferDetails('fixed_price', {}), /price is required/);
  assert.throws(() => service.checkOfferDetails('fixed_price', { price: 0 }), /at least 0.01/);
});

test('L. checkOfferDetails: free_bonus has no required fields -- an empty object is valid', async () => {
  assert.deepEqual(service.checkOfferDetails('free_bonus', {}), { freeItem: null, minPurchase: null });
  assert.deepEqual(service.checkOfferDetails('free_bonus', { freeItem: '1 Kaffee' }), { freeItem: '1 Kaffee', minPurchase: null });
});

test('L. checkOfferDetails: upgrade has no required fields -- an empty object is valid', async () => {
  assert.deepEqual(service.checkOfferDetails('upgrade', {}), { fromLabel: null, toLabel: null });
  assert.deepEqual(service.checkOfferDetails('upgrade', { fromLabel: 'Standard', toLabel: 'Premium' }), { fromLabel: 'Standard', toLabel: 'Premium' });
});

test('L. checkOfferDetails: custom never accepts a details object -- structured data is not supported for it, by design', async () => {
  const err = await throwsAsync(async () => service.checkOfferDetails('custom', {}));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /not supported for offerType "custom"/);
});

test('L. checkOfferDetails: null offerDetails always returns null regardless of offerType', async () => {
  assert.equal(service.checkOfferDetails('percentage_discount', null), null);
  assert.equal(service.checkOfferDetails('custom', null), null);
});

test('L. checkOfferDetails: a non-null offerDetails with offerType null is rejected', async () => {
  const err = await throwsAsync(async () => service.checkOfferDetails(null, { percentOff: 20 }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /requires an offerType/);
});

// ── L. Create: offerType allowed, offerDetails is save-draft-only ────
test('L. create accepts a valid offerType alongside title/offerText', async () => {
  resetFixtures();
  const state = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType: 'percentage_discount' });
  assert.equal(state.offerType, 'percentage_discount');
  assert.equal(state.offerDetails, null);
});

test('L. create rejects an invalid offerType', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType: 'not_a_real_type' }));
  assert.ok(err instanceof service.StadtpocketOfferError);
});

test('L. create rejects offerDetails at creation (same posture as image -- save-draft only)', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, {
    title: 'x', offerText: 'y', offerType: 'percentage_discount', offerDetails: { percentOff: 20 },
  }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /Unexpected field/);
});

test('L. create without offerType leaves it null (legacy-compatible default)', async () => {
  resetFixtures();
  const state = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  assert.equal(state.offerType, null);
  assert.equal(state.offerDetails, null);
});

// ── L. Save draft: offerType + offerDetails together and separately ──
test('L. saveDraft sets offerType and offerDetails together in one call', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const updated = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, {
    offerType: 'percentage_discount', offerDetails: { percentOff: 25 },
  });
  assert.equal(updated.offerType, 'percentage_discount');
  assert.deepEqual(updated.offerDetails, { percentOff: 25 });
});

test('L. saveDraft sets offerDetails alone, resolved against the offerType ALREADY stored on the offer', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType: 'fixed_price' });
  const updated = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerDetails: { price: 9.5 } });
  assert.deepEqual(updated.offerDetails, { price: 9.5, currency: 'EUR' });
});

test('L. saveDraft rejects offerDetails when no offerType is resolvable (never set, not in this call either)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerDetails: { percentOff: 20 } }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /requires an offerType/);
});

test('L. saveDraft rejects malformed offerDetails for the resolved offerType (invalid combination -> clear 400-style error)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType: 'two_for_one' });
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerDetails: { buyQty: 1 } }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.equal(err.status, 400);
  assert.match(err.message, /both required/);
});

test('L. saveDraft: switching offerType WITHOUT sending offerDetails auto-clears the old type\'s stale offerDetails (defense-in-depth)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType: 'percentage_discount' });
  await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerDetails: { percentOff: 20 } });
  const switched = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerType: 'custom' });
  assert.equal(switched.offerType, 'custom');
  assert.equal(switched.offerDetails, null); // never left as a mismatched leftover from percentage_discount
});

test('L. saveDraft: switching offerType WITH offerDetails in the same call validates against the NEW type, not the old one', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType: 'percentage_discount' });
  await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerDetails: { percentOff: 20 } });
  const switched = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, {
    offerType: 'fixed_price', offerDetails: { price: 4.5 },
  });
  assert.equal(switched.offerType, 'fixed_price');
  assert.deepEqual(switched.offerDetails, { price: 4.5, currency: 'EUR' });
});

test('L. saveDraft: re-selecting the SAME offerType without resending offerDetails leaves the existing offerDetails untouched', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType: 'percentage_discount' });
  await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerDetails: { percentOff: 20 } });
  const resaved = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerType: 'percentage_discount' });
  assert.deepEqual(resaved.offerDetails, { percentOff: 20 }); // not cleared -- this was not a genuine switch
});

test('L. saveDraft still rejects an entirely unknown top-level field (OFFER_FIELDS whitelist unaffected by this phase)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { redemptionCode: 'FREE10' }));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.match(err.message, /Unexpected field/);
});

// ── L. Publish: offerType/offerDetails copy onto live columns ────────
test('L. publish copies offerType and offerDetails from draftData onto the live columns', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType: 'two_for_one' });
  await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerDetails: { buyQty: 1, freeQty: 1 } });
  const published = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(published.offerType, 'two_for_one');
  assert.deepEqual(published.offerDetails, { buyQty: 1, freeQty: 1 });
  const rawRow = offerRows.find((o) => o.id === created.offerId);
  assert.equal(rawRow.offerType, 'two_for_one'); // copied onto the live column, not just left in draftData
  assert.deepEqual(rawRow.offerDetails, { buyQty: 1, freeQty: 1 });
});

// ── L. Legacy compatibility: offerType/offerDetails null/null ────────
test('L. a legacy offer row (as this migration leaves every pre-existing row: offerType/offerDetails genuinely NULL, never inferred) loads as null/null, not an error', async () => {
  resetFixtures();
  // Bypasses createOfferDraft entirely -- seeded directly to represent
  // exactly what an ALTER TABLE ... ADD COLUMN "offerType" TEXT (nullable,
  // no default) leaves on every row that existed before this migration:
  // a real, present NULL value on both new columns, never an inferred
  // guess from the row's existing offerText.
  const row = {
    id: nextId('offer'), listingLocationId: STAIB_LL_ID,
    title: 'Alt-Angebot', description: null, offerText: '10% Rabatt',
    offerType: null, offerDetails: null,
    image: null, status: 'draft', startsAt: null, endsAt: null, publishedAt: null,
    createdBy: 'ulm_manager', createdAt: new Date(2026, 8, 1), updatedAt: new Date(2026, 8, 1),
    draftData: null,
  };
  offerRows.push(row);
  const state = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(state.offerType, null);
  assert.equal(state.offerDetails, null);
  assert.equal(state.offerText, '10% Rabatt'); // untouched, never re-derived
});

test('L. a legacy offer (offerType: null) can still be edited, saved, and published exactly as before -- untouched by this phase', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'Alt-Angebot', offerText: '10% Rabatt' });
  const updated = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { title: 'Alt-Angebot (bearbeitet)' });
  assert.equal(updated.offerType, null);
  const published = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(published.status, 'published');
  assert.equal(published.offerType, null);
  assert.equal(published.offerDetails, null);
});

test('L. offerType is never inferred from existing offerText, even when the text strongly suggests a type', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: '20% Rabatt' });
  assert.equal(created.offerType, null); // "20% Rabatt" looks exactly like the percentage_discount prefill string -- still never guessed
});

// ── L. Full round-trip per type: create -> save -> reload -> edit ->
// save again -- proves the selected type and structured values survive
// every step of the Deal Builder wizard, per the Phase B.2.2 brief.
const ROUND_TRIP_CASES = [
  { offerType: 'percentage_discount', details: { percentOff: 20 }, expected: { percentOff: 20 } },
  { offerType: 'two_for_one', details: { buyQty: 1, freeQty: 1 }, expected: { buyQty: 1, freeQty: 1 } },
  { offerType: 'fixed_price', details: { price: 5.9 }, expected: { price: 5.9, currency: 'EUR' } },
  { offerType: 'free_bonus', details: { freeItem: '1 Kaffee' }, expected: { freeItem: '1 Kaffee', minPurchase: null } },
  { offerType: 'upgrade', details: { fromLabel: 'Standard', toLabel: 'Premium' }, expected: { fromLabel: 'Standard', toLabel: 'Premium' } },
  { offerType: 'custom', details: null, expected: null },
];

ROUND_TRIP_CASES.forEach(({ offerType, details, expected }) => {
  test(`L. ROUND-TRIP (${offerType}): create -> save -> reload -> edit -> save again survives with the exact type and values`, async () => {
    resetFixtures();
    const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y', offerType });
    if (details) {
      await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { offerDetails: details });
    }
    // reload (simulates reopening the offer in the admin)
    const reloaded = await service.getOfferState(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
    assert.equal(reloaded.offerType, offerType);
    assert.deepEqual(reloaded.offerDetails, expected);
    // edit an unrelated field, save again -- type/details must be untouched
    const editedAgain = await service.saveOfferDraft(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope, { title: 'x (bearbeitet)' });
    assert.equal(editedAgain.offerType, offerType);
    assert.deepEqual(editedAgain.offerDetails, expected);
    // publish -- type/details must survive onto the live columns too
    const published = await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
    assert.equal(published.offerType, offerType);
    assert.deepEqual(published.offerDetails, expected);
    // reopen once more after publish (edit-after-publish path)
    const reopenedAfterPublish = await service.getOfferState(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
    assert.equal(reopenedAfterPublish.offerType, offerType);
    assert.deepEqual(reopenedAfterPublish.offerDetails, expected);
  });
});

// ── L. Starter-gallery / date-roundtrip behavior is unchanged ────────
// Not re-tested in depth here -- see sections I/J/K above, which are
// untouched by this phase and still run as part of this same file/run.
// This one test is a direct smoke check that an offer combining an
// offerType/offerDetails AND a starter image AND a round-tripped date
// still behaves correctly end-to-end, proving the three features don't
// interfere with each other.
test('L. offerType/offerDetails coexist correctly with a starter image and a round-tripped endsAt on the same offer', async () => {
  resetFixtures();
  const row = seedRoundTrippedOffer({
    offerType: 'percentage_discount',
    offerDetails: { percentOff: 20 },
    image: { ...TRUSTED_IMAGE, source: 'starter', starterId: 'starter-fixture-01' },
    draftData: { endsAt: new Date('2026-09-20T00:00:00.000Z') },
  });
  const detail = await service.getOfferState(ULM, STAIB_LL_ID, row.id, ulmManagerScope);
  assert.equal(detail.offerType, 'percentage_discount');
  assert.deepEqual(detail.offerDetails, { percentOff: 20 });
  assert.equal(detail.image.source, 'starter');
  assert.equal(isoOf(detail.endsAt), '2026-09-20T00:00:00.000Z');
});

// ── M. Delete (Phase B.2.3) ─────────────────────────────────────────
test('M. authorized delete succeeds and the offer is genuinely gone (getOfferState now 404s)', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const result = await service.deleteOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.deepEqual(result, { deleted: true, offerId: created.offerId });
  const err = await throwsAsync(() => service.getOfferState(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.equal(err.status, 404);
});

test('M. delete works regardless of status -- a PUBLISHED offer can be deleted too', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  await service.publishOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  const result = await service.deleteOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  assert.equal(result.deleted, true);
  assert.equal(offerRows.some((o) => o.id === created.offerId), false);
});

test('M. unauthorized delete (manager outside the business city) fails, offer NOT deleted', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.deleteOffer(ULM, STAIB_LL_ID, created.offerId, stuttgartManagerScope));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.equal(err.status, 403);
  assert.equal(offerRows.some((o) => o.id === created.offerId), true); // still there
});

test('M. delete via a sibling business in the same city (wrong listingLocationId) fails, offer NOT deleted', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const err = await throwsAsync(() => service.deleteOffer(ULM, OTHER_LL_ID, created.offerId, ulmManagerScope));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.equal(err.status, 404);
  assert.equal(offerRows.some((o) => o.id === created.offerId), true);
});

test('M. delete via a mismatched locationId/listingLocationId pair (Stuttgart business addressed via Ulm locationId) fails, not leaked', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.deleteOffer(ULM, STUTTGART_LL_ID, 'irrelevant_offer_id', ulmManagerScope));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.equal(err.status, 404);
});

test('M. delete of a nonexistent offer fails safely with 404, not a crash', async () => {
  resetFixtures();
  const err = await throwsAsync(() => service.deleteOffer(ULM, STAIB_LL_ID, 'offer_does_not_exist', ulmManagerScope));
  assert.ok(err instanceof service.StadtpocketOfferError);
  assert.equal(err.status, 404);
});

test('M. deleted offer disappears from listOffersForListingLocation, another offer on the same business is unaffected', async () => {
  resetFixtures();
  const keep = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'Keep me', offerText: 'a' });
  const doomed = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'Delete me', offerText: 'b' });
  await service.deleteOffer(ULM, STAIB_LL_ID, doomed.offerId, ulmManagerScope);
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(list.length, 1);
  assert.equal(list[0].offerId, keep.offerId);
  assert.equal(list[0].title, 'Keep me'); // untouched
});

test('M. Global Admin can delete regardless of manager location scope', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  const result = await service.deleteOffer(ULM, STAIB_LL_ID, created.offerId, adminScope);
  assert.equal(result.deleted, true);
});

test('M. delete is truly permanent -- re-querying after deletion (simulating a reload) never returns the offer', async () => {
  resetFixtures();
  const created = await service.createOfferDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'x', offerText: 'y' });
  await service.deleteOffer(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope);
  // Simulates a hard reload: a fresh read through the same list/detail
  // paths a reload would use, with no special-cased "just deleted" state.
  const list = await service.listOffersForListingLocation(ULM, STAIB_LL_ID, ulmManagerScope);
  assert.equal(list.some((o) => o.offerId === created.offerId), false);
  const err = await throwsAsync(() => service.getOfferState(ULM, STAIB_LL_ID, created.offerId, ulmManagerScope));
  assert.equal(err.status, 404);
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
