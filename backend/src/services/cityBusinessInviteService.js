// ============================================================
// cityBusinessInviteService.js — Stadt Pocket Phase 3B Step 3A.
//
// City-Manager-initiated pending invitation for a merchant with no
// existing QRAIVY presence. This service NEVER creates a Business, a
// BusinessMember, or a BusinessLocation row -- it only manages
// CityBusinessInvite, the pending record upstream of all of those (see
// the schema comment on CityBusinessInvite for the full reasoning).
//
// The eventual claim step (not built in Step 3A) is the only place
// that will ever call networkAdminService.createBusiness() for one of
// these invites, and only with the real invited owner's own User.id --
// never the inviting manager's. Nothing here assigns ownership.
// ============================================================

const crypto = require('crypto');
const prisma = require('../utils/prismaClient');

class InviteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const invalid = (msg) => new InviteError(400, msg);
const conflict = (msg) => new InviteError(409, msg);

const INVITE_STATUSES = ['pending', 'cancelled', 'claimed', 'expired'];
const TOKEN_TTL_DAYS = 14;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeName(name) {
  return String(name).trim().replace(/\s+/g, ' ');
}

// Raw token is returned to the caller (Step 3B's email step will need
// it) but only its hash is ever persisted -- matches the
// hash-at-rest/compare-at-lookup convention already used for PIN/pass
// auth tokens elsewhere in this codebase (see loyaltyAdminController.js,
// passService.js).
function generateToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

// Conservative, exact-normalized-name match only -- deliberately NOT the
// fuzzy `contains` search handleSearchBusinesses uses for the manager's
// own lookup UI. A false-positive block here would stop a legitimate new
// business from ever being onboarded; a false negative just means the
// manager proceeds and createBusiness()'s own dedup guard (unchanged,
// untouched by this file) catches it for real at claim time anyway.
async function findLikelyExistingBusiness(businessName) {
  const normalized = normalizeName(businessName).toLowerCase();
  const candidates = await prisma.business.findMany({
    where: { status: { not: 'archived' } },
    select: { id: true, name: true, slug: true },
  });
  return candidates.find((b) => normalizeName(b.name).toLowerCase() === normalized) || null;
}

// Creates a pending CityBusinessInvite for an EXISTING manager's OWN
// city (locationId is caller-supplied here but the route layer is
// responsible for checking it against req.managerScope.locationIds
// before this function is ever called -- this function trusts its
// locationId argument, the route must not).
async function createInvite({ locationId, businessName, email, createdBy }) {
  if (!locationId) throw invalid('locationId is required.');
  if (!businessName || !normalizeName(businessName)) throw invalid('Business name is required.');
  if (!email || !EMAIL_RE.test(String(email).trim())) throw invalid('A valid owner email is required.');
  if (!createdBy) throw invalid('createdBy is required.');

  const trimmedName = normalizeName(businessName);
  const normalizedEmail = String(email).trim().toLowerCase();

  const existingBusiness = await findLikelyExistingBusiness(trimmedName);
  if (existingBusiness) {
    return {
      result: 'existing_business_found',
      business: { id: existingBusiness.id, name: existingBusiness.name, slug: existingBusiness.slug },
    };
  }

  const existingInvite = await prisma.cityBusinessInvite.findFirst({
    where: { locationId, email: normalizedEmail, status: 'pending' },
  });
  if (existingInvite) {
    throw conflict('A pending invitation already exists for this email in this city.');
  }

  const { rawToken, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.cityBusinessInvite.create({
    data: {
      locationId,
      businessName: trimmedName,
      email: normalizedEmail,
      status: 'pending',
      tokenHash,
      createdBy,
      expiresAt,
    },
  });

  // rawToken is returned only in-process for Step 3B's future email step
  // to consume -- it is never stored, logged, or included in any JSON
  // response in Step 3A (no email is sent yet).
  return { result: 'created', invite, rawToken };
}

async function listInvitesForLocations(locationIds) {
  if (!locationIds.length) return [];
  return prisma.cityBusinessInvite.findMany({
    where: { locationId: { in: locationIds }, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
}

// Manager-initiated cancel. Scope (does this invite belong to one of the
// manager's own locations) must already be checked by the route before
// calling this -- same division of responsibility as createInvite's
// locationId above.
async function cancelInvite(inviteId) {
  const invite = await prisma.cityBusinessInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new InviteError(404, 'Invitation not found.');
  if (invite.status !== 'pending') {
    throw invalid(`Only a pending invitation can be cancelled (current status: ${invite.status}).`);
  }
  // Soft status transition only -- matches the established convention
  // (Business.status, BusinessLocation.status) of never hard-deleting a
  // row to represent a lifecycle end-state. A cancelled invite's
  // tokenHash remains in the row but its status makes it permanently
  // unusable: the future claim-verification step must check
  // status === 'pending' before ever accepting a token, so a cancelled
  // token can never be looked up as valid again.
  return prisma.cityBusinessInvite.update({ where: { id: inviteId }, data: { status: 'cancelled' } });
}

module.exports = {
  InviteError,
  INVITE_STATUSES,
  createInvite,
  listInvitesForLocations,
  cancelInvite,
  findLikelyExistingBusiness,
};
