// ============================================================
// loginRedirect.test.js — after sign-in, the Deals staging site returns to
// itself, never to the production site.
//
// Before: login.html sent every host except plan-preview and the
// staging-config.js hosts to https://www.qraivy.com/ after sign-in. The
// scanner's "Owner? Sign in instead" link on deals-preview.qraivy.com
// therefore landed the owner on the production scanner, which talks to the
// production API.
// Now: deals-preview.qraivy.com returns to its own address. Production and
// every other host keep their previous return address, and deals-preview
// is NOT added to js/staging-config.js (its api is the Voice staging API).
// The page's real sign-in script runs in a sandbox with a stand-in Clerk.
// No test framework dependency. Run: node tests/loginRedirect.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const HTML = fs.readFileSync(path.join(PUB, 'login.html'), 'utf8').replace(/\r\n/g, '\n');
const START = HTML.indexOf('<script>\n    // Return target');
const SCRIPT = HTML.slice(START + '<script>'.length, HTML.indexOf('</script>', START));
const STAGING_CONFIG = fs.readFileSync(path.join(PUB, 'js', 'staging-config.js'), 'utf8');

const DEALS = 'deals-preview.qraivy.com';
const VOICE = 'voice-preview.qraivy.com';
const SCANNER_A = 'stamp-scanner.html?slug=push-test-a';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Runs initClerk() on `hostname` with ?redirect=<redirect>. Returns the
// options handed to Clerk.mountSignIn (signed out) or the address the page
// navigated to (already signed in).
async function signIn(hostname, redirect, { signedIn = false, config } = {}) {
  let mounted = null;
  const location = {
    hostname,
    origin: 'https://' + hostname,
    search: redirect === undefined ? '' : '?redirect=' + encodeURIComponent(redirect),
    href: 'https://' + hostname + '/login.html',
  };
  const window = {
    location,
    QRAIVY_STAGING_CONFIG: config,
    Clerk: { user: signedIn ? { id: 'user_owner' } : null, load: async () => {}, mountSignIn: (el, opts) => { mounted = opts; } },
  };
  const ctx = { window, document: { getElementById: (id) => ({ id }) }, URLSearchParams, Array };
  vm.runInNewContext(SCRIPT + '\n;globalThis.__run = initClerk;', ctx);
  await ctx.__run();
  return { mounted, href: location.href };
}

const targets = (m) => [m.afterSignInUrl, m.afterSignUpUrl, m.redirectUrl];

test('deals-preview: owner sign-in from the scanner returns to the staging scanner', async () => {
  const { mounted } = await signIn(DEALS, SCANNER_A);
  assert.deepEqual(targets(mounted), Array(3).fill('https://' + DEALS + '/' + SCANNER_A));
  for (const t of targets(mounted)) assert.ok(!t.startsWith('https://www.qraivy.com'), t);
});

test('deals-preview: no redirect, or an off-site redirect, stays on deals-preview (dashboard)', async () => {
  for (const r of [undefined, '', 'https://www.qraivy.com/stamp-scanner.html?slug=push-test-a', '//www.qraivy.com/x', 'javascript:alert(1)', '\\\\evil.example']) {
    const { mounted } = await signIn(DEALS, r);
    assert.equal(mounted.afterSignInUrl, 'https://' + DEALS + '/dashboard.html', String(r));
  }
});

test('deals-preview: an already signed-in owner is sent to the relative path on the same host', async () => {
  const { href, mounted } = await signIn(DEALS, SCANNER_A, { signedIn: true });
  assert.equal(href, SCANNER_A);
  assert.equal(mounted, null);
});

test('production hosts are unchanged: return to www.qraivy.com', async () => {
  for (const host of ['www.qraivy.com', 'qraivy.com']) {
    const { mounted } = await signIn(host, SCANNER_A);
    assert.deepEqual(targets(mounted), Array(3).fill('https://www.qraivy.com/' + SCANNER_A), host);
  }
});

test('other preview and look-alike hosts are unchanged: return to www.qraivy.com', async () => {
  for (const host of ['preview.qraivy.com', 'admin-preview.qraivy.com', 'qrairy-ai-9x8y7z-team.vercel.app', 'deals-preview.qraivy.com.evil.com', 'xdeals-preview.qraivy.com', 'sub.deals-preview.qraivy.com', 'deals-preview.qraivy.co']) {
    const { mounted } = await signIn(host, SCANNER_A);
    assert.equal(mounted.afterSignInUrl, 'https://www.qraivy.com/' + SCANNER_A, host);
  }
});

test('plan-preview and the Voice staging host keep returning to themselves', async () => {
  assert.equal((await signIn('plan-preview.qraivy.com', SCANNER_A)).mounted.afterSignInUrl, 'https://plan-preview.qraivy.com/' + SCANNER_A);
  const voice = await signIn(VOICE, 'smart-qr-detail.html', { config: { hosts: [VOICE], api: 'https://voice-api.example' } });
  assert.equal(voice.mounted.afterSignInUrl, 'https://' + VOICE + '/smart-qr-detail.html');
});

test('deals-preview is not in js/staging-config.js (its api is the Voice staging API)', () => {
  assert.ok(!STAGING_CONFIG.includes(DEALS));
});

// ── runner ──
(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`PASS  ${name}`); }
    catch (err) { failed++; console.log(`FAIL  ${name}`); console.log(`      ${String(err.stack || err.message).split('\n').slice(0, 8).join('\n      ')}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
  process.exit(failed ? 1 : 0);
})();
