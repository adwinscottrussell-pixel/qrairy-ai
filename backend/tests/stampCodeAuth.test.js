// ============================================================
// stampCodeAuth.test.js — Phase 0, S2 + S3: loyalty stamp codes and stamps.
//
// S2 before: GET /lp/stamp/token/:slug and GET /lp/nfc-token/:slug handed the
// current stamp code (which also redeems rewards) to anyone, and created
// codes for any slug. The stamp scanner checked the staff PIN only in the
// browser. Now: the daily code needs the page owner's sign-in (a platform
// admin for a page without an owner) or the staff PIN, checked on the
// server; the NFC code needs the owner. A page without a PIN cannot be used
// anonymously. Wrong PINs are limited per page.
// S3 before: POST /stamp/:slug/customer added a stamp to any customer id
// without a code. Now it only reads; the confirm step (valid code, one stamp
// per hour) counts the customer's loyalty record.
// Printed QR codes, NFC tags and Wallet passes keep working: the codes
// themselves do not change.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const h = require('./helpers/phase0Harness');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const OWNER = 'Bearer user_owner', OTHER = 'Bearer user_other', ADMIN = 'Bearer user_admin';

async function code(handler, slug, headers = {}) {
  const r = h.res();
  await h.quiet(() => h.lp[handler](h.req({ params: { slug }, headers }), r));
  return r;
}
const tokenRows = () => h.T('stampToken').length;
function setup({ pin, userId = 'user_owner' } = {}) {
  h.reset();
  const sections = { language: 'en' };
  if (pin) sections.staffPin = h.staffPin.hashPin(pin);
  h.page('shop', { userId, sections });
  h.T('stampSettings').push({ slug: 'shop', goal: 3, rewardName: 'Free Coffee', enabled: true });
}

test('daily code: no sign-in and no PIN -> 401, and no code is created', async () => {
  setup({ pin: '4321' });
  const r = await code('handleGetStampToken', 'shop');
  assert.equal(r.statusCode, 401);
  assert.equal(r.body.token, undefined);
  assert.equal(tokenRows(), 0, 'nothing written');
});

test('daily code: another account -> 403; the owner -> the code', async () => {
  setup();
  assert.equal((await code('handleGetStampToken', 'shop', { authorization: OTHER })).statusCode, 403);
  const r = await code('handleGetStampToken', 'shop', { authorization: OWNER });
  assert.equal(r.statusCode, 200);
  assert.match(r.body.token, /^[a-z0-9]{8}$/);
  assert.equal(r.body.stampUrl, 'https://www.qraivy.com/stamp/shop/' + r.body.token);
});

test('daily code: an existing code is returned unchanged (printed QR codes keep working)', async () => {
  setup();
  h.T('stampToken').push({ slug: 'shop', token: 'keepme12', expiresAt: new Date(Date.now() + 3600e3), createdAt: new Date() });
  const r = await code('handleGetStampToken', 'shop', { authorization: OWNER });
  assert.equal(r.body.token, 'keepme12');
  assert.equal(tokenRows(), 1);
});

test('daily code: the correct staff PIN (checked on the server) -> the code; a wrong one -> 401', async () => {
  setup({ pin: '4321' });
  assert.equal((await code('handleGetStampToken', 'shop', { 'x-staff-pin': '0000' })).statusCode, 401);
  assert.equal(tokenRows(), 0);
  const r = await code('handleGetStampToken', 'shop', { 'x-staff-pin': '4321' });
  assert.equal(r.statusCode, 200);
  assert.ok(r.body.token);
});

test('daily code: a page without a PIN cannot be used anonymously, whatever PIN is sent', async () => {
  setup();
  for (const pin of ['0000', '1234', '']) {
    const r = await code('handleGetStampToken', 'shop', pin ? { 'x-staff-pin': pin } : {});
    assert.equal(r.statusCode, 401, 'PIN ' + JSON.stringify(pin));
  }
  assert.equal(tokenRows(), 0);
});

test('daily code: after 10 wrong PINs even the right PIN waits 15 minutes; the owner is not limited', async () => {
  setup({ pin: '4321' });
  for (let i = 0; i < 10; i++) assert.equal((await code('handleGetStampToken', 'shop', { 'x-staff-pin': String(1000 + i) })).statusCode, 401);
  assert.equal((await code('handleGetStampToken', 'shop', { 'x-staff-pin': '4321' })).statusCode, 429);
  assert.equal((await code('handleGetStampToken', 'shop', { authorization: OWNER })).statusCode, 200);
});

test('daily code: page without an owner -> a platform admin only; unknown page -> 404, nothing created', async () => {
  setup({ userId: null });
  assert.equal((await code('handleGetStampToken', 'shop', { authorization: OTHER })).statusCode, 403);
  assert.equal((await code('handleGetStampToken', 'shop', { authorization: ADMIN })).statusCode, 200);
  h.reset();
  assert.equal((await code('handleGetStampToken', 'nope', { authorization: ADMIN })).statusCode, 404);
  assert.equal(tokenRows(), 0);
});

test('NFC code: the owner only (staff PIN is not enough); the long-lived code is kept', async () => {
  setup({ pin: '4321' });
  assert.equal((await code('handleGetNFCToken', 'shop')).statusCode, 401);
  assert.equal((await code('handleGetNFCToken', 'shop', { 'x-staff-pin': '4321' })).statusCode, 401);
  assert.equal((await code('handleGetNFCToken', 'shop', { authorization: OTHER })).statusCode, 403);
  assert.equal(tokenRows(), 0);
  h.T('stampToken').push({ slug: 'shop', token: 'nfctag01', expiresAt: new Date(Date.now() + 300 * 864e5), createdAt: new Date() });
  const r = await code('handleGetNFCToken', 'shop', { authorization: OWNER });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.token, 'nfctag01', 'the tag already programmed keeps working');
});

// ── S3 ──
async function confirm(token, cid) {
  const r = h.res();
  await h.quiet(() => h.lp.handleStampConfirm(h.req({ method: 'POST', params: { slug: 'shop', token }, body: { cid } }), r));
  return r.body;
}
async function customerCall(cid) {
  const r = h.res();
  await h.quiet(() => h.lp.handleCustomerStamp(h.req({ method: 'POST', params: { slug: 'shop' }, body: { cid } }), r));
  return r.body;
}
const lc = (cid) => h.T('loyaltyCustomer').find((r) => r.customerId === cid);

test('S3: POST /stamp/:slug/customer no longer writes anything (the audit reproduction)', async () => {
  setup();
  for (let i = 0; i < 5; i++) assert.deepEqual(await customerCall('cust-attacker-1'), { ok: true, stampCount: 0, goal: 3, rewardReady: false, hasWallet: false });
  assert.equal(h.T('loyaltyCustomer').length, 0);
  assert.deepEqual(h.db.writes, []);
});

test('S3: a valid stamp counts the loyalty record once; a repeat within the hour and a wrong code count nothing', async () => {
  setup();
  h.T('stampToken').push({ slug: 'shop', token: 'daycode1', expiresAt: new Date(Date.now() + 3600e3), createdAt: new Date() });
  const ok = await confirm('daycode1', 'cust-anna-0001');
  assert.equal(ok.status, 'ok');
  assert.equal(ok.newCount, 1);
  assert.equal(lc('cust-anna-0001').stampCount, 1);
  assert.equal(h.T('pass').find((p) => p.serialNumber === 'sqr-shop-cust-anna-0001').stampCount, 1, 'Wallet pass count as before');
  // the stamp page still asks for the count afterwards: it reads, it does not add
  assert.equal((await customerCall('cust-anna-0001')).stampCount, 1);
  assert.equal(lc('cust-anna-0001').stampCount, 1);
  assert.equal((await confirm('daycode1', 'cust-anna-0001')).status, 'already');
  assert.equal(lc('cust-anna-0001').stampCount, 1);
  assert.equal((await confirm('wrongcod', 'cust-bob-00001')).status, 'invalid');
  assert.equal(lc('cust-bob-00001'), undefined);
});

test('S3: program switched off -> the stamp works as before, the loyalty record is not counted (as before)', async () => {
  setup();
  h.T('stampSettings')[0].enabled = false;
  h.T('stampToken').push({ slug: 'shop', token: 'daycode1', expiresAt: new Date(Date.now() + 3600e3), createdAt: new Date() });
  assert.equal((await confirm('daycode1', 'cust-anna-0001')).status, 'ok');
  assert.equal(h.T('loyaltyCustomer').length, 0);
});

test('S3: reward counting on the loyalty record is unchanged', async () => {
  setup();
  h.T('loyaltyCustomer').push({ slug: 'shop', customerId: 'cust-anna-0001', stampCount: 2, totalStamps: 2, rewardsEarned: 0, rewardReady: false, hasWallet: true });
  h.T('stampToken').push({ slug: 'shop', token: 'daycode1', expiresAt: new Date(Date.now() + 3600e3), createdAt: new Date() });
  await confirm('daycode1', 'cust-anna-0001');
  assert.deepEqual([lc('cust-anna-0001').stampCount, lc('cust-anna-0001').rewardReady, lc('cust-anna-0001').rewardsEarned, lc('cust-anna-0001').totalStamps], [3, true, 1, 3]);
});

// ── the scanner page ──
const scanner = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'stamp-scanner.html'), 'utf8').replace(/\r\n/g, '\n');
function scannerFetchToken({ clerkToken, storedPin, status = 200, body = { token: 'daycode1' } }) {
  const src = scanner.slice(scanner.indexOf('  async function requestCode(slug){'), scanner.indexOf('  // ── Access check ──'));
  const store = {}; if (storedPin) store['staff_pin_shop'] = storedPin;
  const sent = [];
  const ctx = {
    API: 'https://api.qraivy.com', pinSlug: 'shop', relocked: [],
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), removeItem: (k) => { delete store[k]; } },
    getToken: async () => clerkToken || null,
    fetch: async (u, o) => { sent.push({ u, o }); return { ok: status === 200, status, json: async () => body }; },
    Promise, Error,
  };
  vm.runInNewContext(src + ';function authorize(slug, why, r){ relocked.push([slug, why, r.sentPin]); } this.f = fetchToken;', ctx);
  return { ctx, sent, store };
}

test('scanner: sends the owner sign-in and/or the session PIN with the code request; nothing else decides', async () => {
  let s = scannerFetchToken({ clerkToken: 'jwt-owner' });
  assert.equal(await s.ctx.f('shop'), 'daycode1');
  assert.deepEqual(JSON.parse(JSON.stringify(s.sent[0].o.headers)), { Authorization: 'Bearer jwt-owner' });
  s = scannerFetchToken({ storedPin: '4321' });
  await s.ctx.f('shop');
  assert.deepEqual(JSON.parse(JSON.stringify(s.sent[0].o.headers)), { 'X-Staff-Pin': '4321' });
  s = scannerFetchToken({ storedPin: '0000', status: 401, body: { error: 'Incorrect PIN.' } });
  await assert.rejects(() => s.ctx.f('shop'), /Incorrect PIN/);
  assert.deepEqual(JSON.parse(JSON.stringify(s.ctx.relocked)), [['shop', 'expired', true]], 'the scanner locks again (the access check forgets the PIN: scannerAccess.test.js)');
});

test('scanner: the PIN is kept only for the session and only after the server accepted it', () => {
  assert.ok(scanner.includes("sessionStorage.setItem('staff_pin_'+slug, pinBuffer);"));
  assert.ok(!scanner.includes('showScanner'), 'a stored PIN alone no longer opens the scanner: only the code from the server does');
  assert.ok(scanner.includes('    if(r.token){\n      authorizedSlug = slug;'), 'the scanner opens only on a code from the server');
  assert.ok(!scanner.includes("fetch(API+'/lp/stamp/token/'+encodeURIComponent(slug));"), 'no code request without credentials');
  assert.ok(!/localStorage\.setItem\([^)]*pin/i.test(scanner), 'never stored beyond the session');
});

h.run('stampCodeAuth', tests);
