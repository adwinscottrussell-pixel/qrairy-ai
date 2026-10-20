// legacyRenderHarness.js — renders the synthetic pages in
// tests/fixtures/legacyPages/fixtures.json through the REAL public page
// handlers (handleServeLP -> renderPremiumLP, handleLoyaltyCardPage,
// handleLoyaltyWelcome). Only data and outside services are stand-ins: an
// in-memory database, no network, a frozen clock. Used by
// tests/legacyRenderGolden.test.js; it must run in its own process (node
// --test does that) because it seeds require.cache before lpController loads.
'use strict';
const path = require('path');
const crypto = require('crypto');

const FIXTURES = require('../fixtures/legacyPages/fixtures.json');
// Everything the public pages read from the environment, cleared per case.
const ENV_KEYS = ['DEALS_ON_LANDING_PAGES', 'WELCOME_V2_SLUGS', 'WELCOME_V2_OWNER_IDS', 'APP_ENV', 'LP_PUBLIC_PAGE_ORIGIN', 'LP_PUBLIC_API_ORIGIN', 'DEALS_PILOT_USER_IDS', 'DEALS_ENABLED', 'CLOUDINARY_CLOUD_NAME'];
const HEADERS = ['Content-Type', 'Cache-Control', 'Content-Security-Policy', 'X-Frame-Options'];

function load(backendRoot) {
  const FIXED_NOW = Date.parse(FIXTURES.frozenNow);
  Date.now = () => FIXED_NOW;
  for (const k of ENV_KEYS) delete process.env[k];
  const resolve = (...p) => require.resolve(path.join(backendRoot, ...p));
  const seed = (file, exports) => { require.cache[file] = { id: file, filename: file, loaded: true, exports }; };

  const db = {};
  const T = (n) => (db[n] = db[n] || []);
  const match = (row, where = {}) => Object.keys(where).every((k) => row[k] === where[k]);
  const model = (n) => ({
    async findUnique({ where }) { const r = T(n).find((x) => match(x, where)); return r ? { ...r } : null; },
    async findFirst({ where } = {}) { const r = T(n).find((x) => match(x, where)); return r ? { ...r } : null; },
    async findMany({ where } = {}) { return T(n).filter((x) => match(x, where)).map((r) => ({ ...r })); },
    async count({ where } = {}) { return T(n).filter((x) => match(x, where)).length; },
    async update({ where }) { const r = T(n).find((x) => match(x, where)); return r ? { ...r } : null; },
    async updateMany() { return { count: 0 }; },
    async create({ data }) { T(n).push({ ...data }); return { ...data }; },
    async upsert({ create }) { return { ...create }; },
  });
  const prisma = new Proxy({ async $transaction(a) { return typeof a === 'function' ? a(prisma) : Promise.all(a); } },
    { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? model(k) : undefined) });

  const byPage = (slug) => FIXTURES.cases.find((c) => c.slug === slug && c.handler === 'handleServeLP') || {};
  const byBusiness = (businessId) => {
    const page = FIXTURES.pages.find((p) => p.businessId === businessId);
    return page ? byPage(page.slug) : {};
  };
  const byOwner = (userId) => FIXTURES.cases.find((c) => c.dealAccess && (FIXTURES.pages.find((p) => p.slug === c.slug) || {}).userId === userId);

  let clerkFile;
  try { clerkFile = require.resolve('@clerk/backend', { paths: [backendRoot] }); } catch (_) { clerkFile = require.resolve('@clerk/backend'); }
  seed(clerkFile, { verifyToken: async () => { throw new Error('unused'); }, createClerkClient: () => ({ users: { getUser: async () => { throw new Error('unused'); } } }) });
  seed(resolve('src', 'utils', 'prismaClient.js'), prisma);
  seed(resolve('src', 'utils', 'pageCache.js'), { pageCache: { delByPrefix() {}, get() { return null; }, set() {} } });
  seed(resolve('src', 'controllers', 'qrController.js'), { getUserFromToken: async () => null });
  seed(resolve('src', 'services', 'emailService.js'), { sendWelcomeEmail: async () => ({}), sendCampaignEmail: async () => ({}) });
  seed(resolve('src', 'services', 'customerIdentityService.js'), { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} });
  seed(resolve('src', 'services', 'apnsService.js'), { pushUpdateToDevices: async () => ({ success: 0, failed: 0, errors: [] }) });
  seed(resolve('src', 'services', 'googleWalletService.js'), { updateGoogleWalletStamps: async () => {}, createGoogleWalletSaveUrl: async () => 'https://pay.google.com/gp/v/save/FIXTURE' });
  seed(resolve('src', 'services', 'webPushPages.js'), { recipientsForPage: async () => [], sendToRecipients: async () => ({}) });
  seed(resolve('src', 'services', 'stadtPocketContext.js'), { resolveStadtPocketContext: async (businessId) => ({ isStadtPocketLinked: !!byBusiness(businessId).stadtPocketLinked }) });
  seed(resolve('src', 'services', 'logoUploadService.js'), { uploadLogo: async () => ({}) });
  seed(resolve('src', 'services', 'stripUploadService.js'), { uploadStrip: async () => ({}) });
  seed(resolve('src', 'services', 'lpVoiceService.js'), {
    mergeVoiceOnSave: (v) => v, ensureVoiceAudio: async () => {}, effectiveGreeting: () => ({ enabled: false, text: '' }),
    audioIsCurrent: () => true, audioIsPlayable: (page) => !!byPage(page.slug).voicePlayable, flagVoiceOnSave: () => {}, publishVoiceStatus: () => ({ status: 'off' }),
  });
  seed(resolve('src', 'services', 'dealService.js'), { activeDealsForPage: async (slug) => byPage(slug).deals || [] });
  seed(resolve('src', 'services', 'dealAccess.js'), { getDealAccess: async (userId) => ({ allowed: !!byOwner(userId) }) });

  for (const p of FIXTURES.pages) T('landingPage').push({ ...p });
  for (const c of FIXTURES.cases) if (c.stampSettings) T('stampSettings').push(Object.assign({ slug: c.slug }, c.stampSettings));
  return require(resolve('src', 'controllers', 'lpController.js'));
}

function response() {
  return { statusCode: 200, body: undefined, headers: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = JSON.stringify(b); return this; },
    send(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, set(k, v) { this.headers[k] = v; return this; }, type() { return this; },
    redirect(c, u) { this.statusCode = typeof c === 'number' ? c : 302; this.body = 'REDIRECT ' + (u || c); return this; } };
}

// Renders every case; returns [{ id, status, headers, bytes, sha256, body }].
async function renderAll(backendRoot = path.join(__dirname, '..', '..')) {
  const lp = load(backendRoot);
  const out = [];
  const quiet = { warn: console.warn, error: console.error, log: console.log };
  for (const c of FIXTURES.cases) {
    for (const k of ENV_KEYS) delete process.env[k];
    Object.assign(process.env, c.env || {});
    const res = response();
    console.warn = console.error = console.log = () => {};
    try { await lp[c.handler]({ params: { slug: c.slug }, query: c.query || {}, headers: {}, method: 'GET', originalUrl: '/lp/' + c.slug, ip: '127.0.0.1' }, res); await new Promise((r) => setImmediate(r)); }
    finally { Object.assign(console, quiet); }
    const body = res.body == null ? '' : String(res.body);
    out.push({ id: c.id, status: res.statusCode, headers: Object.fromEntries(HEADERS.filter((h) => res.headers[h] !== undefined).map((h) => [h, res.headers[h]])),
      bytes: Buffer.byteLength(body), sha256: crypto.createHash('sha256').update(body, 'utf8').digest('hex'), body });
  }
  for (const k of ENV_KEYS) delete process.env[k];
  return out;
}

module.exports = { renderAll, FIXTURES };
