// ============================================================
// businessClaimService.js — Stadt Pocket Phase 3B Step 3B.
//
// Converts a pending CityBusinessInvite into a real canonical Business,
// owned directly by the authenticated claimant -- never by the inviting
// City Manager, never by the platform owner. This is the ONLY place in
// the codebase that calls networkAdminService.createBusiness() for one of
// these invites, and only ever with the claimant's own real User.id.
//
// Ownership boundary: this file never writes Business.primaryOwnerUserId
// to anything other than the authenticated claimant's own id, never
// creates a BusinessMember row for anyone but the claimant, and never
// accepts a locationId from the caller -- the city always comes from the
// CityBusinessInvite record itself.
// ============================================================

const prisma = require('../utils/prismaClient');
const { hashToken, InviteError } = require('./cityBusinessInviteService');
const { createBusiness } = require('./networkAdminService');
const { upsertUser } = require('../controllers/qrController');

class ClaimError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra) Object.assign(this, extra);
  }
}

function invalid(msg) { return new ClaimError(400, msg); }
function notFound(msg) { return new ClaimError(404, msg); }
function conflict(msg, extra) { return new ClaimError(409, msg, extra); }
function gone(msg) { return new ClaimError(410, msg); }
function forbidden(msg) { return new ClaimError(403, msg); }

// Looks an invite up by its status/expiry WITHOUT claiming it -- used by
// the claim page's preview step (§B) so the visitor can see what they're
// accepting before authenticating/submitting. Returns only the minimal,
// safe fields the UI needs: never tokenHash, never internal ids beyond the
// city's own public id/name/slug, never the inviting manager's Clerk id,
// never billing data.
async function getInvitePreviewByToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') throw invalid('A claim token is required.');
  const tokenHash = hashToken(rawToken);
  const invite = await prisma.cityBusinessInvite.findUnique({
    where: { tokenHash },
    include: { location: { select: { id: true, name: true, slug: true } } },
  });
  if (!invite) throw notFound('This invitation link is not valid.');
  if (invite.status === 'cancelled') throw gone('This invitation has been cancelled.');
  if (invite.status === 'claimed') throw conflict('This invitation has already been claimed.', { claimedBusinessId: invite.claimedBusinessId });
  if (invite.status === 'expired' || invite.expiresAt < new Date()) throw gone('This invitation has expired.');
  if (invite.status !== 'pending') throw conflict('This invitation is no longer valid.');

  return {
    businessName: invite.businessName,
    city: { id: invite.location.id, name: invite.location.name, slug: invite.location.slug },
    expiresAt: invite.expiresAt,
  };
}

// The actual claim. Identity comes ONLY from the caller-supplied
// claimantUserId/claimantEmail/claimantEmailVerified, which the route must
// derive exclusively from the verified Clerk session (requireAuth) plus a
// live Clerk lookup -- never from anything in the request body.
async function claimInvite({ rawToken, claimantUserId, claimantEmail, claimantEmailVerified }) {
  if (!rawToken || typeof rawToken !== 'string') throw invalid('A claim token is required.');
  if (!claimantUserId) throw forbidden('Authentication is required to claim an invitation.');

  // Email-ownership check (§E) -- enforced before anything else touches the
  // invite. If Clerk cannot confirm the claimant's primary email is
  // verified, this is a hard stop, not a soft warning -- an unverified
  // email is not a reliable identity claim to match against.
  if (!claimantEmailVerified) {
    throw forbidden('Your QRAIVY account email must be verified before you can claim an invitation.');
  }

  const tokenHash = hashToken(rawToken);
  const invite = await prisma.cityBusinessInvite.findUnique({ where: { tokenHash } });
  if (!invite) throw notFound('This invitation link is not valid.');
  if (invite.status === 'cancelled') throw gone('This invitation has been cancelled.');
  if (invite.status === 'claimed') throw conflict('This invitation has already been claimed.', { claimedBusinessId: invite.claimedBusinessId });
  if (invite.status === 'expired') throw gone('This invitation has expired.');
  if (invite.status !== 'pending') throw conflict('This invitation is no longer valid.');
  if (invite.expiresAt < new Date()) {
    // Lazily transition to 'expired' on first touch past expiry -- best
    // effort, never blocks the 410 response below if it fails.
    await prisma.cityBusinessInvite.update({ where: { id: invite.id }, data: { status: 'expired' } }).catch(() => {});
    throw gone('This invitation has expired.');
  }

  const normalizedInviteEmail = invite.email.trim().toLowerCase();
  const normalizedClaimantEmail = String(claimantEmail || '').trim().toLowerCase();
  if (!normalizedClaimantEmail || normalizedClaimantEmail !== normalizedInviteEmail) {
    throw forbidden('This invitation was sent to a different email address. Sign in with the invited email to claim it.');
  }

  // Atomic race guard: this conditional update is the actual concurrency
  // control -- only one of N simultaneous claim attempts for the same
  // invite can ever flip status pending -> claimed. Every other concurrent
  // attempt (or a second submit from a refreshed/back-buttoned tab) finds
  // count === 0 here and is rejected below without ever reaching
  // createBusiness(), so a duplicate Business from a race is structurally
  // impossible, not just unlikely.
  const claimLock = await prisma.cityBusinessInvite.updateMany({
    where: { id: invite.id, status: 'pending' },
    data: { status: 'claimed' },
  });
  if (claimLock.count === 0) {
    const current = await prisma.cityBusinessInvite.findUnique({ where: { id: invite.id } });
    if (current?.status === 'claimed') {
      throw conflict('This invitation has already been claimed.', { claimedBusinessId: current.claimedBusinessId });
    }
    throw conflict('This invitation is no longer available to claim.');
  }

  try {
    // Ensures a canonical QRAIVY User row exists for the claimant, reusing
    // the existing, already-live upsert mechanism (qrController.js) rather
    // than duplicating it -- this is the same function every other
    // authenticated API call already relies on to create/refresh a User
    // row on first use.
    await upsertUser(claimantUserId);

    // createBusiness() is called completely unmodified -- this is the ONLY
    // place in this file that determines ownership, and it always resolves
    // to claimantUserId, never the inviting manager's id.
    const { business } = await createBusiness({ name: invite.businessName, primaryOwnerUserId: claimantUserId });

    // Membership starting status: "active", not "invited". Step 2's
    // "invited" status exists specifically to represent a City-Manager-only
    // action awaiting nothing further from the business side (see
    // managerRoutes.js's handleInviteBusiness comment). A claimed
    // CityBusinessInvite is the opposite case: the actual owner has just
    // authenticated and explicitly accepted -- there is nothing left
    // pending. "active" is the existing, pre-existing, smallest-consistent
    // status for a fully live StadtPocket membership; no new status value
    // is introduced.
    let membership;
    const existingMembership = await prisma.businessLocation.findUnique({
      where: { businessId_locationId: { businessId: business.id, locationId: invite.locationId } },
    });
    if (existingMembership) {
      // Defensive only -- e.g. this Business was already a member via a
      // separate Step 2 invite for the same city. Not an error case: the
      // claim still succeeds, the existing membership is simply reused
      // rather than duplicated (the @@unique([businessId, locationId])
      // constraint makes a second row impossible anyway).
      membership = existingMembership;
    } else {
      try {
        membership = await prisma.businessLocation.create({
          data: { businessId: business.id, locationId: invite.locationId, status: 'active' },
        });
      } catch (err) {
        if (err.code === 'P2002') {
          membership = await prisma.businessLocation.findUnique({
            where: { businessId_locationId: { businessId: business.id, locationId: invite.locationId } },
          });
        } else {
          throw err;
        }
      }
    }

    const claimed = await prisma.cityBusinessInvite.update({
      where: { id: invite.id },
      data: { claimedBusinessId: business.id },
    });

    return { business, membership, invite: claimed };
  } catch (err) {
    // The claim lock already flipped status to 'claimed' above. If Business
    // creation genuinely failed, that lock must not strand the invite in an
    // unusable, un-retryable state -- revert to 'pending' so the same
    // claimant (or a resent invite) can try again, then surface a real 500
    // rather than a misleading success.
    await prisma.cityBusinessInvite.update({ where: { id: invite.id }, data: { status: 'pending' } }).catch(() => {});
    if (err && err.code && err.message && err.constructor?.name === 'AdminServiceError') {
      const statusByCode = { NOT_FOUND: 404, INVALID: 400, DUPLICATE: 409 };
      throw new ClaimError(statusByCode[err.code] || 500, err.message);
    }
    throw err;
  }
}

module.exports = { ClaimError, getInvitePreviewByToken, claimInvite };
