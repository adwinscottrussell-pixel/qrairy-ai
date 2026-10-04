// ============================================================
// publicPlans.test.js — GET /public/plans (public homepage pricing).
//
//  - Public, read-only, unauthenticated; served over real HTTP below.
//  - Exactly the four public plans (free, starter, pro, business), in
//    canonical order; never trial or the internal enterprise alias.
//  - Every value comes from config/plans.js (getPublicPlanCatalogue).
//  - No account, Stripe, user or environment fields.
//
// No DB, Stripe or network beyond localhost.
//
// Run: node tests/publicPlans.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const http = require('http');
const fs = require('fs');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }


const express = require('express');
const plans = require('../src/config/plans');
const publicPlanRoutes = require('../src/routes/publicPlanRoutes');

const ENTRY_KEYS = ['id', 'name', 'currency', 'monthlyPrice', 'annualMonthlyPrice', 'smartPageLimit', 'basicQrLimit', 'dynamicQr', 'checkoutPlans'];
const FORBIDDEN = /stripe|customer|subscription|user|email|status|secret|trial|enterprise|internal|token|price_/i;

let server; let base;
function get(p, headers = {}) {
  return new Promise((ok, fail) => {
    http.get(base + p, { headers }, (res) => {
      let body = ''; res.on('data', (c) => { body += c; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body, json: (() => { try { return JSON.parse(body); } catch (e) { return null; } })() }));
    }).on('error', fail);
  });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('GET /public/plans over HTTP without any auth header → 200, JSON, public cache header', async () => {
  const res = await get('/public/plans');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.headers['cache-control'], 'public, max-age=300');
  assert.deepEqual(Object.keys(res.json), ['plans']);
});

test('exactly four public plans in canonical order; no trial, enterprise or annual entries', async () => {
  const { plans: list } = (await get('/public/plans')).json;
  assert.deepEqual(list.map((p) => p.id), ['free', 'starter', 'pro', 'business']);
  assert.deepEqual(list.map((p) => p.id), [...plans.PUBLIC_BASE_PLANS]);
  const ids = JSON.stringify(list);
  assert.ok(!/enterprise|"trial"|internal/i.test(ids));
});

test('only public catalogue fields; nothing private (account, Stripe, user, environment)', async () => {
  const res = await get('/public/plans');
  for (const p of res.json.plans) {
    assert.deepEqual(Object.keys(p), ENTRY_KEYS, p.id);
    assert.deepEqual(Object.keys(p.checkoutPlans), ['monthly', 'annual']);
  }
  const keys = [];
  (function walk(o) { for (const [k, v] of Object.entries(o)) { keys.push(k); if (v && typeof v === 'object') walk(v); } })(res.json);
  const leaked = keys.filter((k) => FORBIDDEN.test(k));
  assert.deepEqual(leaked, [], 'no private-looking keys');
  assert.ok(!/sk_|whsec_|cus_|sub_|price_|@/.test(res.body), 'no secrets, Stripe IDs or emails in the body');
});

test('canonical prices and limits match config/plans.js exactly', async () => {
  const { plans: list } = (await get('/public/plans')).json;
  for (const p of list) {
    const e = plans.getPlanEntitlements(p.id);
    assert.equal(p.name, plans.PLAN_NAMES[p.id]);
    assert.equal(p.currency, 'EUR');
    assert.equal(p.monthlyPrice, plans.DISPLAY_PRICES_EUR[p.id].monthly);
    assert.equal(p.annualMonthlyPrice, plans.DISPLAY_PRICES_EUR[p.id].annualMonthly);
    assert.equal(p.smartPageLimit, e.smartPageLimit);
    assert.equal(p.basicQrLimit, e.basicQrLimit);
    assert.equal(p.dynamicQr, e.dynamicQr);
    const offered = Object.values(p.checkoutPlans).filter(Boolean);
    assert.ok(offered.every((id) => plans.isPurchasable(id)), p.id);
  }
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  assert.deepEqual(byId.free.checkoutPlans, { monthly: null, annual: null });
  assert.deepEqual(byId.pro.checkoutPlans, { monthly: 'pro', annual: 'pro_annual' });
});

test('response is exactly the canonical getPublicPlanCatalogue()', async () => {
  const pub = (await get('/public/plans')).json.plans;
  assert.deepEqual(plans.getPublicPlanCatalogue(), pub);
});

test('route has no auth middleware and index.js mounts it at /public/plans', () => {
  const layers = publicPlanRoutes.stack.filter((l) => l.route);
  assert.equal(layers.length, 1);
  assert.equal(layers[0].route.path, '/');
  assert.deepEqual(Object.keys(layers[0].route.methods), ['get']);
  assert.equal(layers[0].route.stack.length, 1, 'single handler, no requireAuth');
  const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(index, /app\.use\('\/public\/plans',\s*publicPlanRoutes\)/);
});

test('read-only: non-GET methods are not handled', async () => {
  const status = await new Promise((ok) => {
    const req = http.request(base + '/public/plans', { method: 'POST' }, (r) => { r.resume(); ok(r.statusCode); });
    req.end();
  });
  assert.equal(status, 404);
});

(async () => {
  const app = express();
  app.use('/public/plans', publicPlanRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (err) { fail++; console.log(`FAIL  ${name}`); console.log(`      ${err.message}`); }
  }
  server.close();
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
