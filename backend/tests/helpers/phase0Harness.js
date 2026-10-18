// Phase 0 security tests: lpController with an in-memory database, a stand-in
// Clerk and stubbed outside services (no network, no real database). Every
// write is recorded in `db.writes` so tests can prove what was NOT written.
// "Bearer user_x" is a verified sign-in for Clerk user user_x; anything else
// is not signed in. user_admin is a platform admin.
const path = require('path');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', '..', ...p));

const db = { tables: {}, writes: [], seq: 0 };
const T = (name) => (db.tables[name] = db.tables[name] || []);
const matchValue = (v, cond) => {
  if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
    if ('gt' in cond) return v != null && new Date(v).getTime() > new Date(cond.gt).getTime();
    if ('in' in cond) return cond.in.includes(v);
    if ('not' in cond) return v !== cond.not;
  }
  return v === cond;
};
const matches = (row, where = {}) => Object.keys(where).every((k) => {
  if (k === 'slug_customerId') return row.slug === where[k].slug && row.customerId === where[k].customerId;
  return matchValue(row[k], where[k]);
});
const applyData = (row, data) => {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] || 0) + v.increment;
    else row[k] = v;
  }
  return row;
};
function model(name) {
  return {
    async findUnique({ where }) { const r = T(name).find((x) => matches(x, where)); return r ? Object.assign({}, r) : null; },
    async findFirst({ where = {}, orderBy } = {}) {
      let rows = T(name).filter((x) => matches(x, where));
      if (orderBy) { const [[k, dir]] = Object.entries(orderBy); rows = rows.slice().sort((a, b) => (new Date(a[k]) - new Date(b[k])) * (dir === 'desc' ? -1 : 1)); }
      return rows[0] ? Object.assign({}, rows[0]) : null;
    },
    async findMany({ where = {} } = {}) { return T(name).filter((x) => matches(x, where)).map((r) => Object.assign({}, r)); },
    async count({ where = {} } = {}) { return T(name).filter((x) => matches(x, where)).length; },
    async create({ data }) { db.writes.push(name + '.create'); const r = Object.assign({ id: name + '-' + (++db.seq), createdAt: new Date() }, data); T(name).push(r); return Object.assign({}, r); },
    async update({ where, data }) {
      db.writes.push(name + '.update');
      const r = T(name).find((x) => matches(x, where)); if (!r) throw new Error(name + ' not found');
      return Object.assign({}, applyData(r, data));
    },
    async updateMany({ where, data }) { db.writes.push(name + '.updateMany'); const rows = T(name).filter((x) => matches(x, where)); rows.forEach((r) => applyData(r, data)); return { count: rows.length }; },
    async upsert({ where, update, create }) {
      db.writes.push(name + '.upsert');
      const r = T(name).find((x) => matches(x, where));
      if (r) return Object.assign({}, applyData(r, update));
      const n = Object.assign({ id: name + '-' + (++db.seq), createdAt: new Date() }, create); T(name).push(n); return Object.assign({}, n);
    },
    async delete({ where }) { db.writes.push(name + '.delete'); const i = T(name).findIndex((x) => matches(x, where)); return T(name).splice(i, 1)[0]; },
    async deleteMany({ where }) { db.writes.push(name + '.deleteMany'); const before = T(name).length; db.tables[name] = T(name).filter((x) => !matches(x, where)); return { count: before - T(name).length }; },
  };
}
const prisma = new Proxy({ async $transaction(arg) { return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); } }, { get(t, k) { return k in t ? t[k] : (typeof k === 'string' ? model(k) : undefined); } });

const seed = (file, exports) => { require.cache[file] = { id: file, filename: file, loaded: true, exports }; };
const clerkUsers = {
  user_admin: { id: 'user_admin', publicMetadata: { role: 'admin' } },
  user_owner: { id: 'user_owner', publicMetadata: {} },
  user_other: { id: 'user_other', publicMetadata: {} },
};
seed(require.resolve('@clerk/backend'), {
  verifyToken: async () => { throw new Error('not used'); },
  createClerkClient: () => ({ users: { async getUser(id) { if (!clerkUsers[id]) throw new Error('not found'); return clerkUsers[id]; } } }),
});
seed(resolve('src', 'utils', 'prismaClient.js'), prisma);
seed(resolve('src', 'utils', 'pageCache.js'), { pageCache: { delByPrefix() {}, get() { return null; }, set() {} } });
seed(resolve('src', 'controllers', 'qrController.js'), { getUserFromToken: async (h) => (h && h.startsWith('Bearer user_') ? h.slice(7) : null) });
seed(resolve('src', 'services', 'emailService.js'), { sendWelcomeEmail: async () => ({}), sendCampaignEmail: async () => ({ success: 0, failed: 0 }) });
seed(resolve('src', 'services', 'customerIdentityService.js'), { resolveOrCreateCustomerIdentity: async () => null, attachDeterministicIdentity: async () => {} });
seed(resolve('src', 'services', 'apnsService.js'), { pushUpdateToDevices: async () => ({ success: 0, failed: 0, errors: [] }) });
seed(resolve('src', 'services', 'googleWalletService.js'), { updateGoogleWalletStamps: async () => {}, createGoogleWalletSaveUrl: async () => 'https://pay.google.com/x' });
seed(resolve('src', 'services', 'webPushPages.js'), { recipientsForPage: async () => [], sendToRecipients: async () => ({}) });
seed(resolve('src', 'services', 'stadtPocketContext.js'), { resolveStadtPocketContext: async () => ({ isStadtPocketLinked: false }) });
seed(resolve('src', 'services', 'logoUploadService.js'), { uploadLogo: async () => { db.writes.push('cloudinary.logo'); return { secure_url: 'https://res.cloudinary.com/x/logo.png' }; } });
seed(resolve('src', 'services', 'stripUploadService.js'), { uploadStrip: async () => { db.writes.push('cloudinary.strip'); return { secure_url: 'https://res.cloudinary.com/x/strip.png' }; } });
seed(resolve('src', 'services', 'lpVoiceService.js'), {
  mergeVoiceOnSave: (v) => v, ensureVoiceAudio: async () => {}, effectiveGreeting: () => ({ enabled: false, text: '' }),
  audioIsCurrent: () => true, audioIsPlayable: () => false, flagVoiceOnSave: () => {}, publishVoiceStatus: () => ({ status: 'off' }),
});

const lp = require(resolve('src', 'controllers', 'lpController.js'));
const staffPin = require(resolve('src', 'services', 'staffPin.js'));

function reset() { db.tables = {}; db.writes = []; db.seq = 0; staffPin._resetForTests(); }
function page(slug, extra = {}) {
  const sections = extra.sections !== undefined ? extra.sections : {};
  const row = Object.assign({ id: 'lp-' + slug, slug, businessName: 'Casa Lumi', websiteUrl: 'https://example.com', useCase: 'restaurant', brandColor: '#c2410c',
    logoUrl: null, userId: 'user_owner', businessId: null, qrType: 'ai', template: 'premium', status: 'live', scanCount: 7, createdAt: new Date(), updatedAt: new Date() }, extra,
  { sections: typeof sections === 'string' ? sections : JSON.stringify(sections) });
  T('landingPage').push(row);
  return row;
}
const res = () => ({ statusCode: 200, body: undefined, headers: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } });
const req = (o = {}) => Object.assign({ params: {}, query: {}, body: {}, headers: {}, method: 'GET', originalUrl: '/', ip: '127.0.0.1' }, o);
const quiet = async (fn) => { const w = console.warn, e = console.error, l = console.log; console.warn = console.error = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; console.log = l; } };
const settle = () => new Promise((r) => setImmediate(r));

function run(name, tests) {
  (async () => {
    let passed = 0, failed = 0;
    console.log(name);
    for (const t of tests) {
      try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
      catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); }
    }
    console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
    if (failed) process.exitCode = 1;
  })();
}

module.exports = { db, T, lp, staffPin, reset, page, res, req, quiet, settle, run, resolve };
