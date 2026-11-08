// ============================================================
// studioDraftDelete.test.js — Landing Page Studio V3, Delete draft:
// DELETE /studio/pages/:slug against the REAL Studio routes
// (helpers/studioPagesServer.js: real requireAuth, requireVerifiedEmail and
// controller, in-memory database).
// - the owner deletes their own UNPUBLISHED draft: the page and its design go,
//   the address stays reserved (the deletion record), other drafts untouched;
//   the draft count goes 3 -> 2 and a new draft can be created again
// - nobody else can: another account 403, signed out 401, an unverified email
//   403, unknown / ownerless pages 404, a malformed address 400
// - never a live or published page: 409 not_a_draft, nothing changed
// - ?revision=N: a draft saved since (another tab) is not deleted (409)
// - one transaction under the account's draft lock; a failure changes nothing
// - the deletion is the shared one (services/landingPageDeletion.js), the
//   same three operations as the legacy DELETE /lp/:slug
// Run: node tests/studioDraftDelete.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { LIMITS } = require('../src/lpV3/draftPolicy');
const { DELETED_PAGE_MARKER } = require('../src/services/slugReservation');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let srv;
async function call(method, p, token, body) {
  const headers = Object.assign(token ? { Authorization: 'Bearer ' + token } : {}, body !== undefined ? { 'Content-Type': 'application/json' } : {});
  const r = await fetch(srv.origin + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { status: r.status, body: json, cache: r.headers.get('cache-control') };
}
const del = (slug, token, q) => call('DELETE', '/studio/pages/' + slug + (q || ''), token);
const create = (token, n) => call('POST', '/studio/drafts', token, { name: 'Draft ' + n, language: 'en' });
const pageOf = (slug) => S.db.pages.find((p) => p.slug === slug);
const designOf = (slug) => { const p = pageOf(slug); return p ? S.db.pageDesigns.find((d) => d.landingPageId === p.id) || null : null; };
const carlDrafts = () => S.db.pages.filter((p) => p.userId === S.CARL && p.status === 'draft');
const snap = () => JSON.stringify({ pages: S.db.pages, designs: S.db.pageDesigns, reserved: S.db.reserved });
const markers = () => (S.db.reserved.supportAction || []).filter((r) => r.actionType === DELETED_PAGE_MARKER.actionType);
async function threeDrafts() {
  S.resetDrafts();
  const slugs = [];
  for (let i = 0; i < 3; i++) { const r = await create('tok_carl', i); assert.equal(r.status, 201, 'fixture draft ' + i); slugs.push(r.body.page.slug); }
  assert.equal(carlDrafts().length, LIMITS.activeDrafts, 'fixture: the limit reached');
  return slugs;
}

test('the owner deletes their own unpublished draft: page and design gone, the address reserved, the other drafts untouched; 3 -> 2, and a new draft can be created again', async () => {
  const [a, b, c] = await threeDrafts();
  assert.equal((await create('tok_carl', 'four')).status, 409, 'at the limit: a fourth draft is refused (unchanged rule)');
  const others = JSON.stringify([pageOf(b), designOf(b), pageOf(c), designOf(c)]);
  S.draftWrites.length = 0;
  const r = await del(a, 'tok_carl');
  assert.deepEqual([r.status, r.body], [200, { ok: true, deleted: a }]);
  assert.equal(r.cache, 'private, no-store');
  assert.equal(pageOf(a), undefined, 'the page is gone');
  assert.equal(S.db.pageDesigns.filter((d) => d.landingPageId && !S.db.pages.some((p) => p.id === d.landingPageId)).length, 0, 'its design went with it');
  assert.equal(JSON.stringify([pageOf(b), designOf(b), pageOf(c), designOf(c)]), others, 'the other drafts are untouched');
  assert.deepEqual(S.draftWrites.map((w) => w.op), ['stampToken.deleteMany', 'landingPage.delete', 'supportAction.create'], 'the shared deletion, in order');
  const m = markers().find((x) => x.targetId === a);
  assert.ok(m && m.actorId === S.CARL && m.actorType === 'human' && m.metadata.source === 'studio_draft' && m.metadata.ownerless === false, 'the deletion record keeps the address reserved');
  assert.equal(carlDrafts().length, 2, '3 -> 2');
  const again = await create('tok_carl', 'again');
  assert.equal(again.status, 201, 'a slot is free: a new draft is created');
  assert.notEqual(again.body.page.slug, a, 'never on the deleted address');
  assert.equal(carlDrafts().length, 3);
});

test('nobody else: another account 403, signed out 401, a wrong token 401, an unverified email 403; unknown and ownerless pages 404; a malformed address 400; nothing changed', async () => {
  const [a] = await threeDrafts();
  const before = snap();
  for (const [token, status, what] of [['tok_anna', 403, 'another account'], ['tok_ben', 403, 'another account'], [null, 401, 'signed out'], ['tok_nobody', 401, 'a wrong token'], ['tok_dana', 403, 'unverified email']]) {
    const r = await del(a, token);
    assert.equal(r.status, status, what + ' ' + JSON.stringify(r.body));
  }
  assert.equal((await del('no-such-page-xyz', 'tok_carl')).status, 404, 'unknown');
  assert.equal((await del('ulm-city', 'tok_carl')).status, 404, 'ownerless (StadtPocket / platform page)');
  assert.equal((await del('ulm-city', 'tok_anna')).status, 404, 'ownerless, any account');
  for (const bad of ['-abc', '_abc', 'a%20b', 'a.b', 'x'.repeat(121)]) assert.ok([400, 404].includes((await del(bad, 'tok_carl')).status), 'malformed ' + bad);
  assert.equal((await del('-abc', 'tok_carl')).status, 400);
  assert.equal(snap(), before, 'nothing changed');
  assert.ok(pageOf(a), 'the draft is still there');
});

test('never a live or published page: Anna\'s live pages (with and without a Studio draft) and a draft with a published version are refused with 409 not_a_draft; nothing changed', async () => {
  const [a] = await threeDrafts();
  const before = snap();
  for (const slug of ['anna-cafe', 'anna-shop']) {
    const r = await del(slug, 'tok_anna');
    assert.deepEqual([r.status, r.body], [409, { error: 'not_a_draft' }], slug);
  }
  assert.equal((await del('ben-bikes', 'tok_ben')).status, 409, 'Ben\'s live page');
  assert.equal(snap(), before, 'nothing changed');
  // a draft that has a published V3 version (no publishing exists yet; the guard holds for later)
  designOf(a).publishedVersionId = 'pv_1';
  const r = await del(a, 'tok_carl');
  assert.deepEqual([r.status, r.body], [409, { error: 'not_a_draft' }]);
  assert.ok(pageOf(a) && designOf(a), 'still there');
  designOf(a).publishedVersionId = null;
});

test('?revision=N: the revision the Studio shows; a draft saved since (another tab) is not deleted (409 revision_conflict); a malformed revision 400; the right one deletes', async () => {
  const [a] = await threeDrafts();
  assert.equal(designOf(a).draftRevision, 1);
  const before = snap();
  const stale = await del(a, 'tok_carl', '?revision=2');
  assert.deepEqual([stale.status, stale.body], [409, { error: 'revision_conflict', currentRevision: 1 }]);
  for (const q of ['?revision=0', '?revision=-1', '?revision=abc', '?revision=1.5', '?revision=99999999999']) assert.equal((await del(a, 'tok_carl', q)).status, 400, q);
  assert.equal(snap(), before, 'nothing changed');
  assert.equal((await del(a, 'tok_carl', '?revision=1')).status, 200);
  assert.equal(pageOf(a), undefined);
});

test('an unpublished draft without a Studio design (Anna\'s older draft) can be deleted by its owner; one transaction under the account\'s draft lock; a failure inside it changes nothing', async () => {
  S.resetDrafts();
  const keep = JSON.parse(JSON.stringify(pageOf('anna-draft')));
  try {
    S.lockEvents.length = 0;
    S.opts.failDeleteAfterPage = true;
    const before = snap();
    const failed = await del('anna-draft', 'tok_anna');
    assert.equal(failed.status, 500);
    assert.equal(snap(), before, 'a failure inside the transaction: everything as before');
    S.opts.failDeleteAfterPage = false;
    const ok = await del('anna-draft', 'tok_anna');
    assert.equal(ok.status, 200);
    assert.equal(pageOf('anna-draft'), undefined);
    assert.deepEqual(S.lockEvents.filter((e) => e.key === 'studio-draft:' + S.ANNA).map((e) => e.at), ['acquired', 'released', 'acquired', 'released'], 'the same lock POST /studio/drafts takes');
  } finally {
    S.opts.failDeleteAfterPage = false;
    if (!pageOf('anna-draft')) S.db.pages.push(keep);
    (S.db.reserved.supportAction || []).splice(0);
  }
});

test('the code: the shared deletion is exactly the legacy DELETE /lp/:slug\'s three operations (that route unchanged); the Studio handler checks owner, draft status, published version and revision inside the transaction before deleting; only the Studio route is opened on staging', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8').replace(/\r\n/g, '\n');
  const ctl = read('lpV3', 'studioDraftDeleteController.js');
  const fn = ctl.slice(ctl.indexOf('async function deleteStudioDraft('), ctl.indexOf('\n}\n', ctl.indexOf('async function deleteStudioDraft(')));
  const at = (s) => { const i = fn.indexOf(s); assert.ok(i !== -1, s); return i; };
  const ops = at('deletionSteps(tx,');
  for (const guard of ['pg_advisory_xact_lock', "throw new Refusal(404", "throw new Refusal(403", "page.status !== 'draft'", 'design.publishedVersionId', "error: 'revision_conflict'"]) assert.ok(at(guard) < ops, guard + ' before the deletion');
  assert.equal((fn.match(/\b(prisma|tx)\.\w+\.(delete|deleteMany|update|updateMany|upsert|create|createMany)\(/g) || []).length, 0, 'no write of its own: only the shared operations');
  // parity: the shared operations are the legacy handler's, in the same order, with the same deletion record
  const legacy = read('controllers', 'lpController.js');
  const start = legacy.indexOf('async function handleDeleteLP(');
  const lfn = legacy.slice(start, legacy.indexOf('\n}\n', start));
  const shared = read('services', 'landingPageDeletion.js');
  const OPS = ['.stampToken.deleteMany({ where: { slug } })', '.landingPage.delete({ where: { slug } })', '.supportAction.create({ data: Object.assign({}, DELETED_PAGE_MARKER, { targetId: slug, actorId'];
  const order = (txt, who) => OPS.map((op) => txt.indexOf(who + op));
  const inLegacy = order(lfn, 'prisma'), inShared = order(shared, 'db');
  assert.ok(inLegacy.every((i, k) => i !== -1 && (k === 0 || i > inLegacy[k - 1])), 'the legacy handler: the three operations, in order');
  assert.ok(inShared.every((i, k) => i !== -1 && (k === 0 || i > inShared[k - 1])), 'the shared deletion: the same three, in the same order');
  assert.ok(lfn.includes("actorType: 'human'") && shared.includes("actorType: 'human'"), 'the same deletion record');
  assert.ok(lfn.includes('await prisma.$transaction(['), 'the legacy route still runs them in one transaction, unchanged');
  const routes = read('lpV3', 'studioPagesRoutes.js');
  assert.ok(routes.includes("router.delete('/pages/:slug', requireAuth, requireVerifiedEmail, deleteStudioDraft);"));
  const gate = require('../src/middleware/stagingGate');
  assert.ok(gate.matchRoute('DELETE', '/studio/pages/a-b-1'));
  assert.equal(gate.matchRoute('DELETE', '/lp/a-b-1'), null, 'the legacy delete stays closed on staging');
});

(async () => {
  srv = await S.start();
  let passed = 0, failed = 0;
  console.log('studioDraftDelete');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e && e.stack).split('\n').slice(0, 10).join('\n       ')); }
  }
  S.resetDrafts();
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
