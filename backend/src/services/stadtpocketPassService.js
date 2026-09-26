// stadtpocketPassService.js — StadtPocket Canonical Customer Identity +
// One In-App Pass Foundation, Step 1.
//
// Scope (per approved architecture decision packet): issue/resume a
// persistent, anonymous StadtPocket customer identity with no
// registration, and resolve exactly ONE Pass row per canonical
// Customer -- the Pass is an identity/entry mechanism only (slug: null,
// no business/loyalty state). No stamping, no rewards, no deal
// redemption, no Wallet integration here -- later steps.
//
// Reuses the existing Customer Foundation entirely unmodified:
//   - resolveOrCreateCustomerIdentity() resolves/creates the canonical
//     Customer, scoped under STADTPOCKET_PLATFORM_TENANT_ID (see
//     ../config/stadtpocketPlatformTenant.js) instead of a real
//     business owner's ownerUserId.
//   - attachDeterministicIdentity() links that Customer to its one Pass
//     row -- the exact same mechanism the OLD wallet-enrollment flow
//     (lpController.js) already uses to link a cid's Customer to a
//     wallet_serial. Here the "serial" is the StadtPocket Pass's own
//     serialNumber, and the link type is `stadtpocket_pass_serial`
//     rather than `wallet_serial`, so the two are never confused by a
//     future engineer querying CustomerIdentity by type.
//
// Deliberately NO schema/migration change: Pass has no customerId
// column. The Customer <-> Pass relationship lives entirely in
// CustomerIdentity (type: 'stadtpocket_pass_serial', value:
// Pass.serialNumber), scoped to the same platform tenant. This keeps
// Step 1 additive-code-only against a live production database -- see
// the schema-change discussion in this step's implementation report.
//
// "Exactly one Pass per customer" is enforced at the application layer,
// not by a DB unique constraint (there is none to lean on without a
// migration). resolveOrCreatePass() is written to converge safely if a
// race ever produces more than one link for the same customer: the
// EARLIEST-created link always wins and is returned, and the anomaly is
// logged (never silently ignored, never thrown as a user-facing error).
// This is an accepted, documented limitation for the working model, not
// an oversight -- see this step's report, "known limitation".

const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const { resolveOrCreateCustomerIdentity, attachDeterministicIdentity } = require('./customerIdentityService');
const { STADTPOCKET_PLATFORM_TENANT_ID } = require('../config/stadtpocketPlatformTenant');

// Distinct from the OLD product's Apple pass type (pass.com.qraivy.wallet,
// see src/config/constants.js) -- this Pass is not yet a real installable
// Apple/Google Wallet pass (that is explicitly deferred, per the approved
// decision packet's "Apple/Google Wallet" section), but the field is
// non-nullable on the Pass model, so it needs a value that will never be
// confused with a real registered Apple pass type identifier until one
// actually exists.
const STADTPOCKET_PASS_TYPE_ID = process.env.STADTPOCKET_PASS_TYPE_ID || 'pass.com.qraivy.stadtpocket';

const DEVICE_TOKEN_TYPE = 'stadtpocket_device';
const PASS_LINK_TYPE = 'stadtpocket_pass_serial';

const DEVICE_TOKEN_PATTERN = /^spd_[0-9a-f]{48}$/;
const PASS_SERIAL_PATTERN = /^sp_[0-9a-f]{48}$/;

function generateOpaqueToken(prefix) {
  // 24 random bytes (192 bits of entropy) -- high-entropy, non-sequential,
  // never derived from any internal id. The prefix is for human/log
  // readability only and contributes nothing to entropy or uniqueness.
  return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
}

function isValidDeviceToken(token) {
  return typeof token === 'string' && DEVICE_TOKEN_PATTERN.test(token);
}

async function findPassLinks(customerId) {
  const rows = await prisma.customerIdentity.findMany({
    where: { customerId, ownerUserId: STADTPOCKET_PLATFORM_TENANT_ID, type: PASS_LINK_TYPE },
    orderBy: { createdAt: 'asc' },
  });
  return rows || [];
}

async function createPassRow() {
  try {
    return await prisma.pass.create({
      data: { serialNumber: generateOpaqueToken('sp'), slug: null, passTypeId: STADTPOCKET_PASS_TYPE_ID },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      // Astronomically unlikely serialNumber collision -- regenerate once
      // rather than fail the whole request.
      return prisma.pass.create({
        data: { serialNumber: generateOpaqueToken('sp'), slug: null, passTypeId: STADTPOCKET_PASS_TYPE_ID },
      });
    }
    throw err;
  }
}

/**
 * Resolve (or create, on first visit) a StadtPocket customer's canonical
 * identity and their one Pass. Idempotent: calling this repeatedly with
 * the same deviceToken always returns the same Customer and the same
 * Pass.serialNumber.
 *
 * @param {Object} params
 * @param {string|null|undefined} params.deviceToken - the opaque token
 *   the client persisted from a previous call, if any. A missing or
 *   malformed value is treated as "no token" (a fresh one is minted) --
 *   never thrown as a validation error, since a first-ever visit
 *   legitimately has none yet.
 * @returns {Promise<{deviceToken: string, customerId: string, serialNumber: string, isNewCustomer: boolean, isNewPass: boolean}>}
 *   `customerId` is for internal/service use and tests only -- callers
 *   at the route layer must NEVER include it in an HTTP response (see
 *   architecture decision packet: raw Customer.id must never be
 *   exposed as the customer's public identity).
 */
async function resolveOrCreatePass({ deviceToken } = {}) {
  const effectiveToken = isValidDeviceToken(deviceToken) ? deviceToken : generateOpaqueToken('spd');

  const identity = await resolveOrCreateCustomerIdentity({
    ownerUserId: STADTPOCKET_PLATFORM_TENANT_ID,
    type: DEVICE_TOKEN_TYPE,
    value: effectiveToken,
    source: 'stadtpocket_pass_issuance',
  });
  if (!identity) {
    // resolveOrCreateCustomerIdentity is a safe no-op only when its
    // required inputs are missing -- effectiveToken is always a truthy
    // string here, so reaching this means an unexpected internal failure.
    throw new Error('StadtPocket: failed to resolve canonical customer identity.');
  }
  const { customerId } = identity;

  let links = await findPassLinks(customerId);
  let isNewPass = false;

  if (links.length === 0) {
    const pass = await createPassRow();
    await attachDeterministicIdentity({
      customerId,
      ownerUserId: STADTPOCKET_PLATFORM_TENANT_ID,
      type: PASS_LINK_TYPE,
      value: pass.serialNumber,
      source: 'stadtpocket_pass_issuance',
    });
    links = await findPassLinks(customerId);
    isNewPass = true;
  }

  if (links.length > 1) {
    console.error(
      '[StadtPocketPass] race detected: customer', customerId,
      'has', links.length, 'pass links -- converging on earliest, serial:', links[0].value
    );
  }

  const canonicalLink = links[0];
  let pass = await prisma.pass.findUnique({ where: { serialNumber: canonicalLink.value } });

  if (!pass) {
    // Dangling link -- the Pass row is gone (manual DB intervention only;
    // never happens through this service's own code paths). Mint a
    // replacement rather than return a broken reference.
    const replacement = await createPassRow();
    await attachDeterministicIdentity({
      customerId,
      ownerUserId: STADTPOCKET_PLATFORM_TENANT_ID,
      type: PASS_LINK_TYPE,
      value: replacement.serialNumber,
      source: 'stadtpocket_pass_recovery',
    });
    pass = replacement;
    isNewPass = true;
  }

  return {
    deviceToken: effectiveToken,
    customerId,
    serialNumber: pass.serialNumber,
    isNewCustomer: !!identity.created,
    isNewPass,
  };
}

module.exports = {
  resolveOrCreatePass,
  isValidDeviceToken,
  generateOpaqueToken,
  STADTPOCKET_PASS_TYPE_ID,
  DEVICE_TOKEN_TYPE,
  PASS_LINK_TYPE,
  DEVICE_TOKEN_PATTERN,
  PASS_SERIAL_PATTERN,
};
