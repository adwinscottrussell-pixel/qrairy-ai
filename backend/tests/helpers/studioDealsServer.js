// ============================================================
// studioDealsServer.js — a local server for the Studio Deals preview test
// (studioDealsPreview.browser.test.js, Phase D2).
//
// The REAL Deals routes (src/routes/dealRoutes.js -> dealController ->
// dealService / dealAccess / dealCards) on an in-memory database, so the
// Studio is checked against the actual owner endpoints, their requireAuth
// and their owner scoping. Mocked by pre-seeding require.cache (the
// tests/dealRoutes.test.js pattern): the Prisma client (rows below),
// @clerk/backend (a token is a fixed account id) and the deal image upload
// (never used: the Studio only reads). frontend/public is served on the same
// address. No real database, Clerk or Cloudinary call is made.
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
const TOKENS = { tok_anna: ANNA, tok_ben: BEN };

const DAY = 864e5;
const at = (ms) => new Date(Date.now() + ms);
const CLD_UPLOAD = 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1/qraivy-deals/deal-anna-2.jpg';

// ── the rows ──────────────────────────────────────────────────────
function seed() {
  const deal = (id, owner, o) => Object.assign({ id, ownerUserId: owner, businessId: null, title: 'Deal ' + id, description: null, offerText: 'Offer ' + id, offerType: null, offerDetails: null,
    image: null, status: 'published', startsAt: at(-DAY), endsAt: at(7 * DAY), publishedAt: at(-DAY), draftData: null, createdBy: owner, createdAt: at(-2 * DAY), updatedAt: at(-DAY) }, o);
  const deals = [
    // shown on anna-cafe (newest placement first)
    deal('d_anna_1', ANNA, { title: '<img src=x onerror=alert(1)>Frühstück', offerText: '2 für 1', description: 'Jeden Montag\n<b>fett</b>', image: { source: 'starter', starterId: 'bakery-bread-01', aiGenerated: true } }),
    deal('d_anna_2', ANNA, { title: 'Kaffee & Kuchen', offerText: '-20%', image: { source: 'uploaded', url: CLD_UPLOAD, publicId: 'qraivy-deals/deal-anna-2', width: 1200, height: 900, master: { url: CLD_UPLOAD.replace('c_fill,g_auto,h_900,w_1200/', ''), width: 4000, height: 3000 } } }),
    // published and shown on the page, but with unpublished edits: its live version is not what GET /deals returns
    deal('d_anna_edit', ANNA, { title: 'Live title', draftData: { title: 'UNPUBLISHED EDIT', offerText: 'UNPUBLISHED OFFER' } }),
    // never shown: draft, archived, expired, not started
    deal('d_anna_draft', ANNA, { status: 'draft', publishedAt: null, title: 'DRAFT DEAL' }),
    deal('d_anna_arch', ANNA, { status: 'archived', title: 'ARCHIVED DEAL' }),
    deal('d_anna_exp', ANNA, { title: 'EXPIRED DEAL', startsAt: at(-9 * DAY), endsAt: at(-DAY) }),
    deal('d_anna_sched', ANNA, { title: 'SCHEDULED DEAL', startsAt: at(2 * DAY) }),
    // on Anna's second page
    deal('d_anna_shop', ANNA, { title: 'Shop deal', offerText: 'Gratis Tasche', image: { source: 'background', backgroundId: 'ember' } }),
    // Ben's: on his page, and one placement (published) pointing at Anna's page
    deal('d_ben_1', BEN, { title: 'BEN BIKES DEAL', offerText: 'Ben -10%' }),
    deal('d_ben_sneak', BEN, { title: 'BEN ON ANNA PAGE', offerText: 'Ben sneak' }),
  ];
  let n = 0;
  const placement = (dealId, targetRef, status, ageMs) => ({ id: 'pl_' + (++n), dealId, channel: 'landing_page', targetRef, status, publishedAt: status === 'published' ? at(-ageMs) : null, createdAt: at(-DAY), updatedAt: at(-DAY) });
  const placements = [
    placement('d_ben_sneak', 'anna-cafe', 'published', 1000),        // newest, but not Anna's deal
    placement('d_anna_1', 'anna-cafe', 'published', 2000),
    placement('d_anna_2', 'anna-cafe', 'published', 3000),
    placement('d_anna_edit', 'anna-cafe', 'published', 4000),
    placement('d_anna_draft', 'anna-cafe', 'draft', 0),
    placement('d_anna_arch', 'anna-cafe', 'published', 500),
    placement('d_anna_exp', 'anna-cafe', 'published', 600),
    placement('d_anna_sched', 'anna-cafe', 'published', 700),
    placement('d_anna_shop', 'anna-shop', 'published', 2000),
    placement('d_ben_1', 'ben-bikes', 'published', 2000),
  ];
  const pages = [
    { slug: 'anna-cafe', userId: ANNA, businessName: 'Anna Café', status: 'live', updatedAt: at(-1000) },
    { slug: 'anna-shop', userId: ANNA, businessName: 'Anna Shop', status: 'live', updatedAt: at(-2000) },
    { slug: 'anna-draft', userId: ANNA, businessName: 'Anna Entwurf', status: 'draft', updatedAt: at(-3000) },
    { slug: 'ben-bikes', userId: BEN, businessName: 'Ben Bikes', status: 'live', updatedAt: at(-500) },
  ];
  return { deals, placements, pages };
}
const db = seed();

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
const refuse = (what) => async () => { writes.push(what); throw new Error('read-only test database: ' + what); };
const mockPrisma = {
  deal: { findUnique: async ({ where }) => { const r = db.deals.find((d) => d.id === where.id); return r ? { ...r } : null; }, findMany: async (q) => findMany(db.deals, q),
    count: async ({ where }) => db.deals.filter((d) => matches(d, where)).length, create: refuse('deal.create'), update: refuse('deal.update'), updateMany: refuse('deal.updateMany'), delete: refuse('deal.delete') },
  dealPlacement: { findUnique: async ({ where }) => { const r = db.placements.find((p) => p.id === where.id); return r ? { ...r } : null; }, findMany: async (q) => findMany(db.placements, q),
    create: refuse('dealPlacement.create'), update: refuse('dealPlacement.update'), updateMany: refuse('dealPlacement.updateMany') },
  landingPage: { findUnique: async ({ where }) => { const r = db.pages.find((p) => p.slug === where.slug); return r ? { ...r } : null; }, findMany: async (q) => findMany(db.pages, q) },
  user: { findUnique: async () => null },          // no User row: Free plan; access comes from the pilot list
  business: { findUnique: async () => null },
  businessMember: { findUnique: async () => null },
  $executeRaw: refuse('$executeRaw'),
  $transaction: refuse('$transaction'),
};
const seedModule = (file, exports) => { require.cache[file] = { id: file, filename: file, loaded: true, exports }; };
seedModule(SRC('utils', 'prismaClient.js'), mockPrisma);
seedModule(require.resolve('@clerk/backend'), { verifyToken: async (token) => { if (!TOKENS[token]) throw new Error('invalid token'); return { sub: TOKENS[token] }; } });
seedModule(SRC('services', 'dealImageUploadService.js'), { isDealImageStorageConfigured: () => false, uploadDealImage: refuse('upload') });

process.env.DEALS_PILOT_USER_IDS = ANNA + ',' + BEN;
delete process.env.DEALS_ENABLED;
process.env.DEALS_ON_LANDING_PAGES = '1';   // shownDealIds are computed only with the landing-page cards on
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
const realError = console.error;
console.error = (...a) => { if (!/^\[(auth|DealAPI)\]/.test(String(a[0]))) realError(...a); };

const express = require('express');
const dealRoutes = require(SRC('routes', 'dealRoutes.js'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// every API request the server saw: method, path, account
const apiLog = [];
function start() {
  const app = express();
  app.disable('x-powered-by');
  app.use('/deals', (req, res, next) => { apiLog.push({ method: req.method, path: '/deals' + (req.path === '/' ? '' : req.path), auth: req.headers.authorization || '' }); next(); });
  app.use('/deals', dealRoutes);
  app.use((req, res) => {
    const p = path.join(PUB, decodeURIComponent(req.path));
    if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.status(404).end();
    res.set('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => {
    const server = http.createServer(app).listen(0, '127.0.0.1', () => {
      resolve({ origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { start, db, apiLog, writes, ANNA, BEN, CLD_UPLOAD };
