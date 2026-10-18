// ============================================================
// staffPinAuth.test.js — Phase 0, S5: the staff PIN and owner checks.
//
// Before: the PIN was stored as an unsalted SHA-256 (a 4-digit PIN is found
// in milliseconds), /verify had only the global request limit, and setting a
// PIN or uploading a logo / Wallet banner skipped the owner check on a page
// without an owner. Now: salted scrypt (old hashes still verify), 10 wrong
// PINs per page per 15 minutes, and only the owner -- a platform admin for a
// page without an owner -- may set a PIN or upload images.
// ============================================================
const assert = require('assert/strict');
const crypto = require('crypto');
const h = require('./helpers/phase0Harness');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sec = (slug) => JSON.parse(h.T('landingPage').find((p) => p.slug === slug).sections);

async function setPin(slug, userId, pin) {
  const r = h.res();
  await h.quiet(() => h.lp.handleSetStaffPin(h.req({ method: 'POST', params: { slug }, body: { pin }, userId }), r));
  return r;
}
async function verify(slug, pin) {
  const r = h.res();
  await h.quiet(() => h.lp.handleVerifyStaffPin(h.req({ method: 'POST', params: { slug }, body: { pin } }), r));
  return r;
}

test('hash: salted scrypt, a different salt every time, never the PIN itself', () => {
  const a = h.staffPin.hashPin('4321'), b = h.staffPin.hashPin('4321');
  assert.match(a, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(a, b, 'same PIN, different hash');
  assert.ok(!a.includes('4321'));
  assert.equal(h.staffPin.pinMatches('4321', a), true);
  assert.equal(h.staffPin.pinMatches(' 4321 ', a), true, 'surrounding spaces ignored, as before');
  assert.equal(h.staffPin.pinMatches('4322', a), false);
  assert.equal(h.staffPin.pinMatches('', a), false);
  assert.equal(h.staffPin.pinMatches('4321', 'scrypt$zz'), false, 'malformed hash never matches');
});

test('a PIN set before Phase 0 (unsalted SHA-256) still verifies', async () => {
  const legacy = crypto.createHash('sha256').update('4321' + 'qraivy-pin-salt').digest('hex');
  assert.equal(h.staffPin.pinMatches('4321', legacy), true);
  assert.equal(h.staffPin.pinMatches('1234', legacy), false);
  h.reset(); h.page('shop', { sections: { staffPin: legacy } });
  assert.deepEqual((await verify('shop', '4321')).body, { ok: true, slug: 'shop' });
});

test('setting a PIN: the owner stores a scrypt hash; another account -> 403 and nothing changes', async () => {
  h.reset(); h.page('shop');
  assert.equal((await setPin('shop', 'user_other', '9999')).statusCode, 403);
  assert.equal(sec('shop').staffPin, undefined);
  assert.equal((await setPin('shop', 'user_owner', '4321')).statusCode, 200);
  assert.match(sec('shop').staffPin, /^scrypt\$/);
  assert.equal((await setPin('shop', 'user_owner', '12')).statusCode, 400, 'at least 4 digits, as before');
});

test('setting a PIN on a page without an owner: a platform admin only (any signed-in account before)', async () => {
  h.reset(); h.page('free', { userId: null });
  assert.equal((await setPin('free', 'user_other', '1111')).statusCode, 403);
  assert.equal(sec('free').staffPin, undefined);
  assert.equal((await setPin('free', 'user_admin', '1111')).statusCode, 200);
});

test('verify: right PIN ok, wrong 401, no PIN 404; after 10 wrong PINs: 429, even for the right one', async () => {
  h.reset(); h.page('shop', { sections: { staffPin: h.staffPin.hashPin('4321') } }); h.page('nopin');
  assert.equal((await verify('shop', '4321')).statusCode, 200);
  assert.equal((await verify('nopin', '4321')).statusCode, 404);
  for (let i = 0; i < 10; i++) assert.equal((await verify('shop', String(2000 + i))).statusCode, 401);
  const locked = await verify('shop', '4321');
  assert.equal(locked.statusCode, 429);
  assert.match(locked.body.error, /15 minutes/);
});

test('the limit is per page and ends after 15 minutes; correct PINs are not counted', () => {
  h.reset();
  const stored = h.staffPin.hashPin('4321'), t0 = Date.now();
  for (let i = 0; i < 50; i++) assert.equal(h.staffPin.checkPin('a', '4321', stored, t0).ok, true);
  for (let i = 0; i < 10; i++) h.staffPin.checkPin('a', '0000', stored, t0);
  assert.equal(h.staffPin.checkPin('a', '4321', stored, t0 + 1000).status, 429);
  assert.equal(h.staffPin.checkPin('b', '4321', stored, t0 + 1000).ok, true, 'another page is not affected');
  assert.equal(h.staffPin.checkPin('a', '4321', stored, t0 + h.staffPin.WINDOW_MS + 1).ok, true, 'the window passes');
});

test('logo and Wallet banner upload on a page without an owner: a platform admin only', async () => {
  for (const [handler, field] of [['handleUploadLogo', 'logo'], ['handleUploadStrip', 'strip']]) {
    h.reset(); h.page('free', { userId: null }); h.page('shop');
    const call = async (slug, userId) => { const r = h.res(); await h.quiet(() => h.lp[handler](h.req({ method: 'POST', params: { slug }, file: { buffer: Buffer.from('x') }, userId }), r)); return r; };
    assert.equal((await call('free', 'user_other')).statusCode, 403, handler);
    assert.equal((await call('shop', 'user_other')).statusCode, 403, handler + ': another owner\'s page (unchanged)');
    assert.ok(!h.db.writes.includes('cloudinary.' + field), 'nothing uploaded');
    assert.equal((await call('free', 'user_admin')).statusCode, 200);
    assert.equal((await call('shop', 'user_owner')).statusCode, 200);
  }
});

h.run('staffPinAuth', tests);
