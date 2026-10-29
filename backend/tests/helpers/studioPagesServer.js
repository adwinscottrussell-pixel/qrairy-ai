// ============================================================
// studioPagesServer.js — a local server for the Studio V3 Phase A / B tests
// (studioPages.test.js, studioPagesLoad.browser.test.js,
// studioPagesSave.browser.test.js).
//
// The REAL Studio page routes (src/lpV3/studioPagesRoutes.js ->
// studioPagesController -> importLegacy / core) and the REAL Deals routes
// (src/routes/dealRoutes.js), both behind the real requireAuth, on an
// in-memory database that refuses every write (each attempt is recorded in
// `writes`) except the two the Studio's Save Draft may make:
// pageDesign.create (landingPageId unique, a clash is Prisma's P2002) and
// pageDesign.updateMany (each recorded in `designWrites`). Mocked by pre-seeding require.cache (the studioDealsServer.js
// pattern): the Prisma client, @clerk/backend (a token is a fixed account id)
// and the deal image upload. frontend/public is served on the same address,
// and studio-routing.js answers with this server as the API.
//
// Must be required before anything else that loads src/ modules.
// ============================================================
const path = require('path');
const fs = require('fs');
const http = require('http');

const SRC = (...p) => require.resolve(path.join(__dirname, '..', '..', 'src', ...p));
const PUB = path.join(__dirname, '..', '..', '..', 'frontend', 'public');

const ANNA = 'user_anna';
const BEN = 'user_ben';
const CARL = 'user_carl'; // signed in, no pages
const TOKENS = { tok_anna: ANNA, tok_ben: BEN, tok_carl: CARL };
const DAY = 864e5;
const at = (ms) => new Date(Date.now() + ms);

// Anna's saved Studio draft for anna-shop: a Hero and the Deals / Offers section
const SHOP_DRAFT = { schemaVersion: 1, settings: { language: 'de' }, pages: [{ id: 'start', title: 'Start', sections: [
  { id: 's_hero01', type: 'hero', variant: 'simple', data: { headline: 'Anna Shop Entwurf', subheadline: 'Aus dem gespeicherten Studio-Entwurf' } },
  { id: 's_deals01', type: 'dealsOffers', variant: 'cards', anchor: 'angebote', data: { title: 'Unsere Angebote', maxItems: 3 } },
] }] };

function seed() {
  const pages = [
    // newest first by updatedAt
    { id: 'lp_anna_cafe', slug: 'anna-cafe', userId: ANNA, businessName: 'Anna Café', status: 'live', useCase: 'restaurant', renderer: 'legacy', brandColor: '#aa3311', logoUrl: null, websiteUrl: 'https://anna-cafe.example',
      sections: JSON.stringify({ language: 'de', hero: { title: 'Willkommen im Anna Café', subtitle: 'Frühstück & Kuchen', badge: 'Seit 1998' }, buttons: [{ label: 'Tisch reservieren', url: 'https://anna-cafe.example/reservieren' }, { label: 'Speisekarte', url: 'https://anna-cafe.example/karte', style: 'secondary' }] }),
      createdAt: at(-30 * DAY), updatedAt: at(-1000) },
    { id: 'lp_anna_shop', slug: 'anna-shop', userId: ANNA, businessName: 'Anna Shop', status: 'live', useCase: 'creator', renderer: 'legacy', brandColor: '#112233', logoUrl: null, websiteUrl: null,
      sections: JSON.stringify({ language: 'de', hero: { title: 'LEGACY SHOP TITLE' } }), createdAt: at(-20 * DAY), updatedAt: at(-2000) },
    { id: 'lp_anna_draft', slug: 'anna-draft', userId: ANNA, businessName: 'Anna Entwurf', status: 'draft', useCase: null, renderer: 'legacy', brandColor: null, logoUrl: null, websiteUrl: null,
      sections: null, createdAt: at(-10 * DAY), updatedAt: at(-3000) },
    { id: 'lp_ben', slug: 'ben-bikes', userId: BEN, businessName: 'Ben Bikes', status: 'live', useCase: 'local_business', renderer: 'legacy', brandColor: null, logoUrl: null, websiteUrl: null,
      sections: JSON.stringify({ hero: { title: 'BEN BIKES SECRET' } }), createdAt: at(-5 * DAY), updatedAt: at(-500) },
    // a StadtPocket / platform page: no owner
    { id: 'lp_city', slug: 'ulm-city', userId: null, businessName: 'Ulm City', status: 'live', useCase: 'local_business', renderer: 'legacy', brandColor: null, logoUrl: null, websiteUrl: null,
      sections: JSON.stringify({ hero: { title: 'OWNERLESS CITY' } }), createdAt: at(-5 * DAY), updatedAt: at(-100) },
  ];
  const pageDesigns = [{ id: 'pd_shop', landingPageId: 'lp_anna_shop', schemaVersion: 1, draft: SHOP_DRAFT, draftRevision: 4, publishedVersionId: null, updatedByUserId: ANNA, createdAt: at(-DAY), updatedAt: at(-DAY) }];
  const users = [{ id: ANNA, email: null, plan: 'pro' }];
  const deal = (id, owner, o) => Object.assign({ id, ownerUserId: owner, businessId: null, title: 'Deal ' + id, description: null, offerText: 'Offer ' + id, offerType: null, offerDetails: null,
    image: null, status: 'published', startsAt: at(-DAY), endsAt: at(7 * DAY), publishedAt: at(-DAY), draftData: null, createdBy: owner, createdAt: at(-2 * DAY), updatedAt: at(-DAY) }, o);
  const deals = [deal('d_shop', ANNA, { title: 'Shop-Angebot', offerText: '-15%' }), deal('d_ben', BEN, { title: 'BEN DEAL', offerText: 'Ben -10%' })];
  const placements = [
    { id: 'pl_1', dealId: 'd_shop', channel: 'landing_page', targetRef: 'anna-shop', status: 'published', publishedAt: at(-1000), createdAt: at(-DAY), updatedAt: at(-DAY) },
    { id: 'pl_2', dealId: 'd_ben', channel: 'landing_page', targetRef: 'ben-bikes', status: 'published', publishedAt: at(-1000), createdAt: at(-DAY), updatedAt: at(-DAY) },
  ];
  return { pages, pageDesigns, users, deals, placements };
}
const db = seed();
const opts = { designTableMissing: false, failList: false, failSave: false, saveDelayMs: 0 };
const DESIGNS_AT_START = structuredClone(db.pageDesigns);
function resetDesigns() { db.pageDesigns.splice(0, db.pageDesigns.length, ...structuredClone(DESIGNS_AT_START)); designWrites.length = 0; }

// Prisma-style where: equality, { in }, { not }, { gte }, OR
const instant = (v) => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : v);
const matches = (row, where = {}) => Object.keys(where).every((k) => {
  const c = where[k];
  if (k === 'OR') return c.some((w) => matches(row, w));
  if (c && typeof c === 'object' && !(c instanceof Date)) {
    if ('in' in c) return c.in.includes(row[k]);
    if ('not' in c) return row[k] !== c.not;
    if ('gte' in c) return row[k] != null && instant(row[k]) >= instant(c.gte);
  }
  return row[k] === c;
});
const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row });
const copy = (x) => JSON.parse(JSON.stringify(x));
function findMany(rows, { where, select, orderBy, take } = {}) {
  let out = rows.filter((r) => matches(r, where));
  if (orderBy) {
    const [k, dir] = Object.entries(Array.isArray(orderBy) ? orderBy[0] : orderBy)[0];
    out = out.slice().sort((a, b) => (instant(a[k]) - instant(b[k])) * (dir === 'desc' ? -1 : 1));
  }
  if (take) out = out.slice(0, take);
  return out.map((r) => pick(r, select));
}
const writes = [];
const reads = [];
const designWrites = [];
const pause = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : null);
// Save Draft's writes. Each one checks and changes the rows in one step
// (no await in between), as the database does in one statement.
const ALLOWED_DESIGN_FIELDS = ['landingPageId', 'draftRevision', 'draft', 'schemaVersion', 'updatedByUserId', 'updatedAt'];
function checkDesignData(data) {
  for (const k of Object.keys(data)) if (!ALLOWED_DESIGN_FIELDS.includes(k)) throw new Error('unexpected PageDesign field: ' + k);
}
async function designCreate({ data }) {
  if (opts.designTableMissing) tableMissing();
  await pause(opts.saveDelayMs);
  if (opts.failSave) throw new Error('database unavailable');
  checkDesignData(data);
  designWrites.push({ op: 'create', landingPageId: data.landingPageId });
  if (db.pageDesigns.some((r) => r.landingPageId === data.landingPageId)) { const e = new Error('Unique constraint failed on the fields: (`landingPageId`)'); e.code = 'P2002'; throw e; }
  const row = Object.assign({ id: 'pd_' + data.landingPageId, schemaVersion: 1, publishedVersionId: null, createdAt: new Date() }, copy(data), { updatedAt: data.updatedAt || new Date() });
  db.pageDesigns.push(row);
  return copy(row);
}
async function designUpdateMany({ where, data }) {
  if (opts.designTableMissing) tableMissing();
  await pause(opts.saveDelayMs);
  if (opts.failSave) throw new Error('database unavailable');
  checkDesignData(data);
  designWrites.push({ op: 'updateMany', landingPageId: where.landingPageId, base: where.draftRevision });
  const hit = db.pageDesigns.filter((r) => matches(r, where));
  for (const r of hit) {
    for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === 'object' && 'increment' in v ? r[k] + v.increment : (k === 'updatedAt' ? v : copy(v));
  }
  return { count: hit.length };
}
// every model: reads served from the rows, ANY other method is a refused write
function model(name, rows, extra = {}) {
  const read = {
    findUnique: async ({ where, select }) => { reads.push(name + '.findUnique'); const r = rows().find((x) => matches(x, where)); return r ? pick(r, select) : null; },
    findFirst: async (q = {}) => { reads.push(name + '.findFirst'); return findMany(rows(), q)[0] || null; },
    findMany: async (q) => { reads.push(name + '.findMany'); return findMany(rows(), q); },
    count: async ({ where } = {}) => { reads.push(name + '.count'); return rows().filter((r) => matches(r, where)).length; },
  };
  Object.assign(read, extra);
  return new Proxy(read, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? async () => { writes.push(name + '.' + k); throw new Error('read-only test database: ' + name + '.' + k); } : undefined) });
}
const tableMissing = () => { const e = new Error('The table `public.PageDesign` does not exist in the current database.'); e.code = 'P2021'; throw e; };
const mockPrisma = new Proxy({
  user: model('user', () => db.users),
  landingPage: model('landingPage', () => db.pages),
  pageDesign: model('pageDesign', () => db.pageDesigns, {
    findUnique: async ({ where, select }) => { if (opts.designTableMissing) tableMissing(); reads.push('pageDesign.findUnique'); const r = db.pageDesigns.find((x) => matches(x, where)); return r ? pick(copy(r), select) : null; },
    findMany: async (q) => { if (opts.designTableMissing) tableMissing(); reads.push('pageDesign.findMany'); return findMany(db.pageDesigns, q); },
    create: designCreate,
    updateMany: designUpdateMany,
  }),
  deal: model('deal', () => db.deals),
  dealPlacement: model('dealPlacement', () => db.placements),
  business: model('business', () => []),
  businessMember: model('businessMember', () => []),
}, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && k.startsWith('$') ? async () => { writes.push('prisma.' + k); throw new Error('read-only test database: ' + k); } : undefined) });

const seedModule = (file, exports) => { require.cache[file] = { id: file, filename: file, loaded: true, exports }; };
seedModule(SRC('utils', 'prismaClient.js'), mockPrisma);
seedModule(require.resolve('@clerk/backend'), { verifyToken: async (token) => { if (!TOKENS[token]) throw new Error('invalid token'); return { sub: TOKENS[token] }; } });
seedModule(SRC('services', 'dealImageUploadService.js'), { isDealImageStorageConfigured: () => false, uploadDealImage: async () => { writes.push('upload'); throw new Error('no uploads'); } });

process.env.DEALS_PILOT_USER_IDS = ANNA + ',' + BEN;
delete process.env.DEALS_ENABLED;
process.env.DEALS_ON_LANDING_PAGES = '1';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
const realError = console.error;
console.error = (...a) => { if (!/^\[(auth|DealAPI|StudioPages)\]/.test(String(a[0]))) realError(...a); };

const express = require('express');
const dealRoutes = require(SRC('routes', 'dealRoutes.js'));
const studioRoutes = require(SRC('lpV3', 'studioPagesRoutes.js'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// every API request the server saw: method, path, account
const apiLog = [];
function start() {
  const app = express();
  app.disable('x-powered-by');
  // as in src/index.js
  app.use(express.json({ limit: '10mb' }));
  let origin = '';
  const log = (prefix) => (req, res, next) => { apiLog.push({ method: req.method, path: prefix + (req.path === '/' ? '' : req.path), auth: req.headers.authorization || '' }); next(); };
  app.use('/studio', log('/studio'), (req, res, next) => (opts.failList && req.path === '/pages' ? res.status(500).json({ error: 'x' }) : next()), studioRoutes);
  app.use('/deals', log('/deals'), dealRoutes);
  // a body that is not JSON: 400 (as the server's error handler answers)
  app.use((err, req, res, next) => (err && err.type === 'entity.parse.failed' ? res.status(400).json({ error: 'invalid_json' }) : next(err)));
  app.get('/js/studio/studio-routing.js', (req, res) => {
    res.set('Content-Type', TYPES['.js']).send('window.QraivyStudioRouting = { resolve: function () { return null; }, PREVIEW_HOSTS: [] };' +
      'window.QRAIVY_STUDIO_ROUTING = { mode: "local", api: ' + JSON.stringify(origin) + ', blocked: false };');
  });
  app.use((req, res) => {
    const p = path.join(PUB, decodeURIComponent(req.path));
    if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.status(404).end();
    res.set('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => {
    const server = http.createServer(app).listen(0, '127.0.0.1', () => {
      origin = 'http://127.0.0.1:' + server.address().port;
      resolve({ origin, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { start, db, opts, apiLog, writes, reads, designWrites, resetDesigns, ANNA, BEN, CARL, SHOP_DRAFT, copy };
