// ============================================================
// studioDealsData.test.js — Landing Page Studio V3, Phase D2: the read-only
// Deals data file (frontend/public/js/studio/studio-deals-data.js).
//
// With a recording fetch: exactly the three GET requests, the Clerk token,
// no request without an API address or a session; every failure is a
// failure (never samples); only deals the selected page shows right now,
// published, running and without unpublished changes; display fields only.
// The real endpoints and tenant isolation: studioDealsPreview.browser.test.js.
// Run: node tests/studioDealsData.test.js
// ============================================================
const assert = require('assert/strict');
const DD = require('../../frontend/public/js/studio/studio-deals-data.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const API = 'https://api.example.test';
const DAY = 864e5;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const STARTERS = [{ id: 'bakery-bread-01', origin: { type: 'ai_generated' } }, { id: 'own-photo-01', origin: { type: 'photo' } }];
const CLD = 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1/qraivy-deals/d1.jpg';

function deal(id, extra) {
  return Object.assign({ dealId: id, businessId: 'biz_secret', status: 'published', displayStatus: 'published', publishedAt: iso(-DAY), title: 'Deal ' + id, offerText: '2 for 1',
    description: 'Every Monday', offerType: 'two_for_one', offerDetails: null, image: { source: 'uploaded', url: CLD, publicId: 'qraivy-deals/d1', width: 1200, height: 900, master: { url: CLD } },
    startsAt: iso(-DAY), endsAt: iso(7 * DAY), isExpired: false, hasUnpublishedChanges: false }, extra);
}
const ANSWERS = () => ({
  '/deals/access': { status: 200, body: { allowed: true, reason: 'pilot', dealLimit: 10, activeDeals: 3 } },
  '/deals/pages': { status: 200, body: { pages: [
    { slug: 'cafe', name: 'Café', live: true, shownDealIds: ['d1', 'd2', 'd3'] },
    { slug: 'shop', name: 'Shop', live: true, shownDealIds: ['d4'] },
    { slug: 'draft-page', name: 'Draft page', live: false, shownDealIds: [] }] } },
  '/deals': { status: 200, body: { deals: [deal('d1'), deal('d2', { image: { source: 'starter', starterId: 'bakery-bread-01', aiGenerated: true } }), deal('d3', { image: { source: 'background', backgroundId: 'ember' } }), deal('d4')] } },
});
// a fetch that answers from `answers` and records every call
function recorder(answers, opts = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (opts.reject) throw new TypeError('Failed to fetch');
    const path = url.slice(API.length);
    const a = answers[path] || { status: 404, body: { error: 'Not found.' } };
    return { status: a.status, ok: a.status >= 200 && a.status < 300, json: async () => { if (a.raw) throw new SyntaxError('bad json'); return a.body; } };
  };
  return { calls, fetch };
}
const make = (rec, o = {}) => DD.createDealsData(Object.assign({ api: API, getToken: () => 'tok_anna', starters: STARTERS, fetch: rec.fetch }, o));

test('not connected (no or an unacceptable API address, no fetch, no token getter): samples, and no request at all', async () => {
  for (const api of ['', undefined, 'http://api.example.test', 'https://api.example.test/', 'https://api.example.test/deals', 'https://evil.example?x=1', 'javascript:alert(1)', 'https://a b.com', 'http://evil.example:80']) {
    const rec = recorder(ANSWERS());
    const d = make(rec, { api });
    assert.equal(d.connected(), false, String(api));
    assert.deepEqual(await d.load(), { state: 'sample', pages: [], page: '', items: [], withheld: 0 });
    assert.equal(rec.calls.length, 0, String(api));
  }
  const rec = recorder(ANSWERS());
  assert.equal(make(rec, { getToken: undefined }).connected(), false);
  assert.equal(DD.createDealsData({ api: API, getToken: () => 't', fetch: undefined }).connected(), typeof globalThis.fetch === 'function', 'the browser fetch otherwise');
  for (const api of [API, 'https://qraivy-deals-api-deals-preview.up.railway.app', 'http://127.0.0.1:5190', 'http://localhost:3000']) assert.equal(make(recorder({}), { api }).connected(), true, api);
});

test('exactly the three GET requests, in order, with the Clerk token: no body, no cookies, no redirects, no referrer', async () => {
  const rec = recorder(ANSWERS());
  const r = await make(rec).load();
  assert.equal(r.state, 'live');
  assert.deepEqual(rec.calls.map((c) => c.url), [API + '/deals/access', API + '/deals/pages', API + '/deals']);
  for (const { init } of rec.calls) {
    assert.deepEqual(Object.keys(init).sort(), ['cache', 'credentials', 'headers', 'method', 'redirect', 'referrerPolicy', 'signal']);
    assert.equal(init.method, 'GET');
    assert.deepEqual(init.headers, { Authorization: 'Bearer tok_anna', Accept: 'application/json' });
    assert.deepEqual([init.credentials, init.cache, init.redirect, init.referrerPolicy], ['omit', 'no-store', 'error', 'no-referrer']);
    assert.ok(!('body' in init));
  }
  // another page of the same owner: from the answers already loaded, no new request
  const shop = make(rec);
  await shop.load();
  const n = rec.calls.length;
  assert.equal(shop.select('shop').page, 'shop');
  assert.equal(rec.calls.length, n, 'choosing a page sends nothing');
});

test('no session token: "signin", and nothing is sent', async () => {
  for (const getToken of [() => null, () => '', () => Promise.resolve(null), () => undefined, () => 42, () => { throw new Error('no session'); }, () => Promise.reject(new Error('x'))]) {
    const rec = recorder(ANSWERS());
    const r = await make(rec, { getToken }).load();
    assert.equal(r.state, rec.calls.length ? 'error' : r.state);
    assert.equal(rec.calls.length, 0);
    assert.ok(['signin', 'error'].includes(r.state));
    assert.deepEqual([r.items, r.pages], [[], []], 'never samples, never data');
  }
  assert.equal((await make(recorder(ANSWERS()), { getToken: () => null }).load()).state, 'signin');
  assert.equal((await make(recorder(ANSWERS()), { getToken: async () => 'tok_anna' }).load()).state, 'live', 'a token from a promise (Clerk getToken())');
});

test('every failure is a failure: 401 sign in, 403 and access refused "disabled", anything else "error"; never samples, never stale data', async () => {
  const cases = [
    [{ '/deals/access': { status: 401, body: {} } }, 'signin', 1],
    [{ '/deals/access': { status: 403, body: { error: 'staging_account' } } }, 'disabled', 1],
    [{ '/deals/access': { status: 200, body: { allowed: false, reason: 'not_rolled_out' } } }, 'disabled', 1],
    [{ '/deals/access': { status: 200, body: { allowed: false, reason: 'plan_required' } } }, 'disabled', 1],
    [{ '/deals/access': { status: 200, body: { reason: 'pilot' } } }, 'error', 1],
    [{ '/deals/access': { status: 200, body: null } }, 'error', 1],
    [{ '/deals/access': { status: 500, body: {} } }, 'error', 1],
    [{ '/deals/access': { status: 200, raw: true } }, 'error', 1],
    [{ '/deals/pages': { status: 500, body: {} } }, 'error', 2],
    [{ '/deals/pages': { status: 401, body: {} } }, 'signin', 2],
    [{ '/deals/pages': { status: 200, body: { pages: 'x' } } }, 'error', 3],
    [{ '/deals': { status: 502, body: {} } }, 'error', 3],
    [{ '/deals': { status: 200, body: { deals: {} } } }, 'error', 3],
    [{ '/deals': { status: 200, raw: true } }, 'error', 3],
  ];
  for (const [over, state, calls] of cases) {
    const rec = recorder(Object.assign(ANSWERS(), over));
    const d = make(rec);
    const r = await d.load();
    assert.equal(r.state, state, JSON.stringify(over));
    assert.equal(rec.calls.length, calls, JSON.stringify(over));
    assert.deepEqual([r.items, r.pages, r.withheld], [[], [], 0], 'nothing shown');
    assert.equal(d.select('cafe'), null, 'nothing kept from a failed load');
  }
  const off = recorder(ANSWERS(), { reject: true });
  assert.equal((await make(off).load()).state, 'error', 'network down');
  // a later failure forgets the earlier answers
  const answers = ANSWERS();
  const d = make(recorder(answers));
  assert.equal((await d.load()).state, 'live');
  assert.equal(d.select('cafe').state, 'live');
  answers['/deals'] = { status: 500, body: {} };
  assert.equal((await d.load()).state, 'error');
  assert.equal(d.select('cafe'), null, 'the earlier deals are gone after a failed reload');
});

test('only deals the page shows right now: published, running, no unpublished changes; withheld counted; order kept; at most 3', async () => {
  const a = ANSWERS();
  a['/deals/pages'].body.pages[0].shownDealIds = ['d9', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
  a['/deals'].body.deals = [
    deal('d1', { title: 'Shown A' }),
    deal('d2', { status: 'draft', displayStatus: 'draft' }),
    deal('d3', { status: 'archived', displayStatus: 'archived' }),
    deal('d4', { displayStatus: 'expired', isExpired: true, endsAt: iso(-DAY) }),
    deal('d5', { displayStatus: 'scheduled', startsAt: iso(DAY) }),
    deal('d6', { hasUnpublishedChanges: true, title: 'UNPUBLISHED EDIT' }),
    deal('d7', { endsAt: iso(-1000) }),      // ended since the server's answer
    deal('d8', { title: 'Shown B' }),
    // d9: not in this account's deals (another owner's id): never shown
  ];
  const r = await make(recorder(a)).load('cafe');
  // the server lists at most 3 per page; anything beyond is ignored
  assert.deepEqual(r.items.map((x) => x.title), ['Shown A'], 'only the first three ids (d9, d1, d2) count; d9 unknown, d2 a draft');
  const b = ANSWERS();
  b['/deals/pages'].body.pages[0].shownDealIds = ['d6', 'd1', 'd8'];
  b['/deals'].body.deals = [deal('d1', { title: 'One' }), deal('d6', { hasUnpublishedChanges: true, title: 'UNPUBLISHED EDIT' }), deal('d8', { title: 'Two' })];
  const r2 = await make(recorder(b)).load('cafe');
  assert.equal(r2.state, 'live');
  assert.deepEqual(r2.items.map((x) => x.title), ['One', 'Two'], 'order of shownDealIds');
  assert.equal(r2.withheld, 1);
  assert.ok(!JSON.stringify(r2).includes('UNPUBLISHED'), 'unpublished edits never leave the file');
  for (const flag of [undefined, null, 'false', 1]) {
    const c = ANSWERS();
    c['/deals/pages'].body.pages[0].shownDealIds = ['d1'];
    c['/deals'].body.deals = [deal('d1', { hasUnpublishedChanges: flag })];
    const rc = await make(recorder(c)).load('cafe');
    assert.deepEqual([rc.state, rc.items.length, rc.withheld], ['live', 0, 1], 'unknown change flag: withheld (' + flag + ')');
  }
  const none = ANSWERS();
  none['/deals/pages'].body.pages[0].shownDealIds = [];
  assert.equal((await make(recorder(none)).load('cafe')).state, 'none');
  const noPages = ANSWERS();
  noPages['/deals/pages'].body.pages = [];
  assert.deepEqual(await make(recorder(noPages)).load(), { state: 'none', pages: [], page: '', items: [], withheld: 0 });
});

test('display fields only; images by the rules (Cloudinary uploads, catalog starters with the AI label, nothing else)', async () => {
  const a = ANSWERS();
  a['/deals/pages'].body.pages[0].shownDealIds = ['d1', 'd2', 'd3'];
  const r = await make(recorder(a)).load('cafe');
  assert.deepEqual(r.items.map((x) => Object.keys(x).sort()), [0, 1, 2].map(() => ['description', 'endsAt', 'image', 'offerText', 'title']));
  assert.ok(!/biz_secret|publicId|master|draftData|offerType|qraivy-deals\/d1"|dealId/.test(JSON.stringify(r.items)), 'no ids, storage ids, originals or drafts');
  assert.deepEqual(r.items[0].image, { src: CLD, ai: false });
  assert.deepEqual(r.items[1].image, { src: DD.STARTER_BASE + 'bakery-bread-01.jpg', ai: true });
  assert.equal(r.items[2].image, null, 'a background colour: no picture');
  const imgs = async (image) => { const b = ANSWERS(); b['/deals/pages'].body.pages[0].shownDealIds = ['d1']; b['/deals'].body.deals = [deal('d1', { image })]; return (await make(recorder(b)).load('cafe')).items[0].image; };
  for (const bad of [{ source: 'uploaded', url: 'https://evil.example/a.jpg' }, { source: 'uploaded', url: 'javascript:alert(1)' }, { source: 'uploaded', url: 'data:image/png;base64,AAA' },
    { source: 'uploaded', url: 'http://res.cloudinary.com/x/image/upload/a.jpg' }, { source: 'uploaded', url: 'https://res.cloudinary.com/x/image/upload/a.jpg"onerror="x' },
    { source: 'starter', starterId: 'unknown-01' }, { source: 'starter', starterId: '../../x' }, { source: 'uploaded' }, 'x', null]) {
    assert.equal(await imgs(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(await imgs({ source: 'starter', starterId: 'own-photo-01' }), { src: DD.STARTER_BASE + 'own-photo-01.jpg', ai: false }, 'the catalog decides the AI label');
  assert.deepEqual(await imgs({ source: 'starter', starterId: 'own-photo-01', aiGenerated: true }), { src: DD.STARTER_BASE + 'own-photo-01.jpg', ai: true }, 'or the server');
  // text limits as the server's; too long or missing: the deal is not shown
  const txt = async (extra) => { const b = ANSWERS(); b['/deals/pages'].body.pages[0].shownDealIds = ['d1']; b['/deals'].body.deals = [deal('d1', extra)]; return (await make(recorder(b)).load('cafe')).items; };
  assert.equal((await txt({ title: 'x'.repeat(81) })).length, 0);
  assert.equal((await txt({ offerText: '' })).length, 0);
  assert.equal((await txt({ title: 42 })).length, 0);
  assert.equal((await txt({ description: 'x'.repeat(401) }))[0].description, '');
  assert.equal((await txt({ endsAt: 'not a date' }))[0].endsAt, '');
});

test('pages: only well-formed ones, the owner\'s own list; the chosen page, else the first live one', async () => {
  const a = ANSWERS();
  a['/deals/pages'].body.pages.unshift({ slug: '../evil', name: 'x', live: true, shownDealIds: ['d1'] }, { slug: 'no-ids', live: true }, 'x', null);
  const d = make(recorder(a));
  const r = await d.load('nope');
  assert.deepEqual(r.pages, [{ slug: 'cafe', name: 'Café', live: true }, { slug: 'shop', name: 'Shop', live: true }, { slug: 'draft-page', name: 'Draft page', live: false }]);
  assert.equal(r.page, 'cafe');
  assert.deepEqual(d.select('shop').items.map((x) => x.title), ['Deal d4']);
  assert.equal(d.select('draft-page').state, 'none');
  assert.equal(d.select('unknown').page, 'cafe');
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('PASS  ' + t.name); }
    catch (e) { failed++; console.log('FAIL  ' + t.name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e)); }
  }
  console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exit(1);
})();
