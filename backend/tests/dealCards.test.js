// ============================================================
// dealCards.test.js — QRAIVY Deals on Smart Landing Pages (Phase 3.2):
// the "current offers" cards a customer sees on a landing page.
//
//   R. the cards themselves: escaping, images, AI label, dates, limits
//   S. the real page (handleServeLP + renderPremiumLP + dealService on a
//      stand-in database): feature switch, unchanged pages, placement,
//      scheduling and statuses
//   C. caching: reuse, clearing on publish / archive / delete, end dates
//   K. compatibility: one hook in the page code, editor untouched
//   V. Welcome Voice and the cards on the same page (no recordings made)
//   T. text contrast on the card in the page's light and dark theme
//
// Run: node tests/dealCards.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }
const ROOT = path.join(__dirname, '..', '..');

// ── stand-in database ──────────────────────────────────────────
let deals = [], placements = [], pages = {}, queries = { placements: 0, scans: 0 }, seq = 0;
const clone = (r) => (r ? { ...r } : null);
// Prisma-style where: plain equality, or { not: v } per field (dealService's conditional publish writes).
const whereMatches = (row, where) => Object.keys(where).every((k) => (where[k] && typeof where[k] === 'object' && 'not' in where[k] ? row[k] !== where[k].not : row[k] === where[k]));
const mockPrisma = {
  deal: {
    findUnique: async ({ where }) => clone(deals.find((d) => d.id === where.id)),
    update: async ({ where, data }) => { const r = deals.find((d) => d.id === where.id); Object.assign(r, data); return { ...r }; },
    updateMany: async ({ where, data }) => { const rows = deals.filter((d) => whereMatches(d, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
    delete: async ({ where }) => { const i = deals.findIndex((d) => d.id === where.id); const [r] = deals.splice(i, 1); placements = placements.filter((p) => p.dealId !== r.id); return r; },
  },
  dealPlacement: {
    findUnique: async ({ where }) => {
      const k = where.dealId_channel_targetRef;
      return clone(where.id ? placements.find((p) => p.id === where.id) : placements.find((p) => p.dealId === k.dealId && p.channel === k.channel && p.targetRef === k.targetRef));
    },
    create: async ({ data }) => { const r = { id: 'pl_new_' + placements.length, publishedAt: null, ...data }; placements.push(r); return { ...r }; },
    updateMany: async ({ where, data }) => { const rows = placements.filter((p) => whereMatches(p, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
    findMany: async ({ where = {}, orderBy, take } = {}) => {
      queries.placements += 1;
      let rows = placements.filter((p) => Object.keys(where).every((k) => p[k] === where[k]));
      if (orderBy && orderBy.publishedAt === 'desc') rows = rows.slice().sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
      return rows.slice(0, take || rows.length).map(clone);
    },
    update: async ({ where, data }) => { const r = placements.find((p) => p.id === where.id); Object.assign(r, data); return { ...r }; },
  },
  landingPage: {
    findUnique: async ({ where }) => clone(pages[where.slug]),
    update: async ({ where, data }) => { if (data && data.scanCount) queries.scans += 1; return clone(pages[where.slug]); },
  },
  stampSettings: { findUnique: async () => null },
  business: { findUnique: async () => null },
  businessMember: { findUnique: async () => null },
  // Deals access of the page owner (Phase 3B.6): no User row; the owner is a pilot (below).
  user: { findUnique: async () => null },
  $transaction: async (fn) => fn(mockPrisma),
};
process.env.DEALS_PILOT_USER_IDS = 'user_owner';   // the page owner (OWNER) may show deals
delete process.env.DEALS_ENABLED;
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { id: 'p', filename: 'p', loaded: true, exports: mockPrisma };
for (const svc of ['apnsService', 'emailService', 'webPushService']) {
  const p = resolve('src', 'services', svc + '.js');
  require.cache[p] = { id: p, filename: p, loaded: true, exports: {} };
}
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
delete process.env.APP_ENV;
const realError = console.error;
console.error = (...a) => { if (!/^\[(deals|auth)\]/.test(String(a[0]))) realError(...a); };

let recordings = 0;
require('../src/services/voiceService').synthesizeAndUploadVoice = async () => { recordings += 1; throw new Error('no recordings in tests'); };

const { pageCache } = require('../src/utils/pageCache');
const cards = require('../src/services/dealCards');
const service = require('../src/services/dealService');
const { handleServeLP } = require('../src/controllers/lpController');

const OWNER = 'user_owner', OTHER = 'user_other';
const DAY = 864e5;
const IMG = 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1/qraivy-deals/deal-a-1.jpg';
function reset({ flag = true } = {}) {
  deals = []; placements = []; seq = 0; queries = { placements: 0, scans: 0 };
  pages = {
    'cafe': { id: 'lp1', slug: 'cafe', businessName: 'Café Test', userId: OWNER, status: 'live', sections: JSON.stringify({ language: 'de' }), websiteUrl: 'https://example.com' },
    'cafe-en': { id: 'lp2', slug: 'cafe-en', businessName: 'Cafe EN', userId: OWNER, status: 'live', sections: JSON.stringify({ language: 'en' }), websiteUrl: 'https://example.com' },
    'other': { id: 'lp3', slug: 'other', businessName: 'Other', userId: OTHER, status: 'live', sections: '{}', websiteUrl: 'https://example.com' },
  };
  pageCache.delByPrefix('deals:'); pageCache.delByPrefix('lp:'); pageCache.delByPrefix('stamp:');
  if (flag) process.env.DEALS_ON_LANDING_PAGES = '1'; else delete process.env.DEALS_ON_LANDING_PAGES;
}
function addDeal(fields = {}, onPages = ['cafe'], placementStatus = 'published') {
  seq += 1;
  const d = { id: 'deal_' + seq, ownerUserId: OWNER, createdBy: OWNER, businessId: null, status: 'published', title: 'Kaffee-Deal', offerText: '2 Kaffees zum Preis von 1',
    description: 'Nur heute', offerType: 'two_for_one', offerDetails: { buyQty: 1, freeQty: 1 }, image: { source: 'uploaded', url: IMG, publicId: 'qraivy-deals/deal-a-1', width: 1200, height: 900 },
    startsAt: null, endsAt: null, publishedAt: new Date(), draftData: null, ...fields };
  deals.push(d);
  for (const slug of onPages) placements.push({ id: 'pl_' + seq + '_' + slug, dealId: d.id, channel: 'landing_page', targetRef: slug, status: placementStatus, publishedAt: new Date(Date.now() + seq) });
  return d;
}
async function serve(slug, query = { preview: '1' }) {
  const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; } };
  await handleServeLP({ params: { slug }, query, headers: {} }, res);
  return res;
}
const section = (html) => { const m = html.match(/<!-- QRAIVY Deals -->\n<section class="qd-deals"[\s\S]*?<\/section>\n/); return m ? m[0] : null; };

let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }

// ── R. The cards ───────────────────────────────────────────────
test('R. all text is escaped', () => {
  const html = cards.renderDealCards([{ title: '<img src=x onerror=alert(1)>', offerText: '"><script>alert(2)</script>', description: "it's & <b>", endsAt: null, image: null }], { lang: 'en', pageOrigin: 'https://www.qraivy.com' });
  assert.ok(!/<script>|<img src=x|<b>/.test(html));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;') && html.includes('&quot;&gt;&lt;script&gt;') && html.includes('it&#39;s &amp; &lt;b&gt;'));
});

test('R. only our own Cloudinary 4:3 images and catalog starters become <img>; anything else shows a colour', () => {
  const r = (image, origin = 'https://www.qraivy.com') => cards.renderDealCards([{ title: 't', offerText: 'o', image }], { lang: 'en', pageOrigin: origin });
  assert.ok(r({ source: 'uploaded', url: IMG }).includes('<img src="' + IMG + '" alt="" width="1200" height="900"'));
  for (const bad of ['javascript:alert(1)', 'http://res.cloudinary.com/test-cloud/image/upload/v1/a.jpg', 'https://evil.example.com/image/upload/v1/a.jpg',
    'https://res.cloudinary.com/test-cloud/image/upload/v1/a.jpg" onerror="x', 'https://res.cloudinary.com/test-cloud/video/upload/v1/a.mp4']) {
    assert.ok(!r({ source: 'uploaded', url: bad }).includes('<img'), bad);
  }
  const st = r({ source: 'starter', starterId: 'bakery-croissants-01', aiGenerated: true });
  assert.ok(st.includes('<img src="https://www.qraivy.com/images/deals/starter/bakery-croissants-01.jpg"'));
  assert.ok(st.includes('AI · KI-generiert'), 'AI disclosure on starter images');
  assert.ok(!r({ source: 'starter', starterId: '../../x' }).includes('<img'));
  assert.ok(!r({ source: 'starter', starterId: 'bakery-croissants-01' }, 'javascript:x').includes('<img'), 'never with an unsafe origin');
  assert.ok(!r({ source: 'uploaded', url: IMG }).includes('AI · KI-generiert'), 'uploads are not labelled AI');
  assert.ok(r({ source: 'background', backgroundId: 'ocean' }).includes(cards.BACKGROUND_CSS.ocean));
});

test('R. German and English texts; validity in Berlin time', () => {
  const d = { title: 't', offerText: 'o', endsAt: '2026-10-21T21:59:59.000Z' };
  const de = cards.renderDealCards([d], { lang: 'de', pageOrigin: 'https://www.qraivy.com', now: Date.parse('2026-10-15T10:00:00Z') });
  assert.ok(de.includes('Aktuelle Angebote') && de.includes('Gültig bis 21.10.2026'));
  const en = cards.renderDealCards([d], { lang: 'en', pageOrigin: 'https://www.qraivy.com', now: Date.parse('2026-10-15T10:00:00Z') });
  assert.ok(en.includes('Current offers') && en.includes('Valid until 21 Oct 2026'));
});

test('R. at most three cards; ended or not-yet-started deals and empty lists render nothing', () => {
  const now = Date.now();
  const many = [1, 2, 3, 4].map((i) => ({ title: 'T' + i, offerText: 'O' + i }));
  assert.equal((cards.renderDealCards(many, { now }).match(/class="qd-card"/g) || []).length, 3);
  assert.equal(cards.renderDealCards([{ title: 't', offerText: 'o', endsAt: new Date(now - 1000).toISOString() }], { now }), '');
  assert.equal(cards.renderDealCards([{ title: 't', offerText: 'o', startsAt: new Date(now + 1000).toISOString() }], { now }), '');
  assert.equal(cards.renderDealCards([], { now }), '');
  assert.equal(cards.renderDealCards(null, { now }), '');
});

test('R. placement in the page: before the footer, else before </body>, else nowhere', () => {
  assert.equal(cards.insertSection('<body>a<footer>f</footer></body>', 'S'), '<body>a<!-- QRAIVY Deals -->\nS\n<footer>f</footer></body>');
  assert.equal(cards.insertSection('<body>a</body>', 'S'), '<body>a<!-- QRAIVY Deals -->\nS\n</body>');
  assert.equal(cards.insertSection('no page', 'S'), 'no page');
});

// ── S. The real page ───────────────────────────────────────────
test('S. switched off (default): the page is byte-identical and no deal is even looked up', async () => {
  reset({ flag: false });
  addDeal();
  const off = await serve('cafe');
  assert.equal(off.statusCode, 200);
  assert.equal(section(off.body), null);
  assert.equal(queries.placements, 0, 'no database query when the switch is off');
  assert.equal(cards.isEnabled({}), false);
  assert.equal(cards.isEnabled({ DEALS_ON_LANDING_PAGES: 'true' }), false, 'only exactly "1" switches it on');
});

test('S. switched on but no active deal: the page is byte-identical to the switched-off page', async () => {
  reset({ flag: false });
  const off = (await serve('cafe')).body;
  reset();
  const on = (await serve('cafe')).body;
  assert.equal(on, off);
});

test('S. an active deal appears once, before the footer, and the rest of the page is unchanged', async () => {
  reset({ flag: false });
  const off = (await serve('cafe')).body;
  reset();
  addDeal({ endsAt: new Date(Date.now() + 5 * DAY).toISOString() });
  const on = (await serve('cafe')).body;
  const s = section(on);
  assert.ok(s, 'section present');
  assert.equal((on.match(/<section class="qd-deals"/g) || []).length, 1);
  assert.ok(on.indexOf(s) < on.indexOf('<footer'), 'before the footer');
  assert.equal(on.replace(s, ''), off, 'nothing else on the page changed');
  for (const t of ['Aktuelle Angebote', '2 Kaffees zum Preis von 1', 'Kaffee-Deal', 'Nur heute', 'Gültig bis', '<img src="' + IMG + '"']) assert.ok(s.includes(t), t);
  assert.ok(!/ownerUserId|user_owner|draftData|deal_1|publicId/.test(s), 'nothing private in the page');
});

test('S. only deals that are published, running, published on THIS page and owned by its owner appear', async () => {
  reset();
  const now = Date.now();
  addDeal({ title: 'Scheduled', startsAt: new Date(now + DAY).toISOString() });
  addDeal({ title: 'Expired', endsAt: new Date(now - DAY).toISOString() });
  addDeal({ title: 'Archived', status: 'archived' });
  addDeal({ title: 'Draft', status: 'draft' });
  addDeal({ title: 'DraftPlacement' }, ['cafe'], 'draft');
  addDeal({ title: 'ArchivedPlacement' }, ['cafe'], 'archived');
  addDeal({ title: 'Unassigned' }, []);
  addDeal({ title: 'OtherPage' }, ['cafe-en']);
  addDeal({ title: 'NotTheOwner', ownerUserId: OTHER }, ['cafe']);
  const body = (await serve('cafe')).body;
  assert.equal(section(body), null, 'none of them appears');
  addDeal({ title: 'Running' });
  pageCache.delByPrefix('deals:');
  const s = section((await serve('cafe')).body);
  assert.ok(s && s.includes('Running'));
  for (const t of ['Scheduled', 'Expired', 'Archived', 'DraftPlacement', 'ArchivedPlacement', 'Unassigned', 'OtherPage', 'NotTheOwner']) assert.ok(!s.includes('>' + t + '<'), t);
});

test('S. a normal visit (not preview) shows the cards too, and still counts the scan', async () => {
  reset();
  addDeal();
  const res = await serve('cafe-en', {});
  assert.equal(section(res.body), null, 'not placed on this page');
  addDeal({ title: 'EN deal' }, ['cafe-en']);
  pageCache.delByPrefix('deals:');
  const s = section((await serve('cafe-en', {})).body);
  assert.ok(s && s.includes('Current offers') && s.includes('EN deal'));
  await new Promise((r) => setImmediate(r));
  assert.equal(queries.scans, 2, 'both normal visits were counted as scans');
});

// ── C. Caching ─────────────────────────────────────────────────
test('C. the deal list is reused for 30 s instead of queried on every view', async () => {
  reset();
  addDeal();
  await serve('cafe'); const q1 = queries.placements;
  await serve('cafe'); await serve('cafe');
  assert.equal(queries.placements, q1, 'served from the cache');
  assert.equal(cards.DEAL_CARDS_CACHE_MS, 30000);
});

test('C. archiving a deal, a placement, or deleting the deal removes it from the page at once', async () => {
  for (const action of ['archiveDeal', 'archivePlacement', 'deleteDeal']) {
    reset();
    const d = addDeal();
    assert.ok(section((await serve('cafe')).body), action + ': shown first');
    if (action === 'archiveDeal') await service.archiveDeal(OWNER, d.id);
    if (action === 'archivePlacement') await service.archiveDealPlacement(OWNER, d.id, placements[0].id);
    if (action === 'deleteDeal') await service.deleteDeal(OWNER, d.id);
    assert.equal(section((await serve('cafe')).body), null, action + ': gone immediately, not after the cache time');
  }
});

test('C. publishing a deal or a placement shows it at once', async () => {
  reset();
  const d = addDeal({ status: 'draft' }, ['cafe'], 'draft');
  assert.equal(section((await serve('cafe')).body), null);
  await service.publishDeal(OWNER, d.id, { includePlacements: true });
  assert.ok(section((await serve('cafe')).body), 'deal + placement published together: shown immediately');
  reset();
  const e = addDeal({}, ['cafe'], 'draft');
  assert.equal(section((await serve('cafe')).body), null);
  await service.publishDealPlacement(OWNER, e.id, placements[0].id);
  assert.ok(section((await serve('cafe')).body), 'placement published: shown immediately');
});

test('C. removed, re-added and published again: the page follows each step at once', async () => {
  reset();
  const d = addDeal({ title: 'Wieder da' });
  const pid = placements[0].id;
  assert.ok(section((await serve('cafe')).body), 'shown');
  await service.archiveDealPlacement(OWNER, d.id, pid);
  assert.equal(section((await serve('cafe')).body), null, 'removed: gone at once');
  await service.addDealPlacement(OWNER, d.id, { channel: 'landing_page', targetRef: 'cafe' });
  assert.equal(placements.length, 1, 'the same record');
  assert.equal(section((await serve('cafe')).body), null, 're-added as a draft: still hidden');
  await service.publishDealPlacement(OWNER, d.id, pid);
  const s = section((await serve('cafe')).body);
  assert.ok(s && s.includes('Wieder da'), 'published again: shown at once');
});

test('C. a deal that ends disappears on time even while the list is cached', async () => {
  reset();
  const now = Date.now();
  addDeal({ endsAt: new Date(now + 10 * 1000).toISOString() });
  const page = pages.cafe;
  const first = await cards.injectActiveDeals('<body><footer></footer></body>', page, { now, pageOrigin: 'https://www.qraivy.com' });
  assert.ok(first.includes('qd-deals'));
  const later = await cards.injectActiveDeals('<body><footer></footer></body>', page, { now: now + 20 * 1000, pageOrigin: 'https://www.qraivy.com' });
  assert.equal(later, '<body><footer></footer></body>', 'hidden although the cached list still contains it');
});

test('C. a failure while loading deals never breaks the page', async () => {
  reset();
  const html = '<body><footer></footer></body>';
  const out = await cards.injectActiveDeals(html, pages.cafe, { service: { activeDealsForPage: async () => { throw new Error('db down'); } } });
  assert.equal(out, html);
});

// ── K. Compatibility ───────────────────────────────────────────
test('K. Phase 3.2 (commit 8d414f4) changed the page code by exactly the one hook; editor and other features untouched', () => {
  const diff = execFileSync('git', ['diff', '48260df', '8d414f4', '-U0', '--', 'backend/src/controllers/lpController.js'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((l) => /^[+-][^+-]/.test(l)).map((l) => l.replace(/\r$/, ''));
  assert.deepEqual(diff, [
    "+const { injectActiveDeals } = require('../services/dealCards'); // QRAIVY Deals cards; off unless DEALS_ON_LANDING_PAGES=1",
    '-    const _lpHtml = renderPremiumLP(page);',
    '+    const _lpHtml = await injectActiveDeals(renderPremiumLP(page), page);',
  ]);
  const untouched = execFileSync('git', ['diff', '48260df', '8d414f4', '--name-only', '--', 'frontend', 'backend/prisma', 'backend/src/routes', 'backend/src/services/voiceService.js',
    'backend/src/services/lpVoiceService.js', 'backend/src/controllers/qrController.js'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(untouched, '', 'no editor, frontend, schema, route, voice or QR change');
});

test('K. the card colours mirror the Deal Builder backgrounds', () => {
  const page = fs.readFileSync(path.join(ROOT, 'frontend', 'public', 'deals.html'), 'utf8');
  for (const [id, css] of Object.entries(cards.BACKGROUND_CSS)) assert.ok(page.includes("{ id: '" + id + "', css: '" + css + "' }"), id);
  const { DEAL_BACKGROUNDS } = require('../src/data/dealImages');
  assert.deepEqual(Object.keys(cards.BACKGROUND_CSS).sort(), DEAL_BACKGROUNDS.slice().sort());
});

// ── V. Welcome Voice and Deal cards together ───────────────────
const lpVoice = require('../src/services/lpVoiceService');
const VOICE_URL = 'https://res.cloudinary.com/test-cloud/video/upload/v1/qraivy-voice/voice-cafe-1.mp3';
// A page with Welcome Voice on and a recording of its current greeting (audioFor = its fingerprint).
function addVoicePage() {
  const p = { id: 'lpv', slug: 'voice-cafe', businessName: 'Café Stimme', userId: OWNER, status: 'live', websiteUrl: 'https://example.com', useCase: 'cafe' };
  const s = { language: 'de', voice: { enabled: true, audioUrl: VOICE_URL } };
  p.sections = JSON.stringify(s);
  s.voice.audioFor = lpVoice.effectiveGreeting(p).fingerprint;
  p.sections = JSON.stringify(s);
  pages['voice-cafe'] = p;
  return p;
}
// The live (premium) page's click-to-play card: from its section to the AI chat that follows it.
const voiceSection = (html) => { const b = html.indexOf('id="audio-play-btn"'); if (b === -1) return null; return html.slice(html.lastIndexOf('<div class="section">', b), html.indexOf('<!-- AI CHAT -->', b)); };
const PLAY = 'id="audio-play-btn"';
const voiceScript = (html) => (html.match(/var audioUrl = [^;]*;/) || [null])[0];
async function serveWith(flag) {
  if (flag) process.env.DEALS_ON_LANDING_PAGES = '1'; else delete process.env.DEALS_ON_LANDING_PAGES;
  pageCache.delByPrefix('deals:'); pageCache.delByPrefix('lp:');
  return serve('voice-cafe');
}
// No network at all while these pages are served.
async function offline(fn) {
  const https = require('https'), http = require('http');
  const real = [https.request, https.get, http.request, http.get];
  let calls = 0;
  https.request = https.get = http.request = http.get = () => { calls += 1; throw new Error('no network in tests'); };
  try { await fn(); } finally { [https.request, https.get, http.request, http.get] = real; }
  return calls;
}

test('V. the fixture is a playable Welcome Voice page (switched on, current recording)', () => {
  reset();
  const p = addVoicePage();
  assert.equal(lpVoice.audioIsPlayable(p), true);
  assert.equal(lpVoice.effectiveGreeting(p).enabled, true);
});

test('V. Welcome Voice play button and the Deal card appear together on the same page', async () => {
  reset();
  addVoicePage();
  addDeal({ title: 'Kaffee & Stimme' }, ['voice-cafe']);
  let html;
  const net = await offline(async () => { html = (await serveWith(true)).body; });
  assert.ok(html.includes(PLAY) && html.includes('onclick="playAudio(this)"'), 'click-to-play button');
  assert.equal(voiceScript(html), 'var audioUrl = ' + JSON.stringify(VOICE_URL) + ';', 'the player gets the recording');
  const s = section(html);
  assert.ok(s && s.includes('Kaffee &amp; Stimme'), 'deal card');
  assert.equal((html.match(/id="audio-play-btn"/g) || []).length, 1);
  assert.equal((html.match(/<section class="qd-deals"/g) || []).length, 1);
  assert.ok(html.indexOf(PLAY) < html.indexOf('qd-deals'), 'voice where it always was, the cards before the footer');
  assert.equal(net, 0, 'no network');
  assert.equal(recordings, 0, 'no recording made');
});

test('V. the voice player markup is byte-identical with Deal cards on; the cards are the only difference', async () => {
  reset();
  addVoicePage();
  addDeal({}, ['voice-cafe']);
  let off, on;
  await offline(async () => { off = (await serveWith(false)).body; on = (await serveWith(true)).body; });
  assert.ok(voiceSection(off) && voiceSection(off).includes(PLAY) && voiceSection(off).includes('Welcome from'));
  assert.equal(voiceSection(on), voiceSection(off), 'voice section unchanged');
  assert.equal(voiceScript(on), voiceScript(off), 'player script unchanged');
  assert.equal(on.replace(section(on), ''), off, 'everything except the inserted cards is identical');
});

test('V. switching Deal cards off leaves Welcome Voice as it is (and hides only the cards)', async () => {
  reset();
  addVoicePage();
  addDeal({ title: 'Nur mit Schalter' }, ['voice-cafe']);
  let html;
  const net = await offline(async () => { html = (await serveWith(false)).body; });
  assert.ok(html.includes(PLAY), 'play button still there');
  assert.equal(voiceScript(html), 'var audioUrl = ' + JSON.stringify(VOICE_URL) + ';');
  assert.equal(section(html), null, 'no cards');
  assert.ok(!html.includes('Nur mit Schalter'));
  assert.equal(placements[0].status, 'published', 'the placement itself is untouched');
  assert.equal(net, 0);
  assert.equal(recordings, 0);
});
// ── T. Text contrast in the light and dark theme ───────────────
// A small CSS cascade over the page's real stylesheets (the rendered
// landing page + the cards): rules with descendant selectors made of
// .class / tag / *, ranked by !important, specificity and order, with
// colour inheritance. Enough to see what the page's dark theme does to the
// card -- its rules are exactly of that form (.dark-mode h3, .dark-mode p).
function cssRules(html) {
  let css = (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).map((b) => b.replace(/<\/?style[^>]*>/g, '')).join('\n');
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let flat = '', depth = 0, skip = -1;                       // drop @media / @keyframes blocks
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '@' && depth === 0) skip = 0;
    if (c === '{') { depth++; if (skip === 0) skip = depth; }
    if (skip > 0) { if (c === '}' && depth === skip) { skip = -1; } if (c === '}') depth--; continue; }
    if (c === '}') depth--;
    if (skip === -1) flat += c;
  }
  const rules = [];
  let order = 0;
  for (const chunk of flat.split('}')) {
    const at = chunk.indexOf('{'); if (at === -1) continue;
    const decls = chunk.slice(at + 1).split(';').map((d) => d.trim()).filter(Boolean);
    for (const sel of chunk.slice(0, at).split(',').map((x) => x.trim())) {
      if (!/^(\.[\w-]+|[a-z][\w-]*|\*)(\s+(\.[\w-]+|[a-z][\w-]*|\*))*$/i.test(sel)) continue;
      const parts = sel.split(/\s+/);
      const spec = [parts.filter((p) => p[0] === '.').length, parts.filter((p) => /^[a-z]/i.test(p)).length];
      for (const d of decls) {
        const m = d.match(/^(color|background|background-color)\s*:\s*(.+?)\s*(!important)?$/i); if (!m) continue;
        rules.push({ parts, prop: m[1].toLowerCase() === 'color' ? 'color' : 'background', value: m[2].trim(), important: !!m[3], spec, order: order++ });
      }
    }
  }
  return rules;
}
const matchesOne = (el, part) => part === '*' || (part[0] === '.' ? el.classes.includes(part.slice(1)) : el.tag === part.toLowerCase());
function matches(chain, i, parts) {                         // chain[i] is the element, chain[0..i-1] its ancestors
  if (!matchesOne(chain[i], parts[parts.length - 1])) return false;
  let j = i - 1;
  for (let k = parts.length - 2; k >= 0; k--) { while (j >= 0 && !matchesOne(chain[j], parts[k])) j--; if (j < 0) return false; j--; }
  return true;
}
function winner(rules, chain, i, prop) {
  const hit = rules.filter((r) => r.prop === prop && matches(chain, i, r.parts));
  hit.sort((a, b) => (a.important - b.important) || (a.spec[0] - b.spec[0]) || (a.spec[1] - b.spec[1]) || (a.order - b.order));
  return hit.length ? hit[hit.length - 1].value : null;
}
function colorOf(rules, chain, i) {                         // inherited, like the browser
  for (let k = i; k >= 0; k--) { const v = winner(rules, chain, k, 'color'); if (v && v !== 'inherit') return v; }
  return '#000';
}
function rgbOf(v) {
  const hex = String(v).match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hex) { const h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1]; return [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16)); }
  const rgb = String(v).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return rgb.slice(1, 4).map(Number);
  if (/^white$/i.test(v)) return [255, 255, 255];
  throw new Error('unknown colour ' + v);
}
function contrast(a, b) {
  const L = (c) => { const [r, g, bl] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [L(rgbOf(a)), L(rgbOf(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
// The card as rendered: body > section.qd-deals > div.qd-list > article.qd-card > div.qd-body > text
const el = (tag, ...classes) => ({ tag, classes });
function cardChain(dark) { return [el('html'), el('body', ...(dark ? ['dark-mode'] : [])), el('section', 'qd-deals'), el('div', 'qd-list'), el('article', 'qd-card'), el('div', 'qd-body')]; }
const CARD_TEXT = [['offer', el('p', 'qd-offer')], ['deal title', el('h3', 'qd-name')], ['description', el('p', 'qd-desc')], ['expiry date', el('p', 'qd-valid')]];
async function pageWithCard() {
  reset();
  addDeal({ title: 'Kontrast', description: 'Gut lesbar', endsAt: new Date(Date.now() + 3 * DAY) });
  return (await serve('cafe')).body;
}

test('T. the rendered card uses the expected elements and the page really has its dark-theme text rules', async () => {
  const html = await pageWithCard();
  const s = section(html);
  for (const [, e] of CARD_TEXT) assert.ok(new RegExp('<' + e.tag + ' class="' + e.classes[0] + '"').test(s), e.tag + '.' + e.classes[0]);
  assert.ok(/<article class="qd-card"/.test(s) && /<div class="qd-body"/.test(s));
  // the precondition for this test to mean anything: the page recolours text in dark mode
  const r = cssRules(html);
  assert.ok(r.some((x) => x.parts.join(' ') === '.dark-mode h3' && x.important), '.dark-mode h3 { … !important }');
  assert.ok(r.some((x) => x.parts.join(' ') === '.dark-mode p'), '.dark-mode p');
});

for (const dark of [false, true]) {
  test('T. ' + (dark ? 'dark' : 'light') + ' theme: the card stays white and its offer, title, description and expiry date reach at least 7:1', async () => {
    const html = await pageWithCard();
    const rules = cssRules(html);
    const chain = cardChain(dark);
    const bg = winner(rules, chain, 4, 'background');
    assert.ok(bg && contrast(bg, '#fff') === 1, 'card background is white, got ' + bg);
    for (const [name, e] of CARD_TEXT) {
      const c = chain.concat([e]);
      const col = colorOf(rules, c, c.length - 1);
      const ratio = contrast(col, '#fff');
      assert.ok(ratio >= 7, name + ': ' + col + ' on white = ' + ratio.toFixed(2) + ':1');
    }
  });
}

test('T. the heading on the page background is readable in both themes (at least 4.5:1)', async () => {
  const html = await pageWithCard();
  const rules = cssRules(html);
  const light = [el('html'), el('body'), el('section', 'qd-deals'), el('h2', 'qd-heading')];
  const dark = [el('html'), el('body', 'dark-mode'), el('section', 'qd-deals'), el('h2', 'qd-heading')];
  assert.ok(contrast(colorOf(rules, light, 3), '#f8f8f8') >= 4.5, 'light: ' + colorOf(rules, light, 3) + ' on the default page background');
  assert.ok(contrast(colorOf(rules, dark, 3), '#111') >= 4.5, 'dark: ' + colorOf(rules, dark, 3) + ' on the dark page background');
});

test('T. image, layout, spacing and rounded corners are unchanged', () => {
  const html = cards.renderDealCards([{ title: 'A', offerText: 'B', description: 'C', endsAt: null, image: null }], { lang: 'de' });
  for (const rule of ['.qd-deals{max-width:560px;margin:0 auto 32px;padding:0 20px', '.qd-list{display:grid;gap:14px}', 'border-radius:16px;overflow:hidden',
    '.qd-media{position:relative;aspect-ratio:4/3', '.qd-media img{display:block;width:100%;height:100%;object-fit:cover}', '.qd-body{padding:14px 16px 16px}',
    '.qd-offer{margin:0 0 4px;font-size:18px;font-weight:800', '.qd-valid{margin:0;font-size:12px']) assert.ok(html.includes(rule), rule);
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log('PASS  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
