// ============================================================
// pushPageSubscriptions.test.js — Phase 5.5C.3: independent push
// subscriptions per business.
//
// One browser has one push address (WebPushSubscription, unique endpoint);
// its opt-ins are per page (WebPushPageSubscription). Covered here:
// two businesses on one browser, independent subscribe/unsubscribe,
// cross-business isolation, recipient selection, one delivery per address,
// existing subscriptions (migration), no inferred consent, expired
// addresses, the stamp message, and the page's own behaviour (denied,
// dismissed, unsupported, failed registration, "subscribed" only when the
// server confirms it, opting out of one business).
// In-memory Prisma; push sending is recorded, nothing leaves the process.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
const ROOT = path.join(__dirname, '..', '..');
const lf = (s) => s.split('\r\n').join('\n');

// ── in-memory database ────────────────────────────────────────
let db;
function resetDb() {
  db = { pages: {}, devices: [], links: [], seq: 0, campaigns: [] };
}
resetDb();
const tick = () => new Date(Date.UTC(2026, 9, 17, 12, 0, db.seq++));
const deviceById = (id) => db.devices.find((d) => d.id === id);
function matches(row, where, kind) {
  if (!where) return true;
  return Object.keys(where).every((k) => {
    const w = where[k];
    if (k === 'OR') return w.some((x) => matches(row, x, kind));
    if (k === 'subscription') { const d = deviceById(row.subscriptionId); return !!d && matches(d, w, 'device'); }
    const v = row[k];
    if (w === null) return v === null || v === undefined;
    if (w && typeof w === 'object' && !(w instanceof Date)) {
      if ('in' in w) return w.in.includes(v);
      if ('not' in w) return w.not === null ? (v !== null && v !== undefined) : v !== w.not;
    }
    return v === w;
  });
}
const pick = (row, select) => { if (!select) return Object.assign({}, row); const o = {}; Object.keys(select).forEach((k) => { o[k] = row[k]; }); return o; };
const mockPrisma = {
  landingPage: {
    async findUnique({ where: { slug }, select }) { const p = db.pages[slug]; return p ? pick(p, select) : null; },
    async update({ where: { slug } }) { return db.pages[slug]; },
  },
  webPushSubscription: {
    async upsert({ where: { endpoint }, update, create }) {
      let d = db.devices.find((x) => x.endpoint === endpoint);
      if (d) Object.assign(d, update);
      else { d = Object.assign({ id: 'dev' + (db.devices.length + 1), cid: null, expiredAt: null, createdAt: tick() }, create); db.devices.push(d); }
      return Object.assign({}, d);
    },
    async findUnique({ where: { endpoint } }) { const d = db.devices.find((x) => x.endpoint === endpoint); return d ? Object.assign({}, d) : null; },
    async updateMany({ where, data }) { const rows = db.devices.filter((d) => matches(d, where, 'device')); rows.forEach((d) => Object.assign(d, data)); return { count: rows.length }; },
  },
  webPushPageSubscription: {
    async findUnique({ where: { subscriptionId_slug: { subscriptionId, slug } } }) { const l = db.links.find((x) => x.subscriptionId === subscriptionId && x.slug === slug); return l ? Object.assign({}, l) : null; },
    async create({ data }) {
      if (db.links.some((x) => x.subscriptionId === data.subscriptionId && x.slug === data.slug)) throw new Error('unique violation');
      const l = Object.assign({ id: 'link' + (db.links.length + 1), cid: null, unsubscribedAt: null, createdAt: tick() }, data); db.links.push(l); return Object.assign({}, l);
    },
    async update({ where: { id }, data }) { const l = db.links.find((x) => x.id === id); Object.assign(l, data); return Object.assign({}, l); },
    async updateMany({ where, data }) { const rows = db.links.filter((l) => matches(l, where)); rows.forEach((l) => Object.assign(l, data)); return { count: rows.length }; },
    async findMany({ where, include, select }) {
      return db.links.filter((l) => matches(l, where)).map((l) => {
        const out = select ? pick(l, Object.fromEntries(Object.entries(select).filter(([k]) => k !== 'subscription'))) : Object.assign({}, l);
        const sub = (include && include.subscription) || (select && select.subscription);
        if (sub) out.subscription = pick(deviceById(l.subscriptionId), sub.select);
        return out;
      });
    },
    async groupBy({ where }) { const m = {}; db.links.filter((l) => matches(l, where)).forEach((l) => { m[l.slug] = (m[l.slug] || 0) + 1; }); return Object.keys(m).map((slug) => ({ slug, _count: { id: m[slug] } })); },
  },
  passDevice: { async findMany() { return []; }, async count() { return 0; } },
  pass: { async updateMany() { return { count: 0 }; } },
  pushCampaign: { async create({ data }) { db.campaigns.push(data); return data; }, async findMany() { return []; } },
  subscriber: { async findMany() { return []; } },
  stampSettings: { async findUnique() { return null; } },
  customerIdentity: { async findMany() { return []; } },
};
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { loaded: true, exports: mockPrisma };
let deliveries = [];
let pushAnswers = {};            // endpoint -> { ok:false, statusCode } (default ok)
require.cache[resolve('src', 'services', 'webPushService.js')] = { loaded: true, exports: { sendWebPush: async (sub, payload) => { deliveries.push({ endpoint: sub.endpoint, title: payload.title }); return pushAnswers[sub.endpoint] || { ok: true }; } } };
require.cache[resolve('src', 'services', 'apnsService.js')] = { loaded: true, exports: { pushUpdateToDevices: async () => ({ success: 0, failed: 0 }) } };
require.cache[resolve('src', 'services', 'emailService.js')] = { loaded: true, exports: { sendCampaignEmail: async () => ({ success: 0, failed: 0 }), sendWelcomeEmail: async () => ({}) } };
require.cache[resolve('src', 'services', 'customerIdentityService.js')] = { loaded: true, exports: { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => null } };

const lp = require('../src/controllers/lpController');
const webPushPages = require('../src/services/webPushPages');

const fakeRes = () => ({ statusCode: 200, body: undefined, headers: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, set() { return this; }, setHeader(k, v) { this.headers[k] = v; } });
const call = async (h, params, body, extra) => { const res = fakeRes(); await h(Object.assign({ params, body: body || {}, query: {}, headers: {} }, extra || {}), res); return res; };
const KEYS = { p256dh: 'BPk-key', auth: 'auth-secret' };
const EP = (n) => 'https://fcm.googleapis.com/fcm/send/browser-' + n;
const subscribe = (slug, endpoint, extra) => call(lp.handleWebPushSubscribe, { slug }, Object.assign({ endpoint, keys: KEYS }, extra || {}));
const optIn = (slug, endpoint, cid) => subscribe(slug, endpoint, { consent: 'explicit', cid });
const unsubscribe = (slug, endpoint) => call(lp.handleWebPushUnsubscribe, { slug }, { endpoint });
async function sendCampaign(slug, userId) {
  deliveries = [];
  const res = await call(lp.handleSendPush, { slug }, { title: 'News from ' + slug, message: 'Hello' }, { userId });
  return { res, to: deliveries.map((d) => d.endpoint).sort() };
}
function page(slug, userId, language) {
  db.pages[slug] = { id: 'lp_' + slug, slug, userId, businessName: 'Business ' + slug, websiteUrl: 'https://example.com', useCase: 'local_business', brandColor: '#000064', logoUrl: null,
    qrType: 'ai', template: 'premium', status: 'live', scanCount: 0, createdAt: new Date(), updatedAt: new Date(1700000000000),
    sections: JSON.stringify({ language: language || 'en', hero: { aiTitle: 'Hello', aiSubtitle: 'World' }, featured: [], businessInfo: {} }) };
}
function twoBusinesses() { resetDb(); pushAnswers = {}; page('biz-a', 'owner_a'); page('biz-b', 'owner_b'); page('biz-c', 'owner_c'); }
const activeLinks = (endpoint) => db.links.filter((l) => deviceById(l.subscriptionId).endpoint === endpoint && !l.unsubscribedAt).map((l) => l.slug).sort();

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── server: subscribe / unsubscribe / send ────────────────────
test('two businesses on one browser: one push address, two independent opt-ins; subscribing to B keeps A', async () => {
  twoBusinesses();
  const a = await optIn('biz-a', EP(1), 'cid-alpha-0001');
  assert.deepEqual([a.statusCode, a.body], [200, { ok: true, subscribed: true }]);
  const b = await optIn('biz-b', EP(1), 'cid-bravo-0001');
  assert.deepEqual(b.body, { ok: true, subscribed: true });
  assert.equal(db.devices.length, 1, 'the browser address is stored once');
  assert.deepEqual(activeLinks(EP(1)), ['biz-a', 'biz-b']);
  assert.deepEqual((await sendCampaign('biz-a', 'owner_a')).to, [EP(1)]);
  assert.deepEqual((await sendCampaign('biz-b', 'owner_b')).to, [EP(1)]);
});

test('unsubscribing from A keeps B; A no longer sends to that browser', async () => {
  twoBusinesses();
  await optIn('biz-a', EP(1)); await optIn('biz-b', EP(1));
  const r = await unsubscribe('biz-a', EP(1));
  assert.deepEqual([r.statusCode, r.body], [200, { ok: true, subscribed: false }]);
  assert.deepEqual(activeLinks(EP(1)), ['biz-b']);
  assert.ok(db.links.find((l) => l.slug === 'biz-a').unsubscribedAt instanceof Date, 'opt-out recorded, row kept');
  assert.equal(db.devices.length, 1, 'the browser address itself is kept');
  assert.deepEqual((await sendCampaign('biz-a', 'owner_a')).to, []);
  assert.deepEqual((await sendCampaign('biz-b', 'owner_b')).to, [EP(1)]);
  // unsubscribing again, or for a page never subscribed, or an unknown address: same answer, nothing else changes
  for (const [slug, ep] of [['biz-a', EP(1)], ['biz-c', EP(1)], ['biz-b', EP(99)]]) assert.deepEqual((await unsubscribe(slug, ep)).body, { ok: true, subscribed: false });
  assert.deepEqual(activeLinks(EP(1)), ['biz-b']);
});

test('no consent is inferred: the background re-sync never creates or re-activates an opt-in', async () => {
  twoBusinesses();
  await optIn('biz-a', EP(1));
  // re-sync on a page the browser never opted in on
  const c = await subscribe('biz-c', EP(1));
  assert.deepEqual(c.body, { ok: true, subscribed: false });
  assert.deepEqual(activeLinks(EP(1)), ['biz-a']);
  // re-sync after opting out of A
  await unsubscribe('biz-a', EP(1));
  assert.deepEqual((await subscribe('biz-a', EP(1))).body, { ok: true, subscribed: false });
  assert.deepEqual(activeLinks(EP(1)), []);
  // only a tap on the page opts in again
  assert.deepEqual((await optIn('biz-a', EP(1))).body, { ok: true, subscribed: true });
  assert.deepEqual(activeLinks(EP(1)), ['biz-a']);
  // re-sync of an active opt-in confirms it and refreshes the keys
  const fresh = await subscribe('biz-a', EP(1), { keys: { p256dh: 'BPk-new', auth: 'auth-new' } });
  assert.deepEqual(fresh.body, { ok: true, subscribed: true });
  assert.equal(db.devices[0].p256dh, 'BPk-new');
});

test('cross-business isolation: each business sends only to its own opt-ins; others cannot send at all', async () => {
  twoBusinesses();
  await optIn('biz-a', EP(1)); await optIn('biz-a', EP(2)); await optIn('biz-b', EP(3)); await optIn('biz-b', EP(2));
  assert.deepEqual((await sendCampaign('biz-a', 'owner_a')).to, [EP(1), EP(2)]);
  assert.deepEqual((await sendCampaign('biz-b', 'owner_b')).to, [EP(2), EP(3)]);
  const foreign = await sendCampaign('biz-a', 'owner_b');
  assert.deepEqual([foreign.res.statusCode, foreign.to], [404, []], 'B cannot send to A (security hotfix 8cf3b89 still applies)');
  const none = await sendCampaign('biz-c', 'owner_c');
  assert.deepEqual([none.res.statusCode, none.to], [200, []], 'C has no opt-ins: sends nothing');
});

test('one delivery per browser address within a campaign', async () => {
  twoBusinesses();
  deliveries = [];
  const dup = { id: 'dev1', endpoint: EP(1), p256dh: 'k', auth: 'a' };
  const r = await webPushPages.sendToRecipients([dup, Object.assign({}, dup), { id: 'dev2', endpoint: EP(2), p256dh: 'k', auth: 'a' }, Object.assign({}, dup)], { title: 't' });
  assert.deepEqual(r, { attempted: 2, sent: 2, failed: 0, expired: 0 });
  assert.deepEqual(deliveries.map((d) => d.endpoint), [EP(1), EP(2)]);
  // recipient selection itself returns each address once
  await optIn('biz-a', EP(1)); await optIn('biz-a', EP(1)); await optIn('biz-a', EP(1), 'cid-alpha-0001');
  assert.deepEqual((await webPushPages.recipientsForPage('biz-a')).map((s) => s.endpoint), [EP(1)]);
  assert.equal(db.links.length, 1, 'repeat opt-ins update the one row');
});

test('existing subscriptions: a migrated opt-in sends and re-syncs as before; it is never copied to other pages', async () => {
  twoBusinesses();
  // as the migration leaves them: the device and one 'migrated' row for the page it belonged to
  db.devices.push({ id: 'legacy1', slug: 'biz-a', endpoint: EP(7), p256dh: 'k', auth: 'a', cid: 'cid-legacy-001', expiredAt: null, createdAt: tick() });
  db.links.push({ id: 'migrated-legacy1', subscriptionId: 'legacy1', slug: 'biz-a', cid: 'cid-legacy-001', source: 'migrated', unsubscribedAt: null, createdAt: tick() });
  assert.deepEqual((await sendCampaign('biz-a', 'owner_a')).to, [EP(7)]);
  assert.deepEqual((await subscribe('biz-a', EP(7))).body, { ok: true, subscribed: true }, 'the page keeps showing it as on');
  assert.deepEqual((await subscribe('biz-b', EP(7))).body, { ok: true, subscribed: false }, 'visiting B does not opt in to B');
  assert.deepEqual((await sendCampaign('biz-b', 'owner_b')).to, []);
  assert.equal(db.devices.find((d) => d.id === 'legacy1').slug, 'biz-b', 'legacy column: last page, written as before (for rollback)');
  assert.deepEqual(activeLinks(EP(7)), ['biz-a'], 'the legacy column no longer decides anything');
});

test('the migration is additive and carries over exactly one page per existing subscription, only for pages that still exist', () => {
  const dir = path.join(__dirname, '..', 'prisma', 'migrations', '20261017120000_add_webpush_page_subscription');
  assert.deepEqual(fs.readdirSync(dir), ['migration.sql']);
  const sql = lf(fs.readFileSync(path.join(dir, 'migration.sql'), 'utf8'));
  const statements = sql.split('\n').filter((l) => l && !l.startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(statements.map((s) => s.split(/\s+/).slice(0, 2).join(' ')), ['ALTER TABLE', 'CREATE TABLE', 'CREATE UNIQUE', 'CREATE INDEX', 'ALTER TABLE', 'INSERT INTO']);
  assert.ok(!/\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME)\b|ALTER\s+COLUMN/i.test(statements.join(';').replace(/ON DELETE CASCADE ON UPDATE CASCADE/g, '')), 'nothing removed or rewritten');
  assert.ok(statements[0] === 'ALTER TABLE "WebPushSubscription" ADD COLUMN "expiredAt" TIMESTAMP(3)', 'one nullable column');
  assert.equal(statements[5], 'INSERT INTO "WebPushPageSubscription" ("id", "subscriptionId", "slug", "cid", "source", "createdAt", "updatedAt")\n'
    + 'SELECT \'migrated-\' || s."id", s."id", s."slug", s."cid", \'migrated\', s."createdAt", CURRENT_TIMESTAMP\n'
    + 'FROM "WebPushSubscription" s\n'
    + 'WHERE EXISTS (SELECT 1 FROM "LandingPage" l WHERE l."slug" = s."slug")\n'
    + 'ON CONFLICT ("subscriptionId", "slug") DO NOTHING');
});

test('schema: only the 5.5C.3 additions (expiredAt, the pages relation, WebPushPageSubscription)', () => {
  // (Studio V3 Phase 1 additions removed exactly: tests/helpers/lpV3Files.js)
  const now = require('./helpers/lpV3Files').withoutV3(lf(fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8')));
  const before = lf(execFileSync('git', ['show', '0cd8e45:backend/prisma/schema.prisma'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  const added = now.slice(now.indexOf('  // Phase 5.5C.3: set when the push service'), now.indexOf('\n  @@index([cid])\n}', now.indexOf('model WebPushSubscription {')));
  const model = now.slice(now.indexOf('\n\n// Phase 5.5C.3: one browser push address'), now.indexOf('\n}\n', now.indexOf('model WebPushPageSubscription {')) + 2);
  assert.ok(added.includes('expiredAt DateTime?') && added.includes('pages     WebPushPageSubscription[]'));
  assert.ok(model.includes('@@unique([subscriptionId, slug])') && model.includes('onDelete: Cascade'));
  assert.equal(now.replace(added, '').replace(model, ''), before);
});

test('expired addresses: a 404/410 answer marks the address expired (kept), it is skipped until the browser subscribes again', async () => {
  twoBusinesses();
  await optIn('biz-a', EP(1)); await optIn('biz-a', EP(2)); await optIn('biz-b', EP(2));
  pushAnswers[EP(2)] = { ok: false, statusCode: 410 };
  pushAnswers[EP(1)] = { ok: false, statusCode: 500 };
  const first = await sendCampaign('biz-a', 'owner_a');
  assert.deepEqual(first.to, [EP(1), EP(2)]);
  assert.deepEqual(first.res.body.webPush, { attempted: 2, sent: 0, failed: 2 });
  assert.ok(db.devices.find((d) => d.endpoint === EP(2)).expiredAt instanceof Date, '410: expired');
  assert.equal(db.devices.find((d) => d.endpoint === EP(1)).expiredAt, null, 'other errors: kept as they are');
  assert.equal(db.devices.length, 2); assert.equal(db.links.length, 3, 'nothing deleted');
  pushAnswers = {};
  assert.deepEqual((await sendCampaign('biz-a', 'owner_a')).to, [EP(1)]);
  assert.deepEqual((await sendCampaign('biz-b', 'owner_b')).to, [], 'expired for every business');
  await subscribe('biz-b', EP(2));   // the browser is back (page re-sync)
  assert.deepEqual((await sendCampaign('biz-b', 'owner_b')).to, [EP(2)]);
});

test('stamp and reward messages go to the stamped customer only, on that page', async () => {
  twoBusinesses();
  await optIn('biz-a', EP(1), 'cid-alpha-0001'); await optIn('biz-a', EP(2), 'cid-other-0002'); await optIn('biz-b', EP(1), 'cid-alpha-0001');
  assert.deepEqual((await webPushPages.recipientsForPage('biz-a', { cid: 'cid-alpha-0001' })).map((s) => s.endpoint), [EP(1)]);
  assert.deepEqual((await webPushPages.recipientsForPage('biz-a', { cid: 'cid-nobody-0003' })).map((s) => s.endpoint), []);
  const src = lf(fs.readFileSync(resolve('src', 'controllers', 'lpController.js'), 'utf8'));
  const stamp = src.slice(src.indexOf('async function handleStampConfirm('), src.indexOf('\n}\n', src.indexOf('async function handleStampConfirm(')));
  assert.ok(stamp.includes('const webSubs = cid ? await webPushPages.recipientsForPage(slug, { cid }) : [];'), 'no cid: nobody');
  assert.ok(!stamp.includes('webPushSubscription.findMany'), 'never every subscriber of the page');
});

test('subscribe input: invalid addresses rejected, unknown pages 404, errors say nothing internal', async () => {
  twoBusinesses();
  for (const body of [{}, { endpoint: EP(1) }, { endpoint: 'http://insecure.example/x', keys: KEYS }, { endpoint: 'not a url', keys: KEYS }, { endpoint: EP(1), keys: { p256dh: 'x' } }, { endpoint: 'https://x/' + 'a'.repeat(2100), keys: KEYS }]) {
    assert.equal((await call(lp.handleWebPushSubscribe, { slug: 'biz-a' }, body)).statusCode, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal((await optIn('no-such-page', EP(1))).statusCode, 404);
  assert.equal(db.devices.length, 0, 'nothing stored');
  assert.equal((await call(lp.handleWebPushUnsubscribe, { slug: 'biz-a' }, {})).statusCode, 400);
  const broken = mockPrisma.webPushSubscription.upsert;
  mockPrisma.webPushSubscription.upsert = async () => { throw new Error('connection to db-internal-host:5432 refused'); };
  try { const r = await optIn('biz-a', EP(1)); assert.deepEqual([r.statusCode, r.body], [500, { error: 'Could not save the subscription.' }]); }
  finally { mockPrisma.webPushSubscription.upsert = broken; }
  // routes
  const routes = lf(fs.readFileSync(resolve('src', 'routes', 'lpRoutes.js'), 'utf8'));
  assert.ok(routes.includes("router.post('/lp/webpush/subscribe/:slug', handleWebPushSubscribe);\nrouter.post('/lp/webpush/unsubscribe/:slug', handleWebPushUnsubscribe);"));
});

test('Admin counts and customer views read active opt-ins only', async () => {
  twoBusinesses();
  await optIn('biz-a', EP(1), 'cid-alpha-0001'); await optIn('biz-a', EP(2)); await optIn('biz-b', EP(1));
  await unsubscribe('biz-a', EP(2));
  assert.deepEqual(await webPushPages.countActiveBySlug(['biz-a', 'biz-b']), { 'biz-a': 1, 'biz-b': 1 });
  const la = lf(fs.readFileSync(resolve('src', 'controllers', 'loyaltyAdminController.js'), 'utf8'));
  assert.ok(la.includes('countActiveWebPushBySlug(ownSlugs)') && !la.includes('webPushSubscription.'), 'summary and detail: per-page opt-ins');
  const cq = lf(fs.readFileSync(resolve('src', 'services', 'customerQueryService.js'), 'utf8'));
  assert.equal((cq.match(/prisma\.webPushPageSubscription\.findMany\(\{\n    where: \{ cid: \{ not: null \}, unsubscribedAt: null, subscription: \{ expiredAt: null \}, OR:/g) || []).length, 2);
  assert.ok(!cq.includes('prisma.webPushSubscription.'));
});

// ── the page: the push script in a simulated browser ──────────
async function renderPushScript(language) {
  twoBusinesses();
  page('biz-a', 'owner_a', language);
  require('../src/utils/pageCache').pageCache.delByPrefix('lp:biz-a');   // rendered pages are cached by slug
  const res = fakeRes();
  await lp.handleServeLP({ params: { slug: 'biz-a' }, query: { preview: '1' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  const html = res.body;
  const texts = JSON.parse(html.match(/window\.QRAIVY_PUSH_TEXT = (\{.*?\});\n/)[1]);
  const script = html.split('\n').find((l) => l.includes("console.log('[Push] Premium LP loaded"));
  return { texts, script };
}
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attrs = {}; this._text = ''; this.innerHTML = ''; this.id = ''; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  setAttribute(k, v) { this.attrs[k] = v; (this.history = this.history || []).push([k, v]); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
}
const findById = (el, id) => { if (el.id === id) return el; for (const c of el.children) { const x = findById(c, id); if (x) return x; } return null; };
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
// opts: permission, ask (what requestPermission answers), stored (wp_sub_ value), server (subscribe answer), pushFails, noPush
function browser(script, opts) {
  const o = Object.assign({ permission: 'default', ask: 'granted', stored: null, server: { status: 200, body: { ok: true, subscribed: true } } }, opts);
  const store = new Map(Object.entries({ cTok: 'cid-global-0001', qraivy_cid_biz_a: 'x' }));
  store.delete('qraivy_cid_biz_a'); store.set('qraivy_cid_biz-a', 'cid-slug-a-0001');
  if (o.stored) store.set('wp_sub_biz-a', o.stored);
  const requests = [];
  const pushSub = { endpoint: EP(42), toJSON() { return { endpoint: EP(42), keys: KEYS }; }, unsubscribeCalls: 0, unsubscribe() { this.unsubscribeCalls++; return Promise.resolve(true); } };
  const reg = { pushManager: { subscribe: () => (o.pushFails ? Promise.reject(new Error('push service error')) : Promise.resolve(pushSub)), getSubscription: () => Promise.resolve(pushSub) } };
  const body = new El('body');
  const Notification = { permission: o.permission, requestPermission: () => { Notification.permission = o.ask === 'default' ? Notification.permission : o.ask; return Promise.resolve(o.ask); } };
  const win = {
    QRAIVY_PUSH_TEXT: null,
    navigator: Object.assign({ userAgent: o.ua || 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130', standalone: false }, o.noPush ? {} : { serviceWorker: { register: () => Promise.resolve(reg) } }),
    location: { pathname: '/lp/biz-a', search: '' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    matchMedia: () => ({ matches: false }),
    document: { createElement: (t) => new El(t), body, getElementById: (id) => findById(body, id) },
    fetch: (url, init) => {
      requests.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
      if (url.includes('/vapid-key/')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ publicKey: 'BPk' }) });
      const a = url.includes('/unsubscribe/') ? { status: o.unsub || 200, body: { ok: true, subscribed: false } } : o.server;
      return Promise.resolve({ ok: a.status < 400, status: a.status, json: () => Promise.resolve(a.body) });
    },
    setTimeout: () => 0, console: { log() {}, error() {} }, atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    Uint8Array, JSON, Promise, Error, Object, Array, String,
  };
  if (!o.noPush) { win.PushManager = function () {}; win.Notification = Notification; }
  win.window = win;
  return { win, store, requests, body, pushSub, Notification };
}
async function run(script, texts, opts) {
  const b = browser(script, opts);
  b.win.QRAIVY_PUSH_TEXT = texts;
  vm.runInNewContext(script, b.win);
  await flush();
  const wrap = b.body.children.find((c) => c.children[0] && c.children[0].children.length === 6);
  const card = wrap ? wrap.children[0] : null;
  b.sheet = card ? { title: () => card.children[2].textContent, btn: card.children[4], wrap } : null;
  // the settings section: what it shows now, and every state it went through
  b.settings = () => { const box = findById(b.body, 'qraivy-push-settings'); if (!box || !box.children[0]) return null; const card = box.children[0], tx = card.children[1], btn = card.children[2] || null;
    const out = { state: box.attrs['data-state'], title: tx.children[0].textContent, status: tx.children[1].children[1].textContent, button: btn ? btn.textContent : null };
    Object.defineProperty(out, 'buttonEl', { value: btn, enumerable: false }); return out; };
  b.states = () => { const box = findById(b.body, 'qraivy-push-settings'); return box ? (box.history || []).filter(([k]) => k === 'data-state').map(([, v]) => v) : []; };
  b.subscribes = () => b.requests.filter((r) => r.url.includes('/lp/webpush/subscribe/'));
  return b;
}

test('page: permission denied at the prompt shows "blocked" in the sheet and the settings, never "subscribed", registers nothing', async () => {
  const { texts, script } = await renderPushScript('en');
  const b = await run(script, texts, { ask: 'denied' });
  assert.equal(b.sheet.title(), texts.title);
  assert.deepEqual(b.settings(), { state: 'off', title: 'Notifications', status: 'Off', button: 'Turn on' });
  b.sheet.btn.onclick(); await flush();
  assert.equal(b.sheet.title(), 'Notifications are blocked');
  assert.deepEqual(b.settings(), { state: 'blocked', title: 'Notifications', status: 'Blocked in your browser settings', button: null });
  assert.equal(b.store.get('wp_sub_biz-a'), 'denied');
  assert.deepEqual(b.subscribes(), []);
});

test('page: failed registration shows "failed" with retry, never "subscribed" (server error, server says no, push service fails)', async () => {
  const { texts, script } = await renderPushScript('en');
  for (const opts of [{ server: { status: 500, body: { error: 'x' } } }, { server: { status: 200, body: { ok: true, subscribed: false } } }, { server: { status: 404, body: {} } }, { pushFails: true }]) {
    const b = await run(script, texts, opts);
    b.sheet.btn.onclick(); await flush();
    assert.equal(b.sheet.title(), "Couldn't turn on notifications", JSON.stringify(opts));
    assert.equal(b.sheet.btn.textContent, 'Try again');
    assert.ok(!b.store.has('wp_sub_biz-a'), 'not marked as subscribed');
    assert.notEqual(b.settings().state, 'on');
    // and from the settings section: an error with retry, never "on"
    b.settings().buttonEl.onclick(); await flush();
    assert.deepEqual(b.settings(), { state: 'error', title: 'Notifications', status: "That didn't work. Please try again.", button: 'Try again' }, JSON.stringify(opts));
    assert.ok(b.states().includes('turningOn') && !b.states().includes('on'));
  }
});

test('page: a confirmed registration says "subscribed", sends explicit consent with the page\'s customer id, and the settings show "on"', async () => {
  const { texts, script } = await renderPushScript('en');
  const b = await run(script, texts, {});
  b.sheet.btn.onclick(); await flush();
  assert.equal(b.sheet.title(), "You're subscribed!");
  assert.equal(b.store.get('wp_sub_biz-a'), '1');
  assert.deepEqual(b.subscribes().map((r) => r.body), [{ endpoint: EP(42), keys: KEYS, cid: 'cid-slug-a-0001', consent: 'explicit' }]);
  assert.deepEqual(b.settings(), { state: 'on', title: 'Notifications', status: 'On for this business', button: 'Turn off' });
});

test('page: the settings turn this business off and on again; the browser subscription stays for the others', async () => {
  const { texts, script } = await renderPushScript('en');
  const b = await run(script, texts, { permission: 'granted', stored: '1' });
  assert.equal(b.subscribes()[0].body.consent, undefined, 're-sync without consent');
  assert.deepEqual(b.states(), ['checking', 'on'], 'checking first, "on" only after the server confirmed');
  assert.equal(b.settings().button, 'Turn off');
  b.settings().buttonEl.onclick(); await flush();
  const un = b.requests.filter((r) => r.url.includes('/lp/webpush/unsubscribe/biz-a'));
  assert.deepEqual(un.map((r) => r.body), [{ endpoint: EP(42) }]);
  assert.equal(b.pushSub.unsubscribeCalls, 0, 'the browser push subscription itself stays (other businesses)');
  assert.equal(b.store.get('wp_sub_biz-a'), 'off');
  assert.deepEqual(b.settings(), { state: 'off', title: 'Notifications', status: 'Off', button: 'Turn on' });
  assert.deepEqual(b.states().slice(-2), ['turningOff', 'off']);
  // and back on: an explicit opt-in again
  b.settings().buttonEl.onclick(); await flush();
  assert.equal(b.subscribes().pop().body.consent, 'explicit');
  assert.equal(b.store.get('wp_sub_biz-a'), '1');
  assert.deepEqual(b.states().slice(-2), ['turningOn', 'on']);
});

test('page: turning off or checking can fail: an error with retry, the previous choice is kept', async () => {
  const { texts, script } = await renderPushScript('en');
  const b = await run(script, texts, { permission: 'granted', stored: '1', unsub: 500 });
  b.settings().buttonEl.onclick(); await flush();
  assert.deepEqual(b.settings(), { state: 'error', title: 'Notifications', status: "That didn't work. Please try again.", button: 'Try again' });
  assert.equal(b.store.get('wp_sub_biz-a'), '1', 'still on as far as we know');
  b.settings().buttonEl.onclick(); await flush();
  assert.equal(b.requests.filter((r) => r.url.includes('/unsubscribe/')).length, 2, 'retry repeats the turn-off');
  const c = await run(script, texts, { permission: 'granted', stored: '1', server: { status: 503, body: {} } });
  assert.deepEqual(c.states(), ['checking', 'error']);
  assert.equal(c.store.get('wp_sub_biz-a'), '1', 'a failed check forgets nothing');
});

test('page: revisits — dismissed and denied never re-subscribe; a lost opt-in is not assumed; off stays off', async () => {
  const { texts, script } = await renderPushScript('en');
  for (const stored of ['dismissed', 'denied']) {
    const b = await run(script, texts, { permission: 'granted', stored });
    assert.deepEqual(b.subscribes(), [], stored);
    assert.equal(b.sheet, null, 'no sheet');
    assert.deepEqual(b.settings(), { state: 'off', title: 'Notifications', status: 'Off', button: 'Turn on' }, stored + ': can still turn on, by tapping');
  }
  const lost = await run(script, texts, { permission: 'granted', stored: '1', server: { status: 200, body: { ok: true, subscribed: false } } });
  assert.equal(lost.subscribes().length, 1);
  assert.ok(!lost.store.has('wp_sub_biz-a'), 'forgotten, so the page can ask again next time');
  assert.deepEqual(lost.states(), ['checking', 'off']);
  const off = await run(script, texts, { permission: 'granted', stored: 'off' });
  assert.deepEqual(off.subscribes(), []);
  assert.equal(off.settings().state, 'off');
});

test('page: blocked, unsupported and iPhone-in-Safari states are shown as they are, without a button', async () => {
  const { texts, script } = await renderPushScript('en');
  const blocked = await run(script, texts, { permission: 'denied' });
  assert.deepEqual(blocked.settings(), { state: 'blocked', title: 'Notifications', status: 'Blocked in your browser settings', button: null });
  assert.deepEqual(blocked.requests, []);
  const none = await run(script, texts, { noPush: true });
  assert.deepEqual(none.settings(), { state: 'unsupported', title: 'Notifications', status: 'Not available in this browser', button: null });
  assert.deepEqual(none.requests, []);
  const iphone = await run(script, texts, { noPush: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  assert.deepEqual(iphone.settings(), { state: 'ios', title: 'Notifications', status: 'Add this page to your Home Screen to get notifications', button: null });
});

test('page: prompt closed without a choice registers nothing', async () => {
  const { texts, script } = await renderPushScript('en');
  const closed = await run(script, texts, { ask: 'default' });
  closed.sheet.btn.onclick(); await flush();
  assert.equal(closed.sheet.wrap.style.display, 'none');
  assert.deepEqual(closed.subscribes(), []);
  assert.ok(!closed.store.has('wp_sub_biz-a'));
  assert.equal(closed.settings().state, 'off');
});

test('page: German texts for the settings and the new states (informal "du")', async () => {
  const { texts, script } = await renderPushScript('de');
  assert.deepEqual([texts.setTitle, texts.stOn, texts.stOff, texts.turnOn, texts.turnOff, texts.stChecking, texts.stTurningOn, texts.stTurningOff, texts.stBlocked, texts.stUnsupported, texts.stIos, texts.stError, texts.blockedTitle, texts.failTitle, texts.retry],
    ['Benachrichtigungen', 'Für diesen Betrieb aktiv', 'Aus', 'Einschalten', 'Ausschalten', 'Wird geprüft…', 'Wird eingeschaltet…', 'Wird ausgeschaltet…', 'In deinen Browser-Einstellungen blockiert', 'In diesem Browser nicht verfügbar',
      'Füge diese Seite zu deinem Home-Bildschirm hinzu, um Benachrichtigungen zu erhalten', 'Das hat nicht geklappt. Bitte versuch es noch einmal.', 'Benachrichtigungen sind blockiert', 'Benachrichtigungen konnten nicht aktiviert werden', 'Erneut versuchen']);
  assert.ok(!/\bSie\b|Ihr(e|en)?\b/.test([texts.setTitle, texts.stOn, texts.stIos, texts.stError, texts.stBlocked].join(' ')), 'du, not Sie');
  const b = await run(script, texts, { ask: 'denied' });
  assert.deepEqual(b.settings(), { state: 'off', title: 'Benachrichtigungen', status: 'Aus', button: 'Einschalten' });
  b.sheet.btn.onclick(); await flush();
  assert.equal(b.sheet.title(), 'Benachrichtigungen sind blockiert');
  assert.equal(b.settings().status, 'In deinen Browser-Einstellungen blockiert');
});

test('page: the settings section is part of the page (before the footer), hidden until the script fills it; the old footer line is gone', async () => {
  twoBusinesses();
  require('../src/utils/pageCache').pageCache.delByPrefix('lp:biz-a');
  const res = fakeRes();
  await lp.handleServeLP({ params: { slug: 'biz-a' }, query: { preview: '1' }, headers: {} }, res);
  const html = res.body;
  const at = html.indexOf('<div class="section" id="qraivy-push-settings" hidden></div>');
  assert.ok(at > 0 && at < html.indexOf('<!-- FOOTER -->'));
  assert.ok(!html.includes('qraivy-push-footer') && !html.includes('_footer('));
});

test('nothing else changed: service workers, VAPID key route, StadtPocket and Wallet files', () => {
  const changed = execFileSync('git', ['diff', '0cd8e45', '--name-only', '--', 'frontend/public/sw.js', 'backend/public/sw.js', 'backend/src/services/passService.js',
    'backend/src/services/googleWalletService.js', 'backend/src/services/apnsService.js', 'backend/src/services/stadtPocketContext.js', 'backend/src/routes/managerRoutes.js',
    'backend/src/routes/managerStadtpocketListingRoutes.js', 'backend/src/routes/stadtpocketPublicRoutes.js', 'backend/src/controllers/walletController.js', 'frontend/public',
    ...require('./helpers/academyFiles').ACADEMY_EXCLUDES, ...require('./helpers/phase0Files').PHASE0_EXCLUDES, ...require('./helpers/lpV3Files').LPV3_EXCLUDES], { cwd: ROOT, encoding: 'utf8' }).trim();   // Academy: tests/academyPage.test.js
  assert.equal(changed, '');
});

(async () => {
  let passed = 0, failed = 0;
  console.log('pushPageSubscriptions');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
