// ============================================================
// studioDrafts.test.js — Landing Page Studio V3 Phase D1: creating an
// unpublished Studio draft (POST /studio/drafts) and changing it (PUT
// /studio/pages/:slug/design), production mode (live Clerk email lookup).
//
// The real routes, requireAuth and requireVerifiedEmail on the in-memory
// database of helpers/studioPagesServer.js (transactions, the per-account
// advisory lock, undo on failure). Checked: sign-in and a verified email
// (decided by Clerk, never by the request); the owner is the session's
// account only; the body may carry four fields, nothing else; one creation
// writes exactly a draft LandingPage, its PageDesign (revision 1) and one log
// row, never the User, plan, trial or billing; 3 unpublished drafts, 5
// creations per rolling 24 hours (deleted drafts still count); simultaneous
// requests cannot pass either limit; idempotent requestId; the address
// format, free and not reserved; atomic (a failure leaves nothing).
//
// Real PostgreSQL concurrency: tests/manual (scratchpad) rehearsal, see the
// D1 verification report.
//
// Run: node tests/studioDrafts.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const crypto = require('crypto');
const V3 = require('../src/lpV3/core');
const { LIMITS } = require('../src/lpV3/draftPolicy');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let srv;
async function call(method, p, token, body, raw) {
  const headers = Object.assign(token ? { Authorization: 'Bearer ' + token } : {}, body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {});
  const r = await fetch(srv.origin + p, { method, headers, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { status: r.status, body: json, cache: r.headers.get('cache-control'), retryAfter: r.headers.get('retry-after') };
}
const create = (token, body) => call('POST', '/studio/drafts', token, body === undefined ? {} : body);
const myDrafts = (user) => S.db.pages.filter((p) => p.userId === user && p.status === 'draft');
const newPages = () => S.db.pages.filter((p) => String(p.id).startsWith('lp_new_'));
const uuid = () => crypto.randomUUID();
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{6}$/;
const usersBefore = S.copy(S.db.users);
const otherWrites = () => S.writes.slice();
// delete a draft as the account would (the creation log stays)
function deleteDraft(slug) {
  const p = S.db.pages.find((x) => x.slug === slug);
  S.db.pages.splice(S.db.pages.indexOf(p), 1);
  const i = S.db.pageDesigns.findIndex((d) => d.landingPageId === p.id);
  if (i !== -1) S.db.pageDesigns.splice(i, 1);
}
function ageLog(user, ms) { for (const r of S.db.draftLog) if (r.userId === user) r.createdAt = new Date(new Date(r.createdAt).getTime() - ms); }
function logRows(user, n, agoMs) { for (let i = 0; i < n; i++) S.db.draftLog.push({ id: 'seed_' + user + i + agoMs, userId: user, landingPageId: null, requestId: null, requestHash: null, createdAt: new Date(Date.now() - agoMs) }); }

test('signed out or forged token: 401 before anything is read, no Clerk lookup, nothing written', async () => {
  S.resetDrafts();
  const reads = S.reads.length;
  assert.equal((await create(null)).status, 401);
  assert.equal((await create('tok_forged')).status, 401);
  assert.equal(S.reads.length, reads);
  assert.deepEqual([S.emailChecks.length, S.draftWrites.length, newPages().length], [0, 0, 0]);
});

test('email not verified (decided by the live Clerk lookup): 403 email_unverified for creating AND saving; Clerk unreachable is also 403; nothing written', async () => {
  S.resetDrafts();
  const r = await create('tok_dana', { name: 'Danas Laden' });
  assert.deepEqual([r.status, r.body.error, r.cache], [403, 'email_unverified', 'private, no-store']);
  // a body claiming verification or another owner changes nothing
  assert.equal((await create('tok_dana', { emailVerified: true })).status, 403);
  assert.equal((await create('tok_dana', { userId: S.ANNA })).status, 403);
  assert.deepEqual(S.emailChecks, [S.DANA, S.DANA, S.DANA], 'the lookup is for the session account only');
  // the Clerk lookup fails: refused, even for a verified account
  S.opts.clerkDown = true;
  assert.equal((await create('tok_carl')).status, 403);
  assert.equal((await call('PUT', '/studio/pages/anna-shop/design', 'tok_anna', { design: S.SHOP_DRAFT, baseRevision: 4 })).status, 403, 'saving needs a verified email too');
  S.opts.clerkDown = false;
  assert.deepEqual([S.draftWrites.length, S.designWrites.length, newPages().length], [0, 0, 0]);
});

test('the body: only name, language, kind, requestId; anything else (owner, verification, status, address, plan) is 400 and never read', async () => {
  S.resetDrafts();
  for (const field of ['userId', 'ownerId', 'emailVerified', 'email_verified', 'status', 'slug', 'plan', 'trial', 'renderer', 'design', '__proto__x']) {
    const r = await create('tok_carl', { name: 'X', [field]: field === 'emailVerified' ? true : 'x' });
    assert.deepEqual([r.status, r.body.error, r.body.field], [400, 'invalid_body', field], field);
  }
  const bad = [[{ language: 'fr' }, 'language'], [{ kind: 'shop' }, 'kind'], [{ name: 42 }, 'name'], [{ name: '   ' }, 'name'], [{ name: 'x'.repeat(81) }, 'name'],
    [{ requestId: 'abc' }, 'requestId'], [{ requestId: 42 }, 'requestId'], [{ requestId: '00000000-0000-0000-0000-00000000000g' }, 'requestId']];
  for (const [b, field] of bad) assert.deepEqual([(await create('tok_carl', b)).status, (await create('tok_carl', b)).body.field], [400, field], JSON.stringify(b));
  for (const raw of ['[]', '"x"', 'null', '{bad']) assert.equal((await call('POST', '/studio/drafts', 'tok_carl', undefined, raw)).status, 400, raw);
  assert.deepEqual([S.draftWrites.length, newPages().length], [0, 0]);
});

test('success: one draft owned by the session account, revision 1, a valid starter design; exactly three rows written; no User, plan, trial or billing write', async () => {
  S.resetDrafts();
  const before = otherWrites();
  const r = await create('tok_carl', { name: '  Carls  Café \u0007 ', language: 'de', kind: 'creator' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.cache, 'private, no-store');
  assert.deepEqual(Object.keys(r.body).sort(), ['created', 'design', 'page', 'revision']);
  assert.equal(r.body.created, true);
  assert.equal(r.body.revision, 1);
  const { page } = r.body;
  assert.deepEqual([page.name, page.status, page.live, page.kind, page.renderer, page.useCase], ['Carls Café', 'draft', false, 'creator', 'legacy', 'creator']);
  assert.match(page.slug, SLUG_RE);
  assert.ok(page.slug.startsWith('carls-cafe-'), page.slug);
  const row = S.db.pages.find((p) => p.slug === page.slug);
  assert.deepEqual([row.userId, row.status, row.renderer, row.sections, row.businessName], [S.CARL, 'draft', 'legacy', null, 'Carls Café']);
  const stored = S.db.pageDesigns.find((d) => d.landingPageId === row.id);
  assert.deepEqual([stored.draftRevision, stored.updatedByUserId], [1, S.CARL]);
  assert.ok(V3.validateDesign(stored.draft, { cloudName: 'test-cloud' }).ok);
  assert.deepEqual(stored.draft, r.body.design);
  const sections = stored.draft.pages[0].sections;
  assert.deepEqual([sections.length, sections[0].type, sections[0].data.headline, stored.draft.settings.language], [1, 'hero', 'Carls Café', 'de']);
  assert.deepEqual(S.draftWrites.map((w) => w.op), ['studioDraftCreation.deleteMany', 'landingPage.create', 'pageDesign.create', 'studioDraftCreation.create']);
  assert.deepEqual(S.draftWrites.filter((w) => w.userId).map((w) => w.userId), [S.CARL, S.CARL, S.CARL]);
  assert.deepEqual(S.db.draftLog.map((l) => [l.userId, l.landingPageId]), [[S.CARL, row.id]]);
  assert.deepEqual(otherWrites(), before, 'no other write of any kind');
  assert.deepEqual(S.db.users, usersBefore, 'no User row created or changed');
  // defaults: English, business
  const en = await create('tok_carl', { language: 'en' });
  assert.deepEqual([en.status, en.body.page.name, en.body.page.kind, en.body.design.pages[0].title], [201, 'My page', 'business', 'Home']);
  assert.match(en.body.page.slug, /^my-page-[a-z0-9]{6}$/);
});

test('the new draft in the Studio: listed as not live, opens as the draft (revision 1), saves 1 -> 2, stale 409; stays a draft; another account 403', async () => {
  S.resetDrafts();
  const { body } = await create('tok_carl', { name: 'Carl Studio' });
  const slug = body.page.slug;
  const list = await call('GET', '/studio/pages', 'tok_carl');
  assert.deepEqual(list.body.pages.map((p) => [p.slug, p.live, p.hasDraft]), [[slug, false, true]]);
  const open = await call('GET', '/studio/pages/' + slug + '/design', 'tok_carl');
  assert.deepEqual([open.status, open.body.source, open.body.revision], [200, 'draft', 1]);
  const design = S.copy(open.body.design);
  design.pages[0].sections[0].data.headline = 'Geändert';
  const save = await call('PUT', '/studio/pages/' + slug + '/design', 'tok_carl', { design, baseRevision: 1 });
  assert.deepEqual([save.status, save.body.revision], [200, 2]);
  assert.equal((await call('PUT', '/studio/pages/' + slug + '/design', 'tok_carl', { design, baseRevision: 1 })).status, 409);
  assert.equal(S.db.pages.find((p) => p.slug === slug).status, 'draft');
  assert.equal((await call('GET', '/studio/pages/' + slug + '/design', 'tok_ben')).status, 403);
  assert.equal((await call('PUT', '/studio/pages/' + slug + '/design', 'tok_ben', { design, baseRevision: 2 })).status, 403);
  assert.equal((await call('GET', '/studio/pages', 'tok_ben')).body.pages.some((p) => p.slug === slug), false);
});

test('3 unpublished drafts per account: the 4th is 409 draft_limit; existing drafts count (Anna has one); deleting one frees a place', async () => {
  S.resetDrafts();
  for (let i = 0; i < 3; i++) assert.equal((await create('tok_carl', { name: 'Seite ' + i })).status, 201);
  const fourth = await create('tok_carl', { name: 'Vier' });
  assert.deepEqual([fourth.status, fourth.body], [409, { error: 'draft_limit', limit: 3, active: 3 }]);
  assert.equal(myDrafts(S.CARL).length, 3);
  // Anna already has the draft anna-draft: two more
  assert.equal((await create('tok_anna')).status, 201);
  assert.equal((await create('tok_anna')).status, 201);
  assert.equal((await create('tok_anna')).status, 409);
  // live pages do not count: Anna's anna-cafe and anna-shop are live
  deleteDraft(myDrafts(S.CARL)[0].slug);
  assert.equal((await create('tok_carl', { name: 'Wieder' })).status, 201);
});

test('5 creations per rolling 24 hours, deleted drafts included: the 6th is 429 with Retry-After; older log rows do not count and are pruned after 7 days', async () => {
  S.resetDrafts();
  for (let i = 0; i < 5; i++) {
    assert.equal((await create('tok_carl', { name: 'R' + i })).status, 201, 'creation ' + (i + 1));
    if (i % 2 === 0) deleteDraft(myDrafts(S.CARL)[0].slug); // delete and create again
  }
  assert.ok(myDrafts(S.CARL).length < 3, 'not the draft limit');
  const sixth = await create('tok_carl', { name: 'R6' });
  assert.deepEqual([sixth.status, sixth.body.error, sixth.body.limit], [429, 'draft_rate_limit', 5]);
  assert.ok(sixth.body.retryAfterSeconds > 86000 && sixth.body.retryAfterSeconds <= 86400, String(sixth.body.retryAfterSeconds));
  assert.equal(sixth.retryAfter, String(sixth.body.retryAfterSeconds));
  // the window rolls: 23 hours later, still refused; 24 hours and a minute later, allowed again
  ageLog(S.CARL, 23 * 3600e3);
  assert.equal((await create('tok_carl', { name: 'R7' })).status, 429);
  ageLog(S.CARL, 3600e3 + 60e3);
  assert.equal((await create('tok_carl', { name: 'R8' })).status, 201);
  // rows older than 7 days are removed by the next creation; rows in between are kept
  S.resetDrafts();
  logRows(S.CARL, 4, 8 * 864e5); logRows(S.CARL, 2, 2 * 864e5); logRows(S.BEN, 3, 8 * 864e5);
  assert.equal((await create('tok_carl')).status, 201);
  assert.deepEqual([S.db.draftLog.filter((r) => r.userId === S.CARL).length, S.db.draftLog.filter((r) => r.userId === S.BEN).length], [3, 3], 'only the account\'s own old rows');
});

test('simultaneous creations of one account: exactly 3 of 10 succeed; the lock is held by one request at a time; nothing extra written', async () => {
  S.resetDrafts();
  S.opts.draftDelayMs = 15;
  const out = await Promise.all(Array.from({ length: 10 }, (_, i) => create('tok_carl', { name: 'Gleichzeitig ' + i })));
  S.opts.draftDelayMs = 0;
  const codes = out.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, 201, 201, 409, 409, 409, 409, 409, 409, 409]);
  assert.equal(myDrafts(S.CARL).length, 3);
  assert.equal(S.db.draftLog.filter((r) => r.userId === S.CARL).length, 3);
  assert.equal(S.db.pageDesigns.filter((d) => myDrafts(S.CARL).some((p) => p.id === d.landingPageId)).length, 3);
  const ev = S.lockEvents.map((e) => e.at);
  for (let i = 0; i < ev.length; i += 2) assert.deepEqual(ev.slice(i, i + 2), ['acquired', 'released'], 'never two holders at once');
  assert.ok(S.lockEvents.every((e) => e.key === 'studio-draft:' + S.CARL));
});

test('simultaneous creations against the 24-hour limit: with 4 creations already, exactly 1 of 8 succeeds', async () => {
  S.resetDrafts();
  logRows(S.CARL, 4, 3600e3);
  S.opts.draftDelayMs = 10;
  const out = await Promise.all(Array.from({ length: 8 }, () => create('tok_carl')));
  S.opts.draftDelayMs = 0;
  assert.deepEqual(out.map((r) => r.status).sort(), [201, 429, 429, 429, 429, 429, 429, 429]);
  assert.equal(S.db.draftLog.filter((r) => r.userId === S.CARL).length, 5);
});

test('different accounts are not blocked by each other: their creations overlap and each gets its own limit', async () => {
  S.resetDrafts();
  S.opts.draftDelayMs = 30;
  const out = await Promise.all([create('tok_carl'), create('tok_ben'), create('tok_carl'), create('tok_ben')]);
  S.opts.draftDelayMs = 0;
  assert.deepEqual(out.map((r) => r.status), [201, 201, 201, 201]);
  // Ben's lock was acquired while Carl's was held
  const seq = S.lockEvents.map((e) => (e.key.endsWith(S.CARL) ? 'C' : 'B') + e.at[0]);
  assert.ok(seq.indexOf('Ba') < seq.indexOf('Cr') || seq.indexOf('Ca') < seq.indexOf('Br'), seq.join(' '));
  assert.deepEqual([myDrafts(S.CARL).length, myDrafts(S.BEN).length], [2, 2]);
});

test('idempotent requestId: a retry returns the same draft (200, created false) and counts nothing; simultaneous retries create one draft', async () => {
  S.resetDrafts();
  const id = uuid();
  const first = await create('tok_carl', { name: 'Einmal', requestId: id });
  const again = await create('tok_carl', { name: 'Einmal', requestId: id.toUpperCase() });
  assert.deepEqual([first.status, again.status, again.body.created], [201, 200, false]);
  assert.equal(again.body.page.slug, first.body.page.slug);
  assert.deepEqual([again.body.revision, again.body.design], [1, first.body.design]);
  assert.deepEqual([myDrafts(S.CARL).length, S.db.draftLog.length], [1, 1]);
  // simultaneous
  const id2 = uuid();
  S.opts.draftDelayMs = 10;
  const out = await Promise.all(Array.from({ length: 6 }, () => create('tok_carl', { name: 'Parallel', requestId: id2 })));
  S.opts.draftDelayMs = 0;
  assert.deepEqual(out.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 201]);
  assert.equal(new Set(out.map((r) => r.body.page.slug)).size, 1);
  assert.deepEqual([myDrafts(S.CARL).length, S.db.draftLog.length], [2, 2]);
  // a replay is not refused by the limits it already counted in
  assert.equal((await create('tok_carl', { name: 'Drei' })).status, 201);
  assert.equal((await create('tok_carl', { name: 'Einmal', requestId: id })).status, 200, 'at the draft limit, the replay still answers');
});

test('requestId: other values with the same id 409 request_id_conflict; a deleted draft 409 request_id_used; another account\'s id is its own', async () => {
  S.resetDrafts();
  const id = uuid();
  const first = await create('tok_carl', { name: 'Original', requestId: id });
  for (const b of [{ name: 'Anders' }, { name: 'Original', language: 'en' }, { name: 'Original', kind: 'creator' }]) {
    const r = await create('tok_carl', Object.assign({ requestId: id }, b));
    assert.deepEqual([r.status, r.body.error], [409, 'request_id_conflict'], JSON.stringify(b));
  }
  const ben = await create('tok_ben', { name: 'Original', requestId: id });
  assert.deepEqual([ben.status, ben.body.created], [201, true], 'Ben\'s request is not Carl\'s');
  assert.notEqual(ben.body.page.slug, first.body.page.slug);
  deleteDraft(first.body.page.slug);
  const gone = await create('tok_carl', { name: 'Original', requestId: id });
  assert.deepEqual([gone.status, gone.body.error], [409, 'request_id_used']);
  assert.equal(myDrafts(S.CARL).length, 0);
});

test('the address: name based, 6 random characters, never an existing page and never one reserved by a deleted page\'s data; a clash at insert retries', async () => {
  S.resetDrafts();
  const real = crypto.randomInt;
  const seq = [];
  crypto.randomInt = (n) => (seq.length ? seq.shift() : real(n));
  try {
    const six = (c) => Array(6).fill(c);
    // 1st try: an existing page; 2nd: reserved by a deleted page's subscribers; 3rd: free
    S.db.pages.push({ id: 'lp_taken', slug: 'neu-aaaaaa', userId: S.BEN, businessName: 'x', status: 'live', renderer: 'legacy', updatedAt: new Date() });
    S.db.reserved.subscriber = [{ id: 's1', slug: 'neu-bbbbbb' }];
    seq.push(...six(0), ...six(1), ...six(2));
    const r = await create('tok_carl', { name: 'Neu' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.page.slug, 'neu-cccccc');
    // a page takes the address between the check and the insert: the whole transaction runs again with a new one
    let once = true;
    S.opts.beforePageCreate = (data) => { if (once) { once = false; S.db.pages.push({ id: 'lp_race', slug: data.slug, userId: S.BEN, businessName: 'x', status: 'live', renderer: 'legacy', updatedAt: new Date() }); } };
    seq.push(...six(3), ...six(4));
    const raced = await create('tok_carl', { name: 'Neu' });
    assert.deepEqual([raced.status, raced.body.page.slug], [201, 'neu-eeeeee']);
    assert.equal(S.db.draftLog.filter((l) => l.userId === S.CARL).length, 2, 'the failed attempt left no log row');
    S.db.pages.splice(S.db.pages.findIndex((p) => p.id === 'lp_taken'), 1);
    S.db.pages.splice(S.db.pages.findIndex((p) => p.id === 'lp_race'), 1);
  } finally { crypto.randomInt = real; S.opts.beforePageCreate = null; }
  // transliteration and length
  const long = await create('tok_ben', { name: 'Bäckerei Müller & Söhne – Ölmühle Straße am Markt' });
  assert.match(long.body.page.slug, /^baeckerei-mueller-soehne-oelmuehle-stras-[a-z0-9]{6}$/);
  const none = await create('tok_ben', { name: '日本の店', language: 'en' });
  assert.match(none.body.page.slug, /^page-[a-z0-9]{6}$/);
});

test('atomic: a failure after the page row was written leaves nothing (page, design, log); before the D1 migration 503 drafts_unavailable', async () => {
  S.resetDrafts();
  S.opts.failDraftAfterPage = true;
  const r = await create('tok_carl', { name: 'Fehler' });
  S.opts.failDraftAfterPage = false;
  assert.deepEqual([r.status, newPages().length, S.db.draftLog.length], [500, 0, 0]);
  assert.ok(!JSON.stringify(r.body).includes('database'), 'no internals in the answer');
  S.opts.draftTableMissing = true;
  const m = await create('tok_carl', { name: 'Ohne Tabelle' });
  S.opts.draftTableMissing = false;
  assert.deepEqual([m.status, m.body.error, newPages().length], [503, 'drafts_unavailable', 0]);
});

test('hostile names are plain text: stored as typed (controls removed), the design validates and renders it escaped', async () => {
  S.resetDrafts();
  const name = '<img src=x onerror=alert(1)> "Anna" & \'Co\'';
  const r = await create('tok_carl', { name });
  assert.equal(r.status, 201);
  assert.equal(r.body.page.name, name);
  const html = V3.renderDesign ? V3.renderDesign(r.body.design, { cloudName: 'test-cloud' }) : null;
  if (html) { const s = typeof html === 'string' ? html : html.html; assert.ok(!s.includes('<img src=x'), 'escaped'); }
});

(async () => {
  srv = await S.start();
  let passed = 0, failed = 0;
  console.log('studioDrafts');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e && e.message).split('\n').slice(0, 14).join('\n       ')); }
  }
  S.resetDrafts();
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
