/**
 * stadtpocketResearchUrlSafety.js — Phase 1B (AI Business Onboarding).
 * ─────────────────────────────────────────────────────────────
 * URL-safety gate for any website URL a manager submits for AI research
 * (stadtpocketWebResearchService.js). This repo already has
 * stadtpocketManagerService.js's checkWebsite() -- that only confirms
 * "is this a well-formed http(s) URL", which is correct for a manager
 * typing their own business's website into a draft field. It says
 * nothing about whether the URL points at an internal/private network
 * target, which matters here specifically because this URL is about to
 * be handed to a third-party scraping provider (Firecrawl) at request
 * time -- this module is the additional gate that decision needs.
 *
 * Two layers, both fail-closed (any doubt -> rejected, never "proceed
 * anyway"):
 *   1. Reject a literal IP/hostname that is already obviously private/
 *      reserved/loopback/link-local (no network call needed).
 *   2. Resolve the hostname via DNS and reject if ANY resolved address
 *      is private/reserved/loopback/link-local -- defense-in-depth
 *      against a public-looking hostname that actually resolves inside
 *      (DNS rebinding), which layer 1 alone cannot catch.
 *
 * Explicit scope limit, not silently glossed over: the actual page
 * fetch happens on Firecrawl's own infrastructure, not this server --
 * this module cannot inspect or block redirects Firecrawl's fetch
 * follows after this check passes. That is a real, acknowledged gap of
 * delegating the fetch to a third-party provider, not something this
 * module claims to solve. See stadtpocketWebResearchService.js's own
 * header comment for how this is called.
 * ─────────────────────────────────────────────────────────────
 */

const net = require('net');
const dns = require('dns').promises;

// dns.promises.lookup() has no built-in cap and no AbortSignal support in
// Node's dns API -- an unresponsive/misbehaving resolver could otherwise
// hold this request open indefinitely, well past both provider timeouts
// downstream (see stadtpocketResearchService.js's own overall deadline,
// which exists as a second, independent backstop). DNS normally resolves
// in well under a second; this bound is generous while still guaranteeing
// forward progress. A timeout fails exactly like any other DNS error
// (REASONS.DNS_FAILURE) -- fail-closed, never treated as "safe, proceed."
const DNS_LOOKUP_TIMEOUT_MS = 3000;

// Bounds any promise to `ms` -- rejects with a distinguishable timeout
// error if it hasn't settled in time. Does not (cannot) cancel the
// underlying work; it only guarantees THIS await doesn't wait forever.
// A `dnsLookup` call that eventually settles after we've moved on
// resolves/rejects harmlessly into a promise nothing is listening to
// anymore (dns.promises.lookup never throws in a way that would
// otherwise produce an unhandled rejection here).
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Timed out after ${ms}ms`);
      err.code = 'ETIMEDOUT_INTERNAL';
      reject(err);
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

const REASONS = {
  INVALID_URL: 'invalid-url',
  UNSUPPORTED_PROTOCOL: 'unsupported-protocol',
  CREDENTIALS_IN_URL: 'credentials-in-url',
  PRIVATE_TARGET: 'private-target',
  DNS_FAILURE: 'dns-failure',
};

// Hostnames that are obviously internal regardless of how they resolve
// (or fail to resolve) -- checked before any DNS lookup.
const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost'];
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function buildPrivateBlockList() {
  const bl = new net.BlockList();
  // IPv4 -- RFC 1918 private ranges, loopback, link-local (includes the
  // 169.254.169.254 cloud-metadata address every major provider uses),
  // CGNAT, the RFC 5737/6598 documentation/testing ranges, multicast,
  // and the rest of the reserved space.
  bl.addSubnet('0.0.0.0', 8, 'ipv4');
  bl.addSubnet('10.0.0.0', 8, 'ipv4');
  bl.addSubnet('100.64.0.0', 10, 'ipv4');
  bl.addSubnet('127.0.0.0', 8, 'ipv4');
  bl.addSubnet('169.254.0.0', 16, 'ipv4');
  bl.addSubnet('172.16.0.0', 12, 'ipv4');
  bl.addSubnet('192.0.0.0', 24, 'ipv4');
  bl.addSubnet('192.0.2.0', 24, 'ipv4');
  bl.addSubnet('192.168.0.0', 16, 'ipv4');
  bl.addSubnet('198.18.0.0', 15, 'ipv4');
  bl.addSubnet('198.51.100.0', 24, 'ipv4');
  bl.addSubnet('203.0.113.0', 24, 'ipv4');
  bl.addSubnet('224.0.0.0', 4, 'ipv4');
  bl.addSubnet('240.0.0.0', 4, 'ipv4');
  // IPv6 -- loopback, unique-local, link-local. IPv4-mapped addresses
  // (::ffff:a.b.c.d) are deliberately NOT added as an IPv6 subnet here --
  // a /96 on ::ffff:0:0 zeroes out the entire 32-bit IPv4 portion, which
  // would match every IPv4-mapped address there is (public ones
  // included), not just the private ones. Those are instead unwrapped to
  // their plain IPv4 form and checked against the IPv4 subnets above --
  // see isPrivateOrReservedAddress below.
  bl.addSubnet('::1', 128, 'ipv6');
  bl.addSubnet('fc00::', 7, 'ipv6');
  bl.addSubnet('fe80::', 10, 'ipv6');
  return bl;
}

const PRIVATE_BLOCK_LIST = buildPrivateBlockList();
const IPV4_MAPPED_RE = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

function isPrivateOrReservedAddress(address) {
  const mapped = IPV4_MAPPED_RE.exec(String(address || ''));
  if (mapped) return PRIVATE_BLOCK_LIST.check(mapped[1], 'ipv4');

  const family = net.isIP(address);
  if (family === 4) return PRIVATE_BLOCK_LIST.check(address, 'ipv4');
  if (family === 6) return PRIVATE_BLOCK_LIST.check(address, 'ipv6');
  return false; // not a literal IP at all
}

/**
 * Validates a manager-submitted website URL before it is ever handed to
 * the research provider. Returns { ok: true, url } (a real, parsed URL
 * object) or { ok: false, reason } -- one of REASONS above. Never
 * throws.
 *
 * `dnsLookup` is injectable (defaults to the real dns.promises.lookup)
 * purely so the DNS-rebinding layer is directly unit-testable without a
 * real network/DNS call, matching this repo's established injectable-
 * dependency convention (fetchImpl elsewhere in this phase). `timeoutMs`
 * is injectable for the same reason (testing a timeout at the real 3s
 * bound would make the suite slow) -- defaults to DNS_LOOKUP_TIMEOUT_MS.
 */
async function validateResearchUrl(rawUrl, { dnsLookup = dns.lookup, timeoutMs = DNS_LOOKUP_TIMEOUT_MS } = {}) {
  let url;
  try {
    url = new URL(String(rawUrl || ''));
  } catch {
    return { ok: false, reason: REASONS.INVALID_URL };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: REASONS.UNSUPPORTED_PROTOCOL };
  }
  if (url.username || url.password) {
    return { ok: false, reason: REASONS.CREDENTIALS_IN_URL };
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname) return { ok: false, reason: REASONS.INVALID_URL };
  if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false, reason: REASONS.PRIVATE_TARGET };
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { ok: false, reason: REASONS.PRIVATE_TARGET };
  }

  // Layer 1: the hostname is itself a literal IP.
  if (isPrivateOrReservedAddress(hostname)) {
    return { ok: false, reason: REASONS.PRIVATE_TARGET };
  }
  if (net.isIP(hostname)) {
    // A public literal IP is allowed through to layer 2's symmetry, but
    // there is nothing further to resolve -- it already passed.
    return { ok: true, url };
  }

  // Layer 2: DNS-rebinding defense -- resolve the hostname and reject if
  // ANY resolved address is private/reserved. A lookup failure fails
  // closed (rejected as unreachable), never treated as "safe, proceed."
  try {
    const records = await withTimeout(dnsLookup(hostname, { all: true, verbatim: true }), timeoutMs);
    if (!records.length) return { ok: false, reason: REASONS.DNS_FAILURE };
    if (records.some((r) => isPrivateOrReservedAddress(r.address))) {
      return { ok: false, reason: REASONS.PRIVATE_TARGET };
    }
  } catch {
    // Covers both a genuine DNS error AND our own timeout -- both fail
    // exactly the same way (closed, DNS_FAILURE), never proceeding on
    // an unresolved/unconfirmed hostname.
    return { ok: false, reason: REASONS.DNS_FAILURE };
  }

  return { ok: true, url };
}

module.exports = {
  REASONS,
  validateResearchUrl,
  // exported for direct unit testing only
  isPrivateOrReservedAddress,
};
