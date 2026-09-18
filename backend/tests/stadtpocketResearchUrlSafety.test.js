// ============================================================
// stadtpocketResearchUrlSafety.test.js — Phase 1B (AI Business
// Onboarding). Unit tests for validateResearchUrl()/
// isPrivateOrReservedAddress(). No mocking needed for the literal-IP/
// hostname checks; the DNS-rebinding layer uses the injectable
// dnsLookup parameter, matching this repo's established
// injectable-dependency test convention -- no real network/DNS call.
//
// Run: node tests/stadtpocketResearchUrlSafety.test.js
// ============================================================
const assert = require('assert/strict');
const {
  validateResearchUrl,
  isPrivateOrReservedAddress,
  REASONS,
} = require('../src/services/stadtpocketResearchUrlSafety');

function fakeDnsLookup(addresses) {
  return async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
}

function fakeDnsFailure() {
  return async () => { throw new Error('simulated DNS failure'); };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── isPrivateOrReservedAddress ──────────────────────────────────
test('1. private/reserved IPv4 addresses are flagged', () => {
  for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1']) {
    assert.equal(isPrivateOrReservedAddress(ip), true, `expected ${ip} to be flagged`);
  }
});

test('2. public IPv4 addresses are NOT flagged', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) {
    assert.equal(isPrivateOrReservedAddress(ip), false, `expected ${ip} to be allowed`);
  }
});

test('3. IPv6 loopback/unique-local/link-local/IPv4-mapped-private are flagged', () => {
  for (const ip of ['::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateOrReservedAddress(ip), true, `expected ${ip} to be flagged`);
  }
});

test('4. a non-IP string is never flagged (not this function\'s job)', () => {
  assert.equal(isPrivateOrReservedAddress('example.com'), false);
});

// ── validateResearchUrl ──────────────────────────────────────────
test('5. a normal public https URL is accepted', async () => {
  const result = await validateResearchUrl('https://www.brettle-ulm.de/', { dnsLookup: fakeDnsLookup(['93.184.216.34']) });
  assert.equal(result.ok, true);
  assert.equal(result.url.hostname, 'www.brettle-ulm.de');
});

test('6. malformed URL -> invalid-url', async () => {
  const result = await validateResearchUrl('not a url at all');
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.INVALID_URL);
});

test('7. empty/missing URL -> invalid-url, never throws', async () => {
  assert.equal((await validateResearchUrl(undefined)).ok, false);
  assert.equal((await validateResearchUrl('')).ok, false);
});

test('8. unsupported protocol (ftp/file/javascript) -> unsupported-protocol', async () => {
  for (const url of ['ftp://example.com/x', 'file:///etc/passwd', 'javascript:alert(1)']) {
    const result = await validateResearchUrl(url);
    assert.equal(result.ok, false, `expected ${url} to be rejected`);
    assert.equal(result.reason, REASONS.UNSUPPORTED_PROTOCOL);
  }
});

test('9. credentials embedded in the URL are rejected', async () => {
  const result = await validateResearchUrl('https://user:pass@example.com/');
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.CREDENTIALS_IN_URL);
});

test('10. localhost and internal-looking hostnames are rejected without a DNS call', async () => {
  let dnsCalled = false;
  const dnsLookup = async () => { dnsCalled = true; return [{ address: '8.8.8.8' }]; };
  for (const url of ['http://localhost/', 'http://localhost:8080/x', 'http://internal.local/', 'http://metadata.google.internal/']) {
    const result = await validateResearchUrl(url, { dnsLookup });
    assert.equal(result.ok, false, `expected ${url} to be rejected`);
    assert.equal(result.reason, REASONS.PRIVATE_TARGET);
  }
  assert.equal(dnsCalled, false, 'a hostname already known to be internal must never trigger a DNS lookup');
});

test('11. a literal private IP as the hostname is rejected without a DNS call', async () => {
  let dnsCalled = false;
  const dnsLookup = async () => { dnsCalled = true; return [{ address: '8.8.8.8' }]; };
  const result = await validateResearchUrl('http://169.254.169.254/latest/meta-data/', { dnsLookup });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.PRIVATE_TARGET);
  assert.equal(dnsCalled, false);
});

test('12. a public-looking hostname that resolves to a private IP is rejected (DNS-rebinding defense)', async () => {
  const result = await validateResearchUrl('https://looks-public.example.com/', { dnsLookup: fakeDnsLookup(['127.0.0.1']) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.PRIVATE_TARGET);
});

test('13. a hostname resolving to ANY private address among several is rejected, not just an all-private list', () => {
  return validateResearchUrl('https://mixed.example.com/', { dnsLookup: fakeDnsLookup(['8.8.8.8', '10.0.0.5']) }).then((result) => {
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASONS.PRIVATE_TARGET);
  });
});

test('14. a DNS failure fails closed (rejected), never treated as safe', async () => {
  const result = await validateResearchUrl('https://does-not-resolve.example.com/', { dnsLookup: fakeDnsFailure() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.DNS_FAILURE);
});

test('15. a genuinely empty DNS result (zero records) fails closed', async () => {
  const result = await validateResearchUrl('https://no-records.example.com/', { dnsLookup: fakeDnsLookup([]) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.DNS_FAILURE);
});

// ── runner ──────────────────────────────────────────────────────
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
