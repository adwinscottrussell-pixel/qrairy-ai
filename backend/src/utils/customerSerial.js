// ============================================================
// Customer-specific Pass identity (Phase 1B: backend identity enforcement)
// Single source of truth for validating a customer id ("cid") and building
// the canonical customer-specific Pass serialNumber. Used by every backend
// path that writes to or enrolls a customer-owned Pass — stamp/redeem
// confirmation, Apple wallet enrollment, Google wallet enrollment — so the
// "cid required, never fall back to the shared sqr-{slug} bucket" rule
// can't drift between call sites the way the client-side cid-append logic
// previously did.
//
// Deliberately has no dependency on Prisma or any controller/service, so
// every backend caller can require it without a circular-import risk.
//
// Does NOT replace or change the existing legacy "sqr-{slug}" (no cid)
// serial format used by already-issued shared passes — those keep working
// exactly as before wherever a caller already has and passes an explicit
// serialNumber (e.g. Apple's own refresh requests). This helper only
// governs where a NEW customer-specific serial gets constructed.
// ============================================================

// Mirrors the exact validation regex the client already applies to a
// freshly-generated or recovered cid (CUSTOMER_ID_HELPER_JS in
// lpController.js) — a valid cid is 8-64 chars of letters, digits, or
// hyphens. Kept in sync deliberately; if the client-side pattern ever
// changes, this must change with it.
const CID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function isValidCid(cid) {
  if (typeof cid !== 'string') return false;
  const trimmed = cid.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return false;
  return CID_PATTERN.test(trimmed);
}

function isValidSlug(slug) {
  return typeof slug === 'string' && slug.trim().length > 0;
}

// Returns the canonical customer-specific serialNumber ("sqr-{slug}-{cid}")
// or null if either input is missing/invalid. Never returns the shared,
// customer-less "sqr-{slug}" form — a null return means the caller must
// treat this as a hard failure (reject the request), not a signal to fall
// back to the shared serial.
function getCustomerSerialNumber(slug, cid) {
  if (!isValidSlug(slug)) return null;
  if (!isValidCid(cid)) return null;
  return `sqr-${slug.trim()}-${cid.trim()}`;
}

module.exports = { getCustomerSerialNumber, isValidCid };
