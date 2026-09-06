// ============================================================
// managerInviteService.js — Phase 6D.1 StadtPocket Manager onboarding.
//
// Mirrors cityBusinessInviteService.js / businessClaimService.js's exact
// pattern (token generation/hashing, status lifecycle, atomic
// pending->accepted race guard, revert-on-downstream-failure) applied to
// a different target: a NetworkMember (manager) grant instead of a
// Business.
//
// This file NEVER creates a NetworkMember directly -- accepting an
// invite calls networkAdminService.assignManager(), the exact same
// function /admin/managers already uses for a manually-created manager
// assignment, so there is only ever one place in the codebase that
// writes NetworkMember. ManagerInvite is upstream of that authority,
// never a parallel/competing role source.
//
// Authentication vs. authorization boundary (see the Phase 6D.1 task's
// own architectural rule): createInvite() is only ever reachable via
// requireAdmin (checked by the route, not here); acceptInvite() only
// ever grants access if the AUTHENTICATED, CLERK-VERIFIED caller's
// real primary email (never a client-supplied string) matches the
// invite's email. Signing in alone never grants anything -- see
// acceptInvite()'s email-verification check below, identical in spirit
// to businessClaimService.claimInvite()'s.
// ============================================================

const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const { assignManager, AdminServiceError, MANAGER_ROLES } = require('./networkAdminService');

class ManagerInviteError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra) Object.assign(this, extra);
  }
}
const invalid = (msg) => new ManagerInviteError(400, msg);
const notFound = (msg) => new ManagerInviteError(404, msg);
const conflict = (msg, extra) => new ManagerInviteError(409, msg, extra);
const gone = (msg) => new ManagerInviteError(410, msg);
const forbidden = (msg) => new ManagerInviteError(403, msg);

const TOKEN_TTL_DAYS = 14;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same hash-at-rest/compare-at-lookup convention as
// cityBusinessInviteService.hashToken -- the raw token is returned to the
// caller in-process (for the email step) but only its hash is ever
// persisted.
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function generateToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return { rawToken, tokenHash: hashToken(rawToken) };
}

// ── Create (Global Admin only -- enforced by the route via requireAdmin,
// not here; this function trusts createdBy is already a real admin's
// Clerk userId) ──────────────────────────────────────────────
async function createInvite({ email, name, networkId, locationId, role, createdBy }) {
  if (!email || !EMAIL_RE.test(String(email).trim())) throw invalid('A valid manager email is required.');
  if (!networkId) throw invalid('networkId is required.');
  if (!MANAGER_ROLES.includes(role)) throw invalid(`Invalid role. Must be one of: ${MANAGER_ROLES.join(', ')}.`);
  if (!createdBy) throw invalid('createdBy is required.');

  // Same unambiguous-shape rule locationManagerAuth.js already enforces
  // when READING NetworkMember rows -- enforced here at CREATE time too,
  // so an invite can never be accepted into a membership shape that
  // requireManagerScope would silently exclude anyway (a
  // location_manager invite with no city, or a network_admin invite
  // pinned to one city, would otherwise create a NetworkMember row that
  // resolves to zero real access -- confusing, not dangerous, but never
  // the intent).
  if (role === 'location_manager' && !locationId) {
    throw invalid('locationId is required for a location_manager invite.');
  }
  if (role === 'network_admin' && locationId) {
    throw invalid('A network_admin invite must not specify a locationId (it is network-wide by definition).');
  }

  const network = await prisma.network.findUnique({ where: { id: networkId } });
  if (!network) throw notFound('Network');

  if (locationId) {
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw notFound('Location');
    if (location.networkId !== networkId) {
      throw invalid('This Location does not belong to the given Network.');
    }
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const trimmedName = name ? String(name).trim() : null;

  const existingPending = await prisma.managerInvite.findFirst({
    where: { email: normalizedEmail, networkId, locationId: locationId || null, status: 'pending' },
  });
  if (existingPending) {
    throw conflict('A pending invitation already exists for this email with this exact assignment.');
  }

  const { rawToken, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.managerInvite.create({
    data: {
      email: normalizedEmail,
      name: trimmedName,
      networkId,
      locationId: locationId || null,
      role,
      status: 'pending',
      tokenHash,
      createdBy,
      expiresAt,
    },
  });

  // rawToken is returned only in-process for the route's email step --
  // never stored, logged, or included in any JSON list/read response.
  return { invite, rawToken };
}

// ── List (Global Admin only, enforced by the route) — every invite,
// any status, most-recent first. Never returns tokenHash. ──────
async function listInvites() {
  const invites = await prisma.managerInvite.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      network: { select: { id: true, name: true, slug: true } },
      location: { select: { id: true, name: true, slug: true } },
    },
  });
  return invites.map((i) => ({
    id: i.id,
    email: i.email,
    name: i.name,
    role: i.role,
    status: i.status,
    network: i.network,
    location: i.location,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    acceptedByUserId: i.acceptedByUserId,
  }));
}

// ── Revoke (Global Admin only) — soft status transition, same
// convention as cityBusinessInviteService.cancelInvite. ────────
async function revokeInvite(inviteId) {
  const invite = await prisma.managerInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw notFound('Invitation not found.');
  if (invite.status !== 'pending') {
    throw invalid(`Only a pending invitation can be revoked (current status: ${invite.status}).`);
  }
  return prisma.managerInvite.update({ where: { id: inviteId }, data: { status: 'cancelled' } });
}

// ── Resend (Global Admin only, enforced by the route) ───────────
// Rotates ONLY the tokenHash on the same ManagerInvite row -- id, email,
// name, networkId, locationId, role, createdBy, and status are all
// preserved untouched. Never creates a second ManagerInvite, never
// touches NetworkMember (that only ever happens in acceptInvite(), via
// assignManager(), unchanged by this function).
//
// The raw token generated here is returned to the caller (the route's
// email step) only in-process -- same discipline as createInvite -- and
// is never itself persisted; only its hash replaces the stored
// tokenHash. The OLD raw token cannot be recovered (only its hash was
// ever stored, by design), so after a successful resend the old link is
// permanently dead -- "only the newest token is valid" is therefore not
// an extra check anywhere, it falls directly out of tokenHash being a
// single column that just got overwritten.
//
// Deliberately does NOT send the email itself -- email orchestration
// (building the URL, calling sendManagerInviteEmail, deciding what a
// failure means) lives in the route layer, exactly like
// createInvite's own caller in adminRoutes.js. What this function adds
// beyond a plain "generate + update" is returning previousTokenHash
// alongside the rotated invite, so the route can call
// restoreTokenHashAfterFailedResend() below if the email attempt fails
// -- the invitation is never left pointing at a token nobody received.
async function resendInvite(inviteId) {
  const invite = await prisma.managerInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw notFound('Invitation not found.');
  if (invite.status !== 'pending') {
    throw invalid(`Only a pending invitation can be resent (current status: ${invite.status}).`);
  }
  if (invite.expiresAt < new Date()) {
    // Lazily transition to 'expired' on first touch past expiry, same
    // convention as acceptInvite()'s own lazy-expiry handling.
    await prisma.managerInvite.update({ where: { id: invite.id }, data: { status: 'expired' } }).catch(() => {});
    throw gone('This invitation has expired.');
  }

  const previousTokenHash = invite.tokenHash;
  const { rawToken, tokenHash } = generateToken();

  const rotated = await prisma.managerInvite.update({
    where: { id: invite.id },
    data: { tokenHash },
  });

  return { invite: rotated, rawToken, previousTokenHash };
}

// Called ONLY by the route, ONLY when sendManagerInviteEmail failed
// immediately after resendInvite() rotated the token -- reverts
// tokenHash back to the value it had before this resend attempt, so a
// failed email never strands the invitation on a token nobody has.
// Conditional on tokenHash still being exactly the value THIS resend
// just wrote (updateMany, not update): if it has since changed again
// (e.g. a second resend, or a concurrent request already reverted it),
// this intentionally does nothing rather than clobber that newer,
// unrelated state -- the same "only revert what you know you broke"
// discipline as businessClaimService's revert-on-failure.
async function restoreTokenHashAfterFailedResend(inviteId, currentTokenHash, previousTokenHash) {
  await prisma.managerInvite.updateMany({
    where: { id: inviteId, tokenHash: currentTokenHash },
    data: { tokenHash: previousTokenHash },
  });
}

// ── Read-only preview by token (any authenticated user; the token itself
// is the only thing that authorizes seeing this much, matching
// businessClaimService.getInvitePreviewByToken's exact posture) ──
async function getInvitePreviewByToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') throw invalid('An invite token is required.');
  const tokenHash = hashToken(rawToken);
  const invite = await prisma.managerInvite.findUnique({
    where: { tokenHash },
    include: {
      network: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!invite) throw notFound('This invitation link is not valid.');
  if (invite.status === 'cancelled') throw gone('This invitation has been cancelled.');
  if (invite.status === 'accepted') throw conflict('This invitation has already been used.');
  if (invite.status === 'expired' || invite.expiresAt < new Date()) throw gone('This invitation has expired.');

  return {
    role: invite.role,
    network: invite.network,
    location: invite.location,
    expiresAt: invite.expiresAt,
  };
}

// ── Accept ────────────────────────────────────────────────────
// Identity comes ONLY from the caller-supplied claimantUserId/
// claimantEmail/claimantEmailVerified, which the route must derive
// exclusively from the verified Clerk session (requireAuth) plus a live
// Clerk lookup (clerkEmailSync.fetchPrimaryEmailVerified) -- never from
// anything in the request body. locationId/networkId/role are NEVER
// accepted from the caller here at all -- they come only from the
// ManagerInvite record itself, so a client can never change its own
// assigned city/scope during acceptance.
async function acceptInvite({ rawToken, claimantUserId, claimantEmail, claimantEmailVerified }) {
  if (!rawToken || typeof rawToken !== 'string') throw invalid('An invite token is required.');
  if (!claimantUserId) throw forbidden('Authentication is required to accept an invitation.');

  if (!claimantEmailVerified) {
    throw forbidden('Your account email must be verified before you can accept an invitation.');
  }

  const tokenHash = hashToken(rawToken);
  const rawInvite = await prisma.managerInvite.findUnique({ where: { tokenHash } });
  if (!rawInvite) throw notFound('This invitation link is not valid.');
  if (rawInvite.status === 'cancelled') throw gone('This invitation has been cancelled.');
  if (rawInvite.status === 'accepted') throw conflict('This invitation has already been used.');
  if (rawInvite.status === 'expired') throw gone('This invitation has expired.');
  if (rawInvite.expiresAt < new Date()) {
    await prisma.managerInvite.update({ where: { id: rawInvite.id }, data: { status: 'expired' } }).catch(() => {});
    throw gone('This invitation has expired.');
  }

  const normalizedInviteEmail = rawInvite.email.trim().toLowerCase();
  const normalizedClaimantEmail = String(claimantEmail || '').trim().toLowerCase();
  if (!normalizedClaimantEmail || normalizedClaimantEmail !== normalizedInviteEmail) {
    throw forbidden('This invitation was sent to a different email address. Sign in with the invited email to accept it.');
  }

  // Atomic race guard -- identical mechanism to businessClaimService's:
  // only one of N concurrent accept attempts for the same invite can
  // ever flip status pending -> accepted. Everything else (a second
  // submit, a genuine race) finds count === 0 and is rejected below
  // without ever reaching assignManager().
  const acceptLock = await prisma.managerInvite.updateMany({
    where: { id: rawInvite.id, status: 'pending' },
    data: { status: 'accepted', acceptedByUserId: claimantUserId },
  });
  if (acceptLock.count === 0) {
    const current = await prisma.managerInvite.findUnique({ where: { id: rawInvite.id } });
    if (current?.status === 'accepted') throw conflict('This invitation has already been used.');
    throw conflict('This invitation is no longer available to accept.');
  }

  try {
    // assignManager() is called completely unmodified -- the invite's OWN
    // networkId/locationId/role are the only inputs, never anything from
    // the caller. This is the exact same function /admin/managers already
    // uses for a manually-created manager, so there is only ever one
    // real path that writes NetworkMember.
    let networkMember;
    try {
      networkMember = await assignManager({
        userId: claimantUserId,
        networkId: rawInvite.networkId,
        locationId: rawInvite.locationId,
        role: rawInvite.role,
      });
    } catch (err) {
      // A duplicate exact assignment (e.g. two overlapping invites for
      // the same person/city, both accepted) is not a security problem
      // -- the resulting access is identical either way -- so this is
      // treated as an idempotent success, not a failure: reuse the
      // existing NetworkMember row instead of creating a second one.
      if (err instanceof AdminServiceError && err.code === 'DUPLICATE') {
        networkMember = await prisma.networkMember.findFirst({
          where: { userId: claimantUserId, networkId: rawInvite.networkId, locationId: rawInvite.locationId },
        });
        if (!networkMember) throw err; // shouldn't happen, but never mask a real failure
      } else {
        throw err;
      }
    }

    const accepted = await prisma.managerInvite.update({
      where: { id: rawInvite.id },
      data: { acceptedNetworkMemberId: networkMember.id },
    });

    return { networkMember, invite: accepted };
  } catch (err) {
    // The accept lock already flipped status to 'accepted' above. If
    // NetworkMember creation genuinely failed for a real reason, that
    // lock must not strand the invite in an unusable, un-retryable state
    // -- revert to 'pending' so the same invitee (or a re-sent invite)
    // can try again, then surface a real 500 rather than a misleading
    // success. Mirrors businessClaimService.claimInvite's identical
    // revert-on-failure discipline.
    await prisma.managerInvite.update({ where: { id: rawInvite.id }, data: { status: 'pending', acceptedByUserId: null } }).catch(() => {});
    if (err instanceof AdminServiceError) {
      const statusByCode = { NOT_FOUND: 404, INVALID: 400, DUPLICATE: 409 };
      throw new ManagerInviteError(statusByCode[err.code] || 500, err.message);
    }
    throw err;
  }
}

module.exports = {
  ManagerInviteError,
  hashToken,
  createInvite,
  listInvites,
  revokeInvite,
  resendInvite,
  restoreTokenHashAfterFailedResend,
  getInvitePreviewByToken,
  acceptInvite,
};
