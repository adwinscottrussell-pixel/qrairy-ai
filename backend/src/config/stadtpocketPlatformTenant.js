// stadtpocketPlatformTenant.js — StadtPocket Canonical Customer Identity
// Foundation, Step 1.
//
// The existing Customer Foundation (Customer/CustomerIdentity,
// customerIdentityService.js) scopes every identity by `ownerUserId` --
// the authenticated QRAIVY business owner's Clerk User.id -- so the same
// person interacting with two independent business owners correctly
// resolves to two separate Customer rows (tenant isolation).
//
// StadtPocket needs the opposite guarantee for its OWN customers: one
// real person must resolve to the SAME canonical Customer.id across
// every StadtPocket business (Staib, Cafe Brettle, ...). Per the
// approved architecture decision packet ("Canonical Customer" — Option
// A, approved), this is achieved with ZERO schema change: every
// StadtPocket identity resolution passes this one constant value as
// `ownerUserId` instead of a real business owner's id. The existing
// @@unique([ownerUserId, type, value]) constraint then naturally makes
// StadtPocket one single, isolated tenant, completely partitioned from
// every real QRAIVY business owner's own rows -- existing QRAIVY
// behavior is untouched because it never uses this value.
//
// This is a Clerk-shaped string space, but this value is never a real
// Clerk User.id and must never be treated as one (no Clerk lookup, no
// auth check should ever be performed against it).
module.exports.STADTPOCKET_PLATFORM_TENANT_ID = 'stadtpocket_platform';
