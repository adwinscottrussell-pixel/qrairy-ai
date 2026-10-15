// ============================================================
// dealImageLifecycle.test.js — reversible quarantine of unreferenced Deal
// images (services/dealImageLifecycle.js + scripts/deal-images-*.js, 3B.5c).
// Cloudinary and the database are stand-ins: the Cloudinary stand-in behaves
// like the real account did in the 3B.5b verification (api.update REPLACES
// tags/context; access_control token/anonymous) and throws on any delete or
// rename. No network, no database.
//
//   G namespace guard   M mode   D dry run   W waiting period (two passes)
//   R references        S shared references   U uncertain   F failures
//   Q quarantined images   X restore   N never delete   L limits   O logging   C scripts
//
// Run: node tests/dealImageLifecycle.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
delete process.env.APP_ENV;   // production folder: qraivy-deals
const L = require('../src/services/dealImageLifecycle');
const reconcileScript = require('../scripts/deal-images-reconcile');
const restoreScript = require('../scripts/deal-images-restore');

const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const OLD = NOW - 3 * 60 * MIN;                          // uploaded 3 hours ago
const id = (deal, ts = OLD) => `qraivy-deals/deal-${deal}-${ts}`;
const APPLY_ENV = { DEAL_IMAGE_CLEANUP: 'quarantine' };

// ── Cloudinary stand-in ─────────────────────────────────────────
function fakeCloudinary(initial = []) {
  const assets = new Map();
  const writes = [];
  const fail = { update: new Set(), read: new Set(), removeTag: new Set(), ignoreAccess: new Set() };
  for (const a of initial) assets.set(a.public_id, { version: 1700000000, secure_url: `https://res.cloudinary.com/demo/image/upload/v1700000000/${a.public_id}.jpg`, tags: [], context: {}, access_control: null, ...a });
  const view = (a) => ({ public_id: a.public_id, version: a.version, secure_url: a.secure_url, tags: [...a.tags], context: Object.keys(a.context).length ? { custom: { ...a.context } } : undefined, access_control: a.access_control ? a.access_control.map((x) => ({ ...x })) : undefined });
  const get = (pid) => { const a = assets.get(pid); if (!a) { const e = new Error('not found'); e.error = { http_code: 404, message: 'Resource not found' }; throw e; } return a; };
  const never = (name) => () => { throw new Error('FORBIDDEN: ' + name + ' must never be called'); };
  return {
    assets, writes, fail,
    api: {
      resources: async ({ prefix, max_results = 10, next_cursor }) => {
        const ids = [...assets.keys()].filter((k) => k.startsWith(prefix)).sort();
        const start = next_cursor ? Number(next_cursor) : 0;
        const slice = ids.slice(start, start + max_results);
        return { resources: slice.map((k) => view(assets.get(k))), next_cursor: start + max_results < ids.length ? String(start + max_results) : undefined };
      },
      resources_by_tag: async (tag, { next_cursor } = {}) => {
        const ids = [...assets.keys()].filter((k) => assets.get(k).tags.includes(tag)).sort();
        return { resources: ids.map((k) => view(assets.get(k))), next_cursor: undefined };
      },
      resource: async (pid) => { if (fail.read.has(pid)) throw Object.assign(new Error('read failed'), { error: { http_code: 500, message: 'read failed' } }); return view(get(pid)); },
      update: async (pid, opts) => {
        writes.push(['update', pid, JSON.parse(JSON.stringify(opts))]);
        if (fail.update.has(pid)) throw Object.assign(new Error('update failed'), { error: { http_code: 500, message: 'update failed' } });
        const a = get(pid);
        if (opts.access_control && !fail.ignoreAccess.has(pid)) a.access_control = opts.access_control.map((x) => ({ ...x }));
        if (opts.tags) a.tags = [...opts.tags];                 // REPLACES, like the real API
        if (opts.context) a.context = { ...opts.context };      // REPLACES, like the real API
        return view(a);
      },
      delete_resources: never('api.delete_resources'), delete_resources_by_prefix: never('api.delete_resources_by_prefix'), delete_resources_by_tag: never('api.delete_resources_by_tag'),
    },
    uploader: {
      remove_tag: async (tag, pids) => { writes.push(['remove_tag', pids.join(), tag]); for (const pid of pids) { if (fail.removeTag.has(pid)) { fail.removeTag.delete(pid); throw new Error('remove_tag failed'); } const a = get(pid); a.tags = a.tags.filter((t) => t !== tag); } return {}; },
      remove_all_context: async (pids) => { writes.push(['remove_all_context', pids.join()]); for (const pid of pids) get(pid).context = {}; return {}; },
      destroy: never('uploader.destroy'), rename: never('uploader.rename'),
    },
  };
}

// ── Database stand-in: $queryRaw answers one row per reference source ──
function fakePrisma(refs = {}, { failWith = null, rows = null } = {}) {
  const calls = [];
  return {
    calls,
    $queryRaw: async (strings, ...values) => {
      calls.push(values[0]);
      if (failWith) throw failWith;
      if (rows) return rows;
      const r = typeof refs === 'function' ? refs(values[0], calls.length) : (refs[values[0]] || {});
      return L.REFERENCE_SOURCES.map((src) => ({ src, n: r[src] || 0 }));
    },
  };
}
function capture() { const lines = []; const log = L.makeLogger((l) => lines.push(l)); log.lines = lines; log.events = () => lines.map((l) => JSON.parse(l.slice('[deals-images] '.length)).event); return log; }
const run = (opts) => L.reconcile({ env: APPLY_ENV, apply: true, now: NOW, log: capture(), ...opts });

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── G. Namespace guard ──────────────────────────────────────────
test('G. only <ACTIVE_DEAL_IMAGE_FOLDER>/deal-<dealId>-<13-digit ms> counts as a deal image', () => {
  assert.deepEqual(L.parseDealImageId(id('cmv9abc', 1792076672000)), { dealId: 'cmv9abc', uploadedAt: 1792076672000 });
  for (const bad of ['qraivy-deals-staging/deal-x-1792076672000', 'qraivy-logos/logo-cafe', 'qraivy-wallet-strips/strip-a', 'images/deals/starter/bakery-bread-01',
    'qraivy-deals/step0-capability-1792076672000-ab12', 'qraivy-deals/deal-x-179207667200', 'qraivy-deals/deal-x-1792076672000/extra', 'qraivy-deals/../qraivy-logos/x',
    'qraivy-deals/deal--1792076672000', 'QRAIVY-DEALS/deal-x-1792076672000', '', null, 42]) {
    assert.equal(L.parseDealImageId(bad), null, String(bad));
  }
});

// ── M. Mode ─────────────────────────────────────────────────────
test('M. dry run unless apply:true AND DEAL_IMAGE_CLEANUP=quarantine (exactly)', () => {
  assert.equal(L.resolveMode({}), 'dry-run');
  assert.equal(L.resolveMode({ apply: true, env: {} }), 'dry-run');
  assert.equal(L.resolveMode({ apply: false, env: APPLY_ENV }), 'dry-run');
  for (const v of ['Quarantine', 'log', 'on', 'true', '1', 'off']) assert.equal(L.resolveMode({ apply: true, env: { DEAL_IMAGE_CLEANUP: v } }), 'dry-run', v);
  assert.equal(L.resolveMode({ apply: true, env: { DEAL_IMAGE_CLEANUP: ' quarantine ' } }), 'apply', 'surrounding spaces trimmed');
  assert.equal(L.resolveMode({ apply: 'yes', env: APPLY_ENV }), 'dry-run', 'apply must be the boolean true');
  assert.equal(L.resolveMode({ apply: true, env: APPLY_ENV }), 'apply');
});

// ── D. Dry run ──────────────────────────────────────────────────
test('D. dry run writes nothing and reports what it would do', async () => {
  const marked = new Date(NOW - 20 * MIN).toISOString();
  const cld = fakeCloudinary([{ public_id: id('a') }, { public_id: id('b'), context: { qraivy_quarantine_candidate_at: marked } }, { public_id: id('c') }]);
  const s = await L.reconcile({ cloudinary: cld, prisma: fakePrisma({ [id('c')]: { deal_live: 1 } }), now: NOW, log: capture(), env: APPLY_ENV });   // apply not passed
  assert.equal(s.mode, 'dry-run');
  assert.deepEqual(cld.writes, []);
  assert.equal(s.would.mark, 1); assert.equal(s.would.quarantine, 1); assert.equal(s.referenced, 1);
  assert.equal(cld.assets.get(id('a')).access_control, null);
});

// ── W. Two-pass waiting period ──────────────────────────────────
test('W. pass 1 marks, a run within 10 minutes only waits, a run after 10 minutes re-checks and quarantines', async () => {
  const cld = fakeCloudinary([{ public_id: id('w'), tags: ['brand'], context: { alt: 'Croissant' } }]);
  const db = fakePrisma({});
  const s1 = await run({ cloudinary: cld, prisma: db, now: NOW });
  assert.equal(s1.marked, 1);
  const a = cld.assets.get(id('w'));
  assert.equal(a.context.qraivy_quarantine_candidate_at, new Date(NOW).toISOString());
  assert.equal(a.context.alt, 'Croissant', 'existing context kept'); assert.deepEqual(a.tags, ['brand'], 'tags untouched');
  const s2 = await run({ cloudinary: cld, prisma: db, now: NOW + 9 * MIN + 59 * 1000 });
  assert.equal(s2.waiting, 1); assert.equal(s2.quarantined, 0); assert.equal(a.access_control, null);
  const s3 = await run({ cloudinary: cld, prisma: db, now: NOW + 10 * MIN });
  assert.equal(s3.quarantined, 1);
  assert.deepEqual(a.access_control, [{ access_type: 'token' }]);
  assert.deepEqual(a.tags, ['brand', L.QUARANTINE_TAG], 'existing tags kept + quarantine tag');
  assert.equal(a.context.alt, 'Croissant'); assert.equal(a.context.qraivy_deal_id, 'w');
  assert.equal(a.context.qraivy_quarantine_reason, 'unreferenced');
  assert.equal(a.context.qraivy_quarantined_at, new Date(NOW + 10 * MIN).toISOString());
  assert.ok(!('qraivy_quarantine_candidate_at' in a.context), 'candidate mark replaced by the quarantine keys');
  assert.equal(a.public_id, id('w')); assert.equal(a.version, 1700000000);
  assert.ok(a.secure_url.endsWith(`/v1700000000/${id('w')}.jpg`), 'URL unchanged');
});

test('W. the waiting period can never be shorter than 10 minutes; uploads younger than 10 minutes are not touched', async () => {
  assert.equal(L.WAIT_MS, 10 * MIN); assert.equal(L.MIN_ASSET_AGE_MS, 10 * MIN);
  const fresh = id('n', NOW - 9 * MIN);
  const cld = fakeCloudinary([{ public_id: fresh }]);
  const db = fakePrisma({});
  const s = await run({ cloudinary: cld, prisma: db });
  assert.equal(s.too_new, 1); assert.deepEqual(cld.writes, []); assert.deepEqual(db.calls, [], 'not even checked');
});

test('W. referenced again during the waiting period: re-check finds it, mark removed, never quarantined', async () => {
  const pid = id('race');
  const cld = fakeCloudinary([{ public_id: pid, context: { qraivy_quarantine_candidate_at: new Date(NOW - 30 * MIN).toISOString(), alt: 'x' } }]);
  const db = fakePrisma((p, call) => (call === 1 ? {} : { deal_draft: 1 }));   // first check clear, re-check referenced
  const s = await run({ cloudinary: cld, prisma: db });
  assert.equal(s.quarantined, 0); assert.equal(s.unmarked, 1);
  assert.equal(db.calls.length, 2, 'checked twice: once, and again right before quarantine');
  const a = cld.assets.get(pid);
  assert.equal(a.access_control, null); assert.deepEqual(a.context, { alt: 'x' });
});

// ── R. Every reference source keeps an image ────────────────────
test('R. a reference in any source keeps the image: draft, published, archived deals, landing pages, QR, push, pass, StadtPocket, support', async () => {
  for (const src of L.REFERENCE_SOURCES) {
    const pid = id('ref' + src.replace(/_/g, ''));
    const cld = fakeCloudinary([{ public_id: pid, context: { qraivy_quarantine_candidate_at: new Date(NOW - 60 * MIN).toISOString() } }]);
    const s = await run({ cloudinary: cld, prisma: fakePrisma({ [pid]: { [src]: 1 } }) });
    assert.equal(s.referenced, 1, src); assert.equal(s.quarantined, 0, src); assert.equal(s.unmarked, 1, src);
    assert.equal(cld.assets.get(pid).access_control, null, src);
  }
  assert.deepEqual(L.REFERENCE_SOURCES, ['deal_live', 'deal_draft', 'deal_other_fields', 'landing_page', 'qr', 'push_campaign', 'pass', 'stadtpocket_listing', 'stadtpocket_location', 'support_action']);
});

// ── S. Shared references ────────────────────────────────────────
test('S. shared image: kept while ANY reference remains (two deals, then deal + landing page, then nothing)', async () => {
  const pid = id('shared');
  const cld = fakeCloudinary([{ public_id: pid }]);
  const refs = { [pid]: { deal_live: 1, deal_draft: 1 } };
  const db = fakePrisma(refs);
  assert.equal((await run({ cloudinary: cld, prisma: db })).referenced, 1);
  refs[pid] = { landing_page: 1 };
  assert.equal((await run({ cloudinary: cld, prisma: db, now: NOW + 20 * MIN })).referenced, 1);
  refs[pid] = {};
  assert.equal((await run({ cloudinary: cld, prisma: db, now: NOW + 40 * MIN })).marked, 1, 'only now a candidate');
  assert.equal((await run({ cloudinary: cld, prisma: db, now: NOW + 51 * MIN })).quarantined, 1);
});

// ── U. Uncertain -> never quarantine ────────────────────────────
test('U. a failing or unexpected reference check means: skip, write nothing', async () => {
  const marked = { qraivy_quarantine_candidate_at: new Date(NOW - 60 * MIN).toISOString() };
  for (const db of [fakePrisma({}, { failWith: new Error('connection refused') }), fakePrisma({}, { rows: [] }), fakePrisma({}, { rows: [{ src: 'deal_live', n: 0 }] }),
    fakePrisma({}, { rows: L.REFERENCE_SOURCES.map((src) => ({ src: src === 'qr' ? 'unknown' : src, n: 0 })) }), fakePrisma({}, { rows: L.REFERENCE_SOURCES.map((src) => ({ src, n: 'many' })) })]) {
    const cld = fakeCloudinary([{ public_id: id('u'), context: { ...marked } }]);
    const s = await run({ cloudinary: cld, prisma: db });
    assert.equal(s.uncertain, 1); assert.equal(s.quarantined, 0); assert.deepEqual(cld.writes, []);
  }
});

test('U. a failing re-check right before quarantine also skips', async () => {
  const pid = id('u2');
  const cld = fakeCloudinary([{ public_id: pid, context: { qraivy_quarantine_candidate_at: new Date(NOW - 60 * MIN).toISOString() } }]);
  const db = { calls: 0, $queryRaw: async () => { db.calls++; if (db.calls === 2) throw new Error('timeout'); return L.REFERENCE_SOURCES.map((src) => ({ src, n: 0 })); } };
  const s = await run({ cloudinary: cld, prisma: db });
  assert.equal(s.uncertain, 1); assert.equal(s.quarantined, 0); assert.deepEqual(cld.writes, []);
});

// ── F. Failures ─────────────────────────────────────────────────
test('F. a Cloudinary failure on one image is logged and the others are still processed', async () => {
  const old = new Date(NOW - 60 * MIN).toISOString();
  const cld = fakeCloudinary([{ public_id: id('f1'), context: { qraivy_quarantine_candidate_at: old } }, { public_id: id('f2'), context: { qraivy_quarantine_candidate_at: old } }]);
  cld.fail.update.add(id('f1'));
  const log = capture();
  const s = await L.reconcile({ cloudinary: cld, prisma: fakePrisma({}), apply: true, env: APPLY_ENV, now: NOW, log });
  assert.equal(s.errors, 1); assert.equal(s.quarantined, 1);
  assert.equal(cld.assets.get(id('f1')).access_control, null, 'failed update changed nothing');
  assert.deepEqual(cld.assets.get(id('f2')).access_control, [{ access_type: 'token' }]);
  assert.ok(log.events().includes('error'));
});

test('F. quarantine that does not verify (access not applied) is reported, not counted as done', async () => {
  const cld = fakeCloudinary([{ public_id: id('f3'), context: { qraivy_quarantine_candidate_at: new Date(NOW - 60 * MIN).toISOString() } }]);
  cld.fail.ignoreAccess.add(id('f3'));
  const log = capture();
  const s = await L.reconcile({ cloudinary: cld, prisma: fakePrisma({}), apply: true, env: APPLY_ENV, now: NOW, log });
  assert.equal(s.quarantined, 0); assert.equal(s.errors, 1);
  assert.ok(log.events().includes('quarantine_unverified'));
});

test('F. an image that cannot be read right before quarantine is skipped as an error', async () => {
  const cld = fakeCloudinary([{ public_id: id('f4'), context: { qraivy_quarantine_candidate_at: new Date(NOW - 60 * MIN).toISOString() } }]);
  cld.fail.read.add(id('f4'));
  const s = await run({ cloudinary: cld, prisma: fakePrisma({}) });
  assert.equal(s.errors, 1); assert.equal(s.quarantined, 0); assert.deepEqual(cld.writes, []);
});

// ── Q. Already quarantined ──────────────────────────────────────
test('Q. quarantined and still unreferenced: left alone; quarantined but referenced again: restored (dry run: reported)', async () => {
  const q = { tags: [L.QUARANTINE_TAG], context: { qraivy_quarantined_at: 'x', qraivy_quarantine_reason: 'unreferenced', qraivy_deal_id: 'q' }, access_control: [{ access_type: 'token' }] };
  const cld = fakeCloudinary([{ public_id: id('q1'), ...q }, { public_id: id('q2'), ...JSON.parse(JSON.stringify(q)) }]);
  const db = fakePrisma({ [id('q2')]: { landing_page: 1 } });
  const dry = await L.reconcile({ cloudinary: cld, prisma: db, now: NOW, log: capture() });
  assert.equal(dry.already_quarantined, 1); assert.equal(dry.would.restore, 1); assert.deepEqual(cld.writes, []);
  const s = await run({ cloudinary: cld, prisma: db });
  assert.equal(s.restored, 1);
  assert.deepEqual(cld.assets.get(id('q2')).access_control, [{ access_type: 'anonymous' }]);
  assert.deepEqual(cld.assets.get(id('q1')).access_control, [{ access_type: 'token' }], 'unreferenced one stays quarantined');
});

// ── X. Restore ──────────────────────────────────────────────────
const quarantinedAsset = (pid, extra = {}) => ({ public_id: pid, tags: ['brand', L.QUARANTINE_TAG], context: { alt: 'Croissant', qraivy_quarantined_at: 'x', qraivy_quarantine_reason: 'unreferenced', qraivy_deal_id: 'd' }, access_control: [{ access_type: 'token' }], ...extra });

test('X. restore: anonymous access, only the quarantine tag and keys removed, own tags/context kept, same ID/version/URL', async () => {
  const pid = id('x1');
  const cld = fakeCloudinary([quarantinedAsset(pid)]);
  const before = { ...cld.assets.get(pid) };
  const r = await L.restoreImage({ cloudinary: cld, publicId: pid, log: capture(), verifyDelivery: false });
  assert.deepEqual(r, { status: 'restored', delivery: 'not_checked' });
  const a = cld.assets.get(pid);
  assert.deepEqual(a.access_control, [{ access_type: 'anonymous' }]);
  assert.deepEqual(a.tags, ['brand']); assert.deepEqual(a.context, { alt: 'Croissant' });
  assert.equal(a.public_id, before.public_id); assert.equal(a.version, before.version); assert.equal(a.secure_url, before.secure_url);
});

test('X. restore of a real-world upload with no own tags/context leaves both empty (remove_tag + remove_all_context)', async () => {
  const pid = id('x2');
  const cld = fakeCloudinary([{ public_id: pid, tags: [L.QUARANTINE_TAG], context: { qraivy_quarantined_at: 'x', qraivy_quarantine_reason: 'unreferenced', qraivy_deal_id: 'd' }, access_control: [{ access_type: 'token' }] }]);
  await L.restoreImage({ cloudinary: cld, publicId: pid, log: capture(), verifyDelivery: false });
  const a = cld.assets.get(pid);
  assert.deepEqual(a.tags, []); assert.deepEqual(a.context, {}); assert.deepEqual(a.access_control, [{ access_type: 'anonymous' }]);
  assert.ok(cld.writes.some((w) => w[0] === 'remove_all_context'));
});

test('X. delivery check waits for the CDN: 401, 401, then 200 -> public; never 200 -> "not_yet_public" (not an error)', async () => {
  const pid = id('x3');
  const cld = fakeCloudinary([quarantinedAsset(pid)]);
  const statuses = [401, 401, 200];
  let slept = 0;
  const r = await L.restoreImage({ cloudinary: cld, publicId: pid, log: capture(), fetchImpl: async () => ({ status: statuses.shift() }), sleep: async (ms) => { slept += ms; }, timing: {} });
  assert.deepEqual(r, { status: 'restored', delivery: 'public' });
  assert.equal(slept, 60000 + 15000 + 15000, 'first look after 60 s (observed ~33 s), then every 15 s');
  const cld2 = fakeCloudinary([quarantinedAsset(pid)]);
  const r2 = await L.restoreImage({ cloudinary: cld2, publicId: pid, log: capture(), fetchImpl: async () => ({ status: 401 }), sleep: async () => {}, timing: { firstWaitMs: 1, pollMs: 1, maxMs: 3 } });
  assert.deepEqual(r2, { status: 'restored', delivery: 'not_yet_public' });
});

test('X. restore refuses non-deal IDs, skips images that are not quarantined, and completes after an earlier partial failure', async () => {
  const cld = fakeCloudinary([{ public_id: id('x4') }, quarantinedAsset(id('x5'))]);
  await assert.rejects(L.restoreImage({ cloudinary: cld, publicId: 'qraivy-logos/logo-cafe', log: capture() }), /not a deal image id/);
  assert.equal((await L.restoreImage({ cloudinary: cld, publicId: id('x4'), log: capture() })).status, 'not_quarantined');
  assert.deepEqual(cld.writes, []);
  cld.fail.removeTag.add(id('x5'));
  await assert.rejects(L.restoreImage({ cloudinary: cld, publicId: id('x5'), log: capture(), verifyDelivery: false }), /remove_tag failed/);
  assert.ok(L.isQuarantined({ tags: cld.assets.get(id('x5')).tags }), 'still tagged, so a re-run will pick it up');
  assert.equal((await L.restoreImage({ cloudinary: cld, publicId: id('x5'), log: capture(), verifyDelivery: false })).status, 'restored');
  assert.deepEqual(cld.assets.get(id('x5')).tags, ['brand']);
});

test('X. quarantine then restore round trip: everything as before except nothing', async () => {
  const pid = id('rt');
  const cld = fakeCloudinary([{ public_id: pid, tags: ['brand'], context: { alt: 'A' } }]);
  const before = JSON.stringify(cld.assets.get(pid));
  await L.quarantineImage({ cloudinary: cld, publicId: pid, reason: 'unreferenced', log: capture(), now: NOW });
  await L.restoreImage({ cloudinary: cld, publicId: pid, log: capture(), verifyDelivery: false });
  const after = cld.assets.get(pid);
  assert.deepEqual(after.access_control, [{ access_type: 'anonymous' }]);
  assert.equal(JSON.stringify({ ...after, access_control: null }), before.replace('"access_control":null', '"access_control":null'));
});

// ── N. Never delete ─────────────────────────────────────────────
test('N. no code path deletes or renames: none of the delete/rename calls exist in the module or scripts', () => {
  for (const f of ['src/services/dealImageLifecycle.js', 'scripts/deal-images-reconcile.js', 'scripts/deal-images-restore.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.doesNotMatch(src, /\.destroy\(|delete_resources|\.rename\(|remove_all_tags/, f);
  }
});
test('N. a full apply run over many images never calls a delete (the stand-in would throw)', async () => {
  const old = new Date(NOW - 60 * MIN).toISOString();
  const cld = fakeCloudinary(Array.from({ length: 30 }, (_, i) => ({ public_id: id('n' + i), context: i % 2 ? { qraivy_quarantine_candidate_at: old } : {} })));
  const s = await run({ cloudinary: cld, prisma: fakePrisma({}) });
  assert.equal(s.errors, 0); assert.equal(s.quarantined, 15); assert.equal(s.marked, 15);
  assert.equal(cld.assets.size, 30, 'every image still exists');
});

// ── L. Limits ───────────────────────────────────────────────────
test('L. one run looks at most at `limit` images, paging 100 at a time; other folders are never listed', async () => {
  const cld = fakeCloudinary([...Array.from({ length: 250 }, (_, i) => ({ public_id: id('l' + String(i).padStart(3, '0')) })), { public_id: 'qraivy-logos/logo-x' }, { public_id: 'qraivy-deals/step0-capability-1-ab' }]);
  const s = await L.reconcile({ cloudinary: cld, prisma: fakePrisma({}), now: NOW, log: capture(), limit: 120 });
  assert.equal(s.seen, 120); assert.equal(s.would.mark, 120); assert.equal(s.skipped_namespace, 0);
});

// ── O. Logging ──────────────────────────────────────────────────
test('O. logs are JSON lines with an event name; no URLs, no secrets', async () => {
  const pid = id('o');
  const cld = fakeCloudinary([{ public_id: pid, context: { qraivy_quarantine_candidate_at: new Date(NOW - 60 * MIN).toISOString() } }]);
  const log = capture();
  await L.reconcile({ cloudinary: cld, prisma: fakePrisma({}), apply: true, env: { ...APPLY_ENV, CLOUDINARY_API_SECRET: 'sekret' }, now: NOW, log });
  assert.deepEqual(log.events(), ['run_start', 'quarantined', 'run_end']);
  for (const l of log.lines) { assert.ok(l.startsWith('[deals-images] {')); assert.doesNotMatch(l, /https?:|sekret/); }
});

// ── C. Scripts ──────────────────────────────────────────────────
test('C. reconcile script: dry run by default; --apply without DEAL_IMAGE_CLEANUP=quarantine is refused (still dry run)', async () => {
  const cld = fakeCloudinary([{ public_id: id('c1') }]);
  const s1 = await reconcileScript.main([], { cloudinary: cld, prisma: fakePrisma({}), env: {}, log: capture(), now: NOW });
  assert.equal(s1.mode, 'dry-run');
  const log = capture();
  const s2 = await reconcileScript.main(['--apply'], { cloudinary: cld, prisma: fakePrisma({}), env: { DEAL_IMAGE_CLEANUP: 'log' }, log, now: NOW });
  assert.equal(s2.mode, 'dry-run'); assert.ok(log.events().includes('apply_refused'));
  assert.deepEqual(cld.writes, []);
  const s3 = await reconcileScript.main(['--apply', '--limit', '5'], { cloudinary: cld, prisma: fakePrisma({}), env: APPLY_ENV, log: capture(), now: NOW });
  assert.equal(s3.mode, 'apply'); assert.equal(s3.marked, 1);
  assert.throws(() => reconcileScript.parseArgs(['--limit', '0'])); assert.throws(() => reconcileScript.parseArgs(['--force']));
});

test('C. restore script: needs --id or --all-quarantined, refuses non-deal IDs, dry run by default, applies with both opt-ins', async () => {
  assert.throws(() => restoreScript.parseArgs([]), /--id/);
  assert.throws(() => restoreScript.parseArgs(['--id', 'qraivy-logos/logo-x']), /not a QRAIVY deal image id/);
  assert.throws(() => restoreScript.parseArgs(['--id', id('a'), '--all-quarantined']));
  const cld = fakeCloudinary([quarantinedAsset(id('c2')), quarantinedAsset(id('c3')), { public_id: 'qraivy-logos/logo-x', tags: [L.QUARANTINE_TAG] }]);
  const dry = await restoreScript.main(['--all-quarantined'], { cloudinary: cld, env: APPLY_ENV, log: capture() });
  assert.equal(dry.mode, 'dry-run'); assert.equal(dry.would_restore, 2, 'the logo with the same tag is not a deal image'); assert.deepEqual(cld.writes, []);
  const real = await restoreScript.main(['--all-quarantined', '--apply', '--no-verify'], { cloudinary: cld, env: APPLY_ENV, log: capture() });
  assert.equal(real.restored, 2);
  assert.deepEqual(cld.assets.get('qraivy-logos/logo-x').tags, [L.QUARANTINE_TAG], 'non-deal asset untouched');
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
