// ============================================================
// dealUploadLimiter.test.js — QRAIVY Deals image upload limit
// (services/dealUploadLimiter.js, Phase 3B.4): 20 per rolling hour,
// 60 per rolling 24 hours, per signed-in account, in memory.
//
//   C. constants      H. hourly limit      D. daily limit
//   I. account isolation and identity      S. slots (pending, commit, release)
//   M. the route middleware (401 / 429 / release on finish or close)
//
// Run: node tests/dealUploadLimiter.test.js
// ============================================================
const assert = require('assert/strict');
const L = require('../src/services/dealUploadLimiter');

const HOUR = 3600 * 1000, DAY = 24 * HOUR, MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 15, 8, 0, 0);
const A = 'user_alpha', B = 'user_bravo';
const take = (id, at) => { const r = L.reserveUploadSlot(id, at); if (r.ok) r.slot.commit(); return r; };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('C. approved limits: 20 per hour, 60 per 24 hours (frozen)', () => {
  assert.deepEqual({ ...L.DEAL_UPLOAD_LIMITS }, { perHour: 20, perDay: 60 });
  assert.ok(Object.isFrozen(L.DEAL_UPLOAD_LIMITS));
});

test('H. 20 uploads in an hour are fine; the 21st is refused with window "hour" and when to retry', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 20; i++) assert.equal(take(A, T0 + i * MIN).ok, true, 'upload ' + (i + 1));
  const r = L.reserveUploadSlot(A, T0 + 30 * MIN);
  assert.equal(r.ok, false); assert.equal(r.window, 'hour'); assert.equal(r.limit, 20);
  assert.equal(r.retryAfterSeconds, 30 * 60, 'the oldest of the 20 (T0) leaves the hour at T0+60min');
});

test('H. rolling, not a fixed clock hour: slots come back one by one as uploads age out', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 20; i++) take(A, T0 + i * MIN);
  assert.equal(L.reserveUploadSlot(A, T0 + HOUR - 1).ok, false, 'one ms before the first ages out');
  assert.equal(take(A, T0 + HOUR).ok, true, 'the first upload aged out');
  assert.equal(L.reserveUploadSlot(A, T0 + HOUR + 1).ok, false, 'full again');
  assert.equal(take(A, T0 + HOUR + MIN).ok, true, 'the second aged out');
});

test('D. 60 uploads in 24 hours (spread, never 20 in one hour); the 61st is refused with window "day"', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 60; i++) assert.equal(take(A, T0 + i * 6 * MIN).ok, true, 'upload ' + (i + 1));   // 10 per hour
  const at = T0 + 7 * HOUR;
  assert.equal(L.usage(A, at).lastHour < 20, true);
  const r = L.reserveUploadSlot(A, at);
  assert.equal(r.ok, false); assert.equal(r.window, 'day'); assert.equal(r.limit, 60);
  assert.equal(r.retryAfterSeconds, (DAY - 7 * HOUR) / 1000, 'until the oldest leaves the 24 hours');
  assert.equal(take(A, T0 + DAY).ok, true, 'the first upload aged out of the day');
});

test('D. the hourly limit is checked first and reported when both apply', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 40; i++) take(A, T0 + i * 6 * MIN);           // 40 over 4 hours
  for (let i = 0; i < 20; i++) take(A, T0 + 5 * HOUR + i * MIN);     // + 20 in hour 5 = 60
  const r = L.reserveUploadSlot(A, T0 + 5 * HOUR + 30 * MIN);
  assert.equal(r.window, 'hour');
});

test('I. accounts are counted separately', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 20; i++) take(A, T0);
  assert.equal(L.reserveUploadSlot(A, T0).ok, false);
  assert.equal(take(B, T0).ok, true);
  assert.deepEqual(L.usage(B, T0), { lastHour: 1, lastDay: 1 });
});

test('I. no account, no slot: an empty or non-string id is a programming error, never a shared bucket', () => {
  for (const id of [undefined, null, '', 42, {}]) assert.throws(() => L.reserveUploadSlot(id, T0), /signed-in user id/);
});

test('S. a refused request takes nothing', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 20; i++) take(A, T0);
  for (let i = 0; i < 5; i++) L.reserveUploadSlot(A, T0);
  assert.deepEqual(L.usage(A, T0), { lastHour: 20, lastDay: 20 });
});

test('S. pending reservations count: 25 simultaneous requests -> exactly 20 slots', () => {
  L._resetDealUploadLimiter();
  const rs = Array.from({ length: 25 }, () => L.reserveUploadSlot(A, T0));
  assert.equal(rs.filter((r) => r.ok).length, 20);
  rs.filter((r) => r.ok)[0].slot.release();
  assert.equal(L.reserveUploadSlot(A, T0).ok, true, 'a released slot is free again');
});

test('S. release gives the slot back; commit keeps it; both are idempotent and final', () => {
  L._resetDealUploadLimiter();
  const a = L.reserveUploadSlot(A, T0).slot;
  a.release(); a.release(); a.commit();
  assert.deepEqual(L.usage(A, T0), { lastHour: 0, lastDay: 0 }, 'commit after release does nothing');
  const b = L.reserveUploadSlot(A, T0).slot;
  b.commit(); b.release(); b.commit();
  assert.deepEqual(L.usage(A, T0), { lastHour: 1, lastDay: 1 }, 'release after commit does nothing');
  assert.equal(b.settled, true);
});

test('S. memory stays bounded: expired accounts are dropped', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 100; i++) take('user_old' + i, T0);
  for (let i = 0; i < 500; i++) { const r = L.reserveUploadSlot(B, T0 + 2 * DAY); if (r.ok) r.slot.release(); }   // triggers the sweep
  for (let i = 0; i < 100; i++) assert.deepEqual(L.usage('user_old' + i, T0 + 2 * DAY), { lastHour: 0, lastDay: 0 });
});

// ── M. Middleware ───────────────────────────────────────────────
function fakeRes() {
  const listeners = {};
  return {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; },
    set(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return this; },
    emit(ev) { for (const fn of listeners[ev] || []) fn(); },
  };
}
function run(req) {
  const res = fakeRes();
  let nextCalled = false;
  L.throttleDealUploads()(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('M. no signed-in account: 401, nothing reserved, next() not called', () => {
  L._resetDealUploadLimiter();
  const r = run({});
  assert.equal(r.res.statusCode, 401); assert.equal(r.nextCalled, false);
});

test('M. allowed: next(), a slot on req; a response that ends before the controller committed gives it back', () => {
  L._resetDealUploadLimiter();
  const req = { userId: A };
  const r = run(req);
  assert.equal(r.nextCalled, true); assert.ok(req.dealUploadSlot);
  assert.equal(L.usage(A).lastHour, 1, 'pending while the request runs');
  r.res.status(400); r.res.emit('finish');
  assert.equal(L.usage(A).lastHour, 0, 'refused before reaching Cloudinary: slot returned');
});

test('M. committed by the controller: kept after the response, also if it ends with an error afterwards', () => {
  L._resetDealUploadLimiter();
  const req = { userId: A };
  const r = run(req);
  req.dealUploadSlot.commit();
  r.res.status(400); r.res.emit('finish'); r.res.emit('close');
  assert.equal(L.usage(A).lastHour, 1);
});

test('M. client went away (close without finish): slot returned once', () => {
  L._resetDealUploadLimiter();
  const r = run({ userId: A });
  r.res.emit('close'); r.res.emit('close'); r.res.emit('finish');
  assert.equal(L.usage(A).lastHour, 0);
});

test('M. limit reached: 429 upload_limit with window, limit, retryAfter and a Retry-After header; nothing reserved', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 20; i++) take(A, Date.now());
  const r = run({ userId: A });
  assert.equal(r.nextCalled, false); assert.equal(r.res.statusCode, 429);
  assert.deepEqual(Object.keys(r.res.body).sort(), ['error', 'limit', 'message', 'retryAfter', 'window']);
  assert.equal(r.res.body.error, 'upload_limit'); assert.equal(r.res.body.window, 'hour'); assert.equal(r.res.body.limit, 20);
  assert.ok(r.res.body.retryAfter > 0 && r.res.body.retryAfter <= 3600);
  assert.equal(r.res.headers['retry-after'], String(r.res.body.retryAfter));
  assert.equal(L.usage(A).lastHour, 20);
});

test('M. identity is req.userId only: ids in body, query or headers are ignored', () => {
  L._resetDealUploadLimiter();
  for (let i = 0; i < 20; i++) take(B, Date.now());
  const req = { userId: A, body: { userId: B }, query: { userId: B }, headers: { 'x-user-id': B } };
  assert.equal(run(req).nextCalled, true, 'counted for A, not B');
  assert.equal(L.usage(A).lastHour, 1); assert.equal(L.usage(B).lastHour, 20);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
