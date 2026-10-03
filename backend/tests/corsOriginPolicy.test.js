// ============================================================
// corsOriginPolicy.test.js — CORS transport-origin allowlist
//
//  - https://plan-preview.qraivy.com (dedicated plan-consolidation
//    preview frontend) is allowed.
//  - Every pre-existing static origin and the QRAIVY Vercel preview
//    suffix rule are unchanged.
//  - Look-alike / downgraded / foreign origins are rejected.
//
// Pure unit test, same no-framework convention as the other tests.
//
// Run: node tests/corsOriginPolicy.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

delete process.env.VERCEL_PREVIEW_HOST_SUFFIX;
const { isAllowedOrigin, STATIC_ALLOWED_ORIGINS } = require(path.join(__dirname, '..', 'src', 'utils', 'corsOriginPolicy.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('plan-preview.qraivy.com is allowed', () => {
  assert.equal(isAllowedOrigin('https://plan-preview.qraivy.com'), true);
});

test('existing static origins are unchanged and still allowed', () => {
  assert.deepEqual(STATIC_ALLOWED_ORIGINS, [
    'https://www.qraivy.com',
    'https://qraivy.com',
    'https://api.qraivy.com',
    'https://preview.qraivy.com',
    'https://admin-preview.qraivy.com',
    'https://plan-preview.qraivy.com',
  ]);
  for (const o of STATIC_ALLOWED_ORIGINS) assert.equal(isAllowedOrigin(o), true, o);
});

test('QRAIVY Vercel preview suffix rule unchanged', () => {
  assert.equal(isAllowedOrigin('https://qraivy-ai-git-preview-x-adwinscottrussell-5957s-projects.vercel.app'), true);
  assert.equal(isAllowedOrigin('http://qraivy-ai-git-preview-x-adwinscottrussell-5957s-projects.vercel.app'), false);
  assert.equal(isAllowedOrigin('https://evil.vercel.app'), false);
  assert.equal(isAllowedOrigin('https://xadwinscottrussell-5957s-projects.vercel.app'), false);
});

test('look-alike and downgraded plan-preview origins are rejected', () => {
  for (const o of [
    'http://plan-preview.qraivy.com',
    'https://plan-preview.qraivy.com.evil.com',
    'https://evil-plan-preview.qraivy.com',
    'https://plan-preview.qraivy.co',
    'https://sub.plan-preview.qraivy.com',
    'https://plan-preview.qraivy.com:8443',
  ]) assert.equal(isAllowedOrigin(o), false, o);
});

test('no Origin header (server-to-server) still allowed; garbage rejected', () => {
  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin('not a url'), false);
  assert.equal(isAllowedOrigin('https://example.com'), false);
});

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
