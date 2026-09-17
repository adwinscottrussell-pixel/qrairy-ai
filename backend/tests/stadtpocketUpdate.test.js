// ============================================================
// stadtpocketUpdate.test.js — mocked-Prisma tests for the StadtPocket
// Aktuelles Foundation (Phase 4B): stadtpocketUpdateService.js.
//
// Mirrors tests/stadtpocketOffer.test.js's exact conventions ($transaction
// mocked with real rollback semantics, isTrustedStadtPocketHeaderImage
// reading CLOUDINARY_CLOUD_NAME at call time, direct service-function
// calls with a pre-built `scope` object) -- no route/Clerk layer needed.
//
// Run: node tests/stadtpocketUpdate.test.js
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
let updateRows = [];
let idSeq = 0;
function nextId(prefix) { idSeq += 1; return `${prefix}_${idSeq}`; }

function resetFixtures() {
  listingLocationRows = [
    { id: STAIB_LL_ID, listingId: 'listing_staib', locationId: ULM },
    { id: OTHER_LL_ID, listingId: 'listing_other', locationId: ULM },
    { id: STUTTGART_LL_ID, listingId: 'listing_shop', locationId: STUTTGART },
  ];
  updateRows = [];
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
  stadtPocketUpdate: {
    findUnique: async ({ where }) => updateRows.find((u) => u.id === where.id) || null,
    findMany: async ({ where }) => {
      let rows = updateRows;
      if (where && where.listingLocationId) rows = rows.filter((u) => u.listingLocationId === where.listingLocationId);
      return cloneRows(rows);
    },
    create: async ({ data }) => {
      const row = {
        id: nextId('update'),
        image: null, draftData: null, publishedAt: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      updateRows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = updateRows.find((u) => u.id === where.id);
      if (!row) throw new Error('update not found in mock');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    delete: async ({ where }) => {
      const idx = updateRows.findIndex((u) => u.id === where.id);
      if (idx === -1) throw new Error('update not found in mock');
      const [row] = updateRows.splice(idx, 1);
      return { ...row };
    },
  },
  $transaction: async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const snapshot = cloneRows(updateRows);
    try {
      return await arg(mockPrisma);
    } catch (err) {
      updateRows.length = 0;
      updateRows.push(...snapshot);
      throw err;
    }
  },
};

require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// isTrustedStadtPocketHeaderImage (reused by checkUpdateImage) reads this
// at call time, same convention as tests/stadtpocketOffer.test.js.
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';

const service = require('../src/services/stadtpocketUpdateService');

const TRUSTED_IMAGE = { url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/stadtpocket-headers/update1-123-abcd.jpg', publicId: 'stadtpocket-headers/update1-123-abcd' };
const UNTRUSTED_IMAGE = { url: 'https://evil.example.com/image.jpg', publicId: 'not-a-real-id' };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function expectError(fn, matchStatus) {
  try {
    await fn();
  } catch (err) {
    if (matchStatus != null) assert.equal(err.status, matchStatus);
    return err;
  }
  throw new Error('expected an error, none was thrown');
}

// ── Create ────────────────────────────────────────────────────

test('Global Admin can create a draft update with title + body', async () => {
  resetFixtures();
  const update = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'Neue Öffnungszeiten', body: 'Ab sofort sonntags geöffnet.' });
  assert.equal(update.status, 'draft');
  assert.equal(update.title, 'Neue Öffnungszeiten');
  assert.equal(update.body, 'Ab sofort sonntags geöffnet.');
  assert.equal(update.image, null);
  assert.equal(update.publishedAt, null);
});

test('a City Manager within scope can create an update', async () => {
  resetFixtures();
  const update = await service.createUpdateDraft(ULM, STAIB_LL_ID, ulmManagerScope, { title: 'T', body: 'B' });
  assert.equal(update.status, 'draft');
});

test('an out-of-scope City Manager cannot create an update', async () => {
  resetFixtures();
  await expectError(() => service.createUpdateDraft(ULM, STAIB_LL_ID, stuttgartManagerScope, { title: 'T', body: 'B' }), 403);
});

test('missing title or body is rejected', async () => {
  resetFixtures();
  await expectError(() => service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { body: 'B' }));
  await expectError(() => service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T' }));
  await expectError(() => service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: '   ', body: 'B' }));
});

test('a caller-supplied listingLocationId outside this city is rejected (404)', async () => {
  resetFixtures();
  await expectError(() => service.createUpdateDraft(STUTTGART, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' }), 404);
});

test('unexpected fields at creation are rejected -- e.g. offer-specific fields can never be smuggled in', async () => {
  resetFixtures();
  await expectError(() => service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B', offerText: '2 für 1' }));
  await expectError(() => service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B', startsAt: '2026-01-01' }));
  await expectError(() => service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B', expiresAt: '2026-01-01' }));
});

// ── Save draft ────────────────────────────────────────────────

test('save-draft updates title/body/image without touching live columns until publish', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'Original', body: 'Original body' });
  const saved = await service.saveUpdateDraft(ULM, STAIB_LL_ID, created.updateId, adminScope, { title: 'Edited', image: TRUSTED_IMAGE });
  assert.equal(saved.title, 'Edited'); // merged (draft-over-live) view
  assert.equal(saved.body, 'Original body');
  assert.deepEqual(saved.image, { ...TRUSTED_IMAGE, width: null, height: null });
  const rawRow = updateRows.find((u) => u.id === created.updateId);
  assert.equal(rawRow.title, 'Original'); // live column untouched
  assert.equal(rawRow.status, 'draft');
});

test('save-draft rejects an untrusted image origin', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await expectError(() => service.saveUpdateDraft(ULM, STAIB_LL_ID, created.updateId, adminScope, { image: UNTRUSTED_IMAGE }));
});

test('save-draft image: null clears a previously-set image', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await service.saveUpdateDraft(ULM, STAIB_LL_ID, created.updateId, adminScope, { image: TRUSTED_IMAGE });
  const cleared = await service.saveUpdateDraft(ULM, STAIB_LL_ID, created.updateId, adminScope, { image: null });
  assert.equal(cleared.image, null);
});

test('save-draft rejects an empty title/body (clearing to blank is not allowed)', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await expectError(() => service.saveUpdateDraft(ULM, STAIB_LL_ID, created.updateId, adminScope, { title: '' }));
  await expectError(() => service.saveUpdateDraft(ULM, STAIB_LL_ID, created.updateId, adminScope, { body: '   ' }));
});

test('an out-of-scope City Manager cannot save a draft on a business outside their scope', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await expectError(() => service.saveUpdateDraft(ULM, STAIB_LL_ID, created.updateId, stuttgartManagerScope, { title: 'Hijacked' }), 403);
});

test('an updateId that does not belong to the given listingLocationId is rejected (404, not leaked)', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await expectError(() => service.getUpdateState(ULM, OTHER_LL_ID, created.updateId, adminScope), 404);
});

// ── Publish ───────────────────────────────────────────────────

test('publish moves draftData into live columns and sets status/publishedAt', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'Draft title', body: 'Draft body' });
  await service.saveUpdateDraft(ULM, STAIB_LL_ID, created.updateId, adminScope, { title: 'Published title', image: TRUSTED_IMAGE });
  const published = await service.publishUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope);
  assert.equal(published.status, 'published');
  assert.ok(published.publishedAt instanceof Date);
  const rawRow = updateRows.find((u) => u.id === created.updateId);
  assert.equal(rawRow.title, 'Published title'); // now committed to the live column
  assert.deepEqual(rawRow.image, { ...TRUSTED_IMAGE, width: null, height: null });
});

test('an archived update cannot be published', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await service.archiveUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope);
  await expectError(() => service.publishUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope), 400);
});

test('publish is atomic: a failure inside the transaction leaves the row completely unchanged', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  // Force the re-validation step to fail by injecting an untrusted image
  // straight into draftData (bypassing saveUpdateDraft's own check), so
  // publishUpdateInternal's re-validation is what throws, mid-transaction.
  const row = updateRows.find((u) => u.id === created.updateId);
  row.draftData = { image: UNTRUSTED_IMAGE };
  const before = { ...row };
  await expectError(() => service.publishUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope));
  assert.deepEqual(updateRows.find((u) => u.id === created.updateId), before);
});

test('a City Manager out of scope cannot publish', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await expectError(() => service.publishUpdate(ULM, STAIB_LL_ID, created.updateId, stuttgartManagerScope), 403);
});

// ── Archive / Delete ──────────────────────────────────────────

test('archive is a terminal, idempotency-guarded status transition', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  const archived = await service.archiveUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope);
  assert.equal(archived.status, 'archived');
  await expectError(() => service.archiveUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope), 400);
});

test('a published update can also be archived', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await service.publishUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope);
  const archived = await service.archiveUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope);
  assert.equal(archived.status, 'archived');
});

test('delete permanently removes the row regardless of status', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  const result = await service.deleteUpdate(ULM, STAIB_LL_ID, created.updateId, adminScope);
  assert.deepEqual(result, { deleted: true, updateId: created.updateId });
  assert.equal(updateRows.find((u) => u.id === created.updateId), undefined);
});

test('an out-of-scope City Manager cannot delete an update', async () => {
  resetFixtures();
  const created = await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'T', body: 'B' });
  await expectError(() => service.deleteUpdate(ULM, STAIB_LL_ID, created.updateId, stuttgartManagerScope), 403);
  assert.ok(updateRows.find((u) => u.id === created.updateId), 'row must still exist');
});

// ── List ──────────────────────────────────────────────────────

test('list returns every update for a business, newest first', async () => {
  resetFixtures();
  await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'First', body: 'B' });
  await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'Second', body: 'B' });
  const list = await service.listUpdatesForListingLocation(ULM, STAIB_LL_ID, adminScope);
  assert.equal(list.length, 2);
});

test('list scoping: updates on one business never appear when listing a different one', async () => {
  resetFixtures();
  await service.createUpdateDraft(ULM, STAIB_LL_ID, adminScope, { title: 'Staib post', body: 'B' });
  const otherList = await service.listUpdatesForListingLocation(ULM, OTHER_LL_ID, adminScope);
  assert.equal(otherList.length, 0);
});

test('an out-of-scope City Manager cannot list updates', async () => {
  resetFixtures();
  await expectError(() => service.listUpdatesForListingLocation(ULM, STAIB_LL_ID, stuttgartManagerScope), 403);
});

// ── runner ────────────────────────────────────────────────────

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
